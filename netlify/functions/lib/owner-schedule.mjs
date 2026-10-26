// The schedule browses saved records. It does not grant availability or read
// external Calendar event details; the existing visit check remains authoritative.
import { listWorkspaceRecords, readSavedAvailabilityBlocks, assertCurrentWorkspace } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { getAccessSession } from './access.mjs';
import { workspaceTenant, belongsToWorkspace, WorkspaceIdentityError } from './workspace-identity.mjs';
import { isSupportedSelfServiceClient } from './setup.mjs';
import { isoDateValid } from './availability.mjs';
import { ownerVisitView, pendingOwnerVisitChange } from './owner-visits.mjs';

export class ScheduleReadError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export async function readOwnerSchedule(client, req, params) {
  try {
  const from = params.get('from'), to = params.get('to');
  if (params.get('schedule') !== '1' || [...params.keys()].length !== 4 ||
      ['c', 'schedule', 'from', 'to'].some(name => params.getAll(name).length !== 1) ||
      !isoDateValid(from) || !isoDateValid(to) || to < from ||
      (Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000 >= 42) {
    throw new ScheduleReadError('invalid_schedule_range', 'Choose a calendar range of up to 42 days.');
  }
  const [page, blocks] = await Promise.all([listWorkspaceRecords(client, 'bookings', 2000), readSavedAvailabilityBlocks(client)]);
  const visible = page.records.filter(row => !row.ownerVisitCreationAborted && belongsToWorkspace(client, row));
  const dated = visible.filter(row => isoDateValid(row.date) && row.date >= from && row.date <= to);
  const undated = visible.filter(row => !isoDateValid(row.date));
  const project = rows => Promise.all(rows.map(async row => ({ ...row, ownerVisit: ownerVisitView(row), pendingVisitChange: await pendingOwnerVisitChange(client, row.id) })));
  const [bookings, undatedBookings] = await Promise.all([project(dated), project(undated)]);
  // Long record reads must not outlive the session or originating tenant.
  await assertCurrentWorkspace(client);
  const [current, active] = await Promise.all([strictRead('clients', client.slug), getAccessSession(req)]);
  if (!active) throw new ScheduleReadError('verification_required', 'Sign in again to see your schedule.', 401);
  if (!isSupportedSelfServiceClient(current) || workspaceTenant(current) !== workspaceTenant(client) ||
      normalizeAccountEmail(current.owner?.email) !== normalizeAccountEmail(active.email)) {
    throw new ScheduleReadError('forbidden', 'This schedule belongs to another workspace.', 403);
  }
  return { from, to, timezone: 'America/Chicago', bookings, undatedBookings,
    availabilityBlocks: blocks.filter(row => row.date >= from && row.date <= to),
    listing: { ...page.listing, complete: page.listing.incomplete === false },
    checkedAt: new Date().toISOString() };
  } catch(error) {
    if(error instanceof WorkspaceIdentityError)throw new ScheduleReadError('forbidden','This workspace changed. Sign in again to see its schedule.',403);
    throw error;
  }
}
