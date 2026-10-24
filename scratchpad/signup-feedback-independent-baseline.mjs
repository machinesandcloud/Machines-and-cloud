// Independent reproduction of the reported defect on immutable accepted base assets.
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const output = 'scratchpad/signup-feedback-independent-baseline.json';
if (existsSync(output)) throw Error('Preserve the prior reproduction.');
const revision = '1e73e43db041bacf55246b2d65ce33812be46c9c', base = 'http://127.0.0.1:8977';
const cache = new Map();
function asset(path) { if (!cache.has(path)) { try { cache.set(path, execFileSync('git', ['show', revision + ':' + path])); } catch { cache.set(path, null); } } return cache.get(path); }
const report = { at: new Date().toISOString(), sourceCommit: revision, boundary: 'Immutable committed browser assets; locally fulfilled API fixtures only; no real email or provider traffic.', observations: [], outsideRequests: [], pageErrors: [], nodeHTTPAttempts: 0 };
const deny = () => { report.nodeHTTPAttempts++; throw Error('QA network prohibited'); };
globalThis.fetch = deny; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 950 }, serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => socket.close());
    let requests = 0;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) { report.outsideRequests.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
      if (url.pathname === '/api/access') { requests++; return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, delivery: 'email', message: 'Check your inbox for a link to continue. It expires in 20 minutes.' }) }); }
      const bytes = asset(url.pathname.slice(1));
      return route.fulfill({ status: bytes ? 200 : 404, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(url.pathname)] || 'application/octet-stream', body: bytes || '' });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(error.message));
    await page.goto(base + '/onboard.html?plan=starter');
    await page.locator('#access-email').fill('qa+reported@example.test');
    await page.locator('#access-send').click();
    await page.waitForFunction(() => document.querySelector('#access-status').textContent.includes('Check your inbox'));
    const observation = await page.evaluate(() => ({ title: document.querySelector('#access-title').textContent, formVisible: !document.querySelector('#access-form').hidden, button: document.querySelector('#access-send').textContent, buttonDisabled: document.querySelector('#access-send').disabled, focused: document.activeElement.id, status: document.querySelector('#access-status').textContent, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
    const screenshot = 'scratchpad/signup-feedback-independent-baseline-' + width + '.png';
    if (existsSync(screenshot)) throw Error('Preserve prior screenshot');
    await page.screenshot({ path: screenshot, fullPage: true });
    report.observations.push({ width, requests, ...observation, screenshot, defectReproduced: observation.formVisible && observation.button === 'Email me a sign-in link' && !observation.buttonDisabled && observation.title === 'Let’s get started.' });
    await context.close();
  }
} finally {
  await browser.close();
  report.sourceHashes = Object.fromEntries([...cache].filter(([, value]) => value).map(([path, bytes]) => [path, createHash('sha256').update(bytes).digest('hex')]));
  report.reportedDefectReproduced = report.observations.length === 3 && report.observations.every(row => row.defectReproduced);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, reproduced: report.reportedDefectReproduced, viewports: report.observations.map(row => row.width), nodeHTTPAttempts: report.nodeHTTPAttempts, pageErrors: report.pageErrors }));
}
