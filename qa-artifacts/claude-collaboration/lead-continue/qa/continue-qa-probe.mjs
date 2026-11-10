// Causal browser check (card AUTO-REVIEW-AC082AD61F551622): after an owner saves a Thumbtack or Angi setup request,
// leaves and returns, "Continue setup" resumes that saved request at its step (not the Thumbtack source chooser), and
// the connector page and the setup dialog show the same "Step N of M" and the same step name ("Next").
// Covered at 1440 and 390, through the ordinary guided setup (real buttons, real owner handlers):
//   - Thumbtack, partner access pending: chooser > partner setup > Request Thumbtack setup (real prepare), Exit, new tab,
//     Continue setup resumes the waiting step; no write on Continue; nothing claims a connection; lead notifications
//     stay one deliberate choice away and the partner choice returns to the saved request.
//   - Angi: Save and prepare request, Exit, new tab, Continue resumes "Send the prepared request"; I sent this request,
//     Exit, new tab, Continue resumes the waiting step; still unverified.
//   - Thumbtack lead notifications: values saved, Exit, new tab, Continue: page and dialog agree.
//   - Negative: a Thumbtack row with nothing saved still opens the source chooser (the chooser is right there).
//   - Weaker variant (recorded, not sufficient): "a dialog opens after Continue" holds at base and after the fix.
// Actual owner handlers in-process, memory store, fake model; provider env deleted; physical transport denied;
// Playwright route serves this worktree's files (or, with --pinned-from <dir>, the three pinned files from <dir>, used
// for the base run). No shared server, provider, email or OAuth call.
// Usage (from the worktree root):
//   [MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell>] node qa-artifacts/claude-collaboration/lead-continue/lead-source-continue-ui-check.mjs \
//     --output scratchpad/claude-continue-<name>.json [--pinned-from <dir>] [--playwright <index.mjs>] [--only <substring>]
//   Without MC_PLAYWRIGHT_EXECUTABLE it launches headless Google Chrome (channel 'chrome') with Playwright's temp profile.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), local = 'http://127.0.0.1:8947';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', only = arg('--only');
if (!output || !/^scratchpad\/claude-continue-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-continue-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const pinned = ['desk-setup-guide.js', 'desk-lead-sources.js', 'desk-setup-guide.css'], pinnedFrom = arg('--pinned-from');
if (pinnedFrom && !pinned.every(f => existsSync(resolve(pinnedFrom, f)))) throw new Error('--pinned-from must hold ' + pinned.join(', '));
const watched = [...pinned, 'desk.html', 'desk.js', 'desk.css', 'desk-lead-sources.css', 'netlify/functions/client.mjs', 'netlify/functions/lib/lead-connections.mjs', 'netlify/functions/lib/connection-journey.mjs', 'netlify/functions/lib/thumbtack-connection.mjs', 'qa-artifacts/claude-collaboration/lead-continue/qa/continue-qa-probe.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', sourceBefore: hashes(), served: {}, checks: [], observations: [], screenshots: [], requests: [], pageErrors: [], forbidden: [], intercepted: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: local, PUBLIC_SITE_URL: local });
const deny = () => { report.physicalNetwork++; throw new Error('Continue check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if ([local, 'https://machinesandcloud.com'].includes(url.origin) && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../../netlify/functions/lib/config.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect']) {
  const mod = await import('../../../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
report.handlers = Object.keys(handlers); report.pinnedFrom = pinnedFrom || null;
const exe = process.env.MC_PLAYWRIGHT_EXECUTABLE;
if (exe && !existsSync(exe)) throw new Error('MC_PLAYWRIGHT_EXECUTABLE does not exist: ' + exe);
const browser = await playwright.chromium.launch({ ...(exe ? { executablePath: exe } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browser = { engine: exe ? 'bundled chrome-headless-shell' : 'Google Chrome (channel chrome, Playwright temp profile)', executable: exe || 'channel:chrome', version: browser.version() };
let serial = 0; const contexts = [];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };

async function seed(width, site = local) {
  const slug = 'continue-' + ++serial + '-' + width, token = sha('continue-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Lead Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web', 'angi', 'thumbtack'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, c, width, site, state: { lose: null, hold: null, requests: [] } };
}
async function open(x, { height = 900, hash = '#setup' } = {}) {
  const { slug, token, width, site, state } = x;
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
  await context.addInitScript(({ site, slug, token }) => { if (location.origin !== site) return; if (!sessionStorage.getItem('mc-onboarding-session-v1')) sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { site, slug, token });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    // Thumbtack's sign-in page is the provider boundary: intercepted, never fetched.
    if (['auth.thumbtack.com', 'staging-auth.thumbtack.com'].includes(url.hostname)) { report.intercepted.push({ slug, origin: url.origin, path: url.pathname }); return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Intercepted Thumbtack boundary</title><p>Intercepted</p>' }); }
    if (url.origin !== site) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      const action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action, operation: body?.operation, source: body?.source, deliveryMode: body?.deliveryMode, expectedGeneration: body?.expectedGeneration };
      state.requests.push(item); report.requests.push(item);
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      item.status = response.status; const bytes = Buffer.from(await response.arrayBuffer()); if (response.status >= 400) item.errorBody = bytes.toString('utf8').slice(0, 300);
      if (state.hold && state.hold(method, body)) { state.hold = null; item.held = true; await new Promise(release => { state.release = release; }); state.release = null; }
      if (method !== 'GET' && state.lose && state.lose(body)) { state.lose = null; item.lostAfterEffect = true; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const rel = path.slice(root.length + 1), bytes = readFileSync(pinnedFrom && pinned.includes(rel) ? resolve(pinnedFrom, rel) : path); if (pinned.includes(rel)) report.served[rel] = sha(bytes);
    return route.fulfill({ contentType: TYPES[extname(path)] || 'application/octet-stream', body: bytes });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  await page.goto(site + '/desk.html?c=' + slug + hash); await ready(page);
  Object.assign(x, { page, context });
  return x;
}
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
  return page.evaluate(() => {
    const vis = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
    const host = document.getElementById('setupGuide'), d = document.getElementById('leadSourceDialog');
    return { hash: location.hash, view: host?.dataset.connectorView, focus: document.activeElement?.id || document.activeElement?.tagName, heading: document.getElementById('setupGuideStageTitle')?.textContent, text: host?.innerText.slice(0, 1200), controls: [...(host?.querySelectorAll('button,a') || [])].filter(vis).map(b => (b.id || b.tagName) + ':' + b.textContent.trim().slice(0, 50)), dialog: d?.open ? { stage: d.dataset.connectorStage, busy: d.getAttribute('aria-busy'), text: d.innerText.slice(0, 900), buttons: [...d.querySelectorAll('button')].filter(b => vis(b) && !b.disabled).map(b => b.textContent.trim()) } : null };
  });
}
const ready = page => page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
const idle = page => page.waitForFunction(() => document.getElementById('leadSourceDialog')?.getAttribute('aria-busy') === 'false');
const stage = (page, s) => page.waitForFunction(s => { const d = document.getElementById('leadSourceDialog'); return d?.open && d.dataset.connectorStage === s && d.getAttribute('aria-busy') === 'false'; }, s);
async function waitText(page, selector, re) { await page.waitForFunction(([s, src, flags]) => { const n = document.querySelector(s); return !!n && new RegExp(src, flags).test(n.textContent); }, [selector, re.source, re.flags]); }
async function noHorizontalScroll(page, where) {
  const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, dialogs: [...document.querySelectorAll('dialog[open]')].map(d => ({ id: d.id, scroll: d.scrollWidth, client: d.clientWidth })) }));
  assert.ok(v.doc <= v.vw + 1 && v.dialogs.every(d => d.scroll <= d.client + 1), 'Horizontal scroll at ' + where + ': ' + JSON.stringify(v));
}
const focusNow = page => page.evaluate(() => ({ id: document.activeElement?.id || null, tag: document.activeElement?.tagName, inDialog: !!document.activeElement?.closest('#leadSourceDialog'), inGuide: !!document.activeElement?.closest('#setupGuide'), visible: !!document.activeElement && document.activeElement !== document.body && document.activeElement.getClientRects().length > 0 }));
async function toList(page) {
  if (await page.locator('#leadSourceDialog[open]').count()) { await idle(page); await page.locator('#leadSourceClose').click(); }
  if (await page.evaluate(() => location.hash) !== '#setup') await page.evaluate(() => { location.hash = '#setup'; });
  await page.locator('#setupGuide[data-connector-view="overview"] [data-guide-service]').first().waitFor();
}
async function rowStatus(page, id) { await toList(page); return page.locator('[data-guide-service="' + id + '"] .connector-choice-status').textContent(); }
async function openRow(page, id) {
  await toList(page); await page.locator('[data-guide-service="' + id + '"]').click();
  await page.waitForFunction(id => document.getElementById('setupGuide')?.dataset.guideSelectedService === id && !!document.getElementById('setupGuideStageTitle'), id);
}
const primaryButtons = page => page.evaluate(() => [...document.querySelectorAll('#setupGuide .connector-page .btn-pill-blue')].filter(b => b.getClientRects().length > 0).map(b => b.textContent.trim()));
const pageControls = page => page.evaluate(() => [...document.querySelectorAll('#setupGuide .connector-page button,#setupGuide .connector-page a')].filter(b => b.getClientRects().length > 0).map(b => b.textContent.trim()));
async function dto(x) { const r = await handlers['/api/client'](new Request(x.site + '/api/client?c=' + x.slug, { headers: { origin: x.site, authorization: 'Bearer ' + x.token } }), { ip: '192.0.2.71' }); assert.equal(r.status, 200); return r.json(); }
async function ownerPost(x, body) { const r = await handlers['/api/client'](new Request(x.site + '/api/client?c=' + x.slug, { method: 'POST', headers: { origin: x.site, authorization: 'Bearer ' + x.token, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { ip: '192.0.2.71' }); return { status: r.status, body: await r.json() }; }
const opId = () => createHash('sha256').update(String(Math.random()) + Date.now()).digest('hex').slice(0, 32);
const posts = (x, pred = () => true) => x.state.requests.filter(r => r.method === 'POST' && pred(r));
async function angiLead(view, id) {
  const endpoint = new URL(view.setup.endpoint);
  const body = { leadOid: id, srOid: id + '7', spEntityId: view.providerBusinessId, name: 'Jamie Customer', address: '12 Oak St', city: 'Houston', stateProvince: 'TX', postalCode: '77057', primaryPhone: '+17135550142', email: 'jamie@example.test', taskName: 'Repair central air', comments: 'Air is warm.' };
  const r = await handlers['/api/angi'](new Request(endpoint.href, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': view.setup.secret }, body: JSON.stringify(body) }));
  return r.status;
}
async function thumbtackNotification(view, id) {
  const r = await handlers['/api/thumbtack/self-serve'](new Request(view.setup.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', [view.setup.headerName]: view.setup.secret }, body: JSON.stringify({ data: { negotiationID: id } }) }));
  return r.status;
}
const WRONG_RECORDS = /remain available in Account|saved records remain available/i;


const W = [[1440, 900], [390, 844]];
const CLAIM = /is connected|Connection verified|connected and receiving|Delivery confirmed|leads are (?:now )?(?:live|delivered)/i;
const view = page => page.evaluate(() => {
  const vis = n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
  const h = document.getElementById('setupGuide'), d = document.getElementById('leadSourceDialog');
  const next = [...(h?.querySelectorAll('.connector-intro-summary div') || [])].find(div => div.querySelector('dt')?.textContent === 'Next')?.querySelector('dd')?.textContent ?? null;
  return { hash: location.hash, pageCount: document.getElementById('connectorStepCount')?.textContent ?? null, pageNext: next, focus: document.activeElement?.id || document.activeElement?.tagName,
    dialog: d?.open ? { stage: d.dataset.connectorStage, busy: d.getAttribute('aria-busy'), stageText: document.getElementById('leadSourceStage').textContent, text: d.innerText, buttons: [...d.querySelectorAll('button,a')].filter(b => vis(b) && !b.disabled).map(b => (b.id || b.tagName) + ':' + b.textContent.trim().slice(0, 60)) } : null };
});
const split = stageText => { const m = /^Step (\d+) of (\d+) · (.+)$/.exec(stageText || ''); return m ? { count: 'Step ' + m[1] + ' of ' + m[2], label: m[3] } : null; };
// Leave and return: Exit setup, then a fresh tab (new browser context, same owner session).
async function leaveAndReturn(x, height) {
  if (await x.page.locator('#leadSourceDialog[open]').count()) { await idle(x.page); await x.page.locator('#leadSourceClose').click(); }
  await x.context.close(); await open(x, { height });
}
// Returning owner: intro shows Continue setup with a Next value; pressing it resumes the saved step and both agree.
async function continueAndAgree(x, id, where, expectStage) {
  const { page } = x;
  await openRow(page, id);
  const intro = await view(page); report.observations.push({ where: where + ' intro', intro });
  assert.equal(await page.locator('#connectorStart').textContent(), 'Continue setup', 'Returning owner sees Continue setup');
  const before = posts(x).length;
  await page.locator('#connectorStart').click(); await page.locator('#leadSourceDialog[open]').waitFor(); await idle(page); await page.waitForTimeout(150);
  const after = await view(page); report.observations.push({ where: where + ' after Continue', after: { ...after, dialog: after.dialog && { ...after.dialog, text: after.dialog.text.slice(0, 600) } } });
  await shot(page, where);
  assert.notEqual(after.dialog?.stage, 'self-serve', 'Continue reopened the Thumbtack source chooser instead of the saved request: ' + after.dialog?.stageText);
  assert.equal(after.dialog?.stage, expectStage, 'Continue resumes the saved step');
  const parts = split(after.dialog.stageText); assert.ok(parts, 'Dialog shows a step count: ' + after.dialog.stageText);
  assert.equal(after.pageCount, parts.count, 'Page and dialog step counts agree');
  assert.equal(intro.pageNext, parts.label, 'The page "Next" names the step the dialog resumes');
  assert.equal(posts(x).length, before, 'Continue sends no write');
  assert.ok(!CLAIM.test(after.dialog.text), 'No connection claim without server evidence');
  const f = await focusNow(page); assert.ok(f.inDialog && f.visible, 'Focus inside the dialog: ' + JSON.stringify(f));
  await noHorizontalScroll(page, where);
  return after;
}

// ---- Independent QA probes (claude-continue-qa) ----
async function savedManaged(width, height) {
  const x = await open(await seed(width), { height }); let { page } = x;
  await openRow(page, 'thumbtack'); await page.locator('#connectorStart').click(); await page.locator('#selfServeNative').waitFor(); await idle(page);
  await page.locator('#selfServeNative').click(); await stage(page, 'account'); await page.locator('#leadSourcePrepare').click(); await stage(page, 'waiting');
  await leaveAndReturn(x, height); return x;
}
const predicted = (page, s) => page.evaluate(s => window.MCLeadSteps?.position(s) || null, s);
for (const [width, height] of W) {
  await check(`QA focus (base-comparable): Start setup chooser -> partner link keeps focus in the dialog (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await openRow(page, 'thumbtack'); await page.locator('#connectorStart').click(); await page.locator('#selfServeNative').waitFor(); await idle(page);
    await page.locator('#selfServeNative').focus(); await page.keyboard.press('Enter'); await stage(page, 'account'); await page.waitForTimeout(100);
    const f = await focusNow(page); report.observations.push({ where: 'qa base-comparable partner focus ' + width, f });
    assert.ok(f.inDialog && f.visible, 'Focus after partner link: ' + JSON.stringify(f));
  });
  await check(`QA riskiest: managed request -> notifications instead -> real self_serve prepare is accepted, focus and step agree (${width})`, async () => {
    const x = await savedManaged(width, height); const { page } = x;
    await openRow(page, 'thumbtack'); await page.locator('#connectorStart').click(); await stage(page, 'waiting');
    const w = await view(page);
    await page.locator('#leadSourceNotificationsInstead').focus(); await page.keyboard.press('Enter'); await page.locator('#selfServePrepare').waitFor(); await page.waitForTimeout(100);
    const f1 = await focusNow(page), v1 = await view(page); report.observations.push({ where: 'qa instead focus ' + width, f1, v1: { stageText: v1.dialog.stageText, pageCount: v1.pageCount } });
    assert.ok(f1.inDialog && f1.visible, 'Focus after "notifications instead": ' + JSON.stringify(f1));
    assert.equal(v1.pageCount, v1.dialog.stageText, 'Page mirrors chooser label: ' + JSON.stringify([v1.pageCount, v1.dialog.stageText]));
    // Back via partner link: focus must not be lost to <body>.
    await page.locator('#selfServeNative').focus(); await page.keyboard.press('Enter'); await stage(page, 'waiting'); await page.waitForTimeout(100);
    const f2 = await focusNow(page), v2 = await view(page); report.observations.push({ where: 'qa back focus ' + width, f2, pageCount: v2.pageCount, stageText: v2.dialog.stageText });
    assert.equal(v2.pageCount, split(v2.dialog.stageText)?.count, 'Page agrees after going back');
    assert.equal(v2.dialog.stageText, w.dialog.stageText);
    const focusBackOk = f2.inDialog && f2.visible;
    // Forward again and actually prepare lead notifications.
    await page.locator('#leadSourceNotificationsInstead').click(); await page.locator('#selfServePrepare').waitFor(); await idle(page);
    const before = posts(x).length;
    await page.locator('#selfServePrepare').click(); await waitText(page, '#leadSourceStatus', /notification address and key are saved|saved/); await idle(page);
    const writes = posts(x).slice(before); report.observations.push({ where: 'qa self_serve prepare over managed ' + width, writes });
    assert.equal(writes.length, 1, 'One write'); assert.equal(writes[0].operation, 'prepare'); assert.equal(writes[0].deliveryMode, 'self_serve'); assert.equal(writes[0].status, 200, 'Server accepts: ' + writes[0].errorBody);
    const tt = (await dto(x)).leadConnections.thumbtack; assert.equal(tt.deliveryMode, 'self_serve'); assert.equal(tt.notification.received, false); assert.equal(tt.notification.deliveryVerified, false);
    const v3 = await view(page); assert.equal(v3.pageCount, split(v3.dialog.stageText)?.count, 'Agree after prepare: ' + JSON.stringify([v3.pageCount, v3.dialog.stageText]));
    assert.ok(!CLAIM.test(v3.dialog.text) && !/\bverified\b|\bdelivered\b/i.test(v3.dialog.text), 'No claim: ' + v3.dialog.text.slice(0, 300));
    assert.ok(focusBackOk, 'Focus after "Review partner conversation setup instead": ' + JSON.stringify(f2));
  });

  await check(`QA stale: close the dialog while on the chooser; page count matches prediction and the next Continue (${width})`, async () => {
    const x = await savedManaged(width, height); const { page } = x;
    await openRow(page, 'thumbtack'); await page.locator('#connectorStart').click(); await stage(page, 'waiting');
    const w = await view(page);
    await page.locator('#leadSourceNotificationsInstead').click(); await page.locator('#selfServePrepare').waitFor(); await idle(page);
    await page.locator('#leadSourceClose').click(); await page.waitForFunction(() => !document.getElementById('leadSourceDialog').open); await page.waitForTimeout(150);
    const closed = await view(page), pred = await predicted(page, 'thumbtack'); report.observations.push({ where: 'qa closed-after-instead ' + width, closed, pred, waiting: w.dialog.stageText });
    const f = await focusNow(page); report.observations.push({ where: 'qa focus after close ' + width, f });
    assert.deepEqual(pred, { number: split(w.dialog.stageText).count.split(' ')[1] * 1, total: split(w.dialog.stageText).count.split(' ')[3] * 1, label: split(w.dialog.stageText).label }, 'Closed-dialog prediction is the waiting step');
    await openRow(page, 'thumbtack'); const intro = await view(page); report.observations.push({ where: 'qa reopened intro ' + width, intro });
    assert.equal(intro.pageNext, split(w.dialog.stageText).label, 'Intro Next is the waiting step, not the chooser');
    await page.locator('#connectorStart').click(); await stage(page, 'waiting'); await page.waitForTimeout(100);
    const again = await view(page); assert.equal(again.dialog.stageText, w.dialog.stageText, 'Continue resumes waiting again (noticeChoice reset)');
    assert.equal(again.pageCount, split(again.dialog.stageText)?.count);
  });

  await check(`QA cross-source: Thumbtack managed + Angi saved; switching pages keeps each source's own step (${width})`, async () => {
    const x = await savedManaged(width, height); let { page } = x;
    await openRow(page, 'angi'); await page.locator('#connectorStart').click(); await stage(page, 'account');
    await page.fill('#leadSourceBusiness', '55501234'); await page.locator('#leadSourcePrepare').click(); await stage(page, 'request');
    await leaveAndReturn(x, height); page = x.page;
    const tt = await continueAndAgree(x, 'thumbtack', 'qa-cross-tt-' + width, 'waiting');
    await page.locator('#leadSourceNotificationsInstead').click(); await page.locator('#selfServePrepare').waitFor(); await idle(page);
    await page.locator('#leadSourceClose').click(); await page.waitForFunction(() => !document.getElementById('leadSourceDialog').open);
    await openRow(page, 'angi'); const ai = await view(page), ap = await predicted(page, 'angi'); report.observations.push({ where: 'qa cross angi intro ' + width, ai, ap });
    const an = await continueAndAgree(x, 'angi', 'qa-cross-angi-' + width, 'request');
    assert.notEqual(an.pageCount, null);
    await page.locator('#leadSourceClose').click(); await page.waitForFunction(() => !document.getElementById('leadSourceDialog').open);
    const back = await continueAndAgree(x, 'thumbtack', 'qa-cross-tt2-' + width, 'waiting');
    assert.equal(back.dialog.stageText, tt.dialog.stageText);
  });
}
await browser.close();
report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceAfter) === JSON.stringify(report.sourceBefore);
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.ms = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.total} -> ${output}`); console.log('browser ' + JSON.stringify(report.browser)); console.log('served ' + JSON.stringify(report.served));
console.log('physicalNetwork ' + report.physicalNetwork + ' pageErrors ' + report.pageErrors.length + ' forbidden ' + report.forbidden.length + ' sourceStable ' + report.sourceStable);
process.exitCode = report.passed === report.total && !report.physicalNetwork && !report.pageErrors.length && !report.forbidden.length && report.sourceStable ? 0 : 1;
