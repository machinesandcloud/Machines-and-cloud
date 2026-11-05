// Offline delivery-contract regression through the installed Anthropic streaming SDK. Model
// responses are fixtures: semantic safety behavior must also be checked with the real model.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
const blocked = () => { throw new Error("Network disabled by agent-delivery-check"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = blocked;
syncBuiltinESMExports();
process.env.ANTHROPIC_API_KEY = "offline-delivery-test";
process.env.ANTHROPIC_BASE_URL = "https://agent-delivery.invalid";
process.env.MC_FAKE_MODEL = "0";
process.env.MC_MEMORY_STORE = "1";
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY"]) delete process.env[key];
let queue = [], requests = [], unexpected = 0;
function streamResponse(fixture, serial) {
  const events = [];
  const emit = (data) => events.push(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  emit({ type: "message_start", message: { id: `msg_offline_${serial}`, type: "message", role: "assistant", content: [], model: "claude-opus-5-5", stop_reason: null, stop_sequence: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  let index = 0;
  if (fixture.text) {
    emit({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
    for (const text of fixture.text) emit({ type: "content_block_delta", index, delta: { type: "text_delta", text } });
    emit({ type: "content_block_stop", index: index++ });
  }
  for (const tool of fixture.tools || []) {
    emit({ type: "content_block_start", index, content_block: { type: "tool_use", id: tool.id, name: tool.name, input: {} } });
    emit({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } });
    emit({ type: "content_block_stop", index: index++ });
  }
  emit({ type: "message_delta", delta: { stop_reason: fixture.tools?.length ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
  emit({ type: "message_stop" });
  return new Response(events.join(""), { headers: { "Content-Type": "text/event-stream" } });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://agent-delivery.invalid" || url.pathname !== "/v1/messages") { unexpected++; return blocked(); }
  assert.ok(queue.length, "unexpected extra model turn");
  requests.push(JSON.parse(init.body));
  return streamResponse(queue.shift(), requests.length);
};
const { runAgent } = await import("../netlify/functions/lib/agent.mjs");
const { buildSystemPrompt, newClient } = await import("../netlify/functions/lib/config.mjs");
const { voicePrompt } = await import("../netlify/functions/lib/vapi.mjs");
const tool = (id) => ({ id, name: "notify_owner", input: { issue: "fixture" } });
const tools = [{ name: "notify_owner", description: "Offline tool", input_schema: { type: "object", properties: { issue: { type: "string" } }, required: ["issue"] } }];
const final = "Leave the area now and call 911 from outside. The owner has your details.";
queue = [
  { text: ["Internal planning that must remain hidden. ", "Leave the area now and call 911 from outside."], tools: [tool("tool_one")] },
  { text: ["Second internal tool preamble."], tools: [tool("tool_two")] },
  { text: [final] },
];
const delivered = []; let executions = 0;
const result = await runAgent({ system: "Follow the owner's safety script.", tools, messages: [{ role: "user", content: "Emergency fixture with contact details." }], dropToolPreamble: true, onText: (text) => delivered.push(text), execTool: async () => {
  assert.deepEqual(delivered, [], "pre-tool safety and planning must not be sent before the final turn");
  executions++; return { content: "Owner notified.", event: { type: "lead", id: String(executions) } };
} });
assert.equal(executions, 2); assert.equal(result.reply, final); assert.equal(delivered.join(""), final);
assert.equal(result.events.length, 2);
for (const request of requests) {
  assert.match(request.system[0].text, /turn that calls a tool is withheld/);
  assert.match(request.system[0].text, /begin that final reply with the prescribed safety guidance/);
}
for (let i = 1; i < requests.length; i++) {
  const history = requests[i].messages;
  const assistant = history.find((m) => m.role === "assistant");
  assert.ok(assistant.content.some((b) => b.type === "text" && b.text.includes("Internal planning")), "tool-use model history is retained");
  assert.ok(assistant.content.some((b) => b.type === "tool_use" && b.id === "tool_one"));
  const last = history.at(-1).content[0];
  assert.equal(last.type, "tool_result"); assert.equal(last.is_error, false);
  assert.match(last.content, /^Owner notified\./);
  assert.match(last.content, /was not shown to the customer/);
  assert.match(last.content, /safety guidance comes first/);
}

queue = [{ text: ["Hidden preamble."], tools: [tool("failed_tool")] }, { text: [final] }]; requests = [];
const failure = await runAgent({ system: "Safety first.", tools, messages: [{ role: "user", content: "Fixture" }], dropToolPreamble: true, execTool: async () => ({ content: "Owner notification failed.", is_error: true }) });
assert.equal(failure.reply, final);
assert.equal(requests[1].messages.at(-1).content[0].is_error, true);
assert.match(requests[1].messages.at(-1).content[0].content, /^Owner notification failed\./);
assert.match(requests[1].messages.at(-1).content[0].content, /was not shown/);

queue = [{ text: ["The service call is $89."], tools: [tool("ordinary_tool")] }, { text: ["The owner has your details."] }]; requests = [];
const ordinaryChunks = [];
const ordinary = await runAgent({ system: "Ordinary streaming mode.", tools, messages: [{ role: "user", content: "Fixture" }], onText: (text) => ordinaryChunks.push(text), execTool: async () => ({ content: "Done." }) });
assert.equal(ordinary.reply, "The service call is $89. The owner has your details.");
assert.equal(ordinaryChunks.join(""), ordinary.reply);
assert.equal(requests[0].system[0].text, "Ordinary streaming mode.");
assert.equal(requests[1].messages.at(-1).content[0].content, "Done.");

// Missing adapter output is an unknown action outcome, never synthetic success.
const invalidResults = [undefined, null, {}, [], { content: '' }, { content: '   ' },
  { content: 7 }, { content: ['saved'] }, { content: 'Saved', is_error: 'false' },
  { event: { type: 'booking', id: 'must-not-escape' } }];
for (const [index, invalid] of invalidResults.entries()) {
  queue = [{ tools: [tool(`invalid_result_${index}`)] }, { text: ['The result needs checking.'] }]; requests = [];
  let calls=0;
  const out = await runAgent({ system: 'Report only verified tool outcomes.', tools, messages: [{ role: 'user', content: 'Synthetic request' }], dropToolPreamble: true, execTool: async () => {calls++;return invalid;} });
  const seen=requests[1].messages.at(-1).content[0];
  assert.equal(seen.is_error,true,`invalid tool result ${index} must not be reported as success`);
  assert.equal(typeof seen.content,'string');
  assert.match(seen.content,/unconfirmed/i);
  assert.match(seen.content,/do not repeat/i);
  assert.doesNotMatch(seen.content,/^Done\./);
  assert.deepEqual(out.events,[], 'invalid results must not publish a success event');
  assert.equal(calls,1,'the agent boundary must not retry an uncertain action');
}

queue = [{ tools: [tool('thrown_after_unknown_write')] }, { text: ['The result needs checking.'] }]; requests = [];
let thrownCalls=0;
const thrown = await runAgent({system:'Report verified outcomes.',tools,messages:[{role:'user',content:'Synthetic request'}],dropToolPreamble:true,execTool:async()=>{thrownCalls++;throw new Error('Offline fixture: acknowledgement lost');}});
assert.equal(requests[1].messages.at(-1).content[0].is_error,true);
assert.match(requests[1].messages.at(-1).content[0].content,/unconfirmed/i);
assert.match(requests[1].messages.at(-1).content[0].content,/do not repeat/i);
assert.doesNotMatch(requests[1].messages.at(-1).content[0].content,/action did not complete/);
assert.equal(thrownCalls,1);assert.deepEqual(thrown.events,[]);

// A model can ignore the warning: identical unknown actions still must not dispatch again.
queue = [
  { tools: [{...tool('unknown_first'),input:{phone:'7135550142',issue:'Offline fixture'}}] },
  { tools: [{...tool('unknown_replay'),input:{issue:'Offline fixture',phone:'7135550142'}}] },
  { text: ['The original result needs checking.'] },
]; requests=[];let unknownCalls=0;
const replay = await runAgent({system:'Report verified outcomes.',tools,messages:[{role:'user',content:'Synthetic request'}],dropToolPreamble:true,execTool:async()=>{unknownCalls++;return undefined;}});
assert.equal(unknownCalls,1,'same unknown action must not dispatch again, including reordered input keys');
assert.equal(requests[2].messages.at(-1).content[0].is_error,true);assert.deepEqual(replay.events,[]);

queue = [{tools:[tool('same_batch_one'),tool('same_batch_two')]},{text:['The original result needs checking.']}];requests=[];let sameBatchCalls=0;
await runAgent({system:'Report verified outcomes.',tools,messages:[{role:'user',content:'Synthetic request'}],dropToolPreamble:true,execTool:async()=>{sameBatchCalls++;throw new Error('Offline fixture: acknowledgement lost');}});
assert.equal(sameBatchCalls,1,'unknown duplicates in one model turn must not dispatch twice');

queue=[{tools:[tool('unknown_handoff')]},{tools:[{id:'different_read',name:'get_availability',input:{date:'2030-01-07'}}]},{text:['The handoff is unconfirmed; availability was checked.']}];requests=[];const distinctCalls=[];
await runAgent({system:'Report verified outcomes.',tools,messages:[{role:'user',content:'Synthetic request'}],dropToolPreamble:true,execTool:async name=>{distinctCalls.push(name);return name==='get_availability'?{content:'The availability read completed.'}:undefined;}});
assert.deepEqual(distinctCalls,['notify_owner','get_availability'],'a different read remains available after the unknown action');

const c = newClient({ slug: "offline-delivery", ownerKey: "offline-owner", owner: { name: "Dana", email: "owner@example.com" }, business: { name: "Offline desk", trade: "HVAC" } });
for (const channel of ["sms", "test", "web", "voice"]) {
  const prompt = buildSystemPrompt(c, channel);
  if (channel !== "voice") assert.match(prompt, /your final customer reply/);
  assert.doesNotMatch(prompt, /every sentence you write is (?:sent|shown)/);
  assert.match(prompt, /begin the customer-facing reply with the safety script before callback promises, fees, tool outcomes, or questions/);
  assert.match(prompt, /Each successful get_availability result is a snapshot at that moment; availability may change between checks/);
  assert.match(prompt, /Do not call an earlier successful lookup wrong, reinterpret its result, or claim the owner changed the schedule unless you have explicit evidence/);
}
assert.match(voicePrompt(c), /begin the customer-facing reply with the safety script before callback promises, fees, tool outcomes, or questions/);
assert.match(voicePrompt(c), /State the current result without inventing why it changed/);
// A managed customer conversation must not inherit the old workspace-only denial.
// The transport does not certify a separate notification or calendar outcome.
const managed = structuredClone(c); managed.onboarding = { version: 1 };
const transportLabels = { web: "website chat", sms: "text messaging", voice: "a phone call", test: "the owner's private rehearsal" };
for (const [channel, label] of Object.entries(transportLabels)) {
  const prompt = buildSystemPrompt(managed, channel);
  assert.ok(prompt.includes(`The current conversation uses ${label}.`));
  assert.doesNotMatch(prompt, /workspace operates website chat only|Phone answering, SMS, automatic alerts and calendar sync are not active/);
  assert.match(prompt, /distinguish a saved workspace record, queued delivery, confirmed delivery and failed or unconfirmed delivery/);
  assert.match(prompt, /Never describe a queued text, reminder or calendar update as delivered/);
  assert.match(prompt, /whether or when a person will respond is not confirmed/);
  assert.doesNotMatch(prompt, /A booking already alerts the owner with every detail/);
}
const { managedAssistantBody } = await import("../netlify/functions/lib/voice-provider.mjs");
const assistant = managedAssistantBody(managed, { correlationId: "offline-managed-prompt", inputRevision: "offline-rules", policy: { model: "offline-test-model", maxDurationSeconds: 90 }, site: "https://voice.example.test" });
assert.match(assistant.model.messages[0].content, /The current conversation uses a phone call/);
assert.doesNotMatch(assistant.model.messages[0].content, /workspace operates website chat only/);
assert.match(assistant.model.messages[0].content, /A workspace record is not proof of a text, email, calendar sync or human callback/);
assert.equal(queue.length, 0); assert.equal(unexpected, 0);
console.log("AGENT DELIVERY OK: withheld preambles, preserved tool history, delivery contract/reminders, error results and all-channel safety/snapshot rules (offline SDK fixtures; model semantics unproven)");
