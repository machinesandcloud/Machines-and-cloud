// New-workspace AI allowance. Counts accepted logical turns, including failed/ambiguous attempts.
// One CAS document arbitrates the shared ceiling across tenants and both chat modes.
import { atomicUpdate } from './store.mjs';
import { workspaceTenant } from './workspace-identity.mjs';
import { addDays, houstonToday } from './availability.mjs';
export const AI_BUDGET_KIND = 'self_service_ai';
export const AI_BUDGET_KEY = 'daily';
const PRIVATE_LIMIT = 20, WEB_LIMIT = 50;
const zone = 'America/Chicago';
const integer = n => Number.isInteger(n) && n >= 0;
function globalLimit() {
  const raw = process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT;
  if (raw === undefined || raw === '') return 50;
  if (!/^\d+$/.test(raw) || Number(raw) > 500) throw new Error('Invalid self-service AI limit');
  return Number(raw); // Zero is the operator kill switch; invalid configuration fails closed.
}
function tenantSlug(client) {
  if (client?.onboarding?.version !== 1 || !/^[a-z0-9-]{1,40}$/.test(client.slug || '')) throw new Error('Invalid self-service AI tenant');
  return client.slug;
}
function resetAt(day) {
  const tomorrow = addDays(day, 1), target = Date.parse(tomorrow + 'T00:00:00Z');
  let utc = target + 6 * 3600000;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let n = 0; n < 3; n++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(utc)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const difference = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (!difference) return new Date(utc).toISOString();
    utc += difference;
  }
  throw new Error('Could not calculate AI allowance reset');
}
function currentDay(previous, day) {
  if (previous !== null) {
    if (previous.version !== 1 || typeof previous.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(previous.day) || !integer(previous.used) || previous.used > 500 || !previous.tenants || typeof previous.tenants !== 'object' || Array.isArray(previous.tenants)) throw new Error('Invalid AI allowance record');
    let total = 0;
    for (const row of Object.values(previous.tenants)) {
      if (!row || !integer(row.private) || !integer(row.web) || row.private > PRIVATE_LIMIT || row.web > WEB_LIMIT) throw new Error('Invalid tenant AI allowance');
      total += row.private + row.web;
    }
    if (total !== previous.used) throw new Error('Inconsistent AI allowance record');
  }
  if (previous && previous.day > day) throw new Error('AI allowance clock moved backwards');
  return previous?.day === day ? previous : { version: 1, day, used: 0, tenants: {} };
}
function allowance(state, slug, key, global) {
  const own = Object.hasOwn(state.tenants, key) ? state.tenants[key] : { private: 0, web: 0 };
  const legacy = Object.hasOwn(state.tenants, slug) ? state.tenants[slug] : { private: 0, web: 0 };
  const shared = Math.max(0, global - state.used);
  const privateRemaining = Math.min(Math.max(0, PRIVATE_LIMIT - own.private - legacy.private), shared), webRemaining = Math.min(Math.max(0, WEB_LIMIT - own.web - legacy.web), shared);
  return { private: { limit: PRIVATE_LIMIT, used: own.private, remaining: privateRemaining }, web: { limit: WEB_LIMIT, used: own.web, remaining: webRemaining }, available: webRemaining > 0, resetAt: resetAt(state.day), timezone: zone, ...((legacy.private || legacy.web) ? { reconciliation: 'A prior unverified allowance reservation is retained until the daily reset. Remaining availability already includes this safety hold.' } : {}) };
}
export async function getAIAllowance(client) {
  const slug = tenantSlug(client), key = `${slug}:${workspaceTenant(client)}`;
  return atomicUpdate(AI_BUDGET_KIND, AI_BUDGET_KEY, previous => {
    const day = houstonToday(); // Compute after each strong read, including CAS retries.
    return { result: allowance(currentDay(previous, day), slug, key, globalLimit()) };
  });
}
export async function reserveAIRequest(client, mode) {
  const slug = tenantSlug(client), key = `${slug}:${workspaceTenant(client)}`;
  if (mode !== 'private' && mode !== 'web') throw new Error('Invalid AI mode');
  return atomicUpdate(AI_BUDGET_KIND, AI_BUDGET_KEY, previous => {
    const at = new Date(), day = houstonToday(at), global = globalLimit();
    const state = currentDay(previous, day), before = allowance(state, slug, key, global);
    if (before[mode].remaining <= 0) return { result: { allowed: false, aiAllowance: before } };
    const own = Object.hasOwn(state.tenants, key) ? state.tenants[key] : { private: 0, web: 0 };
    const next = { ...state, used: state.used + 1, tenants: { ...state.tenants, [key]: { ...own, [mode]: own[mode] + 1 } }, updatedAt: at.toISOString() };
    return { value: next, result: { allowed: true, aiAllowance: allowance(next, slug, key, global) } };
  });
}
