// ROUND-3 INDEPENDENT QA PROBE (not product code). Harness copied verbatim from ../round2/hold-race-probe.mjs (port 8923); checks below are new: routeTo entry order (item 3), navigate-cancel scope (item 2), retry loop (item 1).
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
const root = resolve('.'), origin = 'http://127.0.0.1:8923';
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
const snap = x => x.page.evaluate(() => ({ url: location.href, hash: location.hash, page: document.body.dataset.activePage, len: history.length, push: window.__push, go: window.__go && window.__go.slice(), pop: window.__pop, index: window.navigation && window.navigation.currentEntry ? window.navigation.currentEntry.index : null, entries: window.navigation && window.navigation.currentEntry ? window.navigation.entries().map(e => (e.url || '(null)').replace(location.origin, '')) : null, hasNav: !!window.navigation, state: history.state, open: [...document.querySelectorAll('dialog[open]')].map(d => d.id), draft: document.getElementById('visitName')?.value }));
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
const tabs = ['today', 'leads', 'convs', 'availability', 'know', 'test', 'setup', 'account'];
const st = x => x.page.evaluate(() => ({ url: location.href.replace(location.origin, ''), hash: location.hash, search: location.search, page: document.body.dataset.activePage, title: document.title, heading: document.getElementById('pageTitle').textContent, focus: document.activeElement && document.activeElement.id, len: history.length, state: history.state, entries: window.navigation ? navigation.entries().map(e => (e.url || '(null)').replace(location.origin, '')) : null, index: window.navigation ? navigation.currentEntry.index : null, open: [...document.querySelectorAll('dialog[open]')].map(d => d.id) }));
const settle = (x, ms = 400) => x.page.waitForTimeout(ms);
try {
  const vp = { width: 1440, height: 900 };
  await check('N0 environment: Navigation API ' + (noNav ? 'removed' : 'present'), async () => { const x = await fixture(vp); const s = await x.page.evaluate(() => typeof window.navigation); assert.equal(s === 'undefined', noNav); });
  await check('N1 every tab via its nav button: one entry each, URL/state/title/heading/focus right after routeTo; Back then Forward across all restore page+title with no extra entries', async () => {
    const x = await fixture(vp, { start: '/start.html' }); const s0 = await st(x); const seen = [];
    for (const t of tabs.slice(1).concat(['today'])) {
      await route(x, t); await settle(x, t === 'availability' ? 900 : 250); const s = await st(x); seen.push(s);
      assert.equal(s.page, t); assert.equal(s.hash, '#' + t, t + ' hash'); assert.equal(s.state && s.state.mcDeskPage, t, t + ' state ' + JSON.stringify(s.state));
      assert.equal(s.focus, 'pageTitle', t + ' focus'); assert.match(s.title, / \| Your front desk \| Machines & Cloud$/); assert.equal(s.len, s0.len + seen.length, t + ' history length ' + s.len);
      if (s.entries) { const prev = s.entries[s.index - 1]; assert.notEqual(prev, s.entries[s.index], t + ' duplicate consecutive entries'); }
    }
    report.probe.push({ N1: { s0, seen: seen.map(s => ({ url: s.url, title: s.title, len: s.len })) } });
    for (let i = seen.length - 2; i >= 0; i--) { await x.page.goBack(); await settle(x, 300); const s = await st(x); assert.equal(s.url, seen[i].url, 'Back url step ' + i); assert.equal(s.page, seen[i].page, 'Back page ' + i); assert.equal(s.title, seen[i].title, 'Back title ' + i); assert.equal(s.len, s0.len + seen.length, 'Back changed length'); }
    await x.page.goBack(); await settle(x, 300); let s = await st(x); assert.equal(s.page, 'today', 'Back to first desk entry'); report.probe.push({ N1first: s.url }); assert.ok([s0.url, s0.url + '#today'].includes(s.url), 'first entry ' + s.url);
    for (let i = 0; i < seen.length; i++) { await x.page.goForward(); await settle(x, 300); s = await st(x); assert.equal(s.url, seen[i].url, 'Fwd url ' + i); assert.equal(s.page, seen[i].page, 'Fwd page ' + i); assert.equal(s.title, seen[i].title, 'Fwd title ' + i); }
    await x.page.goto(origin + '/desk.html?c=' + x.slug); await ready(x);
    const back = await x.page.evaluate(() => history.length); assert.ok(back >= 2);
  });
  await check('N2 calendar date/view params land on the Availability entry, not the page left; later calendar changes replace (no new entries); Back/Forward keep params per entry', async () => {
    const x = await fixture(vp); await route(x, 'leads'); await settle(x, 200); const sLeads = await st(x);
    await route(x, 'availability'); await x.page.waitForFunction(() => /calendar_date=/.test(location.search)); await settle(x, 600); const sA = await st(x);
    assert.equal(sA.len, sLeads.len + 1, 'one entry for availability'); assert.match(sA.url, /calendar_view=month.*#availability$/);
    if (sA.entries) { assert.doesNotMatch(sA.entries[sA.index - 1], /calendar_date/, 'params written onto the Leads entry: ' + sA.entries[sA.index - 1]); assert.equal(sA.entries[sA.index - 1], sLeads.url); }
    await x.page.locator('#calendarNext').click(); await settle(x, 500); const sN = await st(x); assert.equal(sN.len, sA.len, 'calendar next added an entry'); assert.notEqual(sN.url, sA.url, 'calendar next did not rewrite URL'); assert.equal(sN.state && sN.state.mcDeskPage, 'availability', 'calendar replace kept state');
    await route(x, 'know'); await settle(x, 300); const sK = await st(x); assert.equal(sK.len, sA.len + 1);
    await x.page.goBack(); await settle(x, 700); const sB = await st(x); assert.equal(sB.page, 'availability'); assert.equal(sB.url, sN.url, 'Back to availability keeps its own date: ' + sB.url + ' vs ' + sN.url); assert.equal(sB.len, sK.len, 'Back->calendar render added entry');
    await x.page.goBack(); await settle(x, 300); const sL = await st(x); assert.equal(sL.page, 'leads'); assert.equal(sL.url, sLeads.url, 'Leads entry URL changed: ' + sL.url);
    await x.page.goForward(); await settle(x, 700); const sF = await st(x); assert.equal(sF.page, 'availability'); assert.equal(sF.url, sN.url);
    report.probe.push({ N2: { sLeads: sLeads.url, sA: sA.url, sN: sN.url, sK: sK.url, sB: sB.url, sL: sL.url, entries: sF.entries } });
  });
  await check('N3 deep links: #availability with calendar params, #setup/sms (normalized), #know; no extra entries on load; Back leaves to the public page', async () => {
    const x = await fixture(vp, { start: '/start.html', hash: '#availability' }); await settle(x, 800); let s = await st(x); const len0 = s.len;
    assert.equal(s.page, 'availability'); assert.match(s.url, /calendar_date=/);
    const d = houstonDate(20);
    await x.page.goto(origin + '/desk.html?c=' + x.slug + '&calendar_date=' + d + '&calendar_view=week#availability'); await ready(x); await settle(x, 800); s = await st(x);
    assert.match(s.url, new RegExp('calendar_date=' + d)); assert.match(s.url, /calendar_view=week/); assert.equal(s.len, len0 + 1, 'deep link load added extra entries');
    await x.page.goto(origin + '/desk.html?c=' + x.slug + '#setup/sms'); await ready(x); await settle(x, 600); const sS = await st(x); report.probe.push({ N3: { sS } });
    assert.equal(sS.page, 'setup'); assert.match(sS.hash, /^#setup\/sms(\/intro)?$/); assert.equal(sS.len, len0 + 2, 'setup deep link extra entries ' + sS.len);
    await x.page.goto(origin + '/desk.html?c=' + x.slug + '#know'); await ready(x); await settle(x, 300); s = await st(x); assert.equal(s.page, 'know'); assert.equal(s.len, len0 + 3);
    await x.page.goBack(); await settle(x, 600); s = await st(x); assert.equal(s.page, 'setup'); assert.match(s.hash, /^#setup\/sms/);
  });
  await check('N4 connector sub-route through mc:desk-route connectionHash: one entry, hash normalized to /intro, Back returns to the prior page', async () => {
    const x = await fixture(vp); await route(x, 'leads'); await settle(x, 200); const s0 = await st(x);
    await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: 'setup', connectionHash: '#setup/sms' } }))); await settle(x, 500); const s1 = await st(x);
    report.probe.push({ N4: { s0: s0.url, s1: s1.url, len: [s0.len, s1.len], entries: s1.entries } });
    assert.equal(s1.page, 'setup'); assert.equal(s1.hash, '#setup/sms/intro'); assert.ok(s1.len <= s0.len + 2, 'too many entries ' + s1.len);
    await x.page.goBack(); await settle(x, 500); let s = await st(x); if (s.page === 'setup') { await x.page.goBack(); await settle(x, 500); s = await st(x); }
    assert.equal(s.page, 'leads'); assert.equal(s.url, s0.url);
  });
  await check('N5 typed hash change (#know) routes with the browser entry only (routeTo replaces, no second entry); Back returns', async () => {
    const x = await fixture(vp); const s0 = await st(x); await x.page.evaluate(() => { location.hash = '#know'; }); await settle(x, 400); const s1 = await st(x);
    assert.equal(s1.page, 'know'); assert.equal(s1.len, s0.len + 1); assert.equal(s1.focus, 'pageTitle');
    await x.page.goBack(); await settle(x, 400); const s2 = await st(x); assert.equal(s2.page, 'today'); assert.equal(s2.len, s1.len);
  });
  await check('N6 re-sign-in return route: session expiry on Availability with params stores #availability; sign-in returns there', async () => {
    const x = await fixture(vp); await route(x, 'availability'); await x.page.waitForFunction(() => /calendar_date=/.test(location.search)); await settle(x, 300);
    await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:session-expired'))); const saved = await x.page.evaluate(() => JSON.parse(localStorage.getItem('mc-return-route-v1')));
    report.probe.push({ N6: saved }); assert.equal(saved.hash, '#availability');
    await x.page.goto(origin + '/desk.html?c=' + x.slug); await ready(x); await settle(x, 800); const s = await st(x); report.probe.push({ N6b: s.url });
    assert.equal(s.page, 'availability', 'return route not used: ' + s.url);
  });
  await check('N7 Quick tour: one tour entry; tour steps route without entries; Back closes tour on the origin page with its URL', async () => {
    const x = await fixture(vp); await route(x, 'leads'); await settle(x, 200); const s0 = await st(x);
    await x.page.locator('#openGuide').click(); await x.page.waitForFunction(() => document.getElementById('guideDialog').open); const s1 = await st(x); assert.equal(s1.len, s0.len + 1);
    for (let i = 0; i < 4; i++) { const n = x.page.locator('#tourNext'); if (await n.isVisible()) { await n.click(); await settle(x, 300); } }
    const s2 = await st(x); assert.equal(s2.len, s1.len, 'tour steps added entries'); report.probe.push({ N7: { s0: s0.url, s1: s1.url, s2: s2.url, page: s2.page, state: s2.state } });
    await x.page.goBack(); await settle(x, 600); const s3 = await st(x); assert.deepEqual(s3.open, []); assert.equal(s3.page, 'leads'); assert.equal(s3.url, s0.url, 'tour Back URL');
  });
  // ---------- item 2 ----------
  const watchNav = x => x.page.evaluate(() => { window.__navlog = []; if (window.navigation) navigation.addEventListener('navigate', e => { setTimeout(() => window.__navlog.push({ type: e.navigationType, url: e.destination.url.replace(location.origin, ''), prevented: e.defaultPrevented, cancelable: e.cancelable })); }); });
  await check('M1 no dialog open: replaceState (another module cleaning a param) and a same-URL replace are never cancelled', async () => {
    const x = await fixture(vp); await watchNav(x); await route(x, 'setup');
    await x.page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('connection', 'thumbtack'); history.replaceState(history.state, '', u); u.searchParams.delete('connection'); history.replaceState(history.state, '', u); });
    await settle(x, 200); const log = await x.page.evaluate(() => window.__navlog); report.probe.push({ M1: log }); if (!noNav) assert.ok(log.length >= 2); assert.ok(log.every(e => !e.prevented), JSON.stringify(log));
    assert.doesNotMatch(await x.page.evaluate(() => location.search), /connection/);
  });
  await check('M2 held dialog open on its own entry: replaceState of the held entry is allowed and updates the hold; push (hash link) inside the dialog not cancelled, dialog held', async () => {
    const x = await fixture(vp); const s0 = await openVisitOnAvailability(x); await watchNav(x);
    await x.page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('qa', '1'); history.replaceState(history.state, '', u); }); await settle(x, 200);
    let s = await snap(x); assert.match(s.url, /qa=1/); const log = await x.page.evaluate(() => window.__navlog); assert.ok(log.every(e => !e.prevented), JSON.stringify(log));
    await x.page.goBack(); await settle(x, 900); s = await snap(x); assert.match(s.url, /qa=1/, 'hold returned to the stale pre-replace URL: ' + s.url); assert.deepEqual(s.open, ['visitDialog']);
    await x.page.evaluate(() => { const a = document.createElement('a'); a.href = '#availability-anchor'; a.id = 'qaLink'; document.getElementById('visitDialog').appendChild(a); a.click(); }); await settle(x, 600);
    s = await snap(x); const log2 = await x.page.evaluate(() => window.__navlog); report.probe.push({ M2: { s, log2 } }); assert.ok(log2.every(e => !e.prevented), 'a push was cancelled ' + JSON.stringify(log2)); assert.deepEqual(s.open, ['visitDialog']); assert.equal(s.page, 'availability');
  });
  await check('M3 Back window (held entry not current): replaceState is cancelled (intended); cross-document location.replace in that window: informational', async () => {
    if (noNav) return; const x = await fixture(vp); await route(x, 'today'); const s0 = await openVisitOnAvailability(x); await watchNav(x);
    const r = await x.page.evaluate(async () => { const prev = navigation.entries()[navigation.currentEntry.index - 1].key; const t = navigation.traverseTo(prev); await t.committed.catch(() => {}); const before = location.href; const u = new URL(location.href); u.searchParams.set('qa', 'window'); history.replaceState(history.state, '', u); const after = location.href; let prevented = null; const h = e => { prevented = e; }; return { before: before.replace(location.origin, ''), after: after.replace(location.origin, ''), same: before === after }; });
    await settle(x, 1000); const s = await snap(x); const log = await x.page.evaluate(() => window.__navlog); report.probe.push({ M3: { r, s: { url: s.url, open: s.open }, log } });
    assert.ok(r.same, 'replace in Back window not cancelled ' + JSON.stringify(r)); held(s, s0, 'M3');
    const r2 = await x.page.evaluate(async () => { const prev = navigation.entries()[navigation.currentEntry.index - 1].key; const t = navigation.traverseTo(prev); await t.committed.catch(() => {}); location.replace('/start.html'); return location.href; });
    await settle(x, 1200); const u = x.page.url(); const log2 = await x.page.evaluate(() => window.__navlog).catch(() => 'page replaced'); report.probe.push({ M3b: { r2, finalUrl: u, log2 } });
  });
  await check('M4 listener inert after the held dialog closes: replaceState in a Back/traverse of a normal page is not cancelled', async () => {
    if (noNav) return; const x = await fixture(vp); await route(x, 'leads'); const s0 = await openVisitOnAvailability(x); await x.page.locator('#closeVisit').click(); await x.page.waitForFunction(() => !document.getElementById('visitDialog').open); await watchNav(x);
    await x.page.goBack(); await settle(x, 500); await x.page.evaluate(() => { const u = new URL(location.href); u.searchParams.set('qa', 'after'); history.replaceState(history.state, '', u); }); await settle(x, 200);
    const s = await snap(x); assert.match(s.url, /qa=after/); const log = await x.page.evaluate(() => window.__navlog); assert.ok(log.every(e => !e.prevented), JSON.stringify(log));
  });
  // ---------- item 1 ----------
  const timers = x => x.page.evaluate(() => { window.__t250 = 0; const st = window.setTimeout; window.setTimeout = function (f, ms) { if (ms === 250) window.__t250++; return st.apply(window, arguments); }; window.__trav = 0; if (window.navigation) { const tt = navigation.traverseTo.bind(navigation); navigation.traverseTo = function (k, o) { window.__trav++; return window.__travBlock ? { committed: Promise.reject(new Error('blocked')), finished: Promise.reject(new Error('blocked')) } : tt(k, o); }; } });
  await check('I1 user alternates Back/Forward 8 times at human speed (180ms) with a held dialog: no oscillation, settles held', async () => {
    const x = await fixture(vp); await route(x, 'today'); await route(x, 'leads'); const s0 = await openVisitOnAvailability(x, 'leads'); await route(x, 'availability');
    for (let i = 0; i < 8; i++) { (i % 2 ? x.page.goForward({ waitUntil: 'commit', timeout: 2000 }) : x.page.goBack({ waitUntil: 'commit', timeout: 2000 })).catch(() => {}); await x.page.waitForTimeout(180); }
    await settle(x, 2000); const s = await quiet(x); report.probe.push({ I1: { s0: s0.url, s: s.url, len: [s0.len, s.len], idx: [s0.index, s.index] } }); held(s, s0, 'I1');
  });
  await check('I2 user closes the dialog mid-retry (Back then Escape 20ms later): page matches URL, no further movement, timer cleared', async () => {
    const x = await fixture(vp); const s0 = await openVisitOnAvailability(x); await timers(x);
    x.page.goBack({ waitUntil: 'commit' }).catch(() => {}); await x.page.waitForTimeout(20); await x.page.keyboard.press('Escape');
    await settle(x, 1200); const a = await x.page.evaluate(() => ({ t: window.__t250, tr: window.__trav })); const s = await quiet(x, 1500); const b = await x.page.evaluate(() => ({ t: window.__t250, tr: window.__trav }));
    report.probe.push({ I2: { s0: s0.url, s: s.url, page: s.page, open: s.open, a, b } }); assert.deepEqual(s.open, []); assert.equal('#' + s.page, s.hash, 'page/URL mismatch ' + JSON.stringify(s)); assert.equal(b.t, a.t, '250ms timer still running after close');
  });
  await check('I3 cap: traversals refused by the browser: at most 12 traverseTo calls, then the 250ms re-check keeps polling while the dialog is open (informational), stops on close', async () => {
    if (noNav) return; const x = await fixture(vp); const s0 = await openVisitOnAvailability(x); await timers(x); await x.page.evaluate(() => { window.__travBlock = true; });
    await x.page.goBack(); await settle(x, 5000); const a = await x.page.evaluate(() => ({ t: window.__t250, tr: window.__trav })); const s1 = await snap(x);
    await settle(x, 1000); const b = await x.page.evaluate(() => ({ t: window.__t250, tr: window.__trav }));
    await x.page.locator('#closeVisit').click(); await settle(x, 1000); const c = await x.page.evaluate(() => ({ t: window.__t250, tr: window.__trav })); await settle(x, 1000); const d = await x.page.evaluate(() => ({ t: window.__t250, tr: window.__trav })); const s2 = await snap(x);
    report.probe.push({ I3: { a, b, c, d, s1: { url: s1.url, page: s1.page, open: s1.open }, s2: { url: s2.url, page: s2.page } } });
    assert.ok(a.tr <= 12, 'traverseTo calls ' + a.tr); assert.equal(d.t, c.t, 'timer still running after close');
  });
  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close();
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, failing: report.checks.filter(c => !c.pass).map(c => c.name) };
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary), JSON.stringify(Object.fromEntries(Object.entries(report.served).map(([k, v]) => [k, v.map(h => h.slice(0, 8))]))));
}
