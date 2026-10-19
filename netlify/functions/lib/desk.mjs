// What happens when the front desk books a visit or flags a lead for a real client:
// records, owner alerts, calendar, and the follow-up timers that match the plan.
import { addRecord, saveRecord, getRecord, scheduleTask, cancelTasks, logEvent, listRecords } from "./store.mjs";
import { notifyOwner, sendSMS, e164 } from "./send.mjs";
import { createEvent, visitDate, windowHours, houstonISO } from "./calendar.mjs";
import { PLANS } from "./config.mjs";

const H = 3600 * 1000, D = 24 * H;
const esc = (s) => String(s || "").trim();

export function reviewLink(c) {
  if (c.business?.googlePlaceId) return `https://search.google.com/local/writereview?placeid=${c.business.googlePlaceId}`;
  return c.business?.reviewLink || "";
}

export const TEMPLATES = {
  reminder_24h: (c, b) => `Reminder from ${c.business.name}: your visit is tomorrow, ${b.window}. Reply R to reschedule or C to confirm.`,
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

export function ownerSummary(c, kind, r) {
  const lines = [`${c.business.name} front desk, ${kind}${r.urgency === "emergency" ? " EMERGENCY" : ""}`];
  if (r.customer_name) lines.push(`Customer: ${r.customer_name}`);
  if (r.phone) lines.push(`Phone: ${r.phone}`);
  if (r.address) lines.push(`Where: ${r.address}`);
  if (r.issue) lines.push(`Issue: ${r.issue}`);
  if (r.window) lines.push(`Window: ${r.date && r.date !== "today" ? r.date + ", " : ""}${r.window}`);
  if (r.reason && kind !== "booking") lines.push(`Why: ${r.reason}`);
  if (r.language === "es") lines.push("Language: Spanish");
  if (r.notes) lines.push(`Notes: ${r.notes}`);
  if (r.id) lines.push(`Ref ${r.id}. Reply "otw ${r.id}" when on the way, "done ${r.id}" when finished, "quote ${r.id}" if you sent a quote.`);
  return lines.join("\n");
}

export async function bookVisit(c, input, ctx = {}) {
  const b = await addRecord("bookings", c.slug, {
    customer_name: esc(input.customer_name), phone: e164(input.phone) || esc(input.phone), address: esc(input.address), issue: esc(input.issue),
    date: esc(input.date), window: esc(input.window), urgency: input.urgency, language: input.language, notes: esc(input.notes),
    channel: ctx.channel || "web", status: "booked",
  });
  // calendar
  try { const ev = await createEvent(c, b); if (ev) { b.calendarEventId = ev.id; b.calendarLink = ev.link; await saveRecord("bookings", b); } } catch (e) { console.error("calendar", e); }
  // reminders (only when we know the day)
  if (b.date) {
    const day = visitDate(b.date); const { start } = windowHours(b.window);
    const startAt = new Date(houstonISO(day, start)).getTime();
    if (startAt - D > Date.now()) await scheduleTask(c.slug, new Date(startAt - D), "reminder_24h", { bookingId: b.id });
    if (startAt - H > Date.now()) await scheduleTask(c.slug, new Date(startAt - H), "reminder_1h", { bookingId: b.id });
  }
  // customer confirmation by text when we have a number to send from
  if (c.phone?.twilioNumber && b.phone && ctx.channel !== "sms") {
    await sendSMS({ to: b.phone, from: c.phone.twilioNumber, body: `${c.business.name}: you're booked for ${b.date && b.date !== "today" ? b.date + ", " : ""}${b.window}. We'll text a reminder and again when the tech is on the way. Reply here with any changes.` });
  }
  await notifyOwner(c, ownerSummary(c, "booking", b));
  await logEvent(c.slug, "booking", { id: b.id, channel: ctx.channel });
  return b;
}

export async function flagLead(c, input, ctx = {}) {
  const l = await addRecord("leads", c.slug, {
    customer_name: esc(input.customer_name), phone: e164(input.phone) || esc(input.phone), address: esc(input.address), issue: esc(input.issue),
    reason: input.reason, urgency: input.urgency, language: input.language, channel: ctx.channel || "web", status: "open",
  });
  await notifyOwner(c, ownerSummary(c, input.reason === "emergency" || input.urgency === "emergency" ? "emergency" : input.reason || "lead", l));
  // quiet-lead chase on plans with follow-up, only when we can text them
  if (PLANS[c.plan]?.followUp && c.phone?.twilioNumber && l.phone && input.reason === "lead") {
    await scheduleTask(c.slug, new Date(Date.now() + 4 * H), "lead_chase", { leadId: l.id, n: 1 });
    await scheduleTask(c.slug, new Date(Date.now() + 26 * H), "lead_chase", { leadId: l.id, n: 2 });
    await scheduleTask(c.slug, new Date(Date.now() + 48 * H), "lead_chase", { leadId: l.id, n: 3 });
  }
  await logEvent(c.slug, "lead", { id: l.id, reason: input.reason, channel: ctx.channel });
  return l;
}

// Owner texted "done <id>", "quote <id>", "otw <id>", "cancel <id>".
export async function ownerCommand(c, text) {
  const m = String(text || "").trim().match(/^(done|quote|otw|cancel|paid)\s+([a-z0-9]{6,12})(?:\s+(.*))?$/i);
  if (!m) return null;
  const [, cmdRaw, id, rest] = m; const cmd = cmdRaw.toLowerCase();
  const b = (await getRecord("bookings", c.slug, id)) || (await getRecord("leads", c.slug, id));
  if (!b) return `No record ${id}. Check the ref on the summary text.`;
  const plan = PLANS[c.plan] || PLANS.growth;
  const canText = c.phone?.twilioNumber && b.phone;
  if (cmd === "otw") {
    if (canText) await sendSMS({ to: b.phone, from: c.phone.twilioNumber, body: TEMPLATES.on_my_way(c, b) });
    b.status = "on_the_way"; await saveRecord("bookings", b);
    return `On-the-way text sent to ${b.customer_name || b.phone}.`;
  }
  if (cmd === "done") {
    b.status = "done"; b.doneAt = new Date().toISOString(); await saveRecord("bookings", b);
    await cancelTasks(c.slug, (t) => t.data?.bookingId === b.id);
    if (plan.followUp && canText) {
      await scheduleTask(c.slug, new Date(Date.now() + 2 * H), "review_request", { bookingId: b.id });
      await scheduleTask(c.slug, new Date(Date.now() + 50 * H), "review_nudge", { bookingId: b.id });
      await scheduleTask(c.slug, new Date(Date.now() + 8 * D), "referral_ask", { bookingId: b.id });
      return `Marked done. Review request goes out in 2 hours, a nudge in 2 days if they do not reply. Text "paid ${b.id}" when paid, or payment reminders go out on day 3 and 7.`;
    }
    return `Marked done.`;
  }
  if (cmd === "quote") {
    b.status = "quoted"; b.quotedAt = new Date().toISOString(); if (rest) b.amount = rest; await saveRecord("bookings", b);
    if (plan.followUp && canText) { await scheduleTask(c.slug, new Date(Date.now() + 14 * D), "quote_check", { bookingId: b.id }); return `Quote logged. Day-14 check scheduled for ${b.customer_name || b.phone}.`; }
    return `Quote logged.`;
  }
  if (cmd === "paid") {
    b.status = "paid"; await saveRecord("bookings", b); await cancelTasks(c.slug, (t) => t.type === "payment_reminder" && t.data?.bookingId === b.id);
    return `Marked paid.`;
  }
  if (cmd === "cancel") {
    b.status = "cancelled"; await saveRecord("bookings", b); await cancelTasks(c.slug, (t) => t.data?.bookingId === b.id || t.data?.leadId === b.id);
    return `Cancelled ${id}, reminders stopped.`;
  }
  return null;
}

// Weekly digest text for the owner (Pro) or Steve.
export async function weeklyDigest(c) {
  const since = Date.now() - 7 * D;
  const bookings = (await listRecords("bookings", c.slug, 500)).filter((b) => new Date(b.createdAt).getTime() > since);
  const leads = (await listRecords("leads", c.slug, 500)).filter((l) => new Date(l.createdAt).getTime() > since);
  const emergencies = leads.filter((l) => l.urgency === "emergency").length + bookings.filter((b) => b.urgency === "emergency").length;
  return `${c.business.name}, last 7 days: ${bookings.length} booked, ${leads.length} leads handed to you, ${emergencies} emergencies. ${bookings.filter((b) => b.status === "done").length} marked done.`;
}
