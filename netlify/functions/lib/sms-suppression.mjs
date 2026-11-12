// Cross-store opt-out read for the managed outbox send-time check (OH-1).
// A STOP can land in three stores: managed_sms_consent (a shop's own number), the legacy
// `optouts` store (sms.mjs, keyed by phone) and the platform ledger directives
// (/api/platform-sms, the shared M&C sender that legacy bridge shops also text from).
// mayDeliverManagedSMS() already reads the first; this adds the other two so a STOP sent
// to the shared sender, or to a legacy shop line, also stops managed texts to that phone.
//
// Rules:
// - Read-only. Nothing here writes a store, so no migration and no new CAS contention.
// - Strict reads: an unreadable store throws, and the outbox treats a throw as "not now"
//   (the job waits and is retried, never sent while unreadable). This is fail closed. After the
//   send claim, managed-delivery releases the claim on a throw, so the job is not left
//   "uncertain" and sends once the store recovers (rev 2, QA-OPT F1).
// - A later opt-in on the shop's own number wins, for that shop only: a managed START lifts the
//   cross-store STOP for every purpose (each program's own proof still has to postdate the
//   START); a newer YES to the appointment question lifts it for appointment purposes only, so
//   it never revives older review or follow-up consent (rev 2, QA-OPT F2).
// - A legacy row without a usable time still blocks (hand-entered records, QA Q8).
import { strictRead } from './accounts.mjs';

const ms = value => { const n = typeof value === 'number' ? value : Date.parse(value || ''); return Number.isFinite(n) ? n : null; };
// Newest explicit opt-in recorded on the shop's own number, or null.
// QA-OPT F2: a YES to the appointment question re-opts in to appointment texts only.
const APPOINTMENT_PURPOSES = new Set(['confirmation', 'reminder_24h', 'reminder_1h', 'cancelled', 'payment_reminder', 'reply', 'consent_ask']);
function managedOptInAt(row, purpose = null) {
  // directiveDate is the provider time of the last applied START or STOP; with startedAt set and
  // the row not suppressed, it is the START. A YES consent proof carries its own provider time.
  const times = [row?.suppressed === false && row?.startedAt ? ms(row.directiveDate) : null, row?.transactional === true && APPOINTMENT_PURPOSES.has(purpose) ? ms(row.proof?.providerDate) : null].filter(n => n !== null);
  return times.length ? Math.max(...times) : null;
}
// Returns null when no other store suppresses this phone, else { source, at }.
export async function crossStoreOptOut(phone, managedRow = null, purpose = null) {
  if (!/^\+1[2-9]\d{9}$/.test(phone || '')) return { source: 'invalid_phone', at: null };
  const [legacy, ledger] = await Promise.all([strictRead('optouts', phone), strictRead('platform_sms_messages', 'inbound_v1')]);
  const optIn = managedOptInAt(managedRow, purpose);
  const newer = at => at === null || optIn === null || at >= optIn;
  if (legacy) { const at = ms(legacy.at); if (newer(at)) return { source: 'legacy_optout', at }; }
  // Every binding is scanned, so a STOP survives a change of platform number or service.
  const suffix = '/' + phone;
  for (const [key, directive] of Object.entries(ledger?.directives || {})) {
    if (!key.endsWith(suffix) || directive?.suppressed !== true) continue;
    const at = ms(directive.at); if (newer(at)) return { source: 'platform_directive', at };
  }
  return null;
}
