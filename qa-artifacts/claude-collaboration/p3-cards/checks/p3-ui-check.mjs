// P3 cards UI check: PRA-ONB-09, PRA-ONB-10, PRA-ONB-12, PRA-ACQ-10.
// Actual handlers in this process, memory store, fake model. Browser requests are fulfilled from repo files or the
// in-process handlers; any other origin is aborted and server-side fetch throws. No route.fetch.
// node p3check/p3-ui-check.mjs --playwright <index.mjs> --out <dir> --label <name>
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const out = resolve(arg('--out')), label = arg('--label') || 'run', pw = arg('--playwright');
mkdirSync(out, { recursive: true });
const root = resolve('.'), base = 'http://127.0.0.1:8897';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', URL: base });
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
const blockedServer = [];
globalThis.fetch = async input => { blockedServer.push(String(input)); throw new Error('server network blocked'); };
const store = await import(resolve('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(resolve('netlify/functions/lib/access.mjs'));
const handlers = Object.fromEntries(await Promise.all(['access', 'onboard', 'client', 'chat', 'intake'].map(async n => ['/api/' + n, (await import(resolve('netlify/functions/' + n + '.mjs'))).default])));
const checks = [], shots = [], blockedBrowser = [], pageErrors = [];
const check = (card, name, pass, detail) => { checks.push({ card, name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); };
const { chromium } = await import(pw);
const browser = await chromium.launch({ headless: true, ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : {}) });
async function context(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width < 500, isMobile: false });
  await ctx.route('**/*', async route => {
    const r = route.request(), url = new URL(r.url());
    if (url.origin !== base) { blockedBrowser.push(url.origin); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (!handlers[url.pathname]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_in_check"}' });
      const req = new Request(url, { method: r.method(), headers: r.headers(), ...(['GET', 'HEAD'].includes(r.method()) ? {} : { body: r.postData() }) });
      const res = await handlers[url.pathname](req, { ip: '192.0.2.77' });
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    if (rel.split(/[\\/]/).some(p => p.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    let path = resolve(root, rel); if (!path.startsWith(root + '/')) return route.fulfill({ status: 404, body: 'blocked' });
    if (!existsSync(path) && existsSync(path + '.html')) path += '.html';
    if (!existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(path) });
  });
  const page = await ctx.newPage(); page.on('pageerror', e => pageErrors.push(e.message));
  return { ctx, page };
}
const shot = async (page, name, full = false) => { const p = `${out}/${label}-${name}.png`; await page.screenshot({ path: p, fullPage: full }); shots.push(p); };

async function onboarding(width, height, tag) {
  const { ctx, page } = await context(width, height), email = `p3-${tag}@example.test`;
  await page.goto(base + '/onboard.html');
  await page.locator('#access-email').fill(email); await page.locator('#access-send').click();
  await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
  const delivery = await store.get('access_outbox', accessHash(email));
  await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' });
  await page.locator('#name').fill('P3 Owner'); await page.locator('#phone').fill('7135550101');
  await page.locator('#next').click(); await page.locator('[data-step="2"]').waitFor({ state: 'visible' });
  await page.locator('#business').fill('P3 Air'); await page.locator('#trade').selectOption('HVAC'); await page.locator('#services').fill('AC repair'); await page.locator('#hours').fill('Mon to Fri 8 am to 5 pm'); await page.locator('#serviceArea').fill('Katy'); await page.locator('#spanish').selectOption('no');
  await page.locator('#next').click(); await page.locator('[data-step="3"]').waitFor({ state: 'visible' });
  await page.locator('#fees').fill('Diagnostic: $89');
  // PRA-ONB-10: the error says what was wrong and uses the placeholder's format; the placeholder itself is accepted.
  const placeholder = await page.locator('#windows').getAttribute('placeholder');
  await page.locator('#windows').fill('morning'); await page.locator('#next').click();
  const err = page.locator('#windows-error, #windows ~ .field-error, [id="windows"] + p').first();
  await page.waitForTimeout(150);
  const message = await page.evaluate(() => { const f = document.getElementById('windows'), id = (f.getAttribute('aria-describedby') || '').split(/\s+/).find(x => /err/i.test(x)); return (id && document.getElementById(id)?.textContent) || document.getElementById('err')?.textContent || ''; });
  const example = (message.match(/such as ([^.]+)\./) || [])[1] || '';
  check('PRA-ONB-10', `${tag}: error names the entered text`, /morning/.test(message), message);
  check('PRA-ONB-10', `${tag}: error uses QA's copy, true for reversed and noon ranges too`, message.trim() === 'We couldn’t read “morning” as an arrival window. Write a start and end time with am or pm, such as 8 am to 12 pm.', message);
  check('PRA-ONB-10', `${tag}: placeholder uses the error's example format (am/pm)`, !!example && placeholder.split('\n')[0] === example, { placeholder, example });
  if (tag === 'm') await shot(page, 'onb10-window-error-390');
  await page.locator('#windows').fill(placeholder); await page.locator('#next').click(); await page.locator('[data-step="4"]').waitFor({ state: 'visible' });
  check('PRA-ONB-10', `${tag}: placeholder text is accepted`, true);
  await page.locator('#draft-status').filter({ hasText: 'Saved.' }).waitFor();
  return { ctx, page, email };
}

try {
  // PRA-ONB-09 (rev 2), 390 touch and 1440 mouse: another device saves; this page gets a two-step replace.
  // Taps and clicks go to coordinates measured before the input, as a finger would, so a layout shift makes them miss.
  for (const [w, h, tag] of [[390, 844, 'p'], [1440, 900, 'd']]) {
    const { ctx, page, email } = await onboarding(w, h, tag);
    const press = async locator => { const b = await locator.boundingBox(); if (!b) return false; const x = b.x + b.width / 2, y = b.y + b.height / 2; if (w < 500) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); return true; };
    const key = accessHash(email), before = await store.get('onboarding_drafts', key);
    await store.put('onboarding_drafts', key, { ...before, fields: { ...before.fields, notes: 'Typed on the other device' }, revision: before.revision + 1, updatedAt: new Date().toISOString() });
    const field = page.locator('#greeting'), fieldName = await field.getAttribute('name');
    await field.fill('Typed on this device');
    await page.locator('#draft-status').filter({ hasText: /another device or tab/ }).waitFor({ timeout: 8000 }).catch(() => {});
    const status = await page.locator('#draft-status').innerText();
    check('PRA-ONB-09', `${w}: conflict says the other answers are deleted by replacing`, /another device or tab/.test(status) && /Replacing deletes the other answers and cannot be undone/.test(status), status);
    const keep = page.locator('#draft-keep-mine'), confirm = page.locator('#draft-replace-confirm'), yes = page.locator('#draft-replace-yes'), cancel = page.locator('#draft-replace-cancel');
    const keepVisible = await keep.isVisible().catch(() => false);
    check('PRA-ONB-09', `${w}: offers "Replace with this page’s answers"`, keepVisible && (await keep.innerText()).trim() === 'Replace with this page’s answers');
    const style = keepVisible ? await keep.evaluate(n => { const c = getComputedStyle(n); return { border: parseFloat(c.borderTopWidth), radius: parseFloat(c.borderTopLeftRadius), height: n.getBoundingClientRect().height, bg: c.backgroundColor }; }) : null;
    check('PRA-ONB-09', `${w}: looks like a button (border, radius, 44px target)`, !!style && style.border >= 1 && style.radius >= 4 && style.height >= 44, style);
    await shot(page, `onb09-conflict-${w}`);
    await field.focus();
    if (keepVisible) await press(keep); await page.waitForTimeout(300);
    const confirmShown = await confirm.isVisible().catch(() => false), afterFirst = await store.get('onboarding_drafts', key);
    check('PRA-ONB-09', `${w}: first ${w < 500 ? 'tap' : 'click'} with the field focused opens the confirmation`, confirmShown, { confirmShown });
    check('PRA-ONB-09', `${w}: nothing is replaced before confirming`, afterFirst.revision === before.revision + 1 && afterFirst.fields.notes === 'Typed on the other device', { revision: afterFirst.revision });
    const warning = confirmShown ? await confirm.innerText() : '';
    check('PRA-ONB-09', `${w}: confirmation warns that the other answers are deleted`, /deletes the answers saved on the other device or tab/.test(warning) && /cannot be undone/.test(warning), warning);
    if (confirmShown) await shot(page, `onb09-confirm-${w}`);
    if (confirmShown) { await press(cancel); await page.waitForTimeout(200); }
    check('PRA-ONB-09', `${w}: Cancel closes the confirmation without saving`, !await confirm.isVisible() && await keep.isVisible() && (await store.get('onboarding_drafts', key)).revision === before.revision + 1);
    if (await keep.isVisible()) { await press(keep); await page.waitForTimeout(200); }
    if (await yes.isVisible().catch(() => false)) { await press(yes); await page.locator('#draft-status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 8000 }).catch(() => {}); }
    const after = await store.get('onboarding_drafts', key);
    check('PRA-ONB-09', `${w}: Replace saved answers saves this page`, after.fields[fieldName] === 'Typed on this device' && after.revision === before.revision + 2, { field: fieldName, value: after.fields[fieldName], revision: after.revision, before: before.revision });
    check('PRA-ONB-09', `${w}: replace controls hide after the save`, !await page.locator('#draft-replace').isVisible());
    await ctx.close();
  }
  // PRA-ONB-12 (1440): finished-setup sidebar and signed-in strip, in a fresh setup.
  {
    const { ctx, page } = await onboarding(1440, 900, 'r');
    await page.locator('#next').click(); await page.locator('#done.on').waitFor({ timeout: 15000 });
    await page.waitForTimeout(200);
    const aside = await page.evaluate(() => {
      const vis = s => { const n = document.querySelector(s); if (!n) return false; const r = n.getBoundingClientRect(), cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const strip = document.getElementById('access-signed-in').getBoundingClientRect(), done = document.getElementById('done').getBoundingClientRect();
      return { pathVisible: vis('.access-path'), welcomeVisible: vis('.onboard-welcome'), stepsVisible: vis('.ob-steps'), complete: [...document.querySelectorAll('.ob-steps>span')].every(s => s.dataset.stepState === 'complete'), current: document.querySelectorAll('.ob-steps>span[aria-current=step]').length, stripLeft: Math.round(strip.left), stripRight: Math.round(strip.right), doneLeft: Math.round(done.left), doneRight: Math.round(done.right), stripVisible: strip.width > 0 };
    });
    check('PRA-ONB-12', 'Ready sidebar hides the signed-out welcome path', !aside.pathVisible && !aside.welcomeVisible, aside);
    check('PRA-ONB-12', 'Ready sidebar shows every setup step complete', aside.stepsVisible && aside.complete && aside.current === 0, aside);
    check('PRA-ONB-12', 'Signed-in strip aligns with the content column', !aside.stripVisible || Math.abs(aside.stripLeft - aside.doneLeft) <= 2 && Math.abs(aside.stripRight - aside.doneRight) <= 2, aside);
    await shot(page, 'onb12-ready-1440');
    await ctx.close();
  }
  // 390: ONB-10 again, and the ready screen.
  {
    const { ctx, page } = await onboarding(390, 844, 'm');
    await page.locator('#next').click(); await page.locator('#done.on').waitFor({ timeout: 15000 });
    await shot(page, 'onb12-ready-390');
    await ctx.close();
  }
  // PRA-ACQ-10: launcher never covers the inquiry submit or the demo conversation header at 390.
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const { ctx, page } = await context(w, h);
    await page.goto(base + '/index.html'); await page.locator('#mcAgentLauncher').waitFor({ state: 'attached' });
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const bad = []; let samples = 0, hidden = 0;
    for (let y = 0; y <= max; y += 37) {
      await page.evaluate(top => window.scrollTo(0, top), y); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const r = await page.evaluate(() => {
        const l = document.getElementById('mcAgentLauncher'), b = l.getBoundingClientRect(), cs = getComputedStyle(l);
        const shown = cs.visibility !== 'hidden' && cs.display !== 'none' && b.width > 0;
        const hits = ['#intake-submit', '.site-conversation-head'].filter(s => [...document.querySelectorAll(s)].some(n => { const a = n.getBoundingClientRect(); return a.width && a.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }));
        return { shown, hits };
      });
      samples++; if (!r.shown) hidden++;
      if (r.shown && r.hits.length) bad.push({ y, hits: r.hits });
    }
    check('PRA-ACQ-10', `${w}: launcher never shown over submit or demo header`, bad.length === 0, { samples, hidden, overlaps: bad.slice(0, 5), count: bad.length });
    // The submit button gets the click where the hidden launcher sits over it (QA rev 2).
    await page.evaluate(() => {
      const lb = document.getElementById('mcAgentLauncher').getBoundingClientRect(), sb = document.getElementById('intake-submit').getBoundingClientRect();
      window.scrollTo(0, sb.top + scrollY + sb.height / 2 - (lb.top + lb.height / 2));
    });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const at = await page.evaluate(() => {
      const l = document.getElementById('mcAgentLauncher'), s = document.getElementById('intake-submit'), lb = l.getBoundingClientRect(), sb = s.getBoundingClientRect();
      const x = Math.max(sb.left + 2, Math.min(sb.right - 2, lb.left + lb.width / 2)), y = Math.max(sb.top + 2, Math.min(sb.bottom - 2, lb.top + lb.height / 2));
      window.p3SubmitClicks = 0; s.addEventListener('click', e => { e.preventDefault(); window.p3SubmitClicks++; });
      return { x, y, overlap: lb.left < sb.right && lb.right > sb.left && lb.top < sb.bottom && lb.bottom > sb.top, covering: document.getElementById('mcAgent').classList.contains('is-covering') };
    });
    if (w < 500) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(150);
    const clicks = await page.evaluate(() => window.p3SubmitClicks), panelOpen = await page.locator('#mcAgentPanel').isVisible();
    check('PRA-ACQ-10', `${w}: submit gets the ${w < 500 ? 'tap' : 'click'} where the launcher sits`, at.overlap && clicks === 1 && !panelOpen, { ...at, clicks, panelOpen });
    await shot(page, `acq10-submit-click-${w}`);
    if (panelOpen) await page.keyboard.press('Escape');
    if (w === 390) {
      await page.evaluate(() => { const b = document.getElementById('intake-submit'); window.scrollTo(0, b.getBoundingClientRect().bottom + scrollY - innerHeight + 4); });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await shot(page, 'acq10-submit-390');
      await page.evaluate(() => { window.scrollTo(0, 0); }); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      const away = await page.evaluate(() => getComputedStyle(document.getElementById('mcAgentLauncher')).visibility);
      check('PRA-ACQ-10', '390: launcher is shown again away from the controls', away === 'visible', away);
      await page.locator('#mcAgentLauncher').focus();
      check('PRA-ACQ-10', '390: focused launcher stays reachable', await page.evaluate(() => getComputedStyle(document.getElementById('mcAgentLauncher')).visibility === 'visible'));
    } else await shot(page, 'acq10-home-1440');
    await ctx.close();
  }
} catch (e) { check('harness', 'run completed', false, String(e && e.stack || e)); }
finally { await browser.close(); }
check('harness', 'no page errors', pageErrors.length === 0, pageErrors);
check('harness', 'no server-side fetch; every non-local browser request was aborted', blockedServer.length === 0, { abortedBrowserOrigins: [...new Set(blockedBrowser)], blockedServer });
const failed = checks.filter(c => !c.pass);
writeFileSync(`${out}/${label}.json`, JSON.stringify({ label, at: new Date().toISOString(), passed: checks.length - failed.length, total: checks.length, checks, screenshots: shots }, null, 1));
for (const c of checks) console.log((c.pass ? 'PASS ' : 'FAIL ') + c.card + ' ' + c.name + (c.pass ? '' : ' ' + JSON.stringify(c.detail || '').slice(0, 300)));
console.log(`RESULT ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
