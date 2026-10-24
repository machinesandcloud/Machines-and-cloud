// Regression check for local isolation; no live provider or model requests.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const defaultPreload = `
import assert from 'node:assert/strict';
globalThis.fetch = async () => { throw new Error('default isolation check blocks every outbound fetch'); };
function verifyDefaultKeys() {
  if (process.env.MC_MEMORY_STORE !== '1' || process.env.URL !== ${JSON.stringify(origin)}) { setTimeout(verifyDefaultKeys, 1); return; }
  for (const key of ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','VAPI_API_KEY','VAPI_PUBLIC_KEY','RESEND_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','STRIPE_SECRET_KEY','THUMBTACK_PARTNER_ENABLED','THUMBTACK_CLIENT_ID','THUMBTACK_CLIENT_SECRET','THUMBTACK_TOKEN_ENCRYPTION_KEY','THUMBTACK_SCOPES','THUMBTACK_CLIENT_AUTH_METHOD','MC_PLATFORM_AI_ENABLED']) assert.ok(!process.env[key], key + ' must be stripped in default mode');
  process.stdout.write('DEFAULT_PROVIDER_KEYS_STRIPPED\\n');
}
setTimeout(verifyDefaultKeys, 0);
`;
const child = spawn(process.execPath, ["--import", "data:text/javascript," + encodeURIComponent(defaultPreload), "scripts/local-server.mjs"], {
  cwd: new URL("../", import.meta.url),
  env: { ...process.env, PORT: String(port), URL: "https://production.invalid", MC_MEMORY_STORE: "0", MC_MEMORY_FILE: "", MC_LOCAL_NO_KEYS: "", MC_LOCAL_VOICE: "0", MC_FAKE_MODEL: "1", ANTHROPIC_API_KEY: "local-check-placeholder", TWILIO_ACCOUNT_SID: "local-twilio-placeholder", TWILIO_AUTH_TOKEN: "local-twilio-placeholder", VAPI_API_KEY: "local-voice-private-placeholder", VAPI_PUBLIC_KEY: "local-voice-public-placeholder", RESEND_API_KEY: "local-resend-placeholder", STRIPE_SECRET_KEY: "local-stripe-placeholder", THUMBTACK_PARTNER_ENABLED: "1", MC_PLATFORM_AI_ENABLED: "true", THUMBTACK_CLIENT_ID: "local-thumbtack-id", THUMBTACK_CLIENT_SECRET: "local-thumbtack-secret", THUMBTACK_TOKEN_ENCRYPTION_KEY: "local-thumbtack-encryption", THUMBTACK_SCOPES: "supply::local offline_access", THUMBTACK_CLIENT_AUTH_METHOD: "client_secret_basic", GOOGLE_CLIENT_ID: "local-check-placeholder", GOOGLE_CLIENT_SECRET: "local-check-placeholder", VAPI_WEBHOOK_SECRET: "inherited-secret", LOCAL_VAPI_WEBHOOK_SECRET: "local-vapi-secret", LOCAL_ADMIN_KEY: "local-check-admin" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.resume();
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local server did not start")), 10000);
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Local server exited (${code})`)); });
    child.stdout.on("data", () => { if (output.includes("local front desk at ") && output.includes("DEFAULT_PROVIDER_KEYS_STRIPPED")) { clearTimeout(timer); resolve(); } });
  });
  assert.ok(output.includes(origin), "inherited production origin must be overridden");
  assert.ok(output.includes("DEFAULT_PROVIDER_KEYS_STRIPPED"), "preloader must confirm all default provider keys are removed");
  assert.equal((await fetch(origin + "/")).status, 200);
  for (const path of ["/.env", "/.env.example", "/.git/config", "/.local-store.json", "/%2eenv", "/assets/../.env"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 404, `private path ${path} must not be served`);
    await response.body?.cancel();
  }
  const admin = await fetch(origin + "/api/admin", { headers: { "x-admin-key": "local-check-admin" } });
  assert.equal(admin.status, 200, "inherited memory-store=0 must not select production Blobs");
  assert.deepEqual((await admin.json()).clients, []);
  const google = await fetch(origin + "/api/google/auth");
  assert.equal(google.status, 410);
  assert.equal((await google.json()).error, "owner_session_required", "legacy OAuth entry never accepts permanent credentials");
  for (const [secret, expected] of [["inherited-secret", 403], ["local-vapi-secret", 200]]) {
    const response = await fetch(origin + "/api/vapi", { method: "POST", headers: { "Content-Type": "application/json", "x-vapi-secret": secret }, body: JSON.stringify({ message: { type: "local-check" } }) });
    assert.equal(response.status, expected, "local webhook secret must replace inherited secret");
    await response.body?.cancel();
  }
  console.log("LOCAL SERVER CHECK OK: private files blocked, local origin and memory enforced, provider credentials removed, local webhook authentication isolated");
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null) await once(child, "exit");
}

// A separate child exercises the narrow voice opt-in. The preloader intercepts
// every fetch before the server imports any function; no provider call can leave.
const voiceProbe = createServer();
voiceProbe.listen(0, "127.0.0.1");
await once(voiceProbe, "listening");
const voicePort = voiceProbe.address().port;
await new Promise((resolve) => voiceProbe.close(resolve));
const voiceOrigin = `http://127.0.0.1:${voicePort}`;
const voicePreload = `
import assert from 'node:assert/strict';
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  assert.ok(url === 'https://api.vapi.ai/call/web' && init.method === 'POST', 'all unplanned outbound fetches blocked');
  assert.ok(process.env.VAPI_API_KEY === 'local-voice-private-placeholder' && process.env.VAPI_PUBLIC_KEY === 'local-voice-public-placeholder', 'voice opt-in retains only the supplied Vapi key placeholders');
  for (const key of ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','RESEND_API_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','STRIPE_SECRET_KEY','THUMBTACK_PARTNER_ENABLED','THUMBTACK_CLIENT_ID','THUMBTACK_CLIENT_SECRET','THUMBTACK_TOKEN_ENCRYPTION_KEY','THUMBTACK_SCOPES','THUMBTACK_CLIENT_AUTH_METHOD','MC_PLATFORM_AI_ENABLED']) assert.ok(!process.env[key], key + ' must be stripped');
  assert.ok(process.env.MC_MEMORY_STORE === '1', 'voice opt-in must still force memory storage');
  assert.ok(process.env.URL === ${JSON.stringify(voiceOrigin)}, 'voice opt-in must still force loopback origin');
  assert.ok(process.env.MC_LOCAL_NO_KEYS === '1' && process.env.MC_LOCAL_VOICE === '1', 'voice opt-in must not enable general provider access');
  assert.ok(init.headers.Authorization === 'Bearer local-voice-public-placeholder' && init.headers.Origin === ${JSON.stringify(voiceOrigin)}, 'only dummy public authorization and validated loopback Origin reach the fixture');
  const body = JSON.parse(init.body);
  assert.ok(body.roomDeleteOnUserLeaveEnabled === true && !body.customer && !body.phoneNumberId && !body.transport, 'only the fixed browser-create payload is accepted');
  process.stdout.write('LOCAL_VOICE_FETCH_INTERCEPTED_AND_ISOLATED\\n');
  return Response.json({id:'local-voice-fixture',transport:{callUrl:'https://fixture.daily.co/room'},artifactPlan:{recordingEnabled:false,videoRecordingEnabled:false}});
};
`;
const voiceChild = spawn(process.execPath, ["--import", "data:text/javascript," + encodeURIComponent(voicePreload), "scripts/local-server.mjs"], {
  cwd: new URL("../", import.meta.url),
  env: { ...process.env, PORT: String(voicePort), URL: "https://production.invalid", MC_MEMORY_STORE: "0", MC_MEMORY_FILE: "", MC_LOCAL_NO_KEYS: "1", MC_LOCAL_VOICE: "1", MC_FAKE_MODEL: "1", ANTHROPIC_API_KEY: "local-check-placeholder", TWILIO_ACCOUNT_SID: "local-twilio-placeholder", TWILIO_AUTH_TOKEN: "local-twilio-placeholder", VAPI_API_KEY: "local-voice-private-placeholder", VAPI_PUBLIC_KEY: "local-voice-public-placeholder", RESEND_API_KEY: "local-resend-placeholder", GOOGLE_CLIENT_ID: "local-google-placeholder", GOOGLE_CLIENT_SECRET: "local-google-placeholder", STRIPE_SECRET_KEY: "local-stripe-placeholder", THUMBTACK_PARTNER_ENABLED: "1", MC_PLATFORM_AI_ENABLED: "true", THUMBTACK_CLIENT_ID: "local-thumbtack-id", THUMBTACK_CLIENT_SECRET: "local-thumbtack-secret", THUMBTACK_TOKEN_ENCRYPTION_KEY: "local-thumbtack-encryption", THUMBTACK_SCOPES: "supply::local offline_access", THUMBTACK_CLIENT_AUTH_METHOD: "client_secret_basic", LOCAL_ADMIN_KEY: "local-voice-admin" },
  stdio: ["ignore", "pipe", "pipe"],
});
let voiceOutput = "";
voiceChild.stdout.on("data", chunk => { voiceOutput += chunk; });
voiceChild.stderr.resume();
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Voice-opt-in local server did not start")), 10000);
    voiceChild.once("exit", code => { clearTimeout(timer); reject(new Error(`Voice-opt-in local server exited (${code})`)); });
    voiceChild.stdout.on("data", () => { if (voiceOutput.includes("local front desk at ")) { clearTimeout(timer); resolve(); } });
  });
  assert.ok(voiceOutput.includes(voiceOrigin) && voiceOutput.includes("provider APIs voice practice only"));
  const result = await fetch(voiceOrigin + "/api/practice-voice/call/web", { method: "POST", headers: { "Content-Type": "application/json", Origin: voiceOrigin }, body: JSON.stringify({ persona: "bayou-air", language: "en" }) });
  assert.equal(result.status, 200, "mocked voice creation must succeed under the narrow opt-in");
  const body = await result.json();
  assert.equal(body.id, "local-voice-fixture");
  assert.equal(body.webCallUrl, "https://fixture.daily.co/room");
  assert.equal(body.practice.maxDurationSeconds, 90);
  assert.ok(!JSON.stringify(body).includes("local-voice-private-placeholder") && !JSON.stringify(body).includes("local-voice-public-placeholder"), "neither key placeholder may reach the browser response");
  assert.ok(voiceOutput.includes("LOCAL_VOICE_FETCH_INTERCEPTED_AND_ISOLATED"), "preloader must assert effective environment at the provider boundary");
  const admin = await fetch(voiceOrigin + "/api/admin", { headers: { "x-admin-key": "local-voice-admin" } });
  assert.equal(admin.status, 200);
  assert.deepEqual((await admin.json()).clients, [], "voice opt-in must retain isolated empty business storage");
  console.log("LOCAL VOICE OPT-IN CHECK OK: both dummy Vapi keys retained server-side, other provider keys stripped, loopback and memory enforced, fixed public web-create fetch intercepted; zero live provider/model requests");
} finally {
  voiceChild.kill("SIGTERM");
  if (voiceChild.exitCode === null) await once(voiceChild, "exit");
}
