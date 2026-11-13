// PRA-FC2-03/04/05/11/13 server and source checks. Actual handlers and libraries, memory storage, fake model,
// all physical transport denied. Run from the worktree root: node qa-artifacts/claude-collaboration/fc2-spanish/fc2-spanish-check.mjs [--output file.json]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const root = resolve('.'), origin = 'http://127.0.0.1:8921', lib = p => pathToFileURL(resolve(root, p)).href, sha = v => createHash('sha256').update(v).digest('hex');
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const report = { at: new Date().toISOString(), checks: [], physicalNetwork: 0 };
const deny = () => { report.physicalNetwork++; throw new Error('physical transport forbidden'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async input => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };
const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
const { workspaceTenant } = await import(lib('netlify/functions/lib/workspace-identity.mjs'));
const desk = await import(lib('netlify/functions/lib/desk.mjs'));
const followup = await import(lib('netlify/functions/lib/request-followup.mjs'));
const client = (await import(lib('netlify/functions/client.mjs'))).default;
const GSM = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 86400000));
let serial = 0;
async function fixture() {
  const slug = 'fc2s-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FC2S-' + serial, owner: { name: 'Ana Owner', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Bayou Plumbing', trade: 'Plumbing', serviceArea: ['Katy'], hours: 'Mon-Sat 7am-6pm', spanish: true, website: 'https://bayouplumbing.example' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['Drain cleaning'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Sat 7am-6pm');
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const call = async (method, query, body) => { const r = await client(new Request(origin + '/api/client?c=' + slug + (query || ''), { method, headers: { Authorization: 'Bearer ' + token, Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.9' }); return { status: r.status, text: await r.text() }; };
  return { slug, c, call, tenantIdentity: workspaceTenant(c) };
}
async function check(name, run) { try { await run(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); } catch (error) { report.checks.push({ name, pass: false, error: String(error.stack || error).slice(0, 1500) }); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]); } }
const bayou = { business: { name: 'Bayou Plumbing' } }, lead = { id: '77401d911f' };

// ---- FC2-05 ----
await check('FC2-05 English request/quote follow-up texts are byte-identical to the release-4 wording', () => {
  assert.equal(followup.requestFollowupText(bayou, { ...lead, language: 'en' }, { purpose: 'request_followup' }), 'Bayou Plumbing: checking once about your service request (ref 77401d911f). Reply here if you need help with it. Reply STOP to end texts or HELP for help.');
  assert.equal(followup.requestFollowupText(bayou, lead, { purpose: 'quote_followup', quoteUrl: 'https://bayouplumbing.example/q/1' }), 'Bayou Plumbing: any questions about the quote for your requested service (ref 77401d911f)? Your quote: https://bayouplumbing.example/q/1 Reply here for help. This is your one requested quote follow-up. Reply STOP to end texts or HELP for help.');
  assert.equal(followup.requestFollowupText(bayou, lead, { purpose: 'quote_followup', quoteUrl: '' }), 'Bayou Plumbing: any questions about the quote for your requested service (ref 77401d911f)? Reply here for help. This is your one requested quote follow-up. Reply STOP to end texts or HELP for help.');
});
await check('FC2-05 a Spanish request gets Spanish follow-up texts (both purposes): ref, quote link, STOP/ALTO/AYUDA, GSM-7, no English', () => {
  const es = { ...lead, language: 'es' };
  const r = followup.requestFollowupText(bayou, es, { purpose: 'request_followup' }), q = followup.requestFollowupText(bayou, es, { purpose: 'quote_followup', quoteUrl: 'https://bayouplumbing.example/q/1' });
  for (const t of [r, q]) { assert.ok(t.startsWith('Bayou Plumbing: '), t); assert.match(t, /\(ref 77401d911f\)/); assert.match(t, /Responda STOP o ALTO para dejar de recibir mensajes, o AYUDA para ayuda\.$/); assert.ok(GSM.test(t), 'GSM-7: ' + t); assert.doesNotMatch(t, /\b(?:Reply|checking|questions|quote|texts)\b/, t); }
  assert.match(r, /le escribimos una sola vez sobre su solicitud de servicio/); assert.match(q, /Su presupuesto: https:\/\/bayouplumbing\.example\/q\/1 Si necesita ayuda/);
  assert.equal(desk.template('request_followup', es), desk.TEMPLATES_ES.request_followup);
  report.spanishFollowup = { request: { text: r, length: r.length, segments: r.length <= 160 ? 1 : Math.ceil(r.length / 153) }, quote: { text: q, length: q.length } };
});
await check('FC2-05 the owner’s preview (readRequestAutomation templates) follows the saved request language', async () => {
  const f = await fixture();
  const es = await store.addRecord('leads', f.slug, { tenantIdentity: f.tenantIdentity, customer_name: 'Rosa', phone: '+18325550144', issue: 'calentador gotea', reason: 'wants_call', outcome: 'wants_call', status: 'open', channel: 'web', urgency: 'this_week', language: 'es' });
  const en = await store.addRecord('leads', f.slug, { tenantIdentity: f.tenantIdentity, customer_name: 'Ray', phone: '+18325550145', issue: 'leak', reason: 'wants_call', outcome: 'wants_call', status: 'open', channel: 'web', urgency: 'this_week', language: 'en' });
  const a = await followup.readRequestAutomation(f.c, es.id), b = await followup.readRequestAutomation(f.c, en.id);
  assert.match(a.templates.request_followup, /^Bayou Plumbing: le escribimos una sola vez/); assert.match(a.templates.quote_followup, /presupuesto/);
  assert.match(b.templates.request_followup, /^Bayou Plumbing: checking once/);
  const detail = JSON.parse((await f.call('GET', '&request=' + encodeURIComponent(es.id))).text);
  report.requestDetailKeys = Object.keys(detail || {}).slice(0, 20);
});

// ---- FC2-04 ----
await check('FC2-04 bookings and requests CSV carry a language column ("es" for a Spanish customer)', async () => {
  const f = await fixture();
  await store.addRecord('bookings', f.slug, { tenantIdentity: f.tenantIdentity, customer_name: 'Rosa', phone: '+17135550199', address: '4410 Bellaire Blvd', issue: 'service visit', date: day(2), window: '8 to 12', status: 'booked', channel: 'web', language: 'es' });
  await store.addRecord('bookings', f.slug, { tenantIdentity: f.tenantIdentity, customer_name: 'Ray', phone: '+17135550198', address: '1 Main', issue: 'leak', date: day(3), window: '12 to 5', status: 'booked', channel: 'web', language: 'en' });
  await store.addRecord('leads', f.slug, { tenantIdentity: f.tenantIdentity, customer_name: 'Lupe', phone: '+17135550197', issue: 'fuga', reason: 'wants_call', outcome: 'wants_call', status: 'open', channel: 'web', urgency: 'this_week', language: 'es' });
  for (const kind of ['bookings', 'leads']) {
    const r = await f.call('GET', '&export=' + kind); assert.equal(r.status, 200, r.text.slice(0, 200));
    const rows = r.text.replace(/^﻿/, '').trim().split('\r\n').map(line => line.split(',')), col = rows[0].indexOf('language');
    assert.ok(col >= 0, kind + ' header ' + rows[0]);
    const byName = Object.fromEntries(rows.slice(1).map(row => [row[rows[0].indexOf('customer_name')], row[col]]));
    if (kind === 'bookings') { assert.equal(byName.Rosa, 'es'); assert.equal(byName.Ray, 'en'); } else assert.equal(byName.Lupe, 'es');
  }
});

// ---- FC2-11 ----
const blockAt = (blocks, d) => blocks.filter(b => b.date === d);
await check('FC2-11 one saved change blocks a labeled range of whole days; each day is labeled, removable and excluded from availability', async () => {
  const f = await fixture(), start = day(10), end = day(12);
  const r = await f.call('POST', '', { action: 'availability_block', date: start, window: '', through: end, label: '  Thanksgiving   week ' });
  assert.equal(r.status, 200, r.text); const saved = JSON.parse(r.text).availabilityBlocks;
  for (const d of [start, day(11), end]) { const b = blockAt(saved, d); assert.equal(b.length, 1, d); assert.equal(b[0].label, 'Thanksgiving week'); assert.equal(b[0].window, ''); }
  assert.equal(saved.length, 3);
  const open = await store.getAvailability(f.c, day(9), 5); const dates = open.openings.filter(o => o.windows.length).map(o => o.date);
  for (const d of [start, day(11), end]) assert.ok(!dates.includes(d), 'blocked day offered: ' + d);
  const again = JSON.parse((await f.call('POST', '', { action: 'availability_block', date: start, window: '', through: end, label: 'Thanksgiving' })).text).availabilityBlocks;
  assert.equal(again.length, 3, 'no duplicates'); assert.equal(blockAt(again, day(11))[0].label, 'Thanksgiving', 'label updated');
  const removed = JSON.parse((await f.call('POST', '', { action: 'availability_unblock', date: day(11), window: '' })).text).availabilityBlocks;
  assert.deepEqual(removed.map(b => b.date), [start, end]);
  const owner = JSON.parse((await f.call('GET', '')).text); assert.equal(owner.availabilityBlocks.find(b => b.date === start)?.label, 'Thanksgiving');
});
await check('FC2-11 a single day or window still works unlabeled exactly as before', async () => {
  const f = await fixture();
  const one = JSON.parse((await f.call('POST', '', { action: 'availability_block', date: day(5), window: '8 to 12' })).text).availabilityBlocks;
  assert.deepEqual(one, [{ date: day(5), window: '8 to 12', existingBookings: 0 }]);
});
await check('FC2-11 invalid ranges and labels are refused without saving anything', async () => {
  const f = await fixture(), bad = [
    [{ date: day(5), window: '8 to 12', through: day(6) }, 'invalid_range'],
    [{ date: day(6), window: '', through: day(5) }, 'invalid_range'],
    [{ date: day(2), window: '', through: day(40) }, 'invalid_range'],
    [{ date: day(2), window: '', label: 'x'.repeat(61) }, 'invalid_label'],
    [{ date: day(2), window: '', label: '<b>Closed</b>' }, 'invalid_label'],
    [{ date: day(2), window: '', label: 7 }, 'invalid_label'],
    [{ date: day(2), window: '', through: 20261126 }, 'invalid_range'],
  ];
  for (const [body, code] of bad) { const r = await f.call('POST', '', { action: 'availability_block', ...body }); assert.equal(r.status, 400, JSON.stringify(body) + r.text); assert.equal(JSON.parse(r.text).error, code, JSON.stringify(body)); }
  const unblockRange = await f.call('POST', '', { action: 'availability_unblock', date: day(2), window: '', through: day(3) }); assert.equal(unblockRange.status, 400);
  assert.deepEqual(JSON.parse((await f.call('GET', '')).text).availabilityBlocks, []);
  const max = await f.call('POST', '', { action: 'availability_block', date: day(1), window: '', through: day(31), label: 'Closed' }); assert.equal(max.status, 200, max.text); assert.equal(JSON.parse(max.text).availabilityBlocks.length, 31);
});

// ---- FC2-03 / FC2-11 / FC2-13 source contracts (browser behaviour is in fc2-spanish-ui-check.mjs) ----
await check('FC2-03 every widget string key has an English and a Spanish version', () => {
  const src = readFileSync(resolve(root, 'embed.js'), 'utf8'), table = src.slice(src.indexOf('var TEXT={'), src.indexOf('function T(key'));
  const keys = block => [...block.matchAll(/(?:^|[,{]\s*)([a-zA-Z]+):(?:'|function)/g)].map(m => m[1]);
  const en = keys(table.slice(table.indexOf('en:{'), table.indexOf('es:{'))), es = keys(table.slice(table.indexOf('es:{')));
  assert.ok(en.length >= 30, 'en keys ' + en.length); for (const k of en) assert.ok(es.includes(k), 'missing es: ' + k);
  for (const english of ['Chat with us', 'Type your message', 'Automated front desk', 'For urgent help', 'Website chat is unavailable right now', 'Chat has reached its daily limit', 'The reply was interrupted, so']) assert.equal(src.split(english).length - 1, 1, 'English literal outside the table: ' + english);
});
await check('FC2-13 onboarding has trade example sets for HVAC, plumbing, electrical and a generic fallback', () => {
  const src = readFileSync(resolve(root, 'onboard.js'), 'utf8');
  for (const k of ['hvac', 'plumbing', 'electrical', 'other']) assert.match(src, new RegExp('\\b' + k + ': \\{ services: '));
});
report.pass = report.checks.every(c => c.pass) && report.physicalNetwork === 0;
if (option('--output')) writeFileSync(option('--output'), JSON.stringify(report, null, 1));
console.log(`${report.checks.filter(c => c.pass).length}/${report.checks.length} pass, physicalNetwork=${report.physicalNetwork}`);
process.exit(report.pass ? 0 : 1);
