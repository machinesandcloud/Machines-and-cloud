// Root's separate offline review. No real packet, credential, browser or HTTP use.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { diagnose, TARGET, LOOKUP } from '../scripts/calendar-budget-readonly-diagnostic.mjs';
const deny = () => { throw Error('Physical effects denied'); };
net.connect = net.createConnection = http.get = http.request = https.get = https.request = globalThis.fetch = deny;
syncBuiltinESMExports();
const file = 'scripts/calendar-budget-readonly-diagnostic.mjs';
const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
const before = hash(), now = Date.parse('2026-10-24T10:00:00Z');
const signed = 'https://fixture.s3.amazonaws.com/exact?X-Amz-Date=20261024T100000Z&X-Amz-Expires=60&X-Amz-Signature=' + 'f'.repeat(64);
const row = () => ({ version: 1, policyDigest: TARGET.policyDigest,
  used: { oauthStart: 1, tokenExchange: 0, tokenRefresh: 0, calendarRead: 0, eventCreate: 0, eventUpdate: 0, eventDelete: 0, workerDispatch: 0, totalRequests: 0 } });
const checks = [];
async function run(name, mode, expected, maxCalls) {
  const ledger = [], calls = []; let admissions = 0;
  const result = await diagnose({ token: 'synthetic-do-not-log', now: () => now,
    append: async r => ledger.push(structuredClone(r)),
    stillApproved: () => { if (mode === 'expiry' && ++admissions === 2) throw Error('Expired'); },
    transport: async (url, options) => {
      assert.equal(ledger.at(-1).type, 'reserved'); calls.push({ url, headers: options.headers });
      assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
      if (calls.length === 1) {
        assert.equal(url, LOOKUP); assert.match(url, /calendar-v1:owned_calendar/);
        assert.equal(options.headers.authorization, 'Bearer synthetic-do-not-log');
        return mode === 'lookup500' ? Response.json({}, { status: 500 }) : Response.json({ url: signed });
      }
      assert.equal(url, signed); assert.deepEqual(options.headers, {});
      if (mode === 'unknown') throw Error('Signed transport unknown');
      const data = row();
      if (mode === 'wrongRecord') data.policyDigest = 'a'.repeat(64);
      data.refresh = 'synthetic-sensitive-extra';
      return Response.json(data);
    } });
  assert.equal(result.status, expected); assert.equal(calls.length, maxCalls);
  assert.equal(ledger.filter(r => r.type === 'reserved').length, maxCalls);
  assert.equal(result.attempts, maxCalls); assert.equal(ledger.at(-1).type, 'closed');
  const rendered = JSON.stringify({ result, ledger });
  for (const value of ['synthetic-do-not-log', 'synthetic-sensitive-extra', signed]) assert.equal(rendered.includes(value), false);
  checks.push({ name, passed: true, attempts: maxCalls });
}
await run('A known failed lookup stops before signed storage', 'lookup500', 'failed', 1);
await run('Unknown signed transport consumes two attempts without retry', 'unknown', 'failed', 2);
await run('Wrong policy record fails after the bounded read', 'wrongRecord', 'failed', 2);
await run('Expiry before the signed hop prevents a second effect', 'expiry', 'failed', 1);
await run('Correct record produces only whitelisted counters and digest', 'success', 'found', 2);
assert.equal(hash(), before);
const report = { executor: 'Root independent offline review', passed: checks.length, checks,
  scriptSHA256: before, sourceStable: true, physicalNetworkRequests: 0, nativeCredentialReads: 0 };
writeFileSync('scratchpad/calendar-budget-diagnostic-root-acceptance.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ passed: checks.length, physicalNetworkRequests: 0, sourceStable: true }));
