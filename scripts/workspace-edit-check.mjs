// Regression checks against the real owner handler and isolated in-memory storage.
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';

const deny = () => { throw new Error('Workspace-edit checks prohibit network access'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|MC_TWILIO_|MC_MESSAGING_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: 'http://127.0.0.1:8939', PUBLIC_SITE_URL: 'http://127.0.0.1:8939' });
const store = await import('../netlify/functions/lib/store.mjs');
const { newClient, parseHours } = await import('../netlify/functions/lib/config.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { configurationRevision, setupReadiness } = await import('../netlify/functions/lib/setup.mjs');
const { workspaceEditRevision, parseWorkspacePatch, applyWorkspacePatch, workspacePatchConflicts } = await import('../netlify/functions/lib/workspace-edit.mjs');
const handler = (await import('../netlify/functions/client.mjs')).default;
const checks = [];
async function check(name, run) { try { await run(); checks.push({ name, pass: true }); } catch (error) { checks.push({ name, pass: false, error: error.message }); } }
const token = createHash('sha256').update('workspace-edit-regression-owner').digest('hex');
const c = newClient({ slug: 'workspace-edit-regression', ownerKey: 'private-owner-key', owner: { name: 'Alex', email: 'workspace-edit@example.test', phone: '+17135550142' }, business: { name: 'Fixture Air', trade: 'HVAC', city: 'Houston', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture.example.test' } });
Object.assign(c, { status: 'testing', onboarding: { version: 1, verifiedEmail: c.owner.email }, services: ['AC repair'], windows: ['8 to 12'], build: { status: 'built' }, setupProof: { reviewedRevision: 'retained-review', testedRevision: 'retained-test' } });
c.rules.hours = parseHours(c.business.hours);
c.widget.allowedOrigins = ['https://fixture.example.test'];
const read = () => store.get('clients', c.slug);
const reset = () => store.put('clients', c.slug, c);
const revision = client => ({ expectedRevision: configurationRevision(client), expectedEditRevision: workspaceEditRevision(client) });
async function call(body, bearer = token, method = 'PUT') {
  const req = new Request(process.env.URL + '/api/client?c=' + c.slug, { method, headers: { origin: process.env.URL, 'content-type': 'application/json', authorization: 'Bearer ' + bearer }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  const response = await handler(req);
  return { status: response.status, body: await response.json() };
}
await store.put('access_sessions', accessHash(token), { email: c.owner.email, scope: 'onboarding', status: 'active', expiresAt: new Date(Date.now() + 3600000).toISOString() });

await check('Owner reads both revision tokens without receiving the owner key', async () => {
  await reset(); const response = await call(null, token, 'GET');
  assert.equal(response.status, 200); assert.equal(response.body.editRevision, workspaceEditRevision(c));
  assert.equal(response.body.configurationRevision, configurationRevision(c)); assert.equal(response.body.client.ownerKey, undefined);
});
await check('Missing editing token cannot bypass stale-tab protection', async () => {
  await reset(); const response = await call({ expectedRevision: configurationRevision(c), business: { name: 'Unversioned overwrite' } });
  assert.equal(response.status, 409); assert.deepEqual(await read(), c);
});
await check('Malformed supplied callbacks reject the entire write without false success', async () => {
  for (const phone of ['not-a-phone', '123', '+17130000142', '+447700900123', true, null, '7135550142ext9']) {
    await reset(); const response = await call({ ...revision(c), owner: { phone }, summary: 'Must not partially save' });
    assert.equal(response.status, 422, JSON.stringify(response.body)); assert.ok(response.body.fieldErrors['owner.phone']); assert.deepEqual(await read(), c);
  }
});
await check('Partial valid updates normalize the supplied callback and preserve omitted facts', async () => {
  await reset(); const response = await call({ ...revision(c), owner: { phone: '(713) 555-0150' }, business: { name: 'Updated Air' } });
  assert.equal(response.status, 200); const saved = await read();
  assert.equal(saved.owner.phone, '+17135550150'); assert.equal(saved.business.name, 'Updated Air');
  assert.deepEqual(saved.business.serviceArea, c.business.serviceArea); assert.equal(saved.business.website, c.business.website);
  assert.equal(saved.owner.email, c.owner.email); assert.deepEqual(saved.setupProof, c.setupProof);
});
await check('Malformed lists, blank origins and unsupported keys cannot partially mutate', async () => {
  for (const patch of [{ services: 'A string instead of a list' }, { fees: [{ label: 'Diagnostic' }] }, { widget: { allowedOrigins: [''] } }, { rules: { consentAsk: 'false' } }, { rules: { windowCapacity: 1.5 } }, { services: Array(61).fill('Repair') }, { business: { name: 99 } }, { owner: { email: 'takeover@example.test' } }]) {
    await reset(); const response = await call({ ...revision(c), summary: 'Must not partially save', ...patch });
    assert.ok([400, 422].includes(response.status), JSON.stringify(response)); assert.ok(Object.keys(response.body.fieldErrors).length); assert.deepEqual(await read(), c);
  }
});
await check('Optional clearing and incomplete drafts are explicit and cannot activate', async () => {
  await reset(); const response = await call({ ...revision(c), owner: { phone: '', backupPhone: '' }, business: { name: '' }, services: [], rules: { hours: null, avgTicket: '' } });
  assert.equal(response.status, 200); const saved = await read();
  assert.equal(saved.owner.phone, ''); assert.equal(saved.business.name, ''); assert.deepEqual(saved.services, []);
  assert.equal(saved.rules.hours, null); assert.equal(saved.rules.avgTicket, 0); assert.equal(setupReadiness(saved).canActivateWeb, false);
  assert.ok(response.body.setup.channels.web.blockers.some(row => row.id === 'rules'));
});
await check('Clearing a structured day preserves omitted days and 24:00 remains valid', async () => {
  await reset(); const response = await call({ ...revision(c), rules: { hours: { mon: null, tue: { open: '08:00', close: '24:00' } } } });
  assert.equal(response.status, 200); const saved = await read(); assert.equal(saved.rules.hours.mon, null);
  assert.equal(saved.rules.hours.tue.close, '24:00'); assert.deepEqual(saved.rules.hours.wed, c.rules.hours.wed);
  for (const hours of [{ mon: { open: '25:00', close: '26:00' } }, { mon: { open: '17:00', close: '08:00' } }]) {
    const before = await read(), result = await call({ ...revision(before), rules: { hours } }); assert.equal(result.status, 422); assert.deepEqual(await read(), before);
  }
  for (const hours of ['Mon-Fri 9:99-17:99', 'Mon-Fri 6pm-8am', 'Mon-Fri 24:45-24:59']) {
    const before = await read(), result = await call({ ...revision(before), business: { hours } }); assert.equal(result.status, 422); assert.deepEqual(await read(), before);
  }
});
await check('Editing readable hours updates the actual schedule; explicit day values take precedence', async () => {
  await reset(); let response = await call({ ...revision(c), business: { hours: 'Mon-Fri 9am-6pm' } }); assert.equal(response.status, 200);
  let saved = await read(); assert.equal(saved.rules.hours.mon.open, '09:00'); assert.equal(saved.rules.hours.mon.close, '18:00');
  response = await call({ ...revision(saved), business: { hours: 'By appointment' }, rules: { hours: null } }); assert.equal(response.status, 200); assert.equal((await read()).rules.hours, null);
});
await check('Metadata-only changes invalidate stale edit tokens without invalidating desk proofs', async () => {
  await reset(); const old = revision(c); const response = await call({ ...old, digest: { text: false } }); assert.equal(response.status, 200);
  const saved = await read(); assert.equal(configurationRevision(saved), old.expectedRevision); assert.notEqual(workspaceEditRevision(saved), old.expectedEditRevision);
  assert.deepEqual(saved.setupProof, c.setupProof);
  const stale = await call({ ...old, digest: { text: true } }); assert.equal(stale.status, 409); assert.deepEqual(await read(), saved);
});
await check('Two concurrent saves cannot overwrite each other', async () => {
  await reset(); const responses = await Promise.all([call({ ...revision(c), business: { name: 'First tab' } }), call({ ...revision(c), business: { name: 'Second tab' } })]);
  assert.deepEqual(responses.map(row => row.status).sort(), [200, 409]);
});
await check('A stale editing intent cannot cross a recreated workspace incarnation', async () => {
  const replacement = { ...c, ownerKey: 'replacement-private-owner-key' }; await store.put('clients', c.slug, replacement);
  assert.equal(configurationRevision(replacement), configurationRevision(c)); assert.notEqual(workspaceEditRevision(replacement), workspaceEditRevision(c));
  assert.equal((await call({ ...revision(c), summary: 'Old incarnation intent' })).status, 409); assert.deepEqual(await read(), replacement);
});
await check('Provider and management updates do not change the editing token or disappear', async () => {
  const changed = structuredClone(c); changed.management = { revision: 9, notes: ['retained audit'] }; changed.voice.assistantId = 'retained-provider-id';
  assert.equal(workspaceEditRevision(changed), workspaceEditRevision(c)); await store.put('clients', c.slug, changed);
  const result = await call({ ...revision(c), summary: 'Owner answer' }); assert.equal(result.status, 200);
  const saved = await read(); assert.deepEqual(saved.management, changed.management); assert.equal(saved.voice.assistantId, changed.voice.assistantId);
});
await check('Unknown workspace versions and cross-tenant sessions cannot write', async () => {
  const other = createHash('sha256').update('workspace-edit-other-owner').digest('hex');
  await store.put('access_sessions', accessHash(other), { email: 'other@example.test', scope: 'onboarding', status: 'active', expiresAt: new Date(Date.now() + 3600000).toISOString() });
  await reset(); assert.equal((await call({ ...revision(c), summary: 'Forbidden' }, other)).status, 403); assert.deepEqual(await read(), c);
  const future = { ...c, onboarding: { version: 2 } }; await store.put('clients', c.slug, future);
  assert.equal((await call({ ...revision(future), summary: 'Forbidden future update' })).status, 409); assert.deepEqual(await read(), future);
});
await check('Shared owner/operator field limits agree and exact-leaf conflict detection preserves omission', () => {
  for (const operator of [false, true]) assert.throws(() => parseWorkspacePatch({ fees: [{ label: 'x'.repeat(81), amount: '$89' }] }, { operator }));
  const patch = parseWorkspacePatch({ business: { name: 'New name' } }); const background = structuredClone(c); background.business.payLink = 'https://example.test/pay';
  assert.equal(workspacePatchConflicts(c, background, patch), false); assert.equal(applyWorkspacePatch(background, patch).business.payLink, background.business.payLink);
  background.business.name = 'Other editor'; assert.equal(workspacePatchConflicts(c, background, patch), true);
});
const failed = checks.filter(row => !row.pass);
console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks, physicalRequests: 0 }));
if (failed.length) process.exitCode = 1;
