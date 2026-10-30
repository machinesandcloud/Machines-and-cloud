// Payment authority is separate from free workspace and operator-funded access.
// This module never contacts Stripe, activates a service or changes a budget.
import { createHash } from 'node:crypto';
import { strictRead } from './accounts.mjs';
import { supportedWorkspace, workspaceTenant } from './workspace-identity.mjs';
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const digest = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const id = (v, prefix) => typeof v === 'string' && new RegExp('^' + prefix + '[a-zA-Z0-9_]{3,160}$').test(v);
export class PaidServiceAuthorityError extends Error {
  constructor(code = 'paid_service_unconfirmed') { super(code==='workspace_inactive'?'Your front desk is paused or stopped. Saved requests and payment records are kept.':'Payment for this service period needs confirmation. Saved requests and your workspace are kept.'); this.code = code; this.status = 409; }
}
export function paidContract(row, c) {
  const offer = row?.checkout?.offer, choice = offer?.plans?.[row?.checkout?.plan];
  const services = row?.checkout?.services;
  if (!supportedWorkspace(c) || row?.livemode !== true || row.tenant !== workspaceTenant(c) || row.slug !== c.slug || !id(row.stripeAccountId, 'acct_') || offer?.stripeAccountId !== row.stripeAccountId || offer.currency !== 'usd' || !choice || !Array.isArray(choice.services) || !offer.terms || typeof offer.terms!=='object' || !Number.isSafeInteger(choice.amountCents) || choice.amountCents <= 0 || !id(choice.priceId, 'price_') || !Array.isArray(services) || !services.length || new Set(services).size !== services.length || services.some(s => !['web','voice','sms','calendar'].includes(s) || !choice.services.includes(s)) || row.checkout.acceptedTerms?.version !== offer.terms?.version || row.checkout.acceptedTerms?.digest !== digest(offer.terms) || !Number.isFinite(Date.parse(row.checkout.acceptedTerms?.at)) || Date.parse(row.checkout.acceptedTerms.at) > Date.now() || !/^[a-f0-9]{32}$/.test(row.checkout.id||'') || row.checkout.state !== 'complete' || !id(row.checkout.sessionId, 'cs_') || !id(row.customerId, 'cus_') || !id(row.subscription?.id, 'sub_')) return null;
  const { digest: accepted, ...body } = offer;
  return accepted === digest(body) ? { offerDigest: accepted, priceId: choice.priceId, amountCents: choice.amountCents, services: [...services] } : null;
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
