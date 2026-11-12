// Platform health for operators (PRA-OPS-02): one interpretation of the saved
// scheduler record shared by /api/health, the admin payload and the operator alert.
//
// Fail-closed rules:
// - A health record that cannot be read is "unknown", never "healthy".
// - A missing or stale (>25 min) record is "degraded".
// - The alert email never includes raw error text, owner keys, customer data or
//   provider messages: only an allowlisted block name, a fixed category, a code
//   from the fixed health-code catalogue (otherwise none) and a link to admin.
// - A send is "sent" only after the provider confirms it. A claim whose send hangs
//   or whose function is killed expires after leaseMs and is retried.
// - At most dailyCap alert emails go out in any rolling 24 hours (flap damping).
//
// Ops prerequisite: when the scheduler itself stops, only /api/health evaluates
// this alert, so a stopped scheduler is emailed ONLY if an external uptime monitor
// probes /api/health (OPERATIONS.md). If Netlify stops invoking functions, or
// storage or the email provider is down, only that monitor's own notification works.
import { atomicUpdate } from './store.mjs';
import { schedulerHealthState, serviceHealthFailureFacts, SERVICE_FAILURE_CODES } from './service-health.mjs';
import { sendEmail, STEVE_EMAIL } from './send.mjs';
import { normalizeAccountEmail } from './accounts.mjs';

export const ALERT_KEY = 'operator_alert:platform_v1';
// Proposed values; the owner decides them (PROPOSALS.md, Revision 2).
export const ALERT_POLICY = Object.freeze({ minIntervalMs: 30 * 60000, reminderMs: 6 * 3600000, retryMs: 10 * 60000, leaseMs: 10 * 60000, sendTimeoutMs: 5000, dailyCap: 12, dailyWindowMs: 24 * 3600000 });
const SCHEDULER_CODES = ['no_run_recorded', 'scheduler_stale', 'run_not_ok', 'health_read_failed', 'service_delivery_unresolved'];
const KNOWN_CODES = new Set([...SCHEDULER_CODES, ...Object.values(SERVICE_FAILURE_CODES).flat()]);
const readStrict = (kind, key) => atomicUpdate(kind, key, current => ({ result: current }));

// The exact /api/health strings, kept byte-compatible with the previous handler.
export function schedulerFailureFacts(record) {
  const { healthy, minutesAgo, blocks } = schedulerHealthState(record);
  const failingComponents = serviceHealthFailureFacts(blocks.find(([name]) => name === 'serviceDeliveryRecovery')?.[1]);
  const failing = blocks.filter(([, b]) => b?.ok !== true).map(([name, b]) => ({ name, reasonCode: name === 'serviceDeliveryRecovery' ? failingComponents[0]?.reasonCode || 'service_delivery_unresolved' : b?.error || b?.reasonCode || 'reported failure', source: name === 'serviceDeliveryRecovery' ? 'code' : b?.error ? 'error' : b?.reasonCode ? 'code' : 'none' }));
  return { healthy, minutesAgo, blocks, failing, failingComponents, failingBlocks: failing.map(row => `${row.name}: ${row.reasonCode}`) };
}

export function healthSnapshot(record, { now = Date.now(), readFailed = false } = {}) {
  const checkedAt = new Date(now).toISOString();
  if (readFailed) return { state: 'unknown', reason: 'health_read_failed', checkedAt, lastRunAt: null, lastGoodAt: null, minutesAgo: null, failing: [{ name: 'health_record', reasonCode: 'health_read_failed' }], signature: 'health_record' };
  const facts = schedulerFailureFacts(record);
  const failing = facts.failing.map(row => ({ name: String(row.name).slice(0, 80), reasonCode: String(row.reasonCode).slice(0, 160), source: row.source }));
  if (!record) failing.unshift({ name: 'scheduler', reasonCode: 'no_run_recorded' });
  else if (!(facts.minutesAgo !== null && facts.minutesAgo >= 0 && facts.minutesAgo <= 25)) failing.unshift({ name: 'scheduler', reasonCode: 'scheduler_stale' });
  if (!facts.healthy && !failing.length) failing.push({ name: 'scheduler', reasonCode: 'run_not_ok' });
  const lastGoodAt = record?.ok === true && facts.healthy ? record.at : record?.lastGoodAt || null;
  return { state: facts.healthy ? 'healthy' : 'degraded', checkedAt, lastRunAt: record?.at || null, lastGoodAt, minutesAgo: facts.minutesAgo,
    minutesSinceGood: Number.isFinite(Date.parse(lastGoodAt || '')) ? Math.max(0, Math.floor((now - Date.parse(lastGoodAt)) / 60000)) : null,
    failing, signature: facts.healthy ? 'healthy' : [...new Set(failing.map(row => row.name))].sort().join(',') };
}

// What the banner may say about operator email for the CURRENT incident. "emailed" requires a
// provider-confirmed alert sent for the degradation that is still open; anything else never claims an email.
export function alertView(alert, snapshot, now = Date.now()) {
  if (!alert) return { emailState: 'none' };
  const claimed = Date.parse(alert.claimedAt || ''), leaseActive = alert.sendConfirmed === false && Number.isFinite(claimed) && now - claimed < ALERT_POLICY.leaseMs;
  const confirmed = alert.sendConfirmed !== false, open = snapshot?.state !== 'healthy' && alert.state === 'degraded';
  const emailed = open && alert.alerted === true && confirmed && alert.lastKind !== 'recovered' && !!alert.lastSentAt;
  const emailState = !open ? 'none' : alert.sendConfirmed === false ? (leaseActive ? 'sending' : 'unconfirmed') : emailed ? 'emailed' : alert.lastSendFailedAt ? 'failed' : alert.capped ? 'capped' : 'none';
  return { emailState, state: alert.state || null, incidentSince: open ? alert.degradedSince || null : null, emailedAt: emailState === 'emailed' ? alert.lastSentAt : null,
    followUpFailedAt: emailState === 'emailed' && alert.lastSendFailedAt ? alert.lastSendFailedAt : null, lastSendFailedAt: alert.lastSendFailedAt || null, lastKind: alert.lastKind || null };
}

export async function readPlatformHealth({ now = Date.now() } = {}) {
  let snapshot;
  try { snapshot = healthSnapshot(await readStrict('health', 'scheduler:lastRun'), { now }); }
  catch { snapshot = healthSnapshot(null, { now, readFailed: true }); }
  try { snapshot.alert = alertView(await readStrict('health', ALERT_KEY), snapshot, now); }
  catch { snapshot.alert = { unavailable: true, emailState: 'unavailable' }; }
  return snapshot;
}

export function alertRecipients(env = process.env) {
  const listed = String(env.ADMIN_EMAILS || '').split(',').map(value => normalizeAccountEmail(value.trim())).filter(Boolean).slice(0, 10);
  return listed.length ? [...new Set(listed)] : [STEVE_EMAIL];
}

const recentSends = (prev, now) => (Array.isArray(prev?.sends) ? prev.sends : []).filter(at => { const t = Date.parse(at); return Number.isFinite(t) && t <= now && now - t < ALERT_POLICY.dailyWindowMs; }).slice(-100);

// Pure decision. prev is the stored alert state (or null).
export function alertDecision(prev, snapshot, now = Date.now()) {
  // Lease: an unconfirmed claim (hung provider, killed function) blocks others until it expires, then rolls back.
  if (prev?.sendConfirmed === false) {
    const claimed = Date.parse(prev.claimedAt || '');
    if (Number.isFinite(claimed) && now - claimed < ALERT_POLICY.leaseMs) return { send: false, reason: 'in_flight' };
    prev = { ...prev, ...(prev.beforeClaim || {}), state: 'degraded', sendConfirmed: true };
  }
  const lastSent = Date.parse(prev?.lastSentAt || ''), since = Number.isFinite(lastSent) ? now - lastSent : Infinity;
  const failedAt = Date.parse(prev?.lastSendFailedAt || ''), retryWait = Number.isFinite(failedAt) && now - failedAt < ALERT_POLICY.retryMs;
  const capped = recentSends(prev, now).length >= ALERT_POLICY.dailyCap;
  let d;
  if (snapshot.state === 'healthy') {
    if (prev?.state === 'degraded' && prev.alerted === true) d = retryWait ? { send: false, reason: 'retry_wait' } : { send: true, kind: 'recovered' };
    else return { send: false, reason: prev?.state === 'degraded' ? 'recovered_without_alert' : 'healthy', settle: prev?.state === 'degraded' };
  } else if (retryWait) return { send: false, reason: 'retry_wait' };
  else if (prev?.state !== 'degraded' || prev.alerted !== true) d = since < ALERT_POLICY.minIntervalMs ? { send: false, reason: 'rate_limited', mark: true } : { send: true, kind: 'degraded' };
  else if (prev.signature !== snapshot.signature) d = since < ALERT_POLICY.minIntervalMs ? { send: false, reason: 'rate_limited' } : { send: true, kind: 'changed' };
  else d = since < ALERT_POLICY.reminderMs ? { send: false, reason: 'duplicate' } : { send: true, kind: 'reminder' };
  // Daily cap (flap damping): a capped recovery settles silently, a capped new incident is marked unalerted.
  if (d.send && capped) return { send: false, reason: 'daily_cap', capped: true, settle: d.kind === 'recovered', mark: d.kind === 'degraded' };
  return d;
}

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
// One sanitized line per failing block: allowlisted name, fixed category, catalogue code or none. Never raw text.
export function alertLine(row) {
  const name = SAFE_NAME.test(String(row?.name || '')) ? row.name : 'unnamed_block';
  const code = KNOWN_CODES.has(row?.reasonCode) ? row.reasonCode : null;
  const category = ['scheduler', 'health_record'].includes(name) ? 'scheduler' : row?.source === 'error' ? 'block_error' : code ? 'reported_code' : 'unrecognised_failure';
  return `- ${name}: ${category}${code && category !== 'block_error' ? ` (${code})` : ''}`;
}

function message(kind, snapshot, env = process.env, { lastAllowed = false } = {}) {
  const site = String(env.URL || env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const link = (site || 'https://machinesandcloud.com') + '/admin.html';
  const cap = lastAllowed ? `\nThis is alert email ${ALERT_POLICY.dailyCap} of at most ${ALERT_POLICY.dailyCap} in 24 hours. Further changes, reminders and recovery appear only in the admin System view until the window clears.` : '';
  if (kind === 'recovered') return { subject: 'Recovered: Machines & Cloud platform health is ok', text: `Platform health recovered at ${snapshot.checkedAt}.\nLast scheduler run: ${snapshot.lastRunAt || 'not recorded'}.\nReview anything that queued while it was down: ${link}${cap}` };
  const lines = snapshot.failing.slice(0, 12).map(alertLine).join('\n');
  const head = { degraded: 'Platform health needs attention', changed: 'Platform health changed, still needs attention', reminder: 'Still failing: platform health needs attention' }[kind];
  return { subject: `${head} (${snapshot.state})`, text: `${head}.\nState: ${snapshot.state}. Last scheduler run: ${snapshot.lastRunAt || 'not recorded'}${snapshot.minutesAgo === null ? '' : ` (${snapshot.minutesAgo} min ago)`}. Last healthy run: ${snapshot.lastGoodAt || 'not recorded'}.\nFailing (details are only in the admin System view):\n${lines}\n\nOpen System in the admin portal: ${link}\nThis alert repeats at most every ${ALERT_POLICY.reminderMs / 3600000} hours while unchanged, a recovery notice follows, and at most ${ALERT_POLICY.dailyCap} alert emails are sent in 24 hours.${cap}` };
}

// Shared by the scheduler (self-reported failing blocks) and /api/health
// (stale or missing scheduler, on every external monitor probe). Never throws.
export async function evaluatePlatformAlert(snapshot, { now = Date.now(), source = 'unknown', send = sendEmail, env = process.env } = {}) {
  try {
    if (!snapshot || !['healthy', 'degraded', 'unknown'].includes(snapshot.state)) return { sent: false, reason: 'invalid_snapshot' };
    let prev;
    try { prev = await readStrict('health', ALERT_KEY); } catch { return { sent: false, reason: 'alert_state_unavailable' }; }
    const first = alertDecision(prev, snapshot, now);
    if (!first.send && !first.settle && !first.mark && !first.capped) return { sent: false, reason: first.reason };
    const at = new Date(now).toISOString();
    // The decision is re-made inside the conditional write, so concurrent evaluators cannot both claim.
    const claim = await atomicUpdate('health', ALERT_KEY, current => {
      const d = alertDecision(current, snapshot, now);
      const sends = recentSends(current, now);
      if (d.send) return { value: { ...(current || {}), version: 1, state: d.kind === 'recovered' ? 'healthy' : 'degraded', alerted: d.kind !== 'recovered', signature: snapshot.signature, lastKind: d.kind, lastSentAt: at, lastSource: source,
        degradedSince: d.kind === 'recovered' ? null : current?.degradedSince || at, lastSendFailedAt: null, capped: false, sends: [...sends, at], sendConfirmed: false, claimedAt: at,
        beforeClaim: { alerted: current?.alerted === true, signature: current?.signature ?? null, lastSentAt: current?.lastSentAt ?? null, lastKind: current?.lastKind ?? null, degradedSince: current?.degradedSince ?? null } }, result: { ...d, lastAllowed: sends.length + 1 >= ALERT_POLICY.dailyCap } };
      if (d.settle) return { value: { ...(current || {}), version: 1, state: 'healthy', alerted: false, signature: 'healthy', degradedSince: null, sendConfirmed: true, beforeClaim: null, capped: false }, result: d };
      if (d.mark && current?.state !== 'degraded') return { value: { ...(current || {}), version: 1, state: 'degraded', alerted: false, signature: snapshot.signature, degradedSince: at, sendConfirmed: true, beforeClaim: null, capped: !!d.capped }, result: d };
      if (d.capped && current?.capped !== true) return { value: { ...(current || {}), capped: true }, result: d };
      return { result: d };
    });
    if (!claim?.send) return { sent: false, reason: claim?.reason || 'claimed_elsewhere' };
    const body = message(claim.kind, snapshot, env, { lastAllowed: claim.lastAllowed });
    let result, timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, error: 'send_timeout' }), ALERT_POLICY.sendTimeoutMs); timer.unref?.(); });
    try { result = await Promise.race([Promise.resolve().then(() => send({ to: alertRecipients(env), subject: body.subject, text: body.text })), timeout]); }
    catch (error) { result = { ok: false, error: String(error?.message || error).slice(0, 120) }; }
    finally { clearTimeout(timer); }
    if (!result?.ok && !result?.logged) {
      // Undo only our own claim, restoring the pre-claim state so the next evaluation (>= retryMs later) retries.
      await atomicUpdate('health', ALERT_KEY, current => current?.claimedAt === at && current?.sendConfirmed === false
        ? { value: { ...current, ...(current.beforeClaim || {}), state: 'degraded', lastSendFailedAt: at, sendConfirmed: true, beforeClaim: null, sends: recentSends(current, now).filter(value => value !== at) }, result: null }
        : { result: null }).catch(() => {});
      return { sent: false, reason: result?.error === 'send_timeout' ? 'send_timeout' : 'send_failed', kind: claim.kind };
    }
    // Confirm only our own claim. If this write is lost the lease expires and the alert is re-sent (at-least-once).
    await atomicUpdate('health', ALERT_KEY, current => current?.claimedAt === at && current?.sendConfirmed === false ? { value: { ...current, sendConfirmed: true, beforeClaim: null }, result: null } : { result: null }).catch(() => {});
    return { sent: true, kind: claim.kind, logged: !!result.logged };
  } catch (error) { console.error('operator health alert', error?.message || error); return { sent: false, reason: 'alert_error' }; }
}
