// Proposal 2 cross-origin probe. The widget-stream suite mocks window.fetch inside the page, and Playwright's
// route.fulfill also bypasses CORS, so neither can see whether a cross-origin widget can READ a 403 body.
// Here two loopback HTTP servers on different ports give two real browser origins:
//   shop     http://127.0.0.1:<p1>/            the shop page that embeds the widget
//   platform http://127.0.0.1:<p2>/embed.js     the real embed.js; /api/chat (and its CORS preflight) is the
//            REAL chat.mjs handler running in this process (memory store, fake model); /api/client is a static
//            "live" fixture with CORS so the widget opens.
// Fixture: a legacy shop whose website host is 127.0.0.1 and whose status is "paused" (chat.mjs:112).
// The browser resolves nothing but 127.0.0.1; Node outbound requests are denied.
// Usage: node widget-403-cors-probe.mjs --repo <repo root> --out <dir> [--strip-cors]
//   --strip-cors removes Access-Control-* headers from the handler's POST response (control).
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
const argOf = name => { const i = process.argv.indexOf(name); if (i < 0) throw new Error('Missing ' + name); return process.argv[i + 1]; };
const repo = resolve(argOf('--repo')), out = resolve(argOf('--out')), stripCors = process.argv.includes('--strip-cors');
await mkdir(out, { recursive: true });
const deny = () => { throw new Error('widget-403-cors-probe denies outbound networking'); };
globalThis.fetch = deny; http.request = http.get = https.request = https.get = deny; net.connect = net.createConnection = deny;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|ADMIN_KEY|SITE_ORIGINS|DEPLOY_)/.test(key)) delete process.env[key];
const listen = handler => new Promise(done => { const server = http.createServer(handler); server.listen(0, '127.0.0.1', () => done(server)); });
const readBody = req => new Promise(done => { const parts = []; req.on('data', part => parts.push(part)); req.on('end', () => done(Buffer.concat(parts).toString('utf8'))); });
const handled = [], other = [];
let chat, source, PLATFORM, SHOP;
const platformServer = await listen(async (req, res) => {
  const url = new URL(req.url, PLATFORM);
  if (url.pathname === '/embed.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); return res.end(source); }
  if (url.pathname === '/api/client' && url.searchParams.get('c') === 'stream-fixture') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': req.headers.origin || '*' }); return res.end(JSON.stringify({ name: 'Fixture Air', greeting: 'How can we help?', status: 'live', webAvailable: true })); }
  if (url.pathname === '/api/chat') {
    const body = await readBody(req), headers = new Headers(Object.entries(req.headers).filter(([, value]) => typeof value === 'string'));
    const response = await chat(new Request(url, { method: req.method, headers, ...(body && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? { body } : {}) }), { ip: '192.0.2.60' });
    const text = await response.text(), responseHeaders = Object.fromEntries(response.headers);
    if (stripCors && req.method === 'POST') for (const name of Object.keys(responseHeaders)) if (name.startsWith('access-control-')) delete responseHeaders[name];
    handled.push({ method: req.method, status: response.status, headers: responseHeaders, body: text });
    res.writeHead(response.status, responseHeaders); return res.end(text);
  }
  other.push({ method: req.method, url: req.url }); res.writeHead(404); res.end();
});
PLATFORM = `http://127.0.0.1:${platformServer.address().port}`;
const shopServer = await listen((req, res) => { if (req.url !== '/') { other.push({ shop: true, url: req.url }); res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset="utf-8"><title>Fixture Air</title><h1>Fixture Air</h1><script src="${PLATFORM}/embed.js" data-client="stream-fixture" async></script>`); });
SHOP = `http://127.0.0.1:${shopServer.address().port}`;
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: PLATFORM, PUBLIC_SITE_URL: PLATFORM });
const lib = path => import(pathToFileURL(resolve(repo, path)).href);
const store = await lib('netlify/functions/lib/store.mjs'), { newClient } = await lib('netlify/functions/lib/config.mjs');
chat = (await lib('netlify/functions/chat.mjs')).default; source = await readFile(resolve(repo, 'embed.js'), 'utf8');
await store.saveClient({ ...newClient({ slug: 'stream-fixture', ownerKey: 'owner-key', owner: { name: 'QA Owner', email: 'owner@example.invalid', phone: '+17135550140' }, business: { name: 'Fixture Air', trade: 'HVAC', website: SHOP } }), status: 'paused' });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: '/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const consoleErrors = [];
let report;
try {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(SHOP + '/', { waitUntil: 'load' });
  await page.locator('#mcDesk .l').click();
  await page.locator('#mcDesk textarea').fill('Please save my AC service request for tomorrow.');
  await page.locator('#mcDesk button.s').click();
  await page.waitForFunction(() => !!document.querySelector('#mcDesk .m .b.a[role=status]'), null, { timeout: 5000 });
  await page.waitForTimeout(200);
  const observed = await page.evaluate(() => ({ bubbles: [...document.querySelectorAll('#mcDesk .m .b')].map(node => node.textContent), pendingTurn: JSON.parse(sessionStorage.getItem('mc_desk_stream-fixture'))?.pendingTurn ?? null, composerEnabled: !document.querySelector('#mcDesk textarea').disabled, recoveryVisible: !document.querySelector('#mcDesk .recovery').hidden }));
  await page.screenshot({ path: resolve(out, 'after-403.png'), fullPage: true });
  report = { repo, stripCors, shop: SHOP, platform: PLATFORM, handled, observed, consoleErrors, other };
} finally { await browser.close(); platformServer.close(); shopServer.close(); }
await writeFile(resolve(out, 'probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ stripCors, requests: report.handled.map(row => ({ method: row.method, status: row.status, acao: row.headers['access-control-allow-origin'] || null, body: row.body })), observed: { ...report.observed, pendingTurn: report.observed.pendingTurn ? 'kept' : null }, consoleErrors: report.consoleErrors, other: report.other }, null, 1));
assert.equal(report.observed.pendingTurn, null, 'refused first send clears the pending receipt across origins');
assert.equal(report.observed.composerEnabled, true, 'composer is released');
assert.ok(report.observed.bubbles.includes('Website chat is unavailable right now. Please use the shop’s contact details on this website.'), 'server refusal copy shown');
