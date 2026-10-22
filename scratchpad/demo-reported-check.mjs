// Explicitly authorized read-only reproduction: two fresh public homepage contexts, no sends.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const origin = 'https://machinesandcloud.com', sha = body => createHash('sha256').update(body).digest('hex');
const assets = new Set(['styles.css', 'site-refresh.css', 'script.js', 'agent-widget.js', 'stories.js']);
const report = { startedAt: new Date().toISOString(), authorization: 'Root authorized one fresh desktop and phone production diagnostic for reported plumber/Spanish first-click bug; normal motion; static GET only', localCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), assets: [], observations: [], screenshots: [], blockedRequests: [], browserErrors: [], formSubmissions: 0 };
const cache = new Map(), browser = await chromium.launch({ channel: 'chrome', headless: true });
async function snapshot(page, label) {
  const data = await page.locator('#demo-wrap').evaluate(wrap => {
    const r = wrap.getBoundingClientRect(), visibleWidth = Math.max(0, Math.min(r.right, innerWidth) - Math.max(0, r.left)), visibleHeight = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(0, r.top));
    return { width: innerWidth, height: innerHeight, scrollY, reducedMotion: matchMedia('(prefers-reduced-motion:reduce)').matches, scenario: [...wrap.querySelectorAll('[data-example]')].filter(el => el.getAttribute('aria-pressed') === 'true').map(el => ({ scenario: el.dataset.example, label: el.textContent.trim() })), channel: document.querySelector('#example-channel').textContent, progress: document.querySelector('#example-progress').textContent, play: { text: document.querySelector('#example-play').textContent, visible: !!document.querySelector('#example-play').getClientRects().length }, replayVisible: !!document.querySelector('#example-replay').getClientRects().length, messages: [...wrap.querySelectorAll('#example-messages .site-message')].map(el => ({ role: el.className, text: el.innerText, opacity: getComputedStyle(el).opacity, rect: { top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom } })), summary: document.querySelector('#example-summary').innerText, geometry: { top: r.top, bottom: r.bottom, height: r.height, intersectionRatio: visibleWidth * visibleHeight / (r.width * r.height) }, media: { audioElements: wrap.querySelectorAll('audio,video').length, iframeElements: wrap.querySelectorAll('iframe').length }, context: document.querySelector('#example-context').textContent, error: document.querySelector('#example-error').textContent };
  });
  report.observations.push({ at: new Date().toISOString(), label, ...data }); return data;
}
async function screenshot(page, name) { const path = `scratchpad/demo-reported-${name}.png`; await page.screenshot({ path }); report.screenshots.push(path); }
async function frame(page) { await page.evaluate(() => { const element = document.querySelector('#week'), nav = document.querySelector('#navbar'); scrollTo({ top: element.getBoundingClientRect().top + scrollY - nav.offsetHeight - 20, behavior: 'instant' }); }); await page.waitForTimeout(100); }
async function fresh(width) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const sameSite = [origin, 'https://www.machinesandcloud.com'].includes(url.origin), font = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
    if (request.method() !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/') || ['fetch', 'xhr', 'websocket'].includes(request.resourceType()) || (!sameSite && !font)) { report.blockedRequests.push({ method: request.method(), url: url.origin + url.pathname, resource: request.resourceType() }); return route.abort(); }
    const name = url.pathname.slice(1);
    if (sameSite && assets.has(name)) {
      if (!cache.has(name)) cache.set(name, (async () => { const response = await route.fetch({ maxRedirects: 0 }), body = await response.body(), headers = { ...response.headers() }; delete headers['content-encoding']; delete headers['content-length']; delete headers['transfer-encoding']; report.assets.push({ name, status: response.status(), sha256: sha(body), matchesLocal: sha(body) === sha(readFileSync(name)), networkGets: 1 }); return { status: response.status(), headers, body }; })());
      return route.fulfill(await cache.get(name));
    }
    return route.continue();
  });
  if (context.routeWebSocket) await context.routeWebSocket('**/*', ws => { report.blockedRequests.push({ method: 'WEBSOCKET', url: ws.url() }); ws.close(); });
  await context.exposeBinding('__reportedSubmit', () => { report.formSubmissions++; });
  await context.addInitScript(() => document.addEventListener('submit', event => { event.preventDefault(); void window.__reportedSubmit(); }, true));
  const page = await context.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', error => report.browserErrors.push(error.message));
  const response = await page.goto(origin, { waitUntil: 'networkidle' }); report.observations.push({ label: `${width} fresh homepage response`, status: response.status(), finalUrl: page.url() });
  return { context, page };
}
try {
  for (const width of [1440, 390]) {
    const name = width === 1440 ? 'desktop' : 'phone', { context, page } = await fresh(width);
    try {
      await snapshot(page, `${name}: untouched offscreen`); await frame(page); await snapshot(page, `${name}: first viewport framing`);
      await page.locator('[data-example="call"]').click(); await snapshot(page, `${name}: plumber immediate first click`);
      await page.waitForTimeout(8500); await snapshot(page, `${name}: plumber after8.5s without Play`); await screenshot(page, `${name}-plumber-firstclick`);
      await page.locator('#example-play').click(); await page.waitForTimeout(8500); await snapshot(page, `${name}: plumber after explicit Play8.5s`); await screenshot(page, `${name}-plumber-played`);
      await page.locator('[data-example="spanish"]').click(); await page.waitForTimeout(8500); await snapshot(page, `${name}: Spanish after first click8.5s`); await screenshot(page, `${name}-spanish-firstclick`);
      await page.locator('#example-play').click(); await page.waitForTimeout(2600); await snapshot(page, `${name}: Spanish playing2.6s`);
      await page.locator('[data-example="call"]').click(); await page.waitForTimeout(8500); await snapshot(page, `${name}: switched to plumber while playing after8.5s`);
      await page.locator('[data-example="spanish"]').click(); await page.locator('#example-play').click(); await page.waitForTimeout(8500); await snapshot(page, `${name}: Spanish after explicit Play8.5s`); await screenshot(page, `${name}-spanish-played`);
      await page.evaluate(() => { const el = document.querySelector('#example-summary'); scrollTo({ top: el.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' }); }); await snapshot(page, `${name}: owner summary framing`);
    } finally { await context.close(); }
  }
  report.result = 'diagnostic completed';
} catch (error) { report.result = 'diagnostic interrupted'; report.error = String(error.message || error); process.exitCode = 1; }
finally { await browser.close(); report.finishedAt = new Date().toISOString(); writeFileSync('scratchpad/demo-reported.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ result: report.result, observations: report.observations.length, error: report.error, blockedRequests: report.blockedRequests.length, browserErrors: report.browserErrors.length, formSubmissions: report.formSubmissions })); }
