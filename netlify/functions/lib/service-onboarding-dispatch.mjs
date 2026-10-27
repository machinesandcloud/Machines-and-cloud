import { deliveryTenant } from "./managed-consent.mjs";

// A lost wake-up never loses the saved setup: the scheduled coordinator retries it.
export async function dispatchServiceOnboarding(client) {
  return dispatchServiceOnboardingWork({slug:client.slug,tenant:deliveryTenant(client)});
}
// Private durable-queue hints may wake the same existing coordinator. They are
// never customer authority or permission to create another setup operation.
export async function dispatchServiceOnboardingWork({slug,tenant}={}) {
  if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug||'')||!/^[a-f0-9]{64}$/.test(tenant||''))return false;
  const secret = process.env.SERVICE_WORKER_KEY || "";
  if (secret.length < 32) return false;
  let site;
  try { site = new URL(process.env.URL); } catch { return false; }
  if (site.protocol !== "https:" || site.username || site.password) return false;
  const response = await fetch(new URL("/.netlify/functions/service-onboarding-background", site), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
    headers: { "Content-Type": "application/json", "x-service-worker-key": secret },
    body: JSON.stringify({ slug, tenant }),
  });
  return response.ok;
}
