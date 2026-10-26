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
 if(hold && kind.endsWith('clients') && method==='PUT' && JSON.parse(init.body).management?.connectionPreparation?.lastReceipt){const current=hold;hold=null;current.enter();await current.release;}
 const previous=rows.get(name),headers=new Headers(init.headers);
 if(method==='GET'&&!key)return Response.json({blobs:[...rows.keys()].filter(id=>id.startsWith(kind+'/'+(url.searchParams.get('prefix')||''))).map(id=>({key:id.slice(kind.length+1)})),directories:[]});
 if(method==='GET')return previous?new Response(previous.value,{headers:{etag:previous.etag,'content-type':'application/json'}}):new Response(null,{status:404});
 if(method==='DELETE'){rows.delete(name);return new Response(null,{status:204});}
 assert.equal(method,'PUT');
 if(headers.get('if-none-match')==='*'&&previous || headers.has('if-match')&&headers.get('if-match')!==previous?.etag)return new Response(null,{status:412});
 const etag=String(++revision);rows.set(name,{etag,value:init.body});
 if(loseFence && kind.endsWith('clients') && JSON.parse(init.body).management?.connectionPreparation?.providerStartedAt){loseFence=false;return new Response('Lost fence response',{status:400});}
 return new Response(null,{headers:{etag}});
};
const {setEnvironmentContext}=await import('@netlify/blobs');setEnvironmentContext({siteID:'offline-site',token:'offline-token',edgeURL:'https://preparation-blobs.invalid',uncachedEdgeURL:'https://preparation-blobs.invalid'});
const store=await import('../netlify/functions/lib/store.mjs'),{newClient}=await import('../netlify/functions/lib/config.mjs'),{accessHash}=await import('../netlify/functions/lib/access.mjs'),{connectionPreparationView}=await import('../netlify/functions/lib/connection-preparation.mjs');
const handler=(await import('../netlify/functions/client.mjs')).default;
const bearer=createHash('sha256').update('prep-cas-owner').digest('hex');
async function fixture(){rows.clear();const c=newClient({slug:'preparation-cas',ownerKey:'private-fixture-key',owner:{name:'Alex',email:'prep-cas@example.test',phone:'+17135550142'},business:{name:'Fixture Air',trade:'HVAC'}});Object.assign(c,{status:'testing',onboarding:{version:1,verifiedEmail:c.owner.email,desiredChannels:['web']},channels:{web:{active:false}},build:{status:'built'}});await store.put('clients',c.slug,c);await store.put('access_sessions',accessHash(bearer),{email:c.owner.email,scope:'onboarding',status:'active',expiresAt:new Date(Date.now()+3600000).toISOString()});return c;}
async function call(c,body){const r=await handler(new Request(process.env.URL+'/api/client?c='+c.slug,{method:'POST',headers:{origin:process.env.URL,authorization:'Bearer '+bearer,'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
async function prepare(c){return {action:'prepare_connections',expectedPreparationToken:(await connectionPreparationView(c)).token,submissionId:'a'.repeat(32),desiredChannels:['web','voice'],website:'https://shop.example.com/'};}
const lead={action:'lead_connection',source:'angi',operation:'prepare',operationId:'b'.repeat(32),expectedGeneration:null,providerBusinessId:'123456',integrationEmail:'lead@example.test'};
const results=[];
for(const fault of [false,true]){
 const c=await fixture(),b=await prepare(c);let enter,release;const entered=new Promise(resolve=>enter=resolve),blocked=new Promise(resolve=>release=resolve);hold={enter,release:blocked};
 const pending=call(c,b);await entered;loseFence=fault;
 const provider=await call(c,lead);assert.equal(provider.status,fault?503:200,JSON.stringify(provider));
 const fenced=await store.get('clients',c.slug);assert.ok(fenced.management.connectionPreparation.providerStartedAt);
 release();const result=await pending;assert.equal(result.status,409,JSON.stringify(result));assert.equal(result.body.error,'prepare_setup_protected');
 const saved=await store.get('clients',c.slug);assert.deepEqual(saved.onboarding.desiredChannels,['web']);assert.equal(saved.business.website,'');assert.equal(saved.management.connectionPreparation.lastReceipt,undefined);
 assert.equal((await connectionPreparationView(saved)).eligible,false);
 results.push({name:fault?'A lost provider-start fence response remains durably protected':'An ordinary Angi start wins held initial preparation through client CAS',pass:true});
}
assert.equal(physicalAttempts,0);console.log(JSON.stringify({passed:results.length,total:results.length,physicalAttempts,mode:'actual Netlify Blobs SDK conditional writes with synthetic transport',checks:results},null,2));
