// Legacy informational Houston-month usage remains compatible. Opt-in accepted
// offers use the invoice-period reservation functions below; no prices, units
// or paid rights are inferred from these legacy plan counters.
import { get, put, logEvent, atomicUpdate, assertCurrentWorkspace } from "./store.mjs";
import { createHash } from 'node:crypto';
import { strictRead } from './accounts.mjs';
import { paidCapacityContext, PAID_CAPACITY_UNITS, validPaidCapacity } from './paid-service-authority.mjs';
import { PLANS } from "./config.mjs";
import { workspaceTenant, supportedWorkspace, belongsToWorkspace, WorkspaceIdentityError } from "./workspace-identity.mjs";

// Texts that count: the ones customers receive. Owner alerts, escalations, and digests do not.
export const CUSTOMER_TEXT_TYPES = ["reply", "confirmation", "reminder_24h", "reminder_1h", "on_my_way", "text_back", "lead_chase", "review_request", "review_nudge", "quote_check", "payment_reminder", "referral_ask", "fallback_window", "cancelled"];
export const THRESHOLDS = [80, 100];

export const usageMonth = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
export const usageKey = (target, month = usageMonth()) => {
  if(typeof target==='string')return `${target}/${month}`;
  if(Object.hasOwn(target||{},'onboarding')&&!supportedWorkspace(target))throw new WorkspaceIdentityError();
  return supportedWorkspace(target)?`${target.slug}/${workspaceTenant(target)}/${month}`:`${target.slug}/${month}`;
};
const blankUsage=(target,month)=>({slug:typeof target==='string'?target:target.slug,month,minutes:0,texts:0,calls:0,alerted:{},...(supportedWorkspace(target)?{tenantIdentity:workspaceTenant(target)}:{})});

export async function getUsage(target, month = usageMonth()) {
  const key=usageKey(target,month),scoped=supportedWorkspace(target);
  const row=scoped?await atomicUpdate('usage',key,current=>({result:current})):await get('usage',key);
  if(row&&scoped&&!belongsToWorkspace(target,row))throw new WorkspaceIdentityError();
  return row||blankUsage(target,month);
}

export function usageView(c, u) {
  if(Object.hasOwn(c||{},'onboarding')&&!belongsToWorkspace(c,u))u=blankUsage(c,typeof u?.month==='string'?u.month:usageMonth());
  const plan = PLANS[c.plan] || PLANS.growth;
  return { month: u.month, minutes: u.minutes || 0, texts: u.texts || 0, calls: u.calls || 0, included: { minutes: plan.minutes, texts: plan.texts }, overage: { minute: 0.35, text: 0.03 } };
}

/**
 * addUsage(c, { minutes, texts, calls }) -> the month record. Sends the owner one text and one email
 * per threshold per month when minutes or texts cross 80 or 100 percent of the plan.
 */
export async function addUsage(c, { minutes = 0, texts = 0, calls = 0 } = {}) {
  const u = await getUsage(c);
  u.minutes = (u.minutes || 0) + minutes; u.texts = (u.texts || 0) + texts; u.calls = (u.calls || 0) + calls;
  u.alerted = u.alerted || {}; u.updatedAt = new Date().toISOString();
  const plan = PLANS[c.plan] || PLANS.growth;
  const crossed = [];
  for (const kind of ["minutes", "texts"]) {
    const included = plan[kind]; if (!included) continue;
    for (const t of THRESHOLDS) {
      const k = `${kind}${t}`;
      if (!u.alerted[k] && u[kind] >= included * t / 100) { u.alerted[k] = new Date().toISOString(); crossed.push({ kind, threshold: t, used: u[kind], included }); }
    }
  }
  await put("usage", usageKey(c, u.month), u);
  for (const x of crossed) {
    const { notifyOwner } = await import("./send.mjs");
    const what = x.kind === "minutes" ? "call minutes" : "texts";
    const rate = x.kind === "minutes" ? "$0.35 a minute" : "$0.03 a text";
    const body = x.threshold >= 100
      ? `${c.business?.name}: you've used all of this month's ${what} (${x.used} of ${x.included}). Past the plan it is ${rate}; nothing changes on the line.`
      : `${c.business?.name}: you've used ${x.threshold} percent of this month's ${what} (${x.used} of ${x.included}). Past the plan it is ${rate}; nothing changes on the line.`;
    try { await assertCurrentWorkspace(c);await notifyOwner(c, body, { type: "usage" }); } catch (e) { console.error("usage alert", e); }
    await logEvent(c, "usage_alert", { threshold: x.threshold, kind: x.kind, used: x.used, included: x.included, month: u.month });
  }
  return u;
}

// Funded-period customer units share the existing usage store. One tenant CAS
// document keeps both period totals and stable operation identities, so an
// invoice correction, new policy or renewal cannot allocate the same work twice.
const CAPACITY_MAX_OPERATIONS = 10000, CAPACITY_MAX_PERIODS = 120, CAPACITY_HOT_OPERATIONS = 128, CAPACITY_ARCHIVE_BATCH = 8, CAPACITY_HOT_PERIODS = 12;
const capacityPlain = x => x && typeof x === 'object' && !Array.isArray(x);
const capacityExact = (x, fields) => capacityPlain(x) && Object.keys(x).sort().join(',') === [...fields].sort().join(',');
const capacityCanonical = x => Array.isArray(x) ? x.map(capacityCanonical) : capacityPlain(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, capacityCanonical(x[k])])) : x;
const capacityHash = x => createHash('sha256').update(JSON.stringify(capacityCanonical(x))).digest('hex');
const capacityHex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const capacityId = x => typeof x === 'string' && !['__proto__','constructor','prototype'].includes(x) && /^[a-zA-Z0-9_.:/-]{1,240}$/.test(x);
const capacityNumber = x => Number.isSafeInteger(x) && x >= 0 && x <= 1e12;
const capacityZero = () => Object.fromEntries(PAID_CAPACITY_UNITS.map(k => [k, 0]));
const capacityServices = { voiceMinutes: 'voice', smsSegments: 'sms', aiAnswers: 'sms' };
export class PaidUsageError extends Error {
  constructor(code = 'paid_capacity_unavailable') {
    super(code === 'paid_capacity_exhausted' ? 'This service has reached its included usage for this paid period. Your saved work and account are kept.' : 'We could not confirm this service’s saved usage. Your saved work and account are kept.');
    this.code = code; this.status = code === 'paid_capacity_exhausted' ? 409 : 503;
  }
}
const capacityFail = code => { throw new PaidUsageError(code); };
export const paidUsageKey = c => `paid-capacity/${c.slug}/${workspaceTenant(c)}`;
const capacityArchiveKey = (c,id) => `paid-capacity-intent/${c.slug}/${workspaceTenant(c)}/${id}`;
const capacityPeriodKey = (c,id) => `paid-capacity-period/${c.slug}/${workspaceTenant(c)}/${id}`;
const capacityProviderKey = (c,unit,providerId) => `paid-capacity-provider/${c.slug}/${workspaceTenant(c)}/${capacityHash([unit,providerId])}`;
async function capacityImmutable(key, value, conflictCode = 'paid_capacity_archive_conflict') {
  const fingerprint = capacityHash(value);
  await atomicUpdate('usage',key,current => {
    if (current !== null && capacityHash(current) !== fingerprint) capacityFail(conflictCode);
    return current === null ? { value, result:value } : { result:current };
  });
  if (capacityHash(await strictRead('usage',key)) !== fingerprint) capacityFail('paid_capacity_storage_unavailable');
  return value;
}
async function capacityProviderAnchor(c,row,id,entry,g,providerId) {
  if (!providerId) return;
  capacityProviderIdentity(row,entry.unit,g,providerId);
  await capacityImmutable(capacityProviderKey(c,entry.unit,providerId),{
    version:1,kind:'paid_capacity_provider',slug:c.slug,tenantIdentity:workspaceTenant(c),stripeAccountId:row.stripeAccountId,
    unit:entry.unit,providerId,id,generation:g.generation,payloadDigest:entry.payloadDigest,
  },'paid_capacity_provider_changed');
}

function capacityInput(input) {
  if (!capacityPlain(input) || !PAID_CAPACITY_UNITS.includes(input.unit) || !['voice','sms'].includes(input.service) || capacityServices[input.unit] !== input.service || !capacityId(input.operationId) || !capacityHex(input.payloadDigest)) capacityFail('paid_capacity_intent_invalid');
}
function capacityAmount(unit, quantity, positive = false) {
  if (!capacityNumber(quantity) || quantity > 1e9 || positive && quantity < 1 || unit === 'aiAnswers' && quantity > 1) capacityFail('paid_capacity_quantity_invalid');
}
async function capacityCurrent(c) {
  const current = await strictRead('clients', c.slug);
  if (!supportedWorkspace(current) || workspaceTenant(current) !== workspaceTenant(c)) capacityFail('paid_capacity_workspace_changed');
  return current;
}
const capacityPeriodId = p => capacityHash([p.start, p.end]);
function capacityEnvelope(context) {
  return { start: context.period.start, end: context.period.end, subscriptionId: context.subscriptionId,
    checkoutId: context.checkoutId, priceId: context.priceId, offerDigest: context.offerDigest,
    services: [...context.services], limits: { ...context.capacity.limits } };
}
function capacityGenerations(entry) { return [...(entry.prior || []), entry.current]; }
function capacityProviderIdentity(row, unit, generation, providerId) {
  if (providerId && Object.values(row.operations).some(entry => entry.unit === unit && capacityGenerations(entry).some(g => g !== generation && g.providerId === providerId))) capacityFail('paid_capacity_provider_changed');
}
function capacityTotals(row) {
  const totals = Object.fromEntries(Object.entries(row.periods).map(([id,p]) => [id, { used: { ...(p.archivedUsed || capacityZero()) }, held: capacityZero() }]));
  for (const entry of Object.values(row.operations)) for (const g of capacityGenerations(entry)) {
    if (!totals[g.periodId]) capacityFail('paid_capacity_storage_unavailable');
    const target = g.state === 'settled' ? 'used' : ['reserved', 'attempted'].includes(g.state) ? 'held' : null;
    if (target) {
      const n = target === 'used' ? g.actualQuantity : entry.quantity;
      totals[g.periodId][target][entry.unit] += n;
      if (!Number.isSafeInteger(totals[g.periodId][target][entry.unit])) capacityFail('paid_capacity_storage_unavailable');
    }
  }
  return totals;
}
function capacityRecount(row) {
  const totals = capacityTotals(row);
  for (const [id, t] of Object.entries(totals)) Object.assign(row.periods[id], t);
  return row;
}
function capacityLedger(raw, c, account = null) {
  if (raw === null) {
    if (!account) return null;
    return { version: 1, slug: c.slug, tenantIdentity: workspaceTenant(c), stripeAccountId: account, closedThrough:0, archivedPeriodCount:0, periods: {}, operations: {} };
  }
  if (!capacityPlain(raw) || raw.version !== 1 || raw.slug !== c.slug || raw.tenantIdentity !== workspaceTenant(c) || !/^acct_[a-zA-Z0-9_]{3,160}$/.test(raw.stripeAccountId || '') || account && raw.stripeAccountId !== account || !capacityPlain(raw.periods) || !capacityPlain(raw.operations) || Object.keys(raw.periods).length > CAPACITY_MAX_PERIODS || Object.keys(raw.operations).length > CAPACITY_MAX_OPERATIONS) capacityFail('paid_capacity_storage_unavailable');
  const row = structuredClone(raw);
  row.closedThrough ??= 0; row.archivedPeriodCount ??= 0;
  if (!Number.isSafeInteger(row.closedThrough) || row.closedThrough < 0 || row.closedThrough > Math.floor(Date.now()/1000) || !Number.isSafeInteger(row.archivedPeriodCount) || row.archivedPeriodCount < 0) capacityFail('paid_capacity_storage_unavailable');
  for (const [id, p] of Object.entries(row.periods)) {
    if (capacityPlain(p)) p.archivedUsed ??= capacityZero();
    if (!capacityPlain(p) || !capacityExact(p.archivedUsed,PAID_CAPACITY_UNITS) || Object.values(p.archivedUsed).some(n=>!Number.isSafeInteger(n)||n<0) || !capacityHex(id) || id !== capacityPeriodId(p) || !Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end) || p.start <= 0 || p.end <= p.start || !capacityHex(p.offerDigest) || !/^[a-f0-9]{32}$/.test(p.checkoutId||'') || !/^sub_[a-zA-Z0-9_]{3,160}$/.test(p.subscriptionId||'') || !/^price_[a-zA-Z0-9_]{3,160}$/.test(p.priceId||'') || !Array.isArray(p.services) || !p.services.length || new Set(p.services).size !== p.services.length || p.services.some(s => !['web','voice','sms','calendar'].includes(s)) || !validPaidCapacity({version:1,period:'paid_invoice',limits:p.limits}) || !capacityExact(p.used, PAID_CAPACITY_UNITS) || !capacityExact(p.held, PAID_CAPACITY_UNITS) || ![...Object.values(p.used), ...Object.values(p.held)].every(n=>Number.isSafeInteger(n)&&n>=0) || !Array.isArray(p.invoiceIds) || !p.invoiceIds.length || p.invoiceIds.length > 20 || new Set(p.invoiceIds).size !== p.invoiceIds.length || p.invoiceIds.some(v => !/^in_[a-zA-Z0-9_]{3,160}$/.test(v))) capacityFail('paid_capacity_storage_unavailable');
  }
  for (const [id,p] of Object.entries(row.periods)) for (const [otherId,other] of Object.entries(row.periods)) if(id!==otherId&&p.start<other.end&&other.start<p.end)capacityFail('paid_capacity_period_overlap');
  for (const [id, entry] of Object.entries(row.operations)) {
    capacityInput(entry); capacityAmount(entry.unit, entry.quantity, true);
    if (id !== capacityHash([entry.service, entry.unit, entry.operationId]) || !Array.isArray(entry.prior) || entry.prior.length > 10) capacityFail('paid_capacity_storage_unavailable');
    const generations = capacityGenerations(entry);
    for (let index = 0; index < generations.length; index++) {
      const g = generations[index];
      if (!capacityPlain(g) || !Number.isFinite(Date.parse(g.reservedAt)) || Object.hasOwn(entry,'archiveSource')&&!capacityHex(entry.archiveSource) || ['settled','released'].includes(g.state)&&!Number.isFinite(Date.parse(g.confirmedAt)) || g.generation !== index + 1 || !row.periods[g.periodId] || !['reserved','attempted','settled','released'].includes(g.state) || !capacityPlain(g.attempts) || Object.keys(g.attempts).length > 32 || !capacityPlain(g.proofs) || Object.keys(g.proofs).length > 64 || g.providerId !== null && !capacityId(g.providerId) || Object.keys(g.attempts).some(v => !capacityId(v)) || Object.keys(g.proofs).some(v => !capacityHex(v))) capacityFail('paid_capacity_storage_unavailable');
      for(const [attemptId,a] of Object.entries(g.attempts))if(!capacityPlain(a)||!Number.isFinite(Date.parse(a.at))||Object.hasOwn(a,'notDispatchedProof')&&(!capacityHex(a.notDispatchedProof)||g.proofs[a.notDispatchedProof]?.outcome!=='not_dispatched'||g.proofs[a.notDispatchedProof]?.attemptId!==attemptId))capacityFail('paid_capacity_storage_unavailable');
      for(const proof of Object.values(g.proofs)){
        if(!capacityExact(proof,['outcome','quantity','providerId','attemptId'])||!['confirmed','not_dispatched'].includes(proof.outcome)||proof.providerId!==null&&!capacityId(proof.providerId)||proof.attemptId!==null&&!capacityId(proof.attemptId))capacityFail('paid_capacity_storage_unavailable');
        capacityAmount(entry.unit,proof.quantity);
        if(proof.outcome==='not_dispatched'&&(proof.quantity!==0||!g.attempts[proof.attemptId]))capacityFail('paid_capacity_storage_unavailable');
        if(proof.outcome==='confirmed'&&proof.quantity>0&&!proof.providerId)capacityFail('paid_capacity_storage_unavailable');
      }
      if(Object.hasOwn(g,'providerBoundAt')&&(!g.providerId||!Number.isFinite(Date.parse(g.providerBoundAt))))capacityFail('paid_capacity_storage_unavailable');
      if(g.state==='attempted'&&!Object.keys(g.attempts).length||g.state==='reserved'&&(Object.keys(g.attempts).length||g.providerId))capacityFail('paid_capacity_storage_unavailable');
      if(g.state==='released'&&(!Object.keys(g.attempts).length||g.providerId||!Object.values(g.attempts).every(a=>capacityHex(a.notDispatchedProof))))capacityFail('paid_capacity_storage_unavailable');
      if (g.state === 'settled') {
        capacityAmount(entry.unit, g.actualQuantity);
        if(!Object.values(g.proofs).some(p=>p.outcome==='confirmed'&&p.quantity===g.actualQuantity&&(!p.providerId||p.providerId===g.providerId)))capacityFail('paid_capacity_storage_unavailable');
      }
      if (index < generations.length - 1 && !['released','settled'].includes(g.state)) capacityFail('paid_capacity_storage_unavailable');
    }
  }
  const providerIdentities = new Set();
  for (const entry of Object.values(row.operations)) for (const generation of capacityGenerations(entry)) if (generation.providerId) {
    const identity = entry.unit + ':' + generation.providerId;
    if (providerIdentities.has(identity)) capacityFail('paid_capacity_storage_unavailable');
    providerIdentities.add(identity);
  }
  const totals = capacityTotals(row);
  if (Object.entries(totals).some(([id, t]) => capacityHash(t.used) !== capacityHash(row.periods[id].used) || capacityHash(t.held) !== capacityHash(row.periods[id].held))) capacityFail('paid_capacity_storage_unavailable');
  return row;
}
function capacityPeriod(row, context, create = true) {
  const id = capacityPeriodId(context.period), envelope = capacityEnvelope(context), existing = row.periods[id];
  if (existing) {
    const actual = Object.fromEntries(Object.keys(envelope).map(k => [k, existing[k]]));
    if (capacityHash(actual) !== capacityHash(envelope)) capacityFail('paid_capacity_contract_changed');
    if (create && !existing.invoiceIds.includes(context.invoiceId)) {
      if (existing.invoiceIds.length >= 20) capacityFail('paid_capacity_history_full');
      existing.invoiceIds.push(context.invoiceId);
    }
    return id;
  }
  if (envelope.start < row.closedThrough || Object.values(row.periods).some(p => p.start < envelope.end && envelope.start < p.end)) capacityFail('paid_capacity_period_overlap');
  if (create) {
    if (Object.keys(row.periods).length >= CAPACITY_MAX_PERIODS) capacityFail('paid_capacity_history_full');
    row.periods[id] = { ...envelope, invoiceIds: [context.invoiceId], archivedUsed:capacityZero(), used: capacityZero(), held: capacityZero() };
  }
  return id;
}
async function capacityReadArchive(c,row,id) {
  const archive=await strictRead('usage',capacityArchiveKey(c,id));
  if (archive===null) return null;
  if (!capacityExact(archive,['version','kind','slug','tenantIdentity','stripeAccountId','id','entry','periods']) || archive.version!==1 || archive.kind!=='paid_capacity_terminal' || archive.slug!==c.slug || archive.tenantIdentity!==workspaceTenant(c) || archive.stripeAccountId!==row.stripeAccountId || archive.id!==id || !capacityPlain(archive.periods) || archive.entry?.current?.state!=='settled') capacityFail('paid_capacity_storage_unavailable');
  const proof={version:1,slug:c.slug,tenantIdentity:workspaceTenant(c),stripeAccountId:row.stripeAccountId,periods:structuredClone(archive.periods),operations:{[id]:structuredClone(archive.entry)}};
  for (const p of Object.values(proof.periods)) { p.archivedUsed=capacityZero();p.used=capacityZero();p.held=capacityZero(); }
  capacityLedger(capacityRecount(proof),c,row.stripeAccountId);
  return structuredClone(archive);
}
async function capacityReadPeriod(c,row,id) {
  if (row.periods[id]) return row.periods[id];
  const archive=await strictRead('usage',capacityPeriodKey(c,id));
  if (!capacityExact(archive,['version','kind','slug','tenantIdentity','stripeAccountId','id','period']) || archive.version!==1 || archive.kind!=='paid_capacity_period' || archive.slug!==c.slug || archive.tenantIdentity!==workspaceTenant(c) || archive.stripeAccountId!==row.stripeAccountId || archive.id!==id) capacityFail('paid_capacity_storage_unavailable');
  capacityLedger({version:1,slug:c.slug,tenantIdentity:workspaceTenant(c),stripeAccountId:row.stripeAccountId,periods:{[id]:archive.period},operations:{}},c,row.stripeAccountId);
  return structuredClone(archive.period);
}
async function capacityArchiveHot(c,row) {
  if (Object.keys(row.operations).length >= CAPACITY_HOT_OPERATIONS || Object.keys(row.periods).length >= CAPACITY_HOT_PERIODS) {
    const candidates=Object.entries(row.operations).filter(([,e])=>e.current.state==='settled'&&!e.archiveSource).sort((a,b)=>a[1].current.confirmedAt.localeCompare(b[1].current.confirmedAt)).slice(0,CAPACITY_ARCHIVE_BATCH*2);
    let archived=0;
    for (const [id,entry] of candidates) {
      if(archived>=CAPACITY_ARCHIVE_BATCH)break;
      const periods=Object.fromEntries([...new Set(capacityGenerations(entry).map(g=>g.periodId))].map(periodId=>[periodId,structuredClone(row.periods[periodId])]));
      // The immutable intent carries its own period envelope, not a mutable total.
      for (const p of Object.values(periods)) {p.archivedUsed=capacityZero();p.used=capacityZero();p.held=capacityZero();}
      const value={version:1,kind:'paid_capacity_terminal',slug:c.slug,tenantIdentity:workspaceTenant(c),stripeAccountId:row.stripeAccountId,id,entry:structuredClone(entry),periods};
      const prior=await strictRead('usage',capacityArchiveKey(c,id));
      // A concurrently corrected terminal intent stays live; never replace its
      // earlier immutable snapshot or discard the newer actual quantity.
      if (prior!==null&&capacityHash(prior)!==capacityHash(value)) {
        const original=await capacityReadArchive(c,row,id);
        if(!original||['service','unit','operationId','payloadDigest','quantity'].some(k=>original.entry[k]!==entry[k]))capacityFail('paid_capacity_archive_conflict');
        entry.archiveSource=capacityHash(original);continue;
      }
      for (const g of capacityGenerations(entry)) await capacityProviderAnchor(c,row,id,entry,g,g.providerId);
      await capacityImmutable(capacityArchiveKey(c,id),value);
      for (const g of capacityGenerations(entry)) if(g.state==='settled') row.periods[g.periodId].archivedUsed[entry.unit]+=g.actualQuantity;
      delete row.operations[id];capacityRecount(row);archived++;
    }
  }
  if (Object.keys(row.periods).length >= CAPACITY_HOT_PERIODS) {
    const referenced=new Set(Object.values(row.operations).flatMap(e=>capacityGenerations(e).map(g=>g.periodId)));
    const periods=Object.entries(row.periods).filter(([id,p])=>p.end<=Math.floor(Date.now()/1000)&&!referenced.has(id)&&!Object.values(p.held).some(Boolean)).sort((a,b)=>a[1].end-b[1].end).slice(0,CAPACITY_ARCHIVE_BATCH);
    for (const [id,p] of periods) {
      await capacityImmutable(capacityPeriodKey(c,id),{version:1,kind:'paid_capacity_period',slug:c.slug,tenantIdentity:workspaceTenant(c),stripeAccountId:row.stripeAccountId,id,period:structuredClone(p)});
      row.closedThrough=Math.max(row.closedThrough,p.end);row.archivedPeriodCount++;delete row.periods[id];
    }
  }
}
function capacityReceipt(c, row, id, entry, generation = entry.current) {
  return { version: 1, key: paidUsageKey(c), id, generation: generation.generation, tenantIdentity: row.tenantIdentity,
    service: entry.service, unit: entry.unit, operationId: entry.operationId, payloadDigest: entry.payloadDigest,
    quantity: entry.quantity, periodId: generation.periodId, offerDigest: row.periods[generation.periodId].offerDigest };
}
async function capacityFind(c, row, receipt, expected) {
  if (!capacityExact(receipt, ['version','key','id','generation','tenantIdentity','service','unit','operationId','payloadDigest','quantity','periodId','offerDigest']) || receipt.version !== 1 || receipt.key !== paidUsageKey(c) || receipt.tenantIdentity !== workspaceTenant(c) || !capacityPlain(expected)) capacityFail('paid_capacity_receipt_changed');
  capacityInput(expected);
  if (['service','unit','operationId','payloadDigest'].some(k => expected[k] !== receipt[k]) || Object.hasOwn(expected,'quantity') && expected.quantity !== receipt.quantity) capacityFail('paid_capacity_intent_changed');
  const archive = row && !row.operations[receipt.id] ? await capacityReadArchive(c,row,receipt.id) : null;
  const entry = row?.operations[receipt.id] || archive?.entry, generation = entry && capacityGenerations(entry).find(g => g.generation === receipt.generation);
  const view = archive ? {...row,periods:{...row.periods,...archive.periods}} : row;
  if (!entry || !generation || capacityHash(capacityReceipt(c,view,receipt.id,entry,generation)) !== capacityHash(receipt)) capacityFail('paid_capacity_receipt_changed');
  return { entry, generation, archive };
}
export async function reservePaidUsage(c, input) {
  capacityInput(input); capacityAmount(input.unit, input.quantity, true);
  const initial = await paidCapacityContext(c, input.service); if (!initial) return null;
  const outcome = await atomicUpdate('usage', paidUsageKey(c), async raw => {
    const context = await paidCapacityContext(c, input.service); if (!context) capacityFail('paid_capacity_contract_changed');
    const row = capacityLedger(raw,c,context.stripeAccountId), id = capacityHash([input.service,input.unit,input.operationId]);
    await capacityArchiveHot(c,row);
    // Maintenance is durable even when this admission must still wait; a
    // bounded pass must not restart forever behind corrected old snapshots.
    const refused = code => ({value:row,result:{capacityRefusal:code}});
    let periodId;
    try{periodId=capacityPeriod(row,context);}catch(error){if(error instanceof PaidUsageError&&error.code==='paid_capacity_history_full')return refused(error.code);throw error;}
    const archive = !row.operations[id] ? await capacityReadArchive(c,row,id) : null;
    let entry = row.operations[id] || archive?.entry;
    if (entry && ['service','unit','operationId','payloadDigest','quantity'].some(k => entry[k] !== input[k])) capacityFail('paid_capacity_intent_changed');
    if (entry && entry.current.state !== 'released') return { value: row, result: capacityReceipt(c,archive?{...row,periods:{...row.periods,...archive.periods}}:row,id,entry) };
    if (!entry && Object.keys(row.operations).length >= CAPACITY_MAX_OPERATIONS || entry && entry.prior.length >= 10) return refused('paid_capacity_history_full');
    const p = row.periods[periodId]; if (p.used[input.unit] + p.held[input.unit] + input.quantity > p.limits[input.unit]) return refused('paid_capacity_exhausted');
    const generation = { generation: entry ? entry.current.generation + 1 : 1, periodId, state: 'reserved', providerId: null, attempts: {}, proofs: {}, reservedAt: new Date().toISOString() };
    entry = entry ? { ...entry, prior:[...entry.prior,entry.current],current:generation } : { service:input.service,unit:input.unit,operationId:input.operationId,payloadDigest:input.payloadDigest,quantity:input.quantity,prior:[],current:generation };
    row.operations[id]=entry;capacityRecount(row);return { value:row,result:capacityReceipt(c,row,id,entry) };
  });
  if(outcome?.capacityRefusal)capacityFail(outcome.capacityRefusal);
  return outcome;
}
export async function assertPaidUsage(c, receipt, expected) {
  if (receipt === null) { if (await paidCapacityContext(c)) capacityFail('paid_capacity_receipt_required'); return null; }
  const context = await paidCapacityContext(c, expected?.service); if (!context) capacityFail('paid_capacity_contract_changed');
  const row = capacityLedger(await strictRead('usage',paidUsageKey(c)),c,context.stripeAccountId), selected = await capacityFind(c,row,receipt,expected);
  capacityPeriod(row,context,false);
  if(receipt.periodId!==capacityPeriodId(context.period))capacityFail('paid_capacity_period_changed');
  const period=row.periods[receipt.periodId];
  if (period.offerDigest!==context.offerDigest || !['reserved','attempted'].includes(selected.generation.state)) capacityFail('paid_capacity_intent_finished');
  if (period.used[receipt.unit]+period.held[receipt.unit]>period.limits[receipt.unit]) capacityFail('paid_capacity_exhausted');
  return receipt;
}
// A continuation never admits a new leg or changes a reservation. The caller
// must additionally hold the existing same-parent provider TimeLimit ACK; its
// initial TimeLimit request still uses assertPaidUsage's current-period gate.
export async function assertPaidUsageContinuation(c, receipt, expected, providerId) {
  capacityInput(expected);
  if (expected.service!=='voice' || expected.unit!=='voiceMinutes' || typeof providerId!=='string' || !/^CA[a-f0-9]{32}$/i.test(providerId)) capacityFail('paid_capacity_continuation_unconfirmed');
  if (receipt === null) { await assertPaidUsage(c,null,expected); return null; }
  const context=await paidCapacityContext(c,'voice');if(!context)capacityFail('paid_capacity_contract_changed');
  const row=capacityLedger(await strictRead('usage',paidUsageKey(c)),c,context.stripeAccountId),{generation:g}=await capacityFind(c,row,receipt,expected),period=row?.periods[receipt.periodId];
  if(!period || g.state!=='attempted' || g.providerId!==providerId || !(Date.parse(g.providerBoundAt)>=period.start*1000&&Date.parse(g.providerBoundAt)<period.end*1000) || !Object.values(g.attempts).some(a=>!a.notDispatchedProof&&Date.parse(a.at)>=period.start*1000&&Date.parse(a.at)<period.end*1000))capacityFail('paid_capacity_continuation_unconfirmed');
  if(period.offerDigest!==context.offerDigest || period.subscriptionId!==context.subscriptionId || period.checkoutId!==context.checkoutId || period.priceId!==context.priceId || !context.services.includes('voice'))capacityFail('paid_capacity_contract_changed');
  return receipt;
}
export async function attemptPaidUsage(c, receipt, options, expected) {
  if (receipt === null) return { receipt:null,firstAttempt:false };
  if (!capacityPlain(options) || !capacityId(options.attemptId) || options.providerId !== undefined && !capacityId(options.providerId)) capacityFail('paid_capacity_attempt_invalid');
  return atomicUpdate('usage',paidUsageKey(c),async raw=>{
    await capacityCurrent(c);const row=capacityLedger(raw,c),{entry,generation:g}=await capacityFind(c,row,receipt,expected);
    if (!['reserved','attempted'].includes(g.state)) capacityFail('paid_capacity_intent_finished');
    if (options.providerId && g.providerId && g.providerId!==options.providerId) capacityFail('paid_capacity_provider_changed');
    await capacityProviderAnchor(c,row,receipt.id,entry,g,options.providerId);
    const firstAttempt=Object.keys(g.attempts).length===0;
    if (!g.attempts[options.attemptId]) { if(Object.keys(g.attempts).length>=32)capacityFail('paid_capacity_history_full');g.attempts[options.attemptId]={at:new Date().toISOString()}; }
    if(options.providerId){if(!g.providerId)g.providerBoundAt=new Date().toISOString();g.providerId=options.providerId;}g.state='attempted';return {value:row,result:{receipt,firstAttempt}};
  });
}
export async function settlePaidUsage(c, receipt, fact, expected) {
  if (receipt === null) return null;
  if (!capacityPlain(fact) || !['confirmed','not_dispatched'].includes(fact.outcome) || !capacityHex(fact.proofId) || fact.providerId !== undefined && !capacityId(fact.providerId) || fact.attemptId !== undefined && !capacityId(fact.attemptId)) capacityFail('paid_capacity_proof_invalid');
  capacityAmount(receipt.unit,fact.quantity);
  if(fact.outcome==='not_dispatched'&&(fact.quantity!==0||!fact.attemptId))capacityFail('paid_capacity_proof_invalid');
  if(fact.outcome==='confirmed'&&fact.quantity>0&&!fact.providerId)capacityFail('paid_capacity_proof_invalid');
  return atomicUpdate('usage',paidUsageKey(c),async raw=>{
    await capacityCurrent(c);const row=capacityLedger(raw,c),found=await capacityFind(c,row,receipt,expected);let {entry,generation:g}=found;
    const proof={outcome:fact.outcome,quantity:fact.quantity,providerId:fact.providerId||null,attemptId:fact.attemptId||null};
    if(found.archive){
      if(g.proofs[fact.proofId]){if(capacityHash(g.proofs[fact.proofId])!==capacityHash(proof))capacityFail('paid_capacity_proof_conflict');return {result:{...capacitySummary({...row,periods:{...row.periods,[receipt.periodId]:await capacityReadPeriod(c,row,receipt.periodId)}},receipt.periodId),receiptState:g.state}};}
      if(fact.outcome==='not_dispatched')capacityFail('paid_capacity_proof_conflict');
      if(g.state==='settled'&&fact.quantity===g.actualQuantity&&(!fact.providerId||fact.providerId===g.providerId))return {result:{...capacitySummary({...row,periods:{...row.periods,[receipt.periodId]:await capacityReadPeriod(c,row,receipt.periodId)}},receipt.periodId),receiptState:g.state}};
      if(g.state==='settled'&&fact.quantity<g.actualQuantity)capacityFail('paid_capacity_proof_conflict');
      // New authoritative facts rehydrate this baseline once. Corrected intents
      // stay live rather than rewriting an immutable terminal receipt.
      entry=structuredClone(entry);entry.archiveSource=capacityHash(found.archive);
      for(const old of capacityGenerations(entry)){if(!row.periods[old.periodId])row.periods[old.periodId]=await capacityReadPeriod(c,row,old.periodId);if(old.state==='settled'){if(row.periods[old.periodId].archivedUsed[entry.unit]<old.actualQuantity)capacityFail('paid_capacity_storage_unavailable');row.periods[old.periodId].archivedUsed[entry.unit]-=old.actualQuantity;}}
      row.operations[receipt.id]=entry;g=capacityGenerations(entry).find(v=>v.generation===receipt.generation);capacityRecount(row);
    }
    if(g.proofs[fact.proofId]){if(capacityHash(g.proofs[fact.proofId])!==capacityHash(proof))capacityFail('paid_capacity_proof_conflict');return {result:{...capacitySummary(row,receipt.periodId),receiptState:g.state}};}
    if(Object.keys(g.proofs).length>=64)capacityFail('paid_capacity_history_full');
    if(fact.providerId&&g.providerId&&fact.providerId!==g.providerId)capacityFail('paid_capacity_provider_changed');
    await capacityProviderAnchor(c,row,receipt.id,entry,g,fact.providerId);
    if(fact.outcome==='not_dispatched'){
      if(g.state==='settled'||g.providerId||!g.attempts[fact.attemptId])capacityFail('paid_capacity_proof_conflict');
      g.attempts[fact.attemptId].notDispatchedProof=fact.proofId;
      if(Object.values(g.attempts).every(a=>capacityHex(a.notDispatchedProof)))g.state='released';
    }else{
      if(g.state==='settled'&&fact.quantity<g.actualQuantity)capacityFail('paid_capacity_proof_conflict');
      if(g.state==='released')g.releaseContradicted=true;
      g.state='settled';g.actualQuantity=fact.quantity;if(fact.providerId){if(!g.providerId)g.providerBoundAt=new Date().toISOString();g.providerId=fact.providerId;}
    }
    g.proofs[fact.proofId]=proof;g.confirmedAt=new Date().toISOString();capacityRecount(row);
    return {value:row,result:{...capacitySummary(row,receipt.periodId),receiptState:g.state}};
  });
}
function capacitySummary(row,periodId) {
  const p=row.periods[periodId];return {period:{start:p.start,end:p.end},units:Object.fromEntries(PAID_CAPACITY_UNITS.map(unit=>[unit,{limit:p.limits[unit],used:p.used[unit],held:p.held[unit],remaining:Math.max(0,p.limits[unit]-p.used[unit]-p.held[unit]),overdrawn:p.used[unit]+p.held[unit]>p.limits[unit]}]))};
}
export async function paidUsageStatus(c) {
  const context=await paidCapacityContext(c,null,{statusOnly:true});if(!context)return {metered:false};
  if(!context.period)return {metered:true,funded:false,allowed:false,reasonCode:context.reasonCode,period:null};
  const row=capacityLedger(await strictRead('usage',paidUsageKey(c)),c,context.stripeAccountId),id=capacityPeriodId(context.period);
  let view=row;
  if(row&&!row.periods[id]&&context.period.end<=Math.floor(Date.now()/1000)&&context.period.start<row.closedThrough)view={...row,periods:{...row.periods,[id]:await capacityReadPeriod(c,row,id)}};
  else if(row)capacityPeriod(row,context,false);
  const summary=view?.periods[id]?capacitySummary(view,id):{period:context.period,units:Object.fromEntries(PAID_CAPACITY_UNITS.map(unit=>[unit,{limit:context.capacity.limits[unit],used:0,held:0,remaining:context.capacity.limits[unit],overdrawn:false}]))};
  for(const [unit,view]of Object.entries(summary.units))if(!context.services.includes(capacityServices[unit])||!context.allowed)view.remaining=0;
  return {metered:true,funded:context.funded,allowed:context.allowed,reasonCode:context.reasonCode,...summary,
    history:row?Object.keys(row.periods).filter(p=>p!==id).map(p=>capacitySummary(row,p)):[],archivedPeriods:row?.archivedPeriodCount||0};
}
