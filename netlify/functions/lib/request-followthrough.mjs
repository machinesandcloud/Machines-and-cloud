// Owner-recorded follow-through. This journal never sends a message or changes a visit.
import { createHash } from 'node:crypto';
import { atomicUpdate, assertCurrentWorkspace, conversationReference } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { workspaceTenant, belongsToWorkspace } from './workspace-identity.mjs';
import { isSupportedSelfServiceClient } from './setup.mjs';
const KIND = 'request_followthrough', LIMIT = 300;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const revision = /^[a-f0-9]{64}$/, identifier = /^[a-zA-Z0-9_-]{1,80}$/;
export class RequestFollowthroughError extends Error {
  constructor(code, message, status = 409, field = null) { super(message); Object.assign(this, { code, status, field }); }
}
const fail = (code, message, status = 409, field = null) => { throw new RequestFollowthroughError(code, message, status, field); };
const initial = () => ({ seenAt: null, owner: null, nextAction: null, dueAt: null, contact: 'not_recorded', completedAt: null, resolution: null, replyDraft: null });
function contactIdentity(lead) {
  const digits = String(lead.phone || '').replace(/\D/g, '');
  if (digits) return 'phone:' + (digits.length === 10 ? '1' + digits : digits);
  return 'contact:' + String(lead.contact || lead.customer_name || '').trim().toLowerCase();
}
function currentState(lead, row) {
  const state = structuredClone(row.state);
  if (state.contact !== 'not_recorded') {
    const evidence = row.history.findLast(entry => entry.type === (state.contact === 'reached' ? 'reached' : 'attempt'));
    if (!evidence?.source || contactIdentity(evidence.source) !== contactIdentity(lead)) state.contact = 'not_recorded';
  }
  return state;
}
// Meaningful customer facts, not updatedAt/ackedAt or delivery housekeeping.
export function requestSourceRevision(lead) {
  const existing=['id','slug','tenantIdentity','customer_name','phone','address','issue','reason','urgency','wanted','outcome','status','channel','contact','websiteSetupCheck'].map(key => [key, lead[key] ?? null]).concat([['deliveryTenant', lead.delivery?.tenantIdentity ?? null]]);
  // Existing website and managed-message operations retain their exact source digest.
  // Only a real platform request adds its imported contact and conversation context.
  if(lead.platform&&['angi','thumbtack'].includes(lead.platform.source))existing.push(['platform',lead.platform],['email',lead.email??null]);
  return digest(existing);
}
export const requestJournalKey = (client, id) => `${client.slug}/${workspaceTenant(client)}/${id}`;
function journal(client, id, saved) {
  if (!saved) return { version: 1, tenantIdentity: workspaceTenant(client), requestId: id, sourceRevision: null, state: initial(), history: [] };
  if (saved.version !== 1 || saved.tenantIdentity !== workspaceTenant(client) || saved.requestId !== id || !plain(saved.state) || !Array.isArray(saved.history) || saved.history.length > LIMIT || !['not_recorded','attempted','reached'].includes(saved.state.contact) || saved.history.some(entry=>!plain(entry)||typeof entry.id!=='string'||!/^[a-f0-9]{32}$/.test(entry.id)||!plain(entry.input)||typeof entry.actor!=='string')) fail('request_history_unavailable', 'This request history could not be read safely. Contact support.', 503);
  return saved;
}
async function authority(client, session, mutation = false) {
  const [current, access] = await Promise.all([strictRead('clients', client.slug), session?.sessionHash ? strictRead('access_sessions', session.sessionHash) : null]);
  if (!access || access.scope !== 'onboarding' || access.status !== 'active' || Date.parse(access.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(access.expiresAt)) || normalizeAccountEmail(access.email) !== normalizeAccountEmail(session?.email)) fail('verification_required', 'Sign in again to open this request.', 401);
  if (!current || !isSupportedSelfServiceClient(current) || workspaceTenant(current) !== workspaceTenant(client) || normalizeAccountEmail(access.email) !== normalizeAccountEmail(current.owner?.email)) fail('forbidden', 'This request is not available in this workspace.', 403);
  if (mutation && !['testing','live','paused'].includes(current.status)) fail('workspace_closed', 'This workspace is read-only. Your request history is kept.');
  return current;
}
async function source(client, id) {
  if (typeof id !== 'string' || !identifier.test(id)) fail('invalid_request', 'Choose a saved request.', 400);
  const lead = await strictRead('leads', `${client.slug}/${id}`);
  if (!lead || lead.id !== id || !belongsToWorkspace(client, lead)) fail('request_not_found', 'This saved request is not available.', 404);
  return lead;
}
function view(client, lead, row, operationId = null) {
  const sourceRevision = requestSourceRevision(lead), reviewRequired = !!row.sourceRevision && row.sourceRevision !== sourceRevision;
  const state = currentState(lead, row);
  const excluded = !!lead.websiteSetupCheck || !!lead.simulation || lead.status === 'spam' || lead.outcome === 'spam';
  const due = !state.completedAt && !!state.dueAt && Date.parse(state.dueAt) <= Date.now();
  const needsFollowup = !excluded && (reviewRequired || !state.completedAt && (due || !!state.nextAction || lead.status === 'open'));
  const receipt = operationId && row.history.find(entry => entry.id === operationId);
  return { sourceRevision, revision: digest(row), reviewRequired, state, due, needsFollowup,
    canChange: !excluded && ['testing','live','paused'].includes(client.status) && row.history.length < LIMIT,
    historyFull: row.history.length >= LIMIT, readOnlyReason: excluded ? 'Setup checks and filtered requests are read-only.' : !['testing','live','paused'].includes(client.status) ? 'This workspace is closed. Its request history remains available.' : row.history.length >= LIMIT ? 'This retained history is full. Contact support before recording more work.' : null, source: Object.fromEntries(['id','customer_name','phone','email','address','issue','reason','urgency','wanted','outcome','status','channel','contact','createdAt'].map(key => [key, lead[key] ?? null])),
    history: structuredClone(row.history), ...(lead.platform ? {platform:structuredClone(lead.platform),customerFacts:lead.platformQualification?structuredClone(lead.platformQualification):null} : {}), conversation: lead.channel === 'web' && /^[a-zA-Z0-9_-]{1,60}$/.test(lead.contact || '') ? {reference:conversationReference(client,'web',lead.contact),contact:lead.contact} : null, receipt: receipt ? { id: receipt.id, at: receipt.at, type: receipt.type } : null };
}
export async function requestFollowthroughSummaries(client, leads) {
  if (!isSupportedSelfServiceClient(client)) return leads;
  return Promise.all(leads.map(async lead => {
    const row = journal(client, lead.id, await strictRead(KIND, requestJournalKey(client, lead.id)));
    const { source: ignored, history: ignoredHistory, ...followthrough } = view(client, lead, row);
    return { ...lead, followthrough };
  }));
}
export async function readRequestFollowthrough(client, session, id, operationId = null) {
  await authority(client, session);
  if (operationId !== null && !/^[a-f0-9]{32}$/.test(operationId)) fail('invalid_request', 'Use the original saved action.', 400);
  const lead = await source(client, id), row = journal(client, id, await strictRead(KIND, requestJournalKey(client, id)));
  const latest = await source(client, id), result = view(client, latest, row, operationId);
  await authority(client, session); await assertCurrentWorkspace(client);
  const {readRequestAutomation}=await import('./request-followup.mjs');const automation=await readRequestAutomation(client,id);if(automation)result.automaticFollowup=automation;
  if(latest.platform?.source==='thumbtack'){
    const {thumbtackReplyView}=await import('./thumbtack-connection.mjs');const replies=await thumbtackReplyView(client,id),nativeReply=operationId?replies.find(reply=>reply.id===operationId):replies.at(-1);
    const connection=(await import('./lead-connections.mjs')).leadConnectionsView;const native=(await connection(client)).thumbtack;
    result.platformConversation={messages:(latest.platform.context?.messages||[]).map(message=>({id:message.messageID,from:message.from,text:message.text,sentAt:message.sentAt,hasAttachments:message.hasAttachments,actor:replies.find(reply=>reply.providerMessageID===message.messageID)?.actor||null})),complete:latest.platform.context?.historyComplete===true,unavailableReason:latest.platform.context?.historyComplete===true?null:'Recent messages are shown. Earlier history and attachments may need to be opened in Thumbtack.'};
    result.nativeReply=nativeReply?{operationId:nativeReply.id,state:nativeReply.state,receiptId:nativeReply.providerMessageID,actor:nativeReply.actor||'owner',at:nativeReply.at,text:nativeReply.text,reason:nativeReply.error}:null;
    result.platformCapabilities={canSendNative:native.capabilities.sendNativeReplies&&!replies.some(reply=>['reserved','sending','unknown'].includes(reply.state)),expectedGeneration:native.generation};
    const {platformAIThreadView}=await import('./platform-ai.mjs');const {readNativeConnection}=await import('./thumbtack-connection.mjs');result.platformAutomation=platformAIThreadView(client,await readNativeConnection(client),id);
  }
  await authority(client,session);await assertCurrentWorkspace(client);
  return { ok: true, request: result };
}
function parse(body) {
  const fields = { seen: [], assign: [], plan: ['nextAction','dueAt'], attempt: ['channel','result'], reached: ['channel'], complete: ['resolution'], reopen: [], review: [], draft_reply: ['text'] };
  if (!plain(body) || body.action !== 'request_followthrough' || !Object.hasOwn(fields, body.type || '') || JSON.stringify(body).length > 4000) fail('invalid_request', 'Choose an available request action.', 400);
  const allowed = ['action','requestId','sourceRevision','expectedRevision','operationId','type','note', ...fields[body.type]];
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('invalid_request', 'This request action has an unsupported field.', 400);
  if (typeof body.requestId!=='string' || typeof body.sourceRevision!=='string' || typeof body.expectedRevision!=='string' || typeof body.operationId!=='string' || !identifier.test(body.requestId) || !revision.test(body.sourceRevision) || !revision.test(body.expectedRevision) || !/^[a-f0-9]{32}$/.test(body.operationId)) fail('invalid_request', 'Reload this request before saving.', 400);
  if (typeof body.note !== 'string' || body.note.length > 1000) fail('invalid_note', 'Keep your note to 1,000 characters.', 400, 'requestNote');
  if (['complete','reopen','review'].includes(body.type) && !body.note.trim()) fail('invalid_note', 'Add a reason or result before saving.', 400, 'requestNote');
  if(body.type==='draft_reply'&&(typeof body.text!=='string'||!body.text.trim()||body.text.length>2000))fail('invalid_reply_draft','Write a reply of 2,000 characters or fewer.',400,'requestReplyText');
  if (body.type === 'plan') {
    if (typeof body.nextAction !== 'string' || !body.nextAction.trim() || body.nextAction.length > 200) fail('invalid_next_action', 'Describe the next action in 200 characters or fewer.', 400, 'requestNextAction');
    if (typeof body.dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.dueAt) || !Number.isFinite(Date.parse(body.dueAt)) || new Date(body.dueAt).toISOString() !== body.dueAt) fail('invalid_due', 'Choose a valid due date and time.', 400, 'requestDue');
  }
  if (['attempt','reached'].includes(body.type) && !['call','text','email','other'].includes(body.channel)) fail('invalid_channel', 'Choose the contact method.', 400, 'requestChannel');
  if (body.type === 'attempt' && !['no_answer','left_message','sent_message','other'].includes(body.result)) fail('invalid_result', 'Choose what happened.', 400, 'requestAttemptResult');
  if (body.type === 'complete' && !['resolved','not_proceeding','no_followup_needed'].includes(body.resolution)) fail('invalid_resolution', 'Choose how this request was resolved.', 400, 'requestResolution');
  return structuredClone(body);
}
export async function updateRequestFollowthrough(client, session, body) {
  const input = parse(body), actor = normalizeAccountEmail(session?.email), operationDigest = digest({ input, actor }), at = new Date().toISOString();
  await authority(client, session);
  await atomicUpdate(KIND, requestJournalKey(client, input.requestId), async saved => {
    const current = await authority(client, session), lead = await source(current, input.requestId), row = journal(current, input.requestId, saved);
    const previous = row.history.find(entry => entry.id === input.operationId);
    if (previous) { if (previous.digest !== operationDigest) fail('operation_conflict', 'This action identifier was already used for a different change.'); return { result: row }; }
    await authority(client, session, true);
    const currentView = view(current, lead, row);
    if (!currentView.canChange) fail('request_read_only', currentView.historyFull ? 'This retained history is full. Contact support before adding another action.' : 'This request is read-only. Its saved history is kept.');
    if (input.sourceRevision !== currentView.sourceRevision) fail('request_source_changed', 'The customer request changed. Check its latest details before saving.');
    if (input.expectedRevision !== currentView.revision) fail('request_changed', 'Another follow-up action was saved. Review its history before saving yours.');
    if (currentView.reviewRequired && input.type !== 'review') fail('request_review_required', 'The customer request changed. Review the new details before recording more work.');
    if (!currentView.reviewRequired && input.type === 'review') fail('invalid_transition', 'This request already uses the current customer details.');
    const next = structuredClone(currentView.state);
    if (next.completedAt && !['reopen','review'].includes(input.type)) fail('request_completed', 'Reopen this request before recording more work.');
    if (input.type === 'reopen' && !next.completedAt) fail('invalid_transition', 'This request is already open.');
    if (input.type === 'seen') next.seenAt = next.seenAt || at;
    if (input.type === 'assign') next.owner = { name: current.owner.name || '', email: actor };
    if (input.type === 'plan') { next.nextAction = input.nextAction.trim(); next.dueAt = input.dueAt; next.owner = { name: current.owner.name || '', email: actor }; }
    if(input.type==='draft_reply'){
      if(!lead.platform||!['angi','thumbtack'].includes(lead.platform.source))fail('invalid_transition','Choose a lead-platform request to prepare a reply.');
      next.replyDraft={text:input.text.trim(),sourceRevision:currentView.sourceRevision,at};
    }
    if (input.type === 'attempt' && next.contact !== 'reached') next.contact = 'attempted';
    if (input.type === 'reached') next.contact = 'reached';
    if (input.type === 'complete') { next.completedAt = at; next.resolution = input.resolution; next.nextAction = null; next.dueAt = null; }
    if (input.type === 'reopen') { next.completedAt = null; next.resolution = null; }
    // Earlier contact stays in history; a corrected recipient cannot inherit it.
    if (input.type === 'review') { next.completedAt = null; next.resolution = null; }
    await authority(client, session, true);
    if (requestSourceRevision(await source(client, input.requestId)) !== currentView.sourceRevision) fail('request_source_changed', 'The customer request changed. Check its latest details before saving.');
    const entry = { id: input.operationId, type: input.type, at, actor, digest: operationDigest, input, source: currentView.source, state: structuredClone(next) };
    const value = { ...row, sourceRevision: currentView.sourceRevision, state: next, history: [...row.history, entry] };
    return { value, result: value };
  });
  try { return await readRequestFollowthrough(client, session, input.requestId, input.operationId); }
  catch(error) { if(error.status===401||error.status===403)throw error;fail('request_outcome_uncertain','The action may be saved. Check this same action before recording another one.',503); }
}

export function requestFollowthroughMetrics(leads) {
  const rows=leads.filter(lead=>!lead.websiteSetupCheck&&!lead.simulation&&lead.status!=='spam'&&lead.outcome!=='spam'&&lead.followthrough);
  return {needsFollowup:rows.filter(lead=>lead.followthrough.needsFollowup).length,completed:rows.filter(lead=>!lead.followthrough.reviewRequired&&lead.followthrough.state.completedAt).length,reached:rows.filter(lead=>lead.followthrough.state.contact==='reached').length,due:rows.filter(lead=>lead.followthrough.due).length,reviewRequired:rows.filter(lead=>lead.followthrough.reviewRequired).length};
}

export { authority as requestOwnerAuthority, source as requestSource, journal as requestJournalRow };
