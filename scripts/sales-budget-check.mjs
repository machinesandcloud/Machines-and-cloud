// Strict public sales daily AI budget. Installed SDK responses and Blobs are offline protocol fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const deny=()=>{throw new Error('Network disabled by sales-budget-check');};
net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
for(const key of Object.keys(process.env))if(/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|MC_SALES_AI_)/.test(key))delete process.env[key];
Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:'http://127.0.0.1:8888',PUBLIC_SITE_URL:'http://127.0.0.1:8888',ANTHROPIC_API_KEY:'offline-ai-placeholder',ANTHROPIC_BASE_URL:'https://ai-model.invalid'});
const RealDate=Date;let clock=RealDate.parse('2030-06-10T15:00:00Z');
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const blobs=new Map();let etag=0,conflicts=0,unexpected=0,fault=null,hold=null,modelMode='success',modelRequests=0;
const writes=[],modelBodies=[];
function modelResponse(){
 const events=[];const emit=data=>events.push(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
 emit({type:'message_start',message:{id:'offline-model',type:'message',role:'assistant',content:[],model:'claude-opus-5-5',stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}});
 emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:'The shop can confirm those details directly.'}});emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}});emit({type:'message_stop'});
 return new Response(events.join(''),{headers:{'content-type':'text/event-stream'}});
}
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(url.origin==='https://ai-model.invalid'&&url.pathname==='/v1/messages'){modelRequests++;modelBodies.push(JSON.parse(init.body));return modelMode==='success'?modelResponse():Response.json({type:'error',error:{type:'api_error',message:'Offline injected model failure'}},{status:500});}
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
const { SALES_BUDGET_KIND:KIND, SALES_BUDGET_KEY:KEY, getSalesAllowance, reserveSalesTurn }=await import('../netlify/functions/lib/sales-budget.mjs');
const chat=(await import('../netlify/functions/chat.mjs')).default;
const {newClient}=await import('../netlify/functions/lib/config.mjs');
const {configurationRevision}=await import('../netlify/functions/lib/setup.mjs');
const {accessHash}=await import('../netlify/functions/lib/access.mjs');
const cases=[];
const check=(name,fn)=>{fn();cases.push(name);};
const reset=()=>store.del(KIND,KEY);
const ipHash=ip=>createHash('sha256').update('mc-sales-v1\0'+ip).digest('hex');
const state=(day,rows)=>({version:1,day,used:Object.values(rows).reduce((a,b)=>a+b,0),ips:Object.fromEntries(Object.entries(rows).map(([ip,n])=>[ipHash(ip),n]))});
const req=(body,method='POST',headers={})=>new Request(process.env.URL+'/api/chat'+(method==='GET'?'?mode=sales':''),{method,headers:{Origin:process.env.URL,'Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});
const call=(body={messages:[{role:'user',content:'How does setup work?'}]},ip='192.0.2.44',headers={})=>chat(req(body,'POST',headers),{ip});
async function suite(backend){
 process.env.MC_MEMORY_STORE=backend==='memory'?'1':'0';process.env.MC_FAKE_MODEL='0';delete process.env.MC_SALES_AI_GLOBAL_DAILY_LIMIT;delete process.env.MC_SALES_AI_IP_DAILY_LIMIT;clock=RealDate.parse('2030-06-10T15:00:00Z');await reset();
 let results=await Promise.all(Array.from({length:60},()=>reserveSalesTurn('192.0.2.1')));
 check(backend+': sixty concurrent requests share exactly twenty IP slots',()=>{assert.equal(results.filter(x=>x.allowed).length,20);assert.equal(results.at(-1).allowance.available,false);});
 await reset();results=await Promise.all(Array.from({length:80},(_,i)=>reserveSalesTurn('192.0.2.'+(1+i%8))));
 check(backend+': eight IP buckets share exactly fifty global slots',()=>{assert.equal(results.filter(x=>x.allowed).length,50);});
 const saved=await store.get(KIND,KEY);check(backend+': stored counts are consistent with no raw IP fields',()=>{assert.equal(saved.used,50);assert.equal(Object.values(saved.ips).reduce((a,b)=>a+b,0),50);assert.ok(Object.keys(saved.ips).every(k=>/^[a-f0-9]{64}$/.test(k)));});
 await reset();await store.put(KIND,KEY,state('2030-06-10',{'192.0.2.1':20,'192.0.2.2':20,'192.0.2.3':9}));results=await Promise.all(Array.from({length:20},(_,n)=>reserveSalesTurn('198.51.100.'+n)));
 check(backend+': last shared slot has one winner',()=>assert.equal(results.filter(x=>x.allowed).length,1));
 await reset();results=await Promise.all(Array.from({length:30},()=>reserveSalesTurn('')));check(backend+': absent IP shares one conservative bucket',()=>assert.equal(results.filter(x=>x.allowed).length,20));
 await reset();const before=writes.length,allowance=await getSalesAllowance('192.0.2.99');check(backend+': status check neither creates nor spends allowance',()=>{assert.equal(allowance.remaining,20);assert.equal(writes.length,before);});
 for(const[at,expected]of[['2030-03-10T06:00:00Z','2030-03-11T05:00:00.000Z'],['2030-11-03T05:00:00Z','2030-11-04T06:00:00.000Z']]){await reset();clock=RealDate.parse(at);const a=await getSalesAllowance('192.0.2.1');check(backend+': correct Houston reset across DST '+at,()=>assert.equal(a.resetAt,expected));}
 clock=RealDate.parse('2030-06-10T15:00:00Z');await reset();process.env.MC_SALES_AI_GLOBAL_DAILY_LIMIT='0';check(backend+': global kill switch',()=>{});assert.equal((await reserveSalesTurn('192.0.2.1')).allowed,false);delete process.env.MC_SALES_AI_GLOBAL_DAILY_LIMIT;process.env.MC_SALES_AI_IP_DAILY_LIMIT='0';assert.equal((await reserveSalesTurn('192.0.2.1')).allowed,false);delete process.env.MC_SALES_AI_IP_DAILY_LIMIT;
 for(const[name,value]of[['MC_SALES_AI_GLOBAL_DAILY_LIMIT','501'],['MC_SALES_AI_IP_DAILY_LIMIT','101'],['MC_SALES_AI_GLOBAL_DAILY_LIMIT','NaN'],['MC_SALES_AI_GLOBAL_DAILY_LIMIT','-1']]){process.env[name]=value;await assert.rejects(()=>getSalesAllowance('192.0.2.1'),/Invalid sales AI allowance configuration/);delete process.env[name];}
 check(backend+': malformed operator limits fail closed',()=>{});
 for(const bad of [{version:1,day:'2030-06-10',used:1,ips:{}},{version:1,day:'2030-02-30',used:0,ips:{}},{version:1,day:'2030-06-11',used:0,ips:{}}]){await store.put(KIND,KEY,bad);await assert.rejects(()=>getSalesAllowance('192.0.2.1'));}
 check(backend+': malformed inconsistent or future storage fails closed',()=>{});
 await reset();modelRequests=0;modelBodies.length=0;
 let response=await call({messages:[]});check(backend+': invalid history does not reserve a turn',()=>assert.equal(response.status,400));assert.equal(await store.get(KIND,KEY),null);
 response=await call({persona:'mc',client:'other-shop',messages:[{role:'user',content:'Save a booking.'}]});check(backend+': explicit sales and tenant modes cannot be mixed',()=>assert.equal(response.status,400));assert.equal(await store.get(KIND,KEY),null);
 response=await call(undefined,undefined,{Origin:'https://unrelated.invalid'});check(backend+': forbidden origin consumes no allowance/model',()=>{assert.equal(response.status,403);assert.equal(modelRequests,0);});assert.equal(await store.get(KIND,KEY),null);
 response=await chat(req(null,'GET'),{ip:'192.0.2.44'});const status=await response.json();check(backend+': public status endpoint is read-only with no usage/bucket leak',()=>{assert.equal(response.status,200);assert.deepEqual(Object.keys(status).sort(),['available','resetAt']);assert.equal(status.available,true);});assert.equal(await store.get(KIND,KEY),null);
 await store.put(KIND,KEY,state('2030-06-10',{'192.0.2.44':20}));process.env.ADMIN_KEY='offline-admin-placeholder';const preWrites=writes.length;
 response=await call(undefined,undefined,{'x-admin-key':process.env.ADMIN_KEY});const denied=await response.json();check(backend+': admin cannot bypass sales IP quota',()=>{assert.equal(response.status,429);assert.equal(denied.error,'sales_daily_limit');assert.equal(modelRequests,0);assert.equal(writes.length,preWrites);assert.ok(denied.resetAt);});
 await reset();modelMode='reject';response=await call();check(backend+': failed model turn remains charged and has zero SDK automatic retries',()=>{assert.equal(response.status,502);assert.equal(modelRequests,1);});assert.equal((await store.get(KIND,KEY)).used,1);
 modelMode='success';const longAnswer='x'.repeat(1800)+' Correct fee $89.';const history=Array.from({length:25},(_,i)=>({role:i%2?'assistant':'user',content:i===1?longAnswer:i===0?'Early plumbing in Katy.':'Message '+i}));response=await call({messages:history});check(backend+': actual sales handler retains twelve exchanges and long assistant correction',()=>{assert.equal(response.status,200);const sent=modelBodies.at(-1);assert.equal(sent.messages.length,25);assert.equal(sent.messages[0].content,'Early plumbing in Katy.');assert.equal(sent.messages[1].content,longAnswer);assert.equal(sent.max_tokens,3072);assert.equal(sent.output_config.effort,'medium');assert.equal(sent.thinking.type,'adaptive');assert.deepEqual(sent.tools.map(t=>t.name),['estimate_call_volume','assess_workflow_fit','suggest_next_step']);assert.doesNotMatch(sent.system[0].text,/Lead recorded\. Steve will follow up/);});
 const outcome=await response.json();check(backend+': usage is explicit server output rather than a billing guarantee',()=>{assert.equal(outcome.usage.requests,1);assert.ok(outcome.reply);});
 const priorCount=(await store.get(KIND,KEY)).used;response=await call({persona:'bayou-air',messages:[{role:'user',content:'Do you work in Katy?'}]});check(backend+': fictional practice remains outside sales allowance',()=>assert.equal(response.status,200));assert.equal((await store.get(KIND,KEY)).used,priorCount);
 const c=newClient({slug:'sales-isolation-'+backend,ownerKey:'legacy-fixture-key',owner:{name:'Fixture',email:'fixture@example.invalid',phone:'+17135550140'},business:{name:'Fixture Air',trade:'HVAC',serviceArea:['Katy'],hours:'Mon-Fri 8am-5pm'}});c.status='testing';await store.saveClient(c);response=await call({client:c.slug,key:c.ownerKey,messages:[{role:'user',content:'Do you work in Katy?'}]});check(backend+': legacy owner chat remains outside sales allowance',()=>assert.equal(response.status,200));assert.equal((await store.get(KIND,KEY)).used,priorCount);
 c.onboarding={version:1};c.services=['AC repair'];c.build={status:'built'};const revision=configurationRevision(c);c.setupProof={reviewedRevision:revision,testedRevision:revision,testMode:'live'};await store.saveClient(c);const token=createHash('sha256').update('sales-fixture-'+backend).digest('hex');await store.put('access_sessions',accessHash(token),{scope:'onboarding',email:c.owner.email,status:'active',expiresAt:new Date(clock+3600000).toISOString()});response=await call({client:c.slug,channel:'test',messages:[{role:'user',content:'Do you work in Katy?'}]},undefined,{Authorization:'Bearer '+token});check(backend+': new owner private test uses its own independent budget',()=>assert.equal(response.status,200));assert.equal((await store.get(KIND,KEY)).used,priorCount);
 if(backend==='sdk'){
  await reset();clock=RealDate.parse('2030-06-11T04:59:59Z');await store.put(KIND,KEY,state('2030-06-10',{'192.0.2.1':19}));let reached,release;const entered=new Promise(r=>{reached=r;}),gate=new Promise(r=>{release=r;});hold={kind:'site:'+KIND,key:KEY,reached,release:gate};const beforeConflicts=conflicts,pending=reserveSalesTurn('192.0.2.1');await entered;await store.put(KIND,KEY,state('2030-06-10',{'192.0.2.1':20}));clock=RealDate.parse('2030-06-11T05:00:01Z');release();const reserved=await pending,rolled=await store.get(KIND,KEY);check('sdk: midnight recomputed after held strong-read CAS conflict',()=>{assert.equal(reserved.allowed,true);assert.equal(rolled.day,'2030-06-11');assert.equal(rolled.used,1);assert.ok(conflicts>beforeConflicts);});
  await reset();modelRequests=0;fault={kind:'site:'+KIND,key:KEY,method:'GET',mode:'reject'};response=await call();check('sdk: unavailable storage blocks before any model call',()=>{assert.equal(response.status,503);assert.equal(modelRequests,0);});fault=null;
  fault={kind:'site:'+KIND,key:KEY,method:'PUT',mode:'commit'};response=await call();check('sdk: ambiguous committed write is retained and no model call follows',()=>{assert.equal(response.status,503);assert.equal(modelRequests,0);});fault=null;assert.equal((await store.get(KIND,KEY)).used,1);
 }
 await reset();
}
await suite('memory');await suite('sdk');assert.equal(unexpected,0);assert.ok(conflicts>0);
console.log(JSON.stringify({ok:true,checks:cases.length,cases,casConflicts:conflicts,actualExternalRequests:unexpected,backends:['in-memory CAS','installed Blobs SDK protocol double'],inference:'Installed Anthropic SDK stream protocol double only; not actual AI quality.',budgetUnit:'Accepted logical sales turns, including failures. Up to three agent requests per accepted sales turn; not a monetary or whole-platform ceiling.'},null,2));
