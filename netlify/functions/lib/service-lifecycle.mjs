// Website publication does not begin a new native-service authority period.
// Pause, resume and cancellation still change the shared lifecycle version.
import { createHash } from 'node:crypto';
const hash = values => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const active = c => ['testing', 'live'].includes(c?.status);
export function serviceLifecycle(c) {
  return hash([active(c) ? 'active' : c.status, c.operationLifecycleVersion || 0, c.pausedAt || null, c.cancelledAt || null]);
}
export function serviceLifecycleMatches(c, recorded) {
  if (recorded === serviceLifecycle(c)) return true;
  // Retained approvals used status/liveAt in their digest. Accept only the
  // current legacy digest or the testing precursor in this SAME authority era.
  const legacy = (status, liveAt) => hash([status, c.operationLifecycleVersion || 0, c.pausedAt || null, c.cancelledAt || null, liveAt]);
  return recorded === legacy(c.status, c.liveAt || null) ||
    active(c) && recorded === legacy('testing', null);
}
