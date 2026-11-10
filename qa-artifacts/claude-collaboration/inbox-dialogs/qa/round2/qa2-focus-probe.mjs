// Inbox conversation and request dialogs: keyboard-only owner at 1440 and 390.
// Website chat conversation (text and phone conversations have no dialog: they render inline in Conversations),
// web lead, Thumbtack lead (native method, no connection) and Angi lead (vendor app). Reply draft, note, close,
// refused saves and lost responses (route.abort after the actual handler ran).
// Actual /api/client and /api/access handlers in-process, memory store, fake model, provider env deleted, all
// non-loopback transport denied, files served from this worktree via context.route. No provider, email or OAuth.
// Usage (worktree root):
//   node qa-artifacts/claude-collaboration/inbox-dialogs/inbox-dialogs-ui-check.mjs --playwright <index.mjs> \
//     --output scratchpad/claude-inbox-<name>.json [--source-dir <dir with desk-requests.js, desk-conversations.js>]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const output = option('--output'), playwrightPath = option('--playwright') || process.env.MC_PLAYWRIGHT_MODULE, only = option('--only');
if (!output || !/^scratchpad\/claude-inbox-[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw new Error('Choose a new --output scratchpad/claude-inbox-name.json');
if (!playwrightPath) throw new Error('Use installed Playwright via --playwright /path/to/playwright/index.mjs. This check never installs tooling.');
const root = resolve('.'), origin = 'http://127.0.0.1:8946';
if (!existsSync(resolve(root, 'desk-requests.js'))) throw new Error('Run from the worktree root.');
mkdirSync(resolve(root, 'scratchpad'), { recursive: true });
const sourceDir = option('--source-dir') ? resolve(option('--source-dir')) : null;
const served = ['desk-requests.js', 'desk-conversations.js'];
const pinned = Object.fromEntries(served.map(file => [file, createHash('sha256').update(readFileSync(resolve(sourceDir || root, file))).digest('hex')]));
const lib = path => pathToFileURL(resolve(root, path)).href;
const files = ['qa-artifacts/claude-collaboration/inbox-dialogs/inbox-dialogs-ui-check.mjs', 'desk-requests.js', 'desk-conversations.js', 'desk.js', 'desk.html', 'desk.css'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(resolve(root, file)))]));
const report = { at: new Date().toISOString(), browser: process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome', sourceDir: option('--source-dir') || '.', servedSha256: {}, pinnedSha256: pinned, qualifications: 'Synthetic workspace, session, conversations and requests; actual local /api/client and /api/access handlers; memory storage; fake model. Thumbtack and Angi leads are stored records with no connection: no provider call is possible. Lost responses are route.abort after the actual handler ran. Keyboard only for navigation, opening, choosing and closing.', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Inbox dialogs check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };
const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
const { workspaceTenant } = await import(lib('netlify/functions/lib/workspace-identity.mjs'));
const handlers = { '/api/client': (await import(lib('netlify/functions/client.mjs'))).default, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default, '/api/workspace-billing': (await import(lib('netlify/functions/workspace-billing.mjs'))).default };
const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browserVersion = browser.version();
const contexts = []; let serial = 0;

// Every text change of a live region, in order, with the region id. Identical consecutive texts are re-announcements.
const liveInit = () => {
  window.__live = [];
  const regionOf = node => { for (let n = node.nodeType === 1 ? node : node.parentElement; n; n = n.parentElement) if (n.matches?.('[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"]')) return n; return null; };
  new MutationObserver(records => {
    const seen = new Set();
    for (const r of records) { const region = regionOf(r.target); if (!region || seen.has(region)) continue; seen.add(region); if (region.closest('[hidden]') || !region.closest('dialog[open]')) continue; window.__live.push({ id: region.id || region.className, text: region.textContent.trim() }); }
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

async function fixture(viewport, hash = '#today') {
  const slug = 'inbox-dialogs-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Inbox Shop', trade: 'Plumbing', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture-inbox.example.test' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['Drain cleaning'], fees: [{ label: 'Drain cleaning', amount: '$149', note: '' }], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const tenantIdentity = workspaceTenant(c), now = Date.now();
  const messages = Array.from({ length: 26 }, (_, i) => ({ at: new Date(now - (26 - i) * 60000).toISOString(), role: i % 2 ? 'assistant' : 'user', content: (i % 2 ? 'Front desk answer ' : 'Customer question ') + (i + 1) + (i === 0 ? ' with a long unbroken address 1234567890123456789012345678901234567890 Katy' : '') }));
  await store.put('conversations', slug + '/' + tenantIdentity + '/web/web-contact-1', { slug, tenantIdentity, channel: 'web', contact: 'web-contact-1', updatedAt: new Date(now).toISOString(), messages });
  const web = await store.addRecord('leads', slug, { tenantIdentity, customer_name: 'Jordan Web', phone: '+17135550142', address: '12 Oak St', issue: 'Drain clog in kitchen', reason: 'needs_action', outcome: 'needs_action', status: 'open', channel: 'web', contact: 'web-contact-1', urgency: 'today' });
  const thumbtack = await store.addRecord('leads', slug, { tenantIdentity, customer_name: 'Taylor Thumbtack', phone: '+17135550143', issue: 'Water heater install', status: 'open', channel: 'thumbtack', outcome: 'needs_action', email: 'taylor@example.test', platform: { source: 'thumbtack', label: 'Thumbtack', replyMethod: 'native', externalLeadId: 'tt-lead-1', providerBusinessId: 'tt-biz-1', externalRequestId: 'tt-req-1', replyUrl: 'https://www.thumbtack.com/pro/inbox/tt-lead-1', context: { task: 'Water heater installation', comments: 'Need it this week', historyComplete: true, messages: [{ messageID: 'm1', from: 'Customer', text: 'Can you install a 50 gallon heater?', sentAt: new Date(now - 3600000).toISOString() }] } } });
  const angi = await store.addRecord('leads', slug, { tenantIdentity, customer_name: 'Morgan Angi', phone: '+17135550144', issue: 'Leaking faucet', status: 'open', channel: 'angi', outcome: 'needs_action', email: 'morgan@example.test', platform: { source: 'angi', label: 'Angi', replyMethod: 'vendor_app', externalLeadId: 'angi-201', externalRequestId: 'angi-101', replyUrl: 'https://office.angi.com/leads/angi-201', context: { task: 'Faucet repair', questions: [{ question: 'When?', answer: 'Tomorrow' }] } } });
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(10000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  await context.addInitScript(liveInit);
  const state = { requests: [], fault: null };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const kind = url.searchParams.get('conversation') ? 'conversation' : url.searchParams.get('requestId') ? 'request-read' : method === 'POST' ? 'post:' + (body?.type || action) : 'other';
      const item = { slug, path: url.pathname, method, action, kind }; state.requests.push(item); report.requests.push(item);
      const fault = state.fault && state.fault.kind === kind ? state.fault : null; if (fault) state.fault = null; if (fault?.delay) await new Promise(r => setTimeout(r, fault.delay));
      if (fault?.status) { item.status = fault.status; item.fixture = kind + '-' + fault.status; return route.fulfill({ status: fault.status, contentType: 'application/json', body: JSON.stringify(fault.field ? { error: 'invalid_request', field: fault.field, message: 'Synthetic: add a shorter note.' } : { error: 'offline', message: 'Synthetic service unavailable.' }) }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.81' }); item.status = response.status;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (fault?.lost) { item.fixture = kind + '-lost-after-handler'; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buffer });
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
    if (served.includes(rel)) { const bytes = readFileSync(resolve(sourceDir || root, rel)), digest = sha(bytes); (report.servedSha256[rel] ||= []).includes(digest) || report.servedSha256[rel].push(digest); return route.fulfill({ contentType: 'text/javascript', body: bytes }); }
    const path = resolve(root, rel);
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/desk.html?c=' + slug + hash); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, c, state, context, width: viewport.width, leads: { web, thumbtack, angi } };
}
async function check(name, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length;
  try { await run(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, pass: false, error: error.stack }); const page = contexts.at(-1)?.pages().at(-1); if (page) await shot(page, 'failure-' + report.checks.length).catch(() => {}); console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]); }
  finally { await Promise.all(contexts.slice(start).map(context => context.close())); }
}
async function shot(page, name) { const path = output.replace(/\.json$/, '-' + name + '.png'); await page.screenshot({ path }); (report.screenshots ||= []).push(path); }
const route = (x, tab) => x.page.evaluate(tab => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab } })), tab);
const focusInfo = page => page.evaluate(() => { const a = document.activeElement; return { id: a?.id || '', tag: a?.tagName || '', text: (a?.textContent || '').trim().slice(0, 50), inDialog: !!a?.closest('dialog[open]'), body: a === document.body || !a, disabled: !!a?.disabled }; });
// Focus must sit on an enabled control (or a focusable message) inside the open dialog, never on <body>.
async function focusUsable(page, why) { const f = await focusInfo(page); assert.ok(f.inDialog && !f.body && !f.disabled, why + ': focus ' + JSON.stringify(f)); return f; }
// Native modal <dialog>: page content behind is inert. Chrome lets Tab pass once through the browser's own UI (seen in
// the page as <body>) before cycling back to the dialog; that hop is recorded, never a page control outside the dialog.
async function tabStays(page, presses = 14) {
  const hops = [];
  for (const key of ['Tab', 'Shift+Tab']) { let previousBody = false; for (let i = 0; i < presses; i++) { await page.keyboard.press(key); const f = await focusInfo(page); if (f.body && !previousBody) { hops.push(key + ' #' + (i + 1)); previousBody = true; continue; } previousBody = false; assert.ok(f.inDialog, key + ' #' + (i + 1) + ' left the dialog: ' + JSON.stringify(f)); } }
  (report.browserUiHops ||= []).push(hops.join(', '));
}
async function keyboardOpen(page, selector) { const button = page.locator(selector).first(); await button.waitFor({ state: 'visible' }); await button.focus(); await page.keyboard.press('Enter'); return button; }
async function dialogName(page, id) { return page.evaluate(id => { const d = document.getElementById(id), label = d.getAttribute('aria-labelledby'); return { open: d.open, modal: d.matches(':modal'), name: label ? label.split(' ').map(x => document.getElementById(x)?.textContent.trim()).join(' ') : d.getAttribute('aria-label') }; }, id); }
async function fits(page, id) {
  const m = await page.evaluate(id => { const d = document.getElementById(id), r = d.getBoundingClientRect(), over = []; for (const n of d.querySelectorAll('*')) { if (!n.getClientRects().length || n.closest('[hidden]')) continue; const b = n.getBoundingClientRect(); if (b.width && (b.right > r.right + 1 || b.left < r.left - 1)) over.push((n.id || n.tagName) + ':' + Math.round(b.left) + '-' + Math.round(b.right)); } return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight, docScroll: document.documentElement.scrollWidth, dialogScroll: d.scrollWidth - d.clientWidth, over: over.slice(0, 5) }; }, id);
  assert.ok(m.left >= -1 && m.right <= m.vw + 1 && m.bottom <= m.vh + 1, 'dialog outside viewport ' + JSON.stringify(m));
  assert.ok(m.dialogScroll <= 1 && m.docScroll <= m.vw + 1, 'horizontal scroll ' + JSON.stringify(m));
  assert.deepEqual(m.over, [], 'text overflows the dialog ' + JSON.stringify(m));
}
// Each focusable control in the dialog, scrolled into view, is the topmost element at its centre (nothing such as the
// 390 bottom tab bar covers it).
async function nothingCovers(page, id) {
  const covered = await page.evaluate(async id => { const d = document.getElementById(id), out = []; for (const n of d.querySelectorAll('button,a[href],input,select,textarea,summary')) { if (!n.checkVisibility({ visibilityProperty: true })) continue; n.scrollIntoView({ block: 'nearest' }); const b = n.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + Math.min(b.height / 2, 10), top = document.elementFromPoint(x, y); if (!top || !(n === top || n.contains(top) || top.contains(n) && top.closest('label'))) out.push((n.id || n.tagName + ':' + n.textContent.trim().slice(0, 20)) + ' under ' + (top ? top.id || top.className || top.tagName : 'nothing')); } return out; }, id);
  assert.deepEqual(covered, [], 'controls covered');
}
const live = page => page.evaluate(() => window.__live.splice(0));
function noRepeats(events, why) {
  const last = {}, repeats = [];
  for (const e of events) { if (e.text && last[e.id] === e.text) repeats.push(e.id + ': ' + e.text.slice(0, 80)); last[e.id] = e.text; }
  assert.deepEqual(repeats, [], why + ': live region re-announced identical text');
}
const untruthful = /\b(sent|delivered|accepted by)\b/i;
function truthful(text, why) { const bad = text.split('\n').filter(line => untruthful.test(line) && !/(not|never|has not|hasn[’']t|does not|doesn[’']t)\b[^.]*\b(sent|send|delivered)|Copying a draft does not send|not been sent|Not sent|before sending|sent message|Sent a message, no reply yet|sending any further|unsolicited|actually sent|already sent|quote I already sent|Quote already sent/i.test(line)); assert.deepEqual(bad, [], why + ': status claims sent/delivered without evidence'); }
const dialogText = (page, id) => page.locator('#' + id).innerText();
const waitIdle = (page, id) => page.waitForFunction(id => document.getElementById(id).getAttribute('aria-busy') === 'false', id, { timeout: 15000 });
async function openRequest(x, lead) {
  await route(x, 'leads');
  const opener = await keyboardOpen(x.page, '#leads [data-request-open="' + lead.id + '"]');
  await x.page.locator('#requestContent').waitFor({ state: 'visible' }); await waitIdle(x.page, 'requestDialog');
  return opener;
}
async function typeInto(page, selector, text) { await page.locator(selector).focus(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(text); }
async function closeWithEsc(page, id, opener) {
  await page.keyboard.press('Escape'); await page.waitForFunction(id => !document.getElementById(id).open, id);
  const back = await opener.evaluate(n => n === document.activeElement);
  assert.ok(back, 'focus did not return to the opener: ' + JSON.stringify(await focusInfo(page)));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const msgEvents = events => events.filter(e => e.id === 'requestMessage').map(e => e.text);
try {
  const viewport = { width: 1440, height: 900 }, vp390 = { width: 390, height: 844 };
  const shiftTabTo = async (page, id) => { for (let i = 0; i < 40; i++) { await page.keyboard.press('Shift+Tab'); if ((await focusInfo(page)).id === id) return true; } return false; };
  const toNoReceipt = async x => { // 503 save (handler never ran) -> Check -> "No receipt" -> Retry visible
    await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
    await typeInto(x.page, '#requestNote', 'A note the server refuses');
    x.state.fault = { kind: 'post:seen', status: 503 };
    await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter');
    await x.page.waitForFunction(() => /lost/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    const afterLost = await focusInfo(x.page);
    await x.page.locator('#requestCheck').focus(); await x.page.keyboard.press('Enter');
    await x.page.waitForFunction(() => /No receipt is saved/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    return { afterLost, afterCheck: await focusInfo(x.page) };
  };
  const msg = page => page.evaluate(() => document.getElementById('requestMessage').textContent);

  for (const v of [viewport, vp390]) {
  await check(v.width + ' Q1 slow Check saved action, owner Shift+Tabs to Close: read ends with No receipt; focus stays on Close', async () => {
    const x = await fixture(v); await openRequest(x, x.leads.web);
    const pre = await toNoReceipt(x);
    // now pending and Retry visible; go again via Check, slow
    x.state.fault = { kind: 'request-read', delay: 1500 };
    await x.page.locator('#requestCheck').focus(); await x.page.keyboard.press('Enter'); await sleep(250);
    const during = await focusInfo(x.page); const reached = await shiftTabTo(x.page, 'requestClose');
    await sleep(1600); await waitIdle(x.page, 'requestDialog');
    const after = await focusInfo(x.page); (report.probe ||= {})['Q1-' + v.width] = { pre, during, reached, after, msg: await msg(x.page) };
    assert.ok(reached, 'could not Shift+Tab to Close'); assert.equal(after.id, 'requestClose', 'focus moved to ' + after.id);
  });
  await check(v.width + ' Q2 slow failing Check (503), owner Shift+Tabs to Close: focus stays on Close; error announced', async () => {
    const x = await fixture(v); await openRequest(x, x.leads.web); await toNoReceipt(x);
    x.state.fault = { kind: 'request-read', status: 503, delay: 1500 };
    await x.page.locator('#requestCheck').focus(); await x.page.keyboard.press('Enter'); await sleep(250);
    const reached = await shiftTabTo(x.page, 'requestClose');
    await x.page.waitForFunction(() => /could not be read/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    const after = await focusInfo(x.page); (report.probe ||= {})['Q2-' + v.width] = { reached, after, msg: await msg(x.page) };
    assert.equal(after.id, 'requestClose', 'focus moved to ' + after.id);
  });
  await check(v.width + ' Q3 Retry (startedFrom is stale: Check) refused for a field, owner Shift+Tabs to Close: focus stays; field marked', async () => {
    const x = await fixture(v); await openRequest(x, x.leads.web); const pre = await toNoReceipt(x);
    x.state.fault = { kind: 'post:seen', status: 400, field: 'requestNote', delay: 1500 };
    await x.page.locator('#requestRetry').focus(); await x.page.keyboard.press('Enter'); await sleep(250);
    const reached = await shiftTabTo(x.page, 'requestClose');
    await x.page.waitForFunction(() => /Synthetic/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    const after = await focusInfo(x.page); const invalid = await x.page.evaluate(() => document.getElementById('requestNote').getAttribute('aria-invalid'));
    (report.probe ||= {})['Q3-' + v.width] = { pre, reached, after, invalid, msg: await msg(x.page) };
    assert.equal(after.id, 'requestClose', 'focus moved to ' + after.id); assert.equal(invalid, 'true');
  });
  await check(v.width + ' Q4 Retry refused for a field, owner idle (focus lost from disabled Retry): focus goes to the refused field', async () => {
    const x = await fixture(v); await openRequest(x, x.leads.web); await toNoReceipt(x);
    x.state.fault = { kind: 'post:seen', status: 400, field: 'requestNote', delay: 800 };
    await x.page.locator('#requestRetry').focus(); await x.page.keyboard.press('Enter'); await sleep(250);
    const during = await focusInfo(x.page);
    await x.page.waitForFunction(() => /Synthetic/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    const after = await focusInfo(x.page); (report.probe ||= {})['Q4-' + v.width] = { during, after };
    assert.equal(after.id, 'requestNote', 'focus at ' + JSON.stringify(after));
  });
  }

  await check('Q5 owner focuses a control that is then removed (detached node) during a refused save: focus recovers to the refused field', async () => {
    const x = await fixture(viewport); await openRequest(x, x.leads.web);
    await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
    await typeInto(x.page, '#requestNote', 'A note the server refuses');
    x.state.fault = { kind: 'post:seen', status: 400, field: 'requestNote', delay: 1200 };
    await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter'); await sleep(250);
    const detach = await x.page.evaluate(() => { const b = document.createElement('button'); b.id = 'qaTemp'; b.textContent = 'temp'; document.getElementById('requestHistory').after(b); b.focus(); const was = document.activeElement.id; b.remove(); return { was, now: document.activeElement === document.body ? 'body' : document.activeElement.id }; });
    await x.page.waitForFunction(() => /Synthetic/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    const after = await focusInfo(x.page); (report.probe ||= {}).Q5 = { detach, after };
    assert.equal(after.id, 'requestNote', 'focus at ' + JSON.stringify(after));
  });
  await check('Q6 owner focuses a control that becomes hidden during a refused save: focus recovers to the refused field', async () => {
    const x = await fixture(viewport); await openRequest(x, x.leads.web);
    await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
    await typeInto(x.page, '#requestNote', 'A note the server refuses');
    x.state.fault = { kind: 'post:seen', status: 400, field: 'requestNote', delay: 1200 };
    await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter'); await sleep(250);
    const hid = await x.page.evaluate(() => { const w = document.createElement('div'); const b = document.createElement('button'); b.textContent = 'temp'; b.id = 'qaTemp2'; w.append(b); document.getElementById('requestHistory').after(w); b.focus(); w.hidden = true; return document.activeElement.id || document.activeElement.tagName; });
    await x.page.waitForFunction(() => /Synthetic/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    const after = await focusInfo(x.page); (report.probe ||= {}).Q6 = { hid, after };
    assert.equal(after.id, 'requestNote', 'focus at ' + JSON.stringify(after));
  });
  await check('Q7 close mid refused save, open a different request (blocked by pending), reopen same, Retry refused: message and field focus delivered', async () => {
    const x = await fixture(viewport); await openRequest(x, x.leads.web);
    await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
    await typeInto(x.page, '#requestNote', 'A note the server refuses');
    x.state.fault = { kind: 'post:seen', status: 400, field: 'requestNote', delay: 1200 };
    await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter'); await sleep(250);
    await x.page.locator('#requestClose').focus(); await x.page.keyboard.press('Enter'); await sleep(1500);
    await route(x, 'leads'); await keyboardOpen(x.page, '#leads [data-request-open="' + x.leads.thumbtack.id + '"]'); await sleep(500);
    const other = await x.page.evaluate(() => ({ open: document.getElementById('requestDialog').open, notice: !document.getElementById('requestsPendingNotice')?.hidden }));
    await keyboardOpen(x.page, '#leads [data-request-open="' + x.leads.web.id + '"]'); await x.page.locator('#requestContent').waitFor({ state: 'visible' }); await waitIdle(x.page, 'requestDialog');
    const reopened = { msg: await msg(x.page), focus: await focusInfo(x.page), retryVisible: await x.page.locator('#requestRetry').isVisible() };
    x.state.fault = { kind: 'post:seen', status: 400, field: 'requestNote' };
    if (reopened.retryVisible) { await x.page.locator('#requestRetry').focus(); await x.page.keyboard.press('Enter'); }
    await x.page.waitForFunction(() => /Synthetic/.test(document.getElementById('requestMessage').textContent), null, { timeout: 5000 }); await waitIdle(x.page, 'requestDialog');
    const final = { msg: await msg(x.page), focus: await focusInfo(x.page), note: await x.page.locator('#requestNote').inputValue() };
    (report.probe ||= {}).Q7 = { other, reopened, final, posts: x.state.requests.filter(r => r.kind === 'post:seen').map(r => r.status) };
    assert.equal(final.focus.id, 'requestNote');
  });
  await check('Q8 storage failure on save: no submit, message announced, focus on a usable control (Save)', async () => {
    const x = await fixture(viewport); await openRequest(x, x.leads.web);
    await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
    await typeInto(x.page, '#requestNote', 'note');
    await x.page.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/request/i.test(k) && k !== 'mc-onboarding-session-v1') throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); }; });
    await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter');
    await x.page.waitForFunction(() => /could not keep this action/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    const after = await focusInfo(x.page); (report.probe ||= {}).Q8 = { after, posts: x.state.requests.filter(r => r.kind.startsWith('post:')).length };
    assert.ok(after.inDialog && !after.body && !after.disabled, JSON.stringify(after)); assert.equal(after.id, 'requestSave');
  });
  await check('Q9 reload with a held pending action, open it: where does focus land after the initial read (informational)', async () => {
    const x = await fixture(viewport); await openRequest(x, x.leads.web);
    await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
    await typeInto(x.page, '#requestNote', 'note');
    x.state.fault = { kind: 'post:seen', status: 503 };
    await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter');
    await x.page.waitForFunction(() => /lost/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
    await x.page.reload(); await x.page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await sleep(500);
    await route(x, 'leads'); await keyboardOpen(x.page, '#leads [data-request-open="' + x.leads.web.id + '"]'); await x.page.locator('#requestContent').waitFor({ state: 'visible' }); await waitIdle(x.page, 'requestDialog');
    (report.probe ||= {}).Q9 = { focus: await focusInfo(x.page), msg: await msg(x.page) };
  });
  await check('Q10 normal open: focus stays on Close after the initial read; owner refusal-free save leaves focus usable', async () => {
    const x = await fixture(viewport); await openRequest(x, x.leads.web);
    const open = await focusInfo(x.page);
    (report.probe ||= {}).Q10 = { open };
    assert.equal(open.id, 'requestClose');
  });
} finally {
  await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, total: report.checks.length, physicalNetwork: report.physicalNetwork, pageErrors: report.pageErrors.length };
  writeFileSync(resolve(root, output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, ...report.summary, servedSha256: report.servedSha256, sourceStable: report.sourceStable, failures: report.checks.filter(c => !c.pass).map(c => ({ name: c.name, error: c.error.split('\n')[0] })) }));
  if (report.summary.failed || !report.sourceStable) process.exitCode = 1;
}
