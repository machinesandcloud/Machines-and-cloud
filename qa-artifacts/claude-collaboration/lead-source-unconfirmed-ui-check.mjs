// Causal browser check: when an Angi or Thumbtack setup change is saved by the actual handler but its
// response is lost, the setup window must offer a visible, enabled, keyboard-reachable "Check saved status"
// that reconciles the saved change (or offers "Retry the same request"), including after a reload.
// Normal confirmed stages must keep hiding that action as designed.
// Actual owner handlers in-process (every config.path the page calls), memory store, fake model; physical
// transport denied; Playwright route serves worktree files. No shared server, provider, email or OAuth.
// Usage (from the worktree root):
//   node qa-artifacts/claude-collaboration/lead-source-unconfirmed-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-lead-<name>.json
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), origin = 'http://127.0.0.1:8923';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only');
if (!output || !/^scratchpad\/claude-lead-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-lead-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
const prefix = output.slice(0, -5);
// Optional: serve a proposed desk-lead-sources.js (e.g. a scratch copy with Codex's patch) and assert focus lands on Check.
const overrideLeadJs = arg('--override-lead-js') ? resolve(arg('--override-lead-js')) : null;
const sha = value => createHash('sha256').update(value).digest('hex');
const watched = ['desk.html', 'desk.js', 'desk.css', 'desk-lead-sources.js', 'desk-lead-sources.css', 'desk-setup-guide.js', 'desk-setup-guide.css', 'netlify/functions/client.mjs'];
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; physical transport denied', sourceHashes: Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))])), checks: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Lead-source check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../netlify/functions/lib/config.mjs');
// Every handler whose config.path the desk page can call for these flows.
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve']) {
  const mod = await import('../../netlify/functions/' + file + '.mjs');
  if (mod.config?.path) handlers[mod.config.path] = mod.default;
}
report.handlers = Object.keys(handlers); report.overrideLeadJs = overrideLeadJs; report.browser = process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome';

const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
let serial = 0; const contexts = [];

async function fixture(width, height, site = origin) {
  const origin = site;
  const slug = 'lead-ui-' + ++serial + '-' + width, token = sha('lead-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Lead Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'angi', 'thumbtack'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(7000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  const state = { loseNext: null, holdNext: null, requests: [] };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action, operation: body?.operation, source: body?.source, operationId: body?.operationId };
      state.requests.push(item); report.requests.push(item);
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      item.status = response.status; const bytes = Buffer.from(await response.arrayBuffer()); if (response.status >= 400) item.errorBody = bytes.toString('utf8').slice(0, 300);
      // Lost response: the actual handler has already processed (and saved) the change.
      // Held response: the handler has processed it; the browser waits until the check releases it.
      if (state.holdNext && state.holdNext(method, body)) { state.holdNext = null; item.held = true; await new Promise(release => { state.release = release; }); state.release = null; }
      if (method === 'POST' && state.loseNext && state.loseNext(body)) { state.loseNext = null; item.lostAfterEffect = true; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    if (overrideLeadJs && url.pathname === '/desk-lead-sources.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(overrideLeadJs) });
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  await page.goto(origin + '/desk.html?c=' + slug); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, c, slug, token, state, context, width };
}

async function check(name, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length;
  try { await run(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (error) {
    const entry = { name, pass: false, error: String(error.stack || error).slice(0, 2500) }; report.checks.push(entry); console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]);
    const page = contexts.at(-1)?.pages().at(-1);
    if (page) { entry.dialog = await dialogState(page).catch(() => null); await shot(page, 'failure-' + report.checks.length).catch(() => {}); }
  } finally { await Promise.all(contexts.slice(start).map(context => context.close())); }
}
async function shot(page, name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path }); report.screenshots.push(path); return path; }
async function dialogState(page) {
  return page.evaluate(() => {
    const d = document.getElementById('leadSourceDialog'), check = document.getElementById('leadSourceCheck'), retry = document.getElementById('leadSourceRetry'), status = document.getElementById('leadSourceStatus');
    const visible = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
    return { focus: document.activeElement?.id || document.activeElement?.tagName, open: !!d?.open, stage: d?.dataset.connectorStage, busy: d?.getAttribute('aria-busy'), check: { visible: visible(check), disabled: !!check?.disabled, hiddenAttr: !!check?.hidden, display: check && getComputedStyle(check).display }, retry: { visible: visible(retry), disabled: !!retry?.disabled }, status: { visible: visible(status), text: status?.textContent || '' }, enabledVisibleButtons: [...(d?.querySelectorAll('button') || [])].filter(b => visible(b) && !b.disabled).map(b => b.textContent.trim()), scroll: { doc: document.documentElement.scrollWidth, vw: innerWidth } };
  });
}
async function noHorizontalScroll(page) { const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, dialog: (() => { const d = document.getElementById('leadSourceDialog'); return d?.open ? { scroll: d.scrollWidth, client: d.clientWidth } : null; })() })); assert.ok(v.doc <= v.vw + 1 && (!v.dialog || v.dialog.scroll <= v.dialog.client + 1), 'Horizontal scroll ' + JSON.stringify(v)); }

async function openConnector(x, label) {
  const { page } = x;
  await page.locator('.tabs [data-t="setup"]').click().catch(() => {});
  if (x.width < 600) {
    const select = page.locator('.setup-guide-mobile select').filter({ visible: true });
    if (await select.count()) { await select.first().selectOption({ label }).catch(async () => { const v = await select.first().evaluate((s, l) => [...s.options].find(o => o.textContent.trim().startsWith(l))?.value, label); await select.first().selectOption(v); }); }
    else await page.getByRole('button', { name: label }).filter({ visible: true }).first().click();
  } else await page.getByRole('button', { name: label }).filter({ visible: true }).first().click();
  await page.locator('#connectorStart').filter({ visible: true }).waitFor();
  await page.locator('#connectorStart').click();
}
const dialogOpen = page => page.locator('#leadSourceDialog[open]').waitFor();
async function waitStage(page, stage) { await page.waitForFunction(s => document.getElementById('leadSourceDialog')?.dataset.connectorStage === s && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false', stage); }

// Asserts the unconfirmed state offers a usable recovery and reconciles through it.
async function assertRecoverable(x, label, { expectSavedSource, expectOperationId }) {
  const { page } = x;
  const s = await dialogState(page);
  report.observations = (report.observations || []).concat({ label, width: x.width, state: s });
  await shot(page, label + '-' + x.width);
  assert.ok(s.open, 'dialog closed');
  assert.ok(s.check.visible, 'Check saved status is not visible while the change is unconfirmed: ' + JSON.stringify(s));
  assert.ok(!s.check.disabled, 'Check saved status is disabled while unconfirmed');
  assert.ok(s.status.visible && /confirm/i.test(s.status.text), 'Unconfirmed status message is not visible: ' + JSON.stringify(s.status));
  await noHorizontalScroll(page);
  // Keyboard reachability: Tab from Exit setup must reach Check saved status.
  await page.locator('#leadSourceClose').focus();
  let reached = false; for (let i = 0; i < 40 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.id === 'leadSourceCheck'); }
  assert.ok(reached, 'Check saved status is not reachable by keyboard');
  const before = x.state.requests.filter(r => r.method === 'GET').length;
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false' && !/Checking saved/.test(document.getElementById('leadSourceStatus').textContent));
  assert.ok(x.state.requests.filter(r => r.method === 'GET').length > before, 'Check did not read saved status');
  const after = await dialogState(page);
  const saved = (await store.get('clients', x.slug))?.leadConnections?.[expectSavedSource] || null;
  report.observations.push({ label: label + '-after-check', width: x.width, state: after });
  assert.ok(/Your connection setup is saved/.test(after.status.text) || after.retry.visible && !after.retry.disabled, 'Check did not reconcile or offer retry: ' + JSON.stringify(after));
  if (/Your connection setup is saved/.test(after.status.text)) {
    // The request stage hides its status line by design after any confirmed save (normal success too); record it.
    (report.savedMessageVisibility ||= []).push({ label, width: x.width, stage: after.stage, visible: after.status.visible });
    if (after.stage === 'account') assert.ok(after.status.visible, 'Saved confirmation not visible');
    const lockedInputs = await page.evaluate(() => [...document.querySelectorAll('#leadSourceDialog input,#leadSourceDialog button')].filter(n => n.getClientRects().length && n.disabled && !['leadSourceRotate', 'leadSourceDisconnect', 'leadSourceAIEnable', 'leadSourceAIDisable'].includes(n.id)).map(n => n.id || n.textContent.trim()));
    assert.deepEqual(lockedInputs, [], 'Controls stay locked after reconciliation');
    // Once confirmed, the stage returns to its designed layout: no Check saved status in account/request/permission.
    if (['account', 'request', 'permission'].includes(after.stage)) assert.ok(!after.check.visible, 'Check saved status should hide again once the change is confirmed: ' + JSON.stringify(after));
  }
  await shot(page, label + '-after-check-' + x.width);
  return { after, saved };
}
async function assertConfirmedHidden(page, why) {
  const s = await dialogState(page);
  assert.ok(!s.check.visible, 'Check saved status should stay hidden in the confirmed ' + why + ' stage: ' + JSON.stringify(s));
}

async function angiAccountLoss(width, height, reload) {
  const x = await fixture(width, height), { page } = x;
  await openConnector(x, 'Angi'); await dialogOpen(page); await waitStage(page, 'account');
  await assertConfirmedHidden(page, 'Angi account');
  await page.fill('#leadSourceBusiness', '55501234');
  x.state.loseNext = body => body?.source === 'angi' && body?.operation === 'prepare';
  await page.locator('#leadSourcePrepare').click();
  await page.waitForFunction(() => /couldn.t confirm/.test(document.getElementById('leadSourceStatus').textContent) && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
  assert.ok(x.state.requests.some(r => r.lostAfterEffect && r.operation === 'prepare' && r.status === 200), 'Actual handler must have processed the lost request');
  if (reload) {
    await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    await page.waitForFunction(() => document.getElementById('leadSourceDialog')?.open || true);
    if (!await page.locator('#leadSourceDialog[open]').count()) await openConnector(x, 'Angi');
    await dialogOpen(page); await page.waitForFunction(() => document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
  }
  return assertRecoverable(x, 'angi-account' + (reload ? '-reload' : ''), { expectSavedSource: 'angi' });
}

for (const [width, height] of [[1440, 900], [390, 844]]) {
  await check(`angi account stage lost response recovers (${width})`, async () => { await angiAccountLoss(width, height, false); });
  await check(`angi account stage lost response recovers after reload (${width})`, async () => { await angiAccountLoss(width, height, true); });
  await check(`angi request stage "I sent this request" lost response recovers, with reload (${width})`, async () => {
    const x = await fixture(width, height), { page } = x;
    await openConnector(x, 'Angi'); await dialogOpen(page); await waitStage(page, 'account');
    await page.fill('#leadSourceBusiness', '55501234'); await page.locator('#leadSourcePrepare').click();
    await waitStage(page, 'request');
    await assertConfirmedHidden(page, 'Angi request');
    await shot(page, 'angi-request-confirmed-' + width);
    x.state.loseNext = body => body?.source === 'angi' && body?.operation === 'report_request_sent';
    await page.locator('#leadSourceReportSent').click();
    await page.waitForFunction(() => /couldn.t confirm/.test(document.getElementById('leadSourceStatus').textContent) && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
    const s = await dialogState(page); report.observations = (report.observations || []).concat({ label: 'angi-request-lost-no-reload', width, state: s }); await shot(page, 'angi-request-lost-' + width);
    assert.ok(s.check.visible && !s.check.disabled, 'Check saved status not usable at request stage before reload: ' + JSON.stringify(s));
    await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    if (!await page.locator('#leadSourceDialog[open]').count()) await openConnector(x, 'Angi');
    await dialogOpen(page); await page.waitForFunction(() => document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
    await assertRecoverable(x, 'angi-request-reload', { expectSavedSource: 'angi' });
  });
  await check(`thumbtack partner request lost response recovers, with reload (${width})`, async () => {
    const x = await fixture(width, height), { page } = x;
    await openConnector(x, 'Thumbtack'); await dialogOpen(page);
    await page.locator('#selfServeNative').click();
    await waitStage(page, 'account');
    await assertConfirmedHidden(page, 'Thumbtack partner account');
    assert.match(await page.locator('#leadSourcePrepare').textContent(), /Request Thumbtack setup/);
    x.state.loseNext = body => body?.source === 'thumbtack';
    await page.locator('#leadSourcePrepare').click();
    await page.waitForFunction(() => /couldn.t confirm/.test(document.getElementById('leadSourceStatus').textContent) && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
    const s = await dialogState(page); report.observations = (report.observations || []).concat({ label: 'thumbtack-lost-no-reload', width, state: s }); await shot(page, 'thumbtack-lost-' + width);
    assert.ok(s.check.visible && !s.check.disabled, 'Check saved status not usable on Thumbtack partner request: ' + JSON.stringify(s));
    await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    if (!await page.locator('#leadSourceDialog[open]').count()) await openConnector(x, 'Thumbtack');
    await dialogOpen(page); await page.waitForFunction(() => document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
    await assertRecoverable(x, 'thumbtack-reload', { expectSavedSource: 'thumbtack' });
  });
}

// --- In-flight, spacing, focus-observation and permission-stage cases (QA round 2) ---
async function holdThen(x, predicate, click, label) {
  const { page } = x; x.state.holdNext = predicate;
  await click();
  await page.waitForFunction(() => document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'true');
  for (let i = 0; i < 50 && !x.state.release; i++) await page.waitForTimeout(20);
  assert.ok(x.state.release, 'response was not held');
  const s = await dialogState(page); (report.observations ||= []).push({ label, width: x.width, state: s });
  await shot(page, label + '-' + x.width);
  x.state.release(); await page.waitForFunction(() => document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
  return s;
}
async function linkGap(page) {
  return page.evaluate(() => { const a = document.getElementById('leadSourceCheck').getBoundingClientRect(), b = document.getElementById('leadSourceConnectionReview').getBoundingClientRect(); const sameLine = Math.abs(a.top - b.top) < Math.min(a.height, b.height) / 2; return { sameLine, gap: sameLine ? b.left - a.right : b.top - a.bottom, check: [a.left, a.right, a.top], review: [b.left, b.right, b.top] }; });
}
for (const [width, height] of [[1440, 900], [390, 844]]) {
  await check(`normal in-flight saves keep Check saved status hidden (account and request stages) (${width})`, async () => {
    const x = await fixture(width, height), { page } = x;
    await openConnector(x, 'Angi'); await dialogOpen(page); await waitStage(page, 'account');
    await page.fill('#leadSourceBusiness', '55501234');
    const a = await holdThen(x, (m, b) => m === 'POST' && b?.operation === 'prepare', () => page.locator('#leadSourcePrepare').click(), 'inflight-account');
    assert.ok(!a.check.visible, 'Check saved status flashes during a normal Prepare save: ' + JSON.stringify(a));
    await waitStage(page, 'request'); await assertConfirmedHidden(page, 'Angi request after normal save');
    const r = await holdThen(x, (m, b) => m === 'POST' && b?.operation === 'report_request_sent', () => page.locator('#leadSourceReportSent').click(), 'inflight-request');
    assert.ok(!r.check.visible, 'Check saved status flashes during a normal "I sent this request" save: ' + JSON.stringify(r));
    assert.ok(!r.status.visible, 'Request-stage status line (hidden by design) flashes during a normal save: ' + JSON.stringify(r.status));
    assert.ok(x.state.requests.filter(q => q.held).length === 2);
  });
  await check(`unconfirmed request stage: links are spaced and check-in-flight is observed (${width})`, async () => {
    const x = await fixture(width, height), { page } = x;
    await openConnector(x, 'Angi'); await dialogOpen(page); await waitStage(page, 'account');
    await page.fill('#leadSourceBusiness', '55501234'); await page.locator('#leadSourcePrepare').click(); await waitStage(page, 'request');
    x.state.loseNext = b => b?.operation === 'report_request_sent';
    await page.locator('#leadSourceReportSent').click();
    await page.waitForFunction(() => /couldn.t confirm/.test(document.getElementById('leadSourceStatus').textContent) && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
    const focusAfterLoss = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    (report.focusAfterLostResponse ||= []).push({ width, stage: 'request', activeElement: focusAfterLoss });
    if (overrideLeadJs) assert.equal(focusAfterLoss, 'leadSourceCheck', 'Focus did not move to Check saved status after the lost response');
    const s = await dialogState(page); assert.ok(s.check.visible && !s.check.disabled, JSON.stringify(s));
    const review = await page.locator('#leadSourceConnectionReview').isVisible();
    if (review) { const g = await linkGap(page); (report.linkGaps ||= []).push({ width, ...g }); assert.ok(g.gap >= 8, 'Check saved status and the review link run together: ' + JSON.stringify(g)); }
    await shot(page, 'request-unconfirmed-links-' + width);
    // Observe (not assert) what the owner sees while their own status check is in flight.
    await page.locator('#leadSourceCheck').focus();
    const during = await holdThen(x, (m) => m === 'GET', () => page.keyboard.press('Enter'), 'check-inflight');
    (report.checkInFlight ||= []).push({ width, checkVisible: during.check.visible, checkDisabled: during.check.disabled, focusDuring: during.focus, focusAfter: await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName), statusAfter: (await dialogState(page)).status });
  });
}

// Permission stage: Thumbtack partner access is only "ready" when process.env.URL is the production
// origin and partner credentials exist (thumbtack-environment.mjs). Synthetic, non-secret placeholder
// values are set only for this case; start_thumbtack_connection builds an authorization address and
// makes no provider call. The browser never navigates to Thumbtack (any attempt is counted as forbidden).
const production = 'https://machinesandcloud.com';
const partnerEnv = { PUBLIC_SITE_URL: undefined, THUMBTACK_PARTNER_ENABLED: '1', THUMBTACK_CLIENT_ID: 'synthetic-qa-client', THUMBTACK_CLIENT_SECRET: 'synthetic-qa-placeholder', THUMBTACK_SCOPES: 'offline_access supply::messages.read', THUMBTACK_CLIENT_AUTH_METHOD: 'client_secret_basic', THUMBTACK_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), URL: production };
for (const [width, height] of [[1440, 900], [390, 844]]) {
  await check(`thumbtack permission stage lost authorization request recovers (${width})`, async () => {
    const saved = Object.fromEntries(Object.keys(partnerEnv).map(k => [k, process.env[k]]));
    for (const [k, v] of Object.entries(partnerEnv)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    try {
      // The page is served (by route interception only) at the production origin, because access.mjs only
      // accepts an http origin when URL is local, while partner readiness requires URL to be production.
      const x = await fixture(width, height, production), { page } = x;
      await openConnector(x, 'Thumbtack'); await dialogOpen(page);
      if (await page.locator('#selfServeNative').isVisible().catch(() => false)) await page.locator('#selfServeNative').click();
      x.state.loseNext = b => b?.action === 'start_thumbtack_connection';
      await page.waitForFunction(() => { const d = document.getElementById('leadSourceDialog'); return d.getAttribute('aria-busy') === 'false' && (d.dataset.connectorStage === 'permission' || /couldn.t confirm/.test(document.getElementById('leadSourceStatus').textContent)); });
      let stage = await page.evaluate(() => document.getElementById('leadSourceDialog').dataset.connectorStage);
      (report.permissionStage ||= []).push({ width, stageReached: stage });
      assert.equal(stage, 'permission', 'permission stage not reached');
      if (!/couldn.t confirm/.test(await page.locator('#leadSourceStatus').textContent())) {
        await assertConfirmedHidden(page, 'Thumbtack permission');
        await page.locator('#leadSourceAuthorize').click();
        await page.waitForFunction(() => /couldn.t confirm/.test(document.getElementById('leadSourceStatus').textContent) && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
      }
      assert.ok(x.state.requests.some(r => r.lostAfterEffect && r.action === 'start_thumbtack_connection' && r.status === 200), 'actual handler did not process the lost authorization request');
      await assertRecoverable(x, 'thumbtack-permission', { expectSavedSource: 'thumbtack' });
    } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
}

await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceHashesAfter = Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
report.globalAssertions = { physicalNetwork: report.physicalNetwork, forbidden: report.forbidden.length, pageErrors: report.pageErrors.length, sourceStable: JSON.stringify(report.sourceHashes) === JSON.stringify(report.sourceHashesAfter) };
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0;
report.checks.push({ name: 'no physical, forbidden requests or page errors', pass: globalsPass, ...(globalsPass ? {} : { error: JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors }) }) });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' -> ' + output);
process.exit(report.passed === report.total ? 0 : 1);
