// Local actual-handler fixtures only. Import removes provider configuration and
// denies physical networking before loading any runtime modules.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
for(const key of Object.keys(process.env))if(/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|MC_PLATFORM_|VAPI_|RESEND_|GOOGLE_|STRIPE_|WORKSPACE_BILLING_|STEVE_|PHONE_|SERVICE_|CALENDAR_|ADMIN_)/.test(key))delete process.env[key];
export const origin='https://support-reports.fixture.invalid',operatorEmail='support-operator@example.test';
Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'0',ANTHROPIC_API_KEY:'SYNTHETIC-NOT-A-LIVE-KEY',NODE_ENV:'test',URL:origin,PUBLIC_SITE_URL:origin,ADMIN_EMAILS:operatorEmail});
export const effects=[];
const deny=target=>{effects.push(String(target||'socket'));throw Error('Physical networking forbidden in support checks');};net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();globalThis.fetch=async target=>deny(target);
export const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const store=await import('../netlify/functions/lib/store.mjs'),access=await import('../netlify/functions/lib/access.mjs'),config=await import('../netlify/functions/lib/config.mjs'),setup=await import('../netlify/functions/lib/setup.mjs'),identity=await import('../netlify/functions/lib/workspace-identity.mjs'),reports=await import('../netlify/functions/lib/support-reports.mjs');
export const client=(await import('../netlify/functions/client.mjs')).default,manage=(await import('../netlify/functions/manage.mjs')).default,billing=(await import('../netlify/functions/workspace-billing.mjs')).default,scheduler=(await import('../netlify/functions/scheduler.mjs')).run;
let serial=0;
export async function session(email,scope){const bearer=sha('support-fixture-session-'+ ++serial);await store.put('access_sessions',access.accessHash(bearer),{email,scope,status:'active',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return bearer;}
export async function call(handler,path,body,bearer){const response=await handler(new Request(origin+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',authorization:'Bearer '+bearer},...(body?{body:JSON.stringify(body)}:{})}),{ip:'192.0.2.74'});return {status:response.status,body:await response.json()};}
export async function reset(){for(const kind of ['clients','conversations','access_sessions','health','workspace_record_index','workspace_operations','tasks','index','alerts','events','self_service_ai','conversation_history'])for(const key of await store.list(kind,''))await store.del(kind,key);}
export async function seed({slug='support-shop',contact='support-conversation',flag=null,status='live'}={}){
 const c=config.newClient({slug,ownerKey:'SYNTHETIC-OWNER-'+slug,owner:{name:'Alex Owner',email:slug+'@example.test',phone:'+17135550142'},business:{name:'Support Air',trade:'HVAC',city:'Houston',serviceArea:['Katy'],hours:'Mon-Fri 8am-5pm'}});
 Object.assign(c,{onboarding:{version:1,verifiedEmail:c.owner.email,desiredChannels:['web']},status,channels:{web:{active:status==='live'}},services:['AC repair'],windows:['8 to 12'],build:{status:'built',source:'owner_answers'}});c.rules.hours=config.parseHours('Mon-Fri 8am-5pm');const revision=setup.configurationRevision(c);c.setupProof={reviewedRevision:revision,testedRevision:revision,testMode:'live'};await store.saveClient(c);
 const conv=await store.getConversation(c,'web',contact);conv.messages=[{role:'user',content:'Can you help with an AC repair in Katy?',at:new Date().toISOString()},{role:'assistant',content:'Synthetic incorrect answer to investigate.',at:new Date().toISOString()}];if(flag)conv.flag=flag;await store.saveConversation(conv);
 const owner=await session(c.owner.email,'onboarding'),staff=await session(operatorEmail,'operator');
 return {c,conv,contact,owner,staff,path:'/api/client?c='+slug,note:'The front desk gave the wrong repair advice. Please review this answer.'};
}
export const reportBody=(f,extra={})=>({action:'report_conversation',channel:'web',contact:f.contact,note:f.note,operationId:sha('support-owner-op-'+ ++serial).slice(0,32),expectedReportRevision:null,...extra});
export async function submit(f,body=reportBody(f)){const result=await call(client,f.path,body,f.owner);assert.equal(result.status,200,JSON.stringify(result.body));return {body,report:result.body.supportReport,response:result.body};}
export async function operatorAction(f,report,action,extra={}){const customer=(await call(manage,'/api/manage?c='+f.c.slug,null,f.staff)).body.customer;const body={action,slug:f.c.slug,expectedRevision:customer.revision,reportId:report.id,expectedReportRevision:report.revision,operationId:sha('support-staff-op-'+ ++serial).slice(0,32),reason:'Investigate this reported answer',...(action==='resolve_report'?{resolution:'We reviewed the answer and corrected the saved guidance for your front desk.'}:{}),...extra};return {body,result:await call(manage,'/api/manage',body,f.staff)};}
