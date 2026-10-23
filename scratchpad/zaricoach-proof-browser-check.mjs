import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const source = '/tmp/mc-production-readiness-47e/embed.js';
const embed = await readFile(source, 'utf8');
const platform = 'https://machinesandcloud.com';
const path = '/mc-front-desk-acceptance-20261023';
const query = '?client=mc-acceptance-zari-a123&phase=hosted-onboarding-zaricoach-20261023-v1';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const result = { at: new Date().toISOString(), sourceSha256: createHash('sha256').update(embed).digest('hex'), localOnly: true, physicalExternalRequests: 0, cases: [], mockRequests: [], errors: [] };
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(String(error)));
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === 'http://127.0.0.1:3481') return route.continue();
      result.mockRequests.push({ method: request.method(), url: url.origin + url.pathname });
      if (url.origin !== platform) { result.errors.push('unexpected external request: ' + url.origin); return route.abort(); }
      const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:3481', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (url.pathname === '/embed.js') return route.fulfill({ contentType: 'application/javascript', body: embed });
      if (url.pathname === '/api/client') return route.fulfill({ headers: cors, json: { name: 'MC Acceptance Zari', webAvailable: true, greeting: 'How can we help with your plumbing?' } });
      if (url.pathname === '/api/chat') {
        const data = request.postDataJSON();
        assert.equal(data.client, 'mc-acceptance-zari-a123');
        assert.equal(data.page, path);
        assert.equal(data.websiteCheck, undefined); // ordinary context must not reuse setup state
        return route.fulfill({ headers: cors, contentType: 'application/x-ndjson', body: JSON.stringify({ t: 'delta', text: 'We serve Katy. ' }) + '\n' + JSON.stringify({ t: 'done', reply: 'We serve Katy. What plumbing issue can we help with?', events: [] }) + '\n' });
      }
      result.errors.push('unexpected endpoint: ' + url.pathname);
      return route.abort();
    });
    const response = await page.goto('http://127.0.0.1:3481' + path + query);
    assert.equal(response.status(), 200);
    const allHeaders = await response.headersArray();
    assert.equal(allHeaders.filter(h => h.name.toLowerCase() === 'content-security-policy').length, 1);
    const csp = await response.headerValue('content-security-policy');
    assert.match(csp, /script-src https:\/\/machinesandcloud\.com;/);
    await page.locator('#mcDesk .l').click();
    await page.locator('#mcDesk textarea').fill('Do you serve Katy?');
    await page.locator('#mcDesk button.s').click();
    await page.getByText('We serve Katy. What plumbing issue can we help with?', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('script').count(), 1);
    assert.equal(await page.locator('iframe').count(), 0);
    await page.screenshot({ path: `/tmp/mc-production-readiness-47e/scratchpad/zaricoach-proof-${width}.png`, fullPage: true });
    result.cases.push({ width, ordinaryEmbedLoads: true, ndjsonRendered: true, singleEffectiveCSP: true, noLayoutTrackers: true, noHorizontalOverflow: true });
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.route('https://**/*', route => { result.errors.push('external request from invalid page'); return route.abort(); });
  for (const suffix of ['', query.replace('a123', 'b456'), query + '&unexpected=1']) {
    const response = await page.goto('http://127.0.0.1:3481' + path + suffix);
    assert.equal(response.status(), 400);
    assert.equal(await page.locator('script').count(), 0);
  }
  await context.close();
  result.cases.push({ invalidAddresses: 3, noEmbedOrExternalRequest: true });
  const manifest = JSON.parse(await readFile('/tmp/zaricoach-mc-proof-421/.next/dev/routes-manifest.json', 'utf8'));
  const normal = manifest.headers.find(rule => rule.source === '/((?!api/).*)');
  assert.ok(normal);
  assert.ok(!normal.headers.find(h => h.key === 'Content-Security-Policy').value.includes(platform));
  const exact = manifest.headers.find(rule => rule.source === path);
  assert.ok(exact);
  result.cases.push({ ordinaryPolicyUnchanged: true, exactPathPolicyOnly: true });
  assert.deepEqual(result.errors, []);
  result.pass = true;
} catch (error) {
  result.pass = false;
  result.failure = String(error.stack || error);
  throw error;
} finally {
  await browser.close();
  await writeFile('/tmp/mc-production-readiness-47e/scratchpad/zaricoach-proof-browser-check.json', JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ pass: result.pass, groups: result.cases.length, physicalExternalRequests: result.physicalExternalRequests }));
