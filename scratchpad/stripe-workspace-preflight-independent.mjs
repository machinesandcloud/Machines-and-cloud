// Actual owner DTOs backed by synthetic memory records. No live readiness claim.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
let physical=0;const deny=()=>{physical++;throw Error('Physical transport/subprocess denied');};net.connect=net.createConnection=http.get=http.request=https.get=https.request=child.spawn=child.exec=child.execFile=child.execFileSync=deny;globalThis.fetch=deny;syncBuiltinESMExports();
for(const name of Object.keys(process.env))if(/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|MC_PLATFORM_|MC_SELF_SERVICE_AI_|VAPI_|THUMBTACK_|RESEND_|GOOGLE_|STRIPE_|WORKSPACE_BILLING_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|NETLIFY_)/.test(name))delete process.env[name];
Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'0',ANTHROPIC_API_KEY:'local-synthetic-never-dispatched',URL:'https://machinesandcloud.com',PUBLIC_SITE_URL:'https://machinesandcloud.com'});
const {verifyPublicWorkspace,PublicProofGuard,PUBLIC_ORIGIN,PUBLIC_WORKSPACE_WEBSITE}=await import('../scripts/lib/stripe-public-proof.mjs');
const {preflightPublicWorkspace,cleanupPublicProof}=await import('../scripts/lib/stripe-public-execution.mjs');
const store=await import('../netlify/functions/lib/store.mjs'),{newClient}=await import('../netlify/functions/lib/config.mjs'),{workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs'),{configurationRevision}=await import('../netlify/functions/lib/setup.mjs'),{websiteActionId}=await import('../netlify/functions/lib/website-installation.mjs');
const owner=(await import('../netlify/functions/client.mjs')).default;
const sha=value=>createHash('sha256').update(value).digest('hex'),NOW=Date.now(),at=offset=>new Date(NOW+offset).toISOString();
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:null;if(output)assert(!existsSync(output));
const files=['scripts/lib/stripe-public-proof.mjs','scripts/lib/stripe-public-execution.mjs','scratchpad/stripe-workspace-preflight-independent.mjs','netlify/functions/client.mjs','netlify/functions/lib/setup.mjs','netlify/functions/lib/owner-test.mjs','netlify/functions/lib/website-installation.mjs'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(readFileSync(file))]));const report={scope:'Independent actual owner-handler readiness/source preflight using synthetic records and denied physical transport. No hosted readiness or Stripe delivery acceptance.',before:hashes(),checks:[],physicalAttempts:0};
let serial=0;
async function fixture(){
 const slug='preflight-'+ ++serial,bearer=sha('session'+slug),phaseId='preflight_phase_'+serial,website=PUBLIC_WORKSPACE_WEBSITE.origin+PUBLIC_WORKSPACE_WEBSITE.path+'?client='+slug+'&phase='+phaseId;
 const c=newClient({slug,ownerKey:'synthetic-'+slug,owner:{name:'Internal TEST',email:slug+'@example.test',phone:'+17135550142'},business:{name:'Internal TEST',trade:'Plumbing',website,serviceArea:['Katy'],hours:'Mon to Fri 8 to 5'}});
 Object.assign(c,{createdAt:at(-60000),onboarding:{version:1,desiredChannels:['web']},status:'live',build:{status:'built'},services:['Leak repairs'],channels:{web:{active:true}},widget:{allowedOrigins:[PUBLIC_WORKSPACE_WEBSITE.origin]}});
 const revision=configurationRevision(c);c.setupProof={reviewedRevision:revision,testedRevision:revision,reviewedAt:at(-50000),testedAt:at(-45000),testMode:'live'};await store.put('clients',slug,c);const tenant=workspaceTenant(c),sessionHash=sha(bearer);
 await store.put('access_sessions',sessionHash,{scope:'onboarding',email:c.owner.email,status:'active',expiresAt:at(3600000)});
 const checkId='a'.repeat(32),turnId='b'.repeat(32),actionId=websiteActionId({tenant,checkId,turnId},'leads');
 const setupRecord=await store.createRecordOnce('leads',slug,{id:actionId.slice(0,32),createdAt:at(-30000),channel:'web',contact:'websitecheck_'+checkId,status:'open',delivery:{tenantIdentity:tenant},managedActionId:actionId,websiteSetupCheck:{checkId,turnId,origin:PUBLIC_WORKSPACE_WEBSITE.origin}});
 const ordinary=await store.createRecordOnce('leads',slug,{id:'c'.repeat(32),createdAt:at(-20000),channel:'web',contact:'wordinarytest123',status:'open',delivery:{tenantIdentity:tenant}});
 const ref=row=>({kind:'leads',id:row.id,createdAt:row.createdAt});
 await store.put('website_installations',slug+'/'+tenant,{version:1,tenant,attempt:{id:checkId,sessionHash,challengeHash:sha('synthetic-challenge'),origin:PUBLIC_WORKSPACE_WEBSITE.origin,website,revision,createdAt:at(-40000),expiresAt:at(600000),contact:'websitecheck_'+checkId,observedAt:at(-35000),turns:{[turnId]:{id:turnId,state:'acknowledged',record:ref(setupRecord),acknowledgedAt:at(-25000)}}},firstExternalRequest:{at:ordinary.createdAt,origin:PUBLIC_WORKSPACE_WEBSITE.origin,record:ref(ordinary)}});
 const packet={phaseId,expiresAt:at(3600000),owner:{slug,tenantIdentity:tenant,email:c.owner.email,bearer}},receipt={siteRequests:[]},guard=new PublicProofGuard(packet,{budget:{reserve:()=>{throw Error('No Stripe reservation during preflight');}},report:receipt,save:()=>{}}),requests=[];
 const runtimeHashes=Object.fromEntries(['desk.js','desk-billing.js','desk.css'].map(file=>[file,sha(readFileSync(file))]));
 const transport=async(url,init={})=>{requests.push({path:new URL(url).pathname,method:init.method||'GET'});assert.equal(new URL(url).origin,PUBLIC_ORIGIN);assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');if(new URL(url).pathname==='/api/client')return owner(new Request(url,init));return new Response(readFileSync(new URL(url).pathname.slice(1)),{status:200});};
 const dto=async()=>{const response=await owner(new Request(PUBLIC_ORIGIN+'/api/client?c='+slug,{headers:{Origin:PUBLIC_ORIGIN,Authorization:'Bearer '+bearer}}));assert.equal(response.status,200);return response.json();};
 return {c,packet,receipt,guard,requests,runtimeHashes,transport,dto,run:options=>preflightPublicWorkspace({packet,guard,fetch:transport,save:()=>{},runtimeHashes,sha,now:()=>NOW,...options})};
}

async function check(name,fn){try{await fn();report.checks.push({name,pass:true});}catch(error){report.checks.push({name,pass:false,error:error.stack});}}
async function changedOrigins(f,origins){let c=await store.get('clients',f.c.slug);c.widget={...c.widget,allowedOrigins:origins};const rev=configurationRevision(c);c.setupProof={...c.setupProof,reviewedRevision:rev,testedRevision:rev};await store.put('clients',c.slug,c);const key=c.slug+'/'+f.packet.owner.tenantIdentity,install=await store.get('website_installations',key);await store.put('website_installations',key,{...install,attempt:{...install.attempt,revision:rev}});return c;}
async function noReady(f,override={},expected){let nextStage=0;await assert.rejects((async()=>{await f.run(override);nextStage++;})(),expected);assert.equal(nextStage,0);}
await check('Actual authenticated DTO and installed current owned records produce four guarded read receipts with PII-free evidence',async()=>{
 const f=await fixture(),dto=await f.dto();assert.deepEqual(dto.client.widget.allowedOrigins,[PUBLIC_WORKSPACE_WEBSITE.origin]);const result=await f.run();assert.equal(f.requests.length,4);assert.deepEqual(f.requests.map(r=>r.path),['/api/client','/desk.js','/desk-billing.js','/desk.css']);assert(f.receipt.siteRequests.every(r=>r.state==='confirmed'));assert.equal(result.tenantIdentity,f.packet.owner.tenantIdentity);assert.equal(result.phaseId,f.packet.phaseId);assert.equal(result.ordinaryRequest.id,'c'.repeat(32));assert(!JSON.stringify(result).includes(f.packet.owner.bearer));assert(!JSON.stringify(result).includes(f.packet.owner.email));
});
await check('Coherent actual current workspace with an extra allowed origin violates this exactly-one-Zari proof cohort',async()=>{
 const f=await fixture();await changedOrigins(f,[PUBLIC_WORKSPACE_WEBSITE.origin,'https://other-controlled.example.test']);const dto=await f.dto();assert.equal(dto.configurationRevision,dto.client.setupProof.reviewedRevision);assert.equal(dto.configurationRevision,dto.client.setupProof.testedRevision);assert.equal(dto.websiteInstallation.observation.state,'found');await noReady(f);assert.equal(f.requests.length,1);
});
await check('Coherent duplicate allowed-origin declarations are rejected before assets/Stripe',async()=>{
 const f=await fixture();await changedOrigins(f,[PUBLIC_WORKSPACE_WEBSITE.origin,PUBLIC_WORKSPACE_WEBSITE.origin]);await noReady(f);assert.equal(f.requests.length,1);
});
await check('Actual paused or inactive service remains unready without fabricating a proof or activating it',async()=>{
 for(const change of [{status:'paused'},{channels:{web:{active:false}}}]){const f=await fixture(),c=await store.get('clients',f.c.slug);await store.put('clients',c.slug,{...c,...change});await noReady(f);assert.equal(f.requests.length,1);assert.deepEqual((await store.get('clients',c.slug)).status,change.status||c.status);}
});
await check('Actual revoked session and replacement tenant fail before any served asset or provider admission',async()=>{
 for(const mode of ['revoke','replace']){const f=await fixture();if(mode==='revoke'){const key=sha(f.packet.owner.bearer),old=await store.get('access_sessions',key);await store.put('access_sessions',key,{...old,status:'revoked'});}else{const c=await store.get('clients',f.c.slug);await store.put('clients',c.slug,{...c,ownerKey:'replacement-tenant-key'});}await noReady(f);assert.equal(f.requests.length,1);}
});
await check('Actual business edit invalidates old reviewed/practised/install snapshots without reseeding them',async()=>{
 const f=await fixture(),c=await store.get('clients',f.c.slug);await store.put('clients',c.slug,{...c,services:['New saved service']});await noReady(f);assert.equal(f.requests.length,1);const after=await store.get('clients',c.slug);assert.notEqual(configurationRevision(after),after.setupProof.reviewedRevision);
});
await check('Missing retained ordinary request cannot be replaced by a stale received flag',async()=>{
 const f=await fixture();await store.del('leads',f.c.slug+'/'+'c'.repeat(32));await noReady(f);assert.equal(f.requests.length,1);
});
await check('Setup/sample/spam/foreign ordinary records never establish the first genuine current owned request',async()=>{
 for(const change of [{simulation:true},{status:'spam'},{delivery:{tenantIdentity:'0'.repeat(64)}},{websiteSetupCheck:{checkId:'a'.repeat(32),turnId:'b'.repeat(32),origin:PUBLIC_WORKSPACE_WEBSITE.origin}}]){const f=await fixture(),key=f.c.slug+'/'+'c'.repeat(32),row=await store.get('leads',key);await store.put('leads',key,{...row,...change});await noReady(f);assert.equal(f.requests.length,1);}
});
await check('False owner/app/website/phase bindings and duplicate query values fail on the actual DTO',async()=>{
 const changes=[v=>v.client.owner.email='other@example.test',v=>v.site='https://foreign.example.test',v=>v.client.business.website+='&client='+v.client.slug,v=>v.client.business.website=v.client.business.website.replace('zaricoach.com','zaricoach.com.foreign.test'),v=>v.client.business.website=v.client.business.website.replace(/phase=[^&]+/,'phase=older_closed_phase'),v=>v.websiteInstallation.tenantIdentity='0'.repeat(64)];
 for(const mutate of changes){const f=await fixture(),dto=await f.dto();mutate(dto);await noReady(f,{fetch:async()=>Response.json(dto)});assert.equal(f.receipt.siteRequests.length,1);}
});
await check('Duplicate retained references, foreign timestamps and setup receipt reuse cannot satisfy the ordinary request',async()=>{
 for(const mutate of [v=>v.leads.push(structuredClone(v.leads.find(r=>r.id==='c'.repeat(32)))),v=>v.websiteInstallation.firstExternalRequest.record.createdAt=at(-90000),v=>v.websiteInstallation.firstExternalRequest.record=v.websiteInstallation.setupRequest.record,v=>v.leads.find(r=>r.id==='c'.repeat(32)).slug='wrong-workspace']){const f=await fixture(),dto=await f.dto();mutate(dto);await noReady(f,{fetch:async()=>Response.json(dto)});assert.equal(f.receipt.siteRequests.length,1);}
});
await check('Failed/lost/malformed owner reads consume one reservation, never retry and do not retain private error/DTO content',async()=>{
 for(const kind of ['lost','401','302','malformed']){const f=await fixture();let calls=0;await noReady(f,{fetch:async()=>{calls++;if(kind==='lost')throw Error('PRIVATE '+f.packet.owner.bearer);if(kind==='malformed')return new Response('PRIVATE '+f.packet.owner.bearer,{status:200});return Response.json({error:'PRIVATE '+f.packet.owner.bearer},{status:Number(kind)});}});assert.equal(calls,1);assert.equal(f.receipt.siteRequests[0].state,'uncertain');assert(!JSON.stringify(f.receipt).includes(f.packet.owner.bearer));assert(!JSON.stringify(f.receipt).includes('PRIVATE'));}
});
await check('Each of the three served source failures stops once without retry or readiness mutation',async()=>{
 for(const file of ['desk.js','desk-billing.js','desk.css']){const f=await fixture(),before=await store.get('clients',f.c.slug);await noReady(f,{fetch:async(url,init)=>new URL(url).pathname==='/'+file?new Response('wrong source',{status:200}):f.transport(url,init)});assert.equal(f.receipt.siteRequests.at(-1).state,'uncertain');assert.equal(f.receipt.siteRequests.at(-1).reason,'workspace_source_unconfirmed');assert.deepEqual(await store.get('clients',f.c.slug),before);assert.equal(f.receipt.siteRequests.length,['desk.js','desk-billing.js','desk.css'].indexOf(file)+2);}
});
await check('Phase expiry between owner read and served assets blocks the next read before transport',async()=>{
 const f=await fixture();await noReady(f,{fetch:async(url,init)=>{const response=await f.transport(url,init);if(new URL(url).pathname==='/api/client')f.packet.expiresAt=at(-1);return response;}});assert.equal(f.requests.length,1);assert.equal(f.receipt.siteRequests.length,1);
});
await check('Failed durable owner-read admission performs zero transport and preserves reserved-unknown identity',async()=>{
 const f=await fixture();f.guard.save=()=>{throw Error('Synthetic admission acknowledgement lost');};await noReady(f);assert.equal(f.requests.length,0);assert.equal(f.receipt.siteRequests.length,1);assert.equal(f.receipt.siteRequests[0].state,'reserved_unknown');
});
await check('Exhausted160-site allowance refuses the new owner read without increasing the bound or sending transport',async()=>{
 const f=await fixture();for(let i=0;i<160;i++)f.guard.site(new URL(PUBLIC_ORIGIN+'/desk.js'),'GET');await noReady(f);assert.equal(f.requests.length,0);assert.equal(f.receipt.siteRequests.length,160);
});
await check('Never-admitted preflight failure cannot dispatch Stripe, application cleanup or fixture mutations',async()=>{
 const f=await fixture();let effects=0;await cleanupPublicProof({packet:f.packet,report:{cleanup:[],unknown:[]},guard:f.guard,stripe:async()=>{effects++;},app:async()=>{effects++;},pollSaved:async()=>{effects++;},safe:()=>'',save:()=>{},phaseAdmitted:false,fixtureTouched:false,accountConfirmed:false});assert.equal(effects,0);
 const source=readFileSync('scripts/lib/stripe-public-execution.mjs','utf8'),start=source.indexOf('report.workspacePreflight=await preflightPublicWorkspace');assert(start>=0);for(const text of ["await stripe('account')",'fixtureTouched=true',"action:'proof_begin'"])assert(start<source.indexOf(text));assert(!/import\s.*netlify\/functions/.test(source));
});
report.after=hashes();report.sourceStable=JSON.stringify(report.before)===JSON.stringify(report.after);report.physicalAttempts=physical;report.passed=report.checks.filter(r=>r.pass).length;report.total=report.checks.length;report.ok=report.sourceStable&&physical===0&&report.passed===report.total;if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,ok:report.ok,passed:report.passed,total:report.total,sourceStable:report.sourceStable,physicalAttempts:physical,failures:report.checks.filter(r=>!r.pass)},null,2));if(!report.ok)process.exitCode=1;
