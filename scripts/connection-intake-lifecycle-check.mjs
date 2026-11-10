// Async lifecycle regressions for the actual public intake and setup-guide assets.
// DOM adapters only suppress visual layout. Business/event/recovery bodies run unchanged.
// Every fetch is injected below; the VM exposes no Node transport or child-process API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
class Event{constructor(type,opts={}){this.type=type;this.detail=opts.detail;this.cancelable=!!opts.cancelable;this.defaultPrevented=false;}preventDefault(){if(this.cancelable)this.defaultPrevented=true;}}
class Node{constructor(){this.hidden=false;this.dataset={};this.classList={add(){},remove(){},toggle(){}};}addEventListener(){}remove(){}replaceChildren(){}setAttribute(){}contains(){return false;}querySelector(){return null;}querySelectorAll(){return[];}appendChild(){}prepend(){}focus(){}scrollIntoView(){}}
function view(marker){return{marker,client:{slug:'synthetic-workspace',status:'testing',owner:{email:'synthetic@example.test',name:'Synthetic Owner',phone:'+17135550142'},business:{name:'Synthetic',city:'Houston'},onboarding:{desiredChannels:['calendar']}},serviceIntake:{token:marker,calendar:{canSave:true,preferences:{accountEmail:marker+'@example.test'}},voice:{complete:false}},setup:{connectionJourney:{channels:[{id:'calendar',status:'waiting',action:{kind:'wait'},verification:{working:false}}],leadSources:[]}},connections:{calendar:{available:false,connected:false}},connectionAssistance:{}};}
function state(){return{attempt:{body:{action:'save_service_intake',service:'calendar',submissionId:'a'.repeat(32),expectedIntakeToken:'initial'},next:1,continueAfter:false,closeAfter:false},step:0,open:true,busy:false,dirty:false,token:'initial',draft:{accountEmail:'synthetic@example.test'}};}
function instrumentation(source,hook){assert.ok(source.trimEnd().endsWith('})();'));const i=source.lastIndexOf('})();');return source.slice(0,i)+hook+source.slice(i);}
async function atBoundary(promise,name){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Missing expected async boundary: '+name)),3000);})]);}finally{clearTimeout(timer);}}
async function exerciseBody(source,guide,method,change){
 const continueReplacement=change==='session-then-new';if(continueReplacement)change='session';
 let release,enteredResolve,reportResolve;const reportSeen=new Promise(r=>reportResolve=r),entered=new Promise(r=>enteredResolve=r),body=new Promise(r=>release=r),listeners=new Map(),events=[],fetches=[];
 const nodes={setupGuide:new Node(),portalContent:new Node(),deskSignOut:new Node()},values=new Map([['mc-onboarding-session-v1','original-session']]);
 const doc={body:{dataset:{workspaceState:'ready',activePage:'setup'}},activeElement:null,getElementById:id=>nodes[id]||null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>new Node(),addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},dispatchEvent(event){events.push({type:event.type,detail:event.detail});for(const fn of listeners.get(event.type)||[])fn(event);return!event.defaultPrevented;}};
 const response=view('OLD_BODY');response.ok=true;response.serviceIntake.lastSubmissionId='a'.repeat(32);
 let delayed=true,privateOpenCount=0;
 const context={document:doc,CustomEvent:Event,MutationObserver:class{observe(){}disconnect(){}},URLSearchParams,AbortController,TextEncoder,crypto:crypto.webcrypto,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),queueMicrotask,location:{search:'?c=synthetic-workspace',pathname:'/desk.html',hash:''},history:{pushState(){},replaceState(){}},matchMedia:()=>({matches:true,addEventListener(){}}),sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},console:{log(){}},async fetch(url,options={}){
   const payload=options.body?JSON.parse(options.body):null;fetches.push({kind:payload?.action||String(url).includes('service_intake=1')?'private_or_action':'workspace_get',action:payload?.action||null,authorization:options.headers?.Authorization||null});
   if(payload?.action==='report_connection'){reportResolve();return{ok:true,status:200,async json(){return{ok:true,connectionAssistance:{calendar:{status:'reported',reference:'MC-SYNTHETIC',operationIds:[payload.operationId]}}};}};}
   if(method==='open'&&String(url).includes('service_intake=1')&&++privateOpenCount>1)return{ok:true,status:200,async json(){return view('NEW_SECOND_OPEN');}};
   if(change==='unknown-then-reconcile'&&payload){throw Error('synthetic_unknown');}
   return{ok:true,status:200,async json(){if(delayed){delayed=false;enteredResolve();return body;}if(continueReplacement){const next=view('NEW_SESSION_SAVE');next.ok=true;next.serviceIntake.lastSubmissionId='b'.repeat(32);return next;}return response;}};
 }};context.window=context;context.addEventListener=function(){};vm.createContext(context);
 const guideHook=`window.__guideProbe={bind:function(d,id){data=d;selected=id;render=function(){};focusStage=function(){};pageRoute=function(){};endTask=function(){};},data:function(){return data;}};\n`;
 vm.runInContext(instrumentation(guide,guideHook),context,{filename:'actual-desk-setup-guide.js'});
 const intakeHook=`window.__intakeProbe={bind:function(d,s){data=d;selected='calendar';host=undefined;states.calendar=s;},state:function(){return states.calendar;},data:function(){return data;},replace:function(s){states.calendar=s;},send:send,reconcile:reconcile,open:open};\n`;
 vm.runInContext(instrumentation(source,intakeHook),context,{filename:'actual-desk-service-intake.js'});
 const old=view('ORIGINAL_READY');context.__guideProbe.bind(old,'calendar');context.__intakeProbe.bind(old,state());
 let promise;
 if(change==='unknown-then-reconcile'){
   await context.__intakeProbe.send('calendar');assert.equal(context.__intakeProbe.state().error,true);change='normal';method='reconcile';
 }
 if(method==='open')promise=context.__intakeProbe.open('calendar');else if(method==='send')promise=context.__intakeProbe.send('calendar');else promise=context.__intakeProbe.reconcile();
 await atBoundary(entered,'response body');
 let replacement;
 if(change==='session'){
   doc.body.dataset.workspaceState='recovery';doc.dispatchEvent(new Event('mc:session-expired'));values.set('mc-onboarding-session-v1','replacement-session');doc.body.dataset.workspaceState='ready';replacement=view('REPLACEMENT_READY');context.__guideProbe.bind(replacement,'calendar');context.__intakeProbe.bind(replacement,state());
 }else if(change==='state'){
   replacement=context.__intakeProbe.state();context.__intakeProbe.replace(state());
 }else if(change==='sequence'){
   await context.__intakeProbe.open('calendar');
 }
 release(response);await promise;
 if(continueReplacement){
   // Email sign-in returns by navigation. An expired document never acquires a new identity in place.
   listeners.clear();
   vm.runInContext(instrumentation(guide,guideHook),context,{filename:'fresh-page-actual-guide.js'});
   vm.runInContext(instrumentation(source,intakeHook),context,{filename:'fresh-page-actual-intake.js'});
   const freshView=view('REPLACEMENT_READY');
   context.__guideProbe.bind(freshView,'calendar');context.__intakeProbe.bind(freshView,state());
   const fresh=state();fresh.attempt.body.submissionId='b'.repeat(32);context.__intakeProbe.replace(fresh);await context.__intakeProbe.send('calendar');}
 // Automatic review continues asynchronously after the save event. Observe its fetch boundary.
 if(events.some(e=>e.type==='mc:connection-details-saved'))await atBoundary(reportSeen,'automatic report dispatch');
 const current=context.__intakeProbe.data();
 return{method,change,staleBodyProjected:current?.serviceIntake?.token==='OLD_BODY',currentToken:current?.serviceIntake?.token,acceptedSaveEvents:events.filter(e=>e.type==='mc:connection-details-saved').length,openedEvents:events.filter(e=>e.type==='mc:connector-intake-open-state'&&e.detail?.state==='opened').length,automaticReportDispatches:fetches.filter(e=>e.action==='report_connection').length,automaticUnderReplacementSession:fetches.some(e=>e.action==='report_connection'&&e.authorization==='Bearer replacement-session'),fetches:fetches.length};
}
async function exercisePersistence(guide,intake,change){
 let release,enteredResolve,digestCalls=0;const held=new Promise(r=>release=r),entered=new Promise(r=>enteredResolve=r);
 const listeners=new Map(),events=[],fetches=[],operationIds=[],nodes={setupGuide:new Node(),portalContent:new Node(),deskSignOut:new Node()},values=new Map([['mc-onboarding-session-v1','original-session']]);
 const doc={body:{dataset:{workspaceState:'ready',activePage:'setup'}},activeElement:null,getElementById:id=>nodes[id]||null,querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>new Node(),addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},dispatchEvent(e){events.push(e.type);for(const fn of listeners.get(e.type)||[])fn(e);return!e.defaultPrevented;}};
 const context={document:doc,CustomEvent:Event,MutationObserver:class{observe(){}disconnect(){}},URLSearchParams,AbortController,TextEncoder,setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),queueMicrotask,location:{search:'?c=synthetic-workspace',pathname:'/desk.html',hash:''},history:{pushState(){},replaceState(){}},matchMedia:()=>({matches:true,addEventListener(){}}),sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},console:{log(){}},
  crypto:{getRandomValues:a=>crypto.webcrypto.getRandomValues(a),subtle:{async digest(...args){const n=++digestCalls,result=await crypto.webcrypto.subtle.digest(...args);if(n===2){enteredResolve();await held;}return result;}}},
  async fetch(url,options={}){const payload=options.body?JSON.parse(options.body):null;if(payload)operationIds.push(payload.operationId);fetches.push({method:options.method||'GET',action:payload?.action||null,oldCapturedBearer:options.headers?.Authorization==='Bearer original-session',oldCapturedSlug:String(url).includes('c=synthetic-workspace'),signalAlreadyAborted:options.signal?.aborted===true});if(change==='unknown_then_reconcile'&&payload&&operationIds.length===1)throw Error('synthetic_unknown');return{ok:true,status:200,async json(){return{ok:true,connectionAssistance:payload?{calendar:{status:'reported',reference:'MC-SYNTHETIC',operationIds:[payload.operationId]}}:{}};}};}
 };context.window=context;context.addEventListener=function(){};vm.createContext(context);
 const guideHook=`window.__guideProbe={bind:function(d,id){data=d;selected=id;render=function(){};focusStage=function(){};pageRoute=function(){};endTask=function(){};},request:requestConnectionReview,state:function(){return assistance.calendar;}};\n`;
 vm.runInContext(instrumentation(guide,guideHook),context,{filename:'complete-actual-desk-setup-guide.js'});
 vm.runInContext(intake,context,{filename:'complete-actual-desk-service-intake.js'});
 context.__guideProbe.bind(view('ORIGINAL_READY'),'calendar');const pending=context.__guideProbe.request(true);await atBoundary(entered,'attempt persistence');
 const before=fetches.length;
 if(change==='replace_session')values.set('mc-onboarding-session-v1','replacement-session');
 if(change==='clear_session')values.delete('mc-onboarding-session-v1');
 if(change==='clear_lifecycle'){doc.body.dataset.workspaceState='recovery';values.delete('mc-onboarding-session-v1');doc.dispatchEvent(new Event('mc:session-expired'));}
 if(change==='lifecycle_same_session'){doc.body.dataset.workspaceState='recovery';doc.dispatchEvent(new Event('mc:session-expired'));doc.body.dataset.workspaceState='ready';context.__guideProbe.bind(view('REPLACEMENT_SAME_IDENTITY'),'calendar');}
 if(change==='replace_workspace'){const replacement=view('REPLACEMENT');replacement.client.slug='replacement-workspace';context.__guideProbe.bind(replacement,'calendar');}
 if(change==='not_current')doc.body.dataset.workspaceState='recovery';
 release();await pending;if(change==='unknown_then_reconcile'){assert.equal(context.__guideProbe.state().uncertain,true);await context.__guideProbe.request();assert.equal(context.__guideProbe.state().checked,true);assert.equal(fetches.length,2);assert.equal(fetches[1].method,'GET');await context.__guideProbe.request();assert.equal(operationIds.length,2);assert.equal(operationIds[0],operationIds[1]);}
 return{change,sameOperationReplay:operationIds.length===2&&operationIds[0]===operationIds[1],digestCalls,fetchesBeforeRelease:before,postCalls:fetches.filter(f=>f.method==='POST').length,oldCapturedPostUnaborted:fetches.some(f=>f.method==='POST'&&f.oldCapturedBearer&&f.oldCapturedSlug&&!f.signalAlreadyAborted),alreadyAbortedPostCalls:fetches.filter(f=>f.method==='POST'&&f.signalAlreadyAborted).length,recoveryWrites:[...values.keys()].filter(k=>k.startsWith('mc-connection-review-v1:')).length,events:events.filter(x=>x==='mc:session-expired'),transport:fetches};
}
export async function checkConnectionIntakeLifecycle() {
 const intake=fs.readFileSync(new URL('../desk-service-intake.js',import.meta.url),'utf8');
 const guide=fs.readFileSync(new URL('../desk-setup-guide.js',import.meta.url),'utf8');
 const checks=[];
 async function check(name,fn){try{await fn();checks.push({name,pass:true});}catch(error){error.message=name+': '+error.message;throw error;}}
 for(const method of ['send','reconcile','open'])await check(method+' rejects a deferred body after session replacement',async()=>{
  const r=await exerciseBody(intake,guide,method,'session');assert.equal(r.staleBodyProjected,false);assert.equal(r.acceptedSaveEvents,0);assert.equal(r.automaticReportDispatches,0);assert.equal(r.openedEvents,0);
 });
 for(const method of ['send','reconcile'])await check(method+' rejects a superseded state object',async()=>{
  const r=await exerciseBody(intake,guide,method,'state');assert.equal(r.staleBodyProjected,false);assert.equal(r.acceptedSaveEvents,0);assert.equal(r.automaticReportDispatches,0);
 });
 await check('private open cannot replace a newer completed open',async()=>{
  const r=await exerciseBody(intake,guide,'open','sequence');assert.equal(r.staleBodyProjected,false);assert.equal(r.currentToken,'NEW_SECOND_OPEN');assert.equal(r.openedEvents,1);
 });
 for(const method of ['send','reconcile','open'])await check('current-session '+method+' still completes',async()=>{
  const r=await exerciseBody(intake,guide,method,'normal');assert.equal(r.staleBodyProjected,true);if(method==='open')assert.equal(r.openedEvents,1);else{assert.equal(r.acceptedSaveEvents,1);assert.equal(r.automaticReportDispatches,1);}
 });
 await check('replacement session can perform its own later explicit save after fresh-page initialization',async()=>{
  const r=await exerciseBody(intake,guide,'send','session-then-new');assert.equal(r.currentToken,'NEW_SESSION_SAVE');assert.equal(r.acceptedSaveEvents,1);assert.equal(r.automaticReportDispatches,1);assert.equal(r.automaticUnderReplacementSession,true);
 });
 await check('unknown intake save still reconciles by ordinary GET',async()=>{
  const r=await exerciseBody(intake,guide,'send','unknown-then-reconcile');assert.equal(r.acceptedSaveEvents,1);assert.equal(r.automaticReportDispatches,1);
 });
 for(const change of ['replace_session','clear_session','clear_lifecycle','lifecycle_same_session','replace_workspace','not_current'])await check('review persistence yields safely on '+change,async()=>{
  const r=await exercisePersistence(guide,intake,change);assert.equal(r.fetchesBeforeRelease,0);assert.equal(r.postCalls,0);
 });
 await check('current authority still dispatches one review after persistence',async()=>{
  const r=await exercisePersistence(guide,intake,'unchanged');assert.equal(r.fetchesBeforeRelease,0);assert.equal(r.postCalls,1);assert.equal(r.alreadyAbortedPostCalls,0);
 });
 await check('unknown review keeps GET-only reconciliation and exact explicit replay',async()=>{
  const r=await exercisePersistence(guide,intake,'unknown_then_reconcile');assert.equal(r.postCalls,2);assert.equal(r.sameOperationReplay,true);assert.equal(r.transport.filter(f=>f.method==='GET').length,1);
 });
 return {mode:'Complete actual public assets in a VM with DOM-only visual adapters and injected deferred JSON/digest/fetch; no browser/provider claim',checks,passed:checks.length,total:checks.length};
}
