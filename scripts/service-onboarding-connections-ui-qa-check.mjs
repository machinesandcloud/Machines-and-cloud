// Independent browser component QA of actual connection renderer/CSS. The host
// DOM, owner DTO and POST response are explicit fixtures; actual API/orchestration
// acceptance is tested separately by service-onboarding-qa-check.mjs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!/^scratchpad\/service-onboarding-qa-connections-[a-z0-9-]+\.json$/.test(output || '') || existsSync(output)) throw new Error('Choose a new connection component receipt.');
const base = 'http://127.0.0.1:8928', files = ['desk.html', 'desk-connections.js', 'desk-connections.css', 'styles.css', 'product-ui.css', 'desk.css'], hash = value => createHash('sha256').update(value).digest('hex');
const assets = new Map(files.map(file => ['/' + file, readFileSync(file)]));
const deskStyles = assets.get('/desk.html').toString().match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
assert.ok(assets.get('/desk.css'), 'The component must include the current portal stylesheet.');
const report = { at: new Date().toISOString(), scope: 'Actual browser connection renderer and styles on explicit host-DOM/owner-DTO/mutation fixtures; no real signup, worker, provider or API mutation. Main actual-handler proof is separate.', before: Object.fromEntries(files.map(file => [file, hash(assets.get('/' + file))])), checks: [], screenshots: [], pageErrors: [], physicalNetwork: 0, requests: [], blocked: [] };
const deny = () => { report.physicalNetwork++; throw new Error('Component QA physical network denied.'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] }), contexts = [];
const check = async (name, run) => { try { await run(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } };
function dto() {
  return { configurationRevision: 'e'.repeat(64), webAvailable: false, client: { status: 'testing', setupProof: { reviewedRevision: 'e'.repeat(64), testedRevision: 'e'.repeat(64), testMode: 'live' }, onboarding: { desiredChannels: ['voice', 'sms'], phoneSetupMode: 'use_new_number' }, business: { name: 'Fixture Plumbing', city: 'Houston', website: 'https://shop.example.test' }, owner: { name: 'Alex Fixture', email: 'qa-owner@example.test', phone: '+17135550198' } }, phoneActivation: { operation: null },
    serviceOnboarding: { available: true, legacySetup: false, requestedChannels: ['voice', 'sms'], operation: null, offer: { digest: 'd'.repeat(64), number: { oneTimeCents: 0, monthlyCents: 115, authorityText: 'Reserve the reviewed dedicated business number.' }, voice: { usageDisclosure: 'Approved synthetic phone usage limits.', authorityText: 'Approve phone answering for this business.', maxDailyCalls: 3, maxDailyMinutes: 15, maxDurationSeconds: 300 }, messaging: { brandRegistrationCents: 4400, campaignRegistrationCents: 1500, campaignMonthlyCents: 1000, usageDisclosure: 'Approved synthetic texting terms.', authorityText: 'Approve this business texting registration.' }, program: { description: 'Customer care and accepted appointment texts.', messageFlow: 'Customers initiate contact and explicitly choose appointment texts.', messageSamples: ['Your visit is saved.', 'Your visit is tomorrow.', 'Your visit was cancelled. Reply STOP to end texts.'] } } },
    connections: { voice: { available: true, active: false, state: 'unavailable', operation: null }, messaging: { available: true, active: false, state: 'unavailable', operation: null, detail: 'Texting is not active.' }, calendar: { available: false, connected: false, status: 'not_connected' }, delivery: { total: 0, jobs: [] }, calendarDelivery: { total: 0, jobs: [] } } };
}
async function fixture(data = dto(), width = 375) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce', storageState: { cookies: [], origins: [] } }); contexts.push(context);
  await context.addInitScript(() => sessionStorage.setItem('mc-onboarding-session-v1', 'a'.repeat(64)));
  await context.routeWebSocket('**/*', socket => socket.close());
  const requests = [];
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { report.blocked.push(url.origin); return route.abort(); }
    if (url.pathname === '/fixture.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/desk-connections.css"><link rel="stylesheet" href="/product-ui.css"><link rel="stylesheet" href="/desk.css"><style>' + deskStyles + '</style></head><body class="theme-light product-app desk-app"><main style="max-width:1000px;margin:auto;padding:20px"><button id="deskSignOut">Sign out</button><h2 id="status">Workspace ready</h2><div id="channelStates"></div><section id="phoneSetupCard">Standalone number setup</section><div id="connectionJourney"></div><div id="serviceConnections"></div><p id="serviceConnectionMessage" role="status"></p></main><script src="/desk-connections.js"></script></body></html>' });
    if (url.pathname === '/api/client' && req.method() === 'POST') {
      const body = req.postDataJSON(); requests.push(body); report.requests.push({ action: body.action, legalPresent: !!body.legal });
      const result = structuredClone(data); result.serviceOnboarding.available = false; result.serviceOnboarding.operation = { id: 'fixture-operation', state: 'awaiting_number', numberRequested: true, voiceRequested: false, messagingRequested: false, cancellationRequested: false, detail: 'Your number request is saved. Selected connections continue automatically.' };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, client: result.client, connections: result.connections, serviceOnboarding: result.serviceOnboarding }) });
    }
    const body = assets.get(url.pathname); return route.fulfill(body ? { contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', body } : { status: 404, body: 'Fixture asset unavailable' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', error => report.pageErrors.push(error.message)); await page.goto(base + '/fixture.html?c=fixture-shop'); await page.evaluate(data => document.dispatchEvent(new CustomEvent('mc:desk', { detail: data })), data);
  return { page, requests };
}
async function shot(page, label) { const path = output.replace(/\.json$/, '') + '-' + label + '.png'; await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); }
try {
  await check('Expired texting checks offer a fresh request with explicit unchecked mobile consent', async () => {
    const data=dto();
    data.connections.messaging.operation={id:'fixture-text-operation',state:'awaiting_test',detail:'The setup text expired. Request a fresh setup text to verify this connection.',customerAction:'renew_setup_text',probe:{nonce:'ABC12345',to:data.client.owner.phone,expiresAt:'2020-01-01T00:00:00Z',expired:true,renewable:true}};
    const {page,requests}=await fixture(data,320);
    assert.match(await page.locator('#textConnectionSteps').innerText(),/setup text expired/);
    await page.locator('[data-connection="renew_text_probe"]').click();
    const form=page.locator('#connectionForm');assert.equal(await form.locator('[name="testPhoneConsent"]').isChecked(),false);
    await form.locator('[type="submit"]').click();assert.equal(requests.length,0);
    await form.locator('[name="testPhoneConsent"]').check();await form.locator('[type="submit"]').click();
    await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
    assert.deepEqual(requests,[{action:'renew_messaging_probe',expectedRevision:'e'.repeat(64),operationId:'fixture-text-operation',expectedProbeNonce:'ABC12345',testPhoneConsent:true}]);
    data.connections.messaging.operation.probe.expired=false;
    data.connections.messaging.operation.detail='Your mobile number changed. Request a fresh setup text.';
    const changed=await fixture(data,320);await changed.page.locator('[data-connection="renew_text_probe"]').click();
    assert.equal(await changed.page.locator('[name="testPhoneConsent"]').isChecked(),false);assert.doesNotMatch(await changed.page.locator('#connectionForm').innerText(),/earlier.*expired/);assert.equal(changed.requests.length,0);
    data.connections.messaging.available=false;
    const blocked=await fixture(data,320);assert.equal(await blocked.page.locator('[data-connection="renew_text_probe"]').count(),0);assert.equal(blocked.requests.length,0);
  });
  await check('Saved sending waits explain platform responsibility and Calendar automatic recovery without a fake retry', async () => {
    const data = dto();
    data.connections.delivery = { total:1, jobs:[{purpose:'reply',state:'waiting_platform',reasonCode:'sms_budget_exhausted',detail:'The platform is reviewing this sending allowance. <script>window.qaInjected=true</script>'}] };
    data.connections.calendarDelivery = { total:1, jobs:[{bookingId:'fixture-visit',state:'queued',reasonCode:'calendar_budget_exhausted',detail:'Internal detail',nextAttemptAt:'2026-10-24T00:00:00.000Z'}] };
    const {page,requests} = await fixture(data,320);
    await page.getByText('Recent delivery status',{exact:true}).click();
    assert.match(await page.locator('[data-delivery-status="message"]').innerText(),/Machines & Cloud manages this delivery check/);
    assert.match(await page.locator('[data-delivery-status="calendar"]').innerText(),/continue automatically/);
    assert.equal(await page.locator('[data-delivery-status="calendar"] time').getAttribute('datetime'),'2026-10-24T00:00:00.000Z');
    assert.equal(await page.locator('[data-delivery-status] button').count(),0); assert.equal(await page.evaluate(()=>window.qaInjected),undefined); assert.equal(requests.length,0);
  });
  await check('Unreviewed business routes to the saved answers without opening a financial approval', async () => {
    const data = dto(); data.client.setupProof = {}; const { page, requests } = await fixture(data); assert.equal(await page.locator('[data-connection="review_setup"]').count(), 0); assert.equal(await page.locator('[data-connection="review_business"]').count(), 1);
    await page.evaluate(() => document.addEventListener('mc:desk-route', event => { window.qaRoute = event.detail; })); await page.locator('[data-connection="review_business"]').click(); assert.equal(await page.evaluate(() => window.qaRoute?.tab), 'know'); assert.equal(await page.locator('#connectionForm').count(), 0); assert.equal(requests.length, 0);
  });
  await check('Reviewed business without a current real practice routes to the private test first', async () => {
    const data = dto(); data.client.setupProof.testMode = 'fake'; const { page, requests } = await fixture(data); assert.equal(await page.locator('[data-connection="review_setup"]').count(), 0); assert.equal(await page.locator('[data-connection="try_frontdesk"]').count(), 1);
    await page.evaluate(() => document.addEventListener('mc:desk-route', event => { window.qaRoute = event.detail; })); await page.locator('[data-connection="try_frontdesk"]').click(); assert.equal(await page.evaluate(() => window.qaRoute?.tab), 'test'); assert.equal(await page.locator('#connectionForm').count(), 0); assert.equal(requests.length, 0);
  });
  await check('Fresh setup offers one combined review and hides separate number/phone/text setup actions', async () => {
    const { page } = await fixture(); assert.equal(await page.locator('[data-connection="review_setup"]').count(), 1); assert.equal(await page.locator('[data-connection="review_voice"], [data-connection="review_sms"]').count(), 0); assert.equal(await page.locator('#phoneSetupCard').isHidden(), true);
  });
  for (const width of [320, 375, 1365]) await check(width + ': combined review shows costs, reused identity and separate unchecked approvals without overflow', async () => {
    const { page, requests } = await fixture(dto(), width); await page.locator('[data-connection="review_setup"]').click(); const form = page.locator('#connectionForm'); await form.waitFor();
    assert.match(await form.innerText(), /\$1\.15/); assert.match(await form.innerText(), /\$44\.00/); assert.match(await form.innerText(), /\$15\.00/); assert.match(await form.innerText(), /\$10\.00/);
    assert.equal(await form.locator('[name="legalName"]').inputValue(), 'Fixture Plumbing'); assert.equal(await form.locator('[name="email"]').inputValue(), 'qa-owner@example.test'); assert.equal(await form.locator('[name="forwardingMode"]').inputValue(), 'use_new_number');
    assert.equal(await form.locator('input[type="checkbox"][required]').count(), 5); assert.equal(await form.locator('input[type="checkbox"]:checked').count(), 0);
    const geometry = await form.evaluate(node => { const title = node.querySelector('h2').getBoundingClientRect(); return { width: node.clientWidth, scroll: node.scrollWidth, document: document.documentElement.scrollWidth, viewport: innerWidth, titleTop: title.top, titleBottom: title.bottom, height: innerHeight, dialogScroll: node.closest('dialog').scrollTop }; }); assert.ok(geometry.scroll <= geometry.width + 1 && geometry.document <= geometry.viewport + 1, JSON.stringify(geometry)); await shot(page, 'review-' + width); assert.ok(geometry.titleTop >= 0 && geometry.titleBottom <= geometry.height, 'The review heading and context must be visible when the modal opens: ' + JSON.stringify(geometry));
    await form.locator('button[type="submit"]').click(); assert.equal(requests.length, 0);
  });
  await check('One completed approval submits the combined contract once and then shows automatic progress', async () => {
    const { page, requests } = await fixture(); await page.locator('[data-connection="review_setup"]').click(); const form = page.locator('#connectionForm');
    for (const [name, value] of Object.entries({ ein: '92-1234567', street: '123 Fixture Street', zip: '77057', title: 'Owner' })) await form.locator('[name="' + name + '"]').fill(value);
    for (const box of await form.locator('input[type="checkbox"]').all()) await box.check(); await form.locator('button[type="submit"]').click(); await form.waitFor({ state: 'hidden' });
    assert.equal(requests.length, 1); const body = requests[0]; assert.equal(body.action, 'request_service_onboarding'); for (const name of ['acceptedCosts', 'authority', 'attestLegalAccuracy', 'attestConsent', 'testPhoneConsent']) assert.equal(body[name], true); assert.equal(body.legal.ein, '92-1234567'); assert.equal(body.forwardingMode, 'use_new_number');
    await page.locator('#connectionForm').waitFor({ state: 'detached' }); assert.equal(await page.locator('[name="ein"]').count(), 0); assert.equal(await page.locator('[name="firstName"]').count(), 0);
    assert.equal(await page.locator('[data-connection="review_setup"]').count(), 0); assert.equal(await page.locator('[data-connection="cancel_setup"]').count(), 1); assert.match(await page.locator('.connection-plan').innerText(), /Number request saved|number request is saved/); assert.equal(await page.locator('[data-connection="review_voice"], [data-connection="review_sms"]').count(), 0);
  });
  await check('Back and native dialog close remove unsaved registration fields; reopening starts without the EIN', async () => {
    const { page, requests } = await fixture();
    for (const close of ['back', 'native']) {
      await page.locator('[data-connection="review_setup"]').click(); await page.locator('[name="ein"]').fill('92-1234567');
      if (close === 'back') await page.locator('#connectionBack').click(); else await page.locator('dialog.walkthrough').evaluate(node => node.close());
      await page.locator('#connectionForm').waitFor({ state: 'detached' }); assert.equal(await page.locator('[name="ein"]').count(), 0); assert.equal(await page.locator('[name="email"]').count(), 0); assert.equal(requests.length, 0);
      await page.locator('[data-connection="review_setup"]').click(); assert.equal(await page.locator('[name="ein"]').inputValue(), ''); await page.locator('#connectionBack').click(); await page.locator('#connectionForm').waitFor({ state: 'detached' });
    }
  });
  await check('Closed platform shows saved preferences and no action that collects carrier legal data', async () => {
    const data = dto(); data.serviceOnboarding.available = false; data.serviceOnboarding.offer = null; const { page, requests } = await fixture(data); assert.equal(await page.locator('[data-connection="review_setup"]').count(), 0); assert.match(await page.locator('.connection-plan').innerText(), /not available yet|nothing is being purchased/); assert.equal(await page.locator('[name="ein"]').count(), 0); assert.equal(requests.length, 0);
  });
  await check('Safe pre-dispatch changed setup offers a concrete updated review action', async () => {
    const data = dto(); data.serviceOnboarding.operation = { id: 'fixture-operation', state: 'needs_review', canReview: true, nextAction: 'review_current_offer', cancellationRequested: false, detail: 'Review your current business setup.' }; const { page } = await fixture(data); assert.equal(await page.locator('[data-connection="review_setup"]').count(), 1); assert.match(await page.locator('[data-connection="review_setup"]').innerText(), /updated setup/); await page.locator('[data-connection="review_setup"]').click(); await page.locator('#connectionForm').waitFor({ state: 'visible' });
  });
  await check('A coordinator requiring existing-connection repair retains its plan and exposes that next action', async () => {
    const data = dto(); data.serviceOnboarding.available = false; data.serviceOnboarding.legacySetup = true; data.serviceOnboarding.operation = { id: 'fixture-operation', state: 'needs_review', canReview: false, nextAction: 'review_existing_connections', numberRequested: true, voiceRequested: true, messagingRequested: false, cancellationRequested: false, detail: 'Review the existing phone connection.' }; data.phoneActivation.operation = { id: 'number', state: 'number_acquired' }; data.connections.voice.state = 'needs_review'; data.connections.voice.operation = { id: 'voice', state: 'needs_review', detail: 'Review the current phone rules.' };
    const { page } = await fixture(data); assert.equal(await page.locator('.connection-plan').count(), 1); assert.equal(await page.locator('[data-connection="review_setup"]').count(), 0); assert.equal(await page.locator('[data-connection="review_voice"]').count(), 1);
  });
} finally {
  for (const context of contexts) await context.close(); await browser.close(); report.after = Object.fromEntries(files.map(file => [file, hash(readFileSync(file))])); report.sourceStable = JSON.stringify(report.before) === JSON.stringify(report.after); report.summary = { passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, total: report.checks.length }; report.ok = !report.summary.failed && report.sourceStable && !report.physicalNetwork && !report.pageErrors.length;
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ ok: report.ok, summary: report.summary, sourceStable: report.sourceStable, failures: report.checks.filter(row => !row.pass), output }, null, 2)); if (!report.ok) process.exitCode = 1;
}
