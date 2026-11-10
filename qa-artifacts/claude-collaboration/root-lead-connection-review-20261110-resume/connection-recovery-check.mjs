// Browser check: phone, text and Google Calendar connection actions under transport and reply faults
// (card AUTO-REVIEW-578CE4BAE45F1CF9), plus the read-only activity report and private-review loads.
// Actual owner handlers in-process (routed by config.path), MC_MEMORY_STORE=1, MC_FAKE_MODEL=1, provider env deleted,
// physical transport denied, Playwright context.route serves this worktree's files. No provider, Google or email call.
// Faults per action, each at 1440 and 390:
//   abort-before  the POST never reaches the handler (route.abort); nothing is saved
//   lost-after    the actual handler commits, then the browser sees a network failure
//   html-5xx      a gateway returns 502 text/html before the handler; nothing is saved
//   json-4xx      a definite JSON 409/410 with the server's message; nothing is saved
//   slow          the handler commits, the reply is held past the 20s client timeout (Playwright clock fast-forward)
// Calendar return (complete_calendar_connection) cannot commit offline: the handler needs Google env. For lost-after and
// slow the fixture writes the connected calendar row itself (the handler's final store write), then the reply is lost.
// --serve-base serves desk-connections.js and desk-activity.js from the base commit (git show) to prove each case fails there.
// --serve-connections <file> serves that desk-connections.js instead (used to prove the QA-note cases fail on a27147ab).
// Phone answering requests are gated offline, so the voice re-request cases patch only the GET's voice offer to available
// and commit the intent the way the engine does (same id, new updatedAt, submitted forwardingMode) before losing the reply.
// Usage (from the worktree root):
//   MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell> node qa-artifacts/claude-collaboration/connection-errors/connection-errors-ui-check.mjs \
//     --output scratchpad/claude-connerr-<name>.json [--serve-base] [--only <substring>]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), origin = 'http://127.0.0.1:8931';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only'), serveBase = process.argv.includes('--serve-base');
if (!output || !/^scratchpad\/claude-connerr-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-connerr-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const baseCommit = execFileSync('git', ['rev-parse', 'dfb0ae78'], { encoding: 'utf8' }).trim();
const BASE_SERVED = ['desk-connections.js', 'desk-activity.js'];
const baseBytes = Object.fromEntries(BASE_SERVED.map(f => [f, execFileSync('git', ['show', baseCommit + ':' + f])]));
const serveConnections = arg('--serve-connections');
const servedBytes = file => file === 'desk-connections.js' && serveConnections ? readFileSync(serveConnections) : serveBase && baseBytes[file] ? baseBytes[file] : readFileSync(file);
const watched = ['desk.html', 'desk.js', 'desk-setup-guide.js', 'desk-connections.js', 'desk-activity.js', 'desk-visits.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/calendar-connection.mjs', 'netlify/functions/lib/voice-activation.mjs', 'netlify/functions/lib/messaging-activation.mjs', 'qa-artifacts/claude-collaboration/root-lead-connection-review-20261110-resume/connection-recovery-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', serveBase, serveConnections: serveConnections || null, baseCommit, served: Object.fromEntries(BASE_SERVED.map(f => [f, sha(servedBytes(f))])), sourceBefore: hashes(), checks: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin, PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }); // synthetic at-rest key, as in connector-pages-ui-check
const deny = () => { report.physicalNetwork++; throw new Error('Connection errors check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../netlify/functions/lib/config.mjs');
const calendarLib = await import('../../../netlify/functions/lib/calendar-connection.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect', 'google', 'chat', 'website-installation']) {
  const mod = await import('../../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
report.handlers = Object.keys(handlers); report.browser = process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome';
const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
let serial = 0; const contexts = [];
const tenant = c => sha(JSON.stringify([c.slug, c.ownerKey, String(c.owner?.email || '').trim().toLowerCase()]));

async function seed(width, kind) {
  const slug = 'connerr-' + ++serial + '-' + width, token = sha('connerr-token-' + slug);
  const channels = kind === 'voice' ? ['voice'] : kind === 'sms' ? ['sms'] : kind === 'web' ? ['web'] : ['calendar'];
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Connector Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture-shop.example.com' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: channels }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c);
  const now = new Date().toISOString();
  if (kind === 'voice') { const id = slug + '/' + sha('managed-voice-v1:' + tenant(c)); await store.put('voice_activation_intents', id, { id, tenantIdentity: tenant(c), state: 'waiting_platform', forwardingMode: 'use_new_number', createdAt: now, updatedAt: now }); }
  if (kind === 'sms') { const id = slug + '/' + sha('messaging-v1:' + tenant(c)); await store.put('messaging_activation', id, { id, tenantIdentity: tenant(c), state: 'waiting_platform', submissionRevision: 1, history: [], createdAt: now, updatedAt: now }); }
  if (kind === 'calendar-connected') await store.put('calendar_connections', slug, { slug, tenantIdentity: calendarLib.calendarTenantIdentity(c), status: 'connected', label: 'Google Calendar', connectionId: 'qa-connerr-' + serial, connectedAt: now, grantEpoch: 1, availabilityConsentVersion: calendarLib.CALENDAR_AVAILABILITY_CONSENT_VERSION });
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, c, width };
}
async function open(x, { height = 900, hash = '#setup', fault = null, calendarReturn = null, clock = false } = {}) {
  const { slug, token, width } = x;
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
  await context.addInitScript(({ origin, slug, token, calendarReturn }) => {
    if (location.origin !== origin) return;
    if (!sessionStorage.getItem('mc-onboarding-session-v1')) sessionStorage.setItem('mc-onboarding-session-v1', token);
    localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen');
    if (calendarReturn && !sessionStorage.getItem('mc-calendar-pending-v1')) sessionStorage.setItem('mc-calendar-pending-v1', JSON.stringify(calendarReturn));
    // Record every status text the owner could have seen, in order.
    window.__seen = [];
    const capture = () => { for (const n of document.querySelectorAll('[role=status],[role=alert],#connectionDialogMessage,#serviceConnectionMessage')) { const t = (n.textContent || '').trim(); if (t && window.__seen.at(-1) !== t && !window.__seen.includes(t)) window.__seen.push(t); } };
    new MutationObserver(capture).observe(document, { subtree: true, childList: true, characterData: true });
  }, { origin, slug, token, calendarReturn });
  const state = x.state = { fault, requests: [], release: null };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === 'https://accounts.google.com') { (report.oauthNavigation ||= []).push(url.href); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Intercepted Google boundary</title>' }); }
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      const action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, query: url.search, method, action };
      state.requests.push(item); report.requests.push(item);
      if (state.failNextRead > 0 && method === 'GET' && url.pathname === '/api/client' && url.search === '?c=' + slug) { state.failNextRead--; item.fault = 'read-fails'; return route.abort('failed'); }
      if (state.patchGet && method === 'GET' && url.pathname === '/api/client' && url.search === '?c=' + slug) { const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers() }), { ip: '192.0.2.71' }); item.status = response.status; const json = await response.json(); state.patchGet(json); return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(json) }); }
      if (state.postHandler && method === 'POST' && action === state.postHandler.action) { item.body = body; return state.postHandler.handle(route, body, item); }
      const f = state.fault, target = f && !f.used && (f.match ? f.match(method, url, body) : method !== 'GET' && action === f.action);
      const run = async () => { const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' }); item.status = response.status; return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }; };
      if (target) {
        f.used = true; item.fault = f.kind;
        if (f.kind === 'abort-before') { if (f.failRead) state.failNextRead = f.failRead; return route.abort('failed'); }
        if (f.kind === 'html-5xx') return route.fulfill({ status: 502, contentType: 'text/html', body: '<!doctype html><html><body><h1>502 Bad Gateway</h1></body></html>' });
        if (f.kind === 'json-4xx') return route.fulfill({ status: f.status || 409, contentType: 'application/json', body: JSON.stringify({ error: f.code || 'configuration_changed', message: f.message }) });
        if (f.kind === 'slow-read') { await new Promise(r => { state.release = r; }); const late = await run(); return route.fulfill(late).catch(() => {}); }
        const result = f.commit ? (await f.commit(), { status: 202, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"ok":true}') }) : await run();
        item.committed = true;
        if (f.kind === 'lost-after') return route.abort('failed');
        if (f.kind === 'slow') { await new Promise(r => { state.release = r; }); return route.fulfill(result).catch(() => {}); }
        if (f.kind === 'html-after') return route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' });
      }
      const result = await run();
      return route.fulfill(result);
    }
    const file = decodeURIComponent(url.pathname).replace(/^\//, ''), path = resolve(root, file);
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const bytes = servedBytes(file); if (BASE_SERVED.includes(file)) (report.servedSeen ||= {})[file] = sha(bytes);
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', body: bytes });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  if (clock) await page.clock.install();
  await page.goto(origin + '/desk.html?c=' + slug + hash); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  Object.assign(x, { page, context });
  return x;
}

// ---------- helpers ----------
async function check(name, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length, t0 = Date.now();
  try { await run(); report.checks.push({ name, pass: true, ms: Date.now() - t0 }); console.log('PASS ' + name); }
  catch (error) {
    const entry = { name, pass: false, ms: Date.now() - t0, error: String(error.stack || error).slice(0, 2000) }; report.checks.push(entry); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0].slice(0, 300));
    const page = contexts.at(-1)?.pages().at(-1);
    if (page) { entry.state = await snapshot(page).catch(() => null); entry.screenshot = await shot(page, 'failure-' + report.checks.length).catch(() => null); }
  } finally { await Promise.all(contexts.slice(start).map(context => context.close().catch(() => {}))); }
}
async function shot(page, name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path, fullPage: false }); report.screenshots.push(path); return path; }
async function snapshot(page) {
  return page.evaluate(() => {
    const vis = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
    const a = document.activeElement;
    return { hash: location.hash, view: document.getElementById('setupGuide')?.dataset.connectorView, focus: a === document.body ? 'BODY' : (a?.id || a?.tagName) + ':' + (a?.textContent || '').trim().slice(0, 40), seen: window.__seen, visible: visibleStatus(), dialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.id + ':' + d.innerText.slice(0, 500)) };
    function visibleStatus() { return [...document.querySelectorAll('[role=status],[role=alert],#connectionDialogMessage,#serviceConnectionMessage')].filter(n => vis(n) && n.textContent.trim()).map(n => n.textContent.trim()); }
  });
}
const RAW = /Failed to fetch|Load failed|NetworkError|JSON|Unexpected (token|end)|SyntaxError|not valid|AbortError|signal is aborted/i;
const UNKNOWN = /couldn[’']t confirm whether your change was saved/i;
const CLAIM = /Your change is saved|access is saved|is disconnected|Google account access is saved|Calendar connected|Connection verified/i;
async function focusState(page) {
  return page.evaluate(() => { const a = document.activeElement, r = a?.getBoundingClientRect(); return { body: !a || a === document.body || a === document.documentElement, id: a?.id || a?.tagName, text: (a?.textContent || '').trim().slice(0, 60), visible: !!a && a.getClientRects().length > 0 && getComputedStyle(a).visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight }; });
}
async function settle(page, ms = 600) { await page.waitForTimeout(ms); }
const posts = (x, action) => x.state.requests.filter(r => r.method === 'POST' && r.action === action);
const reads = (x, after) => x.state.requests.slice(after).filter(r => r.method === 'GET' && r.path === '/api/client' && r.query === '?c=' + x.slug);
async function waitFor(page, fn, arg, timeout = 8000) { return page.waitForFunction(fn, arg, { timeout }); }
async function noHorizontalScroll(page, where) {
  const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, dialogs: [...document.querySelectorAll('dialog[open]')].map(d => ({ id: d.id, scroll: d.scrollWidth, client: d.clientWidth })) }));
  assert.ok(v.doc <= v.vw + 1 && v.dialogs.every(d => d.scroll <= d.client + 1), 'Horizontal scroll at ' + where + ': ' + JSON.stringify(v));
}

// ---------- action definitions ----------
// Each opens the owner's actual control and submits it. evidence(x) reads the store to prove whether it committed.
const ACTIONS = {
  'phone disconnect': {
    seed: 'voice', action: 'cancel_voice_activation', dialog: true,
    message4xx: 'Refresh your workspace before cancelling phone setup.',
    async start(page) { await openControls(page); await page.locator('#serviceConnections [data-connection="cancel_voice"]').click(); await page.locator('#connectionForm').waitFor(); await page.locator('#connectionForm button[type=submit]').focus(); await page.keyboard.press('Enter'); },
    async committed(x) { const row = (await store.list('voice_activation_intents', x.slug)); const v = await store.get('voice_activation_intents', row[0]); return !!v?.cancelRequestedAt; },
    savedCopy: /Your change is saved/
  },
  'text disconnect': {
    seed: 'sms', action: 'cancel_messaging_activation', dialog: true,
    message4xx: 'Review the current business setup before continuing.',
    async start(page) { await openControls(page); await page.locator('#serviceConnections [data-connection="cancel_sms"]').click(); await page.locator('#connectionForm').waitFor(); await page.locator('#connectionForm button[type=submit]').focus(); await page.keyboard.press('Enter'); },
    async committed(x) { const row = (await store.list('messaging_activation', x.slug)); const v = await store.get('messaging_activation', row[0]); return !!v?.cancelRequestedAt; },
    savedCopy: /Your change is saved/
  },
  'calendar disconnect': {
    seed: 'calendar-connected', action: 'disconnect_calendar', dialog: true,
    message4xx: 'Your workspace changed. Refresh and try again.',
    async start(page) { await openControls(page); await page.locator('#serviceConnections [data-connection="disconnect_calendar"]').click(); await page.locator('#connectionForm').waitFor(); await page.locator('#connectionForm button[type=submit]').focus(); await page.keyboard.press('Enter'); },
    async committed(x) { return (await store.get('calendar_connections', x.slug))?.status === 'disconnected'; },
    savedCopy: /Your change is saved/
  },
  'calendar start': {
    // Gated offline (no Google env), so the connector page shows a hold; the guide's own Connect button dispatches this event.
    seed: 'calendar', action: 'start_calendar_connection', dialog: true, gatedOffline: true,
    message4xx: 'Review the current Calendar access details, then choose Continue to Google.',
    async start(page) { await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:connection-action', { detail: { action: 'start_calendar' } }))); await page.locator('#connectionForm').waitFor(); await page.locator('#connectionForm button[type=submit]').focus(); await page.keyboard.press('Enter'); },
    async committed() { return false; },   // A start never connects; it can only reserve a one-use Google state.
    savedCopy: null
  },
  'calendar return': {
    seed: 'calendar', action: 'complete_calendar_connection', dialog: false, auto: true,
    message4xx: 'This calendar link expired, was already used, or belongs to another sign-in. Connect again.', status4xx: 410, code4xx: 'invalid_state',
    async commit(x) { await store.put('calendar_connections', x.slug, { slug: x.slug, tenantIdentity: calendarLib.calendarTenantIdentity(x.c), status: 'connected', label: 'Google Calendar', connectionId: 'qa-return-' + x.slug, connectedAt: new Date().toISOString(), grantEpoch: 1, availabilityConsentVersion: calendarLib.CALENDAR_AVAILABILITY_CONSENT_VERSION }); },
    async committed(x) { return (await store.get('calendar_connections', x.slug))?.status === 'connected'; },
    savedCopy: /Google account access is saved/
  }
};
async function openControls(page) {
  const details = page.locator('#connectionServiceDetails'); await details.waitFor();
  if (!(await details.evaluate(d => d.open))) await details.locator('summary').click();
}
function calendarReturnFor(x) {
  const state = sha('state-' + x.slug), binding = sha(x.token);
  return { pending: { slug: x.slug, state, expiresAt: new Date(Date.now() + 9 * 60000).toISOString(), sessionBinding: binding }, hash: '#calendar_state=' + state + '&calendar_code=fixture-code-' + serial };
}

const WIDTHS = [[1440, 900], [390, 844]];
const FAULTS = ['abort-before', 'lost-after', 'html-5xx', 'json-4xx', 'slow'];
for (const [width, height] of WIDTHS) for (const [name, def] of Object.entries(ACTIONS)) for (const kind of FAULTS) {
  await check(`${name} · ${kind} (${width})`, async () => {
    const x = await seed(width, def.seed);
    const fault = { kind, action: def.action, message: def.message4xx, status: def.status4xx, code: def.code4xx, ...(def.commit && ['lost-after', 'slow'].includes(kind) ? { commit: () => def.commit(x) } : {}) };
    let ret = null; if (def.auto) ret = calendarReturnFor(x);
    await open(x, { height, hash: ret ? ret.hash : '#setup', fault, calendarReturn: ret?.pending, clock: kind === 'slow' });
    const { page } = x;
    if (!def.auto) await def.start(page);
    await waitFor(page, () => true);
    // Wait until the faulted POST was attempted.
    for (let i = 0; i < 80 && !posts(x, def.action).length; i++) await page.waitForTimeout(100);
    assert.equal(posts(x, def.action).length, 1, 'One POST for ' + def.action);
    if (kind === 'slow') {
      await settle(page, 400);
      const during = await snapshot(page);
      assert.ok(during.seen.some(t => /Saving your connection|Connecting your Google Calendar/.test(t)), 'Progress status shown while the reply is slow: ' + JSON.stringify(during.seen));
      await page.clock.fastForward('00:21');
      await settle(page, 300); x.state.release?.();
    }
    const readsFrom = x.state.requests.length;
    await settle(page, 900);
    const committed = await def.committed(x);
    if (['lost-after', 'slow'].includes(kind) && def.action !== 'start_calendar_connection') assert.ok(committed, 'Fixture: the change committed before the reply was lost');
    if (['abort-before', 'html-5xx', 'json-4xx'].includes(kind)) assert.ok(!committed, 'Fixture: nothing committed');
    let st = await snapshot(page);
    const allText = st.seen.join(' | ');
    assert.ok(!RAW.test(allText), 'Raw transport/parse error shown: ' + allText.match(RAW)?.[0] + ' in ' + JSON.stringify(st.seen));
    if (kind === 'json-4xx') {
      assert.ok(st.visible.some(t => t.includes(def.message4xx)), 'Server 4xx message visible: ' + JSON.stringify(st.visible));
      assert.ok(!UNKNOWN.test(allText), '4xx is definite, not unknown: ' + allText);
      assert.ok(!CLAIM.test(allText), 'No saved claim on a 4xx: ' + allText);
    } else {
      assert.ok(st.seen.some(t => UNKNOWN.test(t)), 'Unknown outcome says it could not confirm whether the change was saved: ' + JSON.stringify(st.seen));
      if (def.dialog) {
        // The owner's input stays in place, and the offered check is a read-only GET.
        assert.ok(st.dialogs.some(d => d.startsWith('connectionDialog:')), 'Dialog (owner input) kept open: ' + JSON.stringify(st.dialogs));
        const checkButton = page.locator('#connectionStatusCheck');
        await checkButton.waitFor({ state: 'visible' });
        const f0 = await focusState(page); assert.ok(!f0.body && f0.visible, 'Focus after the unknown outcome: ' + JSON.stringify(f0));
        assert.equal(posts(x, def.action).length, 1, 'No automatic duplicate write');
        const before = x.state.requests.length;
        await checkButton.click();
        await settle(page, 1200);
        assert.ok(reads(x, before).length >= 1, 'Status check issued a GET');
        assert.equal(x.state.requests.slice(before).filter(r => r.method !== 'GET').length, 0, 'Status check is read-only');
      } else {
        assert.ok(reads(x, readsFrom - 2).length >= 1 || x.state.requests.filter(r => r.method === 'GET' && r.query === '?c=' + x.slug).length >= 2, 'Read-only status check ran after the unknown outcome');
      }
      st = await snapshot(page);
      const finalText = st.visible.join(' | ');
      if (committed && def.savedCopy) {
        assert.ok(def.savedCopy.test(finalText), 'Positive server evidence leads to the saved message: ' + JSON.stringify(st.visible));
        assert.equal(st.dialogs.length, 0, 'Dialog closes after confirmed save');
      } else {
        assert.ok(!CLAIM.test(finalText), 'No saved/connected claim without server evidence: ' + finalText);
        assert.ok(UNKNOWN.test(finalText) || /Nothing is connected|not connected yet/i.test(finalText), 'Still honest after the check: ' + JSON.stringify(st.visible));
        if (def.dialog) { assert.ok(st.dialogs.length === 1, 'Dialog with input kept for an owner retry'); assert.ok(await page.locator('#connectionForm button[type=submit]').isEnabled(), 'Owner can submit again after the check'); }
      }
    }
    assert.equal(posts(x, def.action).length, 1, 'Never an automatic duplicate write');
    const focus = await focusState(page);
    assert.ok(!focus.body, 'Focus landed on body: ' + JSON.stringify(focus));
    assert.ok(focus.visible, 'Focused control is visible: ' + JSON.stringify(focus));
    await noHorizontalScroll(page, name + ' ' + kind + ' ' + width);
    if (kind !== 'slow' || width === 390) await shot(page, name.replace(/\s/g, '-') + '-' + kind + '-' + width);
    (report.observations ||= []).push({ case: `${name} · ${kind} (${width})`, committed, seen: st.seen, visible: st.visible, focus });
  });
}

// ---------- the read-only status check itself fails, then succeeds on the owner's retry ----------
// The calendar return issues two reads after an unknown outcome (desk.js mc:desk-refresh, then the status check), so both fail.
for (const [width, height] of WIDTHS) for (const name of ['phone disconnect', 'calendar return']) {
  await check(`${name} · abort-before, status read also fails, owner retries the check (${width})`, async () => {
    const def = ACTIONS[name], x = await seed(width, def.seed), ret = def.auto ? calendarReturnFor(x) : null;
    await open(x, { height, hash: ret ? ret.hash : '#setup', fault: { kind: 'abort-before', action: def.action, failRead: def.auto ? 2 : 1 }, calendarReturn: ret?.pending });
    const { page } = x;
    if (!def.auto) { await def.start(page); await page.locator('#connectionStatusCheck').waitFor({ state: 'visible' }); await page.locator('#connectionStatusCheck').click(); }
    await settle(page, 1200);
    let st = await snapshot(page);
    assert.ok(!RAW.test(st.seen.join(' | ')), 'Raw error: ' + JSON.stringify(st.seen));
    assert.ok(st.visible.some(t => UNKNOWN.test(t) && /couldn’t be checked either/.test(t)), 'Both unknowns stated: ' + JSON.stringify(st.visible));
    assert.ok(!CLAIM.test(st.visible.join(' | ')), 'No saved claim: ' + st.visible.join(' | '));
    const retry = page.locator(def.dialog ? '#connectionStatusCheck' : '#connectorReadbackRetry');
    await retry.waitFor({ state: 'visible' });
    let focus = await focusState(page); assert.ok(!focus.body && focus.visible, 'Focus after the failed check: ' + JSON.stringify(focus));
    if (def.dialog) assert.ok(await page.locator('#connectionForm button[type=submit]').isDisabled(), 'Resubmission held until the outcome is checked');
    const before = x.state.requests.length;
    await retry.click(); await settle(page, 1200);
    assert.ok(reads(x, before).length >= 1 && x.state.requests.slice(before).every(r => r.method === 'GET'), 'Retry is a read-only GET');
    st = await snapshot(page);
    assert.ok(st.visible.some(t => UNKNOWN.test(t) && /doesn’t confirm it|shows Google Calendar is not connected/.test(t)), 'After a good read the outcome is still honestly unconfirmed: ' + JSON.stringify(st.visible));
    assert.equal(posts(x, def.action).length, 1, 'No automatic duplicate write');
    focus = await focusState(page); assert.ok(!focus.body && focus.visible, 'Focus after the retried check: ' + JSON.stringify(focus));
    await shot(page, name.replace(/\s/g, '-') + '-read-fails-' + width);
    (report.observations ||= []).push({ case: `${name} · read fails (${width})`, seen: st.seen, visible: st.visible, focus });
  });
}

// ---------- QA notes 1 and 5 ----------
const voiceId = x => x.slug + '/' + sha('managed-voice-v1:' + tenant(x.c));
const VOICE_OFFER = { version: 'connerr_voice_v1', digest: 'b'.repeat(64), usageDisclosure: 'Synthetic usage disclosure for phone answering (fixture).', authorityText: 'I am authorized to connect this business phone service (fixture).', maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, available: true };
async function voiceReRequest(width, height, commit) {
  const x = await seed(width, 'voice'); await open(x, { height });
  const before = await store.get('voice_activation_intents', voiceId(x));
  x.state.patchGet = json => { if (json.connections?.voice) { json.connections.voice.available = true; json.connections.voice.offer = VOICE_OFFER; } };
  x.state.postHandler = { action: 'request_voice_activation', handle: async (route, body, item) => {
    if (commit) { await new Promise(r => setTimeout(r, 5)); const old = await store.get('voice_activation_intents', voiceId(x)); await store.put('voice_activation_intents', voiceId(x), { ...old, forwardingMode: body.forwardingMode, state: 'waiting_platform', inputRevision: body.expectedRevision, generation: (old.generation || 1) + 1, updatedAt: new Date().toISOString() }); item.committed = true; }
    item.fault = commit ? 'lost-after' : 'abort-before'; return route.abort('failed');
  } };
  await x.page.reload(); await x.page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  const { page } = x;
  assert.ok(await page.evaluate(() => true));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:connection-action', { detail: { action: 'review_voice' } })));
  await page.locator('#connectionForm').waitFor(); await page.locator('#connectionForm input[name=authority]').check();
  await page.locator('#connectionForm button[type=submit]').focus(); await page.keyboard.press('Enter');
  for (let i = 0; i < 50 && !posts(x, 'request_voice_activation').length; i++) await page.waitForTimeout(100);
  await settle(page, 800);
  let st = await snapshot(page);
  assert.ok(st.visible.some(t => UNKNOWN.test(t)), 'Unknown copy after the lost reply: ' + JSON.stringify(st.visible));
  const r0 = x.state.requests.length; await page.locator('#connectionStatusCheck').click(); await settle(page, 1200);
  assert.ok(reads(x, r0).length >= 1 && x.state.requests.slice(r0).every(r => r.method === 'GET'), 'Status check is a read-only GET');
  assert.equal(posts(x, 'request_voice_activation').length, 1, 'No automatic duplicate write');
  st = await snapshot(page);
  const after = await store.get('voice_activation_intents', voiceId(x));
  return { x, page, st, before, after };
}
for (const [width, height] of WIDTHS) {
  await check(`phone request · existing intent, committed re-request, lost reply, no receipt keeps outcome unknown (${width})`, async () => {
    const { page, st, before, after } = await voiceReRequest(width, height, true);
    assert.ok(before && after.updatedAt !== before.updatedAt && after.id === before.id, 'Fixture: same intent rewritten');
    assert.ok(st.visible.some(t => UNKNOWN.test(t)), 'Committed request lacks a request-specific receipt: ' + JSON.stringify(st.visible));
    assert.ok(!CLAIM.test(st.visible.join(' | ')), 'No saved claim from updatedAt alone');
    assert.equal(st.dialogs.length, 1, 'Dialog stays open with the owner input');
    assert.ok(await page.locator('#connectionForm input[name=authority]').isChecked(), 'Owner input kept');
    const focus = await focusState(page); assert.ok(!focus.body && focus.visible, 'Focus: ' + JSON.stringify(focus));
    await shot(page, 'phone-request-existing-intent-lost-after-' + width);
    (report.observations ||= []).push({ case: 'phone request re-request lost-after ' + width, visible: st.visible, focus });
  });
  await check(`phone request · existing intent, re-request never arrived, no saved claim (${width})`, async () => {
    const { page, st, before, after } = await voiceReRequest(width, height, false);
    assert.equal(after.updatedAt, before.updatedAt, 'Fixture: intent unchanged');
    assert.ok(!CLAIM.test(st.visible.join(' | ')), 'No saved claim: ' + st.visible.join(' | '));
    assert.ok(st.visible.some(t => UNKNOWN.test(t) && /doesn’t confirm it/.test(t)), 'Honestly unconfirmed: ' + JSON.stringify(st.visible));
    assert.ok(await page.locator('#connectionForm input[name=authority]').isChecked(), 'Owner input kept');
    const focus = await focusState(page); assert.ok(!focus.body && focus.visible, 'Focus: ' + JSON.stringify(focus));
  });
  await check(`held change stays visible when the dialog is closed and reopened (phone disconnect, ${width})`, async () => {
    const def = ACTIONS['phone disconnect'], x = await seed(width, def.seed);
    await open(x, { height, fault: { kind: 'abort-before', action: def.action } });
    const { page } = x; await def.start(page);
    await page.locator('#connectionStatusCheck').waitFor({ state: 'visible' });
    await page.locator('#connectionBack').click(); await page.locator('#connectionDialog').waitFor({ state: 'hidden' });
    await page.locator('#serviceConnections [data-connection="cancel_voice"]').click(); await page.locator('#connectionForm').waitFor();
    await settle(page, 300);
    const st = await snapshot(page);
    assert.ok(st.dialogs.some(d => UNKNOWN.test(d)), 'Reopened dialog shows the held, unconfirmed change: ' + JSON.stringify(st.dialogs));
    assert.ok(await page.locator('#connectionStatusCheck').isVisible(), 'Check saved status offered');
    assert.ok(await page.locator('#connectionForm button[type=submit]').isDisabled(), 'Submit held, not silently turned into a check');
    const focus = await focusState(page); assert.ok(!focus.body && focus.visible, 'Focus: ' + JSON.stringify(focus));
    const r0 = x.state.requests.length; await page.locator('#connectionStatusCheck').click(); await settle(page, 1200);
    assert.ok(x.state.requests.slice(r0).every(r => r.method === 'GET') && reads(x, r0).length >= 1, 'Check is a read-only GET');
    assert.equal(posts(x, def.action).length, 1, 'No duplicate write');
    await shot(page, 'phone-disconnect-reopened-hold-' + width);
  });
}

// ---------- read-only loads: activity report ----------
for (const [width, height] of WIDTHS) for (const kind of ['abort-before', 'html-5xx', 'json-4xx', 'slow']) {
  await check(`activity report · ${kind} (${width})`, async () => {
    const x = await seed(width, 'web');
    const fault = { kind, match: (method, url) => method === 'GET' && url.searchParams.get('report') === 'activity', message: 'Choose a report period of 7, 30 or 90 days.', status: 400, code: 'invalid_report' };
    if (kind === 'slow') fault.kind = 'slow-read';
    await open(x, { height, hash: '', fault, clock: kind === 'slow' });
    const { page } = x;
    if (!(await page.locator('#homeActivityDetails').evaluate(d => d.open))) await page.locator('#homeActivityDetails > summary').click();
    await page.locator('#activityReportLoad').waitFor({ state: 'visible' });
    await page.locator('#activityReportLoad').focus(); await page.keyboard.press('Enter');
    if (kind === 'slow') {
      // Hold the GET past the 25s client timeout.
      await settle(page, 400); await page.clock.fastForward('00:26'); await settle(page, 300);
    }
    await settle(page, 700);
    const st = await snapshot(page), status = await page.locator('#activityReportStatus').textContent();
    assert.ok(!RAW.test(status), 'Raw error in the report status: ' + status);
    if (kind === 'json-4xx') assert.equal(status, 'Choose a report period of 7, 30 or 90 days.');
    else assert.match(status, kind === 'abort-before' ? /couldn’t be checked\. Check your connection/ : kind === 'html-5xx' ? /^The complete report could not be checked\. Please try again\.$/ : /took too long/);
    assert.ok(await page.locator('#activityReportLoad').isEnabled(), 'Owner can try again');
    const focus = await focusState(page);
    assert.ok(!focus.body && focus.visible, 'Focus after the report failure: ' + JSON.stringify(focus));
    (report.observations ||= []).push({ case: `activity report · ${kind} (${width})`, status, focus, seen: st.seen });
  });
}

// ---------- finish ----------
await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0;
report.checks.push({ name: 'hygiene: no physical or forbidden requests and no page errors (all checks)', pass: globalsPass, ...(globalsPass ? {} : { error: JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors }) }) });
report.checks.push({ name: 'source unchanged during the run (sourceBefore === sourceAfter)', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.checks.push({ name: 'served desk-connections.js / desk-activity.js match the pinned mode (' + (serveConnections ? 'connections=' + serveConnections : serveBase ? 'base' : 'worktree') + ')', pass: BASE_SERVED.every(f => !report.servedSeen?.[f] || report.servedSeen[f] === report.served[f]) });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.durationMs = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' in ' + Math.round(report.durationMs / 1000) + 's -> ' + output);
process.exit(report.passed === report.total ? 0 : 1);
