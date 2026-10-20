// /api/health for an uptime monitor: 200 when the scheduler ran inside the last 25 minutes with every block ok,
// 503 otherwise, with the last run record. Steve points a free external monitor at it (OPERATIONS.md).
import { get } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";

export const config = { path: "/api/health" };

export default async () => {
  const last = await get("health", "scheduler:lastRun");
  const age = last ? Math.round((Date.now() - new Date(last.at).getTime()) / 60000) : null;
  const healthy = !!last && age !== null && age <= 25 && last.ok !== false;
  const failing = last ? Object.entries(last.blocks || {}).filter(([, b]) => !b.ok).map(([k, b]) => `${k}: ${b.error}`) : [];
  return json({ ok: healthy, lastRunAt: last?.at || null, minutesAgo: age, failingBlocks: failing }, healthy ? 200 : 503);
};
