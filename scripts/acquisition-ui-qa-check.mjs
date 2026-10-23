// Independent rendered acquisition QA. Actual handlers and repo bytes; private synthetic mailbox.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.'), base = 'http://127.0.0.1:8898';
const visualOnly = process.argv.includes('--visual-only');
const guidedOnly = process.argv.includes('--guided-only');
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!process.argv.includes('--output') || !/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw new Error('Pass a new --output scratchpad/name.json');
const prefix = output.slice(0, -5);
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', URL: base, PUBLIC_SITE_URL: base, ADMIN_KEY: 'qa-local-admin' });
const result = { at: new Date().toISOString(), mode: 'same-origin browser requests fulfilled from actual repo/handlers; memory only; no external requests', checks: [], requests: [], blockedBrowser: [], blockedServer: [], pageErrors: [], screenshots: [] };
let storageFixture = null;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (storageFixture && url.origin === 'https://acquisition-ui-blobs.invalid') {
    const [, site, kind, ...parts] = url.pathname.split('/').map(decodeURIComponent), key = parts.join('/'), name = kind + '/' + key, method = String(init.method || 'GET').toUpperCase();
    if (site !== 'ui-qa-site') throw new Error('Wrong storage fixture site');
    if (kind === 'site:prospects' && method === 'PUT') { storageFixture.rejections++; return new Response('Injected optional consent projection rejection', { status: 400 }); }
    const current = storageFixture.data.get(name), headers = new Headers(init.headers);
    if (method === 'GET') return current ? new Response(current.value, { headers: { etag: current.etag, 'content-type': 'application/json' } }) : new Response(null, { status: 404 });
    if (method !== 'PUT') throw new Error('Unexpected fixture storage method');
    if ((headers.get('if-none-match') === '*' && current) || (headers.has('if-match') && headers.get('if-match') !== current?.etag)) return new Response(null, { status: 412 });
    const etag = String(++storageFixture.revision); storageFixture.data.set(name, { value: init.body, etag }); return new Response(null, { headers: { etag } });
  }
  result.blockedServer.push({ origin: url.origin, path: url.pathname }); throw new Error('QA server network disabled');
};
const store = await import('../netlify/functions/lib/store.mjs');
const { setEnvironmentContext } = await import('@netlify/blobs');
setEnvironmentContext({ siteID: 'ui-qa-site', token: 'ui-qa-token', edgeURL: 'https://acquisition-ui-eventual.invalid', uncachedEdgeURL: 'https://acquisition-ui-blobs.invalid' });
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { accountKey } = await import('../netlify/functions/lib/accounts.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const handlers = Object.fromEntries(await Promise.all(['intake', 'access', 'onboard', 'client', 'admin', 'chat'].map(async name => ['/api/' + name, (await import('../netlify/functions/' + name + '.mjs')).default])));
const sources = ['index.html', 'signup-intake.js', 'site-refresh.css', 'styles.css', 'script.js', 'onboard.html', 'onboard.js', 'desk.html', 'desk.js', 'admin.html', 'netlify/functions/admin.mjs', 'netlify/functions/intake.mjs', 'netlify/functions/lib/intake.mjs', 'netlify/functions/access.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/onboard.mjs', 'netlify/functions/client.mjs', 'netlify/functions/lib/setup.mjs'];
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
result.sourceBefore = hashes();
result.harnessHash = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const check = (name, pass, detail) => result.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const shot = async (page, name) => { const path = prefix + '-' + name + '.png'; if (existsSync(path)) throw new Error('Refusing to overwrite screenshot'); await page.screenshot({ path, fullPage: true }); result.screenshots.push(path); };
const shotElement = async (page, selector, name) => { const path = prefix + '-' + name + '.png'; if (existsSync(path)) throw new Error('Refusing to overwrite screenshot'); await page.locator(selector).screenshot({ path, ...(visualOnly ? { style: '#navbar, .skip-link, .skip-to-content, .mc-agent-launcher { visibility: hidden !important; }' } : {}) }); result.screenshots.push(path); };
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failCapture = false, loseCaptureResponse = false, holdCapture = null, captured = [], counter = 0, pendingProjection = false, routeFinalFieldError = false;
async function projectionFailureResponse(request, context) {
  // One actual-handler PUT uses the installed SDK, then brings its committed records back into the isolated browser fixture.
  const kinds = ['access_sessions', 'onboarding_drafts', 'prospects', 'prospect_suppression'];
  const fixture = { data: new Map(), revision: 0, rejections: 0 };
  for (const kind of kinds) for (const key of await store.list(kind)) fixture.data.set('site:' + kind + '/' + key, { value: JSON.stringify(await store.get(kind, key)), etag: String(++fixture.revision) });
  storageFixture = fixture; process.env.MC_MEMORY_STORE = '0'; let response;
  try { response = await handlers['/api/access'](request, context); } finally { process.env.MC_MEMORY_STORE = '1'; storageFixture = null; }
  for (const [name, row] of fixture.data) { const [kind, ...parts] = name.split('/'); await store.put(kind.slice('site:'.length), parts.join('/'), JSON.parse(row.value)); }
  result.projectionFault = { rejectedProspectWrites: fixture.rejections, actualHandlerStatus: response.status, kind: 'intercepted SDK storage, no external request' };
  return response;
}
async function contextFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', ...options });
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if (url.origin !== base) { result.blockedBrowser.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (!handlers[url.pathname]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa_not_allowed"}' });
      if (routeFinalFieldError && url.pathname === '/api/onboard' && incoming.method() === 'POST') { routeFinalFieldError = false; result.injectedFinalError = 'owner.phone field validation fixture, before handler call'; return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"missing_fields","field":"owner.phone","message":"Add a valid cell number for callback requests."}' }); }
      if (url.pathname === '/api/intake' && incoming.method() === 'POST') {
        captured.push(incoming.postDataJSON());
        if (failCapture) { failCapture = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture_failure","message":"We could not save your details. Please try again."}' }); }
      }
      const request = new Request(url, { method: incoming.method(), headers: incoming.headers(), ...(['GET', 'HEAD'].includes(incoming.method()) ? {} : { body: incoming.postData() }) });
      const handlerContext = { ip: '192.0.2.' + (++counter % 230 + 1) };
      let response;
      if (pendingProjection && url.pathname === '/api/access' && incoming.method() === 'PUT' && incoming.postDataJSON().marketingConsent === true) { pendingProjection = false; response = await projectionFailureResponse(request, handlerContext); }
      else response = await handlers[url.pathname](request, handlerContext);
      result.requests.push({ method: incoming.method(), path: url.pathname, query: url.pathname === '/api/intake' ? url.search : '', status: response.status, action: incoming.method() === 'POST' && url.pathname === '/api/access' ? incoming.postDataJSON().action : undefined });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (url.pathname === '/api/intake' && incoming.method() === 'POST') {
        if (holdCapture) await holdCapture;
        if (loseCaptureResponse) { loseCaptureResponse = false; return route.abort('connectionfailed'); }
      }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    let path = resolve(root, relative); if (!path.startsWith(root + '/')) return route.fulfill({ status: 404, body: 'blocked' });
    if (!existsSync(path) && existsSync(path + '.html')) path += '.html';
    if (!existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const contentType = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' })[extname(path)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType, body: readFileSync(path) });
  });
  context.on('page', page => page.on('pageerror', error => result.pageErrors.push(error.message)));
  return context;
}
async function verify(page, email) {
  await page.locator('#access-send').click(); await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
  const delivery = await store.get('access_outbox', accessHash(email)); if (!delivery) throw new Error('No synthetic mailbox link');
  const before = result.requests.filter(row => row.path === '/api/access' && row.action === 'exchange').length;
  await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' });
  check('Mailbox proof automatically exchanges once and resumes setup without a confirmation click', !new URL(page.url()).hash && !await page.locator('#access-verify').isVisible() && (await store.get('access_tokens', accessHash(delivery.token))).status === 'consumed' && result.requests.filter(row => row.path === '/api/access' && row.action === 'exchange').length === before + 1);
}
try {
 if (guidedOnly) {
  result.mode = 'bounded actual guided-action geometry; actual handler with stored synthetic verified session; no external requests';
  const context = await contextFor(), page = await context.newPage(), email = 'qa-guided-owner@example.test', bearer = createHash('sha256').update('qa-guided-session').digest('hex');
  await store.put('access_sessions', accessHash(bearer), { email, scope: 'onboarding', status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const created = await handlers['/api/onboard'](new Request(base + '/api/onboard', { method: 'POST', headers: { origin: base, authorization: 'Bearer ' + bearer, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'QA Guided Owner', business: 'QA Guided Air', phone: '7135550142', trade: 'HVAC', services: 'AC repair', hours: 'Mon-Fri 8am-5pm', serviceArea: 'Katy', desiredChannels: ['web', 'voice', 'sms', 'calendar'] }) }));
  if (!created.ok) throw new Error('Could not prepare actual-handler stored fixture'); const workspace = await created.json();
  await context.addInitScript(value => { sessionStorage.setItem('mc-onboarding-session-v1', value); }, bearer); await page.goto(workspace.portal); await page.locator('#title').waitFor(); await page.locator('#openGuide').click(); await page.locator('#guideDialog[data-tour-ready="true"]').waitFor({ state: 'visible' }); await page.locator('#skipGuide').click();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.locator('#setupSteps .setup-step').filter({ hasText: 'Choose your customer connections' }).locator('[data-route=setup]').click();
    const geometry = await page.locator('#connectionsCard h3').evaluate(node => { const r = node.getBoundingClientRect(), nav = document.querySelector('#navbar').getBoundingClientRect(); return { headingTop: r.top, headingBottom: r.bottom, navbarBottom: nav.bottom, scrollY, viewport: innerHeight }; });
    check('Real Choose connections guided action reveals heading below fixed navbar at ' + width + 'px', geometry.headingTop >= geometry.navbarBottom && geometry.headingBottom <= geometry.viewport, geometry);
    const path = prefix + '-guided-viewport-' + width + '.png'; await page.screenshot({ path }); result.screenshots.push(path);
  }
  await context.close();
 } else if (visualOnly) {
  result.mode = 'bounded current-source visual supplement; static pricing/intake plus read-only actual-handler stored fixtures; no external requests';
  result.captureNote = 'Visual-only element images suppress floating navbar/skip link/chat launcher while capturing; geometry and guided viewport proof use unchanged rendered styles.';
  const previous = JSON.parse(readFileSync('scratchpad/acquisition-ui-qa-current.json', 'utf8'));
  result.previousReceipt = 'scratchpad/acquisition-ui-qa-current.json'; result.changedSinceJourney = Object.keys(previous.sourceAfter).filter(file => previous.sourceAfter[file] !== result.sourceBefore[file]);
  check('Current source bridge changes only pricing CSS, pane CSS and two pricing CTA labels after accepted 49-group journey', previous.summary.passed === 49 && previous.summary.failed === 0 && JSON.stringify(result.changedSinceJourney) === JSON.stringify(['index.html', 'site-refresh.css', 'desk.html']));
  const reconstructCSS = readFileSync('site-refresh.css', 'utf8').replace('  .site-plans { grid-template-columns: 1fr; max-width: 540px; }\n', '');
  const reconstructDesk = readFileSync('desk.html', 'utf8').replace('.pane { display: none; scroll-margin-top: 100px; }', '.pane { display: none; }');
  const reconstructIndex = readFileSync('index.html', 'utf8').replace('class="site-button site-button-outline" aria-label="Choose Coverage">Choose plan', 'class="site-button site-button-outline">Choose Coverage').replace('class="site-button" aria-label="Choose Follow-through">Choose plan', 'class="site-button">Choose Follow-through');
  check('Reversing exactly the two CSS additions and CTA labels reproduces accepted journey source hashes', createHash('sha256').update(reconstructCSS).digest('hex') === previous.sourceAfter['site-refresh.css'] && createHash('sha256').update(reconstructDesk).digest('hex') === previous.sourceAfter['desk.html'] && createHash('sha256').update(reconstructIndex).digest('hex') === previous.sourceAfter['index.html']);
  const context = await contextFor(), page = await context.newPage(); await page.goto(base + '/');
  for (const width of [320, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.locator('#plans').scrollIntoViewIfNeeded();
    const geometry = await page.locator('.site-plan').evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(), items = [...card.querySelectorAll('.site-price strong,.site-price span,.site-button')].map(node => node.getBoundingClientRect()); return { name: card.querySelector('.site-plan-name').textContent, x: r.x, right: r.right, viewport: innerWidth, clientWidth: card.clientWidth, scrollWidth: card.scrollWidth, itemBounds: items.map(item => ({ x: item.x, right: item.right, height: item.height })), buttonHeight: card.querySelector('.site-button').getBoundingClientRect().height }; }));
    check('Three pricing cards and actions fit at ' + width + 'px', geometry.length === 3 && geometry.every(row => row.x >= 0 && row.right <= width + 1 && row.scrollWidth <= row.clientWidth + 1 && row.itemBounds.every(item => item.x >= row.x && item.right <= row.right + 1) && row.buttonHeight <= 70), geometry);
    check('Pricing uses the intended readable column count at ' + width + 'px', width <= 900 ? new Set(geometry.map(row => Math.round(row.x))).size === 1 : new Set(geometry.map(row => Math.round(row.x))).size === 3);
    await shotElement(page, '#plans', 'pricing-' + width);
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.locator('#signup-intake').scrollIntoViewIfNeeded(); const bounds = await page.locator('#signup-intake').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, viewport: innerWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
    check('Intake remains contained after pricing-only CSS at ' + width + 'px', bounds.x >= 0 && bounds.right <= width + 1 && !bounds.pageOverflow, bounds); await shotElement(page, '#signup-intake', 'entry-form-' + width);
  }
  // Tall viewport prevents a sticky header from obscuring an element screenshot.
  // These are stored-state visual fixtures; the accepted 49-group receipt proves actual capture/verification.
  const email = 'qa-visual-owner@example.test', bearer = createHash('sha256').update('qa-visual-stored-session').digest('hex');
  await store.put('access_sessions', accessHash(bearer), { email, scope: 'onboarding', status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() });
  await store.put('onboarding_drafts', accountKey(email), { revision: 1, step: 0, fields: { name: 'QA Saved Owner', business: 'QA Saved Air', primaryGoal: 'missed_calls', desiredChannels: ['web'] } });
  await context.addInitScript(value => { sessionStorage.setItem('mc-onboarding-session-v1', value); }, bearer); await page.setViewportSize({ width: 390, height: 2100 }); await page.goto(base + '/onboard.html'); await page.locator('#ob').waitFor({ state: 'visible' }); await page.evaluate(() => scrollTo(0, 0)); await shotElement(page, '#ob', 'first-step-stored-fixture-390');
  check('Tall visual fixture preserves name/business and unchecked optional preference', await page.locator('#name').inputValue() === 'QA Saved Owner' && await page.locator('#business').inputValue() === 'QA Saved Air' && !await page.locator('#setup-marketing').isChecked());
  await store.put('prospects', accountKey(email), { email, name: 'QA Saved Owner', business: 'QA Saved Air', createdAt: new Date().toISOString(), emailVerifiedAt: new Date().toISOString(), marketing: { preference: false, requested: false } });
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto(base + '/admin.html'); await page.locator('#key').fill(process.env.ADMIN_KEY); await page.locator('#keyGo').click(); await page.locator('#prospectsStatus').filter({ hasText: 'eligible for marketing' }).waitFor();
  await page.locator('.prospects-table-scroll').focus(); for (let n = 0; n < 25; n++) await page.keyboard.press('ArrowRight', { delay: 50 });
  await page.waitForFunction(() => { const node = document.querySelector('.prospects-table-scroll'); return node.scrollLeft >= node.scrollWidth - node.clientWidth - 1; }, null, { timeout: 1500 }).catch(() => {});
  const scroll = await page.locator('.prospects-table-scroll').evaluate(node => ({ left: node.scrollLeft, width: node.clientWidth, content: node.scrollWidth, focused: document.activeElement === node }));
  check('All mobile admin inquiry columns are reachable by keyboard horizontal scrolling', scroll.focused && scroll.left >= scroll.content - scroll.width - 1 && scroll.content > scroll.width, scroll); await shotElement(page, 'section[aria-labelledby=prospectsTitle]', 'admin-email-status-390');
  await context.close();
 } else {
  const context = await contextFor(), page = await context.newPage(), email = 'qa-acquisition-owner@example.test';
  await page.goto(base + '/#pilot'); await page.locator('#signup-intake').waitFor({ state: 'visible' });
  check('Preliminary entry has one submit action and unchecked optional email choice', await page.locator('#signup-intake [type=submit]').count() === 1 && !await page.locator('#intake-marketing').isChecked() && await page.locator('#intake-marketing').getAttribute('required') === null);
  check('Only preliminary name, email and business are required; goals include follow-up', await page.locator('#signup-intake [required]').count() === 3 && await page.locator('#intake-goal').getAttribute('required') === null && await page.locator('#intake-goal option[value=follow_up]').count() === 1);
  check('Early form has explicit labels, autocomplete and live status', await page.locator('#intake-name').getAttribute('autocomplete') === 'name' && await page.locator('#intake-email').getAttribute('autocomplete') === 'email' && await page.locator('#intake-business').getAttribute('autocomplete') === 'organization' && await page.locator('#intake-status').getAttribute('role') === 'status' && await page.locator('#signup-intake label[for]').count() >= 4);
  await page.locator('#intake-name').focus(); const focusOrder = [];
  for (let n = 0; n < 7; n++) { focusOrder.push(await page.evaluate(() => document.activeElement.id || document.activeElement.tagName.toLowerCase() + ':' + document.activeElement.getAttribute('href'))); await page.keyboard.press('Tab'); }
  check('Keyboard follows the short form, privacy link and submit while skipping the hidden bot field', JSON.stringify(focusOrder) === JSON.stringify(['intake-name', 'intake-email', 'intake-business', 'intake-goal', 'intake-marketing', 'a:privacy-policy.html', 'intake-submit']), focusOrder);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.locator('#signup-intake').scrollIntoViewIfNeeded();
    const geometry = await page.locator('#signup-intake').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1, fontSize: parseFloat(getComputedStyle(node.querySelector('input')).fontSize), buttonHeight: node.querySelector('[type=submit]').getBoundingClientRect().height }; });
    check('Preliminary form is readable and contained at ' + width + 'px', geometry.x >= 0 && geometry.right <= width + 1 && !geometry.overflow && geometry.fontSize >= (width < 768 ? 16 : 14) && geometry.buttonHeight >= 44, geometry); await shot(page, 'entry-' + width); await shotElement(page, '#signup-intake', 'entry-form-' + width);
  }
  await page.setViewportSize({ width: 768, height: 1024 }); await page.locator('#plans').scrollIntoViewIfNeeded();
  const pricingGeometry = await page.locator('.site-plan').evaluateAll(cards => cards.map(card => { const r = card.getBoundingClientRect(), price = card.querySelector('.site-price').getBoundingClientRect(), amount = card.querySelector('.site-price strong').getBoundingClientRect(), suffix = card.querySelector('.site-price span').getBoundingClientRect(); return { name: card.querySelector('.site-plan-name').textContent, left: r.left, right: r.right, priceRight: Math.max(price.right, amount.right, suffix.right), priceLeft: Math.min(price.left, amount.left), scrollWidth: card.scrollWidth, clientWidth: card.clientWidth }; }));
  check('Enterprise custom price and three plan cards fit the tablet interval at 768px', pricingGeometry.length === 3 && pricingGeometry.every(row => row.left >= 0 && row.right <= 768 && row.priceRight <= row.right && row.priceLeft >= row.left && row.scrollWidth <= row.clientWidth + 1), pricingGeometry); await shotElement(page, '#plans', 'pricing-768');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#intake-name').fill('QA Saved Owner'); await page.locator('#intake-email').fill(email); await page.locator('#intake-business').fill('QA Saved Air'); await page.locator('#intake-goal').selectOption('missed_calls');
  const captureBefore = captured.length; failCapture = true; await page.locator('#intake-submit').click(); await page.locator('#intake-status').filter({ hasText: 'could not save' }).waitFor();
  check('Failed capture keeps answers and never claims progress or emails', new URL(page.url()).pathname === '/' && await page.locator('#intake-name').inputValue() === 'QA Saved Owner' && await page.locator('#intake-business').inputValue() === 'QA Saved Air' && !await store.get('prospects', accountKey(email)) && (await store.list('access_outbox')).length === 0);
  loseCaptureResponse = true; await page.locator('#intake-submit').click(); await page.locator('#intake-status.is-error').waitFor();
  check('Lost response preserves page while actual lead is already durable', new URL(page.url()).pathname === '/' && (await store.get('prospects', accountKey(email))).business === 'QA Saved Air' && await page.locator('#intake-submit').isEnabled());
  let release; holdCapture = new Promise(resolve => { release = resolve; });
  await page.locator('#intake-submit').click(); await page.locator('#intake-submit:disabled').waitFor();
  await page.locator('#signup-intake').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  check('Pending capture blocks duplicate submissions accessibly', await page.locator('#signup-intake').getAttribute('aria-busy') === 'true' && captured.length === captureBefore + 3);
  release(); holdCapture = null; await page.waitForURL('**/onboard.html'); await page.locator('#access-gate').waitFor();
  check('Successful retry reuses one submission and redirects only after durable save', new Set(captured.slice(captureBefore).map(row => row.submissionId)).size === 1 && (await store.list('prospects')).length === 1 && (await store.list('intake_handoffs')).length === 1);
  check('Next page carries email without PII or handoff in current address and sends nothing automatically', await page.locator('#access-email').inputValue() === email && !new URL(page.url()).search && !new URL(page.url()).hash && (await store.list('access_outbox')).length === 0 && await page.locator('#intake-notice').isVisible());
  await verify(page, email);
  check('Verified questionnaire keeps preliminary name/business/goal and optional marketing unchecked', await page.locator('#name').inputValue() === 'QA Saved Owner' && await page.locator('#business').inputValue() === 'QA Saved Air' && await page.locator('#primaryGoal').inputValue() === 'missed_calls' && !await page.locator('#setup-marketing').isChecked());
  await shotElement(page, '#ob', 'verified-first-step-390');
  check('Verification does not enroll the captured contact', !(await store.get('prospects', accountKey(email))).marketing.preference && (await store.list('clients')).length === 0);
  let prefResponse = page.waitForResponse(response => response.url().includes('/api/access') && response.request().method() === 'PUT' && response.request().postDataJSON().marketingConsent === true);
  await page.locator('#plan-email-preferences > summary').click();
  pendingProjection = true; await page.locator('#setup-marketing').check(); const pendingResponse = await prefResponse, pendingBody = await pendingResponse.json();
  await page.locator('#draft-status').filter({ hasText: 'email preference could not be confirmed' }).waitFor();
  check('Optional consent projection failure keeps known saved draft and truthful pending preference without enrollment', pendingResponse.status() === 200 && pendingBody.marketingPending === true && pendingBody.draft.revision > 0 && result.projectionFault.rejectedProspectWrites === 1 && !(await store.get('prospects', accountKey(email))).marketing.preference);
  await page.locator('#phone').fill('12'); await page.locator('#next').click();
  check('Early invalid callback number stays on its field with focused guidance', await page.locator('[data-step="1"]').isVisible() && await page.evaluate(() => document.activeElement.id === 'phone') && /highlighted/.test(await page.locator('#err').innerText()) && /cell|phone|number/i.test(await page.locator('#phone-error').innerText()));
  await page.locator('#phone').fill('7135550142'); prefResponse = page.waitForResponse(response => response.url().includes('/api/access') && response.request().method() === 'PUT' && response.request().postDataJSON().marketingConsent === true);
  await page.locator('#next').click(); await prefResponse; await page.locator('[data-step="2"]').waitFor({ state: 'visible' }); await page.locator('#back').click(); await page.locator('[data-step="1"]').waitFor({ state: 'visible' });
  check('Continue retries pending consent with the committed draft revision and keeps one signup journey', !(await page.locator('#draft-status').innerText()).includes('another tab') && (await store.get('prospects', accountKey(email))).marketing.preference === true);
  check('Optional verified browser opt-in is separately persisted without sending mail', (await store.get('prospects', accountKey(email))).marketing.preference === true && (await store.list('access_outbox')).length === 1);
  prefResponse = page.waitForResponse(response => response.url().includes('/api/access') && response.request().method() === 'PUT' && response.request().postDataJSON().marketingConsent === false);
  if (!await page.locator('#plan-email-preferences').evaluate(node => node.open)) await page.locator('#plan-email-preferences > summary').click();
  await page.locator('#setup-marketing').uncheck(); await prefResponse;
  check('Withdrawing optional email choice persists before continuation', (await store.get('prospects', accountKey(email))).marketing.preference === false && (await store.get('onboarding_drafts', accountKey(email))).emailPreference.preference === false);
  for (const value of ['voice', 'sms', 'calendar']) await page.locator('[name=desiredChannels][value=' + value + ']').check();
  await page.locator('#phone').fill('7135550142'); await page.locator('#businessNumber').fill('7135550120'); await page.locator('#next').click(); await page.locator('[data-step="2"]').waitFor({ state: 'visible' });
  check('Single full setup does not ask to retype captured name or business', await page.locator('#name').inputValue() === 'QA Saved Owner' && await page.locator('#business').inputValue() === 'QA Saved Air');
  await page.locator('#trade').selectOption('HVAC'); await page.locator('#services').fill('AC repair'); await page.locator('#hours').fill('Mon-Fri 8am-5pm'); await page.locator('#serviceArea').fill('Katy');
  await page.locator('#draft-status').filter({ hasText: 'Saved.' }).waitFor(); await page.reload(); await page.locator('[data-step="2"]').waitFor({ state: 'visible' });
  check('Full setup recovery preserves preliminary answers and all desired connections', await page.locator('#name').inputValue() === 'QA Saved Owner' && await page.locator('#business').inputValue() === 'QA Saved Air' && await page.locator('[name=desiredChannels]:checked').count() === 4 && !await page.locator('#setup-marketing').isChecked());
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 }); const geometry = await page.locator('#ob').evaluate(node => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, width: innerWidth, labelCount: node.querySelectorAll('label').length }));
    check('Full setup remains contained at ' + width + 'px', !geometry.overflow, geometry); await shot(page, 'setup-' + width);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#next').click(); await page.locator('[data-step="3"]').waitFor({ state: 'visible' }); await page.locator('#fees').fill('Diagnostic: $89'); await page.locator('#windows').fill('8 to 12\n12 to 5'); await page.locator('#next').click(); await page.locator('[data-step="4"]').waitFor({ state: 'visible' });
  routeFinalFieldError = true; await page.locator('#next').click(); await page.locator('[data-step="1"]').waitFor({ state: 'visible' });
  check('Final named server-field error returns to original field and preserves setup answers', await page.evaluate(() => document.activeElement.id === 'phone') && await page.locator('#business').inputValue() === 'QA Saved Air' && await page.locator('#services').inputValue() === 'AC repair' && (await store.list('clients')).length === 0);
  await page.locator('#phone').fill('7135550143');
  for (let n = 2; n <= 4; n++) { await page.locator('#next').click(); await page.locator('[data-step="' + n + '"]').waitFor({ state: 'visible' }); }
  await page.locator('#next').click(); await page.locator('#done.on').waitFor();
  const slug = (await store.list('clients'))[0], client = await store.getClient(slug);
  check('One create keeps selected connections without provider activation or billing', (await store.list('clients')).length === 1 && JSON.stringify(client.onboarding.desiredChannels) === JSON.stringify(['web', 'voice', 'sms', 'calendar']) && !client.channels.voice.active && !client.channels.sms.active && !client.billing?.subscriptionId);
  await page.locator('#goPortal').click(); await page.locator('#title').waitFor(); if (await page.locator('#guideDialog').isVisible()) await page.locator('#skipGuide').click();
  await page.locator('[data-t=setup]').click();
  check('Workspace presents requested connections in one place', await page.locator('#connectionJourney').isVisible() && /Phone|Text|Calendar/.test(await page.locator('#connectionJourney').innerText()));
  check('Unified setup hides duplicate legacy provider/purchase and delivery-test controls', !await page.locator('#legacyConnectionDetails').isVisible() && !await page.locator('#legacyDeliveryTests').isVisible() && await page.locator('#connectionPreferences input:checked').count() === 4);
  await page.locator('#connectionPreferencesDetails > summary').click();
  await page.locator('#connectionPreferences [value=web]').uncheck(); await page.locator('#connectionPreferences [value=sms]').uncheck();
  await page.locator('#saveConnections').click(); await page.locator('#connectionsMessage').filter({ hasText: 'Preferences saved' }).waitFor();
  check('Connection preferences save in the same workspace without activation', JSON.stringify((await store.getClient(slug)).onboarding.desiredChannels) === JSON.stringify(['voice', 'calendar']) && !(await store.getClient(slug)).channels.voice.active && /Not selected/.test(await page.locator('#connectionJourney').innerText()));
  await shot(page, 'connections-390');
  await shotElement(page, '#connectionsCard', 'connections-card-390');
  // Three stored states are fixtures for presentation only. No go-live, model request or channel is activated.
  const storedClient = await store.getClient(slug), ownerBearer = await page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
  const prepared = structuredClone(storedClient); prepared.status = 'live'; prepared.channels.web.active = true; prepared.onboarding.desiredChannels = ['web', 'voice', 'sms', 'calendar'];
  const revision = configurationRevision(prepared); prepared.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: 'live' };
  process.env.MC_FAKE_MODEL = '0'; process.env.ANTHROPIC_API_KEY = 'qa-placeholder-never-used';
  const renderStoredState = async () => { await page.reload(); await page.locator('#title').waitFor(); await page.locator('[data-t=setup]').click(); await page.locator('#connectionJourney').waitFor(); const response = await handlers['/api/client'](new Request(base + '/api/client?c=' + slug, { headers: { authorization: 'Bearer ' + ownerBearer, origin: base } })); return await response.json(); };
  await store.put('clients', slug, prepared); let fixtureState = await renderStoredState();
  check('Web connection can show Connected only for ready active available stored fixture', fixtureState.setup.channels.web.ready && fixtureState.setup.channels.web.active && fixtureState.aiAllowance.available && /Website chat · Connected/.test(await page.locator('#connectionJourney').innerText()));
  await store.put('clients', slug, { ...prepared, services: [] }); fixtureState = await renderStoredState();
  check('Unready rules cannot present an active stored web flag as Connected', !fixtureState.setup.channels.web.ready && fixtureState.setup.channels.web.active && !fixtureState.webAvailable && !/Website chat · Connected/.test(await page.locator('#connectionJourney').innerText()));
  await shotElement(page, '#connectionsCard', 'connections-unready-390');
  await store.put('clients', slug, prepared); process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = '0'; fixtureState = await renderStoredState();
  check('Exhausted AI allowance cannot present a ready active stored web flag as Connected', fixtureState.setup.channels.web.ready && fixtureState.setup.channels.web.active && !fixtureState.aiAllowance.available && !fixtureState.webAvailable && !/Website chat · Connected/.test(await page.locator('#connectionJourney').innerText()));
  await shotElement(page, '#connectionsCard', 'connections-limited-390');
  delete process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT; delete process.env.ANTHROPIC_API_KEY; process.env.MC_FAKE_MODEL = '1'; await store.put('clients', slug, storedClient);
  await page.goto(base + '/admin.html'); check('Inquiry data stays hidden before admin authority', !/QA Saved Owner|QA Saved Air/.test(await page.locator('body').innerText()) && await page.locator('#exportMarketing').isDisabled());
  await page.locator('#key').fill(process.env.ADMIN_KEY); await page.locator('#keyGo').click(); await page.locator('#prospectsStatus').filter({ hasText: 'eligible for marketing' }).waitFor();
  check('Admin distinguishes captured inquiry from eligible audience and no campaign', /1 inquiries.*0 eligible.*No campaign/.test(await page.locator('#prospectsStatus').innerText()) && /QA Saved Owner/.test(await page.locator('#prospects').innerText()));
  await page.locator('#msg').filter({ hasText: 'shop' }).waitFor();
  check('New self-service workspace creates no promised founder onboarding-call reminder', !/onboarding call promised|within one business day|onboarding.*called/i.test(await page.locator('#needs').innerText()));
  const inquiryAccess = await page.locator('#prospects').evaluate(region => {
    const headings = [...region.querySelectorAll('th')], last = headings.at(-1), r = last?.getBoundingClientRect();
    const scrollRegion = [region, ...region.querySelectorAll('*')].find(node => node.contains(last) && node.scrollWidth > node.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(node).overflowX));
    return { heading: last?.textContent, visibleRight: r?.right, viewport: innerWidth, accessible: !!r && (r.right <= innerWidth && r.left >= 0 || !!scrollRegion && scrollRegion.tabIndex >= 0), keyboardScroll: !!scrollRegion && scrollRegion.tabIndex >= 0, bodyOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  check('Every inquiry column is visible or keyboard reachable on mobile without page overflow', inquiryAccess.accessible && !inquiryAccess.bodyOverflow, inquiryAccess);
  await shot(page, 'admin-390'); await shotElement(page, 'section[aria-labelledby=prospectsTitle]', 'admin-inquiries-390'); await page.setViewportSize({ width: 1440, height: 900 }); await shot(page, 'admin-1440'); await shotElement(page, 'section[aria-labelledby=prospectsTitle]', 'admin-inquiries-1440');
  let downloading = page.waitForEvent('download'); await page.locator('#exportMarketing').click(); const eligibleDownload = await downloading; const eligibleCSV = readFileSync(await eligibleDownload.path(), 'utf8');
  check('Default marketing export excludes unchecked contact', eligibleDownload.suggestedFilename() === 'marketing-contacts.csv' && !eligibleCSV.includes(email) && result.requests.at(-1).query === '?audience=eligible&format=csv');
  downloading = page.waitForEvent('download'); await page.locator('#exportProspects').click(); const allDownload = await downloading, allCSV = readFileSync(await allDownload.path(), 'utf8');
  check('Explicit all-inquiries export includes contact with non-eligible status', allDownload.suggestedFilename() === 'all-inquiries.csv' && allCSV.includes(email) && allCSV.includes('"false"') && /not eligible/.test(await page.locator('#prospectsStatus').innerText()));
  const nextEmail = 'qa-acquisition-other-owner@example.test'; await page.goto(base + '/#pilot'); await page.locator('#intake-name').fill('QA Other Owner'); await page.locator('#intake-email').fill(nextEmail); await page.locator('#intake-business').fill('QA Other Business'); await page.locator('#intake-submit').click(); await page.waitForURL('**/onboard.html');
  await page.locator('#intake-notice').filter({ hasText: 'couldn’t add' }).waitFor();
  check('Prior owner session cannot adopt a new email handoff or expose its old workspace', !await page.locator('#ob').isVisible() && !await page.locator('#done.on').isVisible() && (await page.locator('#access-identity').innerText()).includes(email) && !await store.get('onboarding_drafts', accountKey(nextEmail)));
  await page.locator('#access-sign-out').click(); await page.locator('#access-gate').waitFor({ state: 'visible' });
  check('Identity switch revokes old bearer while preserving the intended new email gate', (await store.get('access_sessions', accessHash(ownerBearer))).status === 'revoked' && await page.locator('#access-email').inputValue() === nextEmail && !await store.get('access_outbox', accessHash(nextEmail)));
  await verify(page, nextEmail);
  check('New mailbox proof carries only the new owner preliminary answers', await page.locator('#name').inputValue() === 'QA Other Owner' && await page.locator('#business').inputValue() === 'QA Other Business' && await page.locator('#email').inputValue() === nextEmail);
  const blockedContext = await contextFor(); await blockedContext.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'mc-signup-intake-v1') throw new DOMException('QA storage disabled', 'SecurityError'); return original.call(this, key, value); }; });
  const blockedPage = await blockedContext.newPage(), noStorageEmail = 'qa-no-intake-storage@example.test'; await blockedPage.goto(base + '/#pilot'); await blockedPage.locator('#intake-name').fill('QA Storage Owner'); await blockedPage.locator('#intake-email').fill(noStorageEmail); await blockedPage.locator('#intake-business').fill('QA Storage Plumbing'); await blockedPage.locator('#intake-goal').selectOption('after_hours'); await blockedPage.locator('#intake-submit').click(); await blockedPage.waitForURL('**/onboard.html');
  check('Unavailable handoff storage still reaches secure email gate without exposed details', await blockedPage.locator('#access-email').inputValue() === '' && !new URL(blockedPage.url()).hash && !await blockedPage.locator('#ob').isVisible());
  await blockedPage.locator('#access-email').fill(noStorageEmail); await verify(blockedPage, noStorageEmail);
  check('Opaque fallback handoff restores answers after same-email proof without session intake storage', await blockedPage.locator('#name').inputValue() === 'QA Storage Owner' && await blockedPage.locator('#business').inputValue() === 'QA Storage Plumbing');
  await blockedContext.close(); await context.close();
 }
} catch (error) { result.fatal = error.stack; } finally { await browser.close(); }
result.sourceAfter = hashes(); check('Source bytes stayed stable through browser QA', JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter)); check('No server network calls or browser script errors', result.blockedServer.length === 0 && result.pageErrors.length === 0, { blockedServer: result.blockedServer, pageErrors: result.pageErrors });
result.summary = { passed: result.checks.filter(row => row.pass).length, failed: result.checks.filter(row => !row.pass).length, total: result.checks.length }; writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ output, ...result.summary, fatal: !!result.fatal })); if (result.fatal || result.summary.failed) process.exitCode = 1;
