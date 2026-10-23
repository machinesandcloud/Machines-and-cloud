// Owner visit changes are local transactions. Provider reconcilers receive saved source
// records separately; neither a visit save nor a queue attempt is a delivery receipt.
import { createHash } from 'node:crypto';
import { list, atomicUpdate, reserveBookingWindow, finishStableBookingWindow, finishBookingWindow, capacityKey, indexWorkspaceRecord, addToIndex } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { configurationRevision, isSupportedSelfServiceClient } from './setup.mjs';
import { e164 } from './send.mjs';
import { belongsToWorkspace } from './workspace-identity.mjs';
import { deliveryTenant } from './managed-consent.mjs';
import { requestedDate, listedWindow, isElapsedWindow, canonicalWindow, AvailabilityInputError } from './availability.mjs';
import { queueCalendarBooking } from './calendar-delivery.mjs';
import { queueManagedRecord } from './managed-delivery.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const stamp = () => new Date().toISOString();
const active = status => ['booked', 'confirmed', 'on_the_way'].includes(status);
const OPERATIONS = 'owner_visit_operations', LOCKS = 'owner_visit_locks';
export class OwnerVisitError extends Error {
  constructor(code, message, status = 409, field = null) { super(message); this.code = code; this.status = status; this.field = field; }
}
export const ownerVisitRevision = booking => hash(JSON.stringify(canonical(booking)));
export function ownerVisitView(booking) {
  return { id: booking.id, customer_name: booking.customer_name, phone: booking.phone, issue: booking.issue, address: booking.address, date: booking.date, window: booking.window, status: booking.status, revision: ownerVisitRevision(booking), canChange: active(booking.status) };
}
async function authority(client, session, expectedRevision, { checkRevision = true } = {}) {
  const current = await strictRead('clients', client.slug);
  const access = session?.sessionHash ? await strictRead('access_sessions', session.sessionHash) : null;
  if (!access || access.scope !== 'onboarding' || access.status !== 'active' || !Number.isFinite(Date.parse(access.expiresAt)) || Date.parse(access.expiresAt) <= Date.now() || normalizeAccountEmail(access.email) !== normalizeAccountEmail(session.email)) throw new OwnerVisitError('verification_required', 'Sign in again before changing this visit.', 401);
  if (!current || !isSupportedSelfServiceClient(current) || deliveryTenant(current) !== deliveryTenant(client) || normalizeAccountEmail(current.owner?.email) !== normalizeAccountEmail(access.email)) throw new OwnerVisitError('forbidden', 'This visit belongs to another workspace.', 403);
  if (checkRevision && !['testing', 'live', 'paused'].includes(current.status)) throw new OwnerVisitError('workspace_unavailable', 'This workspace cannot change visits in its current state.');
  if (checkRevision && configurationRevision(current) !== expectedRevision) throw new OwnerVisitError('configuration_changed', 'Your saved business rules changed. Refresh before trying this change.');
  return current;
}
function shape(body) {
  const allowed = ['action', 'visitId', 'expectedRevision', 'expectedVisitRevision', 'submissionId', ...(['create_visit','reschedule_visit'].includes(body.action) ? ['date', 'window'] : []), ...(body.action === 'create_visit' ? ['customer_name','phone','address','issue'] : [])];
  if (!['create_visit', 'reschedule_visit', 'cancel_visit'].includes(body.action) || JSON.stringify(body).length > 1800 || Object.keys(body).some(key => !allowed.includes(key)) || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.visitId || '') || !/^[a-f0-9]{64}$/.test(body.expectedRevision || '') || body.action !== 'create_visit' && !/^[a-f0-9]{64}$/.test(body.expectedVisitRevision || '') || !/^[a-f0-9]{32,64}$/i.test(body.submissionId || '')) throw new OwnerVisitError('invalid_request', 'Refresh the visit and try again.', 400);
}
function owns(booking, client) { return booking?.slug === client.slug && booking.delivery?.tenantIdentity === deliveryTenant(client) && belongsToWorkspace(client, booking); }
async function releaseLock(key, operationId) {
  await atomicUpdate(LOCKS, key, row => row?.operationId === operationId ? { value: { ...row, operationId: null, completedAt: stamp() } } : {});
}
async function operationChange(key, change) { return atomicUpdate(OPERATIONS, key, row => { if (['complete','rejected'].includes(row?.state)) return { result:row }; const value = change(row); return { value, result: value }; }); }
async function finishAbort(client, operation, booking, key, lockKey) {
  if (!owns(booking, client) || booking.ownerVisitAbortFence !== operation.id || booking.ownerVisitMutation?.id === operation.id) throw new Error('Visit abort identity is uncertain');
  const capacity = await strictRead('index', capacityKey(client)), token = capacity?.mutations?.[booking.id];
  if (token === operation.id) {
    const claim = capacity.stableClaims?.[booking.id], creating = operation.input.action === 'create_visit';
    if (!claim || claim.token !== operation.id || claim.previous.length !== (creating ? 0 : 1)) throw new Error('Visit abort capacity is uncertain');
    await finishBookingWindow(client, booking.id, { ...claim, slot: claim.previous[0] || '', release: creating });
  } else {
    const expected = operation.input.action === 'create_visit' ? [] : [`${operation.source.date}|${canonicalWindow(operation.source.window)}`];
    if (token || JSON.stringify(capacity?.reservations?.[booking.id] || []) !== JSON.stringify(expected)) throw new Error('Visit abort completion is uncertain');
  }
  const failure = operation.abortError || operation.error || { code:'configuration_changed', message:'Your saved business rules changed. Refresh before trying this change.', status:409, field:null };
  await operationChange(key, row => ({ ...row, state:'rejected', error:failure }));
  await releaseLock(lockKey, operation.id);
  return new OwnerVisitError(failure.code, failure.message, failure.status, failure.field);
}
function result(operation, booking) {
  return { ok: true, localSaved: true, complete: operation.state === 'complete', visit: ownerVisitView(booking), calendar: operation.calendar || null, notifications: operation.notifications || 'pending', message: `Visit ${operation.input.action === 'create_visit' ? 'added' : operation.input.action === 'cancel_visit' ? 'cancelled' : 'rescheduled'} in your workspace. Calendar and customer notifications have separate delivery status.` };
}
export async function pendingOwnerVisitCreations(client) {
  const prefix = `${client.slug}/${deliveryTenant(client)}/`, keys = await list(OPERATIONS, prefix);
  const rows = await Promise.all(keys.map(key => strictRead(OPERATIONS, key)));
  const pending = [];
  for (const row of rows) {
    if (row?.tenantIdentity !== deliveryTenant(client) || row.input?.action !== 'create_visit' || row.state === 'complete') continue;
    if (row.state === 'rejected') {
      const lock = await strictRead(LOCKS, `${client.slug}/${deliveryTenant(client)}/${row.input.visitId}`);
      if (lock?.operationId !== row.id) continue;
    }
    pending.push({ state:row.state, input:row.input });
  }
  return pending;
}
export async function pendingOwnerVisitChange(client, visitId) {
  const tenant = deliveryTenant(client), lock = await strictRead(LOCKS, `${client.slug}/${tenant}/${visitId}`);
  if (!lock?.operationId) return null;
  const operation = await strictRead(OPERATIONS, `${client.slug}/${tenant}/${lock.operationId}`);
  if (!operation || operation.tenantIdentity !== tenant || operation.input.visitId !== visitId) return null;
  return { state: operation.state, input: operation.input };
}
export const ownerVisitId = (client, submissionId) => hash(`${deliveryTenant(client)}:${submissionId.toLowerCase()}`).slice(0,32);
export async function changeOwnerVisit(client, session, originalBody) {
  const body = originalBody?.action === 'create_visit' ? { ...originalBody, visitId: ownerVisitId(client, String(originalBody.submissionId || '')) } : originalBody;
  shape(body);
  const creating = body.action === 'create_visit';
  if (creating) {
    for (const [field, limit] of [['customer_name',120],['address',300],['issue',500]]) if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > limit) throw new OwnerVisitError('invalid_visit', `Add the customer's ${field === 'customer_name' ? 'name' : field}.`, 400, field);
    if (typeof body.phone !== 'string' || !/^[+()\d\s.-]+$/.test(body.phone) || !/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e164(body.phone) || '')) throw new OwnerVisitError('invalid_visit', 'Enter a valid customer callback number.', 400, 'phone');
  }
  const tenant = deliveryTenant(client), operationId = hash(`${tenant}:${body.submissionId.toLowerCase()}`), key = `${client.slug}/${tenant}/${operationId}`, lockKey = `${client.slug}/${tenant}/${body.visitId}`;
  const input = { ...body, submissionId: body.submissionId.toLowerCase() }, digest = hash(JSON.stringify(canonical(input)));
  let operation = await strictRead(OPERATIONS, key);
  let current = await authority(client, session, body.expectedRevision, { checkRevision: !operation });
  if (operation && operation.digest !== digest) throw new OwnerVisitError('submission_conflict', 'This submission was already used for a different visit change.');
  if (operation?.state === 'rejected') { await releaseLock(lockKey,operationId); throw new OwnerVisitError(operation.error.code, operation.error.message, operation.error.status, operation.error.field); }
  if (!operation) {
    // Reject invalid date/window choices before retaining an operation or capacity claim.
    if (['create_visit','reschedule_visit'].includes(body.action)) {
      try { requestedDate(body.date, { isoOnly: true }); } catch (error) { if (!(error instanceof AvailabilityInputError)) throw error; throw new OwnerVisitError(error.code, error.message, 400, 'date'); }
      if (!listedWindow(current, body.window)) throw new OwnerVisitError('invalid_window', 'Choose one of your saved arrival windows.', 400, 'window');
      if (isElapsedWindow(body.date, body.window)) throw new OwnerVisitError('elapsed', 'Choose a future arrival window.', 400, 'window');
    }
    operation = await atomicUpdate(OPERATIONS, key, row => {
      if (row && row.digest !== digest) throw new OwnerVisitError('submission_conflict', 'This submission was already used for a different change.');
      const value = row || { version: 1, id: operationId, slug: client.slug, tenantIdentity: tenant, digest, input, state: 'pending', createdAt: stamp(), actorEmail: session.email };
      return row ? { result: row } : { value, result: value };
    });
  }
  if (operation.state === 'rejected') { await releaseLock(lockKey,operationId); throw new OwnerVisitError(operation.error.code,operation.error.message,operation.error.status,operation.error.field); }
  if (operation.state === 'complete') {
    await releaseLock(lockKey, operationId);
    const saved = await strictRead('bookings', `${client.slug}/${body.visitId}`);
    if (!owns(saved, current)) throw new OwnerVisitError('visit_not_found', 'This visit is no longer available.', 404);
    return { ...result(operation, saved), superseded: saved.ownerVisitMutation?.id !== operationId };
  }
  await atomicUpdate(LOCKS, lockKey, row => {
    if (row?.operationId && row.operationId !== operationId) throw new OwnerVisitError('visit_busy', 'Another change is still being confirmed for this visit. Retry that saved change first.');
    const value = { operationId, tenantIdentity: tenant, visitId: body.visitId };
    return { value, result: value };
  });
  try {
    let booking = await strictRead('bookings', `${client.slug}/${body.visitId}`);
    if (!creating && !owns(booking, current) || creating && booking && !owns(booking, current)) throw new OwnerVisitError('visit_not_found', 'This visit is no longer available.', 404);
    if (booking?.ownerVisitAbortFence === operationId && booking.ownerVisitMutation?.id !== operationId) throw await finishAbort(current, operation, booking, key, lockKey);
    if (booking?.ownerVisitMutation?.id !== operationId) {
      current = await authority(client, session, body.expectedRevision);
      if (creating ? !!booking : ownerVisitRevision(booking) !== body.expectedVisitRevision || !active(booking.status)) throw new OwnerVisitError('visit_changed', 'This visit changed. Refresh its details before trying again.');
      operation = await operationChange(key, row => row.source ? row : { ...row, source: booking || { id: body.visitId }, mutationAt: stamp() });
      if (operation.state === 'rejected') { await releaseLock(lockKey,operationId); throw new OwnerVisitError(operation.error.code,operation.error.message,operation.error.status,operation.error.field); }
      if (operation.state === 'complete') { await releaseLock(lockKey,operationId); const latest=await strictRead('bookings',`${client.slug}/${body.visitId}`); if(!owns(latest,current))throw new OwnerVisitError('visit_not_found','This visit is no longer available.',404);return {...result(operation,latest),superseded:latest.ownerVisitMutation?.id!==operationId}; }
      const cancel = body.action === 'cancel_visit';
      const claim = await reserveBookingWindow(current, body.visitId, cancel ? booking.date : body.date, cancel ? booking.window : body.window, creating ? undefined : { date: operation.source.date, window: operation.source.window }, { requireExisting: cancel, mutationId: operationId });
      if (claim.full) throw new OwnerVisitError(claim.reason || 'window_full', claim.reason === 'blocked' ? 'That arrival window is blocked. Your original visit is unchanged.' : 'That arrival window is unavailable. Your original visit is unchanged.', 409, 'window');
      await indexWorkspaceRecord('bookings', { id: body.visitId, slug: current.slug, delivery: { tenantIdentity: tenant } });
      booking = await atomicUpdate('bookings', `${client.slug}/${body.visitId}`, async saved => {
        current = await authority(client, session, body.expectedRevision, { checkRevision:false });
        if (!creating && !owns(saved, current) || creating && saved && !owns(saved, current)) throw new OwnerVisitError('visit_not_found', 'This visit is no longer available.', 404);
        if (saved?.ownerVisitMutation?.id === operationId) return { result:saved };
        current = await authority(client, session, body.expectedRevision);
        const latestOperation = await strictRead(OPERATIONS,key);
        if (latestOperation?.state === 'rejected') throw new OwnerVisitError(latestOperation.error.code,latestOperation.error.message,latestOperation.error.status,latestOperation.error.field);
        if (latestOperation?.state === 'complete') throw new Error('A concurrent retry already completed this visit');
        const capacity = await strictRead('index', capacityKey(client));
        if (capacity?.mutations?.[body.visitId] !== operationId) throw new Error('Visit capacity ownership could not be confirmed');
        if (creating ? !!saved : ownerVisitRevision(saved) !== body.expectedVisitRevision || !active(saved.status)) throw new OwnerVisitError('visit_changed', 'This visit changed. Refresh its details before trying again.');
        const source = saved || { id: body.visitId, slug: client.slug, createdAt: operation.mutationAt, customer_name: body.customer_name.trim(), phone: e164(body.phone), address: body.address.trim(), issue: body.issue.trim(), status: 'booked', outcome: 'booked', channel: 'owner', customerType: 'new', managedActionId: operationId, delivery: { mode: 'portal_only', ownerContactConfirmed: false, tenantIdentity: tenant } };
        const value = { ...source, ...(cancel ? { status: 'cancelled', cancelledAt: operation.mutationAt } : { date: claim.date, dateSaid: claim.date, window: claim.window, rescheduledAt: operation.mutationAt }), updatedAt: operation.mutationAt,
          ownerVisitMutation: { id: operationId, action: body.action, at: operation.mutationAt }, ownerVisitHistory: [...(source.ownerVisitHistory || []), { action: body.action, at: operation.mutationAt, actor: session.email, previous: saved ? { date: saved.date, window: saved.window, status: saved.status } : null, next: { date: cancel ? source.date : claim.date, window: cancel ? source.window : claim.window, status: cancel ? 'cancelled' : source.status } }] };
        return { value, result: value };
      });
    }
    // A thrown write may already have committed. Only this exact marker can recover it.
    if (!owns(booking, current) || booking.ownerVisitMutation?.id !== operationId) throw new Error('Visit outcome is uncertain');
    const capacity = await strictRead('index', capacityKey(client)), token = capacity?.mutations?.[booking.id];
    if (token === operationId) {
      const claim = capacity.stableClaims?.[booking.id];
      if (!claim || claim.token !== operationId) throw new Error('Visit capacity recovery is unavailable');
      if (body.action === 'cancel_visit') await finishBookingWindow(client, booking.id, { ...claim, release: true });
      else await finishStableBookingWindow(client, booking.id, operationId);
    } else {
      const slots = capacity?.reservations?.[booking.id] || [], expected = body.action === 'cancel_visit' ? [] : [`${booking.date}|${canonicalWindow(booking.window)}`];
      if (token || JSON.stringify(slots) !== JSON.stringify(expected)) throw new Error('Visit capacity outcome is uncertain');
    }
    operation = await operationChange(key, row => ({ ...row, state: 'local_saved', localSavedAt: row.localSavedAt || stamp() }));
    if (operation.state === 'complete') { await releaseLock(lockKey, operationId); const latest = await strictRead('bookings', `${client.slug}/${body.visitId}`); if (!owns(latest,current)) throw new OwnerVisitError('visit_not_found','This visit is no longer available.',404); return { ...result(operation,latest), superseded:latest.ownerVisitMutation?.id !== operationId }; }
    if (operation.state === 'rejected') { await releaseLock(lockKey,operationId); throw new OwnerVisitError(operation.error.code,operation.error.message,operation.error.status,operation.error.field); }
    // Queue writes are local-only and replay safely from the authoritative booking.
    try {
      if (booking.phone) await addToIndex('bookings', current, booking.phone, booking.id);
      const calendar = await queueCalendarBooking(current, booking);
      await queueManagedRecord(current, booking, 'bookings');
      operation = await operationChange(key, row => ({ ...row, state: 'complete', calendar: calendar || null, notifications: 'prepared', completedAt: stamp() }));
      await releaseLock(lockKey, operationId);
    } catch { return { ...result(operation, booking), complete:false }; }
    return result(operation, booking);
  } catch (error) {
    const durable = await strictRead(OPERATIONS, key);
    if (durable?.state === 'complete') {
      current = await authority(client,session,body.expectedRevision,{checkRevision:false});
      const latest = await strictRead('bookings',`${client.slug}/${body.visitId}`);
      if (!owns(latest,current)) throw new OwnerVisitError('visit_not_found','This visit is no longer available.',404);
      await releaseLock(lockKey,operationId);
      return { ...result(durable,latest), superseded:latest.ownerVisitMutation?.id !== operationId };
    }
    // Only reject/release before any capacity claim or booking commit. Ambiguous
    // persistence retains the immutable operation and claim for the same retry.
    if (error instanceof OwnerVisitError) {
      const saved = await strictRead('bookings', `${client.slug}/${body.visitId}`), capacity = await strictRead('index', capacityKey(client));
      if (saved?.ownerVisitMutation?.id !== operationId && capacity?.mutations?.[body.visitId] === operationId && (creating ? !saved : ownerVisitRevision(saved) === body.expectedVisitRevision)) {
        // Fence any delayed conditional booking write before restoring the source slot.
        // An unacknowledged write can arrive late; simply releasing capacity is unsafe.
        operation = await operationChange(key, row => ({ ...row, abortError: { code:error.code, message:error.message, status:error.status, field:error.field } }));
        const fenced = await atomicUpdate('bookings', `${client.slug}/${body.visitId}`, row => {
          if (creating ? !!row : ownerVisitRevision(row) !== body.expectedVisitRevision || !owns(row, current)) throw new Error('Visit abort requires current source');
          const value = { ...(row || { id: body.visitId, slug: client.slug, status: 'creation_aborted', ownerVisitCreationAborted: true, delivery: { tenantIdentity: tenant } }), ownerVisitAbortFence: operationId };
          return { value, result:value };
        });
        throw await finishAbort(current, operation, fenced, key, lockKey);
      }
      const after = await strictRead('index', capacityKey(client));
      if (saved?.ownerVisitMutation?.id !== operationId && after?.mutations?.[body.visitId] !== operationId) {
        await operationChange(key, row => ({ ...row, state: 'rejected', error: { code: error.code, message: error.message, status: error.status, field: error.field } }));
        await releaseLock(lockKey, operationId); throw error;
      }
    }
    throw new OwnerVisitError('visit_outcome_uncertain', 'The visit change is still being confirmed. Retry the same saved change; do not submit a different one yet.', 503);
  }
}
