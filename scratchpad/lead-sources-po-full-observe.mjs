// Independent desktop/mobile customer jobs on actual assets and actual handlers.
// Playwright fulfills every request in process; no live account, provider or email.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!process.argv.includes('--output') || !/^scratchpad\/lead-sources-po-observation-[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw Error('Choose a new independent UI receipt.');
const prefix = output.replace(/\.json$/, ''), origin = 'https://machinesandcloud.com', hash = text => createHash('sha256').update(text).digest('hex');
const sourcePaths = ['desk.html','desk.js','desk.css','desk-lead-sources.js','desk-lead-sources.css','desk-requests.js','netlify/functions/client.mjs','netlify/functions/angi.mjs','netlify/functions/thumbtack.mjs','netlify/functions/lib/lead-connections.mjs','netlify/functions/lib/request-followthrough.mjs','netlify/functions/lib/thumbtack-api.mjs','netlify/functions/lib/thumbtack-connection.mjs','netlify/functions/thumbtack-connect.mjs','netlify/functions/lead-connections-scheduler.mjs','package.json','package-lock.json'];
const hashes = () => Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))]));
const report = { at: new Date().toISOString(), boundary: 'Replacement PO ordinary customer jobs on actual frontend/access/client/Angi/Thumbtack/callback handlers, memory storage, explicit synthetic provider grant/API double and browser routes fulfilled in process. No real vendor, model, email or physical network. Not hosted/provider or AI-autopilot acceptance.', before: hashes(), checks: [], outsideRequests: [], pageErrors: [], physicalNetworkAttempts: 0, screenshots: [], actionCounts: {} };
const deny = () => { report.physicalNetworkAttempts++; throw Error('Independent lead UI QA denies physical network.'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports(); globalThis.fetch = deny;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|CALENDAR_|MANAGED_|PHONE_|VOICE_|MESSAGING_|SERVICE_|NETLIFY_|BLOBS_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const cfg = { THUMBTACK_PARTNER_ENABLED: '1', THUMBTACK_CLIENT_ID: 'synthetic-partner', THUMBTACK_CLIENT_SECRET: 'synthetic-partner-secret', THUMBTACK_SCOPES: 'offline_access supply::businesses:read supply::messages:read supply::messages:write supply::webhooks:write', THUMBTACK_CLIENT_AUTH_METHOD: 'client_secret_basic', THUMBTACK_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) };
Object.assign(process.env, cfg, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const providers = new Map(), threads = new Map(); let providerSerial = 0, webhookSerial = 0, messageSerial = 900000, fault = null;
function apiResponse(body, status = 200) { return Response.json(body, { status }); }
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = (init.method || 'GET').toUpperCase();
  if (!['https://auth.thumbtack.com','https://api.thumbtack.com'].includes(url.origin)) { report.outsideRequests.push({ origin: url.origin, path: url.pathname, method }); return deny(); }
  assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit'); assert.ok(init.signal);
  report.interceptedRequests.push({ origin: url.origin, path: url.pathname, method });
  const info = { url, method, init };
  if (fault?.match(info) && fault.mode === 'before') { fault = null; throw Error('Synthetic request failed before receipt.'); }
  if (fault?.match(info) && fault.mode === 'status') { const status = fault.status; fault = null; return apiResponse({error:'Fixture provider rejection'}, status); }
  let result;
  if (url.origin === 'https://auth.thumbtack.com') {
    assert.equal(url.pathname, '/oauth2/token'); assert.equal(method, 'POST'); const form = new URLSearchParams(String(init.body)); assert.ok(['authorization_code','refresh_token'].includes(form.get('grant_type'))); assert.ok(new Headers(init.headers).get('authorization')?.startsWith('Basic '));
    result = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', token_type: 'Bearer', expires_in: 3600, scope: cfg.THUMBTACK_SCOPES };
  } else {
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-access');
    const path = url.pathname.replace('/api/v4/', ''), segments = path.split('/'), body = init.body ? JSON.parse(init.body) : null;
    if (path === 'businesses' && method === 'GET') result = { data: [...providers.values()].map(provider => ({ businessID: provider.businessID, name: 'Fixture business' })) };
    else if (segments[0] === 'businesses' && segments[2] === 'webhooks') {
      const provider = providers.get(segments[1]); assert.ok(provider, 'Unknown fixture business.');
      if (method === 'GET' && segments[3]) { if (provider.failWebhookLookup) return apiResponse({error: 'Fixture exact receipt unavailable'}, 404); const webhook = provider.webhooks.find(row => row.webhookID === segments[3]); assert.ok(webhook); const {username,password,...publicHook} = webhook; result = publicHook; }
      else if (method === 'GET') result = { data: provider.hideWebhook ? [] : provider.webhooks.map(({ username, password, ...webhook }) => webhook) };
      else if (method === 'POST') { assert.equal(body.enabled, false); assert.deepEqual(new Set(body.eventTypes), new Set(['MessageCreatedV4','NegotiationCreatedV4'])); const webhook = { webhookID: 'webhook-' + (++webhookSerial), businessID: provider.businessID, webhookURL: body.webhookURL, eventTypes: body.eventTypes, enabled: false, authType: 'Basic', username: body.auth.username, password: body.auth.password }; provider.webhooks.push(webhook); const {username,password,...publicHook} = webhook; result = publicHook; }
      else if (method === 'PUT') { const webhook = provider.webhooks.find(row => row.webhookID === segments[3]); assert.ok(webhook); webhook.enabled = body.enabled; const {username,password,...publicHook} = webhook; result = publicHook; }
      else throw Error('Unexpected fixture webhook request.');
    } else if (segments[0] === 'negotiations') {
      const thread = threads.get(segments[1]); assert.ok(thread, 'Unknown fixture negotiation.');
      if (segments.length === 2 && method === 'GET') result = structuredClone(thread.lead);
      else if (segments[2] === 'messages' && method === 'GET') result = { data: structuredClone(thread.messages), ...(thread.pagination ? { pagination: structuredClone(thread.pagination) } : {}) };
      else if (segments[2] === 'messages' && method === 'POST') { const message = { messageID: String(++messageSerial), negotiationID: segments[1], from: 'Pro', text: body.text, sentAt: new Date().toISOString() }; thread.messages.push(message); result = { messageID: message.messageID, negotiationID: segments[1] }; }
      else throw Error('Unexpected fixture negotiation request.');
    } else throw Error('Unexpected Thumbtack fixture request: ' + path);
  }
  if (fault?.match(info)) { const captured = fault; fault = null; if (captured.mode === 'after') throw Error('Synthetic provider receipt lost after commit.'); if (captured.mode === 'shape') return apiResponse(captured.body); if (captured.mode === 'status') return apiResponse({ error: 'Fixture provider rejection' }, captured.status); }
  return apiResponse(result);
};

const store = await import('../netlify/functions/lib/store.mjs'), { newClient } = await import('../netlify/functions/lib/config.mjs');
const callbackHandler=(await import('../netlify/functions/thumbtack-connect.mjs')).default, thumbtackHandler=(await import('../netlify/functions/thumbtack.mjs')).default;
const {ensureVerifiedAccount}=await import('../netlify/functions/lib/accounts.mjs');
const {workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs');
const clientHandler = (await import('../netlify/functions/client.mjs')).default, accessHandler = (await import('../netlify/functions/access.mjs')).default, angiHandler = (await import('../netlify/functions/angi.mjs')).default;
let serial = 0;
async function fixture() {
  const n = ++serial, slug = 'lead-ui-' + n, token = hash('ui-token-' + n), client = { ...newClient({ slug, ownerKey: 'private-ui-' + n, owner: { name: 'Alex Owner', email: slug + '@example.test', phone: '+17135550123' }, business: { name: 'Gulf Coast Service', trade: 'HVAC', city: 'Houston', serviceArea: ['Houston'] } }), onboarding: { version: 1, desiredChannels: ['web','voice','sms','calendar'] }, status: 'testing', build: { status: 'built' } };
  await store.saveClient(client);await ensureVerifiedAccount({email:client.owner.email,initialClient:client,submissionHash:hash('PO fixture '+n)}); await store.put('access_sessions', hash(token), { scope: 'onboarding', status: 'active', email: client.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() }); const pro=String(700000+n),negotiationID=String(800000+n);providers.set(pro,{businessID:pro,webhooks:[],hideWebhook:false});threads.set(negotiationID,{lead:{negotiationID,business:{businessID:pro,name:'Gulf Coast Service'},customer:{customerID:String(900000+n),displayName:'Jamie Customer',location:{city:'Houston',state:'TX',zipCode:'77057'}},category:{categoryID:'100',name:'AC repair'},status:'New',details:[{question:'What happened?',answer:'AC runs warm after filter change'}]},messages:[{messageID:String(100000+n),negotiationID,from:'Customer',text:'Could someone come tomorrow after 4 pm?',sentAt:new Date().toISOString(),attachments:[]}]});return {client,token,pro,negotiationID};
}
async function owner(f) { const response = await clientHandler(new Request(origin + '/api/client?c=' + f.client.slug, { headers: { Authorization: 'Bearer ' + f.token, Origin: origin } })); assert.equal(response.status, 200); return response.json(); }
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] }), contexts = [];
async function screen(width = 1440, f = null) {
  f ||= await fixture(); const state = { loseNextAction: false, refuseNextAction: false, holdNextAction: null, posted: [], clipboard: '' };
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1050 }, serviceWorkers: 'block' }); contexts.push(context); context.setDefaultTimeout(5000);
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.addInitScript(values => { if(location.origin!=='https://machinesandcloud.com')return; try{sessionStorage.setItem('mc-onboarding-session-v1', values.token); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__qaClipboard = text; } } }); }catch(error){/* Synthetic transient documents grant no app session. */} }, { token: f.token });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if(url.origin==='https://auth.thumbtack.com'&&url.pathname==='/oauth2/auth'){const callback=new URL(origin+'/api/thumbtack/connect');callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','synthetic-browser-code');return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><h1>Synthetic Thumbtack permission page</h1><a id=syntheticGrant href="'+callback.href.replace(/&/g,'&amp;')+'">Grant synthetic account permission</a></body></html>'});} if (url.origin !== origin) { report.outsideRequests.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const body = request.postData(), parsed = body ? JSON.parse(body) : null;
      if (parsed?.action) { report.actionCounts[parsed.action] = (report.actionCounts[parsed.action] || 0) + 1; state.posted.push(parsed); }
      if (parsed?.action === 'lead_connection') {
        if (state.holdNextAction) { const held = state.holdNextAction; state.holdNextAction = null; held.enter(); await held.wait; }
        if (state.refuseNextAction) { state.refuseNextAction = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'synthetic_refusal', message: 'Could not confirm this setup change.' }) }); }
      }
      const handler = url.pathname === '/api/client' ? clientHandler : url.pathname === '/api/access' ? accessHandler : url.pathname === '/api/thumbtack/connect' ? callbackHandler : null;
      if (!handler) return route.fulfill({ status: 404, body: '{}' });
      const response = await handler(new Request(url, { method: request.method(), headers: request.headers(), ...(body ? { body } : {}) }));
      if (state.loseNextAction && parsed?.action === 'lead_connection') { state.loseNextAction = false; return route.abort('failed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    }
    const path = resolve(process.cwd(), (url.pathname==='/desk'?'desk.html':url.pathname.replace(/^\/+/, '') || 'index.html'));
    if (!path.startsWith(process.cwd() + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ message: error.message, stack: error.stack, page: page.url() }));
  await page.goto(origin + '/desk.html?c=' + f.client.slug); await page.locator('#portalContent:not([hidden])').waitFor(); if (await page.locator('#guideDialog').isVisible()) await page.locator('#skipGuide').click();
  await page.locator('[data-t="setup"]').first().click(); await page.locator('#leadSources:not([hidden])').waitFor(); return { f, page, context, state };
}
async function check(name, run) { try { await run(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } }
async function shot(page, suffix) { const file = prefix + '-' + suffix + '.png'; if (existsSync(file)) throw Error('Preserve previous screenshot.'); await page.screenshot({ path: file, fullPage: true }); const viewport=file.replace('.png','-viewport.png');await page.screenshot({path:viewport});report.screenshots.push(viewport); report.screenshots.push(file); }
async function openAngi(s) { await s.page.locator('[data-lead-source-open="angi"]').click(); await s.page.locator('#leadSourceDialog[open]').waitFor(); }
async function prepareAngi(s) { await openAngi(s); assert.equal(await s.page.locator('#leadSourceSetup').isHidden(),true); await s.page.locator('#leadSourceBusiness').fill(s.f.pro); await s.page.locator('#leadSourcePrepare').click(); await s.page.locator('#leadSourceStatus').filter({ hasText: /ready|saved/i }).waitFor(); }
async function assertFits(page) { const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, dialog: document.querySelector('#leadSourceDialog').open ? document.querySelector('#leadSourceDialog').getBoundingClientRect().toJSON() : null })); assert.ok(bounds.document <= bounds.viewport + 1, JSON.stringify(bounds)); if (bounds.dialog) { assert.ok(bounds.dialog.left >= -1, JSON.stringify(bounds)); assert.ok(bounds.dialog.right <= bounds.viewport + 1, JSON.stringify(bounds)); } }
report.observations=[];report.interceptedRequests=[];
try {
  for(const width of [390,1440]) await check('PO ordinary Angi connection, retained inquiry and useful owner reply at '+width, async()=>{
    const s=await screen(width); await shot(s.page,'connections-'+width);
    await openAngi(s); await shot(s.page,'angi-entry-'+width);
    report.observations.push({width, stage:'entry', text:await s.page.locator('#leadSourceDialog').innerText()});
    assert.equal(await s.page.locator('#leadSourceSetup').isHidden(),true); await s.page.locator('#leadSourceBusiness').fill(s.f.pro); await s.page.locator('#leadSourcePrepare').click();
    await s.page.locator('#leadSourceStatus').filter({hasText:/ready|saved/i}).waitFor(); const closeRect=await s.page.locator('#leadSourceClose').boundingBox();assert.ok(closeRect.y>=0&&closeRect.y+closeRect.height<=844); await shot(s.page,'angi-ready-'+width);
    report.observations.push({width, stage:'prepared', text:await s.page.locator('#leadSourceDialog').innerText()});
    const connection=(await owner(s.f)).leadConnections.angi;
    const payload={leadOid:990000+width,srOid:880000+width,spEntityId:Number(s.f.pro),name:'Jamie Customer',taskName:'AC repair',comments:'Filter replaced yesterday but upstairs is still hot. Available after 4 pm.',address:'12 Oak Street',city:'Houston',stateProvince:'TX',postalCode:'77057',primaryPhone:'+17135550142',email:'jamie@example.test',interview:[{question:'Access to the unit?',answer:'Gate code 1234. Dog in backyard.'}]};
    for(let attempt=0;attempt<2;attempt++){const response=await angiHandler(new Request(connection.setup.endpoint,{method:'POST',headers:{'content-type':'application/json','x-api-key':connection.setup.secret},body:JSON.stringify(payload)}));assert.equal(response.status,200);}
    await s.page.locator('#leadSourceClose').click(); await s.page.reload(); await s.page.locator('#portalContent:not([hidden])').waitFor(); await s.page.locator('[data-t="leads"]').first().click();
    assert.equal(await s.page.locator('#p-leads [data-request-open]').count(),1);await shot(s.page,'inbox-'+width);
    await s.page.locator('#p-leads [data-request-open]').first().click(); await s.page.locator('#requestContent:not([hidden])').waitFor(); await s.page.waitForTimeout(150); await shot(s.page,'request-before-context-'+width); report.observations.push({width,stage:'request diagnostic',text:await s.page.locator('#requestDialog').innerText(),platform:await s.page.locator('#requestPlatform').evaluate(node=>({hidden:node.hidden,text:node.innerText})),responses:await owner(s.f)}); await s.page.locator('#requestPlatformContext summary').click();
    assert.match(await s.page.locator('#requestPlatformContextBody').innerText(),/Dog in backyard/);await shot(s.page,'request-'+width);
    await s.page.locator('#requestReplyText').fill('Thanks, Jamie. We cover Houston. What is the best time after 4 pm to discuss the AC issue?');
    await s.page.locator('#requestReplyForm button[type="submit"]').click(); await s.page.locator('#requestMessage').filter({hasText:/draft saved/i}).waitFor();assert.match(await s.page.locator('#requestReplySaved').innerText(),/Not sent/);
    await s.page.locator('#requestReplyCopy').click();await s.page.locator('#requestMessage').filter({hasText:/copied/i}).waitFor();await shot(s.page,'draft-'+width);
    report.observations.push({width,stage:'inquiry and draft',text:await s.page.locator('#requestDialog').innerText()});
    assert.equal((await owner(s.f)).leads.length,1);assert.equal(await s.page.locator('#requestPlatformOpen').getAttribute('href'),'https://office.angi.com/');
    await s.page.locator('#requestClose').click();await s.page.locator('[data-t="setup"]').first().click();await s.page.locator('[data-lead-source-open="thumbtack"]').click();await shot(s.page,'thumbtack-entry-'+width);
    report.observations.push({width,stage:'thumbtack entry',text:await s.page.locator('#leadSourceDialog').innerText()});await assertFits(s.page);
  });

  for(const width of [390,1440]) await check('PO Thumbtack account authorization, friendly business choice and reviewed reply '+width,async()=>{
    const s=await screen(width);await s.page.locator('[data-lead-source-open="thumbtack"]').click();assert.equal(await s.page.locator('#leadSourceBusiness').isVisible(),false);await shot(s.page,'native-entry-'+width);
    await s.page.locator('#leadSourcePrepare').click();await s.page.locator('#syntheticGrant').waitFor();await s.page.locator('#syntheticGrant').click();await s.page.locator('#portalContent:not([hidden])').waitFor();
    await s.page.locator('[data-t="setup"]').first().click();await s.page.locator('[data-lead-source-open="thumbtack"]').click();await s.page.locator('#leadSourceOwnedBusiness').waitFor();assert.doesNotMatch(await s.page.locator('#leadSourceInstructions').innerText(),/Save your Thumbtack business ID|tested native connection/i);assert.match(await s.page.locator('#lead-source-thumbtack').innerText(),/Choose your business/);await shot(s.page,'native-business-'+width);await s.page.locator('#leadSourceOwnedBusiness').selectOption(s.f.pro);await s.page.locator('#leadSourceSelectBusiness').click();await s.page.locator('#leadSourceStatus').filter({hasText:/ready|saved/i}).waitFor();await shot(s.page,'native-ready-'+width);
    const row=await store.get('lead_connections',s.f.client.slug+'/'+workspaceTenant(s.f.client)+'/thumbtack');assert.ok(row.native.webhookID);const incomingURL=origin+'/api/thumbtack?c='+s.f.client.slug+'&t='+workspaceTenant(s.f.client)+'&g='+row.generation;
    for(let i=0;i<2;i++){const response=await thumbtackHandler(new Request(incomingURL,{method:'POST',headers:{'content-type':'application/json',authorization:'Basic '+Buffer.from(row.native.username+':'+row.native.password).toString('base64')},body:JSON.stringify({negotiationID:s.f.negotiationID})}));assert.equal(response.status,200);}
    await s.page.locator('#leadSourceClose').click();await s.page.reload();await s.page.locator('#portalContent:not([hidden])').waitFor();await s.page.locator('[data-t="leads"]').first().click();assert.equal(await s.page.locator('#p-leads [data-request-open]').count(),1);assert.match(await s.page.locator('#leads').innerText(),/Thumbtack/);await shot(s.page,'native-inbox-'+width);
    await s.page.locator('#p-leads [data-request-open]').first().click();await s.page.locator('#requestContent:not([hidden])').waitFor();await s.page.locator('#requestPlatformConversation:not([hidden])').waitFor();assert.match(await s.page.locator('#requestPlatformMessages').innerText(),/tomorrow after 4/);await shot(s.page,'native-thread-'+width);
    await s.page.locator('#requestReplyText').fill('Thanks, Jamie. We cover Houston. What is the property address?');await s.page.locator('#requestReplyConfirm').check();
    if(width===390)fault={mode:'after',match:({url,method})=>method==='POST'&&/\/messages$/.test(url.pathname)};
    const sendsBefore=report.interceptedRequests.filter(r=>r.method==='POST'&&/\/messages$/.test(r.path)).length;await s.page.locator('#requestReplySend').click();await s.page.locator('#requestMessage').filter({hasText:width===390?/unknown|check the original/i:/accepted/i}).waitFor();assert.equal(report.interceptedRequests.filter(r=>r.method==='POST'&&/\/messages$/.test(r.path)).length,sendsBefore+1);assert.match(await s.page.locator('#requestPlatform').innerText(),/Thanks, Jamie. We cover Houston. What is the property address/);await shot(s.page,'native-reply-result-'+width);
    if(width===390){await s.page.locator('#requestPlatformRefresh').click();await s.page.locator('#requestMessage').filter({hasText:/loaded|confirmed/i}).waitFor();assert.equal(await s.page.locator('#requestReplySend').isDisabled(),true);assert.equal(await s.page.locator('#requestRetry').isHidden(),true);assert.equal(report.interceptedRequests.filter(r=>r.method==='POST'&&/\/messages$/.test(r.path)).length,sendsBefore+1);}
    report.observations.push({width,stage:'native reviewed reply',text:await s.page.locator('#requestDialog').innerText()});
  });

  await check('PO failed Thumbtack callback returns through the retained session to the same workspace',async()=>{
    const s=await screen(390);await s.page.goto(origin+'/api/thumbtack/connect?state='+'f'.repeat(64)+'&code=synthetic-invalid');await s.page.getByRole('heading',{name:/needs another look/i}).waitFor();await shot(s.page,'native-error-390');await s.page.getByRole('link',{name:'Return to your workspace'}).click();await s.page.locator('#portalContent:not([hidden])').waitFor();assert.equal(new URL(s.page.url()).searchParams.get('c'),s.f.client.slug);await shot(s.page,'native-recovered-390');
  });
} finally {
  report.after = hashes(); report.sourceStable = JSON.stringify(report.before) === JSON.stringify(report.after); report.passed = report.checks.filter(row => row.pass).length; report.total = report.checks.length; report.ok = report.passed === report.total && report.sourceStable && report.pageErrors.length === 0 && report.physicalNetworkAttempts === 0;
  for (const context of contexts) await context.close(); await browser.close(); writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ output, ok: report.ok, passed: report.passed, total: report.total, sourceStable: report.sourceStable, pageErrors: report.pageErrors, failures: report.checks.filter(row => !row.pass).map(({name,error}) => ({name,error})) }, null, 2)); if (!report.ok) process.exitCode = 1;
}
