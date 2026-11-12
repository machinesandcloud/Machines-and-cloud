// Vapi server webhook: picks the assistant for an incoming call (with what we know about the caller),
// runs our tools during the call, and files the transcript and the minutes when the call ends.
import { getClient, get, put, del, atomicUpdate, clientByNumber, getConversation, saveConversation, logEvent, recordsFor, listWorkspaceRecords, noteInbound } from "./lib/store.mjs";
import { bookVisit, flagLead, callerContext, cellIsForwardedLine, availabilityToolResult, deliveryNote } from "./lib/desk.mjs";
import { json } from "./lib/agent.mjs";
import { e164, notifyOwner } from "./lib/send.mjs";
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

// A legacy tool that throws may already have saved its record (the booking or lead is written before the
// texts go out). The result must say what is known, never invite a retry that books twice, and never
// promise a callback nobody was told about (voice review V2).
const toolKey = (c, callId, toolCallId) => `vapitool:${c.slug}:${callId}:${toolCallId}`;
const callBookingKey = (c, callId) => `vapicall:${c.slug}:${callId}:booking`;
// A booking slot left pending by a run that stopped after saving (function killed, or its result writes failed)
// is resolved from the caller's bookings saved since the slot was claimed (QA-11 r2 R6).
// Only a phone-call visit saved since the claim counts; a visit the same number booked by text or web is not this call's.
// The phone index misses a visit saved without a phone, or whose index write failed, so a bounded scan by the call's contact backs it up.
async function bookedSince(c, slot) {
  const { phone, at, contact } = slot || {};
  if (!at) return null;
  const mine = (r) => r?.channel === "call" && String(r.createdAt || "") >= at && ((phone && r.phone === phone) || (contact && r.contact === contact));
  try { const hit = phone ? (await recordsFor("bookings", c, phone)).filter(mine).pop() : null; if (hit) return hit; } catch {}
  try { return (await listWorkspaceRecords(c, "bookings", 200)).records.filter(mine).pop() || null; } catch { return null; }
}
const BOOKING_UNCONFIRMED = "A visit on this call may already be saved, but it could not be confirmed yet. Do not book another, do not say it was booked or saved, and do not promise a callback. Say the shop has a record of this call.";
async function savedSince(c, kind, phone, before) {
  if (!phone) return null;
  try { return (await recordsFor(kind, c, phone)).filter((r) => r?.phone === phone && !before.has(r.id)).pop() || null; } catch { return null; }
}
async function recoveryAlert(c, kind, rec) {
  const what = kind === "bookings" ? `a visit (ref ${rec.id}, ${rec.date || "date not set"} ${rec.window || ""})` : `a request (ref ${rec.id})`;
  const text = `${c.business?.name || "Front desk"} front desk: a phone call saved ${what} for ${rec.customer_name || "a caller"} ${rec.phone || ""}, but the confirmation step failed. Check the portal. This may repeat an earlier alert.`;
  try { return (await notifyOwner(c, text, { type: "owner_alert", settle: true })).some((r) => r?.ok); } catch { return false; }
}
function uncertainResult(c, name, kind, rec, alerted) {
  const owner = c.owner?.name || "the owner";
  const noRepeat = `Do not call ${name} again for this caller on this call.`;
  if (!rec) return `This could not be confirmed. It may or may not be saved. Do not say it was booked, saved or sent, do not promise a callback, and do not repeat this action. Say the shop has a record of this call.`;
  const saved = kind === "bookings" ? `The visit was saved, reference ${rec.id}, but its confirmation step failed.` : `The request was saved, reference ${rec.id}, but its confirmation step failed.`;
  return `${saved} ${noRepeat} ${alerted ? `${owner} was sent an alert about it (accepted by the provider; delivery and reading are not confirmed).` : `${owner} could not be alerted; it is saved in the shop's portal. Do not say ${owner} was told, and do not promise a callback or a confirmation text.`}`;
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
    if (!assistantId || c.voice?.detached || !["testing", "live"].includes(c.status)) { await logEvent(c, "assistant_request_failed", { from: caller, reason: !assistantId ? "no_assistant" : c.voice?.detached ? "detached" : c.status }); return json({ error: `${c.business?.name || "This line"} is not answering calls right now. Please call again later.` }); }
    const owner = c.owner?.name || "the owner";
    if (caller && (c.rules?.bypass || []).includes(caller)) {
      await logEvent(c, "vip_call", { from: caller, rang: !cellIsForwardedLine(c) && c.owner?.phone ? "cell" : "assistant" });
      if (!cellIsForwardedLine(c) && c.owner?.phone) return json({ destination: { type: "number", number: c.owner.phone, message: `Connecting you to ${owner}.` } });
      return json({ assistantId, assistantOverrides: { firstMessage: `This is ${c.business?.name || "the front desk"}. ${owner} cannot pick up right now. I can take a message for ${owner}.`, variableValues: { customerName: "", isExisting: "", upcomingVisit: "", vip: "yes" } } });
    }
    const ctx = await callerContext(c, caller, body?.at || undefined);
    const first = ctx.upcomingVisit
      ? `Thanks for calling ${c.business?.name}. This is the front desk assistant. Hi ${ctx.customerName}, your visit is ${ctx.upcomingVisit}. How can I help?`
      : ctx.customerName ? `Thanks for calling ${c.business?.name}. This is the front desk assistant. Hi ${ctx.customerName}, how can I help today?` : standardGreeting(c);
    await logEvent(c, "call_started", { from: caller, known: !!ctx.customerName }); await noteInbound(c, "call");
    return json({ assistantId, assistantOverrides: { firstMessage: first, variableValues: { customerName: ctx.customerName, isExisting: ctx.isExisting, upcomingVisit: ctx.upcomingVisit, vip: "" } } });
  }

  if (m.type === "tool-calls") {
    const results = [];
    for (const t of m.toolCallList || []) {
      const name = t.function?.name || t.name; let input = t.function?.arguments ?? t.arguments ?? {};
      if (typeof input === "string") { try { input = JSON.parse(input); } catch { input = {}; } }
      if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
      const kind = name === "book_visit" ? "bookings" : name === "notify_owner" ? "leads" : null;
      const realCall = !!m?.call?.id, phone = e164(input.phone) || caller;
      // Vapi can re-deliver a tool call: the same call id plus tool call id returns the first result.
      // The claim is atomic, so a re-delivery that arrives while the first delivery is still running cannot run the tool twice.
      if (kind && realCall && t.id) {
        let seen;
        // A claim that cannot be read or written leaves the outcome unknown: answer this tool only, never the whole batch.
        try { seen = await atomicUpdate("index", toolKey(c, callId, t.id), (row) => row && (row.result || row.error || Date.now() - Date.parse(row.at || 0) < 120000) ? { result: row } : { value: { pending: true, at: new Date().toISOString() }, result: null }); }
        catch (err) { console.error("vapi tool claim", name, err); try { await logEvent(c, "vapi_tool_failed", { name, error: String(err?.message || err).slice(0, 200), saved: "", ownerAlert: "unknown", stage: "claim" }); } catch {} results.push({ toolCallId: t.id, error: uncertainResult(c, name, kind, null, false) }); continue; }
        if (seen?.result || seen?.error) { results.push({ toolCallId: t.id, ...(seen.result ? { result: seen.result } : { error: seen.error }) }); continue; }
        if (seen?.pending) { results.push({ toolCallId: t.id, error: "This same request is still being handled on this call. Do not repeat it, and do not say it was booked, saved or sent." }); continue; }
      }
      // A visit already saved on this call (including one whose confirmation failed) is not booked twice.
      // The call's booking slot is claimed atomically before book_visit runs, so a model retry under a new tool call id
      // cannot book a second visit after a run stopped between saving the visit and writing its result.
      let ownSlot = false;
      if (name === "book_visit" && realCall) {
        let slot;
        try {
          slot = await atomicUpdate("index", callBookingKey(c, callId), async (row) => {
            if (row?.id) return { result: { prior: row } };
            if (row?.pending && Date.parse(row.at ?? "") > Date.now() - 120000) return { result: { busy: true } };
            const found = row?.pending ? await bookedSince(c, row) : null;
            if (found) return { value: { id: found.id, phone: found.phone || "" }, result: { prior: { id: found.id } } };
            return { value: { pending: true, at: new Date().toISOString(), phone: phone || "", contact: caller || callId }, result: { own: true } };
          });
        } catch (err) {
          console.error("vapi booking slot", err);
          try { await logEvent(c, "vapi_tool_failed", { name, error: String(err?.message || err).slice(0, 200), saved: "", ownerAlert: "unknown", stage: "booking_slot" }); } catch {}
          slot = { failed: uncertainResult(c, name, kind, null, false) };
        }
        const held = slot.failed || (slot.busy ? BOOKING_UNCONFIRMED : "");
        if (held) {
          results.push({ toolCallId: t.id, error: held });
          if (t.id) { try { await put("index", toolKey(c, callId, t.id), { error: held, at: new Date().toISOString() }); } catch {} }
          continue;
        }
        ownSlot = !!slot.own;
        const prior = slot.prior;
        if (prior?.id) {
          const steer = `A visit was already saved on this call, reference ${prior.id}. Do not book another. If the caller wants a different day or time for that visit, save the change with notify_owner, reason "question", naming reference ${prior.id}, and say the visit stays as booked until the shop confirms the change.`;
          results.push({ toolCallId: t.id, result: steer });
          if (t.id) { try { await put("index", toolKey(c, callId, t.id), { result: steer, at: new Date().toISOString() }); } catch {} }
          continue;
        }
      }
      // Same-day and emergency requests are never downgraded: they keep reason lead and stay in the owner's needs-action list.
      if (name === "notify_owner" && realCall && (input.reason || "lead") === "lead" && !["emergency", "today"].includes(input.urgency)) {
        const prior = await get("index", callBookingKey(c, callId));
        if (prior?.id && prior.phone && prior.phone === phone) input = { ...input, reason: "question", issue: `Same caller as visit ref ${prior.id} booked on this call: ${input.issue || ""}`.slice(0, 500) };
      }
      let before = new Set();
      if (kind && phone) { try { before = new Set((await recordsFor(kind, c, phone)).map((r) => r.id)); } catch {} }
      try {
        if (name === "get_availability") { const r = await availabilityToolResult(c, input); results.push({ toolCallId: t.id, ...(r.is_error ? { error: r.content } : { result: r.content }) }); }
        else if (name === "book_visit") { const b = await bookVisit(c, { ...input, phone: e164(input.phone) || caller }, { channel: "call", contact: caller || callId }); if (b.full) { results.push({ toolCallId: t.id, result: b.message }); if (realCall && t.id) { try { await del("index", toolKey(c, callId, t.id)); } catch {} } if (ownSlot) { try { await del("index", callBookingKey(c, callId)); } catch {} } continue; } results.push({ toolCallId: t.id, result: `Booked, reference ${b.id}. ${deliveryNote(c, b)}` }); }
        else if (name === "notify_owner") { const l = await flagLead(c, { ...input, phone: e164(input.phone) || caller }, { channel: "call", contact: caller || callId }); results.push({ toolCallId: t.id, result: l.status === "spam" ? "Noted as spam; the owner was not alerted." : `Request saved, reference ${l.id}. ${deliveryNote(c, l)}` }); }
        else results.push({ toolCallId: t.id, error: "Unknown tool." });
      } catch (err) {
        console.error("vapi tool", name, err);
        const rec = kind ? await savedSince(c, kind, phone, before) : null;
        const alerted = rec ? await recoveryAlert(c, kind, rec) : false;
        try { await logEvent(c, "vapi_tool_failed", { name, error: String(err?.message || err).slice(0, 200), saved: rec ? rec.id : "", ownerAlert: rec ? (alerted ? "sent" : "failed") : "unknown" }); } catch {}
        const text = kind ? uncertainResult(c, name, kind, rec, alerted) : "This could not be confirmed. Do not say anything was booked, saved or sent, and do not promise a callback.";
        if (kind && realCall && t.id) { try { await put("index", toolKey(c, callId, t.id), { ...(rec ? { result: text } : { error: text }), at: new Date().toISOString() }); if (rec && kind === "bookings") await put("index", callBookingKey(c, callId), { id: rec.id, phone: rec.phone || "" }); } catch {} }
        results.push({ toolCallId: t.id, ...(rec ? { result: text } : { error: text }) });
        continue;
      }
      // A completed booking or request is remembered for this call so a re-delivery or repeat does not duplicate it.
      const last = results[results.length - 1];
      if (kind && realCall && t.id && last?.toolCallId === t.id && last.result) {
        try { await put("index", toolKey(c, callId, t.id), { result: last.result, at: new Date().toISOString() }); } catch {}
        const ref = name === "book_visit" && /reference ([a-f0-9]+)/.exec(last.result);
        if (ref) { try { await put("index", callBookingKey(c, callId), { id: ref[1], phone: phone || "" }); } catch {} }
      }
    }
    return json({ results });
  }

  if (m.type === "end-of-call-report") {
    const transcript = m?.artifact?.transcript || "";
    const msgs = (m?.artifact?.messages || []).filter((x) => x.role === "user" || x.role === "bot" || x.role === "assistant").map((x) => ({ role: x.role === "user" ? "user" : "assistant", content: String(x.message || x.content || "").slice(0, 1500), at: new Date().toISOString() }));
    const conv = await getConversation(c, "call", caller || callId);
    conv.messages.push(...(msgs.length ? msgs : [{ role: "assistant", content: transcript.slice(0, 4000), at: new Date().toISOString() }]));
    conv.summary = m?.analysis?.summary || "";
    conv.endedReason = m.endedReason;
    await saveConversation(conv);
    const seconds = m.startedAt && m.endedAt ? Math.max(0, Math.round((new Date(m.endedAt) - new Date(m.startedAt)) / 1000)) : null;
    await logEvent(c, "call_ended", { from: caller, reason: m.endedReason, seconds }); await noteInbound(c, "call");
    if (isVoiceFailure(m.endedReason)) await logEvent(c, "voice_failed", { from: caller, reason: m.endedReason });
    try { await addUsage(c, { minutes: seconds ? Math.ceil(seconds / 60) : 0, calls: 1 }); } catch (err) { console.error("usage", err); }
    if (/transfer/i.test(String(m.endedReason || ""))) await logEvent(c, "transferred", { from: caller });
    // A call that produced neither a booking nor a lead still deserves an owner note when we know the number.
    if (caller) {
      const recent = (await recordsFor("leads", c, caller)).concat(await recordsFor("bookings", c, caller)).filter((r) => r.phone === caller && Date.now() - new Date(r.createdAt).getTime() < 15 * 60 * 1000);
      if (!recent.length && conv.summary) await flagLead(c, { customer_name: "", phone: caller, address: "", issue: conv.summary.slice(0, 200), reason: "question", urgency: "flexible", wanted: "", language: "en", unsure: "" }, { channel: "call", contact: caller });
    }
    return json({ ok: true });
  }
  return json({ ok: true });
};
