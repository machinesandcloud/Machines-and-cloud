// Runs every 10 minutes: sends whatever is due (reminders, review requests, quote checks, payment
// reminders, quiet-lead chases), runs alert escalations, polls texting registration, and sends the
// 6 pm Houston daily digest to every live shop.
import { dueTasks, del, getRecord, getClient, saveRecord, saveClient, logEvent, list, getConversation, saveConversation, get, put, listRecords, lastInbound, atomicUpdate, id, recordsFor } from "./lib/store.mjs";
import { fanout, claimFanout } from "./lib/fanout.mjs";
import { sendSMS, sendEmail, notifyOwner, notifySteve, optOutStatus, REGISTERED_ONLY_TYPES, ownSenderApproved, textOwner } from "./lib/send.mjs";
import { template, runEscalation, runCallbackCheck, runVisitCheck, runConsentAsk, getCustomer, day7Draft, nextOpenTime, FOLLOW_UP_TYPES, bookingDay } from "./lib/desk.mjs";
import { houstonISO, windowHours } from "./lib/calendar.mjs";
import { forwardingInstructions } from "./lib/forwarding.mjs";
import { PLANS, ACTIVE } from "./lib/config.mjs";
import { a2pEnabled, brandStatus, createCampaign, campaignStatus, releaseNumber, twilioEnabled } from "./lib/twilio.mjs";
import { releaseVoice } from "./lib/vapi.mjs";
import { isSelfServiceClient } from "./lib/setup.mjs";
import { phoneRecoveryHealth } from "./lib/phone-activation.mjs";
import { serviceDeliveryHealth } from "./lib/service-health.mjs";
import { recoverWorkspaceOperations } from "./lib/platform-operations.mjs";
import { recoverLeadConnections } from './lib/lead-connections.mjs';
import {recoverSupportReports} from './lib/support-reports.mjs';
import { strictRead } from './lib/accounts.mjs';
import { healthSnapshot, evaluatePlatformAlert } from "./lib/operator-health.mjs";

export const config = { schedule: "*/10 * * * *" };

const D = 24 * 3600 * 1000;
// 12 rev 4 (F5): a text held because the opt-out state is unknown is retried up to 3 more runs. With 16 the retry
// runs through requeue (new key, firstDueAt kept, deferrals counted, claim cleared), not a re-put of the claimed row.
const HELD_TRIES = 4;
// A run claims each due task with a conditional write before it acts, so overlapping runs never send the
// same task twice. A claim whose run died after starting a send is never retried (the result is unknown;
// the managed outbox makes the same choice), and one that died before sending is taken over after the lease.
const TASK_LEASE = 15 * 60 * 1000;
async function claimTask(key) {
  const token = id(8), until = new Date(Date.now() + TASK_LEASE).toISOString();
  return atomicUpdate("tasks", key, (row) => {
    if (!row) return { result: null };
    if (row.claim && Date.parse(row.claim.until) > Date.now()) return { result: null };
    if (row.claim?.sendingAt) return { value: { ...row, claim: { ...row.claim, until } }, result: { task: row, unconfirmed: true } };
    return { value: { ...row, claim: { token, until } }, result: { task: row, token } };
  });
}
// Held because the shop's own texting registration is not approved: look again every 6 hours, for at most
// 14 days after the original due time (then it is dropped and logged; the owner decides, see PROPOSALS.md).
const HOLD_RETRY = 6 * 3600 * 1000, HOLD_MAX = 14 * D;
// A follow-up released late (hold, pause, retry, quiet hours, the per-customer rule) waits this long after the last
// scheduled text to the same customer. Each run starts at most MAX_SENDS_PER_RUN customer texts (owner decision
// OD-16-6) and at most one per customer; the rest stay due for the next run, oldest original due time first.
const FOLLOW_UP_GAP = 20 * 3600 * 1000, MAX_SENDS_PER_RUN = 25, NEXT_RUN = 10 * 60 * 1000;
// A reminder is exempt from quiet hours only at its own scheduled time (one 10-minute tick late at most, with margin).
const REMINDER_TYPES = ["reminder_24h", "reminder_1h"], REMINDER_GRACE = 30 * 60 * 1000;
async function holdFor(t, reason, every = HOLD_RETRY) {
  if (Date.now() - Date.parse(t.firstDueAt || t.dueAt) <= HOLD_MAX) return { result: reason, retryAt: new Date(Date.now() + every) };
  await logEvent(t.slug, "task_expired", { type: t.type, reason, firstDueAt: t.firstDueAt || t.dueAt });
  return `${reason}, expired`;
}
// A provider refusal that may clear (429, 5xx) is retried with backoff; anything else (an opt-out 21610,
// a bad number) is final. The result of a send that threw is unknown and is not retried (see claimTask).
const RETRY_STEPS = [10, 30, 120, 360, 720].map((m) => m * 60000), ERROR_RETRIES = 3;
const retryAfter = (t, r) => (r.status === 429 || r.status >= 500) && (t.sendFailures || 0) < RETRY_STEPS.length
  ? { result: "send failed, will retry", retryAt: new Date(Date.now() + RETRY_STEPS[t.sendFailures || 0]), patch: { sendFailures: (t.sendFailures || 0) + 1 } } : "send failed";
// A reminder is rebuilt from the booking as it is now: it goes out only while the booking still has the
// visit it was scheduled for, before the window starts, and a "tomorrow" text only on the day before.
const houDate = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(ms));
function reminderStale(t, b) {
  const day = bookingDay(b);
  if (!day) return "visit has no date";
  const startAt = new Date(houstonISO(day, windowHours(b.window).start)).getTime();
  if (Date.parse(t.firstDueAt || t.dueAt) !== startAt - (t.type === "reminder_24h" ? D : 3600 * 1000)) return "visit moved";
  if (Date.now() >= startAt) return "visit started";
  if (t.type === "reminder_24h" && new Date(Date.parse(houDate(Date.now()) + "T12:00:00Z") + D).toISOString().slice(0, 10) !== houDate(startAt)) return "visit not tomorrow";
  return null;
}
const markSending = (key, token) => atomicUpdate("tasks", key, (row) => row?.claim?.token === token ? { value: { ...row, claim: { ...row.claim, sendingAt: new Date().toISOString() } }, result: true } : { result: false });
const releaseTask = (key, token) => atomicUpdate("tasks", key, (row) => row?.claim?.token === token ? { value: { ...row, claim: null }, result: true } : { result: false });

// A task that cannot go out yet is written again under its new due time with the same id; the
// caller deletes the old key. firstDueAt keeps the original schedule for later checks.
async function requeue(key, task, at, reason, patch = {}) {
  const due = new Date(at).toISOString(), next = `${due}_${task.id}`;
  if (next === key) return false;
  const { claim, ...rest } = task;
  await put("tasks", next, { ...rest, ...patch, dueAt: due, firstDueAt: task.firstDueAt || task.dueAt, deferrals: (task.deferrals || 0) + 1, lastDeferral: reason });
  await logEvent(task.slug, "task_deferred", { type: task.type, reason, until: due });
  return true;
}

// ctx.sentTo (one run): the customers this run has already started a text to.
async function runTask(t, mark = async () => true, ctx = {}) {
  // A reminder is never moved by this rule (two reminders in one minute are for two visits, and a moved reminder would
  // lose its own-time quiet-hours exemption); it still takes the customer's slot, so a follow-up waits for the next run.
  const once = (phone) => { const who = `${t.slug}|${phone}`; if (ctx.sentTo?.has(who) && !REMINDER_TYPES.includes(t.type)) return { result: "one text per customer per run", retryAt: new Date(Date.now() + NEXT_RUN) }; ctx.sentTo?.add(who); return null; };
  const managedAlert=t.type==='escalate' && /^[a-f0-9]{64}$/.test(t.data?.tenantIdentity || '');
  const c = managedAlert ? await strictRead('clients',t.slug) : await getClient(t.slug);
  if (!c) return "no client";
  if (isSelfServiceClient(c)) {
    if (t.type==='escalate' && /^[a-f0-9]{64}$/.test(t.data?.tenantIdentity || '')) return runEscalation(c,t);
    await logEvent(t.slug, "task_skipped", { type: t.type, reason: "self_service_portal_only" });
    return "channel_not_active";
  }
  if (!ACTIVE.includes(c.status)) {
    await logEvent(c, "task_skipped", { type: t.type, reason: c.status });
    // A paused shop keeps its customer texts; each is looked at again hourly and goes out after resume if still valid.
    if (c.status === "paused" && REGISTERED_ONLY_TYPES.includes(t.type)) return holdFor(t, "paused", 3600 * 1000);
    return "skipped";
  }
  // Quiet hours are checked again when the text would go out, not only when it was scheduled: a late
  // tick or an outage backlog waits for the next opening minute instead of sending at night.
  if (FOLLOW_UP_TYPES.includes(t.type)) { const open = nextOpenTime(new Date()); if (open.getTime() > Date.now()) return { result: "quiet hours", retryAt: open }; }
  if (t.type === "escalate") return runEscalation(c, t);
  if (t.type === "callback_check") return runCallbackCheck(c, t);
  if (t.type === "visit_check") return runVisitCheck(c, t);
  if (t.type === "consent_ask") {
    const later = once(t.data?.phone); if (later) return later;
    if (!(await mark())) return "claim lost";
    const asked = await runConsentAsk(c, t);
    return asked === "held: sender not registered" ? holdFor(t, asked) : asked;
  }
  const rec = t.data?.bookingId ? await getRecord("bookings", c.slug, t.data.bookingId) : t.data?.leadId ? await getRecord("leads", c.slug, t.data.leadId) : null;
  if (!rec || rec.status === "cancelled") return "no record";
  if (!rec.phone) return "no number";
  if ((await optOutStatus(rec.phone)) === true) return "opted out"; // unreadable: sendSMS below holds and logs it
  const tpl = template(t.type, rec);
  if (!tpl) return "no template";
  if (["reminder_24h", "reminder_1h"].includes(t.type) && !["booked", "confirmed", "on_the_way"].includes(rec.status)) return "booking not active";
  if (["reminder_24h", "reminder_1h"].includes(t.type)) { const stale = reminderStale(t, rec); if (stale) return stale; }
  // Reminders are exempt from quiet hours only at their own scheduled time. One moved by a hold, a pause, a provider
  // retry or a late run waits for the next opening (reminderStale drops it there if it is no longer valid).
  if (REMINDER_TYPES.includes(t.type) && (t.deferrals || Date.now() - Date.parse(t.firstDueAt || t.dueAt) > REMINDER_GRACE)) { const open = nextOpenTime(new Date()); if (open.getTime() > Date.now()) return { result: "quiet hours", retryAt: open }; }
  if (t.type === "lead_chase" && rec.status !== "open") return "lead closed";
  // Booked since the lead came in (the booking closes only leads from its last 24 hours): stop chasing.
  if (t.type === "lead_chase" && (await recordsFor("bookings", c, rec.phone)).some((b) => b.status !== "cancelled" && Date.parse(b.createdAt) >= Date.parse(rec.createdAt))) return "customer booked";
  if (t.type === "quote_check" && rec.status !== "quoted") return "quote closed";
  if (t.type === "payment_reminder" && (rec.status !== "done" || !rec.invoicedAt)) return "paid or not invoiced";
  if (t.type === "review_nudge" && rec.reviewReply) return "already replied";
  if (t.type === "referral_ask" && rec.reviewReply?.sentiment !== "positive") return "no positive reply";
  // A referral ask is a solicitation: like the maintenance reminder it needs the separate marketing yes,
  // not the appointment-texts consent recorded at booking.
  if (["maintenance_reminder", "referral_ask"].includes(t.type) && !(await getCustomer(c.slug, rec.phone)).marketingConsent) return "no marketing consent";
  // A follow-up released late (hold, pause, retry, quiet hours) never lands within FOLLOW_UP_GAP of another
  // scheduled text to this customer, and a review nudge never goes before the review request.
  if (t.type === "review_nudge" && !rec.reviewAskedAt) return holdFor(t, "review request not sent yet");
  if (FOLLOW_UP_TYPES.includes(t.type) && t.firstDueAt && t.firstDueAt !== t.dueAt) {
    const last = ((await getConversation(c, "sms", rec.phone))?.messages || []).filter((m) => m.system && FOLLOW_UP_TYPES.includes(m.system)).map((m) => Date.parse(m.at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    if (last && Date.now() - last < FOLLOW_UP_GAP) return { result: "spacing", retryAt: nextOpenTime(new Date(last + FOLLOW_UP_GAP)) };
  }
  const body = t.type === "lead_chase" ? tpl(c, rec, t.data.n) : tpl(c, rec);
  const later = once(rec.phone); if (later) return later;
  if (!(await mark())) return "claim lost";
  const r = await sendSMS({ to: rec.phone, client: c, type: t.type, body });
  if (r.reason === "sender_not_registered") return holdFor(t, "held: sender not registered");
  if (r.held) {
    // Opt-out state unknown (12-03): nothing was sent. A shop that 16 would hold anyway (own sender not approved)
    // keeps 16's 6-hourly, 14-day hold; otherwise 12's bounded retry, one run apart, then task_dropped_held.
    if (REGISTERED_ONLY_TYPES.includes(t.type) && !ownSenderApproved(c)) return holdFor(t, "held: sender not registered");
    const tries = (t.heldTries || 0) + 1;
    if (tries < HELD_TRIES) return { result: "held: opt-out state unknown", retryAt: new Date(Date.now() + NEXT_RUN), patch: { heldTries: tries } };
    await logEvent(t.slug, "task_dropped_held", { type: t.type, tries });
    return "held: dropped";
  }
  if (r.ok || r.logged) {
    // The front desk should know what it sent when the customer replies to it.
    const conv = await getConversation(c, "sms", rec.phone);
    conv.messages.push({ role: "assistant", content: body, at: new Date().toISOString(), system: t.type });
    await saveConversation(conv);
    if (t.type === "review_request") { rec.reviewAskedAt = new Date().toISOString(); await saveRecord("bookings", rec); }
  }
  await logEvent(c, "task_sent", { type: t.type, id: rec.id, ok: r.ok, logged: !!r.logged });
  return r.ok ? "sent" : r.logged ? "logged" : retryAfter(t, r);
}

// Non-urgent texts to the owner (lifecycle nudges, registration news) go out 9 am to 8 pm Houston only.
// Alerts and escalations are not gated.
const ownerHours = () => { const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(new Date())); return h >= 9 && h < 20; };
async function tellOwnerTenDlcApproved(c) {
  await sendEmail({ to: c.owner.email, subject: `${c.business.name}: texting is live from your number`, text: `Carriers approved your business for texting. Your front desk now texts customers from ${c.phone.twilioNumber}: missed calls, confirmations, reminders, and follow-ups.` });
  if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, type: "owner_note", body: `${c.business.name}: texting is approved. Your front desk now texts customers from your own number.` });
}
// Registration news found at night waits on the client record for the next owner-hours run.
async function tellOwnerTenDlc(c, kind) {
  if (!ownerHours()) { c.phone.ownerNoticePending = kind; return; }
  delete c.phone.ownerNoticePending;
  if (kind === "failed") await tellOwnerTenDlcFailed(c); else await tellOwnerTenDlcApproved(c);
}
async function tellOwnerTenDlcFailed(c) {
  const portal = `${process.env.URL || ""}/desk?c=${c.slug}&k=${c.ownerKey}#setup`;
  const text = `${c.business.name}: carriers did not accept the texting registration. Usually the legal business name or EIN does not match the IRS letter, or the address differs. Check them on your portal (Setup, Texting registration) and save to refile: ${portal}. Until it clears, your front desk does not text customers; calls and email alerts keep working.`;
  if (c.owner?.phone) await sendSMS({ to: c.owner.phone, client: c, type: "owner_note", body: text });
  await sendEmail({ to: c.owner.email, subject: `${c.business.name}: texting registration needs a fix`, text });
  await logEvent(c, "tendlc_owner_told", {});
}
// One-time lifecycle messages, each sent once (stamped on the client record).
async function lifecycle(c) {
  let n = 0;
  if (!ownerHours()) return 0;
  if (c.phone?.ownerNoticePending) { await tellOwnerTenDlc(c, c.phone.ownerNoticePending); await saveClient(c); n++; }
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
    if (c.owner?.phone) await sendSMS({ to: c.owner.phone, client: c, type: "owner_note", body: `${c.business.name}: your front desk is ready to test. Open your portal, try it as a customer, then press Go live. Stuck? Reply here.` });
    await sendEmail({ to: c.owner.email, subject: `${c.business.name}: ready to test, waiting on you`, text });
    await mark("testingNudge", "testing_nudge");
  }
  // (c) Number assigned, forwarding never verified for two business days.
  if (["testing", "live"].includes(c.status) && c.phone?.twilioNumber && c.phone?.forwarding !== "none" && !c.phone?.forwardingVerified && !stamps.forwardingNudge && c.provision?.startedAt && businessDaysSince(c.provision.startedAt) >= 2) {
    const fw = forwardingInstructions(c);
    const text = `${c.business.name}: no forwarded call has reached your front desk yet. ${fw.short || "Turn on forwarding to " + c.phone.twilioNumber + " in your carrier app."} iPhone: turn off Live Voicemail first (Settings, Phone, Live Voicemail). Then call your own number from another phone and let it ring.`;
    await textOwner(c, text, { type: "owner_note", subject: `${c.business.name}: call forwarding is not on yet` });
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
  await notifySteve(subject, `${text}\nCustomer: ${c.slug}\n${process.env.URL || ""}/admin.html`);
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
  if (cal.length && (await alertOnce(c, "calendar", 24, `Calendar failing: ${c.business.name}`, `${cal.length} booking(s) did not reach the owner's Google Calendar in the last 24 hours (${cal[cal.length - 1].data?.error || "error"}). Usually the Google connection expired: ask the owner to press Connect Google Calendar on the portal again. ${ownSenderApproved(c) ? "Bookings still reach the owner by text and email." : "Bookings still reach the owner by email (texting waits for carrier approval)."}`))) n++;
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
    let managedFailures=0;
    let started = 0; const ctx = { sentTo: new Set() };
    // Reminders first (time-bound: a late one is dropped at the visit or loses its quiet-hours grace), then oldest
    // original due time first, so a released series keeps its order (review request before its nudge).
    const rank = (t) => (REMINDER_TYPES.includes(t.type) ? 0 : 1);
    due.sort((x, y) => rank(x.task) - rank(y.task) || Date.parse(x.task.firstDueAt || x.task.dueAt) - Date.parse(y.task.firstDueAt || y.task.dueAt) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    for (const { key, task: listed } of due) {
      // At most MAX_SENDS_PER_RUN customer texts per run; follow-ups past the cap stay due (unclaimed). Reminders (sent
      // first, at their own time as before) and owner alerts and checks are not held back by the cap.
      if (started >= MAX_SENDS_PER_RUN && FOLLOW_UP_TYPES.includes(listed.type)) { results.push([listed.type, "run cap"]); continue; }
      // A storage error on one claim must not end the whole batch.
      let claimed;
      try { claimed = await claimTask(key); } catch (err) { console.error("task claim failed", key, err); results.push(["claim", "error"]); continue; }
      if (!claimed) continue; // already done, or another run holds it
      const { task, token } = claimed;
      if (claimed.unconfirmed) {
        results.push([task.type, "unconfirmed"]);
        try { await logEvent(task.slug, "task_unconfirmed", { type: task.type, id: task.id }); } catch { /* ignore */ }
        await del("tasks", key); continue;
      }
      let retain=false, sending=false, lost=false;
      try {
        const out = await runTask(task, async () => { sending = await markSending(key, token); if (sending) started++; return sending; }, ctx);
        results.push([task.type, out && typeof out === "object" ? out.result : out]);
        // Another run took this task over: leave its key alone (deleting it would lose that run's send).
        if (out === "claim lost") lost = true;
        if (out?.retryAt && !(await requeue(key, task, out.retryAt, out.result, out.patch))) retain = true;
      }
      catch (err) { retain=task.type==='escalate' && /^[a-f0-9]{64}$/.test(task.data?.tenantIdentity || ''); if(retain)managedFailures++; console.error("task failed", task.type, err); results.push([task.type, "error"]); try { await logEvent(task.slug, "task_error", { type: task.type, error: String(err?.message || err).slice(0, 200) }); } catch { /* ignore */ }
        // A customer text that failed before any send started (a storage error) is tried again, at most three times.
        if (!retain && !sending && REGISTERED_ONLY_TYPES.includes(task.type) && (task.errorRetries || 0) < ERROR_RETRIES) { try { await requeue(key, task, Date.now() + RETRY_STEPS[task.errorRetries || 0], "error", { errorRetries: (task.errorRetries || 0) + 1 }); } catch { /* the original key is deleted below either way */ } }
      }
      if (lost) continue;
      if (!retain) await del("tasks", key);
      else { try { await releaseTask(key, token); } catch (err) { console.error("task release failed", key, err); } }
    }
    if(managedFailures)throw new Error('Managed request attention work is retained for scheduled retry');
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
          else if (st === "FAILED") { c.phone.tenDlc = "failed"; c.phone.brandStatus = st; await notifySteve(`10DLC brand failed: ${c.business.name}`, `Brand ${c.phone.brandSid} failed. Check the Twilio console.`); await tellOwnerTenDlc(c, "failed"); }
          else c.phone.brandStatus = st;
        } else {
          const st = await campaignStatus(c.phone.messagingServiceSid, c.phone.campaignSid);
          c.phone.campaignStatus = st;
          if (st === "VERIFIED") {
            c.phone.tenDlc = "approved";
            await logEvent(c, "sender_switched", { to: "own" });
            await tellOwnerTenDlc(c, "approved");
          } else if (st === "FAILED") { c.phone.tenDlc = "failed"; await notifySteve(`10DLC campaign failed: ${c.business.name}`, `Campaign ${c.phone.campaignSid} failed. Check the Twilio console.`); await tellOwnerTenDlc(c, "failed"); }
        }
        await saveClient(c);
      } catch (err) { console.error("10dlc poll", slug, err); }
    }
    return { polled };
  });
  // Due tasks retain priority. Safe local recovery still runs every invocation,
  // independently of the usage brake or an initial browser dispatch.
  await block(record, "setupRecovery", async () => recoverWorkspaceOperations());
  await block(record, "leadIntakeRecovery", async () => recoverLeadConnections());
  await block(record, "supportReportRecovery", async () => recoverSupportReports());
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
  // Expired sign-in rows and raw-IP rate-limit buckets are not kept past their purpose (F6/F7).
  await block(record, "retention", async () => {
    if (!halfHour) return { skipped: "runs at :00 and :30" };
    const { retentionSweep } = await import("./lib/data-erasure.mjs");
    return retentionSweep();
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
  // Keep the last healthy time across failing runs so operators see how long it has been broken.
  const previousRun = await get("health", "scheduler:lastRun");
  record.lastGoodAt = record.ok ? record.at : previousRun?.ok === true ? previousRun.at : previousRun?.lastGoodAt || null;
  try { await put("health", "scheduler:lastRun", record); } catch (err) { console.error("run record", err); }
  // PRA-OPS-02: self-reported failing blocks (and recovery) reach ADMIN_EMAILS once, deduplicated.
  // A scheduler that stops running cannot reach this line; /api/health covers that case.
  const healthAlert = await evaluatePlatformAlert(healthSnapshot(record), { source: "scheduler" });
  const digests = fanouts.digest?.done || 0, weeklies = fanouts.weekly?.done || 0, monthlies = fanouts.monthly?.done || 0, autoFlags = fanouts.autoflag?.done || 0;
  console.log(`scheduler: ${dueCount} due`, results, `digests ${digests}`, `weeklies ${weeklies}`, `released ${released}`, record.ok ? "ok" : "with errors");
  return { due: dueCount, results, digests, weeklies, monthlies, released, alerts, lifecycles, autoFlags, fanouts: wanted, blocks: record.blocks, ok: record.ok, healthAlert };
}

export default async () => {
  const out = await run();
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
};
