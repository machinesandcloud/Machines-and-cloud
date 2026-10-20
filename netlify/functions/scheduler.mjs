// Runs every 10 minutes: sends whatever is due (reminders, review requests, quote checks, payment
// reminders, quiet-lead chases), runs alert escalations, polls texting registration, and sends the
// 6 pm Houston daily digest to every live shop.
import { dueTasks, del, getRecord, getClient, saveRecord, saveClient, logEvent, list, getConversation, saveConversation, get, put, listRecords } from "./lib/store.mjs";
import { sendSMS, sendEmail, notifyOwner, notifySteve, optedOut } from "./lib/send.mjs";
import { template, dailyDigest, runEscalation, runCallbackCheck, runVisitCheck, runConsentAsk, getCustomer, weeklyReport } from "./lib/desk.mjs";
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
  if (t.type === "callback_check") return runCallbackCheck(c, t);
  if (t.type === "visit_check") return runVisitCheck(c, t);
  if (t.type === "consent_ask") return runConsentAsk(c, t);
  const rec = t.data?.bookingId ? await getRecord("bookings", c.slug, t.data.bookingId) : t.data?.leadId ? await getRecord("leads", c.slug, t.data.leadId) : null;
  if (!rec || rec.status === "cancelled") return "no record";
  if (!rec.phone) return "no number";
  if (await optedOut(rec.phone)) return "opted out";
  const tpl = template(t.type, rec);
  if (!tpl) return "no template";
  if (["reminder_24h", "reminder_1h"].includes(t.type) && !["booked", "confirmed", "on_the_way"].includes(rec.status)) return "booking not active";
  if (t.type === "lead_chase" && rec.status !== "open") return "lead closed";
  if (t.type === "quote_check" && rec.status !== "quoted") return "quote closed";
  if (t.type === "payment_reminder" && (rec.status !== "done" || !rec.invoicedAt)) return "paid or not invoiced";
  if (t.type === "review_nudge" && rec.reviewReply) return "already replied";
  if (t.type === "referral_ask" && rec.reviewReply?.sentiment !== "positive") return "no positive reply";
  if (t.type === "maintenance_reminder" && !(await getCustomer(c.slug, rec.phone)).marketingConsent) return "no marketing consent";
  const body = t.type === "lead_chase" ? tpl(c, rec, t.data.n) : tpl(c, rec);
  const r = await sendSMS({ to: rec.phone, client: c, type: t.type, body });
  if (r.ok || r.logged) {
    // The front desk should know what it sent when the customer replies to it.
    const conv = await getConversation(c.slug, "sms", rec.phone);
    conv.messages.push({ role: "assistant", content: body, at: new Date().toISOString(), system: t.type });
    await saveConversation(conv);
    if (t.type === "review_request") { rec.reviewAskedAt = new Date().toISOString(); await saveRecord("bookings", rec); }
  }
  await logEvent(c.slug, "task_sent", { type: t.type, id: rec.id, ok: r.ok, logged: !!r.logged });
  return r.ok ? "sent" : r.logged ? "logged" : "send failed";
}

// Business days between two instants (Houston), counting Monday to Friday only.
function businessDaysSince(iso) {
  const day = (d) => new Date(d.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  let t = day(new Date(iso)); const now = day(new Date()); let n = 0;
  t.setHours(0, 0, 0, 0); now.setHours(0, 0, 0, 0);
  while (t < now) { t.setDate(t.getDate() + 1); if (t.getDay() !== 0 && t.getDay() !== 6) n++; }
  return n;
}
async function alertOnce(c, reason, hours, subject, text) {
  const k = `alert:${c.slug}:${reason}`;
  const last = await get("health", k);
  if (last && Date.now() - new Date(last.at).getTime() < hours * 3600 * 1000) return false;
  await put("health", k, { at: new Date().toISOString() });
  await notifySteve(subject, `${text}\n${process.env.URL || ""}/desk?c=${c.slug}&k=${c.ownerKey}`);
  await logEvent(c.slug, "health_alert", { reason });
  return true;
}
async function healthAlerts(c) {
  const events = await listRecords("events", c.slug, 400);
  const since = (ms) => events.filter((e) => Date.now() - new Date(e.at).getTime() < ms);
  let n = 0;
  const failed = since(3600 * 1000).filter((e) => e.type === "sms_failed");
  if (failed.length >= 3 && (await alertOnce(c, "sms_failures", 1, `Texts failing: ${c.business.name}`, `${failed.length} texts failed in the last hour. Last error: ${failed[failed.length - 1].data?.message || failed[failed.length - 1].data?.code || "-"}.`))) n++;
  const voice = since(15 * 60 * 1000).filter((e) => ["vapi_tool_failed", "assistant_request_failed", "voice_attach_failed", "voice_detach_failed"].includes(e.type));
  if (voice.length && (await alertOnce(c, "voice_failures", 1, `Voice failing: ${c.business.name}`, `${voice.length} voice failure(s) in the last 15 minutes: ${voice.map((e) => e.type + " " + (e.data?.error || e.data?.name || "")).join("; ").slice(0, 400)}.`))) n++;
  if (c.status === "live" && c.phone?.forwardingVerified && c.phone?.forwarding !== "none") {
    const inbound = events.filter((e) => ["missed_call", "call_ended", "call_started", "call_forwarded", "sms_inbound"].includes(e.type)).map((e) => e.at).sort().pop() || c.liveAt || c.phone.firstCallAt;
    if (inbound && businessDaysSince(inbound) >= 5 && (await alertOnce(c, "no_inbound", 5 * 24, `Line silent: ${c.business.name}`, `No call or text has reached the front desk for ${businessDaysSince(inbound)} business days (last at ${inbound}). Forwarding may have dropped: ask the owner to dial *#61# and check Live Voicemail, then call the business number from another phone.`))) n++;
  }
  return n;
}

export async function run({ forceHour, forceDay } = {}) {
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
  // Health alerts to Steve: SMS failure spikes, voice failures, and a live line that has gone silent.
  let alerts = 0;
  for (const slug of await list("clients", "")) {
    const c = await getClient(slug);
    if (!c || !["testing", "live"].includes(c.status)) continue;
    try { alerts += await healthAlerts(c); } catch (err) { console.error("health", slug, err); }
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
  const day = forceDay || new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(new Date());
  let digests = 0, weeklies = 0;
  // Monday 8 am Houston: the weekly "what it did for you" email to every live shop, by email only.
  if (day === "Mon" && hour === 8 && minute < 10) {
    for (const slug of await list("clients", "")) {
      const c = await getClient(slug);
      if (!c || c.status !== "live") continue;
      try {
        const w = await weeklyReport(c);
        await sendEmail({ to: c.owner.email, subject: w.subject, text: w.text });
        if (c.liveAt && Date.now() - new Date(c.liveAt).getTime() < 28 * D) await notifySteve(`Weekly: ${c.business.name}`, w.text);
        await logEvent(c.slug, "weekly", { empty: !!w.empty, stats: w.stats || null });
        weeklies++;
      } catch (err) { console.error("weekly", slug, err); }
    }
  }
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
  console.log(`scheduler: ${due.length} due`, results, `digests ${digests}`, `weeklies ${weeklies}`, `released ${released}`);
  return { due: due.length, results, digests, weeklies, released, alerts };
}

export default async () => {
  const out = await run();
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
};
