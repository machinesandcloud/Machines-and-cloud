// /api/health for an uptime monitor: 200 when the scheduler ran inside the last 25 minutes with every block ok,
// 503 otherwise, with the last run record. Steve points a free external monitor at it (OPERATIONS.md).
// Every 503 also evaluates the deduplicated operator email alert (lib/operator-health.mjs). This is how a
// stopped scheduler gets reported: the scheduler cannot alert about itself, so the external monitor's probe
// does. The alert never changes this response and is rate-limited by its own stored state.
import { get } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";
import { schedulerFailureFacts, healthSnapshot, evaluatePlatformAlert } from "./lib/operator-health.mjs";

export const config = { path: "/api/health" };

export default async () => {
  const last = await get("health", "scheduler:lastRun");
  const { healthy, minutesAgo: age, failingBlocks: failing, failingComponents } = schedulerFailureFacts(last);
  if (!healthy) await evaluatePlatformAlert(healthSnapshot(last), { source: "health_endpoint" });
  return json({ ok: healthy, lastRunAt: last?.at || null, minutesAgo: age, failingBlocks: failing, failingComponents }, healthy ? 200 : 503);
};
