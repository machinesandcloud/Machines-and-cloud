// Twilio voice webhook for a client's number. If the client has a voice agent destination, the call is
// connected there. Otherwise the caller hears a short message, the call ends, and the front desk texts
// them back within seconds (missed-call text-back). The owner gets a missed-call alert either way.
// Paused or cancelled shops: the call rings the owner's cell (never the forwarded line) or hears a short message.
// Numbers on the owner's always-ring-through list ring the cell, then record a voicemail that is texted to the owner.
import { clientByNumber, getConversation, saveConversation, logEvent, saveClient, noteInbound, addRecord, addToIndex } from "./lib/store.mjs";
import { sendSMS, notifyOwner, twilioSignatureValid, e164, optOutStatus } from "./lib/send.mjs";
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
  if (!c) {
    // A customer calling back the shared texting number: ring the shop that texted them.
    const mc = e164(process.env.MC_TWILIO_NUMBER || "");
    if (mc && to === mc && from) { const { get, getClient } = await import("./lib/store.mjs"); const slug = await get("index", "bridge:" + from); const shop = slug ? await getClient(slug) : null; if (shop) { await logEvent(shop, "bridge_callback", { from }); return xml(fallbackTwiml(shop)); } }
    return xml(`<Say>Sorry, this number is not in service.</Say><Hangup/>`);
  }
  const name = c.business?.name || "the office";

  // A VIP voicemail just recorded: text the owner the link, and keep it as an open request in the portal
  // so it is not only an event when the alert does not go out (voice review V4).
  if (path.endsWith("/recorded")) {
    const link = String(params.RecordingUrl || "");
    const seconds = Number(params.RecordingDuration) || null;
    let alerted = false;
    try { alerted = (await notifyOwner(c, `VIP voicemail from ${from || "unknown"}: ${link ? link + ".mp3" : "(no recording)"}${seconds ? ` (${seconds} s)` : ""}`, { type: "owner_note", settle: true })).some((r) => r?.ok); } catch (err) { console.error("vip voicemail alert", err); }
    let leadId = "";
    try {
      const l = await addRecord("leads", c.slug, { customer_name: "", phone: from || "", address: "", issue: `VIP voicemail${seconds ? ` (${seconds} s)` : ""}${link ? ": " + link + ".mp3" : " (no recording)"}`.slice(0, 300), reason: "handoff", urgency: "today", wanted: "", language: "en", unsure: "", nobook_reason: "none", channel: "call", contact: from || "", status: "open", outcome: "needs_action", ownerAlerted: alerted });
      leadId = l.id; if (from) await addToIndex("leads", c, from, l.id);
    } catch (err) { console.error("vip voicemail lead", err); }
    await logEvent(c, "vip_voicemail", { from, url: link, sid: params.RecordingSid || "", seconds, alerted, leadId });
    return xml(`<Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup/>`);
  }

  // Always-ring-through list: ring the owner's cell (unless it is the forwarded line), then record.
  if (from && (c.rules?.bypass || []).includes(from)) {
    const owner = esc(c.owner?.name || "the owner");
    const direct = !cellIsForwardedLine(c) && c.owner?.phone;
    const intro = direct ? `${owner} could not pick up.` : `This is ${esc(name)}.`;
    const record = `<Say voice="Polly.Joanna">${intro} Please leave a message for ${owner} after the tone.</Say><Record maxLength="120" playBeep="true" action="${esc(sigUrl.replace(/\/api\/voice.*$/, "/api/voice/recorded"))}" method="POST"/><Say voice="Polly.Joanna">Thank you. Goodbye.</Say><Hangup/>`;
    await logEvent(c, "vip_call", { from, rang: direct ? "cell" : "voicemail" });
    return xml(direct ? `<Dial timeout="25">${esc(c.owner.phone)}</Dial>${record}` : record);
  }

  if (!ACTIVE.includes(c.status)) {
    await logEvent(c, "call_while_paused", { from, status: c.status });
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
    await logEvent(c, "call_forwarded", { from }); await noteInbound(c, "call");
    return xml(inner);
  }

  // Missed-call text-back. The spoken line is chosen after the send, so the caller is only told
  // "we are texting you" when the provider accepted the text.
  let textBack = "not attempted", skipReason = "", sendError = "";
  if (c.phone?.textBack !== false && from) {
    const conv = await getConversation(c, "sms", from);
    const recent = [...conv.messages].reverse().find((m) => m.system === "missed-call text-back");
    // Only a confirmed opt-out skips; an unreadable store is held by sendSMS and reported as not sent.
    if ((await optOutStatus(from)) === true) { textBack = "skipped"; skipReason = "opted_out"; await logEvent(c, "text_back_skipped", { from, reason: "opted_out" }); }
    else if (recent && Date.now() - new Date(recent.at).getTime() < 24 * 3600 * 1000) { textBack = "skipped"; skipReason = "recent"; await logEvent(c, "text_back_skipped", { from, reason: "recent" }); }
    else {
      const text = c.business?.spanish
        ? `Hi, this is ${name}. Sorry we missed your call. What can we help with, and is it urgent? / Hola, le saluda ${name}. ¿En qué le podemos ayudar? Reply STOP to opt out. / Responda STOP o ALTO para no recibir mensajes.`
        : `Hi, this is ${name}. Sorry we missed your call. What can we help with, and is it urgent? Reply here and we will get you scheduled. Reply STOP to opt out.`;
      // A network error counts as not sent, so the caller still gets a spoken reply (TwiML) instead of an error (rev 5).
      const r = await sendSMS({ to: from, client: c, type: "text_back", body: text }).catch((err) => { console.error("text-back send failed", err); return { ok: false, error: "network error" }; });
      textBack = r.ok ? "sent" : r.logged ? "logged" : "failed";
      if (!r.ok) sendError = String(r.error || r.reason || "").slice(0, 120);
      if (r.ok || r.logged) {
        conv.messages.push({ role: "assistant", content: text, at: new Date().toISOString(), system: "missed-call text-back" });
        await saveConversation(conv);
      }
    }
  }
  const ownerLine = textBack === "sent" ? "Text-back sent; I will take it from here and text you the lead."
    : textBack === "logged" ? "Texting is not set up yet, so no text-back was sent. Please call them back."
    : textBack === "failed" ? `The text-back could not be sent${sendError ? ` (${sendError})` : ""}. Please call them back.`
    : skipReason === "opted_out" ? "They opted out, so no text-back. Please call them back."
    : skipReason === "recent" ? "They were already sent a text-back in the last 24 hours, so no new one."
    : !from ? "No caller ID, so no text-back and no number to call back." : "Text-back is off for this line, so no text-back. Please call them back.";
  // QA6 (regenerated on 12-03-after-04): settle (proposal 4) records a thrown channel as send_error and still tries the next one.
  // owner_alert_failed means no channel reached the owner: every result failed (thrown, refused or opted out).
  // A logged-only (unconfigured) send is not a failure; with no owner phone or email nothing is logged, as before.
  let alerts = null;
  try { alerts = await notifyOwner(c, `${name} front desk: missed call from ${from || "unknown"}. ${ownerLine}`, { type: "owner_note", settle: true }); }
  catch (err) { console.error("missed-call owner alert failed", err); }
  if (!alerts || (alerts.length && !alerts.some((r) => r?.ok || r?.logged))) await logEvent(c, "owner_alert_failed", { from, kind: "missed_call" });
  const say = textBack === "sent"
    ? (c.business?.spanish
      ? `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. We are texting you this second so we can get you scheduled.</Say><Say voice="Polly.Lupe" language="es-US">Gracias por llamar. Le enviamos un mensaje de texto ahora mismo.</Say>`
      : `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. We are texting you this second so we can get you scheduled.</Say>`)
    : skipReason === "recent"
    // Texted in the last 24 hours and not opted out: the earlier text is the one thing we know reached them.
    ? (c.business?.spanish
      ? `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. Please reply to our earlier text or call back, and we will get you scheduled.</Say><Say voice="Polly.Lupe" language="es-US">Gracias por llamar. Por favor responda a nuestro mensaje anterior o vuelva a llamar.</Say>`
      : `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. Please reply to our earlier text or call back, and we will get you scheduled.</Say>`)
    // Opted out, text-back off, texting not set up, provider refusal or no caller ID: offer no texting at all.
    : (c.business?.spanish
      ? `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. Please call back, and we will get you scheduled.</Say><Say voice="Polly.Lupe" language="es-US">Gracias por llamar. Por favor vuelva a llamar.</Say>`
      : `<Say voice="Polly.Joanna">Thanks for calling ${esc(name)}. We are on a job right now. Please call back, and we will get you scheduled.</Say>`);
  await logEvent(c, "missed_call", { from, textBack }); await noteInbound(c, "call");
  return xml(`${say}<Hangup/>`);
};
