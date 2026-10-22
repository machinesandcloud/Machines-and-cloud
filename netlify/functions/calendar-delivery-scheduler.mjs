import { dispatchCalendarDeliveryWave } from "./lib/calendar-delivery.mjs";
import { atomicUpdate } from "./lib/store.mjs";
export const config = { schedule: "*/10 * * * *" };
export default async () => {
  const at = new Date().toISOString(); let result;
  try { result = await dispatchCalendarDeliveryWave(); }
  catch { result = { ok: false, reasonCode: "calendar_dispatch_unavailable" }; }
  await atomicUpdate("health", "calendarDelivery:lastDispatch", current => !current || current.at <= at ? { value: { at, ...result } } : {});
  return Response.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
};
