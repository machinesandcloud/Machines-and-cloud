// Actual owner handler and tenant store, with all physical networking forbidden.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
let physicalAttempts = 0;
const denied = () => { physicalAttempts++; throw new Error('workspace-activity-check forbids external transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = denied;
syncBuiltinESMExports(); globalThis.fetch = denied;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|CALENDAR_|MANAGED_|MC_SELF_SERVICE_AI_PROOF|PHONE_ACQUISITION|SERVICE_|NETLIFY|BLOBS)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: 'https://activity.example.test', PUBLIC_SITE_URL: 'https://activity.example.test' });
const store = await import('../netlify/functions/lib/store.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const { workspaceTenant } = await import('../netlify/functions/lib/workspace-identity.mjs');
const { workspaceActivity } = await import('../netlify/functions/lib/workspace-activity.mjs');
const handler = (await import('../netlify/functions/client.mjs')).default;
const hash = value => createHash('sha256').update(value).digest('hex');
const c = { ...newClient({ slug: 'activity-check', ownerKey: 'offline-fixture-only', owner: { name: 'Owner', email: 'owner@example.test' }, business: { name: 'Test Home Services' } }), status: 'testing', onboarding: { version: 1 } };
await store.saveClient(c);
const token = hash('activity-owner'), session = { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() };
await store.put('access_sessions', hash(token), session);
async function call(query = '&report=activity&days=7', auth = token, origin = process.env.URL) {
  const response = await handler(new Request(process.env.URL + '/api/client?c=' + c.slug + query, { headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), Origin: origin } }));
  return { status: response.status, headers: response.headers, body: await response.json() };
}
async function lead(name, extra = {}) { return store.addRecord('leads', c.slug, { customer_name: name, status: 'open', outcome: 'wants_call', reason: 'wants_call', phone: '+17135550142', channel: 'web', delivery: { mode: 'portal_only', tenantIdentity: workspaceTenant(c) }, ...extra }); }
const checks = [];
async function test(name, fn) { await fn(); checks.push(name); }
await test('Owner gets an empty real report; public/foreign/revoked access cannot read it', async () => {
  let result = await call(); assert.equal(result.status, 200); assert.equal(result.body.report.activity.inquiries, 0); assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal((await call(undefined, null)).status, 401); assert.equal((await call(undefined, token, 'https://foreign.example.test')).status, 403);
  const other = hash('other-owner'); await store.put('access_sessions', hash(other), { ...session, email: 'other@example.test' }); assert.equal((await call(undefined, other)).status, 403);
  await store.put('access_sessions', hash(token), { ...session, status: 'revoked' }); assert.equal((await call()).status, 401); await store.put('access_sessions', hash(token), session);
});
await test('Invalid/duplicate report queries are rejected rather than defaulted', async () => {
  for (const query of ['&report=activity&days=365', '&report=activity', '&report=other&days=7', '&report=activity&days=7&days=30', '&report=activity&days=7&export=leads']) assert.equal((await call(query)).status, 400);
});
let old;
await test('Due follow-up is returned after it falls behind100 newer completed records', async () => {
  old = await lead('Older due customer');
  const detail = await (await handler(new Request(process.env.URL + '/api/client?c=' + c.slug + '&requestId=' + old.id, { headers: { Authorization: 'Bearer ' + token } }))).json();
  const response = await handler(new Request(process.env.URL + '/api/client?c=' + c.slug, { method: 'POST', headers: { Origin: process.env.URL, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request_followthrough', requestId: old.id, sourceRevision: detail.request.sourceRevision, expectedRevision: detail.request.revision, operationId: hash('plan-old').slice(0,32), type: 'plan', note: '', nextAction: 'Call about the repair', dueAt: '2026-01-01T12:00:00.000Z' }) })); assert.equal(response.status, 200);
  for (let i = 0; i < 100; i++) await lead('Newer filtered ' + i, { status: 'spam' });
  const recent = await call(''); assert.equal(recent.body.leads.some(row => row.id === old.id), false);
  const result = await call(); assert.equal(result.status, 200); assert.equal(result.body.report.activity.inquiries, 1); assert.equal(result.body.report.attention.total, 1); assert.equal(result.body.report.attention.items[0].id, old.id); assert.equal(result.body.report.attention.overdue, 1);
});
await test('Setup/simulation/foreign/spam/aborted records do not inflate customer counts', async () => {
  await lead('Setup', { websiteSetupCheck: { checkId: 'sample' } }); await lead('Practice', { simulation: true }); await lead('Filtered', { outcome: 'spam' });
  await store.addRecord('bookings', c.slug, { status: 'booked', ownerVisitCreationAborted: true, delivery: { tenantIdentity: workspaceTenant(c) } });
  await store.addRecord('leads', c.slug, { customer_name: 'Old incarnation', status: 'open', delivery: { tenantIdentity: 'f'.repeat(64) } });
  const result = await call(); assert.equal(result.body.report.activity.inquiries, 1); assert.equal(result.body.report.activity.visitRequests, 0);
});
await test('Period uses Houston midnight across DST; older due actions remain in attention', async () => {
  await store.put('leads', c.slug + '/' + old.id, { ...old, createdAt: '2020-01-01T12:00:00.000Z' });
  const result = await workspaceActivity(c, 7, new Date('2031-11-04T07:00:00Z'));
  assert.equal(result.period.startDate, '2031-10-29'); assert.equal(result.period.from, '2031-10-29T05:00:00.000Z'); assert.equal(result.period.endDate, '2031-11-04'); assert.equal(result.attention.total, 1); assert.equal(result.activity.inquiries, 0);
});
await test('Incomplete retained history produces an explicit failure, not a complete zero/partial report', async () => {
  const key = c.slug + '/' + workspaceTenant(c) + '/leads', index = await store.get('workspace_record_index', key); await store.put('workspace_record_index', key, { ...index, retentionIncomplete: true });
  const result = await call(); assert.equal(result.status, 503); assert.equal(result.body.error, 'history_incomplete'); assert.equal(result.body.report, undefined); await store.put('workspace_record_index', key, index);
});
await test('Reused slug cannot read prior tenant requests or journals', async () => {
  const replacement = { ...c, ownerKey: 'new-offline-incarnation' }; await store.saveClient(replacement); const result = await call(); assert.equal(result.status, 200); assert.equal(result.body.report.attention.total, 0); await store.saveClient(c);
});
assert.equal(physicalAttempts, 0); console.log(JSON.stringify({ passed: checks.length, checks, physicalAttempts }));
