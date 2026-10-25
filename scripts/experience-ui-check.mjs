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
const root = resolve('.'), origin = 'https://followthrough.fixture.invalid';
const phase=option('--phase')||'baseline';
const ownerReportPaths=['desk-reports.js','netlify/functions/lib/owner-reports.mjs'],ownerReportsAvailable=ownerReportPaths.every(path=>existsSync(path));
if(!ownerReportsAvailable&&ownerReportPaths.some(path=>existsSync(path)))throw new Error('Held owner-report dependencies are only partially present');
const files = ['scripts/experience-ui-check.mjs','desk-setup-guide.js','desk-setup-guide.css','desk-lead-sources.js','desk-lead-sources.css','scripts/request-automation-ui-check.mjs','embed.js','desk-reports.js','netlify/functions/lib/owner-reports.mjs','netlify/functions/lib/request-followup.mjs','netlify/functions/lib/messaging-program.mjs','index.html','script.js','site-refresh.css','signup-intake.js','desk-requests.js','netlify/functions/lib/request-followthrough.mjs','scripts/build-site.mjs','scripts/request-followthrough-ui-check.mjs','desk.html','desk.js','desk.css','onboard.html','onboard.js','onboard.css','product-ui.css','desk-connections.js','netlify/functions/lib/connection-journey.mjs','netlify/functions/lib/service-connections.mjs','desk-connections.css','styles.css','netlify/functions/client.mjs','netlify/functions/workspace-billing.mjs','netlify/functions/lib/workspace-billing.mjs','netlify/functions/lib/store.mjs','netlify/functions/lib/access.mjs','netlify/functions/lib/desk.mjs','netlify/functions/lib/setup.mjs','netlify/functions/lib/config.mjs','netlify/functions/lib/workspace-identity.mjs','netlify/functions/lib/platform-operations.mjs'].filter(path=>ownerReportsAvailable||!ownerReportPaths.includes(path));
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
const report = { at: new Date().toISOString(), baseCommit:'eca0a00142d1c65fc84026e22f46f7ed781f5adc',authorImplementation:'141f6a9d684b120ed25afabb819ff94902b46038',excludedCases:ownerReportsAvailable?[]:[{name:'Email preference remains an explicit same-account save with ordinary reload',reason:'Owner-report runtime is held and absent from the production baseline. Account contact, export and lifecycle assertions remain enabled.'}], qualifications:'Synthetic tenant/status/proof fixtures; actual local handler and browser assets; memory storage replaces hosted storage. Internal worker dispatch is intercepted202. No model/provider/email/OAuth/purchase/deployment performed.', mode: 'Actual owner handlers, memory storage and intercepted browser assets; no physical/model/provider requests', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
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
      let responseBuffer=Buffer.from(await response.arrayBuffer());if(state.automaticOverride&&method==='GET'&&url.searchParams.has('requestId')){const value=JSON.parse(responseBuffer);value.request.automaticFollowup={...value.request.automaticFollowup,...state.automaticOverride};responseBuffer=Buffer.from(JSON.stringify(value));item.fixture='Read-only follow-up status display projection after actual owner handler';}const responseBody=responseBuffer.toString('utf8');item.responseByteSha=sha(responseBuffer); item.responseHeaders=Object.fromEntries(response.headers); if(url.searchParams.has('export'))item.responseBody=responseBody; if(method==='GET'&&url.pathname==='/api/client') {try{state.dto=JSON.parse(responseBody);}catch{}} if(state.loseAfter&&(action===state.loseAfter||method===state.loseAfter)){state.loseAfter=null;item.lostAfterEffect=true;if(state.failReadAfterLose){state.getFault=state.failReadAfterLose;state.failReadAfterLose=null;}return route.abort('failed');} if(state.badAfter&&['request_followthrough','request_followup'].includes(action)){state.badAfter=false;return route.fulfill({status:200,contentType:'application/json',body:'{}'});} return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: responseBuffer });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
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
async function seedRecords(x){const {workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs');const tenantIdentity=workspaceTenant(x.c);const booking=await store.addRecord('bookings',x.c.slug,{tenantIdentity,customer_name:'Renée "Fixture", Jr',phone:'+17135550197',address:'1500 Main St, Katy, TX 77450',issue:'AC, fan\nnot cooling',date:date(1),window:'8 to 12',status:'confirmed',channel:'web',notes:'Synthetic QA only'});const lead=await store.addRecord('leads',x.c.slug,{tenantIdentity,customer_name:'Taylor Fixture',phone:'+17135550196',issue:'Callback',status:'open',channel:'sms',outcome:'wants_call'});await store.addRecord('leads',x.c.slug,{tenantIdentity:'f'.repeat(64),customer_name:'FOREIGN TENANT MUST NOT EXPORT',phone:'+17135550199',status:'open'});await store.put('conversations',x.c.slug+'/'+tenantIdentity+'/web/local-fixture',{slug:x.c.slug,tenantIdentity,channel:'web',contact:'local-fixture',updatedAt:new Date().toISOString(),messages:[{at:new Date().toISOString(),role:'user',content:'Synthetic customer "question", with comma\nand line break'}]});return {booking,lead};}
async function exportFile(x,id,kind){const awaiting=x.page.waitForEvent('download');await x.page.locator('#'+id).click();const download=await awaiting;const bytes=readFileSync(await download.path());const item=x.state.exports.at(-1);assert.equal(sha(bytes),item.responseByteSha,'Saved download must match actual handler response bytes');if(output){const path=output.replace(/\.json$/,'-'+x.c.slug+'-'+kind+'.csv');await download.saveAs(path);report.downloads=(report.downloads||[]).concat({path,filename:download.suggestedFilename(),bytes:bytes.length});}return bytes;}
async function noProviderEffects(x){for(const kind of ['phone_activation_intents','voice_activation_intents','messaging_activation','calendar_oauth'])assert.equal((await store.list(kind,x.c.slug)).length,0,kind);assert.equal(report.physicalNetwork,0);}

try {
 for (const width of [320,390,1440]) await check('Fresh owner finds one setup action, edits choices deliberately and retains them '+width,async()=>{
  const x=await fixture(width,['web']);await x.page.locator('.tabs [data-t="today"]').click();
  assert.equal(await x.page.locator('#homeActivityDetails').evaluate(n=>n.open),false);assert.equal(await x.page.locator('body').getAttribute('data-home-mode'),'setup');
  const rect=await x.page.locator('#nextSetupAction').boundingBox();assert.ok(rect.y+rect.height<870);await shot(x.page,'home-'+width);
  await x.page.locator('#nextSetupAction').click();assert.equal(await x.page.locator('body').getAttribute('data-active-page'),'know');assert.equal(await x.page.evaluate(()=>document.activeElement.id),'p-know');
  await x.page.locator('.tabs [data-t="setup"]').click();assert.equal(await x.page.locator('#connectionPreferencesDetails').evaluate(n=>n.open),false);
  const before=x.state.requests.filter(r=>r.method!=='GET').length;
  if(width<=800)await x.page.locator('#setupGuideSelect').selectOption('calendar');else await x.page.locator('[data-guide-service="calendar"]').click();
  assert.equal(x.state.requests.filter(r=>r.method!=='GET').length,before);assert.deepEqual((await stored(x)).onboarding.desiredChannels,['web']);
  assert.match(await x.page.locator('#connectionChoiceSummary').innerText(),/Website chat/);
  await x.page.locator('#setupGuideChoose').click();assert.equal(await x.page.locator('#connectionPreferencesDetails').evaluate(n=>n.open),true);assert.equal(await x.page.locator('#connectionPreferences input[value="calendar"]').isChecked(),true);assert.match(await x.page.locator('#connectionsMessage').innerText(),/Your choice is not saved yet/);
  await x.page.locator('#saveConnections').click();await x.page.locator('#connectionsMessage').filter({hasText:'Preferences saved'}).waitFor();
  assert.equal(x.state.requests.filter(r=>r.action==='save_connection_preferences').length,1);assert.deepEqual((await stored(x)).onboarding.desiredChannels,['calendar','web']);
  await shot(x.page,'setup-choices-'+width);await x.page.reload();await x.page.locator('body[data-workspace-state="ready"]').waitFor();await x.page.locator('.tabs [data-t="setup"]').click();
  assert.equal(await x.page.locator('#connectionPreferencesDetails').evaluate(n=>n.open),false);assert.match(await x.page.locator('#connectionChoiceSummary').innerText(),/Google Calendar/);await shot(x.page,'setup-'+width);
  await account(x);if(ownerReportsAvailable){await x.page.locator('#ownerReportsSection:not([hidden])').waitFor();
  assert.equal(await x.page.evaluate(()=>!!(document.getElementById('ownerReportsSection').compareDocumentPosition(document.getElementById('accountDownloads'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);}
  await shot(x.page,'account-'+width);await noProviderEffects(x);
 });
 for(const width of [390,1440])await check('Returning owner sees saved daily work and controls the activity disclosure '+width,async()=>{
  const x=await fixture(width,['web']);await seedRecords(x);await refresh(x);await x.page.locator('.tabs [data-t="today"]').click();
  assert.equal(await x.page.locator('#homeActivityDetails').evaluate(n=>n.open),true);assert.equal(await x.page.locator('body').getAttribute('data-home-mode'),'work');
  assert.equal(await x.page.locator('#nextSetupAction').innerText(),'Open customer requests');assert.equal(await x.page.locator('#homeSetupSecondary').innerText(),'Review business details');
  const before=x.state.requests.filter(r=>r.method!=='GET').length;
  await shot(x.page,'returning-'+width);await x.page.locator('#nextSetupAction').click();assert.equal(await x.page.locator('body').getAttribute('data-active-page'),'leads');assert.match(await x.page.locator('#leads').innerText(),/Taylor Fixture/);
  await x.page.locator('.tabs [data-t="today"]').click();await x.page.reload();await x.page.locator('body[data-workspace-state="ready"]').waitFor();assert.equal(await x.page.locator('#nextSetupAction').innerText(),'Open customer requests');await x.page.locator('#homeSetupSecondary').click();assert.equal(await x.page.locator('body').getAttribute('data-active-page'),'know');assert.equal(x.state.requests.filter(r=>r.method!=='GET').length,before);await x.page.locator('.tabs [data-t="today"]').click();await x.page.locator('#homeActivityDetails>summary').click();await refresh(x);assert.equal(await x.page.locator('#homeActivityDetails').evaluate(n=>n.open),false);
  await x.page.locator('#homeActivityDetails>summary').click();await x.page.locator('.tabs [data-t="leads"]').click();assert.match(await x.page.locator('#leads').innerText(),/Taylor Fixture/);await noProviderEffects(x);
 });
 await check('Private or website-check records do not turn first-value setup into customer activity',async()=>{
  const x=await fixture(390,['web']);const tenantIdentity=(await import('../netlify/functions/lib/workspace-identity.mjs')).workspaceTenant(x.c);
  await store.addRecord('leads',x.c.slug,{tenantIdentity,customer_name:'Private practice',phone:'+17135550197',outcome:'wants_call',status:'open',simulation:true});await store.addRecord('bookings',x.c.slug,{tenantIdentity,customer_name:'Installation check',phone:'+17135550197',date:date(1),window:'8 to 12',status:'confirmed',websiteSetupCheck:true});
  await refresh(x);await x.page.locator('.tabs [data-t="today"]').click();assert.equal(await x.page.locator('body').getAttribute('data-home-mode'),'setup');assert.equal(await x.page.locator('#homeActivityDetails').evaluate(n=>n.open),false);assert.equal(await x.page.locator('#nextSetupAction').innerText(),'Review business details');await noProviderEffects(x);
 });
 await check('Unsaved business edits stay ahead of actionable customer work without losing the draft',async()=>{
  const x=await fixture(390,['web']);await seedRecords(x);await refresh(x);await x.page.locator('.tabs [data-t="setup"]').click();await x.page.locator('[data-workspace-route="know"]').click();await x.page.locator('#desk-setting-0').fill('Unsaved owner edit');await x.page.locator('.tabs [data-t="today"]').click();
  assert.match(await x.page.locator('#guideTitle').innerText(),/Finish your business edits/);assert.equal(await x.page.locator('#nextSetupAction').innerText(),'Open business details');await x.page.locator('#nextSetupAction').click();assert.equal(await x.page.locator('#desk-setting-0').inputValue(),'Unsaved owner edit');assert.notEqual((await stored(x)).business.name,'Unsaved owner edit');assert.equal(x.state.requests.filter(r=>r.method!=='GET').length,0);
 });
 await check('Failed saved-state read recovers without hidden mutations or stale private work',async()=>{
  const x=await fixture(390,['web']);x.state.getFault=503;await refresh(x);await x.page.locator('#portalRecovery:not([hidden])').waitFor();
  assert.equal(await x.page.locator('#portalContent').isHidden(),true);await shot(x.page,'saved-read-error-390');await x.page.locator('#retryLoad').click();await x.page.locator('body[data-workspace-state="ready"]').waitFor();
  assert.equal(x.state.requests.filter(r=>r.method!=='GET').length,0);await x.page.locator('#deskSignOut').click();await x.page.locator('#portalRecovery:not([hidden])').waitFor();assert.equal(await x.page.locator('#portalContent').isHidden(),true);await noProviderEffects(x);
 });
 await check('A failed preference save reopens its disclosure and keeps exact unsaved choices',async()=>{
  const x=await fixture(390,['web']);await x.page.locator('.tabs [data-t="setup"]').click();await x.page.locator('#connectionChoicesTitle').click();await x.page.locator('#connectionPreferences input[value="calendar"]').check();
  assert.match(await x.page.locator('#connectionChoiceSummary').innerText(),/Unsaved choices/);x.state.actionFault=503;
  await x.page.evaluate(()=>{window.qaHoldAction='save_connection_preferences';window.qaHold='response';});await x.page.locator('#saveConnections').click();await x.page.waitForFunction(()=>window.qaGates.length===1);
  assert.match(await x.page.locator('#connectionChoiceSummary').innerText(),/Saving choices/);await x.page.locator('#connectionChoicesTitle').click();assert.equal(await x.page.locator('#connectionPreferencesDetails').evaluate(n=>n.open),false);
  await x.page.evaluate(()=>window.qaGates.shift()());await x.page.locator('#connectionsMessage').filter({hasText:'could not be confirmed'}).waitFor();assert.equal(await x.page.locator('#connectionPreferencesDetails').evaluate(n=>n.open),true);assert.equal(await x.page.locator('#connectionPreferences input[value="calendar"]').isChecked(),true);assert.deepEqual((await stored(x)).onboarding.desiredChannels,['web']);assert.equal(x.state.requests.filter(r=>r.action==='save_connection_preferences').length,1);await shot(x.page,'preference-save-error-390');await noProviderEffects(x);
 });
 if(ownerReportsAvailable)await check('Email preference remains an explicit same-account save with ordinary reload',async()=>{
  const x=await fixture(390,['web']);await x.page.locator('#ownerReportsSection:not([hidden])').waitFor();await x.page.locator('#ownerReportDigest').check();await x.page.locator('#ownerReportsSave').click();
  await x.page.locator('#ownerReportsMessage').filter({hasText:/saved/i}).waitFor();assert.equal(x.state.requests.filter(r=>r.action==='owner_reports').length,1);await x.page.reload();await x.page.locator('body[data-workspace-state="ready"]').waitFor();await x.page.locator('#ownerReportDigest').waitFor();assert.equal(await x.page.locator('#ownerReportDigest').isChecked(),true);await noProviderEffects(x);
 });
} finally {
 report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,excluded:report.excludedCases.length};
 if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({output,...report.summary,sourceStable:report.sourceStable,physicalNetwork:report.physicalNetwork,pageErrors:report.pageErrors}));if(report.summary.failed||!report.sourceStable||report.physicalNetwork||report.pageErrors.length)process.exitCode=1;
}
