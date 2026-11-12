// Operator issue triage (PRA-OPS-01). Raw customer issues come from operator.mjs.
// This module only adds classification: it never removes an issue, so a genuine
// failure can be filtered or grouped in the view but is always in the payload.
//
// kind:     incident  - something failed or is stuck (provider error, failed
//                       operation or delivery, broken draft, customer report)
//           request   - a customer asked M&C to do something by hand
//           platform  - blocked only by a platform-wide feature that is deliberately
//                       off (provider state in BENIGN_PROVIDER_STATES); the same for
//                       every customer. Any other provider state is an incident.
//           waiting   - an expected onboarding state with a saved request
// severity: high | medium | info. Expected states are "info" until they age
//           past WAITING_OVERDUE_HOURS, then become "medium" (customer waiting
//           too long). Incidents keep their original severity.
export const WAITING_OVERDUE_HOURS = { platform: 72, waiting: 72, request: 24 };
export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, info: 3 };
const LABEL = { voice: 'Phone answering', sms: 'Text messaging', calendar: 'Google Calendar' };
const PROVIDER = { voice: 'voice', sms: 'sms', calendar: 'calendar' };
const PLATFORM_REASONS = ['service_configuration_required', 'calendar_platform_required'];
// Provider states (operatorProviderStates) in which a platform block is an expected, benign wait.
// Anything else, including unknown or future states, is treated as an issue.
export const BENIGN_PROVIDER_STATES = Object.freeze(['disabled']);
const WAITING_REASONS = {
  recorded_setup_waiting_platform: ['saved setup is waiting for the platform', 'Saved setup is waiting for the platform', 'The customer’s approved setup is recorded and will continue automatically. Check System if it stays here.'],
  service_offer_required: ['needs an approved offer', 'Needs an approved offer before setup can start', 'No offer covers this channel for this customer yet. Make an offer available when this customer should proceed.'],
  resource_allowance_required: ['outside the managed-resource allowance', 'Outside the managed-resource allowance', 'The admission policy does not cover this customer’s number or registration. Extend the allowance when this customer should proceed.'],
};
const hoursSince = (iso, now) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? Math.max(0, (now - t) / 3600000) : null; };
const days = hours => Math.max(1, Math.floor(hours / 24));

function waitingFields(base, { since, now, limit }) {
  const age = hoursSince(since, now), overdue = age !== null && age >= limit;
  return { ...base, since: since || null, ageHours: age === null ? null : Math.floor(age), overdue, overdueAfterHours: limit, severity: overdue ? 'medium' : 'info', actionable: overdue };
}

export function classifyIssue(issue, { client, providerStates = {}, now = Date.now() } = {}) {
  const id = String(issue?.id || '');
  const platform = /^connection:(voice|sms|calendar):platform$/.exec(id);
  if (platform) {
    const channel = platform[1], name = LABEL[channel], state = providerStates[PROVIDER[channel]]?.status || 'unknown';
    // Overdue clock: when the waiting state started, never the latest touch. The earliest known
    // time is used, so re-saving an operation cannot restart it; future timestamps are ignored.
    const since = [issue.setupProgress?.startedAt, issue.setupProgress?.createdAt, issue.setupProgress?.updatedAt, issue.requestedAt, client?.onboarding?.connectionsUpdatedAt, client?.createdAt]
      .map(v => Date.parse(v || '')).filter(t => Number.isFinite(t) && t <= now).sort((a, b) => a - b).map(t => new Date(t).toISOString())[0] || null;
    const customerNextStep = issue.detail || '';
    // Allowlist, not denylist: only a provider state known to mean "deliberately off" is an expected wait.
    // configured, needs_attention, a missing state and any future state with a blocked customer are faults.
    const benign = BENIGN_PROVIDER_STATES.includes(state);
    const stateText = state === 'unknown' ? 'does not report a provider state' : 'reports ' + state;
    const copy = WAITING_REASONS[issue.reasonCode];
    if (!benign && PLATFORM_REASONS.includes(issue.reasonCode)) {
      return { ...issue, kind: 'incident', severity: 'high', actionable: true, since, providerState: state, group: 'platform_config:' + channel,
        title: name + ' is blocked while the platform ' + stateText, groupTitle: name + ' is blocked while the platform ' + stateText,
        detail: 'The platform feature is not switched off, but this customer’s saved request cannot start (credentials, policy/offer, encryption key or the usage brake). Check System; the request is kept.',
        groupDetail: 'The platform feature is not switched off, but customers who requested it are blocked (credentials, policy/offer, encryption key or the usage brake). Check System; saved requests are kept.',
        customerNextStep };
    }
    if (PLATFORM_REASONS.includes(issue.reasonCode)) {
      return waitingFields({ ...issue, kind: 'platform', providerState: state, group: 'platform_disabled:' + channel,
        title: name + ' requested; turned off platform-wide', groupTitle: name + ' is turned off platform-wide',
        detail: 'Expected while the feature is off. The customer selected it at signup; nothing was sent to a provider and the request is kept. No action for this customer until the feature is enabled in System.',
        groupDetail: 'Customers who selected this at signup. Their requests are kept and nothing was sent to a provider. Next action: enable the feature in System when ready, or tell long-waiting customers when to expect it.',
        customerNextStep }, { since, now, limit: WAITING_OVERDUE_HOURS.platform });
    }
    // An unrecognised reason code is an incident: fail toward actionable.
    if (!copy) return { ...issue, kind: 'incident', severity: 'high', actionable: true, since, providerState: state, group: 'platform_unknown_reason:' + channel,
      title: name + ': unrecognised platform block (' + String(issue.reasonCode || 'none').slice(0, 60) + ')', customerNextStep };
    // A known waiting reason is informational only while the feature is deliberately off; otherwise it needs action now.
    return waitingFields({ ...issue, kind: 'waiting', providerState: state, group: 'waiting:' + channel + ':' + issue.reasonCode,
      title: name + ': ' + copy[0], groupTitle: name + ': ' + copy[1].charAt(0).toLowerCase() + copy[1].slice(1), detail: copy[2], groupDetail: copy[2], customerNextStep },
      { since, now, limit: benign ? WAITING_OVERDUE_HOURS.waiting : 0 });
  }
  if (/^lead:[a-z0-9_-]+:setup$/.test(id)) {
    const r = waitingFields({ ...issue, kind: 'request' }, { since: issue.requestedAt || null, now, limit: WAITING_OVERDUE_HOURS.request });
    // A customer explicitly asked for manual setup: always actionable, escalates when old.
    return { ...r, severity: r.overdue ? 'high' : 'medium', actionable: true, title: r.overdue ? issue.title + ' (waiting ' + days(r.ageHours) + ' day' + (days(r.ageHours) === 1 ? '' : 's') + ')' : issue.title };
  }
  const severity = SEVERITY_RANK[issue?.severity] === undefined ? 'high' : issue.severity;
  return { ...issue, kind: 'incident', severity, actionable: severity !== 'info' };
}

export function classifyIssues(issues, context) { return (Array.isArray(issues) ? issues : []).map(issue => classifyIssue(issue, context)); }
export const actionableIssues = issues => (Array.isArray(issues) ? issues : []).filter(issue => issue.actionable !== false);
