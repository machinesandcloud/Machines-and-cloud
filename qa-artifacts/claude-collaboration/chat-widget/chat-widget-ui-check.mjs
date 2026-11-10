// Customer-side browser check of the website chat embed (embed.js) on a synthetic third-party host page.
// Actual /api/client and /api/chat handlers run in-process (routed by config.path), MC_MEMORY_STORE=1, MC_FAKE_MODEL=1,
// provider env deleted, physical transport denied. Playwright context.route serves the host page, embed.js and the API.
// The host page includes embed.js exactly the way desk.js builds the install snippet (script src=<site>/embed.js data-client async).
// Faults (config 503/abort, lost chat response after the handler saved, slow reply) are injected at the route boundary.
// The phone keyboard is simulated by overriding VisualViewport geometry and dispatching its resize event (no real keyboard).
// Usage (from the worktree root):
//   node qa-artifacts/claude-collaboration/chat-widget/chat-widget-ui-check.mjs --output scratchpad/claude-widget-<name>.json \
//     [--embed <path to embed.js variant>] [--pin <sha256 expected for served embed>] [--chrome] [--only <substring>]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), only = arg('--only'), pin = arg('--pin'), embedPath = resolve(arg('--embed') || 'embed.js');
const playwrightPath = process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const headlessShell = '/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
if (!output || !/^scratchpad\/claude-widget-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-widget-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5);
const sha = value => createHash('sha256').update(value).digest('hex');
const embedSource = readFileSync(embedPath), embedSha = sha(embedSource);
if (pin && pin !== embedSha) throw new Error('Embed sha256 ' + embedSha + ' does not match --pin ' + pin);
const watched = ['embed.js', 'desk.js', 'netlify/functions/client.mjs', 'netlify/functions/chat.mjs', 'netlify/functions/lib/agent.mjs', 'netlify/functions/lib/fake-model.mjs', 'netlify/functions/lib/store.mjs', 'netlify/functions/lib/setup.mjs', 'netlify/functions/lib/config.mjs', 'qa-artifacts/claude-collaboration/chat-widget/chat-widget-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const PLATFORM = 'https://platform.fixture.test', SHOP = 'https://fixture-shop.example.com';
const report = { at: new Date().toISOString(), mode: 'Actual client/chat handlers in-process, memory store, fake model, provider env deleted, physical transport denied; host page, embed and API served by Playwright context.route', embed: { path: embedPath, sha256: embedSha, pinned: pin || null }, served: [], sourceBefore: hashes(), checks: [], observations: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_|ADMIN_KEY|SITE_ORIGINS|DEPLOY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: PLATFORM, PUBLIC_SITE_URL: PLATFORM });
const deny = () => { report.physicalNetwork++; throw new Error('Chat widget check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async input => { (report.serverFetch ||= []).push(String(input)); return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../netlify/functions/lib/store.mjs');
const { newClient, parseHours } = await import('../../../netlify/functions/lib/config.mjs');
const handlers = {};
for (const file of ['client', 'chat', 'website-installation']) { const mod = await import('../../../netlify/functions/' + file + '.mjs'); for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default; }
const useChrome = process.argv.includes('--chrome');
report.browser = useChrome ? 'channel:chrome (headless, temp profile)' : headlessShell;
const browser = await playwright.chromium.launch({ ...(useChrome ? { channel: 'chrome' } : { executablePath: headlessShell }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browserVersion = browser.version();
const IPHONE_UA = playwright.devices['iPhone 13'].userAgent;
const VIEWPORTS = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: IPHONE_UA }, desktop: { viewport: { width: 1440, height: 900 } } };

// ---------- fixtures ----------
let serial = 0;
async function seed({ selfService = false } = {}) {
  const slug = 'widget-ui-' + ++serial;
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Comfort Air', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: SHOP } });
  Object.assign(c, { status: 'live', services: ['AC repair', 'Furnace tune-up'], windows: ['8 to 12', '12 to 5'], build: { status: 'built', source: 'owner_answers' }, channels: { web: { active: true }, voice: { active: false }, sms: { active: false } } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm'); c.widget.allowedOrigins = [SHOP];
  if (selfService) c.onboarding = { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] };
  await store.put('clients', slug, c);
  return slug;
}
const snippet = slug => '<script src="' + PLATFORM + '/embed.js" data-client="' + slug + '" async><\/script>'; // desk.js:1021 shape
const hostPage = (slug, embed = true) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture Comfort Air</title>' +
  '<style>body{margin:0;padding:24px;font:18px Georgia,serif;color:#222;background:#fafaf5}h1{font-size:30px;margin:0 0 12px}p{line-height:1.7}a{color:#8a2be2}input,textarea,button{font-size:13px}</style></head><body>' +
  '<header><a href="#services" id="hostFirst">Services</a> · <a href="#about">About</a></header><h1>Fixture Comfort Air</h1><p>Heating and cooling in Katy. Call the shop at (713) 555-0100.</p>' +
  '<label>Search <input id="hostInput"></label> <a href="#contact" id="hostLast">Contact</a><p id="hostText">Plain host text the customer can click.</p>' + (embed ? snippet(slug) : '') + '</body></html>';

const contexts = [];
async function openHost(slug, kind, { configFaults = [], chat = null, init = null, embed = true, clock = false } = {}) {
  const context = await browser.newContext({ ...VIEWPORTS[kind], serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(7000);
  if (clock) await context.clock.install({ time: new Date('2026-11-10T12:00:00Z') });
  const state = { configFaults: configFaults.slice(), chat, requests: [], ip: '192.0.2.' + (10 + serial) };
  await context.routeWebSocket('**/*', socket => socket.close());
  if (init) await context.addInitScript(init);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === SHOP && url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: hostPage(slug, embed) });
    if (url.origin === PLATFORM && url.pathname === '/embed.js') { report.served.push({ path: '/embed.js', sha256: sha(embedSource) }); return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: embedSource }); }
    if (url.origin === PLATFORM && handlers[url.pathname]) {
      const method = request.method(), item = { slug, path: url.pathname, method, t: Date.now() }; state.requests.push(item); report.requests.push(item);
      if (method === 'GET' && url.pathname === '/api/client' && state.configFaults.length) {
        const fault = state.configFaults.shift(); item.fault = fault;
        if (fault === 'abort') return route.abort('connectionfailed');
        // Production /api/client does not expose Retry-After cross-origin; '429-hidden' mirrors that, '429-600' is the exposed variant.
        if (fault === '429-hidden') return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': SHOP, 'retry-after': '600' }, body: '{"error":"busy"}' });
        if (fault === '429-600') return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': SHOP, 'access-control-expose-headers': 'Retry-After', 'retry-after': '600' }, body: '{"error":"busy"}' });
        if (fault === '429') return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': SHOP, 'access-control-expose-headers': 'Retry-After', 'retry-after': '2' }, body: '{"error":"busy"}' });
        return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': SHOP }, body: '{"error":"fixture_config_unavailable"}' });
      }
      const body = method === 'GET' || method === 'OPTIONS' ? undefined : request.postData();
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body !== undefined ? { body } : {}) }), { ip: state.ip });
      const bytes = Buffer.from(await response.arrayBuffer()); item.status = response.status;
      if (url.pathname === '/api/chat' && method === 'POST' && state.chat?.mode === 'lose' && !state.chat.used) { state.chat.used = true; item.lostAfterEffect = true; return route.abort('failed'); }
      if (url.pathname === '/api/chat' && method === 'POST' && state.chat?.mode === 'limit') { item.fault = 429; return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': SHOP }, body: JSON.stringify({ error: 'ai_daily_limit', turnNotProcessed: true, message: 'Chat is unavailable for the rest of today. Please contact the shop directly.' }) }); }
      if (url.pathname === '/api/chat' && method === 'POST' && state.chat?.mode === 'slow') { item.delayed = state.chat.ms; await new Promise(r => setTimeout(r, state.chat.ms)); }
      try { return await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes }); } catch { return; }
    }
    report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  await page.goto(SHOP + '/');
  if (embed) await page.locator('#mcDesk .l').waitFor();
  return { page, context, state, kind, slug };
}
const chatPosts = x => x.state.requests.filter(r => r.path === '/api/chat' && r.method === 'POST');
const configReads = x => x.state.requests.filter(r => r.path === '/api/client' && r.method === 'GET');
async function press(x, locator) { if (x.kind === 'phone') await x.page.locator(locator).tap(); else await x.page.locator(locator).click(); }
async function openChat(x) { await press(x, '#mcDesk .l'); await x.page.locator('#mcDesk.open .p').waitFor(); await x.page.waitForTimeout(120); }
const composerEnabled = x => x.page.evaluate(() => !document.querySelector('#mcDesk textarea').disabled && !document.querySelector('#mcDesk button.s').disabled);
async function waitConfigSettled(x, n = 1) { const t0 = Date.now(); while (configReads(x).length < n && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 25)); await x.page.waitForTimeout(150); }
async function send(x, text) {
  const before = await x.page.locator('#mcDesk .m .b.a:not(.t)').count();
  await x.page.locator('#mcDesk textarea').fill(text); await press(x, '#mcDesk button.s');
  await x.page.waitForFunction(n => document.querySelectorAll('#mcDesk .m .b.a:not(.t)').length > n && !document.querySelector('#mcDesk .m .t'), before);
  return x.page.locator('#mcDesk .m .b.a:not(.t)').last().innerText();
}
const inPanel = page => page.evaluate(() => { const a = document.activeElement; return { inside: !!a && !!a.closest('#mcDesk .p'), tag: a?.tagName, cls: a?.className, text: (a?.textContent || '').trim().slice(0, 40) }; });
async function markLiveRegions(page) { return page.evaluate(() => [...document.querySelectorAll('#mcDesk [aria-live], #mcDesk [role=status], #mcDesk [role=log], #mcDesk [role=alert]')].filter(n => !n.closest('[hidden]') && n.getAttribute('aria-live') !== 'off').map(n => { n.dataset.qaLive = '1'; return n.className || n.tagName; })); }
async function announced(page, text) { await page.waitForTimeout(250); return page.evaluate(t => [...document.querySelectorAll('#mcDesk [data-qa-live]')].filter(n => !n.closest('[hidden]')).some(n => n.textContent.includes(t)), text); }
const CLAIM = /\b(delivered|has been notified|we received|was sent to (the )?(shop|business|owner)|message (was )?sent to)\b/i;
async function widgetAuthoredText(page) { return page.evaluate(() => [document.querySelector('#mcDesk .cfg')?.innerText, document.querySelector('#mcDesk .m .b.a')?.innerText, document.querySelector('#mcDesk .sr')?.textContent, document.querySelector('#mcDesk .recovery:not([hidden])')?.innerText].filter(Boolean).join(' | ')); }
async function shot(page, name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path }); report.screenshots.push(path); return path; }

async function check(name, fix, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length, t0 = Date.now(), entry = { name, fix, pass: false };
  try { const detail = await run(); Object.assign(entry, { pass: true, ms: Date.now() - t0, ...(detail ? { detail } : {}) }); console.log('PASS ' + name); }
  catch (error) {
    Object.assign(entry, { ms: Date.now() - t0, error: String(error.message).slice(0, 1500) }); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]);
    const page = contexts.at(-1)?.pages().at(-1); if (page) entry.screenshot = await shot(page, 'failure-' + (report.checks.length + 1)).catch(() => null);
  } finally { report.checks.push(entry); await Promise.all(contexts.slice(start).map(c => c.close().catch(() => {}))); }
}

// ---------- cases ----------
// 1. Worst: config load failure must not leave chat unavailable for the whole visit.
for (const kind of ['phone', 'desktop']) await check(kind + ' config 503 then customer retries and chats', 'config-retry', async () => {
  // The initial load fails; the customer's own retry succeeds.
  const x = await openHost(await seed(), kind, { configFaults: ['503'] }); await waitConfigSettled(x);
  await openChat(x); await x.page.waitForTimeout(300);
  assert.match(await x.page.locator('#mcDesk .m').innerText(), /Website chat is unavailable/, 'Failure notice shown');
  assert.equal(await composerEnabled(x), false, 'Composer closed while config is unknown');
  const retry = x.page.locator('#mcDesk .cfg button');
  assert.ok(await retry.isVisible().catch(() => false), 'A retry control is offered after a failed config load');
  await shot(x.page, kind + '-config-failed');
  await press(x, '#mcDesk .cfg button');
  await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled, null, { timeout: 4000 });
  assert.equal(await x.page.locator('#mcDesk .h b').innerText(), 'Fixture Comfort Air');
  assert.doesNotMatch(await x.page.locator('#mcDesk .m').innerText(), /unavailable/, 'Failure notice replaced by the greeting');
  assert.equal(chatPosts(x).length, 0, 'No chat turn sent by a config retry');
  const reply = await send(x, 'What services do you offer?');
  assert.equal(chatPosts(x).length, 1); assert.equal(chatPosts(x)[0].status, 200);
  await shot(x.page, kind + '-config-recovered');
  return { configReads: configReads(x).map(r => r.fault || r.status), reply };
});
await check('phone config network failure is re-read when the customer opens chat', 'config-retry', async () => {
  const x = await openHost(await seed(), 'phone', { configFaults: ['abort'] }); await waitConfigSettled(x);
  assert.equal(await composerEnabled(x), false);
  await openChat(x);
  await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled, null, { timeout: 7000 });
  assert.equal(chatPosts(x).length, 0);
  return { configReads: configReads(x).map(r => r.fault || r.status), focus: await inPanel(x.page) };
});
const readGaps = x => configReads(x).slice(1).map((r, i) => r.t - configReads(x)[i].t);
await check('desktop config failing and chat never opened: no automatic re-reads, reconnect ignored', 'retry-load', async () => {
  const x = await openHost(await seed(), 'desktop', { configFaults: Array(50).fill('503') }); await waitConfigSettled(x);
  await x.page.waitForTimeout(17000);
  await x.page.evaluate(() => { for (let i = 0; i < 50; i++) window.dispatchEvent(new Event('online')); }); await x.page.waitForTimeout(800);
  assert.equal(configReads(x).length, 1, 'Reads on a page view where chat was never opened: ' + configReads(x).length);
  return { reads: configReads(x).length };
});
await check('desktop config failing, chat opened and toggled: re-reads bounded, spaced and jittered', 'retry-load', async () => {
  const x = await openHost(await seed(), 'desktop', { configFaults: Array(50).fill('abort') }); await waitConfigSettled(x);
  for (let i = 0; i < 40; i++) { await x.page.locator('#mcDesk .l').click(); await x.page.waitForTimeout(60); }
  const afterToggles = configReads(x).length;
  assert.ok(afterToggles <= 2, '40 open/close toggles caused ' + afterToggles + ' reads');
  await x.page.waitForTimeout(30000);
  const reads = configReads(x).length, gaps = readGaps(x);
  assert.ok(reads <= 5, 'Reads in ~33s: ' + reads); assert.ok(gaps.every(g => g >= 3000), 'Reads closer than 3s: ' + JSON.stringify(gaps));
  return { afterToggles, reads, gaps };
});
await check('phone config 429 backs off (Retry-After floor 30s) instead of retrying on open or tap', 'retry-load', async () => {
  const x = await openHost(await seed(), 'phone', { configFaults: ['429'] }); await waitConfigSettled(x);
  await openChat(x); await x.page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) await press(x, '#mcDesk .cfg button').catch(() => {});
  await x.page.evaluate(() => window.dispatchEvent(new Event('online'))); await x.page.waitForTimeout(6000);
  assert.equal(configReads(x).length, 1, '429 re-read too soon: ' + JSON.stringify(readGaps(x)));
  assert.equal(await composerEnabled(x), false);
  const text = await widgetAuthoredText(x.page); assert.doesNotMatch(text, CLAIM);
  await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled, null, { timeout: 30000 });
  const gap = readGaps(x)[0]; assert.ok(gap >= 29000, 'Re-read after ' + gap + 'ms');
  return { gap, text };
});
const tick = async (x, ms) => { await x.page.clock.runFor(ms); await x.page.waitForTimeout(60); };
const cfgView = x => x.page.evaluate(() => { const r = document.querySelector('#mcDesk .cfg'); return { hidden: r.hidden, text: r.querySelector('p').textContent, ariaDisabled: r.querySelector('button').getAttribute('aria-disabled') }; });
await check('desktop persistent config 429 (Retry-After 600) never strands the customer', 'retry-429', async () => {
  const x = await openHost(await seed(), 'desktop', { configFaults: Array(30).fill('429-600'), clock: true }); await tick(x, 500);
  await x.page.locator('#mcDesk .l').click(); await tick(x, 200);
  for (let m = 0; m < 50; m++) await tick(x, 60000);
  const exhausted = { reads: configReads(x).length, ...(await cfgView(x)) };
  assert.ok(exhausted.reads <= 6, 'Reads: ' + exhausted.reads);
  assert.doesNotMatch(exhausted.text, /try again (automatically|in a few minutes\. We)|We’ll try again/i, 'Claims an automatic retry that is not scheduled: ' + exhausted.text);
  assert.equal(exhausted.ariaDisabled, 'false', 'Try again stays disabled after back-off');
  const cursor = await x.page.evaluate(() => getComputedStyle(document.querySelector('#mcDesk .cfg button')).cursor); assert.notEqual(cursor, 'wait');
  await tick(x, 11 * 60000); const later = await cfgView(x);
  await x.page.locator('#mcDesk .cfg button').click(); await tick(x, 300);
  assert.equal(configReads(x).length, exhausted.reads + 1, 'Button press after the back-off reads again');
  return { exhausted, later, readsAfterPress: configReads(x).length };
});
await check('phone config 429 without exposed Retry-After falls back to 60s and does not strand', 'retry-429', async () => {
  const x = await openHost(await seed(), 'phone', { configFaults: Array(30).fill('429-hidden'), clock: true }); await tick(x, 500);
  await press(x, '#mcDesk .l'); await tick(x, 200);
  await tick(x, 50000); const at50s = configReads(x).length;
  await tick(x, 15000); const at65s = configReads(x).length;
  assert.equal(at50s, 1, 'Re-read before the 60s default: ' + at50s); assert.equal(at65s, 2, 'No re-read at the 60s default (unreadable header must not mean 600s): ' + at65s);
  for (let m = 0; m < 10; m++) await tick(x, 60000);
  const exhausted = { reads: configReads(x).length, ...(await cfgView(x)) };
  assert.ok(exhausted.reads <= 6);
  assert.doesNotMatch(exhausted.text, /We’ll try again/i, 'False automatic-retry claim: ' + exhausted.text);
  assert.equal(exhausted.ariaDisabled, 'false', 'Try again disabled after the back-off');
  await press(x, '#mcDesk .cfg button'); await tick(x, 300);
  assert.equal(configReads(x).length, exhausted.reads + 1, 'Tap reads again once the back-off has passed');
  await shot(x.page, 'phone-429-exhausted');
  return { at50s, at65s, exhausted };
});
await check('desktop host focus within 50ms of opening chat is not overridden', 'focus', async () => {
  const x = await openHost(await seed(), 'desktop'); await waitConfigSettled(x);
  await x.page.evaluate(() => { document.querySelector('#mcDesk .l').click(); document.getElementById('hostInput').focus(); });
  await x.page.waitForTimeout(250);
  assert.equal(await x.page.evaluate(() => document.activeElement?.id), 'hostInput');
  assert.equal(await x.page.locator('#mcDesk.open').count(), 1);
});
await check('desktop host script blurring focus is not undone by a retry success', 'focus', async () => {
  const x = await openHost(await seed(), 'desktop', { configFaults: ['503', '503', '503'] }); await waitConfigSettled(x);
  await openChat(x); await x.page.locator('#mcDesk .cfg button').click(); await x.page.waitForTimeout(300);
  await x.page.locator('#mcDesk .x').focus(); await x.page.evaluate(() => document.activeElement.blur());
  await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled, null, { timeout: 25000 }); await x.page.waitForTimeout(200);
  assert.equal(await x.page.evaluate(() => document.activeElement?.tagName), 'BODY');
});
await check('desktop config keeps failing: retry stays available, composer closed, no delivery claim', 'config-retry', async () => {
  const x = await openHost(await seed(), 'desktop', { configFaults: ['503', '503', '503', '503'] }); await waitConfigSettled(x);
  await openChat(x); await x.page.waitForTimeout(300);
  const retry = x.page.locator('#mcDesk .cfg button');
  assert.ok(await retry.isVisible(), 'Retry control visible');
  await retry.click(); await x.page.waitForTimeout(300);
  assert.ok(await retry.isVisible(), 'Retry control still visible after another failure');
  assert.equal(await composerEnabled(x), false); assert.equal(chatPosts(x).length, 0);
  const text = await widgetAuthoredText(x.page); assert.doesNotMatch(text, CLAIM, 'No delivery claim: ' + text);
  assert.ok((await inPanel(x.page)).inside, 'Focus stays in the panel');
  await shot(x.page, 'desktop-config-still-failing');
  return { configReads: configReads(x).length, text };
});
await check('phone closed workspace (self-service, not live under fake model) fails closed without retry', 'guard', async () => {
  const x = await openHost(await seed({ selfService: true }), 'phone'); await waitConfigSettled(x);
  await openChat(x); await x.page.waitForTimeout(300);
  assert.match(await x.page.locator('#mcDesk .m').innerText(), /Website chat is unavailable/);
  assert.equal(await composerEnabled(x), false);
  assert.equal(await x.page.locator('#mcDesk .cfg button').isVisible().catch(() => false), false, 'No retry offered for a definitive closure');
  assert.equal(chatPosts(x).length, 0);
  return { configReads: configReads(x).map(r => r.status) };
});

// 2. Replies announced to screen readers through a persistent live region.
for (const kind of ['phone', 'desktop']) await check(kind + ' reply is announced in a live region', 'announce', async () => {
  const x = await openHost(await seed(), kind); await waitConfigSettled(x); await openChat(x);
  const regions = await markLiveRegions(x.page);
  const reply = await send(x, 'What services do you offer?');
  assert.ok(await announced(x.page, reply.slice(0, 40)), 'Reply text present in a live region that existed before it arrived; regions=' + JSON.stringify(regions));
  return { regions, reply };
});
await check('phone lost reply is announced', 'announce', async () => {
  const x = await openHost(await seed(), 'phone', { chat: { mode: 'lose' } }); await waitConfigSettled(x); await openChat(x);
  await markLiveRegions(x.page);
  const text = await send(x, 'What services do you offer?');
  assert.match(text, /couldn’t confirm the outcome/);
  assert.ok(await announced(x.page, 'couldn’t confirm the outcome'), 'Interrupted outcome announced');
});
await check('phone lost reply stays honest and offers the saved-reply check', 'guard', async () => {
  const slug = await seed(), x = await openHost(slug, 'phone', { chat: { mode: 'lose' } }); await waitConfigSettled(x); await openChat(x);
  const text = await send(x, 'What services do you offer?');
  assert.match(text, /couldn’t confirm the outcome/); assert.doesNotMatch(await widgetAuthoredText(x.page), CLAIM);
  assert.equal(await composerEnabled(x), false, 'Composer held until the previous reply is checked');
  assert.ok(await x.page.locator('#mcDesk .recover-reply').isVisible());
  assert.ok((await inPanel(x.page)).inside, 'Focus stays in the panel after the failure');
  await shot(x.page, 'phone-lost-reply');
  const savedBefore = await userTurnsSaved(slug);
  await press(x, '#mcDesk .recover-reply');
  await x.page.waitForFunction(() => !document.querySelector('#mcDesk .m .t') && !document.querySelector('#mcDesk .recover-reply')?.disabled);
  await x.page.waitForTimeout(200);
  const savedAfter = await userTurnsSaved(slug);
  report.observations.push({ name: 'legacy tenant recoverTurn replays the turn', chatPosts: chatPosts(x).length, userTurnsSavedBefore: savedBefore, userTurnsSavedAfter: savedAfter, note: 'chat.mjs only resumes stored turns for self-service tenants; a legacy tenant re-runs the agent on recoverTurn' });
  return { savedBefore, savedAfter };
});
async function userTurnsSaved(slug) { const keys = await store.list('conversations', slug + '/'); let n = 0; for (const key of keys) { const row = await store.get('conversations', key); n += (row?.messages || []).filter(m => m.role === 'user').length; } return n; }

await check('phone daily limit keeps chat closed through reopen and reconnect', 'guard', async () => {
  const x = await openHost(await seed(), 'phone', { chat: { mode: 'limit' } }); await waitConfigSettled(x); await openChat(x);
  const text = await send(x, 'What services do you offer?');
  assert.match(text, /rest of today/);
  await press(x, '#mcDesk .x'); await x.page.evaluate(() => window.dispatchEvent(new Event('online'))); await openChat(x); await x.page.waitForTimeout(300);
  assert.equal(await composerEnabled(x), false, 'Limit reached: composer must stay closed');
  assert.equal(configReads(x).length, 1, 'No config re-read re-opens a limited chat');
  assert.equal(chatPosts(x).length, 1);
});
// 3. Slow reply, Esc, reopen (guard: no duplicate request, reply lands).
await check('desktop slow reply: Esc closes, reopen shows the one reply', 'guard', async () => {
  const x = await openHost(await seed(), 'desktop', { chat: { mode: 'slow', ms: 1500 } }); await waitConfigSettled(x); await openChat(x);
  await x.page.locator('#mcDesk textarea').fill('What services do you offer?'); await x.page.keyboard.press('Enter');
  await x.page.locator('#mcDesk .m .t').waitFor();
  assert.equal(await x.page.locator('#mcDesk button.s').isDisabled(), true, 'Send disabled while waiting');
  await x.page.keyboard.press('Escape');
  assert.equal(await x.page.locator('#mcDesk.open').count(), 0, 'Esc closes');
  assert.equal(await x.page.evaluate(() => document.activeElement === document.querySelector('#mcDesk .l')), true, 'Focus returns to the launcher');
  await x.page.waitForTimeout(1700);
  await x.page.keyboard.press('Enter'); await x.page.locator('#mcDesk.open').waitFor();
  await x.page.waitForFunction(() => document.querySelectorAll('#mcDesk .m .b.a:not(.t)').length === 2);
  assert.equal(chatPosts(x).length, 1, 'One request');
});

// 4. Keyboard-only: focus stays in the open dialog; Esc returns to the launcher.
await check('desktop keyboard-only: non-modal chat with sensible order, Esc returns to launcher', 'focus', async () => {
  const x = await openHost(await seed(), 'desktop'); await waitConfigSettled(x);
  let reached = false; for (let i = 0; i < 12 && !reached; i++) { await x.page.keyboard.press('Tab'); reached = await x.page.evaluate(() => document.activeElement === document.querySelector('#mcDesk .l')); }
  assert.ok(reached, 'Launcher reachable by Tab');
  await x.page.keyboard.press('Enter'); await x.page.locator('#mcDesk.open').waitFor(); await x.page.waitForTimeout(120);
  assert.equal(await x.page.evaluate(() => document.activeElement === document.querySelector('#mcDesk textarea')), true, 'Composer focused on open');
  await x.page.keyboard.type('What services do you offer?'); await x.page.keyboard.press('Enter');
  await x.page.waitForFunction(() => document.querySelectorAll('#mcDesk .m .b.a:not(.t)').length === 2 && !document.querySelector('#mcDesk button.s').disabled);
  const at = () => x.page.evaluate(() => { const a = document.activeElement; return a?.closest('#mcDesk') ? a.className || a.tagName : 'host:' + (a?.id || a?.tagName); });
  await x.page.locator('#mcDesk textarea').focus(); await x.page.keyboard.press('Shift+Tab'); const back = await at();
  await x.page.locator('#mcDesk textarea').focus(); await x.page.keyboard.press('Tab'); const fwd = await at();
  await x.page.keyboard.press('Tab'); await x.page.keyboard.press('Tab'); const out = await at();
  assert.equal(back, 'x', 'Shift+Tab from composer reaches Close'); assert.equal(fwd, 's', 'Tab from composer reaches Send');
  assert.ok(out.startsWith('host:'), 'Tab past the panel reaches the host page (non-modal): ' + out);
  assert.notEqual(await x.page.locator('#mcDesk .p').getAttribute('aria-modal'), 'true', 'Dialog must not claim modality while the host is not inert');
  await x.page.locator('#mcDesk textarea').focus(); await x.page.keyboard.press('Escape');
  assert.equal(await x.page.evaluate(() => document.activeElement === document.querySelector('#mcDesk .l') && !document.querySelector('#mcDesk.open')), true);
  return { back, fwd, out };
});
await check('desktop host page stays usable while chat is open (non-modal)', 'focus', async () => {
  const x = await openHost(await seed(), 'desktop'); await waitConfigSettled(x); await openChat(x);
  await x.page.locator('#hostInput').click(); await x.page.keyboard.type('filters');
  assert.equal(await x.page.locator('#hostInput').inputValue(), 'filters');
  await x.page.keyboard.press('Tab'); assert.equal(await x.page.evaluate(() => document.activeElement?.id), 'hostLast', 'Host Tab order unchanged while open');
  assert.equal(await x.page.locator('#mcDesk.open').count(), 1, 'Chat stays open');
  assert.notEqual(await x.page.locator('#mcDesk .p').getAttribute('aria-modal'), 'true');
});
for (const kind of ['phone', 'desktop']) await check(kind + ' config retry success does not pull focus from host text into chat', 'focus', async () => {
  const x = await openHost(await seed(), kind, { configFaults: ['503', '503', '503'] }); await waitConfigSettled(x);
  await openChat(x); await press(x, '#mcDesk .cfg button'); await x.page.waitForTimeout(300); // second read fails; automatic retry pending
  await press(x, kind === 'phone' ? 'h1' : '#hostText'); const before = await x.page.evaluate(() => document.activeElement === document.body);
  await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled, null, { timeout: 25000 });
  await x.page.waitForTimeout(200);
  const after = await x.page.evaluate(() => document.activeElement?.tagName);
  assert.ok(before, 'Focus on body after clicking host text'); assert.equal(after, 'BODY', 'Focus pulled into the widget: ' + after);
  return { after };
});
await check('desktop config retry success does not move focus off a host input', 'focus', async () => {
  const x = await openHost(await seed(), 'desktop', { configFaults: ['503', '503', '503'] }); await waitConfigSettled(x);
  await openChat(x); await x.page.locator('#mcDesk .cfg button').click(); await x.page.waitForTimeout(300);
  await x.page.locator('#hostInput').click();
  await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled, null, { timeout: 25000 }); await x.page.waitForTimeout(200);
  assert.equal(await x.page.evaluate(() => document.activeElement?.id), 'hostInput');
});
await check('phone slow reply arriving after a host tap does not pull focus into chat', 'focus', async () => {
  const x = await openHost(await seed(), 'phone', { chat: { mode: 'slow', ms: 1200 } }); await waitConfigSettled(x); await openChat(x);
  await x.page.locator('#mcDesk textarea').fill('What services do you offer?'); await press(x, '#mcDesk button.s');
  await x.page.locator('#mcDesk .m .t').waitFor(); await press(x, 'h1');
  await x.page.waitForFunction(() => !document.querySelector('#mcDesk .m .t') && document.querySelectorAll('#mcDesk .m .b.a').length === 2); await x.page.waitForTimeout(150);
  assert.equal(await x.page.evaluate(() => document.activeElement?.tagName), 'BODY', 'Focus pulled into the widget after the reply');
});
await check('desktop Esc during IME (keyCode 229) does not close chat', 'ime', async () => {
  const x = await openHost(await seed(), 'desktop'); await waitConfigSettled(x); await openChat(x);
  await x.page.evaluate(() => { const e = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }); Object.defineProperty(e, 'keyCode', { get: () => 229 }); document.querySelector('#mcDesk textarea').dispatchEvent(e); });
  assert.equal(await x.page.locator('#mcDesk.open').count(), 1);
});
await check('phone open with failed config puts focus inside the panel', 'focus', async () => {
  const x = await openHost(await seed(), 'phone', { configFaults: ['503', '503', '503', '503'] }); await waitConfigSettled(x);
  await openChat(x); await x.page.waitForTimeout(300);
  const f = await inPanel(x.page); assert.ok(f.inside, 'Focus outside the dialog: ' + JSON.stringify(f));
  return f;
});

// 5. iOS zoom: form controls at least 16px.
await check('phone text controls are at least 16px (no iOS focus zoom)', 'ios-zoom', async () => {
  const x = await openHost(await seed(), 'phone'); await waitConfigSettled(x); await openChat(x);
  const sizes = await x.page.evaluate(() => {
    const probe = document.createElement('section'); probe.className = 'followup'; probe.innerHTML = '<select><option>x</option></select>'; document.querySelector('#mcDesk .m').append(probe);
    const out = { textarea: parseFloat(getComputedStyle(document.querySelector('#mcDesk textarea')).fontSize), followupSelect: parseFloat(getComputedStyle(probe.querySelector('select')).fontSize) }; probe.remove(); return out;
  });
  assert.ok(sizes.textarea >= 16 && sizes.followupSelect >= 16, JSON.stringify(sizes));
  return sizes;
});

// 6. Phone keyboard must not cover the panel (simulated visual viewport).
const viewportShim = () => {
  window.__vv = null; const proto = window.VisualViewport && VisualViewport.prototype; if (!proto) return;
  for (const key of ['height', 'offsetTop']) { const real = Object.getOwnPropertyDescriptor(proto, key); Object.defineProperty(proto, key, { configurable: true, get() { return window.__vv && key in window.__vv ? window.__vv[key] : real.get.call(this); } }); }
};
async function keyboard(page, vv) { await page.evaluate(vv => { window.__vv = vv; window.visualViewport.dispatchEvent(new Event('resize')); }, vv); await page.waitForTimeout(150); }
const geometry = page => page.evaluate(() => { const r = n => { const b = document.querySelector(n).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; }; return { panel: r('#mcDesk .p'), header: r('#mcDesk .h'), textarea: r('#mcDesk textarea'), send: r('#mcDesk button.s') }; });
await check('phone keyboard open: panel, header and composer stay in the visible viewport', 'keyboard', async () => {
  const x = await openHost(await seed(), 'phone', { init: viewportShim }); await waitConfigSettled(x); await openChat(x);
  const results = [];
  for (const vv of [null, { height: 844 - 336, offsetTop: 0 }, { height: 844 - 336, offsetTop: 120 }]) {
    await keyboard(x.page, vv); const g = await geometry(x.page), top = vv?.offsetTop || 0, bottom = top + (vv?.height || 844);
    results.push({ vv, g });
    for (const [k, b] of Object.entries(g)) assert.ok(b.top >= top - 1 && b.bottom <= bottom + 1, k + ' outside visible area ' + top + '..' + bottom + ': ' + JSON.stringify(g) + ' for ' + JSON.stringify(vv));
    assert.ok(g.panel.bottom - g.panel.top >= 200, 'Panel keeps a usable height: ' + JSON.stringify(g.panel));
    if (vv && !vv.offsetTop) await shot(x.page, 'phone-keyboard-open');
  }
  await keyboard(x.page, null);
  return results;
});

// 7. Close button touch target.
for (const kind of ['phone', 'desktop']) await check(kind + ' close button is at least 44x44 and closes', 'target', async () => {
  const x = await openHost(await seed(), kind); await waitConfigSettled(x); await openChat(x);
  const box = await x.page.locator('#mcDesk .x').boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, 'Close target ' + JSON.stringify(box));
  await press(x, '#mcDesk .x'); assert.equal(await x.page.locator('#mcDesk.open').count(), 0);
  return box;
});

// 8. IME composition: Enter that commits a composition must not send.
await check('desktop Enter during IME composition does not send', 'ime', async () => {
  const x = await openHost(await seed(), 'desktop'); await waitConfigSettled(x); await openChat(x);
  await x.page.locator('#mcDesk textarea').fill('にほんごで');
  await x.page.evaluate(() => { const t = document.querySelector('#mcDesk textarea');
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: true }));
    const safari = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }); Object.defineProperty(safari, 'keyCode', { get: () => 229 }); t.dispatchEvent(safari); });
  await x.page.waitForTimeout(400);
  assert.equal(chatPosts(x).length, 0, 'A composing Enter sent the message');
  assert.equal(await x.page.locator('#mcDesk textarea').inputValue(), 'にほんごで');
  await x.page.locator('#mcDesk textarea').press('Enter');
  await x.page.waitForFunction(() => document.querySelectorAll('#mcDesk .m .b.a:not(.t)').length === 2);
  assert.equal(chatPosts(x).length, 1, 'A plain Enter sends');
});

// 9. Third-party safety: styles scoped, host page untouched, origin derived from the script src.
await check('desktop CSS stays scoped and host styles are unchanged', 'guard', async () => {
  const slug = await seed();
  const styles = page => page.evaluate(() => ['body', 'h1', 'p', 'a', '#hostInput'].map(s => { const c = getComputedStyle(document.querySelector(s)); return [s, c.fontFamily, c.fontSize, c.color, c.boxSizing, c.lineHeight, c.outlineStyle].join('|'); }));
  const control = await openHost(slug, 'desktop', { embed: false }), before = await styles(control.page), globalsBefore = await control.page.evaluate(() => Object.keys(window).length);
  const x = await openHost(slug, 'desktop'); await waitConfigSettled(x); await openChat(x);
  assert.deepEqual(await styles(x.page), before, 'Host computed styles changed');
  const rules = await x.page.evaluate(() => { const out = []; const sheet = [...document.styleSheets].find(s => s.ownerNode?.textContent.includes('#mcDesk')); const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) { if (r.name) out.push('@keyframes ' + r.name); else walk(r.cssRules); } else if (r.selectorText) out.push(r.selectorText); } }; walk(sheet.cssRules); return out; });
  const leaks = rules.filter(s => !s.startsWith('@keyframes mc') && s.split(',').some(part => !part.trim().startsWith('#mcDesk')));
  assert.deepEqual(leaks, [], 'Unscoped selectors');
  assert.equal(await x.page.evaluate(() => Object.keys(window).length), globalsBefore, 'No new globals');
  assert.ok(x.state.requests.every(r => r.path.startsWith('/api/')), 'API calls go to the script-src origin');
  return { rules: rules.length };
});

await browser.close().catch(() => {});
report.sourceAfter = hashes();
report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
report.servedConsistent = report.served.every(s => s.sha256 === embedSha);
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length;
report.ok = report.passed === report.total && report.physicalNetwork === 0 && !report.forbidden.length && !report.pageErrors.length && report.sourceStable && report.servedConsistent;
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ok: report.ok, passed: report.passed, total: report.total, embedSha, physical: report.physicalNetwork, forbidden: report.forbidden.length, pageErrors: report.pageErrors.length, sourceStable: report.sourceStable, failures: report.checks.filter(c => !c.pass).map(c => c.name) }));
