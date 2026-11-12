import { assertPaidServiceAuthority } from './paid-service-authority.mjs';
// Durable managed voice setup. Vapi creation, import and Twilio routing each
// have a stored intent and separately retained resource/readback receipt.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { reservePaidUsage, assertPaidUsage, assertPaidUsageContinuation, attemptPaidUsage, settlePaidUsage, paidUsageStatus, PaidUsageError } from './usage.mjs';
import { strictRead, normalizeAccountEmail } from "./accounts.mjs";
import { configurationRevision, isSupportedSelfServiceClient, managedServiceRulesReviewed } from "./setup.mjs";
import { serviceLifecycle as life, serviceLifecycleMatches } from './service-lifecycle.mjs';
import { getAcquiredPhoneResource, claimPhoneResourceDependency, clearPhoneResourceDependency, getPhoneResourceLifecycle, phoneServiceOnboardingActive, phoneServiceOnboardingCancellationRequested, voiceHasNumberUse, voiceNumberCancellationContext, releaseFencedVoiceNumberDependency, voiceCleanupMaintenanceContext } from "./phone-activation.mjs";
import { createManagedVoiceProvider, managedAssistantBody, voiceProviderFailure, voiceMutationWasNotDispatched } from "./voice-provider.mjs";
import { confirmedVoiceCreateRejection } from "./voice-provider-evidence.mjs";
import { requestManagedHuman, handleManagedHumanCallback } from './managed-voice-handoff.mjs';

export class VoiceActivationError extends Error { constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; } }
const STORE = "voice_activation_intents", QUEUE = "voice_activation_queue", KEY = "active_v1", CALLS = "managed_voice_calls", CALLBACKS = "managed_voice_callbacks";
const hash = value => createHash("sha256").update(value).digest("hex"), iso = () => new Date().toISOString();
const tenant = c => hash(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)]));
const idFor = c => c.slug + "/" + hash("managed-voice-v1:" + tenant(c));
const validId = value => /^[a-z0-9][a-z0-9-]{0,39}\/[a-f0-9]{64}$/.test(value || "");
const validNumber = value => /^\+1\d{10}$/.test(value || "");
const safeFallback = c => validNumber(c.owner?.phone) && c.owner.phone !== c.phone?.businessNumber && c.owner.phone !== c.phone?.twilioNumber ? c.owner.phone : null;
function validatePolicy(policy) {
  if (!policy || Object.keys(policy).some(key => !["version", "model", "maxDurationSeconds", "maxDailyCalls", "maxDailyMinutes", "accountDailyCalls", "accountDailyMinutes", "authorityText", "usageDisclosure", "voiceProvider", "voiceId"].includes(key)) || !/^[a-z0-9_-]{1,80}$/.test(policy.version || "") || !Number.isInteger(policy.maxDurationSeconds) || policy.maxDurationSeconds < 60 || policy.maxDurationSeconds > 900 || !/^[a-z0-9_.-]{3,100}$/i.test(policy.model || "") || ![policy.authorityText, policy.usageDisclosure].every(value => typeof value === "string" && value.length >= 20 && value.length <= 1000) || (!!policy.voiceProvider !== !!policy.voiceId) || ![policy.maxDailyCalls, policy.maxDailyMinutes, policy.accountDailyCalls, policy.accountDailyMinutes].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 100000) || policy.maxDailyCalls > 1000 || policy.accountDailyCalls > 10000 || policy.maxDailyCalls > policy.accountDailyCalls || policy.maxDailyMinutes > policy.accountDailyMinutes || policy.maxDailyMinutes * 60 < policy.maxDurationSeconds) throw new VoiceActivationError("policy_unavailable", "Phone usage terms are not available yet.");
  return structuredClone(policy);
}
const digest = value => hash(JSON.stringify(value));
function productionPolicy() {
  try { const policy = validatePolicy(JSON.parse(process.env.VOICE_ACTIVATION_POLICY_JSON || "null"));
    const fallback = new URL(process.env.VOICE_FALLBACK_TWIML_URL || "");
    return { policy, enabled: process.env.VOICE_ACTIVATION_ENABLED === "true" && process.env.VOICE_ACTIVATION_APPROVED_VERSION === policy.version && (process.env.SERVICE_WORKER_KEY || "").length >= 32 && !!process.env.VAPI_API_KEY && /^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || "") && !!process.env.TWILIO_AUTH_TOKEN && (process.env.VAPI_WEBHOOK_SECRET || "").length >= 32 && fallback.protocol === "https:" && fallback.hostname === "handler.twilio.com" && /^\/twiml\/EH[a-f0-9]{32}$/i.test(fallback.pathname) && !fallback.search && !fallback.hash && !fallback.username && !fallback.password && !fallback.port };
  } catch { return { policy: null, enabled: false }; }
}
function siteUrl() {
  const raw = process.env.URL || "https://machinesandcloud.com", url = new URL(raw);
  const fixture = process.env.NODE_ENV === "test" && process.env.MC_FAKE_MODEL === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!fixture && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid voice site URL");
  return url.origin;
}
function queueValue(value) { if (!value) return { version: 1, intents: {}, cursor: "" }; if (value.version !== 1 || !value.intents || typeof value.intents !== "object" || Array.isArray(value.intents)) throw new Error("Voice queue unavailable"); return value; }
async function enqueue(row) {
  await atomicUpdate(QUEUE, KEY, value => { const queue = queueValue(value); if (!queue.intents[row.id] && Object.keys(queue.intents).length >= 25) throw new VoiceActivationError("voice_capacity_full", "Phone setup is at capacity. Your workspace is saved; no phone resource was created.", 503);
    return { value: { ...queue, intents: { ...queue.intents, [row.id]: structuredClone(row) } } }; });
}
async function change(id, update) {
  return atomicUpdate(STORE, id, async current => { if (!current) throw new Error("Voice intent missing"); const next = await update(current); if (!next) return { result: current }; const value = { ...next, updatedAt: iso() }; return { value, result: value }; });
}
const stageReason = row => row.reasonCode || null;
export function voiceActivationView(row, c) {
  const current = !!c && row.tenantIdentity === tenant(c) && row.inputRevision === configurationRevision(c) && serviceLifecycleMatches(c, row.lifecycle) && ["testing", "live"].includes(c.status);
  const evidence = row.evidence || {}, forwarded = row.forwardingMode === "use_new_number" || !!evidence.forwardedAt;
  const active = current && row.state === "ready" && !!row.routing?.confirmed && !!evidence.successfulCallAt && evidence.latestCallOutcome !== "failed" && forwarded;
  const state = !current && row.state === "ready" ? "needs_review" : active ? "active" : row.state;
  const detail = ({ queued: "Your phone request is saved. Setup will continue automatically when phone service is available.", waiting_platform: "Your approval is saved. Phone service is not available yet; calls are not active.", waiting_number: "Your phone setup is waiting for the reserved number.", creating_assistant: "Preparing your phone assistant from your reviewed business rules.", importing_number: "Connecting your reserved number to the phone assistant.", configuring_routing: "Checking call routing and the fallback destination.", uncertain: "A provider response is being checked. Setup will not create another resource blindly.", needs_review: "Phone answering is stopped until your current business rules and setup can be confirmed.", suspended: "AI phone answering is stopped. Your recorded resources are retained.", cleanup_pending: "Phone cancellation is saved. Recorded resources are waiting for confirmed cleanup.", cleanup_uncertain: "Phone answering is stopped. Provider cleanup is being checked; resource receipts are retained.", cancelled: "AI phone answering is cancelled. Resource receipts are retained for confirmed cleanup.", ready: forwarded ? "The route is connected. Place a short test call to confirm phone answering." : "The route is connected. Forward your business line, then place a short test call to confirm it.", active: "Phone answering has a verified call and current business rules.", failed: "Phone setup needs attention. Recorded resources are retained." })[state] || "Phone setup is being checked.";
  return { id: row.id, state, active, ready: current && row.state === "ready" && row.routing?.confirmed === true, detail, reasonCode: stageReason(row), number: row.number?.number || null, forwardingMode: row.forwardingMode,
    createdAt: row.createdAt, updatedAt: row.updatedAt, routingCheckedAt: row.routing?.checkedAt || null, resourceRecorded: !!(row.assistant?.id || row.imported?.id), evidence: { inboundAt: evidence.inboundAt || null, forwardedAt: evidence.forwardedAt || null, successfulCallAt: evidence.successfulCallAt || null, fallbackConfigured: row.routing?.fallbackConfigured === true, fallbackObservedAt: evidence.fallbackObservedAt || null, fallbackAnsweredAt: evidence.fallbackAnsweredAt || null, fallbackDialStatus: evidence.fallbackDialStatus || null, fallbackDialAt: evidence.fallbackDialAt || null, lastFailureAt: evidence.lastFailureAt || null } };
}
const reviewed = managedServiceRulesReviewed;
async function ownerCurrent(c, body) {
  if (!isSupportedSelfServiceClient(c) || body.actor?.role !== "owner" || normalizeAccountEmail(body.actor.email) !== normalizeAccountEmail(c.owner?.email)) throw new VoiceActivationError("forbidden", "The verified owner must approve phone setup.", 403);
  const current = await strictRead("clients", c.slug);
  if (!current || !isSupportedSelfServiceClient(current) || tenant(current) !== tenant(c)) throw new VoiceActivationError("workspace_unavailable", "This workspace is unavailable.");
  if (body.expectedRevision !== configurationRevision(current)) throw new VoiceActivationError("configuration_changed", "Review your current business rules before connecting phone service.");
  if (!["testing", "live"].includes(current.status) || !reviewed(current) || !validNumber(current.owner?.phone)) throw new VoiceActivationError("setup_incomplete", "Review your complete current business details and add a valid owner phone first.");
  return current;
}
function fixtureContext() { try { return process.env.NODE_ENV === "test" && process.env.MC_FAKE_MODEL === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.URL).hostname); } catch { return false; } }
async function saveVoiceCancellation(c, body = {}) {
  if (!isSupportedSelfServiceClient(c) || body.actor?.role !== "owner" || normalizeAccountEmail(body.actor.email) !== normalizeAccountEmail(c.owner?.email)) throw new VoiceActivationError("forbidden", "The verified owner must cancel phone setup.", 403);
  const current = await strictRead("clients", c.slug);
  if (!current || tenant(current) !== tenant(c) || configurationRevision(current) !== body.expectedRevision) throw new VoiceActivationError("configuration_changed", "Refresh your workspace before cancelling phone setup.");
  const row = await change(idFor(c), old => old.cancelRequestedAt ? null : { ...old, cancelRequestedAt: iso(), cancellationActor: { role: "owner", email: normalizeAccountEmail(body.actor.email) }, state: "cleanup_pending", reasonCode: null });
  if (!row.cleanupConfirmedAt) await enqueue(row); return voiceActivationView(row, current);
}
export function createVoiceActivationEngine(options) { if (!fixtureContext()) throw new VoiceActivationError("fixture_only", "Injected providers are available only in isolated tests.", 503); return voiceEngine(options); }
function voiceEngine({ provider, policy: rawPolicy, gate = false, acquiredNumber = getAcquiredPhoneResource, claimDependency = claimPhoneResourceDependency, clearDependency = clearPhoneResourceDependency, phoneLifecycle = getPhoneResourceLifecycle, cleanupMaintenance = false } = {}) {
  const policy = validatePolicy(rawPolicy), policyDigest = digest(policy), enabled = () => typeof gate === "function" ? gate() === true : gate === true;
  if (!provider || !["createAssistant", "lookupAssistant", "updateAssistant", "verifyAssistant", "importNumber", "lookupNumber", "readImportedRoute", "configureRouting", "verifyRouting", "detachRouting", "deleteImportedNumber", "deleteAssistant"].every(key => typeof provider[key] === "function")) throw new Error("Complete voice provider adapters required");
  const offer = () => ({ ...structuredClone(policy), digest: policyDigest, available: enabled() });
  async function request(c, body = {}, options = {}) {
    const current = await ownerCurrent(c, body);
    if (body.acceptedAuthority !== true || body.policyVersion !== policy.version || body.policyDigest !== policyDigest || !["forward_business_line", "use_new_number"].includes(body.forwardingMode)) throw new VoiceActivationError("acceptance_required", "Review phone usage terms and confirm your authority before continuing.", 400);
    if (body.forwardingMode === "forward_business_line" && (!validNumber(current.phone?.businessNumber) || current.phone.businessNumber === current.owner?.phone)) throw new VoiceActivationError("unsafe_forwarding", "Add your business line and a separate owner cell before forwarding calls.", 400);
    const id = idFor(current), existing = await strictRead(STORE, id);
    if (existing?.cancelRequestedAt) throw new VoiceActivationError("cancellation_pending", "A cancelled phone setup cannot be restarted here.");
    if (existing?.tenantIdentity && existing.tenantIdentity !== tenant(current)) throw new VoiceActivationError("identity_conflict", "Phone setup identity changed.");
    const row = existing && existing.inputRevision === body.expectedRevision && serviceLifecycleMatches(current, existing.lifecycle) && existing.policyDigest === policyDigest && existing.forwardingMode === body.forwardingMode ? existing : {
      ...(existing || {}), version: 1, id, slug: current.slug, tenantIdentity: tenant(current), inputRevision: body.expectedRevision, lifecycle: life(current), correlationId: existing?.correlationId || hash("voice-correlation:" + id), callbackToken: existing?.callbackToken || randomBytes(32).toString("hex"),
      createdAt: existing?.createdAt || iso(), updatedAt: iso(), state: enabled() ? "queued" : "waiting_platform", policy, policyDigest, forwardingMode: body.forwardingMode, forwardingBusinessNumber: current.phone?.businessNumber || null,
      authority: { actor: { role: "owner", email: normalizeAccountEmail(body.actor.email) }, at: iso(), policyVersion: policy.version, policyDigest, acceptedAuthority: true },
      generation: (existing?.generation || 0) + 1, claim: null, reasonCode: null, routing: null, evidence: {}, assistantUpdateStartedAt: null,
    };
    // The recovery index is written before the primary intent. Its id is stable;
    // an orphaned index remains visible as unhealthy instead of being discarded.
    if(options.beforeAdmission)await options.beforeAdmission(current);
    await enqueue(row);
    const saved = await atomicUpdate(STORE, id, prior => {
      if (prior && existing && prior.generation !== existing.generation) return { result: prior };
      if (prior && !existing) return { result: prior };
      return { value: row, result: row };
    });
    await atomicUpdate(CALLBACKS, saved.callbackToken, prior => prior && prior.id !== saved.id ? (() => { throw new Error("Voice callback conflict"); })() : { value: { id: saved.id, slug: saved.slug, tenantIdentity: saved.tenantIdentity } });
    return voiceActivationView(saved, current);
  }
  async function valid(row, { includeGate = true } = {}) {
    const c = await strictRead("clients", row.slug);
    const parent = c && row.number ? await phoneLifecycle(c) : null;
    return c && !row.cancelRequestedAt && !row.numberUseFenced && isSupportedSelfServiceClient(c) && tenant(c) === row.tenantIdentity && ["testing", "live"].includes(c.status) && row.inputRevision === configurationRevision(c) && serviceLifecycleMatches(c, row.lifecycle) && row.policyDigest === policyDigest && reviewed(c) && validNumber(c.owner?.phone) && (!row.number || parent?.state === "number_acquired" && !parent.cancellationRequested && parent.resource?.id === row.number.id) && (!includeGate || enabled()) && await phoneServiceOnboardingActive(c) ? c : null;
  }
  async function args(row, token) {
    const client = await valid(row), authorizeDispatch = async () => {
      const latest = await strictRead(STORE, row.id);
      try{await assertPaidServiceAuthority(client,'voice');}catch{return false;}
      return latest?.claim?.token === token && latest.generation === row.generation && Date.parse(latest.claim.until)>Date.now() && !!await valid(latest) && Date.parse(latest.claim.until)>Date.now();
    };
    if (!client) throw new VoiceActivationError("dispatch_not_authorized", "Phone setup changed.");
    return { client, correlationId: row.correlationId, inputRevision: row.inputRevision, policy: row.policy, site: siteUrl(), number: row.number, fallbackNumber: safeFallback(client), callbackToken: row.callbackToken, authorizeDispatch, phoneNumberId: row.imported?.id, savedVapiUrl: row.importedRoute?.vapiUrl };
  }
  async function receipt(row, token, patch) {
    // Receipts are retained even if a pause/cancel landed while the provider
    // request was in flight. They cannot activate the customer or overwrite facts.
    return change(row.id, current => {
      if (current.claim?.token !== token || current.generation !== row.generation) {
        const late = { at: iso(), generation: row.generation, ...patch };
        return { ...current, lateReceipts: [...(current.lateReceipts || []), late].slice(-20) };
      }
      return { ...current, ...patch, ...(current.cancelRequestedAt ? { state: "cleanup_pending" } : {}), pendingMutationDispatch:null, claim: null, reasonCode: patch.reasonCode || null };
    });
  }
  async function cancel(c, body = {}) {
    return saveVoiceCancellation(c, body);
  }
  async function cleanup(row, c) {
    if (row.cleanupConfirmedAt) { if (row.number) await clearDependency(c, { kind: "voice", operationId: row.id, cleanupConfirmed: true }); await atomicUpdate(QUEUE, KEY, value => { const queue = queueValue(value), intents = { ...queue.intents }; delete intents[row.id]; return { value: { ...queue, intents } }; }); return voiceActivationView(row, c); }
    const maintenance = await voiceNumberCancellationContext(c, row), providerMaintenance = cleanupMaintenance && !!await voiceCleanupMaintenanceContext(c,row);
    const rejectedCreate = await confirmedVoiceCreateRejection(c,row);
    if (!enabled() && !maintenance && !providerMaintenance && !rejectedCreate) return voiceActivationView(await change(row.id, old => ({ ...old, state: old.assistantCreateStartedAt && !old.assistant ? "cleanup_uncertain" : "cleanup_pending", reasonCode: "product_gate_closed" })), c);
    if (row.claim && Date.parse(row.claim.until) > Date.now()) return voiceActivationView(row, c);
    const token = randomBytes(16).toString("hex");
    row = await change(row.id, old => old.claim && Date.parse(old.claim.until) > Date.now() ? null : { ...old, claim: { token, until: new Date(Date.now() + 60000).toISOString() }, state: "cleanup_pending" });
    if (row.claim?.token !== token) return voiceActivationView(row, c);
    // Persist the one-way number-use stop before releasing a dependency. An
    // uncertain assistant alone cannot use the number; any import marker or
    // late import receipt prevents this exception from being granted.
    row = await change(row.id, async old => {
      if (old.claim?.token !== token || !(Date.parse(old.claim.until)>Date.now()) || old.generation !== row.generation || voiceHasNumberUse(old)) return null;
      const context = await voiceNumberCancellationContext(c, old);
      if (!context || !(Date.parse(old.claim.until)>Date.now()) || old.numberUseFenced) return null;
      return { ...old, numberUseFenced: { ...context, at: iso() } };
    });
    if (row.numberUseFenced) await releaseFencedVoiceNumberDependency(c, row.id);
    if (rejectedCreate) {
      row = await change(row.id, async old => old.claim?.token === token && Date.parse(old.claim.until)>Date.now() && await confirmedVoiceCreateRejection(c,old) ? { ...old, state:"cancelled", cleanupConfirmedAt:iso(), claim:null, reasonCode:null } : null);
      if (row.cleanupConfirmedAt) {
        if (row.number) await clearDependency(c,{kind:"voice",operationId:row.id,cleanupConfirmed:true});
        await atomicUpdate(QUEUE,KEY,value=>{const queue=queueValue(value),intents={...queue.intents};delete intents[row.id];return {value:{...queue,intents}};});
      }
      return voiceActivationView(row,c);
    }
    if (!enabled() && !providerMaintenance) {
      if (!row.assistantCreateStartedAt && !row.assistant && !voiceHasNumberUse(row)) {
        row = await change(row.id, old => old.claim?.token === token && !old.assistantCreateStartedAt && !old.assistant && !voiceHasNumberUse(old) ? { ...old, state: "cancelled", cleanupConfirmedAt: iso(), claim: null, reasonCode: null } : null);
        if (row.cleanupConfirmedAt) await atomicUpdate(QUEUE, KEY, value => { const queue=queueValue(value),intents={...queue.intents};delete intents[row.id];return {value:{...queue,intents}}; });
      } else row = await change(row.id, old => old.claim?.token === token ? { ...old, state: "cleanup_uncertain", claim: null, reasonCode: "voice_cleanup_unconfirmed" } : null);
      return voiceActivationView(row, c);
    }
    const authorizeDispatch = async () => { const current = await strictRead(STORE, row.id); return !!current?.cancelRequestedAt && current.generation===row.generation && current.claim?.token === token && Date.parse(current.claim.until)>Date.now() && (enabled() || cleanupMaintenance && !!await voiceCleanupMaintenanceContext(c,current)) && Date.parse(current.claim.until)>Date.now(); };
    const call = { client: c, correlationId: row.correlationId, inputRevision: row.inputRevision, policy: row.policy, site: siteUrl(), number: row.number, fallbackNumber: safeFallback(c), callbackToken: row.callbackToken, phoneNumberId: row.imported?.id, savedVapiUrl: row.importedRoute?.vapiUrl, authorizeDispatch, maintenanceOnly: !enabled() && providerMaintenance, maintenanceClaimToken: token };
    try {
      if (row.assistantCreateStartedAt && !row.assistant) { const found = await provider.lookupAssistant(call); if (found.status !== "found") throw new Error("Assistant creation unconfirmed"); return voiceActivationView(await receipt(row, token, { assistant: { ...found.resource, recordedAt: iso() } }), c); }
      if (row.importStartedAt && !row.imported) { const found = await provider.lookupNumber(call); if (found.status !== "found") throw new Error("Import creation unconfirmed"); return voiceActivationView(await receipt(row, token, { imported: { ...found.resource, recordedAt: iso() } }), c); }
      if (row.number && row.importStartedAt && !row.routingDetachedAt && !call.maintenanceOnly) { const detached = await provider.detachRouting(call); if (!detached.confirmed) throw new Error("Routing detachment unconfirmed"); return voiceActivationView(await receipt(row, token, { routingDetachedAt: iso() }), c); }
      const knownImports = [row.imported, ...(row.lateReceipts || []).map(item => item.imported)].filter(Boolean), knownAssistants = [row.assistant, ...(row.lateReceipts || []).map(item => item.assistant)].filter(Boolean);
      const missingImport = knownImports.find(resource => !(row.cleanupReceipts?.imports || []).includes(resource.id));
      if (missingImport) { const deleted = await provider.deleteImportedNumber({ ...call, resourceId: missingImport.id }); if (!deleted.confirmed || deleted.resourceId !== missingImport.id) throw new Error("Import deletion unconfirmed"); return voiceActivationView(await receipt(row, token, { cleanupReceipts: { ...row.cleanupReceipts, imports: [...(row.cleanupReceipts?.imports || []), missingImport.id] } }), c); }
      const missingAssistant = knownAssistants.find(resource => !(row.cleanupReceipts?.assistants || []).includes(resource.id));
      if (missingAssistant) { const deleted = await provider.deleteAssistant({ ...call, resourceId: missingAssistant.id }); if (!deleted.confirmed || deleted.resourceId !== missingAssistant.id) throw new Error("Assistant deletion unconfirmed"); return voiceActivationView(await receipt(row, token, { cleanupReceipts: { ...row.cleanupReceipts, assistants: [...(row.cleanupReceipts?.assistants || []), missingAssistant.id] } }), c); }
      row = await change(row.id, old => old.claim?.token === token ? { ...old, state: "cancelled", cleanupConfirmedAt: iso(), claim: null, reasonCode: null } : null);
      // Claiming the dependency can commit before its child projection fails.
      // Clearing the matching parent CAS is safe even when our local claimedAt
      // acknowledgment was lost; absence is already confirmed above.
      if (row.cleanupConfirmedAt && row.number) await clearDependency(c, { kind: "voice", operationId: row.id, cleanupConfirmed: true });
      if (row.cleanupConfirmedAt) await atomicUpdate(QUEUE, KEY, value => { const queue = queueValue(value), intents = { ...queue.intents }; delete intents[row.id]; return { value: { ...queue, intents } }; });
      return voiceActivationView(row, c);
    } catch (error) { const failure = voiceProviderFailure(error); return voiceActivationView(await change(row.id, old => old.claim?.token === token ? { ...old, state: "cleanup_uncertain", reasonCode: "voice_cleanup_unconfirmed", ...(failure ? { providerFailure: failure } : {}), claim: null } : null), c); }
  }
  async function run(id) {
    if (!validId(id)) throw new VoiceActivationError("not_found", "Phone setup was not found.", 404);
    let row = await strictRead(STORE, id); if (!row) throw new VoiceActivationError("not_found", "Phone setup was not found.", 404);
    const actualClient = await strictRead("clients", row.slug);
    if (!actualClient || tenant(actualClient) !== row.tenantIdentity) return voiceActivationView(await change(id, old => ({ ...old, state: "needs_review", reasonCode: "workspace_unavailable" })), actualClient);
    const parent = row.number ? await phoneLifecycle(actualClient, row.number.intentId) : null, serviceCancellation = await phoneServiceOnboardingCancellationRequested(actualClient);
    if (!row.cancelRequestedAt && (["cancelled", "archived"].includes(actualClient.status) || parent?.cancellationRequested || serviceCancellation)) row = await change(id, old => ({ ...old, state: "cleanup_pending", cancelRequestedAt: iso(), cancellationReason: parent?.cancellationRequested || serviceCancellation ? "parent_number_cancelled" : "workspace_cancelled" }));
    if (row.cancelRequestedAt) return cleanup(row, actualClient);
    // Owner edits and ordinary testing/live/pause/resume transitions can adopt
    // a fresh generation once the SAME accepted policy and current private
    // review/test proof are present. Reuse recorded resources and all uncertain
    // create evidence; never mint a replacement or replay a create here.
    if (isSupportedSelfServiceClient(actualClient) && ["testing","live"].includes(actualClient.status) && reviewed(actualClient) && validNumber(actualClient.owner?.phone) && row.authority?.acceptedAuthority === true && row.policyDigest === policyDigest && parent?.state === "number_acquired" && !parent.cancellationRequested && parent.resource?.id === row.number?.id && row.assistant?.id && row.imported?.id && row.importedRoute?.vapiUrl && (row.inputRevision !== configurationRevision(actualClient) || !serviceLifecycleMatches(actualClient, row.lifecycle))) {
      const previousGeneration = row.generation, inputRevision = configurationRevision(actualClient), rulesChanged = row.inputRevision !== inputRevision, forwardingChanged = row.forwardingBusinessNumber !== (actualClient.phone?.businessNumber || null);
      row = await change(id, old => old.generation === previousGeneration && !old.cancelRequestedAt ? { ...old, generation: old.generation + 1, inputRevision, lifecycle: life(actualClient), state: "queued", claim: null, routing: null, assistantUpdateStartedAt: rulesChanged ? iso() : old.assistantUpdateStartedAt || null,
        forwardingBusinessNumber: actualClient.phone?.businessNumber || null, evidence: { ...old.evidence, ...(rulesChanged ? { successfulCallAt:null,latestCallOutcome:null,lastCallEndedAt:null } : {}), ...(forwardingChanged ? {forwardedAt:null} : {}) }, adoptedAt:iso(), adoptionReason:rulesChanged ? 'reviewed_rules_changed' : 'workspace_lifecycle_changed', reasonCode:null } : null);
    }
    const c = await valid(row, { includeGate: false });
    if (!c) { const latest = await strictRead("clients", row.slug); return voiceActivationView(await change(id, old => ({ ...old, state: ["cancelled", "archived"].includes(latest?.status) ? "cancelled" : latest?.status === "paused" ? "suspended" : "needs_review", claim: null, reasonCode: "workspace_changed" })), latest); }
    if (!enabled()) return voiceActivationView(await change(id, old => ({ ...old, state: "waiting_platform", reasonCode: "product_gate_closed" })), c);
    // Keep receipt reconciliation independent from funding. Only a genuinely new
    // provider mutation waits for payment; no create marker is written on a hold.
    if ((!row.assistant||row.assistant.inputRevision!==row.inputRevision||row.assistantUpdateStartedAt||!row.imported||!row.importedRoute||!row.routing?.confirmed) && !(row.assistantCreateStartedAt&&!row.assistant || row.importStartedAt&&!row.imported)) {
      try { await assertPaidServiceAuthority(c,'voice'); }
      catch(error) { if(error.code==='paid_service_unconfirmed')return voiceActivationView(await change(id,old=>({...old,state:'waiting_platform',reasonCode:error.code})),c);throw error; }
    }
    if (row.claim && Date.parse(row.claim.until) > Date.now()) return voiceActivationView(row, c);
    const token = randomBytes(16).toString("hex"), generation = row.generation;
    row = await change(id, old => old.generation !== generation || old.claim && Date.parse(old.claim.until) > Date.now() ? null : { ...old, claim: { token, until: new Date(Date.now() + 60000).toISOString() } });
    if (row.claim?.token !== token) return voiceActivationView(row, c);
    let mutationAttempt=null;
    const resourcesStamp=value=>digest([value.assistant||null,value.imported||null,value.importedRoute||null,value.routing||null,value.lateReceipts||[]]);
    async function markMutation(field,state){
      const intent={operationId:id,generation,tenantIdentity:row.tenantIdentity,inputRevision:row.inputRevision,claimToken:token,field,markerAt:iso(),numberId:row.number?.id||null,nonce:randomBytes(16).toString('hex'),resourcesStamp:resourcesStamp(row)};
      row=await change(id,old=>old.claim?.token!==token||old.generation!==generation||!(Date.parse(old.claim.until)>Date.now())?null:{...old,[field]:old[field]||intent.markerAt,...(!old[field]?{pendingMutationDispatch:intent}:{}),state});
      // The durable nonce distinguishes this invocation from an older unknown
      // marker, including when two attempts happen at the same clock instant.
      mutationAttempt=row.pendingMutationDispatch?.nonce===intent.nonce?{intent,invoked:false}:null;
    }
    async function invokeMutation(method,call,extra={}){
      if(!await call.authorizeDispatch())throw new VoiceActivationError('dispatch_not_authorized','Phone setup changed.');
      if(mutationAttempt)mutationAttempt.invoked=true;
      return provider[method]({...call,...extra,...(mutationAttempt?{dispatchIntent:mutationAttempt.intent}:{})});
    }
    try {
      const number = await acquiredNumber(c);
      if (!number || !/^PN[a-f0-9]{32}$/i.test(number.id || "") || !validNumber(number.number)) return voiceActivationView(await receipt(row, token, { state: "waiting_number", reasonCode: "number_unavailable" }), c);
      if (number.number === c.owner?.phone || row.forwardingMode === "forward_business_line" && number.number === c.phone?.businessNumber) return voiceActivationView(await receipt(row, token, { state: "needs_review", reasonCode: "unsafe_number_destination" }), c);
      if (row.number && row.number.id !== number.id) return voiceActivationView(await receipt(row, token, { state: "needs_review", reasonCode: "number_changed" }), c);
      row = await change(id, old => old.claim?.token === token ? { ...old, number: { intentId: number.intentId, id: number.id, number: number.number, correlationId: number.correlationId } } : null);
      if (row.claim?.token !== token) return voiceActivationView(row, c);
      if (!row.dependencyClaimedAt) { await claimDependency(c, { kind: "voice", operationId: row.id }); row = await change(id, old => old.claim?.token === token ? { ...old, dependencyClaimedAt: iso() } : null); }
      let call = await args(row, token);
      if (!row.assistant) {
        if (row.assistantCreateStartedAt) {
          const found = await provider.lookupAssistant(call);
          if (found.status !== "found") return voiceActivationView(await receipt(row, token, { state: "uncertain", reasonCode: found.reasonCode || "assistant_create_unconfirmed" }), c);
          return voiceActivationView(await receipt(row, token, { assistant: { ...found.resource, recordedAt: iso() }, state: "queued" }), c);
        }
        await markMutation('assistantCreateStartedAt','creating_assistant');
        const assistant = await invokeMutation('createAssistant',call); return voiceActivationView(await receipt(row, token, { assistant: { ...assistant, recordedAt: iso() }, state: "queued" }), await strictRead("clients", row.slug));
      }
      if (row.assistant.inputRevision !== row.inputRevision || row.assistantUpdateStartedAt) {
        const verification = await provider.verifyAssistant({ ...call, resourceId: row.assistant.id });
        if (!verification.confirmed) {
          await markMutation('assistantUpdateStartedAt','creating_assistant');
          const assistant = await invokeMutation('updateAssistant',call,{resourceId:row.assistant.id});
          return voiceActivationView(await receipt(row, token, { assistant: { ...assistant, recordedAt: iso() }, assistantUpdateStartedAt: null, state: "queued" }), c);
        }
        return voiceActivationView(await receipt(row, token, { assistant: { ...verification.resource, recordedAt: iso() }, assistantUpdateStartedAt: null, state: "queued" }), c);
      }
      if (!row.imported) {
        if (row.importStartedAt) {
          const found = await provider.lookupNumber(call); if (found.status !== "found") return voiceActivationView(await receipt(row, token, { state: "uncertain", reasonCode: found.reasonCode || "number_import_unconfirmed" }), c);
          return voiceActivationView(await receipt(row, token, { imported: { ...found.resource, recordedAt: iso() }, state: "queued" }), c);
        }
        await markMutation('importStartedAt','importing_number');
        const imported = await invokeMutation('importNumber',call); return voiceActivationView(await receipt(row, token, { imported: { ...imported, recordedAt: iso() }, state: "queued" }), await strictRead("clients", row.slug));
      }
      if (!row.importedRoute) {
        const route = await provider.readImportedRoute(call); return voiceActivationView(await receipt(row, token, { importedRoute: { ...route, recordedAt: iso() }, state: "queued" }), c);
      }
      const assistant = await provider.verifyAssistant({ ...call, resourceId: row.assistant.id });
      if (!assistant.confirmed) return voiceActivationView(await receipt(row, token, { state: "queued", assistantUpdateStartedAt: iso(), reasonCode: "assistant_readback_mismatch" }), c);
      const routing = await provider.verifyRouting(call);
      if (routing.confirmed) return voiceActivationView(await receipt(row, token, { routing: { ...routing, checkedAt: iso() }, state: "ready" }), c);
      await markMutation('routingStartedAt','configuring_routing');
      const configured = await invokeMutation('configureRouting',call);
      return voiceActivationView(await receipt(row, token, { state: configured.confirmed ? "ready" : "uncertain", routing: configured.confirmed ? { ...configured, checkedAt: iso() } : null, reasonCode: configured.confirmed ? null : "routing_readback_mismatch" }), await strictRead("clients", row.slug));
    } catch (error) {
      const knownNoDispatch=mutationAttempt&&error?.code==='dispatch_not_authorized'&&(!mutationAttempt.invoked||voiceMutationWasNotDispatched(error,mutationAttempt.intent));
      if(knownNoDispatch){
        const intent=mutationAttempt.intent;
        const held=await change(id,async old=>{
          if(old.claim?.token!==token||old.generation!==generation||!(Date.parse(old.claim.until)>Date.now())||old.tenantIdentity!==intent.tenantIdentity||old.inputRevision!==intent.inputRevision||old.number?.id!==intent.numberId||old[intent.field]!==intent.markerAt||digest(old.pendingMutationDispatch)!==digest(intent)||resourcesStamp(old)!==intent.resourcesStamp)return null;
          const current=await strictRead('clients',old.slug),validCurrent=await valid(old,{includeGate:false});let state='needs_review',reasonCode='workspace_changed';
          if(old.cancelRequestedAt){state='cleanup_pending';reasonCode=old.reasonCode||null;}
          else if(current?.status==='paused')state='suspended';
          else if(validCurrent){state='waiting_platform';reasonCode=enabled()?'paid_service_unconfirmed':'product_gate_closed';}
          if(!(Date.parse(old.claim.until)>Date.now()))return null;
          const proof={...intent,at:iso(),mutationDispatched:false,reasonCode};
          return {...old,[intent.field]:null,pendingMutationDispatch:null,knownNoDispatch:[...(old.knownNoDispatch||[]),proof].slice(-20),state,reasonCode,claim:null};
        });
        return voiceActivationView(held,await strictRead('clients',row.slug));
      }
      const failure = voiceProviderFailure(error);
      return voiceActivationView(await change(id, old => old.claim?.token === token ? { ...old, ...(failure ? { providerFailure: failure } : {}), state: error?.code === "dispatch_not_authorized" ? "needs_review" : "uncertain", claim: null, reasonCode: error?.code === "dispatch_not_authorized" ? "workspace_changed" : "provider_result_unconfirmed" } : null), await strictRead("clients", row.slug));
    }
  }
  async function recover({ limit = 1, deadlineAt = null, operationId = null } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 5 || operationId!==null&&(!validId(operationId)||limit!==1)) throw new VoiceActivationError("invalid_limit", "Choose a bounded phone recovery limit.", 400);
    const ids = await atomicUpdate(QUEUE, KEY, value => { const queue = queueValue(value), keys = Object.keys(queue.intents).filter(id=>!operationId||id===operationId).sort(); if (!keys.length) return { result: [] }; let start = keys.findIndex(key => key > queue.cursor); if (start < 0) start = 0; const chosen = [...keys.slice(start), ...keys.slice(0, start)].slice(0, limit); return { ...(!operationId?{value:{...queue,cursor:chosen.at(-1)}}:{}), result: chosen }; });
    const outcomes = [];
    for (const id of ids) { try { const queued = queueValue(await strictRead(QUEUE, KEY)).intents[id]; if (queued?.version === 1) await atomicUpdate(STORE, id, current => current ? {} : { value: queued }); let view; for (let step = 0; step < 6; step++) { if (deadlineAt && deadlineAt - Date.now() < 1000) break; view = await run(id); if (!["queued", "cleanup_pending"].includes(view.state)) break; } outcomes.push(view || { state: "queued", reasonCode: "voice_deadline_reached", active: false }); } catch { outcomes.push({ state: "uncertain", reasonCode: "voice_storage_unavailable", active: false }); } }
    return { ok: outcomes.every(row => !["uncertain", "failed", "needs_review"].includes(row.state)), processed: ids.length, outcomes };
  }
  return { offer, request, cancel, run, recover };
}
function productionEngine(deadlineAt) { const { policy } = productionPolicy(); if (!policy) throw new VoiceActivationError("policy_unavailable", "Phone usage terms are not available yet."); const frozen = digest(policy), gate = () => { const next = productionPolicy(); return next.enabled && digest(next.policy) === frozen; }; return voiceEngine({ provider: createManagedVoiceProvider({ executionAllowed: gate, deadlineAt }), policy, gate }); }
export async function requestVoiceActivation(c, body, options) { return productionEngine().request(c, body, options); }
export async function cancelVoiceActivation(c, body) { return saveVoiceCancellation(c, body); }
export async function voiceActivationStatus(c) {
  if (!isSupportedSelfServiceClient(c)) return { available: false, active: false, state: "unavailable", operation: null, offer: null };
  const row = await strictRead(STORE, idFor(c)), { policy, enabled } = productionPolicy(), parent = row?.number ? await getPhoneResourceLifecycle(c) : null, serviceCancellation = row && await phoneServiceOnboardingCancellationRequested(c);
  let operation = row?.tenantIdentity === tenant(c) ? voiceActivationView(row, c) : null;
  if (operation && row.cleanupConfirmedAt) operation = { ...operation, state: "cancelled", active: false, ready: false };
  else if (operation && (row.cancelRequestedAt || parent?.cancellationRequested || serviceCancellation)) operation = { ...operation, state: row.state === "cleanup_uncertain" ? row.state : "cleanup_pending", active: false, ready: false, detail: "Phone answering is stopped. Recorded resources are waiting for confirmed cleanup." };
  else if (operation && !enabled) operation = { ...operation, state: "waiting_platform", active: false, ready: false, detail: "Your approval is saved. Phone service is not available yet; calls are not active." };
  else if (operation && (!parent || parent.state !== "number_acquired" || parent.resource?.id !== row.number?.id || !row.routing?.checkedAt || Date.now() - Date.parse(row.routing.checkedAt) > 25 * 60000)) operation = { ...operation, active: false, ready: false, ...(row.state === "ready" ? { state: "needs_review", detail: "Phone routing needs a fresh provider check before calls are answered." } : {}) };
  return { available: enabled, platformReady:enabled, active: operation?.active === true, state: operation?.state || "unavailable", offer: policy ? { ...policy, digest: digest(policy), available: enabled } : null, operation };
}
async function pendingVoiceWork() {
  const queue = queueValue(await strictRead(QUEUE, KEY)), ids = Object.keys(queue.intents).sort(), inspected = Math.min(ids.length, 25);
  const rows = await Promise.all(ids.slice(0, 25).map(id => strictRead(STORE, id)));
  const pendingTimes = rows.filter(row => row && !["ready", "cancelled"].includes(row.state)).map(row => row.createdAt).filter(value => Number.isFinite(Date.parse(value))).sort(), routeTimes = rows.filter(row => row?.state === "ready").map(row => row.routing?.checkedAt).filter(value => Number.isFinite(Date.parse(value))).sort();
  return { pending: ids.length, inspected, partial: ids.length > inspected,
    unresolved: rows.filter(row => !row || ["uncertain", "needs_review", "failed", "cleanup_uncertain"].includes(row.state)).length,
    staleRoutes: rows.filter(row => row?.state === "ready" && (!row.routing?.checkedAt || Date.now() - Date.parse(row.routing.checkedAt) > 25 * 60000)).length,
    oldestPendingAt: pendingTimes[0] || null, oldestPendingMinutes: pendingTimes.length ? Math.max(0, Math.floor((Date.now() - Date.parse(pendingTimes[0])) / 60000)) : null, oldestRouteCheckAt: routeTimes[0] || null };
}
export async function voiceRecoveryHealth() {
  const pending = await pendingVoiceWork(), { enabled } = productionPolicy(), lastRun = await strictRead("health", "voiceSetup:lastRun"), fresh = !!lastRun && Date.now() - Date.parse(lastRun.at) <= 25 * 60000;
  return { ok: !pending.partial && !pending.unresolved && !pending.staleRoutes && (!pending.pending || enabled && fresh && lastRun.ok === true), enabled, ...pending, lastRunAt: lastRun?.at || null,
    reasonCode: pending.partial ? "voice_scope_partial" : pending.unresolved ? "voice_unresolved_work" : pending.staleRoutes ? "voice_route_check_stale" : !enabled && pending.pending ? "product_gate_closed" : pending.pending && !fresh ? "voice_recovery_stale" : null };
}
async function recoverVoiceNumberFences({limit=1,deadlineAt=Date.now()+15000}={}) {
  if ((await strictRead("health","brake"))?.on===true) return {processed:0};
  const ids=await atomicUpdate(QUEUE,KEY,value=>{const queue=queueValue(value),keys=Object.keys(queue.intents).filter(id=>queue.intents[id]?.cancelRequestedAt).sort();if(!keys.length)return {result:[]};let start=keys.findIndex(id=>id>(queue.cursor||""));if(start<0)start=0;const chosen=[...keys.slice(start),...keys.slice(0,start)].slice(0,limit);return {value:{...queue,cursor:chosen.at(-1)},result:chosen};});
  let processed=0;
  for(const id of ids){if(Date.now()>=deadlineAt)break;const row=await strictRead(STORE,id),c=row&&await strictRead("clients",row.slug);if(!c||!row.cancelRequestedAt)continue;try{const policy=validatePolicy(row.policy);if(digest(policy)!==row.policyDigest||!await voiceNumberCancellationContext(c,row)&&!await voiceCleanupMaintenanceContext(c,row)&&!await confirmedVoiceCreateRejection(c,row))continue;
      const maintenanceAllowed=async({origin,path,method,args})=>{
        const latest=await strictRead(STORE,id);
        if(origin!=="vapi"||!args||args.maintenanceOnly!==true||latest?.generation!==row.generation||latest.claim?.token!==args.maintenanceClaimToken||!(Date.parse(latest.claim.until)>Date.now())||!await voiceCleanupMaintenanceContext(c,latest)||!(Date.parse(latest.claim.until)>Date.now()))return false;
        const kind=path.startsWith("/assistant")?"assistant":"imported",base=kind==="assistant"?"/assistant":"/phone-number",known=[latest[kind],...(latest.lateReceipts||[]).map(item=>item[kind])].filter(Boolean);
        if(path===base+"?limit=1000")return method==="GET"&&(kind==="assistant"?!!latest.assistantCreateStartedAt:!!latest.importStartedAt);
        return ["GET","DELETE"].includes(method)&&known.some(resource=>path===base+"/"+resource.id&&args.resourceId===resource.id);
      };
      const engine=voiceEngine({provider:createManagedVoiceProvider({executionAllowed:()=>false,deadlineAt,maintenanceAllowed}),policy,gate:false,cleanupMaintenance:true});await engine.recover({limit:1,deadlineAt,operationId:id});processed++;}catch{/* Keep the same unresolved row for ordinary recovery. */}}
  return {processed};
}
export async function recoverVoiceActivations({ limit = 1, deadlineAt = Date.now() + 15000 } = {}) {
  if (limit !== 1 || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now() || deadlineAt > Date.now() + 15000) throw new VoiceActivationError("invalid_limit", "Phone recovery requires one bounded operation.", 400);
  const queue = queueValue(await strictRead(QUEUE, KEY)), count = Object.keys(queue.intents).length;
  if (!productionPolicy().enabled || (await strictRead("health", "brake"))?.on === true) { const maintenance=await recoverVoiceNumberFences({limit,deadlineAt});return { ok: count === 0, enabled: false, pending: count, processed: maintenance.processed, reasonCode: "product_gate_closed" }; }
  const recovery = await productionEngine(deadlineAt).recover({ limit, deadlineAt });
  const pending = await pendingVoiceWork();
  return { ...recovery, ok: recovery.ok && !pending.partial && !pending.unresolved && !pending.staleRoutes, enabled: true, ...pending, reasonCode: pending.partial ? "voice_scope_partial" : pending.unresolved ? "voice_unresolved_work" : pending.staleRoutes ? "voice_route_check_stale" : null, outcomes: recovery.outcomes.map(row => ({ state: row.state, reasonCode: row.reasonCode || null })) };
}
export async function runVoiceActivationWave({ deadlineAt = Date.now() + 240000 } = {}) {
  if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now() || deadlineAt > Date.now() + 240000) throw new VoiceActivationError("invalid_deadline", "Voice recovery requires a bounded wave.", 400);
  const started = Date.now(), at = iso(), pending = await pendingVoiceWork();
  if (!productionPolicy().enabled || (await strictRead("health", "brake"))?.on === true || !pending.pending) return { ok: pending.pending === 0, enabled: productionPolicy().enabled, processed: 0, ...pending, reasonCode: pending.pending ? "product_gate_closed" : null };
  const token = randomBytes(16).toString("hex"), lease = await atomicUpdate("voice_activation_waves", "active_v1", current => {
    if (current?.status === "running" && Date.parse(current.until) > Date.now()) return { result: false };
    return { value: { token, status: "running", at, until: new Date(deadlineAt + 5000).toISOString() }, result: true };
  });
  if (!lease) return { ok: true, enabled: true, processed: 0, skipped: "wave_running", ...pending };
  let processed = 0, failed = false;
  try {
    // Fair queue cursor advances once per customer. At most 25 retained
    // customers are admitted; each provider deadline is 15 seconds and the
    // whole background wave is four minutes. A second scheduled wave covers
    // the tail before the strong 25-minute routing freshness expires.
    for (let index = 0; index < Math.min(25, pending.pending); index++) {
      if (deadlineAt - Date.now() < 1000) break;
      if (!productionPolicy().enabled || (await strictRead("health", "brake"))?.on === true) break;
      const currentLease = await strictRead("voice_activation_waves", "active_v1"); if (currentLease?.token !== token) break;
      const budget = Math.min(deadlineAt, Date.now() + 15000), outcome = await productionEngine(budget).recover({ limit: 1, deadlineAt: budget });
      processed += outcome.processed; if (!outcome.ok) failed = true;
    }
    const remaining = await pendingVoiceWork(), record = { at, completedAt: iso(), ok: !failed && !remaining.partial && !remaining.unresolved && !remaining.staleRoutes, enabled: productionPolicy().enabled, processed, ...remaining, durationMs: Date.now() - started,
      reasonCode: remaining.partial ? "voice_scope_partial" : remaining.unresolved ? "voice_unresolved_work" : remaining.staleRoutes ? "voice_route_check_stale" : failed ? "voice_recovery_failed" : null };
    await atomicUpdate("health", "voiceSetup:lastRun", previous => !previous || previous.at <= at ? { value: record } : {});
    await atomicUpdate("voice_activation_waves", "active_v1", current => current?.token === token ? { value: { ...current, status: "completed", completedAt: iso(), processed } } : {});
    return record;
  } catch {
    const record = { at, completedAt: iso(), ok: false, enabled: productionPolicy().enabled, processed, durationMs: Date.now() - started, reasonCode: "voice_wave_unavailable" };
    await atomicUpdate("health", "voiceSetup:lastRun", previous => !previous || previous.at <= at ? { value: record } : {});
    await atomicUpdate("voice_activation_waves", "active_v1", current => current?.token === token ? { value: { ...current, status: "failed", completedAt: iso(), processed } } : {});
    return record;
  }
}
export async function dispatchVoiceActivationWave() {
  const paidUsageRecovery=await recoverPaidVoiceReceipts();
  const pending = await pendingVoiceWork(), enabled = productionPolicy().enabled;
  if (!enabled || !pending.pending || (await strictRead("health", "brake"))?.on === true) {const maintenance=!enabled?await recoverVoiceNumberFences({limit:1,deadlineAt:Date.now()+15000}):{processed:0};return { ok: pending.pending === 0&&paidUsageRecovery.ok, enabled, processed: maintenance.processed, dispatched: false, ...pending, paidUsageRecovery, reasonCode: !paidUsageRecovery.ok?'paid_voice_receipt_recovery_unavailable':pending.pending ? "product_gate_closed" : null };}
  const response = await fetch(siteUrl() + "/api/voice-activation-background", { method: "POST", headers: { "Content-Type": "application/json", "x-service-worker-key": process.env.SERVICE_WORKER_KEY }, body: "{}", signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!response.ok) throw new Error("Voice continuation dispatch unavailable");
  return { ok: paidUsageRecovery.ok, enabled: true, processed: 0, dispatched: true, ...pending, paidUsageRecovery };
}

// Both providers' events are authenticated before any tenant resolution. The
// opaque callback index points only to a recorded intent, never a caller slug.
const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const xml = value => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${value}</Response>`, { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
const esc = value => String(value).replace(/[<>&"']/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[ch]));
const secureEqual = (a, b) => { if (typeof a !== "string" || typeof b !== "string") return false; const x = Buffer.from(a), y = Buffer.from(b); return x.length > 0 && x.length === y.length && timingSafeEqual(x, y); };
function twilioValid(url, params, signature) {
  if (!(process.env.TWILIO_AUTH_TOKEN || "")) return false;
  const expected = createHmac("sha1", process.env.TWILIO_AUTH_TOKEN).update(url + Object.keys(params).sort().map(key => key + params[key]).join("")).digest("base64"); return secureEqual(expected, signature);
}
async function callbackRow(token) {
  if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
  const ref = await strictRead(CALLBACKS, token); if (!ref?.id || !validId(ref.id)) return null;
  const row = await strictRead(STORE, ref.id); return row && row.callbackToken === token && row.tenantIdentity === ref.tenantIdentity ? row : null;
}
async function serving(row) {
  const c = await strictRead("clients", row.slug);
  const parent = c && row.number ? await getPhoneResourceLifecycle(c) : null;
  const brake = await strictRead("health", "brake"), gate = productionPolicy();
  const owned = !row.numberUseFenced && c && isSupportedSelfServiceClient(c) && tenant(c) === row.tenantIdentity && configurationRevision(c) === row.inputRevision && validNumber(c.owner?.phone) && gate.enabled && row.policy && digest(row.policy) === row.policyDigest && digest(gate.policy) === row.policyDigest && parent?.state === "number_acquired" && !parent.cancellationRequested && parent.resource?.id === row.number.id && !brake?.on && await phoneServiceOnboardingActive(c);
  const valid = owned && !row.cancelRequestedAt && serviceLifecycleMatches(c, row.lifecycle) && ["testing", "live"].includes(c.status) && reviewed(c) && row.state === "ready" && row.routing?.confirmed && Date.now() - Date.parse(row.routing.checkedAt) <= 25 * 60000;
  // Pausing/detaching AI does not revoke an unchanged, approved owner route.
  // Workspace/number cancellation, changed configuration or the account stop do.
  const fallbackAllowed = owned && ["testing", "live", "paused"].includes(c.status) && row.authority?.acceptedAuthority === true && row.authority.policyDigest === row.policyDigest && normalizeAccountEmail(row.authority.actor?.email) === normalizeAccountEmail(c.owner?.email);
  return { c, valid: !!valid, fallbackAllowed: !!fallbackAllowed };
}
const unavailable = () => "<Say>We could not connect you on this line. Please try calling the shop again during business hours.</Say><Hangup/>";
const safeCaller = (c, row, from) => validNumber(from) && from !== row.number?.number && from !== c?.phone?.businessNumber;
const currentCall = (call, row, params) => call && call.operationId === row.id && call.generation === row.generation && call.number === params.To && call.from === params.From;
const paidVoiceBound = (call,row) => call && call.operationId===row.id && Number.isSafeInteger(call.generation) && call.generation>=1 && call.generation<=row.generation && call.number===row.number?.number;
function paidVoiceExpected(row,call,purpose,leg) {
  if(!paidVoiceBound(call,row)||!['parent','fallback','handoff0','handoff1'].includes(purpose)||!Number.isInteger(leg?.seconds)||leg.seconds<1||leg.seconds>900)throw new Error('Paid call binding changed');
  return {service:'voice',unit:'voiceMinutes',operationId:'voice:'+hash(JSON.stringify([row.id,call.twilioCallSid,purpose])),payloadDigest:hash(JSON.stringify([1,row.tenantIdentity,row.id,call.generation,call.twilioCallSid,call.from,call.number,purpose,leg.seconds,leg.destination||null])),quantity:Math.ceil(leg.seconds/60)};
}
async function reservePaidVoiceLeg(row,c,key,purpose,seconds,destination=null) {
  let call=await strictRead(CALLS,key);if(!paidVoiceBound(call,row))throw new Error('Paid call changed');
  if(call.paidLegs?.[purpose])return call.paidLegs[purpose];
  const proposed={seconds,destination,attemptId:'voice-'+purpose},expected=paidVoiceExpected(row,call,purpose,proposed),receipt=await reservePaidUsage(c,expected);
  return atomicUpdate(CALLS,key,old=>{
    if(!paidVoiceBound(old,row)||old.twilioCallSid!==call.twilioCallSid)throw new Error('Paid call changed');
    const prior=old.paidLegs?.[purpose];if(prior){if(JSON.stringify(prior.receipt)!==JSON.stringify(receipt))throw new Error('Paid call receipt changed');return {result:prior};}
    const leg={...proposed,receipt,at:iso()};return {value:{...old,paidLegs:{...old.paidLegs,[purpose]:leg}},result:leg};
  });
}
function paidParentRemaining(call) {
  if(!call.paidLegs?.parent?.receipt)return null;
  return Math.max(0,Math.min(call.paidLimit?.seconds||0,Math.floor((Date.parse(call.paidLimit?.expiresAt)-Date.now())/1000)));
}
async function assertPaidVoiceParent(row,c,key) {
  const call=await strictRead(CALLS,key),leg=call?.paidLegs?.parent;
  if(!leg)return false;if(leg.receipt===null)return true;
  if(call.endReportAt||['completed','busy','failed','no-answer','canceled'].includes(call.twilioStatus))return false;
  if(call.paidLimit?.status!=='applied'||call.paidLimit.callSid!==call.twilioCallSid||call.paidLimit.seconds!==leg.seconds||paidParentRemaining(call)<1)return false;
  await assertPaidUsageContinuation(c,leg.receipt,paidVoiceExpected(row,call,'parent',leg),call.twilioCallSid);return true;
}
async function applyPaidVoiceLimit(row,c,key,purpose,providerId,current) {
  let call=await strictRead(CALLS,key),leg=call?.paidLegs?.[purpose];if(!leg)return false;if(leg.receipt===null)return true;
  const limit=purpose==='parent'?call.paidLimit:leg.limit;
  if(limit)return limit.status==='applied'&&limit.callSid===providerId&&(purpose!=='parent'||await assertPaidVoiceParent(row,c,key));
  const expected=paidVoiceExpected(row,call,purpose,leg);
  await attemptPaidUsage(c,leg.receipt,{attemptId:leg.attemptId,providerId},expected);
  const started=purpose==='parent'?Math.min(Date.now(),Date.parse(call.createdAt)):Date.now();
  if(!Number.isFinite(started))return false;
  const marker={status:'pending',callSid:providerId,seconds:leg.seconds,at:iso(),expiresAt:new Date(started+leg.seconds*1000).toISOString()};
  const claimed=await atomicUpdate(CALLS,key,old=>{
    const found=old?.paidLegs?.[purpose];if(!paidVoiceBound(old,row)||!found||JSON.stringify(found.receipt)!==JSON.stringify(leg.receipt))throw new Error('Paid call changed');
    if(purpose==='parent'?old.paidLimit:found.limit)return {result:false};
    return {value:purpose==='parent'?{...old,paidLimit:marker}:{...old,paidLegs:{...old.paidLegs,[purpose]:{...found,limit:marker}}},result:true};
  });
  if(!claimed)return false;
  try{
    const provider=createManagedVoiceProvider({executionAllowed:()=>productionPolicy().enabled});
    const ack=await provider.setCallTimeLimit({callSid:providerId,from:purpose==='parent'?call.from:call.number,to:purpose==='parent'?call.number:leg.destination,parentCallSid:purpose==='parent'?null:call.twilioCallSid,timeLimit:leg.seconds,authorizeDispatch:async()=>{
      if(!await current())return false;const latest=await strictRead(CALLS,key),saved=latest?.paidLegs?.[purpose],pending=purpose==='parent'?latest?.paidLimit:saved?.limit;
      if(!saved||latest.endReportAt||['completed','busy','failed','no-answer','canceled'].includes(latest.twilioStatus)||purpose.startsWith('handoff')&&latest.handoff?.legs?.[purpose.slice(-1)]?.outcome||pending?.status!=='pending'||pending.callSid!==providerId||JSON.stringify(saved.receipt)!==JSON.stringify(leg.receipt))return false;
      await assertPaidUsage(c,saved.receipt,paidVoiceExpected(row,latest,purpose,saved));return true;
    }});
    const saved=await atomicUpdate(CALLS,key,old=>{
      const l=old?.paidLegs?.[purpose],pending=purpose==='parent'?old?.paidLimit:l?.limit;if(!paidVoiceBound(old,row)||pending?.status!=='pending'||pending.callSid!==ack.callSid||ack.seconds!==leg.seconds)return {result:false};
      const applied={...pending,status:'applied',acknowledgedAt:iso()};return {value:purpose==='parent'?{...old,paidLimit:applied}:{...old,paidLegs:{...old.paidLegs,[purpose]:{...l,limit:applied}}},result:true};
    });
    return saved&&!!await current();
  }catch{
    await atomicUpdate(CALLS,key,old=>{const l=old?.paidLegs?.[purpose],pending=purpose==='parent'?old?.paidLimit:l?.limit;if(!paidVoiceBound(old,row)||pending?.status!=='pending'||pending.callSid!==providerId)return {};const unknown={...pending,status:'unknown',unknownAt:iso()};return {value:purpose==='parent'?{...old,paidLimit:unknown}:{...old,paidLegs:{...old.paidLegs,[purpose]:{...l,limit:unknown}}}};});
    return false;
  }
}
async function fundPaidVoiceParent(row,c,key,current) {
  const call=await strictRead(CALLS,key);let seconds=call?.paidLegs?.parent?.seconds||row.policy.maxDurationSeconds;
  if(!call?.paidLegs?.parent){
    const status=await paidUsageStatus(c);
    if(status.metered){
      if(!status.allowed)await assertPaidServiceAuthority(c,'voice');
      const remaining=status.units?.voiceMinutes?.remaining;
      if(!Number.isSafeInteger(remaining)||remaining<1)throw new PaidUsageError(remaining===0?'paid_capacity_exhausted':'paid_capacity_unavailable');
      seconds=Math.min(seconds,remaining*60);
    }
  }
  const leg=await reservePaidVoiceLeg(row,c,key,'parent',seconds);
  return leg.receipt===null||await applyPaidVoiceLimit(row,c,key,'parent',(await strictRead(CALLS,key)).twilioCallSid,current);
}
async function fundPaidVoiceChild(row,c,key,purpose,seconds,destination) {
  const leg=await reservePaidVoiceLeg(row,c,key,purpose,seconds,destination);if(leg.receipt===null)return true;
  const call=await strictRead(CALLS,key),expected=paidVoiceExpected(row,call,purpose,leg);
  await attemptPaidUsage(c,leg.receipt,{attemptId:leg.attemptId},expected);await assertPaidUsage(c,leg.receipt,expected);return true;
}
async function paidVoiceNoEmission(row,c,key,purpose) {
  const call=await strictRead(CALLS,key),leg=call?.paidLegs?.[purpose];if(!leg?.receipt)return;
  const source=purpose==='fallback'?call.fallbackAttempt:call.handoff?.legs?.[purpose.slice(-1)];
  if(!source?.notEmittedAt||source.childSid||purpose==='fallback'&&call.fallbackOutcome?.callSid)throw new Error('Call emission is not known absent');
  const expected=paidVoiceExpected(row,call,purpose,leg),fact={outcome:'not_dispatched',quantity:0,proofId:hash(JSON.stringify([key,purpose,'not_emitted',leg.attemptId])),attemptId:leg.attemptId};
  let result;try{result=await settlePaidUsage(c,leg.receipt,fact,expected);}catch(error){if(error.code!=='paid_capacity_proof_conflict')throw error;await attemptPaidUsage(c,leg.receipt,{attemptId:leg.attemptId},expected);result=await settlePaidUsage(c,leg.receipt,fact,expected);}
  if(['released','settled'].includes(result?.receiptState))await atomicUpdate(CALLS,key,old=>old?.paidLegs?.[purpose]?.receipt?.generation===leg.receipt.generation?{value:{...old,paidLegs:{...old.paidLegs,[purpose]:{...old.paidLegs[purpose],knownNoEmission:true}}}}:{});
}
async function settlePaidVoiceFacts(row,c,key,purpose) {
  const call=await strictRead(CALLS,key),leg=call?.paidLegs?.[purpose],fact=leg?.terminalFacts;if(!leg?.receipt||!fact||leg.settledProof===fact.proofId)return false;
  await settlePaidUsage(c,leg.receipt,{outcome:'confirmed',quantity:fact.quantity,proofId:fact.proofId,...(fact.providerId?{providerId:fact.providerId}:{})},paidVoiceExpected(row,call,purpose,leg));
  await atomicUpdate(CALLS,key,old=>old?.paidLegs?.[purpose]?.terminalFacts?.proofId===fact.proofId?{value:{...old,paidLegs:{...old.paidLegs,[purpose]:{...old.paidLegs[purpose],settledProof:fact.proofId}}}}:{});return true;
}
async function retainPaidVoiceTerminal(row,c,key,purpose,{status,duration,providerId}) {
  if(!['completed','busy','failed','no-answer','canceled'].includes(status))return;
  const validDuration=typeof duration==='string'&&/^(0|[1-9]\d{0,9})$/.test(duration)&&Number.isSafeInteger(Number(duration));
  await atomicUpdate(CALLS,key,old=>{
    const leg=old?.paidLegs?.[purpose];if(!paidVoiceBound(old,row)||!leg?.receipt)return {};
    if(!validDuration||Number(duration)>60000000000||Number(duration)>0&&!/^CA[a-f0-9]{32}$/i.test(providerId||''))return {value:{...old,paidLegs:{...old.paidLegs,[purpose]:{...leg,durationUnknown:true}}}};
    const seconds=Number(duration),fact={version:1,status,seconds,quantity:Math.ceil(seconds/60),providerId:providerId||null,proofId:hash(JSON.stringify([key,purpose,providerId||null,status,seconds]))};
    if(leg.terminalFacts?.quantity>fact.quantity)return {value:{...old,paidLegs:{...old.paidLegs,[purpose]:{...leg,terminalConflict:true}}}};
    return {value:{...old,paidLegs:{...old.paidLegs,[purpose]:{...leg,terminalFacts:fact,durationUnknown:false}}}};
  });
  try{await settlePaidVoiceFacts(row,c,key,purpose);}catch{/* Source facts remain for the ordinary storage-only recovery. */}
}
function paidHandoff(row,key,current) {
  return {
    async parent(){const state=await current();return !!state&&await fundPaidVoiceParent(row,state.c,key,current);},
    async remaining(){return paidParentRemaining(await strictRead(CALLS,key));},
    async prepare(index,seconds,destination){const state=await current();return !!state&&await fundPaidVoiceChild(row,state.c,key,'handoff'+index,seconds,destination);},
    async screen(index,providerId){const state=await current();return !!state&&await assertPaidVoiceParent(row,state.c,key)&&await applyPaidVoiceLimit(row,state.c,key,'handoff'+index,providerId,current);},
    async terminal(index,fact){const c=await strictRead('clients',row.slug);if(c)await retainPaidVoiceTerminal(row,c,key,'handoff'+index,fact);},
    async noEmission(index){const c=await strictRead('clients',row.slug);if(c)await paidVoiceNoEmission(row,c,key,'handoff'+index);},
  };
}
export async function recoverPaidVoiceReceipts({limit=5,deadlineAt=Date.now()+10000}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>5||!Number.isFinite(deadlineAt)||deadlineAt<=Date.now())throw new Error('Choose bounded paid call recovery');
  const keys=await list(CALLS),selected=await atomicUpdate('health','paidVoiceUsage:cursor',old=>{
    if(old&&(!Number.isInteger(old.version)||old.version!==1||typeof old.cursor!=='string'))throw new Error('Paid call recovery cursor unavailable');
    if(!keys.length)return {result:[]};let start=keys.findIndex(key=>key>(old?.cursor||''));if(start<0)start=0;const selected=[...keys.slice(start),...keys.slice(0,start)].slice(0,limit);
    return {value:{version:1,cursor:selected.at(-1)},result:selected};
  });
  let settled=0,failed=0;
  for(const key of selected){if(Date.now()>=deadlineAt)break;try{const call=await strictRead(CALLS,key);if(!call?.paidLegs)continue;const row=await strictRead(STORE,call.operationId),c=row&&await strictRead('clients',row.slug);if(!c||!paidVoiceBound(call,row)||tenant(c)!==row.tenantIdentity)continue;
    for(const [purpose,leg]of Object.entries(call.paidLegs)){if(!leg.receipt)continue;const source=purpose==='fallback'?call.fallbackAttempt:purpose.startsWith('handoff')?call.handoff?.legs?.[purpose.slice(-1)]:null;
      if(source?.notEmittedAt&&!leg.knownNoEmission){await paidVoiceNoEmission(row,c,key,purpose);settled++;}
      else if(leg.terminalFacts&&leg.settledProof!==leg.terminalFacts.proofId){if(await settlePaidVoiceFacts(row,c,key,purpose))settled++;}
    }
  }catch{failed++;}}
  return {ok:failed===0,inspected:selected.length,settled,failed};
}
function fallback(c, row, from, allowed, timeLimit, forwardedFrom = []) {
  const cell = allowed && safeCaller(c, row, from) ? safeFallback(c || {}) : null;
  // An action takes control of the original call; trailing verbs cannot play.
  // Its response below handles unsuccessful outcomes without dialing again.
  return cell && cell !== row.number?.number && cell !== from && Number.isInteger(timeLimit) && timeLimit >= 1 && timeLimit <= row.policy.maxDurationSeconds && !forwardedFrom.some(number => number && (number === cell || number === row.number?.number)) ? `<Dial timeout="25" timeLimit="${timeLimit}" action="${esc(siteUrl() + "/api/managed-voice?o=" + row.callbackToken + "&kind=dial-status")}" method="POST">${esc(cell)}</Dial>` : unavailable();
}
export async function handleManagedVoiceWebhook(req) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = new URL(req.url), publicUrl = siteUrl() + url.pathname + url.search;
  const humanKind = ['handoff','handoff-screen','handoff-accept','handoff-status'].includes(url.searchParams.get('kind'));
  if (url.pathname !== "/api/managed-voice" || !humanKind && !["inbound", "fallback", "status", "dial-status"].includes(url.searchParams.get("kind")) || url.searchParams.size !== (humanKind?4:2) || [...url.searchParams.keys()].some(key=>!(humanKind?['o','kind','p','leg']:['o','kind']).includes(key))) return json({ error: "route" }, 400);
  const raw = await req.text(); if (Buffer.byteLength(raw) > 16000) return json({ error: "too_large" }, 413);
  const entries = new URLSearchParams(raw); if ([...new Set(entries.keys())].length !== [...entries.keys()].length) return json({ error: "ambiguous_form" }, 400);
  const params = Object.fromEntries(entries);
  if (!twilioValid(publicUrl, params, req.headers.get("x-twilio-signature"))) return json({ error: "forbidden" }, 403);
  const row = await callbackRow(url.searchParams.get("o"));
  if (humanKind) {
    if (!row || params.AccountSid !== process.env.TWILIO_ACCOUNT_SID) return json({error:'call_mismatch'},403);
    const current=async()=>{const latest=await callbackRow(row.callbackToken);if (!latest || latest.generation!==row.generation) return null;const state=await serving(latest);return state.valid?state:null;};
    return handleManagedHumanCallback({row,params,url,site:siteUrl(),reserve:reserveVoiceBudget,current,paid:paidHandoff(row,row.slug+'/'+url.searchParams.get('p'),current)});
  }
  if (!row || params.AccountSid !== process.env.TWILIO_ACCOUNT_SID || !/^CA[a-f0-9]{32}$/i.test(params.CallSid || "") || params.To !== row.number?.number) return json({ error: "call_mismatch" }, 403);
  const { c, valid, fallbackAllowed } = await serving(row), callKey = row.slug + "/" + params.CallSid;
  let kind = url.searchParams.get("kind");
  if (kind === "inbound" && !safeCaller(c, row, params.From)) return xml(unavailable());
  if (kind === "inbound" && !valid) kind = "fallback";
  if (kind === "inbound") {
    if(!await strictRead(CALLS,callKey)){try{await assertPaidServiceAuthority(c,"voice");}catch{return xml(unavailable());}}
    const forwardingMatches = row.forwardingMode === "forward_business_line" && validNumber(c.phone?.businessNumber) && params.ForwardedFrom === c.phone.businessNumber;
    const saved = await atomicUpdate(CALLS, callKey, previous => {
      if (previous && (previous.operationId !== row.id || previous.generation !== row.generation || previous.from !== params.From || previous.number !== params.To)) return { result: false };
      return previous ? { result: true } : { value: { version: 1, slug: row.slug, operationId: row.id, generation: row.generation, inputRevision: row.inputRevision, lifecycle: row.lifecycle, twilioCallSid: params.CallSid, number: params.To, from: params.From, forwardedFrom: validNumber(params.ForwardedFrom) ? params.ForwardedFrom : null, forwarded: forwardingMatches, createdAt: iso(), toolResults: {} }, result: true };
    });
    if (!saved) return json({ error: "call_mismatch" }, 403);
    await atomicUpdate("managed_voice_call_index", params.CallSid, prior => prior && prior.operationId !== row.id ? (() => { throw new Error("Voice call index conflict"); })() : { value: { operationId: row.id, slug: row.slug, generation: row.generation } });
    try{if(!await fundPaidVoiceParent(row,c,callKey,async()=>{const latest=await callbackRow(row.callbackToken),state=latest&&await serving(latest);return latest?.generation===row.generation&&state?.valid?state:null;}))return xml('<Hangup/>');}catch{return xml('<Hangup/>');}
    await change(row.id, old => old.generation === row.generation ? { ...old, evidence: { ...old.evidence, inboundAt: iso(), ...(forwardingMatches ? { forwardedAt: iso() } : {}) } } : null);
    return xml(`<Redirect method="POST">${esc(row.importedRoute.vapiUrl)}</Redirect>`);
  }
  let call = await strictRead(CALLS, callKey);
  if (kind === "fallback" && (!fallbackAllowed || !safeCaller(c, row, params.From))) return xml(unavailable());
  if (kind === "fallback" && !call) {
    call = await atomicUpdate(CALLS, callKey, old => {
      if (old) return { result: old };
      const value = { version: 1, slug: row.slug, operationId: row.id, generation: row.generation, number: params.To, from: params.From, forwardedFrom: validNumber(params.ForwardedFrom) ? params.ForwardedFrom : null, twilioCallSid: params.CallSid, createdAt: iso(), fallbackOnly: true };
      return { value, result: value };
    });
  }
  const receiptOnly=['status','dial-status'].includes(kind);
  const historicalPaidReceipt=receiptOnly&&!!call?.paidLegs?.[kind==='status'?'parent':'fallback']?.receipt&&paidVoiceBound(call,row)&&call.number===params.To&&call.from===params.From;
  if (!currentCall(call,row,params)&&!historicalPaidReceipt) return json({ error: "call_mismatch" }, 403);
  if (kind === "fallback") {
    try{if(!await fundPaidVoiceParent(row,c,callKey,async()=>{const latest=await callbackRow(row.callbackToken),state=latest&&await serving(latest);return latest?.generation===row.generation&&state?.fallbackAllowed?state:null;}))return xml('<Hangup/>');}catch{return xml('<Hangup/>');}
    call=await strictRead(CALLS,callKey);
    if (call.handoff?.connection==='live_transfer') return xml(unavailable());
    if (call.fallbackOutcome) return xml(call.fallbackOutcome.status === "completed" ? "<Hangup/>" : unavailable());
    // Returning TwiML has an uncertain delivery boundary too. Once its one
    // attempt is retained, do not return another paid Dial without a receipt.
    if (call.fallbackAttempt) return xml(unavailable());
    const fundedRemaining=paidParentRemaining(call),knownForwarding = [params.ForwardedFrom, call.forwardedFrom], twiml = fallback(c, row, params.From, fallbackAllowed, fundedRemaining===null?row.policy.maxDurationSeconds:Math.min(row.policy.maxDurationSeconds,fundedRemaining), knownForwarding), dialing = twiml.startsWith("<Dial");
    let admission = call.fallbackAdmission;
    if (dialing && !admission) {
      // A fallback is a distinct paid leg, not free use of an AI reservation.
      // The existing ledger conservatively reserves the full connection limit
      // plus 25 seconds ringing and Twilio's documented five-second buffer.
      const admitted = await reserveVoiceBudget(row, params.CallSid, "fallback"), at = iso();
      admission = await atomicUpdate(CALLS, callKey, old => {
        if (!currentCall(old, row, params)) return { result: null };
        if (old.fallbackAdmission) return { result: old.fallbackAdmission };
        const value = { status: admitted ? "admitted" : "denied", reasonCode: admitted ? null : "fallback_budget_exhausted", at, expiresAt: new Date(Date.now() + (row.policy.maxDurationSeconds + 30) * 1000).toISOString() };
        return { value: { ...old, fallbackAdmission: value }, result: value };
      });
    }
    if (dialing && (admission?.status !== "admitted" || Date.parse(admission.expiresAt) <= Date.now())) return xml(unavailable());
    const saved = await atomicUpdate(CALLS, callKey, old => currentCall(old, row, params) && old.handoff?.connection!=='live_transfer' && !old.fallbackAttempt && !old.fallbackOutcome ? { value: { ...old, fallbackAttempt: { id: hash(row.id + ":" + params.CallSid + ":fallback"), at: iso(), destination: dialing ? safeFallback(c) : null } }, result: true } : { result: false });
    if (!saved) return xml(unavailable());
    if(dialing){try{if(!await fundPaidVoiceChild(row,c,callKey,'fallback',fundedRemaining===null?row.policy.maxDurationSeconds:Math.min(row.policy.maxDurationSeconds,fundedRemaining),safeFallback(c)))throw new Error('Paid child unavailable');}catch{await atomicUpdate(CALLS,callKey,old=>currentCall(old,row,params)&&old.fallbackAttempt&&!old.fallbackOutcome?{value:{...old,fallbackAttempt:{...old.fallbackAttempt,notEmittedAt:iso()}}}:{});try{await paidVoiceNoEmission(row,c,callKey,'fallback');}catch{}return xml('<Hangup/>');}}
    await change(row.id, old => old.generation === row.generation && old.tenantIdentity === row.tenantIdentity ? { ...old, evidence: { ...old.evidence, fallbackObservedAt: iso(), lastFailureAt: iso() } } : null);
    // Never route an old caller to a replacement owner's phone after a save.
    const latest = await callbackRow(row.callbackToken), latestCall = await strictRead(CALLS, callKey), current = latest && await serving(latest);
    const parentRemaining=paidParentRemaining(latestCall),remaining = admission ? Math.min(row.policy.maxDurationSeconds, Math.floor((Date.parse(admission.expiresAt) - Date.now()) / 1000) - 30,parentRemaining===null?Infinity:parentRemaining) : 0;
    let ready=latest?.generation === row.generation && current?.fallbackAllowed && currentCall(latestCall, latest, params) && !latestCall.fallbackOutcome && (!dialing || remaining > 0);
    if(ready&&dialing){try{ready=await assertPaidVoiceParent(row,current.c,callKey)&&await fundPaidVoiceChild(row,current.c,callKey,'fallback',remaining,safeFallback(current.c));}catch{ready=false;}}
    if(!ready&&dialing){await atomicUpdate(CALLS,callKey,old=>currentCall(old,row,params)&&old.fallbackAttempt&&!old.fallbackOutcome?{value:{...old,fallbackAttempt:{...old.fallbackAttempt,notEmittedAt:iso()}}}:{});try{await paidVoiceNoEmission(row,c,callKey,'fallback');}catch{}}
    return xml(ready?fallback(current.c, latest, params.From, true, remaining, [params.ForwardedFrom, latestCall.forwardedFrom]):unavailable());
  }
  if (kind === "dial-status") {
    if (!call.fallbackAttempt?.destination || params.DialCallSid && !/^CA[a-f0-9]{32}$/i.test(params.DialCallSid)) return json({ error: "call_mismatch" }, 403);
    const reported = typeof params.DialCallStatus === "string" ? params.DialCallStatus.slice(0, 64) : null;
    // This route dials a phone, not a conference. A connection is not human acceptance.
    const status = ["completed", "busy", "no-answer", "failed", "canceled"].includes(reported) && !(reported === "completed" && (!params.DialCallSid || params.DialBridged === "false")) ? reported : "unknown";
    const outcome = await atomicUpdate(CALLS, callKey, old => {
      if (!paidVoiceBound(old,row)||old.number!==params.To||old.from!==params.From||!old.fallbackAttempt?.destination) return { result: null };
      if (old.fallbackOutcome) return { result: old.fallbackOutcome.callSid && params.DialCallSid && old.fallbackOutcome.callSid !== params.DialCallSid ? null : old.fallbackOutcome };
      const value = { status, reportedStatus: reported || null, callSid: params.DialCallSid || null, bridged: params.DialBridged === "true" ? true : params.DialBridged === "false" ? false : null, at: iso() };
      return { value: { ...old, fallbackOutcome: value, twilioStatus: params.CallStatus || null, statusAt: iso() }, result: value };
    });
    if (!outcome) return json({ error: "call_mismatch" }, 403);
    await retainPaidVoiceTerminal(row,c,callKey,'fallback',{status:reported,duration:params.DialCallDuration,providerId:params.DialCallSid||null});
    await change(row.id, old => old.generation === call.generation && old.tenantIdentity === row.tenantIdentity ? { ...old, evidence: { ...old.evidence, fallbackDialStatus: outcome.status, fallbackDialAt: outcome.at, ...(outcome.status === "completed" ? { fallbackAnsweredAt: outcome.at } : { lastFailureAt: outcome.at }) } } : null);
    return xml(outcome.status === "completed" ? "<Hangup/>" : unavailable());
  }
  await atomicUpdate(CALLS, callKey, old => old ? { value: { ...old, twilioStatus: params.CallStatus || params.DialCallStatus || null, statusAt: iso() } } : {});
  await retainPaidVoiceTerminal(row,c,callKey,'parent',{status:params.CallStatus,duration:params.CallDuration,providerId:params.CallSid});
  return json({ ok: true });
}
function callSid(message) { return message.call?.transport?.provider === "twilio" ? message.call.transport.callSid : message.call?.phoneCallProvider === "twilio" ? message.call.phoneCallProviderId : null; }
async function reserveVoiceBudget(row, sid, purpose = "assistant") {
  if (!['assistant','fallback','handoff-primary','handoff-backup'].includes(purpose)) throw new Error('Invalid voice budget purpose');
  const policy = row.policy, seconds = policy.maxDurationSeconds + (purpose !== "assistant" ? 30 : 0), key = hash(row.id + ":" + sid + (purpose !== "assistant" ? ":"+purpose : ""));
  async function reserve(scope, callsLimit, minutesLimit) {
    // Each Houston day has its own key. A delayed old-day request cannot reset
    // a newer day's counters, and an uncertain reservation is never refunded.
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return atomicUpdate("managed_voice_usage", `${scope}/${day}`, async current => {
      const value = current || { version: 1, day, calls: 0, reservedSeconds: 0, reservations: {} };
      if (value.version !== 1 || value.day !== day || !Number.isSafeInteger(value.calls) || !Number.isSafeInteger(value.reservedSeconds) || !value.reservations || typeof value.reservations !== "object") throw new Error("Voice usage budget unavailable");
      if (value.reservations[key]) return { result: true };
      const customer=await strictRead("clients",row.slug);if(!customer||tenant(customer)!==row.tenantIdentity)return {result:false};
      try{await assertPaidServiceAuthority(customer,"voice");}catch{return {result:false};}
      if (value.calls >= callsLimit || value.reservedSeconds + seconds > minutesLimit * 60 || Object.keys(value.reservations).length >= 10000) return { result: false };
      return { value: { ...value, calls: value.calls + 1, reservedSeconds: value.reservedSeconds + seconds, reservations: { ...value.reservations, [key]: { seconds, at: iso() } } }, result: true };
    });
  }
  // Account first. If the tenant write fails, the account reservation is kept;
  // an uncertain write consumes capacity rather than permitting unbounded calls.
  if (!await reserve("account", policy.accountDailyCalls, policy.accountDailyMinutes)) return false;
  return reserve(row.slug + "/" + row.tenantIdentity, policy.maxDailyCalls, policy.maxDailyMinutes);
}
export async function handleManagedVapiWebhook(req, { dispatchTool } = {}) {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || secret.length < 32 || !secureEqual(secret, req.headers.get("x-vapi-secret"))) return json({ error: "forbidden" }, 403);
  const raw = await req.text(); if (Buffer.byteLength(raw) > 256000) return json({ error: "too_large" }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: "json" }, 400); }
  const m = body.message, sid = callSid(m || {}), vapiCallId = m?.call?.id;
  if (!m || !/^CA[a-f0-9]{32}$/i.test(sid || "") || typeof vapiCallId !== "string" || vapiCallId.length > 100 || m.call?.type !== "inboundPhoneCall") return json({ error: "call_mismatch" }, 403);
  // CallSid must already exist from a Twilio-signed inbound event. Search is
  // forbidden: the number's immutable callback token maps to the same intent.
  const phone = m.phoneNumber || m.call.phoneNumber;
  // Per-call lookup index is populated by the signed Twilio entry point below;
  // fall back to no resource, never to a caller supplied business slug.
  const binding = await strictRead("managed_voice_call_index", sid);
  if (!binding?.operationId) return json({ error: "call_mismatch" }, 403);
  const row = await strictRead(STORE, binding.operationId); if (!row) return json({ error: "call_mismatch" }, 403);
  const callKey = row.slug + "/" + sid, call = await strictRead(CALLS, callKey);
  if (!call || call.operationId !== row.id || (call.generation !== row.generation && m.type !== "end-of-call-report") || call.from !== (m.customer?.number || m.call.customer?.number) || m.call.phoneNumberId !== row.imported?.id || m.call.transport?.accountSid && m.call.transport.accountSid !== process.env.TWILIO_ACCOUNT_SID || phone?.number && phone.number !== row.number?.number || phone?.name && phone.name !== `mc-phone-${row.correlationId.slice(0, 30)}`) return json({ error: "call_mismatch" }, 403);
  const { c, valid } = await serving(row);
  if (m.type === "assistant-request") {
    if (!valid) return json({ error: "This line is not accepting AI calls right now. Please contact the shop directly." });
    if (call.endReportAt) return json({ error: "This call has already ended." });
    try{if(!await fundPaidVoiceParent(row,c,callKey,async()=>{const fresh=await strictRead(STORE,row.id),state=fresh&&await serving(fresh);return fresh?.generation===row.generation&&state?.valid?state:null;}))return json({error:'This line cannot accept this call right now.'});}catch{return json({error:'This line cannot accept this call right now.'});}
    const bound = await atomicUpdate(CALLS, callKey, old => old && (!old.vapiCallId || old.vapiCallId === vapiCallId) ? { value: { ...old, vapiCallId, assistantRevision: row.inputRevision, assistantRequestedAt: iso() }, result: true } : { result: false });
    if (!bound) return json({ error: "call_mismatch" }, 403);
    if (!await reserveVoiceBudget(row, sid)) return json({ error: "This line has reached its phone usage limit. Please contact the shop directly." });
    const latestRow = await strictRead(STORE, row.id), latest = await serving(latestRow);
    if (!latest.valid || latestRow.generation !== row.generation || latestRow.inputRevision !== row.inputRevision || latestRow.lifecycle !== row.lifecycle) return json({ error: "This line is not accepting AI calls right now. Please contact the shop directly." });
    // A stored assistant can be mutated after a provider read by an older
    // in-flight PATCH. Serve a transient configuration built from the verified
    // current owner facts instead. Vapi's documented assistant-request contract
    // accepts CreateAssistantDTO; explicit server.headers also authenticate
    // transient tool/report webhooks (no reliance on inherited credentials).
    return json({ assistant: managedAssistantBody(latest.c, { correlationId: latestRow.correlationId, inputRevision: latestRow.inputRevision, policy: latestRow.policy, site: siteUrl() }) });
  }
  if (call.vapiCallId !== vapiCallId || m.assistant?.metadata?.mcVoiceCorrelation && m.assistant.metadata.mcVoiceCorrelation !== row.correlationId || m.assistant?.metadata?.mcVoiceRevision && m.assistant.metadata.mcVoiceRevision !== call.inputRevision) return json({ error: "call_mismatch" }, 403);
  if (m.type === "tool-calls") {
    if (!Array.isArray(m.toolCallList) || m.toolCallList.length > 8) return json({ error: "invalid_tools" }, 400);
    const results = [];
    for (const tool of m.toolCallList) {
      const name = tool.function?.name || tool.name, id = tool.id;
      if (typeof id !== "string" || id.length < 1 || id.length > 100 || !["get_availability", "book_visit", "notify_owner", "request_human"].includes(name)) { results.push({ toolCallId: String(id || ""), error: "Unsupported tool." }); continue; }
      if (!valid || typeof dispatchTool !== "function") { results.push({ toolCallId: id, error: "This request cannot be confirmed. Please ask the caller to contact the shop directly." }); continue; }
      let input = tool.function?.arguments ?? tool.arguments ?? {}; try { if (typeof input === "string") input = JSON.parse(input); } catch { input = null; }
      if (!input || typeof input !== "object" || Array.isArray(input)) { results.push({ toolCallId: id, error: "Invalid tool details." }); continue; }
      // Dispatcher must persist stable effects keyed by call+toolCallId. It
      // returns explicit saved/confirmed delivery statuses, not optimistic text.
      try { const currentRow = await strictRead(STORE, row.id), [latest, currentCall] = await Promise.all([serving(currentRow), strictRead(CALLS, callKey)]); if (!latest.valid || currentRow.generation !== row.generation || !currentCall || currentCall.endReportAt || ["completed", "busy", "failed", "no-answer", "canceled"].includes(currentCall.twilioStatus) || currentCall.vapiCallId !== vapiCallId || currentCall.generation !== currentRow.generation) throw new Error("Workspace or call changed");
        const currentVoice=async()=>{const saved=await strictRead(STORE,row.id),active=await strictRead(CALLS,callKey);if (!saved || saved.generation!==row.generation || !active || active.endReportAt || active.vapiCallId!==vapiCallId || ['completed','busy','failed','no-answer','canceled'].includes(active.twilioStatus)) return null;const state=await serving(saved);return state.valid?state:null;};
        if(!await assertPaidVoiceParent(currentRow,latest.c,callKey))throw new Error('Paid parent unavailable');
        const result = name==='request_human' ? await requestManagedHuman({row:currentRow,call:currentCall,input,site:siteUrl(),reserve:reserveVoiceBudget,redirectCall:args=>createManagedVoiceProvider({executionAllowed:()=>productionPolicy().enabled}).redirectCall(args),current:currentVoice,paid:paidHandoff(currentRow,callKey,currentVoice)}) : await dispatchTool({ client: latest.c, callId: vapiCallId, toolCallId: id, name, input, caller: call.from, operationId: row.id }); results.push({ toolCallId: id, result: typeof result === "string" ? result : JSON.stringify(result) }); }
      catch { results.push({ toolCallId: id, error: "This request could not be confirmed. It may or may not be saved. Do not claim it was booked or delivered, do not promise a callback, and do not repeat this action." }); }
    }
    return json({ results });
  }
  if (m.type === "end-of-call-report") {
    const seconds = Number.isFinite(Date.parse(m.startedAt)) && Number.isFinite(Date.parse(m.endedAt)) ? Math.max(0, Math.round((Date.parse(m.endedAt) - Date.parse(m.startedAt)) / 1000)) : 0;
    const success = /^(customer-ended-call|assistant-ended-call|assistant-said-end-call-phrase|assistant-ended-call-after-message-spoken|assistant-ended-call-with-hangup-task)$/.test(m.endedReason || "") && seconds > 0;
    const transcript = typeof m.artifact?.transcript === "string" ? m.artifact.transcript.slice(0, 12000) : "", summary = typeof m.analysis?.summary === "string" ? m.analysis.summary.slice(0, 2000) : "";
    const saved = await atomicUpdate(CALLS, callKey, old => old && !old.endReportAt ? { value: { ...old, endReportAt: iso(), endedAt: m.endedAt || null, endedReason: String(m.endedReason || "unknown").slice(0, 160), seconds, transcript, summary, successful: success }, result: true } : { result: false });
    if (saved && valid) await change(row.id, old => old.generation === call.generation && (!old.evidence?.lastCallEndedAt || Date.parse(m.endedAt) >= Date.parse(old.evidence.lastCallEndedAt)) ? { ...old, evidence: { ...old.evidence, latestCallOutcome: success ? "success" : "failed", lastCallEndedAt: Number.isFinite(Date.parse(m.endedAt)) ? m.endedAt : iso(), ...(success ? { successfulCallAt: iso() } : { lastFailureAt: iso() }) } } : null);
    return json({ ok: true });
  }
  return json({ ok: true });
}
