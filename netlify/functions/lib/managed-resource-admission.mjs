// Creation exposure for managed first-number, initial A2P brand and campaign only.
// Configured USD upper bounds are operator assumptions, not measured provider rates.
// Lifetime reservations are never refunded; this is not a complete account bill.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { configurationRevision, isSupportedSelfServiceClient } from './setup.mjs';
import { workspaceTenant } from './workspace-identity.mjs';
import { buildMessagingProgram } from './messaging-program.mjs';

const STORE='managed_resource_admission', KEY='twilio_v1', MAX_RESOURCES=500;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v,max=1e12)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const keys=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...names].sort().join(',');
const counters=['numbers','brands','campaigns','setupCents','monthlyCents'];
const limits=v=>keys(v,counters)&&['numbers','brands','campaigns'].every(k=>integer(v[k],MAX_RESOURCES))&&integer(v.setupCents)&&integer(v.monthlyCents);
const zero=()=>Object.fromEntries(counters.map(k=>[k,0]));
const add=(a,b)=>Object.fromEntries(counters.map(k=>[k,a[k]+b[k]]));
const within=(a,b)=>counters.every(k=>a[k]<=b[k]);
const kindStore=kind=>kind==='number'?'phone_activation_intents':'messaging_activation';
const validId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,39}\/[a-f0-9]{64}$/.test(id);
const lease=claim=>/^[a-f0-9]{32}$/.test(claim?.token||'')&&Number.isFinite(Date.parse(claim.until))&&Date.parse(claim.until)>Date.now();
export const managedResourceAccountHash=()=>hash(process.env.TWILIO_ACCOUNT_SID||'');
export class ManagedResourceAdmissionError extends Error {
  constructor(code,message='Your request is saved. The platform must approve the resource allowance before a number or paid registration can be created.') { super(message);this.code=code; }
}
export function managedResourceAdmissionPolicy() {
  try {
    const p=JSON.parse(process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON||'null');
    if(!keys(p,['version','expiresAt','mode','providerAccountHash','currency','rateBasis','rateSource','bounds','accountLimits','tenantLimits','tenants'])||!['cohort','self_service'].includes(p.mode)||p.currency!=='USD'||p.rateBasis!=='configured_upper_bound'||!/^[a-z0-9_-]{1,80}$/.test(p.version||'')||process.env.MANAGED_RESOURCE_ADMISSION_APPROVED_VERSION!==p.version||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.now()||!/^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||'')||p.providerAccountHash!==managedResourceAccountHash()||!keys(p.bounds,['numberSetupCents','numberMonthlyCents','brandSetupCents','campaignSetupCents','campaignMonthlyCents'])||Object.values(p.bounds).some(v=>!integer(v,1e7))||!limits(p.accountLimits)||!limits(p.tenantLimits)||!within(p.tenantLimits,p.accountLimits)||[['numbers',['numberMonthlyCents']],['brands',['brandSetupCents']],['campaigns',['campaignSetupCents','campaignMonthlyCents']]].some(([kind,names])=>p.accountLimits[kind]>0&&names.some(k=>p.bounds[k]===0))||!Array.isArray(p.tenants)||(p.mode==='cohort'?!p.tenants.length:p.tenants.length!==0)||p.tenants.length>25||p.tenants.some(t=>!keys(t,['slug','identity'])||!/^[a-z0-9][a-z0-9-]{0,39}$/.test(t.slug||'')||!hex(t.identity))||new Set(p.tenants.map(t=>t.identity)).size!==p.tenants.length)return null;
    const source=new URL(p.rateSource);if(source.protocol!=='https:'||source.username||source.password||source.hash)return null;
    return {...p,digest:hash(p)};
  } catch { return null; }
}
const fail=code=>{throw new ManagedResourceAdmissionError(code,{
  resource_owner_cost_approval_required:'Your request is saved. The platform must provide an updated quote for your review before these resource costs can be approved.',
  resource_price_above_bound:'Your request is saved. Current number pricing exceeds the platform allowance; the platform must review pricing before setup can continue.',
  resource_intent_changed:'Your resource records are retained. The platform must review changed request details before new resource work can continue.',
  resource_tenant_unapproved:'Your request is saved. The platform must review this workspace and its current owner authority before resource setup can continue.'
}[code]);};
function currentPolicy(p) { if(!p)fail('resource_policy_unavailable');if(managedResourceAdmissionPolicy()?.digest!==p.digest)fail('resource_policy_changed'); }
function cost(p,kind,offer,quotedMonthlyCents) {
  const b=p.bounds,amount=zero();amount[{number:'numbers',brand:'brands',campaign:'campaigns'}[kind]]=1;
  if(offer?.currency!=='USD'||!Number.isFinite(Date.parse(offer.expiresAt))||Date.parse(offer.expiresAt)<=Date.now())fail('resource_offer_changed');
  if(kind==='number') {
    if(!integer(offer.oneTimeCents)||!integer(offer.monthlyCents)||!integer(offer.maxAcquisitionCents)||b.numberSetupCents>offer.oneTimeCents||b.numberMonthlyCents>offer.monthlyCents||b.numberMonthlyCents>offer.maxAcquisitionCents)fail('resource_owner_cost_approval_required');
    if(!integer(quotedMonthlyCents)||quotedMonthlyCents>b.numberMonthlyCents)fail('resource_price_above_bound');
    amount.setupCents=b.numberSetupCents;amount.monthlyCents=b.numberMonthlyCents;
  } else {
    if(!integer(offer.brandRegistrationCents)||!integer(offer.campaignRegistrationCents)||!integer(offer.campaignMonthlyCents)||(kind==='brand'?b.brandSetupCents>offer.brandRegistrationCents:b.campaignSetupCents>offer.campaignRegistrationCents||b.campaignMonthlyCents>offer.campaignMonthlyCents))fail('resource_owner_cost_approval_required');
    amount.setupCents=kind==='brand'?b.brandSetupCents:b.campaignSetupCents;amount.monthlyCents=kind==='campaign'?b.campaignMonthlyCents:0;
  }
  return amount;
}
async function parentAuthority(row,kind,p) {
  if(kind!=='number') {
    if(!validId(row?.number?.intentId)||!row.number.intentId.startsWith(row.slug+'/'))return false;
    const parent=await strictRead('phone_activation_intents',row.number.intentId);
    return !!parent&&parent.tenantIdentity===row.tenantIdentity&&parent.resourceAccountHash===p.providerAccountHash&&parent.state==='number_acquired'&&!parent.cancelRequestedAt&&!parent.releasedAt&&parent.resource?.id===row.number.sid&&parent.resource?.number===row.number.number;
  }
  if(!row?.serviceOnboarding)return true;
  const ref=row.serviceOnboarding;
  if(!validId(ref.id)||!ref.id.startsWith(row.slug+'/')||!Number.isSafeInteger(ref.generation)||ref.generation<1||ref.admissionSequence!==null&&!Number.isSafeInteger(ref.admissionSequence))return false;
  const [parent,queue]=await Promise.all([strictRead('service_onboarding_intents',ref.id),strictRead('service_onboarding_queue','active_v1')]);
  const retained=ref.admissionSequence===null?parent?.version===1:ref.admissionSequence>0&&Number.isSafeInteger(parent?.admissionSequence)&&parent.admissionSequence>=ref.admissionSequence;
  return !!parent&&retained&&parent.tenantIdentity===row.tenantIdentity&&parent.generation===ref.generation&&parent.inputRevision===row.inputRevision&&parent.offer?.number?.digest===row.offerDigest&&parent.authority?.actor?.email===row.authority?.actor?.email&&!!parent.steps?.number?.startedAt&&!parent.cancelRequestedAt&&!queue?.intents?.[ref.id]?.cancelRequestedAt&&hash(parent.providerBinding?.accountSid||'')===p.providerAccountHash;
}
async function authority(input,p) {
  currentPolicy(p);
  if(!['number','brand','campaign'].includes(input?.kind)||!validId(input.operationId))fail('resource_intent_changed');
  const context=await strictRead(kindStore(input.kind),input.operationId);
  if(!context||!await parentAuthority(context,input.kind,p))fail('resource_parent_unavailable');
  const [row,brake]=await Promise.all([strictRead(kindStore(input.kind),input.operationId),strictRead('health','brake')]);
  if(hash({number:row?.number,serviceOnboarding:row?.serviceOnboarding})!==hash({number:context.number,serviceOnboarding:context.serviceOnboarding}))fail('resource_parent_unavailable');
  if(!row||row.id!==input.operationId||!input.operationId.startsWith(row.slug+'/')||!hex(row.tenantIdentity)||!hex(row.correlationId)||row.correlationId!==input.correlationId||row.offerDigest!==hash(JSON.stringify(input.offer))||row.offerDigest!==hash(JSON.stringify(row.offer))||!Number.isFinite(Date.parse(row.authority?.acceptedAt))||row.cancelRequestedAt||!lease(row.claim)||row.claim.token!==input.claimToken||row.resourceAccountHash&&row.resourceAccountHash!==p.providerAccountHash||brake?.on===true)fail('resource_intent_changed');
  if(input.kind==='number') {
    if(row.state!=='running'||!Number.isFinite(Date.parse(row.purchaseStartedAt))||row.resource||row.authority?.costsAccepted!==true||row.authority?.authorityAccepted!==true||!keys(input.payload,['path','fields'])||input.payload.path!=='IncomingPhoneNumbers.json'||!keys(input.payload.fields,['PhoneNumber','FriendlyName'])||!/^\+1\d{10}$/.test(input.payload.fields.PhoneNumber||'')||input.payload.fields.FriendlyName!=='mc-phone-'+row.correlationId.slice(0,55))fail('resource_intent_changed');
  } else {
    const refs={profileSid:row.resources?.profile?.sid,trustProductSid:row.resources?.trust_product?.sid,serviceSid:row.resources?.service?.sid,brandSid:row.resources?.brand?.sid,numberSid:row.number?.sid};
    if(row.state!=='preparing'||row.steps?.[input.kind]?.state!=='dispatching'||!Number.isFinite(Date.parse(row.steps[input.kind].startedAt))||row.steps[input.kind].submissionRevision!==row.submissionRevision||!Number.isSafeInteger(row.submissionRevision)||row.submissionRevision<1||row.submissionRevision!==input.submissionRevision||!hex(row.inputHash)||row.inputHash!==input.inputHash||!hex(row.programDigest)||row.programDigest!==input.programDigest||hash(refs)!==hash(input.registrationRefs)||row.authority?.costsAccepted!==true||row.authority?.customerAuthority!==true||row.authority?.legalAccuracy!==true||row.authority?.explicitConsumerConsent!==true||row.authority?.offerDigest!==row.offerDigest||row.authority?.programDigest!==row.programDigest||row.resources?.[input.kind])fail('resource_intent_changed');
  }
  // The client read follows the awaited operation/brake dependencies. Never
  // infer a current customer's authority from a caller-supplied slug or row.
  const c=await strictRead('clients',row.slug),identity=row.tenantIdentity;
  if(!isSupportedSelfServiceClient(c)||!c.ownerKey||!normalizeAccountEmail(c.owner?.email)||workspaceTenant(c)!==identity||!['testing','live'].includes(c.status)||(p.mode==='cohort'&&!p.tenants.some(t=>t.slug===row.slug&&t.identity===identity))||normalizeAccountEmail(input.kind==='number'?row.authority?.actor?.email:row.authority?.actorEmail)!==normalizeAccountEmail(c.owner?.email)||input.kind==='number'&&configurationRevision(c)!==row.inputRevision)fail('resource_tenant_unapproved');
  if(input.kind!=='number'&&buildMessagingProgram(c).digest!==row.programDigest)fail('resource_program_changed');
  // An untouched number's fresh business-rule review retains the same financial
  // intent. Registration input revisions and paid payloads cannot reuse a hold.
  const amount=cost(p,input.kind,row.offer,input.quotedMonthlyCents),intent={operationId:row.id,kind:input.kind,tenant:identity,account:p.providerAccountHash,correlationId:row.correlationId,offerDigest:row.offerDigest,payload:input.payload,...(input.kind==='number'?{}:{inputRevision:row.inputRevision,acceptedAt:row.authority.acceptedAt,inputHash:row.inputHash,programDigest:row.programDigest,submissionRevision:row.submissionRevision,number:row.number,resources:Object.fromEntries(Object.entries(row.resources||{}).map(([k,v])=>[k,v.sid]))})};
  if(!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload))fail('resource_intent_changed');
  currentPolicy(p);return {row,identity:hash(intent),tenant:identity,amount};
}
function ledger(previous,p) {
  if(previous===null)return {version:1,providerAccountHash:p.providerAccountHash,currency:'USD',used:zero(),tenants:{},reservations:{}};
  if(!previous||previous.version!==1||previous.providerAccountHash!==p.providerAccountHash||previous.currency!=='USD'||!limits(previous.used)||!previous.tenants||Array.isArray(previous.tenants)||!previous.reservations||Array.isArray(previous.reservations)||Object.keys(previous.reservations).length>MAX_RESOURCES)fail('resource_ledger_unavailable');
  const used=zero(),tenants={};
  for(const [id,r] of Object.entries(previous.reservations)) {
    if(!hex(id)||!hex(r?.identity)||!hex(r.tenant)||!['number','brand','campaign'].includes(r.kind)||!limits(r.amount)||r.amount[{number:'numbers',brand:'brands',campaign:'campaigns'}[r.kind]]!==1||['numbers','brands','campaigns'].some(k=>k!=={number:'numbers',brand:'brands',campaign:'campaigns'}[r.kind]&&r.amount[k]!==0))fail('resource_ledger_unavailable');
    for(const k of counters)used[k]+=r.amount[k];tenants[r.tenant]=add(tenants[r.tenant]||zero(),r.amount);
  }
  if(hash(used)!==hash(previous.used)||hash(tenants)!==hash(previous.tenants))fail('resource_ledger_unavailable');
  return previous;
}
export async function reserveManagedResource(input) {
  const p=managedResourceAdmissionPolicy(),first=await authority(input,p),id=hash([input.operationId,input.kind]);
  // Bind the operation even if allowance is exhausted. Changing provider accounts
  // cannot move this accepted request, or mistake its recorded resource for absent.
  await atomicUpdate(kindStore(input.kind),input.operationId,old=>{
    if(!old||old.claim?.token!==input.claimToken||old.offerDigest!==first.row.offerDigest||old.correlationId!==first.row.correlationId||old.resourceAccountHash&&old.resourceAccountHash!==p.providerAccountHash)fail('resource_intent_changed');
    return old.resourceAccountHash?{result:true}:{value:{...old,resourceAccountHash:p.providerAccountHash},result:true};
  });
  const reserved=await atomicUpdate(STORE,KEY,async previous=>{
    const current=await authority(input,p),row=ledger(previous,p),old=row.reservations[id];
    if(current.identity!==first.identity||old&&(old.identity!==first.identity||old.tenant!==first.tenant||old.kind!==input.kind))fail('resource_intent_changed');
    const amount=old?Object.fromEntries(counters.map(k=>[k,Math.max(old.amount[k],current.amount[k])])):current.amount,delta=Object.fromEntries(counters.map(k=>[k,amount[k]-(old?.amount[k]||0)])),used=add(row.used,delta),own=add(row.tenants[first.tenant]||zero(),delta);
    if(!within(used,p.accountLimits)||!within(own,p.tenantLimits)||!old&&Object.keys(row.reservations).length>=MAX_RESOURCES)throw new ManagedResourceAdmissionError('resource_allowance_exhausted','Your request is saved. The platform must approve more number or registration capacity before setup can continue.');
    const reservation={kind:input.kind,identity:first.identity,tenant:first.tenant,amount,reservedAt:old?.reservedAt||new Date().toISOString()};
    return {value:{...row,used,tenants:{...row.tenants,[first.tenant]:own},reservations:{...row.reservations,[id]:reservation}},result:reservation};
  });
  const receipt={id,identity:first.identity,providerAccountHash:p.providerAccountHash,policyDigest:p.digest,...reserved};
  await assertManagedResourceReservation(input,receipt);return receipt;
}
export async function assertManagedResourceReservation(input,receipt) {
  const p=managedResourceAdmissionPolicy(),current=await authority(input,p);
  if(receipt?.policyDigest!==p.digest)fail('resource_policy_changed');
  if(!receipt||receipt.id!==hash([input.operationId,input.kind])||receipt.identity!==current.identity||receipt.providerAccountHash!==p.providerAccountHash)fail('resource_reservation_changed');
  const row=ledger(await strictRead(STORE,KEY),p),saved=row.reservations[receipt.id];
  if(!saved||saved.identity!==current.identity||saved.tenant!==current.tenant||!within(current.amount,saved.amount)||!within(row.used,p.accountLimits)||!within(row.tenants[current.tenant],p.tenantLimits))fail('resource_reservation_changed');
  if((await authority(input,p)).identity!==current.identity)fail('resource_intent_changed');return true;
}
// Called synchronously in the HTTP function after all awaited authority checks.
export function assertManagedResourceDispatchPolicy(receipt) {
  const p=managedResourceAdmissionPolicy();if(!p||p.digest!==receipt?.policyDigest||p.providerAccountHash!==receipt.providerAccountHash)fail('resource_policy_changed');
}
// Recorded work is independent of creation-policy expiry/capacity. Account fencing
// still applies to reconciliation and cleanup; a different account's404 is unsafe.
export async function managedResourceAccountBinding(kind,operationId) {
  if(!operationId)return null;
  if(!validId(operationId))throw new Error('Invalid managed resource operation');
  const row=await strictRead(kindStore(kind),operationId);if(!row)throw new Error('Managed resource operation unavailable');
  const binding=row.resourceAccountHash;
  if(!hex(binding))throw new Error('The original managed resource provider account must be verified before maintenance');
  if(binding&&binding!==managedResourceAccountHash()||Object.values(row.resources||{}).some(r=>r.accountSid&&hash(r.accountSid)!==managedResourceAccountHash()))throw new Error('Managed resource belongs to another provider account');
  return binding;
}
