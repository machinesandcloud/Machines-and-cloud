// Actual engine + actual Twilio adapter, using intercepted memory/SDK/provider fixtures only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const outIndex = process.argv.indexOf("--output"), output = outIndex < 0 ? null : process.argv[outIndex + 1];
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error("Choose a new scratchpad receipt");
const result = { at: new Date().toISOString(), mode: "actual phone engine and Twilio adapter; local memory/installed SDK/HTTP protocol fixtures; zero real network", checks: [], conflicts: 0, blockedNetwork: [], twilio: [] };
const sources = ["netlify/functions/lib/phone-activation.mjs", "netlify/functions/lib/phone-twilio.mjs", "netlify/functions/phone-activation-scheduler.mjs", "netlify/functions/lib/managed-resource-admission.mjs", "netlify/functions/lib/messaging-program.mjs"];
const hash = value => createHash("sha256").update(value).digest("hex"), hashes = () => Object.fromEntries(sources.map(file => [file, hash(readFileSync(file))])); result.sourceBefore = hashes();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|MANAGED_RESOURCE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: "http://127.0.0.1:8892", PUBLIC_SITE_URL: "http://127.0.0.1:8892" });
const deny = () => { throw new Error("Phone test networking disabled"); }; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const NativeDate = Date; let clock = NativeDate.now(); globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const blobs = new Map(), remote = new Map(); let etag = 0, fault = null, lostPost = false, monthlyPrice = "1.15", priceCurrency='USD', capabilities={MMS:true,SMS:true,voice:true}, addressRequirements='none', inventoryOverride, beforeInventory=null, failPostBeforeCommit=false;
const account = "AC" + "1".repeat(32), number = "+17135550101";
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || "GET").toUpperCase();
  if (url.origin === "https://phone-blobs.invalid") {
    const [, site, kind, ...parts] = url.pathname.split("/").map(decodeURIComponent), key = parts.join("/"), name = kind + "/" + key; assert.equal(site, "phone-site");
    if (fault && fault.kind === kind && fault.key === key && fault.method === method) return new Response("Injected store rejection", { status: 400 });
    if (method === "GET" && !key) return Response.json({ blobs: [...blobs.keys()].filter(name => name.startsWith(kind + "/" + (url.searchParams.get("prefix") || ""))).map(name => ({ key: name.slice(kind.length + 1) })), directories: [] });
    const current = blobs.get(name), headers = new Headers(init.headers);
    if (method === "GET") return current ? new Response(current.body, { headers: { etag: current.etag, "content-type": "application/json" } }) : new Response(null, { status: 404 });
    if (method === "DELETE") { blobs.delete(name); return new Response(null, { status: 204 }); }
    assert.equal(method, "PUT"); if ((headers.get("if-none-match") === "*" && current) || (headers.has("if-match") && headers.get("if-match") !== current?.etag)) { result.conflicts++; return new Response(null, { status: 412 }); }
    const next = String(++etag); blobs.set(name, { body: init.body, etag: next }); return new Response(null, { headers: { etag: next } });
  }
  if (!["https://api.twilio.com", "https://pricing.twilio.com"].includes(url.origin)) { result.blockedNetwork.push({ origin: url.origin, path: url.pathname }); return deny(); }
  result.twilio.push({ method, path: url.pathname, query: url.search });
  if (url.origin === "https://pricing.twilio.com") return Response.json({ price_unit: priceCurrency, phone_number_prices: [{ number_type: "local", current_price: monthlyPrice }] });
  assert.ok(url.pathname.startsWith("/2010-04-01/Accounts/" + account + "/"));
  if (url.pathname.endsWith("/AvailablePhoneNumbers/US/Local.json")) return Response.json({ available_phone_numbers: [{ phone_number: number, capabilities, address_requirements: addressRequirements }] });
  if (url.pathname.endsWith("/IncomingPhoneNumbers.json")) {
    if (method === "GET") {if(beforeInventory)await beforeInventory();return Response.json(inventoryOverride===undefined?{ incoming_phone_numbers: [...remote.values()].filter(row => row.friendly_name === url.searchParams.get("FriendlyName")), next_page_uri: null }:inventoryOverride);}
    assert.equal(method, "POST"); const params = new URLSearchParams(init.body); assert.equal(params.get("PhoneNumber"), number); assert.equal(params.has("VoiceUrl"), false); assert.equal(params.has("SmsUrl"), false);
    if(failPostBeforeCommit)throw new Error('Fixture response lost before remote commit');
    const sid = "PN" + hash(params.get("FriendlyName")).slice(0, 32), row = { sid, account_sid: account, phone_number: number, friendly_name: params.get("FriendlyName") }; remote.set(sid, row);
    if (lostPost) throw new Error("Fixture lost create response after remote commit"); return Response.json(row, { status: 201, headers: { "twilio-request-id": "fixture-request" } });
  }
  const sid = url.pathname.split("/").at(-1).replace(/\.json$/, ""), row = remote.get(sid);
  if (method === "DELETE") { remote.delete(sid); return new Response(null, { status: 204 }); }
  return row ? Response.json(row) : new Response(null, { status: 404 });
};
const { setEnvironmentContext } = await import("@netlify/blobs"); setEnvironmentContext({ siteID: "phone-site", token: "fixture-token", edgeURL: "https://phone-eventual.invalid", uncachedEdgeURL: "https://phone-blobs.invalid" });
const store = await import("../netlify/functions/lib/store.mjs"), accounts = await import("../netlify/functions/lib/accounts.mjs"), phone = await import("../netlify/functions/lib/phone-activation.mjs");
const { runPhoneActivationRecovery } = await import("../netlify/functions/phone-activation-scheduler.mjs");
const { createTwilioNumberAdapter } = await import("../netlify/functions/lib/phone-twilio.mjs"), { configurationRevision } = await import("../netlify/functions/lib/setup.mjs"), { newClient } = await import("../netlify/functions/lib/config.mjs");
const read = accounts.strictRead, check = async (name, fn) => { try { await fn(); result.checks.push({ name, pass: true }); } catch (error) { fault = null; result.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } };
let serial = 0;
const offer = () => ({ version: "fixture_number_v1", scope: "number_acquisition_only", country: "US", areaCode: "713", currency: "USD", oneTimeCents: 0, monthlyCents: 115, maxAcquisitionCents: 115, expiresAt: new Date(clock + 86400000).toISOString(), authorityText: "I am authorized to reserve a number for this business and accept the disclosed recurring monthly cost until confirmed release." });
async function client(mode, suffix) { const slug = `phone-${mode}-${suffix}-${++serial}`, c = newClient({ slug, ownerKey: "private-" + slug, owner: { email: slug + "@example.test", name: "Fixture Owner", phone: "+17135550100" }, business: { name: "Fixture Shop", trade: "HVAC" } }); Object.assign(c, { onboarding: { version: 1 }, status: "testing", channels: { web: { active: false }, voice: { active: false }, sms: { active: false } } }); await store.put("clients", slug, c); return c; }
const request = (engine, c, extra = {}) => engine.request(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c), submissionId: hash("request-" + ++serial), offerVersion: engine.quote().version, offerDigest: engine.quote().digest, authority: true, acceptedCosts: true, ...extra });
const cancel = (engine, c, id) => engine.cancel(c, id, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c) });
function provider() {
  const resources = new Map(), calls = { acquire: 0, lookup: 0, release: 0 }; let acquisition = "ok", releaseMode = "ok", hold = null;
  const adapter = {
    async acquire({ correlationId }) { calls.acquire++; if (hold) await hold; if (acquisition === "before") throw new Error("No result"); const row = { id: "PN" + hash(correlationId).slice(0, 32), number, correlationId, currency: "USD", quotedMonthlyCents: 115 }; resources.set(row.id, row); if (acquisition === "after") throw new Error("Lost result"); return row; },
    async lookup({ correlationId, resourceId }) { calls.lookup++; const resource = resourceId ? resources.get(resourceId) : [...resources.values()].find(row => row.correlationId === correlationId); return resource ? { status: "found", resource } : resourceId ? { status: "absent", definitive: true } : { status: "unknown" }; },
    async release({ resourceId }) { calls.release++; if (releaseMode === "before") throw new Error("Release unavailable"); resources.delete(resourceId); if (releaseMode === "after") throw new Error("Lost release result"); return { confirmed: true, resourceId }; },
  };
  return { adapter, calls, resources, acquisition: value => { acquisition = value; }, release: value => { releaseMode = value; }, hold: value => { hold = value; } };
}
async function suite(mode) {
  process.env.MC_MEMORY_STORE = mode === "memory" ? "1" : "0"; const name = value => mode + ": " + value;
  await check(name("gate off, bad authority and wrong mailbox cannot create a purchase intent"), async () => {
    const c = await client(mode, "auth"), p = provider(), engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: false });
    await assert.rejects(() => request(engine, c), error => error.code === "phone_setup_unavailable");
    const open = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }); await assert.rejects(() => request(open, c, { authority: false }), error => error.status === 400); await assert.rejects(() => request(open, c, { actor: { role: "owner", email: "foreign@example.test" } }), error => error.status === 403); assert.equal(p.calls.acquire, 0);
  });
  await check(name("new browser keys and concurrent workers cannot buy a second number"), async () => {
    const c = await client(mode, "once"), p = provider(), engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }); const rows = await Promise.all(Array.from({ length: 5 }, () => request(engine, c))); assert.ok(rows.every(row => row.id === rows[0].id));
    await Promise.all([engine.run(rows[0].id), engine.run(rows[0].id)]); assert.equal(p.calls.acquire, 1); assert.equal(p.resources.size, 1); assert.equal((await read("phone_activation_intents", rows[0].id)).state, "number_acquired"); assert.deepEqual(await read("clients", c.slug), c);
  });
  for (const modeOfLoss of ["before", "after"]) await check(name("lost acquisition result " + modeOfLoss + " remote effect never blindly repurchases"), async () => {
    const c = await client(mode, modeOfLoss), p = provider(); p.acquisition(modeOfLoss); const engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }), row = await request(engine, c);
    assert.equal((await engine.run(row.id)).state, "uncertain"); for (let i = 0; i < 3; i++) { clock += 300001; await engine.run(row.id); } assert.equal(p.calls.acquire, 1);
    assert.equal((await read("phone_activation_intents", row.id)).state, modeOfLoss === "after" ? "number_acquired" : "uncertain");
  });
  await check(name("execution rechecks the gate and current owner revision"), async () => {
    const c = await client(mode, "gated"), p = provider(); let enabled = true; const engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: () => enabled }), row = await request(engine, c); enabled = false;
    assert.equal((await engine.run(row.id)).state, "waiting_platform"); assert.equal(p.calls.acquire, 0); enabled = true; await engine.run(row.id); assert.equal(p.calls.acquire, 1);
    const stale = await client(mode, "stale"), old = await request(engine, stale); await store.put("clients", stale.slug, { ...stale, summary: "Owner changed rules" }); assert.equal((await engine.run(old.id)).state, "superseded"); assert.equal(p.calls.acquire, 1);
  });
  await check(name("a confirmed untouched pre-purchase stop accepts a fresh review without changing number identity"), async () => {
    const c = await client(mode, 'renew'), p = provider(), engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }), first = await request(engine,c);
    const before = await read('phone_activation_intents',first.id), updated = { ...c, summary: 'Owner reviewed corrected business instructions.' };
    await store.put('clients',c.slug,updated); assert.equal((await engine.run(first.id)).state,'superseded');
    const reviews = await Promise.all([request(engine,updated),request(engine,updated)]);
    assert.ok(reviews.every(row => row.id === first.id));
    const renewed = await read('phone_activation_intents',first.id);
    assert.equal(renewed.correlationId,before.correlationId); assert.equal(renewed.renewalSequence,1); assert.equal(renewed.history.length,1);
    await Promise.all([engine.run(first.id),engine.run(first.id)]); assert.equal(p.calls.acquire,1); assert.equal(p.resources.size,1);
  });
  for (const releaseMode of ["before", "after"]) await check(name("cancellation retains resource after " + releaseMode + " release failure and confirms cleanup"), async () => {
    const c = await client(mode, "release"), p = provider(), engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }), row = await request(engine, c); await engine.run(row.id); const reserved = await read("phone_activation_intents", row.id);
    await cancel(engine, c, row.id); p.release(releaseMode); assert.equal((await engine.run(row.id)).state, "cleanup_uncertain"); assert.equal((await read("phone_activation_intents", row.id)).resource.id, reserved.resource.id);
    p.release("ok"); await engine.run(row.id); if (releaseMode === "before") await engine.run(row.id); const cleaned = await read("phone_activation_intents", row.id); assert.equal(cleaned.state, "cancelled"); assert.ok(cleaned.releasedAt); assert.equal(cleaned.resource.id, reserved.resource.id); assert.equal(p.calls.acquire, 1);
  });
  await check(name("cancelling an in-flight request preserves late receipt and releases same number"), async () => {
    const c = await client(mode, "cancel-race"), p = provider(); let release; p.hold(new Promise(resolve => { release = resolve; })); const engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }), row = await request(engine, c), pending = engine.run(row.id);
    while (!p.calls.acquire) await new Promise(resolve => setImmediate(resolve)); await cancel(engine, c, row.id); release(); await pending; assert.equal((await read("phone_activation_intents", row.id)).state, "cleanup_pending"); await engine.run(row.id); assert.equal((await read("phone_activation_intents", row.id)).state, "cancelled"); assert.equal(p.calls.acquire, 1); assert.equal(p.calls.release, 1);
  });
  await check(name("archived accounts cannot authorize or dispatch a queued purchase"), async () => {
    const c = await client(mode, "archived"), p = provider(), engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }), row = await request(engine, c), archived = { ...c, status: "archived" }; await store.put("clients", c.slug, archived);
    await assert.rejects(() => request(engine, archived), error => error.code === "workspace_inactive"); assert.equal((await engine.run(row.id)).state, "cancelled"); assert.equal(p.calls.acquire, 0);
  });
  await check(name("owner cancellation remains durable with no current offer and gate-off work stays visible"), async () => {
    const c = await client(mode, "no-offer-cancel"), p = provider(), engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }), row = await request(engine, c); await engine.run(row.id);
    delete process.env.PHONE_ACTIVATION_OFFER_JSON; const cancelled = await phone.cancelPhoneActivation(c, row.id, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c) }); assert.equal(cancelled.state, "cleanup_pending");
    const held = await phone.recoverPhoneActivations(); assert.equal(held.enabled, false); assert.equal(held.ok, false); assert.ok(held.pending > 0); assert.ok(held.cleanupPending > 0); assert.equal(p.calls.release, 0); assert.ok((await read("phone_activation_intents", row.id)).resource.id);
  });
  await check(name("completed acquisition lookup cannot delay immediate lost-release reconciliation"), async () => {
    const c = await client(mode, "lookup-then-release"), p = provider(); p.acquisition("after"); const engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true }), row = await request(engine, c);
    await engine.run(row.id); await engine.run(row.id); assert.equal((await read("phone_activation_intents", row.id)).lookupClaim, null);
    await cancel(engine, c, row.id); p.release("after"); assert.equal((await engine.run(row.id)).state, "cleanup_uncertain"); assert.equal((await engine.run(row.id)).state, "cancelled"); assert.equal(p.calls.acquire, 1); assert.equal(p.calls.release, 1);
  });
  if (mode === "sdk") await check(name("lost intent projection is recovered before adapter dispatch"), async () => {
    const c = await client(mode, "projection"), p = provider(), engine = phone.createPhoneActivationEngine({ provider: p.adapter, offer: offer(), gate: true });
    const id = `${c.slug}/${hash("first-phone-acquisition:" + hash(JSON.stringify([c.slug, c.ownerKey, c.owner.email])))}`; fault = { kind: "site:phone_activation_intents", key: id, method: "PUT" }; await assert.rejects(() => request(engine, c)); fault = null; assert.equal(p.calls.acquire, 0); await engine.recover(); assert.equal((await read("phone_activation_intents", id)).state, "number_acquired"); assert.equal(p.calls.acquire, 1);
  });
  await store.put("phone_activation_queue", "active_v1", { version: 1, intents: {}, cursor: "" });
}
await suite("memory"); await suite("sdk");
process.env.MC_MEMORY_STORE = "1";
await check("production wrapper and real adapter perform zero requests with gates unconfigured", async () => {
  const c = await client("production", "off"), before = result.twilio.length; await assert.rejects(() => phone.requestPhoneActivation(c, {}), error => error.code === "phone_setup_unavailable"); assert.equal((await phone.recoverPhoneActivations()).enabled, false); assert.equal((await phone.phoneActivationStatus(c)).available, false);
  await assert.rejects(() => createTwilioNumberAdapter({ executionAllowed: () => false }).lookup({ correlationId: hash("absent") })); assert.equal(result.twilio.length, before);
  process.env.NODE_ENV = "production"; assert.throws(() => phone.createPhoneActivationEngine({}), error => error.code === "fixture_only"); process.env.NODE_ENV = "test";
});
Object.assign(process.env, { TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: "fixture-not-real", PHONE_ACQUISITION_ENABLED: "true", PHONE_ACTIVATION_APPROVED_VERSION: "fixture_number_v1", PHONE_ACTIVATION_OFFER_JSON: JSON.stringify(offer()) });
await check("actual production adapter uses pricing, inventory, durable acquisition and safe correlation after lost POST", async () => {
  const c = await client("production", "adapter"), status = await phone.phoneActivationStatus(c), body = { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c), submissionId: hash("real-adapter-fixture"), offerVersion: status.offer.version, offerDigest: status.offer.digest, authority: true, acceptedCosts: true };
  // Synthetic upper bounds for this exact isolated customer, not provider prices.
  const allowance={version:'fixture_resource_v1',expiresAt:new Date(clock+86400000).toISOString(),mode:'cohort',providerAccountHash:hash(account),currency:'USD',rateBasis:'configured_upper_bound',rateSource:'https://example.test/synthetic-resource-bounds',bounds:{numberSetupCents:0,numberMonthlyCents:115,brandSetupCents:4400,campaignSetupCents:1500,campaignMonthlyCents:1000},accountLimits:{numbers:5,brands:5,campaigns:5,setupCents:100000,monthlyCents:10000},tenantLimits:{numbers:1,brands:1,campaigns:1,setupCents:10000,monthlyCents:2000},tenants:[{slug:c.slug,identity:hash(JSON.stringify([c.slug,c.ownerKey,c.owner.email]))}]};
  process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON=JSON.stringify(allowance);process.env.MANAGED_RESOURCE_ADMISSION_APPROVED_VERSION=allowance.version;
  const row = await phone.requestPhoneActivation(c, body); lostPost = true; await phone.recoverPhoneActivations(); lostPost = false; assert.equal((await read("phone_activation_intents", row.id)).state, "uncertain");
  await phone.recoverPhoneActivations(); const saved = await read("phone_activation_intents", row.id); assert.equal(saved.state, "number_acquired"); assert.equal(saved.resource.id, [...remote.keys()][0]); assert.equal(result.twilio.filter(row => row.method === "POST").length, 1);
  assert.equal(saved.resource.priceEvidence, "unconfirmed"); assert.deepEqual(await read("clients", c.slug), c);
  await phone.cancelPhoneActivation(c, row.id, { actor: body.actor, expectedRevision: body.expectedRevision }); await phone.recoverPhoneActivations(); const cancelled = await read("phone_activation_intents", row.id); assert.equal(cancelled.state, "cancelled"); assert.ok(cancelled.resource.id); assert.ok(cancelled.releasedAt); assert.equal(remote.size, 0);
});
await check("real adapter never interprets empty correlation lookup as absence or idempotency", async () => {
  const adapter = createTwilioNumberAdapter({ executionAllowed: () => true }); assert.equal((await adapter.lookup({ correlationId: hash("unknown") })).status, "unknown");
});
await check("changed account price cannot dispatch a number purchase above the authorized cap", async () => {
  const c = await client("production", "price"), status = await phone.phoneActivationStatus(c), prior = result.twilio.filter(row => row.method === "POST").length; monthlyPrice = "9.99";
  await phone.requestPhoneActivation(c, { actor: { role: "owner", email: c.owner.email }, expectedRevision: configurationRevision(c), submissionId: hash("price"), offerVersion: status.offer.version, offerDigest: status.offer.digest, authority: true, acceptedCosts: true }); await phone.recoverPhoneActivations(); assert.equal(result.twilio.filter(row => row.method === "POST").length, prior); monthlyPrice = "1.15";
});
await check("real adapter refuses expired aggregate deadline without any provider request", async () => {
  const before = result.twilio.length; await assert.rejects(() => createTwilioNumberAdapter({ executionAllowed: () => true, deadlineAt: clock - 1 }).lookup({ correlationId: hash("deadline") })); assert.equal(result.twilio.length, before);
});
// Separate SDK-backed cohort: real engine/adapter and ordinary accepted intents.
// The response shape below is sanitized from the observed Twilio read response;
// no live account, number, owner data or provider success is imported.
process.env.MC_MEMORY_STORE='0';
const posts=()=>result.twilio.filter(row=>row.method==='POST').length;
async function preDispatchFixture() {
  capabilities={MMS:true,SMS:true,voice:true};addressRequirements='none';monthlyPrice='1.15';priceCurrency='USD';inventoryOverride=undefined;beforeInventory=null;failPostBeforeCommit=false;lostPost=false;fault=null;process.env.TWILIO_ACCOUNT_SID=account;
  const c=await client('sdk','predispatch');let open=true;
  const allowance={version:'fixture_predispatch_v1',expiresAt:new Date(clock+86400000).toISOString(),mode:'self_service',providerAccountHash:hash(account),currency:'USD',rateBasis:'configured_upper_bound',rateSource:'https://example.test/synthetic-resource-bounds',bounds:{numberSetupCents:0,numberMonthlyCents:115,brandSetupCents:4400,campaignSetupCents:1500,campaignMonthlyCents:1000},accountLimits:{numbers:100,brands:100,campaigns:100,setupCents:1000000,monthlyCents:1000000},tenantLimits:{numbers:1,brands:1,campaigns:1,setupCents:10000,monthlyCents:2000},tenants:[]};
  process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON=JSON.stringify(allowance);process.env.MANAGED_RESOURCE_ADMISSION_APPROVED_VERSION=allowance.version;
  const adapter=createTwilioNumberAdapter({executionAllowed:()=>open}),engine=phone.createPhoneActivationEngine({provider:adapter,offer:offer(),gate:()=>open}),operation=await request(engine,c);
  return {c,engine,id:operation.id,gate:value=>{open=value;},saved:()=>read('phone_activation_intents',operation.id),async failBeforeReservation(){capabilities={voice:true,SMS:false};assert.equal((await engine.run(operation.id)).state,'uncertain');capabilities={MMS:true,SMS:true,voice:true};return this.saved();}};
}
await check('strictly absent lifetime ledger proves the first expired purchase never reached dispatch',async()=>{
  const f=await preDispatchFixture(),before=posts();assert.equal(await read('managed_resource_admission','twilio_v1'),null);const original=await f.failBeforeReservation();clock+=60001;
  assert.equal((await f.engine.run(f.id)).state,'queued');assert.equal(await read('managed_resource_admission','twilio_v1'),null);const ready=await f.saved();assert.equal(ready.purchaseAttempts,1);assert.equal(ready.preDispatchRecovery.purchaseStartedAt,original.purchaseStartedAt);assert.equal(posts(),before);
});
await check('observed SMS/voice boolean shape reserves once; legacy lowercase aliases still work',async()=>{
  for(const caps of [{MMS:true,SMS:true,voice:true},{sms:true,voice:true},{SMS:true,sms:true,voice:true}]) {
    const f=await preDispatchFixture(),before=posts();capabilities=caps;
    assert.equal((await f.engine.run(f.id)).state,'number_acquired');assert.equal(posts(),before+1);assert.equal((await f.saved()).purchaseAttempts,1);
  }
});
await check('missing, false, string and conflicting capability aliases never reserve or POST',async()=>{
  for(const caps of [{voice:true},{voice:true,SMS:false},{voice:true,SMS:'true'},{voice:true,SMS:true,sms:false},{voice:true,SMS:true,sms:'true'},{voice:false,SMS:true},{voice:'true',SMS:true},{voice:true,Voice:false,SMS:true}]) {
    const f=await preDispatchFixture(),before=posts(),ledger=await read('managed_resource_admission','twilio_v1');capabilities=caps;
    assert.equal((await f.engine.run(f.id)).state,'uncertain');assert.equal(posts(),before);assert.deepEqual(await read('managed_resource_admission','twilio_v1'),ledger);
  }
});
await check('USD115 and no-address qualification remain mandatory before any reservation',async()=>{
  for(const change of [()=>{monthlyPrice='1.16';},()=>{priceCurrency='EUR';},()=>{addressRequirements='local';}]) {
    const f=await preDispatchFixture(),before=posts(),ledger=await read('managed_resource_admission','twilio_v1');change();
    assert.equal((await f.engine.run(f.id)).state,'uncertain');assert.equal(posts(),before);assert.deepEqual(await read('managed_resource_admission','twilio_v1'),ledger);
  }
});
await check('strict no-reservation proof queues the same expired intent once without refund; concurrent retry buys one number',async()=>{
  const f=await preDispatchFixture(),before=posts(),initial=await f.failBeforeReservation(),ledger=await read('managed_resource_admission','twilio_v1');clock+=60001;
  assert.equal((await f.engine.run(f.id)).state,'queued');const ready=await f.saved();
  assert.equal(ready.purchaseAttempts,1);assert.equal(ready.purchaseStartedAt,null);assert.equal(ready.preDispatchRecovery.purchaseStartedAt,initial.purchaseStartedAt);assert.equal(ready.preDispatchRecovery.providerAccountHash,hash(account));assert.equal(ready.correlationId,initial.correlationId);assert.equal(ready.generation,initial.generation);assert.equal(ready.id,initial.id);assert.equal(posts(),before);assert.deepEqual(await read('managed_resource_admission','twilio_v1'),ledger);
  await Promise.all([f.engine.run(f.id),f.engine.run(f.id)]);const saved=await f.saved();assert.equal(saved.state,'number_acquired');assert.equal(saved.id,initial.id);assert.equal(saved.correlationId,initial.correlationId);assert.equal(saved.purchaseAttempts,2);assert.equal(saved.reconciliationAttempts,1);assert.deepEqual(saved.preDispatchRecovery,ready.preDispatchRecovery);assert.equal(posts(),before+1);
});
await check('a second proven predispatch failure stops for review with both spent attempts retained',async()=>{
  const f=await preDispatchFixture(),before=posts();await f.failBeforeReservation();clock+=60001;await f.engine.run(f.id);capabilities={voice:true,SMS:false};assert.equal((await f.engine.run(f.id)).state,'uncertain');clock+=60001;
  assert.equal((await f.engine.run(f.id)).state,'needs_review');const saved=await f.saved();assert.equal(saved.purchaseAttempts,2);assert.equal(saved.preDispatchRecovery.purchaseAttempts,1);assert.equal(saved.preDispatchStop.purchaseAttempts,2);assert.equal(saved.reasonCode,'pre_dispatch_retry_exhausted');for(let i=0;i<3;i++)await f.engine.run(f.id);assert.equal(posts(),before);
});
await check('a recovered attempt cannot refund its spent count or loop when admission later fails',async()=>{
  const f=await preDispatchFixture(),before=posts();await f.failBeforeReservation();clock+=60001;await f.engine.run(f.id);
  const policy=JSON.parse(process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON);policy.tenantLimits.numbers=0;process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON=JSON.stringify(policy);
  assert.equal((await f.engine.run(f.id)).state,'waiting_platform');assert.equal((await f.saved()).purchaseAttempts,2);
  for(let i=0;i<3;i++)assert.equal((await f.engine.run(f.id)).state,'needs_review');assert.equal((await f.saved()).purchaseAttempts,2);assert.equal(posts(),before);
});
await check('the original claim interval must expire before missing reservation can authorize recovery',async()=>{
  const f=await preDispatchFixture(),before=posts();await f.failBeforeReservation();assert.equal((await f.engine.run(f.id)).state,'uncertain');assert.equal((await f.saved()).preDispatchRecovery,undefined);assert.equal((await f.saved()).purchaseAttempts,1);assert.equal(posts(),before);
});
await check('partial, malformed, missing pagination or foreign inventory never earns no-dispatch proof',async()=>{
  for(const data of [{incoming_phone_numbers:[],next_page_uri:'/next'},{incoming_phone_numbers:[]},{incoming_phone_numbers:null,next_page_uri:null},{next_page_uri:null},{incoming_phone_numbers:[{friendly_name:'foreign'}],next_page_uri:null}]) {
    const f=await preDispatchFixture(),before=posts();await f.failBeforeReservation();clock+=60001;inventoryOverride=data;
    assert.equal((await f.engine.run(f.id)).state,'uncertain');assert.equal((await f.saved()).preDispatchRecovery,undefined);assert.equal((await f.saved()).purchaseAttempts,1);assert.equal(posts(),before);
  }
});
await check('a reservation before a lost POST blocks retry even when a complete inventory is empty',async()=>{
  const f=await preDispatchFixture(),before=posts();failPostBeforeCommit=true;assert.equal((await f.engine.run(f.id)).state,'uncertain');failPostBeforeCommit=false;const ledger=await read('managed_resource_admission','twilio_v1');clock+=60001;
  for(let i=0;i<3;i++){assert.equal((await f.engine.run(f.id)).state,'uncertain');clock+=300001;}
  assert.equal((await f.saved()).preDispatchRecovery,undefined);assert.equal((await f.saved()).purchaseAttempts,1);assert.equal(posts(),before+1);assert.deepEqual(await read('managed_resource_admission','twilio_v1'),ledger);
});
await check('strict ledger read failure and malformed counters cannot be mistaken for absent reservation',async()=>{
  for(const mode of ['unavailable','malformed']) {
    const f=await preDispatchFixture(),before=posts();await f.failBeforeReservation();clock+=60001;const original=await read('managed_resource_admission','twilio_v1');
    if(mode==='unavailable')fault={kind:'site:managed_resource_admission',key:'twilio_v1',method:'GET'};
    else await store.put('managed_resource_admission','twilio_v1',{...original,used:{...original.used,numbers:original.used.numbers+1}});
    assert.equal((await f.engine.run(f.id)).state,'uncertain');fault=null;assert.equal((await f.saved()).preDispatchRecovery,undefined);assert.equal(posts(),before);await store.put('managed_resource_admission','twilio_v1',original);
  }
});
await check('current account, owner rules, cancellation, quote expiry and product gate changes block recovery',async()=>{
  for(const mode of ['account','rules','cancel','expiry','gate']) {
    const f=await preDispatchFixture(),before=posts();await f.failBeforeReservation();clock+=60001;
    beforeInventory=async()=>{beforeInventory=null;if(mode==='account')process.env.TWILIO_ACCOUNT_SID='AC'+'9'.repeat(32);if(mode==='rules')await store.put('clients',f.c.slug,{...f.c,summary:'Owner changed current rules'});if(mode==='cancel')await cancel(f.engine,f.c,f.id);if(mode==='expiry')clock+=86400001;if(mode==='gate')f.gate(false);};
    await f.engine.run(f.id);const saved=await f.saved();assert.notEqual(saved.state,'queued');assert.equal(saved.preDispatchRecovery,undefined);assert.equal(saved.purchaseAttempts,1);assert.equal(posts(),before);
  }
});
await check('lost recovery CAS write leaves uncertainty and later reconciles the same intent without purchasing',async()=>{
  const f=await preDispatchFixture(),before=posts(),initial=await f.failBeforeReservation();clock+=60001;
  beforeInventory=async()=>{beforeInventory=null;fault={kind:'site:phone_activation_intents',key:f.id,method:'PUT'};};
  await assert.rejects(()=>f.engine.run(f.id));fault=null;const held=await f.saved();assert.equal(held.state,'uncertain');assert.equal(held.purchaseStartedAt,initial.purchaseStartedAt);assert.equal(held.purchaseAttempts,1);assert.equal(held.preDispatchRecovery,undefined);clock+=60001;
  assert.equal((await f.engine.run(f.id)).state,'queued');assert.equal(posts(),before);assert.equal((await f.saved()).purchaseAttempts,1);assert.equal((await f.saved()).id,initial.id);
});
process.env.MC_MEMORY_STORE='1';capabilities={MMS:true,SMS:true,voice:true};addressRequirements='none';monthlyPrice='1.15';priceCurrency='USD';inventoryOverride=undefined;beforeInventory=null;failPostBeforeCommit=false;fault=null;process.env.TWILIO_ACCOUNT_SID=account;
await check('expired number and resource offers permit recorded production cleanup; new acquisition, global-off and brake stay closed',async()=>{
  await store.put('phone_activation_queue','active_v1',{version:1,intents:{},cursor:''});
  const retained=await client('production','expiry-cleanup'),queued=await client('production','expiry-queued'),currentOffer=offer();process.env.PHONE_ACTIVATION_OFFER_JSON=JSON.stringify(currentOffer);
  const allowance={version:'fixture_resource_cleanup_v2',expiresAt:currentOffer.expiresAt,mode:'cohort',providerAccountHash:hash(account),currency:'USD',rateBasis:'configured_upper_bound',rateSource:'https://example.test/synthetic-resource-bounds',bounds:{numberSetupCents:0,numberMonthlyCents:115,brandSetupCents:4400,campaignSetupCents:1500,campaignMonthlyCents:1000},accountLimits:{numbers:5,brands:5,campaigns:5,setupCents:100000,monthlyCents:10000},tenantLimits:{numbers:1,brands:1,campaigns:1,setupCents:10000,monthlyCents:2000},tenants:[retained,queued].map(c=>({slug:c.slug,identity:hash(JSON.stringify([c.slug,c.ownerKey,c.owner.email]))}))};process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON=JSON.stringify(allowance);process.env.MANAGED_RESOURCE_ADMISSION_APPROVED_VERSION=allowance.version;
  const start=async c=>{const status=await phone.phoneActivationStatus(c);return phone.requestPhoneActivation(c,{actor:{role:'owner',email:c.owner.email},expectedRevision:configurationRevision(c),submissionId:hash('expired-'+c.slug),offerVersion:status.offer.version,offerDigest:status.offer.digest,authority:true,acceptedCosts:true});};
  const purchased=await start(retained);await phone.recoverPhoneActivations();assert.equal((await read('phone_activation_intents',purchased.id)).state,'number_acquired');const untouched=await start(queued);
  clock=Date.parse(currentOffer.expiresAt)+1;const before=result.twilio.length;assert.equal((await phone.phoneActivationStatus(queued)).available,false);await assert.rejects(()=>start(queued));await phone.cancelPhoneActivation(retained,purchased.id,{actor:{role:'owner',email:retained.owner.email},expectedRevision:configurationRevision(retained)});
  process.env.PHONE_ACQUISITION_ENABLED='false';await phone.recoverPhoneActivations();assert.equal(result.twilio.length,before);process.env.PHONE_ACQUISITION_ENABLED='true';await store.put('health','brake',{on:true});await phone.recoverPhoneActivations();assert.equal(result.twilio.length,before);await store.put('health','brake',{on:false});
  for(let n=0;n<4;n++)await phone.recoverPhoneActivations();assert.equal((await read('phone_activation_intents',purchased.id)).state,'cancelled');const waiting=await read('phone_activation_intents',untouched.id);assert.equal(waiting.state,'waiting_platform');assert.equal(waiting.purchaseAttempts,0);assert.equal(waiting.purchaseStartedAt,undefined);
  assert.equal(result.twilio.slice(before).filter(row=>row.method==='POST').length,0);assert.equal(result.twilio.slice(before).filter(row=>row.method==='DELETE').length,1);assert.ok(result.twilio.slice(before).some(row=>row.method==='GET'));
});
delete process.env.PHONE_ACQUISITION_ENABLED; delete process.env.PHONE_ACTIVATION_APPROVED_VERSION; delete process.env.PHONE_ACTIVATION_OFFER_JSON;
await check("dedicated worker persists sanitized gate-off receipt and main health preserves fresh failures", async () => {
  const before = result.twilio.length, record = await runPhoneActivationRecovery(); assert.equal(record.enabled, false); assert.equal(result.twilio.length, before); assert.deepEqual(await read("health", "phoneSetup:lastRun"), record);
  await store.put("phone_activation_queue", "active_v1", { version: 1, intents: {}, cursor: "" }); await store.put("health", "phoneSetup:lastRun", { at: new Date(clock).toISOString(), ok: false, reasonCode: "phone_recovery_unavailable" });
  assert.equal((await phone.phoneRecoveryHealth()).ok, false); const recovered = await runPhoneActivationRecovery(); assert.equal(recovered.ok, true); assert.equal((await phone.phoneRecoveryHealth()).ok, true);
});
await check("all network destinations were intercepted and no real network was requested", async () => assert.deepEqual(result.blockedNetwork, []));
result.sourceAfter = hashes(); result.summary = { passed: result.checks.filter(row => row.pass).length, failed: result.checks.filter(row => !row.pass).length, total: result.checks.length };
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result, null, 2)); if (result.summary.failed) process.exitCode = 1;
