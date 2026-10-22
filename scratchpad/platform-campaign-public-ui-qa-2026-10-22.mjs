// Independent local public-consent UI review. No HTTP transport is permitted.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const root = process.cwd(), base = 'https://public-ui.invalid';
const output = process.argv[2];
if (!/^scratchpad\/platform-campaign-public-ui-[a-z0-9-]+\.json$/.test(output || '') || existsSync(output)) throw new Error('Choose a new public UI receipt.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['index.html', 'sms-terms.html', 'privacy-policy.html', 'terms-of-service.html', 'styles.css', 'site-refresh.css', 'script.js', 'agent-widget.js', 'stories.js', 'signup-intake.js', 'netlify/functions/lib/platform-sms.mjs'];
const cached = new Map(sourceFiles.map(file => [file, readFileSync(file)]));
const report = { at: new Date().toISOString(), scope: 'Actual local public HTML/CSS/JS and locally read reply source. Every browser HTTP request is fulfilled from a local file or aborted. Google Fonts CSS is deliberately blocked, so screenshots use the defined local font fallback. No provider/API/email/model requests or SMS actions are performed. Screenshots prove local presentation only.', sourceBefore: Object.fromEntries([...cached].map(([file, bytes]) => [file, sha(bytes)])), checks: [], screenshots: [], blockedRequests: [], blockedFontRequests: [], pageErrors: [], physicalNetworkAttempts: 0, localRequests: [] };
const deny = () => { report.physicalNetworkAttempts++; throw new Error('Physical network disabled for this local review.'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--disable-domain-reliability', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const check = async (name, run) => { try { await run(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message }); } };
const shot = async (locator, label) => { const path = output.replace(/\.json$/, '') + '-' + label + '.png'; assert.equal(existsSync(path), false); await locator.screenshot({ path }); report.screenshots.push(path); };
const noOverflow = async page => { const result = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth })); assert.ok(result.html <= result.viewport + 1 && result.body <= result.viewport + 1, JSON.stringify(result)); };
const clearHeading = async (page, selector) => { const overlap = await page.evaluate(selector => { const heading = document.querySelector(selector).getBoundingClientRect(), nav = document.querySelector('#navbar').getBoundingClientRect(), pos = getComputedStyle(document.querySelector('#navbar')).position; return { headingTop: heading.top, headingBottom: heading.bottom, navBottom: nav.bottom, position: pos }; }, selector); assert.ok(!['fixed', 'sticky'].includes(overlap.position) || overlap.headingTop >= overlap.navBottom - 1, JSON.stringify(overlap)); };
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 1050 }, reducedMotion: 'reduce', serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === 'GET' && url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') { report.blockedFontRequests.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
      if (url.origin !== base || req.method() !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) { report.blockedRequests.push({ method: req.method(), origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
      let file = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      if (!extname(file)) file += '.html';
      const full = resolve(root, file);
      if (relative(root, full).startsWith('..') || !/\.(?:html|css|js|png|jpe?g|webp|svg|ico|woff2?)$/i.test(file) || !existsSync(full)) { report.blockedRequests.push({ method: req.method(), origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
      if (!cached.has(file)) cached.set(file, readFileSync(full));
      report.localRequests.push(file);
      return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' })[extname(file).toLowerCase()], body: cached.get(file) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', error => report.pageErrors.push({ width, message: error.message }));
    await page.goto(base + '/index.html');
    await check(width + ': homepage has directly discoverable, readable Customer Care link', async () => {
      const link = page.locator('footer').getByRole('link', { name: 'Customer Care texting', exact: true });
      assert.equal(await link.count(), 1); assert.equal(await link.getAttribute('href'), 'sms-terms.html#platform-sms');
      await link.scrollIntoViewIfNeeded(); assert.equal(await link.isVisible(), true); await noOverflow(page); await shot(page.locator('footer'), 'homepage-footer-' + width);
      await link.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base + '/sms-terms.html#platform-sms');
    });
    const card = page.locator('#platform-sms');
    await check(width + ': anchored CTA is visible below the navigation', async () => {
      await card.waitFor({ state: 'visible' });
      await clearHeading(page, '#platform-sms-title');
    });
    await check(width + ': complete branded request-only disclosures are rendered together', async () => {
      const text = await card.innerText();
      for (const expected of ['Machines And Cloud LLC (Machines & Cloud)', '(346) 485-3328', 'workspace setup or account access', 'We reply only to the question you send', 'without enrolling you in recurring texts', 'not a condition of purchase', 'Message frequency varies', 'Message and data rates may apply.', 'Reply STOP, ALTO or PARAR', 'HELP, INFO or AYUDA', 'no scheduled or recurring messages']) assert.ok(text.includes(expected), expected);
      assert.equal(await card.getByRole('link', { name: 'Terms and Conditions', exact: true }).getAttribute('href'), '#sms-terms-details');
      assert.equal(await card.getByRole('link', { name: 'Privacy Policy', exact: true }).getAttribute('href'), 'privacy-policy.html#sms');
      assert.ok(text.includes('This number does not send messages on behalf of home-service shops or their homeowners.'));
      for (const node of await card.locator('p,a,h2,h3').all()) assert.equal(await node.isVisible(), true);
      await noOverflow(page);
    });
    await check(width + ': SMS action contains the correct number and account-help question, without sending', async () => {
      const href = await card.locator('a[href^="sms:"]').getAttribute('href'); const url = new URL(href);
      assert.equal(url.pathname, '+13464853328'); assert.equal(url.searchParams.get('body'), 'I cannot sign in'); assert.equal(await card.locator('a[href^="sms:"]').count(), 1);
    });
    await check(width + ': illustrative sign-in reply matches actual source and is never presented as delivered', async () => {
      const example = page.locator('#platform-sms-example');
      const expected = 'Machines & Cloud: sign in securely at https://machinesandcloud.com/desk. Request a fresh email link there. Never text a password or sign-in code. Reply STOP to stop texts.';
      assert.equal(await example.locator('p').nth(0).innerText(), 'You send: I cannot sign in');
      assert.equal(await example.locator('p').nth(1).innerText(), 'Machines & Cloud replies: ' + expected);
      assert.ok(cached.get('netlify/functions/lib/platform-sms.mjs').toString().includes("return '" + expected + "'"));
      assert.match(await example.innerText(), /planned exchange, not an actual message or a subscription/);
      assert.match(await card.innerText(), /Awaiting carrier approval\. Text replies are not live yet\./);
      assert.match(await example.innerText(), /call support at \(346\) 248-8359/);
      await shot(card, 'sms-cta-' + width);
    });
    await check(width + ': CTA text and links stay within the viewport', async () => {
      const escaped = await card.evaluate(node => { const tree = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), result = []; while (tree.nextNode()) { const text = tree.currentNode; if (!text.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(text); for (const rect of range.getClientRects()) if (rect.left < -1 || rect.right > innerWidth + 1) result.push({ text: text.textContent.slice(0, 70), left: rect.left, right: rect.right, viewport: innerWidth }); } return result; });
      assert.deepEqual(escaped, []);
    });
    await check(width + ': CTA Terms link reaches the full conversation rules', async () => {
      await card.getByRole('link', { name: 'Terms and Conditions', exact: true }).click();
      const details = page.locator('#sms-terms-details'); assert.equal(await details.isVisible(), true); assert.match(await details.innerText(), /Calling us, emailing us, signing up, booking a visit or entering a mobile number in a form does not give SMS permission/); await clearHeading(page, '#sms-terms-details h2'); await noOverflow(page);
    });
    await check(width + ': linked privacy has matching brand, number and nonmarketing consent', async () => {
      await card.getByRole('link', { name: 'Privacy Policy', exact: true }).click(); await page.waitForURL(base + '/privacy-policy.html#sms');
      const sms = page.locator('#sms'); await clearHeading(page, '#sms h2'); const text = await sms.innerText();
      assert.match(text, /Machines And Cloud LLC \(Machines & Cloud\)/); assert.match(text, /\(346\) 485-3328/); assert.match(text, /Awaiting carrier approval\. Text replies are not live yet\./); assert.match(text, /does not opt anyone into texts/); assert.match(text, /SMS consent is not sold, rented or transferred/); assert.match(text, /Their homeowner messages and consent belong to their own program/); await noOverflow(page); await shot(sms, 'privacy-sms-' + width);
    });
    await check(width + ': general terms keep company support and shop programs distinct', async () => {
      await page.goto(base + '/terms-of-service.html'); const link = page.getByRole('link', { name: 'Customer Care text messaging terms', exact: true }); await link.scrollIntoViewIfNeeded(); assert.equal(await link.getAttribute('href'), 'sms-terms.html#platform-sms'); assert.match(await link.locator('..').innerText(), /Each service business using our software has its own texting program, number and customer terms/); await noOverflow(page);
    });
    await context.close();
  }
  await check('No physical HTTP, API or unexpected browser action occurred', async () => { assert.equal(report.physicalNetworkAttempts, 0); assert.deepEqual(report.blockedRequests, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close();
  report.sourceAfter = Object.fromEntries([...cached].map(([file]) => [file, sha(readFileSync(file))]));
  report.loadedHashes = Object.fromEntries([...cached].map(([file, bytes]) => [file, sha(bytes)]));
  report.sourceStable = Object.entries(report.loadedHashes).every(([file, hash]) => report.sourceAfter[file] === hash);
  report.passed = report.checks.filter(row => row.pass).length; report.failed = report.checks.filter(row => !row.pass).length;
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: report.passed, failed: report.failed, sourceStable: report.sourceStable, physicalNetworkAttempts: report.physicalNetworkAttempts, pageErrors: report.pageErrors, blockedRequests: report.blockedRequests, failures: report.checks.filter(row => !row.pass) }, null, 2));
  if (report.failed || !report.sourceStable) process.exitCode = 1;
}
