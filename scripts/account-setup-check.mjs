// Verified-tenant and channel-readiness regressions. No .env, model or provider requests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const denied = () => { throw new Error('Network disabled by account-setup-check'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = denied;
syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE:'1', MC_FAKE_MODEL:'1', NODE_ENV:'test', URL:'http://127.0.0.1:8888', PUBLIC_SITE_URL:'http://127.0.0.1:8888', ANTHROPIC_API_KEY:'offline-model-placeholder', TWILIO_ACCOUNT_SID:'AC-offline-placeholder', TWILIO_AUTH_TOKEN:'offline-placeholder', MC_TWILIO_NUMBER:'+17135550100', RESEND_API_KEY:'offline-email-placeholder', VAPI_API_KEY:'offline-voice-placeholder', GOOGLE_CLIENT_ID:'offline-google', GOOGLE_CLIENT_SECRET:'offline-google-secret', STRIPE_SECRET_KEY:'offline-stripe', STRIPE_PRICE_GROWTH:'offline-price' });
const data = new Map(); let rev = 0, conflicts = 0, unexpected = 0, fault = null, groups = 0, providerFixture = false, heldRead = null; const stubbedLegacyRequests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (providerFixture && url.origin === 'https://api.twilio.com' && /\/(Messages|Calls)\.json$/.test(url.pathname)) { stubbedLegacyRequests.push(url.pathname); return Response.json({sid:'offline-stub-sid'}); }
  if (url.origin !== 'https://accounts-blobs.invalid') { unexpected++; return denied(); }
  const [, site, kind, ...parts] = url.pathname.split('/').map(decodeURIComponent);
  assert.equal(site,'offline-site'); assert.ok(kind.startsWith('site:'));
  const key = parts.join('/'), name = `${kind}/${key}`, method = String(init.method || 'GET').toUpperCase();
  let hit = fault && fault.kind === kind && fault.key === key && fault.method === method ? fault : null;
  if (hit?.skip) { hit.skip--; hit = null; }
  if (hit && hit.mode === 'reject') return new Response('Injected storage rejection', {status:400});
  if (method === 'GET' && !key) { const prefix=url.searchParams.get('prefix')||'';return Response.json({blobs:[...data.keys()].filter(k=>k.startsWith(kind+'/'+prefix)).map(k=>({key:k.slice(kind.length+1)})),directories:[]}); }
  if (heldRead && method === 'GET' && kind === heldRead.kind && key === heldRead.key) {
    if (heldRead.skip) heldRead.skip--;
    else { const wait = heldRead; heldRead = null; wait.reached(); await wait.release; }
  }
  const current = data.get(name), headers = new Headers(init.headers);
  if (method === 'GET') return current ? new Response(current.value,{headers:{etag:current.etag,'content-type':'application/json'}}) : new Response(null,{status:404});
  if (method === 'DELETE') { data.delete(name); return new Response(null,{status:204}); }
  assert.equal(method,'PUT');
  if ((headers.get('if-none-match') === '*' && current) || (headers.has('if-match') && headers.get('if-match') !== current?.etag)) { conflicts++; return new Response(null,{status:412}); }
  const etag=String(++rev); data.set(name,{value:init.body,etag});
  if (hit) { hit.mode='reject'; throw new TypeError('Injected committed PUT with lost response, followed by nonretryable rejection'); }
  return new Response(null,{headers:{etag}});
};
const { setEnvironmentContext } = await import('@netlify/blobs');
setEnvironmentContext({siteID:'offline-site',token:'offline-token',edgeURL:'https://accounts-eventual.invalid',uncachedEdgeURL:'https://accounts-blobs.invalid'});
const store=await import('../netlify/functions/lib/store.mjs');
const accounts=await import('../netlify/functions/lib/accounts.mjs');
const setup=await import('../netlify/functions/lib/setup.mjs');
const { workspaceEditRevision }=await import('../netlify/functions/lib/workspace-edit.mjs');
const { newClient }=await import('../netlify/functions/lib/config.mjs');
const access=await import('../netlify/functions/lib/access.mjs');
const onboard=(await import('../netlify/functions/onboard.mjs')).default;
const accessAPI=(await import('../netlify/functions/access.mjs')).default;
const clientAPI=(await import('../netlify/functions/client.mjs')).default;
const build=(await import('../netlify/functions/onboard-build-background.mjs')).default;
const google=(await import('../netlify/functions/google.mjs')).default;
const billing=(await import('../netlify/functions/billing.mjs')).default;
const workspaceBillingAPI=(await import('../netlify/functions/workspace-billing.mjs')).default;
const provision=(await import('../netlify/functions/provision-background.mjs')).default;
const { ndjsonResponse }=await import('../netlify/functions/lib/agent.mjs');
const { sendSMS,placeCall }=await import('../netlify/functions/lib/send.mjs');
let serial=0;
const hash=v=>createHash('sha256').update(v).digest('hex');
const body={name:'Test Owner',phone:'7135550140',business:'Offline Air',trade:'HVAC',city:'Houston',serviceArea:'Katy, Houston',services:'AC repair\nMaintenance',hours:'Mon-Fri 8am-5pm',windows:'8 to 12\n12 to 5',website:'http://169.254.169.254/private'};
const request=(path,payload,token,method='POST')=>new Request(process.env.URL+path,{method,headers:{'Content-Type':'application/json',Origin:process.env.URL,...(token?{Authorization:`Bearer ${token}`}:{})},...(method==='GET'?{}:{body:JSON.stringify(payload)})});
const session=async email=>{const token=hash(`session-${++serial}`);await store.put('access_sessions',access.accessHash(token),{email,scope:'onboarding',status:'active',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return token;};
const fresh=(label)=>{const n=++serial,email=`${label}-${n}@example.invalid`,c=newClient({slug:`${label}-${n}`,ownerKey:`owner-${n}`,owner:{email,name:'Test Owner',phone:'+17135550140'},business:{name:'Offline Air',trade:'HVAC',serviceArea:['Katy'],hours:'Mon-Fri 8am-5pm'}});c.services=['AC repair'];c.onboarding={version:1,verifiedEmail:email};c.status='testing';c.build={status:'built',source:'owner_answers'};return c;};
const snapshot=async()=>Object.fromEntries(await Promise.all(['clients','index','accounts','events','tasks','bookings','leads'].map(async kind=>[kind,await Promise.all((await store.list(kind)).map(async key=>[key,await accounts.strictRead(kind,key)]))])));
const ownerTokens=new Map();
const ownerToken=async c=>{if(!ownerTokens.has(c.slug))ownerTokens.set(c.slug,await session(c.owner.email));return ownerTokens.get(c.slug);};
const ownerPath=c=>`/api/client?c=${c.slug}`+(c.onboarding?.version===1?'':`&k=${c.ownerKey}`);
const act=async(c,payload)=>{const r=await clientAPI(request(ownerPath(c),payload,c.onboarding?.version===1?await ownerToken(c):undefined));return {status:r.status,body:await r.json()};};
async function suite(backend){
 process.env.MC_MEMORY_STORE=backend==='memory'?'1':'0';process.env.MC_FAKE_MODEL='1';
 const email=`onboard-${backend}@example.invalid`,token=await session(email);
 const before=await snapshot();
 let r=await onboard(request('/api/onboard',{...body,email}));assert.equal(r.status,401);assert.deepEqual(await snapshot(),before);groups++;
 r=await onboard(request('/api/onboard',{...body,email:'foreign@example.invalid'},token));assert.equal(r.status,400);assert.deepEqual(await snapshot(),before);groups++;
 r=await onboard(request('/api/onboard',{...body,phone:'+442012345678'},token));assert.equal(r.status,400);r=await onboard(request('/api/onboard',{...body,notes:'x'.repeat(33000)},token));assert.equal(r.status,413);groups++;
 r=await onboard(request('/api/onboard',body,'0'.repeat(64)));assert.equal(r.status,401);groups++;
 const expired=await session(`expired-${backend}@example.invalid`);await store.put('access_sessions',access.accessHash(expired),{email,scope:'onboarding',status:'active',expiresAt:'2000-01-01T00:00:00Z'});r=await onboard(request('/api/onboard',body,expired));assert.equal(r.status,401);groups++;
 const responses=await Promise.all(Array.from({length:8},()=>onboard(request('/api/onboard',{...body,email},token))));
 const outputs=await Promise.all(responses.map(r=>r.json()));assert.ok(responses.every(r=>r.status===200),JSON.stringify(outputs));assert.equal(new Set(outputs.map(x=>x.slug)).size,1);assert.ok(outputs.every(x=>!Object.hasOwn(x,'key')&&!Object.hasOwn(x.client,'ownerKey')&&!new URL(x.portal).searchParams.has('k')));groups++;
 let saved=await accounts.findVerifiedAccount(email);assert.deepEqual(saved.rules.appointmentHours,{version:1,mode:'business'});assert.deepEqual((await store.getAvailability(saved,'2031-11-08',1)).openings[0].windows,[]);assert.equal(saved.onboarding.version,1);assert.equal(saved.build.status,'built');assert.equal(saved.build.source,'owner_answers');assert.match(saved.build.notes,/Website import is not enabled/);assert.equal(saved.status,'testing');assert.equal((await store.list('accounts')).filter(k=>k===accounts.accountKey(email)).length,1);assert.equal(await accounts.strictRead('index','email:'+email),saved.slug);assert.ok(!JSON.stringify(await accounts.strictRead('accounts',accounts.accountKey(email))).includes(token));groups++;
 await store.put('clients',saved.slug,{...saved,status:'paused',services:['Owner edited service'],calendar:{google:{refreshToken:'offline-private-token'}},setupProof:{retained:true}});
 const clockEmail=`clock-${backend}@example.invalid`,clockToken=await session(clockEmail),clockBody={...body,setupVersion:'2',hours:'Mon-Fri 6pm-8pm',windows:'06:00 to 08:00'};let clockResponse=await onboard(request('/api/onboard',clockBody,clockToken)),clockResult=await clockResponse.json();assert.equal(clockResponse.status,400);assert.equal(clockResult.field,'windows');assert.match(clockResult.message,/Add am or pm/);assert.equal(await accounts.findVerifiedAccount(clockEmail),null);groups++;
 clockResponse=await onboard(request('/api/onboard',{...clockBody,windows:'6 pm to 8 pm'},clockToken));clockResult=await clockResponse.json();assert.equal(clockResponse.status,200);const clockSaved=await accounts.findVerifiedAccount(clockEmail);assert.deepEqual((await store.getAvailability(clockSaved,'2031-11-04',1)).openings[0].windows,['6 pm to 8 pm']);groups++;
 const prior=await snapshot();r=await onboard(request('/api/onboard',{...body,business:'Intruder replacement',phone:'7135550199'},token));const existing=await r.json();assert.equal(r.status,200);assert.equal(existing.existing,true);assert.equal(existing.slug,saved.slug);assert.deepEqual(await snapshot(),prior);groups++;
 r=await onboard(request('/api/onboard',{...body,email,business:'Anonymous replacement'}));assert.equal(r.status,401);assert.deepEqual(await snapshot(),prior);groups++;
 r=await onboard(request('/api/onboard',body,token));assert.equal(r.status,200);groups++;
 let c=fresh(`race-${backend}`);const hashValue='same-submission';const results=await Promise.all(Array.from({length:10},(_,n)=>accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:{...c,slug:c.slug+'-'+n,ownerKey:c.ownerKey+'-'+n},submissionHash:hashValue})));assert.equal(new Set(results.map(x=>x.client.slug+'|'+x.client.ownerKey)).size,1);groups++;
 c=fresh(`legacy-${backend}`);await store.put('clients',c.slug,c);await store.put('index','email:'+c.owner.email,c.slug);const legacyBefore=await snapshot();assert.equal((await accounts.findVerifiedAccount(c.owner.email)).slug,c.slug);const adopted=await accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:{...c,slug:'ignored-'+c.slug,ownerKey:'ignored'},submissionHash:'adopt'});assert.equal(adopted.outcome,'existing');assert.equal(adopted.client.ownerKey,c.ownerKey);assert.deepEqual(await accounts.strictRead('clients',c.slug),c);assert.equal(await accounts.strictRead('index','email:'+c.owner.email),c.slug);groups++;
 c=fresh(`wrong-index-${backend}`);await store.put('index','email:'+c.owner.email,'missing-client');await assert.rejects(()=>accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:c,submissionHash:'index'}),/account_conflict/);assert.equal(await accounts.strictRead('accounts',accounts.accountKey(c.owner.email)),null);groups++;
 for (const malformed of [false,0,'']) { c=fresh(`malformed-index-${backend}`);await store.put('index','email:'+c.owner.email,malformed);await assert.rejects(()=>accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:c,submissionHash:'malformed'}),/account_conflict/);assert.equal(await accounts.strictRead('accounts',accounts.accountKey(c.owner.email)),null); }groups++;
 c=fresh(`malformed-account-${backend}`);await store.put('accounts',accounts.accountKey(c.owner.email),false);await assert.rejects(()=>accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:c,submissionHash:'malformed'}),/account_conflict/);assert.equal(await accounts.strictRead('clients',c.slug),null);groups++;
 for(const [field,change] of [
  ['business.name',v=>{v.business.name='';}],['business.trade',v=>{v.business.trade='';}],['services',v=>{v.services=[];}],['business.serviceArea',v=>{v.business.serviceArea=[];}],['rules.hours',v=>{v.rules.hours=null;}],['windows',v=>{v.windows=[];}],['owner.phone',v=>{v.owner.phone='';}],
  ['owner.phone',v=>{v.phone.twilioNumber=v.owner.phone;}],['owner.backupPhone',v=>{v.owner.backupPhone=v.owner.phone;}],['phone.transferTo',v=>{v.phone.handoffEnabled=true;v.phone.businessNumber='+17135550141';v.phone.transferTo=v.phone.businessNumber;}],['rules.bypass',v=>{v.rules.bypass=[v.owner.phone];}]
 ]){
  const target=fresh(`review-missing-${backend}`);change(target);target.setupProof={reviewedRevision:setup.configurationRevision(target),reviewedAt:'2001-01-01T00:00:00.000Z'};
  await accounts.ensureVerifiedAccount({email:target.owner.email,initialClient:target,submissionHash:'review-invalid'});const beforeReview=await accounts.strictRead('clients',target.slug),out=await act(target,{action:'review_rules',revision:setup.configurationRevision(target)});
  assert.equal(out.status,409);assert.equal(out.body.error,'business_details_incomplete');assert.equal(typeof out.body.fieldErrors[field],'string');assert.equal(out.body.setup.reviewRequirements.complete,false);assert(out.body.blockers.some(item=>['rules','handoff'].includes(item.id)));assert.deepEqual(await accounts.strictRead('clients',target.slug),beforeReview);groups++;
 }
 for(const state of ['queued','failed']){
  const target=fresh(`review-build-${backend}`);target.build.status=state;await accounts.ensureVerifiedAccount({email:target.owner.email,initialClient:target,submissionHash:'review-build'});const beforeReview=await accounts.strictRead('clients',target.slug),out=await act(target,{action:'review_rules',revision:setup.configurationRevision(target)});
  assert.equal(out.status,409);assert.equal(out.body.error,'business_details_incomplete');assert.deepEqual(out.body.fieldErrors,{});assert(out.body.blockers.some(item=>item.id==='knowledge'));assert.deepEqual(await accounts.strictRead('clients',target.slug),beforeReview);groups++;
 }
 {
  const target=fresh(`review-recover-${backend}`);target.services=[];await accounts.ensureVerifiedAccount({email:target.owner.email,initialClient:target,submissionHash:'review-recover'});assert.equal((await act(target,{action:'review_rules',revision:setup.configurationRevision(target)})).status,409);
  let r=await clientAPI(request(ownerPath(target),null,await ownerToken(target),'GET')),view=await r.json();assert.equal(r.status,200);r=await clientAPI(request(ownerPath(target),{expectedRevision:view.configurationRevision,expectedEditRevision:view.editRevision,services:['Corrected AC repair']},await ownerToken(target),'PUT'));assert.equal(r.status,200);
  const changed=await r.json(),out=await act(target,{action:'review_rules',revision:changed.configurationRevision});assert.equal(out.status,200);assert.equal(out.body.setup.reviewRequirements.complete,true);assert.equal((await accounts.strictRead('clients',target.slug)).setupProof.reviewedRevision,changed.configurationRevision);groups++;
 }
 c=fresh(`ready-${backend}`);await accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:c,submissionHash:"ready-fixture"});
 let result=await act(c,{action:'go_live',ready:true});assert.equal(result.status,409);assert.equal(result.body.setup.channels.voice.ready,false);assert.equal(result.body.setup.channels.sms.active,false);assert.equal((await accounts.strictRead('clients',c.slug)).status,'testing');groups++;
 const revision=setup.configurationRevision(c);result=await act(c,{action:'review_rules',revision:'stale'});assert.equal(result.status,409);result=await act(c,{action:'review_rules',revision});assert.equal(result.status,200);assert.equal(result.body.setup.channels.web.ready,false);groups++;
 c=await accounts.strictRead('clients',c.slug);c.setupProof.testedRevision=revision;c.setupProof.testMode='fake';await store.put('clients',c.slug,c);assert.equal(setup.setupReadiness(c).canActivateWeb,false);process.env.MC_FAKE_MODEL='0';assert.equal(setup.setupReadiness(c).canActivateWeb,false);result=await act(c,{action:'go_live'});assert.equal(result.status,409);assert.ok(result.body.setup.channels.web.blockers.some(b=>b.id==='test'));groups++;
 // A live-mode receipt here is an explicit stored fixture, not a model request.
 c.setupProof.testMode='live';await store.put('clients',c.slug,c);assert.equal(setup.setupReadiness(c).canActivateWeb,true);groups++;
 const beforeWebEpoch=c.operationLifecycleVersion||0;c.channels={web:{active:false},voice:{active:true,retained:'native-flag-fixture'},sms:{active:true}};await store.put('clients',c.slug,c);
 result=await act(c,{action:'go_live',channels:['sms']});assert.equal(result.status,409);result=await act(c,{action:'go_live',channels:['web']});assert.equal(result.status,200);assert.deepEqual(result.body.activeChannels,['web']);assert.equal(result.body.setup.channels.web.active,true);assert.equal(result.body.setup.channels.voice.active,false);assert.equal(result.body.setup.channels.sms.active,false);groups++;
 const active=await accounts.strictRead('clients',c.slug);assert.equal(active.operationLifecycleVersion,beforeWebEpoch);assert.deepEqual(active.channels.voice,c.channels.voice);assert.deepEqual(active.channels.sms,c.channels.sms);const repeat=await act(active,{action:'go_live',channels:['web']});assert.equal(repeat.status,200);assert.equal((await accounts.strictRead('clients',c.slug)).operationLifecycleVersion,beforeWebEpoch);assert.equal((await sendSMS({client:active,to:'+17135550141',body:'Never send',force:true})).reason,'channel_not_active');assert.equal((await placeCall({client:active,to:'+17135550141',say:'Never call'})).reason,'channel_not_active');groups++;
 for(const action of ['provision','forwarding_verified']){result=await act(c,{action});assert.equal(result.status,409);} const unchanged=await accounts.strictRead('clients',c.slug);for(const worker of [build,provision]){r=await worker(request('/background',{slug:c.slug,key:c.ownerKey}));assert.equal(r.status,409);}assert.deepEqual(await accounts.strictRead('clients',c.slug),unchanged);groups++;
 for(const [handler,path,expected] of [[google,`/api/google/auth?c=${c.slug}&k=${c.ownerKey}`,410],[google,`/api/google/callback?code=must-not-exchange&state=${Buffer.from(JSON.stringify({c:c.slug,k:c.ownerKey})).toString('base64url')}`,410],[billing,`/api/billing?c=${c.slug}&k=${c.ownerKey}&plan=pro`,409]]){const response=await handler(request(path,null,null,'GET'));assert.equal(response.status,expected);}assert.deepEqual(await accounts.strictRead('clients',c.slug),unchanged);groups++;
 result=await act(c,{action:'pause'});assert.equal(result.status,200);assert.equal((await accounts.strictRead('clients',c.slug)).operationLifecycleVersion,beforeWebEpoch+1);assert.equal(result.body.setup.channels.web.active,false);result=await act(c,{action:'resume'});assert.equal(result.status,200);assert.equal((await accounts.strictRead('clients',c.slug)).operationLifecycleVersion,beforeWebEpoch+2);groups++;
 // Owner facts edits invalidate receipts but preserve unrelated state and provider tokens.
 c=await accounts.strictRead('clients',c.slug);await store.put('clients',c.slug,{...c,calendar:{provider:'google',google:{refreshToken:'fixture-refresh'}},setupProof:{...c.setupProof,extra:'preserve'}});
 r=await clientAPI(request(ownerPath(c),{expectedRevision:setup.configurationRevision(c),expectedEditRevision:workspaceEditRevision(c),faq:[{q:'Warranty?',a:'Owner must review.'}],summary:'New owner instruction'},await ownerToken(c),'PUT'));assert.equal(r.status,200);const edited=await r.json();assert.notEqual(edited.configurationRevision,revision);assert.equal(edited.setup.canActivateWeb,false);let current=await accounts.strictRead('clients',c.slug);assert.equal(current.calendar.google.refreshToken,'fixture-refresh');assert.equal(current.setupProof.extra,'preserve');assert.equal(current.status,'live');groups++;
 r=await clientAPI(request(ownerPath(c),{expectedRevision:revision,expectedEditRevision:workspaceEditRevision(c),summary:'Stale open tab overwrite'},await ownerToken(c),'PUT'));assert.equal(r.status,409);assert.equal((await accounts.strictRead('clients',c.slug)).summary,'New owner instruction');groups++;
 result=await act(c,{action:'resume'});assert.equal(result.status,409);result=await act(c,{action:'cancel'});assert.equal(result.status,200);assert.equal(result.body.setup.channels.web.active,false);result=await act(c,{action:'resume'});assert.equal(result.status,409);groups++;
 r=await clientAPI(request(`/api/client?c=${c.slug}&k=WRONG`,null,null,'GET'));assert.equal(r.status,401);assert.ok(!JSON.stringify(await r.json()).includes(c.ownerKey));r=await clientAPI(request(`/api/client?c=${c.slug}`,null,null,'GET'));assert.equal(r.status,200);assert.equal((await r.json()).client,undefined);groups++;
 for(const field of ['faq','summary','phone']){const base=structuredClone(c),changed=structuredClone(c);if(field==='faq')changed.faq=[{q:'New?',a:'New'}];if(field==='summary')changed.summary='Updated';if(field==='phone')changed.phone.transferTo='+17135550145';assert.notEqual(setup.configurationRevision(base),setup.configurationRevision(changed));} assert.equal(setup.configurationRevision({...c,status:'paused',updatedAt:'new',setupProof:{anything:true}}),setup.configurationRevision(c));groups++;
 // Session-only owner authority and actual revocation across private API surfaces.
 const ownerSession=await ownerToken(c),state=await access.getAccessState(await access.getAccessSession(request('/api/access',{},ownerSession)));
 assert.ok(state.existing&&!new URL(state.existing.portal).searchParams.has('k'));assert.ok(!JSON.stringify(state).includes(c.ownerKey));groups++;
 const oldKeyResponse=await clientAPI(request(`/api/client?c=${c.slug}&k=${c.ownerKey}`,null,null,'GET'));assert.equal(oldKeyResponse.status,401);groups++;
 const publicResponse=await clientAPI(request(ownerPath(c),null,null,'GET'));assert.equal(publicResponse.status,200);assert.equal(publicResponse.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(await publicResponse.json()).includes(c.ownerKey));groups++;
 let privateResponse=await clientAPI(request(ownerPath(c),null,ownerSession,'GET'));assert.equal(privateResponse.status,200);assert.ok(!JSON.stringify(await privateResponse.json()).includes(c.ownerKey));
 privateResponse=await clientAPI(request(ownerPath(c)+'&export=bookings',null,ownerSession,'GET'));assert.equal(privateResponse.status,200);groups++;
 const foreignSession=await session('foreign-'+backend+'@example.invalid');privateResponse=await clientAPI(request(ownerPath(c),null,foreignSession,'GET'));assert.equal(privateResponse.status,403);groups++;
 const signOut=await accessAPI(request('/api/access',{action:'sign_out'},ownerSession));assert.equal(signOut.status,200);
 for(const path of [ownerPath(c),ownerPath(c)+'&export=bookings',ownerPath(c)+`&k=${c.ownerKey}`]){privateResponse=await clientAPI(request(path,null,ownerSession,'GET'));assert.equal(privateResponse.status,401);}
 privateResponse=await clientAPI(request(ownerPath(c),{action:'pause'},ownerSession));assert.equal(privateResponse.status,401);privateResponse=await clientAPI(request(ownerPath(c),{summary:'Revoked write',expectedRevision:setup.configurationRevision(c)},ownerSession,'PUT'));assert.equal(privateResponse.status,401);groups++;
 privateResponse=await onboard(request(`/api/onboard?c=${c.slug}&k=${c.ownerKey}`,null,null,'GET'));assert.equal(privateResponse.status,401);privateResponse=await onboard(request(`/api/onboard?c=${c.slug}`,null,foreignSession,'GET'));assert.equal(privateResponse.status,403);groups++;
 process.env.MC_FAKE_MODEL='1';
 if(backend==='memory'){
  // Interleave an ordinary owner JSON read after initial authorization, while the
  // actual private-record decode with a session change. Tenant identity alone
  // cannot establish that the session still authorizes the completed response.
  for (const changed of ['active','revoked','expired','session_owner','current_owner','tenant']) {
   const slug='json-read-'+changed.replace('_','-')+'-'+(++serial),email=slug+'@example.invalid';
   const target=newClient({slug,ownerKey:'offline-json-owner-'+serial,owner:{name:'Owner',email,phone:'+17135550142'},business:{name:'Offline Air',trade:'HVAC',city:'Houston'}});target.onboarding={version:1,verifiedEmail:email,desiredChannels:['web']};target.status='testing';await store.put('clients',target.slug,target);
   const token=await ownerToken(target),sessionKey=access.accessHash(token),original=await store.get('access_sessions',sessionKey);
   const {workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs');
   const marker='Private owner JSON boundary fixture',tenantIdentity=workspaceTenant(target);
   const row=await store.addRecord('bookings',target.slug,{tenantIdentity,customer_name:marker,phone:'+17135550142',status:'confirmed',channel:'web',issue:marker,date:'2026-11-10',window:'8 to 12'});
   const parse=JSON.parse;let reached=false,authorizationReads=0,persistedChange;
   JSON.parse=function(text,...args){
    const value=parse(text,...args);
    if(value?.scope==='onboarding'&&value.email===original.email&&value.status==='active')authorizationReads++;
    if(!reached&&value?.id===row.id&&value.customer_name===marker){
     reached=true;assert.ok(authorizationReads>0,'Initial authorization must precede the private decode');
     if(changed==='revoked')persistedChange=store.put('access_sessions',sessionKey,{...original,status:'revoked'});
     if(changed==='expired')persistedChange=store.put('access_sessions',sessionKey,{...original,expiresAt:new Date(Date.now()-1).toISOString()});
     if(changed==='session_owner')persistedChange=store.put('access_sessions',sessionKey,{...original,email:'replacement-session@example.invalid'});
     if(changed==='current_owner')persistedChange=store.put('clients',target.slug,{...target,owner:{...target.owner,email:'replacement-owner@example.invalid'}});
     if(changed==='tenant')persistedChange=store.put('clients',target.slug,{...target,ownerKey:target.ownerKey+'-replacement'});
    }
    return value;
   };
   let response;try{response=await clientAPI(request(ownerPath(target),null,token,'GET'));}finally{JSON.parse=parse;}
   if(persistedChange)await persistedChange;
   if(!reached){const view=await response.clone().json();throw new Error('Owner JSON record was not decoded: '+changed+' '+response.status+' '+view.error);}
   const text=await response.text();
   if(changed==='active'){
    assert.equal(response.status,200);assert.match(text,new RegExp(marker));assert.equal(JSON.parse(text).bookings.length,1);
   }else{
    assert.equal(response.status,['tenant','current_owner'].includes(changed)?503:['revoked','expired'].includes(changed)?401:403);
    assert.doesNotMatch(text,new RegExp(marker));assert.deepEqual(Object.keys(JSON.parse(text)).sort(),['tenant','current_owner'].includes(changed)?['error','message']:['error']);
    assert.equal(response.headers.get('content-disposition'),null);
   }
   assert.equal(response.headers.get('cache-control'),'no-store');
   if(['active','revoked','expired','session_owner'].includes(changed))assert.deepEqual(await accounts.strictRead('clients',target.slug),target);
   if(!['tenant','current_owner'].includes(changed))assert.equal(workspaceTenant(await accounts.strictRead('clients',target.slug)),tenantIdentity);
   await store.put('clients',target.slug,target);
   const restoredToken=changed==='revoked'?await session(target.owner.email):token;
   if(changed!=='revoked')await store.put('access_sessions',sessionKey,original);
   const restored=await clientAPI(request(ownerPath(target),null,restoredToken,'GET'));assert.equal(restored.status,200);assert.match(await restored.text(),new RegExp(marker));
   if(changed==='revoked')assert.equal((await store.get('access_sessions',sessionKey)).status,'revoked');groups++;
  }
  // Empty owner views still work, and anonymous widget reads never gain the
  // private owner projection or records. Legacy owner-key controls remain below.
  {
   const target=fresh('owner-json-empty');await store.put('clients',target.slug,target);
   const owner=await clientAPI(request(ownerPath(target),null,await ownerToken(target),'GET')),view=await owner.json();
   assert.equal(owner.status,200);assert.deepEqual(view.bookings,[]);assert.deepEqual(view.leads,[]);assert.deepEqual(view.conversations,[]);
   const publicResponse=await clientAPI(request(ownerPath(target),null,null,'GET')),publicView=await publicResponse.json();
   assert.equal(publicResponse.status,200);for(const field of ['client','bookings','leads','conversations','ownerKey','setup'])assert.equal(Object.hasOwn(publicView,field),false);
   assert.equal(publicResponse.headers.get('cache-control'),'no-store');groups++;
  }
  // These GET projections also await private storage after initial session
  // authorization. Keep fresh-link exchange and every mutation path untouched.
  for(const endpoint of ['access','billing'])for(const changed of ['active','revoked','expired','email','scope',...(endpoint==='billing'?['owner','tenant']:[])]){
   const slug='private-get-'+endpoint+'-'+changed+'-'+(++serial),email=slug+'@example.invalid';
   const target=newClient({slug,ownerKey:'offline-private-owner-'+serial,owner:{name:'Owner',email,phone:'+17135550142'},business:{name:'Offline Air',trade:'HVAC',city:'Houston'}});target.onboarding={version:1,verifiedEmail:email,desiredChannels:['web']};target.status='testing';await store.put('clients',slug,target);
   const token=await session(email),sessionKey=access.accessHash(token),original=await store.get('access_sessions',sessionKey),{workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs'),tenant=workspaceTenant(target);
   const marker=endpoint==='access'?'Private draft temporal fixture':'2031-01-15T08:12:34.000Z',subscription='sub_temporal_'+serial;
   if(endpoint==='access')await store.put('onboarding_drafts',access.accessHash(email),{fields:{business:marker},step:2,revision:1});
   else await store.put('workspace_billing',slug+'/'+tenant,{slug,tenant,livemode:false,subscription:{id:subscription,status:'past_due',plan:'starter',services:['web'],currentPeriodEnd:marker}});
   const parse=JSON.parse;let reached=false,authorizationReads=0,persistedChange;
   JSON.parse=function(text,...args){
    const value=parse(text,...args);if(value?.scope==='onboarding'&&value.email===email&&value.status==='active')authorizationReads++;
    if(!reached&&(endpoint==='access'?value?.fields?.business===marker:value?.subscription?.id===subscription)){
     reached=true;assert.ok(authorizationReads>0);
     if(changed==='revoked')persistedChange=store.put('access_sessions',sessionKey,{...original,status:'revoked'});
     if(changed==='expired')persistedChange=store.put('access_sessions',sessionKey,{...original,expiresAt:new Date(Date.now()-1).toISOString()});
     if(changed==='email')persistedChange=store.put('access_sessions',sessionKey,{...original,email:'replacement-session@example.invalid'});
     if(changed==='scope')persistedChange=store.put('access_sessions',sessionKey,{...original,scope:'operator'});
     if(changed==='owner')persistedChange=store.put('clients',slug,{...target,owner:{...target.owner,email:'replacement-owner@example.invalid'}});
     if(changed==='tenant')persistedChange=store.put('clients',slug,{...target,ownerKey:target.ownerKey+'-replacement'});
    }
    return value;
   };
   const handler=endpoint==='access'?accessAPI:workspaceBillingAPI,path=endpoint==='access'?'/api/access':'/api/workspace-billing?c='+slug;
   let response;try{response=await handler(request(path,null,token,'GET'));}finally{JSON.parse=parse;}
   if(persistedChange)await persistedChange;
   assert.equal(reached,true);const text=await response.text();assert.equal(response.headers.get('cache-control'),'no-store');
   if(changed==='active'){assert.equal(response.status,200);assert.match(text,new RegExp(marker));}
   else {assert.equal(response.status,['owner','tenant'].includes(changed)?403:401);assert.doesNotMatch(text,new RegExp(marker));for(const field of ['draft','billing','email','existing'])assert.equal(Object.hasOwn(JSON.parse(text),field),false);}
   if(!['owner','tenant'].includes(changed))assert.deepEqual(await accounts.strictRead('clients',slug),target);
   await store.put('clients',slug,target);
   const restoredToken=changed==='revoked'?await session(email):token;if(changed!=='revoked')await store.put('access_sessions',sessionKey,original);
   const restored=await handler(request(path,null,restoredToken,'GET'));assert.equal(restored.status,200);assert.match(await restored.text(),new RegExp(marker));
   if(changed==='revoked')assert.equal((await store.get('access_sessions',sessionKey)).status,'revoked');groups++;
  }
 }
 if(backend==='sdk'){
  // Revoke access while the real export is waiting on a private record read.
  // The completed response must check current authority, not only its initial session.
  for (const kind of ['bookings','leads','conversations','customers']) for (const changed of ['revoked','expired','foreign']) {
   const target=fresh(`export-${kind}-${changed}`);await store.put('clients',target.slug,target);
   const token=await ownerToken(target),sessionKey=access.accessHash(token),original=await store.get('access_sessions',sessionKey);
   const tenantIdentity=(await import('../netlify/functions/lib/workspace-identity.mjs')).workspaceTenant(target);
   const marker='Private export boundary fixture',recordKind=kind==='leads'?'leads':kind==='conversations'?'conversations':'bookings';
   let recordKey;
   if(recordKind==='conversations') {recordKey=store.convKey(target,'call','export-fixture');await store.put('conversations',recordKey,{tenantIdentity,channel:'call',contact:'export-fixture',messages:[{role:'user',content:marker,at:new Date().toISOString()}]});}
   else {const row=await store.addRecord(recordKind,target.slug,{tenantIdentity,customer_name:marker,phone:'+17135550142',status:recordKind==='bookings'?'confirmed':'open',channel:'web',issue:marker,date:'2026-11-10',window:'8 to 12'});recordKey=target.slug+'/'+row.id;}
   let reached,release;const entered=new Promise(resolve=>{reached=resolve;}),gate=new Promise(resolve=>{release=resolve;});
   heldRead={kind:'site:'+recordKind,key:recordKey,reached,release:gate};
   const pending=clientAPI(request(ownerPath(target)+'&export='+kind,null,token,'GET'));
   await entered;
   await store.put('access_sessions',sessionKey,{...original,...(changed==='revoked'?{status:'revoked'}:changed==='expired'?{expiresAt:new Date(Date.now()-1).toISOString()}:{email:'replacement-owner@example.invalid'})});
   release();const deniedExport=await pending,deniedText=await deniedExport.text();
   if(changed==='foreign')assert.ok([401,403].includes(deniedExport.status),kind+' must reject changed owner access');
   else assert.equal(deniedExport.status,401,kind+' must recheck '+changed+' access');
   assert.doesNotMatch(deniedText,new RegExp(marker));assert.equal(deniedExport.headers.get('content-disposition'),null);assert.equal(deniedExport.headers.get('cache-control'),'no-store');
   await store.put('access_sessions',sessionKey,original);
   const retry=await clientAPI(request(ownerPath(target)+'&export='+kind,null,token,'GET'));
   assert.equal(retry.status,200);assert.match(retry.headers.get('content-type'),/^text\/csv/);assert.match(await retry.text(),new RegExp(marker));groups++;
  }
  for (const sameField of [true,false]) {
   c=fresh(sameField?'stale-legal':'preserve-calendar');await store.put('clients',c.slug,c);
   let reached, release;const entered=new Promise(resolve=>{reached=resolve;}),gate=new Promise(resolve=>{release=resolve;});
   heldRead={kind:'site:clients',key:c.slug,skip:1,reached,release:gate};
   const pending=clientAPI(request(ownerPath(c),{expectedRevision:setup.configurationRevision(c),expectedEditRevision:workspaceEditRevision(c),business:{name:'Pending business edit'}},await ownerToken(c),'PUT'));
   await entered;
   if(sameField){const concurrent=await clientAPI(request(ownerPath(c),{expectedRevision:setup.configurationRevision(c),expectedEditRevision:workspaceEditRevision(c),business:{reviewLink:'https://example.test/concurrent-review'}},await ownerToken(c),'PUT'));assert.equal(concurrent.status,200);assert.equal(setup.configurationRevision(await accounts.strictRead('clients',c.slug)),setup.configurationRevision(c));}
   else await store.atomicUpdate('clients',c.slug,current=>({value:{...current,calendar:{google:{refreshToken:'concurrent-token'}},setupProof:{retained:true}}}));
   release();const response=await pending;assert.equal(response.status,sameField?409:200);const saved=await accounts.strictRead('clients',c.slug);
   if(sameField){assert.equal(saved.business.reviewLink,'https://example.test/concurrent-review');assert.equal(saved.business.name,c.business.name);}else{assert.equal(saved.business.name,'Pending business edit');assert.equal(saved.calendar.google.refreshToken,'concurrent-token');assert.equal(saved.setupProof.retained,true);}groups++;
  }
  for(const stage of ['reservation','client','index','complete']){
   c=fresh('lost-'+stage);const key=accounts.accountKey(c.owner.email), target=stage==='client'?['clients',c.slug]:stage==='index'?['index','email:'+c.owner.email]:['accounts',key];
   fault={kind:'site:'+target[0],key:target[1],method:'PUT',mode:'commit',skip:stage==='complete'?1:0};
   await assert.rejects(()=>accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:c,submissionHash:'original'}));fault=null;
   const reserved=await accounts.strictRead('accounts',key);assert.equal(reserved.slug,c.slug);assert.equal(reserved.ownerKey,c.ownerKey);
   if(stage==='client'){assert.equal(await accounts.findVerifiedAccount(c.owner.email),null);await store.put('clients',c.slug,{...c,services:['Changed during uncertain response'],calendar:{google:{refreshToken:'retained'}}});await assert.rejects(()=>accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:c,submissionHash:'changed'}),/submission_conflict/);}
   const repaired=await accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:{...c,slug:'must-not-create-'+c.slug,ownerKey:'must-not-rotate'},submissionHash:'original'});
   assert.equal(repaired.client.slug,c.slug);assert.equal(repaired.client.ownerKey,c.ownerKey);assert.equal((await accounts.strictRead('accounts',key)).phase,'created');assert.equal(await accounts.strictRead('index','email:'+c.owner.email),c.slug);if(stage==='client'){assert.deepEqual(repaired.client.services,['Changed during uncertain response']);assert.equal(repaired.client.calendar.google.refreshToken,'retained');}groups++;
  }
  c=fresh('failed-read');fault={kind:'site:accounts',key:accounts.accountKey(c.owner.email),method:'GET',mode:'reject'};await assert.rejects(()=>accounts.ensureVerifiedAccount({email:c.owner.email,initialClient:c,submissionHash:'read'}));fault=null;assert.equal(await accounts.strictRead('clients',c.slug),null);assert.equal(await accounts.strictRead('accounts',accounts.accountKey(c.owner.email)),null);groups++;
 }
}
await suite('memory');await suite('sdk');
for (const simulation of [true,false,undefined]) {
 const output={reply:'Test reply',events:[],simulation,test:{proofRecorded:true,revision:'a'.repeat(64),secret:'never-forward'},secret:'never-forward'};
 const response=ndjsonResponse(async()=>output),done=JSON.parse((await response.text()).trim());
 assert.equal(done.secret,undefined);assert.equal(done.test?.secret,undefined);
 if(simulation===true){assert.equal(done.simulation,true);assert.deepEqual(done.test,{proofRecorded:true,revision:'a'.repeat(64)});}else{assert.equal(done.simulation,undefined);assert.equal(done.test,undefined);}groups++;
}
process.env.MC_MEMORY_STORE='1';providerFixture=true;const legacy=fresh('unmarked-legacy');delete legacy.onboarding;
assert.equal((await sendSMS({client:legacy,to:'+17135550141',body:'Legacy fixture only',force:true})).ok,true);
assert.equal((await placeCall({client:legacy,to:'+17135550141',say:'Legacy fixture only'})).ok,true);
providerFixture=false;assert.equal(stubbedLegacyRequests.length,2);groups++;
await store.put('clients',legacy.slug,legacy);const legacyResponse=await clientAPI(request(`/api/client?c=${legacy.slug}&k=${legacy.ownerKey}`,null,null,'GET'));assert.equal(legacyResponse.status,200);assert.equal((await legacyResponse.json()).client.ownerKey,legacy.ownerKey);groups++;
const legacyExport=await clientAPI(request(`/api/client?c=${legacy.slug}&k=${legacy.ownerKey}&export=bookings`,null,null,'GET'));assert.equal(legacyExport.status,200);assert.match(legacyExport.headers.get('content-type'),/^text\/csv/);groups++;
assert.equal(unexpected,0);assert.ok(conflicts>0);
console.log(JSON.stringify({ok:true,groups,backends:['memory','installed @netlify/blobs protocol double'],casConflicts:conflicts,outboundProviderModelRequests:unexpected,stubbedLegacyRequests:stubbedLegacyRequests.length,limitations:'No actual email, model, provider, deployed Blobs or hosted acceptance; legacy unmarked service behavior retained.'},null,2));
