import { AccessError, accessOriginAllowed, requestAccessLink, exchangeAccessToken, getAccessSession, getAccessState, saveAccessDraft, revokeAccessSession } from "./lib/access.mjs";
export const config = { path: "/api/access" };
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export default async (req, context) => {
  if (new URL(req.url).pathname !== config.path) return reply({ error: "not_found" }, 404);
  if (!["GET", "POST", "PUT"].includes(req.method)) return reply({ error: "method_not_allowed" }, 405);
  // Read-only authenticated requests need no Origin. Browser mutations must be first-party.
  if (req.method !== "GET" && !accessOriginAllowed(req.headers.get("origin"))) return reply({ error: "forbidden" }, 403);
  try {
    if (req.method === "GET") {
      const session = await getAccessSession(req);
      return session ? reply(await getAccessState(session)) : reply({ error: "sign_in_required", message: "Sign in to continue." }, 401);
    }
    const raw = await req.text();
    if (raw.length > (req.method === "PUT" ? 26000 : 1024)) return reply({ error: "invalid_request" }, 413);
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: "bad_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "invalid_request" }, 400);
    if (req.method === "POST" && body.action === "request_link") return reply(await requestAccessLink(body.email, context?.ip || req.headers.get("x-nf-client-connection-ip"), body.plan), 202);
    if (req.method === "POST" && body.action === "exchange") return reply(await exchangeAccessToken(body.token, context?.ip || req.headers.get("x-nf-client-connection-ip")));
    const session = await getAccessSession(req);
    if (!session) return reply({ error: "sign_in_required", message: "Sign in to continue." }, 401);
    if (req.method === "PUT") return reply(await saveAccessDraft(session, body));
    if (body.action === "sign_out") return reply(await revokeAccessSession(session));
    return reply({ error: "invalid_action" }, 400);
  } catch (error) {
    if (error instanceof AccessError) return reply({ error: error.code, message: error.message }, error.status);
    console.error("access operation unavailable");
    return reply({ error: "access_unavailable", message: "We could not confirm this request. Please try again; if a sign-in link was used, request a new one." }, 503);
  }
};
