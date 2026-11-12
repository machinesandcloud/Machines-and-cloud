// Account lifecycle parity, owner notice, reopen and re-signup (PRA-OPS-03/04/05).
// Actual /api/manage, /api/client, /api/onboard handlers; memory store; every outbound
// request is intercepted (Resend email is captured, everything else is refused).
//   node scripts/account-lifecycle-check.mjs [--json out.json]
//        [--browser <playwright index.mjs> --screens <dir>]   (optional admin/desk screenshots)
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const deny = () => { throw new Error('account-lifecycle-check: physical network disabled'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|PHONE_|SERVICE_|VOICE_|MESSAGING_|CALENDAR_)/.test(key)) delete process.env[key];
const base = 'http://127.0.0.1:8897', operatorEmail = 'lifecycle-operator@example.test';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: base, PUBLIC_SITE_URL: base, ADMIN_EMAILS: operatorEmail, RESEND_API_KEY: 'intercepted-never-sent' });
const mail = [], blocked = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') { mail.push(JSON.parse(init.body)); return Response.json({ id: 'intercepted-' + mail.length }); }
  blocked.push(url.origin + url.pathname); throw new Error('Physical networking disabled');
};
const store = await import('../netlify/functions/lib/store.mjs'), access = await import('../netlify/functions/lib/access.mjs'), accounts = await import('../netlify/functions/lib/accounts.mjs');
const setup = await import('../netlify/functions/lib/setup.mjs'), operator = await import('../netlify/functions/lib/operator.mjs'), identity = await import('../netlify/functions/lib/workspace-identity.mjs');
const manage = (await import('../netlify/functions/manage.mjs')).default, client = (await import('../netlify/functions/client.mjs')).default, onboard = (await import('../netlify/functions/onboard.mjs')).default;
const erasureAvailable = existsSync(new URL('../netlify/functions/lib/data-erasure.mjs', import.meta.url));
const read = accounts.strictRead, tenant = identity.workspaceTenant;
const results = []; let serial = 0;
const check = async (name, fn) => { try { const detail = await fn(); results.push({ name, pass: true, ...(detail === undefined ? {} : { detail }) }); } catch (error) { results.push({ name, pass: false, error: String(error?.message || error).slice(0, 600) }); } };
const call = async (handler, path, body, token, method = 'POST') => {
  const response = await handler(new Request(base + path, { method, headers: { origin: base, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) }), { ip: '192.0.2.' + (++serial % 200 + 1) });
  let out = null; try { out = await response.json(); } catch {} return { status: response.status, body: out };
};
const session = async (email, scope = 'onboarding') => { const token = createHash('sha256').update('lifecycle-' + scope + '-' + ++serial).digest('hex'); await store.put('access_sessions', access.accessHash(token), { email, scope, status: 'active', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }); return token; };
const opToken = await session(operatorEmail, 'operator');
const signupBody = (label, email) => ({ name: 'Owner ' + label, business: 'Lifecycle ' + label, email, phone: '7135550142', trade: 'HVAC', city: 'Houston', serviceArea: 'Katy', hours: 'Mon-Fri 8am-5pm', windows: '8 to 12', services: 'AC repair' });
async function signup(label) {
  const email = `owner-${label}-${++serial}@example.test`, token = await session(email);
  const created = await call(onboard, '/api/onboard', signupBody(label, email), token); assert.equal(created.status, 200, 'signup ' + JSON.stringify(created.body).slice(0, 200));
  return { email, token, slug: created.body.slug };
}
// A live shop with every channel flag on, a scheduled task and an active (test) subscription record.
async function liveShop(label) {
  const shop = await signup(label), c = await read('clients', shop.slug);
  Object.assign(c, { status: 'live', liveAt: '2026-11-01T12:00:00.000Z', channels: { web: { active: true }, voice: { active: true }, sms: { active: true } } });
  await store.put('clients', c.slug, c);
  await store.scheduleTask(c.slug, new Date(Date.now() + 86400000).toISOString(), 'visit_check', { bookingId: 'b-' + label });
  await store.put('bookings', `${c.slug}/b-${label}`, { id: 'b-' + label, slug: c.slug, tenantIdentity: tenant(c), status: 'booked', issue: 'Keep this record' });
  await store.put('workspace_billing', `${c.slug}/${tenant(c)}`, { version: 1, slug: c.slug, tenant: tenant(c), livemode: false, subscription: { id: 'sub_' + label, status: 'active', plan: 'growth' }, cancellation: null });
  return { ...shop, c };
}
const op = async (slug, action, extra = {}) => { const c = await read('clients', slug); return call(manage, '/api/manage', { action, slug, expectedRevision: operator.managementRevision(c), reason: 'INTERNAL-ONLY reason ' + action, ...extra }, opToken); };
const owner = (shop, action, extra = {}) => call(client, '/api/client?c=' + shop.slug, { action, ...extra }, shop.token);
const tasksFor = async slug => { let n = 0; for (const key of await store.list('tasks', '')) if ((await read('tasks', key))?.slug === slug) n++; return n; };
const billing = async slug => { const c = await read('clients', slug); return read('workspace_billing', `${slug}/${tenant(c)}`); };
const shape = async slug => { const c = await read('clients', slug), b = await billing(slug); return { status: c.status, channels: c.channels, pausedFrom: c.pausedFrom ?? null, pausedChannels: c.pausedChannels ?? null, lifecycle: c.operationLifecycleVersion || 0, tasks: await tasksFor(slug), billingStopQueued: !!b?.stopRequestedAt, cancellation: b?.cancellation?.state || null }; };
const mailTo = email => mail.filter(row => [].concat(row.to).includes(email));
const clientsFor = async email => { const out = []; for (const key of await store.list('clients', '')) { const c = await read('clients', key); if (accounts.normalizeAccountEmail(c?.owner?.email) === email) out.push(c.slug); } return out; };

// ---- 1. Operator lifecycle = owner lifecycle (PRA-OPS-04) ----
const A = await liveShop('opa'), B = await liveShop('owb');
await check('operator pause matches owner pause: channels, snapshot, tasks, billing', async () => {
  assert.equal((await op(A.slug, 'pause')).status, 200); assert.equal((await owner(B, 'pause')).status, 200);
  const a = await shape(A.slug), b = await shape(B.slug); assert.deepEqual(a, b);
  assert.deepEqual(a.channels, { web: { active: false }, voice: { active: false }, sms: { active: false } }); return a;
});
await check('operator resume matches owner resume (no channel auto-enabled without readiness)', async () => {
  const ra = await op(A.slug, 'resume'), rb = await owner(B, 'resume_services', { expectedRevision: setup.configurationRevision(await read('clients', B.slug)) });
  // Web was on before the pause but the shop never passed review/live test: both refuse the same way.
  assert.equal(ra.status, 409); assert.equal(rb.status, 409); assert.deepEqual(await shape(A.slug), await shape(B.slug));
  for (const shop of [A, B]) { const c = await read('clients', shop.slug); c.pausedChannels = { ...c.pausedChannels, web: { active: false } }; await store.put('clients', c.slug, c); }
  assert.equal((await op(A.slug, 'resume')).status, 200); assert.equal((await owner(B, 'resume_services', { expectedRevision: setup.configurationRevision(await read('clients', B.slug)) })).status, 202);
  const a = await shape(A.slug), b = await shape(B.slug); assert.deepEqual(a, b); assert.equal(a.status, 'live'); assert.equal(a.channels.voice.active, false); assert.equal(a.channels.sms.active, false); return a;
});
await check('operator cancel matches owner cancel: channels off, tasks removed, billing stop queued', async () => {
  assert.equal((await op(A.slug, 'cancel_service')).status, 200); assert.equal((await owner(B, 'cancel', { reason: 'Owner chose to stop' })).status, 200);
  const a = await shape(A.slug), b = await shape(B.slug); assert.deepEqual(a, b);
  assert.equal(a.status, 'cancelled'); assert.equal(a.tasks, 0); assert.equal(a.billingStopQueued, true); assert.equal(a.cancellation, 'pending');
  assert.equal((await billing(A.slug)).cancellation.subscriptionId, 'sub_opa'); assert.equal((await billing(B.slug)).cancellation.subscriptionId, 'sub_owb');
  const audit = (await read('clients', A.slug)).management.audit.at(-1); assert.equal(audit.action, 'cancel_service'); assert.equal(audit.actor, operatorEmail); assert.match(audit.reason, /INTERNAL-ONLY/);
  return { operator: a, owner: b };
});
await check('operator cancel never exposes the internal reason as the owner-visible cancelReason', async () => {
  const view = await call(client, '/api/client?c=' + A.slug, null, A.token, 'GET'); assert.equal(view.status, 200);
  assert.equal(JSON.stringify(view.body).includes('INTERNAL-ONLY'), false, 'operator reason reached the owner view');
  assert.equal((await read('clients', B.slug)).cancelReason, 'Owner chose to stop');
});

// ---- 2. Owner is told (PRA-OPS-05) ----
const N = await liveShop('notice');
await check('support pause, resume and cancel each notify the owner in the desk and by email, with no internal reason', async () => {
  const seen = [];
  const steps = [['pause', { reasonCategory: 'billing', customerMessage: 'Please update your card on file.' }], ['resume', { reasonCategory: 'billing' }], ['cancel_service', { reasonCategory: 'owner_request' }]];
  for (const [action, extra] of steps) {
    if (action === 'resume') { const c = await read('clients', N.slug); c.pausedChannels = { ...c.pausedChannels, web: { active: false } }; await store.put('clients', c.slug, c); }
    const before = mailTo(N.email).length, response = await op(N.slug, action, extra); assert.equal(response.status, 200, action + ' ' + JSON.stringify(response.body).slice(0, 200));
    const view = await call(client, '/api/client?c=' + N.slug, null, N.token, 'GET'), notice = view.body.client.lifecycleNotice;
    assert.ok(notice, action + ': no desk notice'); assert.equal(notice.by, 'support'); assert.equal(notice.action, { pause: 'pause', resume: 'resume', cancel_service: 'cancel' }[action]);
    assert.equal(notice.category, extra.reasonCategory); assert.ok(notice.summary && notice.nextStep);
    assert.equal(JSON.stringify(view.body).includes('INTERNAL-ONLY'), false, action + ': internal reason in owner view');
    const sent = mailTo(N.email).slice(before); assert.equal(sent.length, 1, action + ': expected one owner email'); assert.match(sent[0].subject, /by support/); assert.ok(sent[0].text.includes(notice.summary));
    assert.equal(sent[0].text.includes('INTERNAL-ONLY'), false, action + ': internal reason in email');
    if (extra.customerMessage) { assert.equal(notice.message, extra.customerMessage); assert.ok(sent[0].text.includes(extra.customerMessage)); }
    assert.equal((await read('clients', N.slug)).lifecycleNotice.email, 'sent');
    seen.push({ action, subject: sent[0].subject });
  }
  return seen;
});
await check('owner-initiated pause sends no support notice and clears an earlier one', async () => {
  const M = await liveShop('ownpause'); assert.equal((await op(M.slug, 'pause', { reasonCategory: 'service_issue' })).status, 200);
  const c = await read('clients', M.slug); c.pausedChannels = { ...c.pausedChannels, web: { active: false } }; await store.put('clients', c.slug, c);
  assert.equal((await owner(M, 'resume_services', { expectedRevision: setup.configurationRevision(c) })).status, 202);
  const before = mailTo(M.email).length; assert.equal((await owner(M, 'pause')).status, 200);
  assert.equal(mailTo(M.email).length, before); assert.equal((await read('clients', M.slug)).lifecycleNotice, undefined);
});
await check('unknown reason category and oversized customer message are refused without a change', async () => {
  const X = await liveShop('badcat'), before = await read('clients', X.slug);
  assert.equal((await op(X.slug, 'pause', { reasonCategory: 'secret' })).status, 400);
  assert.equal((await op(X.slug, 'pause', { customerMessage: 'x'.repeat(301) })).status, 400);
  assert.deepEqual(await read('clients', X.slug), before);
});

// ---- 3. Operator reopen (PRA-OPS-03) ----
await check('operator reopen restores access and data, returns to testing with channels off and fresh review', async () => {
  const before = await read('clients', A.slug), billingBefore = await billing(A.slug);
  const response = await op(A.slug, 'reopen_workspace', { reasonCategory: 'owner_request', customerMessage: 'Welcome back.' }); assert.equal(response.status, 200, JSON.stringify(response.body).slice(0, 300));
  const c = await read('clients', A.slug); assert.equal(c.status, 'testing'); assert.deepEqual(c.channels, { web: { active: false }, voice: { active: false }, sms: { active: false } });
  assert.equal(c.cancelledAt, null); assert.equal(c.setupProof.reviewedRevision, null); assert.equal(c.setupProof.testedRevision, null); assert.equal(setup.setupReadiness(c).canActivateWeb, false);
  assert.ok(c.operationLifecycleVersion > before.operationLifecycleVersion); assert.equal(c.management.audit.at(-1).action, 'reopen_workspace');
  assert.deepEqual(await read('bookings', `${A.slug}/b-opa`), { id: 'b-opa', slug: A.slug, tenantIdentity: tenant(c), status: 'booked', issue: 'Keep this record' });
  assert.deepEqual(await billing(A.slug), billingBefore, 'reopen must not restart or clear the billing stop');
  const view = await call(client, '/api/client?c=' + A.slug, null, A.token, 'GET'); assert.equal(view.status, 200); assert.equal(view.body.client.status, 'testing'); assert.equal(view.body.client.lifecycleNotice.action, 'reopen');
  assert.equal(mailTo(A.email).at(-1).subject.includes('reopened by support'), true);
  assert.equal((await op(A.slug, 'reopen_workspace')).status, 409, 'reopen of an open workspace');
  return { status: c.status, lifecycle: c.operationLifecycleVersion };
});
await check('reopened workspace can pause again and owner Go-live still needs review and live test', async () => {
  assert.equal((await owner(A, 'go_live')).status, 409);
  assert.equal((await op(A.slug, 'pause')).status, 200); assert.equal((await read('clients', A.slug)).status, 'paused');
});

// ---- 4. Re-signup offers reopen; never a duplicate ----
await check('re-signup on a stopped workspace offers reopen and creates nothing', async () => {
  const fresh = await session(B.email), before = { clients: (await store.list('clients', '')).length, accounts: (await store.list('accounts', '')).length };
  const again = await call(onboard, '/api/onboard', signupBody('owb', B.email), fresh);
  assert.equal(again.status, 409, JSON.stringify(again.body).slice(0, 200)); assert.equal(again.body.error, 'workspace_stopped'); assert.equal(again.body.slug, B.slug); assert.equal(again.body.reopen.available, true);
  assert.deepEqual({ clients: (await store.list('clients', '')).length, accounts: (await store.list('accounts', '')).length }, before);
  const reopened = await call(client, '/api/client?c=' + B.slug, { action: 'reopen_workspace', expectedRevision: again.body.reopen.configurationRevision }, fresh);
  assert.equal(reopened.status, 200); assert.equal(reopened.body.status, 'testing'); assert.deepEqual(await clientsFor(B.email), [B.slug]);
  assert.equal((await read('clients', B.slug)).lifecycleNotice, undefined, 'owner reopen is not a support notice');
  const after = await call(onboard, '/api/onboard', signupBody('owb', B.email), fresh); assert.equal(after.status, 200); assert.equal(after.body.slug, B.slug); assert.equal(after.body.existing, true);
});
await check('after a policy-review cancellation the owner is told to contact support and cannot self-reopen', async () => {
  const P = await liveShop('policy'); assert.equal((await op(P.slug, 'cancel_service', { reasonCategory: 'policy_review' })).status, 200);
  const again = await call(onboard, '/api/onboard', signupBody('policy', P.email), P.token); assert.equal(again.status, 409); assert.equal(again.body.reopen.available, false);
  const c = await read('clients', P.slug), denied = await owner(P, 'reopen_workspace', { expectedRevision: setup.configurationRevision(c) });
  assert.equal(denied.status, 403); assert.equal(denied.body.error, 'reopen_requires_support'); assert.deepEqual(await read('clients', P.slug), c);
  assert.equal((await op(P.slug, 'reopen_workspace', { reasonCategory: 'policy_review' })).status, 200);
});
await check('owner reopen with a stale revision is refused', async () => {
  const S = await liveShop('stale'); assert.equal((await owner(S, 'cancel', { reason: 'stop' })).status, 200);
  assert.equal((await owner(S, 'reopen_workspace', { expectedRevision: '0'.repeat(64) })).status, 409); assert.equal((await read('clients', S.slug)).status, 'cancelled');
});
await check('concurrent re-signups and reopen keep exactly one workspace and one account row', async () => {
  const D = await liveShop('dup'); assert.equal((await owner(D, 'cancel', { reason: 'stop' })).status, 200);
  const rev = setup.configurationRevision(await read('clients', D.slug)), tokens = await Promise.all([1, 2, 3].map(() => session(D.email)));
  const outcomes = await Promise.all([...tokens.map(t => call(onboard, '/api/onboard', signupBody('dup', D.email), t)), call(client, '/api/client?c=' + D.slug, { action: 'reopen_workspace', expectedRevision: rev }, tokens[0]), op(D.slug, 'reopen_workspace')]);
  assert.deepEqual(await clientsFor(D.email), [D.slug]);
  assert.equal((await store.list('accounts', '')).filter(Boolean).length, (await store.list('accounts', '')).length);
  const account = await read('accounts', accounts.accountKey(D.email)); assert.equal(account.slug, D.slug);
  const reopens = outcomes.slice(3).filter(row => row.status === 200).length; assert.equal(reopens, 1, 'exactly one reopen wins: ' + outcomes.slice(3).map(r => r.status));
  assert.equal((await read('clients', D.slug)).status, 'testing');
  return outcomes.map(row => row.status);
});

// ---- 5. Concurrency between owner and operator ----
await check('owner pause racing operator cancel: one winner, final state fully consistent', async () => {
  const runs = [], order = async (i, ownerCall, operatorCall) => i % 3 === 0 ? [await ownerCall(), await operatorCall()] : i % 3 === 1 ? (([s, o]) => [o, s])([await operatorCall(), await ownerCall()]) : Promise.all([ownerCall(), operatorCall()]);
  for (let i = 0; i < 6; i++) {
    const R = await liveShop('race' + i), c = await read('clients', R.slug), body = { action: 'cancel_service', slug: R.slug, expectedRevision: operator.managementRevision(c), reason: 'INTERNAL-ONLY race' };
    const [o, s] = await order(i, () => owner(R, 'pause'), () => call(manage, '/api/manage', body, opToken));
    const final = await shape(R.slug), saved = await read('clients', R.slug);
    assert.ok([o.status, s.status].includes(200), JSON.stringify([o.status, s.status]));
    assert.deepEqual(final.channels, { web: { active: false }, voice: { active: false }, sms: { active: false } });
    if (final.status === 'cancelled') { assert.equal(s.status, 200); assert.equal(final.tasks, 0); assert.equal(final.billingStopQueued, true); assert.equal(saved.lifecycleNotice.action, 'cancel'); }
    else { assert.equal(final.status, 'paused'); assert.equal(s.status, 409); assert.equal(final.tasks, 1); assert.equal(final.billingStopQueued, false); assert.equal(saved.lifecycleNotice, undefined); }
    runs.push({ order: ['owner-first', 'operator-first', 'parallel'][i % 3], owner: o.status, operator: s.status, final: final.status });
  }
  return runs;
});
await check('owner cancel racing operator pause: cancel always ends with tasks and billing stop handled', async () => {
  const runs = [], order = async (i, ownerCall, operatorCall) => i % 3 === 0 ? [await ownerCall(), await operatorCall()] : i % 3 === 1 ? (([s, o]) => [o, s])([await operatorCall(), await ownerCall()]) : Promise.all([ownerCall(), operatorCall()]);
  for (let i = 0; i < 6; i++) {
    const R = await liveShop('race2-' + i), c = await read('clients', R.slug), body = { action: 'pause', slug: R.slug, expectedRevision: operator.managementRevision(c), reason: 'INTERNAL-ONLY race' };
    const [o, s] = await order(i, () => owner(R, 'cancel', { reason: 'owner stop' }), () => call(manage, '/api/manage', body, opToken));
    const final = await shape(R.slug); assert.equal(o.status, 200); assert.equal(final.status, 'cancelled'); assert.equal(final.tasks, 0); assert.equal(final.billingStopQueued, true);
    runs.push({ order: ['owner-first', 'operator-first', 'parallel'][i % 3], owner: o.status, operator: s.status, final: final.status });
  }
  return runs;
});

// ---- 6. Erasure (proposal 18) ----
await check('an erasure record blocks every reopen, even before the client row is gone', async () => {
  const E = await liveShop('erasing'); assert.equal((await owner(E, 'cancel', { reason: 'stop' })).status, 200);
  const c = await read('clients', E.slug); await store.put('workspace_erasures', `${E.slug}/${tenant(c)}`, { version: 1, slug: E.slug, tenant: tenant(c), state: 'retry_required' });
  const byOperator = await op(E.slug, 'reopen_workspace'), byOwner = await owner(E, 'reopen_workspace', { expectedRevision: setup.configurationRevision(c) });
  assert.equal(byOperator.status, 410); assert.equal(byOperator.body.error, 'workspace_erased'); assert.equal(byOwner.status, 410); assert.equal((await read('clients', E.slug)).status, 'cancelled');
});
if (erasureAvailable) await check('erased workspace cannot be reopened and its email signs up fresh (proposal 18 stacked)', async () => {
  const E = await liveShop('erased'); await store.del('workspace_billing', `${E.slug}/${tenant(E.c)}`);
  assert.equal((await op(E.slug, 'cancel_service')).status, 200);
  const c = await read('clients', E.slug), erased = await call(manage, '/api/manage', { action: 'erase_workspace', slug: E.slug, confirmSlug: E.slug, expectedRevision: operator.managementRevision(c), reason: 'Owner asked for erasure' }, opToken);
  assert.equal(erased.status, 200, JSON.stringify(erased.body).slice(0, 300)); assert.equal(await read('clients', E.slug), null);
  assert.equal((await op(E.slug, 'reopen_workspace').catch(() => ({ status: 404 }))).status === 200, false);
  assert.equal((await call(manage, '/api/manage', { action: 'reopen_workspace', slug: E.slug, expectedRevision: 'f'.repeat(64), reason: 'try reopen erased' }, opToken)).status, 404);
  const token = await session(E.email), again = await call(onboard, '/api/onboard', signupBody('erased', E.email), token);
  assert.equal(again.status, 200, JSON.stringify(again.body).slice(0, 200)); assert.notEqual(again.body.slug, E.slug); assert.equal(again.body.client.status, 'testing'); assert.equal(again.body.existing, false);
  assert.deepEqual(await clientsFor(E.email), [again.body.slug]);
  return { erased: E.slug, fresh: again.body.slug };
});
else results.push({ name: 'erased workspace cannot be reopened and its email signs up fresh (proposal 18 stacked)', pass: true, skipped: 'lib/data-erasure.mjs not present; run on a tree with proposal 18 applied' });

// ---- optional browser screenshots ----

// ---- QA-LIFE additions (F1-F4 and untested authorization paths) ----
await check('QA: a support cancellation is support-reopen only unless the operator allows owner reopen', async () => {
  for (const cat of ['other', 'billing', 'service_issue', undefined]) {
    const S = await liveShop('qadef' + (cat || 'x').slice(0, 3)); assert.equal((await op(S.slug, 'cancel_service', cat ? { reasonCategory: cat } : {})).status, 200);
    const c = await read('clients', S.slug), denied = await owner(S, 'reopen_workspace', { expectedRevision: setup.configurationRevision(c) });
    assert.equal(denied.status, 403, String(cat)); assert.equal(denied.body.error, 'reopen_requires_support'); assert.deepEqual(await read('clients', S.slug), c);
    const again = await call(onboard, '/api/onboard', signupBody('qadef', S.email), S.token); assert.equal(again.status, 409); assert.equal(again.body.reopen.available, false);
  }
  const Y = await liveShop('qayes'); assert.equal((await op(Y.slug, 'cancel_service', { reasonCategory: 'owner_request', ownerMayReopen: true })).status, 200);
  assert.equal((await owner(Y, 'reopen_workspace', { expectedRevision: setup.configurationRevision(await read('clients', Y.slug)) })).status, 200);
  const P = await liveShop('qapol'); assert.equal((await op(P.slug, 'cancel_service', { reasonCategory: 'policy_review', ownerMayReopen: true })).status, 200);
  assert.equal((await owner(P, 'reopen_workspace', { expectedRevision: setup.configurationRevision(await read('clients', P.slug)) })).status, 403, 'policy_review is never owner-reopenable');
  assert.equal((await op(P.slug, 'cancel_service', { ownerMayReopen: 'yes' })).status, 409, 'closed account');
  const T = await liveShop('qatype'); assert.equal((await op(T.slug, 'cancel_service', { ownerMayReopen: 'yes' })).status, 400);
});
await check('QA: another signed-in person cannot reopen, and the owner cannot reopen an open workspace', async () => {
  const S = await liveShop('qaxt'); assert.equal((await owner(S, 'cancel', { reason: 'stop' })).status, 200);
  const before = await read('clients', S.slug), stranger = await session('stranger-' + serial + '@example.test');
  const r = await call(client, '/api/client?c=' + S.slug, { action: 'reopen_workspace', expectedRevision: setup.configurationRevision(before) }, stranger);
  assert.equal(r.status, 403); assert.deepEqual(await read('clients', S.slug), before);
  const O = await liveShop('qaopen'), open = await read('clients', O.slug), r2 = await owner(O, 'reopen_workspace', { expectedRevision: setup.configurationRevision(open) });
  assert.equal(r2.status, 409); assert.equal(r2.body.error, 'not_closed'); assert.deepEqual(await read('clients', O.slug), open);
});
await check('QA: repeating the owner Cancel on a support-cancelled workspace sends no more support email', async () => {
  const S = await liveShop('qarep'); assert.equal((await op(S.slug, 'cancel_service', { reasonCategory: 'billing' })).status, 200);
  const before = mailTo(S.email).length; for (let i = 0; i < 3; i++) assert.equal((await owner(S, 'cancel', { reason: 'again' })).status, 200);
  assert.equal(mailTo(S.email).length, before); assert.equal(await tasksFor(S.slug), 0); assert.ok((await billing(S.slug)).stopRequestedAt);
});
await check('QA: reopen waits until phone and texting work has observed the cancellation', async () => {
  for (const [storeName, open, settled] of [['voice_activation_intents', { state: 'ready' }, { state: 'cleanup_pending', cancelRequestedAt: new Date().toISOString() }], ['messaging_activation', { state: 'ready' }, { state: 'cancel_pending', cancelRequestedAt: new Date().toISOString() }], ['phone_activation_intents', { state: 'purchase_pending' }, { state: 'cancelled' }]]) {
    const S = await liveShop('qasvc' + storeName.slice(0, 4)); assert.equal((await owner(S, 'cancel', { reason: 'stop' })).status, 200);
    const c = await read('clients', S.slug), key = `${S.slug}/qa-${storeName}`;
    await store.put(storeName, key, { slug: S.slug, tenantIdentity: tenant(c), ...open });
    await store.put(storeName, `${S.slug}/qa-foreign`, { slug: S.slug, tenantIdentity: 'f'.repeat(64), state: 'ready' });
    const cfg = setup.configurationRevision(c), blocked = await owner(S, 'reopen_workspace', { expectedRevision: cfg });
    assert.equal(blocked.status, 409, storeName); assert.equal(blocked.body.error, 'service_cleanup_pending'); assert.equal((await read('clients', S.slug)).status, 'cancelled');
    assert.equal((await op(S.slug, 'reopen_workspace')).status, 409, storeName + ' operator');
    await store.put(storeName, key, { slug: S.slug, tenantIdentity: tenant(c), ...settled });
    assert.equal((await owner(S, 'reopen_workspace', { expectedRevision: cfg })).status, 200, storeName + ' after cleanup started');
  }
});
await check('QA: an erasure marker on the client row blocks both reopens', async () => {
  const S = await liveShop('qamark'); assert.equal((await owner(S, 'cancel', { reason: 'stop' })).status, 200);
  const c = await read('clients', S.slug); c.erasureStartedAt = new Date().toISOString(); await store.put('clients', S.slug, c);
  assert.equal((await owner(S, 'reopen_workspace', { expectedRevision: setup.configurationRevision(c) })).status, 403, 'owner sees support-only');
  assert.equal((await op(S.slug, 'reopen_workspace')).status, 410);
  assert.equal((await read('clients', S.slug)).status, 'cancelled');
});
// ---- Revision 2 additions ----
await check('R2: owner and operator both see that shutdown is still finishing, and the refused reopen changes nothing', async () => {
  const S = await liveShop('r2fin'); assert.equal((await owner(S, 'cancel', { reason: 'stop' })).status, 200);
  const c = await read('clients', S.slug), key = `${S.slug}/r2-voice`, cfg = setup.configurationRevision(c);
  await store.put('voice_activation_intents', key, { slug: S.slug, tenantIdentity: tenant(c), state: 'ready' });
  const view = async () => (await call(client, '/api/client?c=' + S.slug, null, S.token, 'GET')).body;
  assert.equal((await view()).lifecycleCleanupPending, true);
  let lc = (await operator.customerView(await read('clients', S.slug), true)).lifecycle;
  assert.deepEqual(lc.cleanupPending, ['Phone answering']); assert.equal(lc.reopenAvailable, false); assert.equal(lc.ownerCanReopen, true);
  const before = await read('clients', S.slug), refused = await owner(S, 'reopen_workspace', { expectedRevision: cfg });
  assert.equal(refused.status, 409); assert.equal(refused.body.error, 'service_cleanup_pending'); assert.match(refused.body.message, /finishing the shutdown/); assert.match(refused.body.message, /Nothing was changed/);
  assert.deepEqual(await read('clients', S.slug), before);
  await store.put('voice_activation_intents', key, { slug: S.slug, tenantIdentity: tenant(c), state: 'cleanup_pending', cancelRequestedAt: new Date().toISOString() });
  assert.equal((await view()).lifecycleCleanupPending, false);
  lc = (await operator.customerView(await read('clients', S.slug), true)).lifecycle; assert.deepEqual(lc.cleanupPending, []); assert.equal(lc.reopenAvailable, true);
  const O = await liveShop('r2open');
  assert.equal((await call(client, '/api/client?c=' + O.slug, null, O.token, 'GET')).body.lifecycleCleanupPending, false, 'open workspace never reports shutdown');
});
await check('R2: Resume refuses to restore website chat while the AI allowance is exhausted (owner and operator)', async () => {
  const saved = { key: process.env.ANTHROPIC_API_KEY, fake: process.env.MC_FAKE_MODEL, limit: process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT };
  const restore = () => { for (const [name, value] of [['ANTHROPIC_API_KEY', saved.key], ['MC_FAKE_MODEL', saved.fake], ['MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT', saved.limit]]) if (value === undefined) delete process.env[name]; else process.env[name] = value; };
  // Readiness needs a configured model; every outbound request stays intercepted and no model call is made by Resume.
  Object.assign(process.env, { ANTHROPIC_API_KEY: 'intercepted-never-sent', MC_FAKE_MODEL: '0' });
  try {
    const shops = [await liveShop('r2aio'), await liveShop('r2aiw')];
    for (const shop of shops) {
      const c = await read('clients', shop.slug), rev = setup.configurationRevision(c);
      c.setupProof = { ...(c.setupProof || {}), reviewedRevision: rev, reviewedAt: new Date().toISOString(), testedRevision: rev, testMode: 'live' }; await store.put('clients', c.slug, c);
      assert.equal(setup.setupReadiness(await read('clients', shop.slug)).canActivateWeb, true, 'fixture must be ready so only the allowance differs');
    }
    assert.equal((await op(shops[0].slug, 'pause')).status, 200); assert.equal((await owner(shops[1], 'pause')).status, 200);
    process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = '0';
    const [o, w] = shops, ownerResume = async () => owner(w, 'resume_services', { expectedRevision: setup.configurationRevision(await read('clients', w.slug)) });
    const before = [await read('clients', o.slug), await read('clients', w.slug)];
    const ro = await op(o.slug, 'resume'), rw = await ownerResume();
    assert.equal(ro.status, 409, 'operator resume ' + JSON.stringify(ro.body)); assert.equal(rw.status, 409, 'owner resume ' + JSON.stringify(rw.body));
    assert.deepEqual([await read('clients', o.slug), await read('clients', w.slug)], before, 'a refused resume changes nothing');
    delete process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT;
    assert.equal((await op(o.slug, 'resume')).status, 200); assert.equal((await ownerResume()).status, 202);
    for (const shop of shops) { const after = await read('clients', shop.slug); assert.equal(after.status, 'live'); assert.equal(after.channels.web.active, true, 'web restored once the allowance is available'); }
  } finally { restore(); }
});
if (arg('--browser')) {
  const dir = arg('--screens'); mkdirSync(dir, { recursive: true });
  const { chromium } = await import(arg('--browser'));
  const root = new URL('..', import.meta.url).pathname, handlers = { '/api/manage': manage, '/api/client': client, '/api/onboard': onboard, '/api/access': (await import('../netlify/functions/access.mjs')).default };
  const unhandled = [], pageErrors = [];
  const browser = await chromium.launch({ headless: true, ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : {}) }), shots = [];
  // Scenario shops for the screenshots.
  const V = await liveShop('screens'); assert.equal((await op(V.slug, 'pause', { reasonCategory: 'billing', customerMessage: 'Please update the card on file and reply to this email.' })).status, 200);
  const L = await liveShop('pausedlg');
  const W = await liveShop('stopped'); assert.equal((await op(W.slug, 'cancel_service', { reasonCategory: 'owner_request', ownerMayReopen: true })).status, 200);
  const Z = await liveShop('resign'); assert.equal((await owner(Z, 'cancel', { reason: 'Seasonal break' })).status, 200);
  const page = async (width, path, setup) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.startsWith('/api/') && !handlers[url.pathname]) unhandled.push(url.pathname);
      if (handlers[url.pathname]) { const body = request.postData(); const response = await handlers[url.pathname](new Request(url, { method: request.method(), headers: request.headers(), ...(body ? { body } : {}) }), { ip: '192.0.2.9' }); return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }); }
      const file = root + decodeURIComponent(url.pathname.slice(1)); if (!existsSync(file) || url.pathname.includes('..')) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html', body: readFileSync(file) });
    });
    const p = await context.newPage(); p.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 200))); await setup(p); return { p, context };
  };
  const shot = async (p, name, overflow = true) => { const file = `${dir}/${name}.png`; await p.screenshot({ path: file, fullPage: false }); const fits = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); shots.push({ name, file, fitsWidth: fits }); if (overflow) assert.ok(fits, name + ' overflows'); };
  await check('screens: admin dialog separates customer-facing reason from internal reason; closed account offers Reopen', async () => {
    for (const width of [390, 1440]) {
      const { p, context } = await page(width, '/admin.html', async p => { await p.goto(base + '/admin.html'); await p.evaluate(t => sessionStorage.setItem('mc-operator-session-v1', t), opToken); await p.reload(); await p.locator('#app:not([hidden])').waitFor(); });
      await p.locator('[data-view=customers]').click(); await p.locator(`#customers [data-customer="${N.slug}"]`).click(); await p.locator('#detailTitle').waitFor();
      // N is cancelled by support: the Reopen action and the owner notice receipt are shown.
      await p.locator('[data-action=reopen_workspace]').waitFor(); await p.locator('[data-lifecycle-notice]').scrollIntoViewIfNeeded(); await shot(p, `admin-closed-reopen-${width}`);
      await p.locator('[data-action=reopen_workspace]').click(); await p.locator('#lifecycleFields:not([hidden])').waitFor(); await shot(p, `admin-reopen-dialog-${width}`);
      await p.locator('#actionCancel').click();
      await p.locator('[data-view=customers]').click(); await p.locator(`#customers [data-customer="${L.slug}"]`).click(); await p.locator('#detailTitle').waitFor();
      const pause = p.locator('[data-action=pause]'); if (await pause.count()) { await pause.click(); await p.locator('#lifecycleFields:not([hidden])').waitFor(); await p.selectOption('#actionCategory', 'billing'); await p.fill('#actionCustomerMessage', 'Please update the card on file.'); await p.fill('#actionReason', 'Card declined twice; internal ticket 4411'); await shot(p, `admin-pause-dialog-${width}`); await p.locator('#actionCancel').click(); }
      await context.close();
    }
    if (width390Missing(shots, 'admin-pause-dialog-390')) throw new Error('pause dialog screenshot missing');
  });
  await check('screens: owner desk shows who paused or stopped service, why, and Reopen', async () => {
    for (const width of [390, 1440]) {
      for (const [shop, label] of [[V, 'paused-by-support'], [W, 'cancelled-by-support'], [Z, 'cancelled-by-owner']]) {
        const { p, context } = await page(width, '/desk.html', async p => { await p.goto(base + '/desk.html?c=' + shop.slug); await p.evaluate(t => { sessionStorage.setItem('mc-onboarding-session-v1', t); history.replaceState(null, '', location.pathname + location.search + '#account'); }, shop.token); await p.reload(); });
        await p.locator('#accountServiceSummary').waitFor({ state: 'attached' }); await p.waitForFunction(() => (document.querySelector('#accountServiceSummary')?.textContent || '').length > 10, null, { timeout: 15000 });
        const text = await p.locator('#accountServiceSummary').textContent();
        if (label !== 'cancelled-by-owner') assert.match(text, /by Machines & Cloud support/); assert.equal(text.includes('INTERNAL-ONLY'), false);
        if (label !== 'paused-by-support') assert.ok(await p.locator('#reopenWorkspace').isVisible(), label + ': no Reopen button');
        await p.locator('#accountServiceSummary').scrollIntoViewIfNeeded(); await shot(p, `desk-account-${label}-${width}`);
        await p.evaluate(() => history.replaceState(null, '', location.pathname + location.search)); await p.reload(); await p.locator('#supportLifecycleNotice:not([hidden])').waitFor({ timeout: 15000 }); await p.locator('#supportLifecycleNotice').scrollIntoViewIfNeeded(); await shot(p, `desk-home-${label}-${width}`);
        await context.close();
      }
    }
    // The owner reopens from Account in the real desk UI.
    const { p, context } = await page(390, '/desk.html', async p => { await p.goto(base + '/desk.html?c=' + Z.slug); await p.evaluate(t => { sessionStorage.setItem('mc-onboarding-session-v1', t); history.replaceState(null, '', location.pathname + location.search + '#account'); }, Z.token); await p.reload(); });
    await p.locator('#reopenWorkspace').click(); await p.waitForFunction(() => /Workspace reopened/.test(document.querySelector('#accountServiceMessage')?.textContent || ''), null, { timeout: 15000 });
    assert.equal((await read('clients', Z.slug)).status, 'testing'); await shot(p, 'desk-account-after-owner-reopen-390'); await context.close();
  });
  await check('R2 screens: shutdown-finishing state for owner and operator; support sets owner reopen explicitly', async () => {
    const Fs = await liveShop('r2scr'); assert.equal((await owner(Fs, 'cancel', { reason: 'stop' })).status, 200);
    const fc = await read('clients', Fs.slug); await store.put('voice_activation_intents', `${Fs.slug}/r2-screen`, { slug: Fs.slug, tenantIdentity: tenant(fc), state: 'ready' });
    { // Owner: the Account summary says shutdown is finishing; a reopen attempt is a calm refusal, not an error or a sign-out.
      const { p, context } = await page(390, '/desk.html', async p => { await p.goto(base + '/desk.html?c=' + Fs.slug); await p.evaluate(t => { sessionStorage.setItem('mc-onboarding-session-v1', t); history.replaceState(null, '', location.pathname + location.search + '#account'); }, Fs.token); await p.reload(); });
      await p.waitForFunction(() => /finishing the shutdown/.test(document.querySelector('#accountServiceSummary')?.textContent || ''), null, { timeout: 15000 });
      await p.locator('#reopenWorkspace').click(); await p.waitForFunction(() => /Nothing was changed/.test(document.querySelector('#accountServiceMessage')?.textContent || ''), null, { timeout: 15000 });
      assert.equal(await p.locator('#accountServiceMessage').getAttribute('data-error'), 'false'); assert.equal((await read('clients', Fs.slug)).status, 'cancelled');
      assert.ok(await p.locator('#reopenWorkspace').isVisible(), 'owner stays signed in on the Account page');
      await shot(p, 'r2-desk-shutdown-finishing-390'); await context.close();
    }
    const G = await liveShop('r2allow');
    for (const width of [390, 1440]) {
      const { p, context } = await page(width, '/admin.html', async p => { await p.goto(base + '/admin.html'); await p.evaluate(t => sessionStorage.setItem('mc-operator-session-v1', t), opToken); await p.reload(); await p.locator('#app:not([hidden])').waitFor(); });
      await p.locator('[data-view=customers]').click(); await p.locator(`#customers [data-customer="${Fs.slug}"]`).click(); await p.locator('#detailTitle').waitFor();
      const status = p.locator('[data-lifecycle-status]'); await status.waitFor(); const text = await status.textContent();
      assert.match(text, /Shutdown still finishing: Phone answering/); assert.match(text, /owner may reopen/);
      await status.scrollIntoViewIfNeeded(); await shot(p, `r2-admin-shutdown-finishing-${width}`);
      if (width === 1440) {
        await p.locator('[data-view=customers]').click(); await p.locator(`#customers [data-customer="${G.slug}"]`).click(); await p.locator('#detailTitle').waitFor();
        await p.locator('[data-action=cancel_service]').click(); await p.locator('#ownerReopenField:not([hidden])').waitFor();
        assert.equal(await p.locator('#actionOwnerMayReopen').isChecked(), false, 'unchecked by default');
        await p.selectOption('#actionCategory', 'policy_review'); assert.equal(await p.locator('#actionOwnerMayReopen').isDisabled(), true, 'policy review cannot be owner-reopenable');
        await p.selectOption('#actionCategory', 'owner_request'); assert.equal(await p.locator('#actionOwnerMayReopen').isDisabled(), false);
        await p.locator('#actionOwnerMayReopen').check(); await p.fill('#actionReason', 'Owner asked to stop for the season'); await shot(p, 'r2-admin-cancel-owner-may-reopen-1440');
        await p.locator('#actionSubmit').click(); await p.waitForFunction(() => !document.querySelector('#actionDialog')?.open, null, { timeout: 15000 });
        const cancelled = await read('clients', G.slug); assert.equal(cancelled.status, 'cancelled'); assert.deepEqual(cancelled.cancelledBy, { role: 'operator', category: 'owner_request', ownerMayReopen: true });
        await p.locator('[data-lifecycle-status]').waitFor(); assert.match(await p.locator('[data-lifecycle-status]').textContent(), /Shutdown complete[\s\S]*owner may reopen/);
      }
      await context.close();
    }
  });
  await browser.close();
  results.push({ name: 'screenshots', pass: pageErrors.length === 0, detail: { shots, unhandled: [...new Set(unhandled)], pageErrors }, ...(pageErrors.length ? { error: pageErrors.join(' | ') } : {}) });
}
function width390Missing(list, name) { return !list.some(row => row.name === name); }

const failed = results.filter(row => !row.pass), summary = { check: 'account-lifecycle-check', passed: results.length - failed.length, failed: failed.length, total: results.length, emailsCaptured: mail.length, blockedRequests: blocked, erasureStacked: erasureAvailable };
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify({ ...summary, results, mail: mail.map(row => ({ to: row.to, subject: row.subject, text: row.text })) }, null, 1));
for (const row of results) console.log((row.skipped ? 'SKIP ' : row.pass ? 'PASS ' : 'FAIL ') + row.name + (row.pass ? '' : ' :: ' + row.error));
console.log(JSON.stringify(summary));
process.exit(failed.length ? 1 : 0);
