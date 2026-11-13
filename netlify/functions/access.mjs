import { AccessError, accessOriginAllowed, requestAccessLink, exchangeAccessToken, getAccessSession, getAccessState, saveAccessDraft, revokeAccessSession, ownerTabHandle, ownerSessionCookies, clearOwnerSessionCookies, ownerCookieSessionHash, revokeReplacedOwnerSession, sameOriginBrowserRequest, ownerProbeCookies, newOwnerProbe, ownerProbeMatches, currentOwnerCookieSession, pendingAccessEmail } from "./lib/access.mjs";
import { IntakeError, attachIntake } from "./lib/intake.mjs";
import { normalizeAccountEmail } from "./lib/accounts.mjs";
export const config = { path: "/api/access" };
const reply = (body, status = 200, cookies = [], extra = {}) => {
  const headers = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...extra });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
};

export default async (req, context) => {
  if (new URL(req.url).pathname !== config.path) return reply({ error: "not_found" }, 404);
  if (!["GET", "POST", "PUT"].includes(req.method)) return reply({ error: "method_not_allowed" }, 405);
  // Read-only authenticated requests need no Origin. Browser mutations must be first-party.
  if (req.method !== "GET" && !accessOriginAllowed(req.headers.get("origin"))) return reply({ error: "forbidden" }, 403);
  try {
    if (req.method === "GET") {
      const session = await getAccessSession(req);
      if (!session) return reply({ error: "sign_in_required", message: "Sign in to continue." }, 401);
      const state = await getAccessState(session);
      const active = await getAccessSession(req);
      if (!active || active.sessionHash !== session.sessionHash || normalizeAccountEmail(active.email) !== normalizeAccountEmail(session.email)) return reply({ error: "sign_in_required", message: "Sign in to continue." }, 401);
      return reply(state);
    }
    const raw = await req.text();
    if (raw.length > (req.method === "PUT" ? 26000 : 1024)) return reply({ error: "invalid_request" }, 413);
    let body; try { body = JSON.parse(raw); } catch { return reply({ error: "bad_json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "invalid_request" }, 400);
    if (req.method === "POST" && body.action === "request_link") return reply(await requestAccessLink(body.email, context?.ip || req.headers.get("x-nf-client-connection-ip"), body.plan, body.intake), 202);
    // Stateless: sets a short-lived, non-secret probe cookie so the exchange can tell whether this browser keeps our cookies.
    if (req.method === "POST" && body.action === "cookie_probe") { const probe = newOwnerProbe(); return reply({ ok: true, probe }, 200, ownerProbeCookies(req, probe)); }
    if (req.method === "POST" && body.action === "exchange") {
      if (Object.hasOwn(body, "transport") && body.transport !== "cookie" || Object.hasOwn(body, "persistent") && typeof body.persistent !== "boolean" || Object.hasOwn(body, "replace") && typeof body.replace !== "boolean" || Object.hasOwn(body, "probe") && typeof body.probe !== "string") return reply({ error: "invalid_request" }, 400);
      // The cookie transport needs a same-origin browser label and the probe cookie back; otherwise the per-tab transport
      // keeps sign-in working (old browsers, cookies silently dropped) rather than spending the link on a cookie that never lands.
      const cookieTransport = body.transport === "cookie" && sameOriginBrowserRequest(req) && ownerProbeMatches(req, body.probe);
      // Deploy check: Netlify must pass Sec-Fetch-Site through to functions, or every browser falls back to per-tab sign-in.
      // One line per exchange with fixed values only (no address, token or session).
      if (body.transport === "cookie") { const site = req.headers.get("sec-fetch-site"); console.info("owner_exchange " + JSON.stringify({ fetchSite: ["same-origin", "same-site", "cross-site", "none"].includes(site) ? site : site ? "other" : "missing", transport: cookieTransport ? "cookie" : "tab" })); }
      if (cookieTransport && body.replace !== true) {
        // Login CSRF: opening someone else's link would switch this whole browser and sign the current owner out.
        // Ask first, without spending the link.
        const current = await currentOwnerCookieSession(req), next = current ? await pendingAccessEmail(body.token) : "";
        if (current && next && normalizeAccountEmail(next) !== normalizeAccountEmail(current.email)) return reply({ error: "replace_confirm", current: current.email, next, message: "This browser is signed in to another account." }, 409);
      }
      const result = await exchangeAccessToken(body.token, context?.ip || req.headers.get("x-nf-client-connection-ip"));
      // Legacy per-tab transport (no cookies in this browser, and server-side checks) keeps its contract.
      if (!cookieTransport) return reply(body.transport === "cookie" ? { ...result, transport: "tab" } : result);
      // Browser transport: the secret goes only into the HttpOnly cookie; the page receives the tab handle.
      // Tell the page whether the session it replaces was this same mailbox (other tabs then say "signed in again", not "another account").
      let previous = null; try { previous = await currentOwnerCookieSession(req); } catch { previous = null; }
      const replaced = previous ? (normalizeAccountEmail(previous.email) === normalizeAccountEmail(result.email) ? "same_account" : "other_account") : null;
      try { await revokeReplacedOwnerSession(ownerCookieSessionHash(req), result.session); } catch { /* The new session stands; the old one still expires. */ }
      const persistent = body.persistent === true;
      // A renewal is bound to the exact handle the cookie held: only a tab on that handle may continue (QA r3 D3).
      const previousHandle = replaced === "same_account" ? previous.handle : null;
      return reply({ ok: true, transport: "cookie", handle: ownerTabHandle(result.session), email: result.email, expiresAt: result.expiresAt, persistent, replaced, previousHandle }, 200, ownerSessionCookies(req, result.session, result.expiresAt, persistent));
    }
    const session = await getAccessSession(req);
    if (!session) return reply({ error: "sign_in_required", message: "Sign in to continue." }, 401);
    if (body.action === "attach_intake") { await attachIntake(session, body.intake); return reply(await getAccessState(session)); }
    if (req.method === "PUT") return reply(await saveAccessDraft(session, body));
    // Sign-out revokes the server session (every tab sharing it then gets 401) and clears this
    // browser's cookie only when it carries that same session.
    if (body.action === "sign_out") return reply(await revokeAccessSession(session), 200, ownerCookieSessionHash(req) === session.sessionHash ? clearOwnerSessionCookies(req) : []);
    return reply({ error: "invalid_action" }, 400);
  } catch (error) {
    if (error instanceof AccessError || error instanceof IntakeError) return reply({ error: error.code, message: error.message, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) }, error.status, [], error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
    console.error("access operation unavailable");
    return reply({ error: "access_unavailable", message: "We could not confirm this request. Please try again; if a sign-in link was used, request a new one." }, 503);
  }
};
