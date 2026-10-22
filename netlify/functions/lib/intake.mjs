// Public acquisition is a lead record, never account authority or a provider order.
import { createHash } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { normalizeAccountEmail, accountKey, strictRead, findVerifiedAccount } from "./accounts.mjs";

export class IntakeError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const hash = value => createHash("sha256").update(value).digest("hex");
const stamp = () => new Date().toISOString();
const tokenValid = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const INTAKE_GOALS = ["missed_calls", "after_hours", "booking", "follow_up", "spanish", "other"];
export const INTAKE_CHANNELS = ["web", "voice", "sms", "calendar"];
export const MARKETING_WORDING = "Email me practical tips, product updates and offers from Machines & Cloud. Unsubscribe anytime.";
export const MARKETING_VERSION = "email_updates_v1_2026_10_22";
const source = "homepage_get_started";
const text = (value, max, required = true) => {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new IntakeError("invalid_fields", "Please check your answers and try again.");
  const result = value.trim();
  if (required && !result) throw new IntakeError("invalid_fields", "Please complete your name, email and business.");
  return result;
};
function normalize(body) {
  const allowed = new Set(["submissionId", "name", "email", "business", "trade", "goal", "marketingConsent", "botfield"]);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new IntakeError("invalid_fields", "Please check your answers and try again.");
  if (typeof body.submissionId !== "string" || !/^(?:[a-f0-9]{32,64}|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(body.submissionId)) throw new IntakeError("invalid_submission", "Please refresh the form and try again.");
  const email = normalizeAccountEmail(text(body.email, 254));
  if (!email) throw new IntakeError("invalid_email", "Enter a valid email address.");
  const trade = body.trade === undefined ? "" : text(body.trade, 30, false);
  if (trade && !["hvac", "plumbing", "electrical", "cleaning", "landscaping", "roofing", "other"].includes(trade)) throw new IntakeError("invalid_fields", "Choose a business type from the list.");
  const goal = body.goal === undefined ? "" : text(body.goal, 40, false);
  if (goal && !INTAKE_GOALS.includes(goal)) throw new IntakeError("invalid_fields", "Choose a goal from the list.");
  if (typeof body.marketingConsent !== "boolean") throw new IntakeError("invalid_consent", "Please check the email preference and try again.");
  return { name: text(body.name, 120), email, business: text(body.business, 160), trade, primaryGoal: goal, marketingRequested: body.marketingConsent };
}
async function spendRate(key, limit, duration) {
  const allowed = await atomicUpdate("intake_rate", key, previous => {
    const now = Date.now(), row = previous?.until > now ? previous : { count: 0, until: now + duration };
    return row.count >= limit ? { result: false } : { value: { count: row.count + 1, until: row.until }, result: true };
  });
  if (!allowed) throw new IntakeError("rate_limited", "Please wait a few minutes before trying again.", 429);
}

export async function captureIntake(body, ip) {
  const fields = normalize(body);
  const submissionKey = hash(body.submissionId.toLowerCase());
  // The 128+ bit browser submission secret gives retries the same opaque handoff.
  // Neither browser secret nor raw handoff is stored in the database.
  const handoff = hash("mc-intake-v1:" + body.submissionId.toLowerCase()), handoffHash = hash(handoff);
  const payloadHash = hash(JSON.stringify(fields));
  const prior = await strictRead("intake_submissions", submissionKey);
  if (prior && prior.payloadHash !== payloadHash) throw new IntakeError("submission_changed", "This form was already submitted. Start a new form to change your answers.", 409);
  if (!prior) {
    await spendRate("global", 200, 3600000);
    await spendRate("ip:" + hash(String(ip || "unknown")), 8, 600000);
    await spendRate("email:" + accountKey(fields.email), 3, 3600000);
  }
  const reservation = await atomicUpdate("intake_submissions", submissionKey, current => {
    if (current) {
      if (current.payloadHash !== payloadHash) throw new IntakeError("submission_changed", "This form was already submitted. Start a new form to change your answers.", 409);
      return { result: current };
    }
    const row = { version: 1, payloadHash, handoffHash, createdAt: stamp(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
    return { value: row, result: row };
  });
  if (Date.parse(reservation.expiresAt) <= Date.now()) throw new IntakeError("intake_expired", "Start a new form to continue.", 410);
  await atomicUpdate("prospects", accountKey(fields.email), current => {
    // Repeated public submissions cannot replace a prospect, withdraw consent,
    // promote consent, remove suppression or alter an existing account.
    if (current) return {};
    const initialRequest = { requested: fields.marketingRequested, version: MARKETING_VERSION, wording: MARKETING_WORDING, source, recordedAt: reservation.createdAt };
    return { value: { version: 1, ...fields, submissionKey, source, createdAt: reservation.createdAt, emailVerifiedAt: null, marketing: { ...initialRequest, initialRequest, preference: false, confirmedAt: null, suppressedAt: null } } };
  });
  await atomicUpdate("intake_handoffs", handoffHash, current => {
    if (current) return {};
    return { value: { version: 1, email: fields.email, fields: { name: fields.name, business: fields.business, ...(fields.trade ? { trade: fields.trade } : {}), ...(fields.primaryGoal ? { primaryGoal: fields.primaryGoal } : {}) }, submissionKey, createdAt: reservation.createdAt, expiresAt: reservation.expiresAt, status: "pending" } };
  });
  return { ok: true, handoff, expiresAt: reservation.expiresAt, next: `/onboard.html#intake=${handoff}` };
}

// Returns an internal hash only. The public route never reads a lead back.
export async function intakeBindingForEmail(token, email) {
  if (!tokenValid(token)) return null;
  const key = hash(token), row = await strictRead("intake_handoffs", key);
  return row?.email === email && row.status === "pending" && Date.parse(row.expiresAt) > Date.now() ? key : null;
}
export async function adoptIntake(session, handoffHash) {
  if (!tokenValid(handoffHash)) return false;
  const claim = await atomicUpdate("intake_handoffs", handoffHash, current => {
    if (!current || current.email !== session.email || Date.parse(current.expiresAt) <= Date.now()) return { result: null };
    if (current.status !== "pending" && current.claimedBy !== session.sessionHash) return { result: null };
    if (current.status === "adopted") return { result: current };
    const row = { ...current, status: "claimed", claimedBy: session.sessionHash, claimedAt: current.claimedAt || stamp() };
    return { value: row, result: row };
  });
  if (!claim) return false;
  if (claim.status === "adopted") return true;
  const existing = await findVerifiedAccount(session.email);
  if (!existing) await atomicUpdate("onboarding_drafts", accountKey(session.email), current => {
    if (current?.intakeApplied?.includes(handoffHash)) return {};
    const fields = { ...(current?.fields || {}) };
    // A saved blank can be an intentional deletion. Only absent answers adopt
    // preliminary values; never replay over any saved owner answer.
    for (const [key, value] of Object.entries(claim.fields)) if (!Object.hasOwn(fields, key)) fields[key] = value;
    return { value: { ...(current || { step: 0 }), fields, intakeApplied: [...(current?.intakeApplied || []), handoffHash], revision: (current?.revision || 0) + 1, updatedAt: stamp() } };
  });
  await atomicUpdate("prospects", accountKey(session.email), current => current ? { value: { ...current, emailVerifiedAt: current.emailVerifiedAt || stamp(), verifiedFields: { ...claim.fields }, verifiedFieldsAt: stamp() } } : {});
  await atomicUpdate("intake_handoffs", handoffHash, current => current?.claimedBy === session.sessionHash && current.status !== "adopted" ? { value: { ...current, status: "adopted", adoptedAt: stamp() } } : {});
  return true;
}
export async function attachIntake(session, token) {
  if (!tokenValid(token) || !await adoptIntake(session, hash(token))) throw new IntakeError("intake_unavailable", "Those starting details are no longer available. You can continue with your saved setup.", 409);
}
export async function marketingState(email) {
  const [row, suppressed, draft] = await Promise.all([strictRead("prospects", accountKey(email)), strictRead("prospect_suppression", accountKey(email)), strictRead("onboarding_drafts", accountKey(email))]);
  const currentPreference = draft?.emailPreference?.preference === true && draft.emailPreference.revision === row?.marketing?.draftRevision;
  return { preference: !!row?.emailVerifiedAt && currentPreference && row?.marketing?.preference === true && !!row?.marketing?.confirmedAt && !row?.marketing?.suppressedAt && !suppressed, pendingRequest: row?.marketing?.requested === true && !row?.marketing?.confirmedAt && !row?.marketing?.declinedAt && !draft?.emailPreference, suppressed: !!suppressed || !!row?.marketing?.suppressedAt };
}
export async function saveMarketingPreference(session, preference, draftRevision) {
  if (typeof preference !== "boolean") throw new IntakeError("invalid_consent", "Please check the email preference and try again.");
  if (!Number.isInteger(draftRevision) || draftRevision < 1) throw new IntakeError("invalid_consent", "Please save the email preference in your setup.");
  const key = accountKey(session.email), suppressed = await strictRead("prospect_suppression", key);
  await atomicUpdate("prospects", key, current => {
    // Public submissions cannot change consent. Explicit verified preferences
    // can undo a previous local opt-out, but never provider/operator suppression.
    const row = current || { version: 1, email: session.email, source: "verified_setup", createdAt: stamp() };
    const marketing = row.marketing || {};
    if ((marketing.draftRevision || 0) >= draftRevision) return {};
    if (preference && (suppressed || marketing.suppressedAt)) return { value: { ...row, emailVerifiedAt: row.emailVerifiedAt || stamp() } };
    const at = stamp(), consent = { preference, version: MARKETING_VERSION, wording: MARKETING_WORDING, source: "verified_setup", at };
    return { value: { ...row, emailVerifiedAt: row.emailVerifiedAt || at, marketing: { ...marketing, requested: marketing.requested === true || preference, preference, draftRevision, version: MARKETING_VERSION, wording: MARKETING_WORDING, source: "verified_setup", confirmedAt: preference ? at : marketing.confirmedAt || null, updatedAt: at, declinedAt: preference ? null : at, unsubscribedAt: preference ? null : marketing.preference === true ? at : marketing.unsubscribedAt || null, history: [...(marketing.history || []), consent].slice(-100) } } };
  });
  return marketingState(session.email);
}
const csvCell = value => {
  const text = String(value ?? "");
  return '"' + (/^\s*[=+\-@]/.test(text) || /^[\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"';
};
export async function prospectAudience(audience = "all") {
  const out = [];
  for (const key of await list("prospects", "")) {
    const [row, suppression, draft] = await Promise.all([strictRead("prospects", key), strictRead("prospect_suppression", key), strictRead("onboarding_drafts", key)]);
    if (!row) continue;
    const eligible = !!row.emailVerifiedAt && draft?.emailPreference?.preference === true && draft.emailPreference.revision === row.marketing?.draftRevision && row.marketing?.preference === true && !!row.marketing?.confirmedAt && !row.marketing?.suppressedAt && !suppression;
    if (audience === "eligible" && !eligible) continue;
    const fields = row.verifiedFields || row;
    out.push({ name: fields.name || "", email: row.email, business: fields.business || "", trade: fields.trade || "", goal: fields.primaryGoal || "", capturedAt: row.createdAt, emailVerifiedAt: row.emailVerifiedAt || null, marketingEligible: eligible, marketingRequested: row.marketing?.requested === true, marketingConfirmedAt: row.marketing?.confirmedAt || null, suppressed: !!suppression || !!row.marketing?.suppressedAt, consentVersion: row.marketing?.version || null, consentWording: row.marketing?.wording || null, consentSource: row.marketing?.source || null, consentRecordedAt: row.marketing?.updatedAt || row.marketing?.recordedAt || null });
  }
  return out;
}
export function prospectsCSV(rows) {
  const keys = ["name", "email", "business", "trade", "goal", "capturedAt", "emailVerifiedAt", "marketingEligible", "marketingRequested", "marketingConfirmedAt", "suppressed", "consentVersion", "consentWording", "consentSource", "consentRecordedAt"];
  return [keys.join(","), ...rows.map(row => keys.map(key => csvCell(row[key])).join(","))].join("\r\n");
}
