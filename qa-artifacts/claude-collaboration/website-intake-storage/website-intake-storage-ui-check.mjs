// Website chat guided setup when browser storage is unavailable or throws (card AUTO-REVIEW-6F92E1DED504D2D7).
// Actual owner handlers in-process (routed by each module's config.path via context.route), memory store, fake model,
// provider env deleted, all non-loopback transport denied, Playwright-served worktree files. No shared server, provider,
// email, OAuth or purchase. A synthetic PLATFORM_DATA_ENCRYPTION_KEY is set (as connector-pages-ui-check does) so private
// connection details can be saved in memory; it is not a provider credential.
//
// Storage modes, installed by addInitScript and switched on with window.__mcStorage(mode):
//   security: window.sessionStorage / window.localStorage getters throw SecurityError (site data blocked mid-session);
//   methods:  Storage.prototype getItem/setItem/removeItem/key/clear throw SecurityError;
//   quota:    Storage.prototype.setItem throws QuotaExceededError (reads still work) - control case.
// The owner signs in normally (session in sessionStorage at load, as desk.js requires), then storage fails.
//
// --serve <fix|base|weak> chooses the desk-service-intake.js bytes served:
//   fix  = this worktree's file; base = `git show dfb0ae78:desk-service-intake.js`;
//   weak = the fix with its identity guard removed (always uses the in-memory session even when readable storage says
//          the session was removed) - the identity-guard check must catch it.
// Usage (from the worktree root):
//   MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell> node qa-artifacts/claude-collaboration/website-intake-storage/website-intake-storage-ui-check.mjs \
//     --playwright <playwright/index.mjs> --serve fix --output scratchpad/claude-webstore-<name>.json [--only <substring>]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), origin = 'http://127.0.0.1:8937';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), serve = arg('--serve') || 'fix', only = arg('--only');
const playwrightPath = arg('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
if (!output || !/^scratchpad\/claude-webstore-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-webstore-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
if (!['fix', 'base', 'weak'].includes(serve)) throw new Error('--serve fix|base|weak');
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const BASE = 'dfb0ae7846e66871d849c67566bf9d3b475f46ae', INTAKE = 'desk-service-intake.js';

// ---------- served bytes ----------
const fixBytes = readFileSync(INTAKE);
const baseBytes = execFileSync('git', ['show', BASE + ':' + INTAKE]);
function weakBytes() {
  const text = fixBytes.toString('utf8');
  const guard = "if(stored!==undefined&&stored!==owner)owner=null;";
  if (!text.includes(guard)) throw new Error('Weak variant: identity guard text not found in the fix');
  return Buffer.from(text.replace(guard, ''), 'utf8');
}
const intakeBytes = serve === 'base' ? baseBytes : serve === 'weak' ? weakBytes() : fixBytes;
const watched = ['desk.html', 'desk.js', 'desk-setup-guide.js', 'desk-connections.js', 'desk-website-install.js', INTAKE, 'netlify/functions/client.mjs', 'qa-artifacts/claude-collaboration/website-intake-storage/website-intake-storage-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), card: 'AUTO-REVIEW-6F92E1DED504D2D7', serve, base: BASE, head: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
  mode: 'Actual owner handlers in-process via context.route, memory store, fake model, empty provider env, physical transport denied',
  intakeServedSha256: sha(intakeBytes), intakeBaseSha256: sha(baseBytes), intakeWorktreeSha256: sha(fixBytes), servedJs: {}, sourceBefore: hashes(),
  checks: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0, observations: [] };

// ---------- offline environment ----------
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin, PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
const deny = () => { report.physicalNetwork++; throw new Error('Website storage check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../netlify/functions/lib/config.mjs');
const { configurationRevision } = await import('../../../netlify/functions/lib/setup.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect', 'google', 'chat', 'website-installation']) {
  const mod = await import('../../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
report.handlers = Object.keys(handlers);

const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browser = { engine: 'chromium', launch: process.env.MC_PLAYWRIGHT_EXECUTABLE ? 'executablePath ' + process.env.MC_PLAYWRIGHT_EXECUTABLE : 'channel:chrome', version: browser.version(), profile: 'Playwright temporary profile (browser.newContext)' };
let serial = 0; const contexts = [];
const SITE = 'https://fixture-shop.example.com', KEY = 'mc-onboarding-session-v1';
function reviewed(c) { const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: 'live' }; }

async function seed(width) {
  const slug = 'webstore-' + ++serial + '-' + width, token = sha('webstore-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Website Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: SITE } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm'); reviewed(c);
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, c, width };
}

// Installed before any page script. The owner's session is present at load; storage fails only when switched on.
function storageShim({ origin, slug, token, start }) {
  if (location.origin !== origin) return;
  if (!sessionStorage.getItem('mc-onboarding-session-v1')) sessionStorage.setItem('mc-onboarding-session-v1', token);
  localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen');
  const proto = Storage.prototype, native = { getItem: proto.getItem, setItem: proto.setItem, removeItem: proto.removeItem, key: proto.key, clear: proto.clear };
  const security = () => new DOMException("Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.", 'SecurityError');
  window.__mcStorageEvents = [];
  window.__mcStorage = function (mode) {
    window.__mcStorageMode = mode;
    if (mode === 'security') for (const name of ['sessionStorage', 'localStorage']) Object.defineProperty(window, name, { configurable: true, get() { window.__mcStorageEvents.push('get ' + name); throw security(); } });
    if (mode === 'methods') for (const name of Object.keys(native)) proto[name] = function () { window.__mcStorageEvents.push(name); throw security(); };
    if (mode === 'quota') proto.setItem = function () { window.__mcStorageEvents.push('setItem'); throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
  };
  if (start) window.__mcStorage(start);
}

async function open(x, { height = 900, hash = '#setup', start = null } = {}) {
  const { slug, token, width } = x;
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(7000);
  await context.addInitScript(storageShim, { origin, slug, token, start });
  const state = x.state || (x.state = { lose: null, requests: [] });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      const action = body?.action, headers = request.headers();
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const auth = headers.authorization || '', item = { slug, path: url.pathname, query: url.search, method, action, service: body?.service, auth: auth === 'Bearer ' + token ? 'owner' : auth ? 'other:' + auth.slice(0, 16) : 'none', submissionId: body?.submissionId };
      state.requests.push(item); report.requests.push(item);
      const response = await handlers[url.pathname](new Request(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      item.status = response.status; const bytes = Buffer.from(await response.arrayBuffer());
      // Lost response: the actual handler has already processed (and saved) the change; the browser sees a network failure.
      if (method !== 'GET' && state.lose && state.lose(body, item)) { state.lose = null; item.lostAfterEffect = true; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\//, ''), path = resolve(root, rel);
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const body = rel === INTAKE ? intakeBytes : readFileSync(path);
    if (extname(path) === '.js') report.servedJs[rel] = sha(body);
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', body });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  await page.goto(origin + '/desk.html?c=' + slug + hash);
  Object.assign(x, { page, context });
  return x;
}

// ---------- helpers ----------
async function check(name, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length, t0 = Date.now();
  try { await run(); report.checks.push({ name, pass: true, ms: Date.now() - t0 }); console.log('PASS ' + name); }
  catch (error) {
    const entry = { name, pass: false, ms: Date.now() - t0, error: String(error.stack || error).slice(0, 2500) }; report.checks.push(entry); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]);
    const page = contexts.at(-1)?.pages().at(-1);
    if (page) { entry.state = await snapshot(page).catch(() => null); entry.screenshot = await shot(page, 'failure-' + report.checks.length).catch(() => null); }
  } finally { await Promise.all(contexts.slice(start).map(context => context.close().catch(() => {}))); }
}
async function shot(page, name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); return path; }
async function snapshot(page) {
  return page.evaluate(() => ({ hash: location.hash, workspace: document.body.dataset.workspaceState, focus: document.activeElement?.id || document.activeElement?.tagName, intakeTitle: document.getElementById('intakeStepTitle')?.textContent, intakeStatus: document.getElementById('intakeStatus')?.textContent, storageMode: window.__mcStorageMode, storageEvents: (window.__mcStorageEvents || []).slice(-12), text: document.getElementById('setupGuide')?.innerText.slice(0, 1500) }));
}
const ready = page => page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
const posts = (x, action) => x.state.requests.filter(r => r.method !== 'GET' && (!action || r.action === action));
async function dto(x) { const r = await handlers['/api/client'](new Request(origin + '/api/client?c=' + x.slug + '&service_intake=1', { headers: { origin, authorization: 'Bearer ' + x.token } }), { ip: '192.0.2.71' }); assert.equal(r.status, 200); return r.json(); }
async function client(x) { const r = await handlers['/api/client'](new Request(origin + '/api/client?c=' + x.slug, { headers: { origin, authorization: 'Bearer ' + x.token } }), { ip: '192.0.2.71' }); assert.equal(r.status, 200); return r.json(); }
async function noHorizontalScroll(page, where) { const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth })); assert.ok(v.doc <= v.vw + 1, 'Horizontal scroll at ' + where + ': ' + JSON.stringify(v)); }
async function openService(page, id) {
  await page.locator('[data-guide-service="' + id + '"]').click();
  await page.waitForFunction(id => document.getElementById('setupGuide')?.dataset.connectorView === 'step' && document.getElementById('setupGuide').dataset.guideSelectedService === id && !!document.getElementById('setupGuideStageTitle'), id);
}
const INTAKE_LOST = 'The response was interrupted. Your details may be saved. Check the saved result before continuing.';
const CLAIM_TEXT = /(?<!not been |not |n’t )\bconnected\b|\bis live\b|\bgo live\b|\bdelivered\b|\bverified\b|\bactivated\b|Connection verified/i;
const breakStorage = (page, mode) => page.evaluate(mode => window.__mcStorage(mode), mode);
async function storageBroken(page, mode) {
  const probe = await page.evaluate(() => { try { sessionStorage.getItem('mc-onboarding-session-v1'); return 'readable'; } catch (error) { return error.name; } });
  if (mode !== 'quota') assert.equal(probe, 'SecurityError', 'Storage really throws on read');
  else assert.equal(await page.evaluate(() => { try { sessionStorage.setItem('x', '1'); return 'written'; } catch (error) { return error.name; } }), 'QuotaExceededError');
}
// Ordinary guided setup to the website details step; storage fails at `when` ('before-open' | 'after-open').
async function toDetails(x, mode, when) {
  const { page } = x; await ready(page);
  if (when === 'before-open') { await breakStorage(page, mode); await storageBroken(page, mode); }
  await page.locator('#setupGuide[data-connector-view="overview"] [data-guide-service]').first().waitFor();
  await openService(page, 'web');
  await page.locator('#connectorStart').click();
  await page.waitForFunction(() => location.hash === '#setup/web/details-0');
  await page.waitForFunction(() => !!document.getElementById('intakeStepTitle') || !!document.getElementById('intakeOpeningStatus'), null, { timeout: 5000 }).catch(() => {});
  const st = await snapshot(page); report.observations.push({ check: x.slug, step: 'details-0 opened', mode, when, ...st });
  assert.equal(await page.locator('#intakeStepTitle').textContent(), 'Where will your website chat live?', 'Website details step opens: ' + JSON.stringify(st));
  assert.equal(await page.locator('#intake-website').inputValue(), SITE);
  await page.selectOption('#intake-builder', { label: 'Wix' }); await page.selectOption('#intake-installationBy', { label: 'I do' });
  if (when === 'after-open') { await breakStorage(page, mode); await storageBroken(page, mode); }
  assert.equal(await page.locator('#intakeContinue').textContent(), 'Save website and continue');
}
async function savedAndNext(x, where) {
  const { page } = x;
  await page.waitForFunction(() => location.hash === '#setup/web/details-1-0', null, { timeout: 8000 }).catch(() => {});
  const st = await snapshot(page); report.observations.push({ check: x.slug, step: 'after save', where, ...st, posts: posts(x).map(r => r.action + ':' + r.status + ':' + r.auth) });
  assert.equal(st.hash, '#setup/web/details-1-0', 'Guided setup continues to installation: ' + JSON.stringify(st));
  await page.getByText('Details saved securely.').waitFor();
  assert.equal(posts(x, 'save_service_intake').length, 1, 'Exactly one actual save');
  assert.ok(posts(x).every(r => r.auth === 'owner' && r.status === 200), 'Writes use the signed-in owner session: ' + JSON.stringify(posts(x)));
  const d = await dto(x);
  assert.equal(d.serviceIntake.web.preferences.builder, 'wix', 'Builder saved on the server'); assert.equal(d.serviceIntake.web.preferences.installationBy, 'me');
  assert.ok(((await client(x)).client.widget.allowedOrigins || []).includes(SITE), 'Website origin saved on the server');
  // Next useful action: the builder-specific installation step; nothing saved locally is called connected/delivered.
  assert.equal(await page.locator('#intakeStepTitle').textContent(), 'Open your website settings');
  assert.match(await page.locator('#setupGuide').innerText(), /Wix/, 'Saved builder drives the installation steps');
  // Builder instructions say "a published Wix site with a connected domain"; that is the owner's domain, not a claim.
  const text = (await page.locator('#serviceIntakeWorkbench').innerText()).replace(/connected domain/g, 'domain');
  assert.ok(!CLAIM_TEXT.test(text), 'Saved details are not called connected/delivered: ' + text.match(CLAIM_TEXT)?.[0]);
  await noHorizontalScroll(page, where);
}

// ---------- checks ----------
const WIDTHS = [[1440, 900], [390, 844]];
for (const [width, height] of WIDTHS) {
  for (const mode of ['security', 'methods']) {
    await check(`${mode}: storage fails after sign-in, owner enters website/builder and saves; continues to installation (${width})`, async () => {
      const x = await open(await seed(width), { height });
      await toDetails(x, mode, 'before-open');
      await x.page.locator('#intakeContinue').click();
      await savedAndNext(x, mode + ' before-open ' + width);
      await shot(x.page, mode + '-saved-' + width);
    });
    await check(`${mode}: storage fails while the details form is open (editable fields), save still completes (${width})`, async () => {
      const x = await open(await seed(width), { height });
      await toDetails(x, mode, 'after-open');
      await x.page.locator('#intakeContinue').click();
      await savedAndNext(x, mode + ' after-open ' + width);
    });
  }

  await check(`security: lost save response, Check saved details is GET only and recovers; no duplicate write (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'security', 'before-open');
    x.state.lose = body => body?.action === 'save_service_intake';
    await page.locator('#intakeContinue').click();
    await page.waitForFunction(lost => document.getElementById('setupGuide').innerText.includes(lost) && !!document.getElementById('intakeReconcile'), INTAKE_LOST, { timeout: 8000 });
    assert.ok(x.state.requests.some(r => r.lostAfterEffect && r.status === 200), 'Actual handler saved the lost change');
    const text = await page.locator('#setupGuide').innerText();
    assert.ok(!/Details saved securely|saved details are confirmed/.test(text), 'No success while unconfirmed');
    assert.equal(await page.evaluate(() => location.hash), '#setup/web/details-0');
    assert.equal(await page.locator('#intake-builder option:checked').textContent(), 'Wix', 'Owner draft kept');
    await shot(page, 'security-lost-' + width);
    const writes = posts(x).length, gets = x.state.requests.filter(r => r.method === 'GET').length;
    await page.locator('#intakeReconcile').click();
    await page.waitForFunction(() => location.hash === '#setup/web/details-1-0', null, { timeout: 8000 }).catch(() => {});
    report.observations.push({ check: x.slug, step: 'after reconcile', ...(await snapshot(page)) });
    // The status check itself is a GET. Once it confirms the lost save, the guide continues exactly as an uninterrupted
    // save does (one apply_service_intake with a new submission id); the uncertain save is never sent again.
    const after = x.state.requests.slice(writes + gets);
    assert.equal(after[0]?.method, 'GET', 'Status check is a read: ' + JSON.stringify(after[0]));
    assert.ok(x.state.requests.filter(r => r.method === 'GET').length > gets, 'Status check read the saved result');
    assert.equal(posts(x, 'save_service_intake').length, 1, 'Uncertain save was not sent again');
    assert.deepEqual(posts(x).map(r => r.action), ['save_service_intake', 'apply_service_intake'], 'Same writes as an uninterrupted save');
    assert.notEqual(posts(x)[1].submissionId, posts(x)[0].submissionId);
    assert.equal(await page.evaluate(() => location.hash), '#setup/web/details-1-0');
    await page.getByText('Your saved details are confirmed.').or(page.getByText('Details saved securely.')).first().waitFor();
    assert.equal((await dto(x)).serviceIntake.web.preferences.builder, 'wix');
    await shot(page, 'security-lost-recovered-' + width);
  });

  await check(`security: failed save (422) keeps the draft and shows field errors (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'security', 'before-open');
    await page.fill('#intake-website', 'http://not-https.example.com');
    await page.locator('#intakeContinue').click();
    await page.waitForFunction(() => document.querySelector('#serviceIntakeForm [aria-invalid="true"]') || document.getElementById('intakeStatus')?.dataset.error === 'true' || /Check|Enter/.test(document.getElementById('intakeStatus')?.textContent || ''), null, { timeout: 8000 });
    const st = await snapshot(page); report.observations.push({ check: x.slug, step: 'invalid save', ...st, posts: posts(x).map(r => r.action + ':' + r.status) });
    assert.equal(st.hash, '#setup/web/details-0', 'Stays on the details step');
    assert.equal(await page.locator('#intake-website').inputValue(), 'http://not-https.example.com', 'Owner draft kept');
    assert.ok(await page.locator('#serviceIntakeForm [aria-invalid="true"]').count() > 0, 'Visible field error');
  });

  await check(`security: return/resume in the same page after Save and exit reopens the saved installation step (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'security', 'before-open');
    await page.locator('#intakeContinue').click();
    await savedAndNext(x, 'resume ' + width);
    await page.locator('#intakeClose').click();
    await page.waitForFunction(() => !/^#setup\/web\/details/.test(location.hash));
    await page.evaluate(() => { location.hash = '#setup'; });
    await page.locator('#setupGuide[data-connector-view="overview"] [data-guide-service="web"]').waitFor();
    await openService(page, 'web');
    await page.locator('#connectorStart').click();
    await page.waitForFunction(() => /^#setup\/web\/details-1/.test(location.hash) && !!document.getElementById('intakeStepTitle'), null, { timeout: 8000 }).catch(() => {});
    const st = await snapshot(page); report.observations.push({ check: x.slug, step: 'resumed', ...st });
    assert.match(st.hash, /^#setup\/web\/details-1/, 'Resumes at installation: ' + JSON.stringify(st));
    assert.match(await page.locator('#setupGuide').innerText(), /Wix/);
    await page.locator('#intakeBack').click().catch(() => {});
    await page.waitForFunction(() => location.hash === '#setup/web/details-0');
    await page.locator('#intake-builder').waitFor();
    assert.equal(await page.locator('#intake-builder option:checked').textContent(), 'Wix', 'Saved builder shown on return');
    assert.equal(posts(x, 'save_service_intake').length, 1, 'Return made no write');
    await shot(page, 'security-resumed-' + width);
  });

  await check(`comparison: collapsed Website installation settings save works with storage throwing (${width})`, async () => {
    const x = await open(await seed(width), { height, hash: '#setup' }); const { page } = x;
    await ready(page); await breakStorage(page, 'security'); await storageBroken(page, 'security');
    const result = await page.evaluate(async () => {
      const details = document.getElementById('websiteSetupDetails'); if (!details) return { missing: true };
      details.hidden = false; details.open = true; for (let n = details.parentElement; n; n = n.parentElement) if (n.hidden) n.hidden = false;
      document.getElementById('websiteInstallChange').click();
      document.getElementById('websiteInstallWebsite').value = 'https://fixture-shop-two.example.com';
      document.getElementById('websiteInstallWebsite').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('websiteInstallEdit').requestSubmit();
      for (let i = 0; i < 80 && !/Website saved|could not|expired/i.test(document.getElementById('websiteInstallMessage').textContent); i++) await new Promise(r => setTimeout(r, 50));
      return { message: document.getElementById('websiteInstallMessage').textContent };
    });
    report.observations.push({ check: x.slug, step: 'collapsed settings', ...result, writes: posts(x).map(r => r.method + ':' + r.status + ':' + r.auth) });
    assert.match(result.message || '', /^Website saved/, 'Collapsed settings save: ' + JSON.stringify(result));
    assert.equal((await client(x)).client.business.website, 'https://fixture-shop-two.example.com/');
  });

  await check(`control (quota): setItem throws QuotaExceededError from load; guided save completes (${width})`, async () => {
    const x = await open(await seed(width), { height, start: 'quota' });
    await storageBroken(x.page, 'quota');
    await toDetails(x, 'quota', 'none');
    await x.page.locator('#intakeContinue').click();
    await savedAndNext(x, 'quota ' + width);
  });

  await check(`identity guard: readable storage without the session (signed out in this tab) blocks the save; no write (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'none', 'none');
    await page.evaluate(() => sessionStorage.removeItem('mc-onboarding-session-v1'));
    const writes = posts(x).length;
    await page.locator('#intakeContinue').click(); await page.waitForTimeout(800);
    assert.equal(posts(x).length, writes, 'No write after the session was removed: ' + JSON.stringify(posts(x)));
  });

  await check(`identity guard: session expiry while storage throws clears the workbench; no later write (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'security', 'after-open');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:session-expired')));
    const writes = posts(x).length;
    await page.evaluate(() => { const form = document.getElementById('serviceIntakeForm'); if (form) form.requestSubmit(); });
    await page.waitForTimeout(800);
    assert.equal(posts(x).length, writes, 'No write after session expiry');
    assert.equal(await page.locator('#serviceIntakeWorkbench').count(), 0, 'Private workbench cleared');
  });
}

// Fresh load with storage already blocked: desk.js cannot read a session, so the workspace asks to sign in.
// Recorded only (outside desk-service-intake.js; see report).
await check('observe: fresh load with storage blocked from the start shows the sign-in recovery (recorded)', async () => {
  const x = await open(await seed(390), { height: 844, start: 'security' }); const { page } = x;
  await page.waitForFunction(() => ['recovery', 'ready'].includes(document.body.dataset.workspaceState));
  const st = await snapshot(page); report.observations.push({ check: x.slug, step: 'fresh blocked load', ...st, status: await page.locator('#status').textContent() });
  await shot(page, 'fresh-blocked-390');
});

// ---------- finish ----------
await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0;
report.checks.push({ name: 'hygiene: no physical or forbidden requests and no page errors (all checks)', pass: globalsPass, ...(globalsPass ? {} : { error: JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors }) }) });
report.checks.push({ name: 'source unchanged during the run', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.checks.push({ name: 'served desk-service-intake.js matches --serve ' + serve, pass: report.servedJs[INTAKE] === report.intakeServedSha256 });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.durationMs = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' (serve=' + serve + ', intake sha256 ' + report.intakeServedSha256.slice(0, 12) + ', ' + report.browser.version + ') in ' + Math.round(report.durationMs / 1000) + 's -> ' + output);
process.exit(report.passed === report.total ? 0 : 1);
