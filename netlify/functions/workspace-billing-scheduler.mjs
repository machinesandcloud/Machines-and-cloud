import { dispatchWorkspaceBillingWave } from './lib/workspace-billing.mjs';
import { atomicUpdate } from './lib/store.mjs';
export const config={schedule:'*/10 * * * *'};
export default async()=>{
  const at=new Date().toISOString(),result=await dispatchWorkspaceBillingWave();
  // Dispatch acceptance is distinct from completed financial reconciliation.
  await atomicUpdate('health','workspaceBilling:lastDispatch',previous=>!previous||previous.at<=at?{value:{at,...result}}:{});
  return Response.json({at,...result},{status:result.ok?200:503,headers:{'Cache-Control':'no-store'}});
};
