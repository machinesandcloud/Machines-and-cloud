// PRA-FC2-03/04/05/11/13 browser check: Chrome (channel chrome), 390 and 1440. Actual /api/client, /api/access handlers and
// browser assets in-process; memory storage; fake model; every non-loopback request is refused. Website-chat replies and the
// "live" public config are synthetic route fixtures (named in each check); the unavailable config comes from the actual handler.
// Run from the worktree root: node qa-artifacts/claude-collaboration/fc2-spanish/fc2-spanish-ui-check.mjs --playwright <index.mjs> --out <dir>
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const out = option('--out'), playwrightPath = option('--playwright');
if (!out || !playwrightPath) throw new Error('Use --playwright <index.mjs> --out <dir>');
mkdirSync(out, { recursive: true });
const root = resolve('.'), origin = 'http://127.0.0.1:8922', lib = p => pathToFileURL(resolve(root, p)).href, sha = v => createHash('sha256').update(v).digest('hex');
const report = { at: new Date().toISOString(), browser: 'channel:chrome', checks: [], screenshots: [], forbidden: [], pageErrors: [], physicalNetwork: 0, sources: Object.fromEntries(['embed.js', 'desk.js', 'desk.html', 'desk-calendar.js', 'desk-requests.js', 'desk-customers.js', 'onboard.js', 'onboard.html'].map(f => [f, sha(readFileSync(resolve(root, f)))])) };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('physical transport forbidden'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async input => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };
const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
const { workspaceTenant } = await import(lib('netlify/functions/lib/workspace-identity.mjs'));
const handlers = { '/api/client': (await import(lib('netlify/functions/client.mjs'))).default, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default, '/api/workspace-billing': (await import(lib('netlify/functions/workspace-billing.mjs'))).default, '/api/channel-availability': (await import(lib('netlify/functions/channel-availability.mjs'))).default };
const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const contexts = []; let serial = 0;
const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 86400000));
const DAILY_EN = "Website chat has reached today's limit and reopens after midnight, Houston time. Please contact the shop directly.";
const ENGLISH = ['Chat with us', 'Automated front desk', 'Type your message', 'Send', 'For urgent help', 'Website chat is unavailable', 'Chat didn', 'Try again', 'daily limit', "today's limit", 'The reply was interrupted', 'Front desk', 'Close', 'Your message'];
async function workspace({ spanish = true } = {}) {
  const slug = 'fc2-ui-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FC2-UI-' + serial, owner: { name: 'Ana Owner', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Bayou Plumbing', trade: 'Plumbing', serviceArea: ['Katy'], hours: 'Mon-Sat 7am-6pm', spanish, website: 'https://bayouplumbing.example' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['Drain cleaning'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Sat 7am-6pm');
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, c, tenantIdentity: workspaceTenant(c) };
}
async function context(viewport, w, { locale = 'en-US', liveConfig = null, chat = [], configStatus = null } = {}) {
  const ctx = await browser.newContext({ viewport, locale, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(ctx); ctx.setDefaultTimeout(10000);
  await ctx.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug: w.slug, token: w.token });
  const state = { chats: [] };
  await ctx.routeWebSocket('**/*', socket => socket.close());
  await ctx.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    const host = /^\/host-(es|en)\.html$/.exec(url.pathname);
    if (host) return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${host[1]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bayou Plumbing</title></head><body style="font-family:sans-serif;margin:24px"><h1>Bayou Plumbing</h1><p>${host[1] === 'es' ? 'Plomería en Katy. Hablamos español.' : 'Plumbing in Katy.'}</p><script src="/embed.js" data-client="${w.slug}" data-api="${origin}"></script></body></html>` });
    if (url.pathname === '/api/client' && request.method() === 'GET' && !request.headers().authorization) {
      if (configStatus) return route.fulfill({ status: configStatus, contentType: 'application/json', body: '{}' });
      if (liveConfig) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(liveConfig) }); // synthetic: live, available
    }
    if (url.pathname === '/api/chat') { const next = chat.shift() || { status: 500, body: {} }; state.chats.push(request.postDataJSON()); return route.fulfill({ status: next.status, contentType: next.ndjson ? 'application/x-ndjson' : 'application/json', body: next.ndjson ? next.ndjson.map(x => JSON.stringify(x)).join('\n') + '\n' : JSON.stringify(next.body) }); } // synthetic chat
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON();
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(body?.action)) { report.forbidden.push({ path: url.pathname }); return route.fulfill({ status: 403, body: '{}' }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.72' });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await ctx.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  return { page, state, ctx };
}
async function check(name, run) { const start = contexts.length; try { await run(); report.checks.push({ name, pass: true }); console.log('PASS ' + name); } catch (error) { report.checks.push({ name, pass: false, error: String(error.stack).slice(0, 1500) }); const page = contexts.at(-1)?.pages().at(-1); if (page) await shot(page, 'failure-' + report.checks.length).catch(() => {}); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]); } finally { await Promise.all(contexts.slice(start).map(c => c.close())); } }
async function shot(page, name) { const path = out + '/' + name + '.png'; await page.screenshot({ path }); report.screenshots.push(path); }
async function noHorizontalScroll(page) { const v = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(v.document <= v.viewport + 1, 'Horizontal scroll ' + JSON.stringify(v)); }
const widgetText = page => page.evaluate(() => { const r = document.getElementById('mcDesk'); return [r.innerText, ...[...r.querySelectorAll('[placeholder],[aria-label]')].map(n => (n.placeholder || '') + ' ' + (n.getAttribute('aria-label') || ''))].join('\n'); });
function noEnglish(text, allow = []) { for (const e of ENGLISH) if (!allow.includes(e)) assert.ok(!new RegExp('\\b' + e.replace(/[.*+?^${}()|[\]\\']/g, '\\$&') + '\\b').test(text), 'English widget string "' + e + '" in: ' + text); }
const live = (spanish = true) => ({ slug: 'x', status: 'live', name: 'Bayou Plumbing', greeting: spanish ? 'Hi! ¡Hola! ¿En qué le podemos ayudar?' : 'Hi! What can we help with today?', spanish, businessNumber: '', webAvailable: true });
const replyEs = { status: 200, ndjson: [{ t: 'delta', text: 'Claro, ' }, { t: 'done', reply: 'Claro, con gusto le ayudamos con la fuga. ¿Cuál es su dirección?', events: [] }] };

for (const [w, viewport] of [[390, { width: 390, height: 844 }], [1440, { width: 1440, height: 900 }]]) {
  await check(`FC2-03 ${w}px Spanish shop on a Spanish page: every widget control, footer, reply flow and the daily-limit refusal are Spanish`, async () => {
    const ws = await workspace(); const x = await context(viewport, ws, { liveConfig: live(), chat: [replyEs, { status: 429, body: { error: 'ai_daily_limit', turnNotProcessed: true, message: DAILY_EN } }] });
    await x.page.goto(origin + '/host-es.html'); await x.page.locator('#mcDesk .l').click(); await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled);
    assert.equal(await x.page.locator('#mcDesk .l span').textContent(), 'Escríbanos'); assert.equal(await x.page.locator('#mcDesk textarea').getAttribute('placeholder'), 'Escriba su mensaje');
    assert.equal(await x.page.locator('#mcDesk button.s').textContent(), 'Enviar'); assert.equal(await x.page.locator('#mcDesk').getAttribute('lang'), 'es');
    noEnglish(await widgetText(x.page), ['Front desk']); await noHorizontalScroll(x.page); await shot(x.page, `embed-es-open-${w}`);
    await x.page.locator('#mcDesk textarea').fill('Hola, tengo una fuga debajo del fregadero'); await x.page.locator('#mcDesk button.s').click();
    await x.page.waitForFunction(() => /dirección/.test(document.getElementById('mcDesk').innerText));
    await x.page.locator('#mcDesk textarea').fill('Mi dirección es 12 Oak St'); await x.page.locator('#mcDesk button.s').click();
    await x.page.waitForFunction(() => /medianoche/.test(document.getElementById('mcDesk').innerText));
    const text = await widgetText(x.page); noEnglish(text); assert.match(text, /El chat del sitio web llegó al límite de hoy y se vuelve a abrir después de la medianoche, hora de Houston/); assert.match(text, /Su mensaje no se envió y está de nuevo en el cuadro/);
    assert.equal(await x.page.locator('#mcDesk textarea').inputValue(), 'Mi dirección es 12 Oak St', 'unsent message back in the box');
    assert.equal(await x.page.locator('#mcDesk .b.u').count(), 1, 'one shown customer message');
    await shot(x.page, `embed-es-daily-limit-${w}`);
  });
}
await check('FC2-03 390px paused/unavailable shop (actual public config handler) shows the Spanish unavailable message on a Spanish page', async () => {
  const ws = await workspace(); const x = await context({ width: 390, height: 844 }, ws);
  await x.page.goto(origin + '/host-es.html'); await x.page.locator('#mcDesk .l').click(); await x.page.waitForFunction(() => /no está disponible/.test(document.getElementById('mcDesk').innerText));
  const text = await widgetText(x.page); noEnglish(text); assert.match(text, /El chat del sitio web no está disponible en este momento\. Use los datos de contacto del negocio/); assert.equal(await x.page.locator('#mcDesk textarea').isDisabled(), true);
  await shot(x.page, 'embed-es-unavailable-390');
});
await check('FC2-03 config that fails to load on a Spanish page says so in Spanish (page language is the only truth before config)', async () => {
  const ws = await workspace(); const x = await context({ width: 390, height: 844 }, ws, { configStatus: 500 });
  await x.page.goto(origin + '/host-es.html'); await x.page.locator('#mcDesk .l').click(); await x.page.waitForFunction(() => /no cargó/.test(document.getElementById('mcDesk').innerText));
  noEnglish(await widgetText(x.page)); assert.equal(await x.page.locator('#mcDesk .cfg button').textContent(), 'Intentar de nuevo');
});
await check('FC2-03 truthful: a shop that does not answer in Spanish keeps English chrome even on a Spanish page and es-MX browser', async () => {
  const ws = await workspace({ spanish: false }); const x = await context({ width: 1440, height: 900 }, ws, { locale: 'es-MX', liveConfig: live(false) });
  await x.page.goto(origin + '/host-es.html'); await x.page.locator('#mcDesk .l').click(); await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled);
  assert.equal(await x.page.locator('#mcDesk .l span').textContent(), 'Chat with us'); assert.equal(await x.page.locator('#mcDesk textarea').getAttribute('placeholder'), 'Type your message');
});
await check('FC2-03 Spanish shop, English page: English until the customer writes in Spanish, then Spanish without duplicating the message; es-MX browser is Spanish from the start', async () => {
  const ws = await workspace(); const x = await context({ width: 1440, height: 900 }, ws, { liveConfig: live(), chat: [replyEs] });
  await x.page.goto(origin + '/host-en.html'); await x.page.locator('#mcDesk .l').click(); await x.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled);
  assert.equal(await x.page.locator('#mcDesk button.s').textContent(), 'Send');
  await x.page.locator('#mcDesk textarea').fill('Hola, necesito ayuda con una fuga'); await x.page.locator('#mcDesk button.s').click();
  await x.page.waitForFunction(() => /dirección/.test(document.getElementById('mcDesk').innerText));
  assert.equal(await x.page.locator('#mcDesk button.s').textContent(), 'Enviar'); assert.equal(await x.page.locator('#mcDesk .b.u').count(), 1); noEnglish(await widgetText(x.page), ['Front desk']);
  const y = await context({ width: 390, height: 844 }, ws, { locale: 'es-MX', liveConfig: live() });
  await y.page.goto(origin + '/host-en.html'); await y.page.locator('#mcDesk .l').click(); await y.page.waitForFunction(() => !document.querySelector('#mcDesk textarea').disabled);
  assert.equal(await y.page.locator('#mcDesk textarea').getAttribute('placeholder'), 'Escriba su mensaje');
});

// ---------- desk ----------
async function desk(viewport, ws, hash = '#today') { const x = await context(viewport, ws); await x.page.goto(origin + '/desk.html?c=' + ws.slug + hash); await x.page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); return x; }
const route = (x, tab) => x.page.evaluate(tab => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab } })), tab);
for (const [w, viewport] of [[390, { width: 390, height: 844 }], [1440, { width: 1440, height: 900 }]]) {
  await check(`FC2-04/05 ${w}px a Spanish customer is marked "Habla español / Spanish" on the visit, schedule, inbox, request and customers; the follow-up preview is Spanish`, async () => {
    const ws = await workspace();
    const visit = await store.addRecord('bookings', ws.slug, { tenantIdentity: ws.tenantIdentity, customer_name: 'Rosa Garza', phone: '+17135550199', address: '4410 Bellaire Blvd', issue: 'service visit', date: day(2), window: '8 to 12', status: 'booked', channel: 'web', language: 'es' });
    await store.addRecord('bookings', ws.slug, { tenantIdentity: ws.tenantIdentity, customer_name: 'Ray English', phone: '+17135550198', address: '1 Main', issue: 'leak', date: day(2), window: '12 to 5', status: 'booked', channel: 'web', language: 'en' });
    const lead = await store.addRecord('leads', ws.slug, { tenantIdentity: ws.tenantIdentity, customer_name: 'Lupe Soto', phone: '+18325550144', issue: 'calentador gotea', reason: 'wants_call', outcome: 'wants_call', status: 'open', channel: 'web', urgency: 'this_week', language: 'es' });
    const x = await desk(viewport, ws, '#availability');
    await x.page.locator('#scheduleCalendar [data-calendar-day="' + day(2) + '"]:visible').first().click(); await x.page.locator('#scheduleCalendar [data-calendar-visit="' + visit.id + '"]:visible').first().click(); await x.page.locator('#visitDetails [data-customer-language="es"]').waitFor();
    assert.match(await x.page.locator('#visitDetails').innerText(), /Customer: Rosa Garza · Habla español \/ Spanish/); await noHorizontalScroll(x.page); await shot(x.page, `desk-visit-dialog-${w}`);
    await x.page.keyboard.press('Escape');
    const chips = await x.page.locator('#scheduleCalendar [data-customer-language="es"]').count(); assert.ok(chips >= 1, 'calendar marks the Spanish visit');
    const rows = await x.page.locator('#bookings tr').allTextContents(); assert.ok(rows.some(r => /Rosa Garza Habla español \/ Spanish/.test(r)) && rows.some(r => /Ray English/.test(r) && !/español/.test(r)), rows.join(' | '));
    await x.page.locator('#scheduleCalendar [data-customer-language="es"]:visible').first().scrollIntoViewIfNeeded(); await shot(x.page, `desk-schedule-${w}`);
    await route(x, 'leads'); const card = x.page.locator('#leads [data-record-id="' + lead.id + '"]'); await card.waitFor(); assert.match(await card.innerText(), /Habla español \/ Spanish/);
    await x.page.locator('#leads [data-request-open="' + lead.id + '"]').first().click(); await x.page.locator('#requestContent').waitFor({ state: 'visible' });
    await x.page.waitForFunction(() => /Habla español/.test(document.getElementById('requestFacts').innerText));
    await x.page.waitForFunction(() => /le escribimos una sola vez/.test(document.getElementById('requestAutoBody').textContent));
    const body = await x.page.locator('#requestAutoBody').textContent(); assert.match(body, /^Bayou Plumbing: le escribimos una sola vez sobre su solicitud de servicio \(ref [^)]+\)\. Si necesita ayuda, responda a este mensaje\. Responda STOP o ALTO para dejar de recibir mensajes, o AYUDA para ayuda\.$/);
    report.previewEs = body; await shot(x.page, `desk-request-dialog-${w}`);
    await x.page.evaluate(() => { const p = document.getElementById('requestAutoPurpose'), q = document.getElementById('requestAutoQuote'); p.value = 'quote_followup'; p.dispatchEvent(new Event('change', { bubbles: true })); q.value = 'https://bayouplumbing.example/q/7'; q.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.match(await x.page.locator('#requestAutoBody').textContent(), /presupuesto de su servicio \(ref [^)]+\)\? Su presupuesto: https:\/\/bayouplumbing\.example\/q\/7 Si necesita ayuda, responda a este mensaje\./);
    report.quotePreviewEs = await x.page.locator('#requestAutoBody').textContent();
    await x.page.evaluate(() => { const p = document.getElementById('requestAutoPurpose'); p.value = 'request_followup'; p.dispatchEvent(new Event('change', { bubbles: true })); });
    await x.page.locator('#requestAutoBody').scrollIntoViewIfNeeded().catch(() => {}); await shot(x.page, `desk-request-followup-preview-${w}`);
    await x.page.locator('#requestClose').click();
    await route(x, 'customers'); await x.page.locator('#customerList [data-customer-language="es"]').first().waitFor();
    const customers = await x.page.locator('#customerList article').allInnerTexts(); assert.ok(customers.some(t => /Rosa Garza Habla español/.test(t)) && customers.some(t => /Ray English/.test(t) && !/español/.test(t)), customers.join(' | '));
    await noHorizontalScroll(x.page); await shot(x.page, `desk-customers-${w}`);
  });
  await check(`FC2-11 ${w}px blocked time takes a date range and label in one step, shows the label in the list and calendar; holiday notes in the hours text get a visible hint`, async () => {
    const ws = await workspace(); const x = await desk(viewport, ws, '#availability');
    await x.page.evaluate(() => { document.getElementById('scheduleBlockManager').open = true; });
    await x.page.locator('#availabilityDate').fill(day(9)); await x.page.locator('#availabilityThrough').fill(day(11)); await x.page.locator('#availabilityLabel').fill('Thanksgiving');
    await x.page.locator('#availabilitySubmit').click(); await x.page.waitForFunction(() => /Time blocked\./.test(document.getElementById('availabilityMessage').textContent));
    const msg = await x.page.locator('#availabilityMessage').textContent(); assert.match(msg, / – .*Whole day · Thanksgiving/);
    const list = await x.page.locator('#availabilityBlocks .availability-row').allInnerTexts(); assert.equal(list.length, 3, list.join('|')); assert.ok(list.every(t => /Whole day · Thanksgiving/.test(t)), list.join('|'));
    await x.page.locator('#availabilityBlocks').scrollIntoViewIfNeeded(); await noHorizontalScroll(x.page); await shot(x.page, `desk-blocked-range-${w}`);
    await x.page.locator('#availabilityBackToCalendar').click(); await x.page.waitForFunction(() => [...document.querySelectorAll('#scheduleCalendar .calendar-event-block')].filter(n => /Thanksgiving/.test(n.textContent)).length >= 3);
    await shot(x.page, `desk-calendar-labeled-block-${w}`);
    await x.page.evaluate(() => { document.getElementById('scheduleBlockManager').open = true; }); await x.page.locator('#availabilityWindow').selectOption({ index: 1 }); await x.page.locator('#availabilityThrough').fill(day(12)); await x.page.locator('#availabilitySubmit').click();
    assert.match(await x.page.locator('#availabilityMessage').textContent(), /A date range blocks whole days/);
    await route(x, 'know'); await x.page.evaluate(() => { const d = document.getElementById('desk-setting-7').closest('details'); if (d) d.open = true; });
    const hint = x.page.locator('#hoursHolidayHint'); assert.match(await hint.textContent(), /not applied to your availability/);
    await x.page.locator('#desk-setting-7').fill('Mon-Fri 7-6, Sat 8-12, closed Thanksgiving and Christmas Day');
    await x.page.waitForFunction(() => document.getElementById('hoursHolidayHint').dataset.holidayMentioned === 'true'); assert.match(await hint.textContent(), /Your hours mention a holiday or closure/);
    // QA F3: weekly closures and lunch breaks are not holidays; dated closures and holiday names in either language are.
    const holidayCase = async (text, expected) => { await x.page.locator('#desk-setting-7').fill(text); await x.page.waitForFunction(v => document.getElementById('hoursHolidayHint').dataset.holidayMentioned === v, expected ? 'true' : 'false'); };
    for (const text of ['Mon-Fri 8-6, closed on Sundays', 'Lunes a viernes, s\u00e1bado cerrado', 'Closed for lunch 12-1', 'Lunes a viernes, d\u00eda de trabajo', 'Sunday closed', 'Mon-Sat 7-5, closed the rest of the week']) { await holidayCase(text, false); assert.match(await hint.textContent(), /^Holidays written here are not applied/, text); }
    for (const text of ['Mon-Fri 7-6, closed Dec 24-26', 'Closed on the 4th of July', 'Lunes a viernes 8-6, cerrado el 25 de diciembre', 'Cerrado del 24 al 26', 'Cerramos en Navidad y A\u00f1o Nuevo', 'Closed on Labor Day', 'Mon-Fri, closed for the holidays']) { await holidayCase(text, true); assert.match(await hint.textContent(), /Your hours mention a holiday or closure/, text); }
    await x.page.locator('#desk-setting-7').fill('Mon-Fri 7-6, Sat 8-12, closed Thanksgiving and Christmas Day'); await x.page.waitForFunction(() => document.getElementById('hoursHolidayHint').dataset.holidayMentioned === 'true');
    await hint.scrollIntoViewIfNeeded(); await shot(x.page, `desk-hours-holiday-hint-${w}`);
  });
}

// ---------- onboarding ----------
await check('FC2-13 onboarding examples follow the chosen trade (Plumbing, Electrical, HVAC, generic), stay one short e.g. line, and the greeting example uses the business name', async () => {
  const ws = await workspace(); const x = await context({ width: 390, height: 844 }, ws); await x.page.goto(origin + '/onboard.html');
  const ph = () => x.page.evaluate(() => Object.fromEntries(['services', 'fees', 'faq', 'greeting', 'never', 'licenses'].map(n => [n, document.getElementById('ob').elements[n].placeholder])));
  await x.page.evaluate(() => { const f = document.getElementById('ob'); f.elements.trade.value = 'Plumbing'; f.elements.trade.dispatchEvent(new Event('change', { bubbles: true })); f.elements.business.value = 'Bayou Plumbing'; f.elements.business.dispatchEvent(new Event('input', { bubbles: true })); });
  const p = await ph(); report.plumbingPlaceholders = p;
  assert.match(p.services, /Drain cleaning/); assert.equal(p.greeting, 'e.g. Hi, this is the Bayou Plumbing front desk.'); assert.match(p.licenses, /plumbing/i);
  for (const v of Object.values(p)) { assert.doesNotMatch(v, /\bAC\b|Bayou Air|window units|TACLA/, v); assert.match(v, /^e\.g\. [^\n]+$/, v); }
  await x.page.evaluate(() => { const f = document.getElementById('ob'); f.elements.trade.value = 'Electrical'; f.elements.trade.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.match((await ph()).services, /Panel upgrades/);
  await x.page.evaluate(() => { const f = document.getElementById('ob'); f.elements.trade.value = 'HVAC'; f.elements.trade.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.match((await ph()).services, /AC repair/);
  await x.page.evaluate(() => { const f = document.getElementById('ob'); f.elements.trade.value = 'Landscaping'; f.elements.trade.dispatchEvent(new Event('change', { bubbles: true })); });
  const g = await ph(); assert.equal(g.services, 'e.g. Repairs'); for (const v of Object.values(g)) assert.match(v, /^e\.g\. [^\n]+$/, v); for (const v of Object.values(g)) assert.doesNotMatch(v, /\bAC\b|Drain|window units|TACLA/, v);
});

await browser.close();
report.pass = report.checks.every(c => c.pass) && report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0;
writeFileSync(out + '/ui-report.json', JSON.stringify(report, null, 1));
console.log(`${report.checks.filter(c => c.pass).length}/${report.checks.length} pass, physical=${report.physicalNetwork}, forbidden=${report.forbidden.length}, pageErrors=${report.pageErrors.length}`);
process.exit(report.pass ? 0 : 1);
