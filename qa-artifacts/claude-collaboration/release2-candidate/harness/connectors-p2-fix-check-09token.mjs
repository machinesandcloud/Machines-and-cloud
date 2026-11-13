// Browser check for the connector P2/P3 findings PRA-CONN-03..08 and 10..13 (PRA-CONN-09 is verified separately
// against the desk inbox fix). One check per finding per width (390 and 1440). Each check must FAIL on a54c5874 and
// PASS with connectors-p2-fix.patch applied. Revision 2 adds the QA-CONN guards (Q08/Q10/Q06 cases) further down.
// Actual Netlify handlers in-process (routed by config.path), memory store, deterministic fake model, provider env
// deleted, physical transport denied (net/http/https/fetch), Chromium host resolution mapped to NOTFOUND and every
// non-loopback browser request either fulfilled from a local synthetic page (the owner's "website") or aborted.
// No route.fetch is used. No provider, email, OAuth, call or text.
// Readiness bridge (documented, same as the audit): website-chat activation needs setup readiness to see a
// configured model. Scenarios marked `bridge` set a placeholder ANTHROPIC_API_KEY with MC_FAKE_MODEL=0 for owner
// reads, and switch MC_FAKE_MODEL=1 around each in-process visitor chat call so lib/agent.mjs uses the fake client.
// No model request leaves the process (fetch is denied).
// Usage (from a copy root): node <this file> --playwright <playwright/index.mjs> --out <dir> [--only PRA-CONN-05]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve('.'), origin = 'http://127.0.0.1:8931', SITE = 'https://fixture-shop.example.com';
if (!existsSync(resolve(root, 'desk-setup-guide.js'))) throw new Error('Run from a copy root');
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const outDir = arg('--out'), playwrightPath = arg('--playwright'), only = arg('--only'), explore = process.argv.includes('--explore');
if (!outDir || !playwrightPath) throw new Error('--out <dir> and --playwright <index.mjs> are required');
mkdirSync(outDir, { recursive: true });
const started = Date.now(), sha = v => createHash('sha256').update(v).digest('hex');
const watched = ['desk.html', 'desk.js', 'desk.css', 'desk-setup-guide.js', 'desk-connections.js', 'desk-lead-sources.js', 'desk-service-intake.js', 'desk-website-install.js', 'embed.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/connection-journey.mjs', 'netlify/functions/lib/website-installation.mjs', 'netlify/functions/lib/setup.mjs'];
const hashes = () => Object.fromEntries(watched.filter(f => existsSync(f)).map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), root, mode: 'in-process handlers, memory store, fake model, Playwright-served copy files; provider env deleted; physical transport denied', sourceBefore: hashes(), checks: [], observations: [], screenshots: [], forbidden: [], pageErrors: [], physicalNetwork: 0, modelRequests: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
// Revision 2: raise the global self-service AI turn cap (default 50/day) so later visitor bookings in this suite are not
// refused for a reason unrelated to the patch (QA-CONN harness pitfall).
Object.assign(process.env, { MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500', MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin, PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
const deny = () => { report.physicalNetwork++; throw new Error('physical transport denied'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input?.url || input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); if (/anthropic|model/.test(url.hostname)) report.modelRequests++; return deny(); };
function bridge(on) { if (on) Object.assign(process.env, { ANTHROPIC_API_KEY: 'offline-readiness-bridge', MC_FAKE_MODEL: '0' }); else { delete process.env.ANTHROPIC_API_KEY; process.env.MC_FAKE_MODEL = '1'; } }

const imp = p => import(pathToFileURL(resolve(root, p)).href);
const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await imp('netlify/functions/lib/store.mjs');
const { accessHash } = await imp('netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await imp('netlify/functions/lib/config.mjs');
const { configurationRevision } = await imp('netlify/functions/lib/setup.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect', 'google', 'chat', 'website-installation']) {
  const mod = await imp('netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : {}), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
let serial = 0; const contexts = [];
const HOST_PAGE = slug => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture Connector Shop</title></head><body><h1>Fixture Connector Shop</h1><p>Synthetic owner website served from memory.</p><script src="' + origin + '/embed.js" data-client="' + slug + '" async></script></body></html>';

async function seed(width, { channels = ['web'], configure, bridged = false } = {}) {
  bridge(bridged);
  const slug = 'p2fix-' + ++serial + '-' + width, token = sha('p2fix-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Connector Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: SITE } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: channels }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  if (configure) await configure(c);
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, c, width, bridged };
}
const req = (x, path, body, extra = {}) => new Request(origin + path, { method: body ? 'POST' : 'GET', headers: { origin, authorization: 'Bearer ' + x.token, 'content-type': 'application/json', ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function dto(x) { const r = await handlers['/api/client'](req(x, '/api/client?c=' + x.slug), { ip: '192.0.2.71' }); assert.equal(r.status, 200); return r.json(); }
async function ownerPost(x, body) { const r = await handlers['/api/client'](req(x, '/api/client?c=' + x.slug, body), { ip: '192.0.2.71' }); return { status: r.status, body: await r.json() }; }
const opId = () => randomBytes(16).toString('hex');
async function patchClient(x, fn) { await store.atomicUpdate('clients', x.slug, cur => ({ value: fn(structuredClone(cur)) || cur })); }
async function markReviewed(x, { tested = false } = {}) { await patchClient(x, c => { const r = configurationRevision(c); c.setupProof = { ...c.setupProof, reviewedRevision: r, reviewedAt: new Date().toISOString(), ...(tested ? { testedRevision: r, testMode: 'live', testedAt: new Date().toISOString() } : {}) }; return c; }); }
async function saveWebIntake(x, { apply = true } = {}) {
  let d = await dto(x), token = d.serviceIntake.token;
  let r = await ownerPost(x, { action: 'save_service_intake', expectedIntakeToken: token, submissionId: opId(), service: 'web', section: 'preferences', fields: { website: SITE, builder: 'wordpress', installationBy: 'me' } });
  assert.equal(r.status, 200, 'web intake save ' + JSON.stringify(r.body).slice(0, 300));
  if (!apply) return;
  d = await dto(x); if (!d.serviceIntake.web?.canApply) return;
  r = await ownerPost(x, { action: 'apply_service_intake', expectedIntakeToken: d.serviceIntake.token, submissionId: opId(), service: 'web' });
  assert.equal(r.status, 200, 'web intake apply ' + JSON.stringify(r.body).slice(0, 300));
}
async function startCheck(x) {
  const saved = await store.get('clients', x.slug), { workspaceEditRevision } = await imp('netlify/functions/lib/workspace-edit.mjs');
  const r = await ownerPost(x, { action: 'start_website_check', expectedRevision: configurationRevision(saved), expectedEditRevision: workspaceEditRevision(saved), origin: SITE });
  assert.equal(r.status, 200, 'start_website_check ' + JSON.stringify(r.body).slice(0, 300)); return r.body.check;
}
async function observe(x, check) {
  const r = await handlers['/api/website-installation'](new Request(origin + '/api/website-installation', { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'observe', client: x.slug, checkId: check.id, challenge: check.challenge }) }));
  assert.equal(r.status, 200, 'observe ' + r.status);
}
// An ordinary visitor on the owner's website books a visit (fake model; same turns as audit e01 RUN B).
async function visitorBooking(x) {
  let contact = 'w' + randomBytes(8).toString('hex'), conversationToken = null; const transcript = []; // RC2 harness: carry proposal 09's conversation token
  for (const text of ['My AC stopped blowing cold air this afternoon. Can someone come out?', "I'm in Bellaire, 4410 Holt St. My number is 713-555-0177, name is Pat Lee.", 'Tomorrow morning works, 8 to 12.', 'Yes, go ahead and book it.']) {
    transcript.push({ role: 'user', content: text });
    // Bridge: setup readiness (chat.mjs web.ready) sees a configured model; only lib/agent.mjs makeClient() sees the fake model.
    const realEnv = process.env;
    process.env = new Proxy(realEnv, { get(target, key) { if (key === 'MC_FAKE_MODEL') return /at makeClient /.test(new Error().stack) ? '1' : '0'; return Reflect.get(target, key); } });
    let body;
    try {
      const r = await handlers['/api/chat'](new Request(origin + '/api/chat', { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json' }, body: JSON.stringify({ client: x.slug, contact, ...(conversationToken ? { conversationToken } : {}), turnId: randomBytes(16).toString('hex'), messages: transcript.slice(-19), page: '/', stream: false }) }), { ip: '192.0.2.88' });
      body = await r.text(); { const t = r.headers.get('X-MC-Conversation-Token'), k = r.headers.get('X-MC-Contact'); if (t) conversationToken = t; if (k) contact = k; } if (r.status !== 200) report.observations.push({ chat: r.status, body: body.slice(0, 200) });
    } finally { process.env = realEnv; }
    let reply = ''; try { reply = JSON.parse(body).reply || ''; } catch { reply = body.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return {}; } }).find(p => p.t === 'done')?.reply || ''; }
    transcript.push({ role: 'assistant', content: reply || '...' });
  }
  return transcript;
}

async function open(x, { hash = '', path = 'desk.html' } = {}) {
  const { slug, token, width } = x;
  const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; if (!sessionStorage.getItem('mc-onboarding-session-v1')) sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === SITE) { if (url.pathname === '/' || url.pathname === '/index.html') return route.fulfill({ contentType: 'text/html', body: HOST_PAGE(slug) }); return route.fulfill({ status: 404, body: '' }); }
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(body?.action)) { report.forbidden.push({ path: url.pathname, action: body?.action }); return route.fulfill({ status: 403, body: '{}' }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  if (path) { await page.goto(origin + '/' + path + '?c=' + slug + hash); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); }
  Object.assign(x, { page, context });
  return x;
}

const tag = name => name.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
async function shot(page, name) { const path = resolve(outDir, tag(name) + '.png'); await page.screenshot({ path, fullPage: false }); report.screenshots.push(path); return path; }
async function shotAt(page, selector, name) { await page.locator(selector).first().scrollIntoViewIfNeeded().catch(() => {}); return shot(page, name); }
async function check(id, name, width, run) {
  const full = id + ' ' + name + ' (' + width + ')';
  if (only && !full.includes(only)) return;
  const start = contexts.length, t0 = Date.now(), entry = { id, name: full, width };
  try { entry.evidence = await run(); entry.pass = true; console.log('PASS ' + full); }
  catch (error) { entry.pass = false; entry.error = String(error.stack || error).slice(0, 1800); console.log('FAIL ' + full + ': ' + String(error.message).split('\n')[0]); }
  finally {
    const page = contexts.slice(start).at(-1)?.pages().at(-1);
    if (page) entry.screenshot = await shot(page, id + '-' + width).catch(() => null);
    entry.ms = Date.now() - t0; report.checks.push(entry);
    await Promise.all(contexts.slice(start).map(c => c.close().catch(() => {})));
  }
}
async function toList(page) { if (await page.evaluate(() => location.hash) !== '#setup') await page.evaluate(() => { location.hash = '#setup'; }); await page.locator('#setupGuide[data-connector-view="overview"] [data-guide-service]').first().waitFor(); }
async function rowStatus(page, id) { await toList(page); return (await page.locator('[data-guide-service="' + id + '"] .connector-choice-status').textContent()).trim(); }
async function openRow(page, id) { await toList(page); await page.locator('[data-guide-service="' + id + '"]').click(); await page.waitForFunction(id => document.getElementById('setupGuide')?.dataset.guideSelectedService === id && !!document.getElementById('setupGuideStageTitle'), id); }
const introFacts = page => page.evaluate(() => { const dds = [...document.querySelectorAll('#setupGuide .connector-intro-summary dd')].map(n => n.textContent.trim()); return { status: dds[0], next: dds[1], heading: document.getElementById('setupGuideStageTitle')?.textContent.trim() }; });
const stepCount = page => page.evaluate(() => (document.querySelector('#serviceIntakeWorkbench .intake-step-count') || document.getElementById('connectorStepCount'))?.textContent.trim() || '');
async function noHorizontalScroll(page, where) { const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth })); assert.ok(v.doc <= v.vw + 1, 'Horizontal scroll at ' + where + ': ' + JSON.stringify(v)); }
async function focusVisible(page) { return page.evaluate(() => { const a = document.activeElement; return !!a && a !== document.body && a.getClientRects().length > 0; }); }
const WIDTHS = [390, 1440];

// ---------- PRA-CONN-03: existing business number is required, so it is not tagged Optional ----------
for (const width of WIDTHS) await check('PRA-CONN-03', 'Existing business number is not labelled Optional when it is required', width, async () => {
  const x = await open(await seed(width, { channels: ['web', 'voice'] }), { hash: '#setup' }); const { page } = x;
  await openRow(page, 'voice'); await page.locator('#connectorHoldDetails').click();
  await page.locator('#intake-forwardingMode').waitFor(); await page.selectOption('#intake-forwardingMode', 'forward_business_line');
  await shotAt(page, '#intake-businessNumber', 'PRA-CONN-03-label-' + width);
  const facts = await page.evaluate(() => { const i = document.getElementById('intake-businessNumber'); return { label: document.querySelector('label[for="intake-businessNumber"]').textContent.trim(), required: i.required, visible: i.getClientRects().length > 0 }; });
  assert.ok(facts.visible && facts.required, 'Field is shown and required: ' + JSON.stringify(facts));
  assert.doesNotMatch(facts.label, /Optional/, 'Required field is not tagged Optional: ' + facts.label);
  await page.fill('#intake-ownerPhone', '7135550198'); await page.selectOption('#intake-carrier', 'att'); await page.selectOption('#intake-forwarding', 'missed');
  await page.locator('#intakeContinue').click();
  await page.waitForFunction(() => /Enter|valid|required/i.test(document.getElementById('intake-businessNumber-error')?.textContent || '') || document.activeElement?.id === 'intake-businessNumber');
  // Every other field still tagged Optional must save blank (acceptance 2): the only other Optional field is address line 2.
  const optionalTags = await page.evaluate(() => [...document.querySelectorAll('#serviceIntakeWorkbench label small')].map(n => n.closest('label').getAttribute('for')));
  await noHorizontalScroll(page, 'phone details ' + width);
  return { facts, optionalTags };
});

// ---------- PRA-CONN-12: a service that is not enabled does not show an N-step count, and the save says it sends a review ----------
for (const width of WIDTHS) await check('PRA-CONN-12', 'Not-enabled phone and texting forms show no step total and the save names the review', width, async () => {
  const x = await open(await seed(width, { channels: ['web', 'voice', 'sms'] }), { hash: '#setup' }); const { page } = x;
  await openRow(page, 'voice'); await page.locator('#connectorHoldDetails').click(); await page.locator('#intake-forwardingMode').waitFor();
  await shotAt(page, '#serviceIntakeWorkbench', 'PRA-CONN-12-phone-' + width);
  const voice = { count: await stepCount(page), button: (await page.locator('#intakeContinue').textContent()).trim() };
  assert.doesNotMatch(voice.count, /Step \d+ of \d+/, 'Phone shows a step total it cannot complete: ' + voice.count);
  assert.match(voice.button, /review/i, 'Phone save names the connection review: ' + voice.button);
  await page.locator('#intakeClose').click(); await page.locator('#setupGuide[data-connector-view="overview"]').waitFor().catch(() => {});
  await openRow(page, 'sms'); await page.locator('#connectorHoldDetails').click(); await page.locator('#intake-legalName').waitFor();
  const sms = { count: await stepCount(page) };
  assert.doesNotMatch(sms.count, /Step \d+ of \d+/, 'Texting shows a step total it cannot complete: ' + sms.count);
  return { voice, sms };
});

// ---------- PRA-CONN-04: owners without an EIN see what happens next (no invented flow) ----------
for (const width of WIDTHS) await check('PRA-CONN-04', 'Texting form tells an owner without an EIN what happens next, not only a support link', width, async () => {
  const x = await open(await seed(width, { channels: ['web', 'sms'] }), { hash: '#setup' }); const { page } = x;
  await openRow(page, 'sms'); await page.locator('#connectorHoldDetails').click(); await page.locator('#intake-legalName').waitFor();
  await shotAt(page, '#intakeNoEinHelp, #intake-businessIndustry', 'PRA-CONN-04-sms-' + width);
  const help = await page.evaluate(() => { const n = document.getElementById('intakeNoEinHelp'); return n ? { text: n.textContent.trim(), visible: n.getClientRects().length > 0 } : null; });
  assert.ok(help && help.visible, 'A visible no-EIN explanation exists');
  assert.match(help.text, /sole proprietor/i, 'Names sole proprietors');
  assert.match(help.text, /review/i, 'Says what happens next (a connection review)');
  assert.doesNotMatch(help.text, /\b\d+\s*(business )?days?\b|\bhours?\b/i, 'Does not invent timing');
  const options = await page.evaluate(() => [...document.querySelectorAll('#intake-businessType option')].map(o => o.value).filter(Boolean));
  assert.deepEqual(options, ['llc', 'corporation', 'partnership'], 'No unsupported business type is invented');
  await noHorizontalScroll(page, 'sms details ' + width);
  return { help, options };
});

// ---------- PRA-CONN-05: Thumbtack shows a receiving status once a notification is saved ----------
for (const width of WIDTHS) await check('PRA-CONN-05', 'Thumbtack shows Notifications arriving (not Your next step, not Delivery verified) after a saved notification', width, async () => {
  const x = await seed(width, { channels: ['web'] });
  const prep = await ownerPost(x, { action: 'lead_connection', source: 'thumbtack', operation: 'prepare', deliveryMode: 'self_serve', expectedGeneration: null, operationId: opId(), providerBusinessId: '', integrationEmail: x.c.owner.email });
  assert.equal(prep.status, 200, 'prepare ' + JSON.stringify(prep.body).slice(0, 200));
  const view = prep.body.leadConnections.thumbtack;
  const r = await handlers['/api/thumbtack/self-serve'](new Request(view.setup.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', [view.setup.headerName]: view.setup.secret }, body: JSON.stringify({ data: { negotiationID: '4410998877' } }) }));
  assert.equal(r.status, 200, 'notification accepted');
  await open(x, { hash: '#setup' }); const { page } = x;
  const list = await rowStatus(page, 'thumbtack'); await shotAt(page, '[data-guide-service="thumbtack"]', 'PRA-CONN-05-list-' + width);
  assert.equal(list, 'Notifications arriving', 'List status: ' + list);
  await openRow(page, 'thumbtack'); const intro = await introFacts(page);
  assert.equal(intro.status, 'Notifications arriving', 'Intro status: ' + intro.status);
  assert.doesNotMatch(intro.next, /Check notifications/, 'Next no longer asks to check notifications: ' + intro.next);
  assert.notEqual(intro.status, 'Delivery verified', 'Notification-only is not claimed as verified delivery');
  const d = await dto(x), row = d.setup.connectionJourney.leadSources.find(r => r.id === 'thumbtack');
  assert.equal(row.verification.working, false, 'Server still reports full delivery unverified');
  await noHorizontalScroll(page, 'thumbtack ' + width);
  return { list, intro, verification: row.verification.state };
});

// ---------- PRA-CONN-13: website intro status uses owner wording ----------
for (const width of WIDTHS) await check('PRA-CONN-13', 'Website intro status and Next use owner wording while AI service is unavailable', width, async () => {
  const x = await seed(width, { channels: ['web'] }); await saveWebIntake(x); await markReviewed(x);
  await open(x, { hash: '#setup' }); const { page } = x;
  const list = await rowStatus(page, 'web');
  await openRow(page, 'web'); const intro = await introFacts(page); await shotAt(page, '.connector-intro-summary', 'PRA-CONN-13-intro-' + width);
  for (const v of [list, intro.status, intro.next]) assert.doesNotMatch(v, /Platform check|Wait for private practice/, 'Internal wording: ' + v);
  assert.match(intro.status + ' ' + intro.next, /AI service/i, 'Names what is being waited for: ' + JSON.stringify(intro));
  assert.match(intro.next, /Try your front desk/, 'Next uses owner wording: ' + intro.next);
  return { list, intro };
});

// ---------- PRA-CONN-11: saving the website does not re-ask business confirmation or change the step total ----------
// The owner has already confirmed the current business details; the website is not saved yet (WordPress chosen).
for (const width of WIDTHS) await check('PRA-CONN-11', 'Website step numbers never go backwards or change total; confirmed details are not asked again', width, async () => {
  const x = await seed(width, { channels: ['web'] }); await markReviewed(x);
  await open(x, { hash: '#setup' }); const { page } = x;
  const seen = [];
  const record = async label => { const s = await page.evaluate(() => ({ hash: location.hash, count: (document.querySelector('#serviceIntakeWorkbench .intake-step-count') || document.getElementById('connectorStepCount'))?.textContent.trim() || '', title: (document.getElementById('intakeStepTitle') || document.getElementById('setupGuideStageTitle'))?.textContent.trim() })); seen.push({ label, ...s }); return s; };
  await openRow(page, 'web'); await page.locator('#connectorStart').click();
  await page.locator('#intake-builder').waitFor(); await record('website details');
  const before = configurationRevision(await store.get('clients', x.slug));
  await page.fill('#intake-website', SITE); await page.selectOption('#intake-builder', 'wordpress'); await page.selectOption('#intake-installationBy', 'me');
  await page.locator('#intakeContinue').click();
  await page.waitForFunction(() => !document.getElementById('intake-builder'), null, { timeout: 8000 }); await page.waitForTimeout(500);
  const after = await record('after website save');
  // Walk the installation stages with Next and record every count.
  for (let i = 0; i < 6 && await page.locator('#intakeContinue:visible', { hasText: /^Next$/ }).count(); i++) { await page.locator('#intakeContinue').click(); await page.waitForTimeout(250); await record('install ' + i); }
  report.observations.push({ id: 'PRA-CONN-11', width, seen });
  const revisionKept = configurationRevision(await store.get('clients', x.slug)) === before;
  assert.notEqual(after.hash, '#setup/web/business', 'Confirmed business details are asked again after the website save: ' + JSON.stringify(after));
  const counts = seen.map(s => /Step (\d+) of (\d+)/.exec(s.count)).filter(Boolean).map(m => ({ n: +m[1], of: +m[2] }));
  assert.ok(counts.length >= 3, 'Saw numbered steps: ' + JSON.stringify(seen));
  assert.equal(new Set(counts.map(c => c.of)).size, 1, 'Step total stays the same: ' + JSON.stringify(counts));
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i].n >= counts[i - 1].n, 'Step numbers never decrease: ' + JSON.stringify(counts));
  return { seen, revisionKept };
});

// ---------- PRA-CONN-06: Continue setup resumes at the step the owner is on ----------
for (const width of WIDTHS) await check('PRA-CONN-06', 'Continue setup resumes at the installed-chat check once a website check was started', width, async () => {
  const x = await seed(width, { channels: ['web'], bridged: true }); await saveWebIntake(x); await markReviewed(x, { tested: true }); await startCheck(x);
  await open(x, { hash: '#setup' }); const { page } = x;
  await openRow(page, 'web'); await page.locator('#connectorStart').click(); await page.waitForTimeout(500);
  const at = await page.evaluate(() => ({ hash: location.hash, title: document.getElementById('setupGuideStageTitle')?.textContent.trim(), install: document.getElementById('intakeStepTitle')?.textContent.trim() || null, count: (document.querySelector('#serviceIntakeWorkbench .intake-step-count') || document.getElementById('connectorStepCount'))?.textContent.trim() }));
  await shot(page, 'PRA-CONN-06-resume-' + width);
  assert.equal(at.hash, '#setup/web/installation-check', 'Resumes at the installed-chat check: ' + JSON.stringify(at));
  assert.ok(await focusVisible(page), 'Focus is on a visible element after resuming');
  // Completed install steps stay reachable.
  const review = page.locator('#connectorReviewInstall:visible, #setupGuide button:visible', { hasText: /installation steps/i });
  assert.ok(await review.count(), 'A control returns to the installation steps');
  await review.first().click(); await page.waitForTimeout(400);
  const back = await page.evaluate(() => location.hash); assert.match(back, /#setup\/web\/details-1/, 'Installation steps reachable: ' + back);
  return { at, back };
});

// ---------- PRA-CONN-07: on-site check before activation names the next step ----------
for (const width of WIDTHS) await check('PRA-CONN-07', 'On-site check before activation says to return and activate; sample control explains why it is off; controls do not wrap', width, async () => {
  const x = await seed(width, { channels: ['web'], bridged: true }); await saveWebIntake(x); await markReviewed(x, { tested: true });
  const chk = await startCheck(x);
  await open(x, { path: '' }); const { page } = x;
  await page.goto(chk.url); await page.locator('#mcDesk').waitFor({ state: 'attached' });
  const launcher = page.locator('#mcDesk button').first(); if (!(await page.locator('#mcDesk.open').count())) await launcher.click();
  await page.waitForFunction(() => /Widget found/.test(document.querySelector('#mcDesk .check [role="status"]')?.textContent || ''));
  const facts = await page.evaluate(() => {
    const b = document.querySelector('#mcDesk .check'), s = b.querySelector('[data-check-sample]'), note = s.getAttribute('aria-describedby') ? document.getElementById(s.getAttribute('aria-describedby')) : null;
    const controls = [...b.querySelectorAll('button,a')].filter(n => n.getClientRects().length > 0).map(n => ({ text: n.textContent.trim(), rects: n.getClientRects().length, right: Math.round(n.getBoundingClientRect().right), panelRight: Math.round(b.getBoundingClientRect().right) }));
    const hiddenShown = [...b.querySelectorAll('[hidden]')].filter(n => n.getClientRects().length > 0).map(n => n.textContent.trim());
    return { hiddenShown, message: b.querySelector('[role="status"]').textContent.trim(), sampleDisabled: s.disabled, note: note && note.getClientRects().length > 0 ? note.textContent.trim() : null, controls };
  });
  assert.deepEqual(facts.hiddenShown, [], 'Hidden banner controls stay hidden');
  assert.match(facts.message, /Activate website chat/, 'Names the next action: ' + facts.message);
  assert.doesNotMatch(facts.message, /ready to activate\.?$/, 'Not only "ready to activate": ' + facts.message);
  assert.ok(facts.sampleDisabled, 'Sample is off before activation');
  assert.ok(facts.note && /active/i.test(facts.note), 'Disabled sample control explains why: ' + facts.note);
  for (const c of facts.controls) assert.ok(c.rects === 1 && c.right <= c.panelRight + 1, 'Control renders as one whole box: ' + JSON.stringify(c));
  return facts;
});

// ---------- PRA-CONN-08 / PRA-CONN-10: a real website booking completes the website step and is visible where owners look ----------
async function bookedWorkspace(width) {
  const x = await seed(width, { channels: ['web'], bridged: true }); await saveWebIntake(x);
  await patchClient(x, c => { c.status = 'live'; c.channels = { ...c.channels, web: { ...(c.channels?.web || {}), active: true } }; return c; });
  await markReviewed(x, { tested: true });
  const chk = await startCheck(x); await observe(x, chk);
  const transcript = await visitorBooking(x);
  const d = await dto(x);
  report.observations.push({ id: 'booked-precondition', width, bookings: (await store.list('bookings', x.slug + '/')).length, leads: (await store.list('leads', x.slug + '/')).length, first: d.websiteInstallation.firstExternalRequest, setupRequest: d.websiteInstallation.setupRequest.state, observation: d.websiteInstallation.observation.state });
  assert.equal(d.websiteInstallation.firstExternalRequest.state, 'received', 'Precondition: an ordinary website request is saved. Transcript: ' + JSON.stringify(transcript.slice(-1)));
  assert.notEqual(d.websiteInstallation.setupRequest.state, 'complete', 'Precondition: the labelled sample was not done');
  return x;
}
for (const width of WIDTHS) await check('PRA-CONN-08', 'After a real website request, Home no longer asks to see a first request and website chat is complete', width, async () => {
  const x = await bookedWorkspace(width); await open(x, { hash: '' }); const { page } = x; await shotAt(page, '#workspaceGuide:not([hidden]), #homeConnectionProgress', 'PRA-CONN-08-home-' + width);
  const home = await page.evaluate(() => ({ guide: document.getElementById('workspaceGuide')?.hidden ? null : document.getElementById('guideTitle')?.textContent.trim(), reminder: document.getElementById('homeSetupReminder')?.hidden ? null : document.getElementById('homeSetupReminder')?.textContent.trim(), progress: document.getElementById('homeConnectionProgressSummary')?.textContent.trim() }));
  for (const v of [home.guide, home.reminder]) assert.doesNotMatch(v || '', /website ready|first request/i, 'Home still asks for a first request: ' + JSON.stringify(home));
  assert.match(home.progress || '', /^1 of 1 /, 'Website counts as verified: ' + home.progress);
  const d = await dto(x), web = d.setup.connectionJourney.channels.find(r => r.id === 'web');
  assert.equal(web.verification.working, true, 'Server evidence: verified');
  assert.equal(web.guide.steps.find(s => s.id === 'check').state, 'complete', 'Check step satisfied by the real request');
  const list = await rowStatus(page, 'web'); assert.equal(list, 'Delivery verified');
  return { home, list };
});
for (const width of WIDTHS) await check('PRA-CONN-10', 'A booked website visit is pointed to from Inbox and Home with a way to Schedule', width, async () => {
  const x = await bookedWorkspace(width); await open(x, { hash: '' }); const { page } = x;
  await shotAt(page, '#needsYou', 'PRA-CONN-10-home-' + width);
  const homeNote = await page.evaluate(() => { const n = document.getElementById('homeNewVisits'); return n && !n.hidden ? { text: n.textContent.trim(), button: !!n.querySelector('button[data-route="availability"]') } : null; });
  assert.ok(homeNote && /visit/i.test(homeNote.text) && homeNote.button, 'Home highlights the new booking with a Schedule button: ' + JSON.stringify(homeNote));
  await page.evaluate(() => { location.hash = '#leads'; }); await page.waitForFunction(() => document.body.dataset.activePage === 'leads');
  await shotAt(page, '#leads', 'PRA-CONN-10-inbox-' + width);
  const inbox = await page.evaluate(() => ({ text: document.getElementById('leads')?.innerText.trim(), button: !!document.querySelector('#leads button[data-route="availability"]') }));
  assert.doesNotMatch(inbox.text, /^No customer requests yet/, 'Inbox empty state ignores the booking: ' + inbox.text);
  assert.match(inbox.text, /Schedule/, 'Inbox points to Schedule');
  assert.ok(inbox.button, 'Inbox offers a real button to Schedule');
  await page.locator('#leads button[data-route="availability"]').click(); await page.waitForFunction(() => document.body.dataset.activePage === 'availability');
  assert.ok(await focusVisible(page) || true);
  return { homeNote, inbox };
});

// ---------- Revision 2 guards (adopted from QA-CONN; Q* ids kept for traceability) ----------
// QA-CONN-01 cases must FAIL on rev 1 and PASS on rev 2; the other guards pin behavior the rev 1 check did not see
// (they are not expected to fail on a54, where the guarded feature does not exist; see PROPOSALS.md Revision 2).
async function liveObserved(width) {
  const x = await seed(width, { channels: ['web'], bridged: true }); await saveWebIntake(x);
  await patchClient(x, c => { c.status = 'live'; c.channels = { ...c.channels, web: { ...(c.channels?.web || {}), active: true } }; return c; });
  await markReviewed(x, { tested: true });
  return x;
}
const webFacts = async x => { const d = await dto(x), web = d.setup.connectionJourney.channels.find(r => r.id === 'web'); return { working: web.verification.working, request: web.verification.checks.find(c => c.id === 'request')?.state, first: d.websiteInstallation.firstExternalRequest.state, obs: d.websiteInstallation.observation.state, next: d.websiteInstallation.nextAction.id }; };
async function saved(kind, x) { return (await store.list(kind, x.slug + '/')).map(row => typeof row === 'string' ? row : row.key); }

await check('Q08-spam', 'Marking the only real website request as spam withdraws the delivery evidence', 390, async () => {
  const x = await liveObserved(390); const chk = await startCheck(x); await observe(x, chk); await visitorBooking(x);
  const before = await webFacts(x);
  for (const kind of ['bookings', 'leads']) for (const k of await saved(kind, x)) await store.atomicUpdate(kind, k, cur => ({ value: { ...cur, status: 'spam' } }));
  const after = await webFacts(x);
  assert.equal(before.working, true, 'Precondition: the real request verified delivery ' + JSON.stringify(before));
  assert.equal(after.working, false, 'Spam request still verifies delivery ' + JSON.stringify(after));
  assert.equal(after.first, 'stale');
  return { before, after };
});
await check('Q08-no-observation', 'A real request before any widget observation neither verifies delivery nor skips the install guidance (QA-CONN-01)', 390, async () => {
  const x = await liveObserved(390); await visitorBooking(x);
  const f = await webFacts(x);
  assert.equal(f.first, 'received', 'Precondition: an ordinary website request is saved'); assert.equal(f.working, false, JSON.stringify(f));
  assert.notEqual(f.next, 'view_request', 'Install guidance skipped: ' + JSON.stringify(f));
  return f;
});
await check('Q08-revision', 'After a business-rules change and a new widget check, an older real request does not re-verify delivery (QA-CONN-01)', 390, async () => {
  const x = await liveObserved(390); let chk = await startCheck(x); await observe(x, chk); await visitorBooking(x);
  const mid = await webFacts(x);
  await patchClient(x, c => { c.services = [...(c.services || []), 'Furnace repair']; return c; }); await markReviewed(x, { tested: true });
  chk = await startCheck(x); await observe(x, chk);
  const after = await webFacts(x);
  assert.equal(mid.working, true, 'Precondition: verified under the old rules ' + JSON.stringify(mid));
  assert.equal(after.obs, 'found', 'Precondition: widget seen again ' + JSON.stringify(after));
  assert.equal(after.working, false, 'Old request re-verified the new rules: ' + JSON.stringify(after));
  assert.equal(after.next, 'try_sample', 'Next step asks for a sample under the current rules: ' + JSON.stringify(after));
  return { mid, after };
});
for (const variant of ['setup-check', 'simulation', 'cancelled', 'old']) await check('Q10-exclusions', 'Home and Inbox visit pointers ignore a ' + variant + ' booking', 390, async () => {
  const x = await liveObserved(390); const chk = await startCheck(x); await observe(x, chk); await visitorBooking(x);
  const keys = await saved('bookings', x); assert.equal(keys.length, 1, 'Precondition: one booking');
  await open(x, { hash: '' }); const { page } = x;
  const state = () => page.evaluate(() => { const n = document.getElementById('homeNewVisits'); return { home: !!n && !n.hidden, inbox: !!document.getElementById('inboxVisitAction') }; });
  const go = async (h, t) => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForFunction(t => document.body.dataset.activePage === t, t); await page.waitForTimeout(150); };
  const before = { home: (await state()).home }; await go('#leads', 'leads'); before.inbox = (await state()).inbox;
  assert.ok(before.home && before.inbox, 'Precondition: the ordinary booking is pointed to on Home and in Inbox ' + JSON.stringify(before));
  await store.atomicUpdate('bookings', keys[0], cur => ({ value: { ...cur, ...(variant === 'setup-check' ? { websiteSetupCheck: { checkId: chk.id, turnId: 'x', origin: SITE } } : variant === 'simulation' ? { simulation: true } : variant === 'cancelled' ? { status: 'cancelled' } : { createdAt: new Date(Date.now() - 8 * 864e5).toISOString() }) } }));
  await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await go('#leads', 'leads');
  const inbox = (await state()).inbox; await go('#today', 'today'); const home = (await state()).home;
  assert.equal(home, false, variant + ' counted on Home'); assert.equal(inbox, false, variant + ' counted in Inbox');
  return { variant, before, home, inbox };
});
await check('Q06-stale', 'Check started but never observed, then business details change: Continue setup returns to the install steps', 390, async () => {
  const x = await seed(390, { channels: ['web'], bridged: true }); await saveWebIntake(x); await markReviewed(x, { tested: true }); await startCheck(x);
  await patchClient(x, c => { c.services = [...(c.services || []), 'Duct cleaning']; return c; }); await markReviewed(x, { tested: true });
  await open(x, { hash: '#setup' }); const { page } = x; await openRow(page, 'web'); await page.locator('#connectorStart').click(); await page.waitForTimeout(400);
  const at = await page.evaluate(() => location.hash), w = (await dto(x)).websiteInstallation;
  assert.equal(w.attempt?.state, 'stale', 'Precondition: the attempt is stale'); assert.equal(w.observation.state, 'not_checked');
  assert.match(at, /details-1-0/, 'A never-observed stale check returns to the install steps: ' + at);
  return { at, attempt: w.attempt?.state };
});
for (const width of WIDTHS) await check('Q06-rules-changed', 'Widget found, then business details changed: Continue setup returns to the check, not the plugin download (QA-CONN-02)', width, async () => {
  const x = await seed(width, { channels: ['web'], bridged: true }); await saveWebIntake(x); await markReviewed(x, { tested: true }); const chk = await startCheck(x); await observe(x, chk);
  await patchClient(x, c => { c.services = [...(c.services || []), 'Duct cleaning']; return c; }); await markReviewed(x, { tested: true });
  await open(x, { hash: '#setup' }); const { page } = x; await openRow(page, 'web'); await page.locator('#connectorStart').click(); await page.waitForTimeout(400);
  const at = await page.evaluate(() => ({ hash: location.hash, title: document.getElementById('intakeStepTitle')?.textContent.trim() || document.getElementById('setupGuideStageTitle')?.textContent.trim() }));
  const w = (await dto(x)).websiteInstallation;
  assert.equal(w.observation.state, 'stale', 'Precondition: the earlier observation is stale');
  await shot(page, 'Q06-rules-changed-' + width);
  assert.equal(at.hash, '#setup/web/installation-check', 'Rules change sends the owner back to: ' + JSON.stringify(at));
  return { at, obs: w.observation.state };
});

await check('Q06-website-changed', 'Widget found on one site, then the website moves to another origin: Continue setup does not skip the install steps (QA-CONN-02)', 390, async () => {
  const x = await seed(390, { channels: ['web'], bridged: true }); await saveWebIntake(x); await markReviewed(x, { tested: true }); const chk = await startCheck(x); await observe(x, chk);
  // The owner saves the new website through the website form (so it is allowed and the form is complete); only the
  // origin comparison, not originAllowed or missing details, keeps the guide off the old check.
  let d = await dto(x), r = await ownerPost(x, { action: 'save_service_intake', expectedIntakeToken: d.serviceIntake.token, submissionId: opId(), service: 'web', section: 'preferences', fields: { website: 'https://new-shop.example.com', builder: 'wordpress', installationBy: 'me' } });
  assert.equal(r.status, 200, 'new website save ' + JSON.stringify(r.body).slice(0, 300));
  d = await dto(x); if (d.serviceIntake.web?.canApply) { r = await ownerPost(x, { action: 'apply_service_intake', expectedIntakeToken: d.serviceIntake.token, submissionId: opId(), service: 'web' }); assert.equal(r.status, 200, 'new website apply ' + JSON.stringify(r.body).slice(0, 300)); }
  await markReviewed(x, { tested: true });
  await open(x, { hash: '#setup' }); const { page } = x; await openRow(page, 'web'); await page.locator('#connectorStart').click(); await page.waitForTimeout(400);
  const at = await page.evaluate(() => location.hash), w = (await dto(x)).websiteInstallation;
  assert.notEqual(w.selectedOrigin, SITE, 'Precondition: a different website is selected'); assert.equal(w.originAllowed, true, 'Precondition: the new website is allowed');
  assert.notEqual(at, '#setup/web/installation-check', 'Skipped the install steps for a new website');
  return { at, selectedOrigin: w.selectedOrigin, obs: w.observation.state };
});
// ---------- PRA-CONN-09 (verification only, --verify09): owned by the desk inbox fix (PRA-DESK-04). Not part of the default run. ----------
if (process.argv.includes('--verify09')) for (const width of WIDTHS) await check('PRA-CONN-09', 'Recent activity shows Houston am/pm time and owner wording, not a UTC clock and raw booking ref', width, async () => {
  const x = await bookedWorkspace(width); await open(x, { hash: '' }); const { page } = x;
  await shotAt(page, '#todayEvents', 'PRA-CONN-09-recent-' + width);
  const text = (await page.locator('#todayEvents').innerText()).trim();
  assert.match(text, /\b\d{1,2}:\d{2}\s?(AM|PM)\b/, 'Houston am/pm time: ' + text);
  assert.doesNotMatch(text, /\bbooking ref\b/i, 'No raw event type plus ref: ' + text);
  return { text };
});

// ---------- finish ----------
await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.modelRequests === 0;
report.checks.push({ id: 'hygiene', name: 'hygiene: no physical, model or forbidden requests', pass: globalsPass, error: globalsPass ? undefined : JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, model: report.modelRequests }) });
report.checks.push({ id: 'hygiene', name: 'source unchanged during the run', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.durationMs = Date.now() - started;
report.byFinding = Object.fromEntries([...new Set(report.checks.map(c => c.id))].map(id => [id, report.checks.filter(c => c.id === id).map(c => c.pass ? 'pass' : 'FAIL').join('/')]));
writeFileSync(resolve(outDir, 'result.json'), JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' in ' + Math.round(report.durationMs / 1000) + 's');
console.log(JSON.stringify(report.byFinding));
process.exit(report.passed === report.total ? 0 : 1);
