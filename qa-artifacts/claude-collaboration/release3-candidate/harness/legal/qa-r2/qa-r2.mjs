// Independent QA harness for legal-prereq rev 2. Usage: node qa-r2.mjs --repo <tree> --out <json>
// All providers are in-process doubles; any other origin throws. Memory store, fake model, dummy secrets.
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const REPO = resolve(arg("--repo")), OUT = arg("--out");
const deny = () => { throw new Error("network denied"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const SITE = "https://site.invalid";
for (const k of Object.keys(process.env)) if (/^(TWILIO_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|MC_|STEVE_|ADMIN_|PHONE_|SERVICE_)/.test(k)) delete process.env[k];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: SITE, PUBLIC_SITE_URL: SITE, ADMIN_KEY: "qa-dummy-admin",
  TWILIO_ACCOUNT_SID: "AC" + "9".repeat(32), TWILIO_AUTH_TOKEN: "qa-dummy-token", MC_TWILIO_NUMBER: "+13465550000", MC_MESSAGING_SERVICE_SID: "MG" + "8".repeat(32),
  RESEND_API_KEY: "re_qa_dummy", STEVE_EMAIL: "operator@qa.invalid", STEVE_PHONE: "+17135550998" });
const reqs = []; let serial = 0, emailFail = () => false; const other = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = (init.method || "GET").toUpperCase(), body = typeof init.body === "string" ? init.body : "";
  if (url.hostname === "api.twilio.com") { reqs.push({ kind: "twilio", method, path: url.pathname, p: Object.fromEntries(new URLSearchParams(body)) }); return new Response(JSON.stringify({ sid: "SM" + (++serial).toString(16).padStart(32, "0") }), { status: 201 }); }
  if (url.hostname === "api.resend.com") { const j = JSON.parse(body || "{}"); const f = emailFail([].concat(j.to).join(",")); reqs.push({ kind: "email", to: [].concat(j.to).join(","), subject: j.subject, text: j.text, failed: f }); return f ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ id: "em" + ++serial }), { status: 200 }); }
  if (url.origin === SITE) { reqs.push({ kind: "bg", path: url.pathname }); return new Response("ok"); }
  other.push(url.origin); throw new Error("blocked " + url.origin);
};
const fn = (r) => pathToFileURL(join(REPO, "netlify/functions", r)).href;
const store = await import(fn("lib/store.mjs"));
const { newClient } = await import(fn("lib/config.mjs"));
const send = await import(fn("lib/send.mjs"));
const desk = await import(fn("lib/desk.mjs"));
const sms = (await import(fn("sms.mjs"))).default;
const bg = (await import(fn("sms-agent-background.mjs"))).default;
let mcons = null; try { mcons = await import(fn("lib/managed-consent.mjs")); } catch {}
let detector = null; try { detector = await import(fn("lib/optout-intent.mjs")); } catch {}
const out = { repo: REPO };
let n = 0;
async function shop({ approved = true, ownerEmail = "owner@qa.invalid", ownerPhone = "+17135550111", name = "Bayou Air" } = {}) {
  const i = ++n, slug = "qa-shop-" + i;
  const c = newClient({ slug, ownerKey: "k" + i, owner: { name: "Dana", email: ownerEmail, phone: ownerPhone }, business: { name, trade: "HVAC", hours: "Mon-Fri 7am-7pm", website: "https://example.invalid" } });
  c.status = "live";
  c.phone = { ...(c.phone || {}), twilioNumber: "+1281555" + String(1000 + i), tenDlc: approved ? "approved" : "brand_pending", messagingServiceSid: approved ? "MG" + "3".repeat(32) : "", businessNumber: "+17135559" + String(100 + i), forwarding: "busy" };
  if (!ownerEmail) delete c.owner.email; if (!ownerPhone) delete c.owner.phone;
  await store.saveClient(c); await store.indexClient(c); return store.getClient(slug);
}
const form = (fields) => new Request(SITE + "/api/sms", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-admin-key": process.env.ADMIN_KEY }, body: new URLSearchParams(fields).toString() });
const since = (k) => reqs.slice(k);
const texts = (l) => l.filter((r) => r.kind === "twilio" && /Messages\.json$/.test(r.path));
const events = async (c, t) => (await store.listJSON("events", c.slug + "/", Infinity)).filter((e) => !t || e.type === t);
let ph = 0; const nextPhone = () => "+1832555" + String(2000 + ++ph);
const msgText = (x) => (x.match(/<Message>([\s\S]*?)<\/Message>/) || [])[1] || "";

// ---------- A. corpus ----------
const OPTOUT = [
  "please stop texting me", "Stop texting me.", "stop sending me these messages", "don't text me anymore", "Do not text this number again",
  "unsubscribe me from these texts", "remove me from your list", "Remove me please, I sold the house", "remove me, wrong person", "take me off your texting list",
  "I don't want any more texts", "no more texts please", "quit messaging me", "never text me again", "stop contacting me",
  "Leave me alone, stop texting", "STOP!!!", "Stop.", "stop please", "Unsubscribe",
  "dejen de mandarme mensajes", "No me manden más mensajes", "No me manden más", "No me envíen más, gracias", "ya no quiero recibir mensajes",
  "quiero darme de baja", "no más mensajes", "Quítenme de la lista", "ALTO", "alto por favor", "Basta", "PARAR", "ya no me escriban",
];
const LOOKALIKE = [
  "Can you stop by tomorrow?", "don't stop the visit, we still need you", "Please don't cancel the reminders", "don't stop texting me, I like the reminders",
  "the leak won't stop", "stop by after 3", "Can the tech stop at the store for a filter?", "Please cancel my visit", "end of the day works",
  "stop sending reminders to my husband's phone", "stop texting my wife, text me instead", "don't text me the price, call me",
  "my husband said stop texting him", "the texts stopped coming, did you cancel?", "Why did you stop texting me?", "remove me from the 2pm slot",
  "take me off the waitlist for Friday", "is there a way to stop the texts from showing my address?", "I need to cancel the reminder for tomorrow, I rescheduled",
  "If you stop texting me reminders I'll forget lol", "Dejen de mandarme técnicos sin avisar", "Necesito dar de baja mi aire viejo", "Borre mi número de la factura, por favor",
  "no me mande al técnico hoy", "dile a mi esposo que deje de mandarme mensajes", "Mi hijo dijo que paren los mensajes a su teléfono", "No pares, sigue mandando recordatorios",
  "alto el agua no para", "El aire no para de gotear", "¿Pueden pasar mañana?", "no more leaks since you came, thanks!", "Stop the water first, then call me",
  "please stop the noise from the unit", "I quit my job so I'm home all day", "Tell the tech to stop texting me and call instead",
];
if (detector) out.detector = Object.fromEntries([...OPTOUT, ...LOOKALIKE].map((t) => [t, detector.detectOptOutIntent(t)?.level || "none"]));

// ---------- B. legacy line end to end ----------
const legacy = await shop({ approved: true });
async function legacyRun(text) { const from = nextPhone(); const k = reqs.length; const res = await (await sms(form({ To: legacy.phone.twilioNumber, From: from, Body: text, MessageSid: "SM" + (++serial).toString(16).padStart(32, "0") }))).text(); return { suppressed: await send.optedOut(from), reply: msgText(res), visitCancelReq: (await events(legacy, "cancel_request")).length }; }
out.legacy = {};
for (const t of [...OPTOUT, ...LOOKALIKE]) out.legacy[t] = await legacyRun(t);

// ---------- C. managed line ----------
if (mcons?.recordManagedInbound) {
  const mc = await shop({ approved: true }); mc.onboarding = { version: 1 }; out.managed = {};
  for (const t of [...OPTOUT, ...LOOKALIKE]) { try { const r = await mcons.recordManagedInbound(mc, { phone: nextPhone(), text: t, messageSid: "SM" + (++serial).toString(16).padStart(32, "0"), providerDate: new Date().toISOString() }); out.managed[t] = { keyword: r.keyword, suppressed: !!r.suppressed }; } catch (e) { out.managed[t] = { error: String(e.message).slice(0, 120) }; } }
}

// ---------- D. keyword flows: STOP / repeat / START / HELP / ALTO / EMPEZAR ----------
{
  const c = await shop({ approved: true }), from = nextPhone(), seq = ["STOP", "STOP", "START", "HELP", "ALTO", "EMPEZAR", "stop texting me", "start"]; out.keywordFlow = [];
  for (const b of seq) { const k = reqs.length; const res = await (await sms(form({ To: c.phone.twilioNumber, From: from, Body: b, MessageSid: "SM" + (++serial).toString(16).padStart(32, "0") }))).text(); out.keywordFlow.push({ body: b, reply: msgText(res), optedOut: await send.optedOut(from), ownerMsgs: since(k).filter((r) => r.kind === "email" || r.kind === "twilio").map((r) => r.kind + ":" + (r.to || r.p?.To)) }); }
  // unapproved shop: STOP confirmation still a TwiML reply (not dropped)
  const u = await shop({ approved: false }), f2 = nextPhone(); const res = await (await sms(form({ To: u.phone.twilioNumber, From: f2, Body: "STOP", MessageSid: "SM" + (++serial).toString(16).padStart(32, "0") }))).text();
  out.unapprovedStop = { reply: msgText(res), optedOut: await send.optedOut(f2) };
}

// ---------- E. customer-facing: booking + owner alerts ----------
async function booking(approved) {
  const c = await shop({ approved }), phone = nextPhone(), k = reqs.length;
  const d = new Date(Date.now() + 3 * 86400000); const date = d.toISOString().slice(0, 10);
  let r, err = null; try { r = await desk.bookVisit(c, { customer_name: "Maria Lopez", phone, address: "1402 Mason Rd, Katy", issue: "AC blowing warm air", date, window: (c.windows || ["8 to 12"])[0], urgency: "normal" }, {}); } catch (e) { err = String(e.message).slice(0, 200); }
  const l = since(k), tasks = (await store.list("tasks", "")).length;
  const note = r ? desk.deliveryNote(c, r.booking || r) : null;
  return { err, customerTexts: texts(l).filter((t) => t.p.To === phone).length, ownerTexts: texts(l).filter((t) => t.p.To === c.owner.phone).length, ownerEmails: l.filter((x) => x.kind === "email" && x.to.includes("owner@")).length, operatorEmails: l.filter((x) => x.kind === "email" && x.to.includes("operator@")).length, from: texts(l).map((t) => t.p.From || t.p.MessagingServiceSid), blocked: (await events(c, "sms_blocked")).map((e) => e.data?.reason || e.data?.type), note: typeof note === "string" ? note.slice(0, 400) : note, resultKeys: r ? Object.keys(r) : null };
}
out.bookingApproved = await booking(true);
out.bookingUnapproved = await booking(false);

// ---------- F. unapproved shop customer conversation (AI reply) ----------
{
  const c = await shop({ approved: false }), from = nextPhone(), k = reqs.length;
  await sms(form({ To: c.phone.twilioNumber, From: from, Body: "My AC is out, can someone come tomorrow?", MessageSid: "SM" + (++serial).toString(16).padStart(32, "0") }));
  await bg(new Request(SITE + "/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": process.env.ADMIN_KEY, "content-type": "application/json" }, body: JSON.stringify({ slug: c.slug, from }) }));
  const l = since(k), conv = await store.getConversation(c, "sms", from);
  out.unapprovedConversation = { customerTexts: texts(l).filter((t) => t.p.To === from).length, ownerTexts: texts(l).filter((t) => t.p.To === c.owner.phone).length, ownerEmails: l.filter((x) => x.kind === "email" && x.to.includes("owner@")).map((x) => x.subject), operatorEmails: l.filter((x) => x.kind === "email" && x.to.includes("operator@")).length, savedAssistantReplies: conv.messages.filter((m) => m.role === "assistant").map((m) => String(m.content).slice(0, 160)), events: (await events(c)).map((e) => e.type + (e.data?.reason ? ":" + e.data.reason : "")) };
}

// ---------- G. operator fallback redaction / rate limit ----------
if (send.redactForOperator) {
  const probes = ["Bayou Air front desk: NEW LEAD Maria Lopez 7135551234 1402 Mason Rd Katy", "Customer Maria Lopez (713) 555-1234 lives on 1402 Mason Rd", "Bayou Air: call back maria.lopez@gmail.com re: 22 Elm Street apt 4", "Lead: Jose, phone 713.555.1234, address 900 W Main St", "VIP voicemail: https://api.twilio.com/2010-04-01/Accounts/ACxx/Recordings/RE123.mp3", "Lead Maria at 1402 Mason Rd\nPhone: +1 713 555 1234\nWhere: 1402 Mason Rd", "Bayou Air front desk: missed call from +17135551234. Gate code 4471#"];
  out.redaction = Object.fromEntries(probes.map((p) => [p, send.redactForOperator(p)]));
  const c = await shop({ approved: false, ownerEmail: "", ownerPhone: "" }), k = reqs.length; const res = [];
  for (let i = 0; i < 6; i++) res.push((await send.notifyOwner(c, `Bayou Air front desk: lead ${i} Maria 713-555-12${10 + i}, 1402 Mason Rd`, { settle: true })).map((r) => r.channel + ":" + (r.ok ? "ok" : r.reason)));
  out.fallback = { results: res, operatorEmails: since(k).filter((x) => x.kind === "email").map((x) => ({ subject: x.subject, hasPhone: /555-?12\d\d|713/.test(x.text), text: x.text.slice(0, 240) })), events: (await events(c, "owner_alert_fallback")).map((e) => e.data?.operator) };
  // owner email fails + operator email fails: visible?
  const c2 = await shop({ approved: false, ownerPhone: "" }); emailFail = () => true; const r2 = await send.notifyOwner(c2, "Bayou Air: lead X", { settle: true }); emailFail = () => false;
  out.allFail = { results: r2.map((r) => r.channel + ":" + (r.ok ? "ok" : r.reason || "fail")), events: (await events(c2, "owner_alert_fallback")).map((e) => e.data?.operator) };
}
// ---------- H. owner STOP: alerts still reach owner by email ----------
{
  const c = await shop({ approved: true }); await sms(form({ To: c.phone.twilioNumber, From: c.owner.phone, Body: "STOP", MessageSid: "SM" + (++serial).toString(16).padStart(32, "0") }));
  const k = reqs.length; const r = await send.notifyOwner(c, "Bayou Air: lead after owner STOP", { settle: true });
  out.ownerStop = { results: r.map((x) => x.channel + ":" + (x.ok ? "ok" : x.reason)), emails: since(k).filter((x) => x.kind === "email").map((x) => x.to), texts: texts(since(k)).length };
}
out.otherRequests = other;
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log("done", OUT, "other:", other.length);
