// Actual budget/outbox paths; every amount and account below is synthetic.
import assert from 'node:assert/strict';
import {paidFixture} from './paid-service-test-fixtures.mjs';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw Error('SMS budget check denies physical networking');};net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();globalThis.fetch=deny;
const NativeDate=Date;let clock=NativeDate.parse('2026-10-23T18:00:00Z');globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}};
const sha=v=>createHash('sha256').update(v).digest('hex'),account='AC'+'a'.repeat(32),number='+17135550145',service='MG'+'b'.repeat(32);
Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:'https://sms-budget.example.test',TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:'synthetic-only',TWILIO_PRIMARY_PROFILE_SID:'BU'+'c'.repeat(32),PLATFORM_DATA_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),SERVICE_DELIVERY_ENABLED:'true',SERVICE_WORKER_KEY:'synthetic-service-worker-key-'+ 'x'.repeat(32)});
const store=await import('../netlify/functions/lib/store.mjs'),{newClient}=await import('../netlify/functions/lib/config.mjs'),{workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs'),budget=await import('../netlify/functions/lib/managed-sms-budget.mjs'),delivery=await import('../netlify/functions/lib/managed-delivery.mjs'),consent=await import('../netlify/functions/lib/managed-consent.mjs');
const sourceFiles=['netlify/functions/lib/managed-sms-budget.mjs','netlify/functions/lib/managed-delivery.mjs','scripts/managed-sms-budget-check.mjs'],hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,sha(await readFile(p))]))),before=await hashes(),checks=[];
let serial=0,policy;
const cap=(messages=100,segments=1000,costMicros=10000000)=>({messages,segments,costMicros});
async function shop(){const slug='sms-budget-'+ ++serial,c=newClient({slug,ownerKey:'synthetic-owner-'+serial,owner:{email:slug+'@example.test',phone:'+17135550142'},business:{name:'Synthetic Service'}});c.onboarding={version:1};c.status='live';await store.saveClient(c);return c;}
function publish(clients,extra={}){policy={version:'synthetic_upper_bound_v1',expiresAt:'2027-12-01T00:00:00Z',mode:'cohort',providerAccountHash:sha(account),currency:'USD',rateBasis:'all_in_upper_bound',rateSource:'https://example.test/synthetic-upper-rates',rates:{perMessageMicros:5,perSegmentMicros:10},accountLimits:cap(),tenantLimits:cap(),tenants:clients.map(c=>({slug:c.slug,identity:workspaceTenant(c)})),...extra};process.env.MANAGED_SMS_BUDGET_POLICY_JSON=JSON.stringify(policy);process.env.MANAGED_SMS_BUDGET_APPROVED_VERSION=policy.version;}
const job=(c,id='message',body='A saved customer reply')=>({id:c.slug+'/'+id,slug:c.slug,tenant:workspaceTenant(c),channel:'sms',purpose:'reply',to:'+17135550199',from:number,serviceSid:service,body});
async function check(name,run){for(const kind of ['managed_sms_budgets','managed_deliveries','managed_delivery_pending','managed_sms_consent','health'])for(const key of await store.list(kind))await store.del(kind,key);await run();checks.push(name);}
await check('Paid SMS expiry stops ordinary reservation and physical send while retaining its saved outbox',async()=>{
 const c=await shop();publish([c]);const f=paidFixture(c);await store.put('workspace_billing',f.key,f.row);await consent.recordManagedInbound(c,{phone:'+17135550199',text:'Question',messageSid:'SM'+'8'.repeat(32)});const id=await delivery.queueManagedMessage(c,{eventId:'paid-expiry',channel:'sms',purpose:'reply',to:'+17135550199',body:'A retained customer reply'});let sends=0,bindings=0;
 const engine=delivery.createManagedDeliveryEngine({gate:()=>true,sender:async()=>{if(++bindings===2)clock=f.row.paidPeriod.end*1000;return {number,serviceSid:service};},provider:{send:async()=>{sends++;return{id:'SM'+'7'.repeat(32)};}}});await engine.run(id);assert.equal(sends,0);assert.equal((await store.get('managed_deliveries',id)).state,'waiting_platform');assert.equal((await store.get('managed_deliveries',id)).reasonCode,'paid_service_unconfirmed');assert.equal((await store.get('managed_deliveries',id)).attemptStartedAt,null);await assert.rejects(()=>budget.reserveManagedSMS(c,job(c,'later')),e=>e.code==='paid_service_unconfirmed');assert.equal((await store.get('managed_sms_budgets',budget.managedSMSBudgetKey())).used.messages,1,'An admitted but not sent physical attempt is never refunded');
});
await check('GSM extension and Unicode surrogate boundaries reserve conservative multipart segments',async()=>{
  for(const [body,encoding,segments] of [['a'.repeat(160),'GSM7',1],['a'.repeat(161),'GSM7',2],['^'.repeat(80),'GSM7',1],['^'.repeat(81),'GSM7',2],['a'.repeat(305),'GSM7',3],['漢'.repeat(70),'UCS2',1],['漢'.repeat(71),'UCS2',2],['😀'.repeat(35),'UCS2',1],['😀'.repeat(36),'UCS2',2],['😀'.repeat(67),'UCS2',3]]){const size=budget.managedSMSSegments(body);assert.equal(size.encoding,encoding);assert.equal(size.segments,segments);}
  assert.throws(()=>budget.managedSMSSegments('a'.repeat(1601)),e=>e.code==='sms_budget_payload_unsupported');
});
await check('Missing invalid expired unapproved and wrong-account policies fail closed',async()=>{
  const c=await shop();publish([c]);const saved=process.env.MANAGED_SMS_BUDGET_POLICY_JSON;
  for(const value of ['', '{}',JSON.stringify({...policy,expiresAt:'2020-01-01'}),JSON.stringify({...policy,providerAccountHash:'f'.repeat(64)}),JSON.stringify({...policy,rates:{perMessageMicros:0,perSegmentMicros:0}})]){process.env.MANAGED_SMS_BUDGET_POLICY_JSON=value;await assert.rejects(()=>budget.reserveManagedSMS(c,job(c)),e=>e.code==='sms_budget_policy_unavailable');}
  process.env.MANAGED_SMS_BUDGET_POLICY_JSON=saved;process.env.MANAGED_SMS_BUDGET_APPROVED_VERSION='other';assert.equal(budget.managedSMSBudgetPolicy(),null);assert.deepEqual(await store.list('managed_sms_budgets'),[]);
});
await check('Exact cohort and current workspace authority exclude foreign replacement paused and cancelled tenants',async()=>{
  const c=await shop(),other=await shop();publish([c]);await assert.rejects(()=>budget.reserveManagedSMS(other,job(other)),e=>e.code==='sms_budget_tenant_unapproved');
  for(const patch of [{ownerKey:'replacement'},{status:'paused'},{status:'cancelled'}]){await store.saveClient({...c,...patch});await assert.rejects(()=>budget.reserveManagedSMS(c,job(c)),e=>e.code==='sms_budget_tenant_unapproved');}await store.saveClient(c);
});
await check('One CAS document jointly enforces account and tenant message ceilings under concurrent sends',async()=>{
  const a=await shop(),b=await shop();publish([a,b],{accountLimits:cap(5),tenantLimits:cap(3)});
  const results=await Promise.allSettled(Array.from({length:20},(_,i)=>budget.reserveManagedSMS(i%2?a:b,job(i%2?a:b,'parallel-'+i))));assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
  const row=await store.get('managed_sms_budgets',budget.managedSMSBudgetKey());assert.equal(row.used.messages,5);assert(Object.values(row.tenants).every(t=>t.messages<=3));assert.equal(Object.values(row.tenants).reduce((n,t)=>n+t.messages,0),5);
});
await check('Self-service policy admits new current workspaces automatically within shared account and tenant ceilings',async()=>{
  publish([],{mode:'self_service',accountLimits:cap(5),tenantLimits:cap(3)});
  const a=await shop(),b=await shop();
  const rows=await Promise.allSettled(Array.from({length:12},(_,i)=>budget.reserveManagedSMS(i%2?a:b,job(i%2?a:b,'self-'+i))));
  assert.equal(rows.filter(r=>r.status==='fulfilled').length,5);assert.deepEqual(policy.tenants,[]);
  const saved=await store.get('managed_sms_budgets',budget.managedSMSBudgetKey());assert.equal(saved.used.messages,5);assert(Object.values(saved.tenants).every(t=>t.messages<=3));
  for(const patch of [{status:'paused'},{ownerKey:'replacement-owner'}]){await store.saveClient({...a,...patch});await assert.rejects(()=>budget.reserveManagedSMS(a,job(a,'stale')),e=>e.code==='sms_budget_tenant_unapproved');}
  await store.saveClient({...a,onboarding:null});await assert.rejects(()=>budget.reserveManagedSMS(a,job(a,'unsupported')),e=>e.code==='sms_budget_tenant_unapproved');
});
await check('Changing between cohort and self-service never replenishes exposure and ambiguous scope is rejected',async()=>{
  const a=await shop(),b=await shop();publish([a],{accountLimits:cap(1),tenantLimits:cap(1)});await budget.reserveManagedSMS(a,job(a));
  publish([],{mode:'self_service',version:'synthetic_self_service_v2',accountLimits:cap(1),tenantLimits:cap(1)});
  await budget.reserveManagedSMS(a,job(a));await assert.rejects(()=>budget.reserveManagedSMS(b,job(b)),e=>e.code==='sms_budget_exhausted');
  publish([a],{mode:'self_service'});assert.equal(budget.managedSMSBudgetPolicy(),null);
  publish([]);assert.equal(budget.managedSMSBudgetPolicy(),null);
});
await check('Segment and monetary ceilings independently deny otherwise permitted message counts',async()=>{
  for(const [suffix,limits] of [['segments',cap(10,2,10000)],['cost',cap(10,100,25)]]){const c=await shop();publish([c],{accountLimits:limits,tenantLimits:limits});await budget.reserveManagedSMS(c,job(c,'first-'+suffix,'a'.repeat(161)));await assert.rejects(()=>budget.reserveManagedSMS(c,job(c,'second-'+suffix)),e=>e.code==='sms_budget_exhausted');await store.del('managed_sms_budgets',budget.managedSMSBudgetKey());}
});
await check('Stable reservations survive crashes dates and approved version edits without replenishing spent capacity',async()=>{
  const c=await shop();publish([c],{accountLimits:cap(1),tenantLimits:cap(1)});const first=await budget.reserveManagedSMS(c,job(c));clock+=86400000;publish([c],{version:'synthetic_upper_bound_v2',accountLimits:cap(1),tenantLimits:cap(1)});const replay=await budget.reserveManagedSMS(c,job(c));assert.equal(replay.reservedAt,first.reservedAt);await assert.rejects(()=>budget.reserveManagedSMS(c,job(c,'new')),e=>e.code==='sms_budget_exhausted');assert.equal((await store.get('managed_sms_budgets',budget.managedSMSBudgetKey())).used.messages,1);
  await assert.rejects(()=>budget.assertManagedSMSReservation(c,job(c),first),e=>e.code==='sms_budget_reservation_changed');
});
await check('Changed payload refuses reuse and changed rate bounds can only increase retained cost',async()=>{
  const c=await shop();publish([c]);const first=await budget.reserveManagedSMS(c,job(c));await assert.rejects(()=>budget.reserveManagedSMS(c,job(c,'message','Changed body')),e=>e.code==='sms_budget_message_changed');
  publish([c],{version:'synthetic_higher_upper_bound',rates:{perMessageMicros:10,perSegmentMicros:20}});await budget.reserveManagedSMS(c,job(c));let row=await store.get('managed_sms_budgets',budget.managedSMSBudgetKey());assert.equal(row.used.messages,1);assert.equal(row.used.costMicros,30);
  publish([c]);await budget.reserveManagedSMS(c,job(c));row=await store.get('managed_sms_budgets',budget.managedSMSBudgetKey());assert.equal(row.used.costMicros,30);assert.equal(first.costMicros,15);
});
await check('Outbox budget denial waits without acquiring a send-attempt marker and later exact approval resumes',async()=>{
  const c=await shop();delete process.env.MANAGED_SMS_BUDGET_POLICY_JSON;await consent.recordManagedInbound(c,{phone:'+17135550199',text:'Question',messageSid:'SM'+'1'.repeat(32)});
  const id=await delivery.queueManagedMessage(c,{eventId:'waiting-policy',channel:'sms',purpose:'reply',to:'+17135550199',body:'Synthetic reply'});let sends=0;
  const engine=delivery.createManagedDeliveryEngine({gate:()=>true,sender:async()=>({number,serviceSid:service}),provider:{send:async()=>{sends++;return{id:'SM'+'2'.repeat(32)};}}});
  let row=await engine.run(id);assert.equal(row.state,'waiting_platform');assert.equal(row.reasonCode,'sms_budget_policy_unavailable');assert.equal(row.attemptStartedAt,undefined);assert.equal(row.attempts,0);assert.equal(sends,0);
  publish([c]);row=await engine.run(id);assert.equal(row.state,'accepted');assert.equal(sends,1);assert.equal((await store.get('managed_sms_budgets',budget.managedSMSBudgetKey())).used.messages,1);
});
await check('Unknown sends retain message segments and cost reservations and never resend the same outbox intent',async()=>{
  const c=await shop();publish([c]);await consent.recordManagedInbound(c,{phone:'+17135550199',text:'Question',messageSid:'SM'+'3'.repeat(32)});
  const id=await delivery.queueManagedMessage(c,{eventId:'unknown',channel:'sms',purpose:'reply',to:'+17135550199',body:'😀'.repeat(36)});let sends=0;
  const engine=delivery.createManagedDeliveryEngine({gate:()=>true,sender:async()=>({number,serviceSid:service}),provider:{send:async()=>{sends++;throw Error('Synthetic provider committed then response lost');}}});
  await engine.run(id);const before=await store.get('managed_sms_budgets',budget.managedSMSBudgetKey());clock+=86400000;await engine.run(id);assert.equal(sends,1);assert.equal((await store.get('managed_deliveries',id)).state,'uncertain');assert.deepEqual(await store.get('managed_sms_budgets',budget.managedSMSBudgetKey()),before);assert.deepEqual(before.used,{messages:1,segments:2,costMicros:25});
});
await check('Policy revoked after reservation stops transport and leaves a resumable wait with its debit retained',async()=>{
  const c=await shop();publish([c]);await consent.recordManagedInbound(c,{phone:'+17135550199',text:'Question',messageSid:'SM'+'5'.repeat(32)});
  const id=await delivery.queueManagedMessage(c,{eventId:'late-revocation',channel:'sms',purpose:'reply',to:'+17135550199',body:'Synthetic reply'});let bindings=0,sends=0;
  const engine=delivery.createManagedDeliveryEngine({gate:()=>true,sender:async()=>{if(++bindings===2)process.env.MANAGED_SMS_BUDGET_APPROVED_VERSION='revoked';return{number,serviceSid:service};},provider:{send:async()=>{sends++;return{id:'SM'+'6'.repeat(32)};}}});
  let row=await engine.run(id);assert.equal(row.state,'waiting_platform');assert.equal(row.attemptStartedAt,null);assert.equal(row.attempts,0);assert.equal(sends,0);assert.equal((await store.get('managed_sms_budgets',budget.managedSMSBudgetKey())).used.messages,1);
  publish([c]);row=await engine.run(id);assert.equal(row.state,'accepted');assert.equal(row.detail,null);assert.equal(sends,1);assert.equal((await store.get('managed_sms_budgets',budget.managedSMSBudgetKey())).used.messages,1);
});
await check('Explicit owner setup probe retains its independent nonce/cohort budget after paid expiry',async()=>{
  const c=await shop();publish([c]);const expired=paidFixture(c,{start:Math.floor(clock/1000)-120,end:Math.floor(clock/1000)-60});await store.put('workspace_billing',expired.key,expired.row);const identity=workspaceTenant(c),operationId=c.slug+'/'+sha('messaging-v1:'+identity),numberId='PN'+'d'.repeat(32),body='Synthetic Service: reply ABCD to verify your requested setup text.',probe={nonce:'ABCD',to:c.owner.phone,body,expiresAt:'2027-12-01T00:00:00Z'};
  process.env.MESSAGING_ACTIVATION_OFFER_JSON=JSON.stringify({version:'synthetic_sms_v1',scope:'a2p_customer_care',currency:'USD',country:'US',expiresAt:'2027-12-01T00:00:00Z',brandRegistrationCents:0,campaignRegistrationCents:0,campaignMonthlyCents:0,resubmissionCents:0,maxResubmissions:0,usageDisclosure:'Synthetic test-only upper-bound usage; no live activity.',authorityText:'Synthetic test-only authority and explicit setup text consent.',feeScheduleUrl:'https://example.test/synthetic'});process.env.MESSAGING_ACTIVATION_ENABLED='true';process.env.MESSAGING_ACTIVATION_APPROVED_VERSION='synthetic_sms_v1';
  await store.put('phone_activation_intents',c.slug+'/'+sha('first-phone-acquisition:'+identity),{slug:c.slug,tenantIdentity:identity,state:'number_acquired',resource:{id:numberId,number}});
  await store.put('messaging_activation',operationId,{id:operationId,slug:c.slug,tenantIdentity:identity,state:'awaiting_test',number:{sid:numberId,number},resources:{service:{sid:service}},authority:{testPhoneConsent:true},probe});
  const id=await delivery.queueManagedMessage(c,{eventId:'probe-test',channel:'sms',purpose:'activation_probe',to:c.owner.phone,body,probe:{operationId,nonce:'ABCD',expiresAt:probe.expiresAt}});let sends=0;
  globalThis.fetch=async(input,init)=>{assert.equal(String(input),`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages.json`);assert.equal(init.method,'POST');assert.equal((await store.get('managed_sms_budgets',budget.managedSMSBudgetKey())).used.messages,1);sends++;return Response.json({sid:'SM'+'4'.repeat(32),status:'sent',date_created:new Date().toISOString()});};
  await delivery.runManagedDelivery({limit:10,discoveryLimit:0});globalThis.fetch=deny;assert.equal(sends,1);assert.equal((await store.get('managed_deliveries',id)).state,'accepted');
});
const result={ok:true,mode:'Synthetic cumulative account/tenant cost policy and intercepted actual outbox; rates are test upper-bound assumptions, not provider pricing',passed:checks.length,checks,sourceBefore:before,sourceAfter:await hashes(),physicalRequests:0};assert.deepEqual(result.sourceAfter,before);
const output=process.argv.indexOf('--output');if(output>=0)await writeFile(process.argv[output+1],JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
