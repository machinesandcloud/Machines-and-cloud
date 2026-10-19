// Steve's admin API (ADMIN_KEY env, header x-admin-key). GET lists clients. POST with a slug:
// update the fields owners cannot touch (number, voice destination, status, plan, billing), delete a
// client and everything under it, or the verification hooks the PM uses: prompt, tasks, records,
// run_scheduler, digest, nudge_task.
import { getClient, saveClient, indexClient, list, get, del, put, listJSON, logEvent } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";
import { e164, notifyOwner, sendEmail, notifySteve } from "./lib/send.mjs";
import { buildSystemPrompt, STATUSES } from "./lib/config.mjs";
import { voicePrompt, releaseVoice } from "./lib/vapi.mjs";
import { upcomingBookings, dailyDigest } from "./lib/desk.mjs";
import { run as runScheduler } from "./scheduler.mjs";
import { releaseNumber, twilioEnabled } from "./lib/twilio.mjs";

export const config = { path: "/api/admin" };

export default async (req) => {
  const key = process.env.ADMIN_KEY;
  if (!key) return json({ error: "admin_not_configured" }, 503);
  if (req.headers.get("x-admin-key") !== key) return json({ error: "forbidden" }, 403);
  if (req.method === "GET") {
    const slugs = await list("clients", "");
    const out = [];
    for (const sl of slugs) { const c = await getClient(sl); if (c) out.push({ slug: c.slug, name: c.business?.name, status: c.status, plan: c.plan, owner: c.owner, phone: c.phone, build: c.build?.status, provision: c.provision?.status, createdAt: c.createdAt, portal: `${process.env.URL}/desk?c=${c.slug}&k=${c.ownerKey}` }); }
    return json({ clients: out });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (b.action === "run_scheduler") return json(await runScheduler({ forceHour: b.force_hour !== undefined ? Number(b.force_hour) : undefined }));
  const c = await getClient(b.slug || "");
  if (!c) return json({ error: "not_found" }, 404);

  if (b.action === "prompt") {
    const channel = ["web", "sms", "voice", "test"].includes(b.channel) ? b.channel : "web";
    if (channel === "voice") return json({ prompt: voicePrompt(c) });
    const bookings = channel === "sms" && b.contact ? await upcomingBookings(c, e164(b.contact)) : [];
    return json({ prompt: buildSystemPrompt(c, channel, { bookings }) });
  }
  if (b.action === "tasks") {
    const keys = await list("tasks", "");
    const tasks = [];
    for (const k of keys) { const t = await get("tasks", k); if (t?.slug === c.slug) tasks.push({ key: k, type: t.type, dueAt: t.dueAt, data: t.data, id: t.id }); }
    return json({ tasks });
  }
  if (b.action === "nudge_task") {
    // Move one task (by id) or all of the slug's tasks into the past so run_scheduler picks them up.
    const keys = await list("tasks", "");
    let n = 0;
    for (const k of keys) { const t = await get("tasks", k); if (t?.slug === c.slug && (!b.id || t.id === b.id)) { await del("tasks", k); const due = new Date(Date.now() - 60000).toISOString(); t.dueAt = due; await put("tasks", `${due}_${t.id}`, t); n++; } }
    return json({ ok: true, nudged: n });
  }
  if (b.action === "records") {
    const kind = ["bookings", "leads", "alerts", "conversations", "events"].includes(b.kind) ? b.kind : "events";
    if (b.kind === "optouts") { const keys = await list("optouts", ""); const out = []; for (const k of keys) out.push({ key: k, phone: k, ...(await get("optouts", k)) }); return json({ records: out.filter((o) => !o.slug || o.slug === c.slug) }); }
    return json({ records: await listJSON(kind, c.slug + "/", 500) });
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
    for (const kind of ["bookings", "leads", "alerts", "conversations", "events"]) for (const k of await list(kind, c.slug + "/")) await del(kind, k);
    for (const k of await list("tasks", "")) { const t = await get("tasks", k); if (t?.slug === c.slug) await del("tasks", k); }
    for (const k of await list("optouts", "")) { const o = await get("optouts", k); if (o?.slug === c.slug) await del("optouts", k); }
    for (const k of await list("index", "bridge:")) { const sl = await get("index", k); if (sl === c.slug) await del("index", k); }
    if (c.owner?.email) await del("index", "email:" + c.owner.email.toLowerCase());
    if (c.phone?.twilioNumber) await del("index", "number:" + c.phone.twilioNumber);
    if (c.voice?.assistantId) await del("index", "vapi:" + c.voice.assistantId);
    await del("health", "lastsend:" + c.slug);
    await del("clients", c.slug);
    return json({ ok: true, deleted: c.slug, released });
  }
  if (b.phone) {
    if (c.phone?.twilioNumber && b.phone.twilioNumber !== undefined && e164(b.phone.twilioNumber) !== c.phone.twilioNumber) await del("index", "number:" + c.phone.twilioNumber);
    c.phone = { ...c.phone, ...(b.phone.twilioNumber !== undefined ? { twilioNumber: e164(b.phone.twilioNumber) } : {}), ...(b.phone.twilioNumberSid !== undefined ? { twilioNumberSid: String(b.phone.twilioNumberSid) } : {}), ...(b.phone.voiceForwardTo !== undefined ? { voiceForwardTo: String(b.phone.voiceForwardTo).trim() } : {}), ...(b.phone.tenDlc ? { tenDlc: String(b.phone.tenDlc) } : {}), ...(b.phone.textBack !== undefined ? { textBack: !!b.phone.textBack } : {}) };
  }
  if (b.voice) c.voice = { ...c.voice, ...b.voice };
  if (b.status && STATUSES.includes(b.status)) c.status = b.status;
  if (b.plan && ["starter", "growth", "pro"].includes(b.plan)) c.plan = b.plan;
  if (b.billing) c.billing = { ...c.billing, ...b.billing };
  await saveClient(c); await indexClient(c);
  await logEvent(c.slug, "admin_update", { fields: Object.keys(b) });
  return json({ ok: true, client: { slug: c.slug, status: c.status, plan: c.plan, phone: c.phone, voice: c.voice, billing: c.billing } });
};
