// Closed-phase transport diagnosis only. Import/default CLI has no effects.
import { createHash } from 'node:crypto';
import { readFile, open, mkdir, lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCOPE = 'closed_calendar_budget_readonly_20261024_v1';
export const TARGET = Object.freeze({
  siteId: 'f87916f1-bcc4-4171-a96f-2900cbf0b6dc',
  store: 'calendar_execution_budgets',
  key: 'calendar-v1:owned_calendar_busy_20261024_v1',
  policyDigest: 'b331bc40a5f4613b7fe172385b6e298cf1b031566783ba76e7b8a81b04e81c58'
});
export const LOOKUP = new URL(`/api/v1/blobs/${TARGET.siteId}/site:${TARGET.store}/${TARGET.key}`, 'https://api.netlify.com').href;
export const LEDGER = '/tmp/mc-calendar-budget-readonly-20261024-v1/attempts.jsonl';
const SELF = fileURLToPath(import.meta.url);
const HEX = /^[a-f0-9]{64}$/;
const LIMITS = Object.freeze({ oauthStart: 1, tokenExchange: 1, tokenRefresh: 16, calendarRead: 28,
  eventCreate: 1, eventUpdate: 1, eventDelete: 2, workerDispatch: 8, totalRequests: 57 });
const sha = value => createHash('sha256').update(value).digest('hex');
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
class Refusal extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new Refusal(code); };

export function plan() {
  return { scope: SCOPE, mode: 'plan', executes: false, target: TARGET, lookup: LOOKUP,
    maxPhysicalGETs: 2, ledger: LEDGER, closedPhaseRemainsClosed: true,
    requires: 'Fresh explicit approval bound to this script hash; no prior allowance is reused.' };
}

export function validateApproval(packet, scriptSHA256, now) {
  if (!exact(packet, ['version', 'scope', 'phaseId', 'approved', 'approvalId', 'approvedAt',
    'approvalExpiresAt', 'scriptSHA256', 'target', 'maxPhysicalGETs', 'ledger']) ||
    packet.version !== 1 || packet.scope !== SCOPE || packet.phaseId !== 'calendar-budget-diagnosis-20261024-v1' ||
    packet.approved !== true || !/^approval-[A-Za-z0-9-]{4,100}$/.test(packet.approvalId || '') ||
    packet.scriptSHA256 !== scriptSHA256 || !HEX.test(scriptSHA256) ||
    !exact(packet.target, Object.keys(TARGET)) || Object.entries(TARGET).some(([key, value]) => packet.target[key] !== value) ||
    packet.maxPhysicalGETs !== 2 || packet.ledger !== LEDGER ||
    !Number.isFinite(Date.parse(packet.approvedAt)) || Date.parse(packet.approvedAt) > now ||
    !Number.isFinite(Date.parse(packet.approvalExpiresAt)) || Date.parse(packet.approvalExpiresAt) <= now ||
    Date.parse(packet.approvalExpiresAt) - Date.parse(packet.approvedAt) > 3600000) fail('fresh_exact_approval_required');
}

export function validateSignedURL(value, now) {
  let url;
  try { url = new URL(value); } catch { fail('signed_url_invalid'); }
  if (typeof value !== 'string' || value.length > 16384 || url.protocol !== 'https:' || url.username || url.password ||
    url.hash || url.port && url.port !== '443' || !/(?:^|\.)(?:amazonaws\.com|cloudfront\.net|netlify\.com|netlify\.app|storage\.googleapis\.com)$/.test(url.hostname)) fail('signed_url_unsafe');
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) fail('signed_url_ambiguous');
  const aws = url.searchParams.has('X-Amz-Signature'), google = url.searchParams.has('X-Goog-Signature');
  if (aws && google) fail('signed_url_ambiguous');
  if (aws || google) {
    const prefix = aws ? 'X-Amz' : 'X-Goog', date = url.searchParams.get(prefix + '-Date') || '',
      seconds = Number(url.searchParams.get(prefix + '-Expires')), signature = url.searchParams.get(prefix + '-Signature') || '';
    if (!/^\d{8}T\d{6}Z$/.test(date) || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 3600 || !/^[a-f0-9]{32,1024}$/i.test(signature)) fail('signed_url_expiry');
    const start = Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${date.slice(9,11)}:${date.slice(11,13)}:${date.slice(13,15)}Z`);
    if (!Number.isFinite(start) || start > now + 60000 || start + seconds * 1000 <= now) fail('signed_url_expired');
  } else {
    const expiry = Number(url.searchParams.get('Expires'));
    if (!Number.isSafeInteger(expiry) || expiry * 1000 <= now || expiry * 1000 > now + 3600000 || !url.searchParams.get('Signature')) fail('signed_url_expiry');
  }
  return url.href;
}

async function boundedJSON(response) {
  if (Number(response.headers.get('content-length')) > 65536) fail('response_too_large');
  const reader = response.body?.getReader();
  if (!reader) fail('response_missing');
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) { await reader.cancel(); fail('response_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('response_json_invalid'); }
}

function projectBudget(row) {
  if (!object(row) || row.version !== 1 || row.policyDigest !== TARGET.policyDigest || !exact(row.used, Object.keys(LIMITS)) ||
    Object.entries(row.used).some(([key, count]) => !Number.isSafeInteger(count) || count < 0 || count > LIMITS[key]) ||
    row.used.totalRequests !== Object.keys(LIMITS).filter(key => !['oauthStart', 'totalRequests'].includes(key)).reduce((sum, key) => sum + row.used[key], 0)) fail('budget_record_mismatch');
  return { status: 'found', policyDigest: row.policyDigest,
    used: Object.fromEntries(Object.keys(LIMITS).map(key => [key, row.used[key]])) };
}

// Every dependency is explicit. Offline tests use synthetic transport/persistence/token.
// This function neither reads native credentials nor supplies a network default.
export async function diagnose({ transport, token, append, now, stillApproved }) {
  if (typeof transport !== 'function' || typeof append !== 'function' || typeof now !== 'function' || typeof stillApproved !== 'function' ||
    typeof token !== 'string' || !token || token.length > 8192 || /[\r\n]/.test(token)) fail('diagnostic_dependencies');
  let attempts = 0;
  const get = async (kind, url, headers) => {
    stillApproved();
    if (attempts >= 2) fail('attempt_limit');
    await append({ type: 'reserved', attempt: ++attempts, kind, method: 'GET', at: new Date(now()).toISOString() });
    let response;
    try { response = await transport(url, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
    catch { fail('transport_unknown'); }
    await append({ type: 'observed', attempt: attempts, kind, status: response.status, at: new Date(now()).toISOString() });
    if (response.status !== 200) fail(`${kind}_http_${response.status}`);
    return response;
  };
  try {
    const lookup = await get('lookup', LOOKUP, { authorization: `Bearer ${token}`, accept: 'application/json;type=signed-url' });
    const signed = await boundedJSON(lookup);
    if (!exact(signed, ['url'])) fail('lookup_response_contract');
    const url = validateSignedURL(signed.url, now());
    const record = await get('record', url, {}); // Never forward the native credential, cookies or authorization.
    const result = projectBudget(await boundedJSON(record));
    await append({ type: 'closed', result: result.status, attempts, at: new Date(now()).toISOString() });
    return { ...result, attempts };
  } catch (error) {
    const code = error instanceof Refusal ? error.code : 'diagnostic_failure';
    await append({ type: 'closed', result: 'failed', code, attempts, at: new Date(now()).toISOString() });
    return { status: 'failed', code, attempts };
  }
}

export async function exclusiveLedger(path) {
  const dir = dirname(path);
  await mkdir(dir, { mode: 0o700, recursive: false }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const dirStat = await lstat(dir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || (dirStat.mode & 0o777) !== 0o700 || dirStat.uid !== process.getuid()) fail('ledger_directory_permissions');
  const handle = await open(path, 'wx', 0o600); // Never reset, append to or resume an existing diagnostic run.
  const directory = await open(dir, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
  let poisoned = false;
  return {
    async append(row) {
      if (poisoned) fail('ledger_poisoned');
      try { await handle.writeFile(JSON.stringify(row) + '\n'); await handle.sync(); }
      catch { poisoned = true; fail('ledger_persistence_failure'); }
    },
    close: () => handle.close()
  };
}

async function execute(packetPath, expectedPacketHash) {
  if (!HEX.test(expectedPacketHash || '') || !packetPath || !resolve(packetPath).startsWith('/tmp/')) fail('private_packet_required');
  const stat = await lstat(packetPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid() || stat.size > 20000) fail('packet_file_permissions');
  const raw = await readFile(packetPath), packet = JSON.parse(raw);
  if (sha(raw) !== expectedPacketHash) fail('packet_digest');
  const scriptHash = sha(await readFile(SELF));
  const stillApproved = () => validateApproval(packet, scriptHash, Date.now());
  stillApproved();
  const ledger = await exclusiveLedger(LEDGER), append = row => ledger.append(row);
  try {
    await append({ type: 'opened', scope: SCOPE, scriptSHA256: scriptHash, approvalPacketSHA256: expectedPacketHash, maxPhysicalGETs: 2, at: new Date().toISOString() });
    // This is the only native credential read, after exact approval and exclusive durable ledger creation.
    let token;
    try {
      const config = JSON.parse(await readFile(resolve(homedir(), 'Library/Preferences/netlify/config.json'), 'utf8'));
      const user = config.users?.[config.userId]; token = user?.auth?.token || user?.token;
      if (typeof token !== 'string' || !token || token.length > 8192 || /[\r\n]/.test(token)) fail('native_auth_unavailable');
    } catch {
      await append({ type: 'closed', result: 'failed', code: 'native_auth_unavailable', attempts: 0, at: new Date().toISOString() });
      return { status: 'failed', code: 'native_auth_unavailable', attempts: 0 };
    }
    return await diagnose({ transport: globalThis.fetch, token, append, now: () => Date.now(), stillApproved });
  } finally { await ledger.close(); }
}

async function main(args) {
  if (args.length === 0) { process.stdout.write(JSON.stringify(plan()) + '\n'); return; }
  if (args.length !== 3 || args[0] !== '--execute') fail('usage');
  const result = await execute(args[1], args[2]);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.status !== 'found') process.exitCode = 1;
}
if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === SELF) main(process.argv.slice(2)).catch(error => {
  process.stdout.write(JSON.stringify({ status: 'refused', code: error instanceof Refusal ? error.code : 'execution_refused' }) + '\n');
  process.exitCode = 1;
});
