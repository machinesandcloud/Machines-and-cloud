// What happens when the front desk books a visit or flags a lead for a real client:
// records, owner alerts (job tickets), acknowledge-and-escalate, calendar, confirm and
// reschedule by reply, the follow-up timers that match the plan, the daily digest, line health.
import { addRecord, saveRecord, getRecord, scheduleTask, cancelTasks, logEvent, listRecords, list, get, del, put, getConversation, saveConversation } from "./store.mjs";
import { notifyOwner, sendSMS, sendEmail, notifySteve, e164, optedOut, placeCall, STEVE_PHONE } from "./send.mjs";
import { createEvent, updateEvent, visitDate, windowHours, houstonISO, normalizeDate, friendlyDate } from "./calendar.mjs";
import { PLANS, isBusinessHours, houstonNow, normalizeHours, NOBOOK_REASONS, opensLaterToday, tradeKey } from "./config.mjs";
import { getUsage, usageView } from "./usage.mjs";

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

// Spanish set, chosen when the record's language is "es". Drafted by the model; a Spanish speaker
// Steve names reviews them before the first Spanish-speaking customer goes live (DECISIONS.md).
// "8 to 12" -> "8 a 12", "tomorrow" -> "mañana", "today" -> "hoy", weekday names translated.
const DAYS_ES = { monday: "lunes", tuesday: "martes", wednesday: "miércoles", thursday: "jueves", friday: "viernes", saturday: "sábado", sunday: "domingo" };
export const winEs = (w) => String(w || "").replace(/\s+to\s+/gi, " a ").replace(/\b(\d{1,2})\s*(am)\b/gi, "$1 de la mañana").replace(/\b(\d{1,2})\s*(pm)\b/gi, "$1 de la tarde");
export const dateEs = (d) => { const t = String(d || "").toLowerCase().trim(); if (!t || t === "today") return "hoy"; if (t === "tomorrow") return "mañana"; if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return friendlyDate(t, "es"); for (const [en, es] of Object.entries(DAYS_ES)) if (t.startsWith(en.slice(0, 3))) return "el " + es; return t; };
export const when = (b) => `${b.date ? friendlyDate(b.date) + ", " : ""}${b.window}`;
export const TEMPLATES_ES = {
  reminder_24h: (c, b) => `Recordatorio de ${c.business.name}: su visita es mañana, ${winEs(b.window)}. Responda C para confirmar o R para cambiar la hora.`,
  reminder_1h: (c, b) => `${c.business.name}: su ventana de llegada (${winEs(b.window)}) empieza pronto. Responda aquí si algo cambió.`,
  on_my_way: (c, b) => `${c.business.name}: el técnico va en camino a ${b.address}. Por favor asegure a sus mascotas y despeje el área.${b.notes ? " Nota: " + b.notes : ""}`,
  review_request: (c, j) => `Gracias por elegir ${c.business.name}${j.customer_name ? ", " + j.customer_name.split(" ")[0] : ""}. ¿Cómo lo hicimos? Una reseña rápida en Google ayuda mucho a un negocio pequeño: ${reviewLink(c) || "(enlace de reseña)"}. Responda aquí si algo no estuvo bien.`,
  review_nudge: (c, j) => `${c.business.name}: si tiene 30 segundos, nos encantaría una reseña: ${reviewLink(c) || "(enlace de reseña)"}. Gracias.`,
  quote_check: (c, j) => `${c.business.name}: le escribimos sobre la cotización que le enviamos${j.issue ? " para " + j.issue : ""}. ¿Quiere que la cerremos o la dejamos abierta? Responda y nos encargamos.`,
  payment_reminder: (c, j) => `${c.business.name}: un recordatorio amable de que la factura${j.amount ? " por " + j.amount : ""} sigue pendiente. ${c.business.payLink ? "Pague aquí: " + c.business.payLink : "Responda aquí con cualquier pregunta."}`,
  referral_ask: (c, j) => `${c.business.name}: gracias de nuevo. Si un vecino necesita ayuda, le agradeceríamos la recomendación. Solo pídale que escriba a este número.`,
  lead_chase: (c, l, n) => n === 1
    ? `Hola${l.customer_name ? " " + l.customer_name.split(" ")[0] : ""}, le escribe ${c.business.name}. Vimos su solicitud${l.issue ? " sobre " + l.issue : ""}. ¿Todavía necesita ayuda? Responda con una hora que le convenga y lo agendamos.`
    : n === 2 ? `${c.business.name}: tenemos espacio ${(c.windows || [])[0] ? "(" + c.windows.map(winEs).join(" o ") + ")" : "esta semana"}. ¿Le interesa?`
    : `${c.business.name}: última nota de nuestra parte. Si todavía necesita ayuda, responda cuando quiera y lo atendemos.`,
};
export const STRINGS = {
  en: {
    confirmation: (c, b) => `${c.business.name}: you're booked for ${when(b)}. We'll text a reminder and again when the tech is on the way. Reply R to reschedule. Reply STOP to opt out.`,
    fallback_window: (c, owner, win) => `${c.business.name}: we have your request and ${owner} will call you ${win}.`,
    cancelled: (c, b) => `${c.business.name}: your visit (${when(b)}) is cancelled as requested. Text us any time to rebook.`,
  },
  es: {
    confirmation: (c, b) => `${c.business.name}: su visita queda agendada para ${dateEs(b.date)}, ${winEs(b.window)}. Le enviaremos un recordatorio y otro mensaje cuando el técnico vaya en camino. Responda R para cambiar la hora. Responda STOP o ALTO para no recibir más mensajes.`,
    fallback_window: (c, owner, win) => `${c.business.name}: recibimos su solicitud y ${owner} le llamará ${win}.`,
    cancelled: (c, b) => `${c.business.name}: su visita (${dateEs(b.date)}, ${winEs(b.window)}) queda cancelada como pidió. Escríbanos cuando quiera para agendar de nuevo.`,
  },
};
// Marketing texts (the maintenance reminder) need a separate written yes; the ask goes once, after a
// positive review reply, only when the owner has switched it on.
STRINGS.en.consent_ask = (c) => `${c.business.name}: want a text when your next tune-up is due? Reply YES. Nothing else changes.`;
STRINGS.es.consent_ask = (c) => `${c.business.name}: ¿quiere un mensaje cuando toque su próximo mantenimiento? Responda SÍ. Nada más cambia.`;
STRINGS.en.consent_yes = (c) => `${c.business.name}: thanks, we will text you when your next tune-up is due. Reply STOP any time.`;
STRINGS.es.consent_yes = (c) => `${c.business.name}: gracias, le escribiremos cuando toque su próximo mantenimiento. Responda STOP o ALTO cuando quiera.`;
TEMPLATES.maintenance_reminder = (c, j) => `${c.business.name}: it has been about six months since your last visit${j.issue ? " (" + j.issue + ")" : ""}. A tune-up keeps the system running through the season. Reply here with a day and we will fit you in. Reply STOP to end these.`;
TEMPLATES_ES.maintenance_reminder = (c, j) => `${c.business.name}: ya pasaron unos seis meses desde su última visita${j.issue ? " (" + j.issue + ")" : ""}. Un mantenimiento mantiene el sistema funcionando toda la temporada. Responda con un día y lo agendamos. Responda STOP o ALTO para no recibir más.`;
export const customerKey = (slug, phone) => `${slug}/${phone}`;
export const getCustomer = async (slug, phone) => (await get("customers", customerKey(slug, phone))) || { slug, phone };
export const saveCustomer = (rec) => put("customers", customerKey(rec.slug, rec.phone), { ...rec, updatedAt: new Date().toISOString() });
export async function runConsentAsk(c, task) {
  const phone = task.data?.phone; if (!phone) return "no number";
  const cust = await getCustomer(c.slug, phone);
  if (cust.marketingConsent) return "already consented";
  if (cust.consentAskedAt) return "already asked";
  const b = task.data?.bookingId ? await getRecord("bookings", c.slug, task.data.bookingId) : null;
  const wording = str("consent_ask", b || {})(c);
  const r = await sendSMS({ to: phone, client: c, type: "consent_ask", body: wording });
  if (!(r.ok || r.logged)) return "send failed";
  cust.consentAskedAt = new Date().toISOString(); cust.consentWording = wording; cust.language = b?.language || "en";
  await saveCustomer(cust);
  const conv = await getConversation(c.slug, "sms", phone); conv.messages.push({ role: "assistant", content: wording, at: new Date().toISOString(), system: "consent_ask" }); await saveConversation(conv);
  await logEvent(c.slug, "consent_asked", { phone, id: b?.id });
  return r.ok ? "sent" : "logged";
}
// A YES or SI from a number asked inside the last 7 days: store the consent record. Returns the reply or null.
export async function noteConsentReply(c, phone, text, conv) {
  if (!/^\s*(yes|yeah|yep|si|sí|claro)\s*[.!]*\s*$/i.test(text)) return null;
  // Only when the consent ask is the last thing we sent: a yes to a reminder or a window offer is not consent.
  const lastOut = [...(conv?.messages || [])].reverse().find((m) => m.role === "assistant");
  if (!lastOut || lastOut.system !== "consent_ask") return null;
  const cust = await getCustomer(c.slug, phone);
  if (!cust.consentAskedAt || cust.marketingConsent) return null;
  if (Date.now() - new Date(cust.consentAskedAt).getTime() > 7 * D) return null;
  cust.marketingConsent = { at: new Date().toISOString(), channel: "sms", wording: cust.consentWording, reply: text.trim().slice(0, 40), number: c.phone?.twilioNumber || process.env.MC_TWILIO_NUMBER || "" };
  await saveCustomer(cust);
  await logEvent(c.slug, "marketing_consent", { phone });
  return str("consent_yes", { language: cust.language })(c);
}

export const lang = (rec) => (rec?.language === "es" ? "es" : "en");
export const template = (type, rec) => (lang(rec) === "es" ? TEMPLATES_ES : TEMPLATES)[type];
export const str = (key, rec) => STRINGS[lang(rec)][key];

const OUTCOME = { booked: "BOOKED", needs_action: "NEEDS ACTION", took_message: "TOOK MESSAGE", wants_call: "WANTS A CALL", spam: "SPAM", rescheduled: "RESCHEDULED", cancel_request: "NEEDS ACTION" };
const outcomeFor = (reason) => ({ lead: "needs_action", handoff: "needs_action", emergency: "needs_action", question: "took_message", wants_call: "wants_call", spam: "spam" }[reason] || "needs_action");

// "Existing customer" means a visit that happened: marked done or paid, or dated before today and
// not cancelled. Leads, spam records, and future bookings do not count.
export async function customerType(slug, phone, at) {
  if (!phone) return "new";
  const today = at ? new Date(new Date(at).toLocaleString("en-US", { timeZone: "America/Chicago" })) : visitDate("today"); today.setHours(0, 0, 0, 0);
  const recs = await listRecords("bookings", slug, 300);
  const had = recs.some((b) => b.phone === phone && (["done", "paid"].includes(b.status) || (b.date && b.status !== "cancelled" && bookingDay(b).getTime() < today.getTime())));
  return had ? "existing" : "new";
}

// The owner's cell is the forwarded line when it is the business number, or when all calls are
// forwarded and no separate transfer phone was given. Calling it would bounce into the front desk.
export function cellIsForwardedLine(c) {
  const p = c.phone || {}, o = c.owner || {};
  if (o.phone && p.businessNumber && o.phone === p.businessNumber) return true;
  if (p.forwarding === "all" && !p.transferTo) return true;
  return false;
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
  if (r.window) lines.push(`Window: ${when(r)}`);
  else if (r.wanted) lines.push(`Wants: ${r.wanted}`);
  if (r.notes) lines.push(`Access: ${r.notes}`);
  if (r.language === "es") lines.push("Language: Spanish");
  if (r.unsure) lines.push(`Unsure about: ${r.unsure}`);
  if (r.id) lines.push(`Ref ${r.id}. ${askFor(kind, r)}`);
  return lines.join("\n");
}
// Each alert asks for exactly one reply.
function askFor(kind, r) {
  if (kind === "booking" || r.outcome === "booked") return `Reply "otw ${r.id}" when you are on the way.`;
  if (r.reason === "wants_call" || r.reason === "handoff") return `Reply "called ${r.id}" once you have reached them.`;
  return `Reply "ok ${r.id}" to acknowledge.`;
}

// Quiet hours for follow-up texts (Texas Business and Commerce Code ch. 304 hours): 9 am to 9 pm
// Monday to Saturday, noon to 9 pm Sunday, Houston time. A due time inside quiet hours moves to the
// next opening minute. Visit confirmations, reminders, on-the-way texts, text-backs, and live replies
// are exempt; only the scheduled follow-ups below go through this.
export const FOLLOW_UP_TYPES = ["review_request", "review_nudge", "quote_check", "lead_chase", "referral_ask", "payment_reminder", "consent_ask", "maintenance_reminder"];
const HOU = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, x.value])); return { day: p.weekday, hour: Number(p.hour) % 24, minute: Number(p.minute) }; };
export function nextOpenTime(at) {
  let t = new Date(at);
  for (let i = 0; i < 8; i++) {
    const { day, hour, minute } = HOU(t);
    const open = day === "Sun" ? 12 : 9, close = 21;
    const mins = hour * 60 + minute;
    if (mins >= open * 60 && mins < close * 60) return t;
    // Before opening: move forward to the opening minute today. After closing: to the next day's opening.
    const forward = mins < open * 60 ? (open * 60 - mins) : (24 * 60 - mins) + (HOU(new Date(t.getTime() + (24 * 60 - mins) * 60000)).day === "Sun" ? 12 : 9) * 60;
    t = new Date(t.getTime() + forward * 60000);
  }
  return t;
}
export async function scheduleFollowUp(c, at, type, data) {
  const due = FOLLOW_UP_TYPES.includes(type) ? nextOpenTime(at) : new Date(at);
  return scheduleTask(c.slug, due, type, data);
}

async function scheduleReminders(c, b) {
  if (!b.date) return;
  const day = bookingDay(b); const { start } = windowHours(b.window);
  const startAt = new Date(houstonISO(day, start)).getTime();
  if (startAt - D > Date.now()) await scheduleTask(c.slug, new Date(startAt - D), "reminder_24h", { bookingId: b.id });
  if (startAt - H > Date.now()) await scheduleTask(c.slug, new Date(startAt - H), "reminder_1h", { bookingId: b.id });
  // The morning after the window: ask the owner whether it happened, once, so "done" is not forgotten.
  const next = new Date(day); next.setDate(next.getDate() + 1);
  await scheduleTask(c.slug, new Date(houstonISO(next, 9)), "visit_check", { bookingId: b.id });
}
export async function runVisitCheck(c, task) {
  const b = await getRecord("bookings", c.slug, task.data?.bookingId);
  if (!b) return "no booking";
  if (!["booked", "on_the_way", "confirmed"].includes(b.status)) return b.status;
  if (b.visitCheckedAt) return "already asked";
  b.visitCheckedAt = new Date().toISOString(); await saveRecord("bookings", b);
  await notifyOwner(c, `${c.business.name} front desk: Did the visit for ${b.customer_name || b.phone} at ${b.address || "their address"} (${when(b)}) happen? Reply "done ${b.id}" if it did, or "cancel ${b.id}" if it did not.`, { type: "owner_note" });
  await logEvent(c.slug, "visit_check", { id: b.id });
  return "asked";
}

export async function bookVisit(c, input, ctx = {}) {
  const phone = e164(input.phone) || esc(input.phone);
  const b = await addRecord("bookings", c.slug, {
    customer_name: esc(input.customer_name), phone, address: esc(input.address), issue: esc(input.issue),
    date: normalizeDate(esc(input.date)), dateSaid: esc(input.date), window: esc(input.window), urgency: input.urgency, language: input.language, notes: esc(input.notes), unsure: esc(input.unsure),
    channel: ctx.channel || "web", status: "booked", outcome: "booked", customerType: await customerType(c.slug, phone),
  });
  try { const ev = await createEvent(c, b); if (ev) { b.calendarEventId = ev.id; b.calendarLink = ev.link; } } catch (e) { console.error("calendar", e); }
  await scheduleReminders(c, b);
  // consent: told at booking, recorded on the booking
  const { consentLine } = await import("./config.mjs");
  b.consent = { at: new Date().toISOString(), channel: ctx.channel || "web", phone: b.phone, wording: consentLine(c) };
  await saveRecord("bookings", b);
  if (b.phone && ctx.channel !== "sms") {
    await sendSMS({ to: b.phone, client: c, type: "confirmation", body: str("confirmation", b)(c, b) });
  }
  await notifyOwner(c, ownerSummary(c, "booking", b), { type: "owner_alert" });
  await logEvent(c.slug, "booking", { id: b.id, channel: ctx.channel });
  // A customer who books no longer needs a callback: close their open leads from the last 24 hours.
  const since = Date.now() - D;
  for (const l of (await listRecords("leads", c.slug, 200)).filter((l) => l.status === "open" && new Date(l.createdAt).getTime() > since && ((b.phone && l.phone === b.phone) || (ctx.contact && l.contact === ctx.contact)))) {
    l.status = "booked"; l.bookingId = b.id; await saveRecord("leads", l);
    await ackAlertsFor(c, l.id, "booking");
    await logEvent(c.slug, "lead_closed", { id: l.id, by: "booking", bookingId: b.id });
  }
  return b;
}

// A repeat notify_owner for the same customer within 30 minutes updates the open lead instead of
// opening a second one (and a second escalation chain).
async function recentOpenLead(c, phone, contact) {
  const cutoff = Date.now() - 30 * 60 * 1000;
  const leads = (await listRecords("leads", c.slug, 200)).filter((l) => l.status === "open" && new Date(l.createdAt).getTime() > cutoff);
  return leads.reverse().find((l) => (phone && l.phone === phone) || (contact && l.contact === contact)) || null;
}

// The promise the front desk makes in the owner's name, and when it comes due.
export function callbackPromise(c, at) {
  if (isBusinessHours(c, at)) return c.rules?.callbackHours || "within 30 minutes";
  const o = opensLaterToday(c, at);
  if (o) return `when we open at ${o.label} this morning`;
  return c.rules?.callbackAfterHours || "by 8 am tomorrow";
}
export function callbackDue(phrase, at, c) {
  const now = at ? new Date(at) : new Date();
  const t = String(phrase || "").toLowerCase();
  let m;
  if (/when we open at/.test(t) && c) { const o = opensLaterToday(c, at); if (o) return o.at; }
  if ((m = t.match(/(\d+)\s*(?:min|minute)/))) return new Date(now.getTime() + Number(m[1]) * 60000);
  if (/(within|in) (the|an|one) hour/.test(t)) return new Date(now.getTime() + 60 * 60000);
  if ((m = t.match(/(\d+)\s*(?:hr|hour)/))) return new Date(now.getTime() + Number(m[1]) * 3600000);
  if ((m = t.match(/by\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/))) {
    let h = Number(m[1]); const min = Number(m[2] || 0); const ap = m[3];
    if (ap === "pm" && h < 12) h += 12; if (ap === "am" && h === 12) h = 0;
    const hn = houstonNow(now); let target = h * 60 + min;
    let delta = target - hn.minutes;
    if (delta <= 0 || /tomorrow|next/.test(t)) delta += 24 * 60;
    return new Date(now.getTime() + delta * 60000);
  }
  if (/tomorrow|next business day/.test(t)) return new Date(now.getTime() + 18 * 3600000);
  return new Date(now.getTime() + 60 * 60000);
}
async function trackCallback(c, lead) {
  const promise = callbackPromise(c);
  lead.callbackPromise = promise; lead.callbackDueAt = callbackDue(promise, undefined, c).toISOString(); lead.overdueAt = null;
  await cancelTasks(c.slug, (t) => t.type === "callback_check" && t.data?.leadId === lead.id);
  await scheduleTask(c.slug, new Date(lead.callbackDueAt), "callback_check", { leadId: lead.id });
}
// The scheduler runs this at callbackDueAt.
export async function runCallbackCheck(c, task) {
  const l = await getRecord("leads", c.slug, task.data?.leadId);
  if (!l) return "no lead";
  if (l.calledAt) return "called";
  if (l.ackedAt) return "acked";
  if (l.status !== "open") return "lead closed";
  l.overdueAt = new Date().toISOString(); await saveRecord("leads", l);
  const at = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(l.createdAt));
  await notifyOwner(c, `${c.business.name} front desk: Overdue callback. ${l.customer_name || "A customer"} ${l.phone} was promised a call ${l.callbackPromise || ""} at ${at}${l.issue ? " about " + l.issue : ""}. Reply "called ${l.id}" when you have reached them.`, { type: "owner_note" });
  await logEvent(c.slug, "callback_overdue", { id: l.id });
  return "overdue";
}

export async function flagLead(c, input, ctx = {}) {
  const phone = e164(input.phone) || esc(input.phone);
  const reason = input.reason || "lead";
  const prior = reason === "spam" ? null : await recentOpenLead(c, phone, ctx.contact);
  if (prior) {
    const changed = [];
    for (const k of ["customer_name", "phone", "address", "issue", "wanted", "unsure"]) { const v = k === "phone" ? phone : esc(input[k]); if (v && v !== prior[k]) { prior[k] = v; changed.push(k); } }
    const ct = await customerType(c.slug, prior.phone); if (ct !== prior.customerType) { prior.customerType = ct; changed.push("customer"); }
    const escalate = (reason === "emergency" || input.urgency === "emergency") && prior.urgency !== "emergency";
    if (escalate) { prior.urgency = "emergency"; prior.reason = "emergency"; prior.outcome = "needs_action"; changed.push("urgency"); }
    if (reason === "wants_call" && prior.reason !== "wants_call") { prior.reason = "wants_call"; prior.outcome = "wants_call"; changed.push("reason"); await trackCallback(c, prior); }
    if (input.nobook_reason && input.nobook_reason !== "none" && input.nobook_reason !== prior.nobook_reason) prior.nobook_reason = input.nobook_reason;
    await saveRecord("leads", prior);
    if (changed.length) await notifyOwner(c, `UPDATE ref ${prior.id} (${changed.join(", ")}):\n` + ownerSummary(c, prior.reason, prior), { type: "owner_alert" });
    const waiting = (await listRecords("alerts", c.slug, 100)).some((a) => a.leadId === prior.id && a.status === "waiting");
    if (!waiting && (prior.urgency === "emergency" || prior.reason === "wants_call")) await openAlert(c, prior, prior.reason === "wants_call" ? "wants_call" : "emergency");
    await logEvent(c.slug, "lead_updated", { id: prior.id, changed, channel: ctx.channel });
    return prior;
  }
  const l = await addRecord("leads", c.slug, {
    customer_name: esc(input.customer_name), phone, address: esc(input.address), issue: esc(input.issue),
    reason, urgency: input.urgency, wanted: esc(input.wanted), language: input.language, unsure: esc(input.unsure), nobook_reason: NOBOOK_REASONS.includes(input.nobook_reason) ? input.nobook_reason : "none",
    channel: ctx.channel || "web", contact: ctx.contact || "", status: reason === "spam" ? "spam" : "open", outcome: outcomeFor(reason), customerType: await customerType(c.slug, phone),
  });
  if (reason !== "spam") {
    if (reason === "wants_call" || reason === "handoff") { await trackCallback(c, l); await saveRecord("leads", l); }
    await notifyOwner(c, ownerSummary(c, reason, l), { type: "owner_alert" });
    const urgent = reason === "emergency" || reason === "wants_call" || input.urgency === "emergency";
    if (urgent) await openAlert(c, l, reason === "wants_call" ? "wants_call" : "emergency");
    if (PLANS[c.plan]?.followUp && l.phone && reason === "lead") {
      await scheduleFollowUp(c, new Date(Date.now() + 4 * H), "lead_chase", { leadId: l.id, n: 1 });
      await scheduleFollowUp(c, new Date(Date.now() + 26 * H), "lead_chase", { leadId: l.id, n: 2 });
      await scheduleFollowUp(c, new Date(Date.now() + 48 * H), "lead_chase", { leadId: l.id, n: 3 });
    }
  }
  await logEvent(c.slug, "lead", { id: l.id, reason, channel: ctx.channel });
  return l;
}

// What the voice assistant should know before it says hello: the caller's name from the most recent
// booking or lead with that number, whether they are an existing customer, and any upcoming visit.
export async function callerContext(c, phone, at) {
  const out = { customerName: "", isExisting: "new", upcomingVisit: "" };
  if (!phone) return out;
  const recs = (await listRecords("bookings", c.slug, 300)).concat(await listRecords("leads", c.slug, 300)).filter((r) => r.phone === phone && r.customer_name && r.status !== "spam").sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  if (recs.length) out.customerName = recs[recs.length - 1].customer_name.split(" ")[0];
  out.isExisting = await customerType(c.slug, phone, at) === "existing" ? "existing customer" : "new";
  const up = await upcomingBookings(c, phone, at);
  if (up.length) { const b = up[0]; out.upcomingVisit = `${b.date ? friendlyDate(b.date) : "today"}, ${b.window}${b.issue ? ", for the " + b.issue.replace(/[.\s]+$/, "") : ""}`; }
  return out;
}

// A lead posted by Angi or Thumbtack: one lead per platform id, the owner alerted, and the customer
// texted at once (a reply to their own request, so no quiet-hours deferral).
export async function receivePlatformLead(c, source, { id, name, phone, email, address, task, raw, unmapped }) {
  const pid = id || "";
  if (pid) {
    const dup = (await listRecords("leads", c.slug, 500)).find((l) => l.source === source && l.sourceId === pid);
    if (dup) return { ok: true, duplicate: true, id: dup.id };
  }
  const p = e164(phone);
  const l = await addRecord("leads", c.slug, {
    customer_name: esc(name), phone: p, email: esc(email), address: esc(address), issue: esc(task).slice(0, 300), reason: "lead", urgency: "this_week", wanted: "", language: "en", unsure: "",
    nobook_reason: "none", channel: source, contact: p || pid, source, sourceId: pid, raw: raw ? JSON.stringify(raw).slice(0, 4000) : "", status: "open", outcome: "needs_action", customerType: await customerType(c.slug, p),
  });
  const label = source === "angi" ? "Angi" : source === "thumbtack" ? "Thumbtack" : source;
  let summary = ownerSummary(c, "lead", l);
  if (!p) summary = summary.replace(/Reply "ok [^"]+" to acknowledge\./, source === "thumbtack" ? "No phone number comes with Thumbtack leads. Reply in the Thumbtack app." : "No phone number came with this lead; reply on the platform.");
  await notifyOwner(c, `${label} lead: ` + summary, { type: "owner_alert" });
  if (unmapped) await notifySteve(`${label} field names differ: ${c.business.name}`, `A ${label} post reached ${c.slug} with no recognized fields. The lead was created from the raw body (ref ${l.id}). Body:\n${JSON.stringify(raw).slice(0, 3000)}`);
  let texted = false;
  if (p && !(await optedOut(p))) {
    const first = (l.customer_name || "").split(" ")[0];
    const r = await sendSMS({ to: p, client: c, type: "text_back", body: `Hi${first ? " " + first : ""}, this is ${c.business.name}. We got your ${label} request${l.issue ? " about " + l.issue.slice(0, 80) : ""}. What is going on, and when works for a visit? We offer ${(c.windows || []).join(" or ")}. Reply STOP to opt out.` });
    texted = !!(r.ok || r.logged);
    if (texted) { const conv = await getConversation(c.slug, "sms", p); conv.messages.push({ role: "assistant", content: `Hi${first ? " " + first : ""}, this is ${c.business.name}. We got your ${label} request. What is going on, and when works for a visit?`, at: new Date().toISOString(), system: "platform-lead text-back" }); await saveConversation(conv); }
  }
  if (PLANS[c.plan]?.followUp && p && texted) {
    await scheduleFollowUp(c, new Date(Date.now() + 4 * H), "lead_chase", { leadId: l.id, n: 1 });
    await scheduleFollowUp(c, new Date(Date.now() + 26 * H), "lead_chase", { leadId: l.id, n: 2 });
  }
  await logEvent(c.slug, "platform_lead", { id: l.id, source, texted });
  return { ok: true, id: l.id, texted };
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
  if (alerts.length) { const ids = new Set(alerts.map((a) => a.id)); await cancelTasks(c.slug, (t) => t.type === "escalate" && ids.has(t.data?.alertId)); }
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
  const light = a.kind === "wants_call";
  a.step = (a.step || 0) + 1;
  let how = "";
  const backupText = async () => {
    if (!c.owner?.backupPhone) return "backup skipped";
    const r = await sendSMS({ to: c.owner.backupPhone, client: c, type: "escalation", force: true, body: `${owner} has not acknowledged this in ${mins} min:\n${summary}` });
    return r.ok ? "backup texted" : r.logged ? "backup texted (logged)" : "backup skipped";
  };
  const tellCustomer = async () => {
    const win = callbackPromise(c);
    if (lead.phone) await sendSMS({ to: lead.phone, client: c, type: "fallback_window", body: str("fallback_window", lead)(c, owner, win) });
  };
  if (light) {
    // Someone who wants a call: backup text, then the customer is told the window. No call, no Steve.
    if (a.step === 1) how = await backupText();
    else { await tellCustomer(); how = "customer told window"; a.status = "exhausted"; }
  } else if (a.step === 1) {
    how = await backupText();
  } else if (a.step === 2) {
    if (cellIsForwardedLine(c)) {
      // A call to the forwarded line would come straight back to the front desk: text again instead.
      await sendSMS({ to: c.owner?.phone, client: c, type: "owner_alert", force: true, body: `Second notice: not acknowledged in ${mins * 2} min.\n${summary}` });
      how = "call replaced by text (forwarded line)";
    } else {
      const r = await placeCall({ to: c.owner?.phone, say: `Urgent lead from your ${c.business.name} front desk. Please check your texts. Urgent lead from your ${c.business.name} front desk. Please check your texts.` });
      how = r.ok ? "call" : "call (logged)";
    }
  } else {
    await tellCustomer();
    if (STEVE_PHONE) await sendSMS({ to: STEVE_PHONE, from: process.env.MC_TWILIO_NUMBER, body: `Unacknowledged ${a.kind} at ${c.business.name}:\n${summary}`.slice(0, 1200), force: true });
    await notifySteve(`Unacknowledged ${a.kind}: ${c.business.name}`, `${summary}\n\n${process.env.URL || ""}/desk?c=${c.slug}&k=${c.ownerKey}`);
    how = "customer told window, Steve notified";
    a.status = "exhausted";
  }
  a.history.push({ step: a.step, how, at: new Date().toISOString() });
  await saveRecord("alerts", a);
  await logEvent(c.slug, "escalated", { id: a.id, step: a.step, how, kind: a.kind });
  if (a.status === "waiting") await scheduleTask(c.slug, new Date(Date.now() + mins * 60 * 1000), "escalate", { alertId: a.id });
  return `step ${a.step}: ${how}`;
}

// ---- Confirm, reschedule, cancel request (SMS replies) ----
// Records written before 2026-10-20 may hold "today" or "tomorrow": read them relative to createdAt.
export function bookingDay(b) {
  if (!b.date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return visitDate(b.date);
  const base = new Date(new Date(b.createdAt || Date.now()).toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const t = b.date.toLowerCase();
  if (t === "today") return base;
  if (t === "tomorrow") { base.setDate(base.getDate() + 1); return base; }
  return visitDate(b.date);
}
export async function upcomingBookings(c, phone, at) {
  if (!phone) return [];
  const today = at ? new Date(new Date(at).toLocaleString("en-US", { timeZone: "America/Chicago" })) : visitDate("today"); today.setHours(0, 0, 0, 0);
  return (await listRecords("bookings", c.slug, 300)).filter((b) => b.phone === phone && ["booked", "on_the_way", "confirmed"].includes(b.status) && (!b.date || bookingDay(b).getTime() >= today.getTime()));
}

export async function confirmVisit(c, b) {
  b.confirmedAt = new Date().toISOString(); b.status = b.status === "booked" ? "confirmed" : b.status; await saveRecord("bookings", b);
  await logEvent(c.slug, "confirmed", { id: b.id });
  return b;
}

export async function rescheduleVisit(c, b, date, window) {
  const old = when(b);
  b.date = normalizeDate(esc(date)) || b.date; b.window = esc(window) || b.window; b.status = "booked"; b.confirmedAt = null;
  await cancelTasks(c.slug, (t) => ["reminder_24h", "reminder_1h", "visit_check"].includes(t.type) && t.data?.bookingId === b.id);
  await scheduleReminders(c, b);
  try { if (b.calendarEventId) await updateEvent(c, b); } catch (e) { console.error("calendar update", e); }
  await saveRecord("bookings", b);
  await notifyOwner(c, `${c.business.name} front desk: RESCHEDULED ref ${b.id} to ${when(b)} (was ${old}).\nCustomer: ${b.customer_name} ${b.phone}\nWhere: ${b.address}\nIssue: ${b.issue}`, { type: "owner_alert" });
  await logEvent(c.slug, "rescheduled", { id: b.id, from: old, to: `${b.date} ${b.window}` });
  return b;
}

export async function cancelRequest(c, b) {
  await notifyOwner(c, `${c.business.name} front desk: NEEDS ACTION. ${b.customer_name || b.phone} wants to cancel ref ${b.id} (${when(b)}, ${b.issue}). Reply "cancel ${b.id}" to cancel it.`, { type: "owner_alert" });
  await logEvent(c.slug, "cancel_requested", { id: b.id });
  return b;
}

// ---- Owner commands by text: ok, otw, done, quote, paid, cancel ----
// A bare "ok", "done", "otw", or "called" applies when exactly one record fits; with more, the reply lists them.
async function bareCandidates(c, cmd) {
  const today = visitDate("today"); today.setHours(0, 0, 0, 0);
  if (cmd === "ok") { const alerts = (await listRecords("alerts", c.slug, 100)).filter((a) => a.status === "waiting"); const ids = [...new Set(alerts.map((a) => a.leadId))]; const out = []; for (const id of ids) { const l = await getRecord("leads", c.slug, id); if (l) out.push(l); } return out; }
  if (cmd === "called") return (await listRecords("leads", c.slug, 200)).filter((l) => l.status === "open" && l.callbackDueAt && !l.calledAt);
  const bookings = (await listRecords("bookings", c.slug, 300)).filter((b) => ["booked", "confirmed", "on_the_way"].includes(b.status) && b.date);
  if (cmd === "otw") return bookings.filter((b) => b.status !== "on_the_way" && bookingDay(b).getTime() === today.getTime());
  if (cmd === "done") return bookings.filter((b) => bookingDay(b).getTime() <= today.getTime());
  return [];
}
export async function ownerCommand(c, text) {
  const bare = String(text || "").trim().match(/^(ok|okay|done|otw|called)\s*[.!]*$/i);
  if (bare) {
    const cmd = bare[1].toLowerCase() === "okay" ? "ok" : bare[1].toLowerCase();
    const cands = await bareCandidates(c, cmd);
    if (cands.length === 1) return ownerCommand(c, `${cmd} ${cands[0].id}`);
    if (!cands.length) return `Nothing is waiting for "${cmd}" right now. Add the ref if you meant a specific one (it is on the alert text).`;
    return `Which one? ${cands.slice(0, 5).map((r) => `${r.customer_name || r.phone} (${cmd} ${r.id})`).join(", ")}.`;
  }
  const m = String(text || "").trim().match(/^(ok|okay|done|quote|otw|cancel|paid|invoice|called)\s+([a-z0-9]{6,12})(?:\s+(.*))?$/i);
  if (!m) return null;
  const [, cmdRaw, id, rest] = m; const cmd = cmdRaw.toLowerCase();
  const b = (await getRecord("bookings", c.slug, id)) || (await getRecord("leads", c.slug, id));
  if (!b) return `No record ${id}. Check the ref on the summary text.`;
  const plan = PLANS[c.plan] || PLANS.growth;
  const acked = await ackAlertsFor(c, b.id);
  if (cmd === "ok" || cmd === "okay") { if (!b.ackedAt) { b.ackedAt = new Date().toISOString(); await saveRecord(b.reason ? "leads" : "bookings", b); } return `Got it, ${b.customer_name || b.phone} is yours.`; }
  if (cmd === "called") {
    b.calledAt = new Date().toISOString(); if (b.status === "open") b.status = "called";
    await saveRecord(b.reason ? "leads" : "bookings", b);
    await cancelTasks(c.slug, (t) => t.type === "callback_check" && t.data?.leadId === b.id);
    await logEvent(c.slug, "called", { id: b.id, kept: b.callbackDueAt ? b.calledAt <= b.callbackDueAt : null });
    return `Logged: you reached ${b.customer_name || b.phone}.`;
  }
  const blocked = b.phone ? await optedOut(b.phone) : false;
  if (cmd === "otw") {
    if (blocked) { await logEvent(c.slug, "sms_blocked", { to: b.phone, type: "on_my_way" }); return `${b.customer_name || b.phone} opted out of texts; nothing sent.`; }
    const r = b.phone ? await sendSMS({ to: b.phone, client: c, type: "on_my_way", body: template("on_my_way", b)(c, b) }) : { ok: false };
    b.status = "on_the_way"; await saveRecord("bookings", b);
    return r.ok || r.logged ? `On-the-way text sent to ${b.customer_name || b.phone}. Reply "done ${b.id}" when the job is finished.` : `Could not text ${b.customer_name || b.phone} (${r.reason || r.error || "no number"}).`;
  }
  if (cmd === "done") {
    if (["done", "paid"].includes(b.status)) return `${b.customer_name || b.phone} was already marked ${b.status}; nothing changed.`;
    b.status = "done"; b.doneAt = new Date().toISOString(); await saveRecord("bookings", b);
    await cancelTasks(c.slug, (t) => ["reminder_24h", "reminder_1h", "visit_check"].includes(t.type) && t.data?.bookingId === b.id);
    if (plan.followUp && b.phone && !blocked && !reviewLink(c)) {
      await logEvent(c.slug, "review_skipped", { id: b.id, reason: "no_review_link" });
      return `Marked done. No review request went out: add your Google review link on the portal (Setup, Google review link) to start review requests. If they still owe you, text "invoice ${b.id} amount".`;
    }
    if (plan.followUp && b.phone && !blocked) {
      // Review request, a nudge if they do not reply, and the referral ask only after a positive reply.
      // Payment reminders are not automatic: most residential jobs are paid on the spot (text "invoice REF amount").
      await scheduleFollowUp(c, new Date(Date.now() + 2 * H), "review_request", { bookingId: b.id });
      await scheduleFollowUp(c, new Date(Date.now() + 50 * H), "review_nudge", { bookingId: b.id });
      await scheduleFollowUp(c, new Date(Date.now() + 8 * D), "referral_ask", { bookingId: b.id });
      if (c.plan === "pro" && tradeKey(c.business?.trade) === "hvac") await scheduleFollowUp(c, new Date(Date.now() + 182 * D), "maintenance_reminder", { bookingId: b.id });
      return `Marked done. Review request goes out in 2 hours (inside 9 am to 9 pm), a nudge in 2 days if they do not reply. If they still owe you, text "invoice ${b.id} amount" and reminders go out on day 3 and 7.`;
    }
    return `Marked done.`;
  }
  if (cmd === "invoice") {
    if (!plan.followUp) return `Payment reminders are on the Growth and Pro plans.`;
    if (!b.phone) return `No phone number on ${id}, nothing to send.`;
    if (blocked) { await logEvent(c.slug, "sms_blocked", { to: b.phone, type: "payment_reminder" }); return `${b.customer_name || b.phone} opted out of texts; no reminders.`; }
    b.invoicedAt = new Date().toISOString(); if (rest) b.amount = /^\$/.test(rest.trim()) ? rest.trim() : "$" + rest.trim().replace(/^\$/, "");
    if (b.status === "paid") b.status = "done";
    await saveRecord("bookings", b);
    await cancelTasks(c.slug, (t) => t.type === "payment_reminder" && t.data?.bookingId === b.id);
    await scheduleFollowUp(c, new Date(Date.now() + 3 * D), "payment_reminder", { bookingId: b.id });
    await scheduleFollowUp(c, new Date(Date.now() + 7 * D), "payment_reminder", { bookingId: b.id });
    return `Invoice${b.amount ? " for " + b.amount : ""} logged for ${b.customer_name || b.phone}. Reminders go out on day 3 and 7 unless you text "paid ${b.id}".`;
  }
  if (cmd === "quote") {
    b.status = "quoted"; b.quotedAt = new Date().toISOString(); if (rest) b.amount = rest; await saveRecord("bookings", b);
    if (plan.followUp && b.phone && !blocked) { await scheduleFollowUp(c, new Date(Date.now() + 14 * D), "quote_check", { bookingId: b.id }); return `Quote logged. Day-14 check scheduled for ${b.customer_name || b.phone}.`; }
    return `Quote logged.`;
  }
  if (cmd === "paid") {
    b.status = "paid"; b.paidAt = new Date().toISOString(); await saveRecord("bookings", b); await cancelTasks(c.slug, (t) => t.type === "payment_reminder" && t.data?.bookingId === b.id);
    return `Marked paid. No payment reminders will go out.`;
  }
  if (cmd === "cancel") {
    b.status = "cancelled"; await saveRecord("bookings", b); await cancelTasks(c.slug, (t) => t.data?.bookingId === b.id || t.data?.leadId === b.id);
    if (b.phone && !blocked && b.window) await sendSMS({ to: b.phone, client: c, type: "cancelled", body: str("cancelled", b)(c, b) });
    return `Cancelled ${id}, reminders stopped.${acked ? "" : ""}`;
  }
  return null;
}

// ---- Review replies: the referral ask only goes to someone who said they were happy ----
// Called before the model answers a customer text. If a review request went to this number and
// has no reply yet, classify the text; a negative reply stops the nudge and the referral ask and
// reaches the owner as NEEDS ACTION; a positive one unlocks the referral ask.
export async function noteReviewReply(c, phone, text) {
  const recs = (await listRecords("bookings", c.slug, 300)).filter((b) => b.phone === phone && b.reviewAskedAt && !b.reviewReply).sort((a, b) => (a.reviewAskedAt || "").localeCompare(b.reviewAskedAt || ""));
  const b = recs[recs.length - 1];
  if (!b) return null;
  let sentiment = "none";
  try {
    const { makeClient, MODEL } = await import("./agent.mjs");
    const client = makeClient();
    const r = await client.messages.create({ model: MODEL, max_tokens: 5, system: "A home service company texted a customer asking how the visit went and for a Google review. Classify the customer's reply. Answer with one word: positive (happy, thanks, will do, good job), negative (a complaint, something wrong, unhappy, refuses because of the service), or none (a question, a new request, unrelated, or unclear).", messages: [{ role: "user", content: text.slice(0, 500) }] });
    const w = (r.content?.[0]?.text || "").trim().toLowerCase();
    sentiment = w.startsWith("pos") ? "positive" : w.startsWith("neg") ? "negative" : "none";
  } catch (err) { console.error("review classify", err); }
  b.reviewReply = { sentiment, text: text.slice(0, 300), at: new Date().toISOString() };
  await saveRecord("bookings", b);
  if (sentiment === "negative") {
    await cancelTasks(c.slug, (t) => ["review_nudge", "referral_ask"].includes(t.type) && t.data?.bookingId === b.id);
    await notifyOwner(c, `${c.business.name} front desk: NEEDS ACTION. ${b.customer_name || b.phone} replied to the review request: "${text.slice(0, 200)}"\nRef ${b.id}, ${b.issue || ""}. No review nudge or referral ask will go out. Reply "ok ${b.id}" when you have it.`, { type: "owner_alert" });
  } else if (sentiment === "positive") {
    await cancelTasks(c.slug, (t) => t.type === "review_nudge" && t.data?.bookingId === b.id);
    if (c.rules?.consentAsk && phone) {
      const cust = await getCustomer(c.slug, phone);
      if (!cust.consentAskedAt && !cust.marketingConsent && !cust.consentScheduledAt) { cust.consentScheduledAt = new Date().toISOString(); await saveCustomer(cust); await scheduleFollowUp(c, new Date(Date.now() + 60 * 60 * 1000), "consent_ask", { bookingId: b.id, phone }); }
    }
  }
  await logEvent(c.slug, "review_reply", { id: b.id, sentiment });
  return { booking: b, sentiment };
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
  if (!bookings.length && !leads.length && !convs.length) return { empty: true, text: `${name}: nothing today. Line OK, last call ${t(h.lastInboundCall)}, errors ${h.errors24h}.`, email: `${name}: nothing today.\nLast call: ${t(h.lastInboundCall)}. Last text: ${t(h.lastInboundText)}. Errors: ${h.errors24h}.` };
  const text = `${name}, today: ${bookings.length} booked${bookings.length ? " (" + bookings.map((b) => b.id).join(", ") + ")" : ""}, ${needs.length} leads need action${needs.length ? " (" + needs.map((l) => l.id).join(", ") + ")" : ""}, ${emergencies} emergencies, ${wants} wants a call, ${spam} spam. Flagged: ${convs.length}${convs.length ? " (" + (convs[0].flag.note || "").slice(0, 60) + ")" : ""}. Line: last call ${t(h.lastInboundCall)}, last text ${t(h.lastInboundText)}, errors ${h.errors24h}.`;
  const email = [`${name}: today's front desk`, "",
    ...bookings.map((b) => `Booked ${b.id}: ${b.customer_name} ${b.phone}, ${when(b)}, ${b.issue}${b.unsure ? " (unsure: " + b.unsure + ")" : ""}`),
    ...leads.filter((l) => l.outcome !== "spam").map((l) => `${OUTCOME[l.outcome] || l.outcome} ${l.id}: ${l.customer_name || "no name"} ${l.phone}, ${l.issue}${l.urgency === "emergency" ? " EMERGENCY" : ""}`),
    spam ? `Spam: ${spam}` : "",
    ...convs.map((v) => `Flagged (${v.channel} ${v.contact}): ${v.flag.note || ""}`),
    "", `Line: last call ${t(h.lastInboundCall)}, last text ${t(h.lastInboundText)}, last text delivered ${t(h.lastOutboundText)}, errors in 24 h ${h.errors24h}.`].filter((x) => x !== "").join("\n");
  return { text, email };
}

// Monthly statement on the 1st: the previous Houston month in one email; Steve's copy carries the hand-invoice line.
export async function monthlyReport(c, month) {
  const now = new Date();
  const hou = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const prev = new Date(hou.getFullYear(), hou.getMonth() - 1, 1);
  const m = month || `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const [y, mo] = m.split("-").map(Number);
  const inMonth = (iso) => iso && new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso)).slice(0, 7) === m;
  const bypass = new Set(c.rules?.bypass || []);
  const [bookings, leads, events, convs, usage] = await Promise.all([
    listRecords("bookings", c.slug, 1000), listRecords("leads", c.slug, 1000), listRecords("events", c.slug, 3000),
    (await import("./store.mjs")).listJSON("conversations", c.slug + "/", 1000), getUsage(c.slug, m),
  ]);
  const mb = bookings.filter((b) => inMonth(b.createdAt)), ml = leads.filter((l) => inMonth(l.createdAt)), me = events.filter((e) => inMonth(e.at));
  const spamNumbers = new Set(ml.filter((l) => l.status === "spam").map((l) => l.phone).filter(Boolean));
  const answered = me.filter((e) => e.type === "call_ended" && !spamNumbers.has(e.data?.from)).length;
  const textedBack = me.filter((e) => e.type === "missed_call" && ["sent", "logged"].includes(e.data?.textBack)).length;
  const byChannel = {}; for (const b of mb) byChannel[b.channel || "web"] = (byChannel[b.channel || "web"] || 0) + 1;
  const textBackContacts = new Set(convs.filter((v) => v.channel === "sms" && (v.messages || []).some((x) => x.system === "missed-call text-back")).map((v) => v.contact));
  const voicemailJobs = mb.filter((b) => textBackContacts.has(b.phone) || !isBusinessHours(c, b.createdAt)).length;
  const reviewsSent = me.filter((e) => e.type === "task_sent" && e.data?.type === "review_request").length;
  const positive = me.filter((e) => e.type === "review_reply" && e.data?.sentiment === "positive").length;
  const promised = ml.filter((l) => l.callbackDueAt);
  const kept = promised.filter((l) => (l.calledAt && l.calledAt <= l.callbackDueAt) || (l.ackedAt && l.ackedAt <= l.callbackDueAt)).length;
  const emergencies = ml.filter((l) => l.urgency === "emergency").length + mb.filter((b) => b.urgency === "emergency").length;
  const bySrc = {}; for (const l of ml.filter((x) => x.source)) bySrc[l.source] = (bySrc[l.source] || 0) + 1;
  const changes = me.filter((e) => e.type === "config_updated").length, flags = me.filter((e) => e.type === "flagged").length;
  const plan = PLANS[c.plan] || PLANS.growth;
  const overMin = Math.max(0, (usage.minutes || 0) - plan.minutes), overTxt = Math.max(0, (usage.texts || 0) - plan.texts);
  const overage = Math.round((overMin * 0.35 + overTxt * 0.03) * 100) / 100;
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(y, mo - 1, 1));
  const name = c.business.name;
  const lines = [
    `${name}: your front desk in ${label}`, "",
    `Calls: ${answered} answered by the front desk, ${textedBack} texted back after a missed call`,
    `Booked: ${mb.length}${mb.length ? " (" + Object.entries(byChannel).map(([k, v]) => `${v} by ${k === "sms" ? "text" : k === "call" ? "phone" : k}`).join(", ") + ")" : ""}`,
    `Jobs that would have gone to voicemail: ${voicemailJobs}`,
    `Review requests sent: ${reviewsSent}; customers who replied they were happy: ${positive}`,
    promised.length ? `Callback promises kept on time: ${kept} of ${promised.length}` : "Callback promises: none made",
    `Emergencies handled: ${emergencies}`,
    Object.keys(bySrc).length ? `Leads from platforms: ${Object.entries(bySrc).map(([k, v]) => `${v} ${k === "angi" ? "Angi" : k === "thumbtack" ? "Thumbtack" : k}`).join(", ")}` : "",
    `Usage: ${usage.minutes || 0} of ${plan.minutes} call minutes, ${usage.texts || 0} of ${plan.texts} texts${overage ? ` (over the plan by $${overage.toFixed(2)})` : " (inside the plan)"}`,
    `What changed: ${changes} edits to what it knows, ${flags} conversations you flagged`,
    `Next month: ${c.nextMonthNote || "Steve reads your flagged conversations and tightens what it says; reply to this email with the one thing you want better."}`,
    "", `Every conversation is on your portal. Reply to this email any time.`,
  ].filter((x) => x !== "");
  const invoice = `Invoice: $${plan.price} plus $${overage.toFixed(2)} overage`;
  return { month: m, subject: `${name}: ${label} statement`, text: lines.join("\n"), invoice, stats: { answered, textedBack, booked: mb.length, voicemailJobs, reviewsSent, positive, kept, promised: promised.length, emergencies, overage } };
}

// Monday email: what the front desk did for the shop in the last seven Houston days.
export async function weeklyReport(c) {
  const since = Date.now() - 7 * D;
  const inWin = (iso) => iso && new Date(iso).getTime() > since;
  const bypass = new Set(c.rules?.bypass || []);
  const [bookings, leads, events, convs, usage] = await Promise.all([
    listRecords("bookings", c.slug, 500), listRecords("leads", c.slug, 500), listRecords("events", c.slug, 2000),
    (await import("./store.mjs")).listJSON("conversations", c.slug + "/", 500), getUsage(c.slug),
  ]);
  const wb = bookings.filter((b) => inWin(b.createdAt)), wl = leads.filter((l) => inWin(l.createdAt)), we = events.filter((e) => inWin(e.at));
  const spamContacts = new Set(wl.filter((l) => l.status === "spam").map((l) => l.phone || l.contact));
  const wc = convs.filter((v) => inWin(v.updatedAt) && (v.messages || []).some((m) => m.role === "user" && inWin(m.at)));
  const actionable = wc.filter((v) => !bypass.has(v.contact) && !spamContacts.has(v.contact));
  const spamNumbers = new Set(wl.filter((l) => l.status === "spam").map((l) => l.phone).filter(Boolean));
  const answered = we.filter((e) => e.type === "call_ended" && !spamNumbers.has(e.data?.from)).length;
  const spamCalls = we.filter((e) => e.type === "call_ended" && spamNumbers.has(e.data?.from)).length;
  const textedBack = we.filter((e) => e.type === "missed_call" && ["sent", "logged"].includes(e.data?.textBack)).length;
  const calls = answered + we.filter((e) => e.type === "missed_call").length;
  const afterHours = we.filter((e) => ["missed_call", "call_ended", "sms_inbound"].includes(e.type) && !isBusinessHours(c, e.at)).length;
  const byChannel = {}; for (const b of wb) byChannel[b.channel || "web"] = (byChannel[b.channel || "web"] || 0) + 1;
  // Bookable conversations: actionable minus the ones that were only a question.
  const keys = (r) => [r.phone, r.contact].filter(Boolean);
  const questionOnly = new Set(wl.filter((l) => l.nobook_reason === "question_only").flatMap(keys));
  const bookedContacts = new Set(wb.flatMap(keys));
  const bookable = actionable.filter((v) => !questionOnly.has(v.contact) || bookedContacts.has(v.contact));
  const bookedCustomers = new Set(wb.map((b) => b.phone || b.contact)).size;
  const rate = bookable.length ? Math.min(100, Math.round((bookedCustomers / bookable.length) * 100)) : 0;
  // Jobs that would have gone to voicemail: booked after a missed-call text-back, or booked after hours.
  const textBackContacts = new Set(wc.filter((v) => v.channel === "sms" && (v.messages || []).some((m) => m.system === "missed-call text-back")).map((v) => v.contact));
  const voicemailJobs = wb.filter((b) => textBackContacts.has(b.phone) || !isBusinessHours(c, b.createdAt)).length;
  const open = wl.filter((l) => l.status === "open" && ["needs_action", "wants_call"].includes(l.outcome));
  const unbooked = wl.filter((l) => l.status !== "spam" && l.status !== "booked");
  const reasons = {}; for (const l of unbooked) { const r = l.nobook_reason && l.nobook_reason !== "none" ? l.nobook_reason : "not recorded"; reasons[r] = (reasons[r] || 0) + 1; }
  const emergencies = wl.filter((l) => l.urgency === "emergency").length + wb.filter((b) => b.urgency === "emergency").length;
  const spam = spamContacts.size;
  const flags = we.filter((e) => e.type === "flagged").length, changes = we.filter((e) => e.type === "config_updated").length;
  const promised = wl.filter((l) => l.callbackDueAt);
  const kept = promised.filter((l) => (l.calledAt && l.calledAt <= l.callbackDueAt) || (l.ackedAt && l.ackedAt <= l.callbackDueAt)).length;
  const missed = promised.filter((l) => l.overdueAt).length;
  const u = usageView(c, usage);
  const name = c.business.name;
  const label = (k) => ({ wanted_price: "wanted a price first", wanted_sooner: "wanted someone sooner", out_of_area: "out of the area", fee_objection: "the fee was too much", question_only: "a question only", other: "other" }[k] || k);
  const empty = !wb.length && !wl.length && !actionable.length && !calls;
  if (empty) return { empty: true, subject: `${name}: nothing this week`, text: `${name}: nothing this week. No calls, texts, or chats reached the front desk in the last 7 days. Line: ${lineHealth(c, events).errors24h} errors in the last 24 hours.` };
  const lines = [
    `${name}: your front desk, last 7 days`, "",
    `Calls: ${answered} answered by the front desk, ${textedBack} texted back after a missed call${afterHours ? ` (${afterHours} contacts after hours)` : ""}`,
    `Conversations that could become a job: ${actionable.length}${spam || spamCalls ? ` (plus ${spam} spam${spamCalls ? ", " + spamCalls + " spam call" + (spamCalls === 1 ? "" : "s") : ""}, not counted)` : ""}`,
    `Booked: ${wb.length}${wb.length ? " (" + Object.entries(byChannel).map(([k, v]) => `${v} by ${k === "sms" ? "text" : k === "call" ? "phone" : k}`).join(", ") + ")" : ""}`,
    `Booking rate: ${bookedCustomers} booked of ${bookable.length} bookable conversations (${rate} percent)${wb.length > bookedCustomers ? ` (${wb.length} visits in all)` : ""}`,
    `Jobs that would have gone to voicemail: ${voicemailJobs}`,
    `Leads still needing you: ${open.length}${open.length ? " (" + open.map((l) => l.id).join(", ") + ")" : ""}`,
    unbooked.length ? `Did not book: ${unbooked.length}. Why: ${Object.entries(reasons).map(([k, v]) => `${v} ${label(k)}`).join(", ")}` : "Did not book: 0",
    `Emergencies: ${emergencies}`,
    (() => { const bySrc = {}; for (const l of wl.filter((x) => x.source)) bySrc[l.source] = (bySrc[l.source] || 0) + 1; return Object.keys(bySrc).length ? `Leads from platforms: ${Object.entries(bySrc).map(([k, v]) => `${v} ${k === "angi" ? "Angi" : k === "thumbtack" ? "Thumbtack" : k}`).join(", ")}` : ""; })(),
    promised.length ? `Callback promises: ${kept} kept on time, ${missed} overdue, ${promised.length - kept - missed} pending` : "",
    `Usage this month: ${u.minutes} of ${u.included.minutes} call minutes, ${u.texts} of ${u.included.texts} texts`,
    `Flags you raised: ${flags}. Changes to what it knows: ${changes}.`,
    "", `Every conversation is on your portal. Flag anything that reads wrong and Steve sees it the same day.`,
  ].filter((x) => x !== "");
  return { empty: false, subject: `${name}: your front desk, last 7 days`, text: lines.join("\n"), stats: { calls, answered, textedBack, spamCalls, actionable: actionable.length, bookable: bookable.length, voicemailJobs, booked: wb.length, bookedCustomers, rate, open: open.length, unbooked: unbooked.length, reasons, emergencies, spam, kept, missed } };
}
