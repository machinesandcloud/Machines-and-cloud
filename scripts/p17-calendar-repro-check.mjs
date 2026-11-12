// Proposal 17 repro checks (revision 2): 18 cases, all PASS with 17-*.patch. On base dfb0ae78 15 FAIL;
// C2b, R2e and R7 are safety controls that pass on base too (base never re-POSTs; they guard the new
// retry). Revision 2 adds R2e-R2h, R3b, R3c and R7 (see PROPOSALS.md, Revision 2).
// Offline only: fake Google transport (calendar-test-fixtures.mjs), memory store, dummy secrets.
// Copy into <checkout>/scripts/ and run: node scripts/p17-calendar-repro-check.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from './calendar-test-fixtures.mjs';
process.env.NODE_ENV = 'test';
const f = await fixture(), sha = s => createHash('sha256').update(s).digest('hex');
const actions = ['oauthStart','tokenExchange','tokenRefresh','calendarRead','eventCreate','eventUpdate','eventDelete','workerDispatch','totalRequests'];
const policy = { mode:'self_service',version:'customer_calendar_v1',expiresAt:new Date(Date.now()+60*86400000).toISOString(),googleClientIdHash:sha(process.env.GOOGLE_CLIENT_ID),limits:Object.fromEntries(actions.map(a=>[a,100000])),tenantLimits:Object.fromEntries(actions.map(a=>[a,10000])) };
Object.assign(process.env,{CALENDAR_SELF_SERVICE_ENABLED:'true',CALENDAR_SELF_SERVICE_POLICY_JSON:JSON.stringify(policy),CALENDAR_SELF_SERVICE_APPROVED_VERSION:policy.version});
const busy = await import('../netlify/functions/lib/calendar-busy.mjs');
const { buildConnectionJourney } = await import('../netlify/functions/lib/connection-journey.mjs');
const run = () => f.delivery.runCalendarDelivery({ limit: 10, discoveryLimit: 200, budgetMs: 12000 });
const results = [];
async function check(id, name, body) {
  try { await body(); results.push({ id, name, ok: true }); console.log('PASS', id, name); }
  catch (error) { results.push({ id, name, ok: false, error: String(error.message).split('\n')[0].slice(0, 300) }); console.log('FAIL', id, name, '::', String(error.message).split('\n')[0].slice(0, 300)); }
  f.intercept(null); f.setMode('normal'); process.env.CALENDAR_DELIVERY_ENABLED = 'true';
}
async function shop(slug, target = `${slug}@google.fixture.test`) {
  const item = await f.seed(slug); item.client.onboarding.desiredChannels = ['calendar']; await f.store.saveClient(item.client);
  f.setTarget(target); await f.connect(item.client, item.session); item.target = target; return item;
}
async function visit(item, id, extra = {}) {
  const c = item.client, row = { id, slug:c.slug, createdAt:new Date().toISOString(), customer_name:'Calendar Fixture', phone:'+17135550142', address:'12 Oak St', issue:'Plumbing visit', date:'2027-02-03', window:'8 to 12', status:'booked', delivery:{ tenantIdentity:f.connection.calendarTenantIdentity(c) }, ...extra };
  await f.store.put('bookings', `${c.slug}/${id}`, row);
  return { row, bookingKey:`${c.slug}/${id}`, key:f.delivery.calendarDeliveryKey(c, id), eventId:f.delivery.calendarEventId(c, id), eventKey:(target=item.target) => `${target}/${f.delivery.calendarEventId(c, id)}` };
}
const owned = id => [...f.events.keys()].filter(k => k.endsWith('/' + id));
const job = v => f.store.get('calendar_deliveries', v.key);
const posts = id => f.requests.filter(r => r.method === 'POST' && r.url.includes('/events') && r.body.includes(id)).length;
async function drain(v, rounds = 8, step = 3700000) { for (let i = 0; i < rounds; i++) { f.advance(step); await run(); const j = await job(v); if (['synced','cancelled','needs_attention'].includes(j.state)) return j; } return job(v); }
// A create whose request reached Google but whose commit becomes readable only `lagMs` later.
function lateCommit(v, lagMs, target) {
  const late = { at: null, body: null, done: false };
  const land = () => { if (late.at !== null && !late.done && Date.now() >= late.at) { late.done = true; f.events.set(v.eventKey(target), { ...late.body, status:'confirmed', etag:'"late"' }); } };
  f.intercept(call => { land(); if (late.at === null && call.method === 'POST' && call.body.includes(v.eventId)) { late.at = Date.now() + lagMs; late.body = JSON.parse(call.body); throw new Error('timeout after the request was sent (offline)'); } });
  return { late, land };
}
const calendarRow = async item => { const c = await f.store.get('clients', item.client.slug), view = await f.delivery.calendarDeliveryView(c); return { view, row: buildConnectionJourney(c, { calendar:{ connected:true, available:true, connectedAt:new Date().toISOString() }, calendarDelivery:view }).channels.find(r => r.id === 'calendar') }; };
const fresh = async item => { const s = { ...item.session, expiresAt:new Date(Date.now()+3600000).toISOString() }; await f.store.put('access_sessions', item.session.sessionHash, s); item.session = s; return s; };

await check('R1', 'Deadline reached before the create is sent is not recorded as uncertain; the visit syncs', async () => {
  const item = await shop('p17-r1'), v = await visit(item, 'visit-r1');
  let slowed = false;
  f.intercept(call => { if (!slowed && call.method === 'GET' && call.url.includes('timeMin=') && call.url.includes(encodeURIComponent(item.target))) { slowed = true; f.advance(12500); } });
  await run(); f.intercept(null);
  let j = await job(v);
  assert.equal(posts(v.eventId), 0, 'no POST was sent');
  assert.equal(j.createAttempt, undefined, `an unsent create must leave no marker (got ${j.createAttempt?.state})`);
  assert.notEqual(j.reasonCode, 'creation_unconfirmed');
  j = await drain(v);
  assert.equal(j.state, 'synced', `final ${j.state}/${j.reasonCode}`);
  assert.equal(posts(v.eventId), 1); assert.ok(f.events.has(v.eventKey()));
});

await check('R1b', 'Every pre-send rejection (gate closed, authority changed, deadline) is tagged as not sent; S1 window', async () => {
  const item = await shop('p17-r1b'), c = await f.store.get('clients', item.client.slug), v = await visit(item, 'visit-r1b');
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(item.target)}/events?sendUpdates=none`, init = { method:'POST', headers:{ Authorization:'Bearer dummy-access', 'Content-Type':'application/json' }, body:JSON.stringify({ id:v.eventId }) };
  const before = f.requests.length, seen = [];
  process.env.CALENDAR_DELIVERY_ENABLED = 'false';
  await assert.rejects(f.execution.guardedCalendarFetch(c, 'eventCreate', url, init, { targetId:item.target, bookingId:v.row.id }), e => { seen.push(e.code); return e.dispatched === false; });
  process.env.CALENDAR_DELIVERY_ENABLED = 'true';
  await assert.rejects(f.execution.guardedCalendarFetch(c, 'eventCreate', url, init, { targetId:item.target, bookingId:v.row.id, authorize: async () => { const e = new Error('superseded'); e.code = 'superseded'; throw e; } }), e => { seen.push(e.code); return e.dispatched === false; });
  await assert.rejects(f.execution.guardedCalendarFetch(c, 'eventCreate', url, init, { targetId:item.target, bookingId:v.row.id, deadline:Date.now() - 1 }), e => { seen.push(e.code); return e.dispatched === false; });
  assert.equal(f.requests.length, before, 'nothing was sent');
  assert.deepEqual(seen, ['calendar_gate_closed', 'superseded', 'calendar_deadline_reached']);
});

await check('R2', 'One network error on create no longer blocks the visit for good; retry is the same ID and creates one event', async () => {
  const item = await shop('p17-r2'), v = await visit(item, 'visit-r2');
  let dropped = false;
  f.intercept(call => { if (!dropped && call.method === 'POST' && call.body.includes(v.eventId)) { dropped = true; throw new Error('ECONNRESET (offline)'); } });
  await run(); f.intercept(null);
  assert.equal((await job(v)).createAttempt?.state, 'uncertain', 'a dispatched failure stays uncertain');
  const j = await drain(v);
  assert.equal(j.state, 'synced', `final ${j.state}/${j.reasonCode}`);
  assert.ok(f.events.has(v.eventKey())); assert.equal([...f.events.keys()].filter(k => k.endsWith(v.eventId)).length, 1);
});

await check('C2b', 'Safety control (passes on both): create committed but response lost, then a read returns 404 once: re-POST gets 409 and reconciles one event', async () => {
  const item = await shop('p17-r2b'), v = await visit(item, 'visit-r2b');
  f.setMode('lost_insert'); await run(); f.setMode('normal');
  assert.ok(f.events.has(v.eventKey()));
  let lag = false;
  f.intercept(call => { if (!lag && call.method === 'GET' && call.url.endsWith(v.eventId)) { lag = true; return f.json(404, {}); } });
  const j = await drain(v); f.intercept(null);
  assert.equal(j.state, 'synced', `final ${j.state}/${j.reasonCode}`);
  assert.equal([...f.events.keys()].filter(k => k.endsWith(v.eventId)).length, 1);
  assert.ok(posts(v.eventId) <= 2);
});

await check('R2c', 'Owner edit clears a historical stuck create (needs_attention creation_unconfirmed)', async () => {
  const item = await shop('p17-r2c'), v = await visit(item, 'visit-r2c');
  f.intercept(call => { if (call.method === 'POST' && call.body.includes(v.eventId)) throw new Error('ECONNRESET (offline)'); });
  await run(); f.intercept(null);
  // Historical state as produced by the base code: five failed attempts, permanent marker.
  const stuck = await job(v); await f.store.put('calendar_deliveries', v.key, { ...stuck, state:'needs_attention', reasonCode:'creation_unconfirmed', attempts:5, claim:null });
  const edited = { ...v.row, notes:'Gate code 1234' }; await f.store.put('bookings', v.bookingKey, edited);
  await f.delivery.queueCalendarBooking(item.client, edited);
  const j = await drain(v);
  assert.equal(j.state, 'synced', `final ${j.state}/${j.reasonCode}`);
  assert.match(f.events.get(v.eventKey()).description, /Gate code 1234/);
});

await check('R2d', 'Cancelling a visit whose only create failed in transit ends as cancelled, with no event', async () => {
  const item = await shop('p17-r2d'), v = await visit(item, 'visit-r2d');
  f.intercept(call => { if (call.method === 'POST' && call.body.includes(v.eventId)) throw new Error('ECONNRESET (offline)'); });
  await run(); f.intercept(null);
  const cancelled = { ...v.row, status:'cancelled' }; await f.store.put('bookings', v.bookingKey, cancelled);
  await f.delivery.queueCalendarBooking(item.client, cancelled);
  const before = posts(v.eventId), j = await drain(v);
  assert.equal(j.state, 'cancelled', `final ${j.state}/${j.reasonCode}`);
  assert.equal(posts(v.eventId), before, 'cancel never creates'); assert.equal(f.events.has(v.eventKey()), false);
});

await check('R2e', 'Cancel just after a create that commits 150 s late: no absence is counted before the create settles (M3)', async () => {
  const item = await shop('p17-r2e'), v = await visit(item, 'visit-r2e');
  const { late, land } = lateCommit(v, 150000);
  await run(); assert.equal((await job(v)).createAttempt?.state, 'uncertain');
  f.advance(5000); const cancelled = { ...v.row, status:'cancelled' }; await f.store.put('bookings', v.bookingKey, cancelled); await f.delivery.queueCalendarBooking(item.client, cancelled);
  await run(); assert.equal((await job(v)).createAttempt.absentAt, undefined, 'a 5 s old create may still be in flight: its 404 proves nothing');
  f.advance(125000); await run(); f.advance(125000); await run(); for (let i = 0; i < 4; i++) { f.advance(600000); await run(); }
  land(); f.intercept(null);
  assert.ok(late.done, 'precondition: the late commit landed');
  const j = await job(v); assert.equal(j.state, 'cancelled', `final ${j.state}/${j.reasonCode}`);
  assert.equal(f.events.has(v.eventKey()), false, 'the late-committed event of a cancelled visit must be removed, not orphaned');
});

await check('R2f', 'Cancel path needs two absent reads at least 2 minutes apart (M5)', async () => {
  const item = await shop('p17-r2f'), v = await visit(item, 'visit-r2f');
  const { late, land } = lateCommit(v, 200000);
  await run();
  f.advance(61000); const cancelled = { ...v.row, status:'cancelled' }; await f.store.put('bookings', v.bookingKey, cancelled); await f.delivery.queueCalendarBooking(item.client, cancelled);
  await run(); assert.ok((await job(v)).createAttempt.absentAt, 'first absent read recorded');
  f.advance(64000); await run();
  assert.notEqual((await job(v)).state, 'cancelled', 'a second 404 only 64 s later must not end the cancellation');
  for (let i = 0; i < 4; i++) { f.advance(600000); await run(); }
  land(); f.intercept(null); assert.ok(late.done);
  const j = await job(v); assert.equal(j.state, 'cancelled', `final ${j.state}/${j.reasonCode}`); assert.equal(f.events.has(v.eventKey()), false);
});

await check('R2g', 'A re-POST stopped before sending restores the earlier dispatched marker and its absence reads (M10)', async () => {
  const item = await shop('p17-r2g'), v = await visit(item, 'visit-r2g');
  f.intercept(call => { if (call.method === 'POST' && call.body.includes(v.eventId)) throw new Error('ECONNRESET (offline)'); });
  await run(); f.intercept(null);
  f.advance(61000); await run(); const first = (await job(v)).createAttempt; assert.ok(first.absentAt);
  f.advance(301000);
  let slowed = false; f.intercept(call => { if (!slowed && call.method === 'GET' && call.url.includes('timeMin=')) { slowed = true; f.advance(12500); } });
  const before = posts(v.eventId); await run(); f.intercept(null);
  assert.ok(slowed); assert.equal(posts(v.eventId), before, 'the re-POST was stopped before sending');
  const kept = (await job(v)).createAttempt;
  assert.equal(kept?.token, first.token, 'the earlier dispatched create marker is restored'); assert.equal(kept.state, 'uncertain'); assert.equal(kept.absentAt, first.absentAt);
  const j = await drain(v); assert.equal(j.state, 'synced', `final ${j.state}/${j.reasonCode}`); assert.equal(owned(v.eventId).length, 1);
});

await check('R2h', 'An unconfirmed create older than a week is not re-sent automatically; the owner is told, and an owner edit sends it again', async () => {
  const item = await shop('p17-r2h'), v = await visit(item, 'visit-r2h', { date:'2027-04-01' });
  f.intercept(call => { if (call.method === 'POST' && call.body.includes(v.eventId)) throw new Error('ECONNRESET (offline)'); });
  await run(); f.intercept(null);
  const before = posts(v.eventId); f.advance(8 * 86400000); await run(); f.advance(3700000); await run();
  let j = await job(v); assert.equal(posts(v.eventId), before, 'no automatic re-POST after a week');
  assert.equal(j.state, 'needs_attention'); assert.equal(j.reasonCode, 'creation_unconfirmed_expired'); assert.match(j.detail, /edit it in Schedule/);
  const { view, row } = await calendarRow(item);
  assert.equal(view.verification.ownerCheckNeeded, 1); assert.equal(view.verification.currentAttention, false);
  assert.equal(row.responsibility, 'customer'); assert.match(row.nextStep, /edit it in Schedule/);
  const edited = { ...v.row, notes:'Owner re-sent' }; await f.store.put('bookings', v.bookingKey, edited); await f.delivery.queueCalendarBooking(item.client, edited);
  j = await drain(v); assert.equal(j.state, 'synced', `final ${j.state}/${j.reasonCode}`); assert.equal(owned(v.eventId).length, 1); assert.match(f.events.get(v.eventKey()).description, /Owner re-sent/);
});

await check('R7', 'Already seen, then deleted in Google with no tombstone left: an edit never re-creates it, with or without a receipt (M11 guard)', async () => {
  for (const keepReceipt of [true, false]) {
    const item = await shop('p17-r7' + (keepReceipt ? 'a' : 'b')), v = await visit(item, 'visit-r7');
    await run(); let j = await job(v); assert.equal(j.state, 'synced'); assert.equal(j.createAttempt.state, 'observed');
    if (!keepReceipt) { const { receipt, ...rest } = j; await f.store.put('calendar_deliveries', v.key, rest); }
    f.events.delete(v.eventKey()); // owner deleted; Google's record already purged, so the GET is 404
    const edited = { ...v.row, notes:'Edited after the owner deleted it' }; await f.store.put('bookings', v.bookingKey, edited); await f.delivery.queueCalendarBooking(item.client, edited);
    const before = posts(v.eventId); j = await drain(v);
    assert.equal(posts(v.eventId), before, `no re-POST (receipt ${keepReceipt})`); assert.equal(f.events.has(v.eventKey()), false);
    assert.equal(j.state, 'needs_attention'); assert.equal(j.reasonCode, 'remote_event_deleted');
  }
});

await check('R3', 'After a switch to another Google account, undelivered changes for old-calendar events are counted and explained', async () => {
  const item = await shop('p17-r3', 'owner-old@google.fixture.test'), v = await visit(item, 'visit-r3');
  await run(); assert.equal((await job(v)).state, 'synced');
  f.setTarget('owner-new@google.fixture.test'); await f.connect(item.client, await fresh(item));
  const cancelled = { ...v.row, status:'cancelled' }; await f.store.put('bookings', v.bookingKey, cancelled);
  await f.delivery.queueCalendarBooking(item.client, cancelled);
  for (let i = 0; i < 3; i++) { f.advance(3700000); await run(); }
  const w = await visit({ ...item, target:'owner-new@google.fixture.test' }, 'visit-r3-new', { date:'2027-02-04' }); f.advance(3700000); await run();
  assert.equal((await job(w)).state, 'synced');
  const view = await f.delivery.calendarDeliveryView(item.client);
  assert.equal(f.events.get(v.eventKey('owner-old@google.fixture.test'))?.status, 'confirmed', 'old event is (still) live: precondition');
  assert.equal(view.verification.attention, true, 'owner must see attention');
  assert.equal(view.verification.undeliveredElsewhere, 1);
  assert.match((await job(v)).detail, /yourself/);
  // D2: the owner status names the same actor as the job detail.
  const { row } = await calendarRow(item);
  assert.equal(row.status, 'needs_attention'); assert.equal(row.responsibility, 'customer', 'the job detail tells the owner to act');
  assert.match(row.nextStep, /yourself/); assert.match(row.detail, /1 saved visit still has an event on the Google calendar you connected before/);
});

await check('R3b', 'Account-switch attention clears once the affected visit date has passed (D2)', async () => {
  const item = await shop('p17-r3b', 'r3b-old@google.fixture.test'), v = await visit(item, 'visit-r3b', { date:new Date(Date.now()+3*86400000).toISOString().slice(0,10) });
  await run(); assert.equal((await job(v)).state, 'synced');
  f.setTarget('r3b-new@google.fixture.test'); await f.connect(item.client, await fresh(item)); f.advance(301000); await run();
  assert.equal((await job(v)).reasonCode, 'calendar_target_changed');
  let { view } = await calendarRow(item); assert.equal(view.verification.undeliveredElsewhere, 1); assert.equal(view.verification.attention, true);
  f.advance(4*86400000);
  const w = await visit({ ...item, target:'r3b-new@google.fixture.test' }, 'visit-r3b-new', { date:new Date(Date.now()+2*86400000).toISOString().slice(0,10) }); f.advance(301000); await run();
  assert.equal((await job(w)).state, 'synced');
  const now = await calendarRow(item); view = now.view;
  assert.equal(view.verification.undeliveredElsewhere, 0); assert.equal(view.verification.attention, false, 'a passed visit no longer needs an owner fix');
  assert.equal(now.row.status, 'active');
});

await check('R3c', 'Control: platform-side attention on the current calendar stays the platform\'s to act on', async () => {
  const item = await shop('p17-r3c'), v = await visit(item, 'visit-r3c');
  f.intercept(call => { if (call.method === 'POST' && call.body.includes(v.eventId)) return f.json(500, {}); });
  await run(); f.intercept(null);
  const { view, row } = await calendarRow(item);
  assert.equal(view.verification.currentAttention, true); assert.equal(row.status, 'needs_attention'); assert.equal(row.responsibility, 'platform');
});

await check('R4', 'Reconnect to the same calendar spends no Google requests on a past synced visit', async () => {
  const item = await shop('p17-r4'), near = new Date(Date.now()+2*86400000).toISOString().slice(0,10), v = await visit(item, 'visit-r4', { date:near });
  await run(); assert.equal((await job(v)).state, 'synced');
  f.advance(5*86400000); const s = await fresh(item); await f.connection.disconnectCalendar(item.client, s); await f.connect(item.client, s);
  const mark = f.requests.length; for (let i = 0; i < 3; i++) { f.advance(301000); await run(); }
  const spent = f.requests.slice(mark).filter(r => r.url.includes('/events/' + v.eventId) || r.url.includes('timeMin=') && r.url.includes(encodeURIComponent(item.target)));
  assert.equal(spent.length, 0, `${spent.length} event/busy requests on a past visit: ${spent.map(r => r.method + ' ' + r.url.slice(0, 120)).join(' | ')}`);
});

await check('R4b', 'Reconnect with no change to the visit keeps the owner\'s own edits in Google', async () => {
  const item = await shop('p17-r4b'), v = await visit(item, 'visit-r4b', { date:'2027-03-01' });
  await run(); assert.equal((await job(v)).state, 'synced');
  const ev = f.events.get(v.eventKey()); f.events.set(v.eventKey(), { ...ev, description:'Owner private notes typed in Google', etag:'"owner-edit"' });
  const s = await fresh(item); await f.connection.disconnectCalendar(item.client, s); await f.connect(item.client, s);
  f.advance(301000); await run(); f.advance(301000); await run();
  assert.equal(f.events.get(v.eventKey()).description, 'Owner private notes typed in Google');
  const j = await job(v); assert.equal(j.state, 'synced'); assert.equal((await f.delivery.calendarDeliveryView(item.client)).verification.delivered, true);
});

await check('R5', 'DST spring-forward wall times resolve to the first instant after the gap and keep order', async () => {
  const at = m => busy.calendarWallInstant('2027-03-14', m);
  assert.equal(new Date(at(120)).toISOString(), '2027-03-14T08:00:00.000Z');
  assert.equal(new Date(at(150)).toISOString(), '2027-03-14T08:00:00.000Z');
  assert.equal(new Date(at(180)).toISOString(), '2027-03-14T08:00:00.000Z');
  assert.equal(new Date(at(90)).toISOString(), '2027-03-14T07:30:00.000Z');
  assert.equal(new Date(busy.calendarWallInstant('2027-11-07', 90)).toISOString(), '2027-11-07T06:30:00.000Z');
  const i = busy.calendarWindowInterval('2027-03-14', '1 am to 4 am'); assert.ok(i.end > i.start);
  assert.equal(busy.calendarWindowInterval('2027-03-14', '1 am to 3 am').end, Date.parse('2027-03-14T08:00:00Z'));
  assert.throws(() => busy.calendarWindowInterval('2027-03-14', '2 am to 3 am'), 'a window wholly inside the gap still fails closed');
  assert.throws(() => busy.calendarWallInstant('2027-03-14', 120, 'Not/AZone'));
});

await check('R6', 'A visit cancelled while disconnected is flagged, then deleted after reconnecting the same account', async () => {
  const item = await shop('p17-r6'), v = await visit(item, 'visit-r6');
  await run(); assert.equal((await job(v)).state, 'synced');
  const s = await fresh(item); await f.connection.disconnectCalendar(item.client, s);
  const cancelled = { ...v.row, status:'cancelled' }; await f.store.put('bookings', v.bookingKey, cancelled);
  await f.delivery.queueCalendarBooking(item.client, cancelled); f.advance(3700000); await run();
  assert.equal((await job(v)).state, 'waiting_connection');
  const view = await f.delivery.calendarDeliveryView(item.client);
  assert.equal(view.verification.attention, true, 'waiting cancellation must be visible');
  await f.connect(item.client, await fresh(item));
  const j = await drain(v); assert.equal(j.state, 'cancelled'); assert.equal(f.events.has(v.eventKey()), false);
});

const failed = results.filter(r => !r.ok);
console.log(JSON.stringify({ check:'p17-calendar-repro', passed:results.length - failed.length, failed:failed.length, results }, null, 1));
process.exitCode = failed.length ? 1 : 0;
