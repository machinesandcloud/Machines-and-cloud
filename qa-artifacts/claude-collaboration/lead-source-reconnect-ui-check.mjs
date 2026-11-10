// Causal browser check: an owner can reconnect a disconnected Angi or Thumbtack connection through the normal guided
// setup, lead-source actions keep visible focus and status, and the Angi business ID is checked with the server's
// digits-only rule before saving.
// Covered at 1440 and 390:
//   - Angi: business ID, request, local test lead to /api/angi, Manage connection > Disconnect > Exit, the row reads
//     Disconnected with Set up again, records text names Inbox, reconnect through the guided account step, status after
//     reload, and a test lead accepted on the new connection only.
//   - Thumbtack lead notifications: Set up, local notification, Disconnect, Set up again, reload, new notification.
//   - Thumbtack partner path (production-origin trick, synthetic partner placeholders, Thumbtack sign-in intercepted
//     by route): authorize, Disconnect, Set up again through the partner account step to a second authorization.
//   - A cancelled workspace keeps a disconnected Angi row and a prepared Thumbtack row stopped as before.
//   - Focus and status: lost lead-source response focuses Check saved status; Check shows "Checking…" feedback and
//     focus never lands on body during or after; server field error focuses the field.
//   - Angi business ID: a non-digit value is refused on the page with a digits hint and focus on the field.
// Actual owner handlers in-process, memory store, fake model; physical transport denied; Playwright route serves this
// worktree's files. No shared server, provider, email or OAuth call.
// Usage (from the worktree root):
//   MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell> node qa-artifacts/claude-collaboration/lead-source-reconnect-ui-check.mjs \
//     --playwright <playwright/index.mjs> --output scratchpad/claude-reconnect-<name>.json [--only <substring>]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), local = 'http://127.0.0.1:8947';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only');
if (!output || !/^scratchpad\/claude-reconnect-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-reconnect-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const pinned = ['desk-setup-guide.js', 'desk-lead-sources.js', 'desk-setup-guide.css'];
const watched = [...pinned, 'desk.html', 'desk.js', 'desk.css', 'desk-lead-sources.css', 'netlify/functions/client.mjs', 'netlify/functions/lib/lead-connections.mjs', 'netlify/functions/lib/connection-journey.mjs', 'netlify/functions/lib/thumbtack-connection.mjs', 'qa-artifacts/claude-collaboration/lead-source-reconnect-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', sourceBefore: hashes(), served: {}, checks: [], observations: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], intercepted: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: local, PUBLIC_SITE_URL: local });
const deny = () => { report.physicalNetwork++; throw new Error('Reconnect check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if ([local, 'https://machinesandcloud.com'].includes(url.origin) && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../netlify/functions/lib/config.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect']) {
  const mod = await import('../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
report.handlers = Object.keys(handlers); report.browser = process.env.MC_PLAYWRIGHT_EXECUTABLE;
// Bundled Chromium only: this check never falls back to an installed Chrome.
if (!process.env.MC_PLAYWRIGHT_EXECUTABLE || !existsSync(process.env.MC_PLAYWRIGHT_EXECUTABLE)) throw new Error('Set MC_PLAYWRIGHT_EXECUTABLE to the bundled chrome-headless-shell');
const browser = await playwright.chromium.launch({ executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE, headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
let serial = 0; const contexts = [];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };

async function seed(width, site = local) {
  const slug = 'reconnect-' + ++serial + '-' + width, token = sha('reconnect-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Lead Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'angi', 'thumbtack'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, c, width, site, state: { lose: null, hold: null, requests: [] } };
}
async function open(x, { height = 900, hash = '#setup' } = {}) {
  const { slug, token, width, site, state } = x;
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
  await context.addInitScript(({ site, slug, token }) => { if (location.origin !== site) return; if (!sessionStorage.getItem('mc-onboarding-session-v1')) sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { site, slug, token });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    // Thumbtack's sign-in page is the provider boundary: intercepted, never fetched.
    if (['auth.thumbtack.com', 'staging-auth.thumbtack.com'].includes(url.hostname)) { report.intercepted.push({ slug, origin: url.origin, path: url.pathname }); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Intercepted Thumbtack boundary</title><p>Intercepted</p>' }); }
    if (url.origin !== site) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      const action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action, operation: body?.operation, source: body?.source, deliveryMode: body?.deliveryMode, expectedGeneration: body?.expectedGeneration };
      state.requests.push(item); report.requests.push(item);
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      item.status = response.status; const bytes = Buffer.from(await response.arrayBuffer()); if (response.status >= 400) item.errorBody = bytes.toString('utf8').slice(0, 300);
      if (state.hold && state.hold(method, body)) { state.hold = null; item.held = true; await new Promise(release => { state.release = release; }); state.release = null; }
      if (method !== 'GET' && state.lose && state.lose(body)) { state.lose = null; item.lostAfterEffect = true; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const bytes = readFileSync(path), rel = path.slice(root.length + 1); if (pinned.includes(rel)) report.served[rel] = sha(bytes);
    return route.fulfill({ contentType: TYPES[extname(path)] || 'application/octet-stream', body: bytes });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  await page.goto(site + '/desk.html?c=' + slug + hash); await ready(page);
  Object.assign(x, { page, context });
  return x;
}
async function check(name, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length, t0 = Date.now();
  try { await run(); report.checks.push({ name, pass: true, ms: Date.now() - t0 }); console.log('PASS ' + name); }
  catch (error) {
    const entry = { name, pass: false, ms: Date.now() - t0, error: String(error.stack || error).slice(0, 2500) }; report.checks.push(entry); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]);
    const page = contexts.at(-1)?.pages().at(-1);
    if (page) { entry.state = await snapshot(page).catch(() => null); entry.screenshot = await shot(page, 'failure-' + report.checks.length).catch(() => null); }
  } finally { await Promise.all(contexts.slice(start).map(context => context.close().catch(() => {}))); }
}
async function shot(page, name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); return path; }
async function snapshot(page) {
  return page.evaluate(() => {
    const vis = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
    const host = document.getElementById('setupGuide'), d = document.getElementById('leadSourceDialog');
    return { hash: location.hash, view: host?.dataset.connectorView, focus: document.activeElement?.id || document.activeElement?.tagName, heading: document.getElementById('setupGuideStageTitle')?.textContent, text: host?.innerText.slice(0, 1200), controls: [...(host?.querySelectorAll('button,a') || [])].filter(vis).map(b => (b.id || b.tagName) + ':' + b.textContent.trim().slice(0, 50)), dialog: d?.open ? { stage: d.dataset.connectorStage, busy: d.getAttribute('aria-busy'), text: d.innerText.slice(0, 900), buttons: [...d.querySelectorAll('button')].filter(b => vis(b) && !b.disabled).map(b => b.textContent.trim()) } : null };
  });
}
const ready = page => page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
const idle = page => page.waitForFunction(() => document.getElementById('leadSourceDialog')?.getAttribute('aria-busy') === 'false');
const stage = (page, s) => page.waitForFunction(s => { const d = document.getElementById('leadSourceDialog'); return d?.open && d.dataset.connectorStage === s && d.getAttribute('aria-busy') === 'false'; }, s);
async function waitText(page, selector, re) { await page.waitForFunction(([s, src, flags]) => { const n = document.querySelector(s); return !!n && new RegExp(src, flags).test(n.textContent); }, [selector, re.source, re.flags]); }
async function noHorizontalScroll(page, where) {
  const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, dialogs: [...document.querySelectorAll('dialog[open]')].map(d => ({ id: d.id, scroll: d.scrollWidth, client: d.clientWidth })) }));
  assert.ok(v.doc <= v.vw + 1 && v.dialogs.every(d => d.scroll <= d.client + 1), 'Horizontal scroll at ' + where + ': ' + JSON.stringify(v));
}
const focusNow = page => page.evaluate(() => ({ id: document.activeElement?.id || null, tag: document.activeElement?.tagName, inDialog: !!document.activeElement?.closest('#leadSourceDialog'), inGuide: !!document.activeElement?.closest('#setupGuide'), visible: !!document.activeElement && document.activeElement !== document.body && document.activeElement.getClientRects().length > 0 }));
async function toList(page) {
  if (await page.locator('#leadSourceDialog[open]').count()) { await idle(page); await page.locator('#leadSourceClose').click(); }
  if (await page.evaluate(() => location.hash) !== '#setup') await page.evaluate(() => { location.hash = '#setup'; });
  await page.locator('#setupGuide[data-connector-view="overview"] [data-guide-service]').first().waitFor();
}
async function rowStatus(page, id) { await toList(page); return page.locator('[data-guide-service="' + id + '"] .connector-choice-status').textContent(); }
async function openRow(page, id) {
  await toList(page); await page.locator('[data-guide-service="' + id + '"]').click();
  await page.waitForFunction(id => document.getElementById('setupGuide')?.dataset.guideSelectedService === id && !!document.getElementById('setupGuideStageTitle'), id);
}
const primaryButtons = page => page.evaluate(() => [...document.querySelectorAll('#setupGuide .connector-page .btn-pill-blue')].filter(b => b.getClientRects().length > 0).map(b => b.textContent.trim()));
const pageControls = page => page.evaluate(() => [...document.querySelectorAll('#setupGuide .connector-page button,#setupGuide .connector-page a')].filter(b => b.getClientRects().length > 0).map(b => b.textContent.trim()));
async function dto(x) { const r = await handlers['/api/client'](new Request(x.site + '/api/client?c=' + x.slug, { headers: { origin: x.site, authorization: 'Bearer ' + x.token } }), { ip: '192.0.2.71' }); assert.equal(r.status, 200); return r.json(); }
async function ownerPost(x, body) { const r = await handlers['/api/client'](new Request(x.site + '/api/client?c=' + x.slug, { method: 'POST', headers: { origin: x.site, authorization: 'Bearer ' + x.token, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { ip: '192.0.2.71' }); return { status: r.status, body: await r.json() }; }
const opId = () => createHash('sha256').update(String(Math.random()) + Date.now()).digest('hex').slice(0, 32);
const posts = (x, pred = () => true) => x.state.requests.filter(r => r.method === 'POST' && pred(r));
async function angiLead(view, id) {
  const endpoint = new URL(view.setup.endpoint);
  const body = { leadOid: id, srOid: id + '7', spEntityId: view.providerBusinessId, name: 'Jamie Customer', address: '12 Oak St', city: 'Houston', stateProvince: 'TX', postalCode: '77057', primaryPhone: '+17135550142', email: 'jamie@example.test', taskName: 'Repair central air', comments: 'Air is warm.' };
  const r = await handlers['/api/angi'](new Request(endpoint.href, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': view.setup.secret }, body: JSON.stringify(body) }));
  return r.status;
}
async function thumbtackNotification(view, id) {
  const r = await handlers['/api/thumbtack/self-serve'](new Request(view.setup.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', [view.setup.headerName]: view.setup.secret }, body: JSON.stringify({ data: { negotiationID: id } }) }));
  return r.status;
}
const WRONG_RECORDS = /remain available in Account|saved records remain available/i;

// Shared assertions for the disconnected row and page.
async function assertDisconnectedPage(x, id, label, where) {
  const { page } = x;
  const status = await rowStatus(page, id);
  report.observations.push({ where, rowStatus: status });
  assert.equal(status, 'Disconnected', 'Row status after disconnect');
  await openRow(page, id);
  const st = await snapshot(page); report.observations.push({ where: where + ' page', state: st });
  await shot(page, where + '-disconnected-' + x.width);
  assert.match(st.heading, new RegExp(label + ' is disconnected'), 'Honest disconnected heading');
  assert.ok(!WRONG_RECORDS.test(st.text), 'Records text must not point to Account: ' + st.text);
  assert.match(st.text, /Inbox/, 'Records text names Inbox');
  assert.deepEqual(await primaryButtons(page), ['Set up again'], 'One primary action: Set up again');
  const controls = await pageControls(page);
  assert.ok(!controls.includes('Open Account') && !controls.includes('Manage connection'), 'No dead-end Account or empty manage action: ' + JSON.stringify(controls));
  assert.equal(st.focus, 'setupGuideStageTitle', 'Focus on the page heading');
  await noHorizontalScroll(page, where + ' disconnected page');
}

const WIDTHS = [[1440, 900], [390, 844]];
for (const [width, height] of WIDTHS) {
  await check(`angi: disconnect, Disconnected row with Set up again, reconnect through guided setup, reload, new lead accepted (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await openRow(page, 'angi'); await page.locator('#connectorStart').click(); await stage(page, 'account');
    await page.fill('#leadSourceBusiness', '55501234'); await page.locator('#leadSourcePrepare').click(); await stage(page, 'request');
    const first = (await dto(x)).leadConnections.angi;
    assert.equal(await angiLead(first, '91000001'), 200, 'Local test lead accepted on the first connection');
    await page.locator('#leadSourceClose').click();
    await page.reload(); await ready(page);
    await openRow(page, 'angi'); await page.locator('#connectorManageLead').click(); await stage(page, 'management');
    await page.locator('#leadSourceConfirm').check(); await page.locator('#leadSourceDisconnect').click();
    await waitText(page, '#leadSourceStatus', /^Disconnected\. Previously imported requests stay in your Inbox\.$/); await idle(page);
    const off = (await dto(x)).leadConnections.angi; assert.equal(off.state, 'disconnected');
    await shot(page, 'angi-after-disconnect-dialog-' + width);
    await page.locator('#leadSourceClose').click(); await page.locator('#setupGuide[data-connector-view="overview"]').waitFor();
    await assertDisconnectedPage(x, 'angi', 'Angi', 'angi');
    // Set up again opens the normal guided account step with the saved account prefilled.
    await page.locator('#connectorStart').click(); await stage(page, 'account');
    assert.equal(await page.locator('#leadSourceBusiness').inputValue(), '55501234', 'Saved Angi business ID prefilled');
    assert.equal(await page.locator('#leadSourcePrepare').textContent(), 'Save and prepare request');
    const f = await focusNow(page); assert.ok(f.inDialog && f.visible, 'Focus inside the dialog: ' + JSON.stringify(f));
    await noHorizontalScroll(page, 'angi reconnect account');
    await shot(page, 'angi-reconnect-account-' + width);
    await page.locator('#leadSourcePrepare').click(); await stage(page, 'request');
    const again = (await dto(x)).leadConnections.angi;
    assert.equal(again.state, 'awaiting_provider'); assert.notEqual(again.generation, off.generation); assert.equal(again.providerBusinessId, '55501234');
    const prepare = posts(x, r => r.operation === 'prepare'); assert.equal(prepare.at(-1).expectedGeneration, off.generation, 'Reconnect is a real prepare on the disconnected generation'); assert.equal(prepare.at(-1).status, 200);
    const after = await focusNow(page); assert.ok(after.inDialog && after.visible, 'Focus after the reconnect save: ' + JSON.stringify(after));
    await page.reload(); await ready(page);
    const status = await rowStatus(page, 'angi'); report.observations.push({ where: 'angi after reconnect reload ' + width, rowStatus: status });
    assert.ok(!['Disconnected', 'Stopped'].includes(status), 'Status after reload: ' + status);
    assert.equal(await angiLead(again, '91000002'), 200, 'Test lead accepted on the new connection');
    assert.equal(await angiLead(first, '91000003'), 403, 'Old connection key stays refused');
    const d = await dto(x); assert.equal(d.leadConnections.angi.state, 'receiving');
    assert.equal(d.leads.filter(l => l.source === 'angi').length, 2, 'Earlier and new Angi requests are in Inbox');
    await shot(page, 'angi-reconnected-list-' + width);
  });

  await check(`thumbtack notifications: disconnect, Disconnected row, Set up again, reload, new notification accepted (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await openRow(page, 'thumbtack'); await page.locator('#connectorStart').click(); await page.locator('#selfServePrepare').waitFor();
    await page.locator('#selfServePrepare').click(); await waitText(page, '#leadSourceStatus', /notification address and key are saved/); await idle(page);
    const first = (await dto(x)).leadConnections.thumbtack;
    assert.equal(await thumbtackNotification(first, 'neg-1001'), 200);
    await page.locator('#leadSourceClose').click();
    await openRow(page, 'thumbtack'); await page.locator('#connectorManageLead').click(); await page.locator('#selfServeConfirm').waitFor();
    await page.locator('#selfServeConfirm').check(); await page.locator('[data-self-change="disconnect"]').click();
    await waitText(page, '#leadSourceStatus', /^Notifications disconnected\. Saved Inbox records are kept\.$/); await idle(page);
    const off = (await dto(x)).leadConnections.thumbtack; assert.equal(off.state, 'disconnected');
    await page.locator('#leadSourceClose').click(); await page.locator('#setupGuide[data-connector-view="overview"]').waitFor();
    await assertDisconnectedPage(x, 'thumbtack', 'Thumbtack', 'thumbtack-notifications');
    await page.locator('#connectorStart').click(); await page.locator('#selfServePrepare').waitFor(); await idle(page);
    assert.equal(await page.locator('#selfServePrepare').textContent(), 'Set up lead notifications');
    await shot(page, 'thumbtack-reconnect-choice-' + width);
    await page.locator('#selfServePrepare').click(); await waitText(page, '#leadSourceStatus', /notification address and key are saved/); await idle(page);
    const again = (await dto(x)).leadConnections.thumbtack;
    assert.equal(again.deliveryMode, 'self_serve'); assert.equal(again.state, 'awaiting_provider'); assert.notEqual(again.generation, off.generation);
    assert.equal(posts(x, r => r.operation === 'prepare').at(-1).expectedGeneration, off.generation);
    await page.reload(); await ready(page);
    const status = await rowStatus(page, 'thumbtack'); report.observations.push({ where: 'thumbtack after reconnect reload ' + width, rowStatus: status });
    assert.ok(!['Disconnected', 'Stopped'].includes(status), 'Status after reload: ' + status);
    assert.equal(await thumbtackNotification(again, 'neg-1002'), 200, 'Notification accepted on the new connection');
    assert.equal(await thumbtackNotification(first, 'neg-1003'), 403, 'Old notification key stays refused');
    assert.equal((await dto(x)).leads.filter(l => l.source === 'thumbtack').length, 2, 'Earlier and new notifications are in Inbox');
  });

  await check(`cancelled workspace: disconnected Angi and prepared Thumbtack stay stopped (${width})`, async () => {
    const x = await seed(width);
    const prep = await ownerPost(x, { action: 'lead_connection', source: 'angi', operation: 'prepare', expectedGeneration: null, operationId: opId(), providerBusinessId: '55501234', integrationEmail: x.c.owner.email });
    assert.equal(prep.status, 200, JSON.stringify(prep.body));
    const off = await ownerPost(x, { action: 'lead_connection', source: 'angi', operation: 'disconnect', expectedGeneration: prep.body.leadConnections.angi.generation, operationId: opId() });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const tt = await ownerPost(x, { action: 'lead_connection', source: 'thumbtack', operation: 'prepare', deliveryMode: 'self_serve', expectedGeneration: null, operationId: opId(), providerBusinessId: '', integrationEmail: x.c.owner.email });
    assert.equal(tt.status, 200, JSON.stringify(tt.body));
    await store.atomicUpdate('clients', x.slug, current => ({ value: { ...current, status: 'cancelled', cancelledAt: new Date().toISOString() } }));
    await open(x, { height }); const { page } = x;
    for (const id of ['angi', 'thumbtack']) {
      assert.equal(await rowStatus(page, id), 'Stopped', id + ' row stays Stopped in a cancelled workspace');
      await openRow(page, id);
      const st = await snapshot(page); report.observations.push({ where: 'cancelled ' + id + ' ' + width, state: st });
      assert.match(st.heading, /is stopped$/);
      const controls = await pageControls(page);
      assert.ok(controls.includes('Open Account') && !controls.includes('Set up again'), 'Cancelled stays stopped: ' + JSON.stringify(controls));
      await shot(page, 'cancelled-' + id + '-' + width);
    }
    assert.equal(posts(x).length, 0, 'No write from the cancelled workspace page');
  });

  await check(`focus: lost Angi save focuses Check saved status; Check shows feedback and focus stays visible (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await openRow(page, 'angi'); await page.locator('#connectorStart').click(); await stage(page, 'account');
    await page.fill('#leadSourceBusiness', '55501234');
    x.state.lose = b => b?.operation === 'prepare';
    await page.locator('#leadSourcePrepare').click();
    await page.waitForFunction(() => /couldn.t confirm/.test(document.getElementById('leadSourceStatus').textContent) && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
    const lost = await focusNow(page); report.observations.push({ where: 'focus after lost account save ' + width, focus: lost });
    assert.equal(lost.id, 'leadSourceCheck', 'Focus after the lost response: ' + JSON.stringify(lost));
    x.state.hold = m => m === 'GET';
    await page.keyboard.press('Enter');
    for (let i = 0; i < 100 && !x.state.release; i++) await page.waitForTimeout(20);
    assert.ok(x.state.release, 'Check request was not held');
    const during = await page.evaluate(() => { const vis = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'; const check = document.getElementById('leadSourceCheck'), status = document.getElementById('leadSourceStatus'); return { check: { visible: vis(check), text: check.textContent }, status: { visible: vis(status), text: status.textContent }, focus: document.activeElement?.id || document.activeElement?.tagName }; });
    report.observations.push({ where: 'during Check (account) ' + width, during });
    await shot(page, 'check-running-account-' + width);
    x.state.release(); await idle(page);
    assert.ok(during.status.visible && /Checking/.test(during.status.text) || during.check.visible && /Checking/.test(during.check.text), 'Visible checking feedback: ' + JSON.stringify(during));
    assert.notEqual(during.focus, 'BODY', 'Focus during the check');
    await page.waitForTimeout(150);
    const after = await focusNow(page); report.observations.push({ where: 'focus after Check (account) ' + width, focus: after });
    assert.ok(after.inDialog && after.visible, 'Focus after the check: ' + JSON.stringify(after));
    await waitText(page, '#leadSourceStatus', /Your connection setup is saved/);
  });

  await check(`focus: lost "I sent this request" focuses Check; Check feedback at request stage; focus visible after (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await openRow(page, 'angi'); await page.locator('#connectorStart').click(); await stage(page, 'account');
    await page.fill('#leadSourceBusiness', '55501234'); await page.locator('#leadSourcePrepare').click(); await stage(page, 'request');
    x.state.lose = b => b?.operation === 'report_request_sent';
    await page.locator('#leadSourceReportSent').click();
    await page.waitForFunction(() => /couldn.t confirm/.test(document.getElementById('leadSourceStatus').textContent) && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
    const lost = await focusNow(page); assert.equal(lost.id, 'leadSourceCheck', 'Focus after the lost response: ' + JSON.stringify(lost));
    x.state.hold = m => m === 'GET';
    await page.keyboard.press('Enter');
    for (let i = 0; i < 100 && !x.state.release; i++) await page.waitForTimeout(20);
    const during = await page.evaluate(() => { const vis = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'; const check = document.getElementById('leadSourceCheck'), status = document.getElementById('leadSourceStatus'); return { check: { visible: vis(check), text: check.textContent }, status: { visible: vis(status), text: status.textContent }, focus: document.activeElement?.id || document.activeElement?.tagName }; });
    report.observations.push({ where: 'during Check (request) ' + width, during });
    await shot(page, 'check-running-request-' + width);
    x.state.release?.(); await idle(page);
    assert.ok(during.status.visible && /Checking/.test(during.status.text) || during.check.visible && /Checking/.test(during.check.text), 'Visible checking feedback: ' + JSON.stringify(during));
    assert.notEqual(during.focus, 'BODY', 'Focus during the check');
    await page.waitForTimeout(150);
    const after = await focusNow(page); report.observations.push({ where: 'focus after Check (request) ' + width, focus: after });
    assert.ok(after.inDialog && after.visible, 'Focus after the check: ' + JSON.stringify(after));
    assert.equal(posts(x, r => r.operation === 'report_request_sent').length, 1, 'Check did not send again');
  });

  await check(`angi business ID: digits-only hint and page validation; server field error focuses the field (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await openRow(page, 'angi'); await page.locator('#connectorStart').click(); await stage(page, 'account');
    const help = await page.locator('#leadSourceBusinessHelp').textContent();
    assert.match(help, /digits only/i, 'Field help states the digits-only rule: ' + help);
    await page.fill('#leadSourceBusiness', 'AB-1234');
    await page.locator('#leadSourcePrepare').click();
    await page.waitForTimeout(200);
    assert.equal(posts(x, r => r.action === 'lead_connection').length, 0, 'Non-digit ID is refused before saving');
    const error = await page.locator('#leadSourceBusinessError').textContent();
    assert.match(error, /digits/i, 'Error names the digits rule: ' + error);
    assert.equal(await page.locator('#leadSourceBusiness').getAttribute('aria-invalid'), 'true');
    let f = await focusNow(page); assert.equal(f.id, 'leadSourceBusiness', 'Focus on the field: ' + JSON.stringify(f));
    await shot(page, 'angi-business-digits-' + width);
    // 41 digits: still the server's limit (1 to 40 digits) on the page.
    await page.fill('#leadSourceBusiness', '1'.repeat(41)); await page.locator('#leadSourcePrepare').click(); await page.waitForTimeout(150);
    assert.equal(posts(x, r => r.action === 'lead_connection').length, 0, '41 digits refused before saving');
    // A browser-valid email the server refuses (no dot in the domain) returns a server field error.
    await page.fill('#leadSourceBusiness', ' 55501234 '); await page.fill('#leadSourceEmail', 'owner@localhost');
    await page.locator('#leadSourcePrepare').click();
    await page.waitForFunction(() => document.getElementById('leadSourceEmail').getAttribute('aria-invalid') === 'true' && document.getElementById('leadSourceDialog').getAttribute('aria-busy') === 'false');
    const sent = posts(x, r => r.action === 'lead_connection'); assert.equal(sent.length, 1); assert.equal(sent[0].status, 400);
    await page.waitForTimeout(100);
    f = await focusNow(page); report.observations.push({ where: 'focus after server field error ' + width, focus: f });
    assert.equal(f.id, 'leadSourceEmail', 'Focus on the refused field: ' + JSON.stringify(f));
    await page.fill('#leadSourceEmail', x.c.owner.email); await page.locator('#leadSourcePrepare').click(); await stage(page, 'request');
    assert.equal((await dto(x)).leadConnections.angi.providerBusinessId, '55501234', 'Trimmed digits saved');
  });
}

// Thumbtack partner path: readiness requires URL to be the production origin plus partner credentials
// (thumbtack-environment.mjs). Synthetic, non-secret placeholders are set only inside this case. start_thumbtack_connection
// builds an authorization address without any provider call; the browser navigation to Thumbtack is intercepted.
const production = 'https://machinesandcloud.com';
const partnerEnv = { PUBLIC_SITE_URL: undefined, THUMBTACK_PARTNER_ENABLED: '1', THUMBTACK_CLIENT_ID: 'synthetic-qa-client', THUMBTACK_CLIENT_SECRET: 'synthetic-qa-placeholder', THUMBTACK_SCOPES: 'offline_access supply::messages.read', THUMBTACK_CLIENT_AUTH_METHOD: 'client_secret_basic', THUMBTACK_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64), URL: production };
for (const [width, height] of WIDTHS) {
  await check(`thumbtack partner: authorize, disconnect, Set up again through the partner account step to a new authorization (${width})`, async () => {
    const saved = Object.fromEntries(Object.keys(partnerEnv).map(k => [k, process.env[k]]));
    for (const [k, v] of Object.entries(partnerEnv)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    try {
      const x = await open(await seed(width, production), { height }); let { page } = x;
      await openRow(page, 'thumbtack'); await page.locator('#connectorStart').click(); await page.locator('#selfServeNative').waitFor();
      await page.locator('#selfServeNative').click(); await stage(page, 'permission');
      await Promise.all([page.waitForURL(/auth\.thumbtack\.com/), page.locator('#leadSourceAuthorize').click()]);
      const startOne = posts(x, r => r.action === 'start_thumbtack_connection'); assert.equal(startOne.at(-1).status, 200);
      // The owner leaves the Thumbtack sign-in unfinished and returns in a new tab (no tab-scoped pending sign-in).
      await x.context.close(); await open(x, { height }); page = x.page;
      const authorizing = (await dto(x)).leadConnections.thumbtack; report.observations.push({ where: 'partner authorizing ' + width, nativeState: authorizing.nativeState, state: authorizing.state });
      await openRow(page, 'thumbtack'); await page.locator('#connectorManageLead').click(); await stage(page, 'management');
      await page.locator('#leadSourceConfirm').check(); await page.locator('#leadSourceDisconnect').click();
      await waitText(page, '#leadSourceStatus', /^Disconnected\./); await idle(page);
      const off = (await dto(x)).leadConnections.thumbtack; assert.equal(off.state, 'disconnected');
      report.observations.push({ where: 'partner disconnected ' + width, nativeState: off.nativeState, canAuthorize: off.canAuthorize, selfServeAvailable: off.selfServeAvailable });
      await page.locator('#leadSourceClose').click(); await page.locator('#setupGuide[data-connector-view="overview"]').waitFor();
      await assertDisconnectedPage(x, 'thumbtack', 'Thumbtack', 'thumbtack-partner');
      // Contract probe: the server refuses lead notifications for a disconnected native row, so the page must not offer them.
      const refused = await ownerPost(x, { action: 'lead_connection', source: 'thumbtack', operation: 'prepare', deliveryMode: 'self_serve', expectedGeneration: off.generation, operationId: opId(), providerBusinessId: '', integrationEmail: x.c.owner.email });
      report.observations.push({ where: 'partner disconnected: self-serve prepare probe ' + width, status: refused.status, error: refused.body.error, message: refused.body.message });
      assert.equal((await dto(x)).leadConnections.thumbtack.generation, off.generation, 'Refused probe changed nothing');
      await page.locator('#connectorStart').click(); await page.locator('#leadSourceDialog[open]').waitFor(); await idle(page);
      const choice = await snapshot(page); report.observations.push({ where: 'partner set up again dialog ' + width, dialog: choice.dialog });
      await shot(page, 'thumbtack-partner-reconnect-' + width);
      if (refused.status !== 200) assert.ok(!await page.locator('#selfServePrepare').isVisible().catch(() => false), 'Page offers lead notifications the server refuses: ' + JSON.stringify(refused.body));
      await stage(page, 'account');
      assert.equal(await page.locator('#leadSourcePrepare').textContent(), 'Continue with Thumbtack');
      await Promise.all([page.waitForURL(/auth\.thumbtack\.com/), page.locator('#leadSourcePrepare').click()]);
      const prepare = posts(x, r => r.operation === 'prepare' && r.source === 'thumbtack'); assert.equal(prepare.at(-1).expectedGeneration, off.generation); assert.equal(prepare.at(-1).status, 200);
      const startTwo = posts(x, r => r.action === 'start_thumbtack_connection'); assert.equal(startTwo.length, 2); assert.equal(startTwo.at(-1).status, 200, 'Second authorization started on the new connection');
      const again = (await dto(x)).leadConnections.thumbtack; assert.notEqual(again.generation, off.generation); assert.notEqual(again.state, 'disconnected');
      await x.context.close(); await open(x, { height }); page = x.page;
      const status = await rowStatus(page, 'thumbtack'); report.observations.push({ where: 'partner after reconnect reload ' + width, rowStatus: status });
      assert.ok(!['Disconnected', 'Stopped'].includes(status), 'Status after reload: ' + status);
    } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
}

await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0;
report.checks.push({ name: 'hygiene: no physical or forbidden requests and no page errors', pass: globalsPass, ...(globalsPass ? {} : { error: JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors }) }) });
report.checks.push({ name: 'source unchanged during the run', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.durationMs = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' in ' + Math.round(report.durationMs / 1000) + 's -> ' + output);
console.log('served ' + JSON.stringify(report.served));
process.exit(report.passed === report.total ? 0 : 1);
