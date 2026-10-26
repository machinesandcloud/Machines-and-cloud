// Regression for an ordinary provider start winning an initial-preparation client CAS.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
let physicalAttempts=0,revision=0,hold=null,loseFence=false;
const deny=()=>{physicalAttempts++;throw new Error('Preparation CAS prohibits physical network');};
net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
for(const key of Object.keys(process.env))if(/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|MC_TWILIO_|MC_MESSAGING_)/.test(key))delete process.env[key];
Object.assign(process.env,{MC_MEMORY_STORE:'0',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:'http://127.0.0.1:8939',PUBLIC_SITE_URL:'http://127.0.0.1:8939'});
const rows=new Map();
globalThis.fetch=async(input,init={})=>{
 const url=new URL(String(input));if(url.origin!=='https://preparation-blobs.invalid')return deny();
 const [,site,kind,...parts]=url.pathname.split('/').map(decodeURIComponent),key=parts.join('/'),name=kind+'/'+key,method=(init.method||'GET').toUpperCase();assert.equal(site,'offline-site');
 if(hold && hold.match({kind,key,method,init})){const current=hold;hold=null;current.enter();await current.release;}
 const previous=rows.get(name),headers=new Headers(init.headers);
 if(method==='GET'&&!key)return Response.json({blobs:[...rows.keys()].filter(id=>id.startsWith(kind+'/'+(url.searchParams.get('prefix')||''))).map(id=>({key:id.slice(kind.length+1)})),directories:[]});
 if(method==='GET')return previous?new Response(previous.value,{headers:{etag:previous.etag,'content-type':'application/json'}}):new Response(null,{status:404});
 if(method==='DELETE'){rows.delete(name);return new Response(null,{status:204});}
 assert.equal(method,'PUT');
 if(headers.get('if-none-match')==='*'&&previous || headers.has('if-match')&&headers.get('if-match')!==previous?.etag)return new Response(null,{status:412});
 const etag=String(++revision);rows.set(name,{etag,value:init.body});
 if(false){loseFence=false;return new Response('Lost fence response',{status:400});}
 return new Response(null,{headers:{etag}});
};
const {setEnvironmentContext}=await import('@netlify/blobs');setEnvironmentContext({siteID:'offline-site',token:'offline-token',edgeURL:'https://preparation-blobs.invalid',uncachedEdgeURL:'https://preparation-blobs.invalid'});

process.env.PLATFORM_DATA_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
const store=await import('../netlify/functions/lib/store.mjs'),{newClient,parseHours}=await import('../netlify/functions/lib/config.mjs'),{accessHash}=await import('../netlify/functions/lib/access.mjs'),{configurationRevision}=await import('../netlify/functions/lib/setup.mjs'),intake=await import('../netlify/functions/lib/service-intake.mjs'),onboarding=await import('../netlify/functions/lib/service-onboarding.mjs');
const handler=(await import('../netlify/functions/client.mjs')).default;
const bearer=createHash('sha256').update('intake-cas-owner').digest('hex'),sessionHash=accessHash(bearer);
async function fixture(){rows.clear();const c=newClient({slug:'intake-cas',ownerKey:'private-fixture-key',owner:{name:'Alex Owner',email:'intake-cas@example.test',phone:'+17135550142'},business:{name:'Fixture Air',trade:'HVAC',serviceArea:['Houston'],hours:'Mon-Fri 8am-5pm'}});Object.assign(c,{status:'testing',onboarding:{version:1,verifiedEmail:c.owner.email,desiredChannels:['voice']},channels:{web:{active:false}},build:{status:'built'},services:['AC repair']});c.rules.hours=parseHours(c.business.hours);c.setupProof={reviewedRevision:configurationRevision(c),testedRevision:configurationRevision(c),testMode:'live'};await store.put('clients',c.slug,c);const session={email:c.owner.email,sessionHash,scope:'onboarding',status:'active',expiresAt:new Date(Date.now()+3600000).toISOString()};await store.put('access_sessions',sessionHash,session);return {c,session};}
async function call(c,body){const r=await handler(new Request(process.env.URL+'/api/client?c='+c.slug,{method:'POST',headers:{origin:process.env.URL,authorization:'Bearer '+bearer,'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
function held(match){let enter,release;const entered=new Promise(r=>enter=r),blocked=new Promise(r=>release=r);hold={match,enter,release:blocked};return {entered,release};}
function engine(){const previous=process.env.MC_MEMORY_STORE;process.env.MC_MEMORY_STORE='1';try{return onboarding.createServiceOnboardingEngine({statuses:async()=>({number:{available:true,offer:{version:'number-v1',digest:'1'.repeat(64),authorityText:'Synthetic number authority'}},voice:{available:true,offer:{version:'voice-v1',digest:'2'.repeat(64),authorityText:'Synthetic voice authority'}},messaging:{available:false}})});}finally{process.env.MC_MEMORY_STORE=previous;}}
const results=[];
{
 const {c,session}=await fixture(),first=await intake.serviceIntakeView(c),saved=await call(c,{action:'save_service_intake',expectedIntakeToken:first.token,submissionId:'a'.repeat(32),service:'voice',section:'routing',fields:{forwardingMode:'use_new_number',ownerPhone:'+17135550148'}});assert.equal(saved.status,200);
 const current=await store.get('clients',c.slug),plan=await engine().status(current),body={actor:{role:'owner',email:c.owner.email},expectedRevision:configurationRevision(current),submissionId:'b'.repeat(32),offerDigest:plan.offer.digest,acceptedChannels:['voice'],acceptedCosts:true,authority:true,forwardingMode:'use_new_number'};
 let fences=0;const options={beforeAdmission:async client=>{fences++;await intake.fenceServiceIntake(client,session,['voice'],body.expectedRevision);}};
 await assert.rejects(engine().request(current,{...body,acceptedCosts:false},options));assert.equal(fences,0);assert.equal((await intake.serviceIntakeView(await store.get('clients',c.slug))).voice.canApply,true);
 const wait=held(({kind,method,init})=>kind.endsWith('clients')&&method==='PUT'&&JSON.parse(init.body).management?.serviceIntake?.lastReceipt?.state==='applied');
 const pending=call(c,{action:'apply_service_intake',expectedIntakeToken:saved.body.serviceIntake.token,submissionId:'c'.repeat(32),service:'voice'});await wait.entered;
 await engine().request(current,body,options);assert.equal(fences,1);wait.release();const outcome=await pending;assert.equal(outcome.status,409);assert.equal((await store.get('clients',c.slug)).owner.phone,c.owner.phone);
 results.push({name:'Validated admission fences held routing apply; invalid authority does not fence',pass:true});
}
{
 const {c,session}=await fixture(),wait=held(({kind,key,method})=>kind.endsWith('clients')&&key===c.slug&&method==='GET');
 const pending=intake.readServiceIntake(c,session);await wait.entered;await store.put('clients',c.slug,{...c,ownerKey:'rotated-owner-key'});wait.release();await assert.rejects(pending,e=>e.code==='intake_changed');
 results.push({name:'Explicit private form read revalidates tenant after awaited draft work',pass:true});
}
{
 const {c,session}=await fixture();let sessionReads=0;const wait=held(({kind,key,method})=>kind.endsWith('access_sessions')&&key===sessionHash&&method==='GET'&&++sessionReads===2);
 const pending=intake.readServiceIntake(c,session);await wait.entered;await store.put('access_sessions',sessionHash,{...session,status:'revoked'});wait.release();await assert.rejects(pending,e=>e.code==='verification_required');
 results.push({name:'Explicit private form read revalidates session before plaintext response',pass:true});
}
assert.equal(physicalAttempts,0);console.log(JSON.stringify({passed:results.length,total:results.length,physicalAttempts,mode:'Actual conditional Blobs SDK with synthetic storage transport; approved fixture coordinator statuses; no provider adapters',checks:results},null,2));
