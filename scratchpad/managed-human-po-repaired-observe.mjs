// Actual exported handlers and HTTP adapter; all provider credentials are dummy,
// every network primitive is blocked, and fetch serves only the explicit protocol.
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|MC_SELF_SERVICE_AI_PROOF)/.test(key)) delete process.env[key];
const origin='http://127.0.0.1:8897', account='AC'+'1'.repeat(32), token='fixture-twilio-token', secret='fixture-vapi-secret-'+'a'.repeat(32);
const policy={version:'handoff_fixture_v1',model:'fixture-approved-model',maxDurationSeconds:120,maxDailyCalls:5,maxDailyMinutes:20,accountDailyCalls:1000,accountDailyMinutes:10000,authorityText:'I authorize the configured phone service and routing to the current approved destinations.',usageDisclosure:'Dummy approved fixture only; conservative call and minute limits do not authorize any actual costs.'};
Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:origin,TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:token,VAPI_API_KEY:'fixture-private',VAPI_WEBHOOK_SECRET:secret,VOICE_ACTIVATION_ENABLED:'true',VOICE_ACTIVATION_APPROVED_VERSION:policy.version,VOICE_ACTIVATION_POLICY_JSON:JSON.stringify(policy),VOICE_FALLBACK_TWIML_URL:'https://handler.twilio.com/twiml/EH'+'f'.repeat(32),SERVICE_WORKER_KEY:'fixture-worker-'+'a'.repeat(32)});
const deny=()=>{throw new Error('Physical networking prohibited')};
net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
const hash=value=>createHash('sha256').update(value).digest('hex'), NativeDate=Date;let clock=NativeDate.now();
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}};
const sources=['netlify/functions/lib/managed-voice-handoff.mjs','netlify/functions/lib/voice-activation.mjs','netlify/functions/lib/voice-provider.mjs','netlify/functions/lib/desk.mjs','netlify/functions/lib/setup.mjs','netlify/functions/lib/config.mjs','netlify/functions/lib/workspace-edit.mjs','netlify/functions/client.mjs','netlify/functions/scheduler.mjs','desk.html','desk.js','scripts/managed-voice-handoff-check.mjs','scripts/complete-connections-ui-qa-check.mjs','netlify.toml','scratchpad/managed-human-po-repaired-observe.mjs'];
const source=()=>Object.fromEntries(sources.map(file=>[file,hash(readFileSync(file))]));
const report={at:new Date().toISOString(),scope:'Actual local handlers with in-memory storage and intercepted Twilio HTTP protocol; no real requests/calls/messages',sourceBefore:source(),checks:[],providerProtocol:[]};
let fault=null,beforePost=null,sdkFault=null,sdkReadHook=null,sdkVersion=0;const calls=new Map(),blobs=new Map();
globalThis.fetch=async(input,init={})=>{
 const url=new URL(String(input)),method=String(init.method||'GET').toUpperCase();
 if(url.origin==='https://handoff-blobs.invalid'){
  const [,site,kind,...parts]=url.pathname.split('/').map(decodeURIComponent),key=parts.join('/'),name=kind+'/'+key;assert.equal(site,'handoff-site');
  if(method==='GET'&&!key)return Response.json({blobs:[...blobs.keys()].filter(name=>name.startsWith(kind+'/'+(url.searchParams.get('prefix')||''))).map(name=>({key:name.slice(kind.length+1)})),directories:[]});
  const value=blobs.get(name),headers=new Headers(init.headers);
  if(sdkFault?.kind===kind.replace(/^site:/,'') && sdkFault.key===key && method===(sdkFault.method||'PUT')){report.sdkInjectedFaults=(report.sdkInjectedFaults||0)+1;return new Response('Explicit fixture store outage',{status:400})}
  if(method==='GET'){const response=value?new Response(value.body,{headers:{etag:value.etag,'content-type':'application/json'}}):new Response(null,{status:404});if(sdkReadHook)await sdkReadHook({kind:kind.replace(/^site:/,''),key});return response;}
  if(method==='DELETE'){blobs.delete(name);return new Response(null,{status:204})}
  assert.equal(method,'PUT');
  if(headers.get('if-none-match')==='*'&&value || headers.has('if-match')&&headers.get('if-match')!==value?.etag){report.sdkConflicts=(report.sdkConflicts||0)+1;return new Response(null,{status:412})}
  const etag=String(++sdkVersion);blobs.set(name,{body:init.body,etag});return new Response(null,{headers:{etag}});
 }
 if(url.origin!=='https://api.twilio.com' || !new RegExp('^/2010-04-01/Accounts/'+account+'/Calls/CA[a-f0-9]{32}\\.json$').test(url.pathname))return deny();
 const sid=url.pathname.split('/').at(-1).replace('.json',''),parent=calls.get(sid);report.providerProtocol.push({method,sid});assert.ok(parent);
 assert.match(new Headers(init.headers).get('authorization'),/^Basic /);assert.equal(new Headers(init.headers).has('idempotency-key'),false);
 if(method==='GET')return Response.json(parent);
 assert.equal(method,'POST');const body=Object.fromEntries(new URLSearchParams(init.body));assert.deepEqual(Object.keys(body).sort(),['Method','Url']);assert.equal(body.Method,'POST');assert.equal(new URL(body.Url).origin,origin);
 if(beforePost){const f=beforePost;beforePost=null;await f()}
 if(fault==='before')throw new Error('Lost before effect');parent.controlUrl=body.Url;
 if(fault==='after')throw new Error('Lost after effect');return Response.json(parent);
};
const store=await import('../netlify/functions/lib/store.mjs');
const {newClient,parseHours}=await import('../netlify/functions/lib/config.mjs');
const {configurationRevision}=await import('../netlify/functions/lib/setup.mjs');
const {workspaceEditRevision}=await import('../netlify/functions/lib/workspace-edit.mjs');
const {workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs');
const {accessHash}=await import('../netlify/functions/lib/access.mjs');
const {openAlert,runEscalation}=await import('../netlify/functions/lib/desk.mjs');
const voice=(await import('../netlify/functions/managed-vapi.mjs')).default,twilio=(await import('../netlify/functions/managed-voice.mjs')).default,owner=(await import('../netlify/functions/client.mjs')).default;
let serial=0;
async function check(name,run){fault=null;beforePost=null;process.env.VOICE_ACTIVATION_ENABLED='true';await store.put('health','brake',{on:false});try{await run();report.checks.push({name,pass:true})}catch(error){report.checks.push({name,pass:false,error:error.stack})}}
const iso=()=>new Date().toISOString();
async function fixture(options={}){
 const slug='handoff-'+(++serial),c=newClient({slug,ownerKey:'private-'+slug,owner:{email:slug+'@example.test',name:'Alex',phone:'+17135550142',backupPhone:'+17135550143'},business:{name:'Fixture Air',trade:'HVAC',serviceArea:['Katy'],hours:'Mon-Fri 8am-5pm',spanish:true}});
 Object.assign(c,{status:'testing',onboarding:{version:1,verifiedEmail:c.owner.email},services:['AC repair'],build:{status:'built'}});c.rules.hours=parseHours(c.business.hours);c.phone.businessNumber='+17135550144';c.phone.transferTo='+17135550145';c.phone.handoffEnabled=options.enabled!==false;
 if(options.primary)c.phone.transferTo=options.primary;if(options.backup!==undefined)c.owner.backupPhone=options.backup;
 const rev=configurationRevision(c);c.setupProof={reviewedRevision:rev,testedRevision:rev,testMode:'live'};await store.put('clients',slug,c);
 const tenant=workspaceTenant(c),parentId=slug+'/'+hash('first-phone-acquisition:'+tenant),number={id:'PN'+hash(slug).slice(0,32),number:'+17135550146'};
 await store.put('phone_activation_intents',parentId,{version:1,id:parentId,slug,tenantIdentity:tenant,state:'number_acquired',resource:number,createdAt:iso()});
 const id=slug+'/'+hash('managed-voice-v1:'+tenant),row={version:1,id,slug,tenantIdentity:tenant,inputRevision:rev,lifecycle:hash(JSON.stringify([c.status,0,null,null,null])),correlationId:hash(slug),callbackToken:hash(slug+'callback'),generation:1,state:'ready',policy:structuredClone(policy),policyDigest:hash(JSON.stringify(policy)),number,imported:{id:hash(slug+'import')},importedRoute:{vapiUrl:'https://api.vapi.ai/twilio/inbound_call'},routing:{confirmed:true,checkedAt:iso()},authority:{acceptedAuthority:true,policyDigest:hash(JSON.stringify(policy)),actor:{email:c.owner.email}},forwardingMode:'use_new_number'};
 await store.put('voice_activation_intents',id,row);await store.put('managed_voice_callbacks',row.callbackToken,{id,slug,tenantIdentity:tenant});
 const parent='CA'+hash(slug+'call').slice(0,32),vapiId=hash(slug+'vapi'),f={c,row,parent,vapiId,from:'+17135550999',child:'CA'+hash(slug+'child').slice(0,32),backup:'CA'+hash(slug+'backup').slice(0,32)};
 calls.set(parent,{sid:parent,account_sid:account,from:f.from,to:number.number,direction:'inbound',status:'in-progress'});
 assert.equal((await signed(f,'inbound')).status,200);const answer=await event(f,'assistant-request');assert.ok((await answer.json()).assistant.model.tools.some(tool=>tool.function.name==='request_human'));return f;
}
function event(f,type,extra={}){return voice(new Request(origin+'/api/managed-vapi',{method:'POST',headers:{'Content-Type':'application/json','x-vapi-secret':secret},body:JSON.stringify({message:{type,call:{id:f.vapiId,type:'inboundPhoneCall',phoneNumberId:f.row.imported.id,customer:{number:f.from},transport:{provider:'twilio',accountSid:account,callSid:f.parent}},...extra}})}))}
function signed(f,kind,extra={},leg=0,valid=true){const human=kind.startsWith('handoff'),url=origin+'/api/managed-voice?o='+f.row.callbackToken+'&kind='+kind+(human?'&p='+f.parent+'&leg='+leg:''),params={AccountSid:account,CallSid:f.parent,To:f.row.number.number,From:f.from,...extra};const sig=createHmac('sha1',token).update(url+Object.keys(params).sort().map(key=>key+params[key]).join('')).digest('base64');return twilio(new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(valid?{'x-twilio-signature':sig}:{})},body:new URLSearchParams(params)}))}
const input={connection:'live_transfer',caller_agreed:true,customer_name:'Pat',phone:'+17135550999',issue:'Warranty question',address:'123 Fixture St',language:'en'};
async function tool(f,patch={},id='tool-one'){const res=await event(f,'tool-calls',{toolCallList:[{id,function:{name:'request_human',arguments:{...input,...patch}}}]});const body=await res.json();return body.results[0].result?JSON.parse(body.results[0].result):body.results[0]}
const read=f=>store.get('managed_voice_calls',f.c.slug+'/'+f.parent);
const postCount=()=>report.providerProtocol.filter(row=>row.method==='POST').length;
const childParams=(f,leg=0)=>({CallSid:leg?f.backup:f.child,ParentCallSid:f.parent,From:f.row.number.number,To:leg?f.c.owner.backupPhone:f.c.phone.transferTo});
const statusParams=(f,status,leg=0,extra={})=>({DialCallSid:leg?f.backup:f.child,DialCallStatus:status,...extra});
const ledger=async f=>(await store.listJSON('managed_voice_usage',f.c.slug+'/',10))[0];
const ownerToken=f=>hash('session-'+f.c.slug);
async function ownerCall(f,body,method='POST',bearer=ownerToken(f)){await store.put('access_sessions',accessHash(ownerToken(f)),{email:f.c.owner.email,scope:'onboarding',status:'active',expiresAt:new Date(Date.now()+3600000).toISOString()});return owner(new Request(origin+'/api/client?c='+f.c.slug,{method,headers:{origin,'Content-Type':'application/json',authorization:'Bearer '+bearer},...(method==='GET'?{}:{body:JSON.stringify(body)})}))}

const {pathToFileURL}=await import('node:url'),{resolve,extname}=await import('node:path');
const {chromium}=await import(pathToFileURL('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--host-resolver-rules=MAP * ~NOTFOUND','--disable-background-networking','--no-first-run']});
report.browserErrors=[];report.screenshots=[];report.physicalExternalRequests=0;report.ownerJobs=[];
async function openOwner(f,width){
 await ownerCall(f,null,'GET');
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(x=>{sessionStorage.setItem('mc-onboarding-session-v1',x.token);localStorage.setItem('mc-walkthrough-v1:'+x.slug,'seen');},{token:ownerToken(f),slug:f.c.slug});
 await context.routeWebSocket('**/*',s=>s.close());
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin){if(['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return route.fulfill({status:200,contentType:'text/css',body:''});report.physicalExternalRequests++;return route.abort('blockedbyclient');}if(u.pathname==='/api/client'){const res=await owner(new Request(u,{method:r.method(),headers:r.headers(),...(r.method()==='GET'?{}:{body:r.postData()})}));return route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});}if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,contentType:'application/json',body:'{}'});const file=resolve(u.pathname.slice(1));assert.ok(file.startsWith(process.cwd()+'/'));return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'image/png',body:readFileSync(file)});});
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.browserErrors.push(e.message));await page.goto(origin+'/desk.html?c='+f.c.slug+'#leads');await page.waitForFunction(()=>document.body.dataset.workspaceState==='ready');if(await page.locator('#guideDialog').isVisible())await page.locator('#skipGuide').click();await page.locator('body[data-active-page="leads"]').waitFor();return {page,context};
}
async function screenshot(page,name){await page.locator('#leads [data-human-handoff]').scrollIntoViewIfNeeded();const path='scratchpad/managed-human-po-repaired-'+name+'.png';await page.screenshot({path});report.screenshots.push(path);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
async function refresh(page){await page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:desk-refresh')));}
try{
 for(const width of [1440,390]){
  await check(width+'px actual caller callback becomes actionable owner attention, acknowledgment preserves open request',async()=>{const f=await fixture(),before=postCount(),result=await tool(f,{connection:'callback'});assert.equal(result.callbackTimeConfirmed,false);assert.equal(postCount(),before);clock+=11*60000;process.env.VOICE_ACTIVATION_ENABLED='false';await(await import('../netlify/functions/scheduler.mjs')).run({forceHour:3,forceDay:2,inline:true});process.env.VOICE_ACTIVATION_ENABLED='true';const {page,context}=await openOwner(f,width);try{await page.locator('#leads .ack').waitFor();const text=await page.locator('#leads').innerText();assert.match(text,/7135550999|713.*555.*0999/);assert.match(text,/callback|wants call/i);assert.match(text,/No callback time confirmed/i);await screenshot(page,width+'-callback-attention');await page.locator('#leads .ack').click();await page.waitForFunction(()=>document.querySelectorAll('#leads .ack').length===0);assert.equal((await store.get('alerts',f.c.slug+'/'+result.reference)).status,'acked');assert.equal((await store.get('leads',f.c.slug+'/'+result.reference)).status,'open');await page.reload();await page.waitForFunction(()=>document.body.dataset.workspaceState==='ready');assert.equal(await page.locator('#leads .ack').count(),0);assert.equal((await store.get('leads',f.c.slug+'/'+result.reference)).status,'open');}finally{await context.close();}});
  await check(width+'px primary no-answer and backup refusal produce honest saved request without connection success',async()=>{const f=await fixture(),result=await tool(f);await signed(f,'handoff');const backupXml=await(await signed(f,'handoff-status',statusParams(f,'no-answer'))).text();assert.match(backupXml,/<Dial/);await signed(f,'handoff-screen',childParams(f,1),1);assert.match(await(await signed(f,'handoff-accept',{...childParams(f,1),Digits:''},1)).text(),/<Hangup/);const final=await(await signed(f,'handoff-status',statusParams(f,'completed',1,{DialBridged:'false'}),1)).text();assert.doesNotMatch(final,/<Dial/);assert.match(final,/callback time has not been confirmed/);const {page,context}=await openOwner(f,width);try{await page.locator('#leads [data-human-handoff]').filter({hasText:'Live transfer did not connect'}).waitFor();assert.match(await page.locator('#leads [data-human-handoff]').innerText(),/No callback time confirmed/);assert.equal(await page.locator('#leads .ack').count(),1);assert.equal((await store.get('leads',f.c.slug+'/'+result.reference)).status,'open');await screenshot(page,width+'-no-person');}finally{await context.close();}});
  await check(width+'px human press1 acknowledges only; provider bridge receipt confirms connection without closing request',async()=>{const f=await fixture(),result=await tool(f);await signed(f,'handoff');const screen=await(await signed(f,'handoff-screen',childParams(f))).text();assert.match(screen,/Press 1/);await signed(f,'handoff-accept',{...childParams(f),Digits:'1'});const {page,context}=await openOwner(f,width);try{await page.locator('#leads [data-human-handoff]').filter({hasText:'Person accepted; connection unconfirmed'}).waitFor();assert.equal(await page.locator('#leads .ack').count(),0);assert.equal((await store.get('leads',f.c.slug+'/'+result.reference)).status,'open');await signed(f,'handoff-status',statusParams(f,'completed',0,{DialBridged:'true'}));await refresh(page);await page.locator('#leads [data-human-handoff]').filter({hasText:'provider confirmed connection'}).waitFor();assert.equal((await store.get('leads',f.c.slug+'/'+result.reference)).status,'open');assert.match(await page.locator('#leads [data-human-handoff]').innerText(),/No callback time confirmed/);await screenshot(page,width+'-confirmed-person');await page.reload();await page.waitForFunction(()=>document.body.dataset.workspaceState==='ready');assert.match(await page.locator('#leads [data-human-handoff]').innerText(),/provider confirmed connection/);}finally{await context.close();}});
 }
}finally{await browser.close();}
report.sourceAfter=source();report.sourceMatched=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.passed=report.checks.filter(x=>x.pass).length;report.total=report.checks.length;report.ok=report.sourceMatched&&report.checks.every(x=>x.pass)&&!report.browserErrors.length&&!report.physicalExternalRequests;writeFileSync('scratchpad/managed-human-po-second.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:report.ok,passed:report.passed,total:report.total,sourceMatched:report.sourceMatched,browserErrors:report.browserErrors,physicalExternalRequests:report.physicalExternalRequests,failures:report.checks.filter(x=>!x.pass)},null,2));if(!report.ok)process.exitCode=1;
