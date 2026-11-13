// Operator-only data erasure. One registry names every store that can hold tenant data and how
// its rows are found; workspace erasure and per-contact erasure both walk it. Erasure is
// idempotent and resumable: an audit tombstone in `workspace_erasures` records progress, and the
// client row is removed last so an interrupted run keeps the context it needs to finish.
//
// Records kept on purpose (privacy-policy.html:93): homeowner opt-outs (`optouts`: the phone key and a stop flag only),
// managed texting suppression (`managed_sms_consent`, reduced to a phone + suppression row) and
// marketing suppression (`prospect_suppression`). Provider resources whose release is not
// confirmed keep a minimal tombstone with their provider IDs until an operator confirms release.
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { list, atomicUpdate, remove, capacityKey, conversationBatchDigest } from './store.mjs';
import { workspaceTenant, supportedWorkspace } from './workspace-identity.mjs';
import { normalizeAccountEmail, accountKey, strictRead } from './accounts.mjs';

const sha = value => createHash('sha256').update(String(value)).digest('hex');
const iso = () => new Date().toISOString();
export const ERASURES = 'workspace_erasures', CONTACT_ERASURES = 'contact_erasures';

export class ErasureError extends Error {
  constructor(code, message, status = 409, extra = {}) { super(message); Object.assign(this, { code, status }, extra); }
}

// scope:
//   prefix     keys `${slug}/…` (legacy) and `${slug}/${tenant}/…` (self-service)
//   exact      key === slug
//   slugField  global keys; row.slug === slug
//   tenantKey  global keys that embed the tenant identity
//   emailKey   key === sha256(owner email)
//   emailRate  key === `email:${sha256(owner email)}`, or (15) `email:<h>:<net>`, `known:<h>:<net>`, `first:<h>`
//   emailField global keys; sha256(normalized row.email) === sha256(owner email)
//   submission intake_submissions rows linked from the owner's prospect or handoff rows, or naming the email
//   index / health  `<kind>:<slug>[:…]` keys or rows whose value is the slug
//   queue      shared queue documents; the tenant's entries are removed
//   none       not tenant data (counters, cursors, IP buckets, M&C's own support line, this audit)
// keep: 'suppression' (kept on purpose, minimized) | 'legal_hold' (owner/legal decision O4)
// provider: rows that can hold the only record of a Twilio/Vapi resource
// contact: false excludes workspace configuration stores from per-contact erasure
export const ERASURE_REGISTRY = Object.freeze({
  bookings: { scope: 'prefix' }, leads: { scope: 'prefix' }, alerts: { scope: 'prefix' }, customers: { scope: 'prefix' },
  conversations: { scope: 'prefix' }, conversation_history: { scope: 'prefix' }, events: { scope: 'prefix', provider: true },
  usage: { scope: 'prefix', extraPrefixes: ['paid-capacity/', 'paid-capacity-intent/', 'paid-capacity-period/', 'paid-capacity-provider/'], contact: false }, workspace_record_index: { scope: 'prefix' },
  managed_sms_inbound: { scope: 'prefix' }, managed_sms_history: { scope: 'prefix' }, managed_sms_locks: { scope: 'prefix' },
  managed_sms_consent: { scope: 'prefix', keep: 'suppression' },
  managed_actions: { scope: 'prefix' }, managed_deliveries: { scope: 'prefix' },
  managed_voice_calls: { scope: 'prefix' }, managed_voice_usage: { scope: 'prefix', contact: false },
  calendar_deliveries: { scope: 'prefix' }, calendar_busy: { scope: 'prefix', contact: false },
  lead_connections: { scope: 'prefix', contact: false },
  request_followthrough: { scope: 'prefix' }, request_followup_permissions: { scope: 'prefix' },
  owner_visit_operations: { scope: 'prefix' }, owner_visit_locks: { scope: 'prefix' }, owner_tests: { scope: 'prefix' },
  customer_visit_requests: { scope: 'prefix' }, // customer-visits.mjs: `${slug}/${tenant}/…`, holds the customer's phone and visit details
  self_service_ai_proofs: { scope: 'exact' }, // keyed by the bare slug (self-service-ai.mjs PROOF_STORE)
  website_installations: { scope: 'prefix', contact: false }, setup_assistance: { scope: 'prefix', contact: false },
  service_intake: { scope: 'prefix', contact: false }, service_approval: { scope: 'prefix', contact: false },
  phone_activation_intents: { scope: 'prefix', provider: true, contact: false }, voice_activation_intents: { scope: 'prefix', provider: true, contact: false },
  messaging_activation: { scope: 'prefix', provider: true, contact: false }, service_onboarding_intents: { scope: 'prefix', provider: true, contact: false },
  service_reconciliations: { scope: 'prefix', contact: false }, workspace_operations: { scope: 'prefix', contact: false },
  owner_fallback: { scope: 'prefix', contact: false }, // legal P1 rev 2: `${slug}/<Houston hour>` operator-fallback counters; no contact data
  workspace_billing: { scope: 'prefix', keep: 'legal_hold', contact: false }, workspace_billing_events: { scope: 'prefix', keep: 'legal_hold', contact: false },
  workspace_billing_reviews: { scope: 'prefix', keep: 'legal_hold', contact: false },
  contact_erasures: { scope: 'prefix', contact: false, provider: true },
  clients: { scope: 'exact', contact: false, provider: true }, calendar_connections: { scope: 'exact', contact: false },
  tasks: { scope: 'slugField' }, managed_voice_call_index: { scope: 'slugField' }, managed_voice_callbacks: { scope: 'slugField' },
  calendar_oauth: { scope: 'slugField', contact: false }, lead_oauth_states: { scope: 'slugField', contact: false },
  workspace_billing_customers: { scope: 'slugField', keep: 'legal_hold', contact: false }, workspace_billing_subscriptions: { scope: 'slugField', keep: 'legal_hold', contact: false },
  optouts: { scope: 'slugField', keep: 'suppression' },
  optout_review: { scope: 'slugField' }, // legal P9: review queue rows hold slug, phone and up to 300 characters of the text
  calendar_execution_budgets: { scope: 'tenantKey', contact: false },
  index: { scope: 'index' }, health: { scope: 'health', contact: false },
  accounts: { scope: 'emailKey', contact: false }, onboarding_drafts: { scope: 'emailKey', contact: false }, prospects: { scope: 'emailKey', contact: false },
  access_outbox: { scope: 'emailKey', contact: false }, prospect_suppression: { scope: 'emailKey', keep: 'suppression', contact: false },
  access_rate: { scope: 'emailRate', contact: false }, intake_rate: { scope: 'emailRate', contact: false },
  access_sessions: { scope: 'emailField', contact: false }, access_tokens: { scope: 'emailField', contact: false }, intake_handoffs: { scope: 'emailField', contact: false },
  intake_submissions: { scope: 'submission', contact: false },
  managed_delivery_pending: { scope: 'queue' }, platform_operations: { scope: 'queue', contact: false }, phone_activation_queue: { scope: 'queue', contact: false },
  voice_activation_queue: { scope: 'queue', contact: false }, service_onboarding_queue: { scope: 'queue', contact: false },
  service_reconciliation_queue: { scope: 'queue', contact: false }, service_reconciliation_health: { scope: 'queue', contact: false },
  // Not tenant data. Cursors may point at a key position; budgets and counters hold no identity.
  ratelimit: { scope: 'none', note: 'raw IP buckets, purged by retentionSweep' }, sales_ai: { scope: 'none' }, self_service_ai: { scope: 'none' },
  practice_voice: { scope: 'none' }, managed_sms_budgets: { scope: 'none' }, managed_email_budgets: { scope: 'none' }, lead_api_budget: { scope: 'none' },
  calendar_scan: { scope: 'none' }, managed_sms_scan: { scope: 'none' }, managed_delivery_cursors: { scope: 'none' }, managed_delivery_waves: { scope: 'none' },
  voice_activation_waves: { scope: 'none' }, messaging_activation_queue: { scope: 'none' }, service_reconciliation_scan: { scope: 'none' },
  workspace_billing_cursor: { scope: 'none' },
  managed_resource_admission: { scope: 'none', note: 'paid-resource accounting ledger; entries are provider accounting, not customer content' },
  platform_sms_receipts: { scope: 'none', note: "M&C's own support number (owner decision O5)" }, platform_sms_messages: { scope: 'none', note: "M&C's own support number (owner decision O5)" },
  workspace_erasures: { scope: 'none', note: 'this audit' },
  optout_requests: { scope: 'none', keep: 'suppression', note: 'legal P9 operator opt-out audit: contact digest and last-4/domain hint only, no raw contact' },
  // Conditional: these stores exist only if Proposal 09 (conversation tokens) or Proposal 15
  // (public chat budget) ships. Listing an absent store costs one empty list and changes nothing.
  // Key shapes are taken from those patches: conversation_access/conversation_forks use convKey
  // (`<slug>[/<tenant>]/<channel>/<contact>`) and hold token hashes; public_chat_ai is one daily
  // counter document of salted network-bucket hashes.
  conversation_access: { scope: 'prefix', conditional: 'proposal-09' }, conversation_forks: { scope: 'prefix', conditional: 'proposal-09' },
  public_chat_ai: { scope: 'none', conditional: 'proposal-15', note: 'daily counter of salted network-bucket hashes; no tenant data' },
});

// ---- Provider references (F5) ----
const TWILIO_RESOURCE = /^(PN|MG|RE|BN|QE)[0-9a-f]{32}$/i;
const VAPI_FIELD = /^(assistantId|phoneNumberId|vapiAssistantId|vapiPhoneNumberId|credentialId)$/;
function collectProviderIds(value, out, field = '', depth = 0) {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (TWILIO_RESOURCE.test(value)) out.add(`twilio:${value}`);
    else if (VAPI_FIELD.test(field) && /^[A-Za-z0-9_-]{6,80}$/.test(value)) out.add(`vapi:${value}`);
    return;
  }
  if (Array.isArray(value)) { for (const item of value) collectProviderIds(item, out, field, depth + 1); return; }
  if (typeof value === 'object' && /^(assistant|imported)$/.test(field) && typeof value.id === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(value.id)) out.add(`vapi:${value.id}`);
  if (typeof value === 'object') for (const [key, item] of Object.entries(value)) if (!/^(released|releasedNumber|formerSlug)$/.test(key)) collectProviderIds(item, out, key, depth + 1);
}
const releaseConfirmed = row => !!(row && (row.releasedAt || row.cleanupConfirmedAt));
export function providerReferences(entries) {
  const refs = new Map();
  for (const { store, row } of entries) {
    if (releaseConfirmed(row)) continue;
    const ids = new Set(); collectProviderIds(row, ids);
    for (const id of ids) if (!refs.has(id)) { const [provider, value] = id.split(/:(.*)/s); refs.set(id, { provider, id: value, kind: providerKind(provider, value), source: store, state: 'pending' }); }
  }
  return [...refs.values()];
}
const providerKind = (provider, id) => provider === 'vapi' ? 'voice_resource' : ({ PN: 'phone_number', MG: 'messaging_service', RE: 'recording', BN: 'brand', QE: 'campaign' })[id.slice(0, 2).toUpperCase()] || 'resource';

// ---- Matching helpers ----
function explicitTenants(row) {
  if (!row || typeof row !== 'object') return [];
  return [row.tenantIdentity, row.tenant, row.delivery?.tenantIdentity].filter(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
}
// A row under this slug that names another tenant identity belongs to another incarnation of
// the slug and is never touched by this erasure.
const ownsRow = (ctx, row) => explicitTenants(row).every(value => value === ctx.tenant);
const slugKey = (key, slug) => new RegExp(`^[A-Za-z]+:${slug.replace(/[-]/g, '\\-')}(:|$)`).test(key);
const emailHashOf = value => { const email = normalizeAccountEmail(value); return email ? accountKey(email) : null; };
function queueMentions(ctx, key, entry) {
  if (typeof key === 'string' && (key === ctx.slug || key.startsWith(ctx.slug + '/'))) return true;
  const rows = [entry, entry?.snapshot].filter(row => row && typeof row === 'object');
  return rows.some(row => row.slug === ctx.slug || explicitTenants(row).includes(ctx.tenant) || typeof row.id === 'string' && row.id.startsWith(ctx.slug + '/'));
}
function pruneQueue(ctx, doc) {
  if (!doc || typeof doc !== 'object') return { doc, removed: 0 };
  let removed = 0; const next = Array.isArray(doc) ? [] : {};
  for (const [field, value] of Object.entries(doc)) {
    if (Array.isArray(value)) { const kept = value.filter(entry => !queueMentions(ctx, null, entry)); removed += value.length - kept.length; next[field] = kept; }
    else if (value && typeof value === 'object') { const kept = Object.fromEntries(Object.entries(value).filter(([key, entry]) => !queueMentions(ctx, key, entry))); removed += Object.keys(value).length - Object.keys(kept).length; next[field] = kept; }
    else next[field] = value;
  }
  return { doc: next, removed };
}
async function rowsOf(kind, prefix = '') {
  const out = [];
  for (const key of await list(kind, prefix)) out.push({ key, row: await strictRead(kind, key) });
  return out;
}

// Every row of one store that belongs to the workspace (`ctx`: slug, tenant, emailHash).
async function workspaceRows(kind, spec, ctx) {
  switch (spec.scope) {
    case 'prefix': { const rows = await rowsOf(kind, ctx.slug + '/'); for (const p of spec.extraPrefixes || []) rows.push(...await rowsOf(kind, p + ctx.slug + '/')); return rows.filter(({ row }) => ownsRow(ctx, row)); }
    case 'exact': { const row = await strictRead(kind, ctx.slug); return row && ownsRow(ctx, row) ? [{ key: ctx.slug, row }] : []; }
    case 'slugField': return (await rowsOf(kind)).filter(({ row }) => row && typeof row === 'object' && (row.slug === ctx.slug || row.formerSlug === ctx.slug) && ownsRow(ctx, row));
    case 'tenantKey': return ctx.tenant ? (await rowsOf(kind)).filter(({ key }) => key.includes(ctx.tenant)) : [];
    case 'emailKey': { if (!ctx.emailHash) return []; const row = await strictRead(kind, ctx.emailHash); return row !== null ? [{ key: ctx.emailHash, row }] : []; }
    case 'emailRate': {
      if (!ctx.emailHash) return [];
      const out = [];
      for (const key of ['email:' + ctx.emailHash, 'first:' + ctx.emailHash]) { const row = await strictRead(kind, key); if (row !== null) out.push({ key, row }); }
      for (const prefix of ['email:', 'known:']) out.push(...await rowsOf(kind, prefix + ctx.emailHash + ':'));
      return out;
    }
    case 'emailField': return ctx.emailHash ? (await rowsOf(kind)).filter(({ row }) => emailHashOf(row?.email) === ctx.emailHash) : [];
    case 'index': return (await rowsOf(kind)).filter(({ key, row }) => row === ctx.slug || slugKey(key, ctx.slug) || ctx.tenant && key.includes(ctx.tenant));
    case 'health': return (await rowsOf(kind)).filter(({ key }) => slugKey(key, ctx.slug) || ctx.tenant && key.includes(ctx.tenant));
    default: return [];
  }
}

// ---- Workspace erasure (F1, F2, F4, F5) ----
function contextOf(client) {
  return { slug: client.slug, tenant: workspaceTenant(client), emailHash: emailHashOf(client.owner?.email), selfService: supportedWorkspace(client) };
}
async function submissionKeys(ctx) {
  const keys = new Set();
  if (!ctx.emailHash) return keys;
  const prospect = await strictRead('prospects', ctx.emailHash); if (prospect?.submissionKey) keys.add(prospect.submissionKey);
  for (const { row } of await workspaceRows('intake_handoffs', ERASURE_REGISTRY.intake_handoffs, ctx)) if (row?.submissionKey) keys.add(row.submissionKey);
  return keys;
}
async function minimizeSuppression(kind, key, row) {
  if (kind === 'optouts') {
    // The key is the phone; the row keeps only the stop flag (no message text, time or shop).
    await atomicUpdate(kind, key, current => current ? { value: { stopped: true } } : {});
    return 'kept';
  }
  if (kind === 'managed_sms_consent') {
    if (row?.suppressed !== true) { await remove(kind, key); return 'deleted'; }
    await atomicUpdate(kind, key, current => current ? { value: { version: 1, tenant: current.tenant, phone: current.phone, suppressed: true, stoppedAt: current.stoppedAt || null, directiveDate: current.directiveDate || null, retainedForSuppression: true } } : {});
    return 'kept';
  }
  return 'kept'; // prospect_suppression rows hold no more than the suppression itself
}
// One pass over every registered store except `clients`. Errors are collected per store so a
// retry finishes only what is left.
async function sweep(ctx, { includeClient = false } = {}) {
  const counts = {}, retained = {}, errors = {};
  const submissions = new Set([...(ctx.submissionKeys || []), ...await submissionKeys(ctx).catch(() => [])]);
  for (const [kind, spec] of Object.entries(ERASURE_REGISTRY)) {
    if (spec.scope === 'none' || kind === 'clients' && !includeClient) continue;
    try {
      if (spec.scope === 'queue') {
        for (const key of await list(kind, '')) {
          const removed = await atomicUpdate(kind, key, current => { const { doc, removed } = pruneQueue(ctx, current); return removed ? { value: doc, result: removed } : { result: 0 }; });
          if (removed) counts[kind] = (counts[kind] || 0) + removed;
        }
        continue;
      }
      const rows = spec.scope === 'submission' ? [...submissions].map(key => ({ key })).concat(await workspaceRows(kind, { scope: 'emailField' }, ctx)) : await workspaceRows(kind, spec, ctx);
      for (const { key, row } of rows) {
        if (spec.keep === 'legal_hold') { retained[kind] = (retained[kind] || 0) + 1; continue; }
        if (spec.keep === 'suppression') { const outcome = await minimizeSuppression(kind, key, row); if (outcome === 'kept') retained[kind] = (retained[kind] || 0) + 1; else counts[kind] = (counts[kind] || 0) + 1; continue; }
        if (spec.scope === 'submission' && (await strictRead(kind, key)) === null) continue;
        await remove(kind, key); counts[kind] = (counts[kind] || 0) + 1;
      }
    } catch (error) { errors[kind] = String(error?.code || error?.message || error).slice(0, 160); }
  }
  return { counts, retained, errors };
}
const merge = (a = {}, b = {}) => { const out = { ...a }; for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v; return out; };
async function providerEntries(ctx, client) {
  // Self-service resources are tracked by their activation intents; the legacy client row is the
  // only record of a legacy number, messaging service or assistant.
  const entries = client && !ctx.selfService ? [{ store: 'clients', row: client }] : [];
  for (const [kind, spec] of Object.entries(ERASURE_REGISTRY)) if (spec.provider && kind !== 'clients') for (const { row } of await workspaceRows(kind, spec, ctx)) {
    if (kind === 'events' && !/voicemail|recording/i.test(String(row?.type || ''))) continue;
    entries.push({ store: kind, row });
  }
  return entries;
}
export const erasureKey = ctx => `${ctx.slug}/${ctx.tenant}`;
export function erasureView(row) {
  if (!row) return null;
  return { slug: row.slug, state: row.state, requestedAt: row.requestedAt, completedAt: row.completedAt || null, counts: row.counts || {}, retained: row.retained || {}, errors: row.errors || {},
    providerCleanup: (row.providerCleanup || []).map(ref => ({ provider: ref.provider, kind: ref.kind, id: ref.id, state: ref.state, source: ref.source, ...(ref.confirmedAt ? { confirmedAt: ref.confirmedAt } : {}) })), attempts: (row.attempts || []).length };
}
// The unfinished erasure for this slug, or else the most recent finished one (a repeat is a no-op).
async function findOpenErasure(slug) {
  let latest = null;
  for (const key of await list(ERASURES, slug + '/')) {
    const row = await strictRead(ERASURES, key);
    if (!row || row.slug !== slug) continue;
    if (row.state !== 'complete') return { key, row };
    if (!latest || String(row.updatedAt) > String(latest.row.updatedAt)) latest = { key, row };
  }
  return latest;
}
export async function workspaceErasureStatus(slug) {
  const keys = await list(ERASURES, slug + '/');
  const rows = []; for (const key of keys) rows.push(await strictRead(ERASURES, key));
  return rows.filter(Boolean).map(erasureView);
}
export async function pendingProviderCleanup() {
  const out = [];
  for (const key of await list(ERASURES, '')) { const row = await strictRead(ERASURES, key); if (row?.state === 'provider_cleanup_pending') out.push(erasureView(row)); }
  return out;
}

// `client` is the current row, or null when resuming after the row was already removed.
// `releaseProviders(refs, client)` (optional) attempts release and returns the confirmed ids.
// Self-service erasure refuses while provider IDs are unconfirmed unless the operator asks to keep
// them in the tombstone (`providerCleanup: 'retain_tombstone'`).
export async function eraseWorkspace({ slug, client = null, actor, reason, releaseProviders = null, providerCleanup = 'require_confirmed', requireClosed = false, workspaceKind = null }) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug || '')) throw new ErasureError('invalid_request', 'Choose a workspace.', 400);
  const cleanReason = auditReason(reason);
  let ctx, tombKey, tomb;
  if (client) {
    if (client.slug !== slug) throw new ErasureError('invalid_request', 'Choose a workspace.', 400);
    if (requireClosed && !['cancelled', 'archived'].includes(client.status)) throw new ErasureError('cancel_required', 'Cancel service before erasing this workspace. Its records are unchanged.');
    ctx = contextOf(client); tombKey = erasureKey(ctx); tomb = await strictRead(ERASURES, tombKey);
  } else {
    const open = await findOpenErasure(slug);
    if (!open) throw new ErasureError('not_found', 'No workspace or unfinished erasure was found.', 404);
    tombKey = open.key; tomb = open.row; ctx = { slug, tenant: tomb.tenant, emailHash: tomb.emailHash || null, selfService: !!tomb.selfService };
  }
  // The legacy admin key resumes only legacy erasures; self-service ones go through the operator portal.
  if (workspaceKind && (workspaceKind === 'self_service') !== ctx.selfService) throw new ErasureError('managed_action_required', 'Use the operator portal for this customer.', 409);
  ctx.submissionKeys = [...new Set([...(tomb?.submissionKeys || []), ...await submissionKeys(ctx)])];
  if (tomb?.state === 'complete' && !client) return { ok: true, erasure: erasureView(tomb), alreadyComplete: true };
  // Provider references are taken before any row is removed and merged with earlier attempts.
  const known = new Map((tomb?.providerCleanup || []).map(ref => [`${ref.provider}:${ref.id}`, ref]));
  for (const ref of providerReferences(await providerEntries(ctx, client))) if (!known.has(`${ref.provider}:${ref.id}`)) known.set(`${ref.provider}:${ref.id}`, ref);
  let refs = [...known.values()];
  if (releaseProviders && refs.some(ref => ref.state === 'pending')) {
    let confirmed = new Set(); try { confirmed = new Set(await releaseProviders(refs.filter(ref => ref.state === 'pending'), client)); } catch { /* every unconfirmed id stays pending */ }
    refs = refs.map(ref => ref.state === 'pending' && confirmed.has(ref.id) ? { ...ref, state: 'released', confirmedAt: iso(), confirmedBy: 'release_call' } : ref);
  }
  const pending = refs.filter(ref => ref.state === 'pending');
  if (ctx.selfService && pending.length && providerCleanup !== 'retain_tombstone' && !tomb) throw new ErasureError('provider_cleanup_pending', 'Provider resources for this workspace are not confirmed released. Finish cleanup, or erase with providerCleanup "retain_tombstone" to keep their IDs in the erasure record.', 409, { providerCleanup: pending.map(ref => ({ provider: ref.provider, kind: ref.kind, id: ref.id, source: ref.source })) });
  // C1 (QA-LIFE): claim the client row in a client CAS before the tombstone. A reopen racing this erase
  // either committed first (this CAS sees it open and stops) or loses its own client CAS, retries and
  // sees erasureStartedAt (workspace-lifecycle.mjs refuses reopen). A re-read alone leaves a window.
  if (client) {
    const claimed = await atomicUpdate('clients', ctx.slug, current => !current || workspaceTenant(current) !== ctx.tenant ? { result: true }
      : requireClosed && !['cancelled', 'archived'].includes(current.status) ? { result: false }
      : { value: { ...current, erasureStartedAt: current.erasureStartedAt || iso() }, result: true });
    if (!claimed) throw new ErasureError('cancel_required', 'Cancel service before erasing this workspace. Its records are unchanged.');
  }
  const attempt = { id: randomUUID(), at: iso(), actor: String(actor || '').slice(0, 254), reason: cleanReason };
  tomb = await atomicUpdate(ERASURES, tombKey, current => {
    const base = current || { version: 1, slug: ctx.slug, tenant: ctx.tenant, emailHash: ctx.emailHash, selfService: ctx.selfService, requestedAt: attempt.at, counts: {}, retained: {}, attempts: [] };
    const value = { ...base, state: 'running', providerCleanup: refs, submissionKeys: ctx.submissionKeys, attempts: [...(base.attempts || []), attempt].slice(-20), updatedAt: attempt.at };
    return { value, result: value };
  });
  // Pass 1 removes everything but the client row; the client row goes only when pass 1 was clean.
  const first = await sweep(ctx);
  let counts = merge(tomb.counts, first.counts), retained = { ...first.retained }, errors = { ...first.errors };
  if (!Object.keys(errors).length) {
    try { const current = await strictRead('clients', ctx.slug); if (current && workspaceTenant(current) === ctx.tenant) { await remove('clients', ctx.slug); counts.clients = (counts.clients || 0) + 1; } }
    catch (error) { errors.clients = String(error?.message || error).slice(0, 160); }
  }
  // Pass 2 catches rows a background worker wrote while pass 1 ran.
  if (!Object.keys(errors).length) { const second = await sweep(ctx); counts = merge(counts, second.counts); retained = { ...retained, ...second.retained }; Object.assign(errors, second.errors); }
  const failed = Object.keys(errors).length, stillPending = refs.some(ref => ref.state === 'pending');
  const state = failed ? 'retry_required' : stillPending ? 'provider_cleanup_pending' : 'complete';
  const saved = await atomicUpdate(ERASURES, tombKey, current => {
    const value = { ...current, state, counts, retained, errors, updatedAt: iso(), ...(failed ? {} : { completedAt: current.completedAt || iso(), emailHash: null, submissionKeys: [] }) };
    return { value, result: value };
  });
  if (failed) throw new ErasureError('erasure_incomplete', 'Some records could not be removed. The erasure record is saved; run erase again to finish.', 503, { erasure: erasureView(saved) });
  return { ok: true, erasure: erasureView(saved) };
}
// An operator confirms (for example from the provider console) that one retained provider ID is released.
export async function confirmProviderCleanup({ slug, providerId, actor, reason }) {
  if (typeof providerId !== 'string' || !providerId) throw new ErasureError('invalid_request', 'Choose a provider ID and add a reason.', 400);
  const cleanReason = auditReason(reason);
  for (const key of await list(ERASURES, slug + '/')) {
    const updated = await atomicUpdate(ERASURES, key, current => {
      if (!current || !(current.providerCleanup || []).some(ref => ref.id === providerId && ref.state === 'pending')) return { result: null };
      const providerCleanup = current.providerCleanup.map(ref => ref.id === providerId && ref.state === 'pending' ? { ...ref, state: 'released', confirmedAt: iso(), confirmedBy: String(actor || '').slice(0, 254), confirmReason: cleanReason } : ref);
      const state = current.state === 'provider_cleanup_pending' && !providerCleanup.some(ref => ref.state === 'pending') ? 'complete' : current.state;
      const value = { ...current, providerCleanup, state, updatedAt: iso() };
      return { value, result: value };
    });
    if (updated) return { ok: true, erasure: erasureView(updated) };
  }
  throw new ErasureError('not_found', 'No pending provider cleanup matches this ID.', 404);
}

// ---- Per-contact erasure (F3) ----
// A contact is one phone number or one website visitor id.
//  - Rows that ARE the contact's record are deleted: a key segment is the phone or the visitor's
//    conversation path, an identity field (phone, to, from, contact, ...) holds exactly the phone,
//    or the row is the visitor's web record. Rows that link to a deleted booking or lead go too.
//  - Rows that only MENTION the phone in free text (another customer's booking notes, a website
//    visitor who typed someone else's number) are redacted in place, never deleted. A website
//    archive is redacted batch by batch under a staged digest (see redactArchive), so every chain
//    stays readable and verifiable throughout, including after an interruption.
//  - Derived copies whose content is covered by an integrity digest (deliveries, actions,
//    follow-through) cannot be edited safely; a mention-only row there is deleted and reported
//    separately as `deletedMentionOnly`.
// Every run writes its audit row first (state running) and finishes it as complete or
// retry_required; the order of work below keeps every unfinished step rediscoverable.
const batchChain = (ctx, channel, contact) => `${ctx.slug}/${ctx.tenant}/${sha(JSON.stringify([channel, contact]))}/`;
export const REASON_NOTICE = 'The reason is kept in the erasure audit record. Do not include personal data: no names, phone numbers, email addresses, street addresses or message text.';
const ANY_PHONE = /(?<!\d)(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]?\d{3}[ .-]?\d{4}(?!\d)/, ANY_EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// Reasons are stored verbatim (audit rows and the workspace's management audit), so they must not
// carry personal data. Phone numbers, email addresses and the erased contact are refused.
export function auditReason(reason, extra = []) {
  if (typeof reason !== 'string' || reason.trim().length < 3) throw new ErasureError('invalid_request', 'Add a reason for this erasure. ' + REASON_NOTICE, 400);
  const value = reason.trim();
  if (ANY_PHONE.test(value) || ANY_EMAIL.test(value) || extra.some(item => item && value.includes(item))) throw new ErasureError('reason_contains_personal_data', REASON_NOTICE, 400);
  return value.slice(0, 300);
}
// A phone matches in E.164, the storage-key form (~1…), or as ten digits in common US
// formats, never inside a longer run of digits.
export function contactNeedles({ phone, webContact }) {
  const needles = [];
  if (phone) {
    const m = /^\+1([2-9]\d{2})(\d{3})(\d{4})$/.exec(phone); if (!m) throw new ErasureError('invalid_contact', 'Enter a US phone number in +1 format.', 400);
    const [, a, b, c] = m; needles.push(new RegExp(`(?<!\\d)(?:[+~]?1[ .-]?)?\\(?${a}\\)?[ .-]?${b}[ .-]?${c}(?!\\d)`));
  }
  if (webContact !== undefined && webContact !== null) { if (!/^[a-zA-Z0-9_-]{1,60}$/.test(webContact)) throw new ErasureError('invalid_contact', 'Choose a saved website conversation.', 400); }
  return needles;
}
export const REDACTED = '[removed]';
const IDENTITY_FIELD = /^(phone|customerPhone|callerPhone|caller|customer_phone|from|to|recipient|number|contact)$/;
const LINK_FIELD = /^(bookingId|leadId|recordId|sourceId)$/;
// Owner business records and plain text: a mention-only row is redacted in place.
const REDACT_IN_PLACE = new Set(['bookings', 'leads', 'alerts', 'customers', 'events', 'tasks', 'conversations']);
function contactMatcher(ctx, { phone, webContact }) {
  const needles = contactNeedles({ phone, webContact });
  const full = phone ? new RegExp(`^\\s*${needles[0].source}\\s*$`) : null, all = needles.map(n => new RegExp(n.source, 'g'));
  const webPath = webContact ? (ctx.selfService ? `${ctx.slug}/${ctx.tenant}/web/${webContact}` : `${ctx.slug}/web/${webContact}`) : null;
  const mentions = (key, row) => { const text = key + '\n' + JSON.stringify(row ?? null); return needles.some(n => n.test(text)); };
  const nested = row => row && typeof row === 'object' && !Array.isArray(row) ? [row, ...Object.values(row).filter(v => v && typeof v === 'object' && !Array.isArray(v))] : [];
  const own = (key, row) => {
    if (full && key.split(/[/:]/).some(part => full.test(part))) return true;
    if (webPath && (key === webPath || key.startsWith(webPath + '/'))) return true;
    for (const o of nested(row)) {
      if (full && Object.entries(o).some(([field, value]) => IDENTITY_FIELD.test(field) && typeof value === 'string' && full.test(value))) return true;
      if (webContact && o.channel === 'web' && o.contact === webContact) return true;
    }
    return false;
  };
  const links = (row, ids) => nested(row).some(o => Object.entries(o).some(([field, value]) => LINK_FIELD.test(field) && ids.has(value)));
  const redact = value => typeof value === 'string' ? all.reduce((text, n) => text.replace(n, REDACTED), value)
    : Array.isArray(value) ? value.map(redact) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)])) : value;
  return { needles, mentions, own, links, redact, webPath };
}
// The business's own numbers are configuration, not a homeowner's data.
async function ownNumbers(ctx, client) {
  const out = new Set([client.owner?.phone, client.owner?.backupPhone, client.phone?.businessNumber, client.phone?.twilioNumber, client.phone?.transferTo, client.phone?.voiceForwardTo].filter(v => typeof v === 'string' && v));
  const walk = (value, depth = 0) => { if (depth > 6 || value === null || value === undefined) return; if (typeof value === 'string') { if (/^\+1[2-9]\d{9}$/.test(value)) out.add(value); return; } if (typeof value === 'object') for (const item of Object.values(value)) walk(item, depth + 1); };
  for (const kind of ['phone_activation_intents', 'voice_activation_intents', 'messaging_activation']) for (const { row } of await workspaceRows(kind, ERASURE_REGISTRY[kind], ctx)) walk(row);
  return [...out];
}
// Website archive redaction, one chain at a time. Stage A records on the head the digest each
// mentioning batch will have; stage B rewrites those batches; stage C adopts the new digests and
// redacts the head's context window. Readers accept either digest of a staged entry, so the chain
// verifies after every stage, and a retry finds the unfinished work (a batch still mentions the
// contact, or the head still has a staged entry).
async function redactArchive(ctx, head, m) {
  const chain = batchChain(ctx, head.row.channel, head.row.contact), batches = new Map();
  for (const key of await list('conversation_history', chain)) batches.set(key.slice(chain.length), { key, row: await strictRead('conversation_history', key) });
  const redactBatch = row => ({ ...row, messages: m.redact(row.messages), output: m.redact(row.output ?? null), inputHash: null, redacted: true });
  const plan = new Map();
  for (const [id, { key, row }] of batches) if (row && m.mentions(key, row)) { const next = redactBatch(row); plan.set(id, { key, digest: conversationBatchDigest(next) }); }
  if (plan.size) await atomicUpdate('conversations', head.key, current => {
    if (!current?.history) return { result: 0 };
    let changed = false;
    const entries = current.history.entries.map(entry => { const step = plan.get(entry.id); if (!step || entry.redactedDigest === step.digest) return entry; changed = true; return { ...entry, redactedDigest: step.digest }; });
    return changed ? { value: { ...current, history: { ...current.history, entries } }, result: 1 } : { result: 0 };
  });
  let redacted = 0;
  for (const [, step] of plan) redacted += await atomicUpdate('conversation_history', step.key, current => current && m.mentions(step.key, current) ? { value: redactBatch(current), result: 1 } : { result: 0 });
  const digests = new Map();
  for (const [id, { key }] of batches) { const row = await strictRead('conversation_history', key); if (row) digests.set(id, conversationBatchDigest(row)); }
  const staged = await atomicUpdate('conversations', head.key, current => {
    if (!current) return { result: 0 };
    let left = 0;
    const { history, ...rest } = current;
    const entries = history?.entries?.map(entry => { if (!entry.redactedDigest) return entry; if (digests.get(entry.id) !== entry.redactedDigest) { left++; return entry; } const { redactedDigest, ...kept } = entry; return { ...kept, digest: redactedDigest }; });
    const value = { ...m.redact(rest), ...(history ? { history: { ...history, entries } } : {}) };
    return JSON.stringify(value) === JSON.stringify(current) ? { result: left } : { value, result: left };
  });
  if (staged) throw new ErasureError('erasure_incomplete', 'A conversation batch could not be redacted yet.', 503);
  return redacted;
}
async function saveContactAudit(key, update) { return atomicUpdate(CONTACT_ERASURES, key, current => { const value = update(current); return { value, result: value }; }); }
const contactView = row => ({ id: row.id, at: row.at, state: row.state, contactDigest: row.contactDigest, counts: row.counts || {}, redacted: row.redacted || {}, deletedMentionOnly: row.deletedMentionOnly || {}, retained: row.retained || {}, errors: row.errors || {}, calendarEventsToRemoveAtGoogle: (row.calendarEventIds || []).length, providerCleanup: row.providerCleanup || [], clientRulesStillMentionContact: !!row.clientRulesStillMentionContact });
export async function eraseContact({ client, phone = null, webContact = null, actor, reason }) {
  if (!client) throw new ErasureError('not_found', 'Customer not found.', 404);
  if (!phone && !webContact || phone && webContact) throw new ErasureError('invalid_contact', 'Choose one phone number or one website conversation.', 400);
  const ctx = contextOf(client), m = contactMatcher(ctx, { phone, webContact });
  const cleanReason = auditReason(reason, [webContact]);
  if (phone) { const own = await ownNumbers(ctx, client); if (own.some(value => m.needles[0].test(value))) throw new ErasureError('own_number', "This is one of the business's own numbers. Change it in the business details instead.", 409); }
  if (phone && m.needles[0].test(cleanReason)) throw new ErasureError('reason_contains_personal_data', REASON_NOTICE, 400);
  // Audit first, keyed per run, with no contact data: an HMAC under ERASURE_AUDIT_KEY, or no digest at all.
  const id = randomUUID(), at = iso(), auditKey = `${ctx.slug}/${ctx.tenant}/${id}`;
  const contactDigest = process.env.ERASURE_AUDIT_KEY ? createHmac('sha256', process.env.ERASURE_AUDIT_KEY).update(JSON.stringify(['contact-erasure-v2', ctx.tenant, phone || null, webContact || null])).digest('hex') : null;
  await saveContactAudit(auditKey, () => ({ version: 2, id, slug: ctx.slug, tenantIdentity: ctx.tenant, at, actor: String(actor || '').slice(0, 254), reason: cleanReason, contactDigest, kind: phone ? 'phone' : 'web', state: 'running', counts: {}, redacted: {}, deletedMentionOnly: {}, retained: {}, calendarEventIds: [], providerCleanup: [], updatedAt: at }));
  const counts = {}, redacted = {}, mentionOnly = {}, retained = {}, calendarEventIds = [], providerIds = new Set(), redactedConversations = [];
  const bump = (bag, kind, n = 1) => { if (n) bag[kind] = (bag[kind] || 0) + n; };
  try {
    // 1. Website archives. The visitor's own chain is deleted head first, then the batches that do
    //    not carry the contact, then the ones that do, so a retry always rediscovers the rest.
    //    Any other chain that mentions the phone is redacted and stays readable.
    const heads = (await rowsOf('conversations', ctx.slug + '/')).filter(({ row }) => ownsRow(ctx, row));
    const archived = heads.filter(({ row }) => row?.history && row.channel && row.contact && /^[a-f0-9]{64}$/.test(row.tenantIdentity || ''));
    const headByChain = new Map(archived.map(entry => [batchChain(ctx, entry.row.channel, entry.row.contact), entry]));
    const touched = new Set();
    for (const { key, row } of await rowsOf('conversation_history', ctx.slug + '/')) if (ownsRow(ctx, row) && (m.mentions(key, row) || m.own(key, row))) touched.add(key.split('/').slice(0, 3).join('/') + '/');
    for (const entry of archived) if (m.mentions(entry.key, entry.row) || m.own(entry.key, entry.row) || entry.row.history.entries?.some(e => e.redactedDigest)) touched.add(batchChain(ctx, entry.row.channel, entry.row.contact));
    for (const chain of touched) {
      const head = headByChain.get(chain);
      if (head && !m.own(head.key, head.row)) { bump(redacted, 'conversation_history', await redactArchive(ctx, head, m)); bump(redacted, 'conversations'); redactedConversations.push(head.row.contact); continue; }
      if (head && await strictRead('conversations', head.key) !== null) { await remove('conversations', head.key); bump(counts, 'conversations'); }
      // Without a head the batches cannot be read by anyone; they are removed.
      const batches = []; for (const key of await list('conversation_history', chain)) { const row = await strictRead('conversation_history', key); batches.push({ key, hit: m.mentions(key, row) || m.own(key, row) }); }
      for (const { key } of [...batches.filter(b => !b.hit), ...batches.filter(b => b.hit)]) { await remove('conversation_history', key); bump(counts, 'conversation_history'); }
    }
    // 2. Classify every other row of the workspace.
    const own = [], mention = [], rest = [];
    for (const [kind, spec] of Object.entries(ERASURE_REGISTRY)) {
      if (spec.contact === false || ['conversation_history', 'workspace_record_index', 'index'].includes(kind) || spec.scope === 'queue' || spec.scope === 'none') continue;
      for (const { key, row } of await workspaceRows(kind, spec, ctx)) {
        if (kind === 'conversations' && archived.some(entry => entry.key === key)) continue;
        (m.own(key, row) ? own : m.mentions(key, row) ? mention : rest).push({ kind, spec, key, row });
      }
    }
    const ownIds = new Set(own.map(({ row }) => row?.id).filter(v => typeof v === 'string'));
    const dependents = [...mention, ...rest].filter(({ spec, row }) => !spec.keep && m.links(row, ownIds));
    const deleting = [...dependents, ...own.filter(({ spec }) => !spec.keep)];
    const deletingKeys = new Set(deleting.map(({ kind, key }) => kind + '|' + key));
    const deletedIds = new Set(deleting.map(({ row }) => row?.id).filter(v => typeof v === 'string'));
    const bookingIds = new Set(deleting.filter(({ kind }) => kind === 'bookings').map(({ row }) => row?.id).filter(v => typeof v === 'string'));
    // 3. Release references before the rows go, so an interruption never strands them.
    if (bookingIds.size) {
      const released = await atomicUpdate('index', capacityKey(client), state => {
        if (!state || typeof state !== 'object') return { result: 0 };
        const next = structuredClone(state); let n = 0;
        for (const field of ['reservations', 'mutations', 'stableClaims']) for (const bookingId of bookingIds) if (next[field] && Object.hasOwn(next[field], bookingId)) { delete next[field][bookingId]; if (field === 'reservations') n++; }
        return JSON.stringify(next) !== JSON.stringify(state) ? { value: next, result: n } : { result: 0 };
      });
      bump(counts, 'capacity_reservations', released);
    }
    for (const { key } of (await rowsOf('workspace_record_index', ctx.slug + '/')).filter(({ row }) => ownsRow(ctx, row))) {
      const n = await atomicUpdate('workspace_record_index', key, current => { const ids = (current?.ids || []).filter(value => !deletedIds.has(value)); return current && ids.length !== current.ids.length ? { value: { ...current, ids }, result: current.ids.length - ids.length } : { result: 0 }; });
      bump(counts, 'workspace_record_index', n);
    }
    const queued = await atomicUpdate('managed_delivery_pending', 'active', current => {
      if (!current) return { result: 0 }; let n = 0; const next = { ...current };
      for (const field of ['entries', 'failures']) if (current[field] && typeof current[field] === 'object') next[field] = Object.fromEntries(Object.entries(current[field]).filter(([key, entry]) => { const hit = deletedIds.has(key) || deletedIds.has(key.split('/').pop()) || key.startsWith(ctx.slug + '/') && (m.own(key, entry) || m.mentions(key, entry)); if (hit) n++; return !hit; }));
      return n ? { value: next, result: n } : { result: 0 };
    });
    bump(counts, 'managed_delivery_pending', queued);
    for (const { kind, key } of deleting) if (kind === 'managed_voice_calls') { const sid = key.split('/').pop(); const row = /^CA/.test(sid) ? await strictRead('managed_voice_call_index', sid) : null; if (row && (!row.slug || row.slug === ctx.slug)) { await remove('managed_voice_call_index', sid); bump(counts, 'managed_voice_call_index'); } }
    for (const { key, row } of await workspaceRows('index', ERASURE_REGISTRY.index, ctx)) if (m.own(key, row) || m.mentions(key, row)) { await remove('index', key); bump(counts, 'index'); }
    for (const key of await list('index', 'bridge:')) if (m.own(key, null) && await strictRead('index', key) === ctx.slug) { await remove('index', key); bump(counts, 'index'); }
    // 4. Redact mention-only rows; delete derived copies that cannot be edited safely.
    for (const { kind, spec, key, row } of mention) {
      if (spec.keep || deletingKeys.has(kind + '|' + key)) continue;
      if (REDACT_IN_PLACE.has(kind)) { bump(redacted, kind, await atomicUpdate(kind, key, current => current && m.mentions(key, current) ? { value: m.redact(current), result: 1 } : { result: 0 })); continue; }
      if (spec.provider) collectProviderIds(row, providerIds);
      await remove(kind, key); bump(mentionOnly, kind);
    }
    // 5. Suppression rows are kept, minimized; then dependents, then the contact's own rows.
    for (const { kind, spec, key, row } of own) if (spec.keep === 'suppression') { const outcome = await minimizeSuppression(kind, key, row); bump(outcome === 'kept' ? retained : counts, kind); }
    for (const { kind, spec, key, row } of deleting) {
      if (kind === 'calendar_deliveries') for (const value of [row?.eventId, row?.event?.id, row?.googleEventId].filter(v => typeof v === 'string')) calendarEventIds.push(value);
      // A recording SID may live only in this row (for example a VIP voicemail event): keep the ID.
      if (spec.provider) collectProviderIds(row, providerIds);
      if (await strictRead(kind, key) === null) continue;
      await remove(kind, key); bump(counts, kind);
    }
  } catch (error) {
    const saved = await saveContactAudit(auditKey, current => ({ ...current, state: 'retry_required', counts, redacted, deletedMentionOnly: mentionOnly, retained, errors: { run: String(error?.code || error?.message || error).slice(0, 160) }, updatedAt: iso() }));
    throw new ErasureError('erasure_incomplete', 'Some records could not be erased. The audit row is saved; run the erasure again to finish.', 503, { erasure: contactView(saved) });
  }
  const clientMentions = m.mentions('clients/' + ctx.slug, client);
  const providerCleanup = [...providerIds].map(value => { const [provider, pid] = value.split(/:(.*)/s); return { provider, id: pid, kind: providerKind(provider, pid), state: 'pending' }; });
  const saved = await saveContactAudit(auditKey, current => ({ ...current, state: 'complete', counts, redacted, deletedMentionOnly: mentionOnly, retained, calendarEventIds, providerCleanup, clientRulesStillMentionContact: clientMentions, completedAt: iso(), updatedAt: iso() }));
  return { ok: true, notice: REASON_NOTICE, erasure: { ...contactView(saved), redactedConversations } };
}

// ---- Retention sweep (F6, F7) ----
// Raw-IP rate-limit buckets older than the current and previous 10-minute window, and sign-in
// sessions/tokens and intake handoffs more than a week past expiry. Bounded per run.
export async function retentionSweep({ now = Date.now(), limit = 500, graceMs = 7 * 86400000 } = {}) {
  const out = { ratelimit: 0, access_sessions: 0, access_tokens: 0, intake_handoffs: 0 };
  let budget = limit;
  const bucket = Math.floor(now / 600000);
  for (const key of await list('ratelimit', '')) {
    if (budget <= 0) break;
    const n = Number(key.split('/').pop());
    if (Number.isInteger(n) && n < bucket - 1) { await remove('ratelimit', key); out.ratelimit++; budget--; }
  }
  for (const kind of ['access_sessions', 'access_tokens', 'intake_handoffs']) for (const key of await list(kind, '')) {
    if (budget <= 0) break;
    const row = await strictRead(kind, key), expires = Date.parse(row?.expiresAt);
    if (Number.isFinite(expires) && expires + graceMs < now) { await remove(kind, key); out[kind]++; budget--; }
  }
  return { ...out, truncated: budget <= 0 };
}
