// Independent local public-consent UI review. No HTTP transport is permitted.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
const root = '/tmp/mc-campaign-redacted-e997', capture = '/tmp/mc-campaign-release/capture', base = 'https://public-ui.invalid';
const manifest = JSON.parse(readFileSync('/tmp/mc-campaign-release/capture-manifest.json'));
const assetPath = file => existsSync(resolve(capture, file)) ? resolve(capture, file) : resolve(root, file);
const fixtureFiles = new Set();
const output = process.argv[2];
if (!/^scratchpad\/campaign-correction-hosted-offline-review\.json$/.test(output || '') || existsSync(output)) throw new Error('Choose a new public UI receipt.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['index.html', 'sms-terms.html', 'privacy-policy.html', 'terms-of-service.html', 'styles.css', 'site-refresh.css', 'script.js', 'agent-widget.js', 'stories.js', 'signup-intake.js', 'netlify/functions/lib/platform-sms.mjs'];
const cached = new Map(sourceFiles.map(file => { if (!existsSync(resolve(capture,file))) fixtureFiles.add(file); return [file,readFileSync(assetPath(file))]; }));
const report = { at: new Date().toISOString(), scope: 'Offline independent review of root-captured deployed assets for commit05e8c5c34656f3257af8a8d3d7e8523dcbd542b3. Captured HTML/CSS/script.js establish served bytes; uncaptured supplementary JS/images and backend reply text are explicitly local approved-source fixtures, not served proof. Browser HTTP is fulfilled from capture/local fixture files or aborted. Google Fonts CSS is deliberately blocked; screenshots use local font fallback. No external/account/provider/email/model/SMS action.', sourceBefore: Object.fromEntries([...cached].map(([file, bytes]) => [file, sha(bytes)])), checks: [], screenshots: [], blockedRequests: [], blockedFontRequests: [], pageErrors: [], physicalNetworkAttempts: 0, localRequests: [] };
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
  const canonicalParser = String.raw`
import sys,json
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,urlunsplit
class Canonical(HTMLParser):
 def __init__(self, expected):super().__init__(convert_charrefs=True);self.expected=expected;self.tokens=[];self.transforms=[]
 def handle_starttag(self,tag,pairs):
  attrs=dict(pairs)
  if self.expected and tag=='a' and 'href' in attrs:
   value=attrs['href'];parts=urlsplit(value)
   if not parts.scheme and not parts.netloc and parts.path.endswith('.html'):
    path=parts.path[:-5];path='/' if path in ('index','/index') else '/'+path.lstrip('/')
    attrs['href']=urlunsplit(('', '', path, parts.query, parts.fragment));self.transforms.append({'type':'pretty_link','from':value,'to':attrs['href']})
  if self.expected and tag=='form' and attrs.get('name')=='agent-lead' and 'netlify' in attrs:
   attrs.pop('netlify');attrs.pop('netlify-honeypot',None);attrs['method']='post';self.transforms.append({'type':'registered_form','name':'agent-lead','allowed':'remove netlify/netlify-honeypot; method=post'})
  self.tokens.append(['start',tag,sorted((key,'' if value is None else value) for key,value in attrs.items())])
 def handle_endtag(self,tag):self.tokens.append(['end',tag])
 def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs);self.handle_endtag(tag)
 def handle_data(self,text):self.tokens.append(['text',text])
 def handle_comment(self,text):self.tokens.append(['comment',text])
 def handle_decl(self,text):self.tokens.append(['decl',text])
source=Canonical(True);source.feed(Path(sys.argv[1]).read_text());captured=Canonical(False);captured.feed(Path(sys.argv[2]).read_text());differences=[]
for index,(expected,actual) in enumerate(zip(source.tokens,captured.tokens)):
 if expected!=actual:differences.append({'index':index,'expected':expected,'actual':actual})
print(json.dumps({'equivalent':source.tokens==captured.tokens,'expectedTokens':len(source.tokens),'capturedTokens':len(captured.tokens),'allowedTransforms':source.transforms,'differences':differences[:5]}))
`;
  report.assetComparisons = [];
  for (const asset of manifest.assets) {
    await check('Captured bytes and approved source: ' + asset.file, async () => {
      const bytes = readFileSync(resolve(capture,asset.file)), approved = readFileSync(resolve(root,asset.file));
      assert.equal(asset.status,200); assert.equal(bytes.length,asset.bytes); assert.equal(sha(bytes),asset.sha256); assert.equal(sha(approved),asset.sourceSHA256);
      if (!asset.html) { assert.deepEqual(bytes,approved); report.assetComparisons.push({file:asset.file,capturedSHA256:sha(bytes),approvedSHA256:sha(approved),exact:true}); }
      else { const result = JSON.parse(execFileSync('python3',['-c',canonicalParser,resolve(root,asset.file),resolve(capture,asset.file)],{encoding:'utf8'})); report.assetComparisons.push({file:asset.file,capturedSHA256:sha(bytes),approvedSHA256:sha(approved),...result}); assert.equal(result.equivalent,true,JSON.stringify(result)); }
    });
  }
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
      if (!cached.has(file)) { if (!existsSync(resolve(capture,file))) fixtureFiles.add(file); cached.set(file, readFileSync(assetPath(file))); }
      report.localRequests.push(file);
      return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' })[extname(file).toLowerCase()], body: cached.get(file) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(6000); page.on('pageerror', error => report.pageErrors.push({ width, message: error.message }));
    await page.goto(base + '/index.html');
    await check(width + ': homepage has directly discoverable, readable Customer Care link', async () => {
      const link = page.locator('footer').getByRole('link', { name: 'Customer Care texting', exact: true });
      assert.equal(await link.count(), 1); assert.equal(await link.getAttribute('href'), '/sms-terms#platform-sms');
      await link.scrollIntoViewIfNeeded(); assert.equal(await link.isVisible(), true); await noOverflow(page); await shot(page.locator('footer'), 'homepage-footer-' + width);
      await link.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base + '/sms-terms#platform-sms');
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
      assert.equal(await card.getByRole('link', { name: 'Privacy Policy', exact: true }).getAttribute('href'), '/privacy-policy#sms');
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
      await card.getByRole('link', { name: 'Privacy Policy', exact: true }).click(); await page.waitForURL(base + '/privacy-policy#sms');
      const sms = page.locator('#sms'); await clearHeading(page, '#sms h2'); const text = await sms.innerText();
      assert.match(text, /Machines And Cloud LLC \(Machines & Cloud\)/); assert.match(text, /\(346\) 485-3328/); assert.match(text, /Awaiting carrier approval\. Text replies are not live yet\./); assert.match(text, /does not opt anyone into texts/); assert.match(text, /SMS consent is not sold, rented or transferred/); assert.match(text, /Their homeowner messages and consent belong to their own program/); await noOverflow(page); await shot(sms, 'privacy-sms-' + width);
    });
    await check(width + ': general terms keep company support and shop programs distinct', async () => {
      await page.goto(base + '/terms-of-service.html'); const link = page.getByRole('link', { name: 'Customer Care text messaging terms', exact: true }); await link.scrollIntoViewIfNeeded(); assert.equal(await link.getAttribute('href'), '/sms-terms#platform-sms'); assert.match(await link.locator('..').innerText(), /Each service business using our software has its own texting program, number and customer terms/); await noOverflow(page);
    });
    await context.close();
  }
  await check('No physical HTTP, API or unexpected browser action occurred', async () => { assert.equal(report.physicalNetworkAttempts, 0); assert.deepEqual(report.blockedRequests, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close();
  report.sourceAfter = Object.fromEntries([...cached].map(([file]) => [file, sha(readFileSync(assetPath(file)))]));
  report.loadedHashes = Object.fromEntries([...cached].map(([file, bytes]) => [file, sha(bytes)]));
  report.sourceStable = Object.entries(report.loadedHashes).every(([file, hash]) => report.sourceAfter[file] === hash);
  report.localFixtures = [...fixtureFiles].map(file => ({file, source:resolve(root,file), sha256:sha(cached.get(file))}));
  report.captureManifest = {target:manifest.target,at:manifest.at,used:manifest.used};
  report.passed = report.checks.filter(row => row.pass).length; report.failed = report.checks.filter(row => !row.pass).length;
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: report.passed, failed: report.failed, sourceStable: report.sourceStable, physicalNetworkAttempts: report.physicalNetworkAttempts, pageErrors: report.pageErrors, blockedRequests: report.blockedRequests, failures: report.checks.filter(row => !row.pass) }, null, 2));
  if (report.failed || !report.sourceStable) process.exitCode = 1;
}
