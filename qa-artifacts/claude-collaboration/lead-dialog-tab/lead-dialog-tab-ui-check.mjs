// Causal keyboard check (card AUTO-REVIEW-5AB9F71DBC8D74B6): in the native lead-source setup <dialog> (Angi, Thumbtack
// lead notifications, Thumbtack partner route), a keyboard-only owner stays inside the dialog at every step, at 1440 and 390:
//   - Tab and Shift+Tab cycle through the dialog's controls and wrap with no stop on <body> / the document;
//   - every visible control in the dialog is reached, shows a visible focus ring, and is not covered (390 bottom bar);
//   - Esc closes the dialog and returns focus to the opener (the connector page's Start/Continue button).
// Steps walked with real buttons and real owner handlers:
//   Angi: account > request (Save and prepare) > waiting (I sent this request).
//   Thumbtack lead notifications: source chooser > saved (page 1) > page 2 > page 3.
//   Thumbtack partner: source chooser > account > waiting (Request Thumbtack setup) > "Set up lead notifications instead".
// Actual owner handlers in-process, memory store, fake model; provider env deleted; physical transport denied;
// Playwright route serves this worktree's files (or, with --pinned-from <dir>, the three pinned files from <dir>, used
// for the base run). No shared server, provider, email or OAuth call.
// Usage (from the worktree root):
//   [MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell>] node qa-artifacts/claude-collaboration/lead-dialog-tab/lead-dialog-tab-ui-check.mjs \
//     --output scratchpad/claude-tab-<name>.json [--pinned-from <dir>] [--playwright <index.mjs>] [--only <substring>] [--tab-diagnostic]
//   Without MC_PLAYWRIGHT_EXECUTABLE it launches headless Google Chrome (channel 'chrome') with Playwright's temp profile.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), local = 'http://127.0.0.1:8947';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only');
if (!output || !/^scratchpad\/claude-tab-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-tab-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const pinned = ['desk-setup-guide.js', 'desk-lead-sources.js', 'desk-setup-guide.css'], pinnedFrom = arg('--pinned-from');
if (pinnedFrom && !pinned.every(f => existsSync(resolve(pinnedFrom, f)))) throw new Error('--pinned-from must hold ' + pinned.join(', '));
const watched = [...pinned, 'desk.html', 'desk.js', 'desk.css', 'desk-lead-sources.css', 'netlify/functions/client.mjs', 'netlify/functions/lib/lead-connections.mjs', 'netlify/functions/lib/connection-journey.mjs', 'netlify/functions/lib/thumbtack-connection.mjs', 'qa-artifacts/claude-collaboration/lead-dialog-tab/lead-dialog-tab-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', sourceBefore: hashes(), served: {}, checks: [], observations: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], intercepted: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: local, PUBLIC_SITE_URL: local });
const deny = () => { report.physicalNetwork++; throw new Error('Tab check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if ([local, 'https://machinesandcloud.com'].includes(url.origin) && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../netlify/functions/lib/config.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect']) {
  const mod = await import('../../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
report.handlers = Object.keys(handlers); report.pinnedFrom = pinnedFrom || null;
const exe = process.env.MC_PLAYWRIGHT_EXECUTABLE;
if (exe && !existsSync(exe)) throw new Error('MC_PLAYWRIGHT_EXECUTABLE does not exist: ' + exe);
const browser = await playwright.chromium.launch({ ...(exe ? { executablePath: exe } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browser = { engine: exe ? 'bundled chrome-headless-shell' : 'Google Chrome (channel chrome, Playwright temp profile)', executable: exe || 'channel:chrome', version: browser.version() };
let serial = 0; const contexts = [];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };

async function seed(width, site = local) {
  const slug = 'tab-' + ++serial + '-' + width, token = sha('tab-token-' + slug);
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
  // Records which element had focus when a dialog opened (the dialog's opener). Observation only; behaviour unchanged.
  await context.addInitScript(() => { const showModal = HTMLDialogElement.prototype.showModal; HTMLDialogElement.prototype.showModal = function () { window.__mcOpener = document.activeElement; return showModal.apply(this, arguments); }; });
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
    const rel = path.slice(root.length + 1), bytes = readFileSync(pinnedFrom && pinned.includes(rel) ? resolve(pinnedFrom, rel) : path); if (pinned.includes(rel)) report.served[rel] = sha(bytes);
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

const tabDiagnostic = process.argv.includes('--tab-diagnostic'); report.tabDiagnostic = tabDiagnostic;
const posts = (x, pred = () => true) => x.state.requests.filter(r => r.method === 'POST' && pred(r));
const W = [[1440, 900], [390, 844]];
// The dialog's tabbable controls in DOM order: what a keyboard-only owner must be able to reach.
const tabbables = page => page.evaluate(() => {
  const d = document.getElementById('leadSourceDialog'), all = [...d.querySelectorAll('*')];
  const shown = n => (n.checkVisibility ? n.checkVisibility({ visibilityProperty: true }) : n.getClientRects().length > 0) && n.getClientRects().length > 0;
  return [...d.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]')]
    .filter(n => n.tabIndex >= 0 && !n.disabled && shown(n) && !n.closest('[inert]'))
    .map(n => n.tagName.toLowerCase() + '#' + (n.id || all.indexOf(n)) + ' ' + (n.textContent || n.value || n.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40));
});
// Where focus is after a key press, whether it shows a ring, and whether anything covers it.
const sample = page => page.evaluate(() => {
  const d = document.getElementById('leadSourceDialog'), a = document.activeElement, all = [...d.querySelectorAll('*')];
  const out = { key: null, tag: a?.tagName || null, inDialog: !!a && d.contains(a) && a !== d, docHasFocus: document.hasFocus(), dialogOpen: d.open };
  if (!a || a === document.body || a === document.documentElement || !d.contains(a)) return out;
  out.key = a.tagName.toLowerCase() + '#' + (a.id || all.indexOf(a)) + ' ' + (a.textContent || a.value || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const cs = getComputedStyle(a), r = a.getClientRects()[0];
  const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.outlineColor);
  out.ring = { focusVisible: a.matches(':focus-visible'), outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, shadow: cs.boxShadow, ok: a.matches(':focus-visible') && (outline || (cs.boxShadow && cs.boxShadow !== 'none')) };
  if (r) {
    const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 12), 1), innerWidth - 2), y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 2);
    const hit = document.elementFromPoint(x, y), bar = document.querySelector('.desk-app .tabs'), br = bar && bar.getClientRects()[0];
    out.rect = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh: innerHeight, vw: innerWidth };
    out.inViewport = r.top >= 0 && r.top < innerHeight - 1 && r.left >= 0 && r.left < innerWidth;
    out.hit = hit ? (hit.id || hit.tagName) : null;
    out.uncovered = !!hit && (hit === a || a.contains(hit) || (hit.tagName === 'LABEL' && hit.contains(a)));
    out.bar = br ? { top: Math.round(br.top), shown: getComputedStyle(bar).position === 'fixed' } : null;
  }
  return out;
});
async function press(page, key, times) { const seq = []; for (let i = 0; i < times; i++) { await page.keyboard.press(key); seq.push(await sample(page)); } return seq; }
const label = s => s.key || ('<' + s.tag + (s.docHasFocus ? '' : ', document lost focus') + '>');
// One keyboard pass of the current dialog step: Tab and Shift+Tab around it twice, every control reached and visible.
async function keyboardPass(x, where) {
  const { page } = x; await idle(page); await page.waitForTimeout(120);
  const list = await tabbables(page), n = list.length, start = await sample(page);
  assert.ok(n >= 2, where + ': expected at least two controls: ' + JSON.stringify(list));
  const forward = await press(page, 'Tab', 2 * n + 2), backward = await press(page, 'Shift+Tab', 2 * n + 2);
  const entry = { where, width: page.viewportSize().width, start: label(start), controls: list, forward: forward.map(label), backward: backward.map(label) };
  report.observations.push(entry);
  const escaped = [...forward.map(s => ['Tab', s]), ...backward.map(s => ['Shift+Tab', s])].filter(([, s]) => !s.inDialog);
  entry.escaped = escaped.map(([k, s]) => k + ' -> ' + label(s));
  const fail = [];
  if (escaped.length) fail.push('focus left the dialog: ' + entry.escaped.slice(0, 4).join('; '));
  for (const [dir, seq] of [['Tab', forward], ['Shift+Tab', backward]]) {
    const reached = new Set(seq.map(s => s.key).filter(Boolean)), missing = list.filter(k => !reached.has(k));
    if (missing.length) fail.push(dir + ' never reached: ' + missing.join(' | '));
  }
  const bad = [...forward, ...backward].filter(s => s.key);
  const noRing = [...new Set(bad.filter(s => !s.ring?.ok).map(s => s.key + ' ' + JSON.stringify(s.ring)))];
  const hidden = [...new Set(bad.filter(s => !s.inViewport || !s.uncovered).map(s => s.key + ' ' + JSON.stringify({ rect: s.rect, hit: s.hit, bar: s.bar })))];
  if (noRing.length) fail.push('no visible focus ring: ' + noRing.join(' | '));
  if (hidden.length) fail.push('focused control off-screen or covered: ' + hidden.join(' | '));
  entry.pass = !fail.length; entry.failures = fail;
  if (fail.length) await shot(page, 'fail-' + where.replace(/\W+/g, '-') + '-' + entry.width).catch(() => {});
  // --tab-diagnostic: record Tab failures without stopping, so the later Esc assertions are also exercised (base diagnosis only).
  if (!tabDiagnostic) assert.equal(fail.length, 0, where + ': ' + fail.join(' || '));
  await noHorizontalScroll(page, where);
}
// Esc closes the dialog and returns focus to its opener (the element focused when it opened: Start/Continue setup, or
// the connector step heading the guide had moved focus to); then Enter on the page's primary button reopens it.
async function escAndReopen(x, where, { reopen = true } = {}) {
  const { page } = x; await idle(page);
  await page.evaluate(() => { const o = window.__mcOpener; window.__mcOpenerInfo = o ? { id: o.id || null, tag: o.tagName, text: (o.textContent || '').trim().slice(0, 50) } : null; });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('leadSourceDialog').open);
  await page.waitForTimeout(150);
  const f = await page.evaluate(() => { const a = document.activeElement, o = window.__mcOpener, cs = a && getComputedStyle(a); return { opener: window.__mcOpenerInfo, openerConnected: !!o?.isConnected, onOpener: !!o && a === o, id: a?.id || null, tag: a?.tagName, text: a?.textContent?.trim().slice(0, 50), inGuide: !!a?.closest('#setupGuide'), visible: !!a && a !== document.body && a.getClientRects().length > 0, ring: !!a && a.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, pageButtons: [...document.querySelectorAll('#setupGuide .connector-page button')].filter(b => b.getClientRects().length).map(b => (b.id || '') + ':' + b.textContent.trim().slice(0, 40)) }; });
  report.observations.push({ where: where + ' Esc', width: page.viewportSize().width, focus: f });
  // The opener itself, or (when the page re-rendered behind the dialog) its replacement with the same id; a control shows a ring.
  assert.ok((f.onOpener || (f.opener?.id && f.id === f.opener.id)) && f.inGuide && f.visible, where + ': Esc returns focus to the opener: ' + JSON.stringify(f));
  if (f.tag === 'BUTTON') assert.ok(f.ring, where + ': the returned-to button shows a focus ring: ' + JSON.stringify(f));
  if (!reopen) return;
  await enter(page, '#setupGuide .connector-page #connectorStart, #setupGuide .connector-page .btn-pill-blue'); await page.locator('#leadSourceDialog[open]').waitFor(); await idle(page);
}
async function enter(page, selector) { const node = page.locator(selector).filter({ visible: true }).first(); await node.focus(); await page.keyboard.press('Enter'); }
async function startByKeyboard(x, id) { const { page } = x; await openRow(page, id); await enter(page, '#connectorStart'); await page.locator('#leadSourceDialog[open]').waitFor(); await idle(page); }

for (const [width, height] of W) {
  await check(`angi: account, request and waiting steps keep Tab/Shift+Tab inside the dialog; Esc returns to the opener (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await startByKeyboard(x, 'angi'); await stage(page, 'account');
    await keyboardPass(x, 'angi account'); await escAndReopen(x, 'angi account'); await stage(page, 'account');
    await page.locator('#leadSourceBusiness').focus(); await page.keyboard.type('55501234');
    await enter(page, '#leadSourcePrepare'); await stage(page, 'request');
    await keyboardPass(x, 'angi request'); await escAndReopen(x, 'angi request'); await stage(page, 'request');
    await enter(page, '#leadSourceReportSent'); await stage(page, 'waiting');
    await keyboardPass(x, 'angi waiting'); await escAndReopen(x, 'angi waiting', { reopen: false });
    const row = (await dto(x)).leadConnections.angi; assert.equal(row.state, 'awaiting_provider'); assert.equal(row.requestSent?.deliveryVerified, false, 'Owner report only; delivery still unverified');
  });

  await check(`thumbtack lead notifications: chooser and pages 1-3 keep Tab/Shift+Tab inside the dialog; Esc returns to the opener (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await startByKeyboard(x, 'thumbtack'); await page.locator('#selfServePrepare').waitFor(); await idle(page);
    await keyboardPass(x, 'thumbtack chooser'); await escAndReopen(x, 'thumbtack chooser'); await page.locator('#selfServePrepare').waitFor();
    await enter(page, '#selfServePrepare'); await waitText(page, '#leadSourceStatus', /notification address and key are saved/); await idle(page);
    await keyboardPass(x, 'notifications page 1');
    await enter(page, '#leadSourceDialog [data-self-page="2"]'); await page.waitForFunction(() => /Save in Thumbtack/.test(document.getElementById('leadSourceStage').textContent));
    await keyboardPass(x, 'notifications page 2');
    await enter(page, '#leadSourceDialog [data-self-page="3"]'); await page.waitForFunction(() => /Step 3 of 3/.test(document.getElementById('leadSourceStage').textContent));
    await keyboardPass(x, 'notifications page 3'); await escAndReopen(x, 'notifications page 3', { reopen: false });
    assert.equal(posts(x).length, 1, 'One save only');
  });

  await check(`thumbtack partner route: account, waiting and "lead notifications instead" keep Tab/Shift+Tab inside the dialog; Esc returns to the opener (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await startByKeyboard(x, 'thumbtack'); await page.locator('#selfServeNative').waitFor(); await idle(page);
    await enter(page, '#selfServeNative'); await stage(page, 'account');
    await keyboardPass(x, 'partner account'); await escAndReopen(x, 'partner account'); await page.locator('#selfServeNative').waitFor(); await idle(page);
    await enter(page, '#selfServeNative'); await stage(page, 'account');
    await enter(page, '#leadSourcePrepare'); await stage(page, 'waiting');
    await keyboardPass(x, 'partner waiting'); await escAndReopen(x, 'partner waiting'); await stage(page, 'waiting');
    await enter(page, '#leadSourceNotificationsInstead'); await page.locator('#selfServePrepare').waitFor(); await idle(page);
    await keyboardPass(x, 'partner > notifications instead'); await escAndReopen(x, 'partner > notifications instead', { reopen: false });
    const row = (await dto(x)).leadConnections.thumbtack; assert.equal(row.partnerReady, false); assert.equal(row.capabilities.receiveLeads, false);
    assert.equal(posts(x).length, 1, 'Only the one setup request was written');
  });
}

await browser.close();
report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceAfter) === JSON.stringify(report.sourceBefore);
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.ms = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.total} -> ${output}`); console.log('browser ' + JSON.stringify(report.browser)); console.log('served ' + JSON.stringify(report.served));
console.log('physicalNetwork ' + report.physicalNetwork + ' pageErrors ' + report.pageErrors.length + ' forbidden ' + report.forbidden.length + ' sourceStable ' + report.sourceStable);
process.exitCode = report.passed === report.total && !report.physicalNetwork && !report.pageErrors.length && !report.forbidden.length && report.sourceStable ? 0 : 1;
