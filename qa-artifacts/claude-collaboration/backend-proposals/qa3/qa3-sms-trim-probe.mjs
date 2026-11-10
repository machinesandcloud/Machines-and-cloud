// Proposal 3 acceptance check: the SMS "planning line" trim never drops life-safety text.
// Runs the real netlify/functions/sms-agent-background.mjs handler in-process for every case. The only seam
// is the model: a loader hook points lib/agent.mjs's "./fake-model.mjs" import at a scripted stub that
// returns the case's reply as one end_turn message (MC_FAKE_MODEL=1 path, no network, no provider env).
// The text actually handed to sendSMS (the "[sms:disabled] ... :: body" log line) and the stored
// assistant turn are both compared with the expectation:
//   keep: the whole reply is sent;
//   trim: the first sentence is dropped exactly as before (the S1-21 planning-text cases still work).
// Usage: node sms-trim-safety-check.mjs [--repo <repo root>] [--output <new json path>]
// Expected: FAILS on dfb0ae78 (safety first sentences are dropped), PASSES with 03-sms-trim-safety.patch.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { register, syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || resolve(import.meta.dirname, "../../.."));
const output = arg("--output");
if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
const deny = () => { throw new Error("qa3 probe denies real networking"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
let netAttempts = 0; globalThis.fetch = async () => { netAttempts++; deny(); };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|CALENDAR_|MANAGED_|PHONE_|SERVICE_|MC_TWILIO|MC_MESSAGING|STEVE_|ADMIN_KEY|DEPLOY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", ADMIN_KEY: "trim-check-admin", URL: "https://platform.example.test" });

// Scripted model: each runAgent call takes the next queued reply.
const stub = `export function fakeClient() {
  const stream = () => { const t = (globalThis.__trimScript || []).shift() ?? "OK.";
    const final = { stop_reason: "end_turn", content: [{ type: "text", text: t }], usage: { input_tokens: 1, output_tokens: 1 } };
    return { async *[Symbol.asyncIterator]() { yield { type: "content_block_delta", delta: { type: "text_delta", text: t } }; }, finalMessage: async () => final }; };
  return { messages: { create: async () => { throw new Error("not scripted"); }, stream }, beta: { messages: { create: async () => { throw new Error("not scripted"); }, stream } } };
}`;
const stubURL = "data:text/javascript," + encodeURIComponent(stub);
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, ctx, next) {
  if (s === "./fake-model.mjs" && ctx.parentURL?.endsWith("/netlify/functions/lib/agent.mjs")) return { url: ${JSON.stringify(stubURL)}, shortCircuit: true };
  return next(s, ctx); }`));

const sent = []; const origLog = console.log, origErr = console.error;
console.log = (...a) => { const s = a.map(String).join(" "); const m = s.match(/^\[sms:disabled\] to=(\S+) from=\S+ :: ([\s\S]*)$/); if (m) sent.push({ to: m[1], body: m[2] }); };
console.error = (...a) => origErr("[handler error]", ...a.map((x) => x instanceof Error ? x.message : x));

const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs"));
const cfg = await import(F("lib/config.mjs"));
const smsAgent = (await import(F("sms-agent-background.mjs"))).default;

function legacyClient(slug, script) {
  const c = cfg.newClient({ slug, ownerKey: "owner-" + slug, owner: { name: "Ray", email: "", phone: "" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sat 7am-7pm" } });
  Object.assign(c, { status: "live", services: ["AC repair"], windows: ["8 to 12", "12 to 5"] });
  if (script !== undefined) c.rules.emergencies = { ...cfg.normalizeEmergencies(null, "HVAC"), script };
  return c;
}
const OWNER_A = "Now walk away from the house and phone Atmos at 888-286-6700. We will follow up once you are safe.";
const OWNER_B = "Call Atmos at 888-286-6700 and stay off the property. We will follow up.";
const clients = { default: legacyClient("trim-default"), ownerA: legacyClient("trim-owner-a", OWNER_A), ownerB: legacyClient("trim-owner-b", OWNER_B) };
for (const c of Object.values(clients)) await store.saveClient(c);

// QA3 adversarial cases: safety instructions shaped like checklists, labelled notes, field-value notes, tool phrases.
// Every case is "keep": the customer must receive the whole reply (it carries a safety instruction).
const CASES = [
  ["default","Have everyone leave now. What is the address?","have + everyone (prompt)"],
  ["default","Address: get outside first. Then text me the street.","label w/o have"],
  ["default","Gas: leave immediately. What is the address?","label gas"],
  ["default","Have address: get outside first. Ray is on it.","LABEL_NOTE + safety"],
  ["default","Got issue: gas leak, leave the house now. Ray has your request.","LABEL_NOTE recap + safety"],
  ["default","Have issue: gas smell. Leave now and call 911 from outside. Ray has it.","label then safety (2nd sentence must stay)"],
  ["default","Got address: 12 Oak St\nGet everyone out now and call 911 from outside. Ray has your request.","newline, no period after label"],
  ["default","Have address\nLeave the house now and call 911 from outside. What is your name?","newline after field"],
  ["default","Got address, head next door. Ray has your request.","field-value: head next door"],
  ["default","Got address, avoid the basement. Ray has your request.","field-value: avoid basement"],
  ["default","Have name, vacate the house. Ray has your request.","field-value: vacate"],
  ["default","Got address, walk next door. Ray is notified.","field-value: walk"],
  ["default","Have address, unplug nothing. Ray has your request.","field-value: unplug nothing"],
  ["default","Got phone, head across the street. Ray will follow up.","field-value: across street"],
  ["default","Got address, wait across the street. Ray will follow up.","field-value: wait"],
  ["default","Have address, flee the smoke. Ray will follow up.","field-value: flee"],
  ["default","Notify owner of the building and leave the unit now. What is the address?","TOOL_PHRASE: notify owner (renter)"],
  ["default","Then notify owner of the property right away. Get outside first. What is the address?","TOOL_PHRASE then safety"],
  ["default","Call 911; notify_owner done. Ray has your request.","documented mixed-sentence risk"],
  ["default","Gas leak noted. Leave now and call 911 from outside. What is the address?","status segment then safety"],
  ["default","Address noted, leave now. Ray has your request.","status + leave"],
  ["default","Need address and phone. Leave the house first though. What is the address?","checklist then safety"],
  ["default","Have address. Now get out. Ray has it.","checklist then short safety"],
  ["default","Have everyone out. Ray has it.","have everyone out"],
  ["default","Got everyone outside? Good, Ray has it.","question"],
  ["default","Ok, address and phone confirmed. Please stay outside until the fire department clears it.","checklist then safety"],
  ["default","Phone: 911. Then text me the address.","label phone 911"],
  ["default","Tengo dirección: salga de la casa ya. Ray tiene su solicitud.","spanish label"],
  ["default","Have phone: call 911 from outside now. Ray has your request.","LABEL_NOTE phone instruction"],
];
const results = []; let n = 0;
for (const [ck, reply, note] of CASES) {
  const c = clients[ck], from = "+1713556" + String(1000 + ++n).padStart(4, "0");
  const conv = await store.getConversation(c, "sms", from);
  conv.messages.push({ role: "user", content: "I smell gas, what do I do?", at: new Date().toISOString() });
  await store.saveConversation(conv);
  globalThis.__trimScript = [reply]; sent.length = 0;
  const res = await smsAgent(new Request("https://platform.example.test/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": "trim-check-admin" }, body: JSON.stringify({ slug: c.slug, from }) }));
  const body = sent.find((s) => s.to === from)?.body ?? null;
  const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const pass = res.status === 200 && norm(body) === norm(reply);
  results.push({ note, reply, sentToCustomer: body, pass });
}
console.log = origLog;
for (const r of results) console.log(`${r.pass ? "kept   " : "DROPPED"} ${JSON.stringify(r.reply)}  [${r.note}]${r.pass ? "" : `\n        sent: ${JSON.stringify(r.sentToCustomer)}`}`);
const failed = results.filter((r) => !r.pass);
const summary = { check: "qa3-sms-trim-probe", repo, cases: results.length, safetyAltered: failed.length, netAttempts };
console.log(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
