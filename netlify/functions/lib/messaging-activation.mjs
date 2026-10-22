// Durable customer-specific US texting registration and proof. No execution is enabled by default.
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { strictRead, normalizeAccountEmail } from "./accounts.mjs";
import { configurationRevision, isSupportedSelfServiceClient } from "./setup.mjs";
import { policyUrls } from "./config.mjs";
import { createTwilioMessagingAdapter } from "./messaging-provider.mjs";
import { getAcquiredPhoneResource, claimPhoneResourceDependency, clearPhoneResourceDependency, getPhoneResourceLifecycle } from "./phone-activation.mjs";

export class MessagingActivationError extends Error { constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; } }
const STORE = "messaging_activation", CLOCK = "messaging_activation_queue";
const APPROVAL_TTL_MS = 24 * 60 * 60000;
const iso = () => new Date().toISOString(), hash = value => createHash("sha256").update(value).digest("hex");
const tenant = c => hash(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)]));
const validSlug = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
const operationId = c => `${c.slug}/${hash("messaging-v1:" + tenant(c))}`;
const validId = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}\/[a-f0-9]{64}$/.test(value);
const US_STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
const closed = c => !["testing", "live"].includes(c?.status);
const reviewed = c => { const revision = configurationRevision(c); return c.build?.status === "built" && c.setupProof?.reviewedRevision === revision && c.setupProof?.testedRevision === revision && c.setupProof?.testMode === "live"; };
const approved = value => value?.profile === "twilio-approved" && value?.trust === "twilio-approved" && value?.brand === "APPROVED" && value?.campaign === "VERIFIED";
const badApproval = value => [value?.profile, value?.trust, value?.brand, value?.campaign].some(state => ["twilio-rejected", "FAILED", "SUSPENDED", "DELETION_PENDING", "DELETION_FAILED", "REJECTED"].includes(state));
export const MESSAGING_STEPS = Object.freeze(["service", "profile", "business", "representative", "address", "address_document", "assign_business", "assign_representative", "assign_address", "assign_primary", "evaluate_profile", "submit_profile", "trust_product", "a2p_business", "assign_a2p_business", "assign_profile", "evaluate_trust", "submit_trust", "brand", "campaign", "sender", "number_webhook"]);
const details = {
  queued: "Your texting setup is saved. We will submit your reviewed business information and keep you updated here.",
  waiting_platform: "Your reviewed request is saved. Texting setup is temporarily unavailable; no new provider work is being started.",
  waiting_number: "Texting setup is waiting for your dedicated business number.",
  paused: "Texting setup is paused with your workspace. Existing registration records are retained.",
  preparing: "Your business and texting registration are being prepared in the background.",
  uncertain: "We are checking a provider response before continuing. The same paid registration will not be filed again automatically.",
  awaiting_approval: "Your registration has been submitted. Carrier review happens in the background; texting is not active yet.",
  needs_action: "Your registration needs a correction. Review the highlighted business details or consent information, then submit the correction here.",
  awaiting_test: "Your registration is approved. Reply to the setup text with its short code to verify two-way delivery.",
  ready: "Texting registration and two-way delivery have been verified.",
  blocked: "Texting delivery is not active. A setup or registration check needs attention.",
  cancel_pending: "Texting cancellation is saved. We are confirming the registration and sender cleanup; records are retained.",
  cancelled: "Texting has been disconnected and recorded sender cleanup is confirmed. Business registration and consent records are retained.",
};
export function buildMessagingProgram(c) {
  const name = String(c.business?.name || "Your service company").trim().slice(0, 100), urls = policyUrls(c.slug), help = c.phone?.businessNumber || c.owner?.email;
  const program = { version: "customer_care_v1",
    description: `${name} sends one-to-one customer care texts about requested home services: answers to questions, appointment confirmations, reminders, arrival updates and requested appointment changes. Messages are sent only after the customer explicitly agrees to texts. This program does not send promotions, purchased-list outreach, review requests or unrelated marketing.`,
    messageFlow: `Customers contact ${name} by website chat, phone or inbound text about a home-service request. Before recurring appointment updates, the front desk names the business and asks for a separate affirmative agreement to receive service texts at the provided number. Consent, number, time and wording version are recorded; booking is available without SMS consent. Frequency varies with service activity. Message and data rates may apply. Reply STOP, ALTO or PARAR to end texts; HELP or AYUDA for assistance. START or EMPEZAR restores a previous opt-out only. Terms: ${urls.terms}. Privacy: ${urls.privacy}. No texting consent is inferred from signup, a missed call or merely providing a number.`,
    messageSamples: [
      `${name}: your requested service visit is confirmed for tomorrow, 8 to 12. We will text when the technician is on the way. Reply STOP to end texts or HELP for help.`,
      `${name}: a reminder about your service appointment tomorrow, 12 to 5. Reply if you need to change it. Message frequency varies. Reply STOP to end texts.`,
      `${name}: the technician is on the way to your service visit. Reply here with a question, HELP for assistance, or STOP to end texts.`,
    ], privacyPolicyUrl: urls.privacy, termsAndConditionsUrl: urls.terms,
    optInMessage: `${name}: you agreed to service and appointment texts. Frequency varies; message and data rates may apply. HELP for help, STOP/ALTO/PARAR to end.`,
    optOutMessage: `${name}: you will receive no more service texts. START or EMPEZAR restores a previous opt-out.`,
    helpMessage: `${name}: help with service texts at ${help}. Reply STOP, ALTO or PARAR to end texts. Message and data rates may apply.`,
  };
  return { ...program, digest: hash(JSON.stringify(program)) };
}
function encryptionKey() {
  const encoded = process.env.PLATFORM_DATA_ENCRYPTION_KEY || process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || Buffer.from(encoded, "base64").length !== 32) throw new MessagingActivationError("private_storage_unavailable", "Secure registration storage is not configured.", 503);
  return Buffer.from(encoded, "base64");
}
function seal(value, identity) { const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce); cipher.setAAD(Buffer.from(identity)); const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]).toString("base64"); return { version: 1, nonce: nonce.toString("base64"), ciphertext, tag: cipher.getAuthTag().toString("base64") }; }
function unseal(value, identity) { if (value?.version !== 1) throw new Error("Unknown private registration format"); const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(value.nonce, "base64")); decipher.setAAD(Buffer.from(identity)); decipher.setAuthTag(Buffer.from(value.tag, "base64")); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64")), decipher.final()]).toString("utf8")); }
function validOffer(value, { allowExpired = false } = {}) {
  const fields = ["brandRegistrationCents", "campaignRegistrationCents", "campaignMonthlyCents", "resubmissionCents"];
  if (!value || !/^[a-z0-9_-]{1,80}$/.test(value.version || "") || value.scope !== "a2p_customer_care" || value.currency !== "USD" || value.country !== "US" || !Number.isFinite(Date.parse(value.expiresAt)) || (!allowExpired && Date.parse(value.expiresAt) <= Date.now()) || !fields.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 100000) || ![0, 1].includes(value.maxResubmissions) || !["usageDisclosure", "authorityText"].every(key => typeof value[key] === "string" && value[key].length >= 20 && value[key].length <= 1500) || !/^https:\/\//.test(value.feeScheduleUrl || "")) throw new MessagingActivationError("invalid_offer", "Complete registration costs, ongoing usage terms and authority wording must be approved before texting setup.", 400);
  return structuredClone(value);
}
const digestOffer = offer => hash(JSON.stringify(offer));
function validateLegal(value) {
  const strings = { legalName: [2, 100], ein: [9, 10], businessType: [3, 20], street: [2, 100], street2: [0, 100], city: [2, 100], state: [2, 2], zip: [5, 10], website: [10, 500] };
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => ![...Object.keys(strings), "representative"].includes(key))) throw new MessagingActivationError("invalid_legal_details", "Check the legal business details.", 400);
  const out = {};
  for (const [key, [min, max]] of Object.entries(strings)) { const text = String(value[key] ?? "").trim(); if (text.length < min || text.length > max || /[\u0000-\u001f]/.test(text)) throw new MessagingActivationError("invalid_legal_details", `Check the ${key === "ein" ? "EIN" : key} field.`, 400); out[key] = text; }
  out.ein = out.ein.replace("-", "");
  if (!/^\d{9}$/.test(out.ein) || !["llc", "corporation", "partnership"].includes(out.businessType) || !US_STATES.has(out.state) || !/^\d{5}(?:-\d{4})?$/.test(out.zip)) throw new MessagingActivationError("invalid_legal_details", "Use a supported US registered business with an EIN, state abbreviation and ZIP code. Sole-proprietor, territory and special registrations need a supported registration path.", 400);
  let website; try { website = new URL(out.website); } catch { /* below */ }
  if (!website || website.protocol !== "https:" || website.username || website.password || !website.hostname.includes(".") || website.hash) throw new MessagingActivationError("invalid_legal_details", "Enter your public HTTPS business website.", 400);
  const rep = value.representative, allowed = ["firstName", "lastName", "email", "phone", "title", "jobPosition"];
  if (!rep || typeof rep !== "object" || Array.isArray(rep) || Object.keys(rep).some(key => !allowed.includes(key))) throw new MessagingActivationError("invalid_representative", "Check the authorized representative details.", 400);
  out.representative = {};
  for (const key of allowed) { const text = String(rep[key] || "").trim(); if (text.length < 1 || text.length > (key === "email" ? 254 : 100) || /[\u0000-\u001f]/.test(text)) throw new MessagingActivationError("invalid_representative", "Complete the authorized representative details.", 400); out.representative[key] = text; }
  out.representative.email = normalizeAccountEmail(out.representative.email);
  if (!out.representative.email || !/^\+1\d{10}$/.test(out.representative.phone) || !["CEO", "CFO", "General_Manager", "VP", "Director", "Other"].includes(out.representative.jobPosition)) throw new MessagingActivationError("invalid_representative", "Use a working representative email, US mobile number and position.", 400);
  return out;
}
async function authorize(c, body) {
  if (!validSlug(c?.slug) || !isSupportedSelfServiceClient(c) || body.actor?.role !== "owner" || normalizeAccountEmail(body.actor.email) !== normalizeAccountEmail(c.owner?.email)) throw new MessagingActivationError("forbidden", "The verified customer must authorize this request.", 403);
  const latest = await strictRead("clients", c.slug);
  if (!latest || !isSupportedSelfServiceClient(latest) || tenant(latest) !== tenant(c)) throw new MessagingActivationError("workspace_unavailable", "This workspace is no longer available.");
  if (body.expectedRevision !== configurationRevision(latest)) throw new MessagingActivationError("configuration_changed", "Review the current business setup before continuing.");
  return latest;
}
function view(row, current) {
  const rulesNeedReview = row.state === "ready" && !reviewed(current), ready = row.state === "ready" && !rulesNeedReview && !row.cancelRequestedAt && !closed(current) && row.programDigest === buildMessagingProgram(current).digest && approved(row.approvals) && row.deliveryProof && Date.now() - Date.parse(row.lastVerifiedAt || "") <= APPROVAL_TTL_MS;
  return { id: row.id, label: "Text messages", state: row.state, active: !!ready, detail: rulesNeedReview ? "Your texting connection is verified. Review and test your current saved business rules before it answers customers." : details[row.state] || details.blocked, createdAt: row.createdAt, updatedAt: row.updatedAt,
    nextCheckAt: row.nextCheckAt || null, reasonCode: rulesNeedReview ? "desk_review_required" : row.reasonCode || null, submissionRevision: row.submissionRevision, customerAction: rulesNeedReview ? "review_current_rules" : row.state === "needs_action" ? "correct_registration" : row.state === "awaiting_test" ? "reply_to_setup_text" : null,
    issues: (row.issues || []).map(item => ({ code: String(item.code).slice(0, 40), field: String(item.field || "").slice(0, 80) })), cancellationRequested: !!row.cancelRequestedAt, cleanupConfirmed: !!row.cleanupConfirmedAt,
    number: row.number?.number || null, stepsCompleted: Object.values(row.steps || {}).filter(step => step.state === "complete").length, stepsTotal: MESSAGING_STEPS.length };
}
async function update(id, fn) { return atomicUpdate(STORE, id, async current => { if (!current) throw new MessagingActivationError("not_found", "Texting setup was not found.", 404); const next = await fn(current); if (!next) return { result: current }; const row = { ...next, updatedAt: iso() }; return { value: row, result: row }; }); }
function fixtureContext() { try { return process.env.NODE_ENV === "test" && process.env.MC_FAKE_MODEL === "1" && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(process.env.URL).hostname); } catch { return false; } }
export function createMessagingActivationEngine(options = {}) { if (!fixtureContext()) throw new MessagingActivationError("fixture_only", "Fixture adapters are unavailable outside isolated local tests.", 503); return engine(options); }
function engine({ provider, offer: suppliedOffer, gate = false, allowExpiredOffer = false, resolveNumber = getAcquiredPhoneResource, claimParent = claimPhoneResourceDependency, clearParent = clearPhoneResourceDependency, parentLifecycle = getPhoneResourceLifecycle } = {}) {
  const offer = validOffer(suppliedOffer, { allowExpired: allowExpiredOffer }), digest = digestOffer(offer), enabled = () => (typeof gate === "function" ? gate() : gate) === true;
  if (!provider || !["preflight", "execute", "reconcile", "approvals", "usecase", "verify", "verifyProbe", "cleanup"].every(name => typeof provider[name] === "function")) throw new Error("An explicit messaging provider is required");
  const quote = () => ({ ...structuredClone(offer), digest, available: enabled() });
  async function request(c, body = {}) {
    const current = await authorize(c, body);
    if (!enabled() || Date.parse(offer.expiresAt) <= Date.now()) throw new MessagingActivationError("messaging_setup_unavailable", "Texting setup is not available yet.");
    if (closed(current)) throw new MessagingActivationError("workspace_inactive", "Texting setup requires an active workspace.");
    if (!reviewed(current)) throw new MessagingActivationError("desk_review_required", "Review and test your current saved business rules before requesting texting setup.");
    if (![body.authority, body.acceptedCosts, body.attestLegalAccuracy, body.attestConsent, body.testPhoneConsent].every(value => value === true) || body.offerVersion !== offer.version || body.offerDigest !== digest || !/^[a-f0-9]{32,64}$/i.test(body.submissionId || "")) throw new MessagingActivationError("acceptance_required", "Review the registration, costs, authority and separate setup-text agreement.", 400);
    const program = buildMessagingProgram(current);
    if (body.programDigest !== program.digest) throw new MessagingActivationError("program_changed", "Review the texting program before continuing.");
    const legal = validateLegal(body.legal);
    if (!/^\+1\d{10}$/.test(current.owner?.phone || "")) throw new MessagingActivationError("test_phone_required", "Save the mobile number that will receive the setup text first.", 400);
    const id = operationId(current), input = { legal, program }, inputHash = hash(JSON.stringify(input)), privateData = seal(input, id), at = iso();
    const row = await atomicUpdate(STORE, id, old => {
      if (old) { if (old.tenantIdentity !== tenant(current)) throw new MessagingActivationError("intent_conflict", "This setup belongs to a different workspace."); if (old.inputHash !== inputHash || old.offerDigest !== digest) throw new MessagingActivationError("correction_required", "Use the existing registration correction instead of creating another registration."); return { result: old }; }
      const row = { version: 1, id, slug: current.slug, tenantIdentity: tenant(current), correlationId: hash("messaging-correlation:" + id), inputRevision: body.expectedRevision, inputHash, programDigest: program.digest,
        privateData, offer: structuredClone(offer), offerDigest: digest, state: "queued", createdAt: at, updatedAt: at, submissionRevision: 1, steps: {}, resources: {}, cleanup: {},
        inboundUrl: `${new URL(process.env.URL || "https://machinesandcloud.com").origin}/api/managed-sms`, statusUrl: `${new URL(process.env.URL || "https://machinesandcloud.com").origin}/api/managed-sms/status`, notifyEmail: normalizeAccountEmail(process.env.TWILIO_NOTIFY_EMAIL || process.env.ADMIN_EMAILS?.split(",")[0] || current.owner.email),
        authority: { actorEmail: normalizeAccountEmail(body.actor.email), acceptedAt: at, offerDigest: digest, programDigest: program.digest, legalAccuracy: true, explicitConsumerConsent: true, customerAuthority: true, costsAccepted: true, testPhoneConsent: true, testPhone: current.owner.phone }, history: [{ at, type: "customer_authorized", actorEmail: normalizeAccountEmail(body.actor.email) }], reasonCode: null };
      return { value: row, result: row };
    });
    return view(row, current);
  }
  async function correct(c, body = {}) {
    const current = await authorize(c, body), id = operationId(current), old = await strictRead(STORE, id);
    if (!reviewed(current)) throw new MessagingActivationError("desk_review_required", "Review and test your current saved business rules before correcting texting setup.");
    if (!old || body.operationId !== id || old.tenantIdentity !== tenant(current)) throw new MessagingActivationError("not_found", "The registration was not found.", 404);
    if (old.state !== "needs_action" || old.cancelRequestedAt || body.expectedSubmissionRevision !== old.submissionRevision) throw new MessagingActivationError("registration_changed", "Refresh the current registration before correcting it.");
    if (old.submissionRevision > offer.maxResubmissions || !enabled() || Date.parse(offer.expiresAt) <= Date.now() || closed(current) || body.offerVersion !== offer.version || body.offerDigest !== digest || ![body.authority, body.acceptedCosts, body.attestLegalAccuracy, body.attestConsent, body.testPhoneConsent].every(value => value === true)) throw new MessagingActivationError("correction_acceptance_required", "A current correction offer and your renewed acceptance are required.");
    const program = buildMessagingProgram(current); if (body.programDigest !== program.digest) throw new MessagingActivationError("program_changed", "Review the current texting program.");
    if (old.resources.campaign && program.digest !== old.programDigest) throw new MessagingActivationError("program_change_not_supported", "This registered texting program needs a supported migration before its wording can change. Existing registration records have been retained.");
    const input = { legal: validateLegal(body.legal), program }, at = iso();
    const row = await update(id, row => {
      if (row.submissionRevision !== body.expectedSubmissionRevision || row.state !== "needs_action" || row.cancelRequestedAt || (row.claim && Date.parse(row.claim.until) > Date.now())) throw new MessagingActivationError("registration_changed", "A registration operation is already in progress.");
      const correctionSteps = ["business", "representative", "address", ...(row.resources.brand && row.approvals?.brand === "FAILED" ? ["brand"] : []), ...(row.resources.campaign ? ["campaign"] : [])].filter(name => row.resources[name]);
      const steps = { ...row.steps }; for (const name of ["evaluate_profile", "submit_profile", "evaluate_trust", "submit_trust"]) if (steps[name]) delete steps[name];
      for (const name of correctionSteps) steps["correct_" + name] = { state: "pending" };
      return { ...row, state: "queued", privateData: seal(input, id), inputHash: hash(JSON.stringify(input)), programDigest: program.digest, inputRevision: body.expectedRevision, submissionRevision: row.submissionRevision + 1,
        steps, correctionSteps: correctionSteps.map(name => "correct_" + name), approvals: null, deliveryProof: null, lastVerifiedAt: null, probe: null, reasonCode: null, issues: [], claim: null, nextCheckAt: null,
        offer: structuredClone(offer), offerDigest: digest, authority: { ...row.authority, actorEmail: normalizeAccountEmail(body.actor.email), acceptedAt: at, offerDigest: digest, programDigest: program.digest, testPhone: current.owner.phone }, history: [...row.history, { at, type: "customer_corrected", actorEmail: normalizeAccountEmail(body.actor.email), submissionRevision: row.submissionRevision + 1 }].slice(-50) };
    }); return view(row, current);
  }
  async function cancel(c, id, body = {}) {
    const current = await authorize(c, body); if (id !== operationId(current)) throw new MessagingActivationError("not_found", "The texting request was not found.", 404);
    const row = await cancelInternal(current, "customer_requested", body.actor.email); return view(row, current);
  }
  async function cancelInternal(c, reason = "parent_cancelled", actorEmail = null) {
    const id = operationId(c), current = await strictRead(STORE, id); if (!current || current.tenantIdentity !== tenant(c)) return null;
    return update(id, row => row.cancelRequestedAt ? null : ({ ...row, state: "cancel_pending", cancelRequestedAt: iso(), reasonCode: reason, nextCheckAt: null, history: [...row.history, { at: iso(), type: "cancellation_requested", actorEmail, reason }].slice(-50) }));
  }
  const wire = row => ({ ...row, ...unseal(row.privateData, row.id) });
  async function run(id, { deadlineAt = Date.now() + 15000 } = {}) {
    if (!validId(id)) throw new MessagingActivationError("not_found", "The texting request was not found.", 404);
    let row = await strictRead(STORE, id); if (!row) throw new MessagingActivationError("not_found", "The texting request was not found.", 404);
    let current = await strictRead("clients", row.slug);
    if (!current || !isSupportedSelfServiceClient(current) || row.tenantIdentity !== tenant(current)) return view(await update(id, old => ({ ...old, state: "blocked", reasonCode: "workspace_identity_changed" })), current);
    const parent = await parentLifecycle(current);
    if (["cancelled", "archived"].includes(current.status) || parent?.cancelRequestedAt || parent?.cancellationRequested === true) row = await cancelInternal(current);
    if (row.state === "cancelled") return view(row, current);
    if (!enabled() || (await strictRead("health", "brake"))?.on === true) return view(await update(id, old => ({ ...old, state: old.cancelRequestedAt ? "cancel_pending" : "waiting_platform", reasonCode: "product_gate_closed" })), current);
    if (row.nextCheckAt && Date.parse(row.nextCheckAt) > Date.now() && !row.cancelRequestedAt) return view(row, current);
    if (closed(current) && !row.cancelRequestedAt) return view(await update(id, old => ({ ...old, state: "paused", reasonCode: "workspace_paused" })), current);
    if (row.programDigest !== buildMessagingProgram(current).digest && !row.cancelRequestedAt) return view(await update(id, old => ({ ...old, state: "needs_action", reasonCode: "business_program_changed", issues: [{ code: "business_program_changed", field: "business" }] })), current);
    const token = randomBytes(16).toString("hex");
    row = await update(id, old => old.claim && Date.parse(old.claim.until) > Date.now() ? null : ({ ...old, claim: { token, until: new Date(Date.now() + 60000).toISOString() } }));
    if (row.claim?.token !== token) return view(row, current);
    const change = fn => update(id, old => old.claim?.token === token ? fn(old) : null);
    const authorizeWrite = async (cleanup = false) => { const [latest, job, brake] = await Promise.all([strictRead("clients", row.slug), strictRead(STORE, id), strictRead("health", "brake")]), parent = latest ? await parentLifecycle(latest) : null; return enabled() && brake?.on !== true && Date.now() < deadlineAt && latest && isSupportedSelfServiceClient(latest) && tenant(latest) === row.tenantIdentity && job?.claim?.token === token && job.submissionRevision === row.submissionRevision && (cleanup ? !!job.cancelRequestedAt : !job.cancelRequestedAt && !parent?.cancelRequestedAt && parent?.cancellationRequested !== true && !closed(latest) && job.programDigest === buildMessagingProgram(latest).digest); };
    try {
      if (!row.number && !row.cancelRequestedAt) {
        const number = await resolveNumber(current);
        if (!number || !/^PN[a-f0-9]{32}$/i.test(number.id || "") || !/^\+1\d{10}$/.test(number.number || "")) return view(await change(old => ({ ...old, state: "waiting_number", reasonCode: "number_unavailable", claim: null, nextCheckAt: new Date(Date.now() + 600000).toISOString() })), current);
        row = await change(old => ({ ...old, number: { sid: number.id, number: number.number, intentId: number.intentId }, reasonCode: null }));
      }
      // After a crash or timeout, reconcile the recorded write before any later step.
      const uncertain = Object.entries(row.steps).find(([, step]) => ["dispatching", "uncertain"].includes(step.state));
      if (uncertain) {
        const [name] = uncertain, found = await provider.reconcile({ row: wire(row), name });
        if (found?.status !== "found") return view(await change(old => ({ ...old, state: old.cancelRequestedAt ? "cancel_pending" : "uncertain", reasonCode: found?.reasonCode || "provider_write_unconfirmed", steps: { ...old.steps, [name]: { ...old.steps[name], state: "uncertain" } }, claim: null, nextCheckAt: new Date(Date.now() + 600000).toISOString() })), current);
        row = await change(old => ({ ...old, resources: { ...old.resources, [name]: { ...found.resource, recordedAt: iso() } }, resourceHistory: old.resources[name]?.sid && old.resources[name].sid !== found.resource.sid ? [...(old.resourceHistory || []), { name, ...old.resources[name] }].slice(-100) : old.resourceHistory || [], steps: { ...old.steps, [name]: { ...old.steps[name], state: "complete", completedAt: iso() } }, reasonCode: null }));
      }
      if (row.cancelRequestedAt) {
        for (const name of ["campaign", "sender", "service"]) {
          if (!row.resources[name] || row.cleanup[name]?.confirmedAt) continue;
          row = await change(old => ({ ...old, cleanup: { ...old.cleanup, [name]: { state: "dispatching", startedAt: iso() } } }));
          const receipt = await provider.cleanup({ row: wire(row), name, authorize: () => authorizeWrite(true) });
          if (!receipt?.confirmed) return view(await change(old => ({ ...old, state: "cancel_pending", reasonCode: "cleanup_unconfirmed", claim: null })), current);
          row = await change(old => ({ ...old, cleanup: { ...old.cleanup, [name]: { state: "complete", confirmedAt: iso() } } }));
        }
        if (row.parentClaimed || row.parentClaimStartedAt) await clearParent(current, { kind: "messaging", operationId: id, cleanupConfirmed: true });
        return view(await change(old => ({ ...old, state: "cancelled", cleanupConfirmedAt: iso(), claim: null, reasonCode: null, nextCheckAt: null })), current);
      }
      if (row.state === "needs_action") return view(await change(old => ({ ...old, claim: null })), current);
      const feeWorkPending = [...MESSAGING_STEPS, ...(row.correctionSteps || [])].some(name => row.steps[name]?.state !== "complete");
      if (feeWorkPending && (row.offerDigest !== digest || Date.parse(row.offer.expiresAt) <= Date.now())) return view(await change(old => ({ ...old, state: "blocked", reasonCode: "offer_expired_or_changed", claim: null })), current);
      await provider.preflight(wire(row));
      if (!row.parentClaimed) { row = await change(old => ({ ...old, parentClaimStartedAt: old.parentClaimStartedAt || iso() })); await claimParent(current, { kind: "messaging", operationId: id }); row = await change(old => ({ ...old, parentClaimed: true })); }
      const plan = MESSAGING_STEPS.map(name => row.correctionSteps?.includes("correct_" + name) ? "correct_" + name : name);
      const name = plan.find(name => row.steps[name]?.state !== "complete");
      if (name) {
        if (["campaign", "correct_campaign", "sender", "number_webhook"].includes(name)) {
          const approvals = await provider.approvals(wire(row)); row = await change(old => ({ ...old, approvals, issues: approvals.issues || [] }));
          if (badApproval(name === "correct_campaign" ? { ...approvals, campaign: null } : approvals)) return view(await change(old => ({ ...old, state: "needs_action", reasonCode: "registration_correction_required", issues: approvals.issues?.length ? approvals.issues : [{ code: "provider_registration_rejected", field: "business_and_consent" }], claim: null, nextCheckAt: null })), current);
          if (approvals.brand !== "APPROVED" || (!["campaign", "correct_campaign"].includes(name) && approvals.campaign !== "VERIFIED")) return view(await change(old => ({ ...old, state: "awaiting_approval", reasonCode: null, claim: null, nextCheckAt: new Date(Date.now() + 600000).toISOString() })), current);
          if (["campaign", "correct_campaign"].includes(name) && !await provider.usecase(wire(row))) return view(await change(old => ({ ...old, state: "needs_action", reasonCode: "customer_care_usecase_unavailable", issues: [{ code: "customer_care_usecase_unavailable", field: "program" }], claim: null })), current);
        }
        // A platform account-wide rate lease keeps paid brand/campaign dispatches >=1s apart.
        if (["brand", "campaign", "correct_brand", "correct_campaign"].includes(name)) {
          const allowed = await atomicUpdate(CLOCK, "paid_rate_v1", old => Date.parse(old?.until || "") > Date.now() ? { result: false } : { value: { until: new Date(Date.now() + 1100).toISOString() }, result: true });
          if (!allowed) return view(await change(old => ({ ...old, claim: null, nextCheckAt: new Date(Date.now() + 2000).toISOString() })), current);
        }
        row = await change(old => ({ ...old, state: "preparing", steps: { ...old.steps, [name]: { state: "dispatching", startedAt: iso(), submissionRevision: old.submissionRevision } }, reasonCode: null }));
        if (!await authorizeWrite()) return view(await change(old => ({ ...old, state: old.cancelRequestedAt ? "cancel_pending" : "paused", steps: { ...old.steps, [name]: { state: "pending" } }, claim: null, reasonCode: "dispatch_not_authorized" })), current);
        const resource = await provider.execute({ row: wire(row), name, authorize: () => authorizeWrite() });
        if (!resource || typeof resource.sid !== "string" || !/^[A-Z]{2}[a-f0-9]{32}$/i.test(resource.sid)) throw new Error("The provider resource receipt is invalid");
        row = await change(old => ({ ...old, resources: { ...old.resources, [name]: { ...resource, recordedAt: iso() } }, resourceHistory: old.resources[name]?.sid && old.resources[name].sid !== resource.sid ? [...(old.resourceHistory || []), { name, ...old.resources[name] }].slice(-100) : old.resourceHistory || [], steps: { ...old.steps, [name]: { ...old.steps[name], state: "complete", completedAt: iso() } }, state: old.cancelRequestedAt ? "cancel_pending" : resource.compliant === false ? "needs_action" : "preparing", issues: resource.issues || old.issues, reasonCode: resource.compliant === false ? "registration_correction_required" : null, claim: null, nextCheckAt: null }));
        return view(row, current);
      }
      const approvals = await provider.approvals(wire(row));
      if (!approved(approvals)) return view(await change(old => ({ ...old, approvals, state: badApproval(approvals) ? "needs_action" : "awaiting_approval", reasonCode: badApproval(approvals) ? "registration_correction_required" : null, issues: approvals.issues?.length ? approvals.issues : badApproval(approvals) ? [{ code: "provider_registration_rejected", field: "business_and_consent" }] : [], claim: null, nextCheckAt: new Date(Date.now() + 600000).toISOString() })), current);
      if (!await provider.verify(wire(row))) return view(await change(old => ({ ...old, approvals, state: "blocked", reasonCode: "sender_route_mismatch", claim: null, nextCheckAt: new Date(Date.now() + 600000).toISOString() })), current);
      row = await change(old => {
        const probe = old.probe || (() => { const nonce = randomBytes(4).toString("hex").toUpperCase(); return { nonce, to: old.authority.testPhone, body: `${current.business.name}: your texting setup check. Reply ${nonce} to verify this connection. This is one setup text you requested; no recurring signup is created.`, createdAt: iso(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }; })();
        return { ...old, approvals, probe, state: old.deliveryProof ? "ready" : "awaiting_test", lastVerifiedAt: iso(), claim: null, reasonCode: Date.parse(probe.expiresAt) <= Date.now() && !old.deliveryProof ? "setup_reply_expired" : null, nextCheckAt: new Date(Date.now() + 600000).toISOString() };
      }); return view(row, current);
    } catch (error) {
      row = await change(old => {
        const dispatched = Object.entries(old.steps).find(([, step]) => step.state === "dispatching"), steps = { ...old.steps };
        if (dispatched) steps[dispatched[0]] = { ...steps[dispatched[0]], state: error?.code === "dispatch_not_authorized" ? "pending" : "uncertain" };
        return { ...old, steps, state: old.cancelRequestedAt ? "cancel_pending" : dispatched && error?.code !== "dispatch_not_authorized" ? "uncertain" : "blocked", reasonCode: error?.code === "dispatch_not_authorized" ? "dispatch_not_authorized" : dispatched ? "provider_write_unconfirmed" : "provider_or_storage_check_failed", claim: null, nextCheckAt: new Date(Date.now() + 600000).toISOString() };
      }); return view(row, current);
    }
  }
  async function prove(c, ids = {}) {
    const current = await strictRead("clients", c.slug), id = operationId(c), row = await strictRead(STORE, id);
    if (!current || tenant(current) !== tenant(c) || !row || row.tenantIdentity !== tenant(c) || ids.operationId !== id || row.cancelRequestedAt || closed(current) || row.state !== "awaiting_test" || !enabled() || Date.parse(row.probe?.expiresAt || "") < Date.now()) throw new MessagingActivationError("proof_unavailable", "This setup check is no longer available.");
    if (!await provider.verifyProbe(wire(row), ids) || !approved(await provider.approvals(wire(row))) || !await provider.verify(wire(row))) throw new MessagingActivationError("delivery_unconfirmed", "Two-way delivery has not been confirmed.");
    const saved = await update(id, async old => {
      const latest = await strictRead("clients", row.slug), parent = latest ? await parentLifecycle(latest) : null;
      if (!latest || !isSupportedSelfServiceClient(latest) || tenant(latest) !== row.tenantIdentity || closed(latest) || old.programDigest !== buildMessagingProgram(latest).digest || old.cancelRequestedAt || old.submissionRevision !== row.submissionRevision || parent?.cancellationRequested || parent?.cancelRequestedAt) throw new MessagingActivationError("proof_unavailable", "This setup check changed before delivery could be confirmed.");
      return { ...old, state: "ready", deliveryProof: { outboundMessageSid: ids.outboundMessageSid, inboundMessageSid: ids.inboundMessageSid, confirmedAt: iso() }, lastVerifiedAt: iso(), nextCheckAt: new Date(Date.now() + 600000).toISOString(), reasonCode: null };
    });
    return view(saved, await strictRead("clients", c.slug));
  }
  async function recover({ limit = 1 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new MessagingActivationError("invalid_limit", "Use a bounded texting recovery batch.", 400);
    const keys = (await list(STORE, "")).filter(validId).sort();
    const chosen = await atomicUpdate(CLOCK, "cursor_v1", old => { if (!keys.length) return { result: [] }; let at = keys.findIndex(key => key > (old?.after || "")); if (at < 0) at = 0; const chosen = [...keys.slice(at), ...keys.slice(0, at)].slice(0, limit); return { value: { after: chosen.at(-1) }, result: chosen }; });
    const outcomes = [];
    const deadlineAt = Date.now() + 15000;
    for (const id of chosen) { try { let row; for (let checkpoint = 0; checkpoint < 3 && Date.now() < deadlineAt - 1000; checkpoint++) { row = await run(id, { deadlineAt }); if (row.state !== "preparing" || row.nextCheckAt) break; } outcomes.push(row || { state: "blocked", reasonCode: "messaging_deadline_reached", active: false }); } catch { outcomes.push({ state: "blocked", reasonCode: "messaging_storage_unavailable", active: false }); } }
    return { processed: chosen.length, total: keys.length, scope: "bounded_fair_cursor", outcomes };
  }
  return { request, correct, cancel, cancelInternal, run, recover, prove, quote };
}
function policy() {
  try { const offer = validOffer(JSON.parse(process.env.MESSAGING_ACTIVATION_OFFER_JSON || "null"), { allowExpired: true }); encryptionKey(); return { offer, offerCurrent: Date.parse(offer.expiresAt) > Date.now(), enabled: process.env.MESSAGING_ACTIVATION_ENABLED === "true" && process.env.MESSAGING_ACTIVATION_APPROVED_VERSION === offer.version && process.env.SERVICE_DELIVERY_ENABLED === "true" && (process.env.SERVICE_WORKER_KEY || "").length >= 32 && /^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID || "") && /^BU[a-f0-9]{32}$/i.test(process.env.TWILIO_PRIMARY_PROFILE_SID || "") && !!process.env.TWILIO_AUTH_TOKEN && (!!(process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET) || !process.env.TWILIO_API_KEY) }; } catch { return { offer: null, offerCurrent: false, enabled: false }; }
}
function production(deadlineAt = null) { const p = policy(); if (!p.offer) throw new MessagingActivationError("messaging_setup_unavailable", "Texting setup is not available yet."); const gate = () => { const latest = policy(); return latest.enabled && digestOffer(latest.offer) === digestOffer(p.offer); }; return engine({ provider: createTwilioMessagingAdapter({ executionAllowed: gate, deadlineAt }), offer: p.offer, gate, allowExpiredOffer: true }); }
async function owned(c) { if (!validSlug(c?.slug) || !isSupportedSelfServiceClient(c)) return null; const row = await strictRead(STORE, operationId(c)); return row?.tenantIdentity === tenant(c) ? row : null; }
export async function messagingActivationStatus(c) { const row = await owned(c), p = policy(), program = buildMessagingProgram(c), enabled = p.enabled && (await strictRead("health", "brake"))?.on !== true; return { available: enabled && p.offerCurrent, active: !!(enabled && row && view(row, c).active), state: row?.state || "unavailable", detail: row ? details[row.state] || details.blocked : "Texting setup is not available yet. Preferences do not purchase or register service.", offer: enabled && p.offerCurrent ? { ...p.offer, digest: digestOffer(p.offer) } : null, program, operation: row ? { ...view(row, c), active: !!(enabled && view(row, c).active) } : null }; }
export async function requestMessagingActivation(c, body) { const p = policy(); if (!p.enabled || !p.offerCurrent) throw new MessagingActivationError("messaging_setup_unavailable", "Texting setup is not available yet."); return production().request(c, body); }
export async function correctMessagingActivation(c, body) { const p = policy(); if (!p.enabled || !p.offerCurrent) throw new MessagingActivationError("messaging_setup_unavailable", "Texting corrections are temporarily unavailable."); return production().correct(c, body); }
export async function cancelMessagingActivation(c, id, body = {}) { const current = await authorize(c, body); if (id !== operationId(current)) throw new MessagingActivationError("not_found", "The texting request was not found.", 404); const row = await owned(current); if (!row) throw new MessagingActivationError("not_found", "The texting request was not found.", 404); return view(await update(id, old => old.cancelRequestedAt ? null : ({ ...old, state: "cancel_pending", cancelRequestedAt: iso(), reasonCode: "customer_requested", nextCheckAt: null, history: [...old.history, { at: iso(), type: "cancellation_requested", actorEmail: normalizeAccountEmail(body.actor.email) }].slice(-50) })), current); }
export async function requestMessagingCancellationForPhone(c) { const row = await owned(c); if (!row) return { blocksRelease: false, cleanupConfirmed: true }; if (!row.cancelRequestedAt) await update(row.id, old => ({ ...old, state: "cancel_pending", cancelRequestedAt: iso(), reasonCode: "parent_cancelled", nextCheckAt: null })); return messagingCleanupStatus(c); }
export async function messagingCleanupStatus(c) { const row = await owned(c), possiblyClaimed = row?.parentClaimed || row?.parentClaimStartedAt; return { blocksRelease: !!possiblyClaimed && !row.cleanupConfirmedAt, cleanupConfirmed: !row || !!row.cleanupConfirmedAt || !possiblyClaimed, operationId: row?.id || null, state: row?.state || "absent" }; }
export async function messagingSender(c) { const current = validSlug(c?.slug) ? await strictRead("clients", c.slug) : null, row = current && tenant(current) === tenant(c) ? await owned(current) : null, parent = current ? await getAcquiredPhoneResource(current) : null; if (!policy().enabled || (await strictRead("health", "brake"))?.on === true || !row || !view(row, current).active || parent?.id !== row.number.sid || parent?.number !== row.number.number || row.programDigest !== buildMessagingProgram(current).digest) return null; return { serviceSid: row.resources.service.sid, numberSid: row.number.sid, number: row.number.number, operationId: row.id }; }
export async function pendingMessagingProbe(c) { const current = validSlug(c?.slug) ? await strictRead("clients", c.slug) : null, row = current && tenant(current) === tenant(c) ? await owned(current) : null, parent = current ? await getAcquiredPhoneResource(current) : null; if (!policy().enabled || (await strictRead("health", "brake"))?.on === true || !row || row.state !== "awaiting_test" || row.cancelRequestedAt || closed(current) || parent?.id !== row.number.sid || parent?.number !== row.number.number || !row.authority.testPhoneConsent || Date.parse(row.probe?.expiresAt || "") <= Date.now()) return null; return { operationId: row.id, to: row.probe.to, from: row.number.number, serviceSid: row.resources.service.sid, body: row.probe.body, nonce: row.probe.nonce, expiresAt: row.probe.expiresAt }; }
export async function findMessagingClientByNumber(number) { if (!/^\+1\d{10}$/.test(number || "")) return null; const keys = (await list(STORE, "")).filter(validId); let found = null; for (const key of keys) { const row = await strictRead(STORE, key); if (row?.number?.number !== number || !row.resources?.service) continue; const c = await strictRead("clients", row.slug); if (!c || !isSupportedSelfServiceClient(c) || row.tenantIdentity !== tenant(c)) continue; const parent = await getPhoneResourceLifecycle(c); if (!parent || parent.released || parent.resourceId !== row.number.sid || parent.resource?.number !== number) continue; if (found) return null; found = c; } return found; }
export async function messagingInboundBinding(c) { const current = validSlug(c?.slug) ? await strictRead("clients", c.slug) : null, row = current && isSupportedSelfServiceClient(current) && tenant(current) === tenant(c) ? await owned(current) : null, parent = current ? await getPhoneResourceLifecycle(current) : null; if (!row?.resources?.service || !parent || parent.released || parent.resourceId !== row.number?.sid || parent.resource?.number !== row.number.number || !Number.isFinite(Date.parse(row.createdAt))) return null; return { serviceSid: row.resources.service.sid, numberSid: row.number.sid, number: row.number.number, since: row.createdAt, operationId: row.id }; }
export async function recordMessagingProbe(c, ids) { return production(Date.now() + 15000).prove(c, ids); }
export async function messagingRecoveryHealth() { const keys = (await list(STORE, "")).filter(validId), rows = await Promise.all(keys.slice(0, 50).map(key => strictRead(STORE, key))), pending = rows.filter(row => row && row.state !== "cancelled"), unresolved = pending.filter(row => ["uncertain", "blocked", "cancel_pending"].includes(row.state)), overdue = pending.filter(row => row.state === "ready" && (!Number.isFinite(Date.parse(row.lastVerifiedAt || "")) || Date.now() - Date.parse(row.lastVerifiedAt) > APPROVAL_TTL_MS)).length, partial = keys.length > 50, enabled = policy().enabled; return { ok: !partial && unresolved.length === 0 && overdue === 0 && (enabled || pending.length === 0), enabled, total: keys.length, inspected: rows.length, pending: pending.length, unresolved: unresolved.length, overdue, scope: "bounded_candidates", reasonCode: partial ? "messaging_scope_partial" : overdue ? "messaging_approval_check_overdue" : !enabled && pending.length ? "product_gate_closed" : null }; }
export async function continueMessagingActivation(c, { deadlineAt = Date.now() + 15000, maxSteps = 3 } = {}) { if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 3 || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now() || deadlineAt > Date.now() + 60000) throw new MessagingActivationError("invalid_continuation", "Use a bounded texting continuation.", 400); const row = await owned(c); if (!row) return null; const worker = production(deadlineAt); let result; for (let n = 0; n < maxSteps && Date.now() < deadlineAt - 1000; n++) { result = await worker.run(row.id, { deadlineAt }); if (result.state !== "preparing" || result.nextCheckAt) break; } return result || view(row, c); }
export async function recoverMessagingActivations({ limit = 1, deadlineAt = Date.now() + 15000 } = {}) { if (!Number.isInteger(limit) || limit < 1 || limit > 1 || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now() || deadlineAt > Date.now() + 15000) throw new MessagingActivationError("invalid_deadline", "Texting recovery requires one operation and a short deadline.", 400); const p = policy(); if (!p.enabled || (await strictRead("health", "brake"))?.on === true) return { ...await messagingRecoveryHealth(), enabled: false, processed: 0, reasonCode: "product_gate_closed", outcomes: [] }; const result = await production(deadlineAt).recover({ limit }), health = await messagingRecoveryHealth(); return { ...health, ok: health.ok && result.outcomes.every(row => !["uncertain", "blocked"].includes(row.state)), enabled: true, processed: result.processed, scope: result.scope, outcomes: result.outcomes.map(row => ({ state: row.state, reasonCode: row.reasonCode || null })) }; }
