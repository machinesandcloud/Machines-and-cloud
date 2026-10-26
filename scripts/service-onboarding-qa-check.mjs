// Independent QA of actual client/service onboarding handlers. All credentials
// are synthetic; every allowed provider response is produced locally. No email,
// model, browser, provider or physical network connection is permitted here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const outIndex = process.argv.indexOf('--output');
const output = outIndex < 0 ? null : process.argv[outIndex + 1];
if (output && (!/^scratchpad\/service-onboarding-qa-[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error('Choose a new service-onboarding QA receipt.');
const sha = value => createHash('sha256').update(value).digest('hex');
const files = ['netlify/functions/lib/service-onboarding.mjs', 'netlify/functions/client.mjs', 'netlify/functions/onboard.mjs', 'netlify/functions/access.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/service-activation-background.mjs', 'netlify/functions/service-onboarding-background.mjs', 'netlify/functions/service-onboarding-scheduler.mjs', 'netlify/functions/phone-activation-scheduler.mjs', 'netlify/functions/lib/phone-activation.mjs', 'netlify/functions/lib/voice-activation.mjs', 'netlify/functions/lib/messaging-activation.mjs'];
const hashes = () => Object.fromEntries(files.filter(existsSync).map(file => [file, sha(readFileSync(file))]));
const report = { at: new Date().toISOString(), scope: 'Actual API handlers and production orchestration/child modules with isolated memory storage and intercepted synthetic number-provider HTTP. This proves durable intent/continuation and authority, not real provider service delivery.', sourceBefore: hashes(), checks: [], attemptedNetwork: [], providerRequests: [], backgroundRequests: [] };
for (const key of Object.keys(process.env)) if (/^(MC_|TWILIO_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|PLATFORM_|WORKSPACE_|ADMIN_)/.test(key)) delete process.env[key];
const origin = 'http://127.0.0.1:8897';
Object.assign(process.env, { NODE_ENV: 'test', MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', URL: origin, PUBLIC_SITE_URL: origin });
const deny = (destination = 'physical socket') => { report.attemptedNetwork.push(String(destination).slice(0, 100)); throw new Error('Independent QA physical networking is disabled.'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
net.Socket.prototype.connect = deny;
syncBuiltinESMExports();
const RealDate = Date;
let now = RealDate.now(), clockIncrement = 0;
globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { const value = now; now += clockIncrement; return value; } };
const accountSid = 'AC' + 'a'.repeat(32), primarySid = 'BU' + 'b'.repeat(32), remoteNumbers = new Map();
let serial = 0, numberLoss = null, holdNumber = null;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || 'GET').toUpperCase();
  if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) {
    report.backgroundRequests.push({ method, path: url.pathname });
    return new Response(null, { status: 202 });
  }
  if (!['https://api.twilio.com', 'https://pricing.twilio.com'].includes(url.origin)) return deny(url.origin + url.pathname);
  report.providerRequests.push({ method, origin: url.origin, path: url.pathname });
  if (url.origin === 'https://pricing.twilio.com' && method === 'GET') return Response.json({ price_unit: 'USD', phone_number_prices: [{ number_type: 'local', current_price: '1.15' }] });
  assert.ok(url.pathname.startsWith('/2010-04-01/Accounts/' + accountSid + '/'));
  const auth = new Headers(init.headers).get('authorization');
  assert.equal(auth, 'Basic ' + Buffer.from(accountSid + ':qa-synthetic-twilio-token').toString('base64'));
  if (url.pathname.endsWith('/AvailablePhoneNumbers/US/Local.json') && method === 'GET') return Response.json({ available_phone_numbers: [{ phone_number: '+17135550199', capabilities: { voice: true, sms: true }, address_requirements: 'none' }] });
  if (url.pathname.endsWith('/IncomingPhoneNumbers.json')) {
    if (method === 'GET') return Response.json({ incoming_phone_numbers: [...remoteNumbers.values()].filter(row => row.friendly_name === url.searchParams.get('FriendlyName')), next_page_uri: null });
    assert.equal(method, 'POST');
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('PhoneNumber'), '+17135550199');
    assert.equal(form.has('VoiceUrl'), false);
    assert.equal(form.has('SmsUrl'), false);
    if (holdNumber) await holdNumber;
    if (numberLoss === 'before') throw new Error('Synthetic number request lost before effect.');
    const sid = 'PN' + sha(form.get('FriendlyName')).slice(0, 32), row = { sid, account_sid: accountSid, phone_number: '+17135550199', friendly_name: form.get('FriendlyName') };
    remoteNumbers.set(sid, row);
    if (numberLoss === 'after') throw new Error('Synthetic number result lost after effect.');
    return Response.json(row, { status: 201, headers: { 'twilio-request-id': 'qa-synthetic-request' } });
  }
  const sid = url.pathname.split('/').at(-1).replace(/\.json$/, ''), row = remoteNumbers.get(sid);
  if (method === 'GET') return row ? Response.json(row) : new Response(null, { status: 404 });
  if (method === 'DELETE') { remoteNumbers.delete(sid); return new Response(null, { status: 204 }); }
  throw new Error('Unexpected locally intercepted provider route: ' + method + ' ' + url.pathname);
};

const store = await import('../netlify/functions/lib/store.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const { strictRead } = await import('../netlify/functions/lib/accounts.mjs');
const phone = await import('../netlify/functions/lib/phone-activation.mjs');
const voice = await import('../netlify/functions/lib/voice-activation.mjs');
const messaging = await import('../netlify/functions/lib/messaging-activation.mjs');
const onboarding = await import('../netlify/functions/lib/service-onboarding.mjs');
const clientHandler = (await import('../netlify/functions/client.mjs')).default;
const accessHandler = (await import('../netlify/functions/access.mjs')).default;
const onboardHandler = (await import('../netlify/functions/onboard.mjs')).default;
const activationHandler = (await import('../netlify/functions/service-activation-background.mjs')).default;
const onboardingWorker = (await import('../netlify/functions/service-onboarding-background.mjs')).default;
const { runServiceOnboardingRecovery, config: serviceRecoveryConfig } = await import('../netlify/functions/service-onboarding-scheduler.mjs');
const { runPhoneActivationRecovery } = await import('../netlify/functions/phone-activation-scheduler.mjs');

const check = async (name, run) => {
  try {
    for (const kind of ['clients', 'access_sessions', 'index', 'health', 'service_onboarding_intents', 'service_onboarding_queue', 'phone_activation_intents', 'phone_activation_queue', 'phone_activation_resources', 'voice_activation_intents', 'voice_activation_queue', 'managed_voice_callbacks', 'messaging_activation', 'messaging_activation_queue']) for (const key of await store.list(kind)) await store.del(kind, key);
    remoteNumbers.clear();
    await run(); report.checks.push({ name, pass: true });
  }
  catch (error) { report.checks.push({ name, pass: false, error: error.message, stack: error.stack }); }
  finally { numberLoss = null; holdNumber = null; clockIncrement = 0; }
};
function policies() {
  return {
    number: { version: 'qa_number_v1', scope: 'number_acquisition_only', country: 'US', areaCode: '713', currency: 'USD', oneTimeCents: 0, monthlyCents: 115, maxAcquisitionCents: 115, expiresAt: new Date(now + 10 * 86400000).toISOString(), authorityText: 'I am authorized to reserve this business number and accept the disclosed recurring cost until release is confirmed.' },
    voice: { version: 'qa_voice_v1', model: 'claude-sonnet-4-5', maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, accountDailyCalls: 30, accountDailyMinutes: 150, authorityText: 'I am authorized to connect answering for this business and approve the reviewed routing and usage.', usageDisclosure: 'Synthetic QA phone usage terms. No real call or provider charge is authorized.' },
    sms: { version: 'qa_sms_v1', scope: 'a2p_customer_care', country: 'US', currency: 'USD', brandRegistrationCents: 4400, campaignRegistrationCents: 1500, campaignMonthlyCents: 1000, resubmissionCents: 1500, maxResubmissions: 1, usageDisclosure: 'Synthetic QA texting usage terms. No real message, filing or charge is authorized.', authorityText: 'I am authorized to register the reviewed business texting program and accept the disclosed registration costs.', feeScheduleUrl: 'https://fees.example.test/qa', expiresAt: new Date(now + 10 * 86400000).toISOString() }
  };
}
function configure(open = true) {
  const p = policies();
  // Explicit synthetic admission for this intercepted setup cohort. The same
  // durable ledger is retained across configure calls and policy edits.
  process.env.MANAGED_RESOURCE_ADMISSION_APPROVED_VERSION = 'qa_resource_v1';
  process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON = JSON.stringify({ version: 'qa_resource_v1', expiresAt: new Date(now + 10 * 86400000).toISOString(), mode: 'self_service', providerAccountHash: sha(accountSid), currency: 'USD', rateBasis: 'configured_upper_bound', rateSource: 'https://fees.example.test/synthetic-qa-resource-bounds', bounds: { numberSetupCents: p.number.oneTimeCents, numberMonthlyCents: p.number.monthlyCents, brandSetupCents: p.sms.brandRegistrationCents, campaignSetupCents: p.sms.campaignRegistrationCents, campaignMonthlyCents: p.sms.campaignMonthlyCents }, accountLimits: { numbers: 100, brands: 100, campaigns: 100, setupCents: 1000000, monthlyCents: 1000000 }, tenantLimits: { numbers: 1, brands: 1, campaigns: 1, setupCents: 5900, monthlyCents: 1115 }, tenants: [] });
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: 'qa-synthetic-twilio-token', TWILIO_PRIMARY_PROFILE_SID: primarySid, VAPI_API_KEY: 'qa-synthetic-vapi-key', VAPI_WEBHOOK_SECRET: 'q'.repeat(48), SERVICE_WORKER_KEY: 'w'.repeat(48), PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'), PHONE_ACTIVATION_OFFER_JSON: JSON.stringify(p.number), PHONE_ACTIVATION_APPROVED_VERSION: p.number.version, VOICE_ACTIVATION_POLICY_JSON: JSON.stringify(p.voice), VOICE_ACTIVATION_APPROVED_VERSION: p.voice.version, MESSAGING_ACTIVATION_OFFER_JSON: JSON.stringify(p.sms), MESSAGING_ACTIVATION_APPROVED_VERSION: p.sms.version, VOICE_FALLBACK_TWIML_URL: 'https://handler.twilio.com/twiml/EH' + 'e'.repeat(32) });
  for (const name of ['PHONE_ACQUISITION_ENABLED', 'VOICE_ACTIVATION_ENABLED', 'MESSAGING_ACTIVATION_ENABLED', 'SERVICE_DELIVERY_ENABLED']) process.env[name] = open ? 'true' : 'false';
  return p;
}
async function fixture(label = 'normal') {
  const slug = 'qa-auto-' + label + '-' + (++serial), token = sha('fixture-session:' + slug);
  const c = newClient({ slug, ownerKey: 'qa-private-key-' + slug, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'QA Service Shop', trade: 'plumbing', city: 'Houston', website: 'https://shop.example.test', serviceArea: ['Houston'], hours: 'Mon-Fri 8am to 5pm' } });
  Object.assign(c, { onboarding: { version: 1, desiredChannels: ['voice', 'sms'] }, status: 'testing', build: { status: 'built', source: 'owner_answers' }, services: ['Plumbing repairs'], windows: ['8 to 12', '12 to 5'] });
  c.phone.businessNumber = '+17135550197';
  c.rules.hours = { mon: { open: '08:00', close: '17:00' }, tue: { open: '08:00', close: '17:00' }, wed: { open: '08:00', close: '17:00' }, thu: { open: '08:00', close: '17:00' }, fri: { open: '08:00', close: '17:00' }, sat: null, sun: null };
  const revision = configurationRevision(c);
  c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: 'live' };
  await store.put('clients', slug, c);
  await store.put('access_sessions', sha(token), { email: c.owner.email, scope: 'onboarding', status: 'active', createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 2 * 3600000).toISOString() });
  return { c, token, revision };
}
const legal = () => ({ legalName: 'QA Synthetic Service LLC', ein: '92-1234567', businessType: 'llc', street: '123 Fixture Street', street2: '', city: 'Houston', state: 'TX', zip: '77057', website: 'https://shop.example.test', representative: { firstName: 'Alex', lastName: 'Fixture', email: 'qa-representative@example.test', phone: '+17135550198', title: 'Owner', jobPosition: 'CEO' } });
async function clientRequest(f, body, { token = f.token, slug = f.c.slug } = {}) {
  const response = await clientHandler(new Request(origin + '/api/client?c=' + slug, { method: body ? 'POST' : 'GET', headers: { origin, authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { status: response.status, data: await response.json() };
}

async function acceptance(f, extra = {}) {
  const status = await onboarding.serviceOnboardingStatus(f.c);
  assert.ok(status.offer, 'The fixture must expose a concrete reviewed offer.');
  return { expectedRevision: f.revision, submissionId: sha('qa-submit:' + f.c.slug + ':' + f.revision), offerDigest: status.offer.digest, acceptedCosts: true, authority: true,
    ...(f.c.onboarding.desiredChannels.includes('voice') ? { forwardingMode: 'forward_business_line' } : {}),
    ...(f.c.onboarding.desiredChannels.includes('sms') ? { legal: legal(), attestLegalAccuracy: true, attestConsent: true, testPhoneConsent: true } : {}), ...extra };
}
const actor = f => ({ role: 'owner', email: f.c.owner.email });
const submit = async (f, extra = {}) => onboarding.requestServiceOnboarding(f.c, { ...await acceptance(f), actor: actor(f), ...extra });
const cancel = f => onboarding.cancelServiceOnboarding(f.c, { actor: actor(f), expectedRevision: configurationRevision(f.c) });
async function children(f) {
  const c = await strictRead('clients', f.c.slug);
  const [number, v, sms] = await Promise.all([phone.phoneActivationStatus(c), voice.voiceActivationStatus(c), messaging.messagingActivationStatus(c)]);
  return { number: number.operation, voice: v.operation, messaging: sms.operation };
}
async function continuePlan(f) {
  const c = await strictRead('clients', f.c.slug);
  return onboarding.continueServiceOnboarding(c, { deadlineAt: now + 14000 });
}
function numberPurchases(since = 0) { return report.providerRequests.slice(since).filter(row => row.method === 'POST' && row.path.endsWith('/IncomingPhoneNumbers.json')).length; }
async function fresh(label, channels = ['voice', 'sms']) {
  configure(true);
  const f = await fixture(label);
  f.c.onboarding.desiredChannels = channels;
  await store.put('clients', f.c.slug, f.c);
  return f;
}
async function advanceNumber(f) {
  await continuePlan(f);
  for (let n = 0; n < 5; n++) {
    await phone.recoverPhoneActivations({ limit: 1, deadlineAt: now + 14000 });
    await continuePlan(f);
    const state = await children(f);
    if (state.number?.state === 'number_acquired') return state;
    now += 601000;
  }
  throw new Error('Synthetic number did not reach durable number_acquired.');
}

await check('Closed common number gate blocks setup; a closed child never authorizes stale full-scope acceptance', async () => {
  for (const gate of ['PHONE_ACQUISITION_ENABLED', 'VOICE_ACTIVATION_ENABLED', 'MESSAGING_ACTIVATION_ENABLED', 'SERVICE_DELIVERY_ENABLED']) {
    const f = await fresh('gate'), body = await acceptance(f), before = report.providerRequests.length;
    process.env[gate] = 'false';
    const status = await onboarding.serviceOnboardingStatus(f.c);
    if (gate === 'PHONE_ACQUISITION_ENABLED') {
      assert.equal(status.available, false);
      assert.equal(status.offer, null);
    } else {
      assert.equal(status.available, true);
      assert.deepEqual(status.offer.scopeChannels, gate === 'VOICE_ACTIVATION_ENABLED' ? ['sms'] : ['voice']);
      assert.deepEqual(status.acceptedChannels, []);
    }
    await assert.rejects(() => onboarding.requestServiceOnboarding(f.c, { ...body, actor: actor(f) }), error => error.status >= 400 && error.status < 500);
    assert.deepEqual(await strictRead('clients', f.c.slug), f.c);
    assert.deepEqual(await children(f), { number: null, voice: null, messaging: null });
    assert.equal((await onboarding.serviceOnboardingStatus(f.c)).operation, null);
    assert.deepEqual(await store.list('service_onboarding_intents'), []);
    const queue = await strictRead('service_onboarding_queue', 'active_v1');
    assert.equal(Object.keys(queue?.intents || {}).length, 0);
    assert.equal(report.providerRequests.length, before);
  }
});
await check('Missing cost, authority and each texting attestation fail before a financial intent', async () => {
  const f = await fresh('consent');
  for (const name of ['acceptedCosts', 'authority', 'attestLegalAccuracy', 'attestConsent', 'testPhoneConsent']) {
    await assert.rejects(() => submit(f, { [name]: false }), error => error.status >= 400 && error.status < 500);
    assert.equal((await onboarding.serviceOnboardingStatus(f.c)).operation, null);
    assert.equal((await children(f)).number, null);
  }
});
await check('A bad legal registration is rejected before a number purchase is queued', async () => {
  const f = await fresh('legal');
  for (const bad of [{ ...legal(), ein: 'bad' }, { ...legal(), legalName: '' }, { ...legal(), state: 'ZZ' }, { ...legal(), representative: { ...legal().representative, title: '' } }]) {
    await assert.rejects(() => submit(f, { legal: bad }), error => error.status >= 400 && error.status < 500);
    assert.equal((await children(f)).number, null);
    assert.equal((await onboarding.serviceOnboardingStatus(f.c)).operation, null);
  }
});
await check('Wrong owner, stale configuration and stale offer cannot authorize setup', async () => {
  const f = await fresh('ownership');
  await assert.rejects(() => submit(f, { actor: { role: 'owner', email: 'foreign@example.test' } }), error => error.status === 403);
  await assert.rejects(() => submit(f, { actor: { role: 'operator', email: f.c.owner.email } }), error => error.status === 403);
  await assert.rejects(() => submit(f, { actor: undefined }), error => error.status === 403);
  await assert.rejects(() => submit(f, { expectedRevision: '0'.repeat(64) }), error => error.status >= 400 && error.status < 500);
  await assert.rejects(() => submit(f, { expectedRevision: undefined }), error => error.status >= 400 && error.status < 500);
  await assert.rejects(() => onboarding.cancelServiceOnboarding(f.c, { actor: actor(f) }), error => error.code === 'configuration_changed' && error.status === 400);
  await assert.rejects(() => submit(f, { offerDigest: '0'.repeat(64) }), error => error.status >= 400 && error.status < 500);
  assert.equal((await children(f)).number, null);
});
await check('Unreviewed or simulated private practice cannot authorize paid connection setup', async () => {
  const f = await fresh('review'), body = await acceptance(f);
  for (const proof of [{}, { ...f.c.setupProof, testMode: 'fake' }]) {
    await store.put('clients', f.c.slug, { ...f.c, setupProof: proof });
    await assert.rejects(() => onboarding.requestServiceOnboarding(f.c, { ...body, actor: actor(f) }), error => error.status >= 400 && error.status < 500);
    assert.equal((await children(f)).number, null);
  }
});
await check('Actual API rejects anonymous/cross-owner requests and body-supplied actor authority', async () => {
  const f = await fresh('api-owner'), other = await fixture('foreign'), body = { action: 'request_service_onboarding', ...await acceptance(f) };
  assert.equal((await clientRequest(f, body, { token: '' })).status, 401);
  assert.equal((await clientRequest(f, body, { token: other.token })).status, 403);
  const forged = await clientRequest(f, { ...body, actor: actor(f) });
  assert.ok(forged.status >= 400 && forged.status < 500, JSON.stringify(forged));
  const stale = await clientRequest(f, { ...body, expectedRevision: '0'.repeat(64) });
  assert.ok(stale.status >= 400 && stale.status < 500, JSON.stringify(stale));
  assert.equal((await children(f)).number, null);
});
await check('Actual approval lookup is authenticated, exact-submission bound and read-only', async () => {
  const f=await fresh('approval-receipt'),other=await fixture('receipt-foreign'),body=await acceptance(f);
  const read=async(token=f.token,suffix='')=>{const response=await clientHandler(new Request(origin+'/api/client?c='+f.c.slug+'&service_approval='+body.submissionId+suffix,{headers:{origin,authorization:'Bearer '+token}}));return {response,data:await response.json()};};
  assert.equal((await read('')).response.status,401);assert.equal((await read(other.token)).response.status,403);
  assert.equal((await read(f.token,'&service_approval='+body.submissionId)).response.status,400);
  assert.equal((await read(f.token,'&extra=1')).response.status,400);
  assert.equal((await read()).data.approval.state,'not_requested');
  const saved=await clientRequest(f,{action:'request_service_onboarding',...body});assert.equal(saved.status,202);
  const id=saved.data.serviceOnboarding.operation.id,before=JSON.stringify([await store.get('service_onboarding_intents',id),await store.get('service_onboarding_queue','active_v1')]),requests=report.providerRequests.length;
  const result=await read();assert.equal(result.response.status,200);assert.match(result.response.headers.get('cache-control'),/no-store/);assert.equal(result.data.approval.state,'accepted');assert.equal(result.data.approval.submissionId,body.submissionId);assert.equal(result.data.approval.operationId,id);assert.equal(result.data.approval.generation,saved.data.serviceOnboarding.operation.generation);
  assert.deepEqual(Object.keys(result.data.approval).sort(),['generation','operationId','state','submissionId']);
  assert.equal(JSON.stringify([await store.get('service_onboarding_intents',id),await store.get('service_onboarding_queue','active_v1')]),before);assert.equal(report.providerRequests.length,requests);assert.equal((await children(f)).number,null);
});
await check('Actual authenticated draft saves and restores the selected phone mode and business-line details', async () => {
  const f = await fresh('draft');
  const fields = { name: f.c.owner.name, phone: f.c.owner.phone, business: f.c.business.name, phoneSetupMode: 'forward_business_line', businessNumber: '+17135550197', carrier: 'att', forwarding: 'missed', desiredChannels: ['voice', 'sms'] };
  const response = await accessHandler(new Request(origin + '/api/access', { method: 'PUT', headers: { origin, authorization: 'Bearer ' + f.token, 'content-type': 'application/json' }, body: JSON.stringify({ fields, step: 1, revision: 0 }) }));
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data));
  assert.deepEqual(data.draft.fields, fields);
  const restored = await accessHandler(new Request(origin + '/api/access', { headers: { authorization: 'Bearer ' + f.token } }));
  const saved = await restored.json(); assert.equal(restored.status, 200); assert.equal(saved.draft.fields.phoneSetupMode, 'forward_business_line'); assert.equal(saved.draft.fields.businessNumber, '+17135550197');
});
await check('Actual version-2 signup rejects every missing core business fact before tenant creation', async () => {
  const f = await fresh('core'), base = { setupVersion: '2', name: f.c.owner.name, email: f.c.owner.email, phone: f.c.owner.phone, business: f.c.business.name, trade: 'Plumbing', services: 'Drain repairs', serviceArea: 'Houston', hours: 'Mon to Fri 8 to 5', windows: '8 to 12\n12 to 5', desiredChannels: ['web'] };
  const before = (await store.list('clients')).length;
  for (const field of ['trade', 'services', 'serviceArea', 'hours', 'windows']) {
    const response = await onboardHandler(new Request(origin + '/api/onboard', { method: 'POST', headers: { origin, authorization: 'Bearer ' + f.token, 'content-type': 'application/json' }, body: JSON.stringify({ ...base, [field]: '' }) }));
    const body = await response.json(); assert.equal(response.status, 400, field + ': ' + JSON.stringify(body));
    assert.ok(body.field, 'A missing core fact should name its corrective field.');
    assert.equal((await store.list('clients')).length, before);
  }
});
await check('Actual version-2 signup rejects unparseable hours and a business-line callback loop', async () => {
  const f = await fresh('core-invalid'), base = { setupVersion: '2', name: f.c.owner.name, email: f.c.owner.email, phone: f.c.owner.phone, business: f.c.business.name, trade: 'Plumbing', services: 'Drain repairs', serviceArea: 'Houston', hours: 'Mon to Fri 8 to 5', windows: '8 to 12\n12 to 5', desiredChannels: ['voice'], phoneSetupMode: 'forward_business_line', businessNumber: '+17135550197', carrier: 'att', forwarding: 'missed' };
  for (const bad of [{ hours: 'whenever we feel like it' }, { businessNumber: f.c.owner.phone }]) {
    const response = await onboardHandler(new Request(origin + '/api/onboard', { method: 'POST', headers: { origin, authorization: 'Bearer ' + f.token, 'content-type': 'application/json' }, body: JSON.stringify({ ...base, ...bad }) }));
    const data = await response.json(); assert.equal(response.status, 400, JSON.stringify(data)); assert.ok(data.field);
  }
  assert.equal((await store.list('clients')).length, 1);
});
await check('One actual API acceptance survives retries and background continuation creates both child intents', async () => {
  const f = await fresh('automatic'), body = { action: 'request_service_onboarding', ...await acceptance(f) };
  const [first, retry] = await Promise.all([clientRequest(f, body), clientRequest(f, { ...body, submissionId: sha(body.submissionId + 'new-browser-id') })]);
  assert.equal(first.status, 202, JSON.stringify(first));
  assert.equal(retry.status, 202, JSON.stringify(retry));
  const accepted = await onboarding.serviceOnboardingStatus(f.c);
  assert.ok(accepted.operation?.id);
  assert.equal(accepted.operation.cancellationRequested, false);
  const before = report.providerRequests.length;
  await advanceNumber(f);
  await continuePlan(f);
  const state = await children(f), plan = await onboarding.serviceOnboardingStatus(f.c);
  assert.equal(numberPurchases(before), 1);
  assert.equal(state.number?.state, 'number_acquired');
  assert.ok(state.voice?.id, 'Voice must be requested by the worker without another owner action.');
  assert.ok(state.messaging?.id, 'Texting must be requested by the worker without another owner action.');
  assert.equal(plan.operation.voiceRequested, true);
  assert.equal(plan.operation.messagingRequested, true);
  assert.equal(['complete', 'active'].includes(plan.operation.state), false);
  assert.equal(state.voice.active, false);
  assert.equal(state.messaging.active, false);
  for (let n = 0; n < 3; n++) await continuePlan(f);
  const after = await children(f);
  assert.equal(after.voice.id, state.voice.id);
  assert.equal(after.messaging.id, state.messaging.id);
  assert.equal(numberPurchases(before), 1);
  const owner = await clientRequest(f);
  assert.equal(owner.status, 200);
  assert.ok(owner.data.serviceOnboarding?.operation?.id);
  const encoded = JSON.stringify(owner.data);
  for (const secret of [f.c.ownerKey, legal().ein, '921234567', legal().representative.email, process.env.TWILIO_AUTH_TOKEN, process.env.SERVICE_WORKER_KEY, process.env.PLATFORM_DATA_ENCRYPTION_KEY]) assert.equal(encoded.includes(secret), false, 'Owner response leaked a private registration or service credential.');
});
await check('Voice-only setup works with texting/delivery unavailable and creates no texting intent', async () => {
  const f = await fresh('voice-only', ['voice']);
  process.env.MESSAGING_ACTIVATION_ENABLED = 'false';
  process.env.SERVICE_DELIVERY_ENABLED = 'false';
  delete process.env.MESSAGING_ACTIVATION_OFFER_JSON;
  assert.equal((await onboarding.serviceOnboardingStatus(f.c)).available, true);
  await submit(f);
  await advanceNumber(f);
  await continuePlan(f);
  const rows = await children(f);
  assert.ok(rows.voice?.id);
  assert.equal(rows.messaging, null);
});
await check('SMS-only setup creates no voice intent and does not require Vapi credentials', async () => {
  const f = await fresh('sms-only', ['sms']);
  process.env.VOICE_ACTIVATION_ENABLED = 'false';
  delete process.env.VAPI_API_KEY;
  delete process.env.VOICE_ACTIVATION_POLICY_JSON;
  assert.equal((await onboarding.serviceOnboardingStatus(f.c)).available, true);
  await submit(f);
  await advanceNumber(f);
  await continuePlan(f);
  const rows = await children(f);
  assert.ok(rows.messaging?.id);
  assert.equal(rows.voice, null);
});
await check('Actual owner API approves only available answering, then separately authorizes texting on the same number', async () => {
  const f = await fresh('api-scoped');
  process.env.MESSAGING_ACTIVATION_ENABLED = 'false';
  const first = await onboarding.serviceOnboardingStatus(f.c);
  assert.deepEqual(first.offer.scopeChannels, ['voice']);
  const firstBody = { action: 'request_service_onboarding', expectedRevision: f.revision, submissionId: sha('partial-voice:' + f.c.slug), offerDigest: first.offer.digest, acceptedChannels: ['voice'], acceptedCosts: true, authority: true, forwardingMode: 'forward_business_line' };
  const response = await clientRequest(f, firstBody);
  assert.equal(response.status, 202, JSON.stringify(response.data));
  assert.deepEqual(response.data.serviceOnboarding.acceptedChannels, ['voice']);
  const initial = await strictRead('service_onboarding_intents', response.data.result.id);
  assert.equal(initial.privateData, null, 'Answering-only authority must not store unsubmitted texting registration.');
  assert.deepEqual(initial.requestedChannels, ['voice']);
  const before = report.providerRequests.length;
  await advanceNumber(f); await continuePlan(f);
  assert.ok((await children(f)).voice?.id);
  assert.equal((await children(f)).messaging, null);
  process.env.MESSAGING_ACTIVATION_ENABLED = 'true';
  await continuePlan(f);
  assert.equal((await children(f)).messaging, null, 'Opening a gate does not authorize the deferred child.');
  const second = await onboarding.serviceOnboardingStatus(f.c);
  assert.deepEqual(second.offer.scopeChannels, ['sms']);
  assert.equal(second.offer.numberCostAlreadyAccepted, true);
  const secondBody = { action: 'request_service_onboarding', expectedRevision: f.revision, submissionId: sha('partial-sms:' + f.c.slug), offerDigest: second.offer.digest, acceptedChannels: ['sms'], acceptedCosts: true, authority: true, legal: legal(), attestLegalAccuracy: true, attestConsent: true, testPhoneConsent: true };
  assert.equal((await clientRequest(f, { ...secondBody, acceptedChannels: ['voice', 'sms'] })).status, 400);
  assert.equal((await children(f)).messaging, null);
  const added = await clientRequest(f, secondBody);
  assert.equal(added.status, 202, JSON.stringify(added.data));
  assert.equal(added.data.result.id, response.data.result.id);
  assert.deepEqual(added.data.serviceOnboarding.acceptedChannels, ['voice', 'sms']);
  await continuePlan(f);
  const rows = await children(f);
  assert.ok(rows.messaging?.id);
  assert.equal(numberPurchases(before), 1, 'Adding the separate texting approval must reuse the acquired number.');
  const replay = await clientRequest(f, secondBody);
  assert.equal(replay.status, 202);
  assert.equal(numberPurchases(before), 1);
});

for (const change of ['business_rules', 'voice_policy', 'sms_policy', 'voice_credential', 'number_offer', 'tenant_identity', 'paused_lifecycle']) await check('Accepted setup retains per-channel authority after ' + change, async () => {
  const f = await fresh('changed'), body = await acceptance(f), before = report.providerRequests.length;
  await onboarding.requestServiceOnboarding(f.c, { ...body, actor: actor(f) });
  if (change === 'business_rules') await store.put('clients', f.c.slug, { ...f.c, summary: 'Owner changed the accepted service rules.' });
  if (change === 'tenant_identity') await store.put('clients', f.c.slug, { ...f.c, ownerKey: 'different-tenant-private-key' });
  if (change === 'paused_lifecycle') await store.put('clients', f.c.slug, { ...f.c, status: 'paused', operationLifecycleVersion: 1, pausedAt: new Date(now).toISOString() });
  if (change === 'voice_policy') { const p = JSON.parse(process.env.VOICE_ACTIVATION_POLICY_JSON); p.maxDailyCalls++; process.env.VOICE_ACTIVATION_POLICY_JSON = JSON.stringify(p); }
  if (change === 'sms_policy') { const p = JSON.parse(process.env.MESSAGING_ACTIVATION_OFFER_JSON); p.campaignMonthlyCents++; process.env.MESSAGING_ACTIVATION_OFFER_JSON = JSON.stringify(p); }
  if (change === 'voice_credential') process.env.VAPI_API_KEY = 'qa-rotated-synthetic-vapi-key';
  if (change === 'number_offer') { const p = JSON.parse(process.env.PHONE_ACTIVATION_OFFER_JSON); p.monthlyCents++; process.env.PHONE_ACTIVATION_OFFER_JSON = JSON.stringify(p); }
  await continuePlan(f);
  await phone.recoverPhoneActivations({ limit: 1, deadlineAt: now + 14000 });
  if (['voice_policy', 'sms_policy', 'voice_credential'].includes(change)) await continuePlan(f);
  const state = await children(f);
  if (change === 'voice_policy' || change === 'voice_credential') {
    assert.equal(state.voice, null, 'Changed answering authority must not create a voice child.');
    assert.ok(state.messaging?.id, 'Previously approved texting may continue independently.');
    assert.equal(numberPurchases(before), 1);
  } else if (change === 'sms_policy') {
    assert.ok(state.voice?.id, 'Previously approved answering may continue independently.');
    assert.equal(state.messaging, null, 'Changed texting costs must not create a texting child.');
    assert.equal(numberPurchases(before), 1);
  } else {
    assert.equal(state.voice, null);
    assert.equal(state.messaging, null);
    assert.equal(numberPurchases(before), 0);
  }
  const status = await onboarding.serviceOnboardingStatus(await strictRead('clients', f.c.slug));
  assert.equal(['complete', 'active'].includes(status.operation?.state), false);
});
for (const loss of ['before', 'after']) await check('Ambiguous number result ' + loss + ' remote effect never authorizes a second purchase', async () => {
  const f = await fresh('lost-' + loss), before = report.providerRequests.length;
  await submit(f);
  await continuePlan(f);
  numberLoss = loss;
  await phone.recoverPhoneActivations({ limit: 1, deadlineAt: now + 14000 });
  numberLoss = null;
  for (let n = 0; n < 5; n++) { now += 601000; await continuePlan(f); await phone.recoverPhoneActivations({ limit: 1, deadlineAt: now + 14000 }); }
  assert.equal(numberPurchases(before), 1);
  const state = await children(f);
  assert.equal(['complete', 'active'].includes((await onboarding.serviceOnboardingStatus(f.c)).operation?.state), false);
  if (loss === 'before') { assert.equal(state.voice, null); assert.equal(state.messaging, null); }
  else { await continuePlan(f); const completed = await children(f); assert.ok(completed.voice?.id); assert.ok(completed.messaging?.id); }
});
await check('Cancellation before worker dispatch prevents every new provider resource', async () => {
  const f = await fresh('cancel-early'), before = report.providerRequests.length;
  await submit(f);
  await cancel(f);
  for (let n = 0; n < 2; n++) { await continuePlan(f); await phone.recoverPhoneActivations({ limit: 1, deadlineAt: now + 14000 }); }
  const state = await children(f);
  assert.equal(state.voice, null);
  assert.equal(state.messaging, null);
  assert.equal(numberPurchases(before), 0);
  assert.equal((await onboarding.serviceOnboardingStatus(f.c)).operation.cancellationRequested, true);
});
await check('Cancellation after automatic child creation retains their identities and propagates stop', async () => {
  const f = await fresh('cancel-late');
  await submit(f);
  await advanceNumber(f);
  await continuePlan(f);
  const before = await children(f), count = report.providerRequests.length;
  assert.ok(before.voice?.id && before.messaging?.id);
  configure(false);
  await cancel(f);
  await continuePlan(f);
  const after = await children(f);
  assert.equal(after.voice?.id, before.voice.id);
  assert.equal(after.messaging?.id, before.messaging.id);
  const v = await strictRead('voice_activation_intents', before.voice.id), sms = await strictRead('messaging_activation', before.messaging.id);
  assert.ok(v.cancelRequestedAt, 'Phone child cancellation must remain durable with gates closed.');
  assert.ok(sms.cancelRequestedAt, 'Texting child cancellation must remain durable with gates closed.');
  assert.equal(numberPurchases(count), 0);
  assert.equal((await onboarding.serviceOnboardingStatus(f.c)).operation.cancellationRequested, true);
});
await check('Existing texting activation handler rejects missing/bogus worker authority and foreign tenant without mutation', async () => {
  const f = await fresh('worker-auth'), before = report.providerRequests.length;
  await submit(f);
  const { deliveryTenant } = await import('../netlify/functions/lib/managed-consent.mjs');
  const body = { slug: f.c.slug, tenant: deliveryTenant(f.c) };
  const run = (method, key, value) => activationHandler(new Request(origin + '/.netlify/functions/service-activation-background', { method, headers: { 'content-type': 'application/json', 'x-service-worker-key': key }, ...(method === 'POST' ? { body: JSON.stringify(value) } : {}) }));
  assert.equal((await run('GET', process.env.SERVICE_WORKER_KEY, body)).status, 403);
  assert.equal((await run('POST', '', body)).status, 403);
  assert.equal((await run('POST', 'x'.repeat(48), body)).status, 403);
  assert.equal((await run('POST', process.env.SERVICE_WORKER_KEY, { ...body, tenant: '0'.repeat(64) })).status, 404);
  assert.equal((await run('POST', process.env.SERVICE_WORKER_KEY, { ...body, legal: legal() })).status, 400);
  assert.equal(report.providerRequests.length, before);
});
await check('New coordinator worker enforces auth/tenant/body and an authorized invocation queues the number', async () => {
  const f = await fresh('new-worker'), before = report.providerRequests.length; await submit(f);
  const { deliveryTenant } = await import('../netlify/functions/lib/managed-consent.mjs'); const body = { slug: f.c.slug, tenant: deliveryTenant(f.c) };
  const run = (method, key, value) => onboardingWorker(new Request(origin + '/.netlify/functions/service-onboarding-background', { method, headers: { 'content-type': 'application/json', 'x-service-worker-key': key }, ...(method === 'POST' ? { body: JSON.stringify(value) } : {}) }));
  assert.equal((await run('GET', process.env.SERVICE_WORKER_KEY, body)).status, 403); assert.equal((await run('POST', '', body)).status, 403); assert.equal((await run('POST', 'x'.repeat(48), body)).status, 403);
  assert.equal((await run('POST', process.env.SERVICE_WORKER_KEY, { ...body, tenant: '0'.repeat(64) })).status, 404); assert.equal((await run('POST', process.env.SERVICE_WORKER_KEY, { ...body, legal: legal() })).status, 400); assert.equal((await children(f)).number, null);
  const approved = await run('POST', process.env.SERVICE_WORKER_KEY, body); assert.equal(approved.status, 200, await approved.text()); assert.ok((await children(f)).number?.id); assert.equal(report.providerRequests.length, before);
});
await check('Actual dedicated scheduler wiring advances the saved plan through number acquisition into both child intents', async () => {
  const f = await fresh('scheduled'); await submit(f);
  const queued = await runServiceOnboardingRecovery(); assert.equal(queued.ok, true); assert.ok((await children(f)).number?.id);
  const purchased = await runPhoneActivationRecovery(); assert.equal(purchased.ok, true); assert.equal((await children(f)).number.state, 'number_acquired');
  const continued = await runServiceOnboardingRecovery(); assert.equal(continued.ok, true); const rows = await children(f); assert.ok(rows.voice?.id && rows.messaging?.id); assert.deepEqual(await strictRead('health', 'serviceOnboarding:lastRun'), continued); assert.equal((await onboarding.serviceOnboardingStatus(f.c)).operation.state, 'connecting');
});
await check('Actual two-minute scheduler services 25 pending admissions in five bounded distinct waves', async () => {
  assert.equal(serviceRecoveryConfig.schedule, '*/2 * * * *');
  const cohort = [];
  for (let n = 0; n < 25; n++) { const f = await fresh('cohort'); await submit(f); cohort.push(f); }
  const before = report.providerRequests.length;
  for (let wave = 0; wave < 5; wave++) {
    now += 120000;
    const result = await runServiceOnboardingRecovery();
    assert.equal(result.ok, true); assert.equal(result.visited, 5); assert.equal(result.processed, 5);
    assert.equal((await store.list('phone_activation_intents')).length, (wave + 1) * 5, 'Each wave must advance five different previously unvisited admissions.');
    const encoded = JSON.stringify(result);
    for (const f of cohort) for (const value of [f.c.slug, f.c.owner.email, f.c.ownerKey]) assert.equal(encoded.includes(value), false, 'Scheduler result leaked a customer identity.');
    assert.equal(encoded.includes('visitedId'), false); assert.equal(encoded.includes('dispatch'), false);
    assert.deepEqual(await strictRead('health', 'serviceOnboarding:lastRun'), result);
  }
  for (const f of cohort) assert.ok((await children(f)).number?.id);
  assert.equal(report.providerRequests.length, before);
});
await check('Actual scheduler stops selecting candidates when its one shared deadline expires', async () => {
  for (let n = 0; n < 6; n++) { const f = await fresh('deadline'); await submit(f); }
  const before = report.providerRequests.length;
  let result;
  try { clockIncrement = 500; result = await runServiceOnboardingRecovery(); }
  finally { clockIncrement = 0; }
  assert.equal(result.deadlineReached, true); assert.ok(result.visited < 5, 'A shared elapsed deadline must stop the wave before five candidates.'); assert.ok(result.visited >= 1); assert.equal(result.waveLimit, 5); assert.equal(result.scope, 'at_most_5_distinct'); assert.equal(report.providerRequests.length, before);
});
await check('Actual worker review-needed result is a customer action without a global outage', async () => {
  const f = await fresh('review-health'); await submit(f); await store.put('clients', f.c.slug, { ...f.c, summary: 'Changed details require the owner to review this setup.' });
  const result = await runServiceOnboardingRecovery(); assert.equal(result.ok, true); assert.ok(result.outcomes.some(row => row.state === 'needs_review'));
  const health = await onboarding.serviceOnboardingHealth(); assert.equal(health.ok, true); assert.equal(health.waitingCustomer, 1); assert.equal(health.unresolved, 0); assert.equal((await children(f)).number, null);
});
await check('Before dispatch, changed rules can be reviewed again without duplicating paid setup', async () => {
  const f = await fresh('reapprove'), oldBody = await acceptance(f); await onboarding.requestServiceOnboarding(f.c, { ...oldBody, actor: actor(f) });
  f.c = { ...f.c, summary: 'Owner approved a clearer plumbing intake policy.' }; f.revision = configurationRevision(f.c); f.c.setupProof = { reviewedRevision: f.revision, testedRevision: f.revision, testMode: 'live' }; await store.put('clients', f.c.slug, f.c);
  const changed = await onboarding.serviceOnboardingStatus(f.c); assert.equal(changed.operation.state, 'needs_review'); assert.equal(changed.available, true);
  await assert.rejects(() => submit(f, { submissionId: oldBody.submissionId }), error => error.status === 409 && error.code === 'submission_conflict');
  const before = report.providerRequests.length; await submit(f); await advanceNumber(f); await continuePlan(f); const state = await children(f); assert.ok(state.voice?.id && state.messaging?.id); assert.equal(numberPurchases(before), 1);
});
async function supersededNumber(f) {
  await submit(f); await continuePlan(f);
  const child = (await children(f)).number;
  f.c = { ...f.c, summary: 'Owner corrected the saved business instructions.' };
  f.revision = configurationRevision(f.c);
  f.c.setupProof = { reviewedRevision: f.revision, testedRevision: f.revision, testMode: 'live' };
  await store.put('clients', f.c.slug, f.c);
  await phone.recoverPhoneActivations({ limit: 1, deadlineAt: now + 14000 });
  await continuePlan(f);
  assert.equal((await children(f)).number.state, 'superseded');
  return strictRead('phone_activation_intents', child.id);
}
await check('After a confirmed pre-purchase stop, renewed owner approval resumes the same number and selected services once', async () => {
  const f = await fresh('renew-number'), before = report.providerRequests.length;
  const original = await supersededNumber(f), status = await onboarding.serviceOnboardingStatus(f.c);
  assert.equal(status.available, true); assert.equal(status.legacySetup, false);
  const renewed = await submit(f); assert.equal((await strictRead('service_onboarding_intents', renewed.id)).generation, 2);
  await advanceNumber(f); await continuePlan(f);
  const rows = await children(f), number = await strictRead('phone_activation_intents', rows.number.id);
  assert.equal(number.id, original.id); assert.equal(number.correlationId, original.correlationId); assert.equal(number.renewalSequence, 1);
  assert.equal(numberPurchases(before), 1); assert.ok(rows.voice && rows.messaging);
});
await check('Restoring original answers still allows a fresh approval after a confirmed pre-purchase stop', async () => {
  const f = await fresh('restore-number', ['voice']), originalSummary = f.c.summary;
  const original = await supersededNumber(f);
  f.c.summary = originalSummary; f.revision = configurationRevision(f.c);
  f.c.setupProof = { reviewedRevision: f.revision, testedRevision: f.revision, testMode: 'live' };
  await store.put('clients', f.c.slug, f.c);
  assert.equal(f.revision, original.inputRevision);
  const renewed = await submit(f, { submissionId: sha('fresh-restored-review:' + f.c.slug) });
  assert.equal((await strictRead('service_onboarding_intents', renewed.id)).generation, 2);
  await continuePlan(f); assert.equal((await children(f)).number.state, 'queued');
});
await check('Several business reviews before a renewal handoff retain the exact untouched number request', async () => {
  const f = await fresh('repeat-number', ['voice']), before = report.providerRequests.length;
  const original = await supersededNumber(f); await submit(f);
  f.c.summary = 'Owner made a second reviewed correction before automatic setup continued.';
  f.revision = configurationRevision(f.c); f.c.setupProof = { reviewedRevision: f.revision, testedRevision: f.revision, testMode: 'live' };
  await store.put('clients',f.c.slug,f.c);
  const renewed = await submit(f), parent = await strictRead('service_onboarding_intents',renewed.id);
  assert.equal(parent.generation,3); assert.equal(parent.numberRenewal.id,original.id);
  await advanceNumber(f); const child = await strictRead('phone_activation_intents',original.id);
  assert.equal(child.renewalSequence,1); assert.equal(child.inputRevision,f.revision); assert.equal(numberPurchases(before),1);
});
await check('A cancellation during number-renewal handoff cannot authorize a late purchase', async () => {
  const f = await fresh('cancel-renew', ['voice']), before = report.providerRequests.length;
  const original = await supersededNumber(f); await submit(f);
  let reached, release; const arrived = new Promise(r => { reached = r; }), held = new Promise(r => { release = r; });
  const engine = onboarding.createServiceOnboardingEngine({ requestNumber: async (c, body) => { reached(); await held; return phone.requestPhoneActivation(c, body); } });
  const pending = engine.continue(f.c, { deadlineAt: now + 14000 }); await arrived; await cancel(f); release(); await pending;
  await phone.recoverPhoneActivations({ limit: 1, deadlineAt: now + 14000 });
  assert.equal(numberPurchases(before), 0);
  const retained = await strictRead('phone_activation_intents', original.id);
  assert.equal(retained.resource, undefined); assert.equal(retained.inputRevision, original.inputRevision);
});
await check('Purchase uncertainty and cancellation traces cannot be erased by renewed approval', async () => {
  for (const patch of [{ purchaseStartedAt: new Date(now).toISOString() }, { purchaseAttempts: 1 }, { reconciliationAttempts: 1 }, { resource: { id: 'PN' + 'f'.repeat(32), number: '+17135550196' } }, { cancelRequestedAt: new Date(now).toISOString() }, { claim: { token: 'expired', until: new Date(now - 1).toISOString() } }]) {
    const f = await fresh('renew-denied', ['voice']), original = await supersededNumber(f);
    await store.atomicUpdate('phone_activation_intents', original.id, row => ({ value: { ...row, ...patch } }));
    const status = await onboarding.serviceOnboardingStatus(f.c); assert.equal(status.available, false); assert.equal(status.offer, null);
    // Remove this finished fixture's queue before the next member of the table.
    for (const kind of ['service_onboarding_intents','service_onboarding_queue','phone_activation_intents','phone_activation_queue']) for (const key of await store.list(kind)) await store.del(kind,key);
  }
});
await check('A missing primary plan is restored from its encrypted pre-dispatch admission', async () => {
  const f = await fresh('admission'); await submit(f); const id = (await onboarding.serviceOnboardingStatus(f.c)).operation.id;
  const queue = await strictRead('service_onboarding_queue', 'active_v1'), encoded = JSON.stringify(queue);
  assert.equal(encoded.includes(legal().ein), false); assert.equal(encoded.includes('921234567'), false); assert.equal(encoded.includes(legal().representative.email), false);
  await store.del('service_onboarding_intents', id); const before = report.providerRequests.length;
  await onboarding.recoverServiceOnboardings({ limit: 1, deadlineAt: now + 14000 });
  assert.ok(await strictRead('service_onboarding_intents', id)); assert.ok((await children(f)).number?.id); assert.equal(report.providerRequests.length, before);
});
await check('A missing post-dispatch plan cannot be reconstructed into another number or child request', async () => {
  const f = await fresh('lost-primary'); await submit(f); await continuePlan(f); const status = await onboarding.serviceOnboardingStatus(f.c), prior = await children(f); assert.ok(prior.number?.id);
  await store.del('service_onboarding_intents', status.operation.id); const before = report.providerRequests.length;
  const recovered = await runServiceOnboardingRecovery(); assert.equal(recovered.ok, false); assert.equal(await strictRead('service_onboarding_intents', status.operation.id), null); assert.equal((await children(f)).number.id, prior.number.id); assert.equal((await children(f)).voice, null); assert.equal(report.providerRequests.length, before); assert.equal((await strictRead('health', 'serviceOnboarding:lastRun')).ok, false);
});
await check('A cancellation racing the actual number-child request prevents later child creation', async () => {
  const f = await fresh('cancel-race'), before = report.providerRequests.length; await submit(f); let reached, release; const arrived = new Promise(resolve => { reached = resolve; }), pending = new Promise(resolve => { release = resolve; });
  const engine = onboarding.createServiceOnboardingEngine({ requestNumber: async (c, body) => { const row = await phone.requestPhoneActivation(c, body); reached(); await pending; return row; } });
  const continued = engine.continue(f.c, { deadlineAt: now + 14000 }); await arrived; await cancel(f); release(); await continued; await continuePlan(f);
  const rows = await children(f); assert.ok(rows.number?.id); assert.equal(rows.voice, null); assert.equal(rows.messaging, null); assert.equal(report.providerRequests.length, before);
  assert.equal((await onboarding.serviceOnboardingStatus(f.c)).operation.cancellationRequested, true);
});
await check('Only synthetic verified child proofs yield active, retire the queue, and remain cancellable', async () => {
  const f = await fresh('proof-fixture'); await submit(f); await advanceNumber(f); await continuePlan(f); const rows = await children(f); assert.equal((await onboarding.serviceOnboardingStatus(f.c)).operation.state, 'connecting');
  const number = (await strictRead('phone_activation_intents', rows.number.id)).resource;
  const v = await strictRead('voice_activation_intents', rows.voice.id), sms = await strictRead('messaging_activation', rows.messaging.id), at = new Date(now).toISOString();
  // These are explicitly manufactured local retained-proof fixtures, not a
  // provider call, message receipt or assertion that delivery happened.
  await store.put('voice_activation_intents', v.id, { ...v, state: 'ready', number: { id: number.id, number: number.number, accountSid }, routing: { confirmed: true, checkedAt: at }, evidence: { successfulCallAt: at, forwardedAt: at, latestCallOutcome: 'success' } });
  await store.put('messaging_activation', sms.id, { ...sms, state: 'ready', number: { sid: number.id, number: number.number, accountSid }, resources: { service: { sid: 'MG' + 'c'.repeat(32), accountSid } }, approvals: { profile: 'twilio-approved', trust: 'twilio-approved', brand: 'APPROVED', campaign: 'VERIFIED' }, deliveryProof: { fixtureOnly: true }, lastVerifiedAt: at });
  const verified = await children(f); assert.equal(verified.voice.active, true); assert.equal(verified.messaging.active, true); await continuePlan(f);
  const active = await onboarding.serviceOnboardingStatus(f.c); assert.equal(active.operation.state, 'active'); const queue = await strictRead('service_onboarding_queue', 'active_v1'); assert.equal(queue.intents[active.operation.id], undefined);
  await cancel(f); const admitted = await strictRead('service_onboarding_queue', 'active_v1'); assert.ok(admitted.intents[active.operation.id]); await continuePlan(f); assert.equal((await strictRead('voice_activation_intents', v.id)).cancelRequestedAt, at); assert.equal((await strictRead('messaging_activation', sms.id)).cancelRequestedAt, at);
});
await check('All external networking was denied; no email, model or service delivery was requested', async () => {
  assert.deepEqual(report.attemptedNetwork, []);
  assert.ok(report.providerRequests.every(row => ['https://api.twilio.com', 'https://pricing.twilio.com'].includes(row.origin)));
  assert.ok(report.providerRequests.every(row => !/Messages|Calls|CustomerProfiles|BrandRegistrations|Services/.test(row.path)));
});
report.sourceAfter = hashes();
report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
report.summary = { passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, total: report.checks.length };
report.ok = !report.summary.failed && report.sourceStable;
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, summary: report.summary, sourceStable: report.sourceStable, failures: report.checks.filter(row => !row.pass), output }, null, 2));
if (!report.ok) process.exitCode = 1;
