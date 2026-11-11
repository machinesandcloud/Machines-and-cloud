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

// P11: user presses Stop (window.stop) while setup is opening: stuck?
await run('stop-during-nav', async (row, page) => {
  row.onboard = 'slow';
  await fill(page, { name: 'Probe Owner', email: 'p11@example.test', business: 'P11 Biz' });
  await page.evaluate(() => { const s = document.getElementById('intake-status'); new MutationObserver((_, o) => { if (!/^Saved/.test(s.textContent)) return; o.disconnect(); setTimeout(() => window.stop(), 0); }).observe(s, { childList: true, subtree: true, characterData: true }); });
  await page.click('#intake-submit'); await page.waitForTimeout(2500);
  row.after = await page.evaluate(() => ({ path: location.pathname, status: document.getElementById('intake-status').textContent, disabled: document.getElementById('intake-submit').disabled, link: !!document.querySelector('#intake-status a') }));
  await page.click('#intake-submit', { force: true, timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500);
  row.afterClick = { posts: row.posts.length, path: await page.evaluate(() => location.pathname) };
});
// P12: synthetic bfcache restore (persisted pageshow) after success, then resubmit unchanged and then edited.
await run('synthetic-bfcache-resubmit', async (row, page) => {
  row.onboard = '204'; const v = { name: 'Probe Owner', email: 'p12@example.test', business: 'P12 Biz' }; await fill(page, v);
  await page.click('#intake-submit'); await page.waitForFunction(() => /^Saved/.test(document.getElementById('intake-status').textContent)); await page.waitForTimeout(500);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  row.restored = await page.evaluate(() => ({ disabled: document.getElementById('intake-submit').disabled, status: document.getElementById('intake-status').textContent }));
  await page.click('#intake-submit'); await page.waitForFunction(() => /^Saved/.test(document.getElementById('intake-status').textContent)); await page.waitForTimeout(300);
  row.unchanged = { ids: new Set(row.posts).size, db: await db(v.email) };
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.fill('#intake-business', 'P12 Edited'); await page.click('#intake-submit'); await page.waitForFunction(() => /^Saved/.test(document.getElementById('intake-status').textContent)); await page.waitForTimeout(300);
  row.edited = { ids: new Set(row.posts).size, db: await db(v.email) };
});
// P13: announcements. Count live-region text changes + focus moves on the status during a lost response.
await run('announce-trace', async (row, page) => {
  row.faults = ['after']; await fill(page, { name: 'Probe Owner', email: 'p13@example.test', business: 'P13 Biz' });
  await page.evaluate(() => { window.__t = []; const s = document.getElementById('intake-status'); new MutationObserver(() => __t.push('text:' + s.textContent.slice(0, 30))).observe(s, { childList: true, subtree: true, characterData: true }); s.addEventListener('focus', () => __t.push('focus')); });
  await page.click('#intake-submit'); await settle(page); row.trace = await page.evaluate(() => __t);
  const cdp = await page.context().newCDPSession(page); const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const st = nodes.find(n => n.role?.value === 'status'); row.statusAX = st ? { role: st.role.value, name: st.name?.value, focusable: st.properties?.find(p => p.name === 'focusable')?.value?.value, live: st.properties?.find(p => p.name === 'live')?.value?.value } : null;
});
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 1));
