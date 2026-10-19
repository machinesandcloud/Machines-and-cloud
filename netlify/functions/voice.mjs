// Twilio voice webhook for a client's number. If the client has a voice agent destination, the call is
// connected there. Otherwise the caller hears a short message, the call ends, and the front desk texts
// them back within seconds (missed-call text-back). The owner gets a missed-call alert either way.
import { clientByNumber, getConversation, saveConversation, logEvent, saveClient } from "./lib/store.mjs";
import { sendSMS, notifyOwner, twilioSignatureValid, e164 } from "./lib/send.mjs";

export const config = { path: "/api/voice" };

const xml = (inner) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });
const esc = (s) => String(s).replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]));

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const sigUrl = (process.env.URL || new URL(req.url).origin) + "/api/voice";
  if (process.env.TWILIO_AUTH_TOKEN && !twilioSignatureValid(sigUrl, params, req.headers.get("x-twilio-signature") || "")) return new Response("bad signature", { status: 403 });

  const to = e164(params.To), from = e164(params.From);
  const c = await clientByNumber(to);
  if (!c) return xml(`<Say>Sorry, this number is not in service.</Say><Hangup/>`);
  const name = c.business?.name || "the office";
  // The first call that lands here proves the owner's forwarding works.
  if (params.ForwardedFrom || !c.phone?.forwardingVerified) { c.phone = { ...c.phone, forwardingVerified: true, firstCallAt: c.phone?.firstCallAt || new Date().toISOString() }; await saveClient(c); }

  // Voice agent connected (Retell, Vapi, or a SIP destination): hand the call over.
  if (c.phone?.voiceForwardTo && ["testing", "live"].includes(c.status)) {
    const dest = c.phone.voiceForwardTo;
    const inner = dest.startsWith("sip:") ? `<Dial timeout="25"><Sip>${esc(dest)}</Sip></Dial>` : `<Dial timeout="25">${esc(dest)}</Dial>`;
    await logEvent(c.slug, "call_forwarded", { from });
    return xml(inner);
  }

  // Missed-call text-back
  const lang = c.business?.spanish ? "en" : "en";
  const say = c.business?.spanish
    ? `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. We are texting you this second so we can get you scheduled.</Say><Say voice="Polly.Lupe" language="es-US">Gracias por llamar. Le enviamos un mensaje de texto ahora mismo.</Say>`
    : `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. We are texting you this second so we can get you scheduled.</Say>`;
  if (c.phone?.textBack !== false && from && c.phone?.twilioNumber) {
    const text = c.business?.spanish
      ? `Hi, this is ${name}. Sorry we missed your call. What can we help with, and is it urgent? / Hola, le saluda ${name}. ¿En qué le podemos ayudar?`
      : `Hi, this is ${name}. Sorry we missed your call. What can we help with, and is it urgent? Reply here and we will get you scheduled.`;
    const r = await sendSMS({ to: from, from: c.phone.twilioNumber, body: text });
    if (r.ok) {
      const conv = await getConversation(c.slug, "sms", from);
      conv.messages.push({ role: "assistant", content: text, at: new Date().toISOString(), system: "missed-call text-back" });
      await saveConversation(conv);
    }
  }
  await notifyOwner(c, `${name} front desk: missed call from ${from || "unknown"}. ${c.phone?.twilioNumber ? "Text-back sent; I will take it from here and text you the lead." : "No texting number yet, so no text-back."}`);
  await logEvent(c.slug, "missed_call", { from });
  return xml(`${say}<Hangup/>`);
};
