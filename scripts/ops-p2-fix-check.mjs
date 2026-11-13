// Operations P2/P3 fixes (PRA-OPS-07, 09, 10, 11, 12, 13, 14, 16; 15 where present). Revision 2 adds QA-OPS2 D1/D2,
// ADMIN_KEY audit on the webhook/chat routes, customers-only cursor pages, deferred operator sign-in delivery,
// Load more above 500 customers and the three test gaps QA found (M09, M12, M18).
// Actual /api/manage, /api/admin, /api/access, /api/onboard, /api/client and scheduler handlers;
// memory store; fake model. Every outbound request is intercepted: Resend and Twilio bodies are
// captured in memory and never sent; anything else is refused. Sockets are disabled.
//   node scripts/ops-p2-fix-check.mjs [--json out.json] [--browser <playwright index.mjs> --screens <dir>]
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const deny = () => { throw new Error('ops-p2-fix-check: physical network disabled'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|PHONE_|SERVICE_|VOICE_|MESSAGING_|CALENDAR_|ADMIN_|PUBLIC_SITE_URL)/.test(key)) delete process.env[key];
const base = 'http://127.0.0.1:8893', operatorEmail = 'ops-p2-operator@example.test', secondOperator = 'ops-p2-second@example.test', adminKey = 'ops-p2-shared-cli-key';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: base, ADMIN_EMAILS: operatorEmail + ',' + secondOperator, ADMIN_KEY: adminKey, RESEND_API_KEY: 'intercepted-never-sent', STEVE_EMAIL: 'founder-alerts@example.test', STEVE_PHONE: '+17135550100', MC_TWILIO_NUMBER: '+17135550101', TWILIO_ACCOUNT_SID: 'ACintercepted00000000000000000000', TWILIO_AUTH_TOKEN: 'intercepted-token' });
const mail = [], sms = [], blocked = []; let resendDelay = 0, resendFail = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') { if (resendDelay) await new Promise(resolve => setTimeout(resolve, resendDelay)); if (resendFail) return Response.json({ error: 'intercepted failure' }, { status: 500 }); mail.push(JSON.parse(init.body)); return Response.json({ id: 'intercepted-' + mail.length }); }
  if (url.origin === 'https://api.twilio.com' && /\/Messages\.json$/.test(url.pathname)) { sms.push(Object.fromEntries(new URLSearchParams(String(init.body)))); return Response.json({ sid: 'SMintercepted' + sms.length, status: 'queued' }, { status: 201 }); }
  blocked.push(url.origin + url.pathname); throw new Error('Physical networking disabled');
};
const root = new URL('..', import.meta.url).pathname;
const store = await import('../netlify/functions/lib/store.mjs'), access = await import('../netlify/functions/lib/access.mjs'), accounts = await import('../netlify/functions/lib/accounts.mjs');
const config = await import('../netlify/functions/lib/config.mjs'), operator = await import('../netlify/functions/lib/operator.mjs'), send = await import('../netlify/functions/lib/send.mjs');
const manage = (await import('../netlify/functions/manage.mjs')).default, admin = (await import('../netlify/functions/admin.mjs')).default, accessAPI = (await import('../netlify/functions/access.mjs')).default;
const onboard = (await import('../netlify/functions/onboard.mjs')).default, client = (await import('../netlify/functions/client.mjs')).default, scheduler = await import('../netlify/functions/scheduler.mjs');
// Release 2 (RC2-T1): a gate run at a fan-out hour (21:00-21:59 Houston autoflag, 18 digest, Mon 8 weekly, 1st 9 monthly)
// made scheduler.run start the real background fan-out over loopback, which the no-outbound check (N00/N0) rightly
// refuses. Claim today's fan-outs first, as a deployed scheduler has after its first run of the hour; nothing here tests fan-outs.
{ const { claimFanout } = await import('../netlify/functions/lib/fanout.mjs'); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); for (const kind of ['digest', 'autoflag', 'weekly', 'monthly']) await claimFanout(kind, day); }
const issuesModule = existsSync(root + 'netlify/functions/lib/operator-issues.mjs');
const read = accounts.strictRead;
const results = []; let serial = 0;
const check = async (id, name, fn) => { try { const detail = await fn(); results.push({ id, name, pass: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS ' + id + ' ' + name); } catch (error) { results.push({ id, name, pass: false, error: String(error?.message || error).slice(0, 700) }); console.log('FAIL ' + id + ' ' + name + ' :: ' + String(error?.message || error).slice(0, 300)); } };
const skip = (id, name, why) => { results.push({ id, name, pass: null, skipped: why }); console.log('SKIP ' + id + ' ' + name + ' :: ' + why); };
const call = async (handler, path, body, { token, method = 'POST', ip, headers = {}, origin = base, context = {} } = {}) => {
  const response = await handler(new Request(base + path, { method, headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }), { ip: ip || '192.0.2.' + (++serial % 200 + 1), ...context });
  const text = await response.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: response.status, body: json, text, bytes: Buffer.byteLength(text) };
};
const cli = (path, body, method = body ? 'POST' : 'GET', key = adminKey) => call(admin, path, body, { method, headers: { 'x-admin-key': key, 'x-nf-client-connection-ip': '198.51.100.77' } });
const session = async (email, scope = 'onboarding') => { const token = createHash('sha256').update('ops-p2-' + scope + '-' + ++serial).digest('hex'); await store.put('access_sessions', access.accessHash(token), { email, scope, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }); return token; };
const opToken = await session(operatorEmail, 'operator');
const signupBody = (label, email) => ({ name: 'Owner ' + label, business: 'Ops ' + label, email, phone: '7135550142', trade: 'HVAC', city: 'Houston', serviceArea: 'Katy', hours: 'Mon-Fri 8am-5pm', windows: '8 to 12', services: 'AC repair', desiredChannels: ['web', 'voice', 'sms', 'calendar'] });
async function signup(label) {
  const email = `owner-${label}-${++serial}@example.test`, token = await session(email);
  const created = await call(onboard, '/api/onboard', signupBody(label, email), { token }); assert.equal(created.status, 200, 'signup ' + created.text.slice(0, 200));
  return { email, token, slug: created.body.slug };
}
// Fast synthetic self-service shops, shaped like a signup with all four channels requested.
const mk = (n, status = 'testing') => { const slug = 'scale-shop-' + String(n).padStart(2, '0'); const c = config.newClient({ slug, ownerKey: 'SCALE-OWNER-KEY-' + n, owner: { name: 'Scale Owner ' + n, email: slug + '@owner.example.test', phone: '+1713555' + String(1000 + n) }, business: { name: 'Scale Shop ' + n, trade: 'HVAC', city: 'Houston', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  c.onboarding = { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'voice', 'sms', 'calendar'] }; c.services = ['AC']; c.windows = ['8 to 12']; c.build = { status: 'built', source: 'owner_answers' }; c.status = status; c.createdAt = new Date(Date.now() - 2 * 3600000).toISOString(); return c; };
const legacyShop = async label => { const c = config.newClient({ slug: 'legacy-' + label, ownerKey: 'LEGACY-OWNER-KEY-' + label + '-0123456789abcdef', owner: { name: 'Legacy ' + label, email: `legacy-${label}@example.test`, phone: '+17135550177' }, business: { name: 'Legacy ' + label, trade: 'Plumbing', city: 'Houston' } }); delete c.onboarding; c.status = 'live'; c.liveAt = new Date(Date.now() - 20 * 86400000).toISOString(); await store.put('clients', c.slug, c); await store.indexClient?.(c); return c; };
const auditKeys = () => store.list('admin_key_audit', '');
const auditDown = async fn => { const native = JSON.stringify; JSON.stringify = function (value, ...rest) { if (value && typeof value === 'object' && 'network' in value && 'method' in value && 'action' in value) throw new Error('audit storage down'); return native.call(this, value, ...rest); }; try { return await fn(); } finally { JSON.stringify = native; } };
const auditRows = async (except = new Set()) => { const out = []; for (const key of await auditKeys()) if (!except.has(key)) out.push(await store.get('admin_key_audit', key)); return out.filter(Boolean); };

// ---------- shared fixtures ----------
for (let n = 1; n <= 64; n++) { const c = mk(n, n === 59 ? 'cancelled' : 'testing'); await store.put('clients', c.slug, c); }
const legacy = await legacyShop('alerts');
const P = await signup('paused'), X = await signup('stopped'), A = await signup('active');
assert.equal((await call(client, '/api/client?c=' + P.slug, { action: 'pause' }, { token: P.token })).status, 200, 'owner pause');
assert.equal((await call(client, '/api/client?c=' + X.slug, { action: 'cancel', reason: 'Seasonal stop' }, { token: X.token })).status, 200, 'owner cancel');

// ---------- PRA-OPS-07: list payload and full coverage ----------
await check('S07a', 'operator list page of 50 customers is under 300 KB and carries list fields only', async () => {
  const page = await call(manage, '/api/manage', null, { token: opToken, method: 'GET' });
  assert.equal(page.status, 200); assert.equal(page.body.customers.length, 50); assert.ok(page.body.nextCursor, 'more pages');
  assert.ok(page.bytes < 300000, 'list payload ' + page.bytes + ' bytes');
  const row = page.body.customers.find(c => c.slug === 'scale-shop-01');
  assert.equal(row.setup, undefined); assert.equal(row.services, undefined); assert.ok(Array.isArray(row.issues)); assert.ok(row.connections.every(c => Object.keys(c).every(k => ['id','label','status','requested','retained','active'].includes(k))));
  return { bytes: page.bytes, total: page.body.total };
});
await check('S07b', 'following the cursor reaches every customer, and customer detail still has full setup', async () => {
  let cursor = null, seen = new Set(), pages = 0;
  do { const page = await call(manage, '/api/manage' + (cursor ? '?cursor=' + cursor : ''), null, { token: opToken, method: 'GET' }); assert.equal(page.status, 200); page.body.customers.forEach(c => seen.add(c.slug)); cursor = page.body.nextCursor; pages++; } while (cursor && pages < 20);
  const total = (await store.list('clients', '')).length; assert.equal(seen.size, total);
  const detail = await call(manage, '/api/manage?c=scale-shop-59', null, { token: opToken, method: 'GET' }); assert.equal(detail.status, 200); assert.ok(detail.body.customer.setup && detail.body.customer.services, 'detail keeps setup/services'); assert.notEqual(detail.body.customer.summaryOnly, true);
  return { customers: seen.size, pages };
});
await check('S07c', 'later pages (?cursor=) carry customers only, not inquiries, platform texting or System again', async () => {
  const first = await call(manage, '/api/manage', null, { token: opToken, method: 'GET' }); assert.ok(first.body.inquiries && first.body.system && 'platformSMS' in first.body, 'first page keeps the overview');
  const next = await call(manage, '/api/manage?cursor=' + first.body.nextCursor, null, { token: opToken, method: 'GET' }); assert.equal(next.status, 200);
  for (const key of ['inquiries', 'platformSMS', 'system', 'operator']) assert.equal(next.body[key], undefined, key + ' repeated on a later page');
  assert.ok(next.body.customers.length > 0 && 'nextCursor' in next.body && Number.isFinite(next.body.total));
  assert.equal((await call(manage, '/api/manage?cursor=' + first.body.nextCursor, null, { method: 'GET' })).status, 401, 'later pages still need an operator session');
  return { firstBytes: first.bytes, laterBytes: next.bytes };
});

// ---------- PRA-OPS-09: shared ADMIN_KEY ----------
await check('S09a', 'shared key list omits self-service owner contact data; legacy rows unchanged', async () => {
  const list = await cli('/api/admin'); assert.equal(list.status, 200);
  for (const c of [A, P, X]) assert.ok(!list.text.includes(c.email), 'owner email exposed for ' + c.slug);
  assert.ok(!list.text.includes('+17135551001') && !list.text.includes('scale-shop-01@owner.example.test'), 'scale shop contact exposed');
  const row = list.body.clients.find(r => r.slug === A.slug); assert.equal(row.selfService, true); assert.equal(row.owner, undefined); assert.equal(row.phone, undefined);
  assert.equal(list.body.clients.find(r => r.slug === legacy.slug).owner.email, legacy.owner.email);
});
await check('S09b', 'shared key cannot read self-service records, prompt or tasks', async () => {
  const before = await read('clients', A.slug);
  for (const body of [{ action: 'records', kind: 'bookings' }, { action: 'records', kind: 'conversations' }, { action: 'records', kind: 'customers' }, { action: 'records', kind: 'events' }, { action: 'prompt' }, { action: 'tasks' }]) {
    const out = await cli('/api/admin', { slug: A.slug, ...body }); assert.equal(out.status, 409, JSON.stringify(body) + ' -> ' + out.status); assert.equal(out.body.error, 'managed_action_required');
  }
  assert.deepEqual(await read('clients', A.slug), before);
  const legacyRecords = await cli('/api/admin', { slug: legacy.slug, action: 'records', kind: 'events' }); assert.equal(legacyRecords.status, 200, 'legacy shop CLI still works');
});
await check('S09c', 'every shared-key request is audited before it is served, with no raw network address', async () => {
  const before = new Set(await auditKeys());
  await cli('/api/admin'); await cli('/api/admin?full=1'); await cli('/api/admin', { slug: A.slug, action: 'records', kind: 'bookings' }); await cli('/api/admin', { slug: legacy.slug, action: 'prompt' });
  const wrong = await cli('/api/admin', null, 'GET', 'wrong-key'); assert.equal(wrong.status, 403);
  const rows = (await auditRows(before)).sort((a, b) => a.at.localeCompare(b.at));
  assert.equal(rows.length, 4, 'audited ' + rows.length + ' of 4 authenticated requests');
  assert.deepEqual(rows.map(r => r.action).sort(), ['list', 'list_full', 'prompt', 'records']);
  const recordsRow = rows.find(r => r.action === 'records'); assert.equal(recordsRow.slug, A.slug); assert.equal(recordsRow.kind, 'bookings');
  assert.ok(!JSON.stringify(rows).includes('198.51.100.77'), 'raw IP stored'); assert.ok(rows.every(r => /^[a-f0-9]{16}$/.test(r.network)));
  return rows.map(r => r.method + ' ' + r.action);
});
await check('S09d', 'an unwritable audit refuses the shared-key request (fail closed, nothing returned)', async () => {
  const native = JSON.stringify;
  JSON.stringify = function (value, ...rest) { if (value && typeof value === 'object' && 'network' in value && 'method' in value && 'action' in value) throw new Error('audit storage down'); return native.call(this, value, ...rest); };
  let get, post; try { get = await cli('/api/admin?full=1'); post = await cli('/api/admin', { slug: legacy.slug, action: 'records', kind: 'events' }); } finally { JSON.stringify = native; }
  assert.equal(get.status, 503); assert.equal(get.body.error, 'audit_unavailable'); assert.equal(get.body.clients, undefined);
  assert.equal(post.status, 503); assert.equal(post.body.records, undefined);
});
await check('S09f', 'a non-string slug is refused, so every shared-key read names its shop in the audit', async () => {
  const before = new Set(await auditKeys());
  const out = await cli('/api/admin', { slug: [legacy.slug], action: 'records', kind: 'events' }); assert.equal(out.status, 400); assert.equal(out.body.records, undefined);
  assert.equal((await auditRows(before)).length, 0);
});
await check('S09g', 'the shared-key inquiry export (/api/intake GET) is audited before it is served and fails closed', async () => {
  const intake = (await import('../netlify/functions/intake.mjs')).default; const before = new Set(await auditKeys());
  const get = () => call(intake, '/api/intake?audience=all&format=json', null, { method: 'GET', headers: { 'x-admin-key': adminKey, 'x-nf-client-connection-ip': '198.51.100.77' } });
  const ok = await get(); assert.equal(ok.status, 200); const rows = await auditRows(before); assert.equal(rows.length, 1); assert.equal(rows[0].action, 'intake_export'); assert.equal(rows[0].kind, 'all');
  const native = JSON.stringify; JSON.stringify = function (value, ...rest) { if (value && typeof value === 'object' && 'network' in value && 'method' in value && 'action' in value) throw new Error('audit storage down'); return native.call(this, value, ...rest); };
  let down; try { down = await get(); } finally { JSON.stringify = native; }
  assert.equal(down.status, 503); assert.equal(down.body.prospects, undefined);
});
await check('S09h', 'the shared key on /api/sms, /api/voice, /api/twilio-alert and /api/chat is audited before it is used and fails closed; a wrong key is not a bypass', async () => {
  const routes = { sms: (await import('../netlify/functions/sms.mjs')).default, voice: (await import('../netlify/functions/voice.mjs')).default, alert: (await import('../netlify/functions/twilio-alert.mjs')).default, chat: (await import('../netlify/functions/chat.mjs')).default };
  const form = { To: '+17135550999', From: '+17135550888', Body: 'hello', CallSid: 'CAops', Payload: '{}' }, formBody = new URLSearchParams(form).toString();
  const hit = (name, key) => { const headers = { 'x-nf-client-connection-ip': '198.51.100.78', ...(key ? { 'x-admin-key': key } : {}) };
    if (name === 'chat') return call(routes.chat, '/api/chat', { client: 'no-such-shop', messages: [{ role: 'user', content: 'hi' }] }, { headers });
    return call(routes[name], name === 'alert' ? '/api/twilio-alert' : '/api/' + name, formBody, { headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' } }); };
  const actions = { sms: 'sms_webhook', voice: 'voice_webhook', alert: 'twilio_alert', chat: 'chat_rate_exempt' }, out = {};
  for (const name of Object.keys(routes)) {
    let before = new Set(await auditKeys()); const ok = await hit(name, adminKey); const rows = await auditRows(before);
    assert.ok(![403, 503].includes(ok.status), name + ' with the key -> ' + ok.status); assert.deepEqual(rows.map(r => r.action), [actions[name]], name + ' audit ' + JSON.stringify(rows));
    assert.ok(!JSON.stringify(rows).includes('198.51.100.78') && !JSON.stringify(rows).includes(adminKey));
    const down = await auditDown(() => hit(name, adminKey)); assert.equal(down.status, 503, name + ' fail closed -> ' + down.status);
    before = new Set(await auditKeys()); const wrong = await hit(name, 'not-the-admin-key'); assert.equal((await auditRows(before)).length, 0, name + ' wrong key audited');
    if (name !== 'chat') assert.equal(wrong.status, 403, name + ' wrong key bypassed the Twilio signature');
    out[name] = [ok.status, down.status, wrong.status];
  }
  return out;
});
await check('S09e', 'operators see shared-key use in the System payload; an owner session cannot read it', async () => {
  const page = await call(manage, '/api/manage', null, { token: opToken, method: 'GET' }); const audit = page.body.system.legacyKeyAudit;
  assert.ok(audit && audit.last24h >= 4, 'legacyKeyAudit ' + JSON.stringify(audit)); assert.ok(audit.recent.length > 0 && audit.recent.every(r => r.at && r.action));
  assert.equal((await call(manage, '/api/manage', null, { token: A.token, method: 'GET' })).status, 401);
  return { last24h: audit.last24h };
});

// ---------- PRA-OPS-10: founder alerts carry no owner key ----------
await check('S10a', 'scheduler health alert email contains no owner key, points to the admin portal, and no founder text is sent (legal P1: operator alerts are email-only)', async () => {
  mail.length = 0; sms.length = 0;
  for (let i = 0; i < 3; i++) await store.logEvent(legacy, 'sms_failed', { message: 'synthetic failure ' + i });
  await scheduler.run({ all: true });
  const founderMail = mail.filter(m => [].concat(m.to).includes('founder-alerts@example.test')), founderSMS = sms.filter(m => m.To === '+17135550100');
  assert.ok(founderMail.length >= 1, 'alert not captured: mail ' + founderMail.length);
  assert.equal(founderSMS.length, 0, 'founder alert texted from the shared M&C number: ' + founderSMS.length);
  const text = JSON.stringify([founderMail, founderSMS]);
  assert.ok(!text.includes(legacy.ownerKey), 'owner key in founder alert'); assert.ok(!/[?&]k=(?!\[redacted\])/.test(text), 'k= credential in founder alert');
  assert.ok(text.includes('admin.html') && text.includes(legacy.slug));
});
await check('S10b', 'every notifySteve payload is redacted, including other legacy portal links', async () => {
  mail.length = 0; sms.length = 0;
  await send.notifySteve('Flagged: x', `note\nhttps://machinesandcloud.com/desk?c=${legacy.slug}&k=${legacy.ownerKey}#convs\nbilling https://x.test/desk?c=${legacy.slug}&k=${legacy.ownerKey}&billing=ok`);
  const text = JSON.stringify([mail, sms]); assert.ok(!text.includes(legacy.ownerKey)); assert.ok(text.includes('admin.html (customer ' + legacy.slug + ')'));
});
await check('S10c', 'any other k= query value in a founder alert is redacted, first or later in the query', async () => {
  mail.length = 0; sms.length = 0;
  await send.notifySteve('Other link', 'see https://x.test/other?x=1&k=RAWSECRETVALUE1 and https://x.test/p?k=RAWSECRETVALUE2&y=2');
  const text = JSON.stringify([mail, sms]); assert.ok(!text.includes('RAWSECRETVALUE'), 'raw k= value in alert'); assert.ok(text.includes('?x=1&k=[redacted]') && text.includes('?k=[redacted]&y=2'));
});
await check('S10d', 'the scheduler health alert is built without an owner link (no redaction needed)', async () => {
  const src = readFileSync(root + 'netlify/functions/scheduler.mjs', 'utf8'), at = src.indexOf('async function alertOnce('); assert.ok(at >= 0, 'alertOnce not found');
  const body = src.slice(at, src.indexOf('\n}\n', at)); assert.doesNotMatch(body, /ownerKey|desk\?c=|[?&]k=/, 'alertOnce builds an owner link');
  mail.length = 0; sms.length = 0; const shop = await legacyShop('alerts-two');
  for (let i = 0; i < 3; i++) await store.logEvent(shop, 'sms_failed', { message: 'synthetic failure ' + i }); await scheduler.run({ all: true });
  const text = JSON.stringify([mail, sms].map(list => list.filter(m => JSON.stringify(m).includes(shop.slug)))); assert.ok(text.includes('Customer: ' + shop.slug), 'no customer line'); assert.ok(!text.includes('(customer ' + shop.slug + ')'), 'alert relied on redaction of an owner link');
});

// ---------- PRA-OPS-11 / PRA-OPS-16: operator sign-in ----------
const ask = (email, ip, origin = base) => call(manage, '/api/manage', { action: 'request_link', email }, { ip, origin });
await check('S11a', 'operator and non-operator sign-in requests return byte-identical status and body', async () => {
  const allowed = await ask(operatorEmail, '203.0.113.11'), other = await ask('stranger-a@example.test', '203.0.113.12');
  assert.equal(allowed.status, other.status); assert.equal(allowed.text, other.text, 'bodies differ: ' + allowed.text + ' vs ' + other.text);
  assert.equal(allowed.body.delivery, undefined);
  assert.ok(await store.get('access_outbox', access.accessHash(operatorEmail)), 'operator still receives the link'); assert.equal(await store.get('access_outbox', access.accessHash('stranger-a@example.test')), null);
});
await check('S11b', 'rate-limit spend is identical for both paths (per address and per network)', async () => {
  const seq = async (email, offset) => { const out = []; for (let i = 0; i < 4; i++) out.push((await ask(email, '203.0.113.' + (40 + i + offset))).status); return out; };
  const op = await seq(secondOperator, 0), other = await seq('stranger-b@example.test', 10);
  assert.deepEqual(op, other, 'per-address sequences differ: ' + op + ' vs ' + other);
  const net = []; for (let i = 0; i < 5; i++) net.push((await ask(`stranger-net-${i}@example.test`, '203.0.113.90')).status);
  const sixth = await ask(operatorEmail, '203.0.113.90'); net.push(sixth.status);
  assert.deepEqual(net, [202, 202, 202, 202, 202, 429], 'non-operator requests must spend the network allowance: ' + net);
  return { perAddress: op, perNetwork: net };
});
await check('S16a', 'operator sign-in email says it is for operations; owner email unchanged; responses still uniform with real delivery', async () => {
  const saved = process.env.URL; process.env.URL = 'https://ops-p2.example.test'; mail.length = 0;
  let allowed, other, owner; try {
    allowed = await ask('ops-p2-operator@example.test', '203.0.113.120', 'https://machinesandcloud.com'); other = await ask('stranger-c@example.test', '203.0.113.121', 'https://machinesandcloud.com');
    owner = await call(accessAPI, '/api/access', { action: 'request_link', email: 'owner-mail@example.test' }, { ip: '203.0.113.122', origin: 'https://machinesandcloud.com' });
  } finally { process.env.URL = saved; }
  assert.equal(allowed.text, other.text);
  const opMail = mail.find(m => [].concat(m.to).includes(operatorEmail)), ownerMail = mail.find(m => [].concat(m.to).includes('owner-mail@example.test'));
  assert.equal(mail.filter(m => [].concat(m.to).includes('stranger-c@example.test')).length, 0);
  assert.equal(opMail?.subject, 'Sign in to Machines & Cloud operations'); assert.match(opMail.text, /operator access/); assert.doesNotMatch(opMail.text, /front desk/);
  assert.equal(owner.status, 202); assert.equal(ownerMail?.subject, 'Your Machines & Cloud sign-in link');
});
await check('S11c', 'operator and owner sessions stay separate', async () => {
  assert.equal((await call(accessAPI, '/api/access', null, { token: opToken, method: 'GET' })).status, 401);
  assert.equal((await call(manage, '/api/manage', null, { token: P.token, method: 'GET' })).status, 401);
});
const clearRates = async () => { for (const key of await store.list('access_rate', '')) await store.del('access_rate', key); };
await check('S11d', 'with context.waitUntil the operator link is sent after the response: operator and non-operator requests take the same time', async () => {
  const saved = process.env.URL; process.env.URL = 'https://ops-p2.example.test'; resendDelay = 150; mail.length = 0; const t = { op: [], other: [] }, deferred = [];
  try {
    for (let i = 0; i < 8; i++) for (const [kind, email] of [['op', operatorEmail], ['other', `stranger-t${i}@example.test`]]) {
      await clearRates(); const pending = [], start = performance.now();
      const out = await call(manage, '/api/manage', { action: 'request_link', email }, { ip: '203.0.113.' + (150 + i), origin: 'https://machinesandcloud.com', context: { waitUntil: work => pending.push(work) } });
      t[kind].push(performance.now() - start); assert.equal(out.status, 202, out.text); assert.equal(out.body.delivery, undefined);
      if (kind === 'op') { assert.equal(pending.length, 1, 'operator delivery not deferred'); deferred.push(...pending); } else assert.equal(pending.length, 0);
    }
    await Promise.all(deferred);
  } finally { process.env.URL = saved; resendDelay = 0; await clearRates(); }
  const med = list => [...list].sort((a, b) => a - b)[list.length >> 1], op = med(t.op), other = med(t.other);
  assert.ok(op < 75 && other < 75, `medians op ${op.toFixed(1)} ms, other ${other.toFixed(1)} ms with a 150 ms provider`); assert.ok(Math.abs(op - other) < 40, `timing differs: ${op.toFixed(1)} vs ${other.toFixed(1)} ms`);
  assert.equal(mail.filter(m => [].concat(m.to).includes(operatorEmail) && m.subject === 'Sign in to Machines & Cloud operations').length, 8, 'deferred operator emails'); assert.equal(mail.filter(m => /stranger-t/.test(JSON.stringify(m.to))).length, 0);
  return { opMedianMs: +op.toFixed(2), otherMedianMs: +other.toFixed(2), providerDelayMs: 150 };
});
await check('S11e', 'a deferred delivery failure keeps the uniform 202, marks the link delivery_failed and logs no address; without waitUntil the failure is still 503', async () => {
  const saved = process.env.URL; process.env.URL = 'https://ops-p2.example.test'; resendFail = true; const logged = [], nativeError = console.error; console.error = (...a) => logged.push(a.map(String).join(' '));
  const failedRows = async () => { let n = 0; for (const key of await store.list('access_tokens', '')) { const row = await store.get('access_tokens', key); if (row?.email === operatorEmail && row.status === 'delivery_failed') n++; } return n; };
  let deferredOut, syncOut, before; try {
    await clearRates(); before = await failedRows(); const pending = [];
    deferredOut = await call(manage, '/api/manage', { action: 'request_link', email: operatorEmail }, { ip: '203.0.113.170', origin: 'https://machinesandcloud.com', context: { waitUntil: work => pending.push(work) } }); await Promise.all(pending);
    await clearRates(); syncOut = await call(manage, '/api/manage', { action: 'request_link', email: operatorEmail }, { ip: '203.0.113.171', origin: 'https://machinesandcloud.com' });
  } finally { process.env.URL = saved; resendFail = false; console.error = nativeError; await clearRates(); }
  assert.equal(deferredOut.status, 202); assert.equal(deferredOut.body.message, 'If this email has operator access, a sign-in link will arrive shortly.');
  assert.equal(await failedRows(), before + 2, 'both failed links marked delivery_failed'); assert.ok(logged.some(line => /Operator sign-in link was not delivered/.test(line)), 'failure not logged'); assert.ok(!logged.join('\n').includes(operatorEmail), 'address in log');
  assert.equal(syncOut.status, 503); assert.equal(syncOut.body.error, 'email_unavailable');
});

// ---------- PRA-OPS-15 (with the operator-health fix): a fresh healthy signup has no actionable issue ----------
if (issuesModule) await check('S15a', 'a fresh healthy signup with all four channels has zero actionable issues', async () => {
  const fresh = await signup('fresh'); const view = await operator.customerView(await read('clients', fresh.slug));
  const actionable = view.issues.filter(i => i.actionable !== false); assert.equal(actionable.length, 0, actionable.map(i => i.id + ':' + i.severity).join(','));
});
else skip('S15a', 'a fresh healthy signup has zero actionable issues', 'needs lib/operator-issues.mjs from the operator-health fix (PRA-OPS-01)');

// ---------- optional browser checks ----------
if (arg('--browser')) {
  const dir = arg('--screens'); if (dir) mkdirSync(dir, { recursive: true });
  const { chromium } = await import(arg('--browser'));
  const handlers = { '/api/manage': manage, '/api/client': client, '/api/onboard': onboard, '/api/access': accessAPI };
  if (existsSync(root + 'netlify/functions/workspace-billing.mjs')) handlers['/api/workspace-billing'] = (await import('../netlify/functions/workspace-billing.mjs')).default;
  const unhandled = [], pageErrors = [], external = [];
  const browser = await chromium.launch({ headless: true, ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : {}) });
  const open = async (width, setup, overrides = {}) => {
    const routes = { ...handlers, ...overrides };
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) { external.push(url.origin); return route.abort(); }
      if (url.pathname.startsWith('/api/') && !routes[url.pathname]) { unhandled.push(url.pathname); return route.fulfill({ status: 404, body: '{}' }); }
      if (routes[url.pathname]) { const body = request.postData(); const response = await routes[url.pathname](new Request(url, { method: request.method(), headers: request.headers(), ...(body ? { body } : {}) }), { ip: '192.0.2.9' }); return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }); }
      const file = root + decodeURIComponent(url.pathname.slice(1)); if (!existsSync(file) || url.pathname.includes('..')) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html', body: readFileSync(file) });
    });
    const p = await context.newPage(); p.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 200))); await setup(p); return { p, context };
  };
  const shot = async (p, name) => { if (!dir) return; await p.screenshot({ path: `${dir}/${name}.png`, fullPage: false }); };
  const fits = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const adminPage = (width, overrides) => open(width, async p => { await p.goto(base + '/admin.html'); await p.evaluate(t => sessionStorage.setItem('mc-operator-session-v1', t), opToken); await p.reload(); await p.locator('#app:not([hidden])').waitFor({ timeout: 60000 }); }, overrides);
  await store.put('health', 'scheduler:lastRun', { at: new Date(Date.now() - 40 * 60000).toISOString(), ok: false, blocks: { tasks: { ok: true }, serviceDeliveryRecovery: { ok: false, error: 'service_delivery_unresolved' }, workspace_setup: { ok: false, error: 'storage timeout' } } });
  for (const width of [390, 1440]) {
    const { p, context } = await adminPage(width);
    await check('B07-' + width, 'admin search, status filter and overview counts cover all customers (' + width + ')', async () => {
      const stats = await p.locator('#summary').innerText(); assert.ok(!/\(loaded\)/.test(stats), 'overview still says loaded: ' + stats);
      await p.locator('[data-view=customers]').click(); await p.locator('#customerSearch').fill('Scale Shop 59');
      const count = await p.locator('#customerCount').innerText(); assert.match(count, /^1 matching/, count); const total = (await store.list('clients', '')).length; assert.ok(count.includes(total + ' loaded of ' + total), count);
      await p.locator('#customerSearch').fill(''); await p.locator('#customerStatus').selectOption('cancelled'); assert.ok((await p.locator('#customers').innerText()).includes('Scale Shop 59'));
      await shot(p, 'admin-customers-search-' + width); return { count };
    });
    await check('B13-' + width, 'System shows readable step names, a next step for each failing step and a stale-run warning (' + width + ')', async () => {
      await p.locator('[data-view=system]').click(); const text = await p.locator('#system').innerText();
      assert.ok(text.includes('Service delivery recovery') && !text.includes('serviceDeliveryRecovery'), 'raw block name');
      assert.match(text, /Scheduler has not run for \d+ minutes/); assert.ok((await p.locator('#system [data-block-advice]').count()) >= 2, 'advice rows');
      assert.match(text, /Shared admin key use/); assert.ok(await fits(p), 'overflow'); await shot(p, 'admin-system-' + width);
    });
    await check('B14-' + width, 'Stop-service dialog: dismiss says Keep service, Stop service waits for a reason (' + width + ')', async () => {
      await p.locator('[data-view=customers]').click(); await p.locator('#customerStatus').selectOption('all'); await p.locator('#customerSearch').fill(A.email);
      await p.locator(`#customers [data-customer="${A.slug}"]`).click(); await p.locator('#detailTitle').waitFor();
      await p.locator('[data-action=cancel_service]').click();
      const submit = await p.locator('#actionSubmit').innerText(), dismiss = await p.locator('#actionCancel').innerText();
      assert.equal(submit.trim(), 'Stop service'); assert.equal(dismiss.trim(), 'Keep service'); assert.ok(await p.locator('#actionSubmit').isDisabled(), 'enabled without a reason');
      await p.locator('#actionReason').fill('Owner asked to stop'); assert.ok(await p.locator('#actionSubmit').isEnabled()); await shot(p, 'admin-stop-dialog-' + width);
      await p.locator('#actionCancel').click(); assert.equal((await read('clients', A.slug)).status, 'testing', 'dialog dismiss changed status');
      await p.locator('[data-action=save_note]').click(); assert.equal((await p.locator('#actionCancel').innerText()).trim(), 'Cancel'); await p.locator('#actionCancel').click();
    });
    await context.close();
  }
  // Above 500 customers: ten pages load automatically, then the scope notice and Load more take over.
  await check('B07L', 'above 500 customers the first 500 load automatically, the scope is disclosed, and Load more reaches the rest', async () => {
    const real = (await call(manage, '/api/manage', null, { token: opToken, method: 'GET' })).body, template = real.customers.find(c => c.slug === 'scale-shop-01');
    const bulk = Array.from({ length: 520 }, (_, i) => ({ ...template, slug: 'bulk-' + String(i).padStart(4, '0'), name: 'Bulk Shop ' + i, owner: { ...template.owner, email: `bulk-${i}@owner.example.test` } })), cursors = [];
    const bulkManage = async (req, context) => { const url = new URL(req.url); if (req.method !== 'GET' || url.searchParams.has('c')) return manage(req, context);
      const cursor = url.searchParams.get('cursor') || ''; cursors.push(cursor); const from = cursor ? bulk.findIndex(c => c.slug === cursor) + 1 : 0, rows = bulk.slice(from, from + 50), nextCursor = from + 50 < bulk.length ? rows.at(-1).slug : null;
      return Response.json(cursor ? { ok: true, customers: rows, total: bulk.length, nextCursor } : { ...real, customers: rows, total: bulk.length, nextCursor, summary: { ...real.summary, scope: 'loaded' } }, { headers: { 'Cache-Control': 'no-store' } }); };
    const { p, context } = await adminPage(1440, { '/api/manage': bulkManage });
    try {
      await p.locator('[data-view=customers]').click(); await p.locator('#customerCount').filter({ hasText: '500 loaded of 520' }).waitFor({ timeout: 30000 });
      assert.equal(cursors.length, 10, 'automatic page requests ' + cursors.length); assert.ok(await p.locator('#loadMoreCustomers').isVisible(), 'Load more hidden above 500');
      assert.ok(await p.locator('#scopeNotice').isVisible() && /500 customers loaded so far/.test(await p.locator('#scopeNotice').innerText()), 'scope notice');
      assert.match(await p.locator('#summary').innerText(), /\(loaded\)/); await shot(p, 'admin-load-more-500');
      await p.locator('#loadMoreCustomers').click(); await p.locator('#customerCount').filter({ hasText: '520 loaded of 520' }).waitFor({ timeout: 30000 });
      assert.equal(cursors.length, 11); assert.equal(cursors.at(-1), 'bulk-0499'); assert.ok(await p.locator('#loadMoreCustomers').isHidden(), 'Load more after the last page'); assert.ok(await p.locator('#scopeNotice').isHidden(), 'scope notice after every customer loaded');
      const slugs = await p.locator('#customers [data-customer]').evaluateAll(rows => rows.map(r => r.dataset.customer)); assert.equal(new Set(slugs).size, 520, 'rows ' + slugs.length);
      assert.doesNotMatch(await p.locator('#summary').innerText(), /\(loaded\)/); await shot(p, 'admin-load-more-520');
      return { automatic: 10, afterLoadMore: cursors.length };
    } finally { await context.close(); }
  });
  // A summary list row is never drawn as the customer detail, so no action opens on trimmed data.
  await check('B07S', 'while customer detail is loading, a refresh never draws the trimmed list row or its actions', async () => {
    let release, held = 0, lists = 0; const gate = new Promise(resolve => { release = resolve; });
    const slowDetail = async (req, context) => { const url = new URL(req.url); if (url.searchParams.has('c')) { held++; await gate; } else if (req.method === 'GET') lists++; return manage(req, context); };
    const { p, context } = await adminPage(1440, { '/api/manage': slowDetail });
    try {
      await p.locator('[data-view=customers]').click(); await p.locator('#customerStatus').selectOption('all'); await p.locator('#customerSearch').fill(A.email);
      await p.locator(`#customers [data-customer="${A.slug}"]`).click(); await p.waitForFunction(() => /Loading customer details/.test(document.querySelector('#customerDetail')?.textContent || ''));
      const listsBefore = lists; await p.locator('#refreshAll').click();
      for (let i = 0; i < 300 && lists === listsBefore; i++) await new Promise(resolve => setTimeout(resolve, 50)); assert.ok(lists > listsBefore, 'refresh did not request the list');
      await p.waitForFunction(() => !document.querySelector('#refreshAll')?.disabled, null, { timeout: 30000 }); await p.waitForTimeout(200);
      assert.ok(held >= 1, 'detail was not pending'); assert.equal(await p.locator('#customerDetail [data-action]').count(), 0, 'actions drawn from a summary row'); assert.equal(await p.locator('#detailTitle').count(), 0, 'detail drawn from a summary row');
      release(); await p.locator('#detailTitle').waitFor({ timeout: 30000 }); assert.ok((await p.locator('#customerDetail [data-action=cancel_service]').count()) > 0, 'full detail has actions');
    } finally { release(); await context.close(); }
  });
  for (const width of [390, 1440]) for (const [shop, label, word] of [[P, 'paused', 'Paused'], [X, 'cancelled', 'Stopped']]) {
    await check('B12-' + label + '-' + width, 'desk Home of a ' + label + ' workspace shows no setup to-dos (' + width + ')', async () => {
      const { p, context } = await open(width, async p => { await p.goto(base + '/desk.html?c=' + shop.slug); await p.evaluate(t => sessionStorage.setItem('mc-onboarding-session-v1', t), shop.token); await p.reload(); });
      try {
        await p.waitForFunction(() => /paused|stopped|selected services/i.test(document.querySelector('#homeConnectionProgressSummary')?.textContent || ''), null, { timeout: 30000 });
        const home = await p.locator('#homeConnectionProgress').innerText();
        assert.doesNotMatch(home, /Next: You|View next step|required steps complete/, home.slice(0, 300)); assert.ok(home.includes(word), 'no ' + word + ' label');
        const guide = await p.locator('#workspaceGuide').innerText().catch(() => ''); assert.doesNotMatch(guide, /View next step|Next: You/, 'guide card: ' + guide.slice(0, 200));
        assert.ok(await fits(p), 'overflow'); await shot(p, 'desk-home-' + label + '-' + width);
      } finally { await context.close(); }
    });
  }
  await browser.close();
  await check('B00', 'browser runs had no page errors, no unhandled API route and no external request', async () => { assert.deepEqual(pageErrors, []); assert.deepEqual([...new Set(unhandled)], []); assert.deepEqual([...new Set(external)], []); });
}

await check('N00', 'no physical or unexpected outbound request was attempted', async () => { assert.deepEqual(blocked, []); });
const failed = results.filter(r => r.pass === false), passed = results.filter(r => r.pass === true), skipped = results.filter(r => r.pass === null);
const summary = { passed: passed.length, failed: failed.length, skipped: skipped.length, total: results.length, intercepted: { email: mail.length, sms: sms.length }, results };
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(summary, null, 2));
console.log(`ops-p2-fix-check: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
process.exit(failed.length ? 1 : 0);
