// Date helpers for visits, plus the retired legacy Calendar sync. New Calendar connections use
// lib/calendar-connection.mjs (calendar.events.owned + calendar.calendars.readonly, encrypted tokens).
// The legacy consent URL, code exchange and plaintext refresh-token sync (calendar.events +
// calendar.readonly, token on client.calendar.google.refreshToken) were removed (legal precondition P7,
// Google verification). Run the P7 census and revoke/purge stored legacy tokens before deploying this.
const CID = process.env.GOOGLE_CLIENT_ID;
const CSECRET = process.env.GOOGLE_CLIENT_SECRET;
export const googleEnabled = () => Boolean(CID && CSECRET);

// Parses "8 to 12" or "12 to 5" into start/end hours (24h, Houston assumed).
export function windowHours(win) {
  const m = String(win || "").match(/(\d{1,2})\s*(?:am|pm)?\s*(?:to|-|–)\s*(\d{1,2})\s*(am|pm)?/i);
  if (!m) return { start: 8, end: 12 };
  let s = parseInt(m[1], 10), e = parseInt(m[2], 10);
  if (s < 7) s += 12; if (e <= s) e += 12; if (e > 20) e = 20;
  return { start: s, end: e };
}

export function visitDate(dateStr, tz = "America/Chicago") {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const d = String(dateStr || "").toLowerCase().trim();
  if (!d || d === "today") return today;
  if (d === "tomorrow") { const t = new Date(today); t.setDate(t.getDate() + 1); return t; }
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const wd = days.findIndex((n) => d.startsWith(n.slice(0, 3)));
  if (wd >= 0) { const t = new Date(today); let delta = (wd - t.getDay() + 7) % 7; if (delta === 0) delta = 7; t.setDate(t.getDate() + delta); return t; }
  const us = d.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (us) { const y = us[3] ? (us[3].length === 2 ? 2000 + parseInt(us[3]) : parseInt(us[3])) : today.getFullYear(); return new Date(y, parseInt(us[1]) - 1, parseInt(us[2])); }
  return today;
}

// A stored visit date: always YYYY-MM-DD in Houston time, never "today" or "tomorrow".
export function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function normalizeDate(dateStr) { if (!dateStr) return ""; return isoDate(visitDate(dateStr)); }
// "2026-10-21" -> "Tue Oct 21" (or "mañana"-style words in Spanish are handled by desk.mjs dateEs).
export function friendlyDate(iso, lang = "en") {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || "");
  const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  const today = visitDate("today"); today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (lang === "es") { if (diff === 0) return "hoy"; if (diff === 1) return "mañana"; return new Intl.DateTimeFormat("es-US", { weekday: "long", day: "numeric", month: "long" }).format(d); }
  if (diff === 0) return "today"; if (diff === 1) return "tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d);
}

// Builds an ISO time in Houston for a date and hour.
export function houstonISO(date, hour) {
  const y = date.getFullYear(), mo = String(date.getMonth() + 1).padStart(2, "0"), da = String(date.getDate()).padStart(2, "0");
  // Houston is UTC-5 (CDT) or UTC-6 (CST). Resolve by asking Intl for the offset on that date.
  const probe = new Date(Date.UTC(y, date.getMonth(), date.getDate(), 12));
  const tzName = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }).formatToParts(probe).find((p) => p.type === "timeZoneName")?.value || "CST";
  const off = tzName === "CDT" ? "-05:00" : "-06:00";
  return `${y}-${mo}-${da}T${String(hour).padStart(2, "0")}:00:00${off}`;
}
