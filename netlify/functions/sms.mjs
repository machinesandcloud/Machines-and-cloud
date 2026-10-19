// Twilio inbound SMS webhook. The "To" number identifies the client (or, on the shared bridge number,
// the "From" number is looked up in the bridge index). Texts from the owner's phone are commands
// (ok/otw/done/quote/paid/cancel/help); everything else is a customer talking to the front desk.
import { clientByNumber, getClient, get, getConversation, saveConversation, logEvent, cancelTasksForNumber } from "./lib/store.mjs";
import { runAgent, toApiMessages } from "./lib/agent.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, UPDATE_VISIT, ACTIVE } from "./lib/config.mjs";
import { bookVisit, flagLead, ownerCommand, upcomingBookings, confirmVisit, rescheduleVisit, cancelRequest } from "./lib/desk.mjs";
import { sendSMS, twilioSignatureValid, e164, recordOptOut, clearOptOut, notifyOwner, optedOut } from "./lib/send.mjs";

export const config = { path: "/api/sms" };

const twiml = (msg) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]))}</Message>` : ""}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });

const HELP = 'Commands: "ok <ref>" acknowledges an alert, "otw <ref>" sends the on-the-way text, "done <ref>" marks the job done and starts the review and payment follow-ups, "quote <ref> <amount>" logs a quote (day-14 check), "paid <ref>", "cancel <ref>". The ref is on each summary text.';
const STOP_RE = /^\s*(stop|stopall|unsubscribe|end|quit|cancel|revoke|opt\s*out|optout)\b[\s.!]*$/i;
const STOP_PHRASE = /\b(stop texting|stop messaging|do not text|don't text|no more texts|remove me)\b/i;
const START_RE = /^\s*(start|unstop|yes)\s*[.!]*\s*$/i;

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
  const adminOk = process.env.ADMIN_KEY && req.headers.get("x-admin-key") === process.env.ADMIN_KEY;
  const sigUrl = (process.env.URL || new URL(req.url).origin) + "/api/sms";
  if (!adminOk && process.env.TWILIO_AUTH_TOKEN && !twilioSignatureValid(sigUrl, params, req.headers.get("x-twilio-signature") || "")) return new Response("bad signature", { status: 403 });

  const to = e164(params.To), from = e164(params.From), body = String(params.Body || "").trim();
  const c = await resolveClient(to, from);
  if (!c || !body) return twiml("");
  const name = c.business?.name || "We";

  // Owner commands
  if (c.owner?.phone && from === c.owner.phone) {
    if (/^help$/i.test(body)) return twiml(HELP);
    const reply = await ownerCommand(c, body);
    if (reply) { await logEvent(c.slug, "owner_command", { body }); return twiml(reply); }
    return twiml(`Did not catch that. ${HELP}`);
  }

  // Numbers on the owner's always-ring-through list: relay the text, never answer it.
  if ((c.rules?.bypass || []).includes(from)) {
    await notifyOwner(c, `VIP text from ${from}: ${body.slice(0, 600)}`, { type: "owner_note" });
    await logEvent(c.slug, "vip_text", { from });
    return twiml("");
  }

  // Opt-out and opt-in come before anything else (FCC: any reasonable means).
  if (STOP_RE.test(body) || STOP_PHRASE.test(body)) {
    await recordOptOut(from, c.slug, body.slice(0, 80));
    const n = await cancelTasksForNumber(from);
    await logEvent(c.slug, "opt_out", { from, cancelled: n, viaTwilio: !!params.OptOutType });
    await notifyOwner(c, `${name} front desk: ${from} opted out of texts. Nothing more will be sent to them.`, { type: "owner_note" });
    // "cancel" from someone with a visit on the books is also a cancellation request: the owner decides.
    let told = "";
    if (/^\s*cancel\b/i.test(body) && ACTIVE.includes(c.status)) {
      const visits = await upcomingBookings(c, from);
      for (const b of visits) await cancelRequest(c, b);
      if (visits.length) told = ` We've told ${c.owner?.name || "the owner"} about your visit.`;
    }
    if (params.OptOutType) return twiml(""); // Twilio already sent the carrier-standard confirmation
    return twiml(`${name}: you're unsubscribed and will get no more texts from this number.${told} Reply START to resume.`);
  }
  if (await optedOut(from)) {
    if (START_RE.test(body)) { await clearOptOut(from); await logEvent(c.slug, "opt_in", { from }); return twiml(`${name}: you're subscribed again. Reply STOP any time.`); }
    return twiml(""); // opted out: no replies, no model
  }

  // Paused or cancelled: one reply per number per 24 hours pointing at the main line, no model.
  if (!ACTIVE.includes(c.status)) {
    if (c.status === "paused" || c.status === "cancelled") {
      const conv = await getConversation(c.slug, "sms", from);
      const last = [...conv.messages].reverse().find((m) => m.system === "paused-reply");
      if (last && Date.now() - new Date(last.at).getTime() < 24 * 3600 * 1000) return twiml("");
      const msg = `${name}: this line is not being answered right now. Please call ${c.phone?.businessNumber || "our main line"}.`;
      conv.messages.push({ role: "assistant", content: msg, at: new Date().toISOString(), system: "paused-reply" });
      await saveConversation(conv);
      return twiml(msg);
    }
    return twiml(`Thanks for texting ${name}. Please call ${c.phone?.businessNumber || "our main line"} and we will help right away.`);
  }

  await logEvent(c.slug, "sms_inbound", { from });
  const conv = await getConversation(c.slug, "sms", from);
  const bookings = await upcomingBookings(c, from);

  // Fast paths with no model: C confirms, R starts a reschedule, when exactly one visit is upcoming.
  if (bookings.length === 1) {
    const b = bookings[0];
    if (/^\s*(c|confirm|confirmed|yes)\s*[.!]*\s*$/i.test(body)) {
      await confirmVisit(c, b);
      const msg = `${name}: confirmed for ${b.date && b.date !== "today" ? b.date + ", " : ""}${b.window}. See you then.`;
      conv.messages.push({ role: "user", content: body, at: new Date().toISOString() }, { role: "assistant", content: msg + `\n[Done: visit confirmed, ref ${b.id}]`, at: new Date().toISOString() });
      await saveConversation(conv);
      return twiml(msg);
    }
    if (/^\s*(r|reschedule)\s*[.!]*\s*$/i.test(body)) {
      const msg = `${name}: no problem. Which day and window works? We offer ${(c.windows || []).join(" or ")}.`;
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
  } catch (err) { console.error("could not start sms agent", err); await logEvent(c.slug, "sms_agent_failed", { from, error: "background start failed" }); }
  return twiml("");
};

export { sendSMS };
