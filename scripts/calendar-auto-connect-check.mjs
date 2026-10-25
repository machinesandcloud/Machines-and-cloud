// Browser callback continuation against the real owner/Google handlers. Storage,
// Google consent and provider responses are synthetic; physical networking is denied.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fixture } from './calendar-test-fixtures.mjs';

const WallDate = Date, hash = value => createHash('sha256').update(value).digest('hex');
const f = await fixture();
const clientHandler = (await import('../netlify/functions/client.mjs')).default;
const googleHandler = (await import('../netlify/functions/google.mjs')).default;
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const origin = 'https://calendar.example.test', local = 'http://127.0.0.1:8938';
const files = ['desk-connections.js', 'netlify/functions/client.mjs', 'netlify/functions/google.mjs', 'netlify/functions/lib/calendar-connection.mjs', 'netlify/functions/lib/calendar-delivery.mjs', 'netlify/functions/lib/calendar-execution.mjs', 'scripts/calendar-test-fixtures.mjs', 'scripts/calendar-auto-connect-check.mjs'];
const fingerprints = () => Object.fromEntries(files.map(file => [file, hash(readFileSync(file))]));
const before = fingerprints(), source = readFileSync('desk-connections.js'), checks = [], pageErrors = [], contexts = [], releases = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
let sequence = 0, physicalRequests = 0, dispatches = 0;
f.intercept(call => {
  if (call.url === origin + '/api/calendar-delivery-background') { dispatches++; return new Response(null, { status: 202 }); }
});
const check = async (name, run) => { try { await run(); checks.push({ name, pass: true }); } catch (error) { checks.push({ name, pass: false, error: error.message, stack: error.stack }); } };
async function seed() {
  const item = await f.seed('calendar-browser-' + ++sequence), token = hash('browser owner ' + sequence);
  item.client.onboarding.desiredChannels = ['calendar']; item.client.owner.name = 'Alex Fixture';
  await f.store.saveClient(item.client);
  await f.store.put('access_sessions', hash(token), { ...item.session, sessionHash: hash(token) });
  return { ...item, token };
}
async function post(item, body, token = item.token) {
  return clientHandler(new Request(origin + '/api/client?c=' + item.client.slug, { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
async function ownerData(item) {
  const response = await clientHandler(new Request(origin + '/api/client?c=' + item.client.slug, { headers: { Authorization: 'Bearer ' + item.token } }));
  assert.equal(response.status, 200, await response.clone().text()); return response.json();
}
async function grant(item) {
  const response = await post(item, { action: 'start_calendar_connection', availabilityConsentVersion:f.connection.CALENDAR_AVAILABILITY_CONSENT_VERSION, expectedRevision: configurationRevision(item.client) });
  assert.equal(response.status, 202, await response.clone().text());
  const { result } = await response.json(), state = new URL(result.authorizationUrl).searchParams.get('state');
  return { state, expiresAt: result.expiresAt, slug: item.client.slug, sessionBinding: hash(item.token) };
}
async function callback(item, receipt, values = { code: 'synthetic-code' }) {
  const result = await googleHandler(new Request(origin + '/api/google/callback?' + new URLSearchParams({ state: receipt.state, ...values })));
  assert.equal(result.status, 303, await result.clone().text());
  const destination = new URL(result.headers.get('Location'));
  return local + destination.pathname + destination.search + destination.hash;
}
async function pageFixture(item, { pending, token = item.token, failCompletion = false, pauseCompletion = false } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1024, height: 800 } }); contexts.push(context);
  await context.addInitScript(({ token, pending }) => {
    if (location.origin !== 'http://127.0.0.1:8938') return;
    if (!sessionStorage.getItem('fixture-initialized')) {
      if (token) sessionStorage.setItem('mc-onboarding-session-v1', token);
      if (pending) sessionStorage.setItem('mc-calendar-pending-v1', JSON.stringify(pending));
      sessionStorage.setItem('fixture-initialized', 'true');
    }
  }, { token, pending });
  await context.routeWebSocket('**/*', socket => { physicalRequests++; socket.close(); });
  const requests = [], navigations = []; let release = null, held = null;
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === 'https://accounts.google.com') { navigations.push(url.href); return route.fulfill({ contentType: 'text/html', body: '<h1>Simulated Google consent, no provider request.</h1>' }); }
    if (url.origin !== local) { physicalRequests++; return route.abort(); }
    if (url.pathname === '/desk-connections.js') return route.fulfill({ contentType: 'text/javascript', body: source });
    if (url.pathname === '/desk') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><button id="deskSignOut">Sign out</button><h1 id="status">Your front desk</h1><div id="channelStates"></div><div id="serviceConnections"></div><div id="connectionJourney"></div><p id="serviceConnectionMessage" role="status"></p><script src="/desk-connections.js"></script></body></html>' });
    if (url.pathname === '/api/client' && req.method() === 'POST') {
      const body = req.postDataJSON(); requests.push(body);
      assert.equal(url.searchParams.get('c'), item.client.slug);
      assert.equal(req.headers().authorization, 'Bearer ' + token);
      if (body.action === 'complete_calendar_connection' && pauseCompletion) {
        held = new Promise(resolve => { release = resolve; releases.push(resolve); }); await held;
      }
      const response = await post(item, body, token);
      if (body.action === 'complete_calendar_connection' && failCompletion) return route.abort('failed');
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    }
    return route.fulfill({ status: 404, body: 'Unknown local fixture' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', error => pageErrors.push(error.message));
  return { page, requests, navigations, emit: async (data = null) => page.evaluate(data => document.dispatchEvent(new CustomEvent('mc:desk', { detail: data })), data || await ownerData(item)), release: () => release?.() };
}
const completionCount = view => view.requests.filter(row => row.action === 'complete_calendar_connection').length;
async function settle(page) { await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 60))); }
async function waitForMessage(page, expression) { await page.waitForFunction(pattern => new RegExp(pattern).test(document.getElementById('serviceConnectionMessage').textContent), expression); }

try {
  await check('Starting Calendar records only a fresh state, slug, expiry and non-secret owner-session binding before the Google redirect', async () => {
    const item = await seed(), view = await pageFixture(item); await view.page.goto(local + '/desk?c=' + item.client.slug); await view.emit();
    await view.page.locator('[data-connection="start_calendar"]').click();
    const disclosure = view.page.locator('#calendarAccessDisclosure');
    assert.equal(await disclosure.getAttribute('data-disclosure-version'), '2026-10-24-busy-v1');
    assert.match(await disclosure.innerText(), /read busy intervals/i);
    assert.equal(view.requests.length, 0, 'Access disclosure precedes any Calendar request');
    await Promise.all([view.page.waitForURL('https://accounts.google.com/**'), view.page.getByRole('button', { name: 'Continue to Google', exact: true }).click()]);
    assert.equal(view.requests.length, 1); assert.equal(view.requests[0].action, 'start_calendar_connection');
    await view.page.goto(local + '/desk?c=' + item.client.slug);
    const pending = await view.page.evaluate(() => JSON.parse(sessionStorage.getItem('mc-calendar-pending-v1')));
    assert.deepEqual(Object.keys(pending).sort(), ['expiresAt', 'sessionBinding', 'slug', 'state']); assert.equal(pending.slug, item.client.slug); assert.equal(pending.sessionBinding, hash(item.token)); assert.match(pending.state, /^[a-f0-9]{64}$/); assert.ok(Date.parse(pending.expiresAt) > Date.now());
    assert.ok(!JSON.stringify(pending).includes(item.token)); assert.equal(f.requests.filter(row => row.url.endsWith('/token')).length, 0);
  });
  await check('A valid same-session Google consent return connects automatically through the real authenticated handler once, with PKCE and encrypted credentials', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item, { pending: receipt });
    const before = f.requests.length, priorDispatches = dispatches;
    await view.page.goto(await callback(item, receipt)); assert.equal(new URL(view.page.url()).hash, '#setup'); assert.ok(!view.page.url().includes('synthetic-code')); assert.equal(view.requests.length, 0);
    await view.emit(); await waitForMessage(view.page, 'Google Calendar is connected');
    assert.equal(completionCount(view), 1); assert.equal(dispatches, priorDispatches + 1); assert.equal((await f.connection.calendarConnectionView(item.client)).connected, true);
    assert.equal(await view.page.locator('[data-connection="finish_calendar"]').count(), 0); assert.equal(await view.page.locator('[data-connection="disconnect_calendar"]').count(), 1);
    const row = await f.store.get('calendar_connections', item.client.slug); assert.ok(row.refresh.iv && row.refresh.tag && row.refresh.data); assert.ok(!JSON.stringify(row).includes('dummy-private-refresh'));
    const calls = f.requests.slice(before), token = calls.find(row => row.url.endsWith('/token')), state = await f.store.get('calendar_oauth', hash(receipt.state));
    assert.equal(state.state, 'consumed'); assert.match(new URLSearchParams(token.body).get('code_verifier'), /^[A-Za-z0-9_-]{64}$/);
    assert.equal(await view.page.evaluate(() => sessionStorage.getItem('mc-calendar-pending-v1')), null);
    await view.emit(); await view.emit(); await settle(view.page); assert.equal(completionCount(view), 1);
    await view.page.reload(); await view.emit(); await settle(view.page); assert.equal(completionCount(view), 1);
    assert.ok(!await view.page.evaluate(() => JSON.stringify({ body: document.body.innerHTML, storage: { ...sessionStorage }, url: location.href }).includes('dummy-private-refresh')));
  });
  await check('A saved Google permission with exhausted delivery allowance shows the server waiting detail, not a future-sync promise', async () => {
    const item = await seed();
    f.policies.get(item.client.slug).limits.calendarRead = 1; await f.approve(item.client);
    const receipt = await grant(item), view = await pageFixture(item, { pending: receipt });
    await view.page.goto(await callback(item, receipt)); await view.emit(); await waitForMessage(view.page, 'Google Calendar is connected');
    const current = await ownerData(item), message = await view.page.locator('#serviceConnectionMessage').innerText();
    assert.equal(current.connections.calendar.connected, true); assert.equal(current.connections.calendar.available, false);
    assert.ok(message.includes(current.connections.calendar.detail)); assert.doesNotMatch(message, /Future saved visits will sync|Future saved visits sync/);
    assert.equal(completionCount(view), 1);
  });
  await check('Consent denial is completed automatically without token exchange or a false connected success message', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item, { pending: receipt }), before = f.requests.length;
    await view.page.goto(await callback(item, receipt, { error: 'access_denied' })); await view.emit(); await waitForMessage(view.page, 'access was not granted');
    assert.equal(completionCount(view), 1); assert.equal(f.requests.slice(before).filter(row => new URL(row.url).origin !== origin).length, 0); assert.equal((await f.connection.calendarConnectionView(item.client)).connected, false);
    assert.equal((await f.store.get('calendar_oauth', hash(receipt.state))).state, 'denied'); assert.equal(await view.page.locator('[data-connection="start_calendar"]').count(), 1);
  });
  await check('A missing browser receipt never submits the Google callback', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item);
    await view.page.goto(await callback(item, receipt)); await view.emit(); await settle(view.page); assert.equal(completionCount(view), 0); assert.equal((await f.store.get('calendar_oauth', hash(receipt.state))).state, 'pending');
    assert.match(await view.page.locator('#serviceConnectionMessage').innerText(), /could not be matched/);
  });
  await check('A different valid owner session cannot automatically process the original sign-in callback', async () => {
    const item = await seed(), receipt = await grant(item), other = hash('second same-mailbox bearer');
    await f.store.put('access_sessions', hash(other), { ...item.session, sessionHash: hash(other) });
    const view = await pageFixture(item, { pending: receipt, token: other }); await view.page.goto(await callback(item, receipt)); await view.emit(); await waitForMessage(view.page, 'belongs to another session');
    assert.equal(completionCount(view), 0); assert.equal((await f.store.get('calendar_oauth', hash(receipt.state))).state, 'pending'); assert.equal(await view.page.locator('[data-connection="finish_calendar"]').count(), 0);
    assert.equal((await post(item, { action: 'complete_calendar_connection', state: receipt.state, code: 'synthetic-code' }, other)).status, 410);
  });
  for (const kind of ['different_slug', 'different_state', 'expired_receipt', 'duplicate_state', 'code_and_denial']) await check(kind + ': callback cannot auto-submit or exchange a code', async () => {
    const item = await seed(), receipt = await grant(item), pending = { ...receipt };
    if (kind === 'different_slug') pending.slug = 'another-workspace';
    if (kind === 'different_state') pending.state = 'f'.repeat(64);
    if (kind === 'expired_receipt') pending.expiresAt = '2000-01-01T00:00:00Z';
    const view = await pageFixture(item, { pending }); let url = await callback(item, receipt);
    if (kind === 'duplicate_state') url += '&calendar_state=' + receipt.state;
    if (kind === 'code_and_denial') url += '&calendar_error=access_denied';
    const before = f.requests.length; await view.page.goto(url); await view.emit(); await settle(view.page); assert.equal(completionCount(view), 0); assert.equal(f.requests.length, before); assert.equal((await f.store.get('calendar_oauth', hash(receipt.state))).state, 'pending');
  });
  await check('Legacy browser receipts retain an explicit completion action, protected by the same real server checks', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item, { pending: { slug: receipt.slug, state: receipt.state } });
    await view.page.goto(await callback(item, receipt)); await view.emit(); await settle(view.page); assert.equal(completionCount(view), 0); await view.page.locator('[data-connection="finish_calendar"]').click(); await waitForMessage(view.page, 'Google Calendar is connected'); assert.equal(completionCount(view), 1);
  });
  await check('An authenticated event for another workspace is not enough to automatically complete this return', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item, { pending: receipt }), data = await ownerData(item); data.client.slug = 'foreign-workspace';
    await view.page.goto(await callback(item, receipt)); await view.emit(data); await settle(view.page); assert.equal(completionCount(view), 0); await view.emit(); await waitForMessage(view.page, 'Google Calendar is connected'); assert.equal(completionCount(view), 1);
  });
  await check('Revoking the owner session before callback completion fails closed without token exchange', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item, { pending: receipt }), data = await ownerData(item), before = f.requests.length;
    await f.store.put('access_sessions', hash(item.token), { ...item.session, sessionHash: hash(item.token), status: 'revoked' });
    await view.page.goto(await callback(item, receipt)); await view.page.evaluate(() => document.addEventListener('mc:session-expired', () => { window.expired = true; })); await view.emit(data);
    await view.page.waitForFunction(() => window.expired); assert.equal(completionCount(view), 1); assert.equal(f.requests.length, before); assert.equal((await f.connection.calendarConnectionView(item.client)).connected, false);
  });
  for (const kind of ['server_expiry', 'newer_grant']) await check(kind + ': authoritative state checks override an otherwise matching browser receipt', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item, { pending: receipt }), url = await callback(item, receipt);
    if (kind === 'server_expiry') await f.store.atomicUpdate('calendar_oauth', hash(receipt.state), row => ({ value: { ...row, expiresAt: '2000-01-01T00:00:00Z' } }));
    else await grant(item);
    const before = f.requests.length;
    await view.page.goto(url); await view.emit(); await waitForMessage(view.page, 'expired, was already used, or belongs to another sign-in'); assert.equal(completionCount(view), 1); assert.equal(f.requests.length, before); assert.equal((await f.connection.calendarConnectionView(item.client)).connected, false);
    assert.equal(await view.page.locator('[data-connection="finish_calendar"]').count(), 0); assert.equal(await view.page.locator('[data-connection="start_calendar"]').count(), 1);
    await view.emit(); await settle(view.page); assert.equal(completionCount(view), 1);
  });
  await check('A lost browser completion response refreshes status and never automatically replays a one-use grant', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item, { pending: receipt, failCompletion: true });
    await view.page.goto(await callback(item, receipt)); await view.page.evaluate(() => document.addEventListener('mc:desk-refresh', () => { window.refreshes = (window.refreshes || 0) + 1; })); await view.emit();
    await view.page.waitForFunction(() => window.refreshes === 1); assert.equal((await f.connection.calendarConnectionView(item.client)).connected, true); await view.emit(); await settle(view.page); assert.equal(completionCount(view), 1); assert.equal(await view.page.locator('[data-connection="finish_calendar"]').count(), 0); assert.equal(await view.page.locator('[data-connection="disconnect_calendar"]').count(), 1); assert.equal(await view.page.evaluate(() => sessionStorage.getItem('mc-calendar-pending-v1')), null);
  });
  await check('Sign out during an in-flight continuation clears private UI and ignores the late response', async () => {
    const item = await seed(), receipt = await grant(item), view = await pageFixture(item, { pending: receipt, pauseCompletion: true });
    await view.page.goto(await callback(item, receipt)); await view.emit(); await view.page.waitForFunction(() => /Connecting your Google Calendar/.test(document.getElementById('serviceConnectionMessage').textContent));
    for (let tick = 0; tick < 50 && !completionCount(view); tick++) await settle(view.page);
    assert.equal(completionCount(view), 1);
    await view.page.locator('#deskSignOut').click(); view.release(); await settle(view.page); assert.equal(await view.page.locator('#serviceConnections').innerText(), ''); assert.equal(await view.page.locator('[data-connection="disconnect_calendar"]').count(), 0);
  });
} finally {
  for (const release of releases) release();
  for (const context of contexts) await context.close(); await browser.close();
  const after = fingerprints(), result = { at: new WallDate().toISOString(), scope: 'Local browser + actual client/Google handlers + memory store; Google/provider responses intercepted, zero live calls or emails.', before, after, sourceStable: JSON.stringify(before) === JSON.stringify(after), checks, pageErrors, physicalRequests, passed: checks.filter(row => row.pass).length, failed: checks.filter(row => !row.pass).length };
  result.ok = result.failed === 0 && result.sourceStable && !physicalRequests && !pageErrors.length;
  const index = process.argv.indexOf('--output'); if (index >= 0) writeFileSync(process.argv[index + 1], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1;
}
