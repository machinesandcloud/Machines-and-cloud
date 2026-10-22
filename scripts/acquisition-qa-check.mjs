// Independent acquisition API QA. Synthetic records; installed SDK storage fixture; no network.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!process.argv.includes('--output') || !/^scratchpad\/[a-z0-9-]+\.json$/.test(output) || existsSync(output)) throw new Error('Pass a new --output scratchpad/name.json');
const result = { at: new Date().toISOString(), mode: 'independent actual handlers; memory plus intercepted installed Blobs SDK; no external requests', checks: [], interceptedMail: [], blockedNetwork: [], conflicts: 0 };
const sources = ['netlify/functions/intake.mjs', 'netlify/functions/lib/intake.mjs', 'netlify/functions/access.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/onboard.mjs', 'netlify/functions/client.mjs', 'netlify/functions/lib/accounts.mjs', 'netlify/functions/lib/setup.mjs', 'netlify/functions/lib/store.mjs'];
const hash = value => createHash('sha256').update(value).digest('hex');
const hashes = () => Object.fromEntries(sources.map(file => [file, hash(readFileSync(file))]));
result.sourceBefore = hashes();
const denied = () => { throw new Error('Acquisition QA network disabled'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = denied; syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_)/.test(key)) delete process.env[key];
const base = 'http://127.0.0.1:8897';
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: base, PUBLIC_SITE_URL: base, ADMIN_KEY: 'qa-local-admin', RESEND_API_KEY: 'qa-offline-placeholder' });
const blobs = new Map(); let revision = 0, fault = null, serial = 0, heldRead = null;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || 'GET').toUpperCase();
  if (url.origin === 'https://api.resend.com' && url.pathname === '/emails' && method === 'POST') {
    const payload = JSON.parse(init.body); assert.equal(payload.subject, 'Your Machines & Cloud sign-in link');
    result.interceptedMail.push(payload); return Response.json({ id: 'qa-intercepted-only' });
  }
  if (url.origin !== 'https://acquisition-blobs.invalid') { result.blockedNetwork.push({ origin: url.origin, path: url.pathname }); return denied(); }
  const [, site, kind, ...parts] = url.pathname.split('/').map(decodeURIComponent), key = parts.join('/'), name = kind + '/' + key;
  assert.equal(site, 'qa-site'); assert.ok(kind.startsWith('site:'));
  if (fault && fault.kind === kind && fault.key === key && fault.method === method) {
    if (fault.skip) fault.skip--; else return new Response('Injected storage rejection', { status: 400 });
  }
  if (method === 'GET' && !key) return Response.json({ blobs: [...blobs.keys()].filter(name => name.startsWith(kind + '/' + (url.searchParams.get('prefix') || ''))).map(name => ({ key: name.slice(kind.length + 1) })), directories: [] });
  const current = blobs.get(name), headers = new Headers(init.headers);
  if (heldRead && method === 'GET' && kind === heldRead.kind && key === heldRead.key) { const held = heldRead; heldRead = null; held.reached(); await held.release; }
  if (method === 'GET') return current ? new Response(current.value, { headers: { etag: current.etag, 'content-type': 'application/json' } }) : new Response(null, { status: 404 });
  if (method === 'DELETE') { blobs.delete(name); return new Response(null, { status: 204 }); }
  assert.equal(method, 'PUT');
  if ((headers.get('if-none-match') === '*' && current) || (headers.has('if-match') && headers.get('if-match') !== current?.etag)) { result.conflicts++; return new Response(null, { status: 412 }); }
  const etag = String(++revision); blobs.set(name, { value: init.body, etag }); return new Response(null, { headers: { etag } });
};
const { setEnvironmentContext } = await import('@netlify/blobs');
setEnvironmentContext({ siteID: 'qa-site', token: 'qa-token', edgeURL: 'https://acquisition-eventual.invalid', uncachedEdgeURL: 'https://acquisition-blobs.invalid' });
const store = await import('../netlify/functions/lib/store.mjs');
const accounts = await import('../netlify/functions/lib/accounts.mjs');
const access = await import('../netlify/functions/lib/access.mjs');
const intake = await import('../netlify/functions/lib/intake.mjs');
const intakeAPI = (await import('../netlify/functions/intake.mjs')).default;
const accessAPI = (await import('../netlify/functions/access.mjs')).default;
const onboardAPI = (await import('../netlify/functions/onboard.mjs')).default;
const clientAPI = (await import('../netlify/functions/client.mjs')).default;
const read = accounts.strictRead;
const request = (path, body, token, method = 'POST', extra = {}) => new Request(base + path, { method, headers: { origin: base, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...extra }, ...(['GET', 'HEAD'].includes(method) ? {} : { body: JSON.stringify(body) }) });
const invoke = async (handler, path, body, token, method = 'POST', extra) => { const response = await handler(request(path, body, token, method, extra), { ip: '192.0.2.' + (++serial % 230 + 1) }); return { status: response.status, body: await response.json(), headers: Object.fromEntries(response.headers) }; };
const check = async (name, run) => { try { const detail = await run(); result.checks.push({ name, pass: true, ...(detail === undefined ? {} : { detail }) }); } catch (error) { result.checks.push({ name, pass: false, error: error.message, stack: error.stack }); } };
const payload = (email, changes = {}) => ({ submissionId: hash('qa-submission-' + ++serial), name: 'QA Owner', email, business: 'QA Air', trade: 'hvac', goal: 'missed_calls', marketingConsent: false, botfield: '', ...changes });
const createSession = async email => { const token = hash('qa-session-' + ++serial); await store.put('access_sessions', access.accessHash(token), { email, status: 'active', scope: 'onboarding', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }); return token; };
const mailbox = async email => {
  if (process.env.MC_MEMORY_STORE === '1') return await read('access_outbox', access.accessHash(email));
  const message = result.interceptedMail.findLast(row => row.to.includes(email));
  const link = message?.text.match(/http:\/\/127\.0\.0\.1:8897\/onboard\.html[^\s]*/)?.[0];
  return link ? { link, token: new URL(link).hash.slice('#verify='.length) } : null;
};
async function suite(mode) {
  process.env.MC_MEMORY_STORE = mode === 'memory' ? '1' : '0';
  const label = name => mode + ': ' + name, email = 'qa-main-' + mode + '@example.test', submission = payload(email, { marketingConsent: true });
  let capture, token, session, state;
  await check(label('durable capture creates prospect plus opaque hashed handoff and no account/mail'), async () => {
    const beforeMail = result.interceptedMail.length; capture = await invoke(intakeAPI, '/api/intake', submission); assert.equal(capture.status, 202); assert.equal(capture.body.ok, true);
    const row = await read('prospects', accounts.accountKey(email)), handoff = await read('intake_handoffs', hash(capture.body.handoff));
    assert.equal(row.name, submission.name); assert.equal(row.emailVerifiedAt, null); assert.equal(row.marketing.preference, false); assert.equal(row.marketing.requested, true); assert.equal(handoff.status, 'pending');
    assert.equal(await accounts.findVerifiedAccount(email), null); assert.equal(result.interceptedMail.length, beforeMail); assert.equal(await read('access_outbox', access.accessHash(email)), null);
    const next = new URL(capture.body.next, base); assert.equal(next.pathname, '/onboard.html'); assert.equal(next.search, ''); assert.equal(next.hash, '#intake=' + capture.body.handoff);
    assert.ok(!JSON.stringify(capture.body).includes(email)); assert.ok(!JSON.stringify(await read('intake_submissions', hash(submission.submissionId))).includes(submission.submissionId));
  });
  await check(label('double submit and retries return same handoff without duplicate/overwrite'), async () => {
    const before = await read('prospects', accounts.accountKey(email));
    const replies = await Promise.all(Array.from({ length: 5 }, () => invoke(intakeAPI, '/api/intake', submission)));
    assert.ok(replies.every(row => row.status === 202 && row.body.handoff === capture.body.handoff)); assert.deepEqual(await read('prospects', accounts.accountKey(email)), before);
    const changed = await invoke(intakeAPI, '/api/intake', { ...submission, business: 'Changed after uncertain save' }); assert.equal(changed.status, 409); assert.deepEqual(await read('prospects', accounts.accountKey(email)), before);
  });
  await check(label('anonymous repeat cannot change prior identity, preference or suppression'), async () => {
    const prior = await read('prospects', accounts.accountKey(email)); await store.put('prospects', accounts.accountKey(email), { ...prior, marketing: { ...prior.marketing, preference: true, confirmedAt: '2026-01-01T00:00:00Z', suppressedAt: '2026-01-02T00:00:00Z' } });
    const before = await read('prospects', accounts.accountKey(email)); const response = await invoke(intakeAPI, '/api/intake', payload(email, { name: 'Anonymous replacement', marketingConsent: true })); assert.equal(response.status, 202); assert.deepEqual(await read('prospects', accounts.accountKey(email)), before);
    await store.put('prospects', accounts.accountKey(email), prior);
  });
  await check(label('handoff cannot read lead, sign in, or create account without mailbox proof'), async () => {
    assert.equal((await invoke(intakeAPI, '/api/intake?handoff=' + capture.body.handoff, null, null, 'GET')).status, 403);
    assert.equal((await invoke(accessAPI, '/api/access', null, capture.body.handoff, 'GET')).status, 401);
    assert.equal((await invoke(onboardAPI, '/api/onboard', { name: 'Intruder', business: 'Intruder', phone: '7135550111' }, capture.body.handoff)).status, 401);
  });
  await check(label('email request explicit, generic and wrong-email handoff does not carry answers'), async () => {
    const wrong = 'qa-wrong-' + mode + '@example.test'; const sent = await invoke(accessAPI, '/api/access', { action: 'request_link', email: wrong, intake: capture.body.handoff, redirect: 'https://attacker.invalid/' }); assert.equal(sent.status, 202);
    const mail = await mailbox(wrong); assert.ok(mail); assert.equal(new URL(mail.link).origin, base); assert.equal(new URL(mail.link).search, '');
    const response = await invoke(accessAPI, '/api/access', { action: 'exchange', token: mail.token }); assert.equal(response.status, 200);
    const wrongState = await invoke(accessAPI, '/api/access', null, response.body.session, 'GET'); assert.equal(wrongState.status, 200); assert.deepEqual(wrongState.body.draft.fields, {}); assert.equal(wrongState.body.existing, undefined);
    assert.equal((await invoke(accessAPI, '/api/access', { action: 'attach_intake', intake: capture.body.handoff }, response.body.session)).status, 409);
    assert.equal((await read('intake_handoffs', hash(capture.body.handoff))).status, 'pending');
  });
  await check(label('verified exchange is one-use, moves original answers to draft, not marketing enrollment'), async () => {
    assert.equal((await invoke(accessAPI, '/api/access', { action: 'request_link', email, intake: capture.body.handoff })).status, 202); const mail = await mailbox(email); token = mail.token;
    assert.equal((await read('access_tokens', access.accessHash(token))).status, 'pending'); const exchange = await invoke(accessAPI, '/api/access', { action: 'exchange', token }); assert.equal(exchange.status, 200); session = exchange.body.session;
    state = await invoke(accessAPI, '/api/access', null, session, 'GET'); assert.equal(state.status, 200); assert.equal(state.body.email, email); assert.equal(state.body.draft.fields.name, submission.name); assert.equal(state.body.draft.fields.business, submission.business); assert.equal(state.body.draft.fields.primaryGoal, submission.goal);
    assert.equal(state.body.marketing.preference, false); assert.equal(state.body.marketing.pendingRequest, true); assert.ok((await read('prospects', accounts.accountKey(email))).emailVerifiedAt);
    assert.equal((await invoke(accessAPI, '/api/access', { action: 'exchange', token })).status, 410);
  });
  await check(label('one-use handoff cannot overwrite edited answers or move to another session'), async () => {
    const fields = { ...state.body.draft.fields, name: 'Owner correction', desiredChannels: ['web', 'voice', 'sms', 'calendar'] };
    const save = await invoke(accessAPI, '/api/access', { fields, revision: state.body.draft.revision, step: 1 }, session, 'PUT'); assert.equal(save.status, 200);
    const before = await read('onboarding_drafts', accounts.accountKey(email)); await invoke(accessAPI, '/api/access', null, session, 'GET'); assert.deepEqual(await read('onboarding_drafts', accounts.accountKey(email)), before);
    const other = await createSession(email); assert.equal((await invoke(accessAPI, '/api/access', { action: 'attach_intake', intake: capture.body.handoff }, other)).status, 409); assert.deepEqual(await read('onboarding_drafts', accounts.accountKey(email)), before);
    const stale = await invoke(accessAPI, '/api/access', { fields: { name: 'Stale overwrite' }, revision: state.body.draft.revision, step: 0 }, session, 'PUT'); assert.equal(stale.status, 409); assert.deepEqual(await read('onboarding_drafts', accounts.accountKey(email)), before);
  });
  await check(label('marketing needs separate authenticated affirmative choice; suppression cannot reset'), async () => {
    assert.equal((await intake.prospectAudience('eligible')).some(row => row.email === email), false);
    let draft = await read('onboarding_drafts', accounts.accountKey(email)); let save = await invoke(accessAPI, '/api/access', { fields: draft.fields, revision: draft.revision, step: 1, marketingConsent: true }, session, 'PUT'); assert.equal(save.status, 200); assert.equal(save.body.marketing.preference, true);
    assert.equal((await intake.prospectAudience('eligible')).some(row => row.email === email), true); const row = await read('prospects', accounts.accountKey(email)); assert.equal(row.marketing.version, intake.MARKETING_VERSION); assert.equal(row.marketing.wording, intake.MARKETING_WORDING);
    await store.put('prospect_suppression', accounts.accountKey(email), { at: new Date().toISOString(), reason: 'qa-synthetic-unsubscribe' });
    draft = await read('onboarding_drafts', accounts.accountKey(email)); save = await invoke(accessAPI, '/api/access', { fields: draft.fields, revision: draft.revision, step: 1, marketingConsent: true }, session, 'PUT'); assert.equal(save.status, 200); assert.equal(save.body.marketing.preference, false); assert.equal((await intake.prospectAudience('eligible')).some(row => row.email === email), false);
  });
  await check(label('initial unchecked or changed verified preference can be affirmed later without an implicit permanent unsubscribe'), async () => {
    const choiceEmail = 'qa-choice-' + mode + '@example.test', choiceSession = await createSession(choiceEmail);
    let save = await invoke(accessAPI, '/api/access', { fields: {}, revision: 0, step: 0, marketingConsent: false }, choiceSession, 'PUT'); assert.equal(save.status, 200); assert.equal(save.body.marketing.preference, false); assert.equal(save.body.marketing.suppressed, false);
    save = await invoke(accessAPI, '/api/access', { fields: {}, revision: save.body.draft.revision, step: 0, marketingConsent: true }, choiceSession, 'PUT'); assert.equal(save.status, 200); assert.equal(save.body.marketing.preference, true);
    save = await invoke(accessAPI, '/api/access', { fields: {}, revision: save.body.draft.revision, step: 0, marketingConsent: false }, choiceSession, 'PUT'); assert.equal(save.status, 200); assert.equal(save.body.marketing.preference, false); assert.equal((await intake.prospectAudience('eligible')).some(row => row.email === choiceEmail), false);
    const choiceRow = await read('prospects', accounts.accountKey(choiceEmail)); assert.equal(choiceRow.marketing.history.length, 3); assert.deepEqual(choiceRow.marketing.history.map(row => row.preference), [false, true, false]);
  });
  await check(label('verified legitimate handoff replaces poisoned anonymous display identity and preserves intentionally blank saved answers'), async () => {
    const safeEmail = 'qa-identity-' + mode + '@example.test'; await invoke(intakeAPI, '/api/intake', payload(safeEmail, { name: 'Anonymous poison', business: 'Wrong business', marketingConsent: true }));
    const legitimate = await invoke(intakeAPI, '/api/intake', payload(safeEmail, { name: 'Legitimate Owner', business: 'Legitimate Business', goal: 'after_hours' }));
    const safeSession = await createSession(safeEmail); await store.put('onboarding_drafts', accounts.accountKey(safeEmail), { fields: { name: '', business: 'Saved Owner Business' }, revision: 1, step: 0 });
    const attached = await invoke(accessAPI, '/api/access', { action: 'attach_intake', intake: legitimate.body.handoff }, safeSession); assert.equal(attached.status, 200); assert.equal(attached.body.draft.fields.name, ''); assert.equal(attached.body.draft.fields.business, 'Saved Owner Business'); assert.equal(attached.body.draft.fields.primaryGoal, 'after_hours');
    const projection = (await intake.prospectAudience('all')).find(row => row.email === safeEmail); assert.equal(projection.name, 'Legitimate Owner'); assert.equal(projection.business, 'Legitimate Business'); assert.ok(projection.emailVerifiedAt); assert.equal(projection.marketingEligible, false);
    const before = await read('onboarding_drafts', accounts.accountKey(safeEmail)); const again = await invoke(accessAPI, '/api/access', { action: 'attach_intake', intake: legitimate.body.handoff }, safeSession); assert.equal(again.status, 200); assert.deepEqual(await read('onboarding_drafts', accounts.accountKey(safeEmail)), before);
  });
  await check(label('account create retains desired connections and returning lead cannot alter existing owner'), async () => {
    const initial = { name: 'Owner correction', business: 'QA Air', phone: '7135550111', email, trade: 'HVAC', city: 'Houston', serviceArea: 'Katy', services: 'AC repair', hours: 'Mon-Fri 8am-5pm', desiredChannels: ['web', 'voice', 'sms', 'calendar'], primaryGoal: 'missed_calls', plan: 'starter' };
    const created = await invoke(onboardAPI, '/api/onboard', initial, session); assert.equal(created.status, 200); assert.equal(created.body.key, undefined); assert.equal(new URL(created.body.portal).searchParams.has('k'), false);
    const client = await accounts.findVerifiedAccount(email); assert.deepEqual(client.onboarding.desiredChannels, initial.desiredChannels); assert.equal(client.onboarding.primaryGoal, initial.primaryGoal); assert.equal(client.channels.voice.active, false); assert.equal(client.channels.sms.active, false);
    const channelSave = await invoke(clientAPI, '/api/client?c=' + client.slug, { action: 'save_connection_preferences', desiredChannels: ['voice', 'calendar'] }, session); assert.equal(channelSave.status, 200); const selected = await accounts.findVerifiedAccount(email); assert.deepEqual(selected.onboarding.desiredChannels, ['voice', 'calendar']); assert.equal(selected.channels.voice.active, false); assert.equal(selected.channels.sms.active, false);
    const protectedConfig = { ...selected, onboarding: { ...selected.onboarding, desiredChannels: client.onboarding.desiredChannels } }; if (Object.hasOwn(client, 'updatedAt')) protectedConfig.updatedAt = client.updatedAt; else delete protectedConfig.updatedAt; assert.deepEqual(protectedConfig, client);
    assert.equal((await invoke(clientAPI, '/api/client?c=' + client.slug, { action: 'save_connection_preferences', desiredChannels: ['voice', 'voice'] }, session)).status, 400);
    assert.equal((await invoke(clientAPI, '/api/client?c=' + client.slug, { action: 'save_connection_preferences', desiredChannels: ['voice'] }, session, 'POST', { origin: 'https://attacker.invalid' })).status, 403);
    assert.ok([401, 403].includes((await invoke(clientAPI, '/api/client?c=' + client.slug, { action: 'save_connection_preferences', desiredChannels: ['voice'] }, capture.body.handoff)).status));
    const newer = await invoke(intakeAPI, '/api/intake', payload(email, { business: 'Anonymous business replacement' })); assert.equal(newer.status, 202); const existingSession = await createSession(email); const attach = await invoke(accessAPI, '/api/access', { action: 'attach_intake', intake: newer.body.handoff }, existingSession); assert.equal(attach.status, 200); assert.equal(attach.body.existing.slug, client.slug);
    const retry = await invoke(onboardAPI, '/api/onboard', { ...initial, business: 'Unwanted replacement' }, existingSession); assert.equal(retry.status, 200); assert.equal(retry.body.existing, true); assert.deepEqual(await accounts.findVerifiedAccount(email), selected);
    return { selected: selected.onboarding.desiredChannels, active: selected.channels };
  });
  await check(label('expired handoff and sign-in proof do not adopt answers'), async () => {
    const expiredEmail = 'qa-expired-' + mode + '@example.test', submission = payload(expiredEmail); const response = await invoke(intakeAPI, '/api/intake', submission); const key = hash(response.body.handoff), before = await read('intake_handoffs', key); await store.put('intake_handoffs', key, { ...before, expiresAt: '2000-01-01T00:00:00Z' });
    const localSession = await createSession(expiredEmail); assert.equal((await invoke(accessAPI, '/api/access', { action: 'attach_intake', intake: response.body.handoff }, localSession)).status, 409); assert.equal(await read('onboarding_drafts', accounts.accountKey(expiredEmail)), null);
    const expiredToken = hash('qa-expired-token-' + mode); await store.put('access_tokens', access.accessHash(expiredToken), { email: expiredEmail, status: 'pending', expiresAt: '2000-01-01T00:00:00Z' }); assert.equal((await invoke(accessAPI, '/api/access', { action: 'exchange', token: expiredToken })).status, 410);
  });
  await check(label('protected all/eligible exports distinguish consent and neutralize formulas'), async () => {
    const evilEmail = 'qa-csv-' + mode + '@example.test'; const response = await invoke(intakeAPI, '/api/intake', payload(evilEmail, { name: '=HYPERLINK("https://invalid")', business: '+SUM(1,2)' })); assert.equal(response.status, 202);
    const unauthorized = await invoke(intakeAPI, '/api/intake?audience=all&format=csv', null, null, 'GET'); assert.equal(unauthorized.status, 403);
    const allResponse = await intakeAPI(request('/api/intake?audience=all&format=csv', null, null, 'GET', { 'x-admin-key': process.env.ADMIN_KEY })); assert.equal(allResponse.status, 200); const csv = await allResponse.text(); assert.ok(csv.includes('"\'=HYPERLINK')); assert.ok(csv.includes('"\'+SUM'));
    const eligible = await invoke(intakeAPI, '/api/intake?audience=eligible', null, null, 'GET', { 'x-admin-key': process.env.ADMIN_KEY }); assert.equal(eligible.status, 200); assert.ok(eligible.body.prospects.every(row => row.marketingEligible === true && row.suppressed === false)); assert.ok(!eligible.body.prospects.some(row => row.email === evilEmail || row.email === email));
    return { allRows: csv.split('\r\n').length - 1, eligibleRows: eligible.body.prospects.length };
  });
  await check(label('invalid origin, media, fields, large payload and bot cannot save a prospect'), async () => {
    const rejectedEmail = 'qa-reject-' + mode + '@example.test', submission = payload(rejectedEmail);
    assert.equal((await invoke(intakeAPI, '/api/intake', submission, null, 'POST', { origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await invoke(intakeAPI, '/api/intake', submission, null, 'POST', { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await invoke(intakeAPI, '/api/intake', { ...submission, marketingConsent: 'true' })).status, 400);
    assert.equal((await invoke(intakeAPI, '/api/intake', { ...submission, unexpected: 'input' })).status, 400);
    assert.equal((await invoke(intakeAPI, '/api/intake', { ...submission, name: 'x'.repeat(5000) })).status, 413);
    const bot = await invoke(intakeAPI, '/api/intake', { ...submission, botfield: 'robot' }); assert.equal(bot.status, 202); assert.equal(bot.body.handoff, undefined); assert.equal(await read('prospects', accounts.accountKey(rejectedEmail)), null);
  });
  if (mode === 'sdk') {
    await check(label('failed opt-out projection immediately excludes old opt-in from eligible export'), async () => {
      const failedChoice = 'qa-consent-projection@example.test', localSession = await createSession(failedChoice);
      const first = await invoke(accessAPI, '/api/access', { fields: {}, revision: 0, step: 0, marketingConsent: true }, localSession, 'PUT'); assert.equal(first.status, 200); assert.equal((await intake.prospectAudience('eligible')).some(row => row.email === failedChoice), true);
      fault = { kind: 'site:prospects', key: accounts.accountKey(failedChoice), method: 'PUT' }; const rejected = await invoke(accessAPI, '/api/access', { fields: {}, revision: first.body.draft.revision, step: 0, marketingConsent: false }, localSession, 'PUT'); assert.equal(rejected.status, 200); assert.equal(rejected.body.marketingPending, true); assert.equal(rejected.body.draft.revision, first.body.draft.revision + 1); fault = null;
      assert.equal((await read('prospects', accounts.accountKey(failedChoice))).marketing.preference, true); assert.equal((await read('onboarding_drafts', accounts.accountKey(failedChoice))).emailPreference.preference, false);
      assert.equal((await intake.prospectAudience('eligible')).some(row => row.email === failedChoice), false); const recovered = await invoke(accessAPI, '/api/access', null, localSession, 'GET'); assert.equal(recovered.status, 200); assert.equal(recovered.body.marketing.preference, false);
      const retry = await invoke(accessAPI, '/api/access', { fields: {}, revision: rejected.body.draft.revision, step: 0, marketingConsent: false }, localSession, 'PUT'); assert.equal(retry.status, 200); assert.equal(retry.body.marketingPending, undefined); assert.equal((await read('prospects', accounts.accountKey(failedChoice))).marketing.preference, false);
    });
    await check(label('later verified opt-out wins an older delayed opt-in and exports fail closed'), async () => {
      const orderedEmail = 'qa-consent-order@example.test', orderedSession = await createSession(orderedEmail); let reached, release;
      const paused = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; }); heldRead = { kind: 'site:prospects', key: accounts.accountKey(orderedEmail), reached, release: gate };
      const older = invoke(accessAPI, '/api/access', { fields: { name: 'Ordered preference' }, revision: 0, step: 0, marketingConsent: true }, orderedSession, 'PUT'); await paused;
      const nextDraft = await read('onboarding_drafts', accounts.accountKey(orderedEmail)); assert.equal(nextDraft.revision, 1);
      const later = await invoke(accessAPI, '/api/access', { fields: nextDraft.fields, revision: 1, step: 0, marketingConsent: false }, orderedSession, 'PUT'); assert.equal(later.status, 200); assert.equal(later.body.marketing.preference, false);
      release(); const completed = await older; assert.equal(completed.status, 200); assert.equal(completed.body.marketing.preference, false); assert.equal((await intake.prospectAudience('eligible')).some(row => row.email === orderedEmail), false);
      assert.equal((await read('onboarding_drafts', accounts.accountKey(orderedEmail))).revision, 2);
    });
    await check(label('post-exchange projection failure leaves usable verified session for safe retry'), async () => {
      const recoverEmail = 'qa-adoption-retry@example.test', initial = await invoke(intakeAPI, '/api/intake', payload(recoverEmail));
      assert.equal((await invoke(accessAPI, '/api/access', { action: 'request_link', email: recoverEmail, intake: initial.body.handoff })).status, 202); const mail = await mailbox(recoverEmail); const exchanged = await invoke(accessAPI, '/api/access', { action: 'exchange', token: mail.token }); assert.equal(exchanged.status, 200);
      fault = { kind: 'site:prospects', key: accounts.accountKey(recoverEmail), method: 'PUT' }; const first = await invoke(accessAPI, '/api/access', null, exchanged.body.session, 'GET'); assert.equal(first.status, 503); assert.equal((await read('access_sessions', access.accessHash(exchanged.body.session))).status, 'active');
      fault = null; const retry = await invoke(accessAPI, '/api/access', null, exchanged.body.session, 'GET'); assert.equal(retry.status, 200); assert.equal(retry.body.draft.fields.business, 'QA Air'); assert.equal(retry.body.draft.revision, 1); assert.equal((await read('intake_handoffs', hash(initial.body.handoff))).status, 'adopted');
    });
    await check(label('failed prospect projection returns failure and same-key retry completes durable capture'), async () => {
      const failedEmail = 'qa-write-fault@example.test', submission = payload(failedEmail); fault = { kind: 'site:prospects', key: accounts.accountKey(failedEmail), method: 'PUT' };
      const first = await invoke(intakeAPI, '/api/intake', submission); assert.equal(first.status, 503); assert.equal(first.body.handoff, undefined); assert.equal(await read('prospects', accounts.accountKey(failedEmail)), null);
      fault = null; const retry = await invoke(intakeAPI, '/api/intake', submission); assert.equal(retry.status, 202); assert.ok(await read('prospects', accounts.accountKey(failedEmail))); assert.ok(await read('intake_handoffs', hash(retry.body.handoff)));
    });
    await check(label('concurrent anonymous identities cannot overwrite the winning prospect'), async () => {
      const concurrentEmail = 'qa-concurrent@example.test'; const inputs = Array.from({ length: 3 }, (_, n) => payload(concurrentEmail, { name: 'Contender ' + n, business: 'Business ' + n, marketingConsent: n === 0 }));
      const replies = await Promise.all(inputs.map(input => invoke(intakeAPI, '/api/intake', input))); assert.ok(replies.every(row => row.status === 202));
      const winner = await read('prospects', accounts.accountKey(concurrentEmail)); assert.ok(inputs.some(input => input.name === winner.name && input.business === winner.business)); assert.equal(winner.marketing.preference, false); assert.equal(winner.emailVerifiedAt, null);
      const before = structuredClone(winner); await invoke(intakeAPI, '/api/intake', inputs[0]); assert.deepEqual(await read('prospects', accounts.accountKey(concurrentEmail)), before);
    });
  }
}
try { await suite('memory'); await suite('sdk'); } catch (error) { result.fatal = error.stack; }
result.sourceAfter = hashes();
result.checks.push({ name: 'runtime sources stable through QA', pass: JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter) });
result.checks.push({ name: 'no unexpected provider/model/hosted requests', pass: result.blockedNetwork.length === 0 });
// Store only metadata about intercepted transactional mail, never reusable proof in the report.
result.interceptedMail = result.interceptedMail.map(row => ({ recipientCount: row.to.length, subject: row.subject, kind: 'intercepted fixture, not sent' }));
result.summary = { passed: result.checks.filter(row => row.pass).length, failed: result.checks.filter(row => !row.pass).length, total: result.checks.length };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify({ output, ...result.summary, conflicts: result.conflicts, fatal: !!result.fatal }));
if (result.fatal || result.summary.failed) process.exitCode = 1;
