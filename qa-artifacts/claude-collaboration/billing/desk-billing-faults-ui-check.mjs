// Browser check of the owner's Plan & billing card (desk-billing.js) at 390 and 1440, pointer and keyboard.
// Actual /api/client and /api/access handlers run in-process (memory store, fake model, provider env deleted, physical
// transport denied). /api/workspace-billing is a context.route FIXTURE: with empty env the actual handler answers GET
// with {status:'none', offerAvailable:false} and refuses review/checkout/portal/cancel with 503 billing_unavailable
// (no WORKSPACE_BILLING_OFFER_JSON / Stripe key), so the fixture mirrors the response shapes of
// netlify/functions/workspace-billing.mjs + lib/workspace-billing.mjs view()/quoteView()/openWorkspaceBillingPortalImpl.
// The fixture authenticates with the actual getAccessSession(). Stripe hosts are never reached: navigations to
// checkout.stripe.com / billing.stripe.com are fulfilled by an inline stub and recorded; DNS is mapped to NOTFOUND.
// Faults: abort before the handler, lost response after the fixture committed, non-JSON 5xx, JSON 4xx, slow reply
// (held past the 15 s client timeout), double click. Storage: blocked after load, mismatch, expiry, sign-out.
// Usage (from the worktree root):
//   MC_PLAYWRIGHT_EXECUTABLE=<chrome-headless-shell> node qa-artifacts/claude-collaboration/billing/desk-billing-faults-ui-check.mjs \
//     --output scratchpad/claude-billing-<name>.json [--billing-source <desk-billing.js>] [--only <substring>]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), origin = 'http://127.0.0.1:8932';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), only = arg('--only'), playwrightPath = arg('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const billingSource = arg('--billing-source') ? resolve(arg('--billing-source')) : resolve(root, 'desk-billing.js');
if (!output || !/^scratchpad\/claude-billing-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-billing-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const watched = ['desk.html', 'desk.js', 'desk.css', 'desk-billing.js', 'desk-billing.css', 'netlify/functions/workspace-billing.mjs', 'netlify/functions/lib/workspace-billing.mjs', 'netlify/functions/client.mjs', 'netlify/functions/access.mjs', 'qa-artifacts/claude-collaboration/billing/desk-billing-faults-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual /api/client + /api/access in-process; /api/workspace-billing context.route fixture mirroring handler shapes; memory store; fake model; provider env deleted; physical transport denied; Stripe navigations stubbed', billingSource: arg('--billing-source') || 'desk-billing.js', servedBillingSha256: [], sourceBefore: hashes(), checks: [], screenshots: [], requests: [], stripeNavigations: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|WORKSPACE_BILLING_|MANAGED_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Billing check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash, getAccessSession } = await import('../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../netlify/functions/lib/config.mjs');
const actualBilling = (await import('../../../netlify/functions/workspace-billing.mjs')).default;
const handlers = {};
for (const file of ['client', 'access', 'chat']) { const mod = await import('../../../netlify/functions/' + file + '.mjs'); for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default; }

const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browser = process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome';
let serial = 0; const contexts = [];
const hex = () => randomBytes(16).toString('hex');
const PERIOD_END = '2026-12-10T18:00:00.000Z';

// ---------- fixture mirroring lib/workspace-billing.mjs view() / quoteView() ----------
function view(fx) {
  const subscribed = fx.status !== 'none' && !['canceled', 'incomplete_expired'].includes(fx.status);
  return { status: fx.status, plan: subscribed ? 'starter' : null, services: subscribed ? ['web'] : [], name: subscribed ? 'Coverage' : null, currentPeriodEnd: subscribed ? PERIOD_END : null, cancelAtPeriodEnd: fx.cancelAtPeriodEnd === true, cancellationState: fx.cancellationState || null, checkout: fx.checkout ? { requestId: fx.checkout.requestId, state: fx.checkout.state, expiresAt: fx.checkout.expiresAt, url: fx.checkout.state === 'open' ? fx.checkout.url : null } : null, portalAvailable: subscribed, offerAvailable: !subscribed, availablePlans: [{ id: 'starter', name: 'Coverage', amountCents: 9900, currency: 'usd' }, { id: 'growth', name: 'Follow-through', amountCents: 24900, currency: 'usd' }], livemode: false };
}
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...names].sort().join(',');
const json = (value, status = 200) => ({ status, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(value) });
const fail = (error, message, status = 409) => json({ error, message }, status);
async function fixture(x, request, url, body) {
  const fx = x.fx, session = await getAccessSession(new Request(url, { headers: request.headers() }));
  if (!session) return fail('verification_required', 'Sign in by email to manage billing.', 401);
  if (url.searchParams.get('c') !== x.slug || session.email !== x.c.owner.email) return fail('forbidden', undefined, 403);
  if (request.method() === 'GET') return json({ ok: true, billing: view(fx) });
  const action = body?.action;
  if (action === 'review') {
    if (!exact(body, ['action', 'plan', 'expectedRevision']) || !['starter', 'growth'].includes(body.plan)) return fail('invalid_billing_request', 'Choose Coverage or Follow-through to review its terms.', 400);
    fx.effects.push({ action }); const reviewId = hex(); fx.reviews.push(reviewId);
    return json({ ok: true, review: { reviewId, expiresAt: new Date(Date.now() + 900000).toISOString(), offer: { version: 'qa_fixture_v1', digest: 'f'.repeat(64), plan: body.plan, name: body.plan === 'starter' ? 'Coverage' : 'Follow-through', amountCents: body.plan === 'starter' ? 9900 : 24900, currency: 'usd', interval: 'month', services: ['web'], limits: {}, limitsDescription: 'Fixture limits description for the offline billing check of the owner desk.', terms: { version: 'qa_terms_v1', text: 'Fixture monthly terms. '.repeat(6), url: origin + '/terms.html' }, livemode: false, additionalUsageCharges: false, trialDays: 0 } } });
  }
  if (action === 'checkout') {
    if (!exact(body, ['action', 'reviewId', 'requestId', 'acceptedTerms', 'expectedRevision']) || !/^[a-f0-9]{32}$/.test(body.requestId) || body.acceptedTerms !== true) return fail('billing_acceptance_required', 'Review the monthly price and service terms, then check the agreement to continue.', 400);
    if (!fx.reviews.includes(body.reviewId)) return fail('billing_review_expired', 'Review your current offer again before checkout.');
    if (fx.checkout && fx.checkout.requestId !== body.requestId) return fail('checkout_exists', 'A checkout is already saved. Continue it or check its status first.');
    if (!fx.checkout) { fx.checkout = { requestId: body.requestId, state: 'open', expiresAt: new Date(Date.now() + 3600000).toISOString(), url: 'https://checkout.stripe.com/c/pay/cs_test_fixture' + x.slug.replace(/\W/g, '') }; fx.effects.push({ action, requestId: body.requestId, created: true }); }
    else fx.effects.push({ action, requestId: body.requestId, created: false });
    return json({ ok: true, billing: view(fx) });
  }
  if (action === 'refresh') { if (!exact(body, ['action'])) return fail('invalid_billing_request', 'Check the saved billing status.', 400); fx.effects.push({ action }); if (fx.onRefresh) { fx.onRefresh(fx); fx.onRefresh = null; } return json({ ok: true, billing: view(fx) }); }
  if (action === 'cancel_renewal') {
    if (!exact(body, ['action', 'requestId', 'confirmed']) || body.confirmed !== true) return fail('billing_confirmation_required', 'Confirm ending renewal before continuing.', 400);
    if (fx.status !== 'active') return fail('subscription_missing', 'There is no active subscription to change.');
    fx.effects.push({ action, requestId: body.requestId }); fx.cancellationState = 'pending'; fx.pendingCancel = true;
    return json({ ok: true, billing: view(fx) });
  }
  if (action === 'portal') {
    if (!exact(body, ['action', 'requestId']) || !/^[a-f0-9]{32}$/.test(body.requestId)) return fail('invalid_billing_request', 'Open payment details from this workspace.', 400);
    if (fx.status !== 'active') return fail('billing_portal_unavailable', 'Payment details become available after your subscription is confirmed.', 409);
    if (!fx.portal || fx.portal.requestId !== body.requestId) { fx.portal = { requestId: body.requestId }; fx.effects.push({ action, requestId: body.requestId, created: true }); } else fx.effects.push({ action, requestId: body.requestId, created: false });
    return json({ ok: true, portal: { url: 'https://billing.stripe.com/p/session/test_fixture' + x.slug.replace(/\W/g, ''), expiresAt: new Date(Date.now() + 300000).toISOString() } });
  }
  return fail('invalid_billing_request', undefined, 400);
}
const confirmCancel = fx => { if (fx.pendingCancel) { fx.cancelAtPeriodEnd = true; fx.cancellationState = 'complete'; } };

async function seed(width, { subscribed = false } = {}) {
  const slug = 'bill-ui-' + ++serial + '-' + width, token = sha('bill-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Billing Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture-shop.example.com' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, c, width, fx: { status: subscribed ? 'active' : 'none', checkout: subscribed ? { requestId: hex(), state: 'complete', expiresAt: null } : null, reviews: [], effects: [], requests: [] }, fault: null };
}
async function open(x, { height = 900 } = {}) {
  const { slug, token, width } = x;
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(8000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; if (!sessionStorage.getItem('mc-onboarding-session-v1')) sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) { report.stripeNavigations.push({ slug, href: url.href, navigation: request.isNavigationRequest() }); x.navigations = (x.navigations || 0) + 1; return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Intercepted Stripe boundary</title><p>Intercepted</p>' }); }
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname === '/api/workspace-billing') {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      const item = { slug, method, action: body?.action || null, requestId: body?.requestId || null, auth: (request.headers().authorization || '').slice(7) === x.token ? 'owner' : (request.headers().authorization ? 'other' : 'none') };
      x.fx.requests.push(item); report.requests.push(item);
      const fault = x.fault && x.fault.match(body, method) ? x.fault : null; if (fault && !fault.sticky) x.fault = null;
      if (fault) item.fault = fault.kind;
      if (fault?.kind === 'abort-before') return route.abort('failed');
      if (fault?.kind === 'html-503') return route.fulfill({ status: 503, contentType: 'text/html', body: '<!doctype html><title>503</title><h1>Service Unavailable</h1>' });
      if (fault?.kind === 'json-4xx') return route.fulfill(fault.response);
      if (fault?.kind === 'slow') { await new Promise(r => setTimeout(r, fault.ms)); }
      const response = await fixture(x, request, url, body); item.status = response.status;
      if (fault?.kind === 'lost-after') { item.lostAfterEffect = true; return route.abort('failed'); }
      return route.fulfill(response).catch(error => { item.fulfillError = String(error.message).slice(0, 120); });
    }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(body?.action)) { report.forbidden.push({ path: url.pathname, action: body?.action }); return route.fulfill({ status: 403, body: '{}' }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.72' });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    if (url.pathname === '/desk-billing.js') { const bytes = readFileSync(billingSource), digest = sha(bytes); if (!report.servedBillingSha256.includes(digest)) report.servedBillingSha256.push(digest); return route.fulfill({ contentType: 'text/javascript', body: bytes }); }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => (x.probing ? (report.syntheticProbeErrors ||= []) : report.pageErrors).push({ slug, message: error.message }));   // probe: a synthetic mc:desk after the desk cleared its DOM makes unrelated desk-* listeners throw; recorded apart.
  await page.goto(origin + '/desk.html?c=' + slug + '#account'); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  await page.locator('#workspaceBilling').waitFor();
  Object.assign(x, { page, context });
  return x;
}

// ---------- helpers ----------
async function check(name, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length, t0 = Date.now();
  try { await run(); report.checks.push({ name, pass: true, ms: Date.now() - t0 }); console.log('PASS ' + name); }
  catch (error) {
    const entry = { name, pass: false, ms: Date.now() - t0, error: String(error.stack || error).slice(0, 2000) }; report.checks.push(entry); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]);
    const page = contexts.at(-1)?.pages().at(-1);
    if (page) { entry.state = await snapshot(page).catch(() => null); entry.screenshot = await shot(page, 'failure-' + report.checks.length).catch(() => null); }
  } finally { await Promise.all(contexts.slice(start).map(context => context.close().catch(() => {}))); }
}
async function shot(page, name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path, fullPage: false }); report.screenshots.push(path); return path; }
const snapshot = page => page.evaluate(() => ({ status: document.getElementById('billingStatus')?.textContent, summary: document.getElementById('billingSummary')?.textContent, message: document.getElementById('billingMessage')?.textContent, error: document.getElementById('billingMessage')?.dataset.error, focus: document.activeElement?.id || document.activeElement?.tagName, busy: document.getElementById('workspaceBilling')?.getAttribute('aria-busy'), hidden: document.getElementById('workspaceBilling')?.hidden, visible: ['billingOfferForm', 'billingReview', 'billingContinue', 'billingRefresh', 'billingPortal', 'billingEnd'].filter(id => { const n = document.getElementById(id); return n && !n.hidden && n.getClientRects().length > 0; }), dialog: document.getElementById('billingCancel')?.open, workspace: document.body.dataset.workspaceState }));
const idle = page => page.waitForFunction(() => document.getElementById('workspaceBilling').getAttribute('aria-busy') === 'false');
const waitMessage = (page, re) => page.waitForFunction(([src, flags]) => new RegExp(src, flags).test(document.getElementById('billingMessage').textContent) && document.getElementById('workspaceBilling').getAttribute('aria-busy') === 'false', [re.source, re.flags]);
const waitStatus = (page, text) => page.waitForFunction(text => document.getElementById('billingStatus').textContent === text, text);
async function noHorizontalScroll(page, where) { const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth })); assert.ok(v.doc <= v.vw + 1, 'Horizontal scroll at ' + where + ': ' + JSON.stringify(v)); }
const RAW = /Failed to fetch|Load failed|NetworkError|Unexpected token|JSON|is not valid|aborted|signal|AbortError|TypeError|SyntaxError|undefined|null/;
const UNKNOWN = /couldn’t confirm/;
async function assertUnknown(page, where) {
  const s = await snapshot(page);
  assert.doesNotMatch(s.message, RAW, 'Raw error at ' + where + ': ' + s.message);
  assert.match(s.message, UNKNOWN, 'Unknown outcome reads couldn’t confirm at ' + where + ': ' + s.message);
  assert.equal(s.error, 'true');
  assert.equal(s.focus, 'billingMessage', 'Focus on the message at ' + where);
  assert.ok(s.visible.includes('billingRefresh'), 'Status check offered at ' + where + ': ' + JSON.stringify(s.visible));
  return s;
}
const ofAction = (x, action) => x.fx.requests.filter(r => r.action === action);
const effects = (x, action) => x.fx.effects.filter(e => e.action === action);
const keyPress = async (page, selector, key = 'Enter') => { await page.locator(selector).focus(); await page.keyboard.press(key); };
async function reviewOffer(page, { keyboard = false } = {}) {
  if (keyboard) await keyPress(page, '#billingOfferForm button[type=submit]'); else await page.locator('#billingOfferForm button[type=submit]').click();
  await page.locator('#billingReview:not([hidden])').waitFor(); await idle(page);
}
async function agree(page, keyboard) { if (keyboard) await keyPress(page, '#billingAgree', 'Space'); else await page.locator('#billingAgree').check(); }
const submitCheckout = (page, keyboard) => keyboard ? keyPress(page, '#billingCheckoutForm button[type=submit]') : page.locator('#billingCheckoutForm button[type=submit]').click();
const CHECKOUT_UNSURE = 'Checkout could not be confirmed. Your request may already be saved. Check payment status before continuing.';
const CANCEL_UNSURE = 'Your renewal request could not be confirmed. It may already be saved. Check payment status before trying again.';
const NOT_CLAIMED = /Payment confirmed|Subscription active|Renewal ends|cancellation confirmed/;

// ---------- node-level: the actual handler offline (why the browser uses a fixture) ----------
await check('actual handler offline: GET reads status none with no offer; review/portal refuse with 503 billing_unavailable', async () => {
  const x = await seed(0);
  const call = (method, body) => actualBilling(new Request(origin + '/api/workspace-billing?c=' + x.slug, { method, headers: { origin, authorization: 'Bearer ' + x.token, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.72' });
  const get = await call('GET'), g = await get.json(); assert.equal(get.status, 200); assert.equal(g.billing.status, 'none'); assert.equal(g.billing.offerAvailable, false); assert.equal(g.billing.portalAvailable, false);
  const rev = await call('POST', { action: 'review', plan: 'starter', expectedRevision: 'x' }), r = await rev.json();
  const por = await call('POST', { action: 'portal', requestId: hex() }), p = await por.json();
  report.actualHandlerOffline = { get: { status: get.status, billing: g.billing }, review: { status: rev.status, body: r }, portal: { status: por.status, body: p } };
  assert.ok(rev.status >= 400 && por.status >= 400, 'Handler refuses actions offline');
  assert.equal(report.physicalNetwork, 0);
});

for (const [width, height] of [[390, 844], [1440, 900]]) {
  // Preservation guards (expected to pass at base too).
  await check(`guard: open Billing, free workspace, review and start checkout by keyboard; Stripe navigation intercepted (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await waitStatus(page, 'No subscription started'); await noHorizontalScroll(page, 'free ' + width);
    await reviewOffer(page, { keyboard: true }); await agree(page, true);
    const nav = page.waitForURL(/checkout\.stripe\.com/); await submitCheckout(page, true); await nav;
    assert.equal(effects(x, 'checkout').length, 1); assert.equal(x.navigations, 1);
  });
  await check(`guard: double click on checkout sends one request; lost checkout keeps the exact "may already be saved" wording and state (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await waitStatus(page, 'No subscription started'); await reviewOffer(page); await agree(page);
    x.fault = { kind: 'lost-after', match: b => b?.action === 'checkout' };
    await page.locator('#billingCheckoutForm button[type=submit]').dblclick();
    await waitMessage(page, /Checkout could not be confirmed/);
    const s = await snapshot(page);
    assert.equal(ofAction(x, 'checkout').length, 1, 'One checkout request'); assert.equal(s.message, CHECKOUT_UNSURE); assert.equal(s.focus, 'billingMessage');
    assert.ok(s.visible.includes('billingRefresh') && !s.visible.includes('billingOfferForm')); assert.doesNotMatch(s.status + s.summary, NOT_CLAIMED);
    await shot(page, 'checkout-lost-' + width);
  });
  await check(`guard: portal JSON 4xx shows the server message with focus (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active');
    x.fault = { kind: 'json-4xx', match: b => b?.action === 'portal', response: json({ error: 'billing_portal_unavailable', message: 'Payment details become available after your subscription is confirmed.' }, 409) };
    await keyPress(page, '#billingPortal'); await waitMessage(page, /Payment details become available/);
    const s = await snapshot(page); assert.equal(s.message, 'Payment details become available after your subscription is confirmed.'); assert.equal(s.focus, 'billingMessage'); assert.equal(s.status, 'Subscription active'); assert.equal(x.navigations || 0, 0);
  });
  await check(`guard: cancel renewal by keyboard; status claims the end only after the server confirms (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active'); await keyPress(page, '#billingEnd'); await page.locator('#billingCancel[open]').waitFor();
    await keyPress(page, '#billingEndConfirm'); await waitMessage(page, /request is saved/);
    assert.equal(await page.locator('#billingStatus').textContent(), 'Renewal cancellation pending'); assert.equal(effects(x, 'cancel_renewal').length, 1);
    x.fx.onRefresh = confirmCancel; await keyPress(page, '#billingRefresh'); await waitMessage(page, /Renewal cancellation confirmed/);
    assert.match(await page.locator('#billingStatus').textContent(), /^Renewal ends /);
  });

  // Defect cases (expected to FAIL at base and pass after the fix).
  await check(`status read: non-JSON 5xx on open reads couldn’t confirm, offers status check, then recovers (${width})`, async () => {
    const x = await seed(width); x.fault = { kind: 'html-503', match: (b, m) => m === 'GET' };
    await open(x, { height }); const { page } = x;
    await page.waitForFunction(() => document.getElementById('billingMessage').textContent.length > 0);
    const s = await snapshot(page); assert.doesNotMatch(s.message, RAW, 'Raw: ' + s.message); assert.match(s.message, UNKNOWN); assert.ok(s.visible.includes('billingRefresh'));
    await shot(page, 'read-503-' + width);
    await keyPress(page, '#billingRefresh'); await waitMessage(page, /Saved payment status updated/); assert.equal(await page.locator('#billingStatus').textContent(), 'No subscription started');
  });
  await check(`status check: abort before the handler reads couldn’t confirm with focus; state kept (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active');
    x.fault = { kind: 'abort-before', match: b => b?.action === 'refresh' }; await keyPress(page, '#billingRefresh'); await idle(page); await page.waitForFunction(() => !/Checking payment status/.test(document.getElementById('billingMessage').textContent));
    const s = await assertUnknown(page, 'refresh abort ' + width); assert.equal(s.status, 'Subscription active'); assert.equal(effects(x, 'refresh').length, 0);
  });
  await check(`checkout: lost after commit, then status check aborts, then succeeds; one checkout, saved URL offered, never paid (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await waitStatus(page, 'No subscription started'); await reviewOffer(page, { keyboard: true }); await agree(page, true);
    x.fault = { kind: 'lost-after', match: b => b?.action === 'checkout' }; await submitCheckout(page, true); await waitMessage(page, /Checkout could not be confirmed/);
    assert.equal(await page.locator('#billingMessage').textContent(), CHECKOUT_UNSURE);
    x.fault = { kind: 'abort-before', match: b => b?.action === 'refresh' }; await keyPress(page, '#billingRefresh'); await page.waitForFunction(() => !/Checking payment status/.test(document.getElementById('billingMessage').textContent) && document.getElementById('workspaceBilling').getAttribute('aria-busy') === 'false');
    const s = await assertUnknown(page, 'checkout-then-refresh-abort ' + width); assert.doesNotMatch(s.status + s.summary, NOT_CLAIMED); assert.ok(!s.visible.includes('billingOfferForm'), 'Checkout state kept');
    await keyPress(page, '#billingRefresh'); await waitMessage(page, /Saved payment status updated/);
    const after = await snapshot(page); assert.ok(after.visible.includes('billingContinue'), 'Saved checkout offered'); assert.doesNotMatch(after.status + after.summary + after.message, NOT_CLAIMED);
    assert.equal(effects(x, 'checkout').filter(e => e.created).length, 1); assert.equal(x.navigations || 0, 0);
    await shot(page, 'checkout-recovered-' + width);
  });
  await check(`review: non-JSON 5xx reads couldn’t confirm with focus and status check; retry reviews (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await waitStatus(page, 'No subscription started');
    x.fault = { kind: 'html-503', match: b => b?.action === 'review' }; await keyPress(page, '#billingOfferForm button[type=submit]'); await idle(page); await page.waitForFunction(() => !/Checking your service/.test(document.getElementById('billingMessage').textContent));
    await assertUnknown(page, 'review 503 ' + width);
    await reviewOffer(page); assert.equal(effects(x, 'review').length, 1);
  });
  await check(`portal: lost after commit reads couldn’t confirm; retry reuses the requestId and opens the intercepted portal once (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active');
    x.fault = { kind: 'lost-after', match: b => b?.action === 'portal' }; await keyPress(page, '#billingPortal'); await idle(page); await page.waitForFunction(() => !/Opening secure/.test(document.getElementById('billingMessage').textContent));
    const s = await assertUnknown(page, 'portal lost ' + width); assert.equal(s.status, 'Subscription active'); assert.equal(x.navigations || 0, 0);
    await shot(page, 'portal-lost-' + width);
    const nav = page.waitForURL(/billing\.stripe\.com/); await page.locator('#billingPortal').click(); await nav;
    const ids = ofAction(x, 'portal').map(r => r.requestId); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1], 'requestId reused'); assert.equal(effects(x, 'portal').filter(e => e.created).length, 1); assert.equal(x.navigations, 1);
  });
  await check(`portal: non-JSON 5xx reads couldn’t confirm with focus, no navigation (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active');
    x.fault = { kind: 'html-503', match: b => b?.action === 'portal' }; await page.locator('#billingPortal').click(); await idle(page); await page.waitForFunction(() => !/Opening secure/.test(document.getElementById('billingMessage').textContent));
    await assertUnknown(page, 'portal 503 ' + width); assert.equal(x.navigations || 0, 0);
  });
  await check(`portal: slow reply past the 15 s timeout, with double click, reads couldn’t confirm; one request, no navigation (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active');
    x.fault = { kind: 'slow', ms: 16500, match: b => b?.action === 'portal' }; await page.locator('#billingPortal').dblclick(); await page.keyboard.press('Enter');
    await page.waitForTimeout(500); assert.equal(await page.locator('#workspaceBilling').getAttribute('aria-busy'), 'true'); assert.equal(await page.locator('#billingPortal').isDisabled(), true);
    await page.waitForFunction(() => document.getElementById('workspaceBilling').getAttribute('aria-busy') === 'false', null, { timeout: 20000 });
    await page.waitForTimeout(2000);   // let the late fixture reply arrive; it must not navigate.
    const s = await assertUnknown(page, 'portal slow ' + width); assert.equal(ofAction(x, 'portal').length, 1); assert.equal(x.navigations || 0, 0); assert.equal(s.status, 'Subscription active');
  });
  await check(`cancel renewal: lost after commit keeps exact wording; status check non-JSON 5xx reads couldn’t confirm; then server confirms (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active'); await page.locator('#billingEnd').click(); await page.locator('#billingCancel[open]').waitFor();
    x.fault = { kind: 'lost-after', match: b => b?.action === 'cancel_renewal' }; await page.locator('#billingEndConfirm').click(); await waitMessage(page, /renewal request could not be confirmed/);
    let s = await snapshot(page); assert.equal(s.message, CANCEL_UNSURE); assert.equal(s.status, 'Renewal cancellation pending'); assert.equal(s.focus, 'billingMessage'); assert.ok(!s.dialog);
    x.fx.onRefresh = confirmCancel;
    x.fault = { kind: 'html-503', match: b => b?.action === 'refresh' }; await page.locator('#billingRefresh').click(); await idle(page); await page.waitForFunction(() => !/Checking payment status/.test(document.getElementById('billingMessage').textContent));
    s = await assertUnknown(page, 'cancel-then-refresh-503 ' + width); assert.equal(s.status, 'Renewal cancellation pending'); assert.doesNotMatch(s.status, /Renewal ends/);
    await page.locator('#billingRefresh').click(); await waitMessage(page, /Renewal cancellation confirmed/);
    assert.match(await page.locator('#billingStatus').textContent(), /^Renewal ends /); assert.equal(effects(x, 'cancel_renewal').length, 1);
    await shot(page, 'cancel-confirmed-' + width);
  });

  // Storage (same contract as the desk-service-intake.js sibling fix).
  await check(`storage blocked after load: status check and desk refresh keep working with the loaded session (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active');
    await page.evaluate(() => { Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    const before = x.fx.requests.length; await page.locator('#billingRefresh').click(); await page.waitForTimeout(800);
    assert.ok(x.fx.requests.length > before, 'Status check sent'); await waitMessage(page, /Payment confirmed/); assert.equal(x.fx.requests.at(-1).auth, 'owner');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await page.waitForTimeout(1200);
    assert.equal(await page.locator('#workspaceBilling').isHidden(), false, 'Billing still shown after a desk refresh');
  });
  await check(`storage mismatch sticks: a different stored session sends nothing and stays stopped after restore (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active'); const before = x.fx.requests.length;
    await page.evaluate(() => sessionStorage.setItem('mc-onboarding-session-v1', 'f'.repeat(64)));
    await page.locator('#billingRefresh').click(); await page.waitForTimeout(800);
    assert.equal(x.fx.requests.slice(before).filter(r => r.auth === 'other').length, 0, 'No request carries a foreign session');
    await page.evaluate(token => sessionStorage.setItem('mc-onboarding-session-v1', token), x.token);
    if (!await page.locator('#billingRefresh').isDisabled()) { await page.locator('#billingRefresh').click(); await page.waitForTimeout(800); }
    assert.equal(x.fx.requests.slice(before).length, 0, 'Mismatch sticks: ' + JSON.stringify(x.fx.requests.slice(before)));
  });
  await check(`storage blocked then session expiry (401) clears billing for good (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active');
    await page.evaluate(() => { Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    x.fault = { kind: 'json-4xx', match: b => b?.action === 'refresh', response: json({ error: 'verification_required', message: 'Sign in by email to manage billing.' }, 401) };
    await page.locator('#billingRefresh').click();
    await page.waitForFunction(() => document.body.dataset.workspaceState === 'recovery');
    assert.equal(ofAction(x, 'refresh').length, 1, 'The status check reached the server and learned of expiry');
    const n = x.fx.requests.length;
    x.probing = true; await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk', { detail: { client: { slug: new URLSearchParams(location.search).get('c'), onboarding: { version: 1 }, status: 'testing' }, configurationRevision: 'x' } })));
    await page.waitForTimeout(600); assert.equal(x.fx.requests.length, n, 'No billing request after expiry'); assert.equal(await page.locator('#workspaceBilling').isHidden(), true);
  });
  await check(`guard: storage blocked then sign-out clears billing (${width})`, async () => {
    const x = await open(await seed(width, { subscribed: true }), { height }); const { page } = x;
    await waitStatus(page, 'Subscription active');
    await page.evaluate(() => { Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    await page.locator('#deskSignOut').click(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'recovery');
    const n = x.fx.requests.length;
    x.probing = true; await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk', { detail: { client: { slug: new URLSearchParams(location.search).get('c'), onboarding: { version: 1 }, status: 'testing' }, configurationRevision: 'x' } })));
    await page.waitForTimeout(600); assert.equal(x.fx.requests.length, n, 'No billing request after sign-out'); assert.equal(await page.locator('#workspaceBilling').isHidden(), true);
  });
}

// ---------- finish ----------
await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
const realStripe = report.stripeNavigations.filter(n => !/cs_test_fixture|test_fixture/.test(n.href));
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0 && realStripe.length === 0;
report.checks.push({ name: 'hygiene: no physical, forbidden or non-fixture Stripe requests and no page errors', pass: globalsPass, ...(globalsPass ? {} : { error: JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors, realStripe }) }) });
report.checks.push({ name: 'source unchanged during the run', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.durationMs = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' in ' + Math.round(report.durationMs / 1000) + 's -> ' + output + ' (served desk-billing.js ' + report.servedBillingSha256.join(',') + ')');
process.exit(report.passed === report.total ? 0 : 1);
