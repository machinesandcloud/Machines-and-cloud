// Offline acceptance for Round 10 calendar failures. Every provider response below is
// a local stub; this script never loads .env or sends requests to a provider.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";

const networkFunctions = [[net, "connect"], [net, "createConnection"], [http, "request"], [http, "get"], [https, "request"], [https, "get"]].map(([target, key]) => ({ target, key, original: target[key] }));
for (const { target, key } of networkFunctions) target[key] = () => { throw new Error("Network disabled by calendar-failure-check"); };
syncBuiltinESMExports();

for (const name of ["ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PRIMARY_PROFILE_SID", "VAPI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY", "MC_TWILIO_NUMBER", "MC_MESSAGING_SERVICE_SID", "STEVE_PHONE", "STEVE_EMAIL", "URL"]) delete process.env[name];
Object.assign(process.env, {
  MC_MEMORY_STORE: "1",
  GOOGLE_CLIENT_ID: "offline-calendar-client",
  GOOGLE_CLIENT_SECRET: "offline-calendar-secret",
  TWILIO_ACCOUNT_SID: "AC_OFFLINE_CALENDAR",
  TWILIO_AUTH_TOKEN: "offline-twilio-secret",
  RESEND_API_KEY: "offline-resend-secret",
  MC_TWILIO_NUMBER: "+17135550998",
  STEVE_PHONE: "+17135550999",
  STEVE_EMAIL: "steve@example.test",
  FROM_EMAIL: "Offline test <desk@example.test>",
  URL: "https://calendar-check.example.test",
});

const RealDate = globalThis.Date;
const realFetch = globalThis.fetch;
const realError = console.error;
let clock = RealDate.parse("2026-10-21T17:00:00Z");
class CheckDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
}
globalThis.Date = CheckDate;

const modes = new Map();
const requests = [];
const unexpected = [];
const errors = [];
console.error = (...args) => errors.push(args);
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init.method || "GET";
  const body = init.body || "";
  const headers = new Headers(init.headers);
  const req = { url: url.href, method, body, headers };
  requests.push(req);
  if (url.href === "https://oauth2.googleapis.com/token" && method === "POST") {
    const form = new URLSearchParams(body);
    assert.equal(form.get("client_id"), "offline-calendar-client");
    assert.equal(form.get("client_secret"), "offline-calendar-secret");
    assert.equal(form.get("grant_type"), "refresh_token");
    const slug = form.get("refresh_token");
    assert.ok(modes.has(slug), "only dummy refresh tokens are accepted");
    req.slug = slug;
    return modes.get(slug) === "refresh-fail"
      ? json(400, { error: "invalid_grant", error_description: "Offline revoked token" })
      : json(200, { access_token: "offline-access:" + slug });
  }
  if (url.origin === "https://www.googleapis.com" && /^\/calendar\/v3\/calendars\/primary\/events(?:\/[^/]+)?$/.test(url.pathname) && ["POST", "PATCH"].includes(method)) {
    const slug = headers.get("Authorization")?.replace(/^Bearer offline-access:/, "");
    assert.ok(modes.has(slug), "only dummy access tokens are accepted");
    req.slug = slug;
    req.data = JSON.parse(body);
    if ((method === "POST" && modes.get(slug) === "insert-fail") || (method === "PATCH" && modes.get(slug) === "update-fail")) return json(503, { error: { message: "Offline Calendar unavailable" } });
    return json(200, { id: "event-" + slug, htmlLink: "https://calendar.example.test/" + slug });
  }
  if (url.href === "https://api.twilio.com/2010-04-01/Accounts/AC_OFFLINE_CALENDAR/Messages.json" && method === "POST") {
    req.data = Object.fromEntries(new URLSearchParams(body));
    return json(201, { sid: "SM_OFFLINE_" + requests.length });
  }
  if (url.href === "https://api.resend.com/emails" && method === "POST") {
    req.data = JSON.parse(body);
    return json(200, { id: "email-offline-" + requests.length });
  }
  unexpected.push({ url: url.href, method });
  throw new Error("Offline calendar check blocked an unexpected request: " + method + " " + url.origin + url.pathname);
};

try {
  // These modules capture credentials at import time; all values above are dummy.
  const { newClient } = await import("../netlify/functions/lib/config.mjs");
  const store = await import("../netlify/functions/lib/store.mjs");
  const { bookVisit, rescheduleVisit, lineHealth } = await import("../netlify/functions/lib/desk.mjs");
  const { run } = await import("../netlify/functions/scheduler.mjs");
  const failed = [];

  async function shop(slug, mode = "healthy", connected = true) {
    const c = newClient({ slug, ownerKey: "offline-owner-key", owner: { name: "Offline Owner", phone: "+17135550100", email: slug + "@example.test" }, business: { name: "Offline " + slug, trade: "HVAC" } });
    c.status = "testing";
    c.plan = "growth";
    c.windows = ["8 to 12", "12 to 5"];
    c.phone.twilioNumber = "+17135550111";
    c.phone.tenDlc = "approved";
    c.calendar = connected ? { provider: "google", google: { refreshToken: slug } } : { provider: "none" };
    modes.set(slug, mode);
    await store.saveClient(c);
    return c;
  }
  const input = (date = "2026-11-03") => ({ customer_name: "Offline Customer", phone: "+17135550200", address: "10 Offline Lane, Katy", issue: "AC not cooling", date, window: "8 to 12", urgency: "this_week", language: "en", notes: "Use side gate", unsure: "" });
  const events = (c) => store.listRecords("events", c.slug, 1000);
  const tasks = async (c, b) => (await store.listJSON("tasks", "", 1000)).filter((t) => t.slug === c.slug && t.data?.bookingId === b.id);
  const calendarRequests = (c, method) => requests.filter((r) => r.slug === c.slug && r.url.startsWith("https://www.googleapis.com/") && (!method || r.method === method));
  const ownerMessages = (c) => requests.filter((r) => r.url === "https://api.resend.com/emails" && r.data.to.includes(c.owner.email));
  const ownerTexts = (c) => requests.filter((r) => r.url.includes("/Messages.json") && r.data.To === c.owner.phone && r.data.Body.startsWith(c.business.name + " front desk:"));
  const steveCalendarEmails = (c) => requests.filter((r) => r.url === "https://api.resend.com/emails" && r.data.to.includes(process.env.STEVE_EMAIL) && r.data.subject === "Calendar failing: " + c.business.name);
  const steveCalendarTexts = (c) => requests.filter((r) => r.url.includes("/Messages.json") && r.data.To === process.env.STEVE_PHONE && r.data.Body.startsWith("Calendar failing: " + c.business.name + "\n"));
  const calendarAlerts = async (c) => (await events(c)).filter((e) => e.type === "health_alert" && e.data.reason === "calendar");

  async function assertPreserved(c, b, op, previousOwnerMessages = 0) {
    assert.ok(b.id && !b.full, "calendar failure must not discard the booking");
    const persisted = await store.getRecord("bookings", c.slug, b.id);
    assert.equal(persisted.status, "booked");
    for (const key of ["customer_name", "phone", "address", "issue", "date", "window", "notes"]) assert.equal(persisted[key], b[key], "persisted " + key);
    assert.deepEqual((await tasks(c, b)).map((t) => t.type).sort(), ["reminder_1h", "reminder_24h", "visit_check"].sort());
    const ev = await events(c);
    const fault = ev.filter((e) => e.type === "calendar_failed");
    assert.equal(fault.length, 1, "exactly one calendar failure for the failed operation");
    assert.equal(fault[0].data.id, b.id);
    assert.equal(fault[0].data.op, op);
    assert.match(fault[0].data.error, /(?:google refresh|calendar (?:insert|update)) failed/);
    assert.equal(lineHealth(c, ev).errors24h, 1, "calendar failure contributes to line health");
    const owner = ownerMessages(c);
    assert.equal(owner.length, previousOwnerMessages + 1, "owner still receives the booking or reschedule details");
    assert.equal(ownerTexts(c).length, previousOwnerMessages + 1, "owner still receives the booking or reschedule text");
    for (const text of [b.id, b.customer_name, b.phone, b.address, b.issue]) {
      assert.ok(owner.at(-1).data.text.includes(text), "owner email details include " + text);
      assert.ok(ownerTexts(c).at(-1).data.Body.includes(text), "owner text details include " + text);
    }
    assert.ok(ev.some((e) => e.type === "sms_sent" && e.data.type === "owner_alert" && e.data.ok), "owner alert used the local SMS stub");
    return persisted;
  }

  // An expired/revoked refresh token and a rejected insert must remain visible
  // without losing the customer's appointment or the owner's booking details.
  for (const mode of ["refresh-fail", "insert-fail"]) {
    const c = await shop("calendar-" + mode, mode);
    const b = await bookVisit(c, input(), { channel: "test" });
    await assertPreserved(c, b, "insert");
    assert.equal(b.calendarEventId, undefined);
    assert.equal(calendarRequests(c, "POST").length, mode === "insert-fail" ? 1 : 0);
    failed.push(c);
  }

  // A failed PATCH, including refresh failure before that PATCH, must keep the
  // accepted new date, replace the reminders, and tell the owner which visit moved.
  for (const mode of ["update-fail", "refresh-fail"]) {
    const c = await shop("calendar-reschedule-" + mode);
    const b = await bookVisit(c, input(), { channel: "test" });
    assert.equal(b.calendarEventId, "event-" + c.slug);
    const oldTasks = await tasks(c, b);
    modes.set(c.slug, mode);
    const moved = await rescheduleVisit(c, b, "2026-11-04", "12 to 5");
    await assertPreserved(c, moved, "update", 1);
    assert.equal(moved.date, "2026-11-04");
    assert.equal(moved.window, "12 to 5");
    assert.equal(moved.calendarEventId, "event-" + c.slug);
    const newTasks = await tasks(c, moved);
    assert.ok(newTasks.every((t) => !oldTasks.some((old) => old.id === t.id)), "old reminders were removed");
    assert.deepEqual(Object.fromEntries(newTasks.map((t) => [t.type, t.dueAt])), {
      reminder_24h: "2026-11-03T18:00:00.000Z",
      reminder_1h: "2026-11-04T17:00:00.000Z",
      visit_check: "2026-11-05T15:00:00.000Z",
    }, "replacement reminders follow the accepted Houston window");
    assert.equal(calendarRequests(c, "PATCH").length, mode === "update-fail" ? 1 : 0);
    assert.match(ownerMessages(c).at(-1).data.text, /RESCHEDULED/);
    failed.push(c);
  }

  const healthy = await shop("calendar-healthy");
  const healthyBooking = await bookVisit(healthy, input(), { channel: "test" });
  await rescheduleVisit(healthy, healthyBooking, "2026-11-04", "12 to 5");
  assert.equal(calendarRequests(healthy, "POST").length, 1);
  assert.equal(calendarRequests(healthy, "PATCH").length, 1);
  assert.equal((await events(healthy)).filter((e) => e.type === "calendar_failed").length, 0);
  assert.equal(lineHealth(healthy, await events(healthy)).errors24h, 0);
  const storedHealthy = await store.getRecord("bookings", healthy.slug, healthyBooking.id);
  assert.equal(storedHealthy.calendarEventId, "event-" + healthy.slug);
  assert.equal(storedHealthy.date, "2026-11-04");
  assert.match(calendarRequests(healthy, "PATCH")[0].data.start.dateTime, /^2026-11-04T12:00:00-06:00$/);
  assert.equal(calendarRequests(healthy, "PATCH")[0].data.start.timeZone, "America/Chicago");

  const disconnected = await shop("calendar-disconnected", "healthy", false);
  await bookVisit(disconnected, input(), { channel: "test" });
  assert.equal(requests.filter((r) => r.slug === disconnected.slug).length, 0, "an unconnected calendar makes no provider request");
  assert.equal((await events(disconnected)).filter((e) => e.type === "calendar_failed").length, 0, "unconfigured calendar is not a provider failure");

  async function scan() {
    const r = await run({ forceHour: 12, forceDay: "Wed", all: true, inline: true });
    assert.ok(Object.values(r.blocks).every((b) => b.ok), "all scheduler blocks remain healthy during calendar failures");
  }
  await scan();
  for (const c of failed) {
    assert.equal((await calendarAlerts(c)).length, 1, "one alert for each failing shop");
    const mails = steveCalendarEmails(c);
    assert.equal(mails.length, 1);
    assert.equal(steveCalendarTexts(c).length, 1, "Steve's health text also uses the local stub");
    assert.match(mails[0].data.text, /Connect Google Calendar/);
    assert.match(mails[0].data.text, /Bookings still reach the owner by text/);
    assert.ok(mails[0].data.text.includes("c=" + c.slug), "alert links to the affected shop");
  }
  await scan();
  for (const c of failed) assert.equal(steveCalendarEmails(c).length, 1, "repeat scan does not duplicate alerts");

  // A new failure just before 24h is suppressed; the same ongoing failure alerts
  // again at the 24h boundary. Other shops' cooldowns remain independent.
  const again = failed[0];
  clock += 24 * 3600 * 1000 - 60000;
  await bookVisit(again, input("2026-11-05"), { channel: "test" });
  await scan();
  assert.equal(steveCalendarEmails(again).length, 1, "fresh failure inside the daily cooldown is suppressed");
  clock += 60000;
  await scan();
  assert.equal(steveCalendarEmails(again).length, 2, "ongoing failure alerts again after 24h");
  assert.equal(steveCalendarTexts(again).length, 2);
  assert.equal((await calendarAlerts(again)).length, 2);
  for (const c of failed.slice(1)) assert.equal(steveCalendarEmails(c).length, 1, "no repeat after old failures leave the 24h window");
  for (const c of [healthy, disconnected]) {
    assert.equal(steveCalendarEmails(c).length, 0, "no false health alert");
    assert.equal((await calendarAlerts(c)).length, 0);
  }

  assert.deepEqual(unexpected, [], "no request may escape the explicit offline stubs");
  assert.equal(errors.length, 5, "only the five deliberately injected calendar errors were logged");
  console.log("CALENDAR CHECK OK: refresh/insert/update failures, preserved bookings and reminders, owner details, line health, per-shop 24h alert dedupe, healthy and unconnected calendars; local stubs only.");
} finally {
  globalThis.fetch = realFetch;
  globalThis.Date = RealDate;
  console.error = realError;
  for (const { target, key, original } of networkFunctions) target[key] = original;
  syncBuiltinESMExports();
}
