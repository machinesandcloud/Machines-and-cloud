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
const deny = () => { throw new Error("sms-trim-safety-check denies real networking"); };
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

// [client, expectation, reply, note]
const CASES = [
  // Emergency first sentences that the base trim drops.
  ["default", "keep", "Call 911 and get everyone outside now. I saved your request for Ray; what is the address?", "review R1 case"],
  ["default", "keep", "Now leave the house and call 911. Then text us your address.", "review R1 case"],
  ["default", "keep", "Call the gas company from outside right away. What is your address so Ray can follow up?", "call the gas company"],
  ["default", "keep", "Call 911 from outside. Ray has your request and will see the address you sent.", "911"],
  ["default", "keep", "Now get everyone out of the house. When you are safe, what is your address?", "get everyone out"],
  ["default", "keep", "Call CenterPoint from outside. Then text me your address when you are safe.", "outside, utility"],
  ["default", "keep", "Need you to leave the area now. What is the address so Ray can follow up?", "need + leave"],
  ["default", "keep", "Have everyone step outside now. What is the address so Ray can follow up?", "have + outside"],
  ["default", "keep", "Call 911 if anyone feels dizzy or sick. I will get Ray your details right away.", "911 + symptoms"],
  ["default", "keep", "Now, the CO alarm means everyone should get out. Call 911 from the yard, then text me the address.", "CO"],
  ["default", "keep", "Got it, carbon monoxide is dangerous. Please leave now and call 911 from outside.", "carbon monoxide"],
  ["default", "keep", "Call the fire department now. Then let me know your address when everyone is safe.", "fire"],
  ["default", "keep", "Now step away from the smoke. Once everyone is safe, what is the address?", "smoke"],
  ["default", "keep", "Book nothing yet; evacuate the house first. Then send me the address.", "evacuate"],
  ["default", "keep", "OK, I need everyone to leave right now. Call 911 from outside, then text me the address.", "ok, i + leave"],
  ["default", "keep", "Let me be clear: this is an emergency. Leave now and call 911 from outside.", "let me + emergency"],
  ["default", "keep", "Now leave the area, call 911 if there is any danger. Then call us back with the address.", "default script paraphrase"],
  // Owner-written safety scripts (configured in rules.emergencies.script) with no keyword.
  ["ownerA", "keep", "Now walk away from the house and phone Atmos at 888-286-6700. We will follow up once you are safe. What is the address?", "owner script A, first sentence verbatim"],
  ["ownerB", "keep", "Call Atmos at 888-286-6700 and stay off the property. We will follow up. What is the street address?", "owner script B, first sentence verbatim"],
  ["ownerB", "keep", "Call Atmos at 888-286-6700 and stay off the property! Ray will see your request.", "owner script B, different punctuation"],
  // Spanish and mixed-language safety text.
  ["default", "keep", "Llame al 911 y salga de la casa ahora. ¿Cuál es su dirección?", "Spanish, not matched by the trim on either"],
  ["default", "keep", "Call 911 ahora y salga de la casa. Luego envíeme su dirección, por favor.", "Spanglish 911"],
  ["default", "keep", "Now salga de la casa y llame al 911. Luego envíeme su dirección, por favor.", "Spanglish salga"],
  ["default", "keep", "OK, let me ser claro: es una emergencia. Salga ahora y llame al 911 desde afuera.", "Spanish emergencia"],
  // The default script itself (starts with Leave: never matched the trim) stays whole.
  ["default", "keep", "Leave the area now, call 911 if there is any danger, then call us back. What is your address?", "default script verbatim"],
  // Ordinary customer replies the trim never touched.
  ["default", "keep", "Thanks, Lee. You are booked for tomorrow 8 to 12 at 5 Pine St.", "normal reply"],
  ["default", "keep", "Our diagnostic fee is $89. Want a window this week?", "normal reply"],
  // Planning preambles: still trimmed exactly as at base (S1-21).
  ["default", "trim", "Have name, address, issue, window. Thanks, Lee, you are booked for tomorrow 8 to 12.", "S1-21 original"],
  ["default", "trim", "Phone filled automatically. You are all set for Tuesday 8 to 12 at 5 Pine St.", "S1-21 original"],
  ["default", "trim", "Book it now. You're booked for tomorrow, 12 to 5, at 5 Pine St.", "book"],
  ["default", "trim", "Need address before booking. What is the street address for the visit?", "need"],
  ["default", "trim", "Got everything. Thanks, you're booked for tomorrow 8 to 12.", "got"],
  ["default", "trim", "OK, I'll book that. You're booked for tomorrow 8 to 12 at 5 Pine St.", "ok, i"],
  ["default", "trim", "Let me check availability. We have tomorrow 8 to 12 or 12 to 5 open.", "let me"],
  ["default", "trim", "Now call book_visit. You're booked for tomorrow 8 to 12 at 5 Pine St.", "now + tool name"],
  ["default", "trim", "Call notify_owner with urgency emergency. Please leave the house now and call 911 from outside.", "planning naming a tool wins over the emergency word; the safety text that follows is sent"],
  ["default", "trim", "Have phone and address. Please leave the house now and call 911 from outside.", "planning first, safety second"],
  ["ownerA", "trim", "Now book it. Thanks, you're booked for tomorrow 8 to 12 at 5 Pine St.", "owner script present but unrelated planning"],
  // Control: the owner-A sentence carries no safety keyword, so without that configured script it is trimmed.
  // This shows the owner-A/owner-B "keep" results come from the configured script, not from the word list.
  ["default", "trim", "Now walk away from the house and phone Atmos at 888-286-6700. We will follow up once you are safe. What is the address?", "control: owner A text on a shop without that script"],
  ["ownerB", "trim", "Call book_visit now. Thanks, you're booked for tomorrow 8 to 12.", "owner script starts with Call; tool planning still trimmed"],
];

const firstSentence = (r) => r.split(/(?<=[.!?])\s+/)[0] || "";
const results = []; let n = 0;
for (const [ck, expect, reply, note] of CASES) {
  const c = clients[ck], from = "+1713555" + String(1000 + ++n).padStart(4, "0");
  const conv = await store.getConversation(c, "sms", from);
  conv.messages.push({ role: "user", content: "I smell gas, what do I do?", at: new Date().toISOString() });
  await store.saveConversation(conv);
  globalThis.__trimScript = [reply]; sent.length = 0;
  const res = await smsAgent(new Request("https://platform.example.test/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": "trim-check-admin" }, body: JSON.stringify({ slug: c.slug, from }) }));
  const stored = (await store.getConversation(c, "sms", from)).messages.at(-1)?.content;
  const want = expect === "keep" ? reply : reply.slice(firstSentence(reply).length).trim();
  const body = sent.find((s) => s.to === from)?.body ?? null;
  const pass = res.status === 200 && body === want && stored === want && globalThis.__trimScript.length === 0;
  results.push({ client: ck, expect, note, reply, sentToCustomer: body, storedTurn: stored, pass, ...(pass ? {} : { wanted: want }) });
}
console.log = origLog;
const failed = results.filter((r) => !r.pass);
const summary = { check: "sms-trim-safety-check", repo, cases: results.length, keep: results.filter((r) => r.expect === "keep").length, trim: results.filter((r) => r.expect === "trim").length, failed: failed.length, netAttempts, result: failed.length || netAttempts ? "FAIL" : "PASS" };
for (const r of results) console.log(`${r.pass ? "ok  " : "FAIL"} [${r.expect}] ${r.client.padEnd(7)} ${JSON.stringify(r.reply.slice(0, 70))}${r.pass ? "" : `\n       sent: ${JSON.stringify(r.sentToCustomer)}`}`);
console.log(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
process.exit(summary.result === "PASS" ? 0 : 1);
