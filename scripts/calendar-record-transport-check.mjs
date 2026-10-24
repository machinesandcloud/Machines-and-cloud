// Compare the proof actor with the installed provider SDK, with sockets denied.
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { getStore } from '@netlify/blobs';
import { createActor } from './calendar-live-actor.mjs';
import { TARGET, BLOB_ROUTES } from './calendar-live-guard.mjs';
import { fixture } from './calendar-live-fixture.mjs';

const deny = () => { throw Error('Physical network denied'); };
net.connect = net.createConnection = http.get = http.request = https.get = https.request = deny;
syncBuiltinESMExports();
globalThis.fetch = deny;
const version = 'fixture_record_transport_v1';
let sdkURL, actorURL, sdkCalls = 0;
const store = getStore({ name: 'calendar_execution_budgets', siteID: TARGET.siteId,
  token: 'synthetic-no-credential', consistency: 'strong', fetch: async url => {
    if (++sdkCalls === 1) {
      sdkURL = String(url);
      return Response.json({ url: 'https://fixture-records.s3.amazonaws.com/opaque-record' });
    }
    return new Response(null, { status: 404 });
  } });
assert.equal(await store.get('calendar-v1:' + version, { type: 'json' }), null);
assert.equal(sdkCalls, 2);
const actor = createActor({
  controller: { request: async input => {
    actorURL = input.url;
    return { data: { used: {}, policyDigest: 'synthetic' } };
  } },
  packet: { blobRoutes: BLOB_ROUTES, policyVersion: version },
  netlifyToken: 'synthetic-no-credential'
});
await actor.command({ action: 'budget' });
assert.equal(actorURL, sdkURL, 'Budget lookup must preserve the same record path as the installed SDK');
assert.equal(new URL(actorURL).pathname.endsWith('/calendar-v1:' + version), true);
assert.equal(new URL(actorURL).search, '');
for (const [signedHopFailure, expectedStatus] of [['status', 500], ['throw', null]]) {
  const f = await fixture({ signed: true, signedHopFailure });
  await f.signup();
  await assert.rejects(f.blob('clients', 'internal-calendar-1234'));
  const failed = f.rows.findLast(row => row.event === 'failed_or_uncertain');
  assert.equal(failed.httpStatus, expectedStatus);
  assert.equal(f.c.state().counters.blobs, 2);
  assert.equal(f.c.state().halted, true);
  await f.c.next('cleanup');
  await f.request('/api/client?c=internal-calendar-1234', { action: 'cancel', reason: 'Internal Calendar verification cleanup' });
  await f.request('/api/access', { action: 'sign_out' });
  assert.equal((await f.c.next('closed')).closed, true);
}
process.stdout.write(JSON.stringify({ passed: 3, failed: 0, physicalNetworkRequests: 0,
  provider: '@netlify/blobs installed SDK', recordPathMatches: true }) + '\n');
