// Actual customer embed + browser DOM. Every request is fulfilled by a fixture or denied.
// Scripted saved-request receipts below are not actual backend, model or provider evidence.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

const deny = () => { throw new Error('Widget-stream checks prohibit network access'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const repo = resolve(import.meta.dirname, '..'), scratch = resolve(repo, 'scratchpad');
await mkdir(scratch, { recursive: true });
const source = await readFile(resolve(repo, 'embed.js'), 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
const baselineHash = '70c9f04aada23032ec71bdc6d8e7f4e08495b7c6c2ddbb51e00187cdaab80a11';
assert.notEqual(sourceHash, baselineHash, 'Run this acceptance check against the proposed repair, not the frozen baseline.');
const partial = 'I have the details and I am checking the requested';
const final = 'Your request is saved in the shop portal. Ref fixture-request-1. The shop must confirm the arrival details.';
const line = value => JSON.stringify(value) + '\n';
const complete = { t: 'done', reply: final, events: [{ type: 'booking', id: 'fixture-request-1' }] };
const delta = line({ t: 'delta', text: partial });
const scenarios = [
  // The first ten scenarios retain the original reproduction's packet fixtures and names.
  { name: 'delta_then_clean_eof', chunks: [delta], fail: true, followup: true, screenshot: true },
  { name: 'saved_request_then_delta_eof', chunks: [delta], saved: true, fail: true },
  { name: 'complete_done_with_saved_request', chunks: [delta, line(complete)], saved: true, final: true, screenshot: true },
  { name: 'empty_eof', chunks: [], fail: true },
  { name: 'delta_then_explicit_error', chunks: [delta, line({ t: 'error', error: 'agent_error' })], fail: true },
  { name: 'delta_then_transport_error', chunks: [delta], transportError: true, fail: true },
  { name: 'saved_request_then_transport_error', chunks: [delta], transportError: true, saved: true, fail: true },
  { name: 'complete_done_without_trailing_newline', chunks: [delta, JSON.stringify(complete)], saved: true, final: true },
  { name: 'delta_then_truncated_done', chunks: [delta, '{"t":"done","reply":"Your request'], saved: true, fail: true },
  { name: 'done_before_connection_closes', chunks: [delta, line(complete)], holdOpen: true, saved: true, final: true },
  { name: 'malformed_packet_followed_by_done', chunks: [delta, 'not-json\n', line(complete)], saved: true, fail: true },
  { name: 'terminal_done_missing_reply', chunks: [delta, line({ t: 'done', events: complete.events })], saved: true, fail: true },
  { name: 'terminal_done_blank_reply', chunks: [delta, line({ t: 'done', reply: '  ' })], saved: true, fail: true },
  { name: 'terminal_done_wrong_reply_type', chunks: [delta, line({ t: 'done', reply: { content: final } })], saved: true, fail: true },
  { name: 'terminal_error_cannot_be_replaced_by_later_done', chunks: [delta, line({ t: 'error', error: 'agent_error' }), line(complete)], fail: true },
  { name: 'packets_after_done_do_not_change_answer', chunks: [line(complete), line({ t: 'delta', text: 'MUST NOT APPEAR' })], final: true },
  { name: 'wrong_delta_type', chunks: [line({ t: 'delta', text: { bad: true } }), line(complete)], fail: true },
  { name: 'unknown_packet_type', chunks: [line({ t: 'unknown', reply: final })], fail: true },
  { name: 'no_response_headers_times_out_once', chunks: [], hangFetch: true, timeout: true, fail: true },
  { name: 'body_without_packets_times_out_once', chunks: [], holdOpen: true, timeout: true, fail: true },
  { name: 'saved_request_then_body_hang_times_out_once', chunks: [delta], holdOpen: true, timeout: true, saved: true, fail: true },
  { name: 'json_without_terminal_done_is_not_completion', json: { reply: final }, fail: true },
  { name: 'json_explicit_done_is_completion', json: complete, saved: true, final: true },
  { name: 'daily_limit_keeps_composer_disabled', status: 429, fail: true, unavailable: true },
  { name: 'denied_request_recovers_composer', status: 403, fail: true },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const results = [], unexpected = [];
try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const req = route.request();
      if (req.url() === 'https://shop.fixture.test/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline Fixture Air</title><style>body{font:16px system-ui;padding:24px;color:#17263e;background:#f7f9fc}h1{font-size:28px}</style><h1>Fixture Air</h1><p>Offline customer widget acceptance.</p><script src="https://platform.fixture.test/embed.js" data-client="stream-fixture" async></script>' });
      if (req.url() === 'https://platform.fixture.test/embed.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: source });
      unexpected.push({ case: scenario.name, url: req.url(), method: req.method() });
      return route.abort('blockedbyclient');
    });
    await context.addInitScript(({ scenario, final }) => {
      const fetchBefore = window.fetch.bind(window), setTimeoutBefore = window.setTimeout.bind(window), clearTimeoutBefore = window.clearTimeout.bind(window);
      const fixture = window.__streamFixture = { requests: [], savedRequests: [], aborted: false, cancellations: 0, deadlineDelays: [], clearedDeadlines: 0, heldOpen: false };
      const deadlines = new Set();
      window.setTimeout = function (callback, delay, ...args) {
        const boundedDeadline = delay >= 30000;
        if (boundedDeadline) fixture.deadlineDelays.push(delay);
        const id = setTimeoutBefore(callback, scenario.timeout && boundedDeadline ? 75 : delay, ...args);
        if (boundedDeadline) deadlines.add(id); return id;
      };
      window.clearTimeout = function (id) { if (deadlines.delete(id)) fixture.clearedDeadlines++; return clearTimeoutBefore(id); };
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === 'https://platform.fixture.test/api/client?c=stream-fixture') return new Response(JSON.stringify({ name: 'Fixture Air', greeting: 'How can we help?', status: 'live', webAvailable: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        if (url !== 'https://platform.fixture.test/api/chat') return fetchBefore(input, init);
        fixture.requests.push(JSON.parse(init.body));
        if (init.signal) init.signal.addEventListener('abort', () => { fixture.aborted = true; });
        if (fixture.requests.length > 1) return new Response(JSON.stringify({ t: 'done', reply: 'This is the synthetic follow-up response.' }), { status: 200, headers: { 'content-type': 'application/json' } });
        if (scenario.saved) fixture.savedRequests.push({ id: 'fixture-request-1', evidence: 'scripted fixture only' });
        if (scenario.hangFetch) return new Promise(() => {});
        if (scenario.status) return new Response(JSON.stringify({ error: 'fixture_denied' }), { status: scenario.status, headers: { 'content-type': 'application/json' } });
        if (scenario.json) return new Response(JSON.stringify(scenario.json), { status: 200, headers: { 'content-type': 'application/json' } });
        const encoder = new TextEncoder(); let cancelled = false;
        const stream = new ReadableStream({ start(controller) {
          (async () => {
            for (const chunk of scenario.chunks) { if (cancelled) return; controller.enqueue(encoder.encode(chunk)); await new Promise(resolve => setTimeoutBefore(resolve, 5)); }
            if (cancelled) return;
            if (scenario.transportError) controller.error(new TypeError('Scripted interrupted transport'));
            else if (scenario.holdOpen) fixture.heldOpen = true;
            else controller.close();
          })();
        }, cancel() { cancelled = true; fixture.cancellations++; } });
        return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
      };
    }, { scenario, final });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://shop.fixture.test/', { waitUntil: 'load' });
    await page.locator('#mcDesk .l').click();
    await page.locator('#mcDesk textarea').fill('Please save my AC service request for tomorrow.');
    await page.locator('#mcDesk button.s').click();
    await page.waitForFunction(({ unavailable }) => {
      const fixture = window.__streamFixture, bubbles = [...document.querySelectorAll('#mcDesk .m .b.a')];
      const hasOutcome = bubbles.length >= 2;
      return fixture.requests.length === 1 && hasOutcome && (unavailable ? document.querySelector('#mcDesk textarea').disabled : !document.querySelector('#mcDesk button.s').disabled);
    }, { unavailable: !!scenario.unavailable }, { timeout: 2500 });
    const observed = await page.evaluate(() => ({
      bubbles: [...document.querySelectorAll('#mcDesk .m .b')].map(node => ({ role: node.classList.contains('u') ? 'user' : 'assistant', text: node.textContent })),
      stored: JSON.parse(sessionStorage.getItem('mc_desk_stream-fixture')),
      composerEnabled: !document.querySelector('#mcDesk textarea').disabled,
      sendEnabled: !document.querySelector('#mcDesk button.s').disabled,
      fixture: structuredClone(window.__streamFixture),
    }));
    const assistants = observed.stored.transcript.filter(row => row.role === 'assistant');
    const users = observed.stored.transcript.filter(row => row.role === 'user');
    assert.equal(users.length, 1, scenario.name + ': submitted user turn remains');
    assert.equal(assistants.length, scenario.final ? 1 : 0, scenario.name + ': only an explicit final answer enters history');
    assert.ok(!assistants.some(row => row.content === partial));
    assert.ok(!observed.bubbles.some(row => row.text === partial || row.text.includes('MUST NOT APPEAR')), scenario.name + ': incomplete/late answer is not displayed as complete');
    if (scenario.final) assert.equal(assistants[0].content, final);
    if (scenario.fail && !scenario.unavailable) assert.ok(observed.bubbles.some(row => /couldn’t confirm the outcome/.test(row.text)), scenario.name + ': honest unconfirmed-outcome message is visible');
    assert.equal(observed.composerEnabled, !scenario.unavailable);
    assert.equal(observed.sendEnabled, !scenario.unavailable);
    assert.equal(observed.fixture.requests.length, 1, scenario.name + ': no automatic retry');
    assert.equal(observed.fixture.savedRequests.length, scenario.saved ? 1 : 0, scenario.name + ': a UI failure neither creates nor undoes a server outcome');
    assert.equal(observed.fixture.deadlineDelays.length, 1);
    assert.ok(observed.fixture.deadlineDelays[0] >= 30000 && observed.fixture.deadlineDelays[0] <= 120000);
    assert.equal(observed.fixture.clearedDeadlines, 1, scenario.name + ': deadline is cleared after a terminal outcome');
    if (scenario.timeout) assert.equal(observed.fixture.aborted, true, scenario.name + ': bounded wait aborts the request');
    if (scenario.holdOpen && scenario.final) assert.ok(observed.fixture.cancellations >= 1, 'A valid done releases the composer and cancels the body without EOF.');
    assert.deepEqual(errors, []);
    const result = { name: scenario.name, pass: true, observed, pageErrors: errors };
    if (scenario.screenshot) {
      result.screenshot = 'scratchpad/website-stream-fixed-' + scenario.name + '-390.png';
      await page.screenshot({ path: resolve(repo, result.screenshot), fullPage: true });
    }
    if (scenario.followup) {
      await page.locator('#mcDesk textarea').fill('Did you finish?'); await page.locator('#mcDesk button.s').click();
      await page.waitForFunction(() => window.__streamFixture.requests.length === 2 && !document.querySelector('#mcDesk button.s').disabled);
      result.followup = await page.evaluate(() => window.__streamFixture.requests[1]);
      assert.ok(!result.followup.messages.some(row => row.role === 'assistant' && row.content === partial));
      assert.equal(result.followup.messages.filter(row => row.role === 'user').length, 2);
    }
    results.push(result); await context.close();
  }
  assert.deepEqual(unexpected, []);
} finally { await browser.close(); }
const report = { scope: 'Offline actual-DOM proposed-repair acceptance, not production or provider delivery proof.', source: { path: 'embed.js', sha256: sourceHash, baselineSha256: baselineHash }, fixtureCaveat: 'Saved-request receipts are independently scripted fixture outcomes, not actual tool/storage saves. No AI/provider call or real saved request occurred.', counts: { passed: results.length, total: scenarios.length, unexpectedBrowserRequests: unexpected.length, actualExternalRequests: 0, actualModelCalls: 0, actualProviderCalls: 0, actualSavedRequests: 0 }, results };
await writeFile(resolve(scratch, 'website-stream-fixed.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checks: report.counts, sourceHash, result: 'scratchpad/website-stream-fixed.json' }));
