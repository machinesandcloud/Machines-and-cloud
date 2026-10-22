// Root's explicitly bounded actual Vapi browser-audio acceptance. Uses only synthetic local PCM input.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const args = process.argv.slice(2), arg = name => args[args.indexOf(name) + 1];
assert.ok(args.includes('--guarded-provider-ready'));
const lang = arg('--language'); assert.ok(['en','es'].includes(lang));
const output = arg('--output'); assert.ok(output && !output.includes('..'));
const base = 'http://127.0.0.1:8894', inputFile = `/tmp/mc-voice-${lang}-padded.wav`;
const readLedger = () => JSON.parse(readFileSync('scratchpad/demo-outcome-network.json', 'utf8'));
const before = readLedger(); assert.ok(before.vapiCreates < 3 && before.blocked === 0);
const files = ['practice-voice.js','netlify/functions/practice-voice.mjs','netlify/functions/lib/practice-personas.mjs','stories.js','index.html','site-refresh.css','_headers'];
const source = () => Object.fromEntries(files.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const report = { startedAt: new Date().toISOString(), language: lang, syntheticInput: inputFile, source: source(), ledgerBefore: before, scope: 'One explicit browser-mic practice call through loopback proxy to real Vapi, using OS-generated synthetic speech. No telephone calls, SMS, email or Calendar actions.', requests: [], errors: [], checks: [], result: 'in_progress' };
const save = () => writeFileSync(output, JSON.stringify(report,null,2)+'\n');
const check = (name, pass, detail) => { report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})}); save(); assert.ok(pass,name); };
const { chromium } = await import(pathToFileURL('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'));
const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${inputFile}`,'--autoplay-policy=no-user-gesture-required'] });
try {
 const context = await browser.newContext({ viewport:{width:1440,height:1050},reducedMotion:'reduce',permissions:['microphone'],serviceWorkers:'block' });
 await context.addInitScript(() => {
  window.__voiceCalls=[]; window.__voicePCs=[];
  const native = window.fetch.bind(window); window.fetch=async(input,init)=>{
   const response=await native(input,init);
   if(new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/practice-voice/call/web') response.clone().json().then(data=>window.__voiceCalls.push({status:response.status,id:data.id,maxDurationSeconds:data.practice?.maxDurationSeconds,error:data.error}));
   return response;
  };
  if(window.RTCPeerConnection){const method=RTCPeerConnection.prototype.setRemoteDescription;RTCPeerConnection.prototype.setRemoteDescription=function(...args){if(!window.__voicePCs.includes(this))window.__voicePCs.push(this);return method.apply(this,args);};}
 });
 let creates=0;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===base){
   if(url.pathname==='/api/practice-voice/call/web'&&request.method()==='POST'){
    const body=request.postDataJSON();assert.ok(++creates===1&&body.language===lang&&body.persona===(lang==='es'?'westheimer-maids':'katy-pipeworks')); report.requests.push({method:'POST',path:url.pathname,body});save();return route.continue();
   }
   if(request.method()==='GET'&&!url.pathname.startsWith('/api/'))return route.continue();
   report.errors.push({blocked:'unrelated local action',method:request.method(),path:url.pathname});return route.abort();
  }
  if(url.protocol==='https:' && (url.hostname.endsWith('.vapi.ai')||url.hostname==='api.vapi.ai'||url.hostname.endsWith('.daily.co')))return route.continue();
  if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.abort();
  report.errors.push({blocked:'unexpected transport',host:url.hostname,type:request.resourceType()});return route.abort();
 });
 const page=await context.newPage();page.setDefaultTimeout(95000);
 page.on('pageerror',error=>report.errors.push({browser:error.message}));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator(`[data-example="${lang==='es'?'spanish':'call'}"]`).click();
 await page.locator('#example-voice-start').click();
 await page.waitForFunction(()=>window.__voiceCalls.length>0 || document.querySelector('#example-error').hidden===false,null,{timeout:40000});
 report.creation=await page.evaluate(()=>window.__voiceCalls);report.uiAfterCreate=await page.locator('#example-voice-status').innerText();save();
 check('Exactly one server-created voice room',report.creation.length===1&&report.creation[0].status===200,report.creation);
 // Wait for the synthetic caller's facts to appear in a genuine client-side tool event.
 await page.waitForFunction(()=>{const text=document.querySelector('#example-summary').innerText;return (text.includes('713')&&(text.includes('Sam')||text.includes('Ana'))) || !document.querySelector('#example-error').hidden;},null,{timeout:85000});
 await page.waitForTimeout(4000);
 report.ui=await page.locator('#demo-wrap').evaluate(wrap=>({messages:wrap.querySelector('#example-messages').innerText,summary:wrap.querySelector('#example-summary').innerText,status:wrap.querySelector('#example-ticket-status').innerText,voiceStatus:wrap.querySelector('#example-voice-status').innerText}));
 report.audio=[];
 for(const frame of page.frames()){
  try{const stats=await frame.evaluate(async()=>{const rows=[];for(const pc of window.__voicePCs||[]){try{const entries=await pc.getStats();for(const value of entries.values())if((value.kind==='audio'||value.mediaType==='audio')&&['inbound-rtp','media-playout'].includes(value.type))rows.push({type:value.type,kind:value.kind,packetsReceived:value.packetsReceived,bytesReceived:value.bytesReceived,totalAudioEnergy:value.totalAudioEnergy,totalSamplesDuration:value.totalSamplesDuration,totalSamplesReceived:value.totalSamplesReceived,audioLevel:value.audioLevel});}catch{}}return rows;});report.audio.push(...stats);}catch{}
 }
 save();check('Real remote audio received with nonzero energy',report.audio.some(row=>row.totalAudioEnergy>0&&row.packetsReceived>0),report.audio);
 check('Actual AI reply and synthetic caller transcript visible',report.ui.messages.length>120&&/Sam|Ana/.test(report.ui.messages));
 check('Structured owner summary uses the supplied phone',report.ui.summary.includes('713'));
 if(lang==='en')check('After-hours callback stays a callback, no visit',/callback/i.test(report.ui.status)&&!/Visit request/.test(report.ui.status),report.ui.status);
 else check('Spanish conversation and owner language retained',/Spanish/.test(report.ui.summary)&&/limpieza|solicitud|gracias|teléfono|confirmar/i.test(report.ui.messages),report.ui);
 await page.locator('#example-voice-stop').click();await page.waitForTimeout(500);
 check('Explicit End restores typed chat',!await page.locator('#example-input').isDisabled()&&await page.locator('#example-voice-start').isVisible());
 await page.screenshot({path:output.replace(/\.json$/,'.png')});
 report.result='passed_pending_PO_semantic_review';
}catch(error){report.result='failed';report.error=String(error.message||error);process.exitCode=1;
 for(const page of browser.contexts().flatMap(context=>context.pages())){try{report.failureUI=await page.locator('#demo-wrap').evaluate(wrap=>({messages:wrap.querySelector('#example-messages').innerText,summary:wrap.querySelector('#example-summary').innerText,status:wrap.querySelector('#example-ticket-status').innerText,voiceStatus:wrap.querySelector('#example-voice-status').innerText,error:wrap.querySelector('#example-error').textContent}));report.creation=await page.evaluate(()=>window.__voiceCalls);await page.screenshot({path:output.replace(/\.json$/,'.png')});}catch{}}
}
finally{report.ledgerAfter=readLedger();report.sourceAfter=source();report.finishedAt=new Date().toISOString();save();await browser.close();}
console.log(JSON.stringify({result:report.result,error:report.error,vapiCreates:report.ledgerAfter.vapiCreates,output}));
