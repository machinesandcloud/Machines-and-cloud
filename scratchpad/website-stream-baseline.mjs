// Offline defect reproduction against the unchanged customer embed, not a live service test.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';

const deny = () => { throw new Error('website-stream reproduction prohibits network access'); };
globalThis.fetch = net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny;
syncBuiltinESMExports();
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const repo = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(repo, 'embed.js'), 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
const expectedHash = '70c9f04aada23032ec71bdc6d8e7f4e08495b7c6c2ddbb51e00187cdaab80a11';
assert.equal(sourceHash, expectedHash, 'Keep this baseline reproduction pinned to the original failing embed.');
const output = resolve(repo, 'scratchpad/website-stream-baseline.json');
const partial = 'I have the details and I am checking the requested';
const final = 'Your request is saved in the shop portal. Ref fixture-request-1. The shop must confirm the arrival details.';
const line = value => JSON.stringify(value) + '\n';
const completed = { t: 'done', reply: final, events: [{ type: 'booking', id: 'fixture-request-1' }] };
const scenarios = [
  { name: 'delta_then_clean_eof', chunks: [line({ t: 'delta', text: partial })], eof: true, expectedPartialStored: true, expectedError: false, followup: true, screenshot: true },
  { name: 'saved_request_then_delta_eof', chunks: [line({ t: 'delta', text: partial })], eof: true, simulatedSavedRequest: true, expectedPartialStored: true, expectedError: false },
  { name: 'complete_done_with_saved_request', chunks: [line({ t: 'delta', text: partial }), line(completed)], eof: true, simulatedSavedRequest: true, expectedFinalStored: true, expectedError: false, screenshot: true },
  { name: 'empty_eof', chunks: [], eof: true, expectedPartialStored: false, expectedError: true },
  { name: 'delta_then_explicit_error', chunks: [line({ t: 'delta', text: partial }), line({ t: 'error', error: 'agent_error' })], eof: true, expectedPartialStored: false, expectedError: true },
  { name: 'delta_then_transport_error', chunks: [line({ t: 'delta', text: partial })], transportError: true, expectedPartialStored: false, expectedError: true },
  { name: 'saved_request_then_transport_error', chunks: [line({ t: 'delta', text: partial })], transportError: true, simulatedSavedRequest: true, expectedPartialStored: false, expectedError: true },
  { name: 'complete_done_without_trailing_newline', chunks: [line({ t: 'delta', text: partial }), JSON.stringify(completed)], eof: true, simulatedSavedRequest: true, expectedPartialStored: true, expectedError: false },
  { name: 'delta_then_truncated_done', chunks: [line({ t: 'delta', text: partial }), '{"t":"done","reply":"Your request'], eof: true, simulatedSavedRequest: true, expectedPartialStored: true, expectedError: false },
  { name: 'done_before_connection_closes', chunks: [line({ t: 'delta', text: partial }), line(completed)], holdOpen: true, simulatedSavedRequest: true, expectedFinalStored: true, expectedError: false },
];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--disable-default-apps', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const results = [], unexpectedRequests = [];
try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const request = route.request(), url = request.url();
      if (url === 'https://shop.fixture.test/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width"><title>Offline Fixture Air</title><style>body{font:16px system-ui;padding:24px;color:#17263e;background:#f7f9fc}h1{font-size:28px}</style><h1>Fixture Air</h1><p>Offline customer widget reproduction.</p><script src="https://platform.fixture.test/embed.js" data-client="stream-fixture" async></script>' });
      if (url === 'https://platform.fixture.test/embed.js') return route.fulfill({ contentType: 'text/javascript', body: source });
      unexpectedRequests.push({ scenario: scenario.name, url, method: request.method() });
      return route.abort('blockedbyclient');
    });
    await context.addInitScript(({ scenario, final }) => {
      const nativeFetch = window.fetch.bind(window), requests = [];
      const receipt = { savedRequests: [], modelCalls: 0, providerCalls: 0, note: 'Synthetic fixture ledger only; no actual handler/tool, storage, model or provider was invoked.' };
      window.__websiteStreamFixture = { requests, receipt, release: null };
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url === 'https://platform.fixture.test/api/client?c=stream-fixture') return new Response(JSON.stringify({ name: 'Fixture Air', greeting: 'How can we help?', status: 'live', webAvailable: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        if (url === 'https://platform.fixture.test/api/chat') {
          requests.push(JSON.parse(init.body));
          if (requests.length > 1) return new Response(JSON.stringify({ reply: 'This is the synthetic follow-up response.' }), { status: 200, headers: { 'content-type': 'application/json' } });
          if (scenario.simulatedSavedRequest) receipt.savedRequests.push({ id: 'fixture-request-1', source: 'scripted fixture outcome, not actual save evidence' });
          const encoder = new TextEncoder();
          const body = new ReadableStream({ start(controller) {
            (async () => {
              for (const chunk of scenario.chunks) { controller.enqueue(encoder.encode(chunk)); await new Promise(resolve => setTimeout(resolve, 30)); }
              if (scenario.transportError) controller.error(new TypeError('Scripted interrupted transport'));
              else if (scenario.holdOpen) window.__websiteStreamFixture.release = () => controller.close();
              else controller.close();
            })();
          } });
          return new Response(body, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
        }
        return nativeFetch(input, init);
      };
    }, { scenario, final });
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto('https://shop.fixture.test/', { waitUntil: 'load' });
    await page.locator('#mcDesk .l').click();
    await page.locator('#mcDesk textarea').fill('Please save my AC service request for tomorrow.');
    await page.locator('#mcDesk button.s').click();
    if (scenario.holdOpen) await page.waitForFunction(() => window.__websiteStreamFixture.release && JSON.parse(sessionStorage.getItem('mc_desk_stream-fixture')).transcript.some(row => row.role === 'assistant'));
    else await page.waitForFunction(() => !document.querySelector('#mcDesk button.s').disabled);
    const observation = await page.evaluate(() => ({
      bubbles: [...document.querySelectorAll('#mcDesk .m .b')].map(node => ({ role: node.classList.contains('u') ? 'user' : 'assistant', text: node.textContent })),
      persisted: JSON.parse(sessionStorage.getItem('mc_desk_stream-fixture')),
      composerEnabled: !document.querySelector('#mcDesk textarea').disabled,
      sendEnabled: !document.querySelector('#mcDesk button.s').disabled,
      requests: structuredClone(window.__websiteStreamFixture.requests),
      receipt: structuredClone(window.__websiteStreamFixture.receipt),
    }));
    const stored = observation.persisted.transcript.filter(row => row.role === 'assistant').map(row => row.content);
    const errorShown = observation.bubbles.some(row => /unavailable right now/.test(row.text));
    assert.equal(stored.includes(partial), !!scenario.expectedPartialStored, scenario.name + ': original partial-persistence behavior changed');
    assert.equal(stored.includes(final), !!scenario.expectedFinalStored, scenario.name + ': original final-persistence behavior changed');
    assert.equal(errorShown, !!scenario.expectedError, scenario.name + ': original error visibility changed');
    assert.equal(observation.composerEnabled, true);
    assert.equal(observation.sendEnabled, !scenario.holdOpen, scenario.name + ': composer terminal state');
    assert.deepEqual(pageErrors, []);
    const result = { name: scenario.name, observation, expectedDefectReproduced: !!scenario.expectedPartialStored, originalPageErrors: pageErrors };
    if (scenario.screenshot) {
      result.screenshot = 'scratchpad/website-stream-' + scenario.name + '-390.png';
      await page.screenshot({ path: resolve(repo, result.screenshot), fullPage: true });
    }
    if (scenario.followup) {
      await page.locator('#mcDesk textarea').fill('Did you finish?'); await page.locator('#mcDesk button.s').click();
      await page.waitForFunction(() => window.__websiteStreamFixture.requests.length === 2 && !document.querySelector('#mcDesk button.s').disabled);
      result.followupPayload = await page.evaluate(() => window.__websiteStreamFixture.requests[1]);
      assert.ok(result.followupPayload.messages.some(row => row.role === 'assistant' && row.content === partial), 'The false completion is sent as assistant history on the next turn.');
    }
    if (scenario.holdOpen) {
      await page.evaluate(() => window.__websiteStreamFixture.release());
      await page.waitForFunction(() => !document.querySelector('#mcDesk button.s').disabled);
      result.sendEnabledAfterFixtureClose = true;
    }
    results.push(result); await context.close();
  }
  assert.deepEqual(unexpectedRequests, [], 'Unexpected browser requests are always blocked and fail the reproduction.');
} finally { await browser.close(); }
const report = { scope: 'Offline actual-DOM baseline reproduction; all browser requests fulfilled from fixtures or blocked; no live API/model/provider/store effects.', source: { path: 'embed.js', sha256: sourceHash, unchanged: true }, syntheticLedgerCaveat: 'Scripted saved-request entries illustrate the independent server outcome. They are not real request/tool/storage evidence. Actual source saves tools before the terminal done packet, so missing done cannot establish whether a request saved.', checks: { scenarios: results.length, unexpectedNetworkRequests: unexpectedRequests.length }, results };
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, sourceHash, scenarios: results.length, falseCompletedPartialScenarios: results.filter(row => row.expectedDefectReproduced).map(row => row.name), externalRequests: 0, actualModelCalls: 0, actualProviderCalls: 0, actualSavedRequests: 0 }));
