// Stripe: card on file with a 7-day trial. Needs STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and one
// price id per plan (STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PRO).
import { createHmac, timingSafeEqual } from "node:crypto";

const KEY = process.env.STRIPE_SECRET_KEY;
export const stripeEnabled = () => Boolean(KEY && process.env.STRIPE_PRICE_GROWTH);

function priceFor(plan) {
  return { starter: process.env.STRIPE_PRICE_STARTER, growth: process.env.STRIPE_PRICE_GROWTH, pro: process.env.STRIPE_PRICE_PRO }[plan] || process.env.STRIPE_PRICE_GROWTH;
}

async function stripe(path, params) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(KEY + ":").toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const d = await res.json();
  if (!res.ok) throw new Error("stripe " + path + ": " + (d.error?.message || res.status));
  return d;
}

export async function checkoutUrl({ site, client, plan }) {
  const session = await stripe("checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": priceFor(plan),
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "7",
    "subscription_data[metadata][slug]": client.slug,
    payment_method_collection: "always",
    customer_email: client.owner?.email || "",
    client_reference_id: client.slug,
    "metadata[slug]": client.slug,
    "metadata[plan]": plan,
    success_url: `${site}/desk?c=${client.slug}&k=${client.ownerKey}&billing=ok`,
    cancel_url: `${site}/desk?c=${client.slug}&k=${client.ownerKey}&billing=cancel`,
    allow_promotion_codes: "false",
  });
  return session.url;
}

export function verifyWebhook(payload, header) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return false;
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); } catch { return false; }
}
