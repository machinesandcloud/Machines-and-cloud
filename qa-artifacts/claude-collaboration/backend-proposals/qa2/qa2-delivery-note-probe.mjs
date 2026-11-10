// QA2 probe for proposal 04: deliveryNote on paths the acceptance check does not cover.
// Child per env mode (send.mjs reads env once). Offline: sockets denied, fetch is a double.
import { resolve } from "node:path"; import { pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process"; import { syncBuiltinESMExports } from "node:module";
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo")); const mode = arg("--child");
if (!mode) { for (const m of ["nosender", "provider"]) { const r = spawnSync(process.execPath, [import.meta.filename, "--child", m, "--repo", repo], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8" }); process.stdout.write(r.stdout); process.stderr.write(r.stderr.split("\n").filter(l=>/Error|error/.test(l)).slice(0,5).join("\n")); } process.exit(0); }
const net = await import("node:net"), http = await import("node:http"), https = await import("node:https");
const deny = () => { throw new Error("denied"); }; net.default.connect = net.default.createConnection = http.default.request = https.default.request = deny; syncBuiltinESMExports();
Object.assign(process.env, { MC_MEMORY_STORE: "1", NODE_ENV: "test", URL: "https://platform.example.test", TWILIO_ACCOUNT_SID: "ACoffline0000000000000000000000000", TWILIO_AUTH_TOKEN: "x", RESEND_API_KEY: "re_x" });
if (mode === "provider") process.env.MC_TWILIO_NUMBER = "+17135550000";
let plan = "accept"; let sent = [];
globalThis.fetch = async (u, init) => { const url = String(u); sent.push(url.includes("twilio") ? "sms" : "email");
  if (plan === "throw") throw new TypeError("fetch failed");
  if (plan === "twilio500" && url.includes("twilio")) return Response.json({ message: "Service unavailable" }, { status: 503 });
  if (url.includes("twilio")) return Response.json({ sid: "SM1", status: "queued" }, { status: 201 });
  if (url.includes("resend")) return Response.json({ id: "e1" }, { status: 200 });
  deny(); };
const console_log = console.log; console.log = () => {}; console.error = () => {};
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs")); const cfg = await import(F("lib/config.mjs")); const desk = await import(F("lib/desk.mjs")); const send = await import(F("lib/send.mjs"));
const c = cfg.newClient({ slug: "dn-" + mode, ownerKey: "k", owner: { name: "Ray", email: "ray@example.test", phone: "+17135550111" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sun 12am-11:59pm" } });
Object.assign(c, { status: "live", services: ["AC repair"], windows: ["8 to 12", "12 to 5"] }); await store.saveClient(c);
const out = [];
const iso = (d) => d.toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 2 * 86400e3);
let day = 2; async function book(label, phone, extra = {}) { sent = []; let note, b, err; const d = new Date(Date.now() + (day++) * 86400e3);
  try { b = await desk.bookVisit(c, { customer_name: "Lee", phone, address: "5 Pine St", issue: "AC out", date: iso(d), window: "8 to 12", ...extra }, { channel: "web", contact: "web-" + label }); note = b.full ? b.message : desk.deliveryNote(c, b); } catch (e) { err = String(e.message); }
  out.push({ mode, label, providerCalls: sent.join(","), consentRecorded: !!b?.consent?.wording, note: note || null, threw: err || null }); }
plan = "accept"; await book("customer phone ok", "+17135550199");
await send.recordOptOut("+17135550198", c.slug, "STOP"); await book("customer opted out", "+17135550198");
plan = "twilio500"; await book("twilio transient 503 on all texts", "+17135550196");
plan = "throw"; await book("provider network error", "+17135550197");
plan = "accept";
const tasks = await store.listJSON?.("tasks", "").catch?.(() => null);
for (const x of out) console_log(JSON.stringify(x));
