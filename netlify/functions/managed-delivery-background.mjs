import { serviceWorkerAuthorized } from "./lib/managed-sms.mjs";
import { runManagedDeliveryWave } from "./lib/managed-delivery.mjs";
export const config={path:"/api/managed-delivery-background"};
export default async req=>{
  if(req.method!=="POST" || !serviceWorkerAuthorized(req))return new Response("Forbidden",{status:403});
  if((await req.text()).trim()!=="{}")return new Response("Invalid request",{status:400});
  try{const result=await runManagedDeliveryWave();return Response.json(result,{status:result.ok?200:503});}
  catch{return Response.json({ok:false,error:"delivery_wave_unavailable"},{status:503});}
};
