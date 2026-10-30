// Actual production state machine, provider HTTP adapter and signed webhook handlers.
// All credentials are dummy and every physical network primitive is disabled.
import assert from "node:assert/strict";
import {paidFixture} from "./paid-service-test-fixtures.mjs";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const outputIndex = process.argv.indexOf("--output"), output = outputIndex < 0 ? null : process.argv[outputIndex + 1];
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error("Choose a new scratchpad receipt");
const sources = ["netlify/functions/lib/voice-activation.mjs", "netlify/functions/lib/voice-provider.mjs", "netlify/functions/lib/service-lifecycle.mjs", "netlify/functions/managed-voice.mjs", "netlify/functions/managed-vapi.mjs", "netlify/functions/voice-activation-background.mjs", "netlify/functions/voice-activation-scheduler.mjs"], hash = value => createHash("sha256").update(value).digest("hex"), hashes = () => Object.fromEntries(sources.map(file => [file, hash(readFileSync(file))]));
const result = { at: new Date().toISOString(), mode: "actual voice engine, HTTP adapter and webhook protocols; memory + installed Blobs SDK fixtures; zero real requests", sourceBefore: hashes(), checks: [], conflicts: 0, blocked: [], requests: [] };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|VOICE_|PHONE_)/.test(key)) delete process.env[key];
const account = "AC" + "1".repeat(32), twilioToken = "fixture-twilio-token", secret = "fixture-vapi-secret-" + "a".repeat(32), origin = "http://127.0.0.1:8897";
const policy = { version: "fixture_voice_v1", model: "fixture-approved-model", maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, accountDailyCalls: 1000, accountDailyMinutes: 5000, authorityText: "I am authorized to connect this business phone service and direct calls to the recorded owner cell.", usageDisclosure: "This fixture represents an explicitly approved voice usage policy; no actual prices or calls are authorized." };
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: origin, TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: twilioToken, VAPI_API_KEY: "fixture-private", VAPI_WEBHOOK_SECRET: secret, VOICE_ACTIVATION_ENABLED: "true", VOICE_ACTIVATION_APPROVED_VERSION: policy.version, VOICE_ACTIVATION_POLICY_JSON: JSON.stringify(policy), VOICE_FALLBACK_TWIML_URL: "https://handler.twilio.com/twiml/EH" + "f".repeat(32), SERVICE_WORKER_KEY: "fixture-service-worker-" + "a".repeat(32) });
const deny = () => { throw new Error("Voice test physical networking disabled"); }; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const NativeDate = Date; let clock = NativeDate.now(); globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const blobs = new Map(), assistants = new Map(), imports = new Map(), numbers = new Map(); let etag = 0, serial = 0, fault = null, providerFault = null, beforeResponse = null, enabled = true;
let fallbackBody = '<Response><Say voice="Polly.Joanna">Please call back in a few minutes.</Say></Response>', fallbackRedirect = false;
const fallbackProbes = [];
function twimlBinFixture(input, init = {}) {
  const url = new URL(String(input)), headers = new Headers(init.headers);
  assert.equal(init.method || 'GET', 'GET'); assert.equal(init.redirect, 'error');
  assert.equal(headers.has('authorization'), false); assert.equal(headers.has('cookie'), false);
  if (url.searchParams.get('AccountSid') !== account || url.searchParams.size !== 1) return new Response('AccountSid parameter required', {status:400});
  const expected = createHmac('sha1', twilioToken).update(url.href).digest('base64');
  if (headers.get('x-twilio-signature') !== expected) return new Response('Only signed Twilio requests are allowed', {status:401});
  return fallbackRedirect ? new Response(null, {status:302,headers:{Location:'https://foreign-fallback.invalid/'}}) : new Response(fallbackBody);
}
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
  if (url.origin === "https://handler.twilio.com") { assert.equal(enabled, true); const response=twimlBinFixture(input,init); fallbackProbes.push({status:response.status,accountQueryPresent:url.searchParams.has('AccountSid'),signed:new Headers(init.headers).has('x-twilio-signature')}); return response; }
  if (!["https://api.vapi.ai", "https://api.twilio.com"].includes(url.origin)) { result.blocked.push({ origin: url.origin, path: url.pathname }); return deny(); }
  assert.equal(enabled, true); result.requests.push({ method, path: url.pathname });
  const req = { url, method, body: init.body ? url.origin === "https://api.vapi.ai" ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body)) : null };
  if (providerFault?.path === url.pathname && providerFault.method === method && providerFault.status) return Response.json({message:["Unexpected additionalProperties; secret echoed qa-synthetic-private-value"],echo:"qa-synthetic-private-value"},{status:providerFault.status,headers:{"x-request-id":providerFault.requestId||"12345678-1234-1234-1234-123456789abc"}});
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
const store = await import("../netlify/functions/lib/store.mjs"), { strictRead: read } = await import("../netlify/functions/lib/accounts.mjs"), voice = await import("../netlify/functions/lib/voice-activation.mjs"), { createManagedVoiceProvider, managedAssistantBody, managedVoiceToolParameters } = await import("../netlify/functions/lib/voice-provider.mjs"), { configurationRevision } = await import("../netlify/functions/lib/setup.mjs"), { newClient } = await import("../netlify/functions/lib/config.mjs"), phone = await import("../netlify/functions/lib/phone-activation.mjs");
const check = async (name, fn) => { try { await store.put("voice_activation_queue", "active_v1", { version: 1, intents: {}, cursor: "" }); await fn(); result.checks.push({ name, pass: true }); } catch (error) { result.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } finally { fault = null; providerFault = null; beforeResponse = null; enabled = true; fallbackBody='<Response><Say voice="Polly.Joanna">Please call back in a few minutes.</Say></Response>';fallbackRedirect=false;process.env.TWILIO_AUTH_TOKEN=twilioToken;process.env.VOICE_FALLBACK_TWIML_URL='https://handler.twilio.com/twiml/EH'+'f'.repeat(32);process.env.VOICE_ACTIVATION_ENABLED = "true"; } };
async function client(mode, suffix) {
  const slug = `voice-${mode}-${suffix}-${++serial}`, c = newClient({ slug, ownerKey: "private-" + slug, owner: { email: slug + "@example.test", name: "Fixture Owner", phone: "+17135550100" }, business: { name: "Fixture Shop", trade: "HVAC", serviceArea: ["Houston"] } });
  Object.assign(c, { onboarding: { version: 1 }, status: "testing", build: { status: "built" }, channels: { web: { active: false }, voice: { active: false }, sms: { active: false } } }); c.phone.businessNumber = "+17135550122";c.services=["AC repair"];c.windows=["8 to 12"];c.rules.hours={mon:{open:"08:00",close:"17:00"}}; const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: "live" };
  await store.put("clients", slug, c);
  const identity = hash(JSON.stringify([c.slug, c.ownerKey, c.owner.email])), intentId = c.slug + "/" + hash("first-phone-acquisition:" + identity), sid = "PN" + hash(c.slug).slice(0, 32), number = "+1713" + String(5551000 + serial).slice(-7), correlationId = hash("number-" + c.slug);
  await store.put("phone_activation_intents", intentId, { version: 1, id: intentId, slug, tenantIdentity: identity, state: "number_acquired", resource: { id: sid, number, correlationId }, correlationId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  numbers.set(sid, { sid, account_sid: account, phone_number: number, voice_url: "", voice_method: "POST", voice_application_sid: "", sms_url: "https://fixture-sms.invalid/unchanged", sms_application_sid: "", sms_fallback_url: "https://fixture-sms.invalid/fallback" });
  return c;
}
const engine = () => voice.createVoiceActivationEngine({ provider: createManagedVoiceProvider({ executionAllowed: () => enabled }), policy, gate: () => enabled });
const request = (e, c, extra = {}) => e.request(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c), acceptedAuthority: true, policyVersion: e.offer().version, policyDigest: e.offer().digest, forwardingMode: "forward_business_line", ...extra });
async function complete(e, row, max = 8) { let view; for (let i = 0; i < max; i++) { view = await e.run(row.id); if (view.state === "ready") return view; } return view; }
async function rowFor(c) { const status = await voice.voiceActivationStatus(c); return status.operation ? read("voice_activation_intents", status.operation.id) : null; }
function signed(row, kind, extras = {}, signature = true) { const url = `${origin}/api/managed-voice?o=${row.callbackToken}&kind=${kind}`, params = { AccountSid: account, CallSid: "CA" + hash(row.id + "call").slice(0, 32), To: row.number.number, From: "+17135550999", ...extras }, sig = createHmac("sha1", twilioToken).update(url + Object.keys(params).sort().map(key => key + params[key]).join("")).digest("base64"); return new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(signature ? { "x-twilio-signature": sig } : {}) }, body: new URLSearchParams(params).toString() }); }
function event(row, type, extra = {}, headers = true, sidOverride = null) { const call = { id: uuid(row.id + "vapi-call"), type: "inboundPhoneCall", phoneNumberId: row.imported.id, customer: { number: "+17135550999" }, transport: { provider: "twilio", accountSid: account, callSid: sidOverride || "CA" + hash(row.id + "call").slice(0, 32) } }; return new Request(origin + "/api/managed-vapi", { method: "POST", headers: { "content-type": "application/json", ...(headers ? { "x-vapi-secret": secret } : {}) }, body: JSON.stringify({ message: { type, call, phoneNumber: { number: row.number.number, name: `mc-phone-${row.correlationId.slice(0, 30)}` }, ...extra } }) }); }
const end = row => event(row, "end-of-call-report", { startedAt: new Date(clock - 20000).toISOString(), endedAt: new Date(clock).toISOString(), endedReason: "customer-ended-call", artifact: { transcript: "Fixture customer asked about AC service." }, analysis: { summary: "Fixture service inquiry." } });
async function suite(mode) {
  process.env.MC_MEMORY_STORE = mode === "memory" ? "1" : "0"; const name = text => mode + ": " + text;
  await check(name("paid period expiration blocks new calls and paid legs but retains admitted call settlement and cleanup"),async()=>{
    const c=await client(mode,'paid'),e=engine(),requested=await request(e,c);await complete(e,requested);const row=await rowFor(c),f=paidFixture(c);await store.put('workspace_billing',f.key,f.row);
    const first=await voice.handleManagedVoiceWebhook(signed(row,'inbound'));assert.match(await first.text(),/Redirect/);assert.ok((await(await voice.handleManagedVapiWebhook(event(row,'assistant-request'))).json()).assistant);
    clock=f.row.paidPeriod.end*1000;
    const replay=await voice.handleManagedVoiceWebhook(signed(row,'inbound'));assert.match(await replay.text(),/Redirect/,'Already admitted same call is settled on its original reservation');
    const rejected=await voice.handleManagedVoiceWebhook(signed(row,'inbound',{CallSid:'CA'+hash(c.slug+'new-paid-call').slice(0,32)}));assert.doesNotMatch(await rejected.text(),/Redirect|<Dial/);
    const fallback=await voice.handleManagedVoiceWebhook(signed(row,'fallback'));assert.doesNotMatch(await fallback.text(),/<Dial/,'New fallback leg is chargeable');
    assert.equal((await voice.handleManagedVapiWebhook(end(row))).status,200);
    await e.cancel(c,{actor:{role:'owner',email:c.owner.email},expectedRevision:configurationRevision(c)});for(let n=0;n<8;n++)await e.run(requested.id);assert.equal((await rowFor(c)).state,'cancelled');
  });
  await check(name("expired paid service cannot create another assistant or import and writes no uncertain-create marker"),async()=>{
    const c=await client(mode,'paid-create'),e=engine(),requested=await request(e,c),f=paidFixture(c,{start:Math.floor(clock/1000)-120,end:Math.floor(clock/1000)-60});await store.put('workspace_billing',f.key,f.row);const before=result.requests.filter(x=>x.method==='POST').length;assert.equal((await e.run(requested.id)).state,'waiting_platform');const saved=await rowFor(c);assert.equal(saved.assistantCreateStartedAt,undefined);assert.equal(result.requests.filter(x=>x.method==='POST').length,before);
  });
  await check(name("authority is saved while account gate is closed; unknown owner is rejected"), async () => {
    const c = await client(mode, "gate"), e = engine(), before = result.requests.length; enabled = false; const row = await request(e, c); assert.equal(row.state, "waiting_platform"); assert.equal((await e.run(row.id)).state, "waiting_platform"); assert.equal(result.requests.length, before);
    await assert.rejects(() => request(e, c, { actor: { role: "owner", email: "foreign@example.test" } }), err => err.status === 403); await assert.rejects(() => request(e, c, { acceptedAuthority: false }), err => err.status === 400);
  });
  await check(name("Vapi function parameters serialize only supported DTO keys without weakening internal schemas"),async()=>{
    const c=await client(mode,'dto'),body=managedAssistantBody(c,{correlationId:hash(c.slug),inputRevision:configurationRevision(c),policy,site:origin});
    const days=body.model.tools.find(t=>t.function.name==='get_availability').function.parameters.properties.days;assert.deepEqual(days,{type:'integer',description:'Number of consecutive dates to check, from 1 to 14',minimum:1,maximum:14});
    assert.equal(body.model.tools.length,4);for(const tool of body.model.tools){assert.deepEqual(Object.keys(tool.function.parameters).sort(),['properties','required','type']);assert.equal(JSON.stringify(tool.function.parameters).includes('additionalProperties'),false);}
    const schema={type:'object',properties:{nested:{type:'object',additionalProperties:false,properties:{value:{type:'string',minLength:1}},required:['value']}},required:['nested'],additionalProperties:false},before=structuredClone(schema),parameters=managedVoiceToolParameters(schema);assert.deepEqual(schema,before);assert.equal(parameters.properties.nested.additionalProperties,undefined);assert.deepEqual(parameters.properties.nested.required,['value']);
  });
  for(const status of [400,401,429,503])await check(name(`definite HTTP ${status} is retained without raw provider text or another create`),async()=>{
    const c=await client(mode,'http-'+status),e=engine(),req=await request(e,c),before=result.requests.filter(row=>row.path==='/assistant'&&row.method==='POST').length;
    providerFault={path:'/assistant',method:'POST',status};assert.equal((await e.run(req.id)).state,'uncertain');providerFault=null;const row=await rowFor(c);assert.deepEqual(row.providerFailure,{provider:'vapi',action:'assistant_create',httpStatus:status,requestId:'12345678-1234-1234-1234-123456789abc',bodyClass:[400,422].includes(status)?'validation_error':'json_error',at:new Date(clock).toISOString()});assert.equal(JSON.stringify(row).includes('qa-synthetic-private-value'),false);await e.run(req.id);assert.equal(result.requests.filter(row=>row.path==='/assistant'&&row.method==='POST').length-before,1);assert.equal((await rowFor(c)).state,'uncertain');
  });
  await check(name("a UUID-shaped provider request id equal to a configured secret is redacted"),async()=>{
    const original=process.env.VAPI_API_KEY,fake='12345678-1234-1234-1234-123456789abc';process.env.VAPI_API_KEY=fake;
    try{const c=await client(mode,'redact'),e=engine(),req=await request(e,c);providerFault={path:'/assistant',method:'POST',status:400,requestId:fake};assert.equal((await e.run(req.id)).state,'uncertain');providerFault=null;const row=await rowFor(c);assert.equal(row.providerFailure.requestId,null);assert.equal(JSON.stringify(row).includes(fake),false);await e.run(req.id);assert.equal((await rowFor(c)).state,'uncertain');}finally{process.env.VAPI_API_KEY=original;}
  });
  await check(name("real adapter chains assistant/import/routing with durable resource receipts and dependency"), async () => {
    const c = await client(mode, "chain"), e = engine(), row = await request(e, c), before = result.requests.length;
    assert.equal((await complete(e, row)).state, "ready"); const stored = await rowFor(c); assert.ok(stored.assistant.id); assert.ok(stored.imported.id); assert.equal(stored.routing.confirmed, true); assert.equal(stored.routing.fallbackConfigured, true); assert.equal(stored.assistantCreateStartedAt !== undefined, true); assert.equal(stored.importStartedAt !== undefined, true); assert.equal(stored.dependencyClaimedAt !== undefined, true); assert.equal((await voice.voiceActivationStatus(c)).active, false); assert.deepEqual(await read("clients", c.slug), c);
    const acquired = await phone.getAcquiredPhoneResource(c), parent = await read("phone_activation_intents", acquired.intentId); assert.equal(parent.dependencies.voice.operationId, row.id); assert.ok(result.requests.length > before); assert.equal(numbers.get(acquired.id).sms_url, "https://fixture-sms.invalid/unchanged");
  });
  await check(name("signed forwarded inbound plus bound successful Vapi report establishes observed readiness"), async () => {
    const c = await client(mode, "proof");c.setupProof={reviewedRevision:configurationRevision(c)};await store.put("clients",c.slug,c);const e = engine(), requestRow = await request(e, c); await complete(e, requestRow); const row = await rowFor(c);
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
    const c = await client(mode, "fallback"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c); await voice.handleManagedVoiceWebhook(signed(row, "inbound")); const response = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); const body = await response.text(); assert.match(body, /<Dial/); assert.match(body, /17135550100/); await voice.handleManagedVoiceWebhook(signed(row, "dial-status", { DialCallStatus: "completed", DialCallSid: "CA" + hash(row.id + "destination").slice(0, 32) })); const status = await voice.voiceActivationStatus(c); assert.ok(status.operation.evidence.fallbackObservedAt); assert.ok(status.operation.evidence.fallbackAnsweredAt); assert.equal(status.active, false);
  });
  await check(name("unanswered fallback speaks from the Dial action and retains the exact destination outcome"), async () => {
    for (const reported of ["busy", "no-answer", "failed", "canceled", "", "unexpected", "answered"]) {
      const c = await client(mode, "dial-" + (reported || "missing")), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c);
      await voice.handleManagedVoiceWebhook(signed(row, "inbound")); await voice.handleManagedVoiceWebhook(signed(row, "fallback"));
      const sid = "CA" + hash(row.id + "destination").slice(0, 32), before = result.requests.length;
      const response = await voice.handleManagedVoiceWebhook(signed(row, "dial-status", { CallStatus: "in-progress", DialCallStatus: reported, DialCallSid: sid, DialBridged: "false" })), body = await response.text();
      assert.equal(response.status, 200); assert.match(body, /<Say>We could not connect you[^<]+<\/Say><Hangup\/>/); assert.doesNotMatch(body, /<Dial|<Redirect/);
      const call = await read("managed_voice_calls", c.slug + "/CA" + hash(row.id + "call").slice(0, 32));
      assert.equal(call.fallbackOutcome.status, ["busy", "no-answer", "failed", "canceled"].includes(reported) ? reported : "unknown");
      assert.equal(call.fallbackOutcome.reportedStatus, reported || null); assert.equal(call.fallbackOutcome.callSid, sid); assert.equal(call.twilioStatus, "in-progress");
      assert.equal((await rowFor(c)).evidence.fallbackAnsweredAt, undefined); const status = await voice.voiceActivationStatus(c); assert.equal(status.operation.evidence.fallbackDialStatus, call.fallbackOutcome.status); assert.ok(status.operation.evidence.fallbackDialAt); assert.equal(result.requests.length, before);
      const terminalReplay = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.doesNotMatch(await terminalReplay.text(), /<Dial|<Redirect/); assert.deepEqual((await read("managed_voice_calls", c.slug + "/CA" + hash(row.id + "call").slice(0, 32))).fallbackOutcome, call.fallbackOutcome);
    }
  });
  await check(name("completed fallback records a transport connection once without promising a human or another call"), async () => {
    const c = await client(mode, "dial-complete"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c);
    await voice.handleManagedVoiceWebhook(signed(row, "inbound")); await voice.handleManagedVoiceWebhook(signed(row, "fallback"));
    const extras = { CallStatus: "in-progress", DialCallStatus: "completed", DialCallSid: "CA" + hash(row.id + "destination").slice(0, 32), DialBridged: "true" }, first = await voice.handleManagedVoiceWebhook(signed(row, "dial-status", extras));
    assert.equal(await first.text(), '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
    const key = c.slug + "/CA" + hash(row.id + "call").slice(0, 32), saved = await read("managed_voice_calls", key); assert.equal(saved.fallbackOutcome.status, "completed"); assert.equal(saved.fallbackOutcome.bridged, true); assert.equal(saved.fallbackOutcome.humanAccepted, undefined);
    clock += 1000; const second = await voice.handleManagedVoiceWebhook(signed(row, "dial-status", extras)); assert.equal(second.status, 200); assert.deepEqual((await read("managed_voice_calls", key)).fallbackOutcome, saved.fallbackOutcome); assert.equal((await voice.voiceActivationStatus(c)).active, false);
    const terminalReplay = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.doesNotMatch(await terminalReplay.text(), /<Dial|<Redirect/);
    const foreignLeg = await voice.handleManagedVoiceWebhook(signed(row, "dial-status", { ...extras, DialCallSid: "CA" + "9".repeat(32) })); assert.equal(foreignLeg.status, 403); assert.deepEqual((await read("managed_voice_calls", key)).fallbackOutcome, saved.fallbackOutcome);
  });
  await check(name("a fallback callback cannot adopt another caller or an unattempted dial"), async () => {
    const c = await client(mode, "dial-caller"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c);
    await voice.handleManagedVoiceWebhook(signed(row, "inbound"));
    const before = await rowFor(c), unsolicited = await voice.handleManagedVoiceWebhook(signed(row, "dial-status", { DialCallStatus: "completed" })); assert.equal(unsolicited.status, 403); assert.deepEqual(await rowFor(c), before);
    const mismatch = await voice.handleManagedVoiceWebhook(signed(row, "fallback", { From: "+17135550888" })); assert.equal(mismatch.status, 403); assert.deepEqual(await rowFor(c), before);
  });
  await check(name("known own-number reentry ends without dialing or routing back into the assistant"), async () => {
    const c = await client(mode, "dial-loop"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c);
    for (const from of [row.number.number, c.phone.businessNumber, "anonymous"]) {
      const response = await voice.handleManagedVoiceWebhook(signed(row, "inbound", { From: from })), body = await response.text(); assert.equal(response.status, 200); assert.match(body, /<Say>/); assert.doesNotMatch(body, /<Dial|<Redirect/);
    }
    const ownerCall = await voice.handleManagedVoiceWebhook(signed(row, "inbound", { From: c.owner.phone })); assert.match(await ownerCall.text(), /<Redirect/);
    const ownerFallback = await voice.handleManagedVoiceWebhook(signed(row, "fallback", { From: c.owner.phone })); assert.doesNotMatch(await ownerFallback.text(), /<Dial/);
  });
  await check(name("old callbacks never dial a replacement tenant or stamp its current voice generation"), async () => {
    const c = await client(mode, "dial-replaced"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c); await voice.handleManagedVoiceWebhook(signed(row, "inbound"));
    const replacement = { ...c, ownerKey: "new-owner-secret", owner: { ...c.owner, email: "replacement@example.test", phone: "+17135550888" } }; await store.put("clients", c.slug, replacement);
    const before = await rowFor(c), response = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.equal(response.status, 200); const body = await response.text(); assert.match(body, /<Say>/); assert.doesNotMatch(body, /<Dial|17135550888/); assert.deepEqual((await rowFor(c)).evidence, before.evidence);
  });
  await check(name("old generation dial events cannot become current readiness evidence"), async () => {
    const c = await client(mode, "dial-generation"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c); await voice.handleManagedVoiceWebhook(signed(row, "inbound")); await voice.handleManagedVoiceWebhook(signed(row, "fallback"));
    const changed = { ...c, summary: "A newly reviewed instruction" }, revision = configurationRevision(changed); changed.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: "live" }; await store.put("clients", c.slug, changed); await complete(e, req); const current = await rowFor(changed); assert.ok(current.generation > row.generation);
    const response = await voice.handleManagedVoiceWebhook(signed(row, "dial-status", { DialCallStatus: "completed" })); assert.equal(response.status, 403); assert.deepEqual(await rowFor(changed), current);
  });
  await check(name("stale AI routing and paused AI retain only the unchanged approved owner fallback"), async () => {
    for (const paused of [false, true]) {
      const c = await client(mode, "dial-ai-stopped"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c);
      if (paused) { await store.put("clients", c.slug, { ...c, status: "paused", operationLifecycleVersion: 1 }); await e.run(req.id); }
      else clock += 26 * 60000;
      const response = await voice.handleManagedVoiceWebhook(signed(row, "inbound")), body = await response.text(); assert.match(body, /<Dial[^>]+>\+17135550100<\/Dial>/); assert.doesNotMatch(body, /<Redirect/);
      const continuation = await voice.handleManagedVoiceWebhook(signed(row, "dial-status", { DialCallStatus: "no-answer" })); assert.match(await continuation.text(), /<Say>/); assert.equal((await voice.voiceActivationStatus(paused ? { ...c, status: "paused" } : c)).active, false);
    }
  });
  await check(name("voice-only detachment preserves approved fallback while account and number stops do not"), async () => {
    const c = await client(mode, "dial-detached"), e = engine(), req = await request(e, c); await complete(e, req); const original = await rowFor(c);
    await e.cancel(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c) });
    for (let i = 0; i < 6 && !(await rowFor(c)).routingDetachedAt; i++) await e.run(req.id);
    const row = await rowFor(c); assert.ok(row.routingDetachedAt); assert.match(numbers.get(row.number.id).voice_url, /kind=fallback/);
    const response = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.match(await response.text(), /<Dial/);
    process.env.VOICE_ACTIVATION_ENABLED = "false"; const stopped = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.doesNotMatch(await stopped.text(), /<Dial/); process.env.VOICE_ACTIVATION_ENABLED = "true";
    await store.put("clients", c.slug, { ...c, status: "cancelled" }); const cancelled = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.doesNotMatch(await cancelled.text(), /<Dial/);
    await store.put("clients", c.slug, c); const parent = await phone.getAcquiredPhoneResource(c); await store.atomicUpdate("phone_activation_intents", parent.intentId, old => ({ value: { ...old, cancelRequestedAt: new Date().toISOString() } })); const releasing = await voice.handleManagedVoiceWebhook(signed(original, "fallback")); assert.doesNotMatch(await releasing.text(), /<Dial/);
  });
  await check(name("AI and fallback reserve separate bounded legs and an unknown same-parent outcome never dials twice"), async () => {
    const c = await client(mode, "dial-budget"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c), day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), key = c.slug + "/" + row.tenantIdentity + "/" + day;
    await voice.handleManagedVoiceWebhook(signed(row, "inbound")); assert.ok((await (await voice.handleManagedVapiWebhook(event(row, "assistant-request"))).json()).assistant);
    const first = await voice.handleManagedVoiceWebhook(signed(row, "fallback")), body = await first.text(); assert.match(body, /<Dial timeout="25" timeLimit="300"/);
    const usage = await read("managed_voice_usage", key); assert.equal(usage.calls, 2); assert.equal(usage.reservedSeconds, 630); assert.equal(Object.keys(usage.reservations).length, 2);
    const repeat = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.doesNotMatch(await repeat.text(), /<Dial|<Redirect/); assert.deepEqual(await read("managed_voice_usage", key), usage);
    const call = await read("managed_voice_calls", c.slug + "/CA" + hash(row.id + "call").slice(0, 32)); assert.ok(call.fallbackAttempt.id); assert.equal(call.fallbackOutcome, undefined);
  });
  await check(name("exhausted tenant and account capacity refuse fallback before a Dial without refund or refill"), async () => {
    for (const scope of ["tenant", "account"]) {
      const c = await client(mode, "dial-exhausted-" + scope), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c), day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), key = scope === "account" ? "account/" + day : c.slug + "/" + row.tenantIdentity + "/" + day;
      const before = await read("managed_voice_usage", key), full = { version: 1, day, calls: scope === "account" ? policy.accountDailyCalls : policy.maxDailyCalls, reservedSeconds: 0, reservations: {} }; await store.put("managed_voice_usage", key, full);
      const response = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.doesNotMatch(await response.text(), /<Dial/); assert.deepEqual(await read("managed_voice_usage", key), full);
      const callKey = c.slug + "/CA" + hash(row.id + "call").slice(0, 32), call = await read("managed_voice_calls", callKey); assert.equal(call.fallbackAdmission.status, "denied"); assert.equal(call.fallbackAdmission.reasonCode, "fallback_budget_exhausted"); assert.equal(call.fallbackAttempt, undefined);
      // Reopening allowance does not refill the same parent operation.
      await store.put("managed_voice_usage", key, { version: 1, day, calls: 0, reservedSeconds: 0, reservations: {} }); const replay = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.doesNotMatch(await replay.text(), /<Dial/); assert.equal((await read("managed_voice_usage", key)).calls, 0);
      if (scope === "account") await store.put("managed_voice_usage", key, before || { version: 1, day, calls: 0, reservedSeconds: 0, reservations: {} });
    }
  });
  await check(name("signed forwarding context cannot dial the number that already forwarded this caller"), async () => {
    for (const from of ["owner", "managed", "business"]) {
      const c = await client(mode, "dial-forwarded-" + from), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c), forwardedFrom = from === "owner" ? c.owner.phone : from === "managed" ? row.number.number : c.phone.businessNumber;
      const initial = await voice.handleManagedVoiceWebhook(signed(row, "inbound", { ForwardedFrom: forwardedFrom })); assert.match(await initial.text(), /<Redirect/);
      const call = await read("managed_voice_calls", c.slug + "/CA" + hash(row.id + "call").slice(0, 32)); assert.equal(call.forwardedFrom, forwardedFrom);
      // The fallback action may omit ForwardedFrom; the original signed marker survives.
      const response = await voice.handleManagedVoiceWebhook(signed(row, "fallback")), body = await response.text();
      if (from === "business") assert.match(body, /<Dial/); else assert.doesNotMatch(body, /<Dial|<Redirect/);
    }
  });
  await check(name("altered or missing retained policy cannot enlarge or corrupt a fallback reservation"), async () => {
    for (const mutation of ["larger", "missing"]) {
      const c = await client(mode, "dial-policy-" + mutation), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c), day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), key = "account/" + day, before = await read("managed_voice_usage", key);
      await store.atomicUpdate("voice_activation_intents", row.id, old => { const retained = { ...old.policy }; if (mutation === "larger") retained.maxDurationSeconds = 600; else delete retained.maxDurationSeconds; return { value: { ...old, policy: retained } }; });
      const response = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.match(await response.text(), /<Say>/); assert.deepEqual(await read("managed_voice_usage", key), before);
      const noDial = await voice.handleManagedVoiceWebhook(signed(row, "fallback")); assert.doesNotMatch(await noDial.text(), /<Dial|NaN|undefined/);
    }
  });
  await check(name("completed without a destination identity remains an unknown transport outcome"), async () => {
    const c = await client(mode, "dial-missing-child"), e = engine(), req = await request(e, c); await complete(e, req); const row = await rowFor(c); await voice.handleManagedVoiceWebhook(signed(row, "fallback"));
    const response = await voice.handleManagedVoiceWebhook(signed(row, "dial-status", { DialCallStatus: "completed", DialBridged: "true" })); assert.match(await response.text(), /<Say>/);
    const call = await read("managed_voice_calls", c.slug + "/CA" + hash(row.id + "call").slice(0, 32)); assert.equal(call.fallbackOutcome.status, "unknown"); assert.equal(call.fallbackOutcome.reportedStatus, "completed"); assert.equal(call.fallbackOutcome.callSid, null); assert.equal((await rowFor(c)).evidence.fallbackAnsweredAt, undefined);
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
    const resumed={...c,status:'live',operationLifecycleVersion:2,liveAt:new Date().toISOString(),pausedAt:null};await store.put('clients',c.slug,resumed);assert.equal((await complete(e,req)).state,'ready');const current=await rowFor(resumed);assert.equal(current.assistant.id,initial.assistant.id);assert.equal(current.imported.id,initial.imported.id);// A later real call has a fresh provider SID; the paused call is now retained.
    const resumedSid='CA'+hash(c.slug+'resumed-call').slice(0,32);await voice.handleManagedVoiceWebhook(signed(current,'inbound',{CallSid:resumedSid}));assert.ok((await (await voice.handleManagedVapiWebhook(event(current,'assistant-request',{},true,resumedSid))).json()).assistant);assert.equal(result.requests.filter(row=>row.method==='POST' && ['/assistant','/phone-number'].includes(row.path)).length,before);
  });
  await check(name("a solo operator can use the new number with a generic non-looping fallback"),async()=>{
    const c=await client(mode,'solo'),e=engine();c.phone.businessNumber=c.owner.phone;const rev=configurationRevision(c);c.setupProof={reviewedRevision:rev,testedRevision:rev,testMode:'live'};await store.put('clients',c.slug,c);await assert.rejects(()=>request(e,c),error=>error.code==='unsafe_forwarding');const req=await request(e,c,{forwardingMode:'use_new_number'});assert.equal((await complete(e,req)).state,'ready');const row=await rowFor(c);assert.equal(imports.get(row.imported.id).fallbackDestination,undefined);assert.equal(numbers.get(row.number.id).voice_fallback_url,process.env.VOICE_FALLBACK_TWIML_URL);await voice.handleManagedVoiceWebhook(signed(row,'inbound'));assert.ok((await(await voice.handleManagedVapiWebhook(event(row,'assistant-request'))).json()).assistant);const fallback=await voice.handleManagedVoiceWebhook(signed(row,'fallback'));assert.doesNotMatch(await fallback.text(),/<Dial/);
  });
  await check(name("the acquired new number can be the advertised business line without a forwarding loop"),async()=>{
    const c=await client(mode,'advertised'),e=engine(),resource=await phone.getAcquiredPhoneResource(c);c.phone.businessNumber=resource.number;const rev=configurationRevision(c);c.setupProof={reviewedRevision:rev,testedRevision:rev,testMode:'live'};await store.put('clients',c.slug,c);const req=await request(e,c,{forwardingMode:'use_new_number'});assert.equal((await complete(e,req)).state,'ready');const row=await rowFor(c);await voice.handleManagedVoiceWebhook(signed(row,'inbound'));assert.ok((await(await voice.handleManagedVapiWebhook(event(row,'assistant-request'))).json()).assistant);
  });
}
await suite("memory"); await suite("sdk");
// The real SDK writes the attempt marker before the last funding check. A
// known pre-dispatch hold must be resumable, while older/attempted work is not.
const mutationField=phase=>({assistant:'assistantCreateStartedAt',import:'importStartedAt',routing:'routingStartedAt'})[phase];
async function latePaidFixture(phase,suffix){
  process.env.MC_MEMORY_STORE='0';const c=await client('sdk','known-hold-'+suffix),e=engine(),req=await request(e,c);
  if(phase!=='assistant')await e.run(req.id);if(phase==='routing'){await e.run(req.id);await e.run(req.id);}
  const funding=paidFixture(c,{end:Math.floor(clock/1000)+1});await store.put('workspace_billing',funding.key,funding.row);
  return {c,e,req,funding,field:mutationField(phase)};
}
async function afterMarker(f,action){
  const original=globalThis.fetch;let hit=false;
  globalThis.fetch=async(input,init={})=>{const url=new URL(String(input)),body=url.origin==='https://voice-blobs.invalid'&&String(init.method||'GET').toUpperCase()==='PUT'?JSON.parse(init.body):null;const response=await original(input,init);if(!hit&&body?.id===f.req.id&&body[f.field]){hit=true;await action(body);}return response;};
  try{const view=await f.e.run(f.req.id);assert.equal(hit,true);return view;}finally{globalThis.fetch=original;}
}
const mutationsSince=at=>result.requests.slice(at).filter(v=>['POST','PATCH'].includes(v.method));
for(const phase of ['assistant','import','routing'])await check('SDK: late unpaid '+phase+' marker has durable zero-dispatch receipt and renews the same operation',async()=>{
  const f=await latePaidFixture(phase,phase),prior=result.requests.length;
  const held=await afterMarker(f,()=>{clock=f.funding.row.paidPeriod.end*1000;});const row=await rowFor(f.c);
  assert.equal(held.state,'waiting_platform');assert.equal(row.reasonCode,'paid_service_unconfirmed');assert.equal(row[f.field],null);assert.equal(row.pendingMutationDispatch,null);assert.equal(mutationsSince(prior).length,0);
  const proof=row.knownNoDispatch.at(-1);assert.equal(proof.mutationDispatched,false);assert.equal(proof.operationId,f.req.id);assert.equal(proof.field,f.field);assert.equal(proof.generation,row.generation);assert.equal(proof.tenantIdentity,row.tenantIdentity);assert.match(proof.claimToken,/^[a-f0-9]{32}$/);assert.ok(proof.markerAt);
  const renewed=paidFixture(f.c,{end:Math.floor(clock/1000)+864000});await store.put('workspace_billing',renewed.key,renewed.row);assert.notEqual((await f.e.run(f.req.id)).state,'uncertain');assert.equal((await rowFor(f.c)).id,f.req.id);assert.equal(mutationsSince(prior).length,1);
});
await check('SDK: actual adapter authorization after its routing GET certifies zero mutation dispatch',async()=>{
  const f=await latePaidFixture('routing','adapter'),prior=result.requests.length;let expired=false;
  beforeResponse=async req=>{const saved=await rowFor(f.c);if(!expired&&req.method==='GET'&&req.url.origin==='https://api.twilio.com'&&saved.routingStartedAt){expired=true;clock=f.funding.row.paidPeriod.end*1000;}};
  assert.equal((await f.e.run(f.req.id)).state,'waiting_platform');assert.equal(expired,true);assert.equal(mutationsSince(prior).length,0);const row=await rowFor(f.c);assert.equal(row.routingStartedAt,null);assert.equal(row.knownNoDispatch.at(-1).mutationDispatched,false);
});
for(const fence of ['generation','claim','marker','tenant','number','late-receipt','expired-claim'])await check('SDK: changed '+fence+' cannot clear a claimed create marker from a late hold',async()=>{
  const f=await latePaidFixture('assistant',fence),prior=result.requests.length;let marker;
  await afterMarker(f,async body=>{clock=f.funding.row.paidPeriod.end*1000;marker=body[f.field];if(fence==='expired-claim'){clock+=61000;return;}await store.atomicUpdate('voice_activation_intents',f.req.id,old=>({value:{...old,...({generation:{generation:old.generation+1},claim:{claim:{token:'f'.repeat(32),until:new Date(clock+60000).toISOString()}},marker:{[f.field]:'2020-01-01T00:00:00.000Z'},tenant:{tenantIdentity:'f'.repeat(64)},number:{number:{...old.number,id:'PN'+'f'.repeat(32)}},'late-receipt':{lateReceipts:[{assistant:{id:uuid('late-resource')}}]}}[fence])}}));});
  const row=await read('voice_activation_intents',f.req.id);assert.equal(row[f.field],fence==='marker'?'2020-01-01T00:00:00.000Z':marker);assert.equal((row.knownNoDispatch||[]).length,0);assert.equal(mutationsSince(prior).length,0);
});
for(const fence of ['pause','cancel','revision'])await check('SDK: late '+fence+' remains a stopped/reviewed flow without a fictitious create',async()=>{
  const f=await latePaidFixture('assistant',fence),prior=result.requests.length;
  const held=await afterMarker(f,async()=>{if(fence==='cancel')return f.e.cancel(f.c,{actor:{role:'owner',email:f.c.owner.email},expectedRevision:configurationRevision(f.c)});await store.atomicUpdate('clients',f.c.slug,old=>({value:fence==='pause'?{...old,status:'paused'}:{...old,business:{...old.business,name:'Changed after marker'}}}));});
  const row=await rowFor(f.c);assert.equal(row[f.field],null);assert.equal(row.knownNoDispatch.at(-1).mutationDispatched,false);assert.equal(held.state,fence==='pause'?'suspended':fence==='cancel'?'cleanup_pending':'needs_review');assert.equal(mutationsSince(prior).length,0);if(fence==='cancel'){assert.equal((await f.e.run(f.req.id)).state,'cancelled');assert.equal(mutationsSince(prior).length,0);}
});
await check('SDK: delayed authority reads cannot consume a known-zero-dispatch witness after its claim expires',async()=>{
  const f=await latePaidFixture('assistant','late-witness'),transport=globalThis.fetch,prior=result.requests.length;let marked=false,voiceReads=0,delayed=false,leaseEnd;
  globalThis.fetch=async(input,init={})=>{const url=new URL(String(input)),method=String(init.method||'GET').toUpperCase(),body=url.origin==='https://voice-blobs.invalid'&&method==='PUT'?JSON.parse(init.body):null,response=await transport(input,init);if(!marked&&body?.id===f.req.id&&body.assistantCreateStartedAt){marked=true;clock=f.funding.row.paidPeriod.end*1000;leaseEnd=Date.parse(body.claim.until);}else if(marked&&method==='GET'&&decodeURIComponent(url.pathname).endsWith('/'+f.req.id))voiceReads++;else if(marked&&voiceReads>=2&&!delayed&&method==='GET'&&decodeURIComponent(url.pathname).endsWith('/site:clients/'+f.c.slug)){delayed=true;clock=leaseEnd+1;}return response;};
  try{await f.e.run(f.req.id);}finally{globalThis.fetch=transport;}
  const row=await rowFor(f.c);assert.equal(delayed,true);assert.ok(row.assistantCreateStartedAt);assert.equal((row.knownNoDispatch||[]).length,0);assert.equal(mutationsSince(prior).length,0);
});
await check('SDK: actual attempted assistant POST with a lost coded response retains its marker and never blindly repeats',async()=>{
  const f=await latePaidFixture('assistant','attempted'),prior=result.requests.length;
  beforeResponse=async req=>{if(req.method==='POST'&&req.url.pathname==='/assistant')throw Object.assign(new Error('Lost after actual POST'),{code:'dispatch_not_authorized'});};
  await f.e.run(f.req.id);beforeResponse=null;const original=await rowFor(f.c);assert.ok(original.assistantCreateStartedAt);assert.equal((original.knownNoDispatch||[]).length,0);assert.equal(mutationsSince(prior).length,1);
  clock=f.funding.row.paidPeriod.end*1000;await f.e.run(f.req.id);const renewed=paidFixture(f.c,{end:Math.floor(clock/1000)+864000});await store.put('workspace_billing',renewed.key,renewed.row);await f.e.run(f.req.id);assert.equal((await rowFor(f.c)).assistantCreateStartedAt,original.assistantCreateStartedAt);assert.equal(mutationsSince(prior).filter(v=>v.path==='/assistant').length,1);
});
await check('TwiML Bin protocol rejects missing AccountSid400 and missing/bad/double-counted GET signatures401',async()=>{
  const base=process.env.VOICE_FALLBACK_TWIML_URL,url=base+'?AccountSid='+account;
  assert.equal(twimlBinFixture(base,{method:'GET',redirect:'error'}).status,400);
  assert.equal(twimlBinFixture(url,{method:'GET',redirect:'error'}).status,401);
  assert.equal(twimlBinFixture(url,{method:'GET',redirect:'error',headers:{'x-twilio-signature':'invalid'}}).status,401);
  const wrong=createHmac('sha1',twilioToken).update(url+'AccountSid'+account).digest('base64');
  assert.equal(twimlBinFixture(url,{method:'GET',redirect:'error',headers:{'x-twilio-signature':wrong}}).status,401);
  const correct=createHmac('sha1',twilioToken).update(url).digest('base64');
  assert.equal(twimlBinFixture(url,{method:'GET',redirect:'error',headers:{'x-twilio-signature':correct}}).status,200);
});
await check('Actual fallback probe is signed privately while installed route remains queryless and SMS is untouched',async()=>{
  process.env.MC_MEMORY_STORE='1';const c=await client('memory','signed-bin'),e=engine(),req=await request(e,c);await complete(e,req);const row=await rowFor(c),number=numbers.get(row.number.id);
  assert.equal(number.voice_fallback_url,process.env.VOICE_FALLBACK_TWIML_URL);assert.equal(new URL(number.voice_fallback_url).search,'');assert.equal(number.sms_url,'https://fixture-sms.invalid/unchanged');
  assert.ok(fallbackProbes.some(p=>p.status===200&&p.accountQueryPresent&&p.signed));
  const args={client:c,correlationId:row.correlationId,inputRevision:row.inputRevision,policy:row.policy,site:origin,number:row.number,callbackToken:row.callbackToken,phoneNumberId:row.imported.id,savedVapiUrl:row.importedRoute.vapiUrl};
  const adapter=createManagedVoiceProvider({executionAllowed:()=>enabled});
  for(const body of ['<Response><Say>Hello</Say><Dial>+17135550100</Dial></Response>','<Response><Message>Unsafe</Message></Response>','<Response><Redirect>https://foreign.invalid</Redirect></Response>','<Response><Say>'+ 'x'.repeat(2000) +'</Say></Response>']){fallbackBody=body;await assert.rejects(()=>adapter.verifyRouting(args),/Independent fallback content mismatch/);}
  fallbackBody='<Response><Say>Still only a safe outage message.</Say></Response>';fallbackRedirect=true;await assert.rejects(()=>adapter.verifyRouting(args),/Independent voice fallback unavailable/);fallbackRedirect=false;
  process.env.TWILIO_AUTH_TOKEN='wrong-token';await assert.rejects(()=>adapter.verifyRouting(args),/Independent voice fallback unavailable/);assert.equal(fallbackProbes.at(-1).status,401);process.env.TWILIO_AUTH_TOKEN=twilioToken;
  const before=fallbackProbes.length;process.env.VOICE_FALLBACK_TWIML_URL+='?AccountSid='+account;await assert.rejects(()=>adapter.verifyRouting(args),/Independent voice fallback unavailable/);assert.equal(fallbackProbes.length,before);
});
await check('Web activation keeps current and legacy native authority; real pause/resume/cancel still fence it', async () => {
  const {serviceLifecycle, serviceLifecycleMatches}=await import('../netlify/functions/lib/service-lifecycle.mjs');
  const testing={status:'testing',operationLifecycleVersion:7,pausedAt:null,cancelledAt:null,liveAt:null};
  const legacy=hash(JSON.stringify(['testing',7,null,null,null])), current=serviceLifecycle(testing), live={...testing,status:'live',liveAt:new Date().toISOString()};
  assert(serviceLifecycleMatches(live,legacy)); assert(serviceLifecycleMatches(live,current)); assert.equal(serviceLifecycle(live),current);
  const oldLive=hash(JSON.stringify(['live',7,null,null,live.liveAt]));assert(serviceLifecycleMatches(live,oldLive));
  for(const changed of [{...live,operationLifecycleVersion:8},{...live,status:'paused',pausedAt:new Date().toISOString()},{...live,status:'cancelled',cancelledAt:new Date().toISOString()},{...live,cancelledAt:'2026-01-01T00:00:00.000Z'}]) {
    assert.equal(serviceLifecycleMatches(changed,legacy),false); assert.equal(serviceLifecycleMatches(changed,current),false);
  }
  assert.equal(serviceLifecycleMatches(live,'0'.repeat(64)),false);
});
result.sourceAfter = hashes(); result.sourceStable = Object.entries(result.sourceBefore).every(([key, value]) => result.sourceAfter[key] === value); result.ok = result.checks.every(check => check.pass) && result.sourceStable && result.blocked.length === 0; result.passed = result.checks.filter(check => check.pass).length; result.total = result.checks.length;
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ ok: result.ok, passed: result.passed, total: result.total, conflicts: result.conflicts, fixtureProviderRequests: result.requests.length, failures: result.checks.filter(check => !check.pass), output }, null, 2)); if (!result.ok) process.exitCode = 1;
