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
const deny = () => { throw new Error("sms-trim-safety-check qa2 probe denies real networking"); };
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

// QA2 adversarial cases. "keep" = customer-safety text that must be sent; "trim" = planning note that should not reach the customer.
const CASES = [
  // Danger first sentences that do start with a trim trigger word but carry no keyword.
  ["default","keep","Now don't touch any light switches. What is the address?","now + switches"],
  ["default","keep","Don't use any switches. What is the address?","no trigger word (control)"],
  ["default","keep","Get out now. Then text me the address.","no trigger word (control)"],
  ["default","keep","Now turn off the gas at the meter if safe. Then text me the address.","gas keyword"],
  ["default","keep","Now shut the main breaker off if it is dry. Then text me the address.","electrical, no keyword"],
  ["default","keep","Need you to stay away from the sparking panel. What is the address so Ray can follow up?","sparks, no keyword"],
  ["default","keep","Now stay clear of the downed line. What is the address so Ray can follow up?","downed line"],
  ["default","keep","Call the utility from a neighbor's phone. What is the address so Ray can follow up?","utility, no keyword"],
  ["default","keep","Have everyone go next door right now. What is the address so Ray can follow up?","go next door"],
  ["default","keep","Now open the windows and do not light anything. What is the address?","ventilate, no keyword"],
  ["default","keep","Now shut off the water main. Then text me the address so Ray can come.","water main (flood)"],
  ["default","keep","Need everyone away from the water heater now. What is the address?","water heater"],
  ["default","keep","Call 9-1-1 right away. What is the address?","911 written with dashes"],
  ["default","keep","Now get the family out. What is the address?","get the family out"],
  ["default","keep","Have everybody exit the house. What is the address?","exit"],
  ["default","keep","Now please go outdoors. What is the address?","outdoors"],
  ["default","keep","Call your doctor if anyone has a headache. Then text me the address.","CO symptom"],
  ["default","keep","Now, salga de la casa. ¿Cuál es su dirección?","Spanish salga"],
  ["default","keep","Now apague el gas si es seguro. ¿Cuál es su dirección?","Spanish apague el gas"],
  ["default","keep","Now no toque los interruptores. ¿Cuál es su dirección?","Spanish switches"],
  ["default","keep","Now váyanse de la casa ya. ¿Cuál es su dirección?","Spanish vayanse"],
  ["default","keep","Call al 911 ahora. ¿Cuál es su dirección?","Spanish 911"],
  ["ownerA","keep","Now walk away from the house. We will follow up once you are safe. What is the address?","owner A partial (5 words)"],
  ["ownerA","keep","Now walk away and phone Atmos. We will follow up once you are safe.","owner A paraphrase"],
  ["ownerB","keep","Call Atmos now and stay off the property. What is the address?","owner B paraphrase"],
  ["ownerB","keep","Call Atmos at 888-286-6700 right away. What is the address?","owner B partial w/ phone"],
  // Planning notes that should still be trimmed.
  ["default","trim","Have name, address. Next ask window. Thanks, what window works for you?","S1-21 style (2nd sentence leaks on base too)"],
  ["default","trim","Have address; emergency flagged. Ray has your request.","planning + emergency"],
  ["default","trim","Now flag emergency. Ray has your request; please stay safe.","planning + emergency"],
  ["default","trim","Need gas leak details before notifying. What do you smell and where?","planning + gas"],
  ["default","trim","Now notify owner as emergency. Ray has your request.","planning + emergency, tool name without underscore"],
  ["default","trim","Got address, gas furnace. You're booked for tomorrow 8 to 12.","planning + gas furnace"],
  ["default","trim","Have issue: water heater leaking outside. You're booked for tomorrow 8 to 12.","planning + outside"],
  ["default","trim","Need to leave a note for Ray. Thanks, he will see your request.","planning + leave (documented)"],
  ["default","trim","Call us back. You're booked for tomorrow 8 to 12.","3-word span of default script"],
  ["default","trim","OK, I have the fire pit job. You're booked for tomorrow 8 to 12.","planning + fire"],
  ["default","trim","Booking smoke detector install now. You're booked for tomorrow 8 to 12.","planning + smoke"],
  ["default","trim","Now call book visit. You're booked for tomorrow 8 to 12.","tool name with space"],
  ["default","trim","Have phone. Calling bookVisit next. You're booked for tomorrow 8 to 12.","camelCase tool"],
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
const summary = { check: "qa2-sms-trim-probe", repo, cases: results.length, keep: results.filter((r) => r.expect === "keep").length, trim: results.filter((r) => r.expect === "trim").length, failed: failed.length, netAttempts, result: failed.length || netAttempts ? "FAIL" : "PASS" };
for (const r of results) console.log(`${r.pass ? "ok  " : "FAIL"} [${r.expect}] ${r.client.padEnd(7)} ${JSON.stringify(r.reply.slice(0, 70))}${r.pass ? "" : `\n       sent: ${JSON.stringify(r.sentToCustomer)}`}`);
console.log(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
process.exit(summary.result === "PASS" ? 0 : 1);
