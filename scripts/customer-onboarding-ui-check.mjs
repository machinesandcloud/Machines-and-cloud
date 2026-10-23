// QA browser acceptance with actual handlers and private synthetic mailbox in one isolated process.
// All browser requests are fulfilled from repo files/actual handlers; all server fetches are blocked.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.'), base = 'http://127.0.0.1:8895';
const phaseIndex = process.argv.indexOf('--phase'), phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : 'entry';
if (!['entry', 'full', 'plan'].includes(phase)) throw new Error('Expected --phase entry|full|plan');
const outputIndex = process.argv.indexOf('--output'), output = outputIndex >= 0 ? process.argv[outputIndex + 1] : 'scratchpad/customer-onboarding-ui-first.json';
if (!output?.startsWith('scratchpad/') || !output.endsWith('.json')) throw new Error('QA output must be a JSON file under scratchpad/');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence');
const imagePrefix = output.slice(0, -5);
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = base;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
const result = { at: new Date().toISOString(), mode: 'actual source/handlers in memory; private fake mailbox; no network', checks: [], requests: [], blockedBrowser: [], blockedServer: [], pageErrors: [], leakedOwnerKey: [], screenshots: [] };
const shot = async (page, name) => { const path = imagePrefix + '-' + name + '.png'; if (existsSync(path)) throw new Error('Refusing to overwrite retained screenshot'); await page.screenshot({ path, fullPage: true }); result.screenshots.push(path); };
globalThis.fetch = async input => { const url = new URL(String(input)); result.blockedServer.push({ origin: url.origin, pathname: url.pathname }); throw new Error('QA server network blocked'); };
const store = await import('../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { setupReadiness } = await import('../netlify/functions/lib/setup.mjs');
const handlers = Object.fromEntries(await Promise.all(['access', 'onboard', 'client', 'chat'].map(async name => ['/api/' + name, (await import('../netlify/functions/' + name + '.mjs')).default])));
const sources = ['onboard.html', 'onboard.js', 'onboard.css', 'product-ui.css', 'desk.html', 'desk.js', 'desk-connections.js', 'desk-connections.css', 'desk.css', 'netlify/functions/access.mjs', 'netlify/functions/client.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/onboard.mjs', 'netlify/functions/lib/accounts.mjs', 'netlify/functions/lib/setup.mjs', 'netlify/functions/lib/store.mjs', 'netlify/functions/lib/config.mjs'];
if (phase === 'full') sources.push('netlify/functions/chat.mjs', 'netlify/functions/lib/owner-test.mjs', 'netlify/functions/lib/agent.mjs');
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
result.sourceBefore = hashes();
const check = (name, pass, detail) => result.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failDraft = false, dropOnboardResponse = false, failConfig = false, failLoad = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if (url.origin !== base) { result.blockedBrowser.push({ origin: url.origin, pathname: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (!handlers[url.pathname]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa_route_not_allowed"}' });
      if (failDraft && url.pathname === '/api/access' && incoming.method() === 'PUT') { failDraft = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture_write_failed","message":"Your answers could not be saved. Please retry."}' }); }
      if (failConfig && url.pathname === '/api/client' && incoming.method() === 'PUT') { failConfig = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture_write_failed","message":"Your changes could not be saved. Please retry."}' }); }
      if (failLoad && url.pathname === '/api/client' && incoming.method() === 'GET') { failLoad = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"fixture_load_failed","message":"Your workspace is temporarily unavailable. Please retry."}' }); }
      const req = new Request(url, { method: incoming.method(), headers: incoming.headers(), ...(['GET', 'HEAD'].includes(incoming.method()) ? {} : { body: incoming.postData() }) });
      const response = await handlers[url.pathname](req, { ip: '192.0.2.240' });
      result.requests.push({ method: incoming.method(), path: url.pathname, status: response.status });
      const bytes = Buffer.from(await response.arrayBuffer());
      if ((response.headers.get('content-type') || '').includes('application/json')) { const data = JSON.parse(bytes); if (data.key || data.client?.ownerKey || (data.existing?.portal && new URL(data.existing.portal).searchParams.has('k'))) result.leakedOwnerKey.push({ path: url.pathname }); }
      if (dropOnboardResponse && url.pathname === '/api/onboard' && incoming.method() === 'POST') { dropOnboardResponse = false; return route.abort('connectionfailed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    let path = resolve(root, relative); if (!path.startsWith(root + '/')) return route.fulfill({ status: 404, body: 'blocked' });
    if (!existsSync(path) && existsSync(path + '.html')) path += '.html';
    if (!existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => result.pageErrors.push(error.message));
  const email = 'qa-browser-owner@example.test';
  await page.goto(base + '/onboard.html?plan=starter');
  check('Fresh customer sees email gate before private questionnaire', await page.locator('#access-gate').isVisible() && !await page.locator('#ob').isVisible());
  await page.locator('#access-email').fill(email); await page.locator('#access-send').click();
  await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
  check('Fake mailbox is visibly distinguished from sent email', /No email was sent/.test(await page.locator('#access-status').innerText()));
  const delivery = await store.get('access_outbox', accessHash(email));
  if (phase === 'plan') {
    const fixedLink = new URL(delivery.link);
    check('Selected Starter hint survives in the trusted fixed mailbox destination', fixedLink.origin === base && fixedLink.pathname === '/onboard.html' && fixedLink.searchParams.get('plan') === 'starter' && fixedLink.hash.startsWith('#verify='));
  }
  const beforeExchangeCount = result.requests.filter(row => row.path === '/api/access' && row.method === 'POST').length;
  await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' });
  check('Opening mailbox link automatically exchanges proof once without a confirmation click', (await store.get('access_tokens', accessHash(delivery.token))).status === 'consumed' && result.requests.filter(row => row.path === '/api/access' && row.method === 'POST').length === beforeExchangeCount + 1 && !await page.locator('#access-verify').isVisible());
  check('Verified new customer resumes the questionnaire with scrubbed URL and read-only email', !new URL(page.url()).hash && await page.locator('#email').inputValue() === email && await page.locator('#email').getAttribute('readonly') !== null);
  const firstSession = await page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
  const firstSessionRecord = await store.get('access_sessions', accessHash(firstSession));
  check('Verified browser bearer has a persisted24-hour expiry', firstSessionRecord.status === 'active' && Date.parse(firstSessionRecord.expiresAt) - Date.parse(firstSessionRecord.createdAt) === 24 * 60 * 60 * 1000);
  await page.locator('#next').click();
  check('Empty required fields keep customer in current step with guidance', /highlighted/.test(await page.locator('#err').innerText()) && await page.locator('[data-step="1"]').isVisible());
  await page.locator('#name').fill('QA Browser Owner'); await page.locator('#phone').fill('7135550101');
  await page.locator('#next').click(); await page.locator('[data-step="2"]').waitFor({ state: 'visible' });
  await page.locator('#business').fill('QA Browser Air'); await page.locator('#trade').selectOption('HVAC'); await page.locator('#services').fill('AC repair'); await page.locator('#hours').fill('Mon to Fri 8 am to 5 pm'); await page.locator('#serviceArea').fill('Katy'); await page.locator('#spanish').selectOption('no');
  await page.locator('#draft-status').filter({ hasText: 'Saved.' }).waitFor(); await page.reload(); await page.locator('[data-step="2"]').waitFor({ state: 'visible' });
  check('Saved answers and wizard position survive reload', await page.locator('#business').inputValue() === 'QA Browser Air' && await page.locator('#services').inputValue() === 'AC repair');
  await shot(page, 'draft-390');
  failDraft = true; await page.locator('#services').fill('AC repair\nMaintenance');
  await page.locator('#draft-status').filter({ hasText: 'could not be saved' }).waitFor();
  check('Failed autosave visibly preserves unsaved answers without claiming saved', /still on this page/.test(await page.locator('#draft-status').innerText()) && await page.locator('#services').inputValue() === 'AC repair\nMaintenance');
  await page.locator('#next').click(); await page.locator('[data-step="3"]').waitFor({ state: 'visible' });
  await page.locator('#fees').fill('Diagnostic: $89'); await page.locator('#windows').fill('8 to 12\n12 to 5'); await page.locator('#next').click(); await page.locator('[data-step="4"]').waitFor({ state: 'visible' });
  const wizardSteps = await page.locator('#ob fieldset[data-step]').count();
  if (wizardSteps === 5) { await page.locator('#next').click(); await page.locator('[data-step="5"]').waitFor({ state: 'visible' }); await page.locator('#forwarding').selectOption('none'); }
  check('Web-only signup omits legal/purchase step and leaves phone routing hidden and disabled', wizardSteps === 4 && await page.locator('#ein, #legalName').count() === 0 && !await page.locator('#businessNumber').isVisible() && await page.locator('#businessNumber').isDisabled());
  dropOnboardResponse = true; await page.locator('#next').click(); await page.locator('#err').filter({ hasText: /fetch|request|workspace|failed/i }).waitFor();
  const clients = await store.list('clients', '');
  check('Lost create response leaves one tenant and permits retry', clients.length === 1 && await page.locator('#next').isEnabled());
  await page.locator('#next').click(); await page.locator('#done.on').waitFor();
  check('Retry recovers the same tenant without duplicate creation', (await store.list('clients', '')).length === 1 && /workspace is ready/.test(await page.locator('#done').innerText()));
  check('Completed setup has no routine founder or false delivery claim', !/Steve will|emailed it|texts from our registered number|by hand/i.test(await page.locator('#done').innerText()));
  const portal = await page.locator('#goPortal').getAttribute('href');
  check('New workspace link carries no permanent owner credential', !new URL(portal).searchParams.has('k'));
  const created = await store.getClient(clients[0]);
  result.created = { slug: created.slug, status: created.status, build: created.build, channels: created.channels };
  check('Selected Starter plan survives verified signup without a billing action', created.plan === 'starter');
  await shot(page, 'created-390');
  const sessionBeforeSignout = await page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
  await page.locator('#access-sign-out').click(); await page.locator('#access-gate').waitFor({ state: 'visible' });
  check('Sign out revokes onboarding session and returns to email gate', (await store.get('access_sessions', accessHash(sessionBeforeSignout))).status === 'revoked' && !await page.locator('#ob').isVisible());
  await page.locator('#access-email').fill(email); await page.locator('#access-send').click(); await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
  const recover = await store.get('access_outbox', accessHash(email)); await page.goto(recover.link); await page.locator('#title').filter({ hasText: 'QA Browser Air' }).waitFor();
  const returningPortal = new URL(page.url()), createdPortal = new URL(portal); returningPortal.hash = ''; createdPortal.hash = '';
  check('Proven returning customer automatically opens the existing workspace without overwrite or permanent key', returningPortal.href === createdPortal.href && !returningPortal.searchParams.has('k') && (await store.get('access_tokens', accessHash(recover.token))).status === 'consumed' && JSON.stringify(created) === JSON.stringify(await store.getClient(created.slug)));
  check('Onboarding session storage contains no questionnaire/legal draft', await page.evaluate(() => Object.keys(sessionStorage).length === 1 && Object.keys(localStorage).length === 0));
  if (phase === 'plan') {
    result.planMetadata = [];
    for (const [n, plan] of ['starter', 'https://untrusted.example/steal', 'unsupported-plan'].entries()) {
      const metadataEmail = `qa-plan-metadata-${n}@example.test`;
      const response = await handlers['/api/access'](new Request(base + '/api/access', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ action: 'request_link', email: metadataEmail, plan, redirect: 'https://untrusted.example/steal', returnTo: 'https://untrusted.example/steal' }) }), { ip: '192.0.2.241' });
      const outbox = await store.get('access_outbox', accessHash(metadataEmail));
      const link = outbox ? new URL(outbox.link) : null;
      const row = { input: n === 0 ? 'valid enum plus untrusted redirect fields' : n === 1 ? 'URL as plan plus untrusted redirect fields' : 'unknown plan plus untrusted redirect fields', status: response.status, fixedOrigin: link?.origin === base, path: link?.pathname, plan: link?.searchParams.get('plan') || null, untrustedInLink: outbox ? outbox.link.includes('untrusted.example') : false };
      result.planMetadata.push(row);
      check(`Plan metadata case${n + 1} cannot change trusted destination`, row.status === 202 && row.fixedOrigin && row.path === '/onboard.html' && !row.untrustedInLink && (n === 0 ? row.plan === 'starter' : row.plan === null), row);
    }
    check('Plan metadata cannot mutate an existing tenant', JSON.stringify(created) === JSON.stringify(await store.getClient(created.slug)) && (await store.list('clients', '')).length === 1);
  }
  if (phase === 'full') {
    await page.locator('#title').filter({ hasText: 'QA Browser Air' }).waitFor();
    check('Returning owner reaches actual setup guidance without a blocking tour', await page.locator('#workspaceGuide').isVisible() && !await page.locator('#guideDialog').isVisible());
    await page.locator('#openGuide').click(); await page.locator('#guideDialog[data-tour-ready="true"]').waitFor({ state: 'visible' });
    check('Owner can launch the current guided workspace from Quick tour', await page.locator('#guideDialog').isVisible() && await page.locator('#tourSpotlight').isVisible());
    const proofBeforeGuide = (await store.getClient(created.slug)).setupProof;
    result.guide = [];
    for (let n = 0; n < 6; n++) {
      result.guide.push({ step: n + 1, title: await page.locator('#tourTitle').innerText(), body: await page.locator('#tourBody').innerText(), action: await page.locator('#tourAction').innerText() });
      if (n < 5) await page.locator('#tourNext').click();
    }
    check('Six useful tutorial steps cover real customer work', result.guide.length === 6 && /requests|each day/i.test(result.guide[5].title));
    check('Reading guide cannot fabricate review or test proof', JSON.stringify(proofBeforeGuide) === JSON.stringify((await store.getClient(created.slug)).setupProof));
    await page.locator('#skipGuide').click(); await page.locator('#openGuide').click(); await page.keyboard.press('Escape');
    check('Guide can be skipped, reopened and closed by Escape with focus restored', !await page.locator('#guideDialog').isVisible() && await page.evaluate(() => document.activeElement.id === 'openGuide'));
    await page.reload(); await page.locator('#title').filter({ hasText: 'QA Browser Air' }).waitFor();
    check('Dismissed tutorial preference survives reload without certifying setup', !await page.locator('#guideDialog').isVisible() && !(await store.getClient(created.slug)).setupProof?.reviewedRevision);
    for (const width of [390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.locator('#openGuide').click();
      await page.locator('#guideDialog[data-tour-ready="true"]').waitFor();
      const geometry = await page.locator('#guideDialog').evaluate(node => {
        const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
        const target = document.getElementById(node.dataset.tourTarget);
        return { coach: rect(document.getElementById('tourCoach')), spotlight: rect(document.getElementById('tourSpotlight')), target: target ? rect(target) : null, targetId: target?.id, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1, fallback: node.dataset.tourFallback };
      });
      const contained = r => r && r.x >= 0 && r.y >= 0 && r.right <= geometry.width + 1 && r.bottom <= geometry.height + 1;
      check(`Guide coach and spotlight fit the viewport and highlight a real target at ${width}px`, contained(geometry.coach) && contained(geometry.spotlight) && geometry.target && geometry.target.right > geometry.spotlight.x && geometry.target.x < geometry.spotlight.right && geometry.target.bottom > geometry.spotlight.y && geometry.target.y < geometry.spotlight.bottom && geometry.fallback === 'false' && !geometry.overflow, geometry);
      await shot(page, `guide-${width}`); await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#openGuide').click(); await page.locator('#tourNext').click(); await page.locator('#tourAction').click();
    check('Tutorial action opens and focuses real rules editor', await page.locator('#p-know').isVisible() && !await page.locator('#guideDialog').isVisible() && await page.evaluate(() => !!document.activeElement.closest('#p-know') && document.activeElement !== document.body));
    const reviewResponse = page.waitForResponse(response => response.url().includes('/api/client?') && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'review_rules');
    await page.locator('#reviewRules').click(); check('Review is an actual saved API action', (await reviewResponse).status() === 200 && !!(await store.getClient(created.slug)).setupProof?.reviewedRevision);
    await page.reload(); await page.locator('#title').filter({ hasText: 'QA Browser Air' }).waitFor(); await page.locator('[data-t="setup"]').click(); await page.locator('[data-workspace-route="know"]').click();
    check('Review proof survives reload and is visible for saved version', /Review saved/.test(await page.locator('#reviewMessage').innerText()));
    const popup = page.waitForEvent('popup'); await page.evaluate(address => { window.open(address, 'qa-stale-tab'); }, portal); const stalePage = await popup;
    await stalePage.locator('#title').filter({ hasText: 'QA Browser Air' }).waitFor(); await stalePage.locator('[data-t="setup"]').click(); await stalePage.locator('[data-workspace-route="know"]').click();
    await stalePage.locator('#cfg [name="business.serviceArea"]').fill('Pearland');
    const beforeConfig = await store.getClient(created.slug); failConfig = true;
    await page.locator('#cfg [name="business.serviceArea"]').fill('Katy\nCypress');
    check('Unsaved rule edits prevent false review completion', await page.locator('#reviewRules').isDisabled());
    await page.locator('#cfg button[type="submit"]').click(); await page.locator('#saveMsg').filter({ hasText: 'could not be saved' }).waitFor();
    check('Failed rule save retains edits and persisted record', await page.locator('#cfg [name="business.serviceArea"]').inputValue() === 'Katy\nCypress' && JSON.stringify(beforeConfig) === JSON.stringify(await store.getClient(created.slug)) && /edits are still here/.test(await page.locator('#saveMsg').innerText()));
    const configResponse = page.waitForResponse(response => response.url().includes('/api/client?') && response.request().method() === 'PUT');
    await page.locator('#cfg button[type="submit"]').click(); await configResponse; await page.locator('#saveMsg').filter({ hasText: 'Saved.' }).waitFor();
    check('Retry saves corrected rules and invalidates earlier review', (await store.getClient(created.slug)).business.serviceArea.includes('Cypress') && !/Review saved/.test(await page.locator('#reviewMessage').innerText()));
    const beforeStaleTab = await store.getClient(created.slug), staleResponse = stalePage.waitForResponse(response => response.url().includes('/api/client?') && response.request().method() === 'PUT');
    await stalePage.locator('#cfg button[type="submit"]').click(); const staleSaved = await staleResponse;
    await stalePage.locator('#saveMsg').filter({ hasText: /changed|reload/i }).waitFor();
    check('A sequential stale second tab cannot overwrite a completed newer save', staleSaved.status() === 409 && JSON.stringify(beforeStaleTab) === JSON.stringify(await store.getClient(created.slug)) && await stalePage.locator('#cfg [name="business.serviceArea"]').inputValue() === 'Pearland');
    await stalePage.close();
    const reviewAgain = page.waitForResponse(response => response.url().includes('/api/client?') && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'review_rules');
    await page.locator('#reviewRules').click(); await reviewAgain;
    await page.locator('[data-workspace-route="test"]').click();
    const safeKinds = ['bookings', 'leads', 'tasks', 'alerts', 'conversations', 'customers'];
    const snapshot = async () => Object.fromEntries(await Promise.all(safeKinds.map(async kind => [kind, await Promise.all((await store.list(kind, '')).map(async key => [key, await store.get(kind, key)]))])));
    const beforePrivateTest = await snapshot();
    await page.locator('#chatIn').fill('I am Alex Demo, 713-555-0142, at 12 Oak St in Katy. Book tomorrow 12 to 5 for AC not cooling.'); await page.locator('#chatForm button').click();
    await page.locator('#testPreview').filter({ hasText: 'Alex' }).waitFor(); await page.locator('#chatForm button').waitFor({ state: 'visible' });
    check('Private practice shows actual collected contact/address and explicit no-action result', /12 Oak/.test(await page.locator('#testPreview').innerText()) && /No real visit/.test(await page.locator('#testPreview').innerText()));
    check('Browser private test creates no real visits/messages/customer records', JSON.stringify(beforePrivateTest) === JSON.stringify(await snapshot()));
    const afterFake = await store.getClient(created.slug);
    const fakeActivation = await page.evaluate(async slug => {
      const response = await fetch('/api/client?c=' + encodeURIComponent(slug), { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sessionStorage.getItem('mc-onboarding-session-v1') }, body: JSON.stringify({ action: 'go_live' }) });
      return { status: response.status, body: await response.json() };
    }, created.slug);
    check('Actual activation handler rejects simulated proof without changing the workspace', fakeActivation.status === 409 && fakeActivation.body.error === 'not_ready' && fakeActivation.body.setup.canActivateWeb === false && JSON.stringify(afterFake) === JSON.stringify(await store.getClient(created.slug)));
    check('Successful fake test stays blocked from real customer activation', afterFake.setupProof?.testMode === 'fake' && afterFake.status === 'testing' && !setupReadiness(afterFake).canActivateWeb && await page.locator('#golive').count() === 0 && !['activate_web','resume_web'].includes(await page.locator('#websiteInstallPrimary').getAttribute('data-action')));
    await page.locator('[data-t="setup"]').click();
    check('Web-only practice leaves unselected phone and text services inactive without a connected claim', !afterFake.channels.voice.active && !afterFake.channels.sms.active && await page.locator('#connection-guide-voice, #connection-guide-sms').count() === 0 && !await page.locator('#connectionPreferences [value="voice"]').isChecked() && !await page.locator('#connectionPreferences [value="sms"]').isChecked());
    await shot(page, 'test-390');
    await page.locator('[data-t="availability"]').click(); await page.locator('#availabilityDate').fill('2099-01-07'); await page.locator('#availabilityWindow').selectOption(''); await page.locator('#availabilitySubmit').click();
    await page.locator('#availabilityMessage').filter({ hasText: 'Time blocked.' }).waitFor(); await page.reload(); await page.locator('#title').filter({ hasText: 'QA Browser Air' }).waitFor(); await page.locator('[data-t="availability"]').click();
    check('Real availability action survives reload from new customer workspace', await page.locator('.availability-remove').count() === 1 && /2099/.test(await page.locator('#availabilityBlocks').innerText()));
    await page.locator('.availability-remove').click(); await page.locator('#availabilityMessage').filter({ hasText: 'Block removed.' }).waitFor();
    check('Owner can remove actual availability block', await page.locator('.availability-remove').count() === 0);
    failLoad = true; await page.reload(); await page.locator('#portalRecovery').waitFor({ state: 'visible' });
    check('Workspace API failure exposes retry rather than spinner/success', /temporarily unavailable/.test(await page.locator('#recoveryMessage').innerText()) && !await page.locator('#portalContent').isVisible());
    await page.locator('#retryLoad').click(); await page.locator('#portalContent').waitFor({ state: 'visible' });
    check('Retry recovers actual saved owner workspace', await page.locator('#title').innerText() === 'QA Browser Air' && !await page.locator('#portalRecovery').isVisible());
    await page.locator('[data-workspace-route="account"]').click();
    const downloadPromise = page.waitForEvent('download'); await page.locator('#expBookings').click(); const download = await downloadPromise;
    const csv = readFileSync(await download.path(), 'utf8');
    check('Signed-in owner can download CSV without leaking preview as real work', download.suggestedFilename() === created.slug + '-bookings.csv' && csv.includes('customer_name') && csv.includes('issue') && !csv.includes('Alex Demo'));
    const portalSession = await page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
    await page.locator('#deskSignOut').click(); await page.locator('#portalRecovery').filter({ hasText: 'Signed out' }).waitFor();
    check('Visible portal sign out revokes authority and clears private DOM/address', (await store.get('access_sessions', accessHash(portalSession))).status === 'revoked' && !new URL(page.url()).search && await page.locator('#portalContent').innerText() === '' && !/QA Browser Air|Alex Demo|713.555/.test(await page.locator('body').innerText()));
    const replay = await page.evaluate(async ({ base, slug, session }) => {
      const headers = { authorization: 'Bearer ' + session, 'content-type': 'application/json' };
      const inputs = [
        [base + '/api/client?c=' + slug, { headers }],
        [base + '/api/client?c=' + slug + '&export=bookings', { headers }],
        [base + '/api/client?c=' + slug, { method: 'POST', headers, body: JSON.stringify({ action: 'pause' }) }],
        [base + '/api/chat', { method: 'POST', headers, body: JSON.stringify({ client: slug, channel: 'test', messages: [{ role: 'user', content: 'How much?' }] }) }]
      ];
      return Promise.all(inputs.map(async ([url, options]) => { const response = await fetch(url, options); return { path: new URL(url).pathname, status: response.status, body: await response.json() }; }));
    }, { base, slug: created.slug, session: portalSession });
    check('Revoked browser session cannot replay private GET/export/action/chat', replay.every(row => [401, 403].includes(row.status) && !row.body.client && !row.body.reply), replay);
    await page.reload(); await page.locator('#portalRecovery').waitFor({ state: 'visible' });
    check('Reload after portal sign out reveals no saved customer workspace', !await page.locator('#portalContent').isVisible() && !/QA Browser Air|Alex Demo/.test(await page.locator('body').innerText()));
    await page.goto(base + '/desk.html?c=' + created.slug + '&k=wrong'); await page.locator('#portalRecovery').waitFor({ state: 'visible' });
    check('Wrong private link is recoverable without legacy JS crash', /invalid|expired|sign in/i.test(await page.locator('#recoveryMessage').innerText()) && !await page.locator('#portalContent').isVisible());
    await page.goto(base + '/desk.html');
    check('Missing private link offers email recovery instead of dead end', await page.locator('#portalRecovery').isVisible() && await page.locator('#portalRecovery a').getAttribute('href') === 'onboard.html?signin=1');
    await shot(page, 'recovery-390');
    await page.locator('#portalRecovery a').click(); await page.locator('#access-email').fill(email);
    const emailAgain = page.waitForResponse(response => response.url().includes('/api/access') && response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'request_link');
    await page.locator('#access-send').click(); await emailAgain;
    const portalReturn = await store.get('access_outbox', accessHash(email)); await page.goto(portalReturn.link); await page.locator('#title').filter({ hasText: 'QA Browser Air' }).waitFor();
    check('New mailbox proof restores the same workspace after real portal logout', await page.locator('#title').innerText() === 'QA Browser Air' && (await store.list('clients', '')).length === 1 && !new URL(page.url()).searchParams.has('k'));
  }
  check('No new customer response discloses permanent owner key', result.leakedOwnerKey.length === 0, result.leakedOwnerKey);
  check('Entry and recovery have no uncaught browser errors', result.pageErrors.length === 0, result.pageErrors);
  check('Automatic setup attempted no model/provider/background fetch', result.blockedServer.length === 0, result.blockedServer);
  await context.close();
} catch (error) { result.fatal = String(error.stack || error); const active = browser.contexts()[0]?.pages().at(-1); if (active) { result.failureScreenText = (await active.locator('body').innerText().catch(() => '')).slice(0, 10000); await shot(active, 'failure-' + phase).catch(() => {}); } }
finally {
  await browser.close(); result.sourceAfter = hashes(); check('Source stayed stable throughout browser journey', JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter));
  result.summary = { checks: result.checks.length, passed: result.checks.filter(row => row.pass).length, failed: result.checks.filter(row => !row.pass).length };
  writeFileSync(output, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ output, ...result.summary, fatal: result.fatal || null }));
  if (result.fatal || result.summary.failed) process.exitCode = 1;
}
