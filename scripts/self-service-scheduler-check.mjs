// Force legacy scheduler/fanout gates with synthetic tenants and intercepted provider HTTP.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
const denyNetwork = () => { throw new Error("External network disabled by self-service check"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = denyNetwork;
syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_)/.test(key)) delete process.env[key];
process.env.MC_FAKE_MODEL = "1";
process.env.URL = "https://self-service-check.invalid";
process.env.STEVE_EMAIL = "qa-operator@example.invalid";
process.env.FROM_EMAIL = "QA <qa@example.invalid>";
process.env.MC_MEMORY_STORE = "1"; process.env.MC_FAKE_MODEL = "1";
process.env.TWILIO_ACCOUNT_SID = "ACdummy"; process.env.TWILIO_AUTH_TOKEN = "dummy";
process.env.TWILIO_PRIMARY_PROFILE_SID = "BUdummy";
process.env.MC_TWILIO_NUMBER = "+17135550100";
process.env.MC_MESSAGING_SERVICE_SID = "MGdummy";
process.env.RESEND_API_KEY = "re_dummy"; process.env.VAPI_API_KEY = "dummy";
process.env.STEVE_PHONE = "+17135550199"; process.env.URL = "https://machinesandcloud.invalid";
const RealDate = Date, clock = RealDate.parse("2026-06-01T14:00:00Z"); // Monday, month start, 9am Houston.
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const intercepted = [];
globalThis.fetch = async (value) => {
  const url = String(value); intercepted.push(new URL(url).origin + new URL(url).pathname);
  if (url.includes("/BrandRegistrations/BNlegacy")) return Response.json({ status: "IN_REVIEW" });
  if (url.startsWith("https://api.resend.com/")) return Response.json({ id: "mail-dummy" });
  if (url.startsWith("https://api.twilio.com/")) return Response.json({ sid: "SMdummy", status: "queued" });
  throw new Error("Unexpected provider request intercepted");
};
const store = await import("../netlify/functions/lib/store.mjs");
const { newClient } = await import("../netlify/functions/lib/config.mjs");
const { run } = await import("../netlify/functions/scheduler.mjs");
const { fanout, KINDS } = await import("../netlify/functions/lib/fanout.mjs");
const { default: health } = await import("../netlify/functions/health.mjs");
const old = new Date(clock - 60 * 86400000).toISOString();
const base = newClient({ slug: "new-live", ownerKey: "private", owner: { name: "QA Owner", email: "qa@example.invalid", phone: "+17135550140", backupPhone: "+17135550141" }, business: { name: "QA Air", trade: "HVAC", serviceArea: ["Katy"], hours: "Mon-Fri 8am-5pm" } });
base.onboarding = { version: 1, verifiedEmail: base.owner.email };
base.status = "live"; base.liveAt = old; base.createdAt = old;
base.lifecycle = { day7Sent: old }; base.build = { status: "built", builtAt: old };
base.phone = { ...base.phone, businessNumber: "+17135550101", twilioNumber: "+17135550100", twilioNumberSid: "PNnew", brandSid: "BNnew", messagingServiceSid: "MGnew", campaignSid: "QEnew", tenDlc: "brand_pending", forwardingVerified: true };
base.voice = { assistantId: "new-assistant", phoneNumberId: "new-vapi-number" };
base.provision = { status: "done", startedAt: old };
const fixtures = [base, { ...structuredClone(base), slug: "new-testing", status: "testing" }, { ...structuredClone(base), slug: "new-campaign", phone: { ...base.phone, tenDlc: "campaign_pending" } }, { ...structuredClone(base), slug: "new-cancelled", status: "cancelled", cancelledAt: old, serviceEndsAt: old }];
for (const c of fixtures) await store.saveClient(c);
await store.put("index", "number:" + base.phone.twilioNumber, "new-cancelled");
await store.put("index", "vapi:" + base.voice.assistantId, "new-cancelled");
await store.put("bookings", `${base.slug}/booking`, { id: "booking", slug: base.slug, status: "booked", phone: "+17135550142", date: "2026-06-02", window: "8 to 12", issue: "AC", channel: "web" });
await store.put("leads", `${base.slug}/lead`, { id: "lead", slug: base.slug, status: "open", phone: "+17135550143", reason: "emergency", urgency: "emergency" });
await store.put("conversations", `${base.slug}/web/customer`, { slug: base.slug, channel: "web", contact: "customer", messages: [{ role: "user", content: "Gas smell", at: new Date().toISOString() }, { role: "assistant", content: "Unsafe fixture answer", at: new Date().toISOString() }] });
for (const [kind, count] of [["sms_failed", 3], ["voice_failed", 1], ["calendar_failed", 1]]) for (let i = 0; i < count; i++) await store.logEvent(base.slug, kind, { message: "synthetic historical failure" });
const taskKinds = ["reminder_24h", "reminder_1h", "escalate", "callback_check", "visit_check", "consent_ask", "lead_chase", "quote_check", "payment_reminder", "review_request", "review_nudge", "referral_ask", "maintenance_reminder"];
for (const type of taskKinds) await store.scheduleTask(base.slug, new Date(clock - 1000).toISOString(), type, { bookingId: "booking", leadId: "lead", alertId: "alert" });
const snapshot = async () => Object.fromEntries(await Promise.all(["clients", "bookings", "leads", "conversations", "index"].map(async kind => [kind, await Promise.all((await store.list(kind, "")).map(async key => [key, await store.get(kind, key)]))])));
const before = await snapshot();
let checks = 0; const check = fn => { fn(); checks++; };
for (const [forceHour, forceDay] of [[18, "Mon"], [21, "Mon"], [8, "Mon"], [9, "1"]]) {
  const result = await run({ forceHour, forceDay, all: true, inline: true });
  check(() => assert.equal(result.ok, true));
  check(() => assert.equal(result.blocks.tenDlc.polled, 0));
  check(() => assert.equal(result.alerts, 0));
  check(() => assert.equal(result.lifecycles, 0));
  check(() => assert.equal(result.released, 0));
  check(() => assert.equal(intercepted.length, 0));
  check(() => assert.equal(result.results.every(([, outcome]) => outcome === "channel_not_active"), true));
}
for (const kind of KINDS) {
  const result = await fanout(kind);
  check(() => assert.equal(result.shops, 0));
  check(() => assert.equal(result.done, 0));
  check(() => assert.equal(result.errors.length, 0));
}
assert.deepEqual(await snapshot(), before); checks++;
const events = await store.listRecords("events", base.slug, 100);
check(() => assert.equal(events.filter(row => row.type === "task_skipped").length, taskKinds.length));
check(() => assert.equal(events.some(row => ["task_sent", "digest", "weekly", "monthly", "trial_over", "testing_nudge", "day7_draft", "health_alert", "sender_switched", "number_released"].includes(row.type)), false));
const heartbeatResponse = await health(), heartbeat = await heartbeatResponse.json();
check(() => assert.equal(heartbeatResponse.status, 200));
check(() => assert.equal(heartbeat.ok, true));
check(() => assert.deepEqual(heartbeat.failingBlocks, []));
check(() => assert.equal(intercepted.length, 0));
// A legacy pending brand still polls; legacy commercial/lifecycle behavior remains isolated.
await store.saveClient({ slug: "legacy-brand", ownerKey: "legacy", status: "new", owner: {}, business: { name: "Legacy brand" }, phone: { brandSid: "BNlegacy", tenDlc: "brand_pending" } });
const poll = await run({ forceHour: 20, all: true, inline: true });
check(() => assert.equal(poll.blocks.tenDlc.polled, 1));
check(() => assert.equal(intercepted.filter(value => value.includes("BNlegacy")).length, 1));
const legacy = { ...structuredClone(base), slug: "legacy-live", onboarding: undefined, phone: { forwarding: "none" }, voice: { provider: "none" } };
await store.saveClient(legacy);
await run({ forceHour: 20, all: true, inline: true });
const legacyEvents = await store.listRecords("events", legacy.slug, 100);
check(() => assert.equal(legacyEvents.some(row => row.type === "trial_over"), true));
check(() => assert.equal(legacyEvents.some(row => row.type === "day7_draft"), true));
const weekly = await fanout("weekly"), monthly = await fanout("monthly");
check(() => assert.equal(weekly.shops, 1));
check(() => assert.equal(weekly.done, 1));
check(() => assert.equal(monthly.shops, 1));
check(() => assert.equal(monthly.done, 1));
const hashes = {};
for (const path of ["netlify/functions/scheduler.mjs", "netlify/functions/lib/fanout.mjs"]) hashes[path] = createHash("sha256").update(await readFile(path)).digest("hex");
console.log(JSON.stringify({ ok: true, checks, newTenantExternalRequests: 0, newTenantLegacySends: 0, skippedUnavailableTasks: taskKinds.length, newTenantRecordsUnchanged: true, schedulerHeartbeat: 200, legacyInterceptedRequests: intercepted.length, realNetworkRequests: 0, hashes, mode: "memory/fake-model; provider HTTP intercepted; all legacy gates forced" }, null, 2));
