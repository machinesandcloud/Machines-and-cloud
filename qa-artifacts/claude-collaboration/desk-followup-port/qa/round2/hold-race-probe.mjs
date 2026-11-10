// ROUND-2 INDEPENDENT QA PROBE (not product code). Harness copied from ../modal-probe-desk.mjs (itself from desk-followup-ui-check.mjs) plus --no-nav
// (deletes window.navigation in an init script); probes below are new: restore races, wrong delta, fallback.
// Desk follow-up: lost-save normalization and emergency allowance, workspace Back/Forward, return to place after re-sign-in,
// blocked-time reconcile after a lost response, signed-out heading and sign-in link.
// Actual owner handlers (/api/client, /api/access) and browser assets; memory storage, fake model, no server or external transport.
// Run from the worktree root: node qa-artifacts/claude-collaboration/desk-followup-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-followup-<name>.json [--desk-dir <dir with desk.js, desk.html, desk.css>]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const output = option('--output'), playwrightPath = option('--playwright') || process.env.MC_PLAYWRIGHT_MODULE;
if (!output || !/^scratchpad\/claude-port-[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw new Error('Choose a new --output scratchpad/claude-port-name.json');
if (!playwrightPath) throw new Error('Use installed Playwright via --playwright /path/to/playwright/index.mjs. This check never installs tooling.');
const root = resolve('.'), origin = 'http://127.0.0.1:8921';
if (!existsSync(resolve(root, 'desk.js'))) throw new Error('Run from the worktree root.');
// --desk-dir serves desk.js, desk.html and desk.css from another directory (for example the base revision) without touching the worktree.
const noNav = process.argv.includes('--no-nav');
const deskDir = option('--desk-dir') ? resolve(option('--desk-dir')) : null;
const lib = path => pathToFileURL(resolve(root, path)).href;
const sha = value => createHash('sha256').update(value).digest('hex');
const pinned = ['desk.js', 'desk.html', 'desk.css'];
const report = { at: new Date().toISOString(), browser: process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome', deskDir: option('--desk-dir') || '.', noNav, served: Object.fromEntries(pinned.map(f => [f, []])), qualifications: 'Synthetic workspace, session and request; actual local /api/client and /api/access handlers; memory storage; fake model. Lost responses are simulated with route.abort after (or before) the actual handler ran. No model/provider/email/OAuth/purchase/deployment performed.', checkSha256: sha(readFileSync(new URL(import.meta.url))), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Follow-up check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { report.backgroundRequests = (report.backgroundRequests || []).concat({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };
const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
const { workspaceTenant } = await import(lib('netlify/functions/lib/workspace-identity.mjs'));
const { configurationRevision } = await import(lib('netlify/functions/lib/setup.mjs'));
const handlers = { '/api/client': (await import(lib('netlify/functions/client.mjs'))).default, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default, '/api/workspace-billing': (await import(lib('netlify/functions/workspace-billing.mjs'))).default };
const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const contexts = []; let serial = 0;
const houstonDate = days => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000));

// options.signedIn=false opens without a session; options.start='/start.html' opens a public page first so Back can leave.
async function fixture(viewport, options = {}) {
  const slug = 'followup-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Follow-up Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'voice'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm'); c.phone.businessNumber = '';
  // Port: options.live is a reviewed and privately tested live website chat (as in qa-artifacts/owner-edit-chat-impact/author-ui-check.mjs).
  if (options.live) { c.status = 'live'; c.channels = { web: { active: true }, voice: { active: false }, sms: { active: false } }; const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: 'live' }; }
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
  if (noNav) await context.addInitScript(() => { try { delete Window.prototype.navigation; } catch (e) {} try { delete window.navigation; } catch (e) {} try { Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }); } catch (e) {} });
  await context.addInitScript(({ origin, slug, token, signedIn }) => { if (location.origin !== origin) return; if (signedIn && !sessionStorage.getItem('fixture-signed-out')) sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token, signedIn: options.signedIn !== false });
  const state = { requests: [], putFault: null, postFault: null, getFault: null, getHook: null };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname === '/start.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Public start</title><p>Public page</p>' });
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action }; state.requests.push(item); report.requests.push(item);
      if (method === 'PUT' && state.putFault === 'held') { state.putFault = null; item.fixture = 'held'; item.status = 'aborted'; const held = new Request(url, { method, headers: request.headers(), body: JSON.stringify(body) }); state.heldCommit = async () => { const r = await handlers[url.pathname](held, { ip: '192.0.2.71' }); item.lateStatus = r.status; }; return route.abort('failed'); }
      if (method === 'GET' && url.pathname === '/api/client' && state.getHook) { const h = state.getHook; state.getHook = null; await h(); }
      if (method === 'GET' && url.pathname === '/api/client' && state.getFault === 'lost') { state.getFault = null; item.status = 'aborted'; return route.abort('failed'); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' }); item.status = response.status;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (method === 'PUT' && state.putFault === 'after') { state.putFault = null; item.fixture = 'lost-after-handler'; return route.abort('failed'); }
      if (method === 'POST' && state.postFault === 'after' && /^availability_/.test(action || '')) { state.postFault = null; item.fixture = 'lost-after-handler'; return route.abort('failed'); }
      if (method === 'GET' && url.pathname === '/api/client' && state.heldCommit) { await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buffer }); const commit = state.heldCommit; state.heldCommit = null; await commit(); return; }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buffer });
    }
    const name = url.pathname.replace(/^\//, '');
    if (pinned.includes(name)) { const bytes = readFileSync(deskDir ? resolve(deskDir, name) : resolve(root, name)), digest = sha(bytes); if (!report.served[name].includes(digest)) report.served[name].push(digest); return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(name)], body: bytes }); }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  const x = { page, c, slug, token, state, context, width: viewport.width };
  if (options.start) await page.goto(origin + options.start);
  if (options.goto !== false) { await page.goto(origin + '/desk.html?c=' + slug + (options.hash || '')); if (options.signedIn !== false) await ready(x); }
  return x;
}
const ready = x => x.page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
async function check(name, run) { const start = contexts.length; try { await run(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); } catch (error) { report.checks.push({ name, pass: false, error: error.stack }); const page = contexts.at(-1)?.pages().at(-1); if (page) await shot(page, 'failure-' + report.checks.length).catch(() => {}); console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]); } finally { await Promise.all(contexts.slice(start).map(context => context.close())); } }
async function shot(page, name) { const path = output.replace(/\.json$/, '-' + name + '.png'); await page.screenshot({ path }); report.screenshots = (report.screenshots || []).concat(path); }
async function noHorizontalScroll(page) { const v = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(v.document <= v.viewport + 1, 'Horizontal scroll ' + JSON.stringify(v)); }
const active = x => x.page.evaluate(() => document.body.dataset.activePage);
const puts = x => x.state.requests.filter(r => r.method === 'PUT');
const stored = x => store.get('clients', x.c.slug);

// ---------- 1. Business details lost save ----------
async function toDetails(x) {
  await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: 'know' } })));
  await x.page.waitForFunction(() => ['saved', 'incomplete'].includes(document.getElementById('cfg').dataset.saveState));
  await x.page.evaluate(() => document.querySelectorAll('#cfg details').forEach(d => { d.open = true; }));
}
async function setField(page, name, value) { await page.evaluate(([n, v]) => { const f = document.querySelector('#cfg [name="' + n + '"]'); f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); }, [name, value]); }
const settled = page => page.waitForFunction(() => { const f = document.getElementById('cfg'); return f.getAttribute('aria-busy') === 'false' && f.dataset.saveState !== 'saving' && !/Checking/.test(document.getElementById('saveMsg').textContent); });
async function saveAfter(x, count) { await x.page.locator('#saveCfg').click(); for (let i = 0; i < 100 && puts(x).length < count; i++) await x.page.waitForTimeout(50); assert.equal(puts(x).length, count, 'PUT count'); await settled(x.page); }
const outcome = async x => ({ state: await x.page.locator('#cfg').getAttribute('data-save-state'), msg: await x.page.locator('#saveMsg').innerText(), conflict: await x.page.locator('#cfgConflictPanel').isVisible() });
const lostAfterSaved = async (name, value, verify) => {
  const x = await fixture({ width: 1440, height: 900 }); await toDetails(x); await setField(x.page, name, value); x.state.putFault = 'after'; await saveAfter(x, 1);
  assert.equal(puts(x)[0].fixture, 'lost-after-handler'); await verify(await stored(x));
  const o = await outcome(x); assert.equal(o.state, 'saved', 'a save that landed is confirmed: ' + JSON.stringify(o)); assert.doesNotMatch(o.msg, /changed while it was checked/); assert.equal(o.conflict, false);
  return x;
};

const route = (x, tab) => x.page.evaluate(t => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: t } })), tab);
// Page-side instrumentation: pushState and history.go counts, popstate count, and the Navigation API index if present.
const instrument = x => x.page.evaluate(() => {
  window.__push = 0; window.__go = []; window.__pop = 0;
  const p = history.pushState.bind(history); history.pushState = function () { window.__push++; return p.apply(null, arguments); };
  const g = history.go.bind(history); history.go = function (d) { window.__go.push(d); return g(d); };
  window.addEventListener('popstate', () => { window.__pop++; });
});
const snap = x => x.page.evaluate(() => ({ url: location.href, hash: location.hash, page: document.body.dataset.activePage, len: history.length, push: window.__push, go: window.__go && window.__go.slice(), pop: window.__pop, index: window.navigation && window.navigation.currentEntry ? window.navigation.currentEntry.index : null, entries: window.navigation && window.navigation.currentEntry ? window.navigation.entries().map(e => e.url.replace(location.origin, '')) : null, hasNav: !!window.navigation, state: history.state, open: [...document.querySelectorAll('dialog[open]')].map(d => d.id), draft: document.getElementById('visitName')?.value }));
const quiet = async (x, ms = 1600) => { const a = await snap(x); await x.page.waitForTimeout(ms); const b = await snap(x); assert.equal(b.url, a.url, 'URL still moving with no input: ' + a.url + ' -> ' + b.url); assert.equal(b.pop, a.pop, 'popstate still firing with no input (oscillation): ' + a.pop + ' -> ' + b.pop); return b; };
async function openVisitOnAvailability(x, from = 'today') {
  await route(x, from); await route(x, 'availability'); await x.page.locator('#p-availability.on').waitFor();
  await x.page.waitForFunction(() => /calendar_date=/.test(location.search)).catch(() => {});
  await x.page.locator('#calendarAddVisit').click(); await x.page.waitForFunction(() => document.getElementById('visitDialog').open);
  await x.page.locator('#visitName').fill('Race Probe'); await instrument(x); return snap(x);
}
const held = (s, s0, label) => { assert.deepEqual(s.open, ['visitDialog'], label + ' dialog: ' + JSON.stringify(s)); assert.equal(s.page, s0.page, label + ' page routed underneath'); assert.equal(s.url, s0.url, label + ' URL not restored: ' + s.url); if (s0.index !== null) assert.equal(s.index, s0.index, label + ' entry index ' + s.index + ' vs ' + s0.index); assert.equal(s.draft, 'Race Probe', label + ' draft lost'); assert.ok(s.len <= s0.len + (noNav ? 1 : 0), label + ' history grew ' + s0.len + '->' + s.len); };
const closeThenBack = async (x, expectPage) => { await x.page.locator('#closeVisit').click(); await x.page.waitForFunction(() => !document.getElementById('visitDialog').open); await x.page.goBack(); await x.page.waitForTimeout(500); const s = await snap(x); assert.equal(s.page, expectPage, 'after close, Back lands on ' + expectPage + ': ' + JSON.stringify(s)); assert.equal(s.hash, '#' + expectPage); return s; };
report.probe = [];
try {
  const vp = { width: 1440, height: 900 };
  await check('R0 environment: Navigation API ' + (noNav ? 'removed' : 'present'), async () => { const x = await fixture(vp); const s = await x.page.evaluate(() => ({ nav: typeof window.navigation, proto: 'navigation' in Window.prototype })); report.probe.push({ R0: s }); assert.equal(s.nav === 'undefined', noNav); });
  await check('R1 rapid browser Back x4 fired concurrently (no awaits between): settles on the opening entry, no oscillation, then close+Back reaches Home', async () => {
    const x = await fixture(vp); const s0 = await openVisitOnAvailability(x);
    await Promise.all([0, 1, 2, 3].map(() => x.page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(e => null)));
    await x.page.waitForTimeout(1500); const s1 = await quiet(x); report.probe.push({ R1: { s0, s1 } }); held(s1, s0, 'R1');
    await closeThenBack(x, 'today');
  });
  await check('R2 script history.back() x3 in one task, and history.go(-2): held on the opening entry', async () => {
    const x = await fixture(vp); await route(x, 'leads'); const s0 = await openVisitOnAvailability(x);
    await x.page.evaluate(() => { history.back(); history.back(); history.back(); }); await x.page.waitForTimeout(1500); const s1 = await quiet(x);
    await x.page.evaluate(() => history.go(-2)); await x.page.waitForTimeout(1500); const s2 = await quiet(x); report.probe.push({ R2: { s0, s1, s2 } });
    held(s1, s0, 'R2 back x3'); held(s2, s0, 'R2 go(-2)'); await closeThenBack(x, 'today');
  });
  await check('R3 Back then Forward immediately (concurrent), then Forward/Back pairs x3 with 30ms gaps: held, quiet', async () => {
    const x = await fixture(vp); const s0 = await openVisitOnAvailability(x);
    await Promise.all([x.page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => null), x.page.goForward({ waitUntil: 'commit', timeout: 3000 }).catch(() => null)]);
    await x.page.waitForTimeout(1500); const s1 = await quiet(x);
    for (let i = 0; i < 3; i++) { x.page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => null); await x.page.waitForTimeout(30); x.page.goForward({ waitUntil: 'commit', timeout: 3000 }).catch(() => null); await x.page.waitForTimeout(30); }
    await x.page.waitForTimeout(1800); const s2 = await quiet(x); report.probe.push({ R3: { s0, s1, s2 } }); held(s1, s0, 'R3a'); held(s2, s0, 'R3b');
    await closeThenBack(x, 'today');
  });
  await check('R4 Forward while held keeps the forward entry: after close, Forward still reaches Availability', async () => {
    const x = await fixture(vp); await route(x, 'today'); await route(x, 'availability'); await x.page.locator('#p-availability.on').waitFor();
    await x.page.goBack(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'today');
    await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:schedule-open-visit', { detail: {} }))); await x.page.waitForFunction(() => document.getElementById('visitDialog').open);
    await x.page.locator('#visitName').fill('Race Probe'); await instrument(x); const s0 = await snap(x);
    for (let i = 0; i < 3; i++) { await x.page.goForward({ waitUntil: 'commit', timeout: 3000 }).catch(() => null); await x.page.waitForTimeout(40); }
    await x.page.waitForTimeout(1500); const s1 = await quiet(x); report.probe.push({ R4: { s0, s1 } }); held(s1, s0, 'R4');
    await x.page.locator('#closeVisit').click(); await x.page.waitForFunction(() => !document.getElementById('visitDialog').open);
    await x.page.goForward(); await x.page.waitForTimeout(500); const s2 = await snap(x); report.probe.push({ R4after: s2 });
    assert.equal(s2.page, 'availability', 'Forward after close: ' + JSON.stringify(s2));
  });
  await check('R5 Back while the restore is pending: 6 Backs 15ms apart, then one slow Back 1.2s later: held, and the hold still works after its pending timer', async () => {
    const x = await fixture(vp); await route(x, 'leads'); await route(x, 'know'); const s0 = await openVisitOnAvailability(x);
    for (let i = 0; i < 6; i++) { x.page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => null); await x.page.waitForTimeout(15); }
    await x.page.waitForTimeout(1500); const s1 = await quiet(x);
    await x.page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => null); await x.page.waitForTimeout(1200); const s2 = await quiet(x); report.probe.push({ R5: { s0, s1, s2 } });
    held(s1, s0, 'R5 burst'); held(s2, s0, 'R5 slow'); await closeThenBack(x, 'today');
  });
  await check('R6 calendar replaceState lands in the Back window (late schedule load re-renders the calendar while the Back entry is current)', async () => {
    const x = await fixture(vp); await route(x, 'today'); await route(x, 'availability'); await x.page.locator('#p-availability.on').waitFor();
    await x.page.evaluate(() => { document.addEventListener('mc:schedule-data', e => { if (!window.__late) window.__lastSchedule = e.detail; }); });
    await x.page.waitForFunction(() => /calendar_date=/.test(location.search));
    await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:schedule-range', { detail: Object.assign({}, { from: null }) }))).catch(() => {});
    // force a fresh schedule load so a snapshot is captured
    await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:schedule-visible', { detail: { active: true } })));
    await x.page.waitForFunction(() => !!window.__lastSchedule, null, { timeout: 5000 });
    await x.page.locator('#calendarAddVisit').click(); await x.page.waitForFunction(() => document.getElementById('visitDialog').open);
    await x.page.locator('#visitName').fill('Race Probe'); await instrument(x); const s0 = await snap(x);
    // A schedule response that arrives during the Back window: desk.js emits mc:schedule-data, desk-calendar.js renders and replaceStates.
    await x.page.evaluate(() => { window.addEventListener('popstate', function once() { window.removeEventListener('popstate', once); window.__late = true; window.__lateAt = location.href; document.dispatchEvent(new CustomEvent('mc:schedule-data', { detail: window.__lastSchedule })); window.__lateAfter = location.href; }); });
    await x.page.goBack(); await x.page.waitForTimeout(1500); const s1 = await quiet(x);
    const late = await x.page.evaluate(() => ({ at: window.__lateAt, after: window.__lateAfter }));
    let entries = null; if (!noNav) entries = await x.page.evaluate(() => navigation.entries().map(e => e.url.replace(location.origin, '')));
    report.probe.push({ R6: { s0, s1, late, entries } });
    held(s1, s0, 'R6');
    // The Home entry must not have been rewritten with calendar parameters.
    if (entries) assert.ok(!entries.some(u => /#today/.test(u) && /calendar_/.test(u)), 'the Home entry was rewritten by the calendar: ' + JSON.stringify(entries));
    await closeThenBack(x, 'today');
  });
  await check('R7 dialog opened after the calendar replaceState (calendar_date/view in the URL), date changed while open: Back holds the replaced URL, then close+Back reaches Home', async () => {
    const x = await fixture(vp); const s0 = await openVisitOnAvailability(x);
    assert.match(s0.url, /calendar_date=/, 'calendar params present');
    await x.page.goBack(); await x.page.waitForTimeout(800); const s1 = await quiet(x); await x.page.goBack(); await x.page.waitForTimeout(800); const s2 = await quiet(x);
    report.probe.push({ R7: { s0, s1, s2 } }); held(s1, s0, 'R7a'); held(s2, s0, 'R7b'); await closeThenBack(x, 'today');
  });
  await check('R8 Escape-close then rapid Back x2: routes normally (no stale hold), no extra pushes', async () => {
    const x = await fixture(vp); await route(x, 'leads'); const s0 = await openVisitOnAvailability(x);
    await x.page.keyboard.press('Escape'); await x.page.waitForFunction(() => !document.getElementById('visitDialog').open);
    await x.page.goBack(); await x.page.waitForTimeout(400); const s1 = await snap(x); await x.page.goBack(); await x.page.waitForTimeout(400); const s2 = await quiet(x, 800);
    report.probe.push({ R8: { s0, s1, s2 } }); assert.equal(s1.page, 'today'); assert.equal(s2.page, 'leads'); assert.equal(s2.push, 0); assert.deepEqual(s2.go, []);
  });
  await check('R9 visit opened over Setup entry route (setup -> availability): Back to a #setup entry fires the setup guide hashchange; held, then close+Back reaches Setup', async () => {
    const x = await fixture(vp); const s0 = await openVisitOnAvailability(x, 'setup');
    await x.page.goBack(); await x.page.waitForTimeout(1200); const s1 = await quiet(x); report.probe.push({ R9: { s0, s1 } }); held(s1, s0, 'R9');
    await closeThenBack(x, 'setup');
  });
  await check('R10 Back from the first desk entry with a dialog open (cross-document to the public page), then Forward: informational', async () => {
    const x = await fixture(vp, { start: '/start.html' }); await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:schedule-open-visit', { detail: {} }))); await x.page.waitForFunction(() => document.getElementById('visitDialog').open);
    await x.page.locator('#visitName').fill('Race Probe'); await x.page.goBack(); await x.page.waitForTimeout(800); const u = x.page.url(); await x.page.goForward(); await x.page.waitForTimeout(1200);
    const s = await x.page.evaluate(() => ({ url: location.href, open: [...document.querySelectorAll('dialog[open]')].map(d => d.id), draft: document.getElementById('visitName')?.value }));
    report.probe.push({ R10: { afterBack: u, afterForward: s } });
  });
  await check('R11 double browser Back while the page main thread is busy (300ms long task): held on the opening entry, URL matches the page', async () => {
    const x = await fixture(vp); await route(x, 'leads'); const s0 = await openVisitOnAvailability(x);
    await x.page.evaluate(() => { setTimeout(() => { const t = Date.now(); while (Date.now() - t < 300); }, 0); });
    await x.page.waitForTimeout(20);
    const a = x.page.goBack({ waitUntil: 'commit', timeout: 4000 }).catch(() => null); await x.page.waitForTimeout(5); const b = x.page.goBack({ waitUntil: 'commit', timeout: 4000 }).catch(() => null);
    await Promise.all([a, b]); await x.page.waitForTimeout(1600); const s1 = await quiet(x); report.probe.push({ R11: { s0, s1 } }); held(s1, s0, 'R11');
  });
  await check('R12 human-speed double Back (120ms apart) while the page is busy for 400ms: held on the opening entry', async () => {
    const x = await fixture(vp); await route(x, 'leads'); const s0 = await openVisitOnAvailability(x);
    await x.page.evaluate(() => { setTimeout(() => { const t = Date.now(); while (Date.now() - t < 400); }, 0); });
    await x.page.waitForTimeout(20);
    const a = x.page.goBack({ waitUntil: 'commit', timeout: 4000 }).catch(() => null); await x.page.waitForTimeout(120); const b = x.page.goBack({ waitUntil: 'commit', timeout: 4000 }).catch(() => null);
    await Promise.all([a, b]); await x.page.waitForTimeout(1600); const s1 = await quiet(x); report.probe.push({ R12: { s0, s1 } }); held(s1, s0, 'R12');
    await closeThenBack(x, 'today');
  });
  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close();
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, failing: report.checks.filter(c => !c.pass).map(c => c.name) };
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary), JSON.stringify(Object.fromEntries(Object.entries(report.served).map(([k, v]) => [k, v.map(h => h.slice(0, 8))]))));
}
