// Card on file with the 7-day trial through Stripe Checkout. GET ?c=slug&k=key&plan=growth redirects
// to Checkout. Stripe calls /api/stripe-webhook when the subscription is created or changes.
import { getClient, saveClient, logEvent } from "./lib/store.mjs";
import { checkoutUrl, stripeEnabled } from "./lib/billing.mjs";
import { json } from "./lib/agent.mjs";

export const config = { path: "/api/billing" };

export default async (req) => {
  const url = new URL(req.url);
  const c = await getClient(url.searchParams.get("c") || "");
  if (!c || c.ownerKey !== url.searchParams.get("k")) return json({ error: "forbidden" }, 403);
  const plan = ["starter", "growth", "pro"].includes(url.searchParams.get("plan")) ? url.searchParams.get("plan") : c.plan;
  if (!stripeEnabled()) return json({ error: "billing_not_configured", message: "Card on file is not switched on yet. Steve will set up billing with you by email before day 8." }, 503);
  try {
    c.plan = plan; await saveClient(c);
    const link = await checkoutUrl({ site: process.env.URL || url.origin, client: c, plan });
    await logEvent(c.slug, "checkout_started", { plan });
    return Response.redirect(link, 303);
  } catch (err) {
    console.error("checkout failed", err);
    return json({ error: "checkout_failed" }, 502);
  }
};
