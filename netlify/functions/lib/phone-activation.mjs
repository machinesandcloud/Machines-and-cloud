import { assertPaidServiceAuthority } from './paid-service-authority.mjs';
// First irreversible number step. The production gate is OFF by default.
// No HTTP caller chooses its adapter, execution policy, quote or fixture mode.
import { createHash, randomBytes } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { strictRead, normalizeAccountEmail } from "./accounts.mjs";
import { configurationRevision, isSupportedSelfServiceClient } from "./setup.mjs";
import { createTwilioNumberAdapter } from "./phone-twilio.mjs";
import { ManagedResourceAdmissionError, fenceManagedNumberCancellation } from './managed-resource-admission.mjs';

export class PhoneActivationError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const STORE = "phone_activation_intents", QUEUE = "phone_activation_queue", KEY = "active_v1";
const hash = value => createHash("sha256").update(value).digest("hex");
const iso = () => new Date().toISOString();
const tenant = c => hash(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)]));
const validSlug = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
const validId = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}\/[a-f0-9]{64}$/.test(value);
const sequence = row => row?.renewalSequence || 0;
const sameRequest = (row, expected) => !!row && row.tenantIdentity === expected.tenantIdentity && sequence(row) === sequence(expected) && row.inputRevision === expected.inputRevision && row.offerDigest === expected.offerDigest && row.correlationId === expected.correlationId;
// Only a worker-confirmed stop before the first purchase can be approved again.
// Missing purchase results, cancellations and retained resources use reconciliation.
export function canRenewUnpurchasedPhone(row) {
  return row?.version === 1 && row.state === 'superseded' && row.reasonCode === 'configuration_changed' && row.purchaseAttempts === 0 && row.reconciliationAttempts === 0 && row.cleanupAttempts === 0 &&
    !row.purchaseStartedAt && !row.resource && !row.cancelRequestedAt && !row.releasedAt && !row.releaseReceipt && !row.claim && !row.lookupClaim && !row.cleanupClaim && !row.cleanupStartedAt && !Object.keys(row.dependencies || {}).length && !row.conflictingResourceIds?.length;
}
export const phoneRenewalReference = row => ({ id: row.id, inputRevision: row.inputRevision, offerDigest: row.offerDigest, renewalSequence: sequence(row), updatedAt: row.updatedAt });
const renewalMatches = (row, reference) => canRenewUnpurchasedPhone(row) && JSON.stringify(phoneRenewalReference(row)) === JSON.stringify(reference);
async function parentAllows(row) {
  if (!row.serviceOnboarding) return true;
  const reference = row.serviceOnboarding;
  if (!validId(reference.id) || !reference.id.startsWith(row.slug + '/') || !Number.isSafeInteger(reference.generation) || reference.generation < 1 || reference.admissionSequence !== null && !Number.isSafeInteger(reference.admissionSequence)) return false;
  const [parent, queue] = await Promise.all([strictRead('service_onboarding_intents',reference.id),strictRead('service_onboarding_queue','active_v1')]);
  // Adding another channel preserves this generation's already accepted number.
  // A renewed business/number approval changes generation and cannot reuse it.
  const sequenceRetained = reference.admissionSequence === null ? parent?.version === 1 : reference.admissionSequence > 0 && Number.isSafeInteger(parent?.admissionSequence) && parent.admissionSequence >= reference.admissionSequence;
  return !!parent && sequenceRetained && parent.tenantIdentity === row.tenantIdentity && parent.generation === reference.generation && parent.inputRevision === row.inputRevision && parent.offer?.number?.digest === row.offerDigest && parent.authority?.actor?.email === row.authority.actor.email && parent.steps?.number?.startedAt && !parent.cancelRequestedAt && !queue?.intents?.[reference.id]?.cancelRequestedAt && parent.providerBinding?.accountSid === (process.env.TWILIO_ACCOUNT_SID || '');
}
// Additional coordinated-service authority, separate from number ownership.
// Standalone numbers have no coordinator; their normal lifecycle checks remain.
export async function phoneServiceOnboardingActive(c) {
  const row=await strictRead(STORE,`${c.slug}/${hash('first-phone-acquisition:'+tenant(c))}`);
  if(!row?.serviceOnboarding)return true;
  return row.tenantIdentity===tenant(c)&&await parentAllows(row);
}
export async function phoneServiceOnboardingCancellationRequested(c) {
  const row=await strictRead(STORE,`${c.slug}/${hash('first-phone-acquisition:'+tenant(c))}`),ref=row?.serviceOnboarding;
  if(!ref||!validId(ref.id)||row.tenantIdentity!==tenant(c))return false;
  const [parent,queue]=await Promise.all([strictRead('service_onboarding_intents',ref.id),strictRead('service_onboarding_queue','active_v1')]);
  return !!parent&&parent.tenantIdentity===row.tenantIdentity&&parent.generation===ref.generation&&!!(parent.cancelRequestedAt||queue?.intents?.[ref.id]?.cancelRequestedAt);
}
const terminal = state => ["number_acquired", "cancelled", "superseded", "needs_review"].includes(state);
const detail = state => ({
  queued: "Your number request is saved. Phone answering is not active.",
  waiting_platform: "Your request is saved while phone setup is unavailable. No purchase has been confirmed.",
  running: "Your number request is being processed. Phone answering is not active.",
  uncertain: "The result of the number request is being checked. Another number will not be purchased automatically.",
  number_acquired: "A number has been reserved. Phone answering still needs routing, forwarding and verified call handling.",
  cleanup_pending: "Cancellation is saved. The reserved number is awaiting confirmed release.",
  releasing: "The reserved number is being released. Its receipt is retained until release is confirmed.",
  cleanup_uncertain: "The number release result is being checked. Its resource receipt has been retained.",
  cancelled: "This number request is cancelled. Any recorded number release has been confirmed.",
  superseded: "Your setup changed before a number was purchased. Start a request for your current setup when available.",
  needs_review: "This request needs a platform review. Its recorded resource has been retained and phone answering is not active.",
})[state] || "Phone setup is not available yet.";
export function phoneActivationView(row) {
  return { id: row.id, state: row.state, active: false, label: "Phone setup", detail: row.state==='cancelled'&&row.cancellationProof?'Your number request was cancelled before a purchase was dispatched.':row.state==='waiting_platform'&&row.reasonCode?.startsWith('resource_')?row.resourceWaitDetail||detail(row.state):detail(row.state),
    createdAt: row.createdAt, updatedAt: row.updatedAt, nextCheckAt: row.nextCheckAt || null,
    cancellationRequested: !!row.cancelRequestedAt, number: row.resource?.number || null,
    resourceRecorded: !!row.resource?.id, releaseConfirmed: !!row.releasedAt, reasonCode: row.reasonCode || null };
}
export async function phoneActivationStatus(c) {
  if (!validSlug(c?.slug) || !isSupportedSelfServiceClient(c)) return { available: false, active: false, state: "unavailable", detail: "Phone setup is not available for this workspace.", offer: null, operation: null };
  const rows = await Promise.all((await list(STORE, c.slug + "/")).map(key => strictRead(STORE, key)));
  const latest = rows.filter(row => row?.tenantIdentity === tenant(c)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))[0];
  const policy = productionPolicy();
  const available=policy.enabled&&policy.offerCurrent;
  return { available, active: false, state: latest?.state || "unavailable", detail: latest ? phoneActivationView(latest).detail : "Phone setup is not available yet. No number will be purchased from signup or connection preferences.", offer: available ? { ...policy.offer, digest: offerDigest(policy.offer) } : null, operation: latest ? phoneActivationView(latest) : null };
}
// Server-only resource access. Never include this object in a browser response.
export async function getAcquiredPhoneResource(c) {
  if (!validSlug(c?.slug) || !isSupportedSelfServiceClient(c)) return null;
  const current = await strictRead("clients", c.slug);
  if (!current || tenant(current) !== tenant(c) || !["testing", "live"].includes(current.status)) return null;
  const id = `${c.slug}/${hash("first-phone-acquisition:" + tenant(c))}`;
  const row = await strictRead(STORE, id);
  if (!row || row.tenantIdentity !== tenant(c) || row.state !== "number_acquired" || row.cancelRequestedAt || row.releasedAt || !row.resource?.id) return null;
  return { intentId: row.id, id: row.resource.id, number: row.resource.number, correlationId: row.correlationId };
}
export async function getPhoneResourceLifecycle(c) {
  if (!validSlug(c?.slug) || !isSupportedSelfServiceClient(c)) return null;
  const id = `${c.slug}/${hash("first-phone-acquisition:" + tenant(c))}`;
  const row = await strictRead(STORE, id);
  if (!row || row.tenantIdentity !== tenant(c)) return null;
  return { intentId: id, state: row.state, cancelRequestedAt: row.cancelRequestedAt || null, releasedAt: row.releasedAt || null, resourceId: row.resource?.id || null, cancellationRequested: !!row.cancelRequestedAt, released: !!row.releasedAt,
    resource: row.resource ? { id: row.resource.id, number: row.resource.number } : null };
}
// Activation and release share this conditional document. A cancellation cannot release a
// number between a child service checking it and attaching a provider resource.
export async function claimPhoneResourceDependency(c, { kind, operationId }) {
  if (!["voice", "messaging"].includes(kind) || typeof operationId !== "string" || operationId.length > 200) throw new PhoneActivationError("invalid_dependency", "Invalid service request.");
  const resource = await getAcquiredPhoneResource(c);
  if (!resource) throw new PhoneActivationError("number_unavailable", "The business number is not available for activation.");
  return atomicUpdate(STORE, resource.intentId, row => {
    if (!row || row.tenantIdentity !== tenant(c) || row.state !== "number_acquired" || row.cancelRequestedAt || row.releasedAt || row.resource?.id !== resource.id) throw new PhoneActivationError("number_unavailable", "The business number changed before activation.");
    const previous = row.dependencies?.[kind];
    if (previous && previous.operationId !== operationId) throw new PhoneActivationError("service_conflict", "Another service request is attached to this number.");
    return { value: { ...row, dependencies: { ...row.dependencies, [kind]: previous || { operationId, claimedAt: iso() } }, updatedAt: iso() }, result: resource };
  });
}
export async function clearPhoneResourceDependency(c, { kind, operationId, cleanupConfirmed }) {
  if (cleanupConfirmed !== true || !["voice", "messaging"].includes(kind)) throw new PhoneActivationError("cleanup_unconfirmed", "Service cleanup must be confirmed before releasing its number.");
  const id = `${c.slug}/${hash("first-phone-acquisition:" + tenant(c))}`;
  return atomicUpdate(STORE, id, row => {
    if (!row || row.tenantIdentity !== tenant(c) || row.dependencies?.[kind]?.operationId !== operationId) return { result: false };
    const dependencies = { ...row.dependencies }; delete dependencies[kind];
    return { value: { ...row, dependencies, updatedAt: iso() }, result: true };
  });
}
// Cleanup authority is the retained owner cancellation, not a new acquisition
// policy. This only describes the exact already recorded, cancelled resource.
export async function cancelledPhoneMaintenanceContext(c, row, {allowReleased=false}={}) {
  const current = await strictRead('clients', c?.slug), account = process.env.TWILIO_ACCOUNT_SID || '';
  const stamp = (value, after) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) >= Date.parse(after) && Date.parse(value) <= Date.now();
  if (!current || !isSupportedSelfServiceClient(current) || tenant(current) !== tenant(c) || !row || row.version !== 1 || row.slug !== current.slug || row.tenantIdentity !== tenant(current) || row.id !== `${current.slug}/${hash('first-phone-acquisition:'+tenant(current))}` || row.correlationId !== hash('phone-acquire-v1:'+row.id+':'+row.tenantIdentity) || !Number.isSafeInteger(row.generation) || row.generation < 1 || !/^AC[a-f0-9]{32}$/i.test(account) || row.resourceAccountHash !== hash(account) || !/^PN[a-f0-9]{32}$/i.test(row.resource?.id || '') || !/^\+1\d{10}$/.test(row.resource?.number || '') || row.resource.correlationId !== row.correlationId || row.releasedAt&&!allowReleased || row.conflictingResourceIds?.length || row.offerDigest !== hash(JSON.stringify(row.offer)) || row.authority?.actor?.role !== 'owner' || normalizeAccountEmail(row.authority.actor.email) !== normalizeAccountEmail(current.owner?.email) || row.authority.costsAccepted !== true || row.authority.authorityAccepted !== true || !stamp(row.authority.acceptedAt, row.createdAt) || row.cancellationActor?.role !== 'owner' || normalizeAccountEmail(row.cancellationActor.email) !== normalizeAccountEmail(current.owner?.email) || !stamp(row.cancelRequestedAt, row.authority.acceptedAt) || (await strictRead('health','brake'))?.on === true) return null;
  try { validateOffer(row.offer, {allowExpired:true}); } catch { return null; }
  const ref = row.serviceOnboarding;
  if (!ref || !validId(ref.id) || !ref.id.startsWith(row.slug+'/')) return null;
  const [parent, queue] = await Promise.all([strictRead('service_onboarding_intents',ref.id), strictRead('service_onboarding_queue','active_v1')]);
  const entry=queue?.intents?.[ref.id], retained=ref.admissionSequence===null?parent?.version===1:Number.isSafeInteger(ref.admissionSequence)&&ref.admissionSequence>0&&parent?.admissionSequence>=ref.admissionSequence;
  if (!parent || !retained || parent.tenantIdentity !== row.tenantIdentity || parent.generation !== ref.generation || parent.inputRevision !== row.inputRevision || parent.offer?.number?.digest !== row.offerDigest || parent.authority?.actor?.role !== 'owner' || normalizeAccountEmail(parent.authority.actor.email) !== normalizeAccountEmail(current.owner?.email) || parent.providerBinding?.accountSid !== account || !parent.steps?.number?.startedAt || parent.cancellationActor?.role !== 'owner' || normalizeAccountEmail(parent.cancellationActor.email) !== normalizeAccountEmail(current.owner?.email) || !stamp(parent.cancelRequestedAt,parent.authority?.at||parent.createdAt) || entry && (entry.tenantIdentity !== parent.tenantIdentity || entry.admission?.generation !== parent.generation || entry.cancelRequestedAt !== parent.cancelRequestedAt)) return null;
  return {version:1,phoneIntentId:row.id,phoneGeneration:row.generation,phoneOfferDigest:row.offerDigest,phoneCancellationAt:row.cancelRequestedAt,tenantIdentity:row.tenantIdentity,providerAccountHash:row.resourceAccountHash,numberId:row.resource.id,number:row.resource.number,parentId:parent.id,parentGeneration:parent.generation,parentCancellationAt:parent.cancelRequestedAt};
}
export function voiceHasNumberUse(row) {
  return !!(row.importStartedAt || row.imported || row.importedRoute || row.routingStartedAt || row.routing || row.routingDetachedAt || (row.lateReceipts||[]).some(item=>item.importStartedAt||item.imported||item.importedRoute||item.routingStartedAt||item.routing||item.routingDetachedAt));
}
async function voiceCancellationContext(c, voice, {allowNumberUse=false,allowReleased=false,requireCredential=false}={}) {
  if(!voice || voice.version!==1 || voice.id!==`${c.slug}/${hash('managed-voice-v1:'+tenant(c))}` || voice.tenantIdentity!==tenant(c) || !Number.isSafeInteger(voice.generation) || voice.generation<1 || !allowNumberUse&&voiceHasNumberUse(voice) || typeof voice.cancelRequestedAt!=='string' || typeof voice.authority?.at!=='string' || !Number.isFinite(Date.parse(voice.authority.at)) || typeof voice.createdAt!=='string' || !Number.isFinite(Date.parse(voice.createdAt)) || Date.parse(voice.authority.at)<Date.parse(voice.createdAt) || voice.authority?.actor?.role!=='owner' || normalizeAccountEmail(voice.authority.actor.email)!==normalizeAccountEmail(c.owner?.email) || voice.cancellationActor?.role!=='owner' || normalizeAccountEmail(voice.cancellationActor.email)!==normalizeAccountEmail(c.owner?.email) || !Number.isFinite(Date.parse(voice.cancelRequestedAt)) || Date.parse(voice.cancelRequestedAt)<Date.parse(voice.authority.at) || Date.parse(voice.cancelRequestedAt)>Date.now() || voice.policyDigest!==hash(JSON.stringify(voice.policy)) || voice.authority.acceptedAuthority!==true || voice.authority.policyDigest!==voice.policyDigest || voice.authority.policyVersion!==voice.policy?.version) return null;
  const phone=await strictRead(STORE,voice.number?.intentId),context=await cancelledPhoneMaintenanceContext(c,phone,{allowReleased});
  if(!context || voice.number.id!==context.numberId || voice.number.number!==context.number || voice.number.correlationId!==phone.correlationId || voice.inputRevision!==phone.inputRevision || phone.dependencies?.voice?.operationId!==voice.id && !phone.numberUseFenceReleases?.[voice.id])return null;
  const parent=await strictRead('service_onboarding_intents',context.parentId);
  if(parent?.offer?.voice?.digest!==voice.policyDigest||parent.steps?.voice?.id!==voice.id||typeof parent.steps.voice.startedAt!=='string'||!Number.isFinite(Date.parse(parent.steps.voice.startedAt))||Date.parse(parent.steps.voice.startedAt)>Date.parse(voice.createdAt)||parent.authority?.actor?.email!==voice.authority.actor.email||requireCredential&&(!process.env.VAPI_API_KEY||parent.providerBinding?.vapiCredentialHash!==hash(process.env.VAPI_API_KEY)))return null;
  return {...context,voiceOperationId:voice.id,voiceGeneration:voice.generation,voicePolicyDigest:voice.policyDigest,voiceAuthorityDigest:hash(JSON.stringify(voice.authority)),voiceCancellationAt:voice.cancelRequestedAt};
}
export const voiceNumberCancellationContext=(c,voice)=>voiceCancellationContext(c,voice);
// Read-only retained lineage for reviewed rejected creates; no provider access.
export const voiceRejectedCreateCancellationContext=(c,voice)=>voiceCancellationContext(c,voice,{allowReleased:true});
export const voiceCleanupMaintenanceContext=(c,voice)=>voiceCancellationContext(c,voice,{allowNumberUse:true,allowReleased:true,requireCredential:true});
// A number-use fence is not an assistant absence/cleanup receipt. Verify it
// independently before clearing only this exact dependent service's PN claim.
export async function releaseFencedVoiceNumberDependency(c, operationId) {
  const voice=await strictRead('voice_activation_intents',operationId),context=await voiceNumberCancellationContext(c,voice),fence=voice?.numberUseFenced;
  if(!context || !fence || Object.entries(context).some(([key,value])=>fence[key]!==value) || !Number.isFinite(Date.parse(fence.at)) || Date.parse(fence.at)<Date.parse(context.voiceCancellationAt) || Date.parse(fence.at)>Date.now())return false;
  return atomicUpdate(STORE,context.phoneIntentId,async phone=>{
    if(phone?.dependencies?.voice?.operationId!==operationId)return {result:false};
    const latest=await strictRead('voice_activation_intents',operationId),current=await voiceNumberCancellationContext(c,latest);
    if(!current || JSON.stringify(current)!==JSON.stringify(context) || JSON.stringify(latest.numberUseFenced)!==JSON.stringify(fence) || phone.cancelRequestedAt!==context.phoneCancellationAt || phone.resource?.id!==context.numberId || phone.generation!==context.phoneGeneration)return {result:false};
    const dependencies={...phone.dependencies};delete dependencies.voice;
    return {value:{...phone,dependencies,numberUseFenceReleases:{...phone.numberUseFenceReleases,[operationId]:{...context,fenceAt:fence.at,releasedAt:iso()}},updatedAt:iso()},result:true};
  });
}
function localFixtureContext() {
  try { return process.env.NODE_ENV === "test" && process.env.MC_FAKE_MODEL === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.URL).hostname); } catch { return false; }
}
function offerDigest(offer) { return hash(JSON.stringify(offer)); }
function validateOffer(offer,{allowExpired=false}={}) {
  if (!offer || typeof offer.version !== "string" || !/^[a-z0-9_-]{1,80}$/.test(offer.version) || offer.currency !== "USD" || offer.scope !== "number_acquisition_only" || offer.country !== "US" || !/^[2-9]\d{2}$/.test(offer.areaCode || "") || !Number.isFinite(Date.parse(offer.expiresAt)) || !allowExpired&&Date.parse(offer.expiresAt) <= Date.now() || ![offer.oneTimeCents, offer.monthlyCents, offer.maxAcquisitionCents].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 100000) || typeof offer.authorityText !== "string" || offer.authorityText.length < 20 || offer.authorityText.length > 1000) throw new PhoneActivationError("invalid_offer", "A complete approved quote and authority statement are required.", 400);
  return structuredClone(offer);
}
function queueValue(value) {
  if (!value) return { version: 1, intents: {}, cursor: "" };
  if (value.version !== 1 || !value.intents || typeof value.intents !== "object" || Array.isArray(value.intents) || typeof value.cursor !== "string") throw new Error("Phone activation queue unavailable");
  if(Object.entries(value.intents).some(([id,row])=>!validId(id)||row?.id!==id||!validSlug(row.slug)||!/^[a-f0-9]{64}$/.test(row.tenantIdentity||'')||id!==row.slug+'/'+hash('first-phone-acquisition:'+row.tenantIdentity)||row.correlationId!==hash('phone-acquire-v1:'+id+':'+row.tenantIdentity)||!/^[a-f0-9]{32}$/.test(row.queueToken||'')))throw new Error('Phone activation queue identity unavailable');
  return value;
}
async function enqueue(row, cancellation) {
  const queueToken = randomBytes(16).toString("hex");
  return atomicUpdate(QUEUE, KEY, async value => {
    if (!cancellation && !await parentAllows(row)) throw new PhoneActivationError('setup_changed','The approved connection setup changed before the number request.');
    const queue = queueValue(value), previous = queue.intents[row.id];
    let acceptedCancellation=cancellation,acceptedToken=queueToken;
    if(cancellation) {
      const current=await strictRead(STORE,row.id),customer=await strictRead('clients',row.slug),email=normalizeAccountEmail(customer?.owner?.email);
      const valid=receipt=>receipt?.actor?.role==='owner'&&normalizeAccountEmail(receipt.actor.email)===email&&typeof receipt.at==='string'&&Number.isFinite(Date.parse(receipt.at))&&Date.parse(receipt.at)>=Date.parse(current?.authority?.acceptedAt)&&Date.parse(receipt.at)<=Date.now();
      if(!current||!sameRequest(current,row)||!customer||!isSupportedSelfServiceClient(customer)||tenant(customer)!==current.tenantIdentity||current.authority?.actor?.role!=='owner'||normalizeAccountEmail(current.authority.actor.email)!==email||!valid(cancellation)||previous&&(!sameRequest(previous,current)||previous.id!==current.id||previous.slug!==current.slug||previous.authority?.actor?.role!=='owner'||normalizeAccountEmail(previous.authority.actor.email)!==email||previous.authority.acceptedAt!==current.authority.acceptedAt||previous.cancellation&&(!valid(previous.cancellation)||!/^[a-f0-9]{32}$/.test(previous.queueToken||''))))throw new PhoneActivationError('cancellation_conflict','The saved cancellation authority changed. Its existing request is retained.');
      if(current.cancelRequestedAt) {
        acceptedCancellation={actor:current.cancellationActor,at:current.cancelRequestedAt};
        if(!valid(acceptedCancellation))throw new PhoneActivationError('cancellation_conflict','The original cancellation authority must be confirmed.');
        if(current.state==='cancelled')return {result:current};
      } else if(previous?.cancellation)acceptedCancellation=previous.cancellation;
      // The first cancellation changes the acquisition token so late acquisition
      // retirement cannot erase it. Its subsequent projections retain that token.
      if(previous?.cancellation)acceptedToken=previous.queueToken;
      if(previous?.cancellation&&JSON.stringify(previous.cancellation)===JSON.stringify(acceptedCancellation))return {result:previous};
    }
    if (previous && !cancellation && !row.renewalFrom) return { result: previous };
    if (row.renewalFrom && !cancellation) {
      if (previous && !previous.cancellation && sequence(previous) === sequence(row) && sameRequest(previous,row)) return { result: previous };
      if (previous?.cancellation || previous && sequence(previous) >= sequence(row) || !renewalMatches(await strictRead(STORE,row.id),row.renewalFrom)) throw new PhoneActivationError('intent_conflict', 'This number request changed while you reviewed it.');
      const current = await strictRead('clients',row.slug);
      if (!current || tenant(current) !== row.tenantIdentity || !['testing','live'].includes(current.status) || configurationRevision(current) !== row.inputRevision) throw new PhoneActivationError('configuration_changed', 'Review your current setup before changing phone service.');
    }
    if (!previous && Object.keys(queue.intents).length >= 1000) throw new PhoneActivationError("queue_full", "Phone setup is temporarily busy.", 503);
    const intent = { ...row, queueToken:acceptedToken, ...(cancellation ? { cancellation:acceptedCancellation } : {}) };
    return { value: { ...queue, intents: { ...queue.intents, [row.id]: intent } }, result: intent };
  });
}
async function ensure(intent) {
  return atomicUpdate(STORE, intent.id, async current => {
    if (current && current.tenantIdentity !== intent.tenantIdentity) throw new Error("Phone intent identity conflict");
    if (current) {
      if (sequence(intent) > sequence(current)) {
        if (sequence(intent) !== sequence(current) + 1 || !renewalMatches(current, intent.renewalFrom)) throw new PhoneActivationError('intent_conflict', 'This number request changed while you reviewed it.');
        if (!await parentAllows(intent)) throw new PhoneActivationError('setup_changed','The approved connection setup changed before the number request.');
        const row = { ...intent }; delete row.cancellation;
        return { value: row, result: row };
      }
      return { result: current };
    }
    if (!await parentAllows(intent)) throw new PhoneActivationError('setup_changed','The approved connection setup changed before the number request.');
    const row = { ...intent }; delete row.cancellation;
    return { value: row, result: row };
  });
}
async function remove(row) {
  await atomicUpdate(QUEUE, KEY, value => {
    const queue = queueValue(value), current = queue.intents[row.id];
    if (!current || current.queueToken !== row.queueToken) return {};
    const intents = { ...queue.intents }; delete intents[row.id]; return { value: { ...queue, intents } };
  });
}
async function change(id, update) {
  return atomicUpdate(STORE, id, async current => {
    if (!current) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
    if(current.state==='cancelled'&&current.cancellationProof?.reservationFence==='lifetime_ledger_cas')return {result:current};
    const next = await update(current); return next ? { value: { ...next, updatedAt: iso() }, result: { ...next, updatedAt: iso() } } : { result: current };
  });
}
async function authorizeCustomer(c, actor, revision) {
  if (!validSlug(c?.slug) || !isSupportedSelfServiceClient(c) || actor?.role !== "owner" || normalizeAccountEmail(actor?.email) !== normalizeAccountEmail(c.owner?.email)) throw new PhoneActivationError("forbidden", "The verified customer must authorize this request.", 403);
  const current = await strictRead("clients", c.slug);
  if (!current || !isSupportedSelfServiceClient(current) || tenant(current) !== tenant(c)) throw new PhoneActivationError("workspace_unavailable", "The workspace is no longer available.");
  if (revision !== configurationRevision(current)) throw new PhoneActivationError("configuration_changed", "Review your current setup before changing phone service.");
  return current;
}
async function applyCancellation(intent) {
  if (!intent.cancellation) return ensure(intent);
  const retained=await strictRead(STORE,intent.id);
  if(retained?.cancelRequestedAt&&retained.state==='cancelled')return retained;
  // Validate first-time queue authority as well as healing older same-owner
  // projections. The returned tuple is the atomic canonical cancellation.
  const accepted=await enqueue(retained,intent.cancellation);
  return change(intent.id, current => {
    if (current.cancelRequestedAt) return null;
    return { ...current, cancelRequestedAt: accepted.cancellation.at, cancellationActor: accepted.cancellation.actor,
      state: current.resource && !current.releasedAt ? "cleanup_pending" : current.purchaseStartedAt && !current.releasedAt ? "uncertain" : "cancelled", nextCheckAt: null };
  });
}
async function saveCancellation(c, id, { actor, expectedRevision } = {}) {
  const current = await authorizeCustomer(c, actor, expectedRevision);
  if (!validId(id) || !id.startsWith(current.slug + "/")) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
  const row = await strictRead(STORE, id); if (!row || row.tenantIdentity !== tenant(current)) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
  if(row.cancelRequestedAt&&row.state==='cancelled')return phoneActivationView(row);
  const cancellation = { actor: { role: "owner", email: normalizeAccountEmail(actor.email) }, at: iso() };
  const accepted=await enqueue(row,cancellation);return phoneActivationView(await applyCancellation(accepted));
}

export function createPhoneActivationEngine({ provider, offer: suppliedOffer, gate = false } = {}) {
  if (!localFixtureContext()) throw new PhoneActivationError("fixture_only", "Provider execution is unavailable outside isolated local tests.", 503);
  return phoneEngine({ provider, offer: suppliedOffer, gate });
}
function phoneEngine({ provider, offer: suppliedOffer, gate = false,allowExpiredOffer=false }) {
  if (!provider || !["acquire", "lookup", "release"].every(name => typeof provider[name] === "function")) throw new Error("The fixture requires explicit acquire, lookup and release adapters");
  const offer = validateOffer(suppliedOffer,{allowExpired:allowExpiredOffer}), digest = offerDigest(offer), enabled = () => typeof gate === "function" ? gate() === true : gate === true;
  const quote = () => ({ ...structuredClone(offer), digest, available: enabled()&&Date.parse(offer.expiresAt)>Date.now(), fixtureOnly: true });
  async function request(c, body = {}, options = {}) {
    const current = await authorizeCustomer(c, body.actor, body.expectedRevision);
    if (!enabled()||Date.parse(offer.expiresAt)<=Date.now()) throw new PhoneActivationError("phone_setup_unavailable", "Phone setup is not available yet. No number was purchased.");
    if (!["testing", "live"].includes(current.status)) throw new PhoneActivationError("workspace_inactive", "Phone setup requires an active workspace.");
    if (body.offerVersion !== offer.version || body.offerDigest !== digest || body.acceptedCosts !== true || body.authority !== true || typeof body.submissionId !== "string" || !/^[a-f0-9]{32,64}$/i.test(body.submissionId)) throw new PhoneActivationError("acceptance_required", "Review the quote and confirm your authority before continuing.", 400);
    // One first-acquisition intent per customer identity, independent of browser
    // retry keys. A new tab or a changed submission ID cannot buy a second number.
    const id = `${current.slug}/${hash("first-phone-acquisition:" + tenant(current))}`, prior = await strictRead(STORE, id);
    if (prior && !canRenewUnpurchasedPhone(prior)) { if (prior.tenantIdentity !== tenant(current) || prior.inputRevision !== body.expectedRevision || prior.offerDigest !== digest) throw new PhoneActivationError("intent_conflict", "This request was already used for another setup."); return phoneActivationView(prior); }
    if (prior && prior.tenantIdentity !== tenant(current)) throw new PhoneActivationError('intent_conflict', 'This number request belongs to another workspace.');
    if (prior?.serviceOnboarding && !body.serviceOnboarding) throw new PhoneActivationError('intent_conflict','Review your updated connections together before renewing this number request.');
    const row = { version: 1, id, slug: current.slug, tenantIdentity: tenant(current), inputRevision: body.expectedRevision,
      correlationId: hash("phone-acquire-v1:" + id + ":" + tenant(current)), state: "queued", createdAt: iso(), updatedAt: iso(),
      offer: structuredClone(offer), offerDigest: digest, authority: { actor: { role: "owner", email: normalizeAccountEmail(body.actor.email) }, acceptedAt: iso(), costsAccepted: true, authorityAccepted: true },
      generation: prior?.generation || 0, purchaseAttempts: 0, reconciliationAttempts: 0, cleanupAttempts: 0, reasonCode: null,
      ...(prior?.resourceAccountHash?{resourceAccountHash:prior.resourceAccountHash}:/^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||'')?{resourceAccountHash:hash(process.env.TWILIO_ACCOUNT_SID)}:{}),
      ...(body.serviceOnboarding ? { serviceOnboarding: structuredClone(body.serviceOnboarding) } : {}),
      ...(prior ? { renewalSequence: sequence(prior) + 1, renewalFrom: phoneRenewalReference(prior), history: [...(prior.history || []), { ...phoneRenewalReference(prior), acceptedAt: prior.authority.acceptedAt }].slice(-20) } : {}) };
    if(options.beforeAdmission)await options.beforeAdmission(current);
    const queued = await enqueue(row); return phoneActivationView(await ensure(queued));
  }
  async function recordResource(row, resource) {
    if (!resource || typeof resource.id !== "string" || !/^[a-zA-Z0-9_-]{2,100}$/.test(resource.id) || !/^\+1\d{10}$/.test(resource.number || "") || resource.correlationId !== row.correlationId) throw new Error("Provider resource receipt did not match its intent");
    return change(row.id, current => {
      if (!current.purchaseStartedAt) throw new Error("No durable acquisition intent");
      if (current.resource && current.resource.id !== resource.id) return { ...current, state: "needs_review", reasonCode: "resource_conflict", conflictingResourceIds: [...new Set([...(current.conflictingResourceIds || []), resource.id])].slice(0, 10) };
      if (current.resource?.id === resource.id) return null;
      const quoted = resource.quotedMonthlyCents ?? null;
      const priceValid = resource.currency === offer.currency && (quoted === null || (Number.isSafeInteger(quoted) && quoted >= 0 && quoted <= current.offer.maxAcquisitionCents && quoted <= current.offer.monthlyCents));
      const receipt = { id: resource.id, number: resource.number, correlationId: resource.correlationId, requestId: typeof resource.requestId === "string" ? resource.requestId.slice(0, 100) : null,
        quotedMonthlyCents: quoted, authorizedCostCapCents: current.offer.maxAcquisitionCents, priceEvidence: quoted === null ? "unconfirmed" : "account_pricing_quote", currency: resource.currency || null, recordedAt: iso() };
      return { ...current, resource: receipt, state: !priceValid ? "needs_review" : current.cancelRequestedAt ? "cleanup_pending" : "number_acquired", reasonCode: priceValid ? null : "cost_receipt_mismatch", nextCheckAt: null, claim: null };
    });
  }
  async function lookup(row) {
    const token = randomBytes(16).toString("hex");
    const claimed = await change(row.id, current => {
      if (current.lookupClaim && Date.parse(current.lookupClaim.until) > Date.now()) return null;
      return { ...current, lookupClaim: { token, until: new Date(Date.now() + 60000).toISOString() }, reconciliationAttempts: current.reconciliationAttempts + 1 };
    });
    if (claimed.lookupClaim?.token !== token) return claimed;
    try {
      const found = await provider.lookup({ intentId:row.id,correlationId: row.correlationId, resourceId: row.resource?.id || null, purchaseStartedAt:claimed.purchaseStartedAt,lookupToken:token });
      if (found?.status === "found") {
        if (["cleanup_uncertain", "releasing"].includes(claimed.state) && found.resource?.id === claimed.resource?.id) return change(row.id, current => current.lookupClaim?.token === token ? { ...current, state: "cleanup_pending", cleanupStartedAt: null, cleanupClaim: null, lookupClaim: null, nextCheckAt: null } : null);
        await recordResource(claimed, found.resource);
        // The lookup completed. Clear only this reader's token, so a subsequent
        // cancellation/release reconciliation need not wait for an old lease.
        return change(row.id, current => current.lookupClaim?.token === token ? { ...current, lookupClaim: null } : null);
      }
      if (["cleanup_uncertain", "releasing"].includes(claimed.state) && found?.status === "absent" && found.definitive === true && claimed.resource?.id) {
        return change(row.id, current => current.lookupClaim?.token === token ? { ...current, state: "cancelled", releasedAt: iso(), reasonCode: null, nextCheckAt: null, lookupClaim: null } : null);
      }
      if(found?.status==='not_dispatched'&&found.definitive===true) {
        const proof=found.proof;
        return change(row.id,async current=>{
          if(current.lookupClaim?.token!==token||Date.parse(current.lookupClaim.until)<=Date.now()||!sameRequest(current,claimed)||current.resource||current.claim||!!current.cancelRequestedAt!==(proof?.outcome==='cancel')||current.state!=='uncertain'||proof?.version!==1||proof.kind!=='mandatory_reservation_absent'||proof.operationId!==current.id||proof.correlationId!==current.correlationId||proof.tenantIdentity!==current.tenantIdentity||proof.providerAccountHash!==current.resourceAccountHash||proof.inputRevision!==current.inputRevision||proof.offerDigest!==current.offerDigest||proof.generation!==current.generation||proof.purchaseStartedAt!==current.purchaseStartedAt||proof.purchaseAttempts!==current.purchaseAttempts||!Number.isFinite(Date.parse(proof.confirmedAt))||Date.parse(proof.confirmedAt)>Date.now()||Date.parse(proof.confirmedAt)<Date.parse(current.purchaseStartedAt)+60000)return null;
          if(proof.outcome==='cancel') {
            if(proof.cancellationDigest!==hash(JSON.stringify({at:current.cancelRequestedAt,actor:current.cancellationActor})))return null;
            const fenced=await fenceManagedNumberCancellation({operationId:current.id,correlationId:current.correlationId,purchaseStartedAt:current.purchaseStartedAt,lookupToken:token},proof);
            if(!fenced)return {...current,reasonCode:'provider_result_unconfirmed',nextCheckAt:new Date(Date.now()+300000).toISOString(),lookupClaim:null};
            return {...current,state:'cancelled',reasonCode:'cancelled_before_dispatch',purchaseStartedAt:null,claim:null,lookupClaim:null,nextCheckAt:null,cancellationProof:fenced};
          }
          if(proof.outcome!=='retry')return null;
          if(proof.authorityDigest!==hash(JSON.stringify({authority:current.authority,serviceOnboarding:current.serviceOnboarding,renewalSequence:current.renewalSequence||0}))||proof.reservationId!==hash(JSON.stringify([current.id,'number']))||proof.providerAccountHash!==hash(process.env.TWILIO_ACCOUNT_SID||'')||!enabled()||Date.parse(offer.expiresAt)<=Date.now()||current.offerDigest!==digest||!await parentAllows(current))return null;
          const customer=await strictRead('clients',current.slug);
          if(!customer||!isSupportedSelfServiceClient(customer)||tenant(customer)!==current.tenantIdentity||!['testing','live'].includes(customer.status)||configurationRevision(customer)!==current.inputRevision||normalizeAccountEmail(customer.owner?.email)!==normalizeAccountEmail(current.authority?.actor?.email))return null;
          const retry=current.purchaseAttempts===1&&!current.preDispatchRecovery;
          return {...current,state:retry?'queued':'needs_review',reasonCode:retry?'pre_dispatch_recovered':'pre_dispatch_retry_exhausted',purchaseStartedAt:null,claim:null,lookupClaim:null,nextCheckAt:null,...(retry?{preDispatchRecovery:proof}:{preDispatchStop:proof})};
        });
      }
      // An absent acquisition lookup is never permission to purchase again.
      return change(row.id, current => current.lookupClaim?.token === token ? { ...current, state: current.resource ? "cleanup_uncertain" : "uncertain", reasonCode: "provider_result_unconfirmed", nextCheckAt: new Date(Date.now() + 300000).toISOString(), lookupClaim: null } : null);
    } catch {
      return change(row.id, current => current.lookupClaim?.token === token ? { ...current, reasonCode: "provider_lookup_unavailable", nextCheckAt: new Date(Date.now() + 300000).toISOString(), lookupClaim: null } : null);
    }
  }
  async function cleanup(row) {
    if (!row.resource || row.releasedAt) return row;
    if (["cleanup_uncertain", "releasing"].includes(row.state)) return lookup(row);
    const token = randomBytes(16).toString("hex");
    const claimed = await change(row.id, current => {
      if (current.cleanupStartedAt || current.state !== "cleanup_pending") return null;
      if (Object.keys(current.dependencies || {}).length) return { ...current, reasonCode: "service_cleanup_required" };
      return { ...current, state: "releasing", cleanupStartedAt: iso(), cleanupAttempts: current.cleanupAttempts + 1, cleanupClaim: token };
    });
    if (claimed.cleanupClaim !== token) return claimed;
    try {
      const released = await provider.release({ intentId:row.id,correlationId: row.correlationId, resourceId: row.resource.id, cleanupToken: token });
      if (released?.confirmed !== true || released.resourceId !== row.resource.id) throw new Error("Release not confirmed");
      return change(row.id, current => current.cleanupClaim === token ? { ...current, state: "cancelled", releasedAt: iso(), releaseReceipt: { resourceId: row.resource.id, confirmedAt: iso() }, reasonCode: null } : null);
    } catch { return change(row.id, current => current.cleanupClaim === token ? { ...current, state: "cleanup_uncertain", reasonCode: "release_result_unconfirmed", nextCheckAt: null } : null); }
  }
  async function run(id) {
    if (!validId(id)) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
    let row = await strictRead(STORE, id); if (!row) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
    if (row.nextCheckAt && Date.parse(row.nextCheckAt) > Date.now()) return phoneActivationView(row);
    const current = await strictRead("clients", row.slug);
    if (!current || !isSupportedSelfServiceClient(current) || tenant(current) !== row.tenantIdentity) return phoneActivationView(await change(id, old => sameRequest(old,row) ? ({ ...old, state: old.purchaseStartedAt ? "needs_review" : "cancelled", reasonCode: "workspace_unavailable" }) : null));
    if (row.cancelRequestedAt) {
      if(row.resource)return phoneActivationView(await cleanup(row));
      if(!row.purchaseStartedAt)return phoneActivationView(await change(id,old=>({...old,state:'cancelled'})));
      if(row.claim&&Date.parse(row.claim.until)>Date.now())return phoneActivationView(row);
      if(row.claim)row=await change(id,old=>sameRequest(old,row)&&old.purchaseStartedAt===row.purchaseStartedAt&&Date.parse(old.claim?.until)<=Date.now()?{...old,claim:null}:null);
      return phoneActivationView(await lookup(row));
    }
    if (terminal(row.state)) return phoneActivationView(row);
    if (row.purchaseStartedAt) {
      if (row.state === "running" && Date.parse(row.claim?.until) > Date.now()) return phoneActivationView(row);
      row = await change(id, old => ({ ...old, state: "uncertain", reasonCode: "acquisition_result_unconfirmed", claim: null }));
      return phoneActivationView(await lookup(row));
    }
    if (!await parentAllows(row)) return phoneActivationView(await change(id, old => sameRequest(old,row) ? { ...old, state: 'cancelled', reasonCode: 'parent_setup_changed' } : null));
    if (!["testing", "live"].includes(current.status) || configurationRevision(current) !== row.inputRevision) return phoneActivationView(await change(id, old => sameRequest(old,row) ? ({ ...old, state: ["cancelled", "archived"].includes(current.status) ? "cancelled" : "superseded", reasonCode: "configuration_changed" }) : null));
    if (!enabled()) return phoneActivationView(await change(id, old => sameRequest(old,row) ? ({ ...old, state: "waiting_platform", reasonCode: "product_gate_closed" }) : null));
    if(Date.parse(offer.expiresAt)<=Date.now())return phoneActivationView(await change(id,old=>sameRequest(old,row)?{...old,state:'waiting_platform',reasonCode:'offer_expired'}:null));
    if (row.offerDigest !== digest) return phoneActivationView(await change(id, old => sameRequest(old,row) ? ({ ...old, state: "needs_review", reasonCode: "quote_changed" }) : null));
    if(row.preDispatchRecovery&&row.purchaseAttempts>=2)return phoneActivationView(await change(id,old=>sameRequest(old,row)&&!old.purchaseStartedAt?{...old,state:'needs_review',reasonCode:'pre_dispatch_retry_exhausted'}:null));
    const token = randomBytes(16).toString("hex");
    row = await change(id, old => !sameRequest(old,row) || old.purchaseStartedAt || terminal(old.state) || old.cancelRequestedAt ? null : ({ ...old, state: "running", generation: old.generation + 1, purchaseAttempts: old.purchaseAttempts + 1, purchaseStartedAt: iso(), claim: { token, until: new Date(Date.now() + 60000).toISOString() } }));
    if (row.claim?.token !== token) return phoneActivationView(row);
    // Recheck the product gate after the durable claim and before the adapter.
    if (!enabled()) return phoneActivationView(await change(id, old => old.claim?.token === token ? { ...old, state: "waiting_platform", purchaseStartedAt: null, claim: null, reasonCode: "product_gate_closed" } : null));
    let paidDispatchBlocked=false;
    const authorizeDispatch = async () => {
      const latestIntent=await strictRead(STORE,id),parentAllowed=latestIntent&&await parentAllows(latestIntent),latestClient=await strictRead('clients',row.slug);
      try{if(latestClient)await assertPaidServiceAuthority(latestClient,'phone_number');}catch{paidDispatchBlocked=true;return false;}
      return enabled() && !!latestClient && isSupportedSelfServiceClient(latestClient) && tenant(latestClient) === row.tenantIdentity && ["testing", "live"].includes(latestClient.status) && configurationRevision(latestClient) === row.inputRevision && latestIntent?.claim?.token === token && !latestIntent.cancelRequestedAt && parentAllowed;
    };
    const stoppedBeforeDispatch = async () => {
      const latest=await strictRead('clients',row.slug),configurationChanged=latest&&isSupportedSelfServiceClient(latest)&&tenant(latest)===row.tenantIdentity&&['testing','live'].includes(latest.status)&&configurationRevision(latest)!==row.inputRevision;
      return change(id, old => old.claim?.token === token && !old.resource && old.purchaseStartedAt===row.purchaseStartedAt ? { ...old, state: old.cancelRequestedAt ? "cancelled" : paidDispatchBlocked ? "waiting_platform" : "superseded", purchaseStartedAt: null,purchaseAttempts:old.preDispatchRecovery?old.purchaseAttempts:Math.max(0,old.purchaseAttempts-1), claim: null, reasonCode: configurationChanged?'configuration_changed':paidDispatchBlocked?'paid_service_unconfirmed':"dispatch_not_authorized" } : null);
    };
    if (!await authorizeDispatch()) return phoneActivationView(await stoppedBeforeDispatch());
    try { return phoneActivationView(await recordResource(row, await provider.acquire({ intentId: row.id, correlationId: row.correlationId, offer: row.offer, attemptToken:token,authorizeDispatch }))); }
    catch (error) {
      if(error instanceof ManagedResourceAdmissionError)return phoneActivationView(await change(id,old=>old.claim?.token===token&&!old.resource&&old.purchaseStartedAt===row.purchaseStartedAt?{...old,state:old.cancelRequestedAt?'cancelled':'waiting_platform',purchaseStartedAt:null,purchaseAttempts:old.preDispatchRecovery?old.purchaseAttempts:Math.max(0,old.purchaseAttempts-1),claim:null,reasonCode:error.code,resourceWaitDetail:error.message,nextCheckAt:null}:null));
      if (error?.code === "dispatch_not_authorized") return phoneActivationView(await stoppedBeforeDispatch());
      return phoneActivationView(await change(id, old => old.resource||old.claim?.token!==token||old.purchaseStartedAt!==row.purchaseStartedAt ? null : ({ ...old, state: "uncertain", reasonCode: "acquisition_result_unconfirmed", nextCheckAt: null, claim: null })));
    }
  }
  async function recover({ limit = 10, operationId = null } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new PhoneActivationError("invalid_limit", "Choose a bounded recovery limit.", 400);
    if(operationId!==null&&(!validId(operationId)||limit!==1))throw new PhoneActivationError('invalid_limit','A targeted wake handles one retained number request.',400);
    const intents = await atomicUpdate(QUEUE, KEY, value => {
      const queue = queueValue(value), keys = Object.keys(queue.intents).sort(); if (!keys.length) return { result: [] };
      let start = keys.findIndex(key => key > queue.cursor); if (start < 0) start = 0;
      const chosen = operationId ? keys.filter(key=>key===operationId) : [...keys.slice(start), ...keys.slice(0, start)].slice(0, limit);
      return { ...(chosen.length&&!operationId?{value:{...queue,cursor:chosen.at(-1)}}:{}), result: chosen.map(key => queue.intents[key]) };
    });
    const outcomes = [];
    for (const intent of intents) {
      try { await ensure(intent); if (intent.cancellation) await applyCancellation(intent); const view = await run(intent.id); outcomes.push(view); if (terminal(view.state) && view.state !== "needs_review") await remove(intent); }
      catch { outcomes.push({ id: intent.id, state: "uncertain", active: false, reasonCode: "phone_storage_unavailable" }); }
    }
    return { processed: intents.length, outcomes };
  }
  return { quote, request, cancel: saveCancellation, run, recover, status: phoneActivationStatus };
}

function productionPolicy() {
  try {
    const offer = validateOffer(JSON.parse(process.env.PHONE_ACTIVATION_OFFER_JSON || "null"),{allowExpired:true});
    const enabled = process.env.PHONE_ACQUISITION_ENABLED === "true" && process.env.PHONE_ACTIVATION_APPROVED_VERSION === offer.version &&
      /^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || "") && !!((process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET) || process.env.TWILIO_AUTH_TOKEN);
    return { enabled, offer,offerCurrent:Date.parse(offer.expiresAt)>Date.now() };
  } catch { return { enabled: false, offer: null,offerCurrent:false }; }
}
function productionEngine(deadlineAt = null) {
  const policy = productionPolicy();
  if (!policy.offer) throw new PhoneActivationError("phone_setup_unavailable", "Phone setup is not available yet. No number was purchased.");
  const gate = () => { const current = productionPolicy(); return current.enabled && offerDigest(current.offer) === offerDigest(policy.offer); };
  return phoneEngine({ provider: createTwilioNumberAdapter({ executionAllowed: gate, deadlineAt }), offer: policy.offer, gate,allowExpiredOffer:true });
}
export async function requestPhoneActivation(c, body, options) {
  const p=productionPolicy();if (!p.enabled||!p.offerCurrent) throw new PhoneActivationError("phone_setup_unavailable", "Phone setup is not available yet. No number was purchased.");
  return productionEngine().request(c, body, options);
}
export async function cancelPhoneActivation(c, id, body) { return saveCancellation(c, id, body); }
async function pendingPhoneWork({ repair = false } = {}) {
  const queue = queueValue(await strictRead(QUEUE, KEY)), intents = Object.values(queue.intents), candidates = intents.slice(0, 50);
  const rows = [];
  for (const intent of candidates) {
    const row = repair ? (await ensure(intent), intent.cancellation ? await applyCancellation(intent) : await strictRead(STORE, intent.id)) : await strictRead(STORE, intent.id) || intent;
    if (repair && terminal(row.state) && row.state !== "needs_review") await remove(intent); else rows.push(row);
  }
  const count = repair ? Object.keys(queueValue(await strictRead(QUEUE, KEY)).intents).length : intents.length;
  return { pending: count, inspected: candidates.length, unresolved: rows.filter(row => ["uncertain", "cleanup_uncertain", "needs_review"].includes(row.state)).length,
    cleanupPending: rows.filter(row => ["cleanup_pending", "releasing", "cleanup_uncertain"].includes(row.state)).length };
}
// Creation-off maintenance can only finish an already accepted cancellation with
// no recorded resource. The adapter independently authorizes one exact inventory
// GET from durable no-reservation evidence; acquire and release stay gated off.
async function recoverNoDispatchCancellations({limit,deadlineAt,operationId=null}) {
  const intents=await atomicUpdate(QUEUE,KEY,value=>{
    const queue=queueValue(value),keys=Object.keys(queue.intents).filter(id=>queue.intents[id].cancellation&&(!operationId||id===operationId)).sort();
    if(!keys.length)return {result:[]};
    let start=keys.findIndex(id=>id>queue.cursor);if(start<0)start=0;
    const chosen=[...keys.slice(start),...keys.slice(0,start)].slice(0,limit);
    return {...(!operationId?{value:{...queue,cursor:chosen.at(-1)}}:{}),result:chosen.map(id=>queue.intents[id])};
  });
  const outcomes=[];
  for(const intent of intents) {
    try {
      await ensure(intent);const row=await applyCancellation(intent);
      if(!row.cancelRequestedAt||!row.resource&&!row.purchaseStartedAt){outcomes.push(phoneActivationView(row));continue;}
      const c=await strictRead('clients',row.slug);
      if(row.resource&&!await cancelledPhoneMaintenanceContext(c,row)){outcomes.push(phoneActivationView(row));continue;}
      const maintenanceAllowed=async args=>{const latest=await strictRead(STORE,row.id),context=await cancelledPhoneMaintenanceContext(c,latest);return !!context&&args.intentId===row.id&&args.resourceId===context.numberId&&args.correlationId===latest.correlationId&&(args.cleanupToken?latest.cleanupClaim===args.cleanupToken:args.lookupToken&&latest.lookupClaim?.token===args.lookupToken&&Date.parse(latest.lookupClaim.until)>Date.now());};
      const engine=phoneEngine({provider:createTwilioNumberAdapter({executionAllowed:()=>false,deadlineAt,maintenanceAllowed}),offer:row.offer,gate:false,allowExpiredOffer:true});
      const view=await engine.run(row.id);outcomes.push(view);
      if(view.state==='cancelled')await remove(intent);
    } catch {outcomes.push({state:'uncertain',reasonCode:'phone_storage_unavailable'});}
  }
  return {processed:intents.length,outcomes};
}
export async function recoverPhoneActivations({ limit = 1, deadlineAt = Date.now() + 15000, operationId = null } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1 || !Number.isFinite(deadlineAt) || deadlineAt > Date.now() + 15000 || deadlineAt <= Date.now()) throw new PhoneActivationError("invalid_recovery_limit", "Phone recovery must use one bounded operation.", 400);
  if(operationId!==null&&!validId(operationId))throw new PhoneActivationError('invalid_recovery_limit','A targeted wake requires the retained number operation.',400);
  const braked=(await strictRead('health','brake'))?.on===true;
  if (!productionPolicy().enabled || braked) {
    await pendingPhoneWork({ repair: true });
    const recovery=braked?{processed:0,outcomes:[]}:await recoverNoDispatchCancellations({limit,deadlineAt,operationId}),pending=await pendingPhoneWork();
    return { ok: pending.pending === 0, enabled: false, processed: recovery.processed, skipped: "Phone acquisition is disabled; cancellation checks retain the original request", reasonCode: pending.pending > pending.inspected ? "phone_scope_partial" : "product_gate_closed", scope: "bounded_candidates", ...pending, outcomes: recovery.outcomes.map(row=>({state:row.state,reasonCode:row.reasonCode||null})) };
  }
  const recovery = await productionEngine(deadlineAt).recover({ limit, operationId }), pending = await pendingPhoneWork();
  // Public scheduler receipts contain counts and codes, not customer resources.
  return { ok: pending.pending <= pending.inspected && pending.unresolved === 0 && recovery.outcomes.every(row => row.reasonCode !== "phone_storage_unavailable"), enabled: true, processed: recovery.processed, scope: "bounded_candidates", ...pending, reasonCode: pending.pending > pending.inspected ? "phone_scope_partial" : null,
    outcomes: recovery.outcomes.map(row => ({ state: row.state, reasonCode: row.reasonCode || null })) };
}
export async function phoneRecoveryHealth() {
  const pending = await pendingPhoneWork(), enabled = productionPolicy().enabled, lastRun = await strictRead("health", "phoneSetup:lastRun");
  const fresh = lastRun && Number.isFinite(Date.parse(lastRun.at)) && Date.now() - Date.parse(lastRun.at) <= 25 * 60000;
  const freshFailure = fresh && lastRun.ok === false;
  const partial = pending.pending > pending.inspected;
  if (!enabled) return { ok: pending.pending === 0 && !freshFailure, enabled: false, skipped: "Phone execution is disabled; saved work is retained", reasonCode: partial ? "phone_scope_partial" : freshFailure ? lastRun.reasonCode || "phone_recovery_failed" : "product_gate_closed", ...pending };
  return { ok: !partial && !freshFailure && pending.unresolved === 0 && (pending.pending === 0 || (fresh && lastRun.ok === true)), enabled: true, ...pending,
    lastRunAt: lastRun?.at || null, reasonCode: partial ? "phone_scope_partial" : pending.pending > 0 && !fresh ? "phone_recovery_stale" : lastRun?.reasonCode || null };
}
