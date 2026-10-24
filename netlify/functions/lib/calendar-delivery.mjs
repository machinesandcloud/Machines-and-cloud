// Durable, source-reconciled Google Calendar delivery for verified customer workspaces.
import { createHash, randomBytes } from "node:crypto";
import { atomicUpdate, list, checkCalendarBookingWindow } from "./store.mjs";
import { belongsToWorkspace } from "./workspace-identity.mjs";
import { strictRead } from "./accounts.mjs";
import { isSupportedSelfServiceClient } from "./setup.mjs";
import { canonicalWindow, isoDateValid, addDays, houstonToday } from "./availability.mjs";
import { accessSite } from "./access.mjs";
import { CalendarError, CALENDAR_AVAILABILITY_CONSENT_VERSION, calendarConnectionEnabled, calendarTenantIdentity, getCalendarConnection, googleAccessToken } from "./calendar-connection.mjs";
import { calendarExecutionPolicy, calendarExecutionAvailable, assertCalendarExecution, admitCalendarExecution, guardedCalendarFetch, calendarClaimExpired } from './calendar-execution.mjs';
const hash = value => createHash("sha256").update(value).digest("hex");
const stamp = () => new Date().toISOString();
const nextUtcDay = () => { const date = new Date(); date.setUTCHours(24, 0, 0, 0); return date.toISOString(); };
const ACTIVE = new Set(["booked", "confirmed", "on_the_way"]);
const validId = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const validSlug = value => typeof value === "string" && /^[a-z0-9-]{1,40}$/.test(value);
export const calendarDeliveryEnabled = () => process.env.CALENDAR_DELIVERY_ENABLED === "true" && (process.env.SERVICE_WORKER_KEY || "").length >= 32 && calendarConnectionEnabled();
export const calendarEventId = (client, bookingId) => `mc${hash(`machinesandcloud:calendar:v1:${calendarTenantIdentity(client)}:${bookingId}`)}`;
export const calendarDeliveryKey = (client, bookingId) => `${client.slug}/${calendarTenantIdentity(client)}/${bookingId}`;
const ownerTag = (tenantIdentity, bookingId) => hash(`${tenantIdentity}:${bookingId}`);
const source = booking => ({ status: ["cancelled", "canceled"].includes(booking.status) ? "cancelled" : "active", customer_name: String(booking.customer_name || ""), phone: String(booking.phone || ""), address: String(booking.address || ""), issue: String(booking.issue || ""), date: String(booking.date || ""), window: String(booking.window || ""), urgency: String(booking.urgency || ""), notes: String(booking.notes || "") });
const sourceRevision = booking => hash(JSON.stringify(source(booking)));
const keyFor = (slug, bookingId) => `${slug}/${bookingId}`;
function bodyFor(job) {
  const b = job.desired, clock = canonicalWindow(b.window), parts = /^(\d+)-(\d+)$/.exec(clock);
  const [start, end] = parts ? parts.slice(1).map(Number) : [NaN, NaN];
  if (!isoDateValid(b.date) || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1440 || end <= start) throw new CalendarError("invalid_booking", "The saved visit needs a real date and a timed arrival window.");
  const dateTime = minutes => `${minutes === 1440 ? addDays(b.date, 1) : b.date}T${String(Math.floor(minutes % 1440 / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
  // Google's explicit IANA timeZone resolves the event's local wall time, including DST.

  return { summary: `${b.issue} - ${b.customer_name}`.slice(0, 300), description: `Saved by your front desk.\nCustomer: ${b.customer_name}\nPhone: ${b.phone}\nIssue: ${b.issue}\nUrgency: ${b.urgency}\nNotes: ${b.notes || "-"}`.slice(0, 8000), location: b.address.slice(0, 1000), start: { dateTime: dateTime(start), timeZone: "America/Chicago" }, end: { dateTime: dateTime(end), timeZone: "America/Chicago" }, extendedProperties: { private: { mcOwner: ownerTag(job.tenantIdentity, job.bookingId), mcVersion: String(job.version), mcRevision: job.sourceRevision } } };
}
const dto = job => ({ bookingId: job.bookingId, state: job.state, action: job.desired.status === "cancelled" ? "cancel" : "sync", updatedAt: job.updatedAt, completedAt: job.completedAt || null, attempts: job.attempts || 0, reasonCode: job.reasonCode || null, detail: job.detail || "Calendar work is saved.", nextAttemptAt: job.nextAttemptAt || null });
async function supportedClient(client) {
  if (!validSlug(client?.slug)) throw new CalendarError("invalid_workspace", "This workspace is invalid.", 400);
  const saved = await strictRead("clients", client.slug);
  if (!saved || !isSupportedSelfServiceClient(saved) || saved.owner?.email?.toLowerCase() !== client.owner?.email?.toLowerCase() || calendarTenantIdentity(saved) !== calendarTenantIdentity(client)) throw new CalendarError("forbidden", "This calendar belongs to another workspace.", 403);
  return saved;
}
export async function calendarDeliveryView(client) {
  await supportedClient(client);
  const keys = await list("calendar_deliveries", `${client.slug}/`);
  const jobs = (await Promise.all(keys.map(key => strictRead("calendar_deliveries", key)))).filter(job => job?.tenantIdentity === calendarTenantIdentity(client));
  const counts = {};
  for (const job of jobs) counts[job.state] = (counts[job.state] || 0) + 1;
  return { enabled: calendarDeliveryEnabled() && await calendarExecutionAvailable(client, { actions:['tokenRefresh','calendarRead'],anyActions:['eventCreate','eventUpdate','eventDelete'] }), counts, total: jobs.length, jobs: jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30).map(dto), scope: "Latest 30 calendar jobs; counts include all retained jobs. Connected owned-calendar busy time is checked before new visit reservations and calendar creates or moves; saved arrival windows remain yours." };
}
export async function queueCalendarBooking(client, booking) {
  await supportedClient(client);
  if (!validId(booking?.id) || booking.slug !== client.slug) throw new CalendarError("invalid_booking", "This saved visit belongs to another workspace.", 400);
  if (booking.websiteSetupCheck || booking.simulation) return null;
  if (!await calendarExecutionAvailable(client, { bookingId: booking.id, localOnly: true })) return null;
  // Seal reviewed retained-resource authority before our own enqueue changes the
  // inspected snapshot. This grants no transport and spends no request allowance.
  await admitCalendarExecution(client, {bookingId:booking.id,localOnly:true});
  const key = calendarDeliveryKey(client, booking.id);
  const result = await atomicUpdate("calendar_deliveries", key, async job => {
    // Re-read the source inside every CAS attempt; a delayed enqueue cannot regress a newer visit.
    const current = await supportedClient(client), saved = await strictRead("bookings", keyFor(client.slug, booking.id));
    if (!saved) throw new CalendarError("booking_not_saved", "Save the visit before syncing Calendar.");
    if (saved.delivery?.tenantIdentity !== calendarTenantIdentity(current) || !belongsToWorkspace(current, saved) || saved.websiteSetupCheck || saved.simulation) return { result: null };
    const connection = await getCalendarConnection(current.slug), revision = sourceRevision(saved);
    if (!job && (!connection || !ACTIVE.has(saved.status) || saved.date < houstonToday())) return { result: null };
    if (job?.sourceRevision === revision && job.lifecycleVersion === (current.operationLifecycleVersion || 0) && (!connection || job.connectionId === connection.connectionId)) return { result: job };
    const targetId = job?.targetId || connection?.targetId;
    const next = { ...(job || {}), slug: current.slug, storageKey: key, tenantIdentity: calendarTenantIdentity(current), bookingId: saved.id, eventId: calendarEventId(current, saved.id), targetId, connectionId: connection?.connectionId || job?.connectionId || null, targetHash: job?.targetHash || connection?.targetHash, sourceRevision: revision, desired: source(saved), version: (job?.version || 0) + 1, lifecycleVersion: current.operationLifecycleVersion || 0, state: "queued", attempts: 0, claim: null, nextAttemptAt: null, reasonCode: null, detail: "Saved visit is waiting to sync.", createdAt: job?.createdAt || stamp(), updatedAt: stamp(), completedAt: null };
    return { value: next, result: next };
  });
  return result ? dto(result) : null;
}

function assertOwned(job, event) {
  if (event.extendedProperties?.private?.mcOwner !== ownerTag(job.tenantIdentity, job.bookingId)) throw new CalendarError("event_ownership_conflict", "A calendar event with this reference is not owned by this saved visit. Operator review is required.");
  const remoteVersion = Number(event.extendedProperties?.private?.mcVersion);
  if (!Number.isInteger(remoteVersion) || remoteVersion < 1) throw new CalendarError("event_ownership_conflict", "The calendar event version could not be confirmed.");
  return remoteVersion;
}
async function requestGoogle(job, connection, token, method, eventId, body, etag, deadline) {
  const suffix = eventId ? `/${encodeURIComponent(eventId)}` : "";
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.targetId)}/events${suffix}${method === "GET" ? "" : "?sendUpdates=none"}`;
  let response;
  const client = await strictRead('clients', job.slug);
  try { response = await guardedCalendarFetch(client, ({ GET:'calendarRead',POST:'eventCreate',PATCH:'eventUpdate',DELETE:'eventDelete' })[method], url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...(etag ? { "If-Match": etag } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }, { targetId: connection.targetId, bookingId: job.bookingId, deadline, authorize: async () => { const current = await latestJob(job); return calendarDeliveryEnabled() && current.connectionId === connection.connectionId; } }); }
  catch (error) { if (error.code?.startsWith('calendar_')) throw new CalendarError(error.code, error.message, 503); throw new CalendarError("delivery_uncertain", "Google did not confirm the change. The next attempt will check the same event reference before writing.", 503); }
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function latestJob(job) {
  const saved = await strictRead("calendar_deliveries", job.storageKey);
  if (!saved || saved.version !== job.version || saved.claim?.token !== job.claim?.token || saved.sourceRevision !== job.sourceRevision) throw new CalendarError("superseded", "A newer saved visit will be synced instead.");
  const [client, booking, connection] = await Promise.all([strictRead("clients", job.slug), strictRead("bookings", keyFor(job.slug, job.bookingId)), getCalendarConnection(job.slug)]);
  if (!client || !isSupportedSelfServiceClient(client) || calendarTenantIdentity(client) !== job.tenantIdentity || !["testing", "live"].includes(client.status) || (client.operationLifecycleVersion || 0) !== job.lifecycleVersion) throw new CalendarError("workspace_changed", "Workspace status changed. Refresh calendar setup before resuming.");
  if (!booking || booking.websiteSetupCheck || booking.simulation || booking.delivery?.tenantIdentity !== job.tenantIdentity || !belongsToWorkspace(client, booking) || sourceRevision(booking) !== job.sourceRevision) throw new CalendarError("superseded", "A newer saved visit will be synced instead.");
  if (!connection) throw new CalendarError("reconnect_required", "Connect Calendar to resume saved work.");
  if (connection.targetId !== job.targetId) throw new CalendarError("calendar_target_changed", "A different Google calendar is connected. Existing event references are retained for review.");
  await assertCalendarExecution(client, { targetId: connection.targetId, bookingId: job.bookingId });
  return connection;
}
async function recordCreateState(job, token, state) {
  await atomicUpdate("calendar_deliveries", job.storageKey, row => row?.createAttempt?.token === token && !(row.createAttempt.state === "observed" && state !== "observed") ? { value: { ...row, createAttempt: { ...row.createAttempt, state, updatedAt: stamp() } } } : {});
}
async function observedCreate(job) {
  await atomicUpdate("calendar_deliveries", job.storageKey, row => row?.createAttempt && ["sending", "uncertain", "acknowledged"].includes(row.createAttempt.state) ? { value: { ...row, createAttempt: { ...row.createAttempt, state: "observed", updatedAt: stamp() } } } : {});
}
async function reconcile(job, deadline) {
  let connection = await latestJob(job);
  const token = await googleAccessToken(job.slug, connection.connectionId, { deadline });
  let remote = await requestGoogle(job, connection, token, "GET", job.eventId, null, null, deadline);
  if (job.desired.status === "cancelled") {
    if ([404, 410].includes(remote.response.status)) {
      const latest = await strictRead("calendar_deliveries", job.storageKey);
      if (latest?.createAttempt && ["sending", "uncertain", "acknowledged"].includes(latest.createAttempt.state)) throw new CalendarError("creation_unconfirmed", "An earlier calendar creation is still unconfirmed. Cancellation will keep checking the same reference; no second event will be created.", 503);
      return { cancelled: true };
    }
    if (remote.response.ok && remote.data.status === "cancelled") { await observedCreate(job); return { cancelled: true }; }
    if (!remote.response.ok) throw new CalendarError("google_unavailable", "Google could not confirm the existing calendar event.", 503);
    const version = assertOwned(job, remote.data);
    await observedCreate(job);
    if (version > job.version) throw new CalendarError("superseded", "A newer calendar change is already saved.");
    if (!remote.data.etag) throw new CalendarError("event_etag_missing", "Google did not return an event version. No deletion was attempted.");
    connection = await latestJob(job);
    const removed = await requestGoogle(job, connection, token, "DELETE", job.eventId, null, remote.data.etag, deadline);
    if (removed.response.ok || [404, 410].includes(removed.response.status)) return { cancelled: true };
    throw new CalendarError(removed.response.status === 412 ? "remote_changed" : "google_unavailable", "Calendar changed during cancellation. Saved work will be checked again.", 503);
  }
  const body = bodyFor(job);
  if (remote.response.status === 404) {
    const client=await strictRead('clients',job.slug);
    if(!await checkCalendarBookingWindow(client,job.desired.date,job.desired.window,job.bookingId,{accessToken:token,deadline}))throw new CalendarError('calendar_conflict','A conflicting calendar appointment appeared. Your saved visit is retained; no Google event was created. Calendar delivery will check again.',503);
    connection = await latestJob(job);
    const createToken = randomBytes(16).toString("hex");
    await atomicUpdate("calendar_deliveries", job.storageKey, row => {
      if (!row || row.version !== job.version || row.claim?.token !== job.claim.token) throw new CalendarError("superseded", "A newer saved visit will be synced instead.");
      if (row.createAttempt) throw new CalendarError(row.createAttempt.state === "observed" || row.receipt ? "remote_event_deleted" : "creation_unconfirmed", row.createAttempt.state === "observed" || row.receipt ? "The previously observed calendar event is missing. Its reference is retained for review." : "An earlier calendar creation is unconfirmed. The same reference will be checked; no second event will be created.", 503);
      return { value: { ...row, createAttempt: { token: createToken, version: job.version, state: "sending", startedAt: stamp() } } };
    });
    let inserted;
    try { inserted = await requestGoogle(job, connection, token, "POST", null, { id: job.eventId, ...body }, null, deadline); }
    catch (error) {
      if (error.code === "calendar_budget_exhausted") {
        // Reservation rejects before fetch. Remove only this invocation's
        // undispatched marker; a prior or actually dispatched create stays retained.
        await atomicUpdate("calendar_deliveries", job.storageKey, row => {
          if (row?.createAttempt?.token !== createToken || row.createAttempt.state !== "sending") return {};
          const value = { ...row }; delete value.createAttempt; return { value };
        });
      } else await recordCreateState(job, createToken, "uncertain");
      throw error;
    }
    await recordCreateState(job, createToken, inserted.response.ok ? "acknowledged" : "uncertain");
    if (inserted.response.ok) {
      if (inserted.data.id !== job.eventId || inserted.data.extendedProperties?.private?.mcOwner !== ownerTag(job.tenantIdentity, job.bookingId)) throw new CalendarError("delivery_uncertain", "Google's event receipt could not be confirmed. The same reference will be checked.", 503);
      await recordCreateState(job, createToken, "observed");
      return { eventId: job.eventId };
    }
    if (inserted.response.status !== 409) throw new CalendarError("google_unavailable", "Google could not confirm the saved visit. It will be checked again.", 503);
    // Duplicate insert or lost prior response: get the exact deterministic event, never mint another ID.
    remote = await requestGoogle(job, connection, token, "GET", job.eventId, null, null, deadline);
  }
  if (!remote.response.ok) throw new CalendarError("google_unavailable", "Google could not confirm the calendar event.", 503);
  if (remote.data.status === "cancelled") throw new CalendarError("remote_event_deleted", "This calendar event was deleted. Its reference is retained; create a new saved visit to book again.");
  const version = assertOwned(job, remote.data);
  await observedCreate(job);
  if (version > job.version) throw new CalendarError("superseded", "A newer calendar change is already saved.");
  if (remote.data.extendedProperties.private.mcRevision === job.sourceRevision && version === job.version) return { eventId: job.eventId, reconciled: true };
  if (!remote.data.etag) throw new CalendarError("event_etag_missing", "Google did not return an event version. No overwrite was attempted.");
  const client=await strictRead('clients',job.slug);
  if(!await checkCalendarBookingWindow(client,job.desired.date,job.desired.window,job.bookingId,{accessToken:token,deadline}))throw new CalendarError('calendar_conflict','The requested window conflicts with another calendar appointment. The existing Google event and saved visit remain unchanged; delivery will check again.',503);
  connection = await latestJob(job);
  const patched = await requestGoogle(job, connection, token, "PATCH", job.eventId, body, remote.data.etag, deadline);
  if (patched.response.ok) return { eventId: job.eventId };
  throw new CalendarError(patched.response.status === 412 ? "remote_changed" : "google_unavailable", "Calendar changed during the update. Saved work will be checked again.", 503);
}
async function processJob(key, deadline) {
  const preview = await strictRead("calendar_deliveries", key);
  if (!preview || ["synced", "cancelled", "needs_attention"].includes(preview.state)) return null;
  const [client, connection] = await Promise.all([strictRead("clients", preview.slug), getCalendarConnection(preview.slug)]);
  if (client && !await calendarExecutionAvailable(client, { bookingId: preview.bookingId, ...(connection ? {targetId:connection.targetId} : {}) })) return null;
  const consentRequired = connection && preview.desired.status !== "cancelled" && connection.availabilityConsentVersion !== CALENDAR_AVAILABILITY_CONSENT_VERSION;
  if (!client || calendarTenantIdentity(client) !== preview.tenantIdentity || !["testing", "live"].includes(client.status) || !connection || consentRequired) {
    await atomicUpdate("calendar_deliveries", key, row => row && row.version === preview.version && !row.claim ? { value: { ...row, state: "waiting_connection", reasonCode: consentRequired ? "calendar_consent_required" : !connection ? "reconnect_required" : "workspace_changed", detail: consentRequired ? "Review the updated Calendar access in Connections and reconnect. Your saved visit and existing Google event are retained." : !connection ? "Connect Calendar to resume saved work." : "Calendar work is paused with your workspace.", updatedAt: stamp() } } : {});
    return null;
  }
  const token = randomBytes(16).toString("hex");
  const job = await atomicUpdate("calendar_deliveries", key, row => {
    if (!row || ["synced", "cancelled", "needs_attention"].includes(row.state) || !calendarClaimExpired(row.claim) || (row.nextAttemptAt && Date.parse(row.nextAttemptAt) > Date.now())) return { result: null };
    if ((row.attempts || 0) >= 5) return { value: { ...row, state: "needs_attention", reasonCode: "retry_limit", detail: "Calendar could not finish after five attempts. Reconnect or ask for support; your saved visit remains unchanged.", updatedAt: stamp() }, result: null };
    const next = { ...row, state: "working", claim: { token, until: Date.now() + 60000 }, attempts: (row.attempts || 0) + 1, updatedAt: stamp() };
    return { value: next, result: next };
  });
  if (!job) return null;
  let result, failure;
  try { result = await reconcile(job, deadline); await latestJob(job); }
  catch (error) { failure = error instanceof CalendarError ? error : error.code?.startsWith('calendar_') ? new CalendarError(error.code, error.message, 503) : new CalendarError("storage_or_provider_unavailable", "Calendar work could not be confirmed. The same event reference is retained.", 503); }
  const conflictWait = failure?.code === "calendar_conflict";
  const budgetWait = failure?.code === "calendar_budget_exhausted" && calendarExecutionPolicy()?.mode === "self_service";
  await atomicUpdate("calendar_deliveries", key, row => {
    if (!row || row.version !== job.version || row.claim?.token !== token) return {};
    const permanent = failure && ["event_ownership_conflict", "event_etag_missing", "remote_event_deleted", "calendar_target_changed", "invalid_booking"].includes(failure.code);
    const waiting = failure && ["reconnect_required", "workspace_changed", "calendar_consent_required"].includes(failure.code);
    const superseded = failure?.code === "superseded";
    const state = !failure ? (result.cancelled ? "cancelled" : "synced") : budgetWait || conflictWait ? "queued" : permanent || row.attempts >= 5 ? "needs_attention" : waiting ? "waiting_connection" : "retry";
    // Daily admission waits and observed schedule conflicts are not failed provider operations.
    // Conflicts recheck on the ordinary worker after five minutes, without exhausting
    // the failure limit while the other appointment remains on the calendar. Every physical
    // request remains debited in the execution ledger; earlier failures and
    // unknown create evidence keep their existing retry count and receipts.
    return { value: { ...row, state, attempts: budgetWait || conflictWait ? Math.max(0, row.attempts - 1) : row.attempts, claim: null, updatedAt: stamp(), completedAt: failure ? null : stamp(), reasonCode: failure?.code || null, detail: failure?.message || (result.cancelled ? "Calendar event cancellation is confirmed. Your workspace record is retained." : "Saved visit is confirmed in your Google calendar."), nextAttemptAt: budgetWait ? nextUtcDay() : conflictWait ? new Date(Date.now()+300000).toISOString() : failure && !permanent && !waiting ? new Date(Date.now() + (superseded ? 1000 : Math.min(3600000, 60000 * 2 ** (row.attempts - 1)))).toISOString() : null, ...(!failure && result ? { receipt: { version: row.version, sourceRevision: row.sourceRevision, eventId: row.eventId, confirmedAt: stamp(), action: result.cancelled ? "cancel" : "sync" } } : {}) } };
  });
  return { ok: !failure || budgetWait, state: failure?.code || "confirmed" };
}
async function discover(limit, deadline = Infinity) {
  const keys = await list("bookings", ""), cursor = await strictRead("calendar_scan", "bookings:v1");
  const ordered = [...keys.filter(key => key > (cursor?.after || "")), ...keys.filter(key => key <= (cursor?.after || ""))].slice(0, limit);
  let discovered = 0, last;
  for (const key of ordered) {
    if (Date.now() >= deadline) break;
    last = key;
    const booking = await strictRead("bookings", key);
    if (!booking || !validSlug(booking.slug) || !validId(booking.id)) continue;
    const client = await strictRead("clients", booking.slug);
    if (!isSupportedSelfServiceClient(client)) continue;
    if (await queueCalendarBooking(client, booking)) discovered++;
  }
  if (last) await atomicUpdate("calendar_scan", "bookings:v1", () => ({ value: { after: last, updatedAt: stamp() } }));
  return discovered;
}
export async function runCalendarDelivery({ limit = 2, discoveryLimit = 50, budgetMs = 12000 } = {}) {
  if (!calendarDeliveryEnabled()) return { ok: true, enabled: false, discovered: 0, processed: 0, failed: 0 };
  const count = Math.max(1, Math.min(50, Math.floor(limit))), scan = Math.max(1, Math.min(200, Math.floor(discoveryLimit))), deadline = Date.now() + Math.max(1000, Math.min(120000, budgetMs));
  const policy = calendarExecutionPolicy(), discovered = await discover(scan, deadline), keys = await list("calendar_deliveries", policy.mode === 'self_service' ? '' : policy.tenant.slug + '/'), cursor = await strictRead("calendar_scan", "jobs:v1");
  const rotated = [...keys.filter(key => key > (cursor?.after || "")), ...keys.filter(key => key <= (cursor?.after || ""))], ordered = policy.mode === 'self_service' ? rotated.slice(0, scan) : rotated;
  let processed = 0, failed = 0, last;
  for (const key of ordered) {
    if (processed >= count || Date.now() >= deadline) break;
    last = key;
    const result = await processJob(key, Math.min(deadline, Date.now() + 12000));
    if (result) { processed++; if (!result.ok) failed++; }
  }
  if (last) await atomicUpdate("calendar_scan", "jobs:v1", () => ({ value: { after: last, updatedAt: stamp() } }));
  const all = (await Promise.all((policy.mode === 'self_service' ? ordered : keys).map(key => strictRead("calendar_deliveries", key)))).filter(Boolean);
  const openFailures = all.filter(job => ["needs_attention", "retry"].includes(job.state)).length;
  const waiting = all.filter(job => job.state === "waiting_connection").length;
  return { ok: failed === 0 && openFailures === 0, enabled: true, discovered, processed, failed, openFailures, waiting, ...(policy.mode === 'self_service' ? { scope: 'inspected_jobs', inspected: all.length, historyIncomplete: keys.length > ordered.length } : {}) };
}

export async function runCalendarDeliveryWave({ budgetMs = 120000 } = {}) {
  if (!calendarDeliveryEnabled()) return { ok: true, enabled: false, processed: 0 };
  const budget = Math.max(1000, Math.min(120000, budgetMs)), token = randomBytes(16).toString("hex"), started = Date.now(), at = stamp();
  const acquired = await atomicUpdate("calendar_scan", "wave:v1", current => {
    // Published waves release their lease with an explicit completed marker at
    // until:0. Zero is not an expired running/job lease. Validate that distinct
    // marker here so normal completion can admit the next scheduled wave.
    const completedAt = current?.completedAt;
    const released = current?.state === 'complete' && current.until === 0 && /^[a-f0-9]{32}$/.test(current.token || '') && typeof completedAt === 'string' && Number.isFinite(Date.parse(completedAt)) && new Date(Date.parse(completedAt)).toISOString() === completedAt && Date.parse(completedAt) <= Date.now();
    const available = current === null || current === undefined || released || current.state === 'running' && calendarClaimExpired(current);
    return !available ? { result:false } : { value:{token,until:Date.now()+budget+5000,state:'running',at},result:true };
  });
  if (!acquired) return { ok: true, enabled: true, processed: 0, skipped: "wave_running" };
  let result;
  try { result = await runCalendarDelivery({ limit: 50, discoveryLimit: 200, budgetMs: budget }); }
  catch { result = { ok: false, enabled: true, processed: 0, reasonCode: "calendar_wave_unavailable" }; }
  const record = { ...result, at, completedAt: stamp(), durationMs: Date.now() - started };
  await atomicUpdate("health", "calendarDelivery:lastRun", current => !current || current.at <= at ? { value: record } : {});
  await atomicUpdate("calendar_scan", "wave:v1", current => current?.token === token ? { value: { ...current, state: "complete", until: 0, completedAt: stamp() } } : {});
  return record;
}
export async function dispatchCalendarDeliveryWave(requestedClient = null) {
  if (!calendarDeliveryEnabled()) return { ok: true, enabled: false, dispatched: false };
  const policy = calendarExecutionPolicy();
  let client, targetId;
  if (policy.mode === 'self_service') {
    // Scheduled waves rotate through connected tenants; a customer-triggered
    // dispatch uses that customer's current grant. Neither needs a manual map.
    const cursor = await strictRead('calendar_scan', 'dispatch:self_service'), keys = requestedClient ? [requestedClient.slug] : await list('calendar_connections', '');
    const ordered = requestedClient ? keys : [...keys.filter(key => key > (cursor?.after || '')), ...keys.filter(key => key <= (cursor?.after || ''))].slice(0, 25);
    for (const slug of ordered) {
      if (!requestedClient) await atomicUpdate('calendar_scan', 'dispatch:self_service', () => ({ value: { after: slug, updatedAt: stamp() } }));
      const candidate = await strictRead('clients', slug), connection = candidate && await getCalendarConnection(slug);
      if (!connection || requestedClient && calendarTenantIdentity(candidate) !== calendarTenantIdentity(requestedClient)) continue;
      if (await calendarExecutionAvailable(candidate, { targetId: connection.targetId, actions: ['workerDispatch'] })) { client = candidate; targetId = connection.targetId; break; }
    }
    if (!client) return { ok: true, enabled: true, dispatched: false, reasonCode: 'no_eligible_calendar_dispatch' };
  } else client = await strictRead('clients', policy.tenant.slug);
  const response = await guardedCalendarFetch(client, 'workerDispatch', `${accessSite()}/api/calendar-delivery-background`, { method: "POST", headers: { "Content-Type": "application/json", "x-service-worker-key": process.env.SERVICE_WORKER_KEY }, body: "{}", signal: AbortSignal.timeout(5000) }, { ...(targetId ? { targetId } : {}), authorize: () => calendarDeliveryEnabled() });
  if (![200, 202].includes(response.status)) throw new CalendarError("calendar_dispatch_unavailable", "Calendar work is saved and waiting for background recovery.", 503);
  return { ok: true, enabled: true, dispatched: true };
}
