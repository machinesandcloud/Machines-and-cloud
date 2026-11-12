// /api/health for an uptime monitor: 200 when the scheduler ran inside the last 25 minutes with every block ok,
// 503 otherwise. Steve points a free external monitor at it (OPERATIONS.md).
// Every 503 also evaluates the deduplicated operator email alert (lib/operator-health.mjs). This is how a
// stopped scheduler gets reported: the scheduler cannot alert about itself, so the external monitor's probe
// does. The alert never changes this response and is rate-limited by its own stored state.
import { get } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";
import { schedulerFailureFacts, healthSnapshot, evaluatePlatformAlert } from "./lib/operator-health.mjs";
import { publicSchedulerFailures } from "./lib/service-health.mjs";

export const config = { path: "/api/health" };

export default async () => {
  const last = await get("health", "scheduler:lastRun");
  const { healthy, minutesAgo: age, blocks, failingComponents } = schedulerFailureFacts(last);
  if (!healthy) await evaluatePlatformAlert(healthSnapshot(last), { source: "health_endpoint" });
  // OH-2: the public body carries only a fixed category and catalogue code per block. The raw
  // reason text stays in healthSnapshot()/system.health for the operator view and in the function log.
  const { failing, failingBlocks } = publicSchedulerFailures(blocks);
  const lastRunAt = Number.isFinite(Date.parse(last?.at || "")) ? new Date(Date.parse(last.at)).toISOString() : null;
  return json({ ok: healthy, lastRunAt, minutesAgo: age, failingBlocks, failing, failingComponents }, healthy ? 200 : 503);
};
