// QA-RC end-to-end customer journeys on the release candidate, in a real browser (bundled Chromium headless shell).
// Every browser request is answered by context.route: static files from the copy, /api/* by the actual Netlify
// function handlers loaded in this process (by their config.path). Memory store. The only "model" is an in-process
// Anthropic protocol double (SSE) that emits fixed tool calls; every other server-side fetch is refused and counted.
// Usage (cwd = copy root): node journeys.mjs --playwright <index.mjs> --exe <chrome-headless-shell> --out <dir>
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import { syncBuiltinESMExports } from 'node:module';
const arg = n => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null;
const OUT = resolve(arg('--out')); mkdirSync(OUT, { recursive: true });
const root = resolve('.'), BASE = 'http://127.0.0.1:8961', SHOP = 'https://shop.qa-rc.invalid', MODEL = 'https://model.qa-rc.invalid';
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|THUMBTACK_|ANGI_|ADMIN_KEY|MC_CHAT_)/.test(k)) delete process.env[k];
const OPERATOR = 'qa-rc-operator@example.test';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '0', NODE_ENV: 'test', URL: BASE, PUBLIC_SITE_URL: BASE, ADMIN_EMAILS: OPERATOR, ANTHROPIC_API_KEY: 'offline-protocol-placeholder', ANTHROPIC_BASE_URL: MODEL, MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500' });
const report = { at: new Date().toISOString(), mode: 'actual handlers via context.route, memory store, Anthropic protocol double, server network refused', checks: [], pageErrors: [], consoleErrors: [], blockedBrowser: [], blockedServer: [], unhandledApi: [], modelCalls: 0, overflow: [], shots: [] };
const deny = what => { report.blockedServer.push(String(what).slice(0, 120)); throw new Error('qa-rc journeys: server network refused'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = () => deny('node:net'); syncBuiltinESMExports();

// ---- Anthropic protocol double ----
const nextWeekday = () => { const d = new Date(Date.now() + 86400000 * 2); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const VISIT_DATE = nextWeekday();
let toolSerial = 0;
function sse(blocks, stop) {
  const out = [], emit = d => out.push(`event: ${d.type}\ndata: ${JSON.stringify(d)}\n\n`);
  emit({ type: 'message_start', message: { id: 'qa-' + report.modelCalls, type: 'message', role: 'assistant', content: [], model: 'qa-double', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  blocks.forEach((b, i) => {
    if (b.type === 'text') { emit({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } }); emit({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: b.text } }); }
    else { emit({ type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }); emit({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } }); }
    emit({ type: 'content_block_stop', index: i });
  });
  emit({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 10 } }); emit({ type: 'message_stop' });
  return out.join('');
}
function modelReply(body) {
  const msgs = body.messages || [], last = msgs.at(-1) || {};
  const content = Array.isArray(last.content) ? last.content : [{ type: 'text', text: String(last.content || '') }];
  const toolResult = content.find(c => c.type === 'tool_result');
  if (toolResult) { const t = JSON.stringify(toolResult.content || '').slice(0, 400); report.lastToolResult = t; return { blocks: [{ type: 'text', text: toolResult.is_error ? 'I could not save that. The shop will follow up.' : 'Thanks. That is saved for the shop, and they confirm arrival details directly.' }], stop: 'end_turn' }; }
  const text = content.filter(c => c.type === 'text').map(c => c.text).join(' ');
  const id = 'toolu_qa' + (++toolSerial);
  if (/gas/i.test(text)) return { blocks: [{ type: 'tool_use', id, name: 'notify_owner', input: { customer_name: 'Gina Gasline', phone: '7135550111', address: '5 Oak St, Katy', issue: 'Strong gas smell near the furnace', reason: 'emergency', urgency: 'emergency', wanted: '', language: 'en', nobook_reason: 'none', unsure: '' } }], stop: 'tool_use' };
  if (/callback/i.test(text)) return { blocks: [{ type: 'tool_use', id, name: 'notify_owner', input: { customer_name: 'Riley Request', phone: '7135550133', address: '77 Pine St, Katy', issue: 'AC needs a tune-up', reason: 'lead', urgency: 'this_week', wanted: `${VISIT_DATE} 8 to 12`, language: 'en', nobook_reason: 'other', unsure: '' } }], stop: 'tool_use' };
  if (/book/i.test(text)) return { blocks: [{ type: 'tool_use', id, name: 'book_visit', input: { customer_name: 'Dana Visitor', phone: '7135550122', address: '9 Elm St, Katy', issue: 'AC blows warm air', date: VISIT_DATE, window: '8 to 12', urgency: 'this_week', language: 'en', notes: '', unsure: '' } }], stop: 'tool_use' };
  return { blocks: [{ type: 'text', text: 'Happy to help. What is going on with your system?' }], stop: 'end_turn' };
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin === MODEL && url.pathname === '/v1/messages') {
    report.modelCalls++; const body = JSON.parse(typeof init.body === 'string' ? init.body : await new Response(init.body).text());
    const r = modelReply(body);
    if (body.stream) return new Response(sse(r.blocks, r.stop), { headers: { 'content-type': 'text/event-stream', 'request-id': 'req_qa' } });
    return Response.json({ id: 'qa', type: 'message', role: 'assistant', model: 'qa-double', content: r.blocks.map(b => b.type === 'text' ? b : { type: 'tool_use', id: b.id, name: b.name, input: b.input }), stop_reason: r.stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }, { headers: { 'request-id': 'req_qa' } });
  }
  return deny(url.origin + url.pathname);
};

// ---- handlers ----
const imp = rel => import(pathToFileURL(resolve(rel)).href);
const routes = {};
for (const f of readdirSync('netlify/functions')) { if (!f.endsWith('.mjs')) continue; const mod = await imp('netlify/functions/' + f); for (const p of [].concat(mod.config?.path || [])) routes[p] = mod.default; }
const store = await imp('netlify/functions/lib/store.mjs');
const { accessHash } = await imp('netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await imp('netlify/functions/lib/config.mjs');
const { configurationRevision } = await imp('netlify/functions/lib/setup.mjs');
const { playwrightPath = arg('--playwright'), exe = arg('--exe') } = {};
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });

const check = (journey, name, pass, detail) => { report.checks.push({ journey, name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); console.log((pass ? 'PASS ' : 'FAIL ') + journey + ' :: ' + name + (pass || detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 300))); };
const step = async (journey, name, fn) => { try { const d = await fn(); check(journey, name, true, d); return d; } catch (e) { check(journey, name, false, String(e?.message || e).split('\n')[0].slice(0, 400)); return undefined; } };
let ipSerial = 20;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const hostPage = slug => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA Comfort Air</title></head><body><h1>QA Comfort Air</h1><p>Family HVAC in Katy.</p><script src="${BASE}/embed.js" data-client="${slug}" async></script></body></html>`;
async function ctx(width, label, { ip } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  context.setDefaultTimeout(12000);
  const myIp = ip || '192.0.2.' + (++ipSerial % 250);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === SHOP) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: hostPage(url.searchParams.get('c') || '') });
    if (url.origin !== BASE) { report.blockedBrowser.push(url.origin + url.pathname); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const h = routes[url.pathname]; if (!h) { report.unhandledApi.push(url.pathname); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa_no_route"}' }); }
      const method = req.method(), body = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? undefined : req.postData();
      try { const res = await h(new Request(url, { method, headers: req.headers(), ...(body !== undefined ? { body } : {}) }), { ip: myIp }); const buf = Buffer.from(await res.arrayBuffer()); if (url.pathname === '/api/access' || url.pathname === '/api/intake' || res.status >= 400) (report.api ||= []).push({ label, method, path: url.pathname, status: res.status, body: buf.toString().slice(0, 240) }); return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: buf }); }
      catch (e) { report.pageErrors.push({ label, handlerThrow: url.pathname, error: String(e?.message || e).slice(0, 200) }); return route.fulfill({ status: 500, body: 'handler threw' }); }
    }
    let rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    if (rel.split('/').some(p => p.startsWith('.'))) return route.fulfill({ status: 404, body: '' });
    let path = join(root, rel); if (!existsSync(path) && existsSync(path + '.html')) path += '.html';
    if (!existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: TYPES[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage();
  page.on('pageerror', e => report.pageErrors.push({ label, message: e.message.slice(0, 300) }));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_BLOCKED|status of 4\d\d/.test(m.text())) report.consoleErrors.push({ label, text: m.text().slice(0, 200) }); });
  return { context, page };
}
const shot = async (page, name) => { const p = join(OUT, name + '.png'); await page.screenshot({ path: p, fullPage: false }); report.shots.push(name); };
const overflow = async (page, label) => { const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })); if (o.sw > o.iw + 1) report.overflow.push({ label, ...o }); return o; };
const visibleText = page => page.evaluate(() => document.body.innerText);
const sess = async email => { const token = createHash('sha256').update('qa-rc-' + email + Math.random()).digest('hex'); await store.put('access_sessions', accessHash(token), { email, scope: email === OPERATOR ? 'operator' : 'onboarding', status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }); return token; };
async function openDesk(width, slug, token, hash = '', label = 'desk') {
  const x = await ctx(width, label + '-' + width);
  await x.page.goto(BASE + '/desk.html?c=' + slug);
  await x.page.evaluate(([t, h]) => { sessionStorage.setItem('mc-onboarding-session-v1', t); history.replaceState(null, '', location.pathname + location.search + h); }, [token, hash]);
  await x.page.reload(); await x.page.locator('#portalContent:not([hidden])').waitFor({ timeout: 15000 });
  return x;
}
let shopSerial = 0;
async function liveShop(label) {
  const slug = 'qa-rc-' + label + '-' + (++shopSerial), email = slug + '@example.test';
  const c = newClient({ slug, ownerKey: 'private-' + slug, owner: { name: 'Alex Owner', email, phone: '+17135550198' }, business: { name: 'QA Comfort Air ' + label, trade: 'HVAC', city: 'Houston', serviceArea: ['Katy'], hours: 'Mon-Sun 7am-7pm', website: SHOP } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: email }, status: 'live', liveAt: new Date().toISOString(), services: ['AC repair'], windows: ['8 to 12', '12 to 5'], build: { status: 'built', source: 'owner_answers' }, channels: { web: { active: true } } });
  c.rules.hours = parseHours('Mon-Sun 7am-7pm'); c.widget.allowedOrigins = [SHOP];
  const v = configurationRevision(c); c.setupProof = { reviewedRevision: v, testedRevision: v, testMode: 'live' };
  await store.saveClient(c); await store.indexClient?.(c);
  return { slug, email, token: await sess(email) };
}

try {
  for (const width of [390, 1440]) {
    // ===== J1 homepage -> inquiry -> onboarding -> desk =====
    {
      const J = 'J1-signup-' + width, email = `qa-rc-owner-${width}@example.test`;
      process.env.MC_FAKE_MODEL = '1'; // access.mjs keeps the loopback test inbox only with MC_FAKE_MODEL=1 (onboarding makes no model call)
      const { context, page } = await ctx(width, J);
      await step(J, 'homepage renders headline and inquiry form', async () => { await page.goto(BASE + '/'); await page.locator('#signup-intake').waitFor({ state: 'attached' }); await overflow(page, J + '-home'); await shot(page, J + '-01-home'); return { title: await page.title() }; });
      await step(J, 'inquiry submits through /api/intake and hands off to onboarding', async () => {
        await page.locator('#pilot').scrollIntoViewIfNeeded();
        await page.locator('#intake-name').fill('Quinn Owner'); await page.locator('#intake-email').fill(email); await page.locator('#intake-business').fill('QA Signup Air ' + width);
        await shot(page, J + '-02-inquiry');
        await Promise.all([page.waitForURL(/onboard\.html/, { timeout: 15000 }), page.locator('#signup-intake button[type=submit], #signup-intake [type=submit]').first().click()]);
        const prospects = (await store.list('prospects', '')).length; if (!prospects) throw new Error('no prospect saved'); return { url: page.url().replace(/#.*/, '#…'), prospects };
      });
      await step(J, 'onboarding shows the email gate with the inquiry email carried over', async () => { await page.locator('#access-gate').waitFor({ state: 'visible' }); await overflow(page, J + '-gate'); await shot(page, J + '-03-gate'); const v = await page.locator('#access-email').inputValue(); return { prefilled: v === email, value: v }; });
      await step(J, 'email link (fake mailbox) verifies and opens the questionnaire', async () => {
        if (!(await page.locator('#access-email').inputValue())) await page.locator('#access-email').fill(email);
        await page.locator('#access-send').click(); let delivery = null; for (let i = 0; i < 60 && !delivery?.link; i++) { await page.waitForTimeout(200); delivery = await store.get('access_outbox', accessHash(email)); }
        if (!delivery?.link) throw new Error('no fake mailbox link; status: ' + (await page.locator('#access-gate').innerText()).slice(0, 300)); await shot(page, J + '-03b-link-sent'); const sentText = (await page.locator('#access-gate').innerText()).slice(0, 300);
        await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' }); return { sentText, name: await page.locator('#name').inputValue(), business: await page.locator('#business').inputValue() };
      });
      await step(J, 'questionnaire completes and creates one workspace', async () => {
        await page.locator('#name').fill('Quinn Owner'); await page.locator('#phone').fill('7135550101'); await page.locator('#next').click(); await page.locator('[data-step="2"]').waitFor({ state: 'visible' });
        await page.locator('#business').fill('QA Signup Air ' + width); await page.locator('#trade').selectOption('HVAC'); await page.locator('#services').fill('AC repair'); await page.locator('#hours').fill('Mon to Fri 8 am to 5 pm'); await page.locator('#serviceArea').fill('Katy'); await page.locator('#spanish').selectOption('no');
        await overflow(page, J + '-step2'); await shot(page, J + '-04-step2');
        await page.locator('#next').click(); await page.locator('[data-step="3"]').waitFor({ state: 'visible' }); await page.locator('#fees').fill('Diagnostic: $89'); await page.locator('#windows').fill('8 to 12\n12 to 5');
        await page.locator('#next').click(); await page.locator('[data-step="4"]').waitFor({ state: 'visible' }); await overflow(page, J + '-step4'); await shot(page, J + '-05-step4');
        const step4 = (await page.locator('[data-step="4"]').innerText()).slice(0, 1200);
        while (await page.locator('#done.on').count() === 0) { const before = await page.locator('#ob fieldset[data-step]:visible').getAttribute('data-step').catch(() => null); await page.locator('#next').click(); await page.waitForTimeout(400); if (await page.locator('#err').innerText().catch(() => '')) { const e = await page.locator('#err').innerText(); if (e.trim()) throw new Error('form error: ' + e.slice(0, 200)); } if (before === '9') break; }
        await page.locator('#done.on').waitFor(); await shot(page, J + '-06-done');
        const clients = (await store.list('clients', '')).filter(k => k.includes('qa-signup-air')); return { clients: clients.length, doneText: (await page.locator('#done').innerText()).slice(0, 300), step4Excerpt: step4.slice(0, 500) };
      });
      await step(J, 'workspace link opens the desk with the business name, no owner key in URL', async () => {
        const href = await page.locator('#goPortal').getAttribute('href'); if (new URL(href, BASE).searchParams.has('k')) throw new Error('owner key in link');
        await page.locator('#goPortal').click(); await page.locator('#title').filter({ hasText: 'QA Signup Air' }).waitFor({ timeout: 15000 });
        await overflow(page, J + '-desk'); await shot(page, J + '-07-desk-home');
        const t = await visibleText(page); return { url: page.url().replace(/#.*/, ''), mentionsLive: /\byou are live\b|is live now/i.test(t), homeExcerpt: t.slice(0, 600) };
      });
      await step(J, 'Front desk / Connections page renders truthful channel states', async () => {
        await page.locator('[data-t="setup"]').first().click(); await page.waitForTimeout(600); await overflow(page, J + '-setup'); await shot(page, J + '-08-frontdesk');
        const t = await page.locator('#p-setup').innerText(); return { claimsConnected: /Google Calendar\s*(is\s*)?connected|Calendar connected/i.test(t), phoneLive: /phone (answering )?is live/i.test(t), excerpt: t.slice(0, 900) };
      });
      await context.close(); process.env.MC_FAKE_MODEL = '0';
    }

    if (process.env.QA_ONLY === 'J1') continue;
    // ===== J2 website chat install -> visitor conversation -> booking; J3 emergency =====
    const S = await liveShop('web' + width);
    {
      const J = 'J2-website-chat-' + width;
      await step(J, 'owner sees the install snippet for the website', async () => {
        const x = await openDesk(width, S.slug, S.token, '#setup', J); await x.page.waitForTimeout(800);
        const t = await x.page.locator('#p-setup').innerText(); await shot(x.page, J + '-01-install'); await overflow(x.page, J + '-install'); await x.context.close();
        return { hasEmbedSnippet: /embed\.js|data-client/.test(t) || /Copy (the )?code/i.test(t), excerpt: t.slice(0, 500) };
      });
      const v = await ctx(width, J + '-visitor', { ip: '198.51.100.' + (width % 200) });
      await step(J, 'widget loads on the shop site and opens', async () => {
        await v.page.goto(SHOP + '/?c=' + S.slug); await v.page.locator('#mcDesk .l').waitFor({ timeout: 15000 }); await v.page.locator('#mcDesk .l').click();
        await v.page.waitForFunction(() => { const t = document.querySelector('#mcDesk textarea'); return t && !t.disabled; }, null, { timeout: 15000 }); await overflow(v.page, J + '-widget'); await shot(v.page, J + '-02-widget-open');
      });
      const send = async text => { await v.page.locator('#mcDesk textarea').fill(text); await v.page.locator('#mcDesk button.s').click(); await v.page.waitForFunction(() => !document.querySelector('#mcDesk .m .b.t') && !document.querySelector('#mcDesk textarea')?.disabled, null, { timeout: 15000 }); return (await v.page.locator('#mcDesk .m .b.a').allTextContents()).at(-1); };
      await step(J, 'first visitor turn is answered and a conversation token is issued', async () => { const r = await send('Hi, my AC is blowing warm air.'); const saved = await v.page.evaluate(s => sessionStorage.getItem('mc_desk_' + s), S.slug); return { reply: r, tokenKept: /token/i.test(saved || '') }; });
      await step(J, 'second turn (token carried) books a visit through book_visit', async () => {
        const r = await send('Please book me for the first window that day.'); await shot(v.page, J + '-03-booked');
        const bookings = []; for (const k of await store.list('bookings', S.slug + '/')) bookings.push(await store.get('bookings', k));
        const real = bookings.filter(b => b && b.customer_name === 'Dana Visitor');
        if (!real.length) throw new Error('no booking saved; last tool result ' + report.lastToolResult);
        return { reply: r, booking: { id: real[0].id, date: real[0].date, window: real[0].window, status: real[0].status }, toolResult: report.lastToolResult?.slice(0, 200) };
      });
      await v.context.close();
      const e = await ctx(width, 'J3-emergency-visitor-' + width, { ip: '203.0.113.' + (width % 200) });
      await step('J3-inbox-emergency-' + width, 'emergency visitor message saves an urgent owner request', async () => {
        await e.page.goto(SHOP + '/?c=' + S.slug); await e.page.locator('#mcDesk .l').click(); await e.page.waitForFunction(() => { const t = document.querySelector('#mcDesk textarea'); return t && !t.disabled; }, null, { timeout: 15000 });
        await e.page.locator('#mcDesk textarea').fill('I smell gas near my furnace!'); await e.page.locator('#mcDesk button.s').click();
        await e.page.waitForFunction(() => !document.querySelector('#mcDesk .m .b.t') && !document.querySelector('#mcDesk textarea')?.disabled, null, { timeout: 15000 });
        const leads = []; for (const k of await store.list('leads', S.slug + '/')) leads.push(await store.get('leads', k));
        const urgent = leads.find(l => l?.customer_name === 'Gina Gasline'); if (!urgent) throw new Error('no emergency lead; ' + report.lastToolResult);
        const reply = (await e.page.locator('#mcDesk .m .b.a').allTextContents()).at(-1); await shot(e.page, 'J3-inbox-emergency-' + width + '-01-visitor');
        const deliveries = []; for (const k of await store.list('managed_deliveries', S.slug + '/')) deliveries.push(await store.get('managed_deliveries', k));
        return { reply, urgency: urgent.urgency, reason: urgent.reason, ownerNotices: deliveries.filter(d => d && d.channel === 'email').map(d => ({ purpose: d.purpose, subject: d.subject || null, state: d.state })) };
      });
      // a non-urgent request for J4 schedule-from-request
      await step('J3-inbox-emergency-' + width, 'a normal callback request is also saved', async () => {
        await e.page.locator('#mcDesk textarea').fill('Can I get a callback about a tune-up?'); await e.page.locator('#mcDesk button.s').click();
        await e.page.waitForFunction(() => !document.querySelector('#mcDesk .m .b.t') && !document.querySelector('#mcDesk textarea')?.disabled, null, { timeout: 15000 });
        const leads = []; for (const k of await store.list('leads', S.slug + '/')) leads.push(await store.get('leads', k)); if (!leads.find(l => l?.customer_name === 'Riley Request')) throw new Error('no lead: ' + report.lastToolResult); return { leads: leads.length };
      });
      await e.context.close();
      const d = await openDesk(width, S.slug, S.token, '#leads', 'J3-desk');
      await step('J3-inbox-emergency-' + width, 'Inbox lists the emergency first, labelled urgent, newest first', async () => {
        await d.page.locator('#p-leads').waitFor({ state: 'visible' }); await d.page.waitForTimeout(500); await overflow(d.page, 'J3-inbox-' + width); await shot(d.page, 'J3-inbox-emergency-' + width + '-02-inbox');
        const t = await d.page.locator('#p-leads').innerText(); const iGas = t.indexOf('Gina'), iRiley = t.indexOf('Riley');
        if (iGas < 0 || iRiley < 0) throw new Error('requests missing in inbox: ' + t.slice(0, 300));
        return { emergencyFirst: iGas < iRiley, urgentLabel: /urgent|emergency/i.test(t.slice(0, Math.max(iRiley, iGas) + 200)), hasOpenDone: /\bOpen\b/.test(t) && /\bDone\b/.test(t), excerpt: t.slice(0, 500) };
      });
      await step('J3-inbox-emergency-' + width, 'Home shows the urgent request needing attention', async () => {
        await d.page.locator('[data-t="today"]').first().click(); await d.page.waitForTimeout(500); const t = await d.page.locator('#p-today').innerText(); await shot(d.page, 'J3-inbox-emergency-' + width + '-03-home');
        return { mentionsGina: t.includes('Gina'), excerpt: t.slice(0, 400) };
      });
      // ===== J4 visit edit and schedule from request =====
      const J4 = 'J4-visits-' + width;
      await step(J4, 'Schedule lists the booked visit and its details open', async () => {
        await d.page.locator('[data-t="availability"]').first().click(); await d.page.waitForTimeout(600); await overflow(d.page, J4 + '-schedule'); await shot(d.page, J4 + '-00-schedule');
        if (!(await d.page.locator('#scheduleHistory').evaluate(e => e.open))) await d.page.locator('#scheduleHistory summary').click();
        const open = d.page.locator('#bookings tr').filter({ hasText: /Dana/ }).locator('.visit-open').first();
        if (!(await open.count())) { const t = await d.page.locator('#p-availability').innerText(); throw new Error('no Dana visit button: ' + t.slice(0, 300)); }
        await open.click(); await d.page.locator('#visitDialog[open]').waitFor(); await shot(d.page, J4 + '-01-visit'); return { title: await d.page.locator('#visitTitle').innerText(), details: (await d.page.locator('#visitDetails').innerText()).slice(0, 200) };
      });
      await step(J4, 'Edit details saves a corrected address, keeps date/window', async () => {
        await d.page.locator('#editVisitDetails').click(); await d.page.locator('#visitEditForm:not([hidden])').waitFor(); await overflow(d.page, J4 + '-edit'); await shot(d.page, J4 + '-02-edit-form');
        await d.page.locator('#visitEditAddress').fill('11 Elm St, Katy'); await d.page.locator('#saveVisitDetails').click();
        await d.page.waitForFunction(() => /saved|updated|changed/i.test(document.querySelector('#visitMessage')?.textContent || ''), null, { timeout: 15000 }); await shot(d.page, J4 + '-03-edited');
        const b = []; for (const k of await store.list('bookings', S.slug + '/')) b.push(await store.get('bookings', k)); const dana = b.find(x => x?.customer_name === 'Dana Visitor');
        return { address: dana.address, date: dana.date, window: dana.window, message: (await d.page.locator('#visitMessage').innerText()).slice(0, 300) };
      });
      await step(J4, 'empty required detail is refused inline', async () => {
        const editBtn = { visible: await d.page.locator('#editVisitDetails').isVisible(), disabled: await d.page.locator('#editVisitDetails').isDisabled().catch(() => null) };
        if (await d.page.locator('#visitDialog[open]').count()) { await d.page.locator('#closeVisit').click(); await d.page.waitForTimeout(300); }
        if (!(await d.page.locator('#scheduleHistory').evaluate(e => e.open))) await d.page.locator('#scheduleHistory summary').click();
        await d.page.locator('#bookings tr').filter({ hasText: /Dana/ }).locator('.visit-open').first().click(); await d.page.locator('#visitDialog[open]').waitFor();
        await d.page.locator('#editVisitDetails').click(); await d.page.locator('#visitEditForm:not([hidden])').waitFor();
        await d.page.locator('#visitEditName').fill(''); await d.page.locator('#saveVisitDetails').click(); await d.page.waitForTimeout(300);
        const invalid = await d.page.locator('#visitEditName').getAttribute('aria-invalid'); const err = await d.page.locator('#visitEditNameError').innerText();
        await d.page.locator('#discardVisitDetails').click(); await d.page.locator('#closeVisit').click(); await d.page.locator('#visitDialog[open]').waitFor({ state: 'detached' }).catch(() => {}); return { editButtonAfterSave: editBtn, invalid, err };
      });
      await step(J4, 'Schedule a visit from the request pre-fills Add visit and saves a linked visit', async () => {
        await d.page.locator('[data-t="leads"]').first().click(); await d.page.waitForTimeout(400);
        const clicked = await d.page.evaluate(() => { const b = [...document.querySelectorAll('#p-leads [data-request-open]')].find(x => { let n = x; for (let i = 0; i < 4 && n; i++, n = n.parentElement) if (/Riley Request/.test(n.textContent) && !/Gina/.test(n.textContent)) return true; return false; }); if (b) b.click(); return !!b; }); if (!clicked) throw new Error('no Riley request button'); await d.page.locator('#requestSchedule').waitFor({ state: 'visible' }); await shot(d.page, J4 + '-04-request');
        await d.page.locator('#requestSchedule').click(); await d.page.locator('#visitDialog[open]').waitFor(); await d.page.locator('#visitFromRequest:not([hidden])').waitFor();
        const pre = { name: await d.page.locator('#visitName').inputValue(), phone: await d.page.locator('#visitPhone').inputValue(), address: await d.page.locator('#visitAddress').inputValue(), date: await d.page.locator('#visitDate').inputValue() };
        await overflow(d.page, J4 + '-fromreq'); await shot(d.page, J4 + '-05-from-request');
        if (!pre.date) await d.page.locator('#visitDate').fill(VISIT_DATE);
        await d.page.locator('#visitFindTimes').click(); await d.page.waitForTimeout(800);
        const slot = d.page.locator('#visitAvailableTimes button').first(); if (await slot.count()) await slot.click(); else await d.page.locator('#visitWindow').selectOption({ index: 0 });
        await d.page.locator('#saveVisit').click(); await d.page.waitForFunction(() => /saved|Linked/i.test(document.querySelector('#visitMessage')?.textContent || ''), null, { timeout: 15000 }); await shot(d.page, J4 + '-06-from-request-saved');
        const b = []; for (const k of await store.list('bookings', S.slug + '/')) b.push(await store.get('bookings', k)); const r = b.find(x => x?.customer_name === 'Riley Request');
        return { prefill: pre, saved: !!r, sourceRequestId: !!r?.sourceRequestId, message: (await d.page.locator('#visitMessage').innerText()).slice(0, 300) };
      });
      await d.context.close();
    }

    // ===== J5 Connections (front desk service panel) =====
    {
      const J = 'J5-connections-' + width, x = await openDesk(width, S.slug, S.token, '#setup', J);
      await step(J, 'Connections show website chat on, phone/text/Calendar not falsely active', async () => {
        await x.page.waitForTimeout(800); await overflow(x.page, J); await shot(x.page, J + '-01');
        const t = await x.page.locator('#p-setup').innerText(); const avail = await (await routes['/api/channel-availability'](new Request(BASE + '/api/channel-availability'), { ip: '192.0.2.9' })).json().catch(() => null);
        return { calendarClaimedConnected: /Calendar\s*(is\s*)?connected(?! yet| before)/i.test(t) && !/not connected/i.test(t), phoneClaimedLive: /(phone|calls?)\s*(answering\s*)?(is\s*)?live/i.test(t), channelAvailability: avail, excerpt: t.slice(0, 1200) };
      });
      const buttons = await x.page.locator('#p-setup button:visible').allTextContents().catch(() => []);
      check(J, 'service buttons listed', true, buttons.slice(0, 25));
      await x.context.close();
    }

    // ===== J6 admin health and issues =====
    {
      const J = 'J6-admin-' + width, op = await sess(OPERATOR), x = await ctx(width, J);
      await step(J, 'operator sign-in opens admin with health banner and issues', async () => {
        await x.page.goto(BASE + '/admin.html'); await x.page.evaluate(t => sessionStorage.setItem('mc-operator-session-v1', t), op); await x.page.reload(); await x.page.locator('#app:not([hidden])').waitFor({ timeout: 15000 });
        await x.page.waitForTimeout(800); await overflow(x.page, J); await shot(x.page, J + '-01-admin');
        const t = await visibleText(x.page); return { mentionsHealth: /health|scheduler|worker/i.test(t), excerpt: t.slice(0, 900) };
      });
      await step(J, 'customer detail lists issues for the live shop', async () => {
        await x.page.locator('[data-view=customers]').click(); await x.page.locator(`#customers [data-customer="${S.slug}"]`).click(); await x.page.locator('#detailTitle').waitFor(); await x.page.waitForTimeout(400); await shot(x.page, J + '-02-customer');
        return { excerpt: (await visibleText(x.page)).slice(0, 700) };
      });
      await step(J, 'owner session cannot use the operator API; anonymous health is sanitized', async () => {
        const asOwner = await routes['/api/manage'](new Request(BASE + '/api/manage', { headers: { origin: BASE, authorization: 'Bearer ' + S.token } }), { ip: '192.0.2.5' });
        const anon = await routes['/api/manage'](new Request(BASE + '/api/manage', { headers: { origin: BASE } }), { ip: '192.0.2.5' });
        const health = await routes['/api/health'](new Request(BASE + '/api/health'), { ip: '192.0.2.5' }); const htext = await health.text();
        return { ownerStatus: asOwner.status, anonStatus: anon.status, healthStatus: health.status, healthBody: htext.slice(0, 300) };
      });
      await x.context.close();
    }

    // ===== J7 account pause / cancel / reopen =====
    {
      const J = 'J7-account-' + width, A = await liveShop('acct' + width), x = await openDesk(width, A.slug, A.token, '#account', J);
      const status = async () => (await store.get('clients', A.slug)).status;
      await step(J, 'Pause workspace', async () => { await x.page.locator('#pause').click(); await x.page.waitForFunction(() => /paused/i.test(document.querySelector('#accountServiceMessage')?.textContent || ''), null, { timeout: 15000 }); await shot(x.page, J + '-01-paused'); return { status: await status(), msg: await x.page.locator('#accountServiceMessage').innerText() }; });
      await step(J, 'Resume workspace', async () => { const b = x.page.locator('#resume'); if (!(await b.count())) throw new Error('no Resume button: ' + (await x.page.locator('#accountServiceScope').innerText())); await b.click(); await x.page.waitForFunction(() => /resum|restored|live/i.test(document.querySelector('#accountServiceMessage')?.textContent || ''), null, { timeout: 15000 }); return { status: await status(), msg: await x.page.locator('#accountServiceMessage').innerText() }; });
      await step(J, 'Stop service (cancel) with confirmation', async () => {
        const opener = x.page.locator('#cancelBtn2'); if (await opener.isVisible()) await opener.click(); await x.page.locator('#cancelGo').waitFor({ state: 'visible' });
        await overflow(x.page, J + '-cancel'); await shot(x.page, J + '-02-cancel-confirm'); await x.page.locator('#cancelGo').click();
        await x.page.waitForFunction(() => /stopped/i.test(document.querySelector('#accountServiceMessage')?.textContent || ''), null, { timeout: 15000 }); await shot(x.page, J + '-03-stopped'); return { status: await status(), msg: await x.page.locator('#accountServiceMessage').innerText() };
      });
      await step(J, 'Reopen your workspace', async () => { await x.page.locator('#reopenWorkspace').click(); await x.page.waitForFunction(() => /reopened|Nothing was changed/i.test(document.querySelector('#accountServiceMessage')?.textContent || ''), null, { timeout: 15000 }); await shot(x.page, J + '-04-reopened'); return { status: await status(), msg: await x.page.locator('#accountServiceMessage').innerText() }; });
      await x.context.close();
    }
  }
} finally {
  await browser.close();
  report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, pageErrors: report.pageErrors.length, consoleErrors: report.consoleErrors.length, overflow: report.overflow.length, blockedServer: report.blockedServer.length, unhandledApi: [...new Set(report.unhandledApi)] };
  writeFileSync(join(OUT, 'journeys.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.summary));
}
