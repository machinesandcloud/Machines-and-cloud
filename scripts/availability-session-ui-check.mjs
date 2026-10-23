// Actual owner handlers and browser assets; memory storage, no server or external transport.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const output = option('--output'), playwrightPath = option('--playwright') || process.env.MC_PLAYWRIGHT_MODULE;
if (output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error('Choose a new --output scratchpad/name.json');
const root = resolve('.'), origin = 'https://availability-session.fixture.invalid';
const files = ['desk.js', 'desk.html', 'desk.css', 'netlify/functions/client.mjs', 'netlify/functions/lib/store.mjs', 'netlify/functions/lib/access.mjs'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(file))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers, memory storage and intercepted browser assets; no physical/model/provider requests', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Availability session check forbids physical transport'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
let playwright;
if (playwrightPath) playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
else {
  try { playwright = await import('playwright'); }
  catch { for (const bin of (process.env.PATH || '').split(delimiter)) { const path = resolve(bin, '../playwright/index.mjs'); if (existsSync(path)) { playwright = await import(pathToFileURL(path).href); break; } } }
}
if (!playwright) throw new Error('Use installed Playwright via --playwright /path/to/playwright/index.mjs or MC_PLAYWRIGHT_MODULE. This check never installs tooling.');
const store = await import('../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../netlify/functions/lib/config.mjs');
const handlers = { '/api/client': (await import('../netlify/functions/client.mjs')).default, '/api/access': (await import('../netlify/functions/access.mjs')).default };
const date = days => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000));
const firstDate = date(4), nextDate = date(5); let serial = 0;
const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const contexts = [];
async function fixture(width = 390) {
  const slug = 'availability-session-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Availability Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(6000);
  await context.addInitScript(({ origin, slug, token }) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen');
    const original = window.fetch; window.availabilityGates = []; window.holdAvailability = null;
    window.fetch = async function (input, options) {
      let body; try { body = JSON.parse(options?.body); } catch {}
      const hold = body?.action?.startsWith('availability_') && window.holdAvailability;
      // Deliberately ignore cancellation for held fixtures, proving the generation fence too.
      const response = await original(input, hold ? { ...options, signal: undefined } : options);
      if (!hold) return response;
      if (hold === 'body') { const json = response.json.bind(response); response.json = async function () { const value = await json(); await new Promise(release => window.availabilityGates.push(release)); return value; }; return response; }
      await new Promise(release => window.availabilityGates.push(release)); if (hold === 'error') throw new TypeError('Explicit lost transport response'); return response;
    };
  }, { origin, slug, token });
  const state = { fault: null, failSignout: false, requests: [] };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action, date: body?.date, window: body?.window }; state.requests.push(item); report.requests.push(item);
      if (action?.startsWith('availability_') && state.fault) {
        const fault = state.fault; state.fault = null; item.fixture = fault;
        if (fault === 'network') { item.status = 'aborted'; return route.abort('failed'); }
        if (fault === 'malformed') { item.status = 200; return route.fulfill({ status: 200, contentType: 'text/plain', body: 'not JSON' }); }
        if (fault === 'auth-empty') { item.status = 401; return route.fulfill({ status: 401, contentType: 'text/plain', body: '' }); }
        item.status = fault; return route.fulfill({ status: fault, contentType: 'application/json', body: JSON.stringify({ error: fault === 409 ? 'configuration_changed' : 'availability_unavailable', message: fault === 409 ? 'The saved schedule changed. Reload availability before trying again.' : 'The schedule could not be confirmed.' }) });
      }
      if (action === 'sign_out' && state.failSignout) { state.failSignout = false; item.status = 503; item.fixture = 'signout503'; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"explicit_signout_failure"}' }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' }); item.status = response.status;
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/desk.html?c=' + slug + '#availability'); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, c, token, state, context };
}
async function submit(x, value = firstDate, window = '8 to 12') { await x.page.locator('#availabilityDate').fill(value); await x.page.locator('#availabilityWindow').selectOption(window); await x.page.locator('#availabilitySubmit').click(); }
async function settled(x) { await x.page.waitForFunction(() => document.getElementById('availabilityForm')?.getAttribute('aria-busy') === 'false'); }
async function cleaned(x) { await x.page.waitForFunction(() => document.body.dataset.workspaceState === 'recovery'); assert.equal(await x.page.locator('#portalContent').innerHTML(), ''); assert.equal(await x.page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1')), null); assert.equal(await x.page.locator('#deskRail').isVisible(), false); }
async function check(name, run) { const start = contexts.length; try { await run(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.stack }); } finally { await Promise.all(contexts.slice(start).map(context => context.close())); } }
try {
  for (const width of [320, 390, 1440]) await check('Actual expired-session401 clears private state at ' + width, async () => { const x = await fixture(width), row = await store.get('access_sessions', accessHash(x.token)); await store.put('access_sessions', accessHash(x.token), { ...row, expiresAt: new Date(Date.now() - 1000).toISOString() }); await submit(x); await cleaned(x); assert.ok(x.state.requests.some(row => row.action === 'availability_block' && row.status === 401)); assert.deepEqual(await store.getAvailabilityBlocks(x.c), []); });
  await check('Actual replaced-owner403 on unblock clears state and keeps its saved block', async () => { const x = await fixture(); await submit(x); await settled(x); await store.put('clients', x.c.slug, { ...x.c, owner: { ...x.c.owner, email: 'replacement@example.test' } }); await x.page.locator('.availability-remove').click(); await cleaned(x); assert.ok(x.state.requests.some(row => row.action === 'availability_unblock' && row.status === 403)); const saved = await store.get('index', store.capacityKey(x.c)); assert.ok(saved.blocks.some(row => row.date === firstDate && row.window === '8 to 12')); });
  await check('Empty auth response is handled before JSON parsing', async () => { const x = await fixture(); x.state.fault = 'auth-empty'; await submit(x); await cleaned(x); });
  for (const fault of [409, 503, 'network', 'malformed']) await check('Non-auth ' + fault + ' retains draft and confirmed blocks, then permits deliberate retry', async () => { const x = await fixture(); await submit(x); await settled(x); x.state.fault = fault; await submit(x, nextDate, '12 to 5'); await settled(x); assert.equal(await x.page.locator('#availabilityDate').inputValue(), nextDate); assert.equal(await x.page.locator('#availabilityWindow').inputValue(), '12 to 5'); assert.equal(await x.page.locator('.availability-row').count(), 1); assert.match(await x.page.locator('#availabilityMessage').innerText(), /still here/); assert.equal(await x.page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1')), x.token); await x.page.locator('#availabilitySubmit').click(); await settled(x); assert.equal(await x.page.locator('.availability-row').count(), 2); });
  for (const hold of ['response', 'body', 'error']) await check('Late ' + hold + ' after canonical expiry cannot restore private state', async () => { const x = await fixture(); await x.page.evaluate(mode => { window.holdAvailability = mode; }, hold); await submit(x); await x.page.waitForFunction(() => window.availabilityGates.length === 1); await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:session-expired'))); await cleaned(x); await x.page.evaluate(() => window.availabilityGates[0]()); await x.page.waitForTimeout(30); await cleaned(x); });
  await check('Pending request deduplicates keyboard submissions and preserves newer typing', async () => { const x = await fixture(320); await x.page.evaluate(() => { window.holdAvailability = 'response'; }); await x.page.locator('#availabilityDate').fill(firstDate); await x.page.locator('#availabilityWindow').selectOption('8 to 12'); await x.page.locator('#availabilitySubmit').focus(); await x.page.keyboard.press('Enter'); await x.page.waitForFunction(() => window.availabilityGates.length === 1); await x.page.evaluate(() => { document.getElementById('availabilityForm').requestSubmit(); document.getElementById('availabilityForm').requestSubmit(); }); await x.page.locator('#availabilityDate').fill(nextDate); await x.page.locator('#availabilityWindow').selectOption('12 to 5'); assert.equal(x.state.requests.filter(row => row.action === 'availability_block').length, 1); await x.page.evaluate(() => window.availabilityGates[0]()); await settled(x); assert.equal(await x.page.locator('#availabilityDate').inputValue(), nextDate); assert.equal(await x.page.locator('#availabilityWindow').inputValue(), '12 to 5'); assert.match(await x.page.locator('#availabilityMessage').innerText(), /8 to 12/); assert.doesNotMatch(await x.page.locator('#availabilityMessage').innerText(), /12 to 5/); });
  await check('Failed signout frees controls; obsolete completion cannot unlock a newer request', async () => { const x = await fixture(); await x.page.evaluate(() => { window.holdAvailability = 'response'; }); await submit(x); await x.page.waitForFunction(() => window.availabilityGates.length === 1); x.state.failSignout = true; await x.page.locator('#deskSignOut').click(); await x.page.waitForFunction(() => document.getElementById('toast').textContent.includes('Sign out could not')); assert.equal(await x.page.locator('#availabilitySubmit').isEnabled(), true); await submit(x, nextDate, '12 to 5'); await x.page.waitForFunction(() => window.availabilityGates.length === 2); await x.page.evaluate(() => window.availabilityGates[0]()); await x.page.waitForTimeout(30); assert.equal(await x.page.locator('#availabilitySubmit').isDisabled(), true); assert.equal(await x.page.locator('#availabilityForm').getAttribute('aria-busy'), 'true'); await x.page.evaluate(() => window.availabilityGates[1]()); await settled(x); assert.equal(await x.page.locator('.availability-row').count(), 2); });
  await check('Successful signout ignores a late accepted availability response', async () => { const x = await fixture(); await x.page.evaluate(() => { window.holdAvailability = 'response'; }); await submit(x); await x.page.waitForFunction(() => window.availabilityGates.length === 1); await x.page.locator('#deskSignOut').click(); await cleaned(x); await x.page.evaluate(() => window.availabilityGates[0]()); await x.page.waitForTimeout(30); await cleaned(x); assert.equal((await store.get('access_sessions', accessHash(x.token))).status, 'revoked'); });
} finally {
  await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter); report.summary = { passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length };
  if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, ...report.summary, sourceStable: report.sourceStable, physicalNetwork: report.physicalNetwork, pageErrors: report.pageErrors.length, forbidden: report.forbidden.length }));
  if (report.summary.failed) console.log(JSON.stringify(report.checks.filter(row => !row.pass)));
  if (report.summary.failed || !report.sourceStable || report.physicalNetwork || report.pageErrors.length || report.forbidden.length) process.exitCode = 1;
}
