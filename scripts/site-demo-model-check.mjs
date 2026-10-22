// Bounded real-model acceptance of the inline practice desk. Root supplies the guarded local server.
// This spends Anthropic credit; do not include it in generic smoke tests.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
assert.ok(args.includes('--guarded-real-model-ready') && args.includes('--playwright'), 'Root must first start the guarded real-model server; pass --guarded-real-model-ready --playwright /existing/index.mjs');
const base = 'http://127.0.0.1:8894';
const output = args.includes('--output') ? value('--output') : 'scratchpad/site-demo-real-model.json', ledgerPath = 'scratchpad/site-demo-model-network.json';
const expectedStart = args.includes('--expected-start') ? Number(value('--expected-start')) : 0;
const sourceFiles = ['index.html', 'stories.js', 'site-refresh.css', 'netlify/functions/chat.mjs', 'netlify/functions/lib/agent.mjs'];
const fingerprint = () => Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
const ledger = () => JSON.parse(readFileSync(ledgerPath, 'utf8'));
assert.equal(ledger().anthropicRequests, expectedStart, 'Ledger must retain the expected spent count; never reset it');
assert.ok([0, 2].includes(expectedStart), 'Only initial phase or the preserved two-request capture-failure continuation is permitted');
assert.equal(ledger().maxAnthropicRequests, 16);
const evidence = { startedAt: new Date().toISOString(), base, source: fingerprint(), maxLogicalTurnsThisRun: 6, phaseMaxTurns: expectedStart ? 7 : 6, priorAttempt: expectedStart ? 'scratchpad/site-demo-real-model-first.json: first turn spent two requests; Chrome could not expose a stream canceled after done. Retained failure; observer fixed without frontend changes. Actual HTTP cap remains16.' : null, maxActualAnthropicRequests: 16, scope: 'Actual local browser -> persona API -> Anthropic. Forced memory store and provider credentials disabled. No real bookings, notifications, Calendar writes or hosted requests.', cases: [], checks: [], browserErrors: [], result: 'in_progress', manualReviewRequired: true };
const save = () => writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
const check = (name, pass) => { evidence.checks.push({ name, pass: !!pass }); save(); assert.ok(pass, name); };
const { chromium } = await import(pathToFileURL(resolve(value('--playwright'))));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let count = 0, current = null;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  // A clone observes the same response without asking Chrome for a body after the UI
  // intentionally cancels its reader at the done event. No second network call is made.
  await context.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window); window.__demoModelStreams = [];
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      if (new URL(typeof input === 'string' ? input : input.url, location.href).pathname === '/api/chat') {
        const record = { status: response.status, done: false }; window.__demoModelStreams.push(record);
        response.clone().text().then(text => { record.body = text; record.done = true; }, () => { record.error = true; record.done = true; });
      }
      return response;
    };
  });
  await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === base && req.method() === 'GET' && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.origin === base && url.pathname === '/api/chat' && req.method() === 'POST') {
      const body = req.postDataJSON();
      assert.ok(current && count <= 6 && !current.request && ['bayou-air', 'katy-pipeworks', 'westheimer-maids'].includes(body.persona) && body.stream === true && !body.client && !body.key);
      current.request = body; save(); return route.continue();
    }
    return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(110000);
  page.on('pageerror', error => evidence.browserErrors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#example-mode-live').click();
  async function turn(id, text) {
    assert.ok(++count <= 6 && ledger().anthropicRequests < 16 && !ledger().blocked);
    current = { id, input: text, startedAt: new Date().toISOString(), ledgerBefore: ledger() }; evidence.cases.push(current); save();
    const responsePromise = page.waitForResponse(response => response.url() === base + '/api/chat' && response.request().method() === 'POST');
    await page.locator('#example-input').fill(text); await page.locator('#example-send').click();
    const response = await responsePromise; current.httpStatus = response.status();
    await page.waitForFunction(() => window.__demoModelStreams.at(-1)?.done);
    const captured = await page.evaluate(() => window.__demoModelStreams.at(-1));
    assert.ok(!captured.error && typeof captured.body === 'string', 'same-response stream observer completed');
    current.stream = captured.body.split('\n').filter(Boolean).map(line => JSON.parse(line));
    save(); check(id + ': HTTP200', response.ok());
    const done = current.stream.find(line => line.t === 'done');
    check(id + ': completed real model stream', !!done && !current.stream.some(line => line.t === 'error'));
    await page.waitForFunction(() => document.getElementById('example-messages').getAttribute('aria-busy') === 'false');
    current.reply = done.reply; current.events = done.events;
    current.ui = await page.locator('#demo-wrap').evaluate(wrap => ({ messages: wrap.querySelector('#example-messages').innerText, summary: wrap.querySelector('#example-summary').innerText, ticket: wrap.querySelector('#example-ticket-status').innerText, context: wrap.querySelector('#example-context').innerText }));
    current.ledgerAfter = ledger(); save();
    check(id + ': real HTTP inference observed', current.ledgerAfter.anthropicRequests > current.ledgerBefore.anthropicRequests);
    check(id + ': final reply visible', current.ui.messages.includes(done.reply));
    return current;
  }
  const summary = row => row.events?.findLast(event => event.type === 'owner_notification')?.data;
  const first = await turn('hvac_partial', 'My AC is running but not cooling. Do you serve Katy, and what is your diagnostic fee?');
  check('HVAC answers the published diagnostic fee', /\$89/.test(first.reply));
  check('Partial summary contains issue without invented contact/address/window', !!summary(first)?.issue && !summary(first).customer_name && !summary(first).phone && !summary(first).address && !summary(first).requested_window);
  const details = await turn('hvac_intake', 'I’m Alex Demo. Use (713) 555-0142 and 12 Oak St, Katy. I’d like tomorrow, 12 to 5.');
  check('Intake summary contains supplied contact and requested window', /Alex/.test(summary(details)?.customer_name || '') && /713/.test(summary(details)?.phone || '') && /12 Oak/.test(summary(details)?.address || '') && /12.*5/.test(summary(details)?.requested_window || ''));
  check('Intake card is a request', details.ui.ticket === 'Visit request');
  const correction = await turn('hvac_correction', 'Actually, change the requested window to Saturday, 8 to 12. Everything else is the same.');
  check('Correction keeps contact and updates window', /Alex/.test(summary(correction)?.customer_name || '') && /Saturday|sábado/i.test(summary(correction)?.requested_window || '') && /8.*12/.test(summary(correction)?.requested_window || ''));
  await page.locator('[data-example="spanish"]').click();
  const spanish = await turn('spanish_cleaning', 'Hola, soy Ana Demo. Necesito una limpieza profunda de mi apartamento en 36 Elm St, Memorial. Son dos habitaciones, dos baños y 1,000 pies cuadrados. Mi número de práctica es (713) 555-0152. Me gustaría el sábado de 8 a 10.');
  check('Spanish summary uses Spanish language and supplied facts', summary(spanish)?.language === 'es' && /Ana/.test(summary(spanish)?.customer_name || '') && /36 Elm/.test(summary(spanish)?.address || '') && /8.*10/.test(summary(spanish)?.requested_window || ''));
  await page.locator('[data-example="call"]').click();
  const emergency = await turn('gas_safety', 'I smell gas inside the house. I’m Sam Demo, (713) 555-0151, at 24 Pine St, Katy. Can someone come now?');
  check('Emergency begins with safety before intake', /leave|outside|evacuat/i.test(emergency.reply.slice(0, 140)) && /911/.test(emergency.reply));
  check('Emergency summary is urgent and retains supplied contact', summary(emergency)?.urgency === 'emergency' && /713/.test(summary(emergency)?.phone || '') && emergency.ui.ticket === 'Urgent request');
  await page.locator('[data-example="sms"]').click();
  const area = await turn('outside_service_area', 'My AC needs repair in The Woodlands. Do you serve my area?');
  check('Out-of-area reply declines the supplied unsupported area', /not|don.t|doesn.t|outside|unfortunately|isn.t/i.test(area.reply) && /Woodlands/.test(area.reply));
  check('No JavaScript errors in actual browser AI flow', evidence.browserErrors.length === 0);
  evidence.sourceAfter = fingerprint(); check('Relevant source stable throughout real-model acceptance', JSON.stringify(evidence.source) === JSON.stringify(evidence.sourceAfter));
  evidence.ledger = ledger(); check('Network cap respected without blocked attempts', evidence.ledger.anthropicRequests <= 16 && evidence.ledger.blocked === 0);
  evidence.result = 'passed_pending_manual_reply_review';
  await page.locator('#week').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'scratchpad/site-demo-real-model.png' });
} catch (error) { evidence.result = 'failed'; evidence.error = String(error.message || error); evidence.ledger = ledger(); process.exitCode = 1; }
finally { evidence.finishedAt = new Date().toISOString(); save(); await browser.close(); }
console.log(JSON.stringify({ result: evidence.result, turns: count, actualRequests: evidence.ledger?.anthropicRequests, checks: evidence.checks.length, error: evidence.error, output }));
