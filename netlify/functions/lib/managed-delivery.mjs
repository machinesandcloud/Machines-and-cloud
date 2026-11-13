// Durable local intent precedes every send. Accepted, delivered and uncertain are distinct.
import { createHash, randomBytes } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { belongsToWorkspace } from "./workspace-identity.mjs";
import { strictRead, normalizeAccountEmail } from "./accounts.mjs";
import { isSupportedSelfServiceClient } from "./setup.mjs";
import { deliveryTenant, mayDeliverManagedSMS } from "./managed-consent.mjs";
import { arrivalInstant } from "./service-time.mjs";
import { reserveManagedSMS, assertManagedSMSReservation, managedSMSBudgetPolicy, ManagedSMSBudgetError } from './managed-sms-budget.mjs';
import { reserveManagedEmail, assertManagedEmailReservation, assertManagedEmailDispatchPolicy, managedEmailBudgetPolicy, ManagedEmailBudgetError } from './managed-email-budget.mjs';
import { selfServiceAIProofPolicy } from './self-service-ai.mjs';
import { reservePaidUsage, assertPaidUsage, attemptPaidUsage, settlePaidUsage, PaidUsageError } from './usage.mjs';
import { paidUsageDigest, paidSMSExpected, paidSMSReceiptSegments, paidAnswerForDelivery, paidAnswerDeliveryExpected, paidDeliveryPending, settlePaidDelivery } from './managed-paid-usage.mjs';
const hash = s => createHash("sha256").update(s).digest("hex");
const stamp = () => new Date().toISOString();
const STORE = "managed_deliveries";
const INDEX = "managed_delivery_pending";
const messageId = (c,channel,eventId) => `${c.slug}/${hash(`${deliveryTenant(c)}:${channel}:${eventId}`)}`;
export const managedMessageId = messageId;
const canonical = value => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const undispatchedSMS = new WeakMap();
const paidDispatchIdentity = job => paidUsageDigest({ id: job.id, tenant: job.tenant, digest: job.digest, attemptStartedAt: job.attemptStartedAt, from: job.from, serviceSid: job.serviceSid });
export const managedDeliveryEnabled = () => process.env.SERVICE_DELIVERY_ENABLED === "true" && (process.env.SERVICE_WORKER_KEY || "").length>=32;
// A deployed internal AI proof also narrows this worker, before discovery or
// receipt recovery. Netlify freezes these settings per deployment; cleanup must
// deploy SERVICE_DELIVERY_ENABLED=false before removing the proof selectors.
// No permanent platform-wide latch is needed for an otherwise ordinary release.
const proofSelected = () => ['MC_SELF_SERVICE_AI_PROOF_SLUG','MC_SELF_SERVICE_AI_PROOF_APPROVED_VERSION','MC_SELF_SERVICE_AI_PROOF_POLICY_JSON'].some(key => !!process.env[key]);
export async function managedDeliveryProofScope() {
  if (!proofSelected()) return null;
  const closed = { selected:true, ready:false }, ai = selfServiceAIProofPolicy(), email = managedEmailBudgetPolicy();
  if (!ai || !email || email.mode !== 'cohort' || email.tenants.length !== 1 || email.accountLimit > 2 || email.tenantLimit > 2 || JSON.stringify(canonical(email.tenants[0])) !== JSON.stringify(canonical(ai.tenant))) return closed;
  const c = await strictRead('clients',ai.tenant.slug), owner = normalizeAccountEmail(c?.owner?.email), binding = await strictRead('self_service_ai_proofs',ai.tenant.slug);
  if (!isSupportedSelfServiceClient(c) || !['testing','live'].includes(c.status) || deliveryTenant(c) !== ai.tenant.identity || !owner || normalizeAccountEmail(c.onboarding.verifiedEmail) !== owner || hash(owner) !== ai.tenant.emailHash || (await strictRead('health','brake'))?.on === true || binding && (binding.version !== 1 || binding.phaseId !== ai.phaseId || JSON.stringify(canonical(binding.tenant)) !== JSON.stringify(canonical(ai.tenant)))) return closed;
  if (selfServiceAIProofPolicy()?.digest !== ai.digest || managedEmailBudgetPolicy()?.digest !== email.digest) return closed;
  return {selected:true,ready:true,slug:c.slug,tenant:ai.tenant.identity,email:owner,phaseId:ai.phaseId,aiDigest:ai.digest,emailDigest:email.digest};
}
const proofClientAllowed = (scope,c) => !scope || scope.ready && c?.slug === scope.slug && deliveryTenant(c) === scope.tenant;
const proofJobAllowed = (scope,job) => !scope || scope.ready && job?.slug === scope.slug && job.tenant === scope.tenant && job.channel === 'email' && ['owner_booking','owner_lead'].includes(job.purpose) && job.to === scope.email && new RegExp('^'+scope.slug+'/[a-f0-9]{64}$').test(job.id || '');
function assertProofPolicy(scope) {
  if (scope && (!scope.ready || !managedDeliveryEnabled() || selfServiceAIProofPolicy()?.digest !== scope.aiDigest || managedEmailBudgetPolicy()?.digest !== scope.emailDigest)) throw new Error('Internal delivery proof policy changed');
}
async function reserveProofReceiptRead(job) {
  const scope = await managedDeliveryProofScope(); if (!scope) return null;
  if (!proofJobAllowed(scope,job)) throw new Error('Internal delivery receipt is outside its approved scope');
  const c = await strictRead('clients',scope.slug); await assertManagedEmailReservation(c,job,job.emailBudget);
  const key = 'proof_receipt:'+hash(job.id), identity = hash(JSON.stringify(canonical({id:job.id,tenant:job.tenant,providerId:job.providerId,emailBudget:job.emailBudget.identity})));
  const result = await atomicUpdate('managed_delivery_waves',key,async row => {
    const current = await managedDeliveryProofScope();
    if (!current || current.aiDigest !== scope.aiDigest || current.emailDigest !== scope.emailDigest || !proofJobAllowed(current,job)) throw new Error('Internal receipt authority changed');
    await assertManagedEmailReservation(c,job,job.emailBudget);
    if (row && (row.version !== 1 || row.phaseId !== scope.phaseId || row.identity !== identity || !Number.isSafeInteger(row.used) || row.used < 1 || row.used > 4 || !Number.isFinite(Date.parse(row.lastReservedAt)))) throw new Error('Internal receipt allowance changed');
    // A wave makes several immediate recovery rounds. Wait for a later scheduled
    // pass instead of spending all four physical reads on one provider state.
    if (row && (row.used >= 4 || Date.now()-Date.parse(row.lastReservedAt) < 60000)) return {result:{reserved:false}};
    return {value:{version:1,phaseId:scope.phaseId,identity,used:(row?.used || 0)+1,lastReservedAt:stamp()},result:{reserved:true,scope}};
  });
  if (result.reserved) {
    const current = await managedDeliveryProofScope();
    if (!current || current.aiDigest !== scope.aiDigest || current.emailDigest !== scope.emailDigest || !proofJobAllowed(current,job)) throw new Error('Internal receipt authority changed');
    await assertManagedEmailReservation(c,job,job.emailBudget); assertProofPolicy(scope);
  }
  return result;
}
const revision = record => hash(JSON.stringify([record.status, record.customer_name, record.phone, record.address, record.issue, record.date, record.window, record.wanted, record.urgency]));
export const deliverySourceRevision = record => revision(record);
async function currentClient(c) {
  const current = await strictRead("clients", c.slug);
  if (!current || !isSupportedSelfServiceClient(current) || deliveryTenant(c) !== deliveryTenant(current)) throw new Error("Delivery workspace changed");
  return current;
}
export async function queueManagedMessage(c, { eventId, channel, purpose, to, body, source = null, dueAt = null, consentAsk = false, preserveSnapshot = false, probe = null, followup = null, subject = null, alert = null, postVisit = null }) {
  const scope = await managedDeliveryProofScope();
  if (!proofClientAllowed(scope,c) || scope && (channel !== 'email' || to !== scope.email)) return null;
  await currentClient(c);
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(eventId || "") || !["email", "sms"].includes(channel) || !["owner_booking", "owner_lead", "confirmation", "reminder_24h", "reminder_1h", "cancelled", "reply", "consent_ask", "activation_probe", "followup_consent_ask", "quote_followup", "request_followup", "review_request", "payment_reminder", "owner_visit_check"].includes(purpose) || typeof body !== "string" || !body.trim() || body.length > 8000 || (dueAt !== null && !Number.isFinite(Date.parse(dueAt)))) throw new Error("Invalid delivery intent");
  if (channel === "email" && !["owner_booking", "owner_lead", "owner_visit_check"].includes(purpose)) throw new Error("Unsupported email purpose");
  if (channel === "sms" && purpose === "owner_visit_check" || channel === "email" && ["review_request", "payment_reminder"].includes(purpose) || ["review_request", "payment_reminder", "owner_visit_check"].includes(purpose) !== !!postVisit) throw new Error("Invalid delivery intent");
  const id = messageId(c,channel,eventId);
  const answer = channel === 'sms' ? await paidAnswerForDelivery(c, eventId, to, body) : {};
  if (subject !== null && (channel !== "email" || typeof subject !== "string" || !subject.trim() || subject.length > 120)) throw new Error("Invalid delivery intent");
  if (alert !== null && (channel !== "email" || !/^[a-f0-9]{10,32}$/.test(alert?.id || "") || ![1, 2].includes(alert.step))) throw new Error("Invalid delivery intent");
  const payload = { tenant: deliveryTenant(c), channel, purpose, to, body, source, dueAt, consentAsk, probe, ...(followup?{followup}:{}), ...(postVisit?{postVisit}:{}), ...(subject?{subject}:{}), ...(alert?{alert:{id:alert.id,step:alert.step,...(alert.epoch?{epoch:alert.epoch}:{})}}:{}), ...answer }, digest = hash(JSON.stringify(canonical(payload)));
  // Like the body, the subject is display text: a re-queue of an existing snapshot keeps the
  // snapshot, and jobs written before subjects existed keep their original identity.
  const { subject: _subject, ...identityPayload } = payload;
  const identity = hash(JSON.stringify(canonical({ ...identityPayload, body: null })));
  const previous=await strictRead(STORE,id);
  if(previous && previous.digest!==digest && !(preserveSnapshot && previous.identity===identity))throw new Error("Delivery identity already used");
  const snapshot=previous || {...payload,dueAt:dueAt || stamp(),id,slug:c.slug,digest,identity,state:"queued",createdAt:stamp(),updatedAt:stamp(),attempts:0};
  // The index is also the durable creation intent. It retains the immutable snapshot until
  // completion, so a crash before the per-message projection is written cannot lose a reply.
  if(!terminal(snapshot.state))await indexPending(snapshot);
  const result = await atomicUpdate(STORE, id, row => {
    if (row) { if (row.digest !== digest && !(preserveSnapshot && row.identity === identity)) throw new Error("Delivery identity already used"); return { result: row.id }; }
    const job = snapshot;
    return { value: job, result: id };
  });
  await indexPending(await strictRead(STORE,id));
  return result;
}
async function indexPending(job) {
  if (!job) return;
  await atomicUpdate(INDEX,"active",value=>{
    const entries={...(value?.entries || {})},failures={...(value?.failures || {})};
    if (terminal(job.state) && !paidDeliveryPending(job)) delete entries[job.id];
    else { if (!entries[job.id] && Object.keys(entries).length>=500) throw new Error("Delivery queue is full"); entries[job.id]={dueAt:job.dueAt,createdAt:job.createdAt,snapshot:entries[job.id]?.snapshot || job}; }
    if(["failed","uncertain"].includes(job.state) || job.receiptCheckFailedAt && Date.now()-(Date.parse(job.lastCheckedAt || job.acceptedAt || job.attemptStartedAt || job.createdAt) || 0)>25*60000)failures[job.id]={state:job.receiptCheckFailedAt?"receipt_unavailable":job.state,at:job.receiptCheckFailedAt || job.updatedAt};
    else if(["delivered","superseded","expired"].includes(job.state) || job.state==="suppressed" && !job.attemptStartedAt || job.receiptVerifiedAt && Date.parse(job.receiptVerifiedAt)>=Date.parse(failures[job.id]?.at || ""))delete failures[job.id];
    return {value:{version:1,entries,failures,cursor:value?.cursor || ""}};
  });
}
// Owner email headline: urgency and reason first, from the customer's saved fields only. Never
// infers urgency. Short enough to scan as a phone notification. Owner-facing copy stays English.
// Control characters and bidi overrides/isolates (QA-URG note 1) become spaces, so a subject stays one
// readable line.
const oneLine = value => String(value || "").replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, " ").replace(/\s+/g, " ").trim();
function clip(value, limit) {
  const text = oneLine(value); if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 3), space = cut.lastIndexOf(" ");
  return (space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "") + "...";
}
export function ownerRequestHeadline(record, kind = "leads") {
  const issue = clip(record?.issue, 48), what = issue ? `: ${issue}` : "";
  if (kind === "bookings") {
    if (record.status === "cancelled") return `Visit cancelled${what}`;
    if (record.urgency === "emergency") return `EMERGENCY visit request${what}`;
    const when = clip([record.date, record.window].filter(Boolean).join(" "), 32);
    const requested = record.status === "booked" && ["web", "sms", "call", "voice"].includes(record.channel);
    return `${requested ? "Visit request" : "Visit"}${when ? ": " + when : what}`;
  }
  if (record.reason === "status_check") return `Status check${what}`;
  if (record.reason === "emergency" || record.urgency === "emergency") return `EMERGENCY${what}`;
  if (record.reason === "wants_call") { const wanted = clip(record.wanted, 40); return `Callback requested${wanted ? ": " + wanted : what}`; }
  if (record.reason === "handoff") return `Needs action${what}`;
  if (record.nobook_reason === "out_of_area") return `Outside service area${what}`;
  if (record.reason === "question") return `Question${record.nobook_reason === "wanted_price" ? " (price)" : ""}${what}`;
  return `New request${what}`;
}
export const ownerRequestSubject = (record, kind = "leads") => clip(ownerRequestHeadline(record, kind) + (record?.language === "es" ? " (Spanish)" : ""), 78);
const urgentLead = record => record.reason !== "status_check" && (record.reason === "emergency" || record.urgency === "emergency" || record.reason === "wants_call");
function ownerRecordBody(current, saved, kind, requestedVisit, changeLine = "") {
  const urgent = kind === "leads" && urgentLead(saved), mins = Number(current.rules?.ackMinutes) || 10;
  return [
    ownerRequestHeadline(saved, kind),
    ...(urgent ? [`Urgent: acknowledge it in your workspace. If it is still unacknowledged after ${mins} minutes, a reminder email follows.`] : []),
    `${current.business.name}: ${kind === "bookings" ? requestedVisit ? "Visit request" : "Visit" : "Customer request"} ${saved.id}`,
    ...(changeLine ? [changeLine.replace(/\n$/, "")] : []),
    `${saved.customer_name || "Customer"} ${saved.phone || ""}`,
    saved.issue || "",
    saved.address || "",
    `${saved.date || saved.wanted || ""} ${saved.window || ""}`,
    ...(saved.urgency && saved.urgency !== "emergency" ? [`Urgency: ${String(saved.urgency).replace(/_/g, " ")}`] : []),
    ...(saved.language === "es" ? ["Language: Spanish"] : []),
    "Open your workspace to review and respond.",
  ].join("\n");
}
// One reminder email per escalation step of a still-waiting managed alert. The alert reference is
// rechecked at send time, so acknowledging in the workspace stops a reminder that has not gone out.
export async function queueManagedAlertReminder(c, lead, alert, step, minutes) {
  const scope = await managedDeliveryProofScope(); if (!proofClientAllowed(scope,c)) return null;
  if (!isSupportedSelfServiceClient(c) || lead?.slug !== c.slug || alert?.leadId !== lead.id || alert.status !== "waiting" || lead.websiteSetupCheck || lead.simulation) return null;
  const current = await currentClient(c), saved = await strictRead("leads", `${c.slug}/${lead.id}`);
  if (!saved || saved.status !== "open" || saved.delivery?.tenantIdentity !== deliveryTenant(c) || !belongsToWorkspace(c, saved)) return null;
  const headline = ownerRequestHeadline(saved, "leads"), source = { kind: "leads", id: saved.id, revision: revision(saved) };
  const body = [`NOT ACKNOWLEDGED after ${minutes} minutes. ${headline}`, `${current.business.name}: Customer request ${saved.id}`, `${saved.customer_name || "Customer"} ${saved.phone || ""}`, saved.issue || "", saved.address || "", ...(saved.language === "es" ? ["Language: Spanish"] : []), "Open your workspace and acknowledge it."].join("\n");
  return queueManagedMessage(current, { eventId: `alert:${alert.id}:${Number(alert.epoch) ? `e${Number(alert.epoch)}:` : ""}step${step}`, channel: "email", purpose: "owner_lead", to: current.owner.email, body, subject: clip(`Reminder: ${headline}`, 78), source, alert: { id: alert.id, step, ...(Number(alert.epoch) ? { epoch: Number(alert.epoch) } : {}) }, preserveSnapshot: true });
}
export async function queueManagedRecord(c, record, kind = "bookings") {
  const scope = await managedDeliveryProofScope(); if (!proofClientAllowed(scope,c)) return;
  if (!isSupportedSelfServiceClient(c) || !["bookings", "leads"].includes(kind) || record?.slug !== c.slug || record.status === "spam" || record.ownerVisitCreationAborted === true || record.websiteSetupCheck || record.simulation) return;
  const current = await currentClient(c), saved = await strictRead(kind, `${c.slug}/${record.id}`);
  if (!saved || saved.delivery?.tenantIdentity !== deliveryTenant(c) || !belongsToWorkspace(c, saved) || saved.websiteSetupCheck || saved.simulation) return;
  const rev = revision(saved), source = { kind, id: saved.id, revision: rev }, eventId = `${kind}:${saved.id}:${rev}`;
  // The owner closed this visit in the workspace: no owner email echo and no visit texts.
  // Only the post-visit intents this exact visit state allows are (re)queued.
  if (kind === 'bookings' && ['done', 'no_show'].includes(saved.status)) { if (!scope) { const { queuePostVisit } = await import('./post-visit.mjs'); await queuePostVisit(current, saved); } return; }
  const requestedVisit = kind === 'bookings' && saved.status === 'booked' && ['web','sms','call','voice'].includes(saved.channel);
  // A change made by the customer on a verified channel says so, with the old and new time.
  const last = kind === 'bookings' && saved.ownerVisitMutation ? saved.ownerVisitHistory?.at(-1) : null, byCustomer = typeof last?.actor === 'string' && last.actor.startsWith('customer:') && last.at === saved.ownerVisitMutation.at;
  const changeLine = byCustomer ? `${last.action === 'cancel_visit' ? 'CANCELLED BY THE CUSTOMER' : 'MOVED BY THE CUSTOMER'} (${last.actor === 'customer:call' ? 'phone call' : 'text'})${last.previous ? `, was ${last.previous.date} ${last.previous.window}` : ''}${last.action === 'cancel_visit' ? '' : `, now ${last.next.date} ${last.next.window}`}.${last.customerReason ? ` Reason: ${String(last.customerReason).slice(0, 200)}` : ''}\n` : '';
  const body = ownerRecordBody(current, saved, kind, requestedVisit, changeLine);
  await queueManagedMessage(current, { eventId: `${eventId}:owner`, channel: "email", purpose: kind === "bookings" ? "owner_booking" : "owner_lead", to: current.owner.email, body, subject: ownerRequestSubject(saved, kind), source, preserveSnapshot: true });
  if (scope) return; // This internal phase proves owner email only, not customer SMS.
  if (kind === 'bookings') { const { ownerVisitCheckIntent } = await import('./post-visit.mjs'), check = ownerVisitCheckIntent(current, saved, rev); if (check) await queueManagedMessage(current, { eventId: check.eventId, channel: 'email', purpose: 'owner_visit_check', to: current.owner.email, body: check.body, dueAt: check.dueAt, postVisit: check.postVisit, preserveSnapshot: true }); }
  if (kind !== "bookings" || !saved.phone || !["booked", "confirmed", "on_the_way", "cancelled"].includes(saved.status)) return;
  const cancelled = saved.status === "cancelled";
  // Customer texts follow the booking's saved language (TEMPLATES_ES/STRINGS via str()).
  const { str } = await import("./desk.mjs");
  if (cancelled || !await confirmationAlreadySent(current, saved)) await queueManagedMessage(current, { eventId: `${eventId}:customer`, channel: "sms", purpose: cancelled ? "cancelled" : "confirmation", to: saved.phone,
    body: str(cancelled ? "managed_cancelled" : "managed_confirmation", saved)(current, saved), source, preserveSnapshot: true });
  if (!cancelled && saved.date && saved.window) {
    const start = arrivalInstant(saved.date, saved.window);
    for (const [purpose, due] of managedReminderSchedule(start)) {
      if (due > Date.now()) await queueManagedMessage(current, { eventId: `${eventId}:${purpose}`, channel: "sms", purpose, to: saved.phone, body: str("managed_reminder", saved)(current, saved, requestedVisit), source, dueAt: new Date(due).toISOString(), preserveSnapshot: true });
    }
  }
}
// A details-only owner edit (name, address, issue, or back to an earlier number) keeps the date,
// window and status, so the confirmation text would be identical. Skip it when an earlier revision
// in the same run of edits already sent (or is sending) a confirmation to this same number. A failed or
// never-started confirmation is superseded by the revision change, so a new one is queued.
async function confirmationAlreadySent(c, saved) {
  const history = Array.isArray(saved.ownerVisitHistory) ? saved.ownerVisitHistory : [];
  if (saved.ownerVisitMutation?.action !== "edit_visit") return false;
  let record = saved;
  for (let i = history.length - 1, steps = 0; i >= 0 && history[i]?.action === "edit_visit" && steps < 50; i--, steps++) {
    record = { ...record, ...(history[i].previous || {}) };
    const job = await strictRead(STORE, messageId(c, "sms", `bookings:${saved.id}:${revision(record)}:customer`));
    if (job && job.purpose === "confirmation" && job.to === saved.phone && (job.providerId && job.state !== "failed" || ["sending", "accepted", "delivered", "uncertain"].includes(job.state))) return true;
  }
  return false;
}
async function inspectSource(job, c) {
  if (job.alert) { const alert = await strictRead("alerts", `${c.slug}/${job.alert.id}`); if (!alert || alert.status !== "waiting" || (Number(alert.epoch) || 0) !== (Number(job.alert.epoch) || 0) || !belongsToWorkspace(c, alert)) return false; }
  if(job.followup){const {inspectRequestFollowup}=await import("./request-followup.mjs");if(!await inspectRequestFollowup(c,job))return false;}
  if(job.postVisit){const {inspectPostVisit}=await import("./post-visit.mjs");if(!await inspectPostVisit(c,job))return false;}
  if (!job.source) return true;
  const record = await strictRead(job.source.kind, `${c.slug}/${job.source.id}`);
  return !!record && !record.websiteSetupCheck && !record.simulation && record.delivery?.tenantIdentity === job.tenant && belongsToWorkspace(c, record) && revision(record) === job.source.revision;
}
const terminal = state => ["delivered", "failed", "superseded", "suppressed", "expired"].includes(state);
async function change(id, updater) {
  const result=await atomicUpdate(STORE, id, row => { const next = updater(row); if(!next)return {result:row}; const updated={...next,updatedAt:stamp()}; return {value:updated,result:updated}; });
  await indexPending(result); return result;
}
async function reconcilePaidDelivery(job, c = null) {
  if (!paidDeliveryPending(job)) return job;
  c ||= await strictRead('clients', job.slug);
  if (!c || deliveryTenant(c) !== job.tenant) return job;
  let flags;
  if (job.paidNotDispatched && !job.providerId) {
    flags = {};
    if (job.paidSMSCapacity && !job.paidSMSSettled) {
      const result = await releasePaidSend(c, job, job.reasonCode || 'authority_changed');
      if (result?.receiptState === 'released') flags.paidSMSSettled = true;
    }
    if (job.paidAnswerCapacity && !job.paidAnswerSettled && terminal(job.state)) {
      await settlePaidUsage(c, job.paidAnswerCapacity, { outcome: 'confirmed', quantity: 0, proofId: paidUsageDigest({ kind: 'answer_not_sent', id: job.id, generation: job.paidAnswerCapacity.generation }) }, await paidAnswerDeliveryExpected(c, job));
      flags.paidAnswerSettled = true;
    }
  } else flags = await settlePaidDelivery(c, job);
  if (!Object.keys(flags).length) return job;
  return change(job.id, row => {
    if (row.providerId !== job.providerId || paidUsageDigest(row.paidReceiptFacts) !== paidUsageDigest(job.paidReceiptFacts) || paidUsageDigest(row.paidSMSCapacity) !== paidUsageDigest(job.paidSMSCapacity) || paidUsageDigest(row.paidAnswerCapacity) !== paidUsageDigest(job.paidAnswerCapacity)) return null;
    if (row.paidNotDispatched && flags.paidSMSSettled && !terminal(row.state)) return { ...row, paidSMSCapacity: null, paidSMSSettled: false, paidSendAttemptId: null, paidNotDispatched: false, attemptStartedAt: null, claim: null, attempts: Math.max(0, row.attempts - (row.attemptStartedAt ? 1 : 0)), state: 'waiting_platform', paidAccountingReason: null };
    return { ...row, ...flags, paidAccountingReason: null };
  });
}
async function retainPaidReceipt(job, receipt, c) {
  if (!job.paidSMSCapacity && !job.paidAnswerCapacity) return job;
  const incomingSegments = paidSMSReceiptSegments(receipt.segments);
  const saved = await change(job.id, row => {
    if (row.providerId !== receipt.id) return null;
    const prior = row.paidReceiptFacts;
    const segments = Math.max(paidSMSReceiptSegments(prior?.segments) || 0, incomingSegments || 0) || null;
    const status = prior?.status === 'delivered' ? 'delivered' : receipt.status;
    const facts = { providerId: receipt.id, status, segments };
    return { ...row, paidReceiptFacts: facts,
      ...(segments !== null && segments > (paidSMSReceiptSegments(prior?.segments) || 0) ? { paidSMSSettled: false } : {}),
      ...(status === 'delivered' && prior?.status !== 'delivered' ? { paidAnswerSettled: false, state: 'delivered', deliveredAt: row.deliveredAt || stamp(), reasonCode: null } : {}),
      paidReceiptNextCheckAt: segments === null && ['delivered','failed','undelivered','canceled'].includes(status) ? new Date(Date.now() + 300000).toISOString() : null };
  });
  return reconcilePaidDelivery(saved, c);
}
async function releasePaidSend(c, job, reason) {
  if (!job.paidSMSCapacity) return;
  const expected = paidSMSExpected(job, job.paidSMSBinding || job), attemptId = paidUsageDigest({ kind: 'sms_send', id: job.id });
  const fact = { outcome: 'not_dispatched', quantity: 0, attemptId, proofId: paidUsageDigest({ kind: 'known_no_sms_dispatch', id: job.id, generation: job.paidSMSCapacity.generation, reason }) };
  try { return await settlePaidUsage(c, job.paidSMSCapacity, fact, expected); }
  catch (error) { if (!(error instanceof PaidUsageError) || error.code !== 'paid_capacity_proof_conflict') throw error; }
  await attemptPaidUsage(c, job.paidSMSCapacity, { attemptId }, expected);
  return settlePaidUsage(c, job.paidSMSCapacity, fact, expected);
}
async function stopPaidBeforeSend(job, c, reason, state = 'suppressed') {
  const stopped = await change(job.id, row => row.providerId ? null : { ...row, state, reasonCode: reason, ...(row.paidSMSCapacity || row.paidAnswerCapacity ? { paidNotDispatched: true } : {}) });
  return reconcilePaidDelivery(stopped, c);
}
function inQuietHours(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(at);
  const hour = Number(parts.find(x => x.type === "hour").value), sunday = parts.find(x => x.type === "weekday").value === "Sun";
  return hour < (sunday ? 12 : 9) || hour >= 21;
}
function nextSendingWindow(at = new Date()) {
  if(!inQuietHours(at))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'numeric',hourCycle:'h23'}).formatToParts(at).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  let day=`${parts.year}-${parts.month}-${parts.day}`;
  if(Number(parts.hour)>=21)day=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  const sunday=new Date(day+'T12:00:00Z').getUTCDay()===0;
  return new Date(arrivalInstant(day,sunday?'12 to 1':'9 to 10')).toISOString();
}
// PRA-HOMEOWNER-06 (rev 2, lead PO decision): reminders wait out quiet hours (before 9 am, before noon on Sunday,
// after 9 pm) and expire once the arrival window starts, so a 1-hour reminder due in quiet hours was never sent.
// Such a reminder is sent when the sending window opens on the visit day (9:00 am, noon on Sunday) if that is still
// at least 30 minutes before the window starts; otherwise at 8:30 pm the evening before (the same evening for a
// window starting after 10 pm). It is skipped when that time is less than 2 hours after it is queued, so a late
// booking does not get two texts minutes apart. A 1-hour reminder outside quiet hours and the 24-hour reminder keep
// their times.
export function managedReminderSchedule(start, now = Date.now()) {
  const minute = 60000, hour = 60 * minute, due24 = start - 24 * hour, due1 = start - hour;
  if (!inQuietHours(new Date(due1))) return [["reminder_24h", due24], ["reminder_1h", due1]];
  const local = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date(due1)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  const day = `${local.year}-${local.month}-${local.day}`, previous = new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  let moved;
  if (Number(local.hour) >= 21) moved = arrivalInstant(day, '8:30 pm to 9 pm');
  else {
    const morning = arrivalInstant(day, new Date(day + 'T12:00:00Z').getUTCDay() === 0 ? '12 pm to 1 pm' : '9 am to 10 am');
    moved = morning <= start - 30 * minute ? morning : arrivalInstant(previous, '8:30 pm to 9 pm');
  }
  return moved < start && moved - now >= 2 * hour ? [["reminder_24h", due24], ["reminder_1h", moved]] : [["reminder_24h", due24]];
}
async function senderFor(c) { const { messagingSender } = await import("./messaging-activation.mjs"); return messagingSender(c); }
async function probeFor(c, job) {
  if (job.purpose !== "activation_probe") return null;
  const { pendingMessagingProbe } = await import("./messaging-activation.mjs");
  const probe = await pendingMessagingProbe(c);
  return probe && probe.operationId === job.probe?.operationId && probe.nonce === job.probe.nonce && probe.to === job.to && probe.body === job.body ? probe : null;
}
async function assertPaidSMS(c,job) {
  // The existing, owner-approved fixed-recipient setup probe has its own
  // acquisition/registration and upper-bound allowance. A purpose string is
  // insufficient: recheck the current exact expiring intent at dispatch.
  if(job.purpose==='activation_probe') {
    if(!await probeFor(c,job))throw new ManagedSMSBudgetError('sms_probe_authority_changed','This setup check changed. Refresh texting setup before requesting another check.');
    return null;
  }
  return assertPaidUsage(c,job.paidSMSCapacity||null,paidSMSExpected(job));
}
async function jobSender(c, job) {
  if (job.purpose === "activation_probe") { const probe = await probeFor(c, job); return probe ? { number:probe.from,serviceSid:probe.serviceSid } : null; }
  return senderFor(c);
}
async function testingDeliveryAuthorized(c,job) {
  if(c.status!=="testing")return false;
  if(job.purpose==="activation_probe")return !!await probeFor(c,job);
  if(job.channel==="sms")return !!await senderFor(c);
  const {voiceActivationStatus}=await import("./voice-activation.mjs");
  return !!await senderFor(c) || (await voiceActivationStatus(c)).active;
}
function providerAdapter(deadlineAt=Date.now()+10000) {
  const request = async (url, options) => {
    if(Date.now()>=deadlineAt)throw new Error("Delivery request deadline reached");
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(Math.max(1,Math.min(5000,deadlineAt-Date.now()))), redirect: "error" });
    let data = {}; try { data = await response.json(); } catch { /* Keep uncertain on malformed provider receipts. */ }
    return { response, data };
  };
  return {
    async send(job, c) {
      if (job.channel === "email") {
        if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) throw new Error("Email not configured");
        const scope = await managedDeliveryProofScope();
        if (!proofJobAllowed(scope,job)) throw new ManagedEmailBudgetError('email_proof_closed');
        await assertManagedEmailReservation(c, job, job.emailBudget);
        assertManagedEmailDispatchPolicy(job.emailBudget);
        assertProofPolicy(scope);
        const { response, data } = await request("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `delivery/${hash(job.id)}` }, body: JSON.stringify({ from: process.env.FROM_EMAIL, to: [job.to], subject: job.subject || (job.purpose === "owner_booking" ? "Your front desk: visit update" : job.purpose === "owner_visit_check" ? "Your front desk: did this visit happen?" : "Your front desk: customer request"), text: job.body }) });
        if (!response.ok || typeof data.id !== "string") throw new Error("Email result unconfirmed");
        return { id: data.id, status: "accepted" };
      }
      let smsWireStarted = false;
      try {
      const sender = await jobSender(c,job);
      if (!sender) throw new Error("SMS sender not ready");
      if(sender.number!==job.from || sender.serviceSid!==job.serviceSid) throw new Error("SMS sender changed before dispatch");
      const sid = process.env.TWILIO_ACCOUNT_SID, secret = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !secret) throw new Error("SMS not configured");
      const url = new URL("/api/managed-sms/status", process.env.URL); url.searchParams.set("job", job.id);
      await assertManagedSMSReservation(c,job,job.smsBudget);
      if(job.purpose==='activation_probe'&&!await probeFor(c,job))throw new ManagedSMSBudgetError('sms_probe_authority_changed','This setup check changed. Refresh texting setup before requesting another check.');
      if(job.followup){
        const {reserveRequestFollowup}=await import('./request-followup.mjs');
        if(!await inspectSource(job,c)||!await mayDeliverManagedSMS(c,job.to,job.purpose,job)||!await reserveRequestFollowup(c,job)||!await inspectSource(job,c)||!await mayDeliverManagedSMS(c,job.to,job.purpose,job)||!managedDeliveryEnabled()||managedSMSBudgetPolicy()?.digest!==job.smsBudget?.policyDigest)throw new ManagedSMSBudgetError('followup_authority_changed','This follow-up changed before sending. Check its saved request.');
      }
      await assertPaidSMS(c,job);
      smsWireStarted = true;
      const { response, data } = await request(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: job.to, From: sender.number, MessagingServiceSid: sender.serviceSid, Body: job.body, StatusCallback: url.href }) });
      if (!response.ok || !/^SM[a-f0-9]{32}$/i.test(data.sid || "")) throw new Error("SMS result unconfirmed");
      return { id: data.sid, status: data.status, from: sender.number, serviceSid: sender.serviceSid,sentAt:data.date_created };
      } catch (error) {
        if (!smsWireStarted && error && typeof error === 'object') undispatchedSMS.set(error, paidDispatchIdentity(job));
        throw error;
      }
    },
    async status(job, proofReceipt = null) {
      if (!job.providerId) return null;
      assertProofPolicy(proofReceipt?.scope);
      const email = job.channel === "email", sid = process.env.TWILIO_ACCOUNT_SID, secret = process.env.TWILIO_AUTH_TOKEN;
      const { response, data } = await request(email ? `https://api.resend.com/emails/${encodeURIComponent(job.providerId)}` : `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${job.providerId}.json`, { headers: { Authorization: email ? `Bearer ${process.env.RESEND_API_KEY}` : "Basic " + Buffer.from(`${sid}:${secret}`).toString("base64") } });
      if (!response.ok) return null;
      if (email) {
        if(data.id!==job.providerId || !Array.isArray(data.to) || data.to.length!==1 || data.to[0]!==job.to) throw new Error("Email receipt mismatch");
        return { id: data.id, status: ({ delivered: "delivered", bounced: "failed", failed: "failed" })[data.last_event] || "accepted" };
      }
      const created=Date.parse(data.date_created), started=Date.parse(job.attemptStartedAt);
      if (data.sid!==job.providerId || data.account_sid!==sid || data.direction!=="outbound-api" || data.messaging_service_sid!==job.serviceSid || data.to !== job.to || !job.from || data.from !== job.from || data.body !== job.body || !Number.isFinite(created) || !Number.isFinite(started) || created<started-5000 || created>Date.now()+300000) throw new Error("SMS receipt mismatch");
      return { id: data.sid, status: data.status,sentAt:data.date_created, segments: paidSMSReceiptSegments(data.num_segments) };
    }
  };
}
function engine({ provider = null, gate = managedDeliveryEnabled, sender = senderFor, deadlineAt=Date.now()+10000 } = {}) {
  provider ||= providerAdapter(deadlineAt);
  async function run(id) {
    const scope = await managedDeliveryProofScope();
    if (scope && (!scope.ready || typeof id !== 'string' || !id.startsWith(scope.slug+'/'))) return null;
    let job = await strictRead(STORE, id);
    if (!proofJobAllowed(scope,job)) return job;
    if (!job) return job;
    if (paidDeliveryPending(job)) job = await reconcilePaidDelivery(job);
    if (terminal(job.state) && !paidDeliveryPending(job)) return job;
    if (!gate()) return job;
    const c = await strictRead("clients", job.slug);
    if (!c || !isSupportedSelfServiceClient(c) || deliveryTenant(c) !== job.tenant) return change(id, row => ({ ...row, state: row.attemptStartedAt?"uncertain":"suppressed", reasonCode: "workspace_changed" }));
    if (["cancelled", "archived"].includes(c.status) && !job.attemptStartedAt) return stopPaidBeforeSend(job,c,'workspace_closed');
    if (job.providerId) {
      if (terminal(job.state) && Date.parse(job.paidReceiptNextCheckAt || '') > Date.now()) return job;
      const proofReceipt = await reserveProofReceiptRead(job);
      if (proofReceipt && !proofReceipt.reserved) return job;
      assertProofPolicy(proofReceipt?.scope);
      const receipt = await provider.status(job,proofReceipt);
      if (!receipt || receipt.id !== job.providerId) return change(id,row=>terminal(row.state)?null:{...row,receiptCheckFailedAt:row.receiptCheckFailedAt || stamp(),reasonCode:"receipt_status_unavailable"});
      if(job.purpose==='followup_consent_ask'){const {saveRequestFollowupAsk}=await import('./request-followup.mjs');await saveRequestFollowupAsk(c,job,{...receipt,from:job.from,serviceSid:job.serviceSid});}
      // A crash can leave the provider receipt saved before the question's
      // consent-ledger projection. Rebuild it from this same verified receipt;
      // never send another question merely to repair that local projection.
      if (job.purpose === 'reply' && job.channel === 'sms' && !['failed','undelivered','canceled'].includes(receipt.status)) { const { saveManagedReviewAsk } = await import('./managed-consent.mjs'); await saveManagedReviewAsk(c, job.to, { wording: job.body, messageSid: receipt.id, sentAt: receipt.sentAt || job.acceptedAt }); }
      if (job.consentAsk && job.channel === 'sms' && !['failed','undelivered','canceled'].includes(receipt.status)) {
        const { saveManagedConsentAsk } = await import('./managed-consent.mjs');
        await saveManagedConsentAsk(c, job.to, { wording: job.body, messageSid: receipt.id, sentAt: receipt.sentAt, senderNumber: job.from, messagingServiceSid: job.serviceSid });
      }
      const saved = await change(id, row => terminal(row.state) || row.providerId !== receipt.id ? null : ({ ...row, state: receipt.status === "delivered" ? "delivered" : ["failed", "undelivered", "canceled"].includes(receipt.status) ? "failed" : "accepted", lastCheckedAt: stamp(),receiptCheckFailedAt:null,receiptVerifiedAt:stamp(),reasonCode:null, ...(receipt.status === "delivered" ? { deliveredAt: stamp() } : {}) }));
      return retainPaidReceipt(saved, receipt, c);
    }
    if (job.attemptStartedAt) {
      // The same SMS POST is never repeated after an unknown result. Email's real provider
      // idempotency lasts 24h; this implementation conservatively keeps unknown sends for review.
      if (job.state === "sending" && Date.parse(job.claim?.until) > Date.now()) return job;
      return change(id, row => ({ ...row, state: "uncertain", reasonCode: "provider_receipt_missing" }));
    }
    if (!gate() || (c.status !== "live" && !await testingDeliveryAuthorized(c,job))) return change(id, row => ({ ...row, state: "waiting_platform", reasonCode: c.status !== "live" ? "workspace_not_live" : "delivery_gate_closed" }));
    if (job.postVisit && !(Date.parse(job.postVisit.expiresAt) > Date.now())) return stopPaidBeforeSend(job,c,'post_visit_expired','expired');
    if (!await inspectSource(job, c)) return stopPaidBeforeSend(job,c,'record_changed','superseded');
    if(job.source && ["confirmation","reminder_24h","reminder_1h"].includes(job.purpose)) {
      const record=await strictRead(job.source.kind,`${c.slug}/${job.source.id}`);
      if(record?.date && record?.window && arrivalInstant(record.date,record.window)<=Date.now())return stopPaidBeforeSend(job,c,'arrival_window_started','expired');
    }
    if (Date.parse(job.dueAt) > Date.now()) return job;
    // A customer's open change request for this exact visit state holds its reminders until the owner acts.
    if (job.source?.kind === "bookings" && ["reminder_24h", "reminder_1h"].includes(job.purpose)) { const { customerChangeHold } = await import("./customer-visits.mjs"); if (await customerChangeHold(c, job)) return change(id, row => row.attemptStartedAt ? null : ({ ...row, state: "waiting_platform", reasonCode: "customer_change_requested", detail: "The customer asked to change this visit. Its reminder waits until you change the visit or complete the request." })); }
    if (job.channel === "email" && job.to !== c.owner.email) return change(id, row => ({ ...row, state: "superseded", reasonCode: "owner_changed" }));
    let smsBudget=null,emailBudget=null,paidSMSCapacity=null,smsBinding=null;
    if (job.channel === 'email') {
      try { emailBudget = await reserveManagedEmail(c, job); }
      catch(error) { return change(id,row=>row.attemptStartedAt?null:{...row,state:'waiting_platform',reasonCode:error instanceof ManagedEmailBudgetError?error.code:'email_budget_storage_unavailable',detail:error instanceof ManagedEmailBudgetError?error.message:'Your request is saved. Owner notifications are waiting for their approved sending allowance.'}); }
    }
    if (job.channel === "sms") {
      const binding=await (job.purpose === "activation_probe" ? jobSender(c,job) : sender(c)); smsBinding=binding;
      if(job.followup){const {requestFollowupBlocker}=await import('./request-followup.mjs'),block=await requestFollowupBlocker(c,job);if(block)return change(id,row=>({...row,state:'waiting_platform',reasonCode:block.code,detail:block.message}));}
      if(job.postVisit){const {postVisitBlocker}=await import('./post-visit.mjs'),block=await postVisitBlocker(c,job);if(block)return change(id,row=>({...row,state:'waiting_platform',reasonCode:block.code,detail:block.message}));}
      if (!binding) return change(id, row => ({ ...row, state: "waiting_platform", reasonCode: "sms_not_ready" }));
      if (job.purpose !== "activation_probe" && !await mayDeliverManagedSMS(c, job.to, job.purpose, job)) return change(id, row => ({ ...row, state: "waiting_consent", reasonCode: "consent_required" }));
      if (!["reply", "consent_ask", "followup_consent_ask"].includes(job.purpose) && inQuietHours()) return change(id, row => ({ ...row, state: "waiting_hours", reasonCode: "quiet_hours" }));
      if (job.source && !await inspectSource(job, c)) return job;
      try { smsBudget=await reserveManagedSMS(c,{...job,from:binding.number,serviceSid:binding.serviceSid}); }
      catch(error) { return change(id,row=>row.attemptStartedAt?null:{...row,state:"waiting_platform",reasonCode:error instanceof ManagedSMSBudgetError?error.code:"sms_budget_storage_unavailable",detail:error instanceof ManagedSMSBudgetError?error.message:"Texting is waiting for its platform sending allowance to be confirmed. Your message remains saved."}); }
      try { if(job.purpose==='activation_probe')await assertPaidSMS(c,job);else paidSMSCapacity=await reservePaidUsage(c,paidSMSExpected(job,binding)); }
      catch(error) { if (!(error instanceof PaidUsageError)) throw error; return change(id,row=>row.attemptStartedAt?null:{...row,state:'waiting_platform',reasonCode:error.code,detail:error.message}); }
    }
    const token = randomBytes(16).toString("hex");
    job = await change(id, row => row.attemptStartedAt ? null : ({ ...row, state: "sending", detail:null, ...(smsBudget?{smsBudget}:{}), ...(emailBudget?{emailBudget}:{}), ...(paidSMSCapacity?{paidSMSCapacity,paidSMSBinding:{number:smsBinding.number,serviceSid:smsBinding.serviceSid},from:smsBinding.number,serviceSid:smsBinding.serviceSid}:{}), attemptStartedAt: stamp(), attempts: row.attempts + 1, claim: { token, until: new Date(Date.now() + 60000).toISOString() } }));
    if (job.claim?.token !== token) return job;
    // Reread lifecycle, source and consent after acquiring the exclusive send claim.
    // QA-OPT F1: nothing has been sent yet. An unreadable store (client, consent, legacy opt-outs, platform
    // ledger) is "not now": release the claim as a resumable wait, never leave it to become "uncertain".
    const releaseUnsent = async reasonCode => {
      if (job.paidSMSCapacity) { const blocked = await change(id,row=>!row.providerId&&row.claim?.token===token?{...row,state:'waiting_platform',claim:null,paidNotDispatched:true,reasonCode}:null); return reconcilePaidDelivery(blocked,c); }
      return change(id,row=>!row.providerId&&row.claim?.token===token?{...row,state:'waiting_platform',claim:null,attemptStartedAt:null,attempts:Math.max(0,row.attempts-1),reasonCode}:null);
    };
    let latest, allowed;
    try {
      latest = await strictRead("clients", c.slug);
      allowed = !(!latest || (latest.status !== "live" && !await testingDeliveryAuthorized(latest,job)) || deliveryTenant(latest) !== job.tenant || !gate() || !await inspectSource(job, latest) || (job.channel === "sms" && !(job.purpose === "activation_probe" ? await probeFor(latest,job) : await mayDeliverManagedSMS(latest, job.to, job.purpose, job))));
    } catch { return releaseUnsent('authority_unreadable'); }
    if (!allowed) return stopPaidBeforeSend(job, c, 'authority_changed');
    if(job.channel==="sms") {
      const binding=await (job.purpose==="activation_probe"?jobSender(latest,job):sender(latest));
      if(!binding || job.paidSMSBinding && (binding.number !== job.paidSMSBinding.number || binding.serviceSid !== job.paidSMSBinding.serviceSid))return stopPaidBeforeSend(job, latest, 'sender_changed');
      job=await change(id,row=>row.claim?.token===token?{...row,from:binding.number,serviceSid:binding.serviceSid}:null);
      if(job.claim?.token!==token)return job;
    }
    let providerInvoked = false;
    try {
      if(job.channel==='sms')await assertManagedSMSReservation(latest,job,job.smsBudget);
      if(job.channel==='email')await assertManagedEmailReservation(latest,job,job.emailBudget);
      if(scope) {
        const currentScope=await managedDeliveryProofScope();
        if(!currentScope || currentScope.aiDigest!==scope.aiDigest || currentScope.emailDigest!==scope.emailDigest || !proofJobAllowed(currentScope,job))throw new ManagedEmailBudgetError('email_proof_closed');
        assertProofPolicy(currentScope);
      }
      if(job.purpose==='activation_probe'&&!await probeFor(latest,job))throw new ManagedSMSBudgetError('sms_probe_authority_changed','This setup check changed. Refresh texting setup before requesting another check.');
      if(job.followup){const {reserveRequestFollowup}=await import('./request-followup.mjs');if(!await inspectSource(job,latest)||!await mayDeliverManagedSMS(latest,job.to,job.purpose,job)||!await reserveRequestFollowup(latest,job))throw new ManagedSMSBudgetError('followup_authority_changed','This follow-up changed before sending. Check its saved request.');}
      if (job.channel === 'sms') {
        const expected = paidSMSExpected(job), attemptId = paidUsageDigest({ kind: 'sms_send', id: job.id });
        await assertPaidSMS(latest,job);
        if (job.paidSMSCapacity) {
          await attemptPaidUsage(latest, job.paidSMSCapacity, { attemptId }, expected);
          job = await change(id, row => row.claim?.token === token ? { ...row, paidSendAttemptId: attemptId, paidNotDispatched: false } : null);
          if (job.claim?.token !== token) return job;
        }
      }
      providerInvoked = true;
      const receipt = await provider.send(job, latest);
      if (!receipt?.id) throw new Error("Missing receipt");
      const saved = await change(id, row => row.providerId || terminal(row.state) || row.claim?.token !== token ? null : { ...row, state: "accepted", providerId: receipt.id, from: receipt.from || null, serviceSid: receipt.serviceSid || null, acceptedAt: stamp(), claim: null, reasonCode: null });
      if(job.purpose==='followup_consent_ask'){const {saveRequestFollowupAsk}=await import('./request-followup.mjs');await saveRequestFollowupAsk(latest,job,receipt);}
      if (job.purpose === 'reply' && job.channel === 'sms') { const { saveManagedReviewAsk } = await import('./managed-consent.mjs'); await saveManagedReviewAsk(latest, job.to, { wording: job.body, messageSid: receipt.id, sentAt: receipt.sentAt || stamp() }); }
      if (job.consentAsk && job.channel === "sms") { const { saveManagedConsentAsk } = await import("./managed-consent.mjs"); await saveManagedConsentAsk(latest, job.to, { wording: job.body, messageSid: receipt.id,sentAt:receipt.sentAt,senderNumber:saved.from,messagingServiceSid:saved.serviceSid }); }
      return saved;
    } catch(error) {
      if (error instanceof PaidUsageError) {
        const notSent = !providerInvoked || undispatchedSMS.get(error) === paidDispatchIdentity(job);
        if (!notSent) return change(id,row=>!row.providerId&&row.claim?.token===token?{...row,state:'uncertain',claim:null,reasonCode:'provider_result_unconfirmed'}:null);
        const blocked = await change(id,row=>!row.providerId&&row.claim?.token===token?{...row,state:'waiting_platform',claim:null,reasonCode:error.code,detail:error.message,...(row.paidSMSCapacity?{paidNotDispatched:true}:{attemptStartedAt:null,attempts:Math.max(0,row.attempts-1)})}:null);
        return reconcilePaidDelivery(blocked,latest);
      }
      // Budget assertions reject before transport. Keep their conservative
      // reservation, but allow a later approved policy to resume the saved job.
      if(error instanceof ManagedSMSBudgetError || error instanceof ManagedEmailBudgetError) {
        if (job.paidSMSCapacity) {
          if (providerInvoked && undispatchedSMS.get(error) !== paidDispatchIdentity(job)) return change(id,row=>!row.providerId&&row.claim?.token===token?{...row,state:'uncertain',claim:null,reasonCode:'provider_result_unconfirmed'}:null);
          const blocked = await change(id,row=>!row.providerId&&row.claim?.token===token?{...row,state:'waiting_platform',claim:null,paidNotDispatched:true,reasonCode:error.code,detail:error.message}:null);
          return reconcilePaidDelivery(blocked,latest);
        }
        return change(id,row=>!row.providerId&&row.claim?.token===token?{...row,state:'waiting_platform',claim:null,attemptStartedAt:null,attempts:Math.max(0,row.attempts-1),reasonCode:error.code,detail:error.message}:null);
      }
      if (job.paidSMSCapacity && (!providerInvoked || undispatchedSMS.get(error) === paidDispatchIdentity(job))) {
        const blocked = await change(id,row=>!row.providerId&&row.claim?.token===token?{...row,state:'waiting_platform',claim:null,paidNotDispatched:true,reasonCode:'sms_preflight_unavailable'}:null);
        return reconcilePaidDelivery(blocked,latest);
      }
      if (!providerInvoked) return releaseUnsent('authority_unreadable'); // QA-OPT F1: e.g. a follow-up re-check read failed before transport.
      return change(id, row => !row.providerId && !terminal(row.state) && row.claim?.token === token ? { ...row, state: "uncertain", claim: null, reasonCode: "provider_result_unconfirmed" } : null);
    }
  }
  return { run };
}
export function createManagedDeliveryEngine(options) {
  if (process.env.NODE_ENV !== "test" || process.env.MC_MEMORY_STORE !== "1" || process.env.MC_FAKE_MODEL !== "1") throw new Error("Fixture only");
  return engine(options);
}
export async function recordManagedSMSReceipt(id, fields) {
  if (!managedDeliveryEnabled()) return false;
  if (await managedDeliveryProofScope()) return false;
  const job = await strictRead(STORE, id);
  if (!job || job.channel !== "sms" || !job.attemptStartedAt || !job.from || !job.serviceSid || fields.AccountSid !== process.env.TWILIO_ACCOUNT_SID || !/^SM[a-f0-9]{32}$/i.test(fields.MessageSid || "") || fields.To !== job.to) return false;
  const c = await strictRead("clients", job.slug);
  if (!c || deliveryTenant(c) !== job.tenant) return false;
  const sender = {number:job.from,serviceSid:job.serviceSid};
  if (fields.From !== sender.number || (job.providerId && job.providerId !== fields.MessageSid)) return false;
  // Callback may rescue a lost POST receipt. Confirm exact SID/body with Twilio before binding it.
  if(sender.number!==job.from || sender.serviceSid!==job.serviceSid)return false;
  const receipt = await providerAdapter().status({ ...job, providerId: fields.MessageSid });
  if (!receipt || receipt.id !== fields.MessageSid) return false;
  const saved = await change(id, row => terminal(row.state) || (row.providerId && row.providerId !== receipt.id) ? null : ({ ...row, providerId: receipt.id, from: sender.number, state: receipt.status === "delivered" ? "delivered" : ["failed", "undelivered", "canceled"].includes(receipt.status) ? "failed" : "accepted", reasonCode: null, receiptCheckFailedAt:null,receiptVerifiedAt:stamp(),lastCheckedAt: stamp(), ...(receipt.status === "delivered" ? { deliveredAt: stamp() } : {}) }));
  await retainPaidReceipt(saved, receipt, c);
  if(job.purpose==='followup_consent_ask'){const {saveRequestFollowupAsk}=await import('./request-followup.mjs');await saveRequestFollowupAsk(c,job,{...receipt,from:job.from,serviceSid:job.serviceSid});}
  if(job.consentAsk && !["failed","undelivered","canceled"].includes(receipt.status)){const {saveManagedConsentAsk}=await import("./managed-consent.mjs");await saveManagedConsentAsk(c,job.to,{wording:job.body,messageSid:receipt.id,sentAt:receipt.sentAt,senderNumber:job.from,messagingServiceSid:job.serviceSid});}
  return true;
}
// Read the exact current probe intent, including when it is outside the recent
// jobs page. No nonce, message body, recipient or provider ID enters this DTO.
async function activationProbeView(c,expected) {
  if(!expected||expected.state!=='awaiting_test'||expected.customerAction!=='reply_to_setup_text')return null;
  const {pendingMessagingProbe}=await import('./messaging-activation.mjs'),probe=await pendingMessagingProbe(c);
  if(!probe||probe.operationId!==expected.id||probe.nonce!==expected.probe?.nonce||probe.to!==expected.probe?.to||probe.expiresAt!==expected.probe?.expiresAt)return null;
  const id=messageId(c,'sms',`probe:${hash(probe.operationId)}:${probe.nonce}`),row=await strictRead(STORE,id);
  const matches=row&&row.id===id&&row.slug===c.slug&&row.tenant===deliveryTenant(c)&&row.channel==='sms'&&row.purpose==='activation_probe'&&row.probe?.operationId===probe.operationId&&row.probe?.nonce===probe.nonce&&row.probe?.expiresAt===probe.expiresAt&&row.to===probe.to&&row.body===probe.body;
  const observed=at=>typeof at==='string'&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=Date.now();
  const acceptedAt=matches&&observed(row.acceptedAt)?row.acceptedAt:matches&&observed(row.receiptVerifiedAt)?row.receiptVerifiedAt:null;
  const outboundAccepted=!!(matches&&['accepted','delivered'].includes(row.state)&&/^SM[a-f0-9]{32}$/i.test(row.providerId||'')&&row.from===probe.from&&row.serviceSid===probe.serviceSid&&acceptedAt&&observed(row.attemptStartedAt)&&Date.parse(acceptedAt)>=Date.parse(row.attemptStartedAt));
  const current=await pendingMessagingProbe(c);
  if(!current||current.operationId!==probe.operationId||current.nonce!==probe.nonce||current.to!==probe.to||current.body!==probe.body||current.expiresAt!==probe.expiresAt)return null;
  return {operationId:probe.operationId,jobId:matches?id:null,state:matches?row.state:row?'unavailable':'pending_queue',reasonCode:matches?row.reasonCode||null:row?'setup_text_identity_mismatch':null,attempts:matches&&Number.isSafeInteger(row.attempts)?row.attempts:0,queuedAt:matches&&observed(row.createdAt)?row.createdAt:null,updatedAt:matches&&observed(row.updatedAt)?row.updatedAt:null,acceptedAt:outboundAccepted?acceptedAt:null,receiptVerifiedAt:matches&&observed(row.receiptVerifiedAt)?row.receiptVerifiedAt:null,deliveredAt:matches&&row.state==='delivered'&&observed(row.deliveredAt)?row.deliveredAt:null,outboundAccepted,nextDeliveryAt:!outboundAccepted&&(!row||matches&&row.state==='waiting_hours')?nextSendingWindow():null,timeZone:'America/Chicago'};
}
export async function managedDeliveryView(c,{activationProbe=null}={}) {
  await currentClient(c);
  const rows = (await Promise.all((await list(STORE, `${c.slug}/`)).map(key => strictRead(STORE, key)))).filter(row => row?.tenant === deliveryTenant(c));
  const counts = {}; for (const row of rows) counts[row.state] = (counts[row.state] || 0) + 1;
  return { enabled: managedDeliveryEnabled(), total: rows.length, counts, jobs: rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,30).map(row => ({ id: row.id, channel: row.channel, purpose: row.purpose, state: row.state, reasonCode: row.reasonCode || null, detail:row.detail || null, updatedAt: row.updatedAt, deliveredAt: row.deliveredAt || null })),...(activationProbe?{activationProbe:await activationProbeView(c,activationProbe)}:{}) };
}
async function fairPage(kind, cursorKey, limit, prefix = '') {
  const keys = await list(kind, prefix), cursor = await strictRead("managed_delivery_cursors", cursorKey);
  const after = keys.filter(key => key > (cursor?.key || "")), before = keys.filter(key => key <= (cursor?.key || "")), page = [...after,...before].slice(0,limit);
  if (page.length) await atomicUpdate("managed_delivery_cursors",cursorKey,()=>({value:{key:page.at(-1),at:stamp()}}));
  return page;
}
export async function runManagedDelivery({ limit = 3, discoveryLimit = 15, budgetMs = 12000 } = {}) {
  const deadline = Date.now() + Math.min(15000, Math.max(1000,budgetMs)), errors = [];
  const scope = await managedDeliveryProofScope();
  if (scope && !scope.ready) return {ok:false,processed:0,inspected:0,partialRepair:false,pending:0,openFailures:0,errors:['delivery_proof_closed'],enabled:managedDeliveryEnabled()};
  const prefix = scope ? scope.slug+'/' : '', cursorKey = key => scope ? 'proof:'+scope.phaseId+':'+key : key;
  if (!scope && managedDeliveryEnabled()) for (const slug of await fairPage("clients","probes",Math.min(25,discoveryLimit))) {
    if (Date.now() >= deadline) break;
    try {
      const c=await strictRead("clients",slug); if (!c || !isSupportedSelfServiceClient(c)) continue;
      const {pendingMessagingProbe}=await import("./messaging-activation.mjs"), probe=await pendingMessagingProbe(c);
      if (probe) await queueManagedMessage(c,{eventId:`probe:${hash(probe.operationId)}:${probe.nonce}`,channel:"sms",purpose:"activation_probe",to:probe.to,body:probe.body,probe:{operationId:probe.operationId,nonce:probe.nonce,expiresAt:probe.expiresAt}});
    } catch { errors.push("probe_recovery_failed"); }
  }
  // Backfill from authoritative records also repairs a crash between record save and enqueue.
  for (const kind of ["bookings", "leads", "request_followthrough"]) for (const key of await fairPage(kind, cursorKey(`source_${kind}`), Math.min(50,discoveryLimit), prefix)) {
    if (Date.now() >= deadline) break;
    try { const record = await strictRead(kind,key), c = record && await strictRead("clients",record.slug); if (c && isSupportedSelfServiceClient(c)) {if(kind==='request_followthrough'){if(record.automaticFollowup){const {queueRequestAutomation}=await import('./request-followup.mjs');await queueRequestAutomation(c,record.requestId);}}else await queueManagedRecord(c,record,kind);} } catch { errors.push("source_recovery_failed"); }
  }
  let processed = 0;
  // Rebuild missing index entries after a crash between durable intent and queue projection.
  let partialRepair=false;
  for (const key of await fairPage(STORE,cursorKey("index_repair"),50,prefix)) {
    if(Date.now()>=deadline){partialRepair=true;break;}
    const row=await strictRead(STORE,key);
    if(proofJobAllowed(scope,row)) {
      try { await indexPending(paidDeliveryPending(row) ? await reconcilePaidDelivery(row) : row); }
      catch { errors.push('delivery_accounting_unavailable'); }
    }
  }
  const pending=await strictRead(INDEX,"active"), keys=Object.keys(pending?.entries || {}).filter(key=>!scope || key.startsWith(prefix) && proofJobAllowed(scope,pending.entries[key]?.snapshot)).sort();
  const dueKeys=keys.filter(key=>!Number.isFinite(Date.parse(pending.entries[key].dueAt)) || Date.parse(pending.entries[key].dueAt)<=Date.now());
  const pendingCursor = scope ? (await strictRead('managed_delivery_cursors',cursorKey('pending')))?.key || '' : pending?.cursor || '';
  const candidates=[...dueKeys.filter(key=>key>pendingCursor),...dueKeys.filter(key=>key<=pendingCursor)];
  let inspected=0, last=null;
  for (const key of candidates.slice(0,100)) {
    if (Date.now() >= deadline) break;
    if (processed>=Math.min(25,limit)) break;
    inspected++; last=key;
    try {
      let before=await strictRead(STORE,key);
      if(!before && pending.entries[key]?.snapshot && proofJobAllowed(scope,pending.entries[key].snapshot))before=await atomicUpdate(STORE,key,row=>row?{result:row}:{value:pending.entries[key].snapshot,result:pending.entries[key].snapshot});
      if(!proofJobAllowed(scope,before))continue;
      if (!before || terminal(before.state) && !paidDeliveryPending(before)) { if (before) await indexPending(before); continue; }
      if (!before.providerId && Date.parse(before.dueAt)>Date.now()) continue;
      const result = await engine({deadlineAt:deadline}).run(key);
      if (result?.attempts>before.attempts || result?.lastCheckedAt!==before.lastCheckedAt) processed++;
      if (result?.state === "uncertain") errors.push("delivery_needs_review");
    } catch { errors.push("delivery_unavailable"); }
  }
  if(last) { if(scope)await atomicUpdate('managed_delivery_cursors',cursorKey('pending'),()=>({value:{key:last,at:stamp()}}));else await atomicUpdate(INDEX,"active",value=>({value:{...value,cursor:last}})); }
  const index=await strictRead(INDEX,"active"),openFailures=Object.keys(index?.failures || {}).filter(key=>!scope || key.startsWith(prefix)).length;
  return { ok: errors.length === 0 && openFailures === 0 && !partialRepair, processed, inspected, partialRepair, pending:Object.keys(index?.entries || {}).filter(key=>!scope || key.startsWith(prefix)).length, openFailures, errors: [...new Set(errors)], enabled: managedDeliveryEnabled() };
}
export async function dispatchManagedDeliveryWave() {
  if (!managedDeliveryEnabled() || (process.env.SERVICE_WORKER_KEY || "").length<32) return {ok:true,dispatched:false};
  const site=new URL(process.env.URL); if(site.protocol!=="https:") throw new Error("Delivery origin unavailable");
  const response=await fetch(new URL("/api/managed-delivery-background",site),{method:"POST",headers:{"Content-Type":"application/json","x-service-worker-key":process.env.SERVICE_WORKER_KEY},body:"{}",signal:AbortSignal.timeout(3000),redirect:"error"});
  return {ok:response.ok,dispatched:response.ok};
}
export async function runManagedDeliveryWave({budgetMs=120000}={}) {
  if(!managedDeliveryEnabled()) return {ok:true,enabled:false,processed:0};
  const deadline=Date.now()+Math.min(120000,Math.max(1000,budgetMs)),token=randomBytes(16).toString("hex");
  const claimed=await atomicUpdate("managed_delivery_waves","active",row=>row&&Date.parse(row.until)>Date.now()?{result:false}:{value:{token,until:new Date(deadline+5000).toISOString()},result:true});
  if(!claimed)return {ok:true,skipped:"wave_running",processed:0};
  let processed=0,result={ok:true};
  try {
    for(let turn=0;turn<12 && Date.now()<deadline-1000;turn++) {
      result=await runManagedDelivery({limit:10,discoveryLimit:10,budgetMs:Math.min(12000,deadline-Date.now())}); processed+=result.processed;
      if(!result.enabled)break;
    }
    await atomicUpdate("health","managedDelivery:lastRun",()=>({value:{...result,processed,at:stamp()}}));
    return {...result,processed};
  } finally { await atomicUpdate("managed_delivery_waves","active",row=>row?.token===token?{value:{...row,until:stamp(),completedAt:stamp()}}:{}); }
}
