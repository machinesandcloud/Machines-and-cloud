// Twilio voice webhook for a client's number. If the client has a voice agent destination, the call is
// connected there. Otherwise the caller hears a short message, the call ends, and the front desk texts
// them back within seconds (missed-call text-back). The owner gets a missed-call alert either way.
// Paused or cancelled shops: the call rings the owner's cell (never the forwarded line) or hears a short message.
// Numbers on the owner's always-ring-through list ring the cell. Nothing is ever recorded: when the owner does
// not answer, the caller is texted back from the shop's own number, an open hand-off lead is saved and the
// owner is alerted (legal precondition P3).
import { clientByNumber, getConversation, saveConversation, logEvent, saveClient, noteInbound, addRecord, addToIndex } from "./lib/store.mjs";
import { sendSMS, notifyOwner, twilioSignatureValid, e164, optOutStatus, optedOut } from "./lib/send.mjs";
import { ACTIVE } from "./lib/config.mjs";
import { auditedAdminKey } from "./lib/admin-key-audit.mjs";
import { cellIsForwardedLine } from "./lib/desk.mjs";

// /api/voice answers the call; /api/voice/vip-missed is the <Dial action> after a VIP call to the owner's cell.
export const config = { path: ["/api/voice", "/api/voice/vip-missed"] };

const xml = (inner) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });
const esc = (s) => String(s).replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]));

// A VIP caller the owner could not take. No voicemail is recorded. The caller is offered the normal
// text path (a reply to a VIP text is relayed to the owner by sms.mjs), an open hand-off lead is saved
// so the call is in the portal even if no alert goes out, and every spoken line matches what happened.
async function vipMissed(c, from) {
  const ownerName = c.owner?.name || "the owner", owner = esc(ownerName);
  let textBack = "not_attempted";
  if (from && c.phone?.textBack !== false && ACTIVE.includes(c.status)) {
    try {
      if (await optedOut(from)) textBack = "opted_out";
      else {
        // Spanish review r4: a Spanish-enabled shop adds the reviewer's Spanish line (the caller's language is unknown on a call).
        const en = `${c.business?.name || "Hi"}: ${ownerName} could not take your call. Reply here with your message and it will be passed to ${ownerName}. Reply STOP to opt out.`;
        const es = `${c.business?.name || "Hola"}: ${c.owner?.name || "El dueño"} no pudo contestar su llamada. Responda a este mensaje y se lo pasamos a ${c.owner?.name || "el dueño"}. Responda STOP o ALTO para dejar de recibir mensajes.`;
        const r = await sendSMS({ to: from, client: c, type: "text_back", body: c.business?.spanish ? en + "\n" + es : en });
        textBack = r.ok ? "sent" : r.logged ? "logged" : r.reason || "failed";
      }
    } catch (err) { console.error("vip text-back", err); textBack = "failed"; }
  }
  const texted = textBack === "sent" || textBack === "logged";
  // Rev 2 (QA Q5): only an owner channel counts; an operator fallback email does not mean the owner "has been told".
  let alerted = false;
  try { alerted = (await notifyOwner(c, `VIP call from ${from || "unknown"} was not answered. No voicemail is recorded. ${texted ? "They were texted so they can reply with a message." : "They were not texted."}`, { type: "owner_note", settle: true })).some((r) => r?.ok && r.channel !== "operator"); } catch (err) { console.error("vip missed alert", err); }
  let leadId = "";
  try {
    const l = await addRecord("leads", c.slug, { customer_name: "", phone: from || "", address: "", issue: `VIP call not answered${texted ? " (texted back)" : ""}`, reason: "handoff", urgency: "today", wanted: "", language: "en", unsure: "", nobook_reason: "none", channel: "call", contact: from || "", status: "open", outcome: "needs_action", ownerAlerted: alerted });
    leadId = l.id; if (from) await addToIndex("leads", c, from, l.id);
  } catch (err) { console.error("vip missed lead", err); }
  await logEvent(c, "vip_missed", { from, textBack, alerted, leadId });
  const said = texted ? `${owner} could not take your call. We just sent you a text. Reply to it with your message for ${owner}.`
    : alerted ? `${owner} could not take your call and has been told that you called.`
    : leadId ? `${owner} could not take your call. Your call has been noted for ${owner}.`
    : `${owner} could not take your call. Please try again later.`;
  return `<Say voice="Polly.Joanna">${said} Goodbye.</Say><Hangup/>`;
}

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
  // The shared ADMIN_KEY skips the Twilio signature; each use is audited first and refused if it cannot be recorded.
  const adminOk = await auditedAdminKey(req, "voice_webhook");
  if (adminOk === null) return new Response("audit unavailable", { status: 503 });
  const path = new URL(req.url).pathname.replace(/\/$/, "");
  const sigUrl = (process.env.URL || new URL(req.url).origin) + path;
  // Fail closed: without a configured token no unsigned request is accepted (previews share production data).
  if (!adminOk && !process.env.TWILIO_AUTH_TOKEN) return new Response("webhook not configured", { status: 503 });
  if (!adminOk && !twilioSignatureValid(sigUrl, params, req.headers.get("x-twilio-signature") || "")) return new Response("bad signature", { status: 403 });

  const to = e164(params.To), from = e164(params.From);
  // Our own escalation call bouncing back through the owner's forwarding: hang up, no events.
  const ours = [e164(process.env.MC_TWILIO_NUMBER || "")].filter(Boolean);
  const c = await clientByNumber(to);
  if (c?.phone?.twilioNumber) ours.push(c.phone.twilioNumber);
  if (from && ours.includes(from)) return xml(`<Hangup/>`);
  if (!c) {
    // The shared M&C number no longer texts for shops (legal precondition P1), so a call to it is
    // never routed to a shop. It points the caller to M&C's own support instead.
    const mc = e164(process.env.MC_TWILIO_NUMBER || "");
    if (mc && to === mc) return xml(`<Say voice="Polly.Joanna">Thanks for calling Machines and Cloud. This number does not take calls. For help, email support at machines and cloud dot com.</Say><Hangup/>`);
    return xml(`<Say>Sorry, this number is not in service.</Say><Hangup/>`);
  }
  const name = c.business?.name || "the office";

  // The owner's cell did not take a VIP call (Twilio <Dial action>). An answered call just ends.
  if (path.endsWith("/vip-missed")) {
    if (params.DialCallStatus === "completed") return xml(`<Hangup/>`);
    return xml(await vipMissed(c, from));
  }

  // Always-ring-through list: ring the owner's cell (unless it is the forwarded line). Nothing is recorded.
  if (from && (c.rules?.bypass || []).includes(from)) {
    const direct = !cellIsForwardedLine(c) && c.owner?.phone;
    await logEvent(c, "vip_call", { from, rang: direct ? "cell" : "message" });
    if (direct) return xml(`<Dial timeout="25" action="${esc(sigUrl.replace(/\/api\/voice.*$/, "/api/voice/vip-missed"))}" method="POST">${esc(c.owner.phone)}</Dial>`);
    return xml(await vipMissed(c, from));
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
        ? `Hi, this is ${name}. Sorry we missed your call. What can we help with, and is it urgent? Reply STOP to opt out. / Hola, le saluda ${name}. Disculpe que no contestamos. ¿En qué le podemos ayudar? ¿Es urgente? Responda STOP o ALTO para no recibir mensajes.`
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
  // Legal P1 rev 2: the operator fallback result is not an owner channel; it is left out so the rule above is unchanged.
  const ownerAlerts = alerts && alerts.filter((r) => r?.channel !== "operator");
  if (!ownerAlerts || (ownerAlerts.length && !ownerAlerts.some((r) => r?.ok || r?.logged))) await logEvent(c, "owner_alert_failed", { from, kind: "missed_call" });
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
