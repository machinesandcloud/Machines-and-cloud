// Causal browser check for the public signup form (index.html #signup-intake, signup-intake.js -> POST /api/intake).
// A new owner at 390 (mobile emulation, touch) and 1440, keyboard-only where noted. Faults: abort before the handler,
// lost response after commit, non-JSON 502, actual JSON 4xx (rate limit), slow reply past the 20 s timeout (fake clock),
// double tap while pending and after success. Actual intake/access handlers in-process, memory store, fake model,
// fake mailbox (access_outbox); outside-origin browser requests and every server fetch are denied.
// Usage (worktree root): node qa-artifacts/claude-collaboration/signup/signup-lost-response-ui-check.mjs --output scratchpad/claude-signup-<name>.json
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), base = 'http://127.0.0.1:8899';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output') || '', playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
if (!/^scratchpad\/claude-signup-[\w-]+\.json$/.test(output)) throw new Error('Output must be scratchpad/claude-signup-*.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
const prefix = output.slice(0, -5);
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|ADMIN_KEY|SITE_ORIGINS|DEPLOY_PRIME_URL|NETLIFY_)/.test(key)) delete process.env[key];
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = base;
const report = { at: new Date().toISOString(), mode: 'actual index.html + signup-intake.js + onboard page; actual intake/access handlers in memory; fake mailbox and model; no network', checks: [], scenarios: [], requests: [], blockedBrowser: [], forbiddenApi: [], blockedServer: [], pageErrors: [], screenshots: [], servedSignupJs: [] };
globalThis.fetch = async input => { const url = new URL(String(input?.url || input)); report.blockedServer.push({ origin: url.origin, pathname: url.pathname }); throw new Error('QA physical transport denied'); };
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../netlify/functions/lib/access.mjs');
const { accountKey } = await import('../../../netlify/functions/lib/accounts.mjs');
const handlers = { '/api/intake': (await import('../../../netlify/functions/intake.mjs')).default, '/api/access': (await import('../../../netlify/functions/access.mjs')).default };
const sources = ['index.html', 'signup-intake.js', 'site-refresh.css', 'styles.css', 'onboard.html', 'onboard.js', 'netlify/functions/intake.mjs', 'netlify/functions/lib/intake.mjs', 'netlify/functions/access.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/store.mjs'];
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
report.sourceBefore = hashes();
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const RAW = /failed to fetch|load failed|networkerror|typeerror|syntaxerror|unexpected token|unexpected end|not valid json|json\.parse|aborted|signal is|abort/i;
const MAYBE_SAVED = /may already be saved/i, RETRY_SAFE = /safe to (?:try again|retry)|won.t (?:create|make) a (?:second|duplicate)/i;
// The no-duplicate promise holds only for unchanged answers; the copy must say so and say what a change does.
const CONDITIONAL = /if you keep the same answers/i, CHANGE_IS_NEW = /if you change an answer, it will be sent as a new signup/i;
const HAS_LIVE = s => s.statusLive !== 'off' && (s.statusRole === 'status' || s.statusLive === 'polite' || s.statusLive === 'assertive');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE, headless: true } : { channel: 'chrome', headless: true });
let ip = 10;
setTimeout(() => { console.error('watchdog: check exceeded 12 minutes'); process.exit(2); }, 12 * 60000).unref();

// row.fault: { when: 'before' | 'after' | 'html502' | 'hold-after', remaining } applies to POST /api/intake.
async function newContext(width, row) {
  const mobile = width < 1000;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}), reducedMotion: 'reduce' });
  const clientIp = '192.0.2.' + (ip++);
  context.setDefaultTimeout(20000); row.onboardHolds = [];
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if (url.origin !== base) { report.blockedBrowser.push({ origin: url.origin, pathname: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (!handlers[url.pathname]) { report.forbiddenApi.push({ method: incoming.method(), path: url.pathname }); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa_route_not_allowed"}' }); }
      const body = ['GET', 'HEAD'].includes(incoming.method()) ? null : incoming.postDataJSON();
      const isIntake = url.pathname === '/api/intake' && incoming.method() === 'POST';
      if (isIntake) row.intakeBodies.push(body);
      const fault = isIntake && row.fault && row.fault.remaining > 0 ? row.fault : null; if (fault) fault.remaining--;
      const log = extra => report.requests.push({ id: row.id, method: incoming.method(), path: url.pathname, action: body?.action, submissionId: body?.submissionId ? String(body.submissionId).slice(0, 8) : undefined, ...extra });
      if (fault?.when === 'before') { row.events.push('aborted POST /api/intake before the handler ran'); log({ lost: 'before' }); return route.abort('connectionfailed'); }
      if (fault?.when === 'html502') { row.events.push('gateway 502 HTML for POST /api/intake (handler not run)'); log({ status: 502, fake: 'html' }); return route.fulfill({ status: 502, contentType: 'text/html', body: '<!doctype html><title>Bad gateway</title><h1>502 Bad Gateway</h1>' }); }
      const req = new Request(url, { method: incoming.method(), headers: incoming.headers(), ...(['GET', 'HEAD'].includes(incoming.method()) ? {} : { body: incoming.postData() }) });
      const response = await handlers[url.pathname](req, { ip: clientIp });
      const bytes = Buffer.from(await response.arrayBuffer());
      log({ status: response.status, ...(fault ? { lost: fault.when } : {}) });
      if (fault?.when === 'after') { row.events.push('lost POST /api/intake response after the handler returned ' + response.status); return route.abort('connectionfailed'); }
      if (fault?.when === 'hold-after' || (isIntake && row.holdAll)) {
        row.events.push('held POST /api/intake response after the handler returned ' + response.status);
        await new Promise(done => { row.release = done; });
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes }).catch(() => row.events.push('held response could not be delivered (request already aborted by the page)'));
      }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    if (url.pathname === '/qa-probe') { row.probe = Object.fromEntries(url.searchParams); return route.fulfill({ status: 204, body: '' }); }
    if (url.pathname === '/onboard.html' && row.onboard204) { row.events.push('navigation to /onboard.html answered 204 (never commits)'); return route.fulfill({ status: 204, body: '' }); }
    if (url.pathname === '/onboard.html' && row.holdOnboard) { row.events.push('held navigation to /onboard.html'); await new Promise(done => { row.onboardHolds.push(done); }); }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    const path = resolve(root, relative);
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    if (relative === 'signup-intake.js') { const served = createHash('sha256').update(readFileSync(path)).digest('hex'); if (!report.servedSignupJs.includes(served)) report.servedSignupJs.push(served); }
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  return context;
}
async function openPage(context, row) { const page = await context.newPage(); page.on('pageerror', error => { report.pageErrors.push(row.id + ': ' + error.message); row.pageErrors.push(error.message); }); return page; }
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
async function shot(page, id) { const path = prefix + '-' + id + '.png'; if (existsSync(path)) throw new Error('Refusing to overwrite screenshot ' + path); await page.screenshot({ path, fullPage: false }); report.screenshots.push(path); }
const press = async (page, row, sel) => { if (row.width < 1000) await page.locator(sel).tap(); else await page.locator(sel).click(); };
async function fill(page, row, values) {
  if (row.keyboard) {
    await page.locator('#intake-name').focus();
    await page.keyboard.type(values.name); await page.keyboard.press('Tab');
    await page.keyboard.type(values.email); await page.keyboard.press('Tab');
    await page.keyboard.type(values.business); // focus stays on Business name, so Enter submits implicitly
    return;
  }
  await page.locator('#intake-name').fill(values.name); await page.locator('#intake-email').fill(values.email); await page.locator('#intake-business').fill(values.business); await page.locator('#intake-goal').selectOption('missed_calls');
}
const settledError = page => page.waitForFunction(() => document.getElementById('intake-status').classList.contains('is-error') && !document.getElementById('intake-submit').disabled, null, { timeout: 30000 });
const formState = page => page.evaluate(() => {
  const status = document.getElementById('intake-status'), active = document.activeElement;
  return { statusRole: status.getAttribute('role'), statusLive: status.getAttribute('aria-live'), status: status.textContent, isError: status.classList.contains('is-error'), focusOnStatus: active === status || (!!active && active.id && status.contains(active)), activeId: active?.id || active?.tagName, buttonEnabled: !document.getElementById('intake-submit').disabled, button: document.getElementById('intake-submit').textContent.replace(/\s*↗\s*/, '').trim(), name: document.getElementById('intake-name').value, email: document.getElementById('intake-email').value, business: document.getElementById('intake-business').value, path: location.pathname };
});
const handoffsFor = async email => { const out = []; for (const key of await store.list('intake_handoffs', '')) { const row = await store.get('intake_handoffs', key); if (row?.email === email) out.push({ key: key.slice(0, 8), business: row.fields?.business }); } return out; };
const prospect = email => store.get('prospects', accountKey(email));
async function unknownOutcomeChecks(row, page, expectSaved) {
  await settledError(page);
  const s = row.lostState = await formState(page); row.overflow.push(['error', await overflow(page)]);
  row.handoffsAfterLoss = await handoffsFor(row.email);
  await shot(page, row.id + '-error');
  check(`${row.id}: unknown outcome shows no raw browser/JSON error text`, s.status && !RAW.test(s.status), s.status);
  check(`${row.id}: unknown outcome says the details may already be saved and retrying is safe`, MAYBE_SAVED.test(s.status) && RETRY_SAFE.test(s.status), s.status);
  check(`${row.id}: unknown outcome names the retry button on the page`, s.status.includes(s.button) && s.buttonEnabled, { status: s.status, button: s.button });
  check(`${row.id}: unknown outcome copy has no em dash`, !/—/.test(s.status), s.status);
  check(`${row.id}: typed values stay and focus moves to the message`, s.name === row.values.name && s.email === row.values.email && s.business === row.values.business && s.focusOnStatus, s);
  check(`${row.id}: the no-second-signup promise is limited to unchanged answers and says a change is a new signup`, CONDITIONAL.test(s.status) && CHANGE_IS_NEW.test(s.status), s.status);
  check(`${row.id}: the focused error is not also in a live region (announced once)`, !(s.focusOnStatus && HAS_LIVE(s)), { role: s.statusRole, live: s.statusLive, focus: s.focusOnStatus });
  check(`${row.id}: store state after the fault matches where it was lost`, row.handoffsAfterLoss.length === (expectSaved ? 1 : 0), row.handoffsAfterLoss);
}
async function retryLandsOnce(row, page) {
  if (row.keyboard) { await page.keyboard.press('Shift+Tab'); row.retryFocus = await page.evaluate(() => document.activeElement?.id); await page.keyboard.press('Enter'); }
  else await press(page, row, '#intake-submit');
  await page.waitForURL('**/onboard.html', { timeout: 15000 });
  const ids = [...new Set(row.intakeBodies.map(b => b.submissionId))], handoffs = await handoffsFor(row.email);
  check(`${row.id}: retry reuses the same submission id and lands in exactly one signup`, ids.length === 1 && handoffs.length === 1 && !!(await prospect(row.email)) && (!row.keyboard || row.retryFocus === 'intake-submit'), { submissionIds: ids.length, posts: row.intakeBodies.length, handoffs, retryFocus: row.retryFocus });
  row.overflow.push(['next', await overflow(page)]);
}

const scenarios = [];
for (const width of [1440, 390]) scenarios.push(['validation', width], ['lost-before-handler', width], ['lost-after-commit', width], ['html-502', width], ['json-4xx-rate-limit', width], ['slow-timeout-after-commit', width], ['double-tap', width], ['edit-after-lost', width], ['keyboard-journey', width], ['edit-copy-and-revert', width], ['stuck-after-success', width], ['server-invalid-email', width], ['expired-410', width]);
for (const [kind, width] of scenarios) {
  const row = { id: kind + '-' + width, kind, width, keyboard: ['keyboard-journey', 'lost-after-commit', 'validation', 'stuck-after-success'].includes(kind), events: [], overflow: [], pageErrors: [], intakeBodies: [] }; report.scenarios.push(row);
  row.email = `qa-signup-${kind}-${width}@example.test`; row.values = { name: 'Signup QA Owner', email: row.email, business: `Signup QA ${kind} ${width}` };
  let context;
  try {
    context = await newContext(width, row);
    const page = await openPage(context, row);
    if (kind === 'slow-timeout-after-commit') await page.clock.install();
    await page.goto(base + '/#pilot'); await page.locator('#signup-intake').waitFor();
    if (kind === 'validation') {
      await page.locator('#intake-submit').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
      const v = await page.evaluate(() => {
        const ids = ['intake-name', 'intake-email', 'intake-business'];
        return { active: document.activeElement?.id, fields: ids.map(id => { const el = document.getElementById(id), described = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(ref => document.getElementById(ref)?.textContent.trim() || ''); return { id, invalid: el.getAttribute('aria-invalid'), described }; }) };
      });
      row.empty = v; row.overflow.push(['empty', await overflow(page)]); await shot(page, row.id + '-empty');
      check(`${row.id}: empty submit (keyboard) focuses the first invalid field and sends nothing`, v.active === 'intake-name' && row.intakeBodies.length === 0, v.active);
      check(`${row.id}: each invalid field is aria-invalid with a visible message tied by aria-describedby`, v.fields.every(f => f.invalid === 'true' && f.described.some(text => text.length > 3)), v.fields);
      await page.locator('#intake-name').fill('   '); await page.locator('#intake-email').fill('owner@'); await page.locator('#intake-business').fill('Bayou Service');
      await page.locator('#intake-business').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
      const w = await page.evaluate(() => ({ active: document.activeElement?.id, nameInvalid: document.getElementById('intake-name').getAttribute('aria-invalid'), nameDesc: (document.getElementById('intake-name').getAttribute('aria-describedby') || '').split(/\s+/).map(r => document.getElementById(r)?.textContent || '').join(' '), emailInvalid: document.getElementById('intake-email').getAttribute('aria-invalid'), emailDesc: (document.getElementById('intake-email').getAttribute('aria-describedby') || '').split(/\s+/).map(r => document.getElementById(r)?.textContent || '').join(' '), businessInvalid: document.getElementById('intake-business').getAttribute('aria-invalid') }));
      row.partial = w;
      check(`${row.id}: whitespace-only name and malformed email are flagged; focus on the first; fixed field cleared`, w.active === 'intake-name' && w.nameInvalid === 'true' && /name/i.test(w.nameDesc) && w.emailInvalid === 'true' && /email/i.test(w.emailDesc) && w.businessInvalid !== 'true' && row.intakeBodies.length === 0, w);
      await page.locator('#intake-name').fill('Signup QA Owner'); await page.locator('#intake-email').fill(row.email);
      await page.locator('#intake-email').focus(); await page.keyboard.press('Enter'); await page.waitForURL('**/onboard.html', { timeout: 15000 });
      check(`${row.id}: corrected form saves once and opens setup`, row.intakeBodies.length === 1 && (await handoffsFor(row.email)).length === 1);
    } else if (kind === 'lost-before-handler' || kind === 'lost-after-commit' || kind === 'html-502') {
      await fill(page, row, row.values);
      row.fault = { when: kind === 'lost-before-handler' ? 'before' : kind === 'html-502' ? 'html502' : 'after', remaining: 1 };
      if (row.keyboard) await page.keyboard.press('Enter'); else await press(page, row, '#intake-submit');
      await unknownOutcomeChecks(row, page, kind === 'lost-after-commit');
      await retryLandsOnce(row, page);
    } else if (kind === 'json-4xx-rate-limit') {
      // Actual handler 429: this email already spent its 3 new signups this hour.
      await store.put('intake_rate', 'email:' + accountKey(row.email), { count: 3, until: Date.now() + 3600000 });
      await fill(page, row, row.values); await press(page, row, '#intake-submit');
      await settledError(page); const s = row.lostState = await formState(page); row.overflow.push(['error', await overflow(page)]); await shot(page, row.id + '-error');
      const last = report.requests.filter(r => r.id === row.id && r.path === '/api/intake').at(-1);
      check(`${row.id}: definite 4xx shows the server message, not unknown-outcome copy`, last?.status === 429 && s.status.includes('Please wait a few minutes before trying again.') && !MAYBE_SAVED.test(s.status) && !RAW.test(s.status), { status: last?.status, text: s.status });
      check(`${row.id}: 4xx keeps typed values and focus moves to the message`, s.name === row.values.name && s.business === row.values.business && s.focusOnStatus, s);
      check(`${row.id}: the focused 4xx message is not also in a live region (announced once)`, s.focusOnStatus && !HAS_LIVE(s), { role: s.statusRole, live: s.statusLive });
      check(`${row.id}: nothing was saved`, (await handoffsFor(row.email)).length === 0);
    } else if (kind === 'slow-timeout-after-commit') {
      await fill(page, row, row.values);
      row.fault = { when: 'hold-after', remaining: 1 };
      await press(page, row, '#intake-submit');
      await page.waitForFunction(() => document.getElementById('intake-submit').disabled && document.getElementById('signup-intake').getAttribute('aria-busy') === 'true');
      await page.waitForFunction(() => /saving/i.test(document.getElementById('intake-status').textContent));
      for (let i = 0; i < 50 && !row.release; i++) await new Promise(done => setTimeout(done, 50));
      await page.clock.runFor(9000); row.slowText = await page.locator('#intake-status').innerText();
      check(`${row.id}: a slow reply tells the owner it is still working and to keep the page open`, /still saving/i.test(row.slowText) && /keep this page open/i.test(row.slowText) && !RAW.test(row.slowText), row.slowText);
      await page.clock.runFor(12000);
      await unknownOutcomeChecks(row, page, true);
      row.release?.(); await page.waitForTimeout(100);
      await page.clock.resume();
      await retryLandsOnce(row, page);
    } else if (kind === 'double-tap') {
      await fill(page, row, row.values);
      row.holdAll = true;
      await press(page, row, '#intake-submit');
      await page.waitForFunction(() => document.getElementById('intake-submit').disabled);
      await page.locator('#intake-submit').dispatchEvent('click'); await page.locator('#signup-intake').evaluate(form => form.requestSubmit()); await page.locator('#intake-business').press('Enter'); await page.waitForTimeout(150);
      check(`${row.id}: second tap, Enter and requestSubmit during a pending save send no extra request`, row.intakeBodies.length === 1, row.intakeBodies.length);
      // After success the page starts opening setup; that navigation is held so a second tap can be tried. The probe runs
      // in the page the moment "Saved" appears (no Playwright evaluate during a pending navigation) and reports via /qa-probe.
      await page.evaluate(() => { const status = document.getElementById('intake-status'), button = document.getElementById('intake-submit'), form = document.getElementById('signup-intake');
        new MutationObserver((_, observer) => { if (!/^Saved/.test(status.textContent)) return; observer.disconnect();
          setTimeout(() => { const disabled = button.disabled; button.click(); form.requestSubmit(); fetch('/qa-probe?disabled=' + disabled).catch(() => {}); }, 50);
        }).observe(status, { childList: true, characterData: true, subtree: true }); });
      row.holdAll = false; row.holdOnboard = true; row.release();
      for (let i = 0; i < 100 && !row.probe; i++) await new Promise(done => setTimeout(done, 50));
      await new Promise(done => setTimeout(done, 300));
      check(`${row.id}: after success, while setup is opening, the button stays locked and another tap/submit sends nothing`, row.probe?.disabled === 'true' && row.intakeBodies.length === 1, { probe: row.probe, posts: row.intakeBodies.length });
      row.holdOnboard = false; row.onboardHolds.forEach(done => done()); await page.waitForURL('**/onboard.html', { timeout: 15000 });
      check(`${row.id}: one signup stored`, (await handoffsFor(row.email)).length === 1);
    } else if (kind === 'edit-after-lost') {
      await fill(page, row, row.values);
      row.fault = { when: 'after', remaining: 1 };
      await press(page, row, '#intake-submit'); await settledError(page);
      row.lostState = await formState(page);
      const edited = row.values.business + ' Edited';
      await page.locator('#intake-business').fill(edited); await press(page, row, '#intake-submit');
      await page.waitForURL('**/onboard.html', { timeout: 15000 });
      const handoffs = await handoffsFor(row.email), p = await prospect(row.email);
      row.after = { handoffs, prospectBusiness: p?.business, posts: row.intakeBodies.length, ids: new Set(row.intakeBodies.map(b => b.submissionId)).size };
      check(`${row.id}: a changed answer after a lost response is sent as a new submission, carries the edit, and keeps one prospect`, row.after.ids === 2 && handoffs.some(h => h.business === edited) && !!p, row.after);
      check(`${row.id}: lost-response copy shows no raw text`, !RAW.test(row.lostState.status), row.lostState.status);
    } else if (kind === 'edit-copy-and-revert') {
      // Lost after commit (v1). The owner edits, the edit is lost after commit too (v2), then changes back to v1.
      await fill(page, row, row.values);
      row.fault = { when: 'after', remaining: 2 };
      await press(page, row, '#intake-submit'); await settledError(page);
      const edited = row.values.business + ' Edited';
      await page.locator('#intake-business').fill(edited);
      const shown = await formState(page); row.copyAfterEdit = shown.status;
      check(`${row.id}: with an answer changed after a lost response, the message on screen does not promise no second signup unconditionally`, CONDITIONAL.test(shown.status) && CHANGE_IS_NEW.test(shown.status) && !RAW.test(shown.status), shown.status);
      await press(page, row, '#intake-submit'); await settledError(page);
      await page.locator('#intake-business').fill(row.values.business); await press(page, row, '#intake-submit');
      await page.waitForURL('**/onboard.html', { timeout: 15000 });
      const ids = row.intakeBodies.map(b => b.submissionId), handoffs = await handoffsFor(row.email);
      row.after = { posts: ids.length, distinctIds: new Set(ids).size, revertReusedFirst: ids[2] === ids[0], handoffs, emailRate: (await store.get('intake_rate', 'email:' + accountKey(row.email)))?.count };
      check(`${row.id}: changing back to the first answers reuses the first submission id (no third signup, no extra rate spend)`, row.after.distinctIds === 2 && row.after.revertReusedFirst && handoffs.length === 2 && row.after.emailRate === 2, row.after);
    } else if (kind === 'stuck-after-success') {
      // Success, but the page change never commits (204). There must be a real, focused way forward.
      row.onboard204 = true;
      await fill(page, row, row.values); await page.keyboard.press('Enter');
      await page.waitForFunction(() => /^Saved/.test(document.getElementById('intake-status').textContent));
      await page.waitForTimeout(800);
      row.stuck = await page.evaluate(() => { const a = [...document.querySelectorAll('#signup-intake a')].find(x => /open your setup/i.test(x.textContent)); return { path: location.pathname, status: document.getElementById('intake-status').textContent, link: a ? a.getAttribute('href') : null, linkFocused: !!a && document.activeElement === a, linkInLive: !!a && !!a.closest('[aria-live="polite"],[aria-live="assertive"],[role="status"],[role="alert"]') }; });
      row.overflow.push(['stuck', await overflow(page)]); await shot(page, row.id + '-stuck');
      check(`${row.id}: after success with a stalled page change, an "Open your setup" link to the handoff is shown and focused`, row.stuck.path === '/' && /^\/onboard\.html#intake=[a-f0-9]{64}$/.test(row.stuck.link || '') && row.stuck.linkFocused, row.stuck);
      check(`${row.id}: the focused link is not inside a live region`, row.stuck.link && !row.stuck.linkInLive, row.stuck);
      row.onboard204 = false; await page.keyboard.press('Enter');
      await page.waitForURL('**/onboard.html', { timeout: 15000 }); await page.locator('#access-email').waitFor({ state: 'visible' });
      row.next = await page.evaluate(() => ({ notice: document.getElementById('intake-notice')?.hidden ? '' : document.getElementById('intake-notice')?.textContent, email: document.getElementById('access-email').value, hash: location.hash }));
      check(`${row.id}: the link (keyboard) opens setup with the saved details, one signup`, /details are saved/i.test(row.next.notice) && row.next.email === row.email && row.intakeBodies.length === 1 && (await handoffsFor(row.email)).length === 1, row.next);
    } else if (kind === 'server-invalid-email') {
      // owner@localhost passes the browser's email check; the actual handler rejects it (400 invalid_email).
      row.values.email = 'qa-signup-invalid-' + width + '@localhost';
      await fill(page, row, row.values); await press(page, row, '#intake-submit');
      await page.waitForFunction(() => !document.getElementById('intake-submit').disabled && document.getElementById('intake-email').getAttribute('aria-invalid') === 'true', null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(150);
      row.after = await page.evaluate(() => { const e = document.getElementById('intake-email'), st = document.getElementById('intake-status'); const desc = (e.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(r => document.getElementById(r)?.textContent || '').join(' '); return { focus: document.activeElement?.id, invalid: e.getAttribute('aria-invalid'), desc, status: st.textContent }; });
      const last = report.requests.filter(r => r.id === row.id && r.path === '/api/intake').at(-1);
      row.overflow.push(['invalid-email', await overflow(page)]); await shot(page, row.id + '-error');
      check(`${row.id}: server invalid_email focuses the email field with the server message tied by aria-describedby`, last?.status === 400 && row.after.focus === 'intake-email' && row.after.invalid === 'true' && row.after.desc.includes('Enter a valid email address.'), { status: last?.status, ...row.after });
      check(`${row.id}: the server message is not duplicated in the status line`, !row.after.status.includes('Enter a valid email address.'), row.after);
      await page.locator('#intake-email').fill('qa-signup-invalid-' + width + '@example.test'); row.values.email = 'qa-signup-invalid-' + width + '@example.test'; row.email = row.values.email;
      await press(page, row, '#intake-submit'); await page.waitForURL('**/onboard.html', { timeout: 15000 });
      check(`${row.id}: the corrected email saves and opens setup`, (await handoffsFor(row.email)).length === 1);
    } else if (kind === 'expired-410') {
      await fill(page, row, row.values);
      row.fault = { when: 'after', remaining: 1 };
      await press(page, row, '#intake-submit'); await settledError(page);
      const firstId = row.intakeBodies[0].submissionId, key = createHash('sha256').update(firstId.toLowerCase()).digest('hex'), sub = await store.get('intake_submissions', key);
      await store.put('intake_submissions', key, { ...sub, expiresAt: new Date(Date.now() - 1000).toISOString() });
      await press(page, row, '#intake-submit'); await settledError(page);
      const s = row.expired = await formState(page); const last = report.requests.filter(r => r.id === row.id && r.path === '/api/intake').at(-1);
      row.overflow.push(['expired', await overflow(page)]); await shot(page, row.id + '-error');
      check(`${row.id}: 410 intake_expired copy names the button that works instead of "Start a new form"`, last?.status === 410 && !/start a new form/i.test(s.status) && s.status.includes(s.button) && s.focusOnStatus && !HAS_LIVE(s), { status: last?.status, text: s.status, focus: s.focusOnStatus, live: s.statusLive });
      await press(page, row, '#intake-submit'); await page.waitForURL('**/onboard.html', { timeout: 15000 });
      check(`${row.id}: one more click sends a fresh submission and opens setup`, new Set(row.intakeBodies.map(b => b.submissionId)).size === 2 && row.intakeBodies.length === 3, row.intakeBodies.length);
    } else {
      // Keyboard-only happy path and the next step (onboard sign-in request through the fake mailbox).
      await fill(page, row, row.values); row.tabPath = [];
      for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); const at = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName); row.tabPath.push(at); if (at === 'intake-submit') break; }
      check(`${row.id}: Tab order from Business name reaches the submit button without hitting the honeypot`, row.tabPath.at(-1) === 'intake-submit' && !row.tabPath.includes('intake-website-confirm'), row.tabPath);
      await page.keyboard.press('Enter');
      await page.waitForURL('**/onboard.html', { timeout: 15000 });
      await page.locator('#access-email').waitFor({ state: 'visible' });
      row.next = await page.evaluate(() => ({ url: location.pathname + location.search + location.hash, notice: document.getElementById('intake-notice')?.hidden ? '' : document.getElementById('intake-notice')?.textContent, email: document.getElementById('access-email').value, active: document.activeElement?.id || document.activeElement?.tagName }));
      row.overflow.push(['next', await overflow(page)]); await shot(page, row.id + '-next');
      check(`${row.id}: keyboard submit opens setup with the saved-details notice and email carried, no PII in URL`, row.next.url === '/onboard.html' && /details are saved/i.test(row.next.notice) && row.next.email === row.email, row.next);
      await page.locator('#access-send').focus(); await page.keyboard.press('Enter');
      await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor({ timeout: 15000 });
      const delivery = await store.get('access_outbox', accessHash(row.email));
      await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible', timeout: 15000 });
      row.carried = { business: await page.locator('#business').inputValue(), name: await page.locator('#name').inputValue() };
      check(`${row.id}: the fake-mailbox link carries the signup answers into setup (no real email)`, row.carried.business === row.values.business && row.carried.name === row.values.name, row.carried);
    }
  } catch (error) {
    row.fatal = String(error.stack || error);
    check(`${row.id}: scenario completes`, false, row.fatal.split('\n')[0]);
    const active = context?.pages().at(-1); if (active) await shot(active, row.id + '-failure').catch(() => {});
  } finally { row.release?.(); (row.onboardHolds || []).forEach(done => done()); await context?.close().catch(() => {}); }
  check(`${row.id}: no horizontal scroll`, row.overflow.length === 0 || row.overflow.every(([, over]) => !over), row.overflow);
  check(`${row.id}: no page errors`, row.pageErrors.length === 0, row.pageErrors);
}
await browser.close();
check('No browser request left the fixture origin', report.blockedBrowser.length === 0, report.blockedBrowser);
check('No forbidden API route was requested', report.forbiddenApi.length === 0, report.forbiddenApi);
check('No physical server transport was attempted', report.blockedServer.length === 0, report.blockedServer);
report.sourceAfter = hashes();
check('Exactly one signup-intake.js was served, and it is the pinned source', report.servedSignupJs.length === 1 && report.servedSignupJs[0] === report.sourceBefore['signup-intake.js'], report.servedSignupJs);
check('Source stayed stable throughout the check', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
report.summary = { checks: report.checks.length, passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length };
report.failed = report.checks.filter(c => !c.pass).map(c => ({ name: c.name, detail: c.detail }));
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, signupJs: report.sourceBefore['signup-intake.js'], ...report.summary, failed: report.failed.map(f => f.name) }, null, 1));
if (report.summary.failed) process.exitCode = 1;
