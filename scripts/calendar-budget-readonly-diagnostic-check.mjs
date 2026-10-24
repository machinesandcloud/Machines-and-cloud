// Synthetic transport only; no native authentication, browser or network access.
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, readFile, rm, chmod, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore } from '@netlify/blobs';
import { diagnose, plan, TARGET, LOOKUP, SCOPE, LEDGER, validateApproval, validateSignedURL, exclusiveLedger } from './calendar-budget-readonly-diagnostic.mjs';

let physicalNetworkRequests = 0;
const deny = () => { physicalNetworkRequests++; throw Error('Physical network denied'); };
net.connect = net.createConnection = http.get = http.request = https.get = https.request = deny;
syncBuiltinESMExports();
globalThis.fetch = deny;
const NOW = Date.parse('2031-11-04T12:00:00Z'), TOKEN = 'synthetic-private-token-do-not-log';
const used = { oauthStart: 1, tokenExchange: 0, tokenRefresh: 0, calendarRead: 0, eventCreate: 0, eventUpdate: 0, eventDelete: 0, workerDispatch: 0, totalRequests: 0 };
const row = () => ({ version: 1, policyDigest: TARGET.policyDigest, used: { ...used }, census: { privateUnrelatedField: 'not-exported' } });
const signed = () => `https://fixture-records.s3.amazonaws.com/opaque-record?Expires=${NOW / 1000 + 300}&Signature=synthetic-signature`;
const approve = () => ({ version: 1, scope: SCOPE, phaseId: 'calendar-budget-diagnosis-20261024-v1', approved: true,
  approvalId: 'approval-synthetic-only', approvedAt: new Date(NOW - 1000).toISOString(), approvalExpiresAt: new Date(NOW + 300000).toISOString(),
  scriptSHA256: 'a'.repeat(64), target: { ...TARGET }, maxPhysicalGETs: 2, ledger: LEDGER });
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; };
async function fixture({ responses, appendFault = false, approvalFault = false } = {}) {
  const calls = [], events = [];
  let approvals = 0;
  const result = await diagnose({ token: TOKEN, now: () => NOW,
    stillApproved() { if (approvalFault && ++approvals === 2) throw Error('expired'); },
    async append(event) { if (appendFault) throw Error('write refused'); events.push(event); },
    async transport(url, options) {
      assert.equal(events.at(-1)?.type, 'reserved', 'Reservation must persist before transport');
      calls.push({ url, options });
      const response = responses?.[calls.length - 1];
      if (response instanceof Error) throw response;
      return response || (calls.length === 1 ? Response.json({ url: signed() }) : Response.json(row()));
    }
  });
  return { result, calls, events };
}

await check('Default plan is inert and exact', async () => {
  assert.equal(plan().executes, false);
  assert.equal(plan().maxPhysicalGETs, 2);
  assert.equal(plan().closedPhaseRemainsClosed, true);
  assert.equal(new URL(LOOKUP).pathname.endsWith('/calendar-v1:owned_calendar_busy_20261024_v1'), true);
  assert.equal(new URL(LOOKUP).search, '');
});
await check('Installed SDK generates the exact same raw-colon lookup path', async () => {
  const calls = [];
  const store = getStore({ name: TARGET.store, siteID: TARGET.siteId, consistency: 'strong', token: TOKEN,
    async fetch(url) { calls.push(String(url)); return calls.length === 1 ? Response.json({ url: signed() }) : new Response(null, { status: 404 }); } });
  assert.equal(await store.get(TARGET.key, { type: 'json' }), null);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], LOOKUP);
});
await check('Fresh exact approval is required before execution', async () => {
  validateApproval(approve(), 'a'.repeat(64), NOW);
  for (const edit of [p => p.approved = false, p => p.approvalExpiresAt = new Date(NOW).toISOString(),
    p => p.approvedAt = new Date(NOW + 1).toISOString(), p => p.scriptSHA256 = 'b'.repeat(64),
    p => p.maxPhysicalGETs = 3, p => p.target.key += '-other', p => p.ledger += '-new', p => p.extra = true]) {
    const packet = approve(); edit(packet);
    assert.throws(() => validateApproval(packet, 'a'.repeat(64), NOW));
  }
});
await check('Exactly two GETs with manual redirects and no second-hop credentials', async () => {
  const f = await fixture();
  assert.deepEqual(f.result, { status: 'found', policyDigest: TARGET.policyDigest, used, attempts: 2 });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.headers.authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(f.calls[1].options.headers, {});
  for (const call of f.calls) {
    assert.equal(call.options.method, 'GET'); assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.signal instanceof AbortSignal, true);
  }
  const output = JSON.stringify({ result: f.result, events: f.events });
  assert.equal(output.includes(TOKEN), false); assert.equal(output.includes('Signature'), false);
  assert.equal(output.includes('not-exported'), false); assert.equal(output.includes('opaque-record'), false);
});
for (const status of [301, 302, 307, 401, 403, 404, 429, 500]) {
  await check(`Lookup HTTP ${status} stops without retry or signed hop`, async () => {
    const f = await fixture({ responses: [new Response(null, { status, headers: { location: 'https://evil.invalid/' } })] });
    assert.equal(f.result.status, 'failed'); assert.equal(f.result.code, `lookup_http_${status}`);
    assert.equal(f.calls.length, 1); assert.equal(f.events.at(-1).type, 'closed');
  });
}
for (const status of [301, 307, 401, 403, 404, 429, 500]) {
  await check(`Signed record HTTP ${status} stops at two physical attempts`, async () => {
    const f = await fixture({ responses: [null, new Response(null, { status })] });
    assert.equal(f.result.code, `record_http_${status}`); assert.equal(f.calls.length, 2);
  });
}
await check('Unsafe, expired and ambiguous signed destinations are refused before hop', async () => {
  const cases = [signed().replace('https:', 'http:'), signed().replace('fixture-records.s3.amazonaws.com', 'netlify.com.evil.invalid'),
    signed().replace('https://', 'https://user:secret@'), signed() + '#fragment', signed().replace(':443', ':444'),
    signed().replace(`Expires=${NOW / 1000 + 300}`, `Expires=${NOW / 1000 - 1}`), signed() + '&Signature=another',
    'https://example.netlify.com/not-signed'];
  cases[4] = signed().replace('.com/', '.com:444/');
  for (const url of cases) {
    assert.throws(() => validateSignedURL(url, NOW));
    const f = await fixture({ responses: [Response.json({ url })] });
    assert.equal(f.result.status, 'failed'); assert.equal(f.calls.length, 1);
  }
});
await check('AWS and Google expiry forms are validated without credential inheritance', async () => {
  for (const prefix of ['X-Amz', 'X-Goog']) {
    const url = `https://storage.googleapis.com/record?${prefix}-Date=20311104T120000Z&${prefix}-Expires=300&${prefix}-Signature=${'a'.repeat(64)}`;
    assert.equal(validateSignedURL(url, NOW), url);
    assert.throws(() => validateSignedURL(url.replace('120000Z', '130000Z'), NOW));
    assert.throws(() => validateSignedURL(url.replace('=300', '=3601'), NOW));
  }
});
await check('Transport unknown is retained once and no automatic retry occurs', async () => {
  const f = await fixture({ responses: [new Error('raw secret body or URL must not escape')] });
  assert.deepEqual(f.result, { status: 'failed', code: 'transport_unknown', attempts: 1 });
  assert.equal(f.calls.length, 1); assert.equal(JSON.stringify(f.events).includes('raw secret'), false);
});
await check('Persistence failure prevents all transport', async () => {
  let calls = 0;
  await assert.rejects(diagnose({ token: TOKEN, now: () => NOW, stillApproved() {},
    async append() { throw Error('write refused'); }, async transport() { calls++; return Response.json({}); } }));
  assert.equal(calls, 0);
});
await check('Expired authority before the second attempt prevents the hop', async () => {
  const f = await fixture({ approvalFault: true });
  assert.equal(f.result.status, 'failed'); assert.equal(f.calls.length, 1);
});
await check('Malformed, oversized or non-exact JSON never yields budget claims', async () => {
  for (const response of [Response.json({ url: signed(), extra: true }), new Response('bad json'),
    new Response('x'.repeat(65537)), new Response('{}', { headers: { 'content-length': '65537' } })]) {
    const f = await fixture({ responses: [response] });
    assert.equal(f.result.status, 'failed'); assert.equal(f.calls.length, 1);
  }
  for (const edit of [r => r.policyDigest = 'b'.repeat(64), r => r.used.totalRequests = 1,
    r => r.used.tokenExchange = -1, r => r.used.extra = 0, r => r.used.oauthStart = 2]) {
    const record = row(); edit(record);
    const f = await fixture({ responses: [null, Response.json(record)] });
    assert.equal(f.result.code, 'budget_record_mismatch'); assert.equal(f.calls.length, 2);
  }
});
await check('Exclusive fsynced ledger cannot reopen after close or a partial reservation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mc-budget-diagnostic-offline-'));
  try {
    await chmod(directory, 0o700);
    const path = join(directory, 'ledger.jsonl'), ledger = await exclusiveLedger(path);
    await ledger.append({ type: 'reserved', attempt: 1 }); await ledger.close();
    assert.deepEqual(JSON.parse((await readFile(path, 'utf8')).trim()), { type: 'reserved', attempt: 1 });
    await assert.rejects(exclusiveLedger(path), error => error.code === 'EEXIST');
    const unsafe = join(directory, 'unsafe'); await mkdir(unsafe, { mode: 0o755 });
    await assert.rejects(exclusiveLedger(join(unsafe, 'ledger.jsonl')));
    const link = join(directory, 'link'); await symlink(directory, link);
    await assert.rejects(exclusiveLedger(join(link, 'ledger.jsonl')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

assert.equal(physicalNetworkRequests, 0);
process.stdout.write(JSON.stringify({ passed, failed: 0, physicalNetworkRequests,
  nativeCredentialReads: 0, liveExecutionPerformed: false, limitations: 'Synthetic HTTP responses and local persistence only; hosted failure attribution is unconfirmed.' }) + '\n');
