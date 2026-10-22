import { atomicUpdate } from "./lib/store.mjs";
import { dispatchVoiceActivationWave } from "./lib/voice-activation.mjs";
export const config = { schedule: "*/10 * * * *" };
export async function runVoiceActivationRecovery() {
  const started = Date.now(), at = new Date(started).toISOString(); let record;
  try { record = { at, ...await dispatchVoiceActivationWave(), durationMs: Date.now() - started }; }
  catch { record = { at, ok: false, enabled: false, processed: 0, reasonCode: "voice_recovery_unavailable", durationMs: Date.now() - started }; }
  await atomicUpdate("health", "voiceSetup:lastDispatch", previous => !previous || previous.at <= at ? { value: record } : {}); return record;
}
export default async () => { const result = await runVoiceActivationRecovery(); return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }); };
