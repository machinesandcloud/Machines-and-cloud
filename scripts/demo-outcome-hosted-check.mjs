// Bounded public GET-only acceptance. Prepare freely; run only after publication READY.
// This runner has no voice-approved mode. Actual audio requires a separate authorization.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
if (args.includes('--help')) {
  console.log('After root confirms the exact published pointer READY: node scripts/demo-outcome-hosted-check.mjs --published-ready --expected-published-commit <40-char SHA> --deploy-id <24-char Netlify ID> --playwright /existing/playwright/index.mjs --output-prefix scratchpad/<unique-run>');
  console.log('Two fresh normal-motion contexts (1440 and390); one call→Spanish Watch sequence each; six cached static assets; no API, forms, microphone, voice session or WebSocket. No voice-approved option.');
  process.exit(0);
}
assert.ok(!args.includes('--voice-approved'), 'This GET-only runner never authorizes voice; use a separately approved runner');
assert.ok(args.includes('--published-ready'), 'Do not run before root confirms the authorized deployment published READY');
const expectedCommit = option('--expected-published-commit');
const deployId = option('--deploy-id');
const playwrightPath = option('--playwright');
const prefix = option('--output-prefix');
assert.match(expectedCommit || '', /^[a-f0-9]{40}$/, 'Supply the exact expected published commit');
assert.match(deployId || '', /^[a-f0-9]{24}$/, 'Supply the confirmed Netlify deployment ID');
assert.ok(playwrightPath, 'Use an existing Playwright module; no dependency installation');
assert.ok(prefix && resolve(prefix).startsWith(resolve('scratchpad') + '/'), 'Use a unique scratchpad output prefix');
assert.ok(existsSync(dirname(resolve(prefix))), 'Output directory must already exist');
assert.ok(!existsSync(prefix + '.json'), 'Do not overwrite an earlier report');
for (const suffix of ['-1440-call.png', '-390-spanish.png', '-390-owner.png', '-390-menu.png']) assert.ok(!existsSync(prefix + suffix), 'Screenshot prefix must also be unique');

const origin = 'https://machinesandcloud.com';
const sameSite = candidate => [origin, 'https://www.machinesandcloud.com'].includes(candidate);
const hash = body => createHash('sha256').update(body).digest('hex');
const assets = ['styles.css', 'site-refresh.css', 'script.js', 'stories.js', 'agent-widget.js', 'practice-voice.js'];
const gitBody = file => execFileSync('git', ['show', `${expectedCommit}:${file}`], { maxBuffer: 20 * 1024 * 1024 });
const accepted = Object.fromEntries([...assets, 'index.html', '_headers'].map(file => [file, hash(gitBody(file))]));
for (const file of Object.keys(accepted)) assert.equal(hash(readFileSync(file)), accepted[file], `Current ${file} must match the exact expected commit before hosted comparison`);
const report = {
  startedAt: new Date().toISOString(), origin, expectedPublishedCommit: expectedCommit, deployId,
  publicationPointer: 'Root-supplied READY receipt; static HTML cannot independently establish a Git commit. This runner does not call Netlify APIs.',
  acceptedSource: accepted, sourceFingerprint: hash(JSON.stringify(accepted)),
  scope: 'Exactly two fresh homepage contexts1440×1000 and390×844; normal call→Spanish Watch sequence once in each, static voice discovery, mobile owner dialog/menu, brief footer/links. Six required static assets receive at most one network GET each and are cached across contexts. No API/model/form/microphone/voice/WebSocket.',
  checks: [], issues: [], pages: [], assets: [], playback: [], footer: [], screenshots: [],
  blockedRequests: [], browserErrors: [], cspViolations: [], attempts: [],
};
const check = (name, pass, detail) => {
  const row = { name, pass: !!pass, ...(detail === undefined ? {} : { detail }) };
  report.checks.push(row); if (!pass) report.issues.push(row);
};
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [];
const cache = new Map();
const normalize = path => path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
const safeRequest = request => {
  const url = new URL(request.url());
  return { method: request.method(), host: url.hostname, resource: request.resourceType(), path: sameSite(url.origin) ? url.pathname : '[external path omitted]' };
};

async function fresh(width) {
  const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  contexts.push(context);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const site = sameSite(url.origin);
    const font = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
    const forbidden = request.method() !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/') || ['fetch', 'xhr', 'eventsource', 'websocket'].includes(request.resourceType()) || (!site && !font) || url.username || url.password;
    if (forbidden || (request.isNavigationRequest() && (!site || !['/', '/index.html'].includes(url.pathname) || url.search))) {
      report.blockedRequests.push(safeRequest(request)); return route.abort();
    }
    // Cache only static resources, including fonts/images, across both fresh contexts.
    // Required CSS/JS hashes are recorded; query strings and response headers are never logged.
    if (!request.isNavigationRequest()) {
      const assetName = site && assets.includes(url.pathname.slice(1)) ? url.pathname.slice(1) : null;
      const key = assetName || request.url();
      if (!cache.has(key)) cache.set(key, (async () => {
        // Fetch required files from the primary host even if an HTML alias used www.
        // Both aliases then share one filename cache and one actual asset GET.
        const response = await route.fetch({ ...(assetName ? { url: origin + '/' + assetName } : {}), maxRedirects: 0, timeout: 20000 });
        const body = await response.body(), headers = { ...response.headers() };
        for (const name of ['content-encoding', 'content-length', 'transfer-encoding']) delete headers[name];
        const name = assetName;
        if (assets.includes(name)) report.assets.push({ name, status: response.status(), sha256: hash(body), matchesAccepted: hash(body) === accepted[name], networkGets: 1 });
        return { status: response.status(), headers, body };
      })());
      const cached = await cache.get(key);
      return route.fulfill({ ...cached, headers: { ...cached.headers, 'cache-control': 'no-store' } });
    }
    return route.continue();
  });
  assert.equal(typeof context.routeWebSocket, 'function', 'Existing Playwright must support an explicit WebSocket guard');
  await context.routeWebSocket('**/*', socket => { report.attempts.push({ kind: 'websocket', width }); socket.close(); });
  await context.exposeBinding('__hostedForbiddenAttempt', (_, kind) => { report.attempts.push({ kind, width }); });
  await context.addInitScript(() => {
    window.__hostedGuard = { microphone: 0, submissions: 0, websocket: 0, csp: [] };
    document.addEventListener('submit', event => { event.preventDefault(); window.__hostedGuard.submissions++; void window.__hostedForbiddenAttempt('form submit'); }, true);
    document.addEventListener('securitypolicyviolation', event => window.__hostedGuard.csp.push({ directive: event.violatedDirective, blocked: event.blockedURI === 'eval' ? 'eval' : '[resource omitted]' }));
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { window.__hostedGuard.microphone++; void window.__hostedForbiddenAttempt('microphone'); throw new DOMException('GET-only acceptance forbids microphone', 'NotAllowedError'); } });
    window.WebSocket = function () { window.__hostedGuard.websocket++; void window.__hostedForbiddenAttempt('websocket constructor'); throw new Error('GET-only acceptance forbids WebSocket'); };
  });
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', error => report.browserErrors.push({ width, message: error.message.replace(/https?:\/\/\S+/g, '[URL omitted]') }));
  return page;
}

async function shot(page, suffix) {
  const path = prefix + suffix; await page.screenshot({ path }); report.screenshots.push(path);
}
async function load(page, width) {
  const response = await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.locator('.site-demo-ready').waitFor(); await page.evaluate(() => document.fonts.ready);
  const permissions = response.headers()['permissions-policy'] || '';
  const csp = response.headers()['content-security-policy'] || '';
  const info = await page.evaluate(() => {
    const policy = document.permissionsPolicy || document.featurePolicy;
    const heading = document.querySelector('h1'), style = getComputedStyle(heading);
    return { path: location.pathname, title: document.title, heading: heading.innerText, bodyClass: document.body.className, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, sharp: style.opacity === '1' && style.filter === 'none', policy: { microphone: policy.allowsFeature('microphone'), camera: policy.allowsFeature('camera'), geolocation: policy.allowsFeature('geolocation') } };
  });
  report.pages.push({ ...info, status: response.status(), htmlSha256: hash(await response.body()), permissionsPolicy: permissions, contentSecurityPolicy: csp });
  check(`${width}px homepage is refreshed and successful`, response.status() === 200 && normalize(info.path) === '/' && info.bodyClass.includes('site-refresh') && /Your next job[\s\S]*an answer/.test(info.heading), info);
  check(`${width}px visible sharp hero and no horizontal overflow`, info.sharp && info.scrollWidth <= width + 1, info);
  check(`${width}px served policy permits self microphone only with no conflicting directive`, /microphone=\(self\)/.test(permissions) && (permissions.match(/microphone\s*=/g) || []).length === 1 && info.policy.microphone && !info.policy.camera && !info.policy.geolocation, { permissions, policy: info.policy });
  check(`${width}px homepage transport CSP is served`, /connect-src[^;]*vapi\.ai/.test(csp) && /connect-src[^;]*daily\.co/.test(csp) && /media-src[^;]*blob:/.test(csp), csp);
}

async function normalWatch(page, width) {
  for (const scenario of ['call', 'spanish']) {
    await page.locator(`[data-example="${scenario}"]`).click();
    check(`${width}px ${scenario} first click starts normal playback`, await page.locator('#example-play').innerText() === 'Pause');
    let completed = true;
    await page.waitForFunction(() => document.querySelector('#example-progress').textContent === '4 of 4 messages', null, { timeout: 9500 }).catch(() => { completed = false; });
    const result = await page.locator('#demo-wrap').evaluate(wrap => {
      const last = wrap.querySelector('#example-messages .site-message:last-child'), rect = last.getBoundingClientRect(), pane = wrap.querySelector('#example-messages').getBoundingClientRect();
      return { scenario: wrap.querySelector('[data-example][aria-pressed="true"]')?.dataset.example, progress: wrap.querySelector('#example-progress').textContent, messages: [...wrap.querySelectorAll('#example-messages .site-message p')].map(el => el.textContent), summary: wrap.querySelector('#example-summary').textContent, finalRect: { top: rect.top, bottom: rect.bottom, paneTop: pane.top, paneBottom: pane.bottom, navBottom: document.querySelector('#navbar').getBoundingClientRect().bottom, viewport: innerHeight } };
    });
    report.playback.push({ width, ...result });
    const rect = result.finalRect;
    check(`${width}px ${scenario} completes four ordered messages`, completed && result.scenario === scenario && result.messages.length === 4 && result.summary.length > 80, result);
    check(`${width}px ${scenario} final answer is actually readable`, rect.top >= Math.max(rect.navBottom, rect.paneTop) - 2 && rect.bottom <= Math.min(rect.viewport, rect.paneBottom) + 2, rect);
    if (scenario === 'call') {
      check(`${width}px English plumbing voice is discoverable without starting`, await page.locator('#example-voice-card').isVisible() && await page.locator('#example-voice-card strong').innerText() === 'English plumbing practice call' && await page.locator('#example-voice-stop').isHidden());
      if (width === 1440) await shot(page, '-1440-call.png');
    } else {
      check(`${width}px Spanish has typed practice without a voice promise`, await page.locator('#example-voice-card').isHidden() && await page.locator('#example-input').isVisible() && await page.locator('#example-challenges button').count() > 0 && result.summary.includes('Spanish'));
      if (width === 390) await shot(page, '-390-spanish.png');
    }
  }
}

async function briefFooter(page, width) {
  const links = await page.locator('#navMenu a').evaluateAll(elements => elements.map(el => { const url = new URL(el.href); return { label: el.textContent.trim(), path: url.pathname, hash: url.hash, origin: url.origin }; }));
  check(`${width}px core nav destinations remain correct`, links.every(row => sameSite(row.origin)) && links.some(row => row.hash === '#week') && links.some(row => row.hash === '#plans') && links.some(row => normalize(row.path) === '/about') && links.some(row => row.hash === '#pilot'), links);
  await page.locator('footer .footer-logo img').evaluate(image => image.decode());
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  const footer = await page.locator('footer').evaluate(el => {
    const logo = el.querySelector('.footer-logo img'), rect = logo.getBoundingClientRect();
    return { naturalWidth: logo.naturalWidth, naturalHeight: logo.naturalHeight, width: rect.width, height: rect.height, links: [...el.querySelectorAll('.footer-simple-links a')].filter(a => /^(Privacy|Terms)$/.test(a.textContent.trim())).map(a => { const r = a.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2), url = new URL(a.href); return { label: a.textContent.trim(), path: url.pathname, hit: hit === a || a.contains(hit), inView: r.top >= 0 && r.bottom <= innerHeight + 1 }; }) };
  });
  report.footer.push({ width, ...footer });
  check(`${width}px footer logo preserves natural ratio`, footer.naturalWidth === 250 && footer.naturalHeight === 82 && Math.abs(footer.height - footer.width * 82 / 250) < .15, footer);
  check(`${width}px footer privacy/terms links remain usable`, footer.links.length === 2 && footer.links.every(row => row.inView && row.hit) && footer.links.some(row => normalize(row.path) === '/privacy-policy') && footer.links.some(row => normalize(row.path) === '/terms-of-service'), footer.links);
}

async function mobileDialogAndMenu(page) {
  await page.locator('#example-summary-link').click();
  const dialog = await page.locator('#example-owner-dialog').evaluate(el => { const r = el.getBoundingClientRect(); return { open: el.open, text: el.querySelector('dl').textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
  check('390px owner preview opens in one action and fits viewport', dialog.open && dialog.text.includes('Spanish') && dialog.text.includes('Next') && dialog.left >= 0 && dialog.right <= dialog.width + 1 && dialog.top >= 0 && dialog.bottom <= dialog.height + 1, dialog);
  await shot(page, '-390-owner.png'); await page.keyboard.press('Escape');
  check('390px owner Escape restores focus', !await page.locator('#example-owner-dialog').evaluate(el => el.open) && await page.locator('#example-summary-link').evaluate(el => document.activeElement === el));
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  const menu = page.locator('#navMenu'), toggle = page.locator('#navToggle');
  check('390px drawer initially closed and inert', !await menu.isVisible() && await menu.evaluate(el => el.inert) && await toggle.getAttribute('aria-expanded') === 'false');
  await toggle.focus(); await page.keyboard.press('Enter');
  check('390px keyboard opens menu with close control focused', await menu.isVisible() && await page.locator('.nav-menu-close').evaluate(el => document.activeElement === el));
  const contrast = await menu.locator('a').evaluateAll(elements => {
    const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const light = c => c.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    return elements.map(el => { const a = light(rgb(getComputedStyle(el).color)), b = light([255, 255, 255]); return { label: el.textContent.trim(), ratioAgainstOpaqueWhitePanel: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }; });
  });
  check('390px menu text remains readable', contrast.every(row => row.ratioAgainstOpaqueWhitePanel >= 4.5), contrast);
  await shot(page, '-390-menu.png'); await page.keyboard.press('Escape');
  check('390px menu Escape closes and restores focus', !await menu.isVisible() && await toggle.evaluate(el => document.activeElement === el));
  await toggle.click(); await page.locator('.nav-menu-close').click();
  check('390px explicit menu close works', !await menu.isVisible());
}

try {
  const desktop = await fresh(1440); await load(desktop, 1440);
  check('1440px inline nav visible', await desktop.locator('#navMenu').isVisible() && !await desktop.locator('#navToggle').isVisible());
  await normalWatch(desktop, 1440); await briefFooter(desktop, 1440);
  // Sixth required asset: load only the inert bridge script; never invoke Start.
  await desktop.addScriptTag({ url: origin + '/practice-voice.js' });
  check('static lazy voice bridge loads without starting', await desktop.evaluate(() => typeof window.MCDemoVoice?.start === 'function' && window.__hostedGuard.microphone === 0));
  const mobile = await fresh(390); await load(mobile, 390); await normalWatch(mobile, 390);
  await mobileDialogAndMenu(mobile); await briefFooter(mobile, 390);
  for (const page of [desktop, mobile]) {
    const guard = await page.evaluate(() => window.__hostedGuard);
    report.cspViolations.push(...guard.csp);
    check(`${page.viewportSize().width}px no form/microphone/WebSocket attempts`, guard.microphone === 0 && guard.submissions === 0 && guard.websocket === 0, guard);
  }
  for (const name of assets) {
    const row = report.assets.find(asset => asset.name === name);
    check(`${name} served once and matches exact expected commit`, row?.status === 200 && row.matchesAccepted && row.networkGets === 1 && report.assets.filter(asset => asset.name === name).length === 1, row);
  }
  check('exactly two fresh contexts used', contexts.length === 2);
  check('no browser or CSP errors', report.browserErrors.length === 0 && report.cspViolations.length === 0, { browserErrors: report.browserErrors, csp: report.cspViolations });
  check('zero blocked or attempted API/submission/mic/WebSocket traffic', report.blockedRequests.length === 0 && report.attempts.length === 0, { blocked: report.blockedRequests, attempts: report.attempts });
  check('accepted local comparison files stayed unchanged', Object.entries(accepted).every(([file, expected]) => hash(readFileSync(file)) === expected));
  report.result = report.issues.length ? 'failed' : 'passed';
} catch (error) {
  report.result = 'failed'; report.error = String(error.message || error).replace(/https?:\/\/\S+/g, '[URL omitted]');
} finally {
  await Promise.all(contexts.map(context => context.close())); await browser.close();
  report.finishedAt = new Date().toISOString(); writeFileSync(prefix + '.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, issues: report.issues.length, error: report.error, evidence: prefix + '.json' }));
  if (report.result !== 'passed') process.exitCode = 1;
}
