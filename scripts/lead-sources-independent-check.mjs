// Independent actual-handler QA. Synthetic conditional Blobs transport only;
// no credentials, physical networking, provider calls, emails or deployment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const output = process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] : null;
if (output && (!/^scratchpad\/lead-sources-independent-[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw Error('Choose a fresh independent receipt.');
const hash = value => createHash('sha256').update(value).digest('hex');
const sourcePaths = ['netlify/functions/lib/lead-connections.mjs','netlify/functions/angi.mjs','netlify/functions/thumbtack.mjs','netlify/functions/client.mjs','netlify/functions/lib/request-followthrough.mjs','netlify/functions/lib/store.mjs','netlify/functions/scheduler.mjs','desk.html','desk-lead-sources.js','desk-lead-sources.css','desk-requests.js','desk.js'];
const hashes = () => Object.fromEntries(sourcePaths.filter(existsSync).map(path => [path, hash(readFileSync(path))]));
const report = { at: new Date().toISOString(), boundary: 'Independent QA of actual handlers and a conditional Netlify Blobs protocol double; all physical networking denied. Does not establish vendor setup, delivery, customer communications or publication.', before: hashes(), checks: [], failures: [], physicalNetworkAttempts: 0, unexpectedFetches: [], protocolRequests: 0 };
const deny = () => { report.physicalNetworkAttempts++; throw Error('Independent lead QA denies physical networking.'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|CALENDAR_|MANAGED_|PHONE_|VOICE_|MESSAGING_|SERVICE_|NETLIFY_|BLOBS_)/.test(key)) delete process.env[key];
const origin = 'https://lead-qa.example.test';
Object.assign(process.env, { MC_MEMORY_STORE: '0', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const records = new Map(); let revision = 0, serial = 0, fault = null, hook = null;
const protocolOrigin = 'https://lead-qa-blobs.invalid';
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin !== protocolOrigin) { report.unexpectedFetches.push({ origin: url.origin, path: url.pathname }); return deny(); }
  report.protocolRequests++;
  const [, site, kind, ...parts] = url.pathname.split('/').map(decodeURIComponent), key = parts.join('/'), name = kind + '/' + key, method = (init.method || 'GET').toUpperCase();
  assert.equal(site, 'offline-site');
  const info = { kind, key, name, method, init };
  if (hook && hook.match(info)) { const captured = hook; hook = null; await captured.run(info); }
  if (fault && fault.match(info) && fault.mode === 'read' && method === 'GET') { fault = null; return new Response('Synthetic read refused', { status: 400 }); }
  if (method === 'GET' && !key) return Response.json({ blobs: [...records.keys()].filter(name => name.startsWith(kind + '/' + (url.searchParams.get('prefix') || ''))).map(name => ({ key: name.slice(kind.length + 1) })), directories: [] });
  const current = records.get(name), headers = new Headers(init.headers);
  if (method === 'GET') return current ? new Response(current.value, { headers: { etag: current.etag, 'content-type': 'application/json' } }) : new Response(null, { status: 404 });
  if (method === 'DELETE') { records.delete(name); return new Response(null, { status: 204 }); }
  assert.equal(method, 'PUT');
  if (headers.get('if-none-match') === '*' && current || headers.has('if-match') && headers.get('if-match') !== current?.etag) return new Response(null, { status: 412 });
  if (fault && fault.match(info) && fault.mode === 'before') { fault = null; return new Response('Synthetic write refused', { status: 400 }); }
  const etag = String(++revision); records.set(name, { value: init.body, etag });
  if (fault && fault.match(info) && fault.mode === 'after') { fault = null; return new Response('Synthetic lost acknowledgment', { status: 400 }); }
  return new Response(null, { headers: { etag } });
};
const { setEnvironmentContext } = await import('@netlify/blobs');
setEnvironmentContext({ siteID: 'offline-site', token: 'offline-token', edgeURL: protocolOrigin, uncachedEdgeURL: protocolOrigin });
const store = await import('../netlify/functions/lib/store.mjs'), { newClient } = await import('../netlify/functions/lib/config.mjs'), { workspaceTenant } = await import('../netlify/functions/lib/workspace-identity.mjs');
const clientHandler = (await import('../netlify/functions/client.mjs')).default, angiHandler = (await import('../netlify/functions/angi.mjs')).default, thumbtackHandler = (await import('../netlify/functions/thumbtack.mjs')).default;
const leadConnections = await import('../netlify/functions/lib/lead-connections.mjs');
async function check(name, run) { fault = hook = null; try { await run(); report.checks.push({ name, pass: true }); } catch (error) { const failure = { name, pass: false, error: error.message, stack: error.stack }; report.checks.push(failure); report.failures.push(failure); } finally { fault = hook = null; } }
async function fixture() {
  const n = ++serial, slug = 'lead-qa-' + n, client = { ...newClient({ slug, ownerKey: 'synthetic-owner-' + n, owner: { name: 'Alex Owner', email: slug + '@example.test', phone: '+17135550123' }, business: { name: 'Independent QA Service', trade: 'HVAC', city: 'Houston', serviceArea: ['Houston'] } }), onboarding: { version: 1 }, status: 'testing', build: { status: 'built' } };
  await store.saveClient(client); const token = hash('synthetic-session-' + n);
  await store.put('access_sessions', hash(token), { scope: 'onboarding', status: 'active', email: client.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { client, token, providerBusinessId: String(100000 + n) };
}
async function owner(f, body = null, options = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: options.origin || origin, ...(options.token === null ? {} : { Authorization: 'Bearer ' + (options.token || f.token) }) };
  const response = await clientHandler(new Request(origin + '/api/client?c=' + f.client.slug + (options.query || ''), { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { status: response.status, body: await response.json() };
}
async function connection(f, source = 'angi') { const result = await owner(f); assert.equal(result.status, 200, JSON.stringify(result.body)); assert.ok(result.body.leadConnections, 'Owner data must expose actual lead-source state.'); return result.body.leadConnections[source]; }
function command(f, operation = 'prepare', generation = null, source = 'angi', extra = {}) { return { action: 'lead_connection', source, operation, expectedGeneration: generation, operationId: hash('operation-' + (++serial)).slice(0, 32), providerBusinessId: f.providerBusinessId, integrationEmail: f.client.owner.email, ...extra }; }
async function prepare(f, source = 'angi') { const result = await owner(f, command(f, 'prepare', null, source)); assert.equal(result.status, 200, JSON.stringify(result)); return connection(f, source); }
const payload = (f, extra = {}) => ({ leadOid: f.providerBusinessId + '001', srOid: f.providerBusinessId + '700', spEntityId: f.providerBusinessId, name: 'Jamie Customer', address: '12 Oak St', city: 'Houston', stateProvince: 'TX', postalCode: '77057', primaryPhone: '+17135550142', email: 'jamie@example.test', taskName: 'Repair central air', comments: 'Air is warm after the filter was changed.', interview: [{ question: 'When?', answer: 'Tomorrow afternoon' }], ...extra });
async function deliver(config, body, overrides = {}) {
  assert.ok(config.setup?.endpoint && config.setup?.secret, 'A documented supported source must expose its prepared endpoint and secret.');
  const url = new URL(overrides.url || config.setup.endpoint), headers = { 'Content-Type': 'application/json', 'x-api-key': config.setup.secret, ...(overrides.headers || {}) };
  if (overrides.removeKey) delete headers['x-api-key'];
  const response = await angiHandler(new Request(url, { method: overrides.method || 'POST', headers, ...(overrides.method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }));
  return { status: response.status, body: await response.json() };
}
async function leads(f) { return (await store.listWorkspaceRecords(f.client, 'leads', 2000)).records; }
const leadRow = info => info.kind.endsWith('leads') && info.method === 'PUT';
const connectionRow = info => info.kind.endsWith('lead_connections') && info.method === 'PUT';

// Cases below are contract-driven. They deliberately use distinct lead and service-request IDs.
await check('All authenticated owners can discover both lead platforms without a fabricated connected state', async () => {
  const f = await fixture(), result = await owner(f); assert.equal(result.status, 200);
  for (const source of ['angi', 'thumbtack']) { const view = result.body.leadConnections?.[source]; assert.ok(view, source); assert.notEqual(view.state, 'connected'); assert.notEqual(view.capabilities?.sendNativeReplies, true); }
});
await check('Connection changes require the current owner session and same-site origin', async () => {
  const f = await fixture(), alien = await fixture(), body = command(f);
  assert.equal((await owner(f, body, { token: null })).status, 401);
  assert.equal((await owner(f, body, { token: alien.token })).status, 403);
  assert.equal((await owner(f, body, { origin: 'https://foreign.example.test' })).status, 403);
  assert.equal((await owner(f, body, { token: null, query: '&k=' + f.client.ownerKey })).status, 401);
});
await check('Unsupported sources and malformed business identities cannot create configuration', async () => {
  const f = await fixture();
  for (const patch of [{ source: 'invented' }, { providerBusinessId: [] }, { providerBusinessId: 'not-a-pro-id' }, { integrationEmail: 'invalid' }, { operationId: [] }, { unknown: true }]) { const result = await owner(f, { ...command(f), ...patch }); assert.equal(result.status, 400, JSON.stringify(patch)); }
  assert.equal((await connection(f)).generation, null);
});
await check('Preparing Angi retains setup details and exposes an opaque tenant-bound endpoint without claiming vendor setup', async () => {
  const f = await fixture(), view = await prepare(f); assert.equal(view.providerBusinessId, f.providerBusinessId); assert.equal(view.integrationEmail, f.client.owner.email);
  assert.notEqual(view.state, 'connected'); assert.equal(view.receivedCount, 0); assert.ok(view.setup.endpoint); assert.ok(view.setup.secret); assert.equal(view.setup.headerName.toLowerCase(), 'x-api-key');
  const endpoint = new URL(view.setup.endpoint); assert.equal(endpoint.pathname, '/api/angi'); assert.ok(endpoint.searchParams.get('g')); assert.ok(endpoint.searchParams.get('t')); assert.equal(endpoint.href.includes(f.client.ownerKey), false); assert.equal(endpoint.href.includes(view.setup.secret), false);
  assert.match(JSON.stringify(view.setup.instructions), /Angi/i);
});
await check('Anonymous reads never expose the lead-source secret', async () => { const f = await fixture(), view = await prepare(f), result = await owner(f, null, { token: null }); assert.equal(JSON.stringify(result.body).includes(view.setup.secret), false); });
await check('Documented Angi input becomes one durable source-aware Inbox request with complete useful context', async () => {
  const f = await fixture(), view = await prepare(f), response = await deliver(view, payload(f)); assert.equal(response.status, 200); assert.equal(response.body.status, 'success');
  const saved = await leads(f); assert.equal(saved.length, 1); const lead = saved[0]; assert.equal(lead.source, 'angi'); assert.equal(lead.sourceId, payload(f).leadOid); assert.equal(lead.tenantIdentity || lead.delivery?.tenantIdentity, workspaceTenant(f.client));
  assert.match(JSON.stringify(lead), /Air is warm/); assert.match(JSON.stringify(lead), /Tomorrow afternoon/); assert.match(lead.address, /TX/); assert.match(lead.issue, /Repair central air/); assert.equal(lead.phone, '+17135550142');
  const detail = await owner(f, null, { query: '&requestId=' + lead.id }); assert.equal(detail.status, 200); assert.match(JSON.stringify(detail.body.request), /Angi|angi/); assert.match(JSON.stringify(detail.body.request), /Reply|reply/);
});
await check('Optional Angi pro ID can be absent, but a provided different pro ID is rejected', async () => {
  const f = await fixture(), view = await prepare(f), body = payload(f); delete body.spEntityId; assert.equal((await deliver(view, body)).status, 200);
  const mismatch = await deliver(view, payload(f, { leadOid: f.providerBusinessId + '002', spEntityId: '99999999' })); assert.ok([400, 403].includes(mismatch.status)); assert.equal((await leads(f)).length, 1);
});
await check('Concurrent retries and a changed redelivery preserve the same saved request and original facts', async () => {
  const f = await fixture(), view = await prepare(f), body = payload(f), responses = await Promise.all(Array.from({ length: 8 }, () => deliver(view, body))); assert.ok(responses.every(result => result.status === 200)); assert.equal((await leads(f)).length, 1);
  const original = (await leads(f))[0]; assert.equal((await deliver(view, payload(f, { comments: 'A redelivery must not overwrite an owner-reviewed request.', primaryPhone: '+17135550199' }))).status, 409); assert.deepEqual((await leads(f))[0], original);
});
await check('Two leads about the same service request remain two distinct requests', async () => {
  const f = await fixture(), view = await prepare(f), a = payload(f), b = payload(f, { leadOid: f.providerBusinessId + '003', srOid: a.srOid }); assert.equal((await deliver(view, a)).status, 200); assert.equal((await deliver(view, b)).status, 200); assert.equal((await leads(f)).length, 2);
});
await check('A copied secret cannot authenticate another workspace or an altered generation', async () => {
  const f = await fixture(), alien = await fixture(), view = await prepare(f), other = await prepare(alien), cross = await deliver(other, payload(alien), { headers: { 'x-api-key': view.setup.secret } }); assert.ok([400, 403, 404, 409].includes(cross.status));
  const url = new URL(view.setup.endpoint); url.searchParams.set('g', 'f'.repeat(32)); assert.ok([400, 403, 404, 409].includes((await deliver(view, payload(f), { url })).status)); assert.equal((await leads(f)).length, 0); assert.equal((await leads(alien)).length, 0);
});
await check('Only the documented x-api-key header authenticates managed Angi intake', async () => {
  const f = await fixture(), view = await prepare(f), url = new URL(view.setup.endpoint); url.searchParams.set('key', view.setup.secret);
  assert.ok([400, 403].includes((await deliver(view, payload(f), { url, removeKey: true })).status)); assert.equal((await deliver(view, payload(f), { method: 'GET' })).status, 405); assert.equal((await leads(f)).length, 0);
});
await check('Malformed JSON, nonobjects and invalid identifiers are rejected before durable receipt', async () => {
  const f = await fixture(), view = await prepare(f);
  for (const body of ['{', [], null, payload(f, { leadOid: '' }), payload(f, { leadOid: {} }), payload(f, { leadOid: Number.MAX_SAFE_INTEGER + 1 }), payload(f, { primaryPhone: [] })]) { const result = await deliver(view, body); assert.equal(result.status, 400, JSON.stringify(body)); }
  assert.equal((await leads(f)).length, 0);
});
await check('Rotation revokes the old endpoint but does not duplicate a previously saved lead', async () => {
  const f = await fixture(), old = await prepare(f); await deliver(old, payload(f)); const first = (await leads(f))[0]; const changed = await owner(f, command(f, 'rotate', old.generation)); assert.equal(changed.status, 200, JSON.stringify(changed)); const current = await connection(f); assert.notEqual(current.generation, old.generation); assert.notEqual(current.setup.secret, old.setup.secret);
  assert.ok([403, 409, 410].includes((await deliver(old, payload(f, { leadOid: f.providerBusinessId + '004' }))).status)); assert.equal((await deliver(current, payload(f))).status, 200); assert.equal((await leads(f)).length, 1); assert.equal((await leads(f))[0].id, first.id);
});
await check('Disconnect stops new receipts while preserving readable saved requests', async () => {
  const f = await fixture(), view = await prepare(f); await deliver(view, payload(f)); const changed = await owner(f, command(f, 'disconnect', view.generation)); assert.equal(changed.status, 200, JSON.stringify(changed)); assert.ok([403, 409, 410].includes((await deliver(view, payload(f, { leadOid: f.providerBusinessId + '005' }))).status)); assert.equal((await leads(f)).length, 1); assert.equal((await connection(f)).state, 'disconnected');
});
await check('Generation conflicts preserve the current configuration instead of rotating twice', async () => {
  const f = await fixture(), view = await prepare(f), responses = await Promise.all([owner(f, command(f, 'rotate', view.generation)), owner(f, command(f, 'disconnect', view.generation))]); assert.deepEqual(responses.map(result => result.status).sort(), [200, 409]);
});
await check('Closed workspaces reject new source configuration and incoming leads without erasing history', async () => {
  const f = await fixture(), view = await prepare(f); await deliver(view, payload(f)); await store.atomicUpdate('clients', f.client.slug, current => ({ value: { ...current, status: 'cancelled' } })); assert.equal((await owner(f, command(f, 'rotate', view.generation))).status, 409); assert.ok([403, 409, 410].includes((await deliver(view, payload(f, { leadOid: f.providerBusinessId + '006' }))).status)); assert.equal((await leads(f)).length, 1);
});
await check('A replacement workspace cannot inherit the former endpoint, configuration or lead history', async () => {
  const f = await fixture(), view = await prepare(f); await deliver(view, payload(f)); await store.atomicUpdate('clients', f.client.slug, current => ({ value: { ...current, ownerKey: current.ownerKey + '-replacement' } })); assert.ok([403, 409, 410].includes((await deliver(view, payload(f, { leadOid: f.providerBusinessId + '007' }))).status)); const result = await owner(f); assert.equal(result.status, 200); assert.equal(result.body.leads.length, 0); assert.equal(result.body.leadConnections.angi.generation, null); assert.equal(JSON.stringify(result.body).includes(view.setup.secret), false);
});
await check('A failed conditional configuration write cannot be reported saved', async () => {
  const f = await fixture(); fault = { mode: 'before', match: connectionRow }; const result = await owner(f, command(f)); assert.equal(result.status, 503); assert.equal((await connection(f)).generation, null);
});
await check('A lost configuration acknowledgment is recovered by reading the one saved configuration', async () => {
  const f = await fixture(), body = command(f); fault = { mode: 'after', match: connectionRow }; const result = await owner(f, body); assert.equal(result.status, 503); const saved = await connection(f); assert.ok(saved.generation); const retry = await owner(f, body); assert.equal(retry.status, 200); assert.equal((await connection(f)).generation, saved.generation); assert.equal((await connection(f)).setup.secret, saved.setup.secret);
});
await check('A failed lead write is never acknowledged without a retained source receipt', async () => {
  const f = await fixture(), view = await prepare(f); fault = { mode: 'before', match: leadRow }; const result = await deliver(view, payload(f)); assert.ok([200, 503].includes(result.status)); const row = await store.get('lead_connections', f.client.slug + '/' + workspaceTenant(f.client) + '/angi'); assert.ok(row && JSON.stringify(row).includes(payload(f).leadOid), 'A success or uncertain materialization must retain the same source receipt.');
  assert.equal((await deliver(view, payload(f))).status, 200); assert.equal((await leads(f)).length, 1);
});
await check('A lost lead-write acknowledgment reconciles to one request on vendor retry', async () => {
  const f = await fixture(), view = await prepare(f); fault = { mode: 'after', match: leadRow }; const first = await deliver(view, payload(f)); assert.ok([200, 503].includes(first.status)); assert.equal((await deliver(view, payload(f))).status, 200); assert.equal((await leads(f)).length, 1);
});
await check('Scheduled recovery materializes a durably accepted lead without a new vendor request', async () => {
  const f = await fixture(), view = await prepare(f); fault = { mode: 'before', match: leadRow }; const result = await deliver(view, payload(f)); assert.equal(result.status, 503); assert.equal((await leads(f)).length, 0);
  const first = await leadConnections.recoverLeadConnections(); assert.ok(first.recovered >= 1); assert.equal((await leads(f)).length, 1); const saved = (await leads(f))[0]; assert.equal((await leadConnections.recoverLeadConnections()).recovered, 0); assert.deepEqual((await leads(f))[0], saved); assert.equal((await connection(f)).pendingCount, 0);
});
await check('A refused intake claim cannot acknowledge or create a request and vendor retry saves once', async () => {
  const f = await fixture(), view = await prepare(f); fault = { mode: 'before', match: connectionRow }; assert.equal((await deliver(view, payload(f))).status, 503); assert.equal((await leads(f)).length, 0); assert.equal((await connection(f)).pendingCount, 0);
  assert.equal((await deliver(view, payload(f))).status, 200); assert.equal((await leads(f)).length, 1);
});
await check('A lost intake-claim acknowledgment is retained and scheduled recovery creates that same request', async () => {
  const f = await fixture(), view = await prepare(f); fault = { mode: 'after', match: connectionRow }; assert.equal((await deliver(view, payload(f))).status, 503); assert.equal((await leads(f)).length, 0); assert.equal((await connection(f)).pendingCount, 1);
  assert.ok((await leadConnections.recoverLeadConnections()).recovered >= 1); assert.equal((await leads(f)).length, 1); assert.equal((await deliver(view, payload(f))).status, 200); assert.equal((await leads(f)).length, 1);
});
await check('The pending-receipt bound refuses excess leads and later recovery frees capacity without losing accepted work', async () => {
  const f = await fixture(), view = await prepare(f);
  for (let n = 1; n <= 20; n++) { fault = { mode: 'before', match: leadRow }; assert.equal((await deliver(view, payload(f, { leadOid: String(8000000 + n) }))).status, 503); }
  assert.equal((await connection(f)).pendingCount, 20); assert.equal((await deliver(view, payload(f, { leadOid: '8000021' }))).status, 503); assert.equal((await connection(f)).pendingCount, 20);
  const recovery = await leadConnections.recoverLeadConnections(); assert.ok(recovery.recovered >= 20); assert.equal((await leads(f)).length, 20); assert.equal((await deliver(view, payload(f, { leadOid: '8000021' }))).status, 200); assert.equal((await leads(f)).length, 21);
});
await check('Rotation between payload validation and the conditional intake claim rejects the stale key', async () => {
  const f = await fixture(), view = await prepare(f); hook = { match: connectionRow, run: async () => { const result = await owner(f, command(f, 'rotate', view.generation)); assert.equal(result.status, 200); } };
  assert.equal((await deliver(view, payload(f))).status, 403); assert.equal((await leads(f)).length, 0);
});
await check('Session revocation during a conditional setup change cannot create new configuration', async () => {
  const f = await fixture(); hook = { match: info => info.kind.endsWith('lead_connections') && info.method === 'GET', run: async () => { await store.atomicUpdate('access_sessions', hash(f.token), current => ({ value: { ...current, status: 'revoked' } })); } };
  assert.equal((await owner(f, command(f))).status, 401); assert.equal(await store.get('lead_connections', f.client.slug + '/' + workspaceTenant(f.client) + '/angi'), null);
});
await check('A platform reply draft is retained without claiming an attempted or sent reply', async () => {
  const f = await fixture(), view = await prepare(f); await deliver(view, payload(f)); const lead = (await leads(f))[0], detail = (await owner(f, null, { query: '&requestId=' + lead.id })).body.request;
  const input = { action: 'request_followthrough', requestId: lead.id, sourceRevision: detail.sourceRevision, expectedRevision: detail.revision, operationId: hash('draft-' + (++serial)).slice(0, 32), type: 'draft_reply', text: 'Thanks Jamie. Would tomorrow afternoon work for a visit?', note: '' };
  const result = await owner(f, input); assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.request.state.replyDraft.text, input.text); assert.equal(result.body.request.state.contact, 'not_recorded'); assert.equal(result.body.request.history.at(-1).type, 'draft_reply'); assert.equal((await owner(f, input)).body.request.history.length, 1);
  assert.equal((await store.list('tasks', f.client.slug + '/')).length, 0); assert.equal((await store.list('managed_deliveries', f.client.slug + '/')).length, 0);
});
await check('A connection read failure returns unavailable rather than inventing a blank setup', async () => {
  const f = await fixture(); await prepare(f); fault = { mode: 'read', match: info => info.kind.endsWith('lead_connections') && info.key.endsWith('/angi') }; assert.equal((await owner(f)).status, 503);
});
await check('Thumbtack preserves an honest partner-access request without a fabricated receiving endpoint', async () => {
  const f = await fixture(), view = await prepare(f, 'thumbtack'); assert.equal(view.state, 'partner_access_required'); assert.equal(view.capabilities.receiveLeads, false); assert.equal(view.capabilities.receiveMessages, false); assert.equal(view.capabilities.sendNativeReplies, false); assert.ok(!view.setup?.endpoint); assert.ok(!view.setup?.secret); assert.match(JSON.stringify(view), /partner|access/i);
  const response = await thumbtackHandler(new Request(origin + '/api/thumbtack?c=' + f.client.slug, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ negotiationID: 'unverified-payload', business: { businessID: f.providerBusinessId } }) })); assert.notEqual(response.status, 200); assert.equal((await leads(f)).length, 0);
});
await check('Imported numbers and consent-looking fields never create messaging authority, sends or legacy chase jobs', async () => {
  const f = await fixture(), view = await prepare(f); await deliver(view, payload(f, { consent: true, tcpaConsent: true, automatedContactCompliant: true, automatedContactConsentId: 'source-context-only', trustedFormURL: 'https://example.test/permission' }));
  for (const kind of ['consent', 'managed_consents', 'managed_deliveries', 'tasks', 'alerts', 'conversations']) assert.equal((await store.list(kind, f.client.slug + '/')).length, 0, kind);
  const saved = (await leads(f))[0]; assert.notEqual(saved.consent?.status, 'accepted'); assert.notEqual(saved.delivery?.mode, 'automated'); assert.equal(report.unexpectedFetches.length, 0);
});

report.after = hashes(); report.sourceStable = JSON.stringify(report.before) === JSON.stringify(report.after); report.passed = report.checks.filter(row => row.pass).length; report.total = report.checks.length;
report.ok = report.passed === report.total && report.sourceStable && report.physicalNetworkAttempts === 0 && report.unexpectedFetches.length === 0;
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ output, ok: report.ok, passed: report.passed, total: report.total, sourceStable: report.sourceStable, failures: report.failures.map(({ name, error }) => ({ name, error })) }, null, 2));
if (!report.ok) process.exitCode = 1;
