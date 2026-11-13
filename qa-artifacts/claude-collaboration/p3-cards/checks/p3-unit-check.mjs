// P3 cards unit check: PRA-FC-07, -08, -09, -10, -11 and the PRA-ONB-09 server wording.
// Runs in a source copy root: node p3check/p3-unit-check.mjs [--card ID]. Memory store, fake model, no network.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', URL: 'http://127.0.0.1:8899' });
globalThis.fetch = async () => { throw new Error('network blocked in p3 unit check'); };
const only = (() => { const i = process.argv.indexOf('--card'); return i >= 0 ? process.argv[i + 1] : null; })();
const src = f => readFileSync(resolve(f), 'utf8');
const results = [];
async function check(card, name, fn) {
  if (only && only !== card) return;
  try { const detail = await fn(); results.push({ card, name, pass: detail !== false, detail: detail === true || detail === false ? undefined : detail }); }
  catch (e) { results.push({ card, name, pass: false, detail: String(e && e.message || e).slice(0, 300) }); }
}
const ok = (cond, detail) => { if (!cond) throw new Error('assertion failed ' + JSON.stringify(detail ?? '')); return detail ?? true; };
// Balanced-brace body after a literal prefix.
function bodyAfter(text, prefix) {
  const at = text.indexOf(prefix); if (at < 0) throw new Error('prefix not found: ' + prefix.slice(0, 60));
  let i = at + prefix.length, depth = 1, q = null;
  for (; i < text.length && depth; i++) { const c = text[i]; if (q) { if (c === '\\') i++; else if (c === q) q = null; } else if (c === "'" || c === '"' || c === '`') q = c; else if (c === '{') depth++; else if (c === '}') depth--; }
  return text.slice(at + prefix.length, i - 1);
}

// PRA-FC-07: website guide dropdown errors read 'Choose ...'.
await check('PRA-FC-07', 'Select errors use field-specific Choose sentences', () => {
  const s = src('desk-service-intake.js');
  const map = (s.match(/var CHOOSE_MESSAGES=(\{[^;]*\});/) || [])[1];
  const body = bodyAfter(s, "form.querySelectorAll('input,select').forEach(function(input){");
  const errors = {}, $ = id => (errors[id] = errors[id] || { textContent: '' });
  const field = (tag, name, label) => ({ tagName: tag, name, type: tag === 'SELECT' ? 'select-one' : 'text', labels: [{ textContent: label }], validity: { valueMissing: true }, checkValidity: () => false, removeAttribute() {}, setAttribute() {} });
  const inputs = [field('SELECT', 'builder', 'Website builder'), field('SELECT', 'installationBy', 'Who manages your website?'), field('INPUT', 'website', 'Your business website')];
  const run = new Function('form', '$', 'CHOOSE_MESSAGES', 'var invalid=null;form.querySelectorAll().forEach(function(input){' + body + '});return invalid;');
  run({ querySelectorAll: () => inputs }, $, map ? Function('return ' + map)() : undefined);
  const got = { builder: errors['intake-builder-error'].textContent, installationBy: errors['intake-installationBy-error'].textContent, website: errors['intake-website-error'].textContent };
  return ok(got.builder === 'Choose your website builder.' && got.installationBy === 'Choose who manages your website.' && got.website === 'Enter your business website.', got);
});
await check('PRA-FC-07', 'Every dropdown in the guide has its own Choose sentence', () => {
  const s = src('desk-service-intake.js'), names = [...s.matchAll(/select\('([a-zA-Z]+)'/g)].map(m => m[1]);
  const map = Function('return ' + (s.match(/var CHOOSE_MESSAGES=(\{[^;]*\});/) || [, '{}'])[1])();
  const missing = names.filter(n => !/^Choose .+\.$/.test(map[n] || '') || /\?\./.test(map[n]));
  return ok(names.length >= 8 && !missing.length, { names, missing });
});

// PRA-FC-08: the website card's Calendar button matches what the owner can do.
await check('PRA-FC-08', 'Reconnect wins (matches the note); otherwise gated says Ask, available says Connect', () => {
  const s = src('desk.js'), expr = (s.match(/\$\('websiteCalendarConnect'\)\.textContent=([^;]+);/) || [])[1];
  ok(expr, 'label expression found');
  const label = (calendarView, calendarLost = false, calendarHeld = false) => Function('calendarView', 'calendarLost', 'calendarHeld', 'return ' + expr)(calendarView, calendarLost, calendarHeld);
  const got = { gated: label({ available: false, status: 'not_connected' }), gatedHeld: label({ available: false, status: 'disconnected', connectedAt: 'x' }, false, true), open: label({ available: true, status: 'not_connected' }), lost: label({ available: true, status: 'reconnect_required' }, true), lostGated: label({ available: false, status: 'reconnect_required' }, true) };
  return ok(got.gated === 'Ask about Google Calendar' && got.gatedHeld === 'Reconnect Google Calendar' && got.lostGated === 'Reconnect Google Calendar' && got.open === 'Connect Google Calendar' && got.lost === 'Reconnect Google Calendar', got);
});

// PRA-FC-09: customers CSV leaves address columns empty when no address was given.
await check('PRA-FC-09', 'splitAddress returns empty columns without an address and parses given ones', () => {
  const s = src('netlify/functions/client.mjs'), at = s.indexOf('function splitAddress(addr, defaultCity) {'), fn = s.slice(at, s.indexOf('\n}\n', at) + 2);
  const split = Function(fn + ';return splitAddress;')();
  const none = split(undefined, 'Houston'), blank = split('  ', 'Houston'), given = split('1402 Mason Rd, Katy, TX 77450', 'Houston'), street = split('12 Oak St', 'Houston');
  return ok(JSON.stringify(none) === JSON.stringify({ street: '', city: '', state: '', zip: '' }) && JSON.stringify(blank) === JSON.stringify(none) && given.city === 'Katy' && given.zip === '77450' && street.city === 'Houston' && street.state === 'TX', { none, given, street });
});

// PRA-FC-10: local mode supplies a synthetic at-rest key; fake model follows the current website-only prompt.
await check('PRA-FC-10', 'Marker comment does not claim a gate check', () => { const s = src('netlify/functions/lib/fake-model.mjs'); return ok(!/scripts check it still appears/.test(s) && /no gate check/.test(s)); });
await check('PRA-FC-10', 'Local server sets a synthetic at-rest key after stripping provider keys', () => {
  const s = src('scripts/local-server.mjs'), strip = s.indexOf('"PLATFORM_DATA_ENCRYPTION_KEY","CALENDAR_TOKEN_ENCRYPTION_KEY"'), set = s.indexOf('process.env.PLATFORM_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7)');
  return ok(strip > 0 && set > strip && s.lastIndexOf('if (process.env.MC_LOCAL_NO_KEYS !== "0") {', set) > 0, { strip, set });
});
await check('PRA-FC-10', 'Fake reply to a self-service shop never promises a booking or texts', async () => {
  const { buildSystemPrompt } = await import(resolve('netlify/functions/lib/config.mjs'));
  const fake = await import(resolve('netlify/functions/lib/fake-model.mjs'));
  const client = { slug: 'p3-shop', onboarding: { version: 1, desiredChannels: ['web'] }, status: 'live', business: { name: 'P3 Air', trade: 'HVAC', city: 'Katy', hours: 'Mon to Fri 8 am to 5 pm', serviceArea: ['Katy'] }, owner: { name: 'Pat' }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], rules: {}, channels: { web: { active: true } } };
  const system = buildSystemPrompt(client, 'web');
  ok(fake.PORTAL_ONLY_MARKER && system.includes(fake.PORTAL_ONLY_MARKER), 'marker in the current prompt');
  const api = fake.fakeClient();
  const messages = [{ role: 'user', content: 'Hi, I am Jim Test, AC is not cooling at 12 Oak St, Katy. Book me tomorrow 8 to 12. 713-555-0100' }];
  let text = '', guard = 0, convo = messages.slice();
  while (guard++ < 4) {
    const res = await api.beta.messages.stream({ model: 'fake', system, messages: convo, tools: [{ name: 'book_visit' }, { name: 'notify_owner' }], max_tokens: 500 }).finalMessage();
    text += (res.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ') + ' ';
    const tool = (res.content || []).find(b => b.type === 'tool_use'); if (!tool) break;
    convo = convo.concat([{ role: 'assistant', content: res.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: JSON.stringify({ ok: true, booked: { id: 'ref1' } }) }] }]);
  }
  return ok(!/\byou are booked\b|\bare booked for\b|texts? when on the way|confirmation text/i.test(text) && text.trim().length > 0, text.trim().slice(0, 300));
});

// PRA-FC-11: paused workspaces mark only services that were running as Paused.
await check('PRA-FC-11', 'Server marks pausedService from pre-pause state', async () => {
  const { buildConnectionJourney } = await import(resolve('netlify/functions/lib/connection-journey.mjs'));
  const client = { slug: 'p3', status: 'paused', pausedChannels: { web: { active: true }, voice: { active: false }, sms: { active: false } }, onboarding: { version: 1, desiredChannels: ['web', 'voice', 'sms', 'calendar'] }, business: { name: 'P3' }, owner: {}, channels: { web: { active: false } } };
  const j = buildConnectionJourney(client, { voice: {}, messaging: {}, calendar: { status: 'not_connected' } }, null, { channels: { web: {} } });
  const rows = Object.fromEntries(j.channels.map(r => [r.id, { status: r.status, pausedService: r.pausedService }]));
  return ok(rows.web.pausedService === true && rows.voice.pausedService === false && rows.sms.pausedService === false && rows.calendar.pausedService === false && rows.voice.status === 'paused', rows);
});
await check('PRA-FC-11', 'Account labels: running service Paused, gated never-run service Setup with our team', () => {
  const s = src('desk.js'), line = (s.match(/else if \(paused && relevant\) label = ([^;]+);/) || [])[1];
  ok(line, 'paused label expression found');
  const label = row => Function('row', 'return ' + line)(row);
  const got = { web: label({ id: 'web', pausedService: true }), voice: label({ id: 'voice', pausedService: false, activation: { blockedBy: 'machines_and_cloud' } }), sms: label({ id: 'sms', pausedService: false, activation: { blockedBy: null } }), legacy: label({ id: 'web' }) };
  return ok(got.web === 'Paused' && got.voice === 'Setup with our team' && got.sms === 'Not set up yet' && got.legacy === 'Paused', got);
});
await check('PRA-FC-11', 'Connector page status follows the same rule', () => {
  const s = src('desk-setup-guide.js'), start = s.indexOf('return {status:paused?'), end = s.indexOf(':uncertain?', start);
  ok(start > 0 && end > start, 'status expression found');
  const expr = s.slice(start + 'return {status:paused?'.length, end);
  const label = row => Function('row', 'return ' + expr)(row);
  const got = { running: label({ pausedService: true }), gated: label({ pausedService: false, activation: { blockedBy: 'machines_and_cloud' } }), other: label({ pausedService: false }) };
  return ok(got.running === 'Paused' && got.gated === 'Setup with our team' && got.other === 'Not set up yet' && /stopped\.paused\?'paused':'stopped'/.test(s) && /paused:paused/.test(s), got);
});

// PRA-ONB-09 server wording.
await check('PRA-ONB-09', 'draft_changed says replacing deletes the other answers; two-step replace controls exist', () => {
  const s = src('netlify/functions/lib/access.mjs'), m = (s.match(/AccessError\("draft_changed", "([^"]+)"/) || [])[1] || '';
  return ok(/another device or tab/.test(m) && /Replacing deletes the other answers and cannot be undone\./.test(m) && src('onboard.html').includes('>Replace with this page’s answers</button>') && src('onboard.html').includes('>Replace saved answers</button>'), m);
});

for (const r of results) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.card + ' ' + r.name + (r.pass ? '' : ' ' + JSON.stringify(r.detail || '').slice(0, 400)));
const failed = results.filter(r => !r.pass).length;
console.log(`RESULT ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
