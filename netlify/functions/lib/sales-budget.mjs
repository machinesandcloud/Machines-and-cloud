// Public sales chat has its own strict allowance, independent of tenant AI allowances.
// An accepted logical turn stays charged after failure; this is not a monetary spend ceiling.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { addDays, houstonToday, isoDateValid } from './availability.mjs';

export const SALES_BUDGET_KIND = 'sales_ai';
export const SALES_BUDGET_KEY = 'daily';
const timezone = 'America/Chicago';
const integer = n => Number.isInteger(n) && n >= 0;
function limit(name, fallback, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) > maximum) throw new Error('Invalid sales AI allowance configuration');
  return Number(raw); // Zero is a kill switch; malformed values fail closed.
}
function limits() {
  return { global: limit('MC_SALES_AI_GLOBAL_DAILY_LIMIT', 50, 500), ip: limit('MC_SALES_AI_IP_DAILY_LIMIT', 20, 100) };
}
function ipKey(ip) {
  if (typeof ip !== 'string' || ip.length > 128 || /[\u0000-\u001f]/.test(ip)) throw new Error('Invalid sales IP bucket');
  // Netlify's context.ip is authoritative; a missing IP shares one restricted bucket.
  // A stable digest avoids raw addresses in this record, without claiming anonymization.
  return createHash('sha256').update('mc-sales-v1\0' + (ip.trim() || 'unknown')).digest('hex');
}
function resetAt(day) {
  const target = Date.parse(addDays(day, 1) + 'T00:00:00Z');
  let utc = target + 6 * 3600000;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let n = 0; n < 3; n++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(utc)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const difference = target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (!difference) return new Date(utc).toISOString();
    utc += difference;
  }
  throw new Error('Could not calculate sales AI reset');
}
function currentDay(previous, day) {
  if (previous !== null) {
    if (previous.version !== 1 || !isoDateValid(previous.day) || !integer(previous.used) || previous.used > 500 || !previous.ips || typeof previous.ips !== 'object' || Array.isArray(previous.ips)) throw new Error('Invalid sales AI allowance record');
    let used = 0;
    for (const [key, n] of Object.entries(previous.ips)) {
      if (!/^[a-f0-9]{64}$/.test(key) || !integer(n) || n < 1 || n > 100) throw new Error('Invalid sales AI IP count');
      used += n;
    }
    if (used !== previous.used) throw new Error('Inconsistent sales AI allowance record');
    if (previous.day > day) throw new Error('Sales AI allowance clock moved backwards');
  }
  return previous?.day === day ? previous : { version: 1, day, used: 0, ips: {} };
}
function allowance(state, key, configured) {
  const own = Object.hasOwn(state.ips, key) ? state.ips[key] : 0;
  const remaining = Math.max(0, Math.min(configured.global - state.used, configured.ip - own));
  return { available: remaining > 0, remaining, resetAt: resetAt(state.day), timezone };
}
export async function getSalesAllowance(ip = '') {
  const key = ipKey(ip);
  return atomicUpdate(SALES_BUDGET_KIND, SALES_BUDGET_KEY, previous => {
    const day = houstonToday(); // Recomputed after every strong read, including a CAS retry.
    return { result: allowance(currentDay(previous, day), key, limits()) };
  });
}
export async function reserveSalesTurn(ip = '') {
  const key = ipKey(ip);
  return atomicUpdate(SALES_BUDGET_KIND, SALES_BUDGET_KEY, previous => {
    const at = new Date(), day = houstonToday(at), configured = limits();
    const state = currentDay(previous, day), before = allowance(state, key, configured);
    if (!before.available) return { result: { allowed: false, allowance: before } };
    const next = { ...state, used: state.used + 1, ips: { ...state.ips, [key]: (state.ips[key] || 0) + 1 }, updatedAt: at.toISOString() };
    return { value: next, result: { allowed: true, allowance: allowance(next, key, configured) } };
  });
}
