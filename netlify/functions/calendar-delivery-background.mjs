import { timingSafeEqual } from "node:crypto";
import { runCalendarDeliveryWave } from "./lib/calendar-delivery.mjs";
export const config = { path: "/api/calendar-delivery-background" };
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export default async req => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const expected = Buffer.from(process.env.SERVICE_WORKER_KEY || ""), supplied = Buffer.from(req.headers.get("x-service-worker-key") || "");
  if (expected.length < 32 || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return json({ error: "forbidden" }, 403);
  const raw = await req.text(); if (Buffer.byteLength(raw) > 128) return json({ error: "too_large" }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) return json({ error: "invalid_body" }, 400);
  try { const result = await runCalendarDeliveryWave(); return json(result, result.ok ? 200 : 503); }
  catch { return json({ error: "calendar_worker_unavailable" }, 503); }
};
