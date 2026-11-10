// Business details save recovery: actual owner handlers and browser assets; memory storage, fake model, no server or external transport.
// Run from the worktree root: node qa-artifacts/claude-collaboration/desk-details-save-recovery-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-save-<name>.json
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const output = option('--output'), playwrightPath = option('--playwright') || process.env.MC_PLAYWRIGHT_MODULE;
if (output && (!/^scratchpad\/claude-save-[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error('Choose a new --output scratchpad/claude-save-name.json');
if (!playwrightPath) throw new Error('Use installed Playwright via --playwright /path/to/playwright/index.mjs. This check never installs tooling.');
const root = resolve('.'), origin = 'http://127.0.0.1:8919';
if (!existsSync(resolve(root, 'desk.js'))) throw new Error('Run from the worktree root.');
// --desk-source serves an alternate desk.js (for example the base revision) without touching the worktree.
const deskSource = option('--desk-source') ? resolve(option('--desk-source')) : null;
const lib = path => pathToFileURL(resolve(root, path)).href;
// Only files this check's author owns; other agents may edit the rest of the worktree concurrently.
const files = ['desk.js', 'qa-artifacts/claude-collaboration/desk-details-save-recovery-ui-check.mjs'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(resolve(root, file)))]));
const report = { at: new Date().toISOString(), browser: process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome', deskSource: option('--desk-source') || 'desk.js', qualifications: 'Synthetic workspace and session; actual local /api/client and /api/access handlers and browser assets; memory storage; fake model. Lost responses are simulated with route.abort after (or before) the actual handler runs. No model/provider/email/OAuth/purchase/deployment performed.', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Save recovery check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { report.backgroundRequests = (report.backgroundRequests || []).concat({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };
const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
const handlers = { '/api/client': (await import(lib('netlify/functions/client.mjs'))).default, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default, '/api/workspace-billing': (await import(lib('netlify/functions/workspace-billing.mjs'))).default };
const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const contexts = []; let serial = 0;

async function fixture(viewport) {
  const slug = 'details-save-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Details Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'voice'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm'); c.phone.businessNumber = '';
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  const state = { requests: [], putFault: null };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action, at: state.requests.length }; state.requests.push(item); report.requests.push(item);
      // Lost before the handler: the save never reaches the backend.
      if (method === 'PUT' && state.putFault === 'before') { state.putFault = null; item.fixture = 'lost-before-handler'; item.status = 'aborted'; return route.abort('failed'); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' }); item.status = response.status;
      const buffer = Buffer.from(await response.arrayBuffer());
      // Lost after the handler: the backend saved it, the browser never sees the response.
      if (method === 'PUT' && state.putFault === 'after') { state.putFault = null; item.fixture = 'lost-after-handler'; item.lostAfterEffect = true; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buffer });
    }
    if (deskSource && url.pathname === '/desk.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(deskSource) });
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/desk.html?c=' + slug + '#account'); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: 'know' } })));
  await page.evaluate(() => { document.getElementById('contactDetails').open = true; });
  await page.locator('#phoneBusinessNumber').waitFor({ state: 'visible' });
  await page.waitForFunction(() => ['saved', 'incomplete'].includes(document.getElementById('cfg').dataset.saveState));
  return { page, c, state, context, width: viewport.width };
}
async function check(name, run) { const start = contexts.length; try { await run(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); } catch (error) { report.checks.push({ name, pass: false, error: error.stack }); const page = contexts.at(-1)?.pages().at(-1); if (page) { report.checks.at(-1).pageState = await page.evaluate(() => ({ saveState: document.getElementById('cfg').dataset.saveState, saveMsg: document.getElementById('saveMsg').textContent, conflict: document.getElementById('cfgConflictPanel').hidden ? null : document.getElementById('cfgConflictPanel').innerText })).catch(() => null); await shot(page, 'failure-' + report.checks.length).catch(() => {}); } console.log('FAIL ' + name + ': ' + error.message); } finally { await Promise.all(contexts.slice(start).map(context => context.close())); } }
async function shot(page, name) { if (!output) return; const path = output.replace(/\.json$/, '-' + name + '.png'); await page.screenshot({ path }); report.screenshots = (report.screenshots || []).concat(path); }
async function noHorizontalScroll(page) { const v = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(v.document <= v.viewport + 1, 'Horizontal scroll ' + JSON.stringify(v)); }
const stored = x => store.get('clients', x.c.slug);
const puts = x => x.state.requests.filter(r => r.method === 'PUT');
const gets = x => x.state.requests.filter(r => r.method === 'GET' && r.path === '/api/client');
const settled = page => page.waitForFunction(() => { const f = document.getElementById('cfg'); return f.getAttribute('aria-busy') === 'false' && f.dataset.saveState !== 'saving' && !/Checking/.test(document.getElementById('saveMsg').textContent); });
async function saveAfter(x, count) { await x.page.locator('#saveCfg').click(); for (let i = 0; i < 100 && puts(x).length < count; i++) await x.page.waitForTimeout(50); assert.equal(puts(x).length, count, 'PUT count'); await settled(x.page); }
async function noRawTransport(page) { const text = await page.locator('body').innerText(); assert.doesNotMatch(text, /Failed to fetch|NetworkError|Load failed|TypeError|signal is aborted/i, 'Raw transport error text reached the owner'); }
const saveState = page => page.locator('#cfg').getAttribute('data-save-state');
const saveMsg = page => page.locator('#saveMsg').innerText();
async function concurrentWrite(x, number) { await store.atomicUpdate('clients', x.c.slug, c => ({ value: { ...c, phone: { ...c.phone, businessNumber: number }, updatedAt: new Date().toISOString() } })); }

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = viewport.width;
    await check(w + 'px lost response after the save is confirmed by re-reading the saved workspace', async () => {
      const x = await fixture(viewport);
      await x.page.locator('#phoneBusinessNumber').fill('(713) 555-0110');
      x.state.putFault = 'after'; const before = gets(x).length;
      await saveAfter(x, 1);
      assert.equal(puts(x)[0].status, 200, 'handler saved it'); assert.equal(puts(x)[0].lostAfterEffect, true);
      assert.equal((await stored(x)).phone.businessNumber, '+17135550110');
      await noRawTransport(x.page);
      assert.ok(gets(x).length > before, 'UI re-read the saved workspace after the lost response');
      assert.ok(['saved', 'incomplete'].includes(await saveState(x.page)), 'save state ' + await saveState(x.page) + ': ' + await saveMsg(x.page));
      assert.match(await saveMsg(x.page), /saved/i); assert.doesNotMatch(await saveMsg(x.page), /not saved|changed elsewhere|could not/i);
      assert.equal(await x.page.locator('#cfgConflictPanel').isVisible(), false, 'no conflict panel');
      await noHorizontalScroll(x.page); await x.page.locator('#saveMsg').scrollIntoViewIfNeeded(); await shot(x.page, 'confirmed-' + w);
      // The confirmed save leaves the page on the current revision: the next edit saves without a conflict.
      await x.page.locator('#contactDetails input[name="owner.name"]').fill('Alex Fixture Jr');
      await saveAfter(x, 2);
      assert.equal(puts(x)[1].status, 200, 'next save is accepted, not 409');
      assert.equal((await stored(x)).owner.name, 'Alex Fixture Jr');
      assert.equal(await x.page.locator('#cfgConflictPanel').isVisible(), false);
    });
    await check(w + 'px lost response before the save reports not saved and keeps the edits', async () => {
      const x = await fixture(viewport);
      await x.page.locator('#phoneBusinessNumber').fill('(713) 555-0110');
      x.state.putFault = 'before';
      await saveAfter(x, 1);
      assert.equal((await stored(x)).phone.businessNumber || '', '', 'nothing was saved');
      await noRawTransport(x.page);
      assert.equal(await x.page.locator('#phoneBusinessNumber').inputValue(), '(713) 555-0110', 'edits kept');
      assert.match(await saveMsg(x.page), /not saved/i, 'honest not-saved message');
      assert.equal(await x.page.locator('#cfgConflictPanel').isVisible(), false, 'no conflict for an unsaved change');
      assert.equal(await x.page.locator('#saveCfg').isDisabled(), false, 'owner can save again');
      await noHorizontalScroll(x.page); await x.page.locator('#saveMsg').scrollIntoViewIfNeeded(); await shot(x.page, 'not-saved-' + w);
      await saveAfter(x, 2);
      assert.equal(puts(x)[1].status, 200); assert.equal((await stored(x)).phone.businessNumber, '+17135550110');
      assert.ok(['saved', 'incomplete'].includes(await saveState(x.page)));
    });
    await check(w + 'px a phone-format-only difference from the latest saved version is not a conflict', async () => {
      const x = await fixture(viewport);
      await x.page.locator('#phoneBusinessNumber').fill('(713) 555-0110');
      await concurrentWrite(x, '+17135550110');
      await saveAfter(x, 1);
      assert.equal(puts(x)[0].status, 409);
      await noRawTransport(x.page);
      if (await x.page.locator('#cfgCheckLatest').isVisible()) { await x.page.locator('#cfgCheckLatest').click(); await settled(x.page); }
      const rows = await x.page.locator('#cfgConflictFields').innerText();
      assert.doesNotMatch(rows, /Existing business line/, 'equivalent phone number shown as a conflict: ' + rows);
      assert.equal(await x.page.locator('#cfgConflictPanel').isVisible(), false, 'no conflict panel');
      assert.ok(['saved', 'incomplete'].includes(await saveState(x.page)), 'save state ' + await saveState(x.page) + ': ' + await saveMsg(x.page));
      assert.equal((await stored(x)).phone.businessNumber, '+17135550110');
      await noHorizontalScroll(x.page); await x.page.locator('#saveMsg').scrollIntoViewIfNeeded(); await shot(x.page, 'equivalent-' + w);
      await x.page.locator('#contactDetails input[name="owner.name"]').fill('Alex Fixture Sr');
      await saveAfter(x, 2); assert.equal(puts(x)[1].status, 200, 'next save accepted');
    });
    await check(w + 'px a real concurrent change still shows a conflict with both values', async () => {
      const x = await fixture(viewport);
      await x.page.locator('#phoneBusinessNumber').fill('(713) 555-0110');
      await concurrentWrite(x, '+17135550199');
      await saveAfter(x, 1);
      assert.equal(puts(x)[0].status, 409);
      await noRawTransport(x.page);
      assert.equal(await saveState(x.page), 'conflict');
      await x.page.locator('#cfgCheckLatest').click(); await settled(x.page);
      const rows = await x.page.locator('#cfgConflictFields').innerText();
      assert.match(rows, /Existing business line/); assert.match(rows, /555.?0199/); assert.match(rows, /555.?0110/);
      assert.equal(await x.page.locator('#cfgKeepEdits').isVisible(), true);
      assert.equal(await x.page.locator('#phoneBusinessNumber').inputValue(), '(713) 555-0110', 'edits kept');
      assert.equal((await stored(x)).phone.businessNumber, '+17135550199', 'other write kept');
      await noHorizontalScroll(x.page); await x.page.locator('#cfgConflictPanel').scrollIntoViewIfNeeded(); await shot(x.page, 'real-conflict-' + w);
    });
  }
  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, total: report.checks.length, physicalNetwork: report.physicalNetwork, pageErrors: report.pageErrors.length };
  if (output) writeFileSync(resolve(root, output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, ...report.summary, sourceStable: report.sourceStable, failures: report.checks.filter(c => !c.pass).map(c => ({ name: c.name, error: c.error.split('\n')[0] })) }));
  if (report.summary.failed || !report.sourceStable) process.exitCode = 1;
}
