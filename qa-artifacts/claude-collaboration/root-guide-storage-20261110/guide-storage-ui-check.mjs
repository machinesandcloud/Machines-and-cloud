// Website guide saved-status and connection review when browser storage is unavailable or throws (card FINDING-276D71AF7EB847A5).
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
// --serve <fix|base|weak> chooses the desk-setup-guide.js bytes served:
//   fix  = this worktree's file; base = `git show 3372749d:desk-setup-guide.js`;
//   weak = the fix with its identity guard removed (always uses the in-memory session even when readable storage says
//          the session was removed) - the identity-guard check must catch it.
// Usage (from the worktree root):
//   MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell> node qa-artifacts/claude-collaboration/root-guide-storage-20261110/guide-storage-ui-check.mjs \
//     --playwright <playwright/index.mjs> --serve fix --output scratchpad/claude-guidestore-<name>.json [--only <substring>]
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
if (!output || !/^scratchpad\/claude-guidestore-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-guidestore-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
if (!['fix', 'base', 'weak'].includes(serve)) throw new Error('--serve fix|base|weak');
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const BASE = '3372749d3007dd728cf9b06a83f2c175a903a4ee', GUIDE = 'desk-setup-guide.js';

// ---------- served bytes ----------
const fixBytes = readFileSync(GUIDE);
const baseBytes = execFileSync('git', ['show', BASE + ':' + GUIDE]);
function weakBytes() {
  const text = fixBytes.toString('utf8');
  const guard = "if(stored!==undefined&&stored!==preparationOwner)preparationOwner=null;";
  if (!text.includes(guard)) throw new Error('Weak variant: identity guard text not found in the fix');
  return Buffer.from(text.replace(guard, ''), 'utf8');
}
const guideBytes = serve === 'base' ? baseBytes : serve === 'weak' ? weakBytes() : fixBytes;
const watched = ['desk.html', 'desk.js', 'desk-service-intake.js', 'desk-connections.js', 'desk-website-install.js', GUIDE, 'netlify/functions/client.mjs', 'qa-artifacts/claude-collaboration/root-guide-storage-20261110/guide-storage-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), card: 'FINDING-276D71AF7EB847A5', serve, base: BASE, head: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
  mode: 'Actual owner handlers in-process via context.route, memory store, fake model, empty provider env, physical transport denied',
  guideServedSha256: sha(guideBytes), guideBaseSha256: sha(baseBytes), guideWorktreeSha256: sha(fixBytes), servedJs: {}, sourceBefore: hashes(),
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
let serial = 0; const contexts = [], heldStates=[];
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
  const refs = {sessionStorage, localStorage};
  const proto = Storage.prototype, native = { getItem: proto.getItem, setItem: proto.setItem, removeItem: proto.removeItem, key: proto.key, clear: proto.clear };
  const security = () => new DOMException("Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.", 'SecurityError');
  window.__mcStorageEvents = [];
  window.__mcSession = value => value === null ? native.removeItem.call(refs.sessionStorage, 'mc-onboarding-session-v1') : native.setItem.call(refs.sessionStorage, 'mc-onboarding-session-v1', value);
  window.__mcStorage = function (mode) {
    window.__mcStorageMode = mode;
    if(mode === 'restore') { for(const name of Object.keys(native)) proto[name]=native[name]; for(const name of Object.keys(refs)) Object.defineProperty(window,name,{configurable:true,get(){return refs[name];}}); }
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
  const state = x.state || (x.state = { lose: null, requests: [] }); heldStates.push(state);
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      const action = body?.action, headers = request.headers();
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const auth = headers.authorization || '', item = { slug, path: url.pathname, query: url.search, method, action, service: body?.service, auth: auth === 'Bearer ' + token ? 'owner' : x.replacementToken && auth === 'Bearer '+x.replacementToken ? 'replacement-owner' : auth ? 'other-synthetic' : 'none', submissionId: body?.submissionId, operationId: body?.operationId };
      state.requests.push(item); report.requests.push(item);
      if(state.fail && state.fail(body,item)){state.fail=null;item.injectedFailure=true;return route.fulfill({status:503,contentType:'application/json',body:'{}'});}
      const response = await handlers[url.pathname](new Request(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      item.status = response.status; const bytes = Buffer.from(await response.arrayBuffer());
      // Lost response: the actual handler has already processed (and saved) the change; the browser sees a network failure.
      if (method !== 'GET' && state.lose && state.lose(body, item)) { state.lose = null; item.lostAfterEffect = true; return route.abort('failed'); }
      if(state.hold && state.hold(body,item)){state.hold=null;item.held=true;await new Promise(resolve => {state.release=resolve;});item.released=true;}
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes }).catch(()=>{});
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\//, ''), path = resolve(root, rel);
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const body = rel === GUIDE ? guideBytes : readFileSync(path);
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
  } finally { for(const x of heldStates) x.release?.(); await Promise.all(contexts.slice(start).map(context => context.close().catch(() => {}))); }
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
const GUIDE_LOST = 'The response was interrupted. Your details may be saved. Check the saved result before continuing.';
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
// Both screens are ordinary returning guide URLs; all user actions below use the rendered buttons.
// The session is present at document load, and the actual desk/owner handlers establish the workspace.
async function guide(x, screen, mode) {
  await open(x, {height:x.width===390?844:900,hash:'#setup/web/'+screen});
  await ready(x.page);
  const button=screen==='connection-check'?'#setupGuideCheckConnection':'#connectorRequestReview';
  await x.page.locator(button).waitFor();
  if(screen==='connection-check') await x.page.waitForFunction(()=>document.getElementById('connectionVerificationNotice')?.textContent.includes('Saved status checked'));
  if(mode){await breakStorage(x.page,mode);await storageBroken(x.page,mode);}
  return x;
}
const setupGets=x=>x.state.requests.filter(r=>r.method==='GET'&&r.query.includes('setup_assistance=1'));
async function statusCheck(x){
  const before=setupGets(x).length,writes=posts(x).length;
  await x.page.locator('#setupGuideCheckConnection').click();
  await x.page.waitForFunction(()=>!document.getElementById('setupGuideCheckConnection')?.disabled);
  await x.page.waitForTimeout(200);
  assert.equal(setupGets(x).length,before+1,'Check saved status makes one actual GET');
  assert.equal(posts(x).length,writes,'Saved-status check makes no write');
  assert.equal(setupGets(x).at(-1).auth,'owner');
  assert.match(await x.page.locator('#connectionVerificationNotice').innerText(),/Saved status checked/);
  assert.equal(await x.page.locator('#connectorFinish').count(),0,'Unverified installation is not complete');
}
async function requestReview(x){
  const before=posts(x,'report_connection').length;
  await x.page.locator('#connectorRequestReview').click();
  await x.page.waitForFunction(()=>!!document.getElementById('connectionReviewReference'),null,{timeout:3000});
  assert.equal(posts(x,'report_connection').length,before+1);
  assert.equal(posts(x,'report_connection').at(-1).auth,'owner');
  const d=await client(x),reference=await x.page.locator('#connectionReviewReference').innerText();
  assert.equal(d.connectionAssistance.web.reference,reference,'Displayed reference matches actual handler');
  assert.equal(d.setup.connectionJourney.channels.find(r=>r.id==='web').verification.working,false);
  assert.match(await x.page.locator('#connectionReviewReceipt').innerText(),/does not start provisioning or activate/);
  return reference;
}
for(const width of [390,1440]){
  await check(`ordinary flow: save website details, return to status and review with storage blocked (${width})`,async()=>{
    const x=await open(await seed(width),{height:width===390?844:900});
    await toDetails(x,'security','before-open');await x.page.locator('#intakeContinue').click();await savedAndNext(x,'ordinary guide '+width);
    // Returning directly to the saved guide URL requires no reinstall, external website request or duplicate save.
    await x.page.evaluate(()=>{location.hash='#setup/web/connection-check';});
    await x.page.waitForFunction(()=>document.getElementById('connectionVerificationNotice')?.textContent.includes('Saved status checked'));
    await statusCheck(x);await x.page.evaluate(()=>{location.hash='#setup/web/connection-review';});
    await x.page.locator('#connectorRequestReview').waitFor();await requestReview(x);
    assert.equal(posts(x,'save_service_intake').length,1);
    assert.equal((await dto(x)).serviceIntake.web.preferences.builder,'wix');
  });
  for(const mode of ['security','methods','quota']){
    await check(`status: ${mode} saved-status GET after warm sign-in (${width})`,async()=>{
      const x=await guide(await seed(width),'connection-check',mode);await statusCheck(x);await shot(x.page,`${mode}-status-${width}`);
    });
    await check(`review: ${mode} actual request and GET-only status after warm sign-in (${width})`,async()=>{
      const x=await guide(await seed(width),'connection-review',mode);const ref=await requestReview(x),writes=posts(x).length;
      await x.page.locator('#connectorRequestReview').click();
      await x.page.waitForFunction(()=>document.getElementById('connectionReviewStatus')?.textContent.includes('up to date'));
      assert.equal(posts(x).length,writes);assert.equal(await x.page.locator('#connectionReviewReference').innerText(),ref);
      await shot(x.page,`${mode}-review-${width}`);
    });
  }
  await check(`recovery: lost review response reconciles by GET, returning route retains reference (${width})`,async()=>{
    const x=await guide(await seed(width),'connection-review','security');
    x.state.lose=b=>b?.action==='report_connection';
    await x.page.locator('#connectorRequestReview').click();
    await x.page.waitForFunction(()=>document.getElementById('connectorRequestReview')?.textContent==='Check saved request',null,{timeout:3000});
    assert.equal(posts(x,'report_connection').length,1);assert.ok(posts(x,'report_connection')[0].lostAfterEffect);
    assert.equal(await x.page.locator('#connectionReviewReference').count(),0,'Lost response is not reported confirmed');
    const at=x.state.requests.length;await x.page.locator('#connectorRequestReview').click();
    await x.page.waitForFunction(()=>!!document.getElementById('connectionReviewReference'));
    assert.equal(x.state.requests[at].method,'GET');assert.equal(posts(x,'report_connection').length,1);
    const ref=await x.page.locator('#connectionReviewReference').innerText();
    await x.page.evaluate(()=>{location.hash='#setup/web/intro';});await x.page.locator('#connectorStart').waitFor();
    await x.page.goBack();await x.page.locator('#connectorRequestReview').waitFor();
    assert.equal(await x.page.locator('#connectionReviewReference').innerText(),ref);
    assert.equal(posts(x,'report_connection').length,1);
  });
  await check(`recovery: failed status GET keeps useful retry and no write (${width})`,async()=>{
    const x=await guide(await seed(width),'connection-check','methods');
    x.state.fail=(b,r)=>r.method==='GET'&&r.query.includes('setup_assistance=1');
    await x.page.locator('#setupGuideCheckConnection').click();
    await x.page.waitForFunction(()=>document.getElementById('connectionVerificationNotice')?.dataset.error==='true',null,{timeout:3000});
    assert.equal(posts(x).length,0);await statusCheck(x);
  });
  for(const changed of ['removed','swapped']){
    for(const screen of ['connection-check','connection-review']){
      await check(`identity: readable ${changed} stays invalid after blocked storage (${screen}, ${width})`,async()=>{
        const x=await guide(await seed(width),screen,null),button=screen==='connection-check'?'#setupGuideCheckConnection':'#connectorRequestReview';
        await x.page.evaluate(({changed})=>window.__mcSession(changed==='removed'?null:'different-synthetic-owner'),{changed});
        const before=x.state.requests.length;await x.page.locator(button).click();await x.page.waitForTimeout(150);
        assert.equal(x.state.requests.length,before,'Readable mismatch grants no request');
        await x.page.evaluate(token=>window.__mcSession(token),x.token);await breakStorage(x.page,'security');
        await x.page.locator(button).click();await x.page.waitForTimeout(150);
        assert.equal(x.state.requests.length,before,'Invalidated owner is never revived by unavailable storage');
      });
    }
  }
  for(const exit of ['signout','expiry']){
    await check(`identity: ${exit} with blocked storage clears guide and rejects late review (${width})`,async()=>{
      const x=await guide(await seed(width),'connection-review','security');
      x.state.hold=b=>b?.action==='report_connection';
      await x.page.locator('#connectorRequestReview').click();
      for(let i=0;i<50&&!x.state.release;i++)await x.page.waitForTimeout(20);
      assert.ok(x.state.release,'Actual saved response held before delivery');
      if(exit==='signout')await x.page.locator('#deskSignOut').click();
      else await x.page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:session-expired')));
      x.state.release();await x.page.waitForTimeout(200);
      assert.equal(await x.page.locator('#connectionReviewReference').count(),0);assert.equal(await x.page.locator('#connectorRequestReview').count(),0);
      assert.equal(posts(x,'report_connection').length,1,'No retry after exit');
    });
  }
  await check(`return: fresh-page replacement session works after old session revoked and page expired (${width})`,async()=>{
    const x=await guide(await seed(width),'connection-review','security');
    await store.put('access_sessions',accessHash(x.token),{scope:'onboarding',status:'revoked',email:x.c.owner.email,expiresAt:new Date(Date.now()+3600000).toISOString()});
    await x.page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:session-expired')));
    assert.equal(await x.page.locator('#connectorRequestReview').count(),0,'Expired document has no guide review action');
    x.replacementToken=sha('fresh-return-'+x.slug);
    await store.put('access_sessions',accessHash(x.replacementToken),{scope:'onboarding',status:'active',email:x.c.owner.email,expiresAt:new Date(Date.now()+3600000).toISOString()});
    // Synthetic sign-in return: owner receives a new valid token; real page scripts initialize on navigation.
    // No email request/exchange or provider interaction is simulated as delivered.
    await x.page.evaluate(token=>{window.__mcStorage('restore');window.__mcSession(token);},x.replacementToken);
    assert.equal(await x.page.locator('#connectorRequestReview').count(),0,'Readable new storage alone never revives the expired document');
    const at=x.state.requests.length;await x.page.reload();await ready(x.page);await x.page.locator('#connectorRequestReview').waitFor();
    await breakStorage(x.page,'methods');await x.page.locator('#connectorRequestReview').click();
    await x.page.waitForFunction(()=>!!document.getElementById('connectionReviewReference'));
    const after=x.state.requests.slice(at);
    assert.ok(after.some(r=>r.path==='/api/client'&&r.method==='GET'&&r.status===200&&r.auth==='replacement-owner'));
    assert.equal(posts(x,'report_connection').length,1);
    assert.equal(posts(x,'report_connection')[0].auth,'replacement-owner');assert.equal(posts(x,'report_connection')[0].status,200);
    assert.ok(!after.some(r=>r.auth==='owner'),'No revoked old session used by fresh page');
    await shot(x.page,'fresh-replacement-'+width);
  });
  for(const screen of ['connection-check','connection-review']){
    await check(`identity: late ${screen} response after readable swap is discarded (${width})`,async()=>{
      const x=await guide(await seed(width),screen,null),button=screen==='connection-check'?'#setupGuideCheckConnection':'#connectorRequestReview';
      let lateReference=null;
      if(screen==='connection-check'){
        // A report saved after the initial view is a distinct canary in the real handler's forthcoming GET.
        const response=await handlers['/api/client'](new Request(origin+'/api/client?c='+x.slug,{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer '+x.token},body:JSON.stringify({action:'report_connection',service:'web',operationId:sha('late-'+x.slug).slice(0,32),expectedReportRevision:null})}),{ip:'192.0.2.71'});
        assert.equal(response.status,200);lateReference=(await response.json()).connectionAssistance.web.reference;
      }
      x.state.hold=(b,r)=>screen==='connection-review'?b?.action==='report_connection':r.query.includes('setup_assistance=1');
      const notice=screen==='connection-check'?await x.page.locator('#connectionVerificationNotice').innerText():null;
      await x.page.locator(button).click();for(let i=0;i<50&&!x.state.release;i++)await x.page.waitForTimeout(20);
      assert.ok(x.state.release);await x.page.evaluate(()=>window.__mcSession('different-synthetic-owner'));
      x.state.release();await x.page.waitForTimeout(250);
      assert.equal(await x.page.locator('#connectionReviewReference').count(),0,'No previous-owner receipt');
      if(notice){
        assert.equal(await x.page.locator('#connectionVerificationNotice').innerText(),notice,'Earlier confirmed notice retained unchanged');
        await x.page.evaluate(()=>{location.hash='#setup/web/connection-review';});await x.page.locator('#connectorRequestReview').waitFor();
        assert.ok(!(await x.page.locator('#setupGuide').innerText()).includes(lateReference),'Distinct receipt in late actual-handler GET is not exposed');
      }
      const after=x.state.requests.length;await breakStorage(x.page,'security');
      const currentButton=notice?'#connectorRequestReview':button;
      if(await x.page.locator(currentButton).isEnabled())await x.page.locator(currentButton).click();await x.page.waitForTimeout(150);
      assert.equal(x.state.requests.length,after,'Late invalidated owner cannot submit again');
    });
  }
}
await check('boundary: fresh blocked-storage load has no retained authority',async()=>{
  const x=await open(await seed(390),{height:844,hash:'#setup/web/connection-review',start:'security'});
  await x.page.waitForFunction(()=>document.body.dataset.workspaceState==='recovery');
  assert.equal(posts(x).length,0);assert.equal(await x.page.locator('#connectorRequestReview').count(),0);
});

// ---------- finish ----------
await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0;
report.checks.push({ name: 'hygiene: no physical or forbidden requests and no page errors (all checks)', pass: globalsPass, ...(globalsPass ? {} : { error: JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors }) }) });
report.checks.push({ name: 'source unchanged during the run', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.checks.push({ name: 'served desk-setup-guide.js matches --serve ' + serve, pass: report.servedJs[GUIDE] === report.guideServedSha256 });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.durationMs = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' (serve=' + serve + ', guide sha256 ' + report.guideServedSha256.slice(0, 12) + ', ' + report.browser.version + ') in ' + Math.round(report.durationMs / 1000) + 's -> ' + output);
process.exit(report.passed === report.total ? 0 : 1);
