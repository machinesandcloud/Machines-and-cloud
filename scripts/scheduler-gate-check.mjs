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

// Background entrypoints must authenticate before parsing or touching retained work,
// including in an unconfigured runtime. The local server supplies its own short key.
const { default: fanoutBackground } = await import("../netlify/functions/scheduler-fanout-background.mjs");
const { default: smsBackground } = await import("../netlify/functions/sms-agent-background.mjs");
const { serviceWorkerAuthorized } = await import("../netlify/functions/lib/managed-sms.mjs");
const savedAdmin = process.env.ADMIN_KEY, savedWorker = process.env.SERVICE_WORKER_KEY;
const authResults = [];
try {
  for (const [name, handler, body] of [
    ["fanout", fanoutBackground, { kind: "digest" }],
    ["sms", smsBackground, { slug: "no-such-auth-shop", from: "+17135550103" }],
  ]) for (const item of [
    { name: "missing key and header", expected: 403 },
    { name: "missing key with caller header", supplied: "caller-cannot-configure-the-server", expected: 403 },
    { name: "empty key", key: "", supplied: "", expected: 403 },
    { name: "configured key without header", key: "local-admin", expected: 403 },
    { name: "wrong key", key: "local-admin", supplied: "wrong-key", expected: 403 },
    { name: "correct local/internal key", key: "local-admin", supplied: "local-admin", expected: 200 },
  ]) {
    if (item.key === undefined) delete process.env.ADMIN_KEY; else process.env.ADMIN_KEY = item.key;
    const headers = { "Content-Type": "application/json" };
    if (item.supplied !== undefined) headers["x-admin-key"] = item.supplied;
    const req = new Request(`https://background-auth.invalid/${name}`, { method: "POST", headers, body: JSON.stringify(body) });
    let parsed = 0; const parse = req.json.bind(req);
    req.json = () => { parsed++; return parse(); };
    const before = await store.get("health", "fanout:digest:last");
    const response = await handler(req);
    authResults.push({ route: name, case: item.name, status: response.status, parsed, expected: item.expected });
    if (item.expected === 403 && response.status === 403) assert.deepEqual(await store.get("health", "fanout:digest:last"), before, "denied work stays untouched");
    await response.text();
  }
  console.log("BACKGROUND AUTH RESULTS", JSON.stringify(authResults));
  for (const result of authResults) {
    assert.equal(result.status, result.expected, `${result.route}: ${result.case}`);
    assert.equal(result.parsed, result.expected === 403 ? 0 : 1, "authenticate before parsing work");
  }
  for (const [configured, supplied, expected] of [[undefined, undefined, false], ["", "", false], ["short", "short", false], ["w".repeat(32), "wrong", false], ["w".repeat(32), "w".repeat(32), true]]) {
    if (configured === undefined) delete process.env.SERVICE_WORKER_KEY; else process.env.SERVICE_WORKER_KEY = configured;
    assert.equal(serviceWorkerAuthorized(new Request("https://background-auth.invalid/worker", { headers: supplied === undefined ? {} : { "x-service-worker-key": supplied } })), expected);
  }

  // Ordinary scheduled fanout and SMS ingress pass their own key to the actual
  // background handlers. All HTTP below is an in-process fixture, not transport.
  const pollingFetch = globalThis.fetch, internalCalls = [], smsSends = [];
  process.env.ADMIN_KEY = "local-admin";
  process.env.URL = "https://background-auth.invalid";
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === process.env.URL && ["/.netlify/functions/scheduler-fanout-background", "/.netlify/functions/sms-agent-background"].includes(url.pathname)) {
      assert.equal(init.method, "POST"); assert.equal(new Headers(init.headers).get("x-admin-key"), process.env.ADMIN_KEY);
      internalCalls.push(url.pathname);
      return (url.pathname.endsWith("scheduler-fanout-background") ? fanoutBackground : smsBackground)(new Request(url, init));
    }
    if (!noKeys && url.href === "https://api.twilio.com/2010-04-01/Accounts/ACoffline-gate/Messages.json" && init.method === "POST") {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get("To"), "+17135550103"); assert.ok(body.get("Body"));
      smsSends.push(body.get("To")); return Response.json({ sid: "SMoffline-auth", status: "queued" });
    }
    return pollingFetch(input, init);
  };
  try {
    clock = RealDate.parse("2026-10-22T23:00:17.755Z"); // Thursday 18:00 Houston.
    await store.put("health", "brake", { on: false });
    pollRequests = [];
    const scheduled = await run();
    assert.equal(scheduled.ok, true); assert.equal(scheduled.blocks["fanout:digest"].started, true);
    assert.deepEqual(pollRequests, noKeys ? [] : ["brand", "campaign"]);
    assert.deepEqual(internalCalls, ["/.netlify/functions/scheduler-fanout-background"]);
    assert.equal((await store.get("health", "fanout:digest:last")).done, 0);

    const { newClient } = await import("../netlify/functions/lib/config.mjs");
    const { default: smsInbound } = await import("../netlify/functions/sms.mjs");
    const client = newClient({ slug: "offline-auth-sms", ownerKey: "offline-owner", owner: { name: "QA", phone: "+17135550104" }, business: { name: "Offline Auth Shop", trade: "Plumbing", hours: "Mon-Fri 8am-5pm" } });
    client.status = "live"; client.phone = { ...client.phone, twilioNumber: "+17135550102", tenDlc: "approved" };
    await store.saveClient(client); await store.indexClient(client);
    const inbound = await smsInbound(new Request(`${process.env.URL}/api/sms`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-admin-key": process.env.ADMIN_KEY }, body: new URLSearchParams({ From: "+17135550103", To: client.phone.twilioNumber, Body: "What are your hours?" }) }));
    assert.equal(inbound.status, 200); await inbound.text();
    assert.deepEqual(internalCalls, ["/.netlify/functions/scheduler-fanout-background", "/.netlify/functions/sms-agent-background"]);
    const conversation = await store.getConversation(client, "sms", "+17135550103");
    assert.deepEqual(conversation.messages.map(message => message.role), ["user", "assistant"]);
    assert.ok(conversation.messages[1].content);
    assert.equal(smsSends.length, noKeys ? 0 : 1, "no-key mode records the local reply without provider transport");
  } finally { globalThis.fetch = pollingFetch; }
} finally {
  if (savedAdmin === undefined) delete process.env.ADMIN_KEY; else process.env.ADMIN_KEY = savedAdmin;
  if (savedWorker === undefined) delete process.env.SERVICE_WORKER_KEY; else process.env.SERVICE_WORKER_KEY = savedWorker;
}
assert.equal(blockedAttempts, 0);
console.log("BACKGROUND AUTH OK: 12 actual entrypoint cases, 5 managed-worker verifier cases, ordinary scheduled and SMS internal routes; 0 physical transport");
console.log(`SCHEDULER GATE OK: ${cases.length} ${noKeys ? "no-key" : "dummy-key"} cases; actual run and persisted health, gate/brake/force semantics; 0 live network/provider/model requests`);
