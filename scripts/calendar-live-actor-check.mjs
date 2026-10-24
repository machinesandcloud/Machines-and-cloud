// All effects below are injected protocol fixtures. No browser/subprocess/network.
import assert from 'node:assert/strict';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw Error('Physical effect denied by Calendar adapter check');};net.connect=net.createConnection=http.get=http.request=https.get=https.request=deny;syncBuiltinESMExports();
globalThis.fetch=deny;
const {createActor}=await import('./calendar-live-actor.mjs');
const {createNativeHandoff}=await import('./calendar-live-native.mjs');
const {TARGET}=await import('./calendar-live-guard.mjs');
const {fixture,NOW,token,hash}=await import('./calendar-live-fixture.mjs');
const checks=[];async function check(name,fn){await fn();checks.push(name);}
await check('Dedicated Chrome adapter seeds exact pending state and only closes its new recorded window',async()=>{
  const scripts=[];const bridge=createNativeHandoff({now:()=>NOW,execute:async script=>{scripts.push(script);if(script.includes('make new window'))return '4021,9021';if(script.includes('location.origin"'))return TARGET.origin;if(script.includes('sessionStorage.setItem'))return 'controlled-calendar-state-seeded';return '';}});
  const state=hash('one-state'),authorizationUrl='https://accounts.google.com/o/oauth2/v2/auth?state='+state+'&redirect_uri='+encodeURIComponent(TARGET.origin+'/api/google/callback');
  const result=await bridge.open({slug:'internal-calendar-1234',token,state,authorizationUrl,expiresAt:new Date(NOW+600000).toISOString()});
  assert.equal(result.windowId,4021);assert.equal(result.nativePhysicalRequestsCounted,false);
  const injection=scripts.find(script=>script.includes('sessionStorage.setItem'));
  assert(injection.includes('mc-onboarding-session-v1'));assert(injection.includes('mc-calendar-pending-v1'));assert(injection.includes(hash(token)));assert(!scripts.some(script=>/every (window|tab)|front window|cookies/i.test(script)));
  await assert.rejects(bridge.open({}));await bridge.close();assert.match(scripts.at(-1),/close tab id 9021 of window id 4021/);
});
await check('Unknown native window creation cannot be retried and never inspects existing tabs',async()=>{
  let starts=0;const bridge=createNativeHandoff({now:()=>NOW,execute:async()=>{starts++;throw Error('Synthetic lost window result');}}),state=hash('unknown-state');
  const input={slug:'internal-calendar-1234',token,state,authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state='+state+'&redirect_uri='+encodeURIComponent(TARGET.origin+'/api/google/callback'),expiresAt:new Date(NOW+600000).toISOString()};
  await assert.rejects(bridge.open(input));await assert.rejects(bridge.open(input));assert.equal(starts,1);assert.equal(bridge.state().attempted,true);
});
await check('Changing active tab or adding tabs cannot redirect seeding; moved owned tab fails without searching or closing user tabs',async()=>{
  let moved=false,added=false,seeded=false,closed=false;const scripts=[];
  const bridge=createNativeHandoff({now:()=>NOW,execute:async script=>{
    scripts.push(script);
    if(script.includes('make new window')){added=true;return '4021,9021';}
    assert(!script.includes('active tab'),'Only creation may read active tab');
    assert(script.includes('tab id 9021 of window id 4021'));
    if(moved)throw Error('Dedicated tab missing');
    if(script.includes('location.origin"'))return TARGET.origin;
    if(script.includes('sessionStorage.setItem')){assert(added);seeded=true;return 'controlled-calendar-state-seeded';}
    if(script.includes('close tab'))closed=true;
    return '';
  }}),state=hash('tab-bound-state');
  await bridge.open({slug:'internal-calendar-1234',token,state,authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state='+state+'&redirect_uri='+encodeURIComponent(TARGET.origin+'/api/google/callback'),expiresAt:new Date(NOW+600000).toISOString()});
  assert(seeded);moved=true;await assert.rejects(bridge.close());assert.equal(closed,false);assert.equal(bridge.state().closed,false);
  assert(!scripts.some(script=>script.includes('close window')||script.includes('every tab')||script.includes('every window')));
});
await check('Fixed actor completes signup, native handshake, scheduled lifecycle, both busy rejections and restored-deployment cleanup',async()=>{
  const f=await fixture(),privateFiles=new Map(),helperCalls=[];
  const privateRead=async file=>file==='primary.json'?{primaryAccount:TARGET.calendarAccount,primaryOwnedUIConfirmed:true,primaryCalendarId:TARGET.calendarAccount,primaryUIEvidenceSHA256:hash('owned-ui')}:{recipient:TARGET.ownerEmail,token:hash(file),exactMessageConfirmed:true};
  const helper=async(command,input)=>{
    helperCalls.push({command,input});
    if(command==='env')return {snapshotSHA256:hash('environment'),stagedVerified:true,originalEnvironmentRestored:true};
    if(command==='apply-key')return {siteId:TARGET.siteId,key:input,valueSHA256:hash(({CALENDAR_CONNECTION_ENABLED:'true',CALENDAR_DELIVERY_ENABLED:'true',CALENDAR_EXECUTION_POLICY_JSON:JSON.stringify(privateFiles.get('calendar-binding.json').policy),CALENDAR_EXECUTION_APPROVED_VERSION:f.p.policyVersion})[input]),context:'production',scopes:['functions']};
    if(command==='push'){f.setPublished();return {pushed:f.p.candidateCommit};}
    if(command==='restore-key')return {key:input,restoredOriginalSetting:true};
    if(command==='cleanup-build'){f.cleanupBuild();return {cleanupBuildReserved:true,buildId:'fixture-cleanup-build'};}
    if(command==='status')return {requests:28,mutations:10,builds:2,unknown:[]};
    return {fixture:true};
  };
  const native={open:async input=>{assert.equal(input.token,token);f.nativeAccept();return {windowId:4021,tabId:9021,seeded:true,navigated:true,nativePhysicalRequestsCounted:false};},close:async()=>({windowId:4021,tabId:9021,closed:true})};
  const actor=createActor({controller:f.c,packet:f.p,helper,native,privateRead,privateWrite:async(name,value)=>{privateFiles.set(name,value);f.setBinding(value);},netlifyToken:'SYNTHETIC-METADATA',now:()=>NOW});
  const run=(action,rest={})=>actor.command({action,...rest});
  await run('baseline');await run('request-link');await run('exchange',{file:'signup-mail.json'});await run('create-workspace');await run('request-link');await run('exchange',{file:'return-mail.json'});await run('owner');
  await run('census-bind',{file:'primary.json'});await run('stage');await run('publish');await run('ready');await run('start');await run('native-open');await run('native-confirm');await run('create');
  f.setJob('create');await run('receipt',{stage:'create'});await run('move');await run('probe-old');f.setJob('update');await run('receipt',{stage:'update'});await run('cancel-visit');await run('probe-cancelled');f.setJob('delete');await run('receipt',{stage:'delete'});
  await run('cleanup');await run('disconnect');await run('cancel-workspace');await run('native-close');await run('signout-all');await run('restore');await run('cleanup-build');const final=await run('closed');
  assert.equal(final.closed,true);assert.equal(final.guard.counters.workerPosts,0);assert.equal(final.guard.counters.builds,2);assert.equal(final.guard.counters.nativeHandoffs,1);assert.equal(final.guard.counters.environmentWrites,8);
  assert.equal(helperCalls.filter(row=>row.command==='push').length,1);assert.equal(helperCalls.filter(row=>row.command==='cleanup-build').length,1);
  assert(!JSON.stringify(f.rows).includes(token));assert.equal(f.calls.filter(row=>new URL(row.url).pathname==='/api/calendar-delivery-background').length,0);
});
process.stdout.write(JSON.stringify({passed:checks.length,failed:0,checks,physicalNetworkRequests:0,actualNativeWindows:0,actualControlEffects:0},null,2)+'\n');
