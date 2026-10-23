// Managed self-service owner notifications only. Access links and legacy email
// retain their existing paths. Reservations are cumulative, never policy resets.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { supportedWorkspace, workspaceTenant } from './workspace-identity.mjs';

const STORE = 'managed_email_budgets', KEY = 'resend:managed-owner:v1', MAX = 1000;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX;
const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export class ManagedEmailBudgetError extends Error {
  constructor(code, message = 'Your request is saved. Owner notifications are waiting for their approved sending allowance.') { super(message); this.code = code; }
}
const fail = code => { throw new ManagedEmailBudgetError(code); };
export function managedEmailBudgetPolicy() {
  try {
    const p = JSON.parse(process.env.MANAGED_EMAIL_BUDGET_POLICY_JSON || 'null');
    if (!exact(p, ['version','expiresAt','mode','providerCredentialHash','senderHash','accountLimit','tenantLimit','tenants']) || !/^[a-z0-9_-]{1,80}$/.test(p.version || '') || process.env.MANAGED_EMAIL_BUDGET_APPROVED_VERSION !== p.version || !['cohort','self_service'].includes(p.mode) || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= Date.now() || !process.env.RESEND_API_KEY || !process.env.FROM_EMAIL || p.providerCredentialHash !== hash(process.env.RESEND_API_KEY) || p.senderHash !== hash(process.env.FROM_EMAIL) || !integer(p.accountLimit) || !integer(p.tenantLimit) || p.tenantLimit > p.accountLimit || !Array.isArray(p.tenants) || p.tenants.length > 25 || (p.mode === 'cohort' ? !p.tenants.length : p.tenants.length !== 0) || p.tenants.some(t => !exact(t, ['slug','identity','emailHash']) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(t.slug || '') || !hex(t.identity) || !hex(t.emailHash)) || new Set(p.tenants.map(t => t.identity)).size !== p.tenants.length) return null;
    return { ...p, digest: hash(p) };
  } catch { return null; }
}
function payload(c, job) {
  const owner = normalizeAccountEmail(c.owner?.email);
  if (!owner || !job || job.channel !== 'email' || !['owner_booking','owner_lead'].includes(job.purpose) || job.tenant !== workspaceTenant(c) || typeof job.id !== 'string' || !new RegExp('^' + c.slug + '/[a-f0-9]{64}$').test(job.id) || job.to !== owner || typeof job.body !== 'string' || !job.body.trim() || job.body.length > 8000) fail('email_budget_message_changed');
  return { id: hash(job.id), tenant: workspaceTenant(c), emailHash: hash(owner), identity: hash({ id: job.id, tenant: job.tenant, purpose: job.purpose, to: job.to, body: job.body, source: job.source }) };
}
async function authority(c, p, input) {
  if (!p || managedEmailBudgetPolicy()?.digest !== p.digest) fail('email_budget_policy_unavailable');
  const current = await strictRead('clients', c.slug), owner = normalizeAccountEmail(current?.owner?.email);
  if (!supportedWorkspace(current) || workspaceTenant(current) !== input.tenant || !['testing','live'].includes(current.status) || !owner || normalizeAccountEmail(current.onboarding.verifiedEmail) !== owner || hash(owner) !== input.emailHash || (p.mode === 'cohort' && !p.tenants.some(t => t.slug === c.slug && t.identity === input.tenant && t.emailHash === input.emailHash)) || (await strictRead('health', 'brake'))?.on === true) fail('email_budget_tenant_unapproved');
  if (managedEmailBudgetPolicy()?.digest !== p.digest) fail('email_budget_policy_changed');
}
function ledger(row, p) {
  if (row === null) return { version: 1, providerCredentialHash: p.providerCredentialHash, senderHash: p.senderHash, used: 0, tenants: {}, reservations: {} };
  if (!exact(row, ['version','providerCredentialHash','senderHash','used','tenants','reservations']) || row.version !== 1 || row.providerCredentialHash !== p.providerCredentialHash || row.senderHash !== p.senderHash || !integer(row.used) || !row.tenants || typeof row.tenants !== 'object' || Array.isArray(row.tenants) || !row.reservations || typeof row.reservations !== 'object' || Array.isArray(row.reservations) || Object.keys(row.reservations).length > MAX) fail('email_budget_storage_unavailable');
  const tenants = {};
  for (const [id, r] of Object.entries(row.reservations)) {
    if (!hex(id) || !exact(r, ['identity','tenant','emailHash','reservedAt']) || !hex(r.identity) || !hex(r.tenant) || !hex(r.emailHash) || !Number.isFinite(Date.parse(r.reservedAt))) fail('email_budget_storage_unavailable');
    tenants[r.tenant] = (tenants[r.tenant] || 0) + 1;
  }
  if (row.used !== Object.keys(row.reservations).length || hash(tenants) !== hash(row.tenants)) fail('email_budget_storage_unavailable');
  return row;
}
export async function reserveManagedEmail(c, job) {
  const p = managedEmailBudgetPolicy(), input = payload(c, job); await authority(c, p, input);
  const saved = await atomicUpdate(STORE, KEY, async previous => {
    await authority(c, p, input); const row = ledger(previous, p), old = row.reservations[input.id];
    if (old && (old.identity !== input.identity || old.tenant !== input.tenant || old.emailHash !== input.emailHash)) fail('email_budget_message_changed');
    const used = row.used + Number(!old), own = (row.tenants[input.tenant] || 0) + Number(!old);
    if (used > p.accountLimit || own > p.tenantLimit) fail('email_budget_exhausted');
    const reservation = old || { identity: input.identity, tenant: input.tenant, emailHash: input.emailHash, reservedAt: new Date().toISOString() };
    return { value: { ...row, used, tenants: { ...row.tenants, [input.tenant]: own }, reservations: { ...row.reservations, [input.id]: reservation } }, result: reservation };
  });
  const receipt = { key: KEY, id: input.id, policyDigest: p.digest, ...saved };
  await assertManagedEmailReservation(c, job, receipt); return receipt;
}
export async function assertManagedEmailReservation(c, job, receipt) {
  const p = managedEmailBudgetPolicy(), input = payload(c, job); await authority(c, p, input);
  if (!receipt || receipt.key !== KEY || receipt.id !== input.id || receipt.identity !== input.identity || receipt.policyDigest !== p.digest || receipt.tenant !== input.tenant || receipt.emailHash !== input.emailHash) fail('email_budget_reservation_changed');
  const row = ledger(await strictRead(STORE, KEY), p), saved = row.reservations[input.id];
  if (!saved || saved.identity !== input.identity || saved.tenant !== input.tenant || saved.emailHash !== input.emailHash || row.used > p.accountLimit || row.tenants[input.tenant] > p.tenantLimit) fail('email_budget_reservation_changed');
  await authority(c, p, input); return true;
}
// No await between this final configuration fence and the provider POST.
export function assertManagedEmailDispatchPolicy(receipt) {
  if (process.env.SERVICE_DELIVERY_ENABLED !== 'true' || (process.env.SERVICE_WORKER_KEY || '').length < 32 || managedEmailBudgetPolicy()?.digest !== receipt?.policyDigest) fail('email_budget_policy_changed');
}
