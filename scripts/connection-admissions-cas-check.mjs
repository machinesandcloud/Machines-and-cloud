// Actual client handler and conditional Blobs protocol; no physical networking.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const denied = () => { throw new Error('connection-admissions-cas-check denies physical networking'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = denied;
syncBuiltinESMExports();
for (const name of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|CALENDAR_|MANAGED_|PHONE_ACQUISITION|SERVICE_WORKER)/.test(name)) delete process.env[name];
Object.assign(process.env, { MC_MEMORY_STORE:'0', MC_FAKE_MODEL:'1', NODE_ENV:'test', PUBLIC_SITE_URL:'http://127.0.0.1:8888', URL:'http://127.0.0.1:8888' });
const blobs = new Map();
let revision=0, requests=0, externalRequests=0, fault=null, hold=null, hook=null, afterHook=null;
globalThis.fetch = async (input, init={}) => {
 const url=new URL(String(input));
 if(url.origin!=='https://visits-blobs.invalid'){externalRequests++;return denied();}
 requests++; const [,site,kind,...parts]=url.pathname.split('/').map(decodeURIComponent), key=parts.join('/'), name=`${kind}/${key}`, method=(init.method||'GET').toUpperCase(); assert.equal(site,'offline-site');
 if(hold && hold.match({kind,key,method,init})){const captured=hold;hold=null;captured.enter();await captured.release;}
 if(hook && hook.match({kind,key,method,init})){const captured=hook;hook=null;await captured.run();}
 if(method==='GET' && !key)return Response.json({blobs:[...blobs.keys()].filter(k=>k.startsWith(kind+'/'+(url.searchParams.get('prefix')||''))).map(k=>({key:k.slice(kind.length+1)})),directories:[]});
 const current=blobs.get(name), headers=new Headers(init.headers);
 if(method==='GET')return current?new Response(current.value,{headers:{etag:current.etag,'content-type':'application/json'}}):new Response(null,{status:404});
 if(method==='DELETE'){blobs.delete(name);return new Response(null,{status:204});}
 assert.equal(method,'PUT');
 if(headers.get('if-none-match')==='*'&&current || headers.has('if-match')&&headers.get('if-match')!==current?.etag)return new Response(null,{status:412});
 if(fault && fault.match({kind,key,method,init}) && fault.mode==='before'){fault=null;return new Response('Injected write refusal',{status:400});}
 const etag=String(++revision);blobs.set(name,{value:init.body,etag});
 if(afterHook&&afterHook.match({kind,key,method,init})){const captured=afterHook;afterHook=null;await captured.run();}
 if(fault && fault.match({kind,key,method,init})){fault=null;return new Response('Injected response loss after commit',{status:400});}
 return new Response(null,{headers:{etag}});
};
const {setEnvironmentContext}=await import('@netlify/blobs');
setEnvironmentContext({siteID:'offline-site',token:'offline-token',edgeURL:'https://visits-blobs.invalid',uncachedEdgeURL:'https://visits-blobs.invalid'});
Object.assign(process.env,{TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),VAPI_API_KEY:'synthetic-vapi-credential',PLATFORM_DATA_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')});
const store = await import('../netlify/functions/lib/store.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const mod = await import('../netlify/functions/lib/service-onboarding.mjs');
const scheduler = await import('../netlify/functions/service-onboarding-scheduler.mjs');
const sourcePath='netlify/functions/lib/service-onboarding.mjs', sourceBefore=await readFile(sourcePath), schedulerPath='netlify/functions/service-onboarding-scheduler.mjs', schedulerBefore=await readFile(schedulerPath), hash=x=>createHash('sha256').update(x).digest('hex');
let n=0, submissionSerial=0, clock=Date.parse('2026-10-22T20:00:00Z');
const iso=()=>new Date(clock).toISOString(), groups=[];
const kinds={number:'phone_activation_intents',voice:'voice_activation_intents',sms:'messaging_activation'};
const legal={ legalName:'Synthetic Test LLC',ein:'12-3456789',businessType:'llc',businessIndustry:'PROFESSIONAL_SERVICES',street:'100 Test Road',street2:'',city:'Houston',state:'TX',zip:'77001',website:'https://synthetic.example.invalid', representative:{firstName:'Test',lastName:'Representative',email:'representative@synthetic.example.invalid',phone:'+17135550148',title:'Owner',jobPosition:'CEO'} };
async function check(name, fn) { try { for(const kind of ['service_onboarding_intents','service_onboarding_queue',...Object.values(kinds),'health'])for(const key of await store.list(kind))await store.del(kind,key);await fn(); groups.push({name,ok:true}); } catch(error) { groups.push({name,ok:false,error:error.code || error.name,message:error.message}); } }
async function fixture(selected=['voice','sms']) {
  const slug='setup-check-'+(++n), c=newClient({slug,ownerKey:'synthetic-private-'+n,owner:{name:'Synthetic Owner',email:`owner${n}@synthetic.example.invalid`,phone:'+17135550147'},business:{name:'Synthetic Test LLC',trade:'Plumbing',serviceArea:['Houston'],hours:'Mon to Fri 8 to 5'}});
  c.onboarding={version:1,verifiedEmail:c.owner.email,desiredChannels:selected};c.status='testing';c.build={status:'built',source:'owner_answers'};c.services=['Drain service'];c.phone.businessNumber='+17135550146';
  c.setupProof={reviewedRevision:configurationRevision(c),testedRevision:configurationRevision(c),testMode:'live'};await store.saveClient(c);
  const tenant=hash(JSON.stringify([c.slug,c.ownerKey,c.owner.email])), ids={number:`${slug}/${hash('first-phone-acquisition:'+tenant)}`,voice:`${slug}/${hash('managed-voice-v1:'+tenant)}`,sms:`${slug}/${hash('messaging-v1:'+tenant)}`};
  const gates={number:true,voice:true,sms:true}, counts={number:0,voice:0,sms:0}, cancels={number:0,voice:0,sms:0};
  const offers={number:{version:'number_check_v1',digest:hash('number1'),oneTimeCents:0,monthlyCents:115,authorityText:'Synthetic number authority'},voice:{version:'voice_check_v1',digest:hash('voice1'),usageDisclosure:'Synthetic usage disclosure',authorityText:'Synthetic voice authority'},messaging:{version:'sms_check_v1',digest:hash('sms1'),authorityText:'Synthetic SMS authority'},program:{digest:hash('program1'),description:'Synthetic program'}};
  const readChild=(kind,id)=>store.get(kinds[kind],id);
  const statuses=async()=>{
    const rows=Object.fromEntries(await Promise.all(Object.keys(kinds).map(async kind=>[kind,await readChild(kind,ids[kind])])));
    const dto=kind=>rows[kind]?{id:rows[kind].id,state:rows[kind].state,active:rows[kind].verified===true,cancellationRequested:!!rows[kind].cancelRequestedAt,releaseConfirmed:!!rows[kind].releasedAt}:null;
    return {number:{available:gates.number,offer:offers.number,operation:dto('number')},voice:{available:gates.voice,offer:offers.voice,operation:dto('voice'),state:rows.voice?.state,active:rows.voice?.verified===true},messaging:{available:gates.sms,offer:offers.messaging,program:offers.program,operation:dto('sms'),state:rows.sms?.state,active:rows.sms?.verified===true}};
  };
  async function saveChild(kind,client,body) {
    counts[kind]++;
    const common={version:1,id:ids[kind],slug,tenantIdentity:tenant,inputRevision:body.expectedRevision,createdAt:iso(),state:'queued',providerAccountSid:process.env.TWILIO_ACCOUNT_SID};
    const value=kind==='number'?{...common,offerDigest:body.offerDigest,authority:{actor:body.actor,costsAccepted:true,authorityAccepted:true}}:kind==='voice'?{...common,policyDigest:body.policyDigest,authority:{actor:body.actor,acceptedAuthority:true}}:{...common,offerDigest:body.offerDigest,programDigest:body.programDigest,inputHash:hash(JSON.stringify({legal:body.legal,program:offers.program})),authority:{actorEmail:body.actor.email,customerAuthority:true,costsAccepted:true}};
    await store.atomicUpdate(kinds[kind],ids[kind],old=>old?{result:old}:{value,result:value});return value;
  }
  const options={statuses,readChild,now:()=>clock,requestNumber:(client,body)=>saveChild('number',client,body),requestVoice:(client,body)=>saveChild('voice',client,body),requestMessaging:(client,body)=>saveChild('sms',client,body),
    cancelNumber:async(client,id)=>{cancels.number++;await store.atomicUpdate(kinds.number,id,row=>({value:{...row,cancelRequestedAt:iso(),state:'cleanup_pending'}}));},
    cancelVoice:async()=>{cancels.voice++;await store.atomicUpdate(kinds.voice,ids.voice,row=>({value:{...row,cancelRequestedAt:iso(),state:'cleanup_pending'}}));},
    cancelMessaging:async()=>{cancels.sms++;await store.atomicUpdate(kinds.sms,ids.sms,row=>({value:{...row,cancelRequestedAt:iso(),state:'cancel_pending'}}));}};
  const engine=()=>{const priorMode=process.env.MC_MEMORY_STORE;process.env.MC_MEMORY_STORE='1';try{return mod.createServiceOnboardingEngine(options);}finally{process.env.MC_MEMORY_STORE=priorMode;}}, body=async()=>({actor:{role:'owner',email:c.owner.email},expectedRevision:configurationRevision(await store.get('clients',slug)),submissionId:hash('submission:'+slug+':'+(++submissionSerial)),offerDigest:(await engine().status(await store.get('clients',slug))).offer.digest,acceptedCosts:true,authority:true,...(selected.includes('voice')?{forwardingMode:'forward_business_line'}:{}),...(selected.includes('sms')?{legal:structuredClone(legal),attestLegalAccuracy:true,attestConsent:true,testPhoneConsent:true}:{})});
  const accept=async()=>engine().request(await store.get('clients',slug),await body());
  const run=()=>engine().continue(c,{deadlineAt:clock+12000});
  const acquired=()=>store.atomicUpdate(kinds.number,ids.number,row=>({value:{...row,state:'number_acquired',resource:{id:'PN'+'2'.repeat(32),number:'+17135550145',accountSid:process.env.TWILIO_ACCOUNT_SID}}}));
  const cancel=()=>engine().cancel(c,{actor:{role:'owner',email:c.owner.email},expectedRevision:configurationRevision(c),operationId:`${slug}/${hash('service-onboarding-v1:'+tenant)}`});
  const update=async fn=>{const current=await store.get('clients',slug);fn(current);await store.saveClient(current);return current;};
  return {c,slug,tenant,ids,gates,counts,cancels,offers,options,engine,body,accept,run,acquired,cancel,update,readChild};
}
async function approve(f,expectedScope){const view=await f.engine().status(await store.get('clients',f.slug));assert.equal(view.available,true);assert.deepEqual(view.offer.scopeChannels,expectedScope);const body={actor:{role:'owner',email:f.c.owner.email},expectedRevision:configurationRevision(await store.get('clients',f.slug)),submissionId:hash('scope-'+(++submissionSerial)),acceptedChannels:[...view.offer.scopeChannels],offerDigest:view.offer.digest,acceptedCosts:true,authority:true,...(expectedScope.includes('voice')?{forwardingMode:'forward_business_line'}:{}),...(expectedScope.includes('sms')?{legal:structuredClone(legal),attestLegalAccuracy:true,attestConsent:true,testPhoneConsent:true}:{})};return {body,row:await f.engine().request(f.c,body),view};}

function held(match){let enter,release;const entered=new Promise(resolve=>enter=resolve),releasePromise=new Promise(resolve=>release=resolve);hold={match,enter,release:releasePromise};return {entered,release};}
async function smsBody(f){const view=await f.engine().status(f.c);assert.deepEqual(view.offer.scopeChannels,['sms']);return {actor:{role:'owner',email:f.c.owner.email},expectedRevision:configurationRevision(f.c),submissionId:hash('cas-sms-'+(++submissionSerial)),acceptedChannels:['sms'],offerDigest:view.offer.digest,acceptedCosts:true,authority:true,legal:structuredClone(legal),attestLegalAccuracy:true,attestConsent:true,testPhoneConsent:true};}
async function voiceReady(){const f=await fixture();f.gates.sms=false;const a=await approve(f,['voice']);await f.run();await f.acquired();await f.run();await store.atomicUpdate(kinds.voice,f.ids.voice,row=>({value:{...row,state:'ready',verified:true}}));await f.run();f.gates.sms=true;return {f,a};}
await check('Lost queue extension response is recovered from the same approval with existing child receipts',async()=>{const {f,a}=await voiceReady(),body=await smsBody(f);fault={mode:'after',match:({kind,method,init})=>kind.endsWith('service_onboarding_queue')&&method==='PUT'&&JSON.parse(init.body).intents[a.row.id]?.admission.admissionSequence===2};await assert.rejects(()=>f.engine().request(f.c,body));const replay=await f.engine().request(f.c,body);assert.deepEqual(replay.acceptedChannels,['voice','sms']);await f.run();assert.deepEqual(f.counts,{number:1,voice:1,sms:1});assert.equal((await store.get('service_onboarding_intents',a.row.id)).admissions.length,2);});
await check('Lost primary extension acknowledgment never duplicates approval or the common number',async()=>{const {f,a}=await voiceReady(),body=await smsBody(f);fault={mode:'after',match:({kind,method,init})=>kind.endsWith('service_onboarding_intents')&&method==='PUT'&&JSON.parse(init.body).admissionSequence===2};await assert.rejects(()=>f.engine().request(f.c,body));assert.deepEqual((await f.engine().request(f.c,body)).acceptedChannels,['voice','sms']);await f.run();assert.deepEqual(f.counts,{number:1,voice:1,sms:1});assert.equal((await store.get('service_onboarding_intents',a.row.id)).admissions.length,2);});
await check('Cancellation between queue authority and primary extension remains durable and starts no new SMS child',async()=>{const {f,a}=await voiceReady(),body=await smsBody(f);afterHook={match:({kind,method,init})=>kind.endsWith('service_onboarding_queue')&&method==='PUT'&&JSON.parse(init.body).intents[a.row.id]?.admission.admissionSequence===2,run:()=>f.cancel()};const out=await f.engine().request(f.c,body);assert.equal(out.cancellationRequested,true);await f.run();assert.equal(f.counts.sms,0);assert.equal(f.cancels.number,1);assert.equal(f.cancels.voice,1);assert.ok((await store.get('service_onboarding_queue','active_v1')).intents[a.row.id].cancelRequestedAt);});
await check('A delayed old queue retirement cannot remove an independently committed later channel admission',async()=>{const f=await fixture();f.gates.sms=false;const a=await approve(f,['voice']);await f.run();await f.acquired();await f.run();await store.atomicUpdate(kinds.voice,f.ids.voice,row=>({value:{...row,state:'ready',verified:true}}));const wait=held(({kind,method,init})=>kind.endsWith('service_onboarding_queue')&&method==='PUT'&&!JSON.parse(init.body).intents[a.row.id]);const old=f.run();await wait.entered;f.gates.sms=true;await approve(f,['sms']);wait.release();await old;assert.ok((await store.get('service_onboarding_queue','active_v1')).intents[a.row.id]);assert.equal((await store.get('service_onboarding_intents',a.row.id)).admissionSequence,2);await f.run();assert.deepEqual(f.counts,{number:1,voice:1,sms:1});});
await check('A delayed old active status cannot overwrite the next admission after its old claim expires',async()=>{const f=await fixture();f.gates.sms=false;const a=await approve(f,['voice']);await f.run();await f.acquired();await f.run();await store.atomicUpdate(kinds.voice,f.ids.voice,row=>({value:{...row,state:'ready',verified:true}}));const previous=f.options.statuses;let injected=false;f.options.statuses=async(...args)=>{const result=await previous(...args),raw=await store.get('service_onboarding_intents',a.row.id);if(!injected&&raw.claim&&raw.steps.voice?.acknowledgedAt){injected=true;clock+=31000;f.gates.sms=true;f.options.statuses=previous;await approve(f,['sms']);}return result;};await f.run();assert.equal(injected,true);const row=await store.get('service_onboarding_intents',a.row.id);assert.equal(row.admissionSequence,2);assert.notEqual(row.state,'active');assert.ok((await store.get('service_onboarding_queue','active_v1')).intents[a.row.id]);await f.run();assert.deepEqual(f.counts,{number:1,voice:1,sms:1});clock-=31000;});
await check('A cancellation winning a held primary extension CAS is preserved by its retry',async()=>{const {f,a}=await voiceReady(),body=await smsBody(f),wait=held(({kind,method,init})=>kind.endsWith('service_onboarding_intents')&&method==='PUT'&&JSON.parse(init.body).admissionSequence===2);const pending=f.engine().request(f.c,body);await wait.entered;await f.cancel();wait.release();const out=await pending;assert.equal(out.cancellationRequested,true);await f.run();assert.equal(f.counts.sms,0);assert.ok((await store.get('service_onboarding_intents',a.row.id)).cancelRequestedAt);});
await check('Held old child response cannot acknowledge into a replacement lease and later channel admission',async()=>{const f=await fixture();f.gates.sms=false;const a=await approve(f,['voice']);await f.run();await f.acquired();const original=f.options.requestVoice;let enter,release;const entered=new Promise(resolve=>enter=resolve),blocked=new Promise(resolve=>release=resolve);f.options.requestVoice=async(...args)=>{const receipt=await original(...args);enter();await blocked;return receipt;};const old=f.run();await entered;clock+=31000;f.options.requestVoice=original;await store.atomicUpdate(kinds.voice,f.ids.voice,row=>({value:{...row,state:'ready',verified:true}}));await f.run();f.gates.sms=true;await approve(f,['sms']);const before=await store.get('service_onboarding_intents',a.row.id);assert.equal(before.admissionSequence,2);release();const out=await old;assert.equal(out.staleWorker,true);assert.deepEqual(await store.get('service_onboarding_intents',a.row.id),before);assert.ok((await store.get('service_onboarding_queue','active_v1')).intents[a.row.id]);await f.run();assert.deepEqual(f.counts,{number:1,voice:1,sms:1});clock-=31000;});
assert.equal(externalRequests,0);
const sourceAfter=await readFile(sourcePath),checkSource=await readFile(new URL(import.meta.url));
console.log(JSON.stringify({ok:groups.every(g=>g.ok),groups,passed:groups.filter(g=>g.ok).length,total:groups.length,sourceStable:hash(sourceBefore)===hash(sourceAfter),sourceHashes:{[sourcePath]:hash(sourceAfter),'scripts/connection-admissions-cas-check.mjs':hash(checkSource)},conditionalStorageRequests:requests,physicalNetworkRequests:0,mode:'actual conditional Blobs SDK with synthetic transport; fixture engine constructed only under isolated test guard; no provider transport',providerDeliveryAcceptance:false},null,2));
if(groups.some(g=>!g.ok))process.exitCode=1;
