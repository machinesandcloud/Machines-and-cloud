// Independent QA probe (read-only on product files). Fixture responses only; no handler, no network.
// Usage (worktree root): node qa-artifacts/claude-collaboration/sales-widget/qa/qa-probe.mjs --widget base|worktree --output scratchpad/claude-sales-qa-probe-<x>.json
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const output = arg('--output'), mode = arg('--widget') || 'worktree';
if (!/^scratchpad\/claude-sales-qa-[\w-]+\.json$/.test(output || '') || existsSync(output)) throw new Error('bad --output');
const root = resolve('.'), origin = 'http://127.0.0.1:8948';
const widget = mode === 'base' ? execFileSync('git', ['show', 'dfb0ae78:agent-widget.js']) : readFileSync('agent-widget.js');
const headers = readFileSync('_headers', 'utf8'), CSP = headers.match(/^\/index\.html\n\s+Content-Security-Policy: (.+)$/m)[1];
const pw = await import(pathToFileURL('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs').href);
const browser = await pw.chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--no-first-run', '--disable-sync', '--disable-component-update'] });
const report = { at: new Date().toISOString(), widget: mode, widgetSha: createHash('sha256').update(widget).digest('hex'), csp: CSP, checks: [], external: [] };
const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + name); };
const TAIL = 'TAIL-MARKER-END-OF-LONG-REPLY';
const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}: a home-service shop can answer pricing, coverage and scheduling questions from saved details.`).join('\n\n') + '\n\n' + TAIL;
const ndjson = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
const DEV = { phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, desktop: { viewport: { width: 1440, height: 900 } }, touchLaptop: { viewport: { width: 1440, height: 900 }, hasTouch: true } };

async function setup(dev, { csp = CSP, holdNext = false } = {}) {
  const ctx = await browser.newContext({ ...DEV[dev], serviceWorkers: 'block', reducedMotion: 'reduce' });
  const x = { ctx, holds: [], plan: [] };
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); window.__ann = []; const start = () => { const a = document.getElementById('mcAgentAnnounce'); if (!a) return setTimeout(start, 20); new MutationObserver(() => window.__ann.push(a.textContent)).observe(a, { childList: true, characterData: true, subtree: true }); }; document.addEventListener('DOMContentLoaded', start); });
  await ctx.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) { report.external.push(u.origin); return route.abort('blockedbyclient'); }
    if (u.pathname === '/api/chat') { const step = x.plan.shift() || { rows: [{ t: 'done', reply: 'Short answer.', events: [] }] }; if (step.hold) await new Promise(r => x.holds.push(r)); return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(step.rows) }).catch(() => {}); }
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, body: '{}' });
    if (u.pathname === '/agent-widget.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: widget });
    let f = resolve(root, u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
    if (!f.startsWith(root + '/') || !existsSync(f) || statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' }[extname(f)] || 'application/octet-stream';
    return route.fulfill({ status: 200, headers: { 'content-type': type, ...(type === 'text/html' && csp ? { 'content-security-policy': csp } : {}) }, body: readFileSync(f) });
  });
  const page = await ctx.newPage(); x.page = page;
  await page.goto(origin + '/', { waitUntil: 'load' }); await page.locator('#mcAgentLauncher').waitFor({ state: 'attached' });
  x.open = async () => { await page.locator('#mcAgentLauncher').focus(); await page.keyboard.press('Enter'); await page.locator('#mcAgentPanel').waitFor({ state: 'visible' }); await page.waitForTimeout(60); };
  x.idle = () => page.waitForFunction(() => document.querySelector('#mcAgentStop').hidden, undefined, { timeout: 10000 });
  x.busy = () => page.waitForFunction(() => !document.querySelector('#mcAgentStop').hidden, undefined, { timeout: 5000 });
  x.active = () => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName));
  return x;
}

try {
  // 1. CSP from _headers: injected <style> applies, no violation, injected once.
  { const x = await setup('phone'); const { page } = x; await x.open();
    const r = await page.evaluate(() => ({ styles: document.querySelectorAll('#mcAgentStyle').length, closeH: document.getElementById('mcAgentClose').getBoundingClientRect().height, font: getComputedStyle(document.getElementById('mcAgentInput')).fontSize, ph: getComputedStyle(document.getElementById('mcAgentInput'), '::placeholder').color, csp: window.__csp }));
    check('CSP(_headers /index.html): no violation and injected style is applied (close 44px, 16px composer, placeholder #5d6b82)', r.csp.length === 0 && r.styles === 1 && r.closeH >= 44 && r.font === '16px' && r.ph === 'rgb(93, 107, 130)', r);
    // Re-run the script: guard must prevent a second style/root.
    await page.addScriptTag({ url: '/agent-widget.js' }); await page.waitForTimeout(100);
    const again = await page.evaluate(() => ({ styles: document.querySelectorAll('#mcAgentStyle').length, roots: document.querySelectorAll('#mcAgent').length }));
    check('style and root injected exactly once even if the script loads twice', again.styles === 1 && again.roots === 1, again);
    await x.ctx.close(); }
  // 1b. Hypothetical strict CSP (style-src 'self'): documents the dependency on no style-src.
  { const x = await setup('phone', { csp: "default-src 'self'; style-src 'self'" }); const { page } = x; await x.open();
    const r = await page.evaluate(() => ({ csp: window.__csp, closeH: document.getElementById('mcAgentClose').getBoundingClientRect().height }));
    report.strictCspObservation = r; console.log('INFO strict style-src self:', JSON.stringify(r)); await x.ctx.close(); }
  // 2. Long reply: announcement capped; full text remains in a labelled, navigable region; history not re-announced.
  { const x = await setup('desktop'); const { page } = x; await x.open(); await page.evaluate(() => { window.__ann.length = 0; });
    x.plan.push({ rows: [{ t: 'delta', text: 'Paragraph 1' }, { t: 'done', reply: long, events: [] }] });
    await page.locator('#mcAgentInput').fill('Long one please'); await page.locator('#mcAgentInput').press('Enter'); await x.idle(); await page.waitForTimeout(100);
    const r = await page.evaluate(() => { const a = document.getElementById('mcAgentAnnounce'), m = document.getElementById('mcAgentMessages'); return { annLen: a.textContent.length, annTail: a.textContent.slice(-60), annRole: a.getAttribute('role'), annLive: a.getAttribute('aria-live'), anns: window.__ann.slice(), logRole: m.getAttribute('role'), logLabel: m.getAttribute('aria-label'), logLive: m.getAttribute('aria-live'), tailInDom: m.textContent.includes('TAIL-MARKER-END-OF-LONG-REPLY'), scrollable: m.scrollHeight > m.clientHeight, tabindex: m.getAttribute('tabindex') }; });
    const snap = await page.locator('#mcAgentMessages').ariaSnapshot();
    const finals = r.anns.filter(t => /^Front desk replied/.test(t));
    check('long reply: announcement capped near 1,500 chars and says where the rest is', finals.length === 1 && r.annLen <= 1600 && /full reply is in the conversation/i.test(r.annTail), { annLen: r.annLen, annTail: r.annTail, count: finals.length });
    check('long reply: tail of reply is in the conversation and in the accessibility tree (labelled region)', r.tailInDom && snap.includes('TAIL-MARKER') && r.logRole === 'region' && r.logLabel === 'Conversation' && !r.logLive, { ...r, anns: r.anns.map(t => t.slice(0, 60)), snapHasTail: snap.includes('TAIL-MARKER') });
    report.longScrollableNoTabindex = { scrollable: r.scrollable, tabindex: r.tabindex };
    await page.reload(); await page.locator('#mcAgentLauncher').waitFor({ state: 'attached' }); await x.open(); await page.waitForTimeout(150);
    const re = await page.evaluate(() => ({ ann: document.getElementById('mcAgentAnnounce').textContent, anns: window.__ann.slice(), tail: document.getElementById('mcAgentMessages').textContent.includes('TAIL-MARKER') }));
    check('reopen after reload: history restored silently (announcer empty) and full reply still readable', re.tail && !re.anns.some(t => t.includes('Paragraph')) && !re.ann.includes('Paragraph'), re);
    await x.ctx.close(); }
  // 3. Touch detection: keyboard Send via Tab+Enter; where focus lands after reply.
  for (const dev of ['desktop', 'touchLaptop', 'phone']) {
    const x = await setup(dev); const { page } = x; await x.open();
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    x.plan.push({ hold: true, rows: [{ t: 'done', reply: 'Done.', events: [] }] });
    await page.locator('#mcAgentInput').fill('Hi'); await page.keyboard.press('Tab'); const onSend = await x.active(); await page.keyboard.press('Enter'); await x.busy(); const during = await x.active();
    x.holds.shift()(); await x.idle(); await page.waitForTimeout(60); const after = await x.active();
    const want = coarse ? 'mcAgentSend' : 'mcAgentInput';
    check(`${dev} (pointer coarse=${coarse}): keyboard Send -> Stop while waiting -> ${want} after reply`, onSend === 'mcAgentSend' && during === 'mcAgentStop' && after === want, { onSend, during, after });
    await x.ctx.close();
  }
  // 4. Visitor clicks into reply text (focus to body) while waiting: is focus pulled to the composer?
  { const x = await setup('desktop'); const { page } = x; await x.open();
    x.plan.push({ hold: true, rows: [{ t: 'done', reply: 'Done.', events: [] }] });
    await page.locator('#mcAgentInput').fill('Hi'); await page.locator('#mcAgentInput').press('Enter'); await x.busy();
    await page.locator('.mc-agent-messages').click({ position: { x: 20, y: 20 } });
    await page.evaluate(() => { const b = document.querySelector('.mc-agent-messages .mc-agent-msg, .mc-agent-messages p, .mc-agent-messages div'); const r = document.createRange(); r.selectNodeContents(b); getSelection().removeAllRanges(); getSelection().addRange(r); });
    const before = await x.active(), selBefore = await page.evaluate(() => getSelection().toString().length);
    x.holds.shift()(); await x.idle(); await page.waitForTimeout(60); const after = await x.active(), selAfter = await page.evaluate(() => getSelection().toString().length);
    report.clickIntoLogObservation = { before, after, selBefore, selAfter }; console.log('INFO click into log + select text, then reply:', JSON.stringify(report.clickIntoLogObservation));
    await x.ctx.close(); }
  // 5. Slow-reply then failure: announcements each once.
  { const x = await setup('desktop'); const { page } = x; await page.clock.install(); await page.reload(); await page.locator('#mcAgentLauncher').waitFor({ state: 'attached' }); await x.open(); await page.evaluate(() => { window.__ann.length = 0; });
    x.plan.push({ hold: true, rows: [{ t: 'done', reply: 'Late but here.', events: [] }] });
    await page.locator('#mcAgentInput').fill('Slow'); await page.locator('#mcAgentInput').press('Enter'); await x.busy();
    await page.clock.fastForward(16000); x.holds.shift()(); await x.idle(); await page.waitForTimeout(50);
    const anns = await page.evaluate(() => window.__ann.slice());
    const c = re => anns.filter(t => re.test(t)).length;
    check('working / still working / final each announced exactly once', c(/^Working/) === 1 && c(/^Still working/) === 1 && c(/^Front desk replied: Late but here/) === 1, anns);
    await x.ctx.close(); }
} finally {
  await browser.close();
  report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length;
  writeFileSync(output, JSON.stringify(report, null, 2)); console.log(`${report.passed}/${report.total} (${mode}) external=${report.external.length} -> ${output}`);
}
