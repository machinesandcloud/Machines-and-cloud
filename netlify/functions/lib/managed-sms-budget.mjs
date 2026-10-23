// Managed REST outbox/probe exposure only, not the complete Twilio account bill.
// Limits are cumulative for this path under a provider account,
// not a billing plan or a live provider price. Only an explicit approved policy
// supplies rates; editing its version never replenishes spent reservations.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead } from './accounts.mjs';
import { workspaceTenant, supportedWorkspace } from './workspace-identity.mjs';

const STORE='managed_sms_budgets', MAX_MESSAGES=1000;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v,max=1e12)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const keys=(v,names)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.sort().join(',');
const limits=v=>keys(v,['messages','segments','costMicros'])&&integer(v.messages,MAX_MESSAGES)&&integer(v.segments,32000)&&integer(v.costMicros);
const zero=()=>({messages:0,segments:0,costMicros:0});
const add=(a,b)=>Object.fromEntries(Object.keys(zero()).map(k=>[k,a[k]+b[k]]));
const within=(a,b)=>Object.keys(zero()).every(k=>a[k]<=b[k]);
export class ManagedSMSBudgetError extends Error {
  constructor(code,message='Texting is waiting for an approved platform sending allowance. Your message remains saved.') { super(message);this.code=code; }
}
export const managedSMSBudgetKey=()=>`twilio:${hash(process.env.TWILIO_ACCOUNT_SID||'')}`;
export function managedSMSBudgetPolicy() {
  try {
    const p=JSON.parse(process.env.MANAGED_SMS_BUDGET_POLICY_JSON||'null');
    if(!keys(p,['version','expiresAt','mode','providerAccountHash','currency','rateBasis','rateSource','rates','accountLimits','tenantLimits','tenants'])||!['cohort','self_service'].includes(p.mode)||p.currency!=='USD'||p.rateBasis!=='all_in_upper_bound'||!/^[a-z0-9_-]{1,80}$/.test(p.version||'')||process.env.MANAGED_SMS_BUDGET_APPROVED_VERSION!==p.version||!Number.isFinite(Date.parse(p.expiresAt))||Date.parse(p.expiresAt)<=Date.now()||!/^AC[a-f0-9]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||'')||p.providerAccountHash!==hash(process.env.TWILIO_ACCOUNT_SID)||!limits(p.accountLimits)||!limits(p.tenantLimits)||!within(p.tenantLimits,p.accountLimits)||!keys(p.rates,['perMessageMicros','perSegmentMicros'])||!integer(p.rates.perMessageMicros,1e8)||!integer(p.rates.perSegmentMicros,1e8)||p.rates.perSegmentMicros===0||!Array.isArray(p.tenants)||(p.mode==='cohort'?!p.tenants.length:p.tenants.length!==0)||p.tenants.length>25||p.tenants.some(t=>!keys(t,['slug','identity'])||!/^[a-z0-9][a-z0-9-]{0,39}$/.test(t.slug||'')||!hex(t.identity))||new Set(p.tenants.map(t=>t.identity)).size!==p.tenants.length)return null;
    const source=new URL(p.rateSource);if(source.protocol!=='https:'||source.username||source.password||source.hash)return null;
    return {...p,digest:hash(p)};
  } catch { return null; }
}

// Twilio documents160/70 single-part and153/67 multipart units;152/66
// also covers the smaller US/Canada toll-free multipart allowance. Extension
// characters and surrogate pairs stay together when conservatively packing.
// https://www.twilio.com/docs/glossary/what-sms-character-limit
const GSM=new Set('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà');
const EXT=new Set('\f^{}\\[~]|€');
export function managedSMSSegments(body) {
  if(typeof body!=='string'||!body.trim()||body.length>1600)throw new ManagedSMSBudgetError('sms_budget_payload_unsupported','This text needs a supported message length before it can be sent. Your message remains saved.');
  const chars=[...body],gsm=chars.every(ch=>GSM.has(ch)||EXT.has(ch));
  const widths=chars.map(ch=>gsm?(EXT.has(ch)?2:1):ch.length),units=widths.reduce((a,b)=>a+b,0),single=gsm?160:70,multi=gsm?152:66;
  if(units<=single)return {encoding:gsm?'GSM7':'UCS2',units,segments:1};
  let segments=1,used=0;for(const width of widths){if(used+width>multi){segments++;used=0;}used+=width;}
  return {encoding:gsm?'GSM7':'UCS2',units,segments};
}
function payload(c,job) {
  if(!job||job.channel!=='sms'||job.tenant!==workspaceTenant(c)||typeof job.id!=='string'||!job.id.startsWith(c.slug+'/')||!/^\+1[2-9]\d{9}$/.test(job.to||'')||!/^\+1[2-9]\d{9}$/.test(job.from||'')||!/^MG[a-f0-9]{32}$/i.test(job.serviceSid||''))throw new ManagedSMSBudgetError('sms_budget_message_changed');
  const size=managedSMSSegments(job.body);
  return {id:hash(job.id),identity:hash({id:job.id,tenant:job.tenant,to:job.to,from:job.from,serviceSid:job.serviceSid,body:job.body,purpose:job.purpose}),tenant:workspaceTenant(c),...size};
}
async function authority(c,p) {
  if(!p||managedSMSBudgetPolicy()?.digest!==p.digest)throw new ManagedSMSBudgetError('sms_budget_policy_unavailable');
  const current=await strictRead('clients',c.slug),identity=workspaceTenant(c);
  if(!supportedWorkspace(current)||workspaceTenant(current)!==identity||!['testing','live'].includes(current.status)||(p.mode==='cohort'&&!p.tenants.some(t=>t.slug===c.slug&&t.identity===identity))||(await strictRead('health','brake'))?.on===true)throw new ManagedSMSBudgetError('sms_budget_tenant_unapproved');
  if(managedSMSBudgetPolicy()?.digest!==p.digest)throw new ManagedSMSBudgetError('sms_budget_policy_changed');
}
function ledger(row,p) {
  if(row===null)return {version:1,providerAccountHash:p.providerAccountHash,currency:'USD',used:zero(),tenants:{},reservations:{}};
  if(!row||row.version!==1||row.providerAccountHash!==p.providerAccountHash||row.currency!=='USD'||!limits(row.used)||!row.tenants||!row.reservations||Object.keys(row.reservations).length>MAX_MESSAGES)throw new ManagedSMSBudgetError('sms_budget_storage_unavailable');
  const totals=zero(),tenants={};
  for(const [id,r] of Object.entries(row.reservations)){
    if(!hex(id)||!hex(r.identity)||!hex(r.tenant)||!integer(r.segments,32)||r.segments<1||!integer(r.costMicros))throw new ManagedSMSBudgetError('sms_budget_storage_unavailable');
    const cost={messages:1,segments:r.segments,costMicros:r.costMicros};for(const k of Object.keys(totals))totals[k]+=cost[k];tenants[r.tenant]=add(tenants[r.tenant]||zero(),cost);
  }
  if(JSON.stringify(canonical(totals))!==JSON.stringify(canonical(row.used))||JSON.stringify(canonical(tenants))!==JSON.stringify(canonical(row.tenants)))throw new ManagedSMSBudgetError('sms_budget_storage_unavailable');
  return row;
}
export async function reserveManagedSMS(c,job) {
  const p=managedSMSBudgetPolicy();await authority(c,p);const input=payload(c,job),key=managedSMSBudgetKey();
  const reserved=await atomicUpdate(STORE,key,async previous=>{
    await authority(c,p);const row=ledger(previous,p),old=row.reservations[input.id];
    if(old&&(old.identity!==input.identity||old.tenant!==input.tenant||old.segments!==input.segments))throw new ManagedSMSBudgetError('sms_budget_message_changed');
    const costMicros=Math.max(old?.costMicros||0,p.rates.perMessageMicros+input.segments*p.rates.perSegmentMicros);
    const delta={messages:old?0:1,segments:old?0:input.segments,costMicros:costMicros-(old?.costMicros||0)},used=add(row.used,delta),own=add(row.tenants[input.tenant]||zero(),delta);
    if(!within(used,p.accountLimits)||!within(own,p.tenantLimits))throw new ManagedSMSBudgetError('sms_budget_exhausted','Texting has reached its approved platform sending allowance. The platform must approve further capacity; your message remains saved.');
    const reservation={identity:input.identity,tenant:input.tenant,segments:input.segments,costMicros,encoding:input.encoding,reservedAt:old?.reservedAt||new Date().toISOString()};
    return {value:{...row,used,tenants:{...row.tenants,[input.tenant]:own},reservations:{...row.reservations,[input.id]:reservation}},result:reservation};
  });
  const receipt={key,id:input.id,identity:input.identity,policyDigest:p.digest,...reserved};
  await assertManagedSMSReservation(c,job,receipt);return receipt;
}
export async function assertManagedSMSReservation(c,job,receipt) {
  const p=managedSMSBudgetPolicy();await authority(c,p);const input=payload(c,job);
  if(!receipt||receipt.key!==managedSMSBudgetKey()||receipt.id!==input.id||receipt.identity!==input.identity||receipt.policyDigest!==p.digest)throw new ManagedSMSBudgetError('sms_budget_reservation_changed');
  const row=ledger(await strictRead(STORE,receipt.key),p),saved=row.reservations[input.id],required=p.rates.perMessageMicros+input.segments*p.rates.perSegmentMicros;
  if(!saved||saved.identity!==input.identity||saved.tenant!==input.tenant||saved.segments!==input.segments||saved.costMicros<required||!within(row.used,p.accountLimits)||!within(row.tenants[input.tenant],p.tenantLimits))throw new ManagedSMSBudgetError('sms_budget_reservation_changed');
  await authority(c,p);return true;
}
