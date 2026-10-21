// Independent offline acceptance for manual owner availability. Does not load .env.
// Socket traffic is disabled; fetch serves only in-process Blobs SDK and Vapi protocol doubles.
// Scripted SDK stream objects exercise chat/SMS tool dispatch without model inference.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";

const networkDisabled = () => { throw new Error("Network disabled by availability-check"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = networkDisabled;
syncBuiltinESMExports();
for (const key of ["ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "VAPI_MODEL", "VAPI_VOICE_PROVIDER", "VAPI_VOICE_ID", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY", "STEVE_PHONE", "STEVE_EMAIL", "MC_TWILIO_NUMBER", "MC_MESSAGING_SERVICE_SID", "DEPLOY_URL", "DEPLOY_PRIME_URL"]) delete process.env[key];
process.env.NODE_ENV = "test";
process.env.URL = "http://127.0.0.1:8892";
process.env.ADMIN_KEY = "offline-availability-admin";
process.env.VAPI_WEBHOOK_SECRET = "offline-availability-vapi";
process.env.MC_FAKE_MODEL = "0";
process.env.ANTHROPIC_API_KEY = "offline-scripted-stream-no-network";
process.env.VAPI_API_KEY = "offline-vapi-transport-double";
process.env.MC_MEMORY_STORE = "1";

const blobs = new Map();
let revision = 0, conflicts = 0, unexpectedRequests = 0, fault = null, intercept = null;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin !== "https://availability-blobs.invalid") { unexpectedRequests++; return networkDisabled(); }
  const [, site, kind, ...parts] = url.pathname.split("/").map(decodeURIComponent);
  assert.equal(site, "offline-site"); assert.ok(kind.startsWith("site:"));
  const key = parts.join("/"), name = `${kind}/${key}`, method = String(init.method || "GET").toUpperCase();
  if (intercept && intercept.match({ method, kind, key, init })) {
    const held = intercept; intercept = null;
    held.entered(); await held.release;
  }
  if (fault && fault.method === method && fault.kind === kind && key.startsWith(fault.prefix)) {
    fault = null; return new Response("offline injected storage failure", { status: 400 });
  }
  if (method === "GET" && !key) {
    const prefix = url.searchParams.get("prefix") || "";
    return Response.json({ blobs: [...blobs.keys()].filter((k) => k.startsWith(kind + "/" + prefix)).map((k) => ({ key: k.slice(kind.length + 1) })), directories: [] });
  }
  const current = blobs.get(name), headers = new Headers(init.headers);
  if (method === "GET") return current ? new Response(current.value, { headers: { etag: current.etag, "content-type": "application/json" } }) : new Response(null, { status: 404 });
  if (method === "DELETE") { blobs.delete(name); return new Response(null, { status: 204 }); }
  assert.equal(method, "PUT");
  if ((headers.get("if-none-match") === "*" && current) || (headers.has("if-match") && headers.get("if-match") !== current?.etag)) {
    conflicts++; return new Response(null, { status: 412 });
  }
  const etag = String(++revision); blobs.set(name, { value: init.body, etag });
  return new Response(null, { headers: { etag } });
};

const { setEnvironmentContext } = await import("@netlify/blobs");
setEnvironmentContext({ siteID: "offline-site", token: "offline-token", edgeURL: "https://availability-eventual.invalid", uncachedEdgeURL: "https://availability-blobs.invalid" });
const store = await import("../netlify/functions/lib/store.mjs");
const desk = await import("../netlify/functions/lib/desk.mjs");
const { newClient } = await import("../netlify/functions/lib/config.mjs");
const clientHandler = (await import("../netlify/functions/client.mjs")).default;
const vapiHandler = (await import("../netlify/functions/vapi.mjs")).default;
const chatHandler = (await import("../netlify/functions/chat.mjs")).default;
const smsAgentHandler = (await import("../netlify/functions/sms-agent-background.mjs")).default;
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const output = console.log, originalError = console.error;
let sendLogs = 0, expectedErrors = 0, serial = 0, assertions = 0;
console.log = () => { sendLogs++; };
console.error = () => { expectedErrors++; };
const DATE = "2030-11-04", NEXT = "2030-11-05", WINDOWS = ["8 to 12", "12 to 5"];
const checks = [];
function passed(backend, name) { assertions++; checks.push({ backend, name }); }
const records = (kind, c) => store.listJSON(kind, c.slug + "/", Infinity);
async function tasks(c) {
  const found = [];
  for (const key of await store.list("tasks")) { const task = await store.get("tasks", key); if (task.slug === c.slug) found.push(task); }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}
async function shop(capacity = 1) {
  const c = newClient({ slug: `availability-${++serial}`, ownerKey: "offline-owner", owner: { name: "Test owner", email: "owner@example.com", phone: "+17135550102" }, business: { name: "Offline availability", trade: "HVAC", website: "", spanish: false } });
  c.plan = "growth"; c.status = "testing"; c.rules.windowCapacity = capacity; c.windows = [...WINDOWS];
  await store.saveClient(c); return c;
}
const input = (date = DATE, window = WINDOWS[0]) => ({ customer_name: "Synthetic customer", phone: "+17135550101", address: "12 Oak St, Katy", issue: "AC service", date, window, urgency: "flexible", language: "en", notes: "", unsure: "" });
const book = (c, date = DATE, window = WINDOWS[0]) => desk.bookVisit(c, input(date, window), { channel: "test", contact: `synthetic-${++serial}` });
async function owner(c, body = null, key = c.ownerKey) {
  const response = await clientHandler(new Request(`${process.env.URL}/api/client?c=${c.slug}&k=${key}`, body === null ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: response.status, data: await response.json() };
}
const block = (c, date = DATE, window = "") => owner(c, { action: "availability_block", date, window });
const unblock = (c, date = DATE, window = "") => owner(c, { action: "availability_unblock", date, window });
const lookup = (c, date = DATE, days = 1) => store.getAvailability(c, date, days);
async function snapshot(c) { return { bookings: await records("bookings", c), tasks: await tasks(c), events: await records("events", c), sendLogs }; }
function holdRequest(match) {
  let entered, release;
  const enteredPromise = new Promise((resolve) => { entered = resolve; });
  const releasePromise = new Promise((resolve) => { release = resolve; });
  intercept = { match, entered, release: releasePromise };
  return { entered: enteredPromise, release };
}

// Scripted SDK output only. The production runAgent loop still validates/exposes its own tools
// and dispatches their real handlers. This proves wiring, never model decisions or wording.
let fixture = null;
const sdk = new Anthropic({ apiKey: "offline-scripted-stream-no-network" });
const RealDate = Date;
async function withClock(iso, run) {
  const instant = RealDate.parse(iso);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  };
  try { return await run(); } finally { globalThis.Date = RealDate; }
}
Object.getPrototypeOf(sdk.beta.messages).stream = function scriptedStream({ tools, messages, system }) {
  assert.ok(fixture, "a stream fixture is required");
  const last = messages.at(-1), isResult = Array.isArray(last?.content) && last.content.some((x) => x.type === "tool_result");
  let final, text = "";
  if (!isResult) {
    const tool = tools.find((x) => x.name === fixture.name);
    assert.ok(tool, `route exposes ${fixture.name}`);
    if (fixture.name === "get_availability") {
      assert.equal(tool.strict, true);
      assert.equal(tool.input_schema.additionalProperties, false);
      assert.deepEqual([...tool.input_schema.required].sort(), ["date", "days"]);
    }
    fixture.system = Array.isArray(system) ? system.map((x) => x.text).join("\n") : system;
    final = { stop_reason: "tool_use", content: [{ type: "tool_use", id: "offline_tool", name: fixture.name, input: fixture.input }], usage: { input_tokens: 0, output_tokens: 0 } };
  } else {
    const result = last.content.find((x) => x.type === "tool_result");
    fixture.result = String(result.content).split("\n\nDelivery reminder:")[0]; fixture.isError = result.is_error;
    text = fixture.reply || "Offline route probe complete.";
    final = { stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 0, output_tokens: 0 } };
  }
  return { async *[Symbol.asyncIterator]() { if (text) yield { type: "content_block_delta", delta: { type: "text_delta", text } }; }, finalMessage: async () => final };
};
async function routeTool(c, route, name, input) {
  if (route === "voice") {
    const response = await vapiHandler(new Request(`${process.env.URL}/api/vapi`, { method: "POST", headers: { "content-type": "application/json", "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET }, body: JSON.stringify({ message: { type: "tool-calls", assistant: { metadata: { slug: c.slug } }, customer: { number: "+17135550103" }, toolCallList: [{ id: "offline_tool", function: { name, arguments: input } }] } }) }));
    assert.equal(response.status, 200);
    const result = (await response.json()).results[0];
    return result.error ? { isError: true, content: result.error } : { isError: false, content: result.result };
  }
  fixture = { name, input };
  if (route === "chat") {
    const response = await chatHandler(new Request(`${process.env.URL}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client: c.slug, key: c.ownerKey, channel: "test", contact: `probe-${++serial}`, messages: [{ role: "user", content: "What recorded windows are open?" }] }) }));
    assert.equal(response.status, 200); await response.text();
  } else {
    const conv = await store.getConversation(c.slug, "sms", "+17135550103"); conv.messages.push({ role: "user", content: "What recorded windows are open?", at: new Date().toISOString() }); await store.saveConversation(conv);
    const response = await smsAgentHandler(new Request(`${process.env.URL}/api/sms-agent-background`, { method: "POST", headers: { "content-type": "application/json", "x-admin-key": process.env.ADMIN_KEY }, body: JSON.stringify({ slug: c.slug, from: "+17135550103" }) }));
    assert.equal(response.status, 200);
  }
  assert.notEqual(fixture.result, undefined, `${route}: dispatched tool and returned a result`);
  return { isError: fixture.isError, content: fixture.result };
}
const routeLookup = (c, route, date = DATE, days = 1) => routeTool(c, route, "get_availability", { date, days });

async function suite(backend) {
  process.env.MC_MEMORY_STORE = backend === "memory" ? "1" : "0";
  let c = await shop();
  assert.deepEqual((await lookup(c)).openings, [{ date: DATE, windows: WINDOWS }]);
  let result = await block(c, DATE, "8-12");
  assert.equal(result.status, 200); assert.equal(result.data.ok, true);
  assert.deepEqual(result.data.availabilityBlocks, [{ date: DATE, window: WINDOWS[0], existingBookings: 0 }]);
  assert.deepEqual((await lookup(c)).openings, [{ date: DATE, windows: [WINDOWS[1]] }]);
  assert.deepEqual((await block(c, DATE, "08:00 to 12:00")).data.availabilityBlocks, result.data.availabilityBlocks);
  assert.deepEqual((await owner(c)).data.availabilityBlocks, result.data.availabilityBlocks);
  assert.deepEqual((await block(c, DATE)).data.availabilityBlocks.map((x) => x.window).sort(), ["", WINDOWS[0]]);
  assert.deepEqual((await lookup(c)).openings[0].windows, []);
  assert.equal((await unblock(c, DATE)).status, 200);
  assert.deepEqual((await lookup(c)).openings[0].windows, [WINDOWS[1]]);
  assert.equal((await unblock(c, DATE, "8 AM – 12 PM")).status, 200);
  assert.deepEqual((await unblock(c, DATE, "8-12")).data.availabilityBlocks, []);
  assert.deepEqual((await lookup(c)).openings[0].windows, WINDOWS);
  assert.equal((await owner(c, { action: "availability_block", date: DATE, window: "" }, "wrong-owner")).status, 403);
  assert.equal((await owner(c, null, "")).data.availabilityBlocks, undefined);
  passed(backend, "owner add/remove/reload, canonical labels, idempotence and auth");

  const clean = await store.getAvailabilityBlocks(c);
  const invalid = [
    { date: "2030-02-29", window: "" }, { date: "2030-04-31", window: "" }, { date: "2030-13-01", window: "" },
    { date: "2030-00-10", window: "" }, { date: "2030-11-00", window: "" }, { date: "2030-1-01", window: "" },
    { date: "2030-11-04T12:00:00Z", window: "" }, { date: "tomorrow", window: "" }, { date: "", window: "" },
    { date: 20301104, window: "" }, { date: null, window: "" }, { date: DATE, window: "10 to 2" },
    { date: DATE, window: "twenty" }, { date: DATE, window: [WINDOWS[0]] }, { date: DATE, window: 8 },
    { date: "2020-01-01", window: "" },
  ];
  for (const value of invalid) {
    const rejected = await owner(c, { action: "availability_block", ...value });
    assert.equal(rejected.status, 400, `${backend}: reject ${JSON.stringify(value)}`);
    assert.deepEqual(await store.getAvailabilityBlocks(c), clean);
  }
  for (const days of [0, 15, 1.5, "2", null]) await assert.rejects(() => lookup(c, DATE, days), undefined, `${backend}: invalid lookup days ${days}`);
  for (const date of ["2030-02-29", "2030-04-31", "2020-01-01", "nonsense"]) await assert.rejects(() => lookup(c, date, 1));
  passed(backend, "invalid dates/windows/types/past and lookup range fail without mutation");

  for (const [from, expected] of [
    ["2030-03-09", ["2030-03-09", "2030-03-10", "2030-03-11"]],
    ["2030-11-02", ["2030-11-02", "2030-11-03", "2030-11-04"]],
    ["2032-02-28", ["2032-02-28", "2032-02-29", "2032-03-01"]],
    ["2030-12-31", ["2030-12-31", "2031-01-01", "2031-01-02"]],
  ]) {
    const available = await lookup(c, from, 3);
    assert.equal(available.timezone, "America/Chicago"); assert.equal(available.from, from); assert.equal(available.days, 3);
    assert.deepEqual(available.openings.map((x) => x.date), expected);
    assert.ok(available.openings.every((x) => JSON.stringify(x.windows) === JSON.stringify(WINDOWS)), "no assumed weekend/office closure");
  }
  const other = await shop(); await block(c, DATE);
  assert.deepEqual((await lookup(other)).openings[0].windows, WINDOWS);
  assert.deepEqual(await store.getAvailabilityBlocks(other), []);
  passed(backend, "Houston DST/leap/month/year dates, no office-hour inference and isolation");

  let before = await snapshot(c);
  for (const window of [WINDOWS[0], "8-12", "8 AM – 12 PM", WINDOWS[1]]) assert.equal((await book(c, DATE, window)).full, true);
  assert.deepEqual((await snapshot(c)).bookings, before.bookings);
  assert.deepEqual((await snapshot(c)).tasks, before.tasks);
  assert.equal(sendLogs, before.sendLogs, "blocked bookings send nothing");
  for (const [date, window] of [["2030-02-29", WINDOWS[0]], [NEXT, "10 to 2"]]) assert.equal((await book(c, date, window)).full, true);
  assert.equal((await records("bookings", c)).length, 0);
  passed(backend, "direct stale/alias/invalid booking cannot bypass recorded availability");

  c = await shop(2);
  const first = await book(c), second = await book(c);
  assert.ok(first.id && second.id); assert.equal((await book(c)).full, true);
  first.calendarEventId = "offline_existing_calendar_event";
  await store.saveRecord("bookings", first);
  assert.deepEqual((await lookup(c)).openings[0].windows, [WINDOWS[1]]);
  const savedBeforeBlock = await snapshot(c);
  result = await block(c, DATE, "8-12"); assert.equal(result.data.existingBookings, 2);
  assert.equal(result.data.availabilityBlocks[0].existingBookings, 2); assert.ok(result.data.notice);
  assert.deepEqual(await records("bookings", c), savedBeforeBlock.bookings);
  assert.deepEqual(await tasks(c), savedBeforeBlock.tasks); assert.equal(sendLogs, savedBeforeBlock.sendLogs);
  await desk.confirmVisit(c, first); assert.equal((await store.getRecord("bookings", c.slug, first.id)).status, "confirmed");
  const self = await desk.rescheduleVisit(c, first, DATE, "8-12"); assert.notEqual(self?.full, true);
  assert.equal((await store.getRecord("bookings", c.slug, first.id)).date, DATE);
  passed(backend, "capacity two; later blocks preserve existing visits, confirmation and self-move");

  await block(c, NEXT);
  before = await snapshot(c); const oldBooking = structuredClone(first);
  assert.equal((await desk.rescheduleVisit(c, first, NEXT, WINDOWS[0])).full, true);
  assert.deepEqual(first, oldBooking);
  assert.deepEqual(await snapshot(c), before, "blocked move has no record/task/event/send side effects");
  const target = await book(c, "2030-11-06", WINDOWS[1]); assert.ok(target.id);
  const targetTwo = await book(c, "2030-11-06", WINDOWS[1]); assert.ok(targetTwo.id);
  before = await snapshot(c);
  assert.equal((await desk.rescheduleVisit(c, first, "2030-11-06", "12-5")).full, true);
  assert.deepEqual(await snapshot(c), before, "full move has no record/task/event/send side effects");
  await unblock(c, NEXT); assert.ok((await book(c, NEXT)).id);
  passed(backend, "blocked/full move preserves original and all side effects; unblock permits booking");

  c = await shop();
  await store.put("bookings", `${c.slug}/0000000000`, { ...input(), slug: c.slug, id: "0000000000", status: "confirmed" });
  for (let i = 0; i < 505; i++) await store.put("bookings", `${c.slug}/f${String(i).padStart(9, "0")}`, { slug: c.slug, id: `f${String(i).padStart(9, "0")}`, status: "done", date: "2025-01-01", window: WINDOWS[0] });
  assert.deepEqual((await lookup(c)).openings[0].windows, [WINDOWS[1]]);
  assert.equal((await book(c, DATE, "8-12")).full, true);
  passed(backend, "active history outside 500-record cap remains authoritative");

  c = await shop(); await block(c, DATE, WINDOWS[0]);
  const expected = await lookup(c, DATE, 2);
  for (const route of ["chat", "sms", "voice"]) {
    const probe = await routeLookup(c, route, DATE, 2);
    assert.equal(!!probe.isError, false, `${route}: successful lookup`);
    const value = typeof probe.content === "string" ? JSON.parse(probe.content) : probe.content;
    assert.deepEqual(value, expected, `${route}: same authoritative openings`);
  }
  passed(backend, "chat/SMS/voice execute the same strict availability tool (scripted stream)");

  await block(c, DATE);
  for (const route of ["chat", "sms", "voice"]) {
    const empty = await routeLookup(c, route);
    assert.equal(!!empty.isError, false, `${route}: exhausted date is successful, not failed`);
    const value = typeof empty.content === "string" ? JSON.parse(empty.content) : empty.content;
    assert.deepEqual(value.openings, [{ date: DATE, windows: [] }]);
    const rejected = await routeTool(c, route, "book_visit", input(DATE, "8-12"));
    assert.equal(!!rejected.isError, false, `${route}: blocked booking is ordinary refusal`);
    assert.ok(!/^Booked[,.]/.test(rejected.content), `${route}: no false booked result`);
    assert.equal((await records("bookings", c)).length, 0);
    assert.equal((await tasks(c)).length, 0);
  }
  passed(backend, "all routes distinguish exhausted success and reject stale blocked booking tools");

  for (const route of ["chat", "sms", "voice"]) {
    const emergencyShop = await shop(); await block(emergencyShop, DATE);
    const notified = await routeTool(emergencyShop, route, "notify_owner", { ...input(), reason: "emergency", urgency: "emergency", issue: "Synthetic gas smell", wanted: "", nobook_reason: "none" });
    assert.equal(!!notified.isError, false);
    const leads = await records("leads", emergencyShop), alerts = await records("alerts", emergencyShop);
    assert.equal(leads.length, 1); assert.equal(leads[0].reason, "emergency"); assert.equal(leads[0].urgency, "emergency");
    assert.ok(alerts.some((a) => a.leadId === leads[0].id && a.kind === "emergency"));
    assert.ok((await tasks(emergencyShop)).some((t) => t.type === "escalate"));
    assert.equal((await records("bookings", emergencyShop)).length, 0);
    if (route !== "voice") assert.ok(fixture.system.includes("safety script before callback promises"), `${route}: emergency delivery instruction preserved`);
  }
  passed(backend, "manual blocks preserve emergency notification/escalation dispatch, never emergency bookings");

  c = await shop();
  const old = { ...input("2020-01-01"), id: "oldvisit01", slug: c.slug, status: "booked", createdAt: "2019-12-31T12:00:00Z" };
  await store.put("bookings", `${c.slug}/${old.id}`, old);
  await desk.confirmVisit(c, old);
  assert.equal((await store.getRecord("bookings", c.slug, old.id)).status, "confirmed");
  c = await shop(); await block(c, DATE, WINDOWS[0]);
  c.windows = [WINDOWS[1]]; await store.saveClient(c);
  assert.equal((await unblock(c, DATE, WINDOWS[0])).status, 200, "can remove an old block after its window is retired");
  assert.deepEqual(await store.getAvailabilityBlocks(c), []);
  passed(backend, "existing past visit confirmation and retired-window block removal remain possible");

  c = await shop();
  await withClock("2030-11-04T17:59:59Z", async () => {
    assert.deepEqual((await lookup(c, "today")).openings[0].windows, WINDOWS, "in-progress window remains until known end");
  });
  const priorShop = await shop();
  const priorVisit = await withClock("2030-11-04T17:59:59Z", () => book(priorShop));
  assert.ok(priorVisit.id);
  await withClock("2030-11-04T18:00:00Z", async () => {
    assert.deepEqual((await lookup(c, "today")).openings, [{ date: DATE, windows: [WINDOWS[1]] }], "exact noon closes morning window");
    assert.deepEqual((await lookup(c, "tomorrow")).openings, [{ date: NEXT, windows: WINDOWS }]);
    const cleanState = await snapshot(c);
    for (const alias of [WINDOWS[0], "8-12", "08:00 to 12:00", "8 AM – 12 PM"]) assert.equal((await book(c, DATE, alias)).full, true);
    assert.equal((await records("bookings", c)).length, 0); assert.deepEqual(await tasks(c), cleanState.tasks); assert.equal(sendLogs, cleanState.sendLogs);
    for (const route of ["chat", "sms", "voice"]) {
      const rejected = await routeTool(c, route, "book_visit", input(DATE, "8-12"));
      assert.equal(!!rejected.isError, false); assert.ok(!/^Booked[,.]/.test(rejected.content));
    }
    assert.equal((await records("bookings", c)).length, 0);
    await desk.confirmVisit(priorShop, priorVisit);
    assert.equal((await store.getRecord("bookings", priorShop.slug, priorVisit.id)).status, "confirmed");
    assert.notEqual((await desk.rescheduleVisit(priorShop, priorVisit, DATE, "8-12"))?.full, true, "existing expired same-slot move remains valid");
    const moving = await book(c, NEXT); assert.ok(moving.id);
    const beforeMove = await snapshot(c);
    assert.equal((await desk.rescheduleVisit(c, moving, DATE, "8-12")).full, true);
    assert.deepEqual(await snapshot(c), beforeMove, "expired move preserves original and side effects");
    for (const [date, window] of [["", WINDOWS[0]], [NEXT, ""], ["2030-02-29", WINDOWS[0]], [NEXT, "10 to 2"]]) {
      assert.equal((await desk.rescheduleVisit(c, moving, date, window)).full, true);
      assert.deepEqual(await snapshot(c), beforeMove, "explicit invalid move cannot reuse original silently");
    }
  });
  await withClock("2030-11-04T23:00:00Z", async () => {
    assert.deepEqual((await lookup(c, "today")).openings[0].windows, [], "both numeric windows ended");
  });
  passed(backend, "Houston end boundary/aliases, stale three-route bypass, expired self/status and move safety");

  c = await shop();
  await withClock("2030-11-04T05:59:59Z", async () => {
    assert.equal((await lookup(c, "today")).from, "2030-11-03");
    assert.deepEqual((await lookup(c, "today")).openings[0].windows, []);
  });
  await withClock("2030-11-04T06:00:00Z", async () => {
    assert.equal((await lookup(c, "today")).from, DATE);
    assert.deepEqual((await lookup(c, "today")).openings[0].windows, WINDOWS);
  });
  c.windows = ["1 AM to 3 AM", "3 AM to 5 AM"]; await store.saveClient(c);
  await withClock("2030-03-10T07:59:59Z", async () => assert.deepEqual((await lookup(c, "today")).openings[0].windows, c.windows));
  await withClock("2030-03-10T08:00:00Z", async () => assert.deepEqual((await lookup(c, "today")).openings[0].windows, [c.windows[1]], "spring jump reaches 3 am once"));
  c.windows = ["12 AM to 1 AM", "1 AM to 3 AM"]; await store.saveClient(c);
  for (const iso of ["2030-11-03T06:00:00Z", "2030-11-03T07:00:00Z"]) await withClock(iso, async () => assert.deepEqual((await lookup(c, "today")).openings[0].windows, [c.windows[1]], "both repeated 1 am hours use Houston wall time"));
  c.windows = ["morning", "overnight"]; await store.saveClient(c);
  await withClock("2030-11-04T23:00:00Z", async () => assert.deepEqual((await lookup(c, "today")).openings[0].windows, c.windows, "named windows do not gain invented end times"));
  passed(backend, "midnight and Houston DST wall-time boundaries; no invented named-window end");

  c = await shop();
  const parallel = await Promise.all(Array.from({ length: 12 }, (_, i) => i % 2 ? block(c, DATE, WINDOWS[0]) : book(c)));
  assert.ok(parallel.filter((x) => x?.id).length <= 1);
  assert.equal((await store.getAvailabilityBlocks(c)).length, 1);
  assert.deepEqual((await lookup(c)).openings[0].windows, [WINDOWS[1]]);
  assert.equal((await book(c)).full, true);
  passed(backend, "competing block/reserve retains both state changes and stops later bookings");

  if (backend === "blobs") {
    c = await shop();
    let held = holdRequest(({ method, kind, key }) => method === "PUT" && kind === "site:bookings" && key.startsWith(c.slug + "/"));
    const priorBooking = book(c); await held.entered;
    result = await block(c, DATE, WINDOWS[0]); assert.equal(result.status, 200);
    held.release(); const prior = await priorBooking; assert.ok(prior.id, "pre-block claim can finish");
    assert.equal((await store.getAvailabilityBlocks(c))[0].existingBookings, 1);
    assert.equal((await book(c)).full, true);
    await desk.confirmVisit(c, prior); assert.equal((await store.getRecord("bookings", c.slug, prior.id)).status, "confirmed");
    passed(backend, "claim before block may finish and remains confirmable");

    c = await shop(); await lookup(c); // Initialize the shared document before capturing a stale CAS.
    held = holdRequest(({ method, kind, key }) => method === "PUT" && kind === "site:index" && key === `capacity:${c.slug}`);
    const blockedUpdate = block(c, DATE, WINDOWS[0]); await held.entered;
    const bookingWhileWriteHeld = await book(c); assert.ok(bookingWhileWriteHeld.id);
    held.release(); assert.equal((await blockedUpdate).status, 200);
    const state = await store.get("index", `capacity:${c.slug}`);
    assert.equal((await store.getAvailabilityBlocks(c))[0].existingBookings, 1);
    assert.ok(JSON.stringify(state).includes(bookingWhileWriteHeld.id), "CAS retry preserves the competing reservation");
    assert.equal((await book(c)).full, true);
    passed(backend, "stale block CAS retries without losing committed reservation");

    c = await shop(); await block(c, DATE, WINDOWS[0]);
    const worker = await import("../netlify/functions/lib/store.mjs?availability-independent-worker");
    const lateClaim = await worker.reserveBookingWindow(c, "lateclaim01", DATE, "8-12");
    assert.equal(lateClaim.full, true, "block before independent-worker claim wins");
    assert.equal((await records("bookings", c)).length, 0);
    passed(backend, "block before claim rejects independent store instance");

    for (const route of ["chat", "sms", "voice"]) {
      fault = { kind: "site:index", method: "GET", prefix: `capacity:${c.slug}` };
      const failed = await routeLookup(c, route);
      assert.equal(!!failed.isError, true, `${route}: storage failure is tool error`);
      assert.equal(String(failed.content).includes('"openings"'), false);
    }
    fault = { kind: "site:index", method: "GET", prefix: `capacity:${c.slug}` };
    result = await owner(c); assert.equal(result.status, 503); assert.equal(result.data.error, "availability_unavailable");
    fault = { kind: "site:index", method: "PUT", prefix: `capacity:${c.slug}` };
    result = await block(c, NEXT); assert.equal(result.status, 503); assert.equal(result.data.error, "availability_unavailable");
    assert.equal((await store.getAvailabilityBlocks(c)).some((x) => x.date === NEXT), false);
    passed(backend, "read/write failures stay explicit across owner and all three tool routes");
  }

  c = await shop();
  const dates = Array.from({ length: 100 }, (_, i) => new Date(Date.UTC(2031, 0, 1 + i)).toISOString().slice(0, 10));
  for (const date of dates) assert.equal((await block(c, date)).status, 200);
  assert.equal((await block(c, dates[0])).status, 200, "duplicate at limit is idempotent");
  assert.equal((await block(c, "2032-01-01")).status, 400);
  assert.equal((await store.getAvailabilityBlocks(c)).length, 100);
  assert.equal((await unblock(c, dates[0])).status, 200);
  assert.equal((await block(c, "2032-01-01")).status, 200);
  passed(backend, "100-block limit, duplicate at limit and removal recovery");
  output(`AVAILABILITY OK: ${backend}`);
}

try {
  await suite("memory");
  await suite("blobs");
  // This transport is a local function, never an HTTP call. All credentials are explicit dummy
  // strings; the socket guard remains active. send.mjs captured no Twilio keys on import.
  const blobFetch = globalThis.fetch, voiceRequests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin !== "https://api.vapi.ai") return blobFetch(input, init);
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer offline-vapi-transport-double");
    const method = init.method || "GET", body = init.body ? JSON.parse(init.body) : null;
    voiceRequests.push({ path: url.pathname, method, body });
    assert.ok(url.pathname === "/tool" || /^\/tool\/offline-/.test(url.pathname) || url.pathname === "/assistant" || /^\/assistant\/offline-/.test(url.pathname));
    return Response.json({ id: url.pathname === "/tool" ? `offline-tool-${voiceRequests.length}` : "offline-assistant" });
  };
  process.env.TWILIO_ACCOUNT_SID = "offline-twilio-sid"; process.env.TWILIO_AUTH_TOKEN = "offline-twilio-token";
  try {
    const voice = await import("../netlify/functions/lib/vapi.mjs");
    const c = await shop();
    const provisioned = await voice.provisionVoice(c, process.env.URL);
    assert.equal(provisioned.functionToolIds.length, 3);
    assert.deepEqual(voiceRequests.filter((r) => r.path === "/tool").map((r) => r.body.function.name), ["book_visit", "notify_owner", "get_availability"]);
    const availabilityDefinition = voiceRequests.find((r) => r.body?.function?.name === "get_availability").body;
    assert.deepEqual([...availabilityDefinition.function.parameters.required].sort(), ["date", "days"]);
    assert.deepEqual(availabilityDefinition.function.parameters.properties.days.enum, Array.from({ length: 14 }, (_, i) => i + 1));
    c.voice = { provider: "vapi", assistantId: "offline-legacy", toolIds: ["offline-book", "offline-owner"] }; await store.saveClient(c);
    let creates = voiceRequests.filter((r) => r.path === "/tool" && r.method === "POST").length;
    const update = async (summary) => clientHandler(new Request(`${process.env.URL}/api/client?c=${c.slug}&k=${c.ownerKey}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ summary }) }));
    assert.equal((await update("Synthetic migration one")).status, 200);
    let saved = await store.getClient(c.slug); assert.equal(saved.voice.functionToolIds.length, 3);
    assert.equal(voiceRequests.filter((r) => r.path === "/tool" && r.method === "POST").length, creates + 1);
    const migratedId = saved.voice.functionToolIds[2]; creates++;
    assert.equal((await update("Synthetic migration two")).status, 200);
    saved = await store.getClient(c.slug); assert.equal(saved.voice.functionToolIds[2], migratedId);
    assert.equal(voiceRequests.filter((r) => r.path === "/tool" && r.method === "POST").length, creates, "persisted migration does not recreate availability tool");
    passed("simulated-vapi-transport", "three-tool provisioning and persisted two-tool migration without repeated creation");
  } finally {
    globalThis.fetch = blobFetch; delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN;
  }
  assert.equal(unexpectedRequests, 0, "no provider/model/unknown fetch attempted");
  assert.equal(intercept, null, "all deterministic race barriers consumed");
  assert.ok(conflicts > 0, "installed SDK double exercised CAS conflicts");
  output(`AVAILABILITY OK: ${assertions} acceptance groups; ${conflicts} SDK CAS conflicts; ${expectedErrors} expected tool/storage error logs; zero live provider/model/network requests`);
  output(JSON.stringify({ scope: "offline memory + installed Blobs SDK protocol double + simulated Vapi transport; scripted model streams only", checks }, null, 2));
} finally {
  console.log = output;
  console.error = originalError;
}
