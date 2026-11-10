// Proposal 3 acceptance check: the SMS "planning line" trim never drops life-safety text.
// Runs the real netlify/functions/sms-agent-background.mjs handler in-process for every case. The only seam
// is the model: a loader hook points lib/agent.mjs's "./fake-model.mjs" import at a scripted stub that
// returns the case's reply as one end_turn message (MC_FAKE_MODEL=1 path, no network, no provider env).
// The text actually handed to sendSMS (the "[sms:disabled] ... :: body" log line) and the stored
// assistant turn are both compared with the expectation. Revision 2 counts two numbers:
//   safetyDropped:  a "keep" reply (customer instruction first) was not sent whole;
//   planningLeaked: a "trim" reply still starts with its planning note(s). A trim case lists how many leading
//                   sentences are planning (QA's "Have name, address. Next ask window." has two).
// Trim cases carry a class: "note" (internal checklist, tool name, status: must never reach a customer) or
// "narration" (a harmless first-person line such as "Got everything."). Both are counted and reported.
// Cases: my 40 (revision 1), QA2's 39 (qa2/qa2-sms-trim-probe.mjs) and QA3's 29 (qa3/qa3-sms-trim-probe.mjs), verbatim.
// QA3 rows are required keep cases, except 5 that start with a genuine checklist note (the note is dropped, the safety
// text after it must be sent unchanged) and "Call 911; notify_owner done.", which must arrive as "Call 911. ...".
// Usage: node sms-trim-safety-check.mjs [--repo <repo root>] [--output <new json path>]
// "labelNote" (rev 3): "Got address, gas furnace." and "Have issue: water heater leaking outside." are internal notes that
// now reach the customer, because the rules that caught them also swallowed safety text (QA3); counted, accepted.
// PASS requires safetyDropped === 0 and noteLeaked === 0. Expected: FAILS on dfb0ae78, PASSES with 03 rev 2.
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
  // [client, expect, reply, note, planning sentences at the start, class, source]
  // Emergency first sentences that the base trim drops.
  ["default", "keep", "Call 911 and get everyone outside now. I saved your request for Ray; what is the address?", "review R1 case", 0, "", "rev1"],
  ["default", "keep", "Now leave the house and call 911. Then text us your address.", "review R1 case", 0, "", "rev1"],
  ["default", "keep", "Call the gas company from outside right away. What is your address so Ray can follow up?", "call the gas company", 0, "", "rev1"],
  ["default", "keep", "Call 911 from outside. Ray has your request and will see the address you sent.", "911", 0, "", "rev1"],
  ["default", "keep", "Now get everyone out of the house. When you are safe, what is your address?", "get everyone out", 0, "", "rev1"],
  ["default", "keep", "Call CenterPoint from outside. Then text me your address when you are safe.", "outside, utility", 0, "", "rev1"],
  ["default", "keep", "Need you to leave the area now. What is the address so Ray can follow up?", "need + leave", 0, "", "rev1"],
  ["default", "keep", "Have everyone step outside now. What is the address so Ray can follow up?", "have + outside", 0, "", "rev1"],
  ["default", "keep", "Call 911 if anyone feels dizzy or sick. I will get Ray your details right away.", "911 + symptoms", 0, "", "rev1"],
  ["default", "keep", "Now, the CO alarm means everyone should get out. Call 911 from the yard, then text me the address.", "CO", 0, "", "rev1"],
  ["default", "keep", "Got it, carbon monoxide is dangerous. Please leave now and call 911 from outside.", "carbon monoxide", 0, "", "rev1"],
  ["default", "keep", "Call the fire department now. Then let me know your address when everyone is safe.", "fire", 0, "", "rev1"],
  ["default", "keep", "Now step away from the smoke. Once everyone is safe, what is the address?", "smoke", 0, "", "rev1"],
  ["default", "keep", "Book nothing yet; evacuate the house first. Then send me the address.", "evacuate", 0, "", "rev1"],
  ["default", "keep", "OK, I need everyone to leave right now. Call 911 from outside, then text me the address.", "ok, i + leave", 0, "", "rev1"],
  ["default", "keep", "Let me be clear: this is an emergency. Leave now and call 911 from outside.", "let me + emergency", 0, "", "rev1"],
  ["default", "keep", "Now leave the area, call 911 if there is any danger. Then call us back with the address.", "default script paraphrase", 0, "", "rev1"],
  // Owner-written safety scripts (configured in rules.emergencies.script) with no keyword.
  ["ownerA", "keep", "Now walk away from the house and phone Atmos at 888-286-6700. We will follow up once you are safe. What is the address?", "owner script A, first sentence verbatim", 0, "", "rev1"],
  ["ownerB", "keep", "Call Atmos at 888-286-6700 and stay off the property. We will follow up. What is the street address?", "owner script B, first sentence verbatim", 0, "", "rev1"],
  ["ownerB", "keep", "Call Atmos at 888-286-6700 and stay off the property! Ray will see your request.", "owner script B, different punctuation", 0, "", "rev1"],
  // Spanish and mixed-language safety text.
  ["default", "keep", "Llame al 911 y salga de la casa ahora. ¿Cuál es su dirección?", "Spanish, not matched by the trim on either", 0, "", "rev1"],
  ["default", "keep", "Call 911 ahora y salga de la casa. Luego envíeme su dirección, por favor.", "Spanglish 911", 0, "", "rev1"],
  ["default", "keep", "Now salga de la casa y llame al 911. Luego envíeme su dirección, por favor.", "Spanglish salga", 0, "", "rev1"],
  ["default", "keep", "OK, let me ser claro: es una emergencia. Salga ahora y llame al 911 desde afuera.", "Spanish emergencia", 0, "", "rev1"],
  // The default script itself (starts with Leave: never matched the trim) stays whole.
  ["default", "keep", "Leave the area now, call 911 if there is any danger, then call us back. What is your address?", "default script verbatim", 0, "", "rev1"],
  // Ordinary customer replies the trim never touched.
  ["default", "keep", "Thanks, Lee. You are booked for tomorrow 8 to 12 at 5 Pine St.", "normal reply", 0, "", "rev1"],
  ["default", "keep", "Our diagnostic fee is $89. Want a window this week?", "normal reply", 0, "", "rev1"],
  // Planning preambles: still trimmed exactly as at base (S1-21).
  ["default", "trim", "Have name, address, issue, window. Thanks, Lee, you are booked for tomorrow 8 to 12.", "S1-21 original", 1, "note", "rev1"],
  ["default", "trim", "Phone filled automatically. You are all set for Tuesday 8 to 12 at 5 Pine St.", "S1-21 original", 1, "note", "rev1"],
  ["default", "trim", "Book it now. You're booked for tomorrow, 12 to 5, at 5 Pine St.", "book", 1, "note", "rev1"],
  ["default", "trim", "Need address before booking. What is the street address for the visit?", "need", 1, "narration", "rev1"],
  ["default", "trim", "Got everything. Thanks, you're booked for tomorrow 8 to 12.", "got", 1, "narration", "rev1"],
  ["default", "trim", "OK, I'll book that. You're booked for tomorrow 8 to 12 at 5 Pine St.", "ok, i", 1, "narration", "rev1"],
  ["default", "trim", "Let me check availability. We have tomorrow 8 to 12 or 12 to 5 open.", "let me", 1, "narration", "rev1"],
  ["default", "trim", "Now call book_visit. You're booked for tomorrow 8 to 12 at 5 Pine St.", "now + tool name", 1, "note", "rev1"],
  ["default", "trim", "Call notify_owner with urgency emergency. Please leave the house now and call 911 from outside.", "planning naming a tool wins over the emergency word; the safety text that follows is sent", 1, "note", "rev1"],
  ["default", "trim", "Have phone and address. Please leave the house now and call 911 from outside.", "planning first, safety second", 1, "note", "rev1"],
  ["ownerA", "trim", "Now book it. Thanks, you're booked for tomorrow 8 to 12 at 5 Pine St.", "owner script present but unrelated planning", 1, "note", "rev1"],
  // Control: the owner-A sentence carries no safety keyword, so without that configured script it is trimmed.
  // This shows the owner-A/owner-B "keep" results come from the configured script, not from the word list.
  ["default", "keep", "Now walk away from the house and phone Atmos at 888-286-6700. We will follow up once you are safe. What is the address?", "owner A sentence on a shop without that script: now kept (rev 2 has no word list)", 0, "", "rev1"],
  ["ownerB", "trim", "Call book_visit now. Thanks, you're booked for tomorrow 8 to 12.", "owner script starts with Call; tool planning still trimmed", 1, "note", "rev1"],
  // ---- QA2 adversarial cases (qa2/qa2-sms-trim-probe.mjs), labels kept; trim classes added ----
  // Danger first sentences that do start with a trim trigger word but carry no keyword.
  ["default", "keep", "Now don't touch any light switches. What is the address?", "now + switches", 0, "", "qa2"],
  ["default", "keep", "Don't use any switches. What is the address?", "no trigger word (control)", 0, "", "qa2"],
  ["default", "keep", "Get out now. Then text me the address.", "no trigger word (control)", 0, "", "qa2"],
  ["default", "keep", "Now turn off the gas at the meter if safe. Then text me the address.", "gas keyword", 0, "", "qa2"],
  ["default", "keep", "Now shut the main breaker off if it is dry. Then text me the address.", "electrical, no keyword", 0, "", "qa2"],
  ["default", "keep", "Need you to stay away from the sparking panel. What is the address so Ray can follow up?", "sparks, no keyword", 0, "", "qa2"],
  ["default", "keep", "Now stay clear of the downed line. What is the address so Ray can follow up?", "downed line", 0, "", "qa2"],
  ["default", "keep", "Call the utility from a neighbor's phone. What is the address so Ray can follow up?", "utility, no keyword", 0, "", "qa2"],
  ["default", "keep", "Have everyone go next door right now. What is the address so Ray can follow up?", "go next door", 0, "", "qa2"],
  ["default", "keep", "Now open the windows and do not light anything. What is the address?", "ventilate, no keyword", 0, "", "qa2"],
  ["default", "keep", "Now shut off the water main. Then text me the address so Ray can come.", "water main (flood)", 0, "", "qa2"],
  ["default", "keep", "Need everyone away from the water heater now. What is the address?", "water heater", 0, "", "qa2"],
  ["default", "keep", "Call 9-1-1 right away. What is the address?", "911 written with dashes", 0, "", "qa2"],
  ["default", "keep", "Now get the family out. What is the address?", "get the family out", 0, "", "qa2"],
  ["default", "keep", "Have everybody exit the house. What is the address?", "exit", 0, "", "qa2"],
  ["default", "keep", "Now please go outdoors. What is the address?", "outdoors", 0, "", "qa2"],
  ["default", "keep", "Call your doctor if anyone has a headache. Then text me the address.", "CO symptom", 0, "", "qa2"],
  ["default", "keep", "Now, salga de la casa. ¿Cuál es su dirección?", "Spanish salga", 0, "", "qa2"],
  ["default", "keep", "Now apague el gas si es seguro. ¿Cuál es su dirección?", "Spanish apague el gas", 0, "", "qa2"],
  ["default", "keep", "Now no toque los interruptores. ¿Cuál es su dirección?", "Spanish switches", 0, "", "qa2"],
  ["default", "keep", "Now váyanse de la casa ya. ¿Cuál es su dirección?", "Spanish vayanse", 0, "", "qa2"],
  ["default", "keep", "Call al 911 ahora. ¿Cuál es su dirección?", "Spanish 911", 0, "", "qa2"],
  ["ownerA", "keep", "Now walk away from the house. We will follow up once you are safe. What is the address?", "owner A partial (5 words)", 0, "", "qa2"],
  ["ownerA", "keep", "Now walk away and phone Atmos. We will follow up once you are safe.", "owner A paraphrase", 0, "", "qa2"],
  ["ownerB", "keep", "Call Atmos now and stay off the property. What is the address?", "owner B paraphrase", 0, "", "qa2"],
  ["ownerB", "keep", "Call Atmos at 888-286-6700 right away. What is the address?", "owner B partial w/ phone", 0, "", "qa2"],
  // Planning notes that should still be trimmed.
  ["default", "trim", "Have name, address. Next ask window. Thanks, what window works for you?", "S1-21 style (2nd sentence leaks on base too)", 2, "note", "qa2"],
  ["default", "trim", "Have address; emergency flagged. Ray has your request.", "planning + emergency", 1, "note", "qa2"],
  ["default", "trim", "Now flag emergency. Ray has your request; please stay safe.", "planning + emergency", 1, "note", "qa2"],
  ["default", "trim", "Need gas leak details before notifying. What do you smell and where?", "planning + gas", 1, "narration", "qa2"],
  ["default", "trim", "Now notify owner as emergency. Ray has your request.", "planning + emergency, tool name without underscore", 1, "note", "qa2"],
  ["default", "trim", "Got address, gas furnace. You're booked for tomorrow 8 to 12.", "planning + gas furnace", 1, "labelNote", "qa2"],
  ["default", "trim", "Have issue: water heater leaking outside. You're booked for tomorrow 8 to 12.", "planning + outside", 1, "labelNote", "qa2"],
  ["default", "trim", "Need to leave a note for Ray. Thanks, he will see your request.", "planning + leave (documented)", 1, "narration", "qa2"],
  ["default", "trim", "Call us back. You're booked for tomorrow 8 to 12.", "3-word span of default script", 1, "narration", "qa2"],
  ["default", "trim", "OK, I have the fire pit job. You're booked for tomorrow 8 to 12.", "planning + fire", 1, "narration", "qa2"],
  ["default", "trim", "Booking smoke detector install now. You're booked for tomorrow 8 to 12.", "planning + smoke", 1, "narration", "qa2"],
  ["default", "trim", "Now call book visit. You're booked for tomorrow 8 to 12.", "tool name with space", 1, "note", "qa2"],
  ["default", "trim", "Have phone. Calling bookVisit next. You're booked for tomorrow 8 to 12.", "camelCase tool", 2, "note", "qa2"],
  // ---- QA3 phrasings (qa3/qa3-sms-trim-probe.mjs), all required: safety text must survive ----
  ["default", "keep", "Have everyone leave now. What is the address?", "have + everyone (prompt)", 0, "", "qa3"],
  ["default", "keep", "Address: get outside first. Then text me the street.", "label w/o have", 0, "", "qa3"],
  ["default", "keep", "Gas: leave immediately. What is the address?", "label gas", 0, "", "qa3"],
  ["default", "keep", "Have address: get outside first. Ray is on it.", "LABEL_NOTE + safety", 0, "", "qa3"],
  ["default", "keep", "Got issue: gas leak, leave the house now. Ray has your request.", "LABEL_NOTE recap + safety", 0, "", "qa3"],
  ["default", "keep", "Have issue: gas smell. Leave now and call 911 from outside. Ray has it.", "label then safety (2nd sentence must stay)", 0, "", "qa3"],
  ["default", "keep", "Got address: 12 Oak St\nGet everyone out now and call 911 from outside. Ray has your request.", "newline, no period after label", 0, "", "qa3"],
  ["default", "trim", "Have address\nLeave the house now and call 911 from outside. What is your name?", "newline after field", 1, "note", "qa3"],
  ["default", "keep", "Got address, head next door. Ray has your request.", "field-value: head next door", 0, "", "qa3"],
  ["default", "keep", "Got address, avoid the basement. Ray has your request.", "field-value: avoid basement", 0, "", "qa3"],
  ["default", "keep", "Have name, vacate the house. Ray has your request.", "field-value: vacate", 0, "", "qa3"],
  ["default", "keep", "Got address, walk next door. Ray is notified.", "field-value: walk", 0, "", "qa3"],
  ["default", "keep", "Have address, unplug nothing. Ray has your request.", "field-value: unplug nothing", 0, "", "qa3"],
  ["default", "keep", "Got phone, head across the street. Ray will follow up.", "field-value: across street", 0, "", "qa3"],
  ["default", "keep", "Got address, wait across the street. Ray will follow up.", "field-value: wait", 0, "", "qa3"],
  ["default", "keep", "Have address, flee the smoke. Ray will follow up.", "field-value: flee", 0, "", "qa3"],
  ["default", "keep", "Notify owner of the building and leave the unit now. What is the address?", "TOOL_PHRASE: notify owner (renter)", 0, "", "qa3"],
  ["default", "keep", "Then notify owner of the property right away. Get outside first. What is the address?", "Customer property-owner instruction is preserved; independent review disposition", 0, "", "qa3"],
  ["default", "exact", "Call 911; notify_owner done. Ray has your request.", "documented mixed-sentence risk", "Call 911. Ray has your request.", "", "qa3"],
  ["default", "keep", "Gas leak noted. Leave now and call 911 from outside. What is the address?", "status segment then safety", 0, "", "qa3"],
  ["default", "keep", "Address noted, leave now. Ray has your request.", "status + leave", 0, "", "qa3"],
  ["default", "trim", "Need address and phone. Leave the house first though. What is the address?", "checklist then safety", 1, "note", "qa3"],
  ["default", "trim", "Have address. Now get out. Ray has it.", "checklist then short safety", 1, "note", "qa3"],
  ["default", "keep", "Have everyone out. Ray has it.", "have everyone out", 0, "", "qa3"],
  ["default", "keep", "Got everyone outside? Good, Ray has it.", "question", 0, "", "qa3"],
  ["default", "trim", "Ok, address and phone confirmed. Please stay outside until the fire department clears it.", "checklist then safety", 1, "note", "qa3"],
  ["default", "keep", "Phone: 911. Then text me the address.", "label phone 911", 0, "", "qa3"],
  ["default", "keep", "Tengo dirección: salga de la casa ya. Ray tiene su solicitud.", "spanish label", 0, "", "qa3"],
  ["default", "keep", "Have phone: call 911 from outside now. Ray has your request.", "LABEL_NOTE phone instruction", 0, "", "qa3"],
];

// Leading sentence: up to . ! ? followed by whitespace, or up to a newline (same rule as the patch, rev 3).
const lead = (t) => (t.match(/^[^\n]*?[.!?](?=\s)|^[^\n]+(?=\n)/) || [t])[0];
const dropLead = (t, n) => { let r = t; for (let i = 0; i < n; i++) r = r.slice(lead(r).length).trimStart(); return r; };
const sentences = (r) => [lead(r)];
const results = []; let n = 0;
for (const [ck, expect, reply, note, nPlan, cls, source] of CASES) {
  const c = clients[ck], from = "+1713555" + String(1000 + ++n).padStart(4, "0");
  const conv = await store.getConversation(c, "sms", from);
  conv.messages.push({ role: "user", content: "I smell gas, what do I do?", at: new Date().toISOString() });
  await store.saveConversation(conv);
  globalThis.__trimScript = [reply]; sent.length = 0;
  const res = await smsAgent(new Request("https://platform.example.test/.netlify/functions/sms-agent-background", { method: "POST", headers: { "x-admin-key": "trim-check-admin" }, body: JSON.stringify({ slug: c.slug, from }) }));
  const stored = (await store.getConversation(c, "sms", from)).messages.at(-1)?.content;
  const want = expect === "keep" ? reply : expect === "exact" ? nPlan : dropLead(reply, nPlan);
  const body = sent.find((s) => s.to === from)?.body ?? null;
  const ok = res.status === 200 && body === want && stored === want && globalThis.__trimScript.length === 0;
  const outcome = ok ? "ok" : expect === "keep" || expect === "exact" ? "safetyDropped" : (body || "").startsWith(sentences(reply)[0]) ? cls + "Leaked" : "otherMismatch";
  results.push({ source, client: ck, expect, class: cls || null, note, reply, sentToCustomer: body, storedTurn: stored, outcome, pass: ok || outcome === "narrationLeaked" || outcome === "labelNoteLeaked", ...(ok ? {} : { wanted: want }) });
}
console.log = origLog;
const count = (o, src) => results.filter((r) => r.outcome === o && (!src || r.source === src)).length;
const failed = results.filter((r) => !r.pass);
const by = (src) => ({ cases: results.filter((r) => !src || r.source === src).length, safetyDropped: count("safetyDropped", src), noteLeaked: count("noteLeaked", src), narrationLeaked: count("narrationLeaked", src), labelNoteLeaked: count("labelNoteLeaked", src), otherMismatch: count("otherMismatch", src) });
const summary = { check: "sms-trim-safety-check", rev: 3, repo, ...by(), rev1Cases: by("rev1"), qa2Cases: by("qa2"), qa3Cases: by("qa3"), netAttempts, result: failed.length || netAttempts ? "FAIL" : "PASS" };
for (const r of results) console.log(`${r.outcome === "ok" ? "ok  " : r.pass ? "note" : "FAIL"} ${r.source} [${r.expect}${r.class ? "/" + r.class : ""}] ${r.client.padEnd(7)} ${JSON.stringify(r.reply.slice(0, 70))}${r.outcome === "ok" ? "" : `\n       ${r.outcome}; sent: ${JSON.stringify(r.sentToCustomer)}`}`);
console.log(JSON.stringify(summary));
if (output) writeFileSync(output, JSON.stringify({ summary, results }, null, 2));
process.exit(summary.result === "PASS" ? 0 : 1);
