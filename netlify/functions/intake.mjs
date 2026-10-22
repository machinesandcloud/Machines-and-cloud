import { timingSafeEqual } from "node:crypto";
import { accessOriginAllowed } from "./lib/access.mjs";
import { IntakeError, captureIntake, prospectAudience, prospectsCSV } from "./lib/intake.mjs";
export const config = { path: "/api/intake" };
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
const reply = (body, status = 200) => Response.json(body, { status, headers });
const admin = req => {
  const expected = process.env.ADMIN_KEY, given = req.headers.get("x-admin-key");
  return !!expected && typeof given === "string" && Buffer.byteLength(given) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};
export default async (req, context) => {
  const url = new URL(req.url);
  if (url.pathname !== config.path) return reply({ error: "not_found" }, 404);
  if (req.method === "GET") {
    if (!admin(req)) return reply({ error: "forbidden" }, 403);
    const audience = url.searchParams.get("audience") || "eligible", format = url.searchParams.get("format") || "json";
    if (!["all", "eligible"].includes(audience) || !["json", "csv"].includes(format) || [...url.searchParams.keys()].some(key => !["audience", "format"].includes(key))) return reply({ error: "invalid_request" }, 400);
    try {
      const prospects = await prospectAudience(audience);
      if (format === "csv") return new Response(prospectsCSV(prospects), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="prospects-${audience}.csv"` } });
      return reply({ ok: true, audience, prospects });
    } catch { return reply({ error: "intake_unavailable" }, 503); }
  }
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (!accessOriginAllowed(req.headers.get("origin"))) return reply({ error: "forbidden" }, 403);
  if (url.search || Number(req.headers.get("content-length")) > 4096) return reply({ error: "invalid_request" }, 413);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return reply({ error: "invalid_request" }, 415);
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 4096) return reply({ error: "invalid_request" }, 413);
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: "bad_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "invalid_request" }, 400);
    if (typeof body.botfield !== "string") return reply({ error: "invalid_request" }, 400);
    if (body.botfield.length > 0) return reply({ ok: true }, 202);
    return reply(await captureIntake(body, context?.ip || req.headers.get("x-nf-client-connection-ip")), 202);
  } catch (error) {
    if (error instanceof IntakeError) return reply({ error: error.code, message: error.message }, error.status);
    // No PII, raw submission secret or handoff token is logged.
    return reply({ error: "intake_unavailable", message: "We could not save your details. Please try again." }, 503);
  }
};
