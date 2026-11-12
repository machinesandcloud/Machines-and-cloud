// One workspace lifecycle for self-service workspaces. The owner portal (/api/client) and the
// operator portal (/api/manage) both call lifecycleTransition() inside their own client CAS and
// afterLifecycleChange() after the commit, so pause, resume, cancel and reopen have the same
// channel, task and billing-stop effects whoever asks. Operators keep their own reason, revision
// and audit around it; owners keep their own request contract.
import { randomUUID } from 'node:crypto';
import { cancelTasks, atomicUpdate, list } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { setupReadiness } from './setup.mjs';
import { getAIAllowance } from './self-service-ai.mjs';
import { workspaceTenant } from './workspace-identity.mjs';
import { queueWorkspaceStopBilling } from './workspace-billing.mjs';
import { sendEmail } from './send.mjs';

export class LifecycleError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
// Plain categories an operator chooses. Only the category sentence, plus an explicitly
// shareable customer message, ever reaches the owner. The operator's reason stays internal.
export const SUPPORT_REASON_CATEGORIES = Object.freeze({
  owner_request: 'You asked us to make this change.',
  billing: 'A billing matter needs attention.',
  setup_review: 'Your setup needs a review before service continues.',
  service_issue: 'We found a service problem and are working on it.',
  policy_review: 'Your workspace is under a policy or safety review.',
  other: 'Machines & Cloud support made this change.',
});
// After a policy review cancellation the owner reopens through support, not self-service.
const OWNER_REOPEN_BLOCKED = new Set(['policy_review']);
export const LIFECYCLE_ACTIONS = Object.freeze(['pause', 'resume', 'cancel', 'reopen']);
export const closedStatus = status => ['cancelled', 'archived'].includes(status);
const allOff = () => ({ web: { active: false }, voice: { active: false }, sms: { active: false } });
const titles = { pause: 'paused', resume: 'resumed', cancel: 'stopped', reopen: 'reopened' };

// QA-LIFE F3: a support cancellation is support-reopen only unless the operator explicitly
// allowed the owner to reopen (ownerMayReopen). The owner-visible category is wording, not
// authorization, so an operator choosing a softer category never grants self-reopen by accident.
export function ownerReopenAllowed(c) {
  if (!closedStatus(c?.status) || c.erasureStartedAt) return false;
  if (c.cancelledBy?.role !== 'operator') return true;
  return c.cancelledBy.ownerMayReopen === true && !OWNER_REOPEN_BLOCKED.has(c.cancelledBy.category);
}
export function supportCategory(value) {
  if (value === undefined || value === null || value === '') return 'other';
  if (typeof value !== 'string' || !Object.hasOwn(SUPPORT_REASON_CATEGORIES, value)) throw new LifecycleError('invalid_reason_category', 'Choose a customer-facing reason category.', 400);
  return value;
}
export function customerMessage(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 300) throw new LifecycleError('invalid_customer_message', 'A message for the customer must be text under 300 characters.', 400);
  return value.trim() || null;
}
// Erasure (proposal 18) writes workspace_erasures/<slug>/<tenant> before removing any row.
// Any erasure record, finished or not, means this workspace can never be reopened.
async function erasureRecorded(c) {
  return !!(await strictRead('workspace_erasures', `${c.slug}/${workspaceTenant(c)}`));
}
// QA-LIFE F1: managed phone/texting work from before the stop must have observed the
// cancellation before the workspace reopens. Otherwise a voice row that the worker has not yet
// seen cancelled adopts the reopened lifecycle after the next review and answers calls again
// with the pre-cancel authority and resources (and a pending number purchase continues).
const SERVICE_ROWS = [
  ['voice_activation_intents', row => row.state === 'cancelled' || !!row.cancelRequestedAt],
  ['messaging_activation', row => row.state === 'cancelled' || !!row.cancelRequestedAt],
  ['phone_activation_intents', row => ['number_acquired', 'cancelled', 'superseded', 'needs_review'].includes(row.state) || !!row.cancelRequestedAt],
];
// Plain names for the operator status. The owner only sees that shutdown is still finishing.
export const SERVICE_CLEANUP_LABELS = Object.freeze({ voice_activation_intents: 'Phone answering', messaging_activation: 'Texting', phone_activation_intents: 'Number purchase' });
export async function serviceCancellationPending(c) {
  const t = workspaceTenant(c), open = [];
  for (const [store, settled] of SERVICE_ROWS) for (const key of await list(store, `${c.slug}/`)) {
    const row = await strictRead(store, key);
    if (row && row.tenantIdentity === t && !settled(row)) open.push(store);
  }
  return [...new Set(open)];
}
function nextStep(action, value) {
  if (action === 'pause') return 'Your records and settings are kept. You can resume from Account when you are ready, or reply to our email with questions.';
  if (action === 'resume') return 'Check Connections for each service’s current status.';
  if (action === 'cancel') return ownerReopenAllowed(value) ? 'Your saved records are kept. You can reopen this workspace from Account.' : 'Your saved records are kept. Contact support to discuss reopening this workspace.';
  return 'Review your business details and complete a private test before turning service back on. Phone, texting and calendar connections reconnect only through their usual checks.';
}

// Returns the next client row, or null when nothing changes (a repeated cancel).
// ctx: { now, actor: {role:'owner'|'operator', email}, ownerReason?, category?, message?, noticeId? }
export async function lifecycleTransition(current, action, ctx) {
  if (!LIFECYCLE_ACTIONS.includes(action)) throw new LifecycleError('invalid_action', 'Choose an available lifecycle action.', 400);
  const now = ctx.now || new Date().toISOString(), support = ctx.actor?.role === 'operator';
  const lifecycle = (current.operationLifecycleVersion || 0) + 1;
  let value;
  if (action === 'pause') {
    if (current.status === 'paused') throw new LifecycleError('already_paused', 'This front desk is already paused. Its previous service settings are kept for Resume.');
    if (!['live', 'testing'].includes(current.status)) throw new LifecycleError('not_active', 'Only an active or testing workspace can be paused.');
    value = { ...current, status: 'paused', pausedAt: now, pausedFrom: current.status, pausedChannels: structuredClone(current.channels || {}), channels: allOff(), operationLifecycleVersion: lifecycle, updatedAt: now };
  } else if (action === 'cancel') {
    if (closedStatus(current.status)) return null;
    value = { ...current, status: 'cancelled', cancelledAt: current.cancelledAt || now, channels: allOff(), operationLifecycleVersion: lifecycle, updatedAt: now,
      cancelledBy: support ? { role: 'operator', category: ctx.category || 'other', ownerMayReopen: ctx.ownerMayReopen === true && !OWNER_REOPEN_BLOCKED.has(ctx.category || 'other') } : { role: 'owner' } };
    // Only the owner's own words are kept as cancelReason (the owner can read it).
    // An operator's reason lives in management.audit only.
    if (support) delete value.cancelReason; else value.cancelReason = ctx.ownerReason || '';
  } else if (action === 'resume') {
    if (current.status !== 'paused') throw new LifecycleError('not_paused', 'Only a paused workspace can be resumed.');
    const previous = current.pausedFrom === 'live' ? 'live' : 'testing';
    const wantsWeb = !Array.isArray(current.onboarding?.desiredChannels) || current.onboarding.desiredChannels.includes('web');
    const restoringWeb = wantsWeb && previous === 'live' && current.pausedChannels?.web?.active === true;
    if (restoringWeb && (!setupReadiness(current).canActivateWeb || !(await getAIAllowance(current)).available)) throw new LifecycleError('resume_not_ready', 'Review, a successful current live test and available AI allowance are required before resuming website chat.');
    value = { ...current, status: previous, channels: { ...allOff(), ...current.channels, web: { ...current.channels?.web, active: restoringWeb } }, pausedAt: null, pausedFrom: null, pausedChannels: null, operationLifecycleVersion: lifecycle, updatedAt: now, ...(previous === 'live' ? { liveAt: current.liveAt || now } : {}) };
  } else {
    if (!closedStatus(current.status)) throw new LifecycleError('not_closed', 'Only a stopped workspace can be reopened.');
    if (!support && !ownerReopenAllowed(current)) throw new LifecycleError('reopen_requires_support', 'Contact Machines & Cloud support to reopen this workspace.', 403);
    // QA-LIFE F2: an erasure marks the client row inside a client CAS before its tombstone, so a
    // reopen whose CAS raced the erase retries, sees the marker and stops.
    if (current.erasureStartedAt) throw new LifecycleError('workspace_erased', 'This workspace is being erased and cannot be reopened. The same email can start a new workspace.', 410);
    // Fails closed: if a worker never observes the stop, reopen stays refused and the operator
    // status names the service (customerView lifecycle.cleanupPending).
    if ((await serviceCancellationPending(current)).length) throw new LifecycleError('service_cleanup_pending', 'We are still finishing the shutdown of phone and texting setup from before the stop. Nothing was changed. Try reopening again in a few minutes.', 409);
    if (await erasureRecorded(current)) throw new LifecycleError('workspace_erased', 'This workspace was erased and cannot be reopened. The same email can start a new workspace.', 410);
    const history = [...(current.lifecycleHistory || []), { action: 'cancelled', at: current.cancelledAt || null, by: current.cancelledBy?.role || 'owner', ...(current.cancelledBy?.category ? { category: current.cancelledBy.category } : {}) }, { action: 'reopened', at: now, by: support ? 'operator' : 'owner' }].slice(-20);
    // Back to testing with every channel off and a fresh review and live test required.
    // Saved records, answers, provider references and billing history are untouched.
    value = { ...current, status: 'testing', channels: allOff(), cancelledAt: null, cancelReason: null, cancelledBy: null, pausedAt: null, pausedFrom: null, pausedChannels: null, reopenedAt: now, lifecycleHistory: history,
      setupProof: { ...(current.setupProof || {}), reviewedRevision: null, reviewedAt: null, testedRevision: null, testMode: null }, operationLifecycleVersion: lifecycle, updatedAt: now };
  }
  // Owners see who changed their service. A support change carries only the category
  // sentence and an explicitly shareable message; an owner's own change clears the notice.
  if (support) value.lifecycleNotice = { id: ctx.noticeId || randomUUID(), action, by: 'support', at: now, category: ctx.category || 'other', summary: SUPPORT_REASON_CATEGORIES[ctx.category || 'other'], message: ctx.message || null, nextStep: nextStep(action, value), email: 'pending' };
  else delete value.lifecycleNotice;
  return value;
}

// Side effects after the client row committed. Same for owner and operator.
export async function afterLifecycleChange(updated, action, { notify = true } = {}) {
  const effects = { tasksCancelled: false, billingStopQueued: false, dispatched: [] };
  if (action === 'cancel') {
    await cancelTasks(updated.slug, () => true); effects.tasksCancelled = true;
    await queueWorkspaceStopBilling(updated); effects.billingStopQueued = true;
  }
  if (action === 'resume') {
    try { const { dispatchVoiceActivationWave } = await import('./voice-activation.mjs'); await dispatchVoiceActivationWave(); effects.dispatched.push('voice'); } catch { /* Scheduled recovery resumes accepted phone work. */ }
    try { const { dispatchCalendarDeliveryWave } = await import('./calendar-delivery.mjs'); await dispatchCalendarDeliveryWave(updated); effects.dispatched.push('calendar'); } catch { /* Scheduled recovery resumes saved calendar work. */ }
  }
  if (notify && updated.lifecycleNotice?.by === 'support') effects.ownerEmail = await emailOwnerNotice(updated);
  return effects;
}

// Transactional email through the existing send path. Never includes the operator's reason.
export async function emailOwnerNotice(c) {
  const notice = c.lifecycleNotice, to = normalizeAccountEmail(c.owner?.email);
  if (!notice || notice.by !== 'support' || !to) return 'skipped';
  const name = c.business?.name || 'Your front desk';
  const text = [`Machines & Cloud support ${titles[notice.action]} the ${name} workspace on ${notice.at.slice(0, 10)}.`, '', `Reason: ${notice.summary}`, ...(notice.message ? ['', notice.message] : []), '', notice.nextStep, '', 'Sign in to your workspace to see the current status. Reply to this email with any questions.'].join('\n');
  let state;
  try { const sent = await sendEmail({ to, subject: `${name}: front desk ${titles[notice.action]} by support`, text }); state = sent?.ok ? 'sent' : sent?.logged ? 'logged' : 'failed'; }
  catch { state = 'failed'; }
  try {
    await atomicUpdate('clients', c.slug, current => current && workspaceTenant(current) === workspaceTenant(c) && current.lifecycleNotice?.id === notice.id
      ? { value: { ...current, lifecycleNotice: { ...current.lifecycleNotice, email: state, emailedAt: new Date().toISOString() } } } : {});
  } catch { /* The desk notice is already saved; only the email receipt is missing. */ }
  return state;
}

// Owner-initiated change in one call: CAS on the client row, then the shared effects.
export async function ownerLifecycleChange(c, action, { email, ownsCurrent, expectedRevision = null, revisionOf = null, ownerReason = '' }) {
  const now = new Date().toISOString();
  const updated = await atomicUpdate('clients', c.slug, async current => {
    if (!ownsCurrent(current)) throw new LifecycleError('forbidden', 'This workspace belongs to another account.', 403);
    if (expectedRevision !== null && revisionOf && revisionOf(current) !== expectedRevision) throw new LifecycleError('configuration_changed', 'Saved details changed. Check the latest version before continuing.');
    const value = await lifecycleTransition(current, action, { now, actor: { role: 'owner', email }, ownerReason });
    return value ? { value, result: value } : { result: current };
  });
  return { client: updated, effects: await afterLifecycleChange(updated, action) };
}
