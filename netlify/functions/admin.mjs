// Steve's admin API (ADMIN_KEY env, header x-admin-key). GET lists clients. POST with a slug:
// update the fields owners cannot touch (number, voice destination, status, plan, billing), delete a
// client and everything under it, or the verification hooks the PM uses: prompt, tasks, records,
// run_scheduler, digest, nudge_task.
import { getClient, saveClient, indexClient, list, get, del, put, listJSON, logEvent } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";
import { e164, notifyOwner, sendEmail, notifySteve } from "./lib/send.mjs";
import { buildSystemPrompt, STATUSES } from "./lib/config.mjs";
import { voicePrompt, releaseVoice } from "./lib/vapi.mjs";
import { upcomingBookings, dailyDigest, weeklyReport, monthlyReport, lineHealth } from "./lib/desk.mjs";
import { getUsage, usageView } from "./lib/usage.mjs";
import { run as runScheduler } from "./scheduler.mjs";
import { releaseNumber, twilioEnabled } from "./lib/twilio.mjs";

export const config = { path: "/api/admin" };

export default async (req) => {
  const key = process.env.ADMIN_KEY;
  if (!key) return json({ error: "admin_not_configured" }, 503);
  if (req.headers.get("x-admin-key") !== key) return json({ error: "forbidden" }, 403);
  if (req.method === "GET") {
    const url = new URL(req.url);
    const full = url.searchParams.get("full") === "1";
    const slugs = await list("clients", "");
    const out = []; const stream = [];
    for (const sl of slugs) {
      const c = await getClient(sl); if (!c) continue;
      const row = { slug: c.slug, name: c.business?.name, status: c.status, plan: c.plan, owner: c.owner, phone: c.phone, build: c.build?.status, provision: c.provision?.status, createdAt: c.createdAt, liveAt: c.liveAt || null, portal: `${process.env.URL}/desk?c=${c.slug}&k=${c.ownerKey}`, policy: `${process.env.URL}/policy?c=${c.slug}` };
      if (full) {
        const [events, alerts, leads, convs, usage] = await Promise.all([listJSON("events", c.slug + "/", 400), listJSON("alerts", c.slug + "/", 100), listJSON("leads", c.slug + "/", 200), listJSON("conversations", c.slug + "/", 100), getUsage(c.slug)]);
        const h = lineHealth(c, events);
        row.health = h; row.usage = usageView(c, usage);
        row.waitingAlerts = alerts.filter((a) => a.status === "waiting").length;
        row.openFlags = convs.filter((v) => v.flag).length;
        row.pendingCallbacks = leads.filter((l) => l.status === "open" && l.callbackDueAt && !l.calledAt).length;
        row.overdueCallbacks = leads.filter((l) => l.status === "open" && l.overdueAt && !l.calledAt).length;
        row.lastInbound = [h.lastInboundCall, h.lastInboundText].filter(Boolean).sort().pop() || null;
        row.leads = { angiKey: c.leads?.angiKey || "", thumbtackSecret: c.leads?.thumbtackSecret || "" };
        const dayMs = 86400000;
        row.autoFlags7d = events.filter((e) => e.type === "auto_flag" && Date.now() - new Date(e.at).getTime() < 7 * dayMs).length;
        row.healthAlerts7d = events.filter((e) => e.type === "health_alert" && Date.now() - new Date(e.at).getTime() < 7 * dayMs).map((e) => e.data?.reason);
        row.overdueOld = leads.filter((l) => l.status === "open" && l.overdueAt && !l.calledAt && Date.now() - new Date(l.overdueAt).getTime() > dayMs).length;
        row.testingDays = c.status === "testing" && c.build?.builtAt ? Math.floor((Date.now() - new Date(c.build.builtAt).getTime()) / dayMs) : 0;
        row.forwardingUnverifiedDays = c.phone?.twilioNumber && c.phone?.forwarding !== "none" && !c.phone?.forwardingVerified && c.provision?.startedAt ? Math.floor((Date.now() - new Date(c.provision.startedAt).getTime()) / dayMs) : 0;
        row.spanishReviewPending = !!c.business?.spanish && !process.env.SPANISH_REVIEWED_ON;
        row.lifecycle = c.lifecycle || {};
        for (const e of events) if (Date.now() - new Date(e.at).getTime() < 86400000) stream.push({ slug: c.slug, name: c.business?.name, at: e.at, type: e.type, data: e.data });
      }
      out.push(row);
    }
    stream.sort((a, b) => b.at.localeCompare(a.at));
    return json({ clients: out, ...(full ? { events: stream.slice(0, 300) } : {}) });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (b.action === "run_scheduler") return json(await runScheduler({ forceHour: b.force_hour !== undefined ? Number(b.force_hour) : undefined, forceDay: b.force_day ? String(b.force_day) : undefined }));
  if (b.action === "ratelimit_reset") { const ip = String(b.ip || "").trim(); if (!ip) return json({ error: "missing_ip" }, 400); let n = 0; for (const k of await list("ratelimit", ip + "/")) { await del("ratelimit", k); n++; } return json({ ok: true, cleared: n }); }
  const c = await getClient(b.slug || "");
  if (!c) return json({ error: "not_found" }, 404);

  if (b.action === "prompt") {
    const channel = ["web", "sms", "voice", "test"].includes(b.channel) ? b.channel : "web";
    if (channel === "voice") return json({ prompt: voicePrompt(c) });
    const bookings = channel === "sms" && b.contact ? await upcomingBookings(c, e164(b.contact)) : [];
    return json({ prompt: buildSystemPrompt(c, channel, { bookings, at: b.at || undefined }) });
  }
  if (b.action === "tasks") {
    const keys = await list("tasks", "");
    const tasks = [];
    for (const k of keys) { const t = await get("tasks", k); if (t?.slug === c.slug) tasks.push({ key: k, type: t.type, dueAt: t.dueAt, data: t.data, id: t.id }); }
    return json({ tasks });
  }
  if (b.action === "put_conversation") {
    const { getConversation, saveConversation } = await import("./lib/store.mjs");
    const conv = await getConversation(c.slug, String(b.channel || "sms"), String(b.contact || "test"));
    conv.messages = (b.messages || []).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content || "").slice(0, 1500), at: m.at || new Date().toISOString() }));
    conv.autoFlag = null; await saveConversation(conv);
    return json({ ok: true, messages: conv.messages.length });
  }
  if (b.action === "autoflag") { const { autoFlagDay } = await import("./lib/desk.mjs"); const r = await autoFlagDay(c, !!b.debug); return json({ ok: true, ...(b.debug ? r : { flagged: r }) }); }
  if (b.action === "day7") { const { day7Draft } = await import("./lib/desk.mjs"); return json({ ok: true, draft: await day7Draft(c) }); }
  if (b.action === "log_event") { const ev = await logEvent(c.slug, String(b.type || "note"), b.data || {}); return json({ ok: true, event: ev }); }
  if (b.action === "schedule_task") {
    const { scheduleTask } = await import("./lib/store.mjs");
    const t = await scheduleTask(c.slug, new Date(Date.now() - 60000), String(b.type || ""), b.data || {});
    return json({ ok: true, task: t });
  }
  if (b.action === "nudge_task") {
    // Move one task (by id) or all of the slug's tasks into the past so run_scheduler picks them up.
    const keys = await list("tasks", "");
    let n = 0;
    for (const k of keys) { const t = await get("tasks", k); if (t?.slug === c.slug && (!b.id || t.id === b.id)) { await del("tasks", k); const due = new Date(Date.now() - 60000).toISOString(); t.dueAt = due; await put("tasks", `${due}_${t.id}`, t); n++; } }
    return json({ ok: true, nudged: n });
  }
  if (b.action === "records") {
    const kind = ["bookings", "leads", "alerts", "conversations", "events", "usage", "customers"].includes(b.kind) ? b.kind : "events";
    if (b.kind === "optouts") { const keys = await list("optouts", ""); const out = []; for (const k of keys) out.push({ key: k, phone: k, ...(await get("optouts", k)) }); return json({ records: out.filter((o) => !o.slug || o.slug === c.slug) }); }
    return json({ records: await listJSON(kind, c.slug + "/", 500) });
  }
  if (b.action === "monthly") {
    const mth = await monthlyReport(c, b.month);
    if (b.send) { await sendEmail({ to: c.owner.email, subject: mth.subject, text: mth.text }); await notifySteve(`Statement: ${c.business.name} (${mth.month})`, `${mth.text}\n\n${mth.invoice}`); await logEvent(c.slug, "monthly", { month: mth.month, stats: mth.stats }); }
    return json({ ok: true, ...mth });
  }
  if (b.action === "weekly") {
    const w = await weeklyReport(c);
    if (b.send) { await sendEmail({ to: c.owner.email, subject: w.subject, text: w.text }); await logEvent(c.slug, "weekly", { empty: !!w.empty, stats: w.stats || null }); }
    return json({ ok: true, ...w });
  }
  if (b.action === "digest") {
    const d = await dailyDigest(c);
    if (b.send) { await notifyOwner(c, d.text, { type: "digest" }); await sendEmail({ to: c.owner.email, subject: `${c.business.name}: today's front desk`, text: d.email }); await logEvent(c.slug, "digest", { text: d.text }); }
    return json({ ok: true, ...d });
  }
  if (b.action === "delete") {
    const released = {};
    try { if (twilioEnabled() && c.phone?.twilioNumberSid) released.number = await releaseNumber(c.phone.twilioNumberSid, c.phone.messagingServiceSid); } catch (e) { released.numberError = String(e.message); }
    try { if (c.voice?.assistantId) released.voice = await releaseVoice(c); } catch (e) { released.voiceError = String(e.message); }
    for (const kind of ["bookings", "leads", "alerts", "conversations", "events", "usage", "customers"]) for (const k of await list(kind, c.slug + "/")) await del(kind, k);
    for (const k of await list("tasks", "")) { const t = await get("tasks", k); if (t?.slug === c.slug) await del("tasks", k); }
    for (const k of await list("optouts", "")) { const o = await get("optouts", k); if (o?.slug === c.slug) await del("optouts", k); }
    for (const k of await list("index", "bridge:")) { const sl = await get("index", k); if (sl === c.slug) await del("index", k); }
    if (c.owner?.email) await del("index", "email:" + c.owner.email.toLowerCase());
    if (c.phone?.twilioNumber) await del("index", "number:" + c.phone.twilioNumber);
    if (c.voice?.assistantId) await del("index", "vapi:" + c.voice.assistantId);
    await del("health", "lastsend:" + c.slug);
    for (const k of await list("health", "alert:" + c.slug + ":")) await del("health", k);
    await del("clients", c.slug);
    return json({ ok: true, deleted: c.slug, released });
  }
  if (b.action === "pause" || b.action === "resume") {
    const { detachVoice, attachVoice } = await import("./lib/vapi.mjs");
    const site = process.env.URL || new URL(req.url).origin;
    if (b.action === "pause") { if (!["testing", "live"].includes(c.status)) return json({ error: "not_active" }, 400); c.pausedFrom = c.status; c.status = "paused"; c.pausedAt = new Date().toISOString(); await saveClient(c); await logEvent(c.slug, "paused", { by: "admin" }); try { await detachVoice(c, site); await saveClient(c); } catch (e) { console.error(e); } }
    else { if (c.status !== "paused") return json({ error: "not_paused" }, 400); c.status = "live"; c.pausedAt = null; c.liveAt = c.liveAt || new Date().toISOString(); await saveClient(c); await logEvent(c.slug, "resumed", { by: "admin" }); try { await attachVoice(c, site); await saveClient(c); } catch (e) { console.error(e); } }
    return json({ ok: true, status: c.status });
  }
  if (b.action === "clear_optout") { const n = e164(b.phone || ""); if (!n) return json({ error: "missing_phone" }, 400); await del("optouts", n); return json({ ok: true, cleared: n }); }
  if (b.action) return json({ error: "unknown_action", action: String(b.action) }, 400);
  if (b.phone) {
    if (c.phone?.twilioNumber && b.phone.twilioNumber !== undefined && e164(b.phone.twilioNumber) !== c.phone.twilioNumber) await del("index", "number:" + c.phone.twilioNumber);
    c.phone = { ...c.phone, ...(b.phone.twilioNumber !== undefined ? { twilioNumber: e164(b.phone.twilioNumber) } : {}), ...(b.phone.twilioNumberSid !== undefined ? { twilioNumberSid: String(b.phone.twilioNumberSid) } : {}), ...(b.phone.voiceForwardTo !== undefined ? { voiceForwardTo: String(b.phone.voiceForwardTo).trim() } : {}), ...(b.phone.tenDlc ? { tenDlc: String(b.phone.tenDlc) } : {}), ...(b.phone.textBack !== undefined ? { textBack: !!b.phone.textBack } : {}), ...(b.phone.forwardingVerified !== undefined ? { forwardingVerified: !!b.phone.forwardingVerified } : {}), ...(b.phone.firstCallAt !== undefined ? { firstCallAt: b.phone.firstCallAt } : {}) };
  }
  if (b.voice) c.voice = { ...c.voice, ...b.voice };
  if (b.status && STATUSES.includes(b.status)) c.status = b.status;
  if (b.plan && ["starter", "growth", "pro"].includes(b.plan)) c.plan = b.plan;
  if (b.billing) c.billing = { ...c.billing, ...b.billing };
  if (b.leads) c.leads = { ...(c.leads || {}), ...(b.leads.angiKey !== undefined ? { angiKey: String(b.leads.angiKey) } : {}), ...(b.leads.thumbtackSecret !== undefined ? { thumbtackSecret: String(b.leads.thumbtackSecret) } : {}) };
  if (b.serviceEndsAt !== undefined) c.serviceEndsAt = b.serviceEndsAt ? new Date(b.serviceEndsAt).toISOString() : null;
  if (b.builtAt !== undefined) c.build = { ...(c.build || {}), builtAt: b.builtAt };
  if (b.provisionStartedAt !== undefined) c.provision = { ...(c.provision || {}), startedAt: b.provisionStartedAt };
  if (b.nextMonthNote !== undefined) c.nextMonthNote = String(b.nextMonthNote).slice(0, 300);
  if (b.liveAt !== undefined) c.liveAt = b.liveAt ? new Date(b.liveAt).toISOString() : null;
  await saveClient(c); await indexClient(c);
  await logEvent(c.slug, "admin_update", { fields: Object.keys(b) });
  return json({ ok: true, client: { slug: c.slug, status: c.status, plan: c.plan, phone: c.phone, voice: c.voice, billing: c.billing } });
};
