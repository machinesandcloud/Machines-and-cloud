// Independent QA probe for embed.js (run from worktree root):
//   node qa-artifacts/claude-collaboration/chat-widget/qa/qa-probe.mjs --embed <path> --output scratchpad/claude-widget-qa-probe-<name>.json
// Fully scripted /api/client + /api/chat at the Playwright route boundary; every other request is aborted. No real network.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const output = arg('--output'), embedPath = resolve(arg('--embed') || 'embed.js'), only = arg('--only');
if (!/^scratchpad\/claude-widget-qa-[\w-]+\.json$/.test(output || '')) throw new Error('bad --output');
if (existsSync(output)) throw new Error('exists');
mkdirSync('scratchpad', { recursive: true });
const src = readFileSync(embedPath);
const report = { embed: embedPath, sha256: createHash('sha256').update(src).digest('hex'), probes: [], forbidden: [], pageErrors: [] };
const pw = await import(pathToFileURL('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs').href);
const browser = await pw.chromium.launch({ executablePath: '/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND', '--disable-background-networking'] });
const PLATFORM = 'https://platform.fixture.test', SHOP = 'https://fixture-shop.example.com';
const host = (scripts = 1) => '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
  '<a href="#a" id="h1">Services</a> <input id="hin"> <button id="hbtn">Host modal</button> <p id="txt">Plain host text to click on.</p> <a href="#z" id="h2">Contact</a>' +
  '<script>window.hostLog=[];document.addEventListener("keydown",function(e){hostLog.push({key:e.key,prevented:e.defaultPrevented,target:document.activeElement&&(document.activeElement.id||document.activeElement.className||document.activeElement.tagName)});});</script>' +
  Array.from({ length: scripts }, () => '<script src="' + PLATFORM + '/embed.js" data-client="shop" async></script>').join('') + '</body></html>';
const AVAIL = { name: 'Fixture Air', greeting: 'Hi!', webAvailable: true, status: 'live' };
async function ctx({ config, scripts = 1, phone = false, chat }) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
  const st = { reads: [], posts: [] };
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin === SHOP && u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: host(scripts) });
    if (u.origin === PLATFORM && u.pathname === '/embed.js') return route.fulfill({ contentType: 'text/javascript', body: src });
    const cors = { 'access-control-allow-origin': SHOP, 'access-control-allow-headers': 'content-type' };
    if (u.origin === PLATFORM && u.pathname === '/api/client') {
      const n = st.reads.length; st.reads.push(Date.now()); const r = await config(n);
      if (r === 'abort') return route.abort('connectionfailed');
      if (r && r.delay) await new Promise(res => setTimeout(res, r.delay));
      return route.fulfill({ status: r.status || 200, contentType: 'application/json', headers: cors, body: JSON.stringify(r.body || {}) });
    }
    if (u.origin === PLATFORM && u.pathname === '/api/chat') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      st.posts.push(route.request().postData());
      const reply = chat ? chat(st.posts.length) : 'Thanks, we have your details.';
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', headers: cors, body: JSON.stringify({ t: 'delta', text: reply.slice(0, 5) }) + '\n' + JSON.stringify({ t: 'done', reply, events: [] }) + '\n' });
    }
    report.forbidden.push(u.href); return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.on('pageerror', e => report.pageErrors.push(e.message));
  await page.goto(SHOP + '/'); await page.locator('#mcDesk .l').waitFor();
  return { context, page, st };
}
async function probe(name, fn) {
  if (only && !name.includes(only)) return;
  const rec = { name, ok: null, data: {} };
  try { await fn(rec.data); rec.ok = true; } catch (e) { rec.ok = false; rec.error = e.message; }
  report.probes.push(rec); console.log((rec.ok ? 'DONE ' : 'ERR  ') + name + ' ' + JSON.stringify(rec.data).slice(0, 900) + (rec.error ? ' ' + rec.error : ''));
}
const active = p => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : null; });

// P1: chat CLOSED never opened; host Tab/Shift+Tab/Esc behaviour unchanged.
await probe('closed-host-keyboard', async d => {
  const { context, page } = await ctx({ config: () => ({ body: AVAIL }) });
  await page.waitForTimeout(300);
  await page.focus('#h1'); const trail = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); trail.push(await active(page)); }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); trail.push(await active(page)); }
  await page.focus('#hin'); await page.keyboard.press('Escape'); await page.focus('#mcDesk .l'); await page.keyboard.press('Escape'); await page.keyboard.press('Tab');
  d.trail = trail; d.afterLauncherTab = await active(page);
  d.hostLog = await page.evaluate(() => hostLog); d.anyPrevented = d.hostLog.some(e => e.prevented);
  // after an open/close cycle, the same
  await page.click('#mcDesk .l'); await page.waitForTimeout(120); await page.click('#mcDesk .x'); await page.evaluate(() => { hostLog.length = 0; });
  await page.focus('#h1'); const t2 = []; for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); t2.push(await active(page)); }
  await page.focus('#hin'); await page.keyboard.press('Escape');
  d.afterCycleTrail = t2; d.afterCyclePrevented = (await page.evaluate(() => hostLog)).some(e => e.prevented);
  d.rootStyleAttr = await page.evaluate(() => document.getElementById('mcDesk').getAttribute('style'));
  await context.close();
});

// P2: OPEN chat, config failing; customer clicks the host page (focus -> body), auto-retry succeeds -> is focus pulled into the widget?
await probe('open-retry-steals-focus-from-host', async d => {
  const { context, page, st } = await ctx({ config: n => n < 1 ? { status: 503 } : { body: AVAIL } });
  await page.waitForTimeout(300); await page.click('#mcDesk .l'); // open while failed -> immediate retry (n=1 succeeds)
  await page.waitForTimeout(500); d.readsAfterOpen = st.reads.length; d.activeAfterOpen = await active(page);
  await context.close();
  // variant: all reads fail until #2; customer clicks host text while the 4s auto-retry is pending
  const b = await ctx({ config: n => n < 2 ? { status: 503 } : { body: AVAIL } });
  await b.page.waitForTimeout(200); await b.page.click('#mcDesk .l'); await b.page.waitForTimeout(400); // read #1 (open) fails, timer scheduled
  await b.page.click('#txt'); d.activeAfterHostClick = await active(b.page);
  const sy0 = await b.page.evaluate(() => scrollY);
  await b.page.waitForTimeout(13000); d.reads = b.st.reads.length; d.activeAfterAutoRetry = await active(b.page);
  d.open = await b.page.evaluate(() => document.getElementById('mcDesk').classList.contains('open'));
  d.stolen = d.activeAfterHostClick !== d.activeAfterAutoRetry;
  await b.context.close();
});

// P2b: host input focused (not body) during auto-retry -> must not move.
await probe('open-retry-host-input-focus', async d => {
  const b = await ctx({ config: n => n < 2 ? { status: 503 } : { body: AVAIL } });
  await b.page.waitForTimeout(200); await b.page.click('#mcDesk .l'); await b.page.waitForTimeout(400);
  await b.page.click('#hin'); await b.page.waitForTimeout(13000); d.reads = b.st.reads.length; d.active = await active(b.page);
  await b.context.close();
});

// P3: retry load. Config always 503, never opened: count reads over 45s; then 50 online events; then 30 open/close cycles.
await probe('retry-load', async d => {
  const { context, page, st } = await ctx({ config: () => ({ status: 503 }) });
  await page.waitForTimeout(45000); d.readsIdle45s = st.reads.length; d.gapsMs = st.reads.slice(1).map((t, i) => t - st.reads[i]);
  await page.evaluate(() => { for (let i = 0; i < 50; i++) window.dispatchEvent(new Event('online')); }); await page.waitForTimeout(800); d.readsAfter50Online = st.reads.length;
  for (let i = 0; i < 30; i++) { await page.click('#mcDesk .l'); await page.waitForTimeout(40); }
  await page.waitForTimeout(800); d.readsAfter30Toggles = st.reads.length;
  await page.waitForTimeout(40000); d.readsAfterAnother40s = st.reads.length;
  await context.close();
});

// P3b: instant-failing (abort) config, rapid toggles: is there a per-open request with no backoff?
await probe('retry-load-abort-toggles', async d => {
  const { context, page, st } = await ctx({ config: () => 'abort' });
  await page.waitForTimeout(300); const r0 = st.reads.length;
  for (let i = 0; i < 40; i++) { await page.click('#mcDesk .l'); await page.waitForTimeout(60); }
  await page.waitForTimeout(300); d.readsBefore = r0; d.readsAfter40Toggles = st.reads.length;
  await context.close();
});

// P3c: two embed script tags -> one widget, one config chain.
await probe('two-embed-tags', async d => {
  const { context, page, st } = await ctx({ config: () => ({ status: 503 }), scripts: 2 });
  await page.waitForTimeout(5000); d.widgets = await page.locator('#mcDesk').count(); d.reads5s = st.reads.length; await context.close();
});

// P4: definite-no after transient: 503 then cancelled; online/open never re-read; composer stays closed.
await probe('definite-no-sticks', async d => {
  const { context, page, st } = await ctx({ config: n => n === 0 ? { status: 503 } : n === 1 ? { body: { ...AVAIL, webAvailable: false, status: 'cancelled' } } : { body: AVAIL } });
  await page.waitForTimeout(5000); d.readsAfter5s = st.reads.length;
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('online')); });
  for (let i = 0; i < 6; i++) { await page.click('#mcDesk .l'); await page.waitForTimeout(60); }
  await page.waitForTimeout(30000); d.readsTotal = st.reads.length;
  d.composerDisabled = await page.evaluate(() => document.querySelector('#mcDesk textarea').disabled);
  d.retryRowHidden = await page.evaluate(() => document.querySelector('#mcDesk .cfg').hidden);
  await context.close();
});
// P4b: 404 -> closed, no retry. 429 on config -> ?
await probe('config-404-and-429', async d => {
  for (const status of [404, 429]) {
    const { context, page, st } = await ctx({ config: () => ({ status }) }); await page.waitForTimeout(18000);
    d['reads' + status] = st.reads.length; d['retryRow' + status] = await page.evaluate(() => !document.querySelector('#mcDesk .cfg').hidden); await context.close();
  }
});
// P4c: chat 429 (daily limit) then online + reopen: no config re-read, stays closed.
await probe('chat-429-no-reread', async d => {
  const { context, page, st } = await ctx({ config: () => ({ body: AVAIL }) });
  await context.unroute('**/api/chat'); // keep generic route; override chat with 429
  await context.route(PLATFORM + '/api/chat', r => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': SHOP, 'access-control-allow-headers': 'content-type' } }) : (st.posts.push(1), r.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': SHOP }, body: '{"error":"ai_daily_limit","turnNotProcessed":true,"message":"Daily limit."}' })));
  await page.waitForTimeout(300); await page.click('#mcDesk .l'); await page.waitForTimeout(150); await page.fill('#mcDesk textarea', 'hello'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const r0 = st.reads.length; await page.evaluate(() => window.dispatchEvent(new Event('online'))); await page.click('#mcDesk .x'); await page.click('#mcDesk .l'); await page.waitForTimeout(6000);
  d.readsBefore = r0; d.readsAfter = st.reads.length; d.posts = st.posts.length; d.composerDisabled = await page.evaluate(() => document.querySelector('#mcDesk textarea').disabled);
  await context.close();
});

// P5: aria-modal truth. While open: is host content inert / still reachable by pointer and AT?
await probe('aria-modal-vs-inert', async d => {
  const { context, page } = await ctx({ config: () => ({ body: AVAIL }) });
  await page.waitForTimeout(300); await page.click('#mcDesk .l'); await page.waitForTimeout(150);
  d.ariaModal = await page.getAttribute('#mcDesk .p', 'aria-modal');
  d.hostInert = await page.evaluate(() => Array.from(document.body.children).filter(n => n.id !== 'mcDesk' && n.tagName !== 'SCRIPT').map(n => n.inert));
  await page.click('#hin'); d.hostInputClickable = (await active(page)) === 'hin';
  await page.keyboard.type('abc'); d.hostInputValue = await page.inputValue('#hin');
  d.panelStillOpen = await page.evaluate(() => document.getElementById('mcDesk').classList.contains('open'));
  // Tab from host input while chat open: where does it go? (root listener only sees keys inside root)
  await page.keyboard.press('Tab'); d.tabFromHostWhileOpen = await active(page);
  const snap = await page.accessibility?.snapshot?.({ interestingOnly: true }).catch(() => null); d.axHasHostLink = snap ? JSON.stringify(snap).includes('Services') : 'n/a';
  await context.close();
});

// P6: live-region announcements per reply and per failure.
await probe('live-region-count', async d => {
  const { context, page } = await ctx({ config: () => ({ body: AVAIL }) });
  await page.waitForTimeout(300); await page.click('#mcDesk .l'); await page.waitForTimeout(150);
  await page.evaluate(() => { window.ann = []; const live = Array.from(document.querySelectorAll('#mcDesk [role=status],#mcDesk [aria-live]'));
    new MutationObserver(ms => ms.forEach(m => { const el = m.target.nodeType === 3 ? m.target.parentNode : m.target; const lr = el.closest('[role=status],[aria-live],[role=log],[role=alert]'); if (lr) ann.push({ cls: lr.className, text: lr.textContent.slice(0, 60) }); })).observe(document.getElementById('mcDesk'), { subtree: true, childList: true, characterData: true });
    window.liveRegions = live.map(n => n.className + ':' + n.tagName); });
  await page.fill('#mcDesk textarea', 'Need AC repair'); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  d.liveRegions = await page.evaluate(() => liveRegions); d.mutations = await page.evaluate(() => ann.filter(a => a.text));
  d.listRole = await page.evaluate(() => document.querySelector('#mcDesk .m').getAttribute('role') + '/' + document.querySelector('#mcDesk .m').getAttribute('aria-live'));
  await context.close();
});

// P7: visualViewport handlers while closed: style writes?
await probe('visualviewport-closed', async d => {
  const { context, page } = await ctx({ config: () => ({ body: AVAIL }), phone: true });
  await page.waitForTimeout(300);
  d.writes = await page.evaluate(async () => { let n = 0; new MutationObserver(ms => { n += ms.length; }).observe(document.getElementById('mcDesk'), { attributes: true, attributeFilter: ['style'] });
    for (let i = 0; i < 50; i++) { visualViewport.dispatchEvent(new Event('resize')); visualViewport.dispatchEvent(new Event('scroll')); } await new Promise(r => setTimeout(r, 50)); return n; });
  d.styleAttr = await page.evaluate(() => document.getElementById('mcDesk').getAttribute('style'));
  await context.close();
});

// P8: Esc with focus on host element while chat open: does the widget close / prevent host Esc?
await probe('esc-from-host-while-open', async d => {
  const { context, page } = await ctx({ config: () => ({ body: AVAIL }) });
  await page.waitForTimeout(300); await page.click('#mcDesk .l'); await page.waitForTimeout(150); await page.keyboard.press('Escape');
  d.escInsideReturnsTo = await active(page); d.escInsidePrevented = (await page.evaluate(() => hostLog)).slice(-1)[0];
  await context.close();
});

writeFileSync(output, JSON.stringify(report, null, 2));
await browser.close();
console.log('wrote', output, 'forbidden', report.forbidden.length, 'pageErrors', report.pageErrors.length);
