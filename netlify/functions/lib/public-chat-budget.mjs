// Daily model-turn allowance for the homepage practice personas and legacy client website chat.
// Same strict CAS pattern as sales-budget.mjs: one document per pool arbitrates a global ceiling
// and a per-network ceiling (IPv4 address or IPv6 /64). An admitted turn stays charged after
// failure. This is a request-start bound, not a monetary ceiling. Zero is a kill switch;
// malformed configuration or records fail closed.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { houstonToday, isoDateValid } from './availability.mjs';
import { networkBucket } from './network-bucket.mjs';

export const PUBLIC_CHAT_BUDGET_KIND = 'public_chat_ai';
const POOLS = {
  practice: { global: ['MC_PRACTICE_AI_GLOBAL_DAILY_LIMIT', 200, 5000], ip: ['MC_PRACTICE_AI_IP_DAILY_LIMIT', 30, 1000] },
  legacy: { global: ['MC_LEGACY_CHAT_AI_GLOBAL_DAILY_LIMIT', 300, 5000], ip: ['MC_LEGACY_CHAT_AI_IP_DAILY_LIMIT', 40, 1000] },
};
const integer = n => Number.isInteger(n) && n >= 0;
function limit([name, fallback, maximum]) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) > maximum) throw new Error('Invalid public chat AI allowance configuration');
  return Number(raw);
}
function poolConfig(pool) {
  if (!Object.hasOwn(POOLS, pool)) throw new Error('Invalid public chat AI pool');
  return { global: limit(POOLS[pool].global), ip: limit(POOLS[pool].ip), maxGlobal: POOLS[pool].global[2], maxIp: POOLS[pool].ip[2] };
}
const bucketKey = ip => createHash('sha256').update('mc-public-chat-v1\0' + networkBucket(ip)).digest('hex');
function currentDay(previous, day, configured) {
  if (previous !== null) {
    if (previous.version !== 1 || !isoDateValid(previous.day) || !integer(previous.used) || previous.used > configured.maxGlobal || !previous.ips || typeof previous.ips !== 'object' || Array.isArray(previous.ips)) throw new Error('Invalid public chat AI allowance record');
    let used = 0;
    for (const [key, n] of Object.entries(previous.ips)) {
      if (!/^[a-f0-9]{64}$/.test(key) || !integer(n) || n < 1 || n > configured.maxIp) throw new Error('Invalid public chat AI network count');
      used += n;
    }
    if (used !== previous.used) throw new Error('Inconsistent public chat AI allowance record');
    if (previous.day > day) throw new Error('Public chat AI allowance clock moved backwards');
  }
  return previous?.day === day ? previous : { version: 1, day, used: 0, ips: {} };
}
export async function reservePublicChatTurn(pool, ip = '') {
  const key = bucketKey(ip);
  return atomicUpdate(PUBLIC_CHAT_BUDGET_KIND, 'daily:' + pool, previous => {
    const at = new Date(), day = houstonToday(at), configured = poolConfig(pool); // Recomputed on every CAS retry.
    const state = currentDay(previous, day, configured), own = Object.hasOwn(state.ips, key) ? state.ips[key] : 0;
    const remaining = Math.max(0, Math.min(configured.global - state.used, configured.ip - own));
    if (remaining <= 0) return { result: { allowed: false } };
    return { value: { ...state, used: state.used + 1, ips: { ...state.ips, [key]: own + 1 }, updatedAt: at.toISOString() }, result: { allowed: true, remaining: remaining - 1 } };
  });
}
