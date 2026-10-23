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
const files = ['desk.html','desk.js','desk.css','onboard.html','onboard.js','onboard.css','product-ui.css','desk-connections.js','netlify/functions/lib/connection-journey.mjs','netlify/functions/lib/service-connections.mjs'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers, memory storage and intercepted browser assets; no physical/model/provider requests', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
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
async function fixture(width = 390) {
  const slug = 'connection-ui-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Availability Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web','voice','sms','calendar'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
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
      const item = { slug, path: url.pathname, method, action, date: body?.date, window: body?.window }; state.requests.push(item); report.requests.push(item);
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
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/desk.html?c=' + slug + '#setup'); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, c, token, state, context };
}
async function check(name,run){const start=contexts.length;try{await run();report.checks.push({name,pass:true});}catch(error){report.checks.push({name,pass:false,error:error.stack});}finally{await Promise.all(contexts.slice(start).map(context=>context.close()));}}
async function shot(page,name){if(!output)return;const path=output.replace(/\.json$/,'-'+name+'.png');await page.screenshot({path,fullPage:false});report.screenshots=(report.screenshots||[]).concat(path);}
try{
 for(const width of[320,390,1440])await check(width+'px actual owner DTO gives four clear channel paths and explicit next actions',async()=>{const x=await fixture(width);await x.page.locator('.connection-guide-card').first().waitFor();assert.equal(await x.page.locator('.connection-guide-card').count(),4);for(const id of['web','voice','sms','calendar']){const card=x.page.locator('#connection-guide-'+id);await card.locator('[data-journey-detail]').click();assert.match(await card.innerText(),/We handle/);assert.match(await card.innerText(),/Your one-time part/);assert.match(await card.innerText(),/Ready when/);await card.locator('[data-journey-detail]').click();}assert.equal(await x.page.locator('[data-connection="review_setup"]').count(),0);assert.equal(await x.page.locator('[data-connection="start_calendar"]').count(),0);const before=report.requests.length;await x.page.locator('.connection-guide [data-journey-route="know"]').click();await x.page.locator('body[data-active-page="know"]').waitFor();assert.equal(report.requests.length,before);await x.page.locator('.tabs [data-t="setup"]').click();await x.page.locator('[data-connection="check_status"]').click();await x.page.locator('#serviceConnectionMessage').filter({hasText:'Saved connection status updated.'}).waitFor();await x.page.waitForTimeout(100);assert.equal(report.requests.filter(row=>row.method!=='GET').length,0);const bounds=await x.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1);await x.page.locator('.connection-guide').scrollIntoViewIfNeeded();await x.page.locator('.connection-guide').evaluate(el=>el.scrollIntoView({block:'start'}));await shot(x.page,'workspace-'+width);await x.page.locator('#connection-guide-web [data-journey-detail]').click();assert.equal(await x.page.locator('[data-journey-detail][aria-expanded="true"]').count(),1);await shot(x.page,'workspace-expanded-'+width);});
 await check('Actual saved onboarding choices reveal the selected path without separate provider-account fields',async()=>{const x=await fixture();await x.page.goto(origin+'/onboard.html');await x.page.locator('#ob').waitFor({state:'visible'});await x.page.locator('input[name="desiredChannels"][value="voice"]').check();await x.page.locator('input[name="desiredChannels"][value="sms"]').check();await x.page.locator('input[name="desiredChannels"][value="calendar"]').check();assert.equal(await x.page.locator('#selected-connection-plan details').count(),4);assert.equal(await x.page.locator('#selected-connection-plan details[data-channel="calendar"]').getAttribute('open'),'');assert.match(await x.page.locator('#selected-connection-plan').innerText(),/Google account/);assert.equal(await x.page.locator('[name="VAPI_API_KEY"],[name="TWILIO_AUTH_TOKEN"],[name="GOOGLE_CLIENT_SECRET"]').count(),0);assert.equal(await x.page.locator('#phone-routing-settings').isVisible(),true);await x.page.locator('.connection-preview').evaluate(el=>el.scrollIntoView({block:'start'}));await shot(x.page,'onboard-selected');});
 await check('Actual create-workspace flow hands the selected connections to #setup without an automatic optional tour',async()=>{const x=await fixture();await x.page.goto(origin+'/onboard.html');await x.page.locator('#ob').waitFor({state:'visible'});await x.page.locator('#name').fill('Alex Fixture');await x.page.locator('#phone').fill('7135550198');await x.page.locator('#website').fill('https://shop.example.test');await x.page.locator('input[name="desiredChannels"][value="voice"]').uncheck();await x.page.locator('input[name="desiredChannels"][value="sms"]').uncheck();await x.page.locator('input[name="desiredChannels"][value="calendar"]').check();await x.page.locator('#next').click();await x.page.locator('[data-step="2"]').waitFor({state:'visible'});await x.page.locator('#business').fill('Connection Fixture Shop');await x.page.locator('#trade').selectOption('Plumbing');await x.page.locator('#services').fill('Drain repair');await x.page.locator('#hours').fill('Mon-Fri 8am-5pm');await x.page.locator('#serviceArea').fill('Katy');await x.page.locator('#next').click();await x.page.locator('[data-step="3"]').waitFor({state:'visible'});await x.page.locator('#windows').fill('8 to 12\n12 to 5');await x.page.locator('#next').click();await x.page.locator('[data-step="4"]').waitFor({state:'visible'});await x.page.locator('#next').click();await x.page.locator('#done.on').waitFor();const href=await x.page.locator('#goPortal').getAttribute('href');assert.equal(new URL(href,origin).hash,'#setup');assert.equal(await x.page.locator('#goPortal').innerText(),'Continue my connections');await x.page.locator('#goPortal').click();await x.page.locator('body[data-workspace-state="ready"]').waitFor();assert.equal(await x.page.locator('body').getAttribute('data-active-page'),'setup');assert.equal(await x.page.locator('#guideDialog').isVisible(),false);assert.equal(await x.page.locator('.connection-guide-card').count(),2);await shot(x.page,'created-connections');});
 await check('Website action reveals and focuses the actual existing installation step without a provider action',async()=>{const x=await fixture();const revision=configurationRevision(x.c);x.c.setupProof={reviewedRevision:revision,testedRevision:revision,testMode:'live'};await store.put('clients',x.c.slug,x.c);await x.page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:desk-refresh')));await x.page.locator('#connection-guide-web [data-journey-route="setup"]').waitFor();const before=report.requests.length;await x.page.locator('#connection-guide-web [data-journey-route="setup"]').click();await x.page.waitForFunction(()=>document.activeElement?.id==='websiteInstallStep');report.websiteRevealInitialBounds=await x.page.locator('#websiteInstallStep').boundingBox();await x.page.waitForFunction(()=>{const r=document.getElementById('websiteInstallStep').getBoundingClientRect();return r.top>=-1&&r.top<innerHeight;});const bounds=await x.page.locator('#websiteInstallStep').boundingBox();assert.ok(bounds.y>=-1&&bounds.y<950,JSON.stringify(bounds));report.websiteRevealSettledBounds=bounds;assert.equal(report.requests.slice(before).filter(row=>row.method!=='GET').length,0);await shot(x.page,'website-step-revealed');});
 await check('Web-only owner sees one selected connection without the obsolete duplicate status checklist',async()=>{const x=await fixture();x.c.onboarding.desiredChannels=['web'];await store.put('clients',x.c.slug,x.c);await x.page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:desk-refresh')));await x.page.waitForFunction(()=>document.querySelectorAll('.connection-guide-card').length===1);assert.equal(await x.page.locator('#setupOverview').isVisible(),false);assert.equal(await x.page.locator('#connection-guide-web').count(),1);assert.equal(await x.page.locator('#connection-guide-voice,#connection-guide-sms,#connection-guide-calendar').count(),0);assert.equal(await x.page.locator('#websiteSetupDetails').isVisible(),true);assert.equal(await x.page.locator('#websiteSetupDetails').evaluate(el=>el.open),false);});
}finally{await browser.close();report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,total:report.checks.length,physicalNetwork:report.physicalNetwork,pageErrors:report.pageErrors.length,forbidden:report.forbidden.length};if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary,sourceStable:report.sourceStable,failures:report.checks.filter(c=>!c.pass).map(c=>({name:c.name,error:c.error}))}));if(report.summary.failed)process.exitCode=1;}
