// Independent affected activity QA; reuses the existing actual-handler browser transport fixture.
// Synthetic memory only. No external/provider/model/account effects.
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
const root = resolve('.'), origin = 'https://followthrough.fixture.invalid';
const phase=option('--phase')||'baseline';
const files = ['desk-activity.js','netlify/functions/lib/workspace-activity.mjs','scripts/workspace-activity-check.mjs','index.html','script.js','site-refresh.css','signup-intake.js','desk-requests.js','netlify/functions/lib/request-followthrough.mjs','scripts/build-site.mjs','scripts/request-followthrough-ui-check.mjs','scratchpad/full-offer-activity-independent.mjs','desk.html','desk.js','desk.css','onboard.html','onboard.js','onboard.css','product-ui.css','desk-connections.js','netlify/functions/lib/connection-journey.mjs','netlify/functions/lib/service-connections.mjs','desk-connections.css','styles.css','netlify/functions/client.mjs','netlify/functions/workspace-billing.mjs','netlify/functions/lib/workspace-billing.mjs','netlify/functions/lib/store.mjs','netlify/functions/lib/access.mjs','netlify/functions/lib/desk.mjs','netlify/functions/lib/setup.mjs','netlify/functions/lib/config.mjs','netlify/functions/lib/workspace-identity.mjs','netlify/functions/lib/platform-operations.mjs'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
const report = { at: new Date().toISOString(), baseCommit:'577961c6a406be22a7fb479db055145881776729', qualifications:'Synthetic tenant/status/proof fixtures; actual local handler and browser assets; memory storage replaces hosted storage. Internal worker dispatch is intercepted202. No model/provider/email/OAuth/purchase/deployment performed.', mode: 'Actual owner handlers, memory storage and intercepted browser assets; no physical/model/provider requests', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Connection journey check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports(); globalThis.fetch = async (input, init={}) => {const url=new URL(String(input));if(url.origin===origin&&url.pathname.startsWith('/.netlify/functions/')){report.backgroundRequests=(report.backgroundRequests||[]).concat({path:url.pathname,method:init.method||'GET'});return new Response(null,{status:202});}return deny();};
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
const handlers = { '/api/client': (await import('../netlify/functions/client.mjs')).default, '/api/access': (await import('../netlify/functions/access.mjs')).default, '/api/onboard': (await import('../netlify/functions/onboard.mjs')).default, '/api/workspace-billing':(await import('../netlify/functions/workspace-billing.mjs')).default };
const date = days => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000));
let serial = 0;
const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const contexts = [];
async function fixture(width = 390, channels = ['web'], options = {}) {
  const slug = 'account-ui-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Availability Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: channels }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm'); if(options.status)c.status=options.status;if(options.allowedOrigins)c.widget.allowedOrigins=options.allowedOrigins;if(options.website)c.business.website=options.website;if(options.businessNumber)c.phone.businessNumber=options.businessNumber;if(options.reviewed){const revision=configurationRevision(c);c.setupProof={reviewedRevision:revision,testedRevision:revision,testMode:'live'};}if(options.configure)await options.configure(c);
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(6000);
  await context.addInitScript(({ origin, slug, token }) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen');
    const original = window.fetch; window.qaGates = []; window.holdAvailability = null;
    window.fetch = async function (input, options) {
      let body; try { body = JSON.parse(options?.body); } catch {}
      const hold = (window.qaHoldAction&&(body?.action===window.qaHoldAction || options?.method===window.qaHoldAction) || window.qaHoldExport&&String(input).includes('export='+window.qaHoldExport)) && window.qaHold;
      // Deliberately ignore cancellation for held fixtures, proving the generation fence too.
      const response = await original(input, hold ? { ...options, signal: undefined } : options);
      if (!hold) return response;
      if (hold === 'body') { const json = response.json.bind(response); response.json = async function () { const value = await json(); await new Promise(release => window.qaGates.push(release)); return value; }; return response; }
      await new Promise(release => window.qaGates.push(release)); if (hold === 'error') throw new TypeError('Explicit lost transport response'); return response;
    };
  }, { origin, slug, token });
  const state = { fault: null, failSignout: false, requests: [], exports:[], exportFault:null, actionFault:null };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === 'https://accounts.google.com') {report.oauthNavigation=(report.oauthNavigation||[]).concat(url.href);return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Intercepted Google permission boundary</title><p>Local QA stopped before real Google consent.</p>'});} if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, query:url.search, method, action, body, authPresent:!!request.headers().authorization }; state.requests.push(item); report.requests.push(item);
      if(method==='GET'&&url.pathname==='/api/client'&&!url.searchParams.has('export')&&state.getFault){const f=state.getFault;state.getFault=null;item.status=f;item.fixture='read-'+f;return route.fulfill({status:f,contentType:'application/json',body:'{"error":"account_unavailable","message":"Synthetic saved status read unavailable."}'});}
      if(url.searchParams.has('export')){state.exports.push(item);if(state.exportFault){const f=state.exportFault;state.exportFault=null;item.fixture=f;if(f==='network'){item.status='aborted';return route.abort('failed');}const status=typeof f==='number'?f:200;item.status=status;return route.fulfill({status,contentType:f==='html'?'text/html':f==='json'?'application/json':'application/json',body:f==='html'?'<html><title>Sign in</title><h1>Sign in required</h1></html>':f==='json'?'{}':JSON.stringify({error:'export_unavailable',message:'Synthetic download unavailable. Try again.'})});}}
      if(action&&state.actionFault){const f=state.actionFault;state.actionFault=null;item.fixture=f;if(f==='network'){item.status='aborted';return route.abort('failed');}item.status=f;return route.fulfill({status:f,contentType:'application/json',body:JSON.stringify({error:'account_unavailable',message:'Synthetic service change unavailable. Your choice has not been confirmed.'})});}
      if ((action === 'save_connection_preferences' || method==='PUT') && state.fault) {
        const fault = state.fault; state.fault = null; item.fixture = fault;
        if (fault === 'network') { item.status = 'aborted'; return route.abort('failed'); }
        if (fault === 'malformed') { item.status = 200; return route.fulfill({ status: 200, contentType: 'text/plain', body: 'not JSON' }); }
        if (fault === 'auth-empty') { item.status = 401; return route.fulfill({ status: 401, contentType: 'text/plain', body: '' }); }
        item.status = fault; return route.fulfill({ status: fault, contentType: 'application/json', body: JSON.stringify({ error: fault === 409 ? 'configuration_changed' : 'availability_unavailable', message: fault === 409 ? 'The saved schedule changed. Reload availability before trying again.' : 'The schedule could not be confirmed.' }) });
      }
      if (action === 'sign_out' && state.failSignout) { state.failSignout = false; item.status = 503; item.fixture = 'signout503'; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"explicit_signout_failure"}' }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' }); item.status = response.status;
      const responseBuffer=Buffer.from(await response.arrayBuffer()),responseBody=responseBuffer.toString('utf8');item.responseByteSha=sha(responseBuffer); item.responseHeaders=Object.fromEntries(response.headers); if(url.searchParams.has('export'))item.responseBody=responseBody; if(method==='GET'&&url.pathname==='/api/client') {try{state.dto=JSON.parse(responseBody);}catch{}} if(state.loseAfter&&(action===state.loseAfter||method===state.loseAfter)){state.loseAfter=null;item.lostAfterEffect=true;if(state.failReadAfterLose){state.getFault=state.failReadAfterLose;state.failReadAfterLose=null;}return route.abort('failed');} if(state.badAfter&&action==='request_followthrough'){state.badAfter=false;return route.fulfill({status:200,contentType:'application/json',body:'{}'});} return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: responseBuffer });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => {report.pageErrors.push(error.message);(report.pageErrorDetails ||= []).push({slug,stack:error.stack});});
  await page.goto(origin + '/desk.html?c=' + slug + (Object.hasOwn(c,'onboarding')?'':'&k='+encodeURIComponent(c.ownerKey)) + '#account'); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, c, token, state, context };
}
async function check(name,run){if(option('--only')&&!name.includes(option('--only')))return;const start=contexts.length;try{await run();report.checks.push({name,pass:true});}catch(error){report.checks.push({name,pass:false,error:error.stack});const page=contexts.at(-1)?.pages().at(-1);if(page){report.checks.at(-1).pageState=await page.evaluate(()=>({route:document.body.dataset.activePage,text:document.body.innerText.slice(0,12000)})).catch(()=>null);await shot(page,'failure-'+report.checks.length).catch(()=>{});}console.log('FAIL '+name+': '+error.message);}finally{await Promise.all(contexts.slice(start).map(context=>context.close()));}}
async function shot(page,name,fullPage=false){if(!output)return;const path=output.replace(/\.json$/,'-'+name+'.png');await page.screenshot({path,fullPage});report.screenshots=(report.screenshots||[]).concat(path);}

async function geometry(page,selector='#p-account'){const v=await page.locator(selector).evaluate(el=>({viewport:innerWidth,document:document.documentElement.scrollWidth,width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(v.document<=v.viewport+1&&v.scroll<=v.width+1,JSON.stringify(v));return v;}
async function account(x){await x.page.locator('#tabAccount').click();await x.page.locator('body[data-active-page="account"]').waitFor();}
async function refresh(x){await x.page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:desk-refresh')));await x.page.waitForTimeout(120);}
async function stored(x){return store.get('clients',x.c.slug);}
async function invoke(x,body,options={}){return handlers['/api/client'](new Request(origin+'/api/client?c='+x.c.slug+(options.export?'&export='+options.export:''),{method:body?'POST':'GET',headers:{origin,...(options.anonymous?{}:{authorization:'Bearer '+(options.token||x.token)}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{ip:'192.0.2.71'});}
const {workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs');
async function api(x,query='',options={}) {
 const r=await handlers['/api/client'](new Request(origin+'/api/client?c='+x.c.slug+query,{headers:{Origin:options.origin||origin,...(options.auth===false?{}:{Authorization:'Bearer '+(options.token||x.token)})}}));
 return {status:r.status,headers:Object.fromEntries(r.headers),body:await r.json()};
}
async function addLead(x,name,extra={}) {return store.addRecord('leads',x.c.slug,{tenantIdentity:workspaceTenant(x.c),customer_name:name,phone:'+17135550142',issue:'AC repair enquiry',status:'open',channel:'web',outcome:'wants_call',...extra});}
let operations=0;
async function change(x,lead,type,extra={}) {
 const detail=await api(x,'&requestId='+lead.id);assert.equal(detail.status,200);
 const response=await invoke(x,{action:'request_followthrough',requestId:lead.id,sourceRevision:detail.body.request.sourceRevision,expectedRevision:detail.body.request.revision,operationId:sha('independent-op-'+(++operations)).slice(0,32),type,note:'',...extra});
 const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
}
async function seed(x,{many=false}={}) {
 x.old=await addLead(x,'Older due customer',{createdAt:'2020-01-01T12:00:00.000Z'});
 await change(x,x.old,'plan',{nextAction:'Call this older customer about the repair',dueAt:'2026-01-01T12:00:00.000Z'});
 for(let i=0;i<100;i++){const row=await addLead(x,'Handled enquiry '+i);await change(x,row,'complete',{resolution:'no_followup_needed',note:'Customer issue handled; no further action needed.'});}
 if(many){await addLead(x,'Urgent new customer',{urgency:'emergency'});for(let i=0;i<11;i++)await addLead(x,'New pending '+i);}
 await x.page.reload();await x.page.waitForFunction(()=>document.body.dataset.workspaceState==='ready');
 await x.page.locator('.tabs [data-t="today"]').click();await x.page.locator('#activityAllFollowups').waitFor();
}
async function loaded(x){await x.page.waitForFunction(()=>!document.getElementById('activityReportResults').hidden&&!document.getElementById('activityReportLoad').disabled);}
async function hold(x){await x.page.evaluate(()=>{
 if(!window.qaActivityWrapped){const original=window.fetch;window.fetch=async function(input,options){const selected=String(input).includes('&report=activity')&&window.qaActivityHold;const response=await original(input,selected?{...options,signal:undefined}:options);if(selected){window.qaActivityHold=false;await new Promise(release=>window.qaActivityRelease=release);}return response;};window.qaActivityWrapped=true;}
 window.qaActivityHold=true;window.qaActivityRelease=null;
 });}
async function entered(x){await x.page.waitForFunction(()=>typeof window.qaActivityRelease==='function');}
async function release(x){await x.page.evaluate(()=>{window.qaActivityRelease();window.qaActivityRelease=null;});await x.page.waitForTimeout(100);}
async function assertNoWrites(x,start=0){assert.deepEqual(x.state.requests.slice(start).filter(r=>r.method!=='GET'&&r.action!=='sign_out'),[]);}
report.priorAttempt={path:'scratchpad/full-offer-activity-independent-first.json',disposition:'11 QA driver failures: used nonexistent home route rather than today, and omitted mandatory milliseconds in two synthetic dueAt values. Runtime unchanged.'};
try {
for(const width of [390,1440])await check(width+'px older due action survives100 newer completed requests through ordinary Home button and request dialog',async()=>{
 const x=await fixture(width);await seed(x);
 assert.equal((await api(x)).body.leads.some(row=>row.id===x.old.id),false);
 assert.match(await x.page.locator('#today').innerText(),/0\s+Needs follow-up/);
 const before=x.state.requests.length;await x.page.locator('#activityAllFollowups').click();await loaded(x);
 assert.match(await x.page.locator('#today').innerText(),/1\s+Needs follow-up/);
 const button=x.page.locator('#needsYou [data-request-open="'+x.old.id+'"]');await button.click();await x.page.locator('#requestContent').waitFor({state:'visible'});
 assert.equal(await x.page.locator('#requestTitle').innerText(),'Older due customer');assert.match(await x.page.locator('#requestProgress').innerText(),/Call this older customer about the repair/);
 await shot(x.page,'old-request-'+width);await geometry(x.page,'#requestDialog');
 await x.page.locator('#requestClose').click();await shot(x.page,'complete-history-'+width,true);await geometry(x.page,'#p-today');await assertNoWrites(x,before);
 report.checks.at(-1);
});
await check('More than10 pending requests paginate without losing older work; urgency sorts first',async()=>{
 const x=await fixture(390);await seed(x,{many:true});await x.page.locator('#activityAllFollowups').click();await loaded(x);
 assert.match(await x.page.locator('#needsYou').innerText(),/13 need follow-up/);assert.equal(await x.page.locator('#needsYou .activity-followup').count(),10);assert.equal(await x.page.locator('#needsYou .activity-followup strong').first().innerText(),'Urgent new customer');
 assert.equal(await x.page.locator('#needsYou [data-request-open="'+x.old.id+'"]').count(),1);
 const next=x.page.getByRole('button',{name:'Next',exact:true});await next.focus();await x.page.keyboard.press('Enter');assert.equal(await x.page.locator('#needsYou .activity-followup').count(),3);assert.match(await x.page.locator('#needsYou').innerText(),/11–13 of 13/);
 report.paginationFocus=await x.page.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return{tag:e.tagName,text:e.textContent.slice(0,100),withinAttention:!!e.closest('#needsYou'),enabled:!e.disabled,visible:r.width>0&&r.height>0};});
 assert.equal(report.paginationFocus.withinAttention&&report.paginationFocus.enabled&&report.paginationFocus.visible,true,JSON.stringify(report.paginationFocus));
 await shot(x.page,'pagination-390');await x.page.getByRole('button',{name:'Previous',exact:true}).click();assert.equal(await x.page.locator('#needsYou .activity-followup').count(),10);
});
await check('7/30/90periods affect activity counts while older due actions remain visible',async()=>{
 const x=await fixture(1440);const old=await addLead(x,'Old beyond reporting period',{createdAt:'2020-01-01T12:00:00Z'});await change(x,old,'plan',{nextAction:'Old pending callback',dueAt:'2026-01-01T12:00:00.000Z'});
 await addLead(x,'Recent inquiry');await addLead(x,'20day inquiry',{createdAt:new Date(Date.now()-20*86400000).toISOString()});await addLead(x,'60day inquiry',{createdAt:new Date(Date.now()-60*86400000).toISOString()});
 await x.page.locator('.tabs [data-t="today"]').click();
 for(const [days,count]of [[7,1],[30,2],[90,3]]){await x.page.locator('#activityReportDays').selectOption(String(days));await x.page.locator('#activityReportLoad').click();await loaded(x);assert.equal(await x.page.locator('#activityReportMetrics div').first().locator('dd').innerText(),String(count));assert.equal(await x.page.locator('#needsYou [data-request-open="'+old.id+'"]').count(),1);}
 await shot(x.page,'report90-1440');
});
await check('Failed and incomplete report reads never claim completeness; ordinary retry recovers',async()=>{
 const x=await fixture(390);await seed(x);x.state.getFault=503;await x.page.locator('#activityAllFollowups').click();await x.page.locator('#activityReportStatus').filter({hasText:/unavailable/}).waitFor();assert.equal(await x.page.locator('#activityReportResults').isVisible(),false);assert.equal(await x.page.locator('#activityReportLoad').isEnabled(),true);
 const indexKey=x.c.slug+'/'+workspaceTenant(x.c)+'/leads',index=await store.get('workspace_record_index',indexKey);await store.put('workspace_record_index',indexKey,{...index,retentionIncomplete:true});
 await x.page.locator('#activityReportLoad').click();await x.page.locator('#activityReportStatus').filter({hasText:/full history/}).waitFor();assert.equal(await x.page.locator('#activityReportResults').isVisible(),false);await shot(x.page,'incomplete-390');
 await store.put('workspace_record_index',indexKey,index);await x.page.locator('#activityReportLoad').click();await loaded(x);assert.equal(await x.page.locator('#needsYou [data-request-open="'+x.old.id+'"]').count(),1);
});
await check('Period change fences a late successful response; new period requires a fresh read',async()=>{
 const x=await fixture(390);await x.page.locator('.tabs [data-t="today"]').click();await hold(x);await x.page.locator('#activityReportLoad').click();await entered(x);await x.page.locator('#activityReportDays').selectOption('30');await release(x);assert.equal(await x.page.locator('#activityReportResults').isVisible(),false);assert.equal(await x.page.locator('#activityReportDays').inputValue(),'30');await x.page.locator('#activityReportLoad').click();await loaded(x);assert.match(x.state.requests.filter(r=>r.query.includes('report=activity')).at(-1).query,/days=30/);
});
await check('Obsolete401 after a period change cannot expire valid current access',async()=>{
 const x=await fixture(390);await x.page.locator('.tabs [data-t="today"]').click();const session=await store.get('access_sessions',accessHash(x.token));await store.put('access_sessions',accessHash(x.token),{...session,status:'revoked'});await hold(x);await x.page.locator('#activityReportLoad').click();await entered(x);await store.put('access_sessions',accessHash(x.token),session);await x.page.locator('#activityReportDays').selectOption('30');await release(x);assert.equal(await x.page.locator('body').getAttribute('data-workspace-state'),'ready');await x.page.locator('#activityReportLoad').click();await loaded(x);
});
await check('Actual expired owner session clears private activity and offers sign-in recovery',async()=>{
 const x=await fixture(390);await x.page.locator('.tabs [data-t="today"]').click();const session=await store.get('access_sessions',accessHash(x.token));await store.put('access_sessions',accessHash(x.token),{...session,expiresAt:'2020-01-01T00:00:00Z'});await x.page.locator('#activityReportLoad').click();await x.page.locator('#portalRecovery').waitFor({state:'visible'});assert.equal(await x.page.locator('#activityReport').isVisible(),false);assert.equal(await x.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1')),null);await shot(x.page,'session-expired-390');
});
await check('Held report after ordinary sign-out cannot reveal private report or resurrect session',async()=>{
 const x=await fixture(1440);await x.page.locator('.tabs [data-t="today"]').click();await hold(x);await x.page.locator('#activityReportLoad').click();await entered(x);await x.page.locator('#deskSignOut').click();await x.page.locator('#portalRecovery').waitFor({state:'visible'});await release(x);assert.equal(await x.page.locator('#activityReport').isVisible(),false);assert.equal(await x.page.locator('#activityReportResults').isVisible(),false);assert.equal(await x.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1')),null);
});
await check('Report authorization isolates public, foreign owner, foreignorigin and reused-slug records without delivery',async()=>{
 const x=await fixture(390);const old=await addLead(x,'Private tenant request');await change(x,old,'plan',{nextAction:'Private callback',dueAt:'2026-01-01T12:00:00.000Z'});
 assert.equal((await api(x,'&report=activity&days=7',{auth:false})).status,401);
 const alien=sha('alien-owner');await store.put('access_sessions',accessHash(alien),{scope:'onboarding',status:'active',email:'other@example.test',expiresAt:new Date(Date.now()+3600000).toISOString()});assert.equal((await api(x,'&report=activity&days=7',{token:alien})).status,403);
 assert.equal((await api(x,'&report=activity&days=7',{origin:'https://foreign.example.test'})).status,403);
 const replacement={...x.c,ownerKey:'replacement-incarnation'};await store.saveClient(replacement);const fresh=await api(x,'&report=activity&days=7');assert.equal(fresh.status,200);assert.equal(fresh.body.report.attention.total,0);await store.saveClient(x.c);
 assert.equal((await store.list('managed_delivery_jobs',x.c.slug+'/')).length,0);
});
for(const width of [320,390,1440])await check(width+'px report and due controls fit and retain actual visible keyboard focus',async()=>{
 const x=await fixture(width);await addLead(x,'Mobile request');await x.page.locator('.tabs [data-t="today"]').click();await x.page.locator('#activityAllFollowups').click();await loaded(x);await geometry(x.page,'#p-today');
 const focus=[];
 await x.page.locator('#activityReportDays').focus();
 for(const id of ['activityReportDays','activityReportLoad']){
  if(id==='activityReportLoad')await x.page.keyboard.press('Tab');
  await x.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const rect=await x.page.locator('#'+id).evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{id:n.id,focused:n===document.activeElement,top:r.top,bottom:r.bottom,width:r.width,left:r.left,right:r.right,vw:innerWidth,vh:innerHeight,hitTag:hit?.tagName,hitText:hit?.textContent?.slice(0,80),hitIsField:hit===n||n.contains(hit)};});
  focus.push(rect);assert.equal(rect.focused,true);assert.equal(rect.hitIsField,true,JSON.stringify(rect));assert.ok(rect.top>=0&&rect.bottom<=rect.vh&&rect.left>=0&&rect.right<=rect.vw,JSON.stringify(rect));
 }
 (report.focusChecks ||= []).push({width,focus});await shot(x.page,'report'+width);await shot(x.page,'report'+width+'-full',true);
});
await check('No physical transport, forbidden destination or page runtime errors',async()=>{assert.equal(report.physicalNetwork,0);assert.deepEqual(report.forbidden,[]);assert.deepEqual(report.pageErrors,[]);});
} finally {
 await browser.close();report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,total:report.checks.length,physicalNetwork:report.physicalNetwork,pageErrors:report.pageErrors.length};if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary,sourceStable:report.sourceStable,failures:report.checks.filter(c=>!c.pass).map(c=>({name:c.name,error:c.error}))}));if(report.summary.failed||!report.sourceStable)process.exitCode=1;
}
