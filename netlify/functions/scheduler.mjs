// Runs every 10 minutes: sends whatever is due (reminders, review requests, quote checks,
// payment reminders, quiet-lead chases) and a Monday digest.
import { dueTasks, del, getRecord, getClient, saveRecord, scheduleTask, logEvent, list } from "./lib/store.mjs";
import { sendSMS, notifyOwner } from "./lib/send.mjs";
import { TEMPLATES, weeklyDigest } from "./lib/desk.mjs";
import { PLANS } from "./lib/config.mjs";

export const config = { schedule: "*/10 * * * *" };

const D = 24 * 3600 * 1000;

async function runTask(t) {
  const c = await getClient(t.slug);
  if (!c || !["testing", "live"].includes(c.status)) return "skipped";
  const from = c.phone?.twilioNumber;
  const rec = t.data?.bookingId ? await getRecord("bookings", c.slug, t.data.bookingId) : t.data?.leadId ? await getRecord("leads", c.slug, t.data.leadId) : null;
  if (!rec || rec.status === "cancelled") return "no record";
  if (!from || !rec.phone) return "no number";
  const tpl = TEMPLATES[t.type];
  if (!tpl) return "no template";
  if (["reminder_24h", "reminder_1h"].includes(t.type) && !["booked", "on_the_way"].includes(rec.status)) return "booking not active";
  if (t.type === "lead_chase" && rec.status !== "open") return "lead closed";
  if (t.type === "quote_check" && rec.status !== "quoted") return "quote closed";
  if (t.type === "payment_reminder" && rec.status !== "done") return "paid or not done";
  const body = t.type === "lead_chase" ? tpl(c, rec, t.data.n) : tpl(c, rec);
  const r = await sendSMS({ to: rec.phone, from, body });
  await logEvent(c.slug, "task_sent", { type: t.type, id: rec.id, ok: r.ok });
  // Payment reminders are scheduled when a job is marked done: day 3 and day 7.
  if (t.type === "review_request" && PLANS[c.plan]?.followUp && rec.status === "done" && !rec.paymentRemindersScheduled) {
    const done = new Date(rec.doneAt || rec.updatedAt || Date.now()).getTime();
    await scheduleTask(c.slug, new Date(done + 3 * D), "payment_reminder", { bookingId: rec.id });
    await scheduleTask(c.slug, new Date(done + 7 * D), "payment_reminder", { bookingId: rec.id });
    rec.paymentRemindersScheduled = true; await saveRecord("bookings", rec);
  }
  return r.ok ? "sent" : "send failed";
}

export default async () => {
  const nowISO = new Date().toISOString();
  const due = await dueTasks(nowISO);
  const results = [];
  for (const { key, task } of due) {
    try { results.push([task.type, await runTask(task)]); }
    catch (err) { console.error("task failed", task.type, err); results.push([task.type, "error"]); }
    await del("tasks", key);
  }
  // Monday 13:00 UTC (8 am Houston): weekly digest for Pro clients and a summary to Steve.
  const now = new Date();
  if (now.getUTCDay() === 1 && now.getUTCHours() === 13 && now.getUTCMinutes() < 10) {
    const slugs = await list("clients", "");
    for (const slug of slugs) {
      const c = await getClient(slug);
      if (!c || c.status !== "live") continue;
      const text = await weeklyDigest(c);
      if (PLANS[c.plan]?.name === "Pro") await notifyOwner(c, text);
      await logEvent(c.slug, "digest", { text });
    }
  }
  console.log(`scheduler: ${due.length} due`, results);
  return new Response(JSON.stringify({ due: due.length, results }), { headers: { "Content-Type": "application/json" } });
};
