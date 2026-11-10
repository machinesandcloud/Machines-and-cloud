// Schedule calendar as a new owner: month view, visits, blocked time, month navigation, keyboard-only use,
// Google Calendar status honesty, and computed-style contrast. Card AUTO-REVIEW-94A9EAF863227106.
// Actual owner handlers in-process (/api/client, /api/access, /api/workspace-billing, /api/chat, /api/google/*) via
// Playwright context.route; memory store, fake model, provider env deleted, every non-loopback transport denied.
// Visits are seeded as saved workspace records; blocked time is added and removed through the actual /api/client
// availability_block / availability_unblock handler. No provider, Google, email, OAuth or purchase call is made.
// Usage (from the worktree root):
//   node qa-artifacts/claude-collaboration/calendar/schedule-calendar-ui-check.mjs \
//     --playwright <playwright/index.mjs> --output scratchpad/claude-calendar-<name>.json [--serve-from <dir>] [--only <substring>]
// --serve-from <dir>: serve desk-calendar.js, desk-calendar.css and desk-visits.js from <dir> when present there
// (used for the base-vs-fix comparison). Every served claimed/owned file is pinned by sha256 in the report.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), origin = 'http://127.0.0.1:8944';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only');
const serveFrom = arg('--serve-from') ? resolve(arg('--serve-from')) : null;
if (!output || !/^scratchpad\/claude-calendar-[a-z0-9-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-calendar-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5);
const sha = value => createHash('sha256').update(value).digest('hex');
const CLAIMED = ['desk-calendar.js', 'desk-calendar.css', 'desk-visits.js'];
const watched = ['desk.html', 'desk.js', ...CLAIMED, 'netlify/functions/client.mjs', 'netlify/functions/lib/owner-schedule.mjs', 'qa-artifacts/claude-collaboration/calendar/schedule-calendar-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), card: 'AUTO-REVIEW-94A9EAF863227106', mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', serveFrom, sourceBefore: hashes(), served: {}, checks: [], screenshots: [], measurements: {}, requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_|PLATFORM_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Calendar check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../../netlify/functions/lib/config.mjs');
const { workspaceTenant } = await import('../../../../netlify/functions/lib/workspace-identity.mjs');
const { calendarTenantIdentity, CALENDAR_AVAILABILITY_CONSENT_VERSION } = await import('../../../../netlify/functions/lib/calendar-connection.mjs');
const handlers = {};
for (const file of ['client', 'access', 'workspace-billing', 'google', 'chat']) {
  const mod = await import('../../../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
report.handlers = Object.keys(handlers);
const executablePath = process.env.MC_PLAYWRIGHT_EXECUTABLE || null;
const browser = await playwright.chromium.launch({ ...(executablePath ? { executablePath } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browser = { engine: executablePath ? 'bundled chrome-headless-shell' : 'Google Chrome (channel:chrome, headless, temp profile)', executablePath, version: browser.version() };
let serial = 0; const contexts = [];

// ---------- dates (Houston) ----------
const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const monthAfter = (ym, n) => { const [y, m] = ym.split('-').map(Number), i = y * 12 + m - 1 + n; return String(Math.floor(i / 12)) + '-' + String(i % 12 + 1).padStart(2, '0'); };
const M = monthAfter(chicagoToday().slice(0, 7), 1), N = monthAfter(M, 1);   // both entirely in the future
const longDate = value => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value + 'T12:00:00Z'));
const monthTitle = ym => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(ym + '-15T12:00:00Z'));

async function seed(width, { calendar = null } = {}) {
  const slug = 'cal-ui-' + ++serial + '-' + width, token = sha('cal-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Calendar Shop', trade: 'Plumbing', serviceArea: ['Katy'], hours: 'Mon-Sat 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'calendar'] }, services: ['Drain cleaning'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Sat 8am-5pm');
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const tenantIdentity = workspaceTenant(c), visit = (date, window, name, status = 'booked') => store.addRecord('bookings', slug, { tenantIdentity, customer_name: name, phone: '+17135550142', address: '12 Oak St, Katy', issue: 'Kitchen drain clog', date, window, status, channel: 'owner' });
  const visits = { a: await visit(M + '-05', '8 to 12', 'Jordan Rivera'), cancelled: await visit(M + '-12', '12 to 5', 'Casey Cancelled', 'cancelled'), next: await visit(N + '-03', '8 to 12', 'Morgan Nextmonth') };
  if (calendar) await store.put('calendar_connections', slug, { slug, tenantIdentity: calendarTenantIdentity(c), status: calendar, availabilityConsentVersion: CALENDAR_AVAILABILITY_CONSENT_VERSION, connectedAt: new Date().toISOString(), label: 'Fixture calendar' });
  return { slug, token, c, width, visits };
}
async function open(x, { height = 900, date = M + '-05' } = {}) {
  const { slug, token, width } = x;
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', colorScheme: x.colorScheme || 'light', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  const state = x.state = { requests: [] };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      const action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action) || url.pathname.startsWith('/api/google')) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, query: url.search, method, action, date: body?.date, window: body?.window };
      state.requests.push(item); report.requests.push(item);
      if (x.before && await x.before(item, route, url) === 'handled') return;
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      item.status = response.status; let bytes = Buffer.from(await response.arrayBuffer()); if (x.after) { const nb = await x.after(item, bytes, url, route); if (nb === 'handled') return; if (nb) bytes = nb; }
      // Keep the server's own Google Calendar evidence so the page text can be compared with it.
      if (method === 'GET' && url.pathname === '/api/client' && !url.searchParams.has('schedule')) { try { const j = JSON.parse(bytes); if (j.connections) state.serverCalendar = { calendar: j.connections.calendar, deliveryEnabled: j.connections.calendarDelivery?.enabled }; } catch { /* not JSON */ } }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
    const path = serveFrom && CLAIMED.includes(rel) && existsSync(resolve(serveFrom, rel)) ? resolve(serveFrom, rel) : resolve(root, rel);
    if (!(path.startsWith(root + '/') || serveFrom && path.startsWith(serveFrom + '/')) || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const bytes = readFileSync(path);
    if ([...CLAIMED, 'desk.js', 'desk.html'].includes(rel)) { const d = sha(bytes); (report.served[rel] ||= []).includes(d) || report.served[rel].push(d); }
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', body: bytes });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  await page.goto(origin + '/desk.html?c=' + slug + '&calendar_date=' + date + '&calendar_view=month#availability');
  await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  Object.assign(x, { page, context });
  await settled(x);
  return x;
}
// Settled = the range the calendar shows has arrived from the actual schedule handler.
async function settled(x) {
  await x.page.waitForFunction(() => { const h = document.getElementById('scheduleCalendar'); return h && h.getAttribute('aria-busy') === 'false' && !!h.querySelector('.calendar-month,.calendar-week,.calendar-agenda,.calendar-empty') && !/Loading|Updating|Checking/.test(document.getElementById('calendarStatus')?.textContent || ''); }, null, { timeout: 10000 });
}

// ---------- helpers ----------
async function check(name, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length, t0 = Date.now();
  try { await run(); report.checks.push({ name, pass: true, ms: Date.now() - t0 }); console.log('PASS ' + name); }
  catch (error) {
    const entry = { name, pass: false, ms: Date.now() - t0, error: String(error.stack || error).slice(0, 2500) }; report.checks.push(entry); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]);
    const page = contexts.at(-1)?.pages().at(-1);
    if (page) { entry.state = await snap(page).catch(() => null); entry.screenshot = await shot(page, 'failure-' + report.checks.length).catch(() => null); }
  } finally { await Promise.all(contexts.slice(start).map(context => context.close().catch(() => {}))); }
}
async function shot(page, name, full = false) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path, fullPage: full }); report.screenshots.push(path); return path; }
const snap = page => page.evaluate(() => ({ hash: location.hash, search: location.search, active: document.body.dataset.activePage, focus: (document.activeElement?.id || document.activeElement?.tagName) + ' ' + (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 80), status: document.getElementById('calendarStatus')?.textContent, title: document.getElementById('calendarRangeTitle')?.textContent, panel: document.getElementById('calendarSelectedDay')?.innerText.slice(0, 600), dialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.id) }));
const noHorizontalScroll = async page => { const v = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(v.document <= v.viewport + 1, 'Horizontal scroll ' + JSON.stringify(v)); };
const focused = page => page.evaluate(() => { const a = document.activeElement; return { id: a?.id || '', day: a?.dataset?.calendarDay || '', visit: a?.dataset?.calendarVisit || '', block: a?.dataset?.calendarBlock || '', text: (a?.getAttribute('aria-label') || a?.textContent || '').trim().slice(0, 120), inCalendar: !!document.getElementById('scheduleCalendar')?.contains(a) }; });
const daySel = day => 'button.calendar-day-button[data-calendar-day="' + day + '"]';
const dayButton = (page, day) => page.locator('#calendarGrid ' + daySel(day));
const dayCell = (page, day) => page.locator('#calendarGrid .calendar-month-day', { has: page.locator(daySel(day)) });
const panelText = page => page.locator('#calendarSelectedDay').innerText();

// WCAG relative-luminance contrast from computed styles; background composited up the ancestor chain.
const CONTRAST = () => {
  const parse = v => { const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bg = node => { const layers = []; for (let n = node; n && n.nodeType === 1; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; } let out = [255, 255, 255, 1]; for (const l of layers.reverse()) out = over(l, out); return out; };
  const opacity = node => { let o = 1; for (let n = node; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  return node => { const b = bg(node), fgRaw = parse(getComputedStyle(node).color), fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacity(node)], b), l1 = lum(fg), l2 = lum(b); return { ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100, color: getComputedStyle(node).color, background: 'rgb(' + b.slice(0, 3).map(Math.round).join(',') + ')', fontSize: getComputedStyle(node).fontSize, fontWeight: getComputedStyle(node).fontWeight }; };
};
async function contrastOf(page, selector) { return page.evaluate(({ selector, src }) => { const measure = eval('(' + src + ')')(); return [...document.querySelectorAll(selector)].filter(n => n.getClientRects().length).map(n => ({ text: n.textContent.trim().slice(0, 30), ...measure(n) })); }, { selector, src: CONTRAST.toString() }); }
// Every visible, enabled text run inside the calendar must meet 4.5:1 (3:1 for large text).
async function contrastSweep(page) {
  return page.evaluate(src => {
    const measure = eval('(' + src + ')')(), host = document.getElementById('scheduleCalendar'), out = [];
    for (const n of host.querySelectorAll('*')) {
      if (!n.getClientRects().length || getComputedStyle(n).visibility === 'hidden' || n.closest(':disabled,[aria-disabled=true]')) continue;
      const own = [...n.childNodes].filter(t => t.nodeType === 3).map(t => t.textContent.trim()).join(' ').trim(); if (!own) continue;
      const m = measure(n), px = parseFloat(m.fontSize), large = px >= 24 || px >= 18.66 && Number(m.fontWeight) >= 700, need = large ? 3 : 4.5;
      if (m.ratio < need) out.push({ text: own.slice(0, 40), cls: n.className || n.parentElement?.className, need, ...m });
    }
    return out;
  }, CONTRAST.toString());
}
async function tabTo(page, predicate, limit = 120) {
  for (let i = 0; i < limit; i++) { await page.keyboard.press('Tab'); const f = await focused(page); if (predicate(f)) return f; }
  throw new Error('Keyboard focus never reached the target within ' + limit + ' Tab presses; last ' + JSON.stringify(await focused(page)));
}

// ===================== Independent QA probes (reviewer-authored) =====================
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isUnblock = item => item.action === 'availability_unblock';
const isSchedule = item => item.method === 'GET' && /schedule=1/.test(item.query || '');
const status = p => p.locator('#calendarStatus').innerText();
const storeBlocks = async x => (await store.get('clients', x.slug))?.availabilityBlocks || (await import('../../../../netlify/functions/lib/store.mjs')).default;
async function removeFromPanel(x, day) {
  const p = x.page; await dayButton(p, day).focus(); await p.keyboard.press('Enter');
  await p.locator('#calendarSelectedDay [data-calendar-remove-block]').first().focus(); await p.keyboard.press('Enter');
}
async function waitForm(p, re) { await p.waitForFunction(src => new RegExp(src).test(document.getElementById('availabilityMessage').textContent), re.source, { timeout: 25000 }); }
const Q = {};
try {
  await check('QA P1 removal answered 500: calendar never says "Block removed", block still shown, Refresh does not resurrect a notice', async () => {
    const x = await seed(1440); await setBlock(x, N + '-03', '');
    x.before = async (item, route) => { if (isUnblock(item)) { item.status = 500; await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'availability_unavailable' }) }); return 'handled'; } };
    await open(x, { date: N + '-03' }); const p = x.page;
    await removeFromPanel(x, N + '-03'); await waitForm(p, /could not|Reload/); await settled(x).catch(() => {});
    const s1 = await status(p); Q.p1_after = s1; assert.doesNotMatch(s1, /Block removed/, s1);
    assert.match(await panelText(p), /Blocked time\s*Whole day/);
    x.before = null; await p.locator('#calendarRefresh,#calendarRetry').first().click(); await settled(x);
    const s2 = await status(p); Q.p1_refresh = s2; assert.doesNotMatch(s2, /Block removed/, s2);
    assert.equal(await dayButton(p, N + '-03').getAttribute('aria-label'), longDate(N + '-03') + ', 1 visit, 1 block');
  });
  await check('QA P2 removal response lost (transport abort): no "Block removed"', async () => {
    const x = await seed(1440); await setBlock(x, N + '-03', '');
    x.before = async (item, route) => { if (isUnblock(item)) { item.status = 'aborted'; await route.abort('failed'); return 'handled'; } };
    await open(x, { date: N + '-03' }); const p = x.page;
    await removeFromPanel(x, N + '-03'); await waitForm(p, /could not be confirmed|timed out|Reload/);
    await sleep(300); const s = await status(p); Q.p2 = s; assert.doesNotMatch(s, /Block removed/, s);
  });
  await check('QA P2b server COMMITTED the removal but the response was lost: no "Block removed" claim; after Refresh the grid reflects the server', async () => {
    const x = await seed(1440); await setBlock(x, N + '-03', '');
    x.after = async (item, bytes, url, route) => { if (isUnblock(item)) { item.lostAfterCommit = true; await route.abort('failed'); return 'handled'; } };
    await open(x, { date: N + '-03' }); const p = x.page;
    await removeFromPanel(x, N + '-03'); await waitForm(p, /could not be confirmed|timed out|Reload/);
    await sleep(300); const s = await status(p); Q.p2b = s; assert.doesNotMatch(s, /Block removed/, s);
    x.after = null; await p.locator('#calendarRefresh,#calendarRetry').first().click(); await settled(x);
    const s2 = await status(p); Q.p2b_refresh = s2; assert.doesNotMatch(s2, /Block removed/, s2);
    assert.equal(await dayButton(p, N + '-03').getAttribute('aria-label'), longDate(N + '-03') + ', 1 visit', 'grid shows the server truth after refresh');
  });
  await check('QA P3 200 ok but server list still contains the block: no "Block removed"', async () => {
    const x = await seed(1440); await setBlock(x, N + '-03', '');
    x.after = async (item, bytes) => { if (isUnblock(item)) { const j = JSON.parse(bytes); j.availabilityBlocks = [...(j.availabilityBlocks || []), { date: N + '-03', window: '' }]; return Buffer.from(JSON.stringify(j)); } };
    await open(x, { date: N + '-03' }); const p = x.page;
    await removeFromPanel(x, N + '-03'); await waitForm(p, /Block removed/); await settled(x);
    const s = await status(p); Q.p3 = s; assert.doesNotMatch(s, /Block removed/, s);
  });
  await check('QA P4 owner moves focus OUTSIDE the calendar during a slow removal: focus is not stolen back', async () => {
    const x = await seed(1440); await setBlock(x, N + '-03', '');
    x.before = async item => { if (isUnblock(item)) await sleep(1500); };
    await open(x, { date: N + '-03' }); const p = x.page;
    await removeFromPanel(x, N + '-03'); await sleep(150);
    const during = await focused(p); Q.p4_during = during;
    const outsideId = await p.evaluate(() => { const host = document.getElementById('scheduleCalendar'); const n = [...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')].find(n => !host.contains(n) && n.getClientRects().length && !n.closest('dialog')); n.id ||= 'qaOutsideTarget'; n.focus(); return n.id; });
    await waitForm(p, /Block removed/); await settled(x); await sleep(300);
    const after = await p.evaluate(() => document.activeElement?.id); Q.p4_after = { outsideId, after };
    assert.equal(after, outsideId, 'focus stayed where the owner moved it');
  });
  await check('QA P4b owner moves focus to Next-month INSIDE the calendar during a slow removal: focus stays on Next', async () => {
    const x = await seed(1440); await setBlock(x, N + '-03', '');
    x.before = async item => { if (isUnblock(item)) await sleep(1500); };
    await open(x, { date: N + '-03' }); const p = x.page;
    await removeFromPanel(x, N + '-03'); await sleep(150); await p.locator('#calendarJumpDate').focus();
    await waitForm(p, /Block removed/); await settled(x); await sleep(300);
    const f = await focused(p); Q.p4b = f; assert.equal(f.id, 'calendarJumpDate', JSON.stringify(f));
  });
  await check('QA P5 Refresh pressed repeatedly while busy: exactly one schedule read; aria-disabled exposed; focus kept', async () => {
    const x = await seed(1440); await open(x); const p = x.page;
    x.before = async item => { if (isSchedule(item)) await sleep(1500); };
    await p.locator('#calendarRefresh').focus(); const n0 = x.state.requests.filter(isSchedule).length;
    await p.keyboard.press('Enter'); await sleep(200);
    const attr = await p.locator('#calendarRefresh').getAttribute('aria-disabled'), disabledProp = await p.locator('#calendarRefresh').evaluate(n => n.disabled);
    await p.keyboard.press('Enter'); await p.keyboard.press('Space'); await p.locator('#calendarRefresh').click({ force: true });
    const f = await focused(p); await settled(x); await sleep(300);
    const reads = x.state.requests.filter(isSchedule).length - n0; Q.p5 = { attr, disabledProp, reads, focusDuring: f.id, ax: await p.locator('#calendarRefresh').evaluate(n => n.getAttribute('aria-disabled')) };
    assert.equal(attr, 'true'); assert.equal(disabledProp, false); assert.equal(f.id, 'calendarRefresh'); assert.equal(reads, 1, 'reads=' + reads);
  });
  await check('QA P5b Retry pressed repeatedly while busy after a failed read: exactly one schedule read', async () => {
    const x = await seed(1440); await open(x); const p = x.page; let fail = true;
    x.before = async (item, route) => { if (isSchedule(item) && fail) { fail = false; await route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"message":"Schedule unavailable."}' }); return 'handled'; } if (isSchedule(item)) await sleep(1500); };
    await p.locator('#calendarRefresh').click(); await p.waitForSelector('#calendarRetry');
    await p.locator('#calendarRetry').focus(); const n0 = x.state.requests.filter(isSchedule).length;
    for (let i = 0; i < 4; i++) await p.keyboard.press('Enter');
    const f = await focused(p); await settled(x); await sleep(300);
    const reads = x.state.requests.filter(isSchedule).length - n0; Q.p5b = { reads, focus: f.id, status: await status(p) };
    assert.equal(reads, 1, 'reads=' + reads); assert.equal(f.id, 'calendarRetry');
  });
  await check('QA P6 "Block removed" notice must not hide an incomplete-records warning', async () => {
    const x = await seed(1440); await setBlock(x, N + '-03', ''); let removed = false;
    x.after = async (item, bytes) => { if (isUnblock(item)) removed = true; if (removed && isSchedule(item)) { const j = JSON.parse(bytes); j.schedule.listing = { ...(j.schedule.listing || {}), incomplete: true, complete: false }; return Buffer.from(JSON.stringify(j)); } };
    await open(x, { date: N + '-03' }); const p = x.page;
    await removeFromPanel(x, N + '-03'); await waitForm(p, /Block removed/); await settled(x);
    const s = await status(p), retry = await p.locator('#calendarRetry').count(); Q.p6 = { status: s, retryShown: retry };
    assert.match(s, /incomplete|may be missing/, 'incomplete warning visible: ' + s);
  });
  await check('QA P7 "Block removed" notice cleared on Today and on Go-to-date navigation', async () => {
    const x = await seed(1440); await setBlock(x, N + '-03', '');
    await open(x, { date: N + '-03' }); const p = x.page;
    await removeFromPanel(x, N + '-03'); await waitForm(p, /Block removed/); await settled(x);
    Q.p7_before = await status(p);
    await p.locator('#calendarToday').click(); await settled(x); Q.p7_today = await status(p);
    await removeFromPanel(x, N + '-03').catch(() => {});
    await p.locator('#calendarJumpDate').fill(M + '-05'); await p.locator('#calendarJumpSubmit').click(); await settled(x); Q.p7_jump = await status(p);
    assert.doesNotMatch(Q.p7_today, /Block removed/, 'after Today: ' + Q.p7_today);
  });
  for (const [label, row, expect, forbid] of [
    ['disconnected', { status: 'disconnected' }, /Google Calendar is not connected/, /permission saved|sync|(?<!not )connected\./i],
    ['connected-old-consent', { status: 'connected', availabilityConsentVersion: '2020-01-01-old' }, /needs attention/, /permission saved|sync enabled/i],
    ['foreign-tenant', { status: 'connected', tenantIdentity: 'f'.repeat(64) }, /not connected/, /permission saved|sync/i],
  ]) await check('QA P8 connection state ' + label + ' is worded from the server record', async () => {
    const x = await seed(1440); const { calendarTenantIdentity: ti } = await import('../../../../netlify/functions/lib/calendar-connection.mjs');
    await store.put('calendar_connections', x.slug, { slug: x.slug, tenantIdentity: ti(x.c), connectedAt: new Date().toISOString(), label: 'Fixture', ...row });
    await open(x); const s = await x.page.locator('#calendarCalendarConnection').innerText();
    Q['p8_' + label] = { ui: s, server: x.state.serverCalendar }; assert.match(s, expect, s); assert.doesNotMatch(s, forbid, s);
    assert.doesNotMatch(await x.page.locator('#scheduleCalendar').innerText(), /synced|events appear|shows (your )?Google events/i);
  });
  await check('QA P8b server delivery enabled (mutated response) is the ONLY path to "sync enabled"; connections absent renders no line', async () => {
    const x = await seed(1440, { calendar: 'connected' });
    x.after = async (item, bytes, url) => { if (item.method === 'GET' && url.pathname === '/api/client' && !url.searchParams.has('schedule')) { const j = JSON.parse(bytes); if (j.connections) j.connections.calendarDelivery.enabled = true; return Buffer.from(JSON.stringify(j)); } };
    await open(x); const s = await x.page.locator('#calendarCalendarConnection').innerText(); Q.p8b_enabled = s; assert.match(s, /sync enabled.*not Google events/, s);
    const acct = await x.page.evaluate(() => [...document.querySelectorAll('body *')].map(n => n.childNodes).flatMap(c => [...c]).filter(t => t.nodeType === 3 && /Permission saved|permission saved/.test(t.textContent)).map(t => t.textContent.trim()).slice(0, 6));
    Q.p8b_account_copy = acct;
    const y = await seed(1440); y.after = async (item, bytes, url) => { if (item.method === 'GET' && url.pathname === '/api/client' && !url.searchParams.has('schedule')) { const j = JSON.parse(bytes); delete j.connections; return Buffer.from(JSON.stringify(j)); } };
    await open(y); Q.p8b_absent = await y.page.locator('#calendarCalendarConnection').count(); assert.equal(Q.p8b_absent, 0);
  });
  await check('QA P9 dark colour scheme: no dark theme exists, calendar contrast sweep still clean', async () => {
    const x = await seed(1440); x.colorScheme = 'dark'; await open(x, { date: M + '-12' }); const p = x.page;
    Q.p9_dark = await p.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
    const out = {}; for (const mode of ['month', 'week', 'agenda']) { await p.locator('[data-calendar-view="' + mode + '"]').click(); await settled(x); out[mode] = await contrastSweep(p); }
    Q.p9 = out; assert.equal(Q.p9_dark, true); assert.deepEqual(Object.values(out).flat(), []);
    const y = await seed(390); y.colorScheme = 'dark'; await open(y, { height: 844, date: M + '-12' }); Q.p9_390 = await contrastSweep(y.page);
    Q.p9_390_counts = await contrastOf(y.page, '.calendar-mobile-counts span'); assert.deepEqual(Q.p9_390, []);
  });
  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); assert.deepEqual(report.forbidden.filter(f => !f.path?.startsWith('/api/google')), []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.qa = Q; report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, total: report.checks.length, physicalNetwork: report.physicalNetwork, pageErrors: report.pageErrors.length };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, ...report.summary, browser: report.browser, served: report.served, sourceStable: report.sourceStable, failures: report.checks.filter(c => !c.pass).map(c => ({ name: c.name, error: c.error.split('\n')[0].slice(0, 300) })) }, null, 1));
  if (report.summary.failed || !report.sourceStable) process.exitCode = 1;
}

async function setBlock(x, date, window) { const { setAvailabilityBlock } = await import('../../../../netlify/functions/lib/store.mjs'); await setAvailabilityBlock(x.c, date, window, true); }
