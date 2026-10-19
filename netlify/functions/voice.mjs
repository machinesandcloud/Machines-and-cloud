// Twilio voice webhook for a client's number. If the client has a voice agent destination, the call is
// connected there. Otherwise the caller hears a short message, the call ends, and the front desk texts
// them back within seconds (missed-call text-back). The owner gets a missed-call alert either way.
// Paused or cancelled shops: the call rings the owner's cell (never the forwarded line) or hears a short message.
// Numbers on the owner's always-ring-through list ring the cell, then record a voicemail that is texted to the owner.
import { clientByNumber, getConversation, saveConversation, logEvent, saveClient } from "./lib/store.mjs";
import { sendSMS, notifyOwner, twilioSignatureValid, e164, optedOut } from "./lib/send.mjs";
import { ACTIVE } from "./lib/config.mjs";
import { cellIsForwardedLine } from "./lib/desk.mjs";

// /api/voice answers the call; /api/voice/recorded receives a VIP voicemail from <Record>.
export const config = { path: ["/api/voice", "/api/voice/recorded"] };

const xml = (inner) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });
const esc = (s) => String(s).replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]));

function fallbackTwiml(c) {
  const name = esc(c.business?.name || "the office");
  const say = `<Say voice="Polly.Joanna">Thanks for calling ${name}. Nobody is available on this line right now. Please call back during business hours.</Say><Hangup/>`;
  const cell = c.owner?.phone;
  if (cell && cell !== c.phone?.businessNumber) return `<Dial timeout="25">${esc(cell)}</Dial>${say}`;
  return say;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const adminOk = process.env.ADMIN_KEY && req.headers.get("x-admin-key") === process.env.ADMIN_KEY;
  const path = new URL(req.url).pathname.replace(/\/$/, "");
  const sigUrl = (process.env.URL || new URL(req.url).origin) + path;
  if (!adminOk && process.env.TWILIO_AUTH_TOKEN && !twilioSignatureValid(sigUrl, params, req.headers.get("x-twilio-signature") || "")) return new Response("bad signature", { status: 403 });

  const to = e164(params.To), from = e164(params.From);
  // Our own escalation call bouncing back through the owner's forwarding: hang up, no events.
  const ours = [e164(process.env.MC_TWILIO_NUMBER || "")].filter(Boolean);
  const c = await clientByNumber(to);
  if (c?.phone?.twilioNumber) ours.push(c.phone.twilioNumber);
  if (from && ours.includes(from)) return xml(`<Hangup/>`);
  if (!c) return xml(`<Say>Sorry, this number is not in service.</Say><Hangup/>`);
  const name = c.business?.name || "the office";

  // A VIP voicemail just recorded: text the owner the link.
  if (path.endsWith("/recorded")) {
    const link = String(params.RecordingUrl || "");
    await notifyOwner(c, `VIP voicemail from ${from || "unknown"}: ${link ? link + ".mp3" : "(no recording)"}${params.RecordingDuration ? ` (${params.RecordingDuration} s)` : ""}`, { type: "owner_note" });
    await logEvent(c.slug, "vip_voicemail", { from, url: link, seconds: Number(params.RecordingDuration) || null });
    return xml(`<Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup/>`);
  }

  // Always-ring-through list: ring the owner's cell (unless it is the forwarded line), then record.
  if (from && (c.rules?.bypass || []).includes(from)) {
    const owner = esc(c.owner?.name || "the owner");
    const direct = !cellIsForwardedLine(c) && c.owner?.phone;
    const intro = direct ? `${owner} could not pick up.` : `This is ${esc(name)}.`;
    const record = `<Say voice="Polly.Joanna">${intro} Please leave a message after the tone and ${owner} will call you back.</Say><Record maxLength="120" playBeep="true" action="${esc(sigUrl.replace(/\/api\/voice.*$/, "/api/voice/recorded"))}" method="POST"/><Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup/>`;
    await logEvent(c.slug, "vip_call", { from, rang: direct ? "cell" : "voicemail" });
    return xml(direct ? `<Dial timeout="25">${esc(c.owner.phone)}</Dial>${record}` : record);
  }

  if (!ACTIVE.includes(c.status)) {
    await logEvent(c.slug, "call_while_paused", { from, status: c.status });
    return xml(fallbackTwiml(c));
  }

  // A forwarded call proves the owner's forwarding works.
  if (params.ForwardedFrom && !c.phone?.forwardingVerified) {
    c.phone = { ...c.phone, forwardingVerified: true, firstCallAt: new Date().toISOString() }; await saveClient(c);
  }

  // Voice agent connected (Retell, Vapi, or a SIP destination): hand the call over.
  if (c.phone?.voiceForwardTo) {
    const dest = c.phone.voiceForwardTo;
    const inner = dest.startsWith("sip:") ? `<Dial timeout="25"><Sip>${esc(dest)}</Sip></Dial>` : `<Dial timeout="25">${esc(dest)}</Dial>`;
    await logEvent(c.slug, "call_forwarded", { from });
    return xml(inner);
  }

  // Missed-call text-back
  const say = c.business?.spanish
    ? `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. We are texting you this second so we can get you scheduled.</Say><Say voice="Polly.Lupe" language="es-US">Gracias por llamar. Le enviamos un mensaje de texto ahora mismo.</Say>`
    : `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. We are texting you this second so we can get you scheduled.</Say>`;
  let textBack = "not attempted";
  if (c.phone?.textBack !== false && from) {
    const conv = await getConversation(c.slug, "sms", from);
    const recent = [...conv.messages].reverse().find((m) => m.system === "missed-call text-back");
    if (await optedOut(from)) { textBack = "skipped"; await logEvent(c.slug, "text_back_skipped", { from, reason: "opted_out" }); }
    else if (recent && Date.now() - new Date(recent.at).getTime() < 24 * 3600 * 1000) { textBack = "skipped"; await logEvent(c.slug, "text_back_skipped", { from, reason: "recent" }); }
    else {
      const text = c.business?.spanish
        ? `Hi, this is ${name}. Sorry we missed your call. What can we help with, and is it urgent? / Hola, le saluda ${name}. ¿En qué le podemos ayudar? Reply STOP to opt out.`
        : `Hi, this is ${name}. Sorry we missed your call. What can we help with, and is it urgent? Reply here and we will get you scheduled. Reply STOP to opt out.`;
      const r = await sendSMS({ to: from, client: c, type: "text_back", body: text });
      textBack = r.ok ? "sent" : r.logged ? "logged" : "failed";
      if (r.ok || r.logged) {
        conv.messages.push({ role: "assistant", content: text, at: new Date().toISOString(), system: "missed-call text-back" });
        await saveConversation(conv);
      }
    }
  }
  await notifyOwner(c, `${name} front desk: missed call from ${from || "unknown"}. ${textBack === "sent" || textBack === "logged" ? "Text-back sent; I will take it from here and text you the lead." : textBack === "skipped" ? "They were texted recently or opted out, so no text-back." : "No texting sender yet, so no text-back."}`, { type: "owner_note" });
  await logEvent(c.slug, "missed_call", { from, textBack });
  return xml(`${say}<Hangup/>`);
};
