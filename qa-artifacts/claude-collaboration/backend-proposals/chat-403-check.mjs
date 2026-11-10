// Proposal 2 acceptance check: definite chat 403 refusals tell the widget whether the turn was processed.
// Calls the real netlify/functions/chat.mjs handler in-process. No network, fake model, empty provider env.
// Every 403 return in chat.mjs (base lines :63, :87, :90, :104, :108, :111, :112) is reached twice:
//   - first send (fresh turnId):  expects turnNotProcessed === true, a customer-facing message, CORS echo;
//   - recoverTurn probe (same id): expects turnNotProcessed === false (the original turn may be saved).
// Two storage backends run the same scenarios:
//   - "memory":       MC_MEMORY_STORE=1 (the deploy smoke store); afterwards the conversation is still empty;
//   - "blobs-double": the real @netlify/blobs client against an in-process Map that logs every access,
//                     proving no `conversations` (or AI-allowance) key is read or written before the 403.
// A 200 control send proves the access log does see conversation reads when a turn is admitted.
// Usage: node chat-403-check.mjs [--repo <repo root>] [--output <new json path>] [--emit-fixture <path>]
//   --emit-fixture writes the real first-send and recover 403 bodies (used by the widget run).
// Expected: FAILS on dfb0ae78 (no flag/message/CORS), PASSES with 02-chat-403.patch.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg('--repo') || resolve(import.meta.dirname, '../../..'));
const output = arg('--output'), emit = arg('--emit-fixture');
for (const path of [output, emit]) if (path && existsSync(path)) throw new Error('Choose a new output path: ' + path);
const deny = () => { throw new Error('chat-403-check denies real networking'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|CALENDAR_|MANAGED_|PHONE_|SERVICE_|MC_SELF_SERVICE_AI_|ADMIN_KEY|SITE_ORIGINS|DEPLOY_)/.test(key)) delete process.env[key];
const SITE = 'https://platform.example.test', SHOP = 'https://shop.example.test', EVIL = 'https://elsewhere.example.test';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: SITE, PUBLIC_SITE_URL: SITE });

// In-process Blobs double with an access log.
const blobs = new Map(), access = []; let etag = 0, otherRequests = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin !== 'https://chat403-blobs.invalid') { otherRequests++; return deny(); }
  const [, site, rawKind, ...parts] = url.pathname.split('/').map(decodeURIComponent), kind = rawKind.replace(/^site:/, ''), key = parts.join('/'), name = kind + '/' + key, method = String(init.method || 'GET').toUpperCase();
  assert.equal(site, 'offline-site'); access.push({ kind, key, method });
  if (method === 'GET' && !key) { const prefix = url.searchParams.get('prefix') || ''; return Response.json({ blobs: [...blobs.keys()].filter(k => k.startsWith(kind + '/' + prefix)).map(k => ({ key: k.slice(kind.length + 1) })), directories: [] }); }
  const current = blobs.get(name);
  if (method === 'GET') return current ? new Response(current.value, { headers: { etag: current.etag, 'content-type': 'application/json' } }) : new Response(null, { status: 404 });
  if (method === 'DELETE') { blobs.delete(name); return new Response(null, { status: 204 }); }
  const headers = new Headers(init.headers);
  if ((headers.get('if-none-match') === '*' && current) || (headers.has('if-match') && headers.get('if-match') !== current?.etag)) return new Response(null, { status: 412 });
  const tag = String(++etag); blobs.set(name, { value: init.body, etag: tag }); return new Response(null, { headers: { etag: tag } });
};
const lib = path => import(pathToFileURL(resolve(repo, path)).href);
const { setEnvironmentContext } = await lib('node_modules/@netlify/blobs/dist/main.js');
setEnvironmentContext({ siteID: 'offline-site', token: 'offline-token', edgeURL: 'https://chat403-blobs.invalid', uncachedEdgeURL: 'https://chat403-blobs.invalid' });
const store = await lib('netlify/functions/lib/store.mjs'), { newClient } = await lib('netlify/functions/lib/config.mjs'), { configurationRevision } = await lib('netlify/functions/lib/setup.mjs'), { accessHash } = await lib('netlify/functions/lib/access.mjs');
const chat = (await lib('netlify/functions/chat.mjs')).default;

let serial = 0;
const turnId = () => createHash('sha256').update('turn-' + (++serial)).digest('hex').slice(0, 32);
function legacy(label, extra = {}) { const n = ++serial; return { ...newClient({ slug: `c403-${label}-${n}`, ownerKey: `owner-key-${n}`, owner: { name: 'QA Owner', email: `legacy-${n}@example.invalid`, phone: '+17135550140' }, business: { name: 'Offline Air', trade: 'HVAC', website: SHOP } }), status: 'live', ...extra }; }
function selfService(label, extra = {}) {
  const n = ++serial, c = newClient({ slug: `c403-${label}-${n}`, ownerKey: `internal-${n}`, owner: { name: 'QA Owner', email: `owner-${n}@example.invalid`, phone: '+17135550140' }, business: { name: 'Offline Air', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1 }, status: 'live', build: { status: 'built' }, services: ['AC repair'], channels: { web: { active: true } }, widget: { allowedOrigins: [SHOP] } });
  const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: 'live' };
  return Object.assign(c, extra);
}
async function session(email) { const token = createHash('sha256').update('session-' + (++serial)).digest('hex'); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', email, status: 'active', expiresAt: new Date(Date.now() + 3600000).toISOString() }); return token; }
function post(origin, body, token) { return new Request(SITE + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); }
const userTurn = (c, contact, id, extra = {}) => ({ client: c.slug, contact, turnId: id, messages: [{ role: 'user', content: 'Please save my AC service request for tomorrow.' }], page: '/', stream: true, ...extra });

// Each scenario builds its fixture and returns { request(recover), client, contact, line, error }.
const SCENARIOS = [
  { line: 63, name: 'GET sales allowance from a non-site origin', recoverable: false, async build() { return { request: () => new Request(SITE + '/api/chat?mode=sales', { headers: { Origin: EVIL } }), origin: EVIL, error: 'forbidden' }; } },
  { line: 87, name: 'self-service owner token from a non-workspace origin', async build() { const c = selfService('l87'); await store.saveClient(c); const token = await session(c.owner.email), id = turnId(); return { client: c, contact: 'visitor87', origin: EVIL, error: 'forbidden', request: recover => post(EVIL, userTurn(c, 'visitor87', id, recover ? { recoverTurn: true } : {}), token) }; } },
  { line: 90, name: 'self-service session for a different account', async build() { const c = selfService('l90'); await store.saveClient(c); const token = await session('someone-else@example.invalid'), id = turnId(); return { client: c, contact: 'visitor90', origin: SITE, error: 'forbidden', request: recover => post(SITE, userTurn(c, 'visitor90', id, recover ? { recoverTurn: true } : {}), token) }; } },
  { line: 104, name: 'legacy test channel without the owner key', async build() { const c = legacy('l104'); await store.saveClient(c); const id = turnId(); return { client: c, contact: 'visitor104', origin: SHOP, error: 'forbidden', request: recover => post(SHOP, userTurn(c, 'visitor104', id, { channel: 'test', ...(recover ? { recoverTurn: true } : {}) })) }; } },
  { line: 108, name: 'self-service website chat paused', async build() { const c = selfService('l108', { status: 'paused' }); await store.saveClient(c); const id = turnId(); return { client: c, contact: 'visitor108', origin: SHOP, error: 'paused', request: recover => post(SHOP, userTurn(c, 'visitor108', id, recover ? { recoverTurn: true } : {})) }; } },
  { line: 111, name: 'legacy widget on a non-allowed origin', async build() { const c = legacy('l111'); await store.saveClient(c); const id = turnId(); return { client: c, contact: 'visitor111', origin: EVIL, error: 'forbidden', request: recover => post(EVIL, userTurn(c, 'visitor111', id, recover ? { recoverTurn: true } : {})) }; } },
  { line: 112, name: 'legacy widget while the shop is paused', async build() { const c = legacy('l112', { status: 'paused' }); await store.saveClient(c); const id = turnId(); return { client: c, contact: 'visitor112', origin: SHOP, error: 'paused', request: recover => post(SHOP, userTurn(c, 'visitor112', id, recover ? { recoverTurn: true } : {})) }; } },
];

const checks = [], fixtures = {};
async function check(name, fn) { try { await fn(); checks.push({ name, pass: true }); } catch (error) { checks.push({ name, pass: false, error: error.message }); } }
const touchesConversation = rows => rows.filter(row => /^conversations?$|conversation/.test(row.kind));
const touchesAllowance = rows => rows.filter(row => /ai|budget|sales/i.test(row.kind) && row.kind !== 'access_sessions');

for (const backend of ['memory', 'blobs-double']) {
  process.env.MC_MEMORY_STORE = backend === 'memory' ? '1' : '0';
  for (const scenario of SCENARIOS) {
    const f = await scenario.build();
    for (const recover of scenario.recoverable === false ? [false] : [false, true]) {
      const kind = recover ? 'recoverTurn probe' : 'first send';
      await check(`${backend}: chat.mjs:${scenario.line} ${scenario.name} (${kind})`, async () => {
        const before = access.length, response = await chat(f.request(recover), { ip: '192.0.2.44' }), body = await response.json(), during = access.slice(before);
        if (scenario.line === 112 && backend === 'memory') fixtures[recover ? 'recover' : 'first'] = { status: response.status, body, accessControlAllowOrigin: response.headers.get('access-control-allow-origin') };
        assert.equal(response.status, 403, 'status');
        assert.equal(body.error, f.error, 'error code unchanged');
        assert.equal(typeof body.message, 'string', 'customer-facing message present'); assert.ok(body.message.length > 10);
        assert.equal(body.turnNotProcessed, !recover, recover ? 'a refused recovery probe never claims the original turn was unprocessed' : 'a refused first send is definitely not processed');
        assert.equal(response.headers.get('access-control-allow-origin'), f.origin, 'cross-origin widget can read the refusal');
        if (backend === 'blobs-double') { assert.deepEqual(touchesConversation(during), [], 'no conversation read or write before the 403'); assert.deepEqual(touchesAllowance(during), [], 'no AI/sales allowance access before the 403'); }
        if (f.client && backend === 'memory') { process.env.MC_MEMORY_STORE = '1'; const conv = await store.getConversation(f.client, 'web', f.contact); assert.equal(conv.messages.length, 0, 'conversation still empty'); }
      });
    }
  }
  // Control: an admitted legacy send does reach the conversation store, so the access log is meaningful.
  await check(`${backend}: control, an allowed legacy send is admitted and reads the conversation`, async () => {
    const c = legacy('control'); await store.saveClient(c);
    const before = access.length, response = await chat(post(SHOP, userTurn(c, 'visitor-control', turnId(), { stream: false })), { ip: '192.0.2.45' });
    assert.equal(response.status, 200, 'control admitted'); await response.text();
    if (backend === 'blobs-double') assert.ok(touchesConversation(access.slice(before)).length > 0, 'access log sees conversation traffic on an admitted turn');
  });
}
const failed = checks.filter(row => !row.pass);
const report = { repo, mode: 'Real chat.mjs handler; MC_MEMORY_STORE=1 and an in-process logged Blobs double; MC_FAKE_MODEL=1; no network', passed: checks.length - failed.length, failed: failed.length, otherRequests, checks, realBodies: fixtures };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
if (emit) writeFileSync(emit, JSON.stringify(fixtures, null, 2) + '\n');
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${row.name}${row.pass ? '' : '  -- ' + row.error.split('\n')[0]}`);
console.log(JSON.stringify({ repo, passed: report.passed, failed: report.failed, otherRequests }));
assert.equal(otherRequests, 0, 'no physical or provider request');
assert.equal(failed.length, 0, `${failed.length} check(s) failed`);
