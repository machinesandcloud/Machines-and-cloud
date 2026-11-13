// Runs the front desk on one inbound text and sends the reply through the Messages API.
// Started by sms.mjs after it has already answered Twilio's webhook.
// Proposal 10: its own import lines, so the shared import lines below stay unchanged.
import { runAgent as runAgentLoop } from "./lib/agent.mjs";
import { agentFallbackLanguage } from "./lib/config.mjs";
import { getClient, getConversation, saveConversation, logEvent } from "./lib/store.mjs";
import { runAgent, toApiMessages } from "./lib/agent.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, UPDATE_VISIT, GET_AVAILABILITY } from "./lib/config.mjs";
import { bookVisit, flagLead, upcomingBookings, confirmVisit, rescheduleVisit, cancelRequest, availabilityToolResult, deliveryNote } from "./lib/desk.mjs";
import { sendSMS, e164, optOutStatus, notifyOwner } from "./lib/send.mjs";
import { withAutomatedIntro, looksSpanish } from "./lib/automated-disclosure.mjs";

export default async (req) => {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers.get("x-admin-key") !== key) return new Response("forbidden", { status: 403 });
  let body; try { body = await req.json(); } catch { return new Response("bad", { status: 400 }); }
  const c = await getClient(body?.slug || "");
  const from = e164(body?.from || "");
  if (!c || !from) return new Response("ok");
  const conv = await getConversation(c, "sms", from);
  // Rev 5 (QA r4 B1): a Netlify retry after a send error resends the SAVED reply. The model is not run again, so
  // there is no second booking and no "window filled". After the last failed try the owner is told once.
  const pending = conv.messages.at(-1);
  if (pending?.role === "assistant" && pending.undelivered === "send_error") return resendSaved(c, from, conv, pending);
  const bookings = await upcomingBookings(c, from);
  // A withheld (cut-off or refused) reply falls back in this number's upcoming-visit language, else
  // bilingual on a Spanish-enabled shop (agentFallbackLanguage); the call below is otherwise unchanged.
  // This local runAgent shadows the imported one inside this handler only.
  const runAgent = (options) => runAgentLoop({ ...options, logSlug: c.slug, fallbackLanguage: agentFallbackLanguage(c, bookings[0]) });
  const history = toApiMessages(conv.messages);
  const tools = bookings.length ? [BOOK_VISIT, NOTIFY_OWNER, UPDATE_VISIT, GET_AVAILABILITY] : [BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY];
  const execTool = async (tool, input) => {
    if (tool === "get_availability") return availabilityToolResult(c, input);
    if (tool === "book_visit") { const b = await bookVisit(c, { ...input, phone: e164(input.phone) || from }, { channel: "sms", contact: from }); if (b.full) return { content: b.message }; return { content: `Booked. Ref ${b.id}. ${deliveryNote(c, b)}`, event: { type: "booking", id: b.id } }; }
    if (tool === "notify_owner") { const l = await flagLead(c, { ...input, phone: e164(input.phone) || from }, { channel: "sms", contact: from }); return { content: l.status === "spam" ? "Noted as spam." : `Request saved. Ref ${l.id}. ${deliveryNote(c, l)}`, event: { type: "lead", id: l.id, reason: l.reason } }; }
    if (tool === "update_visit") {
      const b = bookings.find((x) => x.id === input.booking_id) || bookings[0];
      if (!b) return { content: "No upcoming visit found for this number.", is_error: true };
      if (input.action === "confirm") { await confirmVisit(c, b); return { content: `Confirmed ref ${b.id}.`, event: { type: "confirmed", id: b.id } }; }
      if (input.action === "reschedule") { const r = await rescheduleVisit(c, b, input.date, input.window); if (r?.full) return { content: r.message }; return { content: `Moved ref ${b.id} to ${b.date} ${b.window}. ${deliveryNote(c, b)}`, event: { type: "rescheduled", id: b.id, date: b.date, window: b.window } }; }
      await cancelRequest(c, b); return { content: `Cancel request saved for ref ${b.id}; the visit stays until the owner confirms. ${deliveryNote(c, b)}`, event: { type: "cancel_request", id: b.id } };
    }
    return { content: "Unknown tool.", is_error: true };
  };
  let reply, done = "";
  try {
    const out = await runAgent({ system: buildSystemPrompt(c, "sms", { bookings }), tools, messages: history, execTool, maxTokens: 1200, dropToolPreamble: true });
    reply = out.reply;
    const { kept, dropped } = dropPlanningLead(reply);
    if (dropped.length) { reply = kept; await logEvent(c, "reply_trimmed", { from, dropped: dropped.join(" ") }); }
    done = (out.events || []).map((e) => e.type === "booking" ? `[Done: visit booked, ref ${e.id}]` : e.type === "lead" ? `[Done: owner notified, ref ${e.id}]` : e.type === "confirmed" ? `[Done: visit confirmed, ref ${e.id}]` : e.type === "rescheduled" ? `[Done: visit moved to ${e.date} ${e.window}, ref ${e.id}]` : e.type === "cancel_request" ? `[Done: cancel request sent, ref ${e.id}]` : "").filter(Boolean).join(" ");
  } catch (err) {
    console.error("sms agent failed", err);
    await logEvent(c, "sms_agent_failed", { from, error: String(err?.message || err).slice(0, 200) });
    reply = `Sorry, I had trouble with that. Please call ${c.phone?.businessNumber || "us"} and a person will help.`;
  }
  const fresh = await getConversation(c, "sms", from);
  // P6: the first front-desk reply in this conversation says it is automated. Templated system texts
  // (a missed-call text-back) do not count as a reply.
  // Rev 3 (QA r2 B6): "first" = no delivered reply in this conversation carried the intro yet (m.disclosed), so a
  // templated fast-path answer ("C" confirmed) or an undelivered reply does not use the disclosure up. Conversations
  // from before this change have no flag and get the intro once more (a repeat, never a miss).
  const lastUser = [...fresh.messages].reverse().find((m) => m.role === "user")?.content || "";
  const first = !fresh.messages.some((m) => m.role === "assistant" && m.disclosed);
  reply = withAutomatedIntro(c, reply, { first, language: looksSpanish(lastUser) ? "es" : "en" });
  // Only a confirmed opt-out skips the reply here; an unreadable store is held and logged by sendSMS.
  // Rev 3 (QA r2 B2): the reply is saved with what happened to it. A refused or held reply is marked undelivered
  // and logged as sms_reply_undelivered, never as sms_reply.
  // Rev 4 (QA r3 B3): a throwing send (network error) must not lose the reply or its [Done: ...] marker, or a retry
  // would book again or say the window just filled. The reply is saved whatever the send does.
  let r;
  try { r = (await optOutStatus(from)) === true ? { ok: false, reason: "opted_out" } : await sendSMS({ to: from, client: c, type: "reply", body: reply.slice(0, 1200) }); }
  catch (err) { console.error("sms reply send failed", err?.message); r = { ok: false, reason: "send_error" }; }
  const delivered = !!(r?.ok || r?.logged);
  fresh.messages.push({ role: "assistant", content: done ? reply + "\n" + done : reply, at: new Date().toISOString(), ...(delivered ? (first ? { disclosed: true } : {}) : { undelivered: r?.reason || "not_sent", ...(r?.reason === "send_error" ? { outbound: reply.slice(0, 1200), intro: first, attempts: 1 } : {}) }) });
  await saveConversation(fresh);
  await logEvent(c, delivered ? "sms_reply" : "sms_reply_undelivered", { from, ...(delivered ? {} : { reason: r?.reason || "not_sent" }) });
  // Saved first, then rethrown so Netlify retries the function (as on 43ee2f2c); the retry takes resendSaved().
  if (r?.reason === "send_error") throw new Error("sms reply send_error (saved; retry resends it)");
  return new Response("ok");
};

// Netlify retries a failed background function twice (3 tries in all).
export const SEND_TRIES = 3;
async function resendSaved(c, from, conv, pending) {
  let r;
  try { r = (await optOutStatus(from)) === true ? { ok: false, reason: "opted_out" } : await sendSMS({ to: from, client: c, type: "reply", body: pending.outbound || String(pending.content).replace(/\n\[Done:[^\n]*\]\s*$/g, "").slice(0, 1200) }); }
  catch (err) { console.error("sms reply resend failed", err?.message); r = { ok: false, reason: "send_error" }; }
  const delivered = !!(r?.ok || r?.logged), attempts = (pending.attempts || 1) + 1;
  if (delivered) { delete pending.undelivered; delete pending.outbound; delete pending.attempts; if (pending.intro) pending.disclosed = true; delete pending.intro; pending.deliveredAt = new Date().toISOString(); }
  else if (r?.reason === "send_error" && attempts < SEND_TRIES) pending.attempts = attempts;
  else { pending.undelivered = r?.reason === "send_error" ? "send_error_final" : r?.reason || "not_sent"; pending.attempts = attempts; }
  await saveConversation(conv);
  await logEvent(c, delivered ? "sms_reply" : "sms_reply_undelivered", { from, resend: true, attempts, ...(delivered ? {} : { reason: pending.undelivered }) });
  if (!delivered && pending.undelivered === "send_error") throw new Error("sms reply resend send_error (retry resends it)");
  if (!delivered && pending.undelivered === "send_error_final") {
    const lastUser = [...conv.messages].reverse().find((m) => m.role === "user")?.content || "";
    await notifyOwner(c, `${c.business?.name || "Front desk"} front desk: the reply to ${from} could not be sent after ${attempts} tries. Please reply yourself. They wrote: "${String(lastUser).slice(0, 300)}"`, { type: "owner_alert", settle: true }).catch(() => {});
  }
  return new Response("ok");
}

// Last-resort filter for exact planning notes at the start of a completed SMS reply.
// runAgent withholds tool-use, truncated and refused text. Here, an internal tool name somewhere
// in a sentence is never enough to discard that sentence: it may also contain a safety instruction.
const TOOL = "(?:book_visit|notify_owner|update_visit|get_availability|bookVisit|notifyOwner|updateVisit|getAvailability|flagLead)";
const TOOL_NOTE = new RegExp(`^(?:(?:now|next|then)[,:]?\\s+)?(?:(?:call|calling|use|using|run|running)\\s+)?${TOOL}(?:\\s+(?:now|next|done|completed|as (?:emergency|urgent|lead|spam)|with urgency (?:emergency|urgent|normal)))?$`, "i");
const SPACED_TOOL_NOTE = /^(?:(?:(?:now|next|then)[,:]?\s+)?(?:call|calling|use|using|run|running)\s+(?:book visit|update visit|get availability)(?:\s+(?:now|next))?|(?:now|next|then)\s+notify owner as (?:emergency|urgent|lead|spam))$/i;
const FIELD = "(?:customer\\s+)?(?:name|phone(?:\\s+number)?|number|address|issue|problem|window|date|time|email|zip|urgency)";
const STATUS = "(?:[a-z]+\\s+)?(?:flagged|filled|captured|collected|confirmed|noted|set)(?:\\s+automatically)?";
const SEGMENT = `(?:${FIELD}(?:\\s+${STATUS})?|[a-z]+\\s+(?:flagged|noted))`;
const CHECKLIST = new RegExp(`^(?:(?:now|next|then|ok|okay)[,:]?\\s+)?(?:(?:have|got|need|still need|missing|ask(?:\\s+for)?|collect)\\s*:?\\s+)?${SEGMENT}(?:\\s*(?:,|;|/|&|\\band\\b)\\s*${SEGMENT})*$`, "i");
const FLAG_NOTE = /^(?:(?:now\s+)?flag(?:ging)?\s+(?:as\s+)?(?:emergency|urgent|lead|spam)|(?:now\s+)?book(?:ing)?\s+it(?:\s+now)?|(?:now\s+)?notifying\s+(?:the\s+)?owner|book(?:ing)?\s+(?:the\s+)?visit(?:\s+(?:now|next|done|ok))?)$/i;
const bareNote = text => text.trim().replace(/[.!]+$/, "").trim();
// A clause naming an internal tool is also a note when nothing remains after removing the tool name
// (with a call/use/run verb directly before it) and a closed list of note words: "Notify_owner sent",
// "I used notify_owner", "notify_owner hecho". Any other word ("leave", "911", "might") keeps it.
const TOOL_STRIP = new RegExp(`(?:\\b(?:call|calling|use|using|used|run|running|ran)\\s+(?:the\\s+)?)?\\b${TOOL}\\b`, "gi");
const NOTE_WORD = /^(?:now|next|then|done|completed|sent|ok|okay|ready|called|used|ran|via|flagged|flag|as|emergency|urgent|lead|spam|booked|booking|it|is|was|has|been|i|i've|we|the|tool|with|urgency|priority|confirm|confirmed|listo|hecho|enviado|ya|and)$/i;
// Beside a note, a clause is dropped only when it is a bare status word ("Done", "ok", "listo"), never
// when it carries customer words such as "It is urgent", "Emergency" or "then confirm" (QA-DELTA D1).
const COMPANION = /^(?:done|completed|sent|ok|okay|ready|listo|hecho|enviado)$/i;
const residue = text => text.replace(TOOL_STRIP, " ").replace(/[^\p{L}\p{N}'\s]/gu, " ").split(/\s+/).filter(w => w && !NOTE_WORD.test(w));
const namesToolId = text => new RegExp(`\\b${TOOL}\\b`, "i").test(text);
const isToolNote = text => !/\?$/.test(text.trim()) && (TOOL_NOTE.test(bareNote(text)) || SPACED_TOOL_NOTE.test(bareNote(text)) || (namesToolId(text) && residue(bareNote(text)).length === 0));
function isPlanningSentence(sentence) {
  const t = sentence.trim();
  if (!t || /\?$/.test(t)) return false;
  const bare = bareNote(t);
  if (isToolNote(t) || FLAG_NOTE.test(bare)) return true;
  if (!CHECKLIST.test(bare)) return false;
  // A bare field alone is ambiguous; require a verb, a list or a status.
  return /\b(?:have|got|need|missing|ask|collect|flagged|filled|captured|collected|confirmed|noted|set)\b/i.test(bare) || /[,;/&]|\band\b/i.test(bare);
}
function leadSentence(text) {
  const m = text.match(/^[^\n]*?[.!?](?=\s)|^[^\n]+(?=\n)/);
  return m ? m[0] : text;
}
function dropPlanningLead(reply) {
  let rest = reply.trim();
  const dropped = [];
  while (rest) {
    const first = leadSentence(rest);
    if (isPlanningSentence(first)) {
      // Keep an ambiguous lone field/checklist request. An exact tool note has no customer content.
      if (first === rest && !isToolNote(first)) break;
      dropped.push(first); rest = rest.slice(first.length).trimStart();
      continue;
    }
    // Remove only complete tool-note clauses (and, beside one, a bare status word such as "Done"; a
    // lone "Next" stays); every other clause is kept byte for byte with its original separator, so
    // "If it sparks, stay clear and call 911" is never rewritten.
    const [, body, end] = first.match(/^([\s\S]*?)([.!?]*)$/);
    const paren = [];
    // A parenthesis that closes a "?" sentence keeps the question guard too: "Leave now (notify_owner done)?" is sent as written.
    const flat = body.replace(/\s*\(((?:[^()]|\(\))*)\)/g, (all, inner, at) => isToolNote(/\?/.test(end) && at + all.length === body.length ? inner + "?" : inner) ? (paren.push(inner), "") : all);
    const parts = flat.split(/(\s*[;,]\s*|\s+[-\u2013\u2014]\s+|\s+and\s+)/i);
    const clauses = parts.filter((_, i) => i % 2 === 0);
    // A sentence ending in "?" keeps the question guard on its last clause: "Leave now, notify_owner
    // done?" is sent as written (as on a54), never turned into "Leave now?".
    const question = (i) => /\?/.test(end) && i === clauses.length - 1;
    const strict = clauses.map((x, i) => isToolNote(question(i) ? x + "?" : x));
    // A note-words-only clause ("then confirm") goes only when the whole sentence is note material;
    // beside any customer clause, only bare status words go.
    const noteish = clauses.map((x, i) => strict[i] || !x.trim() || !question(i) && residue(x).length === 0 && !/^(?:now|next|then)$/i.test(x.trim()));
    const notes = !strict.some(Boolean) ? strict : noteish.every(Boolean) ? noteish : clauses.map((x, i) => strict[i] || !x.trim() || !question(i) && COMPANION.test(bareNote(x)));
    if (paren.length || clauses.length > 1 && notes.some(Boolean)) {
      let kept = "";
      clauses.forEach((x, i) => { if (notes[i]) { if (x.trim()) dropped.push(x); } else kept += kept ? parts[2 * i - 1] + x : x; });
      dropped.push(...paren);
      kept = kept.trim();
      if (!kept) { rest = rest.slice(first.length).trimStart(); continue; }
      if (notes[0]) kept = kept.charAt(0).toUpperCase() + kept.slice(1);
      if (!/[.!?:]$/.test(kept)) kept += end || ".";
      // Keep the original break after the lead sentence, so a list keeps its newline (QA-DELTA D2).
      rest = kept + (first === rest ? "" : (rest.slice(first.length).match(/^\s*/)[0] || " ") + rest.slice(first.length).trimStart());
    }
    break;
  }
  return dropped.length ? { kept: rest || "Sorry, could you say that again?", dropped } : { kept: reply, dropped: [] };
}
