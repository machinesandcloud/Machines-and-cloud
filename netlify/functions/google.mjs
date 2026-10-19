// Google Calendar connection. /api/google/auth?c=slug&k=key starts OAuth; Google returns to
// /api/google/callback with the code and the state we gave it.
import { getClient, saveClient, logEvent } from "./lib/store.mjs";
import { authUrl, exchangeCode, googleEnabled } from "./lib/calendar.mjs";
import { json } from "./lib/agent.mjs";

export const config = { path: ["/api/google/auth", "/api/google/callback"] };

export default async (req) => {
  const url = new URL(req.url);
  const site = process.env.URL || url.origin;
  if (!googleEnabled()) return json({ error: "google_not_configured", message: "Calendar connection is not switched on yet. Bookings are texted to you in the meantime." }, 503);

  if (url.pathname.endsWith("/auth")) {
    const c = await getClient(url.searchParams.get("c") || "");
    if (!c || c.ownerKey !== url.searchParams.get("k")) return json({ error: "forbidden" }, 403);
    const state = Buffer.from(JSON.stringify({ c: c.slug, k: c.ownerKey })).toString("base64url");
    return Response.redirect(authUrl(site, state), 302);
  }

  // callback
  let st; try { st = JSON.parse(Buffer.from(url.searchParams.get("state") || "", "base64url").toString()); } catch { st = null; }
  const c = st ? await getClient(st.c) : null;
  if (!c || c.ownerKey !== st.k) return json({ error: "forbidden" }, 403);
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(`${site}/desk?c=${c.slug}&k=${c.ownerKey}&calendar=denied`, 302);
  try {
    const tok = await exchangeCode(site, code);
    c.calendar = { provider: "google", google: { refreshToken: tok.refresh_token, calendarId: "primary", connectedAt: new Date().toISOString() } };
    await saveClient(c);
    await logEvent(c.slug, "calendar_connected", {});
    return Response.redirect(`${site}/desk?c=${c.slug}&k=${c.ownerKey}&calendar=ok`, 302);
  } catch (err) {
    console.error("google callback", err);
    return Response.redirect(`${site}/desk?c=${c.slug}&k=${c.ownerKey}&calendar=error`, 302);
  }
};
