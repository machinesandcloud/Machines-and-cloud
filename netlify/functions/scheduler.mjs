// Runs every 10 minutes: sends whatever is due (reminders, review requests, quote checks, payment
// reminders, quiet-lead chases), runs alert escalations, polls texting registration, and sends the
// 6 pm Houston daily digest to every live shop.
import { dueTasks, del, getRecord, getClient, saveRecord, saveClient, logEvent, list } from "./lib/store.mjs";
import { sendSMS, sendEmail, notifyOwner, notifySteve, optedOut } from "./lib/send.mjs";
import { TEMPLATES, dailyDigest, runEscalation } from "./lib/desk.mjs";
import { PLANS, ACTIVE } from "./lib/config.mjs";
import { a2pEnabled, brandStatus, createCampaign, campaignStatus, releaseNumber, twilioEnabled } from "./lib/twilio.mjs";
import { releaseVoice } from "./lib/vapi.mjs";

export const config = { schedule: "*/10 * * * *" };

const D = 24 * 3600 * 1000;

async function runTask(t) {
  const c = await getClient(t.slug);
  if (!c) return "no client";
  if (!ACTIVE.includes(c.status)) { await logEvent(c.slug, "task_skipped", { type: t.type, reason: c.status }); return "skipped"; }
  if (t.type === "escalate") return runEscalation(c, t);
  const rec = t.data?.bookingId ? await getRecord("bookings", c.slug, t.data.bookingId) : t.data?.leadId ? await getRecord("leads", c.slug, t.data.leadId) : null;
  if (!rec || rec.status === "cancelled") return "no record";
  if (!rec.phone) return "no number";
  if (await optedOut(rec.phone)) return "opted out";
  const tpl = TEMPLATES[t.type];
  if (!tpl) return "no template";
  if (["reminder_24h", "reminder_1h"].includes(t.type) && !["booked", "confirmed", "on_the_way"].includes(rec.status)) return "booking not active";
  if (t.type === "lead_chase" && rec.status !== "open") return "lead closed";
  if (t.type === "quote_check" && rec.status !== "quoted") return "quote closed";
  if (t.type === "payment_reminder" && rec.status !== "done") return "paid or not done";
  const body = t.type === "lead_chase" ? tpl(c, rec, t.data.n) : tpl(c, rec);
  const r = await sendSMS({ to: rec.phone, client: c, type: t.type, body });
  await logEvent(c.slug, "task_sent", { type: t.type, id: rec.id, ok: r.ok, logged: !!r.logged });
  return r.ok ? "sent" : r.logged ? "logged" : "send failed";
}

export async function run({ forceHour } = {}) {
  const nowISO = new Date().toISOString();
  const due = await dueTasks(nowISO);
  const results = [];
  for (const { key, task } of due) {
    try { results.push([task.type, await runTask(task)]); }
    catch (err) { console.error("task failed", task.type, err); results.push([task.type, "error"]); try { await logEvent(task.slug, "task_error", { type: task.type, error: String(err?.message || err).slice(0, 200) }); } catch { /* ignore */ } }
    await del("tasks", key);
  }
  // Texting registration: move brands to campaigns and campaigns to approved.
  if (a2pEnabled()) {
    for (const slug of await list("clients", "")) {
      const c = await getClient(slug);
      if (!c?.phone?.brandSid || !["brand_pending", "campaign_pending"].includes(c.phone.tenDlc)) continue;
      try {
        if (c.phone.tenDlc === "brand_pending") {
          const st = await brandStatus(c.phone.brandSid);
          if (st === "APPROVED") { const camp = await createCampaign(c, c.phone.messagingServiceSid, c.phone.brandSid); Object.assign(c.phone, camp, { tenDlc: "campaign_pending", brandStatus: st }); }
          else if (st === "FAILED") { c.phone.tenDlc = "failed"; c.phone.brandStatus = st; await notifySteve(`10DLC brand failed: ${c.business.name}`, `Brand ${c.phone.brandSid} failed. Check the Twilio console.`); }
          else c.phone.brandStatus = st;
        } else {
          const st = await campaignStatus(c.phone.messagingServiceSid, c.phone.campaignSid);
          c.phone.campaignStatus = st;
          if (st === "VERIFIED") {
            c.phone.tenDlc = "approved";
            await logEvent(c.slug, "sender_switched", { to: "own" });
            await sendEmail({ to: c.owner.email, subject: `${c.business.name}: texting is live from your number`, text: `Carriers approved your business for texting. Your front desk now texts customers from ${c.phone.twilioNumber}: missed calls, confirmations, reminders, and follow-ups.` });
            if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: `${c.business.name}: texting is approved. Your front desk now texts customers from your own number.` });
          } else if (st === "FAILED") { c.phone.tenDlc = "failed"; await notifySteve(`10DLC campaign failed: ${c.business.name}`, `Campaign ${c.phone.campaignSid} failed. Check the Twilio console.`); }
        }
        await saveClient(c);
      } catch (err) { console.error("10dlc poll", slug, err); }
    }
  }
  // Cancelled shops whose 30-day window has ended: release the number and the assistant, and stop routing.
  let released = 0;
  for (const slug of await list("clients", "")) {
    const c = await getClient(slug);
    if (!c || c.status !== "cancelled" || !c.serviceEndsAt || new Date(c.serviceEndsAt).getTime() > Date.now()) continue;
    if (!c.phone?.twilioNumber && !c.phone?.twilioNumberSid && !c.voice?.assistantId) continue;
    try {
      const out = { number: c.phone?.twilioNumber || null, sid: c.phone?.twilioNumberSid || null };
      let skipped = false;
      if (twilioEnabled() && c.phone?.twilioNumberSid) { try { out.twilio = await releaseNumber(c.phone.twilioNumberSid, c.phone.messagingServiceSid); } catch (e) { out.twilioError = String(e.message).slice(0, 200); } } else skipped = true;
      if (c.voice?.assistantId) { try { out.voice = await releaseVoice(c); if (out.voice?.skipped) skipped = true; } catch (e) { out.voiceError = String(e.message).slice(0, 200); } }
      if (c.phone?.twilioNumber) await del("index", "number:" + c.phone.twilioNumber);
      if (c.voice?.assistantId) await del("index", "vapi:" + c.voice.assistantId);
      c.phone = { ...c.phone, releasedNumber: c.phone.twilioNumber || "", twilioNumber: "", twilioNumberSid: "", messagingServiceSid: "" };
      c.voice = { provider: "none", released: c.voice?.assistantId || "" };
      c.releasedAt = new Date().toISOString();
      await saveClient(c);
      await logEvent(c.slug, skipped ? "number_release_skipped" : "number_released", out);
      await notifySteve(`${skipped ? "Number release skipped (no keys)" : "Number released"}: ${c.business?.name}`, `${c.slug}: ${JSON.stringify(out)}\nCancelled ${c.cancelledAt}, window ended ${c.serviceEndsAt}.`);
      released++;
    } catch (err) { console.error("release", slug, err); }
  }
  // 6 pm Houston: daily digest to every live shop; Steve gets a copy for the first 7 days.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
  const hour = forceHour ?? Number(parts.find((p) => p.type === "hour")?.value);
  const minute = forceHour !== undefined ? 0 : Number(parts.find((p) => p.type === "minute")?.value);
  let digests = 0;
  if (hour === 18 && minute < 10) {
    for (const slug of await list("clients", "")) {
      const c = await getClient(slug);
      if (!c || c.status !== "live") continue;
      try {
        const d = await dailyDigest(c);
        // Quiet days go by email only; the owner can turn the daily text off altogether.
        const text = !d.empty && c.digest?.text !== false && c.owner.phone;
        if (text) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "digest", body: d.text });
        await sendEmail({ to: c.owner.email, subject: `${c.business.name}: today's front desk`, text: d.email });
        if (c.liveAt && Date.now() - new Date(c.liveAt).getTime() < 7 * D) await notifySteve(`Digest: ${c.business.name}`, d.email);
        await logEvent(c.slug, "digest", { text: d.text, empty: !!d.empty, texted: !!text });
        digests++;
      } catch (err) { console.error("digest", slug, err); }
    }
  }
  console.log(`scheduler: ${due.length} due`, results, `digests ${digests}`, `released ${released}`);
  return { due: due.length, results, digests, released };
}

export default async () => {
  const out = await run();
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
};
