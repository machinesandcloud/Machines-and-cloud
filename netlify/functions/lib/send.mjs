// Outbound messages: SMS through Twilio, email through Resend. Each degrades to a
// console log when its keys are missing, so the rest of the system keeps working.
import { createHmac } from "node:crypto";

const TW_SID = process.env.TWILIO_ACCOUNT_SID;
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const RESEND = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "Machines & Cloud <desk@machinesandcloud.com>";
export const STEVE_EMAIL = process.env.STEVE_EMAIL || "support@machinesandcloud.com";
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

export async function sendSMS({ to, from, body }) {
  to = e164(to);
  if (!to || !body) return { ok: false, reason: "missing" };
  if (!smsEnabled() || !from) {
    console.log(`[sms:disabled] to=${to} from=${from || "-"} :: ${body}`);
    return { ok: false, reason: "disabled", logged: true };
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 1500) }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("twilio send failed", res.status, data?.message);
  return { ok: res.ok, sid: data?.sid, error: data?.message };
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
export async function notifyOwner(client, text) {
  const results = [];
  if (client.owner?.phone && client.phone?.twilioNumber) results.push(await sendSMS({ to: client.owner.phone, from: client.phone.twilioNumber, body: text }));
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
