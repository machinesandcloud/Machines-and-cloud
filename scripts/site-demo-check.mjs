// Independent local browser acceptance. Never starts a server, reads .env or uses a real model.
// Root must first supply a provider-off MC_MEMORY_STORE=1 / MC_FAKE_MODEL=1 server.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = new URL(option('--base', ''));
assert.ok(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port && base.pathname === '/' && !base.search && !base.hash && !base.username && !base.password, 'explicit loopback HTTP origin required');
assert.ok(args.includes('--fake-model-ready'), 'wait for root READY, then pass --fake-model-ready for the isolated fake-model server');
assert.ok(option('--playwright'), 'pass the existing Playwright index.mjs path; no installs');
const { chromium } = await import(pathToFileURL(resolve(option('--playwright'))));
const fixturesOnly = args.includes('--fixtures-only');
const prefix = option('--output-prefix', 'scratchpad/site-demo'); mkdirSync(resolve(prefix, '..'), { recursive: true });
const hash = body => createHash('sha256').update(body).digest('hex');
const files = ['index.html', 'stories.js', 'site-refresh.css', 'styles.css', 'script.js', ...(!fixturesOnly ? ['netlify/functions/chat.mjs', 'netlify/functions/lib/fake-model.mjs', 'netlify/functions/lib/agent.mjs'] : [])];
const fingerprint = () => Object.fromEntries(files.map(file => [file, hash(readFileSync(file))]));
const report = { startedAt: new Date().toISOString(), base: base.origin, fixturesOnly, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), source: fingerprint(), checks: [], issues: [], cases: [], screenshots: [], browserErrors: [], blockedRequests: [], localFakeRequests: [], localFakeResponses: [], progressiveConversations: [], otherFormSubmissions: 0, evidenceLimits: 'Real local fake-model requests and synthetic browser fetch/stream fixtures are identified separately. No real-model quality, production behavior, persistence or provider-delivery claim. Offline business-store isolation has separate scripts/persona-check.mjs evidence.' };
const check = (name, pass, detail) => { const row = { name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }; report.checks.push(row); if (!pass) report.issues.push(row); };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const personas = { sms: 'bayou-air', call: 'katy-pipeworks', spanish: 'westheimer-maids' };
let activeCase = '';

async function fresh({ width = 1440, reduce = false, fixture = null, clock = false, javascript = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 1000 }, reducedMotion: reduce ? 'reduce' : 'no-preference', javaScriptEnabled: javascript, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base.origin && url.pathname === '/api/chat' && request.method() === 'POST') {
      let body; try { body = request.postDataJSON(); } catch {}
      if (fixturesOnly || !body || !Object.values(personas).includes(body.persona) || body.client || body.key || body.stream !== true || !Array.isArray(body.messages)) {
        report.blockedRequests.push({ case: activeCase, method: request.method(), path: url.pathname, reason: 'invalid/non-persona demo request' }); return route.abort();
      }
      report.localFakeRequests.push({ case: activeCase, persona: body.persona, stream: body.stream, messages: body.messages });
      return route.continue();
    }
    if (url.origin !== base.origin || request.method() !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
      report.blockedRequests.push({ case: activeCase, method: request.method(), url: url.origin + url.pathname, resource: request.resourceType() }); return route.abort();
    }
    return route.continue();
  });
  if (context.routeWebSocket) await context.routeWebSocket('**/*', ws => { report.blockedRequests.push({ case: activeCase, method: 'WEBSOCKET', url: ws.url() }); ws.close(); });
  await context.exposeBinding('__demoOtherSubmit', () => { report.otherFormSubmissions++; });
  await context.addInitScript(() => document.addEventListener('submit', event => { if (event.target.id !== 'example-form') { event.preventDefault(); void window.__demoOtherSubmit(); } }, true));
  if (fixture) await context.addInitScript(({ origin, fixture }) => {
    const nativeFetch = window.fetch.bind(window); window.__demoFixtureRequests = [];
    window.fetch = (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.origin !== origin || url.pathname !== '/api/chat') return nativeFetch(input, init);
      const body = JSON.parse(init.body || '{}'); window.__demoFixtureRequests.push(body);
      if (fixture === 'http-error' || fixture === 'rate-limit') return Promise.resolve(new Response(JSON.stringify({ error: fixture === 'rate-limit' ? 'busy' : 'offline' }), { status: fixture === 'rate-limit' ? 429 : 503, headers: { 'Content-Type': 'application/json' } }));
      const enc = new TextEncoder(), finalReply = 'DEMO-FINAL: I have the details for this practice request. Nothing has been booked or sent.';
      const summary = { type: 'owner_notification', owner: 'Ray', company: 'Bayou Air & Heat', data: { customer_name: 'Alex Fixture', phone: '(713) 555-0142', address: '12 Oak St, Katy', issue: 'AC not cooling', requested_window: 'Tomorrow, 12 to 5', urgency: 'this_week', language: 'en' }, at: '2026-10-22T01:00:00Z' };
      if (fixture === 'sparse') for (const key of ['customer_name', 'phone', 'address', 'requested_window']) summary.data[key] = '';
      // Intentionally ignores AbortSignal: late bytes must also be rejected by the UI generation guard.
      const stream = new ReadableStream({ start(controller) {
        if (fixture !== 'delayed') init.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} });
        if (fixture === 'timeout') return;
        const send = text => { try { controller.enqueue(enc.encode(text)); } catch {} };
        const close = () => { try { controller.close(); } catch {} };
        const delay = fixture === 'delayed' ? 2000 : 100;
        setTimeout(() => send(JSON.stringify({ t: 'delta', text: 'DEMO-STREAM: ' }) + '\n'), delay);
        if (fixture === 'stream-error') return setTimeout(() => { send(JSON.stringify({ t: 'error', error: 'offline' }) + '\n'); close(); }, delay + 100);
        if (fixture === 'truncated') return setTimeout(close, delay + 100);
        setTimeout(() => { const line = JSON.stringify({ t: 'delta', text: 'checking your request.' }) + '\n'; send(line.slice(0, 13)); send(line.slice(13)); }, delay + 100);
        setTimeout(() => { send(JSON.stringify({ t: 'done', reply: finalReply, events: [summary] }) + '\n'); close(); }, delay + 400);
      } });
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }));
    };
  }, { origin: base.origin, fixture });
  else {
    const caseName = activeCase;
    await context.exposeBinding('__demoActualResponse', (_, row) => { report.localFakeResponses.push({ case: caseName, ...row }); });
    await context.addInitScript(({ origin }) => {
      const nativeFetch = window.fetch.bind(window); window.__demoResponseReads = [];
      window.fetch = async (input, init) => {
        const response = await nativeFetch(input, init);
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.origin === origin && url.pathname === '/api/chat') {
          // Observe a cloned body from this same response before the app cancels its reader.
          // No second request is made; Chrome's protocol body lookup is deliberately avoided.
          const clone = response.clone(), status = response.status;
          window.__demoResponseReads.push(clone.text().then(text => ({ status, rows: text.trim().split('\n').filter(Boolean).map(JSON.parse) })).catch(error => ({ status, error: String(error.message || error) })).then(row => window.__demoActualResponse(row)));
        }
        return response;
      };
    }, { origin: base.origin });
  }
  const page = await context.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', error => report.browserErrors.push({ case: activeCase, error: error.message }));
  if (clock) await page.clock.install();
  const response = await page.goto(base.href, { waitUntil: 'domcontentloaded' });
  check(`${activeCase}: local homepage200`, response?.status() === 200);
  if (clock) await page.clock.runFor(100); else await page.waitForTimeout(100);
  return { context, page, clock };
}
async function advance(page, ms) { await page.clock.runFor(ms); await page.waitForTimeout(10); }
async function capture(page, name) { const path = `${prefix}-${name}.png`; await page.screenshot({ path, animations: 'disabled' }); report.screenshots.push(path); }
async function state(page) {
  return page.locator('#demo-wrap').evaluate(el => ({ messages: el.querySelector('#example-messages').innerText, summary: el.querySelector('#example-summary').innerText, count: [...el.querySelectorAll('#example-messages .site-message')].filter(node => node.getClientRects().length).length, progress: el.querySelector('#example-progress')?.textContent, play: el.querySelector('#example-play')?.textContent, input: el.querySelector('#example-input')?.value, error: el.querySelector('#example-error')?.textContent, scrollY, width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
}
async function mode(page, live) { await page.locator(live ? '#example-mode-live' : '#example-mode-watch').click(); }
async function send(page, input) { await page.locator('#example-input').fill(input); await page.locator('#example-send').click(); }
async function composerSafety(page, width) {
  if (width > 390) return;
  await page.locator('#example-send').evaluate(el => el.scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(100);
  const geometry = await page.evaluate(() => {
    const send = document.querySelector('#example-send'), launcher = document.querySelector('#mcAgentLauncher');
    const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const a = rect(send), b = rect(launcher), style = getComputedStyle(launcher), hit = document.elementFromPoint((a.left + a.right) / 2, (a.top + a.bottom) / 2);
    return { send: a, launcher: b, launcherVisible: style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0', overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, sendReceivesHit: hit === send || send.contains(hit), viewport: innerHeight };
  });
  check(`${width}px bottom composer Send is not covered by sales launcher`, !geometry.launcherVisible && geometry.sendReceivesHit && geometry.send.top >= 0 && geometry.send.bottom <= geometry.viewport + 1, geometry);
  await page.locator('#mcAgentLauncher').evaluate(el => el.focus());
  check(`${width}px hidden sales launcher cannot take focus`, await page.locator('#mcAgentLauncher').evaluate(el => document.activeElement !== el));
  await capture(page, `${width}-composer-safe`);
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
  check(`${width}px sales launcher returns away from composer`, await page.locator('#mcAgentLauncher').isVisible());
  await mode(page, false); await page.waitForTimeout(100);
  check(`${width}px Watch restores sales launcher`, await page.locator('#mcAgentLauncher').isVisible());
  await mode(page, true);
}
async function run(name, options, work) {
  activeCase = name; let handle;
  try { handle = await fresh(options); await work(handle.page); await handle.page.evaluate(async () => Promise.all(window.__demoResponseReads || [])); report.cases.push({ name, evidence: options.fixture ? `browser-fixture:${options.fixture}` : name.startsWith('actual local fake') ? 'local fake persona endpoint' : 'rendered local frontend only', state: await state(handle.page), ...(options.fixture ? { fixtureRequests: await handle.page.evaluate(() => window.__demoFixtureRequests) } : {}) }); }
  catch (error) { report.issues.push({ name, detail: String(error.message || error) }); }
  finally { if (handle) await handle.context.close(); }
}

try {
  await run('playback lifecycle', { clock: true }, async page => {
    const initial = await state(page);
    check('offscreen begins with first customer only', initial.count === 1, initial);
    check('offscreen summary does not reveal contact early', !/713|Alex/.test(initial.summary), initial.summary);
    await advance(page, 12000); check('offscreen does not autoplay or force scroll', (await state(page)).count === 1 && await page.evaluate(() => scrollY) === 0);
    await page.locator('#week').scrollIntoViewIfNeeded(); const before = await page.evaluate(() => scrollY);
    // IntersectionObserver dispatch is native; let its first callback schedule the fake-clock timer.
    await page.waitForTimeout(80);
    await advance(page, 2600); const playing = await state(page);
    check('first viewport intersection starts ordered playback', playing.count >= 2 && playing.count < 4, playing);
    check('playback does not force page scroll', Math.abs(playing.scrollY - before) <= 2, { before, after: playing.scrollY });
    await capture(page, '1440-watch-playing');
    await page.locator('#example-play').click(); const paused = await state(page);
    await advance(page, 10000); check('Pause freezes messages and owner summary', JSON.stringify(await state(page)) === JSON.stringify(paused));
    await page.locator('#example-play').click(); await advance(page, 8000);
    check('Play completes four ordered messages', (await state(page)).count === 4 && /4\s+of\s+4/.test((await state(page)).progress));
    check('completed Watch offers one Replay control', !await page.locator('#example-play').isVisible() && await page.locator('#example-replay').isVisible());
    await capture(page, '1440-watch-complete');
    await advance(page, 12000); check('completed playback never loops', (await state(page)).count === 4);
    await page.locator('#example-replay').click(); check('Replay resets message progress/contact summary', (await state(page)).count === 1 && !/713|Alex/.test((await state(page)).summary));
    await advance(page, 500); await page.evaluate(() => scrollTo(0, 0)); await advance(page, 10000); const offscreen = await state(page);
    await page.locator('#week').scrollIntoViewIfNeeded(); await advance(page, 10000);
    check('offscreen pause requires explicit Play on return', (await state(page)).count === offscreen.count && (await state(page)).summary === offscreen.summary);
    await page.locator('#example-play').click(); await advance(page, 500);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = await state(page); await advance(page, 10000);
    check('visibility event pauses playback', (await state(page)).count === hidden.count && (await state(page)).summary === hidden.summary);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await advance(page, 10000);
    check('returning visible does not auto-resume', (await state(page)).count === hidden.count);
    await page.locator('[data-example="call"]').focus(); await page.keyboard.press('Space');
    check('scenario keyboard switch resets progress and summary', await page.locator('[data-example="call"]').getAttribute('aria-pressed') === 'true' && !(await state(page)).summary.includes('Alex'));
    const switched = await state(page); await advance(page, 10000);
    check('scenario switch cancels old playback timer', (await state(page)).messages === switched.messages && (await state(page)).summary === switched.summary);
    await page.locator('#example-play').click(); await advance(page, 500); await mode(page, true); const live = await state(page); await advance(page, 10000);
    check('Try mode cancels pending Watch playback', (await state(page)).messages === live.messages && (await state(page)).summary === live.summary);
    await mode(page, false); const watch = await state(page); await advance(page, 10000);
    check('returning to Watch requires explicit Play', (await state(page)).messages === watch.messages && (await state(page)).summary === watch.summary);
  });
  for (const width of [320, 390, 1440]) await run(`reduced motion ${width}`, { width, reduce: true, clock: true }, async page => {
    check(`${width}px reduced motion shows complete static example`, (await state(page)).count === 4);
    await page.locator('#week').scrollIntoViewIfNeeded(); const before = await state(page); await advance(page, 12000);
    check(`${width}px reduced motion does not auto animate`, (await state(page)).messages === before.messages && (await state(page)).summary === before.summary);
    check(`${width}px no horizontal overflow`, (await state(page)).scrollWidth <= width + 1);
    await page.locator('[data-example="spanish"]').focus(); await page.keyboard.press('Enter');
    check(`${width}px Spanish scenario usable by keyboard`, await page.locator('[data-example="spanish"]').getAttribute('aria-pressed') === 'true' && (await state(page)).count === 4);
    await capture(page, `${width}-watch-static`);
    await mode(page, true); check(`${width}px live mode has labeled composer`, await page.locator('#example-input').isVisible() && (!!await page.locator('#example-input').getAttribute('aria-label') || await page.locator('label[for="example-input"]').count() > 0));
    check(`${width}px practice-only notice visible`, /practice conversation only/i.test(await page.locator('#demo-wrap').innerText()) && /no appointments or messages are sent/i.test(await page.locator('#demo-wrap').innerText()));
    await composerSafety(page, width);
    await capture(page, `${width}-live`);
  });
  await run('progressive live fixture', { width: 390, fixture: 'stream', clock: true, reduce: true }, async page => {
    await mode(page, true);
    check('blank live send disabled', await page.locator('#example-send').isDisabled());
    await page.locator('#example-input').fill('Synthetic AC question'); await page.locator('#example-send').focus(); await page.keyboard.press('Enter'); await advance(page, 150);
    check('streamed delta appears before final summary', (await state(page)).messages.includes('DEMO-STREAM') && !(await state(page)).summary.includes('Alex Fixture'));
    check('send is disabled while reply is pending', await page.locator('#example-send').isDisabled());
    check('pending composer is read-only', await page.locator('#example-input').evaluate(el => el.readOnly));
    check('one explicit send creates one fixture request', await page.evaluate(() => window.__demoFixtureRequests.length) === 1);
    await advance(page, 1000); const final = await state(page);
    check('final response replaces streamed draft', final.messages.includes('DEMO-FINAL') && !final.messages.includes('DEMO-STREAM'), final.messages);
    check('owner event populates truthful supplied fields', ['Alex Fixture', '713', '12 Oak St', 'AC not cooling', '12 to 5'].every(text => final.summary.includes(text)), final.summary);
    check('send recovers after final response', await page.locator('#example-input').evaluate(el => !el.disabled && !el.readOnly));
    check('mobile link indicates updated owner summary', /updated/i.test(await page.locator('#example-summary-link').innerText()));
    await capture(page, '390-live-final');
    await page.locator('#example-summary-link').focus(); await page.keyboard.press('Enter');
    const summaryTop = await page.locator('#owner-note-title').evaluate(el => ({ top: el.getBoundingClientRect().top, header: document.querySelector('#navbar').getBoundingClientRect().bottom }));
    check('keyboard summary link reaches owner view below header', summaryTop.top >= summaryTop.header - 2 && summaryTop.top < 300, summaryTop);
    await capture(page, '390-owner-summary');
  });
  await run('sparse live summary', { fixture: 'sparse', clock: true, reduce: true }, async page => {
    await mode(page, true); await send(page, 'AC not cooling'); await advance(page, 1200);
    const summary = (await state(page)).summary;
    check('unknown summary fields remain Not provided without scripted bleed', /not provided/i.test(summary) && !/713|Alex|12 Oak|12 to 5/.test(summary) && summary.includes('AC not cooling'), summary);
  });
  for (const fixture of ['http-error', 'rate-limit', 'stream-error', 'truncated', 'timeout']) await run(`live ${fixture}`, { fixture, clock: true, reduce: true }, async page => {
    await mode(page, true); await send(page, 'Synthetic retry question'); await advance(page, fixture === 'timeout' ? 91000 : 1200);
    check(`${fixture} exposes retryable visible error`, await page.locator('#example-error').isVisible() && (await page.locator('#example-error').innerText()).trim().length > 0);
    check(`${fixture} does not populate final owner summary`, !(await state(page)).summary.includes('Alex Fixture'));
    check(`${fixture} input remains available to retry`, await page.locator('#example-input').evaluate(el => !el.disabled && !el.readOnly));
  });
  for (const action of ['reset', 'mode', 'scenario']) await run(`late response after ${action}`, { fixture: 'delayed', clock: true, reduce: true }, async page => {
    await mode(page, true); await send(page, 'Synthetic stale request');
    if (action === 'reset') await page.locator('#example-reset').click();
    else if (action === 'mode') await mode(page, false);
    else await page.locator('[data-example="call"]').click();
    const cleared = await state(page); await advance(page, 5000); const late = await state(page);
    check(`${action} rejects stale reply and owner event`, !late.messages.includes('DEMO-') && !late.summary.includes('Alex Fixture') && late.messages === cleared.messages && late.summary === cleared.summary, late);
    if (action !== 'mode') check(`${action} clears busy composer`, !await page.locator('#example-input').isDisabled());
  });
  if (!fixturesOnly) for (const scenario of [
    { id: 'sms', width: 1440, name: 'Morgan Lee', phone: '7135550111', street: '120 Oak', window: '8 to 12', language: 'English', turns: ['My AC is blowing warm in Katy.', "I'm Morgan Lee.", 'My phone is 713-555-0111.', 'The address is 120 Oak St, Katy.', 'Tomorrow, 8 to 12 works for my request.'] },
    { id: 'call', width: 390, name: 'Jamie Reed', phone: '7135550112', street: '125 Oak', window: '12 to 5', language: 'English', turns: ['My kitchen drain is slow in Katy.', 'I am Jamie Reed.', 'My phone is 713-555-0112.', 'The address is 125 Oak St, Katy.', 'Tomorrow, 12 to 5 works for my request.'] },
    { id: 'spanish', width: 320, name: 'Ana Ruiz', phone: '7135550113', street: '130 Oak', window: '1 a 3', language: 'Spanish', turns: ['Hola, necesito una limpieza en Memorial.', 'Soy Ana Ruiz.', 'Mi teléfono es 713-555-0113.', 'La dirección es 130 Oak St, Memorial.', 'Mañana de 1 a 3, por favor.'] },
  ]) await run(`actual local fake ${scenario.id}`, { width: scenario.width, reduce: true }, async page => {
    await page.locator(`[data-example="${scenario.id}"]`).click(); await mode(page, true);
    const turns = [];
    for (const [index, input] of scenario.turns.entries()) {
      await send(page, input);
      await page.waitForFunction(() => document.querySelector('#example-messages').getAttribute('aria-busy') === 'false' && !document.querySelector('#example-input').readOnly);
      assert.ok(!await page.locator('#example-error').isVisible(), 'actual fake endpoint returned a visible error');
      const current = await state(page), digits = current.summary.replace(/\D/g, '');
      check(`${scenario.id} turn${index + 1} displays customer and reply`, current.messages.includes(input) && current.count === 1 + 2 * (index + 1), current.messages);
      check(`${scenario.id} turn${index + 1} summary tracks only collected fields`, (index >= 1 ? current.summary.includes(scenario.name) : !current.summary.includes(scenario.name)) && (index >= 2 ? digits.includes(scenario.phone) : !digits.includes(scenario.phone)) && (index >= 3 ? current.summary.includes(scenario.street) : !current.summary.includes(scenario.street)) && (index >= 4 ? current.summary.toLowerCase().includes(scenario.window) : !current.summary.toLowerCase().includes(scenario.window)), current.summary);
      check(`${scenario.id} turn${index + 1} summary keeps language`, current.summary.includes(scenario.language), current.summary);
      const reply = await page.locator('#example-messages .site-message-agent p').last().innerText();
      check(`${scenario.id} turn${index + 1} no fabricated delivery or reservation`, !/\b(booked|reserved|text sent|texted|email sent|agendad[oa]|reservad[oa]|mensaje enviado)\b/i.test(reply), reply);
      turns.push({ input, reply, summary: current.summary });
    }
    const final = await state(page);
    check(`${scenario.id} complete data stays a Visit request`, /visit request/i.test(await page.locator('#example-ticket-status').innerText()) && final.summary.includes('Owner reviews the visit request'));
    if (scenario.width <= 390) { await page.locator('#example-summary-link').click(); await capture(page, `${scenario.width}-${scenario.id}-fake-summary`); }
    else { await page.locator('#demo-wrap').scrollIntoViewIfNeeded(); await capture(page, `${scenario.width}-${scenario.id}-fake`); }
    report.progressiveConversations.push({ persona: personas[scenario.id], width: scenario.width, turns });
  });
  if (!fixturesOnly) check('15 allowed persona requests returned successful local NDJSON', report.localFakeRequests.length === 15 && report.localFakeResponses.length === 15 && report.localFakeResponses.every(response => response.status === 200 && response.rows?.at(-1)?.t === 'done'), { requests: report.localFakeRequests.length, responses: report.localFakeResponses.length });
  check('no JavaScript errors', report.browserErrors.length === 0, report.browserErrors);
  check('no unrelated form submissions', report.otherFormSubmissions === 0);
  check('only expected font GETs were blocked', report.blockedRequests.every(x => x.method === 'GET' && x.url?.startsWith('https://fonts.googleapis.com/')), report.blockedRequests.filter(x => !(x.method === 'GET' && x.url?.startsWith('https://fonts.googleapis.com/'))));
  report.sourceAfter = fingerprint(); check('relevant sources stayed stable during acceptance', JSON.stringify(report.source) === JSON.stringify(report.sourceAfter));
  report.result = report.issues.length ? 'failed' : 'passed';
} catch (error) { report.result = 'failed'; report.error = String(error.message || error); }
finally {
  await browser.close(); report.finishedAt = new Date().toISOString(); writeFileSync(`${prefix}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, issues: report.issues.length, error: report.error, evidence: `${prefix}.json` }));
  if (report.result !== 'passed') process.exitCode = 1;
}
