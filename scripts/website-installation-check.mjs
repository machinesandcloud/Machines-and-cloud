// Real handlers, in-memory durable records and installed Anthropic SDK protocol doubles.
// Every physical network route and every provider request is denied. No actual inference occurs.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const deny = () => { throw new Error('Website installation checks prohibit physical network'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
for (const name of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_)/.test(name)) delete process.env[name];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '0', NODE_ENV: 'test', URL: 'http://127.0.0.1:8939', PUBLIC_SITE_URL: 'http://127.0.0.1:8939', ANTHROPIC_API_KEY: 'offline-protocol-placeholder', ANTHROPIC_BASE_URL: 'https://website-model.invalid' });
let modelRequests = 0, unexpected = 0, failAfterTool = false;
function sdkResponse(fixture) {
  const packets = [], emit = data => packets.push(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  emit({ type: 'message_start', message: { id: 'offline-' + modelRequests, type: 'message', role: 'assistant', content: [], model: 'offline-protocol-fixture', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  if (fixture.tool) {
    emit({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'offline-tool-' + modelRequests, name: 'notify_owner', input: {} } });
    emit({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(fixture.tool) } });
  } else {
    emit({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    emit({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: fixture.text } });
  }
  emit({ type: 'content_block_stop', index: 0 });
  emit({ type: 'message_delta', delta: { stop_reason: fixture.tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }); emit({ type: 'message_stop' });
  return new Response(packets.join(''), { headers: { 'content-type': 'text/event-stream' } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin !== 'https://website-model.invalid' || url.pathname !== '/v1/messages') { unexpected++; return deny(); }
  modelRequests++; const body = JSON.parse(init.body), last = body.messages.at(-1);
  if (Array.isArray(last.content)) {
    if (failAfterTool) return Response.json({ type: 'error', error: { type: 'api_error', message: 'Offline injected failure after durable save' } }, { status: 500 });
    return sdkResponse({ text: 'The request is saved in the shop portal. Human contact and arrival remain unconfirmed.' });
  }
  if (/question-only/.test(last.content)) return sdkResponse({ text: 'The shop serves Katy. What else would you like to know?' });
  const phone = last.content.match(/\+1\d{10}/)?.[0] || '+17135550142';
  return sdkResponse({ tool: { customer_name: 'Alex Fixture', phone, address: '12 Oak St, Katy', issue: 'AC repair callback', reason: 'wants_call', urgency: 'flexible', wanted: 'A callback when possible', language: 'en', nobook_reason: 'none', unsure: '' } });
};
const store = await import('../netlify/functions/lib/store.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const { workspaceEditRevision } = await import('../netlify/functions/lib/workspace-edit.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { getAIAllowance } = await import('../netlify/functions/lib/self-service-ai.mjs');
const { weeklyReport, dailyDigest } = await import('../netlify/functions/lib/desk.mjs');
const clientAPI = (await import('../netlify/functions/client.mjs')).default;
const publicAPI = (await import('../netlify/functions/website-installation.mjs')).default;
const chatAPI = (await import('../netlify/functions/chat.mjs')).default;
const ownOrigin = process.env.URL, siteA = 'https://fixture-a.example.test', siteB = 'https://fixture-b.example.test';
const token = createHash('sha256').update('offline-website-owner-session').digest('hex');
const c = newClient({ slug: 'website-install-fixture', ownerKey: 'private-owner-key', owner: { email: 'owner@example.test', name: 'Fixture Owner', phone: '+17135550140' }, business: { name: 'Fixture Air', website: siteA, trade: 'HVAC', city: 'Houston', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
Object.assign(c, { onboarding: { version: 1 }, build: { status: 'built' }, status: 'live', channels: { web: { active: true } }, services: ['AC repair'] });
c.widget.allowedOrigins = [siteA, siteB];
const reviewed = configurationRevision(c); c.setupProof = { reviewedRevision: reviewed, testedRevision: reviewed, testMode: 'live' };
const session = { scope: 'onboarding', email: c.owner.email, status: 'active', expiresAt: new Date(Date.now() + 3600000).toISOString() };
await store.put('clients', c.slug, c); await store.put('access_sessions', accessHash(token), session);
const checks = [], check = async (name, run) => { await run(); checks.push({ name, pass: true }); };
function req(path, body, { origin = ownOrigin, bearer = token, method = 'POST' } = {}) {
  return new Request(ownOrigin + path, { method, headers: { origin, 'content-type': 'application/json', ...(bearer ? { authorization: 'Bearer ' + bearer } : {}) }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
}
async function invoke(handler, path, body, options) { const response = await handler(req(path, body, options)); return { status: response.status, body: await response.json() }; }
const owner = () => invoke(clientAPI, '/api/client?c=' + c.slug, null, { method: 'GET' });
async function start(origin = siteA) {
  const saved = await store.get('clients', c.slug);
  const response = await invoke(clientAPI, '/api/client?c=' + c.slug, { action: 'start_website_check', expectedRevision: configurationRevision(saved), expectedEditRevision: workspaceEditRevision(saved), origin });
  assert.equal(response.status, 200, JSON.stringify(response)); return response.body.check;
}
const publicCall = (check, action, extra = {}, origin = check.origin) => invoke(publicAPI, '/api/website-installation', { action, client: c.slug, checkId: check.id, challenge: check.challenge, ...extra }, { origin, bearer: null });
async function send(check, text = 'Please call me at +17135550142 about AC repair.', turnId = randomBytes(16).toString('hex')) {
  const response = await chatAPI(req('/api/chat', { client: c.slug, contact: check.contact, messages: [{ role: 'user', content: text }], stream: true, websiteCheck: { checkId: check.id, challenge: check.challenge, turnId } }, { origin: check.origin, bearer: null }));
  const content = await response.text();
  const packets = response.headers.get('content-type')?.includes('ndjson') ? content.trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  return { status: response.status, content, packets, turnId, event: packets.find(row => row.t === 'done')?.events?.find(event => event.type === 'website_check') };
}
let checkA, savedTurn, savedRecord;
await check('Owner reads four independent safe facts without triggering model/provider work', async () => {
  const view = await owner(); assert.equal(view.status, 200); const dto = view.body.websiteInstallation;
  assert.equal(dto.website, siteA); assert.equal(dto.observation.state, 'not_checked'); assert.equal(dto.customerChat.available, true); assert.equal(dto.setupRequest.state, 'not_checked'); assert.equal(dto.firstExternalRequest.state, 'none');
  assert.equal(JSON.stringify(dto).includes(c.ownerKey), false); assert.equal(modelRequests, 0);
});
await check('Website-only corrections use the editing token and preserve reviewed business rules', async () => {
  const response = await invoke(clientAPI, '/api/client?c=' + c.slug, { expectedRevision: configurationRevision(c), expectedEditRevision: workspaceEditRevision(c), business: { website: siteA + '/services' } }, { method: 'PUT' });
  assert.equal(response.status, 200); const saved = await store.get('clients', c.slug);
  assert.equal(configurationRevision(saved), configurationRevision(c)); assert.notEqual(workspaceEditRevision(saved), workspaceEditRevision(c)); assert.equal(saved.business.name, c.business.name); await store.put('clients', c.slug, c);
});
await check('Malformed, stale, unapproved and router-fragment starts reject without a challenge or model', async () => {
  const base = { action: 'start_website_check', expectedRevision: configurationRevision(c), expectedEditRevision: workspaceEditRevision(c) };
  for (const patch of [{ origin: 'http://fixture-a.example.test' }, { origin: 'https://wrong.example.test' }, { origin: siteA, expectedEditRevision: '0'.repeat(64) }, { origin: siteA, unexpected: true }]) assert.ok([400, 409, 422].includes((await invoke(clientAPI, '/api/client?c=' + c.slug, { ...base, ...patch })).status));
  const changed = structuredClone(c); changed.business.website += '/#/services'; await store.put('clients', c.slug, changed);
  const blocked = await invoke(clientAPI, '/api/client?c=' + c.slug, { ...base, expectedEditRevision: workspaceEditRevision(changed), origin: siteA }); assert.equal(blocked.status, 422); assert.equal(blocked.body.error, 'unsupported_check_route');
  await store.put('clients', c.slug, c); assert.equal(modelRequests, 0); assert.deepEqual(await store.list('website_installations'), []);
});
await check('One-time URL is bound and absent from the safe owner DTO or stored raw material', async () => {
  checkA = await start(); assert.match(checkA.url, /#mc-website-check=/); assert.equal(checkA.contact, 'websitecheck_' + checkA.id);
  const view = (await owner()).body.websiteInstallation; assert.equal(view.attempt.id, checkA.id); assert.equal(view.observation.state, 'waiting'); assert.equal(JSON.stringify(view).includes(checkA.challenge), false);
  const row = await store.get('website_installations', (await store.list('website_installations'))[0]); assert.equal(JSON.stringify(row).includes(checkA.challenge), false); assert.equal(modelRequests, 0);
});
await check('Observation requires exact external origin and changes no readiness, review or allowance', async () => {
  assert.equal((await publicCall(checkA, 'observe', {}, siteB)).status, 403);
  assert.equal((await publicCall(checkA, 'observe', {}, ownOrigin)).status, 403);
  const first = await publicCall(checkA, 'observe'); assert.equal(first.status, 200); assert.equal(first.body.check.observed, true); assert.equal(first.body.check.chatAvailable, true);
  assert.deepEqual(first.body.check.sample, { service: c.services[0], area: c.business.serviceArea[0] });
  const at = (await owner()).body.websiteInstallation.observation.at; await publicCall(checkA, 'observe'); assert.equal((await owner()).body.websiteInstallation.observation.at, at);
  assert.deepEqual((await store.get('clients', c.slug)).setupProof, c.setupProof); assert.equal((await getAIAllowance(c)).web.used, 0); assert.equal(modelRequests, 0);
});
await check('Only an explicit public send uses the ordinary allowance and saves a labeled actual request', async () => {
  savedTurn = await send(checkA); assert.equal(savedTurn.status, 200); assert.ok(savedTurn.event?.record); assert.equal(savedTurn.event.record.kind, 'leads');
  savedRecord = await store.get('leads', `${c.slug}/${savedTurn.event.record.id}`); assert.equal(savedRecord.contact, checkA.contact); assert.equal(savedRecord.websiteSetupCheck.checkId, checkA.id); assert.equal(savedRecord.websiteSetupCheck.turnId, savedTurn.turnId);
  const view = (await owner()).body.websiteInstallation; assert.equal(view.setupRequest.state, 'saved_unconfirmed'); assert.equal(view.firstExternalRequest.state, 'none'); assert.equal((await getAIAllowance(c)).web.used, 1); assert.equal(modelRequests, 2);
});
await check('Duplicate logical sends and forged acknowledgments cannot spend or invent completion', async () => {
  const before = modelRequests; const duplicate = await send(checkA, 'Same turn must not repeat.', savedTurn.turnId); assert.equal(duplicate.status, 409); assert.equal(modelRequests, before); assert.equal((await getAIAllowance(c)).web.used, 1);
  const forged = await publicCall(checkA, 'acknowledge', { turnId: savedTurn.turnId, completionRef: '0'.repeat(64) }); assert.equal(forged.status, 409); assert.equal((await owner()).body.websiteInstallation.setupRequest.state, 'saved_unconfirmed');
  const status = await publicCall(checkA, 'status', { turnId: savedTurn.turnId }); assert.equal(status.body.check.turn.record.id, savedRecord.id); assert.equal(status.body.check.turn.answerObserved, false); assert.equal(status.body.check.turn.completionRef, undefined);
});
await check('Exact record rebinding blocks acknowledgment and cannot produce green owner evidence', async () => {
  const altered = { ...savedRecord, contact: 'different-contact' }; await store.put('leads', `${c.slug}/${savedRecord.id}`, altered);
  assert.equal((await publicCall(checkA, 'acknowledge', { turnId: savedTurn.turnId, completionRef: savedTurn.event.completionRef })).status, 409); assert.equal((await owner()).body.websiteInstallation.setupRequest.state, 'stale');
  await store.put('leads', `${c.slug}/${savedRecord.id}`, savedRecord);
});
await check('A missing evidence projection reconciles the same saved request without model replay', async () => {
  const rowKey = (await store.list('website_installations'))[0], row = await store.get('website_installations', rowKey);
  row.attempt.turns[savedTurn.turnId].record = null; await store.put('website_installations', rowKey, row);
  const before = modelRequests, budget = (await getAIAllowance(c)).web.used;
  const recovered = await publicCall(checkA, 'status', { turnId: savedTurn.turnId }); assert.equal(recovered.status, 200); assert.equal(recovered.body.check.turn.record.id, savedRecord.id); assert.equal(recovered.body.check.turn.answerObserved, false);
  assert.equal((await owner()).body.websiteInstallation.setupRequest.state, 'saved_unconfirmed'); assert.equal(modelRequests, before); assert.equal((await getAIAllowance(c)).web.used, budget);
  assert.equal((await store.listRecords('leads', c.slug, 100)).length, 1);
});
await check('A valid post-done acknowledgment qualifies the exact request and is idempotent', async () => {
  const body = { turnId: savedTurn.turnId, completionRef: savedTurn.event.completionRef };
  assert.equal((await publicCall(checkA, 'acknowledge', body)).status, 200); const before = (await owner()).body.websiteInstallation;
  assert.equal(before.setupRequest.state, 'complete'); assert.equal(before.setupRequest.record.id, savedRecord.id);
  assert.equal((await publicCall(checkA, 'acknowledge', body)).status, 200); assert.equal((await owner()).body.websiteInstallation.setupRequest.at, before.setupRequest.at);
});
await check('Setup records remain visible and labeled while customer reports and customer export exclude them', async () => {
  const view = await owner(); assert.ok(view.body.leads.some(row => row.id === savedRecord.id && row.websiteSetupCheck)); assert.equal(view.body.today.needsYou, 0);
  const weekly = await weeklyReport(c); assert.equal(weekly.stats?.booked || 0, 0); const digest = await dailyDigest(c); assert.equal(digest.empty, true);
  const csv = await clientAPI(req('/api/client?c=' + c.slug + '&export=customers', null, { method: 'GET' })); assert.equal((await csv.text()).includes(savedRecord.phone), false);
});
await check('Question-only done acknowledgment is not a completed request check', async () => {
  const questionCheck = await start(); await publicCall(questionCheck, 'observe'); const answer = await send(questionCheck, 'question-only: do you serve Katy?'); assert.equal(answer.event.record, null);
  assert.equal((await publicCall(questionCheck, 'acknowledge', { turnId: answer.turnId, completionRef: answer.event.completionRef })).status, 200); assert.equal((await owner()).body.websiteInstallation.setupRequest.state, 'not_checked');
});
await check('Expired/revoked session and changed config reject before model spending', async () => {
  const target = await start(); await publicCall(target, 'observe'); const before = modelRequests, allowance = (await getAIAllowance(c)).web.used;
  await store.put('access_sessions', accessHash(token), { ...session, status: 'revoked' }); assert.equal((await send(target)).status, 410); assert.equal((await publicCall(target, 'observe')).status, 410); await store.put('access_sessions', accessHash(token), session);
  const changed = structuredClone(c); changed.business.name = 'Changed Air'; const rev = configurationRevision(changed); changed.setupProof = { reviewedRevision: rev, testedRevision: rev, testMode: 'live' }; await store.put('clients', c.slug, changed);
  assert.equal((await send(target)).status, 409); await store.put('clients', c.slug, c); assert.equal(modelRequests, before); assert.equal((await getAIAllowance(c)).web.used, allowance);
});
await check('A failed final model response retains its actual saved request as unconfirmed', async () => {
  const target = await start(); await publicCall(target, 'observe'); failAfterTool = true; const failure = await send(target, 'Please call +17135550143.'); failAfterTool = false;
  assert.ok(failure.packets.some(packet => packet.t === 'error')); assert.equal(failure.event, undefined); const dto = (await owner()).body.websiteInstallation;
  assert.equal(dto.setupRequest.state, 'saved_unconfirmed'); assert.ok(await store.get('leads', `${c.slug}/${dto.setupRequest.record.id}`)); assert.equal(dto.firstExternalRequest.state, 'none');
});
await check('Setup contact without check metadata is blocked; ordinary external request uses normal handler', async () => {
  const before = modelRequests;
  const forged = await chatAPI(req('/api/chat', { client: c.slug, contact: checkA.contact, messages: [{ role: 'user', content: 'Do not fall through.' }] }, { origin: siteA, bearer: null })); assert.equal(forged.status, 403); assert.equal(modelRequests, before);
  const ordinary = await chatAPI(req('/api/chat', { client: c.slug, contact: 'ordinary-visitor', messages: [{ role: 'user', content: 'Please call +17135550144.' }] }, { origin: siteA, bearer: null })); assert.equal(ordinary.status, 200); const result = await ordinary.json(); assert.ok(result.events.some(event => event.type === 'lead')); assert.ok(!result.events.some(event => event.type === 'website_check'));
  const dto = (await owner()).body.websiteInstallation; assert.equal(dto.firstExternalRequest.state, 'received'); assert.equal(dto.firstExternalRequest.origin, siteA); const record = await store.get('leads', `${c.slug}/${dto.firstExternalRequest.record.id}`); assert.equal(record.websiteSetupCheck, undefined);
});
await check('Changing selected website keeps the earlier site request historical until a current-site request exists', async () => {
  const changed = structuredClone(c); changed.business.website = siteB; await store.put('clients', c.slug, changed);
  assert.equal((await owner()).body.websiteInstallation.firstExternalRequest.state, 'stale');
  const ordinary = await chatAPI(req('/api/chat', { client: c.slug, contact: 'ordinary-b', messages: [{ role: 'user', content: 'Please call +17135550145.' }] }, { origin: siteB, bearer: null })); assert.equal(ordinary.status, 200); await ordinary.json();
  const dto = (await owner()).body.websiteInstallation; assert.equal(dto.firstExternalRequest.state, 'received'); assert.equal(dto.firstExternalRequest.origin, siteB); await store.put('clients', c.slug, c);
});
await check('Replacing a workspace incarnation cannot inherit installation/check/first-request evidence', async () => {
  const replacement = { ...c, ownerKey: 'new-private-incarnation' }; await store.put('clients', c.slug, replacement); const dto = (await owner()).body.websiteInstallation;
  assert.equal(dto.observation.state, 'not_checked'); assert.equal(dto.setupRequest.state, 'not_checked'); assert.equal(dto.firstExternalRequest.state, 'none'); assert.equal((await publicCall(checkA, 'status')).status, 409); await store.put('clients', c.slug, c);
});
await check('Removing an allowed website rejects its actual installation and chat despite preserved business revision', async () => {
  await store.put('clients', c.slug, c); const pending = await start(); assert.equal((await publicCall(pending, 'observe')).status, 200);
  const before = await store.get('clients', c.slug), oldRevision=configurationRevision(before), calls=modelRequests;
  const updated=await invoke(clientAPI,'/api/client?c='+c.slug,{expectedRevision:oldRevision,expectedEditRevision:workspaceEditRevision(before),widget:{allowedOrigins:[siteB]}},{method:'PUT'});
  assert.equal(updated.status,200);const saved=await store.get('clients',c.slug);assert.equal(configurationRevision(saved),oldRevision);assert.deepEqual(saved.widget.allowedOrigins,[siteB]);
  assert.ok([403,409].includes((await publicCall(pending,'observe')).status));
  const blocked=await chatAPI(req('/api/chat',{client:c.slug,contact:'removed-origin',messages:[{role:'user',content:'No model request may run.'}]},{origin:siteA,bearer:null}));
  assert.equal(blocked.status,403);assert.equal(modelRequests,calls);const view=(await owner()).body.websiteInstallation;assert.notEqual(view.observation.state,'found');assert.notEqual(view.setupRequest.state,'complete');await store.put('clients',c.slug,c);
});
assert.equal(unexpected, 0);
const report = { ok: true, checks, model: 'Installed Anthropic SDK with scripted in-process SSE responses; no actual inference', actualExternalRequests: unexpected, actualModelCalls: 0, actualProviderCalls: 0, fixtureSdkRequests: modelRequests, actualHandlersAndDurableMemoryRecords: true };
const outputAt = process.argv.indexOf('--output'), output = outputAt >= 0 ? process.argv[outputAt + 1] : null;
if (outputAt >= 0 && !output) throw new Error('--output requires a local evidence path');
if (output) { const path = resolve(output); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ ok: true, passed: checks.length, actualExternalRequests: unexpected, fixtureSdkRequests: modelRequests, report: output || null }));
