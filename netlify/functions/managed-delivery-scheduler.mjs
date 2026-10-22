import { dispatchManagedDeliveryWave } from "./lib/managed-delivery.mjs";
import { put } from "./lib/store.mjs";
import { dispatchPendingManagedSMS } from "./lib/managed-sms.mjs";
export const config = { schedule: "*/10 * * * *" };
export default async () => {
  let result;
  try { result = await dispatchManagedDeliveryWave(); const inbound=await dispatchPendingManagedSMS({limit:2}); result.inboundDispatched=inbound.dispatched; }
  catch { result = { ok: false, error: "managed_delivery_unavailable" }; }
  await put("health", "managedDelivery:lastDispatch", { at: new Date().toISOString(), ...result });
  return Response.json(result, { status: result.ok ? 200 : 503 });
};
