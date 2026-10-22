// Fresh, non-resettable local phase for the user-requested real interactive demos.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
assert.equal(process.env.PORT, '8894');
assert.equal(process.env.MC_LOCAL_NO_KEYS, '1');
assert.equal(process.env.MC_LOCAL_VOICE, '1');
assert.equal(process.env.MC_FAKE_MODEL, '0');
const path = new URL('./demo-outcome-network.json', import.meta.url);
let ledger;
if (process.env.MC_DEMO_PHASE_RESUME === '1') {
  ledger = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(ledger.phase, 'demo-owner-outcomes-2026-10-21');
  assert.equal(ledger.maxAnthropicRequests, 20);
  assert.equal(ledger.maxVapiCreates, 3);
  assert.ok(!ledger.closedAt, 'Closed provider phases cannot be resumed');
  assert.equal(ledger.blocked, 0);
  assert.ok(ledger.anthropicRequests <= 20 && ledger.vapiCreates <= 3);
  assert.equal(ledger.requests.filter(row => row.provider === 'anthropic').length, ledger.anthropicRequests);
  assert.equal(ledger.requests.filter(row => row.provider === 'vapi').length, ledger.vapiCreates);
  (ledger.continuations ||= []).push({ at: new Date().toISOString(), anthropicRequests: ledger.anthropicRequests, vapiCreates: ledger.vapiCreates, reason: 'Continue unchanged phase limits after correcting the private-key Vapi route and English owner summary. Local memory restarts; actual outbound spent counters are retained here.' });
} else {
  ledger = { phase: 'demo-owner-outcomes-2026-10-21', startedAt: new Date().toISOString(), maxAnthropicRequests: 20, maxVapiCreates: 3, anthropicRequests: 0, vapiCreates: 0, blocked: 0, requests: [], scope: 'Loopback memory; real typed AI and at most3 browser voice creates90seconds each. Existing provider keys only. No telephone, SMS, email, Calendar, shop data or other outbound API. Earlier phase ledgers remain unchanged.' };
  writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
const save = () => writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
save();
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = init?.method || input.method || 'GET';
  const anthropic = url.protocol === 'https:' && url.hostname === 'api.anthropic.com' && url.pathname === '/v1/messages' && method === 'POST';
  let body;
  try { body = JSON.parse(init?.body || '{}'); } catch {}
  const voice = url.protocol === 'https:' && url.hostname === 'api.vapi.ai' && url.pathname === '/call/web' && method === 'POST'
    && Object.keys(body || {}).sort().join(',') === 'assistant,roomDeleteOnUserLeaveEnabled'
    && body.roomDeleteOnUserLeaveEnabled === true
    && init?.headers?.Authorization === `Bearer ${process.env.VAPI_PUBLIC_KEY}`
    && init?.headers?.Origin === 'http://127.0.0.1:8894'
    && body.assistant?.maxDurationSeconds === 90 && body.assistant?.serverMessages?.length === 0;
  if ((!anthropic && !voice) || (anthropic && ledger.anthropicRequests >= 20) || (voice && ledger.vapiCreates >= 3)) { ledger.blocked++; save(); throw new Error('Demo outcome guard blocked unknown or exhausted request'); }
  const row = { at: new Date().toISOString(), provider: anthropic ? 'anthropic' : 'vapi', sequence: anthropic ? ++ledger.anthropicRequests : ++ledger.vapiCreates, method, host: url.hostname, path: url.pathname };
  ledger.requests.push(row); save();
  try {
    const response = await nativeFetch(input, init); row.status = response.status;
    if (!response.ok && voice) { const error = await response.clone().json().catch(() => ({})); row.providerMessage = String(error.message || error.error || 'Rejected').slice(0, 1500).replaceAll(process.env.VAPI_API_KEY || '<no-key>', '[redacted]'); }
    save(); return response;
  } catch (error) { row.failed = true; row.errorClass = error.name; save(); throw error; }
};
