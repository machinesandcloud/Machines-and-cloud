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
const deskDir = option('--desk-dir') ? resolve(option('--desk-dir')) : null;
const lib = path => pathToFileURL(resolve(root, path)).href;
const sha = value => createHash('sha256').update(value).digest('hex');
const pinned = ['desk.js', 'desk.html', 'desk.css'];
const report = { at: new Date().toISOString(), browser: process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome', deskDir: option('--desk-dir') || '.', served: Object.fromEntries(pinned.map(f => [f, []])), qualifications: 'Synthetic workspace, session and request; actual local /api/client and /api/access handlers; memory storage; fake model. Lost responses are simulated with route.abort after (or before) the actual handler ran. No model/provider/email/OAuth/purchase/deployment performed.', checkSha256: sha(readFileSync(new URL(import.meta.url))), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
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

try {
  const vp = { width: 1440, height: 900 }, phone = { width: 390, height: 844 };
  await check('1. lost-after "Numbers that always ring through" typed as (713) 555-0144 is confirmed saved, not "changed while it was checked"', async () => {
    const x = await lostAfterSaved('rules.bypass', '(713) 555-0144', c => assert.deepEqual(c.rules.bypass, ['+17135550144']));
    assert.equal(await x.page.locator('#cfg [name="rules.bypass"]').inputValue(), '+17135550144');
  });
  await check('1. lost-after price line with no amount "Diagnostic $89" is confirmed saved and reads back as typed', async () => {
    const x = await lostAfterSaved('fees', 'Diagnostic $89', c => assert.deepEqual(c.fees.map(f => [f.label, f.amount, f.note]), [['Diagnostic $89', '', '']]));
    assert.equal(await x.page.locator('#cfg [name="fees"]').inputValue(), 'Diagnostic $89');
  });
  await check('1. lost-after Tier 0 alone is still confirmed saved', async () => {
    await lostAfterSaved('rules.emergencies.tier0', 'Gas smell\nNo heat below 40F', c => assert.deepEqual(c.rules.emergencies.tier0, ['Gas smell', 'No heat below 40F']));
  });
  await check('1. lost-after Tier 0 while another tab writes the emergency script is not "saved" and does not adopt the script', async () => {
    const x = await fixture(vp); await toDetails(x); const before = await x.page.locator('#cfg [name="rules.emergencies.script"]').inputValue();
    await setField(x.page, 'rules.emergencies.tier0', 'Gas smell\nNo heat below 40F'); x.state.putFault = 'after';
    x.state.getHook = async () => { await store.atomicUpdate('clients', x.c.slug, c => ({ value: { ...c, rules: { ...c.rules, emergencies: { ...c.rules.emergencies, script: 'OTHER TAB SCRIPT' } }, updatedAt: new Date().toISOString() } })); };
    await saveAfter(x, 1); const o = await outcome(x);
    assert.notEqual(o.state, 'saved', 'concurrent script edit adopted as saved: ' + JSON.stringify(o)); assert.equal(o.conflict, true);
    assert.equal(await x.page.locator('#cfg [name="rules.emergencies.script"]').inputValue(), before, 'script field silently took the other tab value');
    assert.equal(await x.page.locator('#cfg [name="rules.emergencies.tier0"]').inputValue(), 'Gas smell\nNo heat below 40F', 'owner edit kept');
  });
  await check('1. a late-committing ring-through save is recognised by Check latest as already saved', async () => {
    const x = await fixture(vp); await toDetails(x); await setField(x.page, 'rules.bypass', '(713) 555-0144'); x.state.putFault = 'held'; await saveAfter(x, 1);
    assert.match((await outcome(x)).msg, /couldn’t confirm this save yet/); assert.deepEqual((await stored(x)).rules.bypass, ['+17135550144'], 'held PUT committed late');
    await saveAfter(x, 2); assert.equal(puts(x)[1].status, 409); await x.page.locator('#cfgCheckLatest').click(); await settled(x.page);
    const o = await outcome(x); assert.equal(o.state, 'saved', JSON.stringify(o)); assert.match(o.msg, /already saved/);
  });

  // ---------- 2. Back and Forward ----------
  const seedLead = async x => { x.lead = await store.addRecord('leads', x.c.slug, { tenantIdentity: workspaceTenant(x.c), customer_name: 'Jordan Needs', phone: '+17135550142', address: '12 Oak St', issue: 'No cooling upstairs', reason: 'needs_action', outcome: 'needs_action', status: 'open', channel: 'web', urgency: 'today' }); await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await x.page.locator('#leads [data-request-open]').first().waitFor({ state: 'attached' }); };
  const navButton = (x, tab) => x.page.locator('.tabs button[data-t="' + tab + '"]:visible, [data-workspace-route="' + tab + '"]:visible').first();
  const dialogOpen = x => x.page.evaluate(() => document.getElementById('requestDialog').open);
  for (const v of [vp, phone]) {
    const w = v.width;
    await check(w + 'px 2. Back closes the open request with the typed note kept, Forward reopens it, Back/Forward move between pages, Back from the first page leaves', async () => {
      const x = await fixture(v, { start: '/start.html' }); await seedLead(x);
      assert.equal(await active(x), 'today'); const length = await x.page.evaluate(() => history.length);
      await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await x.page.waitForTimeout(300);
      assert.equal(await x.page.evaluate(() => history.length), length, 'a refresh added history');
      await navButton(x, 'leads').click(); await x.page.locator('#p-leads.on').waitFor();
      await x.page.locator('#leads [data-request-open="' + x.lead.id + '"]').click(); await x.page.locator('#requestContent').waitFor({ state: 'visible' }); await x.page.waitForFunction(() => !document.getElementById('requestSave').disabled);
      await x.page.locator('#requestNote').fill('Called twice, try after 4'); await x.page.waitForTimeout(100);
      await x.page.goBack(); await x.page.waitForFunction(() => !document.getElementById('requestDialog').open);
      assert.equal(await active(x), 'leads', 'Back from the request stays on Inbox'); assert.equal(new URL(x.page.url()).pathname, '/desk.html');
      await shot(x.page, 'back-closed-request-' + w); await noHorizontalScroll(x.page);
      await x.page.goForward(); await x.page.waitForFunction(() => document.getElementById('requestDialog').open); await x.page.locator('#requestContent').waitFor({ state: 'visible' });
      assert.equal(await x.page.locator('#requestNote').inputValue(), 'Called twice, try after 4', 'typed note kept');
      await x.page.locator('#requestClose').click(); await x.page.waitForTimeout(300); assert.equal(await dialogOpen(x), false);
      assert.equal(await x.page.evaluate(() => document.activeElement?.dataset?.requestOpen || document.activeElement?.id || document.activeElement?.tagName), x.lead.id, 'Close returns focus to View request');
      assert.equal(await active(x), 'leads', 'Close keeps Inbox');
      await x.page.goBack(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'today'); assert.equal(await dialogOpen(x), false);
      await x.page.goForward(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'leads'); assert.equal(await dialogOpen(x), false, 'Forward to the page does not reopen a closed request');
      await x.page.goBack(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'today');
      await x.page.goBack(); await x.page.waitForURL(origin + '/start.html'); assert.equal(await x.page.title(), 'Public start');
    });
    await check(w + 'px 2. unsaved Business details survive Back and Forward', async () => {
      const x = await fixture(v); await navButton(x, 'setup').click().catch(() => {}); await toDetails(x);
      await setField(x.page, 'services', 'AC repair\nZoning');
      await x.page.goBack(); await x.page.waitForFunction(() => document.body.dataset.activePage !== 'know');
      await x.page.goForward(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'know');
      assert.equal(await x.page.locator('#cfg [name="services"]').inputValue(), 'AC repair\nZoning'); assert.equal(await x.page.locator('#cfg').getAttribute('data-save-state'), 'dirty');
    });
  }

  // ---------- 2b. Port: Back and Forward while a visit or support dialog is open (Codex review condition 2) ----------
  // One policy for popstate and hashchange: Back leaves the open dialog and its typed details in place, does not route the
  // page underneath, and restores the address. Once the dialog is closed, Back moves between pages again.
  const seedConversation = async x => { const conv = await store.getConversation(x.c, 'web', 'port-conversation'); conv.messages = [{ role: 'user', content: 'Can you help with an AC repair in Katy?', at: new Date().toISOString() }, { role: 'assistant', content: 'Synthetic answer.', at: new Date().toISOString() }]; await store.saveConversation(conv); await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); };
  const route = (x, tab) => x.page.evaluate(t => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: t } })), tab);
  for (const v of [vp, phone]) {
    const w = v.width;
    await check(w + 'px 2b. Back with a visit dialog open keeps Availability, the dialog and its typed name, and restores #availability; after Close, Back returns to Home', async () => {
      // Home is entered as #today first, so Back lands on a hash entry: the pre-fix hashchange listener routed that to Home.
      const x = await fixture(v); assert.equal(await active(x), 'today'); await route(x, 'today'); assert.equal(new URL(x.page.url()).hash, '#today');
      await route(x, 'availability'); await x.page.locator('#p-availability.on').waitFor(); assert.equal(new URL(x.page.url()).hash, '#availability');
      // The calendar's own Add visit button (#newVisit is hidden in this fixture).
      await x.page.locator('#calendarAddVisit').click(); await x.page.waitForFunction(() => document.getElementById('visitDialog').open);
      await x.page.locator('#visitName').fill('Jordan Visit'); const beforeBack = x.page.url();
      const lengthBefore = await x.page.evaluate(() => { window.__portPush = 0; const push = history.pushState.bind(history); history.pushState = function () { window.__portPush++; return push.apply(null, arguments); }; return history.length; });
      await x.page.goBack(); await x.page.waitForTimeout(400);
      // Rework: the hold traverses back to the held entry; it adds no entry from inside popstate (Chrome's history-manipulation intervention).
      assert.deepEqual(await x.page.evaluate(() => ({ pushes: window.__portPush, length: history.length })), { pushes: 0, length: lengthBefore }, 'the hold added history'); const afterBack = { url: x.page.url(), page: await active(x), title: await x.page.title() };
      assert.equal(await active(x), 'availability', 'Back with the visit dialog open routed the page underneath: ' + JSON.stringify(afterBack));
      assert.equal(await x.page.evaluate(() => document.getElementById('visitDialog').open), true, 'visit dialog stays open');
      assert.equal(await x.page.locator('#visitName').inputValue(), 'Jordan Visit', 'typed name kept');
      assert.equal(new URL(x.page.url()).hash, '#availability', 'address restored: ' + JSON.stringify(afterBack));
      assert.equal(x.page.url(), beforeBack, 'the exact address shown before Back, including the calendar date and view, is restored');
      await shot(x.page, 'back-visit-dialog-' + w); await noHorizontalScroll(x.page);
      await x.page.locator('#closeVisit').click(); await x.page.waitForFunction(() => !document.getElementById('visitDialog').open);
      await x.page.goBack(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'today'); assert.equal(new URL(x.page.url()).hash, '#today');
      await x.page.goForward(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'availability');
    });
    await check(w + 'px 2b. Back with a support dialog open keeps Conversations, the dialog and its typed note, and restores #convs; after Close, Back returns to Inbox', async () => {
      const x = await fixture(v); await seedConversation(x);
      await route(x, 'leads'); await x.page.locator('#p-leads.on').waitFor(); await route(x, 'convs'); await x.page.locator('#p-convs.on').waitFor();
      await x.page.locator('#convs .support-open').first().click(); await x.page.waitForFunction(() => document.getElementById('supportDialog').open);
      await x.page.locator('#supportNote').fill('Wrong advice about the condenser'); const beforeBack = x.page.url();
      await x.page.goBack(); await x.page.waitForTimeout(400);
      assert.equal(await active(x), 'convs', 'Back with the support dialog open routed the page underneath');
      assert.equal(await x.page.evaluate(() => document.getElementById('supportDialog').open), true, 'support dialog stays open');
      assert.equal(await x.page.locator('#supportNote').inputValue(), 'Wrong advice about the condenser', 'typed note kept');
      assert.equal(new URL(x.page.url()).hash, '#convs', 'address restored'); assert.equal(x.page.url(), beforeBack);
      await shot(x.page, 'back-support-dialog-' + w); await noHorizontalScroll(x.page);
      await x.page.locator('#supportClose').click(); await x.page.waitForFunction(() => !document.getElementById('supportDialog').open);
      await x.page.goBack(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'leads'); assert.equal(new URL(x.page.url()).hash, '#leads');
    });
  }
  await check('1440px 2b. Forward with a visit dialog open does not route either', async () => {
    const x = await fixture(vp); await route(x, 'availability'); await x.page.locator('#p-availability.on').waitFor();
    await x.page.goBack(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'today');
    await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:schedule-open-visit', { detail: {} }))); await x.page.waitForFunction(() => document.getElementById('visitDialog').open);
    await x.page.goForward(); await x.page.waitForTimeout(400);
    assert.equal(await active(x), 'today', 'Forward with the visit dialog open routed the page underneath'); assert.equal(new URL(x.page.url()).hash, '#today');
    assert.equal(await x.page.evaluate(() => document.getElementById('visitDialog').open), true);
  });

  // ---------- 2c. Port: website chat impact (cfgWebImpact / cfgWebNext from dfb0ae78) survives the port ----------
  for (const v of [vp, phone]) {
    await check(v.width + 'px 2c. saving Business details on a live website chat still warns that website chat is unavailable and offers Review business details', async () => {
      const x = await fixture(v, { live: true }); await toDetails(x);
      await setField(x.page, 'faq', 'Thermostat service? Ask us about thermostat service.'); await saveAfter(x, 1);
      const o = await outcome(x); assert.match(o.msg, /Website chat is unavailable/, JSON.stringify(o));
      const next = x.page.locator('#cfgWebNext'); await next.waitFor({ state: 'visible' }); assert.equal(await next.innerText(), 'Review business details'); assert.equal(await next.isEnabled(), true);
      const saved = await stored(x); assert.equal(saved.status, 'live'); assert.equal(saved.channels.web.active, true); assert.notEqual(saved.setupProof.reviewedRevision, configurationRevision(saved));
      assert.notEqual(await x.page.locator('#websiteInstallChat').innerText().catch(() => ''), 'Active now');
      await next.scrollIntoViewIfNeeded(); await shot(x.page, 'web-impact-' + v.width); await noHorizontalScroll(x.page);
      await next.click(); await x.page.waitForFunction(() => document.activeElement?.id === 'reviewRules'); assert.equal(await active(x), 'know');
    });
  }

  // ---------- 3. Return to place after re-sign-in ----------
  const signIn = async x => { await x.page.evaluate(token => { sessionStorage.removeItem('fixture-signed-out'); sessionStorage.setItem('mc-onboarding-session-v1', token); }, x.token); await x.page.goto(origin + '/desk.html?c=' + x.slug); await ready(x); await x.page.waitForTimeout(300); };
  const returnKey = x => x.page.evaluate(() => localStorage.getItem('mc-return-route-v1'));
  for (const v of [vp, phone]) {
    await check(v.width + 'px 3. a signed-out tab at #setup/voice/intro returns there after a fresh sign-in, once', async () => {
      const x = await fixture(v, { signedIn: false, hash: '#setup/voice/intro' }); await x.page.locator('#portalRecovery').waitFor({ state: 'visible' });
      const saved = JSON.parse(await returnKey(x)); assert.equal(saved.slug, x.slug); assert.equal(saved.hash, '#setup/voice/intro');
      await signIn(x); assert.equal(new URL(x.page.url()).hash, '#setup/voice/intro'); assert.equal(await active(x), 'setup'); assert.equal(await returnKey(x), null, 'key cleared');
      await shot(x.page, 'return-route-' + v.width); await noHorizontalScroll(x.page);
      await x.page.goto(origin + '/desk.html?c=' + x.slug); await ready(x); assert.equal(await active(x), 'today', 'used once');
    });
  }
  await check('3. stale, foreign or unknown stored routes are ignored and the owner lands on Home', async () => {
    for (const [label, value, keep] of [['stale', s => ({ slug: s, hash: '#leads', at: Date.now() - 31 * 60000 })], ['unknown hash', s => ({ slug: s, hash: '#setup/voice/<img src=x>', at: Date.now() })], ['javascript', s => ({ slug: s, hash: 'javascript:alert(1)', at: Date.now() })], ['other workspace', () => ({ slug: 'someone-else', hash: '#leads', at: Date.now() }), true], ['future', s => ({ slug: s, hash: '#leads', at: Date.now() + 3600000 })]]) {
      const x = await fixture(vp, { goto: false }); await x.page.goto(origin + '/start.html'); await x.page.evaluate(v => localStorage.setItem('mc-return-route-v1', JSON.stringify(v)), value(x.slug));
      await x.page.goto(origin + '/desk.html?c=' + x.slug); await ready(x); await x.page.waitForTimeout(200);
      assert.equal(await active(x), 'today', label); assert.equal((await returnKey(x)) !== null, !!keep, label + ' key handling');
      await x.context.close();
    }
  });
  await check('390px 3./4b. session expiry keeps the place and shows a calm signed-out heading; sign-in link keeps signin=1', async () => {
    const x = await fixture(phone, { hash: '#leads' }); await x.page.locator('#p-leads.on').waitFor();
    await store.atomicUpdate('access_sessions', accessHash(x.token), row => ({ value: { ...row, status: 'revoked' } }));
    await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await x.page.locator('#portalRecovery').waitFor({ state: 'visible' });
    assert.equal(await x.page.locator('#status').innerText(), 'Signed out'); assert.equal(JSON.parse(await returnKey(x)).hash, '#leads');
    assert.match(await x.page.locator('#portalRecovery a').getAttribute('href'), /^onboard\.html\?(?:.*&)?signin=1(?:&|$)/);
    await shot(x.page, 'session-expired-390'); await noHorizontalScroll(x.page);
  });
  await check('390px 4b. after Sign out the heading reads Signed out, not Unable to open workspace', async () => {
    const x = await fixture(phone); await x.page.locator('#deskSignOut').click(); await x.page.locator('#portalRecovery').waitFor({ state: 'visible' });
    assert.equal(await x.page.locator('#status').innerText(), 'Signed out'); assert.doesNotMatch(await x.page.locator('body').innerText(), /Unable to open workspace/);
    assert.equal(await returnKey(x), null, 'a chosen sign-out does not keep a return place');
    await shot(x.page, 'signed-out-390'); await noHorizontalScroll(x.page);
  });

  // ---------- 4a. Blocked time after a lost response ----------
  const toBlocks = async x => { await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: 'availability' } }))); await x.page.evaluate(() => { document.getElementById('scheduleBlockManager').open = true; }); await x.page.locator('#availabilityDate').waitFor({ state: 'visible' }); };
  for (const v of [vp, phone]) {
    await check(v.width + 'px 4a. a block saved behind a lost response is confirmed from a read-only re-fetch and listed', async () => {
      const x = await fixture(v); await toBlocks(x); const day = houstonDate(3); await x.page.locator('#availabilityDate').fill(day);
      x.state.postFault = 'after'; await x.page.locator('#availabilitySubmit').click();
      await x.page.waitForFunction(() => !/Saving|Checking/.test(document.getElementById('availabilityMessage').textContent) && document.getElementById('availabilityMessage').textContent);
      const posts = x.state.requests.filter(r => r.method === 'POST'); assert.equal(posts.length, 1, 'never resent'); assert.equal(posts[0].fixture, 'lost-after-handler');
      assert.match(await x.page.locator('#availabilityMessage').innerText(), /Time blocked/); assert.doesNotMatch(await x.page.locator('#availabilityBlocks').innerText(), /No unavailable time added/);
      assert.equal(await x.page.locator('#availabilityBlocks .availability-row').count(), 1);
      await x.page.locator('#availabilityMessage').scrollIntoViewIfNeeded(); await shot(x.page, 'block-reconciled-' + v.width); await noHorizontalScroll(x.page);
    });
  }
  await check('390px 4a. when the re-fetch is lost too, Reload availability is offered and confirms the block', async () => {
    const x = await fixture(phone); await toBlocks(x); await x.page.locator('#availabilityDate').fill(houstonDate(4));
    x.state.postFault = 'after'; x.state.getFault = 'lost'; await x.page.locator('#availabilitySubmit').click();
    const reload = x.page.locator('#availabilityReload'); await reload.waitFor({ state: 'visible' });
    assert.match(await x.page.locator('#availabilityMessage').innerText(), /Reload availability/); await reload.scrollIntoViewIfNeeded(); await shot(x.page, 'block-reload-390'); await noHorizontalScroll(x.page);
    await reload.click(); await x.page.waitForFunction(() => /Time blocked/.test(document.getElementById('availabilityMessage').textContent));
    assert.equal(await reload.isVisible(), false); assert.equal(x.state.requests.filter(r => r.method === 'POST').length, 1, 'reload never resends the change');
    assert.equal(await x.page.locator('#availabilityBlocks .availability-row').count(), 1);
  });

  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close();
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, failing: report.checks.filter(c => !c.pass).map(c => c.name) };
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary), JSON.stringify(report.served));
}
