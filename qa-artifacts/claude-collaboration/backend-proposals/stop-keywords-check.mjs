// Proposal 1 acceptance check: inbound SMS STOP/START/HELP keyword normalization (CTIA 5.1.3).
// Drives the real exported paths with an in-process memory store and no network:
//   - platform line: the real /api/platform-sms handler (signed Twilio form, intercepted receipt GET),
//     reading the keyword it records on the permanent receipt;
//   - supported shop numbers: lib/managed-consent.mjs recordManagedInbound().
// Usage: node stop-keywords-check.mjs [--repo <repo root>] [--output <new json path>]
// The repo defaults to three directories up (the checkout this file sits in).
// Expected: FAILS on dfb0ae78 (exact single-word matching), PASSES with 01-stop-keywords.patch.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg('--repo') || resolve(import.meta.dirname, '../../..'));
const output = arg('--output');
if (output && existsSync(output)) throw new Error('Choose a new output path');
const deny = () => { throw new Error('stop-keywords-check denies real networking'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(TWILIO_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|MC_PLATFORM_|MC_TWILIO_|MC_MESSAGING_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_)/.test(key)) delete process.env[key];
const origin = 'https://machinesandcloud.com', account = 'AC' + '1'.repeat(32), service = 'MG' + '2'.repeat(32), number = '+13464853328', secret = 'fixture-platform-private-auth-token';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin, TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: secret, MC_MESSAGING_SERVICE_SID: service, MC_TWILIO_NUMBER: number });
const receipts = new Map(); let providerReads = 0, otherRequests = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const match = url.origin === 'https://api.twilio.com' && (init.method || 'GET') === 'GET' && new RegExp(`^/2010-04-01/Accounts/${account}/Messages/(SM[a-f0-9]{32})\\.json$`).exec(url.pathname);
  if (!match) { otherRequests++; return deny(); }
  providerReads++; return Response.json(receipts.get(match[1]));
};
const lib = path => import(pathToFileURL(resolve(repo, path)).href);
const store = await lib('netlify/functions/lib/store.mjs');
const platform = (await lib('netlify/functions/platform-sms.mjs')).default;
const consent = await lib('netlify/functions/lib/managed-consent.mjs');

// [message, expected]  expected: 'stop' | 'start' | 'help' | 'none'
const CASES = [
  // Exact keywords (already handled on base) and de minimis variants (CTIA 5.1.3).
  ['STOP', 'stop'], ['stop', 'stop'], ['Stop.', 'stop'], ['stop ', 'stop'], ['  STOP  ', 'stop'], ['STOP!', 'stop'],
  ['Stop!!!', 'stop'], ['stop?', 'stop'], ['"STOP"', 'stop'], ['stop\n', 'stop'], ['STOP 🛑', 'stop'], ['Stop, thanks', 'stop'],
  ['STOPALL', 'stop'], ['Stop all', 'stop'], ['Unsubscribe.', 'stop'], ['unsubscribe me', 'stop'], ['Cancel.', 'stop'], ['CANCEL', 'stop'],
  ['end', 'stop'], ['End.', 'stop'], ['QUIT!', 'stop'], ['Revoke', 'stop'], ['OPTOUT', 'stop'], ['opt out', 'stop'], ['Opt-out', 'stop'],
  // Normal-language opt-outs CTIA names ("please opt me out") and short polite STOP phrases.
  ['please opt me out', 'stop'], ['Stop please', 'stop'], ['Please stop', 'stop'], ['please stop texting me', 'stop'], ['STOP NOW', 'stop'],
  ['stop it', 'stop'], ['Stop sending me messages', 'stop'], ['Quit texting me', 'stop'], ['Remove me', 'stop'], ['No more texts.', 'stop'], ['stop the texts', 'stop'],
  // Spanish opt-outs.
  ['ALTO', 'stop'], ['Alto.', 'stop'], ['¡Alto!', 'stop'], ['alto por favor', 'stop'], ['PARAR', 'stop'], ['Parar.', 'stop'],
  ['No más mensajes', 'stop'], ['no mas mensajes', 'stop'], ['No me escriban', 'stop'], ['No me manden más mensajes', 'stop'],
  // START / HELP: exact after normalization only.
  ['START', 'start'], ['start.', 'start'], ['Start!', 'start'], ['UNSTOP', 'start'], ['unstop ', 'start'], ['EMPEZAR', 'start'], ['Empezar.', 'start'], ['¡Empezar!', 'start'],
  ['HELP', 'help'], ['help?', 'help'], ['Help!', 'help'], ['INFO', 'help'], ['info.', 'help'], ['AYUDA', 'help'], ['¿Ayuda?', 'help'],
  // Ordinary customer messages that must NOT become opt-outs (or HELP/START).
  ["the leak won't stop", 'none'], ['The leak won’t stop dripping', 'none'], ['Can you stop by tomorrow?', 'none'], ['stop by at 3', 'none'],
  ['My AC stopped working', 'none'], ['Please stop the water leak', 'none'], ["Don't stop the service", 'none'],
  ["The alarm won't stop, can you come?", 'none'], ['Stop! Water everywhere in the basement', 'none'], ['stopwatch', 'none'], ['unstoppable', 'none'],
  ['Cancel my appointment', 'none'], ['Can I cancel my 3pm?', 'none'], ['end of the day works', 'none'], ['At the end of the driveway', 'none'],
  ['Help me with my furnace', 'none'], ['I need help', 'none'], ['start time?', 'none'], ['When does the tech start?', 'none'], ['Info on pricing please', 'none'],
  ['Yes', 'none'], ['Sí', 'none'], ['APPOINTMENTS', 'none'], ['Quote abc123', 'none'],
  // Accepted false negative of the short-phrase rule: extra non-courtesy words route to the normal conversation.
  ['please stop texting me, I already booked', 'none'], ['Stop the service visit', 'none'],
  ['Para mañana por favor', 'none'], ['Necesito ayuda con mi aire', 'none'], ['No paren el servicio', 'none'], ['', 'none'],
];

let sequence = 0, clock = Date.now();
function signed(body, from) {
  clock += 10; const sid = 'SM' + (++sequence).toString(16).padStart(32, '0');
  const fields = { AccountSid: account, MessagingServiceSid: service, To: number, From: from, MessageSid: sid, Body: body, NumMedia: '0' };
  receipts.set(sid, { sid, account_sid: account, messaging_service_sid: service, to: number, from, body, direction: 'inbound', date_created: new Date(clock).toISOString() });
  const signature = createHmac('sha1', secret).update(origin + '/api/platform-sms' + Object.keys(fields).sort().map(key => key + fields[key]).join('')).digest('base64');
  return { sid, request: new Request(origin + '/api/platform-sms', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature }, body: new URLSearchParams(fields).toString() }) };
}
const label = kind => kind === 'stop' || kind === 'start' || kind === 'help' ? kind : 'none';
const shop = { slug: 'stop-fixture', ownerKey: 'stop-fixture-owner', owner: { email: 'owner@stop-fixture.test' } };
const results = [];
for (const [index, [text, expected]] of CASES.entries()) {
  const phoneNumber = '+1713555' + String(1000 + index).padStart(4, '0'); // fresh contact per case: no suppression carry-over
  const { sid, request } = signed(text, phoneNumber);
  const response = await platform(request);
  const receipt = await store.get('platform_sms_receipts', sid);
  const platformKind = response.status === 200 && receipt ? label(receipt.keyword) : `http_${response.status}`;
  const shopRow = await consent.recordManagedInbound(shop, { phone: phoneNumber, text, messageSid: 'SM' + (0x100000 + index).toString(16).padStart(32, 'a'), providerDate: new Date(clock).toISOString() });
  const shopKind = label(shopRow.keyword);
  results.push({ text, expected, platform: platformKind, shop: shopKind, pass: platformKind === expected && shopKind === expected });
}
const failed = results.filter(row => !row.pass);
const report = { repo, mode: 'Real platform-sms handler + managed-consent with MC_MEMORY_STORE=1; Twilio receipt GET intercepted; no network', cases: results.length, passed: results.length - failed.length, failed: failed.length, providerReads, otherRequests, failures: failed, results };
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
for (const row of results) console.log(`${row.pass ? 'PASS' : 'FAIL'}  ${JSON.stringify(row.text).padEnd(44)} expected=${row.expected.padEnd(5)} platform=${row.platform.padEnd(5)} shop=${row.shop}`);
console.log(JSON.stringify({ repo, cases: report.cases, passed: report.passed, failed: report.failed, providerReads, otherRequests }));
assert.equal(otherRequests, 0, 'no request other than the intercepted Twilio receipt read');
assert.equal(failed.length, 0, `${failed.length} keyword case(s) misclassified`);
