// QA3 probe for proposal 07 rev 2 (harness copied from ../missed-call-promise-check.mjs; its own checks are not run here).
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
// Rev 2 (QA2): when texting cannot reach the caller, the line must not invite a text either.
const INVITE = /send (?:us )?a text|text (?:us|this number)|mensaje de texto a este|env[ií]enos un mensaje/i;
const toCaller = (from) => providerCalls.filter((p) => p.to === from);
const ownerNote = (from) => providerCalls.filter((p) => p.to === "+12815550199" && p.body.includes("missed call from " + from)).at(-1)?.body || "";
const results = [];
// ---- QA3 additions (proposal 07 rev 2) ----
// Well-formedness: balanced tags, no raw "<" or bare "&" in text, attribute values quoted.
function wellFormed(x) {
  const stack = []; let i = 0; const s = x.replace(/^<\?xml[^>]*\?>/, "");
  const re = /<(\/?)([A-Za-z]+)((?:\s+[A-Za-z:]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g; let m;
  while ((m = re.exec(s))) {
    if (m[6]) return "stray <";
    if (m[5] !== undefined) { if (/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(m[5])) return "bare &: " + m[5].slice(0, 60); continue; }
    if (m[4]) continue; if (m[1]) { if (stack.pop() !== m[2]) return "unbalanced </" + m[2] + ">"; } else stack.push(m[2]);
  }
  return stack.length === 0 && /^<Response>[\s\S]*<\/Response>$/.test(s) ? "ok" : "stack " + stack.join(",");
}
const rows = [];
const say = (t) => spoken(t);
async function row(label, c, from, r) { rows.push({ label, status: r.status, xml: wellFormed(r.twiml), twiml: r.twiml, spoken: say(r.twiml), textsToCaller: toCaller(from).length, owner: ownerNote(from).slice(0, 160) }); }
const NAMES = UNCONFIGURED ? [] : [`A&B "Pro" <Plumbing> O'Neil`, `Tom & Jerry's HVAC`, `<script>&amp; Co`];
for (const nm of NAMES) {
  globalThis.__name = nm;
  let c = await shop(), from = "+1713555" + String(4000 + rows.length).padStart(4, "0");
  await row(`[${nm}] sent`, c, from, await call(c, from));
  await row(`[${nm}] second call within 24h (recent)`, c, from, await call(c, from));
  c = await shop((c) => { c.business.spanish = true; }); from = "+1713555" + String(4100 + rows.length).padStart(4, "0");
  providerMode = "fail"; await row(`[${nm}] es provider refusal`, c, from, await call(c, from)); providerMode = "ok";
  await row(`[${nm}] es second call after refused text (not recent)`, c, from, await call(c, from));
  await row(`[${nm}] es third call (recent)`, c, from, await call(c, from));
}
globalThis.__name = "Promise HVAC";
if (UNCONFIGURED) { const c = await shop(), from = "+17135554601"; await row("UNCONFIGURED: logged send", c, from, await call(c, from)); await row("UNCONFIGURED: second call within 24h", c, from, await call(c, from)); }
if (!UNCONFIGURED) { const c = await shop(), from = "+17135554501"; await row("sent, then STOP, then call within 24h", c, from, await call(c, from)); await send.recordOptOut(from, c.slug, "STOP"); await row("  -> call after STOP", c, from, await call(c, from)); }
for (const r of rows) console.log(JSON.stringify(r));
if (!UNCONFIGURED) { const { spawnSync } = await import("node:child_process"); const r = spawnSync(process.execPath, [import.meta.filename, "--repo", repo, "--unconfigured"], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8" }); process.stdout.write(r.stdout); process.stderr.write(r.stderr.slice(0, 400)); }
