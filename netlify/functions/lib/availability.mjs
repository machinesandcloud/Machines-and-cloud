// Pure Houston-date/window validation shared by owner blocks, lookup, booking and rescheduling.
// Legacy field visits retain their saved windows. Explicit appointment hours bind new visits.
export class AvailabilityInputError extends Error {
  constructor(code, message) { super(message); this.name = "AvailabilityInputError"; this.code = code; this.status = 400; }
}
export function houstonToday(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function isoDateValid(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1000 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function normalizeBookingDate(value, today = houstonToday()) {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  if (isoDateValid(text)) return text;
  if (text === "today") return today;
  if (text === "tomorrow") return addDays(today, 1);
  const names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekday = names.findIndex((name) => text === name || text === name.slice(0, 3) || (name === "tuesday" && text === "tues") || (name === "thursday" && text === "thurs"));
  if (weekday >= 0) { const delta = (weekday - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7; return addDays(today, delta || 7); }
  const m = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (m) { const y = m[3] ? m[3].length === 2 ? `20${m[3]}` : m[3] : today.slice(0, 4); const iso = `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; if (isoDateValid(iso)) return iso; }
  return "";
}
export function canonicalWindow(window) {
  const text = String(window || "").trim().toLowerCase();
  const m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:to|[-–—])\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/);
  if (!m) return text.replace(/\s+/g, " ");
  const minutes = (h, min, ap) => (ap ? (Number(h) % 12) + (/^p/.test(ap) ? 12 : 0) : Number(h)) * 60 + Number(min || 0);
  let start = minutes(m[1], m[2], m[3]), end = minutes(m[4], m[5], m[6]);
  if (!m[3] && start < 7 * 60) start += 12 * 60;
  if (!m[6] && end <= start) end += 12 * 60;
  return `${start}-${end}`;
}
export function listedWindows(c) {
  const seen = new Set();
  return (c.windows || []).filter((w) => typeof w === "string" && w.trim()).map((w) => w.trim()).filter((w) => { const key = canonicalWindow(w); if (seen.has(key)) return false; seen.add(key); return true; });
}
export function listedWindow(c, value) {
  if (typeof value !== 'string') return '';
  if (Object.hasOwn(c.rules || {}, 'appointmentHours')) {
    const range = appointmentWindowRange(value);
    if (!range || range.requiresPeriod) return '';
  }
  return listedWindows(c).find(window => canonicalWindow(window) === canonicalWindow(value)) || '';
}
const APPOINTMENT_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const plainHours = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function hoursError() { throw new AvailabilityInputError('invalid_appointment_hours', 'Review your appointment hours before accepting new visits.'); }
export function appointmentHoursTable(value) {
  if (!plainHours(value) || Object.keys(value).length !== 7 || APPOINTMENT_DAYS.some(day => !Object.hasOwn(value, day))) hoursError();
  return Object.fromEntries(APPOINTMENT_DAYS.map(day => {
    const row = value[day];
    if (row === null) return [day, null];
    if (!plainHours(row) || Object.keys(row).sort().join(',') !== 'close,open' || typeof row.open !== 'string' || typeof row.close !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.open) || !/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(row.close) || row.close <= row.open) hoursError();
    return [day, { open: row.open, close: row.close }];
  }));
}
export function normalizeAppointmentHours(value) {
  if (!plainHours(value) || value.version !== 1 || !['business', 'custom'].includes(value.mode) || Object.keys(value).sort().join(',') !== (value.mode === 'custom' ? 'hours,mode,version' : 'mode,version')) hoursError();
  return value.mode === 'custom' ? { version: 1, mode: 'custom', hours: appointmentHoursTable(value.hours) } : { version: 1, mode: 'business' };
}
export function appointmentSchedule(c) {
  if (!Object.hasOwn(c.rules || {}, 'appointmentHours')) return { mode: 'legacy' };
  const policy = normalizeAppointmentHours(c.rules.appointmentHours);
  return { ...policy, hours: policy.mode === 'custom' ? policy.hours : c.rules?.hours === null || c.rules?.hours === undefined ? Object.fromEntries(APPOINTMENT_DAYS.map(day => [day, null])) : appointmentHoursTable(c.rules.hours) };
}
export function appointmentWindowRange(window) {
  const match = String(window || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:to|[-–—])\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/);
  if (!match) return null;
  for (const [hour, minute, ap] of [[match[1], match[2], match[3]], [match[4], match[5], match[6]]]) if (Number(minute || 0) > 59 || (ap ? Number(hour) < 1 || Number(hour) > 12 : Number(hour) > 24 || Number(hour) === 24 && Number(minute || 0) !== 0)) return null;
  const minutes = (hour, minute, ap) => (ap ? Number(hour) % 12 + (/^p/.test(ap) ? 12 : 0) : Number(hour)) * 60 + Number(minute || 0);
  let start = minutes(match[1], match[2], match[3]), end = minutes(match[4], match[5], match[6]);
  // Preserve unqualified legacy shorthand, but never treat an explicit HH:mm or
  // zero-prefixed morning time as afternoon. Existing slot keys are not migrated.
  const explicitStart = !!match[2] || /^0\d?$/.test(match[1]), explicitEnd = !!match[5] || /^0\d?$/.test(match[4]);
  if (!match[3] && !explicitStart && start < 420) start += 720;
  if (!match[6] && !explicitEnd && end <= start) end += 720;
  const requiresPeriod = canonicalWindow(window) !== `${start}-${end}`;
  if (requiresPeriod) return { start, end, requiresPeriod: true };
  return Number.isInteger(start) && start >= 0 && end > start && end <= 1440 ? { start, end, requiresPeriod: false } : null;
}
const clockMinutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
// Resolve a real local wall time; spring-forward gaps must never become invented openings.
export function appointmentWallInstant(date, minutes, zone = 'America/Chicago') {
  if (!isoDateValid(date) || !Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new AvailabilityInputError('invalid_window', 'Choose a real arrival time.');
  if (minutes === 1440) return appointmentWallInstant(addDays(date, 1), 0, zone);
  const target = Date.parse(date + 'T00:00:00Z') + minutes * 60000;
  let instant = target;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let n = 0; n < 6; n++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(v => v.type !== 'literal').map(v => [v.type, Number(v.value)]));
    const local = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (local === target) return instant;
    instant += target - local;
  }
  throw new AvailabilityInputError('invalid_window', 'That arrival time does not exist on this Houston date. Choose another window.');
}
export function appointmentWindowAllowed(c, date, window) {
  const schedule = appointmentSchedule(c);
  if (schedule.mode === 'legacy') return true;
  if (!isoDateValid(date)) return false;
  const row = schedule.hours[['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(date + 'T12:00:00Z').getUTCDay()]], range = appointmentWindowRange(window);
  if (!row || !range || range.requiresPeriod || range.start < clockMinutes(row.open) || range.end > clockMinutes(row.close)) return false;
  try { return appointmentWallInstant(date, range.end) > appointmentWallInstant(date, range.start); } catch { return false; }
}
export function validateAppointmentConfiguration(c) {
  const schedule = appointmentSchedule(c);
  if (schedule.mode === 'legacy') return schedule;
  const windows = Array.isArray(c.windows) ? c.windows.filter(window => typeof window === 'string' && window.trim()).map(window => window.trim()) : [], ranges = windows.map(appointmentWindowRange);
  if (ranges.some(range => range?.requiresPeriod)) throw new AvailabilityInputError('invalid_appointment_window', 'Add am or pm to make each arrival time clear, such as 6 am to 8 am.');
  if (!windows.length || ranges.some(range => !range)) throw new AvailabilityInputError('invalid_appointment_window', 'Update arrival windows with a start and end time, such as 8 am to 12 pm. Your window text is retained.');
  const open = Object.values(schedule.hours).filter(Boolean);
  if (open.length && ranges.some(range => !open.some(row => range.start >= clockMinutes(row.open) && range.end <= clockMinutes(row.close)))) throw new AvailabilityInputError('appointment_windows_outside_hours', 'Update arrival windows so each whole window fits within at least one open day.');
  return schedule;
}
export function assertAppointmentWindow(c, date, window) {
  if (!appointmentWindowAllowed(c, date, window)) throw new AvailabilityInputError('outside_appointment_hours', 'That whole arrival window is outside your saved appointment hours. Choose another time or update appointment hours.');
}
export function isElapsedWindow(date, window, at = new Date()) {
  if (date !== houstonToday(at)) return false;
  const m = String(window || "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:to|[-–—])\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/);
  if (!m) return false; // Named windows have no inferred clock time.
  for (const [h, min, ap] of [[m[1], m[2], m[3]], [m[4], m[5], m[6]]]) {
    if (Number(min || 0) > 59 || (ap ? Number(h) < 1 || Number(h) > 12 : Number(h) > 24 || Number(h) === 24 && Number(min || 0) !== 0)) return false;
  }
  const [start, end] = canonicalWindow(window).split("-").map(Number);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 1440) return false; // Do not invent overnight semantics.
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(at).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return end <= (p.hour % 24) * 60 + p.minute;
}
export function requestedDate(value, { isoOnly = false, allowPast = false } = {}) {
  const date = isoOnly ? isoDateValid(value) ? value : "" : normalizeBookingDate(value);
  if (!isoDateValid(date)) throw new AvailabilityInputError("invalid_date", "Choose a real date in YYYY-MM-DD format.");
  if (!allowPast && date < houstonToday()) throw new AvailabilityInputError("invalid_date", "Choose today or a future Houston date.");
  return date;
}
export const GET_AVAILABILITY = {
  name: "get_availability",
  description: "Check actual appointment days and whole arrival windows after saved appointment hours, owner blocks, reservations and connected owned Google Calendar busy time. Business office hours can differ from custom appointment hours; this tool is the authority for visits. A manual-only shop uses its saved workspace availability. Check before offering ordinary visit dates/windows; booking checks again. A failed calendar check does not mean no openings: offer an owner callback without promising a window. For emergencies or a person request, follow safety and handoff rules first.",
  strict: true,
  input_schema: { type: "object", properties: { date: { type: "string", description: "First Houston date: YYYY-MM-DD, today, tomorrow, or a weekday" }, days: { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], description: "Number of consecutive dates to check, from 1 to 14" } }, required: ["date", "days"], additionalProperties: false },
};
