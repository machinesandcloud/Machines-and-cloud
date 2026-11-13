// PRA-A11Y-01..07 browser check. Actual desk assets and owner handlers in-process, memory store, fake model,
// every non-loopback request aborted, Node sockets denied. Usage (from a copy's root):
//   node a11y-r3-fix-check.mjs --root <copy> --playwright <index.mjs> --out <dir> [--only A0x] [--widths 1440,390]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const opt = n => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null;
const root = resolve(opt('--root') || '.'), out = opt('--out'), only = opt('--only'), widths = (opt('--widths') || '1440,390').split(',').map(Number);
const origin = 'http://127.0.0.1:8977';
if (out) mkdirSync(out, { recursive: true });
const sha = v => createHash('sha256').update(v).digest('hex');
const SRC = ['desk.html','desk.js','desk-visits.js','desk-customers.js','desk-requests.js','desk.css','product-ui.css','design-system.css','desk-calendar.css','onboard.css','onboard.html'];
const report = { at: new Date().toISOString(), root, mode: 'offline: memory store, fake model, in-process handlers, browser non-loopback aborted, Node sockets denied', sources: Object.fromEntries(SRC.map(f => [f, sha(readFileSync(resolve(root, f)))])), checks: [], pageErrors: [], forbidden: [], physicalNetwork: 0, screenshots: [] };
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|NETLIFY_)/.test(k)) delete process.env[k];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('physical transport forbidden'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const u = new URL(String(input)); if (u.origin === origin && u.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };
const playwright = await import(pathToFileURL(resolve(opt('--playwright'))).href);
const imp = p => import(pathToFileURL(resolve(root, p)).href);
const store = await imp('netlify/functions/lib/store.mjs');
const { accessHash } = await imp('netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await imp('netlify/functions/lib/config.mjs');
const { workspaceTenant } = await imp('netlify/functions/lib/workspace-identity.mjs');
const handlers = { '/api/client': (await imp('netlify/functions/client.mjs')).default, '/api/access': (await imp('netlify/functions/access.mjs')).default, '/api/workspace-billing': (await imp('netlify/functions/workspace-billing.mjs')).default };
if (existsSync(resolve(root, 'netlify/functions/channel-availability.mjs'))) handlers['/api/channel-availability'] = (await imp('netlify/functions/channel-availability.mjs')).default;
const date = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + d * 86400000));
const browser = await playwright.chromium.launch({ headless: true, ...(opt('--executable') ? { executablePath: opt('--executable') } : { channel: 'chrome' }), args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
let serial = 0;
async function serve(context) {
  await context.routeWebSocket('**/*', s => s.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push(url.origin + url.pathname); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON();
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(body?.action)) { report.forbidden.push(url.pathname + ' ' + body?.action); return route.fulfill({ status: 403, body: '{}' }); }
      const r = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.77' });
      return route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
}
async function desk(width, { hash = 'today', records = true } = {}) {
  const slug = 'a11y-fix-' + ++serial, token = sha(slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture.example.test/' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const x = { c, slug };
  if (records) {
    const tenantIdentity = workspaceTenant(c);
    x.lead = await store.addRecord('leads', slug, { tenantIdentity, customer_name: 'Alex Customer', phone: '+17135550142', address: '12 Oak St, Katy, TX', issue: 'AC not cooling', wanted: 'Morning', reason: 'wants_visit', outcome: 'wants_visit', status: 'open', channel: 'web', urgency: 'today' });
    x.lead2 = await store.addRecord('leads', slug, { tenantIdentity, customer_name: 'Blair Customer', phone: '+17135550143', issue: 'Callback', reason: 'wants_call', outcome: 'wants_call', status: 'open', channel: 'sms' });
    x.booking = await store.addRecord('bookings', slug, { tenantIdentity, customer_name: 'Casey Customer', phone: '+17135550197', address: '1500 Main St, Katy, TX 77450', issue: 'Furnace check', date: date(2), window: '8 to 12', status: 'confirmed', channel: 'owner', slug, delivery: { tenantIdentity } });
  }
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); context.setDefaultTimeout(8000); x.context = context;
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  await serve(context);
  const page = x.page = await context.newPage(); page.on('pageerror', e => report.pageErrors.push(e.message));
  await page.goto(origin + '/desk.html?c=' + slug + '#' + hash); try { await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); } catch (e) { const st = await page.evaluate(() => ({ ws: document.body.dataset.workspaceState, text: document.body.innerText.slice(0, 400) })); await context.close(); throw new Error('desk not ready ' + JSON.stringify(st)); }
  return x;
}
const active = page => page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return { tag: 'body' }; return { tag: a.tagName.toLowerCase(), id: a.id, data: { ...a.dataset }, text: (a.textContent || '').trim().slice(0, 60), inDialog: !!a.closest('dialog[open]') }; });
async function shot(page, name) { if (!out) return; const p = resolve(out, name + '.png'); await page.screenshot({ path: p }); report.screenshots.push(p); }
async function check(name, run) { if (only && !name.startsWith(only)) return; const t = Date.now(); let x; try { x = await run(v => (x = v)); report.checks.push({ name, pass: true, ms: Date.now() - t, ...(typeof x === 'object' && x && x.detail ? { detail: x.detail } : {}) }); console.log('PASS ' + name); } catch (e) { report.checks.push({ name, pass: false, error: String(e.stack || e).slice(0, 1500) }); console.log('FAIL ' + name + ': ' + String(e.message).slice(0, 300)); } }
async function withDesk(width, opts, fn) { const x = await desk(width, opts); try { return await fn(x); } catch (e) { e.message += ' | state=' + JSON.stringify(await x.page.evaluate(() => ({ ws: document.body.dataset.workspaceState, route: document.body.dataset.activePage, active: document.activeElement?.id || document.activeElement?.tagName, msg: document.getElementById('visitMessage')?.textContent, status: document.getElementById('visitAvailabilityStatus')?.textContent, save: document.getElementById('saveMsg')?.textContent })).catch(() => null)); throw e; } finally { await x.context.close(); } }
const route = (page, r) => page.evaluate(r => { const b = document.querySelector('[data-workspace-route="' + r + '"]') || document.querySelector('.tabs [data-t="' + r + '"]'); b.click(); }, r);
async function savedVisitWait(page) { await page.waitForFunction(() => !document.getElementById('closeVisit').disabled && /saved|updated|changed|scheduled|added/i.test(document.getElementById('visitMessage').textContent)); }
// ---------- color helpers (WCAG relative luminance) ----------
const contrastFn = () => {
  window.__rgb = s => { const m = String(s).match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  window.__lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  window.__ratio = (a, b) => { const l1 = __lum(a), l2 = __lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  window.__bg = el => { const layers = []; for (let n = el; n; n = n.parentElement) { const c = __rgb(getComputedStyle(n).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a >= 1) break; } } let base = { r: 255, g: 255, b: 255 }; for (const c of layers.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }; return base; };
};
const ringOf = async (page, sel) => { await page.evaluate(contrastFn); return page.evaluate(sel => { const el = typeof sel === 'string' ? document.querySelector(sel) : document.activeElement; const s = getComputedStyle(el); const c = __rgb(s.outlineColor); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor, vsWhite: +__ratio(c, { r: 255, g: 255, b: 255 }).toFixed(2), vsPage: +__ratio(c, { r: 244, g: 246, b: 249 }).toFixed(2), vsBg: +__ratio(c, __bg(el.parentElement || el)).toFixed(2), focusVisible: el.matches(':focus-visible') }; }, sel); };

try {
for (const w of widths) {
  // PRA-A11Y-01 (request flow) + 03 (find times focus) -----------------------------------------
  for (const how of ['Escape', 'Close']) await check(`A01-request-${how}-${w}: saved visit from a request returns focus to that request's View request`, () => withDesk(w, { hash: 'leads' }, async x => {
    const p = x.page; await p.locator(`#leads [data-request-open="${x.lead.id}"]`).first().click();
    await p.locator('#requestSchedule').waitFor({ state: 'visible' }); await p.locator('#requestSchedule').click();
    await p.locator('#visitDialog').waitFor({ state: 'visible' }); await p.locator('#visitFindTimes').waitFor({ state: 'visible' });
    await p.locator('#visitFindTimes').focus(); await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelectorAll('#visitAvailableTimes button').length > 0);
    await p.waitForFunction(() => !document.getElementById('visitFindTimes').disabled);
    const findFocus = await active(p); assert.equal(findFocus.id, 'visitFindTimes', 'A03: focus after Find available times: ' + JSON.stringify(findFocus));
    await p.keyboard.press('Tab'); const next = await active(p); assert.ok(next.inDialog && /visit-available-time|^$/.test(next.id) && (await p.evaluate(() => document.activeElement.classList.contains('visit-available-time'))), 'A03: next Tab reaches first listed time: ' + JSON.stringify(next));
    await p.keyboard.press('Enter');
    await p.locator('#visitChangeForm [type=submit]').first().click(); await savedVisitWait(p);
    if (how === 'Escape') await p.keyboard.press('Escape'); else { await p.locator('#closeVisit').focus(); await p.keyboard.press('Enter'); }
    await p.waitForFunction(() => !document.getElementById('visitDialog').open); await p.waitForTimeout(150);
    const f = await active(p); if (w === 1440) await shot(p, `A01-request-${how}-${w}`);
    assert.equal(f.data.requestOpen, x.lead.id, 'focus after ' + how + ': ' + JSON.stringify(f));
    const ring = await ringOf(p); assert.ok(ring.focusVisible && ring.style !== 'none', 'visible ring ' + JSON.stringify(ring));
    return { detail: { findFocus, next, after: f, ring } };
  }));
  // PRA-A11Y-01 + 04 (Customers flow) -----------------------------------------------------------
  for (const how of ['Escape', 'Close']) await check(`A04-customer-${how}-${w}: saved edit from Customers returns focus to the same View visit`, () => withDesk(w, { hash: 'leads' }, async x => {
    const p = x.page; await route(p, 'customers');
    const btn = p.locator(`[data-customer-visit="${x.booking.id}"]`); await btn.first().waitFor({ state: 'attached' });
    await btn.first().evaluate(b => { for (let d = b.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; });
    await btn.first().focus(); await p.keyboard.press('Enter');
    await p.locator('#visitDialog').waitFor({ state: 'visible' }); await p.locator('#editVisitDetails').click();
    await p.locator('#visitEditIssue').fill('Furnace check and filter ' + how);
    await p.locator('#visitEditForm [type=submit]').first().click(); await savedVisitWait(p);
    const before = await p.evaluate(id => document.querySelector('[data-customer-visit="' + id + '"]')?.isConnected, x.booking.id);
    if (how === 'Escape') await p.keyboard.press('Escape'); else { await p.locator('#closeVisit').focus(); await p.keyboard.press('Enter'); }
    await p.waitForFunction(() => !document.getElementById('visitDialog').open); await p.waitForTimeout(150);
    const f = await active(p); if (w === 1440) await shot(p, `A04-customer-${how}-${w}`);
    assert.equal(f.data.customerVisit, x.booking.id, 'focus after ' + how + ': ' + JSON.stringify(f));
    return { detail: { after: f, buttonPresentAfterSave: before } };
  }));
  // Unsaved Escape still returns to opener (regression)
  await check(`A01-unsaved-Escape-${w}: Escape without a save still returns to View visit`, () => withDesk(w, { hash: 'leads' }, async x => {
    const p = x.page; await route(p, 'customers'); const btn = p.locator(`[data-customer-visit="${x.booking.id}"]`).first(); await btn.waitFor({ state: 'attached' });
    await btn.evaluate(b => { for (let d = b.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; });
    await btn.focus(); await p.keyboard.press('Enter'); await p.locator('#visitDialog').waitFor({ state: 'visible' });
    await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.getElementById('visitDialog').open); await p.waitForTimeout(100);
    const f = await active(p); assert.equal(f.data.customerVisit, x.booking.id, JSON.stringify(f));
  }));
  // PRA-A11Y-03 (Add visit from Schedule) -------------------------------------------------------
  await check(`A03-addvisit-${w}: Find available times keeps focus in the Add visit dialog`, () => withDesk(w, { hash: 'availability' }, async x => {
    const p = x.page; await p.evaluate(() => document.getElementById('newVisit').click()); await p.locator('#visitDialog').waitFor({ state: 'visible' });
    for (const [id, v] of [['visitName', 'Dana'], ['visitPhone', '(713) 555-0150'], ['visitAddress', '9 Elm St'], ['visitIssue', 'Leak']]) await p.locator('#' + id).fill(v);
    await p.locator('#visitFindTimes').focus(); await p.keyboard.press('Enter');
    await p.waitForFunction(() => !document.getElementById('visitFindTimes').disabled && !/Checking/.test(document.getElementById('visitAvailabilityStatus').textContent));
    const f = await active(p); if (w === 390) await shot(p, `A03-addvisit-${w}`);
    assert.ok(f.inDialog && f.id === 'visitFindTimes', JSON.stringify(f));
    await p.keyboard.press('Tab'); const n = await p.evaluate(() => document.activeElement.className);
    assert.match(n, /visit-available-time/);
    return { detail: { after: f, nextTab: n } };
  }));
  // PRA-A11Y-02 + 06 (hours grid) ----------------------------------------------------------------
  await check(`A02-hours-one-day-${w}: one wrong day marks only that day and names it`, () => withDesk(w, { hash: 'know', records: false }, async x => {
    const p = x.page; await p.evaluate(() => { for (let d = document.getElementById('hoursRows').closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; document.getElementById('hoursRows').scrollIntoView(); });
    await p.locator('#hoursRows [data-d=mon][data-k=close]').fill('');
    await p.locator('#cfg [type=submit]').first().click();
    await p.waitForFunction(() => document.querySelector('#hoursRows [aria-invalid=true]'));
    const r = await p.evaluate(() => ({ invalid: [...document.querySelectorAll('#hoursRows input[aria-invalid=true]')].map(i => i.dataset.d + '.' + i.dataset.k), error: document.getElementById('cfgHoursError').textContent, focus: document.activeElement.dataset.d + '.' + document.activeElement.dataset.k, border: getComputedStyle(document.querySelector('#hoursRows [data-d=sat][data-k=open]')).borderColor, monBorder: getComputedStyle(document.querySelector('#hoursRows [data-d=mon][data-k=close]')).borderColor }));
    if (w === 390) await shot(p, `A02-hours-one-day-${w}`);
    assert.deepEqual(r.invalid.sort(), ['mon.close', 'mon.open']); assert.match(r.error, /^Monday: /); assert.doesNotMatch(r.error, /Tuesday|Saturday/); assert.equal(r.focus, 'mon.close'); assert.notEqual(r.border, r.monBorder);
    return { detail: r };
  }));
  await check(`A02-hours-two-days-${w}: two wrong days mark both and name both`, () => withDesk(w, { hash: 'know', records: false }, async x => {
    const p = x.page; await p.evaluate(() => { for (let d = document.getElementById('hoursRows').closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; document.getElementById('hoursRows').scrollIntoView(); });
    await p.locator('#hoursRows [data-d=tue][data-k=open]').fill(''); await p.locator('#hoursRows [data-d=thu][data-k=close]').fill('07:00');
    await p.locator('#cfg [type=submit]').first().click(); await p.waitForFunction(() => document.querySelector('#hoursRows [aria-invalid=true]'));
    const r = await p.evaluate(() => ({ invalid: [...document.querySelectorAll('#hoursRows input[aria-invalid=true]')].map(i => i.dataset.d + '.' + i.dataset.k).sort(), error: document.getElementById('cfgHoursError').textContent, focus: document.activeElement.dataset.d + '.' + document.activeElement.dataset.k }));
    assert.deepEqual(r.invalid, ['thu.close', 'thu.open', 'tue.close', 'tue.open']); assert.match(r.error, /Tuesday: add an opening time/); assert.match(r.error, /Thursday: add a closing time later than the opening time/); assert.equal(r.focus, 'tue.open');
    // Editing clears the marks
    await p.locator('#hoursRows [data-d=tue][data-k=open]').fill('08:00'); const left = await p.evaluate(() => document.querySelectorAll('#hoursRows [aria-invalid=true]').length); assert.equal(left, 0);
    return { detail: r };
  }));
  // QA F1: a whole-grid server error marks every row; a per-day server error marks only that day.
  for (const [tag, fe] of [['generic', { 'rules.hours': 'Add your business hours.' }], ['day', { 'rules.hours.sat.close': 'Saturday closing time is not valid.' }]]) await check(`A02-hours-server-${tag}-${w}: server ${tag} hours error marks the right rows`, () => withDesk(w, { hash: 'know', records: false }, async x => {
    const p = x.page; await p.evaluate(() => { for (let d = document.getElementById('hoursRows').closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; });
    await p.locator('#hoursRows [data-d=sat][data-k=open]').fill('09:00'); await p.locator('#hoursRows [data-d=sat][data-k=close]').fill('12:00');
    let seen = 0; await x.context.route('**/api/client**', async r => { if (r.request().method() !== 'GET') { seen++; return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Check the hours.', fieldErrors: fe }) }); } return r.fallback(); });
    await p.locator('#cfg [type=submit]').first().click(); await p.waitForFunction(() => document.querySelector('#hoursRows [aria-invalid=true]'));
    const r = await p.evaluate(() => ({ invalid: [...document.querySelectorAll('#hoursRows input[aria-invalid=true]')].map(i => i.dataset.d + '.' + i.dataset.k).sort(), err: document.getElementById('cfgHoursError').textContent, focus: document.activeElement.dataset.d + '.' + document.activeElement.dataset.k }));
    assert.equal(seen, 1);
    if (tag === 'generic') { assert.equal(r.invalid.length, 14, JSON.stringify(r)); assert.equal(r.err, 'Add your business hours.'); }
    else { assert.deepEqual(r.invalid, ['sat.close', 'sat.open']); assert.equal(r.focus, 'sat.close'); }
    return { detail: r };
  }));
  await check(`A06-hours-names-${w}: grids are labelled groups with full day names and the linked hint`, () => withDesk(w, { hash: 'know', records: false }, async x => {
    const p = x.page; await p.evaluate(() => { for (let d = document.getElementById('hoursRows').closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; document.getElementById('hoursRows').scrollIntoView(); });
    await p.locator('#cfgAppointmentHoursMode').selectOption('custom');
    const biz = p.getByRole('group', { name: 'Business hours', exact: true }); assert.equal(await biz.count(), 1);
    const appt = p.getByRole('group', { name: 'Appointment hours', exact: true }); assert.equal(await appt.count(), 1);
    assert.equal(await biz.getByRole('textbox', { name: 'Monday opening time' }).or(biz.locator('input[aria-label="Monday opening time"]')).count() >= 1, true);
    const r = await p.evaluate(() => { const rows = id => [...document.querySelectorAll('#' + id + ' input')].map(i => ({ label: i.getAttribute('aria-label'), describedby: (i.getAttribute('aria-describedby') || '').split(/\s+/) })); return { biz: rows('hoursRows'), appt: rows('cfgAppointmentHoursRows'), note: document.getElementById('hoursNote').textContent }; });
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const set of [r.biz, r.appt]) { assert.equal(set.length, 14); set.forEach((f, i) => { assert.ok(f.label.startsWith(days[i >> 1] + ' '), f.label); assert.ok(f.describedby.includes('hoursNote'), JSON.stringify(f)); }); }
    assert.ok(r.biz.every(f => f.describedby.includes('cfgHoursError')), 'error id still linked');
    assert.match(r.note, /blank for a closed day/);
    return { detail: { first: r.biz[0], firstAppt: r.appt[0], note: r.note } };
  }));
  // PRA-A11Y-07 ------------------------------------------------------------------------------------
  await check(`A07-filter-${w}: filter switch is announced once and the choice persists across routes and reload`, () => withDesk(w, { hash: 'leads' }, async x => {
    const p = x.page; const status = p.locator('#requestFilterStatus');
    assert.equal(await status.getAttribute('role'), 'status'); assert.equal((await status.textContent()).trim(), '');
    await p.locator('[data-request-filter=done]').click(); await p.waitForFunction(() => document.getElementById('requestFilterStatus').textContent);
    const t1 = (await status.textContent()).trim(); assert.equal(t1, '0 done requests shown');
    assert.equal(await p.locator('[data-request-filter=done]').getAttribute('aria-pressed'), 'true');
    await p.locator('[data-request-filter=open]').click(); await p.waitForFunction(() => /open/.test(document.getElementById('requestFilterStatus').textContent));
    const t2 = (await status.textContent()).trim(); assert.equal(t2, '2 open requests shown');
    await p.locator('[data-request-filter=done]').click();
    await route(p, 'customers'); await p.waitForTimeout(100); await route(p, 'availability'); await p.waitForTimeout(150);
    await p.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await p.waitForTimeout(400);
    await route(p, 'leads'); await p.waitForTimeout(150);
    const afterRoutes = await p.locator('[data-request-filter=done]').getAttribute('aria-pressed');
    await p.reload(); await p.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await route(p, 'leads'); await p.waitForTimeout(150);
    const afterReload = await p.locator('[data-request-filter=done]').getAttribute('aria-pressed');
    if (w === 390) await shot(p, `A07-filter-${w}`);
    assert.equal(afterRoutes, 'true'); assert.equal(afterReload, 'true');
    assert.equal((await status.textContent()).trim(), '', 'no announcement on load');
    return { detail: { t1, t2, afterRoutes, afterReload } };
  }));
  // QA F2: the automatic switch to Done after scheduling is not remembered; the memory is per workspace.
  await check(`A07-autoswitch-${w}: scheduling from a request does not persist Done; key is scoped to the workspace`, () => withDesk(w, { hash: 'leads' }, async x => {
    const p = x.page; await p.locator(`#leads [data-request-open="${x.lead.id}"]`).first().click();
    await p.locator('#requestSchedule').click(); await p.locator('#visitDialog').waitFor({ state: 'visible' });
    await p.locator('#visitFindTimes').click(); await p.waitForFunction(() => document.querySelectorAll('#visitAvailableTimes button').length > 0 && !document.getElementById('visitFindTimes').disabled);
    await p.locator('#visitAvailableTimes button').first().click(); await p.locator('#visitChangeForm [type=submit]').first().click(); await savedVisitWait(p);
    await p.locator('#closeVisit').click(); await p.waitForFunction(() => !document.getElementById('visitDialog').open); await p.waitForTimeout(150);
    const autoDone = await p.locator('[data-request-filter=done]').getAttribute('aria-pressed');
    const keys = await p.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('mc-desk-request-filter')));
    await p.reload(); await p.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await route(p, 'leads'); await p.waitForTimeout(150);
    const afterReload = await p.locator('[data-request-filter=open]').getAttribute('aria-pressed');
    await p.locator('[data-request-filter=done]').click(); await p.waitForTimeout(100);
    const keysAfterClick = await p.evaluate(() => Object.fromEntries(Object.keys(sessionStorage).filter(k => k.startsWith('mc-desk-request-filter')).map(k => [k, sessionStorage.getItem(k)])));
    assert.equal(autoDone, 'true', 'request moved to Done'); assert.deepEqual(keys, [], 'automatic switch not stored'); assert.equal(afterReload, 'true', 'Open after reload');
    assert.deepEqual(keysAfterClick, { ['mc-desk-request-filter-v1:' + x.slug]: 'done' });
    return { detail: { autoDone, keys, afterReload, keysAfterClick } };
  }));
  // PRA-A11Y-05 ------------------------------------------------------------------------------------
  await check(`A05-contrast-${w}: Customers phone links, Connections website link >=4.5:1; focus ring >=3:1 on white and page`, () => withDesk(w, { hash: 'leads' }, async x => {
    const p = x.page; await p.evaluate(contrastFn); await route(p, 'customers'); await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelectorAll('#customerList details').forEach(d => d.open = true));
    const phones = await p.evaluate(() => [...document.querySelectorAll('#customerList a[href^="tel:"]')].map(a => ({ text: a.textContent, color: getComputedStyle(a).color, ratio: +__ratio(__rgb(getComputedStyle(a).color), __bg(a)).toFixed(2) })));
    assert.ok(phones.length >= 2, 'phone links found'); phones.forEach(l => assert.ok(l.ratio >= 4.5, JSON.stringify(l)));
    const vb = p.locator(`[data-customer-visit="${x.booking.id}"]`).first(); await vb.focus(); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab');
    const ring = await ringOf(p); assert.ok(ring.focusVisible && ring.width >= 2 && ring.vsWhite >= 3 && ring.vsPage >= 3 && ring.vsBg >= 3, 'View visit ring ' + JSON.stringify(ring));
    await vb.click(); await p.locator('#visitDialog').waitFor({ state: 'visible' }); await p.keyboard.press('Tab');
    const dRing = await ringOf(p); assert.ok(dRing.vsWhite >= 3, 'dialog ring ' + JSON.stringify(dRing)); await p.keyboard.press('Escape');
    await route(p, 'setup'); await p.waitForTimeout(300);
    const site = await p.evaluate(() => [...document.querySelectorAll('#p-setup a, .pane.on a')].filter(a => /fixture\.example\.test/.test(a.textContent) && a.getClientRects().length).map(a => ({ text: a.textContent.trim(), cls: a.className, color: getComputedStyle(a).color, ratio: +__ratio(__rgb(getComputedStyle(a).color), __bg(a)).toFixed(2) })));
    assert.ok(site.length >= 1, 'website link found'); site.forEach(l => assert.ok(l.ratio >= 4.5, 'website link ' + JSON.stringify(l)));
    const all = await p.evaluate(() => [...document.querySelectorAll('.pane.on a')].filter(a => a.getClientRects().length && a.textContent.trim() && !a.closest('.btn-pill,[class*=btn]') && !/btn/.test(a.className)).map(a => ({ text: a.textContent.trim().slice(0, 40), ratio: +__ratio(__rgb(getComputedStyle(a).color), __bg(a)).toFixed(2) })).filter(l => l.ratio < 4.5));
    assert.deepEqual(all, [], 'visible text links under 4.5:1 on Connections');
    if (w === 390) { await route(p, 'customers'); await p.waitForTimeout(100); await shot(p, `A05-customers-${w}`); }
    return { detail: { phones, ring, dRing, site } };
  }));
  await check(`A05-onboard-ring-${w}: sign-in "Keep me signed in" ring >=3:1`, async () => {
    const context = await browser.newContext({ viewport: { width: w, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); context.setDefaultTimeout(8000);
    try { await serve(context); const p = await context.newPage(); p.on('pageerror', e => report.pageErrors.push(e.message)); await p.goto(origin + '/onboard.html?signin=1'); await p.evaluate(contrastFn);
      const keep = p.locator('#access-keep'); await keep.waitFor({ state: 'attached' });
      const vis = await keep.evaluate(k => !!k.getClientRects().length); let ring = null;
      if (vis) { await keep.focus(); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab'); ring = await ringOf(p, '#access-keep'); if (w === 390) await shot(p, `A05-signin-${w}`); }
      else { ring = await p.evaluate(() => { const el = document.getElementById('access-keep'); el.closest('[hidden]')?.removeAttribute('hidden'); return null; }); }
      // Shared rule is measured directly as well, independent of visibility.
      const rule = await p.evaluate(() => { const b = document.createElement('button'); b.textContent = 'probe'; document.querySelector('main,body').appendChild(b); b.focus({ focusVisible: true }); const s = getComputedStyle(b); return { color: s.outlineColor, vsWhite: +__ratio(__rgb(s.outlineColor), { r: 255, g: 255, b: 255 }).toFixed(2), vsPage: +__ratio(__rgb(s.outlineColor), { r: 244, g: 246, b: 249 }).toFixed(2) }; });
      if (ring) assert.ok(ring.vsWhite >= 3 && ring.vsPage >= 3, JSON.stringify(ring));
      return { detail: { keepVisible: vis, ring, rule } };
    } finally { await context.close(); }
  });
}
} finally { await browser.close(); }
report.pass = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.ok = report.pass === report.total && report.total > 0 && report.physicalNetwork === 0 && !report.pageErrors.length;
if (out) writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(`RESULT ${report.pass}/${report.total} physicalNetwork=${report.physicalNetwork} pageErrors=${report.pageErrors.length} forbidden=${report.forbidden.length}`);
if (report.pageErrors.length) console.log(report.pageErrors.slice(0, 5));
process.exit(report.ok ? 0 : 1);
