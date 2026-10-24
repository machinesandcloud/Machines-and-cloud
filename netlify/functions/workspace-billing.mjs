import { getAccessSession, accessOriginAllowed } from './lib/access.mjs';
import { strictRead, normalizeAccountEmail } from './lib/accounts.mjs';
import { isSupportedSelfServiceClient } from './lib/setup.mjs';
import { workspaceBillingStatus, reviewWorkspaceBilling, startWorkspaceCheckout, refreshWorkspaceBilling, cancelWorkspaceRenewal, openWorkspaceBillingPortal, beginWorkspaceBillingProof, cleanupWorkspaceBillingProof, closeWorkspaceBillingProof, WorkspaceBillingError } from './lib/workspace-billing.mjs';
export const config={path:'/api/workspace-billing'};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store'}});
export default async req=>{
  try{
    if(!['GET','POST'].includes(req.method))return json({error:'method_not_allowed'},405);
    const origin=req.headers.get('origin');if(req.method==='POST'&&!accessOriginAllowed(origin)||origin&&!accessOriginAllowed(origin))return json({error:'forbidden'},403);
    const session=await getAccessSession(req);if(!session)return json({error:'verification_required',message:'Sign in by email to manage billing.'},401);
    const url=new URL(req.url);if([...url.searchParams.keys()].some(name=>name!=='c'))return json({error:'invalid_billing_request'},400);
    const c=await strictRead('clients',url.searchParams.get('c')||'');if(!isSupportedSelfServiceClient(c)||normalizeAccountEmail(c.owner?.email)!==normalizeAccountEmail(session.email))return json({error:'forbidden'},403);
    if(req.method==='GET')return json({ok:true,billing:await workspaceBillingStatus(c)});
    const raw=await req.text();if(raw.length>4000)return json({error:'invalid_billing_request'},400);let body;try{body=JSON.parse(raw);}catch{return json({error:'invalid_billing_request'},400);}
    const handlers={review:reviewWorkspaceBilling,checkout:startWorkspaceCheckout,refresh:refreshWorkspaceBilling,cancel_renewal:cancelWorkspaceRenewal,portal:openWorkspaceBillingPortal,proof_begin:beginWorkspaceBillingProof,proof_cleanup:cleanupWorkspaceBillingProof,proof_close:closeWorkspaceBillingProof},handler=handlers[body?.action];if(!handler)return json({error:'invalid_billing_request'},400);
    const result=await handler(c,session,body);return json({ok:true,...(body.action==='review'?{review:result}:body.action==='portal'?{portal:result}:{billing:result})});
  }catch(error){return json({error:error instanceof WorkspaceBillingError?error.code:'billing_unavailable',message:error instanceof WorkspaceBillingError?error.message:'Billing could not be confirmed. Check its saved status before trying again.'},error instanceof WorkspaceBillingError?error.status:503);}
};
