// Deploy smoke test (netlify.toml build command). Imports every function module, seeds one live shop in an
// in-memory store, runs the scheduler at every gated hour inline, and calls the public handlers. Any throw
// fails the build, so a broken line in the scheduler never reaches production again. No external calls: keys are blanked.
process.env.MC_MEMORY_STORE = "1";
for (const k of ["ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PRIMARY_PROFILE_SID", "VAPI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY", "MC_TWILIO_NUMBER", "MC_MESSAGING_SERVICE_SID", "URL", "STEVE_PHONE"]) delete process.env[k];
process.env.ADMIN_KEY = "smoke-key";
process.env.VAPI_WEBHOOK_SECRET = "smoke-vapi-secret";
// Keep today's booking and default scheduler gate independent of the machine's wall clock.
const RealDate = Date, smokeNow = RealDate.parse("2026-10-21T15:00:00Z"); // 10 am Houston.
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [smokeNow])); }
  static now() { return smokeNow; }
};
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
const root = new URL("../netlify/functions/", import.meta.url);
const fail = (m) => { console.error("SMOKE FAIL:", m); process.exit(1); };
const t0 = RealDate.now();
// 1. Every module imports (syntax, bindings, top-level code).
const mods = {};
for (const dir of ["", "lib/"]) for (const f of readdirSync(new URL(dir, root))) if (f.endsWith(".mjs")) mods[dir + f] = await import(pathToFileURL(new URL(dir + f, root).pathname).href).catch((e) => fail(`${dir}${f}: ${e.message}`));
console.log("imported", Object.keys(mods).length, "modules");
// 2. Seed one live shop with a booking, a lead, and a callback alert.
const { newClient } = mods["lib/config.mjs"]; const store = mods["lib/store.mjs"]; const desk = mods["lib/desk.mjs"];
// A repair business must not inherit HVAC safety suggestions from the letters in "repair".
for (const trade of ["Appliance repair", "Chair repair", "Window & door repair"]) {
  if (newClient({ business: { trade } }).rules.emergencies.tier1.length) fail("unexpected urgent defaults for " + trade);
}
for (const trade of ["HVAC", "Air conditioning", "A/C", "AC repair", "Heating and cooling"]) {
  if (!newClient({ business: { trade } }).rules.emergencies.tier1.some(line => line.startsWith("No cooling"))) fail("missing HVAC defaults for " + trade);
}
const c = newClient({ slug: "smoke-shop", ownerKey: "k", owner: { name: "Dana Whitfield", email: "owner@example.com", phone: "+12815550199" }, business: { name: "Smoke HVAC", website: "https://example.com", trade: "HVAC", hours: "Mon-Fri 7am-7pm" } });
c.status = "live"; c.liveAt = new Date(Date.now() - 8 * 86400000).toISOString(); c.plan = "growth"; c.phone.twilioNumber = "+17135550111"; c.phone.businessNumber = "+12815550100"; c.business.reviewLink = "https://g.page/r/x/review"; c.lifecycle = { day7Sent: "2026-10-19T00:00:00Z" };
await store.saveClient(c); await store.indexClient(c);
await desk.bookVisit(c, { customer_name: "Lee Park", phone: "+17135552001", address: "12 Oak St, Katy", issue: "AC blowing warm", date: "today", window: "8 to 12", urgency: "today", language: "en", notes: "", unsure: "" }, { channel: "test", contact: "t1" });
await desk.flagLead(c, { customer_name: "Dee Fox", phone: "+17135552002", address: "", issue: "maintenance plan", reason: "wants_call", urgency: "flexible", wanted: "", language: "en", nobook_reason: "none", unsure: "" }, { channel: "test", contact: "t2" });
await store.logEvent(c.slug, "missed_call", { from: "+17135552003", textBack: "logged" });
// 3. Owner commands and the weekly and monthly reports.
const reply = await desk.ownerCommand(c, "otw"); if (!/On-the-way/.test(reply || "")) fail("bare otw: " + reply);
if (!(await desk.weeklyReport(c)).text) fail("weekly"); if (!(await desk.monthlyReport(c)).invoice) fail("monthly");
// 4. The scheduler at every gated hour, inline; every block must be ok.
const { run } = mods["scheduler.mjs"];
for (const args of [{}, { forceHour: 18 }, { forceHour: 21 }, { forceHour: 8, forceDay: "Mon" }, { forceHour: 9, forceDay: "1" }]) {
  const r = await run({ ...args, inline: true });
  const bad = Object.entries(r.blocks).filter(([, b]) => !b.ok);
  if (bad.length) fail(`scheduler ${JSON.stringify(args)}: ${bad.map(([k, b]) => k + " " + b.error).join("; ")}`);
}
console.log("scheduler ran at 5 gates, all blocks ok");
// 5. Handlers answer.
const call = async (mod, path, init) => mods[mod].default(new Request("https://smoke.test" + path, init), {});
let res = await call("health.mjs", "/api/health"); if (res.status !== 200) fail("health " + res.status + " " + (await res.text()));
res = await call("admin.mjs", "/api/admin", { headers: { "x-admin-key": "smoke-key" } }); if (res.status !== 200) fail("admin list " + res.status);
res = await call("client.mjs", "/api/client?c=smoke-shop"); const pub = await res.json(); if (pub.name !== "Smoke HVAC") fail("public view");
res = await call("client.mjs", "/api/client?c=smoke-shop&k=k"); const own = await res.json(); if (!own.today || !own.usage) fail("owner view");
res = await call("policy.mjs", "/policy?c=smoke-shop"); if (res.status !== 200) fail("policy");
res = await call("sms.mjs", "/api/sms", { method: "POST", headers: { "x-admin-key": "smoke-key", "Content-Type": "application/x-www-form-urlencoded" }, body: "From=%2B12815550199&To=%2B17135550111&Body=help" }); if (!/Commands|alert names/.test(await res.text())) fail("sms help");
res = await call("voice.mjs", "/api/voice", { method: "POST", headers: { "x-admin-key": "smoke-key", "Content-Type": "application/x-www-form-urlencoded" }, body: "From=%2B17135552009&To=%2B17135550111&CallSid=CA1" }); if (!/<Say/.test(await res.text())) fail("voice");
res = await call("vapi.mjs", "/api/vapi", { method: "POST", headers: { "Content-Type": "application/json", "x-vapi-secret": "wrong-smoke-secret" }, body: "{}" }); if (res.status !== 403) fail("vapi rejects wrong secret");
res = await call("vapi.mjs", "/api/vapi", { method: "POST", headers: { "Content-Type": "application/json", "x-vapi-secret": "smoke-vapi-secret" }, body: JSON.stringify({ message: { type: "end-of-call-report", phoneNumber: { number: "+17135550111" }, customer: { number: "+17135552010" }, startedAt: "2026-10-20T10:00:00Z", endedAt: "2026-10-20T10:01:00Z", endedReason: "customer-ended-call", artifact: { transcript: "" } } }) }); if (res.status !== 200) fail("vapi");
res = await call("twilio-alert.mjs", "/api/twilio-alert", { method: "POST", headers: { "x-admin-key": "smoke-key", "Content-Type": "application/x-www-form-urlencoded" }, body: "Sid=NO1&Level=ERROR&Payload=" + encodeURIComponent(JSON.stringify({ error_code: "11200", webhook: { request: { url: "https://x/api/voice", parameters: { To: "+17135550111" } } } })) }); if (res.status !== 200) fail("twilio-alert");
console.log(`SMOKE OK in ${RealDate.now() - t0} ms`);
