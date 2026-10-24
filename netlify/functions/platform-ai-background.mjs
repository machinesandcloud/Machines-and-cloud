import { serviceWorkerAuthorized } from './lib/managed-sms.mjs';
import { strictRead } from './lib/accounts.mjs';
import { supportedWorkspace, workspaceTenant } from './lib/workspace-identity.mjs';
import { runPlatformAITurn } from './lib/platform-ai.mjs';
export const config={path:'/api/platform-ai-background'};
export default async req=>{
  if(req.method!=='POST'||!serviceWorkerAuthorized(req))return new Response('Forbidden',{status:403});
  let body;try{body=await req.json();}catch{return new Response('Invalid request',{status:400});}
  if(!body||Object.keys(body).sort().join(',')!=='requestId,slug,tenant'||!/^[a-z0-9-]{1,40}$/.test(body.slug||'')||!/^[a-f0-9]{64}$/.test(body.tenant||'')||!/^[a-f0-9]{40}$/.test(body.requestId||''))return new Response('Invalid request',{status:400});
  const client=await strictRead('clients',body.slug);if(!supportedWorkspace(client)||workspaceTenant(client)!==body.tenant)return new Response('Not found',{status:404});
  try{const result=await runPlatformAITurn(client,body.requestId);return Response.json(result,{status:result.ok?200:503,headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({ok:false,error:'platform_ai_needs_review'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
