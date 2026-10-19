// Runs the front desk on one inbound text and sends the reply through the Messages API.
// Started by sms.mjs after it has already answered Twilio's webhook.
import { getClient, getConversation, saveConversation, logEvent } from "./lib/store.mjs";
import { runAgent, toApiMessages } from "./lib/agent.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, UPDATE_VISIT } from "./lib/config.mjs";
import { bookVisit, flagLead, upcomingBookings, confirmVisit, rescheduleVisit, cancelRequest } from "./lib/desk.mjs";
import { sendSMS, e164, optedOut } from "./lib/send.mjs";

export default async (req) => {
  if (process.env.ADMIN_KEY && req.headers.get("x-admin-key") !== process.env.ADMIN_KEY) return new Response("forbidden", { status: 403 });
  let body; try { body = await req.json(); } catch { return new Response("bad", { status: 400 }); }
  const c = await getClient(body?.slug || "");
  const from = e164(body?.from || "");
  if (!c || !from) return new Response("ok");
  const conv = await getConversation(c.slug, "sms", from);
  const bookings = await upcomingBookings(c, from);
  const history = toApiMessages(conv.messages);
  const tools = bookings.length ? [BOOK_VISIT, NOTIFY_OWNER, UPDATE_VISIT] : [BOOK_VISIT, NOTIFY_OWNER];
  const execTool = async (tool, input) => {
    if (tool === "book_visit") { const b = await bookVisit(c, { ...input, phone: e164(input.phone) || from }, { channel: "sms", contact: from }); return { content: `Booked. Ref ${b.id}.`, event: { type: "booking", id: b.id } }; }
    if (tool === "notify_owner") { const l = await flagLead(c, { ...input, phone: e164(input.phone) || from }, { channel: "sms", contact: from }); return { content: l.status === "spam" ? "Noted as spam." : `Owner texted. Ref ${l.id}.`, event: { type: "lead", id: l.id, reason: l.reason } }; }
    if (tool === "update_visit") {
      const b = bookings.find((x) => x.id === input.booking_id) || bookings[0];
      if (!b) return { content: "No upcoming visit found for this number.", is_error: true };
      if (input.action === "confirm") { await confirmVisit(c, b); return { content: `Confirmed ref ${b.id}.`, event: { type: "confirmed", id: b.id } }; }
      if (input.action === "reschedule") { await rescheduleVisit(c, b, input.date, input.window); return { content: `Moved ref ${b.id} to ${b.date} ${b.window}. The owner has been told.`, event: { type: "rescheduled", id: b.id, date: b.date, window: b.window } }; }
      await cancelRequest(c, b); return { content: `Cancel request sent to the owner for ref ${b.id}; the visit stays until they confirm.`, event: { type: "cancel_request", id: b.id } };
    }
    return { content: "Unknown tool.", is_error: true };
  };
  let reply, done = "";
  try {
    const out = await runAgent({ system: buildSystemPrompt(c, "sms", { bookings }), tools, messages: history, execTool, maxTokens: 1200, dropToolPreamble: true });
    reply = out.reply;
    const first = reply.split(/(?<=[.!?])\s+/)[0] || "";
    if (/^(have|need|got|book|call|now|phone filled|ok,? (i|let)|let me)/i.test(first) && first.split(/\s+/).length < 12 && reply.length > first.length + 10) { reply = reply.slice(first.length).trim(); await logEvent(c.slug, "reply_trimmed", { from, dropped: first }); }
    done = (out.events || []).map((e) => e.type === "booking" ? `[Done: visit booked, ref ${e.id}]` : e.type === "lead" ? `[Done: owner notified, ref ${e.id}]` : e.type === "confirmed" ? `[Done: visit confirmed, ref ${e.id}]` : e.type === "rescheduled" ? `[Done: visit moved to ${e.date} ${e.window}, ref ${e.id}]` : e.type === "cancel_request" ? `[Done: cancel request sent, ref ${e.id}]` : "").filter(Boolean).join(" ");
  } catch (err) {
    console.error("sms agent failed", err);
    await logEvent(c.slug, "sms_agent_failed", { from, error: String(err?.message || err).slice(0, 200) });
    reply = `Sorry, I had trouble with that. Please call ${c.phone?.businessNumber || "us"} and a person will help.`;
  }
  const fresh = await getConversation(c.slug, "sms", from);
  fresh.messages.push({ role: "assistant", content: done ? reply + "\n" + done : reply, at: new Date().toISOString() });
  await saveConversation(fresh);
  if (!(await optedOut(from))) await sendSMS({ to: from, client: c, type: "reply", body: reply.slice(0, 1200) });
  await logEvent(c.slug, "sms_reply", { from });
  return new Response("ok");
};
