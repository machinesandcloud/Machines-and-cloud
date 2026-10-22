// Shared offline fixture, never imported by production or supplied with real credentials.
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
const WallDate = Date;
export async function fixture() {
  for (const [target, name] of [[net, "connect"], [net, "createConnection"], [http, "request"], [http, "get"], [https, "request"], [https, "get"]]) target[name] = () => { throw new Error("Calendar checks deny actual networking"); };
  syncBuiltinESMExports();
  Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", URL: "http://127.0.0.1:8888", PUBLIC_SITE_URL: "https://calendar.example.test", GOOGLE_CLIENT_ID: "dummy-google-client", GOOGLE_CLIENT_SECRET: "dummy-google-secret", CALENDAR_CONNECTION_ENABLED: "true", CALENDAR_DELIVERY_ENABLED: "true", SERVICE_WORKER_KEY: "fixture-calendar-worker-" + "b".repeat(40), CALENDAR_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") });
  const store = await import("../netlify/functions/lib/store.mjs"), { newClient } = await import("../netlify/functions/lib/config.mjs");
  const connection = await import("../netlify/functions/lib/calendar-connection.mjs"), delivery = await import("../netlify/functions/lib/calendar-delivery.mjs");
  const execution = await import('../netlify/functions/lib/calendar-execution.mjs');
  const NativeDate = globalThis.Date; let clock = NativeDate.now();
  class FixtureDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  globalThis.Date = FixtureDate;
  const requests = [], events = new Map(), policies = new Map(); let sequence = 0, target = "owner@calendar.example.test", mode = "normal", onRequest = null;
  const sha = value => createHash('sha256').update(value).digest('hex');
  async function approve(client, bookingIds = ['visit-1','visit-late','visit-a','visit-b','visit-c']) {
    let policy = policies.get(client.slug);
    if (!policy) {
      const census = await execution.calendarExecutionCensus(client);
      assert.equal(census.clean, true, 'Each fixture cohort starts without retained Calendar resources');
      policy = { version:'fixture_' + client.slug.replaceAll('-','_'), censusMode:'clean_initial', expiresAt:new Date(Date.now() + 30*86400000).toISOString(), tenant:{slug:client.slug,identity:execution.calendarExecutionIdentity(client)}, googleClientIdHash:sha(process.env.GOOGLE_CLIENT_ID),targetIdHash:sha(target),censusDigest:census.digest,bookingIds,limits:Object.fromEntries(['oauthStart','tokenExchange','tokenRefresh','calendarRead','eventCreate','eventUpdate','eventDelete','workerDispatch','totalRequests'].map(action => [action,10000])) };
      policies.set(client.slug, policy);
    }
    process.env.CALENDAR_EXECUTION_POLICY_JSON = JSON.stringify(policy); process.env.CALENDAR_EXECUTION_APPROVED_VERSION = policy.version;
    return policy;
  }
  const scopes = "https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendars.readonly";
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)), method = init.method || "GET", body = init.body ? String(init.body) : "", headers = new Headers(init.headers), call = { url: url.href, method, body, headers };
    requests.push(call); if (onRequest) { const intercepted = await onRequest(call); if (intercepted) return intercepted; }
    if (url.href === "https://oauth2.googleapis.com/token") {
      assert.equal(method, "POST"); const form = new URLSearchParams(body);
      assert.equal(form.get("client_id"), "dummy-google-client"); assert.equal(form.get("client_secret"), "dummy-google-secret");
      if (mode === "revoked" && form.get("grant_type") === "refresh_token") return json(400, { error: "invalid_grant" });
      if (form.get("grant_type") === "authorization_code") { assert.match(form.get("code_verifier"), /^[A-Za-z0-9_-]{64}$/); assert.equal(form.get("redirect_uri"), "https://calendar.example.test/api/google/callback"); }
      return json(200, { refresh_token: "dummy-private-refresh", access_token: "dummy-access", scope: mode === "missing_scope" ? "" : scopes });
    }
    if (url.href === "https://www.googleapis.com/calendar/v3/calendars/primary") return json(200, { id: target, summary: "Private Calendar title" });
    const match = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);
    if (url.origin !== "https://www.googleapis.com" || !match) throw new Error(`Unexpected blocked provider request ${method} ${url.origin}${url.pathname}`);
    assert.equal(headers.get("Authorization"), "Bearer dummy-access");
    const calendar = decodeURIComponent(match[1]), eventId = match[2] ? decodeURIComponent(match[2]) : null, key = `${calendar}/${eventId}`;
    if (method !== "GET") assert.equal(url.searchParams.get("sendUpdates"), "none");
    if (method === "GET") return events.has(key) ? json(200, events.get(key)) : json(404, { error: { code: 404 } });
    const data = body ? JSON.parse(body) : null;
    if (method === "POST") {
      const insertKey = `${calendar}/${data.id}`;
      assert.match(data.id, /^[a-v0-9]{5,1024}$/);
      if (events.has(insertKey)) return json(409, { error: { code: 409 } });
      const saved = { ...data, etag: `"${++sequence}"`, status: "confirmed" }; events.set(insertKey, saved);
      if (mode === "lost_insert") { mode = "normal"; throw new Error("Offline response lost after Google committed"); }
      return json(200, saved);
    }
    const saved = events.get(key);
    if (!saved) return json(404, {});
    assert.ok(headers.get("If-Match"), "Mutation requires the observed provider ETag");
    if (headers.get("If-Match") !== saved.etag) return json(412, {});
    if (method === "PATCH") { const next = { ...saved, ...data, etag: `"${++sequence}"` }; events.set(key, next); return json(200, next); }
    if (method === "DELETE") { events.delete(key); if (mode === "lost_delete") { mode = "normal"; throw new Error("Offline delete committed but response lost"); } return new Response(null, { status: 204 }); }
    throw new Error("Unexpected Calendar method");
  };
  async function seed(slug = "calendar-shop") {
    const client = { ...newClient({ slug, ownerKey: "permanent-owner-secret", owner: { email: `${slug}@example.test`, phone: "+17135550123" }, business: { name: "Fixture Home Service" } }), onboarding: { version: 1 }, status: "live", operationLifecycleVersion: 1 };
    const sessionHash = createHash("sha256").update(`session:${slug}`).digest("hex"), session = { sessionHash, email: client.owner.email, scope: "onboarding", status: "active", expiresAt: new Date(Date.now() + 3600000).toISOString() };
    await store.saveClient(client); await store.put("access_sessions", sessionHash, session); await approve(client); return { client, session };
  }
  async function connect(client, session) { await approve(client); const start = await connection.startCalendarConnection(client, session), state = new URL(start.authorizationUrl).searchParams.get("state"); await connection.completeCalendarConnection(client, session, { state, code: "dummy-authorization-code" }); return { start, state }; }
  return { store, connection, delivery, seed, connect, approve, execution, policies, requests, events, scopes, json, advance: ms => { clock += ms; }, setMode: value => { mode = value; }, setTarget: value => { target = value; }, intercept: callback => { onRequest = callback; } };
}
export async function report(name, checks) {
  const result = { check: name, at: new WallDate().toISOString(), passed: checks.length, failed: 0, checks, externalRequests: 0 };
  const index = process.argv.indexOf("--output");
  if (index >= 0) await writeFile(process.argv[index + 1], JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
