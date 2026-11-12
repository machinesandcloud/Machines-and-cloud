// Post-visit lifecycle for self-service workspaces (PRA-HOMEOWNER-08).
// Owner actions are conditional writes on the saved visit. Every customer text is a managed
// outbox intent: consent, registered program, owner switch, quiet hours and expiry are all
// rechecked when it would send, never only when it was scheduled. Defaults send nothing to
// customers; only the owner-only "did the visit happen?" email is on by default.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { isSupportedSelfServiceClient } from './setup.mjs';
import { workspaceTenant, belongsToWorkspace } from './workspace-identity.mjs';
import { arrivalInstant } from './service-time.mjs';
import { canonicalWindow } from './availability.mjs';
import { TEMPLATES, TEMPLATES_ES, reviewLink, nextOpenTime } from './desk.mjs';
import { buildMessagingProgram, POST_VISIT_PROGRAM_VERSION, reviewRequestsAvailable } from './messaging-program.mjs';
import { queueManagedMessage, managedMessageId, queueManagedRecord } from './managed-delivery.mjs';
import { ownerVisitAuthority, ownerVisitRevision, OwnerVisitError } from './owner-visits.mjs';

const H = 3600000, D = 24 * H;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const stamp = () => new Date().toISOString();
const ACTIVE = ['booked', 'confirmed', 'on_the_way'];
export const POST_VISIT_OUTCOMES = ['done', 'no_show'];
export const REVIEW_DELAY = 2 * H, REVIEW_EXPIRES = 7 * D, PAYMENT_OFFSETS = [3 * D, 7 * D], PAYMENT_EXPIRES = 30 * D, VISIT_CHECK_LATE = 3 * D;

export function postVisitSettings(c) {
  const s = c?.postVisit || {};
  return { visitCheck: s.visitCheck !== false, reviewRequest: reviewRequestsAvailable() && s.reviewRequest === true, paymentReminders: s.paymentReminders === true };
}
const customerTextsWanted = s => s.reviewRequest || s.paymentReminders;

// The shop's carrier registration names the message types it may send. Review requests and
// payment reminders are outside the default appointment program, so they need the post-visit
// program extension and a registration filed for exactly that program.
async function registration(c) {
  const t = hash(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)]));
  return strictRead('messaging_activation', `${c.slug}/${hash('messaging-v1:' + t)}`);
}
export async function postVisitProgramState(c) {
  if (c.postVisitProgram?.version !== POST_VISIT_PROGRAM_VERSION) return { registered: false, reason: 'post_visit_program_not_selected' };
  const row = await registration(c);
  if (!row) return { registered: false, reason: 'texting_not_registered' };
  return row.programDigest === buildMessagingProgram(c).digest ? { registered: true, reason: null } : { registered: false, reason: 'post_visit_program_not_registered' };
}

const owns = (b, c) => b?.slug === c.slug && b.delivery?.tenantIdentity === workspaceTenant(c) && belongsToWorkspace(c, b) && !b.websiteSetupCheck && !b.simulation && !b.ownerVisitCreationAborted;
const spanish = b => b?.language === 'es';
function windowBounds(b) {
  const start = arrivalInstant(b.date, b.window), m = /^(\d+)-(\d+)$/.exec(canonicalWindow(b.window));
  return { start, end: start + (Number(m[2]) - Number(m[1])) * 60000 };
}
// A visit can be closed from its Houston service day on (a job finished early stops its 1-hour reminder).
const houstonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
function started(b) { try { return /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') && (b.date <= houstonToday() || windowBounds(b).start <= Date.now()); } catch { return false; } }
const recentVisit = b => { try { return windowBounds(b).end + REVIEW_EXPIRES > Date.now(); } catch { return false; } };
// 9:00 Houston on the day after the arrival window ends (noon on Sunday), as the legacy visit_check.
function nextMorning(end) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(end));
  const next = new Date(Date.parse(day + 'T12:00:00Z') + D).toISOString().slice(0, 10);
  return nextOpenTime(new Date(arrivalInstant(next, '9 to 10'))).getTime();
}

// Owner-only email bound to the visit's saved date and window: a done, cancelled or moved visit
// supersedes it at send time. Old visits found by backfill are not nudged.
export function ownerVisitCheckIntent(c, b, revision) {
  if (!postVisitSettings(c).visitCheck || !ACTIVE.includes(b?.status) || !b.date || !b.window) return null;
  let due; try { due = nextMorning(windowBounds(b).end); } catch { return null; }
  if (due < Date.now() - D) return null;
  return { eventId: `bookings:${b.id}:${b.date}:${canonicalWindow(b.window)}:owner_visit_check`, // one nudge per visit date and window, whatever else is edited
    dueAt: new Date(due).toISOString(),
    postVisit: { bookingId: b.id, kind: 'owner_visit_check', date: b.date, window: b.window, expiresAt: new Date(due + VISIT_CHECK_LATE).toISOString() },
    body: `${c.business.name}: did the visit for ${b.customer_name || 'your customer'} (${b.date}, ${b.window}, ref ${b.id}) happen?\nOpen Schedule in your workspace and choose Mark job done or No-show. Until then the visit stays booked and no follow-up is sent.` };
}

const STOP_LINE = { en: ' Reply STOP to end texts.', es: ' Responda STOP o ALTO para no recibir más mensajes.' };
function customerBody(c, b, kind) {
  const set = spanish(b) ? TEMPLATES_ES : TEMPLATES, l = spanish(b) ? 'es' : 'en';
  const record = kind === 'payment_reminder' ? { ...b, amount: b.postVisit?.invoice?.amount } : b;
  const shop = kind === 'payment_reminder' ? { ...c, business: { ...c.business, payLink: '' } } : c; // the registered sample has no payment link
  return set[kind](shop, record) + STOP_LINE[l];
}
export function postVisitIntents(c, b) {
  if (!isSupportedSelfServiceClient(c) || !owns(b, c) || b.status !== 'done' || !/^\+1[2-9]\d{9}$/.test(b.phone || '')) return [];
  const s = postVisitSettings(c), pv = b.postVisit || {}, out = [];
  const doneAt = Date.parse(pv.at);
  if (pv.reviewPlanned && s.reviewRequest && reviewLink(c) && Number.isFinite(doneAt) && doneAt + REVIEW_EXPIRES > Date.now())
    out.push({ eventId: `post_visit:${b.id}:review_request:${pv.op}`, purpose: 'review_request', dueAt: nextOpenTime(new Date(doneAt + REVIEW_DELAY)).toISOString(), body: customerBody(c, b, 'review_request'),
      postVisit: { bookingId: b.id, kind: 'review_request', op: pv.op, expiresAt: new Date(doneAt + REVIEW_EXPIRES).toISOString() } });
  const invoice = pv.invoice, at = Date.parse(invoice?.at);
  if (invoice && !pv.paidAt && s.paymentReminders && Number.isFinite(at) && at + PAYMENT_EXPIRES > Date.now())
    PAYMENT_OFFSETS.forEach((offset, i) => out.push({ eventId: `post_visit:${b.id}:payment_reminder:${invoice.id}:${i + 1}`, purpose: 'payment_reminder', dueAt: nextOpenTime(new Date(at + offset)).toISOString(), body: customerBody(c, b, 'payment_reminder'),
      postVisit: { bookingId: b.id, kind: 'payment_reminder', invoiceId: invoice.id, expiresAt: new Date(at + PAYMENT_EXPIRES).toISOString() } }));
  return out;
}
// Local-only and idempotent: the same visit state always produces the same outbox identities.
export async function queuePostVisit(c, b) {
  const ids = [];
  if ((await postVisitProgramState(c)).reason === 'post_visit_program_not_selected') return ids; // not held for weeks in the shared index
  for (const intent of postVisitIntents(c, b)) ids.push(await queueManagedMessage(c, { eventId: intent.eventId, channel: 'sms', purpose: intent.purpose, to: b.phone, body: intent.body, dueAt: intent.dueAt, postVisit: intent.postVisit, preserveSnapshot: true }));
  return ids;
}

// Send-time authority for an outbox job carrying postVisit. False supersedes the job.
export async function inspectPostVisit(c, job) {
  const pv = job.postVisit, b = pv && await strictRead('bookings', `${c.slug}/${pv.bookingId}`), s = postVisitSettings(c);
  if (!owns(b, c) || job.tenant !== workspaceTenant(c)) return false;
  if (pv.kind === 'owner_visit_check') return job.channel === 'email' && job.purpose === 'owner_visit_check' && job.to === c.owner?.email && s.visitCheck && ACTIVE.includes(b.status) && b.date === pv.date && b.window === pv.window;
  if (job.channel !== 'sms' || job.to !== b.phone || b.status !== 'done') return false;
  if (pv.kind === 'review_request') return job.purpose === 'review_request' && s.reviewRequest && !!reviewLink(c) && b.postVisit?.reviewPlanned === true && b.postVisit.op === pv.op;
  if (pv.kind === 'payment_reminder') return job.purpose === 'payment_reminder' && s.paymentReminders && b.postVisit?.invoice?.id === pv.invoiceId && !b.postVisit.paidAt;
  return false;
}
export async function postVisitBlocker(c, job) {
  if (!job.postVisit || job.channel !== 'sms') return null;
  const state = await postVisitProgramState(c);
  return state.registered ? null : { code: state.reason, message: 'Review requests and payment reminders need a texting registration that includes them. Appointment texts are unchanged.' };
}

const jobState = async (c, eventId) => { const row = await strictRead('managed_deliveries', managedMessageId(c, 'sms', eventId)); return row ? { state: row.state, reasonCode: row.reasonCode || null, dueAt: row.dueAt || null } : null; };
export async function postVisitView(c, b) {
  const pv = b.postVisit || {}, s = postVisitSettings(c);
  const view = { outcome: POST_VISIT_OUTCOMES.includes(b.status) ? b.status : null, at: pv.at || null, canComplete: ACTIVE.includes(b.status) && started(b), canReopen: POST_VISIT_OUTCOMES.includes(b.status) && Date.parse(pv.at) + D > Date.now(), canInvoice: b.status === 'done' && s.paymentReminders && !!b.phone,
    review: null, payment: pv.invoice ? { amount: pv.invoice.amount, at: pv.invoice.at, paidAt: pv.paidAt || null, reminders: [] } : null };
  if (pv.reviewPlanned) view.review = await jobState(c, `post_visit:${b.id}:review_request:${pv.op}`) || { state: 'not_queued', reasonCode: !reviewLink(c) ? 'review_link_missing' : !s.reviewRequest ? 'switched_off' : null };
  if (view.payment) for (const i of [1, 2]) view.payment.reminders.push(await jobState(c, `post_visit:${b.id}:payment_reminder:${pv.invoice.id}:${i}`));
  return view;
}

function parse(body) {
  const base = ['action', 'type', 'expectedRevision', 'operationId'], visit = ['visitId', 'expectedVisitRevision'];
  const allowed = { mark_done: [...base, ...visit], no_show: [...base, ...visit], payment_reminder: [...base, ...visit, 'amount'], mark_paid: [...base, ...visit], reopen: [...base, ...visit], settings: [...base, 'visitCheck', 'reviewRequest', 'paymentReminders', 'acknowledgeProgram'] }[body?.type];
  if (!allowed || body.action !== 'post_visit' || JSON.stringify(body).length > 1200 || Object.keys(body).some(key => !allowed.includes(key)) || !/^[a-f0-9]{64}$/.test(body.expectedRevision || '') || !/^[a-f0-9]{32}$/.test(body.operationId || ''))
    throw new OwnerVisitError('invalid_request', 'Refresh the visit and try again.', 400);
  if (allowed.includes('visitId') && (!/^[a-zA-Z0-9_-]{1,80}$/.test(body.visitId || '') || !/^[a-f0-9]{64}$/.test(body.expectedVisitRevision || ''))) throw new OwnerVisitError('invalid_request', 'Refresh the visit and try again.', 400);
  if (body.type === 'settings' && ['visitCheck', 'reviewRequest', 'paymentReminders'].some(key => typeof body[key] !== 'boolean')) throw new OwnerVisitError('invalid_request', 'Choose each follow-up setting.', 400);
  if (body.type === 'payment_reminder') {
    const m = /^\$?\s*(\d{1,6})(?:\.(\d{2}))?$/.exec(String(body.amount || '').trim().replace(/,/g, ''));
    if (!m || Number(m[1]) === 0 && !Number(m[2] || 0)) throw new OwnerVisitError('invalid_amount', 'Enter the open amount, for example 180 or 180.50.', 400, 'amount');
    return { ...body, amount: `$${String(Number(m[1]))}${m[2] ? '.' + m[2] : ''}` };
  }
  return { ...body };
}

async function changeSettings(c, session, input) {
  const desired = { visitCheck: input.visitCheck, reviewRequest: input.reviewRequest, paymentReminders: input.paymentReminders };
  if (customerTextsWanted(desired) && input.acknowledgeProgram !== true) throw new OwnerVisitError('program_review_required', 'Review what customers will receive before turning on customer texts.', 409, 'acknowledgeProgram');
  if (desired.reviewRequest && !reviewRequestsAvailable()) throw new OwnerVisitError('review_requests_unavailable', 'Review requests are not available yet. Payment reminders and the job-done check are.', 409, 'reviewRequest');
  const saved = await atomicUpdate('clients', c.slug, async current => {
    if (!isSupportedSelfServiceClient(current) || workspaceTenant(current) !== workspaceTenant(c)) throw new OwnerVisitError('forbidden', 'This workspace changed.', 403);
    const opDigest = hash({ ...desired, acknowledgeProgram: input.acknowledgeProgram === true });
    if (current.postVisit?.lastOperation === input.operationId) { if (current.postVisit.lastOperationDigest !== opDigest) throw new OwnerVisitError('submission_conflict', 'This action was already used for a different change.'); return { result: current }; }
    const next = { ...current, postVisit: { ...desired, lastOperation: input.operationId, lastOperationDigest: opDigest, updatedAt: stamp(), actor: normalizeAccountEmail(session.email) } };
    // Selecting the program changes the registration digest. Only select it where that cannot
    // invalidate an existing registration: none yet, or one already filed for it.
    if (customerTextsWanted(desired) && current.postVisitProgram?.version !== POST_VISIT_PROGRAM_VERSION) {
      const row = await registration(current), withProgram = { ...next, postVisitProgram: { version: POST_VISIT_PROGRAM_VERSION } };
      if (!row || row.programDigest === buildMessagingProgram(withProgram).digest) next.postVisitProgram = { version: POST_VISIT_PROGRAM_VERSION, reviewedDigest: buildMessagingProgram(withProgram).digest, reviewedAt: stamp(), actor: normalizeAccountEmail(session.email) };
    }
    return { value: next, result: next };
  });
  return { ok: true, settings: postVisitSettings(saved), program: await postVisitProgramState(saved), message: 'Follow-up settings saved.' };
}

export async function changePostVisit(c, session, body) {
  const input = parse(body), current = await ownerVisitAuthority(c, session, input.expectedRevision);
  if (input.type === 'settings') return changeSettings(current, session, input);
  let sentCustomerText = false;
  if (input.type === 'reopen') { const b0 = await strictRead('bookings', `${c.slug}/${input.visitId}`), ids = [...(b0?.postVisit?.op ? [`post_visit:${input.visitId}:review_request:${b0.postVisit.op}`] : []), ...(b0?.postVisit?.invoice ? [1, 2].map(i => `post_visit:${input.visitId}:payment_reminder:${b0.postVisit.invoice.id}:${i}`) : [])];
    for (const id of ids) { const j = await strictRead('managed_deliveries', managedMessageId(current, 'sms', id)); if (j && (j.attemptStartedAt || j.providerId)) sentCustomerText = true; } }
  const key = `${c.slug}/${input.visitId}`, digest = hash({ ...input, actor: normalizeAccountEmail(session.email) }), at = stamp();
  const saved = await atomicUpdate('bookings', key, row => {
    if (!owns(row, current)) throw new OwnerVisitError('visit_not_found', 'This visit is no longer available.', 404);
    const ops = row.postVisit?.ops || {};
    if (ops[input.operationId]) { if (ops[input.operationId] !== digest) throw new OwnerVisitError('submission_conflict', 'This action was already used for a different change.'); return { result: row }; }
    if (ownerVisitRevision(row) !== input.expectedVisitRevision) throw new OwnerVisitError('visit_changed', 'This visit changed. Refresh it before trying again.');
    if (Object.keys(ops).length >= 50) throw new OwnerVisitError('history_full', 'This visit has too many follow-up changes.');
    const pv = { ...(row.postVisit || {}), ops: { ...ops, [input.operationId]: digest } }, s = postVisitSettings(current);
    let patch = {};
    if (['mark_done', 'no_show'].includes(input.type)) {
      if (!ACTIVE.includes(row.status)) throw new OwnerVisitError('visit_closed', 'This visit is already closed.');
      if (!started(row)) throw new OwnerVisitError('visit_not_started', 'Mark the visit on or after its service day.');
      const outcome = input.type === 'mark_done' ? 'done' : 'no_show';
      Object.assign(pv, { outcome, at, op: input.operationId, reviewPlanned: outcome === 'done' && s.reviewRequest && !!reviewLink(current) && !!row.phone && recentVisit(row) });
      patch = { status: outcome, outcome: outcome === 'done' ? 'done' : 'no_show', doneAt: outcome === 'done' ? at : row.doneAt, ownerVisitHistory: [...(row.ownerVisitHistory || []), { action: input.type, at, actor: session.email, previous: { status: row.status }, next: { status: outcome } }] };
    } else if (input.type === 'reopen') {
      if (!POST_VISIT_OUTCOMES.includes(row.status) || !(Date.parse(pv.at) + D > Date.now())) throw new OwnerVisitError('reopen_closed', 'This visit can only be reopened within 24 hours of closing it.');
      if (sentCustomerText) throw new OwnerVisitError('reopen_closed', 'A follow-up text for this visit already went out, so it stays closed.');
      const previous = [...(row.ownerVisitHistory || [])].reverse().find(h => ['mark_done', 'no_show'].includes(h.action))?.previous?.status;
      if (!ACTIVE.includes(previous)) throw new OwnerVisitError('reopen_closed', 'This visit cannot be reopened.');
      for (const k of ['outcome', 'at', 'op', 'reviewPlanned', 'invoice', 'paidAt']) delete pv[k];
      patch = { status: previous, outcome: previous, doneAt: null, ownerVisitHistory: [...(row.ownerVisitHistory || []), { action: 'reopen', at, actor: session.email, previous: { status: row.status }, next: { status: previous } }] };
    } else {
      if (row.status !== 'done') throw new OwnerVisitError('visit_not_done', 'Mark the job done first.');
      if (input.type === 'payment_reminder') {
        if (!s.paymentReminders) throw new OwnerVisitError('payment_reminders_off', 'Turn on payment reminders in follow-up settings first.');
        if (!row.phone) throw new OwnerVisitError('no_phone', 'This visit has no mobile number.');
        pv.invoice = { id: input.operationId.slice(0, 16), amount: input.amount, at }; delete pv.paidAt;
      } else { pv.paidAt = at; }
    }
    const value = { ...row, ...patch, postVisit: pv, updatedAt: at };
    return { value, result: value };
  });
  let queued = true;
  if (input.type === 'reopen') { try { await queueManagedRecord(current, saved, 'bookings'); } catch { queued = false; } }
  else try { await queuePostVisit(current, saved); } catch { queued = false; } // Scheduled backfill repairs a missed local queue write.
  const view = await postVisitView(current, saved), excluded = (await postVisitProgramState(current)).reason === 'post_visit_program_not_selected';
  const message = { mark_done: 'Job marked done. Remaining visit reminders stop.', no_show: 'Marked as no-show. Remaining visit reminders stop and no follow-up is sent.', payment_reminder: `Payment reminders saved for ${input.amount}. They go out on day 3 and day 7 only if the customer has texting permission.`, mark_paid: 'Marked paid. No more payment reminders will go out.', reopen: 'Visit reopened. Reminders that were already stopped are not sent again.' }[input.type];
  if (excluded && ['payment_reminder', 'mark_done'].includes(input.type) && (input.type === 'payment_reminder' || view.review)) return { ok: true, queued, visit: { id: saved.id, status: saved.status, revision: ownerVisitRevision(saved) }, postVisit: view, message: (input.type === 'payment_reminder' ? `Amount saved: ${input.amount}.` : 'Job marked done. Remaining visit reminders stop.') + ' Your current texting registration does not include review requests or payment reminders, so none are scheduled.' };
  return { ok: true, queued, visit: { id: saved.id, status: saved.status, revision: ownerVisitRevision(saved) }, postVisit: view, message: message + (view.review && input.type === 'mark_done' ? ' A review request is prepared; it sends only with the customer’s review permission and inside sending hours.' : '') };
}
