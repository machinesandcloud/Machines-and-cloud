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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), origin = 'http://127.0.0.1:8944';
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
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../netlify/functions/lib/config.mjs');
const { workspaceTenant } = await import('../../../netlify/functions/lib/workspace-identity.mjs');
const { calendarTenantIdentity, CALENDAR_AVAILABILITY_CONSENT_VERSION } = await import('../../../netlify/functions/lib/calendar-connection.mjs');
const handlers = {};
for (const file of ['client', 'access', 'workspace-billing', 'google', 'chat']) {
  const mod = await import('../../../netlify/functions/' + file + '.mjs');
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
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
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
      // Fixture faults for schedule reads: refuse the next one, or hold it until the check releases it.
      if (url.searchParams.get('schedule') === '1' && state.failNextSchedule) { state.failNextSchedule = false; item.status = 503; item.fixture = 'schedule-503'; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, message: 'Synthetic schedule outage.' }) }); }
      if (url.searchParams.get('schedule') === '1' && state.holdSchedule) { item.fixture = 'schedule-held'; await new Promise(release => { state.releaseSchedule = release; }); state.holdSchedule = false; }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      item.status = response.status; let bytes = Buffer.from(await response.arrayBuffer());
      if (action === 'availability_unblock' && response.status === 200) state.unblocked = true;
      if (x.incompleteAfterUnblock && state.unblocked && url.searchParams.get('schedule') === '1' && response.status === 200) { const j = JSON.parse(bytes); j.schedule.listing = { ...(j.schedule.listing || {}), incomplete: true, complete: false }; bytes = Buffer.from(JSON.stringify(j)); item.markedIncomplete = true; }
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
// Wait on state, not time: poll focus until it matches (or 6 s pass), then let the caller assert on what was seen.
async function focusWhere(page, predicate, timeout = 6000) { const end = Date.now() + timeout; let f; do { f = await focused(page); if (predicate(f)) return f; await new Promise(r => setTimeout(r, 50)); } while (Date.now() < end); return f; }
// Esc, then wait until the dialog's async close event has been handled by desk.js and the calendar
// (mc:schedule-visit-closed restores focus); acting before that lets the late restore steal focus.
async function closeVisit(page) {
  const before = await page.evaluate(() => { if (!window.__visitClosed) { window.__visitClosed = 0; document.addEventListener('mc:schedule-visit-closed', () => { window.__visitClosed++; }); } return window.__visitClosed; });
  await page.keyboard.press('Escape');
  await page.waitForFunction(n => !document.getElementById('visitDialog').open && window.__visitClosed > n, before);
}
const statusText = page => page.locator('#calendarStatus').innerText();
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
  const trail = [];
  for (let i = 0; i < limit; i++) { await page.keyboard.press('Tab'); const f = await focused(page); trail.push(f.id || f.day || f.visit || f.text.slice(0, 20)); if (predicate(f)) { f.trail = trail; return f; } }
  throw new Error('Keyboard focus never reached the target within ' + limit + ' Tab presses; last ' + JSON.stringify(await focused(page)));
}

try {
  for (const width of [1440, 390]) {
    const height = width === 390 ? 844 : 900;

    await check(width + 'px month view shows saved visits and blocked time from the actual schedule handler; next-month days meet 4.5:1', async () => {
      const x = await seed(width); await open(x, { height });
      const p = x.page;
      // Block time through the actual availability handler, then let the calendar re-read the range.
      await p.evaluate(() => document.getElementById('scheduleBlockManager').open = true);
      for (const [day, window] of [[M + '-05', '12 to 5'], [M + '-20', '']]) {
        await p.locator('#availabilityDate').fill(day); await p.locator('#availabilityWindow').selectOption(window);
        await p.locator('#availabilitySubmit').click(); await p.waitForFunction(() => /Time blocked/.test(document.getElementById('availabilityMessage').textContent));
      }
      await p.evaluate(() => document.getElementById('scheduleBlockManager').open = false); await settled(x);
      const blockPosts = x.state.requests.filter(r => r.action === 'availability_block' && r.status === 200); assert.equal(blockPosts.length, 2, 'two blocks saved by the handler');
      assert.equal(await p.locator('#calendarRangeTitle').innerText(), monthTitle(M));
      assert.match(await p.locator('#calendarStatus').innerText(), /Saved visits and blocked time/);
      assert.equal(await dayButton(p, M + '-05').getAttribute('aria-label'), longDate(M + '-05') + ', 1 visit, 1 block');
      assert.equal(await dayButton(p, M + '-12').getAttribute('aria-label'), longDate(M + '-12') + ', 1 cancelled visit');
      assert.equal(await dayButton(p, M + '-20').getAttribute('aria-label'), longDate(M + '-20') + ', 1 block');
      if (width === 1440) {
        const cell = dayCell(p, M + '-05');
        assert.equal(await cell.locator('[data-calendar-visit="' + x.visits.a.id + '"]').count(), 1, 'visit chip in its day cell');
        assert.match(await cell.locator('.calendar-event-block').innerText(), /12 to 5\s*Blocked time/);
      } else {
        assert.match(await dayCell(p, M + '-05').locator('.calendar-mobile-counts').innerText(), /● 1\s*▰ 1/);
      }
      const panel = await panelText(p); assert.match(panel, /Jordan Rivera/); assert.match(panel, /Blocked time\s*12 to 5/);
      // Next-month (adjacent) days: computed contrast, measured.
      const adjacent = await contrastOf(p, '.calendar-month-day.calendar-adjacent .calendar-day-button > span');
      assert.ok(adjacent.length > 0, 'month grid shows adjacent-month days');
      report.measurements[width + '-adjacent'] = adjacent[0];
      const worst = adjacent.reduce((a, b) => a.ratio <= b.ratio ? a : b);
      assert.ok(worst.ratio >= 4.5, 'adjacent-month day contrast ' + JSON.stringify(worst));
      await noHorizontalScroll(p); await p.locator('#scheduleCalendar').scrollIntoViewIfNeeded(); await shot(p, 'month-' + width);
    });

    await check(width + 'px every visible text run in the calendar meets WCAG contrast (cancelled visits, empty states, legend)', async () => {
      const x = await seed(width); await open(x, { height, date: M + '-12' });
      const views = {};
      for (const mode of ['month', 'week', 'agenda']) {
        await x.page.locator('[data-calendar-view="' + mode + '"]').click(); await settled(x);
        views[mode] = await contrastSweep(x.page);
      }
      report.measurements[width + '-sweep'] = views;
      const failures = Object.entries(views).flatMap(([mode, rows]) => rows.map(r => mode + ': "' + r.text + '" ' + r.ratio + ':1 (' + r.color + ' on ' + r.background + ', ' + r.fontSize + ')'));
      assert.deepEqual([...new Set(failures)], [], 'low-contrast text');
    });

    await check(width + 'px opening a visit from the calendar shows that visit, and closing returns focus to it', async () => {
      const x = await seed(width); await open(x, { height });
      const p = x.page, button = p.locator('#calendarSelectedDay [data-calendar-visit="' + x.visits.a.id + '"]');
      await button.click();
      await p.waitForFunction(() => document.getElementById('visitDialog').open);
      const details = await p.locator('#visitDialog').innerText();
      assert.match(details, /Jordan Rivera/, 'dialog names the visit customer'); assert.match(details, /8 to 12/);
      assert.equal(await p.locator('#visitDate').inputValue(), M + '-05', 'the visit date is preloaded');
      await noHorizontalScroll(p); await shot(p, 'visit-open-' + width);
      await closeVisit(p);
      const f = await focusWhere(p, f => f.visit === x.visits.a.id); assert.equal(f.visit, x.visits.a.id, 'focus returns to the visit: ' + JSON.stringify(f));
    });

    await check(width + 'px moving between months loads that month from the handler and keeps visits and blocks in their own month', async () => {
      const x = await seed(width); await setBlock(x, N + '-03', '');
      await open(x, { height });
      const p = x.page;
      await p.locator('#calendarNext').click(); await settled(x);
      assert.equal(await p.locator('#calendarRangeTitle').innerText(), monthTitle(N));
      assert.equal(await dayButton(p, N + '-03').getAttribute('aria-label'), longDate(N + '-03') + ', 1 visit, 1 block');
      const ranges = x.state.requests.filter(r => /schedule=1/.test(r.query || '')).map(r => new URLSearchParams(r.query).get('from'));
      assert.ok(ranges.length >= 2, 'a second range was read: ' + ranges);
      assert.ok(x.state.requests.filter(r => /schedule=1/.test(r.query || '')).every(r => r.status === 200), 'schedule reads succeeded');
      await p.locator('#calendarPrevious').click(); await p.locator('#calendarPrevious').click(); await settled(x);
      assert.equal(await p.locator('#calendarRangeTitle').innerText(), monthTitle(monthAfter(M, -1)));
      assert.doesNotMatch(await p.locator('#calendarGrid').innerText(), /Morgan Nextmonth/);
      await p.locator('#calendarToday').click(); await settled(x);
      assert.equal(await p.locator('#calendarRangeTitle').innerText(), monthTitle(chicagoToday().slice(0, 7)));
      assert.ok(new URL(p.url()).searchParams.get('calendar_date') === chicagoToday(), 'Today is kept in the address');
      await noHorizontalScroll(p);
    });

    await check(width + 'px keyboard only: reach the selected day, arrow and PageDown across months, open a visit, block time and return', async () => {
      const x = await seed(width); await open(x, { height, date: M + '-27' });
      const p = x.page;
      await p.locator('#calendarToday').focus(); await p.locator('#calendarToday').evaluate(n => n.blur());
      await p.locator('#calendarJumpDate').focus();
      const start = await tabTo(p, f => !!f.day);
      assert.equal(start.day, M + '-27', 'Tab lands on the selected day (roving tabindex)');
      await p.keyboard.press('PageDown'); await settled(x);
      let f = await focusWhere(p, f => f.day === N + '-27'); assert.equal(f.day, N + '-27', 'PageDown keeps focus on the same day next month: ' + JSON.stringify(f));
      assert.equal(await p.locator('#calendarRangeTitle').innerText(), monthTitle(N));
      for (let i = 0; i < 24; i++) await p.keyboard.press('ArrowLeft');
      await settled(x); f = await focusWhere(p, f => f.day === N + '-03'); assert.equal(f.day, N + '-03', 'arrows move one day: ' + JSON.stringify(f));
      await p.keyboard.press('Enter');
      f = await focusWhere(p, f => f.id === 'calendarSelectedTitle'); assert.equal(f.id, 'calendarSelectedTitle', 'Enter opens the day panel');
      f = await tabTo(p, f => f.visit === x.visits.next.id, 20);
      await p.keyboard.press('Enter'); await p.waitForFunction(() => document.getElementById('visitDialog').open);
      assert.match(await p.locator('#visitDialog').innerText(), /Morgan Nextmonth/);
      await closeVisit(p);
      f = await focusWhere(p, f => f.visit === x.visits.next.id); assert.equal(f.visit, x.visits.next.id, 'Esc returns to the visit');
      await p.locator('#calendarBlockTime').focus(); await p.keyboard.press('Enter');
      f = await focusWhere(p, f => f.id === 'availabilityDate'); assert.equal(f.id, 'availabilityDate', 'Block time moves to the date field'); assert.equal(await p.locator('#availabilityDate').inputValue(), N + '-03');
      const startFocus = await focused(p); f = await tabTo(p, f => f.id === 'availabilitySubmit' || f.inCalendar, 12); assert.equal(f.id, 'availabilitySubmit', 'Tab from the date reaches Block time in the form: ' + JSON.stringify(f) + ' start ' + JSON.stringify(startFocus));
      await p.keyboard.press('Enter'); await p.waitForFunction(() => /Time blocked/.test(document.getElementById('availabilityMessage').textContent));
      f = await focusWhere(p, f => f.id === 'availabilityBackToCalendar'); assert.equal(f.id, 'availabilityBackToCalendar', 'after saving, focus offers the way back');
      await p.keyboard.press('Enter'); await settled(x);
      f = await focusWhere(p, f => f.id === 'calendarSelectedTitle'); assert.equal(f.id, 'calendarSelectedTitle', 'back on the calendar day');
      await p.waitForFunction(day => /Blocked time\s*Whole day/.test(document.getElementById('calendarSelectedDay')?.innerText || '') && /1 block$/.test(document.querySelector('#calendarGrid button.calendar-day-button[data-calendar-day="' + day + '"]')?.getAttribute('aria-label') || ''), N + '-03');
      assert.match(await panelText(p), /Blocked time\s*Whole day/);
      assert.equal(await dayButton(p, N + '-03').getAttribute('aria-label'), longDate(N + '-03') + ', 1 visit, 1 block');
      await noHorizontalScroll(p); await p.locator('#calendarSelectedDay').scrollIntoViewIfNeeded(); await shot(p, 'keyboard-' + width);
    });

    await check(width + 'px keyboard only: removing a block from the day panel keeps focus on that day', async () => {
      const x = await seed(width); await setBlock(x, N + '-03', ''); await open(x, { height, date: N + '-03' });
      const p = x.page; let f;
      assert.equal(await dayButton(p, N + '-03').getAttribute('aria-label'), longDate(N + '-03') + ', 1 visit, 1 block');
      await dayButton(p, N + '-03').focus(); await p.keyboard.press('Enter');
      f = await tabTo(p, f => /Remove block/.test(f.text), 20); await p.keyboard.press('Enter');
      await p.waitForFunction(() => /Block removed/.test(document.getElementById('availabilityMessage').textContent)); await settled(x);
      assert.equal(await dayButton(p, N + '-03').getAttribute('aria-label'), longDate(N + '-03') + ', 1 visit');
      f = await focusWhere(p, f => f.id === 'calendarSelectedTitle'); assert.equal(f.id, 'calendarSelectedTitle', 'focus stays on the selected day after removing a block (not the page body): ' + JSON.stringify(f));
      const status = await p.locator('#calendarStatus').innerText(); report.measurements[width + '-remove-status'] = status;
      assert.match(status, new RegExp('Block removed: ' + longDate(N + '-03') + ' · Whole day'), 'the calendar itself confirms the removal (the form message is inside a closed panel): ' + status);
      assert.equal(await p.locator('#scheduleBlockManager').evaluate(n => n.open), false, 'Manage blocked time stays closed');
      await shot(p, 'remove-block-focus-' + width);
    });

    await check(width + 'px keyboard only: Refresh keeps focus on Refresh while the schedule reloads', async () => {
      const x = await seed(width); await open(x, { height }); const p = x.page; let f;
      await p.locator('#calendarRefresh').focus(); const reads = x.state.requests.length; await p.keyboard.press('Enter'); await settled(x);
      assert.ok(x.state.requests.slice(reads).some(r => /schedule=1/.test(r.query || '') && r.status === 200), 'Refresh re-read the range');
      f = await focusWhere(p, f => f.id === 'calendarRefresh'); assert.equal(f.id, 'calendarRefresh', 'focus stays on Refresh after reloading: ' + JSON.stringify(f));
    });

    if (width === 1440) await check('1440px keyboard only: Retry schedule pressed repeatedly while reloading reads once and keeps focus', async () => {
      const x = await seed(width); await open(x, { height }); const p = x.page;
      x.state.failNextSchedule = true; await p.locator('#calendarRefresh').click();
      await p.waitForFunction(() => !!document.getElementById('calendarRetry') && document.getElementById('scheduleCalendar').getAttribute('aria-busy') === 'false');
      await p.locator('#calendarRetry').focus(); x.state.holdSchedule = true; const n0 = x.state.requests.filter(r => /schedule=1/.test(r.query || '')).length;
      for (let i = 0; i < 4; i++) await p.keyboard.press('Enter');
      await p.waitForFunction(() => document.getElementById('scheduleCalendar').getAttribute('aria-busy') === 'true');
      const during = await focusWhere(p, f => f.id === 'calendarRetry'); report.measurements['retry-focus-during'] = during.id;
      assert.equal(during.id, 'calendarRetry', 'focus stays on Retry while it reloads: ' + JSON.stringify(during));
      for (let i = 0; i < 100 && !x.state.releaseSchedule; i++) await new Promise(r => setTimeout(r, 50));
      x.state.releaseSchedule(); await settled(x);
      const reads = x.state.requests.filter(r => /schedule=1/.test(r.query || '')).length - n0; assert.equal(reads, 1, 'one schedule read for four presses');
      const after = await focusWhere(p, f => f.id === 'calendarRefresh'); report.measurements['retry-focus-after'] = after.id;
      assert.equal(after.id, 'calendarRefresh', 'after success, focus is on the Refresh control that replaced Retry: ' + JSON.stringify(after));
      assert.match(await statusText(p), /Saved visits and blocked time/);
    });

    if (width === 1440) await check('1440px an incomplete schedule after a block removal shows the incomplete warning, not "Block removed"', async () => {
      const x = await seed(width); await setBlock(x, N + '-03', '');
      // After the actual unblock, every schedule read is marked incomplete (the server's listing flag), nothing else changes.
      x.incompleteAfterUnblock = true; await open(x, { height, date: N + '-03' }); const p = x.page;
      await dayButton(p, N + '-03').focus(); await p.keyboard.press('Enter');
      await tabTo(p, f => /Remove block/.test(f.text), 20); await p.keyboard.press('Enter');
      await p.waitForFunction(() => /Block removed/.test(document.getElementById('availabilityMessage').textContent)); await settled(x);
      await p.waitForFunction(() => !!document.getElementById('calendarRetry'));
      const s = await statusText(p); report.measurements['incomplete-after-remove'] = s;
      assert.ok(x.state.requests.some(r => r.markedIncomplete), 'a schedule read was marked incomplete');
      assert.match(s, /Some saved visits could not be loaded\. This view may be incomplete\./, 'incomplete warning outranks the notice: ' + s);
      assert.doesNotMatch(s, /Block removed/);
    });

    if (width === 1440) await check('1440px the "Block removed" notice clears on Today and on Go to a date', async () => {
      const x = await seed(width); await setBlock(x, N + '-03', ''); await setBlock(x, N + '-04', ''); await open(x, { height, date: N + '-03' }); const p = x.page;
      const removeOn = async day => { await dayButton(p, day).click(); await p.locator('#calendarSelectedDay [data-calendar-remove-block]').click(); await p.waitForFunction(day => /^Block removed: /.test(document.getElementById('calendarStatus')?.textContent || '') && !/1 block/.test(document.querySelector('#calendarGrid button.calendar-day-button[data-calendar-day="' + day + '"]')?.getAttribute('aria-label') || ''), day); await settled(x); };
      await removeOn(N + '-03');
      await p.locator('#calendarToday').click(); await settled(x);
      await p.waitForFunction(title => document.getElementById('calendarRangeTitle')?.textContent === title, monthTitle(chicagoToday().slice(0, 7)));
      const afterToday = await statusText(p); report.measurements['notice-after-today'] = afterToday;
      assert.doesNotMatch(afterToday, /Block removed/, 'after Today: ' + afterToday);
      await p.locator('#calendarJumpDate').fill(N + '-04'); await p.locator('#calendarJumpSubmit').click(); await settled(x);
      await removeOn(N + '-04');
      await p.locator('#calendarJumpDate').fill(M + '-05'); await p.locator('#calendarJumpSubmit').click(); await settled(x);
      await p.waitForFunction(title => document.getElementById('calendarRangeTitle')?.textContent === title, monthTitle(M));
      const afterJump = await statusText(p); report.measurements['notice-after-jump'] = afterJump;
      assert.doesNotMatch(afterJump, /Block removed/, 'after Go to a date: ' + afterJump);
      assert.match(afterJump, /Saved visits and blocked time\. Houston time\./);
    });

    await check(width + 'px Google Calendar status on Schedule is truthful: not connected says so, and nothing claims sync', async () => {
      const x = await seed(width); await open(x, { height });
      const text = await x.page.locator('#p-availability').innerText();
      assert.equal(x.state.serverCalendar?.calendar?.connected, false, 'server evidence: not connected'); report.measurements[width + '-server-calendar'] = x.state.serverCalendar;
      assert.doesNotMatch(text, /Google Calendar (is )?connected|permission saved|synced|sync enabled/i, 'claims a connection without evidence');
      const status = await x.page.locator('#calendarCalendarConnection').innerText().catch(() => '');
      report.measurements[width + '-google-status-not-connected'] = status;
      assert.match(status, /Google Calendar is not connected/, 'Schedule names the Google Calendar state: ' + JSON.stringify(status));
      assert.match(status, /saved visits and blocked time/i, 'and what this calendar shows');
      await x.page.locator('#calendarRangeTitle').scrollIntoViewIfNeeded(); await x.page.evaluate(() => document.getElementById('calendarRangeTitle').scrollIntoView({ block: 'start' })); await shot(x.page, 'google-not-connected-' + width);
      await x.page.locator('#calendarCalendarSetup').click();
      await x.page.waitForFunction(() => document.body.dataset.activePage === 'setup');
      await noHorizontalScroll(x.page);
    });
  }

  await check('1440px Google Calendar permission saved on the server is shown only with that evidence, and sync stays waiting', async () => {
    const x = await seed(1440, { calendar: 'connected' }); await open(x);
    const server = x.state.serverCalendar; report.measurements['1440-server-calendar-connected'] = server;
    assert.equal(server?.calendar?.connected, true, 'server evidence: permission saved'); assert.notEqual(server?.deliveryEnabled, true, 'delivery is not enabled offline');
    const status = await x.page.locator('#calendarCalendarConnection').innerText();
    report.measurements['1440-google-status-connected'] = status;
    assert.match(status, /Google Calendar permission saved · sync waiting/, status);
    assert.match(status, /not Google events/i, status);
    assert.doesNotMatch(status, /synced|sync enabled|not connected/i);
    await x.page.locator('#calendarCalendarConnection').scrollIntoViewIfNeeded(); await shot(x.page, 'google-connected-1440');
  });
  await check('1440px Google Calendar needing reconnection is not shown as connected', async () => {
    const x = await seed(1440, { calendar: 'reconnect_required' }); await open(x);
    assert.equal(x.state.serverCalendar?.calendar?.status, 'reconnect_required'); assert.equal(x.state.serverCalendar?.calendar?.connected, false);
    const status = await x.page.locator('#calendarCalendarConnection').innerText(); report.measurements['1440-google-status-reconnect'] = status;
    assert.doesNotMatch(status, /permission saved|sync/i, status); assert.match(status, /needs attention\. Reconnect/, status);
  });

  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, total: report.checks.length, physicalNetwork: report.physicalNetwork, pageErrors: report.pageErrors.length };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, ...report.summary, browser: report.browser, served: report.served, sourceStable: report.sourceStable, failures: report.checks.filter(c => !c.pass).map(c => ({ name: c.name, error: c.error.split('\n')[0].slice(0, 300) })) }, null, 1));
  if (report.summary.failed || !report.sourceStable) process.exitCode = 1;
}

async function setBlock(x, date, window) { const { setAvailabilityBlock } = await import('../../../netlify/functions/lib/store.mjs'); await setAvailabilityBlock(x.c, date, window, true); }
