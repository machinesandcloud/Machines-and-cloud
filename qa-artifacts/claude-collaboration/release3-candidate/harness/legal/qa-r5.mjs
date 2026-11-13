// Independent QA r3 harness. Runs against one tree (--repo); compare base vs r3 outputs. Offline only:
// net/http/https throw, fetch is an in-process double (Twilio, Resend, site background), anything else is blocked.
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const REPO = resolve(arg("--repo")), OUT = arg("--out"), CORPUS = arg("--corpus");
const deny = () => { throw new Error("network denied"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const SITE = "https://site.invalid";
for (const k of Object.keys(process.env)) if (/^(TWILIO_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|MC_|STEVE_|ADMIN_|PHONE_|SERVICE_)/.test(k)) delete process.env[k];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: SITE, PUBLIC_SITE_URL: SITE, ADMIN_KEY: "qa-dummy-admin",
  TWILIO_ACCOUNT_SID: "AC" + "9".repeat(32), TWILIO_AUTH_TOKEN: "qa-dummy-token", MC_TWILIO_NUMBER: "+13465550000", MC_MESSAGING_SERVICE_SID: "MG" + "8".repeat(32),
  RESEND_API_KEY: "re_qa_dummy", STEVE_EMAIL: "operator@qa.invalid", STEVE_PHONE: "+17135550998" });
const reqs = [], other = []; let serial = 0; let twilioMode = "ok"; // ok | throw | 500
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), body = typeof init.body === "string" ? init.body : "";
  if (url.hostname === "api.twilio.com") {
    const p = Object.fromEntries(new URLSearchParams(body));
    if (twilioMode === "throw" || twilioMode === "throwReply" && /are booked for/.test(p.Body || "")) { reqs.push({ kind: "twilio_throw", p }); throw new TypeError("fetch failed (QA double)"); }
    if (twilioMode === "500") { reqs.push({ kind: "twilio_500", p }); return new Response(JSON.stringify({ code: 30034, message: "QA double error" }), { status: 400 }); }
    reqs.push({ kind: "twilio", path: url.pathname, p }); return new Response(JSON.stringify({ sid: "SM" + (++serial).toString(16).padStart(32, "0") }), { status: 201 });
  }
  if (url.hostname === "api.resend.com") { const j = JSON.parse(body || "{}"); reqs.push({ kind: "email", to: [].concat(j.to).join(","), subject: j.subject, text: j.text }); return new Response(JSON.stringify({ id: "em" + ++serial }), { status: 200 }); }
  if (url.origin === SITE) { reqs.push({ kind: "bg", body }); return new Response("ok"); }
  other.push(url.origin); throw new Error("blocked");
};
const fn = (r) => pathToFileURL(join(REPO, "netlify/functions", r)).href;
const store = await import(fn("lib/store.mjs"));
const { newClient } = await import(fn("lib/config.mjs"));
const send = await import(fn("lib/send.mjs"));
const desk = await import(fn("lib/desk.mjs"));
const sms = (await import(fn("sms.mjs"))).default;
const bg = (await import(fn("sms-agent-background.mjs"))).default;
const sched = await import(fn("scheduler.mjs"));
let mcons = null; try { mcons = await import(fn("lib/managed-consent.mjs")); } catch {}
let detector = null; try { detector = await import(fn("lib/optout-intent.mjs")); } catch {}
const out = { repo: REPO.split("/").pop() };
let n = 0, ph = 0;
const nextPhone = () => "+1832556" + String(1000 + ++ph);
const sid = () => "SM" + (++serial).toString(16).padStart(32, "0");
async function shop({ approved = true, ownerEmail = "owner@qa.invalid", ownerPhone = "+17135550111", name = "Bayou Air", bypass } = {}) {
  const i = ++n, slug = "q3-" + i;
  const c = newClient({ slug, ownerKey: "k" + i, owner: { name: "Dana", email: ownerEmail, phone: ownerPhone }, business: { name, trade: "HVAC", hours: "Mon-Fri 7am-7pm", website: "https://example.invalid" } });
  c.status = "live";
  c.phone = { ...(c.phone || {}), twilioNumber: "+1281556" + String(1000 + i), tenDlc: approved ? "approved" : "brand_pending", messagingServiceSid: approved ? "MG" + "3".repeat(32) : "", businessNumber: "+17135558" + String(100 + i), forwarding: "busy" };
  if (bypass) c.rules = { ...(c.rules || {}), bypass };
  if (!ownerEmail) delete c.owner.email; if (!ownerPhone) delete c.owner.phone;
  await store.saveClient(c); await store.indexClient(c); return store.getClient(slug);
}
const form = (f) => new Request(SITE + "/api/sms", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-admin-key": process.env.ADMIN_KEY }, body: new URLSearchParams({ MessageSid: sid(), ...f }).toString() });
const runBg = (c, from) => bg(new Request(SITE + "/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": process.env.ADMIN_KEY, "content-type": "application/json" }, body: JSON.stringify({ slug: c.slug, from }) }));
const msgText = (x) => ((x.match(/<Message>([\s\S]*?)<\/Message>/) || [])[1] || "").replace(/&amp;/g, "&");
const texts = (l) => l.filter((r) => r.kind === "twilio" && /Messages\.json$/.test(r.path));
const events = async (c, t) => (await store.listJSON("events", c.slug + "/", Infinity)).filter((e) => !t || e.type === t);
const evTypes = async (c) => (await events(c)).map((e) => e.type + (e.data?.reason ? ":" + e.data.reason : "")).sort();
// one inbound text, plus the background agent if the webhook started it
async function inbound(c, from, body, extra = {}) {
  const k = reqs.length; const res = await sms(form({ To: c.phone.twilioNumber, From: from, Body: body, ...extra })); const tw = await res.text();
  let bgRan = false; if (reqs.slice(k).some((r) => r.kind === "bg")) { bgRan = true; try { await runBg(c, from); } catch (e) { out.bgThrows = (out.bgThrows || []).concat(String(e.message).slice(0, 100)); } }
  const l = reqs.slice(k);
  return { status: res.status, twiml: msgText(tw), bgRan, customerTexts: texts(l).filter((t) => t.p.To === from).map((t) => t.p.Body), ownerTexts: texts(l).filter((t) => t.p.To === c.owner?.phone).length, ownerEmails: l.filter((x) => x.kind === "email" && x.to.includes("owner@")).length, operatorEmails: l.filter((x) => x.kind === "email" && x.to.includes("operator@")).length };
}

// ---------- A. fresh opt-out corpus (not in r2/optout-corpus.json nor QA r2's lists) ----------
const FRESH = JSON.parse(readFileSync(CORPUS, "utf8"));
out.fresh = { S: {}, N: {} };
const legacy = await shop({ approved: true });
const mshop = await shop({ approved: true }); mshop.onboarding = { version: 1 };
for (const kind of ["S", "N"]) for (const t of FRESH[kind]) {
  const from = nextPhone(); const k = reqs.length;
  const res = await (await sms(form({ To: legacy.phone.twilioNumber, From: from, Body: t }))).text();
  const lo = reqs.slice(k); const row = { detector: detector ? (detector.detectOptOutIntent(t)?.level || "none") : "n/a", legacySuppressed: await send.optedOut(from), legacyReply: msgText(res).slice(0, 80), ownerNotices: lo.filter((x) => x.kind === "email" && x.to.includes("owner@") || x.kind === "twilio" && x.p.To === legacy.owner.phone).length, ownerNoticeSubjects: lo.filter((x) => x.kind === "email").map((x) => (x.subject || "").slice(0, 70)) };
  if (mcons?.recordManagedInbound) { try { const r = await mcons.recordManagedInbound(mshop, { phone: nextPhone(), text: t, messageSid: sid(), providerDate: new Date().toISOString() }); row.managedSuppressed = !!r.suppressed; } catch (e) { row.managedError = String(e.message).slice(0, 80); } }
  out.fresh[kind][t] = row;
}
{ const from = nextPhone(); const k = reqs.length; await sms(form({ To: legacy.phone.twilioNumber, From: from, Body: "unsubscribe? what is this" })); await sms(form({ To: legacy.phone.twilioNumber, From: from, Body: "remove me? from what" })); out.flagDedupe = { ownerEmails: reqs.slice(k).filter((x) => x.kind === "email").length, ownerTexts: reqs.slice(k).filter((x) => x.kind === "twilio" && x.p.To === legacy.owner.phone).length }; }
// ---------- B. HELP ----------
out.help = {};
for (const approved of [false, true]) {
  const c = await shop({ approved, bypass: ["+18325559999"] });
  for (const b of ["HELP", "help!", "Info", "AYUDA", "ayuda.", "Ayuda por favor", "HELP my pipe burst", "Help!!! water everywhere"]) {
    const from = nextPhone(); const r = await inbound(c, from, b);
    const conv = await store.getConversation(c, "sms", from);
    out.help[(approved ? "approved" : "unapproved") + " | " + b] = { ...r, savedMessages: conv.messages.length, events: (await events(c)).filter((e) => e.data?.from === from).map((e) => e.type + (e.data?.reason ? ":" + e.data.reason : "")) };
  }
  // VIP (always-ring-through) number texting HELP: base relays to owner
  out.help[(approved ? "approved" : "unapproved") + " | VIP HELP"] = await inbound(c, "+18325559999", "HELP");
  // opted-out number texting HELP
  const f2 = nextPhone(); await inbound(c, f2, "STOP"); out.help[(approved ? "approved" : "unapproved") + " | HELP after STOP"] = await inbound(c, f2, "HELP");
}
// ---------- C. held inbound on unapproved shop: owner signal volume ----------
{
  const c = await shop({ approved: false }); const from = nextPhone(); const rows = [];
  for (let i = 0; i < 10; i++) rows.push(await inbound(c, from, `msg ${i}: my AC is out, address 1402 Mason Rd`));
  const conv = await store.getConversation(c, "sms", from);
  out.heldOneCustomer10 = { ownerEmails: rows.reduce((a, r) => a + r.ownerEmails, 0), ownerTexts: rows.reduce((a, r) => a + r.ownerTexts, 0), customerTexts: rows.reduce((a, r) => a + r.customerTexts.length + (r.twiml ? 1 : 0), 0), savedUser: conv.messages.filter((m) => m.role === "user").length, held: conv.messages.filter((m) => m.held).length };
  // shop with no owner email (phone only): operator fallback, rate limited
  const c2 = await shop({ approved: false, ownerEmail: "" }); const rows2 = [];
  for (let i = 0; i < 8; i++) rows2.push(await inbound(c2, nextPhone(), `new customer ${i}: need a quote`));
  out.heldNoOwnerEmail8 = { ownerTexts: rows2.reduce((a, r) => a + r.ownerTexts, 0), operatorEmails: rows2.reduce((a, r) => a + r.operatorEmails, 0), fallbackEvents: (await events(c2, "owner_alert_fallback")).map((e) => e.data?.operator), heldEvents: (await events(c2, "inbound_held")).length };
}
// ---------- D. approved-shop parity ----------
{
  const c = await shop({ approved: true }); const from = nextPhone();
  out.parity = {};
  out.parity.aiReply = await inbound(c, from, "My AC is blowing warm air, can someone come Thursday?");
  out.parity.aiReply2 = await inbound(c, from, "Ok what times do you have?");
  // booking via tool
  const phone = nextPhone(), k = reqs.length; const d = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const r = await desk.bookVisit(c, { customer_name: "Maria Lopez", phone, address: "1402 Mason Rd, Katy", issue: "AC warm", date: d, window: (c.windows || ["8 to 12"])[0], urgency: "normal" }, {});
  const l = reqs.slice(k);
  out.parity.booking = { customerTexts: texts(l).filter((t) => t.p.To === phone).map((t) => t.p.Body.replace(/ref \w+|Ref \w+/g, "ref X")), ownerTexts: texts(l).filter((t) => t.p.To === c.owner.phone).length, ownerEmails: l.filter((x) => x.kind === "email").length, senders: [...new Set(texts(l).map((t) => t.p.MessagingServiceSid || t.p.From))], note: desk.deliveryNote(c, r.booking || r)?.replace(/ref \w+/gi, "ref X") };
  // reminders: pull this shop's tasks to now and run the scheduler
  const keys = await store.list("tasks", ""); const types = [];
  for (const key of keys) { const t = await store.get("tasks", key); if (t?.slug === c.slug && /^reminder/.test(t.type)) { types.push(t.type); await store.del("tasks", key); const due = new Date(Date.now() - 60000).toISOString(); await store.put("tasks", `${due}_${t.id}`, { ...t, dueAt: due }); } }
  const k2 = reqs.length; try { await sched.run({}); } catch (e) { out.parity.schedulerError = String(e.message).slice(0, 120); }
  out.parity.reminders = { scheduled: types.sort(), sent: texts(reqs.slice(k2)).filter((t) => t.p.To === phone).map((t) => t.p.Body.slice(0, 60)) };
  // C fast path then STOP / START
  out.parity.confirmC = await inbound(c, phone, "C");
  out.parity.afterC = await inbound(c, phone, "Also can you check my water heater?");
  out.parity.stop = await inbound(c, phone, "STOP"); out.parity.stop2 = await inbound(c, phone, "STOP"); out.parity.start = await inbound(c, phone, "START");
  out.parity.alto = await inbound(c, phone, "ALTO"); out.parity.empezar = await inbound(c, phone, "EMPEZAR");
  out.parity.phrase = await inbound(c, phone, "please stop texting me");
  out.parity.events = await evTypes(c);
}
// ---------- E0. Twilio throws only on the AI reply that says "booked": is the [Done] marker kept, and is a retry a second booking?
{
  const c = await shop({ approved: true }); const from = nextPhone(); twilioMode = "throwReply"; const threw = [];
  const msg = "Please book me tomorrow 8 to 12, I'm Ana Ruiz 713-555-0142 at 22 Elm St, AC out";
  await sms(form({ To: c.phone.twilioNumber, From: from, Body: msg })); try { await runBg(c, from); } catch (e) { threw.push(String(e.message).slice(0, 60)); }
  // Netlify retries a failed background function; the customer also texts again
  try { await runBg(c, from); } catch (e) { threw.push(String(e.message).slice(0, 60)); }
  twilioMode = "ok";
  await sms(form({ To: c.phone.twilioNumber, From: from, Body: "did that go through? please book me" })); try { await runBg(c, from); } catch (e) { threw.push(String(e.message).slice(0, 60)); }
  const bookings = (await store.listRecords ? await store.listRecords(c, "bookings").catch(() => null) : null);
  const conv = await store.getConversation(c, "sms", from);
  out.doubleBooking = { threw, bookingEvents: (await events(c, "booking")).length, visitsForNumber: (await desk.upcomingBookings(c, from)).length, assistant: conv.messages.filter((m) => m.role === "assistant").map((m) => String(m.content).slice(0, 90)) };
}
// ---------- R5. Netlify retry semantics (bg invoked again after a throw, up to 3 tries)
async function retryCase(label, plan, interleave) {
  const c = await shop({ approved: true }); const from = nextPhone(); const k0 = reqs.length; const tries = [];
  await sms(form({ To: c.phone.twilioNumber, From: from, Body: "Please book me tomorrow 8 to 12, I'm Ana Ruiz 713-555-0142 at 22 Elm St, AC out" }));
  for (let i = 0; i < 3; i++) {
    twilioMode = plan[i] || "ok";
    if (interleave && i === 1) { twilioMode = "ok"; await sms(form({ To: c.phone.twilioNumber, From: from, Body: "hello? did it go through?" })); await runBg(c, from).catch(() => {}); twilioMode = plan[i] || "ok"; }
    let threw = false; try { await runBg(c, from); } catch { threw = true; }
    tries.push(threw); if (!threw) break;
  }
  twilioMode = "ok";
  const l = reqs.slice(k0), conv = await store.getConversation(c, "sms", from);
  out["retry_" + label] = { tries, customerTextsDelivered: texts(l).filter((t) => t.p.To === from).map((t) => t.p.Body.slice(0, 70)), sendAttempts: l.filter((x) => x.kind === "twilio_throw").length, bookings: (await events(c, "booking")).length, ownerAlerts: l.filter((x) => x.kind === "email" && /could not be sent|not be sent/.test(x.text || "")).length + texts(l).filter((t) => t.p.To === c.owner.phone && /could not be sent/.test(t.p.Body)).length, assistant: conv.messages.filter((m) => m.role === "assistant").map((m) => String(m.content).slice(0, 60) + (m.undelivered ? " [" + m.undelivered + "]" : "")), events: (await events(c)).map((e) => e.type + (e.data?.reason ? ":" + e.data.reason : "")).sort() };
}
await retryCase("onceThenOk", ["throwReply", "ok"]);
await retryCase("always", ["throwReply", "throwReply", "throwReply"]);
await retryCase("newTextBeforeRetry", ["throwReply", "ok"], true);
// ---------- E. failure handling on an approved shop ----------
{
  const c = await shop({ approved: true }); const from = nextPhone();
  // book via AI (fake model) then Twilio throws on the reply: is the [Done] marker kept?
  twilioMode = "throw"; let threw = null;
  await sms(form({ To: c.phone.twilioNumber, From: from, Body: "Please book me for tomorrow morning, AC out, I'm Ana at 22 Elm St" }));
  try { await runBg(c, from); } catch (e) { threw = String(e.message).slice(0, 80); }
  twilioMode = "ok";
  const conv = await store.getConversation(c, "sms", from);
  out.twilioThrow = { bgThrew: threw, assistantSaved: conv.messages.filter((m) => m.role === "assistant").map((m) => String(m.content).slice(-80)), events: await evTypes(c) };
  // Twilio rejects (4xx): customer gets nothing; is the owner told?
  const c2 = await shop({ approved: true }); const f2 = nextPhone(); twilioMode = "500";
  const k = reqs.length; await sms(form({ To: c2.phone.twilioNumber, From: f2, Body: "Is anyone there? my heater died" })); await runBg(c2, f2); twilioMode = "ok";
  const conv2 = await store.getConversation(c2, "sms", f2);
  out.twilioReject = { ownerEmails: reqs.slice(k).filter((x) => x.kind === "email").length, saved: conv2.messages.map((m) => m.role + (m.undelivered ? "[undelivered:" + m.undelivered + "]" : "")), events: await evTypes(c2) };
}
out.otherRequests = other;
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("done", OUT, "other:", other.length);
