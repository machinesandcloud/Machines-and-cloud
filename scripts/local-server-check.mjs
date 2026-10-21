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
const child = spawn(process.execPath, ["scripts/local-server.mjs"], {
  cwd: new URL("../", import.meta.url),
  env: { ...process.env, PORT: String(port), URL: "https://production.invalid", MC_MEMORY_STORE: "0", MC_MEMORY_FILE: "", MC_LOCAL_NO_KEYS: "", MC_FAKE_MODEL: "1", ANTHROPIC_API_KEY: "local-check-placeholder", GOOGLE_CLIENT_ID: "local-check-placeholder", GOOGLE_CLIENT_SECRET: "local-check-placeholder", VAPI_WEBHOOK_SECRET: "inherited-secret", LOCAL_VAPI_WEBHOOK_SECRET: "local-vapi-secret", LOCAL_ADMIN_KEY: "local-check-admin" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.resume();
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local server did not start")), 10000);
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Local server exited (${code})`)); });
    child.stdout.on("data", () => { if (output.includes("local front desk at ")) { clearTimeout(timer); resolve(); } });
  });
  assert.ok(output.includes(origin), "inherited production origin must be overridden");
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
  assert.equal(google.status, 503);
  assert.equal((await google.json()).error, "google_not_configured", "no-key mode must strip Google credentials");
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
