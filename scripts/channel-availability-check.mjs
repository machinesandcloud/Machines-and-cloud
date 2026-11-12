// Channel availability truthfulness check (PRA-ACQ-01, PRA-ACQ-02, PRA-ONB-02).
//
// One question, asked of every surface: does it give a new owner the same availability
// for each channel, and does that availability follow the platform gates?
//   - Node: the shared projection, the current (brake/allowance-aware) projection, the public
//     endpoint and its cache bound, the sales desk facts/prompt/PRODUCT FACTS/fit tool, the
//     static homepage/onboarding fallback, the FAQPage JSON-LD, and the public script's
//     failure paths (thrown fetch, 503, malformed JSON, invalid payload) in a VM, with gates
//     OFF, ON and PARTIAL (cohort, pilot/zero/controlled Calendar policy, expired offers,
//     missing at-rest key, usage brake, used-up shared allowance).
//   - Browser (--browser; bundled Chromium, 390 and 1440): homepage connections + FAQ,
//     onboarding Step 1 choices and preview, desk Connections list and connector page, with
//     gates OFF and ON, plus the homepage fallback when the endpoint fails or the fetch throws.
// Offline only: memory store, fake model, Node http/https/net and non-origin fetch denied,
// every browser request outside the in-process origin aborted. Gate env values are synthetic
// fixtures (same shapes as scripts/service-onboarding-qa-check.mjs and calendar fixtures).
//
// Build gate (netlify.toml): `node scripts/channel-availability-check.mjs` runs the Node phase
// only, needs no browser and writes no file. Full run:
//   node scripts/channel-availability-check.mjs --browser --root <tree> --output <file.json>
//        [--shots <dir>] [--label a54|patched] [--playwright <playwright/index.mjs>] [--chromium <headless shell>]
// Exit code 0 only when every check passes.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const arg = (name, fallback) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : fallback; };
const root = resolve(arg('--root', '.')), output = arg('--output'), shots = arg('--shots'), label = arg('--label', 'run');
const browserPhase = process.argv.includes('--browser');
const playwrightPath = arg('--playwright', '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const chromiumPath = arg('--chromium', '/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell');
if (output && existsSync(output)) throw new Error('Refusing to overwrite retained evidence: ' + output);
if (shots) mkdirSync(shots, { recursive: true });
const origin = 'http://127.0.0.1:8977', sha = v => createHash('sha256').update(v).digest('hex');
const watched = ['index.html', 'onboard.html', 'onboard.js', 'desk-setup-guide.js', 'desk-service-intake.js', 'channel-availability.js', 'netlify/functions/lib/sales-desk.mjs', 'netlify/functions/lib/channel-availability.mjs', 'netlify/functions/channel-availability.mjs', 'netlify/functions/client.mjs', 'netlify/functions/chat.mjs', 'netlify.toml'];
const hashes = () => Object.fromEntries(watched.map(f => [f, existsSync(join(root, f)) ? sha(readFileSync(join(root, f))) : null]));
const report = { label, root, at: new Date().toISOString(), mode: 'offline: memory store, fake model, physical transport denied, in-process handlers' + (browserPhase ? ', bundled Chromium' : ', node phase only (build gate)'), sourceBefore: hashes(), checks: [], screenshots: [], physicalNetwork: 0, forbidden: [], pageErrors: [] };

// ---------- isolation ----------
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|MANAGED_|WORKSPACE_|THUMBTACK_|ANGI_|PLATFORM_|MC_|NETLIFY_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const BASE_ENV = { PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }; // synthetic at-rest key, not a provider credential
const deny = () => { report.physicalNetwork++; throw new Error('channel availability check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };

// ---------- synthetic gate fixtures ----------
const now = Date.now(), accountSid = 'AC' + 'a'.repeat(32), primarySid = 'BU' + 'b'.repeat(32), googleClient = 'fixture-google-client';
const calendarActions = ['oauthStart', 'tokenExchange', 'tokenRefresh', 'calendarRead', 'eventCreate', 'eventUpdate', 'eventDelete', 'workerDispatch', 'totalRequests'];
function gateEnv(mode) {
  const number = { version: 'fx_number_v1', scope: 'number_acquisition_only', country: 'US', areaCode: '713', currency: 'USD', oneTimeCents: 0, monthlyCents: 115, maxAcquisitionCents: 115, expiresAt: new Date(now + 10 * 86400000).toISOString(), authorityText: 'I am authorized to reserve this business number and accept the disclosed recurring cost until release is confirmed.' };
  const voice = { version: 'fx_voice_v1', model: 'claude-sonnet-4-5', maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, accountDailyCalls: 30, accountDailyMinutes: 150, authorityText: 'I am authorized to connect answering for this business and approve the reviewed routing and usage.', usageDisclosure: 'Synthetic fixture phone usage terms. No call or charge is authorized.' };
  const sms = { version: 'fx_sms_v1', scope: 'a2p_customer_care', country: 'US', currency: 'USD', brandRegistrationCents: 4400, campaignRegistrationCents: 1500, campaignMonthlyCents: 1000, resubmissionCents: 1500, maxResubmissions: 1, usageDisclosure: 'Synthetic fixture texting usage terms. No message, filing or charge is authorized.', authorityText: 'I am authorized to register the reviewed business texting program and accept the disclosed registration costs.', feeScheduleUrl: 'https://fees.example.test/fx', expiresAt: new Date(now + 10 * 86400000).toISOString() };
  const admission = { version: 'fx_resource_v1', expiresAt: new Date(now + 10 * 86400000).toISOString(), mode: mode === 'cohort' ? 'cohort' : 'self_service', providerAccountHash: sha(accountSid), currency: 'USD', rateBasis: 'configured_upper_bound', rateSource: 'https://fees.example.test/synthetic-resource-bounds', bounds: { numberSetupCents: 0, numberMonthlyCents: 115, brandSetupCents: 4400, campaignSetupCents: 1500, campaignMonthlyCents: 1000 }, accountLimits: { numbers: 100, brands: 100, campaigns: 100, setupCents: 1000000, monthlyCents: 1000000 }, tenantLimits: { numbers: 1, brands: 1, campaigns: 1, setupCents: 5900, monthlyCents: 1115 }, tenants: mode === 'cohort' ? [{ slug: 'pilot-shop', identity: 'f'.repeat(64) }] : [] };
  const calendar = { mode: 'self_service', version: 'fx_calendar_v1', expiresAt: new Date(now + 30 * 86400000).toISOString(), googleClientIdHash: sha(googleClient), limits: Object.fromEntries(calendarActions.map(a => [a, 10000])), tenantLimits: Object.fromEntries(calendarActions.map(a => [a, 1000])) };
  return {
    TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: 'fixture-twilio-token', TWILIO_PRIMARY_PROFILE_SID: primarySid, VAPI_API_KEY: 'fixture-vapi-key', VAPI_WEBHOOK_SECRET: 'q'.repeat(48), SERVICE_WORKER_KEY: 'w'.repeat(48),
    PHONE_ACTIVATION_OFFER_JSON: JSON.stringify(number), PHONE_ACTIVATION_APPROVED_VERSION: number.version, VOICE_ACTIVATION_POLICY_JSON: JSON.stringify(voice), VOICE_ACTIVATION_APPROVED_VERSION: voice.version,
    MESSAGING_ACTIVATION_OFFER_JSON: JSON.stringify(sms), MESSAGING_ACTIVATION_APPROVED_VERSION: sms.version, VOICE_FALLBACK_TWIML_URL: 'https://handler.twilio.com/twiml/EH' + 'e'.repeat(32),
    MANAGED_RESOURCE_ADMISSION_POLICY_JSON: JSON.stringify(admission), MANAGED_RESOURCE_ADMISSION_APPROVED_VERSION: admission.version,
    PHONE_ACQUISITION_ENABLED: mode === 'no_phone' ? 'false' : 'true', VOICE_ACTIVATION_ENABLED: 'true', MESSAGING_ACTIVATION_ENABLED: 'true', SERVICE_DELIVERY_ENABLED: 'true',
    GOOGLE_CLIENT_ID: googleClient, GOOGLE_CLIENT_SECRET: 'fixture-google-secret', CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), CALENDAR_CONNECTION_ENABLED: 'true', CALENDAR_DELIVERY_ENABLED: 'true',
    CALENDAR_SELF_SERVICE_ENABLED: 'true', CALENDAR_SELF_SERVICE_POLICY_JSON: JSON.stringify(calendar), CALENDAR_SELF_SERVICE_APPROVED_VERSION: calendar.version,
  };
}
const GATE_KEYS = Object.keys(gateEnv('on'));
function setGates(mode) { for (const key of GATE_KEYS) delete process.env[key]; Object.assign(process.env, BASE_ENV); if (mode !== 'off') Object.assign(process.env, gateEnv(mode)); report.gates = mode; }
setGates('off');
const editJson = (key, edit) => { const value = JSON.parse(process.env[key]); edit(value); process.env[key] = JSON.stringify(value); };
// A valid controlled (single named shop) Calendar execution policy: it really enables Calendar
// for that one shop, but a new owner cannot connect under it.
const controlledCalendarPolicy = () => ({ version: 'fx_calendar_controlled_v1', expiresAt: new Date(now + 30 * 86400000).toISOString(), tenant: { slug: 'pilot-shop', identity: 'f'.repeat(64) }, googleClientIdHash: sha(googleClient), targetIdHash: 'c'.repeat(64), censusDigest: 'd'.repeat(64), censusMode: 'clean_initial', bookingIds: ['fx-booking-1'], limits: Object.fromEntries(calendarActions.map(a => [a, 10])) });
const ledgerRow = used => ({ version: 1, providerAccountHash: sha(accountSid), currency: 'USD', used: { numbers: 0, brands: 0, campaigns: 0, setupCents: 0, monthlyCents: 0, ...used }, tenants: {}, reservations: {} });

// ---------- helpers ----------
const IDS = ['web', 'voice', 'sms', 'calendar', 'thumbtack', 'angi'];
const LABELS = { web: 'Website chat', voice: 'Phone answering', sms: 'Text messaging', calendar: 'Google Calendar', thumbtack: 'Thumbtack', angi: 'Angi' };
const EXPECT = { off: { web: 'Available now', voice: 'Setup with our team', sms: 'Setup with our team', calendar: 'Setup with our team', thumbtack: 'Available now', angi: 'Available now' } };
EXPECT.on = Object.fromEntries(IDS.map(id => [id, 'Available now']));
const NOTE = 'We’ll set this up with you; it is not live yet.';
const SALES_KEY = { web: 'website_chat', voice: 'phone_answering', sms: 'sms', calendar: 'google_calendar_sync', thumbtack: 'thumbtack_leads', angi: 'angi_leads' };
const COPY_BANNED = /—/; // repo copy rule: no em dashes
async function check(name, surface, run) {
  const t0 = Date.now();
  try { await run(); report.checks.push({ name, surface, pass: true, ms: Date.now() - t0 }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, surface, pass: false, ms: Date.now() - t0, error: String(error.message || error).split('\n').slice(0, 6).join('\n') }); console.log('FAIL ' + name + ': ' + String(error.message || error).split('\n')[0]); }
}
const mod = async rel => import(pathToFileURL(join(root, rel)).href);
const tryMod = async rel => { try { return await mod(rel); } catch (error) { return { __error: error }; } };

// ---------- Node: projection, endpoint, sales facts, static fallback ----------
const store = await mod('netlify/functions/lib/store.mjs');
const resetHolds = async () => { await store.put('health', 'brake', { on: false }); await store.put('managed_resource_admission', 'twilio_v1', null); };
const projection = await tryMod('netlify/functions/lib/channel-availability.mjs');
const salesDesk = await mod('netlify/functions/lib/sales-desk.mjs');
const endpoint = await tryMod('netlify/functions/channel-availability.mjs');
const need = (m, what) => { if (m.__error) throw new Error(what + ' is missing: ' + String(m.__error.message).split('\n')[0]); return m; };
const statusMap = view => Object.fromEntries(view.channels.map(row => [row.id, row.status]));

for (const mode of ['off', 'on']) {
  await check(`projection: one status per channel follows the gates (${mode})`, 'source', async () => {
    setGates(mode); const view = need(projection, 'Shared channel availability projection').channelAvailability();
    assert.deepEqual(view.channels.map(row => row.id), IDS);
    assert.deepEqual(statusMap(view), EXPECT[mode]);
    for (const row of view.channels) { assert.equal(row.label, LABELS[row.id]); assert.equal(row.note, row.available ? '' : NOTE); assert.ok(!COPY_BANNED.test(row.detail + row.note + row.status), 'em dash in ' + row.id); }
  });
}
await check('projection: partial gates stay honest (cohort admission, phone acquisition off, unapproved voice, expired texting offer, no at-rest key)', 'source', async () => {
  const p = need(projection, 'Shared channel availability projection');
  setGates('cohort'); let s = statusMap(p.channelAvailability());
  assert.equal(s.voice, 'Setup with our team', 'cohort-only admission is not self-service'); assert.equal(s.sms, 'Setup with our team'); assert.equal(s.calendar, 'Available now');
  setGates('no_phone'); s = statusMap(p.channelAvailability());
  assert.equal(s.voice, 'Setup with our team', 'no number acquisition means no phone answering'); assert.equal(s.sms, 'Setup with our team'); assert.equal(s.calendar, 'Available now');
  setGates('on'); process.env.VOICE_ACTIVATION_APPROVED_VERSION = 'unapproved'; s = statusMap(p.channelAvailability());
  assert.equal(s.voice, 'Setup with our team', 'an unapproved policy version keeps phone gated'); assert.equal(s.sms, 'Available now');
  setGates('on'); editJson('MESSAGING_ACTIVATION_OFFER_JSON', o => { o.expiresAt = new Date(now - 1000).toISOString(); }); s = statusMap(p.channelAvailability());
  assert.equal(s.sms, 'Setup with our team', 'an expired texting offer keeps texting gated'); assert.equal(s.voice, 'Available now', 'texting offer expiry does not affect phone');
  setGates('on'); delete process.env.PLATFORM_DATA_ENCRYPTION_KEY; s = statusMap(p.channelAvailability());
  assert.equal(s.voice, 'Available now', 'control: the platform family falls back to the Calendar key, so details can still be sealed');
  delete process.env.CALENDAR_TOKEN_ENCRYPTION_KEY; s = statusMap(p.channelAvailability());
  assert.equal(s.voice, 'Setup with our team', 'without any platform at-rest key a new owner cannot save phone details'); assert.equal(s.sms, 'Setup with our team', 'or texting details');
  setGates('off');
});
await check('projection: Calendar is available only under an open self-service policy that allows connections', 'source', async () => {
  const p = need(projection, 'Shared channel availability projection'), cal = () => statusMap(p.channelAvailability()).calendar;
  setGates('on'); editJson('CALENDAR_SELF_SERVICE_POLICY_JSON', c => { c.tenants = [{ slug: 'pilot-shop', identity: 'f'.repeat(64) }]; });
  assert.equal(cal(), 'Setup with our team', 'a pilot tenant list does not admit new owners');
  for (const action of ['oauthStart', 'tokenExchange', 'eventCreate']) {
    setGates('on'); editJson('CALENDAR_SELF_SERVICE_POLICY_JSON', c => { c.limits[action] = 0; c.tenantLimits[action] = 0; });
    assert.equal(cal(), 'Setup with our team', `a zero ${action} limit means nobody can connect`);
  }
  setGates('on'); delete process.env.CALENDAR_SELF_SERVICE_ENABLED;
  assert.equal(cal(), 'Setup with our team', 'no Calendar execution policy');
  process.env.CALENDAR_EXECUTION_POLICY_JSON = JSON.stringify(controlledCalendarPolicy()); process.env.CALENDAR_EXECUTION_APPROVED_VERSION = 'fx_calendar_controlled_v1';
  assert.ok(await (await mod('netlify/functions/lib/calendar-connection.mjs')).calendarConnectionEnabled(), 'fixture: the controlled single-tenant policy really enables Calendar for its one shop');
  assert.equal(cal(), 'Setup with our team', 'a controlled single-tenant Calendar policy is not self-service');
  delete process.env.CALENDAR_EXECUTION_POLICY_JSON; delete process.env.CALENDAR_EXECUTION_APPROVED_VERSION; setGates('off');
});
await check('current projection: usage brake, used-up shared allowance and a foreign ledger hold phone and texting', 'source', async () => {
  const p = need(projection, 'Shared channel availability projection');
  assert.equal(typeof p.currentChannelAvailability, 'function', 'currentChannelAvailability() reads the brake and the shared allowance');
  const cur = async () => statusMap(await p.currentChannelAvailability());
  try {
    setGates('on'); await resetHolds(); assert.deepEqual(await cur(), EXPECT.on, 'no brake and an empty ledger keep everything available');
    await store.put('health', 'brake', { on: true, at: new Date().toISOString() }); let s = await cur();
    assert.equal(s.voice, 'Setup with our team', 'usage brake holds phone'); assert.equal(s.sms, 'Setup with our team', 'usage brake holds texting'); assert.equal(s.calendar, 'Available now');
    const e = need(endpoint, 'Public endpoint'); const body = await (await e.default(new Request(origin + '/api/channel-availability'))).json();
    assert.equal(statusMap(body).voice, 'Setup with our team', 'the public endpoint applies the usage brake');
    const prompt = salesDesk.salesSystem(await p.currentChannelAvailability()); assert.ok(prompt.includes('Phone answering: Setup with our team'), 'the sales prompt applies the usage brake');
    await resetHolds(); await store.put('managed_resource_admission', 'twilio_v1', ledgerRow({ numbers: 100, brands: 100, campaigns: 100 })); s = await cur();
    assert.equal(s.voice, 'Setup with our team', 'used-up number allowance holds phone'); assert.equal(s.sms, 'Setup with our team', 'and texting');
    await store.put('managed_resource_admission', 'twilio_v1', ledgerRow({ brands: 100 })); s = await cur();
    assert.equal(s.voice, 'Available now', 'numbers remain, so phone stays available'); assert.equal(s.sms, 'Setup with our team', 'no brand registration left, so texting is held');
    await store.put('managed_resource_admission', 'twilio_v1', ledgerRow({ monthlyCents: 1000000 - 115 })); s = await cur();
    assert.equal(s.voice, 'Available now', 'one number still fits the monthly bound'); assert.equal(s.sms, 'Setup with our team', 'a texting program does not fit the monthly bound');
    await store.put('managed_resource_admission', 'twilio_v1', { ...ledgerRow({}), providerAccountHash: 'e'.repeat(64) }); s = await cur();
    assert.equal(s.voice, 'Setup with our team', 'a ledger for another provider account is not trusted');
    await resetHolds(); setGates('off'); s = await cur(); assert.deepEqual(s, EXPECT.off);
  } finally { await resetHolds(); setGates('off'); }
});
for (const mode of ['off', 'on']) {
  await check(`endpoint: public GET returns the projection, tenant-free and cacheable (${mode})`, 'endpoint', async () => {
    setGates(mode); const e = need(endpoint, 'Public /api/channel-availability endpoint');
    assert.equal(e.config.path, '/api/channel-availability');
    const r = await e.default(new Request(origin + '/api/channel-availability')); assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control'), /^public, max-age=([1-9]\d{0,2})$/); assert.ok(Number(r.headers.get('cache-control').match(/max-age=(\d+)/)[1]) <= 300, 'browser cache at most five minutes');
    // Worst case a page can keep "Available now" after a gate is turned off: CDN freshness plus
    // stale-while-revalidate, plus the browser's own max-age. Keep that under five minutes.
    const cdn = r.headers.get('netlify-cdn-cache-control') || '', secs = re => Number((cdn.match(re) || [0, 0])[1]);
    assert.match(cdn, /s-maxage=\d+/, 'CDN caching is explicit');
    assert.ok(secs(/s-maxage=(\d+)/) + secs(/stale-while-revalidate=(\d+)/) + Number(r.headers.get('cache-control').match(/max-age=(\d+)/)[1]) <= 300, 'a turned-off gate stops showing as available within five minutes: ' + cdn);
    const body = await r.json(); assert.equal(body.version, 1); assert.deepEqual(statusMap(body), EXPECT[mode]);
    assert.deepEqual(Object.keys(body.channels[0]).sort(), ['detail', 'id', 'label', 'note', 'state', 'status']);
    assert.ok(!/AC[a-f0-9]{32}|fixture-|token|secret/i.test(JSON.stringify(body)), 'endpoint leaked configuration');
    assert.equal((await e.default(new Request(origin + '/api/channel-availability', { method: 'POST', body: '{}' }))).status, 405);
  });
}
for (const mode of ['off', 'on']) {
  await check(`sales desk: every homepage channel has a fact with the same status (${mode})`, 'sales', async () => {
    setGates(mode);
    const facts = typeof salesDesk.salesFacts === 'function' ? salesDesk.salesFacts() : salesDesk.SALES_FACTS;
    for (const id of IDS) {
      const text = facts.channels?.[SALES_KEY[id]];
      assert.ok(typeof text === 'string', `SALES_FACTS has no ${SALES_KEY[id]} entry for the homepage's ${LABELS[id]} card`);
      if (id === 'web') assert.match(text, /^Available/, 'website chat fact');
      else assert.ok(text.startsWith(EXPECT[mode][id]), `${SALES_KEY[id]} fact must start with "${EXPECT[mode][id]}" to match the homepage: ${text.slice(0, 120)}`);
      if (EXPECT[mode][id] !== 'Available now') assert.ok(text.includes(NOTE), `${SALES_KEY[id]} must carry the shared note`);
    }
    const prompt = salesDesk.salesSystem();
    const at = prompt.indexOf('PRODUCT FACTS:'); assert.ok(at >= 0, 'prompt carries PRODUCT FACTS');
    const promptFacts = JSON.parse(prompt.slice(at + 'PRODUCT FACTS:'.length).trim());
    for (const id of IDS) if (id !== 'web') assert.ok(promptFacts.channels?.[SALES_KEY[id]]?.startsWith(EXPECT[mode][id]), `PRODUCT FACTS in the prompt follow the current gates for ${SALES_KEY[id]}, not an import-time snapshot`);
    for (const id of IDS) assert.ok(prompt.includes(LABELS[id] + ': ' + EXPECT[mode][id]), `sales prompt lacks "${LABELS[id]}: ${EXPECT[mode][id]}"`);
    assert.ok(!/remain gated/.test(prompt) || mode === 'off', 'flag-on prompt still says channels remain gated');
    const fit = salesDesk.executeSalesTool('assess_workflow_fit', { required_features: ['phone_answering', 'google_calendar_sync', 'sms'], interested_features: [] });
    assert.equal(JSON.parse(fit.content).fit, mode === 'on' ? 'current_fit' : 'not_current_fit', 'fit tool follows the gates');
  });
}
const STATIC = { 'index.html': IDS, 'onboard.html': ['web', 'voice', 'sms', 'calendar'] };
for (const [page, ids] of Object.entries(STATIC)) {
  await check(`static fallback in ${page} equals the projection with every gate off`, 'static', async () => {
    setGates('off'); const html = readFileSync(join(root, page), 'utf8'), off = EXPECT.off;
    for (const id of ids) {
      const found = [...html.matchAll(new RegExp('data-channel-status="' + id + '" data-state="([a-z_]+)">([^<]+)<', 'g'))];
      assert.ok(found.length, `${page} has no status for ${LABELS[id]}`);
      for (const m of found) { assert.equal(m[2], off[id], `${page} ${id} fallback text`); assert.equal(m[1], off[id] === 'Available now' ? 'available' : 'team_setup'); }
    }
    if (page === 'index.html') { const p = need(projection, 'Shared projection').channelAvailability(); for (const row of p.channels) assert.ok(html.includes('data-channel-detail="' + row.id + '">' + row.detail.replace(/&/g, '&amp;') + '<'), 'homepage detail for ' + row.id + ' differs from the projection'); }
  });
}
await check('homepage FAQPage JSON-LD says exactly what the visible FAQ says', 'static', async () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const graph = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => JSON.parse(m[1])['@graph'] || []);
  const faq = graph.find(n => n['@type'] === 'FAQPage')?.mainEntity || []; assert.ok(faq.length, 'homepage FAQPage');
  const text = v => v.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const visible = new Map([...html.matchAll(/<details class="site-question"><summary>([\s\S]*?)<span aria-hidden="true">\+<\/span><\/summary>([\s\S]*?)<\/details>/g)].map(m => [text(m[1]), text(m[2])]));
  assert.equal(faq.length, visible.size, 'every visible question has structured data');
  for (const q of faq) assert.equal(q.acceptedAnswer?.text, visible.get(q.name), 'structured answer differs from the visible FAQ: ' + q.name);
  assert.ok(!/approved partner access/.test(JSON.stringify(faq)), 'no Thumbtack partner-access claim');
  const angi = need(projection, 'Shared projection').channelAvailability().channels.find(r => r.id === 'angi');
  assert.match(angi.detail, /after Angi turns on delivery/, 'Angi detail states the waiting step');
});
await check('public script keeps the shipped state on every failure path (VM)', 'static', async () => {
  const source = readFileSync(join(root, 'channel-availability.js'), 'utf8');
  const run = async fetchImpl => {
    const nodes = IDS.map(id => ({ attrs: { 'data-channel-status': id, 'data-state': EXPECT.off[id] === 'Available now' ? 'available' : 'team_setup' }, textContent: EXPECT.off[id], getAttribute(n) { return this.attrs[n] ?? null; }, setAttribute(n, v) { this.attrs[n] = String(v); } }));
    const document = { querySelector: () => nodes[0], querySelectorAll: sel => sel === '[data-channel-status]' ? nodes : [], dispatchEvent() {} };
    vm.runInNewContext(source, { document, window: {}, fetch: fetchImpl, setTimeout, clearTimeout, AbortController, CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o?.detail; } } });
    await new Promise(r => setTimeout(r, 25)); return nodes.map(n => n.textContent);
  };
  const off = IDS.map(id => EXPECT.off[id]), ok = body => ({ ok: true, status: 200, json: async () => body });
  const allOn = detail => ({ version: 1, channels: IDS.map(id => ({ id, label: LABELS[id], state: 'available', status: 'Available now', note: '', detail })) });
  assert.deepEqual(await run(() => Promise.reject(new TypeError('Failed to fetch'))), off, 'a thrown fetch keeps the shipped state');
  assert.deepEqual(await run(async () => ({ ok: false, status: 503, json: async () => allOn('') })), off, 'a 503 keeps the shipped state');
  assert.deepEqual(await run(async () => ({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('Unexpected end of JSON')) })), off, 'malformed JSON keeps the shipped state');
  assert.deepEqual(await run(async () => ok(allOn('x'.repeat(301)))), off, 'an invalid payload keeps the shipped state');
  assert.deepEqual(await run(async () => ok({ version: 2, channels: allOn('').channels })), off, 'an unknown version keeps the shipped state');
  assert.deepEqual(await run(async () => ok(allOn(''))), IDS.map(() => 'Available now'), 'control: a valid payload is applied');
});
await check('sales chat and desk use the current (brake/allowance-aware) projection', 'source', async () => {
  const chat = readFileSync(join(root, 'netlify/functions/chat.mjs'), 'utf8'), client = readFileSync(join(root, 'netlify/functions/client.mjs'), 'utf8'), e = readFileSync(join(root, 'netlify/functions/channel-availability.mjs'), 'utf8');
  assert.match(chat, /const availability = await currentChannelAvailability\(\);[\s\S]{0,200}salesSystem\(availability\)[\s\S]{0,200}executeSalesTool\(name, input, availability\)/, 'sales chat builds its prompt and fit tool from currentChannelAvailability()');
  assert.match(client, /channelAvailability: await currentChannelAvailability\(\)/, 'desk GET uses currentChannelAvailability()');
  assert.match(e, /await currentChannelAvailability\(\)/, 'public endpoint uses currentChannelAvailability()');
});
await check('build gate runs this check', 'source', async () => {
  const toml = readFileSync(join(root, 'netlify.toml'), 'utf8'), command = (toml.match(/^\s*command\s*=\s*"([^"]+)"/m) || [])[1] || '';
  const steps = command.split('&&').map(x => x.trim());
  assert.ok(steps.includes('node scripts/channel-availability-check.mjs'), 'netlify.toml build command includes node scripts/channel-availability-check.mjs');
  assert.ok(steps.indexOf('node scripts/channel-availability-check.mjs') < steps.indexOf('node scripts/build-site.mjs'), 'it runs before the public package is built');
});
await check('homepage prices appear once and no new em dash in the patched copy', 'static', async () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8'), visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const price of ['$99', '$249']) assert.equal(visible.split(price).length - 1, 1, price + ' appears once');
  const conn = html.slice(html.indexOf('id="connections"'), html.indexOf('id="week"')); assert.ok(!COPY_BANNED.test(conn), 'em dash in connections');
});

// ---------- Browser ----------
if (browserPhase) {
const { accessHash } = await mod('netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await mod('netlify/functions/lib/config.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'intake', 'chat', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect', 'google', 'website-installation', 'channel-availability']) {
  const m = await tryMod('netlify/functions/' + file + '.mjs'); if (m.__error) continue;
  for (const path of [].concat(m.config?.path || [])) handlers[path] = m.default;
}
report.handlers = Object.keys(handlers);
const playwright = await import(pathToFileURL(playwrightPath).href);
const browser = await playwright.chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
let serial = 0;
async function context(width, { failAvailability = false, token = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width <= 500 ? 844 : 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); ctx.setDefaultTimeout(8000);
  if (token) await ctx.addInitScript(({ origin, token }) => { if (location.origin === origin) { sessionStorage.setItem('mc-onboarding-session-v1', token); try { localStorage.setItem('mc-walkthrough-v1', 'seen'); } catch {} } }, { origin, token });
  await ctx.routeWebSocket('**/*', s => s.close());
  await ctx.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push(url.origin + url.pathname); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (failAvailability === 'abort' && url.pathname === '/api/channel-availability') return route.abort('failed');
      if (failAvailability && url.pathname === '/api/channel-availability') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postData(); } catch { body = null; }
      if (!handlers[url.pathname] || /"action":"(request_link|exchange)"/.test(body || '')) return route.fulfill({ status: 404, body: '{}' });
      const r = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body } : {}) }), { ip: '192.0.2.77' });
      return route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html');
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  return ctx;
}
async function shot(locator, name) { if (!shots) return; await locator.page().addStyleTag({ content: '.navbar,.site-skip,.skip-link,[class*="skip"]{position:static!important;visibility:hidden!important} #agent-launcher,.agent-launcher,[class*="agent-launch"]{display:none!important}' }).catch(() => {}); await locator.page().evaluate(() => document.activeElement?.blur?.()).catch(() => {}); const path = join(shots, `${label}-${name}.png`); await locator.screenshot({ path }); report.screenshots.push(path); }
const settle = page => page.waitForLoadState('networkidle').catch(() => {});
async function noHorizontalScroll(page, where) { const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth })); assert.ok(v.doc <= v.vw + 1, 'horizontal scroll at ' + where + ': ' + JSON.stringify(v)); }

for (const mode of ['off', 'on']) for (const width of [390, 1440]) {
  await check(`homepage connections show each channel's status (${mode}, ${width})`, 'homepage', async () => {
    setGates(mode); const ctx = await context(width); const page = await ctx.newPage(); page.on('pageerror', e => report.pageErrors.push('home: ' + e.message));
    try {
      await page.goto(origin + '/index.html'); await settle(page);
      const section = page.locator('#connections'); await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await shot(section, `home-connections-${mode}-${width}`);
      const cards = await page.$$eval('#connections .site-connection-list li', lis => lis.map(li => { const st = li.querySelector('[data-channel-status]'), note = li.querySelector('[data-channel-note]'); const vis = n => !!n && !n.hidden && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'; return { name: li.querySelector('h3')?.textContent.trim(), status: vis(st) ? st.textContent.trim() : null, note: vis(note) ? note.textContent.trim() : '', fontSize: st ? parseFloat(getComputedStyle(st).fontSize) : 0 }; }));
      assert.deepEqual(cards.map(c => c.name), IDS.map(id => LABELS[id]));
      for (const [i, id] of IDS.entries()) {
        assert.equal(cards[i].status, EXPECT[mode][id], `${LABELS[id]} card status`); assert.ok(cards[i].fontSize >= 12);
        assert.equal(cards[i].note, EXPECT[mode][id] === 'Available now' ? '' : NOTE, `${LABELS[id]} note`);
      }
      const faq = await page.$$eval('.site-question', qs => qs.map(q => q.textContent.replace(/\s+/g, ' ')));
      const phone = faq.find(t => /keep my business phone number/.test(t)) || '', leads = faq.find(t => /lead platforms/.test(t)) || '';
      assert.ok(phone.includes('Phone answering: ' + EXPECT[mode].voice), 'phone FAQ states phone availability'); assert.ok(phone.includes('Text messaging: ' + EXPECT[mode].sms), 'phone FAQ states texting availability');
      assert.ok(leads.includes('Thumbtack: Available now') && leads.includes('Angi: Available now'), 'lead platform FAQ states availability');
      await noHorizontalScroll(page, 'home ' + width);
    } finally { await ctx.close(); }
  });
}
for (const failure of ['503', 'abort']) {
  await check(`homepage keeps the conservative state when the availability request fails (${failure}, gates on)`, 'homepage', async () => {
    setGates('on'); const ctx = await context(390, { failAvailability: failure }); const page = await ctx.newPage();
    try { await page.goto(origin + '/index.html'); await settle(page); await page.waitForTimeout(150); const s = await page.$$eval('#connections [data-channel-status]', n => n.map(x => x.textContent.trim())); assert.deepEqual(s, IDS.map(id => EXPECT.off[id])); await shot(page.locator('#connections'), `home-connections-fallback-${failure}-390`); }
    finally { await ctx.close(); }
  });
}

async function seedOnboardingSession(width) { const token = sha('fx-onboard-' + ++serial + width), email = `fx-onboard-${serial}@example.test`; await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email, expiresAt: new Date(Date.now() + 3600000).toISOString() }); return token; }
for (const mode of ['off', 'on']) for (const width of [390, 1440]) {
  await check(`onboarding Step 1 labels each choice and previews honestly (${mode}, ${width})`, 'onboarding', async () => {
    setGates(mode); const ctx = await context(width, { token: await seedOnboardingSession(width) }); const page = await ctx.newPage(); page.on('pageerror', e => report.pageErrors.push('onboard: ' + e.message));
    try {
      await page.goto(origin + '/onboard.html'); await page.locator('#ob').waitFor({ state: 'visible' }); await settle(page);
      for (const v of ['voice', 'sms', 'calendar']) await page.check(`input[name=desiredChannels][value=${v}]`);
      await page.$eval('.connection-preview', e => { e.open = true; });
      await page.locator('#selected-connection-plan details[data-channel="voice"] summary').click().catch(() => {});
      await page.waitForTimeout(150);
      const section = page.locator('.form-section', { has: page.locator('#connection-preferences-label') }); await section.scrollIntoViewIfNeeded(); await shot(section, `onboard-step1-${mode}-${width}`);
      const picks = await page.$$eval('.connection-picks label', ls => ls.map(l => ({ value: l.querySelector('input').value, status: l.querySelector('[data-channel-status]')?.textContent.trim() || null })));
      for (const p of picks) assert.equal(p.status, EXPECT[mode][p.value], `${LABELS[p.value]} choice status`);
      const preview = await page.$eval('#selected-connection-plan', n => n.textContent.replace(/\s+/g, ' '));
      if (mode === 'off') {
        assert.ok(!/connection checklist covers/.test(preview), 'preview must not describe a checklist the workspace will not offer');
        assert.ok(preview.includes('Setup with our team. ' + NOTE), 'preview states availability');
        const note = await page.$eval('#connection-availability-note', n => !n.hidden && n.textContent); assert.match(note || '', /record your interest/);
        assert.match(await page.$eval('#business-number-hint', n => n.textContent), /Saved for your phone setup with our team/);
      } else {
        assert.ok(/connection checklist covers/.test(preview), 'available services keep their real setup steps');
        assert.equal(await page.$eval('#connection-availability-note', n => n.hidden), true);
      }
      await noHorizontalScroll(page, 'onboard ' + width);
    } finally { await ctx.close(); }
  });
}

async function seedDesk(width) {
  const slug = 'fx-avail-' + ++serial + '-' + width, token = sha('fx-desk-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Availability Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture-shop.example.com' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'voice', 'sms', 'calendar', 'angi'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token };
}
for (const mode of ['off', 'on']) for (const width of [390, 1440]) {
  await check(`desk Connections shows the same availability per channel (${mode}, ${width})`, 'desk', async () => {
    setGates(mode); const x = await seedDesk(width); const ctx = await context(width, { token: x.token });
    await ctx.addInitScript(slug => { try { localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); } catch {} }, x.slug);
    const page = await ctx.newPage(); page.on('pageerror', e => report.pageErrors.push('desk: ' + e.message));
    try {
      await page.goto(origin + '/desk.html?c=' + x.slug + '#setup'); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
      await page.locator('#setupGuide[data-connector-view="overview"] [data-guide-service]').first().waitFor(); await settle(page);
      await shot(page.locator('#setupGuide'), `desk-connections-${mode}-${width}`);
      const rows = await page.$$eval('#setupGuide [data-guide-service]', bs => bs.map(b => ({ id: b.dataset.guideService, status: b.querySelector('.connector-choice-status')?.textContent.trim(), availability: b.querySelector('.connector-availability')?.textContent.trim() || null })));
      for (const id of ['voice', 'sms', 'calendar']) {
        const row = rows.find(r => r.id === id); assert.ok(row, id + ' listed');
        const shown = [row.status, row.availability].filter(Boolean);
        assert.ok(shown.includes(EXPECT[mode][id]), `${LABELS[id]} in desk shows "${EXPECT[mode][id]}" (shows ${JSON.stringify(shown)})`);
        if (mode === 'on') assert.ok(!shown.includes('Setup with our team') && !shown.includes('Setup needs our help'), `${LABELS[id]} must not look gated when its gates are on`);
      }
      await page.locator('[data-guide-service="voice"]').click(); await page.waitForFunction(() => document.getElementById('setupGuide')?.dataset.connectorView === 'step');
      await page.waitForTimeout(150); await shot(page.locator('#setupGuide'), `desk-phone-page-${mode}-${width}`);
      const top = await page.$eval('#setupGuide .connector-page-top', n => n.textContent.replace(/\s+/g, ' '));
      assert.ok(top.includes(EXPECT[mode].voice), 'phone connector page shows availability: ' + top);
      if (mode === 'off') { const hold = await page.$eval('#setupGuide .connector-page-body', n => n.textContent.replace(/\s+/g, ' ')); assert.ok(hold.includes(NOTE), 'phone hold uses the shared note'); }
      await noHorizontalScroll(page, 'desk ' + width);
    } finally { await ctx.close(); }
  });
}
await browser.close();
} // browserPhase

setGates('off');
report.sourceAfter = hashes();
report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
const passed = report.checks.filter(c => c.pass).length;
report.summary = { passed, failed: report.checks.length - passed, total: report.checks.length, physicalNetwork: report.physicalNetwork, forbiddenBrowserRequests: report.forbidden.length, pageErrors: report.pageErrors.length };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
process.exit(report.summary.failed === 0 && report.physicalNetwork === 0 && report.sourceStable ? 0 : 1);
