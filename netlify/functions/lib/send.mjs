// Outbound messages: SMS through Twilio, email through Resend. Each degrades to a
// console log when its keys are missing, so the rest of the system keeps working.
import { isSelfServiceClient } from "./setup.mjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { get, put, del, logEvent, atomicUpdate } from "./store.mjs";

const TW_SID = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const RESEND = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "Machines & Cloud <desk@machinesandcloud.com>";
export const STEVE_EMAIL = process.env.STEVE_EMAIL || "ngoumnaisteve@gmail.com";
export const STEVE_PHONE = process.env.STEVE_PHONE || "";

export const smsEnabled = () => Boolean(TW_SID && TW_TOKEN);
export const emailEnabled = () => Boolean(RESEND);

export function e164(raw) {
  if (!raw) return "";
  const d = String(raw).replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d ? "+" + d : "";
}

// Opt-outs are stored per destination number; nothing is ever sent to an opted-out number.
// 12-03 rev 3: the read is strict (store.get() turns a storage error into "no record", which failed open).
// optOutStatus: true = opted out, false = may text, null = store unreadable. optedOut treats unreadable as
// opted out, so every send decision fails closed; sendSMS holds and logs the text (sms_held).
export async function optOutStatus(to) {
  try { return Boolean(await atomicUpdate("optouts", e164(to), (current) => ({ result: current }))); }
  catch (error) { console.error("opt-out store unreadable", error?.message); return null; }
}
export const optedOut = async (to) => (await optOutStatus(to)) !== false;
// Rev 4 (QA-12 r3 F1): the write is tried 3 times (150 ms, 300 ms apart), so one storage blip does not lose a STOP.
// Returns whether the opt-out is stored. If not, it logs opt_out_unrecorded and emails the operator; the caller
// (sms.mjs) confirms only what something enforces.
export async function recordOptOut(to, slug, words) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await put("optouts", e164(to), { at: new Date().toISOString(), slug, words }); return true; }
    catch (e) { error = e; if (attempt < 2) await new Promise((r) => setTimeout(r, 150 * (attempt + 1))); }
  }
  console.error("opt-out not recorded", error?.message);
  await logEvent(slug, "opt_out_unrecorded", { to: e164(to) }).catch(() => {});
  await notifySteve(`Opt-out not recorded: ${slug}`, `An opt-out from ${e164(to)} (${slug}), "${String(words || "").slice(0, 40)}", could not be saved after 3 tries (${String(error?.message || error).slice(0, 120)}). Record it by hand. A Twilio default keyword (STOP, END, ...) was confirmed and is blocked by Twilio on that sender only; any other wording was not confirmed and the customer was asked to reply STOP. Texts to this number are held only while the opt-out store is unreadable.`).catch(() => {});
  return false;
}
export async function clearOptOut(to) { await del("optouts", e164(to)); }

/**
 * sendSMS({ to, from, body, client, messagingServiceSid })
 * - Refuses opted-out numbers (and holds the text when the opt-out state is unreadable). There is no override: an owner's STOP blocks owner texts too
 *   (they fall back to email through notifyOwner/textOwner).
 *   A send from the shared platform sender also honors a STOP recorded by /api/platform-sms.
 * - Sends through a Messaging Service when one is given (carrier opt-out handling applies).
 * - A shop texts only from its own carrier-approved number. The shared Machines & Cloud number
 *   (MC_TWILIO_NUMBER / MC_MESSAGING_SERVICE_SID) belongs to M&C's own Customer Care campaign and is
 *   never used for a shop's texts (legal precondition P1, owner decision B8 a). Without an approved
 *   sender the text is refused with reason "no_registered_sender" when Twilio is configured.
 */
// Scheduled customer texts (reminders and follow-ups) leave only from the shop's own approved registration.
// Until then they are held, never sent through the platform campaign or an unregistered number (legal-audit G1).
export const REGISTERED_ONLY_TYPES = ["reminder_24h", "reminder_1h", "review_request", "review_nudge", "quote_check", "lead_chase", "referral_ask", "payment_reminder", "consent_ask", "maintenance_reminder"];
export const ownSenderApproved = (client) => Boolean(client?.phone?.twilioNumber && client.phone.tenDlc === "approved");
export const hasRegisteredSender = ownSenderApproved;
export async function sendSMS({ to, from, body, client, messagingServiceSid, type = "sms" }) {
  if (isSelfServiceClient(client)) return { ok: false, reason: "channel_not_active" };
  to = e164(to);
  if (!to || !body) return { ok: false, reason: "missing" };
  const optOut = await optOutStatus(to);
  // Unknown opt-out state: hold the text (not sent, not thrown) so owner alerts still fall through to email.
  if (optOut === null) { if (client) await logEvent(client, "sms_held", { to, type, reason: "optout_unreadable" }).catch(() => {}); return { ok: false, reason: "sms_unconfirmed", held: true }; }
  if (optOut) { if (client) await logEvent(client, "sms_blocked", { to, type }); return { ok: false, reason: "opted_out" }; }
  if (client && REGISTERED_ONLY_TYPES.includes(type)) {
    // With 12-03: a scheduled text may have been held (or its series started) on the shared sender; a STOP recorded
    // there ends it, also when the shop's own number was approved in the meantime (QA r2 N4). Approved shops keep
    // their old behaviour if the ledger is unreadable; a held text stays held.
    const approved = ownSenderApproved(client);
    let stopped = false;
    try { const { platformSMSSuppressed } = await import("./platform-sms.mjs"); stopped = await platformSMSSuppressed(to); } catch { /* unreadable: held stays held; approved sends as before */ }
    if (stopped) { await logEvent(client, "sms_blocked", { to, type, store: "platform" }); return { ok: false, reason: "opted_out" }; }
    if (!approved) {
      await logEvent(client, "sms_held", { to, type, reason: "sender_not_registered", tenDlc: client.phone?.tenDlc || null });
      return { ok: false, reason: "sender_not_registered" };
    }
  }
  const text = body.slice(0, 1500);
  let service = messagingServiceSid;
  if (client) {
    if (hasRegisteredSender(client)) { from = client.phone.twilioNumber; service = client.phone.messagingServiceSid || service; }
    else if (smsEnabled()) { await logEvent(client, "sms_blocked", { to, type, reason: "no_registered_sender" }); return { ok: false, reason: "no_registered_sender" }; }
    else { from = client.phone?.twilioNumber || ""; service = ""; }
  }
  const mode = client ? (hasRegisteredSender(client) ? "own" : "none") : "mc";
  const platformNumber = e164(process.env.MC_TWILIO_NUMBER || ""), platformService = process.env.MC_MESSAGING_SERVICE_SID || "";
  if (platformNumber && e164(from || "") === platformNumber || platformService && service === platformService) {
    const { platformSMSSuppressed } = await import("./platform-sms.mjs");
    if (await platformSMSSuppressed(to)) { if (client) await logEvent(client, "sms_blocked", { to, type, store: "platform" }); return { ok: false, reason: "opted_out" }; }
  }
  if (!smsEnabled() || (!from && !service)) {
    console.log(`[sms:disabled] to=${to} from=${from || service || "-"} :: ${text}`);
    if (client) await logEvent(client, "sms_sent", { to, type, sender: mode, ok: false, logged: true, preview: text.slice(0, 300) });
    if (client && !smsEnabled()) await countText(client, type);
    return { ok: false, reason: "disabled", logged: true };
  }
  const params = { To: to, Body: text };
  if (service) params.MessagingServiceSid = service; else params.From = from;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("twilio send failed", res.status, data?.message);
  if (client) await logEvent(client, res.ok ? "sms_sent" : "sms_failed", { to, type, sender: mode, ok: res.ok, sid: data?.sid, code: data?.code, message: data?.message, preview: text.slice(0, 300) });
  if (client && res.ok) await countText(client, type);
  return { ok: res.ok, sid: data?.sid, error: data?.message, status: res.status, code: data?.code };
}

// Customer-facing texts count toward the plan (usage.mjs); owner alerts and digests do not.
async function countText(client, type) {
  try { const { addUsage, CUSTOMER_TEXT_TYPES } = await import("./usage.mjs"); if (CUSTOMER_TEXT_TYPES.includes(type)) await addUsage(client, { texts: 1 }); } catch (e) { console.error("usage count", e); }
}

export async function sendEmail({ to, subject, text, html }) {
  if (!to) return { ok: false, reason: "missing" };
  if (!emailEnabled()) {
    console.log(`[email:disabled] to=${to} :: ${subject}\n${text || ""}`);
    return { ok: false, reason: "disabled", logged: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: Array.isArray(to) ? to : [to], subject, text, html: html || undefined }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("resend failed", res.status, data);
  return { ok: res.ok, id: data?.id };
}

// An owner message that could not reach the owner by text or email goes to the operator, so an
// alert is never silently dropped (legal precondition P1). Rev 2 (QA Q1/Q2): this runs whenever no
// owner channel succeeded, also when the owner's email send failed. Rev 2 (QA Q3):
// - data minimization: the operator gets the shop, the alert kind and a redacted first line (phone
//   numbers cut to their last 4 digits, email addresses to their domain, Where/Address/Customer lines
//   dropped). The full details stay in the shop's own records (portal leads and visits).
// - rate limit: at most OWNER_FALLBACK_HOURLY operator emails per shop per Houston hour; the next one
//   says further alerts are held this hour, and each held alert is still logged (owner_alert_fallback,
//   operator:"rate_limited"). A counter store failure fails open (the email is sent).
export const OWNER_FALLBACK_HOURLY = 3;
export function redactForOperator(text) {
  const lines = String(text || "").split("\n").filter((l) => !/^\s*(?:where|address|customer|phone|email|contact|notes?)\s*:/i.test(l));
  // Rev 3 (QA r2): street addresses anywhere ("lives on 1402 Mason Rd", "address 900 W Main St"), gate/door codes,
  // and phone numbers matched on their own (10-11 digits) so a following house number is not merged into them.
  const PH = "\u0001";
  return lines.join(" ").replace(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g, "…@$1")
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, (m) => PH + m.replace(/\D/g, "").slice(-4) + PH)
    .replace(/(?<![\d\u0001])\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:[A-Za-z0-9'.-]+\s+){0,4}?(?:st|street|rd|road|ave|avenue|dr|drive|ln|lane|blvd|boulevard|way|ct|court|pkwy|parkway|hwy|highway|cir|circle|pl|place|trl|trail|fwy|freeway)\b\.?(?:\s*(?:apt|unit|ste|suite|#)\s*\w+)?(?:,?\s+[A-Z][a-z]+)?/gi, "[address withheld]")
    .replace(/\b(?:gate|door|lock|alarm|access)\s*(?:code)?\s*:?\s*[\w#*]{2,}/gi, "[code withheld]")
    .replace(/\b(?:at|to|a)\s+\d+\s+[^,.()\n]{2,60}/gi, "at [address withheld] ")
    .replace(/\u0001(\d{4})\u0001/g, "…$1").slice(0, 200);
}
const fallbackHour = () => new Date().toLocaleString("sv-SE", { timeZone: "America/Chicago" }).slice(0, 13).replace(" ", "T");
async function ownerFallback(client, text, reason) {
  const name = client.business?.name || client.slug || "A shop";
  let n = 0;
  try { n = await atomicUpdate("owner_fallback", `${client.slug || "unknown"}/${fallbackHour()}`, (cur) => { const count = (cur?.count || 0) + 1; return { value: { count, at: new Date().toISOString() }, result: count }; }); }
  catch { n = 0; /* counter unavailable: send rather than lose the alert */ }
  if (n > OWNER_FALLBACK_HOURLY + 1) {
    try { await logEvent(client, "owner_alert_fallback", { reason, operator: "rate_limited", count: n }); } catch { /* logged best effort */ }
    return { ok: false, reason: "operator_rate_limited", count: n };
  }
  const subject = n === OWNER_FALLBACK_HOURLY + 1 ? `Owner alerts held this hour: ${name}` : `Owner alert not delivered: ${name}`;
  const body = n === OWNER_FALLBACK_HOURLY + 1
    ? `${OWNER_FALLBACK_HOURLY} owner alerts for ${client.slug || name} already came here this hour because none could reach the owner (${reason}). Further alerts this hour are not emailed; each one is logged as owner_alert_fallback on the shop and its details are in the shop's records. Please reach the owner.`
    : `An owner message for ${client.slug || name} could not reach the owner by text or email (${reason}), so it came here instead. Please tell the owner to check the portal.\n\nAlert (customer details withheld): ${redactForOperator(text)}`;
  const r = await sendEmail({ to: STEVE_EMAIL, subject, text: body });
  try { await logEvent(client, "owner_alert_fallback", { reason, operator: r.ok ? "sent" : r.logged ? "logged" : "failed", count: n }); } catch { /* the operator email is the record */ }
  return r;
}

// Owner alert: SMS from the shop's own approved number when it has one, and email whenever the owner
// has an address. No shared-sender text and no opt-out override. When no owner channel succeeded
// (no contact, text refused, or the email send failed) the operator fallback runs; its result is tagged
// channel:"operator" so callers can tell the owner was not reached.
export async function notifyOwner(client, text, opts = {}) {
  const results = [];
  // opts.settle: a channel that throws (network error) is recorded as not sent and the next channel is still tried.
  const one = async (channel, send) => { if (!opts.settle) return { channel, ...(await send()) }; try { return { channel, ...(await send()) }; } catch (e) { return { channel, ok: false, reason: "send_error", error: String(e?.message || e).slice(0, 120) }; } };
  // A suppression read failure (or Twilio error) withholds the text but must not skip the email fallback.
  // With opts.settle, `one` already records the throw as send_error; this catch covers callers without it.
  if (client.owner?.phone) {
    try { results.push(await one("text", () => sendSMS({ to: client.owner.phone, client, body: text, type: opts.type || "owner_alert" }))); }
    catch (error) { console.error("owner sms withheld", error?.message); results.push({ channel: "text", ok: false, reason: "sms_unconfirmed" }); }
  }
  if (client.owner?.email) {
    try { results.push(await one("email", () => sendEmail({ to: client.owner.email, subject: `${client.business?.name || "Front desk"}: ${text.split("\n")[0].slice(0, 60)}`, text }))); }
    catch (error) { console.error("owner email failed", error?.message); results.push({ channel: "email", ok: false, reason: "send_error" }); }
  }
  if (!results.some((r) => r.ok || r.logged)) {
    const reason = !client.owner?.phone && !client.owner?.email ? "no_owner_contact" : client.owner?.email ? "owner_email_failed" : results[0]?.reason || "not_sent";
    let r; try { r = await ownerFallback(client, text, reason); } catch (e) { r = { ok: false, reason: "send_error" }; }
    results.push({ ...r, channel: "operator" });
  }
  return results;
}

// Founder alerts never carry an owner credential. A legacy owner-portal link becomes the operations
// portal plus the customer slug; any other k= query value is redacted.
export function redactOwnerCredentials(value) {
  return String(value ?? "").replace(/\/desk(?:\.html)?\?c=([a-z0-9-]+)&k=[^\s#]*(?:#[\w-]*)?/gi, "/admin.html (customer $1)").replace(/([?&])k=[^\s&#]+/g, "$1k=[redacted]");
}
// A text meant for the owner (welcome, status, digest). Uses the shop's own approved number; when it
// cannot be texted it is emailed to the owner; when there is no owner email or that email failed, the
// operator fallback runs (rev 2, QA Q2).
export async function textOwner(client, body, { type = "owner_note", subject, to } = {}) {
  const phone = to || client.owner?.phone;
  const r = phone ? await sendSMS({ to: phone, client, body, type }) : { ok: false, reason: "missing" };
  if (r.ok || r.logged) return r;
  const email = client.owner?.email;
  let e = null;
  if (email) { try { e = await sendEmail({ to: email, subject: subject || `${client.business?.name || "Front desk"}: ${body.split("\n")[0].slice(0, 60)}`, text: body }); } catch { e = { ok: false }; } }
  if (e && (e.ok || e.logged)) return { ...r, emailed: e.ok ? "sent" : "logged" };
  await ownerFallback(client, body, email ? "owner_email_failed" : r.reason || "not_sent").catch(() => {});
  return { ...r, emailed: email ? "failed_operator" : "operator" };
}

// Operator alerts go by email only. The M&C number is reserved for its Customer Care campaign.
// Founder alerts still never carry an owner credential (release 2 ops P2).
export async function notifySteve(subject, text) {
  subject = redactOwnerCredentials(subject); text = redactOwnerCredentials(text);
  return [await sendEmail({ to: STEVE_EMAIL, subject, text })];
}

// Twilio request signature (X-Twilio-Signature) over the full URL plus sorted POST params.
// Fails closed when no token is configured: an unsigned request is never valid.
export function twilioSignatureValid(url, params, signature) {
  const token = process.env.TWILIO_AUTH_TOKEN || TW_TOKEN;
  if (!token || typeof signature !== "string" || !signature) return false;
  const keys = Object.keys(params).sort();
  const data = url + keys.map((k) => k + params[k]).join("");
  const expected = Buffer.from(createHmac("sha1", token).update(data).digest("base64")), given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// A plain phone call with a spoken line (no AI voice): used to escalate an unacknowledged alert.
export async function placeCall({ to, from, say, client }) {
  if (isSelfServiceClient(client)) return { ok: false, reason: "channel_not_active" };
  to = e164(to); from = from || process.env.MC_TWILIO_NUMBER;
  if (!to || !say) return { ok: false, reason: "missing" };
  if (!smsEnabled() || !from) { console.log(`[call:disabled] to=${to} :: ${say}`); return { ok: false, reason: "disabled", logged: true }; }
  const twiml = `<Response><Say voice="Polly.Joanna">${say.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]))}</Say></Response>`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Calls.json`, {
    method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Twiml: twiml }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, sid: data?.sid, error: data?.message };
}
