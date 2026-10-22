// QA closes the original anonymous-overwrite trigger through actual API handlers.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = 'http://127.0.0.1:8895';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
const network = []; globalThis.fetch = async input => { network.push(String(input)); throw new Error('QA external networking blocked'); };
const store = await import('../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { accountKey } = await import('../netlify/functions/lib/accounts.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
const access = (await import('../netlify/functions/access.mjs')).default;
const onboard = (await import('../netlify/functions/onboard.mjs')).default;
const clientApi = (await import('../netlify/functions/client.mjs')).default;
const chat = (await import('../netlify/functions/chat.mjs')).default;
const files = ['netlify/functions/onboard.mjs', 'netlify/functions/client.mjs', 'netlify/functions/lib/accounts.mjs', 'netlify/functions/lib/setup.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/config.mjs', 'netlify/functions/chat.mjs', 'netlify/functions/lib/owner-test.mjs', 'netlify/functions/lib/agent.mjs'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const result = { at: new Date().toISOString(), sourceBefore: hashes(), mode: 'actual handlers, memory/fake; no external network', checks: [] };
const check = (name, pass, detail) => result.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
let currentOwnerSession = null;
async function invoke(handler, path, body, options = {}) {
  const method = options.method || (body === undefined ? 'GET' : 'POST');
  const auth = options.session || (handler === clientApi && !options.public ? currentOwnerSession : null);
  const response = await handler(new Request(process.env.URL + path, { method, headers: { origin: process.env.URL, 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) }), { ip: '192.0.2.181' });
  return { status: response.status, data: await response.json() };
}
async function proof(email) {
  const sent = await invoke(access, '/api/access', { action: 'request_link', email });
  if (sent.status !== 202) throw new Error('Unable to create fixture proof');
  const mail = await store.get('access_outbox', accessHash(email));
  const exchanged = await invoke(access, '/api/access', { action: 'exchange', token: mail.token });
  if (exchanged.status !== 200) throw new Error('Unable to exchange fixture proof');
  return exchanged.data.session;
}
const kinds = ['clients', 'accounts', 'index', 'events', 'bookings', 'leads', 'alerts', 'tasks', 'conversations', 'customers', 'usage'];
async function snapshot() { return Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await Promise.all((await store.list(kind, '')).map(async key => [key, await store.get(kind, key)]))]))); }
try {
  const legacy = newClient({ slug: 'qa-original-legacy', ownerKey: 'qa-original-private-key', owner: { name: 'Original Owner', email: 'qa-original@example.test', phone: '+17135550101' }, business: { name: 'Original Shop', website: '' } });
  legacy.status = 'live'; legacy.services = ['Retain this service']; await store.saveClient(legacy); await store.indexClient(legacy);
  const before = await snapshot();
  const overwrite = { name: 'Unverified Re-entry', email: legacy.owner.email, phone: '7135550199', business: 'QA Replacement Attacker', plan: 'pro' };
  const attack = await invoke(onboard, '/api/onboard', overwrite);
  check('Original unauthenticated duplicate-email exploit now rejected before disclosure', attack.status === 401 && !attack.data.key && !attack.data.portal && !attack.data.client);
  check('Original exploit leaves client/index/events/jobs byte-identical', JSON.stringify(before) === JSON.stringify(await snapshot()));
  const alien = await proof('qa-alien@example.test');
  const foreign = await invoke(onboard, '/api/onboard', overwrite, { session: alien });
  check('Proof for another email cannot overwrite or recover existing tenant', foreign.status === 400 && foreign.data.error === 'email_mismatch' && JSON.stringify(before) === JSON.stringify(await snapshot()));
  const original = await proof(legacy.owner.email);
  const recovered = await invoke(onboard, '/api/onboard', overwrite, { session: original });
  check('Proven existing owner recovers same portal without changing supplied fields', recovered.status === 200 && recovered.data.existing === true && recovered.data.key === legacy.ownerKey && recovered.data.slug === legacy.slug);
  check('Existing recovery preserves live state/phone/business/rules and starts no jobs', JSON.stringify(before) === JSON.stringify(await snapshot()));
  const email = 'qa-new-account@example.test', session = await proof(email);
  const answers = { name: 'QA New Owner', email, phone: '7135550102', business: 'QA New Air', website: 'https://qa-do-not-fetch.invalid', trade: 'HVAC', services: 'AC repair', serviceArea: 'Katy', hours: 'Mon to Fri 8 am to 5 pm', fees: 'Diagnostic: $89', windows: '8 to 12\n12 to 5', spanish: 'no', forwarding: 'none' };
  const simultaneous = await Promise.all([invoke(onboard, '/api/onboard', answers, { session }), invoke(onboard, '/api/onboard', answers, { session })]);
  check('Concurrent first submit returns one stable tenant without permanent browser key', simultaneous.every(row => row.status === 200) && simultaneous[0].data.slug === simultaneous[1].data.slug && simultaneous.every(row => !row.data.key && !row.data.client?.ownerKey && !new URL(row.data.portal).searchParams.has('k')), simultaneous.map(row => row.status));
  const tenant = simultaneous.find(row => row.status === 200)?.data;
  if (!tenant) throw new Error('No new tenant was created');
  check('Only one new tenant exists after concurrent submit', (await store.list('clients', '')).length === 2);
  const afterCreate = await snapshot();
  const retry = await invoke(onboard, '/api/onboard', { ...answers, business: 'Do not replace on retry', phone: '7135550198' }, { session });
  check('Lost-response retry recovers existing result instead of rerunning questionnaire', retry.status === 200 && retry.data.slug === tenant.slug && !retry.data.key && JSON.stringify(afterCreate) === JSON.stringify(await snapshot()));
  const stored = await store.getClient(tenant.slug), registry = await store.get('accounts', accountKey(email));
  check('Verified identity, registry and legacy index agree', registry.phase === 'created' && registry.slug === tenant.slug && registry.ownerKey === stored.ownerKey && stored.owner.email === email && await store.get('index', 'email:' + email) === tenant.slug);
  check('Initial draft uses only saved owner answers without pretending website import', stored.onboarding.version === 1 && stored.build.status === 'built' && stored.build.source === 'owner_answers' && stored.build.sourcePages.length === 0 && /not enabled/.test(stored.build.notes));
  check('New account starts with every channel inactive', stored.status === 'testing' && Object.values(stored.channels).every(channel => channel.active === false));
  currentOwnerSession = session;
  const ownerPath = '/api/client?c=' + encodeURIComponent(tenant.slug);
  const privateData = await invoke(clientApi, ownerPath);
  check('Owner API exposes truthful readiness and current revision', privateData.status === 200 && privateData.data.configurationRevision === configurationRevision(stored) && privateData.data.setup.channels.sms.active === false && privateData.data.setup.channels.voice.active === false);
  const invalidKey = await invoke(clientApi, '/api/client?c=' + tenant.slug + '&k=' + stored.ownerKey, undefined, { public: true });
  check('Permanent owner key alone cannot authorize new workspace', [401, 403].includes(invalidKey.status) && !invalidKey.data.client);
  const publicData = await invoke(clientApi, '/api/client?c=' + tenant.slug, undefined, { public: true });
  check('Intended public widget response still omits owner credentials and setup', publicData.status === 200 && !publicData.data.ownerKey && !publicData.data.client && !publicData.data.setup);
  const staleReview = await invoke(clientApi, ownerPath, { action: 'review_rules', revision: '0'.repeat(64) });
  check('Stale review cannot certify new configuration', staleReview.status === 409 && staleReview.data.error === 'configuration_changed');
  const review = await invoke(clientApi, ownerPath, { action: 'review_rules', revision: privateData.data.configurationRevision });
  check('Actual reviewed rules persist exact revision', review.status === 200 && (await store.getClient(tenant.slug)).setupProof.reviewedRevision === privateData.data.configurationRevision);
  const preview = await invoke(chat, '/api/chat', { client: tenant.slug, channel: 'test', contact: 'setup-test', stream: false, messages: [{ role: 'user', content: 'How much is your fee?' }] }, { session });
  check('Owner completes safe test and receives structured revision proof', preview.status === 200 && preview.data.simulation === true && preview.data.test.proofRecorded === true);
  const refuseFake = await invoke(clientApi, ownerPath, { action: 'go_live' });
  check('Fake/no-key mode cannot falsely activate even reviewed/tested desk', refuseFake.status === 409 && refuseFake.data.error === 'not_ready' && refuseFake.data.setup.channels.web.blockers.some(row => row.id === 'model') && (await store.getClient(tenant.slug)).status === 'testing');
  for (const action of ['provision', 'forwarding_verified', 'test_sms']) {
    const denied = await invoke(clientApi, ownerPath, { action }); check('Unavailable channel action fails honestly: ' + action, !denied.data.ok && (denied.status === 409 || (action === 'test_sms' && denied.status === 200 && denied.data.error === 'channel_not_active')), { status: denied.status, data: denied.data });
  }
  // A credential availability fixture permits pure gate evaluation, never model invocation.
  process.env.MC_FAKE_MODEL = '0'; process.env.ANTHROPIC_API_KEY = 'qa-availability-fixture-not-real';
  const refuseFakeProof = await invoke(clientApi, ownerPath, { action: 'go_live', channel: 'web' });
  check('Enabling a real-model environment cannot promote earlier fake proof', refuseFakeProof.status === 409 && refuseFakeProof.data.setup.channels.web.blockers.some(row => row.id === 'test'));
  await store.atomicUpdate('clients', tenant.slug, current => ({ value: { ...current, setupProof: { ...current.setupProof, testMode: 'live' } } }));
  result.gateFixture = { notice: 'Only for pure readiness-gate evaluation: synthetic live proof injected after the fake-proof negative case. No inference or provider verification.', mode: 'availability fixture' };
  const activated = await invoke(clientApi, ownerPath, { action: 'go_live', channel: 'web' });
  check('Eligible pure activation gate enables only web, with no provider sends', activated.status === 200 && activated.data.status === 'live' && JSON.stringify(activated.data.activeChannels) === '["web"]' && activated.data.setup.channels.voice.active === false && activated.data.setup.channels.sms.active === false);
  const beforePause = await store.getClient(tenant.slug);
  const paused = await invoke(clientApi, ownerPath, { action: 'pause' });
  check('Pause disables only active website channel with no phone routing claim', paused.status === 200 && paused.data.status === 'paused' && paused.data.activeChannels.length === 0 && (await store.getClient(tenant.slug)).channels.web.active === false);
  const updated = await invoke(clientApi, ownerPath, { expectedRevision: configurationRevision(beforePause), business: { ...beforePause.business, serviceArea: ['Cypress'] } }, { method: 'PUT' });
  const resume = await invoke(clientApi, ownerPath, { action: 'resume' });
  check('Changing rules invalidates previous review/test before resume', updated.status === 200 && resume.status === 409 && resume.data.setup.channels.web.blockers.some(row => row.id === 'review') && resume.data.setup.channels.web.blockers.some(row => row.id === 'test'));
  const beforeStaleSave = await store.getClient(tenant.slug);
  const staleSave = await invoke(clientApi, ownerPath, { expectedRevision: configurationRevision(beforePause), business: { ...beforePause.business, serviceArea: ['Pearland'] } }, { method: 'PUT' });
  check('Sequential stale-tab save is rejected without overwriting newer rules', staleSave.status === 409 && staleSave.data.error === 'configuration_changed' && JSON.stringify(beforeStaleSave) === JSON.stringify(await store.getClient(tenant.slug)));
  const signout = await invoke(access, '/api/access', { action: 'sign_out' }, { session });
  check('Verified session can be revoked after workspace use', signout.status === 200);
  const afterSignout = await invoke(clientApi, ownerPath);
  const afterSignoutMutation = await invoke(clientApi, ownerPath, { action: 'pause' });
  check('Revoked session cannot read or mutate private workspace', [401, 403].includes(afterSignout.status) && [401, 403].includes(afterSignoutMutation.status) && !afterSignout.data.client);
  const exportRevoked = await invoke(clientApi, ownerPath + '&export=bookings');
  check('Revoked session cannot export private customer records', [401, 403].includes(exportRevoked.status));
  const chatRevoked = await invoke(chat, '/api/chat', { client: tenant.slug, channel: 'test', contact: 'revoked', stream: false, messages: [{ role: 'user', content: 'How much is your fee?' }] }, { session });
  check('Revoked session cannot use private test channel', [401, 403].includes(chatRevoked.status) && !chatRevoked.data.reply);
  check('No website crawl/model/email/purchase/provision/provider fetch occurred', network.length === 0, network);
} catch (error) { result.fatal = String(error.stack || error); }
finally {
  result.sourceAfter = hashes(); check('Source stayed unchanged through coupled API acceptance', JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter));
  result.summary = { checks: result.checks.length, passed: result.checks.filter(row => row.pass).length, failed: result.checks.filter(row => !row.pass).length };
  const index = process.argv.indexOf('--output'), output = index >= 0 ? process.argv[index + 1] : 'scratchpad/customer-account-qa-current.json';
  if (!output?.startsWith('scratchpad/')) throw new Error('QA output must remain under scratchpad/');
  writeFileSync(output, JSON.stringify(result, null, 2)); console.log(JSON.stringify({ output, ...result.summary, fatal: result.fatal || null }));
}
