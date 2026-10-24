// PO ordinary customer jobs: real backend handlers, synthetic OAuth/API responses,
// in-memory storage and physical transport blocked. No actual account/permission/send.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!process.argv.includes('--output') || !/^scratchpad\/lead-ai-po-[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw Error('Choose a new PO receipt.');
const hash = value => createHash('sha256').update(value).digest('hex'), origin = 'https://machinesandcloud.com';
const paths = ['netlify/functions/lib/lead-connections.mjs','netlify/functions/lib/thumbtack-connection.mjs','netlify/functions/lib/thumbtack-api.mjs','netlify/functions/client.mjs','netlify/functions/thumbtack.mjs','netlify/functions/thumbtack-connect.mjs','netlify/functions/lib/request-followthrough.mjs','netlify/functions/lead-connections-scheduler.mjs','package.json','package-lock.json','scratchpad/lead-ai-po-final-status.mjs','netlify/functions/lib/platform-ai.mjs','netlify/functions/lib/platform-ai-proposal.mjs','netlify/functions/platform-ai-background.mjs','netlify/functions/lib/agent.mjs','netlify/functions/lib/self-service-ai.mjs', ...(process.argv.includes('--browser') ? ['desk.html','desk.js','desk.css','desk-lead-sources.js','desk-lead-sources.css','desk-requests.js'] : [])];
const hashes = () => Object.fromEntries(paths.map(path => [path, hash(readFileSync(path))]));
const report = { at: new Date().toISOString(), boundary: 'PO observed ordinary browser customer jobs with actual handler/backend logic, memory storage, explicit documented-shape partner response fixtures. All physical network denied. This does not prove provisioned scopes, real OAuth, ordinary webhook envelope, partner configuration, provider sends or publication.', before: hashes(), checks: [], physicalNetworkAttempts: 0, interceptedRequests: [], unexpectedRequests: [] };
const deny = () => { report.physicalNetworkAttempts++; throw Error('Independent native QA denies physical transport.'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
for (const name of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|CALENDAR_|MANAGED_|PHONE_|VOICE_|MESSAGING_|SERVICE_|NETLIFY_|BLOBS_|THUMBTACK_)/.test(name)) delete process.env[name];
const cfg = { THUMBTACK_PARTNER_ENABLED: '1', THUMBTACK_CLIENT_ID: 'synthetic-partner', THUMBTACK_CLIENT_SECRET: 'synthetic-partner-secret', THUMBTACK_SCOPES: 'offline_access supply::businesses:read supply::messages:read supply::messages:write supply::webhooks:write', THUMBTACK_CLIENT_AUTH_METHOD: 'client_secret_basic', THUMBTACK_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) };
Object.assign(process.env, cfg, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '0', ANTHROPIC_API_KEY:'synthetic-model-only', MC_PLATFORM_AI_ENABLED:'1', SERVICE_WORKER_KEY:'s'.repeat(40), NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const providers = new Map(), threads = new Map(); let serial = 0, webhookSerial = 0, messageSerial = 900000, fault = null;
function apiResponse(body, status = 200) { return Response.json(body, { status }); }
const vendorFetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = (init.method || 'GET').toUpperCase();
  if (!['https://auth.thumbtack.com','https://api.thumbtack.com'].includes(url.origin)) { report.unexpectedRequests.push({ origin: url.origin, path: url.pathname, method }); return deny(); }
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
let modelQueue=[],modelCalls=[],modelFault=null,providerHook=null,backgroundDispatches=[];
function streamResponse(fixture) {
 const rows=[],emit=e=>rows.push('event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n');
 emit({type:'message_start',message:{id:'synthetic-platform-'+modelCalls.length,type:'message',role:'assistant',content:[],model:'claude-opus-5-5',stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}});
 let i=0;for(const tool of fixture.tools||[]){emit({type:'content_block_start',index:i,content_block:{type:'tool_use',id:'tool-'+modelCalls.length+'-'+i,name:tool.name,input:{}}});emit({type:'content_block_delta',index:i,delta:{type:'input_json_delta',partial_json:JSON.stringify(tool.input)}});emit({type:'content_block_stop',index:i++});}
 if(fixture.text){emit({type:'content_block_start',index:i,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:i,delta:{type:'text_delta',text:fixture.text}});emit({type:'content_block_stop',index:i});}
 emit({type:'message_delta',delta:{stop_reason:fixture.tools?.length?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:10}});emit({type:'message_stop'});return new Response(rows.join(''),{headers:{'content-type':'text/event-stream'}});
}
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
 if(url.origin==='https://api.anthropic.com'){
  assert.equal(url.pathname,'/v1/messages');assert.equal(init.redirect,'error');const body=JSON.parse(init.body);assert.equal(body.model,'claude-opus-5-5');assert.equal(body.max_tokens,800);assert.equal(body.stream,true);assert.equal(body.fallbacks,undefined);modelCalls.push(structuredClone(body));
  if(modelFault){const fn=modelFault;modelFault=null;await fn();}assert.ok(modelQueue.length,'Unexpected additional model physical request');const fixture=modelQueue.shift();if(fixture.error)throw Error('Synthetic model response lost');return streamResponse(fixture);
 }
 if(url.origin===origin&&url.pathname==='/api/platform-ai-background'){assert.equal(init.method,'POST');assert.equal(new Headers(init.headers).get('x-service-worker-key'),'s'.repeat(40));backgroundDispatches.push(JSON.parse(init.body));return Response.json({accepted:true},{status:202});}
 if(providerHook){const fn=providerHook;await fn(url,init);}
 return vendorFetch(input,init);
};
const store = await import('../netlify/functions/lib/store.mjs'), { newClient } = await import('../netlify/functions/lib/config.mjs'), { workspaceTenant } = await import('../netlify/functions/lib/workspace-identity.mjs');
const callbackHandler = (await import('../netlify/functions/thumbtack-connect.mjs')).default, recoveryHandler = (await import('../netlify/functions/lead-connections-scheduler.mjs')).default, handler = (await import('../netlify/functions/client.mjs')).default, thumbtack = (await import('../netlify/functions/thumbtack.mjs')).default, native = await import('../netlify/functions/lib/thumbtack-connection.mjs');
async function check(name, run) { fault = null;modelQueue=[];modelFault=null;providerHook=null;Object.assign(process.env,{MC_PLATFORM_AI_ENABLED:'1',MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT:'50'},cfg);await store.del('self_service_ai','daily'); try { await run(); report.checks.push({ name, pass: true }); } catch (error) { report.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } finally { for(const context of contexts.splice(0))await context.close(); fault = null; Object.assign(process.env, cfg); } }
async function fixture() {
  const n = ++serial, slug = 'native-qa-' + n, token = hash('native-qa-session-' + n), businessID = String(300000 + n), negotiationID = String(600000 + n), client = { ...newClient({ slug, ownerKey: 'native-private-' + n, owner: { name: 'Alex Owner', email: slug + '@example.test', phone: '+17135550123' }, business: { name: 'Fixture Home Services', trade: 'HVAC', city: 'Houston', hours:'Mon to Fri 8 to 5' } }), status: 'testing', onboarding: { version: 1 } };
  client.services=['AC repair','AC maintenance'];client.business.serviceArea=['Houston','Katy'];client.fees=[{label:'Diagnostic visit',amount:'89'}];await store.saveClient(client); await store.put('access_sessions', hash(token), { scope: 'onboarding', status: 'active', email: client.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const provider = { businessID, webhooks: [], hideWebhook: false }; providers.set(businessID, provider);
  const thread = { lead: { negotiationID, business: { businessID, name: 'Fixture business' }, customer: { customerID: String(800000 + n), displayName: 'Jamie Customer', location: { city: 'Houston', state: 'TX', zipCode: '77057' } }, category: { categoryID: '100', name: 'AC repair' }, status: 'New', details: [{ question: 'What happened?', answer: 'AC is running warm' }] }, messages: [{ messageID: String(1000000 + n), negotiationID, from: 'Customer', text: 'Can you come tomorrow afternoon?', sentAt: new Date().toISOString(), attachments: [] }] }; threads.set(negotiationID, thread);
  return { client, token, businessID, negotiationID, provider, thread };
}
async function owner(f, body = null) { const response = await handler(new Request(origin + '/api/client?c=' + f.client.slug, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + f.token, Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })); return { status: response.status, body: await response.json() }; }
const operationID = () => hash('native-operation-' + (++serial)).slice(0,32);
async function prepare(f) { const result = await owner(f, { action: 'lead_connection', source: 'thumbtack', operation: 'prepare', expectedGeneration: null, operationId: operationID(), providerBusinessId: f.businessID, integrationEmail: f.client.owner.email }); assert.equal(result.status, 200, JSON.stringify(result)); return result.body.leadConnections.thumbtack; }
async function start(f, view = null) { view ||= await prepare(f); const result = await owner(f, { action: 'start_thumbtack_connection', expectedGeneration: view.generation, operationId: operationID() }); assert.equal(result.status, 200, JSON.stringify(result)); return { view, url: new URL(result.body.url), state: new URL(result.body.url).searchParams.get('state') }; }
async function connect(f) { const started = await start(f); await native.completeThumbtackConnection({ state: started.state, code: 'synthetic-code-' + f.client.slug }); const result = await owner(f); assert.equal(result.status, 200); assert.ok(result.body.leadConnections.thumbtack.capabilities.receiveLeads); return result.body.leadConnections.thumbtack; }
async function row(f) { return store.get('lead_connections', f.client.slug + '/' + workspaceTenant(f.client) + '/thumbtack'); }
async function incoming(f, overrides = {}) { const saved = await row(f), n = saved.native, endpoint = `https://machinesandcloud.com/api/thumbtack?c=${f.client.slug}&t=${workspaceTenant(f.client)}&g=${saved.generation}`; const response = await thumbtack(new Request(overrides.url || endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: 'Basic ' + Buffer.from(n.username + ':' + n.password).toString('base64'), ...(overrides.headers || {}) }, body: JSON.stringify(overrides.body || { negotiationID: f.negotiationID }) })); return { status: response.status, body: await response.json() }; }
async function requestDetail(f) { const data = await owner(f); assert.equal(data.status, 200); const lead = data.body.leads[0]; assert.ok(lead); const response = await handler(new Request(origin + '/api/client?c=' + f.client.slug + '&requestId=' + lead.id, { headers: { Authorization: 'Bearer ' + f.token, Origin: origin } })); assert.equal(response.status, 200); return (await response.json()).request; }
function reply(f, view, detail, extra = {}) { return { action: 'send_platform_reply', requestId: detail.source.id, sourceRevision: detail.sourceRevision, expectedGeneration: view.generation, operationId: operationID(), text: 'Tomorrow afternoon works. What is the property address?', ...extra }; }
const messagePosts = () => report.interceptedRequests.filter(item => item.method === 'POST' && /\/negotiations\/\d+\/messages$/.test(item.path)).length;
const webhookPosts = () => report.interceptedRequests.filter(item => item.method === 'POST' && /\/businesses\/\d+\/webhooks$/.test(item.path)).length;
const tokenPosts = () => report.interceptedRequests.filter(item => item.path === '/oauth2/token').length;


const ai=await import('../netlify/functions/lib/platform-ai.mjs');
const worker=(await import('../netlify/functions/platform-ai-background.mjs')).default;
const setup=await import('../netlify/functions/lib/setup.mjs');
async function aiFixture(){const f=await fixture();f.view=await connect(f);await incoming(f);f.detail=await requestDetail(f);f.requestId=f.detail.source.id;return f;}
async function enable(f){const view=(await owner(f)).body.leadConnections.thumbtack;const result=await owner(f,{action:'platform_automation',source:'thumbtack',operation:'enable',operationId:operationID(),expectedGeneration:view.generation,expectedRevision:view.automation.revision,rulesRevision:view.automation.currentRulesRevision});assert.equal(result.status,200,JSON.stringify(result));return result;}
async function arrival(f,text='Do you repair central AC in Katy?',extra={}){const last=f.thread.messages.at(-1);f.thread.messages.push({messageID:String(++messageSerial),negotiationID:f.negotiationID,from:'Customer',text,sentAt:new Date(Math.max(Date.now()+10,Date.parse(last.sentAt)+1)).toISOString(),attachments:[],...extra});return incoming(f);}
const proposalInput=(extra={})=>({reply:'Yes, we repair central AC in Katy. What is happening with yours?',decision:'reply',summary:'Customer asks about AC repair in Katy.',language:'en',customer_name:'',phone:'',address:'',requested_date:'',requested_window:'',urgency:'flexible',...extra});
function modelProposal(extra={}){modelQueue.push({tools:[{name:'prepare_platform_reply',input:proposalInput(extra)}]});}
async function run(f,extra={}){const response=await worker(new Request(origin+'/api/platform-ai-background',{method:'POST',headers:{'content-type':'application/json','x-service-worker-key':'s'.repeat(40),...extra.headers},body:JSON.stringify({slug:f.client.slug,tenant:workspaceTenant(f.client),requestId:f.requestId,...extra.body})}));return {status:response.status,body:await response.json()};}
async function automated(f){return (await row(f)).native.automation;}
async function threadState(f){return (await automated(f)).threads[f.requestId];}
async function changeThread(f,operation){const d=await requestDetail(f);return owner(f,{action:'platform_automation',source:'thumbtack',operation,operationId:operationID(),expectedGeneration:(await row(f)).generation,expectedRevision:d.platformAutomation.revision,requestId:f.requestId});}
async function disable(f){const v=(await owner(f)).body.leadConnections.thumbtack;return owner(f,{action:'platform_automation',source:'thumbtack',operation:'disable',operationId:operationID(),expectedGeneration:v.generation,expectedRevision:v.automation.revision});}

 const {chromium}=await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
 const contexts=[];report.screenshots=[];report.browserErrors=[];report.uiRequests=[];const accessHandler=(await import('../netlify/functions/access.mjs')).default;
 async function screen(width,{enabled=false,unknown=false,incomplete=false,platformPaused=false}={}) {
  const f=await aiFixture();if(enabled)await enable(f);if(incomplete)await store.atomicUpdate('clients',f.client.slug,c=>({value:{...c,services:[]}}));if(platformPaused)process.env.MC_PLATFORM_AI_ENABLED='0';if(unknown){await arrival(f);modelProposal();fault={mode:'after',match:({url,method})=>method==='POST'&&/\/messages$/.test(url.pathname)};await run(f);}
  const context=await browser.newContext({viewport:{width,height:width<600?844:1050},serviceWorkers:'block'});contexts.push(context);context.setDefaultTimeout(5500);await context.routeWebSocket('**/*',socket=>socket.close());
  await context.addInitScript(token=>sessionStorage.setItem('mc-onboarding-session-v1',token),f.token);let uiFault=null;
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort('blockedbyclient');
   if(url.pathname.startsWith('/api/')) {const run=url.pathname==='/api/client'?handler:url.pathname==='/api/access'?accessHandler:null;if(!run)return route.fulfill({status:404,body:'{}'});const body=request.postData()?JSON.parse(request.postData()):null;report.uiRequests.push({method:request.method(),path:url.pathname,action:body?.action,operation:body?.operation,operationId:body?.operationId});
    const response=await run(new Request(url,{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}));
    if(uiFault&&body&&uiFault.matches(body)){const captured=uiFault;uiFault=null;await captured.after?.();if(captured.lost)return route.abort('connectionreset');}
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
   }
   const file=resolve(process.cwd(),url.pathname.slice(1));if(!file.startsWith(process.cwd()+'/')||!existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({status:200,contentType:({'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream',body:readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',error=>report.browserErrors.push(error.stack));await page.goto(origin+'/desk.html?c='+f.client.slug);await page.locator('#portalContent:not([hidden])').waitFor();if(await page.locator('#guideDialog').isVisible())await page.locator('#skipGuide').click();
  return {f,page,setFault:value=>uiFault=value};
 }
 async function sourceDialog(page){await page.locator('[data-t="setup"]').first().click();await page.locator('[data-lead-source-open="thumbtack"]').click();await page.locator('#leadSourceAutomation:not([hidden])').waitFor();}
 async function requestDialog(page){await page.locator('[data-t="leads"]').first().click();await page.locator('#p-leads [data-request-open]').first().click();await page.locator('#requestContent:not([hidden])').waitFor();await page.locator('#requestPlatformAutomation:not([hidden])').waitFor();}
 async function shot(page,suffix){const file=output.replace(/\.json$/,'')+'-'+suffix+'.png';assert.equal(existsSync(file),false);await page.screenshot({path:file});report.screenshots.push(file);const box=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(box.width<=box.viewport+1);}


async function focusShot(page,selector,name){await page.locator(selector).scrollIntoViewIfNeeded();await shot(page,name);}
try {
await check('Known accepted AI reply awaiting local customer-fact save shows an automatic saving state on mobile',async()=>{
 const {f,page}=await screen(390,{enabled:true});await arrival(f,'I am Jamie. Use (713) 555-0198 at 21 Pine St in Katy.');modelProposal({customer_name:'Jamie',phone:'(713) 555-0198',address:'21 Pine St in Katy'});const original=Map.prototype.set,target=f.client.slug+'/'+f.requestId;let injected=false;Map.prototype.set=function(key,value){if(!injected&&key===target&&typeof value?.value==='string'&&JSON.parse(value.value).platformQualification){injected=true;throw Error('Synthetic durable contact projection write failed');}return original.call(this,key,value);};try{await run(f);}finally{Map.prototype.set=original;}assert.equal(injected,true);assert.equal((await row(f)).native.replies.at(-1).state,'accepted');assert.equal((await threadState(f)).mode,'automatic');await requestDialog(page);assert.equal(await page.locator('#requestAIState').innerText(),'Saving customer details');assert.match(await page.locator('#requestAIReason').innerText(),/saving|saved/i);assert.equal(await page.locator('#requestAITakeover').isDisabled(),false);assert.equal(await page.locator('#requestAIResume').isHidden(),true);await focusShot(page,'#requestPlatformAutomation','mobile-saving-facts');
});
await check('A full retained settings history still lets the owner stop AI from desktop without losing prior actions',async()=>{
 const {f,page}=await screen(1440,{enabled:true});await store.atomicUpdate('lead_connections',f.client.slug+'/'+workspaceTenant(f.client)+'/thumbtack',row=>{const a=structuredClone(row.native.automation);while(a.operations.length<100)a.operations.push({id:operationID(),digest:hash('historic-'+a.operations.length),operation:'enable',at:new Date().toISOString()});return{value:{...row,native:{...row.native,automation:a}}};});const oldOps=structuredClone((await automated(f)).operations),sends=messagePosts(),models=modelCalls.length;await sourceDialog(page);await page.locator('#leadSourceCheck').click();await page.locator('#leadSourceStatus').filter({hasText:/^Saved status checked/}).waitFor();await page.locator('#leadSourceAIDisable:not([disabled])').waitFor();assert.equal(await page.locator('#leadSourceAIDisable').isDisabled(),false);await page.locator('#leadSourceAIDisable').click();await page.locator('#leadSourceStatus').filter({hasText:/AI replies are paused/}).waitFor();const a=await automated(f);assert.equal(a.mode,'off');assert.deepEqual(a.operations,oldOps);assert.equal(a.operations.length,100);assert.equal(a.stopOperation.operation,'disable');assert.equal(messagePosts(),sends);assert.equal(modelCalls.length,models);assert.equal(await page.locator('#leadSourceAIEnable').isDisabled(),true);assert.match(await page.locator('#leadSourceAIReason').innerText(),/history is full/i);await focusShot(page,'#leadSourceAutomation','desktop-full-history-stop');
});
} finally {for(const context of contexts)await context.close();await browser.close();}
report.after=hashes();report.sourceStable=JSON.stringify(report.before)===JSON.stringify(report.after);report.modelRequests=modelCalls.length;report.backgroundDispatches=backgroundDispatches.length;report.passed=report.checks.filter(r=>r.pass).length;report.total=report.checks.length;report.ok=report.passed===report.total&&report.sourceStable&&report.physicalNetworkAttempts===0&&report.unexpectedRequests.length===0&&!(report.browserErrors||[]).length;writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,ok:report.ok,passed:report.passed,total:report.total,sourceStable:report.sourceStable,physicalNetworkAttempts:report.physicalNetworkAttempts,modelRequests:report.modelRequests,failures:report.checks.filter(r=>!r.pass)},null,2));if(!report.ok)process.exitCode=1;
