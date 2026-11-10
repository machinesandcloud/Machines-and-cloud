// Proposal 5 acceptance check: legacy prompts no longer order a timed callback promise.
// Builds the real assembled prompts with lib/config.mjs buildSystemPrompt (web, sms, test; open, closed,
// opens-later-today) and lib/vapi.mjs voicePrompt (plain and transfer-all) for a legacy shop with the
// default rules ("within 30 minutes" / "by 8 am tomorrow") and with owner-typed values. No handler,
// no model, no network, no env needed.
// Usage: node callback-promise-check.mjs [--repo <repo root>] [--output <new json path>]
// Rev 2 adds (QA2 notes): the nightly audit rubric and its fake classifier no longer flag a compliant handoff and do
// flag a promised callback time; the labelled set agrees with the new policy; the fake desk no longer invents
// "within 30 minutes"; the unacknowledged-alert customer text (fallback_window) promises no call time.
// Expected: FAILS on dfb0ae78, PASSES with 05-callback-promise.patch.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, writeFileSync } from "node:fs";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || resolve(import.meta.dirname, "../../.."));
const output = arg("--output");
if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test" }); // rubric rows use the fake classifier
globalThis.fetch = async () => { throw new Error("callback-promise-check denies networking"); };
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const cfg = await import(F("lib/config.mjs"));
const desk = await import(F("lib/desk.mjs"));
const { fakeClient } = await import(F("lib/fake-model.mjs"));
const rubricSets = await import(F("lib/rubric-eval.mjs"));
const LABELLED = [...rubricSets.LABELLED, ...(rubricSets.LABELLED_2 || [])]; // rev 3: both labelled sets
const { readFileSync } = await import("node:fs");
const { voicePrompt } = await import(F("lib/vapi.mjs"));

const shop = (rules = {}, phone = {}) => {
  const c = cfg.newClient({ slug: "cb-check", ownerKey: "k", owner: { name: "Ray", phone: "+17135550100" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sat 7am-7pm" } });
  Object.assign(c, { status: "live", windows: ["8 to 12", "12 to 5"] }); Object.assign(c.rules, rules); Object.assign(c.phone ||= {}, phone); return c;
};
const OPEN = "2026-11-10T16:00:00Z", CLOSED = "2026-11-11T05:00:00Z", EARLY = "2026-11-11T12:30:00Z"; // 10am, 11pm, 6:30am Houston
const shops = { defaults: shop(), ownerTyped: shop({ callbackHours: "within 15 minutes", callbackAfterHours: "first thing tomorrow" }) };
const TIMED = /within 30 minutes|by 8 am tomorrow|within 15 minutes|first thing tomorrow|will call (?:them|you) |without the window/;
const rows = [];
for (const [name, c] of Object.entries(shops)) {
  for (const [label, at] of [["open", OPEN], ["closed", CLOSED], ["opens-later", EARLY]]) for (const ch of ["web", "sms", "test"]) rows.push({ shop: name, prompt: `${ch}/${label}`, text: cfg.buildSystemPrompt(c, ch, { at }) });
  rows.push({ shop: name, prompt: "voice", text: voicePrompt(c) });
  rows.push({ shop: name, prompt: "voice/transfer-all", text: voicePrompt({ ...c, phone: { ...c.phone, forwarding: "all", transferTo: "+17135550111" } }) });
}
const results = rows.map((r) => {
  const handoff = (r.text.match(/If the (?:customer|caller) asks for a person[^\n]*/g) || []).join(" | ");
  const timed = (r.text.match(TIMED) || [null])[0];
  const pass = !timed && /Ray will get their details and follow up/.test(handoff) && /Never promise a callback time/.test(handoff);
  return { shop: r.shop, prompt: r.prompt, pass, timedPhrase: timed, handoff: handoff.slice(0, 600) };
});
// The self-service (v1) wording is untouched.
const v1 = cfg.buildSystemPrompt({ ...shops.defaults, onboarding: { version: 1 } }, "web", { at: OPEN });
results.push({ shop: "self-service", prompt: "web/open", pass: v1.includes("the callback request can be saved for the shop, but whether or when a person will respond is not confirmed") && !/within 30 minutes/.test(v1), handoff: (v1.match(/If the customer asks for a person[^\n]*/) || [""])[0].slice(0, 600) });
// ---- rev 2 rows ----
const TIMED_RE = /within \d+ minutes|within the hour|by 8 am|right away|in \d+ minutos|le llamará \w+ \d/i;
const fakeRubric = async (lines) => (await desk.rubricClassify(shops.defaults, lines.join("\n"))).reasons;
const compliant = ["Customer: Can I talk to a person?", "Desk: I am the front desk assistant. I have sent your request to Ray; Ray will get your details and follow up. What is the best number?", "Customer: 713-555-0101"]; // QA2 audit probe transcript
const timed = ["Customer: Can I talk to a person?", "Desk: I am the front desk assistant. Ray will call you within 30 minutes. What is the best number?", "Customer: 713-555-0101"];
results.push({ shop: "audit", prompt: "rubric: compliant handoff (QA2)", pass: !(await fakeRubric(compliant)).includes("no_callback_window") });
results.push({ shop: "audit", prompt: "rubric: timed promise", pass: (await fakeRubric(timed)).includes("no_callback_window") });
const deskSrc = readFileSync(resolve(repo, "netlify/functions/lib/desk.mjs"), "utf8");
results.push({ shop: "audit", prompt: "RUBRIC definition (source)", pass: !/without saying when the owner will call/.test(deskSrc) && /promised a callback time/.test(deskSrc) });
const labelledTimed = LABELLED.filter((x) => x.text.some((l) => l.startsWith("Desk:") && TIMED_RE.test(l)));
results.push({ shop: "audit", prompt: "labelled set: timed promise only in no_callback_window rows", pass: labelledTimed.every((x) => x.labels.includes("no_callback_window")), timedPhrase: labelledTimed.filter((x) => !x.labels.includes("no_callback_window")).map((x) => "id " + x.id).join(", ") || null });
let agree = 0; const disagree = [];
for (const x of LABELLED) { const got = (await fakeRubric(x.text)).includes("no_callback_window"); if (got === x.labels.includes("no_callback_window")) agree++; else disagree.push(x.id); }
results.push({ shop: "audit", prompt: `labelled set has a vague-handoff and an ignored-request example besides id 32`, pass: LABELLED.filter((x) => x.labels.includes("no_callback_window") && !x.text.some((l) => l.startsWith("Desk:") && TIMED_RE.test(l))).length >= 3 });
// QA3 phrasings (qa3/qa3-audit-rubric-probe.mjs), verbatim.
const T3 = (d1, d2 = "") => `Customer: Can I talk to a person?\nDesk: ${d1}\nCustomer: 713-555-0101${d2 ? "\nDesk: " + d2 : ""}`;
for (const [want, label, t] of [
  ["defect", "ignored entirely", T3("What is the address for the visit?", "Thanks. What day works?")],
  ["defect", "ignored, offers booking", T3("I can book you a visit. What day works?")],
  ["defect", "vague: someone will call you back", T3("Someone will call you back. What is your number?", "Got it.")],
  ["defect", "vague: sent your request", T3("I have sent your request to Ray.")],
  ["defect", "timed: shortly", T3("Ray will call you back shortly. What is your number?")],
  ["defect", "timed: today", T3("Ray will call you today. What is your number?")],
  ["defect", "timed: reach out in 20 min", T3("Ray will reach out in 20 minutes. What is your number?")],
  ["defect", "timed: es pronto", "Customer: Quiero hablar con una persona.\nDesk: Claro, Ray le llamará pronto. ¿Cuál es su número?\nCustomer: 713-555-0108"],
  ["defect", "timed: es en 15 minutos", "Customer: Quiero hablar con una persona.\nDesk: Claro, Ray le llamará en 15 minutos. ¿Cuál es su número?\nCustomer: 713-555-0108"],
  ["clean", "compliant", T3("I am the front desk assistant. Ray will get your details and follow up. What is the best number?", "Thanks, Ray has your number and will follow up.")],
  ["clean", "compliant es", "Customer: Quiero hablar con una persona.\nDesk: Claro, soy la asistente. Ray recibirá sus datos y le dará seguimiento. ¿Cuál es su número?\nCustomer: 713-555-0108"],
  ["clean", "compliant + closed", T3("I am the front desk assistant. Ray will get your details and follow up (the shop is closed and opens at 7 am this morning). What is the best number?")],
]) { const flagged = (await desk.rubricClassify(shops.defaults, t)).reasons.includes("no_callback_window"); results.push({ shop: "audit-qa3", prompt: label, pass: flagged === (want === "defect") }); }
results.push({ shop: "audit", prompt: `fake rubric agrees with labels (${agree}/${LABELLED.length})`, pass: disagree.length === 0, timedPhrase: disagree.length ? "disagree ids " + disagree.join(",") : null });
const fm = fakeClient(), sys = cfg.buildSystemPrompt(shops.ownerTyped, "web", { at: OPEN });
const fin = await fm.beta.messages.stream({ system: [{ type: "text", text: sys }], messages: [{ role: "user", content: "Can I talk to a person? 713-555-0101" }], tools: [] }).finalMessage();
const fakeReply = fin.content.map((b) => b.text || "").join(" ");
results.push({ shop: "fake-desk", prompt: "person request reply", pass: !TIMED_RE.test(fakeReply) && !/within 15 minutes/.test(fakeReply), handoff: fakeReply });
const fb = [desk.STRINGS.en.fallback_window(shops.defaults, "Ray", "within 30 minutes"), desk.STRINGS.es.fallback_window(shops.defaults, "Ray", "within 30 minutes")];
results.push({ shop: "escalation", prompt: "fallback_window text en/es", pass: fb.every((t) => !/within|will call you|le llamará/.test(t)), handoff: fb.join(" | ") });

for (const r of results) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.shop.padEnd(12)} ${r.prompt.padEnd(18)} ${r.timedPhrase ? "timed: " + JSON.stringify(r.timedPhrase) : ""}`);
const failed = results.filter((r) => !r.pass).length;
const summary = { check: "callback-promise-check", repo, prompts: results.length, failed, result: failed ? "FAIL" : "PASS" };
console.log(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
process.exit(failed ? 1 : 0);
