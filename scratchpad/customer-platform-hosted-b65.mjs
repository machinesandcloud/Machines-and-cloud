// Exact approved b65 publication: bounded GETs, then offline browser rendering of captured CDN bytes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const root = '/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud';
const source = '/tmp/mc-platform-release-b65c0f4';
const output = `${root}/scratchpad/customer-platform-hosted-b65.json`;
if (existsSync(output)) throw new Error('Do not overwrite hosted evidence');
const sha = value => createHash('sha256').update(value).digest('hex');
const report = { startedAt: new Date().toISOString(), commit: 'b65c0f4fef06d8f4e44e2a04101698034bd14842', deployId: '6ad98d7be2a7b05658217178', scope: 'At most 25 hosted GETs. Browser receives captured deployed bytes only; no live browser network, signup, email, model, voice, form submission or tenant changes.', requests: [], checks: [], browser: { intercepted: [], errors: [] } };
const cache = new Map();
function check(name, ok, detail) { report.checks.push({ name, ok: !!ok, ...(detail === undefined ? {} : { detail }) }); }
async function get(url, redirects = 0) {
  if (report.requests.length >= 25) throw new Error('25 GET ceiling reached');
  const entry = { method: 'GET', url, at: new Date().toISOString() }; report.requests.push(entry);
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const bytes = Buffer.from(await res.arrayBuffer());
  Object.assign(entry, { status: res.status, contentType: res.headers.get('content-type'), bytes: bytes.length, sha256: sha(bytes), headers: Object.fromEntries(['x-frame-options','x-content-type-options','referrer-policy','permissions-policy','content-security-policy','x-nf-request-id'].map(k => [k,res.headers.get(k)])) });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
    if (redirects >= 2) throw new Error('Unexpected redirect chain');
    const next = new URL(res.headers.get('location'), url); entry.location = next.href;
    if (!['machinesandcloud.com','www.machinesandcloud.com'].includes(next.hostname)) throw new Error('Unexpected redirect host');
    return get(next.href, redirects + 1);
  }
  const result = { res, bytes, entry, url };
  cache.set(new URL(url).pathname, result);
  return result;
}
let browser;
try {
  const home = await get('https://machinesandcloud.com/');
  const base = new URL(home.url).origin; report.origin = base;
  check('Homepage returns 200 HTML', home.res.status === 200 && /text\/html/.test(home.entry.contentType));
  check('Homepage carries approved self-service CTA and channel limits', /href="onboard.html"/.test(home.bytes.toString()) && /Website chat first\. Phone and texting need separate setup\. No subscription starts\./.test(home.bytes.toString()));
  check('Global nosniff, referrer and framing headers are present', home.entry.headers['x-content-type-options'] === 'nosniff' && home.entry.headers['x-frame-options'] === 'SAMEORIGIN' && home.entry.headers['referrer-policy'] === 'strict-origin-when-cross-origin');
  const publicPaths = ['onboard.html','desk.html','styles.css','site-refresh.css','script.js','stories.js','practice-voice.js','agent-widget.js','onboard.js','desk.js','embed.js','assets/logo-dark.png','assets/photos/hero-hvac.jpg','assets/favicon.png'];
  for (const path of publicPaths) {
    const result = await get(`${base}/${path}`);
    check(`Public ${path} is available`, result.res.status === 200);
    // Netlify transforms forms in HTML. All untransformed browser assets must be byte-exact.
    if (!path.endsWith('.html')) check(`Deployed ${path} matches approved source bytes`, result.entry.sha256 === sha(readFileSync(`${source}/${path}`)));
  }
  for (const path of ['product/SETUP-FOR-BROWSER-AGENT.md','package.json','netlify/functions/chat.mjs','scratchpad/public-build-manifest.json','.env']) {
    const result = await get(`${base}/${path}`);
    check(`Private source ${path} is absent from public package`, result.res.status === 404);
  }
  const health = await get(`${base}/api/health`);
  let healthData = {}; try { healthData = JSON.parse(health.bytes.toString()); } catch {}
  report.health = { status: health.res.status, data: healthData };
  check('One hosted health GET is healthy', health.res.status === 200 && healthData.ok === true, healthData);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    report.browser.intercepted.push({ method: req.method(), path: url.origin === base ? url.pathname : url.origin, disposition: 'blocked' });
    const captured = cache.get(url.pathname);
    if (req.method() === 'GET' && url.origin === base && !url.pathname.startsWith('/api/') && captured) {
      report.browser.intercepted.at(-1).disposition = 'captured-deployed-bytes';
      return route.fulfill({ status: captured.res.status, contentType: captured.entry.contentType || 'application/octet-stream', body: captured.bytes });
    }
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.browser.errors.push(error.message));
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.site-hero .site-button').waitFor({ state: 'visible' });
  check('Captured deployed homepage mobile signup targets onboard.html', await page.locator('.site-hero .site-button').getAttribute('href') === 'onboard.html');
  await page.locator('.navbar-toggle').click();
  check('Captured deployed mobile menu opens and has secure sign in', await page.locator('#navMenu').isVisible() && await page.locator('#navMenu a[href="onboard.html?signin=1"]').isVisible());
  await page.screenshot({ path: `${root}/scratchpad/customer-platform-hosted-b65-home-390.png`, fullPage: false });
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/onboard.html`, { waitUntil: 'domcontentloaded' });
    check(`Captured deployed email gate visible at ${width}px`, await page.locator('#access-gate').isVisible() && await page.locator('#access-email').isVisible());
    check(`Unverified business form hidden at ${width}px`, await page.locator('#ob').isHidden());
    check(`Captured deployed signup has no horizontal overflow at ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 320) await page.screenshot({ path: `${root}/scratchpad/customer-platform-hosted-b65-signup-320.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/desk.html`, { waitUntil: 'domcontentloaded' });
  check('Captured deployed owner page requires email access without credentials', await page.locator('#portalRecovery').isVisible() && await page.locator('#status').textContent() === 'Sign in to continue');
  check('Captured deployed owner data stays hidden without credentials', await page.locator('#portalContent').isHidden());
  await page.screenshot({ path: `${root}/scratchpad/customer-platform-hosted-b65-owner-gate-390.png`, fullPage: false });
  check('Browser captured-byte proof makes no API requests', !report.browser.intercepted.some(x => x.path.startsWith('/api/')));
  check('Browser captured-byte proof makes no non-GET requests', !report.browser.intercepted.some(x => x.method !== 'GET'));
  check('No browser JavaScript errors', report.browser.errors.length === 0, report.browser.errors);
} catch (error) {
  report.error = error.stack; check('Hosted proof completed', false, error.message);
} finally {
  await browser?.close(); report.finishedAt = new Date().toISOString();
  report.summary = { hostedGetRequests: report.requests.length, maximumHostedGetRequests: 25, passed: report.checks.filter(x => x.ok).length, failed: report.checks.filter(x => !x.ok).length, browserNetworkRequestsSent: 0 };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report.summary, failures: report.checks.filter(x => !x.ok), error: report.error }));
}
