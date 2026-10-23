// Independent offline protocol boundary. Real SDK, handlers, CAS, tools and assets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { syncBuiltinESMExports, register } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
export const ownerOrigin='https://platform.fixture.invalid', siteA='https://customer-a.fixture.invalid', siteB='https://customer-b.fixture.invalid';
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const effects={physicalNetwork:0,modelRequests:0,requests:[],modelInputs:[],storageFaults:0};
for(const key of Object.keys(process.env))if(/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key))delete process.env[key];
Object.assign(process.env,{MC_MEMORY_STORE:'0',MC_FAKE_MODEL:'0',NODE_ENV:'test',URL:ownerOrigin,PUBLIC_SITE_URL:ownerOrigin,ANTHROPIC_API_KEY:'offline-placeholder-only',ANTHROPIC_BASE_URL:'https://installation-model.invalid'});
const deny=()=>{effects.physicalNetwork++;throw Error('Independent G2 QA denied physical network');};
net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
register('data:text/javascript,'+encodeURIComponent(`import {createRequire} from 'node:module'; import {pathToFileURL} from 'node:url'; const req=createRequire(${JSON.stringify(resolve('package.json'))}); export async function resolve(s,c,n){if(!s.startsWith('.')&&!s.startsWith('/')&&!s.includes(':')){try{return {url:pathToFileURL(req.resolve(s)).href,shortCircuit:true};}catch{}}return n(s,c);}`));
export const blobs=new Map(); let etag=0,serial=0;
let modelGate=null,storageGate=null;
export function holdModel(predicate=()=>true){let reached,release;const entered=new Promise(r=>{reached=r;}),gate=new Promise(r=>{release=r;});modelGate={predicate,reached,gate};return{entered,release};}
export function holdStorage(predicate,afterWrite=false){let reached,release;const entered=new Promise(r=>{reached=r;}),gate=new Promise(r=>{release=r;});storageGate={predicate,reached,gate,afterWrite};return{entered,release};}
export function clearGates(){modelGate=null;storageGate=null;}

export const fault={predicate:null,mode:'reject',left:0};
export function faultStorage(predicate,mode='reject',left=20){Object.assign(fault,{predicate,mode,left});}
export function clearFault(){fault.predicate=null;fault.left=0;}
export let modelMode='tool';export const setModelMode=value=>{modelMode=value;};
const leadInput={customer_name:'Jamie Fixture',phone:'+17135550142',address:'12 Fixture St, Katy',issue:'AC running but not cooling',reason:'wants_call',urgency:'flexible',wanted:'A callback when available',language:'en',nobook_reason:'other',unsure:{unsure:false,reason:''}};
function modelResponse(body){
  effects.modelInputs.push(structuredClone(body));const last=body.messages.at(-1);let text=body.messages.filter(m=>typeof m.content==='string').map(m=>m.content).join('\n');
  let input={...leadInput};try{const tagged=text.match(/QA_INPUT:(\{[^\n]+\})/);if(tagged)input={...input,...JSON.parse(tagged[1])};}catch{}
  const tool=modelMode==='tool'&&typeof last.content==='string'&&!text.includes('QA_QUESTION_ONLY');
  const events=[];const emit=data=>events.push(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  emit({type:'message_start',message:{id:'offline-'+(++serial),type:'message',role:'assistant',content:[],model:'claude-opus-5-5',stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}});
  if(tool){emit({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'tool-'+serial,name:'notify_owner',input:{}}});emit({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(input)}});}
  else{emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:'Your request is saved in the shop portal. The shop will confirm the next step directly.'}});}
  emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:20}});emit({type:'message_stop'});
  return new Response(events.join(''),{headers:{'content-type':'text/event-stream'}});
}
globalThis.fetch=async(input,init={})=>{
  const request=input instanceof Request?input:null,url=new URL(request?request.url:String(input)),method=String(init.method||request?.method||'GET').toUpperCase();
  if(url.origin==='https://installation-model.invalid'&&url.pathname==='/v1/messages'){effects.modelRequests++;const body=JSON.parse(init.body||await request.text());if(modelGate&&modelGate.predicate(body)){const g=modelGate;modelGate=null;g.reached();await g.gate;}return modelResponse(body);}
  if(url.origin!=='https://installation-blobs.invalid')return deny();
  const[,site,kind,...parts]=url.pathname.split('/').map(decodeURIComponent);assert.equal(site,'offline-site');const key=parts.join('/'),name=kind+'/'+key;const matchGate=storageGate&&storageGate.predicate({kind,key,method});if(matchGate&&!storageGate.afterWrite){const g=storageGate;storageGate=null;g.reached();await g.gate;}
  let hit=fault.left>0&&fault.predicate?.({kind,key,method});if(hit){fault.left--;effects.storageFaults++;if(fault.mode==='reject')return new Response('Explicit offline storage rejection',{status:400});}
  if(method==='GET'&&!key){const prefix=url.searchParams.get('prefix')||'';return Response.json({blobs:[...blobs.keys()].filter(k=>k.startsWith(kind+'/'+prefix)).map(k=>({key:k.slice(kind.length+1)})),directories:[]});}
  const current=blobs.get(name);
  if(method==='GET')return current?new Response(current.value,{headers:{etag:current.etag,'content-type':'application/json'}}):new Response(null,{status:404});
  if(method==='DELETE'){blobs.delete(name);return new Response(null,{status:204});}
  assert.equal(method,'PUT');const headers=new Headers(init.headers||request?.headers);if(headers.get('if-none-match')==='*'&&current||headers.has('if-match')&&headers.get('if-match')!==current?.etag)return new Response(null,{status:412});
  const tag=String(++etag);blobs.set(name,{value:init.body||await request.text(),etag:tag});if(matchGate&&storageGate?.afterWrite){const g=storageGate;storageGate=null;g.reached();await g.gate;}if(hit&&fault.mode==='lost')throw new TypeError('Explicit offline committed-write response loss');return new Response(null,{headers:{etag:tag}});
};
const {setEnvironmentContext}=await import('@netlify/blobs');setEnvironmentContext({siteID:'offline-site',token:'offline-token',edgeURL:'https://installation-eventual.invalid',uncachedEdgeURL:'https://installation-blobs.invalid'});
export const store=await import('../netlify/functions/lib/store.mjs');
export const {accessHash}=await import('../netlify/functions/lib/access.mjs');
export const {newClient,parseHours}=await import('../netlify/functions/lib/config.mjs');
export const {configurationRevision,setupReadiness}=await import('../netlify/functions/lib/setup.mjs');
export const {workspaceEditRevision}=await import('../netlify/functions/lib/workspace-edit.mjs');
export const {deliveryTenant}=await import('../netlify/functions/lib/managed-consent.mjs');
export const allowance=await import('../netlify/functions/lib/self-service-ai.mjs');
export const installation=await import('../netlify/functions/lib/website-installation.mjs');
export const handlers=Object.fromEntries(await Promise.all(['access','client','chat','website-installation','manage'].map(async name=>['/api/'+name,(await import('../netlify/functions/'+name+'.mjs')).default])));
export async function session(c,token=sha(c.slug+'-'+c.owner.email)){
 await store.put('access_sessions',accessHash(token),{scope:'onboarding',email:c.owner.email,status:'active',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return token;
}
export async function fixture(label='case'){
 await store.del(allowance.AI_BUDGET_KIND,allowance.AI_BUDGET_KEY);
 const n=++serial,c=newClient({slug:'installation-'+label+'-'+n,ownerKey:'PRIVATE-FIXTURE-KEY-'+n,owner:{name:'Alex Fixture',email:`owner-${n}@example.invalid`,phone:'+17135550198'},business:{name:'Fixture Air & Heat',trade:'HVAC',city:'Houston',serviceArea:['Katy'],hours:'Mon-Fri 8am-5pm',website:siteA+'/service'}});
 Object.assign(c,{onboarding:{version:1,verifiedEmail:c.owner.email,desiredChannels:['web']},status:'live',build:{status:'built',source:'owner_answers'},services:['AC repair'],windows:['8 to 12','12 to 5'],channels:{web:{active:true}}});
 c.rules.hours=parseHours('Mon-Fri 8am-5pm');c.widget.allowedOrigins=[siteA,siteB];const revision=configurationRevision(c);c.setupProof={reviewedRevision:revision,testedRevision:revision,testMode:'live'};
 await store.put('clients',c.slug,c);const token=await session(c);assert.ok(setupReadiness(c).channels.web.ready,'Fixture must actually pass normal web readiness');return {c,token};
}
export async function call(path,{method='POST',body,token,origin=ownerOrigin}={}){
 const url=new URL(path,ownerOrigin),req=new Request(url,{method,headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const res=await handlers[url.pathname](req,{ip:'192.0.2.86'}),text=await res.text();let payload;try{payload=JSON.parse(text);}catch{}
 effects.requests.push({path:url.pathname,method,status:res.status,action:body?.action,...(payload?.error?{error:payload.error}:{})});return {status:res.status,payload,text,headers:Object.fromEntries(res.headers)};
}
export const ownerGet=f=>call('/api/client?c='+f.c.slug,{method:'GET',token:f.token});
export async function start(f){const owner=await ownerGet(f);assert.equal(owner.status,200);const r=await call('/api/client?c='+f.c.slug,{body:{action:'start_website_check',expectedRevision:owner.payload.configurationRevision,expectedEditRevision:owner.payload.editRevision,origin:siteA},token:f.token});assert.equal(r.status,200,JSON.stringify(r.payload));return r.payload.check;}
export const publicCall=(f,check,action,extra={},origin=check.origin)=>call('/api/website-installation',{origin,body:{action,client:f.c.slug,checkId:check.id,challenge:check.challenge,...extra}});
export const meta=(check,turnId=sha(check.id+'-'+(++serial)).slice(0,32))=>({checkId:check.id,challenge:check.challenge,turnId});
export async function chat(f,check,{contact,websiteCheck,text='Please save a callback. QA_INPUT:{"phone":"+17135550142"}',origin=siteA,stream=true}={}){
 const m=websiteCheck===undefined&&check?meta(check):websiteCheck;
 return call('/api/chat',{origin,body:{client:f.c.slug,channel:'web',contact:contact||check?.contact||'visitor-'+(++serial),messages:[{role:'user',content:text}],stream,...(m?{websiteCheck:m}:{})}});
}
export const lines=r=>r.text.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
export const receipt=r=>lines(r).find(x=>x.t==='done')?.events?.find(x=>x.type==='website_check');
export const installationKey=f=>f.c.slug+'/'+deliveryTenant(f.c);
