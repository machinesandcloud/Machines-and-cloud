// Public page entry and keyboard checks. All browser routes are fulfilled locally or aborted.
// No server, account, environment file, model, form submission or external page is used.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('../', import.meta.url).pathname);
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const output = resolve(root, option('--output', 'scratchpad/public-journey-accessibility.json'));
const playwrightPath = option('--playwright', '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath));
const hash = value => createHash('sha256').update(value).digest('hex');
const htmlFiles = readdirSync(root).filter(name => name.endsWith('.html')).sort();
const tracked = [...htmlFiles, 'styles.css', 'site-refresh.css', 'script.js', 'agent-widget.js'];
const hashes = () => Object.fromEntries(tracked.map(name => [name, hash(readFileSync(resolve(root, name)))]));
const report = { at: new Date().toISOString(), sourceBefore: hashes(), checks: [], blocked: [], pageErrors: [], screenshots: [], completedJourneys: [], actualExternalRequests: 0, accountProviderModelRequests: 0 };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
mkdirSync(resolve(output, '..'), { recursive: true });

for (const name of htmlFiles) {
  const html = readFileSync(resolve(root, name), 'utf8');
  if (['onboard.html', 'desk.html', 'admin.html'].includes(name) || !html.includes('id="navbar"')) continue;
  const mains = [...html.matchAll(/<main\b([^>]*)>/g)];
  check(`${name}: one focusable main destination and a native skip link`, mains.length === 1 && /\bid="main"/.test(mains[0][1]) && /\btabindex="-1"/.test(mains[0][1]) && /<a\b[^>]*class="site-skip"[^>]*href="#main"[^>]*>Skip to content<\/a>/.test(html));
  check(`${name}: repeated site navigation and footer stay outside main`, html.indexOf('id="navbar"') < html.indexOf('<main') && html.indexOf('</main>') < html.indexOf('<footer'));
}

const base = 'http://127.0.0.1:8899';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const cases = [
  ['houston.html', 320, true], ['houston.html', 390, false],
  ['industry-home-services.html', 390, true], ['industry-home-services.html', 1440, false],
  ['privacy-policy.html', 320, true], ['privacy-policy.html', 1440, false],
  ['index.html', 390, true], ['about.html', 1440, true],
  ['insights.html', 1440, true], ['thank-you.html', 320, true], ['404.html', 390, false]
];
try {
  for (const [name, width, javaScriptEnabled] of cases) {
    const label = `${name}/${width}/${javaScriptEnabled ? 'JS' : 'no-JS'}`;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', javaScriptEnabled, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base || request.method() !== 'GET' || url.pathname.startsWith('/api/')) {
        report.blocked.push({ case: label, method: request.method(), url: url.origin + url.pathname });
        return route.abort('blockedbyclient');
      }
      let file = resolve(root, decodeURIComponent(url.pathname).slice(1) || 'index.html');
      if (!file.startsWith(root + '/') || relative(root, file).split('/').some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'not found' });
      if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
      if (!existsSync(file) || statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
      const contentType = ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType, body: readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push({ case: label, message: error.message }));
    await page.goto(base + '/' + name, { waitUntil: 'domcontentloaded' });
    const initial = await page.evaluate(() => {
      const hero = document.querySelector('.page-hero'), actions = hero?.querySelector('.hero-actions');
      return { readingHero: !!hero, alignment: hero ? getComputedStyle(hero.querySelector('.page-hero-content')).textAlign : null,
        actionBottom: actions?.getBoundingClientRect().bottom ?? null, actionOpacity: actions ? getComputedStyle(actions).opacity : null };
    });
    if (initial.readingHero) check(`${label}: reading hierarchy is left aligned`, initial.alignment === 'left', initial);
    if (initial.actionBottom !== null) check(`${label}: primary actions are visible in the first viewport`, initial.actionBottom <= 900 && initial.actionOpacity === '1', initial);
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => ({ text: document.activeElement.textContent.trim(), href: document.activeElement.getAttribute('href'), box: document.activeElement.getBoundingClientRect().toJSON() }));
    check(`${label}: first keyboard action exposes visible skip control`, first.href === '#main' && first.text === 'Skip to content' && first.box.y >= 0 && first.box.bottom <= 900, first);
    await page.keyboard.press('Enter');
    check(`${label}: native skip transfers keyboard focus to main`, await page.evaluate(() => document.activeElement === document.querySelector('main#main')));
    await page.keyboard.press('Tab');
    check(`${label}: next keyboard action stays in page content`, await page.evaluate(() => document.querySelector('main').contains(document.activeElement)));
    check(`${label}: single main excludes both navigation blocks`, await page.evaluate(() => document.querySelectorAll('main').length === 1 && !document.querySelector('main #navbar') && !document.querySelector('main footer')));
    check(`${label}: viewport has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (name === 'houston.html' || name === 'industry-home-services.html') {
      const path = output.replace(/\.json$/, '') + '-' + name.replace('.html', '') + '-' + width + '.png';
      await page.screenshot({ path }); report.screenshots.push(path);
    }
    if (javaScriptEnabled && width < 1024) {
      await page.locator('#navToggle').click();
      check(`${label}: modal navigation disables the main content`, await page.locator('main').evaluate(element => element.inert));
      await page.keyboard.press('Escape');
      check(`${label}: closing navigation restores the main content`, !await page.locator('main').evaluate(element => element.inert));
    }
    report.completedJourneys.push(label);
    await context.close();
  }
} finally {
  await browser.close();
  report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  check('Source stays unchanged during the observed journeys', report.sourceStable);
  check('Public pages produce no browser exceptions', report.pageErrors.length === 0, report.pageErrors);
  check('No account, provider, model or form request is attempted', !report.blocked.some(row => row.method !== 'GET' || new URL(row.url).pathname.startsWith('/api/')), report.blocked.filter(row => row.method !== 'GET' || new URL(row.url).pathname.startsWith('/api/')));
  report.summary = { passed: report.checks.filter(row => row.pass).length, total: report.checks.length, failed: report.checks.filter(row => !row.pass).length, publicPages: htmlFiles.length, browserJourneys: report.completedJourneys.length, plannedBrowserJourneys: cases.length };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ output, ...report.summary, sourceStable: report.sourceStable }));
assert.equal(report.summary.failed, 0, JSON.stringify(report.checks.filter(row => !row.pass)));
