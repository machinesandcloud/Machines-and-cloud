// Targeted harness correction; preserve the original report, spend only three further hosted GETs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const root = '/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud';
const source = '/tmp/mc-platform-release-b65c0f4';
const output = `${root}/scratchpad/customer-platform-hosted-b65-browser-final.json`;
if (existsSync(output)) throw new Error('Do not overwrite evidence');
const prior = JSON.parse(readFileSync(`${root}/scratchpad/customer-platform-hosted-b65.json`));
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { startedAt: new Date().toISOString(), commit: prior.commit, deployId: prior.deployId, scope: 'Targeted correction of unavailable bundled Chromium and quote-dependent HTML regex. System Chrome; only 3 new HTML GETs. Browser networking fully intercepted. Asset bytes are pinned source bytes already SHA-equal to actual deployed responses in original report.', original: 'scratchpad/customer-platform-hosted-b65.json', originalHostedGetRequests: prior.requests.length, additionalHostedRequests: [], checks: [], browser: { intercepted: [], errors: [] } };
const cache = new Map(); const base = prior.origin;
function check(name, ok, detail) { report.checks.push({ name, ok: !!ok, ...(detail === undefined ? {} : { detail }) }); }
let browser;
try {
  // Confirm Chrome is usable before any further hosted request.
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const old of prior.requests) {
    const path = new URL(old.url).pathname;
    if (old.status !== 200 || path.startsWith('/api/') || path === '/' || path.endsWith('.html')) continue;
    const bytes = readFileSync(`${source}${path}`);
    if (sha(bytes) !== old.sha256) throw new Error(`Source bytes changed: ${path}`);
    cache.set(path, { bytes, status: old.status, contentType: old.contentType });
  }
  mkdirSync('/tmp/mc-platform-b65-hosted-html', { recursive: true });
  for (const path of ['/', '/onboard.html', '/desk.html']) {
    if (prior.requests.length + report.additionalHostedRequests.length >= 25) throw new Error('Aggregate 25 GET ceiling reached');
    const entry = { method: 'GET', url: base + path, at: new Date().toISOString() }; report.additionalHostedRequests.push(entry);
    const response = await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    Object.assign(entry, { status: response.status, sha256: sha(bytes), bytes: bytes.length, contentType: response.headers.get('content-type') });
    check(`Targeted captured HTML ${path} returns200`, response.status === 200);
    if (response.status !== 200) throw new Error('Unexpected HTML response; no follow-up GET authorized');
    writeFileSync(`/tmp/mc-platform-b65-hosted-html/${path === '/' ? 'index.html' : path.slice(1)}`, bytes);
    cache.set(path, { bytes, status: response.status, contentType: entry.contentType });
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), captured = cache.get(url.pathname);
    const record = { method: req.method(), path: url.origin === base ? url.pathname : url.origin, disposition: 'blocked' }; report.browser.intercepted.push(record);
    if (req.method() === 'GET' && url.origin === base && !url.pathname.startsWith('/api/') && captured) {
      record.disposition = 'verified-deployed-bytes';
      return route.fulfill({ status: captured.status, contentType: captured.contentType || 'application/octet-stream', body: captured.bytes });
    }
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.on('pageerror', error => report.browser.errors.push(error.message));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const cta = page.locator('.site-hero .site-button'); await cta.waitFor({ state: 'visible' });
  check('Deployed homepage CTA resolves to self-service onboard.html', await cta.getAttribute('href') === 'onboard.html');
  check('Deployed homepage states website-first, separate phone/text setup and no subscription', /Website chat first\. Phone and texting need separate setup\. No subscription starts\./.test(await page.locator('.site-hero-note').innerText()));
  await page.locator('#navToggle').click();
  check('Deployed mobile menu opens and secure Sign in link is visible', await page.locator('#navMenu a[href="onboard.html?signin=1"]').isVisible() && await page.locator('#navToggle').getAttribute('aria-expanded') === 'true');
  await page.screenshot({ path: `${root}/scratchpad/customer-platform-hosted-b65-home-390.png`, fullPage: false });
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '/onboard.html', { waitUntil: 'domcontentloaded' });
    check(`Deployed signup email gate visible at ${width}px`, await page.locator('#access-gate').isVisible() && await page.locator('#access-email').isVisible());
    check(`Deployed signup business form hidden before verification at ${width}px`, await page.locator('#ob').isHidden());
    check(`Deployed signup has no horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 320) await page.screenshot({ path: `${root}/scratchpad/customer-platform-hosted-b65-signup-320.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/desk.html', { waitUntil: 'domcontentloaded' });
  check('Deployed owner page asks uncredentialed visitor to sign in', await page.locator('#portalRecovery').isVisible() && await page.locator('#status').textContent() === 'Sign in to continue');
  check('Deployed owner data stays hidden without credentials', await page.locator('#portalContent').isHidden());
  await page.screenshot({ path: `${root}/scratchpad/customer-platform-hosted-b65-owner-gate-390.png`, fullPage: false });
  check('No API requests attempted in browser proof', !report.browser.intercepted.some(x => x.path.startsWith('/api/')));
  check('No non-GET requests attempted in browser proof', !report.browser.intercepted.some(x => x.method !== 'GET'));
  check('No browser JavaScript errors', report.browser.errors.length === 0, report.browser.errors);
} catch (error) { report.error = error.stack; check('Targeted browser proof completed', false, error.message); }
finally {
  await browser?.close(); report.finishedAt = new Date().toISOString();
  report.summary = { originalHostedGetRequests: prior.requests.length, additionalHostedGetRequests: report.additionalHostedRequests.length, aggregateHostedGetRequests: prior.requests.length + report.additionalHostedRequests.length, maximumHostedGetRequests: 25, passed: report.checks.filter(x => x.ok).length, failed: report.checks.filter(x => !x.ok).length, browserNetworkRequestsSent: 0 };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report.summary, failures: report.checks.filter(x => !x.ok), error: report.error }));
}
