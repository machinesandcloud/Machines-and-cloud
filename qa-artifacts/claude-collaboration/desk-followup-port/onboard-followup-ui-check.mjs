// Causal browser check for the onboarding follow-up batch.
// 1. Own late autosave: an autosave whose reply is lost commits only after the next autosave has re-read the draft.
//    The next save meets a 409 that no other tab caused. The page must recover with one deliberate re-send on the
//    verified-own revision, keep the newer typing, and still report a genuine other-tab change as a conflict.
// 3. A lost sign-out reply is reported in a visible status, not the hidden gate line.
// 4. Sign-in mode names sign-in in the top bar and <title> while the gate shows; a readable 4xx with no message is worded
//    as a definite rejection.
// 2. Returning-owner copy: onboard.html?mode=signin (the workspace "Email me a sign-in link" target) shows sign-in
//    copy on the email step with the same form and request. Without it the gate is unchanged; ?plan= still works.
// Actual handlers in-process, memory store, fake model and fake mailbox; outside-origin browser requests and every
// server fetch are denied.
// Usage (from the worktree root): node qa-artifacts/claude-collaboration/onboard-followup-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-followup-<name>.json [--expect-onboard-sha256 <hex>]
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), base = 'http://127.0.0.1:8899';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output') || 'scratchpad/claude-followup-check.json', playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
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
const sources = ['onboard.html', 'onboard.js', 'onboard.css', 'product-ui.css', 'netlify/functions/access.mjs', 'netlify/functions/onboard.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/store.mjs'];
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
report.sourceBefore = hashes();
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const RAW = /failed to fetch|load failed|networkerror|typeerror|syntaxerror|unexpected token|unexpected end|not valid json|aborted|signal is/i;
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE, headless: true } : { channel: 'chrome', headless: true });
let ip = 40;

// Row controls for /api/access:
//   row.holdPut: the next PUT is aborted toward the browser and kept; row.held() commits it later (a late commit).
//   row.dropPut: the next PUT is aborted before the handler runs (it never lands).
//   row.getHooks: each GET after arming computes its response, then runs the next hook, then answers. A hook that
//   commits the held save therefore lands it after the page has re-read the draft.
async function newContext(width, row) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1000 ? 900 : 844 }, reducedMotion: 'reduce' });
  const clientIp = '192.0.2.' + (ip++);
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url()), method = incoming.method();
    if (url.origin !== base) { report.blockedBrowser.push({ origin: url.origin, pathname: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (!handlers[url.pathname]) { report.forbiddenApi.push({ method, path: url.pathname }); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa_route_not_allowed"}' }); }
      const body = ['GET', 'HEAD'].includes(method) ? null : incoming.postDataJSON();
      if (body?.action === 'request_link') row.linkBodies.push(body);
      if (row.reject && row.reject.method === method && (!row.reject.action || row.reject.action === body?.action)) { row.reject = null; row.events.push('readable 400 with no message for ' + method + ' ' + (body?.action || url.pathname)); report.requests.push({ id: row.id, method, path: url.pathname, action: body?.action, status: 400, fake: 'no-message' }); return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"qa_rejected"}' }); }
      if (body?.action === 'sign_out' && row.dropSignOut) { row.dropSignOut = false; row.events.push('sign_out lost before the handler ran'); report.requests.push({ id: row.id, method, path: url.pathname, action: 'sign_out', lost: 'before' }); return route.abort('connectionfailed'); }
      if (url.pathname === '/api/access' && method === 'PUT' && (row.holdPut || row.dropPut)) {
        const entry = { revision: body.revision, name: body.fields.name, phone: body.fields.phone, status: row.holdPut ? 'held' : 'lost-before' }; row.puts.push(entry);
        if (row.holdPut) { row.holdPut = false; const held = new Request(url, { method, headers: incoming.headers(), body: incoming.postData() }); row.held = async () => { const r = await handlers[url.pathname](held, { ip: clientIp }); entry.lateStatus = r.status; row.events.push('held PUT committed late with ' + r.status); }; row.events.push('held PUT revision ' + body.revision + '; reply lost'); }
        else { row.dropPut = false; row.events.push('PUT revision ' + body.revision + ' lost before the handler ran'); }
        report.requests.push({ id: row.id, method, path: url.pathname, lost: entry.status });
        return route.abort('connectionfailed');
      }
      const req = new Request(url, { method, headers: incoming.headers(), ...(['GET', 'HEAD'].includes(method) ? {} : { body: incoming.postData() }) });
      const response = await handlers[url.pathname](req, { ip: clientIp });
      const bytes = Buffer.from(await response.arrayBuffer());
      report.requests.push({ id: row.id, method, path: url.pathname, action: body?.action, status: response.status });
      if (url.pathname === '/api/access' && method === 'PUT') row.puts.push({ revision: body.revision, name: body.fields.name, phone: body.fields.phone, status: response.status });
      if (url.pathname === '/api/access' && method === 'GET' && row.getHooks?.length) { const hook = row.getHooks.shift(); await hook(); }
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
async function signIn(page, email, query = '?plan=starter') {
  await page.goto(base + '/onboard.html' + query);
  await page.locator('#access-email').fill(email); await page.locator('#access-send').click();
  await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
  const delivery = await store.get('access_outbox', accessHash(email));
  await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' }); await page.locator('fieldset[data-step="1"].on').waitFor();
  return page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
}
const settledStatus = async page => { await page.waitForFunction(() => { const t = document.getElementById('draft-status').textContent; return /^Saved\.|another tab|confirm whether|still on this page/.test(t) && !/^Saving|not saved yet/.test(t); }, null, { timeout: 15000 }); await page.waitForTimeout(400); await page.waitForFunction(() => !/^Saving|not saved yet/.test(document.getElementById('draft-status').textContent), null, { timeout: 15000 }); return page.locator('#draft-status').innerText(); };
const serverDraft = async session => { const response = await handlers['/api/access'](new Request(base + '/api/access', { headers: { authorization: 'Bearer ' + session, origin: base } }), { ip: '192.0.2.250' }); return (await response.json()).draft; };
async function otherTabWrite(session, fields) {
  const current = await serverDraft(session);
  const response = await handlers['/api/access'](new Request(base + '/api/access', { method: 'PUT', headers: { authorization: 'Bearer ' + session, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ fields: { ...current.fields, ...fields }, step: current.step, revision: current.revision }) }), { ip: '192.0.2.251' });
  return response.status;
}
const OTHER = /another tab/i;

// ---------- Item 1: own late autosave versus a genuine other-tab change ----------
for (const width of [1440, 390]) for (const kind of ['own-late-commit', 'other-tab-after-lost', 'own-late-then-other-tab', 'other-tab-before-resend']) {
  const row = { id: kind + '-' + width, kind, width, events: [], puts: [], linkBodies: [], overflow: [], pageErrors: [] }; report.scenarios.push(row);
  const email = `qa-followup-${kind}-${width}@example.test`, contexts = [];
  try {
    const context = await newContext(width, row); contexts.push(context);
    const page = await openPage(context, row);
    const session = await signIn(page, email);
    const startRevision = (await serverDraft(session)).revision;
    if (kind === 'other-tab-after-lost') row.dropPut = true; else row.holdPut = true;
    await page.locator('#name').fill('Late Owner');
    await page.locator('#draft-status').filter({ hasText: /couldn.t confirm/ }).waitFor();
    row.lostStatus = await page.locator('#draft-status').innerText();
    const putsBefore = row.puts.length;
    if (kind === 'own-late-commit') row.getHooks = [() => row.held()];
    if (kind === 'other-tab-after-lost') { row.otherTab = await otherTabWrite(session, { name: 'Other Tab Owner' }); }
    if (kind === 'own-late-then-other-tab') row.getHooks = [async () => { await row.held(); row.otherTab = await otherTabWrite(session, { name: 'Other Tab Owner' }); }];
    if (kind === 'other-tab-before-resend') row.getHooks = [() => row.held(), async () => { row.otherTab = await otherTabWrite(session, { name: 'Other Tab Owner' }); }];
    await page.locator('#phone').fill('7135550101');
    row.nextStatus = await settledStatus(page);
    row.after = row.puts.slice(putsBefore);
    row.stored = await serverDraft(session); row.stored = { revision: row.stored.revision, name: row.stored.fields.name, phone: row.stored.fields.phone };
    row.page = await page.evaluate(() => ({ name: document.getElementById('name').value, phone: document.getElementById('phone').value }));
    row.overflow.push(['after-next', await overflow(page)]);
    await shot(page, row.id);
    check(`${row.id}: the lost autosave says the outcome is unknown`, /couldn.t confirm whether/i.test(row.lostStatus) && !RAW.test(row.lostStatus), row.lostStatus);
    check(`${row.id}: typed answers stay on the page`, row.page.name === 'Late Owner' && row.page.phone === '7135550101', row.page);
    check(`${row.id}: status copy has no em dash or raw error text`, !/—/.test(row.nextStatus) && !RAW.test(row.nextStatus), row.nextStatus);
    if (kind === 'own-late-commit') {
      check(`${row.id}: the late commit landed after the page re-read the draft`, row.puts[putsBefore - 1]?.lateStatus === 200, row.puts);
      check(`${row.id}: own late save is not reported as another tab`, !OTHER.test(row.nextStatus), row.nextStatus);
      check(`${row.id}: the newer answers are saved`, /^Saved\./.test(row.nextStatus) && row.stored.name === 'Late Owner' && row.stored.phone === '7135550101' && row.stored.revision === startRevision + 2, { status: row.nextStatus, stored: row.stored });
      check(`${row.id}: exactly one re-send after the 409, on the verified-own revision`, row.after.length === 2 && row.after[0].status === 409 && row.after[0].revision === startRevision && row.after[1].status === 200 && row.after[1].revision === startRevision + 1, row.after);
      await page.locator('#name').fill('Late Owner Two'); row.thirdStatus = await settledStatus(page);
      const third = await serverDraft(session);
      check(`${row.id}: the following edit saves on the adopted revision`, /^Saved\./.test(row.thirdStatus) && third.fields.name === 'Late Owner Two' && third.fields.phone === '7135550101' && third.revision === startRevision + 3, { status: row.thirdStatus, revision: third.revision });
      await page.reload(); await page.locator('#ob').waitFor({ state: 'visible' });
      row.reloaded = await page.evaluate(() => ({ name: document.getElementById('name').value, phone: document.getElementById('phone').value }));
      check(`${row.id}: reload keeps everything typed, including the phone number`, row.reloaded.name === 'Late Owner Two' && row.reloaded.phone === '7135550101', row.reloaded);
      if (width < 1000) await shot(page, row.id + '-reloaded');
    } else {
      check(`${row.id}: a genuine other-tab change still shows the conflict`, row.otherTab === 200 && OTHER.test(row.nextStatus) && /still on this page/.test(row.nextStatus), { status: row.nextStatus, otherTab: row.otherTab });
      check(`${row.id}: the other tab's saved answers are not overwritten`, row.stored.name === 'Other Tab Owner' && row.stored.phone !== '7135550101', row.stored);
      const expected = kind === 'other-tab-before-resend' ? 2 : 1;
      check(`${row.id}: ${expected === 2 ? 'the single re-send meets the conflict and is not repeated' : 'no re-send on a revision that is not our own'}`, row.after.length === expected && row.after.every(put => put.status === 409) && (expected === 1 || row.after[1].revision === startRevision + 1), row.after);
    }
  } catch (error) {
    row.fatal = String(error.stack || error);
    check(`${row.id}: scenario completes`, false, row.fatal.split('\n')[0]);
    const active = contexts.at(-1)?.pages().at(-1); if (active) await shot(active, row.id + '-failure').catch(() => {});
  } finally { for (const context of contexts) await context.close().catch(() => {}); }
  check(`${row.id}: no horizontal scroll`, row.overflow.length > 0 && row.overflow.every(([, over]) => !over), row.overflow);
  check(`${row.id}: no page errors`, row.pageErrors.length === 0, row.pageErrors);
}

// ---------- Item 3: a lost sign-out reply is shown where the owner is looking ----------
for (const width of [1440, 390]) {
  const row = { id: 'signout-lost-' + width, kind: 'signout-lost', width, events: [], puts: [], linkBodies: [], overflow: [], pageErrors: [] }; report.scenarios.push(row);
  const contexts = [];
  try {
    const context = await newContext(width, row); contexts.push(context);
    const page = await openPage(context, row);
    await signIn(page, `qa-followup-signout-${width}@example.test`);
    await page.locator('#name').fill('Sign Out Owner'); await page.locator('#draft-status').filter({ hasText: /^Saved\./ }).waitFor();
    row.dropSignOut = true; await page.locator('#access-sign-out').click();
    await page.waitForFunction(() => /signed out/i.test(document.getElementById('draft-status').textContent), null, { timeout: 5000 }).catch(() => {});
    row.lost = await page.evaluate(() => { const s = document.getElementById('draft-status'), g = document.getElementById('access-status'); return { status: s.offsetParent ? s.innerText : '', gateText: g.textContent, gateVisible: !!g.offsetParent, signedIn: !!document.getElementById('access-signed-in').offsetParent, form: !document.getElementById('ob').hidden }; });
    row.overflow.push(['lost', await overflow(page)]);
    await shot(page, row.id);
    check(`${row.id}: a lost sign-out reply is shown in a visible status`, /couldn.t confirm that you were signed out/i.test(row.lost.status) && /still signed in/i.test(row.lost.status) && /Sign out again/.test(row.lost.status), row.lost);
    check(`${row.id}: the lost sign-out message has no raw error text or em dash`, !RAW.test(row.lost.status + row.lost.gateText) && !/—/.test(row.lost.status), row.lost);
    check(`${row.id}: the page stays signed in with the answers`, row.lost.signedIn && row.lost.form && await page.locator('#name').inputValue() === 'Sign Out Owner', row.lost);
    await page.locator('#access-sign-out').click(); await page.locator('#access-gate').waitFor({ state: 'visible' });
    check(`${row.id}: Sign out again signs out`, /Signed out/.test(await page.locator('#access-status').innerText()));
  } catch (error) {
    row.fatal = String(error.stack || error);
    check(`${row.id}: scenario completes`, false, row.fatal.split('\n')[0]);
    const active = contexts.at(-1)?.pages().at(-1); if (active) await shot(active, row.id + '-failure').catch(() => {});
  } finally { for (const context of contexts) await context.close().catch(() => {}); }
  check(`${row.id}: no horizontal scroll`, row.overflow.length > 0 && row.overflow.every(([, over]) => !over), row.overflow);
  check(`${row.id}: no page errors`, row.pageErrors.length === 0, row.pageErrors);
}

// ---------- A readable 4xx with no message is a definite rejection, not an unknown outcome ----------
const UNSURE = /could not confirm|couldn.t confirm/i, REJECTED = /didn.t accept that request/i;
for (const width of [1440, 390]) for (const kind of ['reject-link', 'reject-autosave']) {
  const row = { id: kind + '-' + width, kind, width, events: [], puts: [], linkBodies: [], overflow: [], pageErrors: [] }; report.scenarios.push(row);
  const contexts = [];
  try {
    const context = await newContext(width, row); contexts.push(context);
    const page = await openPage(context, row);
    if (kind === 'reject-link') {
      await page.goto(base + '/onboard.html'); row.reject = { method: 'POST', action: 'request_link' };
      await page.locator('#access-email').fill(`qa-followup-reject-${width}@example.test`); await page.locator('#access-send').click();
      await page.waitForFunction(() => document.getElementById('access-status').getAttribute('data-error') === 'true');
      row.text = await page.locator('#access-status').innerText(); row.formVisible = await page.locator('#access-form').isVisible();
    } else {
      await signIn(page, `qa-followup-reject-${width}@example.test`);
      row.reject = { method: 'PUT' }; await page.locator('#name').fill('Rejected Owner');
      await page.locator('#draft-status').filter({ hasText: /still on this page/ }).waitFor();
      row.text = await page.locator('#draft-status').innerText(); row.formVisible = await page.locator('#name').inputValue() === 'Rejected Owner';
    }
    row.overflow.push(['rejected', await overflow(page)]);
    if (width < 1000) await shot(page, row.id);
    check(`${row.id}: a readable 4xx with no message says the request was not accepted`, REJECTED.test(row.text) && !UNSURE.test(row.text), row.text);
    check(`${row.id}: the rejection copy has no raw error text or em dash, and the owner's input stays`, !RAW.test(row.text) && !/—/.test(row.text) && row.formVisible, { text: row.text, formVisible: row.formVisible });
  } catch (error) {
    row.fatal = String(error.stack || error);
    check(`${row.id}: scenario completes`, false, row.fatal.split('\n')[0]);
    const active = contexts.at(-1)?.pages().at(-1); if (active) await shot(active, row.id + '-failure').catch(() => {});
  } finally { for (const context of contexts) await context.close().catch(() => {}); }
  check(`${row.id}: no horizontal scroll`, row.overflow.length > 0 && row.overflow.every(([, over]) => !over), row.overflow);
  check(`${row.id}: no page errors`, row.pageErrors.length === 0, row.pageErrors);
}

// ---------- Item 2: returning-owner sign-in copy ----------
const gateState = page => page.evaluate(() => ({ docTitle: document.title, topbar: document.querySelector('.onboard-topbar span').textContent, title: document.getElementById('access-title').textContent, intro: document.getElementById('access-intro').textContent, button: document.getElementById('access-send').textContent, gate: document.getElementById('access-gate').innerText, plan: document.querySelector('input[name=plan]:checked')?.value, formVisible: !document.getElementById('access-form').hidden }));
const NEW_TITLE = 'Your business starts here.', NEW_INTRO = 'Enter your email to open your secure setup. No password to remember.', NEW_BUTTON = 'Send my sign-in link';
const SIGNIN_TITLE = 'Sign in to your workspace', SIGNIN_BUTTON = 'Email me a sign-in link';
const SETUP_DOC = 'Set up your front desk | Machines & Cloud', SETUP_BAR = 'Set up your front desk', SIGNIN_DOC = 'Sign in to your workspace | Machines & Cloud';
for (const width of [1440, 390]) {
  const row = { id: 'signin-copy-' + width, kind: 'signin-copy', width, events: [], puts: [], linkBodies: [], overflow: [], pageErrors: [], gates: {} }; report.scenarios.push(row);
  const contexts = [];
  try {
    const context = await newContext(width, row); contexts.push(context);
    const page = await openPage(context, row);
    for (const query of ['', '?plan=starter', '?plan=growth', '?mode=other', '?mode=signin', '?mode=signin&plan=starter', '?plan=starter&mode=signin', '?plan=pro&mode=signin', '?signin=1', '?plan=starter&signin=1']) {
      await page.goto(base + '/onboard.html' + query); await page.locator('#access-form').waitFor({ state: 'visible' });
      row.gates[query || '(none)'] = await gateState(page); row.overflow.push([query, await overflow(page)]);
    }
    const g = row.gates, plain = g['(none)'];
    check(`${row.id}: without mode=signin the email step keeps the new-signup copy`, plain.title === NEW_TITLE && plain.intro === NEW_INTRO && plain.button === NEW_BUTTON, plain);
    check(`${row.id}: ?plan= and an unknown mode leave the gate unchanged`, ['?plan=starter', '?plan=growth', '?mode=other'].every(q => g[q].gate === plain.gate && g[q].button === NEW_BUTTON), Object.fromEntries(['?plan=starter', '?plan=growth', '?mode=other'].map(q => [q, g[q].title])));
    check(`${row.id}: ?plan= still selects the plan`, g['?plan=starter'].plan === 'starter' && g['?plan=growth'].plan === 'growth' && plain.plan === 'growth', { starter: g['?plan=starter'].plan, growth: g['?plan=growth'].plan, none: plain.plan });
    const signinQueries = ['?mode=signin', '?mode=signin&plan=starter', '?plan=starter&mode=signin', '?plan=pro&mode=signin', '?signin=1', '?plan=starter&signin=1'];
    check(`${row.id}: mode=signin (and the site's existing signin=1) shows returning-owner copy on the email step`, signinQueries.every(q => g[q].title === SIGNIN_TITLE && g[q].button === SIGNIN_BUTTON && !/business starts here/i.test(g[q].gate) && g[q].formVisible), Object.fromEntries(signinQueries.map(q => [q, [g[q].title, g[q].button]])));
    check(`${row.id}: mode=signin intro is about the existing workspace and claims no new account or save`, signinQueries.every(q => /workspace/i.test(g[q].intro) && !/create|saved|new account|start/i.test(g[q].intro.replace(/haven.t finished/i, ''))), g['?mode=signin'].intro);
    check(`${row.id}: sign-in mode names sign-in in the top bar and the page title`, signinQueries.every(q => g[q].docTitle === SIGNIN_DOC && g[q].topbar === SIGNIN_TITLE), Object.fromEntries(signinQueries.map(q => [q, [g[q].docTitle, g[q].topbar]])));
    check(`${row.id}: without sign-in mode the top bar and page title keep the setup wording`, ['(none)', '?plan=starter', '?plan=growth', '?mode=other'].every(q => g[q].docTitle === SETUP_DOC && g[q].topbar === SETUP_BAR), Object.fromEntries(['(none)', '?mode=other'].map(q => [q, [g[q].docTitle, g[q].topbar]])));
    check(`${row.id}: mode=signin copy has no em dash`, signinQueries.every(q => !/—/.test(g[q].gate)), g['?mode=signin'].gate);
    check(`${row.id}: mode=signin keeps ?plan= selection`, g['?mode=signin&plan=starter'].plan === 'starter' && g['?plan=starter&mode=signin'].plan === 'starter' && g['?mode=signin'].plan === 'growth' && g['?plan=pro&mode=signin'].plan === 'growth' && g['?plan=starter&signin=1'].plan === 'starter', signinQueries.map(q => g[q].plan));
    // Same form and flow: send, confirmation, change email, then the link opens setup.
    await page.goto(base + '/onboard.html?mode=signin&plan=starter'); await page.locator('#access-form').waitFor({ state: 'visible' });
    if (width < 1000) await shot(page, row.id + '-gate');
    const email = `qa-followup-signin-${width}@example.test`;
    await page.locator('#access-email').fill(email); await page.locator('#access-send').click();
    await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
    row.confirmation = await gateState(page); row.overflow.push(['confirmation', await overflow(page)]);
    if (width < 1000) await shot(page, row.id + '-confirmation');
    check(`${row.id}: mode=signin sends the same request as the plain page`, row.linkBodies.length === 1 && JSON.stringify(Object.keys(row.linkBodies[0]).sort()) === JSON.stringify(['action', 'email', 'plan']) && row.linkBodies[0].action === 'request_link' && row.linkBodies[0].plan === 'starter', row.linkBodies);
    check(`${row.id}: mode=signin reaches the same confirmation`, /Your test link is ready/.test(row.confirmation.title) && !row.confirmation.formVisible, row.confirmation.title);
    await page.locator('#access-change-email').click(); await page.locator('#access-form').waitFor({ state: 'visible' });
    row.changed = await gateState(page);
    check(`${row.id}: Use a different email returns to the sign-in copy and action`, row.changed.title === SIGNIN_TITLE && row.changed.button === SIGNIN_BUTTON, row.changed);
    const delivery = await store.get('access_outbox', accessHash(email));
    await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' });
    check(`${row.id}: the link from mode=signin opens the same setup`, await page.locator('fieldset[data-step="1"].on').isVisible() && await page.locator('input[name=plan]:checked').getAttribute('value') === 'starter');
    // Signed in, then returning through a sign-in link: the setup form opens, so the setup wording returns.
    await page.goto(base + '/onboard.html?mode=signin'); await page.locator('#ob').waitFor({ state: 'visible' });
    row.openedSignedIn = await gateState(page);
    check(`${row.id}: once the setup form opens, the top bar and page title say setup again`, row.openedSignedIn.docTitle === SETUP_DOC && row.openedSignedIn.topbar === SETUP_BAR, [row.openedSignedIn.docTitle, row.openedSignedIn.topbar]);
    if (width < 1000) await shot(page, row.id + '-form-opened');
    await page.locator('#access-sign-out').click(); await page.locator('#access-gate').waitFor({ state: 'visible' });
    row.signedOut = await gateState(page);
    check(`${row.id}: after sign-out in sign-in mode, the gate is named sign-in again`, row.signedOut.docTitle === SIGNIN_DOC && row.signedOut.topbar === SIGNIN_TITLE && row.signedOut.title === SIGNIN_TITLE, [row.signedOut.docTitle, row.signedOut.topbar, row.signedOut.title]);
  } catch (error) {
    row.fatal = String(error.stack || error);
    check(`${row.id}: scenario completes`, false, row.fatal.split('\n')[0]);
    const active = contexts.at(-1)?.pages().at(-1); if (active) await shot(active, row.id + '-failure').catch(() => {});
  } finally { for (const context of contexts) await context.close().catch(() => {}); }
  check(`${row.id}: no horizontal scroll`, row.overflow.length > 0 && row.overflow.every(([, over]) => !over), row.overflow);
  check(`${row.id}: no page errors`, row.pageErrors.length === 0, row.pageErrors);
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
