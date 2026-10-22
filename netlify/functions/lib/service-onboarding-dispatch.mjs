import { deliveryTenant } from "./managed-consent.mjs";

// A lost wake-up never loses the saved setup: the scheduled coordinator retries it.
export async function dispatchServiceOnboarding(client) {
  const secret = process.env.SERVICE_WORKER_KEY || "";
  if (secret.length < 32) return false;
  let site;
  try { site = new URL(process.env.URL); } catch { return false; }
  if (site.protocol !== "https:" || site.username || site.password) return false;
  const response = await fetch(new URL("/.netlify/functions/service-onboarding-background", site), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
    headers: { "Content-Type": "application/json", "x-service-worker-key": secret },
    body: JSON.stringify({ slug: client.slug, tenant: deliveryTenant(client) }),
  });
  return response.ok;
}
