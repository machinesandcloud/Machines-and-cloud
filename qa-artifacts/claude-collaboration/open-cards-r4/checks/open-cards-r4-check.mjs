// Open cards r4 check (rev 2): PRA-OPS-06 (code part), PRA-ONB-11, PRA-POLISH-12 (brand part), PRA-POLISH-15.
// Rev 2 adds QA's qa-probe.mjs server and phone cases (F1: practice configured off) and the F2-F5 copy/state checks.
// Run from a copy root with this file beside ../../first-customer-fix/checks/fc-lib.mjs:
//   node qa-artifacts/claude-collaboration/open-cards-r4/checks/open-cards-r4-check.mjs --playwright <index.mjs> --out <new dir> [--label x]
// Actual /api/client and /api/manage handlers, memory store, fake model, physical transport denied, every
// non-loopback browser request aborted. Synthetic data only.
import { assert, launch, seed, open, route, check, finish, store, lib, handlers, origin, report, shot, noHScroll, playwrightPath, workspaceTenant, out } from '../../first-customer-fix/checks/fc-lib.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const ai = await import(lib('netlify/functions/lib/self-service-ai.mjs'));
const { houstonToday } = await import(lib('netlify/functions/lib/availability.mjs'));
const operator = await import(lib('netlify/functions/lib/operator.mjs'));
const access = await import(lib('netlify/functions/lib/access.mjs'));
const OPERATOR = 'open-cards-operator@example.test'; process.env.ADMIN_EMAILS = OPERATOR;
handlers['/api/manage'] = (await import(lib('netlify/functions/manage.mjs'))).default;
const keyOf = x => x.slug + ':' + workspaceTenant(x.c);
// global 50 (default) -> practice pool 25, customer pool 25.
async function budget(tenants) { await store.del('self_service_ai', 'daily'); if (!tenants) return; const used = Object.values(tenants).reduce((n, r) => n + r.private + r.web, 0); await store.put('self_service_ai', 'daily', { version: 1, day: houstonToday(), used, tenants }); }
const readBudget = () => store.get('self_service_ai', 'daily');
const env = async (vars, fn) => { const old = {}; for (const k in vars) { old[k] = process.env[k]; vars[k] === undefined ? delete process.env[k] : process.env[k] = vars[k]; } try { return await fn(); } finally { for (const k in old) old[k] === undefined ? delete process.env[k] : process.env[k] = old[k]; } };
const many = (n, field, per) => { const t = {}; let i = 0; while (n > 0) { const k = Math.min(per, n); t['zz-s' + (i++) + ':t'] = { private: field === 'private' ? k : 0, web: field === 'web' ? k : 0 }; n -= k; } return t; };
const live = c => { c.status = 'live'; c.channels = { web: { active: true }, voice: { active: false }, sms: { active: false } }; };

await launch();
const shop = await seed({ channels: ['web', 'voice', 'sms', 'calendar'], configure: live });

// ---- OPS-06 server ----
await check('OPS-06: shop with its own allowance left but the shared customer pool used is marked platformLimited', async () => {
  await budget({ 'zz-other:t1': { private: 0, web: 25 } });
  const a = await ai.getAIAllowance(shop.c);
  assert.equal(a.available, false); assert.equal(a.web.remaining, 0); assert.equal(a.web.platformLimited, true); assert.notEqual(a.private.platformLimited, true);
});
await check('OPS-06: a shop that used its own allowance is not marked platformLimited', async () => {
  await budget({ [keyOf(shop)]: { private: 20, web: 0 } });
  const a = await ai.getAIAllowance(shop.c);
  assert.equal(a.private.remaining, 0); assert.notEqual(a.private.platformLimited, true); assert.notEqual(a.web.platformLimited, true);
});
await check('OPS-06: platform usage reports ok / warning at 80% / exhausted, and never writes the daily record', async () => {
  await budget(null); let u = await ai.getAIPlatformUsage();
  assert.equal(u.global, 50); assert.equal(u.customer.limit, 25); assert.equal(u.practice.limit, 25); assert.equal(u.level, 'ok'); assert.equal(await readBudget(), null, 'read created a record');
  await budget({ 'zz-a:t': { private: 0, web: 19 } }); u = await ai.getAIPlatformUsage(); assert.equal(u.customer.level, 'ok', '19/25 is below 80%');
  await budget({ 'zz-a:t': { private: 0, web: 20 } }); const before = JSON.stringify(await readBudget()); u = await ai.getAIPlatformUsage();
  assert.equal(u.customer.level, 'warning'); assert.equal(u.level, 'warning'); assert.equal(u.shopsUsing, 1); assert.equal(JSON.stringify(await readBudget()), before);
  await budget({ 'zz-a:t': { private: 0, web: 25 }, 'zz-b:t': { private: 3, web: 0 } }); u = await ai.getAIPlatformUsage();
  assert.equal(u.customer.level, 'exhausted'); assert.equal(u.practice.level, 'ok'); assert.equal(u.level, 'exhausted'); assert.equal(u.customer.used, 25); assert.equal(u.shopsUsing, 2); assert.match(u.resetAt, /^\d{4}-\d{2}-\d{2}T/);
});
await check('OPS-06: operator issue names the platform limit, and a shop-only limit keeps the shop wording', async () => {
  await budget({ 'zz-other:t1': { private: 0, web: 25 } });
  let issue = (await operator.customerView(await store.get('clients', shop.slug), true)).issues.find(i => i.id === 'allowance');
  assert.equal(issue?.title, 'Platform AI limit reached'); assert.match(issue.detail, /shared platform daily limit/);
  // Global 500 (practice 100, customer 400): the shop's own 50 binds first, so the shop wording stays.
  process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = '500';
  try {
    await budget({ [keyOf(shop)]: { private: 0, web: 50 } });
    const a = await ai.getAIAllowance(shop.c); assert.equal(a.web.remaining, 0); assert.notEqual(a.web.platformLimited, true);
    issue = (await operator.customerView(await store.get('clients', shop.slug), true)).issues.find(i => i.id === 'allowance');
    assert.equal(issue?.title, 'Daily AI allowance reached');
  } finally { delete process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT; }
});

// ---- QA probe cases (qa/qa-probe.mjs), server ----
await check('QA 500: practice 100, customer 400, warning from 320, exhausted at 400 refuses the shop and marks it platformLimited', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500' }, async () => {
  await budget(null); let u = await ai.getAIPlatformUsage(); assert.equal(u.practice.limit, 100); assert.equal(u.customer.limit, 400); assert.equal(u.perShop.customer, 50); assert.equal(u.perShop.practice, 20); assert.equal(u.maxGlobal, 500);
  await budget(many(319, 'web', 50)); assert.equal((await ai.getAIPlatformUsage()).customer.level, 'ok');
  await budget(many(320, 'web', 50)); assert.equal((await ai.getAIPlatformUsage()).customer.level, 'warning');
  await budget(many(400, 'web', 50)); assert.equal((await ai.getAIPlatformUsage()).customer.level, 'exhausted');
  const a = await ai.getAIAllowance(shop.c); assert.equal(a.web.remaining, 0); assert.equal(a.web.platformLimited, true); assert.notEqual(a.private.platformLimited, true);
  assert.equal((await ai.reserveAIRequest(shop.c, 'web')).allowed, false);
}));
await check('QA 100: practice floor 40, customer 60', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '100' }, async () => { await budget(null); const u = await ai.getAIPlatformUsage(); assert.equal(u.practice.limit, 40); assert.equal(u.customer.limit, 60); }));
await check('QA practice pool full: private platformLimited, web not, chat still available', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '100' }, async () => { await budget(many(40, 'private', 20)); const a = await ai.getAIAllowance(shop.c); assert.equal(a.private.platformLimited, true); assert.notEqual(a.web.platformLimited, true); assert.equal(a.available, true); }));
await check('QA global 0: no platformLimited, overall level off', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '0' }, async () => { await budget(null); const a = await ai.getAIAllowance(shop.c); assert.notEqual(a.web.platformLimited, true); assert.notEqual(a.private.platformLimited, true); assert.equal((await ai.getAIPlatformUsage()).level, 'off'); }));
await check('QA own allowance partly used, pool full: platformLimited', async () => { await budget({ [keyOf(shop)]: { private: 0, web: 10 }, 'zz-o:t': { private: 0, web: 15 } }); assert.equal((await ai.getAIAllowance(shop.c)).web.platformLimited, true); });
await check('QA own allowance and pool both used: own limit binds, not platformLimited', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500' }, async () => { const t = many(350, 'web', 50); t[keyOf(shop)] = { private: 0, web: 50 }; await budget(t); assert.notEqual((await ai.getAIAllowance(shop.c)).web.platformLimited, true); }));
await check('QA invalid global env: platform usage throws (manage shows unavailable)', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: 'abc' }, async () => { await assert.rejects(ai.getAIPlatformUsage()); }));
for (const val of ['0', 'bogus']) await check('F1: practice env ' + val + ' with global 500 is practice off, not platform used up and not platform-wide off', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500', MC_SELF_SERVICE_AI_PRACTICE_DAILY_LIMIT: val }, async () => {
  await budget(null); const a = await ai.getAIAllowance(shop.c), u = await ai.getAIPlatformUsage();
  assert.equal(a.private.remaining, 0); assert.notEqual(a.private.platformLimited, true, 'owner told the shared limit is used');
  assert.equal(u.practice.level, 'off'); assert.equal(u.customer.level, 'ok'); assert.notEqual(u.level, 'off', 'overall off while customer replies are open'); assert.equal(u.level, 'ok');
}));
await check('QA owner /api/client payload exposes no other shop or pool counts', async () => {
  await budget({ 'zz-secret:t': { private: 0, web: 25 } });
  const res = await (await import(lib('netlify/functions/client.mjs'))).default(new Request(origin + '/api/client?c=' + shop.slug, { headers: { Authorization: 'Bearer ' + shop.token, Origin: origin } }), { ip: '192.0.2.1' });
  const txt = await res.text(); assert.equal(res.status, 200); assert.ok(!txt.includes('zz-secret')); assert.ok(!/shopsUsing|publicUsed|maxGlobal/.test(txt));
});

// ---- desk: ONB-11 and OPS-06 owner copy ----
await budget({ 'zz-other:t1': { private: 0, web: 25 } });
{
  const { page, context } = await open(shop, { width: 390, height: 844, hash: '#account' });
  await check('ONB-11: Account shows the contact cell in US format, stored value unchanged', async () => {
    await route(page, 'account'); await page.locator('#accountPhone').waitFor({ state: 'attached' });
    assert.equal((await page.locator('#accountPhone').textContent()).trim(), '(713) 555-0198');
    assert.equal((await store.get('clients', shop.slug)).owner.phone, '+17135550198');
  });
  await check('OPS-06: owner AI allowance line says the shared platform limit is used, not their own', async () => {
    const t = await page.locator('#aiAllowance').textContent();
    assert.match(t, /0 customer chat/); assert.match(t, /shared platform limit is used, not your own allowance/);
  });
  await check('F2: header pill matches the platform note ("Shared AI limit reached")', async () => { assert.equal((await page.locator('#status').textContent()).trim(), 'Shared AI limit reached'); });
  await context.close();
}
for (const [phone, want] of [['+447911123456', '+447911123456'], ['5550198', '5550198'], ['+1713555019', '+1713555019']]) await check('QA ONB-11: ' + phone + ' is shown verbatim', async () => {
  const c = await store.get('clients', shop.slug); c.owner.phone = phone; await store.put('clients', shop.slug, c);
  try { const { page, context } = await open(shop, { width: 390, height: 844, hash: '#account' }); await route(page, 'account'); await page.locator('#accountPhone').waitFor({ state: 'attached' }); assert.equal((await page.locator('#accountPhone').textContent()).trim(), want); await context.close(); }
  finally { const back = await store.get('clients', shop.slug); back.owner.phone = '+17135550198'; await store.put('clients', shop.slug, back); }
});
await budget({ [keyOf(shop)]: { private: 0, web: 50 } });
{
  const { page, context } = await open(shop, { width: 390, height: 844, hash: '#account' });
  await check('F2: a shop at its own limit keeps the pill "Daily AI allowance reached" and gets no platform note', async () => { assert.equal((await page.locator('#status').textContent()).trim(), 'Daily AI allowance reached'); assert.doesNotMatch(await page.locator('#aiAllowance').textContent(), /shared platform/); });
  await context.close();
}
await budget(null);
{
  const { page, context } = await open(shop, { width: 390, height: 844, hash: '#account' });
  await check('OPS-06: with capacity left the owner line has no platform note', async () => {
    const t = await page.locator('#aiAllowance').textContent(); assert.match(t, /AI replies left today/); assert.doesNotMatch(t, /shared platform/);
  });
  // ---- POLISH-15 at 390 ----
  await check('POLISH-15: at 390 Connections names stay on one line, marks share a 32px tile, status/badge sit on line 2', async () => {
    await route(page, 'setup'); await page.locator('.connector-service-choice').first().waitFor();
    const rows = await page.locator('.connector-service-choice').evaluateAll(list => list.map(b => {
      const name = b.querySelector('.brand-lockup>span:last-child'), mark = b.querySelector('.brand-lockup>:first-child'), status = b.querySelector('.connector-choice-status'), badge = b.querySelector('.connector-availability');
      const r = e => e && e.getBoundingClientRect(), lh = parseFloat(getComputedStyle(name).lineHeight) || parseFloat(getComputedStyle(name).fontSize) * 1.6;
      return { id: b.dataset.guideService, nameW: r(name).width, clipped: name.scrollWidth > name.clientWidth + 1, nameH: r(name).height, lh, nameTop: r(name).top, mark: mark === name ? null : { w: r(mark).width, h: r(mark).height, bg: getComputedStyle(mark).backgroundColor }, statusTop: r(status).top, badgeTop: badge ? r(badge).top : null, right: r(b).right };
    }));
    assert.ok(rows.length >= 4, 'rows ' + rows.length);
    for (const row of rows) {
      assert.ok(row.nameW > 40 && !row.clipped, row.id + ' name hidden or cut: ' + row.nameW);
      assert.ok(row.nameH <= row.lh + 2, row.id + ' name wraps: ' + row.nameH + ' > ' + row.lh);
      assert.ok(row.mark, row.id + ' has no mark'); assert.equal(Math.round(row.mark.w), 32, row.id + ' mark width'); assert.equal(Math.round(row.mark.h), 32, row.id + ' mark height'); assert.notEqual(row.mark.bg, 'rgba(0, 0, 0, 0)', row.id + ' mark tile');
      assert.ok(row.statusTop > row.nameTop + 8, row.id + ' status not on line 2'); if (row.badgeTop !== null) assert.ok(row.badgeTop > row.nameTop + 8, row.id + ' badge not on line 2');
    }
    await noHScroll(page); await shot(page, 'connections', 390);
  });
  await context.close();
}
{
  const { page, context } = await open(shop, { width: 1440, height: 900, hash: '#today' });
  await check('POLISH-15: at 1440 marks share the 32px tile and rows keep one line', async () => {
    await route(page, 'setup'); await page.locator('.connector-service-choice').first().waitFor();
    const rows = await page.locator('.connector-service-choice').evaluateAll(list => list.map(b => { const m = b.querySelector('.brand-lockup>:first-child').getBoundingClientRect(), s = b.querySelector('.connector-choice-status').getBoundingClientRect(), n = b.querySelector('.brand-lockup>span:last-child').getBoundingClientRect(); return { w: m.width, h: m.height, same: Math.abs((s.top + s.height / 2) - (n.top + n.height / 2)) < 12 }; }));
    for (const r of rows) { assert.equal(Math.round(r.w), 32); assert.equal(Math.round(r.h), 32); assert.ok(r.same, 'status left the name line at desktop'); }
  });
  await context.close();
}

// ---- POLISH-12 and OPS-06 admin need their own contexts (held responses / admin page) ----
const pw = await import(pathToFileURL(resolve(playwrightPath)).href);
const browser = await pw.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
async function context2({ width, height, holdClient = false }) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' }); context.setDefaultTimeout(10000);
  await context.routeWebSocket('**/*', s => s.close());
  await context.route('**/*', async r => {
    const req = r.request(), url = new URL(req.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin }); return r.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (holdClient && url.pathname === '/api/client') return; // never answered: the desk stays in its loading state
      const method = req.method(), body = method === 'GET' ? null : req.postData();
      if (!handlers[url.pathname]) { report.forbidden.push({ path: url.pathname }); return r.fulfill({ status: 403, body: '{}' }); }
      report.requests++; const res = await handlers[url.pathname](new Request(url, { method, headers: req.headers(), ...(body ? { body } : {}) }), { ip: '192.0.2.92' });
      return r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    const path = resolve(process.cwd(), decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!existsSync(path) || statSync(path).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ contentType: types[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', e => report.pageErrors.push(e.message)); return { context, page };
}
const brandState = page => page.evaluate(() => { const img = document.querySelector('#deskRail .desk-rail-brand img'), nav = document.querySelector('#deskRail nav.tabs'), r = img.getBoundingClientRect(), src = img.currentSrc || img.src; const rail = document.getElementById('deskRail').getBoundingClientRect(); return { state: document.body.dataset.workspaceState, railW: rail.width, railH: rail.height, w: r.width, h: r.height, top: r.top, inView: r.top >= 0 && r.bottom <= innerHeight, navShown: !!nav && nav.getBoundingClientRect().height > 0, logo: src.split('/').pop(), bg: getComputedStyle(document.getElementById('deskRail')).backgroundColor }; });
for (const [width, height] of [[390, 844], [1440, 900]]) {
  await check('POLISH-12: loading desk shows the brand logo and no workspace navigation at ' + width, async () => {
    const { context, page } = await context2({ width, height, holdClient: true });
    await page.addInitScript(({ slug, token }) => { sessionStorage.setItem('mc-onboarding-session-v1', token); }, { slug: shop.slug, token: shop.token });
    await page.goto(origin + '/desk.html?c=' + shop.slug); await page.locator('#deskLoading').waitFor({ state: 'visible' });
    const b = await brandState(page); assert.equal(b.state, 'loading'); assert.ok(b.w > 60 && b.h > 15 && b.inView, 'logo not shown ' + JSON.stringify(b)); assert.equal(b.navShown, false, 'navigation shown while loading'); assert.ok(Math.abs(b.railW - width) <= 1 && b.railH < 120, 'brand is not a top bar ' + JSON.stringify(b));
    assert.equal(b.logo, width <= 900 ? 'logo-dark.png' : 'logo.png'); if (width <= 900) assert.equal(b.bg, 'rgb(255, 255, 255)'); else assert.notEqual(b.bg, 'rgb(255, 255, 255)');
    await noHScroll(page); await page.screenshot({ path: out + '/loading-' + width + '.png' }); await context.close();
  });
  await check('POLISH-12: signed-out recovery desk shows the brand logo and no workspace navigation at ' + width, async () => {
    const { context, page } = await context2({ width, height });
    await page.goto(origin + '/desk.html?c=' + shop.slug); await page.locator('#portalRecovery').waitFor({ state: 'visible' });
    const b = await brandState(page); assert.equal(b.state, 'recovery'); assert.ok(b.w > 60 && b.inView, 'logo not shown ' + JSON.stringify(b)); assert.equal(b.navShown, false);
    const card = await page.locator('#portalRecovery').boundingBox(); assert.ok(card.y > b.top, 'recovery card above the brand bar');
    await noHScroll(page); await page.screenshot({ path: out + '/recovery-' + width + '.png' }); await context.close();
  });
}
await check('POLISH-12: once loaded, the full rail and navigation return (no regression)', async () => {
  const { page, context } = await open(shop, { width: 1440, height: 900, hash: '#today' });
  const b = await brandState(page); assert.equal(b.state, 'ready'); assert.equal(b.navShown, true); assert.equal(await page.locator('#deskRail').evaluate(e => getComputedStyle(e).position), 'fixed'); await context.close();
});

// ---- OPS-06 admin ----
const opToken = createHash('sha256').update('open-cards-operator-' + Date.now()).digest('hex');
await store.put('access_sessions', access.accessHash(opToken), { scope: 'operator', email: OPERATOR, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() });
async function adminWith(tenants) {
  await budget(tenants); const { context, page } = await context2({ width: 1280, height: 900 });
  await page.goto(origin + '/admin.html'); await page.evaluate(t => sessionStorage.setItem('mc-operator-session-v1', t), opToken); await page.reload();
  await page.locator('#summary .stat').first().waitFor(); return { context, page };
}
await check('OPS-06: admin Overview warns when the shared customer pool is used and links to System, which shows usage', async () => {
  const { context, page } = await adminWith({ 'zz-a:t': { private: 0, web: 25 } });
  const warn = page.locator('#aiCapacityWarning'); await warn.waitFor(); assert.match(await warn.innerText(), /shared platform limit for customer replies \(chat, phone, text\) is used/); assert.match(await warn.innerText(), /Raise MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT \(up to 500\)/);
  assert.equal(await warn.evaluate(e => e.className), 'notice error', 'F5: a full pool is not amber');
  await warn.locator('[data-go=system]').click(); await page.locator('#aiCapacity').waitFor();
  const t = await page.locator('#aiCapacity').innerText(); assert.match(t, /Customer replies: chat, phone, text \(all shops\)\s*25 of 25 used/); assert.match(t, /50 replies, split into 25 customer and 25 owner practice/); assert.match(t, /Owner practice \(all shops\)\s*0 of 25 used/);
  assert.equal(await page.locator('#aiCapacity [data-ai-capacity]').getAttribute('data-ai-capacity'), 'exhausted');
  await page.screenshot({ path: out + '/admin-system-exhausted.png', fullPage: true }); await context.close();
});
await check('OPS-06: admin warns before the limit (80%) and is quiet below it', async () => {
  let { context, page } = await adminWith({ 'zz-a:t': { private: 0, web: 20 } });
  await page.locator('#aiCapacityWarning').waitFor(); assert.match(await page.locator('#aiCapacityWarning').innerText(), /at 80% or more/); assert.equal(await page.locator('#aiCapacityWarning').evaluate(e => e.className), 'notice warning'); await context.close();
  ({ context, page } = await adminWith({ 'zz-a:t': { private: 0, web: 5 } }));
  await page.waitForTimeout(300); assert.equal(await page.locator('#aiCapacityWarning').count(), 0);
  await page.locator('[data-view=system]').click(); await page.locator('#aiCapacity').waitFor(); assert.equal(await page.locator('#aiCapacity [data-ai-capacity]').count(), 0); assert.match(await page.locator('#aiCapacity').innerText(), /5 of 25 used/); await context.close();
});
await check('F3: at the 500 maximum admin says the limit is at its maximum and does not advise raising it', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500' }, async () => {
  const { context, page } = await adminWith(many(400, 'web', 50)); const warn = page.locator('#aiCapacityWarning'); await warn.waitFor(); const t = await warn.innerText();
  assert.match(t, /already at its 500 maximum/); assert.match(t, /owner\/PO decision/); assert.doesNotMatch(t, /Raise MC_SELF_SERVICE/); await context.close();
}));
await check('F1: admin with practice configured off at 500 does not say AI is switched off platform-wide', () => env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500', MC_SELF_SERVICE_AI_PRACTICE_DAILY_LIMIT: '0' }, async () => {
  const { context, page } = await adminWith(null); await page.waitForTimeout(300); assert.equal(await page.locator('#aiCapacityWarning').count(), 0);
  await page.locator('[data-view=system]').click(); await page.locator('#aiCapacity').waitFor(); assert.doesNotMatch(await page.locator('#aiCapacity').innerText(), /switched off platform-wide/); await context.close();
}));
await browser.close();
await finish('open-cards-r4');
