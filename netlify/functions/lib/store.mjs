// Storage on Netlify Blobs. One store per kind; keys are "<slug>/<id>" so a client's
// records list by prefix. All reads/writes are JSON.
import { getStore } from "@netlify/blobs";
import { randomBytes, createHash } from "node:crypto";
import { normalizeDate } from "./calendar.mjs";
import { canonicalWindow, listedWindows, listedWindow, requestedDate, addDays, isoDateValid, isElapsedWindow, AvailabilityInputError } from "./availability.mjs";
import { workspaceTenant, supportedWorkspace, belongsToWorkspace, WorkspaceIdentityError } from './workspace-identity.mjs';
export { canonicalWindow } from "./availability.mjs";

// Opened per call, never cached at module level: a warm function instance that outlives the Blobs
// token would otherwise fail every write with "Token expired".
// MC_MEMORY_STORE=1 (the deploy smoke test) swaps Blobs for an in-process Map with the same four calls.
const memory = new Map();
let memoryRevision = 0;
function memStore(name) {
  if (!memory.has(name)) memory.set(name, new Map());
  const m = memory.get(name);
  return {
    async get(key, opts) { const v = m.get(key); return v === undefined ? null : (opts?.type === "json" ? JSON.parse(v.value) : v.value); },
    async getWithMetadata(key, opts) { const v = m.get(key); return v === undefined ? null : { data: opts?.type === "json" ? JSON.parse(v.value) : v.value, etag: v.etag, metadata: {} }; },
    async setJSON(key, value, opts = {}) {
      const current = m.get(key);
      if ((opts.onlyIfNew && current) || (opts.onlyIfMatch && current?.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = String(++memoryRevision); m.set(key, { value: JSON.stringify(value), etag });
      return { modified: true, etag };
    },
    async delete(key) { m.delete(key); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
function store(name) {
  if (process.env.MC_MEMORY_STORE === "1") return memStore(name);
  return getStore({ name, consistency: "strong" });
}

export const id = (n = 6) => randomBytes(n).toString("hex");
export const secret = () => randomBytes(24).toString("hex");
export const now = () => new Date().toISOString();

// Blobs turns "+" in a key into a space; phone numbers are E.164, so encode the plus.
const safe = (k) => String(k).replace(/\+/g, "~");
export const unsafe = (k) => String(k).replace(/~/g, "+");
export async function get(kind, key) {
  try { return await store(kind).get(safe(key), { type: "json" }); } catch { return null; }
}
export async function put(kind, key, value) {
  await store(kind).setJSON(safe(key), value);
  return value;
}

// Netlify's conditional writes arbitrate between function instances. Never turn a failed read into
// an empty value here: capacity must fail closed when storage cannot be read.
export async function atomicUpdate(kind, key, update) {
  const s = store(kind), k = safe(key);
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await s.getWithMetadata(k, { type: "json", consistency: "strong" });
    const next = await update(current?.data ?? null);
    if (!Object.hasOwn(next, "value")) return next.result;
    if (current && !current.etag) throw new Error("Conditional storage read returned no ETag");
    const written = await s.setJSON(k, next.value, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (written.modified) {
      // The installed SDK also returns modified:true for some failed conditional responses.
      // A successful write must include its ETag; otherwise retain any prior claim and fail closed.
      if (!written.etag) throw new Error("Conditional storage write returned no ETag");
      return next.result;
    }
  }
  throw new Error("Booking capacity changed too often; please retry");
}
export async function del(kind, key) {
  try { await store(kind).delete(safe(key)); } catch { /* ignore */ }
}
export async function list(kind, prefix = "") {
  const { blobs } = await store(kind).list({ prefix: safe(prefix) });
  return blobs.map((b) => unsafe(b.key)).sort();
}
export async function listJSON(kind, prefix = "", limit = 200) {
  const keys = (await list(kind, prefix)).slice(-limit);
  const items = await Promise.all(keys.map((k) => get(kind, k)));
  return items.filter(Boolean);
}

// ---- Clients ----
export const getClient = (slug) => get("clients", slug);
export const saveClient = (client) => put("clients", client.slug, { ...client, updatedAt: now() });
export const clientByEmail = async (email) => {
  const slug = await get("index", "email:" + email.toLowerCase());
  return slug ? getClient(slug) : null;
};
export const clientByNumber = async (e164) => {
  const slug = await get("index", "number:" + e164);
  return slug ? getClient(slug) : null;
};
export async function indexClient(client) {
  if (client.owner?.email) await put("index", "email:" + client.owner.email.toLowerCase(), client.slug);
  if (client.phone?.twilioNumber) await put("index", "number:" + client.phone.twilioNumber, client.slug);
}

export async function assertCurrentWorkspace(client) {
  if (!client || !Object.hasOwn(client, 'onboarding')) return client;
  if (!supportedWorkspace(client)) throw new WorkspaceIdentityError();
  const current = await atomicUpdate('clients', client.slug, row => ({ result: row }));
  if (!supportedWorkspace(current) || workspaceTenant(current) !== workspaceTenant(client)) throw new WorkspaceIdentityError();
  return current;
}
// ---- Conversations: supported workspaces never adopt the old slug-only namespace. ----
export const convKey = (target, channel, contact) => typeof target === 'string' ? `${target}/${channel}/${contact}` : supportedWorkspace(target) ? `${target.slug}/${workspaceTenant(target)}/${channel}/${contact}` : `${target.slug}/${channel}/${contact}`;
export async function getConversation(target, channel, contact) {
  const client = typeof target === 'string' ? null : target, slug = client ? client.slug : target;
  if (client) await assertCurrentWorkspace(client);
  const scoped = supportedWorkspace(client), path = convKey(target, channel, contact);
  const previous = scoped ? await atomicUpdate('conversations', path, row => ({ result: row })) : await get('conversations', path);
  if (previous && scoped && (!belongsToWorkspace(client, previous) || previous.slug !== slug || previous.channel !== channel || previous.contact !== contact)) throw new WorkspaceIdentityError();
  const conv = previous || { slug, channel, contact, messages: [], createdAt: now(), ...(scoped ? { tenantIdentity: workspaceTenant(client) } : {}) };
  if (archivedWeb(conv) && conv.history) validateConversationHistory(conv);
  if (archivedWeb(conv)) conversationReads.set(conv, { base: structuredClone(conv.messages), total: conv.history?.total || 0, flag: JSON.stringify(conv.flag ?? null), operation: null });
  return conv;
}
export async function saveConversation(conv, options = {}) {
  if (conv.tenantIdentity !== undefined) {
    const current = await atomicUpdate('clients', conv.slug, row => ({ result: row }));
    if (!supportedWorkspace(current) || workspaceTenant(current) !== conv.tenantIdentity || !belongsToWorkspace(current, conv)) throw new WorkspaceIdentityError();
  }
  if (archivedWeb(conv)) {
    const workspace=await currentConversationWorkspace(conv);
    if(!['testing','live','paused'].includes(workspace.status))historyError('conversation_closed','This conversation is read-only. Its saved history is kept.');
    const read = conversationReads.get(conv);
    if (!read || conv.messages.length < read.base.length || JSON.stringify(conv.messages.slice(0, read.base.length)) !== JSON.stringify(read.base)) historyError('conversation_changed', 'Saved messages cannot be replaced. Reload the conversation before adding another reply.');
    let delta = conv.messages.slice(read.base.length);
    if (read.operation?.inputMessage) {
      if (delta[0]?.role !== 'user' || delta[0]?.content !== read.operation.inputMessage.content) historyError('conversation_turn_conflict','The saved turn belongs to a different message.');
      delta = delta.slice(1);
    }
    await ensureConversationHistory(conv);
    let saved;
    if (delta.length) {
      const operation = read.operation || { batchId: digestConversation(['append-v1', read.total, read.base, delta]), inputHash: null };
      if (read.pendingDigest && read.pendingDigest !== digestConversation(delta)) historyError('conversation_turn_conflict','A reply is awaiting confirmation. Check the original saved turn first.');
      read.pendingDigest = digestConversation(delta);
      const entry = await writeBatch(conv, operation.batchId, delta, operation.inputHash, options.output || null);
      saved = await appendArchivedBatch(conv, entry, conv.websiteSetupCheck ? { websiteSetupCheck: conv.websiteSetupCheck } : {});
    }
    if (JSON.stringify(conv.flag ?? null) !== read.flag) saved = await atomicUpdate('conversations', conversationPath(conv), async current => {
      const workspace=await currentConversationWorkspace(conv); validateConversationHistory(current);
      if(!['testing','live','paused'].includes(workspace.status))historyError('conversation_closed','This conversation is read-only. Its saved history is kept.');
      return { value: { ...current, flag: conv.flag ?? null, updatedAt: now() }, result: current };
    });
    if (saved) { conv.messages = structuredClone(saved.messages); conv.history = structuredClone(saved.history); }
    conversationReads.set(conv, { base: structuredClone(conv.messages), total: conv.history?.total || 0, flag: JSON.stringify(conv.flag ?? null), operation: null });
    return conv;
  }
  conv.updatedAt = now();
  conv.messages = conv.messages.slice(-40);
  const path = conv.tenantIdentity === undefined ? convKey(conv.slug, conv.channel, conv.contact) : `${conv.slug}/${conv.tenantIdentity}/${conv.channel}/${conv.contact}`;
  return put("conversations", path, conv);
}

// Website history is separate from the model's bounded context. Immutable batches are
// written before their CAS locator; a durable turn identity reconciles a lost head response.
const CONVERSATION_BATCH_LIMIT = 2000, CONVERSATION_PENDING_LIMIT = 20;
const conversationReads = new WeakMap();
const digestConversation = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class ConversationHistoryError extends Error {
  constructor(code, message, status = 409) { super(message); Object.assign(this, { code, status }); }
}
const historyError = (code, message, status = 409) => { throw new ConversationHistoryError(code, message, status); };
const archivedWeb = conv => conv?.channel === 'web' && /^[a-f0-9]{64}$/.test(conv?.tenantIdentity || '');
export const conversationReference = (client, channel, contact) => digestConversation([workspaceTenant(client), channel, contact]);
const conversationPath = conv => `${conv.slug}/${conv.tenantIdentity}/${conv.channel}/${conv.contact}`;
const batchPath = (conv, batchId) => `${conv.slug}/${conv.tenantIdentity}/${digestConversation([conv.channel, conv.contact])}/${batchId}`;
function validateConversationHistory(conv) {
  const h = conv.history;
  if (!h || h.version !== 1 || !Array.isArray(h.entries) || h.entries.length > CONVERSATION_BATCH_LIMIT || !Array.isArray(h.pending) || h.pending.length > CONVERSATION_PENDING_LIMIT || typeof h.complete !== 'boolean' || !Number.isInteger(h.total) || h.total < 0 || h.entries.some(row => !/^[a-f0-9]{64}$/.test(row.id || '') || !/^[a-f0-9]{64}$/.test(row.digest || '') || !Number.isInteger(row.count) || row.count < 1 || row.count > 40) || h.entries.reduce((n, row) => n + row.count, 0) !== h.total || new Set(h.entries.map(row => row.id)).size !== h.entries.length || h.pending.some(row => !/^[a-f0-9]{64}$/.test(row.id || '') || !/^[a-f0-9]{64}$/.test(row.inputHash || ''))) historyError('conversation_history_unavailable', 'This saved conversation needs checking. Please contact support.', 503);
  return h;
}
async function currentConversationWorkspace(conv) {
  const current = await atomicUpdate('clients', conv.slug, row => ({ result: row }));
  if (!supportedWorkspace(current) || workspaceTenant(current) !== conv.tenantIdentity || !belongsToWorkspace(current, conv)) throw new WorkspaceIdentityError();
  return current;
}
function validBatch(conv, entry, row) {
  if (!row || row.version !== 1 || row.tenantIdentity !== conv.tenantIdentity || row.slug !== conv.slug || row.channel !== conv.channel || row.contact !== conv.contact || row.id !== entry.id || !Array.isArray(row.messages) || row.messages.length !== entry.count || digestConversation({ messages: row.messages, inputHash: row.inputHash || null, output: row.output || null }) !== entry.digest) historyError('conversation_history_unavailable', 'Part of this saved conversation could not be read. Try again; its saved history is kept.', 503);
  return row;
}
async function writeBatch(conv, batchId, messages, inputHash = null, output = null) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 40 || messages.some(row => !['user', 'assistant'].includes(row?.role) || typeof row.content !== 'string') || Buffer.byteLength(JSON.stringify({messages, output})) > 65536) historyError('conversation_turn_too_large', 'This conversation turn is too large to save safely. Please contact the shop directly.', 413);
  const batch = { version: 1, slug: conv.slug, tenantIdentity: conv.tenantIdentity, channel: conv.channel, contact: conv.contact, id: batchId, messages, inputHash, output };
  const entry = { id: batchId, count: messages.length, digest: digestConversation({ messages, inputHash, output }) };
  await atomicUpdate('conversation_history', batchPath(conv, batchId), previous => {
    if (previous) { validBatch(conv, entry, previous); return {}; }
    return { value: batch };
  });
  return entry;
}
async function ensureConversationHistory(conv) {
  await currentConversationWorkspace(conv);
  return atomicUpdate('conversations', conversationPath(conv), async saved => {
    if (saved && (!belongsToWorkspace(await currentConversationWorkspace(conv), saved) || saved.channel !== conv.channel || saved.contact !== conv.contact)) throw new WorkspaceIdentityError();
    if (saved?.history) { validateConversationHistory(saved); return { result: saved }; }
    const messages = saved?.messages || [], entries = [];
    if (messages.length) entries.push(await writeBatch(conv, digestConversation(['retained-prefix', messages]), messages));
    const value = { ...(saved || { slug: conv.slug, tenantIdentity: conv.tenantIdentity, channel: conv.channel, contact: conv.contact, createdAt: conv.createdAt || now(), messages: [] }), history: { version: 1, complete: !saved, entries, total: messages.length, pending: [] } };
    return { value, result: value };
  });
}
async function appendArchivedBatch(conv, entry, metadata = {}) {
  await currentConversationWorkspace(conv);
  const batch = validBatch(conv, entry, await atomicUpdate('conversation_history', batchPath(conv, entry.id), row => ({ result: row })));
  return atomicUpdate('conversations', conversationPath(conv), async saved => {
    const current = await currentConversationWorkspace(conv);
    if (!saved || !belongsToWorkspace(current, saved)) throw new WorkspaceIdentityError();
    const h = validateConversationHistory(saved), found = h.entries.find(row => row.id === entry.id);
    if (found) { if (found.digest !== entry.digest) historyError('conversation_turn_conflict', 'This saved turn has different content. Check its saved result before continuing.'); return { result: saved }; }
    if (!['testing', 'live'].includes(current.status)) historyError('conversation_closed', 'This conversation is read-only. Its saved history is kept.');
    if (h.entries.length >= CONVERSATION_BATCH_LIMIT) historyError('conversation_history_full', 'This conversation has reached its saved history limit. Please start a new conversation or contact the shop directly.');
    const value = { ...saved, ...metadata, updatedAt: now(), messages: [...saved.messages, ...batch.messages].slice(-40), history: { ...h, total: h.total + entry.count, entries: [...h.entries, entry], pending: h.pending.filter(row => row.id !== entry.id) } };
    return { value, result: value };
  });
}
// The caller supplies the same random turnId on recovery, never a hash of the customer's
// text: two legitimate identical questions remain two separate occurrences.
export async function beginConversationTurn(conv, turnId, input, {recoverOnly = false} = {}) {
  if (!archivedWeb(conv) || !/^[a-f0-9]{32}$/.test(turnId || '')) historyError('invalid_conversation_turn', 'Refresh the website chat before sending another message.', 400);
  const batchId = digestConversation(['website-turn-v1', turnId]), inputHash = digestConversation(input);
  const workspace=await currentConversationWorkspace(conv);
  if(!recoverOnly&&!['testing','live'].includes(workspace.status))historyError('conversation_closed','This conversation is read-only. Its saved history is kept.');
  const head=recoverOnly?await atomicUpdate('conversations',conversationPath(conv),row=>({result:row})):await ensureConversationHistory(conv);
  if(recoverOnly&&!head?.history)historyError('conversation_turn_not_found','No completed reply is saved for this message. Contact the shop before sending it again.');
  const h = validateConversationHistory(head);
  const entry = h.entries.find(row => row.id === batchId), pending = h.pending.find(row => row.id === batchId);
  if (entry) {
    const batch = validBatch(conv, entry, await atomicUpdate('conversation_history', batchPath(conv, batchId), row => ({ result: row })));
    if (batch.inputHash !== inputHash || !batch.output) historyError('conversation_turn_conflict', 'That turn identifier belongs to a different message. Check the saved conversation.');
    return { completed: true, output: batch.output };
  }
  if (pending) {
    if (pending.inputHash !== inputHash) historyError('conversation_turn_conflict', 'That turn identifier belongs to a different message. Check the saved conversation.');
    const batch = await atomicUpdate('conversation_history', batchPath(conv, batchId), row => ({ result: row }));
    if (batch) {
      const recoveredEntry = { id: batchId, count: batch.messages?.length, digest: digestConversation({messages: batch.messages, inputHash: batch.inputHash || null, output: batch.output || null}) };
      validBatch(conv, recoveredEntry, batch);
      if (batch.inputHash !== inputHash || !batch.output) historyError('conversation_turn_conflict', 'The saved reply needs checking before this message can continue.');
      await appendArchivedBatch(conv, recoveredEntry);
      return { completed: true, output: batch.output };
    }
    historyError('conversation_turn_uncertain', 'The earlier reply may still be processing. Do not send the same request again; contact the shop if you need help.');
  }
  if(h.pending.length)historyError('conversation_previous_unconfirmed','A previous reply is unconfirmed. Check its saved answer before sending another request.');
  if(recoverOnly)historyError('conversation_turn_not_found','This message was not admitted. No reply or request was submitted by this turn.');
  const inputId=digestConversation(['website-input-v1',turnId]);
  if(h.entries.some(row=>row.id===inputId))historyError('conversation_turn_uncertain','The earlier message was received, but its reply could not be confirmed. Contact the shop before sending the same request again.');
  if(h.entries.length+h.pending.length+2>CONVERSATION_BATCH_LIMIT||h.pending.length>=CONVERSATION_PENDING_LIMIT)historyError('conversation_history_full','This conversation needs checking before another message can be sent. Please contact the shop directly.');
  const priorInput=await atomicUpdate('conversation_history',batchPath(conv,inputId),row=>({result:row}));
  if(priorInput&&(priorInput.inputHash!==inputHash||priorInput.messages?.length!==1||priorInput.messages[0].content!==input.content))historyError('conversation_turn_conflict','This turn identifier belongs to a different message.');
  const inputMessage=priorInput?priorInput.messages[0]:{role:'user',content:input.content,at:now()},inputEntry={...await writeBatch(conv,inputId,[inputMessage],inputHash),completionId:batchId};
  await atomicUpdate('conversations', conversationPath(conv), async saved => {
    const current = await currentConversationWorkspace(conv), history = validateConversationHistory(saved);
    if (!['testing','live'].includes(current.status)) historyError('conversation_closed', 'This conversation is read-only. Its saved history is kept.');
    if (history.entries.some(row => row.id === batchId || row.id === inputId) || history.pending.some(row => row.id === batchId)) historyError('conversation_turn_uncertain', 'This message is already processing. Check its saved result before continuing.');
    if(history.pending.length)historyError('conversation_previous_unconfirmed','A previous reply is unconfirmed. Check its saved answer before sending another request.');
    if (history.entries.length + history.pending.length + 2 > CONVERSATION_BATCH_LIMIT || history.pending.length >= CONVERSATION_PENDING_LIMIT) historyError('conversation_history_full', 'This conversation needs checking before another message can be sent. Please contact the shop directly.');
    return { value: { ...saved, updatedAt:now(), messages:[...saved.messages,inputMessage].slice(-40), history: { ...history,total:history.total+1,entries:[...history.entries,inputEntry],pending: [...history.pending, {id: batchId, inputHash, at: now()}] } } };
  });
  const read = conversationReads.get(conv); if(!read)historyError('conversation_changed','Reload the saved conversation before continuing.');read.operation = { batchId, inputHash, inputMessage };
  return { completed: false };
}
export async function readConversationArchive(client, channel, contact) {
  if (!supportedWorkspace(client) || channel !== 'web' || !/^[a-zA-Z0-9_-]{1,60}$/.test(contact || '')) historyError('invalid_conversation', 'Choose a saved website conversation.', 400);
  await assertCurrentWorkspace(client);
  const conv = await atomicUpdate('conversations', convKey(client, channel, contact), row => ({ result: row }));
  if (!conv || !belongsToWorkspace(client, conv) || conv.channel !== channel || conv.contact !== contact) historyError('conversation_not_found', 'This saved conversation is not available.', 404);
  if (conv.history) validateConversationHistory(conv);
  return conv;
}
export async function readArchivedMessages(conv, start, end) {
  if (!conv.history) return (conv.messages || []).slice(start, end);
  const h = validateConversationHistory(conv);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > h.total || end - start > 2000) historyError('invalid_conversation_page', 'Reload this conversation before continuing.', 400);
  let offset = 0; const rows = [];
  for (const entry of h.entries) {
    const next = offset + entry.count;
    if (next > start && offset < end) {
      const batch = validBatch(conv, entry, await atomicUpdate('conversation_history', batchPath(conv, entry.id), row => ({ result: row })));
      rows.push(...batch.messages.slice(Math.max(0, start - offset), Math.min(entry.count, end - offset)).map(message=>entry.completionId&&!h.entries.some(row=>row.id===entry.completionId)?{...message,processing:'reply_unconfirmed'}:message));
    }
    offset = next;
    if (offset >= end) break;
  }
  return rows;
}

// ---- Leads, bookings, tasks, events ----
const RECORD_INDEX_LIMIT = 2000;
const recordIndexKey = (slug, tenant, kind) => `${slug}/${tenant}/${kind}`;
function explicitRecordTenant(record) {
  const values = [record?.tenantIdentity, record?.delivery?.tenantIdentity].filter(value => value !== undefined);
  return values.length && values.every(value => /^[a-f0-9]{64}$/.test(value) && value === values[0]) ? values[0] : null;
}
// Reserve the locator before the primary record write; an orphan is visible as incomplete,
// while an accepted new record can never be hidden behind a different incarnation's old keys.
export async function indexWorkspaceRecord(kind, record) {
  const tenant = explicitRecordTenant(record);
  if (!tenant || typeof record.slug !== 'string' || typeof record.id !== 'string' || !record.id || !['bookings', 'leads', 'alerts', 'customers'].includes(kind)) return;
  await atomicUpdate('workspace_record_index', recordIndexKey(record.slug, tenant, kind), previous => {
    if (previous?.ids?.includes(record.id)) return {};
    const ids = [...(previous?.ids || []), record.id];
    return { value: { version: 1, tenantIdentity: tenant, kind, legacyScanned: previous?.legacyScanned || false, scanLimit: previous?.scanLimit || 0, incomplete: previous?.incomplete ?? true, retentionIncomplete: !!previous?.retentionIncomplete || ids.length > RECORD_INDEX_LIMIT, ids: ids.slice(-RECORD_INDEX_LIMIT) } };
  });
}
export async function boundedRecordKeys(kind, prefix, limit) {
  if (process.env.MC_MEMORY_STORE === '1') {
    const keys = (await store(kind).list({ prefix: safe(prefix) })).blobs.map(row => unsafe(row.key)).sort();
    return { keys: keys.slice(0, limit), incomplete: keys.length > limit };
  }
  // The installed SDK's default list collects all pages. Explicit pagination bounds metadata
  // to at most two requests, and strong record reads to the requested limit.
  const iterator = store(kind).list({ prefix: safe(prefix), paginate: true })[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) return { keys: [], incomplete: false };
  const firstKeys = first.value.blobs.map(row => unsafe(row.key)).sort();
  const next = await iterator.next();
  return { keys: firstKeys.slice(0, limit), incomplete: firstKeys.length > limit || !next.done };
}
// Complete conversation downloads must not inherit listJSON's truncating preview
// semantics. The bounded metadata scan refuses an incomplete head census before
// reading bodies; every head must still match its exact current tenant path.
export async function conversationHeadsForExport(client) {
  await assertCurrentWorkspace(client);
  if(!supportedWorkspace(client))historyError('invalid_conversation','Use the supported owner export.',400);
  const prefix=`${client.slug}/${workspaceTenant(client)}/`,scan=await boundedRecordKeys('conversations',prefix,2000);
  if(scan.incomplete)historyError('history_incomplete','A complete conversation download cannot be confirmed within this export limit. Read saved conversations in Inbox or contact support.',503);
  const rows=await Promise.all(scan.keys.map(path=>atomicUpdate('conversations',path,row=>({result:row}))));
  if(rows.some((row,i)=>!row||!belongsToWorkspace(client,row)||typeof row.channel!=='string'||typeof row.contact!=='string'||convKey(client,row.channel,row.contact)!==scan.keys[i]))historyError('history_incomplete','Some saved conversation records need checking. Read the available history in Inbox or contact support before exporting.',503);
  await assertCurrentWorkspace(client);
  return rows;
}
export async function listWorkspaceRecords(client, kind, limit = 100) {
  if (Object.hasOwn(client || {}, 'onboarding') && !supportedWorkspace(client)) throw new WorkspaceIdentityError();
  if (!supportedWorkspace(client)) return { records: await listRecords(kind, client.slug, limit), listing: { source: 'legacy', limit, incomplete: false } };
  if (!Number.isInteger(limit) || limit < 1 || limit > RECORD_INDEX_LIMIT || !['bookings', 'leads', 'alerts', 'customers'].includes(kind)) throw new Error('Invalid workspace record listing');
  await assertCurrentWorkspace(client);
  const indexKey = recordIndexKey(client.slug, workspaceTenant(client), kind);
  let locator = await atomicUpdate('workspace_record_index', indexKey, row => ({ result: row }));
  if (!locator?.legacyScanned || locator.incomplete && (locator.scanLimit || 0) < limit) {
    const scan = await boundedRecordKeys(kind, client.slug + '/', limit);
    const old = (await Promise.all(scan.keys.map(path => atomicUpdate(kind, path, row => ({ result: row }))))).filter(row => row && typeof row.id === 'string' && belongsToWorkspace(client, row));
    locator = await atomicUpdate('workspace_record_index', indexKey, previous => {
      const ids = [...new Set([...old.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map(row => row.id), ...(previous?.ids || [])])];
      const value = { version: 1, tenantIdentity: workspaceTenant(client), kind, legacyScanned: true, scanLimit: limit, incomplete: scan.incomplete, retentionIncomplete: !!previous?.retentionIncomplete || ids.length > RECORD_INDEX_LIMIT, ids: ids.slice(-RECORD_INDEX_LIMIT) };
      return { value, result: value };
    });
  }
  const ids = locator.ids.slice(-limit).reverse();
  const records = (await Promise.all(ids.map(recId => atomicUpdate(kind, `${client.slug}/${recId}`, row => ({ result: row }))))).filter(row => row && typeof row.id === 'string' && belongsToWorkspace(client, row));
  await assertCurrentWorkspace(client);
  return { records, listing: { source: 'tenant_index', limit, incomplete: !!locator.incomplete || !!locator.retentionIncomplete || locator.ids.length > limit || records.length !== ids.length } };
}
export async function addRecord(kind, slug, data) {
  const rec = { id: id(5), slug, createdAt: now(), ...data };
  await indexWorkspaceRecord(kind, rec);
  await put(kind, `${slug}/${rec.id}`, rec);
  return rec;
}
export async function createRecordOnce(kind, slug, data) {
  await indexWorkspaceRecord(kind, { slug, ...data });
  return atomicUpdate(kind, `${slug}/${data.id}`, current => {
    if (current) return { result: current };
    const rec = { slug, createdAt: now(), ...data };
    return { value: rec, result: rec };
  });
}
export async function finishStableBookingWindow(target, bookingId, mutationId) {
  return atomicUpdate("index", capacityKey(target), state => {
    validateCapacity(target, state);
    const claim = state?.stableClaims?.[bookingId];
    if (!claim) return { result: false };
    if (claim.token !== mutationId || state.mutations?.[bookingId] !== mutationId) throw new Error("Booking recovery identity mismatch");
    const next = structuredClone(state);
    next.reservations[bookingId] = claim.slot ? [claim.slot] : [];
    delete next.mutations[bookingId]; delete next.stableClaims[bookingId];
    return { value: next, result: true };
  });
}
export const getRecord = (kind, slug, recId) => get(kind, `${slug}/${recId}`);
export async function saveRecord(kind, rec, { capacityClaim } = {}) {
  await indexWorkspaceRecord(kind, rec);
  if (kind !== 'bookings') return put(kind, `${rec.slug}/${rec.id}`, { ...rec, updatedAt: now() });
  const current = await getClient(rec.slug);
  const tenant = explicitRecordTenant(rec);
  // A stale tagged booking must never reserve or release the replacement's capacity.
  if (tenant && (!supportedWorkspace(current) || !belongsToWorkspace(current, rec))) throw new WorkspaceIdentityError();
  if (supportedWorkspace(current) && !tenant) throw new WorkspaceIdentityError();
  const target = current || { slug: rec.slug }, owned = !!capacityClaim;
  await assertCurrentWorkspace(target);
  const claim = capacityClaim || (ACTIVE_BOOKINGS.has(rec.status)
    ? await reserveBookingWindow(target, rec.id, rec.date, rec.window, undefined, { requireExisting: true })
    : await lockBookingWindow(target, rec.id));
  if (claim.full) throw new Error('Booking window is full; reload it and retry');
  if (claim.tenantIdentity && claim.tenantIdentity !== tenant) throw new WorkspaceIdentityError();
  await atomicUpdate('index', capacityKey(target), state => {
    if (state?.mutations?.[rec.id] !== claim.token) throw new Error('Booking mutation ownership lost');
    return {};
  });
  await assertCurrentWorkspace(target);
  const saved = await put(kind, `${rec.slug}/${rec.id}`, { ...rec, updatedAt: now() });
  if (!owned) await finishBookingWindow(target, rec.id, claim);
  return saved;
}
export const listRecords = (kind, slug, limit) => listJSON(kind, slug + "/", limit);

const ACTIVE_BOOKINGS = new Set(["booked", "confirmed", "on_the_way"]);
const bookingSlot = (date, window) => date && window ? `${normalizeDate(date)}|${canonicalWindow(window)}` : "";
export const capacityKey = target => typeof target === 'string' ? `capacity:${target}` : supportedWorkspace(target) ? `capacity:${target.slug}:${workspaceTenant(target)}` : `capacity:${target.slug}`;
function validateCapacity(target, state) {
  if (state && supportedWorkspace(target) && state.tenantIdentity !== workspaceTenant(target)) throw new WorkspaceIdentityError();
  return state;
}
const capacityLimit = (c) => Math.max(1, Number(c.rules?.windowCapacity) || 1);
async function initialCapacity(target) {
  const client = typeof target === 'string' ? null : target, slug = client ? client.slug : target;
  const reservations = {}, mutations = {}, stableClaims = {};
  let bookings;
  if (supportedWorkspace(client)) {
    const found = await listWorkspaceRecords(client, 'bookings', RECORD_INDEX_LIMIT);
    if (found.listing.incomplete) throw new Error('Booking history needs review before availability can be confirmed');
    bookings = found.records;
    const old = await atomicUpdate('index', `capacity:${slug}`, row => ({ result: row }));
    const byId = new Map(bookings.map(booking => [booking.id, booking]));
    if (Object.keys(old?.mutations || {}).length > RECORD_INDEX_LIMIT) throw new Error('Unconfirmed booking capacity needs review before availability can be confirmed');
    for (const [bookingId, token] of Object.entries(old?.mutations || {})) {
      const booking = byId.get(bookingId) || await atomicUpdate('bookings', `${slug}/${bookingId}`, row => ({ result: row }));
      if (!booking) throw new Error('Unconfirmed booking capacity needs review before availability can be confirmed');
      if (!belongsToWorkspace(client, booking)) continue;
      mutations[bookingId] = token;
      if (old.stableClaims?.[bookingId]) stableClaims[bookingId] = old.stableClaims[bookingId];
    }
    for (const booking of bookings) {
      const held = old?.reservations?.[booking.id];
      if (Array.isArray(held) && held.every(slot => typeof slot === 'string')) reservations[booking.id] = [...held];
    }
  } else {
    // Keep the legacy migration unchanged. Supported workspaces have a bounded, explicit
    // tenant record index and never adopt the old slug capacity or its unbound blocks.
    bookings = await Promise.all((await list('bookings', slug + '/')).map(key => store('bookings').get(safe(key), { type: 'json', consistency: 'strong' })));
  }
  for (const booking of bookings) {
    if (booking && ACTIVE_BOOKINGS.has(booking.status)) {
      const slot = bookingSlot(booking.date, booking.window);
      if (slot && !reservations[booking.id]) reservations[booking.id] = [slot];
    }
  }
  return { version: 1, reservations, mutations, ...(Object.keys(stableClaims).length ? { stableClaims } : {}), blocks: [], ...(supportedWorkspace(client) ? { tenantIdentity: workspaceTenant(client) } : {}) };
}
const blockedWindow = (state, date, window) => (state.blocks || []).some((b) => b.date === date && (!b.windowKey || b.windowKey === canonicalWindow(window)));
const reservedCount = (state, slot) => Object.values(state.reservations).filter((slots) => slots.includes(slot)).length;
function blockCount(state, date, windowKey) {
  return Object.values(state.reservations).filter((slots) => slots.some((slot) => windowKey ? slot === `${date}|${windowKey}` : slot.startsWith(date + "|"))).length;
}
function blockViews(state) {
  return (state.blocks || []).map((b) => ({ date: b.date, window: b.window, existingBookings: blockCount(state, b.date, b.windowKey) })).sort((a, b) => a.date.localeCompare(b.date) || a.window.localeCompare(b.window));
}
function openingsFromState(c, state, date, days, calendar = null, occupied = null, excludeBookingId = null) {
  const dates = Array.from({ length: days }, (_, n) => addDays(date, n)).filter(isoDateValid);
  return { timezone: "America/Chicago", from: date, days: dates.length, openings: dates.map((day) => {
    return { date: day, windows: listedWindows(c).filter((window) => !isElapsedWindow(day, window) && !blockedWindow(state, day, window) && (calendar?occupied(c,state,calendar,day,window,excludeBookingId):excludeBookingId?Object.entries(state.reservations).filter(([id,slots])=>id!==excludeBookingId&&slots.includes(bookingSlot(day,window))).length:reservedCount(state, bookingSlot(day, window))) < capacityLimit(c)) };
  }),...(calendar?{calendar:{checkedAt:new Date(calendar.checkedAt).toISOString(),freshForSeconds:60,scope:'Connected owned Google calendar and saved workspace reservations'}}:{}) };
}
export async function getAvailability(c, date, days, { excludeBookingId = null } = {}) {
  await assertCurrentWorkspace(c);
  const from = requestedDate(date);
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new AvailabilityInputError("invalid_days", "Check from 1 to 14 consecutive dates.");
  if (!isoDateValid(addDays(from, days - 1))) throw new AvailabilityInputError("invalid_days", "The entire checked range must use real YYYY-MM-DD dates.");
  const {calendarBusyProjection,assertCalendarBusyProjection,calendarOccupiedCount}=await import('./calendar-busy.mjs'),calendar=await calendarBusyProjection(c,from,days);
  return atomicUpdate("index", capacityKey(c), async (current) => {
    const state = validateCapacity(c, current) || await initialCapacity(c);
    await assertCalendarBusyProjection(c,calendar);
    return { ...(!current ? { value: state } : {}), result: openingsFromState(c, state, from, days,calendar,calendarOccupiedCount,excludeBookingId) };
  });
}
// Used immediately before Calendar create/move, with the same local capacity
// state as ordinary booking. Excluding this visit never excludes another owner.
export async function checkCalendarBookingWindow(c,date,window,bookingId,{accessToken,deadline}={}) {
  await assertCurrentWorkspace(c);
  const {calendarBusyProjection,assertCalendarBusyProjection,calendarOccupiedCount}=await import('./calendar-busy.mjs'),calendar=await calendarBusyProjection(c,date,1,{fresh:true,accessToken,deadline});
  return atomicUpdate('index',capacityKey(c),async current=>{const state=validateCapacity(c,current)||await initialCapacity(c);await assertCalendarBusyProjection(c,calendar,{fresh:true});return {...(!current?{value:state}:{}),result:!calendar||calendarOccupiedCount(c,state,calendar,date,window,bookingId)<capacityLimit(c)};});
}
// Browsing a calendar does not initialize capacity or certify free windows.
// Existing blocks live in this exact tenant state; absent state has no blocks.
export async function readSavedAvailabilityBlocks(c) {
  await assertCurrentWorkspace(c);
  return atomicUpdate('index', capacityKey(c), current => ({ result: current ? blockViews(validateCapacity(c, current)) : [] }));
}
export async function getAvailabilityBlocks(c) {
  await assertCurrentWorkspace(c);
  return atomicUpdate("index", capacityKey(c), async (current) => {
    const state = validateCapacity(c, current) || await initialCapacity(c);
    return { ...(!current ? { value: state } : {}), result: blockViews(state) };
  });
}
export async function setAvailabilityBlock(c, date, window = "", blocked = true) {
  await assertCurrentWorkspace(c);
  const day = requestedDate(date, { isoOnly: true, allowPast: !blocked });
  if (typeof window !== "string") throw new AvailabilityInputError("invalid_window", "Choose a listed window or the whole date.");
  const wholeDay = window === "";
  return atomicUpdate("index", capacityKey(c), async (current) => {
    const state = validateCapacity(c, current) || await initialCapacity(c);
    const blocks = state.blocks || [];
    const key = wholeDay ? "" : canonicalWindow(window);
    const existing = blocks.find((b) => b.date === day && b.windowKey === key);
    const label = wholeDay ? "" : listedWindow(c, window) || (!blocked && existing ? existing.window : "");
    if (!wholeDay && !label) throw new AvailabilityInputError("invalid_window", "Choose one of the shop's listed arrival windows.");
    let changed = false;
    if (blocked && !existing) {
      // Count all retained blocks, including past ones. Past blocks remain removable; nothing
      // expires or frees a reservation behind an owner's back.
      if (blocks.length >= 100) throw new AvailabilityInputError("too_many_blocks", "Remove an old block before adding another (100 maximum).");
      state.blocks = [...blocks, { date: day, window: label, windowKey: key }]; changed = true;
    } else if (!blocked && existing) { state.blocks = blocks.filter((b) => b !== existing); changed = true; }
    const existingBookings = blockCount(state, day, key);
    const notice = blocked && existingBookings ? `${existingBookings} already reserved visit${existingBookings === 1 ? " remains" : "s remain"} unchanged. This block stops new reservations.` : "";
    return { ...(changed || !current ? { value: state } : {}), result: { ok: true, availabilityBlocks: blockViews(state), existingBookings, notice } };
  });
}
export async function bookingWindowTaken(c, date, window) {
  await assertCurrentWorkspace(c);
  const slot = bookingSlot(date, window), capacity = capacityLimit(c);
  if (!slot) return { full: false, count: 0, capacity };
  return atomicUpdate("index", capacityKey(c), async (current) => {
    const state = validateCapacity(c, current) || await initialCapacity(c);
    const count = reservedCount(state, slot), blocked = blockedWindow(state, normalizeDate(date), window);
    return { ...(!current ? { value: state } : {}), result: { full: blocked || count >= capacity, count, capacity, ...(blocked ? { blocked: true } : {}) } };
  });
}
export async function reserveBookingWindow(c, bookingId, date, window, from, { requireExisting = false, mutationId = null } = {}) {
  await assertCurrentWorkspace(c);
  if (mutationId !== null && !/^[a-f0-9]{64}$/.test(mutationId)) throw new Error("Invalid booking mutation identity");
  let targetDate = date, targetWindow = window;
  if (!requireExisting) {
    try { targetDate = requestedDate(date); }
    catch (err) { if (!(err instanceof AvailabilityInputError)) throw err; return { full: true, reason: err.code, message: `Nothing was booked. ${err.message}` }; }
    targetWindow = listedWindow(c, window);
    if (!targetWindow) return { full: true, reason: "invalid_window", message: "Nothing was booked. That is not a listed arrival window. Check availability for a listed window." };
  }
  const slot = bookingSlot(targetDate, targetWindow), capacity = capacityLimit(c), token = mutationId || id(12);
  let calendar=null,calendarTools;
  if(!requireExisting) {
    calendarTools=await import('./calendar-busy.mjs');
    try{calendar=await calendarTools.calendarBusyProjection(c,targetDate,1,{fresh:true});}
    catch(error){if(!String(error.code||'').startsWith('calendar_'))throw error;return {full:true,reason:'calendar_unavailable',message:'Nothing was booked. Calendar availability could not be confirmed. Offer an owner callback instead of promising a window.'};}
  }
  return atomicUpdate("index", capacityKey(c), async (current) => {
    const state = validateCapacity(c, current) || await initialCapacity(c);
    state.mutations ||= {};
    if (state.mutations[bookingId]) {
      const prior = state.stableClaims?.[bookingId];
      if (mutationId && prior?.token === mutationId && prior.slot === slot) return { result: prior };
      throw new Error("Booking is being updated; reload it and retry");
    }
    const previous = state.reservations[bookingId] || [];
    // Ordinary updates must not resurrect a booking whose cancellation completed after the
    // caller read it. Only explicit creation/rescheduling may acquire a new reservation.
    if (requireExisting && !previous.includes(slot)) throw new Error("Booking changed; reload it before saving");
    if (from && (previous.length !== 1 || previous[0] !== bookingSlot(from.date, from.window))) throw new Error("Booking changed during reschedule; reload it and retry");
    if (!from && previous.length && !previous.includes(slot)) throw new Error("Booking changed; reload it before saving");
    if(!requireExisting){
      try{await calendarTools.assertCalendarBusyProjection(c,calendar,{fresh:true});}
      catch(error){if(!String(error.code||'').startsWith('calendar_'))throw error;return {result:{full:true,reason:'calendar_unavailable',message:'Nothing was booked. Calendar availability changed. Offer an owner callback or check again.'}};}
      if(calendar&&!previous.includes(slot)&&calendarTools.calendarOccupiedCount(c,state,calendar,targetDate,targetWindow,bookingId)>=capacity)return {...(!current?{value:state}:{}),result:{full:true,reason:'calendar_conflict',message:'Nothing was booked. That arrival window conflicts with the connected calendar or another saved visit. Check another window or offer an owner callback.'}};
    }
    if (!previous.includes(slot) && isElapsedWindow(targetDate, targetWindow)) return { ...(!current ? { value: state } : {}), result: { full: true, reason: "elapsed", availability: openingsFromState(c, state, targetDate, calendar?1:7, calendar, calendarTools?.calendarOccupiedCount) } };
    if (!previous.includes(slot) && blockedWindow(state, targetDate, targetWindow)) return { ...(!current ? { value: state } : {}), result: { full: true, reason: "blocked", message: "Nothing was booked. That date or window is unavailable. Check availability for another option.", availability: openingsFromState(c, state, targetDate, calendar?1:7, calendar, calendarTools?.calendarOccupiedCount) } };
    const count = slot ? Object.entries(state.reservations).filter(([id, slots]) => id !== bookingId && slots.includes(slot)).length : 0;
    if (slot && !previous.includes(slot) && count >= capacity) return { ...(!current ? { value: state } : {}), result: { full: true, reason: "full", count, capacity, availability: openingsFromState(c, state, targetDate, calendar?1:7, calendar, calendarTools?.calendarOccupiedCount) } };
    // A move holds both windows until its booking write succeeds. A crash therefore blocks spare
    // capacity instead of freeing a slot while an active booking still points at it.
    const next = slot && !previous.includes(slot) ? [...previous, slot] : previous;
    if (next.length) state.reservations[bookingId] = next;
    state.mutations[bookingId] = token;
    const claim = { token, slot, previous, next, date: targetDate, window: targetWindow, ...(supportedWorkspace(c) ? { tenantIdentity: workspaceTenant(c) } : {}) };
    if (mutationId) { state.stableClaims ||= {}; state.stableClaims[bookingId] = claim; }
    return { value: state, result: claim };
  });
}
export async function finishBookingWindow(target, bookingId, claim) {
  if (claim.tenantIdentity && (!supportedWorkspace(target) || claim.tenantIdentity !== workspaceTenant(target))) throw new WorkspaceIdentityError();
  await atomicUpdate("index", capacityKey(target), (state) => {
    validateCapacity(target, state);
    if (state?.mutations?.[bookingId] !== claim.token || JSON.stringify(state.reservations[bookingId] || []) !== JSON.stringify(claim.next)) throw new Error("Booking reservation changed before completion");
    const slots = claim.release || !claim.slot ? [] : [claim.slot];
    if (slots.length) state.reservations[bookingId] = slots; else delete state.reservations[bookingId];
    delete state.mutations[bookingId];
    if (state.stableClaims) delete state.stableClaims[bookingId];
    return { value: state };
  });
}
async function lockBookingWindow(target, bookingId) {
  if (typeof target !== 'string') await assertCurrentWorkspace(target);
  const token = id(12);
  return atomicUpdate("index", capacityKey(target), async (current) => {
    const state = validateCapacity(target, current) || await initialCapacity(target);
    state.mutations ||= {};
    if (state.mutations[bookingId]) throw new Error("Booking is being updated; reload it and retry");
    const previous = state.reservations[bookingId] || [];
    state.mutations[bookingId] = token;
    return { value: state, result: { token, release: true, previous, next: previous, ...(supportedWorkspace(target) ? { tenantIdentity: workspaceTenant(target) } : {}) } };
  });
}

// Per-phone index: "bookings:<slug>:<phone>" and "leads:<slug>:<phone>" hold the record ids for that number,
// so the hot paths (every inbound text, every call) read a handful of records instead of listing the history.
export const phoneIndexKey = (kind, target, phone) => typeof target === 'string' ? `${kind}:${target}:${phone}` : supportedWorkspace(target) ? `${kind}:${target.slug}:${workspaceTenant(target)}:${phone}` : `${kind}:${target.slug}:${phone}`;
export async function addToIndex(kind, target, phone, recId) {
  if (!phone) return;
  await atomicUpdate('index', phoneIndexKey(kind, target, phone), previous => {
    const ids = Array.isArray(previous) ? previous : [];
    return ids.includes(recId) ? {} : { value: [...ids, recId].slice(-100) };
  });
}
export async function recordsFor(kind, target, phone) {
  if (!phone) return [];
  const scoped = supportedWorkspace(target), slug = typeof target === 'string' ? target : target.slug;
  if (scoped) await assertCurrentWorkspace(target);
  const key = phoneIndexKey(kind, target, phone);
  const ids = (scoped ? await atomicUpdate('index', key, row => ({ result: row })) : await get('index', key)) || [];
  let records = (await Promise.all(ids.map(recId => scoped ? atomicUpdate(kind, `${slug}/${recId}`, row => ({ result: row })) : getRecord(kind, slug, recId)))).filter(row => row && (!scoped || belongsToWorkspace(target, row)));
  // Recover proven current pre-index records without consulting a foreign phone index.
  if (scoped && !ids.length) records = (await listWorkspaceRecords(target, kind, 100)).records.filter(row => row.phone === phone);
  if (scoped) await assertCurrentWorkspace(target);
  return records;
}
const inboundKey = target => typeof target === 'string' ? 'lastInbound:' + target : supportedWorkspace(target) ? `lastInbound:${target.slug}:${workspaceTenant(target)}` : 'lastInbound:' + target.slug;
export async function noteInbound(target, kind = 'text') {
  const scoped = supportedWorkspace(target);
  await atomicUpdate('health', inboundKey(target), previous => {
    if (scoped && previous && !belongsToWorkspace(target, previous)) throw new WorkspaceIdentityError();
    const at = now(), value = { ...(previous || {}), at, [kind === 'call' ? 'call' : 'text']: at, ...(scoped ? { slug: target.slug, tenantIdentity: workspaceTenant(target) } : {}) };
    return { value };
  });
}
export async function lastInbound(target) {
  const row = await get('health', inboundKey(target));
  return supportedWorkspace(target) && row && !belongsToWorkspace(target, row) ? null : row;
}

// Tasks are keyed by due time so the scheduler can list what is due.
export async function scheduleTask(slug, dueAt, type, data) {
  const due = new Date(dueAt).toISOString();
  const rec = { id: id(5), slug, type, dueAt: due, data, createdAt: now() };
  await put("tasks", `${due}_${rec.id}`, rec);
  return rec;
}
export async function dueTasks(beforeISO) {
  const keys = (await list("tasks", "")).filter((k) => k.slice(0, 24) <= beforeISO);
  const items = await Promise.all(keys.map(async (k) => ({ key: k, task: await get("tasks", k) })));
  return items.filter((i) => i.task);
}
export async function cancelTasks(slug, predicate) {
  const keys = await list("tasks", "");
  for (const k of keys) {
    const t = await get("tasks", k);
    if (t && t.slug === slug && predicate(t)) await del("tasks", k);
  }
}
export async function cancelTasksForNumber(e164Number) {
  const keys = await list("tasks", "");
  let n = 0;
  for (const k of keys) {
    const t = await get("tasks", k);
    if (!t) continue;
    const rec = t.data?.bookingId ? await get("bookings", `${t.slug}/${t.data.bookingId}`) : t.data?.leadId ? await get("leads", `${t.slug}/${t.data.leadId}`) : null;
    if (rec && rec.phone === e164Number) { await del("tasks", k); n++; }
  }
  return n;
}
export async function logEvent(target, type, data = {}) {
  const client = typeof target === 'string' ? null : target, slug = client ? client.slug : target;
  if (client && Object.hasOwn(client, 'onboarding') && !supportedWorkspace(client)) throw new WorkspaceIdentityError();
  const tenantIdentity = supportedWorkspace(client) ? workspaceTenant(client) : null;
  const rec = { id: id(4), slug, type, data, at: now(), ...(tenantIdentity ? { tenantIdentity } : {}) };
  await put("events", `${slug}/${tenantIdentity ? tenantIdentity + '/' : ''}${rec.at}_${rec.id}`, rec);
  return rec;
}
