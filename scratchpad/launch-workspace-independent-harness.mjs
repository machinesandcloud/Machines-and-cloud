// Independent review of the three product surfaces. Real assets and actual
// memory-backed owner/admin/access handlers; explicit faults are labelled below.
// No mailbox, model, provider or physical HTTP request can leave this process.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const output = resolve(process.argv[2] || 'scratchpad/launch-workspace-independent.json');
if (existsSync(output)) throw new Error('Preserve the existing receipt; use a fresh output path');
const surface = 'workspace';
const apiOnly=process.argv.includes('--api-only');
const match=process.argv.includes('--match')?new RegExp(process.argv[process.argv.indexOf('--match')+1]):null;
const originalPath=resolve('scratchpad/next-work-workspace-save-qa.json');
const initialAttempt = null;
if (!['all', 'onboard', 'workspace', 'admin'].includes(surface)) throw new Error('Choose --surface all|onboard|workspace|admin');
const base = 'http://127.0.0.1:8936', root = resolve('.'), prefix = output.slice(0, -5);
const files = ['product-ui.css', 'styles.css', 'netlify/functions/access.mjs', 'netlify/functions/client.mjs', 'netlify/functions/manage.mjs', 'netlify/functions/lib/operator.mjs', ...(surface === 'all' || surface === 'onboard' ? ['onboard.html', 'onboard.css', 'onboard.js', 'assets/logo.png', 'assets/logo-dark.png'] : []), ...(surface === 'all' || surface === 'workspace' ? ['desk.html', 'desk.css', 'desk.js', 'desk-connections.js', 'desk-connections.css', 'assets/logo.png', 'assets/logo-dark.png'] : []), ...(surface === 'all' || surface === 'admin' ? ['admin.html', 'admin.css', 'admin.js', 'assets/logo.png', 'assets/logo-dark.png'] : [])];
const sha = x => createHash('sha256').update(x).digest('hex');
const functionFiles = directory => readdirSync(directory,{withFileTypes:true}).flatMap(row=>row.isDirectory()?functionFiles(directory+'/'+row.name):row.name.endsWith('.mjs')?[directory+'/'+row.name]:[]);
const hashes = () => Object.fromEntries([...new Set([...(apiOnly?[]:files),...functionFiles('netlify/functions')])].filter(existsSync).map(file => [file, sha(readFileSync(file))]));
const report = { apiOnly, at: new Date().toISOString(), surface, scope: 'Independent browser review of actual product assets and actual isolated-memory handlers. Loading, failure and empty-list responses are explicit fixtures. No signup, email, AI, provider, purchase, calendar mutation or deploy.', sourceBefore: hashes(), harnessHash: sha(readFileSync(new URL(import.meta.url))), checks: [], requests: [], screenshots: [], pageErrors: [], forbiddenRequests: [], fontRequestsBlocked: [], physicalNetwork: 0 };
if (initialAttempt) report.initialAttempt = initialAttempt;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: base, PUBLIC_SITE_URL: base, ADMIN_EMAILS: 'revamp-operator@example.test' });
const deny = () => { report.physicalNetwork++; throw new Error('Independent portal QA physical network denied'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const { register, createRequire } = await import('node:module');
const mainRequire = createRequire(resolve('package.json'));
register('data:text/javascript,' + encodeURIComponent(`import {createRequire} from 'node:module'; import {pathToFileURL} from 'node:url'; const req=createRequire(${JSON.stringify(resolve('package.json'))}); export async function resolve(s,c,n){if(!s.startsWith('.')&&!s.startsWith('/')&&!s.includes(':')){try{return {url:pathToFileURL(req.resolve(s)).href,shortCircuit:true};}catch{}}return n(s,c);}`));
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const store = await import(pathToFileURL(resolve('netlify/functions/lib/store.mjs')));
const { accessHash } = await import(pathToFileURL(resolve('netlify/functions/lib/access.mjs')));
const { newClient, parseHours } = await import(pathToFileURL(resolve('netlify/functions/lib/config.mjs')));
const handlers = Object.fromEntries(await Promise.all(['access', 'client', 'manage'].map(async name => ['/api/' + name, (await import(pathToFileURL(resolve('netlify/functions/' + name + '.mjs')))).default])));
const { configurationRevision }=await import(pathToFileURL(resolve('netlify/functions/lib/setup.mjs')));
const { managementRevision }=await import(pathToFileURL(resolve('netlify/functions/lib/operator.mjs')));
let serial = 0;
report.originalFailure={path:originalPath,sha:sha(readFileSync(originalPath)),summary:JSON.parse(readFileSync(originalPath)).summary};
const ownerToken = sha('revamp-independent-owner'), operatorToken = sha('revamp-independent-operator'), draftToken = sha('revamp-independent-draft');
const now = new Date().toISOString();
async function session(token, email, scope = 'onboarding') { await store.put('access_sessions', accessHash(token), { email, scope, status: 'active', createdAt: now, expiresAt: new Date(Date.now() + 3600000).toISOString() }); }
await session(ownerToken, 'revamp-owner@example.test'); await session(operatorToken, process.env.ADMIN_EMAILS, 'operator'); await session(draftToken, 'revamp-draft@example.test');
const business = newClient({ slug: 'revamp-fixture-air', ownerKey: 'PRIVATE-CANARY-OWNER-NOT-UI', owner: { name: 'Alex Rivera', email: 'revamp-owner@example.test', phone: '+17135550198' }, business: { name: 'Fixture Air & Heat', trade: 'HVAC', city: 'Houston', serviceArea: ['Katy', 'Cypress'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture.example.test' } });
Object.assign(business, { onboarding: { version: 1, verifiedEmail: business.owner.email, desiredChannels: ['web', 'voice', 'sms', 'calendar'], phoneSetupMode: 'forward_business_line' }, status: 'testing', build: { status: 'built', source: 'owner_answers' }, services: ['AC repair', 'Heat pump maintenance'], windows: ['8 to 12', '12 to 5'] });
business.rules.hours = parseHours('Mon-Fri 8am-5pm'); business.phone.businessNumber = '+17135550197';
await store.put('clients', business.slug, business);
const repairBusiness = structuredClone(business);
Object.assign(repairBusiness, { slug: 'revamp-fixture-plumbing', ownerKey: 'PRIVATE-CANARY-REPAIR-NOT-UI', owner: { ...business.owner, email: 'revamp-repair@example.test' }, business: { ...business.business, name: 'Fixture Plumbing', trade: 'Plumbing' }, build: { status: 'failed', notes: 'Synthetic repair case for operations review.' }, management: { audit: [{ id: 'fixture-history', at: now, actor: 'revamp-operator@example.test', action: 'update_rules', reason: 'Saved fixture service coverage correction' }], notes: [], revision: 1 } });
await store.put('clients', repairBusiness.slug, repairBusiness);
await store.put('bookings', business.slug + '/fixture-booking', { id: 'fixture-booking', customer_name: 'Fixture Customer', name: 'Fixture Customer', phone: '+17135550196', issue: 'AC not cooling', address: '12 Fixture St, Katy', date: '2026-10-30', window: '8 to 12', status: 'requested', createdAt: now });
await store.put('leads', business.slug + '/fixture-lead', { id: 'fixture-lead', customer_name: 'Fixture Callback', name: 'Fixture Callback', phone: '+17135550195', issue: 'Furnace quote question', outcome: 'wants_call', status: 'open', alertWaiting: true, createdAt: now });
await store.put('conversations', business.slug + '/fixture-conversation', { id: 'fixture-conversation', channel: 'web', contact: 'Fixture Customer', updatedAt: now, messages: [{ role: 'user', content: 'My AC is running but the house is warm.' }, { role: 'assistant', content: 'Which neighborhood are you in?' }] });
const fields = { setupVersion: '2', name: 'Alex Rivera', phone: '7135550198', business: 'Fixture Air & Heat', trade: 'HVAC', services: 'AC repair\nHeat pump maintenance', serviceArea: 'Katy\nCypress', hours: 'Mon-Fri 8am-5pm', windows: '8 to 12\n12 to 5', desiredChannels: ['web'], plan: 'starter', never: 'Do not quote replacement equipment.', tier0: 'Smoke or fire', handoff: 'Warranty questions' };
async function draft(step = 0, extra = {}) { await store.put('onboarding_drafts', accessHash('revamp-draft@example.test'), { fields: { ...fields, ...extra }, step, revision: 0, updatedAt: now }); }
await draft();
const browser = apiOnly ? {close:async()=>{}} : await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
const contexts = [];
async function contextFor({ token, width = 1440, holdPath = null, failPath = null, emptyOwner = false, emptyAdmin = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' }); contexts.push(context); context.setDefaultTimeout(6500);
  if (token) await context.addInitScript(value => { if (location.origin !== value.origin) return; const operator = value.token === value.operatorToken; sessionStorage.setItem(operator ? 'mc-operator-session-v1' : 'mc-onboarding-session-v1', value.token); localStorage.setItem('mc-walkthrough-v1:revamp-fixture-air', 'seen'); }, { token, operatorToken, origin: base });
  await context.routeWebSocket('**/*', socket => socket.close());
  let releaseHold, markHeld;
  const held = new Promise(resolve => { markHeld = resolve; });
  const gate = new Promise(resolve => { releaseHold = resolve; });
  const state = { failPath, holdPath, emptyOwner, emptyAdmin, held, release: releaseHold };
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if (url.origin !== base) {
      if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { report.fontRequestsBlocked.push(url.origin); return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); }
      report.forbiddenRequests.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/api/')) {
      const method = incoming.method(), body = ['GET', 'HEAD'].includes(method) ? null : incoming.postDataJSON();
      if(state.failSignOut&&url.pathname==='/api/access'&&method==='POST'&&body?.action==='sign_out'){state.failSignOut=false;report.requests.push({path:url.pathname,method,action:body.action,status:503,fixture:'Explicit pre-write sign-out transport/storage failure; no session revoked'});return route.fulfill({status:503,contentType:'application/json',body:'{"error":"access_unavailable"}'});}
      if (method==='PUT') state.putAttempts=(state.putAttempts||0)+1;
      if (state.failPut && method==='PUT'){state.failPut=false; report.requests.push({path:url.pathname,method,status:503,fixture:'Explicit simulated pre-write storage failure; actual handler not invoked'});return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'client_unavailable',message:'Your desk could not be read or saved. Please try again.'})});}
      if (state.holdPut && method === 'PUT') { state.holdPut = false; markHeld(); await gate; }
      if (state.holdPath === url.pathname && method === 'GET') { state.holdPath = null; markHeld(); await gate; }
      if (state.failPath === url.pathname && method === 'GET') { report.requests.push({ path: url.pathname, method, fixture: 'explicit load503', status: 503 }); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"qa_load_failed","message":"This test response simulates temporarily unavailable storage. Please retry."}' }); }
      if (url.pathname === '/api/chat') { report.requests.push({ path: url.pathname, method, fixture: 'explicit offline503', status: 503 }); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' }); }
      // No mailbox creation or onboarding create is included in this suite.
      if (body?.action === 'request_link' || url.pathname === '/api/onboard') { report.forbiddenRequests.push({ path: url.pathname, method, action: body?.action }); return route.fulfill({ status: 403, body: '{"error":"qa_forbidden_action"}' }); }
      if(!['GET','PUT'].includes(method)){report.forbiddenRequests.push({path:url.pathname,method,action:body?.action});return route.fulfill({status:403,body:'{"error":"qa_forbidden_action"}'});}
      const handler = handlers[url.pathname]; if (!handler) { report.forbiddenRequests.push({ path: url.pathname, method }); return route.fulfill({ status: 404, body: '{"error":"qa_unknown_route"}' }); }
      let response = await handler(new Request(url, { method, headers: incoming.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.' + (++serial % 230 + 1) });
      let payload = await response.json();
      if (state.emptyOwner && method === 'GET' && url.pathname === '/api/client' && response.ok) payload = { ...payload, bookings: [], leads: [], conversations: [], events: [], today: { calls: 0, texts: 0, bookings: 0, needsYou: 0 } };
      if (state.emptyAdmin && method === 'GET' && url.pathname === '/api/manage' && response.ok && !url.searchParams.has('c')) payload = { ...payload, customers: [], total: 0, nextCursor: null, summary: { customers: 0, active: 0, needsAttention: 0, setupPending: 0, scope: 'Current page' }, inquiries: [], platformSMS: [] };
      report.requests.push({ path: url.pathname, query: url.search, method, action: body?.action, status: response.status, ...(method==='PUT'?{error:payload.error,field:payload.field,fieldErrors:payload.fieldErrors}:{}), ...(state.emptyOwner && url.pathname === '/api/client' || state.emptyAdmin && url.pathname === '/api/manage' ? { fixture: 'explicit empty collection projection over actual authorized read' } : {}) });
      if(state.losePutResponse&&method==='PUT'&&response.ok){state.losePutResponse=false;report.requests.at(-1).fixture='Actual handler committed; browser response transport aborted';return route.abort('failed');}
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: JSON.stringify(payload) });
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    const path = resolve(root, relative);
    if (!path.startsWith(root + '/') || relative.split(/[\\/]/).some(x => x.startsWith('.')) || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'QA asset unavailable' });
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  return { context, page, state };
}
async function check(name,test) {
  if(match&&!match.test(name))return;
  if(apiOnly&&!/^(Malformed|Optional callback|Unsupported supplied|A supplied|Structured opening|Text-only|Stale edit|Concurrent|Deliberately incomplete|Partial updates|Supported operator|An owner session|Authenticated foreign)/.test(name))return;
  const contextStart=contexts.length;
  try {await test();report.checks.push({name,pass:true});}
  catch(error){
    const result={name,pass:false,error:error.message,stack:error.stack};
    const page=contexts[contextStart]?.pages()[0];
    if(page&&!page.isClosed()){
      result.visibleState=await page.evaluate(()=>({cfg:document.getElementById('cfg')?.dataset.saveState,message:document.getElementById('saveMsg')?.textContent,accountMessage:document.getElementById('acctMsg')?.textContent,accountState:document.getElementById('acct')?.dataset.saveState,accountConflict:document.getElementById('acctConflictText')?.textContent,accountTrace:window.qaAccountTrace,focus:document.activeElement?.getAttribute('name')})).catch(()=>null);
      const path=prefix+'-failure-'+report.checks.length+'.png';await page.screenshot({path,timeout:1500}).then(()=>report.screenshots.push(path)).catch(()=>{});
    }
    report.checks.push(result);
  }finally{for(const context of contexts.slice(contextStart))await context.close();}
}
async function shot(page, suffix, fullPage = false) { const path = prefix + '-' + suffix + '.png'; assert.equal(existsSync(path), false); await page.screenshot({ path, fullPage }); report.screenshots.push(path); }
async function fits(page) { const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(geometry.document <= geometry.viewport + 1, JSON.stringify(geometry)); }
async function logoFits(page) { const images = await page.locator('img').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && /logo/.test(node.src)).map(node => ({ src: new URL(node.src).pathname, loaded: node.complete && node.naturalWidth > 0, ratio: node.getBoundingClientRect().width / node.getBoundingClientRect().height, natural: node.naturalWidth / node.naturalHeight }))); assert.ok(images.length); for (const image of images) { assert.ok(image.loaded, image.src); assert.ok(Math.abs(image.ratio / image.natural - 1) < .025, JSON.stringify(image)); } }
async function dismissTour(page) { if (await page.locator('#guideDialog').isVisible()) await page.locator('#skipGuide').click(); }
async function openDesk(options = {}, fragment = '') { const fixture = await contextFor({ token: ownerToken, ...options }); await fixture.page.goto(base + '/desk.html?c=' + (options.slug||business.slug) + (options.key?'&k='+encodeURIComponent(options.key):'') + (fragment||'#know'));  await fixture.page.locator('body[data-workspace-state="ready"]').waitFor(); await dismissTour(fixture.page); await fixture.page.locator(fragment==='#account'?'#acct':'#cfg [name="business.name"]').waitFor({state:'visible'}); return fixture; }
async function openAdmin(options = {}) { const fixture = await contextFor({ token: operatorToken, ...options }); await fixture.page.goto(base + '/admin.html'); await fixture.page.locator('#app:not([hidden])').waitFor(); return fixture; }
async function routeDesk(page, tab) { await page.locator('[data-t="' + tab + '"]').focus(); await page.keyboard.press('Enter'); await page.locator('#p-' + tab + '.on').waitFor(); }

const baseline = structuredClone(business);
const input = (page, name) => page.locator('#cfg [name="'+name+'"]');
const saveButton = page => page.locator('#cfg button[type="submit"]');
const accountInput=page=>page.locator('#acct [name="rules.avgTicket"]');
async function submitAccount(page){await page.locator('#saveAcct').focus();await page.keyboard.press('Enter');}
async function accountSettled(page){await page.waitForFunction(()=>document.getElementById('acct')?.dataset.saveState!=='saving');await page.waitForTimeout(100);}
async function reset() { await store.put('clients', business.slug, structuredClone(baseline)); }
async function direct(method, body, {slug=business.slug,token=ownerToken,beforeBody}={}) {
  const request=new Request(base+'/api/client?c='+slug,{
    method,headers:{Origin:base,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  if(beforeBody){const original=request.json.bind(request);request.json=async()=>{const value=await original();await beforeBody();return value;};}
  const response = await handlers['/api/client'](request);
  const payload=await response.json();
  report.requests.push({path:'/api/client',method,status:response.status,direct:true,error:payload.error,field:payload.field,fieldErrors:payload.fieldErrors,...(beforeBody?{fixture:'Explicit in-memory row change after initial authorized read and before parsed body is returned'}:{})});
  return {status:response.status,payload};
}
async function put(body, options) {
  const current=await direct('GET',undefined,options);
  assert.equal(current.status,200,JSON.stringify(current));
  return direct('PUT',{expectedRevision:current.payload.configurationRevision,expectedEditRevision:current.payload.editRevision,...body},options);
}
async function support(patch, token=operatorToken) {
  const current=await store.get('clients',business.slug);
  const body={action:'update_rules',slug:business.slug,expectedRevision:managementRevision(current),reason:'Independent isolated correction review',patch};
  const response=await handlers['/api/manage'](new Request(base+'/api/manage',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}),{ip:'192.0.2.203'});
  const payload=await response.json();report.requests.push({path:'/api/manage',method:'POST',direct:true,action:body.action,status:response.status,error:payload.error});return {status:response.status,payload};
}
async function settled(page) {
  await page.waitForFunction(()=>!/^Saving/.test(document.getElementById('saveMsg').textContent));
  await page.waitForTimeout(100);
}
async function submit(page) {
  await page.locator('#cfg').evaluate(form=>form.requestSubmit());
}
async function fieldError(page,name) {
  const element=input(page,name);
  await page.waitForFunction(name=>document.querySelector('#cfg [name="'+name+'"]')?.getAttribute('aria-invalid')==='true',name);
  return element.evaluate(el=>({
    focused:document.activeElement===el,
    invalid:el.getAttribute('aria-invalid'),
    messages:(el.getAttribute('aria-describedby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').filter(Boolean),
    visible:!!el.getClientRects().length,
    sectionOpen:!el.closest('details')||el.closest('details').open
  }));
}
async function assertNoPartialMutation(body, expectedField, expectedStatus=422) {
  const before=await store.get('clients',business.slug);
  const result=await put({...body,summary:'This unrelated field must not be partially saved'});
  assert.equal(result.status,expectedStatus,JSON.stringify(result));
  if(expectedField)assert.ok(result.payload.field===expectedField||Object.keys(result.payload.fieldErrors||result.payload.fields||{}).some(key=>key===expectedField||key.startsWith(expectedField+'.')),JSON.stringify(result.payload));
  assert.deepEqual(await store.get('clients',business.slug),before,'Malformed patch altered persisted state');
}

try {
  for(const width of [320,390,1440]) {
    await check(width+'px: invalid callback stays visible, highlights its field and focuses recovery',async()=>{
      await reset();const {page}=await openDesk({width});
      await input(page,'owner.phone').fill('not-a-phone');await page.keyboard.press('Enter');
      const detail=await fieldError(page,'owner.phone');
      assert.ok(detail.focused&&detail.visible&&detail.sectionOpen&&detail.messages.length,JSON.stringify(detail));
      assert.equal(await input(page,'owner.phone').inputValue(),'not-a-phone');
      assert.equal((await store.get('clients',business.slug)).owner.phone,baseline.owner.phone);
      assert.doesNotMatch(await page.locator('#saveMsg').innerText(),/^(?:All changes saved|Saved)/i);
      await fits(page);await shot(page,'invalid-callback-'+width);
      await input(page,'owner.phone').fill('(713) 555-0199');await saveButton(page).focus();await page.keyboard.press('Enter');
      await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);
      assert.equal((await store.get('clients',business.slug)).owner.phone,'+17135550199');assert.notEqual(await input(page,'owner.phone').getAttribute('aria-invalid'),'true');
    });
    await check(width+'px: keyboard correction saves exact values and survives reload',async()=>{
      await reset();const {page,state}=await openDesk({width});
      await input(page,'owner.phone').fill('(713) 555-0199');
      await input(page,'business.name').fill('Corrected Air '+width);
      await saveButton(page).focus();await page.keyboard.press('Enter');
      await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);
      const persisted=await store.get('clients',business.slug);
      assert.equal(persisted.owner.phone,'+17135550199');assert.equal(persisted.business.name,'Corrected Air '+width);
      assert.equal(state.putAttempts,1);await page.reload();
      await page.waitForFunction(name=>document.querySelector('#cfg [name="business.name"]')?.value===name,'Corrected Air '+width);
      assert.equal(await input(page,'owner.phone').inputValue(),'+17135550199');await fits(page);
    });
  }
  await check('Programmatic submit with an uncommitted field retains its value-bound validation',async()=>{
    await reset();const {page}=await openDesk({width:390});await input(page,'owner.phone').fill('not-a-phone');await submit(page);const detail=await fieldError(page,'owner.phone');assert.ok(detail.focused&&detail.messages.length);assert.equal(await input(page,'owner.phone').inputValue(),'not-a-phone');
  });
  await check('Actual server error reopens a closed instructions section and focuses its retained draft',async()=>{
    await reset();const {page}=await openDesk({width:390});await page.locator('#cfg details').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));await input(page,'summary').fill('x'.repeat(2001));await page.locator('#cfg details').evaluateAll(nodes=>nodes.forEach(node=>node.open=false));
    await saveButton(page).focus();await page.keyboard.press('Enter');const detail=await fieldError(page,'summary');assert.ok(detail.focused&&detail.sectionOpen&&detail.messages.length,JSON.stringify(detail));assert.equal(await input(page,'summary').inputValue(),'x'.repeat(2001));assert.equal((await store.get('clients',business.slug)).summary,baseline.summary);await fits(page);
  });
  await check('Nested actual server row errors attach to the price editor and clear after correction',async()=>{
    await reset();const {page}=await openDesk();await input(page,'fees').fill('Diagnostic visit: $'+'9'.repeat(45));await saveButton(page).focus();await page.keyboard.press('Enter');const detail=await fieldError(page,'fees');assert.ok(detail.focused&&detail.messages.length);assert.deepEqual((await store.get('clients',business.slug)).fees,baseline.fees);
    await input(page,'fees').fill('Diagnostic visit: $89');await saveButton(page).focus();await page.keyboard.press('Enter');await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);assert.deepEqual((await store.get('clients',business.slug)).fees,[{label:'Diagnostic visit',amount:'$89',note:''}]);assert.notEqual(await input(page,'fees').getAttribute('aria-invalid'),'true');
  });
  await check('Pending response acknowledges only its submitted snapshot and retains later typing',async()=>{
    await reset();const {page,state}=await openDesk();
    await input(page,'owner.name').fill('Submitted owner');state.holdPut=true;await submit(page);await state.held;
    await input(page,'owner.name').fill('Typed while save pending');state.release();
    await settled(page);assert.equal(await input(page,'owner.name').inputValue(),'Typed while save pending');
    assert.equal((await store.get('clients',business.slug)).owner.name,'Submitted owner');
    assert.match(await page.locator('#saveMsg').innerText(),/unsaved|not saved|save again/i);
    await page.evaluate(()=>document.dispatchEvent(new Event('mc:desk-refresh')));await page.waitForTimeout(200);
    assert.equal(await input(page,'owner.name').inputValue(),'Typed while save pending');
    await submit(page);await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);
    assert.equal((await store.get('clients',business.slug)).owner.name,'Typed while save pending');
    await page.reload();await page.waitForFunction(()=>document.querySelector('#cfg [name="owner.name"]')?.value==='Typed while save pending');
  });
  await check('Repeated submit while pending creates one write and preserves editable inputs',async()=>{
    await reset();const {page,state}=await openDesk();await input(page,'business.name').fill('One submitted change');
    state.holdPut=true;await submit(page);await state.held;await submit(page);await submit(page);await page.waitForTimeout(100);
    assert.equal(state.putAttempts,1);assert.equal(await input(page,'business.name').isDisabled(),false);
    state.release();await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);
    assert.equal((await store.get('clients',business.slug)).business.name,'One submitted change');
  });
  await check('Explicit pre-write failure retains the draft and a normal retry persists it',async()=>{
    await reset();const {page,state}=await openDesk({width:390});await input(page,'business.name').fill('Draft after unavailable storage');
    state.failPut=true;await submit(page);await page.locator('#saveMsg').filter({hasText:/try|retry|could not/i}).waitFor();await settled(page);
    assert.equal(await input(page,'business.name').inputValue(),'Draft after unavailable storage');
    assert.equal((await store.get('clients',business.slug)).business.name,baseline.business.name);
    await submit(page);await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);
    assert.equal((await store.get('clients',business.slug)).business.name,'Draft after unavailable storage');
  });
  await check('Real revision conflict preserves the draft and recovery keeps newer unrelated saved details',async()=>{
    await reset();const {page}=await openDesk({width:390});await input(page,'owner.name').fill('Retained owner draft');
    const other=await put({business:{name:'Newer server business'}});assert.equal(other.status,200,JSON.stringify(other));
    await submit(page);await page.locator('#cfgConflictPanel').waitFor({state:'visible'});await settled(page);
    assert.equal(await input(page,'owner.name').inputValue(),'Retained owner draft');assert.equal((await store.get('clients',business.slug)).owner.name,baseline.owner.name);
    await page.locator('#cfgCheckLatest').click();await page.locator('#cfgKeepEdits').waitFor({state:'visible'});
    assert.equal(await input(page,'owner.name').inputValue(),'Retained owner draft');await shot(page,'conflict-review-390');
    await page.locator('#cfgKeepEdits').click();await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);
    const saved=await store.get('clients',business.slug);assert.equal(saved.owner.name,'Retained owner draft');assert.equal(saved.business.name,'Newer server business');assert.equal(await input(page,'business.name').inputValue(),'Newer server business');
  });
  await check('Lost response after a real successful commit recovers without losing draft or repeating ambiguous writes',async()=>{
    await reset();const {page,state}=await openDesk();await input(page,'business.name').fill('Committed but acknowledgement lost');state.losePutResponse=true;
    await submit(page);await page.locator('#saveMsg').filter({hasText:/could not|failed|retry|fetch|network/i}).waitFor();await settled(page);
    assert.equal(await input(page,'business.name').inputValue(),'Committed but acknowledgement lost');assert.equal((await store.get('clients',business.slug)).business.name,'Committed but acknowledgement lost');
    await submit(page);await page.locator('#cfgConflictPanel').waitFor({state:'visible'});await page.locator('#cfgCheckLatest').click();await page.locator('#cfgKeepEdits').waitFor({state:'visible'});
    await page.locator('#cfgKeepEdits').click();await settled(page);
    assert.match(await page.locator('#saveMsg').innerText(),/Saved|no unsaved|up to date/i);assert.equal((await store.get('clients',business.slug)).business.name,'Committed but acknowledgement lost');
  });
  await check('A workspace closed during editing retains the draft without a save retry loop',async()=>{
    await reset();const {page,state}=await openDesk({width:390});await input(page,'business.name').fill('Retained closed-workspace draft');
    const closed=await store.get('clients',business.slug);closed.status='cancelled';await store.put('clients',business.slug,closed);
    await submit(page);await page.locator('#saveMsg').filter({hasText:/closed|cancelled/i}).waitFor();await settled(page);
    assert.equal(await input(page,'business.name').inputValue(),'Retained closed-workspace draft');assert.equal(await saveButton(page).isDisabled(),true);assert.equal(state.putAttempts,1);
    assert.equal((await store.get('clients',business.slug)).business.name,baseline.business.name);
  });
  await check('A failed sign-out during pending save recovers an editable usable save state',async()=>{
    await reset();const {page,state}=await openDesk();await input(page,'owner.name').fill('Pending sign-out draft');state.holdPut=true;await submit(page);await state.held;
    state.failSignOut=true;await page.locator('#deskSignOut').click();await page.waitForFunction(()=>document.body.dataset.workspaceState==='ready'&&!document.getElementById('deskSignOut').disabled);state.release();await page.waitForTimeout(200);
    assert.equal(await input(page,'owner.name').inputValue(),'Pending sign-out draft');assert.equal(await saveButton(page).isDisabled(),false,'Save remains disabled after failed sign-out recovery');
    await input(page,'owner.name').fill('Recovered sign-out draft');await submit(page);await settled(page);
    if(await page.locator('#cfgConflictPanel').isVisible()){await page.locator('#cfgCheckLatest').click();await page.locator('#cfgKeepEdits').waitFor({state:'visible'});await page.locator('#cfgKeepEdits').click();}
    await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();assert.equal((await store.get('clients',business.slug)).owner.name,'Recovered sign-out draft');
  });
  await check('Account value preserves pending newer typing, prevents repeated writes and saves after retry',async()=>{
    await reset();const {page,state}=await openDesk({width:390},'#account');await accountInput(page).fill('450');state.holdPut=true;await submitAccount(page);await state.held;
    await accountInput(page).fill('600');await submitAccount(page);await page.waitForTimeout(75);assert.equal(state.putAttempts,1);state.release();await accountSettled(page);
    assert.equal(await accountInput(page).inputValue(),'600');assert.equal((await store.get('clients',business.slug)).rules.avgTicket,450);assert.match(await page.locator('#acctMsg').innerText(),/unsaved|not saved|save again/i);
    await submitAccount(page);await page.locator('#acctMsg').filter({hasText:/saved/i}).waitFor();await accountSettled(page);assert.equal((await store.get('clients',business.slug)).rules.avgTicket,600);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#acct [name="rules.avgTicket"]')?.value==='600');await fits(page);
  });
  await check('Account invalid amount receives associated focused feedback and optional blank clears it',async()=>{
    await reset();const {page}=await openDesk({width:320},'#account');await accountInput(page).fill('not-a-number');await submitAccount(page);
    await page.waitForFunction(()=>document.querySelector('#acct [name="rules.avgTicket"]')?.getAttribute('aria-invalid')==='true');
    assert.equal(await accountInput(page).inputValue(),'not-a-number');assert.equal(await accountInput(page).evaluate(el=>document.activeElement===el),true);assert.ok(await page.locator('#acctError').innerText());
    await accountInput(page).fill('450');await page.locator('#saveAcct').focus();await page.keyboard.press('Enter');await page.locator('#acctMsg').filter({hasText:/saved/i}).waitFor();await accountSettled(page);assert.equal((await store.get('clients',business.slug)).rules.avgTicket,450);
    await accountInput(page).fill('');await submitAccount(page);await accountSettled(page);assert.equal((await store.get('clients',business.slug)).rules.avgTicket,0);assert.notEqual(await accountInput(page).getAttribute('aria-invalid'),'true');await fits(page);
  });
  await check('Account lost acknowledgement recovers while preserving another saved business edit',async()=>{
    await reset();const {page,state}=await openDesk({},'#account');await accountInput(page).fill('700');state.losePutResponse=true;await submitAccount(page);
    await page.locator('#acctMsg').filter({hasText:/could not|failed|retry|fetch|network/i}).waitFor();await accountSettled(page);assert.equal((await store.get('clients',business.slug)).rules.avgTicket,700);assert.equal(await accountInput(page).inputValue(),'700');
    const other=await put({business:{reviewLink:'https://review.example.test/other-tab'}});assert.equal(other.status,200,JSON.stringify(other));
    await submitAccount(page);await page.locator('#acctConflictPanel').waitFor({state:'visible'});await accountSettled(page);await page.locator('#acctCheckLatest').click();await page.locator('#acctKeepEdits').waitFor({state:'visible'});await page.locator('#acctKeepEdits').click();await accountSettled(page);
    assert.match(await page.locator('#acctMsg').innerText(),/saved|up to date/i);const saved=await store.get('clients',business.slug);assert.equal(saved.rules.avgTicket,700);assert.equal(saved.business.reviewLink,'https://review.example.test/other-tab');
  });
  await check('Account and business saves do not overlap or overwrite each other',async()=>{
    await reset();const {page,state}=await openDesk({},'#account');await accountInput(page).fill('450');state.holdPut=true;await submitAccount(page);await state.held;
    await routeDesk(page,'know');await input(page,'business.name').fill('Retained cross-form business draft');await submit(page);await page.waitForTimeout(100);assert.equal(state.putAttempts,1);
    state.release();await accountSettled(page);await submit(page);await settled(page);
    if(await page.locator('#cfgConflictPanel').isVisible()){await page.locator('#cfgCheckLatest').click();await page.locator('#cfgKeepEdits').waitFor({state:'visible'});await page.locator('#cfgKeepEdits').click();await settled(page);}
    const saved=await store.get('clients',business.slug);assert.equal(saved.rules.avgTicket,450);assert.equal(saved.business.name,'Retained cross-form business draft');
  });
  await check('Legacy name-only correction preserves full replaced groups with provider requests disabled',async()=>{
    const legacy=structuredClone(baseline);delete legacy.onboarding;legacy.slug='legacy-save-fixture';legacy.ownerKey='SYNTHETIC-LEGACY-KEY';legacy.business.googlePlaceId='fixture-place';legacy.business.licenses='Fixture license';legacy.business.reviewLink='https://review.example.test/legacy';legacy.widget={greeting:'Welcome to legacy service',allowedOrigins:['https://legacy.example.test']};
    await store.put('clients',legacy.slug,legacy);const {page}=await openDesk({slug:legacy.slug,key:legacy.ownerKey});await input(page,'business.name').fill('Legacy corrected business');await saveButton(page).focus();await page.keyboard.press('Enter');await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);
    const saved=await store.get('clients',legacy.slug);assert.equal(saved.business.name,'Legacy corrected business');for(const key of ['trade','hours','serviceArea','notServed','website','spanish','licenses','googlePlaceId','reviewLink'])assert.deepEqual(saved.business[key],legacy.business[key],key);assert.deepEqual(saved.widget,legacy.widget);assert.equal(saved.phone.businessNumber,legacy.phone.businessNumber);assert.equal(saved.phone.carrier,legacy.phone.carrier);
  });
  await check('Optional empty values clear saved facts without making the complete rules invalid',async()=>{
    await reset();const enriched=await store.get('clients',business.slug);
    enriched.owner.backupPhone='+17135550196';enriched.business.reviewLink='https://review.example.test';enriched.business.payLink='https://pay.example.test';enriched.business.licenses='Licensed';enriched.summary='Optional note';
    await store.put('clients',business.slug,enriched);const {page}=await openDesk();
    await page.locator('#cfg details').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
    for(const name of ['business.reviewLink','business.payLink','business.licenses','summary'])await input(page,name).fill('');
    await submit(page);await page.locator('#saveMsg').filter({hasText:/^(?:All changes saved|Saved)/i}).waitFor();await settled(page);
    const saved=await store.get('clients',business.slug);
    for(const [group,key] of [['business','reviewLink'],['business','payLink'],['business','licenses']])assert.equal(saved[group][key],'');assert.equal(saved.summary,'');
    assert.equal(saved.owner.backupPhone,enriched.owner.backupPhone,'A hidden disabled field was changed by an unrelated owner form save');
    assert.deepEqual(saved.services,baseline.services);assert.deepEqual(saved.windows,baseline.windows);assert.equal(saved.owner.phone,baseline.owner.phone);
  });
  await check('Malformed callback variants are rejected atomically by the actual handler',async()=>{
    await reset();for(const phone of ['not-a-phone','123','+447911123456',1234567890,[],{},null,'(111) 555-0199'])await assertNoPartialMutation({owner:{phone}},'owner.phone');
  });
  await check('Optional callback destinations accept explicit blank clears through the actual handler',async()=>{
    await reset();const enriched=await store.get('clients',business.slug);enriched.owner.backupPhone='+17135550196';enriched.phone.transferTo='+17135550195';await store.put('clients',business.slug,enriched);
    const result=await put({owner:{backupPhone:''},phone:{transferTo:''}});assert.equal(result.status,200,JSON.stringify(result));
    const saved=await store.get('clients',business.slug);assert.equal(saved.owner.backupPhone,'');assert.equal(saved.phone.transferTo,'');assert.equal(saved.owner.phone,enriched.owner.phone);
  });
  await check('Malformed supplied collection and object fields do not partially mutate other values',async()=>{
    await reset();for(const [body,field,status] of [[{owner:'wrong-shape'},null,400],[{services:42},'services',422],[{business:{serviceArea:{name:'Katy'}}},'business.serviceArea',422],[{fees:[{label:'Service',amount:{value:99}}]},'fees',422],[{faq:[{q:'Question?',a:null}]},'faq',422],[{widget:{allowedOrigins:['javascript:alert(1)']}},'widget.allowedOrigins',422]])await assertNoPartialMutation(body,field,status);
  });
  await check('Unsupported supplied fields reject the entire patch before mutation',async()=>{
    await reset();await assertNoPartialMutation({owner:{email:'replacement@example.test'}},null,400);await assertNoPartialMutation({status:'live'},null,400);
  });
  await check('A supplied website-origin row must contain a real origin',async()=>{
    await reset();await assertNoPartialMutation({widget:{allowedOrigins:['']}},'widget.allowedOrigins');
  });
  await check('Structured opening hours merge days, support midnight closing and reject impossible times',async()=>{
    await reset();const before=await store.get('clients',business.slug);const valid=await put({rules:{hours:{mon:{open:'08:00',close:'24:00'}}}});assert.equal(valid.status,200,JSON.stringify(valid));
    const saved=await store.get('clients',business.slug);assert.deepEqual(saved.rules.hours.mon,{open:'08:00',close:'24:00'});assert.deepEqual(saved.rules.hours.tue,before.rules.hours.tue);
    for(const hours of [{mon:{open:'17:00',close:'08:00'}},{mon:{open:'25:00',close:'26:00'}},{mon:{open:'08:00'}}])await assertNoPartialMutation({rules:{hours}},'rules.hours');
  });
  await check('Text-only hours change the actual scheduling rules and unparseable hours become incomplete',async()=>{
    await reset();const valid=await put({business:{hours:'Mon 9am-1pm'}});assert.equal(valid.status,200,JSON.stringify(valid));let saved=await store.get('clients',business.slug);assert.deepEqual(saved.rules.hours.mon,{open:'09:00',close:'13:00'});
    const incomplete=await put({business:{hours:'Hours will be confirmed later'}});assert.equal(incomplete.status,200,JSON.stringify(incomplete));saved=await store.get('clients',business.slug);assert.equal(saved.rules.hours,null);assert.equal(incomplete.payload.setup.canActivateWeb,false);
    for(const hours of ['Mon 9:99am-5pm','Mon 5pm-9am','Mon 8am-24:45'])await assertNoPartialMutation({business:{hours}},'business.hours');
  });
  await check('Deliberately incomplete drafts are explicit and cannot activate customer chat',async()=>{
    await reset();const result=await put({business:{name:''},services:[],windows:[],owner:{phone:''},rules:{hours:null}});
    assert.equal(result.status,200,JSON.stringify(result));const saved=await store.get('clients',business.slug);
    assert.equal(saved.business.name,'');assert.equal(saved.owner.phone,'');assert.deepEqual(saved.services,[]);assert.deepEqual(saved.windows,[]);assert.equal(saved.rules.hours,null);
    const current=await direct('GET');assert.equal(current.payload.setup.canActivateWeb,false);assert.ok(current.payload.setup.channels.web.blockers.some(x=>x.id==='rules'));assert.ok(current.payload.setup.channels.web.blockers.some(x=>x.id==='handoff'));
    if(!apiOnly){const {page}=await openDesk();assert.match(await page.locator('#saveMsg').innerText(),/draft|complete|finish|missing/i);}
  });
  await check('Partial updates retain unrelated supplied business facts',async()=>{
    await reset();const before=await store.get('clients',business.slug);const result=await put({business:{name:'Narrow name correction'}});assert.equal(result.status,200,JSON.stringify(result));const saved=await store.get('clients',business.slug);
    assert.equal(saved.business.name,'Narrow name correction');for(const key of Object.keys(before.business).filter(k=>k!=='name'))assert.deepEqual(saved.business[key],before.business[key],key);assert.deepEqual(saved.rules,before.rules);assert.equal(saved.owner.phone,before.owner.phone);
  });
  await check('Stale edit tokens reject non-configuration field changes from another tab',async()=>{
    await reset();const first=await direct('GET');const changed=await put({digest:{text:false},business:{reviewLink:'https://review.example.test/latest'}});assert.equal(changed.status,200,JSON.stringify(changed));
    assert.equal(changed.payload.configurationRevision,first.payload.configurationRevision);assert.notEqual(changed.payload.editRevision,first.payload.editRevision);
    const saved=await store.get('clients',business.slug);const stale=await direct('PUT',{expectedRevision:first.payload.configurationRevision,expectedEditRevision:first.payload.editRevision,digest:{text:true},summary:'Must not be partially saved'});assert.equal(stale.status,409,JSON.stringify(stale));assert.deepEqual(await store.get('clients',business.slug),saved);
  });
  await check('Stale edit intent cannot cross a recreated same-slug workspace identity',async()=>{
    await reset();const first=await direct('GET');const recreated=await store.get('clients',business.slug);recreated.ownerKey='DIFFERENT-SYNTHETIC-WORKSPACE-IDENTITY';await store.put('clients',business.slug,recreated);
    const result=await direct('PUT',{expectedRevision:first.payload.configurationRevision,expectedEditRevision:first.payload.editRevision,business:{name:'Old workspace intent'}});assert.equal(result.status,409,JSON.stringify(result));assert.deepEqual(await store.get('clients',business.slug),recreated);
  });
  await check('Concurrent management and provider metadata survive a narrow owner edit',async()=>{
    await reset();const result=await put({owner:{name:'Concurrent metadata-safe correction'}},{beforeBody:async()=>{
      const newer=await store.get('clients',business.slug);newer.management={revision:2,notes:[{text:'Newer support note'}],audit:[]};newer.phone.savedProviderReceipt='Synthetic retained receipt';await store.put('clients',business.slug,newer);
    }});assert.equal(result.status,200,JSON.stringify(result));const saved=await store.get('clients',business.slug);
    assert.equal(saved.owner.name,'Concurrent metadata-safe correction');assert.equal(saved.management.notes[0].text,'Newer support note');assert.equal(saved.phone.savedProviderReceipt,'Synthetic retained receipt');
  });
  await check('Concurrent non-configuration leaf changes are checked again inside the atomic write',async()=>{
    await reset();const result=await put({business:{reviewLink:'https://draft.example.test/review'},summary:'Must not be partially saved'},{beforeBody:async()=>{
      const newer=await store.get('clients',business.slug);newer.business.reviewLink='https://newer.example.test/review';await store.put('clients',business.slug,newer);
    }});assert.equal(result.status,409,JSON.stringify(result));const saved=await store.get('clients',business.slug);assert.equal(saved.business.reviewLink,'https://newer.example.test/review');assert.equal(saved.summary,baseline.summary);
  });
  await check('Concurrent ownership changes deny the old authorized writer before mutation',async()=>{
    await reset();const result=await put({business:{name:'Must not cross changed ownership'}},{beforeBody:async()=>{
      const newer=await store.get('clients',business.slug);newer.owner.email='different-owner@example.test';await store.put('clients',business.slug,newer);
    }});assert.equal(result.status,403,JSON.stringify(result));const saved=await store.get('clients',business.slug);assert.equal(saved.owner.email,'different-owner@example.test');assert.equal(saved.business.name,baseline.business.name);
  });
  await check('Supported operator corrections share supplied-field validity and remain atomic',async()=>{
    await reset();for(const patch of [{business:{name:42}},{services:['AC repair',null]}]){const before=await store.get('clients',business.slug);const result=await support(patch);assert.equal(result.status,422,JSON.stringify(result));assert.deepEqual(await store.get('clients',business.slug),before);}
    const unsupported=await support({owner:{phone:'not-a-phone'}});assert.equal(unsupported.status,400);assert.deepEqual(await store.get('clients',business.slug),baseline);
    const valid=await support({business:{name:'Operator corrected air'}});assert.equal(valid.status,200,JSON.stringify(valid));const saved=await store.get('clients',business.slug);assert.equal(saved.business.name,'Operator corrected air');assert.equal(saved.business.trade,baseline.business.trade);assert.equal(saved.owner.phone,baseline.owner.phone);assert.equal(saved.management.audit.at(-1).action,'update_rules');
  });
  await check('An owner session cannot invoke operator corrections',async()=>{
    await reset();const result=await support({business:{name:'Unauthorized operator correction'}},ownerToken);assert.equal(result.status,401);assert.deepEqual(await store.get('clients',business.slug),baseline);
  });
  await check('Authenticated foreign-tenant read/write and anonymous mutation are denied without changes',async()=>{
    await reset();const before=await store.get('clients',repairBusiness.slug);
    for(const method of ['GET','PUT']){const result=await direct(method,method==='PUT'?{expectedRevision:configurationRevision(before),business:{name:'Tenant crossing'}}:undefined,{slug:repairBusiness.slug});assert.equal(result.status,403,JSON.stringify(result));assert.equal(result.payload.client,undefined);}
    const anonymous=await direct('PUT',{business:{name:'Anonymous crossing'}},{token:null});assert.equal(anonymous.status,401);assert.deepEqual(await store.get('clients',repairBusiness.slug),before);assert.deepEqual(await store.get('clients',business.slug),baseline);
  });
} finally {
  for(const context of contexts)await context.close();await browser.close();
  report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
  report.summary={passed:report.checks.filter(x=>x.pass).length,failed:report.checks.filter(x=>!x.pass).length};
  report.originalFailureUnchanged=sha(readFileSync(originalPath))===report.originalFailure.sha;
  report.harnessStable=sha(readFileSync(new URL(import.meta.url)))===report.harnessHash;
  writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,...report.summary,physicalNetwork:report.physicalNetwork,sourceStable:report.sourceStable,forbiddenRequests:report.forbiddenRequests,pageErrors:report.pageErrors,failures:report.checks.filter(x=>!x.pass).map(x=>({name:x.name,error:x.error}))},null,2));
  if(report.summary.failed||report.physicalNetwork||report.forbiddenRequests.length||report.pageErrors.length||!report.sourceStable||!report.originalFailureUnchanged||!report.harnessStable)process.exitCode=1;
}
