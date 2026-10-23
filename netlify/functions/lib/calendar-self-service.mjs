// Automatic Calendar admission for verified workspaces. Explicitly off until the
// platform enables a current policy; customer consent and source checks remain separate.
import { createHash, randomBytes } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead } from './accounts.mjs';
import { isSupportedSelfServiceClient } from './setup.mjs';
import { workspaceTenant, belongsToWorkspace } from './workspace-identity.mjs';

const ACTIONS = ['oauthStart', 'tokenExchange', 'tokenRefresh', 'calendarRead', 'eventCreate', 'eventUpdate', 'eventDelete', 'workerDispatch'];
const KEYS = [...ACTIONS, 'totalRequests'].sort().join(',');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
const day = () => new Date().toISOString().slice(0, 10);
const empty = () => Object.fromEntries([...ACTIONS, 'totalRequests'].map(key => [key, 0]));
const validLimits = value => value && Object.keys(value).sort().join(',') === KEYS && Object.values(value).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000);
export class SelfServiceCalendarError extends Error {
  constructor(code, message = 'Calendar setup is saved. The platform needs to resolve its connection service before continuing.') { super(message); this.code = code; this.status = 503; }
}
export function selfServiceCalendarPolicy() {
  try {
    if (process.env.CALENDAR_SELF_SERVICE_ENABLED !== 'true') return null;
    const p = JSON.parse(process.env.CALENDAR_SELF_SERVICE_POLICY_JSON || 'null');
    if (!p || Object.keys(p).sort().join(',') !== ['mode','version','expiresAt','googleClientIdHash','limits','tenantLimits'].sort().join(',') || p.mode !== 'self_service' || !/^[a-z0-9_-]{1,80}$/.test(p.version || '') || process.env.CALENDAR_SELF_SERVICE_APPROVED_VERSION !== p.version || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= Date.now() || !process.env.GOOGLE_CLIENT_ID || p.googleClientIdHash !== hash(process.env.GOOGLE_CLIENT_ID) || !validLimits(p.limits) || !validLimits(p.tenantLimits) || Object.keys(p.limits).some(key => p.tenantLimits[key] > p.limits[key])) return null;
    return { ...p, digest: hash(p) };
  } catch { return null; }
}
// Daily keys deliberately omit the policy version: editing a policy cannot
// replenish capacity already consumed that UTC day.
export const selfServiceCalendarBudgetKeys = c => ({ global: `self-service:${day()}:global`, tenant: `self-service:${day()}:tenant:${workspaceTenant(c)}` });
function ledger(row, c, scope, atDay) {
  if (!row) return { version: 1, day: atDay, scope, ...(scope === 'tenant' ? { tenantIdentity: workspaceTenant(c) } : {}), used: empty() };
  if (row.version !== 1 || row.day !== atDay || row.scope !== scope || scope === 'tenant' && row.tenantIdentity !== workspaceTenant(c) || !row.used || Object.keys(row.used).sort().join(',') !== KEYS || !Object.values(row.used).every(n => Number.isSafeInteger(n) && n >= 0) || row.used.totalRequests !== ACTIONS.filter(action => action !== 'oauthStart').reduce((sum, action) => sum + row.used[action], 0)) throw new SelfServiceCalendarError('calendar_budget_unavailable');
  return row;
}
export async function assertSelfServiceCalendar(c, p, { targetId, bookingId, receipt, authorize, connecting = false, localOnly = false } = {}) {
  const current = await strictRead('clients', c.slug), identity = workspaceTenant(c);
  const allowedStatuses = localOnly ? ['testing','live','paused'] : ['testing','live'];
  if (!isSupportedSelfServiceClient(current) || workspaceTenant(current) !== identity || !allowedStatuses.includes(current.status) || !current.onboarding?.desiredChannels?.includes('calendar') || (await strictRead('health', 'brake'))?.on === true && !localOnly) throw new SelfServiceCalendarError('calendar_authority_changed');
  if (receipt && (receipt.mode !== 'self_service' || receipt.day !== day() || receipt.tenantIdentity !== identity || receipt.policyDigest !== p.digest || receipt.version !== p.version)) throw new SelfServiceCalendarError('calendar_policy_changed');
  if (targetId !== undefined) {
    if (typeof targetId !== 'string' || !targetId || targetId.length > 1024 || /[\x00-\x1f]/.test(targetId)) throw new SelfServiceCalendarError('calendar_target_changed');
    const connection = await strictRead('calendar_connections', c.slug);
    const bound = connection?.tenantIdentity === identity && connection.googleClientIdHash === p.googleClientIdHash && connection.status === 'connected' && connection.targetId === targetId && connection.targetHash === hash(targetId) && !!connection.refresh;
    // Only the owner/epoch-authorized OAuth completion can bind the primary
    // calendar returned directly by Google. It is never a customer body field.
    const grant = connecting === true && typeof authorize === 'function' && connection?.tenantIdentity === identity && Number.isSafeInteger(connection.grantEpoch) && connection.grantEpoch > 0;
    if (!bound && !grant) throw new SelfServiceCalendarError('calendar_target_changed');
  }
  if (bookingId !== undefined) {
    if (typeof bookingId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(bookingId)) throw new SelfServiceCalendarError('calendar_booking_unavailable');
    const booking = await strictRead('bookings', `${c.slug}/${bookingId}`);
    if (!booking || booking.id !== bookingId || booking.slug !== c.slug || booking.delivery?.tenantIdentity !== identity || !belongsToWorkspace(current, booking) || booking.ownerVisitCreationAborted || booking.websiteSetupCheck || booking.simulation) throw new SelfServiceCalendarError('calendar_booking_unavailable');
  }
  if (authorize && await authorize() !== true) throw new SelfServiceCalendarError('calendar_authority_changed');
  const latest = await strictRead('clients', c.slug);
  if (!isSupportedSelfServiceClient(latest) || workspaceTenant(latest) !== identity || !allowedStatuses.includes(latest.status) || !latest.onboarding?.desiredChannels?.includes('calendar') || (await strictRead('health', 'brake'))?.on === true && !localOnly) throw new SelfServiceCalendarError('calendar_authority_changed');
  if (selfServiceCalendarPolicy()?.digest !== p.digest) throw new SelfServiceCalendarError('calendar_policy_changed');
  return p;
}
export async function selfServiceCalendarAvailable(c, p, options = {}) {
  await assertSelfServiceCalendar(c, p, options);
  if (options.localOnly === true) return true; // Retain desired work even when today's transport budget is exhausted.
  const atDay = day(), keys = selfServiceCalendarBudgetKeys(c);
  const rows = await Promise.all(['global','tenant'].map(async scope => ledger(await strictRead('calendar_execution_budgets', keys[scope]), c, scope, atDay)));
  const remains = action => ACTIONS.includes(action) && rows.every((row, i) => row.used[action] < (i ? p.tenantLimits : p.limits)[action]);
  return rows.every((row, i) => row.used.totalRequests < (i ? p.tenantLimits : p.limits).totalRequests) && (options.actions || []).every(remains) && (!options.anyActions || options.anyActions.some(remains));
}
export async function reserveSelfServiceCalendar(c, p, action, options = {}) {
  if (!ACTIONS.includes(action)) throw new SelfServiceCalendarError('calendar_action_invalid');
  options = { ...options, localOnly: false };
  await assertSelfServiceCalendar(c, p, options);
  const atDay = day(), keys = selfServiceCalendarBudgetKeys(c), attempt = randomBytes(16).toString('hex'), physical = action !== 'oauthStart';
  // Reserve global first. A failed tenant reservation consumes global capacity
  // conservatively; it can never issue an uncounted provider request.
  for (const scope of ['global','tenant']) await atomicUpdate('calendar_execution_budgets', keys[scope], async previous => {
    await assertSelfServiceCalendar(c, p, options);
    if (day() !== atDay) throw new SelfServiceCalendarError('calendar_policy_changed');
    const row = ledger(previous, c, scope, atDay), limits = scope === 'global' ? p.limits : p.tenantLimits;
    if (row.used[action] >= limits[action] || physical && row.used.totalRequests >= limits.totalRequests) throw new SelfServiceCalendarError('calendar_budget_exhausted', 'Calendar work is saved. Sync resumes when its daily service allowance is available.');
    return { value: { ...row, used: { ...row.used, [action]: row.used[action] + 1, totalRequests: row.used.totalRequests + Number(physical) }, lastAttempt: { id: attempt, action, policyDigest: p.digest, at: new Date().toISOString() } } };
  });
  const receipt = { mode: 'self_service', day: atDay, tenantIdentity: workspaceTenant(c), version: p.version, policyDigest: p.digest, attempt };
  await assertSelfServiceCalendar(c, p, { ...options, receipt });
  return receipt;
}
