// /api/health for an uptime monitor: 200 when the scheduler ran inside the last 25 minutes with every block ok,
// 503 otherwise, with the last run record. Steve points a free external monitor at it (OPERATIONS.md).
import { get } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";
import { serviceHealthFailureFacts, schedulerHealthState } from "./lib/service-health.mjs";

export const config = { path: "/api/health" };

export default async () => {
  const last = await get("health", "scheduler:lastRun");
  const {healthy,minutesAgo:age,blocks}=schedulerHealthState(last);
  const failingComponents=serviceHealthFailureFacts(blocks.find(([name])=>name==="serviceDeliveryRecovery")?.[1]);
  const failing = blocks.filter(([, b]) => b?.ok !== true).map(([k, b]) => `${k}: ${k==="serviceDeliveryRecovery" ? failingComponents[0]?.reasonCode || "service_delivery_unresolved" : b?.error || b?.reasonCode || "reported failure"}`);
  return json({ ok: healthy, lastRunAt: last?.at || null, minutesAgo: age, failingBlocks: failing, failingComponents }, healthy ? 200 : 503);
};
