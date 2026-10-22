import { timingSafeEqual } from "node:crypto";
import { runVoiceActivationWave } from "./lib/voice-activation.mjs";
export const config = { path: "/api/voice-activation-background" };
export default async req => {
  if (req.method !== "POST") return Response.json({ error: "method" }, { status: 405 });
  const expected = process.env.SERVICE_WORKER_KEY || "", supplied = req.headers.get("x-service-worker-key") || "";
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (expected.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "forbidden" }, { status: 403 });
  const raw = await req.text(); if (raw.length > 128) return Response.json({ error: "too_large" }, { status: 413 });
  let body; try { body = JSON.parse(raw); } catch { return Response.json({ error: "json" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) return Response.json({ error: "invalid_body" }, { status: 400 });
  const result = await runVoiceActivationWave(); return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
};
