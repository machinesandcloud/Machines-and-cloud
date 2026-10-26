// One customer acceptance, followed by durable handoff to the existing service engines.
// This coordinator does not buy numbers, file registrations, call providers or certify delivery.
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { configurationRevision, isSupportedSelfServiceClient } from './setup.mjs';
import { loopCheck } from './config.mjs';
import { phoneActivationStatus, requestPhoneActivation, cancelPhoneActivation, canRenewUnpurchasedPhone, phoneRenewalReference } from './phone-activation.mjs';
import { voiceActivationStatus, requestVoiceActivation, cancelVoiceActivation } from './voice-activation.mjs';
import { messagingActivationStatus, requestMessagingActivation, cancelMessagingActivation, normalizeMessagingRegistration } from './messaging-activation.mjs';

export class ServiceOnboardingError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const STORE = 'service_onboarding_intents', QUEUE = 'service_onboarding_queue', KEY = 'active_v1', CAPACITY = 25, INSPECTION_CAPACITY = 50;
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const tenant = c => hash(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)]));
const lifecycle = c => digest([c.status, c.operationLifecycleVersion || 0, c.pausedAt || null, c.cancelledAt || null, c.liveAt || null]);
const idFor = c => `${c.slug}/${hash('service-onboarding-v1:' + tenant(c))}`;
const validSlug = value => /^[a-z0-9][a-z0-9-]{0,39}$/.test(value || '');
const validId = value => /^[a-z0-9][a-z0-9-]{0,39}\/[a-f0-9]{64}$/.test(value || '');
const channels = c => ['voice', 'sms'].filter(channel => Array.isArray(c.onboarding?.desiredChannels) && c.onboarding.desiredChannels.includes(channel));
const reviewed = c => c.build?.status === 'built' && c.setupProof?.reviewedRevision === configurationRevision(c) && c.setupProof?.testedRevision === configurationRevision(c) && c.setupProof?.testMode === 'live';
const details = {
  queued: 'Your setup is saved. We will reserve your number, then prepare the connections you selected automatically.',
  awaiting_number: 'We are waiting for your dedicated number. Phone and texting setup will continue automatically.',
  connecting: 'Your connections are being prepared. Carrier approval and real delivery checks still need to finish.',
  active: 'Your selected phone and texting connections have current delivery verification.',
  waiting_platform: 'Your request is saved. Setup will continue when the accepted service is available again.',
  needs_review: 'Your business setup or service terms changed. Review the current setup before further connection work.',
  needs_action: 'A connection needs your attention. Its current status explains the required correction or delivery check.',
  uncertain: 'We are confirming a saved setup request before continuing. Recorded requests and resources are retained.',
  paused: 'Connection setup is paused. Your saved request and any recorded resources are retained.',
  cancellation_pending: 'Cancellation is saved. Existing service requests and any recorded resources are being disconnected.',
  cancelled: 'Cancellation is confirmed for the recorded service requests. Your business records are retained.',
};
function keyBytes() {
  const text = process.env.PLATFORM_DATA_ENCRYPTION_KEY || process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || '', key = Buffer.from(text, 'base64');
  return key.length === 32 && key.toString('base64') === text ? key : null;
}
function seal(value, id) {
  const key = keyBytes(); if (!key) throw new ServiceOnboardingError('private_storage_unavailable', 'Secure registration storage is not available yet.', 503);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(id));
  return { version: 1, iv: iv.toString('base64'), ciphertext: Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]).toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
function unseal(value, id) {
  const key = keyBytes(); if (!key || value?.version !== 1) throw new ServiceOnboardingError('private_storage_unavailable', 'Saved registration information could not be opened safely.', 503);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64')); decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}
function queueValue(value) {
  if (!value) return { version: 1, intents: {}, cursor: '' };
  if (value.version !== 1 || !value.intents || typeof value.intents !== 'object' || Array.isArray(value.intents) || typeof value.cursor !== 'string') throw new Error('Service setup queue unavailable');
  return value;
}
function operationView(row, state = row.state, reasonCode = row.reasonCode) {
  return { id: row.id, state, detail: details[state] || details.uncertain, reasonCode: reasonCode || null, requestedChannels: [...row.requestedChannels],
    desiredChannels:[...desiredChannels(row)],acceptedChannels:[...authorizedChannels(row)],version:row.version,generation:row.generation,
    createdAt: row.createdAt, updatedAt: row.updatedAt, cancellationRequested: !!row.cancelRequestedAt,
    numberRequested: !!row.steps?.number?.acknowledgedAt, voiceRequested: !!row.steps?.voice?.acknowledgedAt, messagingRequested: !!row.steps?.sms?.acknowledgedAt,
    nextCheckAt: row.nextCheckAt || null };
}
async function currentClient(c, actor, expectedRevision) {
  if (!validSlug(c?.slug) || !isSupportedSelfServiceClient(c)) throw new ServiceOnboardingError('workspace_unavailable', 'This action requires a customer workspace.');
  if (actor && (actor.role !== 'owner' || normalizeAccountEmail(actor.email) !== normalizeAccountEmail(c.owner?.email))) throw new ServiceOnboardingError('forbidden', 'The verified owner must approve this setup.', 403);
  const current = await strictRead('clients', c.slug);
  if (!current || !isSupportedSelfServiceClient(current) || tenant(current) !== tenant(c)) throw new ServiceOnboardingError('workspace_unavailable', 'This workspace is no longer available.');
  if (expectedRevision !== undefined && expectedRevision !== configurationRevision(current)) throw new ServiceOnboardingError('configuration_changed', 'Your saved business details changed. Review the latest version.');
  return current;
}
function requireOwner(actor) {
  if (actor?.role !== 'owner' || !normalizeAccountEmail(actor.email)) throw new ServiceOnboardingError('forbidden', 'The verified owner must approve this setup.', 403);
}
const defaultStatuses = async c => {
  const [number, voice, messaging] = await Promise.all([phoneActivationStatus(c), voiceActivationStatus(c), messagingActivationStatus(c)]);
  return { number, voice, messaging };
};
const childStore = { number: 'phone_activation_intents', voice: 'voice_activation_intents', sms: 'messaging_activation' };
const childIds = c => ({ number: `${c.slug}/${hash('first-phone-acquisition:' + tenant(c))}`, voice: `${c.slug}/${hash('managed-voice-v1:' + tenant(c))}`, sms: `${c.slug}/${hash('messaging-v1:' + tenant(c))}` });
function quote(c, status, requested = channels(c), prior = null) {
  const numberAccepted = !!prior?.offer?.number && !prior.cancelRequestedAt;
  const available = requested.length > 0 && (numberAccepted || status.number.available === true && !!status.number.offer) &&
    (!requested.includes('voice') || status.voice.available === true && !!status.voice.offer) &&
    (!requested.includes('sms') || status.messaging.available === true && !!status.messaging.offer && !!status.messaging.program && !!keyBytes());
  if (!available) return null;
  const offer = { number: numberAccepted ? prior.offer.number : status.number.offer, voice: requested.includes('voice') ? status.voice.offer : null, messaging: requested.includes('sms') ? status.messaging.offer : null, program: requested.includes('sms') ? status.messaging.program : null };
  return { ...offer, scopeChannels:[...requested], numberCostAlreadyAccepted:numberAccepted, digest: digest({ requestedChannels: requested, number: offer.number.digest, numberCostAlreadyAccepted:numberAccepted, voice: offer.voice?.digest || null, messaging: offer.messaging?.digest || null, program: offer.program?.digest || null }) };
}
function legacyQuote(c,facts){const offer=quote(c,facts);return offer?{...offer,digest:digest({requestedChannels:channels(c),number:offer.number.digest,voice:offer.voice?.digest||null,messaging:offer.messaging?.digest||null,program:offer.program?.digest||null})}:null;}
function requestShape(body, requested) {
  const allowed = ['actor', 'expectedRevision', 'submissionId', 'offerDigest', 'acceptedCosts', 'authority', 'acceptedChannels', ...(requested.includes('voice') ? ['forwardingMode'] : []), ...(requested.includes('sms') ? ['legal', 'attestLegalAccuracy', 'attestConsent', 'testPhoneConsent'] : [])];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || JSON.stringify(body).length > 14000 || !/^[a-f0-9]{64}$/.test(body.expectedRevision || '') || !/^[a-f0-9]{32,64}$/i.test(body.submissionId || '') || !/^[a-f0-9]{64}$/.test(body.offerDigest || '') || body.acceptedCosts !== true || body.authority !== true || requested.includes('sms') && ![body.attestLegalAccuracy, body.attestConsent, body.testPhoneConsent].every(value => value === true)) throw new ServiceOnboardingError('acceptance_required', 'Review the current costs, permissions and selected connections before continuing.', 400);
  if (requested.includes('voice') && !['forward_business_line', 'use_new_number'].includes(body.forwardingMode)) throw new ServiceOnboardingError('invalid_forwarding', 'Choose how customers should reach your front desk.', 400);
}
function fingerprint(body) { const { actor, submissionId, ...input } = body; return digest(input); }
function requirements(c, body, requested) {
  if (!['testing', 'live'].includes(c.status) || !reviewed(c) || !c.business?.trade || !c.services?.length || !c.business?.serviceArea?.length || !c.rules?.hours || !c.windows?.length || !/^\+1\d{10}$/.test(c.owner?.phone || '') || loopCheck(c)) throw new ServiceOnboardingError('setup_incomplete', 'Complete, review and privately test your current business answers before connecting services.');
  if (requested.includes('voice') && body.forwardingMode === 'forward_business_line' && (!/^\+1\d{10}$/.test(c.phone?.businessNumber || '') || c.phone.businessNumber === c.owner.phone)) throw new ServiceOnboardingError('unsafe_forwarding', 'Add your business line and a separate contact cell before forwarding calls.', 400);
}
function samePlan(row, c) { return row.tenantIdentity === tenant(c) && row.inputRevision === configurationRevision(c) && row.lifecycle === lifecycle(c) && digest(desiredChannels(row)) === digest(channels(c)); }
const binding = requested => ({ accountSid: process.env.TWILIO_ACCOUNT_SID || '', vapiCredentialHash: requested.includes('voice') && process.env.VAPI_API_KEY ? hash(process.env.VAPI_API_KEY) : null });
const bindingMatches = row => digest(row.providerBinding) === digest(binding(row.requestedChannels));
const started = row => Object.values(row.steps || {}).some(step => step?.startedAt);
const authorizedChannels = row => row?.requestedChannels || [];
const desiredChannels = row => row?.desiredChannels || row?.requestedChannels || [];
const channelSet = values => ['voice','sms'].filter(channel => values.includes(channel));
function channelReady(kind, status) { return kind === 'voice' ? status.voice.available === true && !!status.voice.offer : status.messaging.available === true && !!status.messaging.offer && !!status.messaging.program && !!keyBytes(); }
function acceptanceReceipt(row, submissionId) { return (row?.admissions || []).find(receipt => receipt.submissionId === submissionId.toLowerCase()); }
// Read-only recovery for one owner approval whose HTTP response was lost.
// Queue admission is itself durable; inspecting it must not repair or dispatch it.
export async function serviceApprovalStatus(c, actor, submissionId) {
  requireOwner(actor);
  if (!/^[a-f0-9]{32,64}$/.test(submissionId || '')) throw new ServiceOnboardingError('invalid_approval', 'Check the original saved approval.', 400);
  const current = await currentClient(c, actor), id = idFor(current);
  const [primary, queued] = await Promise.all([strictRead(STORE, id), strictRead(QUEUE, KEY)]);
  const queue = queueValue(queued), entry = queue.intents[id], rows = [primary, entry?.admission].filter(Boolean);
  const result = { submissionId, state: 'not_requested', operationId: null, generation: null };
  if (entry && (entry.id !== id || entry.tenantIdentity !== tenant(current))) return { ...result, state: 'uncertain' };
  if (rows.some(row => row.id !== id || row.tenantIdentity !== tenant(current) || ![1, 2].includes(row.version) || !Array.isArray(row.admissions))) return { ...result, state: 'uncertain' };
  const matching = rows.filter(row => acceptanceReceipt(row, submissionId));
  if (matching.length) {
    if (matching.some(row => !Number.isInteger(row.generation) || row.generation < 1) || new Set(matching.map(row => row.generation)).size !== 1) return { ...result, state: 'uncertain' };
    return { ...result, state: 'accepted', operationId: id, generation: matching[0].generation };
  }
  // Absence is only an observation, not permission to resubmit an in-flight POST.
  return rows.length || entry ? { ...result, state: 'uncertain' } : result;
}
function childPermission(kind, row, facts) {
  if (row.providerBinding.accountSid !== (process.env.TWILIO_ACCOUNT_SID || '')) return 'provider_binding_changed';
  if (kind === 'number') {
    if (!facts.number.available || !facts.number.offer) return 'service_unavailable';
    if (facts.number.offer.digest !== row.offer.number.digest) return 'terms_changed';
    const reasons=row.requestedChannels.map(channel=>childPermission(channel,row,facts));
    return reasons.some(reason=>!reason)?null:reasons.find(reason=>reason!=='service_unavailable')||'service_unavailable';
  }
  if (kind==='voice' && row.providerBinding.vapiCredentialHash !== (process.env.VAPI_API_KEY ? hash(process.env.VAPI_API_KEY) : null)) return 'provider_binding_changed';
  if (!channelReady(kind,facts)) return 'service_unavailable';
  if (kind==='voice') return facts.voice.offer.digest === row.offer.voice?.digest ? null : 'terms_changed';
  return facts.messaging.offer.digest === row.offer.messaging?.digest && facts.messaging.program.digest === row.offer.program?.digest ? null : 'terms_changed';
}

function engine(options = {}) {
  const deps = { statuses: defaultStatuses, requestNumber: requestPhoneActivation, requestVoice: requestVoiceActivation, requestMessaging: requestMessagingActivation,
    cancelNumber: cancelPhoneActivation, cancelVoice: cancelVoiceActivation, cancelMessaging: (c, body) => cancelMessagingActivation(c, body.operationId, body),
    readChild: (kind, id) => strictRead(childStore[kind], id), now: () => Date.now(), ...options };
  const stamp = () => new Date(deps.now()).toISOString();
  async function numberRenewal(row, current, entry) {
    if (!row || row.version !== 2 || row.cancelRequestedAt || entry?.cancelRequestedAt || !['testing','live'].includes(current.status) || row.tenantIdentity !== tenant(current) || row.providerBinding.accountSid !== (process.env.TWILIO_ACCOUNT_SID || '') || row.claim && Date.parse(row.claim.until) > deps.now() || Object.entries(row.steps || {}).some(([kind,step]) => kind !== 'number' && step?.startedAt) || Object.keys(entry?.dispatches || {}).some(kind => kind !== 'number')) return null;
    const pendingRenewal = row.numberRenewal && !started(row) && !entry?.dispatchStartedAt && !Object.keys(entry?.dispatches || {}).length && !samePlan(row,current);
    if (!row.steps?.number?.startedAt && !pendingRenewal) return null;
    const ids = childIds(current), [number, voice, sms] = await Promise.all(['number','voice','sms'].map(kind => deps.readChild(kind,ids[kind])));
    if (voice || sms || !canRenewUnpurchasedPhone(number)) return null;
    if (pendingRenewal) {
      const { generation, ...reference } = row.numberRenewal;
      if (digest(phoneRenewalReference(number)) !== digest(reference) || number.id !== ids.number || number.slug !== row.slug || number.tenantIdentity !== row.tenantIdentity || number.authority?.actor?.email !== row.authority.actor.email || number.authority.costsAccepted !== true || number.authority.authorityAccepted !== true) return null;
    } else if (!childMatches('number',number,row)) return null;
    return { generation: row.generation, ...phoneRenewalReference(number) };
  }
  async function ensure(c) {
    const id = idFor(c), entry = queueValue(await strictRead(QUEUE, KEY)).intents[id];
    if (!entry) return strictRead(STORE, id);
    const admission = entry.admission;
    if (!admission || admission.id !== id || admission.tenantIdentity !== tenant(c) || entry.tenantIdentity !== tenant(c)) throw new Error('Service setup admission unavailable');
    return atomicUpdate(STORE, id, async old => {
      if (old && old.tenantIdentity !== admission.tenantIdentity) throw new Error('Service setup admission identity conflict');
      if (![1,2].includes(admission.version) || old && ![1,2].includes(old.version)) throw new Error('Unsupported service setup receipt');
      if (old && old.generation > admission.generation) throw new Error('Service setup admission generation conflict');
      if (old?.generation === admission.generation) {
        if (old.version===2 && admission.version===2 && (admission.admissionSequence || 0) > (old.admissionSequence || 0)) {
          if (!admission.extension || admission.previousSequence !== old.admissionSequence || admission.inputRevision !== old.inputRevision || admission.lifecycle !== old.lifecycle || digest(admission.desiredChannels)!==digest(old.desiredChannels) || old.requestedChannels.some(channel=>!admission.requestedChannels.includes(channel)) || old.admissions.some((receipt,index)=>digest(receipt)!==digest(admission.admissions[index])) || ['number',...old.requestedChannels.map(channel=>channel==='sms'?'messaging':'voice'),...(old.requestedChannels.includes('sms')?['program']:[])].some(kind=>digest(old.offer[kind])!==digest(admission.offer[kind]))) throw new ServiceOnboardingError('setup_conflict','This connection approval changed. Refresh before continuing.');
          const value={...old,requestedChannels:admission.requestedChannels,offer:admission.offer,privateData:admission.privateData,legalInputHash:admission.legalInputHash,forwardingMode:admission.forwardingMode,providerBinding:admission.providerBinding,authority:admission.authority,requestFingerprint:admission.requestFingerprint,admissions:admission.admissions,admissionSequence:admission.admissionSequence,updatedAt:stamp(),...(entry.cancelRequestedAt?{cancelRequestedAt:old.cancelRequestedAt||entry.cancelRequestedAt,cancellationActor:entry.cancellationActor}:{}),state:old.cancelRequestedAt||entry.cancelRequestedAt?'cancellation_pending':old.state==='active'?'queued':old.state};
          return {value,result:value};
        }
        if (entry.cancelRequestedAt && !old.cancelRequestedAt) return { value: { ...old, cancelRequestedAt: entry.cancelRequestedAt, cancellationActor: entry.cancellationActor, state: 'cancellation_pending' }, result: { ...old, cancelRequestedAt: entry.cancelRequestedAt, cancellationActor: entry.cancellationActor, state: 'cancellation_pending' } };
        return { result: old };
      }
      const renewal = admission.numberRenewal && old && admission.generation === old.generation + 1 && digest(await numberRenewal(old,c,entry)) === digest(admission.numberRenewal);
      if (entry.dispatchStartedAt || old && (started(old) && !renewal || old.claim && Date.parse(old.claim.until) > deps.now())) {
        if (old) return { result: old };
        throw new Error('Service setup primary receipt missing after dispatch');
      }
      const value = { ...admission, ...(entry.cancelRequestedAt ? { cancelRequestedAt: entry.cancelRequestedAt, cancellationActor: entry.cancellationActor, state: 'cancellation_pending' } : {}) };
      return { value, result: value };
    });
  }
  async function change(id, update) {
    return atomicUpdate(STORE, id, current => { if (!current) throw new Error('Service setup receipt unavailable'); const next = update(current); if (!next) return { result: current }; const value = { ...next, updatedAt: stamp() }; return { value, result: value }; });
  }
  async function status(c) {
    const current = await currentClient(c), row = await strictRead(STORE, idFor(current)), facts = await deps.statuses(current), requested = channels(current);
    if(row && ![1,2].includes(row.version))throw new ServiceOnboardingError('unsupported_setup','This retained setup needs support review.');
    const entry = queueValue(await strictRead(QUEUE, KEY)).intents[idFor(current)];
    const standalone = !row && !!(facts.number.operation || facts.voice.operation || facts.messaging.operation);
    const accepted=authorizedChannels(row),unsigned=requested.filter(channel=>!accepted.includes(channel));
    const renewal = await numberRenewal(row,current,entry);
    const scope=row?.version===1?requested:renewal?requested.filter(channel=>channelReady(channel,facts)):unsigned.length?unsigned.filter(channel=>channelReady(channel,facts)):row&&!started(row)&&!entry?.dispatchStartedAt?requested:row?[]:requested.filter(channel=>channelReady(channel,facts));
    const offer=row?.version===1?legacyQuote(current,facts):quote(current,facts,scope,row?.version===2&&scope.every(channel=>!accepted.includes(channel))&&samePlan(row,current)?row:null);
    let state = row?.state, reason = row?.reasonCode;
    if (row && !row.cancelRequestedAt) {
      if (!samePlan(row, current) || row.version===1&&!bindingMatches(row) || row.version===2&&row.providerBinding.accountSid!==(process.env.TWILIO_ACCOUNT_SID||'')) { state = current.status === 'paused' ? 'paused' : 'needs_review'; reason = 'workspace_changed'; }
      else if (row.version===1 && (!offer || offer.digest !== row.offer.digest)) { state = offer ? 'needs_review' : 'waiting_platform'; reason = offer ? 'terms_changed' : 'service_unavailable'; }
      else if(row.version===2 && row.requestedChannels.some(channel=>{const reason=childPermission(channel,row,facts);return reason&&reason!=='service_unavailable';})){state='needs_review';reason=row.requestedChannels.map(channel=>childPermission(channel,row,facts)).find(reason=>reason&&reason!=='service_unavailable');}
      else if (row.steps?.number?.acknowledgedAt && row.requestedChannels.every(channel => row.steps?.[channel]?.acknowledgedAt)) {
        const active = row.requestedChannels.every(channel => (channel === 'sms' ? facts.messaging : facts.voice).active === true);
        state = active ? 'active' : row.requestedChannels.some(channel => ['needs_action', 'needs_review', 'blocked', 'failed', 'awaiting_test', 'ready'].includes((channel === 'sms' ? facts.messaging : facts.voice).state)) ? 'needs_action' : 'connecting';
      }
    }
    if (renewal) { state = 'needs_review'; reason = 'workspace_changed'; }
    const braked = (await strictRead('health', 'brake'))?.on === true;
    const adding=row?.version===2&&unsigned.length>0&&samePlan(row,current)&&!Object.values(row.steps||{}).some(step=>step.startedAt&&!step.acknowledgedAt);
    const canReview = !braked && !!offer && !standalone && (!row || !row.cancelRequestedAt && (renewal || adding || !started(row) && !entry?.dispatchStartedAt) && (!row.claim || Date.parse(row.claim.until) <= deps.now()));
    const existingActions = standalone || !!row && started(row) && ['needs_review', 'needs_action'].includes(state) && !adding && !renewal;
    const deferredChannels=requested.filter(channel=>!accepted.includes(channel)||row?.version===2&&childPermission(channel,row,facts)).map(id=>({id,reasonCode:accepted.includes(id)?childPermission(id,row,facts):channelReady(id,facts)?'permission_required':'service_unavailable',ownerAction:accepted.includes(id)&&childPermission(id,row,facts)!=='service_unavailable'?'review_existing_connection':channelReady(id,facts)&&!accepted.includes(id)?'review_service_offer':'wait_for_service'}));
    return { available: canReview, legacySetup: existingActions, numberReady:facts.number.operation?.state==='number_acquired'&&!facts.number.operation.cancellationRequested&&!facts.number.operation.releaseConfirmed, requestedChannels: requested, acceptedChannels:[...accepted],authorizableChannels:canReview?[...scope]:[],deferredChannels, offer: standalone || braked || !canReview ? null : offer, reasonCode: standalone ? 'existing_setup' : braked ? 'usage_brake' : !requested.length ? 'no_service_requested' : !offer ? 'service_unavailable' : null,
      operation: row ? { ...operationView(row, state, reason), canReview, nextAction: existingActions ? 'review_existing_connections' : canReview && state === 'needs_review' ? 'review_current_offer' : null } : null };
  }
  async function request(c, body = {}, options = {}) {
    requireOwner(body.actor);
    const current = await currentClient(c, body.actor, body.expectedRevision), selected = channels(current);
    if (body.acceptedChannels !== undefined && (!Array.isArray(body.acceptedChannels) || !body.acceptedChannels.length || body.acceptedChannels.length > 2 || new Set(body.acceptedChannels).size !== body.acceptedChannels.length || body.acceptedChannels.some(channel => !selected.includes(channel)))) throw new ServiceOnboardingError('invalid_channels','Choose only the connections shown in the reviewed offer.',400);
    const requested = body.acceptedChannels === undefined ? selected : channelSet(body.acceptedChannels);
    requestShape(body, requested);
    const id = idFor(current), prior = await ensure(current), requestFingerprint = fingerprint(body);
    if (prior && ![1,2].includes(prior.version)) throw new ServiceOnboardingError('unsupported_setup','This retained setup needs support review.');
    const receipt=acceptanceReceipt(prior,body.submissionId);
    if(receipt){if(receipt.requestFingerprint!==requestFingerprint)throw new ServiceOnboardingError('submission_conflict','This approval was already used for different connection details.');return operationView(prior);}
    const entry=queueValue(await strictRead(QUEUE,KEY)).intents[id];
    const renewal = await numberRenewal(prior,current,entry);
    if(prior?.requestFingerprint===requestFingerprint&&!renewal)return operationView(prior);
    const adding=!!prior&&prior.version===2&&samePlan(prior,current)&&requested.every(channel=>!prior.requestedChannels.includes(channel));
    if(prior&&(prior.cancelRequestedAt || prior.claim&&Date.parse(prior.claim.until)>deps.now() || adding&&Object.values(prior.steps||{}).some(step=>step.startedAt&&!step.acknowledgedAt) || !adding&&!renewal&&(started(prior)||entry?.dispatchStartedAt)))throw new ServiceOnboardingError('setup_conflict','A setup request already exists. Keep its recorded progress and use its connection actions.');
    if(prior?.version===2&&(prior.admissions||[]).length>=20)throw new ServiceOnboardingError('approval_history_full','Connection approval history needs support review before another approval can be added.');
    const facts=await deps.statuses(current),offer=quote(current,facts,requested,adding?prior:null);
    if(!offer||(await strictRead('health','brake'))?.on===true)throw new ServiceOnboardingError('service_setup_unavailable','Your connection preferences are saved. The current service offer is not available yet. No paid setup was requested.');
    if(!prior&&(facts.number.operation||facts.voice.operation||facts.messaging.operation))throw new ServiceOnboardingError('existing_setup','This workspace already has a connection request. Continue with its recorded setup.');
    if(body.offerDigest!==offer.digest)throw new ServiceOnboardingError('offer_changed','Service terms changed. Review the current offer before continuing.');
    if(adding&&prior.providerBinding.accountSid!==(process.env.TWILIO_ACCOUNT_SID||''))throw new ServiceOnboardingError('setup_conflict','Your recorded number belongs to the earlier service setup. Review it before adding a connection.');
    requirements(current,body,requested);
    const legal=requested.includes('sms')?normalizeMessagingRegistration(body.legal):null,createdAt=stamp();
    const authority={actor:{role:'owner',email:normalizeAccountEmail(body.actor.email)},acceptedAt:createdAt,acceptedCosts:true,authority:true,...(legal?{attestLegalAccuracy:true,attestConsent:true,testPhoneConsent:true}:{})};
    const admission={submissionId:body.submissionId.toLowerCase(),requestFingerprint,acceptedChannels:requested,offerDigest:offer.digest,acceptedAt:createdAt,actor:authority.actor};
    const combined=adding?channelSet([...prior.requestedChannels,...requested]):requested;
    const mergedOffer=adding?{...prior.offer,...(requested.includes('voice')?{voice:offer.voice}:{}),...(requested.includes('sms')?{messaging:offer.messaging,program:offer.program}:{})}:offer;
    const row={...(adding?prior:{}),version:2,id,slug:current.slug,tenantIdentity:tenant(current),inputRevision:configurationRevision(current),lifecycle:lifecycle(current),desiredChannels:selected,requestedChannels:combined,
      providerBinding:adding?{...prior.providerBinding,...(requested.includes('voice')?{vapiCredentialHash:binding(requested).vapiCredentialHash}:{})}:binding(requested),
      requestFingerprint,offer:mergedOffer,forwardingMode:requested.includes('voice')?body.forwardingMode:adding?prior.forwardingMode:null,
      privateData:legal?seal(legal,id):adding?prior.privateData:null,legalInputHash:legal?hash(JSON.stringify({legal,program:offer.program})):adding?prior.legalInputHash:null,
      authority:adding?{...prior.authority,...(legal?{attestLegalAccuracy:true,attestConsent:true,testPhoneConsent:true}:{})}:authority,
      state:'queued',createdAt:adding?prior.createdAt:createdAt,updatedAt:createdAt,generation:adding?prior.generation:(prior?.generation||0)+1,
      admissionSequence:adding?prior.admissionSequence+1:1,previousSequence:adding?prior.admissionSequence:null,extension:adding,
      admissions:[...(prior?.admissions||[]),admission],steps:adding?prior.steps:{},claim:null,cancelRequestedAt:null,reasonCode:null,
      ...(renewal ? { numberRenewal: renewal } : {}),
      history:[...(prior?.history||[]),...(!adding&&prior?[{generation:prior.generation,inputRevision:prior.inputRevision,offerDigest:prior.offer.digest,acceptedAt:prior.authority.acceptedAt}]:[])].slice(-10)};
    if(options.beforeAdmission)await options.beforeAdmission(current);
    await atomicUpdate(QUEUE,KEY,async value=>{
      const queue=queueValue(value),old=queue.intents[id];
      if(!renewal&&old?.admission?.tenantIdentity===row.tenantIdentity&&old.admission.requestFingerprint===requestFingerprint)return {result:old};
      const live=await strictRead(STORE,id);await currentClient(current,body.actor,body.expectedRevision);
      if(adding){
        if(!live||live.version!==2||live.generation!==prior.generation||live.admissionSequence!==prior.admissionSequence||live.cancelRequestedAt||old?.cancelRequestedAt||live.claim&&Date.parse(live.claim.until)>deps.now()||Object.values(live.steps||{}).some(step=>step.startedAt&&!step.acknowledgedAt))throw new ServiceOnboardingError('setup_conflict','Connection setup progressed while you reviewed it. Refresh the current offer.');
      }else if(old&&(!prior||old.admission?.generation!==prior.generation||old.dispatchStartedAt&&!renewal||old.cancelRequestedAt))throw new ServiceOnboardingError('setup_receipt_unavailable','An existing setup receipt needs recovery. No replacement request was created.',503);
      if(renewal && (!live || live.generation !== prior.generation || live.admissionSequence !== prior.admissionSequence || digest(await numberRenewal(live,current,old)) !== digest(renewal))) throw new ServiceOnboardingError('setup_conflict','Connection setup progressed while you reviewed it. Refresh the current offer.');
      if(!old&&(Object.values(queue.intents).filter(item=>!item.cancelRequestedAt).length>=CAPACITY||Object.keys(queue.intents).length>=INSPECTION_CAPACITY))throw new ServiceOnboardingError('setup_capacity_full','Connection setup is temporarily at capacity. No paid setup was requested.',503);
      return {value:{...queue,intents:{...queue.intents,[id]:{...(adding?old||{}:{}),id,slug:row.slug,tenantIdentity:row.tenantIdentity,createdAt:row.createdAt,admission:row,...(adding&&started(prior)?{dispatchStartedAt:old?.dispatchStartedAt||prior.updatedAt}:{})}}}};
    });
    return operationView(await ensure(current));
  }
  async function cancel(c, body = {}) {
    requireOwner(body.actor);
    if (!/^[a-f0-9]{64}$/.test(body.expectedRevision || '')) throw new ServiceOnboardingError('configuration_changed', 'Refresh your setup before cancelling.', 400);
    const current = await currentClient(c, body.actor, body.expectedRevision);
    if (Object.keys(body).some(key => !['actor', 'expectedRevision', 'operationId'].includes(key)) || body.operationId !== undefined && body.operationId !== idFor(current)) throw new ServiceOnboardingError('invalid_request', 'Refresh your setup before cancelling.', 400);
    const prior = await ensure(current);
    if (!prior || prior.tenantIdentity !== tenant(current)) throw new ServiceOnboardingError('setup_not_found', 'Refresh your setup before cancelling.', 404);
    if (prior.cancelRequestedAt && prior.state === 'cancelled') return operationView(prior);
    await atomicUpdate(QUEUE, KEY, value => { const queue = queueValue(value), entry = queue.intents[idFor(current)];
      if (entry && entry.tenantIdentity !== tenant(current)) throw new ServiceOnboardingError('setup_not_found', 'Refresh your setup before cancelling.', 404);
      if (entry?.cancelRequestedAt) return {};
      if (!entry && Object.keys(queue.intents).length >= INSPECTION_CAPACITY) throw new ServiceOnboardingError('cleanup_capacity_full', 'Cancellation recovery is temporarily at capacity. Your recorded service requests are retained.', 503);
      return { value: { ...queue, intents: { ...queue.intents, [idFor(current)]: { ...(entry || { id: prior.id, slug: prior.slug, tenantIdentity: prior.tenantIdentity, createdAt: prior.createdAt, admission: prior, ...(started(prior) ? { dispatchStartedAt: prior.updatedAt } : {}) }), cancelRequestedAt: stamp(), cancellationActor: { role: 'owner', email: normalizeAccountEmail(body.actor.email) } } } } }; });
    await ensure(current);
    return operationView(await change(idFor(current), row => row.tenantIdentity !== tenant(current) ? (() => { throw new ServiceOnboardingError('forbidden', 'This setup belongs to another workspace.', 403); })() : row.cancelRequestedAt ? null : { ...row, cancelRequestedAt: stamp(), state: 'cancellation_pending', cancellationActor: { role: 'owner', email: normalizeAccountEmail(body.actor.email) } }));
  }
  function childMatches(kind, child, row) {
    const expectedId = `${row.slug}/${hash((kind === 'number' ? 'first-phone-acquisition:' : kind === 'voice' ? 'managed-voice-v1:' : 'messaging-v1:') + row.tenantIdentity)}`;
    if (!child || child.id !== expectedId || child.slug !== row.slug || child.tenantIdentity !== row.tenantIdentity || child.inputRevision !== row.inputRevision || !Number.isFinite(Date.parse(child.createdAt)) || Date.parse(child.createdAt) < Date.parse(row.createdAt) || child.providerAccountSid && child.providerAccountSid !== row.providerBinding.accountSid || child.resource?.accountSid && child.resource.accountSid !== row.providerBinding.accountSid) return false;
    if (kind === 'number') return child.offerDigest === row.offer.number.digest && child.authority?.actor?.email === row.authority.actor.email && child.authority.costsAccepted === true && child.authority.authorityAccepted === true;
    if (kind === 'voice') return child.policyDigest === row.offer.voice.digest && child.authority?.actor?.email === row.authority.actor.email && child.authority.acceptedAuthority === true;
    return child.offerDigest === row.offer.messaging.digest && child.programDigest === row.offer.program.digest && child.inputHash === row.legalInputHash && child.authority?.actorEmail === row.authority.actor.email && child.authority.customerAuthority === true && child.authority.costsAccepted === true;
  }
  function cleanupChildMatches(kind, child, row) {
    const expectedId = `${row.slug}/${hash((kind === 'number' ? 'first-phone-acquisition:' : kind === 'voice' ? 'managed-voice-v1:' : 'messaging-v1:') + row.tenantIdentity)}`;
    if (!child || child.id !== expectedId || child.slug !== row.slug || child.tenantIdentity !== row.tenantIdentity || !Number.isFinite(Date.parse(child.createdAt)) || Date.parse(child.createdAt) < Date.parse(row.createdAt) || child.providerAccountSid && child.providerAccountSid !== row.providerBinding.accountSid || child.resource?.accountSid && child.resource.accountSid !== row.providerBinding.accountSid) return false;
    // A later authorized rules review or registration correction cannot prevent
    // stopping the same retained child. Cleanup does not reuse those fields as
    // permission for any new provider setup.
    return kind === 'sms' ? child.authority?.actorEmail === row.authority.actor.email && child.authority.customerAuthority === true && child.authority.costsAccepted === true : child.authority?.actor?.email === row.authority.actor.email && (kind === 'number' ? child.authority.costsAccepted === true && child.authority.authorityAccepted === true : child.authority.acceptedAuthority === true);
  }
  async function continueOne(c, { deadlineAt = deps.now() + 12000 } = {}) {
    if (!Number.isFinite(deadlineAt) || deadlineAt <= deps.now() || deadlineAt > deps.now() + 15000) throw new ServiceOnboardingError('invalid_deadline', 'Service setup requires a bounded worker deadline.', 400);
    let current = await currentClient(c), row = await ensure(current);
    if (!row) return { ok: true, state: 'not_requested', voiceRequested: false, messagingRequested: false, operation: null };
    const token = randomBytes(16).toString('hex');
    row = await change(row.id, old => old.claim && Date.parse(old.claim.until) > deps.now() ? null : { ...old, claim: { token, until: new Date(deps.now() + 30000).toISOString() } });
    if (row.claim?.token !== token) return { ok: true, state: row.state, voiceRequested: false, messagingRequested: false, operation: operationView(row) };
    const claimed={version:row.version,generation:row.generation,sequence:row.version===2?row.admissionSequence:null,token};
    const ownsClaim=plan=>plan?.version===claimed.version&&plan.generation===claimed.generation&&plan.claim?.token===claimed.token&&(claimed.version!==2||plan.admissionSequence===claimed.sequence)&&Number.isFinite(Date.parse(plan.claim.until))&&Date.parse(plan.claim.until)>deps.now();
    let workerStale=false;
    const stale=()=>new ServiceOnboardingError('setup_worker_stale','A newer setup check owns this request. Its saved work will continue safely.');
    const hints = { voiceRequested: false, messagingRequested: false };
    const save = patch => change(row.id, old => {if(!ownsClaim(old)){workerStale=true;return null;}return { ...old, ...patch, ...(old.cancelRequestedAt && patch.state !== 'cancelled' ? { state: 'cancellation_pending' } : {}) };});
    const finish = async (state, reasonCode = null) => {
      row = await save({ state, reasonCode, claim: null, nextCheckAt: ['cancelled', 'active'].includes(state) ? null : new Date(deps.now() + 600000).toISOString() });
      if(workerStale)return {ok:true,state:row.state,voiceRequested:false,messagingRequested:false,staleWorker:true,operation:operationView(row)};
      if (['active', 'cancelled'].includes(row.state)) await atomicUpdate(QUEUE, KEY, value => { const queue = queueValue(value), entry = queue.intents[row.id]; if (!entry || entry.admission?.generation !== row.generation || row.version===2&&entry.admission.admissionSequence!==row.admissionSequence || row.state === 'active' && entry.cancelRequestedAt) return {}; const intents = { ...queue.intents }; delete intents[row.id]; return { value: { ...queue, intents } }; });
      // A known customer review is a waiting outcome, not a failed platform
      // worker. Retain its reason on the operation; uncertainty remains a failure.
      return { ok: row.state !== 'uncertain', state: row.state, ...hints, operation: operationView(row) };
    };
    async function latest() {
      const [client, plan, brake, value] = await Promise.all([strictRead('clients', row.slug), strictRead(STORE, row.id), strictRead('health', 'brake'), strictRead(QUEUE, KEY)]);
      if (!client || !isSupportedSelfServiceClient(client) || tenant(client) !== row.tenantIdentity || !plan || plan.tenantIdentity !== row.tenantIdentity) throw new ServiceOnboardingError('workspace_changed', 'This saved setup no longer matches the workspace.');
      if(!ownsClaim(plan)){workerStale=true;throw stale();}
      const entry = queueValue(value).intents[row.id];
      current = client; row = entry?.cancelRequestedAt && !plan.cancelRequestedAt ? await change(row.id, old => {if(!ownsClaim(old)){workerStale=true;return null;}return { ...old, cancelRequestedAt: entry.cancelRequestedAt, cancellationActor: entry.cancellationActor, state: 'cancellation_pending' };}) : plan;
      if(workerStale)throw stale();
      return { brake: brake?.on === true };
    }
    async function saveStep(kind, patch) {
      row = await change(row.id, old => {if(!ownsClaim(old)){workerStale=true;return null;}return { ...old, steps: { ...old.steps, [kind]: { ...old.steps[kind], ...patch } }, ...(old.cancelRequestedAt ? { state: 'cancellation_pending' } : {}) };});
      if(workerStale)throw stale();
    }
    async function clearPrepared(kind) {
      // This path is used only while the lower-engine method has NOT been invoked.
      // Unknown/lost acknowledgments after invocation retain the durable marker.
      await atomicUpdate(QUEUE, KEY, async value => { const queue = queueValue(value), entry = queue.intents[row.id], plan = await strictRead(STORE, row.id);
        if (!entry || entry.admission?.generation !== claimed.generation || row.version===2&&entry.admission.admissionSequence!==claimed.sequence || !ownsClaim(plan)){workerStale=true;return {};}
        const dispatches = { ...entry.dispatches }; delete dispatches[kind];
        const next = { ...entry, dispatches }; if (!Object.keys(dispatches).length) delete next.dispatchStartedAt;
        return { value: { ...queue, intents: { ...queue.intents, [row.id]: next } } };
      });
      if(workerStale)throw stale();
      row = await change(row.id, old => { if (!ownsClaim(old)){workerStale=true;return null;}if(old.steps[kind]?.acknowledgedAt)return null;const steps = { ...old.steps }; delete steps[kind]; return { ...old, steps }; });
      if(workerStale)throw stale();
    }
    try {
      await latest();
      if (['cancelled', 'archived'].includes(current.status) && !row.cancelRequestedAt) row = await save({ cancelRequestedAt: stamp(), state: 'cancellation_pending' });
      if (row.cancelRequestedAt) {
        const ids = childIds(current); let confirmed = true;
        for (const kind of ['voice', 'sms', 'number']) {
          if (deps.now() >= deadlineAt) return finish('cancellation_pending', 'worker_deadline');
          await latest(); if (!row.steps[kind]?.startedAt) continue;
          const child = await deps.readChild(kind, ids[kind]);
          if (!child) { if (!row.steps[kind].acknowledgedAt) { confirmed = false; continue; } return finish('cancellation_pending', 'child_receipt_unavailable'); }
          if (!cleanupChildMatches(kind, child, row)) return finish('cancellation_pending', 'child_identity_conflict');
          await saveStep(kind, { id: ids[kind], acknowledgedAt: row.steps[kind].acknowledgedAt || stamp() });
          if (kind === 'number' ? !!child.releasedAt || child.state === 'cancelled' && !child.resource && !child.purchaseStartedAt : !!child.cleanupConfirmedAt || child.state === 'cancelled') continue;
          confirmed = false;
          const body = { actor: row.authority.actor, expectedRevision: configurationRevision(current) };
          if (kind === 'voice') await deps.cancelVoice(current, body);
          else if (kind === 'sms') await deps.cancelMessaging(current, { ...body, operationId: ids[kind] });
          else await deps.cancelNumber(current, ids[kind], body);
        }
        return finish(confirmed ? 'cancelled' : 'cancellation_pending');
      }
      const checked = await latest();
      if (checked.brake) return finish('waiting_platform', 'usage_brake');
      if (current.status === 'paused') return finish('paused', 'workspace_paused');
      if (!samePlan(row, current) || !reviewed(current) || (row.version===1?!bindingMatches(row):row.providerBinding.accountSid!==(process.env.TWILIO_ACCOUNT_SID||''))) return finish('needs_review', 'workspace_changed');
      let facts = await deps.statuses(current), currentOffer = row.version===1?legacyQuote(current,facts):null;
      if(row.version===1){if (!currentOffer) return finish('waiting_platform', 'service_unavailable');if (currentOffer.digest !== row.offer.digest) return finish('needs_review', 'terms_changed');}
      const ids = childIds(current);
      for (const kind of ['number', ...row.requestedChannels]) {
        if (deps.now() >= deadlineAt) return finish('connecting', 'worker_deadline');
        const checked = await latest();
        if (row.cancelRequestedAt) return finish('cancellation_pending');
        if (checked.brake || !samePlan(row, current) || !reviewed(current) || (row.version===1?!bindingMatches(row):row.providerBinding.accountSid!==(process.env.TWILIO_ACCOUNT_SID||''))) return finish(checked.brake ? 'waiting_platform' : 'needs_review', checked.brake ? 'usage_brake' : 'workspace_changed');
        facts = await deps.statuses(current); currentOffer = row.version===1?legacyQuote(current,facts):null;
        if (row.version===1&&(!currentOffer || currentOffer.digest !== row.offer.digest)) return finish(currentOffer ? 'needs_review' : 'waiting_platform', currentOffer ? 'terms_changed' : 'service_unavailable');
        if (kind !== 'number' && (facts.number.operation?.id !== ids.number || facts.number.operation?.state !== 'number_acquired' || facts.number.operation?.cancellationRequested || facts.number.operation?.releaseConfirmed)) return finish('awaiting_number');
        let child = await deps.readChild(kind, ids[kind]);
        // Renew only the exact worker-confirmed, unpurchased child retained by
        // this new owner approval. The number engine conditionally replaces it.
        if (kind === 'number' && row.numberRenewal && child && canRenewUnpurchasedPhone(child)) {
          const { generation, ...reference } = row.numberRenewal;
          if (digest(phoneRenewalReference(child)) === digest(reference)) child = null;
        }
        if (child && !row.steps[kind]?.startedAt) return finish('needs_review', 'standalone_child_conflict');
        if (child && !childMatches(kind, child, row)) return finish('needs_review', 'child_identity_conflict');
        if (!child) {
          const permission=row.version===2?childPermission(kind,row,facts):null;
          if(permission){if(kind==='number')return finish(permission==='service_unavailable'?'waiting_platform':'needs_review',permission);continue;}
          let invoked = false;
          try {
          await atomicUpdate(QUEUE, KEY, async value => { const queue = queueValue(value), entry = queue.intents[row.id],plan=await strictRead(STORE,row.id);if(!ownsClaim(plan)||row.version===2&&entry?.admission?.admissionSequence!==claimed.sequence){workerStale=true;throw stale();} if (!entry || entry.tenantIdentity !== row.tenantIdentity || entry.admission?.generation !== claimed.generation || entry.cancelRequestedAt) throw new ServiceOnboardingError('setup_changed', 'This setup request changed before handoff.'); return { value: { ...queue, intents: { ...queue.intents, [row.id]: { ...entry, dispatchStartedAt: entry.dispatchStartedAt || stamp(), dispatches: { ...entry.dispatches, [kind]: { id: ids[kind], startedAt: stamp() } } } } } }; });
          await saveStep(kind, { id: ids[kind], startedAt: row.steps[kind]?.startedAt || stamp() });
          const finalCheck = await latest();
          if (row.cancelRequestedAt) { await clearPrepared(kind); return finish('cancellation_pending'); }
          if (finalCheck.brake || !samePlan(row, current) || !reviewed(current) || (row.version===1?!bindingMatches(row):row.providerBinding.accountSid!==(process.env.TWILIO_ACCOUNT_SID||''))) { await clearPrepared(kind); return finish(finalCheck.brake ? 'waiting_platform' : 'needs_review', finalCheck.brake ? 'usage_brake' : 'workspace_changed'); }
          const lastFacts=await deps.statuses(current),lastOffer=row.version===1?legacyQuote(current,lastFacts):null;
          const finalPermission=row.version===2?childPermission(kind,row,lastFacts):!lastOffer?'service_unavailable':lastOffer.digest!==row.offer.digest?'terms_changed':null;
          if(finalPermission){await clearPrepared(kind);if(kind==='number'||row.version===1)return finish(finalPermission==='service_unavailable'?'waiting_platform':'needs_review',finalPermission);continue;}
          const finalOwner = await latest();
          if (row.cancelRequestedAt) { await clearPrepared(kind); return finish('cancellation_pending'); }
          if (finalOwner.brake || !samePlan(row, current) || !reviewed(current) || (row.version===1?!bindingMatches(row):row.providerBinding.accountSid!==(process.env.TWILIO_ACCOUNT_SID||''))) { await clearPrepared(kind); return finish(finalOwner.brake ? 'waiting_platform' : 'needs_review', finalOwner.brake ? 'usage_brake' : 'workspace_changed'); }
          const body = { actor: row.authority.actor, expectedRevision: row.inputRevision };
          invoked = true;
          if (kind === 'number') await deps.requestNumber(current, { ...body, submissionId: hash(row.id + ':number'), offerVersion: row.offer.number.version, offerDigest: row.offer.number.digest, acceptedCosts: true, authority: true, serviceOnboarding: { id: row.id, generation: row.generation, admissionSequence: row.admissionSequence || null } });
          else if (kind === 'voice') await deps.requestVoice(current, { ...body, acceptedAuthority: true, policyVersion: row.offer.voice.version, policyDigest: row.offer.voice.digest, forwardingMode: row.forwardingMode });
          else await deps.requestMessaging(current, { ...body, submissionId: hash(row.id + ':sms'), offerVersion: row.offer.messaging.version, offerDigest: row.offer.messaging.digest, programDigest: row.offer.program.digest, acceptedCosts: true, authority: true, attestLegalAccuracy: true, attestConsent: true, testPhoneConsent: true, legal: unseal(row.privateData, row.id) });
          } catch (error) { if (!invoked) await clearPrepared(kind); throw error; }
          child = await deps.readChild(kind, ids[kind]);
          if (!child || !childMatches(kind, child, row)) return finish('uncertain', 'child_request_unconfirmed');
        }
        const firstAcknowledgment = !row.steps[kind]?.acknowledgedAt;
        await saveStep(kind, { id: ids[kind], acknowledgedAt: row.steps[kind]?.acknowledgedAt || stamp() });
        if (kind === 'voice' && firstAcknowledgment) hints.voiceRequested = true;
        if (kind === 'sms' && firstAcknowledgment) hints.messagingRequested = true;
      }
      await latest(); if (row.cancelRequestedAt) return finish('cancellation_pending');
      facts = await deps.statuses(current);
      const active = row.requestedChannels.every(channel => (channel === 'sms' ? facts.messaging : facts.voice).active === true);
      const action = row.requestedChannels.some(channel => ['needs_action', 'needs_review', 'blocked', 'failed', 'awaiting_test', 'ready'].includes((channel === 'sms' ? facts.messaging : facts.voice).state));
      const blocked=row.version===2?row.requestedChannels.map(channel=>childPermission(channel,row,facts)).filter(Boolean):[];
      return finish(active?'active':blocked.some(reason=>reason!=='service_unavailable')?'needs_review':action?'needs_action':blocked.length?'waiting_platform':'connecting',blocked[0]||null);
    } catch (error) { return finish(row.cancelRequestedAt ? 'cancellation_pending' : error instanceof ServiceOnboardingError ? 'needs_review' : 'uncertain', error instanceof ServiceOnboardingError ? error.code : 'service_request_unconfirmed'); }
  }
  async function recover({ limit = 1, deadlineAt = deps.now() + 12000, excludeIds = [] } = {}) {
    if (limit !== 1 || !Number.isFinite(deadlineAt) || deadlineAt <= deps.now() || deadlineAt > deps.now() + 15000 || !Array.isArray(excludeIds) || excludeIds.length > 5 || new Set(excludeIds).size !== excludeIds.length || excludeIds.some(id => !validId(id))) throw new ServiceOnboardingError('invalid_deadline', 'Service setup recovery handles one workspace at a time within its wave.', 400);
    const excluded = new Set(excludeIds);
    const selected = await atomicUpdate(QUEUE, KEY, value => { const queue = queueValue(value), ids = Object.keys(queue.intents).filter(id => !excluded.has(id)).sort(); if (!ids.length) return { result: null }; const id = ids.find(id => id > queue.cursor) || ids[0]; return { value: { ...queue, cursor: id }, result: queue.intents[id] }; });
    if (!selected) return { ok: true, processed: 0, voiceRequested: false, messagingRequested: false, outcomes: [] };
    try {
    const c = await strictRead('clients', selected.slug);
    if (!c || !isSupportedSelfServiceClient(c) || tenant(c) !== selected.tenantIdentity) return { ok: false, processed: 0, visitedId: selected.id, voiceRequested: false, messagingRequested: false, reasonCode: 'setup_receipt_unavailable', outcomes: [] };
    await ensure(c);
    const result = await continueOne(c, { deadlineAt });
    // Private selection metadata is consumed only by the bounded scheduler. It
    // must not be copied into public/health receipts.
    return { ok: result.ok, processed: 1, visitedId: selected.id, voiceRequested: result.voiceRequested, messagingRequested: result.messagingRequested, outcomes: [{ state: result.state, reasonCode: result.operation?.reasonCode || null }], dispatch: result.voiceRequested || result.messagingRequested ? { slug: c.slug, tenant: tenant(c), voiceRequested: result.voiceRequested, messagingRequested: result.messagingRequested } : null };
    } catch { return { ok: false, processed: 0, visitedId: selected.id, voiceRequested: false, messagingRequested: false, reasonCode: 'setup_receipt_unavailable', outcomes: [] }; }
  }
  async function health() {
    const queue = queueValue(await strictRead(QUEUE, KEY)), entries = Object.values(queue.intents), partial = entries.length > INSPECTION_CAPACITY;
    const inspected = entries.slice(0, INSPECTION_CAPACITY), actualRows = await Promise.all(inspected.map(entry => strictRead(STORE, entry.id)));
    const rows = actualRows.map((row, index) => row || inspected[index].admission), missing = actualRows.filter((row, index) => !row && (inspected[index].dispatchStartedAt || !inspected[index].admission)).length;
    const pending = rows.filter(row => row && !['active', 'cancelled'].includes(row.state));
    const unresolved = pending.filter(row => row.state === 'uncertain' || row.state === 'cancellation_pending' && row.reasonCode).length;
    const waitingCustomer = pending.filter(row => ['needs_review', 'needs_action', 'paused'].includes(row.state)).length;
    const automatic = pending.filter(row => !['needs_review', 'needs_action', 'paused'].includes(row.state));
    const stale = automatic.filter(row => !Number.isFinite(Date.parse(row.updatedAt)) || deps.now() - Date.parse(row.updatedAt) > 25 * 60000).length;
    const last = await strictRead('health', 'serviceOnboarding:lastRun'), fresh = last && Number.isFinite(Date.parse(last.at)) && deps.now() - Date.parse(last.at) <= 25 * 60000;
    const failure = fresh && last.ok === false, overdueWithoutWorker = automatic.some(row => !Number.isFinite(Date.parse(row.createdAt)) || deps.now() - Date.parse(row.createdAt) > 25 * 60000) && !fresh;
    const ok = !partial && !missing && !unresolved && !stale && !failure && !overdueWithoutWorker;
    return { ok: !!ok, total: entries.length, inspected: rows.length, pending: pending.length, missing, unresolved, stale, waitingCustomer, scope: 'bounded_candidates',
      lastRunAt: last?.at || null, reasonCode: partial ? 'service_setup_scope_partial' : missing ? 'service_setup_receipt_missing' : unresolved ? 'service_setup_uncertain' : stale ? 'service_setup_stale' : failure ? 'service_setup_worker_failed' : overdueWithoutWorker ? 'service_setup_worker_stale' : null };
  }
  return { status, request, cancel, continue: continueOne, recover, health };
}

export function createServiceOnboardingEngine(options = {}) {
  let fixture = false; try { fixture = process.env.NODE_ENV === 'test' && process.env.MC_MEMORY_STORE === '1' && process.env.MC_FAKE_MODEL === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.URL).hostname); } catch {}
  if (!fixture) throw new ServiceOnboardingError('fixture_only', 'Injected service setup is available only in isolated local checks.', 503);
  return engine(options);
}
export const serviceOnboardingStatus = c => engine().status(c);
export const requestServiceOnboarding = (c, body, options) => engine().request(c, body, options);
export const cancelServiceOnboarding = (c, body) => engine().cancel(c, body);
export const continueServiceOnboarding = (c, options) => engine().continue(c, options);
export const recoverServiceOnboardings = options => engine().recover(options);
export const serviceOnboardingHealth = () => engine().health();
