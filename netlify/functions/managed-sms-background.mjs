import { processManagedSMS, serviceWorkerAuthorized } from "./lib/managed-sms.mjs";
export default async req => {
  if (req.method!=="POST" || !serviceWorkerAuthorized(req)) return new Response("Forbidden",{status:403});
  let body; try { body=await req.json(); } catch { return new Response("Invalid request",{status:400}); }
  if (Object.keys(body).some(key=>key!=="id") || typeof body.id!=="string" || body.id.length>220) return new Response("Invalid request",{status:400});
  const result=await processManagedSMS(body.id);
  return Response.json(result,{status:result.ok?200:503});
};
