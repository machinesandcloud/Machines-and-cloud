import { createHash, randomUUID } from 'node:crypto';
import { normalizeAccountEmail, strictRead } from './accounts.mjs';
import { getAccessSession } from './access.mjs';
import { atomicUpdate, list } from './store.mjs';
import { configurationRevision, setupReadiness, isSupportedSelfServiceClient as isSelfServiceClient } from './setup.mjs';
import { getAIAllowance } from './self-service-ai.mjs';
import { listWorkspaceOperations, queueWorkspaceRebuild, retryWorkspaceOperation } from './platform-operations.mjs';
import { phoneActivationStatus } from './phone-activation.mjs';
import { serviceConnections, serviceSetupView } from './service-connections.mjs';
import { deliveryTenant } from './managed-consent.mjs';
import { managedSMSConversations } from './managed-history.mjs';
import { queueServiceReconciliation, runServiceReconciliation, serviceReconciliationView } from './service-reconciliation.mjs';

export class OperatorError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function operatorEmails() {
  const raw = String(process.env.ADMIN_EMAILS || '').trim();
  const values = raw.split(',').map(value => normalizeAccountEmail(value.trim()));
  if (!raw || values.length > 10 || values.some(value => !value)) throw new OperatorError('admin_not_configured', 'Operator sign-in has not been configured.', 503);
  return new Set(values);
}
export async function requireOperator(req) {
  const allowed = operatorEmails(), session = await getAccessSession(req, 'operator');
  if (!session) throw new OperatorError('sign_in_required', 'Sign in to the admin portal.', 401);
  if (!allowed.has(session.email)) throw new OperatorError('forbidden', 'This account does not have operator access.', 403);
  return session;
}
export function managementRevision(c) {
  return createHash('sha256').update(JSON.stringify([configurationRevision(c), c.owner?.email, c.status, c.operationLifecycleVersion || 0, c.channels, c.onboarding?.desiredChannels, c.build, c.setupProof, c.management?.revision || 0])).digest('hex');
}
const trim = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const closedStatus = status => ['cancelled', 'archived'].includes(status);
const sanitizedActivity = row => ({ at: row.at || null, type: trim(row.type || row.action, 80), detail: trim(row.reason || '', 300), actor: trim(row.actor, 254) });
export async function customerView(c, detail = false) {
  const selfService = isSelfServiceClient(c); let setup = selfService ? setupReadiness(c) : null;
  const [operations, aiAllowance, phoneActivation, services] = await Promise.all([selfService ? listWorkspaceOperations(c.slug) : [], selfService ? getAIAllowance(c) : null, selfService ? phoneActivationStatus(c) : null, selfService ? serviceConnections(c) : null]);
  if (services) setup=serviceSetupView(c,services);
  const issues = [];
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
  const connections = (setup?.connectionJourney?.channels || []).map(row => {
    if (row.id==='web') return row.status==='active' && (!setup.channels.web.ready || !aiAllowance.available)?{...row,status:'needs_action',detail:'Customer chat is blocked by current setup checks or the daily allowance.'}:row;
    const service=services && ({voice:services.voice,sms:services.messaging,calendar:services.calendar})[row.id];
    return service?{...row,status:service.active?'active':service.status || service.state,detail:service.operation?.detail || service.detail || row.detail}:row;
  });
  const row = { slug: c.slug, name: c.business?.name || c.slug, owner: { name: c.owner?.name || '', email: c.owner?.email || '', phone: c.owner?.phone || '' }, plan: c.plan, status: c.status, revision: managementRevision(c), configurationRevision: configurationRevision(c), selfService, createdAt: c.createdAt || null, setup, operations, phoneActivation, services, serviceChecks, connections, issues, aiAllowance, metrics: { bookings: 0, leads: 0, conversations: 0, openIssues: issues.length }, activity: (c.management?.audit || []).slice(-100).reverse().map(sanitizedActivity), notes: (c.management?.notes || []).slice(-100).map(n => ({ id: n.id, at: n.at, actor: n.actor, text: trim(n.text, 2000) })) };
  if (detail) {
    for (const operation of operations) {
      const raw = await strictRead('workspace_operations', operation.id);
      if (!raw) continue;
      row.activity.push(sanitizedActivity({ at: raw.createdAt, type: 'workspace_refresh_requested', actor: raw.requestedBy?.email, reason: raw.reason }));
      for (const retry of (raw.retryHistory || []).slice(-20)) row.activity.push(sanitizedActivity({ at: retry.at, type: 'workspace_refresh_retry', actor: retry.actor?.email, reason: retry.reason }));
    }
    row.activity = row.activity.sort((a,b) => String(b.at).localeCompare(String(a.at))).slice(0,100);
    row.rules = { business: { name: c.business?.name || '', city: c.business?.city || '', serviceArea: c.business?.serviceArea || [], notServed: c.business?.notServed || [] }, services: c.services || [], fees: c.fees || [], windows: c.windows || [], faq: c.faq || [], summary: c.summary || '' };
    row.records = {};
    for (const kind of ['bookings', 'leads', 'conversations']) {
      const keys = (await list(kind, c.slug + '/')).sort().slice(-100);
      let records = (await Promise.all(keys.map(key => strictRead(kind, key)))).filter(Boolean);
      if (kind === 'conversations' && selfService) {
        const sms = await managedSMSConversations(c, { limit: 60 });
        records = records.filter(record => !sms.some(managed => record.channel === 'sms' && managed.contact === record.contact)).concat(sms);
      }
      records = records.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))).slice(0, 100);
      row.metrics[kind] = records.length;
      row.records[kind] = records.map(record => ({ id: record.id || null, at: record.updatedAt || record.createdAt || null, status: record.status || null, name: trim(record.name, 120), phone: trim(record.phone || record.contact, 40), issue: trim(record.issue || record.service || record.reason, 500), date: trim(record.date, 40), window: trim(record.window, 80), channel: trim(record.channel, 20), messages: kind === 'conversations' ? (record.messages || []).slice(-20).map(m => ({ role: m.role, content: trim(m.content, 4000), at: m.at || null, ...(m.processing ? { processing: trim(m.processing, 40) } : {}) })) : undefined }));
    }
    row.metrics.scope = 'Latest 100 records per category; conversations include up to 60 recent texting contacts.';
  } else row.metrics.scope = 'Open setup issues; records load with customer details';
  return row;
}
export async function customerPage(cursor = '') {
  if (cursor && !/^[a-z0-9-]{1,40}$/.test(cursor)) throw new OperatorError('invalid_cursor', 'Reload the customer list.');
  const keys = (await list('clients', '')).sort(), page = keys.filter(key => key > cursor).slice(0, 50);
  const customers = [];
  for (const key of page) { const c = await strictRead('clients', key); if (c) customers.push(await customerView(c)); }
  return { customers, total: keys.length, nextCursor: keys.some(key => key > (page.at(-1) || cursor)) ? page.at(-1) : null, summary: { customers: customers.length, active: customers.filter(c => c.status === 'live').length, needsAttention: customers.filter(c => c.issues.length).length, setupPending: customers.filter(c => c.selfService && !closedStatus(c.status) && c.connections.some(x => x.requested && !['active','connected'].includes(x.status))).length, scope: 'Current page' } };
}
function validatedPatch(patch) {
  const allowed = ['business', 'services', 'fees', 'windows', 'faq', 'summary'];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some(k => !allowed.includes(k))) throw new OperatorError('invalid_patch', 'Choose supported business rules to update.');
  const value = {};
  const strings = (items, max = 300) => {
    if (!Array.isArray(items) || items.length > 40 || items.some(x => typeof x !== 'string' || !x.trim() || x.length > max)) throw new OperatorError('invalid_patch', 'Check the rule list and try again.');
    return items.map(x => x.trim());
  };
  for (const [key, input] of Object.entries(patch)) {
    if (key === 'business') {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['name', 'city', 'serviceArea', 'notServed'].includes(k))) throw new OperatorError('invalid_patch', 'Check the business details.');
      value.business = {};
      for (const [field, text] of Object.entries(input)) {
        if (['serviceArea', 'notServed'].includes(field)) value.business[field] = strings(text, 120);
        else { if (typeof text !== 'string' || text.length > 160 || !text.trim()) throw new OperatorError('invalid_patch', 'Enter a valid business name or city.'); value.business[field] = text.trim(); }
      }
    } else if (key === 'fees') {
      if (!Array.isArray(input) || input.length > 30 || input.some(x => !x || typeof x !== 'object' || Object.keys(x).some(k => !['label','amount','note'].includes(k)) || typeof x.label !== 'string' || !x.label.trim() || x.label.length > 160 || typeof x.amount !== 'string' || x.amount.length > 160 || x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 300))) throw new OperatorError('invalid_patch', 'Check each fee label, amount and note.');
      value.fees = input.map(x => ({ label: x.label.trim(), amount: x.amount.trim(), note: (x.note || '').trim() }));
    } else if (key === 'summary') {
      if (typeof input !== 'string' || input.length > 4000) throw new OperatorError('invalid_patch', 'Keep the summary under 4,000 characters.'); value.summary = input;
    } else if (key === 'faq') {
      if (!Array.isArray(input) || input.length > 40 || input.some(x => !x || Object.keys(x).some(k => !['q','a'].includes(k)) || typeof x.q !== 'string' || typeof x.a !== 'string' || !x.q.trim() || !x.a.trim() || x.q.length > 500 || x.a.length > 2000)) throw new OperatorError('invalid_patch', 'Check each question and answer.');
      value.faq = input.map(x => ({ q: x.q.trim(), a: x.a.trim() }));
    } else value[key] = strings(input);
  }
  return value;
}
export async function supportAction(session, body) {
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
    const operation = body.action === 'rebuild_workspace' ? await queueWorkspaceRebuild(c, { actor, reason, expectedRevision: configurationRevision(c) }) : await retryWorkspaceOperation(c, body.operationId, { actor, reason, expectedRevision: configurationRevision(c) });
    return { ok: true, operation, customer: await customerView(await strictRead('clients', c.slug), true) };
  }
  if (body.action === 'save_note' && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000)) throw new OperatorError('invalid_note', 'Enter a support note under 2,000 characters.');
  const patch = body.action === 'update_rules' ? validatedPatch(body.patch) : null;
  const at = new Date().toISOString(), eventId = randomUUID();
  const updated = await atomicUpdate('clients', c.slug, async current => {
    if (!current || !isSelfServiceClient(current) || managementRevision(current) !== body.expectedRevision || closedStatus(current.status) && !['save_note','reconcile_services'].includes(body.action)) return { result: null };
    const value = structuredClone(current);
    if (body.action === 'pause') { value.pausedFrom = current.status; value.pausedChannels = structuredClone(current.channels || {}); value.status = 'paused'; value.pausedAt = at; value.channels = { ...value.channels, web: { ...value.channels?.web, active: false } }; }
    if (body.action === 'cancel_service') { value.status = 'cancelled'; value.cancelledAt = at; value.cancelReason = reason; value.channels = { ...value.channels, web: { ...value.channels?.web, active: false } }; }
    if (body.action === 'resume') {
      const ready = setupReadiness(current), allowance = await getAIAllowance(current);
      if (current.status !== 'paused' || !ready.canActivateWeb || !allowance.available) throw new OperatorError('setup_incomplete', 'Review, a successful current live test and available AI allowance are required before resuming website chat.', 409);
      const wantsWeb = !Array.isArray(current.onboarding?.desiredChannels) || current.onboarding.desiredChannels.includes('web'), previousStatus = ['testing','live'].includes(current.pausedFrom) ? current.pausedFrom : 'live';
      value.status = previousStatus; value.channels = { ...value.channels, web: { ...value.channels?.web, active: wantsWeb && previousStatus === 'live' && (current.pausedChannels ? current.pausedChannels.web?.active === true : true) } };
      value.pausedAt = null; if (previousStatus === 'live') value.liveAt = value.liveAt || at; value.pausedFrom = null; value.pausedChannels = null;
    }
    if (patch) for (const [key, item] of Object.entries(patch)) value[key] = key === 'business' ? { ...value.business, ...item } : item;
    if (['pause','resume','cancel_service'].includes(body.action)) value.operationLifecycleVersion = (current.operationLifecycleVersion || 0) + 1;
    const audit = { id: eventId, at, actor: session.email, action: body.action, reason, fields: patch ? Object.keys(patch) : [] };
    if (body.action === 'reconcile_services' && (current.management?.serviceReconciliations || []).some(row => ['queued','running','retry','waiting_platform'].includes(row.state))) throw new OperatorError('checks_already_queued', 'Service checks are already queued. Review their saved status before requesting another check.', 409);
    value.management = { ...value.management, revision: (value.management?.revision || 0) + 1, audit: [...(value.management?.audit || []), audit].slice(-100), notes: body.action === 'save_note' ? [...(value.management?.notes || []), { id: eventId, at, actor: session.email, text: body.text.trim() }].slice(-100) : value.management?.notes || [] };
    if (body.action === 'reconcile_services') value.management.serviceReconciliations = [...(value.management?.serviceReconciliations || []), { id:eventId,at,actor:session.email,reason,tenant:deliveryTenant(current),sequence:value.management.revision,state:'queued' }].slice(-20);
    value.updatedAt = at;
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
