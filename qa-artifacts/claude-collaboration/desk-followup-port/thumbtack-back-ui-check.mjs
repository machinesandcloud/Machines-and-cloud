// PORT SUITE COPY of qa/modal-probe-thumbtack.mjs (independent QA probe), made a required case. Only the root/import depth and the
// back3/fwd1 expectation changed: QA's original asserts the dialog stays open after the third Back, which dfb0ae78 itself does not
// do; the coordinator's accepted behaviour is dfb's: 3 -> 2 -> 1 inside the dialog, then the third Back exits to #setup/thumbtack/intro.
// INDEPENDENT QA PROBE (not product code). Harness lines 1-200 and finish block copied from qa-artifacts/claude-collaboration/connector-pages-ui-check.mjs (root/import paths adjusted); probe below is new.
// Browser check of the CURRENT connector pages (post 10-27 "Your connections / Choose a service" UI) for all six
// connectors: website chat, phone answering, text messaging, Google Calendar, Thumbtack, Angi.
// Actual owner handlers in-process (routed by each module's config.path), memory store, fake model, provider env
// deleted, physical transport denied, Playwright context.route serves this worktree's files. No shared server,
// provider, email, OAuth or purchase. Selectors and copy come from desk.html, desk.js and desk-*.js at HEAD.
// A synthetic PLATFORM_DATA_ENCRYPTION_KEY is set (as service-intake-check does) so private connection details can be
// saved in memory; it is not a provider credential. Lost responses are simulated after the actual handler has saved.
// Covered: list (1440/390/320), page opens, honest provider gating, save persistence across reload, lost response +
// recovery (website, phone/text review, lead source), return via hash in a fresh context, hygiene.
// Deliberately NOT asserted (known open defects): text messaging Home "Next: You"; Quick tour returning to Home.
// Reconnect after a lead-source disconnect is covered by lead-source-reconnect-ui-check.mjs. New defects found are
// expectedFail() entries: they pass while the defect reproduces and FAIL once it is fixed, so they get promoted.
// Promoted 2026-11-09 (lead reconnect batch): focus after "Request connection review", after Thumbtack "Set up lead
// notifications", and after a lost Angi save are now required passes.
// Usage (from the worktree root):
//   MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell> node qa-artifacts/claude-collaboration/connector-pages-ui-check.mjs \
//     --playwright <playwright/index.mjs> --output scratchpad/claude-connector-pages-<name>.json [--only <substring>]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), origin = 'http://127.0.0.1:8931';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only'), explore = process.argv.includes('--explore');
if (!output || !/^scratchpad\/claude-connector-pages-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-connector-pages-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const watched = ['desk.html', 'desk.js', 'desk.css', 'desk-setup-guide.js', 'desk-setup-guide.css', 'desk-connections.js', 'desk-connections.css', 'desk-lead-sources.js', 'desk-lead-sources.css', 'desk-website-install.js', 'desk-service-intake.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/connection-journey.mjs', 'netlify/functions/lib/desk.mjs', 'qa-artifacts/claude-collaboration/connector-pages-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', sourceBefore: hashes(), checks: [], expectedFailures: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin, PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }); // synthetic at-rest key (not a provider), as in service-intake-check
const deny = () => { report.physicalNetwork++; throw new Error('Connector pages check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../netlify/functions/lib/config.mjs');
// Every handler whose config.path the desk can call (desk*.js fetches /api/client, /api/access, /api/workspace-billing,
// /api/angi, /api/thumbtack*, /api/google/*, /api/chat; onboard and website-installation are included for completeness).
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect', 'google', 'chat', 'website-installation']) {
  const mod = await import('../../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
report.handlers = Object.keys(handlers); report.browser = process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome';

const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
let serial = 0; const contexts = [];
const LABELS = { web: 'Website chat', voice: 'Phone answering', sms: 'Text messaging', calendar: 'Google Calendar', thumbtack: 'Thumbtack', angi: 'Angi' };
const SERVICES = Object.keys(LABELS);
const SELECTED = ['web', 'voice', 'sms', 'calendar', 'angi'];   // Thumbtack deliberately not selected.

async function seed(width, { channels = SELECTED, configure } = {}) {
  const slug = 'conn-ui-' + ++serial + '-' + width, token = sha('conn-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Connector Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture-shop.example.com' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: channels }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  if (configure) await configure(c);
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, c, width };
}
async function open(x, { height = 900, hash = '' } = {}) {
  const { slug, token, width } = x;
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(7000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; if (!sessionStorage.getItem('mc-onboarding-session-v1')) sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  const state = x.state || (x.state = { lose: null, requests: [] });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === 'https://accounts.google.com') { (report.oauthNavigation ||= []).push(url.href); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Intercepted Google boundary</title>' }); }
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      const action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, query: url.search, method, action, operation: body?.operation, source: body?.source, service: body?.service };
      state.requests.push(item); report.requests.push(item);
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      item.status = response.status; const bytes = Buffer.from(await response.arrayBuffer());
      // Lost response: the actual handler has already processed (and saved) the change; the browser sees a network failure.
      if (method !== 'GET' && state.lose && state.lose(body, item)) { state.lose = null; item.lostAfterEffect = true; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  await page.goto(origin + '/desk.html?c=' + slug + hash); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  Object.assign(x, { page, context });
  return x;
}


// ---------- helpers ----------
const coverage = {};   // connector -> aspect -> [check names]
function cover(services, aspect, name) { for (const s of [].concat(services)) ((coverage[s] ||= {})[aspect] ||= []).push(name); }
async function check(name, services, aspect, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length, t0 = Date.now();
  try { await run(); report.checks.push({ name, pass: true, ms: Date.now() - t0 }); cover(services, aspect, name); console.log('PASS ' + name); }
  catch (error) {
    const entry = { name, pass: false, ms: Date.now() - t0, error: String(error.stack || error).slice(0, 2500) }; report.checks.push(entry); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]);
    const page = contexts.at(-1)?.pages().at(-1);
    if (page) { entry.state = await snapshot(page).catch(() => null); entry.screenshot = await shot(page, 'failure-' + report.checks.length).catch(() => null); }
  } finally { await Promise.all(contexts.slice(start).map(context => context.close().catch(() => {}))); }
}
// Known defect not yet fixed: the assertion must FAIL today. If it passes, the entry fails so it gets promoted.
async function expectedFail(name, services, aspect, defect, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length;
  try {
    let evidence = null;
    try { await run(e => { evidence = e; }); }
    catch (error) {
      const page = contexts.at(-1)?.pages().at(-1);
      const entry = { name, defect, observed: String(error.message).split('\n')[0], evidence, screenshot: page ? await shot(page, 'xfail-' + (report.expectedFailures.length + 1)).catch(() => null) : null };
      report.expectedFailures.push(entry); report.checks.push({ name: 'XFAIL ' + name, pass: true, expectedFailure: true }); cover(services, aspect, 'XFAIL ' + name); console.log('XFAIL ' + name + ': ' + entry.observed); return;
    }
    report.checks.push({ name: 'XFAIL ' + name, pass: false, error: 'Expected-fail assertion now passes; promote it to a normal check. Defect: ' + defect }); console.log('XPASS ' + name);
  } finally { await Promise.all(contexts.slice(start).map(context => context.close().catch(() => {}))); }
}
async function shot(page, name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); return path; }
async function snapshot(page) {
  return page.evaluate(() => {
    const vis = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
    const host = document.getElementById('setupGuide');
    return { hash: location.hash, active: document.body.dataset.activePage, view: host?.dataset.connectorView, focus: document.activeElement?.id || document.activeElement?.tagName, heading: document.getElementById('setupGuideStageTitle')?.textContent, text: host?.innerText.slice(0, 1500), controls: [...(host?.querySelectorAll('button,a') || [])].filter(vis).map(b => (b.id || b.tagName) + ':' + b.textContent.trim().slice(0, 50)), dialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.id + ':' + d.innerText.slice(0, 600)) };
  });
}
async function noHorizontalScroll(page, where) {
  const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, vw: innerWidth, dialogs: [...document.querySelectorAll('dialog[open]')].map(d => ({ id: d.id, scroll: d.scrollWidth, client: d.clientWidth })) }));
  assert.ok(v.doc <= v.vw + 1 && v.body <= v.vw + 1 && v.dialogs.every(d => d.scroll <= d.client + 1), 'Horizontal scroll at ' + where + ': ' + JSON.stringify(v));
}
const ready = page => page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
async function list(page) {
  await page.locator('#setupGuide[data-connector-view="overview"] [data-guide-service]').first().waitFor();
  return page.evaluate(() => {
    return [...document.querySelectorAll('#setupGuide [data-guide-service]')].map(b => { const st = b.querySelector('.connector-choice-status'), cs = st && getComputedStyle(st), r = b.getBoundingClientRect(); return { id: b.dataset.guideService, label: b.querySelector('.brand-lockup')?.textContent.trim(), status: st?.textContent.trim(), statusVisible: !!st && st.getClientRects().length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.5, fontSize: cs ? parseFloat(cs.fontSize) : 0, clipped: !!st && st.scrollWidth > st.clientWidth + 1, inViewport: r.left >= -1 && r.right <= innerWidth + 1, height: r.height, contrast: st ? contrast(st) : 0 }; });
    function rgb(v) { const m = v.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return { c: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; }
    function lum(c) { return c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
    function contrast(n) { const fg = rgb(getComputedStyle(n).color).c; let e = n, bg = null; while (e && !bg) { const b = rgb(getComputedStyle(e).backgroundColor); if (b.a > 0.9) bg = b.c; e = e.parentElement; } bg ||= [255, 255, 255]; const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return Math.round((a + 0.05) / (b + 0.05) * 100) / 100; }
  });
}
async function statusOf(page, id) { return (await list(page)).find(r => r.id === id)?.status; }
async function openService(page, id) {
  await page.locator('[data-guide-service="' + id + '"]').click();
  await page.waitForFunction(id => document.getElementById('setupGuide')?.dataset.connectorView === 'step' && document.getElementById('setupGuide').dataset.guideSelectedService === id && !!document.getElementById('setupGuideStageTitle'), id);
}
async function backToList(page) { await page.locator('#connectorAllServices').click(); await page.locator('#setupGuide[data-connector-view="overview"]').waitFor(); }
const primaryButtons = page => page.evaluate(() => [...document.querySelectorAll('#setupGuide .connector-page .btn-pill-blue')].filter(b => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden').map(b => b.textContent.trim()));
async function dto(x) { const r = await handlers['/api/client'](new Request(origin + '/api/client?c=' + x.slug, { headers: { origin, authorization: 'Bearer ' + x.token } }), { ip: '192.0.2.71' }); assert.equal(r.status, 200); return r.json(); }
const posts = (x, action) => x.state.requests.filter(r => r.method === 'POST' && (!action || r.action === action));
async function noProviderEffects(x) { for (const kind of ['phone_activation_intents', 'voice_activation_intents', 'messaging_activation', 'calendar_oauth', 'service_onboarding_intents']) assert.equal((await store.list(kind, x.slug)).length, 0, 'Provider effect recorded in ' + kind); assert.equal(report.physicalNetwork, 0); }
async function waitText(page, selector, re) { await page.waitForFunction(([s, src, flags]) => { const n = document.querySelector(s); return !!n && new RegExp(src, flags).test(n.textContent); }, [selector, re.source, re.flags]); }

// Exact honest provider-gating copy from desk-setup-guide.js platformHold()/reviewMarkup()/holdActions() at HEAD.
const HOLD = {
  voice: { heading: 'Prepare Phone answering', text: 'Phone answering is not enabled for this workspace, so setup has not started.' },
  sms: { heading: 'Prepare Text messaging', text: 'Text messaging is not enabled for this workspace, so registration has not started.' },
  calendar: { heading: 'Prepare Google Calendar', text: 'Google Calendar is not enabled for this workspace. Your account has not been connected.' }
};
const REVIEW_INTRO = 'Send our team your saved connection details and the current setup status. No need to explain them again. This requests a review; it does not activate a service or approve a charge.';
const REVIEW_SAVED = 'Your connection review is saved for our team. This request does not start provisioning or activate the service.';
const REVIEW_RECEIVED = 'Your connection review is received. Keep the reference above to follow its status.';
const REVIEW_UP_TO_DATE = 'Your saved review status is up to date.';
const REVIEW_LOST = 'The response was interrupted. Your request may already be saved. Check its status before sending it again.';
const INTAKE_LOST = 'The response was interrupted. Your details may be saved. Check the saved result before continuing.';
// Status labels serviceStatus() uses only for delivered/connected states; a gated service must never show them.
const CLAIM_STATUSES = ['Delivery verified', 'Google access saved', 'Connected; call allowance reached', 'Connected; text allowance reached', 'Connected; AI reply allowance reached'];
const CLAIM_TEXT = /(?<!not been |not |n’t )\bconnected\b|\bis live\b|\bgo live\b|\bdelivered\b|\bverified\b|\bactivated\b|is connected|Connection verified/i;
const INTRO = { web: { heading: 'Connect Website chat', primary: 'Continue setup' }, thumbtack: { heading: 'Connect Thumbtack', primary: 'Start setup' }, angi: { heading: 'Connect Angi', primary: 'Start setup' } };
const EXPECTED_LIST = { web: 'Your details needed', voice: 'Setup needs our help', sms: 'Setup needs our help', calendar: 'Setup needs our help', thumbtack: 'Not selected', angi: 'Not selected' };
const EXPECTED_LIST_WEB_ONLY = { web: 'Your details needed', voice: 'Not selected', sms: 'Not selected', calendar: 'Not selected', thumbtack: 'Not selected', angi: 'Not selected' };

async function assertList(page, expected, where) {
  const rows = await list(page);
  assert.deepEqual(rows.map(r => r.id), SERVICES, 'Six services in order at ' + where);
  for (const r of rows) {
    assert.equal(r.label, LABELS[r.id], 'Label for ' + r.id);
    assert.equal(r.status, expected[r.id], 'Status label for ' + r.id + ' at ' + where);
    assert.ok(r.statusVisible && r.fontSize >= 11 && r.contrast >= 4.5 && !r.clipped && r.inViewport && r.height >= 24, 'Readable status for ' + r.id + ': ' + JSON.stringify(r));
  }
  assert.equal(await page.locator('#setupGuideTitle').textContent(), 'Your connections');
  assert.match(await page.locator('#setupGuide .setup-guide-heading p').textContent(), /^Choose a service\. We’ll walk you through one step at a time\.$/);
  await noHorizontalScroll(page, where);
}

async function leadOpen(x, id) {
  const { page } = x;
  await openService(page, id); await page.locator('#connectorStart').click();
  await page.locator('#leadSourceDialog[open]').waitFor();
  await page.waitForFunction(() => document.getElementById('leadSourceDialog').getAttribute('aria-busy') !== 'true');
}
const evidence = (name, focus) => (report.observations ||= []).push({ check: name, focus });
const ts = page => page.evaluate(() => ({ url: location.href, len: history.length, state: history.state, open: [...document.querySelectorAll('dialog[open]')].map(d => d.id), stage: document.getElementById('leadSourceStage')?.textContent, page: document.body.dataset.activePage, view: document.getElementById('setupGuide')?.dataset.connectorView }));
for (const [width, height] of [[1440, 900], [390, 844]]) {
  await check(`QA probe: Thumbtack self-serve in-dialog Back/Forward under the modal hold (${width})`, 'thumbtack', 'history', async () => {
    const x = await open(await seed(width), { height, hash: '#setup' }); const { page } = x;
    await leadOpen(x, 'thumbtack'); await page.locator('#selfServePrepare').click();
    await waitText(page, '#leadSourceStage', /Step 1 of 3/); await page.waitForTimeout(300);
    await page.evaluate(() => { window.__push = 0; const p = history.pushState.bind(history); history.pushState = function () { window.__push++; return p.apply(null, arguments); }; });
    const s = { open: await ts(page) };
    await page.locator('#leadSourceDialog [data-self-page="2"].btn-pill-blue').click(); await waitText(page, '#leadSourceStage', /Step 2 of 3/); s.p2 = await ts(page);
    await page.locator('#leadSourceDialog [data-self-page="3"]').click(); await waitText(page, '#leadSourceStage', /Step 3 of 3/); s.p3 = await ts(page);
    await page.goBack(); await page.waitForTimeout(500); s.back1 = await ts(page);
    await page.goBack(); await page.waitForTimeout(500); s.back2 = await ts(page);
    await page.goBack(); await page.waitForTimeout(500); s.back3 = await ts(page);
    await page.goForward(); await page.waitForTimeout(500); s.fwd1 = await ts(page);
    s.push = await page.evaluate(() => window.__push);
    evidence('self-serve history ' + width, s);
    assert.match(s.back1.stage, /Step 2 of 3/, 'Back from step 3: ' + JSON.stringify(s.back1)); assert.deepEqual(s.back1.open, ['leadSourceDialog']);
    assert.match(s.back2.stage, /Step 1 of 3/, 'Back from step 2: ' + JSON.stringify(s.back2)); assert.deepEqual(s.back2.open, ['leadSourceDialog']);
    for (const k of ['back1', 'back2', 'fwd1']) { assert.deepEqual(s[k].open, ['leadSourceDialog'], k + ' dialog closed'); assert.equal(s[k].url, s.open.url, k + ' url moved: ' + s[k].url); assert.equal(s[k].page, 'setup', k); assert.equal(s[k].len, s.p3.len, k + ' history grew'); }
    // dfb0ae78 parity: the third Back leaves the dialog for the Thumbtack intro page; Forward returns to the dialog.
    assert.deepEqual(s.back3.open, [], 'back3 leaves the dialog: ' + JSON.stringify(s.back3)); assert.equal(new URL(s.back3.url).hash, '#setup/thumbtack/intro', 'back3 url'); assert.equal(s.back3.page, 'setup');
    assert.ok(!('mcDeskPage' in (s.back1.state || {})) && s.back1.state?.mcSelfServePage?.page === 2 && s.back2.state?.mcSelfServePage?.page === 1, 'the desk did not rewrite the lead-source entries: ' + JSON.stringify([s.back1.state, s.back2.state]));
    assert.ok(s.push <= 6, 'push count ' + s.push);
  });
}
// ---------- finish ----------
await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0;
report.checks.push({ name: 'hygiene: no physical or forbidden requests and no page errors (all checks)', pass: globalsPass, ...(globalsPass ? {} : { error: JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors }) }) });
if (globalsPass) cover(SERVICES, 'hygiene', 'global');
const sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
report.checks.push({ name: 'source unchanged during the run (sourceBefore === sourceAfter)', pass: sourceStable });
report.coverage = coverage;
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.durationMs = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + (report.expectedFailures.length ? ' (' + report.expectedFailures.length + ' expected-fail recorded)' : '') + ' in ' + Math.round(report.durationMs / 1000) + 's -> ' + output);
process.exit(report.passed === report.total ? 0 : 1);
