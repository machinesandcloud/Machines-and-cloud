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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), origin = 'http://127.0.0.1:8932';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), only = arg('--only'), playwrightPath = arg('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const billingSource = arg('--billing-source') ? resolve(arg('--billing-source')) : resolve(root, 'desk-billing.js');
if (!output || !/^scratchpad\/claude-billing-qa-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-billing-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now();
const sha = value => createHash('sha256').update(value).digest('hex');
const watched = ['desk.html', 'desk.js', 'desk.css', 'desk-billing.js', 'desk-billing.css', 'netlify/functions/workspace-billing.mjs', 'netlify/functions/lib/workspace-billing.mjs', 'netlify/functions/client.mjs', 'netlify/functions/access.mjs', 'qa-artifacts/claude-collaboration/billing/desk-billing-faults-ui-check.mjs', 'qa-artifacts/claude-collaboration/billing/qa/desk-billing-qa-probe.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { probe: 'independent QA probe (lost response + retry, URL validation, notSent truth)', at: new Date().toISOString(), mode: 'Actual /api/client + /api/access in-process; /api/workspace-billing context.route fixture mirroring handler shapes; memory store; fake model; provider env deleted; physical transport denied; Stripe navigations stubbed', billingSource: arg('--billing-source') || 'desk-billing.js', servedBillingSha256: [], sourceBefore: hashes(), checks: [], screenshots: [], requests: [], stripeNavigations: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|WORKSPACE_BILLING_|MANAGED_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Billing check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../../netlify/functions/lib/store.mjs');
const { accessHash, getAccessSession } = await import('../../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../../netlify/functions/lib/config.mjs');
const actualBilling = (await import('../../../../netlify/functions/workspace-billing.mjs')).default;
const handlers = {};
for (const file of ['client', 'access', 'chat']) { const mod = await import('../../../../netlify/functions/' + file + '.mjs'); for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default; }

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
      if (fault?.kind === 'after') { const committed = await fixture(x, request, url, body); item.status = committed.status; item.committedThen = 'rewritten'; return route.fulfill(fault.respond(committed, x)); }
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
// ---------- independent QA probes ----------
const W = 390, H = 844;
const lostOn = action => ({ kind: 'lost-after', match: b => b?.action === action });
const afterOn = (action, respond) => ({ kind: 'after', match: b => b?.action === action, respond });
const busyDone = page => page.waitForFunction(() => document.getElementById('workspaceBilling').getAttribute('aria-busy') === 'false' && !/…$/.test(document.getElementById('billingMessage').textContent));
const msg = page => page.locator('#billingMessage').textContent();
report.probes = {};

await check('P1 checkout: lost after commit, refresh lost after commit, refresh 503 JSON, refresh ok; one checkout created, one requestId, no navigation', async () => {
  const x = await open(await seed(W), { height: H }); const { page } = x;
  await waitStatus(page, 'No subscription started'); await reviewOffer(page); await agree(page);
  x.fault = lostOn('checkout'); await submitCheckout(page); await waitMessage(page, /Checkout could not be confirmed/);
  x.fault = lostOn('refresh'); await page.locator('#billingRefresh').click(); await busyDone(page);
  const m1 = await msg(page); assert.match(m1, UNKNOWN, m1);
  x.fault = afterOn('refresh', () => json({ error: 'billing_busy', message: 'Billing is already checking the saved payment. Please check again shortly.' }, 503)); await page.locator('#billingRefresh').click(); await busyDone(page);
  const m2 = await msg(page);
  // Offer form must stay hidden while checkout is uncertain (no path to a fresh review/checkout).
  let s = await snapshot(page); assert.ok(!s.visible.includes('billingOfferForm') && !s.visible.includes('billingReview'), 'no new checkout path while uncertain: ' + JSON.stringify(s.visible));
  await page.locator('#billingRefresh').click(); await waitMessage(page, /Saved payment status updated/);
  s = await snapshot(page); assert.ok(s.visible.includes('billingContinue'));
  const href = await page.locator('#billingContinue').getAttribute('href'); assert.match(href, /^https:\/\/checkout\.stripe\.com\//);
  const ids = ofAction(x, 'checkout').map(r => r.requestId);
  report.probes.P1 = { m1, m2, checkoutRequestIds: ids, created: effects(x, 'checkout').filter(e => e.created).length, navigations: x.navigations || 0, href };
  assert.equal(ids.length, 1); assert.equal(effects(x, 'checkout').filter(e => e.created).length, 1); assert.equal(x.navigations || 0, 0);
});

await check('P2 checkout: committed then JSON 503 / JSON 409 replies keep "may already be saved"; retry after recheck reuses requestId', async () => {
  const x = await open(await seed(W), { height: H }); const { page } = x;
  await waitStatus(page, 'No subscription started'); await reviewOffer(page); await agree(page);
  // Server committed the attempt, then returned a definite-looking 4xx (as lib can after the pending attempt is saved).
  x.fault = afterOn('checkout', () => json({ error: 'checkout_changed', message: 'Check your current billing request.' }, 409));
  await submitCheckout(page); await waitMessage(page, /could not be confirmed/);
  const m409 = await msg(page); assert.equal(m409, CHECKOUT_UNSURE);
  // Make server forget the URL so the offer becomes available again (attempt abandoned), forcing a re-review + re-checkout.
  x.fx.checkout.state = 'abandoned';
  await page.locator('#billingRefresh').click(); await waitMessage(page, /Saved payment status updated/);
  const s = await snapshot(page); report.probes.P2visible = s.visible;
  if (s.visible.includes('billingOfferForm')) {
    await reviewOffer(page); await agree(page);
    x.fault = afterOn('checkout', () => json({ error: 'billing_unavailable', message: 'x' }, 503)); await submitCheckout(page); await waitMessage(page, /could not be confirmed/);
    assert.equal(await msg(page), CHECKOUT_UNSURE);
  }
  const ids = ofAction(x, 'checkout').map(r => r.requestId); report.probes.P2 = { m409, ids };
  assert.ok(ids.every(id => id === ids[0]), 'requestId reused across retries: ' + ids.join(','));
  assert.equal(x.navigations || 0, 0);
});

await check('P3 portal: lost, then committed+JSON 503, then lost again, then ok: one requestId, one portal created, one validated navigation', async () => {
  const x = await open(await seed(W, { subscribed: true }), { height: H }); const { page } = x;
  await waitStatus(page, 'Subscription active');
  x.fault = lostOn('portal'); await page.locator('#billingPortal').click(); await busyDone(page); assert.match(await msg(page), UNKNOWN);
  x.fault = afterOn('portal', () => json({ error: 'billing_binding_mismatch', message: 'The secure payment link could not be confirmed for this workspace.' }, 503)); await page.locator('#billingPortal').click(); await busyDone(page); assert.match(await msg(page), UNKNOWN);
  x.fault = lostOn('portal'); await page.locator('#billingPortal').click(); await busyDone(page);
  const nav = page.waitForURL(/billing\.stripe\.com/); await page.locator('#billingPortal').click(); await nav;
  const ids = ofAction(x, 'portal').map(r => r.requestId); report.probes.P3 = { ids, created: effects(x, 'portal').filter(e => e.created).length, navigations: x.navigations };
  assert.equal(ids.length, 4); assert.ok(ids.every(id => id === ids[0])); assert.equal(effects(x, 'portal').filter(e => e.created).length, 1); assert.equal(x.navigations, 1);
});

for (const bad of ['https://billing.stripe.com.evil.example/p/x', 'http://billing.stripe.com/p/x', 'https://user:pw@billing.stripe.com/p/x', 'https://billing.stripe.com:8443/p/x', 'javascript:alert(1)', 'https://evil.example/p/x']) {
  await check('P4 portal 200 with unvalidated URL never navigates: ' + bad, async () => {
    const x = await open(await seed(W, { subscribed: true }), { height: H }); const { page } = x;
    await waitStatus(page, 'Subscription active'); let navigated = null; page.on('framenavigated', f => { if (f === page.mainFrame() && !f.url().startsWith(origin)) navigated = f.url(); });
    x.fault = afterOn('portal', () => json({ ok: true, portal: { url: bad, expiresAt: new Date(Date.now() + 300000).toISOString() } }));
    await page.locator('#billingPortal').click(); await busyDone(page); await page.waitForTimeout(400);
    (report.probes.P4 ||= []).push({ bad, message: await msg(page), navigated, pageUrl: page.url() });
    assert.equal(navigated, null); assert.ok(page.url().startsWith(origin)); assert.equal(x.navigations || 0, 0);
  });
}
await check('P5 checkout 200 with non-Stripe URL never navigates nor exposes a link', async () => {
  const x = await open(await seed(W), { height: H }); const { page } = x;
  await waitStatus(page, 'No subscription started'); await reviewOffer(page); await agree(page);
  x.fault = afterOn('checkout', (r) => { const b = JSON.parse(r.body); b.billing.checkout.url = 'https://checkout.stripe.com.evil.example/c/pay/x'; return json(b); });
  await submitCheckout(page); await busyDone(page); await page.waitForTimeout(400);
  const href = await page.locator('#billingContinue').getAttribute('href'); report.probes.P5 = { message: await msg(page), href, url: page.url() };
  assert.ok(page.url().startsWith(origin)); assert.equal(x.navigations || 0, 0); assert.equal(href, '#');
});
await check('P6 portal billing_portal_expired (409) rotates requestId; other 4xx keeps it', async () => {
  const x = await open(await seed(W, { subscribed: true }), { height: H }); const { page } = x;
  await waitStatus(page, 'Subscription active');
  x.fault = { kind: 'json-4xx', match: b => b?.action === 'portal', response: json({ error: 'workspace_changed', message: 'Your billing view changed. Open payment details again.' }, 409) }; await page.locator('#billingPortal').click(); await busyDone(page);
  const m1 = await msg(page);
  x.fault = { kind: 'json-4xx', match: b => b?.action === 'portal', response: json({ error: 'billing_portal_expired', message: 'This secure payment link expired. Open payment details again.' }, 409) }; await page.locator('#billingPortal').click(); await busyDone(page);
  const m2 = await msg(page);
  const nav = page.waitForURL(/billing\.stripe\.com/); await page.locator('#billingPortal').click(); await nav;
  const ids = ofAction(x, 'portal').map(r => r.requestId); report.probes.P6 = { m1, m2, ids };
  assert.equal(m1, 'Your billing view changed. Open payment details again.'); assert.equal(ids[0], ids[1]); assert.notEqual(ids[1], ids[2]);
});
await check('P7 "Nothing was sent" is only shown when no request left the page (mismatch, then every control)', async () => {
  const x = await open(await seed(W, { subscribed: true }), { height: H }); const { page } = x;
  await waitStatus(page, 'Subscription active'); const n = x.fx.requests.length;
  await page.evaluate(() => sessionStorage.setItem('mc-onboarding-session-v1', 'e'.repeat(64)));
  const seen = [];
  for (const sel of ['#billingRefresh', '#billingPortal']) { await page.locator(sel).click(); await busyDone(page); seen.push([sel, await msg(page), x.fx.requests.length - n]); }
  await page.locator('#billingEnd').click(); await page.locator('#billingCancel[open]').waitFor(); await page.locator('#billingEndConfirm').click(); await busyDone(page); seen.push(['cancel', await msg(page), x.fx.requests.length - n]);
  report.probes.P7 = seen; assert.equal(x.fx.requests.length, n);
  for (const [, m] of seen) assert.match(m, /Nothing was sent/);
});
await check('P8 in-flight checkout then storage swaps to another account: committed request is not later reported as "Nothing was sent"', async () => {
  const x = await open(await seed(W), { height: H }); const { page } = x;
  await waitStatus(page, 'No subscription started'); await reviewOffer(page); await agree(page);
  x.fault = { kind: 'slow', ms: 1200, match: b => b?.action === 'checkout' };
  await submitCheckout(page); await page.waitForTimeout(300);
  await page.evaluate(() => sessionStorage.setItem('mc-onboarding-session-v1', 'd'.repeat(64)));
  await page.waitForTimeout(2000);
  const s = await snapshot(page); report.probes.P8 = { s, created: effects(x, 'checkout').filter(e => e.created).length, navigations: x.navigations || 0 };
  assert.doesNotMatch(s.message, /Nothing was sent/); assert.equal(x.navigations || 0, 0);
});
await check('P9 sign-out (storage readable) then a second account written to storage in the same tab: no request with either token', async () => {
  const x = await open(await seed(W, { subscribed: true }), { height: H }); const { page } = x;
  await waitStatus(page, 'Subscription active');
  await page.locator('#deskSignOut').click(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'recovery');
  const n = x.fx.requests.length; const other = sha('second-owner');
  await page.evaluate(t => sessionStorage.setItem('mc-onboarding-session-v1', t), other);
  x.probing = true; await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk', { detail: { client: { slug: new URLSearchParams(location.search).get('c'), onboarding: { version: 1 }, status: 'testing' }, configurationRevision: 'x' } })));
  await page.waitForTimeout(600);
  // also restore the ORIGINAL token in storage (e.g. stale tab state): billing must not resurrect a server-revoked owner.
  await page.evaluate(t => sessionStorage.setItem('mc-onboarding-session-v1', t), x.token);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk', { detail: { client: { slug: new URLSearchParams(location.search).get('c'), onboarding: { version: 1 }, status: 'testing' }, configurationRevision: 'y' } })));
  await page.waitForTimeout(600);
  report.probes.P9 = { after: x.fx.requests.slice(n), hidden: await page.locator('#workspaceBilling').isHidden() };
  assert.equal(x.fx.requests.length, n, JSON.stringify(x.fx.requests.slice(n)));
});
await check('P10 storage blocked + sign-out, then storage unblocked still holding original token: billing does not resurrect', async () => {
  const x = await open(await seed(W, { subscribed: true }), { height: H }); const { page } = x;
  await waitStatus(page, 'Subscription active');
  await page.evaluate(() => { window.__ss = window.sessionStorage; Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } }); });
  await page.locator('#deskSignOut').click(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'recovery');
  await page.evaluate(() => { const s = window.__ss; Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { return s; } }); });
  const stored = await page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
  const n = x.fx.requests.length;
  x.probing = true; await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk', { detail: { client: { slug: new URLSearchParams(location.search).get('c'), onboarding: { version: 1 }, status: 'testing' }, configurationRevision: 'z' } })));
  await page.waitForTimeout(800);
  report.probes.P10 = { storedStillOriginal: stored === x.token, after: x.fx.requests.slice(n) };
  assert.equal(x.fx.requests.length, n, 'revoked token resent: ' + JSON.stringify(x.fx.requests.slice(n)));
});

await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
report.checks.push({ name: 'hygiene', pass: report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0 && report.stripeNavigations.every(n => /test_fixture|cs_test_fixture/.test(n.href)), detail: { physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors } });
report.checks.push({ name: 'source unchanged', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' -> ' + output + ' served ' + report.servedBillingSha256.join(','));
process.exit(0);
