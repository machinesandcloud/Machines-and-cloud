// Managed lead sources use the same tenant-scoped request records as website chat.
// A provider callback may save customer context; it never grants SMS authority or sends a reply.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { atomicUpdate, createRecordOnce, list, assertCurrentWorkspace } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { workspaceTenant, supportedWorkspace, belongsToWorkspace } from './workspace-identity.mjs';
import { e164 } from './send.mjs';

const KIND = 'lead_connections', MAX_PENDING = 20, MAX_RECEIPTS = 2000, MAX_OPERATIONS = 100;
const providers = { angi: { label: 'Angi', url: 'https://office.angi.com/' }, thumbtack: { label: 'Thumbtack', url: 'https://www.thumbtack.com/pro' },google_local_services_ads:{label:'Google Local Services Ads',url:'https://developers.google.com/google-ads/api/docs/campaigns/local-service-campaigns'},yelp:{label:'Yelp quote requests',url:'https://docs.developer.yelp.com/docs/leads-api-zapier-integration'},meta_messaging:{label:'Facebook & Instagram messages',url:'https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-56730cef-8d38-4f1a-8cc3-54444b625e7c'},houzz:{label:'Houzz Pro',url:'https://pro.houzz.com/pro-help/r/how-to-use-houzz-pro-api'},nextdoor:{label:'Nextdoor',url:'https://developer.nextdoor.com/v1.0/reference/applying-for-access'},porch:{label:'Porch',url:'https://pro.porch.com/pro'} };
export const DISCOVERY_LEAD_SOURCES=Object.keys(providers).filter(source=>!['angi','thumbtack'].includes(source));
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = () => new Date().toISOString();
const keyFor = (client, source) => `${client.slug}/${workspaceTenant(client)}/${source}`;
const numeric = value => typeof value === 'string' && /^\d{1,40}$/.test(value) ? value : Number.isSafeInteger(value) && value > 0 ? String(value) : null;
const token = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class LeadConnectionError extends Error {
  constructor(code, message, status = 409, field = null) { super(message); Object.assign(this, { code, status, field }); }
}
const fail = (code, message, status = 409, field = null) => { throw new LeadConnectionError(code, message, status, field); };
function rowFor(client, source, row) {
  if (!Object.hasOwn(providers, source)) fail('invalid_lead_source', 'Choose a supported lead source.', 400);
  if (!row) return null;
  if (row.version !== 1 || row.slug !== client.slug || row.tenantIdentity !== workspaceTenant(client) || row.source !== source || !token(row.generation) || !Array.isArray(row.pending) || row.pending.length > MAX_PENDING || !Array.isArray(row.receipts) || row.receipts.length > MAX_RECEIPTS || !Array.isArray(row.operations) || row.operations.length > MAX_OPERATIONS || !['awaiting_provider','receiving','disconnected','partner_access_required'].includes(row.state)) fail('lead_connection_unavailable', 'This lead connection could not be read. Your saved requests are kept.', 503);
  return row;
}
async function current(client, mutation = false) {
  const value = await strictRead('clients', client.slug);
  if (!supportedWorkspace(value) || workspaceTenant(value) !== workspaceTenant(client)) fail('workspace_changed', 'This workspace changed. Sign in again before continuing.', 409);
  if (mutation && !['testing','live','paused'].includes(value.status)) fail('workspace_closed', 'This workspace is read-only. Its requests are kept.');
  return value;
}
async function owner(client, session, mutation = false) {
  const [value, access] = await Promise.all([current(client, mutation), session?.sessionHash ? strictRead('access_sessions', session.sessionHash) : null]);
  if (!access || access.scope !== 'onboarding' || access.status !== 'active' || !Number.isFinite(Date.parse(access.expiresAt)) || Date.parse(access.expiresAt) <= Date.now() || normalizeAccountEmail(access.email) !== normalizeAccountEmail(session?.email)) fail('verification_required', 'Sign in again to manage your lead connections.', 401);
  if (normalizeAccountEmail(access.email) !== normalizeAccountEmail(value.owner?.email)) fail('forbidden', 'This connection belongs to another workspace.', 403);
  return value;
}
export { owner as leadConnectionOwner, current as currentLeadWorkspace, keyFor as leadConnectionKey, rowFor as leadConnectionRow, numeric as leadProviderId };
function projection(client, source, saved) {
  const row = rowFor(client, source, saved), provider = providers[source];
  if(DISCOVERY_LEAD_SOURCES.includes(source)){const operation=row?.operations.find(item=>item.id===row.lastOperationId&&item.operation==='prepare'),request=operation&&row.state!=='disconnected'?{id:operation.id,state:'waiting_platform',owner:'machines_and_cloud',requestedAt:operation.at,providerJobStarted:false}:null;return {source,label:provider.label,state:row?.state==='disconnected'?'disconnected':request?'setup_requested':'not_connected',generation:row?.generation||null,providerBusinessId:row?.providerBusinessId||'',integrationEmail:row?.integrationEmail||'',lastOperationId:row?.lastOperationId||null,setupRequest:request,capabilities:{receiveLeads:false,receiveMessages:false,sendNativeReplies:false},setup:{providerURL:provider.url,instructions:[]},reason:request?'Your setup request is saved for Machines & Cloud. Account eligibility and a supported delivery route must be confirmed before account permission or costs are requested.':'Review the provider requirements and request setup. This option does not yet connect an account or deliver inquiries.'};}
  const configured = !!row && row.state !== 'disconnected';
  const requestSent=source==='angi'&&configured&&Number.isFinite(Date.parse(row?.requestSent?.reportedAt))&&Date.parse(row.requestSent.reportedAt)<=Date.now()?{reportedAt:row.requestSent.reportedAt,source:'owner_report',deliveryVerified:false}:null;
  const state = row?.state || (source === 'thumbtack' ? 'partner_access_required' : 'not_connected');
  const endpoint = configured && source === 'angi' ? `${(process.env.URL || 'https://machinesandcloud.com').replace(/\/$/,'')}/api/angi?c=${encodeURIComponent(client.slug)}&t=${workspaceTenant(client)}&g=${row.generation}` : null;
  const instructions = source === 'angi'
    ? ['Give Angi your business ID, integration email, this webhook URL and the X-API-KEY below.', 'Angi configures unlisted CRM connections through crmintegrations@angi.com. No email is sent from this screen.', 'Once Angi sends a valid lead, its details appear in Inbox. Reply to the customer through Angi or record your own contact outcome in the request.']
    : ['Native Thumbtack messages require our approved partner connection and your permission.', 'Save your Thumbtack business ID here so your setup keeps its context. This does not connect your account.', 'Continue to use Thumbtack to reply until a tested native connection is available.'];
  return { source, label: provider.label, state, generation: row?.generation || null, providerBusinessId: row?.providerBusinessId || '', integrationEmail: row?.integrationEmail || '', lastOperationId: row?.lastOperationId || null, createdAt:row?.createdAt||null,updatedAt:row?.updatedAt||null,lastReceivedAt: row?.lastReceivedAt || null, receivedCount: row?.receipts.length || 0, pendingCount: row?.pending.length || 0,requestSent,
    capabilities: { receiveLeads: source === 'angi', receiveMessages: false, sendNativeReplies: false },
    setup: { endpoint, headerName: source === 'angi' ? 'X-API-KEY' : null, secret: endpoint ? row.secret : null, instructions, providerURL: provider.url },
    reason: source === 'thumbtack' ? 'Save your Thumbtack connection request here. When the connection is enabled, you can sign in and choose your business.' : row?.pending.length ? 'A received lead is being saved to Inbox. The scheduled recovery will retry its same record.' : state === 'receiving' ? 'Lead delivery has been observed. Replies are handled in Angi; no automated text is sent.' : state === 'awaiting_provider' ? 'Your endpoint is ready. Waiting for a valid lead from Angi.' : state === 'disconnected' ? 'New deliveries are blocked. Earlier requests remain in Inbox.' : 'Prepare your Angi connection to bring new leads into Inbox.' };
}
export async function leadConnectionsView(client) {
  await current(client);
  const out = {};
  for (const source of Object.keys(providers)) {
    const saved=await strictRead(KIND,keyFor(client,source));out[source]=projection(client,source,saved);
    if(source==='thumbtack'){const {thumbtackConnectionView}=await import('./thumbtack-connection.mjs');out[source]=thumbtackConnectionView(client,saved,out[source]);}
  }
  await assertCurrentWorkspace(client); return out;
}
function parseAction(body) {
  if (!plain(body) || body.action !== 'lead_connection' || Object.keys(body).some(key => !['action','source','operation','operationId','expectedGeneration','providerBusinessId','integrationEmail'].includes(key)) || !Object.hasOwn(providers, body.source) || !['prepare','rotate','disconnect','report_request_sent'].includes(body.operation) || body.operation==='report_request_sent'&&(body.source!=='angi'||Object.keys(body).some(key=>['providerBusinessId','integrationEmail'].includes(key))) || !token(body.operationId) || !(body.expectedGeneration === null || token(body.expectedGeneration))) fail('invalid_lead_connection', 'Refresh your connections before saving this change.', 400);
  if(DISCOVERY_LEAD_SOURCES.includes(body.source)&&(body.operation==='rotate'||body.providerBusinessId!==undefined&&body.providerBusinessId!==''))fail('invalid_lead_connection','This option saves a setup request. It does not issue provider credentials or keys.',400);
  if (!['disconnect','report_request_sent'].includes(body.operation)) {
    if (body.source==='angi'&&!numeric(body.providerBusinessId) || body.source==='thumbtack'&&body.providerBusinessId!==''&&body.providerBusinessId!==undefined&&(!numeric(body.providerBusinessId)||String(body.providerBusinessId).length>32)) fail('invalid_provider_business', 'Enter the business ID from your lead-platform account.', 400, 'providerBusinessId');
    if (!normalizeAccountEmail(body.integrationEmail)) fail('invalid_integration_email', 'Enter a valid email for this connection.', 400, 'integrationEmail');
  }
  return { action: body.action, source: body.source, operation: body.operation, operationId: body.operationId, expectedGeneration: body.expectedGeneration, ...(['disconnect','report_request_sent'].includes(body.operation) ? {} : { providerBusinessId: numeric(body.providerBusinessId)||'', integrationEmail: normalizeAccountEmail(body.integrationEmail) }) };
}
export async function changeLeadConnection(client, session, body, { authorizationStart = false } = {}) {
  const input = parseAction(body), operationDigest = digest(input), at = stamp();
  await owner(client, session, true);
  const generation = randomBytes(16).toString('hex'), secret = randomBytes(32).toString('hex');
  await atomicUpdate(KIND, keyFor(client, input.source), async saved => {
    await owner(client, session, true); const row = rowFor(client, input.source, saved);
    const receipt = row?.operations.find(entry => entry.id === input.operationId);
    if (receipt) { if (receipt.digest !== operationDigest) fail('operation_conflict', 'That action identifier belongs to a different connection change.'); if (authorizationStart && (row.authorizationStart?.operationId !== input.operationId || row.authorizationStart?.generation !== row.generation)) fail('lead_connection_changed', 'This authorization belongs to an earlier connection. Refresh before reconnecting.'); return {}; }
    if ((row?.generation || null) !== input.expectedGeneration) fail('lead_connection_changed', 'This connection changed. Check its latest setup before saving.');
    if ((row?.operations.length || 0) >= MAX_OPERATIONS) fail('lead_connection_history_full', 'This connection history needs support review before another change.');
    if(input.operation==='report_request_sent'){if(!row||row.state==='disconnected'||!row.secret||!row.providerBusinessId||!row.integrationEmail)fail('lead_connection_missing','Prepare the current Angi connection before reporting its setup request.');const next={...row,requestSent:row.requestSent||{reportedAt:at},updatedAt:at,lastOperationId:input.operationId,operations:[...row.operations,{id:input.operationId,digest:operationDigest,operation:input.operation,at}]};return {value:next};}
    if(DISCOVERY_LEAD_SOURCES.includes(input.source)&&input.operation==='prepare'&&row&&row.state!=='disconnected')fail('lead_connection_exists','Your setup request is already saved. Check its status or cancel it before making a replacement request.');
    if(input.source==='thumbtack'&&row?.native?.webhookID&&input.operation!=='disconnect')fail('native_disconnect_required','Disconnect the existing Thumbtack connection before changing its business.');
    if (input.operation === 'prepare' && row && !['disconnected','partner_access_required'].includes(row.state)) fail('lead_connection_exists', 'This connection is already prepared. Rotate its key to replace the setup.');
    if (input.operation === 'disconnect' && !row) fail('lead_connection_missing', 'There is no saved connection to disconnect.');
    if (input.operation === 'rotate' && !row) fail('lead_connection_missing', 'Prepare this connection before rotating its key.');
    const next = input.operation === 'disconnect' ? { ...row, state: 'disconnected', secret: null, generation, ...(row.native?{native:{...row.native,status:row.native.webhookID?'disconnect_pending':'disconnected',disconnectRequestedAt:at}}:{}) } : { version: 1, slug: client.slug, tenantIdentity: workspaceTenant(client), source: input.source, state: input.source === 'angi' ? 'awaiting_provider' : 'partner_access_required', generation, secret: input.source === 'angi' ? secret : null, providerBusinessId: input.providerBusinessId, integrationEmail: input.integrationEmail, pending: row?.pending || [], receipts: row?.receipts || [], operations: row?.operations || [], createdAt: row?.createdAt || at, lastReceivedAt: null };
    next.updatedAt = at; next.lastOperationId = input.operationId;
    if (authorizationStart) next.authorizationStart = { operationId: input.operationId, generation };
    next.operations = [...next.operations, { id: input.operationId, digest: operationDigest, operation: input.operation, at }];
    return { value: next };
  });
  await owner(client, session);
  return { ok: true, leadConnections: await leadConnectionsView(client) };
}
function stringField(body, key, max, required = false) {
  if (body[key] === undefined || body[key] === null) { if (required) fail('invalid_lead_payload', `The Angi lead is missing ${key}.`, 400); return ''; }
  if (typeof body[key] !== 'string' || body[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body[key])) fail('invalid_lead_payload', 'The Angi lead contains an invalid field.', 400);
  return body[key].trim();
}
// This is the published May 2026 Angi contract, rather than guesses at legacy field aliases.
function angiPayload(body, connection) {
  if (!plain(body)) fail('invalid_lead_payload', 'Send an Angi JSON lead object.', 400);
  const id = numeric(body.leadOid), requestId = numeric(body.srOid), businessId = body.spEntityId === undefined ? null : numeric(body.spEntityId);
  if (!id || !requestId || body.spEntityId !== undefined && !businessId) fail('invalid_lead_payload', 'Use the documented Angi lead and service-request identifiers.', 400);
  if (businessId && businessId !== connection.providerBusinessId) fail('provider_business_mismatch', 'This lead belongs to a different Angi business.', 403);
  const name = stringField(body, 'name', 160, true), task = stringField(body, 'taskName', 300, true), comments = stringField(body, 'comments', 4000);
  const contact = stringField(body, 'primaryPhone', 40, true), phone = e164(contact), email = stringField(body, 'email', 254, true);
  if (email && !normalizeAccountEmail(email)) fail('invalid_lead_payload', 'The Angi lead email is invalid.', 400);
  const address = ['address','city','stateProvince','postalCode'].map(key => stringField(body, key, key === 'address' ? 240 : 80, true)).filter(Boolean).join(', ');
  let questions = [];
  if (body.interview !== undefined) {
    if (!Array.isArray(body.interview) || body.interview.length > 40) fail('invalid_lead_payload', 'The Angi interview exceeds the supported size.', 400);
    questions = body.interview.map(item => { if (!plain(item)) fail('invalid_lead_payload', 'The Angi interview has an invalid entry.', 400); return { question: stringField(item,'question',500,true), answer: stringField(item,'answer',2000,true) }; });
  }
  const trustedFormURL = stringField(body, 'trustedFormURL', 1000) || stringField(body, 'trustedFormUrl', 1000);
  const context = { task, comments, questions, originalPhone: contact, phoneExtension: stringField(body,'phoneExt',20), leadDescription: stringField(body,'leadDescription',300), matchType: stringField(body,'matchType',100), contactStatus: stringField(body,'contactStatus',200), leadSource: stringField(body,'leadSource',100), crmKey: stringField(body,'crmKey',160), providedBusinessId: businessId, connectedBusinessId: connection.providerBusinessId, automatedContactCompliant: body.automatedContactCompliant === true, automatedContactConsentId: stringField(body,'automatedContactConsentId',200), trustedFormURL };
  if (JSON.stringify(context).length > 16000) fail('invalid_lead_payload', 'The Angi lead context exceeds the supported size.', 413);
  return { id, requestId, name, phone, email, address, task, comments, context };
}
function recordFor(client, connection, payload, at) {
  const id = digest(['platform-lead-v1',workspaceTenant(client),'angi',connection.providerBusinessId,payload.id]).slice(0,40);
  const platform = { source: 'angi', label: 'Angi', externalLeadId: payload.id, externalRequestId: payload.requestId, providerBusinessId: connection.providerBusinessId, context: payload.context, replyMethod: 'vendor_app', replyUrl: providers.angi.url, replyInstructions: 'Open Angi and find lead '+payload.id+'. Reply there, then record the contact outcome here. Copying a reply does not send it.' };
  return { id, slug: client.slug, tenantIdentity: workspaceTenant(client), createdAt: at, customer_name: payload.name, phone: payload.phone, email: payload.email, address: payload.address, issue: [payload.task,payload.comments].filter(Boolean).join(': ').slice(0,300), reason: 'lead', urgency: 'this_week', wanted: '', language: 'en', unsure: '', nobook_reason: 'none', channel: 'angi', contact: 'angi:'+payload.id, source: 'angi', sourceId: payload.id, status: 'open', outcome: 'needs_action', customerType: 'new', platform, platformPayloadDigest: digest(payload), platformAcceptedGeneration: connection.generation };
}
async function saveAccepted(client, pending) {
  await current(client);
  const saved = await createRecordOnce('leads', client.slug, pending.record);
  if (!belongsToWorkspace(client, saved) || saved.platformPayloadDigest !== pending.record.platformPayloadDigest || saved.id !== pending.id) fail('lead_payload_conflict', 'This Angi lead identifier has different saved content. Check the original request.', 409);
  const confirmed = await strictRead('leads', `${client.slug}/${pending.id}`);
  if (!confirmed || confirmed.platformPayloadDigest !== pending.record.platformPayloadDigest || !belongsToWorkspace(client, confirmed)) fail('lead_receipt_uncertain', 'The lead save could not be confirmed. Retry the same delivery.', 503);
  await current(client); return confirmed;
}
async function finishAccepted(client, source, pending) {
  const saved = await saveAccepted(client, pending);
  await atomicUpdate(KIND,keyFor(client,source),async raw => {
    await current(client); const row = rowFor(client,source,raw);
    const entry = row?.pending.find(item => item.id === pending.id);
    if (!entry) return {};
    if (entry.record.platformPayloadDigest !== saved.platformPayloadDigest) fail('lead_payload_conflict','The pending lead has different saved content.');
    const observedCurrent = row.generation === pending.generation && row.state !== 'disconnected';
    return { value: { ...row, pending: row.pending.filter(item => item.id !== pending.id), receipts: row.receipts.includes(pending.id) ? row.receipts : [...row.receipts,pending.id], ...(observedCurrent ? {state:'receiving',lastReceivedAt:pending.acceptedAt} : {}), updatedAt: stamp() } };
  });
  return saved;
}
export async function receiveManagedAngi(req, client) {
  const url = new URL(req.url), tenant = workspaceTenant(client), generation = url.searchParams.get('g'), supplied = req.headers.get('x-api-key') || '';
  if (url.searchParams.get('t') !== tenant || !token(generation) || url.searchParams.has('key') || [...url.searchParams.keys()].some(key => !['c','t','g'].includes(key)) || [...url.searchParams.keys()].length !== 3) fail('forbidden','This Angi endpoint is not current.',403);
  let row = rowFor(client,'angi',await strictRead(KIND,keyFor(client,'angi')));
  if (!row || row.state === 'disconnected' || row.generation !== generation || !safeEqual(row.secret,supplied)) fail('forbidden','The Angi credential is not current.',403);
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail('invalid_lead_payload','Use application/json.',415);
  const length = req.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length) > 32768)) fail('lead_payload_too_large','The Angi lead exceeds the supported size.',413);
  const reader = req.body?.getReader(); if (!reader) fail('invalid_lead_payload','An Angi JSON lead is required.',400);
  let bytes = 0, chunks = [];
  for (;;) { const part = await reader.read(); if(part.done)break; bytes += part.value.byteLength; if(bytes>32768){await reader.cancel();fail('lead_payload_too_large','The Angi lead exceeds the supported size.',413);} chunks.push(Buffer.from(part.value)); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('invalid_lead_payload','Send valid JSON.',400); }
  const payload = angiPayload(body,row), at = stamp(), record = recordFor(client,row,payload,at), pending = {id:record.id,generation,acceptedAt:at,record};
  let duplicate = false;
  await atomicUpdate(KIND,keyFor(client,'angi'),async raw => {
    const value = await current(client,true); row = rowFor(client,'angi',raw);
    if (!['testing','live'].includes(value.status) || !row || row.state === 'disconnected' || row.generation !== generation || !safeEqual(row.secret,supplied)) fail('forbidden','This Angi connection is not accepting new deliveries.',403);
    if(row.providerBusinessId!==pending.record.platform.providerBusinessId)fail('provider_business_mismatch','The connection changed before this lead could be accepted.',403);
    const existing = row.pending.find(item=>item.id===pending.id);
    if (existing) { if(existing.record.platformPayloadDigest!==record.platformPayloadDigest)fail('lead_payload_conflict','This lead identifier has different pending content.'); duplicate=true;return {}; }
    if(row.receipts.includes(pending.id)){const saved=await strictRead('leads',`${client.slug}/${pending.id}`);if(!saved||!belongsToWorkspace(client,saved)||saved.platformPayloadDigest!==record.platformPayloadDigest)fail('lead_payload_conflict','This lead identifier has different saved content.');duplicate=true;return {};}
    if(row.pending.length>=MAX_PENDING || row.pending.length+row.receipts.length>=MAX_RECEIPTS)fail('lead_connection_full','The lead connection has reached its safe retained-record limit.',503);
    return {value:{...row,pending:[...row.pending,pending],updatedAt:at}};
  });
  const saved = await finishAccepted(client,'angi',pending);
  return {status:'success',id:saved.id,duplicate,texted:false};
}
// Local projections only: no model, email, SMS or vendor request. Pending acceptance precedes
// the record write, so ordinary scheduled retries finish the same deterministic record.
export async function recoverLeadConnections({limit = 40} = {}) {
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid lead recovery limit');
  let examined=0,recovered=0,failed=0;
  for(const slug of await list('clients','')){
    const client=await strictRead('clients',slug);if(!supportedWorkspace(client))continue;
    const row=rowFor(client,'angi',await strictRead(KIND,keyFor(client,'angi')));
    for(const pending of row?.pending||[]){if(examined>=limit)return {examined,recovered,failed,limited:true};examined++;try{await finishAccepted(client,'angi',pending);recovered++;}catch{failed++;}}
  }
  return {examined,recovered,failed,limited:false};
}
