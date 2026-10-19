// Vapi server webhook: runs our tools during a call and files the transcript when the call ends.
import { getClient, get, clientByNumber, getConversation, saveConversation, logEvent, listRecords } from "./lib/store.mjs";
import { bookVisit, flagLead } from "./lib/desk.mjs";
import { json } from "./lib/agent.mjs";
import { e164 } from "./lib/send.mjs";

export const config = { path: "/api/vapi" };

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

  if (m.type === "tool-calls") {
    const results = [];
    for (const t of m.toolCallList || []) {
      const name = t.function?.name || t.name; let input = t.function?.arguments ?? t.arguments ?? {};
      if (typeof input === "string") { try { input = JSON.parse(input); } catch { input = {}; } }
      try {
        if (name === "book_visit") { const b = await bookVisit(c, { ...input, phone: input.phone || caller }, { channel: "call", contact: caller || callId }); results.push({ toolCallId: t.id, result: `Booked, reference ${b.id}. The owner has the details and the customer will get a text reminder.` }); }
        else if (name === "notify_owner") { const l = await flagLead(c, { ...input, phone: input.phone || caller }, { channel: "call", contact: caller || callId }); results.push({ toolCallId: t.id, result: `The owner has been texted, reference ${l.id}.` }); }
        else results.push({ toolCallId: t.id, error: "Unknown tool." });
      } catch (err) { console.error("vapi tool", name, err); results.push({ toolCallId: t.id, error: "The tool failed. Apologize and take the caller's number for a callback." }); }
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
    await logEvent(c.slug, "call_ended", { from: caller, reason: m.endedReason, seconds: m.startedAt && m.endedAt ? Math.round((new Date(m.endedAt) - new Date(m.startedAt)) / 1000) : null });
    // A call that produced neither a booking nor a lead still deserves an owner note when we know the number.
    if (caller) {
      const recent = (await listRecords("leads", c.slug, 20)).concat(await listRecords("bookings", c.slug, 20)).filter((r) => r.phone === caller && Date.now() - new Date(r.createdAt).getTime() < 15 * 60 * 1000);
      if (!recent.length && conv.summary) await flagLead(c, { customer_name: "", phone: caller, address: "", issue: conv.summary.slice(0, 200), reason: "question", urgency: "flexible", language: "en" }, { channel: "call", contact: caller });
    }
    return json({ ok: true });
  }
  return json({ ok: true });
};
