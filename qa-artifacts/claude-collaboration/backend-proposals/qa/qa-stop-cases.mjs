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
  // Twilio/CTIA standard keywords (must be stop on both lines)
  ['STOP','stop'],['STOPALL','stop'],['UNSUBSCRIBE','stop'],['CANCEL','stop'],['END','stop'],['QUIT','stop'],['OPTOUT','stop'],['REVOKE','stop'],
  ['stop','stop'],['Revoke.','stop'],['OPT-OUT','stop'],['opt out','stop'],['Optout!','stop'],
  // Likely real opt-outs (recall)
  ['Stop texting me','stop'],['stop pls','stop'],['STOP STOP','stop'],['Unsubscribe me','stop'],['please remove my number','stop'],
  ['dont text me','stop'],['no more','stop'],['BAJA','stop'],['CANCELAR','stop'],['Baja por favor','stop'],
  ['STOP 🛑','stop'],['🛑 stop','stop'],['  stop  ','stop'],['\nSTOP\n','stop'],['stop\n\nthanks','stop'],['S T O P','stop'],
  ['Stop!!!','stop'],['STOP.','stop'],['stop texting me please','stop'],['Please stop sending me messages','stop'],
  ['stop messaging me','stop'],['Stop contacting me','stop'],['unsubscribe please','stop'],['UNSUBSCRIBE ME FROM THIS LIST','stop'],
  ['Remove me from your list','stop'],['take me off your list','stop'],['do not contact me','stop'],["don't text me again",'stop'],
  ['Do not text me anymore','stop'],['stop texting me!!! 😡','stop'],['STOP!!! wrong number','stop'],['wrong number stop','stop'],
  ['Stop, I already booked','stop'],['Quit texting me','stop'],['please opt me out','stop'],['opt me out','stop'],['no more texts please','stop'],
  ['Cancel.','stop'],['End','stop'],['cancel all','stop'],['stop all','stop'],['Unsubscribe.','stop'],['stopp','stop'],['Sto p','stop'],
  ['ALTO','stop'],['Alto por favor','stop'],['PARAR','stop'],['no me manden mas mensajes','stop'],['No más mensajes','stop'],['dejen de escribirme','stop'],
  // False positives (must stay a normal message)
  ['please stop by tomorrow','none'],['can you stop the leak','none'],['end of the day works','none'],['cancel my appointment','none'],
  ['help, my pipe burst','none'],['quit working','none'],['My heater quit working','none'],['It quit','none'],['it quit on me','none'],
  ['The AC quit','none'],['please stop it','none'],['stop the leak please','none'],['stop it','none'],['make it stop','none'],['just stop it now please','none'],
  ['the water wont stop','none'],['Stop by anytime','none'],['Can you stop by','none'],['cancel','stop'],['I need to cancel','none'],
  ['Cancel please','none'],['cancel my visit please','none'],['Please cancel','none'],['end','stop'],['The end','none'],
  ['stop the water','none'],['stop the drip','none'],['Stop sending the tech, I fixed it','none'],['Stop the appointment','none'],
  ['Para mañana','none'],['Alto el agua','none'],['dont stop','none'],['no stop','none'],['bus stop','none'],
  ['HELP','help'],['help!','help'],['help me','none'],['Info?','help'],['START','start'],['start','start'],['Start.','start'],
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
console.log('FAILED', failed.length); //, `${failed.length} keyword case(s) misclassified`);
