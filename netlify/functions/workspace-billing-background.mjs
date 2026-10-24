import { timingSafeEqual } from 'node:crypto';
import { recoverWorkspaceBilling } from './lib/workspace-billing.mjs';
// The filename's -background suffix makes Netlify return 202 before executing
// this bounded recovery wave; the scheduled function never waits for Stripe.
export const config={path:'/api/workspace-billing-background'};
export default async req=>{
  if(req.method!=='POST')return Response.json({error:'method'},{status:405});
  const expected=Buffer.from(process.env.SERVICE_WORKER_KEY||''),supplied=Buffer.from(req.headers.get('x-service-worker-key')||'');
  if(expected.length<32||expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return Response.json({error:'forbidden'},{status:403});
  const raw=await req.text();if(raw.length>128)return Response.json({error:'too_large'},{status:413});
  let body;try{body=JSON.parse(raw);}catch{return Response.json({error:'json'},{status:400});}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)return Response.json({error:'invalid_body'},{status:400});
  try{const result=await recoverWorkspaceBilling();return Response.json(result,{status:result.ok?200:503,headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({ok:false,visited:0,reasonCode:'billing_recovery_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
