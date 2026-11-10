// QA3 probe for proposal 04 rev 2: store-level consent + reminder state after bookVisit.
// Offline: sockets denied; fetch is an in-process double for Twilio/Resend. Memory store.
// Usage: node qa3-consent-reminder-probe.mjs --repo <copy>
import { resolve } from "node:path"; import { pathToFileURL } from "node:url"; import { syncBuiltinESMExports } from "node:module";
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo"));
const net = await import("node:net"), http = await import("node:http"), https = await import("node:https");
const deny = () => { throw new Error("denied"); }; net.default.connect = net.default.createConnection = http.default.request = https.default.request = deny; syncBuiltinESMExports();
Object.assign(process.env, { MC_MEMORY_STORE: "1", NODE_ENV: "test", URL: "https://platform.example.test", TWILIO_ACCOUNT_SID: "ACoffline0000000000000000000000000", TWILIO_AUTH_TOKEN: "x", RESEND_API_KEY: "re_x", MC_TWILIO_NUMBER: "+17135550000" });
let plan = "accept"; let calls = [];
globalThis.fetch = async (u, init) => { const url = String(u); const body = String(init?.body || ""); calls.push(url.includes("twilio") ? "sms" : url.includes("resend") ? "email" : "other:" + url);
  const toCustomer = url.includes("twilio") && !decodeURIComponent(body).includes("+17135550111");
  if (plan === "throwCustomer" && toCustomer) throw new TypeError("fetch failed");
  if (plan === "refuseCustomer" && toCustomer) return Response.json({ message: "Service unavailable" }, { status: 503 });
  if (url.includes("twilio")) return Response.json({ sid: "SM1", status: "queued" }, { status: 201 });
  if (url.includes("resend")) return Response.json({ id: "e1" }, { status: 200 });
  deny(); };
const log = console.log; console.log = () => {}; console.error = () => {};
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs")); const cfg = await import(F("lib/config.mjs")); const desk = await import(F("lib/desk.mjs"));
const c = cfg.newClient({ slug: "qa3-consent", ownerKey: "k", owner: { name: "Ray", email: "ray@example.test", phone: "+17135550111" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sun 12am-11:59pm" } });
Object.assign(c, { status: "live", services: ["AC repair"], windows: ["8 to 12", "12 to 5", "4 to 6"] }); await store.saveClient(c);
const iso = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(d);
const tasksFor = async () => { const out = []; for (const k of await store.list("tasks", "")) { const t = await store.get("tasks", k); if (t?.slug === c.slug) out.push(t); } return out; };
const rem = (ts, id) => ts.filter((t) => t.data?.bookingId === id && /^reminder_/.test(t.type)).map((t) => t.type).sort().join(",") || "-";
const saved = async (id) => store.getRecord ? await store.getRecord("bookings", c.slug, id) : await store.get("bookings", `${c.slug}/${id}`);
const rows = [], ids = {};
async function book(label, p, phone, date, window) { plan = p; calls = []; let b, err, note;
  try { b = await desk.bookVisit(c, { customer_name: "Lee", phone, address: "5 Pine St", issue: "AC out", date, window }, { channel: "web", contact: "web-" + label }); note = b.full ? "FULL: " + b.message : desk.deliveryNote?.(c, b); } catch (e) { err = String(e.message); }
  let id = b?.id; if (!id) { for (const k of await store.list("bookings", c.slug + "/")) { const r = await store.get("bookings", k); if (r?.phone === phone && r?.date === date) id = r.id; } }
  ids[label] = id; rows.push({ label, plan: p, phone, date, window, calls: calls.join(","), threw: err || null, note: note || null }); }
const now = Date.now(), d2 = iso(new Date(now + 3 * 86400e3)), d3 = iso(new Date(now + 4 * 86400e3)), tmw = iso(new Date(now + 86400e3)), today = iso(new Date(now));
await book("A same phone, earlier, accepted", "accept", "+17135550201", d2, "8 to 12");
await book("B other phone, accepted", "accept", "+17135550202", d2, "12 to 5");
await book("C same phone as A, confirmation refused", "refuseCustomer", "+17135550201", d3, "8 to 12");
await book("D network throw on customer text", "throwCustomer", "+17135550203", d3, "12 to 5");
await book("E tomorrow 8 to 12 (<24h)", "accept", "+17135550204", tmw, "8 to 12");
await book("F today 4 to 6 (<1h at 15:xx CST)", "accept", "+17135550205", today, "4 to 6");
const ts = await tasksFor();
for (const r of rows) { const s = await saved(ids[r.label]); r.id = ids[r.label]; r.storedConsent = s?.consent ? true : (s ? false : "no record"); r.textsHeld = s?.textsHeld?.reason || null; r.reminderTasks = rem(ts, ids[r.label]);
  r.ownerAlerted = /email/.test(r.calls); log(JSON.stringify(r)); }
log(JSON.stringify({ nowCST: new Date(now).toLocaleString("en-US", { timeZone: "America/Chicago" }) }));
