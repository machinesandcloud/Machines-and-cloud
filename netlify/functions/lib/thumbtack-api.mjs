// Explicit, single-attempt Thumbtack transport. Importing this module performs no I/O.
// Authorization/storage/tenant binding and durable mutation claims belong to the caller.
// Protocol sources: developers.thumbtack.com/docs/getting-started/{authentication,environments}
// and /docs/pro-integrations/{businesses,negotiations,messages}. Scopes and the token
// authentication method must come from the provisioned partner configuration.
import * as oauth from 'oauth4webapi';
import { thumbtackEndpoints, thumbtackRedirectURI } from './thumbtack-environment.mjs';

const TIMEOUT_MS = 5000, RESPONSE_BYTES = 262144, REQUEST_BYTES = 16384;
const WEBHOOK_EVENTS = Object.freeze(['MessageCreatedV4', 'NegotiationCreatedV4']);

export class ThumbtackAPIError extends Error {
  constructor(code, { status = null, outcome = 'not_sent' } = {}) {
    super('Thumbtack request could not be confirmed.');
    this.name = 'ThumbtackAPIError'; this.code = code; this.status = status; this.outcome = outcome;
  }
}
const fail = (code, details) => { throw new ThumbtackAPIError(code, details); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function string(value, max, code = 'invalid_argument', minimum = 1) {
  if (typeof value !== 'string' || value.length < minimum || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail(code);
  return value;
}
function id(value) { if (typeof value !== 'string' || !/^\d{1,32}$/.test(value)) fail('invalid_provider_id'); return value; }
function credential(value) { string(value, 8192, 'missing_credentials'); if (/\s/.test(value)) fail('invalid_credentials'); return value; }
function httpsURI(value, code = 'invalid_redirect_uri') {
  let url; try { url = new URL(string(value, 2048, code)); } catch { fail(code); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) fail(code);
  return url;
}
function webhookURI(value) {
  const url = httpsURI(value, 'invalid_webhook_url');
  if (url.hostname !== 'machinesandcloud.com' || url.pathname !== '/api/thumbtack' || url.href !== value) fail('invalid_webhook_url');
  const names = [...url.searchParams.keys()];
  if (names.length !== 3 || new Set(names).size !== 3 || names.some(name => !['c', 't', 'g'].includes(name)) ||
      !/^[a-z0-9][a-z0-9-]{0,79}$/.test(url.searchParams.get('c') || '') ||
      !/^[a-f0-9]{64}$/.test(url.searchParams.get('t') || '') || !/^[a-f0-9]{32}$/.test(url.searchParams.get('g') || '')) fail('invalid_webhook_url');
  return value;
}
function scopesList(scopes) {
  if (!Array.isArray(scopes) || !scopes.length || scopes.length > 30 || new Set(scopes).size !== scopes.length ||
      scopes.some(scope => typeof scope !== 'string' || !/^(?:offline_access|supply::[a-zA-Z0-9._:-]{1,120})$/.test(scope)) ||
      !scopes.includes('offline_access') || !scopes.some(scope => scope.startsWith('supply::'))) fail('partner_scopes_required');
  return scopes.join(' ');
}
function authentication(clientId, clientSecret, method) {
  credential(clientId); credential(clientSecret);
  if (!['client_secret_basic', 'client_secret_post'].includes(method)) fail('token_auth_method_required');
  return method === 'client_secret_basic' ? oauth.ClientSecretBasic(clientSecret) : oauth.ClientSecretPost(clientSecret);
}
function mutationOutcome(status) {
  return [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(status) ? 'rejected' : 'unknown';
}

// Read the full bounded response before returning, so a slow body is covered by the
// same deadline. Never expose a provider's body, WWW-Authenticate text or fetch error.
async function oneRequest(url, options, mutation = false, { environment = 'production', authorize } = {}) {
  let endpoints; try { endpoints = thumbtackEndpoints(environment); } catch { fail('provider_url_rejected'); }
  if (url !== endpoints.token_endpoint && !url.startsWith(endpoints.api)) fail('provider_url_rejected');
  const target = new URL(url);
  if (target.username || target.password || target.hash || target.protocol !== 'https:' || target.port ||
      ![new URL(endpoints.api).origin,new URL(endpoints.token_endpoint).origin].includes(target.origin)) fail('provider_url_rejected');
  if (options.body && Buffer.byteLength(String(options.body), 'utf8') > REQUEST_BYTES) fail('request_too_large');
  const controller = new AbortController(); let timer, reader;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ThumbtackAPIError('provider_timeout', { outcome: mutation ? 'unknown' : 'unavailable' })); }, TIMEOUT_MS); });
  const perform = async () => {
    if (authorize !== undefined && (typeof authorize !== 'function' || await authorize() !== true)) fail('connection_binding_changed');
    if (controller.signal.aborted) fail('provider_timeout', {outcome: mutation ? 'unknown' : 'unavailable'});
    const response = await fetch(target.href, { ...options, redirect: 'error', cache: 'no-store', credentials: 'omit', signal: controller.signal });
    const status = response.status;
    if (status >= 300 && status <= 399) fail('provider_redirect_rejected', { status, outcome: mutation ? 'unknown' : 'unavailable' });
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > RESPONSE_BYTES)) fail('provider_response_too_large', { status, outcome: mutation ? 'unknown' : 'unavailable' });
    const chunks = []; let size = 0;
    if (response.body) {
      reader = response.body.getReader();
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > RESPONSE_BYTES) fail('provider_response_too_large', { status, outcome: mutation ? 'unknown' : 'unavailable' }); chunks.push(part.value); }
    }
    const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size);
    // Reconstitute only the headers the OAuth parser needs; no remote headers escape.
    return { status, ok: response.ok, bytes, contentType: response.headers.get('content-type') || '' };
  };
  try { return await Promise.race([perform(), deadline]); }
  catch (error) {
    if (error instanceof ThumbtackAPIError) throw error;
    fail('provider_transport_error', { outcome: mutation ? 'unknown' : 'unavailable' });
  } finally { clearTimeout(timer); controller.abort(); if (reader) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} } }
}
function decode(response, mutation) {
  if (!response.ok) fail('provider_http_error', { status: response.status, outcome: mutation ? mutationOutcome(response.status) : 'unavailable' });
  if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(response.contentType)) fail('provider_invalid_response', { status: response.status, outcome: mutation ? 'unknown' : 'unavailable' });
  let data; try { data = JSON.parse(response.bytes.toString('utf8')); } catch { fail('provider_invalid_response', { status: response.status, outcome: mutation ? 'unknown' : 'unavailable' }); }
  if (!plain(data)) fail('provider_invalid_response', { status: response.status, outcome: mutation ? 'unknown' : 'unavailable' });
  return data;
}
async function api(path, { accessToken, method = 'GET', body, environment = 'production', authorize } = {}) {
  let endpoints; try { endpoints = thumbtackEndpoints(environment); } catch { fail('provider_url_rejected'); }
  const token = credential(accessToken), mutation = method !== 'GET';
  const response = await oneRequest(endpoints.api + path, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }, mutation, {environment,authorize});
  return { data: decode(response, mutation), status: response.status };
}
function responseFailure(status = null, mutation = false) { fail('provider_invalid_response', { status, outcome: mutation ? 'unknown' : 'unavailable' }); }
function optionalText(value, max = 4096) { return typeof value === 'string' && value.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) ? value : undefined; }
function fields(value, names) { const result = {}; if (plain(value)) for (const name of names) { const text = optionalText(value[name]); if (text !== undefined) result[name] = text; } return result; }
function providerID(value, status) { if (typeof value !== 'string' || !/^\d{1,32}$/.test(value)) responseFailure(status); return value; }
function businessRow(row, status) { if (!plain(row)) responseFailure(status); return { businessID: providerID(row.businessID, status), ...fields(row, ['name', 'imageURL']) }; }
function negotiationRow(row, status) {
  if (!plain(row) || !plain(row.business) || row.request !== undefined && !plain(row.request)) responseFailure(status);
  // The current V4 contract puts project facts under request and names under
  // customer.firstName/lastName. Keep the earlier flat response compatible.
  const request = row.request || {}, customer = fields(row.customer, ['customerID', 'displayName']);
  if (!customer.displayName) { const name = ['firstName','lastName'].map(key => optionalText(row.customer?.[key], 200)).filter(Boolean).join(' ').trim(); if (name) customer.displayName = name; }
  const result = { negotiationID: providerID(row.negotiationID, status), ...fields(row, ['status']), business: businessRow(row.business, status), customer, category: fields(request.category ?? row.category, ['categoryID', 'name']) };
  const created = optionalText(row.createdAt ?? row.createTime), description = optionalText(request.description ?? row.description);
  if (created !== undefined) result.createTime = created;
  if (description !== undefined) result.description = description;
  const location = plain(row.customer?.location) ? row.customer.location : request.location;
  if (plain(location)) result.customer.location = fields(location, ['city', 'state', 'zipCode']);
  const details = request.details ?? row.details;
  if (details !== undefined) { if (!Array.isArray(details) || details.length > 100) responseFailure(status); result.details = details.map(detail => fields(detail, ['question', 'answer'])); }
  return result;
}
function messageRow(row, status) {
  if (!plain(row) || optionalText(row.text, RESPONSE_BYTES) === undefined) responseFailure(status);
  return { messageID: providerID(row.messageID, status), negotiationID: providerID(row.negotiationID, status), ...fields(row, ['from', 'sentAt']), text: row.text, customer: fields(row.customer, ['customerID', 'displayName']), hasAttachments: Array.isArray(row.attachments) && row.attachments.length > 0 };
}
function listResult(result, project) {
  if (!Array.isArray(result.data.data) || result.data.data.length > 100) responseFailure(result.status);
  const pagination = {}; if (Number.isSafeInteger(result.data.pagination?.limit) && result.data.pagination.limit > 0) pagination.limit = result.data.pagination.limit;
  // The documented examples do not define a next-page contract. Never follow an
  // arbitrary provider URL or imply a list proves absence/completeness.
  return { data: result.data.data.map(row => project(row, result.status)), pagination, complete: false };
}

export function thumbtackAuthorizationURL({ clientId, redirectURI, state, scopes, environment = 'production' }) {
  let endpoints; try { endpoints = thumbtackEndpoints(environment); } catch { fail('provider_url_rejected'); }
  credential(clientId); httpsURI(redirectURI); if (redirectURI !== thumbtackRedirectURI(environment)) fail('invalid_redirect_uri'); string(state, 512, 'invalid_oauth_state', 8);
  const url = new URL(endpoints.authorization_endpoint); url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectURI, response_type: 'code', state, audience: 'urn:partner-api', scope: scopesList(scopes) }).toString(); return url.href;
}
async function tokens({ clientId, clientSecret, tokenAuthMethod, environment = 'production', authorize }, run) {
  let endpoints; try { endpoints = thumbtackEndpoints(environment); } catch { fail('provider_url_rejected'); }
  const auth = authentication(clientId, clientSecret, tokenAuthMethod), client = { client_id: clientId };
  let capturedStatus = null;
  const options = { [oauth.customFetch]: async (url, request) => {
    if (String(url) !== endpoints.token_endpoint) fail('provider_url_rejected');
    const response = await oneRequest(endpoints.token_endpoint, { method: 'POST', headers: request.headers, body: request.body }, true, {environment,authorize}); capturedStatus = response.status;
    // A token/rotating refresh may have been consumed even if its receipt is malformed.
    if (!response.ok) fail('provider_http_error', { status: response.status, outcome: mutationOutcome(response.status) });
    return new Response(response.bytes, { status: response.status, headers: { 'Content-Type': response.contentType } });
  } };
  try {
    const result = await run(client, auth, options);
    if (!plain(result) || typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string' || result.token_type?.toLowerCase() !== 'bearer' || !Number.isSafeInteger(result.expires_in) || result.expires_in < 1 || result.expires_in > 86400) responseFailure(capturedStatus, true);
    credential(result.access_token); credential(result.refresh_token);
    return { access_token: result.access_token, refresh_token: result.refresh_token, token_type: 'Bearer', expires_in: result.expires_in, ...(typeof result.scope === 'string' ? { scope: string(result.scope, 4096) } : {}) };
  } catch (error) { if (error instanceof ThumbtackAPIError) { if (capturedStatus !== null && error.outcome === 'not_sent') responseFailure(capturedStatus, true); throw error; } if (capturedStatus !== null) responseFailure(capturedStatus, true); fail('provider_oauth_error', { outcome: 'unknown' }); }
}
export async function exchangeThumbtackCode({ clientId, clientSecret, redirectURI, code, expectedState, responseState, tokenAuthMethod, environment = 'production', authorize }) {
  let AS; try { AS = thumbtackEndpoints(environment); } catch { fail('provider_url_rejected'); }
  httpsURI(redirectURI); if (redirectURI !== thumbtackRedirectURI(environment)) fail('invalid_redirect_uri'); string(code, 8192, 'invalid_authorization_code'); string(expectedState, 512, 'invalid_oauth_state', 8); string(responseState, 512, 'invalid_oauth_state', 8);
  if (responseState !== expectedState) fail('oauth_state_mismatch');
  credential(clientId);
  const client = { client_id: clientId }; let params;
  try { params = oauth.validateAuthResponse(AS, client, new URLSearchParams({ code, state: responseState }), expectedState); } catch { fail('invalid_authorization_response'); }
  return tokens({ clientId, clientSecret, tokenAuthMethod, environment, authorize }, async (oauthClient, auth, options) => oauth.processAuthorizationCodeResponse(AS, oauthClient, await oauth.authorizationCodeGrantRequest(AS, oauthClient, auth, params, redirectURI, oauth.nopkce, options)));
}
export async function refreshThumbtackToken({ clientId, clientSecret, refreshToken, tokenAuthMethod, environment = 'production', authorize }) {
  let AS; try { AS = thumbtackEndpoints(environment); } catch { fail('provider_url_rejected'); }
  credential(refreshToken);
  return tokens({ clientId, clientSecret, tokenAuthMethod, environment, authorize }, async (client, auth, options) => oauth.processRefreshTokenResponse(AS, client, await oauth.refreshTokenGrantRequest(AS, client, auth, refreshToken, options)));
}
export async function thumbtackBusinesses({ accessToken, environment, authorize }) { return listResult(await api('businesses', { accessToken, environment, authorize }), businessRow); }
export async function thumbtackNegotiation({ accessToken, negotiationID, environment, authorize }) { const result = await api('negotiations/' + id(negotiationID), { accessToken, environment, authorize }); const row = negotiationRow(result.data, result.status); if (row.negotiationID !== negotiationID) responseFailure(result.status); return row; }
export async function thumbtackNegotiations({ accessToken, businessID, environment, authorize }) { const result = listResult(await api('businesses/' + id(businessID) + '/negotiations', { accessToken, environment, authorize }), negotiationRow); if (result.data.some(row => row.business.businessID !== businessID)) responseFailure(); return result; }
export async function thumbtackMessages({ accessToken, negotiationID, environment, authorize }) { const result = listResult(await api('negotiations/' + id(negotiationID) + '/messages', { accessToken, environment, authorize }), messageRow); if (result.data.some(row => row.negotiationID !== negotiationID)) responseFailure(); return result; }
export async function sendThumbtackMessage({ accessToken, negotiationID, text, environment, authorize }) {
  id(negotiationID); if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > 8000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) fail('invalid_message');
  const result = await api('negotiations/' + negotiationID + '/messages', { accessToken, environment, authorize, method: 'POST', body: { text } });
  // POST examples document only the request. Accept an explicit matching message
  // receipt, never infer it from 2xx; otherwise the durable caller must reconcile.
  if (typeof result.data.messageID !== 'string' || !/^\d{1,32}$/.test(result.data.messageID) || result.data.negotiationID !== negotiationID) responseFailure(result.status, true);
  return { status: result.status, accepted: true, messageID: result.data.messageID, negotiationID };
}
function webhookRow(row, status, mutation = false) {
  if (!plain(row) || typeof row.webhookID !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.webhookID) || !/^\d{1,32}$/.test(row.businessID || '') || typeof row.webhookURL !== 'string' || row.webhookURL.length > 2048 || typeof row.enabled !== 'boolean' || typeof row.authType !== 'string' || row.authType.length > 100 || !Array.isArray(row.eventTypes) || row.eventTypes.length > 100 || row.eventTypes.some(event => typeof event !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(event))) responseFailure(status, mutation);
  return { webhookID: row.webhookID, businessID: row.businessID, webhookURL: row.webhookURL, enabled: row.enabled, authType: row.authType, eventTypes: [...row.eventTypes] };
}
export async function thumbtackWebhooks({ accessToken, businessID, environment, authorize }) {
  id(businessID); const result = listResult(await api('businesses/' + businessID + '/webhooks', { accessToken, environment, authorize }), webhookRow); if (result.data.some(row => row.businessID !== businessID)) responseFailure(); return result;
}
export async function thumbtackWebhook({ accessToken, businessID, webhookID, environment, authorize }) {
  id(businessID); if (typeof webhookID !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(webhookID)) fail('invalid_webhook_id');
  const result = await api('businesses/' + businessID + '/webhooks/' + webhookID, { accessToken, environment, authorize });
  const row = webhookRow(result.data, result.status); if (row.businessID !== businessID || row.webhookID !== webhookID) responseFailure(result.status); return row;
}
export async function createThumbtackWebhook({ accessToken, businessID, webhookURL, username, password, environment, authorize }) {
  id(businessID); webhookURI(webhookURL); string(username, 128, 'invalid_webhook_credentials'); string(password, 256, 'invalid_webhook_credentials', 12); if (username.includes(':')) fail('invalid_webhook_credentials');
  const result = await api('businesses/' + businessID + '/webhooks', { accessToken, environment, authorize, method: 'POST', body: { webhookURL, eventTypes: [...WEBHOOK_EVENTS], enabled: false, auth: { username, password } } });
  const row = webhookRow(result.data, result.status, true);
  if (row.businessID !== businessID || row.webhookURL !== webhookURL || row.enabled !== false || row.authType !== 'Basic' || row.eventTypes.length !== 2 || new Set(row.eventTypes).size !== 2 || row.eventTypes.some(event => !WEBHOOK_EVENTS.includes(event))) responseFailure(result.status, true);
  return row;
}
export async function enableThumbtackWebhook({ accessToken, businessID, webhookID, enabled = true, environment, authorize }) {
  id(businessID); if (typeof webhookID !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(webhookID) || typeof enabled !== 'boolean') fail('invalid_webhook_id');
  const result = await api('businesses/' + businessID + '/webhooks/' + webhookID, { accessToken, environment, authorize, method: 'PUT', body: { enabled } });
  const row = webhookRow(result.data, result.status, true); if (row.businessID !== businessID || row.webhookID !== webhookID || row.enabled !== enabled) responseFailure(result.status, true); return row;
}
