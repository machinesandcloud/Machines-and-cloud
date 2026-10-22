// Independent local outcome acceptance. Bridge fixtures never use a real microphone/SDK/provider.
// UI/customer-job phases are added only after root releases the component contract and local server.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const base=new URL(option('--base',''));assert.ok(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port&&base.pathname==='/'&&!base.search&&!base.hash&&!base.username&&!base.password,'explicit local loopback origin required');
const phase=option('--phase','bridge');assert.ok(['bridge','ui','recovery','fallback'].includes(phase),'choose bridge, ui, recovery or fallback fixtures');
assert.ok(option('--playwright'),'existing Playwright module required; no installs');
const {chromium}=await import(pathToFileURL(resolve(option('--playwright'))));
const prefix=option('--output-prefix','scratchpad/demo-outcome-bridge');
const hash=body=>createHash('sha256').update(body).digest('hex');
const bridge=readFileSync('practice-voice.js','utf8');
const sourceFiles=phase!=='bridge'?['index.html','stories.js','site-refresh.css','styles.css','script.js','practice-voice.js']:['practice-voice.js'];
const sourceSnapshot=()=>Object.fromEntries(sourceFiles.map(file=>[file,hash(readFileSync(file))]));
const report={startedAt:new Date().toISOString(),phase,base:base.origin,source:sourceSnapshot(),servedSources:[],checks:[],issues:[],cases:[],screenshots:[],browserErrors:[],blockedRequests:[],typedFixtureRequests:[],scope:'Local rendered UI/dependency fixtures, explicitly identified by phase; no actual mic, audio connection, provider request or real-model customer-semantic quality proof'};
const check=(name,pass,detail)=>{const row={name,pass:!!pass,...(detail===undefined?{}:{detail})};report.checks.push(row);if(!pass)report.issues.push(row);};
const browser=await chromium.launch({headless:true,channel:'chrome'});
async function fixture(config={}){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/*',async route=>{const request=route.request();if(request.isNavigationRequest()&&request.url()===base.href&&request.method()==='GET')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Local voice dependency fixture</title><main>Local fixture only</main>'});report.blockedRequests.push({method:request.method(),url:request.url()});return route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>report.browserErrors.push(error.message));await page.goto(base.href);
  await page.evaluate(config=>{
    const h=window.__voiceFixture={config,events:[],requests:[],instances:[],micCalls:0,sdkLoads:0,stoppedTracks:0,nextTimer:1,timers:new Map(),controllers:[],ready:[]};
    const track={kind:'audio',stop(){h.stoppedTracks++;}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]};h.stream=stream;
    class FakeVapi{
      constructor(...args){this.args=args;this.handlers={};this.sent=[];this.stops=0;this.joins=[];h.instances.push(this);}
      on(name,fn){this.handlers[name]=fn;}emit(name,data){this.handlers[name]?.(data);}send(message){this.sent.push(message);}stop(){this.stops++;}
      async reconnect(payload){this.joins.push(payload);if(config.joinError)throw new Error('fixture join failure');}
    }
    const deps={
      getUserMedia:async()=>{h.micCalls++;if(config.micError)throw new DOMException('fixture microphone error',config.micError);if(config.micPending)return new Promise(resolve=>{h.resolveMic=()=>resolve(stream);});return stream;},
      loadSDK:async()=>{h.sdkLoads++;if(config.sdkError)throw new Error('fixture SDK load failure');return{default:FakeVapi};},
      fetch:async(url,init)=>{h.requests.push({url,method:init.method,body:JSON.parse(init.body)});return Response.json(config.status?{error:config.error||'busy'}:{id:'fixture-call',webCallUrl:'https://example.daily.co/fixture-room'},{status:config.status||200});},
      setTimeout:(fn,ms)=>{const id=h.nextTimer++;h.timers.set(id,{fn,ms});return id;},clearTimeout:id=>h.timers.delete(id),
    };
    if(config.unsupported){delete deps.getUserMedia;Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined});}
    window.__MC_DEMO_VOICE_TEST_DEPS__=deps;
    h.start=(persona='bayou-air',language='en')=>{const id=h.controllers.length,callbacks=Object.fromEntries(['onStatus','onTranscript','onSummary','onError','onEnd'].map(name=>[name,data=>h.events.push({id,name,data})]));const controller=window.MCDemoVoice.start({persona,language,...callbacks});h.controllers.push(controller);return id;};
    h.fire=ms=>{for(const[id,timer]of[...h.timers])if(timer.ms===ms){h.timers.delete(id);timer.fn();}};
    h.data={customer_name:'Morgan Lee',phone:'713-555-0111',address:'',issue:'Dripping tap',requested_window:'after 3 pm',urgency:'flexible',language:'en',requested_action:'callback'};
    h.summary=data=>({type:'tool-calls',toolCallList:[{function:{name:'send_owner_summary',arguments:data}}]});
  },config);
  await page.addScriptTag({content:bridge});return{context,page};
}
async function inspect(page){return page.evaluate(()=>{const h=window.__voiceFixture;return{events:h.events,requests:h.requests,micCalls:h.micCalls,sdkLoads:h.sdkLoads,stoppedTracks:h.stoppedTracks,instances:h.instances.map(sdk=>({stops:sdk.stops,sent:sdk.sent,joins:sdk.joins,audioInjected:sdk.args[3]?.audioSource===h.stream.getAudioTracks()[0],startAudioOff:sdk.args[3]?.startAudioOff})),timers:[...h.timers.values()].map(timer=>timer.ms)};});}
async function run(name,config,work){let handle;try{handle=await fixture(config);await work(handle.page);report.cases.push({name,...await inspect(handle.page)});}catch(error){report.issues.push({name,detail:String(error.message||error)});}finally{await handle?.context.close();}}
async function startReady(page,persona='bayou-air',language='en'){return page.evaluate(async({persona,language})=>{const h=window.__voiceFixture,id=h.start(persona,language);const ready=await h.controllers[id].ready;return{id,ready};},{persona,language});}
async function uiChecks(){
  for(const width of[1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:width<=390?844:1000},reducedMotion:'no-preference',serviceWorkers:'block'});
    await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base.origin||request.method()!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/functions/')){report.blockedRequests.push({method:request.method(),url:url.origin+url.pathname});return route.abort();}return route.continue();});
    await context.addInitScript(({origin})=>{
      const nativeFetch=window.fetch.bind(window),h=window.__outcomeUI={typed:[],queue:[],voices:[]};
      window.fetch=async(input,init={})=>{
        const url=new URL(typeof input==='string'?input:input.url,location.href);
        if(url.origin!==origin||url.pathname!=='/api/chat')return nativeFetch(input,init);
        const body=JSON.parse(init.body);h.typed.push(body);const out=h.queue.shift();if(!out)throw new Error('Unplanned typed fixture request');
        if(out.status)return Response.json({error:'busy'},{status:out.status});
        const enc=new TextEncoder();return new Response(new ReadableStream({start(controller){setTimeout(()=>controller.enqueue(enc.encode(JSON.stringify({t:'delta',text:out.reply.slice(0,15)})+'\n')),50);setTimeout(()=>{controller.enqueue(enc.encode(JSON.stringify({t:'done',reply:out.reply,events:out.events})+'\n'));controller.close();},300);}}),{headers:{'Content-Type':'application/x-ndjson'}});
      };
      window.MCDemoVoice={start(options){const session={options,destroyed:0,stopped:0};h.voices.push(session);return{ready:Promise.resolve({callId:'ui-fixture'}),destroy(){session.destroyed++;},stop(){session.stopped++;}};}};
    },{origin:base.origin});
    const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>report.browserErrors.push(error.message));
    const sourceReads=[];page.on('response',response=>{const file=new URL(response.url()).pathname.slice(1);if(['stories.js','site-refresh.css'].includes(file))sourceReads.push(response.body().then(body=>report.servedSources.push({width,file,sha256:hash(body),matchesStartingSource:hash(body)===report.source[file]})));});
    const capture=async name=>{const path=`${prefix}-${width}-${name}.png`;await page.screenshot({path,animations:'disabled'});report.screenshots.push(path);};
    const state=()=>page.locator('#demo-wrap').evaluate(wrap=>({scenario:wrap.querySelector('[data-example][aria-pressed="true"]')?.dataset.example,mode:wrap.dataset.mode,progress:document.querySelector('#example-progress').textContent,messages:[...wrap.querySelectorAll('#example-messages .site-message p')].map(el=>el.textContent),summary:document.querySelector('#example-summary').textContent,status:document.querySelector('#example-ticket-status').textContent,voiceStatus:document.querySelector('#example-voice-status').textContent,input:document.querySelector('#example-input').value,scrollY}));
    const visibleReply=async label=>{
      const geometry=await page.locator('#example-messages .site-message').last().evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect(),header=document.querySelector('#navbar').getBoundingClientRect().bottom;return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,paneTop:p.top,paneBottom:p.bottom,header,viewport:innerHeight};});
      check(`${width}px ${label} latest reply actually visible`,geometry.top>=Math.max(geometry.header,geometry.paneTop)-2&&geometry.bottom<=Math.min(geometry.viewport,geometry.paneBottom)+2,geometry);
    };
    const ownerPreview=async label=>{
      if(width>390)return;
      await page.locator('#example-summary-link').click();
      check(`${width}px ${label} one action opens readable owner result`,await page.locator('#example-owner-dialog').evaluate(el=>el.open)&&await page.locator('#example-owner-dialog-summary').innerText()!=='');
      const dialog=await page.locator('#example-owner-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,centerX:(r.left+r.right)/2,centerY:(r.top+r.bottom)/2,width:innerWidth,height:innerHeight};});
      check(`${width}px owner preview centered inside viewport`,dialog.left>=0&&dialog.right<=dialog.width+1&&dialog.top>=0&&dialog.bottom<=dialog.height+1&&Math.abs(dialog.centerX-dialog.width/2)<=2&&Math.abs(dialog.centerY-dialog.height/2)<=2,dialog);
      await capture(`${label}-owner`);await page.keyboard.press('Escape');
      check(`${width}px owner preview Escape restores focus`,!await page.locator('#example-owner-dialog').evaluate(el=>el.open)&&await page.locator('#example-summary-link').evaluate(el=>el===document.activeElement));
    };
    const output=async(persona,input,reply,data)=>{
      const profiles={'bayou-air':{owner:'Ray',company:'Bayou Air & Heat'},'katy-pipeworks':{owner:'Dana',company:'Katy Pipeworks'},'westheimer-maids':{owner:'Nia',company:'Westheimer Maids'}};
      await page.evaluate(({reply,event})=>window.__outcomeUI.queue.push({reply,events:[event]}),{reply,event:{type:'owner_notification',...profiles[persona],data,at:'2026-10-22T02:00:00Z'}});
      await page.locator('#example-input').fill(input);check(`${width}px typing from Watch preserves request`,await page.locator('#example-input').inputValue()===input&&await page.locator('#demo-wrap').getAttribute('data-mode')==='live');
      await page.locator('#example-send').click();await page.waitForFunction(()=>document.querySelector('#example-messages').getAttribute('aria-busy')==='false');
      const request=await page.evaluate(()=>window.__outcomeUI.typed.at(-1));check(`${width}px explicit send uses selected persona`,request.persona===persona&&request.stream===true,request);
    };
    try{
      await page.goto(base.href,{waitUntil:'domcontentloaded'});await page.locator('.site-demo-ready').waitFor();await Promise.all(sourceReads);
      check(`${width}px loaded current exact stories and layout source`,report.servedSources.filter(row=>row.width===width).length===2&&report.servedSources.filter(row=>row.width===width).every(row=>row.matchesStartingSource),report.servedSources.filter(row=>row.width===width));
      check(`${width}px no voice or typed call on first load`,await page.evaluate(()=>window.__outcomeUI.voices.length===0&&window.__outcomeUI.typed.length===0));
      for(const id of['call','spanish','sms']){
        await page.locator(`[data-example="${id}"]`).click();
        check(`${width}px ${id} first selection starts playback`,await page.locator('#example-play').innerText()==='Pause');
        await page.waitForTimeout(2700);check(`${width}px ${id} delivered an assistant answer after first click`,(await state()).messages.length>=2);await visibleReply(`${id} first answer`);
        await page.waitForTimeout(4600);await visibleReply(`${id} completion`);
        const result=await state();check(`${width}px ${id} finishes useful owner result`,/4\s+of\s+4/.test(result.progress)&&result.messages.length===4&&result.summary.length>80,result);
        if(id==='spanish')check(`${width}px Spanish Watch owner result retains language`,result.summary.includes('Spanish'),result.summary);
        await capture(`${id}-watch`);await ownerPreview(`${id}-watch`);
      }
      await page.locator('#example-challenges button').first().click();
      check(`${width}px challenge prepares request without spending`,await page.locator('#example-input').inputValue()!==''&&await page.evaluate(()=>window.__outcomeUI.typed.length===0&&window.__outcomeUI.voices.length===0));
      await page.locator('#example-reset').click();
      const blank={customer_name:'Jamie Reed',phone:'713-555-0112',address:'',issue:'Dripping tap',requested_window:'after 3 pm',urgency:'flexible',language:'en',requested_action:'callback'};
      await page.locator('[data-example="call"]').click();
      await output('katy-pipeworks','Just have Dana call me after 3 pm. Do not request a visit.','Your callback request is ready for Dana to review; no visit is requested.',blank);
      let current=await state();check(`${width}px callback remains callback with human next action`,/callback/i.test(current.status)&&/Call the customer/.test(current.summary)&&/after 3 pm/.test(current.summary)&&!/Confirm the requested arrival window/.test(current.summary),current);
      await ownerPreview('callback');
      await page.locator('[data-example="spanish"]').click();
      const spanish={...blank,customer_name:'Ana Ruiz',phone:'713-555-0199',address:'145 Oak St, Memorial',issue:'Limpieza profunda: 3 recámaras, 2 baños, 1,000 pies cuadrados',requested_window:'sábado, 8 a 10',language:'es',requested_action:'visit_request'};
      await output('westheimer-maids','Corrija mi teléfono y dirección; son 3 recámaras.','He actualizado los datos de su solicitud para que Nia los revise.',spanish);
      current=await state();check(`${width}px Spanish corrected facts and request stay visible`,current.summary.includes('0199')&&current.summary.includes('145 Oak')&&current.summary.includes('3 recámaras')&&current.summary.includes('2 baños')&&current.summary.includes('1,000')&&/Spanish/.test(current.summary)&&/Visit request/.test(current.status),current);
      await ownerPreview('spanish-corrected');
      await page.locator('[data-example="call"]').click();
      await page.locator('#example-voice-start').click();await page.waitForTimeout(30);
      check(`${width}px explicit Talk starts selected voice only once`,await page.evaluate(()=>window.__outcomeUI.voices.length===1&&window.__outcomeUI.voices[0].options.persona==='katy-pipeworks'));
      await page.evaluate(data=>{const o=window.__outcomeUI.voices[0].options;o.onStatus({state:'listening'});o.onTranscript({role:'user',text:'Call me',isFinal:false});o.onTranscript({role:'user',text:'Call me after 3 pm',isFinal:true});o.onTranscript({role:'assistant',text:'Your callback request is ready.',isFinal:true});o.onSummary({type:'owner_notification',company:'Katy Pipeworks',owner:'Dana',data});},blank);
      check(`${width}px voice transcript and callback summary reflect delivered events`,(await state()).messages.some(x=>x==='Call me after 3 pm')&&/callback/i.test((await state()).status));
      const stop=await page.locator('#example-voice-stop').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{top:r.top,bottom:r.bottom,viewport:innerHeight,hit:hit===el||el.contains(hit)};});
      check(`${width}px active End call is in viewport and unobstructed`,stop.top>=0&&stop.bottom<=stop.viewport&&stop.hit,stop);
      await capture('voice-active');await page.locator('#example-voice-stop').click();const stopped=await state();
      await page.evaluate(()=>{const o=window.__outcomeUI.voices[0].options;o.onTranscript({role:'assistant',text:'STALE VOICE',isFinal:true});o.onStatus({state:'speaking'});});
      check(`${width}px Stop rejects late voice and restores typing`,!(await state()).messages.includes('STALE VOICE')&&!await page.locator('#example-input').isDisabled()&&await page.evaluate(()=>window.__outcomeUI.voices[0].destroyed===1),stopped);
      await page.locator('#example-voice-start').click();await page.waitForTimeout(30);await page.evaluate(()=>window.__outcomeUI.voices[1].options.onError({code:'microphone_denied',message:'Fixture denial'}));
      check(`${width}px denied microphone keeps working typed fallback`,!await page.locator('#example-input').isDisabled()&&/type/i.test(await page.locator('#example-voice-status').innerText()));
      await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#example-mode-watch').click();await page.locator('[data-example="spanish"]').click();await page.waitForTimeout(150);
      check(`${width}px reduced motion shows complete Spanish result`,(await state()).messages.length===4&&(await state()).summary.includes('Spanish'));
      await visibleReply('reduced-motion final answer');await capture('spanish-reduced-complete');await ownerPreview('spanish-reduced');
      const requests=await page.evaluate(()=>window.__outcomeUI.typed);report.typedFixtureRequests.push(...requests);report.cases.push({name:`${width}px customer-job UI fixtures`,...await state()});
      check(`${width}px no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }catch(error){report.issues.push({name:`${width}px UI`,detail:String(error.message||error)});}finally{await context.close();}
  }
}
async function recoveryChecks(){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base.origin||request.method()!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/functions/')){report.blockedRequests.push({method:request.method(),url:url.origin+url.pathname});return route.abort();}return route.continue();});
  await context.addInitScript(({origin})=>{
    const nativeFetch=window.fetch.bind(window),nativeTimeout=window.setTimeout.bind(window);
    const h=window.__recovery={queue:[],requests:[],held:[],voices:[],timeoutDurations:[]};
    window.setTimeout=(fn,ms,...args)=>{if(ms===90000){h.timeoutDurations.push(ms);return nativeTimeout(fn,80,...args);}return nativeTimeout(fn,ms,...args);};
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.origin!==origin||url.pathname!=='/api/chat')return nativeFetch(input,init);
      h.requests.push(JSON.parse(init.body));const item=h.queue.shift();if(!item)throw new Error('Unplanned recovery fixture request');
      if(item.hold)await new Promise(resolve=>h.held.push(resolve));
      if(item.never)return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('fixture timeout','AbortError')),{once:true}));
      if(item.status)return Response.json({error:'fixture'},{status:item.status});
      const body=item.raw??JSON.stringify({t:'delta',text:'Partial reply'})+'\n'+JSON.stringify({t:'done',reply:item.reply||'Fixture request ready.',events:item.events||[]})+'\n';
      const bytes=new TextEncoder().encode(body);return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=item.fragment?7:bytes.length)controller.enqueue(bytes.slice(i,i+(item.fragment?7:bytes.length)));controller.close();}}),{headers:{'Content-Type':'application/x-ndjson'}});
    };
    window.MCDemoVoice={start(options){const voice={options,destroyed:0};h.voices.push(voice);return{ready:Promise.resolve({callId:'recovery-fixture'}),destroy(){voice.destroyed++;},stop(){}};}};
  },{origin:base.origin});
  const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>report.browserErrors.push(error.message));
  const snapshot=()=>page.evaluate(()=>({mode:document.querySelector('#demo-wrap').dataset.mode,progress:document.querySelector('#example-progress').textContent,messages:document.querySelector('#example-messages').textContent,summary:document.querySelector('#example-summary').textContent,status:document.querySelector('#example-ticket-status').textContent,input:document.querySelector('#example-input').value,busy:document.querySelector('#example-messages').getAttribute('aria-busy'),error:document.querySelector('#example-error').hidden?'':document.querySelector('#example-error').textContent,requests:window.__recovery.requests.length}));
  const queue=async item=>page.evaluate(item=>window.__recovery.queue.push(item),item);
  const send=async(text,item,keyboard=false)=>{await queue(item);await page.locator('#example-input').fill(text);if(keyboard)await page.locator('#example-input').press('Enter');else await page.locator('#example-send').click();};
  const idle=()=>page.waitForFunction(()=>document.querySelector('#example-messages').getAttribute('aria-busy')==='false');
  const settle=()=>page.waitForTimeout(100);
  const event={type:'owner_notification',company:'Katy Pipeworks',owner:'Dana',data:{customer_name:'Sam',phone:'713-555-0151',address:'',issue:'Leaky tap',requested_window:'after 3 pm',urgency:'flexible',language:'en',requested_action:'callback'}};
  try{
    await page.goto(base.href,{waitUntil:'domcontentloaded'});await page.locator('.site-demo-ready').waitFor();
    check('fresh offscreen Watch does not run or request anything',(await snapshot()).progress==='1 of 4 messages'&&await page.locator('#example-play').innerText()==='Play'&&(await snapshot()).requests===0);
    await page.locator('#example-messages').scrollIntoViewIfNeeded();await page.waitForTimeout(2500);
    check('first viewport intersection advances ordinary Watch automatically',/2 of 4/.test((await snapshot()).progress));
    await page.locator('#example-play').click();const paused=(await snapshot()).progress;await page.waitForTimeout(2450);
    check('Pause preserves revealed facts without advancing',(await snapshot()).progress===paused&&await page.locator('#example-play').innerText()==='Play');
    await page.locator('#example-play').click();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await settle();const offscreen=(await snapshot()).progress;await page.waitForTimeout(2450);
    check('offscreen playback pauses without advancing',(await snapshot()).progress===offscreen&&await page.locator('#example-play').innerText()==='Play');
    await page.locator('#example-messages').scrollIntoViewIfNeeded();await page.waitForTimeout(2450);
    check('returning on screen requires explicit Play',(await snapshot()).progress===offscreen&&await page.locator('#example-play').innerText()==='Play');
    await page.locator('#example-replay').click();check('Replay restarts ordered playback at first fact',(await snapshot()).progress==='1 of 4 messages'&&await page.locator('#example-play').innerText()==='Pause');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    check('hidden document pauses active playback',await page.locator('#example-play').innerText()==='Play');
    await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}));
    await page.locator('[data-example="spanish"]').focus();await page.keyboard.press('Enter');
    check('keyboard scenario activation starts selected conversation',await page.locator('[data-example="spanish"]').getAttribute('aria-pressed')==='true'&&await page.locator('#example-play').innerText()==='Pause');
    await page.locator('#example-play').click();await page.locator('[data-example="call"]').click();await page.locator('#example-play').click();
    await page.locator('#example-input').fill('Call me');await page.locator('#example-input').press('Shift+Enter');await page.locator('#example-input').press('a');
    check('Shift+Enter creates newline without sending',(await snapshot()).input==='Call me\na'&&(await snapshot()).requests===0);
    await queue({reply:'José requested a callback — not a visit.',events:[event],fragment:true});await page.locator('#example-input').press('Enter');await idle();
    check('Enter explicitly sends fragmented UTF8 reply and actual callback summary',(await snapshot()).messages.includes('José requested a callback — not a visit.')&&/Callback requested/.test((await snapshot()).status)&&await page.evaluate(()=>window.__recovery.requests[0].messages[0].content==='Call me\na'));
    await page.locator('#example-input').fill('   ');check('blank send remains disabled',await page.locator('#example-send').isDisabled());
    const priorSummary=(await snapshot()).summary;
    await send('Please call again',{status:429});await idle();let current=await snapshot();
    check('rate limit restores exact draft and truthful previous summary',current.input==='Please call again'&&/busy/.test(current.error)&&current.summary===priorSummary&&!current.messages.includes('Please call again'));
    await queue({reply:'Callback request ready for Dana.',events:[event]});await page.locator('#example-send').click();await idle();
    check('retry clears error and does not duplicate failed history',(await snapshot()).error===''&&await page.evaluate(()=>window.__recovery.requests.at(-1).messages.filter(row=>row.content==='Please call again').length===1));
    for(const [name,raw]of[['stream error',JSON.stringify({t:'delta',text:'PARTIAL FAILURE'})+'\n'+JSON.stringify({t:'error',error:'upstream'})+'\n'],['malformed stream',JSON.stringify({t:'delta',text:'PARTIAL FAILURE'})+'\n{bad-json\n'],['missing completion',JSON.stringify({t:'delta',text:'PARTIAL FAILURE'})+'\n']]){
      const summary=(await snapshot()).summary;await send(name,{raw});await idle();current=await snapshot();
      check(`${name} removes partial answer, retains draft and prior summary`,current.input===name&&/didn’t finish/.test(current.error)&&!current.messages.includes('PARTIAL FAILURE')&&current.summary===summary);
    }
    await send('Timeout draft',{never:true});await idle();current=await snapshot();
    check('90-second timeout restores a retryable draft',current.input==='Timeout draft'&&/didn’t finish/.test(current.error)&&await page.evaluate(()=>window.__recovery.timeoutDurations.includes(90000)));
    await send('Reset pending',{hold:true,reply:'STALE RESET',events:[event]});await page.locator('#example-reset').click();await page.evaluate(()=>window.__recovery.held.shift()());await settle();current=await snapshot();
    check('Start over rejects late typed reply and owner summary',current.input===''&&current.busy==='false'&&!current.messages.includes('STALE RESET')&&/Waiting for details/.test(current.status)&&!current.summary.includes('Sam'));
    await send('Switch pending',{hold:true,reply:'STALE SCENARIO',events:[event]});await page.locator('[data-example="spanish"]').click();await page.evaluate(()=>window.__recovery.held.shift()());await settle();current=await snapshot();
    check('scenario switch rejects late typed reply and prior-shop summary',!current.messages.includes('STALE SCENARIO')&&!current.summary.includes('Sam')&&await page.locator('#example-company').innerText()==='Westheimer Maids · AI front desk');
    await send('Fresh Spanish request',{reply:'Solicitud preparada.',events:[]});await idle();
    check('new scenario starts fresh request history',await page.evaluate(()=>window.__recovery.requests.at(-1).persona==='westheimer-maids'&&window.__recovery.requests.at(-1).messages.length===1));
    await send('Watch pending',{hold:true,reply:'STALE WATCH',events:[event]});await page.locator('#example-mode-watch').click();await page.evaluate(()=>window.__recovery.held.shift()());await settle();current=await snapshot();
    check('Watch switch rejects late typed completion',current.mode==='watch'&&!current.messages.includes('STALE WATCH')&&!current.summary.includes('Sam'));
    await page.locator('[data-example="call"]').click();
    await page.locator('#example-voice-start').click();await settle();await page.locator('#example-reset').click();
    await page.evaluate(event=>{const o=window.__recovery.voices[0].options;o.onTranscript({role:'assistant',text:'STALE VOICE RESET',isFinal:true});o.onSummary(event);},event);
    check('Start over destroys voice and rejects late transcript/summary',await page.evaluate(()=>window.__recovery.voices[0].destroyed===1)&&!(await snapshot()).messages.includes('STALE VOICE RESET')&&!(await snapshot()).summary.includes('Sam'));
    await page.locator('#example-voice-start').click();await settle();await page.locator('[data-example="sms"]').click();
    await page.evaluate(event=>{const o=window.__recovery.voices[1].options;o.onTranscript({role:'assistant',text:'STALE VOICE SHOP',isFinal:true});o.onSummary(event);},event);
    check('scenario switch destroys voice and rejects prior-shop callbacks',await page.evaluate(()=>window.__recovery.voices[1].destroyed===1)&&!(await snapshot()).messages.includes('STALE VOICE SHOP')&&!(await snapshot()).summary.includes('Sam'));
    await page.locator('#example-challenges button').first().scrollIntoViewIfNeeded();await settle();
    const clearance=await page.locator('#example-challenges button').first().evaluate(el=>{const r=el.getBoundingClientRect(),launcher=document.querySelector('#mcAgentLauncher'),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);launcher.focus();return{hit:hit===el||el.contains(hit),launcherHidden:getComputedStyle(launcher).visibility==='hidden',launcherFocusable:document.activeElement===launcher};});
    check('inline challenge is unobstructed and sales launcher cannot take focus',clearance.hit&&clearance.launcherHidden&&!clearance.launcherFocusable,clearance);
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await settle();check('sales launcher returns away from inline controls',await page.locator('#mcAgentLauncher').isVisible());
    const path=`${prefix}-390-recovery.png`;await page.screenshot({path,animations:'disabled'});report.screenshots.push(path);
    report.typedFixtureRequests=await page.evaluate(()=>window.__recovery.requests);report.cases.push({name:'390px local recovery and keyboard fixtures',...await snapshot(),timeoutScale:'Only exact90000ms request timeout accelerated to80ms; playback uses real timers'});
  }finally{await context.close();}
}
async function fallbackChecks(){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base.origin||request.method()!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/functions/')){report.blockedRequests.push({method:request.method(),url:url.origin+url.pathname});return route.abort();}return route.continue();});
  await context.addInitScript(()=>{window.__fallbackVoices=[];window.MCDemoVoice={start(options){const voice={options,destroyed:0};window.__fallbackVoices.push(voice);return{ready:Promise.resolve({callId:'fallback-fixture'}),destroy(){voice.destroyed++;},stop(){}};}};});
  const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>report.browserErrors.push(error.message));
  try{
    await page.goto(base.href,{waitUntil:'domcontentloaded'});await page.locator('.site-demo-ready').waitFor();
    for(const scenario of['sms','spanish','call']){
      await page.locator(`[data-example="${scenario}"]`).click();
      const discovery=await page.locator('#example-voice-card').evaluate(el=>({hidden:el.hidden,display:getComputedStyle(el).display,heading:el.querySelector('strong').textContent,rendered:el.getClientRects().length>0}));
      check(`${scenario} discovers voice only for English plumbing`,discovery.rendered===(scenario==='call')&&discovery.hidden===(scenario!=='call'),discovery);
      await page.locator('#example-challenges button').first().click();
      const prepared=await page.locator('#example-input').inputValue();
      check(`${scenario} retains usable explicit-send typing and challenges`,prepared.trim().length>0&&!await page.locator('#example-input').isDisabled()&&!await page.locator('#example-send').isDisabled()&&await page.evaluate(()=>window.__fallbackVoices.length===0));
      await page.locator('#example-input').fill('Draft typed without a mode hurdle');
      check(`${scenario} typing preserves the draft without a voice start`,await page.locator('#example-input').inputValue()==='Draft typed without a mode hurdle'&&await page.locator('#demo-wrap').getAttribute('data-mode')==='live'&&await page.evaluate(()=>window.__fallbackVoices.length===0));
      await page.locator('#example-reset').click();
    }
    for(const [code,copy]of[['not_supported',/unavailable in this browser/i],['daily_limit',/today.*allowance has been used/i]]){
      await page.locator('#example-voice-start').click();await page.waitForFunction(()=>window.__fallbackVoices.length>0);
      await page.evaluate(code=>window.__fallbackVoices.at(-1).options.onError({code,message:'injected known bridge error'}),code);
      const detail=await page.evaluate(()=>({status:document.querySelector('#example-voice-status').textContent,error:document.querySelector('#example-error').textContent,errorVisible:!document.querySelector('#example-error').hidden,inputDisabled:document.querySelector('#example-input').disabled,stopHidden:document.querySelector('#example-voice-stop').hidden,startHidden:document.querySelector('#example-voice-start').hidden}));
      check(`${code} presents correct friendly typing fallback`,copy.test(detail.status)&&/type/i.test(detail.status)&&detail.error===detail.status&&detail.errorVisible,detail);
      await page.locator('#example-input').fill('Typed request retained without sending');
      check(`${code} restores usable composer and retry control`,!detail.inputDisabled&&detail.stopHidden&&!detail.startHidden&&!await page.locator('#example-send').isDisabled());
      await page.locator('#example-reset').click();
    }
    check('English plumbing Start invokes only the selected voice fixture',await page.evaluate(()=>window.__fallbackVoices.length===2&&window.__fallbackVoices.every(voice=>voice.options.persona==='katy-pipeworks'&&voice.options.language==='en')));
    report.cases.push({name:'three scenario voice discovery and two actual bridge-code UI fallbacks',calls:'Injected MCDemoVoice only; no microphone, SDK, proxy or typed send'});
  }finally{await context.close();}
}
try{
  if(phase==='ui')await uiChecks();
  else if(phase==='recovery')await recoveryChecks();
  else if(phase==='fallback')await fallbackChecks();
  else {
  await run('explicit start, transport, valid action, stop and late-event isolation',{},async page=>{
    const before=await inspect(page);check('loading bridge performs no microphone/SDK/proxy work',before.micCalls===0&&before.sdkLoads===0&&before.requests.length===0);
    const ready=await startReady(page);check('explicit start resolves room ID with injected audio',ready.ready?.callId==='fixture-call'&&(await inspect(page)).instances[0].audioInjected);
    check('proxy request contains only fixed persona and language',JSON.stringify((await inspect(page)).requests[0])===JSON.stringify({url:'/api/practice-voice/call/web',method:'POST',body:{persona:'bayou-air',language:'en'}}));
    await page.evaluate(()=>{const h=window.__voiceFixture,sdk=h.instances[0];sdk.emit('call-start');sdk.emit('speech-start');sdk.emit('speech-end');sdk.emit('message',{type:'transcript',role:'user',transcript:'Call me',transcriptType:'partial'});sdk.emit('message',{type:'transcript',role:'assistant',transcript:'Your callback is requested.',transcriptType:'final'});sdk.emit('message',h.summary(JSON.stringify(h.data)));sdk.emit('message',h.summary({...h.data,requested_action:'booked'}));sdk.emit('message',h.summary('{bad JSON'));});
    const active=await inspect(page);check('voice reports connecting/listening/speaking transitions',JSON.stringify(active.events.filter(x=>x.name==='onStatus').map(x=>x.data.state))===JSON.stringify(['connecting','listening','speaking','listening']));
    check('partial and final transcript states remain distinct',JSON.stringify(active.events.filter(x=>x.name==='onTranscript').map(x=>[x.data.role,x.data.isFinal]))===JSON.stringify([['user',false],['assistant',true]]));
    const summaries=active.events.filter(x=>x.name==='onSummary');check('only valid requested-action summary reaches fixed owner',summaries.length===1&&summaries[0].data.company==='Bayou Air & Heat'&&summaries[0].data.owner==='Ray'&&summaries[0].data.data.requested_action==='callback',summaries);
    await page.evaluate(()=>{const h=window.__voiceFixture;h.controllers[0].stop();h.controllers[0].stop();});const stopped=await inspect(page);
    check('Stop ends once, releases track and closes SDK once',stopped.events.filter(x=>x.name==='onEnd').length===1&&stopped.stoppedTracks===1&&stopped.instances[0].stops===1&&stopped.instances[0].sent.length===1&&stopped.timers.length===0,stopped);
    await page.evaluate(()=>{const h=window.__voiceFixture,sdk=h.instances[0];sdk.emit('message',{type:'transcript',role:'assistant',transcript:'STALE',transcriptType:'final'});sdk.emit('message',h.summary(h.data));sdk.emit('speech-start');sdk.emit('error');sdk.emit('call-end');});
    check('stopped session ignores all late callbacks',JSON.stringify((await inspect(page)).events)===JSON.stringify(stopped.events));
  });
  for(const[micError,code]of[['NotAllowedError','microphone_denied'],['NotFoundError','microphone_unavailable']])await run(micError,{micError},async page=>{const result=await startReady(page),s=await inspect(page);check(`${micError} returns null with actionable failure before SDK/proxy`,result.ready===null&&s.events.some(x=>x.name==='onError'&&x.data.code===code)&&s.sdkLoads===0&&s.requests.length===0,s);});
  await run('unsupported browser',{unsupported:true},async page=>{const result=await startReady(page),s=await inspect(page);check('unsupported browser refuses voice before device/proxy work',result.ready===null&&s.events.some(x=>x.name==='onError'&&x.data.code==='not_supported')&&s.micCalls===0&&s.requests.length===0);});
  for(const[config,name]of[[{status:429,error:'daily_limit'},'daily cap'],[{sdkError:true},'SDK failure'],[{joinError:true},'join failure']])await run(name,config,async page=>{const result=await startReady(page),s=await inspect(page);check(`${name} ends without retaining microphone`,result.ready===null&&s.stoppedTracks===1&&s.events.some(x=>x.name==='onError')&&s.events.filter(x=>x.name==='onEnd').length===1,s);});
  for(const timeout of[false,true])await run(timeout?'startup timeout':'cancel while microphone pending',{micPending:true},async page=>{
    await page.evaluate(()=>window.__voiceFixture.start());await page.waitForTimeout(10);
    await page.evaluate(timeout=>{const h=window.__voiceFixture;if(timeout)h.fire(30000);else h.controllers[0].stop();},timeout);
    const ready=await page.evaluate(()=>window.__voiceFixture.controllers[0].ready);check(`${timeout?'timeout':'cancel'} settles ready without waiting for microphone`,ready===null);
    await page.evaluate(()=>window.__voiceFixture.resolveMic());await page.waitForTimeout(10);const s=await inspect(page);
    check('late granted microphone is stopped without SDK/proxy work',s.stoppedTracks===1&&s.sdkLoads===0&&s.requests.length===0,s);
  });
  await run('90-second hard limit',{},async page=>{await startReady(page);await page.evaluate(()=>{const h=window.__voiceFixture;h.instances[0].emit('call-start');h.fire(90000);});const s=await inspect(page);check('duration cap stops and releases all audio resources',s.events.some(x=>x.name==='onEnd'&&x.data.reason==='duration_limit')&&s.stoppedTracks===1&&s.instances[0].stops===1&&s.timers.length===0,s);});
  await run('new persona destroys prior audio session',{},async page=>{await startReady(page);await startReady(page,'katy-pipeworks','en');const before=await inspect(page);await page.evaluate(()=>{const h=window.__voiceFixture;h.instances[0].emit('message',h.summary(h.data));h.instances[0].emit('speech-start');});const s=await inspect(page);check('scenario replacement releases prior mic and rejects stale callbacks',s.instances[0].stops===1&&s.stoppedTracks===1&&JSON.stringify(s.events)===JSON.stringify(before.events));await page.evaluate(()=>window.__voiceFixture.controllers[1].stop());});
  await run('page departure cleanup',{},async page=>{await startReady(page);await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));const s=await inspect(page);check('pagehide releases microphone and SDK',s.stoppedTracks===1&&s.instances[0].stops===1&&s.timers.length===0);});
  await run('invalid persona',{},async page=>{const result=await startReady(page,'unknown-practice','en'),s=await inspect(page);check('invalid persona starts no device or proxy work',result.ready===null&&s.micCalls===0&&s.requests.length===0&&s.events.some(x=>x.name==='onError'&&x.data.code==='invalid_request'));});
  }
  check('zero unexpected network attempts',report.blockedRequests.every(row=>row.method==='GET'&&row.url.startsWith('https://fonts.googleapis.com/')),report.blockedRequests);check('zero browser errors',report.browserErrors.length===0,report.browserErrors);check('relevant sources stayed stable',JSON.stringify(sourceSnapshot())===JSON.stringify(report.source));report.sourceFingerprint=hash(JSON.stringify(report.source));report.result=report.issues.length?'failed':'passed';
}catch(error){report.result='failed';report.error=String(error.message||error);}
finally{await browser.close();report.finishedAt=new Date().toISOString();writeFileSync(`${prefix}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,checks:report.checks.length,issues:report.issues.length,error:report.error,evidence:`${prefix}.json`}));if(report.result!=='passed')process.exitCode=1;}
