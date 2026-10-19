// Google Calendar through OAuth. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; the redirect URI is
// <site>/api/google/callback. Tokens live on the client record under calendar.google.
const CID = process.env.GOOGLE_CLIENT_ID;
const CSECRET = process.env.GOOGLE_CLIENT_SECRET;
export const googleEnabled = () => Boolean(CID && CSECRET);

export function authUrl(site, state) {
  const p = new URLSearchParams({
    client_id: CID, redirect_uri: site + "/api/google/callback", response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline", prompt: "consent", state,
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}

export async function exchangeCode(site, code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CID, client_secret: CSECRET, redirect_uri: site + "/api/google/callback", grant_type: "authorization_code" }).toString(),
  });
  const d = await res.json();
  if (!res.ok || !d.refresh_token) throw new Error("google token exchange failed: " + JSON.stringify(d));
  return d;
}

async function accessToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: CID, client_secret: CSECRET, grant_type: "refresh_token" }).toString(),
  });
  const d = await res.json();
  if (!res.ok) throw new Error("google refresh failed");
  return d.access_token;
}

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
  return today;
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

export async function createEvent(client, booking) {
  const g = client.calendar?.google;
  if (!googleEnabled() || !g?.refreshToken) return null;
  const token = await accessToken(g.refreshToken);
  const date = visitDate(booking.date);
  const { start, end } = windowHours(booking.window);
  const body = {
    summary: `${booking.issue} - ${booking.customer_name}`,
    description: `Booked by the front desk.\nCustomer: ${booking.customer_name}\nPhone: ${booking.phone}\nAddress: ${booking.address}\nIssue: ${booking.issue}\nUrgency: ${booking.urgency}\nNotes: ${booking.notes || "-"}`,
    location: booking.address,
    start: { dateTime: houstonISO(date, start), timeZone: "America/Chicago" },
    end: { dateTime: houstonISO(date, end), timeZone: "America/Chicago" },
  };
  const calId = encodeURIComponent(g.calendarId || "primary");
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("calendar insert failed", res.status, d); return null; }
  return { id: d.id, link: d.htmlLink };
}
