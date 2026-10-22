// Targeted QA for exchange rate limiting and malformed expiry after the first accepted access run.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = 'http://127.0.0.1:8895';
let outbound = 0; globalThis.fetch = async () => { outbound++; throw new Error('QA networking blocked'); };
const store = await import('../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const handler = (await import('../netlify/functions/access.mjs')).default;
const previous = JSON.parse(readFileSync('scratchpad/customer-access-accepted.json'));
const hash = value => createHash('sha256').update(value).digest('hex');
const result = { at: new Date().toISOString(), priorEvidence: 'scratchpad/customer-access-accepted.json', checks: [], source: {} };
function check(name, pass, detail) { result.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); }
for (const path of Object.keys(previous.sourceAfter)) {
  const current = readFileSync(path, 'utf8'); let reversed = current;
  if (path === 'netlify/functions/access.mjs') reversed = reversed.replace('exchangeAccessToken(body.token, context?.ip || req.headers.get("x-nf-client-connection-ip"))', 'exchangeAccessToken(body.token)');
  if (path === 'netlify/functions/lib/access.mjs') reversed = reversed.replace('exchangeAccessToken(token, ip)', 'exchangeAccessToken(token)').replace('  await spendRate("exchange:" + accessHash(String(ip || "unknown")), 15, 600000);\n', '').replace(' || !Number.isFinite(Date.parse(row.expiresAt))', '');
  result.source[path] = { current: hash(current), previous: previous.sourceAfter[path], reconstructedPrevious: hash(reversed) };
  check('Recorded access source matches or exactly reverses hardening: ' + path, hash(current) === previous.sourceAfter[path] || hash(reversed) === previous.sourceAfter[path]);
}
async function call(body, ip) {
  const response = await handler(new Request(process.env.URL + '/api/access', { method: 'POST', headers: { origin: process.env.URL }, body: JSON.stringify(body) }), { ip });
  return { status: response.status, data: await response.json() };
}
try {
  const email = 'qa-hardening@example.test';
  await call({ action: 'request_link', email }, '192.0.2.140');
  const token = (await store.get('access_outbox', accessHash(email))).token;
  await store.atomicUpdate('access_tokens', accessHash(token), row => ({ value: { ...row, expiresAt: 'not-a-date' } }));
  check('Malformed expiry cannot authenticate', (await call({ action: 'exchange', token }, '192.0.2.141')).status === 410);
  check('Malformed-expiry rejection does not grant a session', (await store.list('access_sessions', '')).length === 0);
  const statuses = []; for (let n = 0; n < 16; n++) statuses.push((await call({ action: 'exchange', token: 'f'.repeat(64) }, '192.0.2.150')).status);
  check('Exchange attempts are capped at fifteen per IP bucket', statuses.slice(0, 15).every(status => status === 410) && statuses[15] === 429, statuses);
  const freshEmail = 'qa-hardening-fresh@example.test';
  await call({ action: 'request_link', email: freshEmail }, '192.0.2.151');
  const freshToken = (await store.get('access_outbox', accessHash(freshEmail))).token;
  check('Rate-limited valid proof remains unconsumed', (await call({ action: 'exchange', token: freshToken }, '192.0.2.150')).status === 429 && (await store.get('access_tokens', accessHash(freshToken))).status === 'pending');
  check('Separate IP can exchange valid proof without another mailbox message', (await call({ action: 'exchange', token: freshToken }, '192.0.2.152')).status === 200);
  await store.atomicUpdate('access_rate', 'exchange:' + accessHash('192.0.2.150'), row => ({ value: { ...row, until: Date.now() - 1 } }));
  check('Elapsed exchange bucket permits later recovery', (await call({ action: 'exchange', token: 'f'.repeat(64) }, '192.0.2.150')).status === 410);
  check('No external request was attempted', outbound === 0);
} catch (error) { result.fatal = String(error.stack || error); }
result.summary = { checks: result.checks.length, passed: result.checks.filter(row => row.pass).length, failed: result.checks.filter(row => !row.pass).length };
writeFileSync('scratchpad/customer-access-hardening-accepted.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ...result.summary, fatal: result.fatal || null }));
