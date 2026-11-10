// Desk accessibility: keyboard focus through Business details saves and conflicts, focused controls clear of the mobile tab bar,
// Account footer link contrast and target size, one announcement per practice-chat state, and page-change cues.
// Actual owner handlers (/api/client, /api/access, /api/chat) and browser assets; memory storage, fake model, no server or external transport.
// Run from the worktree root: node qa-artifacts/claude-collaboration/desk-a11y-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-a11y-<name>.json [--desk-dir <dir with desk.js, desk.html, desk.css>]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const output = option('--output'), playwrightPath = option('--playwright') || process.env.MC_PLAYWRIGHT_MODULE;
if (!output || !/^scratchpad\/claude-port-[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw new Error('Choose a new --output scratchpad/claude-port-name.json');
if (!playwrightPath) throw new Error('Use installed Playwright via --playwright /path/to/playwright/index.mjs. This check never installs tooling.');
const root = resolve('.'), origin = 'http://127.0.0.1:8922';
if (!existsSync(resolve(root, 'desk.js'))) throw new Error('Run from the worktree root.');
const deskDir = option('--desk-dir') ? resolve(option('--desk-dir')) : null;
const lib = path => pathToFileURL(resolve(root, path)).href;
const sha = value => createHash('sha256').update(value).digest('hex');
const pinned = ['desk.js', 'desk.html', 'desk.css'];
const report = { at: new Date().toISOString(), browser: process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome', deskDir: option('--desk-dir') || '.', served: Object.fromEntries(pinned.map(f => [f, []])), qualifications: 'Synthetic workspace and session; actual local /api/client, /api/access and /api/chat handlers with the fake model; memory storage. Live-region announcements are approximated by observing DOM changes inside role=status/log/alert and aria-live regions (not a screen reader). No model/provider/email/OAuth/purchase/deployment performed.', checkSha256: sha(readFileSync(new URL(import.meta.url))), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('A11y check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { report.backgroundRequests = (report.backgroundRequests || []).concat({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };
const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
const handlers = { '/api/client': (await import(lib('netlify/functions/client.mjs'))).default, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default, '/api/workspace-billing': (await import(lib('netlify/functions/workspace-billing.mjs'))).default, '/api/chat': (await import(lib('netlify/functions/chat.mjs'))).default };
const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const contexts = []; let serial = 0;

async function fixture(viewport, hash = '#today', options = {}) {
  const slug = 'a11y-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Access Shop', trade: 'Plumbing', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'voice'] }, services: ['Drain cleaning'], fees: [{ label: 'Drain cleaning', amount: '$149', note: '' }], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm'); c.phone.businessNumber = ''; if (options.legacy) delete c.onboarding;
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(10000);
  await context.addInitScript(({ origin, slug, token }) => {
    if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen');
    // Approximate what a screen reader is told: each change inside a live region, with log regions reporting only added, unhidden nodes.
    window.__live = [];
    const start = () => new MutationObserver(records => {
      const seen = new Set();
      for (const record of records) {
        const node = record.target.nodeType === 3 ? record.target.parentElement : record.target, region = node?.closest?.('[role=status],[role=alert],[role=log],[aria-live]');
        if (!region || region.closest('[aria-hidden=true]') || region.getAttribute('aria-live') === 'off') continue;
        if (region.getAttribute('role') === 'log') { for (const added of record.addedNodes) { const el = added.nodeType === 1 ? added : added.parentElement; if (el && !el.closest('[aria-hidden=true]') && (added.textContent || '').trim()) window.__live.push({ region: region.id, text: added.textContent.trim() }); } continue; }
        if (seen.has(region)) continue; seen.add(region); const text = (region.textContent || '').trim(); if (text) window.__live.push({ region: region.id, text });
      }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    if (document.documentElement) start(); else addEventListener('DOMContentLoaded', start);
  }, { origin, slug, token });
  const state = { requests: [], putFault: null, chatFault: null, getHook: null, putGate: false, release: null };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action }; state.requests.push(item); report.requests.push(item);
      if (url.pathname === '/api/chat' && state.chatFault === 503) { state.chatFault = null; item.status = 503; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'offline', message: 'Synthetic AI service unavailable.' }) }); }
      if (method === 'PUT' && state.putFault === 'before') { state.putFault = null; item.fixture = 'lost-before-handler'; item.status = 'aborted'; return route.abort('failed'); }
      if (method === 'PUT' && state.putGate) { state.putGate = false; item.fixture = 'slow'; await new Promise(release => { state.release = release; }); }
      if (method === 'GET' && url.pathname === '/api/client' && state.getHook) { const hook = state.getHook; state.getHook = null; await hook(); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' }); item.status = response.status;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (method === 'PUT' && state.putFault === 'after') { state.putFault = null; item.fixture = 'lost-after-handler'; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buffer });
    }
    const name = url.pathname.replace(/^\//, '');
    if (pinned.includes(name)) { const bytes = readFileSync(deskDir ? resolve(deskDir, name) : resolve(root, name)), digest = sha(bytes); if (!report.served[name].includes(digest)) report.served[name].push(digest); return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(name)], body: bytes }); }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/desk.html?c=' + slug + (options.legacy ? '&k=' + encodeURIComponent(c.ownerKey) : '') + hash); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, c, slug, state, context, width: viewport.width };
}
async function check(name, run) { const start = contexts.length; try { await run(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); } catch (error) { report.checks.push({ name, pass: false, error: error.stack }); const page = contexts.at(-1)?.pages().at(-1); if (page) await shot(page, 'failure-' + report.checks.length).catch(() => {}); console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]); } finally { await Promise.all(contexts.slice(start).map(context => context.close())); } }
async function shot(page, name) { const path = output.replace(/\.json$/, '-' + name + '.png'); await page.screenshot({ path }); report.screenshots = (report.screenshots || []).concat(path); }
async function noHorizontalScroll(page) { const v = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(v.document <= v.viewport + 1, 'Horizontal scroll ' + JSON.stringify(v)); }
const focused = page => page.evaluate(() => { const a = document.activeElement; return { id: a?.id || '', tag: a?.tagName || '', body: !a || a === document.body || a === document.documentElement, visible: !!a && a.getClientRects().length > 0 && !a.closest('[hidden]') }; });
const puts = x => x.state.requests.filter(r => r.method === 'PUT');

// ---------- 1. Business details save focus ----------
async function toDetails(x) {
  await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: 'know' } })));
  await x.page.waitForFunction(() => ['saved', 'incomplete'].includes(document.getElementById('cfg').dataset.saveState));
}
// Business details sections are an exclusive accordion (shared details name), so open only the field's own section.
async function type(page, name, value) { const field = page.locator('#cfg [name="' + name + '"]'); await field.evaluate(f => { for (let d = f.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; }); await field.focus(); await field.fill(value); }
const settled = page => page.waitForFunction(() => { const f = document.getElementById('cfg'); return f.getAttribute('aria-busy') === 'false' && f.dataset.saveState !== 'saving' && !/Checking/.test(document.getElementById('saveMsg').textContent); });
async function press(x, id, expectPuts) { await x.page.locator('#' + id).focus(); await x.page.keyboard.press('Enter'); if (expectPuts !== undefined) for (let i = 0; i < 100 && puts(x).length < expectPuts; i++) await x.page.waitForTimeout(50); await x.page.waitForTimeout(100); await settled(x.page); await x.page.waitForTimeout(150); }
const saveState = page => page.locator('#cfg').getAttribute('data-save-state');

try {
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = v.width;
    await check(w + 'px 1. a keyboard save keeps focus on Save or the save status, never the page body', async () => {
      const x = await fixture(v); await toDetails(x); await type(x.page, 'business.name', 'Fixture Access Plumbing');
      await press(x, 'saveCfg', 1); assert.equal(await saveState(x.page), 'saved'); const f = await focused(x.page);
      assert.ok(['saveCfg', 'saveMsg'].includes(f.id), 'focus after save: ' + JSON.stringify(f));
    });
    await check(w + 'px 1. a lost save response leaves focus on a visible control', async () => {
      const x = await fixture(v); await toDetails(x); await type(x.page, 'business.name', 'Fixture Access Sewer'); x.state.putFault = 'after';
      await press(x, 'saveCfg', 1); const f = await focused(x.page); assert.ok(!f.body && f.visible, 'focus after lost save: ' + JSON.stringify(f));
    });
    await check(w + 'px 1. a conflicting save moves focus to Check latest; Check latest and Keep my edits keep focus on visible controls', async () => {
      const x = await fixture(v); await toDetails(x); await type(x.page, 'business.name', 'Fixture Access Repipe');
      await store.atomicUpdate('clients', x.slug, c => ({ value: { ...c, phone: { ...c.phone, businessNumber: '+17135550177' }, updatedAt: new Date().toISOString() } }));
      await press(x, 'saveCfg', 1); assert.equal(puts(x)[0].status, 409); assert.equal(await saveState(x.page), 'conflict');
      let f = await focused(x.page); assert.equal(f.id, 'cfgCheckLatest', 'focus after 409: ' + JSON.stringify(f));
      if (w === 390) { await x.page.locator('#cfgConflictPanel').scrollIntoViewIfNeeded(); await shot(x.page, 'conflict-focus-390'); }
      await press(x, 'cfgCheckLatest'); f = await focused(x.page); assert.ok(!f.body && f.visible, 'focus after Check latest: ' + JSON.stringify(f));
      await x.page.locator('#cfgKeepEdits').waitFor({ state: 'visible' });
      await press(x, 'cfgKeepEdits', 2); assert.equal(puts(x)[1].status, 200); assert.equal(await saveState(x.page), 'saved');
      f = await focused(x.page); assert.ok(!f.body && f.visible, 'focus after Keep my edits: ' + JSON.stringify(f)); assert.ok(['saveCfg', 'saveMsg'].includes(f.id), 'focus after Keep my edits: ' + JSON.stringify(f));
    });
  }

  // ---------- 7. Average job value save focus ----------
  const acctSettled = page => page.waitForFunction(() => { const f = document.getElementById('acct'); return f.getAttribute('aria-busy') === 'false' && f.dataset.saveState !== 'saving' && !/Checking/.test(document.getElementById('acctMsg').textContent); });
  async function acctPress(x, id, expectPuts) { await x.page.locator('#' + id).focus(); await x.page.keyboard.press('Enter'); if (expectPuts !== undefined) for (let i = 0; i < 100 && puts(x).length < expectPuts; i++) await x.page.waitForTimeout(50); await x.page.waitForTimeout(100); await acctSettled(x.page); await x.page.waitForTimeout(150); }
  async function toAverage(x) { await x.page.evaluate(() => { document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: 'account' } })); document.getElementById('accountReporting').open = true; }); await x.page.locator('#avgTicket').waitFor({ state: 'visible' }); await x.page.waitForFunction(() => document.getElementById('acct').dataset.saveState === 'saved'); }
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = v.width;
    await check(w + 'px 7. a keyboard save of average job value keeps focus on Save or its status', async () => {
      const x = await fixture(v, '#account', { legacy: true }); await toAverage(x); await x.page.locator('#avgTicket').fill('450');
      await acctPress(x, 'saveAcct', 1); assert.equal(puts(x)[0].status, 200); const f = await focused(x.page); assert.ok(['saveAcct', 'acctMsg'].includes(f.id), 'focus after save: ' + JSON.stringify(f));
    });
    await check(w + 'px 7. a lost average job value save leaves focus on a visible control', async () => {
      const x = await fixture(v, '#account', { legacy: true }); await toAverage(x); await x.page.locator('#avgTicket').fill('475'); x.state.putFault = 'after';
      await acctPress(x, 'saveAcct', 1); const f = await focused(x.page); assert.ok(!f.body && f.visible, 'focus after lost save: ' + JSON.stringify(f));
    });
    await check(w + 'px 7. a conflicting average job value save moves focus to Check latest; Check latest and Keep my value keep focus visible', async () => {
      // Legacy workspaces have no revision check, so the conflict comes from a lost save while another tab writes a different value.
      const x = await fixture(v, '#account', { legacy: true }); await toAverage(x); await x.page.locator('#avgTicket').fill('500'); x.state.putFault = 'after';
      x.state.getHook = async () => { await store.atomicUpdate('clients', x.slug, c => ({ value: { ...c, rules: { ...c.rules, avgTicket: 999 }, updatedAt: new Date().toISOString() } })); };
      await acctPress(x, 'saveAcct', 1); assert.equal(await x.page.locator('#acct').getAttribute('data-save-state'), 'conflict');
      let f = await focused(x.page); assert.equal(f.id, 'acctCheckLatest', 'focus after conflict: ' + JSON.stringify(f));
      if (w === 390) { await x.page.locator('#acctConflictPanel').scrollIntoViewIfNeeded(); await shot(x.page, 'average-conflict-focus-390'); }
      await acctPress(x, 'acctCheckLatest'); f = await focused(x.page); assert.ok(!f.body && f.visible, 'focus after Check latest: ' + JSON.stringify(f));
      if (await x.page.locator('#acctKeepEdits').isVisible()) { await acctPress(x, 'acctKeepEdits', 2); assert.equal(puts(x)[1].status, 200); assert.equal((await store.get('clients', x.slug)).rules.avgTicket, 500); f = await focused(x.page); assert.ok(['saveAcct', 'acctMsg'].includes(f.id), 'focus after Keep my value: ' + JSON.stringify(f)); }
      // Legacy reads carry no revision, so Check latest reports that the latest value could not be read; focus still stays on it.
      else assert.equal(f.id, 'acctCheckLatest', 'focus after Check latest on a legacy workspace: ' + JSON.stringify(f));
    });
  }

  // ---------- 8. Legacy Check latest is a way out, not a dead end ----------
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = v.width;
    await check(w + 'px 8. legacy average job value conflict: Check latest shows the latest value and Keep my value saves the owner value', async () => {
      const x = await fixture(v, '#account', { legacy: true }); await toAverage(x); await x.page.locator('#avgTicket').fill('500'); x.state.putFault = 'after';
      x.state.getHook = async () => { await store.atomicUpdate('clients', x.slug, c => ({ value: { ...c, rules: { ...c.rules, avgTicket: 999 }, updatedAt: new Date().toISOString() } })); };
      await acctPress(x, 'saveAcct', 1); assert.equal(await x.page.locator('#acct').getAttribute('data-save-state'), 'conflict');
      await acctPress(x, 'acctCheckLatest'); const text = await x.page.locator('#acctConflictPanel').innerText();
      assert.doesNotMatch(await x.page.locator('#acctMsg').innerText(), /could not be read/, 'Check latest failed on a legacy workspace');
      assert.match(text, /999/); assert.match(text, /500/); assert.equal(await x.page.locator('#avgTicket').inputValue(), '500', 'owner value kept on screen');
      await x.page.locator('#acctKeepEdits').waitFor({ state: 'visible' }); if (w === 390) { await x.page.locator('#acctConflictPanel').scrollIntoViewIfNeeded(); await shot(x.page, 'legacy-average-checked-390'); }
      await acctPress(x, 'acctKeepEdits', 2); assert.equal(puts(x)[1].status, 200); assert.equal((await store.get('clients', x.slug)).rules.avgTicket, 500);
      assert.equal(await x.page.locator('#acct').getAttribute('data-save-state'), 'saved');
    });
    await check(w + 'px 8. legacy Business details conflict: Check latest lists the change and Keep my edits saves mine with the latest other details', async () => {
      // Lost before the server, so only Keep my edits can save the owner's name.
      const x = await fixture(v, '#know', { legacy: true }); await toDetails(x); await type(x.page, 'business.name', 'Fixture Legacy Mine'); x.state.putFault = 'before';
      x.state.getHook = async () => { await store.atomicUpdate('clients', x.slug, c => ({ value: { ...c, business: { ...c.business, licenses: 'TACLA 12345' }, updatedAt: new Date().toISOString() } })); };
      await press(x, 'saveCfg', 1); assert.equal(await saveState(x.page), 'conflict');
      await press(x, 'cfgCheckLatest'); assert.doesNotMatch(await x.page.locator('#saveMsg').innerText(), /could not be read/, 'Check latest failed on a legacy workspace');
      await x.page.locator('#cfgKeepEdits').waitFor({ state: 'visible' }); assert.match(await x.page.locator('#cfgConflictFields').innerText(), /TACLA 12345/);
      assert.equal(await x.page.locator('#cfg [name="business.name"]').inputValue(), 'Fixture Legacy Mine', 'owner edit kept on screen');
      await press(x, 'cfgKeepEdits', 2); assert.equal(puts(x)[1].status, 200); const c = await store.get('clients', x.slug);
      assert.equal(c.business.name, 'Fixture Legacy Mine'); assert.equal(c.business.licenses, 'TACLA 12345', 'the other tab change is kept'); assert.equal(await saveState(x.page), 'saved');
    });
  }

  // ---------- 9. A slow save never yanks focus or scroll after the owner moved on ----------
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = v.width;
    await check(w + 'px 9. owner clicks page text and scrolls up during a slow Business details save: no focus or scroll jump', async () => {
      const x = await fixture(v); await toDetails(x); await type(x.page, 'business.name', 'Fixture Slow Save'); x.state.putGate = true;
      await x.page.locator('#saveCfg').focus(); await x.page.keyboard.press('Enter'); for (let i = 0; i < 100 && !x.state.release; i++) await x.page.waitForTimeout(50);
      await x.page.evaluate(() => window.scrollTo(0, 0)); await x.page.mouse.click(4, 4); await x.page.mouse.wheel(0, -200); await x.page.waitForTimeout(100);
      x.state.release(); await settled(x.page); await x.page.waitForTimeout(300);
      const after = await x.page.evaluate(() => ({ y: Math.round(scrollY), id: document.activeElement?.id || document.activeElement?.tagName }));
      assert.equal(await saveState(x.page), 'saved'); assert.ok(after.y < 50, 'page scrolled after save: ' + JSON.stringify(after)); assert.notEqual(after.id, 'saveCfg', 'focus jumped to Save');
    });
    await check(w + 'px 9. owner clicks page text and scrolls up during a slow average job value save: no focus or scroll jump', async () => {
      const x = await fixture(v, '#account', { legacy: true }); await toAverage(x); await x.page.locator('#avgTicket').fill('610'); x.state.putGate = true;
      await x.page.locator('#saveAcct').focus(); await x.page.keyboard.press('Enter'); for (let i = 0; i < 100 && !x.state.release; i++) await x.page.waitForTimeout(50);
      await x.page.evaluate(() => window.scrollTo(0, 0)); await x.page.mouse.click(4, 4); await x.page.mouse.wheel(0, -200); await x.page.waitForTimeout(100);
      x.state.release(); await acctSettled(x.page); await x.page.waitForTimeout(300);
      const after = await x.page.evaluate(() => ({ y: Math.round(scrollY), id: document.activeElement?.id || document.activeElement?.tagName }));
      assert.ok(after.y < 50, 'page scrolled after save: ' + JSON.stringify(after)); assert.notEqual(after.id, 'saveAcct', 'focus jumped to Save');
    });
  }

  // ---------- 11. Keys that do not move focus never cancel the focus return (K2) ----------
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = v.width;
    await check(w + 'px 11. Shift or Control (stop speech) during a slow keyboard save still returns focus to Save', async () => {
      const x = await fixture(v); await toDetails(x); await type(x.page, 'business.name', 'Fixture Modifier Save'); x.state.putGate = true;
      await x.page.locator('#saveCfg').focus(); await x.page.keyboard.press('Enter'); for (let i = 0; i < 100 && !x.state.release; i++) await x.page.waitForTimeout(50);
      await x.page.keyboard.press('Shift'); await x.page.keyboard.press('Control'); await x.page.keyboard.press('Alt'); await x.page.keyboard.press('Meta'); await x.page.waitForTimeout(100);
      x.state.release(); await settled(x.page); await x.page.waitForTimeout(300);
      const f = await focused(x.page); assert.equal(await saveState(x.page), 'saved'); assert.ok(['saveCfg', 'saveMsg'].includes(f.id), 'focus after a slow save with modifier keys: ' + JSON.stringify(f));
    });
    await check(w + 'px 11. Tab pressed while focus is lost during a slow average job value save never leaves focus on the page body', async () => {
      const x = await fixture(v, '#account', { legacy: true }); await toAverage(x); await x.page.locator('#avgTicket').fill('620'); x.state.putGate = true;
      await x.page.locator('#saveAcct').focus(); await x.page.keyboard.press('Enter'); for (let i = 0; i < 100 && !x.state.release; i++) await x.page.waitForTimeout(50);
      await x.page.keyboard.press('Shift'); await x.page.keyboard.press('Control'); await x.page.waitForTimeout(100);
      x.state.release(); await acctSettled(x.page); await x.page.waitForTimeout(300);
      let f = await focused(x.page); assert.ok(['saveAcct', 'acctMsg'].includes(f.id), 'focus after a slow average save with modifier keys: ' + JSON.stringify(f));
      await x.page.locator('#avgTicket').fill('630'); x.state.putGate = true;
      await x.page.locator('#saveAcct').focus(); await x.page.keyboard.press('Enter'); for (let i = 0; i < 100 && !x.state.release; i++) await x.page.waitForTimeout(50);
      const during = await focused(x.page); if (during.body) await x.page.keyboard.press('Tab'); await x.page.waitForTimeout(100);
      x.state.release(); await acctSettled(x.page); await x.page.waitForTimeout(300);
      f = await focused(x.page); assert.ok(!f.body && f.visible, 'focus after Tab during a slow save: ' + JSON.stringify(f));
    });
  }

  // ---------- 12. Legacy Keep my edits never overwrites a change it did not show (K1) ----------
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = v.width;
    await check(w + 'px 12. legacy Keep my edits re-reads first: a newer change refreshes the panel and nothing is saved until the owner keeps again', async () => {
      const x = await fixture(v, '#know', { legacy: true }); await toDetails(x); await type(x.page, 'business.name', 'Fixture Legacy Mine'); x.state.putFault = 'before';
      x.state.getHook = async () => { await store.atomicUpdate('clients', x.slug, c => ({ value: { ...c, business: { ...c.business, licenses: 'TACLA 12345' }, updatedAt: new Date().toISOString() } })); };
      await press(x, 'saveCfg', 1); await press(x, 'cfgCheckLatest'); await x.page.locator('#cfgKeepEdits').waitFor({ state: 'visible' });
      await store.atomicUpdate('clients', x.slug, c => ({ value: { ...c, business: { ...c.business, afterHours: 'Closed Sundays' }, updatedAt: new Date().toISOString() } }));
      await press(x, 'cfgKeepEdits'); await x.page.waitForTimeout(300);
      assert.equal(puts(x).length, 1, 'Keep saved over a change it never showed'); let c = await store.get('clients', x.slug);
      assert.equal(c.business.afterHours, 'Closed Sundays'); assert.notEqual(c.business.name, 'Fixture Legacy Mine');
      assert.match(await x.page.locator('#saveMsg').innerText(), /changed again/i); assert.match(await x.page.locator('#cfgConflictFields').innerText(), /Closed Sundays/);
      assert.equal(await x.page.locator('#cfg [name="business.name"]').inputValue(), 'Fixture Legacy Mine', 'owner edit kept on screen');
      const f = await focused(x.page); assert.ok(!f.body && f.visible, 'focus after the refreshed panel: ' + JSON.stringify(f));
      if (w === 390) { await x.page.locator('#cfgConflictPanel').scrollIntoViewIfNeeded(); await shot(x.page, 'legacy-keep-changed-again-390'); await noHorizontalScroll(x.page); }
      await press(x, 'cfgKeepEdits', 2); assert.equal(puts(x)[1].status, 200); c = await store.get('clients', x.slug);
      assert.equal(c.business.name, 'Fixture Legacy Mine'); assert.equal(c.business.afterHours, 'Closed Sundays'); assert.equal(c.business.licenses, 'TACLA 12345'); assert.equal(await saveState(x.page), 'saved');
    });
  }

  // ---------- 10. Practice errors land in a log that is no longer busy ----------
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await check(v.width + 'px 10. a practice-chat error is added after the conversation log stops being busy', async () => {
      const x = await fixture(v, '#test'); await x.page.locator('#chatIn').waitFor({ state: 'visible' }); await x.page.waitForFunction(() => document.querySelectorAll('#msgs .b.a').length > 0);
      await x.page.evaluate(() => { const log = document.getElementById('msgs'); window.__busyAtError = []; let busy = log.getAttribute('aria-busy'); new MutationObserver(records => { const attrs = records.filter(r => r.type === 'attributes'); records.forEach(r => { if (r.type === 'attributes') { const next = attrs[attrs.indexOf(r) + 1]; busy = next ? next.oldValue : log.getAttribute('aria-busy'); } else for (const n of r.addedNodes) if (n.classList?.contains('s')) window.__busyAtError.push(busy); }); }).observe(log, { childList: true, attributes: true, attributeFilter: ['aria-busy'], attributeOldValue: true }); });
      x.state.chatFault = 503; await x.page.locator('#chatIn').fill('Do you clear sewer lines?'); await x.page.locator('#chatIn').press('Enter');
      await x.page.waitForFunction(() => document.getElementById('chatForm').getAttribute('aria-busy') === 'false' && /unavailable/.test(document.getElementById('msgs').innerText), null, { timeout: 15000 });
      assert.deepEqual(await x.page.evaluate(() => window.__busyAtError), ['false'], 'aria-busy on the log when the error was added');
    });
  }

  // ---------- 2. Focused controls clear of the mobile tab bar ----------
  const sweep = async (x, steps) => {
    const hits = [];
    await x.page.locator('#pageTitle').focus();
    for (let i = 0; i < steps; i++) {
      await x.page.keyboard.press('Tab');
      const r = await x.page.evaluate(() => {
        const a = document.activeElement, bar = document.querySelector('.desk-app .tabs');
        if (!a || a === document.body || !bar || bar.contains(a) || !a.getClientRects().length) return null;
        const rect = a.getBoundingClientRect(), b = bar.getBoundingClientRect();
        if (getComputedStyle(bar).position !== 'fixed') return null;
        // The sticky Business details save bar is a second bottom overlay for every field outside it.
        const save = document.querySelector('.desk-save-bar'), s = save && save.getClientRects().length && !save.contains(a) && getComputedStyle(save).position === 'sticky' ? save.getBoundingClientRect() : null;
        const underSave = !!s && s.bottom <= innerHeight && rect.bottom > s.top + 0.5 && rect.top < s.bottom;
        return { id: a.id || a.name || a.textContent.trim().slice(0, 30), top: Math.round(rect.top), bottom: Math.round(rect.bottom), barTop: Math.round(b.top), saveTop: s ? Math.round(s.top) : null, covered: rect.bottom > b.top + 0.5 && rect.top < b.bottom || underSave };
      });
      if (r && r.covered) hits.push(r);
    }
    return hits;
  };
  for (const v of [{ width: 320, height: 640 }, { width: 390, height: 844 }]) {
    for (const [hash, steps, open] of [['#know', 45, false], ['#know', 70, true], ['#test', 25, false], ['#setup', 30, false], ['#account', 30, false]]) {
      await check(v.width + 'x' + v.height + ' 2. Tab through ' + hash + (open ? ' (sections open)' : '') + ' never leaves the focused control under the bottom tab bar or the Save bar', async () => {
        const x = await fixture(v, hash); await x.page.waitForTimeout(400);
        if (open) await x.page.evaluate(() => document.querySelectorAll('#cfg details:not([name])').forEach(d => { d.open = true; }));
        const hits = await sweep(x, steps); if (hits.length) await shot(x.page, 'covered-' + hash.slice(1) + (open ? '-open' : '') + '-' + v.width);
        assert.deepEqual(hits, [], 'focused controls under the tab bar or Save bar');
      });
    }
  }

  // ---------- 3. Account footer links ----------
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await check(v.width + 'px 3. Account footer links have at least 4.5:1 contrast and 24px targets', async () => {
      const x = await fixture(v, '#account'); await x.page.locator('#p-account.on').waitFor();
      const links = await x.page.evaluate(() => {
        const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(n => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bg = el => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
        return [...document.querySelectorAll('.desk-account-privacy a')].filter(a => a.getClientRects().length).map(a => { const fg = lum(getComputedStyle(a).color), b = lum(bg(a)), r = a.getBoundingClientRect(); return { text: a.textContent.trim(), contrast: +((Math.max(fg, b) + 0.05) / (Math.min(fg, b) + 0.05)).toFixed(2), height: Math.round(r.height), width: Math.round(r.width) }; });
      });
      assert.ok(links.length >= 2, 'footer links found ' + JSON.stringify(links));
      for (const link of links) { assert.ok(link.contrast >= 4.5, 'contrast ' + JSON.stringify(link)); assert.ok(link.height >= 24 && link.width >= 24, 'target ' + JSON.stringify(link)); }
      if (v.width === 390) { await x.page.locator('.desk-account-privacy').scrollIntoViewIfNeeded(); await shot(x.page, 'account-footer-390'); await noHorizontalScroll(x.page); }
    });
  }

  // ---------- 4. Practice chat announcements ----------
  const announcers = (entries, pattern) => [...new Set(entries.filter(e => pattern.test(e.text)).map(e => e.region))];
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await check(v.width + 'px 4. each practice-chat state is announced by one live region, and the conversation log keeps the messages', async () => {
      const x = await fixture(v, '#test'); await x.page.locator('#chatIn').waitFor({ state: 'visible' }); await x.page.waitForFunction(() => document.querySelectorAll('#msgs .b.a').length > 0);
      await x.page.evaluate(() => { window.__live = []; });
      await x.page.locator('#chatIn').fill('How much is drain cleaning?'); await x.page.locator('#chatIn').press('Enter');
      await x.page.waitForFunction(() => document.getElementById('chatForm').getAttribute('aria-busy') === 'false' && /Reply received/.test(document.getElementById('chatStatus').textContent), null, { timeout: 15000 });
      let live = await x.page.evaluate(() => window.__live);
      for (const phrase of [/Preparing your reply/, /Reply received/]) assert.ok(announcers(live, phrase).length <= 1, phrase + ' announced by ' + JSON.stringify(announcers(live, phrase)));
      assert.ok(announcers(live, /How much is drain cleaning/).includes('msgs'), 'the question is in the conversation log');
      await x.page.evaluate(() => { window.__live = []; }); x.state.chatFault = 503;
      await x.page.locator('#chatIn').fill('Do you clear sewer lines?'); await x.page.locator('#chatIn').press('Enter');
      await x.page.waitForFunction(() => document.getElementById('chatForm').getAttribute('aria-busy') === 'false' && /unavailable/.test(document.getElementById('msgs').innerText), null, { timeout: 15000 });
      live = await x.page.evaluate(() => window.__live);
      assert.equal(announcers(live, /AI service is unavailable/).length, 1, 'error announced by ' + JSON.stringify(announcers(live, /AI service is unavailable/)));
      assert.ok(announcers(live, /AI service is unavailable/).includes('msgs'), 'the error stays in the conversation log');
      assert.match(await x.page.locator('#testPreview').innerText(), /unavailable/, 'the visible result panel still shows the outcome');
      if (v.width === 390) { await shot(x.page, 'practice-error-390'); await noHorizontalScroll(x.page); }
    });
  }

  // ---------- 5. Page-change cues ----------
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await check(v.width + 'px 5. a page change focuses the page heading and names the page in the document title', async () => {
      const x = await fixture(v); assert.equal(await x.page.title(), 'Home | Your front desk | Machines & Cloud');
      const nav = tab => x.page.locator('.tabs button[data-t="' + tab + '"]:visible').first();
      await nav('leads').focus(); await x.page.keyboard.press('Enter'); await x.page.locator('#p-leads.on').waitFor();
      assert.equal((await focused(x.page)).id, 'pageTitle'); assert.equal(await x.page.title(), 'Inbox | Your front desk | Machines & Cloud');
      await nav('availability').click(); await x.page.locator('#p-availability.on').waitFor(); assert.equal((await focused(x.page)).id, 'pageTitle'); assert.equal(await x.page.title(), 'Schedule | Your front desk | Machines & Cloud');
      if (v.width === 390) await shot(x.page, 'page-heading-focus-390');
      await x.page.goBack(); await x.page.locator('#p-leads.on').waitFor(); assert.equal(await x.page.title(), 'Inbox | Your front desk | Machines & Cloud');
    });
  }

  // ---------- 6. Browser Back during the Quick tour ----------
  const tourButton = page => page.locator('#openGuide:visible, button:visible:has-text("Quick tour")').first();
  for (const v of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await check(v.width + 'px 6. Back during the Quick tour closes it and returns to the page it was opened from, with no extra entries', async () => {
      const x = await fixture(v); await x.page.locator('.tabs button[data-t="leads"]:visible').first().click(); await x.page.locator('#p-leads.on').waitFor();
      await tourButton(x.page).click(); await x.page.waitForFunction(() => document.getElementById('guideDialog').dataset.tourReady === 'true');
      await x.page.locator('#tourNext').click(); await x.page.waitForFunction(() => document.getElementById('guideDialog').dataset.tourStep === '2');
      await x.page.goBack(); await x.page.waitForFunction(() => !document.getElementById('guideDialog').open);
      await x.page.waitForTimeout(200); assert.equal(await x.page.evaluate(() => document.body.dataset.activePage), 'leads'); assert.equal(new URL(x.page.url()).hash, '#leads');
      if (v.width === 390) await shot(x.page, 'tour-back-390');
      // Closing in the page leaves no tour entry behind: the next Back goes to Home.
      await tourButton(x.page).click(); await x.page.waitForFunction(() => document.getElementById('guideDialog').dataset.tourReady === 'true');
      await x.page.locator('#tourNext').click(); await x.page.waitForFunction(() => document.getElementById('guideDialog').dataset.tourStep === '2');
      await x.page.keyboard.press('Escape'); await x.page.waitForFunction(() => !document.getElementById('guideDialog').open); await x.page.waitForTimeout(200);
      assert.equal(await x.page.evaluate(() => document.body.dataset.activePage), 'leads');
      await x.page.waitForTimeout(300); const f = await focused(x.page); assert.ok(!f.body && f.visible, 'focus after closing the tour in the page: ' + JSON.stringify(f));
      await x.page.goBack(); await x.page.waitForFunction(() => document.body.dataset.activePage === 'today');
    });
  }

  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close();
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, failing: report.checks.filter(c => !c.pass).map(c => c.name) };
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary), JSON.stringify(report.served));
}
