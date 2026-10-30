// One reviewed provider-support outcome. This is not a generic state override:
// recording evidence cannot create/retry resources or write health results.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead } from './accounts.mjs';
import { workspaceTenant } from './workspace-identity.mjs';
import { isSupportedSelfServiceClient } from './setup.mjs';
import { voiceHasNumberUse, voiceRejectedCreateCancellationContext } from './phone-activation.mjs';
const STORE='voice_activation_intents', INDEX='managed_voice_callbacks';
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
let SOURCE=Object.freeze({id:'vapi_support_20261027_rejected_create_v1',provider:'vapi',action:'assistant_create',httpStatus:400,outcome:'rejected_before_creation',assistantCreated:false,providerRequestId:'3f592172-d3a6-9e24-b008-7779d245d889',sourceEvidenceSHA256:'459696cb2dd9f2f8f561fb1b12f4c42b749a6aea4dd15b5d3021faef786d0853',organizationSHA256:'2b40e21ef54ba1ba16d66544b30136102b7b890c89d6857f57627cd7d2d87efe',correlationId:'bd8b9b4b3f869680090d0d5ef278ad5be3d26bec2a50384c1689c58450a30a12',inputRevision:'055dfcf4d692f41fca19a5af0b079f1e052d12c6b7b0aa7051d2a7651ad6cdfd',attemptedAt:'2026-10-27T20:00:24.965Z',assistantCreateStartedAt:'2026-10-27T20:00:24.965Z',generation:1,tenantIdentity:'98b1656fc2c149bc66c2e7c74cf901daf1fece2e40bce80242e5f2190407a3e8',operationId:'m-c-internal-phone-proof-october-7f7c/'+hash('managed-voice-v1:98b1656fc2c149bc66c2e7c74cf901daf1fece2e40bce80242e5f2190407a3e8'),parentId:'m-c-internal-phone-proof-october-7f7c/26e7f0098f01c53bec2cb2748e45884a3fcc7d6fd4cb0a859938a501b673f9c6',parentGeneration:1,parentVoiceStartedAt:'2026-10-27T19:52:08.831Z',providerCredentialSHA256:'3d63846e83d1d6dcd9901b667b0ec5f18442dec2057c32cac7b125a4badb1685'});
const indexKey=()=> 'provider-rejection/'+hash(SOURCE.provider+':'+SOURCE.providerRequestId);
// Isolated synthetic-record tests only, matching the existing provider injection boundary.
export function setVoiceEvidenceFixtureSource(source){
 let fixture=false;try{fixture=process.env.NODE_ENV==='test'&&process.env.MC_FAKE_MODEL==='1'&&process.env.MC_MEMORY_STORE==='1'&&['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.URL).hostname);}catch{}
 if(!fixture||!source||Object.keys(source).sort().join()!==Object.keys(SOURCE).sort().join())throw new VoiceEvidenceError('fixture_only','Reviewed-source injection is restricted to isolated synthetic tests.',503);
 const prior=SOURCE;SOURCE=Object.freeze(structuredClone(source));return()=>{SOURCE=prior;};
}
export class VoiceEvidenceError extends Error{constructor(code,message,status=409){super(message);this.code=code;this.status=status;}}
const fail=(code='voice_evidence_conflict',message='The saved phone operation does not match this reviewed provider evidence.',status=409)=>{throw new VoiceEvidenceError(code,message,status);};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const validClaim=claim=>claim==null||exact(claim,['token','until'])&&/^[a-f0-9]{32}$/.test(claim.token||'')&&typeof claim.until==='string'&&Number.isFinite(Date.parse(claim.until))&&new Date(claim.until).toISOString()===claim.until;
const conflictingFailure=value=>!!value&&(value.action&&value.action!=='assistant_create'||value.httpStatus&&value.httpStatus!==400||value.requestId&&value.requestId!==SOURCE.providerRequestId);
const noResources=row=>!row.assistant&&!row.assistantUpdateStartedAt&&!voiceHasNumberUse(row)&&!(row.cleanupReceipts?.assistants||[]).length&&!(row.cleanupReceipts?.imports||[]).length&&!(row.lateReceipts||[]).some(value=>value.assistant||value.assistantUpdateStartedAt||conflictingFailure(value.providerFailure))&&!Object.values(row.evidence||{}).some(Boolean);
async function context(c,row,{allowClaim=false}={}){
 if(!isSupportedSelfServiceClient(c)||!row||row.id!==c.slug+'/'+hash('managed-voice-v1:'+workspaceTenant(c))||row.tenantIdentity!==workspaceTenant(c)||row.tenantIdentity!==SOURCE.tenantIdentity||row.id!==SOURCE.operationId||row.generation!==SOURCE.generation||row.correlationId!==SOURCE.correlationId||row.inputRevision!==SOURCE.inputRevision||!Number.isSafeInteger(row.generation)||row.generation<1||!noResources(row)||row.assistantCreateStartedAt!==SOURCE.assistantCreateStartedAt||!Number.isFinite(Date.parse(row.assistantCreateStartedAt))||!row.cancelRequestedAt||!validClaim(row.claim)||!allowClaim&&row.claim&&Date.parse(row.claim.until)>Date.now())return null;
 // The timestamp asserted by Support is a transport time, not an invented
 // replacement for the durable pre-dispatch create marker.
 if(Date.parse(row.assistantCreateStartedAt)>Date.parse(SOURCE.attemptedAt))return null;
 const failure=row.providerFailure;
 if(conflictingFailure(failure))return null;
 const lineage=await voiceRejectedCreateCancellationContext(c,row);if(!lineage)return null;
 const parent=await strictRead('service_onboarding_intents',lineage.parentId), credential=parent?.providerBinding?.vapiCredentialHash;
 if(credential!==SOURCE.providerCredentialSHA256||parent.id!==SOURCE.parentId||parent.generation!==SOURCE.parentGeneration||parent.steps?.voice?.id!==row.id||parent.steps.voice.startedAt!==SOURCE.parentVoiceStartedAt)return null;
 return {operationId:row.id,generation:row.generation,tenantIdentity:row.tenantIdentity,correlationId:row.correlationId,inputRevision:row.inputRevision,assistantCreateStartedAt:row.assistantCreateStartedAt,parentId:parent.id,parentGeneration:parent.generation,parentVoiceStartedAt:parent.steps.voice.startedAt,providerCredentialSHA256:credential,organizationSHA256:SOURCE.organizationSHA256,cancellationAt:row.cancelRequestedAt,numberId:row.number.id,phoneIntentId:row.number.intentId};
}
function receiptMatches(row,expected){return row?.providerRejectionEvidence?.source?.id===SOURCE.id&&row.providerRejectionEvidence.contextHash===hash(expected)&&hash(row.providerRejectionEvidence.source)===hash(SOURCE);}
export async function confirmedVoiceCreateRejection(c,row){
 const expected=await context(c,row,{allowClaim:true});if(!expected||!receiptMatches(row,expected))return false;
 const claim=await strictRead(INDEX,indexKey());return claim?.kind==='provider_rejection_receipt_v1'&&claim.state==='attached'&&claim.contextHash===hash(expected)&&claim.sourceSHA256===hash(SOURCE)&&claim.operationId===row.id&&claim.generation===row.generation;
}
export async function voiceRejectionReview(c){
 const row=await strictRead(STORE,c.slug+'/'+hash('managed-voice-v1:'+workspaceTenant(c)));if(!row)return null;
 const saved=row.providerRejectionEvidence,expected=await context(c,row);
 if(!expected){
  // Never hide a retained audit because a late receipt or changed lineage now
  // conflicts with it. It remains read-only and cannot settle that conflict.
  if(row.tenantIdentity!==workspaceTenant(c)||row.id!==SOURCE.operationId||row.generation!==SOURCE.generation||saved?.context?.operationId!==row.id||saved.context.tenantIdentity!==row.tenantIdentity||hash(saved.source)!==hash(SOURCE))return null;
  return {canRecord:false,operationId:row.id,generation:row.generation,source:SOURCE,receipt:{actor:saved.actor,recordedAt:saved.recordedAt,sourceEvidenceSHA256:saved.source.sourceEvidenceSHA256,providerRequestId:saved.source.providerRequestId,state:'retained_requires_review',cleanupConfirmedAt:null},detail:'The provider evidence is retained, but current operation details or a pending worker conflict with its use. Review the saved operation; this evidence cannot confirm cleanup.'};
 }
 const accepted=await confirmedVoiceCreateRejection(c,row),cleanupConfirmed=accepted&&row.state==='cancelled'&&typeof row.cleanupConfirmedAt==='string'&&Number.isFinite(Date.parse(row.cleanupConfirmedAt));
 return {canRecord:!accepted,operationId:row.id,generation:row.generation,contextHash:hash(expected),source:SOURCE,receipt:saved?{actor:saved.actor,recordedAt:saved.recordedAt,sourceEvidenceSHA256:saved.source.sourceEvidenceSHA256,providerRequestId:saved.source.providerRequestId,state:cleanupConfirmed?'cleanup_confirmed':accepted?'recorded':'attachment_unconfirmed',cleanupConfirmedAt:cleanupConfirmed?row.cleanupConfirmedAt:null}:null,detail:cleanupConfirmed?'Verified provider rejection is recorded. Ordinary cancellation recovery confirmed this operation is cancelled.':accepted?'Verified provider rejection is recorded. Ordinary cancellation recovery must still confirm completion.':'A reviewed provider response confirms rejection before creation. Recording it will not start service, retry creation or clear health.'};
}
export async function recordVoiceCreateRejection(c,body,{actor,authorize,expectedManagementRevision,currentManagementRevision}={}){
 if(!exact(body,['action','slug','expectedRevision','reason','operationId','generation','contextHash','evidenceId','confirmed'])||body.action!=='record_voice_rejection'||body.slug!==c.slug||body.evidenceId!==SOURCE.id||body.confirmed!==true||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>300||!actor||typeof authorize!=='function')fail('invalid_voice_evidence','Review the exact provider evidence and add a reason.',400);
 const authorizeCurrent=async()=>{await authorize();const current=await strictRead('clients',c.slug);if(!current||workspaceTenant(current)!==workspaceTenant(c)||currentManagementRevision(current)!==expectedManagementRevision)fail('customer_changed','Refresh customer details before recording evidence.');return current;};
 let current=await authorizeCurrent(),row=await strictRead(STORE,body.operationId),expected=await context(current,row);
 if(!expected||expected.operationId!==body.operationId||expected.generation!==body.generation||hash(expected)!==body.contextHash)fail();
 const fingerprint=hash({source:SOURCE,context:expected});
 // A namespaced identity claim in the existing Voice callback/correlation
 // index prevents the same provider request from settling another operation.
 // A partial reservation remains retained and can only resume this exact receipt.
 await atomicUpdate(INDEX,indexKey(),async old=>{await authorizeCurrent();if(old&&(old.kind!=='provider_rejection_receipt_v1'||old.fingerprint!==fingerprint))fail('voice_evidence_replayed','This provider request is already bound to another evidence record.');return old?{result:old}:{value:{kind:'provider_rejection_receipt_v1',state:'reserved',fingerprint,contextHash:body.contextHash,sourceSHA256:hash(SOURCE),operationId:row.id,generation:row.generation,reservedAt:new Date().toISOString()},result:true};});
 const saved=await atomicUpdate(STORE,row.id,async old=>{const latest=await authorizeCurrent(),actual=await context(latest,old);if(!actual||hash(actual)!==body.contextHash)fail();if(old.providerRejectionEvidence){if(!receiptMatches(old,actual))fail();return {result:old};}const evidence={version:1,source:SOURCE,context:actual,contextHash:body.contextHash,actor,reason:body.reason.trim(),recordedAt:new Date().toISOString(),priorOutcome:{state:old.state,reasonCode:old.reasonCode||null,providerFailure:old.providerFailure||null}};return {value:{...old,providerRejectionEvidence:evidence},result:{...old,providerRejectionEvidence:evidence}};});
 await atomicUpdate(INDEX,indexKey(),async old=>{await authorizeCurrent();if(old?.fingerprint!==fingerprint)fail();return {value:{...old,state:'attached',attachedAt:old.attachedAt||saved.providerRejectionEvidence.recordedAt}};});
 return {ok:true,receipt:{state:'recorded',operationId:row.id,generation:row.generation,providerRequestId:SOURCE.providerRequestId,sourceEvidenceSHA256:SOURCE.sourceEvidenceSHA256,recordedAt:saved.providerRejectionEvidence.recordedAt,actor:saved.providerRejectionEvidence.actor},message:'Provider evidence is recorded. Ordinary cancellation recovery will check this same operation; service and health have not been changed.'};
}
