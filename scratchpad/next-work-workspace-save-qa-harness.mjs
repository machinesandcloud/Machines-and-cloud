// Independent review of the three product surfaces. Real assets and actual
// memory-backed owner/admin/access handlers; explicit faults are labelled below.
// No mailbox, model, provider or physical HTTP request can leave this process.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const output = '/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/scratchpad/next-work-workspace-save-qa.json';
const surface = 'workspace';
const initialAttempt = existsSync(output) ? JSON.parse(readFileSync(output)) : null;
if (!['all', 'onboard', 'workspace', 'admin'].includes(surface)) throw new Error('Choose --surface all|onboard|workspace|admin');
const base = 'http://127.0.0.1:8936', root = resolve('.'), prefix = output.slice(0, -5);
const files = ['product-ui.css', 'styles.css', 'netlify/functions/access.mjs', 'netlify/functions/client.mjs', 'netlify/functions/manage.mjs', 'netlify/functions/lib/operator.mjs', ...(surface === 'all' || surface === 'onboard' ? ['onboard.html', 'onboard.css', 'onboard.js', 'assets/logo.png', 'assets/logo-dark.png'] : []), ...(surface === 'all' || surface === 'workspace' ? ['desk.html', 'desk.css', 'desk.js', 'desk-connections.js', 'desk-connections.css', 'assets/logo.png', 'assets/logo-dark.png'] : []), ...(surface === 'all' || surface === 'admin' ? ['admin.html', 'admin.css', 'admin.js', 'assets/logo.png', 'assets/logo-dark.png'] : [])];
const sha = x => createHash('sha256').update(x).digest('hex');
const hashes = () => Object.fromEntries(files.filter(existsSync).map(file => [file, sha(readFileSync(file))]));
const report = { at: new Date().toISOString(), surface, scope: 'Independent browser review of actual product assets and actual isolated-memory handlers. Loading, failure and empty-list responses are explicit fixtures. No signup, email, AI, provider, purchase, calendar mutation or deploy.', sourceBefore: hashes(), harnessHash: sha(readFileSync(new URL(import.meta.url))), checks: [], requests: [], screenshots: [], pageErrors: [], forbiddenRequests: [], fontRequestsBlocked: [], physicalNetwork: 0 };
if (initialAttempt) report.initialAttempt = initialAttempt;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: base, PUBLIC_SITE_URL: base, ADMIN_EMAILS: 'revamp-operator@example.test' });
const deny = () => { report.physicalNetwork++; throw new Error('Independent portal QA physical network denied'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const { register, createRequire } = await import('node:module');
const mainRequire = createRequire('/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/package.json');
register('data:text/javascript,' + encodeURIComponent(`import {createRequire} from 'node:module'; import {pathToFileURL} from 'node:url'; const req=createRequire('/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/package.json'); export async function resolve(s,c,n){if(!s.startsWith('.')&&!s.startsWith('/')&&!s.includes(':')){try{return {url:pathToFileURL(req.resolve(s)).href,shortCircuit:true};}catch{}}return n(s,c);}`));
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const store = await import('file:///tmp/mc-campaign-redacted-e997/netlify/functions/lib/store.mjs');
const { accessHash } = await import('file:///tmp/mc-campaign-redacted-e997/netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('file:///tmp/mc-campaign-redacted-e997/netlify/functions/lib/config.mjs');
const handlers = Object.fromEntries(await Promise.all(['access', 'client', 'manage'].map(async name => ['/api/' + name, (await import('file:///tmp/mc-campaign-redacted-e997/netlify/functions/' + name + '.mjs')).default])));
let serial = 0;
const ownerToken = sha('revamp-independent-owner'), operatorToken = sha('revamp-independent-operator'), draftToken = sha('revamp-independent-draft');
const now = new Date().toISOString();
async function session(token, email, scope = 'onboarding') { await store.put('access_sessions', accessHash(token), { email, scope, status: 'active', createdAt: now, expiresAt: new Date(Date.now() + 3600000).toISOString() }); }
await session(ownerToken, 'revamp-owner@example.test'); await session(operatorToken, process.env.ADMIN_EMAILS, 'operator'); await session(draftToken, 'revamp-draft@example.test');
const business = newClient({ slug: 'revamp-fixture-air', ownerKey: 'PRIVATE-CANARY-OWNER-NOT-UI', owner: { name: 'Alex Rivera', email: 'revamp-owner@example.test', phone: '+17135550198' }, business: { name: 'Fixture Air & Heat', trade: 'HVAC', city: 'Houston', serviceArea: ['Katy', 'Cypress'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture.example.test' } });
Object.assign(business, { onboarding: { version: 1, verifiedEmail: business.owner.email, desiredChannels: ['web', 'voice', 'sms', 'calendar'], phoneSetupMode: 'forward_business_line' }, status: 'testing', build: { status: 'built', source: 'owner_answers' }, services: ['AC repair', 'Heat pump maintenance'], windows: ['8 to 12', '12 to 5'] });
business.rules.hours = parseHours('Mon-Fri 8am-5pm'); business.phone.businessNumber = '+17135550197';
await store.put('clients', business.slug, business);
const repairBusiness = structuredClone(business);
Object.assign(repairBusiness, { slug: 'revamp-fixture-plumbing', ownerKey: 'PRIVATE-CANARY-REPAIR-NOT-UI', owner: { ...business.owner, email: 'revamp-repair@example.test' }, business: { ...business.business, name: 'Fixture Plumbing', trade: 'Plumbing' }, build: { status: 'failed', notes: 'Synthetic repair case for operations review.' }, management: { audit: [{ id: 'fixture-history', at: now, actor: 'revamp-operator@example.test', action: 'update_rules', reason: 'Saved fixture service coverage correction' }], notes: [], revision: 1 } });
await store.put('clients', repairBusiness.slug, repairBusiness);
await store.put('bookings', business.slug + '/fixture-booking', { id: 'fixture-booking', customer_name: 'Fixture Customer', name: 'Fixture Customer', phone: '+17135550196', issue: 'AC not cooling', address: '12 Fixture St, Katy', date: '2026-10-30', window: '8 to 12', status: 'requested', createdAt: now });
await store.put('leads', business.slug + '/fixture-lead', { id: 'fixture-lead', customer_name: 'Fixture Callback', name: 'Fixture Callback', phone: '+17135550195', issue: 'Furnace quote question', outcome: 'wants_call', status: 'open', alertWaiting: true, createdAt: now });
await store.put('conversations', business.slug + '/fixture-conversation', { id: 'fixture-conversation', channel: 'web', contact: 'Fixture Customer', updatedAt: now, messages: [{ role: 'user', content: 'My AC is running but the house is warm.' }, { role: 'assistant', content: 'Which neighborhood are you in?' }] });
const fields = { setupVersion: '2', name: 'Alex Rivera', phone: '7135550198', business: 'Fixture Air & Heat', trade: 'HVAC', services: 'AC repair\nHeat pump maintenance', serviceArea: 'Katy\nCypress', hours: 'Mon-Fri 8am-5pm', windows: '8 to 12\n12 to 5', desiredChannels: ['web'], plan: 'starter', never: 'Do not quote replacement equipment.', tier0: 'Smoke or fire', handoff: 'Warranty questions' };
async function draft(step = 0, extra = {}) { await store.put('onboarding_drafts', accessHash('revamp-draft@example.test'), { fields: { ...fields, ...extra }, step, revision: 0, updatedAt: now }); }
await draft();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
const contexts = [];
async function contextFor({ token, width = 1440, holdPath = null, failPath = null, emptyOwner = false, emptyAdmin = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' }); contexts.push(context); context.setDefaultTimeout(6500);
  if (token) await context.addInitScript(value => { if (location.origin !== value.origin) return; const operator = value.token === value.operatorToken; sessionStorage.setItem(operator ? 'mc-operator-session-v1' : 'mc-onboarding-session-v1', value.token); localStorage.setItem('mc-walkthrough-v1:revamp-fixture-air', 'seen'); }, { token, operatorToken, origin: base });
  await context.routeWebSocket('**/*', socket => socket.close());
  let releaseHold, markHeld;
  const held = new Promise(resolve => { markHeld = resolve; });
  const gate = new Promise(resolve => { releaseHold = resolve; });
  const state = { failPath, holdPath, emptyOwner, emptyAdmin, held, release: releaseHold };
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if (url.origin !== base) {
      if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { report.fontRequestsBlocked.push(url.origin); return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); }
      report.forbiddenRequests.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/api/')) {
      const method = incoming.method(), body = ['GET', 'HEAD'].includes(method) ? null : incoming.postDataJSON();
      if (state.holdPut && method === 'PUT') { state.holdPut = false; markHeld(); await gate; }
      if (state.holdPath === url.pathname && method === 'GET') { state.holdPath = null; markHeld(); await gate; }
      if (state.failPath === url.pathname && method === 'GET') { report.requests.push({ path: url.pathname, method, fixture: 'explicit load503', status: 503 }); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"qa_load_failed","message":"This test response simulates temporarily unavailable storage. Please retry."}' }); }
      if (url.pathname === '/api/chat') { report.requests.push({ path: url.pathname, method, fixture: 'explicit offline503', status: 503 }); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' }); }
      // No mailbox creation or onboarding create is included in this suite.
      if (body?.action === 'request_link' || url.pathname === '/api/onboard') { report.forbiddenRequests.push({ path: url.pathname, method, action: body?.action }); return route.fulfill({ status: 403, body: '{"error":"qa_forbidden_action"}' }); }
      const handler = handlers[url.pathname]; if (!handler) { report.forbiddenRequests.push({ path: url.pathname, method }); return route.fulfill({ status: 404, body: '{"error":"qa_unknown_route"}' }); }
      let response = await handler(new Request(url, { method, headers: incoming.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.' + (++serial % 230 + 1) });
      let payload = await response.json();
      if (state.emptyOwner && method === 'GET' && url.pathname === '/api/client' && response.ok) payload = { ...payload, bookings: [], leads: [], conversations: [], events: [], today: { calls: 0, texts: 0, bookings: 0, needsYou: 0 } };
      if (state.emptyAdmin && method === 'GET' && url.pathname === '/api/manage' && response.ok && !url.searchParams.has('c')) payload = { ...payload, customers: [], total: 0, nextCursor: null, summary: { customers: 0, active: 0, needsAttention: 0, setupPending: 0, scope: 'Current page' }, inquiries: [], platformSMS: [] };
      report.requests.push({ path: url.pathname, query: url.search, method, action: body?.action, status: response.status, ...(state.emptyOwner && url.pathname === '/api/client' || state.emptyAdmin && url.pathname === '/api/manage' ? { fixture: 'explicit empty collection projection over actual authorized read' } : {}) });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(payload) });
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    const path = resolve(root, relative);
    if (!path.startsWith(root + '/') || relative.split(/[\\/]/).some(x => x.startsWith('.')) || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'QA asset unavailable' });
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  return { context, page, state };
}
async function check(name, test) { try { await test(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } }
async function shot(page, suffix, fullPage = false) { const path = prefix + '-' + suffix + '.png'; assert.equal(existsSync(path), false); await page.screenshot({ path, fullPage }); report.screenshots.push(path); }
async function fits(page) { const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(geometry.document <= geometry.viewport + 1, JSON.stringify(geometry)); }
async function logoFits(page) { const images = await page.locator('img').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && /logo/.test(node.src)).map(node => ({ src: new URL(node.src).pathname, loaded: node.complete && node.naturalWidth > 0, ratio: node.getBoundingClientRect().width / node.getBoundingClientRect().height, natural: node.naturalWidth / node.naturalHeight }))); assert.ok(images.length); for (const image of images) { assert.ok(image.loaded, image.src); assert.ok(Math.abs(image.ratio / image.natural - 1) < .025, JSON.stringify(image)); } }
async function dismissTour(page) { if (await page.locator('#guideDialog').isVisible()) await page.locator('#skipGuide').click(); }
async function openDesk(options = {}, fragment = '') { const fixture = await contextFor({ token: ownerToken, ...options }); await fixture.page.goto(base + '/desk.html?c=' + business.slug + fragment); await fixture.page.locator('#title').filter({ hasText: business.business.name }).waitFor(); await dismissTour(fixture.page); return fixture; }
async function openAdmin(options = {}) { const fixture = await contextFor({ token: operatorToken, ...options }); await fixture.page.goto(base + '/admin.html'); await fixture.page.locator('#app:not([hidden])').waitFor(); return fixture; }
async function routeDesk(page, tab) { await page.locator('[data-t="' + tab + '"]').focus(); await page.keyboard.press('Enter'); await page.locator('#p-' + tab + '.on').waitFor(); }

try {
  await check('Pending-save edit loss reproduced in actual published workspace assets', async () => {
    const { page, state } = await openDesk(); await routeDesk(page, 'know');
    await page.locator('#cfg details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    await page.locator('#cfg [name="owner.name"]').fill('Submitted first name');
    state.holdPut = true;
    await page.locator('#cfg').evaluate(form => form.requestSubmit()); await state.held;
    await page.locator('#cfg [name="owner.name"]').fill('Typed while save pending');
    report.pendingEdit = { submitted: 'Submitted first name', typedDuringPending: await page.locator('#cfg [name="owner.name"]').inputValue() };
    state.release();
    await page.waitForFunction(() => document.querySelector('#cfg [name="owner.name"]').value === 'Submitted first name');
    report.pendingEdit.afterCompletion = await page.locator('#cfg [name="owner.name"]').inputValue();
    report.pendingEdit.saveMessage = await page.locator('#saveMsg').innerText();
    report.pendingEdit.persisted = (await store.get('clients', business.slug)).owner.name;
    assert.equal(report.pendingEdit.afterCompletion, report.pendingEdit.submitted);
    assert.match(report.pendingEdit.saveMessage, /Saved/);
  });
  await check('Invalid owner phone produces false success through actual published PUT handler and UI', async () => {
    const { page } = await openDesk(); await routeDesk(page, 'know');
    await page.locator('#cfg details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
    const oldPhone = (await store.get('clients', business.slug)).owner.phone;
    await page.locator('#cfg [name="owner.phone"]').fill('not-a-phone');
    const start = report.requests.length;
    await page.locator('#cfg').evaluate(form => form.requestSubmit());
    await page.locator('#saveMsg').filter({ hasText: /^Saved/ }).waitFor();
    await page.waitForFunction(phone => document.querySelector('#cfg [name="owner.phone"]').value === phone, oldPhone);
    report.invalidPhone = { submitted: 'not-a-phone', displayedAfterCompletion: await page.locator('#cfg [name="owner.phone"]').inputValue(), persisted: (await store.get('clients', business.slug)).owner.phone, saveMessage: await page.locator('#saveMsg').innerText(), request: report.requests.slice(start).find(x => x.method === 'PUT') };
    assert.equal(report.invalidPhone.persisted, oldPhone);
    assert.equal(report.invalidPhone.request.status, 200);
    assert.match(report.invalidPhone.saveMessage, /^Saved/);
  });
} finally {
  for (const context of contexts) await context.close(); await browser.close();
  report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.summary = { passed: report.checks.filter(x => x.pass).length, failed: report.checks.filter(x => !x.pass).length };
  report.limits = 'Two bounded isolated-memory browser reproductions against exact published checkout assets and actual client/access handlers; all browser HTTP is fulfilled in process. No live account, provider, model, message, signup, physical HTTP or production read. Passing checks confirm the defects, not a repaired implementation.';
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, ...report.summary, physicalNetwork: report.physicalNetwork, sourceStable: report.sourceStable, failures: report.checks.filter(x => !x.pass).map(x => ({name:x.name,error:x.error})) }));
}
