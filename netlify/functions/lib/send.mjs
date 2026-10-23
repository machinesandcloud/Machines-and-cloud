// Outbound messages: SMS through Twilio, email through Resend. Each degrades to a
// console log when its keys are missing, so the rest of the system keeps working.
import { isSelfServiceClient } from "./setup.mjs";
import { createHmac } from "node:crypto";
import { get, put, del, logEvent } from "./store.mjs";

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
export const optedOut = async (to) => Boolean(await get("optouts", e164(to)));
export async function recordOptOut(to, slug, words) { await put("optouts", e164(to), { at: new Date().toISOString(), slug, words }); }
export async function clearOptOut(to) { await del("optouts", e164(to)); }

/**
 * sendSMS({ to, from, body, client, messagingServiceSid, force })
 * - Refuses opted-out numbers (unless force, used only for the STOP confirmation).
 * - Sends through a Messaging Service when one is given (carrier opt-out handling applies).
 * - Picks the sender for a client: its own number once 10DLC is approved, otherwise the
 *   Machines & Cloud registered sender (MC_MESSAGING_SERVICE_SID or MC_TWILIO_NUMBER) with the
 *   business name prefixed, so day-one texts are legal and deliverable.
 */
export async function sendSMS({ to, from, body, client, messagingServiceSid, force, type = "sms" }) {
  if (isSelfServiceClient(client)) return { ok: false, reason: "channel_not_active" };
  to = e164(to);
  if (!to || !body) return { ok: false, reason: "missing" };
  if (!force && (await optedOut(to))) { if (client) await logEvent(client, "sms_blocked", { to, type }); return { ok: false, reason: "opted_out" }; }
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
  if (client.owner?.phone) results.push(await sendSMS({ to: client.owner.phone, client, body: text, force: true, type: opts.type || "owner_alert" }));
  if (client.owner?.email) results.push(await sendEmail({ to: client.owner.email, subject: `${client.business?.name || "Front desk"}: ${text.split("\n")[0].slice(0, 60)}`, text }));
  return results;
}

export async function notifySteve(subject, text) {
  const r = [];
  r.push(await sendEmail({ to: STEVE_EMAIL, subject, text }));
  if (STEVE_PHONE && process.env.MC_TWILIO_NUMBER) r.push(await sendSMS({ to: STEVE_PHONE, from: process.env.MC_TWILIO_NUMBER, body: `${subject}\n${text}`.slice(0, 600) }));
  return r;
}

// Twilio request signature (X-Twilio-Signature) over the full URL plus sorted POST params.
export function twilioSignatureValid(url, params, signature) {
  if (!TW_TOKEN) return true; // nothing to validate against in dev
  const keys = Object.keys(params).sort();
  const data = url + keys.map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", TW_TOKEN).update(data).digest("base64");
  return expected === signature;
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
