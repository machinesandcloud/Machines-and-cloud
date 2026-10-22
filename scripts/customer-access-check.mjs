// Independent QA of mailbox authority. All external networking is intercepted.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = 'http://127.0.0.1:8895';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
process.env.RESEND_API_KEY = 'qa-offline-email-key';
const sourceFiles = ['netlify/functions/access.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/accounts.mjs', 'netlify/functions/lib/store.mjs'];
const hashes = () => Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const report = { at: new Date().toISOString(), sourceBefore: hashes(), mode: 'fake/memory and installed SDK protocol double; no live network', checks: [], outbound: [], mailFixtureCount: 0 };
const check = (name, condition, detail) => { report.checks.push({ name, pass: !!condition, ...(detail === undefined ? {} : { detail }) }); };
const blobs = new Map(), mails = []; let revision = 0, conflicts = 0, fault = null, mailFailure = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = String(init.method || 'GET').toUpperCase();
  if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') {
    const mail = JSON.parse(init.body); mails.push(mail); report.mailFixtureCount++;
    return mailFailure ? Response.json({ error: 'fixture rejected' }, { status: 503 }) : Response.json({ id: 'fixture-mail-' + mails.length });
  }
  if (url.origin !== 'https://qa-access-blobs.invalid') { report.outbound.push({ origin: url.origin, pathname: url.pathname, method }); throw new Error('QA external networking blocked'); }
  const [, site, kind, ...segments] = url.pathname.split('/').map(decodeURIComponent);
  if (site !== 'qa-access-site') throw new Error('Unexpected storage site');
  const key = segments.join('/'), name = `${kind}/${key}`, current = blobs.get(name), headers = new Headers(init.headers);
  if (fault && method === fault.method && (!fault.kind || kind === 'site:' + fault.kind)) { fault = null; return new Response('fixture storage failure', { status: 400 }); }
  if (method === 'GET') return current ? new Response(current.value, { headers: { etag: current.etag, 'content-type': 'application/json' } }) : new Response(null, { status: 404 });
  if (method === 'DELETE') { blobs.delete(name); return new Response(null, { status: 204 }); }
  if (method !== 'PUT') throw new Error('Unexpected storage method');
  if ((headers.get('if-none-match') === '*' && current) || (headers.has('if-match') && headers.get('if-match') !== current?.etag)) { conflicts++; return new Response(null, { status: 412 }); }
  const etag = String(++revision); blobs.set(name, { value: init.body, etag }); return new Response(null, { headers: { etag } });
};
const { setEnvironmentContext } = await import('@netlify/blobs');
setEnvironmentContext({ siteID: 'qa-access-site', token: 'qa-offline-token', edgeURL: 'https://qa-access-eventual.invalid', uncachedEdgeURL: 'https://qa-access-blobs.invalid' });
const store = await import('../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../netlify/functions/lib/access.mjs');
const { newClient } = await import('../netlify/functions/lib/config.mjs');
const access = (await import('../netlify/functions/access.mjs')).default;
let counter = 0;
async function call(body, options = {}) {
  const method = options.method || (body === undefined ? 'GET' : 'POST');
  const req = new Request(process.env.URL + '/api/access', { method, headers: { origin: options.origin ?? process.env.URL, ...(options.session ? { authorization: 'Bearer ' + options.session } : {}) }, ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  const res = await access(req, { ip: options.ip || '192.0.2.' + (++counter) });
  check('Access response is not cacheable', res.headers.get('cache-control') === 'no-store');
  return { status: res.status, data: await res.json() };
}
async function tokenFor(email, options) {
  const response = await call({ action: 'request_link', email }, options);
  if (response.status !== 202) throw new Error('Fixture link request failed: ' + JSON.stringify(response));
  if (process.env.MC_MEMORY_STORE === '1') return (await store.get('access_outbox', accessHash(email))).token;
  return new URL(mails.at(-1).text.match(/https?:\/\/[^\s]+/)[0]).hash.slice('#verify='.length);
}
const errors = [], originalError = console.error; console.error = (...values) => errors.push(values.map(String).join(' '));
try {
  for (const backend of ['memory', 'blobs']) {
    process.env.MC_MEMORY_STORE = backend === 'memory' ? '1' : '0';
    const email = `qa-${backend}@example.test`, other = `qa-${backend}-other@example.test`;
    const pending = await tokenFor(email);
    const tokenRow = await store.get('access_tokens', accessHash(pending));
    check(`${backend}: mailbox token stored under hash, no raw token field`, tokenRow.email === email && !JSON.stringify(tokenRow).includes(pending));
    const exchange = await Promise.all([call({ action: 'exchange', token: pending }), call({ action: 'exchange', token: pending })]);
    check(`${backend}: simultaneous exchange grants exactly one session`, exchange.filter(r => r.status === 200).length === 1 && exchange.filter(r => r.status === 410).length === 1, exchange.map(r => r.status));
    const verified = exchange.find(r => r.status === 200).data;
    const sessionRow = await store.get('access_sessions', accessHash(verified.session));
    check(`${backend}: session stored under hash with onboarding scope`, sessionRow.scope === 'onboarding' && !JSON.stringify(sessionRow).includes(verified.session));
    check(`${backend}: token replay rejected`, (await call({ action: 'exchange', token: pending })).status === 410);
    check(`${backend}: altered token rejected`, (await call({ action: 'exchange', token: '0'.repeat(64) })).status === 410);
    check(`${backend}: missing proof cannot read saved setup`, (await call()).status === 401);
    check(`${backend}: wrong proof cannot read saved setup`, (await call(undefined, { session: '1'.repeat(64) })).status === 401);
    const state = await call(undefined, { session: verified.session });
    check(`${backend}: verified identity starts with empty draft`, state.status === 200 && state.data.email === email && state.data.draft.revision === 0 && !state.data.existing);
    const writes = await Promise.all([
      call({ revision: 0, step: 1, fields: { name: 'Saved Owner A', business: 'Saved Shop A' } }, { method: 'PUT', session: verified.session }),
      call({ revision: 0, step: 2, fields: { name: 'Saved Owner B', business: 'Saved Shop B' } }, { method: 'PUT', session: verified.session })
    ]);
    check(`${backend}: competing draft writes cannot silently overwrite`, writes.filter(r => r.status === 200).length === 1 && writes.filter(r => r.status === 409).length === 1, writes.map(r => r.status));
    const saved = await call(undefined, { session: verified.session });
    check(`${backend}: saved draft can be reloaded`, saved.data.draft.revision === 1 && /^Saved Owner [AB]$/.test(saved.data.draft.fields.name));
    check(`${backend}: unrecognized draft fields rejected`, (await call({ revision: 1, step: 1, fields: { ownerKey: 'attacker' } }, { method: 'PUT', session: verified.session })).status === 400);
    const secondToken = await tokenFor(other), secondExchange = await call({ action: 'exchange', token: secondToken });
    const alien = await call(undefined, { session: secondExchange.data.session });
    check(`${backend}: distinct mailbox cannot read first mailbox draft`, alien.data.email === other && alien.data.draft.revision === 0 && !alien.data.draft.fields.name);
    const expired = await tokenFor(`qa-${backend}-expired@example.test`);
    await store.atomicUpdate('access_tokens', accessHash(expired), row => ({ value: { ...row, expiresAt: '2000-01-01T00:00:00.000Z' } }));
    check(`${backend}: expired mailbox link rejected`, (await call({ action: 'exchange', token: expired })).status === 410);
    const expiresSession = secondExchange.data.session;
    await store.atomicUpdate('access_sessions', accessHash(expiresSession), row => ({ value: { ...row, expiresAt: '2000-01-01T00:00:00.000Z' } }));
    check(`${backend}: expired session rejected`, (await call(undefined, { session: expiresSession })).status === 401);
    const client = newClient({ slug: `qa-${backend}-legacy`, ownerKey: 'qa-legacy-owner-key-' + backend, owner: { name: 'Existing Owner', email, phone: '+17135550101' }, business: { name: 'Existing Shop', website: '' } });
    client.status = 'live'; await store.saveClient(client); await store.indexClient(client);
    const before = await store.getClient(client.slug);
    const requestKnown = await call({ action: 'request_link', email });
    const requestUnknown = await call({ action: 'request_link', email: `qa-${backend}-unknown@example.test` });
    check(`${backend}: existing and unknown link requests have identical generic response`, requestKnown.status === 202 && JSON.stringify(requestKnown) === JSON.stringify(requestUnknown));
    check(`${backend}: request never exposes credentials or tokens`, !/portal|ownerKey|"token"|"session"|"slug"/.test(JSON.stringify(requestKnown)));
    check(`${backend}: requesting access cannot alter existing client`, JSON.stringify(before) === JSON.stringify(await store.getClient(client.slug)));
    const existing = await call(undefined, { session: verified.session });
    check(`${backend}: proven existing mailbox recovers exact existing workspace`, existing.data.existing?.slug === client.slug && new URL(existing.data.existing?.portal).searchParams.get('k') === client.ownerKey);
    check(`${backend}: no arbitrary redirect is accepted or leaked`, !JSON.stringify(requestKnown).includes('attacker.invalid'));
    check(`${backend}: disallowed origin rejected before mutation`, (await call({ action: 'request_link', email: 'blocked@example.test' }, { origin: 'https://attacker.invalid' })).status === 403);
    check(`${backend}: missing origin mutation rejected`, (await call({ action: 'exchange', token: pending }, { origin: '' })).status === 403);
    check(`${backend}: malformed JSON rejected`, (await call('{')).status === 400);
    check(`${backend}: oversized request rejected`, (await call(' '.repeat(1025))).status === 413);
    check(`${backend}: array request rejected`, (await call([])).status === 400);
    check(`${backend}: wrong method rejected`, (await call({}, { method: 'PATCH' })).status === 405);
    const rateEmail = `qa-${backend}-rate@example.test`;
    const rates = []; for (let n = 0; n < 4; n++) rates.push((await call({ action: 'request_link', email: rateEmail })).status);
    check(`${backend}: email send rate is bounded`, JSON.stringify(rates) === JSON.stringify([202, 202, 202, 429]), rates);
    const ipRates = []; for (let n = 0; n < 6; n++) ipRates.push((await call({ action: 'request_link', email: `qa-${backend}-ip${n}@example.test` }, { ip: '198.51.100.50' })).status);
    check(`${backend}: IP send rate is bounded`, JSON.stringify(ipRates) === JSON.stringify([202, 202, 202, 202, 202, 429]), ipRates);
    check(`${backend}: sign out revokes the current session`, (await call({ action: 'sign_out' }, { session: verified.session })).status === 200 && (await call(undefined, { session: verified.session })).status === 401);
    if (backend === 'blobs') {
      for (const [kind, method, action] of [
        ['access_rate', 'GET', () => call({ action: 'request_link', email: 'qa-fault-read@example.test' })],
        ['access_rate', 'PUT', () => call({ action: 'request_link', email: 'qa-fault-write@example.test' })],
        ['access_tokens', 'GET', () => call({ action: 'exchange', token: 'a'.repeat(64) })],
        ['access_sessions', 'GET', () => call(undefined, { session: expiresSession })],
      ]) {
        const previousMail = mails.length; fault = { kind, method }; const failed = await action();
        check(`blobs: ${kind} ${method} error fails closed without delivery`, failed.status === 503 && mails.length === previousMail);
      }
      const exchangeFaultToken = await tokenFor('qa-session-write-fault@example.test');
      fault = { kind: 'access_sessions', method: 'PUT' };
      check('blobs: session write failure does not disclose a usable session', (await call({ action: 'exchange', token: exchangeFaultToken })).status === 503);
      check('blobs: consumed proof stays consumed after failed session projection', (await call({ action: 'exchange', token: exchangeFaultToken })).status === 410);
      mailFailure = true;
      check('blobs: mail transport rejection is not reported sent', (await call({ action: 'request_link', email: 'qa-mail-failure@example.test' })).status === 503);
      const rejectedMail = mails.at(-1), rejectedToken = new URL(rejectedMail.text.match(/https?:\/\/[^\s]+/)[0]).hash.slice('#verify='.length);
      check('blobs: failed-delivery token cannot authenticate', (await call({ action: 'exchange', token: rejectedToken })).status === 410); mailFailure = false;
    }
  }
  check('Installed SDK conditional conflicts were actually exercised', conflicts > 0, conflicts);
  check('No real external fetch escaped the fixture allow-list', report.outbound.length === 0);
  const noEmail = spawnSync(process.execPath, ['--input-type=module', '-e', `
    process.env.MC_MEMORY_STORE='1'; process.env.MC_FAKE_MODEL='0'; process.env.URL='http://127.0.0.1:8895'; delete process.env.RESEND_API_KEY;
    let calls=0; globalThis.fetch=async()=>{calls++;throw new Error('QA blocked');};
    const handler=(await import('./netlify/functions/access.mjs')).default;
    const {list}=await import('./netlify/functions/lib/store.mjs');
    const response=await handler(new Request(process.env.URL+'/api/access',{method:'POST',headers:{origin:process.env.URL},body:JSON.stringify({action:'request_link',email:'qa-no-mail@example.test'})}),{ip:'192.0.2.120'});
    console.log(JSON.stringify({status:response.status,body:await response.json(),tokens:(await list('access_tokens','')).length,calls}));
  `], { encoding: 'utf8', env: process.env });
  const noEmailResult = JSON.parse(noEmail.stdout.trim());
  check('Missing production mail config refuses entry before token or network', noEmail.status === 0 && noEmailResult.status === 503 && noEmailResult.tokens === 0 && noEmailResult.calls === 0 && noEmailResult.body.error === 'email_unavailable');
} catch (e) { report.fatal = String(e.stack || e); }
finally {
  console.error = originalError; report.sourceAfter = hashes(); check('Source stayed unchanged during acceptance', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
  report.loggedErrors = errors; report.sdkConflicts = conflicts; report.summary = { checks: report.checks.length, passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length };
  const outputIndex = process.argv.indexOf('--output'); const out = outputIndex >= 0 ? process.argv[outputIndex + 1] : 'scratchpad/customer-access-accepted.json';
  if (!out || !out.startsWith('scratchpad/')) throw new Error('QA output must be under scratchpad/');
  writeFileSync(out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ out, ...report.summary, fatal: report.fatal || null }));
}
