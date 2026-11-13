// shots.mjs <base> <ctrl> <outdir> [widths]: before/after screenshots + layout metrics (offline, loopback only)
import { mkdirSync, writeFileSync } from 'node:fs';
const [base, ctrl, OUT, W = '320,390,1440'] = process.argv.slice(2); mkdirSync(OUT, { recursive: true });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
const log = [], M = {}; let physical = 0;
const ctx = async w => { const c = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: w < 500 ? 2 : 1, hasTouch: w < 500, isMobile: w < 500 });
  await c.route('**/*', r => { const u = new URL(r.request().url()); if (u.origin !== base) { physical++; log.push('blocked ' + u.href.slice(0, 80)); return r.abort('blockedbyclient'); } return r.continue(); });
  c.on('page', p => p.on('pageerror', e => log.push('pageerror ' + e.message))); c.setDefaultTimeout(8000); return c; };
const shot = async (p, n, full = false) => { await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }); };
const mail = async e => (await fetch(ctrl + '/mail?email=' + encodeURIComponent(e))).json();
const rect = (p, sel) => p.evaluate(s => { const e = [...document.querySelectorAll(s)].find(x => x.getClientRects().length); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width), vh: innerHeight }; }, sel);
// smallest gap between a visible field error/hint and the next label below it, inside root
const gaps = (p, root) => p.evaluate(r => { const root = document.querySelector(r); if (!root) return null; const lab = [...root.querySelectorAll('label.form-label')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
  const notes = [...root.querySelectorAll('.field-error,.visit-field-error,.hint,.visit-field-hint,.form-input')].filter(e => e.getClientRects().length && e.getBoundingClientRect().height > 0).map(e => [e, e.getBoundingClientRect()]);
  let min = 1e9, at = ''; for (const [e, n] of notes) { const below = lab.filter(l => l.top >= n.bottom - 1 && Math.abs(l.left - n.left) < 400).sort((a, b) => a.top - b.top)[0]; if (below && below.top - n.bottom < min) { min = Math.round(below.top - n.bottom); at = (e.id || e.className) + ':' + (e.textContent || '').trim().slice(0, 30); } } return { minGap: min, at }; }, root);
// focused field: px of it hidden behind anything else (sticky header/footer, bars, pseudo-elements) or off screen.
// Samples document.elementFromPoint down the field's centre line, so it needs no knowledge of the footer markup.
const cover = (p) => p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(); let hidden = 0;
  for (let y = Math.ceil(r.top) + 1; y < r.bottom - 1; y += 2) { if (y < 0 || y >= innerHeight) { hidden += 2; continue; } const hit = document.elementFromPoint(r.left + Math.min(24, r.width / 2), y); if (!(hit === e || e.contains(hit))) hidden += 2; }
  return { id: e.id || e.name || e.tagName, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, covered: hidden }; });
// Tab through the fields of a container at the current viewport; returns rows with covered > 0
const tabWalk = async (p, within, first, footSel, headSel, max = 30) => { const bad = [], seen = []; await p.locator(first).focus(); await p.waitForTimeout(250);
  for (let i = 0; i < max; i++) { const inside = await p.evaluate(w => !!document.activeElement?.closest(w), within); if (!inside) break; const tag = await p.evaluate(() => document.activeElement.tagName); if (/INPUT|SELECT|TEXTAREA/.test(tag)) { const r = await cover(p); seen.push(r.id); if (r.covered > 0) bad.push(r); } await p.keyboard.press('Tab'); await p.waitForTimeout(200); }
  return { fields: seen.length, bad }; };
// QA R1 case: the field is already on screen but sits under the sticky footer, then gets focus
const focusUnder = async (p, field, scroller) => { await p.evaluate(([f, sc]) => { document.activeElement?.blur?.(); const e = document.querySelector(f), c = document.querySelector(sc); c.scrollBy(0, e.getBoundingClientRect().bottom - (innerHeight - 4)); }, [field, scroller]); await p.waitForTimeout(150);
  const before = await p.evaluate(f => { const r = document.querySelector(f).getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight }; }, field);
  await p.locator(field).focus(); await p.waitForTimeout(250); return { before, after: await cover(p) }; };
const obWalk = async (p, m, key) => { const vw = p.viewportSize(); m[key] = {}; for (const h of [844, 430]) { await p.setViewportSize({ width: vw.width, height: h }); await p.evaluate(() => scrollTo(0, 0)); m[key][h] = await tabWalk(p, '#ob fieldset.on', '#ob fieldset.on :is(input:not([type=hidden]),textarea,select) >> nth=0', 'body[data-setup-state=questions] .ob .nav', null); } await p.setViewportSize(vw); await p.evaluate(() => scrollTo(0, 0)); };
const step = async (n, fn) => { try { await fn(); } catch (e) { log.push(n + ': ' + e.message.split('\n')[0]); } };
for (const w of W.split(',').map(Number)) {
  const m = M[w] = {}; const t = w + '-'; const email = `polish${w}-${Date.now()}@example.test`;
  const c = await ctx(w); const p = await c.newPage();
  await p.goto(base + '/onboard.html'); await p.locator('#access-email').fill(email); await p.locator('#access-send').click(); await p.waitForTimeout(800);
  const ml = await mail(email); await p.goto(ml.link); await p.waitForTimeout(900);
  if (await p.locator('#access-verify').isVisible().catch(() => false)) { await p.locator('#access-verify').click(); await p.waitForTimeout(900); }
  await p.locator('#name').waitFor();
  await shot(p, t + 'onboard-step1'); m.ob1First = await rect(p, '#name'); m.ob1Next = await rect(p, '#next');
  await p.locator('#next').click(); await p.waitForTimeout(400); await p.evaluate(() => scrollTo(0, 0)); await shot(p, t + 'onboard-step1-errors', true); m.ob1Gaps = await gaps(p, '#ob fieldset.on');
  await p.locator('#name').fill('Steve Ramirez'); await p.locator('#phone').fill('7135550142'); await p.locator('#next').click(); await p.waitForTimeout(800);
  await step('ob2', async () => { await p.locator('[data-step="2"].on').waitFor(); if (w < 500) await obWalk(p, m, 'ob2Keys'); m.ob2First = await rect(p, '#business'); m.ob2Next = await rect(p, '#next');
    await p.locator('#next').click(); await p.waitForTimeout(400); await p.evaluate(() => scrollTo(0, 0)); await shot(p, t + 'onboard-step2-errors', true); m.ob2Gaps = await gaps(p, '#ob fieldset.on');
    await p.locator('#business').fill('Bayou Air & Heat'); await p.locator('#trade').selectOption('HVAC'); await p.locator('#services').fill('AC repair\nFurnace repair'); await p.locator('#serviceArea').fill('Katy, Cypress');
    await p.locator('#hours').fill('Mon to Fri 8 am to 5 pm'); await p.locator('#next').click(); await p.waitForTimeout(900); });
  await step('ob3', async () => { await p.locator('[data-step="3"].on').waitFor(); if (w < 500) await obWalk(p, m, 'ob3Keys'); await p.locator('#next').click(); await p.waitForTimeout(400); await p.evaluate(() => scrollTo(0, 0)); await shot(p, t + 'onboard-step3-errors', true); m.ob3Gaps = await gaps(p, '#ob fieldset.on');
    m.ob3WindowsPlaceholder = await p.locator('#windows').evaluate(e => getComputedStyle(e, '::placeholder').color);
    await p.locator('#windows').scrollIntoViewIfNeeded(); await shot(p, t + 'onboard-step3-windows');
    await p.locator('#fees').fill('Diagnostic: $89'); await p.locator('#windows').fill('8 am to 12 pm\n12 pm to 5 pm'); await p.locator('#next').click(); await p.waitForTimeout(900); });
  await step('ob4', async () => { await p.locator('[data-step="4"].on').waitFor(); if (w < 500) await obWalk(p, m, 'ob4Keys'); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(200); await shot(p, t + 'onboard-step4'); m.ob4First = await rect(p, '#greeting'); m.ob4Next = await rect(p, '#next');
    await p.mouse.wheel(0, 600); await p.waitForTimeout(300); m.ob4NextScrolled = await rect(p, '#next'); await shot(p, t + 'onboard-step4-scrolled');
    await p.locator('#next').click(); await p.locator('#done.on').waitFor({ timeout: 10000 }); });
  const href = await p.locator('#portalLink, #goPortal').first().getAttribute('href'); const slug = new URL(href, base).searchParams.get('c');
  m.seed = (await (await fetch(ctrl + '/seed?slug=' + slug)).json()).map(x => x.id || x.message || 'x');
  await p.goto(new URL(href, base).href.replace('#setup', '')); await p.waitForTimeout(2000);
  if (await p.locator('#guideDialog').isVisible()) { await p.locator('#skipGuide').click(); await p.waitForTimeout(300); }
  const nav = async sel => { await p.locator(sel + ':visible').first().click(); await p.waitForTimeout(800); await p.evaluate(() => scrollTo(0, 0)); };
  await step('home', async () => { await nav('[data-t="today"]'); m.rail = await p.evaluate(() => { const r = s => { const e = document.querySelector(s); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; }; const g = r('.desk-rail-help .desk-guide-button'), a = r('.desk-rail-help .desk-account-button'), t = r('#title'), st = r('#status'); return { guideH: g && Math.round(g.height), accountH: a && Math.round(a.height), titleBadgeSameRow: t && st ? Math.abs(t.top + t.height / 2 - (st.top + st.height / 2)) < 6 : null }; }); await shot(p, t + 'home'); await shot(p, t + 'home-full', true); m.homeFirstRequest = await rect(p, '#needsYou .desk-attention-row'); m.homeActivityButtons = await p.evaluate(() => [...document.querySelectorAll('#todayEvents [data-request-open]')].filter(e => e.getClientRects().length && getComputedStyle(e).borderTopWidth !== '0px').length); });
  await step('inbox', async () => { await nav('[data-t="leads"]'); await shot(p, t + 'inbox'); await shot(p, t + 'inbox-full', true);
    m.inboxRow = await p.evaluate(() => { const r = document.querySelector('.desk-request-row'); const g = s => r.querySelector(s)?.getBoundingClientRect(); const b = [...r.querySelectorAll('.btn-pill')].map(x => x.getBoundingClientRect()); return { rowH: Math.round(r.getBoundingClientRect().height), jobTop: Math.round(g('.desk-request-job>p').top), firstButtonTop: Math.round(b[0]?.top), buttonsSameRow: b.length > 1 ? Math.abs(b[0].top - b[1].top) < 2 : null, statusBottom: Math.round(g('.desk-request-status').bottom), buttonH: b.map(x => Math.round(x.height)), timeLines: Math.round(g('time').height / parseFloat(getComputedStyle(r.querySelector('time')).lineHeight || 18)), listH: Math.round(document.querySelector('#leads')?.getBoundingClientRect().height || 0) }; }); });
  await step('request', async () => { await p.locator('[data-request-open]:visible').first().click(); await p.locator('#requestContent:not([hidden])').waitFor(); await p.waitForTimeout(500); await shot(p, t + 'request-dialog');
    m.reqTop = { close: await rect(p, '#requestClose'), save: await rect(p, '#requestSave') };
    await p.locator('#requestAction').focus(); await p.waitForTimeout(300); await shot(p, t + 'request-dialog-form');
    m.reqForm = { close: await rect(p, '#requestClose'), title: await rect(p, '#requestTitle'), save: await rect(p, '#requestSave'), action: await rect(p, '#requestAction') };
    await p.locator('#requestNote').focus(); await p.waitForTimeout(300); m.reqNote = await cover(p); await shot(p, t + 'request-dialog-note');
    m.reqWalk = await tabWalk(p, '#requestForm', '#requestAction', '#requestDialog .dlg-foot', '#requestDialog .request-dialog-heading');
    m.reqNoteUnder = await focusUnder(p, '#requestNote', '#requestDialog'); await shot(p, t + 'request-dialog-note-under');
    await p.locator('#requestHistory').scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await shot(p, t + 'request-dialog-bottom'); m.reqBottom = { close: await rect(p, '#requestClose') };
    await p.keyboard.press('Escape'); await p.waitForTimeout(400); });
  await step('customers', async () => { await nav('[data-workspace-route="customers"]'); await shot(p, t + 'customers-full', true); m.customersListH = (await rect(p, '#customerList, .desk-customer-list'))?.h; });
  await step('schedule', async () => { await nav('[data-t="availability"]'); await p.waitForTimeout(800); await shot(p, t + 'schedule'); await shot(p, t + 'schedule-full', true);
    m.schedMode = await p.locator('#scheduleCalendar').getAttribute('data-calendar-mode'); m.schedFirstVisit = await rect(p, '#calendarGrid .calendar-event'); m.schedGrid = await rect(p, '#calendarGrid');
    const title = () => p.evaluate(() => { const h = document.getElementById('calendarRangeTitle'); return { text: h.textContent, clipped: h.scrollWidth > h.clientWidth + 1, h: Math.round(h.getBoundingClientRect().height) }; }); m.schedTitleFirst = await title();
    m.schedToday = await rect(p, '#calendarToday'); m.schedNext = await rect(p, '#calendarNext');
    await p.locator('[data-calendar-view="week"]').click(); await p.waitForTimeout(500); m.schedTodayWeek = await rect(p, '#calendarToday'); m.schedNextWeek = await rect(p, '#calendarNext'); m.schedTitleWeek = await title(); await shot(p, t + 'schedule-week');
    await p.locator('[data-calendar-view="month"]').click(); await p.waitForTimeout(500); m.schedTitleMonth = await title(); await shot(p, t + 'schedule-month');
    await p.locator('[data-calendar-view="agenda"]').click(); await p.waitForTimeout(500); });
  await step('addvisit', async () => { const add = p.locator('#scheduleCalendar button:has-text("Add visit"):visible').first(); await add.click(); await p.locator('#visitDialog[open]').waitFor(); await p.waitForTimeout(500); await shot(p, t + 'add-visit');
    m.addVisit = { save: await rect(p, '#saveVisit'), close: await rect(p, '#closeVisit') };
    if (w < 500) { m.addVisitKeys = {}; for (const h of [844, 430]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(200); m.addVisitKeys[h] = await tabWalk(p, '#visitChangeForm', '#visitName', '#visitDialog .dlg-foot', '#visitTitle'); if (h === 430) { m.addVisitIssueUnder = await focusUnder(p, '#visitIssue', '#visitDialog'); await shot(p, t + 'add-visit-keyboard'); } } await p.setViewportSize({ width: w, height: 844 }); await p.locator('#visitDialog').evaluate(d => d.scrollTo(0, 0)); }
    await p.locator('#saveVisit').click(); await p.waitForTimeout(500); await shot(p, t + 'add-visit-errors'); m.addVisitErr = { save: await rect(p, '#saveVisit'), close: await rect(p, '#closeVisit'), gaps: await gaps(p, '#visitDialog') };
    await p.locator('#closeVisit').click(); await p.waitForTimeout(400); });
  await step('visit', async () => { await p.locator('#calendarGrid .calendar-event:visible').first().click(); await p.waitForTimeout(400); const v = p.locator('.calendar-selected-day .calendar-event:visible, #scheduleCalendar [data-calendar-visit]:visible').last(); if (!(await p.locator('#visitDialog[open]').count())) await v.click(); await p.locator('#visitDialog[open]').waitFor(); await p.waitForTimeout(500); await shot(p, t + 'visit-dialog'); m.visit = { close: await rect(p, '#closeVisit'), save: await rect(p, '#saveVisit') }; await p.locator('#closeVisit').click(); await p.waitForTimeout(300); });
  await step('hours', async () => { await nav('[data-t="setup"]'); await nav('[data-workspace-route="know"]'); const s = p.locator('#p-know details:has(#hoursRows) > summary').first(); if (!(await p.locator('#hoursRows:visible').count())) await s.click(); await p.waitForTimeout(400); await p.locator('#hoursRows').scrollIntoViewIfNeeded(); await shot(p, t + 'hours'); m.hoursInput = await rect(p, '#hoursRows input'); });
  await c.close();
}
M.log = log; M.physicalNetwork = physical; writeFileSync(`${OUT}/metrics.json`, JSON.stringify(M, null, 1)); console.log(JSON.stringify(M, null, 1)); await browser.close();
