// Strict daily new-workspace AI budget. Installed SDK responses and Blobs are offline protocol fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const deny=()=>{throw new Error('Network disabled by self-service-ai-check');};
net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
for(const key of Object.keys(process.env))if(/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|MC_SELF_SERVICE_AI_)/.test(key))delete process.env[key];
Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:'http://127.0.0.1:8888',PUBLIC_SITE_URL:'http://127.0.0.1:8888',ANTHROPIC_API_KEY:'offline-ai-placeholder',ANTHROPIC_BASE_URL:'https://ai-model.invalid'});
const RealDate=Date;let clock=RealDate.parse('2030-06-10T15:00:00Z');
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const blobs=new Map();let etag=0,conflicts=0,unexpected=0,fault=null,hold=null,modelMode='success',modelRequests=0;
const writes=[];
function modelResponse(){
 const events=[];const emit=data=>events.push(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
 emit({type:'message_start',message:{id:'offline-model',type:'message',role:'assistant',content:[],model:'claude-opus-5-5',stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}});
 emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:'The shop can confirm those details directly.'}});emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}});emit({type:'message_stop'});
 return new Response(events.join(''),{headers:{'content-type':'text/event-stream'}});
}
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.origin==='https://ai-model.invalid'&&url.pathname==='/v1/messages'){modelRequests++;return modelMode==='success'?modelResponse():Response.json({type:'error',error:{type:'api_error',message:'Offline injected model failure'}},{status:500});}
 if(url.origin!=='https://ai-blobs.invalid'){unexpected++;return deny();}
 const[,site,kind,...parts]=url.pathname.split('/').map(decodeURIComponent);assert.equal(site,'offline-site');const key=parts.join('/'),name=kind+'/'+key,method=String(init.method||'GET').toUpperCase();
 let hit=fault&&fault.kind===kind&&fault.key===key&&fault.method===method?fault:null;
 if(hit?.mode==='reject')return new Response('Offline injected storage rejection',{status:400});
 if(method==='GET'&&!key){const prefix=url.searchParams.get('prefix')||'';return Response.json({blobs:[...blobs.keys()].filter(k=>k.startsWith(kind+'/'+prefix)).map(k=>({key:k.slice(kind.length+1)})),directories:[]});}
 let current=blobs.get(name);
 if(hold&&method==='GET'&&kind===hold.kind&&key===hold.key){const wait=hold;hold=null;const snapshot=current;wait.reached();await wait.release;current=snapshot;}
 if(method==='GET')return current?new Response(current.value,{headers:{etag:current.etag,'content-type':'application/json'}}):new Response(null,{status:404});
 if(method==='DELETE'){blobs.delete(name);return new Response(null,{status:204});}
 assert.equal(method,'PUT');const headers=new Headers(init.headers);current=blobs.get(name);
 if((headers.get('if-none-match')==='*'&&current)||(headers.has('if-match')&&headers.get('if-match')!==current?.etag)){conflicts++;return new Response(null,{status:412});}
 const tag=String(++etag);blobs.set(name,{value:init.body,etag:tag});writes.push({kind,key});
 if(hit){hit.mode='reject';throw new TypeError('Offline committed write lost its response before retry rejection');}
 return new Response(null,{headers:{etag:tag}});
};
const {setEnvironmentContext}=await import('@netlify/blobs');setEnvironmentContext({siteID:'offline-site',token:'offline-token',edgeURL:'https://ai-eventual.invalid',uncachedEdgeURL:'https://ai-blobs.invalid'});
const store=await import('../netlify/functions/lib/store.mjs');
const {newClient}=await import('../netlify/functions/lib/config.mjs');
const {configurationRevision}=await import('../netlify/functions/lib/setup.mjs');
const {accessHash}=await import('../netlify/functions/lib/access.mjs');
const {AI_BUDGET_KIND:KIND,AI_BUDGET_KEY:KEY,getAIAllowance,reserveAIRequest}=await import('../netlify/functions/lib/self-service-ai.mjs');
const chat=(await import('../netlify/functions/chat.mjs')).default,clientAPI=(await import('../netlify/functions/client.mjs')).default;
let serial=0,checks=0;const cases=[];
const check=(name,fn)=>{fn();checks++;cases.push(name);};
function tenant(label){const n=++serial,c=newClient({slug:`ai-${label}-${n}`,ownerKey:`internal-${n}`,owner:{name:'QA Owner',email:`owner-${n}@example.invalid`,phone:'+17135550140'},business:{name:'Offline Air',trade:'HVAC',serviceArea:['Katy'],hours:'Mon-Fri 8am-5pm'}});c.onboarding={version:1};c.status='live';c.build={status:'built'};c.services=['AC repair'];c.channels={web:{active:true}};const revision=configurationRevision(c);c.setupProof={reviewedRevision:revision,testedRevision:revision,testMode:'live'};return c;}
const reset=()=>store.del(KIND,KEY);
const state=(day,slug,privateUsed,webUsed)=>({version:1,day,used:privateUsed+webUsed,tenants:{[slug]:{private:privateUsed,web:webUsed}}});
const session=async c=>{const token=createHash('sha256').update(c.slug).digest('hex');await store.put('access_sessions',accessHash(token),{scope:'onboarding',email:c.owner.email,status:'active',expiresAt:new Date(clock+3600000).toISOString()});return token;};
const req=(path,body,token,method='POST')=>new Request(process.env.URL+path,{method,headers:{Origin:process.env.URL,'content-type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
const callChat=(c,token,channel='test',messages=[{role:'user',content:'How much is your service fee?'}])=>chat(req('/api/chat',{client:c.slug,channel,contact:'offline-turn-'+(++serial),messages},token),{ip:'192.0.2.44'});
async function suite(backend){
 process.env.MC_MEMORY_STORE=backend==='memory'?'1':'0';process.env.MC_FAKE_MODEL='1';delete process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT;clock=RealDate.parse('2030-06-10T15:00:00Z');await reset();
 let c=tenant('private');let results=await Promise.all(Array.from({length:70},()=>reserveAIRequest(c,'private')));
 check(backend+': concurrent private ceiling',()=>{assert.equal(results.filter(x=>x.allowed).length,20);assert.equal(results.at(-1).aiAllowance.private.remaining,0);});
 await reset();c=tenant('web');results=await Promise.all(Array.from({length:80},()=>reserveAIRequest(c,'web')));check(backend+': concurrent web/global ceiling',()=>assert.equal(results.filter(x=>x.allowed).length,50));
 await reset();const tenants=Array.from({length:8},()=>tenant('shared'));results=await Promise.all(Array.from({length:80},(_,i)=>reserveAIRequest(tenants[i%tenants.length],i%3===0?'private':'web')));const shared=await store.get(KIND,KEY);
 check(backend+': one global ceiling for both modes and all tenants',()=>{assert.equal(results.filter(x=>x.allowed).length,50);assert.equal(shared.used,50);assert.ok(Object.values(shared.tenants).some(row=>row.private>0));assert.ok(Object.values(shared.tenants).some(row=>row.web>0));});
 const other=await getAIAllowance(tenant('another'));check(backend+': global exhaustion closes another tenant without leaking other usage',()=>{assert.equal(other.available,false);assert.equal(other.private.used,0);assert.equal(other.private.remaining,0);assert.equal(other.web.remaining,0);assert.equal(other.tenants,undefined);});
 await reset();c=tenant('last-slot');await store.put(KIND,KEY,state('2030-06-10',c.slug,19,30));results=await Promise.all(Array.from({length:12},(_,n)=>reserveAIRequest(c,n%2?'web':'private')));check(backend+': one last shared slot across modes',()=>{assert.equal(results.filter(x=>x.allowed).length,1);assert.equal((results.filter(x=>x.allowed)[0].aiAllowance).web.remaining,0);});
 // Houston midnight resets use the actual offset on spring/fall transitions.
 for(const[at,expected]of[['2030-03-10T06:00:00Z','2030-03-11T05:00:00.000Z'],['2030-11-03T05:00:00Z','2030-11-04T06:00:00.000Z']]){await reset();clock=RealDate.parse(at);const allowance=await getAIAllowance(c);check(backend+': DST reset '+at,()=>assert.equal(allowance.resetAt,expected));}
 await reset();clock=RealDate.parse('2030-06-10T15:00:00Z');process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT='0';check(backend+': operator kill switch',()=>{});assert.equal((await reserveAIRequest(c,'private')).allowed,false);process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT='501';await assert.rejects(()=>getAIAllowance(c),/Invalid self-service AI limit/);delete process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT;
 // Actual handlers: valid current receipts are explicit fixtures; no actual inference is made.
 c=tenant('handlers');await store.saveClient(c);const token=await session(c);await reset();modelRequests=0;
 let response=await callChat(c,null);check(backend+': unauthorized test not charged',()=>assert.equal(response.status,401));response=await callChat(c,token,'test',[]);check(backend+': invalid input not charged',()=>assert.equal(response.status,400));assert.equal(await store.get(KIND,KEY),null);
 const beforeHistory=await store.list('owner_tests',c.slug+'/');await store.put(KIND,KEY,state('2030-06-10',c.slug,20,30));const beforeWrites=writes.length;
 response=await callChat(c,token);const denied=await response.json();check(backend+': private denial precedes model/test writes',()=>{assert.equal(response.status,429);assert.equal(denied.error,'ai_daily_limit');assert.match(denied.message,/practice/);assert.equal(modelRequests,0);assert.equal(writes.length,beforeWrites);});assert.deepEqual(await store.list('owner_tests',c.slug+'/'),beforeHistory);
 process.env.MC_FAKE_MODEL='0';const beforeConversations=await store.list('conversations',c.slug+'/');response=await callChat(c,null,'web');const publicDenied=await response.json();check(backend+': public denial precedes model/conversation writes',()=>{assert.equal(response.status,429);assert.equal(publicDenied.aiAllowance,undefined);assert.equal(modelRequests,0);assert.equal(writes.length,beforeWrites);});assert.deepEqual(await store.list('conversations',c.slug+'/'),beforeConversations);
 response=await clientAPI(req('/api/client?c='+c.slug,null,null,'GET'));const publicView=await response.json();check(backend+': public availability exposes no private quota',()=>{assert.equal(response.status,200);assert.equal(publicView.webAvailable,false);assert.equal(publicView.aiAllowance,undefined);});
 response=await clientAPI(req('/api/client?c='+c.slug,null,token,'GET'));const owner=await response.json();check(backend+': owner receives quota but not other tenant records',()=>{assert.equal(owner.aiAllowance.web.remaining,0);assert.equal(owner.webAvailable,false);assert.equal(owner.aiAllowance.tenants,undefined);});
 await store.saveClient({...c,status:'testing',channels:{web:{active:false}}});response=await clientAPI(req('/api/client?c='+c.slug,{action:'go_live'},token));check(backend+': exhausted quota cannot activate chat',()=>assert.equal(response.status,429));assert.equal((await store.getClient(c.slug)).status,'testing');await store.saveClient(c);
 await reset();modelMode='reject';modelRequests=0;response=await callChat(c,token);check(backend+': failed SDK/model attempt remains charged',()=>{assert.equal(response.status,502);assert.ok(modelRequests>=1);});assert.equal((await getAIAllowance(c)).private.used,1);assert.deepEqual(await store.list('owner_tests',c.slug+'/'),beforeHistory);
 modelMode='success';response=await callChat(c,token);check(backend+': next accepted private turn charges again',()=>assert.equal(response.status,200));assert.equal((await getAIAllowance(c)).private.used,2);
 response=await callChat(c,null,'web');check(backend+': actual public handler consumes same global document',()=>assert.equal(response.status,200));assert.equal((await getAIAllowance(c)).web.used,1);assert.equal((await store.get(KIND,KEY)).used,3);
 if(backend==='sdk'){
  await reset();clock=RealDate.parse('2030-06-11T04:59:59Z');await store.put(KIND,KEY,state('2030-06-10',c.slug,19,30));let reached,release;const entered=new Promise(r=>{reached=r;}),gate=new Promise(r=>{release=r;});hold={kind:'site:'+KIND,key:KEY,reached,release:gate};const beforeConflicts=conflicts,pending=reserveAIRequest(c,'private');await entered;
  await store.put(KIND,KEY,state('2030-06-10',c.slug,20,30));clock=RealDate.parse('2030-06-11T05:00:01Z');release();const reserved=await pending,rolled=await store.get(KIND,KEY);
  check('sdk: midnight is recomputed inside an actual CAS retry',()=>{assert.equal(reserved.allowed,true);assert.equal(rolled.day,'2030-06-11');assert.equal(rolled.used,1);assert.ok(conflicts>beforeConflicts);});
  await reset();await session(c);modelRequests=0;const priorTests=await store.list('owner_tests',c.slug+'/'),priorWrites=writes.length;fault={kind:'site:'+KIND,key:KEY,method:'GET',mode:'reject'};response=await callChat(c,token);check('sdk: unreadable budget fails before SDK/history',()=>{assert.equal(response.status,503);assert.equal(modelRequests,0);assert.equal(writes.length,priorWrites);});fault=null;assert.deepEqual(await store.list('owner_tests',c.slug+'/'),priorTests);
  fault={kind:'site:'+KIND,key:KEY,method:'PUT',mode:'commit'};response=await callChat(c,token);check('sdk: ambiguous committed reservation is retained without model call',()=>{assert.equal(response.status,503);assert.equal(modelRequests,0);});fault=null;assert.equal((await getAIAllowance(c)).private.used,1);assert.deepEqual(await store.list('owner_tests',c.slug+'/'),priorTests);
 }
 await reset();process.env.MC_FAKE_MODEL='0';const legacy={...tenant('legacy'),onboarding:undefined};await store.saveClient(legacy);response=await chat(req('/api/chat',{client:legacy.slug,key:legacy.ownerKey,contact:'legacy',messages:[{role:'user',content:'What do you repair?'}]}));check(backend+': legacy client remains outside new budget',()=>assert.equal(response.status,200));response=await chat(req('/api/chat',{persona:'bayou-air',messages:[{role:'user',content:'What do you repair?'}]}));check(backend+': homepage practice remains outside new budget',()=>assert.equal(response.status,200));assert.equal(await store.get(KIND,KEY),null);
 process.env.MC_FAKE_MODEL='1';
}
await suite('memory');await suite('sdk');assert.equal(unexpected,0);assert.ok(conflicts>0);
console.log(JSON.stringify({ok:true,checks,casConflicts:conflicts,cases,actualExternalRequests:unexpected,backends:['memory','installed Blobs SDK protocol double'],model:'in-process streaming SDK fixture; no actual inference',budgetUnit:'accepted logical chat turn; bounded internal agent/SDK retries included in that turn'},null,2));
