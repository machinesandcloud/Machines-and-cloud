// Actual production engine and Twilio adapter under intercepted HTTP + memory/installed Blobs SDK.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const index = process.argv.indexOf("--output"), output = index < 0 ? null : process.argv[index + 1];
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error("Choose a new scratchpad receipt");
const hash = value => createHash("sha256").update(value).digest("hex"), sourceFiles = ["netlify/functions/lib/messaging-activation.mjs", "netlify/functions/lib/messaging-provider.mjs", "netlify/functions/messaging-activation-scheduler.mjs", "netlify/functions/lib/managed-consent.mjs", "netlify/functions/lib/managed-resource-admission.mjs", "netlify/functions/lib/messaging-program.mjs"];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(file))]));
const result = { at: new Date().toISOString(), mode: "actual messaging engine, actual Twilio adapter, memory and installed SDK intercepted HTTP; zero real network", sourceBefore: sourceHashes(), checks: [], conflicts: 0, providerWrites: [], blockedNetwork: [] };
for (const key of Object.keys(process.env)) if (/^(TWILIO_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|PHONE_|MESSAGING_|SERVICE_|PLATFORM_DATA_|CALENDAR_TOKEN_|MANAGED_RESOURCE_)/.test(key)) delete process.env[key];
const account = "AC" + "1".repeat(32), primary = "BU" + "2".repeat(32), mobile = "+17135550100";
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: "http://127.0.0.1:8892", PUBLIC_SITE_URL: "http://127.0.0.1:8892", PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), TWILIO_ACCOUNT_SID: account, TWILIO_PRIMARY_PROFILE_SID: primary, TWILIO_AUTH_TOKEN: "fixture-token", ADMIN_EMAILS: "operator@example.test" });
const deny = () => { throw new Error("Messaging test networking disabled"); }; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const NativeDate = Date; let clock = NativeDate.now(); globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const blobs = new Map(), remote = new Map(); let etag = 0, serial = 0, autoApprove = true, lose = null, rejectBefore = null, pagination = false, blockedWrite = null, rejectReceiptKey = null;
const names = { A2PProfileBundleSid: "a2p_profile_bundle_sid", CustomerProfileBundleSid: "customer_profile_bundle_sid", UsAppToPersonUsecase: "us_app_to_person_usecase", SmsUrl: "sms_url", SmsMethod: "sms_method", StatusCallback: "status_callback", IsoCountry: "iso_country", UseInboundWebhookOnNumber: "use_inbound_webhook_on_number" };
const snake = text => names[text] || text.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const keyFor = url => url.origin + url.pathname;
const response = data => Response.json(data, { headers: { "twilio-request-id": "fixture-request" } });
function promote(data) { const next = structuredClone(data); if (autoApprove) { if (next.status === "pending-review") next.status = "twilio-approved"; if (next.status === "PENDING" || next.status === "IN_REVIEW") next.status = "APPROVED"; if (next.campaign_status === "IN_PROGRESS") next.campaign_status = "VERIFIED"; } return next; }
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || "GET").toUpperCase();
  if (url.origin === "https://messaging-blobs.invalid") {
    const [, site, kind, ...parts] = url.pathname.split("/").map(decodeURIComponent), key = parts.join("/"), name = kind + "/" + key; assert.equal(site, "messaging-site");
    if (method === "GET" && !key) return response({ blobs: [...blobs.keys()].filter(name => name.startsWith(kind + "/" + (url.searchParams.get("prefix") || ""))).map(name => ({ key: name.slice(kind.length + 1) })), directories: [] });
    const current = blobs.get(name), headers = new Headers(init.headers);
    if (method === "GET") return current ? new Response(current.body, { headers: { etag: current.etag, "content-type": "application/json" } }) : new Response(null, { status: 404 });
    if (method === "DELETE") { blobs.delete(name); return new Response(null, { status: 204 }); }
    assert.equal(method, "PUT"); if (rejectReceiptKey === key && JSON.parse(init.body).resources?.service) return new Response("Injected result receipt storage failure", { status: 400 }); if ((headers.get("if-none-match") === "*" && current) || (headers.has("if-match") && headers.get("if-match") !== current?.etag)) { result.conflicts++; return new Response(null, { status: 412 }); }
    const next = String(++etag); blobs.set(name, { body: init.body, etag: next }); return new Response(null, { headers: { etag: next } });
  }
  if (!["https://trusthub.twilio.com", "https://messaging.twilio.com", "https://api.twilio.com"].includes(url.origin)) { result.blockedNetwork.push({ origin: url.origin, path: url.pathname }); return deny(); }
  assert.equal(new Headers(init.headers).get("Authorization"), "Basic " + Buffer.from(`${account}:fixture-token`).toString("base64"));
  const path = url.pathname, key = keyFor(url), existing = remote.get(key);
  if (path.endsWith(`/CustomerProfiles/${primary}`)) return response({ sid: primary, account_sid: account, status: "twilio-approved" });
  if (path.endsWith("/Compliance/Usa2p/Usecases")) return response({ us_app_to_person_usecases: [{ code: "CUSTOMER_CARE", post_approval_required: false }] });
  if (method === "GET" && existing) return response(promote(existing));
  if (method === "DELETE") { result.providerWrites.push({ method, path }); remote.delete(key); if (lose?.path === path && lose.method === method) { lose = null; throw new Error("Lost DELETE response after commit"); } return new Response(null, { status: 204 }); }
  if (method === "POST") {
    if (blockedWrite) await blockedWrite;
    result.providerWrites.push({ method, path }); const form = new URLSearchParams(init.body), values = {};
    if (rejectBefore === path) { rejectBefore = null; throw new Error("Lost request before remote effect"); }
    for (const name of new Set(form.keys())) { const all = form.getAll(name); values[snake(name)] = ["MessageSamples", "OptInKeywords", "OptOutKeywords", "HelpKeywords"].includes(name) ? all : all[0]; }
    for (const key of ["mock", "use_inbound_webhook_on_number"]) if (Object.hasOwn(values, key)) values[key] = values[key] === "true";
    if (values.attributes) values.attributes = JSON.parse(values.attributes);
    let data, resourcePath;
    if (existing) { data = { ...existing, ...values }; if (/\/Usa2p\/QE/.test(path)) data.campaign_status = "IN_PROGRESS"; if (/\/BrandRegistrations\/BN/.test(path)) data.status = "PENDING"; resourcePath = path; }
    else {
      const last = path.split("/").at(-1), prefix = { Services: "MG", CustomerProfiles: "BU", EndUsers: "IT", "Addresses.json": "AD", SupportingDocuments: "RD", EntityAssignments: "BV", Evaluations: "EL", TrustProducts: "BU", BrandRegistrations: "BN", Usa2p: "QE", PhoneNumbers: "PN" }[last]; assert.ok(prefix, "Unexpected provider creation " + path);
      const sid = last === "PhoneNumbers" ? values.phone_number_sid : prefix + hash(path + ":" + JSON.stringify(values) + ":" + ++serial).slice(0, 32);
      data = { sid, account_sid: account, ...values };
      if (last === "EntityAssignments" || last === "Evaluations") data[path.includes("/CustomerProfiles/") ? "customer_profile_sid" : "trust_product_sid"] = path.split("/").at(-2);
      if (last === "CustomerProfiles" || last === "TrustProducts") data.status = "draft";
      if (last === "Evaluations") { data.status = "compliant"; data.results = []; }
      if (last === "BrandRegistrations") { data.status = "PENDING"; data.errors = []; }
      if (last === "Usa2p") { data.campaign_status = "IN_PROGRESS"; data.messaging_service_sid = path.split("/")[3]; data.errors = []; assert.deepEqual(form.getAll("MessageSamples").length, 3); assert.ok(form.getAll("OptOutKeywords").includes("PARAR")); }
      if (last === "PhoneNumbers") { data.service_sid = path.split("/")[3]; const number = [...remote.values()].find(item => item.sid === sid && item.phone_number); data.phone_number = number.phone_number; }
      resourcePath = last.endsWith(".json") ? path.slice(0, -5) + `/${sid}.json` : path + "/" + sid;
    }
    remote.set(url.origin + resourcePath, data);
    if (lose?.path === path && lose.method === method) { lose = null; throw new Error("Lost POST response after commit"); }
    return response(data);
  }
  const last = path.split("/").at(-1), listNames = { Services: "services", CustomerProfiles: "results", EndUsers: "results", "Addresses.json": "addresses", SupportingDocuments: "results", EntityAssignments: "results", Evaluations: "results", TrustProducts: "results", BrandRegistrations: "data", Usa2p: "compliance", PhoneNumbers: "phone_numbers" }, property = listNames[last];
  if (!property) return new Response(null, { status: 404 });
  const base = path.endsWith(".json") ? path.slice(0, -5) : path, entries = [...remote.entries()].filter(([key]) => key.startsWith(url.origin + base + "/") && !key.slice((url.origin + base + "/").length).includes("/")).map(([, data]) => promote(data));
  return response({ [property]: entries, meta: { next_page_url: pagination ? "https://twilio.invalid/another-page" : null }, next_page_uri: null });
};
const { setEnvironmentContext } = await import("@netlify/blobs"); setEnvironmentContext({ siteID: "messaging-site", token: "fixture-token", edgeURL: "https://messaging-eventual.invalid", uncachedEdgeURL: "https://messaging-blobs.invalid" });
const store = await import("../netlify/functions/lib/store.mjs"), { strictRead } = await import("../netlify/functions/lib/accounts.mjs"), sms = await import("../netlify/functions/lib/messaging-activation.mjs"), { createTwilioMessagingAdapter } = await import("../netlify/functions/lib/messaging-provider.mjs"), { configurationRevision } = await import("../netlify/functions/lib/setup.mjs"), { newClient } = await import("../netlify/functions/lib/config.mjs");
const consent = await import("../netlify/functions/lib/managed-consent.mjs");
const check = async (name, fn) => { try { await fn(); result.checks.push({ name, pass: true }); } catch (error) { lose = null; rejectBefore = null; rejectReceiptKey = null; pagination = false; blockedWrite = null; result.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } };
const offer = () => ({ version: "fixture_sms_v1", scope: "a2p_customer_care", country: "US", currency: "USD", brandRegistrationCents: 4400, campaignRegistrationCents: 1500, campaignMonthlyCents: 1000, resubmissionCents: 1500, maxResubmissions: 1, usageDisclosure: "Fixture pricing only. Existing accepted product plan controls usage; no unlimited sending.", authorityText: "I am authorized by this business to file the reviewed customer-care texting registration and accept all disclosed fees and ongoing usage terms.", feeScheduleUrl: "https://example.test/fixture-fees", expiresAt: new Date(clock + 14 * 86400000).toISOString() });
const legal = () => ({ legalName: "Fixture Service LLC", ein: "92-1234567", businessType: "llc", street: "123 Example Street", street2: "Suite 1", city: "Houston", state: "TX", zip: "77057", website: "https://example.test", representative: { firstName: "Alex", lastName: "Fixture", email: "alex@example.test", phone: mobile, title: "Owner", jobPosition: "Other" } });
async function fixture(mode, suffix = "normal") {
  const slug = `sms-${mode}-${suffix}-${++serial}`.slice(0, 40), c = newClient({ slug, ownerKey: "private-" + slug, owner: { name: "Fixture Owner", email: slug + "@example.test", phone: mobile }, business: { name: "Fixture Shop", website: "https://example.test", trade: "HVAC" } }); Object.assign(c, { onboarding: { version: 1 }, status: "testing", build: { status: "built", source: "owner_answers" }, channels: { web: { active: false }, voice: { active: false }, sms: { active: false } } }); c.services=["AC repair"];c.business.serviceArea=["Houston"];c.windows=["8 to 12"];c.rules.hours={mon:{open:"08:00",close:"17:00"}}; const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision }; await store.put("clients", slug, c);
  const identity = hash(JSON.stringify([c.slug, c.ownerKey, c.owner.email.toLowerCase()])), number = { intentId: slug + "/" + hash("first-phone-acquisition:" + identity), id: "PN" + hash(slug).slice(0, 32), number: "+1713" + String(5550000 + serial).slice(-7) }, phonePath = `https://api.twilio.com/2010-04-01/Accounts/${account}/IncomingPhoneNumbers/${number.id}.json`;
  // Synthetic explicit bounds for this exact isolated tenant; no catchall policy.
  const allowance={version:'fixture_resource_v1',expiresAt:new Date(clock+14*86400000).toISOString(),mode:'cohort',providerAccountHash:hash(account),currency:'USD',rateBasis:'configured_upper_bound',rateSource:'https://example.test/synthetic-resource-bounds',bounds:{numberSetupCents:0,numberMonthlyCents:115,brandSetupCents:4400,campaignSetupCents:1500,campaignMonthlyCents:1000},accountLimits:{numbers:100,brands:100,campaigns:100,setupCents:1000000,monthlyCents:1000000},tenantLimits:{numbers:1,brands:1,campaigns:1,setupCents:10000,monthlyCents:2000},tenants:[{slug,identity}]};
  process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON=JSON.stringify(allowance);process.env.MANAGED_RESOURCE_ADMISSION_APPROVED_VERSION=allowance.version;
  await store.put("phone_activation_intents", number.intentId, { id: number.intentId, slug, tenantIdentity: identity,resourceAccountHash:hash(account), state: "number_acquired", resource: { id: number.id, number: number.number }, correlationId: hash("fixture-phone:" + slug), dependencies: {} });
  remote.set(phonePath, { sid: number.id, account_sid: account, phone_number: number.number, capabilities: { sms: true, voice: true }, sms_url: "", sms_method: "POST" });
  const controls = { enabled: true, claimed: 0, cleared: 0, cancelled: false, provider: createTwilioMessagingAdapter({ executionAllowed: () => controls.enabled }) };
  const engine = sms.createMessagingActivationEngine({ provider: controls.provider, gate: () => controls.enabled, offer: offer(), resolveNumber: async () => number, claimParent: async () => { if (controls.cancelled) throw new Error("Parent cancelled"); controls.claimed++; if (controls.failParentReceipt) throw new Error("Lost dependency claim receipt after parent commit"); }, clearParent: async (_, value) => { assert.equal(value.cleanupConfirmed, true); controls.cleared++; }, parentLifecycle: async () => { if(controls.onParentRead)await controls.onParentRead();return { cancellationRequested: controls.cancelled }; } });
  const body = extra => ({ expectedRevision: configurationRevision(c), submissionId: hash("submit" + ++serial), actor: { role: "owner", email: c.owner.email }, offerVersion: engine.quote().version, offerDigest: engine.quote().digest, programDigest: sms.buildMessagingProgram(c).digest, authority: true, acceptedCosts: true, attestLegalAccuracy: true, attestConsent: true, testPhoneConsent: true, legal: legal(), ...extra });
  return { c, number, controls, engine, body, phonePath };
}
async function advance(f, wanted = "awaiting_test", max = 80) { let result; f.operationId ||= (await f.engine.request(f.c, f.body())).id; for (let n = 0; n < max; n++) { clock += 601000; result = await f.engine.run(f.operationId); if (result.state === wanted) return result; if (["uncertain", "needs_action", "blocked", "cancelled"].includes(result.state)) throw new Error("Stopped in " + result.state + ": " + result.reasonCode); } throw new Error("Did not reach " + wanted + "; got " + result?.state); }
async function suite(mode) {
  process.env.MC_MEMORY_STORE = mode === "memory" ? "1" : "0";
  await check(mode + ": strict customer authority, separate attestations, encrypted legal data and generated program", async () => {
    const f = await fixture(mode, "authority");
    for (const extra of [{ authority: false }, { acceptedCosts: false }, { attestLegalAccuracy: false }, { attestConsent: false }, { testPhoneConsent: false }, { programDigest: "wrong" }]) await assert.rejects(() => f.engine.request(f.c, f.body(extra)), error => error.status === 400 || error.code === "program_changed");
    await assert.rejects(() => f.engine.request(f.c, f.body({ actor: { role: "operator", email: f.c.owner.email } })), error => error.status === 403);
    await store.put("clients", f.c.slug, { ...f.c, setupProof: { reviewedRevision: "stale" } }); await assert.rejects(() => f.engine.request(f.c, f.body()), error => error.code === "desk_review_required"); f.c.setupProof={reviewedRevision:configurationRevision(f.c)};await store.put("clients", f.c.slug, f.c);
    const row = await f.engine.request(f.c, f.body()), raw = await strictRead("messaging_activation", row.id); assert.equal(raw.legal, undefined); assert.equal(raw.program, undefined); assert.ok(!JSON.stringify(raw).includes("921234567")); assert.ok(!JSON.stringify(row).includes("alex@example.test")); assert.ok(!JSON.stringify(row).includes("BU" + "2".repeat(32))); assert.equal(raw.privateData.version, 1); assert.equal(row.active, false); assert.equal(f.controls.claimed, 0);
    await assert.rejects(() => f.engine.request(f.c, f.body({ legal: { ...legal(), ein: "00" } })), error => error.status === 400); await assert.rejects(() => f.engine.request(f.c, f.body({ legal: { ...legal(), state: "ZZ" } })), error => error.status === 400);
  });
  await check(mode + ": filed customer program matches actual inbound-only conversation and written YES appointment authority", async () => {
    const f = await fixture(mode, "consent-contract"), program = sms.buildMessagingProgram(f.c), phone = "+17135550191";
    const permits = purpose => consent.mayDeliverManagedSMS(f.c, phone, purpose);
    assert.equal(await permits("reply"), false); assert.equal(await permits("confirmation"), false);
    const incoming = "SM" + hash(f.c.slug + ":question").slice(0, 32);
    await consent.recordManagedInbound(f.c, { phone, text: "Can you save a plumbing visit?", messageSid: incoming, providerDate: isoAt(clock) });
    assert.equal(await permits("reply"), true); assert.equal(await permits("confirmation"), false);
    const question = "SM" + hash(f.c.slug + ":ask").slice(0, 32);
    await consent.saveManagedConsentAsk(f.c, phone, { messageSid: question, sentAt: isoAt(clock), wording: consent.managedAppointmentConsentQuestion(f.c) });
    clock += 1000;
    await consent.recordManagedInbound(f.c, { phone, text: "YES", messageSid: "SM" + hash(f.c.slug + ":yes").slice(0, 32), providerDate: isoAt(clock) });
    for (const purpose of ["confirmation", "reminder_24h", "reminder_1h", "cancelled"]) assert.equal(await permits(purpose), true);
    for (const purpose of ["on_the_way", "review_request", "marketing"]) assert.equal(await permits(purpose), false);
    assert.match(program.messageFlow, /Customers first text/); assert.match(program.messageFlow, /direct replies in that conversation only/); assert.match(program.messageFlow, /separate written YES/i); assert.match(program.messageFlow, /including future visits/); assert.match(program.messageFlow, /ongoing_appointments_v2/); assert.match(program.messageFlow, /No texting consent is inferred from signup, a phone call, website chat, a missed call or merely providing a number/);
    assert.match(program.messageSamples[0], /saved/); assert.match(program.messageSamples[1], /reminder/); assert.match(program.messageSamples[2], /cancelled/); assert.ok(program.messageSamples.every(text => !/on the way|review|estimate|invoice/i.test(text)));
    const status = await advance(f), row = await strictRead("messaging_activation", status.id), campaign = remote.get(`https://messaging.twilio.com/v1/Services/${row.resources.service.sid}/Compliance/Usa2p/${row.resources.campaign.sid}`);
    assert.equal(campaign.us_app_to_person_usecase, "CUSTOMER_CARE"); assert.equal(campaign.message_flow, program.messageFlow); assert.deepEqual(campaign.message_samples, program.messageSamples); assert.equal(campaign.description, program.description);
    clock += 1000; await consent.recordManagedInbound(f.c, { phone, text: "STOP", messageSid: "SM" + hash(f.c.slug + ":stop").slice(0, 32), providerDate: isoAt(clock) });
    clock += 1000; await consent.recordManagedInbound(f.c, { phone, text: "START", messageSid: "SM" + hash(f.c.slug + ":restart").slice(0, 32), providerDate: isoAt(clock) });
    assert.equal(await permits("confirmation"), false); assert.match(program.optInMessage, /Appointment updates need a separate YES/);
  });
  await check(mode + ": duplicate tabs and concurrent workers create exactly one service and registration chain", async () => {
    const f = await fixture(mode, "once"), writes = result.providerWrites.length, rows = await Promise.all(Array.from({ length: 5 }, () => f.engine.request(f.c, f.body()))); assert.ok(rows.every(row => row.id === rows[0].id)); await Promise.all([f.engine.run(rows[0].id), f.engine.run(rows[0].id)]); assert.equal(result.providerWrites.slice(writes).filter(row => row.path === "/v1/Services").length, 1);
    const status = await advance(f); assert.equal(status.state, "awaiting_test"); assert.equal(status.active, false); const row = await strictRead("messaging_activation", status.id); assert.equal(Object.keys(row.resources).length, sms.MESSAGING_STEPS.length); assert.equal(f.controls.claimed, 1); assert.equal(result.providerWrites.slice(writes).filter(row => row.path === "/v1/a2p/BrandRegistrations").length, 1); assert.equal(result.providerWrites.slice(writes).filter(row => /\/Compliance\/Usa2p$/.test(row.path)).length, 1); assert.deepEqual(await strictRead("clients", f.c.slug), f.c);
    const outbound = "SM" + hash(row.id + "out").slice(0, 32), inbound = "SM" + hash(row.id + "in").slice(0, 32), root = `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/`;
    remote.set(root + outbound + ".json", { sid: outbound, account_sid: account, direction: "outbound-api", status: "sent", messaging_service_sid: row.resources.service.sid, from: row.number.number, to: row.probe.to, body: row.probe.body, date_created: isoAt(clock) });
    remote.set(root + inbound + ".json", { sid: inbound, account_sid: account, direction: "inbound", from: row.probe.to, to: row.number.number, body: row.probe.nonce, date_created: isoAt(clock) });
    await assert.rejects(() => f.engine.prove(f.c, { operationId: row.id, outboundMessageSid: outbound, inboundMessageSid: inbound }), error => error.code === "delivery_unconfirmed"); remote.get(root + outbound + ".json").status = "delivered";
    const ready = await f.engine.prove(f.c, { operationId: row.id, outboundMessageSid: outbound, inboundMessageSid: inbound }); assert.equal(ready.active, true); assert.equal(ready.state, "ready");
  });
  await check(mode + ": lost create response is correlated without a second create; partial lookup remains uncertain", async () => {
    const f = await fixture(mode, "lost"), row = await f.engine.request(f.c, f.body()), before = result.providerWrites.length; lose = { path: "/v1/Services", method: "POST" }; assert.equal((await f.engine.run(row.id)).state, "uncertain"); pagination = true; clock += 601000; assert.equal((await f.engine.run(row.id)).state, "uncertain"); pagination = false; clock += 601000; await f.engine.run(row.id); const saved = await strictRead("messaging_activation", row.id); assert.equal(saved.steps.service.state, "complete"); assert.equal(result.providerWrites.slice(before).filter(row => row.path === "/v1/Services").length, 1);
  });
  await check(mode + ': expired setup text requires fresh owner consent and renews once without registration writes',async()=>{
    const f=await fixture(mode,'probe-renewal'),status=await advance(f),id=status.id;
    let row=await strictRead('messaging_activation',id);const original=structuredClone(row);clock+=8*86400000;await f.engine.run(id);row=await strictRead('messaging_activation',id);
    const body={actor:{role:'owner',email:f.c.owner.email},expectedRevision:configurationRevision(f.c),operationId:id,expectedProbeNonce:row.probe.nonce,testPhoneConsent:true};
    await assert.rejects(()=>f.engine.renewProbe(f.c,{...body,testPhoneConsent:false}),e=>e.code==='probe_consent_required');
    await assert.rejects(()=>f.engine.renewProbe(f.c,{...body,actor:{role:'owner',email:'foreign@example.test'}}),e=>e.code==='forbidden');
    assert.equal((await f.engine.run(id)).customerAction,'renew_setup_text');
    const writes=result.providerWrites.length,results=await Promise.allSettled([f.engine.renewProbe(f.c,body),f.engine.renewProbe(f.c,body)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const saved=await strictRead('messaging_activation',id);assert.notEqual(saved.probe.nonce,original.probe.nonce);assert.equal(saved.probe.to,f.c.owner.phone);assert.equal(saved.probeHistory.length,1);assert.deepEqual(saved.probeHistory[0].body,original.probe.body);assert.deepEqual(saved.resources,original.resources);assert.equal(saved.submissionRevision,original.submissionRevision);assert.equal(result.providerWrites.length,writes);assert.equal(results.find(r=>r.status==='fulfilled').value.customerAction,'reply_to_setup_text');
    await assert.rejects(()=>f.engine.renewProbe(f.c,body),e=>e.code==='probe_changed');
  });
  await check(mode + ': an old proof finishing after expiry and renewal cannot verify the fresh nonce',async()=>{
    const f=await fixture(mode,'probe-proof-race'),status=await advance(f),id=status.id,row=await strictRead('messaging_activation',id),outbound='SM'+hash(id+'race-out').slice(0,32),inbound='SM'+hash(id+'race-in').slice(0,32),root=`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/`;
    remote.set(root+outbound+'.json',{sid:outbound,account_sid:account,direction:'outbound-api',status:'delivered',messaging_service_sid:row.resources.service.sid,from:row.number.number,to:row.probe.to,body:row.probe.body,date_created:isoAt(clock)});
    remote.set(root+inbound+'.json',{sid:inbound,account_sid:account,direction:'inbound',from:row.probe.to,to:row.number.number,body:row.probe.nonce,date_created:isoAt(clock)});
    const originalVerify=f.controls.provider.verifyProbe.bind(f.controls.provider);let reached,release;const arrival=new Promise(r=>reached=r),hold=new Promise(r=>release=r);f.controls.provider.verifyProbe=async(...args)=>{const verified=await originalVerify(...args);assert.equal(verified,true);reached();await hold;return verified;};
    const pending=f.engine.prove(f.c,{operationId:id,outboundMessageSid:outbound,inboundMessageSid:inbound});await arrival;clock+=8*86400000;await f.engine.run(id);
    await f.engine.renewProbe(f.c,{actor:{role:'owner',email:f.c.owner.email},expectedRevision:configurationRevision(f.c),operationId:id,expectedProbeNonce:row.probe.nonce,testPhoneConsent:true});release();await assert.rejects(()=>pending,e=>e.code==='proof_unavailable');assert.equal(!!(await strictRead('messaging_activation',id)).deliveryProof,false);
  });
  for(const held of [false,true])await check(mode + ': renewed proof rejects changed current mobile review and revision '+(held?'after held provider verification':'before provider verification'),async()=>{
    for(const kind of ['mobile','review','revision']){
      const f=await fixture(mode,'late-proof-'+kind+(held?'-held':'')),status=await advance(f),id=status.id;clock+=8*86400000;await f.engine.run(id);let row=await strictRead('messaging_activation',id);
      await f.engine.renewProbe(f.c,{actor:{role:'owner',email:f.c.owner.email},expectedRevision:configurationRevision(f.c),operationId:id,expectedProbeNonce:row.probe.nonce,testPhoneConsent:true});row=await strictRead('messaging_activation',id);
      const outbound='SM'+hash(id+'late-out').slice(0,32),inbound='SM'+hash(id+'late-in').slice(0,32),root=`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/`,ids={operationId:id,outboundMessageSid:outbound,inboundMessageSid:inbound};
      remote.set(root+outbound+'.json',{sid:outbound,account_sid:account,direction:'outbound-api',status:'delivered',messaging_service_sid:row.resources.service.sid,from:row.number.number,to:row.probe.to,body:row.probe.body,date_created:isoAt(clock)});
      remote.set(root+inbound+'.json',{sid:inbound,account_sid:account,direction:'inbound',from:row.probe.to,to:row.number.number,body:row.probe.nonce,date_created:isoAt(clock)});
      let release,pending;
      if(held){const original=f.controls.provider.verifyProbe.bind(f.controls.provider);let reached;const arrival=new Promise(r=>reached=r),hold=new Promise(r=>release=r);f.controls.provider.verifyProbe=async(...args)=>{const valid=await original(...args);assert.equal(valid,true);reached();await hold;return valid;};pending=f.engine.prove(f.c,ids);await arrival;}
      const changed=structuredClone(f.c);if(kind==='mobile')changed.owner.phone='+17135550188';if(kind==='revision')changed.summary='Current reviewed owner instructions';const revision=configurationRevision(changed);changed.setupProof={reviewedRevision:kind==='review'?'stale':revision,testedRevision:revision,testMode:'live'};await store.put('clients',f.c.slug,changed);
      if(held)release();await assert.rejects(()=>held?pending:f.engine.prove(f.c,ids),e=>e.code==='proof_unavailable');const saved=await strictRead('messaging_activation',id);assert.equal(saved.state,'awaiting_test');assert.equal(!!saved.deliveryProof,false);assert.equal(saved.probe.nonce,row.probe.nonce);
    }
  });
  await check(mode + ': renewal cannot replace ready cancelled uncertain stale-carrier or claimed registrations',async()=>{
    const f=await fixture(mode,'probe-renewal-guards'),status=await advance(f),id=status.id;clock+=8*86400000;await f.engine.run(id);const original=await strictRead('messaging_activation',id),body={actor:{role:'owner',email:f.c.owner.email},expectedRevision:configurationRevision(f.c),operationId:id,expectedProbeNonce:original.probe.nonce,testPhoneConsent:true},writes=result.providerWrites.length;
    for(const patch of [{state:'ready'},{state:'cancelled'},{state:'uncertain'},{cancelRequestedAt:isoAt(clock)},{claim:{token:'live',until:isoAt(clock+60000)}},{claim:{token:'f'.repeat(32),until:'unparseable'}},{approvals:{...original.approvals,campaign:'REJECTED'}},{lastVerifiedAt:isoAt(clock-2*86400000)},{steps:{...original.steps,service:{state:'uncertain'}}},{resources:{...original.resources,service:{...original.resources.service,accountSid:'AC'+'f'.repeat(32)}}}]){await store.put('messaging_activation',id,{...original,...patch});await assert.rejects(()=>f.engine.renewProbe(f.c,body),e=>['probe_changed','probe_verification_required'].includes(e.code));}
    await store.put('messaging_activation',id,original);f.controls.enabled=false;await assert.rejects(()=>f.engine.renewProbe(f.c,body),e=>e.code==='messaging_setup_unavailable');f.controls.enabled=true;
    await assert.rejects(()=>f.engine.renewProbe(f.c,{...body,expectedRevision:'0'.repeat(64)}),e=>e.code==='configuration_changed');assert.equal(result.providerWrites.length,writes);assert.deepEqual((await strictRead('messaging_activation',id)).probe,original.probe);
  });
  await check(mode + ': dependency reads cannot approve a stale mobile or rules review during renewal',async()=>{
    for(const kind of ['mobile','review']){
      const f=await fixture(mode,'probe-race-'+kind),status=await advance(f),id=status.id;clock+=8*86400000;await f.engine.run(id);const original=await strictRead('messaging_activation',id),body={actor:{role:'owner',email:f.c.owner.email},expectedRevision:configurationRevision(f.c),operationId:id,expectedProbeNonce:original.probe.nonce,testPhoneConsent:true};let reads=0;
      f.controls.onParentRead=async()=>{if(++reads===2){const changed=structuredClone(f.c);if(kind==='mobile')changed.owner.phone='+17135550188';else changed.setupProof={...changed.setupProof,reviewedRevision:'stale'};await store.put('clients',f.c.slug,changed);}};
      await assert.rejects(()=>f.engine.renewProbe(f.c,body),e=>['configuration_changed','desk_review_required'].includes(e.code));assert.deepEqual((await strictRead('messaging_activation',id)).probe,original.probe);
    }
  });
  for (const loss of ["before", "after"]) await check(mode + ": lost paid brand request " + loss + " remote effect is never blindly refiled", async () => {
    const f = await fixture(mode, "paid-" + loss), row = await f.engine.request(f.c, f.body());
    for (let n = 0; n < 25; n++) { const saved = await strictRead("messaging_activation", row.id); if (saved.steps.submit_trust?.state === "complete") break; clock += 601000; await f.engine.run(row.id); }
    const writes = result.providerWrites.length; if (loss === "before") rejectBefore = "/v1/a2p/BrandRegistrations"; else lose = { path: "/v1/a2p/BrandRegistrations", method: "POST" };
    clock += 601000; assert.equal((await f.engine.run(row.id)).state, "uncertain"); for (let n = 0; n < 3; n++) { clock += 601000; await f.engine.run(row.id); }
    const saved = await strictRead("messaging_activation", row.id); assert.equal(result.providerWrites.slice(writes).filter(value => value.path === "/v1/a2p/BrandRegistrations").length, 1); assert.equal(saved.steps.brand.state, loss === "after" ? "complete" : "uncertain");
  });
  await check(mode + ": encrypted tenant-bound legal payload rejects tampering without a provider write", async () => {
    const f = await fixture(mode, "cipher"), row = await f.engine.request(f.c, f.body()), original = await strictRead("messaging_activation", row.id), before = result.providerWrites.length;
    await store.put("messaging_activation", row.id, { ...original, privateData: { ...original.privateData, tag: Buffer.alloc(16, 0).toString("base64") } }); assert.equal((await f.engine.run(row.id)).state, "blocked"); assert.equal(result.providerWrites.length, before); await store.put("messaging_activation", row.id, original);
  });
  await check(mode + ": cancellation racing an in-flight service creation retains its receipt then cleans up", async () => {
    const f = await fixture(mode, "race"), row = await f.engine.request(f.c, f.body()), writes = result.providerWrites.length; let release, started; const began = new Promise(resolve => { started = resolve; }); const originalExecute = f.controls.provider.execute; f.controls.provider.execute = async value => { started(); return originalExecute(value); }; blockedWrite = new Promise(resolve => { release = resolve; }); const running = f.engine.run(row.id); await began; await f.engine.cancel(f.c, row.id, f.body()); release(); blockedWrite = null; await running; const after = await strictRead("messaging_activation", row.id); assert.equal(after.state, "cancel_pending"); assert.ok(after.resources.service); clock += 601000; assert.equal((await f.engine.run(row.id)).state, "cancelled"); assert.equal(f.controls.cleared, 1); assert.equal(result.providerWrites.slice(writes).filter(value => value.method === "POST" && value.path === "/v1/Services").length, 1);
  });
  await check(mode + ": lost parent dependency claim response still permits confirmed cleanup without orphaning the number", async () => {
    const f = await fixture(mode, "parent-claim"), row = await f.engine.request(f.c, f.body()), before = result.providerWrites.length; f.controls.failParentReceipt = true;
    assert.equal((await f.engine.run(row.id)).state, "blocked"); assert.equal(f.controls.claimed, 1); assert.ok((await strictRead("messaging_activation", row.id)).parentClaimStartedAt); assert.equal(result.providerWrites.length, before); await f.engine.cancel(f.c, row.id, f.body()); clock += 601000; assert.equal((await f.engine.run(row.id)).state, "cancelled"); assert.equal(f.controls.cleared, 1);
  });
  if (mode === "sdk") await check("sdk: remote service effect with failed result storage recovers from its durable dispatch marker", async () => {
    const f = await fixture(mode, "store-loss"), row = await f.engine.request(f.c, f.body()), before = result.providerWrites.length; rejectReceiptKey = row.id;
    assert.equal((await f.engine.run(row.id)).state, "uncertain"); rejectReceiptKey = null; clock += 601000; await f.engine.run(row.id); assert.equal((await strictRead("messaging_activation", row.id)).steps.service.state, "complete"); assert.equal(result.providerWrites.slice(before).filter(value => value.path === "/v1/Services").length, 1);
  });
  await check(mode + ": campaign waits for approved brand and keeps rejected campaign IDs for correction", async () => {
    const f = await fixture(mode, "approval"); autoApprove = false; const requested = await f.engine.request(f.c, f.body()); let row;
    for (let n = 0; n < 30; n++) { clock += 601000; const status = await f.engine.run(requested.id); if (status.state === "awaiting_approval") break; }
    row = await strictRead("messaging_activation", requested.id); assert.ok(row.resources.brand); assert.equal(row.resources.campaign, undefined); const brandPath = "https://messaging.twilio.com/v1/a2p/BrandRegistrations/" + row.resources.brand.sid; remote.get(brandPath).status = "APPROVED";
    autoApprove = true; await advance(f); row = await strictRead("messaging_activation", requested.id); const original = Object.fromEntries(Object.entries(row.resources).map(([name, value]) => [name, value.sid])), campaignPath = `https://messaging.twilio.com/v1/Services/${row.resources.service.sid}/Compliance/Usa2p/${row.resources.campaign.sid}`; remote.get(campaignPath).campaign_status = "FAILED"; clock += 601000; assert.equal((await f.engine.run(requested.id)).state, "needs_action");
    const corrected = await f.engine.correct(f.c, f.body({ operationId: row.id, expectedSubmissionRevision: 1, legal: { ...legal(), legalName: "Corrected Fixture LLC" } })); assert.equal(corrected.submissionRevision, 2); const writes = result.providerWrites.length; let stopped;
    for(let n=0;n<40;n++){clock+=601000;stopped=await f.engine.run(row.id);if(stopped.reasonCode==='resource_paid_correction_unapproved')break;}
    assert.equal(stopped.state,'waiting_platform');assert.equal(stopped.reasonCode,'resource_paid_correction_unapproved');
    const final = await strictRead("messaging_activation", requested.id);assert.equal(final.steps.correct_campaign.state,'pending');assert.equal(final.claim,null);
    for (const [name, sid] of Object.entries(original)) if (!name.startsWith("evaluate_")) assert.equal(final.resources[name].sid, sid); else assert.ok(final.resourceHistory.some(receipt => receipt.name === name && receipt.sid === sid)); assert.equal(result.providerWrites.slice(writes).filter(row => row.path === "/v1/a2p/BrandRegistrations" || /\/Compliance\/Usa2p(?:\/QE[a-f0-9]{32})?$/.test(row.path)).length, 0);
  });
  await check(mode + ": parent cancellation, lost cleanup response and gate-off preserve receipts until confirmed cleanup", async () => {
    const f = await fixture(mode, "cancel"), row = await advance(f), saved = await strictRead("messaging_activation", row.id); f.controls.cancelled = true; f.controls.enabled = false; assert.equal((await f.engine.run(row.id)).state, "cancel_pending"); assert.equal(f.controls.cleared, 0); f.controls.enabled = true;
    lose = { path: `/v1/Services/${saved.resources.service.sid}/Compliance/Usa2p/${saved.resources.campaign.sid}`, method: "DELETE" }; clock += 601000; assert.equal((await f.engine.run(row.id)).state, "cancel_pending"); assert.ok((await strictRead("messaging_activation", row.id)).resources.campaign.sid); clock += 601000; assert.equal((await f.engine.run(row.id)).state, "cancelled"); assert.equal(f.controls.cleared, 1); assert.ok(remote.has(f.phonePath)); assert.equal((await strictRead("messaging_activation", row.id)).resources.service.sid, saved.resources.service.sid);
  });
  await check(mode + ": foreign tenant, archived and paused customers cannot dispatch or become ready", async () => {
    const f = await fixture(mode, "states"), row = await f.engine.request(f.c, f.body()), before = result.providerWrites.length;
    await store.put("clients", f.c.slug, { ...f.c, status: "paused" }); assert.equal((await f.engine.run(row.id)).state, "paused"); assert.equal(result.providerWrites.length, before); await store.put("clients", f.c.slug, { ...f.c, ownerKey: "other-tenant" }); assert.equal((await f.engine.run(row.id)).state, "blocked"); assert.equal(result.providerWrites.length, before); await assert.rejects(() => f.engine.cancel(f.c, row.id, f.body()), error => error.code === "workspace_unavailable");
    const a = await fixture(mode, "archive"), ar = await a.engine.request(a.c, a.body()); await store.put("clients", a.c.slug, { ...a.c, status: "archived" }); assert.equal((await a.engine.run(ar.id)).state, "cancelled"); assert.equal(a.controls.claimed, 0);
  });
}
const isoAt = time => new Date(time).toISOString();
await suite("memory"); await suite("sdk");
await check("bounded recovery advances no more than three checkpoints for one customer", async () => { process.env.MC_MEMORY_STORE = "1"; const f = await fixture("batch", "bounded"), row = await f.engine.request(f.c, f.body()), before = result.providerWrites.length; await store.put("messaging_activation_queue", "cursor_v1", { after: f.c.slug + "/" }); const resultOfRun = await f.engine.recover({ limit: 1 }); assert.equal(resultOfRun.processed, 1); assert.equal(result.providerWrites.length - before, 3); assert.equal((await strictRead("messaging_activation", row.id)).steps.business.state, "complete"); assert.equal((await strictRead("messaging_activation", row.id)).steps.representative, undefined); });
await check("production exports bind exact owned number, gate probes, recheck current customer and preserve STOP routing while paused", async () => {
  process.env.MC_MEMORY_STORE = "1"; const f = await fixture("public", "exports"), status = await advance(f), row = await strictRead("messaging_activation", status.id);
  Object.assign(process.env, { MESSAGING_ACTIVATION_ENABLED: "true", MESSAGING_ACTIVATION_APPROVED_VERSION: row.offer.version, MESSAGING_ACTIVATION_OFFER_JSON: JSON.stringify(row.offer), SERVICE_DELIVERY_ENABLED: "true", SERVICE_WORKER_KEY: "fixture-service-worker-secret-long-enough" });
  assert.equal((await sms.messagingActivationStatus(f.c)).available, true); assert.equal(await sms.messagingSender(f.c), null); const probe = await sms.pendingMessagingProbe(f.c); assert.equal(probe.nonce, row.probe.nonce); assert.equal((await sms.findMessagingClientByNumber(row.number.number)).slug, f.c.slug);
  const outbound = "SM" + hash(row.id + "out").slice(0, 32), inbound = "SM" + hash(row.id + "in").slice(0, 32), root = `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/`;
  remote.set(root + outbound + ".json", { sid: outbound, account_sid: account, direction: "outbound-api", status: "delivered", messaging_service_sid: row.resources.service.sid, from: row.number.number, to: row.probe.to, body: row.probe.body, date_created: isoAt(clock) }); remote.set(root + inbound + ".json", { sid: inbound, account_sid: account, direction: "inbound", from: row.probe.to, to: row.number.number, body: row.probe.nonce, date_created: isoAt(clock) });
  assert.equal((await sms.recordMessagingProbe(f.c, { operationId: row.id, outboundMessageSid: outbound, inboundMessageSid: inbound })).active, true); assert.equal((await sms.messagingSender(f.c)).serviceSid, row.resources.service.sid);
  await store.put("health", "brake", { on: true }); const beforeBrake = result.providerWrites.length; assert.equal(await sms.messagingSender(f.c), null); assert.equal((await sms.messagingActivationStatus(f.c)).active, false); assert.equal((await sms.continueMessagingActivation(f.c)).state, "waiting_platform"); assert.equal(result.providerWrites.length, beforeBrake); await store.put("health", "brake", { on: false }); clock += 601000; assert.equal((await sms.continueMessagingActivation(f.c)).state, "ready");
  await store.put("clients", f.c.slug, { ...f.c, status: "paused" }); assert.equal(await sms.messagingSender(f.c), null); assert.equal(await sms.pendingMessagingProbe(f.c), null); assert.equal((await sms.findMessagingClientByNumber(row.number.number)).status, "paused"); const inboundBinding = await sms.messagingInboundBinding(f.c); assert.equal(inboundBinding.serviceSid, row.resources.service.sid); assert.equal(inboundBinding.numberSid, row.number.sid); assert.equal(inboundBinding.since, row.createdAt); assert.equal(await sms.messagingInboundBinding({ ...f.c, ownerKey: "foreign-tenant" }), null); await store.put("clients", f.c.slug, f.c);
  clock += 24 * 3600000 + 60000; assert.equal(await sms.messagingSender(f.c), null); assert.equal((await sms.continueMessagingActivation(f.c)).state, "ready"); assert.ok(await sms.messagingSender(f.c));
  clock = Date.parse(row.offer.expiresAt) + 60000; assert.equal((await sms.messagingActivationStatus(f.c)).available, false); await assert.rejects(() => sms.requestMessagingActivation(f.c, f.body()), error => error.code === "messaging_setup_unavailable"); assert.equal((await sms.continueMessagingActivation(f.c)).state, "ready"); assert.ok(await sms.messagingSender(f.c));
  await sms.cancelMessagingActivation(f.c, row.id, f.body()); assert.equal((await sms.continueMessagingActivation(f.c)).state, "cancelled"); assert.equal(await sms.messagingSender(f.c), null); assert.equal((await sms.messagingCleanupStatus(f.c)).blocksRelease, false);
  for (const name of Object.keys(process.env)) if (/^(MESSAGING_|SERVICE_)/.test(name)) delete process.env[name];
});
await check("production gate, encrypted storage requirement and scheduler default stay closed", async () => { process.env.MC_MEMORY_STORE = "1"; const f = await fixture("prod", "off"); await assert.rejects(() => sms.requestMessagingActivation(f.c, f.body()), error => error.code === "messaging_setup_unavailable"); const worker = await import("../netlify/functions/messaging-activation-scheduler.mjs"); assert.equal(worker.config.schedule, "*/10 * * * *"); const receipt = await worker.runMessagingActivationRecovery(); assert.equal(receipt.enabled, false); assert.equal(receipt.processed, 0); assert.equal(receipt.ok, false); delete process.env.PLATFORM_DATA_ENCRYPTION_KEY; await assert.rejects(() => f.engine.request(f.c, f.body()), error => error.code === "private_storage_unavailable"); });
await check("adapter cannot execute a raw call with product gate closed", async () => { const adapter = createTwilioMessagingAdapter({ executionAllowed: () => false }), before = result.providerWrites.length; await assert.rejects(() => adapter.preflight({ number: { sid: "PN" + "9".repeat(32) } })); assert.equal(result.providerWrites.length, before); });
result.sourceAfter = sourceHashes(); assert.deepEqual(result.sourceAfter, result.sourceBefore); result.passed = result.checks.filter(row => row.pass).length; result.total = result.checks.length; result.ok = result.passed === result.total && result.blockedNetwork.length === 0;
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result)); if (!result.ok) process.exitCode = 1;
