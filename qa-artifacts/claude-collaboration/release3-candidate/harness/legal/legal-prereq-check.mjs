// Offline check for legal-page publication preconditions P1, P3, P6, P7 and P9 (revision 2: adds the QA rows
// L11-L15, V5, G7-G8, O7-O12 and C3; revision 3 adds L16-L19 and G9; revision 4 adds L20, L22, O13 and replaces O2, O3, O7, O11, O12; revision 5 rewrites L22 and adds L23-L25, V6; base 43ee2f2c; P7b held; release 3 adds L26).
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
// Rev 3: P7b (plaintext Calendar sync removal) is held out of the set until the token census; --with-p7b runs its row.
const SKIP = new Set(String(arg("--skip", "")).split(",").filter(Boolean).concat(process.argv.includes("--with-p7b") ? [] : ["P7b"]));
const OUT = arg("--json");
const deny = () => { throw new Error("legal-prereq-check denies real networking"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();

const SITE = "https://machinesandcloud.com", ACCOUNT = "AC" + "1".repeat(32), SERVICE = "MG" + "2".repeat(32), MC_NUMBER = "+13464853328", SECRET = "fixture-legal-prereq-auth-token";
for (const key of Object.keys(process.env)) if (/^(TWILIO_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|MC_|STEVE_|ADMIN_|PHONE_|SERVICE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: SITE, PUBLIC_SITE_URL: SITE, ADMIN_KEY: "legal-prereq-admin", VAPI_WEBHOOK_SECRET: "legal-prereq-vapi",
  TWILIO_ACCOUNT_SID: ACCOUNT, TWILIO_AUTH_TOKEN: SECRET, MC_TWILIO_NUMBER: MC_NUMBER, MC_MESSAGING_SERVICE_SID: SERVICE, RESEND_API_KEY: "re_fixture_legal_prereq", STEVE_EMAIL: "operator@example.test", STEVE_PHONE: "+17135550999", GOOGLE_CLIENT_ID: "fixture-google", GOOGLE_CLIENT_SECRET: "fixture-google-secret" });

const requests = [], blocked = [], receipts = new Map();
// Rev 2: a Resend failure double. emailFail(to) === true answers 500 for that recipient.
let emailFail = () => false, twilioThrow = () => false; // rev 4: a network error on chosen Twilio sends
let serial = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = (init.method || "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  if (url.origin === "https://messaging.twilio.com") { const rec = { kind: "twilio", method, path: url.pathname, params: Object.fromEntries(new URLSearchParams(body)) }; requests.push(rec); return new Response(JSON.stringify({ sid: "QE" + (++serial).toString(16).padStart(32, "0"), campaign_status: "PENDING" }), { status: 201 }); }
  if (url.origin === "https://api.twilio.com") {
    if (twilioThrow(Object.fromEntries(new URLSearchParams(body)))) { requests.push({ kind: "twilio_throw" }); throw new TypeError("fetch failed (check double)"); }
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

const bgRun = async (c, from) => (await import(fn("sms-agent-background.mjs"))).default(new Request(SITE + "/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": process.env.ADMIN_KEY, "content-type": "application/json" }, body: JSON.stringify({ slug: c.slug, from }) }));
const lineRows = {};
const twMsg = x => ((x.match(/<Message>([\s\S]*?)<\/Message>/) || [])[1] || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
await check("P1", "L16", "Rev 4 (QA r2 B1, r3 B4): HELP/AYUDA to a shop without an approved sender gets the fixed TwiML help reply, is held and the owner is emailed", async () => {
  const c = await shop(), n = requests.length;
  const en = twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550360", Body: "HELP" }))).text());
  const es = twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550361", Body: "Ayuda" }))).text());
  assert.match(en, /Bayou Air: for help contact .+\. Reply STOP/, "no English help reply: " + en); assert.match(es, /para ayuda/, "no Spanish help reply: " + es);
  assert.equal(texts(since(n)).length, 0, "help went through the Messages API"); assert.equal(since(n).filter(r => r.kind === "background").length, 0, "help started the AI");
  assert.equal(emails(since(n)).filter(e => JSON.stringify(e.to).includes("owner@example.test") && /a request for help from \+17135550360/.test(e.text)).length, 1, "owner not told about the HELP");
  assert.equal((await store.getConversation(c, "sms", "+17135550360")).messages.at(-1)?.held, "help_no_registered_sender");
  await send.recordOptOut("+17135550362", c.slug, "STOP"); assert.equal(twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550362", Body: "HELP" }))).text()), "", "opted-out number got a help reply");
});
await check("P1", "L20", "Rev 4 (QA r3 B4): a VIP (always-ring-through) number texting HELP is relayed to the owner, as in production, not answered with the help text", async () => {
  const c = await shop({ approved: true, bypass: ["+17135550370"] }), n = requests.length;
  const tw = twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550370", Body: "HELP" }))).text());
  assert.equal(tw, "", "VIP HELP got the canned reply"); assert.ok(emails(since(n)).some(e => /VIP text from \+17135550370: HELP/.test(e.text)), "VIP HELP not relayed to the owner");
});
await check("P1", "L17", "Rev 3/4 (QA r2 B2, r3): a customer text to a shop without an approved sender is held, the owner is emailed at most once per customer per 4 h, no AI runs and nothing is shown as answered", async () => {
  const c = await shop(), from = "+17135550363", n = requests.length, sms = t => smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: t }));
  const body = await (await sms("My AC is out, can someone come tomorrow?")).text(); await sms("hello?"); await sms("anyone there?");
  assert.equal(twMsg(body), ""); assert.equal(since(n).filter(r => r.kind === "background").length, 0, "AI started"); assert.equal(texts(since(n)).length, 0);
  const notes = () => emails(since(n)).filter(e => JSON.stringify(e.to).includes("owner@example.test") && /was not answered/.test(e.text));
  assert.equal(notes().length, 1, "held emails not deduped: " + notes().length);
  const conv = await store.getConversation(c, "sms", from); assert.equal(conv.messages.filter(m => m.held === "no_registered_sender").length, 3, "a held text was not saved"); assert.equal(conv.messages.filter(m => m.role === "assistant").length, 0, "an assistant reply was recorded");
  const key = `${c.slug}/${from}`, row = await store.get("held_notices", key); await store.put("held_notices", key, { ...row, at: new Date(Date.now() - 5 * 3600e3).toISOString() });
  await sms("still waiting"); assert.equal(notes().length, 2, "no notice after the 4 h window"); assert.match(notes().at(-1).text, /2 more text\(s\) from them/);
  assert.ok((await eventsOf(c, "inbound_held")).length >= 4);
});
await check("P1", "L18", "Rev 3 (QA r2 B2): a background reply that sendSMS refuses is saved as undelivered and never logged as sms_reply", async () => {
  const c = await shop(), from = "+17135550364", conv = await store.getConversation(c, "sms", from);
  conv.messages.push({ role: "user", content: "Is Tuesday open?", at: new Date().toISOString() }); await store.saveConversation(conv); await bgRun(c, from);
  const last = (await store.getConversation(c, "sms", from)).messages.at(-1);
  assert.equal(last.role, "assistant"); assert.equal(last.undelivered, "no_registered_sender", JSON.stringify(last).slice(0, 200)); assert.ok(!last.disclosed, "undelivered reply counted as the disclosure");
  assert.equal((await eventsOf(c, "sms_reply")).length, 0, "logged as sent"); assert.equal((await eventsOf(c, "sms_reply_undelivered")).length, 1);
  // Once the shop's own number is approved, the first delivered reply still carries the intro (the undelivered one did not use it up).
  const ok = await store.getClient(c.slug); ok.phone = { ...ok.phone, tenDlc: "approved", messagingServiceSid: "MG" + "5".repeat(32) }; await store.saveClient(ok);
  const conv2 = await store.getConversation(ok, "sms", from); conv2.messages.push({ role: "user", content: "Hello again?", at: new Date().toISOString() }); await store.saveConversation(conv2);
  const n = requests.length; await bgRun(ok, from); const sent = texts(since(n)).filter(t => t.params.To === from).pop();
  assert.ok(sent, "no reply after approval"); assert.match(sent.params.Body, /^Automated assistant for /, "the undelivered reply used up the disclosure");
});
await check("P1", "L19", "Rev 3 (QA r2 B5): owner copy about texting is conditional on an approved sender (go-live and number emails, portal, operator Calendar alert)", async () => {
  const client = src("netlify/functions/client.mjs"), prov = src("netlify/functions/provision-background.mjs"), sched = src("netlify/functions/scheduler.mjs"), portal = src("desk.js");
  for (const [name, t, bad] of [["client.mjs", client, /Machines & Cloud's registered number|registered number with your shop's name/], ["provision-background.mjs", prov, /texts from our registered number/], ["scheduler.mjs", sched, /Bookings still reach the owner by text\.`/], ["desk.js", portal, /bookings are texted to you (?:meanwhile|either way)/]]) assert.doesNotMatch(t, bad, name + " still has unconditional texting copy");
  assert.match(client, /ownSenderApproved\(c\) \? "comes to this number"/); assert.match(prov, /ownSenderApproved\(c\)/); assert.match(sched, /ownSenderApproved\(c\) \? "Bookings still reach the owner by text and email\."/);
});

await check("P6", "L22", "Rev 5 (QA r4 B1): a send error saves the reply and rethrows; the retry resends the SAVED reply once, with no model rerun and no second booking", async () => {
  const c = await shop({ approved: true }), from = "+17135550380", n = requests.length; let throws = 0, failed = 0;
  twilioThrow = p => p.To === from && /are booked for/.test(p.Body || "") && throws++ === 0;
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: "Please book me tomorrow 8 to 12, I'm Ana Ruiz 713-555-0142 at 22 Elm St, AC out" }));
  try { await bgRun(c, from); } catch { failed++; } try { await bgRun(c, from); } catch { failed++; } twilioThrow = () => false;
  assert.equal(failed, 1, "the first try did not rethrow for a Netlify retry, or the retry threw");
  const sent = texts(since(n)).filter(t => t.params.To === from);
  assert.equal(sent.length, 1, "the customer did not get exactly one reply: " + sent.length); assert.match(sent[0].params.Body, /are booked for/);
  const asst = (await store.getConversation(c, "sms", from)).messages.filter(m => m.role === "assistant");
  assert.equal(asst.length, 1, "the model ran again on retry"); assert.ok(!asst[0].undelivered && /\[Done: visit booked/.test(asst[0].content), JSON.stringify(asst[0]).slice(0, 200));
  assert.equal((await eventsOf(c, "booking")).length, 1, "booked twice");
  assert.ok((await eventsOf(c, "sms_reply")).some(e => (e.data || e).resend === true), "no resend event");
});
await check("P6", "L23", "Rev 5 (QA r4 B1): a send error on every try gives exactly one owner alert after the last try, one booking and one saved reply", async () => {
  const c = await shop({ approved: true }), from = "+17135550381", n = requests.length; let failed = 0;
  twilioThrow = p => p.To === from;
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: "Please book me tomorrow 8 to 12, I'm Ana Ruiz 713-555-0143 at 22 Elm St, AC out" }));
  try { for (let k = 0; k < 3; k++) { try { await bgRun(c, from); } catch { failed++; } } } finally { twilioThrow = () => false; }
  assert.equal(failed, 2, "expected tries 1 and 2 to rethrow and the last to stop: " + failed);
  const alerts = emails(since(n)).filter(e => JSON.stringify(e.to).includes("owner@example.test") && /could not be sent/.test(e.text));
  assert.equal(alerts.length, 1, "owner alerts: " + alerts.length); assert.match(alerts[0].text, /after 3 tries/, "alert before the last try");
  const asst = (await store.getConversation(c, "sms", from)).messages.filter(m => m.role === "assistant");
  assert.equal(asst.length, 1, "duplicate saved replies"); assert.equal(asst[0].undelivered, "send_error_final");
  assert.equal((await eventsOf(c, "booking")).length, 1, "booked more than once");
  assert.equal(texts(since(n)).filter(t => t.params.To === from).length, 0);
});
await check("P1", "L24", "Rev 5 (PO a): HELP/INFO on an approved shop returns the campaign's registered HelpMessage exactly; new filings register and store it", async () => {
  const tw = await import(fn("lib/twilio.mjs")), c = await shop({ approved: true }), n = requests.length;
  const camp = await tw.createCampaign(c, "MG" + "6".repeat(32), "BN" + "6".repeat(32));
  const posted = since(n).find(r => r.kind === "twilio" && /Compliance\/Usa2p$/.test(r.path));
  assert.ok(posted, "campaign not filed through the double"); assert.equal(posted.params.HelpMessage, tw.legacyHelpMessage(c), "registered HelpMessage differs from the builder");
  assert.equal(camp.campaignHelpMessage, posted.params.HelpMessage, "registered HelpMessage not returned for storage");
  for (const word of ["HELP", "info"]) assert.equal(twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550390", Body: word }))).text()), tw.legacyHelpMessage(c), word + " reply is not the registered HelpMessage");
  const stored = await store.getClient(c.slug); stored.phone.campaignHelpMessage = "Bayou Air: registered help text as filed. Reply STOP to opt out."; await store.saveClient(stored);
  assert.equal(twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550391", Body: "HELP" }))).text()), stored.phone.campaignHelpMessage, "stored registered HelpMessage not used");
});

await check("P1", "L25", "Rev 5 (Spanish review r4): AYUDA is the Spanish translation of the registered HelpMessage, with 'al' before a number, 'escriba a' before an email and no English fallback", async () => {
  const tw = await import(fn("lib/twilio.mjs")), c = await shop({ approved: true });
  const es = twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550393", Body: "AYUDA" }))).text());
  assert.equal(es, tw.legacyHelpMessageEs(c)); assert.match(es, /llame o escriba al \+1713/); assert.match(es, /dejar de recibir mensajes/); assert.doesNotMatch(es, /the shop|Reply|help/i);
  assert.match(tw.legacyHelpMessageEs({ business: { name: "X" }, owner: { email: "a@b.test" } }), /para ayuda, escriba a a@b\.test\./);
  assert.match(tw.legacyHelpMessageEs({ business: { name: "X" } }), /para ayuda, contacte al negocio\./);
  const desk = await import(fn("lib/desk.mjs")); assert.match(desk.str("managed_help", { language: "es" })({ business: { name: "X" } }, "+17135550000"), /llame o escriba al \+17135550000\. .*dejar de recibir mensajes/);
});

// Release 3 (QA r5 non-blocking note): AYUDA names the contact that was filed with the campaign, the same one the English
// HelpMessage names, even after the shop's business number changes.
await check("P1", "L26", "Release 3: AYUDA names the same filed contact as the registered English HelpMessage after the business number changes", async () => {
  const tw = await import(fn("lib/twilio.mjs")), c = await shop({ approved: true }), filedNumber = c.phone.businessNumber;
  const camp = await tw.createCampaign(c, "MG" + "7".repeat(32), "BN" + "7".repeat(32));
  assert.equal(camp.campaignHelpContact, filedNumber, "filed contact not returned for storage");
  const stored = await store.getClient(c.slug); Object.assign(stored.phone, camp); stored.phone.businessNumber = "+17135558888"; await store.saveClient(stored);
  const en = twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550394", Body: "HELP" }))).text());
  const es = twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550395", Body: "AYUDA" }))).text());
  assert.equal(en, camp.campaignHelpMessage, "HELP is not the filed text"); assert.ok(en.includes(filedNumber), "HELP lost the filed contact");
  assert.ok(es.includes("llame o escriba al " + filedNumber), "AYUDA does not name the filed contact: " + es);
  assert.ok(!es.includes("+17135558888") && !en.includes("+17135558888"), "a reply names the current, unfiled number");
  // A filing stored before the contact field existed: the contact is read from the stored filed HelpMessage.
  const old = await store.getClient(c.slug); delete old.phone.campaignHelpContact; old.phone.campaignHelpMessage = tw.legacyHelpMessage(old, "+17135557777"); await store.saveClient(old);
  const es2 = twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550396", Body: "ayuda" }))).text());
  assert.ok(es2.includes("al +17135557777"), "AYUDA ignored the stored filed HelpMessage: " + es2);
  // Nothing filed yet: both replies use the same current contact (unchanged from rev 5).
  const none = await shop({ approved: true });
  assert.ok(tw.legacyHelpMessageEs(none).includes(none.phone.businessNumber) && tw.legacyHelpMessage(none).includes(none.phone.businessNumber));
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

await check("P3", "V6", "Rev 5 (Spanish review r4): on a Spanish-enabled shop the VIP missed-call text adds the reviewed Spanish line", async () => {
  const c = await vipShop({ spanish: true }), n = requests.length;
  await voiceHandler(form("/api/voice/vip-missed", { To: c.phone.twilioNumber, From: "+17135550401", DialCallStatus: "no-answer" }));
  const t = texts(since(n)).find(x => x.params.To === "+17135550401"); assert.ok(t, "no VIP text-back");
  assert.match(t.params.Body, /could not take your call/); assert.match(t.params.Body, /Dana no pudo contestar su llamada\. Responda a este mensaje y se lo pasamos a Dana\. Responda STOP o ALTO para dejar de recibir mensajes\./);
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

await check("P6", "G9", "Rev 3 (QA r2 B6): after a templated 'C' confirmation, the next AI reply still carries the automated intro (and the one after does not)", async () => {
  const c = await shop({ approved: true, name: "Bayou Air" }), from = "+17135550520", id = "bg9";
  await store.put("bookings", c.slug + "/" + id, { id, slug: c.slug, phone: from, customer_name: "Ana", address: "1 Main St", date: "2099-01-05", window: "8 to 12", status: "booked", createdAt: new Date().toISOString() }); await store.addToIndex("bookings", c, from, id);
  const fast = twMsg(await (await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: "C" }))).text()); assert.match(fast, /confirmed/, "fast path did not run: " + fast);
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: "Also can you check my water heater?" })); const n = requests.length; await bgRun(c, from);
  const first = texts(since(n)).filter(t => t.params.To === from).pop(); assert.ok(first, "no AI reply"); assert.match(first.params.Body, /^Automated assistant for Bayou Air\.\n/, "AI reply after the fast path is not disclosed");
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: "Thanks, Tuesday works" })); const m = requests.length; await bgRun(c, from);
  const second = texts(since(m)).filter(t => t.params.To === from).pop(); assert.ok(second); assert.doesNotMatch(second.params.Body, /^Automated assistant/, "repeated");
  const fastRow = (await store.getConversation(c, "sms", from)).messages.find(x => /confirmed/.test(String(x.content)) && x.role === "assistant"); assert.equal(fastRow?.system, "fast-confirm");
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
await check("P9", "O2", "Rev 4: a possible opt-out on a shop line suppresses nothing; it is queued for review and the owner is asked once per customer", async () => {
  const req = await import(fn("lib/optout-requests.mjs")), mc = await import(fn("lib/managed-consent.mjs")), n = requests.length;
  const c = { slug: "managed-o2", onboarding: { version: 1 }, tenantId: "t-o2", business: { name: "X" }, owner: { email: "owner-o2@example.test" } }, phone = "+17135550702";
  await mc.recordManagedInbound(c, { phone, text: "Unsubscribe me from these messages", messageSid: "SM" + (++serial).toString(16).padStart(32, "0"), providerDate: new Date().toISOString() });
  const a = await req.flagPossibleOptOut({ line: "managed", c, phone, text: "Unsubscribe me from these messages" }), b = await req.flagPossibleOptOut({ line: "managed", c, phone, text: "please stop texting me" });
  assert.equal(a?.ownerEmailed, true); assert.equal(b?.ownerEmailed, false, "owner emailed twice for one customer");
  assert.ok((await req.possibleOptOutFlags(c.slug)).some(f => f.phone === phone && f.count === 2), "no workspace flag");
  assert.equal(emails(since(n)).filter(e => JSON.stringify(e.to).includes("owner-o2@example.test") && /possible opt-out/.test(e.text)).length, 1);
  assert.equal(await req.flagPossibleOptOut({ line: "managed", c, phone: "+17135550703", text: "please cancel my visit" }), null, "booking language flagged");
  assert.ok((await req.optOutReviewView()).some(r => r.phone === phone && r.state === "open"), "not queued for review");
});
await check("P9", "O3", "Rev 4: legacy line keeps production's decision for 'Unsubscribe me from these messages' (not a production opt-out) and only flags it for review, once per customer", async () => {
  const c = await shop({ approved: true }), n = requests.length, from = "+17135550703";
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: "Unsubscribe me from these messages", MessageSid: "SM" + "3".repeat(32) }));
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body: "unsubscribe me please from these texts", MessageSid: "SM" + "4".repeat(32) }));
  assert.equal(await send.optedOut(from), false, "the detector suppressed (production does not)");
  assert.equal(emails(since(n)).filter(e => /possible opt-out from \+17135550703/.test(e.text)).length, 1, "owner flag email missing or not deduped");
  assert.equal(texts(since(n)).filter(t => /possible opt-out/.test(t.params.Body || "")).length, 0, "the possible opt-out notice was texted");
  assert.ok((await (await import(fn("lib/optout-requests.mjs"))).possibleOptOutFlags(c.slug)).some(f => f.phone === from), "no workspace flag for the portal");
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550704", Body: "please stop texting me" })); assert.ok(await send.optedOut("+17135550704"), "production phrase opt-out lost");
  assert.equal(emails(since(n)).filter(e => /possible opt-out from \+17135550704/.test(e.text)).length, 0, "an applied opt-out was also flagged");
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

await check("P9", "O7", "Rev 4: 'cancel the reminders' keeps production's decision (no opt-out, no visit cancellation) and is flagged; a bare CANCEL still asks the owner", async () => {
  const c = await shop({ approved: true }), desk = await import(fn("lib/desk.mjs")), n = requests.length;
  const book = async phone => { const id = "b" + phone.slice(-4); await store.put("bookings", c.slug + "/" + id, { id, slug: c.slug, phone, customer_name: "Ana", address: "1 Main St", date: "2099-01-05", window: "8 to 12", status: "booked", createdAt: new Date().toISOString() }); await store.addToIndex("bookings", c, phone, id); };
  await book("+17135550708"); await book("+17135550709");
  await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: "+17135550708", Body: "cancel the reminders" }));
  assert.equal(await send.optedOut("+17135550708"), false); assert.equal((await eventsOf(c, "cancel_requested")).length, 0, "visit cancellation filed");
  assert.ok(emails(since(n)).some(e => /possible opt-out from \+17135550708/.test(e.text)), "not flagged");
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
  const corpus = JSON.parse(readFileSync(join(HERE, "r2/optout-corpus.json"), "utf8")), d = intentMod.detectOptOutIntent;
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

await check("P9", "O13", "Rev 4: auto-opt-out decisions on the legacy, managed and platform lines are byte-identical to unpatched 43ee2f2c for every message in the r2, r3 and own corpora", async () => {
  const run = spawnSync(process.execPath, [join(HERE, "r2/optout-parity.mjs"), "--repo", REPO, "--out", "/dev/stdout"], { cwd: REPO, encoding: "utf8", timeout: 280000, maxBuffer: 64e6, env: { PATH: process.env.PATH, HOME: process.env.HOME || "", MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", MC_LOCAL_NO_KEYS: "1" } });
  const golden = readFileSync(join(HERE, "r2/optout-decisions-43ee2f2c.json"), "utf8"), got = String(run.stdout || "").slice(0, golden.length);
  if (got !== golden) { const g = JSON.parse(golden); let o = {}; try { o = JSON.parse(got); } catch {} const diff = []; for (const line of ["legacy", "managed", "platform"]) for (const t of Object.keys(g[line])) if (JSON.stringify(g[line][t]) !== JSON.stringify(o[line]?.[t])) diff.push(line + ": " + t); assert.fail(`decisions differ from 43ee2f2c (exit ${run.status}): ${diff.slice(0, 8).join(" | ") || String(run.stderr).slice(0, 200)}`); }
  lineRows.texts = JSON.parse(golden).texts;
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
