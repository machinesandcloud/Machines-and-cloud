// Runs the front desk on one inbound text and sends the reply through the Messages API.
// Started by sms.mjs after it has already answered Twilio's webhook.
// Proposal 10: its own import lines, so the shared import lines below stay unchanged.
import { runAgent as runAgentLoop } from "./lib/agent.mjs";
import { agentFallbackLanguage } from "./lib/config.mjs";
import { getClient, getConversation, saveConversation, logEvent } from "./lib/store.mjs";
import { runAgent, toApiMessages } from "./lib/agent.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, UPDATE_VISIT, GET_AVAILABILITY } from "./lib/config.mjs";
import { bookVisit, flagLead, upcomingBookings, confirmVisit, rescheduleVisit, cancelRequest, availabilityToolResult } from "./lib/desk.mjs";
import { sendSMS, e164, optedOut } from "./lib/send.mjs";

export default async (req) => {
  const key = process.env.ADMIN_KEY;
  if (!key || req.headers.get("x-admin-key") !== key) return new Response("forbidden", { status: 403 });
  let body; try { body = await req.json(); } catch { return new Response("bad", { status: 400 }); }
  const c = await getClient(body?.slug || "");
  const from = e164(body?.from || "");
  if (!c || !from) return new Response("ok");
  const conv = await getConversation(c, "sms", from);
  const bookings = await upcomingBookings(c, from);
  // A withheld (cut-off or refused) reply falls back in this number's upcoming-visit language, else
  // bilingual on a Spanish-enabled shop (agentFallbackLanguage); the call below is otherwise unchanged.
  // This local runAgent shadows the imported one inside this handler only.
  const runAgent = (options) => runAgentLoop({ ...options, logSlug: c.slug, fallbackLanguage: agentFallbackLanguage(c, bookings[0]) });
  const history = toApiMessages(conv.messages);
  const tools = bookings.length ? [BOOK_VISIT, NOTIFY_OWNER, UPDATE_VISIT, GET_AVAILABILITY] : [BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY];
  const execTool = async (tool, input) => {
    if (tool === "get_availability") return availabilityToolResult(c, input);
    if (tool === "book_visit") { const b = await bookVisit(c, { ...input, phone: e164(input.phone) || from }, { channel: "sms", contact: from }); if (b.full) return { content: b.message }; return { content: `Booked. Ref ${b.id}.`, event: { type: "booking", id: b.id } }; }
    if (tool === "notify_owner") { const l = await flagLead(c, { ...input, phone: e164(input.phone) || from }, { channel: "sms", contact: from }); return { content: l.status === "spam" ? "Noted as spam." : `Owner texted. Ref ${l.id}.`, event: { type: "lead", id: l.id, reason: l.reason } }; }
    if (tool === "update_visit") {
      const b = bookings.find((x) => x.id === input.booking_id) || bookings[0];
      if (!b) return { content: "No upcoming visit found for this number.", is_error: true };
      if (input.action === "confirm") { await confirmVisit(c, b); return { content: `Confirmed ref ${b.id}.`, event: { type: "confirmed", id: b.id } }; }
      if (input.action === "reschedule") { const r = await rescheduleVisit(c, b, input.date, input.window); if (r?.full) return { content: r.message }; return { content: `Moved ref ${b.id} to ${b.date} ${b.window}. The owner has been told.`, event: { type: "rescheduled", id: b.id, date: b.date, window: b.window } }; }
      await cancelRequest(c, b); return { content: `Cancel request sent to the owner for ref ${b.id}; the visit stays until they confirm.`, event: { type: "cancel_request", id: b.id } };
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
  fresh.messages.push({ role: "assistant", content: done ? reply + "\n" + done : reply, at: new Date().toISOString() });
  await saveConversation(fresh);
  if (!(await optedOut(from))) await sendSMS({ to: from, client: c, type: "reply", body: reply.slice(0, 1200) });
  await logEvent(c, "sms_reply", { from });
  return new Response("ok");
};

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
