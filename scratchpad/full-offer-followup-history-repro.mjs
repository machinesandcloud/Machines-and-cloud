// Independent actual-handler reproduction. Synthetic memory only; no provider transport.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
let physicalAttempts=0;
const deny=()=>{physicalAttempts++;throw new Error('Independent QA forbids physical transport');};
net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;
syncBuiltinESMExports();globalThis.fetch=deny;
for(const name of Object.keys(process.env))if(/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|CALENDAR_|MANAGED_|MC_SELF_SERVICE_AI_PROOF|PHONE_ACQUISITION|SERVICE_|NETLIFY|BLOBS)/.test(name))delete process.env[name];
const origin='https://full-offer-qa.example.test';
Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:origin,PUBLIC_SITE_URL:origin,SERVICE_DELIVERY_ENABLED:'false'});
const hash=v=>createHash('sha256').update(v).digest('hex');
const sources=['desk.js','desk-requests.js','netlify/functions/client.mjs','netlify/functions/lib/request-followthrough.mjs','netlify/functions/lib/store.mjs','netlify/functions/lib/workspace-identity.mjs'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,hash(readFileSync(p))]));
const sourceBefore=hashes();
const store=await import('../netlify/functions/lib/store.mjs');
const {newClient}=await import('../netlify/functions/lib/config.mjs');
const {workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs');
const handler=(await import('../netlify/functions/client.mjs')).default;
const client={...newClient({slug:'followup-history-qa',ownerKey:'unused-private-fixture',owner:{name:'QA Owner',email:'qa-owner@example.test',phone:'+17135550123'},business:{name:'QA Home Services',trade:'HVAC'}}),status:'testing',onboarding:{version:1}};
await store.saveClient(client);
const token=hash('synthetic-followup-owner-session');
await store.put('access_sessions',hash(token),{scope:'onboarding',status:'active',email:client.owner.email,expiresAt:new Date(Date.now()+3600000).toISOString()});
let calls=0,serial=0;
async function call(body=null,query=''){
 calls++;const response=await handler(new Request(origin+'/api/client?c='+client.slug+query,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})}));
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
}
async function lead(name){return store.addRecord('leads',client.slug,{customer_name:name,phone:'+17135550142',issue:'Repair enquiry',address:'12 QA Street',wanted:'Call to discuss',outcome:'wants_call',reason:'wants_call',status:'open',channel:'web',delivery:{mode:'portal_only',tenantIdentity:workspaceTenant(client)}});}
async function action(record,type,extra){const detail=(await call(null,'&requestId='+record.id)).request;return call({action:'request_followthrough',requestId:record.id,sourceRevision:detail.sourceRevision,expectedRevision:detail.revision,operationId:hash('qa-operation-'+(++serial)).slice(0,32),type,note:'',...extra});}
const oldest=await lead('Customer with promised callback');
const planned=await action(oldest,'plan',{nextAction:'Call the customer about their repair',dueAt:'2026-01-01T12:00:00.000Z'});
assert.equal(planned.request.due,true);assert.equal(planned.request.needsFollowup,true);
const before=await call();assert.equal(before.leads.find(l=>l.id===oldest.id)?.followthrough.needsFollowup,true);
for(let i=0;i<100;i++){
 const newer=await lead('Newer handled enquiry '+(i+1));
 const completed=await action(newer,'complete',{resolution:'no_followup_needed',note:'Handled separately; no more follow-up is needed.'});
 assert.equal(completed.request.needsFollowup,false);
}
const after=await call(),retained=(await call(null,'&requestId='+oldest.id)).request;
const visibleNeeds=after.leads.filter(l=>!l.websiteSetupCheck&&!l.simulation&&l.followthrough?.needsFollowup);
const evidence={
 at:new Date().toISOString(),base:'577961c6a406be22a7fb479db055145881776729',mode:'Independent actual client handler, synthetic memory store, physical networking forbidden',
 fixture:{tenant:workspaceTenant(client),newerCompletedRequests:100},
 observed:{before:{visibleRequests:before.leads.length,oldestPresent:true,visibleNeedsFollowup:before.leads.filter(l=>l.followthrough?.needsFollowup).length},after:{visibleRequests:after.leads.length,oldestPresent:after.leads.some(l=>l.id===oldest.id),visibleNeedsFollowup:visibleNeeds.length,listing:after.recordListing?.leads},directRetainedDetail:{id:retained.source.id,due:retained.due,needsFollowup:retained.needsFollowup,nextAction:retained.state.nextAction,dueAt:retained.state.dueAt}},
 expected:'A saved due owner action remains discoverable and actionable through the ordinary workspace after newer requests arrive, without remembering an exact request ID or asking support.',
 checks:[{name:'Saved due work remains in the ordinary actionable workspace',pass:after.leads.some(l=>l.id===oldest.id)||!!after.followup?.records?.some(l=>l.id===oldest.id)}],
 sourceBefore,sourceAfter:hashes(),physicalAttempts,actualHandlerCalls:calls,
 attribution:'client GET limits leads to100; Home and Inbox derive actions only from that page. The due journal survives and exact-ID GET still returns it. Incomplete-history copy is truthful but provides no normal retrieval action.'
};
assert.deepEqual(evidence.sourceAfter,sourceBefore);assert.equal(physicalAttempts,0);
writeFileSync('scratchpad/full-offer-followup-history-first.json',JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({expectedContractPass:evidence.checks[0].pass,observed:evidence.observed,physicalAttempts,actualHandlerCalls:calls,sourceStable:true}));
