// Public browser practice calls only. No shop lookup, phone number, business tool or webhook.
import { createHmac, randomBytes } from "node:crypto";
import { atomicUpdate } from "./lib/store.mjs";
import { PERSONAS, OWNER_SUMMARY, personaSystem } from "./lib/practice-personas.mjs";

export const config = { path: "/api/practice-voice/call/web" };
const SCENARIOS = ["bayou-air", "katy-pipeworks", "westheimer-maids"];
const MAX_SECONDS = 90, DAILY_STARTS = 20, IP_HOURLY_STARTS = 3, CONCURRENCY = 2;
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function allowedOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = ["https://machinesandcloud.com", "https://www.machinesandcloud.com", process.env.URL, process.env.DEPLOY_PRIME_URL].filter(Boolean);
  return allowed.includes(origin);
}
function assistant(persona, language) {
  const p = PERSONAS[persona];
  return {
    name: `Website voice practice: ${p.company}`,
    firstMessage: language === "es" ? `Gracias por llamar a ${p.company}. Soy el asistente de recepción. ¿En qué le puedo ayudar?` : `Thanks for calling ${p.company}. I'm the front desk assistant. How can I help?`,
    firstMessageMode: "assistant-speaks-first",
    model: {
      provider: "anthropic", model: process.env.VAPI_MODEL || "claude-sonnet-5", temperature: 0.3, maxTokens: 600,
      messages: [{ role: "system", content: personaSystem(p) + `\nYou are speaking live in a browser microphone conversation. The caller may speak English or Spanish; begin in ${language === "es" ? "Spanish" : "English"} and follow their language. Speak naturally, one brief answer or question at a time. Never narrate planning, markdown, URLs, or JSON. send_owner_summary is an asynchronous, one-way on-page preview update: emit it as facts emerge and continue speaking naturally without waiting for a tool result. It does not book, dispatch, contact an owner, send texts, take payment, or confirm availability. Callback-only requests stay callbacks. Read back phone/address corrections before treating them as settled. Safety guidance is spoken first, before intake or tool details.` }],
      tools: [{ type: "function", async: true, function: { name: OWNER_SUMMARY.name, description: OWNER_SUMMARY.description, parameters: structuredClone(OWNER_SUMMARY.input_schema) } }],
    },
    transcriber: { provider: "deepgram", model: "nova-3", language: "multi" },
    voice: { provider: "vapi", voiceId: "Elliot", version: 2, language: "auto" },
    maxDurationSeconds: MAX_SECONDS, silenceTimeoutSeconds: 20, customerJoinTimeoutSeconds: 30,
    clientMessages: ["transcript", "tool-calls", "speech-update", "status-update"],
    serverMessages: [],
    artifactPlan: { recordingEnabled: false, videoRecordingEnabled: false, loggingEnabled: false, transcriptPlan: { enabled: true } },
    analysisPlan: { summaryPlan: { enabled: false }, successEvaluationPlan: { enabled: false } },
    metadata: { scope: "website-practice" },
  };
}

// One CAS document arbitrates global/IP quotas and concurrent starts across instances. A
// reservation is spent before any provider request; daily/IP counts are never refunded.
async function reserve(ip, key) {
  const id = randomBytes(16).toString("hex");
  const ipKey = createHmac("sha256", key).update(ip).digest("hex");
  return atomicUpdate("practice_voice", "budget", current => {
    // Re-evaluate the period after every CAS conflict. A delayed pre-midnight/hour
    // request must not overwrite counters already committed in the newer period.
    const at = Date.now();
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(at));
    const hour = Math.floor(at / 3600000);
    const state = current || {};
    const active = (state.active || []).filter(item => item.until === null || item.until > at);
    const ips = Object.fromEntries(Object.entries(state.ips || {}).filter(([, value]) => value.hour === hour));
    const starts = state.day === day ? state.starts || 0 : 0;
    if (starts >= DAILY_STARTS) return { result: { error: "daily_limit", status: 429 } };
    if ((ips[ipKey]?.count || 0) >= IP_HOURLY_STARTS) return { result: { error: "rate_limited", status: 429 } };
    if (active.length >= CONCURRENCY) return { result: { error: "busy", status: 429 } };
    active.push({ id, until: null, at });
    ips[ipKey] = { hour, count: (ips[ipKey]?.count || 0) + 1 };
    return { value: { day, starts: starts + 1, ips, active }, result: { id } };
  });
}
async function markCreated(id) {
  await atomicUpdate("practice_voice", "budget", state => {
    const item = state?.active?.find(item => item.id === id);
    if (!item) throw new Error("Practice call reservation missing");
    // Known created web calls cannot outlive 30s join + 90s call + a 30s buffer.
    item.until = Date.now() + 150000;
    return { value: state };
  });
}
async function releaseRejected(id) {
  await atomicUpdate("practice_voice", "budget", state => {
    if (!state?.active) throw new Error("Practice call reservation missing");
    return { value: { ...state, active: state.active.filter(item => item.id !== id) } };
  });
}

export default async (req, context) => {
  if (new URL(req.url).pathname !== config.path) return reply({ error: "not_found" }, 404);
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (!allowedOrigin(req)) return reply({ error: "forbidden" }, 403);
  const key = process.env.VAPI_API_KEY, publicKey = process.env.VAPI_PUBLIC_KEY;
  if (!key || !publicKey) return reply({ error: "voice_unavailable" }, 503);
  if (Number(req.headers.get("content-length")) > 1024) return reply({ error: "invalid_request" }, 400);
  let body;
  try { const raw = await req.text(); if (raw.length > 1024) return reply({ error: "invalid_request" }, 400); body = JSON.parse(raw); }
  catch { return reply({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["persona", "language"].includes(key)) || !SCENARIOS.includes(body.persona) || !["en", "es"].includes(body.language)) return reply({ error: "invalid_request" }, 400);
  let reservation;
  try { reservation = await reserve(String(context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown").slice(0, 100), key); }
  catch { return reply({ error: "storage_unavailable" }, 503); }
  if (reservation.error) return reply({ error: reservation.error }, reservation.status);
  try {
    // The documented Web SDK creation route requires PUBLIC scope. Keep even that
    // key server-side so browsers can submit only our fixed practice allowlist.
    // Forward the already validated browser Origin for the public key's restrictions.
    const response = await fetch("https://api.vapi.ai/call/web", { method: "POST", headers: { Authorization: `Bearer ${publicKey}`, Origin: req.headers.get("origin"), "Content-Type": "application/json" }, body: JSON.stringify({ assistant: assistant(body.persona, body.language), roomDeleteOnUserLeaveEnabled: true }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      console.error("practice voice create rejected", response.status);
      // One direct fetch, no SDK/retry layer: explicit invalid-request/key/payment
      // rejection created no call. Free concurrency only; keep all spent start counts.
      // Network exceptions, 5xx and unexpected responses remain uncertain and held.
      if ([400, 401, 402].includes(response.status)) await releaseRejected(reservation.id);
      return reply({ error: "voice_unavailable" }, 502);
    }
    const call = await response.json();
    const url = new URL(call.transport?.callUrl || call.webCallUrl);
    if (typeof call.id !== "string" || call.id.length > 100 || url.protocol !== "https:" || !(url.hostname === "daily.co" || url.hostname.endsWith(".daily.co")) || url.username || url.password) throw new Error("Invalid voice join response");
    if (call.artifactPlan?.recordingEnabled === true || call.artifactPlan?.videoRecordingEnabled === true || (typeof call.transport?.callToken === "string" && call.transport.callToken.length > 8192)) throw new Error("Unsafe voice join response");
    await markCreated(reservation.id);
    const p = PERSONAS[body.persona];
    // SDK reconnect() needs only these room fields. Never forward org data, prompts,
    // monitor/control URLs, server configuration, credentials, or raw provider errors.
    const output = { id: call.id, webCallUrl: url.href, ...(typeof call.transport?.callToken === "string" ? { transport: { callToken: call.transport.callToken } } : {}), artifactPlan: { recordingEnabled: false, videoRecordingEnabled: false }, assistant: { voice: { provider: "vapi" } }, practice: { owner: p.owner, company: p.company, maxDurationSeconds: MAX_SECONDS } };
    if ([key, publicKey].some(credential => JSON.stringify(output).includes(credential))) throw new Error("Unsafe voice join response");
    return reply(output);
  } catch { return reply({ error: "voice_unavailable" }, 502); }
};
