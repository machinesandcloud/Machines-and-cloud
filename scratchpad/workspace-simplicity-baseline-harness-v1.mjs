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
const root = '/tmp/mc-workspace-simplicity-baseline-b082', origin = 'https://connection-journey.fixture.invalid';
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
  if(options.channels)c.onboarding.desiredChannels=options.channels;c.onboarding.phoneSetupMode='forward_business_line';c.phone.businessNumber='+17135550197';c.setupProof=options.reviewed?{reviewedRevision:configurationRevision(c),testedRevision:configurationRevision(c),testMode:'live'}:{};await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(6000);
  await context.addInitScript(({ origin, slug, token }) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen');
    const original = window.fetch; window.availabilityGates = []; window.holdAvailability = null;
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
  const state = { fault: null, failSignout: false, requests: [] };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action, body, date: body?.date, window: body?.window }; state.requests.push(item); report.requests.push(item);
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
async function shot(page,name){if(!output)return;const path=output.replace(/\.json$/,'-'+name+'.png');await page.screenshot({path,fullPage:false});report.screenshots=(report.screenshots||[]).concat(path);}
async function inspect(page,label){const result=await page.evaluate(()=>{const visible=n=>!!n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden',clean=s=>String(s||'').replace(/\s+/g,' ').trim();const controls=Array.from(document.querySelectorAll('button,a,summary,input,select,textarea')).filter(visible).map(n=>{const box=n.getBoundingClientRect();return {tag:n.tagName,id:n.id,label:clean(n.getAttribute('aria-label')||n.labels?.[0]?.innerText||n.innerText||n.getAttribute('name')),name:n.getAttribute('name'),destination:n.dataset.t||n.dataset.route||n.dataset.journeyRoute||null,disabled:!!n.disabled,inViewport:box.bottom>0&&box.top<innerHeight,tab:n.closest('.pane')?.id||null};});const destinations={};for(const c of controls)if(c.destination)(destinations[c.destination]||=[]).push({label:c.label,id:c.id,tab:c.tab});return{page:document.body.dataset.activePage,title:document.querySelector('#pageTitle').innerText,viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},navigation:controls.filter(c=>!!document.getElementById(c.id)?.closest('.tabs')||c.destination&&c.tag==='BUTTON'&&!c.tab&&c.label!=='Review business rules').map(c=>c.label),headingText:Array.from(document.querySelectorAll('h1,h2,h3,h4')).filter(visible).map(n=>clean(n.innerText)),controls,duplicateDestinations:Object.entries(destinations).filter(([,v])=>v.length>1).map(([destination,items])=>({destination,items})),text:clean(document.querySelector('#portalContent').innerText)};});report.views=(report.views||[]).concat({label,...result});return result;}
try{
 for(const width of[390,1440])await check(width+'px immutable before workspace map',async()=>{const x=await fixture(width,{route:'today'});for(const tab of['today','setup','know','test','leads','account']){if(tab!=='today'){await x.page.locator('.tabs [data-t="'+tab+'"]').click();await x.page.waitForFunction(t=>document.body.dataset.activePage===t,tab);}await x.page.evaluate(()=>window.scrollTo(0,0));await inspect(x.page,width+'-'+tab);await shot(x.page,width+'-'+tab);if(['today','setup'].includes(tab)){const p=output.replace(/\.json$/,'-'+width+'-'+tab+'-full.png');await x.page.screenshot({path:p,fullPage:true});report.screenshots.push(p);console.log(JSON.stringify({baselineReady:width+'-'+tab,viewport:output.replace(/\.json$/,'-'+width+'-'+tab+'.png'),full:p}));}}assert.equal(x.state.requests.filter(r=>r.method!=='GET').length,0);});
 await check('Reviewed current rules keep a separate activation path visible across daily work and settings',async()=>{const x=await fixture(390,{reviewed:true,route:'today'});for(const tab of['today','setup','leads']){if(tab!=='today')await x.page.locator('.tabs [data-t="'+tab+'"]').click();await x.page.evaluate(()=>scrollTo(0,0));await inspect(x.page,'reviewed-390-'+tab);await shot(x.page,'reviewed-390-'+tab);}assert.equal(x.state.requests.filter(r=>r.method!=='GET').length,0);});
}finally{await browser.close();report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.baselineCommit='b0820e5';report.assetCheckout=root;report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,total:report.checks.length,physicalNetwork:report.physicalNetwork,pageErrors:report.pageErrors.length,forbidden:report.forbidden.length};report.scope='Read-only actual current owner portal on immutable b082 with local synthetic workspace/session and actual API handlers. No provider/model/customer/account effects. Before-renders and visible navigation/control inventory, not redesign acceptance.';if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary,sourceStable:report.sourceStable,failures:report.checks.filter(c=>!c.pass)}));if(report.summary.failed)process.exitCode=1;}
