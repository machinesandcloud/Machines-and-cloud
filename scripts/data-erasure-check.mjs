// Data erasure: registry completeness, complete workspace erasure, per-contact erasure (deletion of
// the contact's own records, redaction of mentions, resumability under injected storage faults),
// the operator API's authorization and guards, and the retention sweep. Memory store, fake model,
// physical networking denied; no provider requests.
//
// A loader hook (test only, applied in memory) lets this check read the in-process memory store and
// make one chosen storage write or delete fail, so interrupted runs are exercised on real code.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { register, syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const HOOK = `export async function load(url, context, nextLoad) {
  const out = await nextLoad(url, context);
  if (!url.endsWith('/netlify/functions/lib/store.mjs')) return out;
  let src = String(out.source);
  // Tolerates an outer harness that already exposed the memory Map as globalThis.__mcMemory.
  src = src.replace('const memory = (globalThis.__mcMemory ||= new Map());', 'const memory = new Map();');
  const parts = [['const memory = new Map();', 'const memory = (globalThis.__erasureMemory ||= (globalThis.__mcMemory ||= new Map()));'],
    ['async delete(key) { m.delete(key); }', 'async delete(key) { if (globalThis.__erasureFault?.("delete", name, key)) throw new Error("injected delete failure " + name); m.delete(key); }'],
    ['async setJSON(key, value, opts = {}) {', 'async setJSON(key, value, opts = {}) { if (globalThis.__erasureFault?.("set", name, key)) throw new Error("injected write failure " + name);']];
  for (const [from, to] of parts) { if (!src.includes(from)) throw new Error('data-erasure-check hook no longer matches store.mjs: ' + from); src = src.replace(from, to); }
  return { ...out, source: src, shortCircuit: true };
}`;
register('data:text/javascript,' + encodeURIComponent(HOOK));
const deny = () => { throw new Error('data-erasure-check denies networking'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async () => deny();
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|ERASURE_AUDIT_KEY)/.test(k)) delete process.env[k];
const base = 'http://127.0.0.1:8941';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: base, PUBLIC_SITE_URL: base, ADMIN_KEY: 'erasure-check-admin', ADMIN_EMAILS: 'erasure-operator@example.test' });
const L = '../netlify/functions/lib/';
const store = await import(L + 'store.mjs'), erasure = await import(L + 'data-erasure.mjs');
const { newClient } = await import(L + 'config.mjs'), { workspaceTenant } = await import(L + 'workspace-identity.mjs');
const { accountKey, ensureVerifiedAccount } = await import(L + 'accounts.mjs');
const { managementRevision } = await import(L + 'operator.mjs'), { accessHash } = await import(L + 'access.mjs');
const desk = await import(L + 'desk.mjs');
const manage = (await import('../netlify/functions/manage.mjs')).default, admin = (await import('../netlify/functions/admin.mjs')).default;
const sha = v => createHash('sha256').update(String(v)).digest('hex');
const mem = () => globalThis.__erasureMemory;
const fail = (op, kind, times = 1, when = () => true) => { let n = 0; globalThis.__erasureFault = (o, k, key) => o === op && k === kind && when(key) && n++ < times; };
const healed = () => { globalThis.__erasureFault = null; };
const results = []; const check = async (name, fn) => { try { await fn(); } finally { healed(); } results.push(name); console.log('ok -', name); };
const snapshot = filter => { const out = {}; for (const [kind, m] of mem()) for (const [key, v] of m) if (filter(kind, key, v.value)) out[kind + '|' + key] = v.value; return out; };
const allText = () => { const out = []; for (const [kind, m] of mem()) for (const [key, v] of m) out.push([kind, key, key.replace(/~/g, '+') + '\n' + v.value]); return out; };
const future = (days = 5) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// Every store name the functions read or write.
const dir = new URL('../netlify/functions/', import.meta.url).pathname;
const files = [...readdirSync(dir).filter(f => f.endsWith('.mjs')).map(f => dir + f), ...readdirSync(dir + 'lib').filter(f => f.endsWith('.mjs')).map(f => dir + 'lib/' + f)];
const storeNames = new Set();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?<![.\w])(?:atomicUpdate|strictRead|put|get|del|remove|list|listJSON|boundedRecordKeys|rowsOf)\(\s*['"]([a-z][a-z0-9_]+)['"]/g)) storeNames.add(m[1]);
  for (const m of text.matchAll(/\b[A-Z_]*(?:STORE|QUEUE|INDEX|CALLS|CALLBACKS|OPERATIONS|LOCKS|KIND|REVIEWS|EVENTS|CURSOR|CLOCK|ERASURES)\s*=\s*['"]([a-z][a-z0-9_]+)['"]/g)) storeNames.add(m[1]);
}
for (const n of ['workspace_rebuild', 'daily']) storeNames.delete(n);
await check('every store the source names is classified by ERASURE_REGISTRY, plus the conditional 09/15 stores', async () => {
  const missing = [...storeNames].filter(n => !Object.hasOwn(erasure.ERASURE_REGISTRY, n));
  assert.deepEqual(missing, [], 'Add new stores to ERASURE_REGISTRY in lib/data-erasure.mjs: ' + missing.join(', '));
  for (const [kind, proposal] of [['conversation_access', 'proposal-09'], ['conversation_forks', 'proposal-09'], ['public_chat_ai', 'proposal-15']]) assert.equal(erasure.ERASURE_REGISTRY[kind]?.conditional, proposal, kind);
  assert.equal(erasure.ERASURE_REGISTRY.self_service_ai_proofs.scope, 'exact');
});

const PHONE = '+17135550199', OWNER = '+17135550140', CANARY = 'CANARY-erasure-31c9';
async function tenant(slug, { status = 'cancelled' } = {}) {
  const c = newClient({ slug, ownerKey: 'owner-' + slug, owner: { name: 'Owner', email: `${slug}@example.invalid`, phone: OWNER }, business: { name: 'Shop ' + slug, trade: 'HVAC', city: 'Houston', hours: 'Mon-Sun 7am-7pm' } });
  Object.assign(c, { status, onboarding: { version: 1, verifiedEmail: c.owner.email } });
  await store.saveClient(c); await store.indexClient(c);
  await ensureVerifiedAccount({ email: c.owner.email, initialClient: await store.getClient(slug), submissionHash: 'h' + slug }).catch(() => null);
  return { c: await store.getClient(slug), T: workspaceTenant(c), E: c.owner.email };
}
// One row in every registered store, in the key shape its scope reads.
async function seedEveryStore({ c, T, E }) {
  const slug = c.slug, H = sha(slug), row = { slug, tenantIdentity: T, phone: PHONE, note: CANARY };
  for (const [kind, spec] of Object.entries(erasure.ERASURE_REGISTRY)) {
    if (['clients', 'workspace_erasures', 'accounts'].includes(kind)) continue;
    const key = { prefix: `${slug}/${T}/${H}`, exact: slug, slugField: H, tenantKey: `self-service:2026-11-11:tenant:${T}`, emailKey: accountKey(E), emailRate: 'email:' + accountKey(E), emailField: H, submission: H, index: `bookings:${slug}:${PHONE}`, health: `lastInbound:${slug}:${T}`, queue: 'active_v1' }[spec.scope];
    if (!key) continue;
    if (spec.scope === 'queue') { await store.atomicUpdate(kind, key, current => ({ value: { ...(current || {}), intents: { ...(current?.intents || {}), [`${slug}/${H}`]: { slug, tenantIdentity: T } } } })); continue; }
    const value = kind === 'managed_sms_consent' ? { tenant: T, phone: PHONE, suppressed: true, stoppedAt: 'x', lastKeyword: 'stop', note: CANARY } : kind === 'index' ? ['bk1'] : kind === 'optouts' ? { at: 'x', slug, words: 'Stop texting me, this is Maria at 12 Elm ' + CANARY } : { ...row, email: E, ...(kind.endsWith('_intents') || kind === 'messaging_activation' ? { cleanupConfirmedAt: 'x', releasedAt: 'x' } : {}) };
    await store.put(kind, key, value);
  }
  // Key shapes outside the generic `<slug>/` prefix (QA D1, D2, D7).
  for (const kind of ['paid-capacity', 'paid-capacity-intent', 'paid-capacity-period', 'paid-capacity-provider']) await store.put('usage', `${kind}/${slug}/${T}/2026-11`, { tenantIdentity: T, slug });
  await store.put('health', `leadIntake:sourceCursor:${T}`, { at: 'x' });
  await store.put('health', `alert:${slug}:sms_failures`, { at: 'x' });
  await store.put('index', `capacity:${slug}:${T}`, { version: 1, tenantIdentity: T, reservations: {}, mutations: {} });
}
const KEPT = new Set(['optouts', 'managed_sms_consent', 'prospect_suppression', 'workspace_billing', 'workspace_billing_events', 'workspace_billing_reviews', 'workspace_billing_customers', 'workspace_billing_subscriptions', 'workspace_erasures']);
const LEGAL_HOLD = Object.entries(erasure.ERASURE_REGISTRY).filter(([, spec]) => spec.keep === 'legal_hold').map(([kind]) => kind);
const leftovers = (needles, kept = KEPT) => { const out = {}; for (const [kind, key, text] of allText()) if (!kept.has(kind) && needles.some(n => text.includes(n))) (out[kind] ||= []).push(key); return out; };

await check('workspace erasure removes every key shape, keeps suppression minimized and billing on hold, and never touches a prefix-sharing workspace or a prior incarnation', async () => {
  const a = await tenant('erase-me-a1'), b = await tenant('erase-me-a1-x'), d = await tenant('erase-me-a');
  for (const t of [a, b, d]) await seedEveryStore(t);
  const prior = 'f'.repeat(64);
  await store.put('bookings', `${a.c.slug}/older-incarnation`, { slug: a.c.slug, tenantIdentity: prior, id: 'older', note: 'another tenant under the same slug' });
  const others = (kind, key, value) => key.includes('erase-me-a1-x') || key.includes('erase-me-a/') || key.includes('erase-me-a:') || key === 'erase-me-a' || value.includes(b.T) || value.includes(d.T) || value.includes(b.E) || value.includes(d.E) || key.includes(accountKey(b.E)) || key.includes(accountKey(d.E));
  // Stacked with 09 and 15: rows written by those stores, seeded here independently of the registry's own scope.
  for (const t of [a, b, d]) {
    for (const key of [`email:${accountKey(t.E)}:${sha('net')}`, `known:${accountKey(t.E)}:${sha('net')}`, `first:${accountKey(t.E)}`]) await store.put('access_rate', key, { until: Date.now() + 60000, count: 1, owner: t.T });
    for (const kind of ['conversation_access', 'conversation_forks']) for (const key of [`${t.c.slug}/web/w${sha(t.c.slug).slice(0, 32)}`, `${t.c.slug}/${t.T}/web/w${sha(t.T).slice(0, 32)}`]) await store.put(kind, key, { tenant: t.T, tokenHashes: [sha(key)] });
  }
  const before = snapshot(others);
  const result = await erasure.eraseWorkspace({ slug: a.c.slug, client: a.c, actor: 'check', reason: 'owner request', requireClosed: true });
  assert.equal(result.erasure.state, 'complete');
  const after = snapshot(others);
  const strip = (k, v) => { if (!k.endsWith('|active_v1')) return v; const doc = JSON.parse(v); doc.intents = Object.fromEntries(Object.entries(doc.intents || {}).filter(([id]) => !id.startsWith(a.c.slug + '/'))); return JSON.stringify(doc); };
  assert.deepEqual(Object.keys(before).filter(k => !(k in after) || strip(k, after[k]) !== strip(k, before[k])), [], 'prefix-sharing workspaces are unchanged');
  assert.deepEqual(leftovers([a.T, a.E, accountKey(a.E), sha(a.c.slug)]), {});
  assert.ok(await store.get('bookings', `${a.c.slug}/older-incarnation`), 'a row naming another tenant identity is never touched');
  for (const kind of LEGAL_HOLD) assert.ok(Object.keys(snapshot((k, key, v) => k === kind && v.includes(a.T))).length, kind + ' stays on legal hold');
  const consent = await store.get('managed_sms_consent', `${a.c.slug}/${a.T}/${sha(a.c.slug)}`);
  assert.equal(consent?.suppressed, true); assert.ok(!JSON.stringify(consent).includes(CANARY));
  assert.deepEqual(await store.get('optouts', sha(a.c.slug)), { stopped: true }, 'an opt-out keeps the phone key and the stop flag only');
  const queue = await store.get('managed_delivery_pending', 'active_v1');
  assert.ok(Object.keys(queue.intents).some(id => id.startsWith(b.c.slug + '/')) && !Object.keys(queue.intents).some(id => id.startsWith(a.c.slug + '/')), 'only this workspace leaves the shared queue');
  assert.equal((await erasure.eraseWorkspace({ slug: a.c.slug, actor: 'check', reason: 'repeat' })).alreadyComplete, true);
  const again = newClient({ slug: 'erase-me-new', ownerKey: 'k', owner: { name: 'Owner', email: a.E, phone: '+17135550141' }, business: { name: 'New' } });
  assert.equal((await ensureVerifiedAccount({ email: a.E, initialClient: again, submissionHash: 'n' })).outcome, 'created');
});

await check('legacy workspaces (rows without a tenant identity) sharing a slug prefix are erased independently', async () => {
  const make = async slug => { const c = newClient({ slug, ownerKey: 'k-' + slug, owner: { name: 'Owner', email: `${slug}@example.invalid`, phone: OWNER }, business: { name: 'Legacy ' + slug } }); await store.saveClient(c); for (const kind of ['bookings', 'leads', 'events', 'conversations']) await store.put(kind, `${slug}/r1`, { slug, id: 'r1', phone: PHONE }); return c; };
  const a = await make('legacy-k'), b = await make('legacy-k-two');
  const before = snapshot((kind, key) => key.startsWith('legacy-k-two'));
  const out = await erasure.eraseWorkspace({ slug: a.slug, client: a, actor: 'check', reason: 'legacy owner request', workspaceKind: 'legacy' });
  assert.equal(out.erasure.state, 'complete');
  for (const kind of ['bookings', 'leads', 'events', 'conversations']) assert.equal(await store.get(kind, `${a.slug}/r1`), null);
  assert.deepEqual(snapshot((kind, key) => key.startsWith('legacy-k-two')), before);
});

await check('a row a background worker writes during pass 1 is removed by pass 2', async () => {
  const t = await tenant('second-pass-c1'); await seedEveryStore(t);
  const first = `${t.c.slug}/${t.T}/${sha(t.c.slug)}`;
  let wrote = false;
  const writer = (async () => { for (let i = 0; i < 200000 && !wrote; i++) { await null; if (!mem().get('bookings')?.has(first)) { await store.put('bookings', `${t.c.slug}/${t.T}/late`, { slug: t.c.slug, tenantIdentity: t.T, id: 'late', note: CANARY }); wrote = true; } } })();
  const result = await erasure.eraseWorkspace({ slug: t.c.slug, client: t.c, actor: 'check', reason: 'owner request', requireClosed: true });
  await writer;
  assert.ok(wrote, 'the late write happened while erasure ran');
  assert.equal(result.erasure.state, 'complete');
  assert.equal(await store.get('bookings', `${t.c.slug}/${t.T}/late`), null);
});

await check('a failed store in pass 1 keeps the client row, saves retry_required, and a retry finishes', async () => {
  for (const kind of ['leads', 'conversation_history', 'clients']) {
    const t = await tenant('resume-' + kind.replace(/_/g, '-')); await seedEveryStore(t);
    fail('delete', kind);
    const first = await erasure.eraseWorkspace({ slug: t.c.slug, client: t.c, actor: 'check', reason: 'owner request', requireClosed: true }).then(() => null, e => e);
    healed();
    assert.equal(first?.code, 'erasure_incomplete', kind); assert.equal(first.erasure.state, 'retry_required');
    assert.ok(await store.getClient(t.c.slug), 'client row kept after a failure in ' + kind);
    const second = await erasure.eraseWorkspace({ slug: t.c.slug, client: await store.getClient(t.c.slug), actor: 'check', reason: 'retry', requireClosed: true });
    assert.equal(second.erasure.state, 'complete');
    assert.deepEqual(leftovers([t.T, t.E, accountKey(t.E)]), {});
    assert.equal((await store.list('workspace_erasures', t.c.slug + '/')).length, 1);
  }
});

await check('open workspaces and unconfirmed provider IDs (including Vapi assistant/imported ids) are refused before any row is removed', async () => {
  const { c, T } = await tenant('provider-c3', { status: 'live' });
  await assert.rejects(erasure.eraseWorkspace({ slug: c.slug, client: c, actor: 'check', reason: 'x request', requireClosed: true }), e => e.code === 'cancel_required');
  await store.put('clients', c.slug, { ...(await store.getClient(c.slug)), status: 'cancelled' });
  const A = '1b4e28ba-2fa1-11d2-883f-0016d3cca427', I = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b', PN = 'PN' + 'a'.repeat(32);
  await store.put('phone_activation_intents', `${c.slug}/${sha('pn')}`, { slug: c.slug, tenantIdentity: T, resource: { id: PN } });
  await store.put('voice_activation_intents', `${c.slug}/${sha('voice')}`, { slug: c.slug, tenantIdentity: T, state: 'cancelled', assistant: { id: A }, imported: { id: I, number: '+17135550111' } });
  await assert.rejects(erasure.eraseWorkspace({ slug: c.slug, client: await store.getClient(c.slug), actor: 'check', reason: 'x request', requireClosed: true }), e => e.code === 'provider_cleanup_pending' && [PN, A, I].every(id => e.providerCleanup.some(r => r.id === id)));
  assert.ok(await store.getClient(c.slug)); assert.equal((await store.list('voice_activation_intents', c.slug + '/')).length, 1);
  const kept = await erasure.eraseWorkspace({ slug: c.slug, client: await store.getClient(c.slug), actor: 'check', reason: 'x request', requireClosed: true, providerCleanup: 'retain_tombstone' });
  assert.equal(kept.erasure.state, 'provider_cleanup_pending'); assert.deepEqual(kept.erasure.providerCleanup.map(r => r.id).sort(), [PN, A, I].sort());
  for (const id of [PN, A]) await erasure.confirmProviderCleanup({ slug: c.slug, providerId: id, actor: 'check', reason: 'released in console' });
  assert.equal((await erasure.confirmProviderCleanup({ slug: c.slug, providerId: I, actor: 'check', reason: 'released in console' })).erasure.state, 'complete');
});

// A live workspace with real flows: bookings through desk.bookVisit, website archives through
// saveConversation, an SMS conversation, a task, consent and an opt-out.
async function web(c, contact, lines) {
  for (const line of lines) { const conv = await store.getConversation(await store.getClient(c.slug), 'web', contact); conv.messages.push({ role: 'user', content: line }, { role: 'assistant', content: 'Saved, thanks.' }); await store.saveConversation(conv, { output: { reply: 'Saved, thanks. ' + line, events: [] } }); }
}
async function readAll(c, contact) { const a = await store.readConversationArchive(await store.getClient(c.slug), 'web', contact); return store.readArchivedMessages(a, 0, a.history.total); }
async function contactShop(slug) {
  const { c, T } = await tenant(slug, { status: 'live' });
  const date = future(), window = c.windows[0];
  const mine = await desk.bookVisit(c, { customer_name: 'Pat', phone: PHONE, address: '1 Main St', issue: 'AC out', date, window, urgency: 'flexible', language: 'en' }, { channel: 'web', contact: 'visitorP' });
  const other = await desk.bookVisit(await store.getClient(slug), { customer_name: 'Sam', phone: '+17135550177', address: '2 Oak St', issue: 'Heater', date: future(6), window, urgency: 'flexible', language: 'en', notes: 'neighbour Pat 713.555.0199 referred us' }, { channel: 'web', contact: 'visitorS' });
  await store.scheduleTask(slug, new Date(Date.now() + 86400000).toISOString(), 'visit_check', { bookingId: mine.id });
  await store.put('optouts', PHONE, { at: 'x', slug, words: 'Stop texting me, this is Pat at 1 Main St' });
  await store.put('managed_sms_consent', `${slug}/${T}/${PHONE}`, { tenant: T, phone: PHONE, suppressed: true, seen: { note: CANARY } });
  const sms = await store.getConversation(await store.getClient(slug), 'sms', PHONE); sms.messages.push({ role: 'user', content: 'hi this is Pat' }); await store.saveConversation(sms);
  const lines = ['My neighbour at 713-555-0199 also needs a quote']; for (let i = 0; i < 25; i++) lines.push('follow-up message ' + i);
  await web(c, 'visitorA', lines);
  await web(c, 'visitorB', ['Do you serve Katy?']);
  await web(c, 'visitorP', ['This is Pat, (713) 555-0199, AC is out at 1 Main St']);
  return { c: await store.getClient(slug), T, mine, other, date, window };
}
// Every stored form of PHONE in this workspace's rows; shared queue documents are read per entry.
const phoneLeft = (slug, kept = ['managed_sms_consent', 'optouts', 'contact_erasures']) => {
  const re = /(?<!\d)(?:[+~]?1[ .-]?)?\(?713\)?[ .-]?555[ .-]?0199(?!\d)/, out = [];
  for (const [kind, key, text] of allText()) {
    if (kept.includes(kind)) continue;
    if (erasure.ERASURE_REGISTRY[kind]?.scope === 'queue') { const doc = JSON.parse(text.slice(text.indexOf('\n') + 1)); for (const field of Object.values(doc || {})) if (field && typeof field === 'object') for (const [id, entry] of Object.entries(field)) if ((id.startsWith(slug + '/') || JSON.stringify(entry).includes(slug)) && re.test(JSON.stringify(entry))) out.push(kind + '|' + key + '|' + id); continue; }
    if ((key.startsWith(slug + '/') || text.includes(slug)) && re.test(text)) out.push(kind + '|' + key);
  }
  return out;
};

await check('phone erasure deletes the contact\'s own records, redacts mentions in place, releases capacity and keeps every conversation readable', async () => {
  const s = await contactShop('contact-d4');
  const visitorB = await readAll(s.c, 'visitorB');
  const out = await erasure.eraseContact({ client: s.c, phone: PHONE, actor: 'check', reason: 'homeowner request' });
  assert.equal(out.erasure.state, 'complete'); assert.equal(out.notice, erasure.REASON_NOTICE);
  assert.deepEqual(phoneLeft(s.c.slug), [], 'no stored form of the phone remains outside suppression');
  assert.equal(await store.get('bookings', `${s.c.slug}/${s.mine.id}`), null, 'the contact\'s booking is deleted');
  const other = (await store.list('bookings', s.c.slug + '/')).map(k => k.split('/').pop());
  assert.ok(other.includes(s.other.id), 'another customer\'s booking that mentions the phone is kept');
  const kept = (await store.list('bookings', s.c.slug + '/')).find(k => k.endsWith('/' + s.other.id));
  assert.match((await store.get('bookings', kept)).notes, /neighbour Pat \[removed\] referred us/);
  assert.equal(out.erasure.counts.capacity_reservations, 1);
  const capacity = await store.get('index', store.capacityKey(s.c));
  assert.ok(!capacity.reservations?.[s.mine.id], 'the erased booking no longer reserves its window');
  assert.ok(capacity.reservations?.[s.other.id], 'other reservations stay');
  for (const k of await store.list('tasks', '')) assert.notEqual((await store.get('tasks', k))?.data?.bookingId, s.mine.id, 'a task for the erased booking goes with it');
  assert.ok(out.erasure.redactedConversations.includes('visitorA') && out.erasure.redactedConversations.includes('visitorP'));
  const a = await readAll(s.c, 'visitorA');
  assert.equal(a.length, 52); assert.equal(a[0].content, 'My neighbour at [removed] also needs a quote');
  assert.deepEqual(await readAll(s.c, 'visitorB'), visitorB, 'an unrelated archive is byte-identical');
  const head = await store.get('conversations', `${s.c.slug}/${s.T}/web/visitorA`);
  assert.ok(head.history.entries.every(e => !e.redactedDigest), 'redacted digests are adopted');
  assert.equal(await store.get('optouts', PHONE).then(r => JSON.stringify(r)), JSON.stringify({ stopped: true }));
  const consent = await store.get('managed_sms_consent', `${s.c.slug}/${s.T}/${PHONE}`); assert.equal(consent.suppressed, true); assert.ok(!JSON.stringify(consent).includes(CANARY));
  // The audit row: written for the run, no phone, no phone-derived value without the audit key.
  const rows = await store.list('contact_erasures', s.c.slug + '/'); assert.equal(rows.length, 1);
  const audit = await store.get('contact_erasures', rows[0]);
  assert.equal(audit.state, 'complete'); assert.equal(audit.contactDigest, null); assert.ok(!/0199/.test(JSON.stringify(audit)));
  // A second run finds nothing more and is audited too.
  const again = await erasure.eraseContact({ client: await store.getClient(s.c.slug), phone: PHONE, actor: 'check', reason: 'repeat check' });
  assert.deepEqual(again.erasure.counts, {}); assert.equal((await store.list('contact_erasures', s.c.slug + '/')).length, 2);
});

await check('the audit digest is an HMAC under ERASURE_AUDIT_KEY and cannot be reversed from the record', async () => {
  const { c } = await tenant('audit-e5', { status: 'live' });
  process.env.ERASURE_AUDIT_KEY = 'erasure-check-audit-key';
  try {
    const out = await erasure.eraseContact({ client: c, phone: '+17135550109', actor: 'check', reason: 'homeowner asked by phone' });
    const T = workspaceTenant(c), digest = out.erasure.contactDigest;
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal(digest, createHmac('sha256', 'erasure-check-audit-key').update(JSON.stringify(['contact-erasure-v2', T, '+17135550109', null])).digest('hex'));
    let found = null; for (let i = 0; i < 10000 && !found; i++) { const p = '+1713555' + String(i).padStart(4, '0'); for (const form of [JSON.stringify([T, p, null]), JSON.stringify(['contact-erasure-v2', T, p, null]), p]) if (sha(form) === digest) found = p; }
    assert.equal(found, null);
  } finally { delete process.env.ERASURE_AUDIT_KEY; }
});

await check('reasons with personal data, the owner\'s own numbers and non-E.164 input are refused with nothing changed', async () => {
  const s = await contactShop('guard-f6');
  const bk = await store.addRecord('bookings', s.c.slug, { tenantIdentity: s.T, phone: '+17135550104', customer_name: 'Unrelated', notes: 'owner cell ' + OWNER + ' was cc on this' });
  const before = snapshot((kind, key) => key.startsWith(s.c.slug));
  for (const reason of ['caller +1 713 555 0199 asked', 'asked by pat@example.com', 'x', 'call 832-555-0123 back']) await assert.rejects(erasure.eraseContact({ client: s.c, phone: PHONE, actor: 'check', reason }), e => ['reason_contains_personal_data', 'invalid_request'].includes(e.code), reason);
  await assert.rejects(erasure.eraseContact({ client: s.c, webContact: 'visitorA', actor: 'check', reason: 'visitor visitorA asked' }), e => e.code === 'reason_contains_personal_data');
  await assert.rejects(erasure.eraseContact({ client: s.c, phone: OWNER, actor: 'check', reason: 'homeowner request' }), e => e.code === 'own_number');
  await store.put('voice_activation_intents', `${s.c.slug}/${sha('v')}`, { slug: s.c.slug, tenantIdentity: s.T, imported: { id: 'x'.repeat(10), number: '+17135550111' } });
  await assert.rejects(erasure.eraseContact({ client: s.c, phone: '+17135550111', actor: 'check', reason: 'homeowner request' }), e => e.code === 'own_number');
  await store.remove('voice_activation_intents', `${s.c.slug}/${sha('v')}`);
  await assert.rejects(erasure.eraseContact({ client: s.c, phone: '713-555-0199', actor: 'check', reason: 'homeowner request' }), e => e.code === 'invalid_contact');
  await assert.rejects(erasure.eraseWorkspace({ slug: s.c.slug, client: s.c, actor: 'check', reason: 'owner pat@example.com asked' }), e => e.code === 'reason_contains_personal_data');
  assert.deepEqual(snapshot((kind, key) => key.startsWith(s.c.slug)), before);
  assert.ok(await store.get('bookings', `${s.c.slug}/${bk.id}`));
  assert.equal((await store.list('contact_erasures', s.c.slug + '/')).length, 0);
});

await check('stored phone formats are matched, longer digit runs are not', async () => {
  const { c, T } = await tenant('formats-g7', { status: 'live' });
  const forms = ['+17135550199', '713-555-0199', '(713) 555-0199', '713.555.0199', '7135550199', '1-713-555-0199', '+1 (713) 555-0199', '713 555 0199'];
  const ids = []; for (const f of forms) ids.push((await store.addRecord('leads', c.slug, { tenantIdentity: T, phone: '+17135550000', notes: 'alt number ' + f })).id);
  const control = await store.addRecord('leads', c.slug, { tenantIdentity: T, phone: '+17135550000', notes: 'order 17135550199123 and 27135550199' });
  const out = await erasure.eraseContact({ client: c, phone: PHONE, actor: 'check', reason: 'homeowner request' });
  assert.equal(out.erasure.redacted.leads, forms.length);
  for (const id of ids) assert.equal((await store.get('leads', `${c.slug}/${T}/${id}`) || await store.get('leads', `${c.slug}/${id}`))?.notes, 'alt number [removed]');
  const kept = await store.get('leads', `${c.slug}/${T}/${control.id}`) || await store.get('leads', `${c.slug}/${control.id}`);
  assert.equal(kept.notes, 'order 17135550199123 and 27135550199');
});

await check('website-visitor erasure deletes that visitor\'s whole chain and records and leaves every other archive readable', async () => {
  const s = await contactShop('webcontact-h8');
  const out = await erasure.eraseContact({ client: s.c, webContact: 'visitorP', actor: 'check', reason: 'visitor asked in chat' });
  assert.ok(out.erasure.counts.conversation_history >= 1 && out.erasure.counts.conversations === 1);
  await assert.rejects(store.readConversationArchive(await store.getClient(s.c.slug), 'web', 'visitorP'), e => e.code === 'conversation_not_found');
  assert.equal((await store.list('conversation_history', `${s.c.slug}/${s.T}/${sha(JSON.stringify(['web', 'visitorP']))}/`)).length, 0);
  assert.equal(await store.get('bookings', `${s.c.slug}/${s.mine.id}`), null, 'the visitor\'s booking is deleted');
  assert.equal((await readAll(s.c, 'visitorA')).length, 52); assert.equal((await readAll(s.c, 'visitorB')).length, 2);
});

await check('an interrupted contact erasure leaves every chain readable, is audited as retry_required, and a retry finishes', async () => {
  // Fault in stage B (a batch rewrite), stage C (adopting digests), a chain delete and a booking delete.
  const cases = [['set', 'conversation_history', PHONE], ['set', 'conversations', PHONE], ['delete', 'conversations', null], ['delete', 'conversation_history', null], ['delete', 'bookings', PHONE], ['set', 'index', PHONE]];
  for (const [op, kind, phone] of cases) {
    const s = await contactShop(`interrupt-${op}-${kind.replace(/_/g, '-')}`.slice(0, 40));
    const target = phone ? { phone } : { webContact: 'visitorP' };
    if (op === 'set' && kind === 'conversations') { let n = 0; globalThis.__erasureFault = (o, k, key) => o === 'set' && k === 'conversations' && key.endsWith('/web/visitorA') && ++n === 2; }
    else fail(op, kind);
    const first = await erasure.eraseContact({ client: s.c, ...target, actor: 'check', reason: 'homeowner request' }).then(() => null, e => e);
    healed();
    assert.equal(first?.code, 'erasure_incomplete', `${op} ${kind}`);
    const rows = await store.list('contact_erasures', s.c.slug + '/'); assert.equal(rows.length, 1);
    const audit = await store.get('contact_erasures', rows[0]);
    assert.equal(audit.state, 'retry_required'); assert.equal(audit.version, 2); assert.equal(audit.reason, 'homeowner request'); assert.equal(audit.actor, 'check'); assert.ok(audit.at && audit.kind);
    for (const v of ['visitorA', 'visitorB']) assert.ok((await readAll(s.c, v)).length > 0, `${v} readable after a ${op} failure in ${kind}`);
    if (!phone) { const head = await store.get('conversations', `${s.c.slug}/${s.T}/web/visitorP`); if (head) await readAll(s.c, 'visitorP'); }
    const second = await erasure.eraseContact({ client: await store.getClient(s.c.slug), ...target, actor: 'check', reason: 'homeowner request retry' });
    assert.equal(second.erasure.state, 'complete');
    if (phone) { assert.deepEqual(phoneLeft(s.c.slug), []); assert.equal((await readAll(s.c, 'visitorA'))[0].content, 'My neighbour at [removed] also needs a quote'); }
    else { await assert.rejects(store.readConversationArchive(await store.getClient(s.c.slug), 'web', 'visitorP'), e => e.code === 'conversation_not_found'); assert.equal((await store.list('conversation_history', `${s.c.slug}/${s.T}/${sha(JSON.stringify(['web', 'visitorP']))}/`)).length, 0); }
    assert.equal(await store.get('bookings', `${s.c.slug}/${s.mine.id}`), null);
    assert.ok(!(await store.get('index', store.capacityKey(s.c))).reservations?.[s.mine.id], 'capacity released despite the interruption');
  }
});

await check('retention sweep keeps the current and previous rate buckets and recently expired sessions, and removes older rows', async () => {
  const now = Date.now(), bucket = Math.floor(now / 600000);
  for (const k of await store.list('ratelimit', '')) await store.del('ratelimit', k);
  for (const [k, v] of [[`203.0.113.5/${bucket}`, 9], [`203.0.113.5/${bucket - 1}`, 9], [`2001:db8::1/${bucket}`, 3], [`203.0.113.6/${bucket - 2}`, 1], [`203.0.113.7/${bucket + 1}`, 1]]) await store.put('ratelimit', k, v);
  for (const [k, exp] of [['live', now + 3600000], ['justexpired', now - 3600000], ['sixdays', now - 6 * 86400000], ['old', now - 8 * 86400000]]) await store.put('access_sessions', sha(k), { email: 'z@example.invalid', status: 'active', expiresAt: new Date(exp).toISOString() });
  const swept = await erasure.retentionSweep({ now });
  assert.deepEqual((await store.list('ratelimit', '')).sort(), [`2001:db8::1/${bucket}`, `203.0.113.5/${bucket - 1}`, `203.0.113.5/${bucket}`, `203.0.113.7/${bucket + 1}`].sort());
  for (const k of ['live', 'justexpired', 'sixdays']) assert.ok(await store.get('access_sessions', sha(k)), k);
  assert.equal(await store.get('access_sessions', sha('old')), null);
  assert.equal(swept.ratelimit, 1); assert.equal(swept.access_sessions, 1);
});

// ---- The operator API (/api/manage) and the legacy admin key ----
const OPERATOR = 'erasure-operator@example.test';
let serial = 0;
const session = async (email, scope) => { const token = sha('erasure-session-' + ++serial); await store.put('access_sessions', accessHash(token), { email, scope, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }); return token; };
const call = async (handler, path, body, token, headers = {}) => { const res = await handler(new Request(base + path, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: JSON.stringify(body) }), { ip: '127.0.0.1' }); return { status: res.status, body: await res.json() }; };
await check('only a current allowlisted operator can erase, with the slug retyped, the current revision and a closed self-service workspace', async () => {
  const s = await contactShop('operator-i9');
  const operator = await session(OPERATOR, 'operator'), owner = await session(s.c.owner.email, 'onboarding'), outsider = await session('not-staff@example.test', 'operator');
  const command = (c, action, extra = {}) => ({ action, slug: c.slug, expectedRevision: managementRevision(c), reason: 'customer request', ...extra });
  const unchanged = snapshot((kind, key, v) => key.startsWith(s.c.slug) || v.includes(s.T));
  const contact = command(s.c, 'erase_contact', { phone: PHONE });
  assert.equal((await call(manage, '/api/manage', contact, null)).status, 401, 'no session');
  assert.equal((await call(manage, '/api/manage', contact, owner)).status, 401, 'an owner session is not an operator session');
  assert.equal((await call(manage, '/api/manage', contact, outsider)).status, 403, 'an operator session for an email off the allowlist');
  assert.equal((await call(manage, '/api/manage', contact, operator, { origin: 'https://bad.invalid' })).status, 403, 'foreign origin');
  assert.equal((await call(admin, '/api/admin', { action: 'erase_contact', slug: s.c.slug, phone: PHONE, reason: 'customer request' }, null, { 'x-admin-key': 'erasure-check-admin' })).status, 409, 'the admin key cannot erase in a self-service workspace');
  assert.equal((await call(manage, '/api/manage', { ...contact, expectedRevision: 'f'.repeat(64) }, operator)).status, 409, 'stale revision');
  assert.equal((await call(manage, '/api/manage', { ...contact, reason: 'caller 713 555 0199' }, operator)).body.error, 'reason_contains_personal_data');
  assert.equal((await call(manage, '/api/manage', command(s.c, 'erase_contact', { phone: OWNER }), operator)).body.error, 'own_number');
  const ws = command(s.c, 'erase_workspace', { confirmSlug: s.c.slug });
  assert.equal((await call(manage, '/api/manage', ws, owner)).status, 401);
  assert.equal((await call(manage, '/api/manage', ws, outsider)).status, 403);
  assert.equal((await call(manage, '/api/manage', { ...ws, confirmSlug: s.c.slug + 'x' }, operator)).status, 400, 'slug must be retyped');
  assert.equal((await call(manage, '/api/manage', { ...ws, expectedRevision: 'f'.repeat(64) }, operator)).status, 409, 'stale revision');
  assert.equal((await call(manage, '/api/manage', ws, operator)).body.error, 'cancel_required');
  assert.deepEqual(snapshot((kind, key, v) => key.startsWith(s.c.slug) || v.includes(s.T)), unchanged, 'refused requests change nothing');
  const legacy = newClient({ slug: 'legacy-j10', ownerKey: 'k-legacy', owner: { name: 'Owner', email: 'legacy@example.invalid', phone: OWNER }, business: { name: 'Legacy' } }); legacy.status = 'cancelled'; await store.saveClient(legacy);
  assert.equal((await call(manage, '/api/manage', command(legacy, 'erase_workspace', { confirmSlug: legacy.slug }), operator)).body.error, 'legacy_read_only');
  assert.ok(await store.getClient(legacy.slug));
  const done = await call(manage, '/api/manage', contact, operator);
  assert.equal(done.status, 200); assert.equal(done.body.notice, erasure.REASON_NOTICE); assert.equal(done.body.erasure.state, 'complete');
  const audit = (await store.getClient(s.c.slug)).management.audit.at(-1);
  assert.equal(audit.action, 'erase_contact'); assert.equal(audit.actor, OPERATOR); assert.ok(!JSON.stringify(audit).includes('0199'));
  await store.put('clients', s.c.slug, { ...(await store.getClient(s.c.slug)), status: 'cancelled' });
  const cancelled = await store.getClient(s.c.slug);
  const erased = await call(manage, '/api/manage', command(cancelled, 'erase_workspace', { confirmSlug: s.c.slug, providerCleanup: 'retain_tombstone' }), operator);
  assert.equal(erased.status, 200, JSON.stringify(erased.body)); assert.equal(erased.body.erasure.state, 'complete'); assert.equal(await store.getClient(s.c.slug), null);
});
console.log(`data-erasure-check: ${results.length} checks passed`);
