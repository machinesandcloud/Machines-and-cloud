// /api/health for an uptime monitor: 200 when the scheduler ran inside the last 25 minutes with every block ok,
// 503 otherwise, with the last run record. Steve points a free external monitor at it (OPERATIONS.md).
import { get } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";

export const config = { path: "/api/health" };

export default async () => {
  const last = await get("health", "scheduler:lastRun");
  const elapsed = Date.now() - Date.parse(last?.at || "");
  const age = Number.isFinite(elapsed) ? Math.floor(elapsed / 60000) : null;
  const blocks = last?.blocks && typeof last.blocks === "object" && !Array.isArray(last.blocks) ? Object.entries(last.blocks) : [];
  const healthy = age !== null && elapsed >= 0 && elapsed <= 25 * 60000 && last.ok === true && blocks.length > 0 && blocks.every(([, b]) => b?.ok === true);
  const failing = blocks.filter(([, b]) => b?.ok !== true).map(([k, b]) => `${k}: ${b?.error || b?.reasonCode || "reported failure"}`);
  return json({ ok: healthy, lastRunAt: last?.at || null, minutesAgo: age, failingBlocks: failing }, healthy ? 200 : 503);
};
