// Independent desktop/mobile customer jobs on actual assets and actual handlers.
// Playwright fulfills every request in process; no live account, provider or email.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!process.argv.includes('--output') || !/^scratchpad\/lead-sources-independent-ui-[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw Error('Choose a new independent UI receipt.');
const prefix = output.replace(/\.json$/, ''), origin = 'http://127.0.0.1:8987', hash = text => createHash('sha256').update(text).digest('hex');
const sourcePaths = ['desk.html','desk.js','desk.css','desk-lead-sources.js','desk-lead-sources.css','desk-requests.js','netlify/functions/client.mjs','netlify/functions/angi.mjs','netlify/functions/thumbtack.mjs','netlify/functions/lib/lead-connections.mjs','netlify/functions/lib/request-followthrough.mjs'];
const hashes = () => Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))]));
const report = { at: new Date().toISOString(), boundary: 'Independent actual frontend and actual access/client/Angi handlers, memory storage, browser requests fulfilled in process, provider/model/email/physical network disabled. Not hosted/provider acceptance.', before: hashes(), checks: [], outsideRequests: [], pageErrors: [], physicalNetworkAttempts: 0, screenshots: [], actionCounts: {} };
const deny = () => { report.physicalNetworkAttempts++; throw Error('Independent lead UI QA denies physical network.'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports(); globalThis.fetch = deny;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|CALENDAR_|MANAGED_|PHONE_|VOICE_|MESSAGING_|SERVICE_|NETLIFY_|BLOBS_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const store = await import('../netlify/functions/lib/store.mjs'), { newClient } = await import('../netlify/functions/lib/config.mjs');
const clientHandler = (await import('../netlify/functions/client.mjs')).default, accessHandler = (await import('../netlify/functions/access.mjs')).default, angiHandler = (await import('../netlify/functions/angi.mjs')).default;
let serial = 0;
async function fixture() {
  const n = ++serial, slug = 'lead-ui-' + n, token = hash('ui-token-' + n), client = { ...newClient({ slug, ownerKey: 'private-ui-' + n, owner: { name: 'Alex Owner', email: slug + '@example.test', phone: '+17135550123' }, business: { name: 'Gulf Coast Service', trade: 'HVAC', city: 'Houston', serviceArea: ['Houston'] } }), onboarding: { version: 1, desiredChannels: ['web','voice','sms','calendar'] }, status: 'testing', build: { status: 'built' } };
  await store.saveClient(client); await store.put('access_sessions', hash(token), { scope: 'onboarding', status: 'active', email: client.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() }); return { client, token, pro: String(700000 + n) };
}
async function owner(f) { const response = await clientHandler(new Request(origin + '/api/client?c=' + f.client.slug, { headers: { Authorization: 'Bearer ' + f.token, Origin: origin } })); assert.equal(response.status, 200); return response.json(); }
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] }), contexts = [];
async function screen(width = 1440, f = null) {
  f ||= await fixture(); const state = { loseNextAction: false, refuseNextAction: false, holdNextAction: null, posted: [], clipboard: '' };
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1050 }, serviceWorkers: 'block' }); contexts.push(context); context.setDefaultTimeout(5000);
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.addInitScript(values => { sessionStorage.setItem('mc-onboarding-session-v1', values.token); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__qaClipboard = text; } } }); }, { token: f.token });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { report.outsideRequests.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const body = request.postData(), parsed = body ? JSON.parse(body) : null;
      if (parsed?.action) { report.actionCounts[parsed.action] = (report.actionCounts[parsed.action] || 0) + 1; state.posted.push(parsed); }
      if (parsed?.action === 'lead_connection') {
        if (state.holdNextAction) { const held = state.holdNextAction; state.holdNextAction = null; held.enter(); await held.wait; }
        if (state.refuseNextAction) { state.refuseNextAction = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'synthetic_refusal', message: 'Could not confirm this setup change.' }) }); }
      }
      const handler = url.pathname === '/api/client' ? clientHandler : url.pathname === '/api/access' ? accessHandler : null;
      if (!handler) return route.fulfill({ status: 404, body: '{}' });
      const response = await handler(new Request(url, { method: request.method(), headers: request.headers(), ...(body ? { body } : {}) }));
      if (state.loseNextAction && parsed?.action === 'lead_connection') { state.loseNextAction = false; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    }
    const path = resolve(process.cwd(), url.pathname.replace(/^\/+/, '') || 'index.html');
    if (!path.startsWith(process.cwd() + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ message: error.message, stack: error.stack, page: page.url() }));
  await page.goto(origin + '/desk.html?c=' + f.client.slug); await page.locator('#portalContent:not([hidden])').waitFor(); if (await page.locator('#guideDialog').isVisible()) await page.locator('#skipGuide').click();
  await page.locator('[data-t="setup"]').first().click(); await page.locator('#leadSources:not([hidden])').waitFor(); return { f, page, context, state };
}
async function check(name, run) { try { await run(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } }
async function shot(page, suffix, fullPage = true) { const file = prefix + '-' + suffix + '.png'; if (existsSync(file)) throw Error('Preserve previous screenshot.'); await page.screenshot({ path: file, fullPage }); report.screenshots.push(file); }
async function openAngi(s) { await s.page.locator('[data-lead-source-open="angi"]').click(); await s.page.locator('#leadSourceDialog[open]').waitFor(); }
async function prepareAngi(s) { await openAngi(s); await s.page.locator('#leadSourceBusiness').fill(s.f.pro); await s.page.locator('#leadSourcePrepare').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /ready|saved/i }).waitFor(); }
async function assertFits(page) { const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, dialog: document.querySelector('dialog[open]') ? document.querySelector('dialog[open]').getBoundingClientRect().toJSON() : null })); assert.ok(bounds.document <= bounds.viewport + 1, JSON.stringify(bounds)); if (bounds.dialog) { assert.ok(bounds.dialog.left >= -1, JSON.stringify(bounds)); assert.ok(bounds.dialog.right <= bounds.viewport + 1, JSON.stringify(bounds)); } }
try {
  for (const width of [320, 390, 1440]) await check('Both platforms are discoverable and their real setup state fits ' + width + 'px', async () => {
    const s = await screen(width); assert.ok(await s.page.locator('#lead-source-thumbtack').isVisible()); assert.ok(await s.page.locator('#lead-source-angi').isVisible()); await assertFits(s.page); await shot(s.page, 'connections-' + width);
    await openAngi(s); await assertFits(s.page); await shot(s.page, 'angi-form-' + width); await s.page.locator('#leadSourceClose').click(); assert.equal(await s.page.locator('#leadSourceDialog').isVisible(), false);
  });
  await check('Ordinary empty and invalid submissions show a field error without saving', async () => {
    const s = await screen(390); await openAngi(s); await s.page.locator('#leadSourcePrepare').click(); assert.equal(await s.page.locator('#leadSourceBusiness').getAttribute('aria-invalid'), 'true'); assert.equal(await s.page.evaluate(() => document.activeElement.id), 'leadSourceBusiness'); assert.equal(s.state.posted.length, 0);
    await s.page.locator('#leadSourceBusiness').fill('not-a-numeric-id'); await s.page.locator('#leadSourcePrepare').click(); await s.page.locator('#leadSourceBusinessError').filter({ hasText: /business ID/i }).waitFor(); assert.equal(await s.page.locator('#leadSourceBusiness').inputValue(), 'not-a-numeric-id');
  });
  await check('Prepare confirmation exposes retained provider setup rather than falsely marking Angi connected', async () => {
    const s = await screen(390); await prepareAngi(s); assert.equal(await s.page.locator('#leadSourceForm').isHidden(), true); assert.equal(await s.page.locator('#leadSourceSecret').getAttribute('type'), 'password'); assert.ok((await s.page.locator('#leadSourceEndpoint').inputValue()).includes('/api/angi?'));
    assert.match(await s.page.locator('#lead-source-angi').innerText(), /Waiting for first lead/); assert.match(await s.page.locator('#leadSourceInstructions').innerText(), /Angi/); await shot(s.page, 'prepared-390'); await shot(s.page, 'prepared-390-viewport', false);
    await s.page.locator('#leadSourceCopy').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /copied/i }).waitFor(); const clip = await s.page.evaluate(() => window.__qaClipboard); assert.match(clip, /X-API-KEY/); assert.match(clip, new RegExp(s.f.pro));
    await s.page.locator('#leadSourceClose').click(); assert.equal(await s.page.locator('#leadSourceSecret').inputValue(), ''); await s.page.reload(); await s.page.locator('[data-lead-source-open="angi"]').waitFor(); await s.page.locator('[data-t="setup"]').first().click(); await openAngi(s); assert.equal(await s.page.locator('#leadSourceBusiness').inputValue(), s.f.pro); assert.equal(await s.page.locator('#leadSourceForm').isHidden(), true);
  });
  await check('The visible section refresh provides progress and completion feedback outside the dialog', async () => {
    const s = await screen(390); await s.page.locator('#leadSourcesRefresh').click(); await s.page.locator('#leadSourcesMessage').filter({ hasText: /checked|updated|saved/i }).waitFor(); assert.equal(await s.page.locator('#leadSourceDialog').isVisible(), false);
  });
  await check('Thumbtack saves its business context and explains the actual authorization step without a fake endpoint', async () => {
    const s = await screen(390); await s.page.locator('[data-lead-source-open="thumbtack"]').click(); assert.equal(await s.page.locator('#leadSourceBusiness').isHidden(),true); await s.page.locator('#leadSourcePrepare').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /saved|authorization/i }).waitFor(); assert.equal(await s.page.locator('#leadSourceEndpointGroup').isHidden(), true); assert.equal(await s.page.locator('#leadSourceSecretGroup').isHidden(), true); assert.match(await s.page.locator('#lead-source-thumbtack').innerText(), /Partner authorization needed/); assert.match(await s.page.locator('#leadSourceInstructions').innerText(), /permission|partner/); await assertFits(s.page); await shot(s.page, 'thumbtack-390');
  });
  await check('A lost setup response requires checking the saved result and recovers the original operation', async () => {
    const s = await screen(390); await openAngi(s); await s.page.locator('#leadSourceBusiness').fill(s.f.pro); s.state.loseNextAction = true; await s.page.locator('#leadSourcePrepare').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /couldn’t confirm|could not confirm/i }).waitFor(); const posted = s.state.posted.at(-1); assert.equal(await s.page.locator('#leadSourcePrepare').isDisabled(), true); await s.page.locator('#leadSourceCheck').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /saved/i }).waitFor(); const current = await owner(s.f); assert.equal(current.leadConnections.angi.lastOperationId, posted.operationId); assert.equal(s.state.posted.filter(input => input.action === 'lead_connection').length, 1); assert.equal(await s.page.locator('#leadSourceRetry').isHidden(), true);
  });
  await check('A refused setup retains the original input and retries the same operation only after status check', async () => {
    const s = await screen(390); await openAngi(s); await s.page.locator('#leadSourceBusiness').fill(s.f.pro); s.state.refuseNextAction = true; await s.page.locator('#leadSourcePrepare').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /confirm/i }).waitFor(); const first = s.state.posted.at(-1); await s.page.locator('#leadSourceCheck').click(); await s.page.locator('#leadSourceRetry:not([hidden])').waitFor(); await s.page.locator('#leadSourceRetry').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /ready/i }).waitFor(); assert.deepEqual(s.state.posted.at(-1), first); assert.equal(await s.page.locator('#leadSourceBusiness').inputValue(), s.f.pro);
  });
  await check('Disconnect requires an intentional choice and keeps the earlier imported Inbox request', async () => {
    const s = await screen(390); await prepareAngi(s); const dto = await owner(s.f), c = dto.leadConnections.angi;
    const response = await angiHandler(new Request(c.setup.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': c.setup.secret }, body: JSON.stringify({ leadOid: '990001', srOid: '990700', spEntityId: s.f.pro, name: 'Jamie Customer', taskName: 'AC warm after filter replacement', comments: 'Please reply after 4 pm.', address: '12 Oak St', city: 'Houston', stateProvince: 'TX', postalCode: '77057', primaryPhone: '+17135550142', email: 'jamie@example.test', interview: [{ question: 'Any pets?', answer: 'Dog in backyard' }] }) })); assert.equal(response.status, 200);
    await s.page.locator('#leadSourceCheck').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /checked|saved/i }).waitFor(); await s.page.locator('#leadSourceManage summary').click(); assert.equal(await s.page.locator('#leadSourceDisconnect').isDisabled(), true); await s.page.locator('#leadSourceConfirm').check(); await s.page.locator('#leadSourceDisconnect').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /Disconnected/ }).waitFor(); assert.match(await s.page.locator('#lead-source-angi').innerText(), /Disconnected/); assert.equal((await owner(s.f)).leads.length, 1);
  });
  await check('Imported request details explain the source and original-platform reply without saying it was sent', async () => {
    const s = await screen(1440); await prepareAngi(s); const config = (await owner(s.f)).leadConnections.angi;
    const response = await angiHandler(new Request(config.setup.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': config.setup.secret }, body: JSON.stringify({ leadOid: '990002', srOid: '990700', spEntityId: s.f.pro, name: 'Jamie <img src=x onerror=alert(1)>', taskName: 'AC warm', comments: 'Filter changed, still warm.', address: '12 Oak St', city: 'Houston', stateProvince: 'TX', postalCode: '77057', primaryPhone: '+17135550142', email: 'jamie@example.test', interview: [{ question: 'Any pets?', answer: 'Dog in backyard' }] }) })); assert.equal(response.status, 200);
    await s.page.locator('#leadSourceClose').click(); await s.page.reload(); await s.page.locator('#portalContent:not([hidden])').waitFor(); await s.page.locator('[data-t="leads"]').first().click(); await s.page.locator('#p-leads [data-request-open]').first().click(); await s.page.locator('#requestDialog[open]').waitFor(); await s.page.locator('#requestContent:not([hidden])').waitFor(); await s.page.locator('#requestPlatformContext summary').click(); const text = await s.page.locator('#requestDialog').innerText(); assert.match(text, /Angi/); assert.match(text, /Dog in backyard/); assert.match(text, /reply|Reply/); assert.equal(await s.page.locator('#requestDialog img[src="x"]').count(), 0); assert.equal(await s.page.locator('#requestDialog a[href="https://office.angi.com/"]').count(), 1); await shot(s.page, 'request-1440'); await s.page.setViewportSize({ width: 390, height: 844 }); await assertFits(s.page); await shot(s.page, 'request-390'); await shot(s.page, 'request-390-viewport', false); await s.page.locator('#requestReplyText').fill('Thanks Jamie. Would tomorrow afternoon work for a visit?'); await s.page.locator('#requestReplySave').click(); await s.page.locator('#requestMessage').filter({hasText:/draft saved/i}).waitFor(); assert.match(await s.page.locator('#requestReplySaved').innerText(), /Not sent/); await s.page.locator('#requestReplyCopy').click(); await s.page.locator('#requestMessage').filter({hasText:/copying has not contacted/i}).waitFor(); assert.equal(await s.page.evaluate(()=>window.__qaClipboard),'Thanks Jamie. Would tomorrow afternoon work for a visit?');
  });
  await check('Revoked sessions clear private connection details and expose sign-in recovery', async () => {
    const s = await screen(390); await prepareAngi(s); await store.atomicUpdate('access_sessions', hash(s.f.token), current => ({ value: { ...current, status: 'revoked' } })); await s.page.locator('#leadSourceCheck').click(); await s.page.locator('#portalRecovery:not([hidden])').waitFor(); assert.equal(await s.page.locator('#leadSourceDialog').isVisible(), false); assert.equal(await s.page.locator('#leadSourceSecret').inputValue(), ''); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1')), null);
  });
  await check('Signing out during a pending setup prevents a late response from restoring private details', async () => {
    const s = await screen(390); await openAngi(s); await s.page.locator('#leadSourceBusiness').fill(s.f.pro); let entered, release; const inFlight = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; }); s.state.holdNextAction = { enter: entered, wait: held }; await s.page.locator('#leadSourcePrepare').click(); await inFlight; await s.page.evaluate(() => document.querySelector('#deskSignOut').click()); await s.page.locator('#portalRecovery:not([hidden])').waitFor(); release(); await s.page.waitForTimeout(200); assert.equal(await s.page.locator('#portalContent').isHidden(), true); assert.equal(await s.page.locator('#leadSources').isHidden(), true); assert.equal(await s.page.locator('#leadSourceSecret').inputValue(), '');
  });
} finally {
  report.after = hashes(); report.sourceStable = JSON.stringify(report.before) === JSON.stringify(report.after); report.passed = report.checks.filter(row => row.pass).length; report.total = report.checks.length; report.ok = report.passed === report.total && report.sourceStable && report.pageErrors.length === 0 && report.physicalNetworkAttempts === 0;
  for (const context of contexts) await context.close(); await browser.close(); writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ output, ok: report.ok, passed: report.passed, total: report.total, sourceStable: report.sourceStable, pageErrors: report.pageErrors, failures: report.checks.filter(row => !row.pass).map(({name,error}) => ({name,error})) }, null, 2)); if (!report.ok) process.exitCode = 1;
}
