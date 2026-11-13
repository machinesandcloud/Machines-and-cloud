// Independent release-5 browser walk. Run from copy root: node <checks>/walk5.mjs --playwright <idx> --out <dir> --label r5qa
import { assert, launch, seed, open, route, check, finish, store, lib, handlers, origin, report, shot, noHScroll, nextWeekday, sha } from './fc-lib.mjs';
import { existsSync, readFileSync, statSync } from 'node:fs'; import { resolve, extname } from 'node:path';
const { houstonToday } = await import(lib('netlify/functions/lib/availability.mjs'));
const access = await import(lib('netlify/functions/lib/access.mjs'));
const OPERATOR = 'r5qa-operator@example.test'; process.env.ADMIN_EMAILS = OPERATOR;
handlers['/api/manage'] = (await import(lib('netlify/functions/manage.mjs'))).default;
const live = c => { c.status = 'live'; c.channels = { web: { active: true }, voice: { active: false }, sms: { active: false } }; c.owner.phone = '+17135550198'; c.business.spanish = true; c.business.trade = 'Plumbing'; c.business.name = 'Bayou Plumbing'; };
const consoleErrors = []; report.consoleErrors = consoleErrors; report.notes = {};
const note = (k, v) => { report.notes[k] = v; return v; };
const covered = (page, sel, barSel) => page.evaluate(([s, b]) => { const f = document.querySelector(s).getBoundingClientRect(), n = document.querySelector(b)?.getBoundingClientRect(); const vis = f.top >= -1 && f.bottom <= innerHeight + 1, exact = [f.top, f.bottom]; const overlap = n && n.height && getComputedStyle(document.querySelector(b)).position === 'sticky' ? Math.max(0, Math.min(f.bottom, n.bottom) - Math.max(f.top, n.top)) : 0; return { exact, field: [Math.round(f.top), Math.round(f.bottom)], bar: n ? [Math.round(n.top), Math.round(n.bottom), getComputedStyle(document.querySelector(b)).position] : null, vh: innerHeight, vis, overlap }; }, [sel, barSel]);
const day = n => { const d = new Date(Date.now() + n * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
async function hostPage(context, slug, lang, locale) {
  // Host pages are served by a second route on the loopback origin only.
  await context.route(origin + '/host-' + lang + '.html', r => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bayou Plumbing</title></head><body style="font-family:sans-serif;margin:24px"><h1>Bayou Plumbing</h1><p>${lang === 'es' ? 'Plomería en Katy.' : 'Plumbing in Katy.'}</p><script src="/embed.js" data-client="${slug}" data-api="${origin}"></script></body></html>` }));
}
await launch();
for (const [width, height] of [[320, 640], [390, 844], [1440, 900]]) {
  const x = await seed({ channels: ['web', 'voice', 'sms', 'calendar'], configure: live });
  const v1 = await x.visit({ customer_name: 'Jim Homeowner', phone: '+17135550142', address: '12 Oak St, Katy, TX 77494', issue: 'Water heater leaking', date: nextWeekday(3) });
  await x.visit({ customer_name: 'Rosa Garza', phone: '+17135550143', address: '9 Elm St, Katy, TX 77494', issue: 'Fuga en el baño', date: nextWeekday(2), language: 'es' });
  const l1 = await x.lead({ customer_name: 'Rosa Open', phone: '+17135550150', issue: 'Drain backing up', reason: 'wants_call' });
  await x.lead({ customer_name: 'María López', phone: '+17135550152', issue: 'Calentador de agua', reason: 'wants_call', language: 'es' });
  const { page, context } = await open(x, { width, height, hash: '#today' });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(width + ' ' + m.text().slice(0, 200)); });
  await check(`desk home @${width}`, async () => { await page.waitForTimeout(400); await noHScroll(page); await shot(page, 'desk-home', width, true); });
  await check(`inbox + request dialog sticky footer @${width}`, async () => {
    await route(page, 'leads'); await page.waitForTimeout(400); await noHScroll(page); await shot(page, 'inbox', width, true);
    const t = await page.locator('#p-leads, main').first().innerText(); note('inbox-es-' + width, /Habla español/.test(t));
    const open = page.locator('[data-request-open="' + l1.id + '"]:visible').first(); await open.click(); await page.locator('#requestDialog[open]').waitFor();
    await page.waitForTimeout(300); await shot(page, 'request-dialog', width);
    let r; try {
      const field = page.locator('#requestForm :is(select,input:not([type=hidden]),textarea):visible').first(); await field.focus(); await page.waitForTimeout(200);
      r = await page.evaluate(() => { const d = document.getElementById('requestDialog'), b = document.getElementById('requestSave'), x = document.getElementById('requestClose'), f = document.activeElement; const br = b.getBoundingClientRect(), xr = x.getBoundingClientRect(), fr = f.getBoundingClientRect(), foot = b.closest('.dlg-foot').getBoundingClientRect(); return { focused: f.id || f.name, field: [Math.round(fr.top), Math.round(fr.bottom)], foot: [Math.round(foot.top), Math.round(foot.bottom)], save: [Math.round(br.top), Math.round(br.bottom)], close: [Math.round(xr.top), Math.round(xr.right)], vh: innerHeight, vw: innerWidth, hscroll: d.scrollWidth > d.clientWidth + 1 }; });
      await shot(page, 'request-dialog-field-focused', width);
      assert.ok(r.save[1] <= r.vh && r.save[0] >= 0, 'Save not in view after focusing first field ' + JSON.stringify(r)); assert.ok(r.field[1] <= r.foot[0] && r.field[0] >= 0, 'focused field covered by footer ' + JSON.stringify(r)); assert.ok(r.close[0] >= 0 && r.close[1] <= r.vw, 'close off-screen'); assert.ok(!r.hscroll, 'dialog hscroll');
    } finally { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#requestDialog[open]')); }
    return r;
  });
  await check(`schedule default view + visit dialog sticky footer @${width}`, async () => {
    await route(page, 'availability'); await page.waitForTimeout(500);
    const mode = await page.locator('#scheduleCalendar').getAttribute('data-calendar-mode'); assert.equal(mode, width <= 640 ? 'agenda' : 'month', 'mode ' + mode);
    await noHScroll(page); await shot(page, 'schedule', width, true);
    const b = page.locator('#bookings .visit-open[data-visit="' + v1.id + '"]'); await b.waitFor({ state: 'attached' }); await b.evaluate(n => n.click()); await page.locator('#visitDialog[open]').waitFor(); await page.waitForTimeout(300);
    await shot(page, 'visit-dialog', width);
    const r = await page.evaluate(() => { const c = document.getElementById('closeVisit').getBoundingClientRect(), t = document.querySelector('#visitDetails a[data-visit-call]').getBoundingClientRect(); return { close: [Math.round(c.top), Math.round(c.right)], call: Math.round(t.bottom), vh: innerHeight, vw: innerWidth }; });
    assert.ok(r.close[0] >= 0 && r.close[1] <= r.vw && r.call <= r.vh, JSON.stringify(r));
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#visitDialog[open]')); return { mode, ...r };
  });
  await check(`blocked-time range with label (Thanksgiving, 3 days) @${width}`, async () => {
    await page.evaluate(() => { const d = document.getElementById('scheduleBlockManager'); if (d) d.open = true; });
    await page.locator('#availabilityDate').fill(day(20)); await page.locator('#availabilityThrough').fill(day(22)); await page.locator('#availabilityLabel').fill('Thanksgiving');
    await page.locator('#availabilitySubmit').click(); await page.waitForFunction(() => /Time blocked\./.test(document.getElementById('availabilityMessage').textContent));
    const list = await page.locator('#availabilityBlocks .availability-row').allInnerTexts(); assert.equal(list.length, 3, list.join('|'));
    await page.locator('#availabilityForm').scrollIntoViewIfNeeded(); await noHScroll(page); await shot(page, 'blocked-range', width);
    // server-side rejects a 40-day range
    const bad = await x.api('POST', '', { action: 'availability_block', date: day(30), window: '', through: day(70), label: 'Too long' }); assert.equal(bad.status, 400); return { list, tooLong: bad.body?.message };
  });
  await check(`hours with holidays: hint flags closures, not normal closed days @${width}`, async () => {
    await route(page, 'know'); await page.evaluate(() => { for (let d = document.getElementById('desk-setting-7').closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; });
    const flag = async v => { await page.locator('#desk-setting-7').fill(v); await page.waitForTimeout(150); return page.evaluate(() => document.getElementById('hoursHolidayHint').dataset.holidayMentioned); };
    const r = { 'Mon-Fri 8-5, closed on Sundays': await flag('Mon-Fri 8-5, closed on Sundays'), 'Mon-Fri 8-5, closed Dec 24-26 and Thanksgiving': await flag('Mon-Fri 8-5, closed Dec 24-26 and Thanksgiving') };
    assert.notEqual(r['Mon-Fri 8-5, closed on Sundays'], 'true'); assert.equal(r['Mon-Fri 8-5, closed Dec 24-26 and Thanksgiving'], 'true');
    await page.locator('#desk-setting-7').scrollIntoViewIfNeeded(); await shot(page, 'hours-holiday', width); return { ...r, hint: await page.locator('#hoursHolidayHint').textContent() };
  });
  await check(`customers @${width}`, async () => { await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await route(page, 'customers'); await page.waitForTimeout(400); await noHScroll(page); await shot(page, 'customers', width, true); });
  await check(`connections @${width}`, async () => { await route(page, 'setup'); await page.waitForTimeout(400); await noHScroll(page); await shot(page, 'connections', width, true); });
  await check(`account pause: wording before/after, Home banner @${width}`, async () => {
    await route(page, 'account'); await page.waitForTimeout(400); await noHScroll(page); await shot(page, 'account', width, true);
    const before = await page.locator('#accountServiceScope').textContent();
    await page.locator('#pause').click(); await page.waitForFunction(() => document.getElementById('clientStatus')?.textContent || document.body.innerText.includes('Front desk paused'), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800); const msg = await page.locator('main').innerText(); await shot(page, 'account-paused', width, true);
    const saved = (await store.get('clients', x.slug, { type: 'json' }).catch(() => null)) || null;
    await route(page, 'today'); await page.waitForTimeout(400); const home = await page.locator('#homeServiceContext').textContent().catch(() => ''); await shot(page, 'home-paused', width);
    assert.match(before, /Calls may still ring your saved contact cell/); assert.match(home, /paused.*Calls may still ring your saved contact cell/);
    return { before, homeBanner: home, pausedMsg: (msg.match(/[^\n]*Front desk paused[^\n]*/) || [''])[0] };
  });
  await check(`homepage + demo @${width}`, async () => { const p = await context.newPage(); p.on('pageerror', e => report.pageErrors.push('home ' + e.message)); await p.goto(origin + '/index.html'); await p.waitForTimeout(800); await noHScroll(p); await shot(p, 'homepage', width); await p.evaluate(() => document.getElementById('demo-wrap')?.scrollIntoView()); await p.waitForTimeout(1500); await noHScroll(p); await shot(p, 'homepage-demo', width); await p.close(); });
  await context.close();
  // onboarding as a plumber: fresh verified mailbox session, no workspace
  await check(`onboarding plumber, sticky bar, keyboard-height viewport @${width}`, async () => {
    const email = 'r5qa-onb-' + width + '@example.test', token = sha('r5qa-onb' + width + Date.now()).slice(0, 64);
    await store.put('access_sessions', access.accessHash(token), { scope: 'onboarding', status: 'active', email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
    const y = { slug: 'none', token }; const { context: oc } = await open({ ...x, slug: x.slug, token: x.token }, { width, height }).catch(e => ({ context: null }));
    const ctx = oc; const p = await ctx.newPage(); await p.addInitScript(t => sessionStorage.setItem('mc-onboarding-session-v1', t), token);
    p.on('pageerror', e => report.pageErrors.push('onboard ' + e.message)); await p.goto(origin + '/onboard.html'); await p.waitForTimeout(1200);
    const state = await p.evaluate(() => document.body.dataset.setupState); note('onboard-state-' + width, state);
    await p.locator('#name').fill('Pat Plumber'); await p.locator('#phone').fill('(713) 555-0177'); await p.locator('#next').click(); await p.locator('#business').waitFor({ state: 'visible' }); await p.waitForTimeout(300);
    await p.evaluate(() => { const f = document.getElementById('ob'); f.elements.trade.value = 'Plumbing'; f.elements.trade.dispatchEvent(new Event('change', { bubbles: true })); f.elements.business.value = 'Bayou Plumbing'; f.elements.business.dispatchEvent(new Event('input', { bubbles: true })); });
    await noHScroll(p); await shot(p, 'onboard-top', width);
    const ph = await p.evaluate(() => Object.fromEntries(['services', 'fees', 'faq', 'greeting', 'never', 'licenses'].map(n => [n, document.getElementById('ob').elements[n]?.placeholder])));
    assert.match(ph.services || '', /Drain/); 
    const res = {};
    const ids = await p.evaluate(() => [...document.querySelectorAll('#ob :is(input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea)')].filter(n => n.id && n.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }) && !n.closest("details:not([open])")).map(n => n.id));
    for (const id of ids) { await p.locator('#' + id).focus(); await p.waitForTimeout(120); res[id] = { ...(await covered(p, '#' + id, '.ob .nav')), active: await p.evaluate(i => document.activeElement?.id === i, id) }; }
    await shot(p, 'onboard-last-focused', width);
    let kb = null; if (width <= 640) { await p.setViewportSize({ width, height: 430 }); await p.waitForTimeout(200); kb = {}; for (const id of ids) { await p.locator('#' + id).focus(); await p.waitForTimeout(120); kb[id] = await covered(p, '#' + id, '.ob .nav'); } await shot(p, 'onboard-keyboard430', width); }
    for (const [k, v] of Object.entries(res)) assert.ok(v.vis && v.overlap === 0, k + ' covered ' + JSON.stringify(v)); if (kb) for (const [k, v] of Object.entries(kb)) assert.ok(v.vis && v.overlap === 0, 'kb ' + k + ' covered ' + JSON.stringify(v)); assert.ok(ids.length > 0, 'no visible fields');
    await ctx.close(); return { state, placeholders: ph, focus: res, kb };
  });
  // website chat embed, real /api/client config and real /api/chat (fake model)
  for (const [lang, locale, msg] of [['en', 'en-US', 'Hi, my name is José, I live off Casa Grande Dr and my water heater is leaking'], ['es', 'es-MX', 'Hola, necesito ayuda con una fuga de agua en mi casa']]) {
    await check(`embed ${lang} visitor (${msg.slice(0, 24)}...) @${width}`, async () => {
      const z = await seed({ channels: ['web'], configure: live }); const { page: hp, context: hc } = await open(z, { width, height });
      await hostPage(hc, z.slug, lang, locale); const chats = [];
      await hc.route(origin + '/api/client?c=' + z.slug, r => r.request().headers().authorization ? r.fallback() : r.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: z.slug, status: 'live', name: 'Bayou Plumbing', greeting: 'Hi! What can we help with today?', spanish: true, businessNumber: '', webAvailable: true }) }));
      await hc.route(origin + '/api/chat', r => { chats.push(r.request().postDataJSON()); const reply = lang === 'es' ? 'Claro, con gusto le ayudamos. ¿Cuál es su dirección?' : 'Sorry to hear that, José. What is your address?'; return r.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ t: 'delta', text: reply }) + '\n' + JSON.stringify({ t: 'done', reply, events: [] }) + '\n' }); }); const w = await hc.newPage(); w.on('pageerror', e => report.pageErrors.push('embed ' + e.message));
      await w.goto(origin + '/host-' + lang + '.html'); await w.waitForTimeout(800); await w.locator('#mcDesk .l').click(); await w.waitForTimeout(600);
      const cfg = await (await handlers['/api/client'](new Request(origin + '/api/client?c=' + z.slug))).json();
      const available = await w.evaluate(() => !document.querySelector('#mcDesk textarea').disabled);
      let after = null;
      if (available) { await w.locator('#mcDesk textarea').fill(msg); await w.locator('#mcDesk textarea').press('Enter'); await w.waitForTimeout(2500); after = await w.evaluate(() => ({ lang: document.getElementById('mcDesk').lang, launch: document.querySelector('#mcDesk .l span').textContent, send: document.querySelector('#mcDesk .s').textContent, text: document.getElementById('mcDesk').innerText.slice(0, 600) })); }
      await noHScroll(w); await shot(w, 'embed-' + lang, width);
      const lab = await w.evaluate(() => ({ lang: document.getElementById('mcDesk').lang, placeholder: document.querySelector('#mcDesk textarea').placeholder }));
      await hc.close();
      assert.ok(available && after, 'chat not available'); if (lang === 'en') { assert.equal(after.lang, 'en', 'English visitor named José flipped to Spanish'); assert.equal(after.send, 'Send'); } else { assert.equal(after.lang, 'es'); assert.equal(after.send, 'Enviar'); }
      return { realConfigSpanish: cfg.spanish, realWebAvailable: cfg.webAvailable, syntheticConfig: true, available, lab, after, chatPosts: chats.length };
    });
  }
  await check(`admin overview @${width}`, async () => {
    const z = await seed({ channels: ['web'] }); const { context: ac } = await open(z, { width, height });
    const opToken = access.accessHash('r5qa-op-' + width).slice(0, 64); await store.put('access_sessions', access.accessHash(opToken), { scope: 'operator', email: OPERATOR, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() });
    const p = await ac.newPage(); p.on('pageerror', e => report.pageErrors.push('admin ' + e.message)); await p.goto(origin + '/admin.html'); await p.evaluate(t => sessionStorage.setItem('mc-operator-session-v1', t), opToken); await p.reload(); await p.waitForTimeout(1500);
    await noHScroll(p); await shot(p, 'admin-overview', width, true); const t = await p.locator('body').innerText(); await ac.close(); assert.match(t, /Overview|shops|Needs/i); return t.slice(0, 200);
  });
}
await finish('r5qa-walk');
