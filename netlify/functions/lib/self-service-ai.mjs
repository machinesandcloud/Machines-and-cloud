// New-workspace AI allowance. Counts accepted logical turns, including failed/ambiguous attempts.
// One CAS document arbitrates both global pools across tenants: customer chat (web) and owner practice (private).
import { atomicUpdate } from './store.mjs';
import { assertPaidServiceAuthority } from './paid-service-authority.mjs';
import { workspaceTenant, supportedWorkspace } from './workspace-identity.mjs';
import { addDays, houstonToday } from './availability.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { networkBucket } from './network-bucket.mjs';
export const AI_BUDGET_KIND = 'self_service_ai';
export const AI_BUDGET_KEY = 'daily';
const PRIVATE_LIMIT = 20, WEB_LIMIT = 50, GLOBAL_MAX = 500;
const zone = 'America/Chicago';
const integer = n => Number.isInteger(n) && n >= 0;
function globalLimit() {
  const raw = process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT;
  if (raw === undefined || raw === '') return 50;
  if (!/^\d+$/.test(raw) || Number(raw) > GLOBAL_MAX) throw new Error('Invalid self-service AI limit');
  return Number(raw); // Zero is the operator kill switch; invalid configuration fails closed.
}
// Owner practice has its own share carved out of the global daily limit (PRA-DESK-11), so practice never lowers
// customer chat capacity and MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT still bounds every turn (practice + customer <= global).
// Recommended default share: one fifth of the global limit, at least two shops' 20 (one shop's full practice still
// leaves a second shop its activation test), never more than half: 25 practice / 25 customer at the default 50,
// 100 practice / 400 customer at the production 500 (five shops' full practice).
// MC_SELF_SERVICE_AI_PRACTICE_DAILY_LIMIT (0..500) overrides the share and is capped at half the global limit, so a
// practice setting can never close customer chat. An invalid value closes practice only. Zero global stops both kinds of turn.
function practiceLimit(global) {
  const raw = process.env.MC_SELF_SERVICE_AI_PRACTICE_DAILY_LIMIT, half = Math.floor(global / 2);
  if (global === 0) return 0;
  if (raw === undefined || raw === '') return Math.min(half, Math.max(2 * PRIVATE_LIMIT, Math.floor(global / 5)));
  if (!/^\d+$/.test(raw) || Number(raw) > 500) return 0;
  return Math.min(Number(raw), half);
}
// The customer (web) pool after the practice carve-out; proposal 15's public reserve and per-network share are taken from it.
const customerLimit = global => global - practiceLimit(global);
// Anonymous public website turns are additionally bounded per caller network (IPv4 address or
// IPv6 /64), and together they may not use the last PRIVATE_RESERVE turns of the customer chat
// pool (the global limit less the practice share), so one public source cannot close website chat for every
// tenant and anonymous traffic cannot take signed-in or managed voice/SMS turns offline. Owner practice has its
// own share (practiceLimit) and is never reached by public traffic. The reserve is at most half the global pool, so lowering the
// global limit as a throttle never silently closes public chat. Owner-private, managed voice/SMS and per-tenant limits are unchanged.
function boundedEnv(name, fallback, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) > maximum) throw new Error('Invalid self-service AI limit');
  return Number(raw);
}
const privateReserve = global => Math.min(Math.floor(global / 2), boundedEnv('MC_SELF_SERVICE_AI_PRIVATE_RESERVE', 10, 500));
// A network's daily share is a fraction of the anonymous pool (default 75%, at most 90%), further capped by an
// absolute count (default 150). With the default share one source leaves at least a quarter of the pool to every other
// network, and one long conversation, or several visitors behind one NAT, is not cut off by a small fixed count. The
// share follows the global limit when the owner raises it. Zero for either is a kill switch; a pool too small for the
// share to reach one turn still admits one turn per network rather than closing public chat.
function publicIpLimit(global) {
  const absolute = boundedEnv('MC_SELF_SERVICE_AI_PUBLIC_IP_DAILY_LIMIT', 150, 500), percent = boundedEnv('MC_SELF_SERVICE_AI_PUBLIC_IP_POOL_PERCENT', 75, 90);
  if (!absolute || !percent) return 0;
  const pool = customerLimit(global);
  return Math.min(absolute, Math.max(1, Math.floor((pool - privateReserve(pool)) * percent / 100)));
}
const publicKey = ip => createHash('sha256').update('mc-self-service-public-v1\0' + networkBucket(ip)).digest('hex');
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
    if (previous.publicIps !== undefined) {
      if (!previous.publicIps || typeof previous.publicIps !== 'object' || Array.isArray(previous.publicIps)) throw new Error('Invalid public AI allowance record');
      let publicTotal = 0;
      for (const [key, n] of Object.entries(previous.publicIps)) {
        if (!/^[a-f0-9]{64}$/.test(key) || !integer(n) || n < 1 || n > 500) throw new Error('Invalid public AI network count');
        publicTotal += n;
      }
      if (publicTotal > previous.used) throw new Error('Inconsistent public AI allowance record');
    }
  }
  if (previous && previous.day > day) throw new Error('AI allowance clock moved backwards');
  return previous?.day === day ? previous : { version: 1, day, used: 0, tenants: {} };
}
function allowance(state, slug, key, global) {
  const own = Object.hasOwn(state.tenants, key) ? state.tenants[key] : { private: 0, web: 0 };
  const legacy = Object.hasOwn(state.tenants, slug) ? state.tenants[slug] : { private: 0, web: 0 };
  let privateUsed = 0, webUsed = 0;
  for (const row of Object.values(state.tenants)) { privateUsed += row.private; webUsed += row.web; }
  const practice = practiceLimit(global), practicePool = Math.max(0, practice - privateUsed), customerPool = Math.max(0, global - practice - webUsed);
  const privateOwn = Math.max(0, PRIVATE_LIMIT - own.private - legacy.private), webOwn = Math.max(0, WEB_LIMIT - own.web - legacy.web);
  const privateRemaining = Math.min(privateOwn, practicePool), webRemaining = Math.min(webOwn, customerPool);
  // PRA-OPS-06: say when the shared platform pool, not this shop's own daily allowance, is what closed a kind of turn.
  // A pool configured to 0 (practice env 0 or invalid, or global 0) is switched off, not used up: never platformLimited.
  const platform = (ownLeft, remaining, poolLimit) => ownLeft > 0 && remaining === 0 && poolLimit > 0 ? { platformLimited: true } : {};
  return { private: { limit: PRIVATE_LIMIT, used: own.private, remaining: privateRemaining, ...platform(privateOwn, privateRemaining, practice) }, web: { limit: WEB_LIMIT, used: own.web, remaining: webRemaining, ...platform(webOwn, webRemaining, global - practice) }, available: webRemaining > 0, resetAt: resetAt(state.day), timezone: zone, ...((legacy.private || legacy.web) ? { reconciliation: 'A prior unverified allowance reservation is retained until the daily reset. Remaining availability already includes this safety hold.' } : {}) };
}
// PRA-OPS-06: platform-wide usage for the operator System view. Read-only (never writes the daily record).
// `warning` is set from 80% of either shared pool so the operator can raise MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT in time.
export const AI_CAPACITY_WARNING_RATIO = 0.8;
export async function getAIPlatformUsage() {
  return atomicUpdate(AI_BUDGET_KIND, AI_BUDGET_KEY, previous => {
    const day = houstonToday(), state = currentDay(previous, day), global = globalLimit(), practice = practiceLimit(global), customer = global - practice;
    let practiceUsed = 0, customerUsed = 0, shops = 0;
    for (const row of Object.values(state.tenants)) { practiceUsed += row.private; customerUsed += row.web; if (row.private || row.web) shops++; }
    const publicUsed = Object.values(state.publicIps || {}).reduce((n, v) => n + v, 0);
    const level = (used, limit) => limit === 0 ? 'off' : used >= limit ? 'exhausted' : used >= Math.ceil(limit * AI_CAPACITY_WARNING_RATIO) ? 'warning' : 'ok';
    const pools = { practice: { limit: practice, used: Math.min(practiceUsed, practice), level: level(practiceUsed, practice) }, customer: { limit: customer, used: Math.min(customerUsed, customer), level: level(customerUsed, customer) } };
    const rank = { off: 0, ok: 1, warning: 2, exhausted: 3 }, worst = [pools.practice.level, pools.customer.level].sort((a, b) => rank[b] - rank[a])[0];
    return { result: { day: state.day, resetAt: resetAt(state.day), timezone: zone, global, maxGlobal: GLOBAL_MAX, shopsUsing: shops, publicUsed, perShop: { practice: PRIVATE_LIMIT, customer: WEB_LIMIT }, ...pools, level: global === 0 ? 'off' : worst } };
  });
}
export async function getAIAllowance(client) {
  const slug = tenantSlug(client), key = `${slug}:${workspaceTenant(client)}`;
  const current = await atomicUpdate(AI_BUDGET_KIND, AI_BUDGET_KEY, previous => {
    const day = houstonToday(); // Compute after each strong read, including CAS retries.
    return { result: allowance(currentDay(previous, day), slug, key, globalLimit()) };
  });
  return projectProofAllowance(client, current);
}
// The anonymous public pool is closed for this caller when its own network has used its daily share,
// or when all anonymous turns together have reached the customer chat pool less the reserve.
function publicClosed(state, network, global) {
  const publicIps = state.publicIps || {};
  return (Object.hasOwn(publicIps, network) ? publicIps[network] : 0) >= publicIpLimit(global) || Object.values(publicIps).reduce((n, v) => n + v, 0) >= customerLimit(global) - privateReserve(customerLimit(global));
}
// True when a fresh Houston day would admit this caller under the current configuration, i.e. the closure
// is only today's counters. A zero kill switch (global or per-network) does not reopen at midnight.
function reopensTomorrow(day, slug, key, network, global) {
  const fresh = { version: 1, day, used: 0, tenants: {} };
  return allowance(fresh, slug, key, global).available && !(network && publicClosed(fresh, network, global));
}
// One wording for a public website turn closed by the daily counters, used by the 429 refusal and (as a
// fixed copy in embed.js) by the widget's closed state. Every counter behind it resets at Houston midnight.
export const PUBLIC_WEB_DAILY_CLOSED = "Website chat has reached today's limit and reopens after midnight, Houston time. Please contact the shop directly.";
// Public widget availability for an anonymous caller: the same tenant/global decision plus the
// anonymous pool and the caller's own network, from one strong read. It reveals nothing about other networks.
// `closed: 'daily_limit'` is set only when the daily counters close it and the proof envelope (if any) would not,
// so the widget can say it reopens at the daily reset; a proof-envelope closure keeps the generic wording.
export async function getPublicAIAllowance(client, ip) {
  const slug = tenantSlug(client), key = `${slug}:${workspaceTenant(client)}`, network = publicKey(ip);
  const current = await atomicUpdate(AI_BUDGET_KIND, AI_BUDGET_KEY, previous => {
    const global = globalLimit(), state = currentDay(previous, houstonToday()), view = allowance(state, slug, key, global);
    const closed = view.available && publicClosed(state, network, global) ? { ...view, available: false } : view;
    return { result: closed.available ? closed : { ...closed, reopens: reopensTomorrow(state.day, slug, key, network, global) } };
  });
  const { reopens, ...counted } = current;
  const projected = await projectProofAllowance(client, { ...counted, available: true });
  return counted.available ? projected : { ...projected, available: false, ...(projected.available && reopens ? { closed: 'daily_limit' } : {}) };
}
// `ip` is passed only for anonymous public website turns; it adds the per-network sub-limit.
export async function reserveAIRequest(client, mode, {service='web',ip}={}) {
  if(mode==='web'&&service!=='web')await assertPaidServiceAuthority(client,service);
  const slug = tenantSlug(client), key = `${slug}:${workspaceTenant(client)}`;
  if (mode !== 'private' && mode !== 'web') throw new Error('Invalid AI mode');
  const current = await atomicUpdate(AI_BUDGET_KIND, AI_BUDGET_KEY, previous => {
    const at = new Date(), day = houstonToday(at), global = globalLimit();
    const state = currentDay(previous, day), before = allowance(state, slug, key, global);
    const network = ip === undefined || mode !== 'web' ? null : publicKey(ip), publicIps = state.publicIps || {};
    if (before[mode].remaining <= 0 || network && publicClosed(state, network, global)) return { result: { allowed: false, aiAllowance: before, reopens: mode === 'web' && reopensTomorrow(day, slug, key, network, global) } };
    const own = Object.hasOwn(state.tenants, key) ? state.tenants[key] : { private: 0, web: 0 };
    const next = { ...state, used: state.used + 1, tenants: { ...state.tenants, [key]: { ...own, [mode]: own[mode] + 1 } }, ...(network ? { publicIps: { ...publicIps, [network]: (publicIps[network] || 0) + 1 } } : {}), updatedAt: at.toISOString() };
    return { value: next, result: { allowed: true, aiAllowance: allowance(next, slug, key, global) } };
  });
  if (!current.allowed) {
    // `closed: 'daily_limit'` only when the next Houston day reopens it and the proof envelope (if any) would admit.
    const { reopens, ...refused } = current;
    return reopens && (await projectProofAllowance(client, { ...refused.aiAllowance, available: true })).available ? { ...refused, closed: 'daily_limit' } : refused;
  }
  const proof = await reserveAIProofTurn(client, mode);
  return { ...current, ...(proof ? { proof } : {}), aiAllowance: await projectProofAllowance(client, current.aiAllowance) };
}

// Optional internal proof envelope, inside the existing tenant AI admission.
// A per-slug binding is permanent: removing configuration never restores normal
// admission for a workspace that has entered this bounded internal phase.
const PROOF_STORE = 'self_service_ai_proofs', PROOF_MODEL = 'claude-opus-5-5';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const bounded = (value, limit) => Number.isSafeInteger(value) && value >= 0 && value <= limit;
export class AIProofError extends Error {
  constructor(code) { super('This internal test workspace is waiting for its approved AI test allowance. Saved requests are retained.'); this.code = code; this.status = 503; }
}
const proofFail = code => { throw new AIProofError(code); };
export function selfServiceAIProofPolicy() {
  try {
    const p = JSON.parse(process.env.MC_SELF_SERVICE_AI_PROOF_POLICY_JSON || 'null');
    if (!exact(p, ['version','phaseId','expiresAt','tenant','model','maxOutputTokens','maxRequestBytes','limits']) || !/^[a-z0-9_-]{1,80}$/.test(p.version || '') || process.env.MC_SELF_SERVICE_AI_PROOF_APPROVED_VERSION !== p.version || !/^[a-z0-9_-]{1,100}$/.test(p.phaseId || '') || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= Date.now() || !exact(p.tenant, ['slug','identity','emailHash']) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(p.tenant.slug || '') || process.env.MC_SELF_SERVICE_AI_PROOF_SLUG !== p.tenant.slug || !hex(p.tenant.identity) || !hex(p.tenant.emailHash) || p.model !== PROOF_MODEL || !bounded(p.maxOutputTokens,1500) || !p.maxOutputTokens || !bounded(p.maxRequestBytes,120000) || !p.maxRequestBytes || !exact(p.limits,['logical','physical','ordinaryMutations','setupMutations']) || !bounded(p.limits.logical,10) || !bounded(p.limits.physical,30) || !bounded(p.limits.ordinaryMutations,1) || !bounded(p.limits.setupMutations,1)) return null;
    return { ...p, digest: digest(p) };
  } catch { return null; }
}
async function proofSelection(c) {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(c?.slug || '')) return null;
  const row = await strictRead(PROOF_STORE, c.slug);
  if (!supportedWorkspace(c)) { if(row || process.env.MC_SELF_SERVICE_AI_PROOF_SLUG === c.slug)proofFail('ai_proof_authority_changed');return null; }
  if (!row && process.env.MC_SELF_SERVICE_AI_PROOF_SLUG !== c.slug) return null;
  const p = selfServiceAIProofPolicy();
  if (!p || p.tenant.slug !== c.slug) proofFail('ai_proof_policy_unavailable');
  return { p, row };
}
function proofLedger(row, p) {
  if (row === null) return { version:1, phaseId:p.phaseId, tenant:p.tenant, initialPolicyDigest:p.digest, logical:{}, physical:{}, mutations:{}, createdAt:new Date().toISOString() };
  if (!exact(row,['version','phaseId','tenant','initialPolicyDigest','logical','physical','mutations','createdAt']) || row.version !== 1 || row.phaseId !== p.phaseId || digest(row.tenant) !== digest(p.tenant) || !hex(row.initialPolicyDigest) || !Number.isFinite(Date.parse(row.createdAt))) proofFail('ai_proof_binding_changed');
  for (const [kind, cap] of [['logical',10],['physical',30],['mutations',2]]) if (!row[kind] || typeof row[kind] !== 'object' || Array.isArray(row[kind]) || Object.keys(row[kind]).length > cap) proofFail('ai_proof_ledger_unavailable');
  for (const [id,r] of Object.entries(row.logical)) if (!hex(id) || !exact(r,['mode','policyDigest','at']) || !['private','web'].includes(r.mode) || !hex(r.policyDigest) || !Number.isFinite(Date.parse(r.at))) proofFail('ai_proof_ledger_unavailable');
  for (const [id,r] of Object.entries(row.physical)) if (!hex(id) || !exact(r,['turnId','policyDigest','bodyDigest','at']) || !row.logical[r.turnId] || !hex(r.policyDigest) || !hex(r.bodyDigest) || !Number.isFinite(Date.parse(r.at))) proofFail('ai_proof_ledger_unavailable');
  for (const [slot,r] of Object.entries(row.mutations)) if (!['ordinary','setup'].includes(slot) || !exact(r,['actionId','inputDigest','turnId','policyDigest','at']) || !hex(r.actionId) || !hex(r.inputDigest) || !row.logical[r.turnId] || !hex(r.policyDigest) || !Number.isFinite(Date.parse(r.at))) proofFail('ai_proof_ledger_unavailable');
  return row;
}
async function proofAuthority(c, p, receipt) {
  if (selfServiceAIProofPolicy()?.digest !== p.digest) proofFail('ai_proof_policy_changed');
  const current = await strictRead('clients', c.slug), owner = normalizeAccountEmail(current?.owner?.email);
  if (!supportedWorkspace(current) || workspaceTenant(c) !== p.tenant.identity || workspaceTenant(current) !== p.tenant.identity || !['testing','live'].includes(current.status) || !owner || normalizeAccountEmail(current.onboarding.verifiedEmail) !== owner || digest(owner) !== p.tenant.emailHash || (await strictRead('health','brake'))?.on === true) proofFail('ai_proof_authority_changed');
  if (receipt && (!exact(receipt,['phaseId','turnId','policyDigest','mode']) || receipt.phaseId !== p.phaseId || receipt.policyDigest !== p.digest || !hex(receipt.turnId) || !['private','web'].includes(receipt.mode))) proofFail('ai_proof_turn_changed');
  if (selfServiceAIProofPolicy()?.digest !== p.digest) proofFail('ai_proof_policy_changed');
}
async function reserveAIProofTurn(c, mode) {
  const selected = await proofSelection(c); if (!selected) return null;
  const { p } = selected; await proofAuthority(c,p);
  const turnId = randomBytes(32).toString('hex');
  await atomicUpdate(PROOF_STORE,c.slug,async previous => {
    await proofAuthority(c,p);const row=proofLedger(previous,p);
    if (Object.keys(row.logical).length >= p.limits.logical || Object.keys(row.physical).length >= p.limits.physical) proofFail('ai_proof_exhausted');
    return { value:{...row,logical:{...row.logical,[turnId]:{mode,policyDigest:p.digest,at:new Date().toISOString()}}} };
  });
  return { phaseId:p.phaseId,turnId,policyDigest:p.digest,mode };
}
async function proofTurn(c, receipt) {
  const selected=await proofSelection(c);if(!selected){if(receipt)proofFail('ai_proof_binding_missing');return null;}
  const {p}=selected;await proofAuthority(c,p,receipt);if(!receipt)proofFail('ai_proof_turn_required');
  const row=proofLedger(await strictRead(PROOF_STORE,c.slug),p),turn=row.logical[receipt.turnId];
  if(!turn || turn.mode!==receipt.mode || turn.policyDigest!==receipt.policyDigest)proofFail('ai_proof_turn_changed');
  return {p,row};
}
async function projectProofAllowance(c, allowance) {
  let selected;
  try { selected=await proofSelection(c);if(!selected)return allowance;await proofAuthority(c,selected.p);const row=proofLedger(selected.row,selected.p),logical=Math.max(0,selected.p.limits.logical-Object.keys(row.logical).length),physical=Math.max(0,selected.p.limits.physical-Object.keys(row.physical).length),remaining=physical>0?logical:0;return {...allowance,private:{...allowance.private,remaining:Math.min(allowance.private.remaining,remaining)},web:{...allowance.web,remaining:Math.min(allowance.web.remaining,remaining)},available:allowance.available&&remaining>0}; }
  catch(error) { if(!(error instanceof AIProofError))throw error;return {...allowance,private:{...allowance.private,remaining:0},web:{...allowance.web,remaining:0},available:false}; }
}
export async function selfServiceAIModelFetch(c, receipt, {service='web',mode='web',onDispatch}={}) {
  if(onDispatch!==undefined&&typeof onDispatch!=='function')throw new Error('Invalid model dispatch observer');
  const proof=await proofTurn(c,receipt),transport=globalThis.fetch;
  if(!proof){if(mode==='private'||service==='web')return undefined;return async(input,init={})=>{await assertPaidServiceAuthority(c,service);if(onDispatch)onDispatch();return transport(input,init);};}
  return async (input, init={}) => {
    if(mode!=='private'&&service!=='web')await assertPaidServiceAuthority(c,service);
    const selected=await proofTurn(c,receipt),p=selected?.p;if(!p)proofFail('ai_proof_binding_missing');
    const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url),method=(init.method||'GET').toUpperCase();
    if(url.origin!=='https://api.anthropic.com'||url.pathname!=='/v1/messages'||url.hash||url.username||url.password||[...url.searchParams.keys()].some(key=>key!=='beta')||url.searchParams.getAll('beta').length>1||url.searchParams.has('beta')&&url.searchParams.get('beta')!=='true'||method!=='POST'||typeof init.body!=='string'||Buffer.byteLength(init.body,'utf8')>p.maxRequestBytes)proofFail('ai_proof_transport_forbidden');
    let body;try{body=JSON.parse(init.body);}catch{proofFail('ai_proof_transport_forbidden');}
    if(body?.model!==p.model||!Number.isSafeInteger(body.max_tokens)||body.max_tokens<1||body.max_tokens>p.maxOutputTokens||body.stream!==true||Object.hasOwn(body,'fallbacks')||Object.hasOwn(body,'betas')||new Headers(init.headers).get('anthropic-beta')?.includes('server-side-fallback'))proofFail('ai_proof_model_forbidden');
    const attemptId=randomBytes(32).toString('hex');
    await atomicUpdate(PROOF_STORE,c.slug,async previous=>{await proofAuthority(c,p,receipt);const row=proofLedger(previous,p),turn=row.logical[receipt.turnId];if(!turn||turn.policyDigest!==receipt.policyDigest)proofFail('ai_proof_turn_changed');if(Object.keys(row.physical).length>=p.limits.physical)proofFail('ai_proof_exhausted');return {value:{...row,physical:{...row.physical,[attemptId]:{turnId:receipt.turnId,policyDigest:p.digest,bodyDigest:digest(init.body),at:new Date().toISOString()}}}};});
    await proofAuthority(c,p,receipt);
    if(selfServiceAIProofPolicy()?.digest!==p.digest)proofFail('ai_proof_policy_changed');
    if(mode!=='private'&&service!=='web')await assertPaidServiceAuthority(c,service);
    if(onDispatch)onDispatch();
    return transport(input,{...init,redirect:'error'});
  };
}
export async function reserveAIProofMutation(c, receipt, name, input, {contact,setupActionId}={}) {
  const selected=await proofTurn(c,receipt);if(!selected)return null;
  const {p}=selected;if(receipt.mode!=='web'||!['book_visit','notify_owner'].includes(name)||!input||typeof input!=='object'||Array.isArray(input)||Buffer.byteLength(JSON.stringify(input),'utf8')>8000||typeof contact!=='string'||contact.length>60||setupActionId!==undefined&&!hex(setupActionId))proofFail('ai_proof_mutation_forbidden');
  const slot=setupActionId?'setup':'ordinary',actionId=setupActionId||digest([p.phaseId,p.tenant.identity,'ordinary']),inputDigest=digest({name,input,contact,actionId});
  return atomicUpdate(PROOF_STORE,c.slug,async previous=>{await proofAuthority(c,p,receipt);const row=proofLedger(previous,p),turn=row.logical[receipt.turnId],old=row.mutations[slot];if(!turn||turn.policyDigest!==receipt.policyDigest)proofFail('ai_proof_turn_changed');if(old){if(old.actionId!==actionId||old.inputDigest!==inputDigest)proofFail('ai_proof_mutation_changed');return {result:old.actionId};}if(p.limits[slot==='setup'?'setupMutations':'ordinaryMutations']<1)proofFail('ai_proof_mutation_exhausted');return {value:{...row,mutations:{...row.mutations,[slot]:{actionId,inputDigest,turnId:receipt.turnId,policyDigest:p.digest,at:new Date().toISOString()}}},result:actionId};});
}
