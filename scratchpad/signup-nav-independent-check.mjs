import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2] || '/tmp/mc-campaign-redacted-e997');
const output = resolve(process.argv[3] || 'scratchpad/signup-nav-published-reproduction.json');
const base = 'https://signup-nav.local.test';
const sources = ['script.js', 'styles.css', 'site-refresh.css', 'index.html', 'about.html', 'signup-intake.js'];
const fingerprints = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
const report = { at: new Date().toISOString(), root, sourceBefore: fingerprints(), physicalExternalRequests: 0, apiRequests: [], blocked: [], errors: [], cases: [] };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });

async function fixture(label, { width = 390, touch = false, reducedMotion = 'reduce', pagePath = '/' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch, reducedMotion });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { report.blocked.push({ label, url: url.origin + url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) { report.apiRequests.push({ label, method: request.method(), path: url.pathname }); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline_nav_check"}' }); }
    let file = resolve(root, decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
    if (!file.startsWith(root + '/') || file.split('/').some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
    if (!existsSync(file) || statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' })[extname(file)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
  });
  await context.addInitScript(() => {
    window.__navCalls = [];
    const original = window.scrollTo;
    window.scrollTo = function(...args) { window.__navCalls.push({ args, bodyFixed: getComputedStyle(document.body).position === 'fixed', scrollY, active: document.activeElement?.id, at: performance.now() }); return original.apply(this, args); };
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ label, message: error.message }));
  await page.goto(base + pagePath, { waitUntil: 'networkidle' });
  return { context, page };
}

const measure = (page, id = 'pilot') => page.evaluate(id => {
  const target = document.getElementById(id), form = document.querySelector('#signup-intake'), name = document.querySelector('#intake-name');
  const rect = target?.getBoundingClientRect(), inputRect = name?.getBoundingClientRect();
  return { url: location.href, scrollY, bodyFixed: getComputedStyle(document.body).position === 'fixed', navOpen: document.body.classList.contains('nav-open'), menuHidden: document.querySelector('#navMenu')?.hidden, menuInert: document.querySelector('#navMenu')?.inert, expanded: document.querySelector('#navToggle')?.getAttribute('aria-expanded'), activeTag: document.activeElement?.tagName, activeId: document.activeElement?.id, activeText: document.activeElement?.textContent?.trim().slice(0, 100), destinationOwnsFocus: !!target?.contains(document.activeElement), targetTop: rect?.top, targetBottom: rect?.bottom, formTop: form?.getBoundingClientRect().top, firstFieldTop: inputRect?.top, firstFieldBottom: inputRect?.bottom, viewport: innerHeight, inertAncestors: [...document.querySelectorAll('[inert]')].filter(el => target && el.contains(target)).map(el => el.id || el.tagName), scrollCalls: window.__navCalls };
}, id);

try {
  for (const spec of [
    { label: 'mobile-mouse', width: 390, mode: 'mouse' },
    { label: 'mobile-touch', width: 390, mode: 'touch', touch: true },
    { label: 'mobile-keyboard', width: 390, mode: 'keyboard' },
    { label: 'small-mobile-touch', width: 320, mode: 'touch', touch: true },
    { label: 'tablet-touch', width: 768, mode: 'touch', touch: true },
    { label: 'tablet-mouse-scrolled', width: 1024, mode: 'mouse', fromScroll: 450 },
    { label: 'mobile-smooth', width: 390, mode: 'mouse', reducedMotion: 'no-preference' }
  ]) {
    const { context, page } = await fixture(spec.label, spec);
    if (spec.fromScroll) await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), spec.fromScroll);
    const before = await measure(page);
    if (spec.mode === 'touch') await page.locator('#navToggle').tap(); else await page.locator('#navToggle').click();
    const open = await measure(page), cta = page.locator('#navMenu .navbar-cta a');
    if (spec.mode === 'keyboard') { await cta.focus(); await page.keyboard.press('Enter'); }
    else if (spec.mode === 'touch') await cta.tap();
    else await cta.click();
    await page.waitForTimeout(1100);
    const after = await measure(page);
    const outcome = { closed: !after.navOpen && after.menuHidden && after.menuInert && after.expanded === 'false' && !after.bodyFixed, targetVisible: after.targetTop >= -1 && after.targetTop < after.viewport, formVisible: after.formTop < after.viewport && after.targetBottom > 0, destinationFocus: after.destinationOwnsFocus };
    report.cases.push({ label: spec.label, before, open, after, outcome });
    if (spec.label === 'mobile-mouse') await page.screenshot({ path: output.replace(/\.json$/, '-mobile-after.png'), fullPage: false });
    await context.close();
  }
  for (const id of ['week', 'plans']) {
    const label = 'mobile-menu-' + id, { context, page } = await fixture(label);
    await page.locator('#navToggle').click();
    const link = page.locator(`#navMenu a[href="index.html#${id}"]`);
    const href = await link.getAttribute('href');
    await link.click(); await page.waitForTimeout(1100);
    const after = await measure(page, id);
    report.cases.push({ label, actualHref: href, after, nativeDestination: true, outcome: { closed: !after.navOpen && after.menuHidden && !after.bodyFixed, targetVisible: after.targetTop >= -1 && after.targetTop < after.viewport }, focusObservation: after.destinationOwnsFocus });
    await context.close();
  }
  for (const control of ['Escape', 'toggle', 'backdrop']) {
    const label = 'close-retains-scroll-' + control, { context, page } = await fixture(label);
    await page.evaluate(() => scrollTo({ top: 450, behavior: 'instant' }));
    await page.locator('#navToggle').click();
    if (control === 'Escape') await page.keyboard.press('Escape');
    else if (control === 'toggle') await page.locator('#navToggle').click();
    else await page.locator('.nav-backdrop').click({ position: { x: 2, y: 700 } });
    const after = await measure(page);
    report.cases.push({ label, after, outcome: { closed: !after.navOpen && after.menuHidden && !after.bodyFixed, restoredScroll: after.scrollY === 450, restoredFocus: after.activeId === 'navToggle' } });
    await context.close();
  }
  for (const spec of [
    { label: 'mobile-hero', width: 390, selector: '.site-actions a[href="#pilot"]' },
    { label: 'desktop-header', width: 1440, selector: '#navMenu .navbar-cta a' },
    { label: 'mobile-plan', width: 390, selector: 'a[aria-label="Choose Coverage"]' },
    { label: 'mobile-about-menu', width: 390, pagePath: '/about.html', selector: '#navMenu .navbar-cta a', menu: true }
  ]) {
    const { context, page } = await fixture(spec.label, spec);
    if (spec.menu) await page.locator('#navToggle').click();
    const before = await measure(page);
    await page.locator(spec.selector).click(); await page.waitForTimeout(1100);
    const after = await measure(page);
    const nativeDestination = ['mobile-plan', 'mobile-about-menu'].includes(spec.label);
    report.cases.push({ label: spec.label, before, after, nativeDestination, outcome: { closed: !after.navOpen && !after.bodyFixed, targetVisible: after.targetTop >= -1 && after.targetTop < after.viewport, formVisible: after.formTop < after.viewport && after.targetBottom > 0, ...(!nativeDestination ? { destinationFocus: after.destinationOwnsFocus } : {}) }, focusObservation: after.destinationOwnsFocus });
    await context.close();
  }
} finally {
  report.sourceAfter = fingerprints(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.passed = report.cases.filter(c => Object.values(c.outcome).every(Boolean)).length;
  report.failed = report.cases.length - report.passed;
  report.summary = report.cases.map(({ label, outcome, after }) => ({ label, ...outcome, scrollY: after.scrollY, targetTop: after.targetTop, formTop: after.formTop, activeId: after.activeId, activeTag: after.activeTag }));
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await browser.close();
}
console.log(JSON.stringify({ output, sourceStable: report.sourceStable, passed: report.passed, failed: report.failed, physicalExternalRequests: 0, apiRequests: report.apiRequests.length, errors: report.errors, summary: report.summary }, null, 2));
if (report.failed || !report.sourceStable || report.errors.length || report.apiRequests.length) process.exitCode = 1;
