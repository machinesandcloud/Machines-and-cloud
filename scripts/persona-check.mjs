// Offline full-handler checks. No .env loading, model requests or provider traffic.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
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
const store = await import("../netlify/functions/lib/store.mjs");
const kinds = ["clients", "index", "bookings", "leads", "tasks", "events", "conversations", "usage", "health", "optouts", "invoices"];
await store.put("clients", "sentinel", { slug: "sentinel", ownerKey: "offline-owner", marker: "unchanged" });
async function snapshot() { return Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await store.listJSON(kind, "", Infinity)]))); }
const initial = await snapshot();
const send = (body, { origin = process.env.URL, ip = "" } = {}) => chat(new Request(process.env.URL + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) }), { ip });
const transcripts = [];
for (const scenario of [
  { persona: "bayou-air", owner: "Ray", language: "en", name: "Morgan Lee", turns: ["My AC is blowing warm in Katy.", "I'm Morgan Lee.", "My phone is 713-555-0111.", "The address is 120 Oak St, Katy.", "Tomorrow, 8 to 12 works for my request."] },
  { persona: "katy-pipeworks", owner: "Dana", language: "en", name: "Jamie Reed", turns: ["My kitchen drain is slow in Katy.", "I am Jamie Reed.", "My phone is 713-555-0112.", "The address is 125 Oak St, Katy.", "Tomorrow, 12 to 5 works for my request."] },
  { persona: "westheimer-maids", owner: "Nia", language: "es", name: "Ana Ruiz", turns: ["Hola, necesito una limpieza en Memorial.", "Soy Ana Ruiz.", "Mi teléfono es 713-555-0113.", "La dirección es 130 Oak St, Memorial.", "Mañana de 1 a 3, por favor."] },
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
    assert.deepEqual(Object.keys(data).sort(), ["address", "customer_name", "issue", "language", "phone", "requested_window", "urgency"]);
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
  assert.deepEqual(await snapshot(), initial);
  turns.push({ input: correction, reply: corrected.reply, summary: corrected.events[0] });
  transcripts.push({ persona: scenario.persona, turns });
}
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
const good = { customer_name: "Morgan Lee", phone: "713-555-0111", address: "120 Oak St, Katy", issue: "AC repair", requested_window: "tomorrow, 8 to 12", urgency: "flexible", language: "en" };
async function scripted(tools) {
  wire = []; fixtures = [{ text: "Hidden planning must not appear.", tools }, { text: "Your requested visit is shown in the on-page summary." }];
  const response = await send({ persona: "bayou-air", messages: [{ role: "user", content: "Service request fixture." }], stream: true });
  const rows = (await response.text()).trim().split("\n").map(JSON.parse), result = rows.at(-1);
  assert.equal(result.t, "done"); assert.doesNotMatch(rows.map(row => row.text || "").join(""), /Hidden planning/);
  assert.deepEqual(wire[0].tools.map(tool => tool.name), ["send_owner_summary"]);
  assert.match(wire[0].system[0].text, /once per relevant customer turn/);
  assert.match(wire[0].system[0].text, /no live schedule, booking, texting, email, or customer-record tools/);
  assert.equal(fixtures.length, 0); assert.deepEqual(await snapshot(), initial);
  return result;
}
const forbidden = await scripted(["capture_lead", "book_visit", "notify_owner"].map(name => ({ name, input: { name: "Synthetic User", email: "synthetic@example.test" } })));
assert.deepEqual(forbidden.events, []);
assert.ok(wire[1].messages.at(-1).content.every(result => result.is_error && result.content.startsWith("Unknown tool.")));
assert.deepEqual((await scripted([{ name: "send_owner_summary", input: { ...good, urgency: "booked" } }])).events, []);
assert.equal(wire[1].messages.at(-1).content[0].is_error, true);
const bounded = await scripted([{ name: "send_owner_summary", input: { ...good, recipient: "never-send@example.test", privateMetadata: "exclude" } }, { name: "send_owner_summary", input: { ...good, phone: "713-555-0199" } }]);
assert.equal(bounded.events.length, 1); assert.deepEqual(bounded.events[0].data, good);
fixtures = [{ text: "Machines & Cloud can help with your front desk." }]; wire = [];
const mc = await send({ persona: "mc", messages: [{ role: "user", content: "Tell me about your service." }] });
assert.equal(mc.status, 200); assert.deepEqual((await mc.json()).events, []);
assert.deepEqual(wire[0].tools.map(tool => tool.name), ["capture_lead"], "MC retains its original sales tool");
assert.equal(unexpected, 0); assert.deepEqual(await snapshot(), initial);
console.log("PERSONA OK: 18 multi-turn JSON/NDJSON updates, partial/corrected/language summaries, mode isolation, safety, origin/validation/rate controls, SDK forbidden/malformed/duplicate tool guards and MC control; zero business writes or external requests (offline fake + SDK fixtures, not live semantic proof)");
console.log(JSON.stringify({ scope: "offline full handler with deterministic fake model", transcripts, emergency: safety }, null, 2));
