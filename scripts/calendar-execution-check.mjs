// Physical networking is disabled by the fixture. These checks exercise the real
// cohort ledger plus real OAuth admission; no provider credentials are loaded.
import assert from 'node:assert/strict';
import {paidFixture} from './paid-service-test-fixtures.mjs';
import { createHash } from 'node:crypto';
import { fixture, report } from './calendar-test-fixtures.mjs';
const f = await fixture(), checks = [], hash = value => createHash('sha256').update(value).digest('hex');
const check = async (name, run) => { await run(); checks.push(name); };
const publish = p => { process.env.CALENDAR_EXECUTION_POLICY_JSON = JSON.stringify(p); process.env.CALENDAR_EXECUTION_APPROVED_VERSION = p.version; };
let sequence = 0;
async function named() { const slug='execution-' + ++sequence;f.setTarget(slug+'@calendar.example.test');return f.seed(slug); }
await check('Paid Calendar expiry fences new event create/update at physical dispatch while known reads/delete remain available',async()=>{
 const {client}=await named(),target=client.slug+'@calendar.example.test',fpaid=paidFixture(client),id=f.delivery.calendarEventId(client,'visit-1'),url='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(target)+'/events';await f.store.put('workspace_billing',fpaid.key,fpaid.row);
 const before=f.requests.length;await assert.rejects(f.execution.guardedCalendarFetch(client,'eventCreate',url+'?sendUpdates=none',{method:'POST',headers:{Authorization:'Bearer dummy-access'},body:JSON.stringify({id})},{targetId:target,bookingId:'visit-1',authorize:()=>{f.advance(61000);return true;}}),e=>e.code==='paid_service_unconfirmed');assert.equal(f.requests.length,before);await assert.rejects(f.execution.guardedCalendarFetch(client,'eventUpdate',url+'/'+id,{method:'PATCH',body:'{}'},{targetId:target,bookingId:'visit-1'}),e=>e.code==='paid_service_unconfirmed');
 const read=await f.execution.guardedCalendarFetch(client,'calendarRead','https://www.googleapis.com/calendar/v3/calendars/primary',{method:'GET'});assert.equal(read.status,200);const removed=await f.execution.guardedCalendarFetch(client,'eventDelete',url+'/'+id+'?sendUpdates=none',{method:'DELETE',headers:{Authorization:'Bearer dummy-access'}},{targetId:target,bookingId:'visit-1'});assert.equal(removed.status,404);
});
await check('Payment hold retains the same saved Calendar job without a false create marker or retry exhaustion and resumes after a confirmed period',async()=>{
 const {client,session}=await named();await f.connect(client,session);const paid=paidFixture(client,{start:Math.floor(Date.now()/1000)-120,end:Math.floor(Date.now()/1000)-60});await f.store.put('workspace_billing',paid.key,paid.row);const booking={slug:client.slug,id:'visit-1',status:'booked',delivery:{tenantIdentity:f.connection.calendarTenantIdentity(client)},customer_name:'Synthetic Customer',phone:'+17135550122',address:'10 Fixture St',issue:'AC service',date:'2027-01-15',window:'8 to 12'};await f.store.put('bookings',client.slug+'/'+booking.id,booking);await f.delivery.queueCalendarBooking(client,booking);const key=f.delivery.calendarDeliveryKey(client,booking.id),before=f.requests.length;
 for(let n=0;n<6;n++){const outcome=await f.delivery.runCalendarDelivery({limit:1});assert.equal(outcome.ok,true);assert.equal(outcome.failed,0);const row=await f.store.get('calendar_deliveries',key);assert.equal(row.state,'queued');assert.equal(row.reasonCode,'paid_service_unconfirmed');assert.equal(row.attempts,0);assert.equal(row.createAttempt,undefined);assert.equal(row.completedAt,null);assert.equal((await f.delivery.calendarDeliveryView(client)).verification.delivered,false);f.advance(3600001);}assert.equal(f.requests.slice(before).filter(x=>x.method==='POST'&&x.url.includes('/events')).length,0);const funded=paidFixture(client,{end:Math.floor(Date.now()/1000)+86400});await f.store.put('workspace_billing',paid.key,funded.row);await f.delivery.runCalendarDelivery({limit:1});const saved=await f.store.get('calendar_deliveries',key);assert.equal(saved.state,'synced');assert.equal(saved.attempts,1);assert.equal(saved.createAttempt.state,'observed');assert.equal(f.requests.slice(before).filter(x=>x.method==='POST'&&x.url.includes('/events')).length,1);
});
await check('An actually attempted unknown create keeps its marker and failure count across payment expiry and renewal; funding never authorizes a second create',async()=>{
 const {client,session}=await named();await f.connect(client,session);let paid=paidFixture(client);await f.store.put('workspace_billing',paid.key,paid.row);const booking={slug:client.slug,id:'visit-1',status:'booked',delivery:{tenantIdentity:f.connection.calendarTenantIdentity(client)},customer_name:'Synthetic Customer',phone:'+17135550122',address:'10 Fixture St',issue:'AC service',date:'2027-01-15',window:'8 to 12'};await f.store.put('bookings',client.slug+'/'+booking.id,booking);await f.delivery.queueCalendarBooking(client,booking);const key=f.delivery.calendarDeliveryKey(client,booking.id),before=f.requests.length;f.intercept(call=>{if(call.method==='POST'&&call.url.includes('/events'))throw Error('Synthetic uncertain POST transport');});assert.equal((await f.delivery.runCalendarDelivery({limit:1})).ok,false);f.intercept(null);let row=await f.store.get('calendar_deliveries',key);const token=row.createAttempt.token;assert.equal(row.createAttempt.state,'uncertain');assert.equal(row.attempts,1);f.advance(120000);await f.delivery.runCalendarDelivery({limit:1});row=await f.store.get('calendar_deliveries',key);assert.equal(row.reasonCode,'creation_unconfirmed');assert.equal(row.createAttempt.token,token);assert.equal(row.attempts,2);paid=paidFixture(client,{end:Math.floor(Date.now()/1000)+86400});await f.store.put('workspace_billing',paid.key,paid.row);f.advance(3600001);await f.delivery.runCalendarDelivery({limit:1});row=await f.store.get('calendar_deliveries',key);assert.equal(row.reasonCode,'creation_unconfirmed');assert.equal(row.createAttempt.token,token);assert.equal(row.attempts,3);assert.equal(f.requests.slice(before).filter(x=>x.method==='POST'&&x.url.includes('/events')).length,1);
});
await check('Missing execution approval blocks real OAuth despite ordinary gates and keys', async () => {
  const {client,session} = await named(); delete process.env.CALENDAR_EXECUTION_APPROVED_VERSION;
  const before = f.requests.length; await assert.rejects(f.connection.startCalendarConnection(client,session,{availabilityConsentVersion:f.connection.CALENDAR_AVAILABILITY_CONSENT_VERSION}), e => e.code === 'calendar_unavailable'); assert.equal(f.requests.length,before);
});
await check('Unlisted tenant and recreated slug cannot use another cohort', async () => {
  const one = await named(), p = structuredClone(f.policies.get(one.client.slug)); const two = await named(); publish(p);
  assert.equal((await f.connection.calendarConnectionView(two.client)).available,false);
  await assert.rejects(f.connection.startCalendarConnection(two.client,two.session,{availabilityConsentVersion:f.connection.CALENDAR_AVAILABILITY_CONSENT_VERSION}), e => e.code === 'calendar_cohort_unavailable');
  const replacement = {...one.client,ownerKey:'new-incarnation'}; await f.store.saveClient(replacement);
  await assert.rejects(f.connection.startCalendarConnection(replacement,one.session,{availabilityConsentVersion:f.connection.CALENDAR_AVAILABILITY_CONSENT_VERSION}), e => e.code === 'calendar_cohort_unavailable');
});
await check('Retained resources require an actual clean census, not a nonempty approval string', async () => {
  const {client,session} = await named(); await f.store.put('calendar_connections',client.slug,{slug:client.slug,status:'disconnected',refresh:null});
  await assert.rejects(f.connection.startCalendarConnection(client,session,{availabilityConsentVersion:f.connection.CALENDAR_AVAILABILITY_CONSENT_VERSION}),e => e.code === 'calendar_census_unaccepted');
});
await check('Changed Google client and declared target deny cohort work', async () => {
  const {client} = await named(), before = process.env.GOOGLE_CLIENT_ID; process.env.GOOGLE_CLIENT_ID = 'other-google-client'; assert.equal(f.execution.calendarExecutionPolicy(),null); process.env.GOOGLE_CLIENT_ID = before;
  await assert.rejects(f.execution.assertCalendarExecution(client,{targetId:'someone-else@example.test'}),e => e.code === 'calendar_cohort_unavailable');
});
await check('CAS admits only the last explicitly permitted physical attempts', async () => {
  const {client} = await named(), p = structuredClone(f.policies.get(client.slug)); p.limits.totalRequests=3; p.limits.tokenExchange=3; publish(p);
  const results = await Promise.allSettled(Array.from({length:20},()=>f.execution.reserveCalendarExecution(client,'tokenExchange')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
  const row=await f.store.get('calendar_execution_budgets',f.execution.calendarExecutionBudgetKey(p.version)); assert.equal(row.used.totalRequests,3); assert.equal(row.used.tokenExchange,3);
});
await check('Editing a version cannot silently replenish its retained budget', async () => {
  const {client} = await named(), p = structuredClone(f.policies.get(client.slug)); await f.execution.reserveCalendarExecution(client,'tokenExchange');
  const changed = {...p,limits:{...p.limits,totalRequests:9999}}; publish(changed);
  await assert.rejects(f.execution.reserveCalendarExecution(client,'tokenExchange'),e => e.code==='calendar_policy_changed'); publish(p);
  const row=await f.store.get('calendar_execution_budgets',f.execution.calendarExecutionBudgetKey(p.version)); assert.equal(row.used.tokenExchange,1);
});
await check('Unknown network results and retries each consume a physical attempt', async () => {
  const {client} = await named(); const oldFetch=globalThis.fetch; let calls=0;
  globalThis.fetch=async (_url,init)=>{calls++;assert.equal(init.redirect,'error');throw new Error('Offline unknown result');};
  try { for(let i=0;i<2;i++)await assert.rejects(f.execution.guardedCalendarFetch(client,'tokenExchange','https://oauth2.googleapis.com/token',{method:'POST'})); } finally {globalThis.fetch=oldFetch;}
  const p=f.execution.calendarExecutionPolicy(),row=await f.store.get('calendar_execution_budgets',f.execution.calendarExecutionBudgetKey(p.version)); assert.equal(calls,2); assert.equal(row.used.tokenExchange,2);
});
await check('Revocation after reservation blocks transport without refunding that attempt', async () => {
  const {client} = await named(); let authorityChecks=0; const before=f.requests.length;
  await assert.rejects(f.execution.guardedCalendarFetch(client,'tokenExchange','https://oauth2.googleapis.com/token',{method:'POST'},{authorize:()=>{if(++authorityChecks===2)delete process.env.CALENDAR_EXECUTION_APPROVED_VERSION;return true;}}),e=>e.code==='calendar_policy_changed');
  const p=f.policies.get(client.slug),row=await f.store.get('calendar_execution_budgets',f.execution.calendarExecutionBudgetKey(p.version)); assert.equal(row.used.tokenExchange,1); assert.equal(f.requests.length,before);
});
await check('A valid tenant cannot edit an older booking outside its explicit pilot scope', async () => {
  const {client,session} = await named(); await f.connect(client,session);
  const booking={slug:client.slug,id:'old-unapproved-visit',delivery:{tenantIdentity:f.connection.calendarTenantIdentity(client)}};
  assert.equal(await f.delivery.queueCalendarBooking(client,booking),null);
});
await check('Local disconnect remains usable after expiration; no cleanup effect is invented', async () => {
  const {client,session} = await named(); await f.connect(client,session); const p=f.policies.get(client.slug); publish({...p,expiresAt:'2000-01-01T00:00:00.000Z'});
  const before=f.requests.length; const result=await f.connection.disconnectCalendar(client,session); assert.equal(result.calendar.status,'disconnected'); assert.equal(result.calendar.available,false); assert.equal(f.requests.length,before);
  const row=await f.store.get('calendar_connections',client.slug); assert.equal(row.refresh,null); assert.equal(hash(row.targetId),p.targetIdHash);
});
await check('Exhausted budget and fixed transport validation prevent uncounted worker/provider calls', async () => {
  const {client} = await named(),p=structuredClone(f.policies.get(client.slug));p.limits.totalRequests=0;publish(p);const before=f.requests.length;
  await assert.rejects(f.delivery.dispatchCalendarDeliveryWave(),e=>e.code==='calendar_budget_exhausted');
  await assert.rejects(f.execution.guardedCalendarFetch(client,'eventDelete','https://attacker.example.test',{method:'DELETE'}),e=>e.code==='calendar_transport_invalid');assert.equal(f.requests.length,before);
});
await check('Connect availability checks each necessary allowance, not only the total', async () => {
  for (const action of ['oauthStart','tokenExchange','calendarRead']) {
    const {client}=await named(),p=structuredClone(f.policies.get(client.slug));p.limits[action]=0;publish(p);
    assert.equal((await f.connection.calendarConnectionView(client)).available,false,action);
  }
});
await check('Exhausted refresh allowance hides delivery availability while retaining connection status', async () => {
  const {client,session}=await named(),p=structuredClone(f.policies.get(client.slug));p.limits.tokenRefresh=1;f.policies.set(client.slug,p);await f.connect(client,session);
  const row=await f.store.get('calendar_connections',client.slug);await f.connection.googleAccessToken(client.slug,row.connectionId);
  const view=await f.connection.calendarConnectionView(client);assert.equal(view.connected,true);assert.equal(view.available,false);assert.equal((await f.delivery.calendarDeliveryView(client)).enabled,false);
});
await check('An expired request deadline admits neither quota nor transport', async () => {
  const {client}=await named(),before=f.requests.length;
  await assert.rejects(f.execution.guardedCalendarFetch(client,'tokenExchange','https://oauth2.googleapis.com/token',{method:'POST'},{deadline:Date.now()-1}),e=>e.code==='calendar_deadline_reached');
  const p=f.policies.get(client.slug);assert.equal(await f.store.get('calendar_execution_budgets',f.execution.calendarExecutionBudgetKey(p.version)),null);assert.equal(f.requests.length,before);
});
async function retainedVisit() {
  const item=await named();await f.connect(item.client,item.session);const {client}=item;
  const booking={slug:client.slug,id:'visit-1',status:'booked',delivery:{tenantIdentity:f.connection.calendarTenantIdentity(client)},customer_name:'Alex Fixture',phone:'+17135550122',address:'10 Fixture St',issue:'AC service',date:'2027-01-15',window:'8 to 12'};
  await f.store.put('bookings',`${client.slug}/${booking.id}`,booking);await f.delivery.queueCalendarBooking(client,booking);await f.delivery.runCalendarDelivery();
  const old=f.policies.get(client.slug),key=f.delivery.calendarDeliveryKey(client,booking.id),before=await f.store.get('calendar_execution_budgets',f.execution.calendarExecutionBudgetKey(old.version));
  const renewal={...old,version:old.version+'_renewal',censusMode:'reviewed_retained',bookingIds:[booking.id],censusDigest:(await f.execution.calendarExecutionCensus(client)).digest,limits:{...old.limits,oauthStart:0,tokenExchange:0,eventCreate:0}};
  return {...item,booking,old,key,before,renewal};
}
await check('Explicit reviewed renewal after expiry cancels the same event without resetting old counters', async()=>{
  const item=await retainedVisit();publish({...item.old,expiresAt:'2000-01-01T00:00:00.000Z'});const oldCalls=f.requests.length;await f.delivery.runCalendarDelivery();assert.equal(f.requests.length,oldCalls);
  publish(item.renewal);const cancelled={...item.booking,status:'cancelled'};await f.store.put('bookings',`${item.client.slug}/visit-1`,cancelled);await f.delivery.queueCalendarBooking(item.client,cancelled);await f.delivery.runCalendarDelivery();
  const job=await f.store.get('calendar_deliveries',item.key);assert.equal(job.state,'cancelled');assert.equal(f.events.has(`${item.client.slug}@calendar.example.test/${job.eventId}`),false);
  assert.deepEqual(await f.store.get('calendar_execution_budgets',f.execution.calendarExecutionBudgetKey(item.old.version)),item.before);
  const budget=await f.store.get('calendar_execution_budgets',f.execution.calendarExecutionBudgetKey(item.renewal.version));assert.equal(budget.used.eventCreate,0);assert.equal(budget.used.eventDelete,1);assert.equal(budget.census.reviewed,true);
});
await check('Retained renewal rejects mismatched connection ownership even with its current exact digest',async()=>{
  const item=await retainedVisit(),row=await f.store.get('calendar_connections',item.client.slug);await f.store.put('calendar_connections',item.client.slug,{...row,googleClientIdHash:hash('other-client')});
  item.renewal.censusDigest=(await f.execution.calendarExecutionCensus(item.client)).digest;publish(item.renewal);
  await assert.rejects(f.execution.admitCalendarExecution(item.client),e=>e.code==='calendar_census_unaccepted');
});
await check('Retained renewal rejects unlisted jobs and live OAuth grants rather than trusting mode alone',async()=>{
  const item=await retainedVisit();await f.store.put('calendar_oauth','unreviewed-grant',{slug:item.client.slug,tenantIdentity:f.connection.calendarTenantIdentity(item.client),googleClientIdHash:item.old.googleClientIdHash,email:item.client.owner.email,state:'pending',expiresAt:new Date(Date.now()+3600000).toISOString()});
  item.renewal.censusDigest=(await f.execution.calendarExecutionCensus(item.client)).digest;publish(item.renewal);await assert.rejects(f.execution.admitCalendarExecution(item.client),e=>e.code==='calendar_census_unaccepted');
  await f.store.del('calendar_oauth','unreviewed-grant');const job=await f.store.get('calendar_deliveries',item.key);await f.store.put('calendar_deliveries',`${item.client.slug}/unlisted`,{...job,bookingId:'unlisted'});item.renewal.censusDigest=(await f.execution.calendarExecutionCensus(item.client)).digest;publish(item.renewal);await assert.rejects(f.execution.admitCalendarExecution(item.client),e=>e.code==='calendar_census_unaccepted');
});
await check('Retained renewal rejects ISO and malformed claims; only an expired numeric worker lease can reconcile',async()=>{
  const item=await retainedVisit(),row=await f.store.get('calendar_deliveries',item.key),token='d'.repeat(32);
  for(const until of [Date.now()+60000,new Date(Date.now()+60000).toISOString(),new Date(Date.now()-60000).toISOString(),'not-a-date',null,undefined,'2026-02-30T00:00:00.000Z']) {
    await f.store.put('calendar_deliveries',item.key,{...row,claim:{token,until}});item.renewal.censusDigest=(await f.execution.calendarExecutionCensus(item.client)).digest;publish(item.renewal);
    await assert.rejects(f.execution.admitCalendarExecution(item.client),e=>e.code==='calendar_census_unaccepted');
  }
  await f.store.put('calendar_deliveries',item.key,{...row,claim:{token,until:Date.now()-60000}});item.renewal.censusDigest=(await f.execution.calendarExecutionCensus(item.client)).digest;publish(item.renewal);
  await f.execution.admitCalendarExecution(item.client);const cancelled={...item.booking,status:'cancelled'};await f.store.put('bookings',`${item.client.slug}/visit-1`,cancelled);await f.delivery.queueCalendarBooking(item.client,cancelled);await f.delivery.runCalendarDelivery();
  assert.equal((await f.store.get('calendar_deliveries',item.key)).state,'cancelled');
});
await check('Completed real waves release their marker so the next wave executes',async()=>{
  const item=await retainedVisit();const first=await f.delivery.runCalendarDeliveryWave();assert.equal(first.skipped,undefined);
  const marker=await f.store.get('calendar_scan','wave:v1');assert.equal(marker.state,'complete');assert.equal(marker.until,0);
  const updated={...item.booking,issue:'Second wave changed issue'};await f.store.put('bookings',`${item.client.slug}/visit-1`,updated);
  const second=await f.delivery.runCalendarDeliveryWave();assert.equal(second.skipped,undefined);assert.ok(second.processed>0);assert.equal(f.events.get(`${item.client.slug}@calendar.example.test/${f.delivery.calendarEventId(item.client,'visit-1')}`).summary,'Second wave changed issue - Alex Fixture');
});
await check('A failed real wave releases its lease and a later wave recovers the retained event',async()=>{
  const item=await retainedVisit();const updated={...item.booking,issue:'Recover after wave failure'};await f.store.put('bookings',`${item.client.slug}/visit-1`,updated);
  f.intercept(call=>call.url.includes('/events')?f.json(503,{}):undefined);const failed=await f.delivery.runCalendarDeliveryWave();assert.equal(failed.ok,false);assert.equal(failed.skipped,undefined);assert.equal((await f.store.get('calendar_scan','wave:v1')).state,'complete');
  f.intercept(null);f.advance(120000);const recovered=await f.delivery.runCalendarDeliveryWave();assert.equal(recovered.skipped,undefined);assert.equal(recovered.ok,true);assert.equal((await f.store.get('calendar_deliveries',item.key)).state,'synced');
});
await check('Wave release compatibility accepts published completed markers but denies overlap and malformed running leases',async()=>{
  const item=await retainedVisit(),token='e'.repeat(32);await f.store.put('calendar_scan','wave:v1',{token,state:'complete',until:0,at:new Date(Date.now()-1000).toISOString(),completedAt:new Date().toISOString()});assert.equal((await f.delivery.runCalendarDeliveryWave()).skipped,undefined);
  for(const marker of [{token,state:'running',until:Date.now()+60000},{token,state:'running',until:0},{token,state:'complete',until:0},{token,state:'running',until:new Date(Date.now()-60000).toISOString()}]) {await f.store.put('calendar_scan','wave:v1',marker);const before=f.requests.length;assert.equal((await f.delivery.runCalendarDeliveryWave()).skipped,'wave_running');assert.equal(f.requests.length,before);}
  await f.store.put('calendar_scan','wave:v1',{token,state:'running',until:Date.now()-1});assert.equal((await f.delivery.runCalendarDeliveryWave()).skipped,undefined);
});
await report('calendar-execution-cohort-offline',checks);
