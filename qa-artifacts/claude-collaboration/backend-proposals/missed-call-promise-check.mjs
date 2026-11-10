// Proposal 7 acceptance check: the missed-call line promises a text only when one was sent, and the
// owner note gives the real reason when no text-back went out.
// Built on the coverage-map blind-spot check (D2/D3):
// /tmp/mc-claude-coverage-map-20261110/qa-artifacts/claude-collaboration/blind-spot-checks/missed-call-textback-check.mjs
// It uses the real /api/voice handler (netlify/functions/voice.mjs) with a correctly signed Twilio webhook, the real
// send path, and memory storage. TWILIO_* are synthetic and globalThis.fetch answers only api.twilio.com
// Messages.json (accept or refuse per case). Every other destination and every socket is refused.
// Usage: node missed-call-promise-check.mjs [--repo <repo root>] [--output <new json path>]
// Expected: FAILS on dfb0ae78, PASSES with 07-missed-call-promise.patch.
import assert from "node:assert/strict";
import { writeFileSync, existsSync } from "node:fs";
import { createHash, createHmac } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || resolve(import.meta.dirname, "../../.."));
const output = arg("--output");
if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
const sha = (v) => createHash("sha256").update(v).digest("hex");
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|MC_PLATFORM_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|ADMIN_|NETLIFY_|URL$|DEPLOY_)/.test(key)) delete process.env[key];
const ORIGIN = "https://voice-promise.fixture.invalid", TOKEN = "synthetic-twilio-auth-token-not-real", SID = "ACsyntheticpromise00000000000000";
// --unconfigured (child run): no Twilio env at all, so sendSMS only logs ("logged"); the webhook signature check is off.
const UNCONFIGURED = process.argv.includes("--unconfigured");
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: ORIGIN }, UNCONFIGURED ? {} : { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN });
let physical = 0; const forbidden = [];
const deny = () => { physical++; throw new Error("missed-call-promise-check forbids physical transport"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
let providerMode = "ok", serialSid = 0; const providerCalls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input?.url || input));
  if (url.origin === "https://api.twilio.com" && url.pathname === `/2010-04-01/Accounts/${SID}/Messages.json`) {
    const form = Object.fromEntries(new URLSearchParams(String(init.body)));
    providerCalls.push({ to: form.To, body: form.Body, mode: providerMode });
    if (providerMode === "fail") return Response.json({ code: 21610, message: "Synthetic provider refusal" }, { status: 400 });
    return Response.json({ sid: "SMsynthetic" + String(++serialSid).padStart(24, "0"), status: "queued" }, { status: 201 });
  }
  forbidden.push(url.origin + url.pathname); return deny();
};
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs"));
const send = await import(F("lib/send.mjs"));
const { newClient } = await import(F("lib/config.mjs"));
const voice = (await import(F("voice.mjs"))).default;
console.log = ((log) => (...a) => { if (!/^\[(sms|email):disabled\]/.test(String(a[0]))) log(...a); })(console.log);

let serial = 0;
async function shop(configure) {
  const n = ++serial, c = newClient({ slug: "promise-" + n, ownerKey: "k-" + n, owner: { name: "Dana Owner", email: "", phone: "+12815550199" }, business: { name: "Promise HVAC", trade: "HVAC", hours: "Mon-Fri 7am-7pm" } });
  c.status = "live"; c.plan = "growth"; c.phone.twilioNumber = "+1713555" + String(3000 + n).padStart(4, "0"); c.phone.businessNumber = "+12815550100"; c.phone.tenDlc = "approved";
  if (configure) configure(c);
  await store.saveClient(c); await store.indexClient(c); return c;
}
const sign = (params) => createHmac("sha1", TOKEN).update(ORIGIN + "/api/voice" + Object.keys(params).sort().map((k) => k + params[k]).join("")).digest("base64");
async function call(c, from) {
  const params = { From: from, To: c.phone.twilioNumber, CallSid: "CA" + sha(from + Date.now() + Math.random()).slice(0, 32) };
  const res = await voice(new Request(ORIGIN + "/api/voice", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sign(params) }, body: new URLSearchParams(params).toString() }));
  return { status: res.status, twiml: await res.text() };
}
const spoken = (twiml) => twiml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const PROMISE = /texting you|Le enviamos un mensaje/i;
// Rev 2 (QA2): when texting cannot reach the caller, the line must not invite a text either.
const INVITE = /send (?:us )?a text|text (?:us|this number)|mensaje de texto a este|env[ií]enos un mensaje/i;
const toCaller = (from) => providerCalls.filter((p) => p.to === from);
const ownerNote = (from) => providerCalls.filter((p) => p.to === "+12815550199" && p.body.includes("missed call from " + from)).at(-1)?.body || "";
const results = [];
async function check(name, run) {
  const before = providerCalls.length; const seen = {};
  try { await run(seen); results.push({ name, pass: true, ...seen }); console.log("ok   " + name); }
  catch (e) { results.push({ name, pass: false, error: e.message.split("\n")[0], ...seen, providerCalls: providerCalls.slice(before) }); console.log("FAIL " + name + ": " + e.message.split("\n")[0]); }
  finally { providerMode = "ok"; }
}

if (!UNCONFIGURED) {
await check("new caller: text accepted, promise spoken and kept, owner told it was sent", async (seen) => {
  const c = await shop(), from = "+17135552201"; const r = await call(c, from); seen.spoken = spoken(r.twiml); seen.owner = ownerNote(from);
  assert.equal(r.status, 200); assert.equal(toCaller(from).length, 1); assert.match(r.twiml, PROMISE); assert.match(r.twiml, /<Hangup\/>/);
  assert.match(seen.owner, /Text-back sent/);
});
await check("new caller, Spanish shop: both promises spoken and kept", async (seen) => {
  const c = await shop((c) => { c.business.spanish = true; }), from = "+17135552202"; const r = await call(c, from); seen.spoken = spoken(r.twiml);
  assert.equal(toCaller(from).length, 1); assert.match(r.twiml, /texting you/); assert.match(r.twiml, /Le enviamos un mensaje/);
});
await check("opted-out caller: no text, no promise, owner told they opted out", async (seen) => {
  const c = await shop(), from = "+17135552203"; await send.recordOptOut(from, c.slug, "STOP"); const r = await call(c, from); seen.spoken = spoken(r.twiml); seen.owner = ownerNote(from);
  assert.equal(toCaller(from).length, 0); assert.doesNotMatch(r.twiml, PROMISE, "promise spoken: " + seen.spoken); assert.doesNotMatch(r.twiml, INVITE, "texting invited although it cannot work: " + seen.spoken); assert.match(seen.owner, /opted out/);
});
await check("opted-out caller, Spanish shop: no promise in either language", async (seen) => {
  const c = await shop((c) => { c.business.spanish = true; }), from = "+17135552204"; await send.recordOptOut(from, c.slug, "STOP"); const r = await call(c, from); seen.spoken = spoken(r.twiml);
  assert.doesNotMatch(r.twiml, PROMISE, "promise spoken: " + seen.spoken); assert.doesNotMatch(r.twiml, INVITE, "texting invited although it cannot work: " + seen.spoken);
});
await check("text-back switched off: no text, no promise", async (seen) => {
  const c = await shop((c) => { c.phone.textBack = false; }), from = "+17135552205"; const r = await call(c, from); seen.spoken = spoken(r.twiml); seen.owner = ownerNote(from);
  assert.equal(toCaller(from).length, 0); assert.doesNotMatch(r.twiml, PROMISE, "promise spoken: " + seen.spoken); assert.doesNotMatch(r.twiml, INVITE, "texting invited although it cannot work: " + seen.spoken); assert.match(seen.owner, /Text-back is off/);
});
await check("caller texted in the last 24 hours: second call sends nothing and promises nothing", async (seen) => {
  const c = await shop(), from = "+17135552206"; await call(c, from); const r = await call(c, from); seen.spoken = spoken(r.twiml); seen.owner = ownerNote(from);
  assert.equal(toCaller(from).length, 1); assert.doesNotMatch(r.twiml, PROMISE, "promise spoken: " + seen.spoken); assert.match(seen.owner, /last 24 hours/);
});
await check("provider refuses the text: no promise, owner gets the real reason (not 'No texting sender yet')", async (seen) => {
  const c = await shop(), from = "+17135552207"; providerMode = "fail"; const r = await call(c, from); seen.spoken = spoken(r.twiml); seen.owner = ownerNote(from);
  assert.equal(toCaller(from).length, 1, "the text was attempted"); assert.doesNotMatch(r.twiml, PROMISE, "promise spoken: " + seen.spoken); assert.doesNotMatch(r.twiml, INVITE, "texting invited although it cannot work: " + seen.spoken);
  assert.doesNotMatch(seen.owner, /No texting sender yet|Text-back sent/, "wrong owner reason: " + seen.owner); assert.match(seen.owner, /could not be sent \(Synthetic provider refusal\)/);
});
} else {
  await check("texting not configured (send only logged): no promise, owner told texting is not set up", async (seen) => {
    const c = await shop(), from = "+17135552208"; const r = await call(c, from); seen.spoken = spoken(r.twiml); seen.owner = ownerNote(from);
    // Nothing reaches a provider here; the owner note is read from the logged sms_sent event preview.
    seen.owner = (await store.listJSON("events", c.slug + "/", Infinity)).map((e) => e.data || e).filter((e) => e.to === "+12815550199" && /missed call from/.test(e.preview || "")).at(-1)?.preview || "";
    assert.equal(r.status, 200); assert.doesNotMatch(r.twiml, PROMISE, "promise spoken: " + seen.spoken); assert.doesNotMatch(r.twiml, INVITE, "texting invited although it cannot work: " + seen.spoken);
    assert.doesNotMatch(seen.owner, /Text-back sent/, "owner told a text was sent: " + seen.owner); assert.match(seen.owner, /not set up/);
  });
}
if (!UNCONFIGURED) await check("no caller ID: no text, no promise, owner note does not mention a voicemail", async (seen) => {
  const c = await shop(); const before = providerCalls.length; const r = await call(c, ""); seen.spoken = spoken(r.twiml);
  seen.owner = providerCalls.slice(before).filter((p) => p.to === "+12815550199").at(-1)?.body || "";
  assert.equal(r.status, 200); assert.doesNotMatch(r.twiml, PROMISE); assert.doesNotMatch(r.twiml, INVITE, "texting invited: " + seen.spoken);
  assert.match(seen.owner, /missed call from unknown/); assert.doesNotMatch(seen.owner, /voicemail/i, "owner told to check a voicemail that is never recorded: " + seen.owner);
});
await check("no physical transport and no non-Twilio destination", async () => { assert.equal(physical, 0); assert.deepEqual(forbidden, []); });

if (UNCONFIGURED) { process.stdout.write("\n" + JSON.stringify({ childResults: results, physical, forbidden }) + "\n"); process.exit(0); }
{ // child run without any Twilio env
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [import.meta.filename, "--repo", repo, "--unconfigured"], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8" });
  const line = (r.stdout || "").split("\n").filter((l) => l.startsWith('{"childResults"')).at(-1);
  if (!line) results.push({ name: "unconfigured child run", pass: false, error: (r.stderr || "").slice(0, 400) });
  else { const j = JSON.parse(line); for (const x of j.childResults) { results.push(x); console.log((x.pass ? "ok   " : "FAIL ") + x.name + (x.pass ? "" : ": " + x.error)); } physical += j.physical; forbidden.push(...j.forbidden); }
}
const failed = results.filter((r) => !r.pass).length;
const summary = { check: "missed-call-promise-check", repo, checks: results.length, failed, providerCalls: providerCalls.length, physicalNetwork: physical, result: failed ? "FAIL" : "PASS" };
console.log(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
process.exit(failed ? 1 : 0);
