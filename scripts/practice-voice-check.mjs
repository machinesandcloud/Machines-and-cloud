// Offline only: no .env, microphone, model or provider calls. Exercise both the memory
// implementation and the installed Blobs SDK against a conditional-write protocol double.
import assert from "node:assert/strict";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import http from "node:http";
import https from "node:https";
const blocked = () => { throw new Error("Network disabled by practice-voice-check"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = blocked;
syncBuiltinESMExports();
for (const key of ["ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "STRIPE_SECRET_KEY", "VAPI_WEBHOOK_SECRET", "DEPLOY_PRIME_URL", "VAPI_MODEL"]) delete process.env[key];
process.env.VAPI_API_KEY = "offline-vapi-private-key";
process.env.VAPI_PUBLIC_KEY = "offline-vapi-public-key";
process.env.URL = "http://127.0.0.1:8893";
process.env.NODE_ENV = "test";
process.env.MC_MEMORY_STORE = "1";
const RealDate = Date; let clock = RealDate.parse("2026-10-22T15:10:00Z");
globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
const blobs = new Map(); let revision = 0, conflicts = 0, unexpected = 0, fault = null;
let providerCalls = [], providerMode = "ok", onProvider = null;
const join = () => ({ id: "offline-call", type: "webCall", transport: { provider: "daily", callUrl: "https://offline.daily.co/practice", callToken: "offline-room-token" }, artifactPlan: { recordingEnabled: false }, orgId: "never-forward", monitor: { controlUrl: "never-forward" }, assistant: { server: { url: "never-forward" } } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.href === "https://api.vapi.ai/call/web") {
    assert.equal(init.method, "POST"); assert.equal(new Headers(init.headers).get("authorization"), "Bearer offline-vapi-public-key"); assert.equal(new Headers(init.headers).get("origin"), process.env.URL);
    providerCalls.push(JSON.parse(init.body));
    onProvider?.();
    if (providerMode === "throw") throw new TypeError("offline lost response");
    if (providerMode.startsWith("reject")) return new Response("raw private provider failure", { status: Number(providerMode.slice(6)) || 400 });
    const call = join();
    if (providerMode === "bad-host") call.transport.callUrl = "https://attacker.invalid/room";
    if (providerMode === "recording") call.artifactPlan.recordingEnabled = true;
    if (providerMode === "secret") call.transport.callToken = process.env.VAPI_API_KEY;
    if (providerMode === "public-secret") call.transport.callToken = process.env.VAPI_PUBLIC_KEY;
    return Response.json(call);
  }
  if (url.origin !== "https://voice-blobs.invalid") { unexpected++; return blocked(); }
  const [, site, kind, ...parts] = url.pathname.split("/").map(decodeURIComponent);
  assert.equal(site, "offline-site"); assert.equal(kind, "site:practice_voice", "voice writes only its budget store");
  const key = parts.join("/"), name = `${kind}/${key}`, method = String(init.method || "GET").toUpperCase();
  if (fault?.method === method) { fault = null; return new Response("offline storage failure", { status: 400 }); }
  const current = blobs.get(name), headers = new Headers(init.headers);
  if (method === "GET") return current ? new Response(current.value, { headers: { etag: current.etag, "content-type": "application/json" } }) : new Response(null, { status: 404 });
  if (method === "DELETE") { blobs.delete(name); return new Response(null, { status: 204 }); }
  assert.equal(method, "PUT");
  if ((headers.get("if-none-match") === "*" && current) || (headers.has("if-match") && headers.get("if-match") !== current?.etag)) { conflicts++; return new Response(null, { status: 412 }); }
  const etag = String(++revision); blobs.set(name, { value: init.body, etag });
  return new Response(null, { headers: { etag } });
};
const { setEnvironmentContext } = await import("@netlify/blobs");
setEnvironmentContext({ siteID: "offline-site", token: "offline-token", edgeURL: "https://voice-eventual.invalid", uncachedEdgeURL: "https://voice-blobs.invalid" });
const store = await import("../netlify/functions/lib/store.mjs");
const handler = (await import("../netlify/functions/practice-voice.mjs")).default;
const worker = (await import("../netlify/functions/practice-voice.mjs?independent-worker")).default;
const read = () => store.atomicUpdate("practice_voice", "budget", current => ({ result: current }));
const day = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
let groups = 0;
async function reset() { await store.del("practice_voice", "budget"); providerCalls = []; providerMode = "ok"; onProvider = null; fault = null; }
async function call(body = { persona: "bayou-air", language: "en" }, options = {}) {
  const req = new Request(`http://127.0.0.1:8893${options.path || "/api/practice-voice/call/web"}`, { method: options.method || "POST", headers: { origin: process.env.URL, ...options.headers }, ...(options.method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
  const response = await (options.worker || handler)(req, { ip: options.ip || "192.0.2.1" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  return { status: response.status, data: await response.json() };
}
const originalError = console.error; const errors = []; console.error = (...args) => errors.push(args);
try {
  for (const backend of ["memory", "blobs"]) {
    process.env.MC_MEMORY_STORE = backend === "memory" ? "1" : "0";
    await reset();
    for (const [body, options, status] of [
      [{}, {}, 400], [[], {}, 400], [null, {}, 400], ["{", {}, 400], [" ".repeat(1025), {}, 400],
      [{ persona: "__proto__", language: "en" }, {}, 400], [{ persona: "bayou-air", language: "fr" }, {}, 400],
      [{ persona: "bayou-air", language: "en", assistant: {} }, {}, 400], [{ persona: "bayou-air", language: "en", customer: { number: "+17135550100" } }, {}, 400],
      [{}, { method: "GET" }, 405], [{}, { path: "/api/practice-voice/assistant" }, 404], [{}, { headers: { origin: "https://evil.invalid" } }, 403], [{}, { headers: { origin: "" } }, 403],
    ]) assert.equal((await call(body, options)).status, status, `${backend}: invalid input`);
    delete process.env.VAPI_API_KEY;
    assert.equal((await call()).status, 503); process.env.VAPI_API_KEY = "offline-vapi-private-key";
    delete process.env.VAPI_PUBLIC_KEY;
    assert.equal((await call()).status, 503); process.env.VAPI_PUBLIC_KEY = "offline-vapi-public-key";
    assert.equal(providerCalls.length, 0); assert.equal(await read(), null); groups++;

    for (const persona of ["bayou-air", "katy-pipeworks", "westheimer-maids"]) for (const language of ["en", "es"]) {
      await reset();
      const result = await call({ persona, language }); assert.equal(result.status, 200);
      assert.deepEqual(Object.keys(result.data).sort(), ["artifactPlan", "assistant", "id", "practice", "transport", "webCallUrl"].sort());
      assert.equal(JSON.stringify(result).includes("offline-vapi-private-key"), false); assert.equal(JSON.stringify(result).includes("offline-vapi-public-key"), false); assert.equal(JSON.stringify(result).includes("never-forward"), false);
      assert.equal(result.data.practice.maxDurationSeconds, 90);
      const submitted = providerCalls[0], a = submitted.assistant;
      assert.deepEqual(Object.keys(submitted).sort(), ["assistant", "roomDeleteOnUserLeaveEnabled"]); assert.equal(submitted.roomDeleteOnUserLeaveEnabled, true);
      assert.equal(a.maxDurationSeconds, 90); assert.equal(a.customerJoinTimeoutSeconds, 30); assert.equal(a.silenceTimeoutSeconds, 20);
      assert.equal(a.model.provider, "anthropic"); assert.equal(a.model.model, "claude-sonnet-5");
      assert.deepEqual(a.voice, { provider: "vapi", voiceId: "Elliot", version: 2, language: "auto" }); assert.deepEqual(a.transcriber, { provider: "deepgram", model: "nova-3", language: "multi" });
      assert.deepEqual(a.serverMessages, []); assert.equal(a.artifactPlan.recordingEnabled, false); assert.equal(a.artifactPlan.videoRecordingEnabled, false); assert.equal(a.artifactPlan.loggingEnabled, false); assert.equal(a.artifactPlan.transcriptPlan.enabled, true);
      assert.equal(a.model.tools.length, 1); const tool = a.model.tools[0];
      assert.equal(tool.async, true); assert.equal(tool.function.name, "send_owner_summary"); assert.equal(Object.hasOwn(tool, "server"), false);
      assert.deepEqual(tool.function.parameters.properties.requested_action.enum, ["visit_request", "callback", "question_only", "emergency_handoff"]);
      assert.equal(Object.hasOwn(a, "server"), false); assert.equal(Object.hasOwn(a, "phoneNumberId"), false);
      assert.match(a.model.messages[0].content, /does not book, dispatch/); assert.match(a.model.messages[0].content, /Safety guidance is spoken first/);
      assert.match(a.model.messages[0].content, /Urgency alone does not establish requested callback timing/);
      assert.match(tool.function.parameters.properties.requested_window.description, /Empty if not stated, including urgent callbacks/);
      assert.match(tool.function.parameters.properties.requested_window.description, /Never infer ASAP/);
      if (persona === "katy-pipeworks") assert.match(a.model.messages[0].content, /10\s*p\.?m/i);
      const state = await read(); assert.equal(state.starts, 1); assert.equal(state.active[0].until, clock + 150000); assert.ok(Object.keys(state.ips).every(key => /^[a-f0-9]{64}$/.test(key))); assert.equal(JSON.stringify(state).includes("192.0.2.1"), false);
      groups++;
    }

    await reset();
    const concurrent = await Promise.all([call(undefined, { ip: "192.0.2.1" }), call(undefined, { ip: "192.0.2.2", worker }), call(undefined, { ip: "192.0.2.3" })]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 200, 429]); assert.equal(concurrent.find(r => r.status === 429).data.error, "busy"); assert.equal(providerCalls.length, 2); assert.equal((await read()).starts, 2); groups++;

    await reset();
    for (let n = 0; n < 3; n++) { assert.equal((await call()).status, 200); clock += 150001; }
    assert.deepEqual(await call(), { status: 429, data: { error: "rate_limited" } }); assert.equal(providerCalls.length, 3);
    clock = Math.ceil(clock / 3600000) * 3600000; assert.equal((await call()).status, 200); groups++;

    await reset(); await store.put("practice_voice", "budget", { day: day(), starts: 19, ips: {}, active: [] });
    const last = await Promise.all([call(undefined, { ip: "192.0.2.1" }), call(undefined, { ip: "192.0.2.2", worker })]);
    assert.deepEqual(last.map(r => r.status).sort(), [200, 429]); assert.equal(last.find(r => r.status === 429).data.error, "daily_limit"); assert.equal(providerCalls.length, 1); assert.equal((await read()).starts, 20); groups++;

    for (const mode of ["reject400", "reject401", "reject402", "reject500", "throw", "bad-host", "recording", "secret", "public-secret"]) {
      await reset(); providerMode = mode;
      assert.deepEqual(await call(), { status: 502, data: { error: "voice_unavailable" } });
      const state = await read(); assert.equal(state.starts, 1); assert.equal(Object.values(state.ips)[0].count, 1);
      if (["reject400", "reject401", "reject402"].includes(mode)) assert.equal(state.active.length, 0, `${backend}: definite rejection releases only concurrency`);
      else { assert.equal(state.active.length, 1); if (!["secret", "public-secret"].includes(mode)) assert.equal(state.active[0].until, null, `${backend}: ${mode} ambiguous result holds slot`); }
      assert.equal(providerCalls.length, 1); groups++;
    }

    await reset(); providerMode = "reject401"; await call(); await call(); providerMode = "ok";
    assert.equal((await call()).status, 200, `${backend}: corrected configuration is not permanently deadlocked by two rejections`);
    const recovered = await read(); assert.equal(recovered.starts, 3); assert.equal(Object.values(recovered.ips)[0].count, 3); assert.equal(recovered.active.length, 1);
    assert.deepEqual(await call(), { status: 429, data: { error: "rate_limited" } }); groups++;

    await reset(); providerMode = "throw";
    await call(undefined, { ip: "192.0.2.1" }); await call(undefined, { ip: "192.0.2.2" });
    clock += 86400000;
    assert.deepEqual(await call(undefined, { ip: "192.0.2.3" }), { status: 429, data: { error: "busy" } }); assert.equal(providerCalls.length, 2); groups++;

    if (backend === "blobs") {
      // A pre-midnight request reads an absent document, then loses its first CAS
      // to a newer worker. Its retry must preserve the new day/hour and spent counts.
      await reset(); clock = RealDate.parse("2026-10-23T04:59:59.999Z");
      const protocolFetch = globalThis.fetch;
      let held = false, signalHeld, releaseHeld;
      const heldRead = new Promise(resolve => { signalHeld = resolve; });
      const resumeRead = new Promise(resolve => { releaseHeld = resolve; });
      globalThis.fetch = async (input, init = {}) => {
        const response = await protocolFetch(input, init);
        if (!held && String(input).startsWith("https://voice-blobs.invalid/") && String(init.method || "GET").toUpperCase() === "GET") { held = true; signalHeld(); await resumeRead; }
        return response;
      };
      const delayed = call();
      try {
        await heldRead; clock += 2;
        assert.equal((await call(undefined, { worker })).status, 200);
        const newer = await read(); assert.equal(newer.day, "2026-10-23"); assert.equal(newer.starts, 1);
        releaseHeld(); assert.equal((await delayed).status, 200);
        const retried = await read(); assert.equal(retried.day, newer.day, "old CAS retry cannot restore the old day"); assert.equal(retried.starts, 2, "both claims remain spent in the current day");
        assert.equal(Object.values(retried.ips)[0].count, 2, "old CAS retry cannot erase the newer hour/IP count");
        clock += 150001; assert.equal((await call()).status, 200);
        const after = await read(); assert.equal(after.starts, 3); assert.equal(Object.values(after.ips)[0].count, 3);
        assert.deepEqual(await call(), { status: 429, data: { error: "rate_limited" } }); assert.equal(providerCalls.length, 3); groups++;
      } finally { releaseHeld(); globalThis.fetch = protocolFetch; }
      for (const method of ["GET", "PUT"]) {
        await reset(); fault = { method };
        assert.deepEqual(await call(), { status: 503, data: { error: "storage_unavailable" } }); assert.equal(providerCalls.length, 0); groups++;
      }
      await reset(); onProvider = () => { fault = { method: "PUT" }; };
      assert.deepEqual(await call(), { status: 502, data: { error: "voice_unavailable" } });
      assert.equal((await read()).active[0].until, null); assert.equal(providerCalls.length, 1); groups++;
      await reset(); providerMode = "reject401"; onProvider = () => { fault = { method: "PUT" }; };
      assert.deepEqual(await call(), { status: 502, data: { error: "voice_unavailable" } });
      assert.equal((await read()).active[0].until, null, "failed rejection release retains claim"); assert.equal((await read()).starts, 1); groups++;
    }
  }
  assert.equal(unexpected, 0); assert.ok(conflicts > 0, "installed SDK exercised conditional conflicts");
  assert.ok(errors.every(args => args.length === 2 && args[0] === "practice voice create rejected" && [400, 401, 402, 500].includes(args[1])), "only sanitized provider status logged");
} finally { console.error = originalError; globalThis.Date = RealDate; }
console.log(`PRACTICE VOICE PASS: ${groups} groups; memory + installed SDK protocol double; ${conflicts} CAS conflicts; zero live network/provider calls`);
