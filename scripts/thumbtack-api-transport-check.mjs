// Offline transport contracts only; all socket entrypoints and fetch are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
for (const [object, names] of [[net, ['connect', 'createConnection']], [tls, ['connect']], [http, ['request', 'get']], [https, ['request', 'get']]]) for (const name of names) object[name] = () => { throw new Error('Socket networking is forbidden in this offline check'); };
const calls = [], groups = [], originalFetch = globalThis.fetch;
let respond = () => { throw new Error('Unexpected intercepted fetch'); };
globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return respond(String(url), options); };
const api = await import('../netlify/functions/lib/thumbtack-api.mjs');
assert.equal(calls.length, 0, 'Import must not request a provider');
const accessToken = 'SYNTHETIC_ACCESS_CANARY', clientSecret = 'SYNTHETIC_CLIENT_CANARY', refreshToken = 'SYNTHETIC_REFRESH_CANARY';
const client = { clientId: 'synthetic-client', clientSecret, tokenAuthMethod: 'client_secret_post' };
const exchange = { ...client, redirectURI: 'https://machinesandcloud.com/api/thumbtack-oauth', code: 'synthetic-code', expectedState: 'synthetic-state-123', responseState: 'synthetic-state-123' };
const webhookURL = 'https://machinesandcloud.com/api/thumbtack?c=synthetic-air&t=' + 'a'.repeat(64) + '&g=' + 'b'.repeat(32);
const business = { businessID: '111', name: 'Synthetic Air', access_token: accessToken };
const negotiation = { negotiationID: '222', status: 'Open', business, category: { categoryID: '444', name: 'AC Repair' }, customer: { customerID: '555', displayName: 'Customer', location: { city: 'Houston', state: 'TX', zipCode: '77057' }, refresh_token: refreshToken }, details: [{ question: 'Need', answer: 'AC not cooling' }], createTime: '2026-10-24T00:00:00Z' };
const message = { messageID: '333', negotiationID: '222', from: 'Customer', text: 'Is tomorrow available?', sentAt: '2026-10-24T00:00:00Z', customer: { customerID: '555', displayName: 'Customer' }, attachments: [] };
const webhook = { webhookID: 'hook-123', businessID: '111', webhookURL, enabled: false, authType: 'Basic', eventTypes: ['MessageCreatedV4', 'NegotiationCreatedV4'], auth: { username: 'private-user', password: 'PRIVATE_HOOK_CANARY' } };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
function safe(error) { for (const canary of [accessToken, clientSecret, refreshToken, 'PRIVATE_HOOK_CANARY']) assert.ok(!JSON.stringify({ message: error.message, ...error }).includes(canary), 'Error leaked secret'); }
async function rejects(call, code, outcome, count = 0) { const before = calls.length; await assert.rejects(call, error => { assert.ok(error instanceof api.ThumbtackAPIError); assert.equal(error.code, code); if (outcome) assert.equal(error.outcome, outcome); safe(error); return true; }); assert.equal(calls.length - before, count); }
async function group(name, run) { try { await run(); groups.push({ name, passed: true }); } catch (error) { groups.push({ name, passed: false, error: String(error.message).replace(/SYNTHETIC_[A-Z_]+/g, '[fixture]') }); throw error; } }
let failure;
try {
  await group('Import is inert and authorization URL has verified endpoints/audience/explicit scopes', async () => {
    const before = calls.length, url = new URL(api.thumbtackAuthorizationURL({ clientId: client.clientId, redirectURI: exchange.redirectURI, state: exchange.expectedState, scopes: ['supply::provisioned.scope', 'offline_access'] }));
    assert.equal(url.origin + url.pathname, 'https://auth.thumbtack.com/oauth2/auth'); assert.equal(url.searchParams.get('audience'), 'urn:partner-api'); assert.equal(url.searchParams.get('response_type'), 'code'); assert.equal(url.searchParams.get('scope'), 'supply::provisioned.scope offline_access'); assert.equal(calls.length, before);
  });
  await group('Missing or guessed wildcard/demand scopes and insecure callback fail before HTTP', async () => {
    for (const scopes of [undefined, [], ['offline_access'], ['supply::*', 'offline_access'], ['demand::anything', 'offline_access'], ['supply::x'], ['supply::x', 'offline_access', 'offline_access']]) assert.throws(() => api.thumbtackAuthorizationURL({ clientId: client.clientId, redirectURI: exchange.redirectURI, state: exchange.expectedState, scopes }), error => error.code === 'partner_scopes_required');
    for (const redirectURI of ['http://machinesandcloud.com/api/callback', 'https://user:pass@machinesandcloud.com/api/callback', 'https://machinesandcloud.com/api/callback#token']) assert.throws(() => api.thumbtackAuthorizationURL({ clientId: client.clientId, redirectURI, state: exchange.expectedState, scopes: ['supply::x', 'offline_access'] }));
  });
  await group('Code exchange uses actual OAuth library and one form-encoded client-secret-post request', async () => {
    respond = (url, options) => { assert.equal(url, 'https://auth.thumbtack.com/oauth2/token'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); const body = new URLSearchParams(options.body); assert.equal(body.get('grant_type'), 'authorization_code'); assert.equal(body.get('code'), exchange.code); assert.equal(body.get('redirect_uri'), exchange.redirectURI); assert.equal(body.get('client_secret'), clientSecret); return json({ access_token: accessToken, refresh_token: refreshToken, expires_in: 3600, token_type: 'Bearer', scope: 'supply::provisioned.scope offline_access', ignored: 'not-projected' }); };
    const before = calls.length, result = await api.exchangeThumbtackCode(exchange); assert.equal(calls.length - before, 1); assert.equal(result.access_token, accessToken); assert.equal(result.refresh_token, refreshToken); assert.ok(!('ignored' in result));
  });
  await group('State mismatch and missing authentication method fail before token HTTP', async () => {
    await rejects(() => api.exchangeThumbtackCode({ ...exchange, responseState: 'different-state-123' }), 'oauth_state_mismatch', 'not_sent');
    await rejects(() => api.exchangeThumbtackCode({ ...exchange, tokenAuthMethod: undefined }), 'token_auth_method_required', 'not_sent');
  });
  await group('Client-secret-basic authentication and refresh token rotation use actual library', async () => {
    respond = (url, options) => { const headers = new Headers(options.headers), body = new URLSearchParams(options.body); assert.ok(headers.get('authorization').startsWith('Basic ')); assert.equal(body.get('grant_type'), 'refresh_token'); assert.equal(body.get('refresh_token'), refreshToken); assert.equal(body.get('client_secret'), null); return json({ access_token: accessToken + '_2', refresh_token: refreshToken + '_2', token_type: 'bearer', expires_in: 3600 }); };
    const result = await api.refreshThumbtackToken({ ...client, tokenAuthMethod: 'client_secret_basic', refreshToken }); assert.equal(result.refresh_token, refreshToken + '_2');
  });
  await group('Missing rotating refresh receipt and non-Bearer token remain unknown', async () => {
    for (const body of [{ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 }, { access_token: accessToken, refresh_token: refreshToken, token_type: 'MAC', expires_in: 3600 }, { access_token: 'invalid token', refresh_token: refreshToken, token_type: 'Bearer', expires_in: 3600 }]) { respond = () => json(body); await rejects(() => api.refreshThumbtackToken({ ...client, refreshToken }), 'provider_invalid_response', 'unknown', 1); }
  });
  await group('Rotating refresh transport loss and invalid-grant never retry or leak provider error text', async () => {
    respond = () => { throw new Error('lost ' + refreshToken); }; await rejects(() => api.refreshThumbtackToken({ ...client, refreshToken }), 'provider_transport_error', 'unknown', 1);
    respond = () => json({ error: 'invalid_grant', error_description: refreshToken }, 400); await rejects(() => api.refreshThumbtackToken({ ...client, refreshToken }), 'provider_http_error', 'rejected', 1);
  });
  await group('Businesses endpoint projects documented data and never implies list completeness', async () => {
    respond = (url, options) => { assert.equal(url, 'https://api.thumbtack.com/api/v4/businesses'); assert.equal(new Headers(options.headers).get('authorization'), 'Bearer ' + accessToken); return json({ data: [business], pagination: { limit: 20, nextURL: 'https://malicious.invalid/' }, access_token: accessToken }); };
    const result = await api.thumbtackBusinesses({ accessToken }); assert.deepEqual(result, { data: [{ businessID: '111', name: business.name }], pagination: { limit: 20 }, complete: false });
  });
  await group('Provider IDs, bearer whitespace and missing credentials fail before HTTP', async () => {
    for (const negotiationID of ['../secrets', '222?token=x', 'https://evil.invalid', '2'.repeat(33), 222]) await rejects(() => api.thumbtackNegotiation({ accessToken, negotiationID }), 'invalid_provider_id', 'not_sent');
    await rejects(() => api.thumbtackBusinesses({ accessToken: 'token\r\ninjected' }), 'missing_credentials', 'not_sent'); await rejects(() => api.thumbtackBusinesses({ accessToken: undefined }), 'missing_credentials', 'not_sent');
  });
  await group('Negotiation projection retains business/customer/job context and rejects cross-ID receipts', async () => {
    respond = () => json(negotiation); const result = await api.thumbtackNegotiation({ accessToken, negotiationID: '222' }); assert.equal(result.business.businessID, '111'); assert.equal(result.customer.location.city, 'Houston'); assert.equal(result.details[0].answer, 'AC not cooling'); assert.ok(!JSON.stringify(result).includes(accessToken)); assert.ok(!JSON.stringify(result).includes(refreshToken));
    respond = () => json({ ...negotiation, negotiationID: '999' }); await rejects(() => api.thumbtackNegotiation({ accessToken, negotiationID: '222' }), 'provider_invalid_response', 'unavailable', 1);
  });
  await group('Documented nested lead response preserves the project, customer name, date and location', async () => {
    const nested = { negotiationID:'222', createdAt:'2026-10-28T12:00:00Z', status:'Open', business,
      customer:{customerID:'555',firstName:'Olivia',lastName:'Young',phone:'555-555-5555',refresh_token:refreshToken},
      request:{requestID:'666',description:'Looking to fully renovate my kitchen.',category:{categoryID:'444',name:'Kitchen Remodel'},location:{city:'Katy',state:'TX',zipCode:'77494'},details:[{question:'Project scope',answer:'Full kitchen renovation'}],attachments:[{url:'https://unfetched.invalid/'}],access_token:accessToken} };
    respond=()=>json(nested);const result=await api.thumbtackNegotiation({accessToken,negotiationID:'222'});
    assert.equal(result.customer.displayName,'Olivia Young');assert.equal(result.customer.location.city,'Katy');assert.equal(result.category.name,'Kitchen Remodel');assert.equal(result.details[0].answer,'Full kitchen renovation');assert.equal(result.description,nested.request.description);assert.equal(result.createTime,nested.createdAt);
    assert.ok(!JSON.stringify(result).includes(accessToken));assert.ok(!JSON.stringify(result).includes(refreshToken));assert.ok(!JSON.stringify(result).includes('unfetched.invalid'));assert.ok(!JSON.stringify(result).includes('555-555-5555'));
    for(const request of [[], 'not-an-object', {details:'not-an-array'}, {details:Array(101).fill({question:'x',answer:'y'})}]){respond=()=>json({...nested,request});await rejects(()=>api.thumbtackNegotiation({accessToken,negotiationID:'222'}),'provider_invalid_response','unavailable',1);}
  });
  await group('Business negotiation list refuses cross-business records', async () => {
    respond = () => json({ data: [negotiation] }); const result = await api.thumbtackNegotiations({ accessToken, businessID: '111' }); assert.equal(result.data.length, 1);
    respond = () => json({ data: [{ ...negotiation, business: { businessID: '999' } }] }); await rejects(() => api.thumbtackNegotiations({ accessToken, businessID: '111' }), 'provider_invalid_response', 'unavailable', 1);
  });
  await group('Message history retains exact long text and marks unsupported attachment structure', async () => {
    respond = () => json({ data: [{ ...message, text: 'x'.repeat(10000), attachments: [{ url: 'https://unfetched.invalid/' }], access_token: accessToken }], pagination: { limit: 3 } }); const result = await api.thumbtackMessages({ accessToken, negotiationID: '222' }); assert.equal(result.data[0].text.length, 10000); assert.equal(result.data[0].hasAttachments, true); assert.ok(!('attachments' in result.data[0])); assert.equal(calls.at(-1).url, 'https://api.thumbtack.com/api/v4/negotiations/222/messages');
    respond = () => json({ data: [{ ...message, negotiationID: '999' }] }); await rejects(() => api.thumbtackMessages({ accessToken, negotiationID: '222' }), 'provider_invalid_response', 'unavailable', 1);
  });
  await group('Native reply POST is exactly text-only and requires matching provider message receipt', async () => {
    respond = (url, options) => { assert.equal(url, 'https://api.thumbtack.com/api/v4/negotiations/222/messages'); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), { text: 'Yes, tomorrow works.\nWhat time suits you?' }); return json(message, 201); };
    const before = calls.length, result = await api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Yes, tomorrow works.\nWhat time suits you?' }); assert.equal(calls.length - before, 1); assert.deepEqual(result, { accepted: true, status: 201, negotiationID: '222', messageID: '333' });
  });
  await group('Empty, control-containing and over-bound replies fail before HTTP', async () => {
    for (const text of ['', ' \n ', 'bad\x00text', 'x'.repeat(8001), '🙂'.repeat(2001)]) await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text }), 'invalid_message', 'not_sent');
  });
  await group('A 2xx without matching native receipt stays unknown without repeat', async () => {
    for (const body of [{}, { ok: true }, { ...message, messageID: undefined }, { ...message, negotiationID: '999' }, { ...message, messageID: 333 }]) { respond = () => json(body); await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Hello' }), 'provider_invalid_response', 'unknown', 1); }
  });
  await group('Native transport errors, server errors, conflict and malformed JSON stay unknown', async () => {
    respond = () => { throw new Error('lost ' + accessToken); }; await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Hello' }), 'provider_transport_error', 'unknown', 1);
    for (const status of [408, 409, 500, 503]) { respond = () => json({ access_token: accessToken }, status); await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Hello' }), 'provider_http_error', 'unknown', 1); }
    respond = () => new Response('{', { headers: { 'Content-Type': 'application/json' } }); await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Hello' }), 'provider_invalid_response', 'unknown', 1);
  });
  await group('Explicit authorization/rate-limit rejections never trigger automatic sends', async () => {
    for (const status of [400, 401, 403, 404, 429]) { respond = () => json({ error: accessToken }, status); await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Hello' }), 'provider_http_error', 'rejected', 1); }
  });
  await group('Redirect response and declared/streamed overflow are refused without follow or retry', async () => {
    respond = () => new Response('', { status: 302, headers: { location: 'https://evil.invalid' } }); await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Hello' }), 'provider_redirect_rejected', 'unknown', 1);
    respond = () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '262145' } }); await rejects(() => api.thumbtackBusinesses({ accessToken }), 'provider_response_too_large', 'unavailable', 1);
    respond = () => new Response('x'.repeat(262145), { headers: { 'Content-Type': 'application/json' } }); await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Hello' }), 'provider_response_too_large', 'unknown', 1);
  });
  await group('Wrong media type, primitive JSON and excess rows fail closed', async () => {
    respond = () => new Response('{}', { headers: { 'Content-Type': 'text/html' } }); await rejects(() => api.thumbtackBusinesses({ accessToken }), 'provider_invalid_response', 'unavailable', 1);
    respond = () => json([]); await rejects(() => api.thumbtackBusinesses({ accessToken }), 'provider_invalid_response', 'unavailable', 1);
    respond = () => json({ data: Array(101).fill(business) }); await rejects(() => api.thumbtackBusinesses({ accessToken }), 'provider_invalid_response', 'unavailable', 1);
  });
  await group('Business webhook creation is disabled and includes verified event names and Basic credentials', async () => {
    respond = (url, options) => { assert.equal(url, 'https://api.thumbtack.com/api/v4/businesses/111/webhooks'); assert.deepEqual(JSON.parse(options.body), { webhookURL, eventTypes: ['MessageCreatedV4', 'NegotiationCreatedV4'], enabled: false, auth: { username: 'private-user', password: 'PRIVATE_HOOK_CANARY' } }); return json(webhook, 201); };
    const result = await api.createThumbtackWebhook({ accessToken, businessID: '111', webhookURL, username: 'private-user', password: 'PRIVATE_HOOK_CANARY' }); assert.equal(result.webhookID, webhook.webhookID); assert.ok(!('auth' in result));
  });
  await group('Webhook callbacks reject foreign hosts, credentials, fragments, duplicate and missing query bindings', async () => {
    for (const url of [webhookURL.replace('machinesandcloud.com', 'evil.invalid'), webhookURL.replace('/api/thumbtack', '/elsewhere'), webhookURL + '#fragment', webhookURL + '&g=' + 'c'.repeat(32), webhookURL.replace('&t=' + 'a'.repeat(64), ''), webhookURL.replace('https:', 'http:')]) await rejects(() => api.createThumbtackWebhook({ accessToken, businessID: '111', webhookURL: url, username: 'private-user', password: 'PRIVATE_HOOK_CANARY' }), 'invalid_webhook_url', 'not_sent');
  });
  await group('Created webhook mismatches and missing receipt stay unknown', async () => {
    for (const body of [{}, { ...webhook, businessID: '999' }, { ...webhook, webhookURL: 'https://evil.invalid/' }, { ...webhook, enabled: true }, { ...webhook, authType: 'None' }, { ...webhook, eventTypes: ['MessageCreatedV4', 'MessageCreatedV4'] }]) { respond = () => json(body); await rejects(() => api.createThumbtackWebhook({ accessToken, businessID: '111', webhookURL, username: 'private-user', password: 'PRIVATE_HOOK_CANARY' }), 'provider_invalid_response', 'unknown', 1); }
  });
  await group('Webhook listing retains unrelated events without authorizing them or leaking auth credentials', async () => {
    respond = () => json({ data: [webhook, { ...webhook, webhookID: 'different-hook', authType: 'None', eventTypes: ['UnrelatedEvent'] }] }); const result = await api.thumbtackWebhooks({ accessToken, businessID: '111' }); assert.equal(result.data.length, 2); assert.equal(result.complete, false); assert.ok(!JSON.stringify(result).includes('PRIVATE_HOOK_CANARY'));
  });
  await group('Known webhook GET checks exact business and provider ID rather than claiming absence from incomplete list', async () => {
    respond = (url, options) => { assert.equal(url, 'https://api.thumbtack.com/api/v4/businesses/111/webhooks/hook-123'); assert.equal(options.method, 'GET'); return json(webhook); }; const result = await api.thumbtackWebhook({ accessToken, businessID: '111', webhookID: 'hook-123' }); assert.equal(result.webhookID, 'hook-123');
    respond = () => json({ ...webhook, webhookID: 'foreign-hook' }); await rejects(() => api.thumbtackWebhook({ accessToken, businessID: '111', webhookID: 'hook-123' }), 'provider_invalid_response', 'unavailable', 1);
    respond = () => json({}, 404); await rejects(() => api.thumbtackWebhook({ accessToken, businessID: '111', webhookID: 'hook-123' }), 'provider_http_error', 'unavailable', 1);
  });
  await group('Enable and disable use only PUT enabled boolean and retain explicit receipt identity', async () => {
    for (const enabled of [true, false]) { respond = (url, options) => { assert.equal(url, 'https://api.thumbtack.com/api/v4/businesses/111/webhooks/hook-123'); assert.equal(options.method, 'PUT'); assert.deepEqual(JSON.parse(options.body), { enabled }); return json({ ...webhook, enabled }); }; const result = await api.enableThumbtackWebhook({ accessToken, businessID: '111', webhookID: 'hook-123', enabled }); assert.equal(result.enabled, enabled); }
    respond = () => json({}); await rejects(() => api.enableThumbtackWebhook({ accessToken, businessID: '111', webhookID: 'hook-123' }), 'provider_invalid_response', 'unknown', 1);
  });
  await group('Slow response body is bounded by the same five-second deadline and never repeats POST', async () => {
    respond = () => new Response(new ReadableStream({ start() {}, cancel() {} }), { headers: { 'Content-Type': 'application/json' } }); const before = Date.now(); await rejects(() => api.sendThumbtackMessage({ accessToken, negotiationID: '222', text: 'Hello' }), 'provider_timeout', 'unknown', 1); assert.ok(Date.now() - before < 6500);
  });
} catch (error) { failure = error; }
finally { globalThis.fetch = originalFetch; }
const source = path.resolve('netlify/functions/lib/thumbtack-api.mjs');
const receipt = { checkedAt: new Date().toISOString(), stage: 'author_offline_transport_only', passed: !failure, groups, totals: { passed: groups.filter(row => row.passed).length, failed: groups.filter(row => !row.passed).length, interceptedRequests: calls.length, liveRequests: 0 }, source: { path: 'netlify/functions/lib/thumbtack-api.mjs', sha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex') }, limits: ['Actual Thumbtack account/permission/provider behavior is not tested.', 'No production mutation or publication.', 'Provisioned scopes and token authentication method remain explicit prerequisites.', 'Native POST success requires a matching message receipt; absent receipt stays unknown.', 'Indexed primary docs are protocol evidence, not an observed provider response.'] };
const outputAt = process.argv.indexOf('--output'); if (outputAt >= 0) { const output = process.argv[outputAt + 1]; if (!output) throw new Error('Missing output path'); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); }
console.log(JSON.stringify({ passed: receipt.passed, ...receipt.totals })); if (failure) { console.error(failure.stack); process.exitCode = 1; }
