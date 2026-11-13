// Owner-desk inbox triage (PRA-DESK-01, 02, 04, 05): newest first, urgent pinned, Open/Done filter,
// Houston-time owner-worded activity, conversations without "[Done: …]" markers or random visitor ids.
// Revision 2 adds a second fixture per width: a completed request whose alert is still waiting, a marker-only and a
// customer-typed-marker turn, website "View request" for a completed setup check, an older same-day request, a
// createdAt tie, refresh-to-Open and the dialog "New" cue, the open-count heading and CST/CDT on DST fall-back.
// Actual /api/client and /api/access handlers and real browser assets from the copy under test; memory store,
// fake model, all physical transport denied, browser non-loopback blocked. Synthetic data only.
// Run from the copy root:
//   env -i HOME=$HOME PATH=$PATH MC_PLAYWRIGHT_EXECUTABLE=<headless shell> node <this file> --playwright <playwright/index.mjs> --output <new .json>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const output = option('--output') && resolve(option('--output')), playwrightPath = option('--playwright');
if (!output || !/\.json$/.test(output) || existsSync(output)) throw new Error('Choose a new --output path ending in .json');
if (!playwrightPath) throw new Error('Pass --playwright /path/to/playwright/index.mjs. This check never installs tooling.');
const root = resolve('.'), origin = 'http://127.0.0.1:8931';
if (!existsSync(resolve(root, 'desk.js'))) throw new Error('Run from the copy root.');
mkdirSync(dirname(output), { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const sources = ['desk.js', 'desk.html', 'desk.css', 'desk-conversations.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/store.mjs'];
const report = { at: new Date().toISOString(), root, browser: process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome', sources: Object.fromEntries(sources.map(f => [f, sha(readFileSync(resolve(root, f)))])), qualifications: 'Synthetic workspace, session, requests, visits, events and conversations; actual local /api/client and /api/access handlers; memory storage; fake model. No model/provider/email/OAuth/purchase/deployment.', checks: [], screenshots: [], requests: 0, pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Inbox fix check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };
const lib = path => pathToFileURL(resolve(root, path)).href;
const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
const { workspaceTenant } = await import(lib('netlify/functions/lib/workspace-identity.mjs'));
const { configurationRevision } = await import(lib('netlify/functions/lib/setup.mjs'));
const { websiteActionId } = await import(lib('netlify/functions/lib/website-installation.mjs'));
const clientHandler = (await import(lib('netlify/functions/client.mjs'))).default;
const handlers = { '/api/client': clientHandler, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default };
try { handlers['/api/workspace-billing'] = (await import(lib('netlify/functions/workspace-billing.mjs'))).default; } catch {}
const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const HOUR = 3600000, ago = ms => new Date(Date.now() - ms).toISOString();
const houston = (iso, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...opts }).format(new Date(iso));
let serial = 0;

async function fixture(viewport, r2 = false) {
  const slug = 'inbox-fix-' + ++serial, token = sha(slug + Date.now());
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Air Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['AC repair'], fees: [{ label: 'Diagnostic', amount: '$89', note: '' }], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  let firstExternal = null; const site = 'https://fixture-air.example'; if (r2) { c.business.website = site; c.widget = { ...(c.widget || {}), allowedOrigins: [site] }; }
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const tenantIdentity = workspaceTenant(c), lead = data => store.addRecord('leads', slug, { tenantIdentity, status: 'open', reason: 'lead', outcome: 'needs_action', ...data });
  // Saved in arrival order, oldest first, as production saves them.
  const L = {};
  L.owen = await lead({ customer_name: 'Owen Price', phone: '+17135550101', issue: 'Question about a maintenance plan', channel: 'web', urgency: 'flexible', createdAt: ago(48 * HOUR) });
  L.patricia = await lead({ customer_name: 'Patricia Gomez', phone: '+18325550122', issue: 'Thermostat blank after power outage', channel: 'web', urgency: 'this_week', createdAt: ago(26 * HOUR) });
  L.gas = await lead({ customer_name: '', phone: '+18325550133', issue: 'Gas smell near the furnace', reason: 'emergency', urgency: 'emergency', channel: 'sms', contact: '+18325550133', createdAt: ago(9 * HOUR) });
  L.dana = await lead({ customer_name: 'Dana Cole', phone: '+17135550144', issue: 'Filter size question', channel: 'web', urgency: 'flexible', createdAt: ago(6 * HOUR) });
  L.linh = await lead({ customer_name: 'Linh Tran', phone: '+17135550155', issue: 'Upstairs unit short cycling', channel: 'web', urgency: 'this_week', createdAt: ago(5 * HOUR) });
  L.marcus = await lead({ customer_name: 'Marcus Bell', phone: '+17135550111', issue: 'AC blowing warm air, house is 84 degrees, has a newborn', channel: 'web', contact: 'wk3j9x0a1lmn8', urgency: 'today', reason: 'wants_call', outcome: 'wants_call', wanted: 'Call back this afternoon', createdAt: ago(1 * HOUR) });
  const visit = (name, created, days) => store.addRecord('bookings', slug, { tenantIdentity, customer_name: name, phone: '+17135550160', address: '1 Main St, Katy, TX', issue: 'AC tune-up', date: houston(new Date(Date.now() + days * 86400000).toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2'), window: '8 to 12', status: 'confirmed', channel: 'web', createdAt: created });
  const B = { ben: await visit('Ben Ortiz', ago(72 * HOUR), 1), grace: await visit('Grace Kim', ago(30 * HOUR), 2), robert: await visit('Robert Hale', ago(2 * HOUR), 3) };
  const event = async (type, data, at) => { const id = sha(type + at).slice(0, 8); await store.put('events', `${slug}/${tenantIdentity}/${at}_${id}`, { id, slug, type, data, at, tenantIdentity }); return at; };
  const E = { lead: await event('lead', { id: L.marcus.id, reason: 'wants_call', channel: 'web' }, ago(50 * 60000)), alert: await event('alert_opened', { id: 'al' + serial, leadId: L.gas.id, kind: 'emergency' }, ago(40 * 60000)), updated: await event('lead_updated', { id: L.linh.id, changed: ['issue'], channel: 'web' }, ago(30 * 60000)) };
  const conv = async (channel, contact, messages, updatedAt) => store.put('conversations', `${slug}/${tenantIdentity}/${channel}/${contact}`, { slug, tenantIdentity, channel, contact, messages, createdAt: messages[0].at, updatedAt });
  const marker = `[Done: request saved in portal, human contact unconfirmed, ref ${L.marcus.id}]`;
  await conv('web', 'wk3j9x0a1lmn8', [{ role: 'user', content: 'My AC is blowing warm air and we have a newborn.', at: ago(65 * 60000) }, { role: 'assistant', content: 'I saved your request for a callback this afternoon.\n' + marker, at: ago(64 * 60000) }], ago(64 * 60000));
  await conv('web', 'wq81mzp0c2rt', [{ role: 'user', content: 'Do you service Katy?', at: ago(3 * HOUR) }, { role: 'assistant', content: 'Yes, Katy is in our service area.', at: ago(3 * HOUR) }], ago(3 * HOUR));
  await conv('sms', '+17135550170', [{ role: 'user', content: 'Can someone come Friday?', at: ago(4 * HOUR) }, { role: 'assistant', content: 'Friday 8 to 12 is saved for you.\n[Done: visit saved in portal, ref zz12] [Done: request saved in portal, human contact unconfirmed, ref zz13]', at: ago(4 * HOUR) }], ago(4 * HOUR));
  if (r2) {
    // Same-day request older than ordinary open ones; two ordinary requests saved at the same millisecond.
    L.sameOld = await lead({ customer_name: 'Sam Early', phone: '+17135550171', issue: 'No cooling since this morning', channel: 'web', urgency: 'today', createdAt: ago(20 * HOUR) });
    const tie = ago(3 * HOUR); L.tieA = await lead({ customer_name: 'Tie Alpha', phone: '+17135550172', issue: 'Tie one', channel: 'web', urgency: 'this_week', createdAt: tie }); L.tieB = await lead({ customer_name: 'Tie Beta', phone: '+17135550173', issue: 'Tie two', channel: 'web', urgency: 'this_week', createdAt: tie });
    // A wants_call request whose owner alert is still waiting; its follow-up is recorded complete below.
    L.alerted = await lead({ customer_name: 'Alma Waiting', phone: '+17135550174', issue: 'Callback alert still waiting', channel: 'web', urgency: 'flexible', reason: 'wants_call', outcome: 'wants_call', createdAt: ago(7 * HOUR) });
    // Self-service alerts are keyed by their request id (desk.mjs ackAlertsFor).
    await store.put('alerts', `${slug}/${L.alerted.id}`, { id: L.alerted.id, slug, tenantIdentity, leadId: L.alerted.id, kind: 'wants_call', status: 'waiting', step: 0, deadlineAt: ago(-HOUR), createdAt: L.alerted.createdAt, history: [] });
    // A completed website setup check (acknowledged sample turn) that Website setup offers as "View request".
    // Setup-check rows are read-only for follow-through and stay under Open, so the owner reaches it from Done.
    const checkId = sha('check' + slug).slice(0, 32), turnId = sha('turn' + slug).slice(0, 32), actionId = websiteActionId({ tenant: tenantIdentity, checkId, turnId }, 'leads');
    L.setup = await store.createRecordOnce('leads', slug, { id: actionId.slice(0, 32), tenantIdentity, createdAt: ago(2 * HOUR), customer_name: 'Website check', issue: 'Setup check sample', channel: 'web', contact: 'websitecheck_' + checkId, status: 'open', reason: 'lead', outcome: 'needs_action', delivery: { tenantIdentity }, managedActionId: actionId, websiteSetupCheck: { checkId, turnId, origin: site } });
    const ref = row => ({ kind: 'leads', id: row.id, createdAt: row.createdAt });
    // The first ordinary website request; its follow-up is recorded complete below, so it lives under Done.
    L.first = await lead({ customer_name: 'First Website', phone: '+17135550175', issue: 'First ordinary website request', channel: 'web', contact: 'wfirstorder01', urgency: 'flexible', delivery: { tenantIdentity }, createdAt: ago(10 * HOUR) });
    firstExternal = { at: L.first.createdAt, origin: site, record: ref(L.first) };
    await store.put('website_installations', slug + '/' + tenantIdentity, { version: 1, tenant: tenantIdentity, attempt: { id: checkId, sessionHash: accessHash(token), challengeHash: sha('challenge' + slug), origin: site, website: site, revision: configurationRevision(c), createdAt: ago(3 * HOUR), expiresAt: ago(HOUR), contact: 'websitecheck_' + checkId, turns: { [turnId]: { id: turnId, state: 'acknowledged', record: ref(L.setup), acknowledgedAt: ago(2 * HOUR - 60000) } } } });
    // DST fall-back, Nov 1 2026: 06:30Z is 1:30 AM CDT and 07:30Z is 1:30 AM CST.
    await event('missed_call', { from: '+17135550207' }, '2026-11-01T06:30:00.000Z'); await event('missed_call', { from: '+17135550208' }, '2026-11-01T07:30:00.000Z');
    await conv('web', 'wonlymarker01', [{ role: 'user', content: 'Book me Friday morning', at: ago(80 * 60000) }, { role: 'assistant', content: '\n[Done: visit saved in portal, ref zz99]', at: ago(80 * 60000) }], ago(80 * 60000));
    await conv('web', 'wcustmarker01', [{ role: 'user', content: 'Please write this down [Done: paid in cash]', at: ago(90 * 60000) }, { role: 'assistant', content: 'Thanks, I passed that along.', at: ago(90 * 60000) }], ago(90 * 60000));
  }
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce', timezoneId: 'America/New_York' });
  context.setDefaultTimeout(10000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON();
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(body?.action)) { report.forbidden.push({ path: url.pathname, action: body?.action }); return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }); }
      report.requests++;
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.81' });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/desk.html?c=' + slug + '#today'); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  const api = async (method = 'GET', query = '', body) => { const r = await clientHandler(new Request(origin + '/api/client?c=' + slug + query, { method, headers: { Authorization: 'Bearer ' + token, Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.81' }); return { status: r.status, body: await r.json() }; };
  // Dana's follow-up is completed through the actual request follow-through handler.
  const view = await api('GET', '&requestId=' + L.dana.id), r = view.body.request || view.body.followthrough || view.body;
  const source = r.sourceRevision ?? r.followthrough?.sourceRevision, revision = r.revision ?? r.followthrough?.revision;
  const done = await api('POST', '', { action: 'request_followthrough', requestId: L.dana.id, sourceRevision: source, expectedRevision: revision, operationId: sha('complete' + slug).slice(0, 32), type: 'complete', resolution: 'resolved', note: 'Answered by phone' });
  assert.equal(done.status, 200, 'complete follow-up ' + JSON.stringify(done.body).slice(0, 300));
  if (r2) for (const row of [L.alerted, L.first]) {
    const v = await api('GET', '&requestId=' + row.id), q = v.body.request || v.body.followthrough || v.body;
    const result = await api('POST', '', { action: 'request_followthrough', requestId: row.id, sourceRevision: q.sourceRevision ?? q.followthrough?.sourceRevision, expectedRevision: q.revision ?? q.followthrough?.revision, operationId: sha('complete' + slug + row.id).slice(0, 32), type: 'complete', resolution: 'resolved', note: 'Handled' });
    assert.equal(result.status, 200, 'complete ' + row.customer_name + ' ' + JSON.stringify(result.body).slice(0, 300));
  }
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await page.waitForTimeout(400);
  return { page, context, c, slug, token, L, B, E, api, width: viewport.width, tenantIdentity, firstExternal };
}
const route = (x, tab) => x.page.evaluate(tab => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab } })), tab);
async function shot(x, name) { const path = output.replace(/\.json$/, `-${name}-${x.width}.png`); await x.page.screenshot({ path, fullPage: false }); report.screenshots.push(path); }
async function check(name, x, run) { try { await run(); report.checks.push({ name, width: x?.width, pass: true }); console.log('PASS ' + name + (x ? ' @' + x.width : '')); } catch (error) { report.checks.push({ name, width: x?.width, pass: false, error: String(error.message).split('\n').slice(0, 4).join(' | ') }); console.log('FAIL ' + name + (x ? ' @' + x.width : '') + ': ' + String(error.message).split('\n')[0]); } }
const noHorizontalScroll = async page => { const v = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(v.document <= v.viewport + 1, 'horizontal scroll ' + JSON.stringify(v)); };
const contrast = (page, selector) => page.evaluate(selector => { const node = document.querySelector(selector); if (!node) return null; const rgb = v => v.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; let bg = node, color = getComputedStyle(node).backgroundColor; while (bg && /rgba\(0, 0, 0, 0\)|transparent/.test(color)) { bg = bg.parentElement; color = bg ? getComputedStyle(bg).backgroundColor : 'rgb(255,255,255)'; } const a = lum(rgb(getComputedStyle(node).color)), b = lum(rgb(color)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }, selector);

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const x = await fixture(viewport);
  const { L } = x, gasPhone = '+18325550133';
  await check('PRA-DESK-01 API returns requests and visits newest first', x, async () => {
    const view = (await x.api()).body;
    const leadTimes = view.leads.map(l => l.createdAt), bookingTimes = view.bookings.map(b => b.createdAt);
    assert.deepEqual(leadTimes, [...leadTimes].sort().reverse(), 'leads[] newest first: ' + view.leads.map(l => l.customer_name || l.phone).join(', '));
    assert.deepEqual(bookingTimes, [...bookingTimes].sort().reverse(), 'bookings[] newest first: ' + view.bookings.map(b => b.customer_name).join(', '));
  });
  await route(x, 'leads'); await x.page.locator('#leads [data-record-id]').first().waitFor();
  await shot(x, 'inbox');
  await check('PRA-DESK-01/02 Inbox: open emergency, then same day, then newest first', x, async () => {
    const order = await x.page.locator('#leads [data-record-id]').evaluateAll(rows => rows.filter(r => r.getClientRects().length).map(r => r.dataset.recordId));
    assert.deepEqual(order, [L.gas.id, L.marcus.id, L.linh.id, L.patricia.id, L.owen.id], 'Inbox open order');
  });
  await check('PRA-DESK-02 Emergency and same-day rows carry a readable urgent badge', x, async () => {
    const gas = x.page.locator(`#leads [data-record-id="${L.gas.id}"]`), marcus = x.page.locator(`#leads [data-record-id="${L.marcus.id}"]`);
    assert.equal(await gas.getAttribute('data-urgency'), 'emergency');
    const badge = gas.locator('.desk-urgency'); assert.ok(await badge.isVisible(), 'emergency badge visible'); assert.match(await badge.innerText(), /Emergency/);
    assert.match(await marcus.locator('.desk-urgency').innerText(), /Same day/);
    const ratio = await contrast(x.page, `#leads [data-record-id="${L.gas.id}"] .desk-urgency`); assert.ok(ratio >= 4.5, 'badge contrast ' + ratio);
    const ratio2 = await contrast(x.page, `#leads [data-record-id="${L.marcus.id}"] .desk-urgency`); assert.ok(ratio2 >= 4.5, 'same-day badge contrast ' + ratio2);
    const box = await gas.boundingBox(); assert.ok(box && box.y < viewport.height, 'emergency row above the fold at ' + JSON.stringify(box));
  });
  await check('PRA-DESK-02 Inbox Open/Done filter, default Open, keyboard operable', x, async () => {
    const openButton = x.page.locator('[data-request-filter="open"]'), doneButton = x.page.locator('[data-request-filter="done"]');
    assert.equal(await openButton.getAttribute('aria-pressed'), 'true'); assert.equal(await doneButton.getAttribute('aria-pressed'), 'false');
    assert.equal(await x.page.locator('[role=group][aria-label="Show requests"]').count(), 1);
    const visibleIds = () => x.page.locator('#leads [data-record-id]').evaluateAll(rows => rows.filter(r => r.getClientRects().length).map(r => r.dataset.recordId));
    assert.ok(!(await visibleIds()).includes(L.dana.id), 'completed request not in Open');
    const size = await doneButton.boundingBox(); assert.ok(size.height >= 24 && size.width >= 24, 'target size ' + JSON.stringify(size));
    await doneButton.focus(); await x.page.keyboard.press('Enter');
    assert.equal(await doneButton.getAttribute('aria-pressed'), 'true'); assert.deepEqual(await visibleIds(), [L.dana.id], 'Done shows only the completed request');
    assert.equal(await x.page.evaluate(() => document.activeElement?.dataset?.requestFilter), 'done', 'focus stays on the filter');
    assert.match(await x.page.locator('#leads').innerText(), /Follow-up complete/);
    await noHorizontalScroll(x.page); await shot(x, 'inbox-done');
    await x.page.keyboard.press('Shift+Tab'); await x.page.keyboard.press('Space');
    assert.equal(await openButton.getAttribute('aria-pressed'), 'true'); assert.equal((await visibleIds())[0], L.gas.id);
  });
  await route(x, 'today'); await x.page.locator('#needsYou').waitFor();
  await x.page.evaluate(() => { const d = document.getElementById('homeActivityDetails'); if (d) d.open = true; document.getElementById('needsYou')?.scrollIntoView({ block: 'start' }); });
  await shot(x, 'home');
  await check('PRA-DESK-01/02 Home "Needs your attention": urgent first, newest first, with issue and time', x, async () => {
    const rows = x.page.locator('#needsYou > div');
    const texts = await rows.evaluateAll(rows => rows.map(r => r.innerText));
    assert.ok(texts.length >= 5, 'rows ' + texts.length);
    assert.match(texts[0], /\(832\) 555-0133/, 'first row is the emergency: ' + texts[0]);
    assert.match(texts[0], /Gas smell near the furnace/, 'issue shown');
    assert.match(texts[0], new RegExp(houston(L.gas.createdAt, { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '\\s')), 'arrival time shown: ' + texts[0]);
    assert.ok(await rows.nth(0).locator('.desk-urgency').isVisible(), 'urgent badge on Home');
    assert.match(texts[1], /Marcus Bell/); assert.match(texts[2], /Linh Tran/); assert.match(texts[3], /Patricia Gomez/);
    assert.ok(!texts.some(t => /Dana Cole/.test(t)), 'completed request not on Home');
  });
  await check('PRA-DESK-04 Recent activity: Houston time and owner wording', x, async () => {
    const text = await x.page.locator('#todayEvents').innerText();
    const expected = houston(x.E.lead, { hour: 'numeric', minute: '2-digit' }), utc = x.E.lead.slice(11, 16);
    assert.ok(text.includes(expected), `Houston time ${expected} in: ${text}`);
    assert.ok(!new RegExp('(^|\\s)' + utc + '(\\s|$)').test(text), 'UTC clock time ' + utc + ' shown: ' + text);
    assert.match(text, /New request from Marcus Bell/); assert.match(text, /Urgent alert for \+18325550133/); assert.match(text, /Request updated: Linh Tran/);
    assert.doesNotMatch(text, /\blead updated\b|\balert opened\b|^\s*lead\b/m, 'internal event names: ' + text);
    assert.equal(await x.page.locator('#todayEvents [data-request-open="' + L.marcus.id + '"]').count(), 1, 'activity links to the request');
    await noHorizontalScroll(x.page);
  });
  await route(x, 'convs'); await x.page.locator('#convs .conv').first().waitFor();
  await shot(x, 'conversations');
  await check('PRA-DESK-05 Conversations: no [Done:] markers, customer titles, owner channel labels', x, async () => {
    const text = await x.page.locator('#convs').innerText();
    assert.doesNotMatch(text, /\[Done:/, 'marker shown');
    assert.doesNotMatch(text, /wk3j9x0a1lmn8|wq81mzp0c2rt/, 'random visitor id shown as title');
    const titles = await x.page.locator('#convs .conv-header b').allInnerTexts();
    assert.ok(titles.includes('Marcus Bell'), 'linked conversation titled by customer: ' + titles);
    assert.ok(titles.includes('+17135550170'), 'text conversation titled by phone: ' + titles);
    assert.ok(titles.some(t => /^Website visitor · /.test(t)), 'unlinked website chat titled Website visitor + time: ' + titles);
    const tags = await x.page.locator('#convs .conv-channel').allInnerTexts();
    assert.ok(tags.includes('Website chat') && tags.includes('Text') && !tags.some(t => /^(web|sms)$/.test(t)), 'channel labels ' + tags);
    assert.match(text, /I saved your request for a callback this afternoon\./, 'customer-visible reply kept');
    assert.equal(await x.page.locator('#convs [data-request-open="' + L.marcus.id + '"]').count(), 1, 'conversation links to its request');
    await noHorizontalScroll(x.page);
  });
  await check('PRA-DESK-05 Stored turns keep the [Done:] markers the AI relies on', x, async () => {
    const stored = await store.get('conversations', `${x.slug}/${x.tenantIdentity}/web/wk3j9x0a1lmn8`);
    assert.match(stored.messages[1].content, /\n\[Done: request saved in portal, human contact unconfirmed, ref /);
    const view = (await x.api()).body, conv = view.conversations.find(v => v.contact === 'wk3j9x0a1lmn8');
    assert.match(conv.messages[1].content, /\[Done:/, 'API transcript unchanged; only owner display hides it');
  });
  await check('PRA-DESK-05 Saved conversation dialog hides markers', x, async () => {
    const open = x.page.locator('#convs [data-conversation-open][data-conversation-contact="wk3j9x0a1lmn8"]');
    await open.click(); await x.page.locator('#conversationDialog[open]').waitFor();
    await x.page.waitForFunction(() => document.querySelectorAll('#conversationMessages .conv-message').length > 0 || /could not|unavailable/i.test(document.getElementById('conversationMessage')?.textContent || ''), null, { timeout: 8000 });
    const text = await x.page.locator('#conversationMessages').innerText();
    assert.ok(text.length > 0, 'dialog read: ' + await x.page.locator('#conversationMessage').innerText());
    await shot(x, 'conversation-dialog');
    assert.doesNotMatch(text, /\[Done:/); assert.match(text, /I saved your request for a callback/);
    await x.page.locator('#conversationClose').click();
  });
  await x.context.close();
}

// Revision 2 (QA D1, D2, notes and the three surviving-mutant gaps).
const ids = x => x.page.locator('#leads [data-record-id]').evaluateAll(rows => rows.filter(r => r.getClientRects().length).map(r => r.dataset.recordId));
const flat = text => String(text).replace(/\s+/g, ' ');
const refresh = async x => { await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await x.page.waitForTimeout(500); };
const newLead = (x, name, phone, urgency) => store.addRecord('leads', x.slug, { tenantIdentity: x.tenantIdentity, status: 'open', reason: urgency === 'emergency' ? 'emergency' : 'lead', outcome: 'needs_action', channel: 'web', customer_name: name, phone, issue: name + ' issue', urgency, createdAt: new Date().toISOString() });
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const x = await fixture(viewport, true), { L } = x;
  await route(x, 'leads'); await x.page.locator('#leads [data-record-id]').first().waitFor();
  let open = await ids(x);
  await check('R2-D1 a request completed while its alert is still waiting stays in Open with Acknowledge', x, async () => {
    assert.ok(open.includes(L.alerted.id), 'waiting-alert request missing from Open');
    assert.equal(await x.page.locator(`#leads [data-record-id="${L.alerted.id}"] button.ack`).filter({ visible: true }).count(), 1, 'Acknowledge not visible by default');
    assert.ok(!open.includes(L.dana.id), 'completed request without an alert must be Done');
  });
  await check('R2-PIN a same-day request older than ordinary open requests is pinned below emergencies', x, async () => {
    const at = id => open.indexOf(id);
    assert.ok(at(L.gas.id) < at(L.sameOld.id), 'emergency first'); for (const id of [L.linh.id, L.tieA.id, L.patricia.id]) assert.ok(at(L.sameOld.id) < at(id), 'same day above newer ordinary ' + open.join(','));
    assert.equal(await x.page.locator(`#leads [data-record-id="${L.sameOld.id}"] .desk-urgency`).innerText(), 'Same day');
  });
  await check('R2-TIE createdAt ties order by record id in the API and the Inbox', x, async () => {
    const view = (await x.api()).body, apiOrder = view.leads.map(l => l.id).filter(id => id === L.tieA.id || id === L.tieB.id), want = [L.tieA.id, L.tieB.id].sort();
    assert.deepEqual(apiOrder, want, 'API tie order'); assert.deepEqual(open.filter(id => want.includes(id)), want, 'Inbox tie order');
  });
  await check('R2-COUNT Requests heading counts open requests and matches the Open filter', x, async () => {
    const heading = (await x.page.locator('#leadCount').innerText()).trim(); assert.equal(heading, String(open.length)); assert.equal((await x.page.locator('#requestOpenCount').innerText()).trim(), String(open.length));
    assert.equal(open.length + Number((await x.page.locator('#requestDoneCount').innerText()).trim()), (await x.api()).body.leads.length, 'Open + Done = all requests');
  });
  const viewRequest = async () => { const focused = await x.page.evaluate(() => { document.getElementById('websiteInstallPrimary').click(); return document.activeElement?.dataset?.recordId || document.activeElement?.tagName; }); await x.page.waitForTimeout(700); return { focused, after: await x.page.evaluate(() => document.activeElement?.dataset?.recordId || document.activeElement?.tagName), pressed: await x.page.locator('[data-request-filter][aria-pressed="true"]').getAttribute('data-request-filter') }; };
  await check('R2-VIEW website "View request" for the completed setup check, chosen while Done is selected, switches to Open and keeps the row focused', x, async () => {
    assert.ok(open.includes(L.setup.id), 'setup check rows are read-only for follow-up and stay under Open');
    await x.page.locator('[data-request-filter="done"]').click(); assert.ok(!(await ids(x)).includes(L.setup.id));
    assert.equal(await x.page.locator('#websiteInstallPrimary').getAttribute('data-action'), 'view_setup_request');
    const r = await viewRequest(); assert.deepEqual(r, { focused: L.setup.id, after: L.setup.id, pressed: 'open' }, 'after the Inbox refresh: ' + JSON.stringify(r));
    assert.ok((await ids(x)).includes(L.setup.id), 'setup row shown');
  });
  await check('R2-VIEW website "View request" for a completed first website request switches to Done and survives the Inbox refresh', x, async () => {
    await store.put('website_installations', x.slug + '/' + x.tenantIdentity, { ...(await store.get('website_installations', x.slug + '/' + x.tenantIdentity)), firstExternalRequest: x.firstExternal }); await refresh(x);
    assert.equal(await x.page.locator('[data-request-filter="open"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await x.page.locator('#websiteInstallPrimary').getAttribute('data-action'), 'view_request');
    const r = await viewRequest(); assert.deepEqual(r, { focused: L.first.id, after: L.first.id, pressed: 'done' }, JSON.stringify(r));
    assert.ok((await ids(x)).includes(L.first.id), 'completed request shown under Done');
  });
  await check('R2-RESET a refresh returns Done to Open and shows a request that arrived meanwhile', x, async () => {
    await x.page.locator('[data-request-filter="done"]').click(); assert.equal(await x.page.locator('[data-request-filter="done"]').getAttribute('aria-pressed'), 'true');
    const late = await newLead(x, 'Late Emergency', '+17135550290', 'emergency'); await refresh(x);
    assert.equal(await x.page.locator('[data-request-filter="open"]').getAttribute('aria-pressed'), 'true', 'back to Open');
    const now = await ids(x); assert.equal(now[0], late.id, 'new emergency first'); assert.ok(await x.page.locator('#requestOpenNew').isHidden());
    assert.equal((await x.page.locator('#leadCount').innerText()).trim(), String(now.length)); open = now;
  });
  await check('R2-DIALOG while a request dialog is open a refresh keeps Done, and Open says New until viewed', x, async () => {
    await x.page.locator('[data-request-filter="done"]').click();
    const opener = x.page.locator(`#leads [data-record-id="${L.dana.id}"] [data-request-open]`).first(); await opener.click(); await x.page.locator('#requestDialog[open]').waitFor();
    await newLead(x, 'Later Request', '+17135550291', 'flexible'); await refresh(x);
    assert.equal(await x.page.locator('[data-request-filter="done"]').getAttribute('aria-pressed'), 'true', 'Done kept during dialog');
    assert.ok(await x.page.locator('#requestOpenNew').isVisible(), 'New cue visible'); assert.match(flat(await x.page.locator('[data-request-filter="open"]').innerText()), /Open \d+ ?New/);
    await x.page.locator('#requestClose').click(); await x.page.locator('#requestDialog:not([open])').waitFor({ state: 'attached' });
    assert.equal(await x.page.evaluate(() => document.activeElement?.closest('[data-record-id]')?.dataset.recordId), L.dana.id, 'focus back on the same row');
    assert.ok(await x.page.locator('#requestOpenNew').isVisible(), 'New cue still visible after closing'); await x.page.locator('.desk-request-filter').scrollIntoViewIfNeeded(); await shot(x, 'r2-done-new-cue');
    await x.page.locator('[data-request-filter="open"]').click(); assert.ok(await x.page.locator('#requestOpenNew').isHidden(), 'cue clears once Open is viewed');
    assert.ok(flat(await x.page.locator('#leads').innerText()).includes('Later Request'));
    await noHorizontalScroll(x.page); open = await ids(x);
  });
  await route(x, 'today'); await x.page.locator('#needsYou').waitFor();
  await check('R2-HOME waiting-alert request and older same-day request are on Home, same day above ordinary', x, async () => {
    const texts = await x.page.locator('#needsYou > div').evaluateAll(rows => rows.map(r => r.innerText)), at = name => texts.findIndex(t => t.includes(name));
    assert.ok(at('Alma Waiting') >= 0, 'waiting alert on Home'); assert.ok(at('Sam Early') >= 0 && at('Sam Early') < at('Linh Tran'), 'same day above ordinary on Home: ' + texts.map(t => t.split('\n')[0]).join(' | '));
  });
  await route(x, 'leads'); await x.page.locator('#leads [data-record-id]').first().waitFor();
  await check('R2-ACK acknowledging the waiting alert moves the completed request to Done', x, async () => {
    await x.page.locator(`#leads [data-record-id="${L.alerted.id}"] button.ack`).click();
    try { await x.page.waitForFunction(id => !document.querySelector(`#leads [data-record-id="${id}"]`), L.alerted.id, { timeout: 8000 }); } catch (error) { const v = (await x.api()).body.leads.find(l => l.id === L.alerted.id); throw new Error('still open: ' + JSON.stringify({ alertWaiting: v.alertWaiting, attention: v.alertAttentionDue, status: v.status, needs: v.followthrough?.needsFollowup, toast: await x.page.locator('#toast').innerText().catch(() => '') })); }
    await x.page.locator('[data-request-filter="done"]').click(); assert.ok((await ids(x)).includes(L.alerted.id), 'now under Done');
    await x.page.locator('[data-request-filter="open"]').click();
  });
  await route(x, 'setup');
  await check('R2-DST Setup activity shows CDT then CST for the repeated 1:30 AM on Nov 1 2026', x, async () => {
    const text = flat(await x.page.locator('#liveEvents').evaluate(n => n.textContent));
    assert.ok(text.includes('Nov 1, 1:30 AM CDT'), 'CDT: ' + text.slice(0, 400)); assert.ok(text.includes('Nov 1, 1:30 AM CST'), 'CST: ' + text.slice(0, 400));
  });
  await route(x, 'today');
  await check('R2-DST Home activity times carry the zone abbreviation', x, async () => {
    const times = await x.page.locator('#todayEvents time').allInnerTexts(); assert.ok(times.length > 0); for (const t of times) assert.match(flat(t), /\d:\d\d [AP]M C[SD]T$/, 'zone on ' + t);
  });
  await route(x, 'convs'); await x.page.locator('#convs .conv').first().waitFor();
  const conv = contact => x.page.locator('#convs .conv').filter({ has: x.page.locator(`[data-conversation-contact="${contact}"]`) });
  await check('R2-D2 a marker-only front desk turn shows the saved action, not an empty bubble', x, async () => {
    const texts = await conv('wonlymarker01').locator('.conv-message.a').allInnerTexts(); assert.equal(texts.length, 1);
    assert.match(texts[0], /visit saved in portal, ref zz99/); assert.doesNotMatch(texts[0], /\[Done:/);
    const all = await x.page.locator('#convs .conv-message.a').evaluateAll(n => n.map(m => m.textContent)); assert.ok(!all.some(t => t.replace(/^Front desk/, '').trim() === ''), 'empty assistant bubble');
  });
  await check('R2-CUSTOMER a customer turn ending in "[Done: …]" is shown exactly as typed (list)', x, async () => {
    assert.ok(flat(await conv('wcustmarker01').innerText()).includes('Please write this down [Done: paid in cash]'));
  });
  for (const [contact, want, not] of [['wcustmarker01', 'Please write this down [Done: paid in cash]', null], ['wonlymarker01', 'visit saved in portal, ref zz99', /\[Done:/]]) await check('R2-DIALOG-TEXT saved conversation dialog: ' + contact, x, async () => {
    await x.page.locator(`#convs [data-conversation-open][data-conversation-contact="${contact}"]`).click(); await x.page.locator('#conversationDialog[open]').waitFor();
    await x.page.waitForFunction(() => document.querySelectorAll('#conversationMessages .conv-message').length > 0, null, { timeout: 8000 });
    const text = flat(await x.page.locator('#conversationMessages').innerText()); assert.ok(text.includes(want), text.slice(0, 300)); if (not) assert.doesNotMatch(text, not);
    await x.page.locator('#conversationClose').click();
  });
  await x.context.close();
}

// Legacy (owner-key) workspace: storage-key order is neither chronological nor reversed.
await check('PRA-DESK-01 Legacy owner-key workspace lists newest first', null, async () => {
  const slug = 'inbox-fix-legacy', key = 'LEGACY-KEY-0001';
  const c = newClient({ slug, ownerKey: key, owner: { name: 'Legacy Owner', email: 'legacy@example.test', phone: '+17135550190' }, business: { name: 'Legacy Shop', trade: 'Plumbing', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { status: 'live', build: { status: 'built' } }); await store.put('clients', slug, c);
  const rows = [['c1', 50], ['a1', 40], ['e1', 30], ['b1', 20], ['d1', 10]];
  for (const [id, hours] of rows) { await store.put('leads', `${slug}/${id}`, { id, slug, customer_name: 'Lead ' + id, phone: '+1713555' + String(1000 + hours), status: 'open', outcome: 'needs_action', createdAt: ago(hours * HOUR) }); await store.put('bookings', `${slug}/${id}`, { id, slug, customer_name: 'Visit ' + id, phone: '+17135550100', status: 'booked', date: '2026-12-01', window: '8 to 12', createdAt: ago(hours * HOUR) }); }
  const r = await clientHandler(new Request(origin + '/api/client?c=' + slug + '&k=' + key, { headers: { Origin: origin } }), { ip: '192.0.2.82' }), body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body).slice(0, 200));
  assert.deepEqual(body.leads.map(l => l.id), ['d1', 'b1', 'e1', 'a1', 'c1'], 'legacy leads newest first');
  assert.deepEqual(body.bookings.map(b => b.id), ['d1', 'b1', 'e1', 'a1', 'c1'], 'legacy bookings newest first');
});

await browser.close();
report.pageErrors = [...new Set(report.pageErrors)];
report.pass = report.checks.filter(c => c.pass).length; report.total = report.checks.length;
report.ok = report.pass === report.total && !report.physicalNetwork && !report.pageErrors.length && !report.forbidden.length;
writeFileSync(output, JSON.stringify(report, null, 1));
console.log(`${report.pass}/${report.total} checks; page errors ${report.pageErrors.length}; forbidden ${report.forbidden.length}; physical ${report.physicalNetwork}`);
process.exitCode = report.ok ? 0 : 1;
