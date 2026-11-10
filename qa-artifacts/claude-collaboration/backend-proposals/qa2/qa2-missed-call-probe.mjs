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
const smsIn = (await import(F("sms.mjs"))).default;
console.log = ((log) => (...a) => { if (!/^\[(sms|email):disabled\]/.test(String(a[0]))) log(...a); })(console.log);

let serial = 0;
async function shop(configure) {
  const n = ++serial, c = newClient({ slug: "promise-" + n, ownerKey: "k-" + n, owner: { name: "Dana Owner", email: "", phone: "+12815550199" }, business: { name: globalThis.__name || "Promise HVAC", trade: "HVAC", hours: "Mon-Fri 7am-7pm" } });
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
const toCaller = (from) => providerCalls.filter((p) => p.to === from);
const ownerNote = (from) => providerCalls.filter((p) => p.to === "+12815550199" && p.body.includes("missed call from " + from)).at(-1)?.body || "";
const results = [];
async function check(name, run) {
  const before = providerCalls.length; const seen = {};
  try { await run(seen); results.push({ name, pass: true, ...seen }); console.log("ok   " + name); }
  catch (e) { results.push({ name, pass: false, error: e.message.split("\n")[0], ...seen, providerCalls: providerCalls.slice(before) }); console.log("FAIL " + name + ": " + e.message.split("\n")[0]); }
  finally { providerMode = "ok"; }
}


const out = [];
async function rec(label, c, from, r) { out.push({ mode: UNCONFIGURED ? "unconfigured" : "provider", label, status: r.status, twiml: r.twiml, owner: ownerNote(from) || (await store.listJSON("events", c.slug + "/", Infinity)).map((e) => e.data || e).filter((e) => e.to === "+12815550199" && /missed call/.test(e.preview || "")).at(-1)?.preview || "" }); }
globalThis.__name = `A&B "Pro" <Plumbing> O'Neil`;
if (!UNCONFIGURED) {
  let c = await shop(), from = "+17135552301"; await rec("new caller, special-char name", c, from, await call(c, from));
  c = await shop((c) => { c.business.spanish = true; }); from = "+17135552302"; providerMode = "fail"; await rec("provider refusal, spanish, special-char name", c, from, await call(c, from)); providerMode = "ok";
  c = await shop(); from = "+17135552303"; await send.recordOptOut(from, c.slug, "STOP"); await rec("opted out", c, from, await call(c, from));
  // The opted-out caller follows the spoken advice and texts the number.
  const p = { From: from, To: c.phone.twilioNumber, Body: "Hi, I need my AC fixed", MessageSid: "SM" + "1".repeat(32) };
  const sig = createHmac("sha1", TOKEN).update(ORIGIN + "/api/sms" + Object.keys(p).sort().map((k) => k + p[k]).join("")).digest("base64");
  const sr = await smsIn(new Request(ORIGIN + "/api/sms", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig }, body: new URLSearchParams(p).toString() }));
  out.push({ label: "opted-out caller then texts the number", smsStatus: sr.status, smsTwiml: await sr.text() });
  c = await shop(); from = ""; { const params = { From: "Anonymous", To: c.phone.twilioNumber, CallSid: "CA" + "2".repeat(32) }; const r = await voice(new Request(ORIGIN + "/api/voice", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sign(params) }, body: new URLSearchParams(params).toString() })); out.push({ label: "no caller ID (From=Anonymous)", status: r.status, twiml: await r.text(), owner: providerCalls.filter((x) => x.to === "+12815550199").at(-1)?.body }); }
} else { const c = await shop(); const from = "+17135552304"; await rec("texting not configured", c, from, await call(c, from)); }
for (const x of out) process.stdout.write(JSON.stringify(x) + "\n");
if (!UNCONFIGURED) { const { spawnSync } = await import("node:child_process"); const r = spawnSync(process.execPath, [import.meta.filename, "--repo", repo, "--unconfigured"], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8" }); process.stdout.write(r.stdout); process.stderr.write(r.stderr.slice(0, 400)); }
