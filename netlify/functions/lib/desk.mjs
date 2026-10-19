// What happens when the front desk books a visit or flags a lead for a real client:
// records, owner alerts (job tickets), acknowledge-and-escalate, calendar, confirm and
// reschedule by reply, the follow-up timers that match the plan, the daily digest, line health.
import { addRecord, saveRecord, getRecord, scheduleTask, cancelTasks, logEvent, listRecords, list, get, del, put } from "./store.mjs";
import { notifyOwner, sendSMS, sendEmail, notifySteve, e164, optedOut, placeCall, STEVE_PHONE } from "./send.mjs";
import { createEvent, updateEvent, visitDate, windowHours, houstonISO } from "./calendar.mjs";
import { PLANS } from "./config.mjs";

const H = 3600 * 1000, D = 24 * H;
const esc = (s) => String(s || "").trim();

export function reviewLink(c) {
  if (c.business?.googlePlaceId) return `https://search.google.com/local/writereview?placeid=${c.business.googlePlaceId}`;
  return c.business?.reviewLink || "";
}

export const TEMPLATES = {
  reminder_24h: (c, b) => `Reminder from ${c.business.name}: your visit is tomorrow, ${b.window}. Reply C to confirm or R to reschedule.`,
  reminder_1h: (c, b) => `${c.business.name}: your window (${b.window}) starts soon. Reply here if anything changed.`,
  on_my_way: (c, b) => `${c.business.name}: the tech is on the way to ${b.address}. Please keep pets secured and the area clear.${b.notes ? " Note: " + b.notes : ""}`,
  review_request: (c, j) => `Thanks for choosing ${c.business.name}${j.customer_name ? ", " + j.customer_name.split(" ")[0] : ""}. How did we do? A quick Google review helps a small shop a lot: ${reviewLink(c) || "(review link)"}. Reply here if anything was not right.`,
  review_nudge: (c, j) => `${c.business.name}: if you have 30 seconds, we would love a review: ${reviewLink(c) || "(review link)"}. Thank you.`,
  quote_check: (c, j) => `${c.business.name}: checking in on the quote we sent${j.issue ? " for the " + j.issue : ""}. Want us to close it out, or keep it open? Reply and we will take care of it.`,
  payment_reminder: (c, j) => `${c.business.name}: friendly reminder that the invoice${j.amount ? " for " + j.amount : ""} is open. ${c.business.payLink ? "Pay here: " + c.business.payLink : "Reply here with any questions."}`,
  referral_ask: (c, j) => `${c.business.name}: thank you again. If a neighbor needs help, we would be grateful for the referral. Just have them text this number.`,
  lead_chase: (c, l, n) => n === 1
    ? `Hi${l.customer_name ? " " + l.customer_name.split(" ")[0] : ""}, this is ${c.business.name}. We saw your request${l.issue ? " about " + l.issue : ""}. Still need a hand? Reply with a good time and we will get you on the schedule.`
    : n === 2 ? `${c.business.name} here. We have openings ${(c.windows || [])[0] ? "(" + c.windows.join(" or ") + ")" : "this week"}. Want one?`
    : `${c.business.name}: last note from us. If you still need help, reply any time and we will fit you in.`,
};

const OUTCOME = { booked: "BOOKED", needs_action: "NEEDS ACTION", took_message: "TOOK MESSAGE", wants_call: "WANTS A CALL", spam: "SPAM", rescheduled: "RESCHEDULED", cancel_request: "NEEDS ACTION" };
const outcomeFor = (reason) => ({ lead: "needs_action", handoff: "needs_action", emergency: "needs_action", question: "took_message", wants_call: "wants_call", spam: "spam" }[reason] || "needs_action");

export async function customerType(slug, phone) {
  if (!phone) return "new";
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const kind of ["bookings", "leads"]) {
    const recs = await listRecords(kind, slug, 300);
    if (recs.some((r) => r.phone === phone && new Date(r.createdAt).getTime() < cutoff)) return "existing";
  }
  return "new";
}

// The owner's text: a job ticket.
export function ownerSummary(c, kind, r) {
  const outcome = OUTCOME[r.outcome] || (kind === "booking" ? "BOOKED" : kind.toUpperCase());
  const lines = [`${c.business.name} front desk: ${outcome}${r.urgency === "emergency" ? " EMERGENCY" : ""}`];
  if (r.customer_name || r.customerType) lines.push(`Customer: ${r.customer_name || "name not given"} (${r.customerType === "existing" ? "existing customer" : "new"})`);
  if (r.phone) lines.push(`Phone: ${r.phone}`);
  if (r.address) lines.push(`Where: ${r.address}`);
  if (r.issue) lines.push(`Issue: ${r.issue}`);
  if (r.urgency) lines.push(`Urgency: ${r.urgency.replace("_", " ")}`);
  if (r.window) lines.push(`Window: ${r.date && r.date !== "today" ? r.date + ", " : ""}${r.window}`);
  else if (r.wanted) lines.push(`Wants: ${r.wanted}`);
  if (r.notes) lines.push(`Access: ${r.notes}`);
  if (r.language === "es") lines.push("Language: Spanish");
  if (r.unsure) lines.push(`Unsure about: ${r.unsure}`);
  if (r.id) lines.push(`Ref ${r.id}. Reply "ok ${r.id}" to acknowledge, "otw ${r.id}" on the way, "done ${r.id}" finished, "quote ${r.id} amount" quoted.`);
  return lines.join("\n");
}

async function scheduleReminders(c, b) {
  if (!b.date) return;
  const day = visitDate(b.date); const { start } = windowHours(b.window);
  const startAt = new Date(houstonISO(day, start)).getTime();
  if (startAt - D > Date.now()) await scheduleTask(c.slug, new Date(startAt - D), "reminder_24h", { bookingId: b.id });
  if (startAt - H > Date.now()) await scheduleTask(c.slug, new Date(startAt - H), "reminder_1h", { bookingId: b.id });
}

export async function bookVisit(c, input, ctx = {}) {
  const phone = e164(input.phone) || esc(input.phone);
  const b = await addRecord("bookings", c.slug, {
    customer_name: esc(input.customer_name), phone, address: esc(input.address), issue: esc(input.issue),
    date: esc(input.date), window: esc(input.window), urgency: input.urgency, language: input.language, notes: esc(input.notes), unsure: esc(input.unsure),
    channel: ctx.channel || "web", status: "booked", outcome: "booked", customerType: await customerType(c.slug, phone),
  });
  try { const ev = await createEvent(c, b); if (ev) { b.calendarEventId = ev.id; b.calendarLink = ev.link; } } catch (e) { console.error("calendar", e); }
  await scheduleReminders(c, b);
  // consent: told at booking, recorded on the booking
  const { consentLine } = await import("./config.mjs");
  b.consent = { at: new Date().toISOString(), channel: ctx.channel || "web", phone: b.phone, wording: consentLine(c) };
  await saveRecord("bookings", b);
  if (b.phone && ctx.channel !== "sms") {
    await sendSMS({ to: b.phone, client: c, type: "confirmation", body: `${c.business.name}: you're booked for ${b.date && b.date !== "today" ? b.date + ", " : ""}${b.window}. We'll text a reminder and again when the tech is on the way. Reply R to reschedule. Reply STOP to opt out.` });
  }
  await notifyOwner(c, ownerSummary(c, "booking", b), { type: "owner_alert" });
  await logEvent(c.slug, "booking", { id: b.id, channel: ctx.channel });
  return b;
}

// A repeat notify_owner for the same customer within 30 minutes updates the open lead instead of
// opening a second one (and a second escalation chain).
async function recentOpenLead(c, phone, contact) {
  const cutoff = Date.now() - 30 * 60 * 1000;
  const leads = (await listRecords("leads", c.slug, 200)).filter((l) => l.status === "open" && new Date(l.createdAt).getTime() > cutoff);
  return leads.reverse().find((l) => (phone && l.phone === phone) || (contact && l.contact === contact)) || null;
}

export async function flagLead(c, input, ctx = {}) {
  const phone = e164(input.phone) || esc(input.phone);
  const reason = input.reason || "lead";
  const prior = reason === "spam" ? null : await recentOpenLead(c, phone, ctx.contact);
  if (prior) {
    const changed = [];
    for (const k of ["customer_name", "phone", "address", "issue", "wanted", "unsure"]) { const v = k === "phone" ? phone : esc(input[k]); if (v && v !== prior[k]) { prior[k] = v; changed.push(k); } }
    const escalate = (reason === "emergency" || input.urgency === "emergency") && prior.urgency !== "emergency";
    if (escalate) { prior.urgency = "emergency"; prior.reason = "emergency"; prior.outcome = "needs_action"; changed.push("urgency"); }
    if (reason === "wants_call" && prior.reason !== "wants_call") { prior.reason = "wants_call"; prior.outcome = "wants_call"; changed.push("reason"); }
    await saveRecord("leads", prior);
    if (changed.length) await notifyOwner(c, `UPDATE ref ${prior.id} (${changed.join(", ")}):\n` + ownerSummary(c, prior.reason, prior), { type: "owner_alert" });
    const waiting = (await listRecords("alerts", c.slug, 100)).some((a) => a.leadId === prior.id && a.status === "waiting");
    if (!waiting && (prior.urgency === "emergency" || prior.reason === "wants_call")) await openAlert(c, prior, prior.reason === "wants_call" ? "wants_call" : "emergency");
    await logEvent(c.slug, "lead_updated", { id: prior.id, changed, channel: ctx.channel });
    return prior;
  }
  const l = await addRecord("leads", c.slug, {
    customer_name: esc(input.customer_name), phone, address: esc(input.address), issue: esc(input.issue),
    reason, urgency: input.urgency, wanted: esc(input.wanted), language: input.language, unsure: esc(input.unsure),
    channel: ctx.channel || "web", contact: ctx.contact || "", status: reason === "spam" ? "spam" : "open", outcome: outcomeFor(reason), customerType: await customerType(c.slug, phone),
  });
  if (reason !== "spam") {
    await notifyOwner(c, ownerSummary(c, reason, l), { type: "owner_alert" });
    const urgent = reason === "emergency" || reason === "wants_call" || input.urgency === "emergency";
    if (urgent) await openAlert(c, l, reason === "wants_call" ? "wants_call" : "emergency");
    if (PLANS[c.plan]?.followUp && l.phone && reason === "lead") {
      await scheduleTask(c.slug, new Date(Date.now() + 4 * H), "lead_chase", { leadId: l.id, n: 1 });
      await scheduleTask(c.slug, new Date(Date.now() + 26 * H), "lead_chase", { leadId: l.id, n: 2 });
      await scheduleTask(c.slug, new Date(Date.now() + 48 * H), "lead_chase", { leadId: l.id, n: 3 });
    }
  }
  await logEvent(c.slug, "lead", { id: l.id, reason, channel: ctx.channel });
  return l;
}

// ---- Acknowledge and escalate ----
export async function openAlert(c, lead, kind) {
  const a = await addRecord("alerts", c.slug, { leadId: lead.id, kind, status: "waiting", step: 0, sentAt: new Date().toISOString(), history: [] });
  const mins = Number(c.rules?.ackMinutes) || 10;
  await scheduleTask(c.slug, new Date(Date.now() + mins * 60 * 1000), "escalate", { alertId: a.id });
  await logEvent(c.slug, "alert_opened", { id: a.id, leadId: lead.id, kind });
  return a;
}

export async function ackAlertsFor(c, recordId, by = "owner") {
  const alerts = (await listRecords("alerts", c.slug, 200)).filter((a) => a.leadId === recordId && a.status === "waiting");
  for (const a of alerts) { a.status = "acked"; a.ackedAt = new Date().toISOString(); a.ackedBy = by; await saveRecord("alerts", a); await logEvent(c.slug, "alert_acked", { id: a.id, by }); }
  return alerts.length;
}

export async function runEscalation(c, task) {
  const a = await getRecord("alerts", c.slug, task.data?.alertId);
  if (!a) return "no alert";
  if (a.status !== "waiting") return a.status;
  const lead = await getRecord("leads", c.slug, a.leadId);
  if (!lead || lead.status !== "open") { a.status = "closed"; await saveRecord("alerts", a); return "lead closed"; }
  const mins = Number(c.rules?.ackMinutes) || 10;
  const owner = c.owner?.name || "the owner";
  const summary = ownerSummary(c, lead.reason, lead);
  a.step = (a.step || 0) + 1;
  let how = "";
  if (a.step === 1) {
    if (c.owner?.backupPhone) { const r = await sendSMS({ to: c.owner.backupPhone, client: c, type: "escalation", force: true, body: `${owner} has not acknowledged this in ${mins} min:\n${summary}` }); how = r.ok ? "backup texted" : r.logged ? "backup texted (logged)" : "backup skipped"; }
    else how = "backup skipped";
  } else if (a.step === 2) {
    const r = await placeCall({ to: c.owner?.phone, say: `Urgent lead from your ${c.business.name} front desk. Please check your texts. Urgent lead from your ${c.business.name} front desk. Please check your texts.` });
    how = r.ok ? "call" : "call (logged)";
  } else {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(new Date()));
    const win = hour >= 7 && hour < 19 ? (c.rules?.callbackHours || "within 30 minutes") : (c.rules?.callbackAfterHours || "by 8 am tomorrow");
    if (lead.phone) await sendSMS({ to: lead.phone, client: c, type: "fallback_window", body: `${c.business.name}: we have your request and ${owner} will call you ${win}.` });
    if (STEVE_PHONE) await sendSMS({ to: STEVE_PHONE, from: process.env.MC_TWILIO_NUMBER, body: `Unacknowledged ${a.kind} at ${c.business.name}:\n${summary}`.slice(0, 1200), force: true });
    await notifySteve(`Unacknowledged ${a.kind}: ${c.business.name}`, `${summary}\n\n${process.env.URL || ""}/desk?c=${c.slug}&k=${c.ownerKey}`);
    how = "customer told window, Steve notified";
    a.status = "exhausted";
  }
  a.history.push({ step: a.step, how, at: new Date().toISOString() });
  await saveRecord("alerts", a);
  await logEvent(c.slug, "escalated", { id: a.id, step: a.step, how });
  if (a.status === "waiting") await scheduleTask(c.slug, new Date(Date.now() + mins * 60 * 1000), "escalate", { alertId: a.id });
  return `step ${a.step}: ${how}`;
}

// ---- Confirm, reschedule, cancel request (SMS replies) ----
export async function upcomingBookings(c, phone) {
  if (!phone) return [];
  const today = visitDate("today"); today.setHours(0, 0, 0, 0);
  return (await listRecords("bookings", c.slug, 300)).filter((b) => b.phone === phone && ["booked", "on_the_way", "confirmed"].includes(b.status) && (!b.date || visitDate(b.date).getTime() >= today.getTime()));
}

export async function confirmVisit(c, b) {
  b.confirmedAt = new Date().toISOString(); b.status = b.status === "booked" ? "confirmed" : b.status; await saveRecord("bookings", b);
  await logEvent(c.slug, "confirmed", { id: b.id });
  return b;
}

export async function rescheduleVisit(c, b, date, window) {
  const old = `${b.date || ""} ${b.window}`.trim();
  b.date = esc(date) || b.date; b.window = esc(window) || b.window; b.status = "booked"; b.confirmedAt = null;
  await cancelTasks(c.slug, (t) => ["reminder_24h", "reminder_1h"].includes(t.type) && t.data?.bookingId === b.id);
  await scheduleReminders(c, b);
  try { if (b.calendarEventId) await updateEvent(c, b); } catch (e) { console.error("calendar update", e); }
  await saveRecord("bookings", b);
  await notifyOwner(c, `${c.business.name} front desk: RESCHEDULED ref ${b.id} to ${b.date && b.date !== "today" ? b.date + ", " : ""}${b.window} (was ${old}).\nCustomer: ${b.customer_name} ${b.phone}\nWhere: ${b.address}\nIssue: ${b.issue}`, { type: "owner_alert" });
  await logEvent(c.slug, "rescheduled", { id: b.id, from: old, to: `${b.date} ${b.window}` });
  return b;
}

export async function cancelRequest(c, b) {
  await notifyOwner(c, `${c.business.name} front desk: NEEDS ACTION. ${b.customer_name || b.phone} wants to cancel ref ${b.id} (${b.date || ""} ${b.window}, ${b.issue}). Reply "cancel ${b.id}" to cancel it.`, { type: "owner_alert" });
  await logEvent(c.slug, "cancel_requested", { id: b.id });
  return b;
}

// ---- Owner commands by text: ok, otw, done, quote, paid, cancel ----
export async function ownerCommand(c, text) {
  const m = String(text || "").trim().match(/^(ok|okay|done|quote|otw|cancel|paid)\s+([a-z0-9]{6,12})(?:\s+(.*))?$/i);
  if (!m) return null;
  const [, cmdRaw, id, rest] = m; const cmd = cmdRaw.toLowerCase();
  const b = (await getRecord("bookings", c.slug, id)) || (await getRecord("leads", c.slug, id));
  if (!b) return `No record ${id}. Check the ref on the summary text.`;
  const plan = PLANS[c.plan] || PLANS.growth;
  const acked = await ackAlertsFor(c, b.id);
  if (cmd === "ok" || cmd === "okay") return `Got it, ${b.customer_name || b.phone} is yours.`;
  const blocked = b.phone ? await optedOut(b.phone) : false;
  if (cmd === "otw") {
    if (blocked) return `${b.customer_name || b.phone} opted out of texts; nothing sent.`;
    const r = b.phone ? await sendSMS({ to: b.phone, client: c, type: "on_my_way", body: TEMPLATES.on_my_way(c, b) }) : { ok: false };
    b.status = "on_the_way"; await saveRecord("bookings", b);
    return r.ok || r.logged ? `On-the-way text sent to ${b.customer_name || b.phone}.` : `Could not text ${b.customer_name || b.phone} (${r.reason || r.error || "no number"}).`;
  }
  if (cmd === "done") {
    b.status = "done"; b.doneAt = new Date().toISOString(); await saveRecord("bookings", b);
    await cancelTasks(c.slug, (t) => ["reminder_24h", "reminder_1h"].includes(t.type) && t.data?.bookingId === b.id);
    if (plan.followUp && b.phone && !blocked) {
      await scheduleTask(c.slug, new Date(Date.now() + 2 * H), "review_request", { bookingId: b.id });
      await scheduleTask(c.slug, new Date(Date.now() + 50 * H), "review_nudge", { bookingId: b.id });
      await scheduleTask(c.slug, new Date(Date.now() + 3 * D), "payment_reminder", { bookingId: b.id });
      await scheduleTask(c.slug, new Date(Date.now() + 7 * D), "payment_reminder", { bookingId: b.id });
      await scheduleTask(c.slug, new Date(Date.now() + 8 * D), "referral_ask", { bookingId: b.id });
      return `Marked done. Review request goes out in 2 hours, a nudge in 2 days if they do not reply. Text "paid ${b.id}" when paid, or payment reminders go out on day 3 and 7.`;
    }
    return `Marked done.`;
  }
  if (cmd === "quote") {
    b.status = "quoted"; b.quotedAt = new Date().toISOString(); if (rest) b.amount = rest; await saveRecord("bookings", b);
    if (plan.followUp && b.phone && !blocked) { await scheduleTask(c.slug, new Date(Date.now() + 14 * D), "quote_check", { bookingId: b.id }); return `Quote logged. Day-14 check scheduled for ${b.customer_name || b.phone}.`; }
    return `Quote logged.`;
  }
  if (cmd === "paid") {
    b.status = "paid"; await saveRecord("bookings", b); await cancelTasks(c.slug, (t) => t.type === "payment_reminder" && t.data?.bookingId === b.id);
    return `Marked paid.`;
  }
  if (cmd === "cancel") {
    b.status = "cancelled"; await saveRecord("bookings", b); await cancelTasks(c.slug, (t) => t.data?.bookingId === b.id || t.data?.leadId === b.id);
    if (b.phone && !blocked && b.window) await sendSMS({ to: b.phone, client: c, type: "cancelled", body: `${c.business.name}: your visit (${b.date || ""} ${b.window}) is cancelled as requested. Text us any time to rebook.` });
    return `Cancelled ${id}, reminders stopped.${acked ? "" : ""}`;
  }
  return null;
}

// ---- Line health and digests ----
const houstonDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso));

export function lineHealth(c, events = []) {
  const latest = (types) => { const e = events.filter((x) => types.includes(x.type)).map((x) => x.at).sort().pop(); return e || null; };
  const since = Date.now() - D;
  const errors24h = events.filter((x) => ["sms_failed", "sms_agent_failed", "vapi_tool_failed", "task_error", "build_failed"].includes(x.type) && new Date(x.at).getTime() > since).length;
  const own = c.phone?.twilioNumber && c.phone?.tenDlc === "approved";
  const sender = own ? "own" : (process.env.MC_MESSAGING_SERVICE_SID || process.env.MC_TWILIO_NUMBER) ? "bridge" : "none";
  return {
    lastInboundCall: latest(["missed_call", "call_forwarded", "call_ended", "call_while_paused", "call_passthrough"]),
    lastInboundText: latest(["sms_inbound", "sms_reply"]),
    lastOutboundText: events.filter((x) => x.type === "sms_sent" && x.data?.ok).map((x) => x.at).sort().pop() || null,
    errors24h, sender, tenDlc: c.phone?.tenDlc || "not_started", forwardingVerified: !!c.phone?.forwardingVerified,
  };
}

export async function dailyDigest(c, events) {
  const today = houstonDay(new Date().toISOString());
  const sameDay = (r) => houstonDay(r.createdAt || r.at) === today;
  const bookings = (await listRecords("bookings", c.slug, 300)).filter(sameDay);
  const leads = (await listRecords("leads", c.slug, 300)).filter(sameDay);
  const convs = (await (await import("./store.mjs")).listJSON("conversations", c.slug + "/", 200)).filter((v) => v.flag && houstonDay(v.flag.at) === today);
  const ev = events || (await listRecords("events", c.slug, 300));
  const h = lineHealth(c, ev);
  const t = (iso) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "none");
  const needs = leads.filter((l) => l.outcome === "needs_action" && l.status === "open");
  const emergencies = leads.filter((l) => l.urgency === "emergency").length + bookings.filter((b) => b.urgency === "emergency").length;
  const wants = leads.filter((l) => l.outcome === "wants_call").length;
  const spam = leads.filter((l) => l.outcome === "spam").length;
  const name = c.business.name;
  if (!bookings.length && !leads.length && !convs.length) return { text: `${name}: nothing today. Line OK, last call ${t(h.lastInboundCall)}, errors ${h.errors24h}.`, email: `${name}: nothing today.\nLast call: ${t(h.lastInboundCall)}. Last text: ${t(h.lastInboundText)}. Errors: ${h.errors24h}.` };
  const text = `${name}, today: ${bookings.length} booked${bookings.length ? " (" + bookings.map((b) => b.id).join(", ") + ")" : ""}, ${needs.length} leads need action${needs.length ? " (" + needs.map((l) => l.id).join(", ") + ")" : ""}, ${emergencies} emergencies, ${wants} wants a call, ${spam} spam. Flagged: ${convs.length}${convs.length ? " (" + (convs[0].flag.note || "").slice(0, 60) + ")" : ""}. Line: last call ${t(h.lastInboundCall)}, last text ${t(h.lastInboundText)}, errors ${h.errors24h}.`;
  const email = [`${name}: today's front desk`, "",
    ...bookings.map((b) => `Booked ${b.id}: ${b.customer_name} ${b.phone}, ${b.date || ""} ${b.window}, ${b.issue}${b.unsure ? " (unsure: " + b.unsure + ")" : ""}`),
    ...leads.filter((l) => l.outcome !== "spam").map((l) => `${OUTCOME[l.outcome] || l.outcome} ${l.id}: ${l.customer_name || "no name"} ${l.phone}, ${l.issue}${l.urgency === "emergency" ? " EMERGENCY" : ""}`),
    spam ? `Spam: ${spam}` : "",
    ...convs.map((v) => `Flagged (${v.channel} ${v.contact}): ${v.flag.note || ""}`),
    "", `Line: last call ${t(h.lastInboundCall)}, last text ${t(h.lastInboundText)}, last text delivered ${t(h.lastOutboundText)}, errors in 24 h ${h.errors24h}.`].filter((x) => x !== "").join("\n");
  return { text, email };
}

export async function weeklyDigest(c) {
  const since = Date.now() - 7 * D;
  const bookings = (await listRecords("bookings", c.slug, 500)).filter((b) => new Date(b.createdAt).getTime() > since);
  const leads = (await listRecords("leads", c.slug, 500)).filter((l) => new Date(l.createdAt).getTime() > since);
  const emergencies = leads.filter((l) => l.urgency === "emergency").length + bookings.filter((b) => b.urgency === "emergency").length;
  return `${c.business.name}, last 7 days: ${bookings.length} booked, ${leads.length} leads handed to you, ${emergencies} emergencies. ${bookings.filter((b) => b.status === "done").length} marked done.`;
}
