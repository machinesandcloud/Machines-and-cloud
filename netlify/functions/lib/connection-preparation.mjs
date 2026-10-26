// Initial connection preparation uses the existing client CAS only. It never calls providers.
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { atomicUpdate, list } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { configurationRevision, isSupportedSelfServiceClient } from './setup.mjs';
import { workspaceEditRevision } from './workspace-edit.mjs';
import { workspaceTenant } from './workspace-identity.mjs';
import { exactWebsiteOrigin } from './website-installation.mjs';

const CHANNELS = ['web', 'voice', 'sms', 'calendar'];
const hex = (value, min=64, max=min) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${min},${max}}$`).test(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const choices = c => CHANNELS.filter(id => (c.onboarding?.desiredChannels || ['web']).includes(id));
const metadata = c => c.management?.connectionPreparation || { generation: 0 };
function token(c) {
  return digest({ version:1, tenant:workspaceTenant(c), config:configurationRevision(c), edit:workspaceEditRevision(c), desiredChannels:choices(c), lifecycle:[c.status,c.operationLifecycleVersion||0,c.liveAt||null,c.pausedAt||null,c.cancelledAt||null], generation:metadata(c).generation, providerStartedAt:metadata(c).providerStartedAt||null, serviceInformation:c.management?.serviceIntake||null });
}
export class ConnectionPreparationError extends Error {
  constructor(code,message,status=409,field) { super(message); this.code=code; this.status=status; if(field)this.field=field; }
}
const fail = (code,message,status,field) => { throw new ConnectionPreparationError(code,message,status,field); };
function protectedClient(c) {
  const preparation=metadata(c);
  return !!preparation.providerStartedAt || !preparation || typeof preparation!=='object' || !Number.isSafeInteger(preparation.generation) || preparation.generation<0 || preparation.generation>=10000 || !isSupportedSelfServiceClient(c) || c.status!=='testing' || !!(c.liveAt || c.pausedAt || c.cancelledAt || c.operationLifecycleVersion) ||
    Object.values(c.setupProof || {}).some(value => value!==null && value!=='' && value!==false) ||
    Object.values(c.channels || {}).some(row => row?.active===true) ||
    !!(c.phone?.twilioNumber || c.phone?.twilioSid || c.phone?.voiceForwardTo || c.leads?.angiKey || c.leads?.thumbtackSecret) ||
    !!(c.voice?.assistantId || c.voice?.provider && c.voice.provider!=='none' || c.calendar?.provider && c.calendar.provider!=='none' || c.billing?.status && c.billing.status!=='none') ||
    Object.keys(c.provision?.steps || {}).length>0;
}
async function retainedSetup(c) {
  // Retained records, including disconnected/uncertain approvals, require the ordinary controls.
  const prefix=c.slug+'/', kinds=['phone_activation_intents','voice_activation_intents','messaging_activation','service_onboarding_intents','lead_connections','workspace_billing','workspace_billing_reviews'];
  const [calendar, ...keys] = await Promise.all([strictRead('calendar_connections',c.slug), ...kinds.map(kind=>list(kind,prefix))]);
  if(calendar || keys.some(rows=>rows.length>0))return true;
  const queues=await Promise.all(['phone_activation_queue','voice_activation_queue','service_onboarding_queue'].map(kind=>strictRead(kind,'active_v1')));
  return queues.some(queue=>queue && (!queue.intents || typeof queue.intents!=='object' || Array.isArray(queue.intents) || Object.entries(queue.intents).some(([id,row])=>id.startsWith(prefix)||row?.slug===c.slug)));
}
function baseView(c, eligible, reasonCode=null) {
  const currentToken=eligible?token(c):null, receipt=metadata(c).lastReceipt;
  const prepared=!!currentToken && receipt?.resultingToken===currentToken;
  let origin=null;try{origin=exactWebsiteOrigin(new URL(c.business?.website).origin);}catch{}
  return { eligible, prepared, selectionSaved:!!receipt&&hex(receipt.submissionId,32,64)&&hex(receipt.resultingToken), reasonCode, token:currentToken, desiredChannels:choices(c), website:c.business?.website || '', websiteOrigin:origin, lastSubmissionId:prepared?receipt.submissionId:null };
}
export async function connectionPreparationView(c) {
  if(protectedClient(c))return baseView(c,false,'workspace_protected');
  try { return await retainedSetup(c)?baseView(c,false,'retained_setup'):baseView(c,true); }
  catch { return baseView(c,false,'unavailable'); }
}
export function normalizeConnectionWebsite(value) {
  if(typeof value!=='string' || value.length>300 || /[\u0000-\u0020\u007f]/.test(value))fail('invalid_website','Enter a full public HTTPS website, or leave it blank.',422,'business.website');
  if(value==='')return '';
  let url;try{url=new URL(value);}catch{fail('invalid_website','Enter a full public HTTPS website, such as https://yourbusiness.com.',422,'business.website');}
  const host=url.hostname.toLowerCase(), labels=host.split('.');
  if(url.protocol!=='https:' || url.username || url.password || url.port || url.hash || !exactWebsiteOrigin(url.origin) || isIP(host.replace(/^\[|\]$/g,'')) || labels.length<2 || labels.some(label=>!label||label==='*') || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(host) || /^(?:www\.)?machinesandcloud\.com$/.test(host) || /^(?:[a-z0-9-]+--)?machines-and-cloud\.netlify\.app$/.test(host))fail('invalid_website','Use your own public HTTPS website without credentials, a custom port or a page fragment.',422,'business.website');
  return url.href;
}
function input(body) {
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!['action','expectedPreparationToken','submissionId','desiredChannels','website'].includes(key)) || body.action!=='prepare_connections' || !hex(body.expectedPreparationToken) || !hex(body.submissionId,32,64) || !Array.isArray(body.desiredChannels) || body.desiredChannels.length>4 || new Set(body.desiredChannels).size!==body.desiredChannels.length || body.desiredChannels.some(id=>!CHANNELS.includes(id)))fail('invalid_preparation','Check your selected services before preparing them.',400);
  const desiredChannels=CHANNELS.filter(id=>body.desiredChannels.includes(id));
  const payload={desiredChannels,...(Object.hasOwn(body,'website')?{website:normalizeConnectionWebsite(body.website)}:{})};
  return {payload,payloadHash:digest(payload)};
}
async function activeOwner(c, session) {
  if(!hex(session?.sessionHash) || normalizeAccountEmail(session.email)!==normalizeAccountEmail(c.owner?.email))fail('verification_required','Sign in again to prepare your services.',401);
  const saved=await strictRead('access_sessions',session.sessionHash);
  if(!saved || saved.status!=='active' || saved.scope!=='onboarding' || normalizeAccountEmail(saved.email)!==normalizeAccountEmail(c.owner?.email) || Date.parse(saved.expiresAt)<=Date.now() || !Number.isFinite(Date.parse(saved.expiresAt)))fail('verification_required','Sign in again to prepare your services.',401);
}
// The shared client fence orders ordinary provider starts against initial preparation CAS.
// It records the attempted handoff only; it neither grants permission nor certifies setup.
export async function fenceConnectionPreparation(c,session,kind) {
  if(!['calendar','lead_platform'].includes(kind))throw new Error('Unsupported preparation fence');
  return atomicUpdate('clients',c.slug,async current=>{
    if(!current || !isSupportedSelfServiceClient(current) || workspaceTenant(current)!==workspaceTenant(c) || !['testing','live','paused'].includes(current.status))fail('preparation_changed','This workspace changed. Refresh before connecting a service.',409);
    await activeOwner(current,session);
    const previous=metadata(current);
    if(previous.providerStartedAt)return {result:current};
    const next={...current,management:{...current.management,connectionPreparation:{...previous,generation:Number.isSafeInteger(previous.generation)?previous.generation:0,providerStartedAt:new Date().toISOString(),providerStartKind:kind}}};
    return {value:next,result:next};
  });
}
export async function prepareConnections(c, session, body) {
  const {payload,payloadHash}=input(body), at=new Date().toISOString();
  const outcome=await atomicUpdate('clients',c.slug,async current=>{
    if(!current || !isSupportedSelfServiceClient(current) || workspaceTenant(current)!==workspaceTenant(c))fail('preparation_changed','This workspace changed. Sign in and review the current setup.',409);
    await activeOwner(current,session);
    const previous=metadata(current), receipt=previous.lastReceipt;
    if(receipt?.submissionId===body.submissionId){
      if(receipt.payloadHash!==payloadHash || receipt.inputToken!==body.expectedPreparationToken)fail('submission_conflict','This setup reference was already used for different details.',409);
      if(protectedClient(current) || await retainedSetup(current) || receipt.resultingToken!==token(current))fail('preparation_changed','Your saved setup changed after this preparation. Check the latest details before continuing.',409);
      return {result:{client:current,replayed:true}};
    }
    if(protectedClient(current) || await retainedSetup(current))fail('prepare_setup_protected','Your setup has already progressed. Use the current connection controls; existing approvals are kept.',409);
    if(body.expectedPreparationToken!==token(current))fail('preparation_changed','Your setup details changed. Review the latest version before preparing your services.',409);
    if(!Number.isSafeInteger(previous.generation) || previous.generation<0 || previous.generation>=10000)fail('prepare_setup_protected','Use the current connection controls to continue your saved setup.',409);
    const next=structuredClone(current);
    next.onboarding={...next.onboarding,desiredChannels:payload.desiredChannels};
    if(Object.hasOwn(payload,'website')) {
      next.business={...next.business,website:payload.website};
      if(payload.website && payload.desiredChannels.includes('web')) {
        const origin=exactWebsiteOrigin(new URL(payload.website).origin), prior=next.widget?.allowedOrigins || [];
        if(!Array.isArray(prior) || prior.length>5 || prior.some(value=>!exactWebsiteOrigin(value)))fail('prepare_setup_protected','Review your existing website permissions in Connections.',409);
        const origins=[...new Set([...prior,origin])];
        if(origins.length>5)fail('prepare_setup_protected','Review your existing website permissions before adding another.',409);
        next.widget={...next.widget,allowedOrigins:origins};
      }
    }
    next.management={...next.management,connectionPreparation:{generation:previous.generation+1}};
    const resultingToken=token(next);
    next.management.connectionPreparation.lastReceipt={submissionId:body.submissionId,payloadHash,inputToken:body.expectedPreparationToken,resultingToken,at};
    next.updatedAt=at;
    // CAS retries reread the latest client; no approval, review or lifecycle metadata is replaced.
    await activeOwner(current,session);
    return {value:next,result:{client:next,replayed:false}};
  });
  const view=await connectionPreparationView(outcome.client);
  return {...outcome,preparation:{state:'saved',replayed:outcome.replayed,submissionId:body.submissionId,token:view.token},connectionPreparation:view};
}
