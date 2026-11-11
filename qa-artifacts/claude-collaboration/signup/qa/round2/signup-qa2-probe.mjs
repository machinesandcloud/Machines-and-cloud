// Independent QA probe. Run with cwd = worktree root. Actual intake handler in-process, memory store, no network.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.'), base = 'http://127.0.0.1:8894';
const out = process.argv[2];
if (!out || existsSync(out)) throw new Error('need new output path');
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|ADMIN_KEY|SITE_ORIGINS|DEPLOY_PRIME_URL|NETLIFY_)/.test(key)) delete process.env[key];
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = base;
const blockedServer = []; globalThis.fetch = async i => { blockedServer.push(String(i?.url || i)); throw new Error('denied'); };
const store = await import(root + '/netlify/functions/lib/store.mjs');
const { accountKey } = await import(root + '/netlify/functions/lib/accounts.mjs');
const intake = (await import(root + '/netlify/functions/intake.mjs')).default;
const sha = v => createHash('sha256').update(v).digest('hex');
const report = { at: new Date().toISOString(), signupJs: sha(readFileSync('signup-intake.js')), probes: {}, blockedBrowser: [], blockedServer, pageErrors: [] };
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let ipn = 50;
async function ctx(row) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const ip = '203.0.113.' + (ipn++);
  row.posts = []; row.statuses = [];
  await context.route('**/*', async route => {
    const r = route.request(), url = new URL(r.url());
    if (url.origin !== base) { report.blockedBrowser.push(url.href); return route.abort('blockedbyclient'); }
    if (url.pathname === '/api/intake') {
      const body = r.postDataJSON(); row.posts.push(body.submissionId);
      const fault = row.faults?.shift();
      if (fault === 'before') { row.statuses.push('lost-before'); return route.abort('connectionfailed'); }
      const res = await intake(new Request(url, { method: 'POST', headers: r.headers(), body: r.postData() }), { ip });
      const bytes = Buffer.from(await res.arrayBuffer()); row.statuses.push(res.status + (fault ? '-' + fault : ''));
      if (fault === 'after') return route.abort('connectionfailed');
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: bytes });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa"}' });
    if (url.pathname === '/onboard.html' && row.onboard === '204') return route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/onboard.html' && row.onboard === 'slow') { await new Promise(d => setTimeout(d, 1500)); }
    if (url.pathname === '/onboard.html' && row.onboard === 'abort') return route.abort('connectionfailed');
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, ''), p = resolve(root, rel);
    if (rel.split('/').some(x => x.startsWith('.')) || !p.startsWith(root + '/') || !existsSync(p) || statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' })[extname(p)] || 'application/octet-stream', body: readFileSync(p) });
  });
  const page = await context.newPage(); page.on('pageerror', e => report.pageErrors.push(row.name + ': ' + e.message));
  await page.goto(base + '/#pilot'); await page.locator('#signup-intake').waitFor();
  return { context, page };
}
const state = page => page.evaluate(() => { const s = document.getElementById('intake-status'); return { status: s.textContent, focusStatus: document.activeElement === s, button: !document.getElementById('intake-submit').disabled, path: location.pathname }; });
const settle = page => page.waitForFunction(() => !document.getElementById('intake-submit').disabled && document.getElementById('intake-status').classList.contains('is-error'), null, { timeout: 30000 });
const fill = async (page, v) => { await page.fill('#intake-name', v.name); await page.fill('#intake-email', v.email); await page.fill('#intake-business', v.business); };
const db = async email => {
  const handoffs = []; for (const k of await store.list('intake_handoffs', '')) { const h = await store.get('intake_handoffs', k); if (h?.email === email) handoffs.push(h.fields.business); }
  const p = await store.get('prospects', accountKey(email));
  return { handoffs, prospectBusiness: p?.business ?? null, emailRate: (await store.get('intake_rate', 'email:' + accountKey(email)))?.count ?? 0 };
};
async function run(name, fn) { const row = { name }; report.probes[name] = row; let c; try { c = await ctx(row); await fn(row, c.page); } catch (e) { row.fatal = String(e.stack || e).split('\n').slice(0, 3).join(' | '); } finally { await c?.context.close().catch(() => {}); } }

const subCount = async () => (await store.list('intake_submissions', '')).length;
const ax = async page => {
  const cdp = await page.context().newCDPSession(page); const { root: d } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: d.nodeId, selector: '#intake-status' });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false }); const n = nodes[0];
  await cdp.detach(); return { role: n.role?.value, live: n.properties?.find(p => p.name === 'live')?.value?.value ?? null, ignored: n.ignored };
};
const trace = page => page.evaluate(() => { window.__t = []; const s = document.getElementById('intake-status'), nx = document.getElementById('intake-next');
  new MutationObserver(ms => { for (const m of ms) __t.push({ kind: m.type, attr: m.attributeName || undefined, text: s.textContent.slice(0, 28), role: s.getAttribute('role'), live: s.getAttribute('aria-live') }); }).observe(s, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['role', 'aria-live'] });
  new MutationObserver(() => __t.push({ kind: 'next', hidden: nx.hidden, html: nx.innerHTML.slice(0, 120) })).observe(nx, { childList: true, attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('focusin', e => __t.push({ kind: 'focus', el: e.target.id || e.target.tagName })); });
const look = page => page.evaluate(() => { const s = document.getElementById('intake-status'), nx = document.getElementById('intake-next'), a = nx.querySelector('a');
  return { status: s.textContent, error: s.classList.contains('is-error'), role: s.getAttribute('role'), live: s.getAttribute('aria-live'), focus: document.activeElement.id || document.activeElement.tagName, nextHidden: nx.hidden, nextHref: a?.getAttribute('href') || null, disabled: document.getElementById('intake-submit').disabled, path: location.pathname }; });

// Q1: X lost-after, Y lost-after, revert to X: X's id reused, no new rate spend, one handoff per answer set.
await run('revert-after-two-losses', async (row, page) => {
  const v = { name: 'Q Owner', email: 'q1@example.test', business: 'Q1 X' }; await fill(page, v);
  row.faults = ['after', 'after']; await page.click('#intake-submit'); await settle(page);
  await page.fill('#intake-business', 'Q1 Y'); await page.click('#intake-submit'); await settle(page); row.afterY = await look(page);
  await page.fill('#intake-business', 'Q1 X'); await page.click('#intake-submit'); await page.waitForURL('**/onboard.html');
  row.final = { postsEqXfirst: row.posts[2] === row.posts[0], ids: new Set(row.posts).size, statuses: row.statuses, db: await db(v.email), submissions: await subCount() };
});
// Q2: whitespace and email case variants of the same answers.
await run('whitespace-and-case', async (row, page) => {
  await fill(page, { name: 'Q Owner', email: 'q2@example.test', business: 'Q2 Biz' });
  row.faults = ['after', 'after']; await page.click('#intake-submit'); await settle(page);
  await fill(page, { name: '  Q Owner ', email: ' q2@example.test ', business: 'Q2 Biz  ' }); await page.click('#intake-submit'); await settle(page);
  await page.fill('#intake-email', 'Q2@Example.TEST'); await page.click('#intake-submit'); await page.waitForURL('**/onboard.html');
  row.final = { wsSameId: row.posts[1] === row.posts[0], caseSameId: row.posts[2] === row.posts[0], statuses: row.statuses, db: await db('q2@example.test'), submissions: await subCount() };
});
// Q3: 410 for X, then edit to Y, then revert to X: X must not reuse the expired id.
await run('expired-then-revert', async (row, page) => {
  const v = { name: 'Q Owner', email: 'q3@example.test', business: 'Q3 X' }; await fill(page, v);
  row.faults = ['after']; await page.click('#intake-submit'); await settle(page);
  const key = sha(row.posts[0].toLowerCase()), sub = await store.get('intake_submissions', key); await store.put('intake_submissions', key, { ...sub, expiresAt: new Date(Date.now() - 1000).toISOString() });
  await page.click('#intake-submit'); await settle(page); row.expired = await look(page);
  row.faults = ['after']; await page.fill('#intake-business', 'Q3 Y'); await page.click('#intake-submit'); await settle(page);
  await page.fill('#intake-business', 'Q3 X'); await page.click('#intake-submit'); await page.waitForURL('**/onboard.html');
  row.final = { ids: row.posts.map(p => p.slice(0, 8)), statuses: row.statuses, revertReusedExpired: row.posts[3] === row.posts[0] };
});
// Q4: live-region DOM sequence across lost -> retry lost -> retry success (nav 204 so the page stays), then edit attempts.
await run('live-sequence-and-next', async (row, page) => {
  row.onboard = '204'; await fill(page, { name: 'Q Owner', email: 'q4@example.test', business: 'Q4 Biz' }); await trace(page);
  row.faults = ['after', 'before']; await page.click('#intake-submit'); await settle(page); row.err1 = { ...(await look(page)), ax: await ax(page) };
  await page.click('#intake-submit'); await settle(page); row.err2 = { ...(await look(page)), ax: await ax(page) };
  await page.click('#intake-submit'); await page.waitForFunction(() => /^Saved/.test(document.getElementById('intake-status').textContent)); await page.waitForTimeout(400);
  row.success = { ...(await look(page)), ax: await ax(page), handoff: JSON.parse(await page.evaluate(() => sessionStorage.getItem('mc-signup-intake-v1'))).handoff };
  row.linkMatchesHandoff = row.success.nextHref?.endsWith('#intake=' + row.success.handoff);
  row.trace = await page.evaluate(() => __t);
  // Edit after success while the page is still here: what happens?
  const n = row.posts.length; await page.fill('#intake-business', 'Q4 Edited'); await page.press('#intake-business', 'Enter'); await page.waitForTimeout(500);
  row.editAfterSuccess = { ...(await look(page)), newPosts: row.posts.length - n };
  // Synthetic bfcache restore: stale link cleared? then a failing submission: link absent.
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); row.restored = await look(page);
  row.faults = ['after']; await page.evaluate(() => document.getElementById('intake-submit').click()); await settle(page); row.afterRestoreErr = { ...(await look(page)), ax: await ax(page) };
});
// Q5: server invalid_email then retry Saving: status live restored before text, field error placement.
await run('invalid-email-then-retry', async (row, page) => {
  row.onboard = '204'; await fill(page, { name: 'Q Owner', email: 'q5@localhost', business: 'Q5 Biz' }); await trace(page);
  await page.click('#intake-submit'); await page.waitForFunction(() => document.getElementById('intake-email').getAttribute('aria-invalid') === 'true');
  row.after = { ...(await look(page)), ax: await ax(page), field: await page.evaluate(() => { const e = document.getElementById('intake-email'); return { desc: e.getAttribute('aria-describedby'), text: document.getElementById('intake-email-error')?.textContent }; }) };
  await page.fill('#intake-email', 'q5@example.test'); row.clearedOnInput = await page.evaluate(() => document.getElementById('intake-email').getAttribute('aria-invalid'));
  await page.click('#intake-submit'); await page.waitForFunction(() => /^Saved/.test(document.getElementById('intake-status').textContent)); row.success = await look(page);
  row.trace = await page.evaluate(() => __t);
});
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 1));
