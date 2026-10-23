// A named Calendar cohort and non-refundable physical-attempt budget. This is not
// a provider dollar ceiling or authority for any phone, SMS or other service.
import { createHash, randomBytes } from 'node:crypto';
import { atomicUpdate, list } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { isSupportedSelfServiceClient } from './setup.mjs';
import { selfServiceCalendarPolicy, assertSelfServiceCalendar, selfServiceCalendarAvailable, reserveSelfServiceCalendar } from './calendar-self-service.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const ACTIONS = ['oauthStart', 'tokenExchange', 'tokenRefresh', 'calendarRead', 'eventCreate', 'eventUpdate', 'eventDelete', 'workerDispatch'];
const CENSUS_STORES = ['calendar_connections', 'calendar_deliveries', 'calendar_oauth'];
export const calendarExecutionIdentity = c => hash(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)]));
export const calendarExecutionBudgetKey = version => `calendar-v1:${version}`;
// Calendar workers persist numeric deadlines. Unknown formats (including ISO
// strings), malformed claims and live leases retain ownership until reviewed.
export function calendarClaimExpired(claim) {
  if (claim === null || claim === undefined) return true;
  if (!claim || typeof claim !== 'object' || Array.isArray(claim) || !/^[a-f0-9]{32}$/.test(claim.token || '')) return false;
  const raw = claim.until, until = typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 ? raw : NaN;
  return Number.isFinite(until) && until <= Date.now();
}
export class CalendarExecutionError extends Error {
  constructor(code = 'calendar_execution_unavailable', message = 'Calendar connection is waiting for its approved service setup.') { super(message); this.code = code; this.status = 503; }
}
export function calendarExecutionPolicy() {
  if (process.env.CALENDAR_SELF_SERVICE_ENABLED === 'true') return selfServiceCalendarPolicy();
  try {
    const p = JSON.parse(process.env.CALENDAR_EXECUTION_POLICY_JSON || 'null');
    if (!p || Object.keys(p).sort().join(',') !== ['version','expiresAt','tenant','googleClientIdHash','targetIdHash','censusDigest','censusMode','bookingIds','limits'].sort().join(',') || !['clean_initial','reviewed_retained'].includes(p.censusMode) || !/^[a-z0-9_-]{1,80}$/.test(p.version || '') || process.env.CALENDAR_EXECUTION_APPROVED_VERSION !== p.version || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= Date.now() || Object.keys(p.tenant || {}).sort().join(',') !== 'identity,slug' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(p.tenant.slug || '') || ![p.tenant.identity,p.googleClientIdHash,p.targetIdHash,p.censusDigest].every(hex) || !Array.isArray(p.bookingIds) || !p.bookingIds.length || p.bookingIds.length > 10 || new Set(p.bookingIds).size !== p.bookingIds.length || !p.bookingIds.every(id => /^[a-zA-Z0-9_-]{1,80}$/.test(id)) || Object.keys(p.limits || {}).sort().join(',') !== [...ACTIONS,'totalRequests'].sort().join(',') || !Object.values(p.limits).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10000) || p.googleClientIdHash !== hash(process.env.GOOGLE_CLIENT_ID || '') || p.censusMode === 'reviewed_retained' && ['oauthStart','tokenExchange','eventCreate'].some(action => p.limits[action] !== 0)) return null;
    return { ...p, digest: digest(p) };
  } catch { return null; }
}
// The first admitted operation requires a complete authoritative baseline and
// no retained Calendar work for the exact target slug, including prior owners.
// Never convert failed/truncated reads into an empty census. Later approved work
// does not invalidate that retained baseline or replenish the attempt budget.
export async function calendarExecutionCensus(c, policy) {
  if (!c || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(c.slug || '')) throw new CalendarExecutionError('calendar_census_unaccepted');
  const snapshot = [], retained = Object.fromEntries(CENSUS_STORES.map(kind=>[kind,[]]));
  for (const kind of CENSUS_STORES) {
    const keys = await list(kind, '');
    if (keys.length > 1000) throw new CalendarExecutionError('calendar_census_partial', 'Calendar setup needs a complete retained-resource inspection.');
    const rows = [];
    for (const key of keys) { const value = await strictRead(kind, key); if (!value) throw new CalendarExecutionError('calendar_census_changed'); const inCohort = value.slug === c.slug || kind === 'calendar_connections' && key === c.slug || kind === 'calendar_deliveries' && key.startsWith(c.slug + '/'); rows.push({ key, digest: digest(value), inCohort }); if(inCohort)retained[kind].push({key,value}); }
    const after = await list(kind, '');
    if (digest(after) !== digest(keys)) throw new CalendarExecutionError('calendar_census_changed');
    snapshot.push({ kind, rows });
  }
  const connections = retained.calendar_connections, jobs = retained.calendar_deliveries, oauth = retained.calendar_oauth;
  const connection = connections.length === 1 && connections[0].key === c.slug ? connections[0].value : null;
  const reviewed = !!policy && !!connection && connection.slug === c.slug && connection.tenantIdentity === policy.tenant.identity && connection.googleClientIdHash === policy.googleClientIdHash && connection.status === 'connected' && !!connection.refresh && /^[a-f0-9]{32}$/.test(connection.connectionId || '') && typeof connection.targetId === 'string' && hash(connection.targetId) === policy.targetIdHash && connection.targetHash === policy.targetIdHash && jobs.length > 0 && jobs.every(({key,value:job}) => job.slug === c.slug && job.tenantIdentity === policy.tenant.identity && policy.bookingIds.includes(job.bookingId) && key === `${c.slug}/${policy.tenant.identity}/${job.bookingId}` && job.storageKey === key && job.connectionId === connection.connectionId && job.targetId === connection.targetId && job.targetHash === policy.targetIdHash && ['queued','working','synced','cancelled','needs_attention','retry','waiting_connection'].includes(job.state) && calendarClaimExpired(job.claim) && job.eventId === `mc${hash(`machinesandcloud:calendar:v1:${policy.tenant.identity}:${job.bookingId}`)}` && (!job.receipt || job.receipt.eventId === job.eventId)) && policy.bookingIds.every(id=>jobs.some(({value})=>value.bookingId===id)) && oauth.every(({value:row}) => row.slug === c.slug && row.tenantIdentity === policy.tenant.identity && row.googleClientIdHash === policy.googleClientIdHash && row.email === normalizeAccountEmail(c.owner?.email) && (['consumed','denied'].includes(row.state) || row.state === 'pending' && Date.parse(row.expiresAt) <= Date.now()));
  return { digest: digest(snapshot), clean: snapshot.every(row => row.rows.every(item => !item.inCohort)), reviewed, counts: Object.fromEntries(snapshot.map(row => [row.kind,row.rows.length])) };
}
const acceptsCensus = (census,p) => census?.digest === p.censusDigest && (p.censusMode === 'clean_initial' ? census.clean === true : census.reviewed === true);
function boundPolicy(c, targetId, bookingId) {
  const p = calendarExecutionPolicy();
  if (!p || !isSupportedSelfServiceClient(c) || c.slug !== p.tenant.slug || calendarExecutionIdentity(c) !== p.tenant.identity || targetId !== undefined && (typeof targetId !== 'string' || hash(targetId) !== p.targetIdHash) || bookingId !== undefined && !p.bookingIds.includes(bookingId)) throw new CalendarExecutionError('calendar_cohort_unavailable');
  return p;
}
function validLedger(row, p) {
  if (!row || row.version !== 1 || row.policyDigest !== p.digest || !acceptsCensus(row.census,p) || !row.used || Object.keys(row.used).sort().join(',') !== [...ACTIONS,'totalRequests'].sort().join(',') || !Object.values(row.used).every(n => Number.isSafeInteger(n) && n >= 0) || Object.keys(row.used).some(action => row.used[action] > p.limits[action]) || row.used.totalRequests !== ACTIONS.filter(action => action !== 'oauthStart').reduce((sum,action) => sum + row.used[action],0)) throw new CalendarExecutionError('calendar_policy_changed', 'Calendar service terms changed. The retained attempt budget needs review.');
}
export async function assertCalendarExecution(c, options = {}) {
  const { targetId, bookingId, receipt, authorize } = options;
  const production = calendarExecutionPolicy();
  if (production?.mode === 'self_service') return assertSelfServiceCalendar(c, production, options);
  const p = boundPolicy(c, targetId, bookingId), current = await strictRead('clients', c.slug);
  if (!current || !isSupportedSelfServiceClient(current) || calendarExecutionIdentity(current) !== p.tenant.identity || !['testing','live','paused'].includes(current.status) || (await strictRead('health','brake'))?.on === true || authorize && await authorize() !== true) throw new CalendarExecutionError('calendar_authority_changed');
  if (receipt && (receipt.policyDigest !== p.digest || receipt.version !== p.version)) throw new CalendarExecutionError('calendar_policy_changed');
  const row = await strictRead('calendar_execution_budgets', calendarExecutionBudgetKey(p.version));
  if (row) validLedger(row, p);
  else { const census = await calendarExecutionCensus(c,p); if (!acceptsCensus(census,p)) throw new CalendarExecutionError('calendar_census_unaccepted', 'Calendar setup needs an approved retained-resource inspection.'); }
  if (receipt && !row) throw new CalendarExecutionError('calendar_budget_missing');
  // Recheck after awaited authorization/storage operations, before returning authority.
  const finalClient = await strictRead('clients', c.slug);
  if (!finalClient || calendarExecutionIdentity(finalClient) !== p.tenant.identity || !['testing','live','paused'].includes(finalClient.status) || (await strictRead('health','brake'))?.on === true) throw new CalendarExecutionError('calendar_authority_changed');
  if (calendarExecutionPolicy()?.digest !== p.digest) throw new CalendarExecutionError('calendar_policy_changed');
  return p;
}
export async function calendarExecutionAvailable(c, options = {}) {
  try {
    const production = calendarExecutionPolicy();
    if (production?.mode === 'self_service') return await selfServiceCalendarAvailable(c, production, options);
    const p = await assertCalendarExecution(c, options), row = await strictRead('calendar_execution_budgets', calendarExecutionBudgetKey(p.version));
    const remains = action => ACTIONS.includes(action) && (row?.used[action] || 0) < p.limits[action];
    return (row?.used.totalRequests || 0) < p.limits.totalRequests && (options.actions || []).every(remains) && (!options.anyActions || options.anyActions.some(remains));
  } catch { return false; }
}
export async function admitCalendarExecution(c, options = {}) {
  const production = calendarExecutionPolicy();
  if (production?.mode === 'self_service') return assertSelfServiceCalendar(c, production, options);
  const p = await assertCalendarExecution(c,options);
  const baseline = await strictRead('calendar_execution_budgets', calendarExecutionBudgetKey(p.version)) ? null : await calendarExecutionCensus(c,p);
  await atomicUpdate('calendar_execution_budgets', calendarExecutionBudgetKey(p.version), row => {
    if (calendarExecutionPolicy()?.digest !== p.digest) throw new CalendarExecutionError('calendar_policy_changed');
    if (!row) {
      if (!acceptsCensus(baseline,p)) throw new CalendarExecutionError('calendar_census_unaccepted');
      row = { version: 1, policyDigest: p.digest, census: baseline, admittedAt: new Date().toISOString(), used: Object.fromEntries([...ACTIONS,'totalRequests'].map(key => [key,0])) };
    }
    validLedger(row, p);
    return {value:row};
  });
  return p;
}
export async function reserveCalendarExecution(c, action, options = {}) {
  if (!ACTIONS.includes(action)) throw new CalendarExecutionError('calendar_action_invalid');
  const production = calendarExecutionPolicy();
  if (production?.mode === 'self_service') return reserveSelfServiceCalendar(c, production, action, options);
  const p = await admitCalendarExecution(c, options), attempt = randomBytes(16).toString('hex');
  await atomicUpdate('calendar_execution_budgets', calendarExecutionBudgetKey(p.version), row => {
    if (calendarExecutionPolicy()?.digest !== p.digest) throw new CalendarExecutionError('calendar_policy_changed');
    validLedger(row,p);
    const physical = action !== 'oauthStart';
    if (row.used[action] >= p.limits[action] || physical && row.used.totalRequests >= p.limits.totalRequests) throw new CalendarExecutionError('calendar_budget_exhausted', 'Calendar work is saved. The approved service request allowance is exhausted.');
    return { value: { ...row, used: { ...row.used, [action]: row.used[action] + 1, totalRequests: row.used.totalRequests + Number(physical) }, lastAttempt: { id: attempt, action, at: new Date().toISOString() } } };
  });
  const receipt = { version: p.version, policyDigest: p.digest, attempt };
  await assertCalendarExecution(c, { ...options, receipt });
  return receipt;
}
export async function guardedCalendarFetch(c, action, url, init, options = {}) {
  options = { ...options, localOnly: false }; // A local queue admission never authorizes transport.
  if (options.deadline !== undefined && (!Number.isFinite(options.deadline) || Date.now() >= options.deadline)) throw new CalendarExecutionError('calendar_deadline_reached');
  if (action === 'oauthStart' || !ACTIONS.includes(action)) throw new CalendarExecutionError('calendar_action_invalid');
  const target = new URL(url), method = init?.method || 'GET';
  const expectedMethod = ({ tokenExchange:'POST',tokenRefresh:'POST',calendarRead:'GET',eventCreate:'POST',eventUpdate:'PATCH',eventDelete:'DELETE',workerDispatch:'POST' })[action];
  const dataPath = options.targetId && `/calendar/v3/calendars/${encodeURIComponent(options.targetId)}/events`;
  const expectedEventId = options.bookingId && `mc${hash(`machinesandcloud:calendar:v1:${calendarExecutionIdentity(c)}:${options.bookingId}`)}`;
  let createId; try { createId = action === 'eventCreate' ? JSON.parse(init.body)?.id : null; } catch { throw new CalendarExecutionError('calendar_transport_invalid'); }
  const eventPath = dataPath && expectedEventId && (action === 'eventCreate' ? target.pathname === dataPath && createId === expectedEventId : target.pathname === `${dataPath}/${expectedEventId}`);
  const calendarPath = target.origin === 'https://www.googleapis.com' && (action === 'calendarRead' && target.pathname === '/calendar/v3/calendars/primary' || eventPath);
  const deliveryAction = action === 'tokenRefresh' || action === 'workerDispatch' || !!eventPath;
  if (process.env.CALENDAR_CONNECTION_ENABLED !== 'true' || deliveryAction && (process.env.CALENDAR_DELIVERY_ENABLED !== 'true' || (process.env.SERVICE_WORKER_KEY || '').length < 32)) throw new CalendarExecutionError('calendar_gate_closed');
  const site = new URL(process.env.PUBLIC_SITE_URL || process.env.URL || 'https://machinesandcloud.com');
  if (target.username || target.password || target.hash || method !== expectedMethod || !(action === 'tokenExchange' || action === 'tokenRefresh' ? target.href === 'https://oauth2.googleapis.com/token' : action === 'workerDispatch' ? target.origin === site.origin && target.pathname === '/api/calendar-delivery-background' && !target.search : calendarPath)) throw new CalendarExecutionError('calendar_transport_invalid');
  const receipt = await reserveCalendarExecution(c, action, options);
  await assertCalendarExecution(c, { ...options, receipt });
  if (options.deadline !== undefined && Date.now() >= options.deadline) throw new CalendarExecutionError('calendar_deadline_reached');
  if (process.env.CALENDAR_CONNECTION_ENABLED !== 'true' || deliveryAction && (process.env.CALENDAR_DELIVERY_ENABLED !== 'true' || (process.env.SERVICE_WORKER_KEY || '').length < 32)) throw new CalendarExecutionError('calendar_gate_closed');
  // Redirects could create uncounted requests or replay credentials to another host.
  return fetch(url, { ...init, redirect: 'error' });
}
