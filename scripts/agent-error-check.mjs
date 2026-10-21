// Offline SDK regressions for upstream failures and the strict availability tool schema.
// The fetch fixture checks the transmitted schema; it does not claim live API acceptance.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
const blocked = () => { throw new Error("Network disabled by agent-error-check"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = blocked;
syncBuiltinESMExports();
process.env.ANTHROPIC_API_KEY = "offline-error-test";
process.env.ANTHROPIC_BASE_URL = "https://agent-error.invalid";
process.env.MC_FAKE_MODEL = "0";
process.env.MC_MEMORY_STORE = "1";
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY"]) delete process.env[key];

let unexpected = 0;
const requests = [];
function unsupportedKeyword(value) {
  if (!value || typeof value !== "object") return "";
  for (const [key, child] of Object.entries(value)) {
    if (["minimum", "maximum", "multipleOf", "minLength", "maxLength"].includes(key)) return key;
    const nested = unsupportedKeyword(child);
    if (nested) return nested;
  }
  return "";
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://agent-error.invalid" || url.pathname !== "/v1/messages") { unexpected++; return blocked(); }
  const request = JSON.parse(init.body);
  requests.push(request);
  const keyword = request.tools.filter((tool) => tool.strict).map((tool) => unsupportedKeyword(tool.input_schema)).find(Boolean);
  if (keyword) return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: `tools.0.input_schema: unsupported strict schema keyword ${keyword}` } }), { status: 400, headers: { "Content-Type": "application/json", "request-id": "offline-request-private" } });
  const events = [
    { type: "message_start", message: { id: "msg_offline_error_check", type: "message", role: "assistant", content: [], model: request.model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Offline schema accepted." } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ];
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
};
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const { classifyError, ndjsonResponse, runAgent } = await import("../netlify/functions/lib/agent.mjs");
const { GET_AVAILABILITY } = await import("../netlify/functions/lib/availability.mjs");
const originalError = console.error;
const logs = [];
console.error = (...args) => logs.push(args);
try {
  const headers = new Headers({ "authorization": "Bearer header-private", "x-api-key": "header-key-private", "request-id": "request-private" });
  for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 503, 529]) {
    const err = Anthropic.APIError.generate(status, { error: { type: "fixture_error", message: `Fixture HTTP ${status}` }, privateBody: "body-private" }, "ignored", headers);
    assert.ok(err instanceof Anthropic.APIError);
    assert.deepEqual(classifyError(err), status === 401 ? { error: "offline", status: 503 } : status === 429 ? { error: "busy", status: 429 } : { error: "upstream", status: 502 });
    assert.equal(logs.at(-1)[1].message, `Fixture HTTP ${status}`);
  }
  for (const err of [new Anthropic.APIConnectionError({ cause: new Error("cause-private") }), new Anthropic.APIConnectionTimeoutError(), new Anthropic.APIUserAbortError()]) {
    assert.deepEqual(classifyError(err), { error: "upstream", status: 502 });
    assert.equal(logs.at(-1)[1].status, null);
  }
  assert.deepEqual(classifyError(new Error("Internal fixture")), { error: "internal", status: 500 });
  assert.deepEqual(classifyError(null), { error: "internal", status: 500 });
  const credentials = 'Bad schema\nBearer bearer-private x-api-key="key-private" password=pass-private sk-ant-api03-token-private';
  classifyError(Anthropic.APIError.generate(400, { error: { message: credentials } }, "ignored", headers));
  const sanitized = logs.at(-1)[1].message;
  assert.match(sanitized, /Bad schema/);
  assert.doesNotMatch(sanitized, /bearer-private|key-private|pass-private|token-private|\n/);
  classifyError(Anthropic.APIError.generate(400, { error: { message: "x".repeat(2000) } }, "ignored", headers));
  assert.equal(logs.at(-1)[1].message.length, 800);

  const oldTool = structuredClone(GET_AVAILABILITY);
  delete oldTool.input_schema.properties.days.enum;
  Object.assign(oldTool.input_schema.properties.days, { minimum: 1, maximum: 14 });
  const run = (tools) => runAgent({ system: "Offline schema fixture.", tools, messages: [{ role: "user", content: "Check availability." }], execTool: async () => { throw new Error("Fixture must not execute tools"); } });
  // Exercise the same SDK stream rejection and NDJSON catch path that formerly threw
  // TypeError from instanceof undefined, masking the useful 400 schema diagnostic.
  const response = ndjsonResponse(() => run([oldTool]));
  assert.deepEqual((await response.text()).trim().split("\n").map(JSON.parse), [{ t: "error", error: "upstream" }]);
  assert.equal(logs.at(-1)[1].status, 400);
  assert.match(logs.at(-1)[1].message, /unsupported strict schema keyword minimum/);
  assert.equal(requests.length, 1, "400 must not be retried by the SDK");

  const result = await run([GET_AVAILABILITY]);
  assert.equal(result.reply, "Offline schema accepted.");
  assert.equal(requests.length, 2);
  const transmitted = requests.at(-1).tools[0];
  assert.equal(transmitted.strict, true);
  assert.equal(unsupportedKeyword(transmitted.input_schema), "");
  assert.equal(transmitted.input_schema.additionalProperties, false);
  assert.deepEqual(transmitted.input_schema.required, ["date", "days"]);
  const days = transmitted.input_schema.properties.days;
  assert.equal(days.type, "integer");
  assert.deepEqual(days.enum, Array.from({ length: 14 }, (_, index) => index + 1));
  for (const value of [0, 15, 1.5, "1", null]) assert.equal(Number.isInteger(value) && days.enum.includes(value), false);

  for (const [label, diagnostic] of logs) {
    assert.ok(["agent API error", "agent error"].includes(label));
    assert.deepEqual(Object.keys(diagnostic).sort(), ["message", "name", "status"]);
    assert.equal(typeof diagnostic.name, "string");
    assert.equal(typeof diagnostic.message, "string");
  }
  assert.doesNotMatch(JSON.stringify(logs), /header-private|header-key-private|request-private|body-private|cause-private|offline-request-private/);
  assert.equal(unexpected, 0);
} finally { console.error = originalError; }
console.log("AGENT ERROR OK: SDK HTTP/connection classification, sanitized diagnostics, NDJSON 400 recovery, strict enum schema on SDK wire (offline fixtures; zero live requests)");
