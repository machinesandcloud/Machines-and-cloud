// Stripe webhook: keeps billing status on the client record.
import { getClient, saveClient, logEvent } from "./lib/store.mjs";
import { verifyWebhook } from "./lib/billing.mjs";
import { notifySteve } from "./lib/send.mjs";
import { isSelfServiceClient } from './lib/setup.mjs';
import { handleWorkspaceBillingEvent } from './lib/workspace-billing.mjs';

export const config = { path: "/api/stripe-webhook" };

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const payload = await req.text();
  if(payload.length>250000)return new Response('too large',{status:413});
  if (!verifyWebhook(payload, req.headers.get("stripe-signature"))) return new Response("bad signature", { status: 400 });
  let ev; try { ev = JSON.parse(payload); } catch { return new Response("bad json", { status: 400 }); }
  try { if (await handleWorkspaceBillingEvent(ev,payload)) return new Response('ok'); }
  catch { return new Response('billing event unconfirmed',{status:503}); }
  const obj = ev.data?.object || {};
  const slug = obj.metadata?.slug || obj.client_reference_id || obj.subscription_details?.metadata?.slug;
  if (!slug) return new Response("ok");
  const c = await getClient(slug);
  if (!c) return new Response("ok");
  // Legacy slug metadata is never sufficient authority for a verified-owner workspace.
  if (isSelfServiceClient(c)) return new Response('ignored');
  const b = c.billing || {};
  switch (ev.type) {
    case "checkout.session.completed":
      Object.assign(b, { status: "trialing", stripeCustomerId: obj.customer, subscriptionId: obj.subscription, checkoutAt: new Date().toISOString() });
      if (obj.metadata?.plan) c.plan = obj.metadata.plan;
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      Object.assign(b, { status: obj.status, subscriptionId: obj.id, stripeCustomerId: obj.customer, trialEnd: obj.trial_end ? new Date(obj.trial_end * 1000).toISOString() : b.trialEnd });
      break;
    case "customer.subscription.deleted":
      b.status = "canceled"; c.status = "paused";
      await notifySteve(`Canceled: ${c.business?.name || slug}`, "Subscription deleted in Stripe. Front desk paused.");
      break;
    case "invoice.payment_failed":
      b.status = "past_due";
      await notifySteve(`Payment failed: ${c.business?.name || slug}`, "Stripe invoice payment failed.");
      break;
    default:
      return new Response("ignored");
  }
  c.billing = b;
  await saveClient(c);
  await logEvent(c, "billing", { type: ev.type, status: b.status });
  return new Response("ok");
};
