// QA independently exercises the actual private-test API, including its streamed response.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = 'http://127.0.0.1:8895';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
const requests = []; globalThis.fetch = async input => { requests.push(String(input)); throw new Error('QA external networking blocked'); };
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const store = await import('../netlify/functions/lib/store.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const access = (await import('../netlify/functions/access.mjs')).default;
const chat = (await import('../netlify/functions/chat.mjs')).default;
const files = ['netlify/functions/chat.mjs', 'netlify/functions/lib/owner-test.mjs', 'netlify/functions/lib/setup.mjs', 'netlify/functions/lib/agent.mjs'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const result = { at: new Date().toISOString(), sourceBefore: hashes(), mode: 'memory/fake; all external fetches blocked', checks: [], examples: [] };
const check = (name, pass, detail) => result.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const kinds = ['bookings', 'leads', 'tasks', 'alerts', 'customers', 'conversations', 'events', 'index', 'usage', 'optouts'];
async function snapshot() { return Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await Promise.all((await store.list(kind, '')).map(async key => [key, await store.get(kind, key)]))]))); }
const a = newClient({ slug: 'qa-stream-owner-a', ownerKey: 'qa-secret-owner-a', owner: { name: 'A Owner', email: 'qa-a@example.test', phone: '+17135550101' }, business: { name: 'QA A Air', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon to Fri 8 am to 5 pm' } });
a.status = 'testing'; a.onboarding = { version: 1 }; a.build = { status: 'built' }; a.services = ['AC repair'];
a.fees = [{ label: 'Diagnostic', amount: '$89', note: '' }];
const b = structuredClone(a); b.slug = 'qa-stream-owner-b'; b.ownerKey = 'qa-secret-owner-b'; b.owner.email = 'qa-b@example.test'; b.business.name = 'QA B Air';
await store.saveClient(a); await store.saveClient(b);
async function mailboxSession(email) {
  async function action(body) { const response = await access(new Request(process.env.URL + '/api/access', { method: 'POST', headers: { origin: process.env.URL }, body: JSON.stringify(body) }), { ip: '192.0.2.211' }); return response.json(); }
  await action({ action: 'request_link', email });
  return (await action({ action: 'exchange', token: (await store.get('access_outbox', accessHash(email))).token })).session;
}
const sessionA = await mailboxSession(a.owner.email), sessionB = await mailboxSession(b.owner.email);
await store.put('bookings', `${a.slug}/real-booking`, { id: 'real-booking', slug: a.slug, phone: '+17135550142', date: '2099-01-07', window: '8 to 12', status: 'booked' });
await store.put('leads', `${a.slug}/real-lead`, { id: 'real-lead', slug: a.slug, phone: '+17135550142', contact: 'samecontact', issue: 'Do not overwrite', status: 'open' });
await store.put('index', `capacity:${a.slug}`, { version: 1, reservations: { 'real-booking': ['2099-01-07|480-720'] }, mutations: {}, blocks: [{ date: '2099-01-07', window: '' }] });
const before = await snapshot();
async function send(text, options = {}) {
  const payload = { client: options.client || a.slug, channel: 'test', contact: options.contact || 'samecontact', stream: options.stream === true, messages: [{ role: 'user', content: text }] };
  const session = options.session || (payload.client === b.slug ? sessionB : sessionA);
  const response = await chat(new Request(process.env.URL + '/api/chat', { method: 'POST', headers: { origin: process.env.URL, 'content-type': 'application/json', authorization: 'Bearer ' + session }, body: JSON.stringify(payload) }), { ip: '192.0.2.80' });
  if (!payload.stream || response.status !== 200) return { status: response.status, data: await response.json() };
  const lines = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  return { status: response.status, data: lines.find(line => line.t === 'done'), lines };
}
try {
  const book = await send('I am Alex Demo, 713-555-0142, at 12 Oak St in Katy. Book tomorrow 12 to 5 for AC not cooling.', { stream: true });
  result.examples.push({ case: 'streamed booking with real-record matching phone/contact', ...book });
  check('Actual stream ends with a complete labeled simulation', book.status === 200 && book.data?.simulation === true && /^Test preview: /.test(book.data.reply));
  check('Streamed deltas exactly match final labeled reply', book.lines.filter(line => line.t === 'delta').map(line => line.text).join('') === book.data.reply);
  check('Booking event is explicitly a preview with no real booking ID', book.data.events.length === 1 && book.data.events[0].type === 'test_booking' && book.data.events[0].simulation === true && book.data.events[0].id.startsWith('test-'));
  check('Rehearsal cannot change real bookings/leads/capacity/tasks/messages', JSON.stringify(before) === JSON.stringify(await snapshot()));
  const storedA = await store.getClient(a.slug), storedB = await store.getClient(b.slug);
  check('Successful rehearsal stamps only current owner revision', storedA.setupProof?.testedRevision === configurationRevision(a) && !storedB.setupProof?.testedRevision);
  check('Fake rehearsal provenance is retained and cannot certify live AI', storedA.setupProof?.testMode === 'fake');
  const history = await store.get('owner_tests', a.slug + '/samecontact');
  check('History lives in private test store and is explicitly labeled', history.simulation === true && history.previews[0]?.simulation === true && /^Test preview: /.test(history.messages.at(-1).content));
  const lead = await send('Call me, I am Alex Demo at 713-555-0142. I smell gas at 12 Oak St.');
  result.examples.push({ case: 'emergency handoff preview with matching real lead phone', ...lead });
  check('Emergency preview has test-lead label and safety text', lead.status === 200 && lead.data.events[0]?.type === 'test_lead' && lead.data.events[0]?.simulation === true && /leave|outside|911/i.test(lead.data.reply));
  check('Emergency preview cannot alert real owner or schedule escalations', JSON.stringify(before) === JSON.stringify(await snapshot()));
  const foreign = await send('Book tomorrow 12 to 5.', { client: b.slug, session: sessionA, contact: 'foreign' });
  check('A verified mailbox cannot run B private test', [401, 403].includes(foreign.status) && await store.get('owner_tests', b.slug + '/foreign') === null);
  const invalid = await send('I am Alex Demo, 713-555-0142, at 12 Oak St. Book tomorrow 9 to 11 for AC not cooling.', { client: b.slug, contact: 'badwindow' });
  check('Rejected test booking cannot count as successful test', invalid.status === 200 && !invalid.data.events.length && invalid.data.test.proofRecorded === false && !(await store.getClient(b.slug)).setupProof?.testedRevision);
  check('Actual customer stores remain identical after rejected test', JSON.stringify(before) === JSON.stringify(await snapshot()));
  const streamedLabel = await send('How much is your fee?', { stream: true, contact: 'fees' });
  check('A question-only test also makes its simulation status visible', /^Test preview: /.test(streamedLabel.data.reply) && streamedLabel.data.simulation === true);
  for (const status of ['testing', 'building', 'paused', 'cancelled', 'live']) {
    await store.saveClient({ ...a, status });
    const response = await chat(new Request(process.env.URL + '/api/chat', { method: 'POST', headers: { origin: process.env.URL }, body: JSON.stringify({ client: a.slug, contact: 'public', messages: [{ role: 'user', content: 'I need a visit.' }] }) }), { ip: '192.0.2.80' });
    check(`Public customer access cannot bypass missing readiness in ${status}`, response.status === 403);
    const ownerResponse = await chat(new Request(process.env.URL + '/api/chat', { method: 'POST', headers: { origin: process.env.URL, authorization: 'Bearer ' + sessionA }, body: JSON.stringify({ client: a.slug, channel: 'web', contact: 'owner-bypass', messages: [{ role: 'user', content: 'Book tomorrow 12 to 5 for Alex Demo at 12 Oak St, 7135550142.' }] }) }), { ip: '192.0.2.80' });
    check(`Owner portal key cannot bypass inactive customer channel in ${status}`, ownerResponse.status === 403);
    const omittedResponse = await chat(new Request(process.env.URL + '/api/chat', { method: 'POST', headers: { origin: process.env.URL, authorization: 'Bearer ' + sessionA }, body: JSON.stringify({ client: a.slug, contact: 'omitted-channel-bypass', messages: [{ role: 'user', content: 'Book tomorrow 12 to 5 for Alex Demo at 12 Oak St, 7135550142.' }] }) }), { ip: '192.0.2.80' });
    check(`Omitting channel cannot make owner key bypass activation in ${status}`, omittedResponse.status === 403);
  }
  const oldKeyOnly = await chat(new Request(process.env.URL + '/api/chat', { method: 'POST', headers: { origin: process.env.URL }, body: JSON.stringify({ client: a.slug, key: a.ownerKey, channel: 'test', messages: [{ role: 'user', content: 'How much is your fee?' }] }) }), { ip: '192.0.2.80' });
  check('New private test cannot be reopened using a permanent key alone', [401, 403].includes(oldKeyOnly.status));
  check('No external model or provider request was attempted', requests.length === 0);
} catch (error) { result.fatal = String(error.stack || error); }
finally {
  result.sourceAfter = hashes(); check('Test isolation source stayed unchanged', JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter));
  result.summary = { checks: result.checks.length, passed: result.checks.filter(c => c.pass).length, failed: result.checks.filter(c => !c.pass).length };
  const index = process.argv.indexOf('--output'), output = index >= 0 ? process.argv[index + 1] : 'scratchpad/customer-owner-test-qa-current.json';
  if (!output?.startsWith('scratchpad/')) throw new Error('QA output must remain under scratchpad/');
  writeFileSync(output, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ output, ...result.summary, fatal: result.fatal || null, requests: requests.length }));
}
