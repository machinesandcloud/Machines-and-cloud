import { serviceIntakeCalendarHint } from './service-intake.mjs';
// Customer-authorized Google Calendar. Secrets never enter a client DTO or redirect.
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { atomicUpdate } from "./store.mjs";
import { strictRead, normalizeAccountEmail } from "./accounts.mjs";
import { accessSite } from "./access.mjs";
import { isSupportedSelfServiceClient } from "./setup.mjs";
import { calendarExecutionPolicy, calendarExecutionAvailable, assertCalendarExecution, reserveCalendarExecution, guardedCalendarFetch } from "./calendar-execution.mjs";

export const CALENDAR_AVAILABILITY_CONSENT_VERSION = '2026-10-24-busy-v1';
export class CalendarError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const hash = value => createHash("sha256").update(value).digest("hex");
export const calendarTenantIdentity = client => hash(JSON.stringify([client.slug, client.ownerKey, normalizeAccountEmail(client.owner?.email)]));
const at = () => new Date().toISOString();
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const secretKey = () => {
  const text = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY || "", key = Buffer.from(text, "base64");
  return key.length === 32 && key.toString("base64") === text ? key : null;
};
export const calendarConnectionEnabled = () => process.env.CALENDAR_CONNECTION_ENABLED === "true" && !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!secretKey() && !!calendarExecutionPolicy();
const enabled = () => { if (!calendarConnectionEnabled()) throw new CalendarError("calendar_unavailable", "Calendar connection is not available yet.", 503); };
async function execution(check) { try { return await check(); } catch (error) { if (error.code?.startsWith('calendar_')) throw new CalendarError(error.code, error.message, 503); throw error; } }
const seal = (value, aad) => {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), data: data.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
};
const unseal = (value, aad) => {
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(value.iv, "base64"));
  decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.data, "base64")), decipher.final()]).toString("utf8");
};
async function owner(client, session) {
  if (!isSupportedSelfServiceClient(client) || !session?.sessionHash || session.scope !== "onboarding" || client.owner?.email?.toLowerCase() !== session.email?.toLowerCase()) throw new CalendarError("forbidden", "Sign in to your own workspace.", 403);
  const saved = await strictRead("access_sessions", session.sessionHash);
  if (!saved || saved.status !== "active" || saved.scope !== "onboarding" || saved.email !== session.email || Date.parse(saved.expiresAt) <= Date.now()) throw new CalendarError("forbidden", "Sign in again to connect your calendar.", 403);
  const current = await strictRead("clients", client.slug);
  if (!current || current.owner?.email?.toLowerCase() !== session.email.toLowerCase() || calendarTenantIdentity(current) !== calendarTenantIdentity(client) || !isSupportedSelfServiceClient(current) || (current.operationLifecycleVersion || 0) !== (client.operationLifecycleVersion || 0)) throw new CalendarError("workspace_changed", "Your workspace changed. Refresh and try again.");
  if (!["testing", "live", "paused"].includes(current.status)) throw new CalendarError("workspace_closed", "This workspace is closed.");
}
export async function calendarConnectionView(client) {
  const current = await strictRead("clients", client.slug);
  if (!isSupportedSelfServiceClient(current) || current.owner?.email?.toLowerCase() !== client.owner?.email?.toLowerCase() || calendarTenantIdentity(current) !== calendarTenantIdentity(client)) throw new CalendarError("forbidden", "This calendar belongs to another workspace.", 403);
  const row = await strictRead("calendar_connections", client.slug);
  const retainedStatus = row?.tenantIdentity === calendarTenantIdentity(client) ? row.status : "not_connected";
  const consentRequired = retainedStatus === "connected" && row.availabilityConsentVersion !== CALENDAR_AVAILABILITY_CONSENT_VERSION;
  const status = consentRequired ? "reconnect_required" : retainedStatus;
  const available = calendarConnectionEnabled() && await calendarExecutionAvailable(current, status === 'connected' ? { targetId: row.targetId, actions:['tokenRefresh','calendarRead'],anyActions:['eventCreate','eventUpdate','eventDelete'] } : { actions:['oauthStart','tokenExchange','calendarRead'] });
  return { available, provider: "google", status, connected: status === "connected", connectedAt: (status === "not_connected" ? null : row?.connectedAt) || null, disconnectedAt: (status === "not_connected" ? null : row?.disconnectedAt) || null, label: (status === "not_connected" ? null : row?.label) || null, reconnectRequired: status === "reconnect_required", availabilityConsentRequired:consentRequired, detail: consentRequired ? "Review the updated Calendar access and reconnect to check busy time before offering visits. Your saved visits and existing Google events are retained." : status === "connected" ? available ? "Your calendar is connected. Check delivery status for each saved visit; existing records stay in your workspace." : "Your Google permission is saved. Calendar delivery is waiting for approved service availability; existing records remain saved." : status === "reconnect_required" ? "Google authorization expired or was revoked. Reconnect to resume saved calendar work." : "Connect your Google calendar to sync saved visits." };
}
export async function startCalendarConnection(client, session, input = {}) {
  await owner(client, session); enabled();
  if(input.availabilityConsentVersion !== CALENDAR_AVAILABILITY_CONSENT_VERSION)throw new CalendarError("calendar_consent_required","Review the current Calendar access details, then choose Continue to Google.",409);
  await execution(() => reserveCalendarExecution(client, 'oauthStart', { authorize: async () => { await owner(client, session); return calendarConnectionEnabled(); } }));
  const state = randomBytes(32).toString("hex"), verifier = randomBytes(48).toString("base64url"), createdAt = at(), expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
  const epoch = await atomicUpdate("calendar_connections", client.slug, row => { const base = row?.tenantIdentity === calendarTenantIdentity(client) ? row : { slug: client.slug, tenantIdentity: calendarTenantIdentity(client), status: "not_connected" }; const next = { ...base, grantEpoch: (base.grantEpoch || 0) + 1, updatedAt: createdAt }; return { value: next, result: next.grantEpoch }; });
  await atomicUpdate("calendar_oauth", hash(state), row => {
    if (row) throw new Error("Calendar state collision");
    return { value: { slug: client.slug, tenantIdentity: calendarTenantIdentity(client), googleClientIdHash:calendarExecutionPolicy().googleClientIdHash, executionPolicyDigest:calendarExecutionPolicy().digest, email: session.email, sessionHash: session.sessionHash, availabilityConsentVersion:CALENDAR_AVAILABILITY_CONSENT_VERSION, epoch, lifecycleVersion: client.operationLifecycleVersion || 0, verifier: seal(verifier, `state:${hash(state)}`), state: "pending", createdAt, expiresAt } };
  });
  const params = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: `${accessSite()}/api/google/callback`, response_type: "code", scope: "https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendars.readonly", access_type: "offline", prompt: "consent", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const hint=await serviceIntakeCalendarHint(client);if(hint)params.set('login_hint',hint);
  return { ok: true, authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, expiresAt };
}
// The unauthenticated Google redirect only selects a fixed same-site landing page.
// It cannot exchange the code or change a tenant; the original owner session must POST completion.
export async function calendarCallbackDestination({ state, code, error }) {
  if (!hex(state)) throw new CalendarError("invalid_state", "This calendar link is invalid or expired.", 410);
  const row = await strictRead("calendar_oauth", hash(state));
  const client = row ? await strictRead("clients", row.slug) : null;
  if (!row || row.state !== "pending" || !isSupportedSelfServiceClient(client) || row.tenantIdentity !== calendarTenantIdentity(client) || !["testing", "live", "paused"].includes(client.status) || Date.parse(row.expiresAt) <= Date.now()) throw new CalendarError("invalid_state", "This calendar link is invalid or expired.", 410);
  if ((error && error !== "access_denied") || (error && code)) throw new CalendarError("invalid_callback", "Google did not return a usable authorization.", 400);
  if ((typeof code !== "string" || !code || code.length > 4096) && error !== "access_denied") throw new CalendarError("invalid_callback", "Google did not return a usable authorization.", 400);
  const fragment = new URLSearchParams({ calendar_state: state, ...(error ? { calendar_error: "access_denied" } : { calendar_code: code }) });
  return `${accessSite()}/desk?c=${encodeURIComponent(row.slug)}#${fragment}`;
}
async function googleJson(client, action, url, init, deadline = Date.now() + 15000, options = {}) {
  let response;
  try { response = await guardedCalendarFetch(client, action, url, { ...init, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }, { ...options, deadline, authorize: async () => { enabled(); return options.authorize ? options.authorize() : true; } }); }
  catch (error) { if (error.code?.startsWith('calendar_')) throw new CalendarError(error.code, error.message, 503); throw new CalendarError("google_unavailable", "Google could not confirm this request. Your workspace records are unchanged.", 503); }
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
export async function completeCalendarConnection(client, session, input) {
  await owner(client, session); enabled();
  if (!input || Object.keys(input).some(key => !["state", "code", "error"].includes(key)) || !hex(input.state) || (input.error !== undefined && input.error !== "access_denied") || (!input.error && (typeof input.code !== "string" || !input.code || input.code.length > 4096))) throw new CalendarError("invalid_callback", "This calendar authorization is invalid.", 400);
  const key = hash(input.state), current = await strictRead("calendar_connections", client.slug);
  const claim = await atomicUpdate("calendar_oauth", key, row => {
    if (!row || row.state !== "pending" || Date.parse(row.expiresAt) <= Date.now() || row.slug !== client.slug || row.sessionHash !== session.sessionHash || row.email !== session.email || row.tenantIdentity !== calendarTenantIdentity(client) || row.googleClientIdHash !== calendarExecutionPolicy()?.googleClientIdHash || row.executionPolicyDigest !== calendarExecutionPolicy()?.digest || current?.tenantIdentity !== row.tenantIdentity || row.epoch !== current?.grantEpoch || row.lifecycleVersion !== (client.operationLifecycleVersion || 0) || row.availabilityConsentVersion !== CALENDAR_AVAILABILITY_CONSENT_VERSION) return { result: null };
    return { value: { ...row, state: input.error ? "denied" : "consumed", consumedAt: at() }, result: row };
  });
  if (!claim) throw new CalendarError("invalid_state", "This calendar link expired, was already used, or belongs to another sign-in. Connect again.", 410);
  if (input.error) return { ok: true, denied: true, calendar: await calendarConnectionView(client) };
  const verifier = unseal(claim.verifier, `state:${key}`);
  const authority = async () => { await owner(client, session); const saved = await strictRead('calendar_connections', client.slug), policy = calendarExecutionPolicy(); return saved?.grantEpoch === claim.epoch && saved?.tenantIdentity === claim.tenantIdentity && claim.googleClientIdHash === policy?.googleClientIdHash && claim.executionPolicyDigest === policy?.digest; };
  const token = await googleJson(client, 'tokenExchange', "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: input.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${accessSite()}/api/google/callback`, grant_type: "authorization_code", code_verifier: verifier }).toString() }, undefined, { authorize: authority });
  if (!token.response.ok || typeof token.data.refresh_token !== "string" || !token.data.refresh_token || typeof token.data.access_token !== "string") throw new CalendarError("authorization_failed", "Google did not grant ongoing Calendar access. Connect again and allow Calendar access.");
  const granted = new Set(String(token.data.scope || "").split(" "));
  if (!["https://www.googleapis.com/auth/calendar.events.owned", "https://www.googleapis.com/auth/calendar.calendars.readonly"].every(scope => granted.has(scope))) throw new CalendarError("scope_required", "Allow the requested Calendar permissions to connect.");
  const calendar = await googleJson(client, 'calendarRead', "https://www.googleapis.com/calendar/v3/calendars/primary", { headers: { Authorization: `Bearer ${token.data.access_token}` } }, undefined, { authorize: authority });
  if (!calendar.response.ok || typeof calendar.data.id !== "string" || !calendar.data.id || calendar.data.id.length > 1024) throw new CalendarError("calendar_unavailable", "Your primary calendar could not be confirmed. Connect again.", 503);
  await owner(client, session);
  await execution(() => assertCalendarExecution(client, { targetId: calendar.data.id, authorize: authority, connecting: true }));
  const connectionId = randomBytes(16).toString("hex"), connectedAt = at();
  await atomicUpdate("calendar_connections", client.slug, row => {
    if (!row || row.tenantIdentity !== claim.tenantIdentity || row.grantEpoch !== claim.epoch) throw new CalendarError("connection_changed", "Calendar setup changed. Connect again.");
    return { value: { ...row, connectionId, googleClientIdHash:calendarExecutionPolicy().googleClientIdHash, status: "connected", availabilityConsentVersion:claim.availabilityConsentVersion, availabilityConsentedAt:claim.createdAt, targetId: calendar.data.id, targetHash: hash(calendar.data.id), label: "Google Calendar", connectedAt, disconnectedAt: null, refresh: seal(token.data.refresh_token, `${client.slug}:${connectionId}`), updatedAt: connectedAt } };
  });
  return { ok: true, calendar: await calendarConnectionView(client) };
}
export async function disconnectCalendar(client, session) {
  await owner(client, session);
  await atomicUpdate("calendar_connections", client.slug, row => ({ value: { ...(row?.tenantIdentity === calendarTenantIdentity(client) ? row : { slug: client.slug, tenantIdentity: calendarTenantIdentity(client) }), status: "disconnected", grantEpoch: (row?.grantEpoch || 0) + 1, disconnectedAt: at(), updatedAt: at(), refresh: null } }));
  // Local stop is immediate; no provider revoke/delete or booking deletion is implied.
  return { ok: true, calendar: await calendarConnectionView(client) };
}
export async function getCalendarConnection(slug) {
  const row = await strictRead("calendar_connections", slug);
  const client = await strictRead("clients", slug);
  return isSupportedSelfServiceClient(client) && row?.tenantIdentity === calendarTenantIdentity(client) && row?.status === "connected" && row.refresh ? row : null;
}
export async function googleAccessToken(slug, connectionId, { deadline = Date.now() + 15000 } = {}) {
  enabled();
  const row = await getCalendarConnection(slug);
  if (!row || row.connectionId !== connectionId) throw new CalendarError("reconnect_required", "Reconnect your calendar to resume saved work.");
  const refreshToken = unseal(row.refresh, `${slug}:${connectionId}`);
  const client = await strictRead('clients', slug);
  const authorize = async () => { const current = await getCalendarConnection(slug); const c = await strictRead('clients', slug); return current?.connectionId === connectionId && current?.targetId === row.targetId && ['testing','live'].includes(c?.status); };
  const { response, data } = await googleJson(client, 'tokenRefresh', "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: refreshToken, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }).toString() }, deadline, { targetId: row.targetId, authorize });
  if (!response.ok || typeof data.access_token !== "string") {
    if (data.error === "invalid_grant") await atomicUpdate("calendar_connections", slug, current => current?.connectionId === connectionId ? { value: { ...current, status: "reconnect_required", refresh: null, updatedAt: at() } } : {});
    throw new CalendarError(data.error === "invalid_grant" ? "reconnect_required" : "google_unavailable", data.error === "invalid_grant" ? "Reconnect your calendar to resume saved work." : "Google Calendar is temporarily unavailable.", 503);
  }
  // Refresh responses can arrive after disconnect/reconnect: do not return a token for stale work.
  const latest = await getCalendarConnection(slug);
  if (!latest || latest.connectionId !== connectionId) throw new CalendarError("connection_changed", "Calendar setup changed. Retry after refreshing.");
  return data.access_token;
}

export const calendarReadiness = calendarConnectionView;
