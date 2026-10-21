// Offline regressions for arrival-window capacity. Never loads .env; every network request is
// rejected except the in-process Blobs protocol double used to exercise the installed SDK's CAS.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
const blocked = () => { throw new Error("Network disabled by capacity-check"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = blocked;
syncBuiltinESMExports();
for (const key of ["ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY", "URL", "STEVE_PHONE", "VAPI_WEBHOOK_SECRET", "MC_TWILIO_NUMBER", "MC_MESSAGING_SERVICE_SID"]) delete process.env[key];
process.env.ADMIN_KEY = "capacity-check-key";
process.env.NODE_ENV = "test"; // Installed SDK retries use milliseconds, never live network calls.
const blobData = new Map(); let revision = 0, conflicts = 0, fault = null, unexpected = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin !== "https://capacity-blobs.invalid") { unexpected++; return blocked(); }
  const [, site, kind, ...parts] = url.pathname.split("/").map(decodeURIComponent);
  assert.equal(site, "offline-site"); assert.ok(kind.startsWith("site:"));
  const key = parts.join("/"), name = `${kind}/${key}`, method = String(init.method || "GET").toUpperCase();
  let matchedFault = fault && fault.kind === kind && fault.method === method && key.startsWith(fault.prefix) ? fault : null;
  if (matchedFault?.skip) { matchedFault.skip--; matchedFault = null; }
  if (matchedFault && matchedFault.mode !== "commit-throw") { fault = null; return new Response("injected storage failure", { status: 400 }); }
  if (method === "GET" && !key) {
    const prefix = url.searchParams.get("prefix") || "";
    return Response.json({ blobs: [...blobData.keys()].filter((k) => k.startsWith(kind + "/" + prefix)).map((k) => ({ key: k.slice(kind.length + 1) })), directories: [] });
  }
  const current = blobData.get(name), headers = new Headers(init.headers);
  if (method === "GET") return current ? new Response(current.value, { headers: { etag: current.etag, "content-type": "application/json" } }) : new Response(null, { status: 404 });
  if (method === "DELETE") { blobData.delete(name); return new Response(null, { status: 204 }); }
  assert.equal(method, "PUT");
  if ((headers.get("if-none-match") === "*" && current) || (headers.has("if-match") && headers.get("if-match") !== current?.etag)) { conflicts++; return new Response(null, { status: 412 }); }
  const etag = String(++revision); blobData.set(name, { value: init.body, etag });
  if (matchedFault) {
    if (--matchedFault.remaining === 0) fault = matchedFault.rejectRetry ? { ...matchedFault, mode: "reject" } : null;
    throw new TypeError("injected lost response after committed PUT");
  }
  return new Response(null, { headers: { etag } });
};
const { setEnvironmentContext } = await import("@netlify/blobs");
setEnvironmentContext({ siteID: "offline-site", token: "offline-token", edgeURL: "https://capacity-eventual.invalid", uncachedEdgeURL: "https://capacity-blobs.invalid" });
process.env.MC_MEMORY_STORE = "1";
const store = await import("../netlify/functions/lib/store.mjs");
const desk = await import("../netlify/functions/lib/desk.mjs");
const sms = (await import("../netlify/functions/sms.mjs")).default;
const { newClient } = await import("../netlify/functions/lib/config.mjs");
const originalLog = console.log; let logs = 0; console.log = () => { logs++; };
let serial = 0;
const DATE = "2030-11-20", NEXT = "2030-11-21";
const input = (date = DATE, window = "8 to 12") => ({ customer_name: "Capacity test", phone: "+17135550101", address: "12 Oak St, Katy", issue: "AC repair", date, window, urgency: "flexible", language: "en", notes: "", unsure: "" });
async function shop(capacity = 1) {
  const c = newClient({ slug: `capacity-${++serial}`, ownerKey: "offline-owner", owner: { name: "Test owner", email: "owner@example.com", phone: "+17135550102" }, business: { name: "Offline capacity check", trade: "HVAC", website: "", spanish: false } });
  c.plan = "growth"; c.rules.windowCapacity = capacity; await store.saveClient(c); return c;
}
const book = (c, date = DATE, window = "8 to 12") => desk.bookVisit(c, input(date, window), { channel: "test", contact: `test-${++serial}` });
const records = (kind, c) => store.listJSON(kind, c.slug + "/", Infinity);
async function taskRecords(c) { const out = []; for (const key of await store.list("tasks", "")) { const t = await store.get("tasks", key); if (t.slug === c.slug) out.push(t); } return out; }
async function suite(backend) {
  process.env.MC_MEMORY_STORE = backend === "memory" ? "1" : "0";
  let c = await shop();
  const simultaneous = await Promise.all(Array.from({ length: 12 }, () => book(c)));
  assert.equal(simultaneous.filter((r) => !r.full).length, 1, `${backend}: one concurrent winner`);
  assert.equal((await records("bookings", c)).length, 1);
  for (const alias of ["8 to12", "8-12", "08:00 to 12:00", "8 AM – 12 PM"]) assert.equal((await book(c, DATE, alias)).full, true, `${backend}: ${alias}`);
  assert.equal(desk.fullMessage(c, DATE, "8-12").includes("other window (12 to 5)"), true, `${backend}: full reply does not offer the occupied alias`);
  assert.equal(store.canonicalWindow("20 to 22"), store.canonicalWindow("8pm to 10pm"), `${backend}: 24-hour aliases`);
  assert.notEqual(store.canonicalWindow("20 to 22"), store.canonicalWindow("8 to 10"));

  c = await shop(3);
  const custom = await Promise.all(Array.from({ length: 12 }, () => book(c)));
  assert.equal(custom.filter((r) => !r.full).length, 3);
  assert.deepEqual(await desk.windowTaken(c, DATE, "8-12"), { full: true, count: 3, capacity: 3 });

  c = await shop();
  await store.put("bookings", `${c.slug}/0000000000`, { ...input(), slug: c.slug, id: "0000000000", status: "confirmed" });
  for (let i = 0; i < 505; i++) await store.put("bookings", `${c.slug}/f${String(i).padStart(9, "0")}`, { slug: c.slug, id: `f${String(i).padStart(9, "0")}`, status: "done", date: "2029-01-01", window: "8 to 12" });
  assert.equal((await book(c)).full, true, `${backend}: active booking outside 500 lexical records`);

  c = await shop();
  const first = await book(c), second = await book(c, DATE, "12 to 5");
  const before = { b: structuredClone(first), records: await records("bookings", c), tasks: await taskRecords(c), events: await records("events", c), logs };
  assert.equal((await desk.rescheduleVisit(c, first, DATE, "12-5")).full, true);
  assert.deepEqual(first, before.b);
  assert.deepEqual(await records("bookings", c), before.records);
  assert.deepEqual(await taskRecords(c), before.tasks);
  assert.deepEqual(await records("events", c), before.events);
  assert.equal(logs, before.logs, `${backend}: full move sends nothing`);
  await desk.rescheduleVisit(c, first, NEXT, "8 to12");
  assert.equal((await desk.windowTaken(c, DATE, "8-12")).count, 0);
  assert.equal((await desk.windowTaken(c, NEXT, "8-12")).count, 1);
  assert.equal((await book(c, DATE)).full, undefined);
  await desk.ownerCommand(c, `cancel ${first.id}`);
  assert.equal((await book(c, NEXT)).full, undefined, `${backend}: cancellation frees moved slot`);
  assert.equal((await store.getRecord("bookings", c.slug, first.id)).status, "cancelled");
  assert.equal((await taskRecords(c)).some((t) => t.data?.bookingId === first.id), false);
  await desk.ownerCommand(c, `done ${second.id}`);
  assert.equal((await desk.windowTaken(c, DATE, "12-5")).count, 0, `${backend}: done frees slot`);

  c = await shop();
  const left = await book(c, DATE), right = await book(c, NEXT);
  const moves = await Promise.all([desk.rescheduleVisit(c, left, "2030-11-22", "8-12"), desk.rescheduleVisit(c, right, "2030-11-22", "8 to12")]);
  assert.equal(moves.filter((r) => !r.full).length, 1, `${backend}: concurrent moves have one winner`);
  assert.equal((await desk.windowTaken(c, "2030-11-22", "8 to 12")).count, 1);
  for (const status of ["paid", "quoted"]) {
    c = await shop(); const b = await book(c); await desk.ownerCommand(c, `${status === "quoted" ? "quote" : status} ${b.id}`);
    assert.equal((await desk.windowTaken(c, DATE, "8-12")).count, 0, `${backend}: ${status} releases capacity`);
  }
  c = await shop();
  const cancelled = await book(c); await desk.ownerCommand(c, `cancel ${cancelled.id}`);
  const explicit = await store.getRecord("bookings", c.slug, cancelled.id);
  await desk.rescheduleVisit(c, explicit, NEXT, "8-12");
  assert.equal(explicit.status, "booked", `${backend}: explicit reschedule may acquire a new claim`);
  assert.equal((await desk.windowTaken(c, NEXT, "8 to12")).count, 1);
  assert.equal((await desk.windowTaken(c, DATE, "8 to12")).count, 0);
  for (const race of ["move-cancel", "confirm-cancel", "otw-move", "done-move"]) {
    c = await shop(); const b = await book(c);
    const cancel = () => store.saveRecord("bookings", { ...b, status: "cancelled" });
    const move = () => desk.rescheduleVisit(c, { ...b }, NEXT, "8 to12");
    const actions = race === "move-cancel" ? [move, cancel]
      : race === "confirm-cancel" ? [cancel, () => desk.confirmVisit(c, { ...b })]
      : race === "otw-move" ? [() => desk.ownerCommand(c, `otw ${b.id}`), move]
      : [() => desk.ownerCommand(c, `done ${b.id}`), move];
    const outcomes = await Promise.allSettled(actions.map((fn) => fn()));
    assert.ok(outcomes.some((r) => r.status === "fulfilled"), `${backend}: ${race} has a winner`);
    const persisted = await store.getRecord("bookings", c.slug, b.id);
    const active = ["booked", "confirmed", "on_the_way"].includes(persisted.status);
    const count = await desk.windowTaken(c, persisted.date, persisted.window);
    assert.equal(count.count, active ? 1 : 0, `${backend}: ${race} record and reservation agree`);
    assert.equal(Object.keys((await store.get("index", `capacity:${c.slug}`)).mutations).length, 0, `${backend}: ${race} releases ownership`);
  }
  if (backend === "blobs") {
    // Delay the actual SMS handler's upcomingBookings read until cancellation has fully
    // committed and released ownership. This covers a stale read before token acquisition.
    for (const replacement of [false, true]) {
      c = await shop(); c.status = "live"; c.phone.twilioNumber = "+17135550111";
      await store.saveClient(c); await store.indexClient(c);
      const b = await book(c), protocolFetch = globalThis.fetch;
      const target = `/site:bookings/${c.slug}/${b.id}`;
      let reads = 0, pause, resume, timer;
      const paused = new Promise((resolve) => { pause = resolve; });
      const released = new Promise((resolve) => { resume = resolve; });
      globalThis.fetch = async (request, init = {}) => {
        const response = await protocolFetch(request, init);
        if (String(init.method || "GET").toUpperCase() === "GET" && decodeURIComponent(new URL(String(request)).pathname).endsWith(target) && ++reads === 2) { pause(); await released; }
        return response;
      };
      const incoming = sms(new Request("http://localhost:8888/api/sms", { method: "POST", headers: { "x-admin-key": "capacity-check-key", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ From: b.phone, To: c.phone.twilioNumber, Body: "C" }).toString() })).then((response) => ({ response }), (error) => ({ error }));
      try {
        await Promise.race([paused, incoming.then(() => { throw new Error("SMS completed before delayed booking read"); }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("SMS booking read did not pause")), 1000); })]);
        clearTimeout(timer);
        await desk.ownerCommand(c, `cancel ${b.id}`);
        if (replacement) await book(c, DATE, "8-12");
        resume();
        const outcome = await incoming;
        assert.match(outcome.error?.message || "", /Booking changed/, "stale confirmation rejects after completed cancellation");
        assert.equal(outcome.response, undefined, "stale SMS returns no successful confirmation");
        assert.equal((await store.getRecord("bookings", c.slug, b.id)).status, "cancelled");
        assert.equal((await desk.windowTaken(c, DATE, "8 to12")).count, replacement ? 1 : 0);
        assert.equal((await taskRecords(c)).some((t) => t.data?.bookingId === b.id), false, "stale SMS cannot recreate reminders");
        assert.equal((await records("events", c)).some((e) => e.type === "confirmed"), false);
        assert.equal((await records("conversations", c)).some((v) => v.messages.some((m) => /visit confirmed|confirmed for/.test(m.content))), false);
      } finally { clearTimeout(timer); resume(); globalThis.fetch = protocolFetch; }
    }
    c = await shop(); fault = { kind: "site:bookings", method: "PUT", prefix: c.slug + "/" };
    await assert.rejects(() => book(c), /Blobs/);
    assert.equal((await desk.windowTaken(c, DATE, "8-12")).count, 1, "failed booking retains claim until reconciled");
    assert.equal((await records("bookings", c)).length, 0);
    c = await shop(); const b = await book(c), unchanged = structuredClone(b);
    fault = { kind: "site:bookings", method: "PUT", prefix: c.slug + "/" };
    await assert.rejects(() => desk.rescheduleVisit(c, b, NEXT, "8 to12"), /Blobs/);
    assert.deepEqual(b, unchanged);
    assert.equal((await desk.windowTaken(c, DATE, "8-12")).count, 1);
    assert.equal((await desk.windowTaken(c, NEXT, "8-12")).count, 1, "failed move retains original and target until reconciled");
    fault = { kind: "site:index", method: "GET", prefix: `capacity:${c.slug}` };
    await assert.rejects(() => book(c, NEXT), /Blobs/, "capacity read fails closed");
    c = await shop(); fault = { kind: "site:index", method: "PUT", prefix: `capacity:${c.slug}` };
    await assert.rejects(() => book(c), /no ETag/, "SDK conditional error response is not accepted");
    assert.equal((await records("bookings", c)).length, 0);
    c = await shop(); await store.put("bookings", `${c.slug}/0000000000`, { ...input(), slug: c.slug, id: "0000000000", status: "booked" });
    fault = { kind: "site:bookings", method: "GET", prefix: c.slug + "/" };
    await assert.rejects(() => book(c), /Blobs/, "migration read fails closed");
    for (const stage of ["create", "create-final", "create-mixed", "move", "move-final", "move-mixed", "cancel"]) {
      c = await shop(); const b = stage.startsWith("move") || stage === "cancel" ? await book(c) : null;
      fault = { kind: "site:bookings", method: "PUT", prefix: c.slug + "/", mode: "commit-throw", remaining: stage.endsWith("mixed") ? 1 : 6, rejectRetry: stage.endsWith("mixed"), skip: stage.endsWith("final") ? 1 : 0 };
      await assert.rejects(() => stage.startsWith("move") ? desk.rescheduleVisit(c, b, NEXT, "8 to12") : stage === "cancel" ? store.saveRecord("bookings", { ...b, status: "cancelled" }) : book(c), /lost response|Blobs/);
      const capacity = await store.get("index", `capacity:${c.slug}`);
      assert.equal(Object.keys(capacity.mutations).length, 1, `${stage}: uncertain write keeps ownership`);
      assert.equal((await desk.windowTaken(c, DATE, "8-12")).count, 1, `${stage}: original claim retained`);
      if (stage.startsWith("move")) assert.equal((await desk.windowTaken(c, NEXT, "8-12")).count, 1, `${stage}: target claim retained`);
      // Even an unavailable booking read cannot free an uncertain claim. No recovery reader is
      // used by the implementation: an absent read cannot fence a delayed server-side PUT.
      const key = (await store.list("bookings", c.slug + "/"))[0];
      fault = { kind: "site:bookings", method: "GET", prefix: key };
      assert.equal(await store.get("bookings", key), null);
      assert.deepEqual(await store.get("index", `capacity:${c.slug}`), capacity);
      assert.equal((await book(c)).full, true, `${stage}: uncertain write cannot reopen slot`);
    }
    const workerA = await import("../netlify/functions/lib/store.mjs?capacity-worker=a"), workerB = await import("../netlify/functions/lib/store.mjs?capacity-worker=b");
    c = await shop();
    const separate = await Promise.all([workerA.reserveBookingWindow(c, "aaaaaaaaaa", DATE, "8 to12"), workerB.reserveBookingWindow(c, "bbbbbbbbbb", DATE, "8-12")]);
    assert.equal(separate.filter((r) => !r.full).length, 1, "separate module instances share conditional storage arbitration");
    assert.ok(conflicts > 0, "SDK exercised rejected conditional writes");
  }
  originalLog(`CAPACITY OK: ${backend} (concurrency, aliases, history, capacity, moves, lifecycle${backend === "blobs" ? ", failures and independent instances" : ""})`);
}
try { await suite("memory"); await suite("blobs"); assert.equal(unexpected, 0); }
finally { console.log = originalLog; }
