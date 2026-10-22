import { serviceWorkerAuthorized, dispatchServiceWorker } from "./lib/managed-sms.mjs";
import { strictRead } from "./lib/accounts.mjs";
import { deliveryTenant } from "./lib/managed-consent.mjs";
import { continueServiceOnboarding } from "./lib/service-onboarding.mjs";
import { dispatchVoiceActivationWave } from "./lib/voice-activation.mjs";

export default async req => {
  if (req.method !== "POST" || !serviceWorkerAuthorized(req)) return new Response("Forbidden", { status: 403 });
  let body;
  try { body = await req.json(); } catch { return new Response("Invalid request", { status: 400 }); }
  if (!body || Object.keys(body).some(key => !["slug", "tenant"].includes(key)) || !/^[a-z0-9-]{1,40}$/.test(body.slug || "") || !/^[a-f0-9]{64}$/.test(body.tenant || "")) return new Response("Invalid request", { status: 400 });
  const client = await strictRead("clients", body.slug);
  if (!client || deliveryTenant(client) !== body.tenant) return new Response("Not found", { status: 404 });
  try {
    const result = await continueServiceOnboarding(client, { deadlineAt: Date.now() + 12000 });
    if (result?.voiceRequested) try { await dispatchVoiceActivationWave(); } catch { /* Dedicated recovery retains the voice intent. */ }
    if (result?.messagingRequested) try { await dispatchServiceWorker("service-activation-background", body); } catch { /* Dedicated recovery retains the texting intent. */ }
    return Response.json({ ok: true, state: result?.state || null });
  } catch { return Response.json({ ok: false, error: "setup_continuation_unavailable" }, { status: 503 }); }
};
