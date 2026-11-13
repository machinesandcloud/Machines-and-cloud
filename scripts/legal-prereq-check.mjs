// Offline check for legal-page publication preconditions P1, P3, P6, P7 and P9 (revision 2: adds the QA rows
// L11-L15, V5, G7-G8, O7-O12 and C3; base 43ee2f2c).
// Usage (from any directory): node legal-prereq-check.mjs --repo <tree> [--skip P7b] [--json out.json]
// Every provider is a double: Twilio, Resend and the background-function fetch are recorded in process;
// any other origin is refused. Storage is MC_MEMORY_STORE. No model (MC_FAKE_MODEL=1), no network.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const HERE = fileURLToPath(new URL(".", import.meta.url));
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";

const arg = (name, fallback = null) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const REPO = resolve(arg("--repo", "."));
const SKIP = new Set(String(arg("--skip", "")).split(",").filter(Boolean));
const OUT = arg("--json");
const deny = () => { throw new Error("legal-prereq-check denies real networking"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();

const SITE = "https://machinesandcloud.com", ACCOUNT = "AC" + "1".repeat(32), SERVICE = "MG" + "2".repeat(32), MC_NUMBER = "+13464853328", SECRET = "fixture-legal-prereq-auth-token";
for (const key of Object.keys(process.env)) if (/^(TWILIO_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|MC_|STEVE_|ADMIN_|PHONE_|SERVICE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: SITE, PUBLIC_SITE_URL: SITE, ADMIN_KEY: "legal-prereq-admin", VAPI_WEBHOOK_SECRET: "legal-prereq-vapi",
  TWILIO_ACCOUNT_SID: ACCOUNT, TWILIO_AUTH_TOKEN: SECRET, MC_TWILIO_NUMBER: MC_NUMBER, MC_MESSAGING_SERVICE_SID: SERVICE, RESEND_API_KEY: "re_fixture_legal_prereq", STEVE_EMAIL: "operator@example.test", STEVE_PHONE: "+17135550999", GOOGLE_CLIENT_ID: "fixture-google", GOOGLE_CLIENT_SECRET: "fixture-google-secret" });

const requests = [], blocked = [], receipts = new Map();
// Rev 2: a Resend failure double. emailFail(to) === true answers 500 for that recipient.
let emailFail = () => false;
let serial = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  if (url.origin === "https://api.twilio.com") {
    const rec = { kind: "twilio", method, path: url.pathname, params: Object.fromEntries(new URLSearchParams(body)) }; requests.push(rec);
    const m = url.pathname.match(/\/Messages\/(SM[a-f0-9]{32})\.json$/i);
    if (method === "GET" && m) { const r = receipts.get(m[1]); return new Response(JSON.stringify(r || {}), { status: r ? 200 : 404 }); }
    return new Response(JSON.stringify({ sid: "SM" + (++serial).toString(16).padStart(32, "0") }), { status: 201 });
  }
  if (url.origin === "https://api.resend.com") { const json = JSON.parse(body || "{}"), failed = !!emailFail([].concat(json.to).join(",")); requests.push({ kind: "email", to: json.to, subject: json.subject, text: json.text, failed }); if (failed) return new Response("{}", { status: 500 }); return new Response(JSON.stringify({ id: "em_" + (++serial) }), { status: 200 }); }
  if (url.origin === SITE && url.pathname.startsWith("/.netlify/functions/")) { requests.push({ kind: "background", path: url.pathname }); return new Response("ok"); }
  if (url.origin === "https://oauth2.googleapis.com" || url.origin === "https://www.googleapis.com") { requests.push({ kind: "google", method, path: url.pathname }); return new Response(JSON.stringify({ access_token: "t", id: "ev1", htmlLink: "x" }), { status: 200 }); }
  blocked.push(url.origin + url.pathname); throw new Error("blocked " + url.origin);
};

const fn = rel => pathToFileURL(join(REPO, "netlify/functions", rel)).href;
const src = rel => { try { return readFileSync(join(REPO, rel), "utf8"); } catch { return ""; } };
const store = await import(fn("lib/store.mjs"));
const { newClient } = await import(fn("lib/config.mjs"));
const send = await import(fn("lib/send.mjs"));
const smsHandler = (await import(fn("sms.mjs"))).default;
const voiceMod = await import(fn("voice.mjs")), voiceHandler = voiceMod.default;
const vapiHandler = (await import(fn("vapi.mjs"))).default;
const results = [];
async function check(group, id, name, body) {
  if (SKIP.has(group)) { results.push({ group, id, name, pass: null, skipped: true }); return; }
  try { await body(); results.push({ group, id, name, pass: true }); }
  catch (error) { results.push({ group, id, name, pass: false, error: String(error?.message || error).slice(0, 400) }); }
}
const since = n => requests.slice(n);
const texts = list => list.filter(r => r.kind === "twilio" && r.method === "POST" && /Messages\.json$/.test(r.path));
const emails = list => list.filter(r => r.kind === "email");
const toOperator = list => emails(list).filter(e => JSON.stringify(e.to).includes("operator@example.test"));
const eventsOf = async (c, type) => (await store.listJSON("events", c.slug + "/", Infinity)).filter(e => e.type === type);
let shopNo = 0;
async function shop({ approved = false, ownerEmail = "owner@example.test", ownerPhone = "+17135550111", spanish = false, bypass = [], forwardedLine = false, name = "Bayou Air" } = {}) {
  const n = ++shopNo, slug = "legal-shop-" + n;
  const c = newClient({ slug, ownerKey: "k" + n, owner: { name: "Dana", email: ownerEmail, phone: ownerPhone }, business: { name, trade: "HVAC", hours: "Mon-Fri 7am-7pm", website: "https://example.test" } });
  c.status = "live"; c.business.spanish = spanish;
  c.phone = { ...(c.phone || {}), twilioNumber: "+1713555" + String(2000 + n).padStart(4, "0"), tenDlc: approved ? "approved" : "brand_pending", messagingServiceSid: approved ? "MG" + "3".repeat(32) : "", businessNumber: forwardedLine ? ownerPhone : "+17135559" + String(100 + n).padStart(3, "0"), forwarding: "busy" };
  c.rules = { ...(c.rules || {}), bypass };
  c.voice = { provider: "vapi", assistantId: "asst-" + n };
  if (!ownerEmail) delete c.owner.email; if (!ownerPhone) delete c.owner.phone;
  await store.saveClient(c); await store.indexClient(c);
  return store.getClient(slug);
}
const form = (path, fields, extraHeaders = {}) => new Request(SITE + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-admin-key": process.env.ADMIN_KEY, ...extraHeaders }, body: new URLSearchParams(fields).toString() });

// ---------------- P1: legacy shared sender retired ----------------
await check("P1", "L1", "A shop without its own approved sender is never texted through the shared M&C number, and no bridge index is written", async () => {
  const c = await shop(), n = requests.length;
  const r = await send.sendSMS({ to: "+17135550301", client: c, type: "reply", body: "Hello" });
  assert.equal(r.ok, false, "send must be refused");
  const sent = texts(since(n));
  assert.equal(sent.filter(t => t.params.From === MC_NUMBER || t.params.MessagingServiceSid === SERVICE).length, 0, "texted through the shared sender");
  assert.equal(sent.length, 0, "no text at all without an approved sender");
  assert.equal(await store.get("index", "bridge:+17135550301"), null, "bridge index written");
});
await check("P1", "L2", "Owner alert for a shop without an approved sender goes by email, not the shared number", async () => {
  const c = await shop(), n = requests.length;
  await send.notifyOwner(c, "New lead: test", { type: "owner_alert" });
  assert.equal(texts(since(n)).length, 0, "owner texted through the shared sender");
  assert.ok(emails(since(n)).some(e => JSON.stringify(e.to).includes("owner@example.test")), "owner email missing");
});
await check("P1", "L3", "Owner alert that can be neither texted nor emailed reaches the operator (never silently dropped)", async () => {
  const c = await shop({ ownerEmail: "" }), n = requests.length;
  await send.notifyOwner(c, "VIP text from +17135550302: call me", { type: "owner_note" });
  const ops = emails(since(n)).filter(e => JSON.stringify(e.to).includes("operator@example.test"));
  assert.equal(texts(since(n)).length, 0, "texted through the shared sender");
  assert.ok(ops.length === 1 && /VIP text from/.test(ops[0].text), "operator fallback email with the alert text missing");
});
await check("P1", "L4", "A shop with its own approved sender still texts its owner and customers from its own number", async () => {
  const c = await shop({ approved: true }), n = requests.length;
  await send.notifyOwner(c, "New lead", { type: "owner_alert" });
  const r = await send.sendSMS({ to: "+17135550303", client: c, type: "reply", body: "Hi" });
  const sent = texts(since(n));
  assert.ok(r.ok, "customer text refused"); assert.equal(sent.length, 2);
  assert.ok(sent.every(t => t.params.MessagingServiceSid === c.phone.messagingServiceSid || t.params.From === c.phone.twilioNumber), "not sent from the shop's own sender");
});
await check("P1", "L5", "An owner who texted STOP is not texted by owner alerts (no force override); email still goes", async () => {
  const c = await shop({ approved: true, ownerPhone: "+17135550304" }); await send.recordOptOut("+17135550304", c.slug, "STOP");
  const n = requests.length; await send.notifyOwner(c, "New lead", { type: "owner_alert" });
  assert.equal(texts(since(n)).length, 0, "opted-out owner was texted"); assert.equal(emails(since(n)).length, 1);
});
await check("P1", "L6", "An inbound text to the M&C number never reaches a shop through the bridge index", async () => {
  const c = await shop(); await store.put("index", "bridge:+17135550305", c.slug);
  const n = requests.length, res = await smsHandler(form("/api/sms", { To: MC_NUMBER, From: "+17135550305", Body: "Is Tuesday ok?" }));
  const body = await res.text(), conv = await store.getConversation(c, "sms", "+17135550305");
  assert.equal(conv.messages.length, 0, "the text was filed under a shop"); assert.doesNotMatch(body, /<Message>/);
  assert.equal(since(n).filter(r => r.kind === "background").length, 0, "shop AI started for a bridge text");
});
await check("P1", "L7", "A call to the M&C number is not routed to a shop through the bridge index", async () => {
  const c = await shop(); await store.put("index", "bridge:+17135550306", c.slug);
  const res = await voiceHandler(form("/api/voice", { To: MC_NUMBER, From: "+17135550306" })), body = await res.text();
  assert.doesNotMatch(body, /<Dial/, "bridge callback dialed the shop owner");
  const events = await store.listJSON("events", c.slug + "/", 50);
  assert.equal(events.filter(e => e.type === "bridge_callback").length, 0);
});
await check("P1", "L8", "Operator alerts are email only; nothing is texted from the M&C number", async () => {
  const n = requests.length; await send.notifySteve("Subject", "Body");
  assert.equal(texts(since(n)).length, 0, "operator texted from the campaign number"); assert.equal(emails(since(n)).length, 1);
});
await check("P1", "L9", "Source: no force:true sends, no bridge writes or lookups remain in the functions", async () => {
  const files = ["lib/send.mjs", "sms.mjs", "voice.mjs", "scheduler.mjs", "client.mjs", "provision-background.mjs", "lib/fanout.mjs", "lib/desk.mjs"];
  for (const f of files) { const t = src("netlify/functions/" + f); assert.doesNotMatch(t, /force:\s*true/, f + " still uses force:true"); assert.doesNotMatch(t, /["']bridge:["']\s*\+/, f + " still uses the bridge index"); }
  assert.doesNotMatch(src("desk.js"), /registered number until|Same bridge/, "owner portal still describes the shared sender");
});
await check("P1", "L10", "textOwner falls back to the owner's email when the shop cannot text", async () => {
  assert.equal(typeof send.textOwner, "function", "textOwner helper missing");
  const c = await shop(), n = requests.length; const r = await send.textOwner(c, "Second notice: not acknowledged", { type: "owner_alert" });
  assert.equal(texts(since(n)).length, 0); assert.equal(r.emailed, "sent");
});

await check("P1", "L11", "Rev 2 (QA Q1): the owner's email send fails and the shop cannot text: the operator still gets the alert and it is logged", async () => {
  const c = await shop(), n = requests.length; emailFail = to => to.includes("owner@example.test");
  try { const r = await send.notifyOwner(c, "New lead: Ana, AC out", { type: "owner_alert" }); assert.ok(r.some(x => x.channel === "operator" && x.ok), "no operator result: " + JSON.stringify(r)); }
  finally { emailFail = () => false; }
  assert.equal(toOperator(since(n)).length, 1, "operator fallback email missing");
  assert.ok((await eventsOf(c, "owner_alert_fallback")).some(e => (e.data || e).reason === "owner_email_failed"), "fallback not logged with owner_email_failed");
});
await check("P1", "L12", "Rev 2 (QA Q2): textOwner whose owner email fails reaches the operator", async () => {
  const c = await shop(), n = requests.length; emailFail = to => to.includes("owner@example.test");
  let r; try { r = await send.textOwner(c, "Second notice: not acknowledged", { type: "owner_alert" }); } finally { emailFail = () => false; }
  assert.equal(r.emailed, "failed_operator"); assert.equal(toOperator(since(n)).length, 1, "operator fallback email missing");
});
await check("P1", "L13", "Rev 2 (QA Q3): operator fallback is rate limited per shop and hour, held alerts are logged, and no customer phone or street address reaches the operator", async () => {
  const c = await shop({ ownerEmail: "" }), n = requests.length;
  for (let i = 0; i < 6; i++) await send.notifyOwner(c, `${c.business.name} front desk: URGENT ref r${i} Ana Lopez +1713555082${i}\nWhere: 12${i} Oak St, Katy\nIssue: no cooling`, { type: "owner_alert" });
  const ops = toOperator(since(n)), limit = send.OWNER_FALLBACK_HOURLY;
  assert.equal(typeof limit, "number"); assert.equal(ops.length, limit + 1, `expected ${limit} alerts plus one held-notice, got ${ops.length}`);
  assert.match(ops.at(-1).subject, /held this hour/);
  for (const e of ops) { assert.doesNotMatch(e.text, /\+?1?713\s*555\s*082\d|7135550820/, "customer phone reached the operator"); assert.doesNotMatch(e.text, /\d+ Oak St/, "street address reached the operator"); assert.doesNotMatch(e.subject + e.text, /Ana Lopez \+1/); }
  const held = (await eventsOf(c, "owner_alert_fallback")).filter(e => (e.data || e).operator === "rate_limited");
  assert.equal(held.length, 6 - limit - 1, "held alerts not logged");
});
await check("P1", "L14", "Rev 2: when the operator email fails too, the fallback is still recorded (operator: failed)", async () => {
  const c = await shop({ ownerEmail: "" }); emailFail = () => true;
  try { await send.notifyOwner(c, "VIP text from +17135550340: call me", { type: "owner_note" }); } finally { emailFail = () => false; }
  assert.ok((await eventsOf(c, "owner_alert_fallback")).some(e => (e.data || e).operator === "failed"), "no failed fallback event");
});

await check("P1", "L15", "Rev 2: when only the operator was emailed, the AI tool result never says the owner was sent a text or an email", async () => {
  const c = await shop({ ownerEmail: "" }), desk = await import(fn("lib/desk.mjs")), n = requests.length;
  const lead = await desk.flagLead(c, { customer_name: "Ana", phone: "+17135550350", issue: "AC out", reason: "lead", urgency: "today", wanted: "", language: "en", unsure: "", nobook_reason: "none" }, { channel: "web", contact: "+17135550350" });
  assert.equal(toOperator(since(n)).length, 1, "operator fallback missing"); const note = desk.deliveryNote(c, lead);
  assert.doesNotMatch(note, /was sent (?:a text|an email)/, note); assert.match(note, /could not be alerted/, note);
});

// ---------------- P3: no VIP voicemail recording ----------------
const vipShop = (opts = {}) => shop({ approved: true, bypass: ["+17135550401"], ...opts });
await check("P3", "V1", "A VIP call rings the owner's cell with a Dial action and records nothing", async () => {
  const c = await vipShop(), body = await (await voiceHandler(form("/api/voice", { To: c.phone.twilioNumber, From: "+17135550401" }))).text();
  assert.doesNotMatch(body, /<Record/i); assert.match(body, /<Dial[^>]*action="[^"]*\/api\/voice\/vip-missed"/);
});
await check("P3", "V2", "An unanswered VIP call: no recording, a hand-off lead is saved, the caller is texted and told only what happened", async () => {
  const c = await vipShop(), n = requests.length;
  const body = await (await voiceHandler(form("/api/voice/vip-missed", { To: c.phone.twilioNumber, From: "+17135550401", DialCallStatus: "no-answer" }))).text();
  assert.doesNotMatch(body, /<Record/i); assert.doesNotMatch(body, /after the tone|will call you back/i);
  const leads = await store.listJSON("leads", c.slug + "/", 20);
  assert.ok(leads.some(l => l.reason === "handoff" && l.status === "open" && l.phone === "+17135550401"), "no open hand-off lead");
  const sent = texts(since(n)).filter(t => t.params.To === "+17135550401");
  if (sent.length) assert.match(body, /sent you a text/i); else assert.doesNotMatch(body, /text/i);
});
await check("P3", "V3", "A VIP call when the owner's cell is the forwarded line: no recording, lead saved", async () => {
  const c = await vipShop({ forwardedLine: true }), body = await (await voiceHandler(form("/api/voice", { To: c.phone.twilioNumber, From: "+17135550401" }))).text();
  assert.doesNotMatch(body, /<Record/i);
  assert.ok((await store.listJSON("leads", c.slug + "/", 20)).some(l => l.reason === "handoff"), "no lead");
});
await check("P3", "V4", "The /api/voice/recorded route is gone and an answered VIP call simply ends", async () => {
  assert.ok(!JSON.stringify(voiceMod.config.path).includes("/recorded"), "recording callback route still registered");
  const c = await vipShop(), body = await (await voiceHandler(form("/api/voice/vip-missed", { To: c.phone.twilioNumber, From: "+17135550401", DialCallStatus: "completed" }))).text();
  assert.match(body, /<Hangup\/>/); assert.doesNotMatch(body, /<Say|<Record/i);
});

await check("P3", "V5", "Rev 2 (QA Q5): a VIP caller is not told the owner 'has been told' when only the operator was emailed", async () => {
  const c = await vipShop({ approved: false, ownerEmail: "" }), n = requests.length;
  const body = await (await voiceHandler(form("/api/voice/vip-missed", { To: c.phone.twilioNumber, From: "+17135550401", DialCallStatus: "no-answer" }))).text();
  assert.equal(toOperator(since(n)).length, 1, "operator fallback missing"); assert.doesNotMatch(body, /has been told/i);
  const lead = (await store.listJSON("leads", c.slug + "/", 20)).find(l => l.reason === "handoff"); assert.equal(lead?.ownerAlerted, false, "lead claims the owner was alerted");
});

// ---------------- P6: automated disclosure ----------------
const AUTO = /automated front desk assistant/;
await check("P6", "G1", "Legacy assistant greeting names the business and says it is automated (Spanish shops add Spanish)", async () => {
  const { standardGreeting } = await import(fn("lib/vapi.mjs"));
  const en = await shop({ name: "Katy Pipeworks" }), es = await shop({ name: "Westheimer Maids", spanish: true });
  assert.match(standardGreeting(en), /Katy Pipeworks's automated front desk assistant/);
  assert.match(standardGreeting(es), AUTO); assert.match(standardGreeting(es), /asistente automatizado/);
});
await check("P6", "G2", "Assistant-request overrides (known caller and VIP) say it is automated", async () => {
  const c = await shop({ forwardedLine: true, bypass: ["+17135550501"] });
  const call = async from => (await (await vapiHandler(new Request(SITE + "/api/vapi", { method: "POST", headers: { "content-type": "application/json", "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET }, body: JSON.stringify({ message: { type: "assistant-request", assistant: { metadata: { slug: c.slug } }, customer: { number: from }, call: { id: "call-" + from } } }) }))).json());
  const vip = await call("+17135550501"), plain = await call("+17135550502");
  assert.match(vip.assistantOverrides?.firstMessage || "", AUTO); assert.doesNotMatch(vip.assistantOverrides.firstMessage, /after the tone/);
  assert.match(plain.assistantOverrides?.firstMessage || "", AUTO);
});
await check("P6", "G3", "Managed assistant body greets as automated; the prompt tells the model how to answer 'are you real'", async () => {
  const { managedAssistantBody } = await import(fn("lib/voice-provider.mjs")); const { buildSystemPrompt } = await import(fn("lib/config.mjs"));
  const c = await shop({ spanish: true }), body = managedAssistantBody(c, { correlationId: "x", inputRevision: "r", policy: { model: "m", maxDurationSeconds: 300 }, site: SITE });
  assert.match(body.firstMessage, AUTO); assert.match(body.firstMessage, /asistente automatizado/);
  assert.match(buildSystemPrompt(c, "voice"), /automated front desk assistant/); assert.match(buildSystemPrompt(c, "voice"), /asistente automatizado/);
});
await check("P6", "G4", "Legacy SMS: the first front-desk reply says it is automated; the next reply does not repeat it", async () => {
  const c = await shop({ approved: true, name: "Bayou Air" }), from = "+17135550503", bg = (await import(fn("sms-agent-background.mjs"))).default;
  const run = async text => { const conv = await store.getConversation(c, "sms", from); conv.messages.push({ role: "user", content: text, at: new Date().toISOString() }); await store.saveConversation(conv); await bg(new Request(SITE + "/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": process.env.ADMIN_KEY, "content-type": "application/json" }, body: JSON.stringify({ slug: c.slug, from }) })); };
  const n = requests.length; await run("My AC is out, can someone come tomorrow?"); const first = texts(since(n)).filter(t => t.params.To === from).pop();
  const m = requests.length; await run("Tuesday works"); const second = texts(since(m)).filter(t => t.params.To === from).pop();
  assert.ok(first && second, "replies not sent");
  assert.match(first.params.Body, /^Automated assistant for Bayou Air\.\n/); assert.doesNotMatch(second.params.Body, /^Automated assistant/);
});
await check("P6", "G5", "Managed SMS: first-reply disclosure helper, English and Spanish, wired into every queued reply", async () => {
  const d = await import(fn("lib/automated-disclosure.mjs")), c = { business: { name: "Bayou Air" } };
  assert.equal(d.withAutomatedIntro(c, "Hi", { first: true }), "Automated assistant for Bayou Air.\nHi");
  assert.equal(d.withAutomatedIntro(c, "Hola", { first: true, language: "es" }), "Asistente automatizado de Bayou Air.\nHola");
  assert.equal(d.withAutomatedIntro(c, "Hi", { first: false }), "Hi");
  assert.ok(d.looksSpanish("Hola, necesito una cita") && !d.looksSpanish("My AC is out"));
  const t = src("netlify/functions/lib/managed-sms.mjs");
  assert.equal((t.match(/reply=disclose\(/g) || []).length, 2, "the AI reply and the limit reply are not both disclosed where they are saved");
});
// GSM-7 segment arithmetic for the cost note.
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà", EXT = "^{}\\[~]|€";
export function segments(text) { const chars = [...text]; const gsm = chars.every(ch => GSM.includes(ch) || EXT.includes(ch)); if (gsm) { const units = chars.reduce((s, ch) => s + (EXT.includes(ch) ? 2 : 1), 0); return { encoding: "GSM-7", units, segments: units <= 160 ? 1 : Math.ceil(units / 153) }; } const units = chars.reduce((s, ch) => s + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0); return { encoding: "UCS-2", units, segments: units <= 70 ? 1 : Math.ceil(units / 67) }; }
const costRows = [];
await check("P6", "G6", "SMS cost: both intros are GSM-7 and add at most one segment to a first reply", async () => {
  const d = await import(fn("lib/automated-disclosure.mjs")), c = { business: { name: "Westheimer Maids" } };
  for (const lang of ["en", "es"]) assert.equal(segments(d.automatedSMSIntro(c, lang)).encoding, "GSM-7", lang + " intro is not GSM-7");
  const samples = [["en", "Thanks! What is the address, and is anyone home now?"], ["en", "Got it. I can book Tuesday 8 to 12 or 12 to 5. Which works? If anyone smells gas, leave the house and call 911 from outside."], ["es", "Gracias. ¿Cuál es la dirección?"], ["es", "Entendido. Tenemos el martes de 8 a 12 o de 12 a 5. ¿Cuál le conviene?"], ["en", "x".repeat(150)]];
  for (const [lang, reply] of samples) { const before = segments(reply), after = segments(d.withAutomatedIntro(c, reply, { first: true, language: lang })); costRows.push({ lang, chars: reply.length, before, after, added: after.segments - before.segments }); assert.ok(after.segments - before.segments <= 1); assert.equal(after.encoding, before.encoding, "intro changed the encoding"); }
});

await check("P6", "G7", "Rev 2 (QA Q10): accented or curly-apostrophe shop names never add more than one segment (name left out of the intro)", async () => {
  const d = await import(fn("lib/automated-disclosure.mjs"));
  const names = ["Martínez Plumbing", "Joe’s A/C", "Peña & Sons", "Bayou Air", "Westheimer Maids", "Ñandú Cleaning"];
  const replies = [["en", "Thanks! What is the address?"], ["en", "y".repeat(101)], ["en", "z".repeat(150)], ["es", "Gracias. ¿Cuál es la dirección?"], ["es", "w".repeat(120)]];
  let worst = 0;
  for (const name of names) for (const [lang, reply] of replies) {
    const c = { business: { name } }, intro = d.automatedSMSIntro(c, lang); assert.equal(segments(intro).encoding, "GSM-7", `intro for ${name} is not GSM-7`);
    const added = segments(d.withAutomatedIntro(c, reply, { first: true, language: lang })).segments - segments(reply).segments; worst = Math.max(worst, added);
    costRows.push({ rev: 2, name, lang, chars: reply.length, added });
  }
  assert.ok(worst <= 1, "worst case " + worst);
  assert.equal(d.automatedSMSIntro({ business: { name: "Martínez Plumbing" } }), "Automated assistant.");
});
await check("P6", "G8", "Rev 2 (QA): managed SMS 'first reply' is the first disclosed reply, so a first CITAS does not skip it (runs the managed-sms-qa-check row)", async () => {
  const t = src("netlify/functions/lib/managed-sms.mjs"); assert.match(t, /firstReply=!history\?\.disclosedAt/, "first-reply rule is not disclosedAt");
  const run = spawnSync(process.execPath, ["scripts/managed-sms-qa-check.mjs"], { cwd: REPO, encoding: "utf8", timeout: 280000, env: { PATH: process.env.PATH, HOME: process.env.HOME || "", MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", MC_LOCAL_NO_KEYS: "1" } });
  const out = String(run.stdout || ""), row = /"name":"P6 rev 2: a first CITAS[^"]*","pass":(true|false)/.exec(out);
  assert.ok(row, "managed-sms-qa-check has no P6 rev 2 CITAS row (exit " + run.status + ")"); assert.equal(row[1], "true", "CITAS-first row failed");
});

// ---------------- P7: legacy Calendar scopes and plaintext tokens ----------------
await check("P7a", "C1", "Legacy calendar.events + calendar.readonly consent URL and code exchange are gone", async () => {
  const t = src("netlify/functions/lib/calendar.mjs"), mod = await import(fn("lib/calendar.mjs"));
  assert.doesNotMatch(t, /auth\/calendar\.readonly|auth\/calendar\.events[\s"]/); assert.equal(mod.authUrl, undefined); assert.equal(mod.exchangeCode, undefined);
  assert.doesNotMatch(src("product/SETUP-FOR-BROWSER-AGENT.md"), /add `https:\/\/www\.googleapis\.com\/auth\/calendar\.events` and `https:\/\/www\.googleapis\.com\/auth\/calendar\.readonly`/);
});
await check("P7b", "C2", "No booking path reads a plaintext refresh token; a legacy booking makes no Google request", async () => {
  const t = src("netlify/functions/lib/calendar.mjs").replace(/\/\/.*$/gm, ""); assert.doesNotMatch(t, /refreshToken|oauth2\.googleapis\.com/);
  const desk = await import(fn("lib/desk.mjs")), c = await shop(); c.calendar = { provider: "google", google: { refreshToken: "plaintext-legacy" } }; await store.saveClient(c);
  const n = requests.length; await desk.bookVisit(await store.getClient(c.slug), { customer_name: "Ana", phone: "+17135550601", address: "1 Main St", issue: "AC", urgency: "normal", date: "2026-11-20", window: (c.windows || ["8 to 12"])[0], notes: "" }, { channel: "web", contact: "+17135550601" }).catch(() => null);
  assert.equal(since(n).filter(r => r.kind === "google").length, 0, "plaintext token used against Google");
});

// ---------------- P9: opt-out by email, phone or own words ----------------
const intentMod = await import(fn("lib/optout-intent.mjs")).catch(() => null);
await check("P9", "O1", "Detector: plain-language opt-outs are 'certain'; booking language is never 'certain'", async () => {
  assert.ok(intentMod, "lib/optout-intent.mjs missing"); const d = intentMod.detectOptOutIntent;
  const yes = ["stop texting me i already booked", "Please stop sending me these texts.", "Don't text me, call me instead", "do not text this number again", "I don't want any more texts", "Thanks. No more texts please", "Unsubscribe me from these messages", "please opt me out of texts", "Remove me from your list please", "take my number off the list", "cancel the reminders please", "Dejen de mandarme mensajes", "No me manden más mensajes", "Ya no quiero recibir mensajes", "quiero darme de baja", "Stop messaging me!!"];
  const no = ["please cancel my visit", "Can I cancel my 3pm?", "I need to cancel", "cancelar la cita de mañana", "Can you stop by tomorrow?", "the leak won't stop", "end of the day works", "My heater quit working", "I quit smoking", "At the end of the driveway", "Temperatura baja", "Alto el agua", "Para mañana", "I got no more messages after Tuesday", "remove me from the schedule", "stop the leak please", "why did you stop texting me?", "I don't want you to stop texting me", "don't text me before 8am", "Text me when you are on the way", "please stop by after 5", "How do I opt out of the maintenance plan?", "I want to revoke my old review", "Cancel my appointment please", "Me pueden mandar un mensaje mañana?"];
  const miss = yes.filter(x => d(x)?.level !== "certain"), fp = no.filter(x => d(x)?.level === "certain");
  assert.deepEqual({ miss, fp }, { miss: [], fp: [] });
  assert.equal(d("How do I opt out of the maintenance plan?")?.level, "review");
});
await check("P9", "O2", "Managed line: 'Unsubscribe me from these messages' suppresses; 'please cancel my visit' does not", async () => {
  const mc = await import(fn("lib/managed-consent.mjs")), c = { slug: "managed-o2", onboarding: { version: 1 }, tenantId: "t-o2", business: { name: "X" } };
  const sid = () => "SM" + (++serial).toString(16).padStart(32, "0"), at = new Date().toISOString();
  const a = await mc.recordManagedInbound(c, { phone: "+17135550701", text: "please cancel my visit", messageSid: sid(), providerDate: at });
  const b = await mc.recordManagedInbound(c, { phone: "+17135550702", text: "Unsubscribe me from these messages", messageSid: sid(), providerDate: at });
  assert.equal(a.keyword, "message"); assert.equal(a.suppressed, false); assert.equal(b.keyword, "stop"); assert.equal(b.suppressed, true);
});
await check("P9", "O3", "Legacy line: an own-words opt-out is recorded and confirmed; a visit cancellation is not an opt-out", async () => {
  const c = await shop({ approved: true });
  const r1 = await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550703", Body: "Unsubscribe me from these messages" }))).text();
  assert.ok(await send.optedOut("+17135550703"), "not recorded"); assert.match(r1, /unsubscribed|no recibirá/);
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550704", Body: "please cancel my visit" }));
  assert.equal(await send.optedOut("+17135550704"), false, "visit cancellation treated as opt-out");
});
await check("P9", "O4", "Platform line: 'please stop texting me, thanks' is a STOP in the ledger", async () => {
  const platform = (await import(fn("platform-sms.mjs"))).default, from = "+17135550705", sid = "SM" + (++serial).toString(16).padStart(32, "0"), fields = { AccountSid: ACCOUNT, MessagingServiceSid: SERVICE, To: MC_NUMBER, From: from, MessageSid: sid, Body: "please stop texting me, thanks", NumMedia: "0" };
  receipts.set(sid, { sid, account_sid: ACCOUNT, messaging_service_sid: SERVICE, direction: "inbound", from, to: MC_NUMBER, body: fields.Body, date_created: new Date().toUTCString() });
  const signature = createHmac("sha1", SECRET).update(SITE + "/api/platform-sms" + Object.keys(fields).sort().map(k => k + fields[k]).join("")).digest("base64");
  const res = await platform(new Request(SITE + "/api/platform-sms", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature }, body: new URLSearchParams(fields).toString() }));
  assert.equal(res.status, 200); const ledger = await store.get("platform_sms_messages", "inbound_v1");
  assert.ok(Object.entries(ledger?.directives || {}).some(([k, v]) => k.endsWith("/" + from) && v.suppressed), "no STOP directive");
});
await check("P9", "O5", "Operator action: a phone opt-out received by email suppresses every store; an email opt-out suppresses marketing", async () => {
  const req = await import(fn("lib/optout-requests.mjs")).catch(() => null); assert.ok(req, "lib/optout-requests.mjs missing");
  const legacy = await shop({ approved: true }), mc = await import(fn("lib/managed-consent.mjs")), managed = { slug: "managed-o5", onboarding: { version: 1 }, tenantId: "t-o5", business: { name: "Y" } }, phone = "+17135550706";
  await mc.recordManagedInbound(managed, { phone, text: "hi", messageSid: "SM" + (++serial).toString(16).padStart(32, "0"), providerDate: new Date().toISOString() });
  await store.scheduleTask(legacy.slug, new Date(Date.now() + 3600e3).toISOString(), "reminder_24h", { bookingId: "b-o5" }); await store.put("bookings", legacy.slug + "/b-o5", { id: "b-o5", slug: legacy.slug, phone });
  const out = await req.applyOperatorOptOut("operator@example.test", { action: "apply_opt_out", contact: "(713) 555-0706", requestChannel: "email", reason: "Customer emailed support asking to stop texts" });
  assert.ok(await send.optedOut(phone), "legacy store not suppressed");
  assert.equal((await mc.managedSMSConsent(managed, phone)).suppressed, true, "managed row not suppressed");
  const ledger = await store.get("platform_sms_messages", "inbound_v1"); assert.ok(Object.entries(ledger?.directives || {}).some(([k, v]) => k.endsWith("/" + phone) && v.suppressed), "platform not suppressed");
  assert.equal(out.applied.tasksCancelled, 1, "queued reminder not cancelled");
  const n = requests.length; await send.sendSMS({ to: phone, client: legacy, body: "Reminder", type: "reminder_24h" }); assert.equal(texts(since(n)).length, 0, "still texted");
  const acc = await import(fn("lib/accounts.mjs")); await req.applyOperatorOptOut("operator@example.test", { action: "apply_opt_out", contact: "Prospect@Example.test", requestChannel: "phone_call", reason: "Asked by phone to stop marketing email" });
  assert.ok(await store.get("prospect_suppression", acc.accountKey("prospect@example.test")), "email not suppressed");
  const audit = await store.listJSON("optout_requests", "", 10); assert.ok(audit.length >= 2 && audit.every(a => !JSON.stringify(a).includes(phone) && a.actor), "audit missing or holds the raw phone");
  await assert.rejects(req.applyOperatorOptOut("operator@example.test", { action: "apply_opt_out", contact: "not a contact", requestChannel: "email", reason: "x y z" }));
  assert.match(src("netlify/functions/manage.mjs"), /apply_opt_out/, "operator route missing");
});
await check("P9", "O6", "Ambiguous opt-out wording is queued for operator review, not applied", async () => {
  const c = await shop({ approved: true }), from = "+17135550707";
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: "How do I opt out of the maintenance plan?", MessageSid: "SM" + "7".repeat(32) }));
  assert.equal(await send.optedOut(from), false, "ambiguous text applied as opt-out");
  const { optOutReviewView } = await import(fn("lib/optout-requests.mjs")); assert.ok((await optOutReviewView()).some(r => r.phone === from && r.state === "open"), "not queued for review");
});

await check("P9", "O7", "Rev 2 (QA Q7): 'cancel the reminders' stops texts but files no visit cancellation; a bare CANCEL still asks the owner", async () => {
  const c = await shop({ approved: true }), desk = await import(fn("lib/desk.mjs"));
  const book = async phone => { const id = "b" + phone.slice(-4); await store.put("bookings", c.slug + "/" + id, { id, slug: c.slug, phone, customer_name: "Ana", address: "1 Main St", date: "2099-01-05", window: "8 to 12", status: "booked", createdAt: new Date().toISOString() }); await store.addToIndex("bookings", c, phone, id); };
  await book("+17135550708"); await book("+17135550709");
  const r1 = await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550708", Body: "cancel the reminders" }))).text();
  assert.ok(await send.optedOut("+17135550708"), "not opted out"); assert.doesNotMatch(r1, /about your visit/);
  const after1 = (await eventsOf(c, "cancel_requested")).length; assert.equal(after1, 0, "visit cancellation filed for 'cancel the reminders'");
  assert.ok((await desk.upcomingBookings(c, "+17135550709")).length >= 1, "fixture booking not visible");
  const r2 = await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550709", Body: "CANCEL" }))).text();
  assert.ok(await send.optedOut("+17135550709")); assert.match(r2, /about your visit/, "bare CANCEL no longer asks the owner about the visit");
});
await check("P9", "O8", "Rev 2 (QA M8): apply_opt_out re-checks the operator session (a session revoked after requireOperator is refused and suppresses nothing)", async () => {
  process.env.ADMIN_EMAILS = "op-o8@example.test";
  const manage = (await import(fn("manage.mjs"))).default, access = await import(fn("lib/access.mjs")), token = createHash("sha256").update("o8-session").digest("hex"), key = access.accessHash(token);
  await store.put("access_sessions", key, { email: "op-o8@example.test", scope: "operator", status: "active", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString() });
  const call = async contact => (await manage(new Request(SITE + "/api/manage", { method: "POST", headers: { origin: SITE, "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ action: "apply_opt_out", contact, requestChannel: "email", reason: "emailed support" }) }), { ip: "192.0.2.8" })).status;
  // The session is revoked between the first check (requireOperator) and the action: every read after the first sees it revoked.
  const realGet = Map.prototype.get; let reads = 0;
  Map.prototype.get = function (k) { const v = realGet.call(this, k); if (k === key && v && typeof v.value === "string" && ++reads >= 2) return { ...v, value: JSON.stringify({ ...JSON.parse(v.value), status: "revoked" }) }; return v; };
  let raced; try { raced = await call("713-555-0710"); } finally { Map.prototype.get = realGet; }
  assert.equal(raced, 401, "a session revoked mid-request was accepted (" + raced + ")"); assert.equal(await send.optedOut("+17135550710"), false, "suppressed by a revoked session");
  assert.ok(reads >= 2, "the action did not re-read the session");
  assert.equal(await call("713-555-0711"), 200, "a current operator was refused"); assert.ok(await send.optedOut("+17135550711"));
  delete process.env.ADMIN_EMAILS;
});
await check("P9", "O9", "Rev 2: detector on QA's 137-message corpus plus the rev-2 held-out set: 0 false positives, every sentence-form opt-out certain", async () => {
  const corpus = JSON.parse(readFileSync(join(HERE, "legal-prereq/optout-corpus.json"), "utf8")), d = intentMod.detectOptOutIntent;
  const fp = corpus.N.filter(t => d(t)?.level === "certain"), miss = corpus.S_sentence.filter(t => d(t)?.level !== "certain");
  assert.deepEqual({ fp, miss }, { fp: [], miss: [] });
  assert.ok(corpus.N.length >= 100 && corpus.S_sentence.length >= 70, "corpus too small");
});
await check("P9", "O10", "Rev 2: the managed line treats a rev-2 recall phrase ('no más mensajes') as STOP and still not 'stop by tomorrow'", async () => {
  const mc = await import(fn("lib/managed-consent.mjs")), c = { slug: "managed-o10", onboarding: { version: 1 }, tenantId: "t-o10", business: { name: "Z" } }, at = new Date().toISOString(), sid = () => "SM" + (++serial).toString(16).padStart(32, "0");
  const a = await mc.recordManagedInbound(c, { phone: "+17135550712", text: "no más mensajes", messageSid: sid(), providerDate: at });
  const b = await mc.recordManagedInbound(c, { phone: "+17135550713", text: "Can you stop by tomorrow?", messageSid: sid(), providerDate: at });
  assert.equal(a.keyword, "stop"); assert.equal(a.suppressed, true); assert.equal(b.keyword, "message"); assert.equal(b.suppressed, false);
});

const lineRows = {};
await check("P9", "O11", "Rev 2: legacy line end to end (real sms.mjs) on the whole corpus: no non-opt-out is suppressed, every opt-out (sentence and bare keyword) is", async () => {
  const corpus = JSON.parse(readFileSync(join(HERE, "legal-prereq/optout-corpus.json"), "utf8")), c = await shop({ approved: true }); let k = 0;
  const run = async text => { const from = "+1832555" + String(1000 + ++k).padStart(4, "0"); await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: text, MessageSid: "SM" + createHash("sha256").update("o11" + k).digest("hex").slice(0, 32) })); return send.optedOut(from); };
  const fp = [], miss = [];
  for (const t of corpus.N) if (await run(t)) fp.push(t);
  for (const t of [...corpus.S_sentence, ...corpus.S_bare]) if (!(await run(t))) miss.push(t);
  lineRows.legacy = { N: corpus.N.length, S: corpus.S_sentence.length + corpus.S_bare.length, fp, miss };
  assert.deepEqual({ fp, miss }, { fp: [], miss: [] });
});
await check("P9", "O12", "Rev 2: managed line end to end (recordManagedInbound) on the whole corpus: no non-opt-out is suppressed, every opt-out is (bare BASTA goes to review)", async () => {
  const corpus = JSON.parse(readFileSync(join(HERE, "legal-prereq/optout-corpus.json"), "utf8")), mc = await import(fn("lib/managed-consent.mjs")), c = { slug: "managed-o12", onboarding: { version: 1 }, tenantId: "t-o12", business: { name: "M" } }; let k = 0;
  const run = async text => (await mc.recordManagedInbound(c, { phone: "+1832556" + String(1000 + ++k).padStart(4, "0"), text, messageSid: "SM" + createHash("sha256").update("o12" + k).digest("hex").slice(0, 32), providerDate: new Date().toISOString() })).suppressed;
  const fp = [], miss = [];
  for (const t of corpus.N) if (await run(t)) fp.push(t);
  for (const t of [...corpus.S_sentence, ...corpus.S_bare]) if (!(await run(t))) miss.push(t);
  lineRows.managed = { N: corpus.N.length, S: corpus.S_sentence.length + corpus.S_bare.length, fp, miss };
  // BASTA ("enough") is a legacy-list keyword only (sms.mjs STOP_RE); on the managed line it is queued for review, not applied.
  assert.deepEqual({ fp, miss }, { fp: [], miss: ["Basta"] }); assert.equal(intentMod.detectOptOutIntent("Basta")?.level, "review");
});

// ---------------- Census (read-only; P1/P3/P7 migration input) ----------------
await check("P3", "C3", "Rev 2 (QA): legacy-census counts a VIP recording older than the newest 2000 events and labels alert routing like notifyOwner", async () => {
  const slug = "census-old-rec"; await store.put("clients", slug, { slug, status: "live", business: { name: "Old" }, owner: { phone: "+17135550950" }, phone: { tenDlc: "approved" } });
  await store.put("events", slug + "/2026-01-01T00:00:00.000Z_old", { type: "vip_voicemail", data: { sid: "RE" + "c".repeat(32) } });
  for (let i = 0; i < 2050; i++) await store.put("events", `${slug}/2026-11-12T00:00:${String(i).padStart(5, "0")}_x`, { type: "sms_sent", data: {} });
  const logs = [], orig = console.log, argv = process.argv; console.log = (...a) => logs.push(a.join(" ")); process.argv = [argv[0], join(HERE, "legacy-census.mjs"), "--repo", REPO];
  try { await import(pathToFileURL(join(HERE, "legacy-census.mjs")).href + "?r2"); } finally { console.log = orig; process.argv = argv; }
  const row = JSON.parse(logs.join("\n")).rows.find(r => r.slug === slug);
  assert.equal(row?.vipRecordings, 1, "old recording not counted"); assert.equal(row.ownerAlertsAfterP1, "operator_email", "approved shop without own number/email mislabelled: " + row.ownerAlertsAfterP1);
});

const failed = results.filter(r => r.pass === false), passed = results.filter(r => r.pass === true);
const report = { repo: REPO, at: new Date().toISOString(), passed: passed.length, failed: failed.length, skipped: results.filter(r => r.skipped).length, blocked, providerRequests: requests.length, smsCost: costRows, optOutLines: lineRows, results };
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
for (const r of results) console.log(`${r.pass === null ? "SKIP" : r.pass ? "PASS" : "FAIL"} ${r.group} ${r.id} ${r.name}${r.error ? "\n     " + r.error : ""}`);
console.log(JSON.stringify({ passed: passed.length, failed: failed.length, skipped: report.skipped, blocked: blocked.length, providerRequestsIntercepted: requests.length }));
process.exit(failed.length || blocked.length ? 1 : 0);
