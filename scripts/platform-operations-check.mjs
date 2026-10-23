// Local engineering acceptance. Actual helpers/worker; memory + installed Blobs SDK fixture.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";

const outputIndex = process.argv.indexOf("--output"), output = outputIndex < 0 ? null : process.argv[outputIndex + 1];
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error("Choose a new scratchpad JSON receipt");
const result = { at: new Date().toISOString(), mode: "actual operations helper and worker; memory plus intercepted installed Blobs SDK; no external calls", checks: [], conflicts: 0, blockedNetwork: [] };
const files = ["netlify/functions/lib/platform-operations.mjs", "netlify/functions/workspace-operations-background.mjs", "netlify/functions/lib/store.mjs", "netlify/functions/lib/setup.mjs"];
const sourceHashes = () => Object.fromEntries(files.map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
result.sourceBefore = sourceHashes();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|WORKSPACE_WORKER_KEY)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", URL: "http://127.0.0.1:8894", PUBLIC_SITE_URL: "http://127.0.0.1:8894" });
const deny = () => { throw new Error("Operations test networking blocked"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const NativeDate = Date; let clock = NativeDate.now();
globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const blobs = new Map(); let version = 0, fault = null, hold = null;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || "GET").toUpperCase();
  if (url.origin !== "https://operations-blobs.invalid") { result.blockedNetwork.push({ origin: url.origin, path: url.pathname }); return deny(); }
  const [, site, kind, ...parts] = url.pathname.split("/").map(decodeURIComponent), key = parts.join("/"), name = kind + "/" + key;
  assert.equal(site, "operations-site"); const headers = new Headers(init.headers), current = blobs.get(name), parsed = init.body && method === "PUT" ? JSON.parse(init.body) : null;
  const isResultPatch = !!parsed?.operationReceipts && Object.keys(parsed.operationReceipts).length > 0;
  const matches = fault && fault.kind === kind && fault.key === key && fault.method === method && (!fault.state || fault.state === parsed?.state) && (!fault.resultPatch || isResultPatch);
  if (matches && !fault.commit) return new Response("Injected storage rejection", { status: 400 });
  if (hold && hold.kind === kind && hold.key === key && method === (hold.method || "GET") && (!hold.resultPatch || isResultPatch) && (!hold.match || hold.match(parsed))) { if (hold.skip) hold.skip--; else { const gate = hold; hold = null; gate.reached(); await gate.release; } }
  if (method === "GET" && !key) return Response.json({ blobs: [...blobs.keys()].filter(name => name.startsWith(kind + "/" + (url.searchParams.get("prefix") || ""))).map(name => ({ key: name.slice(kind.length + 1) })), directories: [] });
  if (method === "GET") {
    return current ? new Response(current.value, { headers: { etag: current.etag, "content-type": "application/json" } }) : new Response(null, { status: 404 });
  }
  if (method === "DELETE") { blobs.delete(name); return new Response(null, { status: 204 }); }
  assert.equal(method, "PUT");
  // Compare with the live value: the fixture's snapshot above can be held during a race.
  const live = blobs.get(name);
  if ((headers.get("if-none-match") === "*" && live) || (headers.has("if-match") && headers.get("if-match") !== live?.etag)) { result.conflicts++; return new Response(null, { status: 412 }); }
  const etag = String(++version); blobs.set(name, { value: init.body, etag });
  if (matches && fault.commit) return new Response("Committed response lost", { status: 400 });
  return new Response(null, { headers: { etag } });
};
const { setEnvironmentContext } = await import("@netlify/blobs");
setEnvironmentContext({ siteID: "operations-site", token: "offline-token", edgeURL: "https://operations-eventual.invalid", uncachedEdgeURL: "https://operations-blobs.invalid" });
const store = await import("../netlify/functions/lib/store.mjs"), accounts = await import("../netlify/functions/lib/accounts.mjs");
const { newClient } = await import("../netlify/functions/lib/config.mjs");
const { configurationRevision } = await import("../netlify/functions/lib/setup.mjs");
const operations = await import("../netlify/functions/lib/platform-operations.mjs");
const worker = (await import("../netlify/functions/workspace-operations-background.mjs")).default;
const read = accounts.strictRead;
const check = async (name, fn) => { try { const detail = await fn(); result.checks.push({ name, pass: true, ...(detail ? { detail } : {}) }); } catch (error) { result.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } };
let serial = 0;
async function client(mode, suffix, status = "build_failed") {
  const slug = `ops-${mode}-${suffix}-${++serial}`;
  const c = newClient({ slug, ownerKey: "private-owner-" + slug, owner: { name: "Fixture Owner", email: slug + "@example.test", phone: "+17135550100" }, business: { name: "Fixture Air", trade: "HVAC", hours: "Mon-Fri 8am-5pm" } });
  Object.assign(c, { onboarding: { version: 1, desiredChannels: ["web", "voice", "sms", "calendar"] }, status, build: { status: "failed", notes: "Old failure", sourcePages: [] }, channels: { web: { active: false }, voice: { active: false }, sms: { active: false } }, calendar: { provider: "none", privateFixture: "preserve-calendar" }, customOwnerField: "preserve-edit" });
  c.business.serviceArea = ["Katy"]; c.services = ["AC repair"];
  await store.put("clients", slug, c); return c;
}
const requestOptions = c => ({ actor: { role: "owner", email: c.owner.email }, reason: "Repair my saved workspace", expectedRevision: configurationRevision(c) });
const queued = async c => operations.queueWorkspaceRebuild(c, requestOptions(c));
const opRead = row => read("workspace_operations", row.id);
async function suite(mode) {
  process.env.MC_MEMORY_STORE = mode === "memory" ? "1" : "0";
  const prefix = mode + ": "; let c, op;
  await check(prefix + "invalid revision, foreign mailbox and malformed audit cannot queue", async () => {
    c = await client(mode, "main");
    await assert.rejects(() => operations.queueWorkspaceRebuild(c, { ...requestOptions(c), expectedRevision: "wrong" }), error => error.code === "configuration_changed");
    await assert.rejects(() => operations.queueWorkspaceRebuild(c, { ...requestOptions(c), actor: { role: "owner", email: "foreign@example.test" } }), error => error.status === 403);
    await assert.rejects(() => operations.queueWorkspaceRebuild(c, { ...requestOptions(c), reason: "" }), error => error.status === 400);
    assert.deepEqual(await operations.listWorkspaceOperations(c.slug), []);
  });
  await check(prefix + "duplicate requests persist one durable intent and one stable operation", async () => {
    const rows = await Promise.all(Array.from({ length: 5 }, () => queued(c))); op = rows[0]; assert.ok(rows.every(row => row.id === op.id));
    assert.equal((await operations.listWorkspaceOperations(c.slug)).length, 1); assert.equal((await opRead(op)).attempts, 0);
    assert.ok((await read("platform_operations", "active_queue_v1")).intents[op.id]);
  });
  await check(prefix + "overlapping recovery completes one local patch and keeps providers inactive", async () => {
    const returns = await Promise.all([operations.recoverWorkspaceOperations(), operations.recoverWorkspaceOperations()]);
    const row = await opRead(op), saved = await read("clients", c.slug); assert.equal(row.state, "succeeded"); assert.equal(row.attempts, 1);
    assert.equal(saved.build.status, "built"); assert.equal(saved.status, "testing"); assert.equal(saved.operationReceipts[op.inputRevision].id, op.id);
    const actual = { ...saved, build: c.build, status: c.status }; delete actual.operationReceipts; delete actual.workspaceOperationClaims; if (!Object.hasOwn(c, "updatedAt")) delete actual.updatedAt; else actual.updatedAt = c.updatedAt;
    assert.deepEqual(actual, c); assert.deepEqual(saved.channels, c.channels); assert.deepEqual(saved.calendar, c.calendar);
    assert.ok(returns.every(row => row.processed <= 10 && row.inspected <= 50));
  });
  await check(prefix + "lost final caller response reopens same completion without requeue or secret DTO", async () => {
    const again = await queued(c), views = await operations.listWorkspaceOperations(c.slug); assert.equal(again.id, op.id); assert.equal(again.state, "succeeded");
    assert.equal((await read("platform_operations", "active_queue_v1")).intents[op.id], undefined);
    const text = JSON.stringify(views); for (const forbidden of [c.owner.email, c.ownerKey, "requestedBy", "tenantIdentity", "claim", "privateFixture"]) assert.ok(!text.includes(forbidden));
  });
  await check(prefix + "later owner revision supersedes pending work without overwriting saved facts", async () => {
    const target = await client(mode, "stale"), work = await queued(target), edited = { ...target, summary: "New owner answer" }; await store.put("clients", target.slug, edited);
    await operations.recoverWorkspaceOperations(); assert.equal((await opRead(work)).state, "superseded"); assert.deepEqual(await read("clients", target.slug), edited);
  });
  await check(prefix + "pause and cancellation stop stale work while cancelled customers cannot request repair", async () => {
    for (const state of ["paused", "cancelled"]) {
      const target = await client(mode, state), work = await queued(target), stopped = { ...target, status: state }; await store.put("clients", target.slug, stopped);
      await operations.recoverWorkspaceOperations(); assert.equal((await opRead(work)).state, "cancelled"); assert.deepEqual(await read("clients", target.slug), stopped);
      if (state === "cancelled") await assert.rejects(() => queued(stopped), error => error.code === "workspace_inactive");
      else {
        const repair = await queued(stopped); assert.equal(repair.id, work.id); assert.equal(repair.state, "queued");
        await operations.recoverWorkspaceOperations(); const repaired = await read("clients", target.slug); assert.equal(repaired.status, "paused"); assert.equal(repaired.build.status, "built"); assert.deepEqual(repaired.channels, target.channels);
      }
    }
  });
  await check(prefix + "explicit paused repair preserves pause and old paused work cannot resume it", async () => {
    const target = await client(mode, "paused-repair", "paused"), work = await queued(target); await operations.recoverWorkspaceOperations();
    const repaired = await read("clients", target.slug); assert.equal(repaired.status, "paused"); assert.equal(repaired.build.status, "built"); assert.equal((await opRead(work)).state, "succeeded"); assert.deepEqual(repaired.channels, target.channels);
    const waiting = await client(mode, "paused-stale", "paused"), old = await queued(waiting), resumed = { ...waiting, status: "testing", pausedAt: null };
    await store.put("clients", waiting.slug, resumed); await operations.recoverWorkspaceOperations(); assert.equal((await opRead(old)).state, "superseded"); assert.deepEqual(await read("clients", waiting.slug), resumed);
  });
  await check(prefix + "explicit repair reopens same successful operation when its build later fails", async () => {
    const target = await client(mode, "repeated-repair"), work = await queued(target); await operations.recoverWorkspaceOperations();
    const original = await read("clients", target.slug), broken = { ...original, status: "paused", pausedAt: new Date(clock).toISOString(), build: { ...original.build, status: "failed" } };
    await store.put("clients", target.slug, broken); const again = await queued(broken); assert.equal(again.id, work.id); assert.equal(again.state, "queued");
    await operations.recoverWorkspaceOperations(); const repaired = await read("clients", target.slug); assert.equal(repaired.status, "paused"); assert.equal(repaired.build.status, "built"); assert.ok(repaired.operationReceipts[work.inputRevision].generation > original.operationReceipts[work.inputRevision].generation);
  });
  await check(prefix + "expired deterministic claim retries within its three-attempt budget", async () => {
    const target = await client(mode, "expired"), work = await queued(target), row = await opRead(work);
    await store.put("workspace_operations", work.id, { ...row, state: "running", attempts: 1, generation: 1, claim: { token: "expired-claim", until: new Date(clock - 1).toISOString() } });
    await operations.recoverWorkspaceOperations(); const recovered = await opRead(work); assert.equal(recovered.state, "succeeded"); assert.equal(recovered.attempts, 2); assert.equal(recovered.receipt.generation, 2);
  });
  if (mode === "sdk") {
    await check(prefix + "durable queue repairs missing operation projection after failed second write", async () => {
      const target = await client(mode, "intent"), id = operations.workspaceOperationId(target, configurationRevision(target));
      fault = { kind: "site:workspace_operations", key: id, method: "PUT" }; await assert.rejects(() => queued(target)); fault = null;
      assert.ok((await read("platform_operations", "active_queue_v1")).intents[id]); assert.equal(await read("workspace_operations", id), null);
      await operations.recoverWorkspaceOperations(); assert.equal((await read("workspace_operations", id)).state, "succeeded");
    });
    await check(prefix + "known storage failure remains due and then recovers without owner intervention", async () => {
      const target = await client(mode, "retry"), work = await queued(target); fault = { kind: "site:clients", key: target.slug, method: "PUT" };
      const failed = await operations.recoverWorkspaceOperations(); fault = null; assert.equal((await opRead(work)).state, "retry_due"); assert.equal(failed.retryDue, 1); assert.equal((await read("clients", target.slug)).build.status, "failed");
      clock += 60001; await operations.recoverWorkspaceOperations(); assert.equal((await opRead(work)).state, "succeeded"); assert.equal((await opRead(work)).attempts, 2);
    });
    await check(prefix + "exhausted automatic attempts stay visible and explicit retry grants only three more", async () => {
      const target = await client(mode, "budget"), work = await queued(target); fault = { kind: "site:clients", key: target.slug, method: "PUT" };
      let returned; for (let attempt = 0; attempt < 3; attempt++) { returned = await operations.recoverWorkspaceOperations(); clock += 300001; } fault = null;
      const failed = await opRead(work); assert.equal(failed.state, "failed"); assert.equal(failed.attempts, 3); assert.equal(returned.ok, false); assert.equal(returned.failed, 1);
      const later = await operations.recoverWorkspaceOperations(); assert.equal(later.inspected, 0); assert.equal(later.openFailures, 1); assert.equal(later.ok, false);
      assert.equal((await operations.listWorkspaceOperations(target.slug))[0].nextAction.action, "retry_operation");
      const retry = await operations.retryWorkspaceOperation(target, work.id, { ...requestOptions(target), reason: "Storage service is available again" }); assert.equal(retry.state, "queued");
      assert.equal((await opRead(work)).attemptLimit, 6); await operations.recoverWorkspaceOperations(); assert.equal((await opRead(work)).attempts, 4); assert.equal((await opRead(work)).state, "succeeded");
      assert.equal((await operations.recoverWorkspaceOperations()).openFailures, 0);
    });
    await check(prefix + "failed exception projection cannot erase its durable repair intent or claim health", async () => {
      const target = await client(mode, "exception"), work = await queued(target), row = await opRead(work);
      await store.put("workspace_operations", work.id, { ...row, state: "failed", attempts: 3, generation: 3, reasonCode: "refresh_attempts_exhausted", completedAt: new Date(clock).toISOString() });
      fault = { kind: "site:platform_operations", key: "failure_index_v1", method: "PUT" }; const failedProjection = await operations.recoverWorkspaceOperations(); fault = null;
      assert.equal(failedProjection.ok, false); assert.ok((await read("platform_operations", "active_queue_v1")).intents[work.id]);
      const repaired = await operations.recoverWorkspaceOperations(); assert.equal(repaired.openFailures, 1); assert.equal(repaired.ok, false); assert.equal((await read("platform_operations", "active_queue_v1")).intents[work.id], undefined);
      assert.equal((await operations.recoverWorkspaceOperations()).openFailures, 1);
      await operations.retryWorkspaceOperation(target, work.id, { ...requestOptions(target), reason: "Retry after exception index recovery" }); await operations.recoverWorkspaceOperations(); assert.equal((await operations.recoverWorkspaceOperations()).openFailures, 0);
    });
    for (const loseClient of [false, true]) await check(prefix + (loseClient ? "ambiguous committed client write" : "lost operation completion receipt") + " reconciles same local receipt without repeat patch", async () => {
      const target = await client(mode, loseClient ? "client-lost" : "receipt-lost"), work = await queued(target);
      fault = loseClient ? { kind: "site:clients", key: target.slug, method: "PUT", commit: true, resultPatch: true } : { kind: "site:workspace_operations", key: work.id, method: "PUT", state: "succeeded" };
      await operations.recoverWorkspaceOperations(); fault = null;
      const saved = await read("clients", target.slug); assert.equal(saved.operationReceipts[work.inputRevision].id, work.id);
      await operations.recoverWorkspaceOperations(); const row = await opRead(work); assert.equal(row.state, "succeeded"); assert.equal(row.attempts, 1); assert.deepEqual(await read("clients", target.slug), saved);
    });
    await check(prefix + "concurrent owner edit fences an old worker before its conditional patch", async () => {
      const target = await client(mode, "edit-race"), work = await queued(target); let reached, release;
      const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; }); hold = { kind: "site:clients", key: target.slug, method: "PUT", reached, release: gate, resultPatch: true };
      const running = operations.recoverWorkspaceOperations(); await waiting; const edited = { ...target, summary: "Owner edited during worker" }; await store.put("clients", target.slug, edited); release(); await running;
      assert.equal((await opRead(work)).state, "superseded"); assert.deepEqual(await read("clients", target.slug), edited);
    });
    await check(prefix + "reclaimed worker generation fences late completion and preserves one receipt", async () => {
      const target = await client(mode, "claim-race"), work = await queued(target); let reached, release;
      const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; }); hold = { kind: "site:clients", key: target.slug, method: "PUT", reached, release: gate, resultPatch: true };
      const first = operations.recoverWorkspaceOperations(); await waiting; clock += 60001; await operations.recoverWorkspaceOperations(); release(); await first;
      const row = await opRead(work), saved = await read("clients", target.slug); assert.equal(row.state, "succeeded"); assert.equal(row.attempts, 2); assert.equal(saved.operationReceipts[work.inputRevision].generation, 2);
    });
    await check(prefix + "committed newer client fence blocks old result even when newer result fails", async () => {
      const target = await client(mode, "fence-result-fail"), work = await queued(target); let reached, release;
      const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; }); hold = { kind: "site:clients", key: target.slug, method: "PUT", reached, release: gate, resultPatch: true };
      const first = operations.recoverWorkspaceOperations(); await waiting; clock += 60001;
      fault = { kind: "site:clients", key: target.slug, method: "PUT", resultPatch: true }; await operations.recoverWorkspaceOperations(); fault = null;
      const newer = await opRead(work); assert.equal(newer.generation, 2); assert.equal((await read("clients", target.slug)).workspaceOperationClaims[work.inputRevision].generation, 2);
      release(); await first; assert.equal((await read("clients", target.slug)).operationReceipts?.[work.inputRevision], undefined);
      clock += 300001; await operations.recoverWorkspaceOperations(); assert.equal((await opRead(work)).state, "succeeded"); assert.equal((await read("clients", target.slug)).operationReceipts[work.inputRevision].generation, 3);
    });
    await check(prefix + "old completion queue cleanup cannot erase an accepted same-ID repair", async () => {
      const target = await client(mode, "queue-cleanup-race"), work = await queued(target); let reached, release;
      const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
      hold = { kind: "site:platform_operations", key: "active_queue_v1", method: "PUT", reached, release: gate, match: body => !body.intents[work.id] };
      const first = operations.recoverWorkspaceOperations(); await waiting;
      const completed = await read("clients", target.slug), failedAgain = { ...completed, status: "paused", pausedAt: new Date(clock).toISOString(), build: { ...completed.build, status: "failed" } }; await store.put("clients", target.slug, failedAgain);
      assert.equal((await queued(failedAgain)).state, "queued"); release(); await first;
      assert.ok((await read("platform_operations", "active_queue_v1")).intents[work.id]); await operations.recoverWorkspaceOperations();
      const repaired = await read("clients", target.slug); assert.equal(repaired.status, "paused"); assert.equal(repaired.build.status, "built"); assert.equal((await opRead(work)).state, "succeeded");
    });
    await check(prefix + "late failed projection cannot reopen a successfully resolved operation", async () => {
      const target = await client(mode, "late-failure-index"), work = await queued(target), row = await opRead(work); let reached, release;
      await store.put("workspace_operations", work.id, { ...row, state: "failed", attempts: 3, generation: 3, reasonCode: "refresh_attempts_exhausted", completedAt: new Date(clock).toISOString() });
      const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
      hold = { kind: "site:platform_operations", key: "failure_index_v1", method: "PUT", reached, release: gate, match: body => !!body.failures?.[work.id] };
      const oldProjection = operations.recoverWorkspaceOperations(); await waiting;
      await operations.retryWorkspaceOperation(target, work.id, { ...requestOptions(target), reason: "Repair after known storage recovery" }); await operations.recoverWorkspaceOperations();
      assert.equal((await opRead(work)).state, "succeeded"); release(); await oldProjection;
      const index = await read("platform_operations", "failure_index_v1"); assert.equal(index.failures[work.id], undefined); assert.ok(index.resolutions[work.id].generation > 3); assert.equal((await operations.recoverWorkspaceOperations()).openFailures, 0);
    });
    await check(prefix + "observing a running final attempt cannot resolve its later committed failure", async () => {
      const target = await client(mode, "running-not-resolved"), work = await queued(target), row = await opRead(work); let reached, release;
      await store.put("workspace_operations", work.id, { ...row, state: "retry_due", attempts: 2, generation: 2, nextAttemptAt: new Date(clock).toISOString() });
      const waiting = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
      hold = { kind: "site:workspace_operations", key: work.id, method: "PUT", reached, release: gate, match: body => body.state === "failed" }; fault = { kind: "site:clients", key: target.slug, method: "PUT", resultPatch: true };
      const failing = operations.recoverWorkspaceOperations(); await waiting; await operations.recoverWorkspaceOperations(); fault = null; release(); await failing;
      assert.equal((await opRead(work)).state, "failed"); assert.equal((await operations.recoverWorkspaceOperations()).openFailures, 1);
      await operations.retryWorkspaceOperation(target, work.id, { ...requestOptions(target), reason: "Retry after recorded final failure" }); await operations.recoverWorkspaceOperations(); assert.equal((await operations.recoverWorkspaceOperations()).openFailures, 0);
    });
    await check(prefix + "strict queue read failure cannot become empty or healthy", async () => {
      fault = { kind: "site:platform_operations", key: "active_queue_v1", method: "GET" }; await assert.rejects(() => operations.recoverWorkspaceOperations()); fault = null;
    });
  }
  await check(prefix + "same-rules replacement gets its own rebuild and current requests resume one operation", async () => {
    const old = await client(mode, "tenant-replacement"), oldWork = await queued(old), oldRow = await opRead(oldWork);
    const replacement = { ...old, ownerKey: old.ownerKey + "-replacement" };
    assert.equal(configurationRevision(replacement), configurationRevision(old));
    await store.put("clients", old.slug, replacement);
    const current = await Promise.all([queued(replacement), queued(replacement), queued(replacement)]);
    assert.ok(current.every(row => row.id === current[0].id)); assert.notEqual(current[0].id, oldWork.id);
    assert.deepEqual(await opRead(oldWork), oldRow);
    assert.deepEqual((await operations.listWorkspaceOperations(replacement)).map(row => row.id), [current[0].id]);
    await assert.rejects(() => operations.retryWorkspaceOperation(replacement, oldWork.id, requestOptions(replacement)), error => error.code === "operation_not_found");
    await operations.recoverWorkspaceOperations();
    const saved = await read("clients", replacement.slug); assert.equal(saved.ownerKey, replacement.ownerKey); assert.equal(saved.build.operationId, current[0].id);
  });
  await check(prefix + "exact-current historical operation and missing projection resume without a second rebuild", async () => {
    for (const missing of [false, true]) {
      const target = await client(mode, missing ? "legacy-intent" : "legacy-operation"), modern = await queued(target), raw = await opRead(modern);
      const legacyId = `${target.slug}/workspace_rebuild/${configurationRevision(target)}`, legacy = { ...raw, id: legacyId };
      const queue = await read("platform_operations", "active_queue_v1"), intent = queue.intents[modern.id]; delete queue.intents[modern.id];
      queue.intents[legacyId] = { ...intent, id: legacyId }; await store.put("platform_operations", "active_queue_v1", queue);
      await store.del("workspace_operations", modern.id); if (!missing) await store.put("workspace_operations", legacyId, legacy);
      const resumed = await Promise.all([queued(target), queued(target)]);
      assert.ok(resumed.every(row => row.id === legacyId)); assert.equal(await opRead(modern), null);
      await operations.recoverWorkspaceOperations(); assert.equal((await read("clients", target.slug)).build.operationId, legacyId);
      const rows = await operations.listWorkspaceOperations(target); assert.equal(rows.length, 1); assert.equal(rows[0].id, legacyId);
    }
  });
  await check(prefix + "fair cursor reaches later customers beyond fifty candidates with bounded execution", async () => {
    const batch = []; for (let i = 0; i < 65; i++) { const target = await client(mode, "fair-" + String(i).padStart(2, "0")); batch.push(await queued(target)); }
    const scans = []; for (let i = 0; i < 3; i++) scans.push(await operations.recoverWorkspaceOperations());
    assert.ok(scans.every(row => row.inspected <= 50 && row.processed <= 10)); assert.equal((await opRead(batch.at(-1))).state, "succeeded");
    const statuses = await Promise.all(batch.map(opRead)); assert.ok(statuses.filter(row => row.state === "queued").length > 0);
    // Finish fixtures so the next backend mode starts with no active intentions.
    for (let i = 0; i < 10; i++) await operations.recoverWorkspaceOperations();
    assert.ok((await Promise.all(batch.map(opRead))).every(row => row.state === "succeeded"));
    return scans.map(({ inspected, processed }) => ({ inspected, processed }));
  });
}

await suite("memory"); await suite("sdk");
await check("worker is private, bounded and unavailable without dedicated configuration", async () => {
  const req = (body = {}, key, method = "POST") => new Request("http://127.0.0.1:8894/api/operations/recover", { method, headers: { "content-type": "application/json", ...(key ? { "x-workspace-worker-key": key } : {}) }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await worker(req())).status, 503); process.env.WORKSPACE_WORKER_KEY = "test-private-worker";
  assert.equal((await worker(req({}, "wrong"))).status, 403); assert.equal((await worker(req({}, "test-private-worker", "GET"))).status, 405);
  assert.equal((await worker(req({ limit: 11 }, "test-private-worker"))).status, 400); assert.equal((await worker(req({ slug: "foreign" }, "test-private-worker"))).status, 400);
  const valid = await worker(req({}, "test-private-worker")); assert.equal(valid.status, 200); assert.equal((await valid.json()).ok, true);
});
await check("no model, provider, messaging, billing or other external request occurred", async () => assert.deepEqual(result.blockedNetwork, []));
result.sourceAfter = sourceHashes(); result.summary = { passed: result.checks.filter(row => row.pass).length, failed: result.checks.filter(row => !row.pass).length, total: result.checks.length };
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2)); if (result.summary.failed) process.exitCode = 1;
