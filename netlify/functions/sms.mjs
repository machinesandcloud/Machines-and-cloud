// Twilio inbound SMS webhook. The "To" number identifies the client (or, on the shared bridge number,
// the "From" number is looked up in the bridge index). Texts from the owner's phone are commands
// (ok/otw/done/quote/paid/cancel/help); everything else is a customer talking to the front desk.
import { clientByNumber, getClient, get, getConversation, saveConversation, logEvent, cancelTasksForNumber, noteInbound } from "./lib/store.mjs";
import { runAgent, toApiMessages } from "./lib/agent.mjs";
import { auditedAdminKey } from "./lib/admin-key-audit.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, UPDATE_VISIT, ACTIVE } from "./lib/config.mjs";
import { bookVisit, flagLead, ownerCommand, upcomingBookings, confirmVisit, rescheduleVisit, cancelRequest, noteReviewReply, noteConsentReply, when, dateEs, winEs } from "./lib/desk.mjs";
import { sendSMS, twilioSignatureValid, e164, recordOptOut, clearOptOut, notifyOwner, optOutStatus } from "./lib/send.mjs";
import { classifySMSKeyword } from "./lib/sms-keywords.mjs";

export const config = { path: "/api/sms" };

const twiml = (msg) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]))}</Message>` : ""}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });

const HELP = 'Each alert names the one reply it needs: "ok REF" (acknowledge), "called REF" (you reached them), "otw REF" (on the way), "done REF" (finished), "cancel REF". A bare "ok", "called", "otw", or "done" works when only one job fits. Also: "invoice REF amount" (payment reminders), "paid REF", "quote REF amount".';
const STOP_RE = /^\s*(stop|stopall|unsubscribe|end|quit|cancel|revoke|opt\s*out|optout|alto|parar|cancelar|basta|detener)\b[\s.!]*$/i;
const STOP_PHRASE = /\b(stop texting|stop messaging|do not text|don't text|no more texts|remove me|no me (escriban?|manden?|env[ií]en?|texteen?)( m[aá]s)?( mensajes)?|no m[aá]s mensajes|dejen? de (escribir|mandar|enviar)|no quiero m[aá]s mensajes)\b/i;
const SPANISH_STOP = /\b(alto|parar|cancelar|baja|basta|detener|no me (escriban?|manden?|env[ií]en?|texteen?)|no m[aá]s mensajes|dejen? de|no quiero m[aá]s)\b/i;
const START_RE = /^\s*(start|unstop|yes|empezar|iniciar|s[ií])\s*[.!]*\s*$/i;
// Rev 4 (QA-12 r3): Twilio's default long-code opt-out keywords, matched exactly (whitespace only). Twilio confirms and
// blocks these at the sender itself; phrases, ALTO/PARAR/BASTA and punctuated forms rely on our store alone.
const TWILIO_STOP = /^\s*(stop|stopall|unsubscribe|end|quit|cancel|revoke|optout)\s*$/i;
// While the opt-out state is unknown only an explicit opt-in keyword re-subscribes: "yes"/"sí" can answer a question.
const START_KEYWORD = /^\s*(start|unstop|empezar|iniciar)\s*[.!]*\s*$/i;

async function resolveClient(to, from) {
  let c = await clientByNumber(to);
  if (c) return c;
  const mcNumber = e164(process.env.MC_TWILIO_NUMBER || "");
  if (mcNumber && to === mcNumber) { const slug = await get("index", "bridge:" + from); if (slug) c = await getClient(slug); }
  return c;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  // The shared ADMIN_KEY skips the Twilio signature; each use is audited first and refused if it cannot be recorded.
  const adminOk = await auditedAdminKey(req, "sms_webhook");
  if (adminOk === null) return new Response("audit unavailable", { status: 503 });
  const sigUrl = (process.env.URL || new URL(req.url).origin) + "/api/sms";
  // Fail closed: without a configured token no unsigned request is accepted (previews share production data).
  if (!adminOk && !process.env.TWILIO_AUTH_TOKEN) return new Response("webhook not configured", { status: 503 });
  if (!adminOk && !twilioSignatureValid(sigUrl, params, req.headers.get("x-twilio-signature") || "")) return new Response("bad signature", { status: 403 });

  const to = e164(params.To), from = e164(params.From), body = String(params.Body || "").trim();
  const c = await resolveClient(to, from);
  if (!c || !body) return twiml("");
  const name = c.business?.name || "We";

  const isOwner = !!c.owner?.phone && from === c.owner.phone;

  // Opt-out and opt-in come before anything else (FCC: any reasonable means), including texts
  // from the owner's phone and from always-ring-through numbers. The owner's phone uses only the
  // whole-message keywords, so a command or free-text reply is never read as an opt-out.
  // The shared classifier (proposal 01) adds normalized keywords; the legacy phrases stay for customers.
  const keyword = classifySMSKeyword(body);
  if (STOP_RE.test(body) || keyword === "stop" || !isOwner && STOP_PHRASE.test(body)) {
    // Already out: one confirmation is all CTIA allows, so repeats are silent. An unreadable store (null) confirms again.
    if ((await optOutStatus(from)) === true) return twiml("");
    const stored = await recordOptOut(from, c.slug, body.slice(0, 80));
    const n = await cancelTasksForNumber(from);
    await logEvent(c, "opt_out", { from, cancelled: n, viaTwilio: !!params.OptOutType, ...(isOwner ? { owner: true } : {}) });
    await notifyOwner(c, isOwner ? `${name} front desk: your phone ${from} opted out of texts. Alerts now go to your email only. Reply START to resume.` : `${name} front desk: ${from} opted out of texts. Nothing more will be sent to them.`, { type: "owner_note" });
    // "cancel" from someone with a visit on the books is also a cancellation request: the owner decides.
    let told = "";
    if (!isOwner && /^\s*cancel\b/i.test(body) && ACTIVE.includes(c.status)) {
      const visits = await upcomingBookings(c, from);
      for (const b of visits) await cancelRequest(c, b);
      if (visits.length) told = ` We've told ${c.owner?.name || "the owner"} about your visit.`;
    }
    if (params.OptOutType) return twiml(""); // Twilio already sent the carrier-standard confirmation
    // Not stored and not a keyword Twilio enforces (a phrase, ALTO...): do not claim it is done; ask for STOP.
    if (!stored && !TWILIO_STOP.test(body)) return twiml(SPANISH_STOP.test(body) ? `${name}: no pudimos completar su solicitud ahora. Responda STOP para no recibir más mensajes.` : `${name}: we could not complete your request right now. Please reply STOP to stop all texts from this number.`);
    if (SPANISH_STOP.test(body)) return twiml(`${name}: ya no recibirá más mensajes de este número.${told ? ` Ya le avisamos ${c.owner?.name ? "a " + c.owner.name : "al negocio"} sobre su visita.` : ""} Responda EMPEZAR para volver a recibirlos.`);
    return twiml(`${name}: you're unsubscribed and will get no more texts from this number.${told} Reply START to resume.`);
  }
  const optState = await optOutStatus(from), isOptedOut = optState !== false, unknownState = optState === null;
  if (isOptedOut && ((unknownState ? START_KEYWORD.test(body) : START_RE.test(body)) || keyword === "start")) { await clearOptOut(from); await logEvent(c, "opt_in", { from }); return twiml(/^\s*(empezar|iniciar|s[ií])/i.test(body) ? `${name}: volverá a recibir nuestros mensajes. Responda STOP o ALTO cuando quiera para dejar de recibirlos.` : `${name}: you're subscribed again. Reply STOP any time.`); }

  // Owner commands. An opted-out owner's command still runs, but no text is sent back.
  if (isOwner) {
    if (/^help$/i.test(body)) return twiml(isOptedOut ? "" : HELP);
    const reply = await ownerCommand(c, body);
    if (reply) { await logEvent(c, "owner_command", { body }); return twiml(isOptedOut ? "" : reply); }
    return twiml(isOptedOut ? "" : `Did not catch that. ${HELP}`);
  }

  // Numbers on the owner's always-ring-through list: relay the text, never answer it.
  if ((c.rules?.bypass || []).includes(from)) {
    await notifyOwner(c, `VIP text from ${from}: ${body.slice(0, 600)}`, { type: "owner_note" });
    await logEvent(c, "vip_text", { from });
    return twiml("");
  }

  if (unknownState) {
    // Rev 4 (QA-12 r3 F4): no reply and no model while the opt-out state is unknown, but keep the message and tell the
    // owner. notifyOwner emails even when the owner text is held (settle: 04's flag; without 04 it always does).
    const conv = await getConversation(c, "sms", from);
    conv.messages.push({ role: "user", content: body.slice(0, 1600), at: new Date().toISOString(), held: "optout_unreadable" });
    await saveConversation(conv).catch((e) => console.error("held inbound not saved", e?.message));
    await logEvent(c, "inbound_held", { from, reason: "optout_unreadable" }).catch(() => {});
    await notifyOwner(c, `${name} front desk: a text from ${from} could not be answered automatically (texting is paused for a moment). Please reply yourself: "${body.slice(0, 300)}"`, { type: "owner_alert", settle: true }).catch(() => {});
    return twiml("");
  }
  if (isOptedOut) return twiml(""); // opted out: no replies, no model

  // Paused or cancelled: one reply per number per 24 hours pointing at the main line, no model.
  if (!ACTIVE.includes(c.status)) {
    if (c.status === "paused" || c.status === "cancelled") {
      const conv = await getConversation(c, "sms", from);
      const last = [...conv.messages].reverse().find((m) => m.system === "paused-reply");
      if (last && Date.now() - new Date(last.at).getTime() < 24 * 3600 * 1000) return twiml("");
      const msg = `${name}: this line is not being answered right now. Please call ${c.phone?.businessNumber || "our main line"}.`;
      conv.messages.push({ role: "assistant", content: msg, at: new Date().toISOString(), system: "paused-reply" });
      await saveConversation(conv);
      return twiml(msg);
    }
    return twiml(`Thanks for texting ${name}. Please call ${c.phone?.businessNumber || "our main line"} and we will help right away.`);
  }

  await logEvent(c, "sms_inbound", { from }); await noteInbound(c);
  try { await noteReviewReply(c, from, body); } catch (err) { console.error("review reply", err); }
  const conv = await getConversation(c, "sms", from);
  // A YES to the marketing-consent ask: record it and answer without the model.
  try {
    const consentReply = await noteConsentReply(c, from, body, conv);
    if (consentReply) {
      conv.messages.push({ role: "user", content: body, at: new Date().toISOString() }, { role: "assistant", content: consentReply + "\n[Done: marketing consent recorded]", at: new Date().toISOString() });
      await saveConversation(conv);
      return twiml(consentReply);
    }
  } catch (err) { console.error("consent reply", err); }
  const bookings = await upcomingBookings(c, from);

  // Fast paths with no model: C confirms, R starts a reschedule, when exactly one visit is upcoming.
  if (bookings.length === 1) {
    const b = bookings[0];
    if (/^\s*(c|confirm|confirmed|yes)\s*[.!]*\s*$/i.test(body)) {
      await confirmVisit(c, b);
      const msg = b.language === "es" ? `${name}: su visita queda confirmada para ${dateEs(b.date)}, ${winEs(b.window).replace(/^(\d)/, "de $1")}. ¡Nos vemos!` : `${name}: confirmed for ${when(b)}. See you then.`;
      conv.messages.push({ role: "user", content: body, at: new Date().toISOString() }, { role: "assistant", content: msg + `\n[Done: visit confirmed, ref ${b.id}]`, at: new Date().toISOString() });
      await saveConversation(conv);
      return twiml(msg);
    }
    if (/^\s*(r|reschedule)\s*[.!]*\s*$/i.test(body)) {
      const msg = b.language === "es" ? `${name}: con gusto. ¿Qué día y horario le conviene? Tenemos ${(c.windows || []).map((w) => winEs(w).replace(/^(\d)/, "de $1")).join(" o ")}.` : `${name}: no problem. Which day and window works? We offer ${(c.windows || []).join(" or ")}.`;
      conv.messages.push({ role: "user", content: body, at: new Date().toISOString() }, { role: "assistant", content: msg, at: new Date().toISOString() });
      await saveConversation(conv);
      return twiml(msg);
    }
  }

  // Anything that needs the model runs in the background and replies through the Messages API,
  // because Twilio gives a webhook 15 seconds and a thoughtful reply can take longer.
  conv.messages.push({ role: "user", content: body.slice(0, 1500), at: new Date().toISOString() });
  await saveConversation(conv);
  try {
    await fetch(`${new URL(req.url).origin}/.netlify/functions/sms-agent-background`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": process.env.ADMIN_KEY || "" }, body: JSON.stringify({ slug: c.slug, from }) });
  } catch (err) { console.error("could not start sms agent", err); await logEvent(c, "sms_agent_failed", { from, error: "background start failed" }); }
  return twiml("");
};

export { sendSMS };
