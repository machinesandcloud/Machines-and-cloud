// Actual management handler and browser UI; all HTTP is intercepted locally.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const output = process.argv[process.argv.indexOf('--output') + 1];
if (!process.argv.includes('--output') || !/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw new Error('Pass a new scratchpad evidence output');
const prefix = output.slice(0, -5), base = 'http://127.0.0.1:8894', email = 'save-feedback-operator@example.test';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: base, PUBLIC_SITE_URL: base, ADMIN_EMAILS: email });
const assets = ['admin.html', 'admin.js', 'admin.css', 'product-ui.css', 'design-system.css', 'brand-marks.js', 'assets/logo-dark.png', 'assets/logo.png', 'assets/favicon.png'];
const files = [...assets, 'scripts/experience-admin-check.mjs', 'netlify/functions/manage.mjs', 'netlify/functions/lib/operator.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/store.mjs'];
const hash = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(files.map(file => [file, hash(readFileSync(file))]));
const report = { at: new Date().toISOString(), mode: 'actual management handler and local browser; memory; no external HTTP, email, model or provider', sourceBefore: hashes(), checks: [], requests: [], blocked: [], pageErrors: [], screenshots: [] };
globalThis.fetch = async input => { report.blocked.push(String(input)); throw new Error('Physical networking disabled'); };
const store = await import('../netlify/functions/lib/store.mjs'), access = await import('../netlify/functions/lib/access.mjs'), config = await import('../netlify/functions/lib/config.mjs');
const manage = (await import('../netlify/functions/manage.mjs')).default;
let serial = 0, fault = null, readFault = null, hold = null;
const c = config.newClient({ slug: 'save-feedback-air', ownerKey: 'SYNTHETIC-OWNER-CANARY', owner: { name: 'Synthetic Owner', email: 'owner@example.test', phone: '+17135550142' }, business: { name: 'Save Feedback Air', trade: 'HVAC', city: 'Houston', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
c.onboarding = { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }; c.services = ['AC repair']; c.windows = ['8 to 12']; c.build = { status: 'built', source: 'owner_answers' }; c.status = 'testing';
await store.put('clients', c.slug, c);
const other = config.newClient({ slug: 'save-feedback-plumbing', ownerKey: 'SYNTHETIC-OTHER-CANARY', owner: { name: 'Other Owner', email: 'other@example.test', phone: '+17135550143' }, business: { name: 'Save Feedback Plumbing', trade: 'Plumbing', city: 'Houston' } });
other.onboarding = { version: 1, verifiedEmail: other.owner.email, desiredChannels: ['web'] }; await store.put('clients', other.slug, other);
const token = hash('synthetic-save-feedback-session');
await store.put('access_sessions', access.accessHash(token), { scope: 'operator', email, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 950 }, reducedMotion: 'reduce' }); context.setDefaultTimeout(7000);
const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== base) { report.blocked.push(request.url()); return route.abort(); }
  if (url.pathname === '/api/manage') {
    const body = request.method() === 'POST' ? JSON.parse(request.postData()) : null;
    let response;
    if (request.method() === 'GET' && readFault && (readFault === 'overview' ? !url.search : url.search === '?c=' + c.slug)) {
      const denied = readFault === 'denied_detail'; readFault = null;
      response = new Response(JSON.stringify({ error: denied ? 'unauthorized' : 'unavailable', message: denied ? 'Injected operator access expired.' : 'Injected account readback unavailable.' }), { status: denied ? 401 : 503 });
    } else if (body && fault === 'post_rejected') {
      fault = null; response = new Response(JSON.stringify({ error: 'unavailable', message: 'Injected save unavailable; no change accepted.' }), { status: 503 });
    } else {
      response = await manage(new Request(url, { method: request.method(), headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.' + ++serial });
      if (body && response.ok && fault) {
        const active = fault; fault = null;
        if (active === 'post_receipt_lost') response = new Response(JSON.stringify({ error: 'unknown', message: 'Injected saved receipt lost; result not confirmed.' }), { status: 503 });
        else if (active === 'overview' || active === 'detail' || active === 'denied_detail') readFault = active;
        else if (active === 'hold_overview') hold.armed = true;
      }
    }
    report.requests.push({ method: request.method(), query: url.search, action: body?.action || null, status: response.status });
    if (request.method() === 'GET' && !url.search && hold?.armed) { const gate = hold; gate.armed = false; gate.reached(); await gate.release; }
    try { return await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }); }
    catch (error) { if (!/Target|closed|intercept|Invalid|canceled/i.test(error.message)) throw error; return; }
  }
  const file = url.pathname.slice(1);
  if (!assets.includes(file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ status: 200, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html', body: readFileSync(file) });
});
const check = (name, pass, detail) => { report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); assert.ok(pass, name); };
async function attempt(name, run) { const before = report.checks.length; try { await run(); } catch (error) { if (report.checks.length === before || report.checks.at(-1).pass) report.checks.push({ name, pass: false, detail: error.stack }); } }
const posts = () => report.requests.filter(row => row.method === 'POST' && row.action === 'save_note').length;
async function select(slug = c.slug) { await page.locator('[data-view=customers]').click(); await page.locator('#customers [data-customer="' + slug + '"]').click(); await page.waitForFunction(() => document.activeElement.id === 'detailTitle'); }
async function startNote(text) { await select(); await page.locator('[data-action=save_note]').click(); await page.locator('#actionNote').fill(text); await page.locator('#actionReason').fill('Synthetic confirmed-save recovery check'); }
async function shot(name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path }); report.screenshots.push(path); }
async function focused() { return page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id, action: document.activeElement.dataset.action || null, text: document.activeElement.textContent.slice(0, 240) })); }
try {
 await page.goto(base+'/admin.html');await page.evaluate(t=>sessionStorage.setItem('mc-operator-session-v1',t),token);await page.reload();await page.locator('#app:not([hidden])').waitFor();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:950});for(const view of ['overview','customers','issues','system']){await page.locator('[data-view="'+view+'"]').click();await shot(view+'-'+width);check(view+' fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}}
 await attempt('confirmed save survives a failed overview refresh', async () => {
   await page.setViewportSize({width:390,height:950});
   const note = 'Saved note with unavailable account refresh';
   await startNote(note); fault = 'overview';
   await page.locator('#actionSubmit').click();
   await page.waitForFunction(() => document.querySelector('#appStatus').textContent.includes('Could not refresh'));
   check('note is retained by the actual handler before readback failure', (await store.get('clients', c.slug)).management.notes.some(row => row.text === note));
   await shot('saved-note-refresh-failure-390');
   check('confirmed note remains visible when overview refresh fails', await page.locator('#customerDetail').innerText().then(text => text.includes(note)));
   check('saved result has a focused read-only recovery action', await page.locator('#savedTitle').evaluate(node => node === document.activeElement) && await page.locator('#refreshCustomerDetail').isVisible());
   const before = posts();
   await page.locator('#refreshCustomerDetail').click();
   await page.locator('#savedTitle').waitFor({state:'detached'});
   check('read-only recovery shows one saved note without another mutation', posts() === before && (await store.get('clients', c.slug)).management.notes.filter(row => row.text === note).length === 1 && await page.locator('#customerDetail').innerText().then(text => text.includes(note)));
 });
 await attempt('confirmed save survives a failed detail refresh', async () => {
   const note = 'Saved note with unavailable detail refresh';
   await startNote(note); fault = 'detail'; await page.locator('#actionSubmit').click();
   await page.locator('#savedTitle').waitFor();
   check('detail readback failure keeps confirmed note and saved status', await page.locator('#customerDetail').innerText().then(text => text.includes(note) && text.includes('Internal note saved.')));
   for (const width of [320,390,768,1024,1440]) {
     await page.setViewportSize({width,height:950});
     check('saved result and recovery fit '+width, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await page.locator('#refreshCustomerDetail').isVisible());
     if ([390,1440].includes(width)) await shot('saved-note-detail-failure-'+width);
   }
   const before = posts(); readFault = 'detail';
   await page.locator('#refreshCustomerDetail').click();
   await page.locator('#customerDetail .notice.error').waitFor();
   check('another failed read retains note and read-only recovery', posts() === before && await page.locator('#refreshCustomerDetail').isVisible() && await page.locator('#customerDetail').innerText().then(text => text.includes(note)));
   await page.locator('#refreshCustomerDetail').click();
   await page.locator('#customerDetail .notice.error').waitFor({state:'detached'});
   check('detail recovery does not repeat the saved change', posts() === before && (await store.get('clients', c.slug)).management.notes.filter(row => row.text === note).length === 1);
 });
 await attempt('rejected save keeps the draft without claiming success', async () => {
   const note = 'Rejected note stays in the editor';
   await startNote(note); fault = 'post_rejected'; await page.locator('#actionSubmit').click();
   await page.locator('#actionStatus').filter({hasText:'no change accepted'}).waitFor();
   check('rejected action keeps editable work and no saved result', await page.locator('#actionDialog').evaluate(node => node.open) && await page.locator('#actionNote').inputValue() === note && await page.locator('#savedTitle').count() === 0 && !(await store.get('clients', c.slug)).management.notes.some(row => row.text === note));
   await page.locator('#actionCancel').click();
 });
 await attempt('lost mutation receipt remains unconfirmed until a read', async () => {
   const note = 'Saved note with a lost mutation receipt';
   await startNote(note); fault = 'post_receipt_lost'; const before = posts(); await page.locator('#actionSubmit').click();
   await page.locator('#actionStatus').filter({hasText:'result not confirmed'}).waitFor();
   check('lost receipt is not labelled saved or automatically retried', posts() === before + 1 && await page.locator('#actionDialog').evaluate(node => node.open) && await page.locator('#actionNote').inputValue() === note && await page.locator('#savedTitle').count() === 0);
   await page.locator('#actionCancel').click(); await page.locator('#refreshAll').click();
   await page.waitForFunction(text => document.querySelector('#customerDetail').textContent.includes(text), note);
   check('ordinary refresh confirms the lost receipt without another write', posts() === before + 1 && (await store.get('clients', c.slug)).management.notes.filter(row => row.text === note).length === 1);
 });
 await attempt('slow readback preserves the saved result and later selection', async () => {
   const note = 'Saved note before a slow overview refresh';
   let reached, release; const pending = new Promise(resolve => reached = resolve); const gate = new Promise(resolve => release = resolve);
   hold = {reached,release:gate,armed:false};
   try {
     await startNote(note); fault = 'hold_overview'; const before = posts(); await page.locator('#actionSubmit').click(); await pending;
     check('confirmed result is visible before a slow readback finishes', await page.locator('#customerDetail').innerText().then(text => text.includes(note)) && await page.locator('#toast').innerText().then(text => text.includes('Internal note saved.')));
     await select(other.slug); release(); await page.waitForFunction(() => !document.querySelector('#refreshAll').disabled);
     check('late refresh does not reopen the prior customer or repeat the action', posts() === before + 1 && await page.locator('#detailTitle').innerText().then(text => text === other.business.name));
   } finally { release(); hold = null; }
 });
 await attempt('readback access denial clears the confirmed private projection', async () => {
   await startNote('Private note cleared when operator access expires'); fault = 'denied_detail'; await page.locator('#actionSubmit').click();
   await page.locator('#login:not([hidden])').waitFor();
   check('late saved feedback cannot restore data after access denial', await page.locator('#customerDetail').innerText() === '' && await page.locator('#savedTitle').count() === 0 && await page.evaluate(() => !sessionStorage.getItem('mc-operator-session-v1')));
 });
 check('browser and handler made no external requests', report.blocked.length === 0);
 check('changed journey has no browser errors', report.pageErrors.length === 0);
} finally {report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length};writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});await browser.close();console.log(JSON.stringify({output,...report.summary,sourceStable:report.sourceStable}));}
