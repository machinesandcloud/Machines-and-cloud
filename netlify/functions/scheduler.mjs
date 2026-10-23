// Runs every 10 minutes: sends whatever is due (reminders, review requests, quote checks, payment
// reminders, quiet-lead chases), runs alert escalations, polls texting registration, and sends the
// 6 pm Houston daily digest to every live shop.
import { dueTasks, del, getRecord, getClient, saveRecord, saveClient, logEvent, list, getConversation, saveConversation, get, put, listRecords, lastInbound } from "./lib/store.mjs";
import { fanout, claimFanout } from "./lib/fanout.mjs";
import { sendSMS, sendEmail, notifyOwner, notifySteve, optedOut } from "./lib/send.mjs";
import { template, runEscalation, runCallbackCheck, runVisitCheck, runConsentAsk, getCustomer, day7Draft } from "./lib/desk.mjs";
import { forwardingInstructions } from "./lib/forwarding.mjs";
import { PLANS, ACTIVE } from "./lib/config.mjs";
import { a2pEnabled, brandStatus, createCampaign, campaignStatus, releaseNumber, twilioEnabled } from "./lib/twilio.mjs";
import { releaseVoice } from "./lib/vapi.mjs";
import { isSelfServiceClient } from "./lib/setup.mjs";
import { phoneRecoveryHealth } from "./lib/phone-activation.mjs";
import { serviceDeliveryHealth } from "./lib/service-health.mjs";
import { recoverWorkspaceOperations } from "./lib/platform-operations.mjs";

export const config = { schedule: "*/10 * * * *" };

const D = 24 * 3600 * 1000;

async function runTask(t) {
  const c = await getClient(t.slug);
  if (!c) return "no client";
  if (isSelfServiceClient(c)) {
    await logEvent(t.slug, "task_skipped", { type: t.type, reason: "self_service_portal_only" });
    return "channel_not_active";
  }
  if (!ACTIVE.includes(c.status)) { await logEvent(c, "task_skipped", { type: t.type, reason: c.status }); return "skipped"; }
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
    const conv = await getConversation(c, "sms", rec.phone);
    conv.messages.push({ role: "assistant", content: body, at: new Date().toISOString(), system: t.type });
    await saveConversation(conv);
    if (t.type === "review_request") { rec.reviewAskedAt = new Date().toISOString(); await saveRecord("bookings", rec); }
  }
  await logEvent(c, "task_sent", { type: t.type, id: rec.id, ok: r.ok, logged: !!r.logged });
  return r.ok ? "sent" : r.logged ? "logged" : "send failed";
}

async function tellOwnerTenDlcFailed(c) {
  const portal = `${process.env.URL || ""}/desk?c=${c.slug}&k=${c.ownerKey}#setup`;
  const text = `${c.business.name}: carriers did not accept the texting registration. Usually the legal business name or EIN does not match the IRS letter, or the address differs. Check them on your portal (Setup, Texting registration) and save to refile: ${portal}. Until it clears, texts keep going out from our registered number with your name.`;
  if (c.owner?.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: text });
  await sendEmail({ to: c.owner.email, subject: `${c.business.name}: texting registration needs a fix`, text });
  await logEvent(c, "tendlc_owner_told", {});
}
// One-time lifecycle messages, each sent once (stamped on the client record).
async function lifecycle(c) {
  let n = 0;
  const stamps = c.lifecycle || {};
  const portal = `${process.env.URL || ""}/desk?c=${c.slug}&k=${c.ownerKey}`;
  const mark = async (k, type) => { stamps[k] = new Date().toISOString(); c.lifecycle = stamps; await saveClient(c); await logEvent(c, type, {}); n++; };
  // (a) Day 8: the free week is over.
  if (c.status === "live" && c.liveAt && !stamps.trialOver && stamps.day7Sent && Date.now() - new Date(c.liveAt).getTime() >= 8 * D) {
    const text = `${c.business.name}: your free week is over. Nothing changes on the line. Your first statement arrives on the 1st, and Steve sends the invoice with it. Reply to this email with anything you want the front desk to do differently.`;
    await sendEmail({ to: c.owner.email, subject: `${c.business.name}: your free week is over`, text });
    await mark("trialOver", "trial_over");
  }
  // (b) Stuck in testing for three days.
  if (c.status === "testing" && c.build?.builtAt && !stamps.testingNudge && Date.now() - new Date(c.build.builtAt).getTime() >= 3 * D) {
    const text = `${c.business.name}: your front desk has been ready to test for three days. Open ${portal} and try the hard ones on the Test it tab: ask for a price you did not publish, an exact arrival time, a gas smell, Spanish. Fix anything under What it knows, then press Go live. Reply to this email if something is in the way.`;
    if (c.owner?.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: `${c.business.name}: your front desk is ready to test. Open your portal, try it as a customer, then press Go live. Stuck? Reply here.` });
    await sendEmail({ to: c.owner.email, subject: `${c.business.name}: ready to test, waiting on you`, text });
    await mark("testingNudge", "testing_nudge");
  }
  // (c) Number assigned, forwarding never verified for two business days.
  if (["testing", "live"].includes(c.status) && c.phone?.twilioNumber && c.phone?.forwarding !== "none" && !c.phone?.forwardingVerified && !stamps.forwardingNudge && c.provision?.startedAt && businessDaysSince(c.provision.startedAt) >= 2) {
    const fw = forwardingInstructions(c);
    const text = `${c.business.name}: no forwarded call has reached your front desk yet. ${fw.short || "Turn on forwarding to " + c.phone.twilioNumber + " in your carrier app."} iPhone: turn off Live Voicemail first (Settings, Phone, Live Voicemail). Then call your own number from another phone and let it ring.`;
    if (c.owner?.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: text });
    await mark("forwardingNudge", "forwarding_nudge");
  }
  // (e) Day 7: draft the "what I changed" email into Steve's inbox.
  if (c.status === "live" && c.liveAt && !stamps.day7Draft && Date.now() - new Date(c.liveAt).getTime() >= 7 * D) {
    const draft = await day7Draft(c);
    await notifySteve(`Day 7 draft for ${c.business.name} (edit and send)`, draft);
    await mark("day7Draft", "day7_draft");
  }
  return n;
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
  await logEvent(c, "health_alert", { reason });
  return true;
}
async function healthAlerts(c) {
  const events = await listRecords("events", c.slug, 150);
  const since = (ms) => events.filter((e) => Date.now() - new Date(e.at).getTime() < ms);
  let n = 0;
  const failed = since(3600 * 1000).filter((e) => e.type === "sms_failed" || (e.type === "twilio_error" && e.data?.kind === "sms"));
  if (failed.length >= 3 && (await alertOnce(c, "sms_failures", 1, `Texts failing: ${c.business.name}`, `${failed.length} texts failed in the last hour. Last error: ${failed[failed.length - 1].data?.message || failed[failed.length - 1].data?.code || "-"}.`))) n++;
  const voice = since(15 * 60 * 1000).filter((e) => ["vapi_tool_failed", "assistant_request_failed", "voice_attach_failed", "voice_detach_failed", "voice_failed"].includes(e.type) || (e.type === "twilio_error" && e.data?.kind === "voice"));
  if (voice.length && (await alertOnce(c, "voice_failures", 1, `Voice failing: ${c.business.name}`, `${voice.length} voice failure(s) in the last 15 minutes: ${voice.map((e) => e.type + " " + (e.data?.error || e.data?.reason || e.data?.code || e.data?.name || "")).join("; ").slice(0, 400)}.`))) n++;
  const cal = since(24 * 3600 * 1000).filter((e) => e.type === "calendar_failed");
  if (cal.length && (await alertOnce(c, "calendar", 24, `Calendar failing: ${c.business.name}`, `${cal.length} booking(s) did not reach the owner's Google Calendar in the last 24 hours (${cal[cal.length - 1].data?.error || "error"}). Usually the Google connection expired: ask the owner to press Connect Google Calendar on the portal again. Bookings still reach the owner by text.`))) n++;
  if (c.status === "live" && c.phone?.forwardingVerified && c.phone?.forwarding !== "none") {
    const inbound = (await lastInbound(c))?.at || events.filter((e) => ["missed_call", "call_ended", "call_started", "call_forwarded", "sms_inbound"].includes(e.type)).map((e) => e.at).sort().pop() || c.liveAt || c.phone.firstCallAt;
    if (inbound && businessDaysSince(inbound) >= 5 && (await alertOnce(c, "no_inbound", 5 * 24, `Line silent: ${c.business.name}`, `No call or text has reached the front desk for ${businessDaysSince(inbound)} business days (last at ${inbound}). Forwarding may have dropped: ask the owner to dial *#61# and check Live Voicemail, then call the business number from another phone.`))) n++;
  }
  return n;
}

async function block(record, name, fn) {
  const t = Date.now();
  try { const out = await fn(); record.blocks[name] = { ok: true, ms: Date.now() - t, ...(out && typeof out === "object" ? out : {}) }; return out; }
  catch (err) { console.error("scheduler block", name, err); record.blocks[name] = { ok: false, ms: Date.now() - t, error: String(err?.message || err).slice(0, 300) }; return null; }
}

// Every block is wrapped and recorded in health/scheduler:lastRun; a failure in one never stops the next.
// Fan-outs to every live shop (digest, audit, weekly, monthly) run in a background function at their hour,
// claimed once per Houston day; with forceHour (tests) they run inline so the caller sees the result.
export async function run({ forceHour, forceDay, inline, all } = {}) {
  const record = { at: new Date().toISOString(), blocks: {} };
  const nowISO = record.at;
  const results = [];
  let dueCount = 0;
  await block(record, "tasks", async () => {
    const due = await dueTasks(nowISO); dueCount = due.length;
    for (const { key, task } of due) {
      try { results.push([task.type, await runTask(task)]); }
      catch (err) { console.error("task failed", task.type, err); results.push([task.type, "error"]); try { await logEvent(task.slug, "task_error", { type: task.type, error: String(err?.message || err).slice(0, 200) }); } catch { /* ignore */ } }
      await del("tasks", key);
    }
    return { due: due.length };
  });
  const minuteNow = forceHour !== undefined ? 0 : Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", minute: "numeric" }).formatToParts(new Date()).find((p) => p.type === "minute")?.value);
  const brake = !!(await get("health", "brake"))?.on;
  record.brake = brake;
  // The brake stops scans and the nightly audit; due tasks above always run first.
  const halfHour = !brake && (all || minuteNow < 10 || (minuteNow >= 30 && minuteNow < 40));
  await block(record, "tenDlc", async () => {
    if (!a2pEnabled()) return { skipped: "no keys" };
    if (!halfHour) return { skipped: "runs at :00 and :30" };
    let polled = 0;
    for (const slug of await list("clients", "")) {
      const c = await getClient(slug);
      if (isSelfServiceClient(c) || !c?.phone?.brandSid || !["brand_pending", "campaign_pending"].includes(c.phone.tenDlc)) continue;
      polled++;
      try {
        if (c.phone.tenDlc === "brand_pending") {
          const st = await brandStatus(c.phone.brandSid);
          if (st === "APPROVED") { const camp = await createCampaign(c, c.phone.messagingServiceSid, c.phone.brandSid); Object.assign(c.phone, camp, { tenDlc: "campaign_pending", brandStatus: st }); }
          else if (st === "FAILED") { c.phone.tenDlc = "failed"; c.phone.brandStatus = st; await notifySteve(`10DLC brand failed: ${c.business.name}`, `Brand ${c.phone.brandSid} failed. Check the Twilio console.`); await tellOwnerTenDlcFailed(c); }
          else c.phone.brandStatus = st;
        } else {
          const st = await campaignStatus(c.phone.messagingServiceSid, c.phone.campaignSid);
          c.phone.campaignStatus = st;
          if (st === "VERIFIED") {
            c.phone.tenDlc = "approved";
            await logEvent(c, "sender_switched", { to: "own" });
            await sendEmail({ to: c.owner.email, subject: `${c.business.name}: texting is live from your number`, text: `Carriers approved your business for texting. Your front desk now texts customers from ${c.phone.twilioNumber}: missed calls, confirmations, reminders, and follow-ups.` });
            if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: `${c.business.name}: texting is approved. Your front desk now texts customers from your own number.` });
          } else if (st === "FAILED") { c.phone.tenDlc = "failed"; await notifySteve(`10DLC campaign failed: ${c.business.name}`, `Campaign ${c.phone.campaignSid} failed. Check the Twilio console.`); await tellOwnerTenDlcFailed(c); }
        }
        await saveClient(c);
      } catch (err) { console.error("10dlc poll", slug, err); }
    }
    return { polled };
  });
  // Due tasks retain priority. Safe local recovery still runs every invocation,
  // independently of the usage brake or an initial browser dispatch.
  await block(record, "setupRecovery", async () => recoverWorkspaceOperations());
  // Provider work has its own scheduled function and 15-second aggregate budget.
  // The main scheduler only reads its durable receipt and pending-work counters.
  await block(record, "phoneSetupRecovery", async () => phoneRecoveryHealth());
  await block(record, "serviceDeliveryRecovery", async () => serviceDeliveryHealth());
  let alerts = 0, lifecycles = 0;
  await block(record, "healthLifecycle", async () => {
    if (!halfHour) return { skipped: "runs at :00 and :30" };
    for (const slug of await list("clients", "")) {
      const c = await getClient(slug);
      if (!c || isSelfServiceClient(c) || !["testing", "live"].includes(c.status)) continue;
      try { alerts += await healthAlerts(c); } catch (err) { console.error("health", slug, err); }
      try { lifecycles += await lifecycle(c); } catch (err) { console.error("lifecycle", slug, err); }
    }
    return { alerts, lifecycles };
  });
  let released = 0;
  await block(record, "release", async () => {
    if (!halfHour) return { skipped: "runs at :00 and :30" };
    for (const slug of await list("clients", "")) {
      const c = await getClient(slug);
      if (!c || isSelfServiceClient(c) || c.status !== "cancelled" || !c.serviceEndsAt || new Date(c.serviceEndsAt).getTime() > Date.now()) continue;
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
        await logEvent(c, skipped ? "number_release_skipped" : "number_released", out);
        await notifySteve(`${skipped ? "Number release skipped (no keys)" : "Number released"}: ${c.business?.name}`, `${c.slug}: ${JSON.stringify(out)}\nCancelled ${c.cancelledAt}, window ended ${c.serviceEndsAt}.`);
        released++;
      } catch (err) { console.error("release", slug, err); }
    }
    return { released };
  });
  // The clock, Houston.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
  const hour = forceHour ?? Number(parts.find((p) => p.type === "hour")?.value);
  const day = forceDay && isNaN(Number(forceDay)) ? forceDay : new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(new Date());
  const dom = forceDay && !isNaN(Number(forceDay)) ? Number(forceDay) : Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", day: "numeric" }).format(new Date()));
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const forced = forceHour !== undefined;
  const wanted = [];
  if (hour === 18) wanted.push("digest");
  if (hour === 21 && !brake) wanted.push("autoflag");
  if (day === "Mon" && hour === 8) wanted.push("weekly");
  if (dom === 1 && hour === 9) wanted.push("monthly");
  const fanouts = {};
  for (const kind of wanted) {
    await block(record, `fanout:${kind}`, async () => {
      // Forced runs (tests) run inline and are not stamped; a scheduled run claims the day once, then hands off.
      if (forced || inline) { const r = await fanout(kind); fanouts[kind] = r; return { inline: true, done: r.done, errors: r.errors.length }; }
      if (!(await claimFanout(kind, dateKey))) return { skipped: "already sent today" };
      const base = process.env.URL;
      if (!base) throw new Error("no site URL for the background function");
      const res = await fetch(`${base}/.netlify/functions/scheduler-fanout-background`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": process.env.ADMIN_KEY || "" }, body: JSON.stringify({ kind }) });
      if (res.status >= 300) throw new Error(`background start ${res.status}`);
      return { started: true };
    });
  }
  record.ok = Object.values(record.blocks).every((b) => b.ok);
  record.ms = Date.now() - new Date(record.at).getTime();
  try { await put("health", "scheduler:lastRun", record); } catch (err) { console.error("run record", err); }
  const digests = fanouts.digest?.done || 0, weeklies = fanouts.weekly?.done || 0, monthlies = fanouts.monthly?.done || 0, autoFlags = fanouts.autoflag?.done || 0;
  console.log(`scheduler: ${dueCount} due`, results, `digests ${digests}`, `weeklies ${weeklies}`, `released ${released}`, record.ok ? "ok" : "with errors");
  return { due: dueCount, results, digests, weeklies, monthlies, released, alerts, lifecycles, autoFlags, fanouts: wanted, blocks: record.blocks, ok: record.ok };
}

export default async () => {
  const out = await run();
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
};
