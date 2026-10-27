import { atomicUpdate } from "./lib/store.mjs";
import { recoverServiceOnboardings } from "./lib/service-onboarding.mjs";
import { dispatchServiceOnboardingWork } from "./lib/service-onboarding-dispatch.mjs";

export const config = { schedule: "*/2 * * * *" };
async function recoveryWave(recover, now, dispatch=dispatchServiceOnboardingWork) {
  const started = now(), deadlineAt = started + 12000, visited = new Set();
  const result = { at: new Date(started).toISOString(), ok: true, processed: 0, visited: 0, waveLimit: 5, scope: "at_most_5_distinct", outcomes: [], deadlineReached: false };
  try {
    for (let step = 0; step < 5; step++) {
      if (now() >= deadlineAt) { result.ok = false; result.deadlineReached = true; result.reasonCode = "setup_coordinator_deadline"; break; }
      const one = await recover({ limit: 1, deadlineAt, excludeIds: [...visited] });
      if (!one.visitedId) { if (one.ok === false) { result.ok = false; result.reasonCode ||= one.reasonCode || "setup_coordinator_unavailable"; } break; }
      if (visited.has(one.visitedId)) { result.ok = false; result.reasonCode = "setup_coordinator_duplicate_candidate"; break; }
      visited.add(one.visitedId); result.visited = visited.size;
      result.processed += one.processed === 1 ? 1 : 0;
      if(one.dispatch){if(deadlineAt-now()>=3500){try{if(!await dispatch(one.dispatch))result.wakeupDeferred=(result.wakeupDeferred||0)+1;}catch{result.wakeupDeferred=(result.wakeupDeferred||0)+1;}}else result.wakeupDeferred=(result.wakeupDeferred||0)+1;}
      // Deliberately omit IDs, tenant bindings, dispatch bodies and owner data.
      result.outcomes.push(...(one.outcomes || []).slice(0, 1).map(row => ({ state: row.state || null, reasonCode: row.reasonCode || null })));
      if (one.ok === false) { result.ok = false; result.reasonCode ||= one.reasonCode || one.outcomes?.[0]?.reasonCode || "setup_coordinator_unavailable"; }
    }
  } catch { result.ok = false; result.reasonCode ||= "setup_coordinator_unavailable"; }
  result.completedAt = new Date(now()).toISOString(); result.durationMs = now() - started;
  if (now() >= deadlineAt) { result.deadlineReached = true; if (result.visited < 5) { result.ok = false; result.reasonCode ||= "setup_coordinator_deadline"; } }
  await atomicUpdate("health", "serviceOnboarding:lastRun", previous => !previous || previous.at <= result.at ? { value: result } : {});
  return result;
}
export const runServiceOnboardingRecovery = () => recoveryWave(recoverServiceOnboardings, () => Date.now());
export function createServiceOnboardingRecoveryRunner({ recover, now = () => Date.now(), dispatch = async()=>false } = {}) {
  let fixture = false; try { fixture = process.env.NODE_ENV === "test" && process.env.MC_MEMORY_STORE === "1" && process.env.MC_FAKE_MODEL === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.URL).hostname); } catch {}
  if (!fixture || typeof recover !== "function" || typeof now !== "function"||typeof dispatch!=="function") throw new Error("Injected service recovery is fixture-only");
  return () => recoveryWave(recover, now, dispatch);
}
export default async () => {
  const result = await runServiceOnboardingRecovery();
  return Response.json(result, { status: result.ok === false ? 503 : 200, headers: { "Cache-Control": "no-store" } });
};
