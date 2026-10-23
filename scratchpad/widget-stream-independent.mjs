// Independent browser acceptance of the actual embed. Only transport bytes are scripted.
// No backend save, model, provider, signup or physical network request is exercised.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net';import http from 'node:http';import https from 'node:https';
const root=resolve(import.meta.dirname,'..'), output=resolve(root,process.argv[2]||'scratchpad/widget-stream-independent.json');
assert.equal(existsSync(output),false,'Keep prior evidence; choose a new receipt');
const sha=value=>createHash('sha256').update(value).digest('hex');
const source=readFileSync(resolve(root,'embed.js'),'utf8');
const report={at:new Date().toISOString(),scope:'Actual embed DOM, storage and outgoing-payload checks with controlled in-browser Response/ReadableStream fixtures; no real backend/model/provider/save evidence',sourceBefore:sha(source),harnessHash:sha(readFileSync(new URL(import.meta.url))),baselineHash:sha(readFileSync(resolve(root,'scratchpad/website-stream-baseline.json'))),checks:[],blockedRequests:[],pageErrors:[],physicalNetwork:0,screenshots:[]};
assert.equal(report.sourceBefore,'e96a5190e806a79e2572aa9ebbe7b42743921d4c66ed56006cc578f404c64ae7');
const deny=()=>{report.physicalNetwork++;throw Error('Widget QA physical network denied');};
globalThis.fetch=net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
const {chromium}=await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND']});
const shop='https://customer.fixture.invalid',platform='https://platform.fixture.invalid',storeKey='mc_desk_qa-shop';
const final='Solicitud recibida 🛠️. Your request is saved; the shop must confirm the visit.';
const partial='Checking the details — please wait 🛠️';
const packet=value=>JSON.stringify(value)+'\n';
const encoder=new TextEncoder();
async function fixture({width=390,mode='ndjson',status=200,history=[],noStorage=false}={}){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url===shop+'/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Independent widget fixture</title><h1>Fixture shop</h1><label>Host page field <input id="hostField"></label><script src="'+platform+'/embed.js" data-client="qa-shop" async></script>'});
    if(url===platform+'/embed.js')return route.fulfill({contentType:'text/javascript',body:source});
    report.blockedRequests.push({url,method:route.request().method()});return route.abort();
  });
  await context.addInitScript(({platform,storeKey,mode,status,history,noStorage})=>{
    const originalFetch=window.fetch.bind(window),originalSet=window.setTimeout.bind(window),originalClear=window.clearTimeout.bind(window);
    const q=window.widgetQA={payloads:[],controllers:[],cancellations:0,aborts:0,timers:[],clientReads:0};
    if(history.length)sessionStorage.setItem(storeKey,JSON.stringify({contact:'fixed-history-contact',transcript:history}));
    if(noStorage){Storage.prototype.setItem=function(){throw new DOMException('Fixture storage denied','SecurityError');};}
    const tracked=new Map();
    window.setTimeout=(callback,delay,...args)=>{const id=originalSet(callback,delay,...args);if(delay>=30000){const row={delay,active:true,fired:false,id,callback:()=>callback(...args)};q.timers.push(row);tracked.set(id,row);}return id;};
    window.clearTimeout=id=>{if(tracked.has(id))tracked.get(id).active=false;return originalClear(id);};
    q.expire=()=>{const row=q.timers.find(row=>row.active);if(!row)return false;originalClear(row.id);row.fired=true;row.callback();return true;};
    q.emit=(bytes,finish)=>{const controller=q.controllers[0];if(bytes?.length)controller.enqueue(new Uint8Array(bytes));if(finish==='eof')controller.close();if(finish==='error')controller.error(new TypeError('Explicit fixture transport failure'));};
    window.fetch=async(url,init={})=>{
      if(url===platform+'/api/client?c=qa-shop'){q.clientReads++;return new Response(JSON.stringify({name:'Fixture shop',greeting:'How can we help?',status:'live',webAvailable:true}),{headers:{'content-type':'application/json'}});}
      if(url!==platform+'/api/chat')return originalFetch(url,init);
      q.payloads.push(JSON.parse(init.body));if(init.signal)init.signal.addEventListener('abort',()=>q.aborts++);
      if(q.payloads.length>1)return new Response(JSON.stringify({t:'done',reply:'Confirmed follow-up reply.'}),{headers:{'content-type':'application/json'}});
      if(mode==='fetch-hang')return new Promise(()=>{});
      if(status!==200)return new Response(JSON.stringify({error:'fixture_failure'}),{status,headers:{'content-type':'application/json'}});
      const body=new ReadableStream({start(controller){q.controllers.push(controller);},cancel(){q.cancellations++;}});
      return new Response(body,{headers:{'content-type':mode==='json'?'application/json':'application/x-ndjson; charset=utf-8'}});
    };
  },{platform,storeKey,mode,status,history,noStorage});
  const page=await context.newPage();page.setDefaultTimeout(4000);page.on('pageerror',error=>report.pageErrors.push(error.message));
  await page.goto(shop+'/',{waitUntil:'load'});await page.locator('#mcDesk .l').click();await page.waitForFunction(()=>!document.querySelector('#mcDesk textarea').disabled);
  return {page,context,close:()=>context.close()};
}
async function begin(page,text='Please help with my AC tomorrow.'){
  await page.locator('#mcDesk textarea').fill(text);await page.keyboard.press('Enter');await page.waitForFunction(()=>window.widgetQA.payloads.length===1);
}
async function emit(page,text,finish){await page.evaluate(({bytes,finish})=>window.widgetQA.emit(bytes,finish),{bytes:[...encoder.encode(text)],finish});await page.waitForTimeout(20);}
async function observe(page){return page.evaluate(key=>({
  stored:JSON.parse(sessionStorage.getItem(key)||'null'),
  bubbles:[...document.querySelectorAll('#mcDesk .m .b')].map(el=>({text:el.textContent,status:el.getAttribute('role'),typing:el.classList.contains('t')})),
  input:document.querySelector('#mcDesk textarea').value,inputDisabled:document.querySelector('#mcDesk textarea').disabled,sendDisabled:document.querySelector('#mcDesk .s').disabled,
  payloads:window.widgetQA.payloads,cancellations:window.widgetQA.cancellations,aborts:window.widgetQA.aborts,timers:window.widgetQA.timers.map(({delay,active,fired})=>({delay,active,fired}))
}),storeKey);}
async function complete(page){await page.waitForFunction(()=>!document.querySelector('#mcDesk .s').disabled);return observe(page);}
function noFalseCompletion(value,oldAssistants=0){assert.equal(value.stored.transcript.filter(row=>row.role==='assistant').length,oldAssistants);assert.ok(value.bubbles.some(row=>row.status==='status'&&/confirm the outcome/.test(row.text)));assert.ok(!value.bubbles.some(row=>row.text===partial||row.typing));assert.equal(value.payloads.length,1);assert.equal(value.timers[0].delay,90000);assert.equal(value.timers[0].active,false);}
async function check(name,test){try{await test();report.checks.push({name,pass:true});}catch(error){report.checks.push({name,pass:false,error:error.message,stack:error.stack});}}
try{
  await check('Byte-split UTF-8 and a final packet without newline persist only the exact confirmed reply',async()=>{
    const f=await fixture();try{await begin(f.page);await emit(f.page,packet({t:'delta',text:partial}));let value=await observe(f.page);assert.equal(value.stored.transcript.filter(row=>row.role==='assistant').length,0);assert.ok(value.bubbles.some(row=>row.text===partial));
      const bytes=[...encoder.encode(JSON.stringify({t:'done',reply:final}))];await f.page.evaluate(bytes=>{for(const byte of bytes)window.widgetQA.emit([byte]);window.widgetQA.emit([],'eof');},bytes);
      value=await complete(f.page);assert.deepEqual(value.stored.transcript.filter(row=>row.role==='assistant'),[{role:'assistant',content:final}]);assert.ok(value.bubbles.some(row=>row.text===final));assert.ok(!value.bubbles.some(row=>row.text===partial));assert.equal(value.timers[0].active,false);
      await f.page.reload();await f.page.locator('#mcDesk .l').click();assert.equal(await f.page.locator('#mcDesk .m').getByText(final,{exact:true}).count(),1);
      await f.page.locator('#mcDesk textarea').fill('A deliberate follow-up.');await f.page.keyboard.press('Enter');await f.page.waitForFunction(()=>window.widgetQA.payloads.length===1);const payload=await f.page.evaluate(()=>window.widgetQA.payloads[0]);assert.equal(payload.messages.filter(row=>row.role==='assistant'&&row.content===final).length,1);
    }finally{await f.close();}
  });
  await check('Busy Enter preserves newer typing; done cancels an open body without opening or stealing focus',async()=>{
    const f=await fixture();try{await begin(f.page);await f.page.locator('#mcDesk textarea').fill('My next deliberate question.');await f.page.keyboard.press('Enter');await f.page.keyboard.press('Enter');assert.equal((await observe(f.page)).payloads.length,1);
      await f.page.locator('#mcDesk .x').click();await f.page.locator('#hostField').focus();await emit(f.page,packet({t:'done',reply:final})+packet({t:'delta',text:'MUST NOT APPEAR'}));let value=await complete(f.page);assert.equal(value.cancellations,1);assert.equal(value.input,'My next deliberate question.');assert.ok(!value.bubbles.some(row=>row.text.includes('MUST NOT APPEAR')));assert.equal(await f.page.locator('#hostField').evaluate(el=>el===document.activeElement),true);assert.equal(await f.page.locator('#mcDesk').evaluate(el=>el.classList.contains('open')),false);
      await f.page.locator('#mcDesk .l').click();await f.page.locator('#mcDesk .s').click();await f.page.waitForFunction(()=>window.widgetQA.payloads.length===2&&!document.querySelector('#mcDesk .s').disabled);value=await observe(f.page);assert.equal(value.payloads[1].messages.at(-1).content,'My next deliberate question.');assert.equal(value.payloads[1].messages.filter(row=>row.role==='assistant'&&row.content===final).length,1);
    }finally{await f.close();}
  });
  for(const scenario of [
    {name:'Clean EOF after provisional text',text:packet({t:'delta',text:partial}),finish:'eof'},
    {name:'Explicit error followed by a misleading done in the same chunk',text:packet({t:'delta',text:partial})+packet({t:'error',error:'fixture'})+packet({t:'done',reply:final})},
    {name:'Truncated final packet at EOF',text:packet({t:'delta',text:partial})+'{"t":"done","reply":"never completed',finish:'eof'},
    {name:'Transport exception after provisional text',text:packet({t:'delta',text:partial}),finish:'error'},
    {name:'Blank final answer',text:packet({t:'delta',text:partial})+packet({t:'done',reply:'  '})},
    {name:'JSON reply without an explicit done',text:JSON.stringify({reply:final}),finish:'eof',mode:'json'},
  ])await check(scenario.name+' cannot enter assistant history or auto-resend',async()=>{
    const history=[{role:'user',content:'Earlier question'},{role:'assistant',content:'Earlier confirmed reply'}];const f=await fixture({history,mode:scenario.mode});try{await begin(f.page);await emit(f.page,scenario.text,scenario.finish);let value=await complete(f.page);noFalseCompletion(value,1);
      await f.page.locator('#mcDesk textarea').fill('What should I do next?');await f.page.locator('#mcDesk .s').click();await f.page.waitForFunction(()=>window.widgetQA.payloads.length===2&&!document.querySelector('#mcDesk .s').disabled);value=await observe(f.page);const payload=value.payloads[1];assert.ok(!payload.messages.some(row=>row.role==='assistant'&&(row.content===partial||/confirm the outcome/.test(row.content))));assert.equal(payload.messages.filter(row=>row.role==='user').length,3);assert.equal(payload.messages.filter(row=>row.role==='assistant').length,1);
    }finally{await f.close();}
  });
  for(const mode of ['fetch-hang','ndjson','json'])await check(mode+' hanging response uses the registered 90-second deadline and releases exactly once',async()=>{
    const f=await fixture({mode});try{await begin(f.page);if(mode==='ndjson')await emit(f.page,packet({t:'delta',text:partial}));const before=await observe(f.page);assert.equal(before.sendDisabled,true);assert.equal(before.timers.length,1);assert.equal(before.timers[0].delay,90000);
      await f.page.evaluate(()=>window.widgetQA.expire());let value=await complete(f.page);noFalseCompletion(value);assert.equal(value.aborts,1);assert.equal(value.timers[0].fired,true);assert.equal(await f.page.evaluate(()=>window.widgetQA.expire()),false);await f.page.waitForTimeout(40);assert.equal((await observe(f.page)).payloads.length,1);
    }finally{await f.close();}
  });
  for(const status of [503,429])await check('HTTP '+status+' is not a completion and retains the correct composer availability',async()=>{
    const f=await fixture({status});try{await begin(f.page);await f.page.waitForFunction(status=>status===429?document.querySelector('#mcDesk textarea').disabled:!document.querySelector('#mcDesk .s').disabled,status);const value=await observe(f.page);assert.equal(value.stored.transcript.filter(row=>row.role==='assistant').length,0);assert.equal(value.inputDisabled,status===429);assert.equal(value.sendDisabled,status===429);assert.equal(value.payloads.length,1);assert.ok(value.bubbles.some(row=>row.status==='status'));assert.equal(value.timers[0].active,false);
    }finally{await f.close();}
  });
  for(const width of [320,390,1440])await check(width+'px rendered widget stays inside the viewport after terminal completion',async()=>{
    const f=await fixture({width});try{await begin(f.page);await emit(f.page,packet({t:'done',reply:final}));await complete(f.page);const geometry=await f.page.evaluate(()=>{const panel=document.querySelector('#mcDesk .p').getBoundingClientRect(),input=document.querySelector('#mcDesk textarea').getBoundingClientRect(),button=document.querySelector('#mcDesk .s').getBoundingClientRect();return {width:innerWidth,height:innerHeight,panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom},input:{left:input.left,right:input.right},button:{left:button.left,right:button.right}};});assert.ok(geometry.panel.left>=0&&geometry.panel.right<=width&&geometry.panel.top>=0&&geometry.panel.bottom<=geometry.height,JSON.stringify(geometry));assert.ok(geometry.input.right<=geometry.button.left&&geometry.button.right<=geometry.panel.right,JSON.stringify(geometry));if(width!==1440){const path=resolve(root,'scratchpad/widget-stream-independent-'+width+'.png');await f.page.screenshot({path});report.screenshots.push(path);}
    }finally{await f.close();}
  });
}finally{
  await browser.close();report.sourceAfter=sha(readFileSync(resolve(root,'embed.js')));report.sourceStable=report.sourceBefore===report.sourceAfter;report.harnessStable=report.harnessHash===sha(readFileSync(new URL(import.meta.url)));report.baselineUnchanged=report.baselineHash===sha(readFileSync(resolve(root,'scratchpad/website-stream-baseline.json')));report.summary={passed:report.checks.filter(row=>row.pass).length,failed:report.checks.filter(row=>!row.pass).length};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary,physicalNetwork:report.physicalNetwork,sourceStable:report.sourceStable,harnessStable:report.harnessStable,blockedRequests:report.blockedRequests,pageErrors:report.pageErrors,failures:report.checks.filter(row=>!row.pass)},null,2));
  if(report.summary.failed||report.physicalNetwork||report.blockedRequests.length||report.pageErrors.length||!report.sourceStable||!report.harnessStable||!report.baselineUnchanged)process.exitCode=1;
}
