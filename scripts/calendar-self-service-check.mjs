// Real OAuth/worker/storage paths with local Google protocol fixtures only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture, report } from './calendar-test-fixtures.mjs';
process.env.NODE_ENV = 'test';
const f = await fixture(), checks = [], sha = s => createHash('sha256').update(s).digest('hex');
const self = await import('../netlify/functions/lib/calendar-self-service.mjs');
const managed = await import('../netlify/functions/lib/managed-delivery.mjs');
const actions = ['oauthStart','tokenExchange','tokenRefresh','calendarRead','eventCreate','eventUpdate','eventDelete','workerDispatch','totalRequests'];
let policy = { mode:'self_service',version:'customer_calendar_v1',expiresAt:new Date(Date.now()+30*86400000).toISOString(),googleClientIdHash:sha(process.env.GOOGLE_CLIENT_ID),limits:Object.fromEntries(actions.map(a=>[a,10000])),tenantLimits:Object.fromEntries(actions.map(a=>[a,1000])) };
const publish = () => Object.assign(process.env,{CALENDAR_SELF_SERVICE_ENABLED:'true',CALENDAR_SELF_SERVICE_POLICY_JSON:JSON.stringify(policy),CALENDAR_SELF_SERVICE_APPROVED_VERSION:policy.version});
publish();
const check = async (name, run) => { await run(); checks.push(name); };
async function shop(slug) { const item = await f.seed(slug); item.client.onboarding.desiredChannels=['calendar']; await f.store.saveClient(item.client); f.setTarget(`${slug}@google.fixture.test`); await f.connect(item.client,item.session); return item; }
async function booking(c,id,extra={}) { const row={id,slug:c.slug,createdAt:new Date().toISOString(),customer_name:'Calendar Fixture',phone:'+17135550142',address:'12 Oak St',issue:'Plumbing visit',date:'2027-02-03',window:'8 to 12',status:'booked',delivery:{tenantIdentity:f.connection.calendarTenantIdentity(c)},...extra}; await f.store.put('bookings',`${c.slug}/${id}`,row); return row; }
const all=()=>f.delivery.runCalendarDelivery({limit:10,discoveryLimit:200,budgetMs:12000});
let one,two,first;
await check('Two owners connect their own Google primary calendars without named tenant or target maps',async()=>{
  one=await shop('calendar-self-one');two=await shop('calendar-self-two');
  assert.equal((await f.connection.calendarConnectionView(one.client)).connected,true);
  assert.equal((await f.connection.calendarConnectionView(two.client)).connected,true);
  assert.notEqual((await f.connection.getCalendarConnection(one.client.slug)).targetId,(await f.connection.getCalendarConnection(two.client.slug)).targetId);
});
await check('Ordinary new booking IDs sync for both shops; repeated discovery does not duplicate events',async()=>{
  first=await booking(one.client,'ordinary-new-request-73');await booking(two.client,'another-new-visit-91');
  await all();const before=f.events.size;await all();assert.equal(before,2);assert.equal(f.events.size,2);
  for(const item of [one,two]){const ids=await f.store.list('calendar_deliveries',item.client.slug+'/');assert.equal(ids.length,1);assert.equal((await f.store.get('calendar_deliveries',ids[0])).state,'synced');}
});
await check('Rescheduling updates the same event and cancellation deletes only that owner event',async()=>{
  const id=f.delivery.calendarEventId(one.client,first.id),key=`calendar-self-one@google.fixture.test/${id}`;
  await f.store.put('bookings',`${one.client.slug}/${first.id}`,{...first,date:'2027-02-04'});await all();assert.match(f.events.get(key).start.dateTime,/2027-02-04/);
  await f.store.put('bookings',`${one.client.slug}/${first.id}`,{...first,status:'cancelled'});await all();assert.equal(f.events.has(key),false);assert.equal(f.events.size,1);
});
await check('Wrong calendar targets, conflicting provenance and setup samples cannot reserve delivery',async()=>{
  const sample=await booking(one.client,'website-sample',{websiteSetupCheck:{checkId:'sample'}}),simulation=await booking(one.client,'practice-sample',{simulation:true});
  assert.equal(await f.delivery.queueCalendarBooking(one.client,sample),null);assert.equal(await f.delivery.queueCalendarBooking(one.client,simulation),null);
  const foreign=await booking(one.client,'foreign-source',{tenantIdentity:'f'.repeat(64)});
  for(const row of [sample,simulation,foreign])assert.equal(await f.execution.calendarExecutionAvailable(one.client,{bookingId:row.id}),false);
  await assert.rejects(f.execution.reserveCalendarExecution(one.client,'eventCreate',{targetId:'other@google.fixture.test',bookingId:first.id}),e=>e.code==='calendar_target_changed');
});
await check('Website samples never enqueue owner email or SMS, and retained sample jobs are stopped at send time',async()=>{
  const sample=await booking(one.client,'managed-sample',{websiteSetupCheck:{checkId:'sample'}});
  const before=(await f.store.list('managed_deliveries','')).length;await managed.queueManagedRecord(one.client,sample);assert.equal((await f.store.list('managed_deliveries','')).length,before);
  let sends=0;const engine=managed.createManagedDeliveryEngine({gate:()=>true,provider:{send:async()=>{sends++;throw Error('must not send');}}});
  // A saved source is required before enqueue; seed a valid ordinary lead for a
  // second job, then change only its setup marker to exercise the retained path.
  const lead={...sample,id:'retained-real-lead'};delete lead.websiteSetupCheck;await f.store.put('leads',`${one.client.slug}/${lead.id}`,lead);await managed.queueManagedRecord(one.client,lead,'leads');
  const actual=(await Promise.all((await f.store.list('managed_deliveries',one.client.slug+'/')).map(k=>f.store.get('managed_deliveries',k)))).find(j=>j.source?.id===lead.id);
  assert.ok(actual);await f.store.put('leads',`${one.client.slug}/${lead.id}`,{...lead,websiteSetupCheck:{checkId:'later-tag'}});
  assert.equal((await engine.run(actual.id)).state,'superseded');assert.equal(sends,0);
});
await check('Normal signout does not revoke a still-connected background grant; explicit disconnect stops delivery',async()=>{
  await f.store.put('access_sessions',two.session.sessionHash,{...two.session,status:'revoked'});
  await booking(two.client,'after-signout');await all();assert.equal((await f.store.get('calendar_deliveries',f.delivery.calendarDeliveryKey(two.client,'after-signout'))).state,'synced');
  await f.store.put('access_sessions',two.session.sessionHash,two.session);await f.connection.disconnectCalendar(two.client,two.session);
  const calls=f.requests.length;await f.execution.calendarExecutionAvailable(two.client,{targetId:'calendar-self-two@google.fixture.test'}).then(v=>assert.equal(v,false));assert.equal(f.requests.length,calls);
});
await check('Per-tenant daily CAS caps allow only the remaining physical attempts',async()=>{
  f.advance(86400000);policy={...policy,tenantLimits:{...policy.tenantLimits,tokenExchange:3,totalRequests:3}};publish();
  const rs=await Promise.allSettled(Array.from({length:10},()=>f.execution.reserveCalendarExecution(one.client,'tokenExchange')));assert.equal(rs.filter(r=>r.status==='fulfilled').length,3);
  const keys=self.selfServiceCalendarBudgetKeys(one.client),row=await f.store.get('calendar_execution_budgets',keys.tenant);assert.equal(row.used.tokenExchange,3);assert.equal(row.used.totalRequests,3);
  const other=await f.execution.reserveCalendarExecution(two.client,'tokenExchange');assert.equal(other.mode,'self_service');
});
await check('Policy version edits cannot replenish daily capacity and stale receipts are refused',async()=>{
  const keys=self.selfServiceCalendarBudgetKeys(one.client),before=await f.store.get('calendar_execution_budgets',keys.tenant);
  const receipt=await f.execution.reserveCalendarExecution(one.client,'oauthStart');
  policy={...policy,version:'customer_calendar_v2'};publish();await assert.rejects(f.execution.reserveCalendarExecution(one.client,'tokenExchange'),e=>e.code==='calendar_budget_exhausted');
  await assert.rejects(f.execution.assertCalendarExecution(one.client,{receipt}),e=>e.code==='calendar_policy_changed');
  assert.equal((await f.store.get('calendar_execution_budgets',keys.tenant)).used.totalRequests,before.used.totalRequests);
});
await check('Paused or budget-limited owners retain the latest local desired work without transport authority',async()=>{
  const changed={...one.client,status:'paused',operationLifecycleVersion:2};await f.store.saveClient(changed);
  const row=await booking(changed,'local-only-after-cap');const queued=await f.delivery.queueCalendarBooking(changed,row);assert.ok(queued);assert.equal(queued.state,'queued');
  const calls=f.requests.length;await assert.rejects(f.execution.reserveCalendarExecution(changed,'tokenExchange',{localOnly:true}),e=>e.code==='calendar_authority_changed');assert.equal(f.requests.length,calls);
  await f.store.saveClient(one.client);
});
await check('Global caps arbitrate across shops and next-day capacity does not reuse old receipts',async()=>{
  f.advance(86400000);policy={...policy,limits:{...policy.limits,totalRequests:2},tenantLimits:{...policy.tenantLimits,totalRequests:2}};publish();
  const rs=await Promise.allSettled([one,two,one,two].map(item=>f.execution.reserveCalendarExecution(item.client,'tokenExchange')));assert.equal(rs.filter(r=>r.status==='fulfilled').length,2);
  const receipt=rs.find(r=>r.status==='fulfilled').value,owner=receipt.tenantIdentity===f.connection.calendarTenantIdentity(one.client)?one:two;
  f.advance(86400000);await assert.rejects(f.execution.assertCalendarExecution(owner.client,{receipt}),e=>e.code==='calendar_policy_changed');assert.equal(await f.execution.calendarExecutionAvailable(one.client,{actions:['tokenExchange']}),true);
});
await check('Invalid explicit customer policy cannot fall back to the existing named proof policy',async()=>{
  const saved=process.env.CALENDAR_SELF_SERVICE_POLICY_JSON;process.env.CALENDAR_SELF_SERVICE_POLICY_JSON='{}';assert.equal(f.execution.calendarExecutionPolicy(),null);assert.equal(await f.execution.calendarExecutionAvailable(one.client),false);process.env.CALENDAR_SELF_SERVICE_POLICY_JSON=saved;
});
await check('Cancelled, unselected and replacement owners cannot use retained Calendar authority',async()=>{
  const saved=one.client;
  for(const changed of [{...saved,status:'cancelled'},{...saved,onboarding:{...saved.onboarding,desiredChannels:[]}},{...saved,ownerKey:'replacement-key'}]){await f.store.saveClient(changed);assert.equal(await f.execution.calendarExecutionAvailable(saved),false);}
  await f.store.saveClient(saved);
});
await check('Changing Google client after OAuth start rejects the old grant before token exchange',async()=>{
  const item=await f.seed('changed-google-client');item.client.onboarding.desiredChannels=['calendar'];await f.store.saveClient(item.client);
  const pending=await f.connection.startCalendarConnection(item.client,item.session),state=new URL(pending.authorizationUrl).searchParams.get('state'),before=f.requests.length;
  const previous=process.env.GOOGLE_CLIENT_ID,oldPolicy=policy;process.env.GOOGLE_CLIENT_ID='rotated-fixture-client';policy={...policy,googleClientIdHash:sha(process.env.GOOGLE_CLIENT_ID)};publish();
  await assert.rejects(f.connection.completeCalendarConnection(item.client,item.session,{state,code:'old-client-code'}),e=>e.code==='invalid_state');assert.equal(f.requests.length,before);
  process.env.GOOGLE_CLIENT_ID=previous;policy=oldPolicy;publish();
});
await check('Revoked owner sessions cannot finish OAuth even though background grants need no browser session',async()=>{
  const item=await f.seed('revoked-oauth-owner');item.client.onboarding.desiredChannels=['calendar'];await f.store.saveClient(item.client);
  const pending=await f.connection.startCalendarConnection(item.client,item.session),state=new URL(pending.authorizationUrl).searchParams.get('state'),before=f.requests.length;
  await f.store.put('access_sessions',item.session.sessionHash,{...item.session,status:'revoked'});
  await assert.rejects(f.connection.completeCalendarConnection(item.client,item.session,{state,code:'revoked-session-code'}),e=>e.status===403);assert.equal(f.requests.length,before);
});
await check('A daily update allowance waits until UTC reset without spending provider-failure retries',async()=>{
  f.advance(86400000);
  policy={...policy,limits:Object.fromEntries(actions.map(a=>[a,10000])),tenantLimits:Object.fromEntries(actions.map(a=>[a,a==='eventUpdate'?1:1000]))};publish();
  const item=await shop('calendar-update-budget'),row=await booking(item.client,'ordinary-update-budget');
  await all();
  await f.store.put('bookings',`${item.client.slug}/${row.id}`,{...row,date:'2027-02-04'});await all();
  await f.store.put('bookings',`${item.client.slug}/${row.id}`,{...row,date:'2027-02-05'});await all();
  const key=f.delivery.calendarDeliveryKey(item.client,row.id),waiting=await f.store.get('calendar_deliveries',key),reset=new Date(Date.now());reset.setUTCHours(24,0,0,0);
  assert.equal(waiting.state,'queued');assert.equal(waiting.reasonCode,'calendar_budget_exhausted');assert.equal(waiting.attempts,0);assert.equal(waiting.nextAttemptAt,reset.toISOString());
  const before=f.requests.length;for(let n=0;n<6;n++){f.advance(60000);await all();}assert.equal(f.requests.length,before);
  f.advance(reset.getTime()-Date.now());await all();
  const saved=await f.store.get('calendar_deliveries',key);assert.equal(saved.state,'synced');assert.equal(saved.eventId,waiting.eventId);
  const remote=f.events.get(`calendar-update-budget@google.fixture.test/${saved.eventId}`);assert.match(remote.start.dateTime,/2027-02-05/);
});
await check('A create denied before transport remains eligible next day without retaining a false unknown-create marker',async()=>{
  f.advance(86400000);
  policy={...policy,tenantLimits:Object.fromEntries(actions.map(a=>[a,a==='eventCreate'?1:1000]))};publish();
  const item=await shop('calendar-create-budget');await booking(item.client,'first-create');await all();const row=await booking(item.client,'second-create');await all();
  const key=f.delivery.calendarDeliveryKey(item.client,row.id),waiting=await f.store.get('calendar_deliveries',key);
  assert.equal(waiting.state,'queued');assert.equal(waiting.reasonCode,'calendar_budget_exhausted');assert.equal(waiting.attempts,0);assert.equal(waiting.createAttempt,undefined);
  const creates=()=>f.requests.filter(call=>call.method==='POST'&&call.body.includes(waiting.eventId)).length;assert.equal(creates(),0);
  f.advance(Date.parse(waiting.nextAttemptAt)-Date.now());await all();await all();
  const saved=await f.store.get('calendar_deliveries',key);assert.equal(saved.state,'synced');assert.equal(saved.eventId,waiting.eventId);assert.equal(creates(),1);
});
await check('Budget waits retain prior dispatched unknown-create evidence and its failure count',async()=>{
  f.advance(86400000);
  policy={...policy,tenantLimits:Object.fromEntries(actions.map(a=>[a,a==='calendarRead'?3:1000]))};publish();
  const item=await shop('calendar-unknown-budget'),row=await booking(item.client,'unknown-create');f.setMode('lost_insert');await all();
  const key=f.delivery.calendarDeliveryKey(item.client,row.id),unknown=await f.store.get('calendar_deliveries',key);assert.equal(unknown.state,'retry');assert.equal(unknown.attempts,1);assert.equal(unknown.createAttempt.state,'uncertain');
  await f.execution.reserveCalendarExecution(item.client,'calendarRead',{targetId:'calendar-unknown-budget@google.fixture.test',bookingId:row.id});f.advance(120000);await all();
  const waiting=await f.store.get('calendar_deliveries',key);assert.equal(waiting.state,'queued');assert.equal(waiting.attempts,1);assert.deepEqual(waiting.createAttempt,unknown.createAttempt);
  const creates=()=>f.requests.filter(call=>call.method==='POST'&&call.body.includes(waiting.eventId)).length;assert.equal(creates(),1);
  f.advance(Date.parse(waiting.nextAttemptAt)-Date.now());await all();assert.equal((await f.store.get('calendar_deliveries',key)).state,'synced');assert.equal(creates(),1);
});
await report('calendar-self-service-offline',checks);
