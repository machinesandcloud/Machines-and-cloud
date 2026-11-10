// Runs the front desk on one inbound text and sends the reply through the Messages API.
// Started by sms.mjs after it has already answered Twilio's webhook.
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
const FLAG_NOTE = /^(?:(?:now\s+)?flag(?:ging)?\s+(?:as\s+)?(?:emergency|urgent|lead|spam)|(?:now\s+)?book(?:ing)?\s+it(?:\s+now)?)$/i;
const bareNote = text => text.trim().replace(/[.!]+$/, "").trim();
const isToolNote = text => !/\?$/.test(text.trim()) && (TOOL_NOTE.test(bareNote(text)) || SPACED_TOOL_NOTE.test(bareNote(text)));
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
    // Remove only complete tool-note clauses; retain every other word, including safety text.
    const clauses = bareNote(first).split(/\s*(?:;|,|\band\b)\s*/);
    const notes = clauses.filter(isToolNote);
    if (clauses.length > 1 && notes.length) {
      const keep = clauses.filter(clause => !isToolNote(clause));
      dropped.push(...notes);
      rest = keep.join("; ") + "." + (first === rest ? "" : " " + rest.slice(first.length).trimStart());
    }
    break;
  }
  return dropped.length ? { kept: rest || "Sorry, could you say that again?", dropped } : { kept: reply, dropped: [] };
}
