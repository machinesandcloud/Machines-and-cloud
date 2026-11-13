// Operator-applied opt-outs and the plain-language review queue (legal precondition P9).
// An opt-out that arrives by email, by phone or in the customer's own words is turned into the same
// suppression a STOP creates, on every store a text can be sent from:
// - legacy `optouts/<phone>` (read by legacy sendSMS; read by the managed outbox once optout-health OH-1 lands),
// - every existing managed `managed_sms_consent/<slug>/<tenant>/<phone>` row,
// - the M&C platform ledger directive for the current binding,
// - queued legacy tasks for that number.
// An email address is added to `prospect_suppression`, which marketing eligibility already reads.
import { createHash, randomBytes } from "node:crypto";
import { atomicUpdate, list, put, cancelTasksForNumber } from "./store.mjs";
import { strictRead, normalizeAccountEmail, accountKey } from "./accounts.mjs";
import { suppressPlatformContact } from "./platform-sms.mjs";

export class OptOutRequestError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const CHANNELS = ["email", "phone_call", "text", "letter", "other"];
const digest = value => createHash("sha256").update(String(value)).digest("hex");
const stamp = () => new Date().toISOString();
export function normalizeOptOutPhone(value) {
  const d = String(value || "").replace(/[^\d+]/g, "");
  const e = d.startsWith("+") ? d : d.length === 10 ? "+1" + d : d.length === 11 && d.startsWith("1") ? "+" + d : "";
  return /^\+1[2-9]\d{9}$/.test(e) ? e : "";
}

async function suppressPhone(phone, at, source) {
  const applied = { legacy: false, managedRows: 0, platform: null, tasksCancelled: 0 };
  await atomicUpdate("optouts", phone, previous => ({ value: previous ? { ...previous, operatorAt: previous.operatorAt || at, source: previous.source || source } : { at, slug: "", words: source, source } }));
  applied.legacy = true;
  for (const key of await list("managed_sms_consent", "")) {
    if (!key.endsWith("/" + phone)) continue;
    await atomicUpdate("managed_sms_consent", key, row => {
      if (!row || row.phone !== phone) return {};
      return { value: { ...row, suppressed: true, transactional: false, pendingAsk: null, lastAffirmation: null, stoppedAt: row.suppressed ? row.stoppedAt : at, stopSource: row.suppressed ? row.stopSource || "keyword" : source, directiveDate: Math.max(Number(row.directiveDate) || 0, Date.parse(at)), updatedAt: at } };
    });
    applied.managedRows++;
  }
  applied.platform = await suppressPlatformContact(phone, Date.parse(at));
  applied.tasksCancelled = await cancelTasksForNumber(phone);
  return applied;
}

export async function applyOperatorOptOut(actor, body) {
  const allowed = ["action", "contact", "requestChannel", "reason", "requestText", "reviewId"];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new OptOutRequestError("invalid_request", "Unexpected opt-out fields.");
  if (!CHANNELS.includes(body.requestChannel)) throw new OptOutRequestError("invalid_request", "Choose how the request arrived.");
  if (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 300) throw new OptOutRequestError("invalid_request", "Add a short reason (3 to 300 characters).");
  if (body.requestText !== undefined && (typeof body.requestText !== "string" || body.requestText.length > 2000)) throw new OptOutRequestError("invalid_request", "The request text is too long.");
  const raw = typeof body.contact === "string" ? body.contact.trim() : "";
  const phone = normalizeOptOutPhone(raw), email = phone ? "" : normalizeAccountEmail(raw);
  if (!phone && !email) throw new OptOutRequestError("invalid_contact", "Enter a US mobile number or an email address.");
  const at = stamp(), source = "operator_request";
  let applied;
  if (phone) applied = await suppressPhone(phone, at, source);
  else {
    await atomicUpdate("prospect_suppression", accountKey(email), previous => previous ? {} : { value: { reason: source, requestChannel: body.requestChannel, at } });
    applied = { email: true };
  }
  const id = randomBytes(12).toString("hex");
  // The audit keeps a digest and a hint, not the contact itself; the suppression rows hold what is needed.
  await put("optout_requests", id, { id, at, actor, contactType: phone ? "phone" : "email", contactDigest: digest(phone || email), contactHint: phone ? "…" + phone.slice(-4) : "@" + email.split("@")[1], requestChannel: body.requestChannel, reason: body.reason.trim(), requestDigest: body.requestText ? digest(body.requestText) : null, applied });
  if (typeof body.reviewId === "string" && /^[a-f0-9]{64}$/.test(body.reviewId)) await atomicUpdate("optout_review", body.reviewId, row => row ? { value: { ...row, state: "applied", resolvedAt: at, resolvedBy: actor, requestId: id } } : {});
  return { ok: true, id, contactType: phone ? "phone" : "email", applied };
}

// An inbound plain-language opt-out (detector level "certain") on the platform or managed line is applied
// through the keyword path. A "review" match is only queued here; it never suppresses by itself.
export async function recordOptOutReview({ line, slug = "", phone, text, messageSid = "", reason }) {
  if (!normalizeOptOutPhone(phone)) return null;
  const id = digest(JSON.stringify([line, slug, phone, messageSid || text]));
  await atomicUpdate("optout_review", id, previous => previous ? {} : { value: { id, line, slug, phone, text: String(text || "").slice(0, 300), reason, state: "open", at: stamp() } });
  return id;
}
export async function dismissOptOutReview(actor, body) {
  if (Object.keys(body).some(key => !["action", "reviewId", "reason"].includes(key)) || !/^[a-f0-9]{64}$/.test(body.reviewId || "") || typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.length > 300) throw new OptOutRequestError("invalid_request", "Choose a review item and add a short reason.");
  const at = stamp();
  const row = await atomicUpdate("optout_review", body.reviewId, previous => previous ? { value: { ...previous, state: "dismissed", resolvedAt: at, resolvedBy: actor, resolution: body.reason.trim() }, result: true } : { result: false });
  if (!row) throw new OptOutRequestError("not_found", "This review item was not found.", 404);
  return { ok: true, reviewId: body.reviewId, state: "dismissed" };
}
export async function optOutReviewView({ limit = 50 } = {}) {
  const rows = [];
  for (const key of await list("optout_review", "")) { const row = await strictRead("optout_review", key); if (row?.state === "open") rows.push(row); }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
