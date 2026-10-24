// Injected AppleScript and protocol transports only. No browser or subprocess.
import assert from 'node:assert/strict';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
let physicalAttempts=0;const deny=()=>{physicalAttempts++;throw Error('Physical effect denied by native-close check');};
net.connect=net.createConnection=http.get=http.request=https.get=https.request=child.spawn=child.exec=child.execFile=child.execFileSync=deny;globalThis.fetch=deny;syncBuiltinESMExports();
const {createNativeHandoff,ownedTabPresenceScript,ownedTabCloseScript}=await import('./calendar-live-native.mjs');
const {validateNativeCloseReceipt,TARGET}=await import('./calendar-live-guard.mjs');
const {fixture,NOW,token,state,slug,revision}=await import('./calendar-live-fixture.mjs');
const checks=[];async function check(name,run){await run();checks.push(name);}
const input={slug,token,state,authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state='+state+'&redirect_uri='+encodeURIComponent(TARGET.origin+'/api/google/callback'),expiresAt:new Date(NOW+600000).toISOString()};
async function bridgeFixture({command=()=>{throw Error('Injected command failure with private detail');},read=()=> 'owned-calendar-window-absent'}={}){
 const scripts=[];let commands=0,reads=0;
 const bridge=createNativeHandoff({now:()=>NOW,execute:async script=>{
  scripts.push(script);
  if(script.includes('make new window'))return '4021,9021';
  if(script.includes('location.origin"'))return TARGET.origin;
  if(script.includes('sessionStorage.setItem'))return 'controlled-calendar-state-seeded';
  if(script.includes('close controlledTab')){commands++;return command();}
  if(script.includes('owned-calendar-target-present')){reads++;return read();}
  return '';
 }});
 await bridge.open(input);return {bridge,scripts,get commands(){return commands;},get reads(){return reads;}};
}
async function guarded(options={}){
 const f=await fixture(options);await f.deploy();await f.budget();await f.request('/api/client?c='+slug,{action:'start_calendar_connection',availabilityConsentVersion:'2026-10-24-busy-v1',expectedRevision:revision});
 await f.budget();await f.c.beginNativeHandoff(async()=>({windowId:4021,tabId:9021,seeded:true,navigated:true,nativePhysicalRequestsCounted:false}));return f;
}
const validate=receipt=>validateNativeCloseReceipt(receipt,{windowId:4021,tabId:9021});
await check('Existence query binds only original IDs and reads no URL, content or other target',async()=>{
 const script=ownedTabPresenceScript(4021,9021);assert.match(script,/application "Google Chrome" is not running/);assert.match(script,/exists window id 4021/);assert.match(script,/exists tab id 9021 of window id 4021/);
 assert(!/\bURL\b|javascript|cookies|every |front |active |close |make |activate|window 1/i.test(script));
 for(const id of [0,-1,1.5,'4021',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])for(const make of [ownedTabPresenceScript,ownedTabCloseScript])assert.throws(()=>make(id,9021));
});
await check('Confirmed command preserves its direct provenance without an extra query',async()=>{
 const f=await bridgeFixture({command:()=> 'owned-calendar-target-absent'}),receipt=await f.bridge.close();assert.equal(receipt.provenance,'close_command_confirmed');assert.equal(receipt.closeCommandOutcome,'confirmed');assert.equal(receipt.absenceReadOutcome,'not_needed');assert.equal(f.commands,1);assert.equal(f.reads,0);assert.deepEqual(validate(receipt),receipt);
 assert.deepEqual(await f.bridge.close(),receipt);assert.equal(f.commands,1);assert.equal(f.reads,0);
});
await check('Lost close acknowledgement plus original window absent records scoped observation and unknown cause',async()=>{
 const f=await bridgeFixture(),receipt=await f.bridge.close();assert.equal(receipt.closed,true);assert.equal(receipt.closeCommandOutcome,'failed');assert.equal(receipt.absenceReadOutcome,'window_absent');assert.equal(receipt.provenance,'scoped_window_absence_observed');assert.equal(receipt.scope,'original_window');assert.equal(receipt.globalTabDestructionConfirmed,false);assert.deepEqual(validate(receipt),receipt);assert.equal(f.commands,1);assert.equal(f.reads,1);
 await f.bridge.close();assert.equal(f.commands,1);assert.equal(f.reads,1);
});
await check('Unexpected successful command output can only reconcile through the separate exact read',async()=>{
 const f=await bridgeFixture({command:()=> 'unexpected private output'}),receipt=await f.bridge.close();assert.equal(receipt.closeCommandOutcome,'unconfirmed');assert.equal(receipt.provenance,'scoped_window_absence_observed');assert.equal(f.reads,1);assert(!JSON.stringify(f.bridge.state()).includes('private'));
});
await check('Window already absent before command is observation, never an agent-causation claim',async()=>{
 const f=await bridgeFixture({command:()=>{throw Error('Dedicated window missing');}}),receipt=await f.bridge.close();assert.equal(receipt.provenance,'scoped_window_absence_observed');assert.equal(receipt.closeCommandOutcome,'failed');assert.equal(receipt.globalTabDestructionConfirmed,false);assert.equal(f.commands,1);assert.equal(f.reads,1);
});
for(const [output,expected] of [['owned-calendar-tab-absent-in-present-window','saved_window_present_tab_absent'],['owned-calendar-target-present','target_present'],['unknown private output','unconfirmed']])await check('Unconfirmed exact read '+expected+' never permits another close/read',async()=>{
 const f=await bridgeFixture({read:()=>output});let error;try{await f.bridge.close();}catch(value){error=value;}assert(error);assert.equal(error.nativeCloseReceipt.closed,false);assert.equal(error.nativeCloseReceipt.absenceReadOutcome,expected);assert.equal(Object.keys(error).includes('nativeCloseReceipt'),false);assert.deepEqual(validate(error.nativeCloseReceipt),error.nativeCloseReceipt);assert.equal(f.bridge.state().closed,false);
 await assert.rejects(f.bridge.close(),/close_outcome_unconfirmed/);assert.equal(f.commands,1);assert.equal(f.reads,1);assert(!JSON.stringify(f.bridge.state()).includes('private'));
});
await check('Failed existence read preserves unknown and consumes its one read',async()=>{
 const f=await bridgeFixture({read:()=>{throw Error('Secret synthetic stderr');}});await assert.rejects(f.bridge.close(),error=>error.nativeCloseReceipt.absenceReadOutcome==='failed');await assert.rejects(f.bridge.close());assert.equal(f.commands,1);assert.equal(f.reads,1);assert.equal(f.bridge.state().closed,false);assert(!JSON.stringify(f.bridge.state()).includes('Secret'));
});
await check('Concurrent adapter close calls execute one command and one read',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;});const f=await bridgeFixture({command:async()=>{await blocked;throw Error('Lost ACK');}});const first=f.bridge.close();const second=f.bridge.close();await assert.rejects(second,/close_outcome_unconfirmed/);release();assert.equal((await first).closed,true);assert.equal(f.commands,1);assert.equal(f.reads,1);
});
await check('Adapter observations returned to callers cannot rewrite its retained receipt',async()=>{
 const f=await bridgeFixture(),receipt=await f.bridge.close();receipt.provenance='forged';const snapshot=f.bridge.state();snapshot.closeReceipt.closed=false;assert.equal((await f.bridge.close()).provenance,'scoped_window_absence_observed');assert.equal(f.bridge.state().closed,true);
});
await check('Strict receipt validation rejects unsupported absence or global-destruction claims',async()=>{
 const f=await bridgeFixture(),valid=await f.bridge.close();for(const change of [{windowId:4022},{tabId:9022},{scope:'all_windows'},{globalTabDestructionConfirmed:true},{provenance:'close_command_confirmed'},{absenceReadOutcome:'saved_window_present_tab_absent'},{privateURL:'https://private.invalid'}])assert.throws(()=>validate({...valid,...change}),error=>error.code==='native_close_receipt');
 assert.throws(()=>validate({windowId:4021,tabId:9021,closed:true}));assert.equal(validateNativeCloseReceipt({windowId:4021,tabId:9021,closed:true},{windowId:4021,tabId:9021,allowLegacyOffline:true}).provenance,'legacy_offline_adapter_receipt');
});
await check('Guard records durable single close admission and scoped receipt separately from command success',async()=>{
 const f=await guarded(),b=await bridgeFixture();const result=await f.c.closeNativeHandoff(async()=>{assert.equal(f.rows.at(-1).event,'native_close_reserved_unknown');return b.bridge.close();});assert.equal(result.provenance,'scoped_window_absence_observed');assert.equal(f.c.state().nativeClosed,true);assert.equal(f.c.state().nativeCloseAttempted,true);assert.deepEqual(f.rows.at(-1).receipt,result);assert.equal(f.rows.at(-1).receipt.closeCommandOutcome,'failed');
});
await check('Guard retains unknown receipt without stderr and refuses a second effect',async()=>{
 const f=await guarded(),b=await bridgeFixture({read:()=> 'owned-calendar-tab-absent-in-present-window'});await assert.rejects(f.c.closeNativeHandoff(()=>b.bridge.close()));let retried=0;await assert.rejects(f.c.closeNativeHandoff(()=>{retried++;}),error=>error.code==='native_close_not_admitted');assert.equal(retried,0);assert.equal(f.c.state().nativeClosed,false);assert.equal(f.c.state().nativeCloseReceipt.absenceReadOutcome,'saved_window_present_tab_absent');assert(f.rows.some(row=>row.event==='native_close_unconfirmed'));assert(!JSON.stringify(f.rows).includes('private detail'));assert.equal(b.commands,1);assert.equal(b.reads,1);
});
await check('Guard cannot retry malformed or foreign close receipts',async()=>{
 const f=await guarded(),b=await bridgeFixture(),receipt=await b.bridge.close();await assert.rejects(f.c.closeNativeHandoff(async()=>({...receipt,tabId:9022})),error=>error.code==='native_close_receipt');let effects=0;await assert.rejects(f.c.closeNativeHandoff(()=>{effects++;}));assert.equal(effects,0);assert.equal(f.c.state().nativeClosed,false);assert.equal(f.c.state().nativeCloseReceipt,null);
});
await check('Concurrent guard close invocations reserve only the first effect',async()=>{
 const f=await guarded(),b=await bridgeFixture();let effects=0;const invoke=()=>f.c.closeNativeHandoff(async()=>{effects++;return b.bridge.close();});const results=await Promise.allSettled([invoke(),invoke()]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(effects,1);assert.equal(b.commands,1);assert.equal(b.reads,1);
});
await check('Failed pre-effect durable reservation executes no native command and cannot refill',async()=>{
 let armed=false;const f=await guarded({persistence:{append:async row=>{if(armed&&row.event==='native_close_reserved_unknown')throw Error('Injected reservation failure');}}});armed=true;let effects=0;await assert.rejects(f.c.closeNativeHandoff(()=>{effects++;}));await assert.rejects(f.c.closeNativeHandoff(()=>{effects++;}));assert.equal(effects,0);assert.equal(f.c.state().nativeCloseAttempted,true);assert.equal(f.c.state().nativeClosed,false);
});
await check('Lost final ledger acknowledgement never repeats the already observed native effect',async()=>{
 let armed=false;const f=await guarded({persistence:{append:async row=>{if(armed&&row.event==='native_window_closed')throw Error('Injected lost final ACK');}}}),b=await bridgeFixture();armed=true;await assert.rejects(f.c.closeNativeHandoff(()=>b.bridge.close()));await assert.rejects(f.c.closeNativeHandoff(()=>b.bridge.close()));assert.equal(b.commands,1);assert.equal(b.reads,1);assert.equal(f.c.state().nativeCloseReceipt.provenance,'scoped_window_absence_observed');
});
assert.equal(physicalAttempts,0);
process.stdout.write(JSON.stringify({passed:checks.length,failed:0,checks,physicalAttempts,actualNativeWindows:0,actualProviderRequests:0,limitations:['Injected command/query results, not actual AppleScript or Chrome execution.','Original v7 result and its timing/native exception are unchanged.']},null,2)+'\n');
