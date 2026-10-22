// Bounded browser regression: local static/API fixtures only; no email, AI or provider requests.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
globalThis.fetch = async () => { throw new Error('Recovery QA blocks server networking'); };
const { e164 } = await import('../netlify/functions/lib/send.mjs');
const root = resolve('.'), base = 'http://127.0.0.1:8896';
const files = ['onboard.html', 'onboard.js'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const report = { at: new Date().toISOString(), mode: 'browser/API fixtures; no actual email, model or provider', sourceBefore: hashes(), checks: [], blockedExternal: [], pageErrors: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const state = { fields: { name: 'Avery Owner', business: 'Bayou Service', plan: 'starter', desiredChannels: ['web'] }, step: 0, revision: 0, requests: [], fieldError: null };
await context.addInitScript(() => sessionStorage.setItem('mc-onboarding-session-v1', 'fixture-session'));
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== base) { report.blockedExternal.push(url.origin); return route.abort('blockedbyclient'); }
  if (url.pathname.startsWith('/api/')) {
    const body = request.method() === 'GET' ? null : request.postDataJSON(); state.requests.push({ path: url.pathname, method: request.method(), body });
    if (url.pathname === '/api/access') {
      if (request.method() === 'PUT') { state.fields = body.fields; state.step = body.step; state.revision++; }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: 'owner@example.test', draft: { fields: state.fields, step: state.step, revision: state.revision }, marketing: { preference: false } }) });
    }
    if (url.pathname === '/api/onboard') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'fixture_validation', field: state.fieldError, message: 'Please correct the saved callback details.' }) });
    return route.fulfill({ status: 403, body: '{}' });
  }
  let file = resolve(root, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(root + '/') || !existsSync(file) || statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  const contentType = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream';
  return route.fulfill({ status: 200, contentType, body: readFileSync(file) });
});
const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
const step = number => page.locator('fieldset[data-step="' + number + '"]');
const next = async number => { await page.locator('#next').click(); await step(number).waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.getElementById('next').disabled); };
try {
  await page.goto(base + '/onboard.html'); await step(1).waitFor({ state: 'visible' });
  for (const value of ['12345', '+44 207 123 4567', '+1 713 555 0100 ext 22', '7135550100+']) {
    await page.locator('#phone').fill(value); await page.locator('#next').click();
    check('Invalid callback is stopped on its first step: ' + value, !/^\+1\d{10}$/.test(e164(value.trim().slice(0, 30))) && await step(1).isVisible() && await page.locator('#phone').evaluate(node => node === document.activeElement && node.getAttribute('aria-invalid') === 'true') && /valid US callback/.test(await page.locator('#err').innerText()));
  }
  check('Early phone validation never attempts account creation', !state.requests.some(request => request.path === '/api/onboard'));
  for (const value of ['7135550100', '(713) 555-0100', '1 713 555 0100', '+1 (713) 555-0100']) {
    await page.locator('#phone').fill(value); await next(2);
    check('Server-compatible callback format advances: ' + value, /^\+1\d{10}$/.test(e164(value.trim().slice(0, 30))) && await step(2).isVisible() && !await page.locator('#phone').getAttribute('aria-invalid'));
    await page.locator('#back').click(); await step(1).waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.getElementById('next').disabled);
  }
  await next(2); await next(3); await next(4); await page.locator('#notes').fill('Keep this saved draft.'); state.fieldError = 'owner.phone'; await page.locator('#next').click(); await step(1).waitFor({ state: 'visible' });
  check('Final server callback error reveals its earlier step and focuses the field', await page.locator('#phone').evaluate(node => node === document.activeElement && node.classList.contains('error') && node.getAttribute('aria-invalid') === 'true'));
  check('Routed server error retains its message and all questionnaire answers', /correct the saved callback/.test(await page.locator('#err').innerText()) && await page.locator('#notes').inputValue() === 'Keep this saved draft.' && await page.locator('#business').inputValue() === 'Bayou Service');
  await page.locator('#phone').fill('7135550101'); check('Editing a corrected field clears its stale invalid marker', !await page.locator('#phone').getAttribute('aria-invalid') && !await page.locator('#phone').evaluate(node => node.classList.contains('error')));
  await next(2); await next(3); await next(4); state.fieldError = 'business.name'; await page.locator('#next').click(); await step(2).waitFor({ state: 'visible' });
  check('Nested business-name error maps to business rather than the owner name', await page.locator('#business').evaluate(node => node === document.activeElement && node.classList.contains('error')) && !await page.locator('#name').evaluate(node => node.classList.contains('error')));
  await next(3); await next(4); state.fieldError = 'unknown.serverField'; await page.locator('#next').click(); await page.waitForFunction(() => !document.getElementById('next').disabled);
  check('Unknown server field keeps the current step with a readable error', await step(4).isVisible() && /correct the saved callback/.test(await page.locator('#err').innerText()));
  await page.screenshot({ path: 'scratchpad/onboard-recovery-ui.png', fullPage: true });
} finally {
  report.sourceAfter = hashes(); check('Recovery source remained stable during verification', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
  check('No browser page errors', report.pageErrors.length === 0, report.pageErrors);
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, total: report.checks.length };
  writeFileSync('scratchpad/onboard-recovery-ui.json', JSON.stringify(report, null, 2) + '\n'); await browser.close();
}
console.log(JSON.stringify(report.summary)); if (report.summary.failed) process.exitCode = 1;
