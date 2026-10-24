// Independent offline adversarial proof-adapter checks. No credentials/native/network.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import cp from 'node:child_process';
const out=process.argv[2];if(!/^scratchpad\/[a-z0-9-]+\.json$/.test(out||'')||existsSync(out))throw Error('Fresh scratchpad receipt required');
let forbidden=0;const deny=()=>{forbidden++;throw Error('All physical and subprocess effects forbidden');};net.connect=net.createConnection=http.get=http.request=https.get=https.request=cp.spawn=cp.execFile=cp.execFileSync=cp.execSync=deny;globalThis.fetch=deny;syncBuiltinESMExports();
const {createController,TARGET}=await import('../scripts/calendar-live-guard.mjs');const {createNativeHandoff}=await import('../scripts/calendar-live-native.mjs');const {fixture,packet,NOW,slug,revision}=await import('../scripts/calendar-live-fixture.mjs');
const files=['scripts/calendar-live-guard.mjs','scripts/calendar-live-native.mjs','scripts/calendar-live-actor.mjs','scripts/calendar-live-control.py','scripts/calendar-live-fixture.mjs','product/CALENDAR-CURRENT-LIVE-PROOF-2026-10-24.json'];const hash=b=>createHash('sha256').update(b).digest('hex');const hashes=()=>Object.fromEntries(files.map(p=>[p,hash(readFileSync(p))]));const report={at:new Date().toISOString(),scope:'Independent offline proof-adapter adversarial seams; no real packet/key/provider/native access',sourceBefore:hashes(),checks:[]};
async function check(name,fn){const row={name};try{await fn(row);row.pass=true;}catch(e){row.pass=false;row.error=e.stack;}report.checks.push(row);}
await check('A staged key whose write succeeded but response was lost remains eligible for exact original restoration',async row=>{
 const f=await fixture(),original=f.c.stageEnvironment;let applied=false,restored=false;
 f.c.stageEnvironment=(input,effect)=>original(input,async()=>{applied=true;throw Error('Synthetic environment write committed, response lost');});
 await assert.rejects(f.cohort());assert.equal(applied,true);await f.c.next('cleanup');
 let error;try{await f.c.restoreEnvironment('CALENDAR_CONNECTION_ENABLED',async key=>{restored=true;return {key,restoredOriginalSetting:true};});}catch(e){error=e.code;}
 row.observed={applied,restorationCallbackCalled:restored,rejection:error,guard:f.c.state()};assert.equal(restored,true,'Unknown attempted environment writes must remain restorable, without repeating the original mutation');
});
await check('Known newly created native tab can be closed through guard after later seed failure',async row=>{
 const f=await fixture();await f.deploy();await f.budget();await f.request('/api/client?c='+slug,{action:'start_calendar_connection',availabilityConsentVersion:'2026-10-24-busy-v1',expectedRevision:revision});await f.budget();let closed=false;
 const native=createNativeHandoff({now:()=>NOW,execute:async script=>{if(script.includes('make new window'))return '4021,9021';if(script.includes('location.origin"'))return TARGET.origin;if(script.includes('sessionStorage.setItem'))throw Error('Synthetic seeding denied after known window creation');if(script.includes('close tab'))closed=true;return '';}});
 await assert.rejects(f.c.beginNativeHandoff(input=>native.open(input)));let error;try{await f.c.closeNativeHandoff(()=>native.close());}catch(e){error=e.code;}
 row.observed={native:native.state(),closed,rejection:error,guard:f.c.state()};assert.equal(closed,true,'Known exact native tab must remain cleanable after seeding fails');
});
await check('Unexpected concurrent published deployment halts the phase instead of retaining baseline authority',async row=>{
 const p=packet(),rows=[];let count=0;const c=await createController({mode:'offline',packet:p,now:()=>NOW,persistence:{append:async r=>rows.push(r)},transport:async()=>Response.json({id:TARGET.siteId,account_id:TARGET.accountId,published_deploy:{id:++count===1?TARGET.baselineDeployId:'b'.repeat(24),state:'ready',commit_ref:count===1?TARGET.baselineCommit:'f'.repeat(40)}})});
 await c.request({url:'https://api.netlify.com/api/v1/sites/'+TARGET.siteId});let rejected=false;try{await c.request({url:'https://api.netlify.com/api/v1/sites/'+TARGET.siteId});}catch{rejected=true;}
 row.observed={rejected,guard:c.state()};assert.equal(rejected,true,'Unexpected current deployment must invalidate baseline admission');
});

await check('Premature close while cleanup publication is pending retains cleanup readback authority',async row=>{
 const f=await fixture();await f.connect();await f.budget();
 await f.request('/api/client?c='+slug,{action:'create_visit',expectedRevision:revision,submissionId:f.p.fixture.visitSubmissionId,customer_name:'Alex Example',phone:'(713) 555-0142',address:'12 Oak St, Katy, TX (synthetic test)',issue:'Internal Calendar lifecycle verification',date:f.p.fixture.date,window:f.p.fixture.window});await f.receipt('create');await f.budget();
 await f.request('/api/client?c='+slug,{action:'reschedule_visit',expectedRevision:revision,expectedVisitRevision:f.current.revision,submissionId:f.p.fixture.moveSubmissionId,visitId:f.bound.visitId,date:f.p.fixture.moveDate,window:f.p.fixture.moveWindow});await f.receipt('update');await f.c.next('cleanup');
 await f.request('/api/client?c='+slug,{action:'cancel_visit',expectedRevision:revision,expectedVisitRevision:f.current.revision,submissionId:f.p.fixture.cancelSubmissionId,visitId:f.bound.visitId});await f.receipt('delete');await f.request('/api/client?c='+slug,{action:'disconnect_calendar'});await f.request('/api/client?c='+slug,{action:'cancel',reason:'Internal Calendar verification complete'});await f.request('/api/access',{action:'sign_out'});
 for(const key of ['CALENDAR_CONNECTION_ENABLED','CALENDAR_DELIVERY_ENABLED','CALENDAR_EXECUTION_POLICY_JSON','CALENDAR_EXECUTION_APPROVED_VERSION'])await f.c.restoreEnvironment(key,async key=>({key,restoredOriginalSetting:true}));await f.c.confirmEnvironmentRestored({originalEnvironmentRestored:true,snapshotSHA256:'a'.repeat(64)});
 await f.c.cleanupPublish(async()=>({cleanupBuildReserved:true,buildId:'d'.repeat(24),deployId:'b'.repeat(24)}));let error;try{await f.c.next('closed');}catch(e){error=e.code;}
 row.observed={error,state:f.c.state()};assert.equal(f.c.state().phase,'cleanup','Pending distinct cleanup deployment must not permanently advance the phase');
 const read=await f.c.request({url:'https://api.netlify.com/api/v1/sites/'+TARGET.siteId});assert.equal(read.status,200);f.cleanupBuild();await f.c.request({url:'https://api.netlify.com/api/v1/sites/'+TARGET.siteId});await f.c.next('closed');assert.equal(f.c.state().closed,true);
});
await check('Cleanup accepts only the exact deployment returned by its reserved build',async row=>{
 const f=await fixture();await f.connect();await f.budget();
 await f.request('/api/client?c='+slug,{action:'create_visit',expectedRevision:revision,submissionId:f.p.fixture.visitSubmissionId,customer_name:'Alex Example',phone:'(713) 555-0142',address:'12 Oak St, Katy, TX (synthetic test)',issue:'Internal Calendar lifecycle verification',date:f.p.fixture.date,window:f.p.fixture.window});await f.receipt('create');await f.budget();
 await f.request('/api/client?c='+slug,{action:'reschedule_visit',expectedRevision:revision,expectedVisitRevision:f.current.revision,submissionId:f.p.fixture.moveSubmissionId,visitId:f.bound.visitId,date:f.p.fixture.moveDate,window:f.p.fixture.moveWindow});await f.receipt('update');await f.c.next('cleanup');
 await f.request('/api/client?c='+slug,{action:'cancel_visit',expectedRevision:revision,expectedVisitRevision:f.current.revision,submissionId:f.p.fixture.cancelSubmissionId,visitId:f.bound.visitId});await f.receipt('delete');await f.request('/api/client?c='+slug,{action:'disconnect_calendar'});await f.request('/api/client?c='+slug,{action:'cancel',reason:'Internal Calendar verification complete'});await f.request('/api/access',{action:'sign_out'});
 for(const key of ['CALENDAR_CONNECTION_ENABLED','CALENDAR_DELIVERY_ENABLED','CALENDAR_EXECUTION_POLICY_JSON','CALENDAR_EXECUTION_APPROVED_VERSION'])await f.c.restoreEnvironment(key,async key=>({key,restoredOriginalSetting:true}));await f.c.confirmEnvironmentRestored({originalEnvironmentRestored:true,snapshotSHA256:'a'.repeat(64)});

 await f.c.cleanupPublish(async()=>({cleanupBuildReserved:true,buildId:'d'.repeat(24),deployId:'c'.repeat(24)}));f.cleanupBuild();let rejected=false;try{await f.c.request({url:'https://api.netlify.com/api/v1/sites/'+TARGET.siteId});}catch{rejected=true;}
 row.observed={rejected,state:f.c.state()};assert.equal(rejected,true,'Different same-source deployment cannot establish restored runtime environment');
});

report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.forbiddenEffects=forbidden;report.summary={passed:report.checks.filter(x=>x.pass).length,failed:report.checks.filter(x=>!x.pass).length};writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output:out,...report.summary,sourceStable:report.sourceStable,forbiddenEffects:forbidden,findings:report.checks.filter(x=>!x.pass).map(x=>({name:x.name,observed:x.observed}))}));if(report.summary.failed)process.exitCode=1;
