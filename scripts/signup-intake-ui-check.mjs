// Local browser fixtures for the acquisition handoff. No email, provider or model requests.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.'), base = 'http://127.0.0.1:8897';
const sources = ['index.html', 'site-refresh.css', 'signup-intake.js', 'onboard.html', 'onboard.js'];
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const report = { at: new Date().toISOString(), mode: 'all static files and API responses fulfilled locally; no actual email/model/provider', sourceBefore: hashes(), checks: [], externalBlocked: [], pageErrors: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const handoff = 'a'.repeat(64), email = 'owner@example.test';
async function fixture(name, width = 390, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const state = { name, requests: [], failure: false, invalidHandoff: false, hold: false, release: null, attachFails: false, revision: 0, marketing: false, fields: { name: 'Avery Owner', business: 'Bayou Service', primaryGoal: 'missed_calls', desiredChannels: ['web'], plan: 'starter' } };
  await context.addInitScript(({ deny, session }) => {
    if (session) sessionStorage.setItem('mc-onboarding-session-v1', 'fixture-session');
    if (deny) Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Fixture storage blocked'); } });
  }, { deny: options.denyStorage === true, session: options.session === true });
  const accessState = () => ({ email, draft: { revision: state.revision, step: 0, fields: state.fields }, marketing: { preference: state.marketing, pendingRequest: true, suppressed: false } });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { report.externalBlocked.push({ case: name, origin: url.origin }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const body = request.method() === 'GET' ? null : request.postDataJSON(); state.requests.push({ path: url.pathname, method: request.method(), body });
      const respond = (status, value) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
      if (url.pathname === '/api/intake') {
        if (state.hold) await new Promise(resolve => { state.release = resolve; });
        if (state.failure) return respond(503, { message: 'Fixture storage is unavailable. Please try again.' });
        return respond(202, { ok: true, handoff: state.invalidHandoff ? 'unsafe' : handoff, expiresAt: new Date(Date.now() + 3600000).toISOString(), next: '/onboard.html#intake=' + handoff });
      }
      if (url.pathname === '/api/access') {
        if (body?.action === 'request_link') return respond(200, { message: 'If this email can continue, a sign-in link has been prepared.' });
        if (body?.action === 'exchange') return respond(200, { session: 'fixture-session' });
        if (body?.action === 'sign_out') return respond(200, { ok: true });
        if (body?.action === 'attach_intake' && state.attachFails) return respond(409, { error: 'intake_unavailable', message: 'These saved details could not be added to this account.' });
        if (request.method() === 'PUT') { state.fields = body.fields; state.revision++; if (Object.hasOwn(body, 'marketingConsent')) state.marketing = body.marketingConsent; }
        return respond(200, accessState());
      }
      return respond(403, { error: 'fixture_blocked' });
    }
    let file = resolve(root, decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
    if (!file.startsWith(root + '/') || file.split('/').some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
    if (!existsSync(file) || statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
  });
  const page = await context.newPage(); state.page = page; state.context = context;
  page.on('pageerror', error => report.pageErrors.push({ case: name, message: error.message }));
  state.fill = async () => { await page.locator('#intake-name').fill('Avery Owner'); await page.locator('#intake-email').fill(email); await page.locator('#intake-business').fill('Bayou Service'); await page.locator('#intake-goal').selectOption('missed_calls'); };
  return state;
}
try {
  for (const width of [320, 390, 1440]) {
    const s = await fixture(`journey-${width}`, width), page = s.page;
    await page.goto(base + '/#pilot');
    check(`${width}: four preliminary questions, optional goal and no default marketing selection`, await page.locator('#signup-intake [required]').count() === 3 && !await page.locator('#intake-goal').getAttribute('required') && !await page.locator('#intake-marketing').isChecked());
    await page.locator('#intake-submit').click(); check(`${width}: invalid form does not save or email`, s.requests.length === 0);
    await s.fill();
    const geometry = await page.locator('#signup-intake').evaluate(form => ({ left: form.getBoundingClientRect().left, right: form.getBoundingClientRect().right, viewport: innerWidth, document: document.documentElement.scrollWidth }));
    check(`${width}: form fits horizontally`, geometry.left >= 0 && geometry.right <= width + 1 && geometry.document <= width + 1, geometry);
    await page.locator('#signup-intake').screenshot({ path: `scratchpad/signup-intake-${width}.png` });
    await page.locator('#intake-submit').click(); await page.waitForURL('**/onboard.html');
    check(`${width}: saves once and handoff URL is scrubbed without personal information`, s.requests.filter(r => r.path === '/api/intake').length === 1 && new URL(page.url()).search === '' && new URL(page.url()).hash === '' && !page.url().includes('Avery'));
    check(`${width}: next page carries email but sends no automatic sign-in email`, await page.locator('#access-email').inputValue() === email && !s.requests.some(r => r.path === '/api/access'));
    await page.locator('#access-send').click();
    await page.waitForFunction(() => document.querySelector('#access-status').textContent.includes('prepared'));
    check(`${width}: explicit sign-in request carries opaque handoff and same email`, s.requests.at(-1).body.action === 'request_link' && s.requests.at(-1).body.email === email && s.requests.at(-1).body.intake === handoff);
    await page.goto(base + '/onboard.html#verify=fixture-token'); await page.locator('#access-verify').click(); await page.locator('#ob').waitFor({ state: 'visible' });
    check(`${width}: verified answers carry forward and email is readonly`, await page.locator('#name').inputValue() === 'Avery Owner' && await page.locator('#business').inputValue() === 'Bayou Service' && await page.locator('#email').getAttribute('readonly') !== null && await page.locator('#primaryGoal').inputValue() === 'missed_calls');
    check(`${width}: pending initial marketing request does not subscribe or precheck`, !await page.locator('#setup-marketing').isChecked());
    await page.locator('#phone').fill('7135550100'); await page.locator('[name="desiredChannels"][value="voice"]').check(); await page.locator('#next').click(); await page.waitForFunction(() => document.querySelector('fieldset[data-step="2"]').classList.contains('on'));
    const save = s.requests.filter(r => r.method === 'PUT').at(-1);
    check(`${width}: one setup saves desired connections without confirming untouched marketing`, save.body.fields.desiredChannels.includes('web') && save.body.fields.desiredChannels.includes('voice') && !Object.hasOwn(save.body, 'marketingConsent'));
    await page.screenshot({ path: `scratchpad/signup-onboard-${width}.png` });
    await s.context.close();
  }
  {
    for (const plan of ['starter', 'growth']) {
      const s = await fixture('plan-intent-' + plan), p = s.page; await p.goto(base + '/?plan=' + plan + '#pilot'); await s.fill(); await p.locator('#intake-submit').click(); await p.waitForURL('**/onboard.html?plan=' + plan);
      check(`${plan}: public plan intent survives capture without personal information in query`, new URL(p.url()).search === '?plan=' + plan && await p.locator('input[name="plan"]:checked').inputValue() === plan);
      await p.locator('#access-send').click(); await p.waitForFunction(() => document.querySelector('#access-status').textContent.includes('prepared'));
      check(`${plan}: explicit secure-link request carries preserved current plan preference`, s.requests.at(-1).body.plan === plan && s.requests.at(-1).body.intake === handoff); await s.context.close();
    }
  }
  {
    const s = await fixture('optional-goal'), p = s.page; await p.goto(base + '/?plan=retired#pilot'); await s.fill(); await p.locator('#intake-goal').selectOption(''); await p.locator('#intake-submit').click(); await p.waitForURL('**/onboard.html');
    check('Goal can be skipped without silently choosing one or carrying an invalid plan', s.requests[0].body.goal === '' && new URL(p.url()).search === ''); await s.context.close();
  }
  {
    const s = await fixture('retry-and-double-submit'), p = s.page; await p.goto(base + '/'); await s.fill(); await p.locator('#intake-marketing').check(); s.failure = true;
    await p.locator('#intake-submit').click(); await p.locator('#intake-status.is-error').waitFor(); const first = s.requests.at(-1).body;
    check('Failed save keeps all entered answers and opt-in choice', await p.locator('#intake-email').inputValue() === email && await p.locator('#intake-marketing').isChecked());
    await p.locator('#intake-submit').click(); await p.locator('#intake-status.is-error').waitFor();
    check('An unchanged explicit retry reuses its idempotency key', s.requests.at(-1).body.submissionId === first.submissionId);
    await p.locator('#intake-marketing').uncheck(); await p.locator('#intake-submit').click(); await p.locator('#intake-status.is-error').waitFor();
    check('A changed consent answer creates a new capture key and carries false explicitly', s.requests.at(-1).body.submissionId !== first.submissionId && s.requests.at(-1).body.marketingConsent === false);
    s.failure = false; s.hold = true; await p.locator('#intake-submit').click(); await p.waitForFunction(() => document.querySelector('#intake-submit').disabled);
    const before = s.requests.length; await p.locator('#signup-intake').evaluate(form => form.requestSubmit()); await p.waitForTimeout(60);
    check('Double submission during a pending save sends one request', s.requests.length === before);
    s.release(); await p.waitForURL('**/onboard.html'); await s.context.close();
  }
  {
    const s = await fixture('storage-blocked', 390, { denyStorage: true }), p = s.page; await p.goto(base + '/'); await s.fill(); await p.locator('#intake-submit').click(); await p.waitForURL('**/onboard.html');
    check('Storage-blocked handoff retains opaque capability, removes fragment and explains same-email entry', new URL(p.url()).hash === '' && /same email/.test(await p.locator('#access-intro').innerText()) && await p.locator('#access-email').inputValue() === '');
    await p.locator('#access-email').fill(email); await p.locator('#access-send').click(); await p.waitForFunction(() => document.querySelector('#access-status').textContent.includes('prepared'));
    check('Storage-blocked sign-in request still carries handoff', s.requests.at(-1).body.intake === handoff); await s.context.close();
  }
  {
    const s = await fixture('verified-marketing', 390, { session: true }), p = s.page; await p.goto(base + '/onboard.html'); await p.locator('#ob').waitFor({ state: 'visible' });
    await p.locator('#setup-marketing').check(); await p.waitForTimeout(800); await p.waitForFunction(() => document.querySelector('#draft-status').textContent.startsWith('Saved.'));
    check('Verified explicit email opt-in is a separate top-level preference', s.requests.filter(r => r.method === 'PUT').at(-1).body.marketingConsent === true);
    await p.locator('#setup-marketing').uncheck(); await p.waitForTimeout(800); await p.waitForFunction(() => document.querySelector('#draft-status').textContent.startsWith('Saved.'));
    check('Verified explicit opt-out saves false', s.requests.filter(r => r.method === 'PUT').at(-1).body.marketingConsent === false); await s.context.close();
  }
  {
    const s = await fixture('wrong-account', 390, { session: true }), p = s.page; s.attachFails = true; await p.goto(base + '/onboard.html#intake=' + handoff); await p.locator('#access-signed-in').waitFor({ state: 'visible' });
    check('Wrong-account handoff keeps private setup hidden with sign-out recovery', !await p.locator('#ob').isVisible() && await p.locator('#access-sign-out').isVisible() && /couldn’t be added/.test(await p.locator('#intake-notice').innerText()));
    check('Wrong-account fragment is removed even on attachment failure', new URL(p.url()).hash === ''); await s.context.close();
  }
  {
    const s = await fixture('invalid-handoff'), p = s.page; s.invalidHandoff = true; await p.goto(base + '/'); await s.fill(); await p.locator('#intake-submit').click(); await p.locator('#intake-status.is-error').waitFor();
    check('Malformed success response does not navigate or discard entered answers', new URL(p.url()).pathname === '/' && await p.locator('#intake-business').inputValue() === 'Bayou Service'); await s.context.close();
  }
} finally {
  report.sourceAfter = hashes(); check('Source remained unchanged during browser verification', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
  check('No browser page errors', report.pageErrors.length === 0, report.pageErrors);
  report.passed = report.checks.filter(c => c.pass).length; report.failed = report.checks.filter(c => !c.pass).length;
  writeFileSync('scratchpad/signup-intake-ui.json', JSON.stringify(report, null, 2) + '\n'); await browser.close();
}
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, externalRequests: 0, mode: report.mode }));
if (report.failed) process.exitCode = 1;
