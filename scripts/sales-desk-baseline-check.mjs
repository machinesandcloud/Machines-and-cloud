// Historical sales baseline QA. Actual static source/chat validation; SDK/UI replies are fixtures.
// No real model, provider, form submission or hosted request is allowed.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '0'; process.env.URL = 'http://127.0.0.1:8898';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
process.env.ANTHROPIC_API_KEY = 'qa-sales-fixture'; process.env.ANTHROPIC_BASE_URL = 'https://qa-sales-model.invalid';
const base = process.env.URL, root = resolve('.'), sdkRequests = [], forbidden = [];
let nextReply = 'I can help you review your front desk setup.';
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  if (url.origin !== 'https://qa-sales-model.invalid' || url.pathname !== '/v1/messages') { forbidden.push({ origin: url.origin, pathname: url.pathname }); throw new Error('QA network blocked'); }
  const body = JSON.parse(init.body); sdkRequests.push(body);
  const events = [
    { type: 'message_start', message: { id: 'qa-sales-' + sdkRequests.length, type: 'message', role: 'assistant', content: [], model: body.model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: nextReply } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } },
    { type: 'message_stop' }
  ];
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
};
const chat = (await import('../netlify/functions/chat.mjs')).default;
const files = ['agent-widget.js', 'netlify/functions/chat.mjs', 'netlify/functions/lib/agent.mjs', 'styles.css', 'site-refresh.css', 'index.html'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const originalEvidence = JSON.parse(readFileSync('scratchpad/sales-desk-baseline.json', 'utf8'));
if (JSON.stringify(hashes()) !== JSON.stringify(originalEvidence.sourceBefore)) throw new Error('Historical sales baseline requires its recorded source. Run repaired sales-desk acceptance for current source.');
const report = { at: new Date().toISOString(), mode: 'actual local source/chat handler + intercepted SDK/UI replies; no real network', sourceBefore: hashes(), checks: [], cases: [], externalBrowserBlocked: [], pageErrors: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [];
async function fixturePage(name, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: options.height || 844 }, reducedMotion: 'reduce' }); contexts.push(context);
  const state = { name, requests: [], mode: 'actual', release: null };
  if (options.storage !== undefined) await context.addInitScript(value => sessionStorage.setItem('mc_agent_transcript_v2', value), options.storage);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { report.externalBrowserBlocked.push({ case: name, origin: url.origin, pathname: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname !== '/api/chat' || req.method() !== 'POST') return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"qa_api_blocked"}' });
      const sent = req.postDataJSON(), row = { messages: sent.messages, mode: state.mode }; state.requests.push(row);
      if (state.mode === 'hold') { await new Promise(resolve => { state.release = resolve; }); return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '{"t":"done","reply":"Held fixture answer.","events":[]}\n' }); }
      if (state.mode === 'offline') { row.status = 503; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' }); }
      if (state.mode === 'partial') return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '{"t":"delta","text":"Partial answer with no completion marker"}\n' });
      if (state.mode === 'late') return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '{"t":"delta","text":"Draft"}\n{"t":"done","reply":"Completed answer.","events":[]}\n{"t":"delta","text":" LATE CORRUPTION"}\n' });
      if (state.mode === 'error-late') return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '{"t":"delta","text":"Partial"}\n{"t":"error","error":"upstream"}\n{"t":"delta","text":" LATE ERROR CORRUPTION"}\n' });
      const response = await chat(new Request(url, { method: 'POST', headers: req.headers(), body: req.postData() }), { ip: '192.0.2.' + (contexts.length + 10) });
      row.status = response.status;
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''));
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    let path = resolve(root, relative); if (!path.startsWith(root + '/')) return route.fulfill({ status: 404, body: 'blocked' });
    if (!existsSync(path) && existsSync(path + '.html')) path += '.html';
    if (!existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ case: name, message: error.message }));
  await page.goto(base + '/'); await page.locator('#mcAgentLauncher').click();
  async function send(text) { await page.locator('#mcAgentInput').fill(text); await page.locator('#mcAgentInput').press('Enter'); await page.waitForFunction(() => !document.querySelector('#mcAgentSend').disabled); }
  state.page = page; state.context = context; state.send = send; report.cases.push(state); return state;
}
try {
  for (const width of [390, 320, 1440]) {
    const s = await fixturePage('viewport-' + width, { width });
    const geometry = await s.page.locator('#mcAgentPanel').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
    check(`${width}px sales panel stays within viewport`, geometry.x >= 0 && geometry.y >= 0 && geometry.right <= geometry.width + 1 && geometry.bottom <= geometry.height + 1, geometry);
    check(`${width}px launcher opens with keyboard focus in composer`, await s.page.locator('#mcAgentInput').evaluate(node => node === document.activeElement));
    await s.page.keyboard.press('Escape'); check(`${width}px Escape closes and restores launcher focus`, !await s.page.locator('#mcAgentPanel').isVisible() && await s.page.locator('#mcAgentLauncher').evaluate(node => node === document.activeElement));
    await s.page.locator('#mcAgentLauncher').click(); await s.page.screenshot({ path: `scratchpad/sales-desk-first-${width}.png`, fullPage: false });
  }
  {
    const s = await fixturePage('eleventh-turn'); nextReply = 'A short fixture answer.';
    for (let turn = 1; turn <= 11; turn++) await s.send('Synthetic owner question ' + turn);
    check('Eleventh ordinary exchange remains a valid conversation', s.requests.at(-1).status === 200, { statuses: s.requests.map(row => row.status), lastRoles: s.requests.at(-1).messages.map(row => row.role) });
    await s.page.screenshot({ path: 'scratchpad/sales-desk-eleventh-turn-return.png' });
  }
  {
    const s = await fixturePage('failed-send-retry'); s.mode = 'offline'; await s.send('I run a plumbing shop and miss calls.');
    check('Failed send restores a retryable customer draft', await s.page.locator('#mcAgentInput').inputValue() === 'I run a plumbing shop and miss calls.');
    s.mode = 'actual'; await s.send('I run a plumbing shop and miss calls.');
    check('Retry after outage recovers without invalid consecutive users', s.requests.at(-1).status === 200, { statuses: s.requests.map(row => row.status), roles: s.requests.at(-1).messages.map(row => row.role) });
  }
  {
    const s = await fixturePage('pending-draft-reset'); s.mode = 'hold';
    await s.page.locator('#mcAgentInput').fill('First pending message'); await s.page.locator('#mcAgentInput').press('Enter');
    await s.page.waitForFunction(() => document.querySelector('#mcAgentSend').disabled);
    await s.page.locator('#mcAgentInput').fill('Keep this next draft'); await s.page.locator('#mcAgentInput').press('Enter');
    check('Enter while a reply is pending preserves the next draft', await s.page.locator('#mcAgentInput').inputValue() === 'Keep this next draft');
    await s.page.locator('#mcAgentReset').click();
    check('New chat during pending reply cancels or truthfully disables reset', await s.page.locator('#mcAgentReset').isDisabled() || await s.page.locator('#mcAgentMessages .user').count() === 0);
    await s.page.locator('#mcAgentClose').click(); s.release(); await s.page.waitForTimeout(150);
    check('Pending completion does not reopen a closed panel', !await s.page.locator('#mcAgentPanel').isVisible());
  }
  for (const mode of ['partial', 'late', 'error-late']) {
    const s = await fixturePage('stream-' + mode); s.mode = mode; await s.send('Synthetic stream recovery request');
    const stored = await s.page.evaluate(() => JSON.parse(sessionStorage.getItem('mc_agent_transcript_v2'))), visible = await s.page.locator('#mcAgentMessages').innerText();
    if (mode === 'partial') check('Stream EOF without done is reported incomplete and not committed as success', !stored.some(row => row.role === 'assistant' && row.content === 'Partial answer with no completion marker'), { stored, visible });
    else check(`Late stream data cannot mutate ${mode === 'late' ? 'completed' : 'failed'} answer`, !visible.includes('CORRUPTION'), { stored, visible });
  }
  {
    const s = await fixturePage('context-length'); nextReply = 'Detailed advice. '.repeat(110) + ' The corrected fee is $89.';
    await s.send('Please draft a detailed handoff plan.'); const firstLength = nextReply.length;
    nextReply = 'I will keep your corrected fee.'; await s.send('Use the corrected fee you just stated.');
    const actual = sdkRequests.at(-1).messages.find(row => row.role === 'assistant');
    check('Visible longer answer is not silently truncated before next turn', actual.content.length === firstLength, { visibleReplyCharacters: firstLength, upstreamAssistantCharacters: actual.content.length, correctionRetained: actual.content.includes('$89') });
  }
  {
    const s = await fixturePage('links-and-corrections'); nextReply = 'Start here: ' + base + '/onboard.html';
    await s.send('How do I start?');
    const popupPromise = s.page.waitForEvent('popup'); await s.page.locator('#mcAgentMessages a').last().click(); const popup = await popupPromise; await popup.waitForLoadState();
    check('An actual setup link opens the local signup entry without submission', await popup.locator('#access-gate').isVisible() && s.requests.length === 1); await popup.close();
    nextReply = 'I will use Cypress and $99 from now on.'; await s.send('Correction: Cypress, not Katy, and $99, not $89.');
    check('Customer correction reaches actual handler in complete recent context', sdkRequests.at(-1).messages.at(-1).content.includes('Cypress, not Katy') && s.requests.at(-1).status === 200);
  }
  {
    const s = await fixturePage('corrupt-session', { storage: '{"oldFormat":true}' }); await s.page.waitForTimeout(60);
    check('Malformed browser history recovers without breaking chat', !report.pageErrors.some(row => row.case === s.name), report.pageErrors.filter(row => row.case === s.name));
  }
  const system = String(sdkRequests[0]?.system?.map?.(row => row.text).join('\n') || sdkRequests[0]?.system || '');
  check('Sales product facts do not promise unavailable automated website import/phone delivery', !/same day website chat and the phone are answering|build.*front desk from the owner.s website|Books into Google Calendar/.test(system));
  check('Sales desk does not force a founder lead form for self-service setup', !/Steve will follow up within one business day|Steve will also reach out within one business day/.test(system));
  check('Browser footer does not invent conversational logging/founder follow-up', !/Conversations are logged so Steve can follow up/.test(readFileSync('agent-widget.js', 'utf8')));
  check('No real external fetch/form/provider/model request occurred', forbidden.length === 0, forbidden);
} catch (error) { report.fatal = String(error.stack || error); }
finally {
  for (const state of report.cases) { delete state.page; delete state.context; delete state.send; delete state.release; }
  await browser.close(); report.sourceAfter = hashes(); check('Sales source stayed unchanged during baseline', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
  report.summary = { checks: report.checks.length, passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, interceptedModelRequests: sdkRequests.length, actualExternalRequests: 0 };
  writeFileSync('scratchpad/sales-desk-baseline.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report.summary, fatal: report.fatal || null }));
}
