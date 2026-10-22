// First irreversible number step. The production gate is OFF by default.
// No HTTP caller chooses its adapter, execution policy, quote or fixture mode.
import { createHash, randomBytes } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { strictRead, normalizeAccountEmail } from "./accounts.mjs";
import { configurationRevision, isSupportedSelfServiceClient } from "./setup.mjs";
import { createTwilioNumberAdapter } from "./phone-twilio.mjs";

export class PhoneActivationError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const STORE = "phone_activation_intents", QUEUE = "phone_activation_queue", KEY = "active_v1";
const hash = value => createHash("sha256").update(value).digest("hex");
const iso = () => new Date().toISOString();
const tenant = c => hash(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)]));
const validSlug = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
const validId = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}\/[a-f0-9]{64}$/.test(value);
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
  return { id: row.id, state: row.state, active: false, label: "Phone setup", detail: detail(row.state),
    createdAt: row.createdAt, updatedAt: row.updatedAt, nextCheckAt: row.nextCheckAt || null,
    cancellationRequested: !!row.cancelRequestedAt, number: row.resource?.number || null,
    resourceRecorded: !!row.resource?.id, releaseConfirmed: !!row.releasedAt, reasonCode: row.reasonCode || null };
}
export async function phoneActivationStatus(c) {
  if (!validSlug(c?.slug) || !isSupportedSelfServiceClient(c)) return { available: false, active: false, state: "unavailable", detail: "Phone setup is not available for this workspace.", offer: null, operation: null };
  const rows = await Promise.all((await list(STORE, c.slug + "/")).map(key => strictRead(STORE, key)));
  const latest = rows.filter(row => row?.tenantIdentity === tenant(c)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))[0];
  const policy = productionPolicy();
  return { available: policy.enabled, active: false, state: latest?.state || "unavailable", detail: latest ? detail(latest.state) : "Phone setup is not available yet. No number will be purchased from signup or connection preferences.", offer: policy.enabled ? { ...policy.offer, digest: offerDigest(policy.offer) } : null, operation: latest ? phoneActivationView(latest) : null };
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
function localFixtureContext() {
  try { return process.env.NODE_ENV === "test" && process.env.MC_FAKE_MODEL === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.URL).hostname); } catch { return false; }
}
function offerDigest(offer) { return hash(JSON.stringify(offer)); }
function validateOffer(offer) {
  if (!offer || typeof offer.version !== "string" || !/^[a-z0-9_-]{1,80}$/.test(offer.version) || offer.currency !== "USD" || offer.scope !== "number_acquisition_only" || offer.country !== "US" || !/^[2-9]\d{2}$/.test(offer.areaCode || "") || !Number.isFinite(Date.parse(offer.expiresAt)) || Date.parse(offer.expiresAt) <= Date.now() || ![offer.oneTimeCents, offer.monthlyCents, offer.maxAcquisitionCents].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 100000) || typeof offer.authorityText !== "string" || offer.authorityText.length < 20 || offer.authorityText.length > 1000) throw new PhoneActivationError("invalid_offer", "A complete approved quote and authority statement are required.", 400);
  return structuredClone(offer);
}
function queueValue(value) {
  if (!value) return { version: 1, intents: {}, cursor: "" };
  if (value.version !== 1 || !value.intents || typeof value.intents !== "object" || Array.isArray(value.intents) || typeof value.cursor !== "string") throw new Error("Phone activation queue unavailable");
  return value;
}
async function enqueue(row, cancellation) {
  const queueToken = randomBytes(16).toString("hex");
  await atomicUpdate(QUEUE, KEY, value => {
    const queue = queueValue(value), previous = queue.intents[row.id];
    if (previous && !cancellation) return {};
    if (!previous && Object.keys(queue.intents).length >= 1000) throw new PhoneActivationError("queue_full", "Phone setup is temporarily busy.", 503);
    return { value: { ...queue, intents: { ...queue.intents, [row.id]: { ...row, queueToken, ...(cancellation ? { cancellation } : {}) } } } };
  });
}
async function ensure(intent) {
  return atomicUpdate(STORE, intent.id, current => {
    if (current && current.tenantIdentity !== intent.tenantIdentity) throw new Error("Phone intent identity conflict");
    if (current) return { result: current };
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
  return atomicUpdate(STORE, id, current => {
    if (!current) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
    const next = update(current); return next ? { value: { ...next, updatedAt: iso() }, result: { ...next, updatedAt: iso() } } : { result: current };
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
  return change(intent.id, current => {
    if (current.cancelRequestedAt) return null;
    return { ...current, cancelRequestedAt: intent.cancellation.at, cancellationActor: intent.cancellation.actor,
      state: current.resource && !current.releasedAt ? "cleanup_pending" : current.purchaseStartedAt && !current.releasedAt ? "uncertain" : "cancelled", nextCheckAt: null };
  });
}
async function saveCancellation(c, id, { actor, expectedRevision } = {}) {
  const current = await authorizeCustomer(c, actor, expectedRevision);
  if (!validId(id) || !id.startsWith(current.slug + "/")) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
  const row = await strictRead(STORE, id); if (!row || row.tenantIdentity !== tenant(current)) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
  const cancellation = { actor: { role: "owner", email: normalizeAccountEmail(actor.email) }, at: iso() };
  await enqueue(row, cancellation); return phoneActivationView(await applyCancellation({ ...row, cancellation }));
}

export function createPhoneActivationEngine({ provider, offer: suppliedOffer, gate = false } = {}) {
  if (!localFixtureContext()) throw new PhoneActivationError("fixture_only", "Provider execution is unavailable outside isolated local tests.", 503);
  return phoneEngine({ provider, offer: suppliedOffer, gate });
}
function phoneEngine({ provider, offer: suppliedOffer, gate = false }) {
  if (!provider || !["acquire", "lookup", "release"].every(name => typeof provider[name] === "function")) throw new Error("The fixture requires explicit acquire, lookup and release adapters");
  const offer = validateOffer(suppliedOffer), digest = offerDigest(offer), enabled = () => typeof gate === "function" ? gate() === true : gate === true;
  const quote = () => ({ ...structuredClone(offer), digest, available: enabled(), fixtureOnly: true });
  async function request(c, body = {}) {
    const current = await authorizeCustomer(c, body.actor, body.expectedRevision);
    if (!enabled()) throw new PhoneActivationError("phone_setup_unavailable", "Phone setup is not available yet. No number was purchased.");
    if (!["testing", "live"].includes(current.status)) throw new PhoneActivationError("workspace_inactive", "Phone setup requires an active workspace.");
    if (body.offerVersion !== offer.version || body.offerDigest !== digest || body.acceptedCosts !== true || body.authority !== true || typeof body.submissionId !== "string" || !/^[a-f0-9]{32,64}$/i.test(body.submissionId)) throw new PhoneActivationError("acceptance_required", "Review the quote and confirm your authority before continuing.", 400);
    // One first-acquisition intent per customer identity, independent of browser
    // retry keys. A new tab or a changed submission ID cannot buy a second number.
    const id = `${current.slug}/${hash("first-phone-acquisition:" + tenant(current))}`, prior = await strictRead(STORE, id);
    if (prior) { if (prior.tenantIdentity !== tenant(current) || prior.inputRevision !== body.expectedRevision || prior.offerDigest !== digest) throw new PhoneActivationError("intent_conflict", "This request was already used for another setup."); return phoneActivationView(prior); }
    const row = { version: 1, id, slug: current.slug, tenantIdentity: tenant(current), inputRevision: body.expectedRevision,
      correlationId: hash("phone-acquire-v1:" + id + ":" + tenant(current)), state: "queued", createdAt: iso(), updatedAt: iso(),
      offer: structuredClone(offer), offerDigest: digest, authority: { actor: { role: "owner", email: normalizeAccountEmail(body.actor.email) }, acceptedAt: iso(), costsAccepted: true, authorityAccepted: true },
      generation: 0, purchaseAttempts: 0, reconciliationAttempts: 0, cleanupAttempts: 0, reasonCode: null };
    await enqueue(row); return phoneActivationView(await ensure(row));
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
      const found = await provider.lookup({ correlationId: row.correlationId, resourceId: row.resource?.id || null });
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
      const released = await provider.release({ correlationId: row.correlationId, resourceId: row.resource.id });
      if (released?.confirmed !== true || released.resourceId !== row.resource.id) throw new Error("Release not confirmed");
      return change(row.id, current => current.cleanupClaim === token ? { ...current, state: "cancelled", releasedAt: iso(), releaseReceipt: { resourceId: row.resource.id, confirmedAt: iso() }, reasonCode: null } : null);
    } catch { return change(row.id, current => current.cleanupClaim === token ? { ...current, state: "cleanup_uncertain", reasonCode: "release_result_unconfirmed", nextCheckAt: null } : null); }
  }
  async function run(id) {
    if (!validId(id)) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
    let row = await strictRead(STORE, id); if (!row) throw new PhoneActivationError("not_found", "The phone request was not found.", 404);
    if (row.nextCheckAt && Date.parse(row.nextCheckAt) > Date.now()) return phoneActivationView(row);
    const current = await strictRead("clients", row.slug);
    if (!current || !isSupportedSelfServiceClient(current) || tenant(current) !== row.tenantIdentity) return phoneActivationView(await change(id, old => ({ ...old, state: old.purchaseStartedAt ? "needs_review" : "cancelled", reasonCode: "workspace_unavailable" })));
    if (row.cancelRequestedAt) return phoneActivationView(await (row.resource ? cleanup(row) : row.purchaseStartedAt ? lookup(row) : change(id, old => ({ ...old, state: "cancelled" }))));
    if (terminal(row.state)) return phoneActivationView(row);
    if (row.purchaseStartedAt) {
      if (row.state === "running" && Date.parse(row.claim?.until) > Date.now()) return phoneActivationView(row);
      row = await change(id, old => ({ ...old, state: "uncertain", reasonCode: "acquisition_result_unconfirmed", claim: null }));
      return phoneActivationView(await lookup(row));
    }
    if (!["testing", "live"].includes(current.status) || configurationRevision(current) !== row.inputRevision) return phoneActivationView(await change(id, old => ({ ...old, state: ["cancelled", "archived"].includes(current.status) ? "cancelled" : "superseded", reasonCode: "configuration_changed" })));
    if (!enabled()) return phoneActivationView(await change(id, old => ({ ...old, state: "waiting_platform", reasonCode: "product_gate_closed" })));
    if (row.offerDigest !== digest) return phoneActivationView(await change(id, old => ({ ...old, state: "needs_review", reasonCode: "quote_changed" })));
    const token = randomBytes(16).toString("hex");
    row = await change(id, old => old.purchaseStartedAt || terminal(old.state) || old.cancelRequestedAt || old.inputRevision !== row.inputRevision || old.correlationId !== row.correlationId ? null : ({ ...old, state: "running", generation: old.generation + 1, purchaseAttempts: old.purchaseAttempts + 1, purchaseStartedAt: iso(), claim: { token, until: new Date(Date.now() + 60000).toISOString() } }));
    if (row.claim?.token !== token) return phoneActivationView(row);
    // Recheck the product gate after the durable claim and before the adapter.
    if (!enabled()) return phoneActivationView(await change(id, old => old.claim?.token === token ? { ...old, state: "waiting_platform", purchaseStartedAt: null, claim: null, reasonCode: "product_gate_closed" } : null));
    const authorizeDispatch = async () => {
      const [latestClient, latestIntent] = await Promise.all([strictRead("clients", row.slug), strictRead(STORE, id)]);
      return enabled() && !!latestClient && isSupportedSelfServiceClient(latestClient) && tenant(latestClient) === row.tenantIdentity && ["testing", "live"].includes(latestClient.status) && configurationRevision(latestClient) === row.inputRevision && latestIntent?.claim?.token === token && !latestIntent.cancelRequestedAt;
    };
    const stoppedBeforeDispatch = () => change(id, old => old.claim?.token === token && !old.resource ? { ...old, state: old.cancelRequestedAt ? "cancelled" : "superseded", purchaseStartedAt: null, claim: null, reasonCode: "dispatch_not_authorized" } : null);
    if (!await authorizeDispatch()) return phoneActivationView(await stoppedBeforeDispatch());
    try { return phoneActivationView(await recordResource(row, await provider.acquire({ intentId: row.id, correlationId: row.correlationId, offer: row.offer, authorizeDispatch }))); }
    catch (error) {
      if (error?.code === "dispatch_not_authorized") return phoneActivationView(await stoppedBeforeDispatch());
      return phoneActivationView(await change(id, old => old.resource ? null : ({ ...old, state: "uncertain", reasonCode: "acquisition_result_unconfirmed", nextCheckAt: null, claim: null })));
    }
  }
  async function recover({ limit = 10 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new PhoneActivationError("invalid_limit", "Choose a bounded recovery limit.", 400);
    const intents = await atomicUpdate(QUEUE, KEY, value => {
      const queue = queueValue(value), keys = Object.keys(queue.intents).sort(); if (!keys.length) return { result: [] };
      let start = keys.findIndex(key => key > queue.cursor); if (start < 0) start = 0;
      const chosen = [...keys.slice(start), ...keys.slice(0, start)].slice(0, limit);
      return { value: { ...queue, cursor: chosen.at(-1) }, result: chosen.map(key => queue.intents[key]) };
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
    const offer = validateOffer(JSON.parse(process.env.PHONE_ACTIVATION_OFFER_JSON || "null"));
    const enabled = process.env.PHONE_ACQUISITION_ENABLED === "true" && process.env.PHONE_ACTIVATION_APPROVED_VERSION === offer.version &&
      /^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || "") && !!((process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET) || process.env.TWILIO_AUTH_TOKEN);
    return { enabled, offer };
  } catch { return { enabled: false, offer: null }; }
}
function productionEngine(deadlineAt = null) {
  const policy = productionPolicy();
  if (!policy.offer) throw new PhoneActivationError("phone_setup_unavailable", "Phone setup is not available yet. No number was purchased.");
  const gate = () => { const current = productionPolicy(); return current.enabled && offerDigest(current.offer) === offerDigest(policy.offer); };
  return phoneEngine({ provider: createTwilioNumberAdapter({ executionAllowed: gate, deadlineAt }), offer: policy.offer, gate });
}
export async function requestPhoneActivation(c, body) {
  if (!productionPolicy().enabled) throw new PhoneActivationError("phone_setup_unavailable", "Phone setup is not available yet. No number was purchased.");
  return productionEngine().request(c, body);
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
export async function recoverPhoneActivations({ limit = 1, deadlineAt = Date.now() + 15000 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1 || !Number.isFinite(deadlineAt) || deadlineAt > Date.now() + 15000 || deadlineAt <= Date.now()) throw new PhoneActivationError("invalid_recovery_limit", "Phone recovery must use one bounded operation.", 400);
  if (!productionPolicy().enabled || (await strictRead("health", "brake"))?.on === true) {
    const pending = await pendingPhoneWork({ repair: true });
    return { ok: pending.pending === 0, enabled: false, processed: 0, skipped: "Phone execution is disabled; saved work is retained", reasonCode: pending.pending > pending.inspected ? "phone_scope_partial" : "product_gate_closed", scope: "bounded_candidates", ...pending, outcomes: [] };
  }
  const recovery = await productionEngine(deadlineAt).recover({ limit }), pending = await pendingPhoneWork();
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
