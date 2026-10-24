// Actual access/manage handlers in memory with provider credentials removed.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
const output = process.argv[2] || 'scratchpad/signup-feedback-independent-contract.json';
if (!/^scratchpad\/signup-feedback-independent-contract(?:-[a-z0-9]+)?\.json$/.test(output)) throw Error('Use a fresh scoped receipt');
if (existsSync(output)) throw Error('Preserve previous evidence');
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|NETLIFY_|PUBLIC_SITE_URL$|SITE_ORIGINS$)/.test(key)) delete process.env[key];
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = 'http://127.0.0.1:8977'; process.env.ADMIN_EMAILS = 'qa-operator@example.test';
// send.mjs deliberately snapshots configuration at module import. Install this
// synthetic non-secret before import; no provider network is permitted below.
process.env.RESEND_API_KEY = 'qa-offline-no-secret';
const files = ['netlify/functions/access.mjs', 'netlify/functions/manage.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/operator.mjs', 'netlify/functions/lib/send.mjs', 'netlify/functions/lib/store.mjs'];
const hash = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, hash(readFileSync(file))]));
const report = { at: new Date().toISOString(), boundary: 'Actual local access/manage handlers; memory storage. Provider credentials removed; synthetic email protocol fixture only. No socket/network or real send.', before: hashes(), checks: [], protocolFixtureRequests: 0, nodeHTTPAttempts: 0 };
const deny = () => { report.nodeHTTPAttempts++; throw Error('QA forbids sockets'); };
net.connect = net.createConnection = http.get = http.request = https.get = https.request = deny; syncBuiltinESMExports();
let mailStatus = 200;
globalThis.fetch = async (input, options = {}) => {
  if (String(input) !== 'https://api.resend.com/emails' || options.method !== 'POST' || options.headers?.Authorization !== 'Bearer qa-offline-no-secret') return deny();
  report.protocolFixtureRequests++; return Response.json(mailStatus === 200 ? { id: 'qa-fixture-message' } : { error: 'fixture unavailable' }, { status: mailStatus });
};
const access = (await import('../netlify/functions/access.mjs')).default;
const manage = (await import('../netlify/functions/manage.mjs')).default;
const { get } = await import('../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
let sequence = 0;
async function call(kind, body, options = {}) {
  const response = await (kind === 'access' ? access : manage)(new Request(process.env.URL + '/api/' + kind, { method: 'POST', headers: { origin: options.origin || process.env.URL, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { ip: '192.0.2.' + (++sequence) });
  return { status: response.status, body: await response.json(), cacheControl: response.headers.get('cache-control') };
}
async function test(name, fn) { try { await fn(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message }); } }
try {
  await test('customer accepted local response explicitly distinguishes no email from provider send', async () => {
    const result = await call('access', { action: 'request_link', email: 'qa-customer@example.test', plan: 'starter' });
    assert.equal(result.status, 202); assert.equal(result.body.ok, true); assert.equal(result.body.delivery, 'test_outbox'); assert.match(result.body.message, /No email was sent/); assert.equal(result.cacheControl, 'no-store');
    const saved = await get('access_outbox', accessHash('qa-customer@example.test'));
    const link = new URL(saved.link); assert.equal(link.pathname, '/onboard.html'); assert.equal(link.searchParams.get('plan'), 'starter'); assert.equal(link.hash.slice(8), saved.token); assert.equal(Date.parse(saved.expiresAt) - Date.parse(saved.createdAt), 20 * 60000);
  });
  await test('operator local response uses explicit operator destination and no-email contract', async () => {
    const result = await call('manage', { action: 'request_link', email: 'qa-operator@example.test' });
    assert.equal(result.status, 202); assert.equal(result.body.delivery, 'test_outbox'); assert.match(result.body.message, /No email was sent/);
    const saved = await get('access_outbox', accessHash('qa-operator@example.test')); assert.equal(new URL(saved.link).pathname, '/admin.html');
  });
  await test('operator unauthorized-address accepted response is conditional, without send or account disclosure', async () => {
    const result = await call('manage', { action: 'request_link', email: 'qa-not-operator@example.test' });
    assert.equal(result.status, 202); assert.equal(result.body.ok, true); assert.equal(result.body.delivery, undefined); assert.match(result.body.message, /^If this email has operator access/); assert.equal(await get('access_outbox', accessHash('qa-not-operator@example.test')), null);
  });
  await test('actual invalid address returns400, not an accepted-email state', async () => {
    for (const kind of ['access', 'manage']) { const result = await call(kind, { action: 'request_link', email: 'no-at-sign' }); assert.equal(result.status, 400); assert.equal(result.body.error, 'invalid_email'); assert.notEqual(result.body.ok, true); }
  });
  await test('server remains the authoritative per-address rate limiter', async () => {
    const results = []; for (let i = 0; i < 4; i++) results.push(await call('access', { action: 'request_link', email: 'qa-rate@example.test' }));
    assert.deepEqual(results.map(row => row.status), [202, 202, 202, 429]); assert.equal(results.at(-1).body.error, 'rate_limited'); assert.match(results.at(-1).body.message, /wait/i);
  });
  await test('operator proof cannot exchange through customer endpoint and customer proof cannot exchange through operator endpoint', async () => {
    const customer = await get('access_outbox', accessHash('qa-customer@example.test')), operator = await get('access_outbox', accessHash('qa-operator@example.test'));
    assert.equal((await call('access', { action: 'exchange', token: operator.token })).status, 410);
    assert.equal((await call('manage', { action: 'exchange', token: customer.token })).status, 410);
    const correct = await call('access', { action: 'exchange', token: customer.token }); assert.equal(correct.status, 200); assert.equal(correct.body.email, 'qa-customer@example.test'); assert.match(correct.body.session, /^[a-f0-9]{64}$/);
    assert.equal((await call('access', { action: 'exchange', token: customer.token })).status, 410);
  });
  await test('cross-origin send is forbidden before sending anything', async () => {
    for (const kind of ['access', 'manage']) { const result = await call(kind, { action: 'request_link', email: 'qa-forbidden@example.test' }, { origin: 'https://attacker.invalid' }); assert.equal(result.status, 403); }
    assert.equal(await get('access_outbox', accessHash('qa-forbidden@example.test')), null);
  });
  await test('provider-accepted send fixture returns delivery=email, rather than a delivery-to-inbox receipt', async () => {
    process.env.MC_FAKE_MODEL = '0'; process.env.RESEND_API_KEY = 'qa-offline-no-secret'; process.env.FROM_EMAIL = 'QA <qa@example.test>';
    const result = await call('access', { action: 'request_link', email: 'qa-protocol@example.test' });
    assert.equal(result.status, 202); assert.equal(result.body.ok, true); assert.equal(result.body.delivery, 'email'); assert.doesNotMatch(result.body.message, /delivered|arrived/i); assert.equal(report.protocolFixtureRequests, 1);
  });
  await test('provider rejection fixture returns503 and no accepted success', async () => {
    mailStatus = 503;
    const result = await call('access', { action: 'request_link', email: 'qa-rejected@example.test' });
    assert.equal(result.status, 503); assert.equal(result.body.error, 'email_unavailable'); assert.notEqual(result.body.ok, true); assert.match(result.body.message, /could not send/i);
  });
} finally {
  report.after = hashes(); report.sourceStable = JSON.stringify(report.before) === JSON.stringify(report.after); report.pass = report.sourceStable && report.nodeHTTPAttempts === 0 && report.checks.every(row => row.pass); report.scriptSHA256 = hash(readFileSync('scratchpad/signup-feedback-independent-contract.mjs'));
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, pass: report.pass, checks: report.checks.length, failures: report.checks.filter(row => !row.pass), protocolFixtureRequests: report.protocolFixtureRequests, nodeHTTPAttempts: report.nodeHTTPAttempts }));
  if (!report.pass) process.exitCode = 1;
}
