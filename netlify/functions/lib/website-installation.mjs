// Installation evidence is telemetry, never channel activation or domain ownership authority.
import { createHash, randomBytes } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { configurationRevision, setupReadiness, isSupportedSelfServiceClient } from './setup.mjs';
import { workspaceEditRevision } from './workspace-edit.mjs';
import { getAIAllowance } from './self-service-ai.mjs';
import { belongsToWorkspace } from './workspace-identity.mjs';
import { deliveryTenant } from './managed-consent.mjs';

const KIND = 'website_installations', TTL = 10 * 60000, MAX_TURNS = 16;
const hash = value => createHash('sha256').update(value).digest('hex');
const stamp = () => new Date().toISOString();
const key = c => `${c.slug}/${deliveryTenant(c)}`;
const hex = (value, size = 64) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const closed = c => ['cancelled', 'archived'].includes(c?.status);
const same = (a, b) => a && b && deliveryTenant(a) === deliveryTenant(b);
export const setupCheckRecord = record => !!record?.websiteSetupCheck;
export class WebsiteInstallationError extends Error {
  constructor(code, message, status = 409, field) { super(message); this.code = code; this.status = status; if (field) this.field = field; }
}
const fail = (code, message, status, field) => { throw new WebsiteInstallationError(code, message, status, field); };
export function exactWebsiteOrigin(value) {
  try {
    if (typeof value !== 'string' || value.length > 300) return null;
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && value.replace(/\/$/, '') === url.origin ? url.origin : null;
  } catch { return null; }
}
function websiteUrl(c) {
  try { const url = new URL(c.business?.website); return url.protocol === 'https:' && !url.username && !url.password ? url : null; } catch { return null; }
}
const permitted = (c, origin) => !!origin && (c.widget?.allowedOrigins || []).some(value => exactWebsiteOrigin(value) === origin);
function external(origin) {
  if (!exactWebsiteOrigin(origin)) return false;
  const host = new URL(origin).hostname;
  return !/^(?:www\.)?machinesandcloud\.com$/.test(host) && !/^(?:[a-z0-9-]+--)?machines-and-cloud\.netlify\.app$/.test(host) && !/^(?:localhost|.*\.localhost|127\.[\d.]+|0\.0\.0\.0|\[::1\])$/.test(host);
}
async function freshClient(c) {
  const current = await strictRead('clients', c.slug);
  if (!isSupportedSelfServiceClient(current) || !same(c, current)) fail('website_check_changed', 'This workspace changed. Refresh before starting another website check.', 409);
  return current;
}
async function sessionActive(c, sessionHash) {
  const session = hex(sessionHash) ? await strictRead('access_sessions', sessionHash) : null;
  return session?.scope === 'onboarding' && session.status === 'active' && Date.parse(session.expiresAt) > Date.now() && normalizeAccountEmail(session.email) === normalizeAccountEmail(c.owner?.email);
}
function requireShape(body, allowed) {
  if (!plain(body) || Object.keys(body).some(field => !allowed.includes(field))) fail('invalid_website_check', 'Check the website-check details and try again.', 400);
}
function requireContextShape(meta) {
  requireShape(meta, ['checkId', 'challenge', 'turnId']);
  if (!hex(meta.checkId, 32) || !hex(meta.challenge) || meta.turnId !== undefined && !hex(meta.turnId, 32)) fail('invalid_website_check', 'This website check is invalid. Return to your workspace to start again.', 400);
}
function attemptFrom(row, id) { return row?.attempt?.id === id ? row.attempt : null; }
async function validateAttempt(c, row, meta, origin) {
  const current = await freshClient(c), attempt = attemptFrom(row, meta.checkId);
  if (!attempt || row.tenant !== deliveryTenant(current) || attempt.challengeHash !== hash(meta.challenge)) fail('website_check_changed', 'This website check changed. Read its status in your workspace.', 409);
  if (!external(origin) || origin !== attempt.origin || !permitted(current, origin)) fail('website_check_origin', 'Open this check on the exact website selected in your workspace.', 403);
  if (closed(current)) fail('workspace_closed', 'This workspace is closed.', 409);
  if (Date.parse(attempt.expiresAt) <= Date.now() || !await sessionActive(current, attempt.sessionHash)) fail('website_check_expired', 'This website check expired. Return to your workspace to start a new check.', 410);
  if (attempt.revision !== configurationRevision(current) || attempt.website !== (current.business?.website || '')) fail('website_check_changed', 'Your business rules or website changed. Start a new check from your workspace.', 409);
  return { current, attempt };
}
function recordRef(kind, record) { return { kind, id: record.id, createdAt: record.createdAt }; }
async function verifiedRecord(c, reference, attempt, turn) {
  if (!reference || !['leads', 'bookings'].includes(reference.kind) || typeof reference.id !== 'string') return false;
  const saved = await strictRead(reference.kind, `${c.slug}/${reference.id}`);
  if (!saved || saved.id !== reference.id || !Number.isFinite(Date.parse(saved.createdAt)) || saved.delivery?.tenantIdentity !== deliveryTenant(c) || !belongsToWorkspace(c, saved) || saved.channel !== 'web' || saved.createdAt !== reference.createdAt || saved.status === 'spam') return false;
  if (!attempt) return !setupCheckRecord(saved) && !String(saved.contact).startsWith('websitecheck_');
  return saved.contact === attempt.contact && saved.websiteSetupCheck?.checkId === attempt.id && saved.websiteSetupCheck?.turnId === turn.id && saved.websiteSetupCheck?.origin === attempt.origin && saved.managedActionId === websiteActionId({ tenant: deliveryTenant(c), checkId: attempt.id, turnId: turn.id }, reference.kind);
}
function publicTurn(turn) { return turn ? { id: turn.id, state: turn.state, record: turn.record || null, answerObserved: !!turn.acknowledgedAt } : null; }
function chatState(c, allowance) {
  const setup = setupReadiness(c), blockers = setup.channels.web.blockers;
  if (closed(c)) return { state: 'closed', available: false, reason: 'This workspace is closed.', action: 'check_status' };
  if (c.status === 'paused') return { state: 'paused', available: false, reason: 'Website chat is paused.', action: 'resume_web' };
  if (blockers.some(row => ['rules', 'handoff', 'knowledge'].includes(row.id))) return { state: 'needs_rules', available: false, reason: 'Complete your saved business rules before customers use chat.', action: 'review_rules' };
  if (blockers.some(row => row.id === 'review')) return { state: 'needs_review', available: false, reason: 'Review the current business rules.', action: 'review_rules' };
  if (blockers.some(row => row.id === 'model')) return { state: 'unavailable', available: false, reason: 'AI service is temporarily unavailable.', action: 'check_status' };
  if (blockers.some(row => row.id === 'test')) return { state: 'needs_practice', available: false, reason: 'Try a private conversation with the current rules.', action: 'test_desk' };
  if (!allowance?.available) return { state: 'limit', available: false, reason: 'The current AI allowance is unavailable or exhausted.', action: 'check_status', resetAt: allowance?.resetAt || null };
  if (!setup.channels.web.active) return { state: 'ready_to_activate', available: false, reason: 'Your current rules are ready to activate.', action: 'activate_web' };
  return { state: 'active', available: true, reason: 'Customer chat is active now.', action: 'try_sample' };
}
export async function websiteInstallationView(c, suppliedAllowance) {
  let row = await strictRead(KIND, key(c));
  const pending = Object.values(row?.attempt?.turns || {}).filter(turn => !turn.record && ['running', 'unconfirmed'].includes(turn.state)).at(-1);
  if (pending) { await reconcileWebsiteTurn({ client: c, tenant: deliveryTenant(c), checkId: row.attempt.id, turnId: pending.id, contact: row.attempt.contact, origin: row.attempt.origin }); row = await strictRead(KIND, key(c)); }
  const url = websiteUrl(c), a = row?.attempt;
  const selectedOrigin = a && a.website === (c.business?.website || '') ? a.origin : url?.origin || '';
  const current = !!a && a.revision === configurationRevision(c) && a.origin === selectedOrigin && permitted(c, a.origin) && a.website === (c.business?.website || '');
  const turns = Object.values(a?.turns || {}), known = turns.filter(turn => turn.record).sort((x, y) => (y.record.createdAt || '').localeCompare(x.record.createdAt || ''));
  const completed = known.find(turn => turn.acknowledgedAt), request = completed || known[0];
  const customerChat = chatState(c, suppliedAllowance || await getAIAllowance(c));
  const expired = a && (Date.parse(a.expiresAt) <= Date.now() || !await sessionActive(c, a.sessionHash));
  const observation = { state: a?.observedAt ? current ? 'found' : 'stale' : a && current && !expired ? 'waiting' : 'not_checked', at: a?.observedAt || null, origin: a?.origin || null };
  const requestCurrent = request && await verifiedRecord(c, request.record, a, request);
  const setupRequest = { state: request ? !current || !requestCurrent ? 'stale' : completed ? 'complete' : 'saved_unconfirmed' : 'not_checked', at: completed?.acknowledgedAt || request?.record?.createdAt || null, record: request?.record || null };
  const first = row?.firstExternalRequests?.[hash(selectedOrigin)] || row?.firstExternalRequest;
  const firstCurrent = first && first.origin === selectedOrigin && permitted(c, first.origin) && await verifiedRecord(c, first.record);
  const firstExternalRequest = { state: first ? firstCurrent ? 'received' : 'stale' : 'none', at: first?.at || null, origin: first?.origin || null, record: first?.record || null };
  let id = 'copy_code', reason = 'Add the installation code to your website, then check it there.';
  if (!url) { id = 'save_website'; reason = 'Save the full HTTPS address where customers will find your front desk.'; }
  else if (!permitted(c, selectedOrigin)) { id = 'allow_origin'; reason = 'Allow this exact website before checking the installed chat.'; }
  else if (a && (!current || expired) && setupRequest.state !== 'complete') { id = 'check_website'; reason = 'Start a new website check when you are ready.'; }
  else if (observation.state === 'waiting') { id = 'check_status'; reason = 'Waiting for the widget on your selected website.'; }
  else if (observation.state === 'found' && !customerChat.available) { id = customerChat.action; reason = customerChat.reason; }
  else if (setupRequest.state === 'complete') { id = firstCurrent ? 'view_request' : 'view_setup_request'; reason = firstCurrent ? 'Open the first observed ordinary website request.' : 'Open your labeled setup request.'; }
  else if (observation.state === 'found') { id = 'try_sample'; reason = 'Create a deliberate sample request on your installed widget.'; }
  return { website: c.business?.website || '', selectedOrigin, originAllowed: permitted(c, selectedOrigin), tenantIdentity: deliveryTenant(c), configurationRevision: configurationRevision(c), editRevision: workspaceEditRevision(c), observation, customerChat, setupRequest, firstExternalRequest, attempt: a ? { id: a.id, expiresAt: a.expiresAt, state: setupRequest.state === 'complete' ? 'complete' : !current ? 'stale' : expired ? 'expired' : a.observedAt ? 'observed' : 'waiting' } : null, nextAction: { id, reason } };
}
export async function startWebsiteCheck(c, session, body) {
  requireShape(body, ['action', 'expectedRevision', 'expectedEditRevision', 'origin']);
  const origin = exactWebsiteOrigin(body.origin), current = await freshClient(c), url = websiteUrl(current);
  if (closed(current)) fail('workspace_closed', 'This workspace is closed.', 409);
  if (body.expectedRevision !== configurationRevision(current) || body.expectedEditRevision !== workspaceEditRevision(current)) fail('configuration_changed', 'Saved details changed. Check the latest version before starting the website check.', 409);
  if (!origin || !external(origin) || !permitted(current, origin)) fail('website_origin_invalid', 'Select an allowed HTTPS website origin.', 422, 'widget.allowedOrigins');
  if (!url) fail('website_invalid', 'Save the full HTTPS address of your website first.', 422, 'business.website');
  const destination = url.origin === origin ? url : new URL(origin);
  if (destination.hash) fail('unsupported_check_route', 'Use a website address without a router fragment for this check. Your existing page route has not been changed.', 422, 'business.website');
  if (!await sessionActive(current, session?.sessionHash)) fail('verification_required', 'Sign in again before starting a website check.', 401);
  const raw = randomBytes(32).toString('hex'), id = randomBytes(16).toString('hex'), createdAt = stamp(), expiresAt = new Date(Date.now() + TTL).toISOString();
  const attempt = { id, challengeHash: hash(raw), sessionHash: session.sessionHash, origin, website: current.business.website, revision: configurationRevision(current), createdAt, expiresAt, contact: 'websitecheck_' + id, turns: {} };
  await atomicUpdate(KIND, key(current), async previous => {
    const latest = await freshClient(current);
    if (configurationRevision(latest) !== body.expectedRevision || workspaceEditRevision(latest) !== body.expectedEditRevision || closed(latest) || !await sessionActive(latest, session.sessionHash)) fail('configuration_changed', 'Your saved details or sign-in changed. Refresh before starting another check.', 409);
    return { value: { version: 1, tenant: deliveryTenant(current), attempt, history: [...(previous?.history || []), ...(previous?.attempt ? [previous.attempt] : [])].slice(-5), firstExternalRequest: previous?.firstExternalRequest || null, firstExternalRequests: previous?.firstExternalRequests || {} } };
  });
  destination.hash = 'mc-website-check=' + id + '.' + raw;
  return { ok: true, websiteInstallation: await websiteInstallationView(current), check: { id, challenge: raw, contact: attempt.contact, origin, url: destination.href, expiresAt } };
}
export async function publicWebsiteCheck(c, body, origin) {
  if (!['observe', 'status', 'acknowledge'].includes(body.action)) fail('invalid_website_check', 'Choose an available website-check action.', 400);
  requireShape(body, ['action', 'client', 'checkId', 'challenge', ...(body.action === 'observe' ? [] : ['turnId']), ...(body.action === 'acknowledge' ? ['completionRef'] : [])]);
  const meta = { checkId: body.checkId, challenge: body.challenge, ...(body.turnId !== undefined ? { turnId: body.turnId } : {}) };
  requireContextShape(meta);
  let row = await strictRead(KIND, key(c));
  const { current, attempt } = await validateAttempt(c, row, meta, origin);
  if (meta.turnId && attempt.turns?.[meta.turnId]) {
    await reconcileWebsiteTurn({ client: c, tenant: deliveryTenant(c), checkId: attempt.id, turnId: meta.turnId, contact: attempt.contact, origin });
  }
  if (body.action === 'acknowledge') {
    if (!hex(body.turnId, 32) || !hex(body.completionRef)) fail('invalid_website_check', 'The completed-answer reference is invalid.', 400);
    await atomicUpdate(KIND, key(c), async latest => {
      await validateAttempt(c, latest, meta, origin);
      const a = latest.attempt, turn = a.turns?.[body.turnId];
      if (!turn || turn.state !== 'completed' && turn.state !== 'acknowledged' || turn.completionHash !== hash(body.completionRef)) fail('website_answer_unconfirmed', 'The completed answer could not be confirmed. Read the check status before trying again.', 409);
      if (turn.record && !await verifiedRecord(c, turn.record, a, turn)) fail('website_request_changed', 'The exact saved setup request changed or is unavailable. Read its current status in your workspace.', 409);
      if (turn.acknowledgedAt) return {};
      const at = stamp(); return { value: { ...latest, attempt: { ...a, turns: { ...a.turns, [turn.id]: { ...turn, state: 'acknowledged', acknowledgedAt: at } } } } };
    });
    return { ok: true, acknowledged: true, checkId: body.checkId, turnId: body.turnId };
  }
  if (body.action === 'observe') await atomicUpdate(KIND, key(c), async latest => {
    await validateAttempt(c, latest, meta, origin);
    return latest.attempt.observedAt ? {} : { value: { ...latest, attempt: { ...latest.attempt, observedAt: stamp() } } };
  });
  row = await strictRead(KIND, key(c));
  const a = row.attempt, state = chatState(current, await getAIAllowance(current));
  return { ok: true, check: { id: a.id, contact: a.contact, origin: a.origin, expiresAt: a.expiresAt, observed: !!a.observedAt, chatAvailable: state.available, reason: state.reason, sample: { service: typeof current.services?.[0] === 'string' ? current.services[0].slice(0, 160) : '', area: typeof current.business?.serviceArea?.[0] === 'string' ? current.business.serviceArea[0].slice(0, 160) : '' }, turn: publicTurn(a.turns?.[body.turnId]) } };
}
export async function claimWebsiteTurn(c, meta, contact, origin) {
  if (meta === undefined) {
    if (String(contact).startsWith('websitecheck_')) fail('website_check_required', 'Open your saved website check before continuing this sample conversation.', 403);
    return null;
  }
  requireContextShape(meta);
  if (!hex(meta.turnId, 32)) fail('invalid_website_check', 'This sample message needs its own stable turn reference.', 400);
  const context = { client: c, tenant: deliveryTenant(c), checkId: meta.checkId, challenge: meta.challenge, turnId: meta.turnId, contact, origin };
  await atomicUpdate(KIND, key(c), async row => {
    const { attempt } = await validateAttempt(c, row, meta, origin);
    if (!attempt.observedAt || contact !== attempt.contact) fail('website_check_contact', 'Open this sample conversation from the installed widget check.', 403);
    if (attempt.turns[meta.turnId]) fail('website_turn_already_submitted', 'This message was already submitted. Check its saved outcome instead of sending it again.', 409);
    if (Object.keys(attempt.turns).length >= MAX_TURNS) fail('website_check_limit', 'This check has reached its sample-message limit. Read its status before starting again.', 429);
    return { value: { ...row, attempt: { ...attempt, turns: { ...attempt.turns, [meta.turnId]: { id: meta.turnId, state: 'running', createdAt: stamp(), record: null } } } } };
  });
  return context;
}
export async function validateWebsiteTurn(context) {
  if (!context) return;
  const row = await strictRead(KIND, key(context.client));
  await validateAttempt(context.client, row, { checkId: context.checkId, challenge: context.challenge }, context.origin);
}
export function websiteActionId(context, kind) { return hash(JSON.stringify([context.tenant, context.checkId, context.turnId, kind])); }
export function websiteRecordContext(context) { return context ? { websiteSetupCheck: { checkId: context.checkId, turnId: context.turnId, origin: context.origin } } : {}; }
async function updateTurn(context, change) {
  return atomicUpdate(KIND, key(context.client), row => {
    const a = row?.attempt, turn = a?.turns?.[context.turnId];
    if (!a || a.id !== context.checkId || row.tenant !== context.tenant || !turn) return {};
    return { value: { ...row, attempt: { ...a, turns: { ...a.turns, [context.turnId]: { ...turn, ...change } } } } };
  });
}
async function reconcileWebsiteTurn(context) {
  const row = await strictRead(KIND, key(context.client)), a = attemptFrom(row, context.checkId), turn = a?.turns?.[context.turnId];
  if (!turn || turn.record || row.tenant !== context.tenant) return;
  for (const kind of ['leads', 'bookings']) {
    const managedActionId = websiteActionId(context, kind), saved = await strictRead(kind, `${context.client.slug}/${managedActionId.slice(0, 32)}`);
    if (!saved || saved.id !== managedActionId.slice(0, 32) || !Number.isFinite(Date.parse(saved.createdAt)) || saved.channel !== 'web' || saved.status === 'spam' || saved.delivery?.tenantIdentity !== context.tenant || !belongsToWorkspace(context.client, saved) || saved.contact !== a.contact || saved.managedActionId !== managedActionId || saved.websiteSetupCheck?.checkId !== a.id || saved.websiteSetupCheck?.turnId !== turn.id || saved.websiteSetupCheck?.origin !== a.origin) continue;
    await updateTurn(context, { record: recordRef(kind, saved), reconciledAt: stamp() }); return;
  }
}
export async function noteWebsiteRecord(c, kind, record, { context, origin, contact } = {}) {
  if (!['leads', 'bookings'].includes(kind) || !record?.id || record.status === 'spam' || record.channel !== 'web' || record.delivery?.tenantIdentity !== deliveryTenant(c) || !belongsToWorkspace(c, record)) return;
  const saved = await strictRead(kind, `${c.slug}/${record.id}`);
  if (!saved || saved.id !== record.id || !Number.isFinite(Date.parse(saved.createdAt)) || saved.delivery?.tenantIdentity !== deliveryTenant(c) || !belongsToWorkspace(c, saved) || saved.channel !== 'web' || saved.contact !== contact) return;
  if (context) {
    const marker = saved.websiteSetupCheck;
    if (marker?.checkId !== context.checkId || marker.turnId !== context.turnId || saved.managedActionId !== websiteActionId(context, kind)) return;
    await updateTurn(context, { record: recordRef(kind, saved) }); return;
  }
  if (setupCheckRecord(saved) || String(contact).startsWith('websitecheck_') || !external(origin) || !permitted(c, origin)) return;
  const latest = await freshClient(c), web = setupReadiness(latest).channels.web;
  if (closed(latest) || !web.ready || !web.active || !permitted(latest, origin)) return;
  const first = { at: saved.createdAt, origin, record: recordRef(kind, saved) };
  await atomicUpdate(KIND, key(c), row => {
    const previous = row?.firstExternalRequests?.[hash(origin)];
    if (previous && (previous.at < first.at || previous.at === first.at && previous.record.id <= first.record.id)) return {};
    const firstExternalRequests = { ...(row?.firstExternalRequests || {}), [hash(origin)]: first };
    if (Object.keys(firstExternalRequests).length > 64) return {};
    const globalFirst = row?.firstExternalRequest;
    return { value: { ...(row || { version: 1, tenant: deliveryTenant(c), history: [] }), firstExternalRequests, firstExternalRequest: !globalFirst || first.at < globalFirst.at ? first : globalFirst } };
  });
}
export async function finishWebsiteTurn(context, out) {
  if (!context) return out;
  await validateWebsiteTurn(context);
  await reconcileWebsiteTurn(context);
  if (typeof out.reply !== 'string' || !out.reply.trim()) fail('website_answer_unconfirmed', 'The answer did not complete.', 503);
  const raw = randomBytes(32).toString('hex');
  await updateTurn(context, { state: 'completed', completedAt: stamp(), completionHash: hash(raw) });
  const row = await strictRead(KIND, key(context.client)), turn = row?.attempt?.turns?.[context.turnId];
  if (!turn || turn.state !== 'completed') fail('website_check_changed', 'The check changed before its answer could be confirmed.', 409);
  return { ...out, events: [...(out.events || []), { type: 'website_check', checkId: context.checkId, turnId: context.turnId, completionRef: raw, record: turn.record || null }] };
}
export async function failWebsiteTurn(context) { if (context) { await reconcileWebsiteTurn(context); await updateTurn(context, { state: 'unconfirmed', failedAt: stamp() }); } }
