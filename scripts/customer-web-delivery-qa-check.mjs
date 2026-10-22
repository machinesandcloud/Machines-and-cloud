// QA exercises the public web API through the installed Anthropic SDK protocol double.
// Fixture replies prove wiring and side effects only, never real-model semantics or live delivery.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : 'scratchpad/customer-web-delivery-qa.json';
if (!output?.startsWith('scratchpad/') || existsSync(output)) throw new Error('Choose a new scratchpad evidence file with --output; existing evidence is never overwritten.');
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '0'; process.env.URL = 'http://127.0.0.1:8895';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { ANTHROPIC_API_KEY: 'qa-offline-model', ANTHROPIC_BASE_URL: 'https://qa-model.invalid', TWILIO_ACCOUNT_SID: 'ACqa', TWILIO_AUTH_TOKEN: 'qa-not-real', MC_TWILIO_NUMBER: '+17135550100', MC_MESSAGING_SERVICE_SID: 'MGqa', RESEND_API_KEY: 'qa-not-real', GOOGLE_CLIENT_ID: 'qa-not-real', GOOGLE_CLIENT_SECRET: 'qa-not-real' });
const requests = [], blocked = []; let queue = [];
function sse(fixture) {
  const events = [], emit = row => events.push(`event: ${row.type}\ndata: ${JSON.stringify(row)}\n\n`);
  emit({ type: 'message_start', message: { id: 'qa-msg-' + requests.length, type: 'message', role: 'assistant', content: [], model: 'claude-opus-5-5', stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  let index = 0;
  if (fixture.text) { emit({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }); emit({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: fixture.text } }); emit({ type: 'content_block_stop', index: index++ }); }
  if (fixture.tool) { emit({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: 'qa-tool-' + requests.length, name: fixture.tool.name, input: {} } }); emit({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(fixture.tool.input) } }); emit({ type: 'content_block_stop', index }); }
  emit({ type: 'message_delta', delta: { stop_reason: fixture.tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }); emit({ type: 'message_stop' });
  return new Response(events.join(''), { headers: { 'content-type': 'text/event-stream' } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  if (url.origin !== 'https://qa-model.invalid' || url.pathname !== '/v1/messages' || !queue.length) { blocked.push({ origin: url.origin, pathname: url.pathname }); throw new Error('QA external request blocked'); }
  requests.push(JSON.parse(init.body)); return sse(queue.shift());
};
const store = await import('../netlify/functions/lib/store.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const chat = (await import('../netlify/functions/chat.mjs')).default;
const files = ['netlify/functions/chat.mjs', 'netlify/functions/lib/desk.mjs', 'netlify/functions/lib/config.mjs', 'netlify/functions/lib/setup.mjs', 'netlify/functions/lib/agent.mjs'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const result = { at: new Date().toISOString(), sourceBefore: hashes(), mode: 'memory + installed SDK HTTP fixtures; no live model/provider', checks: [], toolResults: [] };
const check = (name, pass, detail) => result.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const c = newClient({ slug: 'qa-public-web-api', ownerKey: 'qa-private-server-key', owner: { name: 'QA Owner', email: 'qa-web-owner@example.test', phone: '+17135550101', backupPhone: '+17135550102' }, business: { name: 'QA Air', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon to Fri 8 am to 5 pm' } });
c.onboarding = { version: 1 }; c.status = 'live'; c.build = { status: 'built' }; c.services = ['AC repair']; c.channels = { web: { active: true }, voice: { active: false }, sms: { active: false } };
c.calendar = { provider: 'google', google: { refreshToken: 'qa-dummy-refresh', calendarId: 'primary' } };
c.phone = { ...c.phone, twilioNumber: '+17135550100', messagingServiceSid: 'MGqa', tenDlc: 'approved' };
c.setupProof = { reviewedRevision: configurationRevision(c), testedRevision: configurationRevision(c), testMode: 'live' };
await store.saveClient(c);
const booking = { customer_name: 'Alex Fixture', phone: '+17135550142', address: '12 Oak St, Katy', issue: 'AC not cooling', date: '2099-01-07', window: '12 to 5', urgency: 'this_week', language: 'en', notes: '', unsure: '' };
async function send(contact, tool, final) {
  const start = requests.length; queue = [{ text: 'Fixture tool preamble must remain hidden.', tool }, { text: final }];
  const response = await chat(new Request(process.env.URL + '/api/chat', { method: 'POST', headers: { origin: process.env.URL }, body: JSON.stringify({ client: c.slug, contact, stream: false, messages: [{ role: 'user', content: 'Synthetic customer request for ' + contact }] }) }), { ip: '192.0.2.230' });
  const data = await response.json();
  const toolResult = requests.slice(start).flatMap(request => request.messages).flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result').at(-1);
  result.toolResults.push({ contact, status: response.status, content: toolResult?.content });
  check(`Public API delivers final fixture reply and withholds tool preamble: ${contact}`, response.status === 200 && data.reply === final && !data.reply.includes('preamble'));
  check(`Model tool loop consumed the exact expected two fixtures: ${contact}`, requests.length - start === 2 && queue.length === 0);
  return { data, toolResult };
}
try {
  const visit = await send('visit', { name: 'book_visit', input: booking }, 'Your visit request is saved in the shop portal. The shop will confirm arrival details directly.');
  check('Actual customer API creates one real portal booking', visit.data.events[0]?.type === 'booking' && (await store.list('bookings', c.slug + '/')).length === 1);
  const savedVisit = (await store.listRecords('bookings', c.slug, 10))[0];
  check('Booking records portal-only delivery without fabricated consent/calendar', savedVisit.delivery?.mode === 'portal_only' && savedVisit.delivery.ownerContactConfirmed === false && !savedVisit.consent && !savedVisit.calendarEventId);
  check('Tool result explicitly refuses outside confirmation claims', /No text reminder or phone call was sent/.test(visit.toolResult.content) && /Do not claim email/.test(visit.toolResult.content));
  check('Booking reserves capacity with no mutation left held', Object.keys((await store.get('index', 'capacity:' + c.slug)).reservations).length === 1 && Object.keys((await store.get('index', 'capacity:' + c.slug)).mutations).length === 0);
  const callbackInput = { ...booking, reason: 'wants_call', wanted: 'Call after 4 pm', nobook_reason: 'needs_callback', urgency: 'this_week' };
  const callback = await send('callback', { name: 'notify_owner', input: callbackInput }, 'Your callback request is saved in the portal. A response time has not been confirmed.');
  const savedCallback = (await store.listRecords('leads', c.slug, 10))[0];
  check('Actual customer API saves callback intent without promising contact', callback.data.events[0]?.type === 'lead' && savedCallback.wanted === 'Call after 4 pm' && !savedCallback.callbackDueAt && !savedCallback.callbackPromise && savedCallback.delivery.mode === 'portal_only');
  check('Callback tool result does not invent owner texts', /No phone call or text was sent/.test(callback.toolResult.content) && /timing are not confirmed/.test(callback.toolResult.content));
  const emergency = await send('emergency', { name: 'notify_owner', input: { ...callbackInput, reason: 'emergency', urgency: 'emergency', issue: 'Gas smell', wanted: '' } }, 'Leave the area now and call 911 from outside. Your request is recorded in the shop portal; no dispatch is confirmed.');
  check('Emergency creates a portal request without dispatch receipt', emergency.data.events[0]?.type === 'lead' && /No phone call or text/.test(emergency.toolResult.content));
  check('No customer/owner SMS, email, Calendar, purchase or provider HTTP attempted', blocked.length === 0, blocked);
  check('No reminder, escalation, callback or followup task scheduled', (await store.list('tasks', '')).length === 0);
  check('No alert or opted-in customer profile was fabricated', (await store.list('alerts', '')).length === 0 && (await store.list('customers', '')).length === 0);
  const histories = await store.listJSON('conversations', c.slug + '/', 100);
  check('Stored history records portal outcomes, never owner-notified receipt', histories.length === 3 && histories.every(history => !JSON.stringify(history.messages).includes('[Done: owner notified')) && histories.some(history => JSON.stringify(history.messages).includes('human contact unconfirmed')));
  check('Installed Anthropic SDK handled six intercepted model HTTP requests only', requests.length === 6 && blocked.length === 0);
} catch (error) { result.fatal = String(error.stack || error); }
finally {
  result.sourceAfter = hashes(); check('Public delivery source stayed unchanged during QA', JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter));
  result.summary = { checks: result.checks.length, passed: result.checks.filter(row => row.pass).length, failed: result.checks.filter(row => !row.pass).length };
  writeFileSync(output, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ...result.summary, fatal: result.fatal || null, interceptedModelRequests: requests.length, actualExternalRequests: 0 }));
}
