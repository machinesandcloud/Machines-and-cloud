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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), origin = 'http://127.0.0.1:8931';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only'), serveBase = process.argv.includes('--serve-base');
if (!output || !/^scratchpad\/claude-connerr-qa-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-connerr-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const baseCommit = execFileSync('git', ['rev-parse', 'dfb0ae78'], { encoding: 'utf8' }).trim();
const BASE_SERVED = ['desk-connections.js', 'desk-activity.js'];
const baseBytes = Object.fromEntries(BASE_SERVED.map(f => [f, execFileSync('git', ['show', baseCommit + ':' + f])]));
const servedBytes = file => serveBase && baseBytes[file] ? baseBytes[file] : readFileSync(file);
const watched = ['desk.html', 'desk.js', 'desk-setup-guide.js', 'desk-connections.js', 'desk-activity.js', 'desk-visits.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/calendar-connection.mjs', 'netlify/functions/lib/voice-activation.mjs', 'netlify/functions/lib/messaging-activation.mjs', 'qa-artifacts/claude-collaboration/connection-errors/connection-errors-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', serveBase, baseCommit, served: Object.fromEntries(BASE_SERVED.map(f => [f, sha(servedBytes(f))])), sourceBefore: hashes(), checks: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin, PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }); // synthetic at-rest key, as in connector-pages-ui-check
const deny = () => { report.physicalNetwork++; throw new Error('Connection errors check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../../netlify/functions/lib/config.mjs');
const calendarLib = await import('../../../../netlify/functions/lib/calendar-connection.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect', 'google', 'chat', 'website-installation']) {
  const mod = await import('../../../../netlify/functions/' + file + '.mjs');
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
      if (state.patchGet && method === 'GET' && url.pathname === '/api/client' && url.search === '?c=' + slug) { const r = await (async () => { const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers() }), { ip: '192.0.2.71' }); item.status = response.status; return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }; })(); try { const j = JSON.parse(r.body.toString()); await state.patchGet(j); r.body = Buffer.from(JSON.stringify(j)); } catch {} return route.fulfill(r); }
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

// ---------- QA probe scenarios appended below ----------
const NOT_SAVED = /not saved|wasn[’']t saved|was not saved|nothing was saved|weren[’']t saved/i;
const voiceId = x => x.slug + '/' + sha('managed-voice-v1:' + tenant(x.c));
const offer = { version: 'qa_voice_v1', digest: 'a'.repeat(64), usageDisclosure: 'QA synthetic usage disclosure for phone answering.', authorityText: 'I am authorized to connect this business phone service (QA).', maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, available: true };
const patchVoice = j => { if (j.connections?.voice) { j.connections.voice.available = true; j.connections.voice.offer = offer; } };
async function openVoiceReview(page) {
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:connection-action', { detail: { action: 'review_voice' } })));
  await page.locator('#connectionForm').waitFor(); await page.locator('#connectionForm input[name=authority]').check();
}
const commitRow = async (x, extra = {}) => { const now = new Date().toISOString(), id = voiceId(x), old = await store.get('voice_activation_intents', id); await store.put('voice_activation_intents', id, { ...(old || {}), id, tenantIdentity: tenant(x.c), state: 'waiting_platform', forwardingMode: 'use_new_number', createdAt: old?.createdAt || now, updatedAt: now, generation: (old?.generation || 0) + 1, ...extra }); };

const WIDTHS_QA = [[1440, 900], [390, 844]];
for (const [width, height] of WIDTHS_QA) {
  await check(`QA request_voice_activation · original still in flight at the check, hold released, owner resubmits (${width})`, async () => {
    const x = await seed(width, 'web'); let held = null; const obs = { width };
    await open(x, { height, clock: true });
    x.state.patchGet = patchVoice;
    x.state.postHandler = { action: 'request_voice_activation', handle: async (route, body, item) => {
      if (!held) { item.fault = 'held-in-flight'; await new Promise(r => { held = r; }); await commitRow(x); item.lateCommit = true; return route.fulfill({ status: 202, contentType: 'application/json', body: '{"ok":true}' }).catch(() => {}); }
      await commitRow(x); item.committed = true; return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, result: {}, connections: {} }) });
    } };
    // Reload so the patched GET (offer available) is the workspace data.
    await x.page.reload(); await x.page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    const { page } = x; await openVoiceReview(page);
    await page.locator('#connectionForm button[type=submit]').click();
    for (let i = 0; i < 50 && !posts(x, 'request_voice_activation').length; i++) await page.waitForTimeout(100);
    assert.equal(posts(x, 'request_voice_activation').length, 1);
    await settle(page, 300); await page.clock.fastForward('00:21'); await settle(page, 600);
    let st = await snapshot(page); obs.afterTimeout = st.visible;
    assert.ok(st.visible.some(t => UNKNOWN.test(t)), 'unknown copy after timeout: ' + JSON.stringify(st.visible));
    assert.ok(await page.locator('#connectionForm button[type=submit]').isDisabled(), 'submit held');
    assert.ok(await page.locator('#connectionForm input[name=authority]').isChecked(), 'input kept');
    const r0 = x.state.requests.length; await page.locator('#connectionStatusCheck').click(); await settle(page, 1200);
    assert.ok(x.state.requests.slice(r0).every(r => r.method === 'GET'), 'check is read-only');
    st = await snapshot(page); obs.afterCheck = st.visible; obs.seen = st.seen;
    assert.ok(!(await store.get('voice_activation_intents', voiceId(x))), 'fixture: original not yet committed at check time');
    assert.ok(!NOT_SAVED.test(st.seen.join(' | ')), 'never says not saved from an older GET: ' + st.seen.join(' | '));
    assert.ok(!CLAIM.test(st.visible.join(' | ')), 'no saved claim');
    obs.submitEnabledAfterCheck = await page.locator('#connectionForm button[type=submit]').isEnabled();
    assert.ok(obs.submitEnabledAfterCheck, 'hold released: submit enabled');
    await page.locator('#connectionForm button[type=submit]').click(); await settle(page, 1500);
    const p = posts(x, 'request_voice_activation'); obs.posts = p.map(r => ({ expectedRevision: r.body?.expectedRevision?.slice(0, 12), submissionId: r.body?.submissionId ?? null, forwardingMode: r.body?.forwardingMode, fault: r.fault || null }));
    assert.equal(p.length, 2, 'owner-initiated second POST');
    assert.equal(p[0].body.expectedRevision, p[1].body.expectedRevision, 'same expectedRevision (server idempotency key with stable workspace intent id)');
    held?.(); await settle(page, 500);
    st = await snapshot(page); obs.final = st.visible; obs.dialogs = st.dialogs.length;
    const f = await focusState(page); obs.focus = f; assert.ok(!f.body, 'focus not on body');
    await shot(page, 'voice-inflight-resubmit-' + width);
    (report.observations ||= []).push(obs);
  });
  await check(`QA request_voice_activation · existing waiting_platform intent, re-request committed but reply lost (${width})`, async () => {
    const x = await seed(width, 'voice'); const obs = { width };
    await open(x, { height });
    x.state.patchGet = patchVoice;
    x.state.postHandler = { action: 'request_voice_activation', handle: async (route, body, item) => { await commitRow(x, { forwardingMode: body.forwardingMode }); item.committed = true; return route.abort('failed'); } };
    await x.page.reload(); await x.page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    const { page } = x; await openVoiceReview(page);
    await page.locator('#connectionForm button[type=submit]').click(); await settle(page, 900);
    await page.locator('#connectionStatusCheck').click(); await settle(page, 1200);
    const st = await snapshot(page); obs.afterCheck = st.visible; obs.committed = (await store.get('voice_activation_intents', voiceId(x)))?.generation;
    obs.saidSaved = CLAIM.test(st.visible.join(' | ')); obs.saidUnknown = st.visible.some(t => UNKNOWN.test(t));
    obs.submitEnabledAfterCheck = await page.locator('#connectionForm button[type=submit]').isEnabled().catch(() => null);
    assert.ok(!NOT_SAVED.test(st.seen.join(' | ')), 'never says not saved');
    await shot(page, 'voice-existing-intent-lost-after-' + width);
    (report.observations ||= []).push(obs);
  });
}
await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
report.checks.push({ name: 'hygiene', pass: report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0, detail: { physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors } });
report.checks.push({ name: 'source unchanged', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length;
writeFileSync(output, JSON.stringify(report, null, 2)); console.log(report.passed + '/' + report.total + ' -> ' + output); process.exit(report.passed === report.total ? 0 : 1);
