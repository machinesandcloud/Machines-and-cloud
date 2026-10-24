// Independent proof adapter/controller checks. No browser, subprocess or network.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const output=process.argv[2];assert(/^scratchpad\/[a-z0-9-]+\.json$/.test(output||'')&&!existsSync(output));
let deniedEffects=0;const deny=()=>{deniedEffects++;throw Error('Independent native check forbids physical effects');};net.connect=net.createConnection=http.get=http.request=https.get=https.request=child.spawn=child.exec=child.execFile=child.execFileSync=globalThis.fetch=deny;syncBuiltinESMExports();
const {createNativeHandoff,ownedTabCloseScript,ownedTabPresenceScript}=await import('../scripts/calendar-live-native.mjs');
const {TARGET,validateNativeCloseReceipt}=await import('../scripts/calendar-live-guard.mjs');
const {fixture,NOW,slug,token,state,revision}=await import('../scripts/calendar-live-fixture.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['scripts/calendar-live-native.mjs','scripts/calendar-live-guard.mjs','scripts/calendar-live-actor.mjs','scripts/calendar-live-fixture.mjs','scratchpad/calendar-native-close-independent.mjs'];const hashes=()=>Object.fromEntries(files.map(p=>[p,sha(readFileSync(p))]));
const report={at:new Date().toISOString(),mode:'Independent injected native adapter and real fixed proof controller; subprocess and networking blocked',sourceBefore:hashes(),checks:[]};
const check=async(name,fn)=>{try{await fn();report.checks.push({name,pass:true});}catch(e){report.checks.push({name,pass:false,error:e.stack});}};
const wid=806,tid=907,input={slug,token,state,authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state='+state+'&redirect_uri='+encodeURIComponent(TARGET.origin+'/api/google/callback'),expiresAt:new Date(NOW+600000).toISOString()};
async function bridge({command=()=>{throw Error('PRIVATE_COMMAND_ERROR');},read=()=> 'owned-calendar-window-absent'}={}){
 const calls=[];const n=createNativeHandoff({now:()=>NOW,execute:async script=>{
  if(script.includes('make new window'))return wid+','+tid;
  if(script.includes('location.origin"'))return TARGET.origin;
  if(script.includes('sessionStorage.setItem'))return 'controlled-calendar-state-seeded';
  if(script.includes('close controlledTab')){calls.push('close');assert.match(script,new RegExp('window id '+wid));assert.match(script,new RegExp('tab id '+tid));return command();}
  if(script.includes('owned-calendar-target-present')){calls.push('read');assert.equal(script,ownedTabPresenceScript(wid,tid));return read();}
  assert.match(script,/set URL to/);return '';
 }});await n.open(input);return {n,calls};
}
const validate=r=>validateNativeCloseReceipt(r,{windowId:wid,tabId:tid});
async function guarded(options={}){const f=await fixture(options);await f.deploy();await f.budget();await f.request('/api/client?c='+slug,{action:'start_calendar_connection',availabilityConsentVersion:'2026-10-24-busy-v1',expectedRevision:revision});await f.budget();await f.c.beginNativeHandoff(async()=>({windowId:wid,tabId:tid,seeded:true,navigated:true,nativePhysicalRequestsCounted:false}));return f;}
await check('Stopped Chrome is fenced before either generated cleanup script invokes the application',async()=>{
 for(const script of [ownedTabCloseScript(wid,tid),ownedTabPresenceScript(wid,tid)]){const beforeTell=script.split('tell application "Google Chrome"')[0];assert.match(beforeTell,/if application "Google Chrome" is not running then/,'Cleanup must not invoke stopped Chrome merely to discover missing owned window');}
});
await check('Only exact positive saved IDs are accepted; absence query reads no URLs/content/other targets and changes nothing',async()=>{
 for(const make of [ownedTabCloseScript,ownedTabPresenceScript])for(const bad of [0,-1,1.2,'806',undefined,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){assert.throws(()=>make(bad,tid));assert.throws(()=>make(wid,bad));}
 const script=ownedTabPresenceScript(wid,tid);assert(!/\bURL\b|javascript|cookie|every |front |active |close |make |activate|window 1/i.test(script));assert.match(script,/exists window id 806/);assert.match(script,/exists tab id 907 of window id 806/);
});
await check('Unbound close is rejected before any native command or query',async()=>{let calls=0;const n=createNativeHandoff({execute:async()=>{calls++;}});await assert.rejects(n.close(),/no_owned_window/);assert.equal(calls,0);});
await check('Confirmed close returns direct provenance, skips existence read and serves detached cached receipts',async()=>{
 const f=await bridge({command:()=> 'owned-calendar-target-absent'}),r=await f.n.close();assert.equal(r.provenance,'close_command_confirmed');assert.equal(r.absenceReadOutcome,'not_needed');assert.equal(r.closeCommandOutcome,'confirmed');assert.equal(r.scope,'original_window');assert.equal(r.globalTabDestructionConfirmed,false);assert.deepEqual(validate(r),r);r.closed=false;r.provenance='FORGED';f.n.state().closeReceipt.closed=false;assert.equal((await f.n.close()).provenance,'close_command_confirmed');assert.deepEqual(f.calls,['close']);
});
await check('Failed and unconfirmed command output reconcile through exactly one original-window absence read without a cause claim',async()=>{
 for(const command of [()=>{throw Error('PRIVATE_OUTPUT');},()=> 'PRIVATE_WRONG_MARKER']){const f=await bridge({command}),r=await f.n.close();assert(r.closed);assert.equal(r.provenance,'scoped_window_absence_observed');assert.equal(r.absenceReadOutcome,'window_absent');assert(['failed','unconfirmed'].includes(r.closeCommandOutcome));assert.equal(r.globalTabDestructionConfirmed,false);assert.equal(r.scope,'original_window');assert.deepEqual(validate(r),r);assert(!JSON.stringify(f.n.state()).includes('PRIVATE'));await f.n.close();assert.deepEqual(f.calls,['close','read']);}
});
await check('A tab missing from a present original window remains uncertain, preserving moved-tab boundary and one-attempt limit',async()=>{
 const f=await bridge({read:()=> 'owned-calendar-tab-absent-in-present-window'});let error;try{await f.n.close();}catch(e){error=e;}assert(error);assert.equal(error.nativeCloseReceipt.absenceReadOutcome,'saved_window_present_tab_absent');assert.equal(error.nativeCloseReceipt.closed,false);assert.equal(error.nativeCloseReceipt.provenance,'close_unconfirmed');assert(!Object.keys(error).includes('nativeCloseReceipt'));await assert.rejects(f.n.close(),/close_outcome_unconfirmed/);assert.deepEqual(f.calls,['close','read']);
});
await check('Present target, failed query and malformed query output retain uncertainty without logging details or permitting reread',async()=>{
 for(const [read,expected] of [[()=> 'owned-calendar-target-present','target_present'],[()=>{throw Error('PRIVATE_READ_ERROR');},'failed'],[()=> 'PRIVATE_BAD_RESULT','unconfirmed']]){const f=await bridge({read});await assert.rejects(f.n.close(),e=>e.nativeCloseReceipt.absenceReadOutcome===expected&&!e.nativeCloseReceipt.closed);await assert.rejects(f.n.close());assert.deepEqual(f.calls,['close','read']);assert(!JSON.stringify(f.n.state()).includes('PRIVATE'));}
});
await check('Concurrent direct bridge calls cannot repeat an ambiguous close or absence query',async()=>{
 let release;const wait=new Promise(r=>release=r),f=await bridge({command:async()=>{await wait;throw Error('lost');}});const a=f.n.close(),b=f.n.close();await assert.rejects(b,/close_outcome_unconfirmed/);release();assert.equal((await a).closed,true);assert.deepEqual(f.calls,['close','read']);
});
await check('Receipt schema rejects foreign identities, contradictory outcomes, private additions and unsupported global destruction',async()=>{
 const f=await bridge(),r=await f.n.close();for(const patch of [{windowId:807},{tabId:908},{closed:false},{scope:'global'},{globalTabDestructionConfirmed:true},{closeCommandOutcome:'confirmed'},{absenceReadOutcome:'saved_window_present_tab_absent'},{provenance:'close_command_confirmed'},{privateURL:'PRIVATE_URL'}])assert.throws(()=>validate({...r,...patch}),e=>e.code==='native_close_receipt');assert.throws(()=>validate({windowId:wid,tabId:tid,closed:true}),e=>e.code==='native_close_receipt');assert.equal(validateNativeCloseReceipt({windowId:wid,tabId:tid,closed:true},{windowId:wid,tabId:tid,allowLegacyOffline:true}).provenance,'legacy_offline_adapter_receipt');
});
await check('Real guard reserves before a single native effect and records scoped evidence distinctly from command confirmation',async()=>{
 const f=await guarded(),n=await bridge(),r=await f.c.closeNativeHandoff(async()=>{const last=f.rows.at(-1);assert.equal(last.event,'native_close_reserved_unknown');assert.equal(last.tabId,tid);assert.equal(last.maximumCloseCommands,1);assert.equal(last.maximumAbsenceReads,1);return n.n.close();});assert.equal(r.provenance,'scoped_window_absence_observed');assert.equal(f.c.state().nativeCloseReceipt.closeCommandOutcome,'failed');assert.equal(f.c.state().nativeClosed,true);assert.deepEqual(f.rows.at(-1).receipt,r);assert.equal(f.rows.at(-1).event,'native_window_closed');
});
await check('Guard retains safe uncertain receipt and never resubmits after original window remains present',async()=>{
 const f=await guarded(),n=await bridge({read:()=> 'owned-calendar-tab-absent-in-present-window'});await assert.rejects(f.c.closeNativeHandoff(()=>n.n.close()));assert.equal(f.c.state().nativeClosed,false);assert.equal(f.c.state().nativeCloseReceipt.absenceReadOutcome,'saved_window_present_tab_absent');assert.equal(f.rows.at(-1).event,'native_close_unconfirmed');let retry=0;await assert.rejects(f.c.closeNativeHandoff(()=>{retry++;}));assert.equal(retry,0);assert.deepEqual(n.calls,['close','read']);assert(!JSON.stringify(f.rows).includes('PRIVATE'));
});
await check('Foreign or malformed guard receipt consumes close authority without accepting cleanup',async()=>{
 const n=await bridge(),r=await n.n.close();for(const patch of [{windowId:807},{globalTabDestructionConfirmed:true}]){const f=await guarded();let count=0;await assert.rejects(f.c.closeNativeHandoff(async()=>{count++;return {...r,...patch};}),e=>e.code==='native_close_receipt');await assert.rejects(f.c.closeNativeHandoff(()=>{count++;}));assert.equal(count,1);assert.equal(f.c.state().nativeClosed,false);assert.equal(f.c.state().nativeCloseReceipt,null);}
});
await check('Concurrent guard close admissions execute only one command/query pair',async()=>{
 const f=await guarded(),n=await bridge();let calls=0;const run=()=>f.c.closeNativeHandoff(async()=>{calls++;return n.n.close();}),r=await Promise.allSettled([run(),run()]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);assert.deepEqual(n.calls,['close','read']);
});
await check('Pre-effect durable reservation failure causes zero effects and cannot refill authority',async()=>{
 let armed=false;const f=await guarded({persistence:{append:async row=>{if(armed&&row.event==='native_close_reserved_unknown')throw Error('reserve failed');}}});armed=true;let calls=0;await assert.rejects(f.c.closeNativeHandoff(()=>{calls++;}));await assert.rejects(f.c.closeNativeHandoff(()=>{calls++;}));assert.equal(calls,0);assert.equal(f.c.state().nativeCloseAttempted,true);assert.equal(f.c.state().nativeClosed,false);
});
await check('Lost final journal acknowledgement blocks all replay rather than repeating a known observed close',async()=>{
 let armed=false;const f=await guarded({persistence:{append:async row=>{if(armed&&row.event==='native_window_closed')throw Error('final ACK lost');}}}),n=await bridge();armed=true;await assert.rejects(f.c.closeNativeHandoff(()=>n.n.close()));await assert.rejects(f.c.closeNativeHandoff(()=>n.n.close()));assert.deepEqual(n.calls,['close','read']);assert.equal(f.c.state().nativeCloseAttempted,true);assert.equal(f.c.state().nativeCloseReceipt.provenance,'scoped_window_absence_observed');await assert.rejects(f.c.next('cleanup'));
});
report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.deniedEffects=deniedEffects;report.actualNativeWindows=0;report.actualProviderRequests=0;report.passed=report.checks.filter(r=>r.pass).length;report.total=report.checks.length;report.ok=report.sourceStable&&report.passed===report.total&&deniedEffects===0;writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,ok:report.ok,passed:report.passed,total:report.total,sourceStable:report.sourceStable,deniedEffects,failures:report.checks.filter(r=>!r.pass)},null,2));if(!report.ok)process.exitCode=1;
