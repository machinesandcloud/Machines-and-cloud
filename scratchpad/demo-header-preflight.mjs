// Static local Chrome preflight + replay of already accepted raw responses.
// Every request is served from disk or blocked; no API/provider/model call.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
assert.ok(option('--playwright'),'existing Playwright path required');
const {chromium}=await import(pathToFileURL(resolve(option('--playwright'))));
const prefix=option('--output-prefix','scratchpad/demo-header-preflight'),origin='http://127.0.0.1:8893';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['_headers','index.html','stories.js','site-refresh.css','practice-voice.js','assets/vendor/vapi-web.js'];
const source=()=>Object.fromEntries(files.map(file=>[file,sha(readFileSync(file))]));
const report={startedAt:new Date().toISOString(),source:source(),checks:[],issues:[],requests:[],blocked:[],browserErrors:[],screenshots:[],scope:'Local files with actual parsed _headers. Synthetic Chrome microphone only, immediately stopped. Two accepted Spanish replies replayed from raw artifact, not new inference. Zero API/provider/model/voice creation.'};
const check=(name,pass,detail)=>{const row={name,pass:!!pass,...(detail===undefined?{}:{detail})};report.checks.push(row);if(!pass)report.issues.push(row);};
const rules=[];let rule;
for(const line of readFileSync('_headers','utf8').split('\n')){
 if(!line.trim()||line.trim().startsWith('#'))continue;
 if(!/^\s/.test(line)){rule={path:line.trim(),headers:[]};rules.push(rule);}
 else {const colon=line.indexOf(':');assert.ok(rule&&colon>0);rule.headers.push([line.slice(0,colon).trim(),line.slice(colon+1).trim()]);}
}
function effective(path){const pairs=rules.filter(rule=>rule.path==='/*'||rule.path===path).flatMap(rule=>rule.headers);return{pairs,headers:Object.fromEntries(pairs)};}
for(const path of['/','/index.html','/about.html']){
 const policy=effective(path).pairs.filter(([name])=>name.toLowerCase()==='permissions-policy');
 check(path+' has one unambiguous effective Permissions-Policy',policy.length===1&&policy[0][1]==='camera=(), microphone=(self), geolocation=()',policy);
}
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-device-for-media-stream']});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.woff2':'font/woff2','.ico':'image/x-icon'};
async function context(width,height,microphone=false){
 const c=await browser.newContext({viewport:{width,height},serviceWorkers:'block',permissions:microphone?['microphone']:[]});
 await c.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin||request.method()!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/')){report.blocked.push({method:request.method(),url:url.origin+url.pathname});return route.abort();}
  let relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
  if(relative.split('/').some(part=>part.startsWith('.')||part==='..'))return route.abort();
  if(!existsSync(relative)&&existsSync(relative+'.html'))relative+='.html';
  report.requests.push({method:'GET',path:url.pathname,servedFromDisk:true});
  if(!existsSync(relative))return route.fulfill({status:404,body:'not found'});
  return route.fulfill({status:200,headers:{...effective(url.pathname).headers,'Content-Type':mime[extname(relative)]||'application/octet-stream'},body:readFileSync(relative)});
 });
 await c.addInitScript(()=>{window.__policyViolations=[];document.addEventListener('securitypolicyviolation',event=>window.__policyViolations.push({directive:event.violatedDirective,blocked:event.blockedURI}));window.__micCalls=0;if(navigator.mediaDevices?.getUserMedia){const native=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{window.__micCalls++;return native(...args);};}});
 return c;
}
try{
 const c=await context(1440,1000,true),page=await c.newPage();page.on('pageerror',error=>report.browserErrors.push(error.message));
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await page.locator('.site-demo-ready').waitFor();
 const policy=await page.evaluate(()=>{const p=document.permissionsPolicy||document.featurePolicy;return{secure:isSecureContext,microphone:p.allowsFeature('microphone'),camera:p.allowsFeature('camera'),geolocation:p.allowsFeature('geolocation'),micCalls:window.__micCalls,bridge:!!window.MCDemoVoice};});
 check('Chrome permits self microphone while blocking camera/geolocation',policy.secure&&policy.microphone&&!policy.camera&&!policy.geolocation,policy);
 check('first load performs no microphone or lazy bridge/SDK work',policy.micCalls===0&&!policy.bridge&&!report.requests.some(row=>['/practice-voice.js','/assets/vendor/vapi-web.js'].includes(row.path)));
 await page.addScriptTag({url:origin+'/practice-voice.js'});
 check('actual lazy bridge loads under parsed homepage CSP',await page.evaluate(()=>typeof window.MCDemoVoice?.start==='function'&&window.__micCalls===0));
 const sdk=await page.evaluate(async()=>{const module=await import('/assets/vendor/vapi-web.js');return{defaultType:typeof module.default,micCalls:window.__micCalls};});
 check('actual local vendor module imports under CSP without device work',sdk.defaultType==='function'&&sdk.micCalls===0,sdk);
 const microphone=await page.evaluate(async()=>{const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});const tracks=stream.getTracks();const result={count:tracks.length,audioOnly:tracks.every(track=>track.kind==='audio'),synthetic:tracks.every(track=>/fake/i.test(track.label))};tracks.forEach(track=>track.stop());result.allEnded=tracks.every(track=>track.readyState==='ended');return result;});
 check('synthetic Chrome microphone is allowed and immediately stopped',microphone.count>0&&microphone.audioOnly&&microphone.synthetic&&microphone.allEnded,microphone);
 check('no homepage CSP/eval violations',await page.evaluate(()=>window.__policyViolations.length===0),await page.evaluate(()=>window.__policyViolations));
 await c.close();

 const rawPath='scratchpad/demo-outcome-spanish-owner-English-first.json',raw=readFileSync(rawPath),accepted=JSON.parse(raw);
 const rows=accepted.cases.map(row=>({input:row.input,request:row.request,raw:row.rawNDJSON,done:row.stream.find(event=>event.t==='done')}));
 assert.equal(rows.length,2);assert.ok(rows.every(row=>row.done?.reply&&row.done.events.length));
 report.replay={source:rawPath,sha256:sha(raw),kind:'Already accepted actual-AI raw response replayed inside browser fetch fixture; no new API/model request',rows:rows.map(row=>({input:row.input,reply:row.done.reply,events:row.done.events})),requests:[]};
 const r=await context(390,844),p=await r.newPage();p.on('pageerror',error=>report.browserErrors.push(error.message));
 await r.addInitScript(({origin,rows})=>{const native=window.fetch.bind(window);window.__rawReplay={requests:[],index:0};window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==origin||url.pathname!=='/api/chat')return native(input,init);const body=JSON.parse(init.body),row=rows[window.__rawReplay.index++];if(!row)throw new Error('Unplanned replay');window.__rawReplay.requests.push(body);return new Response(row.raw,{headers:{'Content-Type':'application/x-ndjson'}});};},{origin,rows});
 await p.goto(origin+'/',{waitUntil:'domcontentloaded'});await p.locator('.site-demo-ready').waitFor();await p.locator('[data-example="spanish"]').click();
 for(const row of rows){await p.locator('#example-input').fill(row.input);await p.locator('#example-send').click();await p.waitForFunction(()=>document.querySelector('#example-messages').getAttribute('aria-busy')==='false');check('replay delivers exact saved Spanish reply',await p.locator('#example-messages .site-message p').last().innerText()===row.done.reply);}
 report.replay.requests=await p.evaluate(()=>window.__rawReplay.requests);
 check('replay preserves actual two-turn selected-persona history',JSON.stringify(report.replay.requests)===JSON.stringify(rows.map(row=>row.request)));
 check('Spanish voice card is actually hidden',await p.locator('#example-voice-card').evaluate(el=>el.hidden&&getComputedStyle(el).display==='none'));
 await p.locator('.site-conversation').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));
 const conversationShot=prefix+'-390-spanish-raw-replay.png';await p.screenshot({path:conversationShot,animations:'disabled'});report.screenshots.push(conversationShot);
 await p.locator('#example-summary-link').click();
 const owner=await p.locator('#example-owner-dialog-summary').innerText();report.replay.ownerDialog=owner;
 check('English owner preview retains corrected size, proper details and English timing',owner.includes('3 bedrooms')&&owner.includes('2 bathrooms')&&owner.includes('1,000 square feet')&&owner.includes('36 Elm St, Memorial')&&owner.includes('Ana')&&owner.includes('713-555-0152')&&owner.includes('Saturday, 8 to 10')&&owner.includes('Spanish'));
 check('owner preview is readable within actual390 viewport',await p.locator('#example-owner-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return el.open&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
 const ownerShot=prefix+'-390-English-owner-raw-replay.png';await p.screenshot({path:ownerShot,animations:'disabled'});report.screenshots.push(ownerShot);await p.keyboard.press('Escape');
 await p.setViewportSize({width:320,height:844});await p.locator('[data-example="call"]').click();await p.locator('#example-voice-card').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));
 check('320px English plumbing voice card is visible and honest',await p.locator('#example-voice-card').isVisible()&&await p.locator('#example-voice-card strong').innerText()==='English plumbing practice call');
 check('320px Start is visible and unobstructed without being invoked',await p.locator('#example-voice-start').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.top>=0&&r.bottom<=innerHeight&&(hit===el||el.contains(hit));}));
 check('replay/static call capture never requests microphone',await p.evaluate(()=>window.__micCalls===0));
 const callShot=prefix+'-320-English-plumbing-static.png';await p.screenshot({path:callShot,animations:'disabled'});report.screenshots.push(callShot);
 check('replay context has no CSP violations',await p.evaluate(()=>window.__policyViolations.length===0),await p.evaluate(()=>window.__policyViolations));
 await r.close();
 check('zero API/provider/model requests left browser',report.blocked.every(row=>row.method==='GET'&&row.url==='https://fonts.googleapis.com/css2'),report.blocked);
 check('zero browser errors',report.browserErrors.length===0,report.browserErrors);
 check('static preflight sources stayed stable',JSON.stringify(source())===JSON.stringify(report.source));
 report.result=report.issues.length?'failed':'passed';
}catch(error){report.result='failed';report.error=String(error.stack||error);}
finally{await browser.close();report.finishedAt=new Date().toISOString();writeFileSync(prefix+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,checks:report.checks.length,issues:report.issues.length,error:report.error,evidence:prefix+'.json'}));if(report.result!=='passed')process.exitCode=1;}
