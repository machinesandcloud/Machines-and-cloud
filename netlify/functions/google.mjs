// Google returns only to a fixed portal landing page. The original signed-in owner
// explicitly completes the one-use authorization through /api/client.
import { CalendarError, calendarCallbackDestination } from "./lib/calendar-connection.mjs";
export const config = { path: ["/api/google/auth", "/api/google/callback"] };
const headers = { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex", "Content-Type": "application/json" };
export default async req => {
  const url = new URL(req.url);
  if (req.method !== "GET") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...headers, Allow: "GET" } });
  if (url.pathname.endsWith("/auth")) return new Response(JSON.stringify({ error: "owner_session_required", message: "Connect Calendar from your signed-in workspace." }), { status: 410, headers });
  // Google authorization responses include RFC 9207's issuer; compare the decoded
  // string exactly before looking up state. Keep legacy returns without it valid.
  if ([...url.searchParams.keys()].some(key => !["state", "code", "error", "scope", "authuser", "prompt", "hd", "iss"].includes(key)) || ["state", "code", "error", "iss"].some(key => url.searchParams.getAll(key).length > 1) || (url.searchParams.has("iss") && url.searchParams.get("iss") !== "https://accounts.google.com")) return new Response(JSON.stringify({ error: "invalid_callback" }), { status: 400, headers });
  try {
    const location = await calendarCallbackDestination({ state: url.searchParams.get("state"), code: url.searchParams.get("code"), error: url.searchParams.get("error") });
    return new Response(null, { status: 303, headers: { ...headers, Location: location } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof CalendarError ? error.code : "calendar_unavailable", message: error instanceof CalendarError ? error.message : "Calendar setup could not be confirmed. Return to your workspace and connect again." }), { status: error instanceof CalendarError ? error.status : 503, headers });
  }
};
