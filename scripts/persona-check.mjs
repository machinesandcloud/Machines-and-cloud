// Offline full-handler checks. No .env loading, model requests or provider traffic.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const sourceFiles = ["netlify/functions/chat.mjs", "netlify/functions/lib/practice-personas.mjs", "netlify/functions/lib/fake-model.mjs", "netlify/functions/lib/agent.mjs", "scripts/persona-check.mjs"];
const hash = input => createHash("sha256").update(input).digest("hex");
const sourceSnapshot = () => Object.fromEntries(sourceFiles.map(file => [file, hash(readFileSync(new URL("../" + file, import.meta.url)))]));
const source = sourceSnapshot();
let unexpected = 0;
const blocked = () => { unexpected++; throw new Error("Network disabled by persona-check"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = blocked;
syncBuiltinESMExports();
for (const key of ["ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY", "STEVE_PHONE", "MC_TWILIO_NUMBER", "MC_MESSAGING_SERVICE_SID"]) delete process.env[key];
process.env.MC_FAKE_MODEL = "1";
process.env.MC_MEMORY_STORE = "1";
process.env.URL = "http://127.0.0.1:8893";
process.env.ADMIN_KEY = "offline-persona-admin";
globalThis.fetch = blocked;
const { default: chat } = await import("../netlify/functions/chat.mjs");
const { OWNER_SUMMARY } = await import("../netlify/functions/lib/practice-personas.mjs");
assert.equal(OWNER_SUMMARY.strict, true);
assert.deepEqual(OWNER_SUMMARY.input_schema.properties.requested_action.enum, ["visit_request", "callback", "question_only", "emergency_handoff"]);
assert.ok(OWNER_SUMMARY.input_schema.required.includes("requested_action"));
assert.match(OWNER_SUMMARY.input_schema.properties.issue.description, /English/);
assert.match(OWNER_SUMMARY.input_schema.properties.requested_window.description, /English/);
assert.match(OWNER_SUMMARY.input_schema.properties.customer_name.description, /verbatim/);
assert.match(OWNER_SUMMARY.input_schema.properties.address.description, /verbatim/);
const store = await import("../netlify/functions/lib/store.mjs");
const kinds = ["clients", "index", "bookings", "leads", "tasks", "events", "conversations", "usage", "health", "optouts", "invoices"];
await store.put("clients", "sentinel", { slug: "sentinel", ownerKey: "offline-owner", marker: "unchanged" });
async function snapshot() { return Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await store.listJSON(kind, "", Infinity)]))); }
const initial = await snapshot();
const send = (body, { origin = process.env.URL, ip = "" } = {}) => chat(new Request(process.env.URL + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }), { ip });
const transcripts = [];
for (const scenario of [
  { persona: "bayou-air", owner: "Ray", language: "en", name: "Morgan Lee", turns: ["I need to request an AC visit in Katy; it is blowing warm.", "I'm Morgan Lee.", "My phone is 713-555-0111.", "The address is 120 Oak St, Katy.", "Tomorrow, 8 to 12 works for my request."] },
  { persona: "katy-pipeworks", owner: "Dana", language: "en", name: "Jamie Reed", turns: ["I need to request a visit for a slow kitchen drain in Katy.", "I am Jamie Reed.", "My phone is 713-555-0112.", "The address is 125 Oak St, Katy.", "Tomorrow, 12 to 5 works for my request."] },
  { persona: "westheimer-maids", owner: "Nia", language: "es", name: "Ana Ruiz", turns: ["Hola, necesito solicitar una visita de limpieza en Memorial.", "Soy Ana Ruiz.", "Mi teléfono es 713-555-0113.", "La dirección es 130 Oak St, Memorial.", "Mañana de 1 a 3, por favor."] },
]) {
  const messages = [], turns = [];
  for (const [index, text] of scenario.turns.entries()) {
    messages.push({ role: "user", content: text });
    const response = await send({ persona: scenario.persona, messages, stream: index % 2 === 0, page: "/" }, { ip: "203.0.113.20" });
    assert.equal(response.status, 200);
    let output;
    if (index % 2 === 0) {
      const rows = (await response.text()).trim().split("\n").map(JSON.parse);
      assert.equal(rows.at(-1).t, "done"); output = rows.at(-1);
      assert.equal(rows.filter(row => row.t === "delta").map(row => row.text).join(""), output.reply);
    } else output = await response.json();
    assert.equal(output.events.length, 1, "one progressive summary per turn");
    const event = output.events[0], data = event.data;
    assert.equal(event.type, "owner_notification"); assert.equal(event.owner, scenario.owner);
    assert.equal(data.language, scenario.language); assert.ok(data.issue);
    if (scenario.language === "es") {
      assert.match(data.issue, /cleaning/i, "Spanish customer issue is English for the owner");
      assert.doesNotMatch(data.issue + " " + data.requested_window, /limpieza|recámaras|baños|mañana|sábado|\d\s+a\s+\d/i);
      assert.match(output.reply, /[¿¡]|solicitud|dirección|teléfono|llama|Gracias/i, "English owner fields do not change Spanish customer reply");
    }
    assert.deepEqual(Object.keys(data).sort(), ["address", "customer_name", "issue", "language", "phone", "requested_action", "requested_window", "urgency"]);
    assert.equal(data.requested_action, "visit_request", "an explicit service request stays tentative visit intent");
    assert.equal(data.customer_name, index >= 1 ? scenario.name : "");
    assert.equal(Boolean(data.phone), index >= 2); assert.equal(Boolean(data.address), index >= 3);
    assert.equal(Boolean(data.requested_window), index >= 4);
    assert.doesNotMatch(output.reply, /\b(?:booked|reserved|text sent|texted|email sent|agendad[oa]|reservad[oa]|mensaje enviado)\b/i);
    assert.deepEqual(await snapshot(), initial, "practice turn must not mutate business stores");
    messages.push({ role: "assistant", content: output.reply }); turns.push({ input: text, reply: output.reply, summary: event });
  }
  const correction = scenario.language === "es" ? "Corrección: mi teléfono es 713-555-0199 y la dirección es 145 Oak St, Memorial." : "Correction: my phone is 713-555-0199 and the address is 145 Oak St, Katy.";
  messages.push({ role: "user", content: correction });
  const corrected = await (await send({ persona: scenario.persona, messages })).json();
  assert.equal(corrected.events.length, 1);
  assert.equal(corrected.events[0].data.phone, "713-555-0199");
  assert.match(corrected.events[0].data.address, /^145 Oak St/);
  assert.equal(corrected.events[0].data.language, scenario.language);
  assert.equal(corrected.events[0].data.customer_name, scenario.name);
  assert.equal(corrected.events[0].data.requested_action, "visit_request");
  assert.deepEqual(await snapshot(), initial);
  turns.push({ input: correction, reply: corrected.reply, summary: corrected.events[0] });
  transcripts.push({ persona: scenario.persona, turns });
}
// Customer jobs: no visit-intake loop for callback-only callers; corrections replace stale facts.
const jobTranscripts = [];
async function jobTurn(persona, history, input) {
  const messages = history.concat({ role: "user", content: input });
  const response = await send({ persona, messages, stream: true });
  assert.equal(response.status, 200);
  const rows = (await response.text()).trim().split("\n").map(JSON.parse), out = rows.at(-1);
  assert.equal(out.t, "done"); assert.equal(out.events.length, 1);
  assert.equal(rows.filter(row => row.t === "delta").map(row => row.text).join(""), out.reply);
  assert.doesNotMatch(out.reply, /\b(booked|reserved|text sent|texted|email sent|agendad[oa]|reservad[oa]|mensaje enviado)\b/i);
  assert.deepEqual(await snapshot(), initial, "customer-job practice never mutates business records");
  history.push({ role: "user", content: input }, { role: "assistant", content: out.reply });
  const turn = { input, reply: out.reply, summary: out.events[0].data };
  jobTranscripts.push({ persona, ...turn }); return turn;
}
const callbackHistory = [];
const callbackFirst = await jobTurn("katy-pipeworks", callbackHistory, "My tap is dripping. Just have Dana call me after 3 pm; I do not want to request a visit.");
assert.equal(callbackFirst.summary.requested_action, "callback");
assert.match(callbackFirst.summary.requested_window, /after\s*3\s*pm/i, "requested callback timing is retained without becoming an arrival promise");
assert.doesNotMatch(callbackFirst.reply, /street address|arrival window|what day|which window/i, "callback-only callers are not forced into visit intake");
const callbackReady = await jobTurn("katy-pipeworks", callbackHistory, "I am Jamie Reed. Call me at 713-555-0112.");
assert.equal(callbackReady.summary.requested_action, "callback");
assert.equal(callbackReady.summary.customer_name, "Jamie Reed");
assert.equal(callbackReady.summary.phone.replace(/\D/g, ""), "7135550112");
assert.equal(callbackReady.summary.address, ""); assert.match(callbackReady.summary.requested_window, /after\s*3\s*pm/i);
assert.match(callbackReady.reply, /callback request/i);
assert.doesNotMatch(callbackReady.reply, /what.*address|what.*window|what day|which.*window/i);
const callbackCorrected = await jobTurn("katy-pipeworks", callbackHistory, "Correction: call me at 713-555-0199 after 4 pm instead.");
assert.equal(callbackCorrected.summary.requested_action, "callback");
assert.equal(callbackCorrected.summary.phone.replace(/\D/g, ""), "7135550199");
assert.equal(callbackCorrected.summary.customer_name, "Jamie Reed");
assert.equal(callbackCorrected.summary.address, ""); assert.match(callbackCorrected.summary.requested_window, /after\s*4\s*pm/i);
assert.doesNotMatch(callbackCorrected.summary.requested_window, /after\s*3\s*pm/i);
assert.doesNotMatch(callbackCorrected.summary.issue, /after\s*3\s*pm/i, "current owner issue must not contradict corrected callback timing");
const urgentUnknownTiming = await jobTurn("katy-pipeworks", [], "I have an active leak under my sink in Katy. I am Jamie Reed. Call me at 713-555-0112; I need to speak with Dana.");
assert.equal(urgentUnknownTiming.summary.requested_action, "callback");
assert.equal(urgentUnknownTiming.summary.urgency, "emergency");
assert.equal(urgentUnknownTiming.summary.requested_window, "", "urgent leak alone must not infer ASAP callback timing");
assert.doesNotMatch(urgentUnknownTiming.reply, /ASAP|as soon as possible|shortly|right away|within \d|immediately|(?:someone|Dana|we)(?:\s+will|['’]ll)\s+(?:call|contact|dispatch)/i, "an urgent callback fixture must not promise a person will act or invent timing");
const cleaningHistory = [];
await jobTurn("westheimer-maids", cleaningHistory, "Hola, necesito solicitar una limpieza profunda en Memorial. Son 2 recámaras, 2 baños y 1,000 pies cuadrados.");
await jobTurn("westheimer-maids", cleaningHistory, "Soy Ana Ruiz. Mi teléfono es 713-555-0113. La dirección es 130 Oak St, Memorial. Mañana de 1 a 3, por favor.");
const cleaningCorrected = await jobTurn("westheimer-maids", cleaningHistory, "Corrección: son 3 recámaras, no 2. Mi teléfono es 713-555-0199 y la dirección es 145 Oak St, Memorial.");
assert.equal(cleaningCorrected.summary.requested_action, "visit_request");
assert.equal(cleaningCorrected.summary.language, "es");
assert.equal(cleaningCorrected.summary.customer_name, "Ana Ruiz");
assert.equal(cleaningCorrected.summary.phone.replace(/\D/g, ""), "7135550199");
assert.match(cleaningCorrected.summary.address, /^145 Oak St/);
assert.match(cleaningCorrected.summary.requested_window, /tomorrow, 1\s*to\s*3/);
assert.match(cleaningCorrected.summary.issue, /3\s*bedrooms/i, "English owner issue reflects the corrected room count");
assert.doesNotMatch(cleaningCorrected.summary.issue, /2\s*bedrooms/i, "stale room count is removed from current issue");
assert.match(cleaningCorrected.summary.issue, /2\s*bathrooms/i, "unrelated bathroom count is retained");
assert.match(cleaningCorrected.summary.issue, /1,?000/, "unrelated floor area is retained");
const bilingual = await jobTurn("westheimer-maids", [], "Hola, soy María López. Necesito solicitar una limpieza profunda en Memorial. Son 3 recámaras, 2 baños y 1,000 pies cuadrados. Mi teléfono es 713-555-0198. La dirección es 145 Oak St, Memorial. El sábado de 8 a 10, por favor.");
assert.equal(bilingual.summary.customer_name, "María López", "preserve accented customer name verbatim");
assert.equal(bilingual.summary.address, "145 Oak St, Memorial", "preserve supplied street address verbatim");
assert.equal(bilingual.summary.language, "es"); assert.match(bilingual.reply, /Gracias.*solicitud.*sábado/);
assert.match(bilingual.summary.issue, /Deep cleaning.*3 bedrooms.*2 bathrooms.*1,000 square feet/);
assert.equal(bilingual.summary.requested_window, "saturday, 8 to 10");
assert.doesNotMatch(bilingual.summary.issue + bilingual.summary.requested_window, /limpieza|recámaras|baños|sábado/);
// New conversations never inherit another visitor's contact details or requested action.
const freshSamePersona = await jobTurn("katy-pipeworks", [], "I need to request a visit for a slow drain in Katy.");
assert.equal(freshSamePersona.summary.requested_action, "visit_request");
for (const field of ["customer_name", "phone", "address", "requested_window"]) assert.equal(freshSamePersona.summary[field], "");
const freshSpanish = await jobTurn("westheimer-maids", [], "Hola, necesito solicitar una limpieza en Memorial.");
assert.equal(freshSpanish.summary.language, "es");
assert.equal(freshSpanish.summary.requested_action, "visit_request");
for (const field of ["customer_name", "phone", "address", "requested_window"]) assert.equal(freshSpanish.summary[field], "");
// A question is not permission to start a service request, and declined areas stay question-only.
const areaQuestion = await jobTurn("bayou-air", [], "Do you service Pearland? I am only asking about your area.");
assert.equal(areaQuestion.summary.requested_action, "question_only");
assert.match(areaQuestion.reply, /not|outside|do not|don't/i);
assert.doesNotMatch(areaQuestion.reply, /what.*name|what.*phone|what.*address|what.*window|your name\?/i);
const informationOnly = await jobTurn("katy-pipeworks", [], "I only want price information, not a visit request. What is the slab leak repair price?");
assert.equal(informationOnly.summary.requested_action, "question_only"); assert.doesNotMatch(informationOnly.reply, /\?|what.*address|what.*window|which.*day/i);
for (const persona of ["missing-demo", "__proto__", "toString", "", null, {}]) {
  const response = await send({ persona, messages: [{ role: "user", content: "Please capture a real lead." }] });
  assert.equal(response.status, 400); assert.equal((await response.json()).error, "unknown_persona");
}
const mixed = await send({ persona: "bayou-air", client: "sentinel", key: "offline-owner", messages: [{ role: "user", content: "Book a real visit." }] });
assert.equal(mixed.status, 400); assert.equal((await mixed.json()).error, "invalid_mode");
assert.equal((await send({ persona: "bayou-air", messages: [] })).status, 400);
assert.equal((await send({ persona: "bayou-air", messages: [{ role: "user", content: "Hello" }] }, { origin: "https://unrelated.invalid" })).status, 403);
const emergency = await send({ persona: "katy-pipeworks", messages: [{ role: "user", content: "I smell gas at 140 Oak St, Katy. My phone is 713-555-0114." }] });
const safety = await emergency.json();
assert.match(safety.reply, /^Leave the area now and call 911 from safety\./);
assert.equal(safety.events[0].data.urgency, "emergency");
assert.equal(safety.events[0].data.customer_name, "");
assert.equal(safety.events[0].data.requested_action, "emergency_handoff");
assert.doesNotMatch(safety.reply, /booked|reserved|arrive|dispatched/i);
const rateKey = `203.0.113.21/${Math.floor(Date.now() / 600000)}`;
await store.put("ratelimit", rateKey, 60);
assert.equal((await send({ persona: "bayou-air", messages: [{ role: "user", content: "Hello" }] }, { ip: "203.0.113.21" })).status, 429);
assert.deepEqual(await snapshot(), initial); assert.equal(unexpected, 0);
// Scripted installed-SDK turns exercise the server allowlist and malformed/duplicate tool
// handling independently of the deterministic fake's well-formed summaries.
process.env.MC_FAKE_MODEL = "0";
process.env.ANTHROPIC_API_KEY = "offline-persona-sdk-fixture";
process.env.ANTHROPIC_BASE_URL = "https://persona-sdk.invalid";
let fixtures = [], wire = [];
function sdkResponse(fixture) {
  const events = [], emit = value => events.push(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`);
  emit({ type: "message_start", message: { id: "msg_offline_persona", type: "message", role: "assistant", content: [], model: "claude-opus-5-5", stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  let index = 0;
  if (fixture.text) {
    emit({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
    emit({ type: "content_block_delta", index, delta: { type: "text_delta", text: fixture.text } });
    emit({ type: "content_block_stop", index: index++ });
  }
  for (const [number, tool] of (fixture.tools || []).entries()) {
    emit({ type: "content_block_start", index, content_block: { type: "tool_use", id: `tool_${number}`, name: tool.name, input: {} } });
    emit({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } });
    emit({ type: "content_block_stop", index: index++ });
  }
  emit({ type: "message_delta", delta: { stop_reason: fixture.tools?.length ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit({ type: "message_stop" });
  return new Response(events.join(""), { headers: { "Content-Type": "text/event-stream" } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://persona-sdk.invalid" || url.pathname !== "/v1/messages") return blocked();
  assert.ok(fixtures.length, "unexpected fixture turn"); wire.push(JSON.parse(init.body));
  return sdkResponse(fixtures.shift());
};
const good = { customer_name: "Morgan Lee", phone: "713-555-0111", address: "120 Oak St, Katy", issue: "AC repair", requested_window: "tomorrow, 8 to 12", urgency: "flexible", language: "en", requested_action: "visit_request" };
async function scripted(tools) {
  wire = []; fixtures = [{ text: "Hidden planning must not appear.", tools }, { text: "Your requested visit is shown in the on-page summary." }];
  const response = await send({ persona: "bayou-air", messages: [{ role: "user", content: "Service request fixture." }], stream: true });
  const rows = (await response.text()).trim().split("\n").map(JSON.parse), result = rows.at(-1);
  assert.equal(result.t, "done"); assert.doesNotMatch(rows.map(row => row.text || "").join(""), /Hidden planning/);
  assert.deepEqual(wire[0].tools.map(tool => tool.name), ["send_owner_summary"]);
  assert.match(wire[0].system[0].text, /once per relevant customer turn/);
  assert.match(wire[0].system[0].text, /no live schedule, booking, texting, email, or customer-record tools/);
  assert.match(wire[0].system[0].text, /owner reads English/);
  assert.match(wire[0].system[0].text, /Urgency alone does not establish requested callback timing/);
  assert.match(wire[0].system[0].text, /In spoken and typed replies, never promise that someone will call back/, "typed provider prompt forbids an unsupported human callback commitment");
  assert.match(wire[0].system[0].text, /including "as soon as possible," "shortly," or by a deadline/, "non-numeric timing promises remain unsupported");
  assert.match(wire[0].system[0].text, /say its timing is not confirmed when unknown/);
  assert.match(wire[0].tools[0].input_schema.properties.requested_window.description, /Never infer ASAP/);
  assert.match(wire[0].system[0].text, /customer_name and address exactly as the customer supplied/);
  assert.match(wire[0].tools[0].input_schema.properties.requested_window.description, /English/);
  assert.equal(fixtures.length, 0); assert.deepEqual(await snapshot(), initial);
  return result;
}
const forbidden = await scripted(["capture_lead", "book_visit", "notify_owner"].map(name => ({ name, input: { name: "Synthetic User", email: "synthetic@example.test" } })));
assert.deepEqual(forbidden.events, []);
assert.ok(wire[1].messages.at(-1).content.every(result => result.is_error && result.content.startsWith("Unknown tool.")));
assert.deepEqual((await scripted([{ name: "send_owner_summary", input: { ...good, urgency: "booked" } }])).events, []);
assert.equal(wire[1].messages.at(-1).content[0].is_error, true);
for (const requested_action of ["booked", "sent", "", null, { type: "callback" }]) {
  assert.deepEqual((await scripted([{ name: "send_owner_summary", input: { ...good, requested_action } }])).events, [], "invalid action must fail closed");
  assert.equal(wire[1].messages.at(-1).content[0].is_error, true);
}
const { requested_action: ignoredAction, ...missingAction } = good;
assert.deepEqual((await scripted([{ name: "send_owner_summary", input: missingAction }])).events, [], "missing action must fail closed");
const callbackTool = await scripted([{ name: "send_owner_summary", input: { ...good, requested_action: "callback", address: "", requested_window: "" } }]);
assert.equal(callbackTool.events[0].data.requested_action, "callback");
assert.equal(callbackTool.events[0].data.address, "");
const questionTool = await scripted([{ name: "send_owner_summary", input: { ...good, requested_action: "question_only", customer_name: "", phone: "", address: "", requested_window: "" } }]);
assert.equal(questionTool.events[0].data.requested_action, "question_only");
const bounded = await scripted([{ name: "send_owner_summary", input: { ...good, recipient: "never-send@example.test", privateMetadata: "exclude" } }, { name: "send_owner_summary", input: { ...good, phone: "713-555-0199" } }]);
assert.equal(bounded.events.length, 1); assert.deepEqual(bounded.events[0].data, good);
fixtures = [{ text: "Machines & Cloud can help with your front desk." }]; wire = [];
const mc = await send({ persona: "mc", messages: [{ role: "user", content: "Tell me about your service." }] });
assert.equal(mc.status, 200); assert.deepEqual((await mc.json()).events, []);
assert.deepEqual(wire[0].tools.map(tool => tool.name), ["estimate_call_volume", "assess_workflow_fit", "suggest_next_step"], "MC has planning and visitor-selected actions, with no automatic capture");
assert.equal(unexpected, 0); assert.deepEqual(await snapshot(), initial);
assert.deepEqual(sourceSnapshot(), source, "verification sources must stay stable throughout the run");
console.log(`PERSONA OK: 18 progressive/correction turns + ${jobTranscripts.length} callback/isolation/question jobs; requested-action schema/fail-closed controls, safety, origin/validation/rate controls, SDK tool guards and MC control; zero business writes or external requests (offline fake + SDK fixtures, not live semantic proof)`);
console.log(JSON.stringify({ scope: "offline full handler with deterministic fake model and installed-SDK fixtures; no real-model semantic claim", source, sourceFingerprint: hash(JSON.stringify(source)), transcripts, customerJobs: jobTranscripts, emergency: safety }, null, 2));
