// Owner activity and pending work use the complete tenant index, not the recent inbox preview.
import { listWorkspaceRecords, assertCurrentWorkspace } from './store.mjs';
import { requestFollowthroughSummaries } from './request-followthrough.mjs';
import { belongsToWorkspace } from './workspace-identity.mjs';
import { arrivalInstant } from './service-time.mjs';

export async function workspaceActivity(client, days, at = new Date()) {
  if (![7, 30, 90].includes(days)) throw Object.assign(new Error('Choose 7, 30 or 90 days.'), { code: 'invalid_report_period', status: 400 });
  await assertCurrentWorkspace(client);
  const [leadPage, visitPage] = await Promise.all([
    listWorkspaceRecords(client, 'leads', 2000), listWorkspaceRecords(client, 'bookings', 2000),
  ]);
  if (leadPage.listing.incomplete || visitPage.listing.incomplete) throw Object.assign(new Error('We could not read the full history for this report. Your saved requests are still available in Inbox. Please contact support if this continues.'), { code: 'history_incomplete' });
  const real = row => belongsToWorkspace(client, row) && !row.websiteSetupCheck && !row.simulation && !row.ownerVisitCreationAborted && row.status !== 'spam' && row.outcome !== 'spam';
  const leads = await requestFollowthroughSummaries(client, leadPage.records.filter(real));
  const visits = visitPage.records.filter(real);
  if ([...leads, ...visits].some(row => !Number.isFinite(Date.parse(row.createdAt))) || leads.some(row => row.followthrough.state.dueAt && !Number.isFinite(Date.parse(row.followthrough.state.dueAt)))) throw Object.assign(new Error('Some saved activity dates could not be checked. Your saved requests are still available in Inbox. Please contact support before relying on this report.'), { code: 'history_incomplete' });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const startDate = new Date(Date.parse(today + 'T12:00:00Z') - (days - 1) * 86400000).toISOString().slice(0, 10);
  const from = arrivalInstant(startDate, '12am to 1am'), until = at.getTime();
  const inPeriod = value => Number.isFinite(Date.parse(value)) && Date.parse(value) >= from && Date.parse(value) <= until;
  const received = leads.filter(row => inPeriod(row.createdAt));
  const requested = visits.filter(row => inPeriod(row.createdAt));
  const pending = leads.filter(row => row.followthrough.needsFollowup).sort((a, b) => {
    const priority = row => row.urgency === 'emergency' ? 0 : row.followthrough.due ? 1 : row.followthrough.reviewRequired ? 2 : 3;
    return priority(a) - priority(b) || String(a.followthrough.state.dueAt || '9999').localeCompare(String(b.followthrough.state.dueAt || '9999')) || String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id);
  });
  await assertCurrentWorkspace(client);
  return {
    version: 1, generatedAt: at.toISOString(), timeZone: 'America/Chicago', complete: true,
    period: { days, from: new Date(from).toISOString(), until: at.toISOString(), startDate, endDate: today },
    activity: {
      inquiries: received.length, visitRequests: requested.length,
      followupsCompleted: leads.filter(row => !row.followthrough.reviewRequired && inPeriod(row.followthrough.state.completedAt)).length,
      contactsMarkedReached: received.filter(row => row.followthrough.state.contact === 'reached').length,
    },
    attention: {
      total: pending.length, overdue: pending.filter(row => row.followthrough.due).length,
      items: pending.map(row => ({ id: row.id, name: row.customer_name || 'Customer request', issue: row.issue || '', createdAt: row.createdAt, urgent: row.urgency === 'emergency', due: row.followthrough.due, reviewRequired: row.followthrough.reviewRequired, nextAction: row.followthrough.state.nextAction, dueAt: row.followthrough.state.dueAt })),
    },
  };
}
