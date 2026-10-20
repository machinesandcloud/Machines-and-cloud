// Vapi server webhook: picks the assistant for an incoming call (with what we know about the caller),
// runs our tools during the call, and files the transcript and the minutes when the call ends.
import { getClient, get, clientByNumber, getConversation, saveConversation, logEvent, listRecords } from "./lib/store.mjs";
import { bookVisit, flagLead, callerContext, cellIsForwardedLine } from "./lib/desk.mjs";
import { json } from "./lib/agent.mjs";
import { e164 } from "./lib/send.mjs";
import { addUsage } from "./lib/usage.mjs";
import { standardGreeting } from "./lib/vapi.mjs";

export const config = { path: "/api/vapi" };

// Vapi ended reasons that mean the call failed on the platform side (as opposed to a caller hanging up).
const NORMAL_END = /^(customer-ended-call|assistant-ended-call|assistant-forwarded-call|assistant-said-end-call-phrase|voicemail|silence-timed-out|exceeded-max-duration|customer-busy|customer-did-not-answer|customer-did-not-give-microphone-permission|manually-canceled|assistant-ended-call-after-message-spoken|assistant-ended-call-with-hangup-task)$/;
export function isVoiceFailure(reason) {
  const r = String(reason || "");
  if (!r || NORMAL_END.test(r)) return false;
  return /^(assistant-request-returned-error|assistant-request-failed|assistant-not-found|assistant-not-valid|assistant-request-returned-invalid|twilio-failed-to-connect-call|phone-call-provider-|call\.in-progress\.error-|pipeline-error-|db-error|unknown-error|worker-shutdown|vonage-)|-(llm|voice|transcriber)-failed|-failed$|error/.test(r);
}

async function resolveClient(m) {
  const slug = m?.assistant?.metadata?.slug || m?.call?.assistant?.metadata?.slug;
  if (slug) { const c = await getClient(slug); if (c) return c; }
  const num = e164(m?.phoneNumber?.number || m?.call?.phoneNumber?.number || "");
  if (num) { const c = await clientByNumber(num); if (c) return c; }
  const aid = m?.assistant?.id || m?.call?.assistantId;
  if (aid) { const s = await get("index", "vapi:" + aid); if (s) return getClient(s); }
  return null;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (process.env.VAPI_WEBHOOK_SECRET && req.headers.get("x-vapi-secret") !== process.env.VAPI_WEBHOOK_SECRET) return json({ error: "forbidden" }, 403);
  let body; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const m = body?.message || {};
  const c = await resolveClient(m);
  if (!c) return json({ results: (m.toolCallList || []).map((t) => ({ toolCallId: t.id, error: "Unknown business." })) });
  const caller = e164(m?.customer?.number || m?.call?.customer?.number || "");
  const callId = m?.call?.id || "call";

  // Incoming call: which assistant, and what we already know about this caller.
  if (m.type === "assistant-request") {
    const assistantId = c.voice?.assistantId;
    if (!assistantId || c.voice?.detached || !["testing", "live"].includes(c.status)) { await logEvent(c.slug, "assistant_request_failed", { from: caller, reason: !assistantId ? "no_assistant" : c.voice?.detached ? "detached" : c.status }); return json({ error: `${c.business?.name || "This line"} is not answering calls right now. Please call back during business hours.` }); }
    const owner = c.owner?.name || "the owner";
    if (caller && (c.rules?.bypass || []).includes(caller)) {
      await logEvent(c.slug, "vip_call", { from: caller, rang: !cellIsForwardedLine(c) && c.owner?.phone ? "cell" : "assistant" });
      if (!cellIsForwardedLine(c) && c.owner?.phone) return json({ destination: { type: "number", number: c.owner.phone, message: `Connecting you to ${owner}.` } });
      return json({ assistantId, assistantOverrides: { firstMessage: `This is ${c.business?.name || "the front desk"}. Please leave a message after the tone and ${owner} will call you back.`, variableValues: { customerName: "", isExisting: "", upcomingVisit: "", vip: "yes" } } });
    }
    const ctx = await callerContext(c, caller, body?.at || undefined);
    const first = ctx.upcomingVisit
      ? `Thanks for calling ${c.business?.name}. This is the front desk assistant. Hi ${ctx.customerName}, your visit is ${ctx.upcomingVisit}. How can I help?`
      : ctx.customerName ? `Thanks for calling ${c.business?.name}. This is the front desk assistant. Hi ${ctx.customerName}, how can I help today?` : standardGreeting(c);
    await logEvent(c.slug, "call_started", { from: caller, known: !!ctx.customerName });
    return json({ assistantId, assistantOverrides: { firstMessage: first, variableValues: { customerName: ctx.customerName, isExisting: ctx.isExisting, upcomingVisit: ctx.upcomingVisit, vip: "" } } });
  }

  if (m.type === "tool-calls") {
    const results = [];
    for (const t of m.toolCallList || []) {
      const name = t.function?.name || t.name; let input = t.function?.arguments ?? t.arguments ?? {};
      if (typeof input === "string") { try { input = JSON.parse(input); } catch { input = {}; } }
      try {
        if (name === "book_visit") { const b = await bookVisit(c, { ...input, phone: e164(input.phone) || caller }, { channel: "call", contact: caller || callId }); results.push({ toolCallId: t.id, result: `Booked, reference ${b.id}. The owner has the details and the customer will get a text reminder.` }); }
        else if (name === "notify_owner") { const l = await flagLead(c, { ...input, phone: e164(input.phone) || caller }, { channel: "call", contact: caller || callId }); results.push({ toolCallId: t.id, result: `The owner has been texted, reference ${l.id}.` }); }
        else results.push({ toolCallId: t.id, error: "Unknown tool." });
      } catch (err) { console.error("vapi tool", name, err); await logEvent(c.slug, "vapi_tool_failed", { name, error: String(err?.message || err).slice(0, 200) }); results.push({ toolCallId: t.id, error: "The tool failed. Apologize and take the caller's number for a callback." }); }
    }
    return json({ results });
  }

  if (m.type === "end-of-call-report") {
    const transcript = m?.artifact?.transcript || "";
    const msgs = (m?.artifact?.messages || []).filter((x) => x.role === "user" || x.role === "bot" || x.role === "assistant").map((x) => ({ role: x.role === "user" ? "user" : "assistant", content: String(x.message || x.content || "").slice(0, 1500), at: new Date().toISOString() }));
    const conv = await getConversation(c.slug, "call", caller || callId);
    conv.messages.push(...(msgs.length ? msgs : [{ role: "assistant", content: transcript.slice(0, 4000), at: new Date().toISOString() }]));
    conv.summary = m?.analysis?.summary || "";
    conv.endedReason = m.endedReason;
    await saveConversation(conv);
    const seconds = m.startedAt && m.endedAt ? Math.max(0, Math.round((new Date(m.endedAt) - new Date(m.startedAt)) / 1000)) : null;
    await logEvent(c.slug, "call_ended", { from: caller, reason: m.endedReason, seconds });
    if (isVoiceFailure(m.endedReason)) await logEvent(c.slug, "voice_failed", { from: caller, reason: m.endedReason });
    try { await addUsage(c, { minutes: seconds ? Math.ceil(seconds / 60) : 0, calls: 1 }); } catch (err) { console.error("usage", err); }
    if (/transfer/i.test(String(m.endedReason || ""))) await logEvent(c.slug, "transferred", { from: caller });
    // A call that produced neither a booking nor a lead still deserves an owner note when we know the number.
    if (caller) {
      const recent = (await listRecords("leads", c.slug, 20)).concat(await listRecords("bookings", c.slug, 20)).filter((r) => r.phone === caller && Date.now() - new Date(r.createdAt).getTime() < 15 * 60 * 1000);
      if (!recent.length && conv.summary) await flagLead(c, { customer_name: "", phone: caller, address: "", issue: conv.summary.slice(0, 200), reason: "question", urgency: "flexible", wanted: "", language: "en", unsure: "" }, { channel: "call", contact: caller });
    }
    return json({ ok: true });
  }
  return json({ ok: true });
};
