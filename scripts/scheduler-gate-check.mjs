// Offline regression for the configured-key scheduler gate that blank-key smoke skips.
// Explicit dummy credentials enable A2P; exact in-process Twilio fixtures serve polling.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
let blockedAttempts = 0, pollRequests = [];
const blocked = () => { blockedAttempts++; throw new Error("Network disabled by scheduler-gate-check"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = blocked;
syncBuiltinESMExports();
const noKeys = process.argv.includes("--no-a2p");
for (const key of ["ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PRIMARY_PROFILE_SID", "VAPI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY", "STEVE_PHONE", "MC_TWILIO_NUMBER", "MC_MESSAGING_SERVICE_SID", "URL"]) delete process.env[key];
if (!noKeys) {
  process.env.TWILIO_ACCOUNT_SID = "ACoffline-gate";
  process.env.TWILIO_AUTH_TOKEN = "offline-gate-token";
  process.env.TWILIO_PRIMARY_PROFILE_SID = "BUoffline-gate";
}
process.env.MC_MEMORY_STORE = "1";
process.env.MC_FAKE_MODEL = "1";
process.env.MC_MEMORY_FILE = "";
const RealDate = Date;
let clock = RealDate.parse("2026-10-22T01:30:17.755Z"); // Actual reported gate, 20:30 Houston.
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
globalThis.fetch = async (input, init = {}) => {
  const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
  if (String(init.method || "GET").toUpperCase() !== "GET") return blocked();
  if (url === "https://messaging.twilio.com/v1/a2p/BrandRegistrations/BNoffline-brand") {
    pollRequests.push("brand"); return Response.json({ status: "IN_REVIEW" });
  }
  if (url === "https://messaging.twilio.com/v1/Services/MGoffline-service/Compliance/Usa2p/QEoffline-campaign") {
    pollRequests.push("campaign"); return Response.json({ campaign_status: "PENDING" });
  }
  return blocked();
};
const store = await import("../netlify/functions/lib/store.mjs");
const { run } = await import("../netlify/functions/scheduler.mjs");
const { default: health } = await import("../netlify/functions/health.mjs");
await store.saveClient({ slug: "offline-brand", status: "new", owner: {}, business: { name: "Offline brand" }, phone: { brandSid: "BNoffline-brand", tenDlc: "brand_pending" } });
await store.saveClient({ slug: "offline-campaign", status: "new", owner: {}, business: { name: "Offline campaign" }, phone: { brandSid: "BNoffline-existing", tenDlc: "campaign_pending", messagingServiceSid: "MGoffline-service", campaignSid: "QEoffline-campaign" } });
const cases = noKeys ? [{ name: "no keys retain early skip", minute: 30, poll: false }] : [
  { name: "actual scheduled :30 configured-key run", minute: 30, poll: true },
  { name: "scheduled :00", minute: 0, poll: true },
  ...[10, 20, 40, 50].map(minute => ({ name: `scheduled :${minute} skip`, minute, poll: false })),
  { name: "brake at :30; due tasks still run first", minute: 30, brake: true, poll: false, due: true },
  { name: "all forces off-minute scan", minute: 10, args: { all: true }, poll: true },
  { name: "brake overrides all", minute: 10, brake: true, args: { all: true }, poll: false },
  { name: "forced hour retains :00 gate", minute: 10, args: { forceHour: 20 }, poll: true },
];
const results = [];
for (const item of cases) {
  clock = RealDate.parse(`2026-10-22T01:${String(item.minute).padStart(2, "0")}:17.755Z`);
  await store.put("health", "brake", { on: !!item.brake });
  if (item.due) await store.scheduleTask("nonexistent-offline-shop", new Date(clock - 1000).toISOString(), "reminder_1h", {});
  pollRequests = [];
  const result = await run({ ...item.args, inline: true });
  const persisted = await store.get("health", "scheduler:lastRun");
  const healthResponse = await health();
  const healthBody = await healthResponse.json();
  const recorded = { name: item.name, tenDlc: result.blocks.tenDlc, due: result.due, polls: [...pollRequests], persistedOK: persisted.ok, healthStatus: healthResponse.status, health: healthBody };
  console.log(JSON.stringify(recorded));
  assert.equal(result.blocks.tenDlc.ok, true, item.name);
  assert.deepEqual(Object.keys(result.blocks).slice(0, 2), ["tasks", "tenDlc"], "due tasks retain first block");
  assert.equal(result.ok, true); assert.equal(persisted.ok, true);
  assert.equal(healthResponse.status, 200); assert.equal(healthBody.ok, true); assert.deepEqual(healthBody.failingBlocks, []);
  assert.equal(healthBody.lastRunAt, new Date(clock).toISOString());
  if (item.poll) {
    assert.equal(result.blocks.tenDlc.polled, 2); assert.deepEqual(pollRequests, ["brand", "campaign"]);
    assert.equal((await store.getClient("offline-brand")).phone.brandStatus, "IN_REVIEW");
    assert.equal((await store.getClient("offline-campaign")).phone.campaignStatus, "PENDING");
  } else {
    assert.deepEqual(pollRequests, []);
    assert.equal(result.blocks.tenDlc.skipped, noKeys ? "no keys" : "runs at :00 and :30");
  }
  if (item.due) { assert.equal(result.due, 1); assert.deepEqual(result.results, [["reminder_1h", "no client"]]); assert.deepEqual(await store.list("tasks"), []); }
  results.push(recorded);
}
assert.equal(blockedAttempts, 0);
assert.deepEqual(await store.list("events"), [], "pending polls must not notify owners");
console.log(`SCHEDULER GATE OK: ${cases.length} ${noKeys ? "no-key" : "dummy-key"} cases; actual run and persisted health, gate/brake/force semantics; 0 live network/provider/model requests`);
