// Actual owner handlers and browser assets; memory storage, no server or external transport.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const output = option('--output'), playwrightPath = option('--playwright') || process.env.MC_PLAYWRIGHT_MODULE;
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error('Choose a new --output scratchpad/name.json');
const root = resolve('.'), origin = 'https://website-concurrency.fixture.invalid';
const files = ['scripts/website-concurrency-ui-check.mjs','netlify/functions/client.mjs','netlify/functions/lib/website-installation.mjs','netlify/functions/lib/setup.mjs','desk.html','desk.js','desk.css','onboard.html','onboard.js','onboard.css','product-ui.css','desk-connections.js','netlify/functions/lib/connection-journey.mjs','netlify/functions/lib/service-connections.mjs'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers, memory storage and intercepted browser assets; no physical/model/provider requests', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Website concurrency check forbids physical transport'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
let playwright;
if (playwrightPath) playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
else {
  try { playwright = await import('playwright'); }
  catch { for (const bin of (process.env.PATH || '').split(delimiter)) { const path = resolve(bin, '../playwright/index.mjs'); if (existsSync(path)) { playwright = await import(pathToFileURL(path).href); break; } } }
}
if (!playwright) throw new Error('Use installed Playwright via --playwright /path/to/playwright/index.mjs or MC_PLAYWRIGHT_MODULE. This check never installs tooling.');
const store = await import('../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const { newClient, parseHours } = await import('../netlify/functions/lib/config.mjs');
const handlers = { '/api/client': (await import('../netlify/functions/client.mjs')).default, '/api/access': (await import('../netlify/functions/access.mjs')).default, '/api/onboard': (await import('../netlify/functions/onboard.mjs')).default };
const date = days => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000));
let serial = 0;
const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const contexts = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test) { for(let n=0;n<200;n++){if(test())return;await delay(20);} throw new Error('Timed out waiting for an intercepted response'); }
async function fixture(width=390) {
  const slug='website-order-'+ ++serial,token=sha(slug),c=newClient({slug,ownerKey:'PRIVATE-FIXTURE-'+serial,owner:{name:'Alex Fixture',email:slug+'@example.test',phone:'+17135550198'},business:{name:'Current Website Shop',trade:'HVAC',website:'https://shop.example.test/',serviceArea:['Katy'],hours:'Mon-Fri 8am-5pm'}});
  Object.assign(c,{onboarding:{version:1,verifiedEmail:c.owner.email,desiredChannels:['web']},services:['AC repair'],windows:['8 to 12','12 to 5'],status:'testing',build:{status:'built',source:'owner_answers'}});c.rules.hours=parseHours('Mon-Fri 8am-5pm');c.widget.allowedOrigins=[];
  await store.put('clients',slug,c);await store.put('access_sessions',accessHash(token),{scope:'onboarding',status:'active',email:c.owner.email,expiresAt:new Date(Date.now()+3600000).toISOString()});
  const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(context);context.setDefaultTimeout(6000);
  await context.addInitScript(({origin,slug,token})=>{if(location.origin===origin){sessionStorage.setItem('mc-onboarding-session-v1',token);localStorage.setItem('mc-walkthrough-v1:'+slug,'seen');}},{origin,slug,token});
  const state={requests:[],gates:[],failSignout:false};
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin){if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.fulfill({status:200,contentType:'text/css',body:''});report.forbidden.push(url.origin);return route.abort('blockedbyclient');}
    if(url.pathname.startsWith('/api/')){
      const method=request.method(),body=method==='GET'?null:request.postDataJSON(),action=body?.action,item={slug,path:url.pathname,method,action,body};state.requests.push(item);report.requests.push(item);
      if(!handlers[url.pathname])return route.fulfill({status:404,body:'{}'});
      if(action==='sign_out'&&state.failSignout){state.failSignout=false;item.status=503;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture_signout_failure"}'});}
      const gate=state.gates.find(gate=>!gate.claimed&&gate.method===method&&(!gate.action||gate.action===action));if(gate)gate.claimed=true;
      const response=await handlers[url.pathname](new Request(url,{method,headers:request.headers(),...(body?{body:JSON.stringify(body)}:{})}),{ip:'192.0.2.71'});
      const bytes=Buffer.from(await response.arrayBuffer());item.status=response.status;try{item.result=JSON.parse(bytes.toString());}catch{}
      if(gate){gate.captured=item;await gate.wait;if(gate.failure){const status=typeof gate.failure==='number'?gate.failure:503;item.deliveredStatus=status;item.fixture='Explicit response fault after actual handler execution';return route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:'fixture_response_failure',message:'Intercepted response failed ('+status+').'})});}}
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:bytes});
    }
    const path=resolve(root,decodeURIComponent(url.pathname).replace(/^\//,''));if(!path.startsWith(root+'/')||!existsSync(path)||statSync(path).isDirectory())return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream',body:readFileSync(path)});
  });
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));await page.goto(origin+'/desk.html?c='+slug+'#setup');await page.waitForFunction(()=>document.body.dataset.workspaceState==='ready');
  return {page,context,c,token,state};
}
function hold(x,method,action=null,failure=false){let release;const gate={method,action,failure,wait:new Promise(resolve=>release=resolve),release:()=>release()};x.state.gates.push(gate);return gate;}
const refresh=page=>page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:desk-refresh')));
const know=page=>page.locator('[data-workspace-route="know"]').click();
async function check(name,run){const start=contexts.length;try{await run();report.checks.push({name,pass:true});}catch(error){report.checks.push({name,pass:false,error:error.stack});}finally{await Promise.all(contexts.slice(start).map(context=>context.close()));}}
async function shot(page,name){if(!output)return;const path=output.replace(/\.json$/,'-'+name+'.png');await page.screenshot({path,fullPage:false});report.screenshots=(report.screenshots||[]).concat(path);}
try {
  for(const width of [390,1440])await check(width+'px review waits for actual website PUT and canonical read, then uses saved revision',async()=>{
    const x=await fixture(width),put=hold(x,'PUT'),read=hold(x,'GET');
    await x.page.locator('#websiteSetupDetails>summary').click();assert.equal(await x.page.locator('#websiteInstallPrimary').getAttribute('data-action'),'allow_origin');await x.page.locator('#websiteInstallPrimary').click();await until(()=>put.captured);
    await know(x.page);assert.equal(await x.page.locator('#reviewRules').isDisabled(),true,'Review must be disabled while website PUT is outstanding');
    await x.page.locator('#reviewRules').scrollIntoViewIfNeeded();await shot(x.page,'pending-website-'+width);
    await x.page.locator('#reviewRules').dispatchEvent('click');await delay(50);assert.equal(x.state.requests.filter(row=>row.action==='review_rules').length,0,'Guard rejects programmatic review during website PUT');
    put.release();await until(()=>read.captured);assert.equal(await x.page.locator('#reviewRules').isDisabled(),true,'Review stays disabled during canonical website read');await x.page.locator('#reviewRules').dispatchEvent('click');await delay(50);assert.equal(x.state.requests.filter(row=>row.action==='review_rules').length,0);
    if(width===390){const newerRead=hold(x,'GET');await refresh(x.page);await until(()=>newerRead.captured);read.release();await delay(100);assert.equal(await x.page.locator('#reviewRules').isDisabled(),true,'Website remains busy until its superseding canonical read settles');newerRead.release();}else read.release();await x.page.locator('#websiteInstallMessage').filter({hasText:'Website allowed.'}).waitFor({state:'attached'});await until(()=>x.state.requests.filter(row=>row.method==='GET').length>=2);await x.page.waitForFunction(()=>!document.getElementById('reviewRules').disabled);
    const expected=read.captured.result.setup.revision;await x.page.locator('#reviewRules').click();await until(()=>x.state.requests.some(row=>row.action==='review_rules'&&row.status));const review=x.state.requests.find(row=>row.action==='review_rules');assert.equal(review.body.revision,expected);assert.equal(review.status,200);await x.page.locator('#reviewMessage').filter({hasText:'Review saved for the current version.'}).waitFor();await shot(x.page,'review-current-'+width);
  });
  await check('Older successful GET cannot replace newer canonical values or the revision used by review',async()=>{
    const x=await fixture(),old=hold(x,'GET');await refresh(x.page);await until(()=>old.captured);const latest=await store.get('clients',x.c.slug);latest.business.name='Newer canonical shop';await store.put('clients',x.c.slug,latest);await refresh(x.page);await x.page.locator('#title').filter({hasText:'Newer canonical shop'}).waitFor();old.release();await delay(100);assert.equal(await x.page.locator('#title').innerText(),'Newer canonical shop');await shot(x.page,'newer-canonical-after-old-read');await know(x.page);await x.page.locator('#reviewRules').click();await until(()=>x.state.requests.some(row=>row.action==='review_rules'&&row.status));const review=x.state.requests.find(row=>row.action==='review_rules');assert.equal(review.body.revision,configurationRevision(latest));assert.equal(review.status,200);
  });
  await check('An older failed GET cannot replace a later successful workspace with recovery',async()=>{
    const x=await fixture(),old=hold(x,'GET',null,true);await refresh(x.page);await until(()=>old.captured);await refresh(x.page);await until(()=>x.state.requests.filter(row=>row.method==='GET'&&row.status).length===3);await delay(50);old.release();await delay(100);assert.equal(await x.page.locator('body').getAttribute('data-workspace-state'),'ready');assert.equal(await x.page.locator('#portalContent').isVisible(),true);await shot(x.page,'ready-after-obsolete503');
  });
  await check('Review remains single-flight through rerenders and preserves a newer typed business draft',async()=>{
    const x=await fixture();await know(x.page);const review=hold(x,'POST','review_rules');await x.page.locator('#reviewRules').click();await until(()=>review.captured);await refresh(x.page);await delay(100);assert.equal(await x.page.locator('#reviewRules').isDisabled(),true,'Canonical rerender must keep pending review disabled');await x.page.locator('#reviewRules').dispatchEvent('click');await delay(50);assert.equal(x.state.requests.filter(row=>row.action==='review_rules').length,1);await x.page.locator('#cfg [name="business.name"]').fill('Newer unsaved name');review.release();await delay(150);assert.equal(await x.page.locator('#cfg [name="business.name"]').inputValue(),'Newer unsaved name');assert.equal(await x.page.locator('#reviewRules').isDisabled(),true);assert.equal((await store.get('clients',x.c.slug)).business.name,'Current Website Shop');await shot(x.page,'draft-after-review');
  });
  await check('A current failed read still offers recovery and preserves the typed draft through retry',async()=>{
    const x=await fixture();await know(x.page);await x.page.locator('#cfg [name="business.name"]').fill('Draft survives failed read');const failure=hold(x,'GET',null,true);await refresh(x.page);await until(()=>failure.captured);failure.release();await x.page.locator('body[data-workspace-state="recovery"]').waitFor();await shot(x.page,'current-error-recovery');await x.page.locator('#retryLoad').click();await x.page.locator('body[data-workspace-state="ready"]').waitFor();assert.equal(await x.page.locator('#cfg [name="business.name"]').inputValue(),'Draft survives failed read');assert.equal(await x.page.locator('#reviewRules').isDisabled(),true);await shot(x.page,'draft-after-retry');
  });
  for(const status of [409,503])await check('A '+status+' review response releases its control and allows a safe current-revision retry',async()=>{
    const x=await fixture();await know(x.page);const failure=hold(x,'POST','review_rules',status);await x.page.locator('#reviewRules').click();await until(()=>failure.captured);failure.release();await x.page.locator('#reviewMessage').filter({hasText:'Intercepted response failed'}).waitFor();assert.equal(await x.page.locator('#reviewRules').isEnabled(),true);await x.page.locator('#reviewRules').click();await x.page.locator('#reviewMessage').filter({hasText:'Review saved for the current version.'}).waitFor();assert.equal(x.state.requests.filter(row=>row.action==='review_rules').length,2);
  });
  await check('Failed signout during a held review reconciles current proof and leaves review controls usable',async()=>{
    const x=await fixture();await know(x.page);const pending=hold(x,'POST','review_rules');await x.page.locator('#reviewRules').click();await until(()=>pending.captured);x.state.failSignout=true;await x.page.locator('#deskSignOut').click();await x.page.locator('#reviewMessage').filter({hasText:'Review saved for the current version.'}).waitFor();assert.equal(await x.page.locator('#reviewRules').isEnabled(),true);pending.release();await delay(100);assert.equal(await x.page.locator('#reviewRules').isEnabled(),true);await x.page.locator('#reviewRules').click();await until(()=>x.state.requests.filter(row=>row.action==='review_rules').length===2);assert.equal(await x.page.locator('body').getAttribute('data-workspace-state'),'ready');
  });
  await check('An obsolete401 read cannot revoke a workspace established by a newer200 read',async()=>{
    const x=await fixture(),old=hold(x,'GET',null,401);await refresh(x.page);await until(()=>old.captured);await refresh(x.page);await until(()=>x.state.requests.filter(row=>row.method==='GET'&&row.status).length===3);await delay(50);old.release();await delay(100);assert.equal(await x.page.locator('body').getAttribute('data-workspace-state'),'ready');assert.equal(await x.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1')),x.token);
  });
  await check('The current401 read still expires the session and clears private workspace content',async()=>{
    const x=await fixture(),latest=hold(x,'GET',null,401);await refresh(x.page);await until(()=>latest.captured);latest.release();await x.page.locator('body[data-workspace-state="recovery"]').waitFor();assert.equal(await x.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1')),null);assert.equal(await x.page.locator('#portalContent').innerHTML(),'');assert.match(await x.page.locator('#recoveryMessage').innerText(),/session expired/i);
  });
  await check('A read401 predating a successful business PUT cannot expire its newer canonical workspace',async()=>{
    const x=await fixture(),old=hold(x,'GET',null,401);await refresh(x.page);await until(()=>old.captured);await know(x.page);await x.page.locator('#cfg [name="business.name"]').fill('Saved while old read waits');await x.page.locator('#saveCfg').click();await until(()=>x.state.requests.some(row=>row.method==='PUT'&&row.status===200));await x.page.waitForFunction(()=>document.getElementById('cfg').getAttribute('aria-busy')==='false');old.release();await delay(100);assert.equal(await x.page.locator('body').getAttribute('data-workspace-state'),'ready');assert.equal(await x.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1')),x.token);assert.equal(await x.page.locator('#cfg [name="business.name"]').inputValue(),'Saved while old read waits');
  });
  await check('An old read401 cannot expire a newer business save before its PUT response arrives',async()=>{
    const x=await fixture(),old=hold(x,'GET',null,401);await refresh(x.page);await until(()=>old.captured);await know(x.page);const put=hold(x,'PUT');await x.page.locator('#cfg [name="business.name"]').fill('Submitted name survives old401');await x.page.locator('#saveCfg').click();await until(()=>put.captured);assert.equal(put.captured.status,200);assert.equal(x.state.requests.filter(row=>row.path==='/api/client'&&row.method==='GET').length,2,'No newer GET may mask the config fence');old.release();await delay(100);assert.equal(await x.page.locator('body').getAttribute('data-workspace-state'),'ready');assert.equal(await x.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1')),x.token);await x.page.locator('#cfg [name="business.name"]').fill('Newer typing while PUT waits');put.release();await x.page.waitForFunction(()=>document.getElementById('cfg').getAttribute('aria-busy')==='false');assert.equal(await x.page.locator('#cfg [name="business.name"]').inputValue(),'Newer typing while PUT waits');assert.equal((await store.get('clients',x.c.slug)).business.name,'Submitted name survives old401');await shot(x.page,'draft-after-old401-during-save');
  });
} finally {
  await browser.close();report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,total:report.checks.length,physicalNetwork:report.physicalNetwork,pageErrors:report.pageErrors.length,forbidden:report.forbidden.length};if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary,sourceStable:report.sourceStable,failures:report.checks.filter(c=>!c.pass)}));if(report.summary.failed)process.exitCode=1;
}
