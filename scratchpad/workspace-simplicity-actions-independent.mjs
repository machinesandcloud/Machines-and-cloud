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
const root = resolve('.'), origin = 'https://connection-journey.fixture.invalid';
const files = ['desk.js','desk.html','desk.css','desk-connections.css','netlify/functions/lib/service-onboarding.mjs','netlify/functions/client.mjs','onboard.html','onboard.js','onboard.css','product-ui.css','desk-connections.js','netlify/functions/lib/connection-journey.mjs','netlify/functions/lib/service-connections.mjs'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(resolve(root,file)))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers, memory storage and intercepted browser assets; no physical/model/provider requests', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '0', ANTHROPIC_API_KEY: 'synthetic-ui-baseline-no-model-requests', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Connection journey check forbids physical transport'); };
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
async function fixture(width = 390, options = {}) {
  const slug = 'connection-ui-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Availability Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web','voice','sms','calendar'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  if(options.prepare)await options.prepare(c);if(options.channels)c.onboarding.desiredChannels=options.channels;c.onboarding.phoneSetupMode='forward_business_line';c.phone.businessNumber='+17135550197';c.setupProof=options.reviewed?{reviewedRevision:configurationRevision(c),testedRevision:configurationRevision(c),testMode:'live'}:{};await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport: { width, height: options.height || 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(6000);
  await context.addInitScript(({ origin, slug, token }) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.removeItem('mc-walkthrough-v1:' + slug);
    const baseFetch=window.fetch;window.pendingFetchGates=[];window.holdNextOwnerGet=false;window.holdNextWrite=null;window.fetch=async function(input,options={}){const url=new URL(typeof input==='string'?input:input.url,location.href);let body;try{body=JSON.parse(options.body);}catch{}let hold=false;if(url.pathname==='/api/client'&&(!options.method||options.method==='GET')&&window.holdNextOwnerGet){window.holdNextOwnerGet=false;hold=true;}if(url.pathname==='/api/client'&&window.holdNextWrite&&(options.method===window.holdNextWrite||body?.action===window.holdNextWrite)){window.holdNextWrite=null;hold=true;}const response=await baseFetch(input,hold?{...options,signal:undefined}:options);if(hold)await new Promise(resolve=>window.pendingFetchGates.push(resolve));return response;};const original = window.fetch; window.availabilityGates = []; window.holdAvailability = null;
    window.fetch = async function (input, options) {
      let body; try { body = JSON.parse(options?.body); } catch {}
      const hold = body?.action?.startsWith('availability_') && window.holdAvailability;
      // Deliberately ignore cancellation for held fixtures, proving the generation fence too.
      const response = await original(input, hold ? { ...options, signal: undefined } : options);
      if (!hold) return response;
      if (hold === 'body') { const json = response.json.bind(response); response.json = async function () { const value = await json(); await new Promise(release => window.availabilityGates.push(release)); return value; }; return response; }
      await new Promise(release => window.availabilityGates.push(release)); if (hold === 'error') throw new TypeError('Explicit lost transport response'); return response;
    };
  }, { origin, slug, token });
  const state = { ownerFault: null, fault: null, failSignout: false, requests: [] };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action, body, date: body?.date, window: body?.window }; state.requests.push(item); report.requests.push(item);
      if(method==='GET'&&url.pathname==='/api/client'&&state.ownerFault){const status=state.ownerFault;state.ownerFault=null;item.status=status;item.fixture='owner-read-fault';return route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:'synthetic_unavailable',message:'Explicit transient read failure.'})});}
      if (action?.startsWith('availability_') && state.fault) {
        const fault = state.fault; state.fault = null; item.fixture = fault;
        if (fault === 'network') { item.status = 'aborted'; return route.abort('failed'); }
        if (fault === 'malformed') { item.status = 200; return route.fulfill({ status: 200, contentType: 'text/plain', body: 'not JSON' }); }
        if (fault === 'auth-empty') { item.status = 401; return route.fulfill({ status: 401, contentType: 'text/plain', body: '' }); }
        item.status = fault; return route.fulfill({ status: fault, contentType: 'application/json', body: JSON.stringify({ error: fault === 409 ? 'configuration_changed' : 'availability_unavailable', message: fault === 409 ? 'The saved schedule changed. Reload availability before trying again.' : 'The schedule could not be confirmed.' }) });
      }
      if (action === 'sign_out' && state.failSignout) { state.failSignout = false; item.status = 503; item.fixture = 'signout503'; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"explicit_signout_failure"}' }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' }); item.status = response.status;
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage();if(options.clock)await page.clock.install({time:new Date()}); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/desk.html?c=' + slug + '#'+(options.route||'today')); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, c, token, state, context };
}
async function check(name,run){const start=contexts.length;try{await run();report.checks.push({name,pass:true});}catch(error){report.checks.push({name,pass:false,error:error.stack});}finally{await Promise.all(contexts.slice(start).map(context=>context.close()));}}
const {workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs');
async function go(x,tab){await x.page.evaluate(t=>{location.hash=t},tab);await x.page.waitForFunction(t=>document.body.dataset.activePage===t,tab);}
async function refresh(x){const n=x.state.requests.filter(r=>r.path==='/api/client'&&r.method==='GET').length;await x.page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:desk-refresh')));await x.page.waitForFunction(()=>document.body.dataset.workspaceState!=='loading');await x.page.waitForTimeout(80);assert.ok(x.state.requests.filter(r=>r.path==='/api/client'&&r.method==='GET').length>n);}
async function readClient(x){return store.get('clients',x.c.slug);}
async function shot(page,name){const path=output.replace(/\.json$/,'-'+name+'.png');await page.screenshot({path,fullPage:false});(report.screenshots||=[]).push(path);return path;}
async function release(page){await page.evaluate(()=>{for(const fn of window.pendingFetchGates.splice(0))fn();});}
async function expectNoWrites(x){assert.deepEqual(x.state.requests.filter(r=>r.method!=='GET').map(r=>r.action||r.method),[]);}
const input=(x,name)=>x.page.locator('#cfg [name="'+name+'"]');
async function submitCfg(x){await x.page.locator('#cfg').evaluate(form=>form.requestSubmit());}
async function cfgSettled(x){await x.page.waitForFunction(()=>document.querySelector('#cfg').getAttribute('aria-busy')!=='true');}
function futureWeekday(){for(let days=2;days<8;days++){const d=date(days),day=new Date(d+'T12:00:00-05:00').getDay();if(day!==0&&day!==6)return d;}throw Error('No future weekday');}
try{
await check('Current visible contact guidance names Schedule, Inbox and Front desk after closed-field error reveal',async()=>{const x=await fixture(320,{route:'know',channels:['web']});await x.page.locator('#contactDetails>summary').click();await input(x,'owner.phone').fill('123');await x.page.locator('#hoursDetails>summary').click();await submitCfg(x);await x.page.waitForFunction(()=>document.querySelector('[name="owner.phone"]').getAttribute('aria-invalid')==='true');assert.equal(await x.page.locator('#contactDetails').getAttribute('open'),'');assert.equal(await x.page.locator('#handoffNote').innerText(),'Saved visits appear in Schedule. Callback requests and conversations are in Inbox. Check Front desk for connection setup and delivery status.');assert.equal(await input(x,'owner.phone').evaluate(n=>document.activeElement===n),true);await shot(x.page,'320-current-copy-and-field-error');await expectNoWrites(x);});
await check('Actual retained ready-number action reveals provider ancestor details and genuine review requires unchecked permission',async()=>{const names=['VOICE_ACTIVATION_ENABLED','VOICE_ACTIVATION_POLICY_JSON','VOICE_ACTIVATION_APPROVED_VERSION','VAPI_API_KEY','VAPI_WEBHOOK_SECRET','SERVICE_WORKER_KEY','TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','VOICE_FALLBACK_TWIML_URL'];const prior=Object.fromEntries(names.map(k=>[k,process.env[k]]));try{const policy={version:'independent_local_voice_v1',model:'claude-sonnet-4-5',maxDurationSeconds:120,maxDailyCalls:3,maxDailyMinutes:10,accountDailyCalls:30,accountDailyMinutes:100,authorityText:'Synthetic local review permission for this test workspace only. No external service is authorized.',usageDisclosure:'Synthetic local fixture terms. No real calls, provider account or billing changes are authorized.'};Object.assign(process.env,{VOICE_ACTIVATION_ENABLED:'true',VOICE_ACTIVATION_POLICY_JSON:JSON.stringify(policy),VOICE_ACTIVATION_APPROVED_VERSION:policy.version,VAPI_API_KEY:'synthetic-test-key',VAPI_WEBHOOK_SECRET:'x'.repeat(40),SERVICE_WORKER_KEY:'x'.repeat(40),TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_AUTH_TOKEN:'synthetic-test-key',VOICE_FALLBACK_TWIML_URL:'https://handler.twilio.com/twiml/EH'+'1'.repeat(32)});const x=await fixture(390,{route:'setup',channels:['voice'],reviewed:true});const c=await readClient(x),tenant=workspaceTenant(c),at=new Date().toISOString(),number={id:'PN'+'2'.repeat(32),number:'+17135550196'};const numberId=c.slug+'/'+sha('first-phone-acquisition:'+tenant),voiceId=c.slug+'/'+sha('managed-voice-v1:'+tenant);await store.put('phone_activation_intents',numberId,{id:numberId,slug:c.slug,tenantIdentity:tenant,state:'number_acquired',resource:number,createdAt:at,updatedAt:at});const row={id:voiceId,slug:c.slug,tenantIdentity:tenant,inputRevision:configurationRevision(c),lifecycle:sha(JSON.stringify([c.status,c.operationLifecycleVersion||0,c.pausedAt||null,c.cancelledAt||null,c.liveAt||null])),state:'ready',number,routing:{confirmed:true,checkedAt:at},evidence:{},forwardingMode:'forward_business_line',createdAt:at,updatedAt:at};await store.put('voice_activation_intents',voiceId,row);await refresh(x);await x.page.waitForSelector('#connection-guide-voice [data-connection=show_phone_steps]');assert.equal(await x.page.locator('#connectionServiceDetails').getAttribute('open'),null);await x.page.locator('#connection-guide-voice [data-connection=show_phone_steps]').click();assert.equal(await x.page.locator('#connectionServiceDetails').getAttribute('open'),'');assert.equal(await x.page.locator('#phoneRoutingSteps').evaluate(n=>document.activeElement===n),true);assert.match(await x.page.locator('#phoneRoutingSteps').innerText(),/7135550197|713.*555.*0197/);assert.match(await x.page.locator('#phoneRoutingSteps').innerText(),/7135550196|713.*555.*0196/);await shot(x.page,'390-routing-step-reveal');await store.put('voice_activation_intents',voiceId,{...row,state:'needs_review'});await refresh(x);const review=x.page.locator('#connection-guide-voice [data-connection=review_voice]');await review.click();assert.equal(await x.page.locator('dialog[aria-labelledby="connectionTitle"]').isVisible(),true);assert.equal(await x.page.locator('dialog[aria-labelledby="connectionTitle"] input[name=authority]').isChecked(),false);assert.equal(await x.page.locator('dialog[aria-labelledby="connectionTitle"] [name=legalName]').count(),0);await x.page.locator('#connectionBack').click();await expectNoWrites(x);report.retainedFixture='Explicitly manufactured local number/voice rows test existing UI projection and permissions; no provider acquisition or successful call is claimed.';}finally{for(const name of names){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}});
await check('Copying installation code and web-person instructions does not become installation or request proof',async()=>{const x=await fixture(390,{route:'setup',channels:['web'],reviewed:true,prepare:c=>{c.business.website='https://shop.example.test';c.widget.allowedOrigins=['https://shop.example.test'];}});await x.context.grantPermissions(['clipboard-read','clipboard-write']);await x.page.locator('#websiteSetupDetails>summary').click();await x.page.locator('#websiteInstallHelp>summary').click();const before=await x.page.locator('#websiteInstallObserved').innerText();await x.page.locator('#copySnippet').click();await x.page.waitForFunction(()=>document.getElementById('copyMessage').textContent.startsWith('Code copied.'));const code=await x.page.evaluate(()=>navigator.clipboard.readText());assert.match(code,/embed\.js/);assert.ok(code.includes(x.c.slug));assert.equal(await x.page.locator('#websiteInstallObserved').innerText(),before);assert.doesNotMatch(await x.page.locator('#websiteInstallBadge').innerText(),/complete|installed|verified/i);await x.page.locator('#websiteInstallHandoff').click();await x.page.waitForFunction(()=>document.getElementById('copyMessage').textContent.startsWith('Instructions copied.'));const instructions=await x.page.evaluate(()=>navigator.clipboard.readText());assert.match(instructions,/https:\/\/shop\.example\.test/);assert.ok(instructions.includes(code));await refresh(x);assert.equal(await x.page.locator('#websiteInstallObserved').innerText(),before);assert.doesNotMatch(await x.page.locator('#websiteInstallRequest').innerText(),/complete|confirmed/i);await expectNoWrites(x);});
}finally{await browser.close();report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,total:report.checks.length,physicalNetwork:report.physicalNetwork,pageErrors:report.pageErrors.length,forbidden:report.forbidden.length};report.scope='Independent local actual owner handlers/assets, synthetic retained-resource proof rows, explicit clipboard permission only for fixture origin; no provider/model/email/network effects.';if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary,sourceStable:report.sourceStable,failures:report.checks.filter(c=>!c.pass)}));if(report.summary.failed||!report.sourceStable||report.physicalNetwork||report.pageErrors.length||report.forbidden.length)process.exitCode=1;}
