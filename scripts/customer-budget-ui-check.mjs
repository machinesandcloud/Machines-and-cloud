// Independent rendered allowance checks. Actual local handlers; no accepted model requests.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.'), base = 'http://127.0.0.1:8896';
const arg = process.argv.indexOf('--output'), output = arg < 0 ? 'scratchpad/customer-budget-ui-first.json' : process.argv[arg + 1];
const exhaustedOnly = process.argv.includes('--owner-exhausted-only');
if (!output?.startsWith('scratchpad/') || !output.endsWith('.json') || existsSync(output)) throw new Error('Use a new scratchpad/*.json evidence path');
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|MC_SELF_SERVICE_AI_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '0', ANTHROPIC_API_KEY: 'offline-availability-fixture-only', NODE_ENV: 'test', URL: base, PUBLIC_SITE_URL: base });
const RealDate = Date, clock = RealDate.parse('2030-06-10T15:00:00Z');
globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const result = { at: new RealDate().toISOString(), mode: 'actual handlers/memory; model availability and current-proof fixtures only; no accepted inference', checks: [], requests: [], blockedBrowser: [], blockedServer: [], pageErrors: [], screenshots: [] };
globalThis.fetch = async input => { const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url); result.blockedServer.push({ origin: url.origin, path: url.pathname }); throw new Error('Quota UI check blocks all server network'); };
const store = await import('../netlify/functions/lib/store.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { AI_BUDGET_KIND, AI_BUDGET_KEY } = await import('../netlify/functions/lib/self-service-ai.mjs');
const handlers = { '/api/client': (await import('../netlify/functions/client.mjs')).default, '/api/chat': (await import('../netlify/functions/chat.mjs')).default, '/api/access': (await import('../netlify/functions/access.mjs')).default };
const sources = ['desk.html', 'desk.js', 'embed.js', 'netlify/functions/client.mjs', 'netlify/functions/chat.mjs', 'netlify/functions/access.mjs', 'netlify/functions/lib/setup.mjs', 'netlify/functions/lib/self-service-ai.mjs', 'netlify/functions/lib/store.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/config.mjs', 'netlify/functions/lib/owner-test.mjs', 'netlify/functions/lib/agent.mjs'];
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
result.sourceBefore = hashes();
const check = (name, pass, detail) => result.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const c = newClient({ slug: 'pm-budget-air', ownerKey: 'internal-unused-fixture', owner: { name: 'PM Owner', email: 'pm-budget@example.test', phone: '+17135550140' }, business: { name: 'PM Budget Air', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon to Fri 8am to 5pm' } });
c.onboarding = { version: 1 }; c.status = 'live'; c.build = { status: 'built', source: 'owner_answers' }; c.services = ['AC repair']; c.windows = ['8 to 12', '12 to 5']; c.channels = { web: { active: true }, voice: { active: false }, sms: { active: false } }; c.widget.allowedOrigins = [base];
const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: 'live' };
await store.saveClient(c);
const bearer = createHash('sha256').update('pm-budget-fixture-session').digest('hex');
await store.put('access_sessions', accessHash(bearer), { scope: 'onboarding', email: c.owner.email, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(clock + 24 * 3600000).toISOString() });
const seed = (privateUsed, webUsed) => store.put(AI_BUDGET_KIND, AI_BUDGET_KEY, { version: 1, day: '2030-06-10', used: privateUsed + webUsed, tenants: { [c.slug]: { private: privateUsed, web: webUsed } } });
const businessSnapshot = async () => {
  const data = { client: await store.getClient(c.slug) };
  for (const kind of ['bookings', 'leads', 'tasks', 'customers', 'conversations', 'owner_tests']) { const keys = await store.list(kind, c.slug + '/'); data[kind] = await Promise.all(keys.map(async key => [key, await store.get(kind, key)])); }
  return JSON.stringify(data);
};
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const shot = async (page, suffix) => { const path = output.slice(0, -5) + '-' + suffix + '.png'; if (existsSync(path)) throw new Error('Refusing screenshot overwrite'); await page.screenshot({ path, fullPage: true }); result.screenshots.push(path); };
async function contextFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  if (options.owner) await context.addInitScript(({ token, slug }) => { sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { token: bearer, slug: c.slug });
  await context.routeWebSocket('**/*', ws => { result.blockedBrowser.push({ type: 'websocket' }); ws.close(); });
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if (url.origin !== base) { result.blockedBrowser.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (options.configWait && url.pathname === '/api/client') await options.configWait;
      if (options.configFailure && url.pathname === '/api/client') { result.requests.push({ scope: 'injected failure', method: incoming.method(), path: url.pathname, status: 503 }); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture_config_unavailable"}' }); }
      if (options.chatFailure && url.pathname === '/api/chat') { result.requests.push({ scope: 'injected transport failure', method: incoming.method(), path: url.pathname }); return route.abort('connectionfailed'); }
      if (options.delayedChat && url.pathname === '/api/chat') {
        options.chatEntered(); await options.delayedChat;
        result.requests.push({ scope: 'injected delayed response', method: incoming.method(), path: url.pathname, status: 200 });
        try { return await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: JSON.stringify({ t: 'done', reply: 'Private delayed fixture reply must never reappear after sign out.', simulation: true, events: [] }) + '\n' }); } catch { return; } // An aborted request has no live consumer.
      }
      const handler = handlers[url.pathname]; if (!handler) throw new Error('Unexpected API path: ' + url.pathname);
      const response = await handler(new Request(url, { method: incoming.method(), headers: incoming.headers(), ...(['GET', 'HEAD'].includes(incoming.method()) ? {} : { body: incoming.postData() }) }), { ip: '192.0.2.242' });
      const body = Buffer.from(await response.arrayBuffer()), row = { scope: 'actual handler', method: incoming.method(), path: url.pathname, status: response.status };
      if (url.pathname === '/api/chat') { const data = JSON.parse(body); row.error = data.error; row.hasPrivateAllowance = !!data.aiAllowance; }
      result.requests.push(row);
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
    }
    if (incoming.method() !== 'GET') throw new Error('Unexpected static mutation');
    if (url.pathname === '/embed-fixture.html') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>PM fixture shop</h1><p>Call the shop using its published contact details.</p><script src="/embed.js" data-client="' + c.slug + '" data-api="' + base + '"></script></body></html>' });
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
    if (!path.startsWith(root + '/') || url.pathname.split('/').some(p => p.startsWith('.')) || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push(error.message));
  return { context, page };
}
try {
  if (exhaustedOnly) {
    await seed(20, 30); const owner = await contextFor({ owner: true }), page = owner.page;
    await page.goto(base + '/desk.html?c=' + c.slug); await page.locator('#status').filter({ hasText: 'Daily AI allowance reached' }).waitFor();
    const view = { status: await page.locator('#status').innerText(), allowance: await page.locator('#aiAllowance').innerText(), activation: await page.locator('#setupSteps .setup-step').last().innerText(), recovery: await page.locator('#setupMessage').innerText(), today: await page.locator('#today').innerText() };
    result.rendered = view;
    check('Exhausted owner has no active status and sees zero replies/reset', !await page.locator('#status').evaluate(n => n.classList.contains('live')) && /0 practice · 0 customer chat.*midnight Houston/.test(view.allowance), view.status);
    check('Activation task preserves saved checks and describes reset instead of inviting activation', /saved checks are kept.*midnight Houston/i.test(view.activation) && !/Checks are complete|Activate chat, then/i.test(view.activation), view.activation);
    check('Daily limit recovery retains settings and records without a false active promise', /settings and records are saved.*midnight Houston/.test(view.recovery), view.recovery);
    check('Today uses actual unavailable website state instead of legacy line OK', /Website chat: not active/.test(view.today) && !/Line: OK/.test(view.today), view.today);
    check('Current owner allowance view fits390px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => scrollTo(0, 0)); await shot(page, 'owner-exhausted-390'); await owner.context.close();
    check('Read-only targeted render made no chat/model/provider request or JS error', !result.requests.some(r => r.path === '/api/chat') && result.blockedServer.length === 0 && result.pageErrors.length === 0);
  } else {
  await seed(1, 2);
  const owner = await contextFor({ owner: true }), page = owner.page;
  await page.goto(base + '/desk.html?c=' + c.slug); await page.locator('#title').filter({ hasText: c.business.name }).waitFor();
  check('Owner sees separate remaining replies and Houston reset', /19 practice · 47 customer chat.*midnight Houston/.test(await page.locator('#aiAllowance').innerText()));
  check('Eligible availability fixture renders website active without phone or texting', /Website chat active/.test(await page.locator('#status').innerText()) && /Phone: not active/.test(await page.locator('#channelStates').innerText()) && /Text messages: not active/.test(await page.locator('#channelStates').innerText()));
  const beforePrivate = await businessSnapshot(); await seed(20, 0); await page.locator('#testLink').click();
  await page.locator('#chatIn').fill('What is the diagnostic fee?'); await page.locator('#chatForm button').click();
  await page.locator('#msgs .s').filter({ hasText: /daily.*practice|practice.*daily/i }).waitFor();
  const privateView = { allowance: await page.locator('#aiAllowance').innerText(), error: await page.locator('#msgs .s').last().innerText() };
  check('Actual private 429 shows a readable practice limit and refreshes allowance', /0 practice · 30 customer chat.*midnight Houston/.test(privateView.allowance) && /practice.*allowance.*used up.*Houston daily reset/.test(privateView.error), privateView);
  check('Private-only exhaustion leaves eligible customer website chat active', /Website chat active/.test(await page.locator('#status').innerText()));
  check('Denied private turn creates no business or test history', beforePrivate === await businessSnapshot());
  await seed(20, 30); await page.reload(); await page.locator('#status').filter({ hasText: 'Daily AI allowance reached' }).waitFor();
  check('Shared exhaustion removes active badge and states saved-record recovery', !await page.locator('#status').evaluate(n => n.classList.contains('live')) && /0 practice · 0 customer chat/.test(await page.locator('#aiAllowance').innerText()) && /settings and records are saved.*midnight Houston/.test(await page.locator('#setupMessage').innerText()));
  await shot(page, 'owner-exhausted-390');
  await store.saveClient({ ...c, status: 'testing', channels: { ...c.channels, web: { active: false } } }); await page.reload(); await page.locator('#golive').waitFor();
  check('Shared exhaustion disables website activation', await page.locator('#golive').isDisabled());
  await owner.context.close(); await store.saveClient(c); await seed(0, 0);

  let releaseConfig; const configWait = new Promise(resolve => { releaseConfig = resolve; });
  const pending = await contextFor({ configWait }); await pending.page.goto(base + '/embed-fixture.html'); await pending.page.locator('#mcDesk .l').click();
  check('Fresh embed cannot accept input while configuration is pending', await pending.page.locator('#mcDesk textarea').isDisabled() && await pending.page.locator('#mcDesk .s').isDisabled());
  releaseConfig(); await pending.page.locator('#mcDesk textarea').waitFor({ state: 'visible' }); await pending.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled);
  check('Actual eligible public config enables named widget without sending', await pending.page.locator('#mcDesk .h b').innerText() === c.business.name && await pending.page.locator('#mcDesk .s').isEnabled());
  await pending.context.close();

  await store.saveClient({ ...c, status: 'testing', channels: { ...c.channels, web: { active: false } } });
  const inactive = await contextFor(); await inactive.page.goto(base + '/embed-fixture.html'); await inactive.page.locator('#mcDesk .l').click(); await inactive.page.locator('#mcDesk .m').filter({ hasText: 'Website chat is unavailable' }).waitFor();
  const inactiveView = { disabled: await inactive.page.locator('#mcDesk textarea').isDisabled(), sendDisabled: await inactive.page.locator('#mcDesk .s').isDisabled(), text: await inactive.page.locator('#mcDesk .m').innerText() };
  check('Actual not-active config keeps widget disabled with a direct-contact fallback', inactiveView.disabled && inactiveView.sendDisabled && /shop[’']s contact details/.test(inactiveView.text), inactiveView);
  await inactive.context.close(); await store.saveClient(c);
  const unavailable = await contextFor({ configFailure: true }); await unavailable.page.goto(base + '/embed-fixture.html'); await unavailable.page.locator('#mcDesk .l').click(); await unavailable.page.locator('#mcDesk .m').filter({ hasText: 'Website chat is unavailable' }).waitFor();
  check('Configuration 503 fails closed without inventing a callback or message promise', await unavailable.page.locator('#mcDesk textarea').isDisabled() && !/text (you|us)|someone will|we will call|we’ll call/i.test(await unavailable.page.locator('#mcDesk .m').innerText()));
  await unavailable.context.close();

  await seed(0, 0); const exhausted = await contextFor(); await exhausted.page.goto(base + '/embed-fixture.html'); await exhausted.page.locator('#mcDesk .l').click(); await exhausted.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled);
  const beforePublic = await businessSnapshot(); await seed(20, 30); await exhausted.page.locator('#mcDesk textarea').fill('Is the shop available today?'); await exhausted.page.locator('#mcDesk .s').click(); await exhausted.page.locator('#mcDesk .m').filter({ hasText: 'daily limit' }).waitFor();
  check('Actual public 429 gives explicit daily limit and disables further sends', await exhausted.page.locator('#mcDesk textarea').isDisabled() && await exhausted.page.locator('#mcDesk .s').isDisabled() && /contact the shop directly/.test(await exhausted.page.locator('#mcDesk .m').innerText()));
  check('Denied public turn leaves all business and conversation stores unchanged', beforePublic === await businessSnapshot());
  const publicDenied = result.requests.filter(r => r.path === '/api/chat' && r.status === 429).at(-1);
  check('Public quota denial reveals no private allowance', publicDenied && !publicDenied.hasPrivateAllowance);
  await shot(exhausted.page, 'embed-exhausted-390'); await exhausted.context.close();

  await seed(0, 0); const broken = await contextFor({ chatFailure: true }); await broken.page.goto(base + '/embed-fixture.html'); await broken.page.locator('#mcDesk .l').click(); await broken.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled);
  await broken.page.locator('#mcDesk textarea').fill('What services do you provide?'); await broken.page.locator('#mcDesk .s').click(); await broken.page.locator('#mcDesk .m').filter({ hasText: 'Chat is unavailable right now' }).waitFor();
  const transportView = await broken.page.locator('#mcDesk .m').innerText();
  check('Chat transport failure uses shop contact details without false service promise', /shop[’']s contact details/.test(transportView) && !/someone will|we will call|we’ll call|sent (a|you)|text you/i.test(transportView), transportView);
  await broken.context.close();
  let releaseReply, chatEntered; const delayedChat = new Promise(resolve => { releaseReply = resolve; }), entered = new Promise(resolve => { chatEntered = resolve; });
  const logout = await contextFor({ owner: true, delayedChat, chatEntered }); await logout.page.goto(base + '/desk.html?c=' + c.slug); await logout.page.locator('#title').filter({ hasText: c.business.name }).waitFor();
  await logout.page.locator('#testLink').click(); await logout.page.locator('#chatIn').fill('Delayed private fixture'); await logout.page.locator('#chatForm button').click(); await entered;
  await logout.page.locator('#deskSignOut').click(); await logout.page.locator('#recoveryMessage').filter({ hasText: 'Signed out.' }).waitFor(); releaseReply();
  await logout.page.waitForTimeout(200);
  check('Sign out during a delayed private response clears authority and cannot restore private DOM', (await store.get('access_sessions', accessHash(bearer))).status === 'revoked' && await logout.page.evaluate(() => !sessionStorage.getItem('mc-onboarding-session-v1') && document.getElementById('portalContent').innerHTML === '' && !location.search) && !/Private delayed fixture reply/.test(await logout.page.locator('body').innerText()));
  await logout.context.close();
  check('Only the two intentionally denied turns reached actual chat handlers', result.requests.filter(r => r.scope === 'actual handler' && r.path === '/api/chat').length === 2 && result.requests.filter(r => r.scope === 'actual handler' && r.path === '/api/chat').every(r => r.status === 429));
  check('No server/model/provider fetch or uncaught browser error occurred', result.blockedServer.length === 0 && result.pageErrors.length === 0, { serverAttempts: result.blockedServer.length, pageErrors: result.pageErrors });
  }
} catch (error) { result.fatal = String(error.stack || error); }
finally {
  await browser.close(); result.sourceAfter = hashes(); check('Recorded source remained unchanged through rendered acceptance', JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter));
  result.summary = { checks: result.checks.length, passed: result.checks.filter(c => c.pass).length, failed: result.checks.filter(c => !c.pass).length };
  writeFileSync(output, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ output, ...result.summary, fatal: result.fatal || null }));
  if (result.fatal || result.summary.failed) process.exitCode = 1;
}
