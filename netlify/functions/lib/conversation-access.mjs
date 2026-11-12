// Website chat conversation binding. The visitor-supplied contact id only names a conversation; reading its
// history into the model, or appending to it, also needs a conversation token the server issued to the browser
// that started it (or, for a pre-token conversation, the bounded legacy window below).
//
// Storage: a random 256-bit token per conversation, kept only as its SHA-256 in a "conversation_access" row keyed
// exactly like the conversation (convKey: slug/tenant/channel/contact, so a replaced workspace incarnation never
// inherits a binding). No signing secret is involved: production, previews and the memory store behave the same.
//
// Policy for an ordinary website turn (decided before any history is read into model context):
//   bound     row exists and the presented token matches one of its hashes      -> load history, append
//   fresh     no row, no stored history                                          -> new token, claimed after admission
//   legacy    no row, the visitor's last message (newest user-message `at`; owner flags, the nightly auto-flag and
//             admin writes never count) is within the grace window (and not more than CLOCK_SKEW_MS in the future): the conversation is opened for tokenless
//             (pre-token widget) turns for at most the grace window from its first post-deploy admitted turn, and
//             only for the network client that opened it (a domain-separated SHA-256 of slug/tenant/contact and
//             context.ip, as lib/sales-budget.mjs keys its IP buckets; never the raw address). One first claim wins
//             a concurrent race; a matching token presented later closes the window early and clears the digest.
//             Tokenless turns never evict a token: once a row holds MAX_TOKENS a continuation is answered without
//             a new token, and a turnId-proven recovery returns its saved reply without one.
//   mismatch  anything else, including a tokenless turn from another network client while a window is open
//             (reason 'legacy_client'), or one that would open a window but has no platform client address
//             (reason 'no_client_ip'): chat.mjs answers both with the reload notice, never a fork. chat.mjs then
//             never loads or appends to the presented conversation (see chat.mjs).
// Every write happens only after the turn is admitted (AI allowance), so refused turns write nothing here.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { atomicUpdate, convKey, now } from './store.mjs';

export const ACCESS_HEADER_CONTACT = 'X-MC-Contact';
export const ACCESS_HEADER_TOKEN = 'X-MC-Conversation-Token';
const TOKEN = /^[a-f0-9]{64}$/, TURN = /^[a-f0-9]{32}$/;
const DEFAULT_LEGACY_GRACE_MINUTES = 30;
const MAX_TOKENS = 4;      // a conversation's token hashes (first turn, turnId-proven recoveries, legacy turns); never evicted
export const FORK_LIMIT = 1; // forked conversations started from one presented conversation (bounds owner-inbox growth)

// MC_CHAT_LEGACY_GRACE_MINUTES: 0 disables the legacy window (tokenless history is never loaded); default 30; max 1440.
export function legacyGraceMs() {
  const raw = process.env.MC_CHAT_LEGACY_GRACE_MINUTES;
  const minutes = raw === undefined || raw === '' ? DEFAULT_LEGACY_GRACE_MINUTES : Number(raw);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.min(minutes, 1440) * 60000 : DEFAULT_LEGACY_GRACE_MINUTES * 60000;
}
const digest = token => createHash('sha256').update(token).digest('hex');
const turnDigest = turnId => createHash('sha256').update('fork-turn-v1:' + turnId).digest('hex');
const sameDigest = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === 64 && b.length === 64 && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
const hashesOf = row => Array.isArray(row?.tokenHashes) ? row.tokenHashes : [];
const legacyOpen = (row, at) => !!row?.legacyUntil && at < Date.parse(row.legacyUntil);
// The network client that may continue an open legacy window. Empty or malformed addresses never match. Rev 5 (QA09 r4):
// an address that is only whitespace (any Unicode space, including NBSP and U+3000) or contains any control character
// (C0, DEL or C1, e.g. U+0085) is treated exactly like no address: the reload notice, no window, no fork.
const validIp = ip => typeof ip === 'string' && ip.length <= 128 && !/\p{Cc}/u.test(ip) && ip.trim() !== '';
const legacyClient = (client, channel, contact, ip) => createHash('sha256').update('mc-chat-legacy-client-v1\0' + accessKey(client, channel, contact) + '\0' + ip.trim()).digest('hex');
const sameLegacyClient = (row, client, channel, contact, ip) => validIp(ip) && sameDigest(row?.legacyClient, legacyClient(client, channel, contact, ip));
export const newConversationToken = () => randomBytes(32).toString('hex');
export const newWebContact = () => 'w' + randomBytes(16).toString('hex');
export const validTurnId = turnId => typeof turnId === 'string' && TURN.test(turnId);
export function hasHistory(conv) {
  return !!conv && ((Array.isArray(conv.messages) && conv.messages.length > 0) || (Number.isInteger(conv.history?.total) && conv.history.total > 0) || (Array.isArray(conv.history?.pending) && conv.history.pending.length > 0));
}
// Last visitor activity only: the newest `at` among stored user messages. updatedAt is also bumped by owner flag/unflag,
// the nightly autoFlagDay and admin writes, which must never reopen a pre-token conversation. No `at` = never active.
// Admin put_conversation (rev 4) marks the web user messages it writes `source: 'admin'` (never visitor activity) and
// carries the conversation's previous visitor activity in `visitorActivityAt`, so an operator write neither opens nor
// extends a window.
export function lastActivity(conv) {
  let at = Date.parse(typeof conv?.visitorActivityAt === 'string' ? conv.visitorActivityAt : '');
  if (!Number.isFinite(at)) at = 0;
  for (const message of Array.isArray(conv?.messages) ? conv.messages : []) {
    if (message?.role !== 'user') continue;
    if (message.source === 'admin') continue;
    const t = Date.parse(message.at || '');
    if (Number.isFinite(t) && t > at) at = t;
  }
  return at;
}
// Rev 6 (QA09 r5 C1, 9601528b's stricter bound): visitor activity dated more than CLOCK_SKEW_MS after `at` is not recent
// activity (operator-supplied or skewed times), so it never opens a legacy window; a small skew between instances is allowed.
export const CLOCK_SKEW_MS = 120000;
const legacyAge = (conv, at) => at - lastActivity(conv);
const withinLegacyWindow = (conv, at) => { const age = legacyAge(conv, at); return legacyGraceMs() > 0 && Number.isFinite(age) && age >= -CLOCK_SKEW_MS && age <= legacyGraceMs(); };
const readRow = (kind, key) => atomicUpdate(kind, key, current => ({ result: current }));
const accessKey = (client, channel, contact) => convKey(client, channel, contact);
const tokenRow = (client, channel, contact, token, reason, extra = {}) => ({ version: 2, slug: client.slug, channel, contact, tokenHashes: [digest(token)], reason, at: now(), ...extra });
// Creates the row only if none exists. True on success, false if another request holds it.
const claimNew = (client, channel, contact, value) => atomicUpdate('conversation_access', accessKey(client, channel, contact), row => row ? { result: false } : { value, result: true });

// `conv` is the stored conversation for the presented contact; `ip` is the platform-supplied network client
// (context.ip only, never a request header: chat.mjs). Returns { state, contact, token, claimed } (mismatch may carry
// reason: 'legacy_client' or 'no_client_ip').
export async function bindWebConversation(client, channel, contact, conv, presented, { at = Date.now(), ip = '' } = {}) {
  const tokenless = presented === undefined || presented === null || presented === '';
  const token = typeof presented === 'string' && TOKEN.test(presented) ? presented : null;
  const row = await readRow('conversation_access', accessKey(client, channel, contact));
  if (row) {
    if (token && hashesOf(row).some(hash => sameDigest(hash, digest(token)))) return { state: 'bound', contact, token, claimed: true, closeLegacy: !!(row.legacyUntil || row.legacyClient) };
    if (tokenless && legacyOpen(row, at)) {
      if (!sameLegacyClient(row, client, channel, contact, ip)) return { state: 'mismatch', contact, token: null, claimed: false, reason: 'legacy_client' };
      return { state: 'legacy', contact, token: hashesOf(row).length < MAX_TOKENS ? newConversationToken() : null, claimed: false, continuing: true, ip };
    }
  } else if (!hasHistory(conv)) {
    return { state: 'fresh', contact, token: newConversationToken(), claimed: false };
  } else if (withinLegacyWindow(conv, at)) {
    // Rev 4 (QA09 r3 N1): no platform client address means no window and no fork: the reload notice (fail closed).
    if (!validIp(ip)) return { state: 'mismatch', contact, token: null, claimed: false, reason: 'no_client_ip' };
    return { state: 'legacy', contact, token: newConversationToken(), claimed: false, continuing: false, ip };
  }
  return { state: 'mismatch', contact, token: null, claimed: false };
}

// A fork moves a mismatched turn to a new 128-bit contact. At most FORK_LIMIT forks are started from one presented
// conversation, each remembered by the hash of the turnId that started it (so that browser's "Check previous reply"
// learns the turn ran elsewhere instead of being told nothing was submitted). Null when the limit is reached.
export async function forkWebConversation(client, channel, from, turnId) {
  if (!validTurnId(turnId)) return null;
  const row = await readRow('conversation_forks', accessKey(client, channel, from));
  if ((row?.forks || []).length >= FORK_LIMIT) return null;
  return { state: 'forked', contact: newWebContact(), token: newConversationToken(), claimed: false, from, turn: turnDigest(turnId) };
}
// The fork (if any) that the presented conversation's turnId was moved to: { contact } or null.
export async function forkedTurn(client, channel, from, turnId) {
  if (!validTurnId(turnId)) return null;
  const row = await readRow('conversation_forks', accessKey(client, channel, from));
  const found = (row?.forks || []).find(fork => fork.turn === turnDigest(turnId));
  return found ? { contact: found.contact } : null;
}

// Called after admission and before the turn's first durable write. Returns 'ok', 'lost' (another request claimed this
// contact first) or 'fork_limit' (the presented conversation already has its forks).
export async function claimWebConversation(client, channel, access, { at = Date.now() } = {}) {
  if (!access) return 'ok';
  const key = accessKey(client, channel, access.contact);
  if (access.state === 'bound') {
    // A matching token proves a token-capable widget holds this conversation: close any legacy window.
    if (access.closeLegacy) await atomicUpdate('conversation_access', key, row => row?.legacyUntil || row?.legacyClient ? { value: { ...row, legacyUntil: null, legacyClient: null, legacyClosedAt: row.legacyClosedAt || now() }, result: true } : { result: true });
    return 'ok';
  }
  if (access.claimed) return 'ok';
  let ok;
  if (access.state === 'fresh') ok = await claimNew(client, channel, access.contact, tokenRow(client, channel, access.contact, access.token, 'first_turn'));
  else if (access.state === 'legacy' && !access.continuing) ok = await claimNew(client, channel, access.contact, tokenRow(client, channel, access.contact, access.token, 'legacy_grace', { legacyUntil: new Date(at + legacyGraceMs()).toISOString(), legacyClient: legacyClient(client, channel, access.contact, access.ip) }));
  else if (access.state === 'legacy') {
    // Fixed window, same network client, and never an eviction: with no free slot the turn continues without a token.
    let issued = false;
    ok = await atomicUpdate('conversation_access', key, row => {
      issued = false;
      if (!legacyOpen(row, at) || !sameLegacyClient(row, client, channel, access.contact, access.ip)) return { result: false };
      if (!access.token || hashesOf(row).length >= MAX_TOKENS) return { result: true };
      issued = true;
      return { value: { ...row, tokenHashes: [...hashesOf(row), digest(access.token)] }, result: true };
    });
    if (ok && !issued) access.token = null;
  }
  else if (access.state === 'forked') {
    const recorded = await atomicUpdate('conversation_forks', accessKey(client, channel, access.from), row => {
      const forks = row?.forks || [];
      if (forks.length >= FORK_LIMIT) return { result: false };
      return { value: { version: 1, slug: client.slug, channel, contact: access.from, forks: [...forks, { turn: access.turn, contact: access.contact, at: now() }] }, result: true };
    });
    if (!recorded) return 'fork_limit';
    ok = await claimNew(client, channel, access.contact, tokenRow(client, channel, access.contact, access.token, 'fork', { from: access.from }));
  } else return 'lost';
  if (!ok) return 'lost';
  access.claimed = true;
  return 'ok';
}

// The exact 128-bit turnId of a completed turn proves the request comes from the browser that sent that turn (it is
// generated in the browser and never shown elsewhere). Its saved reply is returned by chat.mjs; this also gives that
// browser a token for the same conversation, so a visitor whose first response was lost keeps model context.
// Never evicts: on a row that already holds MAX_TOKENS it grants nothing (null) and chat.mjs returns the saved reply alone.
export async function grantRecoveredAccess(client, channel, contact) {
  const token = newConversationToken(), hash = digest(token);
  const granted = await atomicUpdate('conversation_access', accessKey(client, channel, contact), row => !row ? { value: tokenRow(client, channel, contact, token, 'recovered'), result: true } : hashesOf(row).length < MAX_TOKENS ? { value: { ...row, tokenHashes: [...hashesOf(row), hash] }, result: true } : { result: false });
  return granted ? { state: 'recovered', contact, token, claimed: true } : null;
}

export function accessHeaders(origin, access) {
  if (!access?.token || !access.claimed) return {};
  return { [ACCESS_HEADER_CONTACT]: access.contact, [ACCESS_HEADER_TOKEN]: access.token, ...(origin ? { 'Access-Control-Expose-Headers': `${ACCESS_HEADER_CONTACT}, ${ACCESS_HEADER_TOKEN}` } : {}) };
}
