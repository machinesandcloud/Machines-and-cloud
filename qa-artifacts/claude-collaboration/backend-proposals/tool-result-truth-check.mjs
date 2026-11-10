// Proposal 4 acceptance check: legacy tool results tell the model what the notifications really did.
// Runs the real handlers in-process: netlify/functions/chat.mjs (legacy web), sms-agent-background.mjs
// (legacy SMS) and vapi.mjs (legacy voice tool-calls). The model is the MC_FAKE_MODEL=1 seam, redirected
// by a loader hook to a scripted stub that calls one tool and records the tool_result it is handed.
// Store: MC_MEMORY_STORE=1. Network: node sockets denied; fetch is an in-process double.
// Two child processes, because send.mjs reads provider env once at import:
//   - "unconfigured": no provider env at all, so every send returns { ok:false, reason:"disabled" };
//   - "provider":     offline placeholder Twilio/Resend values (never real keys) and a fetch double for
//                     api.twilio.com and api.resend.com that answers per case: accept (201/200) or refuse
//                     (400/422). Any other URL is refused and counted.
// For each case the check asserts the tool-result text against the sends the double actually saw:
//   - a send that failed is never described as texted/emailed/told, and the model is told not to claim it;
//   - a send that succeeded is described as accepted by the provider (not read, not delivered);
//   - a merged lead with nothing new (no alert sent) does not say anyone was texted.
// Usage: node tool-result-truth-check.mjs [--repo <repo root>] [--output <new json path>]
// Expected: FAILS on dfb0ae78 (fixed "has been texted" strings), PASSES with 04-tool-result-truth.patch.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { register, syncBuiltinESMExports } from "node:module";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || resolve(import.meta.dirname, "../../.."));
const childMode = arg("--child");

if (!childMode) {
  const output = arg("--output");
  if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
  const runs = {};
  for (const mode of ["unconfigured", "provider"]) {
    const r = spawnSync(process.execPath, [import.meta.filename, "--child", mode, "--repo", repo], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8", maxBuffer: 64 << 20 });
    const line = (r.stdout || "").trim().split("\n").filter((l) => l.startsWith("{\"mode\"")).at(-1);
    if (!line) { console.error(r.stdout, r.stderr); throw new Error("child " + mode + " produced no result (exit " + r.status + ")"); }
    runs[mode] = JSON.parse(line);
  }
  const results = [...runs.unconfigured.results, ...runs.provider.results];
  for (const x of results) console.log(`${x.pass ? "ok  " : "FAIL"} ${x.mode.padEnd(12)} ${x.channel.padEnd(5)} ${x.case.padEnd(34)} ${JSON.stringify(x.toolResult)}${x.pass ? "" : "\n       " + x.problems.join("; ")}`);
  const failed = results.filter((x) => !x.pass);
  const other = runs.unconfigured.otherRequests + runs.provider.otherRequests;
  // "falseClaim" rows: the tool result claims a text/email/alert that the provider did not accept (or that never ran).
  const falseClaim = results.filter((x) => x.problems.some((p) => p.startsWith("claims"))).length;
  const summary = { check: "tool-result-truth-check", repo, cases: results.length, failed: failed.length, falseClaimCases: falseClaim, otherRequests: other, result: failed.length || other ? "FAIL" : "PASS" };
  console.log(JSON.stringify(summary));
  if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
  process.exit(summary.result === "PASS" ? 0 : 1);
}

// ---------------- child ----------------
const net = await import("node:net"), http = await import("node:http"), https = await import("node:https");
const deny = () => { throw new Error("tool-result-truth-check denies real networking"); };
net.default.connect = net.default.createConnection = http.default.request = http.default.get = https.default.request = https.default.get = deny; syncBuiltinESMExports();
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", ADMIN_KEY: "truth-check-admin", URL: "https://platform.example.test" });
if (childMode === "provider") Object.assign(process.env, { TWILIO_ACCOUNT_SID: "ACoffline0000000000000000000000000", TWILIO_AUTH_TOKEN: "offline-placeholder", RESEND_API_KEY: "re_offline_placeholder", MC_TWILIO_NUMBER: "+17135550000" });

const plan = { sms: "accept", email: "accept" }; const seen = []; let otherRequests = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "api.twilio.com" && url.pathname.endsWith("/Messages.json")) {
    const to = new URLSearchParams(String(init.body)).get("To"); const ok = plan.sms === "accept" || (plan.sms === "throwCustomer" && to === "+17135550100"); seen.push({ kind: "sms", to, ok });
    // Rev 3: a network error (fetch rejects) instead of an HTTP refusal, for every text or only for the customer's.
    if (plan.sms === "throw" || (plan.sms === "throwCustomer" && to !== "+17135550100")) { seen.at(-1).threw = true; throw new TypeError("fetch failed"); }
    return ok ? Response.json({ sid: "SM" + "0".repeat(32), status: "queued" }, { status: 201 }) : Response.json({ code: 21610, message: "Attempt to send to unsubscribed recipient" }, { status: 400 });
  }
  if (url.hostname === "api.resend.com") {
    const to = JSON.parse(String(init.body)).to?.[0]; const ok = plan.email === "accept"; seen.push({ kind: "email", to, ok });
    if (plan.email === "throw") { seen.at(-1).threw = true; throw new TypeError("fetch failed"); }
    return ok ? Response.json({ id: "offline-email" }, { status: 200 }) : Response.json({ message: "domain not verified" }, { status: 422 });
  }
  otherRequests++; deny();
};

// Scripted model: turn 1 calls the queued tool, turn 2 ends. Every request is recorded.
const stub = `export function fakeClient() {
  const stream = (req) => { (globalThis.__requests ||= []).push(JSON.parse(JSON.stringify(req.messages)));
    const turn = (globalThis.__turns || []).shift() || { text: "Done." };
    const content = turn.tool ? [{ type: "tool_use", id: "toolu_" + Math.random().toString(36).slice(2, 10), name: turn.tool.name, input: turn.tool.input }] : [{ type: "text", text: turn.text }];
    const final = { stop_reason: turn.tool ? "tool_use" : "end_turn", content, usage: { input_tokens: 1, output_tokens: 1 } };
    return { async *[Symbol.asyncIterator]() { if (!turn.tool) yield { type: "content_block_delta", delta: { type: "text_delta", text: turn.text } }; }, finalMessage: async () => final }; };
  return { messages: { stream }, beta: { messages: { stream } } };
}`;
const stubURL = "data:text/javascript," + encodeURIComponent(stub);
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, ctx, next) {
  if (s === "./fake-model.mjs" && ctx.parentURL?.endsWith("/netlify/functions/lib/agent.mjs")) return { url: ${JSON.stringify(stubURL)}, shortCircuit: true };
  return next(s, ctx); }`));
const quiet = console.log; console.log = () => {}; const origErr = console.error; console.error = () => {};

const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs"));
const cfg = await import(F("lib/config.mjs"));
const chat = (await import(F("chat.mjs"))).default;
const smsAgent = (await import(F("sms-agent-background.mjs"))).default;
const vapi = (await import(F("vapi.mjs"))).default;

const SITE = "https://bayou.example.test";
let seq = 0;
async function shop(owner) {
  const slug = "truth-" + (++seq);
  const c = cfg.newClient({ slug, ownerKey: "owner-" + slug, owner: { name: "Ray", ...owner }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sun 7am-7pm" } });
  Object.assign(c, { status: "live", services: ["AC repair"], windows: ["8 to 12", "12 to 5"] });
  c.business.serviceArea = ["Katy"]; c.business.website = SITE; c.rules.windowCapacity = 20;
  await store.saveClient(c); return c;
}
const dayAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const phone = () => "+1713555" + String(2000 + ++seq).padStart(4, "0");
const bookInput = (p, d = 3) => ({ customer_name: "Lee Park", phone: p, address: "5 Pine St, Katy", issue: "AC not cooling", date: dayAhead(d), window: "8 to 12", urgency: "this_week", language: "en", notes: "", unsure: "" });
const leadInput = (p, reason = "emergency") => ({ customer_name: "Ana Diaz", phone: p, address: "12 Oak Ln, Katy", issue: "Gas smell in kitchen", reason, urgency: reason === "emergency" ? "emergency" : "flexible", wanted: "", language: "en", nobook_reason: "none", unsure: "" });
const toolResultFrom = () => { const reqs = globalThis.__requests.splice(0); for (const m of reqs.flat().reverse()) if (Array.isArray(m.content)) { const b = m.content.find((x) => x.type === "tool_result"); if (b) return typeof b.content === "string" ? b.content : JSON.stringify(b.content); } return null; };

async function viaChat(c, tool) {
  globalThis.__requests = []; globalThis.__turns = [{ tool }, { text: "Done." }];
  const r = await chat(new Request("https://platform.example.test/api/chat", { method: "POST", headers: { origin: SITE, "content-type": "application/json", "x-admin-key": "truth-check-admin" }, body: JSON.stringify({ client: c.slug, contact: "w" + (++seq), messages: [{ role: "user", content: "hello" }] }) }), { ip: "192.0.2.10" });
  await r.text(); return toolResultFrom();
}
async function viaSms(c, from, tool) {
  globalThis.__requests = []; globalThis.__turns = [{ tool }, { text: "Done." }];
  const conv = await store.getConversation(c, "sms", from); conv.messages.push({ role: "user", content: "hello", at: new Date().toISOString() }); await store.saveConversation(conv);
  await smsAgent(new Request("https://platform.example.test/x", { method: "POST", headers: { "x-admin-key": "truth-check-admin" }, body: JSON.stringify({ slug: c.slug, from }) }));
  return toolResultFrom();
}
async function viaVapi(c, caller, tool) {
  const r = await vapi(new Request("https://platform.example.test/api/vapi", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: { type: "tool-calls", assistant: { metadata: { slug: c.slug } }, customer: { number: caller }, call: { id: "call" + (++seq) }, toolCallList: [{ id: "tc" + seq, function: { name: tool.name, arguments: JSON.stringify(tool.input) } }] } }) }));
  const j = await r.json(); return j.results?.[0]?.result ?? j.results?.[0]?.error ?? null;
}

// Phrases that claim an owner alert or a customer text happened.
const OWNER_CLAIM = /has been texted|Owner texted|owner has been texted|has the details|has been told|Cancel request sent to the owner|was sent (a text|an email)/i;
const CUSTOMER_CLAIM = /will get a text reminder|confirmation text was accepted/i;
const results = [];
async function run(name, channel, sends, fn, expect) {
  seen.length = 0; Object.assign(plan, sends);
  let text = null, error = null;
  try { text = await fn(); } catch (e) { error = String(e?.message || e); }
  const ownerSends = seen.filter((s) => s.to === "+17135550100" || s.to === "ray@example.test");
  const ownerOk = ownerSends.filter((s) => s.ok).map((s) => s.kind);
  const custOk = seen.some((s) => s.kind === "sms" && s.to !== "+17135550100" && s.ok);
  const problems = [];
  if (error || typeof text !== "string") problems.push("no tool result: " + (error || text));
  else {
    for (const [ok, msg] of await expect(text, { ownerOk, custOk, seen, shop: currentShop })) if (!ok) problems.push(msg);
  }
  results.push({ mode: childMode, channel, case: name, sends: { ...sends }, providerSaw: seen.map((s) => `${s.kind}:${s.to === "+17135550100" || s.to === "ray@example.test" ? "owner" : "customer"}:${s.ok ? "accepted" : "refused"}`), toolResult: text, pass: problems.length === 0, problems });
}
// Expectations shared by every channel.
const failedAlert = (t) => [
  [!OWNER_CLAIM.test(t), "claims the owner was alerted although no alert was accepted"],
  [/could not be alerted yet/.test(t), "does not say the owner could not be alerted yet"],
  [/Do not tell the customer that Ray was texted, emailed or told/.test(t), "does not tell the model not to claim the alert"],
];
const sentAlert = (what) => (t, s) => [
  [new RegExp(`Ray was sent ${what} with the details \\(accepted by the provider`).test(t), `does not say Ray was sent ${what} (accepted by the provider)`],
  [!/could not be alerted/.test(t), "says the alert failed although the provider accepted it"],
  [s.ownerOk.length > 0, "fixture: the provider double saw no accepted owner alert"],
];
// Rev 2 (QA consent gap): the saved booking and its scheduled reminder tasks must agree with the note.
const bookingState = async (t, shop) => {
  const id = (t.match(/(?:Ref|reference) (\w+)/) || [])[1];
  const b = id ? await store.getRecord("bookings", shop.slug, id) : null;
  const tasks = (await store.dueTasks("9999")).map((x) => x.task).filter((x) => x.slug === shop.slug && x.data?.bookingId === id && /^reminder_/.test(x.type)).map((x) => x.type).sort();
  return { b, tasks };
};
const custFailed = async (t, s) => { const { b, tasks } = await bookingState(t, s.shop); return [
  [!CUSTOMER_CLAIM.test(t), "claims a customer text/reminder although the confirmation text was not accepted"],
  [/confirmation text was not sent/.test(t), "does not say the confirmation text was not sent"],
  [!!b, "fixture: booking not found"],
  [!b?.consent, "texting consent recorded although the disclosure (confirmation text) was not sent"],
  [tasks.length === 0, "reminder texts still scheduled after the confirmation failed: " + tasks.join(",")],
]; };
const custSent = async (t, s) => { const { b, tasks } = await bookingState(t, s.shop); return [
  [/confirmation text was accepted for delivery/.test(t), "does not say the confirmation text was accepted"], [s.custOk, "fixture: no accepted customer text"],
  [!!b?.consent, "consent not recorded although the confirmation text was accepted"],
  [tasks.length === 2 ? /24 hours and 1 hour/.test(t) : tasks.length === 1 ? /1 hour before/.test(t) && !/24 hours/.test(t) : /No reminder text is scheduled/.test(t), `reminder wording does not match the scheduled tasks (${tasks.join(",") || "none"})`],
]; };
const both = (...fs) => async (t, s) => (await Promise.all(fs.map((f) => f(t, s)))).flat();
let currentShop = null;

const ALL_FAIL = { sms: "refuse", email: "refuse" }, ALL_OK = { sms: "accept", email: "accept" }, SMS_FAIL = { sms: "refuse", email: "accept" };
const ray = { phone: "+17135550100", email: "ray@example.test" };
const scenarios = childMode === "unconfigured" ? [["sends disabled (no provider env)", ALL_FAIL, failedAlert, custFailed]]
  : [["provider refuses text and email", ALL_FAIL, failedAlert, custFailed], ["provider accepts text and email", ALL_OK, sentAlert("a text and an email"), custSent], ["text refused, email accepted", SMS_FAIL, sentAlert("an email"), custFailed]];

for (const [label, sends, ownerExp, custExp] of scenarios) {
  const c = await shop(ray); currentShop = c;
  await run(`notify_owner: ${label}`, "web", sends, () => viaChat(c, { name: "notify_owner", input: leadInput(phone()) }), ownerExp);
  await run(`book_visit: ${label}`, "web", sends, () => viaChat(c, { name: "book_visit", input: bookInput(phone()) }), both(ownerExp, custExp));
  await run(`notify_owner: ${label}`, "voice", sends, () => { const p = phone(); return viaVapi(c, p, { name: "notify_owner", input: leadInput(p) }); }, ownerExp);
  await run(`book_visit: ${label}`, "voice", sends, () => { const p = phone(); return viaVapi(c, p, { name: "book_visit", input: bookInput(p) }); }, both(ownerExp, custExp));
  const p = phone();
  await run(`notify_owner: ${label}`, "sms", sends, () => viaSms(c, p, { name: "notify_owner", input: leadInput(p, "lead") }), ownerExp);
  const q = phone();
  await run(`book_visit: ${label}`, "sms", sends, () => viaSms(c, q, { name: "book_visit", input: bookInput(q, 4) }), ownerExp);
  await run(`reschedule: ${label}`, "sms", sends, async () => { const [b] = await store.recordsFor("bookings", c, q); return viaSms(c, q, { name: "update_visit", input: { booking_id: b?.id || "", action: "reschedule", date: dayAhead(5), window: "12 to 5" } }); }, ownerExp);
  await run(`cancel_request: ${label}`, "sms", sends, async () => { const [b] = await store.recordsFor("bookings", c, q); return viaSms(c, q, { name: "update_visit", input: { booking_id: b?.id || "", action: "cancel_request", date: "", window: "" } }); }, ownerExp);
}
// A visit less than 24 hours away: only the reminders that were really scheduled may be mentioned.
if (childMode === "provider") {
  const c = await shop(ray); currentShop = c;
  await run("book_visit tomorrow 8 to 12 (reminder wording)", "web", ALL_OK, () => viaChat(c, { name: "book_visit", input: { ...bookInput(phone()), date: "tomorrow", window: "8 to 12" } }), both(sentAlert("a text and an email"), custSent));
}
// Rev 3 (QA3): a network error on the confirmation text counts as "not sent": no consent, no reminders, and the
// owner alert still runs. A network error on every send still yields a saved booking and an honest note.
if (childMode === "provider") {
  const c = await shop(ray); currentShop = c;
  await run("book_visit: customer text throws, owner alert accepted", "web", { sms: "throwCustomer", email: "accept" }, () => viaChat(c, { name: "book_visit", input: bookInput(phone()) }), both(sentAlert("a text and an email"), custFailed));
  await run("book_visit: customer text throws (voice)", "voice", { sms: "throwCustomer", email: "accept" }, () => { const p = phone(); return viaVapi(c, p, { name: "book_visit", input: bookInput(p) }); }, both(sentAlert("a text and an email"), custFailed));
  await run("book_visit: every send throws", "web", { sms: "throw", email: "throw" }, () => viaChat(c, { name: "book_visit", input: bookInput(phone()) }), both(failedAlert, custFailed));
  await run("notify_owner: every send throws", "web", { sms: "throw", email: "throw" }, () => viaChat(c, { name: "notify_owner", input: leadInput(phone()) }), failedAlert);
  // An SMS reschedule of a booking whose confirmation failed must not bring the reminders back (texts held, no consent).
  const q = phone();
  await viaChat(c, { name: "book_visit", input: { ...bookInput(q), phone: q } }).catch(() => null);
  await run("reschedule by SMS of a held booking: no reminders return", "sms", { sms: "refuse", email: "accept" }, async () => { const [b] = await store.recordsFor("bookings", c, q); return viaSms(c, q, { name: "update_visit", input: { booking_id: b?.id || "", action: "reschedule", date: dayAhead(6), window: "12 to 5" } }); }, async (t) => {
    const [b] = await store.recordsFor("bookings", c, q);
    const tasks = (await store.dueTasks("9999")).map((x) => x.task).filter((x) => x.slug === c.slug && x.data?.bookingId === b?.id && /^reminder_/.test(x.type));
    return [[!!b?.textsHeld, "fixture: booking was not held"], [/^Moved ref/.test(t), "reschedule did not run: " + t.slice(0, 80)], [tasks.length === 0, "reminders re-scheduled for a booking with texts held: " + tasks.map((x) => x.type).join(",")]];
  });
}
// A repeat notify_owner within 30 minutes with nothing new: no alert is sent at all.
{
  const c = await shop(ray), p = phone();
  await viaChat(c, { name: "notify_owner", input: leadInput(p, "wants_call") });
  await run("notify_owner repeat, nothing changed", "web", ALL_OK, () => viaChat(c, { name: "notify_owner", input: leadInput(p, "wants_call") }), (t, s) => [
    [s.seen.length === 0, "fixture: a send happened on the merged repeat"],
    [!OWNER_CLAIM.test(t), "claims the owner was texted although no alert was sent"],
    [/no new alert was sent/.test(t), "does not say no new alert was sent"],
  ]);
}
// No owner phone or email on file.
{
  const c = await shop({ phone: "", email: "" });
  await run("notify_owner, no owner contact", "web", ALL_OK, () => viaChat(c, { name: "notify_owner", input: leadInput(phone()) }), (t) => [
    [!OWNER_CLAIM.test(t), "claims the owner was texted with no owner contact on file"],
    [/no owner phone or email is on file/.test(t), "does not say no owner contact is on file"],
  ]);
  await run("notify_owner spam", "voice", ALL_OK, () => { const p = phone(); return viaVapi(c, p, { name: "notify_owner", input: { ...leadInput(p), reason: "spam" } }); }, (t) => [[!OWNER_CLAIM.test(t), "claims the owner was texted for spam"]]);
}
// The legacy prompt's consent line ("You'll get appointment texts...") must yield to a failed confirmation text.
if (childMode === "unconfigured") {
  const c = await shop(ray), prompt = cfg.buildSystemPrompt(c, "web");
  const line = (prompt.match(/When book_visit succeeds, say this once:[^\n]*/) || [""])[0];
  results.push({ mode: childMode, channel: "web", case: "prompt: consent line conditional", sends: {}, providerSaw: [], toolResult: line.slice(0, 400), pass: /confirmation text was not sent, skip that line and do not promise texts/.test(line), problems: ["the prompt still orders the texting consent line even when the confirmation text was not sent"] });
  results.at(-1).problems = results.at(-1).pass ? [] : results.at(-1).problems;
}
console.log = quiet;
console.log(JSON.stringify({ mode: childMode, results, otherRequests }));
