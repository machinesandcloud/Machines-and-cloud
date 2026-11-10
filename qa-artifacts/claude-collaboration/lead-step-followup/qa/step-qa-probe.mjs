// INDEPENDENT QA PROBE (not product code). Harness lines 1-216 copied from ../lead-step-continue-ui-check.mjs (paths adjusted); cases below are new.
// Causal browser check (combined-preview journey issue 1): the owner reaches "Step 3 of 3" of Thumbtack lead notifications,
// leaves to Home, then presses Continue setup (Home > Connection progress > View next step > Continue setup). The dialog must
// resume at the page reached, not restart at "Step 1 of 3". The desk-followup-port branch changed desk.js routeTo from
// replaceState to pushState, so a route from Home adds a history entry without history.state.mcSelfServePage.
// Cases at 1440 and 390, through real buttons and real owner handlers:
//   - Home > View next step > Continue setup resumes Step 3 of 3; page count, page "Next" and dialog agree; no write.
//   - Tabs (Home, then Connections) > Continue setup resumes Step 2 of 3.
//   - In-dialog Back/Forward still follow the history entry (history.state wins over the remembered page).
//   - Reset: disconnect in Notification settings, set up again: Step 1 of 3, and Continue from Home stays at Step 1 of 3.
// Actual owner handlers in-process, memory store, fake model; provider env deleted; physical transport denied.
// Playwright route serves this worktree's files, with optional overrides copied at run time into scratchpad/<prefix>-served/:
//   --lead-from <dir>  desk-lead-sources.js from <dir> (e.g. the pre-fix file)
//   --desk-from <dir>  desk.js, desk.html, desk.css from <dir> (e.g. the desk-followup-port worktree, read only)
// Usage (from the worktree root):
//   [MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell>] node qa-artifacts/claude-collaboration/lead-step-followup/lead-step-continue-ui-check.mjs \
//     --output scratchpad/claude-step-<name>.json [--lead-from <dir>] [--desk-from <dir>] [--playwright <index.mjs>] [--only <substring>]
//   Without MC_PLAYWRIGHT_EXECUTABLE it launches headless Google Chrome (channel 'chrome') with Playwright's temp profile.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), local = 'http://127.0.0.1:8953';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only');
if (!output || !/^scratchpad\/claude-step-qa-probe-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-step-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const leadFrom = arg('--lead-from'), deskFrom = arg('--desk-from');
const overrides = { ...(leadFrom ? { 'desk-lead-sources.js': leadFrom } : {}), ...(deskFrom ? { 'desk.js': deskFrom, 'desk.html': deskFrom, 'desk.css': deskFrom } : {}) };
const servedDir = resolve(prefix + '-served'); if (Object.keys(overrides).length) mkdirSync(servedDir, { recursive: true });
// Overrides are copied (never edited) into this run's own folder, then served from there.
const overrideSources = {};
for (const [rel, dir] of Object.entries(overrides)) { const from = resolve(dir, rel); if (!existsSync(from)) throw new Error('Missing override ' + from); copyFileSync(from, resolve(servedDir, rel)); overrideSources[rel] = { from, sha256: sha(readFileSync(from)) }; }
const pinned = ['desk-lead-sources.js', 'desk.js', 'desk.html', 'desk.css', 'desk-setup-guide.js', 'desk-setup-guide.css', 'desk-lead-sources.css'];
const watched = [...pinned, 'netlify/functions/client.mjs', 'netlify/functions/lib/lead-connections.mjs', 'netlify/functions/lib/connection-journey.mjs', 'netlify/functions/lib/thumbtack-connection.mjs', 'qa-artifacts/claude-collaboration/lead-step-followup/qa/step-qa-probe.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', sourceBefore: hashes(), served: {}, checks: [], observations: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], intercepted: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: local, PUBLIC_SITE_URL: local });
const deny = () => { report.physicalNetwork++; throw new Error('Step check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if ([local, 'https://machinesandcloud.com'].includes(url.origin) && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../../netlify/functions/lib/config.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect']) {
  const mod = await import('../../../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
report.handlers = Object.keys(handlers); report.overrides = overrideSources; report.servedDir = Object.keys(overrides).length ? servedDir : null;
const exe = process.env.MC_PLAYWRIGHT_EXECUTABLE;
if (exe && !existsSync(exe)) throw new Error('MC_PLAYWRIGHT_EXECUTABLE does not exist: ' + exe);
const browser = await playwright.chromium.launch({ ...(exe ? { executablePath: exe } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browser = { engine: exe ? 'bundled chrome-headless-shell' : 'Google Chrome (channel chrome, Playwright temp profile)', executable: exe || 'channel:chrome', version: browser.version() };
let serial = 0; const contexts = [];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };

async function seed(width, site = local) {
  const slug = 'step-' + ++serial + '-' + width, token = sha('step-token-' + slug);
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
    const rel = path.slice(root.length + 1), bytes = readFileSync(overrides[rel] ? resolve(servedDir, rel) : path); if (pinned.includes(rel)) report.served[rel] = sha(bytes);
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


const W = [[1440, 900], [390, 844]];
const CLAIM = /is connected|Connection verified|connected and receiving|Delivery confirmed|leads are (?:now )?(?:live|delivered)/i;
const view = page => page.evaluate(() => {
  const h = document.getElementById('setupGuide'), d = document.getElementById('leadSourceDialog');
  const next = [...(h?.querySelectorAll('.connector-intro-summary div') || [])].find(div => div.querySelector('dt')?.textContent === 'Next')?.querySelector('dd')?.textContent ?? null;
  return { hash: location.hash, historyLength: history.length, historyState: history.state, pageCount: document.getElementById('connectorStepCount')?.textContent ?? null, pageNext: next, focus: document.activeElement?.id || document.activeElement?.tagName,
    dialog: d?.open ? { stage: d.dataset.connectorStage, busy: d.getAttribute('aria-busy'), stageText: document.getElementById('leadSourceStage').textContent, text: d.innerText.slice(0, 700) } : null };
});
const split = stageText => { const m = /^Step (\d+) of (\d+) · (.+)$/.exec(stageText || ''); return m ? { count: 'Step ' + m[1] + ' of ' + m[2], label: m[3] } : null; };
const STEP = { 1: 'Step 1 of 3 · Your connection values', 2: 'Step 2 of 3 · Save in Thumbtack', 3: 'Step 3 of 3 · Check notifications' };
const stepIs = (page, n) => page.waitForFunction(text => { const d = document.getElementById('leadSourceDialog'); return d?.open && d.getAttribute('aria-busy') === 'false' && document.getElementById('leadSourceStage').textContent === text; }, STEP[n]);
const dialogStep = page => page.evaluate(() => document.getElementById('leadSourceDialog')?.open ? document.getElementById('leadSourceStage').textContent : null);
async function prepareNotifications(page) {
  await openRow(page, 'thumbtack'); await page.locator('#connectorStart').click(); await page.locator('#selfServePrepare').waitFor(); await idle(page);
  await page.locator('#selfServePrepare').click(); await waitText(page, '#leadSourceStatus', /notification address and key are saved/); await idle(page);
  await stepIs(page, 1);
}
async function toPage(page, n) { await page.locator('#leadSourceDialog [data-self-page="' + n + '"]').first().click(); await stepIs(page, n); }
// Home > Connection progress > Thumbtack "View next step": desk.js routes to the connector page (a new entry with the port's routeTo).
async function viaHome(page) {
  await page.locator('button[data-t="today"]').click(); await page.waitForFunction(() => document.body.dataset.activePage === 'today');
  const row = page.locator('#homeConnectionProgressRows [data-home-connection="thumbtack"]'); await row.waitFor({ state: 'attached' });
  await page.locator('#homeConnectionProgress').evaluate(e => { e.open = true; });
  await row.click();
  await page.waitForFunction(() => document.body.dataset.activePage === 'setup' && document.getElementById('setupGuide')?.dataset.guideSelectedService === 'thumbtack' && !!document.getElementById('connectorStart'));
}
// Home tab, then Connections tab, then the Thumbtack row.
async function viaTabs(page) {
  await page.locator('button[data-t="today"]').click(); await page.waitForFunction(() => document.body.dataset.activePage === 'today');
  await page.locator('button[data-t="setup"]').click(); await page.waitForFunction(() => document.body.dataset.activePage === 'setup');
  await page.locator('#setupGuide [data-guide-service="thumbtack"]').first().click();
  await page.waitForFunction(() => document.getElementById('setupGuide')?.dataset.guideSelectedService === 'thumbtack' && !!document.getElementById('connectorStart'));
}
async function continueAt(x, n, where) {
  const { page } = x, intro = await view(page);
  assert.equal(await page.locator('#connectorStart').textContent(), 'Continue setup', 'Returning owner sees Continue setup');
  const before = posts(x).length;
  await page.locator('#connectorStart').click(); await page.locator('#leadSourceDialog[open]').waitFor(); await idle(page); await page.waitForTimeout(150);
  const after = await view(page); report.observations.push({ where, intro: { pageNext: intro.pageNext, pageCount: intro.pageCount, historyState: intro.historyState, historyLength: intro.historyLength }, after: { stageText: after.dialog?.stageText, pageCount: after.pageCount, historyState: after.historyState } });
  await shot(page, where);
  assert.equal(after.dialog?.stageText, STEP[n], where + ': Continue resumes the page reached');
  const parts = split(after.dialog.stageText);
  assert.equal(after.pageCount, parts.count, 'Page and dialog step counts agree');
  assert.equal(intro.pageNext, parts.label, 'The page "Next" names the step the dialog resumes');
  assert.equal(posts(x).length, before, 'Continue sends no write');
  assert.ok(!CLAIM.test(after.dialog.text), 'No delivery claim before a notification arrives');
  const f = await focusNow(page); assert.ok(f.inDialog && f.visible, 'Focus inside the dialog: ' + JSON.stringify(f));
  await noHorizontalScroll(page, where);
  return after;
}

// ---- QA cases (new). Each records the stage texts the dialog shows after Continue (MutationObserver), the secret it shows,
// and the server's current generation/secret, so a stale step or stale values cannot pass silently.
const watchStage = page => page.evaluate(() => { window.__qaStages = []; const n = document.getElementById('leadSourceStage'); new MutationObserver(() => window.__qaStages.push(n.textContent)).observe(n, { childList: true, characterData: true, subtree: true }); });
const shown = page => page.evaluate(() => ({ stages: window.__qaStages, stage: document.getElementById('leadSourceDialog').open ? document.getElementById('leadSourceStage').textContent : null, secret: document.getElementById('selfServeSecret')?.value ?? null, endpoint: document.getElementById('selfServeEndpoint')?.value ?? null, heading: document.querySelector('#leadSourceDialog h3:not([hidden])')?.textContent ?? null, history: history.state }));
async function serverOp(x, operation, extra = {}) { const row = (await dto(x)).leadConnections.thumbtack; const r = await ownerPost(x, { action: 'lead_connection', source: 'thumbtack', operation, expectedGeneration: row.generation || null, operationId: opId(), ...extra }); assert.equal(r.status, 200, operation + ' ' + JSON.stringify(r.body).slice(0, 300)); return r.body.leadConnections.thumbtack; }
async function continueRaw(x, where) {
  const { page } = x; await watchStage(page);
  await page.locator('#connectorStart').click(); await page.locator('#leadSourceDialog[open]').waitFor(); await idle(page); await page.waitForTimeout(800); await idle(page);
  const s = await shown(page), server = (await dto(x)).leadConnections.thumbtack; const o = { where, ...s, serverGeneration: server.generation, serverSecretMatches: s.secret === null ? null : s.secret === server.setup?.secret };
  report.observations.push(o); await shot(page, where); return o;
}
async function reach3(page) { await prepareNotifications(page); await toPage(page, 2); await toPage(page, 3); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('leadSourceDialog').open); }

for (const [width, height] of [[1440, 900]]) {
  await check(`QA-A other tab disconnects and sets up again (new generation): Continue from Home must not resume Step 3 (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await reach3(page);
    await serverOp(x, 'disconnect'); await serverOp(x, 'prepare', { deliveryMode: 'self_serve', providerBusinessId: '', integrationEmail: x.c.owner.email });
    await viaHome(page); const o = await continueRaw(x, 'qa-a-regen-' + width);
    assert.ok(!o.stages.includes(STEP[3]) && o.stage !== STEP[3], 'Never shows Step 3 for a new generation: ' + JSON.stringify(o.stages));
    assert.equal(o.stage, STEP[1], 'Resumes at Step 1 of the new setup');
    assert.equal(o.serverSecretMatches, true, 'Values shown are the current saved values');
  });
  await check(`QA-A2 other tab replaces the key (new generation): Continue from Home starts Step 1 with the new key (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await reach3(page); await serverOp(x, 'rotate', { deliveryMode: 'self_serve', providerBusinessId: '', integrationEmail: x.c.owner.email });
    await viaHome(page); const o = await continueRaw(x, 'qa-a2-rotate-' + width);
    assert.ok(!o.stages.includes(STEP[3]) && o.stage !== STEP[3], 'Never shows Step 3 after a key change elsewhere: ' + JSON.stringify(o.stages));
    assert.equal(o.serverSecretMatches, true, 'Values shown are the current saved values');
  });
  await check(`QA-B Back past the dialog's first entry, then Continue: no later step than the last one shown (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await prepareNotifications(page); await toPage(page, 2); await toPage(page, 3);
    const seen = [];
    for (let i = 0; i < 5; i++) { await page.goBack(); await page.waitForTimeout(300); const v = await view(page); seen.push({ open: !!v.dialog, stage: v.dialog?.stageText, hash: v.hash, state: v.historyState }); if (!v.dialog) break; }
    report.observations.push({ where: 'qa-b back sequence ' + width, seen });
    const lastShown = [...seen].reverse().find(s => s.open)?.stage || STEP[3];
    if (await page.locator('#leadSourceDialog[open]').count()) { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('leadSourceDialog').open); }
    await ready(page); await viaHome(page); const o = await continueRaw(x, 'qa-b-backpast-' + width);
    const n = s => Number(/^Step (\d)/.exec(s || '')?.[1] || 0);
    assert.ok(n(o.stage) >= 1 && n(o.stage) <= n(lastShown), 'Continue shows ' + o.stage + ' after last shown ' + lastShown);
  });
  await check(`QA-C replace key with a lost response, then Check: Continue from Home starts Step 1 with the current key (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await reach3(page);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:lead-source-manage', { detail: { source: 'thumbtack' } })));
    await page.locator('#selfServeConfirm').waitFor(); await idle(page); await page.locator('#selfServeConfirm').check();
    x.state.lose = b => b?.operation === 'rotate';
    await page.locator('[data-self-change="rotate"]').click(); await idle(page); await page.waitForTimeout(300);
    const lostMsg = await page.locator('#leadSourceStatus').textContent(); report.observations.push({ where: 'qa-c lost message', lostMsg });
    if (await page.locator('#leadSourceCheck').isVisible()) { await page.locator('#leadSourceCheck').click(); await idle(page); await page.waitForTimeout(500); }
    report.observations.push({ where: 'qa-c after check', status: await page.locator('#leadSourceStatus').textContent() });
    await page.locator('#leadSourceClose').click(); await page.waitForFunction(() => !document.getElementById('leadSourceDialog').open);
    await viaHome(page); const o = await continueRaw(x, 'qa-c-lostrotate-' + width);
    assert.ok(o.stage !== STEP[3] && !o.stages.includes(STEP[3]), 'No Step 3 after an unconfirmed-then-confirmed key change: ' + JSON.stringify(o.stages));
    assert.equal(o.serverSecretMatches, true, 'Values shown are the current saved values');
    assert.equal(posts(x, r => r.operation === 'rotate').length, 1, 'One rotate only');
  });
  await check(`QA-D Angi visit in between: Thumbtack still resumes Step 3; Angi shows no Thumbtack step (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await reach3(page);
    await openRow(page, 'angi'); await page.locator('#connectorStart').click(); await page.locator('#leadSourceDialog[open]').waitFor(); await idle(page);
    const angi = await view(page); report.observations.push({ where: 'qa-d angi', stage: angi.dialog?.stageText });
    assert.ok(!/Check notifications|Save in Thumbtack|connection values/.test(angi.dialog?.stageText || ''), 'Angi stage is not a Thumbtack step: ' + angi.dialog?.stageText);
    await page.locator('#leadSourceClose').click(); await page.waitForFunction(() => !document.getElementById('leadSourceDialog').open);
    await viaHome(page); const o = await continueRaw(x, 'qa-d-angi-then-tt-' + width);
    assert.equal(o.stage, STEP[3]); assert.equal(o.serverSecretMatches, null);
  });
  await check(`QA-E session expired then Continue elsewhere: module stops, no stale dialog (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await reach3(page);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:session-expired'))); await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ dialogOpen: document.getElementById('leadSourceDialog').open, state: document.body.dataset.workspaceState, stage: document.getElementById('leadSourceStage').textContent }));
    report.observations.push({ where: 'qa-e after expiry', after });
    assert.equal(after.dialogOpen, false);
  });
}
await browser.close();
report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceAfter) === JSON.stringify(report.sourceBefore);
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.ms = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.total} -> ${output}`); console.log('served ' + JSON.stringify(report.served));
console.log('physicalNetwork ' + report.physicalNetwork + ' pageErrors ' + report.pageErrors.length + ' forbidden ' + report.forbidden.length + ' sourceStable ' + report.sourceStable);
process.exitCode = report.passed === report.total && !report.physicalNetwork && !report.pageErrors.length && !report.forbidden.length && report.sourceStable ? 0 : 1;
