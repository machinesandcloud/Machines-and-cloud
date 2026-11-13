// Independent adversarial probe of the ops P2 fix (QA-OPS2, adopted into the deploy gate in revision 2).
//   node scripts/ops-p2-qa-probe.mjs [<copy-root>] [--json out]   (root defaults to this repository)   (env -i, MC_MEMORY_STORE=1, MC_FAKE_MODEL=1, deny-remote sandbox)
// Actual handlers; memory store; Resend/Twilio captured in memory; every other fetch refused; sockets disabled.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const ROOT = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : new URL('..', import.meta.url).pathname).replace(/\/$/, '') + '/';
const arg = n => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null;
const deny = () => { throw new Error('probe: physical network disabled'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|ADMIN_)/.test(k)) delete process.env[k];
const base = 'http://127.0.0.1:8897', OP = 'qa-op@example.test', KEY = 'qa-ops2-shared-admin-key-0123456789';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: base, ADMIN_EMAILS: OP, ADMIN_KEY: KEY, RESEND_API_KEY: 'intercepted', STEVE_EMAIL: 'founder@example.test', STEVE_PHONE: '+17135550100', MC_TWILIO_NUMBER: '+17135550101', TWILIO_ACCOUNT_SID: 'ACintercepted00000000000000000000', TWILIO_AUTH_TOKEN: 'intercepted-token' });
const mail = [], sms = [], blocked = []; let resendDelay = 0;
globalThis.fetch = async (input, init = {}) => { const u = new URL(String(input));
  if (u.origin === 'https://api.resend.com') { if (resendDelay) await new Promise(r => setTimeout(r, resendDelay)); mail.push(JSON.parse(init.body)); return Response.json({ id: 'x' + mail.length }); }
  if (u.origin === 'https://api.twilio.com' && /Messages\.json$/.test(u.pathname)) { sms.push(Object.fromEntries(new URLSearchParams(String(init.body)))); return Response.json({ sid: 'SM' + sms.length, status: 'queued' }, { status: 201 }); }
  if (u.origin === 'https://api.twilio.com') { return Response.json({}, { status: 200 }); }
  blocked.push(u.origin + u.pathname); throw new Error('net disabled'); };
const logs = []; for (const m of ['log', 'warn', 'error', 'info']) { const o = console[m].bind(console); console[m] = (...a) => { logs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); if (m === 'log' && String(a[0]).startsWith('QA')) o(...a); }; }
const imp = p => import(ROOT + p);
const store = await imp('netlify/functions/lib/store.mjs'), access = await imp('netlify/functions/lib/access.mjs'), config = await imp('netlify/functions/lib/config.mjs');
const admin = (await imp('netlify/functions/admin.mjs')).default, manage = (await imp('netlify/functions/manage.mjs')).default, client = (await imp('netlify/functions/client.mjs')).default;
const scheduler = await imp('netlify/functions/scheduler.mjs'), send = await imp('netlify/functions/lib/send.mjs'), onboard = (await imp('netlify/functions/onboard.mjs')).default;
// Release 2 (RC2-T1): a gate run at a fan-out hour (21:00-21:59 Houston autoflag, 18 digest, Mon 8 weekly, 1st 9 monthly)
// made scheduler.run start the real background fan-out over loopback, which the no-outbound check (N00/N0) rightly
// refuses. Claim today's fan-outs first, as a deployed scheduler has after its first run of the hour; nothing here tests fan-outs.
{ const { claimFanout } = await imp('netlify/functions/lib/fanout.mjs'); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); for (const kind of ['digest', 'autoflag', 'weekly', 'monthly']) await claimFanout(kind, day); }
const results = []; let serial = 0;
const check = async (id, name, fn) => { try { const d = await fn(); results.push({ id, name, pass: true, ...(d === undefined ? {} : { detail: d }) }); console.log('QA PASS ' + id + ' ' + name + (d !== undefined ? ' :: ' + JSON.stringify(d).slice(0, 300) : '')); } catch (e) { results.push({ id, name, pass: false, error: String(e?.message || e).slice(0, 800) }); console.log('QA FAIL ' + id + ' ' + name + ' :: ' + String(e?.message || e).slice(0, 400)); } };
const call = async (h, path, body, { token, method = 'POST', ip, headers = {}, origin = base } = {}) => { const r = await h(new Request(base + path, { method, headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, ...(method === 'GET' || body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }), { ip: ip || '192.0.2.' + (++serial % 200 + 1) }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, body: json, text, headers: Object.fromEntries(r.headers) }; };
const cli = (path, body, method = body ? 'POST' : 'GET', key = KEY) => call(admin, path, body, { method, headers: { 'x-admin-key': key, 'x-nf-client-connection-ip': '198.51.100.23' } });
const session = async (email, scope = 'onboarding') => { const t = createHash('sha256').update('qa-' + scope + ++serial).digest('hex'); await store.put('access_sessions', access.accessHash(t), { email, scope, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }); return t; };
const opToken = await session(OP, 'operator');
const auditKeys = () => store.list('admin_key_audit', '');
const newRows = async before => { const out = []; for (const k of await auditKeys()) if (!before.has(k)) out.push(await store.get('admin_key_audit', k)); return out; };
// fixtures: one self-service signup, one legacy shop
const ownerEmail = 'ss-owner-' + Date.now() + '@example.test', ownerTok = await session(ownerEmail);
const su = await call(onboard, '/api/onboard', { name: 'SS Owner', business: 'Self Serve Air', email: ownerEmail, phone: '7135550142', trade: 'HVAC', city: 'Houston', serviceArea: 'Katy', hours: 'Mon-Fri 8am-5pm', windows: '8 to 12', services: 'AC repair', desiredChannels: ['web'] }, { token: ownerTok });
assert.equal(su.status, 200, su.text); const SS = su.body.slug;
const L = config.newClient({ slug: 'legacy-qa', ownerKey: 'LEGACYQAOWNERKEY0123456789abcdef0123456789ab', owner: { name: 'Legacy QA', email: 'legacy-qa@example.test', phone: '+17135550177' }, business: { name: 'Legacy QA Plumbing', trade: 'Plumbing', city: 'Houston' } });
delete L.onboarding; L.status = 'live'; L.liveAt = new Date(Date.now() - 30 * 86400000).toISOString(); L.phone = { ...(L.phone || {}), twilioNumber: '+17135550199', businessNumber: '+17135550198' };
await store.put('clients', L.slug, L); await store.indexClient?.(L);

// ---------------- ADMIN_KEY ----------------
await check('Q09-1', 'audit is not evadable by a non-string slug (legacy records read must name the shop)', async () => {
  const before = new Set(await auditKeys());
  const r = await cli('/api/admin', { slug: [L.slug], action: 'records', kind: 'events' });
  const rows = await newRows(before);
  return assert.ok(!(r.status === 200 && rows.every(x => x.slug !== L.slug)), `read status ${r.status}; audit slug=${JSON.stringify(rows.map(x => x.slug))}`);
});
await check('Q09-2', 'storage failure on the audit write fails closed for GET, reads, and state-changing POSTs (brake/delete/update)', async () => {
  const brakeBefore = await store.get('health', 'brake'); const lBefore = JSON.stringify(await store.get('clients', L.slug));
  const set = Map.prototype.set; Map.prototype.set = function (k, v) { if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}\/\d{4}-/.test(k)) throw new Error('blobs 500'); return set.call(this, k, v); };
  let out; try { out = [await cli('/api/admin'), await cli('/api/admin?full=1'), await cli('/api/admin', { action: 'brake', on: true }), await cli('/api/admin', { slug: L.slug, action: 'records', kind: 'events' }), await cli('/api/admin', { slug: L.slug, status: 'paused' }), await cli('/api/admin', { action: 'run_scheduler' }), await cli('/api/admin', { slug: L.slug, action: 'delete' })]; }
  finally { Map.prototype.set = set; }
  assert.deepEqual(out.map(o => o.status), [503, 503, 503, 503, 503, 503, 503]); assert.ok(out.every(o => o.body.error === 'audit_unavailable' && !o.body.clients && !o.body.records));
  assert.deepEqual(await store.get('health', 'brake'), brakeBefore); assert.equal(JSON.stringify(await store.get('clients', L.slug)), lBefore);
});
await check('Q09-3', 'audit rows carry no key, email, phone, raw IP or free text', async () => {
  const before = new Set(await auditKeys());
  await cli('/api/admin', { slug: L.slug, action: 'prompt', channel: 'sms', contact: '+17135559999', at: '2026-11-12T10:00' });
  await cli('/api/admin', { slug: L.slug, action: 'records', kind: 'owner@evil.test' }); await cli('/api/admin', { slug: 'Not A Slug owner@x.test', action: 'x y z' });
  await cli('/api/admin', { slug: L.slug, owner: { email: 'leak@example.test' } });
  const rows = await newRows(before), t = JSON.stringify(rows);
  for (const bad of [KEY, '198.51.100.23', '+17135559999', 'owner@evil.test', 'owner@x.test', 'leak@example.test', L.ownerKey]) assert.ok(!t.includes(bad), 'audit contains ' + bad);
  assert.equal(rows.length, 4); return rows.map(r => r.action + ':' + r.slug);
});
await check('Q09-4', 'self-service: every POST action via the shared key is refused 409, nothing mutated', async () => {
  const before = JSON.stringify(await store.get('clients', SS)); const codes = {};
  for (const a of ['prompt', 'tasks', 'records', 'put_conversation', 'autoflag', 'day7', 'log_event', 'schedule_task', 'cancel_task', 'reactivate', 'nudge_task', 'delete', 'digest', 'clear_optout', undefined]) { const r = await cli('/api/admin', { slug: SS, action: a, status: 'live', kind: 'conversations', messages: [{ role: 'user', content: 'x' }] }); codes[a || 'update'] = r.status; }
  assert.ok(Object.values(codes).every(c => c === 409), JSON.stringify(codes)); assert.equal(JSON.stringify(await store.get('clients', SS)), before);
});
await check('Q09-5', 'shared key GET list/full exposes no self-service owner, phone, plan, portal, events', async () => {
  for (const p of ['/api/admin', '/api/admin?full=1']) { const r = await cli(p); assert.equal(r.status, 200); const row = r.body.clients.find(c => c.slug === SS);
    assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'managedBy', 'name', 'selfService', 'slug', 'status']); assert.ok(!r.text.includes(ownerEmail) && !r.text.includes('7135550142'));
    if (r.body.events) assert.ok(r.body.events.every(e => e.slug !== SS)); }
});
await check('Q09-6', 'documented legacy CLI flows still work and are audited (list, run_scheduler, fanout, brake, last_run, ratelimit_reset, records, prompt, tasks, log_event, schedule_task, nudge_task, update, delete)', async () => {
  const before = new Set(await auditKeys()); const out = {};
  const D = config.newClient({ slug: 'legacy-del', ownerKey: 'k'.repeat(48), owner: { name: 'D', email: 'd@example.test', phone: '+17135550166' }, business: { name: 'Del', trade: 'HVAC', city: 'Houston' } }); delete D.onboarding; D.status = 'testing'; await store.put('clients', D.slug, D);
  const steps = [['list', null], ['run_scheduler', { action: 'run_scheduler' }], ['fanout', { action: 'fanout', kind: 'digest' }], ['brake', { action: 'brake', on: false }], ['last_run', { action: 'last_run' }], ['ratelimit_reset', { action: 'ratelimit_reset', ip: '203.0.113.1' }], ['records', { slug: L.slug, action: 'records', kind: 'leads' }], ['prompt', { slug: L.slug, action: 'prompt', channel: 'voice' }], ['tasks', { slug: L.slug, action: 'tasks' }], ['log_event', { slug: L.slug, action: 'log_event', type: 'note' }], ['schedule_task', { slug: L.slug, action: 'schedule_task', type: 'visit_check' }], ['nudge_task', { slug: L.slug, action: 'nudge_task' }], ['update', { slug: L.slug, plan: 'growth' }], ['delete', { slug: D.slug, action: 'delete' }]];
  for (const [n, b] of steps) { const r = b ? await cli('/api/admin', b) : await cli('/api/admin'); out[n] = r.status; }
  const rows = await newRows(before);
  assert.ok(Object.entries(out).every(([n, s]) => s === 200 || (n === 'fanout' && s === 400)), JSON.stringify(out)); assert.equal(rows.length, steps.length, 'audited ' + rows.length + '/' + steps.length);
  return out;
});
await check('Q09-7', 'other ADMIN_KEY surfaces: /api/intake GET export with the shared key is audited (claim: every ADMIN_KEY request audited)', async () => {
  const intake = (await imp('netlify/functions/intake.mjs')).default; const before = new Set(await auditKeys());
  const r = await call(intake, '/api/intake?audience=all&format=json', undefined, { method: 'GET', headers: { 'x-admin-key': KEY } });
  const rows = await newRows(before); assert.ok(!(r.status === 200 && rows.length === 0), `intake export ${r.status} with ${rows.length} audit rows`);
});

// ---------------- pagination ----------------
for (let n = 0; n < 130; n++) { const slug = 'pg-' + String(n * 2).padStart(4, '0'); const c = config.newClient({ slug, ownerKey: 'PGK' + n, owner: { name: 'PG ' + n, email: slug + '@ex.test', phone: '+1713555' + (2000 + n) }, business: { name: 'Page Shop ' + n, trade: 'HVAC', city: 'Houston' } }); c.onboarding = { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }; c.status = 'testing'; c.createdAt = new Date().toISOString(); await store.put('clients', slug, c); }
await check('QP-1', 'paging while customers are added/removed: no duplicates, no skipped pre-existing survivors, new keys after cursor appear', async () => {
  const startKeys = (await store.list('clients', '')); let cursor = null, pages = 0; const seen = [], removed = new Set(), added = [];
  do { const r = await call(manage, '/api/manage' + (cursor ? '?cursor=' + cursor : ''), undefined, { token: opToken, method: 'GET' }); assert.equal(r.status, 200, r.text.slice(0, 200)); r.body.customers.forEach(c => seen.push(c.slug)); cursor = r.body.nextCursor; pages++;
    if (pages === 1) { // mutate between pages
      for (const s of ['pg-0200', 'pg-0002']) { await store.del('clients', s); removed.add(s); }
      for (const s of ['pg-0201', 'pg-0001']) { const c = await store.get('clients', 'pg-0010'); await store.put('clients', s, { ...c, slug: s }); added.push(s); } }
  } while (cursor && pages < 30);
  const dup = seen.filter((s, i) => seen.indexOf(s) !== i); assert.deepEqual(dup, []);
  const survivors = startKeys.filter(k => !removed.has(k)), missing = survivors.filter(k => !seen.includes(k)); assert.deepEqual(missing, []);
  assert.ok(seen.includes('pg-0201'), 'insert after cursor not seen'); return { pages, seen: seen.length, insertedBeforeCursorSeen: seen.includes('pg-0001'), removedSeen: [...removed].filter(s => seen.includes(s)) };
});
await check('QP-2', 'each page request is authenticated: no token / owner token / malformed cursor', async () => {
  const a = await call(manage, '/api/manage?cursor=pg-0100', undefined, { method: 'GET' }), b = await call(manage, '/api/manage?cursor=pg-0100', undefined, { method: 'GET', token: ownerTok }), c = await call(manage, '/api/manage?cursor=../x', undefined, { method: 'GET', token: opToken });
  assert.deepEqual([a.status, b.status, c.status], [401, 401, 400]);
});
await check('QP-3', 'list row of the operator page carries no setup/services/rules/notes/records/supportReports', async () => {
  const r = await call(manage, '/api/manage', undefined, { token: opToken, method: 'GET' }); const row = r.body.customers[0];
  for (const k of ['setup', 'services', 'rules', 'notes', 'records', 'supportReports', 'operations', 'phoneActivation', 'serviceChecks', 'leadSources']) assert.equal(row[k], undefined, k);
  assert.equal(row.summaryOnly, true); return { bytes: Buffer.byteLength(r.text), keys: Object.keys(row).length };
});

// ---------------- uniform sign-in ----------------
await check('QS-1', 'operator vs non-operator: identical status, body and headers (test inbox and real-mail modes)', async () => {
  const a = await call(manage, '/api/manage', { action: 'request_link', email: OP }, { ip: '203.0.113.201' }), b = await call(manage, '/api/manage', { action: 'request_link', email: 'nobody-1@example.test' }, { ip: '203.0.113.202' });
  const saved = process.env.URL; process.env.URL = 'https://qa-ops2.example.test'; let c, d;
  try { await store.put('access_rate', 'x', {}); c = await call(manage, '/api/manage', { action: 'request_link', email: OP }, { ip: '203.0.113.203', origin: 'https://machinesandcloud.com' }); d = await call(manage, '/api/manage', { action: 'request_link', email: 'nobody-2@example.test' }, { ip: '203.0.113.204', origin: 'https://machinesandcloud.com' }); } finally { process.env.URL = saved; }
  for (const [x, y] of [[a, b], [c, d]]) { assert.equal(x.status, y.status); assert.equal(x.text, y.text); assert.deepEqual(x.headers, y.headers); }
  return { status: a.status, headers: Object.keys(a.headers).sort() };
});
await check('QS-2', 'timing: median handler latency operator vs non-operator (Resend stub 0 ms and 150 ms)', async () => {
  const saved = process.env.URL; process.env.URL = 'https://qa-ops2.example.test'; const out = {};
  try { for (const delay of [0, 150]) { resendDelay = delay; const t = { op: [], other: [] };
      for (let i = 0; i < 24; i++) for (const [k, email] of [['op', OP], ['other', 'nobody-t' + i + '@example.test']]) {
        await store.del('access_rate', 'global'); for (const key of await store.list('access_rate', '')) await store.del('access_rate', key);
        const s = performance.now(); const r = await call(manage, '/api/manage', { action: 'request_link', email }, { ip: '203.0.113.' + (100 + i), origin: 'https://machinesandcloud.com' }); t[k].push(performance.now() - s); assert.equal(r.status, 202, r.text); }
      const med = a => a.sort((x, y) => x - y)[a.length >> 1]; out['resend' + delay + 'ms'] = { opMedianMs: +med(t.op).toFixed(2), otherMedianMs: +med(t.other).toFixed(2), opMinMs: +Math.min(...t.op).toFixed(2), otherMaxMs: +Math.max(...t.other).toFixed(2) }; } }
  finally { process.env.URL = saved; resendDelay = 0; }
  return out;
});

// ---------------- alerts: every founder alert kind ----------------
await check('QA-1', 'no owner key in any founder email/SMS or log across alert kinds (health x3, unacknowledged alert, legacy flag, legacy cancel, provision, digest/weekly fanout, statement)', async () => {
  mail.length = 0; sms.length = 0; logs.length = 0;
  for (let i = 0; i < 3; i++) await store.logEvent(L, 'sms_failed', { message: 'f' + i });
  for (let i = 0; i < 3; i++) await store.logEvent(L, 'voice_failed', { message: 'v' + i });
  await scheduler.run({ all: true });
  // legacy owner portal flag + cancel use the permanent key
  const conv = await store.getConversation(L, 'sms', '+17135557777'); conv.messages = [{ role: 'user', content: 'hi', at: new Date().toISOString() }]; await store.saveConversation(conv);
  const flag = await call(client, '/api/client?c=' + L.slug + '&k=' + L.ownerKey, { action: 'flag', channel: 'sms', contact: '+17135557777', note: 'check' });
  const cancel = await call(client, '/api/client?c=' + L.slug + '&k=' + L.ownerKey, { action: 'cancel', reason: 'qa' });
  try { const prov = (await imp('netlify/functions/provision-background.mjs')).default; await prov(new Request(base + '/.netlify/functions/provision-background', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: L.slug, key: L.ownerKey }) })); } catch (e) { logs.push('provision threw ' + e.message); }
  // exact formats of the remaining call sites that still build key links (desk.mjs:596, onboard-build-background:122)
  await send.notifySteve('Unacknowledged emergency: ' + L.business.name, 'pipe burst\n\n' + base + '/desk?c=' + L.slug + '&k=' + L.ownerKey);
  await send.notifySteve('Built: ' + L.slug, 'Pages read: 0. Missing: -\n' + base + '/desk?c=' + L.slug + '&k=' + L.ownerKey);
  await send.notifySteve('Digest: x', 'Your portal https://x.test/desk?c=' + L.slug + '&k=' + L.ownerKey);
  const founderMail = mail.filter(m => [].concat(m.to).includes('founder@example.test')), founderSMS = sms.filter(m => m.To === '+17135550100');
  const t = JSON.stringify([founderMail, founderSMS, logs]);
  assert.ok(!t.includes(L.ownerKey), 'owner key leaked: ' + (t.match(new RegExp('.{80}' + L.ownerKey)) || [''])[0]);
  return { founderMail: founderMail.length, founderSMS: founderSMS.length, subjects: founderMail.map(m => m.subject), flag: flag.status, cancel: cancel.status, logLines: logs.length };
});
await check('N0', 'no physical/unexpected outbound request', async () => assert.deepEqual(blocked, []));
const failed = results.filter(r => !r.pass); if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`QA probe: ${results.length - failed.length} passed, ${failed.length} failed`); process.exit(failed.length ? 1 : 0);
