// Independent responsive/accessibility QA of actual onboarding assets. Browser
// API responses are explicitly synthetic; no signup, email or provider runs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!/^scratchpad\/service-onboarding-qa-ui-[a-z0-9-]+\.json$/.test(output || '') || existsSync(output)) throw new Error('Choose a new service-onboarding-qa-ui receipt.');
const base = 'http://127.0.0.1:8926', files = ['onboard.html', 'onboard.js', 'onboard.css', 'product-ui.css', 'styles.css', 'assets/logo-dark.png', 'assets/logo.png', 'assets/favicon.png'];
const assets = new Map(files.map(file => ['/' + file, readFileSync(file)])), sha = value => createHash('sha256').update(value).digest('hex');
const report = { at: new Date().toISOString(), scope: 'Cached real onboarding HTML/CSS/JS; explicitly mocked owner/draft/create API; headless isolated browser, default-deny outbound. Visual, validation and preserved-field proof only, not signup/service delivery.', before: Object.fromEntries(files.map(file => [file, sha(assets.get('/' + file))])), checks: [], screenshots: [], requests: [], pageErrors: [], externalAttempts: [], physicalNetwork: 0 };
const deny = () => { report.physicalNetwork++; throw new Error('UI QA physical network denied.'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
const contexts = [], token = 'a'.repeat(64);
async function fixture({ width = 375, step = 0, fields = {}, error = null, signedIn = true, success = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce', storageState: { cookies: [], origins: [] } });
  contexts.push(context);
  if (signedIn) await context.addInitScript(value => sessionStorage.setItem('mc-onboarding-session-v1', value), token);
  await context.routeWebSocket('**/*', socket => socket.close());
  const state = { revision: 0, created: [], drafts: [], fields: { name: 'Alex Fixture', phone: '7135550198', business: 'Fixture Plumbing', trade: 'Plumbing', services: 'Drain clearing\nLeak repair', serviceArea: 'Houston', hours: 'Mon to Fri 8 to 5', windows: '8 to 12\n12 to 5', ...fields } };
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { report.externalAttempts.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = req.method(), body = ['POST', 'PUT'].includes(method) ? req.postDataJSON() : null;
      report.requests.push({ method, path: url.pathname });
      if (req.headers().authorization !== 'Bearer ' + token) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"qa_session_required"}' });
      let status = 200, data = {};
      if (url.pathname === '/api/access' && method === 'GET') data = { email: 'qa-owner@example.test', draft: { fields: state.fields, step, revision: state.revision }, marketing: { preference: false } };
      else if (url.pathname === '/api/access' && method === 'PUT') { state.drafts.push(structuredClone(body)); state.revision++; data = { draft: { revision: state.revision } }; }
      else if (url.pathname === '/api/onboard' && method === 'POST') { state.created.push(structuredClone(body)); status = success ? 200 : 422; data = success ? { ok: true, portal: base + '/desk.html?c=fixture-plumbing' } : error || { error: 'qa_stopped_create', message: 'Synthetic browser QA stops before actual account creation.' }; }
      else { status = 404; data = { error: 'qa_unexpected_api' }; }
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    }
    const body = assets.get(url.pathname);
    return route.fulfill(body ? { status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(url.pathname)], body } : { status: 404, body: 'QA asset unavailable' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(base + '/onboard.html?plan=starter');
  await page.locator(signedIn ? '#ob' : '#access-gate').waitFor({ state: 'visible' });
  return { page, state };
}
const check = async (name, run) => { try { await run(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } };
async function shot(page, label) { const path = output.replace(/\.json$/, '') + '-' + label + '.png'; assert.equal(existsSync(path), false); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); }
async function noOverflow(page) { const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(size.document <= size.viewport + 1, JSON.stringify(size)); }
async function nextStep(page, target) { await page.locator('#next').click(); await page.locator('fieldset[data-step="' + target + '"]').waitFor({ state: 'visible' }); }
try {
  for (const width of [320, 375, 1365]) {
    await check(width + ': signed-out entry has clear sign-in and remains inside viewport', async () => { const { page, state } = await fixture({ width, signedIn: false }); await noOverflow(page); assert.equal(await page.locator('h1:visible').count(), 1); assert.equal(await page.locator('#access-email').getAttribute('type'), 'email'); assert.equal(await page.locator('#access-form label').getAttribute('for'), 'access-email'); assert.equal(state.created.length, 0); await shot(page, 'entry-' + width); });
    await check(width + ': saved first step has one active progress stage, readable form and no overflow', async () => { const { page } = await fixture({ width }); await noOverflow(page); assert.equal(await page.locator('.ob-steps > span').count(), 4); assert.equal(await page.locator('.ob-steps [aria-current="step"]').count(), 1); assert.equal(await page.locator('#setup-marketing').isChecked(), false); assert.equal(await page.locator('[name="plan"]:checked').inputValue(), 'starter'); assert.equal(await page.locator('#email').inputValue(), 'qa-owner@example.test'); assert.equal(await page.locator('#phone-routing-settings').isHidden(), true); await shot(page, 'details-' + width); });
    await check(width + ': contact error is focused, red and readable after new layout', async () => { const { page, state } = await fixture({ width, fields: { phone: '' } }); await page.locator('#next').click(); await page.waitForFunction(() => document.getElementById('phone').getAttribute('aria-invalid') === 'true'); const visual = await page.locator('#phone').evaluate(node => { const r = node.getBoundingClientRect(), err = document.getElementById('phone-error'), e = err.getBoundingClientRect(); return { focused: document.activeElement === node, border: getComputedStyle(node).borderColor, fieldTop: r.top, fieldBottom: r.bottom, errorTop: e.top, errorBottom: e.bottom, viewport: innerHeight, described: node.getAttribute('aria-describedby'), text: err.textContent }; }); assert.equal(visual.focused, true); assert.match(visual.border, /180, 35, 24/); assert.ok(visual.fieldTop >= 0 && visual.errorBottom <= visual.viewport, JSON.stringify(visual)); assert.match(visual.described, /phone-hint/); assert.match(visual.described, /phone-error/); assert.ok(visual.text); assert.equal(state.created.length, 0); await noOverflow(page); await shot(page, 'error-' + width); });
    await check(width + ': final preferences are compact, preserve optional rules and use customer language', async () => { const { page, state } = await fixture({ width, step: 3, fields: { never: 'Do not quote whole-house repipes.', tier0: 'Smoke or fire', handoff: 'Warranty questions' } }); await noOverflow(page); assert.equal(await page.locator('#greeting').isVisible(), true); assert.equal(await page.locator('#handoff').isVisible(), true); assert.equal(await page.locator('#never').inputValue(), 'Do not quote whole-house repipes.'); assert.equal(await page.locator('#tier0').inputValue(), 'Smoke or fire'); assert.equal(await page.locator('#never').isVisible(), false); assert.equal(await page.locator('#tier0').isVisible(), false); assert.equal(state.created.length, 0); const copy = await page.locator('fieldset.on').innerText(); assert.doesNotMatch(copy, /tier\s+[01]/i); await shot(page, 'preferences-' + width); });
  }
  await check('Phone selection collects the business line and blocks a callback forwarding loop', async () => {
    const { page, state } = await fixture(); await page.locator('[name="desiredChannels"][value="voice"]').check(); await page.locator('#phone-routing-settings').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#businessNumber').getAttribute('required'), '');
    await page.locator('#next').click(); assert.equal(await page.locator('#businessNumber').getAttribute('aria-invalid'), 'true'); assert.equal(await page.locator('#businessNumber').evaluate(node => document.activeElement === node), true);
    await page.locator('#businessNumber').fill('(713) 555-0198'); await page.locator('#next').click(); assert.equal(await page.locator('#businessNumber').getAttribute('aria-invalid'), 'true'); assert.match(await page.locator('#businessNumber-error').innerText(), /separate|loop/i);
    await page.locator('#businessNumber').fill('(713) 555-0197'); await page.locator('#carrier').selectOption('att'); await page.locator('#forwarding').selectOption('all'); await nextStep(page, 2);
    assert.equal(state.created.length, 0); const saved = state.drafts.at(-1).fields; assert.equal(saved.businessNumber, '(713) 555-0197'); assert.equal(saved.carrier, 'att'); assert.equal(saved.forwarding, 'all');
  });
  await check('Choosing a new number hides irrelevant existing-line requirements and preserves the choice', async () => {
    const { page, state } = await fixture({ fields: { desiredChannels: ['voice'], phoneSetupMode: 'use_new_number', businessNumber: '' } });
    assert.equal(await page.locator('#phone-routing-settings').isVisible(), true); assert.equal(await page.locator('#existing-phone-fields').isHidden(), true); assert.equal(await page.locator('#businessNumber').isDisabled(), true);
    await nextStep(page, 2); assert.equal(state.drafts.at(-1).fields.phoneSetupMode, 'use_new_number'); assert.equal(state.created.length, 0);
  });
  await check('A server error inside collapsed optional rules expands it and focuses the preserved field', async () => {
    const { page, state } = await fixture({ width: 375, step: 3, fields: { never: 'Saved optional policy' }, error: { error: 'invalid_field', field: 'rules.never', message: 'Review this saved business policy.' } });
    assert.equal(await page.locator('#never').isVisible(), false); await page.locator('#next').click(); await page.waitForFunction(() => document.getElementById('never').getAttribute('aria-invalid') === 'true');
    assert.equal(await page.locator('#never').isVisible(), true); assert.equal(await page.locator('#never').evaluate(node => document.activeElement === node && node.closest('details').open), true); assert.equal(await page.locator('#never').inputValue(), 'Saved optional policy'); assert.match(await page.locator('#never-error').innerText(), /saved business policy/); assert.equal(state.created.length, 1);
  });
  await check('All visible questionnaire inputs have accessible names; daily hours have distinct names', async () => {
    const { page } = await fixture({ step: 1 }); await page.locator('.hours-details summary').click();
    const missing = await page.locator('fieldset.on input:not([type="hidden"]), fieldset.on select, fieldset.on textarea').evaluateAll(nodes => nodes.filter(node => { if (!node.getClientRects().length || node.disabled) return false; return !node.labels?.length && !node.getAttribute('aria-label') && !node.getAttribute('aria-labelledby'); }).map(node => node.id || node.name || node.outerHTML));
    assert.deepEqual(missing, []); const names = await page.locator('#hoursRows input').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))); assert.equal(new Set(names).size, 14); assert.ok(names.every(Boolean));
  });
  await check('Expandable policies support keyboard Enter and textarea Enter keeps its normal behavior', async () => {
    const { page } = await fixture({ step: 3 }); const summary = page.locator('details').filter({ has: page.locator('#never') }).locator('summary'); await summary.focus(); await page.keyboard.press('Enter'); await page.locator('#never').waitFor({ state: 'visible' }); await page.locator('#never').fill('No replacement quotes'); await page.keyboard.press('Enter'); assert.equal(await page.locator('#never').inputValue(), 'No replacement quotes\n'); assert.equal(await page.locator('fieldset.on').getAttribute('data-step'), '4');
  });
  await check('Restored final step rejects all missing core business facts before account creation', async () => {
    const { page, state } = await fixture({ step: 3, fields: { trade: '', services: '', serviceArea: '', hours: '', windows: '' } });
    await page.locator('#next').click(); await page.waitForFunction(() => document.getElementById('trade').getAttribute('aria-invalid') === 'true');
    assert.equal(await page.locator('fieldset.on').getAttribute('data-step'), '2');
    assert.equal(await page.locator('#trade').evaluate(node => document.activeElement === node), true);
    for (const id of ['trade', 'services', 'serviceArea', 'hours', 'windows']) assert.equal(await page.locator('#' + id).getAttribute('aria-invalid'), 'true', id);
    assert.equal(state.created.length, 0);
  });
  await check('Unrecognized hours produce specific visible feedback and cannot advance', async () => {
    const { page, state } = await fixture({ step: 1, fields: { hours: 'whenever we feel like it' } });
    await page.locator('#next').click(); await page.waitForFunction(() => document.getElementById('hours').getAttribute('aria-invalid') === 'true');
    assert.equal(await page.locator('#hours').evaluate(node => document.activeElement === node), true); assert.equal(await page.locator('#hours-error').isVisible(), true); assert.match(await page.locator('#hours-error').innerText(), /hours|Monday|Mon|day/i); assert.equal(state.created.length, 0);
  });
  await check('Missing arrival windows block their step and a corrected complete submission declares version 2', async () => {
    const { page, state } = await fixture({ step: 2, fields: { windows: '' } });
    await page.locator('#next').click(); assert.equal(await page.locator('#windows').getAttribute('aria-invalid'), 'true'); assert.equal(state.created.length, 0);
    await page.locator('#windows').fill('8 to 12\n12 to 5'); await nextStep(page, 4); await page.locator('#next').click();
    await page.waitForFunction(() => document.getElementById('err').textContent.includes('Synthetic browser QA'));
    assert.equal(state.created.length, 1); assert.equal(state.created[0].setupVersion, '2');
  });
  await check('Successful fixture completion gives one clear review action into the same private workspace', async () => {
    const { page, state } = await fixture({ step: 3, success: true }); await page.locator('#next').click(); await page.locator('#done.on').waitFor({ state: 'visible' });
    assert.equal(state.created.length, 1); assert.equal(await page.locator('#ob').isHidden(), true); assert.equal(await page.locator('#goPortal').innerText(), 'Review my front desk'); assert.equal(await page.locator('#goPortal').getAttribute('href'), base + '/desk.html?c=fixture-plumbing#know'); assert.match(await page.locator('#buildStatus').innerText(), /Review|review/); assert.doesNotMatch(await page.locator('#buildStatus').innerText(), /phone.*active|texting.*active|all.*connected/i);
  });
} finally {
  for (const context of contexts) await context.close(); await browser.close();
  report.after = Object.fromEntries(files.map(file => [file, sha(readFileSync(file))])); report.sourceStable = JSON.stringify(report.before) === JSON.stringify(report.after);
  report.summary = { passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, total: report.checks.length };
  report.ok = report.summary.failed === 0 && report.sourceStable && report.pageErrors.length === 0 && report.physicalNetwork === 0;
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ ok: report.ok, summary: report.summary, sourceStable: report.sourceStable, failures: report.checks.filter(row => !row.pass), output }, null, 2)); if (!report.ok) process.exitCode = 1;
}
