// Actual production state machine, provider HTTP adapter and signed webhook handlers.
// All credentials are dummy and every physical network primitive is disabled.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const outputIndex = process.argv.indexOf("--output"), output = outputIndex < 0 ? null : process.argv[outputIndex + 1];
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error("Choose a new scratchpad receipt");
const freezePath = "scratchpad/voice-fallback-freeze-v1.json", freeze = JSON.parse(readFileSync(freezePath, "utf8"));
const sources = [...Object.keys(freeze.files), "scratchpad/voice-fallback-independent-check.mjs"], hash = value => createHash("sha256").update(value).digest("hex"), hashes = () => Object.fromEntries(sources.map(file => [file, hash(readFileSync(file))]));
assert.equal(hash(readFileSync(freezePath)), "679cd242f0d36869b07abce75f93c7a265bd5515031218bc8e85c1ecd03a5820");
assert.deepEqual(Object.fromEntries(Object.keys(freeze.files).map(file => [file, hash(readFileSync(file))])), freeze.files);

const result = { at: new Date().toISOString(), mode: "independent actual signed managed-voice entrypoint; reused activation/SDK protocol fixture primitives, independently designed boundary cases; physical networking denied", sourceBefore: hashes(), checks: [], conflicts: 0, blocked: [], requests: [] };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|VOICE_|PHONE_)/.test(key)) delete process.env[key];
const account = "AC" + "1".repeat(32), twilioToken = "fixture-twilio-token", secret = "fixture-vapi-secret-" + "a".repeat(32), origin = "http://127.0.0.1:8897";
const policy = { version: "fixture_voice_v1", model: "fixture-approved-model", maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, accountDailyCalls: 1000, accountDailyMinutes: 5000, authorityText: "I am authorized to connect this business phone service and direct calls to the recorded owner cell.", usageDisclosure: "This fixture represents an explicitly approved voice usage policy; no actual prices or calls are authorized." };
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: origin, TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: twilioToken, VAPI_API_KEY: "fixture-private", VAPI_WEBHOOK_SECRET: secret, VOICE_ACTIVATION_ENABLED: "true", VOICE_ACTIVATION_APPROVED_VERSION: policy.version, VOICE_ACTIVATION_POLICY_JSON: JSON.stringify(policy), VOICE_FALLBACK_TWIML_URL: "https://handler.twilio.com/twiml/EH" + "f".repeat(32), SERVICE_WORKER_KEY: "fixture-service-worker-" + "a".repeat(32) });
let deniedPhysicalAttempts = 0; const deny = () => { deniedPhysicalAttempts++; throw new Error("Voice test physical networking disabled"); }; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
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
  const identity = hash(JSON.stringify([c.slug, c.ownerKey, c.owner.email])), intentId = c.slug + "/" + hash("first-phone-acquisition:" + identity), sid = "PN" + hash(c.slug).slice(0, 32), number = "+1713444" + String(serial).padStart(4,"0").slice(-4), correlationId = hash("number-" + c.slug);
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

const handler = (await import("../netlify/functions/managed-voice.mjs")).default;
const fixtureFetch = globalThis.fetch;
process.env.MC_MEMORY_STORE = "0";
result.freeze = { path: freezePath, sha256: hash(readFileSync(freezePath)), sourceId: freeze.sourceId, files: Object.keys(freeze.files).length };
result.responses = [];
const parentSid = row => "CA" + hash(row.id + "call").slice(0, 32);
const childSid = row => "CA" + hash(row.id + "child").slice(0, 32);
const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const usageKey = (c, row) => `${c.slug}/${row.tenantIdentity}/${day()}`;
const callKey = (c, row) => `${c.slug}/${parentSid(row)}`;
const getCall = (c, row) => read("managed_voice_calls", callKey(c, row));
const noDial = text => { assert.doesNotMatch(text, /<Dial|<Redirect/); assert.match(text, /<Say>We could not connect you on this line\. Please try calling the shop again during business hours\.<\/Say><Hangup\/>/); };
const capture = (label, text) => result.responses.push({ label, twiml: text });
async function ready(label) { const c = await client("sdk", label), e = engine(), requested = await request(e, c); assert.equal((await complete(e, requested)).state, "ready"); return { c, e, row: await rowFor(c) }; }
async function action(row, status, extras={}) { return handler(signed(row, "dial-status", { DialCallStatus: status, DialCallSid: childSid(row), ...extras })); }
async function group(name, fn) {
  await check(name, async () => { try { await fn(); } finally { globalThis.fetch=fixtureFetch; await store.put("health", "brake", {on:false}); } });
}
await group("destination failures, missing/unknown status and unbridged completion speak recovery from the Dial action", async () => {
  for (const status of ["busy", "no-answer", "failed", "canceled", "", "future-status", "completed"]) {
    const {c,row}=await ready("failure-"+(status||"missing")), before=result.requests.length;
    const first=await handler(signed(row,"fallback")), twiml=await first.text();
    assert.match(twiml, /<Dial timeout="25" timeLimit="300" action="[^\"]+kind=dial-status" method="POST">\+17135550100<\/Dial><\/Response>$/); assert.doesNotMatch(twiml, /<Say>/);
    const response=await action(row,status,{CallStatus:"completed",...(status==="completed"?{DialBridged:"false"}:{})}), body=await response.text();
    assert.equal(response.status,200); noDial(body);
    const call=await getCall(c,row); assert.equal(call.fallbackOutcome.status,["busy","no-answer","failed","canceled"].includes(status)?status:"unknown"); assert.equal(call.twilioStatus,"completed");
    assert.equal((await rowFor(c)).evidence.fallbackAnsweredAt,undefined); assert.equal(result.requests.length,before);
    if(status==="no-answer"||status==="completed") capture(status==="completed"?"unbridged completed => unknown":"no-answer action",body);
  }
});
await group("parent transport status cannot certify destination connection; completed child is transport evidence only", async () => {
  const {c,row}=await ready("parent-child"),before=result.requests.length;
  await handler(signed(row,"fallback"));
  assert.equal((await handler(signed(row,"status",{CallStatus:"completed"}))).status,200);
  assert.equal((await getCall(c,row)).fallbackOutcome,undefined); assert.equal((await rowFor(c)).evidence.fallbackAnsweredAt,undefined);
  const connected=await action(row,"completed",{CallStatus:"failed",DialBridged:"true"}),body=await connected.text();
  assert.equal(body,'<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'); capture("completed child / failed parent",body);
  const call=await getCall(c,row);assert.equal(call.fallbackOutcome.status,"completed");assert.equal(call.twilioStatus,"failed");assert.equal(call.fallbackOutcome.callSid,childSid(row));
  assert.equal((await voice.voiceActivationStatus(c)).active,false);assert.equal(result.requests.length,before);
  assert.equal(await read("leads",c.slug),null);assert.equal(await read("bookings",c.slug),null);
});
await group("signed account, parent/caller/number/token and signature mismatches cannot alter a retained call", async () => {
  const {c,row}=await ready("identity");await handler(signed(row,"fallback")); const prior=await getCall(c,row),intent=await rowFor(c),before=result.requests.length;
  for(const extras of [{AccountSid:"AC"+"2".repeat(32)},{CallSid:childSid(row)},{To:"+17135550000"},{From:"+17135550888"},{CallSid:"invalid"}]) assert.equal((await action(row,"completed",extras)).status,403);
  assert.equal((await handler(signed(row,"dial-status",{DialCallStatus:"completed"},false))).status,403);
  assert.equal((await handler(signed({...row,callbackToken:"e".repeat(64)},"dial-status",{DialCallStatus:"completed"}))).status,403);
  const {row:other}=await ready("foreign-token");assert.equal((await handler(signed(other,"dial-status",{CallSid:parentSid(row),To:row.number.number,DialCallStatus:"completed"}))).status,403);
  assert.deepEqual(await getCall(c,row),prior);assert.deepEqual(await rowFor(c),intent);assert.ok(result.requests.length>=before);
});
await group("known shop-number, managed-number and caller/destination loops never emit a Dial", async () => {
  for(const who of ["business","managed","owner"]) {const {c,row}=await ready("loop-"+who),from=who==="business"?c.phone.businessNumber:who==="managed"?row.number.number:c.owner.phone,before=result.requests.length;
    const response=await handler(signed(row,"fallback",{From:from}));assert.equal(response.status,200);noDial(await response.text());assert.equal(result.requests.length,before);
  }
});
await group("concurrent preterminal retries and discarded responses emit one local Dial and one nonrefundable fallback reservation", async () => {
  const {c,row}=await ready("parallel"),before=result.requests.length;
  const responses=await Promise.all(Array.from({length:8},()=>handler(signed(row,"fallback")))),bodies=await Promise.all(responses.map(r=>r.text()));
  assert.equal(bodies.filter(body=>body.includes("<Dial")).length,1);
  let usage=await read("managed_voice_usage",usageKey(c,row)),call=await getCall(c,row);assert.equal(usage.calls,1);assert.equal(usage.reservedSeconds,330);assert.equal(Object.keys(usage.reservations).length,1);assert.ok(call.fallbackAttempt.id);assert.equal(call.fallbackOutcome,undefined);
  clock+=1000;
  for(let i=0;i<3;i++) noDial(await(await handler(signed(row,"fallback"))).text());
  assert.deepEqual(await read("managed_voice_usage",usageKey(c,row)),usage);assert.equal((await getCall(c,row)).fallbackAttempt.id,call.fallbackAttempt.id);assert.equal(result.requests.length,before);
  capture("preterminal replay after discarded first response",await(await handler(signed(row,"fallback"))).text());
});
await group("terminal replay is immutable and a conflicting known destination SID is rejected", async () => {
  for(const status of ["busy","completed","unknown"]) {const {c,row}=await ready("terminal-"+status);await handler(signed(row,"fallback"));await action(row,status,{DialBridged:status==="completed"?"true":"false"});const call=await getCall(c,row),usage=await read("managed_voice_usage",usageKey(c,row));
    const replay=await handler(signed(row,"fallback")),body=await replay.text();assert.doesNotMatch(body,/<Dial|<Redirect/);
    const outOfOrder=await action(row,status==="completed"?"failed":"completed",{DialBridged:"true"});assert.equal(outOfOrder.status,200);
    assert.deepEqual(await getCall(c,row),call);
    assert.equal((await action(row,"completed",{DialCallSid:"CA"+"9".repeat(32)})).status,403);
    assert.deepEqual(await getCall(c,row),call);assert.deepEqual(await read("managed_voice_usage",usageKey(c,row)),usage);
  }
});
await group("AI and fallback consume distinct existing allowance keys including ring buffer; minute exhaustion blocks a new parent", async () => {
  const {c,row}=await ready("separate-cost");await handler(signed(row,"inbound"));assert.ok((await(await voice.handleManagedVapiWebhook(event(row,"assistant-request"))).json()).assistant);
  assert.match(await(await handler(signed(row,"fallback"))).text(),/timeLimit="300"/);
  const usage=await read("managed_voice_usage",usageKey(c,row));assert.equal(usage.calls,2);assert.equal(usage.reservedSeconds,630);assert.equal(Object.keys(usage.reservations).length,2);assert.deepEqual(Object.values(usage.reservations).map(x=>x.seconds).sort((a,b)=>a-b),[300,330]);
  noDial(await(await handler(signed(row,"fallback",{CallSid:"CA"+hash(row.id+"nextparent").slice(0,32)}))).text());
  assert.deepEqual(await read("managed_voice_usage",usageKey(c,row)),usage);
});
await group("exhausted account or malformed allowance fails closed without a new paid attempt", async () => {
  for(const malformed of [false,true]) {const {c,row}=await ready("account-"+malformed),key="account/"+day(),before=await read("managed_voice_usage",key);
    await store.put("managed_voice_usage",key,malformed?{version:99}:{version:1,day:day(),calls:policy.accountDailyCalls,reservedSeconds:0,reservations:{}});
    try {if(malformed) await assert.rejects(()=>handler(signed(row,"fallback")),/budget unavailable/);else noDial(await(await handler(signed(row,"fallback"))).text());
      assert.equal((await getCall(c,row)).fallbackAttempt,undefined);
    } finally {await store.put("managed_voice_usage",key,before);}
  }
});
await group("unchanged approved fallback survives stale AI, paused AI and actual voice-only route detach", async () => {
  for(const state of ["stale","paused","detached"]) {const {c,e,row:original}=await ready("retained-"+state);let row=original;
    if(state==="stale")await store.atomicUpdate("voice_activation_intents",row.id,old=>({value:{...old,routing:{...old.routing,checkedAt:new Date(clock-26*60000).toISOString()}}}));
    if(state==="paused")await store.put("clients",c.slug,{...c,status:"paused",operationLifecycleVersion:1});
    if(state==="detached") {await e.cancel(c,{actor:{role:"owner",email:c.owner.email},expectedRevision:configurationRevision(c)});for(let i=0;i<6&&!(await rowFor(c)).routingDetachedAt;i++)await e.run(row.id);row=await rowFor(c);assert.ok(row.routingDetachedAt);assert.match(numbers.get(row.number.id).voice_url,/kind=fallback/);}
    const before=result.requests.length,body=await(await handler(signed(row,"inbound"))).text();assert.match(body,/<Dial/);assert.doesNotMatch(body,/<Redirect/);assert.equal((await voice.voiceActivationStatus(await read("clients",c.slug))).active,false);assert.equal(result.requests.length,before);
  }
});
await group("workspace replacement/cancel, parent release/cancel, account brake and provider-policy withdrawal stop paid fallback", async () => {
  for(const stop of ["replacement","cancelled","parent-released","parent-cancel","brake","provider","policy"]){const {c,row}=await ready("stop-"+stop),parent=await phone.getAcquiredPhoneResource(c),savedPolicy=process.env.VOICE_ACTIVATION_POLICY_JSON,savedKey=process.env.VAPI_API_KEY;
    if(stop==="replacement")await store.put("clients",c.slug,{...c,ownerKey:"new-owner-key",owner:{...c.owner,email:"replacement@example.test"}});
    if(stop==="cancelled")await store.put("clients",c.slug,{...c,status:"cancelled"});
    if(stop==="parent-released")await store.atomicUpdate("phone_activation_intents",parent.intentId,old=>({value:{...old,state:"released"}}));
    if(stop==="parent-cancel")await store.atomicUpdate("phone_activation_intents",parent.intentId,old=>({value:{...old,cancelRequestedAt:new Date().toISOString()}}));
    if(stop==="brake")await store.put("health","brake",{on:true});if(stop==="provider")delete process.env.VAPI_API_KEY;if(stop==="policy")process.env.VOICE_ACTIVATION_POLICY_JSON=JSON.stringify({...policy,maxDailyCalls:2});
    try {const before=result.requests.length,body=await(await handler(signed(row,"fallback"))).text();noDial(body);assert.equal(await getCall(c,row),null);assert.equal(result.requests.length,before);if(stop==="brake")capture("account brake blocks fallback",body);}finally{process.env.VOICE_ACTIVATION_POLICY_JSON=savedPolicy;process.env.VAPI_API_KEY=savedKey;await store.put("health","brake",{on:false});}
  }
});
await group("final serving read refuses a changed owner, global withdrawal or generation after one retained attempt", async () => {
  for(const race of ["owner","gate","generation"]){const {c,row}=await ready("race-"+race);let injected=false;
    globalThis.fetch=async(input,init={})=>{const response=await fixtureFetch(input,init),url=new URL(String(input));if(!injected&&url.origin==="https://voice-blobs.invalid"&&String(init.method||"GET").toUpperCase()==="PUT"&&url.pathname.includes("/managed_voice_calls/")&&JSON.parse(init.body).fallbackAttempt){injected=true;globalThis.fetch=fixtureFetch;if(race==="owner")await store.put("clients",c.slug,{...c,owner:{...c.owner,phone:"+17135550888"}});if(race==="gate")process.env.VOICE_ACTIVATION_ENABLED="false";if(race==="generation")await store.atomicUpdate("voice_activation_intents",row.id,old=>({value:{...old,generation:"replacement-generation"}}));}return response;};
    const body=await(await handler(signed(row,"fallback"))).text();assert.equal(injected,true);noDial(body);assert.ok((await getCall(c,row)).fallbackAttempt.id);assert.equal((await read("managed_voice_usage",usageKey(c,row))).calls,1);process.env.VOICE_ACTIVATION_ENABLED="true";globalThis.fetch=fixtureFetch;
  }
});
await group("lost SDK acknowledgement after attempt commit never authorizes a second Dial", async () => {
  const {c,row}=await ready("lost-attempt");let injected=false;
  globalThis.fetch=async(input,init={})=>{const response=await fixtureFetch(input,init),url=new URL(String(input));if(!injected&&url.origin==="https://voice-blobs.invalid"&&String(init.method||"GET").toUpperCase()==="PUT"&&url.pathname.includes("/managed_voice_calls/")&&JSON.parse(init.body).fallbackAttempt){injected=true;throw new Error("Independent lost attempt acknowledgement after commit");}return response;};
  await assert.rejects(()=>handler(signed(row,"fallback")),/lost attempt acknowledgement/);assert.equal(injected,true);globalThis.fetch=fixtureFetch;
  const before=await getCall(c,row),usage=await read("managed_voice_usage",usageKey(c,row));assert.ok(before.fallbackAttempt.id);assert.equal(before.fallbackOutcome,undefined);noDial(await(await handler(signed(row,"fallback"))).text());assert.deepEqual(await getCall(c,row),before);assert.deepEqual(await read("managed_voice_usage",usageKey(c,row)),usage);
});
await group("elapsed admission reduces connection duration while preserving the 25+5 second cost envelope", async () => {
  const {c,row}=await ready("elapsed");let delayed=false;
  globalThis.fetch=async(input,init={})=>{const response=await fixtureFetch(input,init),url=new URL(String(input));if(!delayed&&url.origin==="https://voice-blobs.invalid"&&String(init.method||"GET").toUpperCase()==="PUT"&&url.pathname.includes("/managed_voice_calls/")&&JSON.parse(init.body).fallbackAdmission){delayed=true;clock+=90000;}return response;};
  const body=await(await handler(signed(row,"fallback"))).text();globalThis.fetch=fixtureFetch;assert.equal(delayed,true);assert.match(body,/timeLimit="210"/);const call=await getCall(c,row);assert.equal(210+25+5,(Date.parse(call.fallbackAdmission.expiresAt)-clock)/1000);assert.equal((await read("managed_voice_usage",usageKey(c,row))).reservedSeconds,330);
});

await group("signed known owner-cell forwarding reentry is message-only while ordinary shop forwarding remains allowed", async()=>{
  const ordinary=await ready("forwarded-shop");assert.match(await(await handler(signed(ordinary.row,"fallback",{ForwardedFrom:ordinary.c.phone.businessNumber}))).text(),/<Dial/);
  const {c,row}=await ready("forwarded-owner");const body=await(await handler(signed(row,"fallback",{ForwardedFrom:c.owner.phone}))).text();capture("owner-cell forwarded reentry",body);noDial(body);
});
await group("a stored policy that differs from its approved bound digest cannot enlarge fallback duration", async()=>{
  const {c,row}=await ready("corrupt-policy");await store.atomicUpdate("voice_activation_intents",row.id,old=>({value:{...old,policy:{...old.policy,maxDurationSeconds:600}}}));
  const body=await(await handler(signed(row,"fallback"))).text();capture("retained policy duration altered from 300 to 600",body);noDial(body);
});
result.sourceAfter=hashes();result.sourceStable=assert.deepEqual(result.sourceAfter,result.sourceBefore)===undefined;result.physicalNetworkRequests=0;result.deniedPhysicalAttempts=deniedPhysicalAttempts;result.privateInputsRead=0;result.browserCalls=0;result.actualCalls=0;result.fixtureProviderRequests=result.requests.length;
result.ok=result.sourceStable&&result.checks.every(c=>c.pass)&&result.blocked.length===0&&deniedPhysicalAttempts===0;result.passed=result.checks.filter(c=>c.pass).length;result.total=result.checks.length;
if(output)writeFileSync(output,JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({ok:result.ok,passed:result.passed,total:result.total,conflicts:result.conflicts,failures:result.checks.filter(c=>!c.pass),output},null,2));if(!result.ok)process.exitCode=1;
