// Independent sales API QA through the installed streaming SDK, entirely intercepted.
// Fixtures prove context/tool wiring and side effects, not generated semantic quality.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '0'; process.env.URL = 'http://127.0.0.1:8898';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
process.env.ANTHROPIC_API_KEY = 'qa-sales-offline'; process.env.ANTHROPIC_BASE_URL = 'https://qa-sales-model.invalid';
const requests = [], forbidden = []; let fixtures = [];
function sse(fixture, model) {
  const events = [], emit = data => events.push(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  emit({ type: 'message_start', message: { id: 'qa-sales-' + requests.length, type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  let index = 0;
  if (fixture.text) { emit({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }); emit({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: fixture.text } }); emit({ type: 'content_block_stop', index: index++ }); }
  if (fixture.tool) { emit({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: 'qa-tool-' + requests.length, name: fixture.tool.name, input: {} } }); emit({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(fixture.tool.input) } }); emit({ type: 'content_block_stop', index }); }
  emit({ type: 'message_delta', delta: { stop_reason: fixture.stopReason || (fixture.tool ? 'tool_use' : 'end_turn'), stop_sequence: null }, usage: { output_tokens: 10 } }); emit({ type: 'message_stop' });
  return new Response(events.join(''), { headers: { 'content-type': 'text/event-stream' } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  if (url.origin !== 'https://qa-sales-model.invalid' || url.pathname !== '/v1/messages' || !fixtures.length) { forbidden.push({ origin: url.origin, path: url.pathname }); throw new Error('QA network blocked'); }
  const body = JSON.parse(init.body); requests.push(body); const fixture = fixtures.shift();
  if (fixture.errorStatus) return Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'QA intercepted overload' } }, { status: fixture.errorStatus });
  return sse(fixture, body.model);
};
const store = await import('../netlify/functions/lib/store.mjs');
const chat = (await import('../netlify/functions/chat.mjs')).default;
const { SALES_BUDGET_KIND, SALES_BUDGET_KEY } = await import('../netlify/functions/lib/sales-budget.mjs');
const files = ['netlify/functions/chat.mjs', 'netlify/functions/lib/sales-desk.mjs', 'netlify/functions/lib/sales-budget.mjs', 'netlify/functions/lib/agent.mjs'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const report = { at: new Date().toISOString(), mode: 'memory + installed Anthropic SDK HTTP double; zero actual model/provider', sourceBefore: hashes(), checks: [], cases: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
let serial = 10;
async function send(messages, options = {}) {
  const body = { persona: 'mc', messages, stream: options.stream === true, ...(options.body || {}) };
  const response = await chat(new Request(process.env.URL + '/api/chat', { method: 'POST', headers: { origin: options.origin || process.env.URL }, body: JSON.stringify(body) }), { ip: options.ip || '192.0.2.' + (++serial) });
  const data = options.stream && response.status === 200 ? (await response.text()).trim().split('\n').map(line => JSON.parse(line)).find(line => line.t === 'done') : await response.json();
  return { status: response.status, data };
}
async function toolCase(name, history, tool, final) {
  fixtures = [{ text: 'Internal tool preparation must stay hidden.', tool }, { text: final }]; const start = requests.length;
  const result = await send(history);
  const blocks = requests.slice(start).flatMap(request => request.messages).flatMap(message => Array.isArray(message.content) ? message.content : []);
  const raw = blocks.filter(block => block.type === 'tool_result').at(-1)?.content;
  let parsed; try { parsed = JSON.parse(String(raw).split('\n\nDelivery reminder:')[0]); } catch { parsed = raw; }
  report.cases.push({ name, result, toolResult: parsed, toolDeliverySuffixPresent: String(raw).includes('Delivery reminder:') });
  check(name + ': actual SDK tool loop returns only intended final reply', result.status === 200 && result.data.reply === final && requests.length - start === 2 && fixtures.length === 0);
  if (parsed && typeof parsed === 'object') check(name + ': structured event matches actual SDK tool data', JSON.stringify(result.data.events.find(event => event.data)?.data) === JSON.stringify(parsed));
  return { ...result, parsed };
}
const businessKinds = ['clients', 'accounts', 'index', 'bookings', 'leads', 'tasks', 'alerts', 'conversations', 'customers', 'events', 'usage'];
const snapshot = async () => Object.fromEntries(await Promise.all(businessKinds.map(async kind => [kind, await Promise.all((await store.list(kind, '')).map(async key => [key, await store.get(kind, key)]))])));
const volume = { call_count: 18, period: 'day', count_kind: 'total', routing: 'unknown', average_minutes: 3, workdays_per_month: 22, missed_percent: null, routed_percent: null };
try {
  const before = await snapshot(), history = [];
  for (let turn = 0; turn < 12; turn++) {
    history.push({ role: 'user', content: turn === 0 ? 'Two-truck HVAC shop in Katy, diagnostic $89.' : 'Ordinary follow-up ' + turn });
    const reply = turn === 3 ? 'Detailed advice. '.repeat(115) + ' The corrected fee remains $89.' : 'Fixture answer ' + turn;
    fixtures = [{ text: reply }]; const outcome = await send(history, { ip: '192.0.2.10' });
    check('Ordinary multi-turn request ' + (turn + 1) + ' passes real sales validation', outcome.status === 200 && outcome.data.reply === reply);
    history.push({ role: 'assistant', content: reply });
  }
  check('Actual SDK context retains first shop facts past eleven turns', requests.at(-1).messages[0].content.includes('Katy, diagnostic $89.'));
  check('Helpful long answer is preserved without the old1500-character truncation', requests.at(-1).messages.some(message => message.role === 'assistant' && message.content.length > 1500 && message.content.includes('corrected fee remains $89')));
  fixtures = [{ text: 'Use Cypress and $99.' }]; history.push({ role: 'user', content: 'Correction: Cypress and $99, not Katy and $89.' }); await send(history);
  check('Latest explicit correction reaches actual SDK after full prior context', requests.at(-1).messages.at(-1).content === 'Correction: Cypress and $99, not Katy and $89.');
  const total = await toolCase('Total volume before choosing coverage', [{ role: 'user', content: '18 calls per day, three minutes each,22 working days. Which plan?' }], { name: 'estimate_call_volume', input: volume }, 'That is1188 total monthly minutes; routed volume is not known yet.');
  check('Total volume is1188 without inventing missed or routed minutes', total.parsed.totalMinutes === 1188 && total.parsed.routedMinutes === null && total.parsed.missedMinutes === null && total.parsed.planComparison.length === 0);
  const routed = await toolCase('Correct selected AI share', [{ role: 'user', content: '18 calls per day, three minutes each,22 days. Only a quarter goes to AI.' }], { name: 'estimate_call_volume', input: { ...volume, routing: 'selected_share', routed_percent: 25 } }, 'Only297 minutes would be routed; this does not establish missed calls.');
  check('AI quarter is297 routed while missed share stays unknown', routed.parsed.totalMinutes === 1188 && routed.parsed.routedMinutes === 297 && routed.parsed.missedMinutes === null && routed.parsed.planningOnly && routed.parsed.phoneActive === false && routed.parsed.billingActive === false);
  const firstMissed = await toolCase('Original missed estimate', [{ role: 'user', content: 'We miss30 calls a week.' }], { name: 'estimate_call_volume', input: { ...volume, call_count: 30, period: 'week', count_kind: 'missed', routing: 'missed_only', workdays_per_month: null } }, 'Planning estimate:390 missed minutes in an average month.');
  const corrected = await toolCase('Corrected missed estimate', [{ role: 'user', content: 'We miss30 calls a week.' }, { role: 'assistant', content: firstMissed.data.reply }, { role: 'user', content: 'Correction: three a month, not30 a week. No subscription.' }], { name: 'estimate_call_volume', input: { ...volume, call_count: 3, period: 'month', count_kind: 'missed', routing: 'missed_only', workdays_per_month: null } }, 'That correction gives nine minutes a month; no subscription was started.');
  check('Corrected count and period replace390 with9 without invented revenue', firstMissed.parsed.routedMinutes === 390 && corrected.parsed.routedMinutes === 9 && corrected.parsed.totalMinutes === null && !Object.hasOwn(corrected.parsed, 'profit'));
  const fit = await toolCase('Required native integration', [{ role: 'user', content: 'Live Jobber busy-time synchronization and dispatch are required.' }], { name: 'assess_workflow_fit', input: { required_features: ['jobber_sync', 'dispatch'], interested_features: ['website_chat'] } }, 'The current workspace is not a fit for those requirements.');
  check('Unmet must-haves remain not-current-fit despite useful website interest', fit.parsed.fit === 'not_current_fit' && fit.parsed.gaps.length === 2 && fit.parsed.usefulCurrentFeatures.some(feature => feature.feature === 'website_chat'));
  const action = await toolCase('Optional illustrative next step', [{ role: 'user', content: 'Can I hear the example?' }], { name: 'suggest_next_step', input: { action: 'see_example', scenario: 'call', language: 'en' } }, 'You can choose the English plumbing example.');
  check('Action returns a constrained visible choice without starting microphone/call', action.data.events[0]?.type === 'sales_action' && action.data.events[0].action === 'see_example' && action.data.events[0].scenario === 'call' && action.data.events[0].href.includes('#'));
  const unknown = await toolCase('Old lead-capture tool is unavailable', [{ role: 'user', content: 'Do not contact me. Just help me.' }], { name: 'capture_lead', input: { name: 'QA', email: 'qa@example.test' } }, 'Nothing was submitted. Here is a rule to review.');
  check('Removed capture tool cannot submit a form or produce captured event', unknown.data.events.length === 0 && /not available|Nothing.*performed/.test(String(unknown.parsed)));
  check('Sales tools never mutate customer/tenant stores', JSON.stringify(before) === JSON.stringify(await snapshot()));
  const system = typeof requests[0].system === 'string' ? requests[0].system : requests[0].system.map(block => block.text).join('\n');
  check('Actual SDK sees authoritative current web-only/billing/contact boundaries', system.includes('automatic website import is not enabled') && system.includes('No card, timed trial or day-eight billing') && system.includes('You have no lead-submission') && !system.includes('Steve will also reach out within one business day'));
  const previousRequests = requests.length, previousBudget = await store.get(SALES_BUDGET_KIND, SALES_BUDGET_KEY);
  const invalids = [[], [{ role: 'assistant', content: 'orphan' }, { role: 'user', content: 'next' }], [{ role: 'user', content: 'x'.repeat(1501) }]];
  for (const messages of invalids) check('Invalid sales history fails before SDK/budget spend', (await send(messages)).status === 400);
  for (const body of [{ persona: 'mc', client: 'qa-not-authorized' }, { persona: 'bayou-air', client: 'qa-not-authorized' }, { persona: 'unknown-qa-persona' }]) check('Mixed or unknown mode cannot enter sales tools', (await send([{ role: 'user', content: 'Do something to this customer shop.' }], { body })).status === 400);
  check('Rejected histories do not consume model calls or allowance', requests.length === previousRequests && JSON.stringify(previousBudget) === JSON.stringify(await store.get(SALES_BUDGET_KIND, SALES_BUDGET_KEY)));
  const allowanceResponse = await chat(new Request(process.env.URL + '/api/chat?mode=sales', { headers: { origin: process.env.URL } }), { ip: '192.0.2.220' });
  const allowance = await allowanceResponse.json();
  check('Read-only allowance status does not charge a turn or open a provider request', allowanceResponse.status === 200 && typeof allowance.available === 'boolean' && requests.length === previousRequests && JSON.stringify(previousBudget) === JSON.stringify(await store.get(SALES_BUDGET_KIND, SALES_BUDGET_KEY)));
  let countBefore = requests.length; const budgetBeforeFailure = (await store.get(SALES_BUDGET_KIND, SALES_BUDGET_KEY)).used;
  fixtures = [{ text: 'INCOMPLETE SDK OUTPUT', stopReason: 'max_tokens' }]; const incomplete = await send([{ role: 'user', content: 'Truncated model response fixture.' }]);
  check('Incomplete SDK output cannot become a completed sales answer', incomplete.status >= 400 && !incomplete.data.reply && requests.length === countBefore + 1 && (await store.get(SALES_BUDGET_KIND, SALES_BUDGET_KEY)).used === budgetBeforeFailure + 1);
  countBefore = requests.length; fixtures = [{ errorStatus: 503 }]; const overloaded = await send([{ role: 'user', content: 'Model failure fixture.' }]);
  check('Sales SDK failure has no automatic hidden retry or completed answer', overloaded.status >= 400 && !overloaded.data.reply && requests.length === countBefore + 1);
  // One remaining synthetic allowance slot, preserving a valid sum of hashed IP counts.
  const used = await store.get(SALES_BUDGET_KIND, SALES_BUDGET_KEY); process.env.MC_SALES_AI_GLOBAL_DAILY_LIMIT = String(used.used + 1);
  fixtures = [{ text: 'The last allowed fixture answer.' }]; const beforeRace = requests.length;
  const race = await Promise.all([send([{ role: 'user', content: 'Competing final slot A' }]), send([{ role: 'user', content: 'Competing final slot B' }])]);
  check('Last logical sales allowance admits exactly one concurrent turn', race.filter(row => row.status === 200).length === 1 && race.filter(row => row.status === 429 && row.data.error === 'sales_daily_limit').length === 1 && requests.length - beforeRace === 1, race.map(row => row.status));
  check('No external provider, lead form, customer action or actual model request escaped', forbidden.length === 0, forbidden);
} catch (error) { report.fatal = String(error.stack || error); }
finally {
  report.sourceAfter = hashes(); check('Sales backend source stayed stable throughout QA', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
  report.summary = { checks: report.checks.length, passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, interceptedSDKRequests: requests.length, actualExternalRequests: 0 };
  const index = process.argv.indexOf('--output'), output = index < 0 ? 'scratchpad/sales-desk-backend-qa-first.json' : process.argv[index + 1]; if (!output?.startsWith('scratchpad/')) throw new Error('QA output must remain under scratchpad');
  writeFileSync(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, ...report.summary, fatal: report.fatal || null }));
}
