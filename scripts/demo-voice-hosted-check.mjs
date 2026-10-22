// PREPARED, NOT A BUILD GATE. Requires separate user approval for one hosted voice call.
// Never reads .env/provider keys or reuses/resets the closed local phase budgets.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const args=process.argv.slice(2),arg=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
assert.ok(args.includes('--voice-published-approved'),'Separate explicit approval for this one hosted voice call is required');
const commit=arg('--expected-published-commit')||arg('--expected-published-commitSHA'),deployId=arg('--deploy-id'),prefix=arg('--output-prefix');
assert.match(commit||'',/^[a-f0-9]{40}$/i,'Full approved published commit SHA required');
assert.match(deployId||'',/^[a-f0-9]{24}$/i,'Expected Netlify deployment ID required');
assert.match(prefix||'',/^scratchpad\/[A-Za-z0-9][A-Za-z0-9._-]*$/,'Unique scratchpad output prefix required');
assert.ok(arg('--playwright'),'Existing Playwright module required; no installs');
const base='https://machinesandcloud.com',sameSite=origin=>[base,'https://www.machinesandcloud.com'].includes(origin);
const inputFile=arg('--audio-file')||'/tmp/mc-voice-en-padded.wav';assert.ok(existsSync(inputFile),'Pre-generated synthetic English PCM input required');
const reportPath=prefix+'.json',ledgerPath=`scratchpad/demo-voice-hosted-${deployId}-ledger.json`;
assert.ok(!existsSync(reportPath)&&!existsSync(ledgerPath),'Never overwrite a report or reuse this deployment’s one-attempt phase');
const hash=body=>createHash('sha256').update(body).digest('hex');
// Netlify may post-process HTML forms. Pin executable assets byte-for-byte;
// root verifies the commit/deploy pointer and the page contract below.
const expectedFiles=['stories.js','practice-voice.js','assets/vendor/vapi-web.js'];
const expected=Object.fromEntries(expectedFiles.map(file=>[file,hash(execFileSync('git',['show',`${commit}:${file}`]))]));
const ledger={phase:`published-English-voice-${deployId}`,startedAt:new Date().toISOString(),expectedPublishedCommit:commit,deployId,maxCreates:1,attempts:0,closed:false,scope:'One separately approved hosted English Katy Pipeworks practice call, maximum90seconds; no local budget reuse or provider/model/account reads'};
const report={startedAt:ledger.startedAt,base,expectedPublishedCommit:commit,deployId,publicationMetadata:'Commit/deploy identity supplied by root’s approved Netlify deployment verification; static hashes checked against that local commit',expectedStatic:expected,servedStatic:{},syntheticInput:{path:inputFile,sha256:hash(readFileSync(inputFile)),description:'10pm, Sam Demo, active water leak in Fulshear;7135550151;24 Pine Street,Fulshear;callback only,no requested callback time,no visit'},checks:[],blockedRequests:[],errors:[],result:'in_progress',manualSemanticReviewRequired:true};
writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n',{flag:'wx',mode:0o600});
writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
const save=()=>{writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');};
const check=(name,pass,detail)=>{report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});save();assert.ok(pass,name);};
const safeError=error=>String(error?.message||error).replace(/(?:https?|wss?):\/\/[^\s)]+/g,'[URL redacted]').slice(0,800);
let browser,page,hardTimer,deadline=0,actualOrigin='';const sourceJobs=[];
const remaining=cap=>Math.max(1,Math.min(cap,deadline?deadline-Date.now():cap));
try{
 const {chromium}=await import(pathToFileURL(resolve(arg('--playwright'))));
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${inputFile}`,'--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce',permissions:['microphone'],serviceWorkers:'block'});
 await context.addInitScript(()=>{
  const h=window.__hostedVoice={events:[],creation:[],pcs:[],tracks:[],lastAssistantAt:0,lastStatusAt:0,lastStatus:''};
  const fetch=window.fetch.bind(window);window.fetch=async(input,init)=>{const response=await fetch(input,init);if(new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/practice-voice/call/web')response.clone().json().then(data=>h.creation.push({status:response.status,id:typeof data.id==='string'?data.id.slice(0,100):undefined,maxDurationSeconds:data.practice?.maxDurationSeconds,error:typeof data.error==='string'?data.error:undefined}),()=>h.creation.push({status:response.status,error:'invalid_json'}));return response;};
  if(navigator.mediaDevices?.getUserMedia){const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await get(constraints);h.tracks.push(...stream.getTracks());return stream;};}
  if(window.RTCPeerConnection){const set=RTCPeerConnection.prototype.setRemoteDescription;RTCPeerConnection.prototype.setRemoteDescription=function(...args){if(!h.pcs.includes(this))h.pcs.push(this);return set.apply(this,args);};}
  let bridge;Object.defineProperty(window,'MCDemoVoice',{configurable:true,get:()=>bridge,set:value=>{bridge={start(options){const wrapped={...options};for(const name of['onStatus','onTranscript','onSummary','onError','onEnd'])wrapped[name]=data=>{const at=Date.now();h.events.push({name,data,at});if(name==='onStatus'){h.lastStatus=data.state;h.lastStatusAt=at;}if(name==='onTranscript'&&data.role==='assistant'&&data.isFinal)h.lastAssistantAt=at;options[name]?.(data);};h.controller=value.start(wrapped);return h.controller;}};}});
 });
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(sameSite(url.origin)){
   if(method==='POST'&&url.pathname==='/api/practice-voice/call/web'){
    const body=request.postDataJSON();await Promise.all(sourceJobs);
    const valid=actualOrigin===url.origin&&ledger.attempts===0&&body?.persona==='katy-pipeworks'&&body?.language==='en'&&Object.keys(body).sort().join(',')==='language,persona'&&expectedFiles.every(file=>report.servedStatic[file]===expected[file]);
    if(valid){ledger.attempts=1;ledger.attemptReservedAt=new Date().toISOString();deadline=Date.now()+90000;report.request={origin:url.origin,path:url.pathname,method,body};save();hardTimer=setTimeout(()=>{report.hardDeadlineReached=true;save();browser?.close().catch(()=>{});},90000);return route.continue();}
   }
   if(method==='GET'&&!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/.netlify/'))return route.continue();
  }else if(url.protocol==='https:'&&(url.hostname.endsWith('.daily.co')||url.hostname.endsWith('.vapi.ai'))){
   // Transport only. Browsers may never create a Vapi call or invoke other API tools.
   if(url.hostname==='api.vapi.ai'&&/^\/(?:call|chat|assistant|tool|phone-number|org|key|token|credential|v1\/messages)(?:\/|$)/.test(url.pathname)){}else return route.continue();
  }else if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)&&method==='GET')return route.abort();
  report.blockedRequests.push({method,host:url.hostname,path:sameSite(url.origin)?url.pathname:'[transport path redacted]'});save();return route.abort();
 });
 page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>{report.errors.push(safeError(error));save();});
 page.on('response',response=>{
  const url=new URL(response.url()),file=url.pathname==='/'||url.pathname==='/index.html'?'index.html':url.pathname.slice(1);
  if(sameSite(url.origin)&&response.status()===200&&response.request().method()==='GET'&&expectedFiles.includes(file))sourceJobs.push(response.body().then(body=>{report.servedStatic[file]=hash(body);save();}));
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});actualOrigin=new URL(page.url()).origin;
 check('Canonical page remains approved HTTPS apex/www',sameSite(actualOrigin));report.actualPageOrigin=actualOrigin;
 report.hostedHeaders=await page.evaluate(async()=>{const r=await fetch(location.href,{method:'GET',cache:'no-store'});return{permissionsPolicy:r.headers.get('permissions-policy'),contentSecurityPolicy:r.headers.get('content-security-policy')};});
 check('Hosted microphone header permits self once',/microphone\s*=\s*\(self\)/.test(report.hostedHeaders.permissionsPolicy||'')&&!/microphone\s*=\s*\(\)/.test(report.hostedHeaders.permissionsPolicy||''));
 check('Hosted CSP permits Vapi/Daily transport',/connect-src/.test(report.hostedHeaders.contentSecurityPolicy||'')&&/\*\.vapi\.ai/.test(report.hostedHeaders.contentSecurityPolicy||'')&&/\*\.daily\.co/.test(report.hostedHeaders.contentSecurityPolicy||''));
 await page.locator('.site-demo-ready').waitFor();await page.locator('[data-example="call"]').click();
 await Promise.all(sourceJobs);check('Published story source matches approved commit',report.servedStatic['stories.js']===expected['stories.js']);
 check('Published page exposes the approved English plumbing call',await page.locator('#example-voice-card strong').innerText()==='English plumbing practice call'&&await page.locator('#example-voice-card').isVisible());
 await page.locator('#example-voice-start').click();
 await page.waitForFunction(()=>window.__hostedVoice.creation.length>0||!document.querySelector('#example-error').hidden,null,{timeout:remaining(40000)});
 report.creation=await page.evaluate(()=>window.__hostedVoice.creation);check('Exactly one successful server-created90second room',ledger.attempts===1&&report.creation.length===1&&report.creation[0].status===200&&report.creation[0].maxDurationSeconds===90,report.creation);
 await page.waitForFunction(()=>window.__hostedVoice.events.some(event=>event.name==='onSummary'&&event.data.data?.requested_action==='callback'&&/Sam/.test(event.data.data.customer_name)&&event.data.data.phone.replace(/\D/g,'')==='7135550151')||!document.querySelector('#example-error').hidden,null,{timeout:remaining(85000)});
 const summaryAt=await page.evaluate(()=>window.__hostedVoice.events.findLast(event=>event.name==='onSummary')?.at||0);
 try{await page.waitForFunction(at=>{const h=window.__hostedVoice;return h.lastStatus==='listening'&&h.lastStatusAt>=at&&h.lastAssistantAt>=at&&Date.now()-Math.max(h.lastStatusAt,h.lastAssistantAt)>=2000;},summaryAt,{timeout:remaining(20000)});report.completeAnswerObserved=true;}catch{report.completeAnswerObserved=false;}
 report.events=await page.evaluate(()=>window.__hostedVoice.events);
 report.ui=await page.locator('#demo-wrap').evaluate(wrap=>({messages:wrap.querySelector('#example-messages').innerText,summary:wrap.querySelector('#example-summary').innerText,status:wrap.querySelector('#example-ticket-status').innerText,voiceStatus:wrap.querySelector('#example-voice-status').innerText}));
 report.audio=[];for(const frame of page.frames())try{report.audio.push(...await frame.evaluate(async()=>{const rows=[];for(const pc of window.__hostedVoice?.pcs||[])try{for(const row of(await pc.getStats()).values())if((row.kind==='audio'||row.mediaType==='audio')&&row.type==='inbound-rtp')rows.push({packetsReceived:row.packetsReceived,bytesReceived:row.bytesReceived,totalAudioEnergy:row.totalAudioEnergy,totalSamplesDuration:row.totalSamplesDuration});}catch{}return rows;}));}catch{}
 const summary=report.events.findLast(event=>event.name==='onSummary')?.data?.data;
 check('Real remote audio has nonzero energy and packets',report.audio.some(row=>row.totalAudioEnergy>0&&row.packetsReceived>0),report.audio);
 check('Actual synthetic caller and AI answer delivered',report.events.some(event=>event.name==='onTranscript'&&event.data.role==='user'&&event.data.isFinal&&/Sam|leak/i.test(event.data.text))&&report.events.some(event=>event.name==='onTranscript'&&event.data.role==='assistant'&&event.data.isFinal&&event.at>=summaryAt));
 check('Owner has callback identity and phone without a booked visit',summary?.requested_action==='callback'&&/Sam/.test(summary.customer_name)&&summary.phone.replace(/\D/g,'')==='7135550151'&&/callback/i.test(report.ui.status)&&!/visit request/i.test(report.ui.status));
 check('Urgency does not invent ASAP or callback timing',summary?.requested_window==='');
 await page.locator('#example-voice-stop').click({timeout:remaining(5000)});await page.waitForTimeout(Math.min(500,remaining(500)));
 report.cleanup=await page.evaluate(()=>({tracks:window.__hostedVoice.tracks.map(track=>track.readyState),peers:window.__hostedVoice.pcs.map(pc=>pc.connectionState),typedEnabled:!document.querySelector('#example-input').disabled,startVisible:!document.querySelector('#example-voice-start').hidden}));
 check('Explicit End releases microphone and restores typed chat',report.cleanup.tracks.length>0&&report.cleanup.tracks.every(state=>state==='ended')&&report.cleanup.typedEnabled&&report.cleanup.startVisible,report.cleanup);
 check('No unrelated action or direct-provider API attempt',report.blockedRequests.length===0&&report.errors.length===0);
 await page.screenshot({path:prefix+'.png'});report.result='passed_pending_PO_full_reply_review';
}catch(error){report.result='failed';report.error=safeError(error);process.exitCode=1;
 if(page)try{report.failureUI=await page.locator('#demo-wrap').innerText();report.events=await page.evaluate(()=>window.__hostedVoice?.events||[]);await page.screenshot({path:prefix+'.png'});}catch{}
}finally{clearTimeout(hardTimer);ledger.closed=true;ledger.finishedAt=new Date().toISOString();report.finishedAt=ledger.finishedAt;save();await browser?.close();}
console.log(JSON.stringify({result:report.result,error:report.error,attempts:ledger.attempts,report:reportPath,ledger:ledgerPath}));
