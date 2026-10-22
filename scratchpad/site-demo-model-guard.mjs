// One new, separately capped model phase. Refuses to overwrite or reset a spent ledger.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const path = new URL('./site-demo-model-network.json', import.meta.url);
assert.equal(process.env.MC_LOCAL_NO_KEYS, '1');
assert.equal(process.env.MC_FAKE_MODEL, '0');
assert.equal(process.env.PORT, '8894');
const ledger = { phase: 'homepage-live-demo-2026-10-21', startedAt: new Date().toISOString(), maxAnthropicRequests: 16, anthropicRequests: 0, blocked: 0, requests: [], scope: 'New feature phase only. Local in-memory server; only Anthropic inference allowed. Earlier exhausted model ledgers are separate and unchanged.' };
writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
function save() { writeFileSync(path, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 }); }
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = init?.method || input.method || 'GET';
  if (url.protocol !== 'https:' || url.hostname !== 'api.anthropic.com' || url.pathname !== '/v1/messages' || method !== 'POST' || ledger.anthropicRequests >= ledger.maxAnthropicRequests) {
    ledger.blocked++; save(); throw new Error('Demo model guard blocked an unauthorized or over-budget request');
  }
  const row = { sequence: ++ledger.anthropicRequests, at: new Date().toISOString(), method, host: url.hostname, path: url.pathname };
  ledger.requests.push(row); save();
  try { const response = await nativeFetch(input, init); row.status = response.status; save(); return response; }
  catch (error) { row.failed = true; row.errorClass = error.name; save(); throw error; }
};
