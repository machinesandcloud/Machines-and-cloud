// Pure Houston-date/window validation shared by owner blocks, lookup, booking and rescheduling.
// Office callback hours are intentionally unrelated to field-visit availability.
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
export const listedWindow = (c, value) => typeof value === "string" ? listedWindows(c).find((w) => canonicalWindow(w) === canonicalWindow(value)) || "" : "";
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
  description: "Check actual listed arrival windows with space after owner blocks and existing front-desk reservations. Check before offering ordinary visit dates/windows. This does not inspect an external calendar. For emergencies or a person request, follow safety and handoff rules first even when no window is open.",
  strict: true,
  input_schema: { type: "object", properties: { date: { type: "string", description: "First Houston date: YYYY-MM-DD, today, tomorrow, or a weekday" }, days: { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], description: "Number of consecutive dates to check, from 1 to 14" } }, required: ["date", "days"], additionalProperties: false },
};
