// Independent cross-service review: a timed-out/held first insert can commit
// after a newer cancellation has observed GET404. No real Google access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fixture } from "./calendar-test-fixtures.mjs";
const index = process.argv.indexOf("--output"), output = index < 0 ? null : process.argv[index + 1];
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error("Choose a new receipt");
const source = "netlify/functions/lib/calendar-delivery.mjs", hash = () => createHash("sha256").update(readFileSync(source)).digest("hex"), result = { at: new Date().toISOString(), mode: "independent real Calendar engine; physical network disabled; delayed HTTP insert before remote effect", before: hash(), checks: [], observations: {} };
const f = await fixture(), { client, session } = await f.seed("independent-late-create"); await f.connect(client, session);
const booking = { slug: client.slug, id: "visit-late", status: "booked", delivery: { tenantIdentity: f.connection.calendarTenantIdentity(client) }, customer_name: "Alex Fixture", phone: "+17135550122", address: "10 Fixture St", issue: "AC not cooling", date: "2027-01-15", window: "8 to 12", notes: "", urgency: "this_week", createdAt: new Date().toISOString() };
const bookingKey = `${client.slug}/${booking.id}`, jobKey = f.delivery.calendarDeliveryKey(client, booking.id), eventId = f.delivery.calendarEventId(client, booking.id), eventKey = `owner@calendar.example.test/${eventId}`;
await f.store.put("bookings", bookingKey, booking); await f.delivery.queueCalendarBooking(client, booking);
let release, reached, held = false; const barrier = new Promise(resolve => { release = resolve; }), arrived = new Promise(resolve => { reached = resolve; });
f.intercept(async call => { if (!held && call.method === "POST" && call.url.includes("/events")) { held = true; reached(); await barrier; } });
const work = () => f.delivery.runCalendarDelivery({ limit: 10, discoveryLimit: 200, budgetMs: 12000 });
const old = work(); await arrived;
await f.store.put("bookings", bookingKey, { ...booking, status: "cancelled" }); await f.delivery.queueCalendarBooking(client, booking); await work();
result.observations.beforeLateCreate = await f.store.get("calendar_deliveries", jobKey);
release(); await old; f.intercept(null);
for (let i = 0; i < 5; i++) { f.advance(120000); await work(); }
result.observations.afterRecovery = await f.store.get("calendar_deliveries", jobKey); result.observations.remoteStillExists = f.events.has(eventKey); result.observations.localBooking = await f.store.get("bookings", bookingKey);
for (const [name, test] of [
  ["GET404 cannot confirm cancellation while an older first insert remains unresolved", () => assert.notEqual(result.observations.beforeLateCreate.state, "cancelled")],
  ["Late old insert is reconciled and removed while the cancelled workspace record is retained", () => { assert.equal(f.events.has(eventKey), false); assert.equal(result.observations.afterRecovery.state, "cancelled"); assert.equal(result.observations.localBooking.status, "cancelled"); }],
]) { try { test(); result.checks.push({ name, pass: true }); } catch (error) { result.checks.push({ name, pass: false, error: error.message }); } }
result.after = hash(); result.sourceStable = result.before === result.after; result.externalRequests = 0; result.passed = result.checks.filter(row => row.pass).length; result.total = result.checks.length; result.ok = result.sourceStable && result.passed === result.total;
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify({ ok: result.ok, passed: result.passed, total: result.total, beforeLateState: result.observations.beforeLateCreate.state, finalState: result.observations.afterRecovery.state, remoteStillExists: result.observations.remoteStillExists, failures: result.checks.filter(row => !row.pass), output }, null, 2)); if (!result.ok) process.exitCode = 1;
