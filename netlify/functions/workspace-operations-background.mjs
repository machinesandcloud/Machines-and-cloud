// Optional recovery hint. The scheduled scan remains authoritative if this dispatch is lost.
import { timingSafeEqual } from "node:crypto";
import { recoverWorkspaceOperations, WorkspaceOperationError } from "./lib/platform-operations.mjs";

export const config = { path: "/api/operations/recover" };
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
export default async req => {
  if (new URL(req.url).pathname !== config.path) return reply({ error: "not_found" }, 404);
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const expected = process.env.WORKSPACE_WORKER_KEY, given = req.headers.get("x-workspace-worker-key");
  if (!expected) return reply({ error: "worker_not_configured" }, 503);
  if (typeof given !== "string" || Buffer.byteLength(given) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return reply({ error: "forbidden" }, 403);
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 1024) return reply({ error: "invalid_request" }, 413);
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: "bad_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["limit", "candidateLimit"].includes(key))) return reply({ error: "invalid_request" }, 400);
    return reply(await recoverWorkspaceOperations(body));
  } catch (error) {
    if (error instanceof WorkspaceOperationError) return reply({ error: error.code, message: error.message }, error.status);
    return reply({ error: "workspace_recovery_unavailable" }, 503);
  }
};
