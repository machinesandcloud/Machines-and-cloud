// Dedicated recovery keeps provider deadlines away from the legacy scheduler's work.
import { atomicUpdate } from "./lib/store.mjs";
import { recoverPhoneActivations } from "./lib/phone-activation.mjs";
export const config = { schedule: "*/10 * * * *" };
export async function runPhoneActivationRecovery() {
  const started = Date.now(), at = new Date(started).toISOString();
  let record;
  try { record = { at, ...await recoverPhoneActivations({ limit: 1, deadlineAt: started + 15000 }), durationMs: Date.now() - started }; }
  catch { record = { at, ok: false, enabled: false, processed: 0, reasonCode: "phone_recovery_unavailable", durationMs: Date.now() - started }; }
  // A late older invocation cannot replace the newest health receipt.
  await atomicUpdate("health", "phoneSetup:lastRun", previous => !previous || previous.at <= at ? { value: record } : {});
  return record;
}
export default async () => {
  const result = await runPhoneActivationRecovery();
  return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
};
