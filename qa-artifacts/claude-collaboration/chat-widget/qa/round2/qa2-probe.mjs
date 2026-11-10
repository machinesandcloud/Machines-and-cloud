// Round-2 independent QA probe for embed.js (run from worktree root):
//   node qa-artifacts/claude-collaboration/chat-widget/qa/round2/qa2-probe.mjs --embed <path> --output scratchpad/claude-widget-qa2-<name>.json
// Scripted /api/client + /api/chat at the Playwright route boundary; everything else aborted. Offline. Temp profile.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const output = arg('--output'), embedPath = resolve(arg('--embed') || 'embed.js'), only = arg('--only');
if (!/^scratchpad\/claude-widget-qa2-[\w-]+\.json$/.test(output || '')) throw new Error('bad --output');
if (existsSync(output)) throw new Error('exists');
mkdirSync('scratchpad', { recursive: true });
const src = readFileSync(embedPath), srcText = src.toString();
const report = { embed: embedPath, sha256: createHash('sha256').update(src).digest('hex'), probes: [], forbidden: [], pageErrors: [] };
const pw = await import(pathToFileURL('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs').href);
const browser = await pw.chromium.launch({ executablePath: '/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND', '--disable-background-networking'] });
const PLATFORM = 'https://platform.fixture.test', SHOP = 'https://fixture-shop.example.com';
const host = () => '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="height:3000px">' +
  '<a href="#a" id="h1">Services</a> <input id="hin"> <p id="txt">Plain host text to click on.</p>' +
  '<div id="sh"></div><iframe id="fr" srcdoc="<input id=fin>" style="width:200px;height:60px"></iframe> <a href="#z" id="h2">Contact</a>' +
  '<script>window.hostLog=[];document.addEventListener("keydown",function(e){hostLog.push({key:e.key,prevented:e.defaultPrevented});});' +
  'var s=document.getElementById("sh").attachShadow({mode:"open"});s.innerHTML="<input id=sin>";</script>' +
  '<script src="' + PLATFORM + '/embed.js" data-client="shop" async></script></body></html>';
const AVAIL = { name: 'Fixture Air', greeting: 'Hi!', webAvailable: true, status: 'live' };
async function ctx({ config, phone = false, chatDelay = 0, clock = false }) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
  if (clock) await context.clock.install({ time: new Date('2026-11-10T12:00:00Z') });
  const st = { reads: [], posts: [] };
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin === SHOP && u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: host() });
    if (u.origin === PLATFORM && u.pathname === '/embed.js') return route.fulfill({ contentType: 'text/javascript', body: src });
    const cors = { 'access-control-allow-origin': SHOP, 'access-control-allow-headers': 'content-type', 'access-control-expose-headers': 'Retry-After' };
    if (u.origin === PLATFORM && u.pathname === '/api/client') {
      const n = st.reads.length; st.reads.push(Date.now()); const r = config(n);
      if (r === 'abort') return route.abort('connectionfailed');
      return route.fulfill({ status: r.status || 200, contentType: 'application/json', headers: { ...cors, ...(r.headers || {}) }, body: JSON.stringify(r.body || {}) });
    }
    if (u.origin === PLATFORM && u.pathname === '/api/chat') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      st.posts.push(route.request().postData());
      if (chatDelay) await new Promise(r => setTimeout(r, chatDelay));
      const reply = 'Thanks, we have your details.';
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
  report.probes.push(rec); console.log((rec.ok ? 'DONE ' : 'ERR  ') + name + ' ' + JSON.stringify(rec.data).slice(0, 1500) + (rec.error ? ' ' + rec.error : ''));
}
const active = p => p.evaluate(() => { let a = document.activeElement; if (a && a.shadowRoot && a.shadowRoot.activeElement) return 'shadow:' + a.shadowRoot.activeElement.id; if (a && a.tagName === 'IFRAME') { const i = a.contentDocument && a.contentDocument.activeElement; return 'iframe:' + (i && (i.id || i.tagName)); } return a ? (a.id || a.className || a.tagName) : null; });
const cfgState = p => p.evaluate(() => { const r = document.querySelector('#mcDesk .cfg'), b = r.querySelector('button'); return { hidden: r.hidden, text: r.querySelector('p').textContent, ariaDisabled: b.getAttribute('aria-disabled'), inputDisabled: document.querySelector('#mcDesk textarea').disabled, greeting: document.querySelector('#mcDesk .m .b') && document.querySelector('#mcDesk .m .b').textContent }; });
const tick = async (page, ms) => { await page.clock.runFor(ms); await page.waitForTimeout(80); };

// A. Retry-After parsing, evaluated on the exact function source from the embed.
await probe('retry-after-parse', async d => {
  const m = srcText.match(/function retryAfterMs\(value\)\{[^\n]*?\}(?=\n|  function)/) || srcText.match(/function retryAfterMs\(value\)\{.*?return Math\.min\(600000,Math\.max\(30000,isFinite\(seconds\)\?seconds\*1000:60000\)\);\}/);
  if (!m) throw new Error('retryAfterMs not found');
  const f = new Function(m[0] + ';return retryAfterMs;')();
  const now = Date.now();
  const cases = { missing: null, empty: '', zero: '0', neg: '-5', frac: '1.5', spaced: ' 120', big: '99999999999999999999', huge: '1e400', s120: '120', s45: '45', garbage: 'soon', dateFuture2m: new Date(now + 120000).toUTCString(), datePast: new Date(now - 3600000).toUTCString(), dateFar: new Date(now + 86400000 * 365).toUTCString(), year: '2027' };
  for (const [k, v] of Object.entries(cases)) d[k] = Math.round(f(v) / 1000);
});

// B. Persistent 429 (Retry-After 600) while open: when does reading stop, and what does the customer see afterwards?
await probe('429-exhaustion-strand', async d => {
  const { context, page, st } = await ctx({ clock: true, config: () => ({ status: 429, headers: { 'Retry-After': '600' } }) });
  await tick(page, 500); d.readsBeforeOpen = st.reads.length;
  await page.click('#mcDesk .l'); await tick(page, 200);
  d.afterOpen = { reads: st.reads.length, ...(await cfgState(page)) };
  const timeline = [];
  for (let min = 1; min <= 70; min++) { await tick(page, 60000); timeline.push(st.reads.length); }
  d.readsPerMinute = timeline;
  d.at70min = { reads: st.reads.length, ...(await cfgState(page)) };
  // does it come back by itself after a much longer wait?
  await tick(page, 3600000); d.after2h = { reads: st.reads.length, ...(await cfgState(page)) };
  // close/open again (open triggers a read if allowed)
  // keyboard activation of the aria-disabled button long after Retry-After expired
  await page.focus('#mcDesk .cfg button'); await page.keyboard.press('Enter'); await tick(page, 300); d.afterKeyboardEnter = { reads: st.reads.length, ...(await cfgState(page)) };
  await page.click('#mcDesk .x'); await page.click('#mcDesk .l'); await tick(page, 6000); d.afterReopen = { reads: st.reads.length, ...(await cfgState(page)) };
  await context.close();
});

// C. 429 then the server recovers: customer clicks the (aria-disabled) button during back-off.
await probe('429-button-during-backoff', async d => {
  let ok = false;
  const { context, page, st } = await ctx({ clock: true, config: () => ok ? { body: AVAIL } : { status: 429, headers: { 'Retry-After': '120' } } });
  await page.click('#mcDesk .l'); await tick(page, 300);
  d.start = { reads: st.reads.length, ...(await cfgState(page)) };
  for (let i = 0; i < 20; i++) await page.evaluate(() => document.querySelector('#mcDesk .cfg button').click());
  await tick(page, 1000); d.after20Clicks = { reads: st.reads.length, ...(await cfgState(page)) };
  ok = true; await tick(page, 125000); d.after125s = { reads: st.reads.length, ...(await cfgState(page)), active: await active(page) };
  await context.close();
});

// D. Timer leak / read amplification: 300 open/close cycles + 100 online events over 60s of failing config.
await probe('open-close-storm', async d => {
  const { context, page, st } = await ctx({ clock: true, config: () => ({ status: 503 }) });
  await page.click('#mcDesk .l'); await tick(page, 100);
  for (let s = 0; s < 60; s++) {
    for (let i = 0; i < 5; i++) { await page.evaluate(() => { document.querySelector('#mcDesk .l').click(); window.dispatchEvent(new Event('online')); }); }
    await tick(page, 1000);
  }
  d.readsIn60s = st.reads.length; d.gaps = st.reads.slice(1).map((t, i) => t - st.reads[i]);
  await tick(page, 600000); d.readsAfter10minIdle = st.reads.length;
  await context.close();
});

// E. Focus: auto-retry succeeds while focus is in host shadow DOM / host iframe / host-script-moved / host-script-blurred.
for (const where of ['shadow', 'iframe', 'hostScriptFocus', 'hostScriptBlur', 'wheelScrollHost']) {
  await probe('retry-success-focus-' + where, async d => {
    const { context, page, st } = await ctx({ config: n => n < 2 ? { status: 503 } : { body: AVAIL } });
    await page.waitForTimeout(200); await page.click('#mcDesk .l'); await page.waitForTimeout(400); // open read fails (n=1) -> auto retry ~4s
    d.readsAfterOpen = st.reads.length;
    if (st.reads.length >= 3) { d.note = 'already recovered'; }
    // customer was in panel (focus on Close)
    await page.focus('#mcDesk .x');
    if (where === 'shadow') await page.locator('#sh input').click();
    if (where === 'iframe') await page.frameLocator('#fr').locator('#fin').click();
    if (where === 'hostScriptFocus') await page.evaluate(() => document.getElementById('hin').focus());
    if (where === 'hostScriptBlur') await page.evaluate(() => document.activeElement.blur());
    if (where === 'wheelScrollHost') { await page.mouse.move(300, 300); await page.mouse.wheel(0, 800); }
    d.before = await active(page);
    await page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled, null, { timeout: 40000 });
    await page.waitForTimeout(150); d.reads = st.reads.length; d.after = await active(page); d.scrollY = await page.evaluate(() => scrollY);
    await context.close();
  });
}

// F. Focus on reply arrival: customer sends, then moves into host shadow / iframe / taps host text (phone) / wheel-scrolls.
for (const [where, phone] of [['shadow', false], ['iframe', false], ['tapText', true], ['wheel', false], ['tabOut', false]]) {
  await probe('reply-focus-' + where + (phone ? '-phone' : ''), async d => {
    const { context, page, st } = await ctx({ phone, chatDelay: 1500, config: () => ({ body: AVAIL }) });
    await page.waitForTimeout(200);
    if (phone) await page.tap('#mcDesk .l'); else await page.click('#mcDesk .l');
    await page.waitForTimeout(200); await page.fill('#mcDesk textarea', 'Need AC repair'); await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    if (where === 'shadow') await page.locator('#sh input').click();
    if (where === 'iframe') await page.frameLocator('#fr').locator('#fin').click();
    if (where === 'tapText') await page.tap('#txt');
    if (where === 'wheel') { await page.mouse.move(300, 300); await page.mouse.wheel(0, 600); }
    if (where === 'tabOut') { await page.focus('#mcDesk button.s'); await page.keyboard.press('Tab'); }
    d.before = await active(page);
    await page.waitForFunction(() => document.querySelectorAll('#mcDesk .m .b').length >= 3, null, { timeout: 10000 });
    await page.waitForTimeout(200); d.after = await active(page); d.posts = st.posts.length;
    await context.close();
  });
}

// G. Esc on host while open must not be hijacked; Esc inside closes; phone Tab order.
await probe('esc-and-tab-order', async d => {
  const { context, page } = await ctx({ phone: true, config: () => ({ body: AVAIL }) });
  await page.waitForTimeout(200); await page.tap('#mcDesk .l'); await page.waitForTimeout(150);
  d.role = await page.evaluate(() => { const p = document.querySelector('#mcDesk .p'); return { role: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), label: p.getAttribute('aria-label'), inertAny: !!document.querySelector('[inert]') }; });
  d.focusOnOpen = await active(page);
  await page.focus('#mcDesk .x'); const order = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); order.push(await active(page)); }
  d.tabOrderFromClose = order;
  await page.focus('#hin'); await page.keyboard.press('Escape');
  d.hostEsc = { open: await page.evaluate(() => document.getElementById('mcDesk').classList.contains('open')), log: await page.evaluate(() => hostLog.slice(-1)) };
  await page.focus('#mcDesk textarea'); await page.keyboard.press('Escape');
  d.panelEsc = { open: await page.evaluate(() => document.getElementById('mcDesk').classList.contains('open')), active: await active(page) };
  await context.close();
});

writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
await browser.close();
console.log('wrote', output, 'forbidden', report.forbidden.length, 'pageErrors', report.pageErrors.length);
