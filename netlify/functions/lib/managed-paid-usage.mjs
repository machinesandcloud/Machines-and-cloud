// Commercial capacity follows the existing delivery/call records. This module
// derives their identities; it neither dispatches providers nor owns a queue.
import { createHash } from 'node:crypto';
import { strictRead } from './accounts.mjs';
import { workspaceTenant } from './workspace-identity.mjs';
import { managedSMSSegments } from './managed-sms-budget.mjs';
import { settlePaidUsage } from './usage.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const paidUsageDigest = value => createHash('sha256').update(JSON.stringify(canonical(value === undefined ? null : value))).digest('hex');
const terminalSMS = status => ['delivered', 'failed', 'undelivered', 'canceled'].includes(status);

export function paidSMSExpected(job, binding = job) {
  return {
    service: 'sms', unit: 'smsSegments', operationId: 'sms:' + paidUsageDigest(job.id),
    payloadDigest: paidUsageDigest({ version: 1, id: job.id, tenant: job.tenant, purpose: job.purpose, to: job.to, body: job.body, from: binding.number || binding.from, serviceSid: binding.serviceSid }),
    quantity: managedSMSSegments(job.body).segments,
  };
}

export function paidAnswerExpected(inbound) {
  return {
    service: 'sms', unit: 'aiAnswers', operationId: 'answer:' + paidUsageDigest(inbound.id),
    payloadDigest: paidUsageDigest({ version: 1, id: inbound.id, tenant: inbound.tenant, messageSid: inbound.messageSid, from: inbound.from, body: inbound.body }),
    quantity: 1,
  };
}

// Initial Messaging Service responses may report zero before the carrier has
// assigned the final segmentation. Zero/malformed values never release a hold.
export function paidSMSReceiptSegments(value) {
  if (typeof value === 'string' && !/^[1-9]\d{0,3}$/.test(value)) return null;
  if (!['string', 'number'].includes(typeof value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 && count <= 1024 ? count : null;
}

export async function paidAnswerForDelivery(c, eventId, to, body) {
  if (!/^sms_reply:SM[a-f0-9]{32}$/i.test(eventId || '')) return {};
  const inboundId = `${c.slug}/${workspaceTenant(c)}/${eventId.slice('sms_reply:'.length)}`;
  const inbound = await strictRead('managed_sms_inbound', inboundId);
  if (!inbound?.paidAnswerGenerated || !inbound.paidAnswerCapacity) return {};
  if (inbound.id !== inboundId || inbound.tenant !== workspaceTenant(c) || inbound.slug !== c.slug || inbound.from !== to || inbound.reply !== body) throw new Error('Paid answer delivery changed');
  return { paidAnswerCapacity: inbound.paidAnswerCapacity, paidAnswerSource: inboundId };
}

export async function paidAnswerDeliveryExpected(c, job) {
  if (!job.paidAnswerCapacity) return null;
  const inbound = await strictRead('managed_sms_inbound', job.paidAnswerSource);
  const expectedId = inbound && `${c.slug}/${createHash('sha256').update(`${workspaceTenant(c)}:sms:sms_reply:${inbound.messageSid}`).digest('hex')}`;
  if (!inbound || inbound.id !== job.paidAnswerSource || inbound.slug !== c.slug || inbound.tenant !== workspaceTenant(c) || inbound.from !== job.to || inbound.reply !== job.body || !inbound.paidAnswerGenerated || expectedId !== job.id || paidUsageDigest(inbound.paidAnswerCapacity) !== paidUsageDigest(job.paidAnswerCapacity)) throw new Error('Paid answer source changed');
  return paidAnswerExpected(inbound);
}

export function paidDeliveryPending(job) {
  return !!(job?.paidSMSCapacity && !job.paidSMSSettled || job?.paidAnswerCapacity && !job.paidAnswerSettled);
}

// Facts are retained only after the existing provider adapter has verified the
// exact account, SID, sender, recipient and body. Replaying them after a lost
// local settlement ACK never sends another message or fetches another account.
export async function settlePaidDelivery(c, job) {
  const facts = job.paidReceiptFacts;
  if (!facts || facts.providerId !== job.providerId || !terminalSMS(facts.status)) return {};
  const settled = {};
  const segments = paidSMSReceiptSegments(facts.segments);
  if (job.paidSMSCapacity && !job.paidSMSSettled && segments !== null) {
    await settlePaidUsage(c, job.paidSMSCapacity, { outcome: 'confirmed', quantity: segments, proofId: paidUsageDigest({ kind: 'carrier_segments', job: job.id, ...facts, segments }), providerId: facts.providerId }, paidSMSExpected(job));
    settled.paidSMSSettled = true;
  }
  if (job.paidAnswerCapacity && !job.paidAnswerSettled) {
    const expected = await paidAnswerDeliveryExpected(c, job);
    await settlePaidUsage(c, job.paidAnswerCapacity, { outcome: 'confirmed', quantity: facts.status === 'delivered' ? 1 : 0, proofId: paidUsageDigest({ kind: 'written_answer', job: job.id, providerId: facts.providerId, status: facts.status }), providerId: facts.providerId }, expected);
    settled.paidAnswerSettled = true;
  }
  return settled;
}
