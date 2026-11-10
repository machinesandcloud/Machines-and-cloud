// Causal browser check for two onboarding accessibility repairs.
// 1. Finishing onboarding by keyboard: Enter on "Create my workspace" must land focus on a visible level-1
//    "Your workspace is ready" heading (not BODY), with #goPortal still "Continue my connections" and next in Tab order.
// 4. A newer announcement always wins over a pending older one; an identical "Saved" is not re-announced; failures always are.
// 3. Initial focus: none forced on a fresh load; when the form opens (sign-in link or restore), focus goes to the current
//    step heading unless the owner already put focus somewhere that is still on the page.
// 2. Autosave announcements: no live-region write on keystrokes; one announcement when a save settles
//    (saved, couldn't confirm, or a definite failure). The visible #draft-status text may still change.
// Live-region writes are counted with a MutationObserver: each observer callback that changes the text of an element
// inside role=status/alert/log or aria-live=polite/assertive counts once per region, when the region's text is not empty
// and the region is rendered (a display:none region, such as one in a step that isn't shown, is not announced).
// Actual handlers in-process, memory store, fake model and fake mailbox; outside-origin browser requests and every
// server fetch are denied.
// Usage (from the worktree root): node qa-artifacts/claude-collaboration/onboard-a11y-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-a11y-<name>.json [--expect-onboard-sha256 <hex>]
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), base = 'http://127.0.0.1:8897';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output') || 'scratchpad/claude-a11y-check.json', playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const expectSha = arg('--expect-onboard-sha256');
if (!/^scratchpad\/claude-port-[\w-]+\.json$/.test(output)) throw new Error('Output must be scratchpad/claude-port-*.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
const prefix = output.slice(0, -5);
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = base;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
const report = { at: new Date().toISOString(), mode: 'actual onboarding source + access/onboard handlers in memory; fake mailbox and model; no network', checks: [], scenarios: [], requests: [], blockedBrowser: [], forbiddenApi: [], blockedServer: [], pageErrors: [], screenshots: [], servedOnboardJs: [] };
globalThis.fetch = async input => { const url = new URL(String(input?.url || input)); report.blockedServer.push({ origin: url.origin, pathname: url.pathname }); throw new Error('QA physical transport denied'); };
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../netlify/functions/lib/access.mjs');
const handlers = { '/api/access': (await import('../../../netlify/functions/access.mjs')).default, '/api/onboard': (await import('../../../netlify/functions/onboard.mjs')).default };
const sources = ['onboard.html', 'onboard.js', 'onboard.css', 'product-ui.css', 'styles.css', 'netlify/functions/access.mjs', 'netlify/functions/onboard.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/store.mjs'];
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
report.sourceBefore = hashes();
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE, headless: true } : { channel: 'chrome', headless: true });
let ip = 70;

async function newContext(width, row) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1000 ? 900 : 844 }, reducedMotion: 'reduce' });
  const clientIp = '192.0.2.' + (ip++);
  await context.addInitScript(() => {
    // Records every live-region text write. Installed before page scripts; recording starts when window.__liveStart() runs.
    window.__live = []; window.__liveOn = false;
    window.__liveStart = () => { window.__live = []; window.__liveOn = true; };
    const liveOf = node => { let el = node && (node.nodeType === 1 ? node : node.parentElement); while (el) { const role = el.getAttribute('role'), live = el.getAttribute('aria-live'); if (live === 'off') return null; if (['status', 'alert', 'log'].includes(role) || ['polite', 'assertive'].includes(live)) return el; el = el.parentElement; } return null; };
    const observer = new MutationObserver(mutations => {
      if (!window.__liveOn) return;
      const regions = new Set(); mutations.forEach(m => { const region = liveOf(m.target); if (region) regions.add(region); });
      regions.forEach(region => { const text = region.textContent.trim(); if (text && region.getClientRects().length) window.__live.push({ t: Math.round(performance.now()), id: region.id || region.className, text }); });
    });
    document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { subtree: true, childList: true, characterData: true }));
  });
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url()), method = incoming.method();
    if (url.origin !== base) { report.blockedBrowser.push({ origin: url.origin, pathname: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (!handlers[url.pathname]) { report.forbiddenApi.push({ method, path: url.pathname }); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa_route_not_allowed"}' }); }
      if (url.pathname === '/api/access' && method === 'PUT' && row.dropNthPut > 0 && --row.dropNthPut === 0) row.dropPut = true;
      if (url.pathname === '/api/access' && method === 'PUT' && row.dropPut) { row.dropPut = false; row.events.push('PUT lost before the handler ran'); report.requests.push({ id: row.id, method, path: url.pathname, lost: 'before' }); return route.abort('connectionfailed'); }
      if (url.pathname === '/api/access' && method === 'GET' && row.delayGet) { const wait = row.delayGet; row.delayGet = 0; await new Promise(done => setTimeout(done, wait)); }
      const req = new Request(url, { method, headers: incoming.headers(), ...(['GET', 'HEAD'].includes(method) ? {} : { body: incoming.postData() }) });
      const response = await handlers[url.pathname](req, { ip: clientIp });
      const bytes = Buffer.from(await response.arrayBuffer());
      report.requests.push({ id: row.id, method, path: url.pathname, status: response.status });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    const path = resolve(root, relative);
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    if (relative === 'onboard.js') { const served = createHash('sha256').update(readFileSync(path)).digest('hex'); if (!report.servedOnboardJs.includes(served)) report.servedOnboardJs.push(served); }
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  return context;
}
async function openPage(context, row) { const page = await context.newPage(); page.on('pageerror', error => { report.pageErrors.push(row.id + ': ' + error.message); row.pageErrors.push(error.message); }); return page; }
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
async function shot(page, id) { const path = prefix + '-' + id + '.png'; if (existsSync(path)) throw new Error('Refusing to overwrite screenshot ' + path); await page.screenshot({ path, fullPage: false }); report.screenshots.push(path); }
async function signIn(page, email) {
  await page.goto(base + '/onboard.html?plan=starter');
  await page.locator('#access-email').fill(email); await page.locator('#access-send').click();
  await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
  const delivery = await store.get('access_outbox', accessHash(email));
  await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' }); await page.locator('fieldset[data-step="1"].on').waitFor();
  return page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
}
const settled = page => page.waitForFunction(() => !document.getElementById('next').disabled && !/^Saving|not saved yet/.test(document.getElementById('draft-status').textContent), null, { timeout: 15000 });
const quiet = async page => { await settled(page); await page.waitForTimeout(500); await settled(page); };
async function advance(page, from) {
  await page.locator('#next').click();
  await page.locator('fieldset[data-step="' + (from + 1) + '"].on').waitFor({ timeout: 15000 });
  await quiet(page);
}
const live = page => page.evaluate(() => window.__live.slice());
const SETTLED = /^Saved\.|couldn.t confirm|another tab|still on this page|not be confirmed/i, CHATTER = /not saved yet|^Saving/i;
const serverDraft = async session => { const response = await handlers['/api/access'](new Request(base + '/api/access', { headers: { authorization: 'Bearer ' + session, origin: base } }), { ip: '192.0.2.250' }); return (await response.json()).draft; };
async function otherTabWrite(session, fields) {
  const current = await serverDraft(session);
  const response = await handlers['/api/access'](new Request(base + '/api/access', { method: 'PUT', headers: { authorization: 'Bearer ' + session, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { ...current.fields, ...fields }, step: current.step, revision: current.revision }) }), { ip: '192.0.2.251' });
  return response.status;
}
async function scenario(id, width, body) {
  const row = { id: id + '-' + width, kind: id, width, events: [], overflow: [], pageErrors: [] }; report.scenarios.push(row);
  const contexts = [];
  try {
    const context = await newContext(width, row); contexts.push(context);
    const page = await openPage(context, row);
    const session = await signIn(page, `qa-a11y-${id}-${width}@example.test`);
    await quiet(page);
    await body({ page, row, session });
  } catch (error) {
    row.fatal = String(error.stack || error);
    check(`${row.id}: scenario completes`, false, row.fatal.split('\n')[0]);
    const active = contexts.at(-1)?.pages().at(-1); if (active) await shot(active, row.id + '-failure').catch(() => {});
  } finally { for (const context of contexts) await context.close().catch(() => {}); }
  check(`${row.id}: no horizontal scroll`, row.overflow.length > 0 && row.overflow.every(([, over]) => !over), row.overflow);
  check(`${row.id}: no page errors`, row.pageErrors.length === 0, row.pageErrors);
}

for (const width of [1440, 390]) {
  // ---------- Item 1: keyboard finish lands on the ready heading ----------
  await scenario('finish-keyboard', width, async ({ page, row }) => {
    await page.locator('#name').fill('A11y Owner'); await page.locator('#phone').fill('7135550101'); await quiet(page); await advance(page, 1);
    await page.locator('#business').fill('A11y Air ' + width); await page.locator('#trade').selectOption('HVAC'); await page.locator('#services').fill('AC repair'); await page.locator('#serviceArea').fill('Katy'); await page.locator('#spanish').selectOption('no'); await page.locator('#hours').fill('Mon to Fri 7 to 6'); await quiet(page); await advance(page, 2);
    await page.locator('#windows').fill('8 to 12\n12 to 5'); await quiet(page); await advance(page, 3);
    await page.evaluate(() => window.__liveStart());
    await page.locator('#next').focus(); await page.keyboard.press('Enter');
    await page.locator('#done.on').waitFor({ timeout: 20000 }); await page.waitForTimeout(400);
    row.done = await page.evaluate(() => {
      const a = document.activeElement, visible = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
      const h1s = [...document.querySelectorAll('h1')].filter(visible).map(h => h.textContent.trim()), r = a.getBoundingClientRect();
      return { tag: a.tagName, id: a.id, text: a.textContent.trim().slice(0, 80), tabindex: a.getAttribute('tabindex'), visible: visible(a), inView: r.top >= 0 && r.bottom <= innerHeight, h1s, goPortal: document.getElementById('goPortal').textContent.trim(), goHref: document.getElementById('goPortal').getAttribute('href'), buildStatus: document.getElementById('buildStatus').textContent };
    });
    row.live = await live(page); row.overflow.push(['done', await overflow(page)]);
    await shot(page, row.id + '-done');
    row.snapshot = await page.locator('#done').ariaSnapshot();
    check(`${row.id}: focus leaves BODY and lands on the "Your workspace is ready" heading`, row.done.tag !== 'BODY' && /^H[1-6]$/.test(row.done.tag) && row.done.text === 'Your workspace is ready' && row.done.tabindex === '-1', row.done);
    check(`${row.id}: the focused heading is visible and on screen`, row.done.visible && row.done.inView, row.done);
    check(`${row.id}: the done screen has exactly one visible h1, and it is the ready heading`, row.done.h1s.length === 1 && row.done.h1s[0] === 'Your workspace is ready', row.done.h1s);
    check(`${row.id}: the accessibility tree names a level-1 ready heading`, /heading "Your workspace is ready" \[level=1\]/.test(row.snapshot), row.snapshot);
    check(`${row.id}: #goPortal keeps "Continue my connections" and its #setup destination`, row.done.goPortal === 'Continue my connections' && /desk\.html\?c=[^#]+#setup$/.test(row.done.goHref), row.done);
    await page.keyboard.press('Tab'); row.nextTab = await page.evaluate(() => document.activeElement.id);
    check(`${row.id}: Tab from the heading reaches Continue my connections`, row.nextTab === 'goPortal', row.nextTab);
    check(`${row.id}: finishing makes no autosave chatter in live regions`, !row.live.some(w => CHATTER.test(w.text)), row.live);
  });

  // ---------- Item 2: autosave announcements ----------
  await scenario('typing', width, async ({ page, row }) => {
    await page.evaluate(() => { window.__liveStart(); window.__visible = []; new MutationObserver(() => window.__visible.push(document.getElementById('draft-status').textContent)).observe(document.getElementById('draft-status'), { childList: true, characterData: true, subtree: true }); });
    await page.locator('#name').pressSequentially('Keyboard Owner', { delay: 120 });
    await page.locator('#phone').focus(); await page.locator('#phone').pressSequentially('7135550101', { delay: 120 });
    await quiet(page); await page.waitForTimeout(300);
    row.live = await live(page); row.visible = await page.evaluate(() => window.__visible); row.overflow.push(['typed', await overflow(page)]);
    row.finalVisible = await page.locator('#draft-status').innerText();
    if (width < 1000) await shot(page, row.id);
    check(`${row.id}: no live-region write on keystrokes ("Changes not saved yet." or "Saving")`, !row.live.some(w => CHATTER.test(w.text)), row.live.map(w => w.text));
    check(`${row.id}: every live-region write is a settled save outcome`, row.live.length > 0 && row.live.every(w => SETTLED.test(w.text)), row.live.map(w => w.text));
    check(`${row.id}: typing two fields announces at most one outcome per settled save (2)`, row.live.length <= 2, row.live.length);
    check(`${row.id}: the final save is announced`, /^Saved\./.test(row.live.at(-1)?.text || ''), row.live.at(-1));
    check(`${row.id}: the visible status still shows progress and the saved result`, row.visible.some(t => /not saved yet|Saving/.test(t)) && /^Saved\./.test(row.finalVisible), { finalVisible: row.finalVisible, sample: [...new Set(row.visible)] });
  });
  await scenario('step-change', width, async ({ page, row }) => {
    await page.locator('#name').fill('Step Owner'); await page.locator('#phone').fill('7135550101'); await quiet(page);
    await page.evaluate(() => window.__liveStart());
    await advance(page, 1); await page.waitForTimeout(300);
    row.live = await live(page); row.overflow.push(['step2', await overflow(page)]);
    check(`${row.id}: one step change makes at most one live announcement`, row.live.length <= 1, row.live.map(w => w.text));
    check(`${row.id}: the step change announces no "Saving" chatter`, !row.live.some(w => CHATTER.test(w.text)), row.live.map(w => w.text));
  });
  await scenario('lost-save', width, async ({ page, row }) => {
    await page.evaluate(() => window.__liveStart()); row.dropPut = true;
    await page.locator('#name').pressSequentially('Lost Owner', { delay: 60 });
    await page.locator('#draft-status').filter({ hasText: /couldn.t confirm/ }).waitFor(); await page.waitForTimeout(500);
    row.live = await live(page); row.overflow.push(['lost', await overflow(page)]);
    if (width < 1000) await shot(page, row.id);
    check(`${row.id}: an unknown save outcome is announced exactly once`, row.live.filter(w => /couldn.t confirm/.test(w.text)).length === 1 && row.live.length === 1, row.live.map(w => w.text));
  });
  await scenario('conflict', width, async ({ page, row, session }) => {
    row.otherTab = await otherTabWrite(session, { name: 'Other Tab Owner' });
    await page.evaluate(() => window.__liveStart());
    await page.locator('#phone').pressSequentially('7135550101', { delay: 60 });
    await page.locator('#draft-status').filter({ hasText: /another tab/ }).waitFor(); await page.waitForTimeout(500);
    row.live = await live(page); row.overflow.push(['conflict', await overflow(page)]);
    check(`${row.id}: a definite save failure is announced exactly once`, row.otherTab === 200 && row.live.length === 1 && /another tab/.test(row.live[0].text), row.live.map(w => w.text));
  });
}

// ---------- A newer announcement always wins; repeated "Saved" is not re-announced; failures always are ----------
for (const width of [1440, 390]) {
  for (const gap of ['same-task', 'after-settle']) await scenario('stale-after-error-' + gap, width, async ({ page, row }) => {
    // Save and continue is pressed as the autosave shows "Saved.": in the same task (it joins the autosave), or just after the
    // autosave has settled and queued its announcement (QA's A4b, gap 0). The step save is then lost.
    await page.evaluate(gap => { const status = document.getElementById('draft-status'); const press = () => { window.__liveStart(); window.__pressedAt = Math.round(performance.now()); document.getElementById('next').click(); }; const watch = new MutationObserver(() => { if (/^Saved\./.test(status.textContent)) { watch.disconnect(); if (gap === 'same-task') press(); else setTimeout(press, 10); } }); watch.observe(status, { childList: true, characterData: true, subtree: true }); }, gap);
    row.dropNthPut = 2; // the autosave lands; the step save is lost
    await page.locator('#name').fill('Stale Owner'); await page.locator('#phone').fill('7135550101');
    await page.locator('#err').filter({ hasText: /couldn.t confirm/ }).waitFor({ timeout: 15000 }); await page.waitForTimeout(300); // longer than the 100 ms announcement delay, shorter than the 700 ms autosave the blur schedules
    row.live = await live(page); row.pressedAt = await page.evaluate(() => window.__pressedAt); row.overflow.push(['error', await overflow(page)]);
    if (width < 1000) await shot(page, row.id);
    const errorAt = row.live.findIndex(w => w.id === 'err');
    check(`${row.id}: the step-save failure is announced`, errorAt >= 0, row.live);
    check(`${row.id}: no older "Saved" announcement follows the error`, errorAt >= 0 && !row.live.slice(errorAt).some(w => /^Saved\./.test(w.text)) && !/^Saved\./.test(row.live.at(-1)?.text || ''), row.live.map(w => w.id + ': ' + w.text));
    check(`${row.id}: the error summary is the last announcement (nothing queued earlier speaks after it)`, errorAt >= 0 && !row.live.slice(errorAt + 1).some(w => w.id === 'draft-announce'), row.live.map(w => w.t + ' ' + w.id + ': ' + w.text.slice(0, 50)));
  });
  await scenario('repeat-saved', width, async ({ page, row }) => {
    await page.evaluate(() => window.__liveStart());
    await page.locator('#name').fill('Repeat Owner'); await quiet(page);
    await page.locator('#phone').fill('7135550101'); await quiet(page);
    row.dropPut = true; await page.locator('#website').fill('https://repeat.example'); await page.locator('#draft-status').filter({ hasText: /couldn.t confirm/ }).waitFor(); await page.waitForTimeout(400);
    await page.locator('#name').fill('Repeat Owner Two'); await quiet(page); await page.waitForTimeout(300);
    row.live = (await live(page)).map(w => w.text);
    const kinds = row.live.map(t => /^Saved\./.test(t) ? 'saved' : /couldn.t confirm/.test(t) ? 'unknown' : 'other');
    check(`${row.id}: a second "Saved" in a row is not re-announced`, kinds.filter(k => k === 'saved').length === 2 && kinds[0] === 'saved' && kinds[1] !== 'saved', row.live);
    check(`${row.id}: a failure is always announced, and the next success is announced after it`, JSON.stringify(kinds) === JSON.stringify(['saved', 'unknown', 'saved']), row.live);
    row.overflow.push(['after', await overflow(page)]);
  });
}

// ---------- Initial focus: none forced on a fresh load; the current step heading when the form opens ----------
const focusState = page => page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(), described = (a.getAttribute('aria-describedby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' '); return { tag: a.tagName, id: a.id, text: a.textContent.trim().slice(0, 80), tabindex: a.getAttribute('tabindex'), visible: !!a.getClientRects().length, inView: r.bottom > 0 && r.top < innerHeight, described, stepTitle: document.querySelector('#ob fieldset.on')?.dataset.stepTitle, stepLabel: document.getElementById('onboard-step-label').textContent }; });
const onStepHeading = st => st.tag === 'H1' && st.id === 'setup-context-title' && st.tabindex === '-1' && st.text === st.stepTitle && st.visible && st.inView;
for (const width of [1440, 390]) {
  // Fresh load, not signed in: no forced focus. The skip link is the first Tab stop and the gate heading is the h1.
  {
    const row = { id: 'fresh-load-focus-' + width, kind: 'fresh-load-focus', width, events: [], overflow: [], pageErrors: [] }; report.scenarios.push(row);
    const context = await newContext(width, row);
    try {
      const page = await openPage(context, row);
      await page.goto(base + '/onboard.html'); await page.locator('#access-form').waitFor({ state: 'visible' }); await page.waitForTimeout(300);
      row.focus = await focusState(page); await page.keyboard.press('Tab'); row.firstTab = await page.evaluate(() => document.activeElement.textContent.trim());
      row.overflow.push(['gate', await overflow(page)]);
      check(`${row.id}: a fresh load forces no focus and the skip link is the first Tab stop`, row.focus.tag === 'BODY' && row.firstTab === 'Skip to setup', { focus: row.focus.tag, firstTab: row.firstTab });
    } catch (error) { row.fatal = String(error.stack || error); check(`${row.id}: scenario completes`, false, row.fatal.split('\n')[0]); }
    finally { await context.close().catch(() => {}); }
    check(`${row.id}: no page errors`, row.pageErrors.length === 0, row.pageErrors);
  }
  await scenario('verified-focus', width, async ({ page, row }) => {
    row.focus = await focusState(page); row.overflow.push(['opened', await overflow(page)]);
    if (width < 1000) await shot(page, row.id);
    check(`${row.id}: when the form opens after the sign-in link, focus is on the current step heading`, onStepHeading(row.focus), row.focus);
    check(`${row.id}: the step heading carries its position (Step 1 of 4)`, /Step 1 of 4/.test(row.focus.described), row.focus.described);
  });
  await scenario('restore-focus', width, async ({ page, row }) => {
    await page.locator('#name').fill('Restore Owner'); await page.locator('#phone').fill('7135550101'); await quiet(page); await advance(page, 1);
    await page.reload(); await page.locator('#ob').waitFor({ state: 'visible' }); await page.locator('fieldset[data-step="2"].on').waitFor(); await page.waitForTimeout(200);
    row.focus = await focusState(page); row.overflow.push(['restored', await overflow(page)]);
    if (width < 1000) await shot(page, row.id);
    check(`${row.id}: after a restore, focus is on the restored step heading`, onStepHeading(row.focus) && row.focus.stepLabel === 'Step 2 of 4', row.focus);
    check(`${row.id}: the restored step heading carries its position (Step 2 of 4)`, /Step 2 of 4/.test(row.focus.described), row.focus.described);
    await page.keyboard.press('Tab'); row.nextTab = await page.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim().slice(0, 40));
    check(`${row.id}: Tab from the heading continues into the page, not back to the top`, row.nextTab && row.nextTab !== 'Skip to setup', row.nextTab);
  });
  await scenario('no-focus-steal', width, async ({ page, row }) => {
    row.delayGet = 1500; await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.onboard-topbar a').focus(); row.chosen = await page.evaluate(() => document.activeElement.textContent.trim());
    await page.locator('#ob').waitFor({ state: 'visible' }); await page.waitForTimeout(200);
    row.focus = await focusState(page); row.overflow.push(['opened', await overflow(page)]);
    check(`${row.id}: focus the owner placed while the form was loading is left alone`, /Back to site/.test(row.chosen) && row.focus.tag === 'A' && /Back to site/.test(row.focus.text), { chosen: row.chosen, focus: row.focus });
  });
}

await browser.close();
check('No browser request left the fixture origin', report.blockedBrowser.length === 0, report.blockedBrowser);
check('No forbidden API route was requested', report.forbiddenApi.length === 0, report.forbiddenApi);
check('No physical server transport was attempted', report.blockedServer.length === 0, report.blockedServer);
report.sourceAfter = hashes();
check('Exactly one onboard.js was served, and it is the pinned source', report.servedOnboardJs.length === 1 && report.servedOnboardJs[0] === report.sourceBefore['onboard.js'] && (!expectSha || expectSha === report.servedOnboardJs[0]), { served: report.servedOnboardJs, expected: expectSha || null });
check('Source stayed stable throughout the check', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
report.summary = { checks: report.checks.length, passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length };
report.failed = report.checks.filter(c => !c.pass).map(c => ({ name: c.name, detail: c.detail }));
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, servedOnboardJs: report.servedOnboardJs, ...report.summary, failed: report.failed.map(f => f.name) }, null, 1));
if (report.summary.failed) process.exitCode = 1;
