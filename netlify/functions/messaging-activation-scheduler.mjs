// Dedicated bounded recovery. Existing customer authority and the product-wide policy are
// rechecked by the production engine; this endpoint never accepts provider actions from a body.
import { recoverMessagingActivations } from "./lib/messaging-activation.mjs";
import { atomicUpdate } from "./lib/store.mjs";
export const config = { schedule: "*/10 * * * *" };
export async function runMessagingActivationRecovery() {
  const at = new Date().toISOString(); let result;
  try { result = await recoverMessagingActivations({ limit: 1, deadlineAt: Date.now() + 15000 }); }
  catch { result = { ok: false, enabled: false, processed: 0, reasonCode: "messaging_recovery_unavailable", outcomes: [] }; }
  const receipt = { at, ...result };
  await atomicUpdate("health", "messagingSetup:lastRun", previous => !previous || previous.at <= at ? { value: receipt } : {});
  return receipt;
}
export default async () => {
  const result = await runMessagingActivationRecovery();
  return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
};
