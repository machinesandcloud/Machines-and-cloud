import { atomicUpdate } from "./lib/store.mjs";
import { recoverServiceReconciliations } from "./lib/service-reconciliation.mjs";
export const config = { schedule: "*/10 * * * *" };
export default async () => {
  const at = new Date().toISOString(); let record;
  try { record = { at, ...await recoverServiceReconciliations({ limit: 1, discoveryLimit: 20 }) }; }
  catch { record = { at, ok: false, processed: 0, reasonCode: "service_check_recovery_unavailable" }; }
  await atomicUpdate("health", "serviceChecks:lastRun", previous => !previous || previous.at <= at ? { value: record } : {});
  return Response.json(record, { status: record.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
};
