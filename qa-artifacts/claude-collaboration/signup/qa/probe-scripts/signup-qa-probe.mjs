// Independent QA probe. Run with cwd = worktree root. Actual intake handler in-process, memory store, no network.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.'), base = 'http://127.0.0.1:8893';
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const ip = '198.51.100.' + (ipn++);
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

// P1: same answers, lost after commit, retried 3 times with repeated losses, then success: rate spent once, one handoff.
await run('same-answers-repeated-loss', async (row, page) => {
  const v = { name: 'Probe Owner', email: 'p1@example.test', business: 'P1 Biz' }; await fill(page, v);
  row.faults = ['after', 'after', 'after'];
  for (let i = 0; i < 3; i++) { await page.click('#intake-submit'); await settle(page); }
  row.afterLosses = { ...(await state(page)), db: await db(v.email) };
  await page.click('#intake-submit'); await page.waitForURL('**/onboard.html');
  row.final = { ids: new Set(row.posts).size, db: await db(v.email) };
});
// P2: changed answers after lost-after-commit (the copy promised no second signup).
await run('changed-answers-after-loss', async (row, page) => {
  const v = { name: 'Probe Owner', email: 'p2@example.test', business: 'P2 Original' }; await fill(page, v);
  row.faults = ['after']; await page.click('#intake-submit'); await settle(page); row.lost = await state(page);
  await page.fill('#intake-business', 'P2 Edited'); await page.click('#intake-submit'); await page.waitForURL('**/onboard.html');
  row.final = { ids: new Set(row.posts).size, db: await db(v.email), submissions: (await store.list('intake_submissions', '')).length };
});
// P3: corrected email after a lost response: two prospect rows (two leads), the typo one orphaned.
await run('changed-email-after-loss', async (row, page) => {
  const v = { name: 'Probe Owner', email: 'p3@exmaple.test', business: 'P3 Biz' }; await fill(page, v);
  row.faults = ['after']; await page.click('#intake-submit'); await settle(page);
  await page.fill('#intake-email', 'p3@example.test'); await page.click('#intake-submit'); await page.waitForURL('**/onboard.html');
  row.final = { typo: await db('p3@exmaple.test'), corrected: await db('p3@example.test') };
});
// P4: rate limit. Three edits after three lost-after-commit responses, then a fourth edit: 429 though details were saved.
await run('rate-limit-after-edits', async (row, page) => {
  const v = { name: 'Probe Owner', email: 'p4@example.test', business: 'P4 v1' }; await fill(page, v);
  row.faults = ['after', 'after', 'after'];
  for (let i = 1; i <= 3; i++) { if (i > 1) await page.fill('#intake-business', 'P4 v' + i); await page.click('#intake-submit'); await settle(page); }
  row.beforeFourth = await db(v.email);
  await page.fill('#intake-business', 'P4 v4'); await page.click('#intake-submit'); await settle(page);
  row.fourth = { ...(await state(page)), db: await db(v.email) };
  // Revert to the last committed answers (v3): same signature? No: client id was rotated, previousPayload is v4.
  await page.fill('#intake-business', 'P4 v3'); await page.click('#intake-submit'); await settle(page).catch(() => {});
  row.revert = { ...(await state(page)), statuses: row.statuses, ids: new Set(row.posts).size };
  row.rateRow = await store.get('intake_rate', 'email:' + accountKey(v.email));
});
// P5: unchanged answers after a 429 caused by an earlier tab: retry keeps the same id (no rotation).
// P6: intake_expired after a lost response: message, then the next click succeeds with a new id.
await run('expired-after-loss', async (row, page) => {
  const v = { name: 'Probe Owner', email: 'p6@example.test', business: 'P6 Biz' }; await fill(page, v);
  row.faults = ['after']; await page.click('#intake-submit'); await settle(page);
  const id = row.posts[0], key = sha(id.toLowerCase()), sub = await store.get('intake_submissions', key);
  await store.put('intake_submissions', key, { ...sub, expiresAt: new Date(Date.now() - 1000).toISOString() });
  await page.click('#intake-submit'); await settle(page); row.expired = await state(page);
  await page.click('#intake-submit'); await page.waitForURL('**/onboard.html').catch(e => row.navErr = String(e).slice(0, 120));
  row.final = { ids: new Set(row.posts).size, statuses: row.statuses, db: await db(v.email) };
});
// P7: navigation to onboard yields 204 (navigation never commits): is there a way forward?
await run('onboard-nav-204', async (row, page) => {
  row.onboard = '204'; await fill(page, { name: 'Probe Owner', email: 'p7@example.test', business: 'P7 Biz' });
  await page.click('#intake-submit'); await page.waitForFunction(() => /^Saved/.test(document.getElementById('intake-status').textContent)); await page.waitForTimeout(1500);
  row.after = await page.evaluate(() => ({ path: location.pathname, status: document.getElementById('intake-status').textContent, disabled: document.getElementById('intake-submit').disabled, linkInStatus: !!document.querySelector('#intake-status a'), handoffStored: !!sessionStorage.getItem('mc-signup-intake-v1') }));
});
// P8: navigation to onboard fails at the network: then Back.
await run('onboard-nav-abort', async (row, page) => {
  row.onboard = 'abort'; await fill(page, { name: 'Probe Owner', email: 'p8@example.test', business: 'P8 Biz' });
  await page.click('#intake-submit'); await page.waitForTimeout(2000);
  row.after = { url: page.url() };
  await page.goBack().catch(e => row.backErr = String(e).slice(0, 120)); await page.waitForTimeout(800);
  row.back = await page.evaluate(() => ({ path: location.pathname, status: document.getElementById('intake-status')?.textContent, disabled: document.getElementById('intake-submit')?.disabled, business: document.getElementById('intake-business')?.value })).catch(e => String(e).slice(0, 120));
});
// P9: bfcache Back after success, then resubmit the same answers and an edited answer.
await run('bfcache-back-resubmit', async (row, page) => {
  const v = { name: 'Probe Owner', email: 'p9@example.test', business: 'P9 Biz' }; await fill(page, v);
  await page.evaluate(() => { window.__pageshows = []; addEventListener('pageshow', e => { sessionStorage.setItem('qa-ps', (sessionStorage.getItem('qa-ps') || '') + (e.persisted ? 'P' : 'N')); }); });
  await page.click('#intake-submit'); await page.waitForURL('**/onboard.html');
  await page.goBack(); await page.waitForTimeout(800);
  row.back = await page.evaluate(() => ({ persisted: sessionStorage.getItem('qa-ps'), status: document.getElementById('intake-status').textContent, disabled: document.getElementById('intake-submit').disabled, business: document.getElementById('intake-business').value }));
  if (row.back.business !== v.business) await fill(page, v);
  await page.click('#intake-submit'); await page.waitForURL('**/onboard.html'); row.sameResubmit = { ids: new Set(row.posts).size, db: await db(v.email) };
});
// P10: invalid_email from server, then fix: error cleared? and focus target.
await run('server-invalid-email-a11y', async (row, page) => {
  await fill(page, { name: 'Probe Owner', email: 'p10@localhost', business: 'P10 Biz' });
  await page.click('#intake-submit'); await settle(page);
  row.after = await page.evaluate(() => { const e = document.getElementById('intake-email'), s = document.getElementById('intake-status'); return { status: s.textContent, role: s.getAttribute('role'), live: s.getAttribute('aria-live'), focus: document.activeElement.id, emailInvalid: e.getAttribute('aria-invalid'), desc: e.getAttribute('aria-describedby'), descText: document.getElementById('intake-email-error')?.textContent }; });
  const snap = await page.locator('#signup-intake').ariaSnapshot().catch(e => String(e)); row.ariaSnapshot = snap;
});
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 1));
