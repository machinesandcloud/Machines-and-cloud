// Existing owner/Calendar paths with local Google protocols and conditional memory
// storage. No production credentials, provider traffic or seeded booking proof.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture, report } from './calendar-test-fixtures.mjs';
const f=await fixture(),self=await import('../netlify/functions/lib/calendar-self-service.mjs');
const visits=await import('../netlify/functions/lib/owner-visits.mjs');
const {configurationRevision}=await import('../netlify/functions/lib/setup.mjs');
const {addDays,houstonToday}=await import('../netlify/functions/lib/availability.mjs');
const sha=value=>createHash('sha256').update(value).digest('hex'),checks=[];
const actions=['oauthStart','tokenExchange','tokenRefresh','calendarRead','eventCreate','eventUpdate','eventDelete','workerDispatch','totalRequests'];
const base={mode:'self_service',version:'scoped_calendar_v1',expiresAt:new Date(Date.now()+30*86400000).toISOString(),googleClientIdHash:sha(process.env.GOOGLE_CLIENT_ID),limits:Object.fromEntries(actions.map(action=>[action,100000])),tenantLimits:Object.fromEntries(actions.map(action=>[action,100000]))};
let policy,serial=0;
const publish=value=>{policy=structuredClone(value);Object.assign(process.env,{CALENDAR_SELF_SERVICE_ENABLED:'true',CALENDAR_SELF_SERVICE_POLICY_JSON:JSON.stringify(policy),CALENDAR_SELF_SERVICE_APPROVED_VERSION:policy.version});};
const check=async(name,run)=>{await run();checks.push(name);};
const target=item=>item.client.slug+'@google.fixture.test';
const tenant=item=>({slug:item.client.slug,identity:f.connection.calendarTenantIdentity(item.client),targetIdHash:sha(target(item))});
const scope=item=>({...base,tenants:[tenant(item)],maxDistinctBookingsPerTenant:1});
async function shop(slug,{connect=true}={}){const item=await f.seed(slug);item.client.onboarding.desiredChannels=['calendar'];await f.store.saveClient(item.client);publish(scope(item));if(connect){f.setTarget(target(item));await f.connect(item.client,item.session);}return item;}
const run=()=>f.delivery.runCalendarDelivery({limit:10,discoveryLimit:200,budgetMs:12000});
const read=(item,id)=>f.store.get('bookings',item.client.slug+'/'+id);
async function create(item,offset){
  const preview=await visits.previewOwnerVisitAvailability(item.client,item.session,{action:'visit_availability',expectedRevision:configurationRevision(item.client),date:addDays(houstonToday(),offset),days:1});
  const opening=preview.availability.openings.find(row=>row.windows.length);assert.ok(opening,'ordinary fresh availability must return an actual free choice');
  const body={action:'create_visit',submissionId:sha('ordinary-owner-create:'+ ++serial),expectedRevision:configurationRevision(item.client),date:opening.date,window:opening.windows[0],customer_name:'Calendar owner fixture',phone:'+17135550142',address:'12 Oak St',issue:'Saved owner visit'};
  const saved=await visits.changeOwnerVisit(item.client,item.session,body);assert.equal(saved.localSaved,true);assert.equal(saved.complete,true);assert.ok((await read(item,saved.visit.id)).ownerVisitMutation);return saved;
}
async function move(item,id,offset){const saved=await read(item,id),preview=await visits.previewOwnerVisitAvailability(item.client,item.session,{action:'visit_availability',expectedRevision:configurationRevision(item.client),visitId:id,expectedVisitRevision:visits.ownerVisitRevision(saved),date:addDays(houstonToday(),offset),days:1}),opening=preview.availability.openings.find(row=>row.windows.length);assert.ok(opening);return visits.changeOwnerVisit(item.client,item.session,{action:'reschedule_visit',submissionId:sha('ordinary-owner-move:'+ ++serial),expectedRevision:configurationRevision(item.client),visitId:id,expectedVisitRevision:visits.ownerVisitRevision(saved),date:opening.date,window:opening.windows[0]});}
const row=item=>f.store.get('calendar_execution_budgets',self.selfServiceCalendarBudgetKeys(item.client).tenant);
let selected,first,second;
await check('Exact tenant scope rejects other workspace and replacement owner before OAuth or readiness',async()=>{
  selected=await shop('scoped-selected',{connect:false});const outsider=await f.seed('scoped-outsider');outsider.client.onboarding.desiredChannels=['calendar'];await f.store.saveClient(outsider.client);
  const before=f.requests.length;assert.equal((await f.connection.calendarConnectionView(outsider.client)).available,false);assert.equal(await f.execution.calendarExecutionAvailable(outsider.client),false);await assert.rejects(()=>f.connection.startCalendarConnection(outsider.client,outsider.session,{availabilityConsentVersion:f.connection.CALENDAR_AVAILABILITY_CONSENT_VERSION}),error=>error.code==='calendar_cohort_unavailable');
  const replaced={...selected.client,ownerKey:'changed-owner-key'};await f.store.saveClient(replaced);assert.equal(await f.execution.calendarExecutionAvailable(replaced),false);await f.store.saveClient(selected.client);assert.equal(f.requests.length,before);
});
await check('Wrong Google primary is rejected before binding while ordinary chosen owned primary connects',async()=>{
  f.setTarget('unexpected@google.fixture.test');await assert.rejects(()=>f.connect(selected.client,selected.session),error=>error.code==='calendar_target_changed');assert.equal((await f.connection.calendarConnectionView(selected.client)).connected,false);
  f.setTarget(target(selected));await f.connect(selected.client,selected.session);assert.equal((await f.connection.calendarConnectionView(selected.client)).connected,true);
  const before=f.requests.length;await assert.rejects(()=>f.execution.reserveCalendarExecution(selected.client,'calendarRead',{targetId:'unexpected@google.fixture.test'}),error=>error.code==='calendar_target_changed');assert.equal(f.requests.length,before);
});
await check('Ordinary fresh availability and Save select the first booking identity without predefined IDs',async()=>{
  first=await create(selected,14);assert.deepEqual((await row(selected)).bookingIds,[],'availability and local Save do not claim a provider booking slot');await run();await run();
  const journal=await f.store.get('calendar_deliveries',f.delivery.calendarDeliveryKey(selected.client,first.visit.id));assert.equal(journal.state,'synced');assert.equal(f.events.size,1);assert.deepEqual((await row(selected)).bookingIds,[first.visit.id]);assert.equal(journal.bookingId,first.visit.id);
});
await check('A second ordinary Save remains authoritative and queued but cannot create another provider event',async()=>{
  second=await create(selected,15);const before=f.requests.filter(call=>call.method==='POST'&&new URL(call.url).pathname.endsWith('/events')).length;await run();await run();
  assert.equal((await read(selected,second.visit.id)).status,'booked');const journal=await f.store.get('calendar_deliveries',f.delivery.calendarDeliveryKey(selected.client,second.visit.id));assert.equal(journal.state,'queued');assert.equal(journal.receipt,undefined);assert.equal(await f.execution.calendarExecutionAvailable(selected.client,{bookingId:second.visit.id,targetId:target(selected)}),false);
  await assert.rejects(()=>f.execution.reserveCalendarExecution(selected.client,'eventCreate',{bookingId:second.visit.id,targetId:target(selected)}),error=>error.code==='calendar_budget_exhausted');assert.equal(f.events.size,1);assert.equal(f.requests.filter(call=>call.method==='POST'&&new URL(call.url).pathname.endsWith('/events')).length,before);assert.deepEqual((await row(selected)).bookingIds,[first.visit.id]);
});
await check('Fresh move and cancellation reuse the same booking, event and cap slot',async()=>{
  const before=await f.store.get('calendar_deliveries',f.delivery.calendarDeliveryKey(selected.client,first.visit.id));await move(selected,first.visit.id,16);await run();const moved=await f.store.get('calendar_deliveries',before.storageKey);assert.equal(moved.state,'synced');assert.equal(moved.eventId,before.eventId);assert.equal(f.events.size,1);
  const saved=await read(selected,first.visit.id);await visits.changeOwnerVisit(selected.client,selected.session,{action:'cancel_visit',submissionId:sha('ordinary-owner-cancel:'+ ++serial),expectedRevision:configurationRevision(selected.client),visitId:saved.id,expectedVisitRevision:visits.ownerVisitRevision(saved)});await run();assert.equal((await f.store.get('calendar_deliveries',before.storageKey)).state,'cancelled');assert.equal(f.events.size,0);assert.deepEqual((await row(selected)).bookingIds,[first.visit.id]);
});
await check('Concurrent conditional reservations admit one distinct identity and never refund global attempts',async()=>{
  const item=await shop('scoped-cas'),a=await create(item,18),b=await create(item,19),keys=self.selfServiceCalendarBudgetKeys(item.client),beforeGlobal=await f.store.get('calendar_execution_budgets',keys.global);
  const results=await Promise.allSettled([a,b].map(saved=>f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:saved.visit.id,targetId:target(item)})));assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='calendar_budget_exhausted').length,1);
  const budget=await row(item),global=await f.store.get('calendar_execution_budgets',keys.global);assert.equal(budget.bookingIds.length,1);assert.equal(budget.used.eventCreate,1);assert.equal(global.used.eventCreate-beforeGlobal.used.eventCreate,2);
  const id=budget.bookingIds[0],retries=await Promise.allSettled(Array.from({length:8},()=>f.execution.reserveCalendarExecution(item.client,'eventUpdate',{bookingId:id,targetId:target(item)})));assert.equal(retries.filter(result=>result.status==='fulfilled').length,8);assert.deepEqual((await row(item)).bookingIds,[id]);
});
await check('Missing, foreign, aborted, setup and simulation sources cannot consume a booking slot',async()=>{
  const item=await shop('scoped-source'),made=await create(item,21),saved=await read(item,made.visit.id),before=await row(item);
  await assert.rejects(()=>f.execution.reserveCalendarExecution(item.client,'eventCreate',{targetId:target(item)}),error=>error.code==='calendar_booking_unavailable');
  for(const replacement of [null,{...saved,delivery:{tenantIdentity:'f'.repeat(64)}},{...saved,tenantIdentity:'f'.repeat(64)},{...saved,ownerVisitCreationAborted:true},{...saved,websiteSetupCheck:{checkId:'not-an-ordinary-visit'}},{...saved,simulation:true}]){if(replacement)await f.store.put('bookings',item.client.slug+'/'+saved.id,replacement);else await f.store.del('bookings',item.client.slug+'/'+saved.id);await assert.rejects(()=>f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:saved.id,targetId:target(item)}),error=>error.code==='calendar_booking_unavailable');}
  await f.store.put('bookings',item.client.slug+'/'+saved.id,saved);assert.deepEqual(await row(item),before);
});
await check('Omitting and restoring the cap or changing policy version cannot erase tracked identities or used counters',async()=>{
  const item=await shop('scoped-edits'),a=await create(item,23),b=await create(item,24);await f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:a.visit.id,targetId:target(item)});const before=await row(item),oldPolicy=structuredClone(policy);
  delete policy.maxDistinctBookingsPerTenant;policy.version='scoped_calendar_unlimited';publish(policy);await f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:b.visit.id,targetId:target(item)});assert.deepEqual((await row(item)).bookingIds,[a.visit.id,b.visit.id]);
  publish({...oldPolicy,version:'scoped_calendar_restored'});assert.equal((await row(item)).used.eventCreate,before.used.eventCreate+1);await f.execution.reserveCalendarExecution(item.client,'eventDelete',{bookingId:a.visit.id,targetId:target(item)});await f.execution.reserveCalendarExecution(item.client,'eventUpdate',{bookingId:b.visit.id,targetId:target(item)});const c=await create(item,25);await assert.rejects(()=>f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:c.visit.id,targetId:target(item)}),error=>error.code==='calendar_budget_exhausted');assert.deepEqual((await row(item)).bookingIds,[a.visit.id,b.visit.id]);
});
await check('Introducing a cap after untracked event attempts fails closed instead of fabricating empty history',async()=>{
  const item=await shop('scoped-legacy'),a=await create(item,27);delete policy.maxDistinctBookingsPerTenant;publish(policy);await f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:a.visit.id,targetId:target(item)});
  // OAuth had initialized tracking under the earlier cap. An old-deployment
  // ledger has only validated counters, so remove just its optional new field.
  const key=self.selfServiceCalendarBudgetKeys(item.client).tenant,saved=await row(item);delete saved.bookingIds;await f.store.put('calendar_execution_budgets',key,saved);publish({...policy,maxDistinctBookingsPerTenant:1});const before=await row(item);await assert.rejects(()=>f.execution.reserveCalendarExecution(item.client,'eventUpdate',{bookingId:a.visit.id,targetId:target(item)}),error=>error.code==='calendar_budget_unavailable');assert.deepEqual(await row(item),before);
});
await check('Malformed optional policy and retained booking history fail closed without fallback',async()=>{
  const item=await shop('scoped-malformed'),valid=structuredClone(policy),bad=[{tenants:[]},{tenants:null},{tenants:[tenant(item),tenant(item)]},{tenants:[{...tenant(item),slug:'Bad Slug'}]},{tenants:[{...tenant(item),identity:'f'.repeat(63)}]},{tenants:[{...tenant(item),targetIdHash:null}]},{tenants:[{...tenant(item),extra:true}]},...[-1,0,1.5,'1',100001,null].map(maxDistinctBookingsPerTenant=>({maxDistinctBookingsPerTenant})),{unknown:true}];
  for(const change of bad){publish({...valid,...change});assert.equal(self.selfServiceCalendarPolicy(),null);assert.equal(await f.execution.calendarExecutionAvailable(item.client),false);}publish(valid);
  const key=self.selfServiceCalendarBudgetKeys(item.client).tenant,saved=await row(item);for(const bookingIds of [null,'booking', ['duplicate','duplicate'],[1],['invalid/id']]){await f.store.put('calendar_execution_budgets',key,{...saved,bookingIds});assert.equal(await f.execution.calendarExecutionAvailable(item.client),false);await assert.rejects(()=>f.execution.reserveCalendarExecution(item.client,'calendarRead',{targetId:target(item)}),error=>error.code==='calendar_budget_unavailable');}await f.store.put('calendar_execution_budgets',key,saved);
});
await check('Empty history with prior event effects and history larger than physical usage cannot replenish identity capacity',async()=>{
  const item=await shop('scoped-history-consistency'),made=await create(item,28);await f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:made.visit.id,targetId:target(item)});const key=self.selfServiceCalendarBudgetKeys(item.client).tenant,valid=await row(item),currentPolicy=structuredClone(policy);
  for(const action of ['eventCreate','eventUpdate','eventDelete']){const used={...valid.used,eventCreate:0,eventUpdate:0,eventDelete:0};used[action]=1;used.totalRequests=actions.filter(name=>!['oauthStart','totalRequests'].includes(name)).reduce((sum,name)=>sum+used[name],0);const invalid={...valid,used,bookingIds:[]};await f.store.put('calendar_execution_budgets',key,invalid);for(const capped of [true,false]){const chosen=structuredClone(currentPolicy);if(!capped)delete chosen.maxDistinctBookingsPerTenant;publish(chosen);assert.equal(await f.execution.calendarExecutionAvailable(item.client,{bookingId:made.visit.id}),false);await assert.rejects(()=>f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:made.visit.id,targetId:target(item)}),error=>error.code==='calendar_budget_unavailable');assert.deepEqual(await row(item),invalid);}}
  publish(currentPolicy);const invalid={...valid,bookingIds:Array.from({length:valid.used.totalRequests+1},(_,index)=>'unbacked-'+index)};await f.store.put('calendar_execution_budgets',key,invalid);assert.equal(await f.execution.calendarExecutionAvailable(item.client),false);await assert.rejects(()=>f.execution.reserveCalendarExecution(item.client,'calendarRead',{targetId:target(item)}),error=>error.code==='calendar_budget_unavailable');assert.deepEqual(await row(item),invalid);await f.store.put('calendar_execution_budgets',key,valid);
});
await check('No optional fields preserves all-customer policy, targets and more than one booking',async()=>{
  const item=await f.seed('scoped-omitted');item.client.onboarding.desiredChannels=['calendar'];await f.store.saveClient(item.client);publish(base);f.setTarget(target(item));await f.connect(item.client,item.session);const a=await create(item,29),b=await create(item,30);await run();await run();for(const id of [a.visit.id,b.visit.id])assert.equal((await f.store.get('calendar_deliveries',f.delivery.calendarDeliveryKey(item.client,id))).state,'synced');assert.equal(Object.hasOwn(await row(item),'bookingIds'),false);
});
await check('New UTC day can admit the same legitimate retained booking for update without old capacity or receipts',async()=>{
  const item=await shop('scoped-next-day'),a=await create(item,32),receipt=await f.execution.reserveCalendarExecution(item.client,'eventCreate',{bookingId:a.visit.id,targetId:target(item)}),oldKey=self.selfServiceCalendarBudgetKeys(item.client).tenant,old=await row(item);f.advance(86400000);publish({...policy,version:'scoped_next_day'});await assert.rejects(()=>f.execution.assertCalendarExecution(item.client,{receipt}),error=>error.code==='calendar_policy_changed');await f.execution.reserveCalendarExecution(item.client,'eventUpdate',{bookingId:a.visit.id,targetId:target(item)});assert.deepEqual((await row(item)).bookingIds,[a.visit.id]);assert.equal((await row(item)).used.eventCreate,0);assert.deepEqual(await f.store.get('calendar_execution_budgets',oldKey),old);
});
await report('calendar-scoped-admission-offline',checks);
