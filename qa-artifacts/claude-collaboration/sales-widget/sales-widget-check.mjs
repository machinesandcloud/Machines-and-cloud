// Offline browser check of the public SALES chat (agent-widget.js) as a prospective home-service owner.
// The actual /api/chat handler (netlify/functions/chat.mjs, the only /api/* the widget calls) runs in-process with
// MC_MEMORY_STORE=1 and MC_FAKE_MODEL=1, an emptied environment and physical transport denied. Playwright serves this
// worktree's files through context.route; failures (lost response, non-JSON 5xx, slow reply) are injected around the
// actual handler, and a few stream shapes the fake model cannot produce (several deltas, sales events) are fixtures.
// Usage (worktree root):
//   node qa-artifacts/claude-collaboration/sales-widget/sales-widget-check.mjs --widget base|worktree \
//     --output scratchpad/claude-sales-<name>.json [--executable <chrome-headless-shell>] [--only <substring>]
// --widget base serves `git show dfb0ae78:agent-widget.js` in place of the worktree file (base-vs-fix runs).
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), origin = 'http://127.0.0.1:8947';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const widgetFile = arg('--widget-file'), output = arg('--output'), widgetMode = widgetFile ? 'file' : arg('--widget') || 'worktree', only = arg('--only'), executable = arg('--executable');
if (!output || !/^scratchpad\/claude-sales-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-sales-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
if (!['base', 'worktree', 'file'].includes(widgetMode)) throw new Error('--widget base|worktree, or --widget-file <earlier agent-widget.js>');
const BASE = 'dfb0ae7846e66871d849c67566bf9d3b475f46ae';
const sha = value => createHash('sha256').update(value).digest('hex');
const widgetBytes = widgetMode === 'base' ? execFileSync('git', ['show', BASE + ':agent-widget.js']) : readFileSync(widgetFile || 'agent-widget.js');
const watched = ['index.html', 'about.html', 'styles.css', 'site-refresh.css', 'script.js', 'stories.js', 'signup-intake.js', 'hero-photos.js', 'brand-marks.js', 'netlify/functions/chat.mjs', 'netlify/functions/lib/agent.mjs', 'netlify/functions/lib/sales-desk.mjs', 'netlify/functions/lib/sales-budget.mjs', 'netlify/functions/lib/fake-model.mjs'];
const hashes = () => ({ 'agent-widget.js (served)': sha(widgetBytes), ...Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))])) });
const report = { at: new Date().toISOString(), widget: widgetMode, widgetFile: widgetFile || null, mode: 'Actual chat handler in-process (memory store, fake model, emptied env, physical transport denied); Playwright-served worktree files; injected failures around the handler; stream-shape fixtures labelled', served: hashes(), checks: [], handlerCalls: 0, fixtureResponses: 0, injectedFailures: 0, externalBlocked: [], blockedAPI: [], physicalNetwork: 0, pageErrors: [], screenshots: [] };

// Empty environment: only what Node and the browser launcher need, plus the offline switches.
for (const key of Object.keys(process.env)) if (!['PATH', 'HOME', 'TMPDIR', 'LANG'].includes(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin });
const playwright = await import(pathToFileURL('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs').href);
const browser = await playwright.chromium.launch({ ...(executable ? { executablePath: executable } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-sync'] });
report.browser = executable || 'channel:chrome'; report.browserVersion = browser.version();
const deny = () => { report.physicalNetwork++; throw new Error('Sales widget check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async input => { report.physicalNetwork++; throw new Error('Sales widget check forbids network: ' + String(input?.url || input)); };
const chat = (await import(pathToFileURL(resolve('netlify/functions/chat.mjs')).href)).default;

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const VIEWPORTS = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: IPHONE }, desktop: { viewport: { width: 1440, height: 900 } }, tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: IPAD } };
const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); console.log((pass ? 'PASS ' : 'FAIL ') + name); };
const contexts = []; let ipSerial = 0;
const ndjson = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';

async function setup(device, { page: path = '/', storage, clock, viewport } = {}) {
  const context = await browser.newContext({ ...VIEWPORTS[device], ...(viewport ? { viewport } : {}), reducedMotion: 'reduce', serviceWorkers: 'block' }); contexts.push(context);
  const x = { device, context, requests: [], plan: [], ip: '203.0.113.' + (++ipSerial % 250 + 1), holds: [] };
  if (storage) await context.addInitScript(value => { try { sessionStorage.setItem('mc_sales_desk_v3', value); } catch (_) {} }, JSON.stringify(storage));
  // Every live-region mutation is recorded with the text it would make a screen reader speak.
  await context.addInitScript(() => {
    window.__live = [];
    const liveOf = n => { for (let e = n && (n.nodeType === 1 ? n : n.parentElement); e; e = e.parentElement) { const live = e.getAttribute('aria-live'), role = e.getAttribute('role'); if (live === 'off') return null; if (live === 'polite' || live === 'assertive' || /^(log|status|alert)$/.test(role || '')) return e; } return null; };
    new MutationObserver(list => { for (const m of list) { const region = liveOf(m.target); if (!region || region.closest('[hidden]') || region.closest('[aria-hidden="true"]')) continue; const added = m.type === 'characterData' ? m.target.data : [...m.addedNodes].map(n => n.textContent).join(' '); if (added && added.trim()) window.__live.push({ region: region.id || region.className, text: added.trim().slice(0, 400) }); } }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) { report.externalBlocked.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname !== '/api/chat') { report.blockedAPI.push({ path: url.pathname, method: req.method() }); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_routed"}' }); }
      const body = req.postData(); x.requests.push(JSON.parse(body || 'null'));
      const step = x.plan.shift() || { kind: 'handler' };
      if (step.hold) await new Promise(r => x.holds.push(r));
      if (step.kind === 'lost') { report.injectedFailures++; return route.abort('connectionreset').catch(() => {}); }
      if (step.kind === 'html502') { report.injectedFailures++; return route.fulfill({ status: 502, contentType: 'text/html', body: '<html><body><h1>502 Bad Gateway</h1><p>upstream connect error or disconnect/reset before headers</p></body></html>' }).catch(() => {}); }
      if (step.kind === 'busy429') { report.injectedFailures++; return route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"busy"}' }).catch(() => {}); }
      if (step.kind === 'fixture') { report.fixtureResponses++; return route.fulfill({ status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: ndjson(step.rows) }).catch(() => {}); }
      // Actual handler. Optional per-step env (e.g. an IP allowance of zero for the actual 429).
      const saved = {}; for (const [k, v] of Object.entries(step.env || {})) { saved[k] = process.env[k]; process.env[k] = v; }
      let res; try {
        report.handlerCalls++;
        res = await chat(new Request(url.href, { method: req.method(), headers: { 'content-type': 'application/json', origin: req.headers().origin || origin }, body }), { ip: x.ip });
      } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
      const text = await res.text(); x.lastHandler = { status: res.status, text: text.slice(0, 600) };
      if (step.kind === 'cut') { report.injectedFailures++; return route.abort('connectionreset').catch(() => {}); } // handler ran, response lost
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: text }).catch(() => {});
    }
    const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''));
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    if (relative === 'agent-widget.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: widgetBytes });
    let file = resolve(root, relative); if (!file.startsWith(root + '/')) return route.fulfill({ status: 404, body: 'blocked' });
    if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
    if (!existsSync(file) || statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' })[extname(file)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
  });
  const page = await context.newPage(); x.page = page;
  page.on('pageerror', error => report.pageErrors.push({ device, message: error.message }));
  if (clock) await page.clock.install();
  await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
  await page.locator('#mcAgentLauncher').waitFor({ state: 'attached' });
  x.release = () => { const r = x.holds.shift(); if (r) r(); };
  x.idle = () => page.waitForFunction(() => document.querySelector('#mcAgentStop').hidden, undefined, { timeout: 15000 });
  x.busy = () => page.waitForFunction(() => !document.querySelector('#mcAgentStop').hidden, undefined, { timeout: 5000 });
  x.focus = () => page.evaluate(() => { const a = document.activeElement; const r = a && a.getBoundingClientRect(); return { id: a && a.id, tag: a && a.tagName, cls: a && a.className, text: a && (a.textContent || '').trim().slice(0, 40), inPanel: !!(a && a.closest && a.closest('#mcAgentPanel')), visible: !!(r && r.width && r.height && !a.closest('[hidden]')) }; });
  x.saved = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('mc_sales_desk_v3')); } catch (_) { return null; } });
  x.panelText = () => page.locator('#mcAgentPanel').innerText();
  x.open = async () => { await page.locator('#mcAgentLauncher').focus(); await page.keyboard.press('Enter'); await page.locator('#mcAgentPanel').waitFor({ state: 'visible' }); await page.waitForTimeout(80); };
  x.ask = async text => { await page.locator('#mcAgentInput').fill(text); await page.locator('#mcAgentInput').press('Enter'); };
  x.live = () => page.evaluate(() => window.__live.splice(0));
  return x;
}
const ok = f => f.inPanel && f.visible;
const RAW = /TypeError|Failed to fetch|NetworkError|SyntaxError|Unexpected token|Bad Gateway|upstream connect|\bundefined\b|\[object|<html|<\/?body|JSON\.parse|status \d{3}|\b(?:502|503|429)\b/i;
const runCase = async (name, fn) => {
  if (only && !name.includes(only)) return;
  try { await fn(); } catch (error) { check(name + ': completed without harness error', false, String(error && error.stack || error).slice(0, 900)); }
  while (contexts.length) await contexts.pop().close().catch(() => {});
};
const ACTION_REPLY = [
  { t: 'delta', text: 'Here is a starting point.' },
  { t: 'done', reply: 'Here is a starting point for a two-truck HVAC shop.\n\n- Website chat answers service and price questions from your saved details.\n- You confirm each visit yourself.\n\n| Item | Detail |\n| --- | --- |\n| Diagnostic | $89 |', events: [
    { type: 'sales_fit', data: { kind: 'workflow_fit', fit: 'current_fit', gaps: [] } },
    { type: 'sales_action', action: 'see_example', scenario: 'sms', label: 'See it work' },
    { type: 'sales_action', action: 'contact', label: 'Choose a time to talk' }] }];

try {
  for (const device of ['phone', 'desktop']) {
    for (const path of ['/', '/about.html']) {
      await runCase(`${device} ${path}: open, ask, close, reopen with Esc and an honest modal`, async () => {
        const x = await setup(device, { page: path }); const { page } = x;
        await x.open();
        const opened = await page.evaluate(() => { const p = document.getElementById('mcAgentPanel'), root = document.getElementById('mcAgent'); const others = [...document.body.children].filter(n => n !== root && n.tagName !== 'SCRIPT'); return { modal: p.getAttribute('aria-modal'), role: p.getAttribute('role'), label: !!(p.getAttribute('aria-labelledby') && document.getElementById(p.getAttribute('aria-labelledby'))?.textContent.trim()), allInert: others.every(n => n.inert), focus: document.activeElement.id }; });
        check(`${device} ${path}: keyboard open focuses the composer inside a labelled dialog`, opened.role === 'dialog' && opened.label && opened.focus === 'mcAgentInput', opened);
        check(`${device} ${path}: aria-modal is honest (every background child inert)`, opened.modal !== 'true' || opened.allInert, opened);
        await x.ask('I run a two-truck HVAC shop in Katy. Would website chat fit?'); await x.idle();
        const saved = await x.saved(), text = await x.panelText();
        check(`${device} ${path}: the actual handler's reply is shown and saved as one complete exchange`, x.requests.length === 1 && saved?.turns?.length === 2 && text.includes(saved.turns[1].content.slice(0, 30)) && !RAW.test(text), { requests: x.requests.length, turns: saved?.turns?.length, handler: x.lastHandler?.status });
        await page.keyboard.press('Escape');
        const closed = await page.evaluate(() => ({ hidden: document.getElementById('mcAgentPanel').hidden, inert: [...document.body.children].some(n => n.inert), focus: document.activeElement.id }));
        check(`${device} ${path}: Esc closes, restores the page and returns focus to the launcher`, closed.hidden && !closed.inert && closed.focus === 'mcAgentLauncher', closed);
        await x.open();
        check(`${device} ${path}: reopening keeps the conversation`, (await x.panelText()).includes((await x.saved()).turns[1].content.slice(0, 30)));
      });
    }

    await runCase(`${device}: keyboard Send button keeps focus in the chat`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'handler', hold: true });
      await page.locator('#mcAgentInput').fill('What does setup involve?');
      await page.keyboard.press('Tab'); const onSend = await x.focus();
      await page.keyboard.press('Enter'); await x.busy(); const during = await x.focus();
      x.release(); await x.idle(); await page.waitForTimeout(50); const after = await x.focus();
      check(`${device}: Send by keyboard keeps focus on a visible chat control while waiting`, onSend.id === 'mcAgentSend' && ok(during), { onSend, during });
      check(`${device}: Send by keyboard keeps focus on a visible chat control after the reply`, ok(after), after);
      check(`${device}: exactly one request for one Send`, x.requests.length === 1, x.requests.length);
    });

    await runCase(`${device}: keyboard suggestion keeps focus in the chat`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      await page.locator('.mc-agent-chip').first().focus(); await page.keyboard.press('Enter'); await x.idle(); await page.waitForTimeout(50);
      const after = await x.focus();
      check(`${device}: a keyboard-chosen suggestion leaves focus on a visible chat control`, ok(after) && x.requests.length === 1, after);
    });

    await runCase(`${device}: lost response, readable recovery and keyboard Retry`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'cut' }); await x.ask('Can it answer pricing questions?'); await x.idle();
      const text = await x.panelText(), saved = await x.saved(), retry = page.locator('.mc-agent-retry');
      check(`${device}: lost response shows plain words, keeps the question and offers Retry`, !RAW.test(text) && saved.failed === 'Can it answer pricing questions?' && saved.turns.length === 0 && await retry.isVisible(), { text: text.slice(-400) });
      const f = await x.focus();
      check(`${device}: after a failure focus stays on a visible chat control`, ok(f), f);
      await retry.focus(); x.plan.push({ kind: 'handler', hold: true }); await page.keyboard.press('Enter'); await x.busy(); const during = await x.focus();
      x.release(); await x.idle(); await page.waitForTimeout(50); const after = await x.focus(), s2 = await x.saved();
      check(`${device}: keyboard Retry keeps focus on a visible chat control while waiting`, ok(during), during);
      check(`${device}: keyboard Retry keeps focus on a visible chat control after the reply`, ok(after), after);
      check(`${device}: Retry completes once with no duplicate turn`, x.requests.length === 2 && s2.turns.length === 2 && !s2.failed, { requests: x.requests.length, turns: s2.turns.length });
    });

    await runCase(`${device}: non-JSON 502`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'html502' }); await x.ask('Do you work with plumbers?'); await x.idle();
      const text = await x.panelText();
      check(`${device}: a non-JSON 502 shows plain recovery copy and Retry, no raw body`, !RAW.test(text) && await page.locator('.mc-agent-retry').isVisible(), text.slice(-300));
      await page.locator('.mc-agent-retry').click(); await x.idle();
      check(`${device}: Retry after 502 completes`, (await x.saved()).turns.length === 2 && x.requests.length === 2);
    });

    await runCase(`${device}: 429 (actual handler allowance and busy)`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'handler', env: { MC_SALES_AI_IP_DAILY_LIMIT: '0' } }); await x.ask('How much does it cost?'); await x.idle();
      const text = await x.panelText();
      check(`${device}: the actual handler's 429 shows the allowance copy, keeps the question and a way to talk with us`, x.lastHandler.status === 429 && /allowance/i.test(text) && !RAW.test(text) && (await x.saved()).failed === 'How much does it cost?' && await page.locator('#mcAgentPanel a', { hasText: 'Talk with us' }).isVisible(), { handler: x.lastHandler, text: text.slice(-300) });
      x.plan.push({ kind: 'busy429' }); await page.locator('.mc-agent-retry').click(); await x.idle();
      const busy = await x.panelText();
      check(`${device}: a busy 429 shows plain copy and keeps the question`, /busy/i.test(busy) && !RAW.test(busy) && (await x.saved()).failed === 'How much does it cost?');
    });

    await runCase(`${device}: double send`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'handler', hold: true });
      await page.locator('#mcAgentInput').fill('First question');
      await page.locator('#mcAgentInput').press('Enter'); await page.locator('#mcAgentInput').press('Enter');
      await page.locator('#mcAgentInput').fill('Typed while waiting'); await page.locator('#mcAgentInput').press('Enter');
      await page.evaluate(() => document.getElementById('mcAgentForm').requestSubmit());
      x.release(); await x.idle();
      check(`${device}: repeated Enter/submit while waiting sends exactly once and keeps the new draft`, x.requests.length === 1 && await page.locator('#mcAgentInput').inputValue() === 'Typed while waiting', { requests: x.requests.length });
      x.plan.push({ kind: 'lost' }); await page.locator('#mcAgentInput').fill('Second question'); await page.locator('#mcAgentInput').press('Enter'); await x.idle();
      x.plan.push({ kind: 'handler', hold: true }); await page.locator('.mc-agent-retry').dblclick({ force: true }).catch(() => {}); await page.waitForTimeout(100); x.release(); await page.waitForTimeout(50); x.release(); await x.idle();
      check(`${device}: double-activating Retry sends once`, x.requests.length === 3 && (await x.saved()).turns.length === 4, { requests: x.requests.length });
    });

    await runCase(`${device}: slow reply, close and reopen`, async () => {
      const x = await setup(device, { clock: true }); const { page } = x; await x.open();
      x.plan.push({ kind: 'handler', hold: true }); await x.ask('Slow question about Thumbtack leads'); await x.busy();
      await page.clock.fastForward(20000);
      const status = await page.locator('#mcAgentStatus').innerText(), announced = (await x.live()).map(r => r.text).join(' | ');
      check(`${device}: after 20s of waiting the chat says it is still working and that Stop/Retry is available`, /still/i.test(status) && /stop/i.test(status) && /still/i.test(announced), { status, announced });
      await page.keyboard.press('Escape'); await x.open();
      check(`${device}: closing and reopening mid-reply keeps the wait visible with Stop`, await page.locator('#mcAgentStop').isVisible());
      x.release(); await x.idle();
      check(`${device}: the slow reply lands after reopening`, (await x.saved()).turns.length === 2);
      x.plan.push({ kind: 'handler', hold: true }); await x.ask('A reply that never arrives'); await x.busy();
      await page.clock.fastForward(86000); await x.idle(); const text = await x.panelText();
      check(`${device}: the 85s timeout ends in plain recovery copy with Retry`, !RAW.test(text) && await page.locator('.mc-agent-retry').isVisible() && (await x.saved()).failed === 'A reply that never arrives');
      x.release();
    });

    await runCase(`${device}: Stop by keyboard`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'handler', hold: true }); await x.ask('Stop me'); await x.busy();
      await page.locator('#mcAgentStop').focus(); await page.keyboard.press('Enter'); await x.idle(); await page.waitForTimeout(50);
      const f = await x.focus(); x.release();
      check(`${device}: Stop by keyboard leaves focus on a visible chat control (Retry or composer)`, ok(f), f);
    });

    await runCase(`${device}: a finishing reply never pulls focus away from what the visitor is reading`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'fixture', rows: ACTION_REPLY }); await x.ask('Would this fit?'); await x.idle();
      x.plan.push({ kind: 'handler', hold: true }); await x.ask('And texting?'); await x.busy();
      await page.locator('.mc-agent-next a').first().focus(); const before = await x.focus();
      x.release(); await x.idle(); await page.waitForTimeout(50); const after = await x.focus();
      check(`${device}: focus stays on the earlier reply's link when the new reply finishes`, before.tag === 'A' && after.tag === 'A' && after.text === before.text, { before, after });
    });

    // QA note 1 (required): a visitor who sends with Enter and then clicks or selects text in the conversation keeps
    // their place; the finishing reply must not move focus to the composer or clear the selection.
    await runCase(`${device}: clicking or selecting in the conversation while waiting is left alone`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'fixture', rows: ACTION_REPLY }); await x.ask('Would this fit?'); await x.idle();
      const para = page.locator('.mc-agent-msg.agent li').first();
      x.plan.push({ kind: 'handler', hold: true }); await x.ask('And texting?'); await x.busy();
      await para.scrollIntoViewIfNeeded(); await para.click(); const clicked = await x.focus();
      x.release(); await x.idle(); await page.waitForTimeout(50); const afterClick = await x.focus();
      check(`${device}: a click in the conversation during the wait is not overridden by the finishing reply`, afterClick.id !== 'mcAgentInput' && afterClick.tag === clicked.tag, { clicked, afterClick });
      x.plan.push({ kind: 'handler', hold: true }); await x.ask('And calendar?'); await x.busy();
      await para.scrollIntoViewIfNeeded(); await para.click({ clickCount: 3 }); // a real triple-click selects the item's text
      const selBefore = await page.evaluate(() => String(getSelection()).length);
      x.release(); await x.idle(); await page.waitForTimeout(50);
      const selAfter = await page.evaluate(() => String(getSelection()).length), afterSel = await x.focus();
      check(`${device}: a text selection made during the wait survives the reply`, selBefore > 10 && selAfter === selBefore && afterSel.id !== 'mcAgentInput', { selBefore, selAfter, afterSel });
    });

    await runCase(`${device}: screen-reader announcements`, async () => {
      const x = await setup(device); const { page } = x; await x.open(); await x.live();
      x.plan.push({ kind: 'fixture', rows: [{ t: 'delta', text: 'PARTIAL-ONE ' }, { t: 'delta', text: 'PARTIAL-TWO ' }, { t: 'delta', text: 'PARTIAL-THREE ' }, { t: 'done', reply: 'FINAL-ANSWER for your shop.', events: [] }] });
      await x.ask('Announce test'); await x.idle(); await page.waitForTimeout(150);
      const live = await x.live(), all = live.map(r => r.text).join(' | ');
      check(`${device}: streamed partial text is not announced; the final reply is announced exactly once`, !/PARTIAL-TWO|PARTIAL-THREE/.test(all) && live.filter(r => r.text.includes('FINAL-ANSWER')).length === 1, live);
      x.plan.push({ kind: 'lost' }); await x.ask('Announce failure'); await x.idle(); await page.waitForTimeout(150);
      const fail = await x.live();
      check(`${device}: a failure is announced once, without re-reading the question`, fail.filter(r => /retry|try again|connect/i.test(r.text)).length === 1 && !fail.some(r => r.text.includes('Announce failure')), fail);
      await page.keyboard.press('Escape'); await page.reload(); await page.locator('#mcAgentLauncher').waitFor({ state: 'attached' }); await x.open(); await page.waitForTimeout(150);
      const reopen = await x.live();
      check(`${device}: opening a saved conversation does not read the whole history aloud`, !reopen.some(r => r.text.includes('FINAL-ANSWER')), reopen);
    });

    await runCase(`${device}: Esc during IME composition`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      await page.locator('#mcAgentInput').evaluate(n => { n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true })); n.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true, cancelable: true })); });
      check(`${device}: Esc that ends an IME composition does not close the chat`, await page.locator('#mcAgentPanel').isVisible());
    });

    await runCase(`${device}: Tab wraps inside the dialog with a rich reply`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'fixture', rows: ACTION_REPLY }); await x.ask('Rich reply'); await x.idle();
      const order = []; await page.locator('#mcAgentReset').focus();
      for (let n = 0; n < 30; n++) { await page.keyboard.press('Tab'); const f = await x.focus(); order.push(f.id || f.text || f.tag); if (!f.inPanel) { order.push('ESCAPED'); break; } }
      await page.keyboard.press('Shift+Tab');
      check(`${device}: Tab and Shift+Tab never leave the open dialog`, !order.includes('ESCAPED') && (await x.focus()).inPanel, order);
    });

    await runCase(`${device}: tap targets`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      const chipMin = device === 'phone' ? 44 : 24, chipSizes = await page.locator('.mc-agent-chip').evaluateAll(ns => ns.map(n => { const r = n.getBoundingClientRect(); return { text: n.textContent, w: Math.round(r.width), h: Math.round(r.height) }; }));
      check(`${device}: suggestion buttons are at least ${chipMin}px tall`, chipSizes.length === 4 && chipSizes.every(c => c.h >= chipMin && c.w >= chipMin), chipSizes);
      x.plan.push({ kind: 'fixture', rows: ACTION_REPLY }); await x.ask('Rich reply'); await x.idle();
      x.plan.push({ kind: 'lost' }); await x.ask('Make a retry'); await x.idle();
      const min = device === 'phone' ? 44 : 24;
      const small = await page.evaluate(min => [...document.querySelectorAll('#mcAgentPanel button, #mcAgentPanel a, #mcAgentPanel summary, #mcAgentPanel textarea, #mcAgentLauncher')].filter(n => { const r = n.getBoundingClientRect(); return r.width && r.height && !n.closest('[hidden]') && !n.closest('p, li, td, th, .mc-agent-foot'); }).map(n => { const r = n.getBoundingClientRect(); return { text: (n.id || n.textContent.trim()).slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(r => r.w < min || r.h < min), min);
      check(`${device}: every chat control outside running text is at least ${min}×${min}px`, small.length === 0, small);
      const fit = await page.evaluate(() => { const p = document.getElementById('mcAgentPanel').getBoundingClientRect(); return { left: p.left, right: p.right, top: p.top, bottom: p.bottom, w: innerWidth, h: innerHeight, scroll: document.getElementById('mcAgentPanel').scrollWidth <= document.getElementById('mcAgentPanel').clientWidth + 1 }; });
      check(`${device}: the panel fits the viewport with no horizontal scroll`, fit.left >= 0 && fit.right <= fit.w + 1 && fit.top >= 0 && fit.bottom <= fit.h + 1 && fit.scroll, fit);
      if (device === 'phone') { const path = output.replace(/\.json$/, '') + '-phone-controls.png'; await page.screenshot({ path }); report.screenshots.push(path); }
    });

    await runCase(`${device}: contrast`, async () => {
      const x = await setup(device); const { page } = x; await x.open();
      x.plan.push({ kind: 'fixture', rows: ACTION_REPLY }); await x.ask('Rich reply'); await x.idle();
      x.plan.push({ kind: 'lost' }); await x.ask('Make a retry'); await x.idle();
      const low = await page.evaluate(() => {
        const rgb = s => (s.match(/[\d.]+/g) || []).map(Number), lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bg = e => { for (; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.9)) return c; } return [255, 255, 255]; };
        const out = [], walker = document.createTreeWalker(document.getElementById('mcAgentPanel'), NodeFilter.SHOW_TEXT);
        for (let t; (t = walker.nextNode());) { const e = t.parentElement; if (!t.data.trim() || !e.getClientRects().length || e.closest('[hidden], .sr-only')) continue; const s = getComputedStyle(e); const fg = rgb(s.color), b = bg(e); const L1 = lum(fg), L2 = lum(b), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); const size = parseFloat(s.fontSize), large = size >= 24 || size >= 18.66 && Number(s.fontWeight) >= 700; if (ratio < (large ? 3 : 4.5)) out.push({ text: t.data.trim().slice(0, 30), ratio: Math.round(ratio * 100) / 100, size }); }
        const ph = document.getElementById('mcAgentInput'), ps = getComputedStyle(ph, '::placeholder'); const r2 = (() => { const L1 = lum(rgb(ps.color)), L2 = lum(bg(ph)); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); })(); if (r2 < 4.5) out.push({ text: 'placeholder', ratio: Math.round(r2 * 100) / 100 });
        return out;
      });
      check(`${device}: visible chat text meets WCAG AA contrast`, low.length === 0, low);
    });

    if (device === 'phone') await runCase(`${device}: phone keyboard does not cover the composer`, async () => {
      const x = await setup(device); const { page } = x;
      // Simulated keyboard: visualViewport shrinks (and on iOS scrolls) while the layout viewport stays the same.
      // The widget reads visualViewport at load; reload with the fake installed first.
      await x.context.addInitScript(() => { const fake = new EventTarget(); let h = innerHeight, top = 0; Object.defineProperties(fake, { height: { get: () => h }, width: { get: () => innerWidth }, offsetTop: { get: () => top }, offsetLeft: { get: () => 0 }, pageTop: { get: () => scrollY + top }, scale: { get: () => 1 } }); window.__vv = (nh, nt) => { h = nh; top = nt; fake.dispatchEvent(new Event('resize')); fake.dispatchEvent(new Event('scroll')); }; Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake }); });
      await page.reload(); await page.locator('#mcAgentLauncher').waitFor({ state: 'attached' }); await x.open();
      const results = [];
      for (const [h, top] of [[480, 0], [430, 210]]) {
        await page.evaluate(([h, top]) => window.__vv(h, top), [h, top]); await page.waitForTimeout(60);
        results.push(await page.evaluate(([h, top]) => { const i = document.getElementById('mcAgentInput').getBoundingClientRect(), s = document.getElementById('mcAgentSend').getBoundingClientRect(), hd = document.getElementById('mcAgentClose').getBoundingClientRect(); return { h, top, inputTop: i.top, inputBottom: i.bottom, sendBottom: s.bottom, closeTop: hd.top, ok: i.top >= top && Math.max(i.bottom, s.bottom) <= top + h + 1 && hd.top >= top - 1 }; }, [h, top]));
      }
      check(`${device}: composer and Close stay inside the visible viewport above a simulated keyboard`, results.every(r => r.ok), results);
    });
  }

  await runCase('ios-zoom', async () => {
    for (const device of ['phone', 'tablet']) {
      const x = await setup(device); await x.open();
      const size = await x.page.locator('#mcAgentInput').evaluate(n => parseFloat(getComputedStyle(n).fontSize));
      check(`${device}: composer text is at least 16px so iOS Safari does not zoom on focus`, size >= 16, size);
      await x.context.close();
    }
  });
} finally {
  while (contexts.length) await contexts.pop().close().catch(() => {});
  await browser.close();
  report.servedAfter = hashes(); report.sourceStable = JSON.stringify(report.servedAfter) === JSON.stringify(report.served);
  report.passed = report.checks.filter(c => c.pass).length; report.failed = report.checks.length - report.passed;
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(`${report.passed}/${report.checks.length} (${widgetMode}) handler=${report.handlerCalls} fixtures=${report.fixtureResponses} injected=${report.injectedFailures} physical=${report.physicalNetwork} external=${report.externalBlocked.length} pageErrors=${report.pageErrors.length} -> ${output}`);
}
