// Portable core isolation regressions. All records are synthetic; networking is denied.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
let externalRequests = 0;
const deny = () => { externalRequests++; throw new Error('tenant-isolation-check denies network'); };
globalThis.fetch = deny;
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|MC_SELF_SERVICE_AI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', URL: 'https://platform.fixture.invalid' });
const store = await import('../netlify/functions/lib/store.mjs');
const { workspaceTenant, belongsToWorkspace, WorkspaceIdentityError } = await import('../netlify/functions/lib/workspace-identity.mjs');
const { deliveryTenant } = await import('../netlify/functions/lib/managed-consent.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const { normalizeAccountEmail } = await import('../netlify/functions/lib/accounts.mjs');
const { runOwnerTest } = await import('../netlify/functions/lib/owner-test.mjs');
const ai = await import('../netlify/functions/lib/self-service-ai.mjs');
const { houstonToday } = await import('../netlify/functions/lib/availability.mjs');
const cases = [];
async function check(name, fn) { await fn(); cases.push(name); }
let serial = 0;
async function client() {
  const c = newClient({ slug: 'isolation-' + (++serial), ownerKey: 'owner-key-' + serial, owner: { name: 'Fixture Owner', email: `owner-${serial}@example.invalid`, phone: '+17135550140' }, business: { name: 'Fixture Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1 }, status: 'testing', build: { status: 'built' }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'] });
  await store.saveClient(c); return c;
}
const rotated = c => ({ ...c, ownerKey: c.ownerKey + '-replacement', owner: { ...c.owner, email: 'replacement@example.invalid' } });
const bind = (c, data) => ({ ...data, delivery: { tenantIdentity: workspaceTenant(c) } });

await check('Managed delivery digest remains byte-for-byte compatible', async () => {
  for (const value of [' OWNER@example.invalid ', 'invalid', null]) {
    const c = await client(); c.owner.email = value;
    const expected = createHash('sha256').update(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(value)])).digest('hex');
    assert.equal(workspaceTenant(c), expected); assert.equal(deliveryTenant(c), expected);
  }
});
await check('All supplied identity markers must agree; untagged rows are not adopted', async () => {
  const c = await client(), tenant = workspaceTenant(c);
  assert.equal(belongsToWorkspace(c, { slug: c.slug, tenantIdentity: tenant }), true);
  assert.equal(belongsToWorkspace(c, { slug: c.slug, delivery: { tenantIdentity: tenant } }), true);
  for (const row of [{ slug: c.slug }, { tenantIdentity: tenant, delivery: { tenantIdentity: 'f'.repeat(64) } }, { slug: 'other', tenantIdentity: tenant }]) assert.equal(belongsToWorkspace(c, row), false);
  assert.equal(belongsToWorkspace({ ...c, onboarding: { version: 2 } }, { tenantIdentity: tenant }), false);
});
await check('Managed delivery retains its delivery-marker prerequisite plus all-marker agreement', async () => {
  const c = await client(), tenant = workspaceTenant(c);
  const { queueManagedRecord } = await import('../netlify/functions/lib/managed-delivery.mjs');
  for (const [id, markers] of [['top-only', { tenantIdentity: tenant }], ['conflicting', { tenantIdentity: 'f'.repeat(64), delivery: { tenantIdentity: tenant } }]]) {
    const row = { id, slug: c.slug, status: 'open', customer_name: 'Fixture', issue: 'Callback', ...markers };
    await store.put('leads', `${c.slug}/${id}`, row); await queueManagedRecord(c, row, 'leads');
  }
  assert.equal((await store.list('managed_deliveries', c.slug + '/')).length, 0);
  const valid = { id: 'valid', slug: c.slug, status: 'open', customer_name: 'Fixture', issue: 'Callback', delivery: { tenantIdentity: tenant } };
  await store.put('leads', `${c.slug}/${valid.id}`, valid); await queueManagedRecord(c, valid, 'leads');
  assert.equal((await store.list('managed_deliveries', c.slug + '/')).length, 1);
});
await check('Public conversation namespaces and write fences survive replacement', async () => {
  const old = await client(), conv = await store.getConversation(old, 'web', 'same-contact');
  conv.messages = [{ role: 'user', content: 'PRIVATE OLD QUESTION' }]; await store.saveConversation(conv);
  const current = rotated(old); await store.saveClient(current);
  assert.deepEqual((await store.getConversation(current, 'web', 'same-contact')).messages, []);
  await assert.rejects(() => store.getConversation(old, 'web', 'same-contact'), WorkspaceIdentityError);
  await assert.rejects(() => store.saveConversation(conv), WorkspaceIdentityError);
  assert.equal((await store.get('conversations', store.convKey(old, 'web', 'same-contact'))).messages[0].content, 'PRIVATE OLD QUESTION');
});
await check('Untagged legacy history is retained without entering v1 prompts', async () => {
  const c = await client();
  await store.put('conversations', `${c.slug}/web/visitor`, { slug: c.slug, channel: 'web', contact: 'visitor', messages: [{ role: 'user', content: 'UNTAGGED' }] });
  assert.deepEqual((await store.getConversation(c, 'web', 'visitor')).messages, []);
  assert.equal((await store.getConversation(c.slug, 'web', 'visitor')).messages[0].content, 'UNTAGGED');
});
await check('Late events keep originating identity rather than latest slug ownership', async () => {
  const old = await client(); await store.saveClient(rotated(old));
  const event = await store.logEvent(old, 'late_result', { safe: true });
  assert.equal(event.tenantIdentity, workspaceTenant(old));
  assert.equal((await store.list('events', `${old.slug}/${workspaceTenant(old)}/`)).length, 1);
  assert.equal((await store.list('events', `${old.slug}/${workspaceTenant(rotated(old))}/`)).length, 0);
});
await check('Index bootstrap includes only proven current records and yields a complete small export', async () => {
  const c = await client();
  await store.put('leads', `${c.slug}/legacy`, { id: 'legacy', slug: c.slug, customer_name: 'UNTAGGED' });
  await store.put('leads', `${c.slug}/tagged`, { id: 'tagged', slug: c.slug, ...bind(c, { customer_name: 'CURRENT' }) });
  const found = await store.listWorkspaceRecords(c, 'leads', 100);
  assert.deepEqual(found.records.map(row => row.id), ['tagged']); assert.equal(found.listing.incomplete, false);
});
await check('New indexed requests remain visible behind saturated historical keys', async () => {
  const old = await client(), c = rotated(old); await store.saveClient(c);
  for (let n = 0; n < 130; n++) await store.put('leads', `${c.slug}/${String(n).padStart(3, '0')}`, { id: String(n).padStart(3, '0'), slug: c.slug, ...bind(old, { customer_name: 'OLD' }) });
  const latest = await store.addRecord('leads', c.slug, bind(c, { id: 'latest', customer_name: 'CURRENT' }));
  const first = await store.listWorkspaceRecords(c, 'leads', 100);
  assert.equal(first.records.some(row => row.id === latest.id), true); assert.equal(first.listing.incomplete, true);
  const full = await store.listWorkspaceRecords(c, 'leads', 2000);
  assert.deepEqual(full.records.map(row => row.id), ['latest']); assert.equal(full.listing.incomplete, false);
});
await check('Missing primary record never produces a falsely complete listing', async () => {
  const c = await client(); await store.indexWorkspaceRecord('leads', { id: 'uncertain', slug: c.slug, ...bind(c, {}) });
  const found = await store.listWorkspaceRecords(c, 'leads', 100);
  assert.equal(found.records.length, 0); assert.equal(found.listing.incomplete, true);
});
await check('Explicit tenant phone indexes cannot adopt older customer history', async () => {
  const old = await client(), phone = '+17135550142';
  const before = await store.addRecord('leads', old.slug, bind(old, { id: 'old', phone })); await store.addToIndex('leads', old, phone, before.id);
  const c = rotated(old); await store.saveClient(c);
  const current = await store.addRecord('leads', c.slug, bind(c, { id: 'new', phone })); await store.addToIndex('leads', c, phone, current.id);
  assert.deepEqual((await store.recordsFor('leads', c, phone)).map(row => row.id), ['new']);
  await assert.rejects(() => store.recordsFor('leads', old, phone), WorkspaceIdentityError);
});
await check('Health pointers are current-tenant only and old observations remain archived', async () => {
  const old = await client(); await store.noteInbound(old, 'call');
  const c = rotated(old); await store.saveClient(c); assert.equal(await store.lastInbound(c), null);
  await store.noteInbound(c, 'text'); const view = await store.lastInbound(c);
  assert.equal(view.call, undefined); assert.ok(view.text); assert.ok((await store.lastInbound(old)).call);
});
await check('Old reservations and date blocks cannot consume replacement capacity', async () => {
  const old = await client(), date = '2099-01-07';
  const claim = await store.reserveBookingWindow(old, 'old-booking', date, '8 to 12');
  await store.addRecord('bookings', old.slug, bind(old, { id: 'old-booking', status: 'booked', date, window: '8 to 12' }));
  await store.finishBookingWindow(old, 'old-booking', claim); await store.setAvailabilityBlock(old, date, '12 to 5', true);
  const c = rotated(old); await store.saveClient(c);
  assert.deepEqual((await store.getAvailability(c, date, 1)).openings[0].windows, ['8 to 12', '12 to 5']);
  assert.equal((await store.reserveBookingWindow(c, 'first-new-booking', date, '8 to 12')).full, undefined);
  await assert.rejects(() => store.reserveBookingWindow(old, 'late', date, '12 to 5'), WorkspaceIdentityError);
});
await check('Tagged current pre-index reservations migrate; raw capacity blocks do not', async () => {
  const c = await client(), date = '2099-01-07';
  await store.put('bookings', `${c.slug}/current`, { id: 'current', slug: c.slug, status: 'booked', date, window: '8 to 12', ...bind(c, {}) });
  await store.put('index', `capacity:${c.slug}`, { reservations: { current: [date + '|480-720', date + '|720-1020'] }, mutations: { current: 'pending-token' }, stableClaims: {}, blocks: [{ date, windowKey: '720-1020', window: '12 to 5' }] });
  assert.deepEqual((await store.getAvailability(c, date, 1)).openings[0].windows, []);
  const state = await store.get('index', store.capacityKey(c)); assert.equal(state.mutations.current, 'pending-token'); assert.deepEqual(state.blocks, []);
});
await check('Unprovable in-flight unbound capacity requires review rather than freeing a slot', async () => {
  const c = await client(); await store.put('index', `capacity:${c.slug}`, { reservations: { uncertain: ['2099-01-07|480-720'] }, mutations: { uncertain: 'held' } });
  await assert.rejects(() => store.getAvailability(c, '2099-01-07', 1), /needs review/);
});
await check('Unknown onboarding versions never fall back to legacy record listing', async () => {
  const c = await client(); await assert.rejects(() => store.listWorkspaceRecords({ ...c, onboarding: { version: 2 } }, 'leads', 100), WorkspaceIdentityError);
});
await check('Current AI statistics are isolated while shared global spending is retained', async () => {
  await store.del(ai.AI_BUDGET_KIND, ai.AI_BUDGET_KEY); const old = await client(); await ai.reserveAIRequest(old, 'private');
  const c = rotated(old); await store.saveClient(c); const allowance = await ai.getAIAllowance(c);
  assert.equal(allowance.private.used, 0); assert.equal(allowance.private.remaining, 20);
  await ai.reserveAIRequest(c, 'web'); const state = await store.get(ai.AI_BUDGET_KIND, ai.AI_BUDGET_KEY);
  assert.equal(state.used, 2); assert.equal(Object.keys(state.tenants).length, 2);
});
await check('Unbound AI reservations apply an honest reset-bound migration hold', async () => {
  const c = await client(); await store.put(ai.AI_BUDGET_KIND, ai.AI_BUDGET_KEY, { version: 1, day: houstonToday(), used: 20, tenants: { [c.slug]: { private: 20, web: 0 } } });
  const result = await ai.reserveAIRequest(c, 'private'); assert.equal(result.allowed, false); assert.equal(result.aiAllowance.private.used, 0); assert.equal(result.aiAllowance.private.remaining, 0); assert.match(result.aiAllowance.reconciliation, /daily reset/);
});
await check('Email-only replacement during private rehearsal cannot record a new setup proof', async () => {
  const old = await client(), c = { ...old, owner: { ...old.owner, email: 'email-only@example.invalid' } }; let replaced;
  await assert.rejects(() => runOwnerTest({ client: old, contact: 'same-preview', messages: [{ role: 'user', content: 'What do you do?' }], onText: () => { replaced ||= store.saveClient(c); } }), WorkspaceIdentityError);
  await replaced; assert.equal((await store.getClient(c.slug)).setupProof?.testedRevision, undefined);
  const result = await runOwnerTest({ client: c, contact: 'same-preview', messages: [{ role: 'user', content: 'What do you do?' }] });
  assert.equal(result.simulation, true); assert.equal((await store.list('owner_tests', `${c.slug}/${workspaceTenant(old)}/`)).length, 0);
  assert.equal((await store.list('owner_tests', `${c.slug}/${workspaceTenant(c)}/`)).length, 1);
});
await check('Legacy conversation and event routes retain their existing keys', async () => {
  const legacy = await client(); delete legacy.onboarding; await store.saveClient(legacy);
  const conversation = await store.getConversation(legacy, 'web', 'visitor'); conversation.messages.push({ role: 'user', content: 'Legacy' }); await store.saveConversation(conversation);
  assert.ok(await store.get('conversations', `${legacy.slug}/web/visitor`)); const event = await store.logEvent(legacy, 'legacy'); assert.equal(event.tenantIdentity, undefined);
});
assert.equal(externalRequests, 0);
console.log(JSON.stringify({ ok: true, checks: cases.length, cases, externalRequests, evidence: 'Synthetic memory/CAS records and fake-model rehearsal; no actual provider acceptance.' }, null, 2));
