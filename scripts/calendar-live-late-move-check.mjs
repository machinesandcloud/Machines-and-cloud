// Proof-only checks. Every transport is synthetic; physical network APIs fail closed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw Error('Physical networking denied by late-move proof check');};net.connect=net.createConnection=http.get=http.request=https.get=https.request=deny;syncBuiltinESMExports();globalThis.fetch=deny;
const {fixture,packet,NOW,slug,revision,hash}=await import('./calendar-live-fixture.mjs');
const files=['scripts/calendar-live-guard.mjs','scripts/calendar-live-actor.mjs','scripts/calendar-live-fixture.mjs','scripts/calendar-live-late-move-check.mjs','scripts/calendar-live-actor-check.mjs','scripts/calendar-live-selection-check.mjs','scripts/calendar-live-guard-check.mjs','scripts/calendar-live-control.py'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const output=process.argv[2];if(output)assert.ok(/^scratchpad\/[a-z0-9-]+\.json$/.test(output)&&!existsSync(output));
const report={before:hashes(),checks:[],physicalRequests:0};
async function check(name,run){try{await run();report.checks.push({name,pass:true});}catch(error){report.checks.push({name,pass:false,error:error.stack});}}
const owner='/api/client?c='+slug,original={date:'2026-10-26',window:'8 to 12'},afternoon={date:'2026-10-26',window:'12 to 5'},later={date:'2026-10-28',window:'8 to 12'};
async function ready(options={}){const f=await fixture({p:packet({lateMove:true}),...options});await f.connect();await f.budget();return f;}
const preview=(f,moving=false)=>({action:'visit_availability',expectedRevision:revision,date:f.p.fixture.availabilitySelection.from,days:7,...(moving?{visitId:f.bound.visitId,expectedVisitRevision:f.current.revision}:{})});
const create=f=>({action:'create_visit',expectedRevision:revision,submissionId:f.p.fixture.visitSubmissionId,customer_name:'Alex Example',phone:'(713) 555-0142',address:'12 Oak St, Katy, TX (synthetic test)',issue:'Internal Calendar lifecycle verification',...f.c.state().selection?.create});
const move=(f,target=f.c.state().selection?.move)=>({action:'reschedule_visit',expectedRevision:revision,expectedVisitRevision:f.current.revision,submissionId:f.p.fixture.moveSubmissionId,visitId:f.bound.visitId,...target});
async function selected(f,slots=[original,afternoon]){f.setAvailableSlots(slots);await f.request(owner,preview(f));await f.budget();return f.c.state().selection;}
async function created(f,slots){await selected(f,slots);await f.request(owner,create(f));await f.receipt('create');await f.budget();}

await check('New phase declares90 Blob/150 aggregate hops; census36 retains46 full-path and8 margin,38 stops before staging',async()=>{
 const f=await fixture({p:packet({lateMove:true}),signed:true,inspectionPadding:14});await f.cohort();assert.equal(f.c.state().counters.blobs,36);assert.equal(f.p.limits.blobs-36,54);assert.equal(f.p.limits.control,150);
 const g=await fixture({p:packet({lateMove:true}),signed:true,inspectionPadding:15});await assert.rejects(g.cohort(),e=>e.code==='insufficient_inspection_headroom');assert.equal(g.c.state().counters.environmentWrites,0);assert.equal(g.c.state().counters.builds,0);
});
await check('Strategy is explicit and fixed candidate range, weekdays, windows and backend caps cannot widen',async()=>{
 for(const mutate of [p=>p.fixture.availabilitySelection.strategy='owner_choice',p=>p.fixture.availabilitySelection.days=8,p=>p.fixture.availabilitySelection.weekdays=[0,1,2,3,4,5,6],p=>p.fixture.signupFields.windows+='\n5 to 9',p=>p.runtimeLimits.eventUpdate=2,p=>p.limits.blobs=91]){const p=packet({lateMove:true});mutate(p);await assert.rejects(fixture({p}));}
});
await check('Initial preview binds only earliest create, permits exactly one free slot and retains separate provenance',async()=>{
 const f=await ready(),s=await selected(f,[afternoon]);assert.deepEqual(s.create,afternoon);assert.equal(s.move,null);assert.equal(s.moveEvidence,null);assert.equal(s.createEvidence.visitId,null);assert.equal(s.createEvidence.configurationRevision,revision);assert.equal(s.createEvidence.packetDigest,hash(JSON.stringify(f.p)));assert.equal(f.rows.filter(r=>r.event==='available_create_bound').length,1);await f.request(owner,create(f));assert.equal(f.current.status,'booked');
});
await check('Empty or weekend-only initial preview stops without a visit and cleanup remains available',async()=>{
 for(const slots of [[],[{date:'2026-10-31',window:'8 to 12'}]]){const f=await ready();f.setAvailableSlots(slots);await assert.rejects(f.request(owner,preview(f)),e=>e.code==='availability_requires_free_create_window');assert.equal(f.current,null);await f.c.next('cleanup');await f.request(owner,{action:'disconnect_calendar'});}
});
await check('Move target stays unbound until observed scheduled create; initial availability does not predeclare it',async()=>{
 const f=await ready();await selected(f);assert.equal(f.c.state().selection.move,null);await f.request(owner,create(f));const n=f.calls.length;await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.calls.length,n);assert.equal(f.c.state().selection.move,null);
});
await check('Historical unattributed CREATE receipt permits cleanup but cannot authorize the stronger late-move protocol',async()=>{
 const f=await ready();await selected(f);await f.request(owner,create(f));f.setWaveTimes({dispatchAt:NOW-1000,runAt:NOW-1000,completedAt:NOW+10,confirmedAt:NOW+5});const receipt=await f.receipt('create');assert.equal(receipt.accepted,true);assert.equal(receipt.scheduledDispatchObserved,false);assert.equal(f.c.state().createScheduledReceipt,false);await f.budget();const n=f.calls.length;await assert.rejects(f.request(owner,preview(f,true)),e=>e.code==='scheduled_create_required');assert.equal(f.calls.length,n);assert.equal(f.c.state().selection.move,null);await f.c.next('cleanup');await f.request(owner,{action:'cancel_visit',expectedRevision:revision,expectedVisitRevision:f.current.revision,submissionId:f.p.fixture.cancelSubmissionId,visitId:f.bound.visitId});assert.equal(f.current.status,'cancelled');
});
await check('Fresh post-create preview selects a different currently free slot even when an earlier hypothetical afternoon is now busy',async()=>{
 const f=await ready();await created(f);const initial=structuredClone(f.c.state().selection.createEvidence);f.setAvailableSlots([later,original]);await f.request(owner,preview(f,true));await f.budget();const s=f.c.state().selection;assert.deepEqual(s.move,later);assert.deepEqual(s.createEvidence,initial);assert.equal(s.moveEvidence.visitId,f.bound.visitId);assert.equal(s.moveEvidence.visitRevision,f.current.revision);assert.notEqual(s.moveEvidence.sourceDigest,s.createEvidence.sourceDigest);await f.request(owner,move(f));assert.equal(f.rows.filter(r=>r.event==='available_move_bound').length,1);
});
await check('Deterministic move order honors declaration order and can choose another window on the original date',async()=>{
 const f=await ready();await created(f);f.setAvailableSlots([later,afternoon,original]);f.setPreviewTransform(v=>{v.availability.openings.forEach(d=>d.windows.reverse());return v;});await f.request(owner,preview(f,true));assert.deepEqual(f.c.state().selection.move,afternoon);
});
await check('No different slot stops honestly, consumes its only preview, and exact current visit can be canceled',async()=>{
 for(const slots of [[],[original]]){const f=await ready();await created(f);f.setAvailableSlots(slots);await assert.rejects(f.request(owner,preview(f,true)),e=>e.code==='availability_requires_different_move_window');assert.equal(f.c.state().selection.move,null);const n=f.calls.length;f.setAvailableSlots([later]);await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.calls.length,n);await f.c.next('cleanup');await f.request(owner,{action:'cancel_visit',expectedRevision:revision,expectedVisitRevision:f.current.revision,submissionId:f.p.fixture.cancelSubmissionId,visitId:f.bound.visitId});assert.equal(f.current.status,'cancelled');}
});
await check('Unbound move and arbitrary different slot cannot cross the physical transport boundary',async()=>{
 const f=await ready();await created(f);const n=f.calls.length;await assert.rejects(f.request(owner,move(f,later)));assert.equal(f.calls.length,n);const g=await ready();await created(g);await g.request(owner,preview(g,true));await g.budget();const before=g.calls.length;await assert.rejects(g.request(owner,move(g,later)));assert.equal(g.calls.length,before);
});
await check('Bound move cannot be previewed again, overwritten or sent twice',async()=>{
 const f=await ready();await created(f);await f.request(owner,preview(f,true));await f.budget();const s=structuredClone(f.c.state().selection),n=f.calls.length;f.setAvailableSlots([later]);await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.calls.length,n);assert.deepEqual(f.c.state().selection,s);const g=await ready();await created(g);await g.request(owner,preview(g,true));await g.budget();await g.request(owner,move(g));const after=g.calls.length;await assert.rejects(g.request(owner,move(g)));assert.equal(g.calls.length,after);
});
await check('Freshness expires across quota inspection before POST without permitting replacement',async()=>{
 let clock=NOW;const f=await ready({clock:()=>clock});await created(f);await f.request(owner,preview(f,true));clock+=60001;await f.budget();const n=f.calls.length;await assert.rejects(f.request(owner,move(f)),e=>e.code==='checked_availability_required');assert.equal(f.calls.length,n);await assert.rejects(f.request(owner,preview(f,true)));
});
await check('Changed current visit or configuration blocks preview before transport',async()=>{
 for(const kind of ['visit','rules']){const f=await ready();await created(f);const body=preview(f,true);if(kind==='visit')body.expectedVisitRevision=hash('foreign');else{f.setRulesRevision(hash('changed'));await f.request(owner);body.expectedRevision=hash('changed');}const n=f.calls.length;await assert.rejects(f.request(owner,body));assert.equal(f.calls.length,n);assert.equal(f.c.state().selection.move,null);}
});
await check('Malformed, private, stale or foreign-source move response cannot bind a target or be retried',async()=>{
 for(const alter of [a=>a.eventTitle='private',a=>a.source='workspace',a=>a.configurationRevision=hash('other'),a=>a.visitId='other',a=>a.visitRevision=hash('other'),a=>a.checkedAt=new Date(NOW-60001).toISOString(),a=>a.expiresAt=new Date(NOW).toISOString(),a=>a.openings[0].windows=['overnight']]){const f=await ready();await created(f);f.setPreviewTransform(v=>{alter(v.availability);return v;});await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.c.state().selection.move,null);const n=f.calls.length;await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.calls.length,n);}
});
await check('Lost preview ACK consumes the only move check and never admits an alternative',async()=>{
 const f=await ready();await created(f);f.fail();await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.c.state().selection.move,null);const n=f.calls.length;await assert.rejects(f.request(owner,preview(f,true)));await assert.rejects(f.request(owner,move(f,later)));assert.equal(f.calls.length,n);
});
await check('Failed durable move binding poisons the phase before any physical reschedule',async()=>{
 const f=await ready({persistence:{async append(row){if(row.event==='available_move_bound')throw Error('Synthetic lost move-binding write');}}});await created(f);await assert.rejects(f.request(owner,preview(f,true)));const n=f.calls.length;await assert.rejects(f.request(owner,move(f)));await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.calls.length,n);
});
await check('Lost reschedule response cannot be sent again or replaced by another preview',async()=>{
 const f=await ready();await created(f);await f.request(owner,preview(f,true));await f.budget();const s=structuredClone(f.c.state().selection);f.fail();await assert.rejects(f.request(owner,move(f)));const n=f.calls.length;await assert.rejects(f.request(owner,move(f)));await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.calls.length,n);assert.deepEqual(f.c.state().selection,s);
});
await check('Authoritative Save conflict after binding preserves the one target and cannot choose another',async()=>{
 const f=await ready();await created(f);await f.request(owner,preview(f,true));await f.budget();const s=structuredClone(f.c.state().selection);f.setVisitFailure('calendar_conflict');await assert.rejects(f.request(owner,move(f)),e=>e.code==='http_failure');const n=f.calls.length;f.setAvailableSlots([later]);await assert.rejects(f.request(owner,preview(f,true)));await assert.rejects(f.request(owner,move(f,later)));assert.equal(f.calls.length,n);assert.deepEqual(f.c.state().selection,s);
});
await check('Concurrent late previews admit one transport/binding and cannot replace the first target',async()=>{
 const f=await ready();await created(f);const before=f.previewCount,results=await Promise.allSettled([f.request(owner,preview(f,true)),f.request(owner,preview(f,true))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.previewCount-before,1);assert.equal(f.rows.filter(r=>r.event==='available_move_bound').length,1);assert.deepEqual(f.c.state().selection.move,afternoon);
});
await check('Latest owner/visit revisions observed after quota still fence the exact bound reschedule',async()=>{
 for(const kind of ['rules','visit']){const f=await ready();await created(f);await f.request(owner,preview(f,true));await f.budget();const body=move(f);if(kind==='rules')f.setRulesRevision(hash('new-rules-after-preview'));else f.current.revision=hash('new-visit-after-preview');await f.request(owner);const n=f.calls.length;await assert.rejects(f.request(owner,body));assert.equal(f.calls.length,n);}
});
await check('Caller mutations cannot change the declared range or rewrite bound create/move evidence',async()=>{
 const f=await ready();await created(f);const originalPacket=structuredClone(f.p);f.p.fixture.availabilitySelection.from='2026-11-02';f.p.phaseId='core-calendar-altered-phase';const n=f.calls.length;await assert.rejects(f.request(owner,preview(f,true)));assert.equal(f.calls.length,n);assert.equal(f.c.state().selection.packetDigest,hash(JSON.stringify(originalPacket)));const state=f.c.state();state.selection.create.date='2031-01-01';assert.deepEqual(f.c.state().selection.create,original);
});
await check('Legacy paired strategy still binds two slots and never reinterprets a new target as its old pair',async()=>{
 const f=await ready({p:packet({checked:true})});await created(f);assert.deepEqual(f.c.state().selection.move,afternoon);f.setAvailableSlots([later]);await assert.rejects(f.request(owner,preview(f,true)),e=>e.code==='bound_move_no_longer_free');assert.deepEqual(f.c.state().selection.move,afternoon);
});

report.after=hashes();report.sourceStable=JSON.stringify(report.before)===JSON.stringify(report.after);report.passed=report.checks.filter(c=>c.pass).length;report.total=report.checks.length;report.ok=report.sourceStable&&report.passed===report.total;if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
