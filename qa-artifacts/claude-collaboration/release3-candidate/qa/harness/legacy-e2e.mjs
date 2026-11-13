// r3 QA: controllable clock installed before any module loads.
const RealDate = Date; let shift = 0; const realNow = () => RealDate.now();
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [RealDate.now() + shift])); } static now() { return RealDate.now() + shift; } };
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

// ================= r3 QA legacy end-to-end matrix (appended to the legal harness setup) =================
const desk = await import(fn("lib/desk.mjs"));
const sched = await import(fn("scheduler.mjs"));
const bg = (await import(fn("sms-agent-background.mjs"))).default;
const bgRun = (c, from) => bg(new Request(SITE + "/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": process.env.ADMIN_KEY, "content-type": "application/json" }, body: JSON.stringify({ slug: c.slug, from }) }));
const sms = async (c, from, Body, extra = {}) => { const r = await smsHandler(form("/api/sms", { To: c.phone.twilioNumber, From: from, Body, MessageSid: "SM" + createHash("sha1").update(from + Body + Math.random()).digest("hex").slice(0, 32), ...extra })); return (await r.text()).replace(/<[^>]+>/g, "").trim(); };
const voice = async (c, from, path = "/api/voice", extra = {}) => (await (await voiceHandler(form(path, { To: c.phone.twilioNumber, From: from, CallSid: "CA" + "9".repeat(32), ...extra }))).text());
const ownerSignal = (list, c) => emails(list).some(e => JSON.stringify(e.to).includes(c.owner.email || "@@none")) || texts(list).some(t => t.params.To === c.owner.phone) || toOperator(list).length > 0;
const custTexts = (list, phone) => texts(list).filter(t => t.params.To === phone);
const fromMC = list => texts(list).filter(t => t.params.From === MC_NUMBER || t.params.MessagingServiceSid === SERVICE);
const matrix = [];
async function row(kind, name, fn2) { const n = requests.length; let note = "", pass = true, err = ""; try { note = await fn2(n) || ""; } catch (e) { pass = false; err = String(e?.message || e).slice(0, 300); } const list = since(n); matrix.push({ kind, name, pass, err, note, custTexts: texts(list).filter(t => !Object.values({}).includes(t)).length, mcSender: fromMC(list).length, emails: emails(list).length }); }
const day = (offset) => { const d = new Date(Date.now() + offset * 86400e3); return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); };
for (const approved of [true, false]) {
  const kind = approved ? "legacy-approved" : "legacy-no-sender";
  const c0 = await shop({ approved, bypass: ["+17135550888"], name: approved ? "Approved Air" : "Pending Air" });
  const cust = approved ? "+17135550701" : "+17135550702";
  let b;
  await row(kind, "booking (web) + owner alert", async n => {
    const c = await store.getClient(c0.slug); b = await desk.bookVisit(c, { customer_name: "Ana", phone: cust, address: "1 Main St", issue: "AC out", urgency: "normal", date: day(3), window: (c.windows || ["8 to 12"])[0], notes: "" }, { channel: "web", contact: cust });
    const l = since(n), ct = custTexts(l, cust);
    assert.ok(b?.id, "no booking"); assert.equal(fromMC(l).length, 0, "shared sender used");
    if (approved) { assert.equal(ct.length, 1, "confirmation count " + ct.length); assert.equal(ct[0].params.MessagingServiceSid || ct[0].params.From, c.phone.messagingServiceSid || c.phone.twilioNumber); }
    else { assert.equal(ct.length, 0, "texted without sender"); const rec = await store.getRecord("bookings", c.slug, b.id); assert.ok(rec.textsHeld, "textsHeld not set"); const owner = emails(l).find(e => JSON.stringify(e.to).includes(c.owner.email)); assert.ok(owner && /confirmation text was not sent/.test(owner.text), "owner email does not say the confirmation was not sent: " + owner?.text?.slice(0, 200)); }
    assert.ok(ownerSignal(l, c), "no owner signal");
    const ev = await eventsOf(c, "sms_sent"); assert.ok(ev.every(e => e.data?.ok === true), "sms_sent with ok!==true: " + JSON.stringify(ev.filter(e => e.data?.ok !== true).map(e => e.data).slice(0, 3)));
    return `customer texts=${ct.length}`;
  });
  await row(kind, "customer replies C", async n => {
    const c = await store.getClient(c0.slug), out = await sms(c, cust, "C"), l = since(n), rec = await store.getRecord("bookings", c.slug, b.id);
    if (approved) { assert.match(out, /confirmed for/); assert.ok(rec.confirmedAt || rec.status === "confirmed", "not confirmed"); }
    else { assert.equal(out, "", "TwiML reply from an unapproved shop"); assert.ok(ownerSignal(l, c), "held C: no owner signal"); }
    return `twiml="${out.slice(0, 60)}"`;
  });
  await row(kind, "reminder_24h at its due time", async n => {
    const c = await store.getClient(c0.slug), tasks = (await store.listJSON("tasks", "", Infinity)).filter(t => t.slug === c.slug && t.data?.bookingId === b.id && t.type === "reminder_24h");
    if (!approved) { assert.equal(tasks.length, 0, "reminders scheduled without a sender"); return "no reminder tasks (texts held at booking)"; }
    assert.equal(tasks.length, 1, "reminder_24h task count " + tasks.length);
    const due = Date.parse(tasks[0].dueAt); const save = shift; shift = due + 60e3 - realNow(); try { await sched.run({}); await sched.run({}); } finally { shift = save; }
    const ct = custTexts(since(n), cust).filter(t => /Reminder from/.test(t.params.Body)); assert.equal(ct.length, 1, "reminder sent " + ct.length + " times");
    return "1 reminder";
  });
  await row(kind, "owner reschedule (rescheduleVisit)", async n => {
    const c = await store.getClient(c0.slug), rec = await store.getRecord("bookings", c.slug, b.id), r = await desk.rescheduleVisit(c, rec, day(4), rec.window);
    assert.ok(!r.full, "reschedule refused"); const l = since(n);
    assert.equal(fromMC(l).length, 0); assert.ok(ownerSignal(l, c), "no owner signal on reschedule");
    const tasks = (await store.listJSON("tasks", "", Infinity)).filter(t => t.slug === c.slug && t.data?.bookingId === b.id && /reminder/.test(t.type));
    if (!approved) assert.equal(tasks.length, 0, "reminders re-armed on a held booking");
    return `customer texts=${custTexts(l, cust).length}, reminder tasks=${tasks.length}`;
  });
  for (const [word, expect] of [["HELP", /help|ayuda/i], ["AYUDA", /ayuda/i], ["INFO", /help/i]]) await row(kind, word, async n => {
    const num = (approved ? "+1713555071" : "+1713555081") + ["HELP","AYUDA","INFO"].indexOf(word), c = await store.getClient(c0.slug), out = await sms(c, num, word), l = since(n);
    assert.match(out, expect, word + " reply: " + out); assert.equal(texts(l).length, 0, "HELP went through sendSMS");
    if (!approved) assert.ok(ownerSignal(l, c), "held HELP: no owner signal");
    return out.slice(0, 120);
  });
  const sp = approved ? "+17135550720" : "+17135550820";
  await row(kind, "STOP then repeat STOP", async n => {
    const c = await store.getClient(c0.slug), out = await sms(c, sp, "STOP"), again = await sms(c, sp, "STOP");
    assert.match(out, /unsubscribed/); assert.equal(again, "", "second confirmation"); assert.equal(await send.optOutStatus(sp), true);
    assert.ok(ownerSignal(since(n), c)); return out;
  });
  await row(kind, "HELP while opted out", async () => { const c = await store.getClient(c0.slug), out = await sms(c, sp, "HELP"); assert.equal(out, "", "HELP answered while opted out"); });
  await row(kind, "START", async () => { const c = await store.getClient(c0.slug), out = await sms(c, sp, "START"); assert.match(out, /subscribed again/); assert.equal(await send.optOutStatus(sp), false); return out; });
  await row(kind, "ALTO (Spanish stop)", async n => { const c = await store.getClient(c0.slug), alto = approved ? "+17135550721" : "+17135550821", out = await sms(c, alto, "ALTO"); assert.equal(await send.optOutStatus(alto), true, "ALTO did not opt out"); assert.match(out, /no recibir|ya no recibir/); return out; });
  await row(kind, "VIP text relayed", async n => { const c = await store.getClient(c0.slug), out = await sms(c, "+17135550888", "Call me about the job"), l = since(n); assert.equal(out, ""); assert.ok(ownerSignal(l, c), "VIP text not relayed"); assert.equal(fromMC(l).length, 0); if (!approved) assert.equal(texts(l).length, 0); return `owner texts=${texts(l).length} emails=${emails(l).length}`; });
  await row(kind, "VIP call not answered (vip-missed)", async n => {
    const c = await store.getClient(c0.slug), first = await voice(c, "+17135550888"), out = await voice(c, "+17135550888", "/api/voice/vip-missed", { DialCallStatus: "no-answer" }), l = since(n);
    assert.doesNotMatch(first + out, /<Record/i, "recording"); assert.match(first, /vip-missed/);
    const t = custTexts(l, "+17135550888"); if (approved) { assert.equal(t.length, 1); assert.match(out, /just sent you a text/); } else { assert.equal(t.length, 0); assert.doesNotMatch(out, /sent you a text/); }
    assert.ok(ownerSignal(l, c)); const leads = (await store.listJSON("leads", c.slug + "/", Infinity)).filter(x => x.phone === "+17135550888"); assert.equal(leads.length, 1);
    return out.replace(/<[^>]+>/g, " ").trim();
  });
  await row(kind, "missed call (non-VIP)", async n => {
    const c = await store.getClient(c0.slug), out = await voice(c, "+17135550730"), l = since(n), t = custTexts(l, "+17135550730");
    if (approved) { assert.equal(t.length, 1); assert.match(out, /texting you/); } else { assert.equal(t.length, 0); assert.doesNotMatch(out, /texting you/); }
    assert.ok(ownerSignal(l, c), "no owner signal on missed call"); assert.doesNotMatch(out, /<Record/i);
    return out.replace(/<[^>]+>/g, " ").trim().slice(0, 120);
  });
  await row(kind, "AI reply: first reply carries the automated intro once", async n => {
    const c = await store.getClient(c0.slug), from = "+17135550740";
    const o1 = await sms(c, from, "Do you fix water heaters?"), l1 = since(n);
    if (!approved) { assert.equal(o1, ""); assert.equal(l1.filter(r => r.kind === "background").length, 0, "AI started on a held shop"); assert.ok(ownerSignal(l1, c), "held text: no owner signal"); return "held, owner told"; }
    await bgRun(c, from); await sms(c, from, "How much is a tune-up?"); await bgRun(c, from);
    const t = custTexts(since(n), from); assert.equal(t.length, 2, "reply count " + t.length);
    assert.match(t[0].params.Body, /^Automated assistant/); assert.doesNotMatch(t[1].params.Body, /^Automated assistant/);
    return t.map(x => x.params.Body.split("\n")[0].slice(0, 50)).join(" | ");
  });
  if (approved) {
    await row(kind, "send error once, then retry (one delivered text, no duplicate)", async n => {
      const c = await store.getClient(c0.slug), from = "+17135550750"; await sms(c, from, "Can someone come Friday?");
      let k = 0; twilioThrow = p => p.To === from && k++ === 0; let threw = 0;
      try { try { await bgRun(c, from); } catch { threw++; } try { await bgRun(c, from); } catch { threw++; } } finally { twilioThrow = () => false; }
      const t = custTexts(since(n), from); assert.equal(threw, 1); assert.equal(t.length, 1, "delivered texts " + t.length);
      const conv = await store.getConversation(c, "sms", from), last = conv.messages.at(-1); assert.ok(!last.undelivered, "still undelivered"); assert.equal(conv.messages.filter(m => m.role === "assistant").length, 1, "duplicate assistant turn");
      const ev = await eventsOf(c, "sms_reply"); assert.ok(ev.length >= 1);
      return `threw=${threw}, delivered=${t.length}`;
    });
    await row(kind, "send error on all 3 tries -> one owner alert, nothing logged as sent", async n => {
      const c = await store.getClient(c0.slug), from = "+17135550751"; await sms(c, from, "Is anyone there?");
      twilioThrow = p => p.To === from; let threw = 0;
      try { for (let i = 0; i < 3; i++) { try { await bgRun(c, from); } catch { threw++; } } } finally { twilioThrow = () => false; }
      const l = since(n), owner = [...emails(l), ...texts(l)].filter(x => /could not be sent after/.test(x.text || x.params?.Body || ""));
      assert.equal(custTexts(l, from).length, 0); assert.equal(owner.length >= 1, true, "no owner alert"); assert.ok(owner.length <= 2, "owner alerted " + owner.length + " times");
      const conv = await store.getConversation(c, "sms", from); assert.equal(conv.messages.at(-1).undelivered, "send_error_final");
      const sent = (await eventsOf(c, "sms_reply")).filter(e => e.from === from); assert.equal(sent.length, 0, "logged sms_reply though nothing was sent");
      return `threw=${threw}, owner alerts=${owner.length} (text+email)`;
    });
  }
}
await row("all-legacy", "every sms_sent event matches a Twilio POST that returned 201; no sms_sent logged for refused/held/thrown sends; no shared-sender text", async () => {
  const all = (await store.listJSON("events", "", Infinity)).filter(e => e.type === "sms_sent"), posts = texts(requests);
  assert.ok(all.every(e => e.data?.ok === true && /^SM/.test(e.data?.sid || "")), "sms_sent without a provider sid: " + JSON.stringify(all.filter(e => !(e.data?.ok === true)).map(e => e.data).slice(0, 2)));
  const sids = new Set(all.map(e => e.data.sid)); assert.equal(sids.size, all.length, "duplicate sms_sent for one sid");
  assert.equal(fromMC(requests).length, 0, "shared M&C sender used");
  const byBody = {}; for (const t of posts) { const k = t.params.To + "|" + t.params.Body; byBody[k] = (byBody[k] || 0) + 1; }
  const dups = Object.entries(byBody).filter(([, v]) => v > 1); assert.equal(dups.length, 0, "duplicate texts: " + JSON.stringify(dups).slice(0, 300));
  return `sms_sent events=${all.length}, twilio message POSTs=${posts.length}`;
});
const fails = matrix.filter(r => !r.pass);
console.log(JSON.stringify({ blocked, matrix }, null, 1));
console.log(`legacy-e2e: ${matrix.length - fails.length}/${matrix.length}`);
const ownerMail = emails(requests).map(e => ({ to: e.to, subject: e.subject, text: e.text })); const ownerTexts = texts(requests).filter(t => t.params.To === '+17135550111').map(t => t.params.Body);
if (OUT) writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), repo: REPO, blocked, matrix, ownerMail, ownerTexts }, null, 1));
process.exit(fails.length || blocked.length ? 1 : 0);
