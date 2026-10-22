// Resolve Netlify Pretty URL assertions using the saved deployed HTML; no prior proof is overwritten.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const root = '/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud', source = '/tmp/mc-platform-release-b65c0f4';
const output = root + '/scratchpad/customer-platform-hosted-b65-adjudication.json';
if (existsSync(output)) throw new Error('Do not overwrite evidence');
const first = JSON.parse(readFileSync(root + '/scratchpad/customer-platform-hosted-b65.json'));
const second = JSON.parse(readFileSync(root + '/scratchpad/customer-platform-hosted-b65-browser-final.json'));
const sha = b => createHash('sha256').update(b).digest('hex'), base = first.origin, cache = new Map();
const report = { startedAt: new Date().toISOString(), commit: first.commit, deployId: first.deployId, priorReports: ['scratchpad/customer-platform-hosted-b65.json','scratchpad/customer-platform-hosted-b65-browser-final.json'], explanation: 'Netlify Pretty URLs changed literal source href="onboard.html" to deployed href=\'/onboard\' and Sign in to /onboard?signin=1. The original regex/exact href assertions were invalid for this published HTML. All earlier raw failures remain. This target uses saved deployed HTML and previously SHA-verified asset bytes. One remaining actual GET checks the clean route first redirect; its www target is not followed under the25 GET ceiling.', checks: [], requests: [], browser: { intercepted: [], errors: [] } };
function check(name, ok, detail) { report.checks.push({ name, ok: !!ok, ...(detail === undefined ? {} : { detail }) }); }
let browser;
try {
  for (const entry of first.requests) {
    const path = new URL(entry.url).pathname;
    if (entry.status !== 200 || path.startsWith('/api/') || path === '/' || path.endsWith('.html')) continue;
    const bytes = readFileSync(source + path); if (sha(bytes) !== entry.sha256) throw new Error('Source differs from hosted hash');
    cache.set(path, { bytes, contentType: entry.contentType });
  }
  for (const entry of second.additionalHostedRequests) {
    const path = new URL(entry.url).pathname, bytes = readFileSync('/tmp/mc-platform-b65-hosted-html/' + (path === '/' ? 'index.html' : path.slice(1)));
    if (sha(bytes) !== entry.sha256) throw new Error('Captured HTML changed');
    cache.set(path, { bytes, contentType: entry.contentType });
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  if (second.summary.aggregateHostedGetRequests !== 24) throw new Error('Unexpected prior request count');
  const routeResponse = await fetch(base + '/onboard', { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  await routeResponse.arrayBuffer();
  report.requests.push({ method: 'GET', url: base + '/onboard', status: routeResponse.status, location: routeResponse.headers.get('location'), at: new Date().toISOString() });
  check('Deployed clean signup route redirects to expected www/onboard.html', routeResponse.status === 301 && routeResponse.headers.get('location') === 'https://www.machinesandcloud.com/onboard.html');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname === '/onboard' ? '/onboard.html' : url.pathname;
    const value = cache.get(path), record = { method: request.method(), path: url.origin === base ? url.pathname : url.origin, disposition: 'blocked' }; report.browser.intercepted.push(record);
    if (request.method() === 'GET' && url.origin === base && !path.startsWith('/api/') && value) { record.disposition = path !== url.pathname ? 'captured-signup-alias-fixture' : 'verified-deployed-bytes'; return route.fulfill({ status: 200, contentType: value.contentType, body: value.bytes }); }
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.on('pageerror', error => report.browser.errors.push(error.message));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const cta = page.locator('.site-hero .site-button');
  check('Actual deployed signup CTA resolves to clean /onboard route', await cta.getAttribute('href') === '/onboard');
  await page.locator('#navToggle').click();
  const signIn = page.locator('#navMenu a').filter({ hasText: /^Sign in$/ });
  check('Actual deployed mobile menu opens and Sign in targets clean secure route', await signIn.isVisible() && await signIn.getAttribute('href') === '/onboard?signin=1' && await page.locator('#navToggle').getAttribute('aria-expanded') === 'true');
  await page.screenshot({ path: root + '/scratchpad/customer-platform-hosted-b65-home-menu-final-390.png', fullPage: false });
  await page.locator('#navToggle').click(); await cta.click();
  check('Captured deployed CTA interaction reaches captured email gate through declared alias fixture', new URL(page.url()).pathname === '/onboard' && await page.locator('#access-email').isVisible() && await page.locator('#ob').isHidden());
  check('No API or non-GET requests attempted', !report.browser.intercepted.some(x => x.path.startsWith('/api/') || x.method !== 'GET'));
  check('No browser JavaScript errors', report.browser.errors.length === 0, report.browser.errors);
} catch (error) { report.error = error.stack; check('Adjudication completed', false, error.message); }
finally {
  await browser?.close(); report.finishedAt = new Date().toISOString();
  report.summary = { earlierHostedGetRequests: 24, additionalHostedGetRequests: report.requests.length, aggregateHostedGetRequests: 24 + report.requests.length, maximumHostedGetRequests: 25, passed: report.checks.filter(x => x.ok).length, failed: report.checks.filter(x => !x.ok).length, browserNetworkRequestsSent: 0 };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report.summary, failures: report.checks.filter(x => !x.ok), error: report.error }));
}
