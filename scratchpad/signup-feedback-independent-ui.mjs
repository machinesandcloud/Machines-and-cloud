// Independent customer/operator feedback QA using actual frozen page assets.
// API responses are protocol fixtures; all browser/server egress is denied.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, resolve } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const suffix = process.argv[2] || 'r1';
assert.match(suffix, /^r[1-9][0-9]*$/);
const output = 'scratchpad/signup-feedback-independent-ui-' + suffix + '.json';
if (existsSync(output)) throw Error('Preserve prior QA evidence');
const root = resolve('.'), base = 'http://127.0.0.1:8977';
const files = ['onboard.html', 'onboard.js', 'onboard.css', 'admin.html', 'admin.js', 'admin.css', 'product-ui.css', 'styles.css'];
const hash = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(path => [path, hash(readFileSync(path))]));
const assets = new Map(files.map(path => [path, readFileSync(path)]));
const report = { at: new Date().toISOString(), boundary: 'Actual customer/operator browser assets with local API fixtures and stubbed authenticated destinations. No provider/account/native-browser access, real emails, deployment or external HTTP.', sourceBefore: hashes(), checks: [], cases: [], screenshots: [], pageErrors: [], externalBlocked: [], nodeHTTPAttempts: 0 };
const deny = () => { report.nodeHTTPAttempts++; throw Error('QA prohibits networking'); };
globalThis.fetch = deny; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
const config = {
  customer: { path: '/onboard.html', endpoint: '/api/access', form: '#access-form', email: '#access-email', send: '#access-send', confirmation: '#access-confirmation', recipient: '#access-recipient', title: '#access-title', status: '#access-status', intro: '#access-intro', help: '#access-delivery-help', resend: '#access-resend', change: '#access-change-email', gate: '#access-gate' },
  operator: { path: '/admin.html', endpoint: '/api/manage', form: '#loginForm', email: '#adminEmail', send: '#requestLink', confirmation: '#loginConfirmation', recipient: '#loginRecipient', title: '#loginTitle', status: '#loginStatus', intro: '#loginIntro', help: '#loginDeliveryHelp', resend: '#resendLink', change: '#changeEmail', gate: '#login' }
};
const accepted = { status: 202, body: { ok: true, delivery: 'email', message: 'Check your inbox for a link to continue. It expires in 20 minutes.' } };
const token = 'b'.repeat(64), session = 'c'.repeat(64);
async function fixture(kind, options = {}) {
  const c = config[kind], width = options.width || 390, name = options.name || kind;
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  const s = { c, context, requests: [], replies: [...(options.replies || [])], getReplies: [...(options.getReplies || [])], exchangeReplies: [...(options.exchangeReplies || [])], releases: [], reached: 0, name };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.addInitScript(({ intake, scaleTimeout, operatorSession }) => {
    if (intake) sessionStorage.setItem('mc-signup-intake-v1', JSON.stringify(intake));
    if (operatorSession) sessionStorage.setItem('mc-operator-session-v1', operatorSession);
    if (scaleTimeout) {
      const set = window.setTimeout;
      window.setTimeout = function (fn, milliseconds, ...args) { return set(fn, milliseconds === 20000 ? 100 : milliseconds, ...args); };
    }
  }, { intake: options.intake, scaleTimeout: options.scaleTimeout, operatorSession: options.operatorSession });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { report.externalBlocked.push({ name, origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      let body; try { body = request.postDataJSON(); } catch {}
      s.requests.push({ path: url.pathname, method: request.method(), body, authorization: request.headers().authorization || null });
      const respond = (status, value) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) }).catch(() => {});
      if (url.pathname !== c.endpoint) return respond(500, { error: 'qa_unexpected_api' });
      if (body?.action === 'request_link') {
        const response = s.replies.shift() || accepted;
        if (response.hold) { s.reached++; await new Promise(done => s.releases.push(done)); }
        if (response.network) return route.abort('failed').catch(() => {});
        if (response.raw !== undefined) return route.fulfill({ status: response.status || 200, contentType: 'application/json', body: response.raw }).catch(() => {});
        return respond(response.status || 202, response.body || accepted.body);
      }
      if (body?.action === 'exchange') { const result = s.exchangeReplies.shift(); return result ? respond(result.status, result.body) : respond(200, { ok: true, session, email: 'qa+access@example.test' }); }
      if (body?.action === 'sign_out') return respond(200, { ok: true });
      if (request.method() === 'GET') {
        const result = s.getReplies.shift(); if (result) { if (result.hold) { s.reached++; await new Promise(done => s.releases.push(done)); } return respond(result.status, result.body); }
        if (kind === 'operator') return respond(200, { ok: true, operator: { email: 'qa-operator@example.test' }, customers: [], summary: { customers: 0, active: 0, needsAttention: 0, setupPending: 0 }, inquiries: { contacts: [] }, system: { scheduler: { blocks: [] }, providerStates: {} } });
        return respond(200, options.state || { ok: true, email: 'qa+access@example.test', draft: { fields: { name: 'QA Owner', phone: '7135550142' }, revision: 3, step: 0 }, marketing: { preference: false } });
      }
      if (request.method() === 'PUT') return respond(200, { ok: true, draft: { revision: (body.revision || 0) + 1 } });
      return respond(500, { error: 'qa_unexpected_write' });
    }
    if (url.pathname === '/desk.html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><h1 id="qa-workspace">Authenticated destination fixture</h1>' });
    const path = decodeURIComponent(url.pathname.slice(1)), file = resolve(root, path);
    if (!file.startsWith(root + '/') || !existsSync(file) || statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'QA asset unavailable' });
    if (!assets.has(path)) assets.set(path, readFileSync(file));
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' })[extname(path)] || 'application/octet-stream', body: assets.get(path) });
  });
  s.page = await context.newPage(); s.page.setDefaultTimeout(3000);
  await s.page.clock.install({ time: new Date('2026-10-24T12:30:00.000Z') });
  s.page.on('pageerror', error => report.pageErrors.push({ name, error: error.message }));
  s.go = fragment => s.page.goto(base + c.path + (options.search || '') + (fragment || ''));
  s.send = async (email = 'qa+access@example.test') => { await s.page.locator(c.email).fill(email); await s.page.locator(c.email).press('Enter'); };
  s.sent = () => s.requests.filter(row => row.body?.action === 'request_link');
  s.release = () => { s.releases.splice(0).forEach(done => done()); };
  s.close = async () => { s.release(); report.cases.push({ name, kind, width, requests: s.requests, finalURL: s.page.url() }); await context.close(); };
  return s;
}
async function test(name, fn) { try { await fn(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message, stack: error.stack?.slice(0, 1000) }); } }
async function withFixture(kind, options, fn) { const s = await fixture(kind, options); try { await s.go(options.fragment); await fn(s); } finally { await s.close(); } }
async function title(s) { return (await s.page.locator(s.c.title).textContent()).trim(); }
async function waitForAccepted(s) { await s.page.locator(s.c.confirmation).waitFor({ state: 'visible' }); await s.page.waitForFunction(selector => document.querySelector(selector).getAttribute('aria-busy') !== 'true', s.c.gate); }
async function shot(s, label) { const path = 'scratchpad/signup-feedback-independent-' + suffix + '-' + label + '.png'; if (existsSync(path)) throw Error('Preserve prior screenshot'); await s.page.screenshot({ path, fullPage: true }); report.screenshots.push(path); }
try {
  for (const kind of ['customer', 'operator']) {
    for (const width of [320, 390, 1440]) await test(kind + ' ' + width + ': prominent email confirmation, exact address, focus, responsive layout, resend and correction', () => withFixture(kind, { name: kind + '-ordinary-' + width, width }, async s => {
      const email = 'Firstname.Lastname+updates.from.the.jobsite@subdepartment.example.test';
      await s.send(email); await waitForAccepted(s);
      assert.equal(await title(s), 'Check your email'); assert(!await s.page.locator(s.c.form).isVisible()); assert.equal(await s.page.locator(s.c.recipient).textContent(), email); assert.equal(await s.page.evaluate(() => document.activeElement.id), s.c.title.slice(1));
      assert.equal(await s.page.locator(s.c.title).getAttribute('tabindex'), '-1'); assert.equal(await s.page.locator(s.c.status).getAttribute('aria-live'), 'polite');
      assert(!await s.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));
      assert.doesNotMatch(await s.page.locator(s.c.gate).textContent(), /delivered to your inbox|in your inbox now/i);
      assert(await s.page.locator(s.c.resend).isDisabled()); assert(!await s.page.locator(s.c.change).isDisabled()); assert.equal(s.sent().length, 1);
      await shot(s, kind + '-confirmed-' + width);
      await s.page.clock.fastForward(31000); assert(!await s.page.locator(s.c.resend).isDisabled());
      await s.page.locator(s.c.resend).click(); await waitForAccepted(s); assert.equal(s.sent().length, 2); assert(s.sent().every(row => row.body.email === email)); assert(await s.page.locator(s.c.resend).isDisabled());
      await s.page.locator(s.c.change).click(); assert(await s.page.locator(s.c.form).isVisible()); assert(!await s.page.locator(s.c.confirmation).isVisible()); assert.equal(await s.page.locator(s.c.email).inputValue(), email); assert.equal(await s.page.evaluate(() => document.activeElement.id), s.c.email.slice(1)); assert.equal(s.sent().length, 2);
      await s.send('corrected@example.test'); await waitForAccepted(s); assert.equal(await s.page.locator(s.c.recipient).textContent(), 'corrected@example.test'); assert.equal(s.sent().at(-1).body.email, 'corrected@example.test'); assert.equal(s.sent().length, 3);
    }));
    await test(kind + ': pending send prevents duplicate Enter/programmatic submits and shows busy state', () => withFixture(kind, { name: kind + '-pending', replies: [{ ...accepted, hold: true }] }, async s => {
      await s.send(); await s.page.waitForFunction(selector => document.querySelector(selector).disabled, s.c.send);
      await s.page.evaluate(selector => { const f = document.querySelector(selector); f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }, s.c.form);
      assert.equal(s.sent().length, 1); assert(await s.page.locator(s.c.email).isDisabled()); assert.equal(await s.page.locator(s.c.gate).getAttribute('aria-busy'), 'true'); assert.match(await s.page.locator(s.c.status).textContent(), /prepar|send|request/i);
      s.release(); await waitForAccepted(s); assert.equal(s.sent().length, 1);
    }));
    await test(kind + ': invalid and empty addresses do not submit', () => withFixture(kind, { name: kind + '-invalid' }, async s => {
      await s.page.locator(s.c.send).click(); assert.equal(s.sent().length, 0); await s.send('not-an-email'); assert.equal(s.sent().length, 0); assert(await s.page.locator(s.c.form).isVisible()); assert(!await s.page.locator(s.c.confirmation).isVisible());
    }));
    await test(kind + ': hidden form submit cannot bypass accepted-state resend controls', () => withFixture(kind, { name: kind + '-hidden-submit' }, async s => {
      await s.send(); await waitForAccepted(s); await s.page.evaluate(selector => document.querySelector(selector).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), s.c.form); assert.equal(s.sent().length, 1); assert(await s.page.locator(s.c.resend).isDisabled()); assert(await s.page.locator(s.c.confirmation).isVisible());
    }));
    await test(kind + ': local test inbox never claims a real email was sent', () => withFixture(kind, { name: kind + '-outbox', replies: [{ status: 202, body: { ok: true, delivery: 'test_outbox', message: 'A link was saved in the local test inbox. No email was sent.' } }] }, async s => {
      await s.send(); await waitForAccepted(s); assert.equal(await title(s), 'Your test link is ready'); assert.match(await s.page.locator(s.c.gate).textContent(), /No email was sent/); assert.doesNotMatch(await s.page.locator(s.c.intro).textContent(), /on its way/i);
    }));
    for (const status of [400, 429, 500, 503]) await test(kind + ': known rejection ' + status + ' is visible, focused, recoverable and never confirmed', () => withFixture(kind, { name: kind + '-reject-' + status, replies: [{ status, body: { error: status === 429 ? 'rate_limited' : 'email_unavailable', message: 'QA request was rejected. Please wait before requesting another link.' } }] }, async s => {
      await s.send(); await s.page.waitForFunction(selector => document.querySelector(selector).textContent.includes('QA request was rejected'), s.c.status); assert(await s.page.locator(s.c.form).isVisible()); assert(!await s.page.locator(s.c.confirmation).isVisible()); assert.equal(await s.page.evaluate(() => document.activeElement.id), s.c.status.slice(1)); assert(!await s.page.locator(s.c.email).isDisabled()); assert.equal(s.sent().length, 1); assert.equal(await s.page.locator(s.c.email).inputValue(), 'qa+access@example.test');
    }));
    await test(kind + ': rejected resend preserves earlier accepted address and gives focused current failure', () => withFixture(kind, { name: kind + '-resend-rejected', replies: [accepted, { status: 429, body: { error: 'rate_limited', message: 'Please wait before requesting another sign-in email.' } }] }, async s => {
      await s.send(); await waitForAccepted(s); await s.page.clock.fastForward(31000); await s.page.locator(s.c.resend).click(); await s.page.waitForFunction(selector => document.querySelector(selector).textContent.includes('Please wait'), s.c.status); assert(await s.page.locator(s.c.confirmation).isVisible()); assert.equal(await s.page.locator(s.c.recipient).textContent(), 'qa+access@example.test'); assert.match(await s.page.locator(s.c.status).textContent(), /Please wait/); assert.equal(await s.page.evaluate(() => document.activeElement.id), s.c.status.slice(1)); assert.equal(s.sent().length, 2);
    }));
    for (const response of [
      { label: 'ok-false', status: 202, body: { ok: false, message: 'The email was not accepted.' } },
      { label: 'error-in-200', status: 200, body: { error: 'email_unavailable', message: 'The email was not accepted.' } },
      { label: 'unsupported-delivery', status: 202, body: { ok: true, delivery: 'delivered_to_mailbox', message: 'Unexpected result' } },
      { label: 'broken-json', status: 202, raw: '{"ok":' },
      { label: 'missing-ok', status: 200, body: { message: 'Check your email' } }
    ]) await test(kind + ': malformed response ' + response.label + ' cannot imply confirmed send', () => withFixture(kind, { name: kind + '-malformed-' + response.label, replies: [response] }, async s => {
      await s.send(); await s.page.waitForFunction(selector => document.querySelector(selector).getAttribute('aria-busy') !== 'true', s.c.gate); const text = await s.page.locator(s.c.gate).textContent(); assert.doesNotMatch(await s.page.locator(s.c.intro).textContent(), /on its way|has been sent|email sent/i); assert.notEqual(await title(s), 'Check your email'); assert.match(text, /couldn.t confirm|not accepted|could not confirm/i); assert.equal(s.sent().length, 1);
    }));
    await test(kind + ': transport failure is uncertain, never auto-resends, requires explicit controlled retry', () => withFixture(kind, { name: kind + '-network', replies: [{ network: true }, accepted] }, async s => {
      await s.send(); await waitForAccepted(s); assert.equal(await title(s), 'Check your inbox first'); assert.match(await s.page.locator(s.c.gate).textContent(), /couldn.t confirm|could not confirm/i); assert.equal(s.sent().length, 1); assert(await s.page.locator(s.c.resend).isDisabled()); await s.page.clock.fastForward(31000); assert.equal(s.sent().length, 1); await s.page.locator(s.c.resend).click(); await waitForAccepted(s); assert.equal(await title(s), 'Check your email'); assert.equal(s.sent().length, 2);
    }));
    await test(kind + ': timeout gives unknown result; late fulfillment cannot become false success', () => withFixture(kind, { name: kind + '-timeout', replies: [{ ...accepted, hold: true }] }, async s => {
      await s.send(); await s.page.waitForFunction(selector => document.querySelector(selector).disabled, s.c.send); await s.page.clock.fastForward(20001); await waitForAccepted(s); assert.equal(await title(s), 'Check your inbox first'); assert.equal(s.sent().length, 1); s.release(); await s.page.evaluate(() => new Promise(done => requestAnimationFrame(done))); assert.equal(await title(s), 'Check your inbox first'); assert.equal(s.sent().length, 1); await shot(s, kind + '-unknown-timeout');
    }));
  }
  await test('operator conditional202 retains account privacy and avoids claiming an email was actually sent', () => withFixture('operator', { name: 'operator-conditional', replies: [{ status: 202, body: { ok: true, message: 'If this email has operator access, a sign-in link will arrive shortly.' } }] }, async s => {
    await s.send('not-authorized@example.test'); await waitForAccepted(s); assert.match(await s.page.locator(s.c.intro).textContent(), /^If this address has operator access/); assert.doesNotMatch(await s.page.locator(s.c.intro).textContent(), /on its way|email was sent/i); assert.equal(await s.page.locator(s.c.recipient).textContent(), 'not-authorized@example.test'); assert.equal(s.sent().length, 1); await shot(s, 'operator-conditional');
  }));
  await test('customer request preserves preliminary handoff and selected plan across resend and address correction', () => withFixture('customer', { name: 'customer-intake', search: '?plan=starter', intake: { handoff: 'a'.repeat(64), email: 'intake@example.test', expiresAt: '2026-10-24T14:00:00.000Z' } }, async s => {
    assert.equal(await s.page.locator(s.c.email).inputValue(), 'intake@example.test'); await s.page.locator(s.c.email).press('Enter'); await waitForAccepted(s); await s.page.clock.fastForward(31000); await s.page.locator(s.c.resend).click(); await waitForAccepted(s); await s.page.locator(s.c.change).click(); await s.send('corrected-intake@example.test'); await waitForAccepted(s); assert.equal(s.sent().length, 3); for (const row of s.sent()) { assert.equal(row.body.plan, 'starter'); assert.equal(row.body.intake, 'a'.repeat(64)); } assert(await s.page.evaluate(() => !!sessionStorage.getItem('mc-signup-intake-v1')));
  }));
  await test('customer automatic email-token routing supersedes an older pending email response', () => withFixture('customer', { name: 'customer-late-generation', replies: [{ ...accepted, hold: true }] }, async s => {
    await s.send(); await s.page.waitForFunction(selector => document.querySelector(selector).disabled, s.c.send); await s.page.evaluate(value => { location.hash = 'verify=' + value; }, token); await s.page.locator('#ob').waitFor({ state: 'visible' }); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1')), session); s.release(); await s.page.evaluate(() => new Promise(done => requestAnimationFrame(done))); assert(!await s.page.locator(s.c.gate).isVisible()); assert(await s.page.locator('#ob').isVisible()); assert.equal(s.sent().length, 1); assert.equal(s.requests.filter(row => row.body?.action === 'exchange').length, 1);
  }));
  await test('customer accepted-send state does not prevent automatic initial email link routing to existing workspace', () => withFixture('customer', { name: 'customer-direct-workspace', fragment: '#verify=' + token, state: { ok: true, email: 'qa+access@example.test', existing: { slug: 'qa-shop', portal: base + '/desk.html?c=qa-shop' } } }, async s => {
    await s.page.waitForURL('**/desk.html?c=qa-shop'); assert.equal(s.sent().length, 0); assert.equal(s.requests.filter(row => row.body?.action === 'exchange').length, 1); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1')), session);
  }));
  await test('customer stale hidden change-email control cannot interrupt held verified-account loading', () => withFixture('customer', { name: 'customer-hidden-change-during-verification', fragment: '#verify=' + token, getReplies: [{ hold: true, status: 200, body: { ok: true, email: 'qa+access@example.test', draft: { fields: { name: 'QA Owner' }, revision: 2, step: 0 }, marketing: { preference: false } } }] }, async s => {
    await s.page.waitForFunction(() => document.querySelector('#access-gate').getAttribute('aria-busy') === 'true'); assert(!await s.page.locator(s.c.form).isVisible()); assert(!await s.page.locator(s.c.confirmation).isVisible()); await s.page.locator(s.c.change).evaluate(button => button.click()); assert(!await s.page.locator(s.c.form).isVisible()); assert.equal(await title(s), 'Signing you in…'); assert.equal(s.sent().length, 0); s.release(); await s.page.locator('#ob').waitFor({ state: 'visible' }); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1')), session); assert.equal(s.requests.filter(row => row.body?.action === 'exchange').length, 1);
  }));
  await test('operator email proof retains intentional explicit confirmation and separate operator session', () => withFixture('operator', { name: 'operator-verify', fragment: '#verify=' + token }, async s => {
    assert(await s.page.locator('#verifyPanel').isVisible()); assert(!await s.page.locator(s.c.form).isVisible()); assert.equal(s.requests.filter(row => row.body?.action === 'exchange').length, 0); await s.page.locator('#verifyLink').click(); await s.page.locator('#app').waitFor({ state: 'visible' }); assert.equal(s.sent().length, 0); assert.equal(s.requests.filter(row => row.body?.action === 'exchange').length, 1); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-operator-session-v1')), session); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1')), null);
  }));
  await test('operator expired proof opens a fresh-email form instead of trapping user behind Continue', () => withFixture('operator', { name: 'operator-expired-proof', fragment: '#verify=' + token, exchangeReplies: [{ status: 410, body: { error: 'invalid_link', message: 'This sign-in link expired or was already used. Request a new one.' } }] }, async s => {
    await s.page.locator('#verifyLink').click(); await s.page.locator(s.c.form).waitFor({ state: 'visible' }); assert(!await s.page.locator('#verifyPanel').isVisible()); assert.match(await s.page.locator(s.c.gate).textContent(), /expired|fresh|new.*link/i); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-operator-session-v1')), null); await s.send('qa-operator@example.test'); await waitForAccepted(s); assert.equal(s.sent().length, 1); assert.equal(s.requests.filter(row => row.body?.action === 'exchange').length, 1);
  }));
  await test('operator successful exchange then state503 retries only account read with retained session', () => withFixture('operator', { name: 'operator-exchanged-state-retry', fragment: '#verify=' + token, getReplies: [{ status: 503, body: { error: 'management_unavailable', message: 'The account service is temporarily unavailable. Retry opening the portal.' } }] }, async s => {
    await s.page.locator('#verifyLink').click(); await s.page.waitForFunction(() => document.querySelector('#verifyLink').textContent.includes('Try opening')); assert(!await s.page.locator(s.c.form).isVisible()); assert(await s.page.locator('#verifyPanel').isVisible()); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-operator-session-v1')), session); assert.equal(s.sent().length, 0); await s.page.locator('#verifyLink').click(); await s.page.locator('#app').waitFor({ state: 'visible' }); assert.equal(s.requests.filter(row => row.body?.action === 'exchange').length, 1); assert.equal(s.requests.filter(row => row.method === 'GET').length, 2); assert.equal(s.sent().length, 0); assert(s.requests.filter(row => row.method === 'GET').every(row => row.authorization === 'Bearer ' + session));
  }));
  await test('operator returning stored session state503 retries account read without sending/reusing proof', () => withFixture('operator', { name: 'operator-stored-state-retry', operatorSession: session, getReplies: [{ status: 503, body: { error: 'management_unavailable', message: 'The account service is temporarily unavailable. Retry opening the portal.' } }] }, async s => {
    await s.page.waitForFunction(() => document.querySelector('#verifyLink').textContent.includes('Try opening')); assert(!await s.page.locator(s.c.form).isVisible()); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-operator-session-v1')), session); await s.page.locator('#verifyLink').click(); await s.page.locator('#app').waitFor({ state: 'visible' }); assert.equal(s.requests.filter(row => row.method === 'GET').length, 2); assert.equal(s.requests.filter(row => row.body?.action === 'exchange').length, 0); assert.equal(s.sent().length, 0);
  }));
  await test('operator forbidden stored session clears private access rather than presenting a retry with stale authority', () => withFixture('operator', { name: 'operator-forbidden', operatorSession: session, getReplies: [{ status: 403, body: { error: 'forbidden', message: 'Your operator access is unavailable. Sign in again with an authorized email.' } }] }, async s => {
    await s.page.locator(s.c.form).waitFor({ state: 'visible' }); assert(!await s.page.locator('#app').isVisible()); assert(!await s.page.locator('#verifyPanel').isVisible()); assert.equal(await s.page.evaluate(() => sessionStorage.getItem('mc-operator-session-v1')), null); assert.match(await s.page.locator(s.c.status).textContent(), /authorized email|access is unavailable/i); assert.equal(s.sent().length, 0);
  }));
} finally {
  await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter); report.scriptSHA256 = hash(readFileSync('scratchpad/signup-feedback-independent-ui.mjs')); report.pass = report.sourceStable && report.nodeHTTPAttempts === 0 && report.pageErrors.length === 0 && report.checks.every(row => row.pass); report.passed = report.checks.filter(row => row.pass).length;
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ output, pass: report.pass, passed: report.passed, total: report.checks.length, sourceStable: report.sourceStable, nodeHTTPAttempts: report.nodeHTTPAttempts, pageErrors: report.pageErrors, failures: report.checks.filter(row => !row.pass) }, null, 2)); if (!report.pass) process.exitCode = 1;
}
