// Isolated M&C workspace destination on a shared Stripe merchant account.
// Merchant authentication never grants a foreign product legacy slug authority.
import { verifyWebhookWithSecret, workspaceBillingWebhookSecret } from './lib/billing.mjs';
import { handleWorkspaceBillingEvent } from './lib/workspace-billing.mjs';
export const config = { path: '/api/workspace-billing-webhook' };
export default async req => {
  if (req.method !== 'POST') return new Response('method', { status:405 });
  const payload=await req.text();
  if (Buffer.byteLength(payload,'utf8')>250000) return new Response('too large', { status:413 });
  if (!verifyWebhookWithSecret(payload,req.headers.get('stripe-signature'),workspaceBillingWebhookSecret())) return new Response('bad signature', { status:400 });
  let event;try { event=JSON.parse(payload); } catch { return new Response('bad json', { status:400 }); }
  if (!event||typeof event!=='object'||Array.isArray(event)||typeof event.type!=='string') return new Response('bad event', { status:400 });
  try {
    // Unrelated shared-account deliveries are acknowledged without a legacy
    // client lookup, storage mutation, notification or financial dispatch.
    await handleWorkspaceBillingEvent(event,payload);
    return new Response('ok');
  } catch { return new Response('billing event unconfirmed', { status:503 }); }
};
