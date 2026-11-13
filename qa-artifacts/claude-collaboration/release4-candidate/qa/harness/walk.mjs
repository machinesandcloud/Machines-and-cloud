// Independent release-4 browser walk (run from copy root): node walk.mjs --playwright <idx> --out <dir> --label r4qa
import { assert, launch, seed, open, route, check, finish, store, lib, handlers, origin, report, shot, noHScroll, workspaceTenant, nextWeekday } from './fc-lib.mjs';
const ai = await import(lib('netlify/functions/lib/self-service-ai.mjs'));
const { houstonToday } = await import(lib('netlify/functions/lib/availability.mjs'));
const access = await import(lib('netlify/functions/lib/access.mjs'));
const OPERATOR = 'r4qa-operator@example.test'; process.env.ADMIN_EMAILS = OPERATOR;
handlers['/api/manage'] = (await import(lib('netlify/functions/manage.mjs'))).default;
const live = c => { c.status = 'live'; c.channels = { web: { active: true }, voice: { active: false }, sms: { active: false } }; c.owner.phone = '+17135550198'; };
const consoleErrors = []; report.consoleErrors = consoleErrors;
await launch();
for (const [width, height] of [[390, 844], [1440, 900]]) {
  const x = await seed({ channels: ['web', 'voice', 'sms', 'calendar'], configure: live });
  const y = await seed({ channels: ['web'] });
  const v1 = await x.visit({ customer_name: 'Jim Homeowner', phone: '+17135550142', address: '12 Oak St, Katy, TX 77494', issue: 'AC blowing warm air', date: nextWeekday(3) });
  const l1 = await x.lead({ customer_name: 'Rosa Open', phone: '+17135550150', issue: 'Furnace noise', reason: 'wants_call' });
  await x.lead({ customer_name: 'Dan Done', phone: '+17135550151', issue: 'Old question', outcome: 'resolved', resolvedAt: new Date().toISOString(), status: 'closed' });
  const { page, context } = await open(x, { width, height, hash: '#today' });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(width + ' ' + m.text().slice(0, 200)); });
  await check(`home @${width}`, async () => { await noHScroll(page); await shot(page, 'desk-home', width, true); });
  await check(`inbox open/done remembered per workspace across reload @${width}`, async () => {
    await route(page, 'leads'); await page.locator('[data-request-filter=open]').waitFor();
    await shot(page, 'inbox-open', width, true);
    await page.locator('[data-request-filter=done]').click(); await page.waitForFunction(() => document.getElementById('requestFilterStatus').textContent);
    const status = await page.locator('#requestFilterStatus').textContent(); await shot(page, 'inbox-done', width, true);
    await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await route(page, 'leads');
    assert.equal(await page.locator('[data-request-filter=done]').getAttribute('aria-pressed'), 'true', 'not remembered after reload');
    const other = await context.newPage(); await other.addInitScript(t => sessionStorage.setItem('mc-onboarding-session-v1', t), y.token);
    await other.goto(origin + '/desk.html?c=' + y.slug + '#leads'); await other.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    const otherDone = await other.locator('[data-request-filter=done]').getAttribute('aria-pressed').catch(() => 'n/a'); await other.close();
    assert.notEqual(otherDone, 'true', 'filter leaked to other workspace'); return status;
  });
  await check(`visit dialog contact links, Escape returns focus @${width}`, async () => {
    await route(page, 'availability'); const b = page.locator('#bookings .visit-open[data-visit="' + v1.id + '"]'); await b.waitFor({ state: 'attached' }); await b.evaluate(n => n.click()); await page.locator('#visitDialog[open]').waitFor();
    assert.equal(await page.locator('#visitDetails a[data-visit-call]').getAttribute('href'), 'tel:+17135550142');
    assert.equal(await page.locator('#visitDetails a[data-visit-text]').getAttribute('href'), 'sms:+17135550142');
    await shot(page, 'visit-dialog', width); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#visitDialog[open]'));
  });
  await check(`hours grid error marks day, names it @${width}`, async () => {
    await route(page, 'know'); await page.evaluate(() => { for (let d = document.getElementById('hoursRows').closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; document.getElementById('hoursRows').scrollIntoView(); });
    await page.locator('#hoursRows [data-d=wed][data-k=close]').fill('');
    await page.locator('#cfg [type=submit]').first().click(); await page.waitForFunction(() => document.querySelector('#hoursRows [aria-invalid=true]'));
    const r = await page.evaluate(() => ({ invalid: [...document.querySelectorAll('#hoursRows input[aria-invalid=true]')].map(i => i.dataset.d + '.' + i.dataset.k), err: document.getElementById('cfgHoursError').textContent }));
    assert.deepEqual(r.invalid, ['wed.close'], JSON.stringify(r)); await shot(page, 'hours-error', width); return r.err;
  });
  await check(`customers @${width}`, async () => { await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await route(page, 'customers'); await page.waitForTimeout(300); await noHScroll(page); await shot(page, 'customers', width, true); });
  await check(`connections @${width}`, async () => { await route(page, 'setup'); await page.waitForTimeout(400); await noHScroll(page); await shot(page, 'connections', width, true); });
  await check(`account phone formatted @${width}`, async () => { await route(page, 'account'); await page.waitForTimeout(400); const t = await page.locator('main').innerText(); assert.match(t, /\(713\) 555-0198/, 'formatted phone missing'); await noHScroll(page); await shot(page, 'account', width, true); });
  await check(`homepage @${width}`, async () => { const p = await context.newPage(); p.on('pageerror', e => report.pageErrors.push('home ' + e.message)); await p.goto(origin + '/index.html'); await p.waitForTimeout(800); await noHScroll(p); await shot(p, 'homepage', width); await p.evaluate(() => document.getElementById('pilot')?.scrollIntoView()); await p.waitForTimeout(400); await shot(p, 'homepage-pilot', width); await p.close(); });
  await check(`onboarding @${width}`, async () => { const p = await context.newPage(); p.on('pageerror', e => report.pageErrors.push('onboard ' + e.message)); await p.goto(origin + '/onboard.html'); await p.waitForTimeout(800); await noHScroll(p); await shot(p, 'onboard', width, true); await p.close(); });
  await check(`admin AI-limit exhausted notice @${width}`, async () => {
    await store.put('self_service_ai', 'daily', { version: 1, day: houstonToday(), used: 25, tenants: { 'zz-other:t1': { private: 0, web: 25 } } });
    const opToken = access.accessHash('r4qa-op-' + width).slice(0, 64); await store.put('access_sessions', access.accessHash(opToken), { scope: 'operator', email: OPERATOR, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() });
    const p = await context.newPage(); p.on('pageerror', e => report.pageErrors.push('admin ' + e.message)); await p.goto(origin + '/admin.html'); await p.evaluate(t => sessionStorage.setItem('mc-operator-session-v1', t), opToken); await p.reload(); await p.waitForTimeout(1500);
    const t = await p.locator('body').innerText(); await shot(p, 'admin-overview', width, true);
    assert.match(t, /AI/i); const m = t.match(/[^\n]*(platform AI|AI capacity|limit)[^\n]*/gi) || []; await p.close(); await store.del('self_service_ai', 'daily'); return m.slice(0, 8);
  });
  await context.close();
}
await finish('r4qa-walk');
