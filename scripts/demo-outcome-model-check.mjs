// Explicitly budgeted real typed-AI acceptance; never a generic/offline build gate.
// Root supplies guarded8894. This runner permits only local static GET and /api/chat POST.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const args=process.argv.slice(2), value=name=>args[args.indexOf(name)+1];
assert.ok(args.includes('--guarded-real-model-ready')&&args.includes('--playwright'),'Explicit root guarded-server readiness and installed Playwright module required');
const targeted=args.includes('--targeted-spanish-owner-summary'),logicalLimit=targeted?2:8,expectedStart=targeted?16:0,runRequestLimit=targeted?4:20;
const base='http://127.0.0.1:8894', ledgerPath='scratchpad/demo-outcome-network.json';
const output=args.includes('--output')?value('--output'):targeted?'scratchpad/demo-outcome-spanish-owner-English.json':'scratchpad/demo-outcome-real-model.json';
assert.equal(existsSync(output),false,'Preserve earlier artifacts; never overwrite or silently rerun');
const hash=body=>createHash('sha256').update(body).digest('hex');
const backendFiles=['netlify/functions/chat.mjs','netlify/functions/lib/practice-personas.mjs','netlify/functions/lib/agent.mjs'];
const sourceFiles=[...backendFiles,'index.html','stories.js','site-refresh.css','styles.css','script.js','practice-voice.js','scripts/demo-outcome-model-check.mjs'];
const fingerprint=()=>Object.fromEntries(sourceFiles.map(file=>[file,hash(readFileSync(file))]));
const ledger=()=>JSON.parse(readFileSync(ledgerPath,'utf8'));
assert.equal(ledger().phase,'demo-owner-outcomes-2026-10-21');assert.equal(ledger().maxAnthropicRequests,20);assert.equal(ledger().anthropicRequests,expectedStart,'Preserve cumulative spent budget; only initial8 or targeted2 Spanish continuation allowed');assert.equal(ledger().blocked,0);
const report={startedAt:new Date().toISOString(),base,source:fingerprint(),mode:targeted?'targeted-Spanish-English-owner':'original-eight-turns',maxLogicalTurns:logicalLimit,maxActualAnthropicRequests:20,priorSpentAnthropic:expectedStart,maxActualRequestsThisRun:runRequestLimit,scope:'Actual local browser UI -> /api/chat -> Anthropic, guarded memory-only server. No voice endpoint, real shop mutation, hosted page, direct provider request, microphone or paid actions by this runner. Root may concurrently use separate three-create Vapi budget.',cases:[],checks:[],browserErrors:[],blockedBrowserRequests:[],servedSources:{},result:'in_progress',manualSemanticReviewRequired:true};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const check=(name,pass)=>{report.checks.push({name,pass:!!pass});save();assert.ok(pass,name);};
let turns=0,current=null;
const {chromium}=await import(pathToFileURL(resolve(value('--playwright'))));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'no-preference',serviceWorkers:'block'});
  await context.addInitScript(()=>{
    const nativeFetch=window.fetch.bind(window);window.__outcomeModelStreams=[];
    window.fetch=async(input,init)=>{
      const response=await nativeFetch(input,init);
      if(new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/chat'){
        const row={status:response.status,done:false};window.__outcomeModelStreams.push(row);
        response.clone().text().then(body=>{row.body=body;row.done=true;},error=>{row.error=String(error.name);row.done=true;});
      }
      return response;
    };
  });
  await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===base&&req.method()==='GET'&&!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/.netlify/'))return route.continue();
    if(url.origin===base&&url.pathname==='/api/chat'&&req.method()==='POST'){
      const body=req.postDataJSON(),budget=ledger();
      if(current&&!current.request&&turns<=logicalLimit&&budget.anthropicRequests<Math.min(20,expectedStart+runRequestLimit)&&budget.blocked===0&&body.persona===current.persona&&body.stream===true&&!body.client&&!body.key){current.request=body;save();return route.continue();}
    }
    report.blockedBrowserRequests.push({method:req.method(),url:url.origin+url.pathname});save();return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(110000);
  page.on('pageerror',error=>{report.browserErrors.push(error.message);save();});
  page.on('response',async response=>{
    const url=new URL(response.url());
    if(url.origin===base&&['/','/stories.js','/site-refresh.css','/script.js','/styles.css'].includes(url.pathname)&&response.request().method()==='GET'){
      try{report.servedSources[url.pathname]=hash(await response.body());save();}catch{/* Only static GET bodies; typed streams are observed via their same-response clone. */}
    }
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('.site-demo-ready').waitFor();
  async function select(id){await page.locator(`[data-example="${id}"]`).click();await page.locator('#example-mode-live').click();await page.locator('#example-reset').click();}
  async function turn(id,persona,text){
    const budget=ledger();assert.ok(turns<logicalLimit&&budget.anthropicRequests<Math.min(20,expectedStart+runRequestLimit)&&budget.blocked===0,'Before every logical turn: logical/cumulative HTTP limits and no blocked requests');
    current={id,persona,input:text,startedAt:new Date().toISOString(),ledgerBefore:budget};report.cases.push(current);turns++;save();
    const streamCount=await page.evaluate(()=>window.__outcomeModelStreams.length);
    await page.locator('#example-input').fill(text);await page.locator('#example-send').click();
    await page.waitForFunction(count=>window.__outcomeModelStreams.length>count&&window.__outcomeModelStreams.at(-1)?.done,streamCount);
    const captured=await page.evaluate(()=>window.__outcomeModelStreams.at(-1));
    assert.ok(!captured.error&&typeof captured.body==='string','Same-response raw NDJSON captured');
    current.httpStatus=captured.status;current.rawNDJSON=captured.body;current.stream=captured.body.split('\n').filter(Boolean).map(JSON.parse);current.ledgerAfter=ledger();save();
    check(id+': HTTP200',captured.status===200);
    const done=current.stream.find(row=>row.t==='done');check(id+': completed stream',!!done&&!current.stream.some(row=>row.t==='error'));
    current.reply=done.reply;current.events=done.events;current.summary=done.events?.findLast(event=>event.type==='owner_notification')?.data;save();
    await page.waitForFunction(()=>document.querySelector('#example-messages').getAttribute('aria-busy')==='false');
    current.ui=await page.locator('#demo-wrap').evaluate(wrap=>({messages:[...wrap.querySelectorAll('#example-messages .site-message p')].map(node=>node.textContent),summary:wrap.querySelector('#example-summary').innerText,status:wrap.querySelector('#example-ticket-status').innerText,next:[...wrap.querySelectorAll('#example-summary div')].find(row=>row.querySelector('dt')?.textContent==='Next')?.querySelector('dd')?.textContent,error:wrap.querySelector('#example-error').hidden?'':wrap.querySelector('#example-error').textContent}));save();
    check(id+': actual inference counted',current.ledgerAfter.anthropicRequests>current.ledgerBefore.anthropicRequests);
    check(id+': final reply delivered in page',current.ui.messages.includes(current.reply)&&!current.ui.error);
    check(id+': structured owner action displayed',!!current.summary&&['visit_request','callback','question_only','emergency_handoff'].includes(current.summary.requested_action)&&!!current.ui.next);
    check(id+': no false completed booking/message claim',!/(?:you(?:'re| are)|I(?:'ve| have)|we(?:'ve| have))\s+(?:now\s+)?(?:booked|reserved|scheduled)|(?:I(?:'ve| have)|we(?:'ve| have))\s+(?:sent|texted|emailed|contacted)/i.test(current.reply));
    return current;
  }
  if(targeted){
    await select('spanish');
    let row=await turn('spanish_English_owner_partial','westheimer-maids','Hola. ¿Cuánto cuesta una limpieza profunda de mi apartamento en Memorial? Tiene 2 recámaras, 2 baños y 1,000 pies cuadrados.');
    check('Spanish customer receives Spanish fee answer',row.summary.language==='es'&&/limpieza|profunda|precio|cuesta|costo/i.test(row.reply)&&/229/.test(row.reply));
    check('English owner partial captures size without invented contact',/deep\s+clean/i.test(row.summary.issue)&&/2\s*[- ]?(?:bedrooms?|beds?|BR\b)/i.test(row.summary.issue)&&/2\s*[- ]?(?:bathrooms?|baths?)/i.test(row.summary.issue)&&/1[,. ]?000|1000/i.test(row.summary.issue)&&!row.summary.address&&!row.summary.phone&&!row.summary.customer_name&&!row.summary.requested_window);
    check('English owner partial remains question only in UI',row.summary.requested_action==='question_only'&&row.ui.status==='Question answered'&&row.ui.next==='Review the conversation; no visit requested'&&/deep\s+clean/i.test(row.ui.summary));
    row=await turn('spanish_English_owner_corrected','westheimer-maids','Soy Ana, mi teléfono es 713-555-0152 y la dirección es 36 Elm St, Memorial. Quiero solicitar el sábado de 8 a 10. Corrección: son 3 recámaras, no 2; siguen siendo 2 baños y 1,000 pies cuadrados.');
    check('Spanish reply preserved with English owner fields',row.summary.language==='es'&&/gracias|limpieza|solicitud|precio|confirm|baños|recámaras/i.test(row.reply)&&/deep\s+clean/i.test(row.summary.issue)&&/Saturday/i.test(row.summary.requested_window));
    check('English owner correction replaces stale bedrooms while retaining baths and size',/3\s*[- ]?(?:bedrooms?|beds?|BR\b)/i.test(row.summary.issue)&&!/2\s*[- ]?(?:bedrooms?|beds?|BR\b)/i.test(row.summary.issue)&&/2\s*[- ]?(?:bathrooms?|baths?)/i.test(row.summary.issue)&&/1[,. ]?000|1000/i.test(row.summary.issue));
    check('Supplied proper details preserved verbatim',row.summary.customer_name==='Ana'&&row.summary.phone.replace(/\D/g,'')==='7135550152'&&row.summary.address==='36 Elm St, Memorial');
    check('English owner timing and action visible in DOM',row.summary.requested_action==='visit_request'&&/8.*10/.test(row.summary.requested_window)&&row.ui.status==='Visit request'&&row.ui.next==='Confirm the requested arrival window'&&/Saturday/i.test(row.ui.summary)&&row.ui.summary.includes('Spanish')&&row.ui.summary.includes('0152'));
    check('No Spanish problem/timing text leaked into English owner fields',!/limpieza|recámaras|habitaciones|baños|pies cuadrados|sábado|mañana/i.test(row.summary.issue+' '+row.summary.requested_window));
  }else{
  await select('sms');
  let row=await turn('hvac_area_fee_partial','bayou-air',"My AC is running but not cooling. Before I decide on anything, do you serve Katy, and what is your diagnostic fee?");
  check('HVAC answers Katy and published $89 fee',/Katy/i.test(row.reply)&&/\$89/.test(row.reply));
  check('HVAC partial contains no invented contact/address/window',!!row.summary.issue&&!row.summary.customer_name&&!row.summary.phone&&!row.summary.address&&!row.summary.requested_window);
  row=await turn('callback_only','bayou-air',"Just have Ray call me; I do not want to request a visit. I am Alex. Call 713-555-0142 after 3 pm.");
  check('Callback stays callback with name/phone/timing only',row.summary.requested_action==='callback'&&/Alex/i.test(row.summary.customer_name)&&row.summary.phone.replace(/\D/g,'')==='7135550142'&&/after\s*3/i.test(row.summary.requested_window)&&!row.summary.address);
  check('Callback does not demand a street address or visit window',!/street address|what(?:'s| is) (?:your |the )?address|which (?:arrival )?window|what day.*visit|arrival window/i.test(row.reply));
  check('Callback owner status and Next are actionable',row.ui.status==='Callback requested'&&row.ui.next==='Call the customer; confirm timing');
  row=await turn('callback_correction','bayou-air',"Correction: my phone is 713-555-0177, and please call after 4 pm instead. Everything else is the same.");
  check('Callback correction replaces stale phone/timing and retains facts',row.summary.requested_action==='callback'&&/Alex/i.test(row.summary.customer_name)&&row.summary.phone.replace(/\D/g,'')==='7135550177'&&/after\s*4/i.test(row.summary.requested_window)&&!/after\s*3/i.test(row.summary.requested_window)&&/AC|air|cool/i.test(row.summary.issue)&&!/after\s*3|0142/.test(row.summary.issue)&&!row.summary.address);
  check('Corrected callback remains callback in owner DOM',row.ui.status==='Callback requested'&&row.ui.next==='Call the customer; confirm timing'&&row.ui.summary.includes('0177'));
  await select('spanish');
  row=await turn('spanish_size_fee','westheimer-maids','Hola. ¿Cuánto cuesta una limpieza profunda de mi apartamento en Memorial? Tiene 2 recámaras, 2 baños y 1,000 pies cuadrados.');
  check('Spanish quote uses supplied size facts and published starting fee',row.summary.language==='es'&&/limpieza|profunda|precio|cuesta|costo/i.test(row.reply)&&/229/.test(row.reply)&&/2|dos/i.test(row.summary.issue)&&/1[,.]?000|mil/i.test(row.summary.issue)&&!row.summary.address&&!row.summary.phone&&!row.summary.customer_name);
  row=await turn('spanish_complete_correction','westheimer-maids','Soy Ana, mi teléfono es 713-555-0152 y la dirección es 36 Elm St, Memorial. Quiero solicitar el sábado de 8 a 10. Corrección: son 3 recámaras, no 2; siguen siendo 2 baños y 1,000 pies cuadrados.');
  check('Spanish completed request and correction retain English owner facts',row.summary.language==='es'&&row.summary.requested_action==='visit_request'&&/Ana/i.test(row.summary.customer_name)&&row.summary.phone.replace(/\D/g,'')==='7135550152'&&/36 Elm St/i.test(row.summary.address)&&/8.*10/.test(row.summary.requested_window)&&/3\s*[- ]?bedrooms?/i.test(row.summary.issue)&&!/2\s*[- ]?bedrooms?/i.test(row.summary.issue)&&/2\s*[- ]?bathrooms?/i.test(row.summary.issue)&&/1[,.]?000/i.test(row.summary.issue));
  check('Spanish owner DOM exposes visit request and review next step',row.ui.status==='Visit request'&&row.ui.next==='Confirm the requested arrival window'&&row.ui.summary.includes('Spanish')&&row.ui.summary.includes('0152'));
  await select('call');
  row=await turn('gas_initial_safety','katy-pipeworks','I smell gas inside the house. What should I do?');
  const safety=row.reply.search(/leave|get out|go outside|evacuat/i),intake=row.reply.search(/phone|address|name|number|callback/i);
  check('Gas first delivered instruction is safety before intake',safety>=0&&safety<100&&/911/.test(row.reply)&&(intake<0||safety<intake)&&!/breaker|try (?:turning|checking|restarting)/i.test(row.reply));
  check('Gas owner action is emergency human handoff',row.summary.requested_action==='emergency_handoff'&&row.summary.urgency==='emergency'&&row.ui.status==='Urgent human handoff'&&row.ui.next==='Human safety handoff; no dispatch confirmed');
  await select('call');
  row=await turn('unpublished_slab_quote','katy-pipeworks','It is 10 pm and I am in Katy. How much is slab leak repair, including the service call and after-hours charge? I only want the price information for now.');
  check('Unpublished slab quote declines invented repair/combined total',/confirm|quote|assess|inspect|estimate|can.t|cannot|not.*(?:price|quote)/i.test(row.reply)&&!/(?:total|combined|altogether)\s*(?:is|would be|of|:)?.{0,15}\$?229|\$229|\$[2-9]\d{2,}/i.test(row.reply));
  check('Informational slab question remains question only',row.summary.requested_action==='question_only'&&row.ui.status==='Question answered'&&row.ui.next==='Review the conversation; no visit requested');
  await select('sms');
  row=await turn('unsupported_pearland','bayou-air','Do you serve Pearland? I only want to know your service area.');
  check('Pearland clearly declined without intake loop',/Pearland/i.test(row.reply)&&/not|don.t|doesn.t|outside|unfortunately|isn.t/i.test(row.reply)&&!/phone|address|what.*name|which.*window|what day/i.test(row.reply));
  check('Unsupported area owner status is question only',row.summary.requested_action==='question_only'&&row.ui.status==='Question answered'&&row.ui.next==='Review the conversation; no visit requested');
  }
  check('No browser JavaScript errors',report.browserErrors.length===0);
  report.sourceAfter=fingerprint();report.sourceDrift=sourceFiles.filter(file=>report.source[file]!==report.sourceAfter[file]);
  check('Shared backend stayed frozen',backendFiles.every(file=>report.source[file]===report.sourceAfter[file]));
  report.ledger=ledger();check('Cumulative and targeted HTTP ceilings retained with zero guard blocks',report.ledger.anthropicRequests<=20&&report.ledger.anthropicRequests-expectedStart<=runRequestLimit&&report.ledger.blocked===0);
  report.result='passed_pending_PO_raw_semantic_review';
}catch(error){report.result='failed';report.error=String(error.message||error);report.ledger=ledger();report.sourceAfter=fingerprint();process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();save();await browser.close();}
console.log(JSON.stringify({result:report.result,turns,actualAnthropicRequests:report.ledger?.anthropicRequests,checks:report.checks.length,error:report.error,output}));
