// Daily work: practice replies after a lost response, request follow-up labels, Quick tour return place.
// Actual owner handlers (/api/client, /api/access, /api/chat) and browser assets; memory storage, fake model, no server or external transport.
// Run from the worktree root: node qa-artifacts/claude-collaboration/desk-daily-work-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-daily-<name>.json [--desk-source <desk.js>]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const output = option('--output'), playwrightPath = option('--playwright') || process.env.MC_PLAYWRIGHT_MODULE;
if (output && (!/^scratchpad\/claude-daily-[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error('Choose a new --output scratchpad/claude-daily-name.json');
if (!playwrightPath) throw new Error('Use installed Playwright via --playwright /path/to/playwright/index.mjs. This check never installs tooling.');
const root = resolve('.'), origin = 'http://127.0.0.1:8920';
if (!existsSync(resolve(root, 'desk.js'))) throw new Error('Run from the worktree root.');
const deskSource = option('--desk-source') ? resolve(option('--desk-source')) : null;
const lib = path => pathToFileURL(resolve(root, path)).href;
const files = ['qa-artifacts/claude-collaboration/desk-daily-work-ui-check.mjs'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(resolve(root, file)))]));
const report = { at: new Date().toISOString(), browser: process.env.MC_PLAYWRIGHT_EXECUTABLE || 'channel:chrome', deskSource: option('--desk-source') || 'desk.js', servedDeskSha256: [], qualifications: 'Synthetic workspace, session and requests; actual local /api/client, /api/access and /api/chat handlers with the fake model; memory storage. Lost replies are simulated with route.abort after the actual handler ran. No model/provider/email/OAuth/purchase/deployment performed.', sourceBefore: hashes(), checks: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('Daily work check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { report.backgroundRequests = (report.backgroundRequests || []).concat({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } return deny(); };
const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
const { workspaceTenant } = await import(lib('netlify/functions/lib/workspace-identity.mjs'));
const handlers = { '/api/client': (await import(lib('netlify/functions/client.mjs'))).default, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default, '/api/workspace-billing': (await import(lib('netlify/functions/workspace-billing.mjs'))).default, '/api/chat': (await import(lib('netlify/functions/chat.mjs'))).default };
const browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const contexts = []; let serial = 0;
const date = days => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + days * 86400000));

async function fixture(viewport, hash = '#today') {
  const slug = 'daily-work-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Daily Shop', trade: 'Plumbing', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['Drain cleaning'], fees: [{ label: 'Drain cleaning', amount: '$149', note: '' }], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(10000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  const state = { requests: [], chats: [], chatFault: null };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON(), action = body?.action;
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
      const item = { slug, path: url.pathname, method, action }; state.requests.push(item); report.requests.push(item);
      if (url.pathname === '/api/chat') { item.roles = (body.messages || []).map(m => m.role); state.chats.push(item); }
      const fault = url.pathname === '/api/chat' ? state.chatFault : null; if (fault) state.chatFault = null;
      if (typeof fault === 'number') { item.status = fault; item.fixture = 'chat-' + fault; return route.fulfill({ status: fault, contentType: 'application/json', body: JSON.stringify({ error: fault === 429 ? 'rate_limited' : 'offline', message: fault === 429 ? 'Synthetic practice allowance used.' : 'Synthetic AI service unavailable.' }) }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' }); item.status = response.status;
      const buffer = Buffer.from(await response.arrayBuffer());
      // The server answered in full; the browser never receives it.
      if (fault === 'lost') { item.fixture = 'chat-lost-after-handler'; item.lostAfterEffect = true; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buffer });
    }
    if (url.pathname === '/desk.js') { const bytes = readFileSync(deskSource || resolve(root, 'desk.js')), digest = sha(bytes); if (!report.servedDeskSha256.includes(digest)) report.servedDeskSha256.push(digest); return route.fulfill({ contentType: 'text/javascript', body: bytes }); }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(origin + '/desk.html?c=' + slug + hash); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, c, state, context, width: viewport.width };
}
async function check(name, run) { const start = contexts.length; try { await run(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); } catch (error) { report.checks.push({ name, pass: false, error: error.stack }); const page = contexts.at(-1)?.pages().at(-1); if (page) await shot(page, 'failure-' + report.checks.length).catch(() => {}); console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]); } finally { await Promise.all(contexts.slice(start).map(context => context.close())); } }
async function shot(page, name) { if (!output) return; const path = output.replace(/\.json$/, '-' + name + '.png'); await page.screenshot({ path }); report.screenshots = (report.screenshots || []).concat(path); }
async function noHorizontalScroll(page) { const v = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(v.document <= v.viewport + 1, 'Horizontal scroll ' + JSON.stringify(v)); }
const route = (x, tab) => x.page.evaluate(tab => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab } })), tab);
const refresh = async x => { await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:desk-refresh'))); await x.page.waitForTimeout(300); };

// ---------- practice ----------
const practiceText = page => page.evaluate(() => [document.getElementById('msgs').innerText, document.getElementById('chatStatus')?.innerText || '', document.getElementById('testPreview')?.innerText || ''].join('\n'));
async function ask(x, text, { typed = true } = {}) {
  const before = x.state.chats.length;
  if (typed) await x.page.locator('#chatIn').fill(text);
  await x.page.locator('#chatIn').press('Enter');
  for (let i = 0; i < 100 && x.state.chats.length === before; i++) await x.page.waitForTimeout(50);
  assert.equal(x.state.chats.length, before + 1, 'one practice request sent');
  await x.page.waitForFunction(() => document.getElementById('chatForm').getAttribute('aria-busy') === 'false', null, { timeout: 15000 });
  return x.state.chats.at(-1);
}
const replies = page => page.locator('#msgs .b.a').count();
function alternates(roles) { for (let i = 1; i < roles.length; i++) if (roles[i] === roles[i - 1]) return false; return roles.at(-1) === 'user'; }
async function practiceFixture(viewport) { const x = await fixture(viewport, '#test'); await x.page.locator('#chatIn').waitFor({ state: 'visible' }); await x.page.waitForFunction(() => document.querySelectorAll('#msgs .b.a').length > 0); return x; }
async function failedReplyRecovers(x, fault, w) {
  const question = 'How much is drain cleaning?';
  x.state.chatFault = fault; const first = await ask(x, question);
  if (fault === 'lost') assert.equal(first.status, 200, 'the server answered before the response was lost');
  const text = await practiceText(x.page);
  assert.doesNotMatch(text, /Failed to fetch|NetworkError|TypeError|signal is aborted/i, 'raw transport text');
  assert.doesNotMatch(text, /sign in/i, 'sign-in is only for 401/403: ' + text);
  assert.equal(await x.page.locator('#chatIn').inputValue(), question, 'the unanswered question is back in the input');
  assert.equal(await x.page.locator('#chatForm button').isDisabled(), false);
  await noHorizontalScroll(x.page);
  if (w) { await x.page.locator('#chatIn').scrollIntoViewIfNeeded(); await shot(x.page, 'practice-' + fault + '-' + w); }
  const repliesBefore = await replies(x.page);
  const resend = await ask(x, question, { typed: false });
  assert.equal(resend.status, 200, 'resend accepted'); assert.ok(alternates(resend.roles), 'resend roles ' + resend.roles);
  const follow = await ask(x, 'What areas do you serve?');
  assert.equal(follow.status, 200, 'follow-up accepted'); assert.ok(alternates(follow.roles), 'follow-up roles ' + follow.roles);
  assert.equal(await replies(x.page), repliesBefore + 2, 'both replies shown');
  assert.equal(await x.page.locator('#chatIn').inputValue(), '');
  if (w) { await x.page.locator('#chatIn').scrollIntoViewIfNeeded(); await shot(x.page, 'practice-continued-' + w); }
}

// ---------- requests ----------
async function seedLead(x) {
  const tenantIdentity = workspaceTenant(x.c);
  x.lead = await store.addRecord('leads', x.c.slug, { tenantIdentity, customer_name: 'Jordan Needs', phone: '+17135550142', address: '12 Oak St', issue: 'Drain clog in kitchen', reason: 'needs_action', outcome: 'needs_action', status: 'open', channel: 'web', urgency: 'today' });
  await refresh(x);
}
async function openRequest(x) { await route(x, 'leads'); await x.page.locator('#leads [data-request-open="' + x.lead.id + '"]').first().click(); await x.page.locator('#requestContent').waitFor({ state: 'visible' }); await x.page.waitForFunction(() => !document.getElementById('requestSave').disabled); }
async function followUp(x, type, inputs = {}) {
  await openRequest(x); await x.page.locator('#requestAction').selectOption(type);
  for (const [id, value] of Object.entries(inputs)) { const field = x.page.locator('#' + id); if (await field.evaluate(n => n.tagName === 'SELECT')) await field.selectOption(value); else await field.fill(value); }
  await x.page.locator('#requestSave').click(); await x.page.waitForFunction(() => /Action saved/.test(document.getElementById('requestMessage').textContent));
  await x.page.locator('#requestClose').click(); await refresh(x);
}
const card = x => x.page.locator('#leads [data-record-id="' + x.lead.id + '"]');
const homeRows = x => x.page.locator('#needsYou').innerText();

// ---------- tour ----------
const tourButton = page => page.locator('#openGuide:visible, button:visible:has-text("Quick tour")').first();

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = viewport.width;
    await check(w + 'px a practice reply lost after the server answers returns the question and the conversation continues', async () => {
      const x = await practiceFixture(viewport); await failedReplyRecovers(x, 'lost', w);
    });
    await check(w + 'px request labels follow the follow-up state, and a completed request leaves Needs your attention', async () => {
      const x = await fixture(viewport); await seedLead(x);
      await route(x, 'leads'); await card(x).waitFor();
      await followUp(x, 'reached', { requestChannel: 'call', requestNote: 'Spoke with the customer' });
      await route(x, 'leads'); const reached = await card(x).innerText();
      assert.doesNotMatch(reached, /needs action/i, 'reached request card still says needs action: ' + reached); assert.match(reached, /Customer reached/);
      await route(x, 'today'); const homeReached = await homeRows(x);
      assert.match(homeReached, /Jordan Needs/, 'still open, still listed'); assert.doesNotMatch(homeReached, /needs action/i, 'Home label is the fixed outcome: ' + homeReached); assert.match(homeReached, /Customer reached/);
      await followUp(x, 'complete', { requestResolution: 'resolved', requestNote: 'Cleared the drain' });
      await route(x, 'leads'); const done = await card(x).innerText();
      assert.doesNotMatch(done, /needs action/i, 'completed request card still says needs action: ' + done); assert.match(done, /Follow-up complete/);
      await noHorizontalScroll(x.page); await card(x).scrollIntoViewIfNeeded(); await shot(x.page, 'request-complete-card-' + w);
      await route(x, 'today'); assert.doesNotMatch(await homeRows(x), /Jordan Needs/, 'completed request listed under Needs your attention');
      await noHorizontalScroll(x.page); await shot(x.page, 'request-complete-home-' + w);
    });
    await check(w + 'px Quick tour opened from Front desk and closed with Esc returns to Front desk and the tour button', async () => {
      const x = await fixture(viewport, '#setup'); await x.page.locator('#p-setup.on').waitFor();
      const button = tourButton(x.page); await button.focus(); await button.click();
      await x.page.waitForFunction(() => document.getElementById('guideDialog').open && document.getElementById('guideDialog').dataset.tourReady === 'true');
      assert.notEqual(await x.page.evaluate(() => document.body.dataset.activePage), 'setup', 'the tour moved to its first step');
      await x.page.keyboard.press('Escape'); await x.page.waitForFunction(() => !document.getElementById('guideDialog').open);
      const after = await x.page.evaluate(() => ({ page: document.body.dataset.activePage, hash: location.hash, focus: document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 30) }));
      assert.equal(after.page, 'setup', 'page after Esc ' + JSON.stringify(after)); assert.equal(after.hash, '#setup', 'route after Esc'); assert.ok(await button.evaluate(n => n === document.activeElement), 'focus returns to the Quick tour button: ' + after.focus);
      await noHorizontalScroll(x.page); await shot(x.page, 'tour-closed-' + w);
    });
  }
  const vp = { width: 1440, height: 900 };
  for (const status of [503, 429]) await check('1440px a practice reply refused with ' + status + ' returns the question without a sign-in prompt', async () => {
    const x = await practiceFixture(vp); await failedReplyRecovers(x, status, null);
  });
  await check('1440px Quick tour closed after moving ahead returns to the page it was opened from', async () => {
    const x = await fixture(vp, '#leads'); await x.page.locator('#p-leads.on').waitFor();
    const button = tourButton(x.page); await button.click(); await x.page.waitForFunction(() => document.getElementById('guideDialog').dataset.tourReady === 'true');
    await x.page.locator('#tourNext').click(); await x.page.waitForFunction(() => document.getElementById('guideDialog').dataset.tourStep === '2');
    await x.page.locator('#closeGuide').click(); await x.page.waitForFunction(() => !document.getElementById('guideDialog').open);
    assert.equal(await x.page.evaluate(() => document.body.dataset.activePage), 'leads'); assert.equal(await x.page.evaluate(() => location.hash), '#leads');
    assert.ok(await button.evaluate(n => n === document.activeElement), 'focus returns to the Quick tour button');
  });
  await check('No physical transport, forbidden destinations or page errors', async () => { assert.equal(report.physicalNetwork, 0); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []); });
} finally {
  await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, total: report.checks.length, physicalNetwork: report.physicalNetwork, pageErrors: report.pageErrors.length };
  if (output) writeFileSync(resolve(root, output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, ...report.summary, servedDeskSha256: report.servedDeskSha256, sourceStable: report.sourceStable, failures: report.checks.filter(c => !c.pass).map(c => ({ name: c.name, error: c.error.split('\n')[0] })) }));
  if (report.summary.failed || !report.sourceStable) process.exitCode = 1;
}
