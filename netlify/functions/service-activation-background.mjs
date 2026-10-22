// A saved customer authorization triggers bounded continuation; scheduled workers recover losses.
import { serviceWorkerAuthorized } from "./lib/managed-sms.mjs";
import { strictRead } from "./lib/accounts.mjs";
import { continueMessagingActivation } from "./lib/messaging-activation.mjs";
import { runManagedDelivery } from "./lib/managed-delivery.mjs";
import { deliveryTenant } from "./lib/managed-consent.mjs";
export default async req => {
  if (req.method!=="POST" || !serviceWorkerAuthorized(req)) return new Response("Forbidden",{status:403});
  let body; try { body=await req.json(); } catch { return new Response("Invalid request",{status:400}); }
  if (Object.keys(body).some(key=>!["slug","tenant"].includes(key)) || !/^[a-z0-9-]{1,40}$/.test(body.slug || "") || !/^[a-f0-9]{64}$/.test(body.tenant || "")) return new Response("Invalid request",{status:400});
  const client=await strictRead("clients",body.slug);
  if (!client || deliveryTenant(client)!==body.tenant) return new Response("Not found",{status:404});
  try {
    const operation=await continueMessagingActivation(client,{deadlineAt:Date.now()+45000,maxSteps:3});
    const delivery=await runManagedDelivery({limit:2,discoveryLimit:5,budgetMs:12000});
    return Response.json({ok:true,state:operation?.state || null,delivery});
  } catch { return Response.json({ok:false,error:"activation_continuation_unavailable"},{status:503}); }
};
