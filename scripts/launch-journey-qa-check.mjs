// QA browser acceptance with actual handlers and private synthetic mailbox in one isolated process.
// Browser requests use current repo assets/actual handlers; only explicit local protocol doubles may satisfy server fetches.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
const root = resolve('.'), base = 'https://launch-owner.fixture.invalid',shop='https://launch-shop.example.test';
const phaseIndex = process.argv.indexOf('--phase'), phase = phaseIndex >= 0 ? process.argv[phaseIndex + 1] : 'entry';
if (!['entry', 'full', 'plan'].includes(phase)) throw new Error('Expected --phase entry|full|plan');
const outputIndex = process.argv.indexOf('--output'), output = outputIndex >= 0 ? process.argv[outputIndex + 1] : 'scratchpad/customer-onboarding-ui-first.json';
if (!output?.startsWith('scratchpad/') || !output.endsWith('.json')) throw new Error('QA output must be a JSON file under scratchpad/');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence');
const imagePrefix = output.slice(0, -5);
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL='http://127.0.0.1:8895';process.env.PUBLIC_SITE_URL=base;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
const result = { at: new Date().toISOString(), mode: 'actual source/handlers in memory; private fake mailbox; no network', checks: [], requests: [], blockedBrowser: [], blockedServer: [], pageErrors: [], leakedOwnerKey: [], screenshots: [] };
const shot = async (page, name, fullPage = true) => { const path = imagePrefix + '-' + name + '.png'; if (existsSync(path)) throw new Error('Refusing to overwrite retained screenshot'); await page.screenshot({ path, fullPage }); result.screenshots.push(path); };
const protocol={model:[],google:[],mail:[],internal:[],physical:0},events=new Map(),mail=new Map();let modelQueue=[],backgroundAllowed=false,googleMode='normal',emailMode='normal',providerSequence=0,clock=Date.now();const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}};const advance=ms=>{clock+=ms;};
const denyPhysical=()=>{protocol.physical++;throw Error('Physical network forbidden');};net.connect=net.createConnection=http.request=http.get=https.request=https.get=denyPhysical;syncBuiltinESMExports();globalThis.fetch=protocolFetch;
const store = await import('../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { setupReadiness,configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const handlers = Object.fromEntries(await Promise.all(['access', 'onboard', 'client', 'chat','website-installation','manage'].map(async name => ['/api/' + name, (await import('../netlify/functions/' + name + '.mjs')).default])));
const sources = [...new Set(execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(f=>f&&!/^(product|scratchpad)\//.test(f)&&!f.endsWith('.md')&&!/^\.env(?:\.|$)/.test(f)).concat(['scripts/launch-journey-qa-check.mjs','desk-requests.js','netlify/functions/lib/request-followthrough.mjs'].filter(f=>existsSync(f))))].sort();
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
result.sourceBefore = hashes();
const check = (name, pass, detail) => result.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failDraft = false, dropOnboardResponse = false, failConfig = false, failLoad = false;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });context.setDefaultTimeout(7000);
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if(url.origin===shop&&incoming.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><h1>QA Browser Air</h1><script src="'+base+'/embed.js" data-client="'+(await store.list('clients',''))[0]+'" async></script>'});
    if(url.origin==='https://accounts.google.com'&&incoming.isNavigationRequest()){const state=url.searchParams.get('state');return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Local Google permission boundary</h1><p>Synthetic consent only. No real Google access.</p><a id="grant-fixture" href="'+base+'/api/google/callback?state='+state+'&code=synthetic-owner-consent">Grant synthetic permission</a>'});}
    if(url.pathname==='/api/google/callback'&&url.origin===base){const response=await(await import('../netlify/functions/google.mjs')).default(new Request(url));return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});}
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
  context.on('page', p=>p.on('pageerror',error=>result.pageErrors.push(error.message)));
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
  await page.locator('#name').fill('QA Browser Owner'); await page.locator('#phone').fill('7135550101');await page.locator('#website').fill(shop);await page.locator('[name="desiredChannels"][value="calendar"]').check();
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
  check('Web and Calendar signup omits legal/purchase step and leaves phone routing hidden and disabled', wizardSteps === 4 && await page.locator('#ein, #legalName').count() === 0 && !await page.locator('#businessNumber').isVisible() && await page.locator('#businessNumber').isDisabled());
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
  process.env.URL=base;Object.assign(process.env,{MC_FAKE_MODEL:'0',ANTHROPIC_API_KEY:'SYNTHETIC-NOT-A-REAL-MODEL-KEY',ANTHROPIC_BASE_URL:'https://launch-model.fixture.invalid'});
  // Continue the exact fresh workspace through current browser controls and actual effects.
  await page.locator('#guideDialog').evaluate(el=>{if(el.open)el.close();});
  await page.locator('.tabs [data-t="setup"]').click();
  await page.locator('#websiteSetupDetails > summary').evaluate(el=>{if(!el.parentElement.open)el.click();});
  await page.locator('#websiteInstallPrimary[data-action="allow_origin"]').click();await page.locator('#websiteInstallMessage').filter({hasText:/Website allowed/}).waitFor();
  check('Owner explicitly allows saved website before rules review', (await store.getClient(created.slug)).widget.allowedOrigins.includes(shop));
  await page.locator('[data-journey-route="know"]').click();
  await page.locator('#cfg [name="business.serviceArea"]').fill('Katy\nCypress');const savedRules=page.waitForResponse(r=>r.url().includes('/api/client?')&&r.request().method()==='PUT');await page.locator('#saveCfg').click();await savedRules;await page.waitForFunction(()=>document.getElementById('cfg').getAttribute('aria-busy')==='false');
  check('Canonical business edit persists before return', (await store.getClient(created.slug)).business.serviceArea.includes('Cypress'));
  await page.reload();await page.locator('body[data-workspace-state="ready"]').waitFor();
  check('Returning owner sees retained canonical rules', (await page.locator('#cfg [name="business.serviceArea"]').inputValue()).includes('Cypress'));
  const reviewSaved=page.waitForResponse(r=>r.url().includes('/api/client?')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='review_rules');await page.locator('#reviewRules').click();await reviewSaved;await page.locator('#reviewMessage').filter({hasText:/Review saved/}).waitFor();
  process.env.URL=base;Object.assign(process.env,{MC_FAKE_MODEL:'0',ANTHROPIC_API_KEY:'SYNTHETIC-NOT-A-REAL-MODEL-KEY',ANTHROPIC_BASE_URL:'https://launch-model.fixture.invalid'});
  modelQueue=[{text:'We serve Katy and Cypress. The diagnostic fee is $89.'}];await page.locator('.tabs [data-t="setup"]').click();await page.locator('#tabTest').click();await page.locator('#chatIn').fill('Where do you work and what is the diagnostic fee?');await page.locator('#chatForm button[type="submit"]').click();await page.locator('#msgs').filter({hasText:'$89'}).waitFor();
  check('Actual private SDK protocol test records current live-mode proof without inference', (await store.getClient(created.slug)).setupProof.testMode==='live'&&modelQueue.length===0);
  await page.locator('.tabs [data-t="setup"]').click();await page.locator('#websiteSetupDetails > summary').evaluate(el=>{if(!el.parentElement.open)el.click();});
  await page.locator('#websiteInstallHelp > summary').evaluate(el=>{if(!el.parentElement.open)el.click();});await page.locator('#websiteInstallAlready').click();await page.locator('#websiteInstallOpen').waitFor({state:'visible'});
  const popup=context.waitForEvent('page');await page.locator('#websiteInstallOpen').click();const installed=await popup;await installed.locator('#mcDesk .l').waitFor();
  await page.locator('#websiteInstallRefresh').click();await page.locator('#websiteInstallPrimary[data-action="activate_web"]').waitFor();
  result.activationState={primary:await page.locator('#websiteInstallPrimary').innerText(),action:await page.locator('#websiteInstallPrimary').getAttribute('data-action'),proof:(await store.getClient(created.slug)).setupProof,revision:configurationRevision(await store.getClient(created.slug))};const beforeActivation=protocol.model.length;
  await page.locator('#websiteInstallPrimary').click();await page.waitForFunction(()=>document.querySelector('#websiteInstallFacts').innerText.includes('Active now'));
  check('Website activation follows observed installation with no model/provider action from the click', (await store.getClient(created.slug)).status==='live'&&protocol.model.length===beforeActivation);
  await shot(page,'activated-owner');await installed.close();
  // Google uses actual owner action, callback and token encryption with a local protocol double.
  Object.assign(process.env,{GOOGLE_CLIENT_ID:'dummy-google-client',GOOGLE_CLIENT_SECRET:'dummy-google-secret',CALENDAR_CONNECTION_ENABLED:'true',CALENDAR_DELIVERY_ENABLED:'true',CALENDAR_SELF_SERVICE_ENABLED:'true',SERVICE_WORKER_KEY:'synthetic-worker-'+'b'.repeat(40),CALENDAR_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64')});
  const sha=x=>createHash('sha256').update(x).digest('hex'),actions=['oauthStart','tokenExchange','tokenRefresh','calendarRead','eventCreate','eventUpdate','eventDelete','workerDispatch','totalRequests'],policy={mode:'self_service',version:'launch_journey_v1',expiresAt:new Date(Date.now()+86400000).toISOString(),googleClientIdHash:sha(process.env.GOOGLE_CLIENT_ID),limits:Object.fromEntries(actions.map(a=>[a,100])),tenantLimits:Object.fromEntries(actions.map(a=>[a,50]))};Object.assign(process.env,{CALENDAR_SELF_SERVICE_POLICY_JSON:JSON.stringify(policy),CALENDAR_SELF_SERVICE_APPROVED_VERSION:policy.version});
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('mc:desk-refresh')));await page.locator('[data-connection="start_calendar"]').click();await page.waitForURL('https://accounts.google.com/**');await page.locator('#grant-fixture').click();await page.waitForFunction(()=>document.body.dataset.workspaceState==='ready');await page.locator('#serviceConnectionMessage').filter({hasText:/connected/i}).waitFor();
  check('Ordinary OAuth callback completes one owner grant with no raw token in browser', (await store.get('calendar_connections',created.slug)).status==='connected'&&!page.url().includes('synthetic-owner-consent'));
  await shot(page,'calendar-connected');
  // Reopen the exact installed widget with the private setup-check fragment after activation.
  await page.locator('#websiteSetupDetails > summary').evaluate(el=>{if(!el.parentElement.open)el.click();});await page.locator('#websiteInstallOpen').waitFor({state:'visible'});
  modelQueue=[{tool:{name:'notify_owner',input:{customer_name:'Setup Fixture',phone:'+17135550142',address:'12 Oak St, Katy',issue:'AC repair setup check',reason:'wants_call',wanted:'After 4 pm',urgency:'this_week',language:'en'}}},{text:'Your setup request is saved. No one was contacted.'}];
  const samplePopup=context.waitForEvent('page');await page.locator('#websiteInstallOpen').click();const setupPage=await samplePopup;await setupPage.locator('#mcDesk .l').click();await setupPage.locator('#mcDesk textarea').fill('Please save a setup callback request.');await setupPage.locator('#mcDesk textarea').press('Enter');await setupPage.locator('#mcDesk').filter({hasText:'Your setup request is saved.'}).waitFor();
  await page.locator('#websiteInstallRefresh').click();await page.locator('#websiteInstallFacts').filter({hasText:/Check completed|Received|complete/i}).waitFor();
  check('Installed setup check is retained and labeled without creating owner email', (await store.list('managed_deliveries',created.slug+'/')).length===0);
  await setupPage.close();
  // A separate ordinary visitor creates one retained booking through the actual model tool loop.
  const visitDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+4*86400000));
  const input={customer_name:'Jordan Fixture',phone:'+17135550143',address:'20 Oak St, Katy, TX',issue:'AC not cooling',date:visitDate,window:'8 to 12',urgency:'this_week',language:'en',notes:'Synthetic lifecycle proof',unsure:''};
  Object.assign(process.env,{SERVICE_DELIVERY_ENABLED:'true',RESEND_API_KEY:'SYNTHETIC-NOT-A-REAL-EMAIL-KEY',FROM_EMAIL:'Launch QA <qa@example.test>'});
  modelQueue=[{tool:{name:'book_visit',input}},{text:'Your visit request is saved. The shop confirms arrival details directly.'}];googleMode='lost_insert';
  const visitor=await context.newPage();await visitor.goto(shop);await visitor.locator('#mcDesk .l').click();await visitor.locator('#mcDesk textarea').fill('Please request AC repair next Tuesday morning.');await visitor.locator('#mcDesk textarea').press('Enter');await visitor.locator('#mcDesk').filter({hasText:'The shop confirms arrival details directly.'}).waitFor();
  const allBookings=await store.listRecords('bookings',created.slug,20),booking=allBookings.find(b=>b.customer_name==='Jordan Fixture');check('Actual installed enquiry creates one retained ordinary booking',!!booking&&allBookings.filter(b=>b.customer_name==='Jordan Fixture').length===1&&!booking.websiteSetupCheck);
  await visitor.close();await page.locator('#websiteInstallRefresh').click();const ownerToken=await page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1')),statusResponse=await handlers['/api/client'](ownerRequest(created.slug,ownerToken)),statusDTO=await statusResponse.json();check('First ordinary website request is distinguished from setup',statusResponse.status===200&&statusDTO.websiteInstallation.firstExternalRequest.state==='received'&&statusDTO.websiteInstallation.firstExternalRequest.record.id===booking.id);
  const webJourney=statusDTO.setup.connectionJourney.channels.find(row=>row.id==='web');check('Connections agrees with installed active website and routes the first visit to Schedule',webJourney.status==='active'&&webJourney.action.target==='availability'&&/visit.*saved/i.test(webJourney.nextStep),webJourney);
  // Normal scheduled entry points recover the queued work; accepted dispatch alone is not delivery.
  backgroundAllowed=true;await scheduled('managed');await scheduled('managed');await scheduled('calendar');advance(11*60000);await scheduled('calendar');
  const managedJobs=await Promise.all((await store.list('managed_deliveries',created.slug+'/')).map(k=>store.get('managed_deliveries',k))),ownerMail=managedJobs.find(j=>j.channel==='email'&&j.source.id===booking.id);
  check('Scheduled owner alert retains exact provider id and delivered readback',ownerMail?.state==='delivered'&&mail.has(ownerMail.providerId)&&mail.get(ownerMail.providerId).body.to.includes(email)&&mail.get(ownerMail.providerId).body.text.includes(booking.id));
  const cal=await import('../netlify/functions/lib/calendar-delivery.mjs'),calKey=cal.calendarDeliveryKey(await store.getClient(created.slug),booking.id),calJob=await store.get('calendar_deliveries',calKey),eventId=cal.calendarEventId(await store.getClient(created.slug),booking.id);
  check('Scheduled Calendar recovery reconciles lost insert without duplicate event',calJob?.state==='synced'&&events.size===1&&[...events.values()][0].start.dateTime.startsWith(visitDate+'T08:00')&&protocol.google.filter(x=>x.method==='POST'&&x.path.includes('/events')).length===1);
  // Owner changes the same retained visit through the current Schedule dialog.
  await page.locator('.tabs [data-t="availability"]').click();await page.locator('[data-visit="'+booking.id+'"]').click();await page.locator('#visitDate').fill(new Date(Date.now()+5*86400000).toISOString().slice(0,10));const rescheduleSaved=page.waitForResponse(r=>r.url().includes('/api/client?')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='reschedule_visit');await page.locator('#saveVisit').click();await rescheduleSaved;await page.locator('#visitChangeForm').waitFor({state:'hidden'});await page.locator('#closeVisit').click();await scheduled('calendar');
  check('Owner reschedule updates the same remote event identity',events.size===1&&[...events.values()][0].id===eventId&&[...events.values()][0].start.dateTime.startsWith(new Date(Date.now()+5*86400000).toISOString().slice(0,10)+'T08:00')&&protocol.google.some(x=>x.method==='PATCH'));
  await page.locator('[data-visit="'+booking.id+'"]').click();await page.locator('#visitCancelConfirm').check();const cancelSaved=page.waitForResponse(r=>r.url().includes('/api/client?')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='cancel_visit');await page.locator('#cancelVisit').click();await cancelSaved;await page.locator('#visitChangeForm').waitFor({state:'hidden'});await scheduled('calendar');check('Owner cancellation removes only the same owned event',events.size===0&&(await store.get('calendar_deliveries',calKey)).state==='cancelled');
  await shot(page,'cancelled-lifecycle');
  // Actual operator session sees a delivered owner alert separately from Calendar and can request audited recovery.
  const operatorEmail='launch-operator@example.test',operatorToken=sha('launch-operator-journey');process.env.ADMIN_EMAILS=operatorEmail;await store.put('access_sessions',sha(operatorToken),{scope:'operator',status:'active',email:operatorEmail,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
  let response=await handlers['/api/manage'](new Request(base+'/api/manage?c='+created.slug,{headers:{origin:base,authorization:'Bearer '+operatorToken}})),detail=await response.json();check('Actual admin reads the retained same customer and delivery evidence',response.status===200&&detail.customer.slug===created.slug&&detail.customer.records.bookings.some(b=>b.id===booking.id));
  response=await handlers['/api/manage'](new Request(base+'/api/manage',{method:'POST',headers:{origin:base,authorization:'Bearer '+operatorToken,'content-type':'application/json'},body:JSON.stringify({action:'reconcile_services',slug:created.slug,expectedRevision:detail.customer.revision,reason:'Review retained synthetic delivery after lost Calendar response.'})}));const reconciled=await response.json();check('Operator recovery is audited and cannot certify delivery from dispatch alone',response.status===200&&reconciled.customer.activity.some(a=>a.type==='reconcile_services')&&!/delivered successfully/i.test(reconciled.serviceCheck.detail));
  await page.locator('#closeVisit').click();await page.locator('.tabs [data-t="setup"]').click();await page.locator('#connection-guide-web [data-journey-route="availability"]').click();await page.locator('[data-visit="'+booking.id+'"]').waitFor({state:'visible'});check('Repaired Website connection action opens Schedule with the retained first visit',await page.locator('[data-visit="'+booking.id+'"]').isVisible());await page.locator('.tabs [data-t="setup"]').click();await shot(page,'final-390');check('Final mobile workspace fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const desktop=await context.newPage();await desktop.setViewportSize({width:1440,height:1000});const retainedBearer=await page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1'));await desktop.addInitScript(token=>sessionStorage.setItem('mc-onboarding-session-v1',token),retainedBearer);await desktop.goto(page.url());await desktop.locator('body[data-workspace-state="ready"]').waitFor();await desktop.locator('.tabs [data-t="setup"]').click();await desktop.locator('#websiteSetupDetails > summary').evaluate(el=>{if(!el.parentElement.open)el.click();});await desktop.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await desktop.waitForTimeout(150);await shot(desktop,'focused-1440',false);await shot(desktop,'final-1440');check('Final desktop workspace fits viewport',await desktop.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('Returning desktop renders one Connections section with verified Website state',await desktop.locator('#connectionJourney').count()===1&&/Connection verified/.test(await desktop.locator('#connection-guide-web').innerText()));check('Ordinary journey has no browser runtime error',result.pageErrors.length===0);
  check('Complete journey never invokes SMS, real model, real email or real Google',result.blockedServer.length===0&&protocol.physical===0&&modelQueue.length===0);
  result.journey={slug:created.slug,bookingId:booking.id,calendarEventId:eventId,ownerDeliveryId:ownerMail?.id,ownerProviderId:ownerMail?.providerId,protocol,qualifications:'All model/Google/Resend replies are local protocol doubles. Scheduled functions were invoked locally; no hosted scheduled execution, real inference, delivery, owner consent or support receipt proved.'};
} catch(error){result.fatal=error.stack||String(error);const failedPage=browser.contexts().flatMap(x=>x.pages()).at(-1);if(failedPage){result.failurePage=await failedPage.evaluate(()=>({url:location.href,text:document.body.innerText.slice(0,16000)})).catch(()=>null);await failedPage.screenshot({path:imagePrefix+'-failure.png',timeout:2000}).catch(()=>{});}}
finally{await browser.close();result.sourceAfter=hashes();check('Source unchanged through complete local journey',JSON.stringify(result.sourceBefore)===JSON.stringify(result.sourceAfter));result.summary={passed:result.checks.filter(x=>x.pass).length,failed:result.checks.filter(x=>!x.pass).length,total:result.checks.length,physicalNetwork:protocol.physical};writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...result.summary,fatal:result.fatal||null}));if(result.fatal||result.summary.failed)process.exitCode=1;}
function ownerRequest(slug,token){return new Request(base+'/api/client?c='+slug,{headers:{origin:base,...(token?{authorization:'Bearer '+token}:{})}});}
async function scheduled(kind){const f=(await import('../netlify/functions/'+(kind==='calendar'?'calendar-delivery-scheduler':'managed-delivery-scheduler')+'.mjs')).default;const r=await f();result.scheduled=(result.scheduled||[]).concat({kind,status:r.status,data:await r.json()});}
function modelSSE(fixture){const rows=[],emit=x=>rows.push('event: '+x.type+'\ndata: '+JSON.stringify(x)+'\n\n');emit({type:'message_start',message:{id:'qa-'+protocol.model.length,type:'message',role:'assistant',content:[],model:'claude-opus-5-5',stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}});if(fixture.tool){emit({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'qa-tool-'+protocol.model.length,name:fixture.tool.name,input:{}}});emit({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(fixture.tool.input)}});}else{emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:fixture.text}});}emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:fixture.tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:10}});emit({type:'message_stop'});return new Response(rows.join(''),{headers:{'content-type':'text/event-stream'}});}
async function protocolFetch(input,init={}){const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url),method=init.method||'GET',body=init.body?String(init.body):'',headers=new Headers(init.headers);
 if(url.origin==='https://launch-model.fixture.invalid'&&url.pathname==='/v1/messages'&&modelQueue.length){protocol.model.push(JSON.parse(body));return modelSSE(modelQueue.shift());}
 if(url.origin===base&&/^\/(?:api\/|\.netlify\/functions\/)(?:managed-delivery|calendar-delivery|service-activation)-background$/.test(url.pathname)){protocol.internal.push({path:url.pathname,method,executed:backgroundAllowed});if(!backgroundAllowed)return new Response(null,{status:202});return(await import('../netlify/functions/'+url.pathname.split('/').at(-1)+'.mjs')).default(new Request(url,{method,headers,body}));}
 if(url.origin==='https://api.resend.com'){protocol.mail.push({path:url.pathname,method,body});if(method==='POST'){const data=JSON.parse(body),id='synthetic-email-'+ ++providerSequence;mail.set(id,{id,to:data.to,last_event:'delivered',body:data});return Response.json({id});}const saved=mail.get(url.pathname.split('/').at(-1));return Response.json(saved||{}, {status:saved?200:404});}
 if(url.origin==='https://oauth2.googleapis.com'){protocol.google.push({path:url.pathname,method});return Response.json({refresh_token:'synthetic-refresh-secret',access_token:'synthetic-access',scope:'https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendars.readonly'});}
 if(url.origin==='https://www.googleapis.com'){protocol.google.push({path:url.pathname,method});if(url.pathname==='/calendar/v3/calendars/primary')return Response.json({id:'launch-owner-calendar@example.test',summary:'Synthetic owned Calendar'});const m=/\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);if(!m)throw Error('Unsupported Google fixture route');const key=m[1]+'/'+(m[2]||'');if(method==='GET')return events.has(key)?Response.json(events.get(key)):Response.json({}, {status:404});const data=body?JSON.parse(body):null;if(['POST','PATCH','DELETE'].includes(method)&&url.searchParams.get('sendUpdates')!=='none')throw Error('Fixture requires explicit no-attendee notifications');if(method==='POST'){if(data.attendees)throw Error('Fixture forbids attendees');const k=m[1]+'/'+data.id;if(events.has(k))return Response.json({}, {status:409});const value={...data,etag:'"'+ ++providerSequence+'"',status:'confirmed'};events.set(k,value);if(googleMode==='lost_insert'){googleMode='normal';throw Error('Synthetic lost insert response after durable provider commit');}return Response.json(value);}if(method==='PATCH'){const old=events.get(key);if(!old)return Response.json({}, {status:404});if(headers.get('if-match')!==old.etag)return Response.json({}, {status:412});const value={...old,...data,etag:'"'+ ++providerSequence+'"'};events.set(key,value);return Response.json(value);}if(method==='DELETE'){const old=events.get(key);if(!old)return Response.json({}, {status:404});if(headers.get('if-match')!==old.etag)return Response.json({}, {status:412});events.delete(key);return new Response(null,{status:204});}}
 result.blockedServer.push({origin:url.origin,path:url.pathname,method});throw Error('Unexpected external request forbidden');}
