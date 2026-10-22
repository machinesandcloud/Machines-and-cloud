// Actual production state machine, provider HTTP adapter and signed webhook handlers.
// All credentials are dummy and every physical network primitive is disabled.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const outputIndex = process.argv.indexOf("--output"), output = outputIndex < 0 ? null : process.argv[outputIndex + 1];
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error("Choose a new scratchpad receipt");
const sources = ["netlify/functions/lib/voice-activation.mjs", "netlify/functions/lib/voice-provider.mjs", "netlify/functions/managed-voice.mjs", "netlify/functions/managed-vapi.mjs", "netlify/functions/voice-activation-background.mjs", "netlify/functions/voice-activation-scheduler.mjs"], hash = value => createHash("sha256").update(value).digest("hex"), hashes = () => Object.fromEntries(sources.map(file => [file, hash(readFileSync(file))]));
const result = { at: new Date().toISOString(), mode: "actual voice engine, HTTP adapter and webhook protocols; memory + installed Blobs SDK fixtures; zero real requests", sourceBefore: hashes(), checks: [], conflicts: 0, blocked: [], requests: [] };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|VOICE_|PHONE_)/.test(key)) delete process.env[key];
const account = "AC" + "1".repeat(32), twilioToken = "fixture-twilio-token", secret = "fixture-vapi-secret-" + "a".repeat(32), origin = "http://127.0.0.1:8897";
const policy = { version: "fixture_voice_v1", model: "fixture-approved-model", maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, accountDailyCalls: 1000, accountDailyMinutes: 5000, authorityText: "I am authorized to connect this business phone service and direct calls to the recorded owner cell.", usageDisclosure: "This fixture represents an explicitly approved voice usage policy; no actual prices or calls are authorized." };
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: origin, TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: twilioToken, VAPI_API_KEY: "fixture-private", VAPI_WEBHOOK_SECRET: secret, VOICE_ACTIVATION_ENABLED: "true", VOICE_ACTIVATION_APPROVED_VERSION: policy.version, VOICE_ACTIVATION_POLICY_JSON: JSON.stringify(policy), VOICE_FALLBACK_TWIML_URL: "https://handler.twilio.com/twiml/EH" + "f".repeat(32), SERVICE_WORKER_KEY: "fixture-service-worker-" + "a".repeat(32) });
const deny = () => { throw new Error("Voice test physical networking disabled"); }; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const NativeDate = Date; let clock = NativeDate.now(); globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const blobs = new Map(), assistants = new Map(), imports = new Map(), numbers = new Map(); let etag = 0, serial = 0, fault = null, providerFault = null, beforeResponse = null, enabled = true;
const uuid = input => { const h = hash(input); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || "GET").toUpperCase();
  if (url.origin === "https://voice-blobs.invalid") {
    const [, site, kind, ...parts] = url.pathname.split("/").map(decodeURIComponent), key = parts.join("/"), name = kind + "/" + key; assert.equal(site, "voice-site");
    if (fault?.kind === kind && fault.key === key && fault.method === method) return new Response("Injected store rejection", { status: 400 });
    if (method === "GET" && !key) return Response.json({ blobs: [...blobs.keys()].filter(name => name.startsWith(kind + "/" + (url.searchParams.get("prefix") || ""))).map(name => ({ key: name.slice(kind.length + 1) })), directories: [] });
    const current = blobs.get(name), headers = new Headers(init.headers);
    if (method === "GET") return current ? new Response(current.body, { headers: { etag: current.etag, "content-type": "application/json" } }) : new Response(null, { status: 404 });
    assert.equal(method, "PUT"); if ((headers.get("if-none-match") === "*" && current) || (headers.has("if-match") && headers.get("if-match") !== current?.etag)) { result.conflicts++; return new Response(null, { status: 412 }); }
    const next = String(++etag); blobs.set(name, { body: init.body, etag: next }); return new Response(null, { headers: { etag: next } });
  }
  if (url.origin === "https://handler.twilio.com") { assert.equal(enabled, true); assert.equal(url.search, ""); return new Response('<Response><Say voice="Polly.Joanna">Please call back in a few minutes.</Say></Response>'); }
  if (!["https://api.vapi.ai", "https://api.twilio.com"].includes(url.origin)) { result.blocked.push({ origin: url.origin, path: url.pathname }); return deny(); }
  assert.equal(enabled, true); result.requests.push({ method, path: url.pathname });
  const req = { url, method, body: init.body ? url.origin === "https://api.vapi.ai" ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body)) : null };
  if (providerFault?.path === url.pathname && providerFault.method === method && providerFault.before) throw new Error("Fixture response unavailable before provider commit");
  let response;
  if (url.origin === "https://api.vapi.ai") {
    const kind = url.pathname.startsWith("/assistant") ? "assistant" : "phone-number", map = kind === "assistant" ? assistants : imports, id = url.pathname.split("/")[2];
    if (method === "GET") response = id ? map.has(id) ? Response.json(map.get(id)) : new Response(null, { status: 404 }) : Response.json([...map.values()]);
    else if (method === "DELETE") { map.delete(id); response = Response.json({ id }); }
    else if (method === "PATCH") { const old = map.get(id); if (!old) response = new Response(null, { status: 404 }); else { map.set(id, { ...old, ...req.body }); response = Response.json(map.get(id)); } }
    else {
      assert.equal(method, "POST"); const body = req.body, identifier = uuid(kind + body.name + ++serial), remote = { ...body, id: identifier, orgId: "fixture-org", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...(kind === "phone-number" ? { status: "active" } : {}) }; map.set(identifier, remote);
      if (kind === "phone-number") { assert.equal(body.smsEnabled, false); assert.equal(body.assistantId, undefined); assert.equal(body.squadId, undefined); assert.equal(body.workflowId, undefined); const twilio = [...numbers.values()].find(row => row.phone_number === body.number); assert.ok(twilio); twilio.voice_url = "https://api.vapi.ai/twilio/inbound_call"; twilio.voice_method = "POST"; }
      response = Response.json(remote, { status: 201 });
    }
  } else {
    assert.ok(url.pathname.startsWith(`/2010-04-01/Accounts/${account}/IncomingPhoneNumbers/`)); const sid = url.pathname.split("/").at(-1).replace(/\.json$/, ""), number = numbers.get(sid);
    if (method === "GET") response = number ? Response.json(number) : new Response(null, { status: 404 });
    else { assert.equal(method, "POST"); assert.ok(number); for (const [key, value] of Object.entries(req.body)) number[key.replace(/[A-Z]/g, (letter, index) => (index ? "_" : "") + letter.toLowerCase())] = value; response = Response.json(number); }
  }
  if (beforeResponse) await beforeResponse(req);
  if (providerFault?.path === url.pathname && providerFault.method === method && !providerFault.before) throw new Error("Fixture lost response after provider commit");
  return response;
};
const { setEnvironmentContext } = await import("@netlify/blobs"); setEnvironmentContext({ siteID: "voice-site", token: "fixture-token", edgeURL: "https://voice-eventual.invalid", uncachedEdgeURL: "https://voice-blobs.invalid" });
const store = await import("../netlify/functions/lib/store.mjs"), { strictRead: read } = await import("../netlify/functions/lib/accounts.mjs"), voice = await import("../netlify/functions/lib/voice-activation.mjs"), { createManagedVoiceProvider } = await import("../netlify/functions/lib/voice-provider.mjs"), { configurationRevision } = await import("../netlify/functions/lib/setup.mjs"), { newClient } = await import("../netlify/functions/lib/config.mjs"), phone = await import("../netlify/functions/lib/phone-activation.mjs");
const check = async (name, fn) => { try { await store.put("voice_activation_queue", "active_v1", { version: 1, intents: {}, cursor: "" }); await fn(); result.checks.push({ name, pass: true }); } catch (error) { result.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } finally { fault = null; providerFault = null; beforeResponse = null; enabled = true; process.env.VOICE_ACTIVATION_ENABLED = "true"; } };
async function client(mode, suffix) {
  const slug = `voice-${mode}-${suffix}-${++serial}`, c = newClient({ slug, ownerKey: "private-" + slug, owner: { email: slug + "@example.test", name: "Fixture Owner", phone: "+17135550100" }, business: { name: "Fixture Shop", trade: "HVAC", serviceArea: ["Houston"] } });
  Object.assign(c, { onboarding: { version: 1 }, status: "testing", build: { status: "built" }, channels: { web: { active: false }, voice: { active: false }, sms: { active: false } } }); c.phone.businessNumber = "+17135550122"; const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: "live" };
  await store.put("clients", slug, c);
  const identity = hash(JSON.stringify([c.slug, c.ownerKey, c.owner.email])), intentId = c.slug + "/" + hash("first-phone-acquisition:" + identity), sid = "PN" + hash(c.slug).slice(0, 32), number = "+1713" + String(5550100 + serial).slice(-7), correlationId = hash("number-" + c.slug);
  await store.put("phone_activation_intents", intentId, { version: 1, id: intentId, slug, tenantIdentity: identity, state: "number_acquired", resource: { id: sid, number, correlationId }, correlationId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  numbers.set(sid, { sid, account_sid: account, phone_number: number, voice_url: "", voice_method: "POST", voice_application_sid: "", sms_url: "https://fixture-sms.invalid/unchanged", sms_application_sid: "", sms_fallback_url: "https://fixture-sms.invalid/fallback" });
  return c;
}
const engine = () => voice.createVoiceActivationEngine({ provider: createManagedVoiceProvider({ executionAllowed: () => enabled }), policy, gate: () => enabled });
const request = (e, c, extra = {}) => e.request(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c), acceptedAuthority: true, policyVersion: e.offer().version, policyDigest: e.offer().digest, forwardingMode: "forward_business_line", ...extra });
async function complete(e, row, max = 8) { let view; for (let i = 0; i < max; i++) { view = await e.run(row.id); if (view.state === "ready") return view; } return view; }
async function rowFor(c) { const status = await voice.voiceActivationStatus(c); return status.operation ? read("voice_activation_intents", status.operation.id) : null; }
function signed(row, kind, extras = {}, signature = true) { const url = `${origin}/api/managed-voice?o=${row.callbackToken}&kind=${kind}`, params = { AccountSid: account, CallSid: "CA" + hash(row.id + "call").slice(0, 32), To: row.number.number, From: "+17135550999", ...extras }, sig = createHmac("sha1", twilioToken).update(url + Object.keys(params).sort().map(key => key + params[key]).join("")).digest("base64"); return new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(signature ? { "x-twilio-signature": sig } : {}) }, body: new URLSearchParams(params).toString() }); }
function event(row, type, extra = {}, headers = true) { const call = { id: uuid(row.id + "vapi-call"), type: "inboundPhoneCall", phoneNumberId: row.imported.id, customer: { number: "+17135550999" }, transport: { provider: "twilio", accountSid: account, callSid: "CA" + hash(row.id + "call").slice(0, 32) } }; return new Request(origin + "/api/managed-vapi", { method: "POST", headers: { "content-type": "application/json", ...(headers ? { "x-vapi-secret": secret } : {}) }, body: JSON.stringify({ message: { type, call, phoneNumber: { number: row.number.number, name: `mc-phone-${row.correlationId.slice(0, 30)}` }, ...extra } }) }); }
const end = row => event(row, "end-of-call-report", { startedAt: new Date(clock - 20000).toISOString(), endedAt: new Date(clock).toISOString(), endedReason: "customer-ended-call", artifact: { transcript: "Fixture customer asked about AC service." }, analysis: { summary: "Fixture service inquiry." } });
async function suite(mode) {
  process.env.MC_MEMORY_STORE = mode === "memory" ? "1" : "0"; const name = text => mode + ": " + text;
  await check(name("authority is saved while account gate is closed; unknown owner is rejected"), async () => {
    const c = await client(mode, "gate"), e = engine(), before = result.requests.length; enabled = false; const row = await request(e, c); assert.equal(row.state, "waiting_platform"); assert.equal((await e.run(row.id)).state, "waiting_platform"); assert.equal(result.requests.length, before);
    await assert.rejects(() => request(e, c, { actor: { role: "owner", email: "foreign@example.test" } }), err => err.status === 403); await assert.rejects(() => request(e, c, { acceptedAuthority: false }), err => err.status === 400);
  });
  await check(name("real adapter chains assistant/import/routing with durable resource receipts and dependency"), async () => {
    const c = await client(mode, "chain"), e = engine(), row = await request(e, c), before = result.requests.length;
    assert.equal((await complete(e, row)).state, "ready"); const stored = await rowFor(c); assert.ok(stored.assistant.id); assert.ok(stored.imported.id); assert.equal(stored.routing.confirmed, true); assert.equal(stored.routing.fallbackConfigured, true); assert.equal(stored.assistantCreateStartedAt !== undefined, true); assert.equal(stored.importStartedAt !== undefined, true); assert.equal(stored.dependencyClaimedAt !== undefined, true); assert.equal((await voice.voiceActivationStatus(c)).active, false); assert.deepEqual(await read("clients", c.slug), c);
    const acquired = await phone.getAcquiredPhoneResource(c), parent = await read("phone_activation_intents", acquired.intentId); assert.equal(parent.dependencies.voice.operationId, row.id); assert.ok(result.requests.length > before); assert.equal(numbers.get(acquired.id).sms_url, "https://fixture-sms.invalid/unchanged");
  });
  await check(name("signed forwarded inbound plus bound successful Vapi report establishes observed readiness"), async () => {
    const c = await client(mode, "proof"), e = engine(), requestRow = await request(e, c); await complete(e, requestRow); const row = await rowFor(c);
    const inbound = await voice.handleManagedVoiceWebhook(signed(row, "inbound", { ForwardedFrom: c.phone.businessNumber })); assert.equal(inbound.status, 200); assert.match(await inbound.text(), /Redirect/);
    const answer = await voice.handleManagedVapiWebhook(event(row, "assistant-request")); const answerBody = await answer.json(); assert.equal(answerBody.assistantId, undefined); assert.equal(answerBody.assistant.metadata.mcVoiceRevision, row.inputRevision); assert.equal(answerBody.assistant.server.headers["x-vapi-secret"], secret); assert.equal((await voice.handleManagedVapiWebhook(end(row))).status, 200);
    const status = await voice.voiceActivationStatus(c); assert.equal(status.active, true); assert.ok(status.operation.evidence.forwardedAt); assert.equal(status.operation.evidence.fallbackObservedAt, null);
    const bad = await voice.handleManagedVapiWebhook(event(row, "assistant-request", { call: { id: uuid("bad"), type: "inboundPhoneCall", customer: { number: "+17135550999" }, phoneNumberId: uuid("wrong-phone"), transport: { provider: "twilio", callSid: "CA" + hash(row.id + "call").slice(0, 32) } } })); assert.equal(bad.status, 403);
  });
  await check(name("untrusted, misrouted and unbound events never certify service"), async () => {
    const c = await client(mode, "reject"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c);
    assert.equal((await voice.handleManagedVoiceWebhook(signed(row, "inbound", {}, false))).status, 403); assert.equal((await voice.handleManagedVoiceWebhook(signed(row, "inbound", { To: "+17135550000" }))).status, 403);
    assert.equal((await voice.handleManagedVapiWebhook(event(row, "assistant-request", {}, false))).status, 403); assert.equal((await voice.handleManagedVapiWebhook(event(row, "assistant-request"))).status, 403);
    assert.equal((await voice.voiceActivationStatus(c)).active, false);
  });
  for (const target of ["assistant", "phone-number"]) for (const before of [true, false]) await check(name(`lost ${target} create response ${before ? "before" : "after"} effect never blindly creates again`), async () => {
    const c = await client(mode, target + (before ? "before" : "after")), e = engine(), req = await request(e, c); if (target === "phone-number") await e.run(req.id);
    const countBefore = result.requests.filter(r => r.path === "/" + target && r.method === "POST").length; providerFault = { path: "/" + target, method: "POST", before }; assert.equal((await e.run(req.id)).state, "uncertain"); providerFault = null;
    for (let i = 0; i < 4; i++) { clock += 60001; await e.run(req.id); }
    const countAfter = result.requests.filter(r => r.path === "/" + target && r.method === "POST").length; assert.equal(countAfter - countBefore, 1); const stored = await rowFor(c); assert.equal(!!stored[target === "assistant" ? "assistant" : "imported"], !before); assert.equal(before ? stored.state === "uncertain" : true, true);
  });
  await check(name("lost routing response is reconciled by readback without a second update"), async () => {
    const c = await client(mode, "route"), e = engine(), req = await request(e, c); await e.run(req.id); await e.run(req.id); await e.run(req.id); const row = await rowFor(c), path = `/2010-04-01/Accounts/${account}/IncomingPhoneNumbers/${row.number.id}.json`, before = result.requests.filter(r => r.path === path && r.method === "POST").length;
    providerFault = { path, method: "POST" }; assert.equal((await e.run(req.id)).state, "uncertain"); providerFault = null; assert.equal((await e.run(req.id)).state, "ready"); assert.equal(result.requests.filter(r => r.path === path && r.method === "POST").length - before, 1);
  });
  await check(name("pause during assistant create retains the receipt but blocks call handling and stale activation"), async () => {
    const c = await client(mode, "pause"), e = engine(), req = await request(e, c); beforeResponse = async request => { if (request.url.pathname === "/assistant" && request.method === "POST") { beforeResponse = null; await store.atomicUpdate("clients", c.slug, current => ({ value: { ...current, status: "paused", operationLifecycleVersion: 1, pausedAt: new Date().toISOString() } })); } };
    await e.run(req.id); const saved = await rowFor(c); assert.ok(saved.assistant.id); assert.equal((await e.run(req.id)).state, "suspended"); assert.equal((await voice.voiceActivationStatus(await read("clients", c.slug))).active, false); assert.equal(imports.has(saved.imported?.id), false);
  });
  await check(name("rules stop serving until current review/test, then automatically update the same resources"), async () => {
    const c = await client(mode, "rules"), e = engine(), req = await request(e, c); await complete(e, req); const original = await rowFor(c); const changed = { ...c, summary: "Owner updated service rules" }; const rev = configurationRevision(changed); await store.put("clients", c.slug, changed);
    assert.equal((await e.run(req.id)).state, "needs_review"); assert.equal((await voice.voiceActivationStatus(changed)).active, false); const before = result.requests.filter(row=>row.method==='POST' && ['/assistant','/phone-number'].includes(row.path)).length; changed.setupProof = { reviewedRevision: rev, testedRevision: rev, testMode: "live" }; await store.put("clients", c.slug, changed); assert.equal((await complete(e, req)).state, "ready"); const updated = await rowFor(changed); assert.equal(updated.assistant.id, original.assistant.id); assert.equal(updated.imported.id, original.imported.id); assert.equal(updated.assistant.inputRevision, rev); assert.equal(updated.adoptionReason,'reviewed_rules_changed'); assert.equal(result.requests.filter(row=>row.method==='POST' && ['/assistant','/phone-number'].includes(row.path)).length,before);
  });
  await check(name("fallback is provider-authenticated and separately reports observed and answered"), async () => {
    const c = await client(mode, "fallback"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c); await voice.handleManagedVoiceWebhook(signed(row, "inbound")); const response = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); const body = await response.text(); assert.match(body, /<Dial/); assert.match(body, /17135550100/); await voice.handleManagedVoiceWebhook(signed(row, "dial-status", { DialCallStatus: "completed" })); const status = await voice.voiceActivationStatus(c); assert.ok(status.operation.evidence.fallbackObservedAt); assert.ok(status.operation.evidence.fallbackAnsweredAt); assert.equal(status.active, false);
  });
  await check(name("duplicate end reports retain one immutable call receipt and no duplicate effect"), async () => {
    const c = await client(mode, "repeat"), e = engine(), req = await request(e, c, { forwardingMode: "use_new_number" }); await complete(e, req); const row = await rowFor(c); await voice.handleManagedVoiceWebhook(signed(row, "inbound")); await voice.handleManagedVapiWebhook(event(row, "assistant-request")); await voice.handleManagedVapiWebhook(end(row)); const key = c.slug + "/CA" + hash(row.id + "call").slice(0, 32), before = await read("managed_voice_calls", key); clock += 1000; await voice.handleManagedVapiWebhook(end(row)); assert.deepEqual(await read("managed_voice_calls", key), before); assert.equal((await voice.voiceActivationStatus(c)).active, true);
  });
  await check(name("customer cancellation confirms route detachment and resource cleanup before dependency release"), async () => {
    const c = await client(mode, "cleanup"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c), parent = await phone.getAcquiredPhoneResource(c); await e.cancel(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c) });
    const path = "/phone-number/" + row.imported.id; providerFault = { path, method: "DELETE" }; await e.run(req.id); assert.equal((await e.run(req.id)).state, "cleanup_uncertain"); assert.equal((await read("phone_activation_intents", parent.intentId)).dependencies.voice.operationId, req.id); assert.equal((await rowFor(c)).imported.id, row.imported.id); providerFault = null;
    for (let i = 0; i < 6; i++) await e.run(req.id); const cleaned = await rowFor(c); assert.equal(cleaned.state, "cancelled"); assert.ok(cleaned.cleanupConfirmedAt); assert.equal(assistants.has(row.assistant.id), false); assert.equal(imports.has(row.imported.id), false); assert.equal((await read("phone_activation_intents", parent.intentId)).dependencies.voice, undefined); assert.equal(numbers.has(parent.id), true);
  });
  await check(name("parent number cancellation automatically starts child cleanup"), async () => {
    const c = await client(mode, "parent"), e = engine(), req = await request(e, c); await complete(e, req); const parent = await phone.getAcquiredPhoneResource(c); await store.atomicUpdate("phone_activation_intents", parent.intentId, old => ({ value: { ...old, cancelRequestedAt: new Date().toISOString(), state: "cleanup_pending" } }));
    for (let i = 0; i < 7; i++) await e.run(req.id); const row = await rowFor(c); assert.equal(row.state, "cancelled"); assert.equal(row.cancellationReason, "parent_number_cancelled"); assert.equal((await read("phone_activation_intents", parent.intentId)).dependencies.voice, undefined);
  });
  await check(name("concurrent requests and workers retain one assistant create and one import"), async () => {
    const c = await client(mode, "concurrent"), e = engine(), before = result.requests.length, requests = await Promise.all(Array.from({ length: 5 }, () => request(e, c))); assert.ok(requests.every(row => row.id === requests[0].id));
    for (let i = 0; i < 5; i++) await Promise.all([e.run(requests[0].id), e.run(requests[0].id), e.run(requests[0].id)]);
    const calls = result.requests.slice(before); assert.equal(calls.filter(row => row.path === "/assistant" && row.method === "POST").length, 1); assert.equal(calls.filter(row => row.path === "/phone-number" && row.method === "POST").length, 1); assert.equal((await rowFor(c)).state, "ready");
  });
  await check(name("cancellation during in-flight creation retains late receipt before cleanup"), async () => {
    const c = await client(mode, "latecancel"), e = engine(), req = await request(e, c); let release, reached; const hold = new Promise(resolve => { release = resolve; }), arrived = new Promise(resolve => { reached = resolve; });
    beforeResponse = async call => { if (call.url.pathname === "/assistant" && call.method === "POST") { beforeResponse = null; reached(); await hold; } };
    const flight = e.run(req.id); await arrived; await e.cancel(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c) }); assert.equal((await e.run(req.id)).state, "cleanup_pending"); release(); await flight; const late = await rowFor(c); assert.ok(late.assistant.id); assert.equal(late.state, "cleanup_pending");
    for (let i = 0; i < 6; i++) await e.run(req.id); assert.equal((await rowFor(c)).state, "cancelled"); assert.equal(assistants.has(late.assistant.id), false); assert.equal((await read("voice_activation_queue", "active_v1")).intents[req.id], undefined);
  });
  await check(name("ended calls reject delayed tools and reserve call usage only once"), async () => {
    const c = await client(mode, "closedcall"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c); await voice.handleManagedVoiceWebhook(signed(row, "inbound"));
    await voice.handleManagedVapiWebhook(event(row, "assistant-request")); await voice.handleManagedVapiWebhook(event(row, "assistant-request")); const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); const budget = await read("managed_voice_usage", `${c.slug}/${row.tenantIdentity}/${day}`); assert.equal(budget.calls, 1); assert.equal(budget.reservedSeconds, policy.maxDurationSeconds);
    await voice.handleManagedVapiWebhook(end(row)); let dispatches = 0; const response = await voice.handleManagedVapiWebhook(event(row, "tool-calls", { toolCallList: [{ id: "late-tool", function: { name: "notify_owner", arguments: { issue: "Late request" } } }] }), { dispatchTool: async () => { dispatches++; return "saved"; } }); assert.equal(dispatches, 0); assert.ok((await response.json()).results[0].error);
  });
  await check(name("root dispatcher saves one real lead for a repeated call tool and reports delivery honestly"), async () => {
    const c = await client(mode, "realtool"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c); await voice.handleManagedVoiceWebhook(signed(row, "inbound")); await voice.handleManagedVapiWebhook(event(row, "assistant-request"));
    const wrapper = (await import("../netlify/functions/managed-vapi.mjs")).default, input = { customer_name: "Alex Fixture", phone: "+17135550999", address: "10 Fixture St", issue: "AC has stopped cooling", reason: "question", urgency: "flexible", language: "en", wanted: "", nobook_reason: "none", unsure: "" }, extra = { toolCallList: [{ id: "tool-one", function: { name: "notify_owner", arguments: input } }] };
    const first = await (await wrapper(event(row, "tool-calls", extra))).json(), second = await (await wrapper(event(row, "tool-calls", extra))).json(); assert.equal(first.results[0].result, second.results[0].result); assert.match(first.results[0].result, /saved/); assert.match(first.results[0].result, /Do not claim anyone was texted/); assert.equal((await store.list("leads", c.slug + "/")).length, 1);
  });
  await check(name("three ready customers refresh in one leased background wave before stale routing expires"), async () => {
    const e = engine(), rows = [];
    for (let i = 0; i < 3; i++) { const c = await client(mode, "wave" + i), req = await request(e, c); await complete(e, req); rows.push({ c, req }); }
    clock += 24 * 60000; const outcome = await voice.runVoiceActivationWave(); assert.equal(outcome.processed, 3); assert.equal(outcome.ok, true);
    for (const { c } of rows) assert.equal((await rowFor(c)).routing.checkedAt, new Date().toISOString());
    const worker = (await import("../netlify/functions/voice-activation-background.mjs")).default; assert.equal((await worker(new Request(origin + "/api/voice-activation-background", { method: "POST", body: "{}" }))).status, 403);
    const old = process.env.SERVICE_WORKER_KEY; delete process.env.SERVICE_WORKER_KEY; const before = result.requests.length; assert.equal((await voice.voiceActivationStatus(rows[0].c)).available, false); assert.equal((await voice.dispatchVoiceActivationWave()).dispatched, false); assert.equal(result.requests.length, before); process.env.SERVICE_WORKER_KEY = old;
  });
  await check(name("admission rejects the 26th active operation before provider resource creation"), async () => {
    const e = engine(); for (let i = 0; i < 25; i++) await request(e, await client(mode, "capacity" + i)); const extra = await client(mode, "overflow"), before = result.requests.length;
    await assert.rejects(() => request(e, extra), error => error.code === "voice_capacity_full"); assert.equal(result.requests.length, before); assert.equal((await voice.voiceRecoveryHealth()).partial, false);
  });
  await check(name("actual inbound calls stop at the approved per-customer daily budget"), async () => {
    const c = await client(mode, "dailycap"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c);
    for (let i = 0; i < 4; i++) { const sid = "CA" + hash(row.id + "cap" + i).slice(0, 32), call = { id: uuid(row.id + "vapi-cap" + i), type: "inboundPhoneCall", phoneNumberId: row.imported.id, customer: { number: "+17135550999" }, transport: { provider: "twilio", accountSid: account, callSid: sid } }; await voice.handleManagedVoiceWebhook(signed(row, "inbound", { CallSid: sid })); const response = await (await voice.handleManagedVapiWebhook(event(row, "assistant-request", { call }))).json(); assert.equal(!!response.assistant, i < policy.maxDailyCalls); if (i === 3) assert.match(response.error, /usage limit/); }
  });
  await check(name("owner cancellation remains available after execution policy is removed"), async () => {
    const c = await client(mode, "canceloff"), e = engine(), req = await request(e, c), previous = process.env.VOICE_ACTIVATION_POLICY_JSON; delete process.env.VOICE_ACTIVATION_POLICY_JSON;
    try { const view = await voice.cancelVoiceActivation(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c) }); assert.equal(view.state, "cleanup_pending"); assert.ok((await read("voice_activation_intents", req.id)).cancelRequestedAt); } finally { process.env.VOICE_ACTIVATION_POLICY_JSON = previous; }
  });
  await check(name("lost child acknowledgment after actual dependency CAS cannot strand number cleanup"), async () => {
    const c = await client(mode, "claimack"), e = voice.createVoiceActivationEngine({ provider: createManagedVoiceProvider({ executionAllowed: () => enabled }), policy, gate: () => enabled, claimDependency: async (client, args) => { await phone.claimPhoneResourceDependency(client, args); throw new Error("Fixture lost child acknowledgment after parent CAS committed"); } }), req = await request(e, c), before = result.requests.length;
    assert.equal((await e.run(req.id)).state, "uncertain"); const child = await rowFor(c), parent = await phone.getAcquiredPhoneResource(c); assert.equal(child.dependencyClaimedAt, undefined); assert.equal((await read("phone_activation_intents", parent.intentId)).dependencies.voice.operationId, req.id);
    await e.cancel(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c) }); assert.equal((await e.run(req.id)).state, "cancelled"); assert.equal((await read("phone_activation_intents", parent.intentId)).dependencies.voice, undefined); assert.equal(result.requests.length, before);
  });
  await check(name("testing to live adopts the lifecycle and answers with the same acquired resources"), async () => {
    const c=await client(mode,'golive'), e=engine(),req=await request(e,c);await complete(e,req);const initial=await rowFor(c),before=result.requests.filter(row=>row.method==='POST' && ['/assistant','/phone-number'].includes(row.path)).length;
    const live={...c,status:'live',operationLifecycleVersion:1,liveAt:new Date().toISOString()};await store.put('clients',c.slug,live);assert.equal((await complete(e,req)).state,'ready');const current=await rowFor(live);assert.equal(current.assistant.id,initial.assistant.id);assert.equal(current.imported.id,initial.imported.id);assert.equal(current.adoptionReason,'workspace_lifecycle_changed');await voice.handleManagedVoiceWebhook(signed(current,'inbound',{ForwardedFrom:live.phone.businessNumber}));assert.ok((await (await voice.handleManagedVapiWebhook(event(current,'assistant-request'))).json()).assistant);assert.equal(result.requests.filter(row=>row.method==='POST' && ['/assistant','/phone-number'].includes(row.path)).length,before);
  });
  await check(name("pause and resume recover automatically without another purchase or owner approval"), async () => {
    const c=await client(mode,'resumed'),e=engine(),req=await request(e,c);await complete(e,req);const initial=await rowFor(c),before=result.requests.filter(row=>row.method==='POST' && ['/assistant','/phone-number'].includes(row.path)).length;
    await store.put('clients',c.slug,{...c,status:'paused',operationLifecycleVersion:1,pausedAt:new Date().toISOString()});assert.equal((await e.run(req.id)).state,'suspended');const paused=await voice.handleManagedVoiceWebhook(signed(initial,'inbound'));assert.doesNotMatch(await paused.text(),/Redirect/);
    const resumed={...c,status:'live',operationLifecycleVersion:2,liveAt:new Date().toISOString(),pausedAt:null};await store.put('clients',c.slug,resumed);assert.equal((await complete(e,req)).state,'ready');const current=await rowFor(resumed);assert.equal(current.assistant.id,initial.assistant.id);assert.equal(current.imported.id,initial.imported.id);await voice.handleManagedVoiceWebhook(signed(current,'inbound'));assert.ok((await (await voice.handleManagedVapiWebhook(event(current,'assistant-request'))).json()).assistant);assert.equal(result.requests.filter(row=>row.method==='POST' && ['/assistant','/phone-number'].includes(row.path)).length,before);
  });
  await check(name("a solo operator can use the new number with a generic non-looping fallback"),async()=>{
    const c=await client(mode,'solo'),e=engine();c.phone.businessNumber=c.owner.phone;const rev=configurationRevision(c);c.setupProof={reviewedRevision:rev,testedRevision:rev,testMode:'live'};await store.put('clients',c.slug,c);await assert.rejects(()=>request(e,c),error=>error.code==='unsafe_forwarding');const req=await request(e,c,{forwardingMode:'use_new_number'});assert.equal((await complete(e,req)).state,'ready');const row=await rowFor(c);assert.equal(imports.get(row.imported.id).fallbackDestination,undefined);assert.equal(numbers.get(row.number.id).voice_fallback_url,process.env.VOICE_FALLBACK_TWIML_URL);await voice.handleManagedVoiceWebhook(signed(row,'inbound'));assert.ok((await(await voice.handleManagedVapiWebhook(event(row,'assistant-request'))).json()).assistant);const fallback=await voice.handleManagedVoiceWebhook(signed(row,'fallback'));assert.doesNotMatch(await fallback.text(),/<Dial/);
  });
  await check(name("the acquired new number can be the advertised business line without a forwarding loop"),async()=>{
    const c=await client(mode,'advertised'),e=engine(),resource=await phone.getAcquiredPhoneResource(c);c.phone.businessNumber=resource.number;const rev=configurationRevision(c);c.setupProof={reviewedRevision:rev,testedRevision:rev,testMode:'live'};await store.put('clients',c.slug,c);const req=await request(e,c,{forwardingMode:'use_new_number'});assert.equal((await complete(e,req)).state,'ready');const row=await rowFor(c);await voice.handleManagedVoiceWebhook(signed(row,'inbound'));assert.ok((await(await voice.handleManagedVapiWebhook(event(row,'assistant-request'))).json()).assistant);
  });
}
await suite("memory"); await suite("sdk");
result.sourceAfter = hashes(); result.sourceStable = Object.entries(result.sourceBefore).every(([key, value]) => result.sourceAfter[key] === value); result.ok = result.checks.every(check => check.pass) && result.sourceStable && result.blocked.length === 0; result.passed = result.checks.filter(check => check.pass).length; result.total = result.checks.length;
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ ok: result.ok, passed: result.passed, total: result.total, conflicts: result.conflicts, fixtureProviderRequests: result.requests.length, failures: result.checks.filter(check => !check.pass), output }, null, 2)); if (!result.ok) process.exitCode = 1;
