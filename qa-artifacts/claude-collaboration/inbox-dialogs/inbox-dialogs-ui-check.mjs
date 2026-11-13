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
      const fault = state.fault && state.fault.kind === kind ? state.fault : null; if (fault) state.fault = null; if (fault?.delay) await new Promise(done => setTimeout(done, fault.delay));
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

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = viewport.width;

    await check(w + 'px website conversation: keyboard open, Tab stays, names, pages, fits, Esc returns focus', async () => {
      const x = await fixture(viewport, '#convs'); await x.page.locator('#p-convs.on').waitFor();
      const opener = await keyboardOpen(x.page, '#convs [data-conversation-open]');
      await x.page.waitForFunction(() => document.getElementById('conversationDialog').open); await waitIdle(x.page, 'conversationDialog');
      const name = await dialogName(x.page, 'conversationDialog'); assert.ok(name.modal && name.name, 'dialog name ' + JSON.stringify(name));
      await focusUsable(x.page, 'after open');
      assert.match(await x.page.locator('#conversationMessage').innerText(), /Messages 7–26 of 26/);
      await tabStays(x.page);
      await fits(x.page, 'conversationDialog'); await nothingCovers(x.page, 'conversationDialog');
      await x.page.locator('#conversationEarlier').focus(); await x.page.keyboard.press('Enter'); await waitIdle(x.page, 'conversationDialog');
      assert.match(await x.page.locator('#conversationMessage').innerText(), /Messages 1–6 of 26/);
      await focusUsable(x.page, 'after reading earlier messages');
      noRepeats(await live(x.page), 'conversation pages');
      await shot(x.page, 'conversation-' + w);
      await closeWithEsc(x.page, 'conversationDialog', opener);
    });

    await check(w + 'px website conversation: a lost page read is announced, keeps focus on a usable control, and retries by keyboard', async () => {
      const x = await fixture(viewport, '#convs'); await x.page.locator('#p-convs.on').waitFor();
      const opener = await keyboardOpen(x.page, '#convs [data-conversation-open]'); await waitIdle(x.page, 'conversationDialog'); await x.page.waitForFunction(() => /Messages/.test(document.getElementById('conversationMessage').textContent));
      await live(x.page);
      x.state.fault = { kind: 'conversation', lost: true };
      await x.page.locator('#conversationEarlier').focus(); await x.page.keyboard.press('Enter'); await waitIdle(x.page, 'conversationDialog');
      const text = await x.page.locator('#conversationMessage').innerText();
      assert.match(text, /could not be read/); assert.doesNotMatch(text, /Failed to fetch|TypeError/);
      const events = await live(x.page); assert.ok(events.some(e => e.id === 'conversationMessage' && /could not be read/.test(e.text)), 'error announced ' + JSON.stringify(events));
      await focusUsable(x.page, 'after the lost read');
      await shot(x.page, 'conversation-lost-' + w);
      await x.page.locator('#conversationRetry').focus(); await x.page.keyboard.press('Enter'); await waitIdle(x.page, 'conversationDialog');
      assert.match(await x.page.locator('#conversationMessage').innerText(), /Messages 1–6 of 26/);
      await closeWithEsc(x.page, 'conversationDialog', opener);
    });

    await check(w + 'px web request: keyboard open, add a note, lost save keeps the draft and focus, check confirms, Esc returns focus', async () => {
      const x = await fixture(viewport); const opener = await openRequest(x, x.leads.web);
      const name = await dialogName(x.page, 'requestDialog'); assert.ok(name.modal && /Jordan Web/.test(name.name), 'dialog name ' + JSON.stringify(name));
      await focusUsable(x.page, 'after open'); await tabStays(x.page, 10);
      await fits(x.page, 'requestDialog'); await nothingCovers(x.page, 'requestDialog');
      await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('attempt');
      await typeInto(x.page, '#requestNote', 'Called, left a voicemail');
      await live(x.page);
      x.state.fault = { kind: 'post:attempt', lost: true };
      await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter');
      await x.page.waitForFunction(() => /response was lost/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      assert.equal(await x.page.locator('#requestNote').inputValue(), 'Called, left a voicemail', 'note kept');
      truthful(await dialogText(x.page, 'requestDialog'), 'after the lost save');
      await focusUsable(x.page, 'after the lost save');
      const events = await live(x.page); noRepeats(events, 'lost save');
      await shot(x.page, 'request-lost-' + w);
      await x.page.locator('#requestCheck').focus(); await x.page.keyboard.press('Enter');
      await x.page.waitForFunction(() => /Action confirmed/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      await focusUsable(x.page, 'after confirming');
      noRepeats(await live(x.page), 'confirm');
      assert.match(await x.page.locator('#requestHistory').innerText(), /Contact attempted[\s\S]*Called, left a voicemail/);
      await closeWithEsc(x.page, 'requestDialog', opener);
    });

    await check(w + 'px web request: a refused save (503) keeps the note, announces the error and retries by keyboard', async () => {
      const x = await fixture(viewport); const opener = await openRequest(x, x.leads.web);
      await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
      await typeInto(x.page, '#requestNote', 'Reviewed on my phone');
      x.state.fault = { kind: 'post:seen', status: 503 }; await live(x.page);
      await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter');
      await x.page.waitForFunction(() => document.getElementById('requestMessage').dataset.error === 'true'); await waitIdle(x.page, 'requestDialog');
      assert.equal(await x.page.locator('#requestNote').inputValue(), 'Reviewed on my phone');
      const events = await live(x.page); assert.ok(events.some(e => e.id === 'requestMessage' && e.text === (events.at(-1)?.text)), 'error announced'); noRepeats(events, 'refused save');
      assert.equal((await focusUsable(x.page, 'after the refused save')).id, 'requestCheck', 'the next step is focused');
      await x.page.keyboard.press('Enter'); // the focused next step: Check saved action
      await x.page.waitForFunction(() => /We haven’t confirmed this action was saved/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      assert.equal(await focusInfo(x.page).then(f => f.id), 'requestRetry', 'Retry is focused once offered');
      await x.page.keyboard.press('Enter');
      await x.page.waitForFunction(() => /Action saved/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      await focusUsable(x.page, 'after the retried save');
      await closeWithEsc(x.page, 'requestDialog', opener);
    });

    await check(w + 'px web request: a save refused for one field focuses that field once it is usable again', async () => {
      const x = await fixture(viewport); const opener = await openRequest(x, x.leads.web);
      await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
      await typeInto(x.page, '#requestNote', 'A note the server refuses');
      x.state.fault = { kind: 'post:seen', status: 400, field: 'requestNote' }; await live(x.page);
      await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter');
      await x.page.waitForFunction(() => /Synthetic: add a shorter note/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      const f = await focusUsable(x.page, 'after the field refusal'); assert.equal(f.id, 'requestNote', 'refused field focused');
      assert.equal(await x.page.locator('#requestNote').getAttribute('aria-invalid'), 'true');
      assert.equal(await x.page.locator('#requestNote').inputValue(), 'A note the server refuses', 'note kept');
      noRepeats(await live(x.page), 'field refusal');
      await closeWithEsc(x.page, 'requestDialog', opener);
    });

    // QA probe P1: the owner moved on while the save was pending; the refusal must not pull focus back to the field.
    await check(w + 'px web request: a slow save refused for one field leaves focus on Close when the owner moved there', async () => {
      const x = await fixture(viewport); const opener = await openRequest(x, x.leads.web);
      await x.page.locator('#requestAction').focus(); await x.page.locator('#requestAction').selectOption('seen');
      await typeInto(x.page, '#requestNote', 'A note the server refuses');
      x.state.fault = { kind: 'post:seen', status: 400, field: 'requestNote', delay: 1500 };
      await x.page.locator('#requestSave').focus(); await x.page.keyboard.press('Enter');
      await x.page.waitForTimeout(300); await x.page.keyboard.press('Shift+Tab'); // keyboard to Close (the only enabled control above)
      for (let i = 0; i < 20 && (await focusInfo(x.page)).id !== 'requestClose'; i++) await x.page.keyboard.press('Shift+Tab');
      assert.equal((await focusInfo(x.page)).id, 'requestClose', 'owner reached Close while the save was pending');
      await x.page.waitForFunction(() => /Synthetic: add a shorter note/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      const after = await focusInfo(x.page); assert.equal(after.id, 'requestClose', 'focus pulled from Close to ' + after.id);
      assert.equal(await x.page.locator('#requestNote').getAttribute('aria-invalid'), 'true', 'the refused field is still marked');
      assert.equal(await x.page.locator('#requestNote').inputValue(), 'A note the server refuses', 'note kept');
      await closeWithEsc(x.page, 'requestDialog', opener);
    });

    await check(w + 'px Thumbtack request: reply draft lost then confirmed is never called sent, draft kept, live text once', async () => {
      const x = await fixture(viewport); const opener = await openRequest(x, x.leads.thumbtack);
      await x.page.locator('#requestPlatform').waitFor({ state: 'visible' });
      await fits(x.page, 'requestDialog'); await nothingCovers(x.page, 'requestDialog'); await tabStays(x.page, 10);
      const before = await dialogText(x.page, 'requestDialog'); truthful(before, 'opened Thumbtack request');
      assert.ok(await x.page.locator('#requestReplySend').isDisabled(), 'send is disabled with no connection');
      await typeInto(x.page, '#requestReplyText', 'Yes, we can install it Thursday.');
      await live(x.page);
      x.state.fault = { kind: 'post:draft_reply', lost: true };
      await x.page.locator('#requestReplySave').focus(); await x.page.keyboard.press('Enter');
      await x.page.waitForFunction(() => /response was lost/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      assert.equal(await x.page.locator('#requestReplyText').inputValue(), 'Yes, we can install it Thursday.', 'reply kept');
      truthful(await dialogText(x.page, 'requestDialog'), 'after the lost draft save');
      await focusUsable(x.page, 'after the lost draft save');
      noRepeats(await live(x.page), 'lost draft');
      await shot(x.page, 'thumbtack-lost-' + w);
      await x.page.locator('#requestCheck').focus(); await x.page.keyboard.press('Enter');
      await x.page.waitForFunction(() => /Action confirmed/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      assert.match(await x.page.locator('#requestReplySaved').innerText(), /Not sent/);
      assert.equal(await x.page.locator('#requestReplyText').inputValue(), 'Yes, we can install it Thursday.');
      truthful(await dialogText(x.page, 'requestDialog'), 'after confirming the draft');
      noRepeats(await live(x.page), 'confirmed draft');
      await focusUsable(x.page, 'after confirming the draft');
      await closeWithEsc(x.page, 'requestDialog', opener);
    });

    await check(w + 'px Angi request: reply draft saved is not sent, Open Angi is named, fits, Esc returns focus', async () => {
      const x = await fixture(viewport); const opener = await openRequest(x, x.leads.angi);
      await x.page.locator('#requestPlatform').waitFor({ state: 'visible' });
      const link = x.page.locator('#requestPlatformOpen'); assert.ok(await link.isVisible()); assert.match(await link.evaluate(n => n.textContent.trim()), /Open Angi/);
      await fits(x.page, 'requestDialog'); await nothingCovers(x.page, 'requestDialog');
      await typeInto(x.page, '#requestReplyText', 'Hi Morgan, tomorrow at 9 works.'); await live(x.page);
      await x.page.locator('#requestReplySave').focus(); await x.page.keyboard.press('Enter');
      await x.page.waitForFunction(() => /Reply draft saved/.test(document.getElementById('requestMessage').textContent)); await waitIdle(x.page, 'requestDialog');
      assert.match(await x.page.locator('#requestMessage').innerText(), /has not been sent/);
      truthful(await dialogText(x.page, 'requestDialog'), 'after the Angi draft');
      await focusUsable(x.page, 'after saving the draft');
      noRepeats(await live(x.page), 'Angi draft');
      await shot(x.page, 'angi-saved-' + w);
      await closeWithEsc(x.page, 'requestDialog', opener);
    });
  }

  await check('1440px request -> Read saved conversation -> Esc returns focus to the request opener', async () => {
    const x = await fixture({ width: 1440, height: 900 }); const opener = await openRequest(x, x.leads.web);
    await keyboardOpen(x.page, '#requestConversation'); await x.page.waitForFunction(() => document.getElementById('conversationDialog').open); await waitIdle(x.page, 'conversationDialog');
    await focusUsable(x.page, 'conversation from request');
    await x.page.keyboard.press('Escape'); await x.page.waitForFunction(() => !document.getElementById('conversationDialog').open);
    const f = await focusInfo(x.page); assert.ok(!f.body, 'focus lost after closing: ' + JSON.stringify(f));
    assert.ok(await opener.evaluate(n => n === document.activeElement), 'focus returns to View request: ' + JSON.stringify(f));
  });

  await check('1440px Thumbtack request left open: the background refresh does not re-announce unchanged statuses', async () => {
    const x = await fixture({ width: 1440, height: 900 }); await openRequest(x, x.leads.thumbtack);
    await x.page.locator('#requestClose').focus(); await live(x.page);
    const reads = x.state.requests.filter(r => r.kind === 'request-read').length;
    await x.page.waitForFunction(n => true, null); await x.page.waitForTimeout(16500);
    const after = x.state.requests.filter(r => r.kind === 'request-read').length;
    const events = await live(x.page); report.liveRefresh = { readsDuring: after - reads, events };
    if (after === reads) return; // no background refresh happened, nothing to announce
    noRepeats([{ id: 'requestAIReason', text: await x.page.locator('#requestAIReason').innerText() }, { id: 'requestPlatformReplyStatus', text: await x.page.locator('#requestPlatformReplyStatus').innerText() }, { id: 'requestAutoStatus', text: await x.page.locator('#requestAutoStatus').innerText() }, ...events].filter(e => e.text), 'background refresh');
  });

  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); for (const file of served) assert.deepEqual(report.servedSha256[file], [pinned[file]], 'served ' + file + ' differs from the pinned sha256'); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, total: report.checks.length, physicalNetwork: report.physicalNetwork, pageErrors: report.pageErrors.length };
  writeFileSync(resolve(root, output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, ...report.summary, servedSha256: report.servedSha256, sourceStable: report.sourceStable, failures: report.checks.filter(c => !c.pass).map(c => ({ name: c.name, error: c.error.split('\n')[0] })) }));
  if (report.summary.failed || !report.sourceStable) process.exitCode = 1;
}
