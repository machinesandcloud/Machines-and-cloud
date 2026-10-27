// Independent adversarial review using the existing blocked provider/Blobs transport fixture.
// These additional cases are separate from the engineer acceptance suite.
// All credentials are dummy and every physical network primitive is disabled.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const outputIndex = process.argv.indexOf("--output"), output = outputIndex < 0 ? null : process.argv[outputIndex + 1];
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error("Choose a new scratchpad receipt");
const sources = ["netlify/functions/lib/voice-activation.mjs", "netlify/functions/lib/voice-provider.mjs", "netlify/functions/managed-voice.mjs", "netlify/functions/managed-vapi.mjs", "netlify/functions/voice-activation-background.mjs", "netlify/functions/voice-activation-scheduler.mjs"], hash = value => createHash("sha256").update(value).digest("hex"), hashes = () => Object.fromEntries(sources.map(file => [file, hash(readFileSync(file))]));
let beforeProviderEffect = null;
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
  if (url.origin === "https://handler.twilio.com") { assert.equal(enabled, true); assert.equal(url.searchParams.get('AccountSid'),account);assert.equal(url.searchParams.size,1);assert.equal(url.searchParams.has("cell"),false,"Independent outage fallback must never carry the owner cell");const headers=new Headers(init.headers);assert.equal(headers.get('x-twilio-signature'),createHmac('sha1',twilioToken).update(url.href).digest('base64'));assert.equal(headers.has('authorization'),false);assert.equal(headers.has('cookie'),false);assert.equal(init.redirect,'error');return new Response(`<Response><Say voice="Polly.Joanna">Please call back in a few minutes.</Say></Response>`); }
  if (!["https://api.vapi.ai", "https://api.twilio.com"].includes(url.origin)) { result.blocked.push({ origin: url.origin, path: url.pathname }); return deny(); }
  assert.equal(enabled, true); result.requests.push({ method, path: url.pathname });
  const req = { url, method, body: init.body ? url.origin === "https://api.vapi.ai" ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body)) : null };
  if (providerFault?.path === url.pathname && providerFault.method === method && providerFault.before) throw new Error("Fixture response unavailable before provider commit");
  if (beforeProviderEffect) await beforeProviderEffect(req);
  let response;
  if (url.origin === "https://api.vapi.ai") {
    const kind = url.pathname.startsWith("/assistant") ? "assistant" : "phone-number", map = kind === "assistant" ? assistants : imports, id = url.pathname.split("/")[2];
    if (method === "GET") response = id ? map.has(id) ? Response.json(map.get(id)) : new Response(null, { status: 404 }) : Response.json([...map.values()]);
    else if (method === "DELETE") { map.delete(id); response = Response.json({ id }); }
    else if (method === "PATCH") { const old = map.get(id); if (!old) response = new Response(null, { status: 404 }); else { map.set(id, { ...old, ...req.body }); response = Response.json(map.get(id)); } }
    else {
      assert.equal(method, "POST"); const body = req.body, identifier = uuid(kind + body.name + ++serial), remote = { ...body, id: identifier, orgId: "fixture-org", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...(kind === "phone-number" ? { status: "active" } : {}) }; map.set(identifier, remote);
      if (kind === "phone-number") { assert.equal(body.fallbackDestination,undefined,"Imported resource must not retain a native owner-cell fallback"); assert.equal(body.smsEnabled, false); assert.equal(body.assistantId, undefined); assert.equal(body.squadId, undefined); assert.equal(body.workflowId, undefined); const twilio = [...numbers.values()].find(row => row.phone_number === body.number); assert.ok(twilio); twilio.voice_url = "https://api.vapi.ai/twilio/inbound_call"; twilio.voice_method = "POST"; }
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
const check = async (name, fn) => { try { await fn(); result.checks.push({ name, pass: true }); } catch (error) { result.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } finally { fault = null; providerFault = null; beforeResponse = null; enabled = true; process.env.VOICE_ACTIVATION_ENABLED = "true"; } };
async function client(mode, suffix) {
  const slug = `voice-${mode}-${suffix}-${++serial}`, c = newClient({ slug, ownerKey: "private-" + slug, owner: { email: slug + "@example.test", name: "Fixture Owner", phone: "+17135550100" }, business: { name: "Fixture Shop", trade: "HVAC", serviceArea: ["Houston"] } });
  Object.assign(c, { onboarding: { version: 1 }, status: "testing", build: { status: "built" }, services: ["AC repair"], windows: ["8 to 12", "12 to 5"], channels: { web: { active: false }, voice: { active: false }, sms: { active: false } } }); c.business.serviceArea = ["Houston"]; c.rules.hours = { mon: { open: "08:00", close: "17:00" } }; c.phone.businessNumber = "+17135550122"; const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: "live" };
  await store.put("clients", slug, c);
  const identity = hash(JSON.stringify([c.slug, c.ownerKey, c.owner.email])), intentId = c.slug + "/" + hash("first-phone-acquisition:" + identity), sid = "PN" + hash(c.slug).slice(0, 32), number = "+1713" + String(5553100 + serial).slice(-7), correlationId = hash("number-" + c.slug);
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

async function independentSuite(mode) {
process.env.MC_MEMORY_STORE = mode === "memory" ? "1" : "0";
process.env.SERVICE_WORKER_KEY = "independent-worker-key-" + "c".repeat(40);
await check(mode + ": a stale provider PATCH cannot select older rules for the next customer's call", async () => {
  const c = await client("independent", "stale-runtime"), e = engine(), requested = await request(e, c); await complete(e, requested);
  const first = { ...c, summary: "OLDER revision: no Sunday service" }, rev1 = configurationRevision(first); first.setupProof = { reviewedRevision: rev1, testedRevision: rev1, testMode: "live" }; await store.put("clients", c.slug, first); await request(e, first);
  let release, arrived; const hold = new Promise(resolve => { release = resolve; }), reached = new Promise(resolve => { arrived = resolve; }); let once = false;
  beforeProviderEffect = async call => { if (!once && call.method === "PATCH" && call.url.pathname.startsWith("/assistant/") && call.body.metadata.mcVoiceRevision === rev1) { once = true; arrived(); await hold; } };
  const old = e.run(requested.id); await reached;
  const latest = { ...c, summary: "CURRENT revision: Sunday service 10 to 2 only" }, rev2 = configurationRevision(latest); latest.setupProof = { reviewedRevision: rev2, testedRevision: rev2, testMode: "live" }; await store.put("clients", c.slug, latest); await request(e, latest); assert.equal((await complete(e, requested)).state, "ready");
  release(); await old; beforeProviderEffect = null;
  const row = await rowFor(latest), remote = assistants.get(row.assistant.id); assert.equal(remote.metadata.mcVoiceRevision, rev1, "Fixture must reproduce the stale provider-side mutation");
  await voice.handleManagedVoiceWebhook(signed(row, "inbound", { ForwardedFrom: latest.phone.businessNumber }));
  const runtime = await (await voice.handleManagedVapiWebhook(event(row, "assistant-request"))).json();
  assert.ok(runtime.assistant, "Serving a mutable stored assistant ID can select the stale provider prompt");
  assert.equal(runtime.assistant.metadata.mcVoiceRevision, rev2); assert.equal(runtime.assistantId, undefined);
  assert.ok(runtime.assistant.model.messages[0].content.includes("CURRENT revision"));
});
await check(mode + ": an ended call cannot create a new booking through a delayed tool event", async () => {
  const c = await client("independent", "ended-tools"), e = engine(), requested = await request(e,c); await complete(e,requested); const row = await rowFor(c);
  await voice.handleManagedVoiceWebhook(signed(row,"inbound")); await voice.handleManagedVapiWebhook(event(row,"assistant-request")); await voice.handleManagedVapiWebhook(end(row));
  let dispatches = 0; const response = await voice.handleManagedVapiWebhook(event(row,"tool-calls",{toolCallList:[{id:"new-after-end",function:{name:"book_visit",arguments:{customer_name:"Late request"}}}]}),{dispatchTool:async()=>{dispatches++;return "A booking was created";}});
  const body = await response.json(); assert.equal(dispatches,0,"An already ended call dispatched a new mutation"); assert.ok(body.results?.[0]?.error || body.error);
});
await check(mode + ": routine lifecycle and reviewed rules adopt current generation without new resources", async()=>{
  const c=await client("independent","autoadopt"),e=engine(),requested=await request(e,c);await complete(e,requested);const original=await rowFor(c);await voice.handleManagedVoiceWebhook(signed(original,"inbound"));await voice.handleManagedVapiWebhook(event(original,"assistant-request"));const before=result.requests.filter(call=>call.method==="POST"&&["/assistant","/phone-number"].includes(call.path)).length;
  const live={...c,status:"live",operationLifecycleVersion:1};await store.put("clients",c.slug,live);assert.equal((await complete(e,requested)).state,"ready");const current=await rowFor(live);assert.ok(current.generation>original.generation);assert.equal(current.assistant.id,original.assistant.id);assert.equal(current.imported.id,original.imported.id);
  let mutations=0;const stale=await voice.handleManagedVapiWebhook(event(original,"tool-calls",{toolCallList:[{id:"old-generation-tool",function:{name:"book_visit",arguments:{}}}]}),{dispatchTool:async()=>{mutations++;return "saved";}});assert.equal(stale.status,403);assert.equal(mutations,0);
  await store.put("clients",c.slug,{...live,status:"paused",operationLifecycleVersion:2});assert.equal((await e.run(requested.id)).state,"suspended");const resumed={...live,operationLifecycleVersion:3};await store.put("clients",c.slug,resumed);assert.equal((await complete(e,requested)).state,"ready");
  const changed={...resumed,summary:"Current reviewed repair limits"},rev=configurationRevision(changed);changed.setupProof={reviewedRevision:rev,testedRevision:rev,testMode:"live"};await store.put("clients",c.slug,changed);assert.equal((await complete(e,requested)).state,"ready");assert.equal((await rowFor(changed)).inputRevision,rev);assert.equal(result.requests.filter(call=>call.method==="POST"&&["/assistant","/phone-number"].includes(call.path)).length,before);
});
await check(mode + ": one bounded recovery wave refreshes three ready customers before route expiry", async () => {
  const entries = [];
  for (const suffix of ["wave-a","wave-b","wave-c"]) { const c = await client("independent",suffix), e = engine(), requested = await request(e,c); const prepared = await complete(e,requested); assert.equal(prepared.state,"ready",JSON.stringify(prepared)); entries.push(c); }
  clock += 24 * 60000;
  const wave = await voice.runVoiceActivationWave({deadlineAt:Date.now()+240000}); assert.ok(wave.processed >= 3);
  for (const c of entries) { const row = await rowFor(c); assert.ok(row.routing,JSON.stringify({state:row.state,reason:row.reasonCode,slug:c.slug})); assert.ok(Date.now()-Date.parse(row.routing.checkedAt)<60000,"Every ready route must get fresh readback in the samewave"); const inbound = await voice.handleManagedVoiceWebhook(signed(row,"inbound")); assert.match(await inbound.text(),/<Redirect/); }
  const worker = (await import("../netlify/functions/voice-activation-background.mjs")).default;
  assert.equal((await worker(new Request(origin+"/api/voice-activation-background",{method:"POST",body:"{}"}))).status,403);
  assert.equal((await worker(new Request(origin+"/api/voice-activation-background",{method:"POST",headers:{"x-service-worker-key":process.env.SERVICE_WORKER_KEY},body:'{"slug":"injected"}'}))).status,400);
});

}
await independentSuite("memory");
await independentSuite("sdk");
result.sourceAfter = hashes(); result.sourceStable = Object.entries(result.sourceBefore).every(([key,value]) => result.sourceAfter[key] === value); result.ok = result.checks.every(check => check.pass) && result.blocked.length === 0; result.passed = result.checks.filter(check => check.pass).length; result.total = result.checks.length;
if (output) writeFileSync(output, JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({ok:result.ok,passed:result.passed,total:result.total,sourceStable:result.sourceStable,failures:result.checks.filter(check=>!check.pass),output},null,2)); if (!result.ok) process.exitCode=1;
