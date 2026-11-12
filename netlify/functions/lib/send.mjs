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
 * sendSMS({ to, from, body, client, messagingServiceSid, force })
 * - Refuses opted-out numbers, including owner alerts and owner test texts. `force` no longer
 *   bypasses this: the STOP confirmation is a TwiML reply and never goes through sendSMS.
 *   A send from the shared platform sender also honors a STOP recorded by /api/platform-sms.
 * - Sends through a Messaging Service when one is given (carrier opt-out handling applies).
 * - Picks the sender for a client: its own number once 10DLC is approved, otherwise the
 *   Machines & Cloud registered sender (MC_MESSAGING_SERVICE_SID or MC_TWILIO_NUMBER) with the
 *   business name prefixed, so day-one texts are legal and deliverable.
 */
export async function sendSMS({ to, from, body, client, messagingServiceSid, force, type = "sms" }) {
  if (isSelfServiceClient(client)) return { ok: false, reason: "channel_not_active" };
  to = e164(to);
  if (!to || !body) return { ok: false, reason: "missing" };
  const optOut = await optOutStatus(to);
  // Unknown opt-out state: hold the text (not sent, not thrown) so owner alerts still fall through to email.
  if (optOut === null) { if (client) await logEvent(client, "sms_held", { to, type, reason: "optout_unreadable" }).catch(() => {}); return { ok: false, reason: "sms_unconfirmed", held: true }; }
  if (optOut) { if (client) await logEvent(client, "sms_blocked", { to, type }); return { ok: false, reason: "opted_out" }; }
  let text = body.slice(0, 1500);
  let service = messagingServiceSid;
  if (client) {
    const own = client.phone?.twilioNumber && client.phone?.tenDlc === "approved";
    if (own) { from = client.phone.twilioNumber; service = client.phone.messagingServiceSid || service; }
    else if (process.env.MC_MESSAGING_SERVICE_SID || process.env.MC_TWILIO_NUMBER) {
      service = process.env.MC_MESSAGING_SERVICE_SID || service; from = process.env.MC_TWILIO_NUMBER || from;
      const name = client.business?.name || "";
      if (name && !text.startsWith(name)) text = `${name}: ${text}`.slice(0, 1500);
    } else { from = client.phone?.twilioNumber || from; }
  }
  const mode = client ? (client.phone?.twilioNumber && client.phone?.tenDlc === "approved" ? "own" : service || from ? "bridge" : "none") : "mc";
  const platformNumber = e164(process.env.MC_TWILIO_NUMBER || ""), platformService = process.env.MC_MESSAGING_SERVICE_SID || "";
  if (platformNumber && e164(from || "") === platformNumber || platformService && service === platformService) {
    const { platformSMSSuppressed } = await import("./platform-sms.mjs");
    if (await platformSMSSuppressed(to)) { if (client) await logEvent(client, "sms_blocked", { to, type, store: "platform" }); return { ok: false, reason: "opted_out" }; }
  }
  if (client && mode === "bridge") { try { await put("index", "bridge:" + to, client.slug); } catch { /* ignore */ } }
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
  return { ok: res.ok, sid: data?.sid, error: data?.message };
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

// Owner alert: SMS to the owner's phone from the client's number when both exist, else email.
export async function notifyOwner(client, text, opts = {}) {
  const results = [];
  // opts.settle: a channel that throws (network error) is recorded as not sent and the next channel is still tried.
  const one = async (channel, send) => { if (!opts.settle) return { channel, ...(await send()) }; try { return { channel, ...(await send()) }; } catch (e) { return { channel, ok: false, reason: "send_error", error: String(e?.message || e).slice(0, 120) }; } };
  // A suppression read failure (or Twilio error) withholds the text but must not skip the email fallback.
  // With opts.settle, `one` already records the throw as send_error; this catch covers callers without it.
  if (client.owner?.phone) {
    try { results.push(await one("text", () => sendSMS({ to: client.owner.phone, client, body: text, force: true, type: opts.type || "owner_alert" }))); }
    catch (error) { console.error("owner sms withheld", error?.message); results.push({ channel: "text", ok: false, reason: "sms_unconfirmed" }); }
  }
  if (client.owner?.email) results.push(await one("email", () => sendEmail({ to: client.owner.email, subject: `${client.business?.name || "Front desk"}: ${text.split("\n")[0].slice(0, 60)}`, text })));
  return results;
}

export async function notifySteve(subject, text) {
  const r = [];
  r.push(await sendEmail({ to: STEVE_EMAIL, subject, text }));
  if (STEVE_PHONE && process.env.MC_TWILIO_NUMBER) r.push(await sendSMS({ to: STEVE_PHONE, from: process.env.MC_TWILIO_NUMBER, body: `${subject}\n${text}`.slice(0, 600) }));
  return r;
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
