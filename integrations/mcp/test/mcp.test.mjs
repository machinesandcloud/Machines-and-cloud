import './network-block.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { createServer } from '../dist/server.js';
import { readConfiguration, WorkspaceReader, SERVICE_IDS, VIEWS, SafeError } from '../dist/workspace.js';
import { environment, bearer, slug, privateStrings, fixture, jsonResponse } from './fixtures.mjs';
import { physicalAttempts } from './network-block.mjs';

const config = readConfiguration(environment);
const cleanOutput = value => {
  const text = JSON.stringify(value);
  for (const secret of [...privateStrings, 'Never Project Customer', 'Private customer record', 'Never project customer conversation', 'provider-opaque-id-never-project', 'private.invalid', 'private-account-id', 'private-business-id']) assert.equal(text.includes(secret), false, 'Private fixture material must not be projected');
  return text;
};
async function protocol(t, transport = async () => jsonResponse(fixture())) {
  const server = createServer(new WorkspaceReader(config, transport));
  const client = new Client({ name: 'mcp-local-test', version: '1.0.0' });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide); await client.connect(clientSide);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

test('configuration fixes origin/path/query and refuses credential-bearing or arbitrary destinations', () => {
  for (const url of [
    'https://evil.invalid/desk?c=aa', 'https://machinesandcloud.com.evil.invalid/desk?c=aa',
    'http://machinesandcloud.com/desk?c=aa', 'https://machinesandcloud.com:444/desk?c=aa',
    'https://person:password@machinesandcloud.com/desk?c=aa', 'https://machinesandcloud.com/admin?c=aa',
    'https://machinesandcloud.com/desk?c=aa&k=secret', 'https://machinesandcloud.com/desk?c=aa&token=secret',
    'https://machinesandcloud.com/desk?c=aa&c=bb', 'https://machinesandcloud.com/desk?c=AA',
    'https://machinesandcloud.com/desk?c=aa#https://evil.invalid', 'http://127.0.0.1:8900/desk?c=aa'
  ]) assert.throws(() => readConfiguration({ ...environment, MC_WORKSPACE_URL: url }), SafeError);
  assert.throws(() => readConfiguration({ ...environment, MC_OWNER_BEARER: 'bad\nheader' }), SafeError);
  assert.throws(() => readConfiguration({ ...environment, MC_OWNER_BEARER: '' }), SafeError);
  for (const host of ['127.0.0.1:8900', 'localhost:8900', '[::1]:8900']) {
    assert.equal(readConfiguration({ ...environment, MC_WORKSPACE_URL: `http://${host}/desk?c=aa`, MC_MCP_ALLOW_LOOPBACK: '1' }).origin, `http://${host}`);
  }
  assert.throws(() => readConfiguration({ ...environment, MC_WORKSPACE_URL: 'http://192.168.1.2/desk?c=aa', MC_MCP_ALLOW_LOOPBACK: '1' }), SafeError);
});

test('official SDK handshake exposes exactly three read tools with typed strict schemas', async t => {
  const client = await protocol(t);
  assert.equal(client.getServerVersion().name, 'machines-and-cloud-mcp-server');
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(row => row.name).sort(), ['mc_get_service_guide','mc_get_setup_status','mc_get_workspace_link']);
  for (const row of tools) {
    assert.deepEqual(row.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
    assert.equal(row.inputSchema.additionalProperties, false); assert.ok(row.outputSchema);
  }
  assert.equal(client.getServerCapabilities().resources, undefined);
  assert.equal(client.getServerCapabilities().prompts, undefined);
});

test('live projection reads only fixed owner GET and returns service guides without raw DTO', async t => {
  const calls = [];
  const dto = fixture();
  dto.setup.connectionJourney.leadSources[1].capabilities = { receiveLeads: true, receiveMessages: false, sendNativeReplies: false, providerKey: bearer };
  const client = await protocol(t, async (url, init) => { calls.push({ url: String(url), init }); return jsonResponse(dto); });
  const result = await client.callTool({ name: 'mc_get_setup_status', arguments: {} });
  assert.equal(result.isError, undefined);
  const data = result.structuredContent;
  assert.deepEqual(data.services.map(row => row.id), [...SERVICE_IDS]); assert.equal(data.discovery.length, 6);
  assert.equal(data.services[0].label, 'Website chat'); assert.equal(data.services[0].guide.steps[0].id, 'step_1');
  assert.equal(data.services[0].guide.steps[0].reviewUrl, `https://machinesandcloud.com/desk?c=${slug}#know`);
  assert.equal(data.nextAction.reviewUrl, `https://machinesandcloud.com/desk?c=${slug}#know`);
  assert.equal(data.mode, 'read_only'); assert.equal(Number.isNaN(Date.parse(data.observedAt)), false);
  assert.equal(data.discovery[1].label, 'Yelp quote requests'); assert.equal('providerURL' in data.discovery[1], false);
  assert.deepEqual(data.services.find(row => row.id === 'angi').capabilities, { receiveLeads: true, receiveMessages: false, sendNativeReplies: false });
  assert.deepEqual(JSON.parse(result.content[0].text), data); cleanOutput(result);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, `https://machinesandcloud.com/api/client?c=${slug}`);
  assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
  assert.equal(init.cache, 'no-store'); assert.equal(init.headers.Authorization, 'Bearer ' + bearer);
  assert.equal(init.body, undefined); assert.equal(init.headers.Cookie, undefined);
});

test('private interpolation, URLs, controls, long identifiers and unrecognized rows cannot escape', async t => {
  const dto = fixture(), journey = dto.setup.connectionJourney;
  journey.summary = privateStrings.join(' ') + ' https://unsafe.invalid/private';
  journey.nextAction = { kind: 'route', target: 'https://evil.invalid', label: 'Review\u0001unsafe' };
  journey.channels[0].status = 'lowercaseprivatetokenabcdefghijklmnop';
  journey.channels[0].guide.overview = 'a'.repeat(1190) + privateStrings[6];
  journey.channels[0].guide.steps[0].detail = privateStrings.join(' ');
  journey.channels[0].guide.steps.push({ id: 'bad', label: bearer, state: 'privatestate', actor: 'admin' });
  journey.channels.push({ id: 'evil', label: bearer, guide: { steps: [] } });
  journey.discovery.push({ id: 'evil', detail: bearer });
  journey.discovery[0].availability = 'connected'; journey.discovery[0].connectionMode = bearer;
  const client = await protocol(t, async () => jsonResponse(dto));
  const result = await client.callTool({ name: 'mc_get_setup_status', arguments: {} });
  cleanOutput(result); assert.equal(result.structuredContent.services[0].status, 'unknown');
  assert.equal(result.structuredContent.services[0].guide.steps.length, 2);
  assert.equal(result.structuredContent.services.length, 6); assert.equal(result.structuredContent.discovery.length, 6);
  assert.equal(result.structuredContent.discovery[0].availability, 'unknown'); assert.equal(result.structuredContent.discovery[0].connectionMode, 'unknown');
  assert.equal(result.structuredContent.nextAction.reviewUrl.endsWith('#setup'), true);
  assert.equal(JSON.stringify(result).includes('provider_secret_'), false, 'Redact before truncation');
});

test('every service guide and every review link requires fresh owner authorization', async t => {
  let reads = 0;
  const client = await protocol(t, async () => { reads++; return jsonResponse(fixture()); });
  for (const serviceId of SERVICE_IDS) {
    const result = await client.callTool({ name: 'mc_get_service_guide', arguments: { serviceId } });
    assert.equal(result.structuredContent.service.id, serviceId); cleanOutput(result);
  }
  for (const view of VIEWS) {
    const result = await client.callTool({ name: 'mc_get_workspace_link', arguments: { view } });
    assert.deepEqual(result.structuredContent, { reviewUrl: `https://machinesandcloud.com/desk?c=${slug}#${view}`, requiresBrowserSignIn: true });
    cleanOutput(result);
  }
  assert.equal(reads, SERVICE_IDS.length + VIEWS.length);
});

test('SDK service guide routes practice to Test answers and labels only the implemented Angi intake', async t => {
  const dto = fixture();
  dto.setup.connectionJourney.channels[0].guide.steps.push(
    { id: 'practice', label: 'Try your front desk', detail: 'Try a private conversation using your saved rules.', state: 'current', actor: 'customer', focus: 'verification' },
    { id: 'verify_connection', label: 'Check connection', detail: 'Review the connection check.', state: 'upcoming', actor: 'customer', focus: 'verification' }
  );
  const client = await protocol(t, async () => jsonResponse(dto));
  const web = await client.callTool({ name: 'mc_get_service_guide', arguments: { serviceId: 'web' } });
  const steps = web.structuredContent.service.guide.steps;
  assert.equal(steps.find(step => step.label === 'Try your front desk').reviewUrl, `https://machinesandcloud.com/desk?c=${slug}#test`);
  assert.equal(steps.find(step => step.label === 'Check connection').reviewUrl, `https://machinesandcloud.com/desk?c=${slug}#setup`);
  const angi = await client.callTool({ name: 'mc_get_service_guide', arguments: { serviceId: 'angi' } });
  assert.equal(angi.structuredContent.service.label, 'Angi');
  assert.equal(JSON.stringify(angi).includes('HomeAdvisor'), false);
  cleanOutput(web); cleanOutput(angi);
});

test('invalid tool arguments and extra credential/URL fields are rejected before upstream read', async t => {
  let reads = 0;
  const client = await protocol(t, async () => { reads++; return jsonResponse(fixture()); });
  for (const [name, args] of [
    ['mc_get_setup_status', { ownerBearer: 'never-consume' }],
    ['mc_get_service_guide', { serviceId: 'yelp' }],
    ['mc_get_service_guide', { serviceId: 'web', url: 'https://evil.invalid' }],
    ['mc_get_workspace_link', { view: 'admin' }], ['mc_get_workspace_link', { view: 'setup', token: 'never-consume' }]
  ]) {
    let rejected = false;
    try { rejected = (await client.callTool({ name, arguments: args })).isError === true; } catch { rejected = true; }
    assert.equal(rejected, true);
  }
  assert.equal(reads, 0);
});

test('revoked session is not cached and upstream failures disclose only static recovery copy', async t => {
  let reads = 0;
  const client = await protocol(t, async () => ++reads === 1 ? jsonResponse(fixture()) : jsonResponse({ secret: bearer }, 401));
  assert.ok((await client.callTool({ name: 'mc_get_setup_status', arguments: {} })).structuredContent);
  const result = await client.callTool({ name: 'mc_get_workspace_link', arguments: { view: 'account' } });
  assert.equal(result.isError, true); assert.match(result.content[0].text, /Sign in/); cleanOutput(result);
  assert.equal(reads, 2);
  for (const status of [403,429,500]) {
    const failClient = await protocol(t, async () => jsonResponse({ message: privateStrings.join(' ') }, status));
    const failed = await failClient.callTool({ name: 'mc_get_setup_status', arguments: {} });
    assert.equal(failed.isError, true); cleanOutput(failed);
  }
});

test('tenant mismatch, public/old projection, redirects and malformed responses fail closed', async () => {
  const wrongTenant = fixture(); wrongTenant.client.slug = 'different-tenant';
  const noGuides = fixture(); delete noGuides.setup.connectionJourney;
  const failures = [
    () => jsonResponse(wrongTenant), () => jsonResponse(noGuides), () => jsonResponse({ client: { slug } }),
    () => new Response('{not json', { headers: { 'content-type': 'application/json' } }),
    () => new Response('private', { headers: { 'content-type': 'text/html' } }),
    () => jsonResponse(fixture(), 200, { 'content-length': '2000000' }),
    () => new Proxy(jsonResponse(fixture()), { get(target, key) { if (key === 'redirected') return true; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } }),
    () => new Proxy(jsonResponse(fixture()), { get(target, key) { if (key === 'url') return 'https://evil.invalid/'; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } }),
    () => { throw new Error(privateStrings.join(' ')); }
  ];
  for (const response of failures) {
    await assert.rejects(new WorkspaceReader(config, async () => response()).snapshot(), error => { cleanOutput({ message: error.message }); return error instanceof SafeError; });
  }
});

test('response stream cap and timeout bound an incomplete owner read without partial data', async () => {
  const oversized = () => new Response('x'.repeat(1_048_577), { headers: { 'content-type': 'application/json' } });
  await assert.rejects(new WorkspaceReader(config, async () => oversized()).snapshot(), error => error.code === 'response_too_large');
  const transport = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error(bearer)), { once: true }));
  const start = Date.now();
  await assert.rejects(new WorkspaceReader(config, transport, 20).snapshot(), error => { cleanOutput({ message: error.message }); return error.code === 'read_failed'; });
  assert.ok(Date.now() - start < 1000);
});

test('missing current backend guide returns an honest version boundary, never invented instructions', async t => {
  const dto = fixture(); delete dto.setup.connectionJourney.leadSources[0].guide;
  const client = await protocol(t, async () => jsonResponse(dto));
  const status = await client.callTool({ name: 'mc_get_setup_status', arguments: {} });
  assert.equal(status.structuredContent.services.find(row => row.id === 'thumbtack').guideAvailable, false);
  const guide = await client.callTool({ name: 'mc_get_service_guide', arguments: { serviceId: 'thumbtack' } });
  assert.equal(guide.isError, true); assert.match(guide.content[0].text, /current workspace version/);
});

test('real stdio SDK client initializes, lists and calls the built CLI with all physical network blocked', async t => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', fileURLToPath(new URL('./stdio-network.mjs', import.meta.url)), fileURLToPath(new URL('../dist/index.js', import.meta.url))],
    env: environment, stderr: 'pipe' });
  let stderr = ''; transport.stderr.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'stdio-local-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 3);
  for (const [name, args] of [['mc_get_setup_status', {}], ['mc_get_service_guide', { serviceId: 'angi' }], ['mc_get_workspace_link', { view: 'account' }]]) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined); cleanOutput(result);
  }
  assert.equal(stderr, '');
});

test('invalid CLI configuration emits no stdout or private configuration, then exits', async () => {
  const child = spawn(process.execPath, ['--import', fileURLToPath(new URL('./network-block.mjs', import.meta.url)), fileURLToPath(new URL('../dist/index.js', import.meta.url))], { env: { ...environment, MC_WORKSPACE_URL: 'https://evil.invalid/desk?c=secret-private' }, stdio: ['pipe','pipe','pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value); child.stdin.end();
  const code = await new Promise(resolve => child.once('close', resolve));
  assert.equal(code, 1); assert.equal(stdout, ''); cleanOutput({ stderr }); assert.equal(stderr.includes('evil.invalid'), false);
});

test('the complete test process made zero physical network attempts', () => assert.equal(physicalAttempts.count, 0));
