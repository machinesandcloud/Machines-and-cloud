// Bounded, unauthenticated hosted smoke check. Requires root's deployed ID before use.
// No form submissions, chat sends, API calls, authenticated profiles or server startup.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const deployId = option('--deploy-id');
assert.ok(deployId && /^[a-zA-Z0-9-]+$/.test(deployId), 'Run only after root READY, with --deploy-id <published Netlify deploy ID>');
const playwrightPath = option('--playwright');
assert.ok(playwrightPath, 'Pass the existing Playwright module with --playwright');
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)));
const origin = 'https://machinesandcloud.com';
const prefix = option('--output-prefix', 'scratchpad/walkthrough-hosted');
const hash = body => createHash('sha256').update(body).digest('hex');
const sourceFiles = ['index.html', 'about.html', 'thank-you.html', 'anaheim.html', 'styles.css', 'script.js', 'stories.js', 'agent-widget.js', 'site-refresh.css'];
const source = Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(file))]));
const assetNames = new Set(['styles.css', 'script.js', 'stories.js', 'agent-widget.js', 'site-refresh.css']);
const report = { startedAt: new Date().toISOString(), deployId, origin, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), source, sourceFingerprint: hash(JSON.stringify(source)), scope: 'one desktop homepage/About/thank-you sequence; one fresh mobile homepage resized320; Watch/Try controls without input/send; footer logo/link clearance; no submissions or API requests', checks: [], issues: [], pages: [], assets: [], blockedRequests: [], browserErrors: [], screenshots: [], footer: [], formSubmissions: 0 };
const check = (name, pass, detail) => { const item = { name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }; report.checks.push(item); if (!pass) report.issues.push(item); };
const assetCache = new Map();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [];
const normalize = path => path.replace(/\.html$/, '').replace(/\/$/, '') || '/';

async function fresh(viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
  contexts.push(context);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const sameSite = [origin, 'https://www.machinesandcloud.com'].includes(url.origin);
    const font = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
    if (request.method() !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/') || ['fetch', 'xhr', 'websocket'].includes(request.resourceType()) || (!sameSite && !font)) {
      report.blockedRequests.push({ method: request.method(), url: url.origin + url.pathname, resource: request.resourceType() });
      return route.abort();
    }
    const name = url.pathname.slice(1);
    if (sameSite && assetNames.has(name)) {
      if (!assetCache.has(name)) assetCache.set(name, (async () => {
        const response = await route.fetch({ maxRedirects: 0 });
        const body = await response.body(), status = response.status(), headers = { ...response.headers() };
        delete headers['content-encoding']; delete headers['content-length']; delete headers['transfer-encoding'];
        report.assets.push({ name, status, sha256: hash(body), matchesLocal: hash(body) === source[name], networkGets: 1 });
        return { status, headers, body };
      })());
      const cached = await assetCache.get(name);
      return route.fulfill({ ...cached, headers: { ...cached.headers, 'cache-control': 'no-store' } });
    }
    return route.continue();
  });
  if (context.routeWebSocket) await context.routeWebSocket('**/*', ws => { report.blockedRequests.push({ method: 'WEBSOCKET', url: ws.url() }); ws.close(); });
  await context.exposeBinding('__hostedSubmitAttempt', () => { report.formSubmissions++; });
  await context.addInitScript(() => {
    document.addEventListener('submit', event => { event.preventDefault(); void window.__hostedSubmitAttempt(); }, true);
  });
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', error => report.browserErrors.push(error.message));
  return page;
}
async function shot(page, name) {
  const path = `${prefix}-${name}.png`; await page.screenshot({ path }); report.screenshots.push(path);
}
async function load(page, path, heading) {
  const response = await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 20000 });
  const info = await page.evaluate(() => ({ url: location.href, title: document.title, heading: document.querySelector('h1')?.innerText, bodyClass: document.body.className, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, navVisible: !!document.querySelector('#navMenu')?.getClientRects().length }));
  info.requestedPath = path; info.status = response?.status(); info.htmlSha256 = response ? hash(await response.body()) : null;
  report.pages.push(info);
  check(`${path} hosted response successful`, response?.ok(), info.status);
  check(`${path} pretty URL resolves to same page`, normalize(new URL(info.url).pathname) === normalize(path), info.url);
  check(`${path} refreshed heading and markup present`, info.bodyClass.includes('site-refresh') && heading.test(info.heading || ''), info.heading);
  check(`${path} no horizontal overflow ${info.width}`, info.scrollWidth <= info.width + 1, info.scrollWidth);
  return info;
}
async function hero(page, width) {
  const info = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const note = document.querySelector('.site-job-note'), caption = document.querySelector('.site-hero-visual figcaption'), launcher = document.querySelector('#mcAgentLauncher');
    const launch = rect(launcher);
    const spans = [...note.querySelectorAll('p > span')].map(el => { const range = document.createRange(); range.selectNodeContents(el); return { text: el.textContent, lines: range.getClientRects().length }; });
    const text = [...note.querySelectorAll('strong,p > span,.site-note-detail')].flatMap(el => { const range = document.createRange(); range.selectNodeContents(el); return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })); });
    const heading = document.querySelector('h1'), style = getComputedStyle(heading);
    return { note: rect(note), caption: rect(caption), spans, covered: text.filter(r => r.top < innerHeight && r.bottom > 0 && r.left < launch.right && r.right > launch.left && r.top < launch.bottom && r.bottom > launch.top), heading: { opacity: style.opacity, color: style.color, filter: style.filter }, width: innerWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  check(`${width}px sharp visible hero`, info.heading.opacity === '1' && info.heading.filter === 'none', info.heading);
  check(`${width}px caption/card do not overlap`, info.caption.top >= info.note.bottom, info);
  check(`${width}px whole issue/window text`, info.spans.every(x => x.lines === 1), info.spans);
  check(`${width}px launcher avoids visible hero key text`, info.covered.length === 0, info.covered);
  check(`${width}px no horizontal overflow`, info.scrollWidth <= width + 1, info.scrollWidth);
}
async function widget(page) {
  const button = page.getByRole('button', { name: 'Ask the front desk', exact: true });
  await button.click();
  check('widget opens without sending', await page.locator('#mcAgentPanel').isVisible() && await button.getAttribute('aria-expanded') === 'true');
  await page.locator('#mcAgentClose').click();
  check('widget closes/restores focus', !await page.locator('#mcAgentPanel').isVisible() && await button.evaluate(el => document.activeElement === el));
}
async function footer(page, label) {
  const scroll = await page.evaluate(() => scrollY);
  await page.locator('.footer-simple .footer-logo img').evaluate(image => image.decode());
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const data = await page.locator('footer').evaluate(footer => {
    const logo = footer.querySelector('.footer-logo img'), rect = logo.getBoundingClientRect();
    const launcher = document.querySelector('#mcAgentLauncher'), box = launcher.getBoundingClientRect(), style = getComputedStyle(launcher), visible = style.visibility !== 'hidden' && style.display !== 'none';
    return { naturalWidth: logo.naturalWidth, naturalHeight: logo.naturalHeight, width: rect.width, height: rect.height, viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, links: [...footer.querySelectorAll('a')].map(link => { const a = link.getBoundingClientRect(), hit = document.elementFromPoint((a.left + a.right) / 2, (a.top + a.bottom) / 2); return { text: link.textContent.trim() || link.querySelector('img')?.alt, receivesHit: hit === link || link.contains(hit), inViewport: a.top >= 0 && a.bottom <= innerHeight + 1 && a.left >= 0 && a.right <= innerWidth + 1, covered: visible && a.left < box.right && a.right > box.left && a.top < box.bottom && a.bottom > box.top }; }) };
  });
  report.footer.push({ label, ...data });
  check(`${label} footer logo preserves intrinsic ratio`, data.naturalWidth === 250 && data.naturalHeight === 82 && Math.abs(data.width - 165) < .1 && Math.abs(data.height - data.width * 82 / 250) < .1, data);
  check(`${label} footer links clear the sales launcher`, data.links.every(link => link.inViewport && link.receivesHit && !link.covered) && data.scrollWidth <= data.viewport + 1, data.links);
  if (label === 'home1440' || label === 'home390') await shot(page, `${data.viewport}-footer`);
  await page.evaluate(y => scrollTo(0, y), scroll);
}
async function practiceModes(page, label) {
  check(`${label} reduced-motion Watch complete/static`, await page.locator('#example-messages .site-message').count() === 4 && !await page.locator('#example-play').isVisible() && await page.locator('#example-replay').isVisible());
  await page.locator('#example-mode-live').click();
  check(`${label} Try opens empty composer and waiting summary`, await page.locator('#example-input').isVisible() && await page.locator('#example-input').inputValue() === '' && /Waiting for your request/.test(await page.locator('#example-summary').innerText()) && !/713|Alex|Sam|Ana/.test(await page.locator('#example-summary').innerText()));
  check(`${label} practice limitation visible`, /Practice conversation only/.test(await page.locator('#example-context').innerText()) && /No appointments or messages are sent/.test(await page.locator('#example-context').innerText()));
  if (page.viewportSize().width <= 390) {
    await page.locator('#example-send').evaluate(el => el.scrollIntoView({ block: 'end' })); await page.waitForTimeout(100);
    const geometry = await page.evaluate(() => { const send = document.querySelector('#example-send'), launcher = document.querySelector('#mcAgentLauncher'), a = send.getBoundingClientRect(), b = launcher.getBoundingClientRect(), style = getComputedStyle(launcher), hit = document.elementFromPoint((a.left + a.right) / 2, (a.top + a.bottom) / 2); return { launcherHidden: style.visibility === 'hidden' || style.display === 'none', receivesHit: hit === send || send.contains(hit), send: { left: a.left, right: a.right, top: a.top, bottom: a.bottom }, launcher: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } }; });
    check(`${label} mobile composer Send unobstructed by sales launcher`, geometry.launcherHidden && geometry.receivesHit, geometry);
    await shot(page, `${page.viewportSize().width}-composer`);
    await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
    check(`${label} sales launcher returns outside composer`, await page.locator('#mcAgentLauncher').isVisible());
  }
  await page.locator('#example-reset').click();
  check(`${label} reset retains empty practice state without send`, await page.locator('#example-input').inputValue() === '' && /Waiting for your request/.test(await page.locator('#example-summary').innerText()) && await page.locator('#example-messages .site-message').count() === 1);
  await page.locator('#example-mode-watch').click();
  check(`${label} Watch returns complete static example`, await page.locator('#example-messages .site-message').count() === 4 && await page.locator('#example-mode-watch').getAttribute('aria-pressed') === 'true');
  await page.evaluate(() => scrollTo(0, 0));
}
async function journey(page) {
  let priorText = '', priorSummary = '';
  for (const channel of ['sms', 'call', 'spanish']) {
    const button = page.locator(`[data-example='${channel}']`); await button.focus(); await page.keyboard.press(channel === 'call' ? 'Space' : 'Enter');
    const text = await page.locator('#demo-wrap').innerText(), summary = await page.locator('#example-summary').innerText();
    check(`${channel} example changes conversation/owner summary`, await button.getAttribute('aria-pressed') === 'true' && text.length > 200 && summary.length > 80 && text !== priorText && summary !== priorSummary);
    priorText = text; priorSummary = summary;
  }
  const faq = page.locator('details.site-question').first(); await faq.locator('summary').focus(); await page.keyboard.press('Enter');
  check('FAQ opens by keyboard', await faq.evaluate(el => el.open)); await page.keyboard.press('Enter');
  check('FAQ closes by keyboard', !await faq.evaluate(el => el.open));
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('.site-hero a[href="#pilot"]').click();
  const immediate = await page.evaluate(() => scrollY); await page.waitForTimeout(100);
  const later = await page.evaluate(() => scrollY);
  const target = await page.locator('#pilot').evaluate(el => ({ top: el.getBoundingClientRect().top, navBottom: document.querySelector('#navbar').getBoundingClientRect().bottom, viewport: innerHeight }));
  check('CTA reaches pilot below header', target.top >= target.navBottom - 2 && target.top < target.viewport / 2, target);
  check('reduced-motion CTA stays at target', Math.abs(immediate - later) <= 2, { immediate, later });
  check('pilot website remains optional without submitting', !await page.locator('#website').evaluate(el => el.required));
}
async function mobileMenu(page) {
  const menu = page.locator('#navMenu'), toggle = page.locator('#navToggle');
  check('390px fresh drawer closed/inert', !await menu.isVisible() && await menu.evaluate(el => el.inert) && await menu.getAttribute('aria-hidden') === 'true' && await toggle.getAttribute('aria-expanded') === 'false');
  await toggle.focus(); await page.keyboard.press('Enter');
  check('390px keyboard opens menu/focuses close', await menu.isVisible() && await page.locator('.nav-menu-close').evaluate(el => document.activeElement === el));
  const contrast = await menu.locator('a,.nav-menu-close').evaluateAll(elements => {
    const parse = c => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = c => c.slice(0, 3).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    return elements.map(el => {
      let bg = [255, 255, 255], chain = [];
      for (let node = el; node; node = node.parentElement) chain.unshift(node);
      for (const node of chain) { const c = parse(getComputedStyle(node).backgroundColor), a = c[3] ?? 1; if (c.length >= 3) bg = c.slice(0, 3).map((n, i) => n * a + bg[i] * (1 - a)); }
      const fg = parse(getComputedStyle(el).color), a = lum(bg), b = lum(fg);
      return { text: el.textContent.trim(), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
  check('390px menu text contrast>=4.5', contrast.every(x => x.ratio >= 4.5), contrast);
  await shot(page, '390-menu');
  await page.keyboard.press('Escape');
  check('Escape closes/restores toggle focus', !await menu.isVisible() && await toggle.evaluate(el => document.activeElement === el));
  await toggle.click(); await page.locator('.nav-menu-close').click();
  check('explicit menu close restores focus', !await menu.isVisible() && await toggle.evaluate(el => document.activeElement === el));
  await toggle.click(); await toggle.click();
  check('toggle closes open menu', !await menu.isVisible());
  await page.setViewportSize({ width: 320, height: 844 });
  check('320px resize leaves drawer closed', !await menu.isVisible() && await toggle.getAttribute('aria-expanded') === 'false');
  await page.evaluate(() => scrollTo(0, 0)); await hero(page, 320); await shot(page, '320');
}

try {
  const desktop = await fresh({ width: 1440, height: 1000 });
  await load(desktop, '/', /Your next job[\s\S]*an answer/); await hero(desktop, 1440); await shot(desktop, '1440');
  check('1440px desktop nav visible/toggle absent', await desktop.locator('#navMenu').isVisible() && !await desktop.locator('#navToggle').isVisible());
  await widget(desktop); await journey(desktop);
  await practiceModes(desktop, 'home1440'); await footer(desktop, 'home1440');
  await load(desktop, '/about.html', /Good service starts/);
  check('About desktop nav visible', await desktop.locator('#navMenu').isVisible());
  await footer(desktop, 'about1440');
  await load(desktop, '/thank-you.html', /Thanks[\s\S]*be in touch/);
  check('thank-you desktop nav visible', await desktop.locator('#navMenu').isVisible());
  await footer(desktop, 'thanks1440');
  const mobile = await fresh({ width: 390, height: 844 });
  await load(mobile, '/', /Your next job[\s\S]*an answer/); await hero(mobile, 390); await shot(mobile, '390');
  await widget(mobile); await practiceModes(mobile, 'home390'); await footer(mobile, 'home390'); await mobileMenu(mobile);
  await practiceModes(mobile, 'home320'); await footer(mobile, 'home320');
  for (const name of assetNames) {
    const asset = report.assets.find(x => x.name === name);
    check(`hosted ${name} exactly matches verified source`, asset?.status === 200 && asset?.matchesLocal && asset?.networkGets === 1, asset);
  }
  check('no JavaScript errors', report.browserErrors.length === 0, report.browserErrors);
  check('no blocked API/nonGET/external attempts', report.blockedRequests.length === 0, report.blockedRequests);
  check('no form submissions', report.formSubmissions === 0);
  const after = Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(file))]));
  check('local comparison sources stayed stable', JSON.stringify(source) === JSON.stringify(after));
  report.result = report.issues.length ? 'failed' : 'passed';
} catch (error) { report.result = 'failed'; report.error = String(error.message || error); }
finally {
  await Promise.all(contexts.map(context => context.close())); await browser.close();
  report.finishedAt = new Date().toISOString(); writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, issues: report.issues.length, error: report.error, report: `${prefix}.json` }));
  if (report.result !== 'passed') process.exitCode = 1;
}
