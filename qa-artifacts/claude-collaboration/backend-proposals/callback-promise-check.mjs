// Proposal 5 acceptance check: legacy prompts no longer order a timed callback promise.
// Builds the real assembled prompts with lib/config.mjs buildSystemPrompt (web, sms, test; open, closed,
// opens-later-today) and lib/vapi.mjs voicePrompt (plain and transfer-all) for a legacy shop with the
// default rules ("within 30 minutes" / "by 8 am tomorrow") and with owner-typed values. No handler,
// no model, no network, no env needed.
// Usage: node callback-promise-check.mjs [--repo <repo root>] [--output <new json path>]
// Expected: FAILS on dfb0ae78, PASSES with 05-callback-promise.patch.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, writeFileSync } from "node:fs";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || resolve(import.meta.dirname, "../../.."));
const output = arg("--output");
if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
process.env.MC_MEMORY_STORE = "1";
const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const cfg = await import(F("lib/config.mjs"));
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
for (const r of results) console.log(`${r.pass ? "ok  " : "FAIL"} ${r.shop.padEnd(12)} ${r.prompt.padEnd(18)} ${r.timedPhrase ? "timed: " + JSON.stringify(r.timedPhrase) : ""}`);
const failed = results.filter((r) => !r.pass).length;
const summary = { check: "callback-promise-check", repo, prompts: results.length, failed, result: failed ? "FAIL" : "PASS" };
console.log(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
process.exit(failed ? 1 : 0);
