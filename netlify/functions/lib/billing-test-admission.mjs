// A TEST key is not permission to present simulated billing to every customer.
// This narrow offer-bound cohort admits one current workspace for at most four
// hours. It governs new capabilities; existing financial recovery stays separate.
import { createHash } from 'node:crypto';
import { workspaceTenant, supportedWorkspace } from './workspace-identity.mjs';
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const email=value=>typeof value==='string'?value.trim().toLowerCase():'';
const sha=value=>createHash('sha256').update(value).digest('hex');
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export function billingTestAdmissionPolicy(offer) {
  try {
    const policy=JSON.parse(process.env.WORKSPACE_BILLING_TEST_PROOF_POLICY_JSON||'null');
    if(!offer||!exact(policy,['version','phaseId','issuedAt','expiresAt','stripeAccountId','offerDigest','tenant'])||policy.version!==offer.version||!/^[a-z0-9_-]{1,100}$/.test(policy.phaseId||'')||!iso(policy.issuedAt)||!iso(policy.expiresAt)||Date.parse(policy.issuedAt)>Date.now()||Date.parse(policy.expiresAt)<=Date.now()||Date.parse(policy.expiresAt)-Date.parse(policy.issuedAt)>4*3600000||Date.parse(policy.expiresAt)<=Date.parse(policy.issuedAt)||policy.stripeAccountId!==offer.stripeAccountId||policy.offerDigest!==offer.digest||!exact(policy.tenant,['slug','identity','ownerEmailHash'])||!/^[a-z0-9][a-z0-9-]{0,39}$/.test(policy.tenant.slug||'')||!hex(policy.tenant.identity)||!hex(policy.tenant.ownerEmailHash))return null;
    return policy;
  } catch { return null; }
}
// The known financial record supplies its immutable offer; new purchases use
// the current offer and additionally require an operating workspace below.
export function billingTestMaintenanceAdmits(client,offer) {
  const policy=billingTestAdmissionPolicy(offer),owner=email(client?.owner?.email);
  return !!policy&&supportedWorkspace(client)&&client.slug===policy.tenant.slug&&workspaceTenant(client)===policy.tenant.identity&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)&&sha(owner)===policy.tenant.ownerEmailHash;
}

export function billingTestAdmits(client,offer) {
  return ['testing','live'].includes(client?.status)&&billingTestMaintenanceAdmits(client,offer);
}
