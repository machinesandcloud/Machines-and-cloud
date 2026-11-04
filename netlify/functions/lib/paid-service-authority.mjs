// Payment authority is separate from free workspace and operator-funded access.
// This module never contacts Stripe, activates a service or changes a budget.
import { createHash } from 'node:crypto';
import { strictRead } from './accounts.mjs';
import { supportedWorkspace, workspaceTenant } from './workspace-identity.mjs';
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const digest = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const id = (v, prefix) => typeof v === 'string' && new RegExp('^' + prefix + '[a-zA-Z0-9_]{3,160}$').test(v);
const exact = (v, fields) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...fields].sort().join(',');
export const PAID_CAPACITY_UNITS = Object.freeze(['voiceMinutes', 'smsSegments', 'aiAnswers']);
export function validPaidCapacity(value) {
  return exact(value, ['version', 'period', 'limits']) && value.version === 1 && value.period === 'paid_invoice' &&
    exact(value.limits, PAID_CAPACITY_UNITS) && Object.values(value.limits).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1e12);
}
export class PaidServiceAuthorityError extends Error {
  constructor(code = 'paid_service_unconfirmed') { super(code==='workspace_inactive'?'Your front desk is paused or stopped. Saved requests and payment records are kept.':code.startsWith('paid_capacity')?'We could not confirm this service’s saved usage. Your saved work and account are kept.':'Payment for this service period needs confirmation. Saved requests and your workspace are kept.'); this.code = code; this.status = code.startsWith('paid_capacity')?503:409; }
}
export function paidContract(row, c) {
  const offer = row?.checkout?.offer, choice = offer?.plans?.[row?.checkout?.plan];
  const services = row?.checkout?.services;
  if (choice && Object.hasOwn(choice, 'capacity') && !validPaidCapacity(choice.capacity)) return null;
  if (!supportedWorkspace(c) || row?.livemode !== true || row.tenant !== workspaceTenant(c) || row.slug !== c.slug || !id(row.stripeAccountId, 'acct_') || offer?.stripeAccountId !== row.stripeAccountId || offer.currency !== 'usd' || !choice || !Array.isArray(choice.services) || !offer.terms || typeof offer.terms!=='object' || !Number.isSafeInteger(choice.amountCents) || choice.amountCents <= 0 || !id(choice.priceId, 'price_') || !Array.isArray(services) || !services.length || new Set(services).size !== services.length || services.some(s => !['web','voice','sms','calendar'].includes(s) || !choice.services.includes(s)) || row.checkout.acceptedTerms?.version !== offer.terms?.version || row.checkout.acceptedTerms?.digest !== digest(offer.terms) || !Number.isFinite(Date.parse(row.checkout.acceptedTerms?.at)) || Date.parse(row.checkout.acceptedTerms.at) > Date.now() || !/^[a-f0-9]{32}$/.test(row.checkout.id||'') || row.checkout.state !== 'complete' || !id(row.checkout.sessionId, 'cs_') || !id(row.customerId, 'cus_') || !id(row.subscription?.id, 'sub_')) return null;
  const { digest: accepted, ...body } = offer;
  return accepted === digest(body) ? { offerDigest: accepted, priceId: choice.priceId, amountCents: choice.amountCents, services: [...services], ...(Object.hasOwn(choice, 'capacity') ? { capacity: structuredClone(choice.capacity) } : {}) } : null;
}
export function paidPeriodMatches(period, row, contract) {
  return !!contract && !!period && period.version === 1 && period.tenant === row.tenant && period.stripeAccountId === row.stripeAccountId && period.livemode === true && period.checkoutId === row.checkout.id && period.subscriptionId === row.subscription.id && period.customerId === row.customerId && period.offerDigest === contract.offerDigest && period.priceId === contract.priceId && Array.isArray(period.services) && digest(period.services) === digest(contract.services) && id(period.invoiceId, 'in_') && Number.isSafeInteger(period.start) && Number.isSafeInteger(period.end) && period.start > 0 && period.end > period.start && Number.isFinite(Date.parse(period.confirmedAt)) && Date.parse(period.confirmedAt) <= Date.now();
}
export function paidPeriodFunding(row, c, service) {
  const contract = paidContract(row, c), at = Math.floor(Date.now() / 1000);
  const period = contract && [row.paidPeriod, row.nextPaidPeriod].find(p => paidPeriodMatches(p, row, contract) && p.start <= at && at < p.end);
  const paid = !!period && (!service || (service==='phone_number'?contract.services.some(s=>['voice','sms'].includes(s)):contract.services.includes(service)));
  const allowed = paid && !row.stopRequestedAt && !['canceled', 'incomplete_expired'].includes(row.subscription?.status) && ['testing', 'live'].includes(c.status);
  return { enrolled: row?.livemode === true, paid, allowed, source: 'live_paid_period', reasonCode: allowed ? null : paid ? 'workspace_inactive' : 'paid_service_unconfirmed', periodEnd: period ? new Date(period.end * 1000).toISOString() : null };
}
export async function paidServiceAuthority(c, service) {
  if (!Object.hasOwn(c||{}, 'onboarding')) return { enrolled:false, paid:false, allowed:true, source:'existing_service_authority' };
  const current = await strictRead('clients', c.slug);
  if (!supportedWorkspace(current) || workspaceTenant(current) !== workspaceTenant(c)) throw new PaidServiceAuthorityError('paid_service_workspace_changed');
  const row = await strictRead('workspace_billing', `${current.slug}/${workspaceTenant(current)}`);
  if (service === 'web') return { enrolled: row?.livemode === true, paid: false, allowed: true, source: 'existing_free_web_authority' };
  // No record and TEST records grant no paid rights. Existing free and explicitly
  // funded operator paths still have to pass their OWN service/policy checks.
  if (!row || row.livemode === false) return { enrolled: false, paid: false, allowed: true, source: 'existing_service_authority' };
  return { ...paidPeriodFunding(row, current, service), enrolled: true };
}
export async function assertPaidServiceAuthority(c, service) {
  const grant = await paidServiceAuthority(c, service);
  if (!grant.allowed) throw new PaidServiceAuthorityError(grant.reasonCode);
  return grant;
}

// Server-only context for the opt-in invoice-period meter. A missing capacity
// declaration retains existing service authority; it never supplies new units.
export async function paidCapacityContext(c, service = null, { statusOnly = false } = {}) {
  if (!Object.hasOwn(c || {}, 'onboarding')) return null;
  const current = await strictRead('clients', c.slug);
  if (!supportedWorkspace(current) || workspaceTenant(current) !== workspaceTenant(c)) throw new PaidServiceAuthorityError('paid_service_workspace_changed');
  const row = await strictRead('workspace_billing', `${current.slug}/${workspaceTenant(current)}`);
  if (!row || row.livemode === false || service === 'web' || service === 'private') return null;
  const contract = paidContract(row, current), declared = row.checkout?.offer?.plans?.[row.checkout?.plan];
  if (declared && Object.hasOwn(declared, 'capacity') && !validPaidCapacity(declared.capacity)) throw new PaidServiceAuthorityError('paid_capacity_unavailable');
  const funding = paidPeriodFunding(row, current, service);
  if (!statusOnly && !funding.allowed) throw new PaidServiceAuthorityError(funding.reasonCode);
  if (!contract?.capacity) return null;
  const at = Math.floor(Date.now() / 1000), periods = [row.paidPeriod, row.nextPaidPeriod].filter(p => paidPeriodMatches(p, row, contract));
  const period = periods.find(p => p.start <= at && at < p.end) || (statusOnly ? periods.filter(p => p.start <= at).sort((a, b) => b.end - a.end)[0] : null);
  if (!period) {
    if (statusOnly) return { metered: true, funded: false, allowed: false, reasonCode: 'paid_service_unconfirmed', capacity: contract.capacity, period: null };
    throw new PaidServiceAuthorityError('paid_service_unconfirmed');
  }
  return { metered: true, funded: funding.paid, allowed: funding.allowed, reasonCode: funding.reasonCode,
    slug: current.slug, tenantIdentity: workspaceTenant(current), stripeAccountId: row.stripeAccountId,
    subscriptionId: row.subscription.id, checkoutId: row.checkout.id, priceId: contract.priceId,
    offerDigest: contract.offerDigest, services: contract.services, capacity: contract.capacity,
    invoiceId: period.invoiceId, period: { start: period.start, end: period.end } };
}
