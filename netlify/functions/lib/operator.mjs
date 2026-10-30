import { createHash, randomUUID } from 'node:crypto';
import { normalizeAccountEmail, strictRead } from './accounts.mjs';
import { getAccessSession } from './access.mjs';
import { atomicUpdate, list, assertCurrentWorkspace, listWorkspaceRecords } from './store.mjs';
import { configurationRevision, setupReadiness, isSupportedSelfServiceClient as isSelfServiceClient } from './setup.mjs';
import { getAIAllowance } from './self-service-ai.mjs';
import { listWorkspaceOperations, queueWorkspaceRebuild, retryWorkspaceOperation } from './platform-operations.mjs';
import { phoneActivationStatus } from './phone-activation.mjs';
import { serviceConnections, serviceSetupView } from './service-connections.mjs';
import { serviceOnboardingStatus } from './service-onboarding.mjs';
import { websiteInstallationView } from './website-installation.mjs';
import { leadConnectionsView } from './lead-connections.mjs';
import { serviceIntakeView } from './service-intake.mjs';
import { deliveryTenant } from './managed-consent.mjs';
import { managedSMSConversations } from './managed-history.mjs';
import { queueServiceReconciliation, runServiceReconciliation, serviceReconciliationView } from './service-reconciliation.mjs';
import { parseWorkspacePatch, WorkspaceEditError } from './workspace-edit.mjs';

import { workspaceTenant, belongsToWorkspace } from './workspace-identity.mjs';
import { calendarExecutionPolicy } from './calendar-execution.mjs';
import { workspaceBillingConfiguration } from './workspace-billing.mjs';
import {voiceRejectionReview,recordVoiceCreateRejection} from './voice-provider-evidence.mjs';
import {supportReportViews,supportReportIssues,changeSupportReport} from './support-reports.mjs';

export class OperatorError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function operatorProviderStates() {
  const env = process.env, model = !!env.ANTHROPIC_API_KEY && env.MC_FAKE_MODEL !== '1';
  const channel = (label, flag, credentials) => !flag
    ? { label, status: 'disabled', detail: 'Platform execution is disabled. Saved customer setup is retained.' }
    : !credentials
      ? { label, status: 'needs_attention', detail: 'The execution setting is on, but required provider credentials are missing. No customer readiness is implied.' }
      : { label, status: 'configured', detail: 'The execution setting and provider credentials are configured. Current policies, customer authority, budgets and verified delivery still apply.' };
  const calendar = calendarExecutionPolicy();
  return {
    website: { label: 'Website chat', status: model ? 'configured' : 'unavailable', detail: model ? 'AI credentials are configured. Each customer still needs reviewed rules, a current practice check and available allowance.' : 'AI credentials or the live model are unavailable.' },
    phone: channel('Phone number setup', env.PHONE_ACQUISITION_ENABLED === 'true', env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
    voice: channel('Phone answering', env.VOICE_ACTIVATION_ENABLED === 'true', env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.VAPI_API_KEY && env.VAPI_WEBHOOK_SECRET),
    sms: channel('Text messaging', env.MESSAGING_ACTIVATION_ENABLED === 'true' && env.SERVICE_DELIVERY_ENABLED === 'true', env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PRIMARY_PROFILE_SID),
    calendar: env.CALENDAR_CONNECTION_ENABLED !== 'true'
      ? { label: 'Google Calendar', status: 'disabled', detail: 'Calendar connections are disabled by platform configuration.' }
      : !calendar || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.CALENDAR_TOKEN_ENCRYPTION_KEY
        ? { label: 'Google Calendar', status: 'needs_attention', detail: 'The connection setting is on, but a current execution policy and complete OAuth/encryption configuration are required.' }
        : { label: 'Google Calendar', status: 'configured', detail: env.CALENDAR_SELF_SERVICE_ENABLED === 'true' ? 'Self-service Calendar policy is configured. Each customer grants access; event delivery and current limits are checked separately.' : 'A controlled Calendar policy is configured. Only its selected workspace and operations are eligible; this is not general customer activation.' },
    billing: workspaceBillingConfiguration(),
    ...(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_GROWTH ? { legacyBilling: { label: 'Legacy billing', status: 'configured', detail: 'Legacy Stripe key and Price configuration is present. This does not configure self-service checkout or its approved offer.' } } : {}),
  };
}
export function operatorEmails() {
  const raw = String(process.env.ADMIN_EMAILS || '').trim();
  const values = raw.split(',').map(value => normalizeAccountEmail(value.trim()));
  if (!raw || values.length > 10 || values.some(value => !value)) throw new OperatorError('admin_not_configured', 'Operator sign-in has not been configured.', 503);
  return new Set(values);
}
export async function requireOperator(req) {
  operatorEmails();
  const session = await getAccessSession(req, 'operator');
  if (!session) throw new OperatorError('sign_in_required', 'Sign in to the admin portal.', 401);
  if (!operatorEmails().has(session.email)) throw new OperatorError('forbidden', 'This account does not have operator access.', 403);
  return session;
}
export async function requireCurrentOperator(session) {
  const current = /^[a-f0-9]{64}$/.test(session?.sessionHash || '') ? await strictRead('access_sessions', session.sessionHash) : null;
  if (!current || current.scope !== 'operator' || current.status !== 'active' || !(Date.parse(current.expiresAt) > Date.now()) || normalizeAccountEmail(current.email) !== normalizeAccountEmail(session?.email)) throw new OperatorError('sign_in_required', 'Sign in to the admin portal again before continuing.', 401);
  if (!operatorEmails().has(normalizeAccountEmail(current.email))) throw new OperatorError('forbidden', 'This account no longer has operator access.', 403);
}
export function managementRevision(c) {
  return createHash('sha256').update(JSON.stringify([c.slug, c.ownerKey, configurationRevision(c), c.owner?.email, c.status, c.operationLifecycleVersion || 0, c.channels, c.onboarding?.desiredChannels, c.build, c.setupProof, c.management?.revision || 0])).digest('hex');
}
const trim = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const closedStatus = status => ['cancelled', 'archived'].includes(status);
const sanitizedActivity = row => ({ at: row.at || null, type: trim(row.type || row.action, 80), detail: trim(row.reason || '', 300), actor: trim(row.actor, 254) });
export async function customerView(c, detail = false) {
  const selfService = isSelfServiceClient(c); let setup = selfService ? setupReadiness(c) : null;
  const [operations, aiAllowance, phoneActivation, services, serviceOnboarding, leadConnections] = await Promise.all([selfService ? listWorkspaceOperations(c) : [], selfService ? getAIAllowance(c) : null, selfService ? phoneActivationStatus(c) : null, selfService ? serviceConnections(c) : null, selfService ? serviceOnboardingStatus(c) : null, selfService ? leadConnectionsView(c) : null]);
  if (services) setup=serviceSetupView(c,services,serviceOnboarding,await websiteInstallationView(c,aiAllowance),leadConnections,await serviceIntakeView(c,services));
  const issues = [];
  if(selfService)issues.push(...supportReportIssues(c));
  if (c.build?.status === 'failed') issues.push({ id: 'draft', severity: 'high', title: 'Desk draft needs repair', detail: 'Saved customer answers are retained. Queue a workspace rebuild.' });
  for (const op of operations.filter(row => ['failed', 'uncertain'].includes(row.state))) issues.push({ id: op.id, severity: 'high', title: 'Background work needs attention', detail: op.detail || 'Review the operation before retrying.' });
  if (phoneActivation?.operation && ['uncertain','cleanup_uncertain','needs_review'].includes(phoneActivation.operation.state)) issues.push({ id: phoneActivation.operation.id, severity: 'high', title: 'Phone setup needs attention', detail: phoneActivation.detail });
  if (selfService && !aiAllowance.available && c.channels?.web?.active) issues.push({ id: 'allowance', severity: 'medium', title: 'Daily AI allowance reached', detail: 'Customer AI replies are unavailable until the allowance resets.' });
  if (selfService && c.status === 'live' && !setup.channels.web.ready) issues.push({ id: 'readiness', severity: 'high', title: 'Website chat is blocked', detail: 'Current saved rules have not passed all activation checks.' });
  if (services) {
    for (const [id,channel] of [['voice',services.voice],['sms',services.messaging]]) if (channel.operation && ['uncertain','needs_review','needs_action','cleanup_uncertain','blocked'].includes(channel.state)) issues.push({id:channel.operation.id,severity:'high',title: id==='voice'?'Phone service needs attention':'Texting setup needs attention',detail:channel.operation.detail || channel.detail});
    if (services.calendar.reconnectRequired) issues.push({id:'calendar_connection',severity:'high',title:'Reconnect Google Calendar',detail:services.calendar.detail});
    for (const job of services.delivery.jobs.filter(job=>['uncertain','failed'].includes(job.state))) issues.push({id:job.id,severity:'high',title:'Message delivery needs attention',detail:`${job.channel}: ${job.reasonCode || job.state}. Do not resend an uncertain message without provider reconciliation.`});
    for (const job of services.calendarDelivery.jobs.filter(job=>['failed','needs_review','needs_attention'].includes(job.state))) issues.push({id:`calendar:${job.bookingId}`,severity:'high',title:'Calendar sync needs attention',detail:job.detail});
  }
  const serviceChecks = selfService ? await serviceReconciliationView(c) : [];
  if (serviceChecks[0]?.state === 'needs_attention') issues.push({id:'service_checks',severity:'high',title:'Service checks could not be dispatched',detail:serviceChecks[0].detail});
  const connections = setup?.connectionJourney?.channels || [],leadSources=setup?.connectionJourney?.leadSources || [],discovery=setup?.connectionJourney?.discovery||[];
  if(!['paused','cancelled','archived'].includes(c.status))for(const source of discovery.filter(row=>row.setupRequest))issues.push({id:'lead:'+source.id+':setup',severity:'high',title:source.label+' setup requested',detail:source.nextStep+' No provider connection or delivery is confirmed.',requestId:source.setupRequest.id,requestedAt:source.setupRequest.requestedAt,responsible:'machines_and_cloud'});
  if(!['paused','cancelled','archived'].includes(c.status))for(const connection of connections.filter(row=>row.requested&&row.activation?.blockedBy==='machines_and_cloud'))issues.push({id:'connection:'+connection.id+':platform',severity:'high',title:connection.label+' platform setup needed',detail:connection.nextStep+' '+(connection.setupProgress?.requestSaved?'Preserve and continue the recorded setup operation.':'No provider setup has been requested. Make the current customer approval available after resolving this blocker.'),reasonCode:connection.activation.reasonCode,responsible:'machines_and_cloud',setupProgress:connection.setupProgress});
  const native=leadConnections?.thumbtack;
  if(!['paused','cancelled','archived'].includes(c.status)&&native?.setupRequest)issues.push({id:'lead:thumbtack:setup',severity:'high',title:'Requested Thumbtack setup needs platform access',detail:'The customer’s request is saved. Configure the Machines & Cloud partner connection before requesting their account permission. No provider job has started.',requestId:native.setupRequest.id,requestedAt:native.setupRequest.requestedAt,responsible:'machines_and_cloud'});
  if(native?.generation&&(native.attention.unconfirmedReplies>0||['setup_unconfirmed','authorization_required'].includes(native.nativeState)))issues.push({id:'lead:thumbtack',severity:'high',title:'Thumbtack connection needs attention',detail:native.attention.unconfirmedReplies>0?'Check the original Thumbtack thread before sending another reply.':native.nativeState==='setup_unconfirmed'?'Check the existing webhook before continuing its saved setup. Do not create another connection.':'The owner must renew Thumbtack permission in the existing connection.'});
  // Raw lead setup contains a provider endpoint and shared secret. Operators
  // receive the same allowlisted journey facts as owners, never that setup DTO.
  const row = { slug: c.slug, name: c.business?.name || c.slug, owner: { name: c.owner?.name || '', email: c.owner?.email || '', phone: c.owner?.phone || '' }, plan: c.plan, status: c.status, revision: managementRevision(c), configurationRevision: configurationRevision(c), selfService, createdAt: c.createdAt || null, setup, operations, phoneActivation, services, serviceChecks, connections, leadSources, issues, supportReports: selfService ? supportReportViews(c,{operator:true}) : [], aiAllowance, metrics: { bookings: 0, leads: 0, conversations: 0, openIssues: issues.length }, activity: (c.management?.audit || []).filter(record=>belongsToWorkspace(c,record)).slice(-100).reverse().map(sanitizedActivity), notes: (c.management?.notes || []).filter(record=>belongsToWorkspace(c,record)).slice(-100).map(n => ({ id: n.id, at: n.at, actor: n.actor, text: trim(n.text, 2000) })) };
  if (detail && selfService) row.voiceRejectionReview=await voiceRejectionReview(c);
  if (detail) {
    for (const operation of operations) {
      const raw = await strictRead('workspace_operations', operation.id);
      if (!raw||!belongsToWorkspace(c,raw)) continue;
      row.activity.push(sanitizedActivity({ at: raw.createdAt, type: 'workspace_refresh_requested', actor: raw.requestedBy?.email, reason: raw.reason }));
      for (const retry of (raw.retryHistory || []).slice(-20)) row.activity.push(sanitizedActivity({ at: retry.at, type: 'workspace_refresh_retry', actor: retry.actor?.email, reason: retry.reason }));
    }
    row.activity = row.activity.sort((a,b) => String(b.at).localeCompare(String(a.at))).slice(0,100);
    row.rules = { business: { name: c.business?.name || '', city: c.business?.city || '', serviceArea: c.business?.serviceArea || [], notServed: c.business?.notServed || [] }, services: c.services || [], fees: c.fees || [], windows: c.windows || [], faq: c.faq || [], summary: c.summary || '' };
    row.records = {};
    for (const kind of ['bookings', 'leads', 'conversations']) {
      let records;
      if(kind==='conversations'){
        const prefix=selfService?`${c.slug}/${workspaceTenant(c)}/`:c.slug+'/';
        const keys=(await list(kind,prefix)).sort().slice(-100);
        records=(await Promise.all(keys.map(key=>strictRead(kind,key)))).filter(record=>record&&belongsToWorkspace(c,record));
      }else{const page=await listWorkspaceRecords(c,kind,100);records=page.records;row.recordListing ||= {};row.recordListing[kind]=page.listing;}
      if (kind === 'conversations' && selfService) {
        const sms = await managedSMSConversations(c, { limit: 60 });
        records = records.filter(record => !sms.some(managed => record.channel === 'sms' && managed.contact === record.contact)).concat(sms);
      }
      records = records.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, 100);
      row.metrics[kind] = records.length;
      row.records[kind] = records.map(record => ({ id: record.id || null, at: record.updatedAt || record.createdAt || null, status: record.status || null, name: trim(record.name, 120), phone: trim(record.phone || record.contact, 40), issue: trim(record.issue || record.service || record.reason, 500), date: trim(record.date, 40), window: trim(record.window, 80), channel: trim(record.channel, 20), messages: kind === 'conversations' ? (record.messages || []).slice(-20).map(m => ({ role: m.role, content: trim(m.content, 4000), at: m.at || null, ...(m.processing ? { processing: trim(m.processing, 40) } : {}) })) : undefined }));
    }
    row.metrics.scope = Object.values(row.recordListing || {}).some(listing => listing.incomplete) ? 'Counts cover the records shown; history is incomplete. Setup checks are excluded.' : 'Latest 100 records per category; conversations include up to 60 recent texting contacts.';
  } else row.metrics.scope = 'Open setup issues; records load with customer details';
  await assertCurrentWorkspace(c);return row;
}
export async function customerPage(cursor = '') {
  if (cursor && !/^[a-z0-9-]{1,40}$/.test(cursor)) throw new OperatorError('invalid_cursor', 'Reload the customer list.');
  const keys = (await list('clients', '')).sort(), page = keys.filter(key => key > cursor).slice(0, 50);
  const customers = [];
  for (const key of page) { const c = await strictRead('clients', key); if (c) customers.push(await customerView(c)); }
  return { customers, total: keys.length, nextCursor: keys.some(key => key > (page.at(-1) || cursor)) ? page.at(-1) : null, summary: { customers: customers.length, active: customers.filter(c => c.status === 'live').length, needsAttention: customers.filter(c => c.issues.length).length, setupPending: customers.filter(c => c.selfService && !closedStatus(c.status) && c.connections.some(x => x.requested && !['active','connected'].includes(x.status))).length, scope: 'Current page' } };
}
function validatedPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) throw new OperatorError('invalid_patch', 'Choose supported business rules to update.');
  try { return parseWorkspacePatch(patch, { operator: true }); }
  catch (error) {
    if (!(error instanceof WorkspaceEditError)) throw error;
    throw Object.assign(new OperatorError('invalid_patch', error.message, error.status), { fieldErrors: error.fieldErrors });
  }
}
export async function supportAction(session, body) {
  if(body?.action==='record_voice_rejection'){
    await requireCurrentOperator(session);
    if(!/^[a-z0-9-]{1,40}$/.test(body.slug||'')||!/^[a-f0-9]{64}$/.test(body.expectedRevision||''))throw new OperatorError('invalid_request','Choose the exact customer and current revision.');
    const c=await strictRead('clients',body.slug);if(!c||!isSelfServiceClient(c))throw new OperatorError('not_found','Customer not found.',404);
    const result=await recordVoiceCreateRejection(c,body,{actor:session.email,authorize:()=>requireCurrentOperator(session),expectedManagementRevision:body.expectedRevision,currentManagementRevision:managementRevision});
    try{return {...result,customer:await customerView(await strictRead('clients',c.slug),true)};}catch{return {...result,saved:true,refreshRequired:true,customer:null};}
  }

  if(['acknowledge_report','resolve_report'].includes(body?.action)){
    if(!/^[a-z0-9-]{1,40}$/.test(body.slug||''))throw new OperatorError('invalid_request','Choose a customer report.');
    const c=await strictRead('clients',body.slug);if(!c||!isSelfServiceClient(c))throw new OperatorError('not_found','This customer report was not found.',404);
    const result=await changeSupportReport(c,session,body,{authorize:async active=>operatorEmails().has(active.email),expectedManagementRevision:body.expectedRevision,currentManagementRevision:managementRevision});
    try{return {ok:true,supportReport:result.supportReport,receipt:result.receipt,customer:await customerView(result.client,true)};}
    catch{return {ok:true,saved:true,refreshRequired:true,supportReport:result.supportReport,receipt:result.receipt,customer:null,message:'The report update is saved. Refresh customer details to confirm its current status.'};}
  }
  const allowed = { pause: [], resume: [], cancel_service: [], save_note: ['text'], update_rules: ['patch'], rebuild_workspace: [], retry_operation: ['operationId'], reconcile_services: [] };
  if (!body || !Object.hasOwn(allowed, body.action)) throw new OperatorError('invalid_action', 'Choose an available support action.');
  if (Object.keys(body).some(key => !['action', 'slug', 'expectedRevision', 'reason', ...allowed[body.action]].includes(key))) throw new OperatorError('invalid_request', 'Unexpected support action fields.');
  if (!/^[a-z0-9-]{1,40}$/.test(body.slug || '') || !/^[a-f0-9]{64}$/.test(body.expectedRevision || '') || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 300) throw new OperatorError('invalid_request', 'Choose a customer and add a reason for this change.');
  const c = await strictRead('clients', body.slug);
  if (!c) throw new OperatorError('not_found', 'Customer not found.', 404);
  if (!isSelfServiceClient(c)) throw new OperatorError('legacy_read_only', 'This account requires a reviewed migration before managed changes.', 409);
  if (managementRevision(c) !== body.expectedRevision) throw new OperatorError('customer_changed', 'Customer details changed. Refresh before trying again.', 409);
  if (closedStatus(c.status) && !['save_note','reconcile_services'].includes(body.action)) throw new OperatorError('account_closed', 'Closed accounts cannot be changed here.', 409);
  const reason = body.reason.trim(), actor = { role: 'operator', email: session.email };
  if (body.action === 'rebuild_workspace' || body.action === 'retry_operation') {
    if (body.action === 'retry_operation' && typeof body.operationId !== 'string') throw new OperatorError('invalid_request', 'Choose an operation to retry.');
    await requireCurrentOperator(session);
    const operation = body.action === 'rebuild_workspace' ? await queueWorkspaceRebuild(c, { actor, reason, expectedRevision: configurationRevision(c) }) : await retryWorkspaceOperation(c, body.operationId, { actor, reason, expectedRevision: configurationRevision(c) });
    return { ok: true, operation, customer: await customerView(await strictRead('clients', c.slug), true) };
  }
  if (body.action === 'save_note' && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000)) throw new OperatorError('invalid_note', 'Enter a support note under 2,000 characters.');
  const patch = body.action === 'update_rules' ? validatedPatch(body.patch) : null;
  const at = new Date().toISOString(), eventId = randomUUID();
  const updated = await atomicUpdate('clients', c.slug, async current => {
    if (!current || !isSelfServiceClient(current) || current.slug !== c.slug || current.ownerKey !== c.ownerKey || normalizeAccountEmail(current.owner?.email) !== normalizeAccountEmail(c.owner?.email) || managementRevision(current) !== body.expectedRevision || closedStatus(current.status) && !['save_note','reconcile_services'].includes(body.action)) return { result: null };
    // A refreshed or repeated pause must keep the original resume snapshot.
    if (body.action === 'pause' && current.status === 'paused') throw new OperatorError('already_paused', 'This front desk is already paused. Its previous service settings are kept for Resume.', 409);
    const value = structuredClone(current);
    if (body.action === 'pause') { value.pausedFrom = current.status; value.pausedChannels = structuredClone(current.channels || {}); value.status = 'paused'; value.pausedAt = at; value.channels = { ...value.channels, web: { ...value.channels?.web, active: false } }; }
    if (body.action === 'cancel_service') { value.status = 'cancelled'; value.cancelledAt = at; value.cancelReason = reason; value.channels = { ...value.channels, web: { ...value.channels?.web, active: false } }; }
    if (body.action === 'resume') {
      const wantsWeb = !Array.isArray(current.onboarding?.desiredChannels) || current.onboarding.desiredChannels.includes('web'), previousStatus = ['testing','live'].includes(current.pausedFrom) ? current.pausedFrom : 'live';
      const restoringWeb = wantsWeb && previousStatus === 'live' && current.pausedChannels?.web?.active === true;
      if (current.status !== 'paused') throw new OperatorError('setup_incomplete', 'Only a paused workspace can be resumed.', 409);
      if (restoringWeb && (!setupReadiness(current).canActivateWeb || !(await getAIAllowance(current)).available)) throw new OperatorError('setup_incomplete', 'Review, a successful current live test and available AI allowance are required before resuming website chat.', 409);
      value.status = previousStatus; value.channels = { ...value.channels, web: { ...value.channels?.web, active: restoringWeb } };
      value.pausedAt = null; if (previousStatus === 'live') value.liveAt = value.liveAt || at; value.pausedFrom = null; value.pausedChannels = null;
    }
    if (patch) for (const [key, item] of Object.entries(patch)) value[key] = key === 'business' ? { ...value.business, ...item } : item;
    if (['pause','resume','cancel_service'].includes(body.action)) value.operationLifecycleVersion = (current.operationLifecycleVersion || 0) + 1;
    const audit = { tenantIdentity:workspaceTenant(current),id: eventId, at, actor: session.email, action: body.action, reason, fields: patch ? Object.keys(patch) : [] };
    if (body.action === 'reconcile_services' && (current.management?.serviceReconciliations || []).some(row => ['queued','running','retry','waiting_platform'].includes(row.state))) throw new OperatorError('checks_already_queued', 'Service checks are already queued. Review their saved status before requesting another check.', 409);
    value.management = { ...value.management, revision: (value.management?.revision || 0) + 1, audit: [...(value.management?.audit || []), audit].slice(-100), notes: body.action === 'save_note' ? [...(value.management?.notes || []), { tenantIdentity:workspaceTenant(current),id: eventId, at, actor: session.email, text: body.text.trim() }].slice(-100) : value.management?.notes || [] };
    if (body.action === 'reconcile_services') value.management.serviceReconciliations = [...(value.management?.serviceReconciliations || []), { id:eventId,at,actor:session.email,reason,tenant:deliveryTenant(current),sequence:value.management.revision,state:'queued' }].slice(-20);
    value.updatedAt = at;
    // Read current authority after awaited readiness work on every CAS attempt.
    await requireCurrentOperator(session);
    return { value, result: value };
  });
  if (!updated) throw new OperatorError('customer_changed', 'Customer details changed. Refresh before trying again.', 409);
  let serviceCheck = null;
  if (body.action === 'reconcile_services') {
    try { await queueServiceReconciliation(updated,eventId); serviceCheck = await runServiceReconciliation(updated,eventId); }
    catch { serviceCheck = {id:eventId,state:'queued',detail:'The audited request is saved. Scheduled recovery will restore its queue receipt and recheck existing authorized work.'}; }
  }
  try { return { ok: true, ...(serviceCheck ? {serviceCheck} : {}), customer: await customerView(await strictRead('clients',updated.slug), true) }; }
  catch { return { ok: true, saved: true, refreshRequired: true, revision: managementRevision(updated), customer: null, message: 'Your change is saved. Refresh customer details to confirm current status.' }; }
}
