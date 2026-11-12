// Proposal 15 positive/negative assertions (revision 4). Expected: every fix assertion FAILS on base dfb0ae78 and
// every check PASSES on the patch. Checks marked "(guard)" preserve legitimate paths and pass on base by design;
// several of them fail on revision 1 (the QA-15 lockout and availability defects). Revision 3 adds the QA-15 r2
// checks: the proof-envelope public view (N03), the closed-state wording, and group a4b (15-08 refunds, known and
// first-network exemptions, per-email operator pool), which fail on revision 2. Revision 4 adds the QA-15 r3 checks
// (15-09): no "reopens after midnight" claim for a zero kill switch or a used-up proof envelope (D2a/b/c), the q9 P2
// schedule that filled a rev 3 operator pool (D1), and two filled-pool checks (pool upper bound 2R+4N+1, known
// operator networks skip the pool: QA mutants Q01/Q03). Revision 5 (stack QA N-a): the per-network share of the
// anonymous pool is a fraction of that pool (default 75%, absolute cap 150) instead of a fixed 10 turns; group a2r5
// checks a long legitimate conversation, several visitors behind one NAT, and that one network still cannot drain the
// pool (these fail on revision 4). Companion: v15-extra.mjs.
// Run like the repros: env -i PATH HOME MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 SRC=<copy> node v15-fixes.mjs [group]
import { createHash, createHmac } from 'node:crypto';
import { load, call, log, done } from '../../_harness.mjs';
const group = process.argv[2] || 'all';
let pass = 0, fail = 0;
const check = async (name, fn) => { try { await fn(); pass++; log('PASS', name); } catch (e) { fail++; log('FAIL', name, '::', String(e?.message || e).slice(0, 200)); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const store = await load('netlify/functions/lib/store.mjs');
const { newClient, parseHours } = await load('netlify/functions/lib/config.mjs');
const origin = { origin: process.env.URL };
const tally = rs => rs.reduce((t, r) => (t[r.status] = (t[r.status] || 0) + 1, t), {});

if (group === 'all' || group === 'a1') {
  const chat = (await load('netlify/functions/chat.mjs')).default;
  const turn = { persona: 'katy-pipeworks', messages: [{ role: 'user', content: 'My sink is leaking' }] };
  await check('A1 practice: one /64 rotating 40 addresses gets at most the per-network daily cap (30)', async () => {
    const rs = []; for (let i = 0; i < 40; i++) rs.push(await call(chat, '/api/chat', { body: turn, ip: `2001:db8:a1::${i.toString(16)}` }));
    eq(tally(rs)[200], 30, 'answered'); eq(rs.at(-1).status, 429, 'last status');
  });
  await check('A1 practice: an unrelated IPv4 visitor is still answered', async () => { eq((await call(chat, '/api/chat', { body: turn, headers: origin, ip: '198.51.100.40' })).status, 200, 'status'); });
  await check('A1 practice: concurrent burst of 100 from one fresh IP is bounded atomically (30)', async () => {
    const rs = await Promise.all(Array.from({ length: 100 }, () => call(chat, '/api/chat', { body: turn, ip: '198.51.100.41' })));
    eq(tally(rs)[200], 30, 'answered under race');
  });
  await check('A1 practice: global daily ceiling holds across many IPs (limit set to 70)', async () => {
    process.env.MC_PRACTICE_AI_GLOBAL_DAILY_LIMIT = '70'; // 61 already used above
    const rs = []; for (let i = 0; i < 20; i++) rs.push(await call(chat, '/api/chat', { body: turn, ip: `192.0.2.${100 + i}` }));
    eq(tally(rs)[200], 9, 'answered before global ceiling');
  });
  await check('A1 practice: zero is a kill switch, malformed config fails closed (503)', async () => {
    process.env.MC_PRACTICE_AI_GLOBAL_DAILY_LIMIT = '0'; eq((await call(chat, '/api/chat', { body: turn, ip: '192.0.2.200' })).status, 429, 'kill switch');
    process.env.MC_PRACTICE_AI_GLOBAL_DAILY_LIMIT = 'lots'; eq((await call(chat, '/api/chat', { body: turn, ip: '192.0.2.201' })).status, 503, 'malformed');
    delete process.env.MC_PRACTICE_AI_GLOBAL_DAILY_LIMIT;
  });
  const c = newClient({ slug: 'legacy-v15', ownerKey: 'dummy-legacy-v15', owner: { name: 'Legacy', email: 'legacy@example.invalid', phone: '+17135550141' }, business: { name: 'Legacy Plumbing', website: 'https://legacy.example' } });
  c.status = 'live'; await store.saveClient(c);
  const lturn = i => ({ client: c.slug, contact: `spam-${i}`, messages: [{ role: 'user', content: 'hello' }] });
  await check('A1 legacy client: one network gets at most 40 turns a day, and no conversations beyond that', async () => {
    const rs = []; for (let i = 0; i < 50; i++) rs.push(await call(chat, '/api/chat', { body: lturn(i), ip: '203.0.113.150' }));
    eq(tally(rs)[200], 40, 'answered'); eq((await store.list('conversations', c.slug + '/')).length, 40, 'conversations');
  });
  await check('A1 legacy client: the owner key stays exempt from the public ceiling', async () => {
    eq((await call(chat, '/api/chat', { body: { ...lturn(999), key: 'dummy-legacy-v15' }, ip: '203.0.113.150' })).status, 200, 'owner');
  });
  await check('A1 legacy client: practice exhaustion does not close legacy shops (separate pools)', async () => {
    process.env.MC_PRACTICE_AI_GLOBAL_DAILY_LIMIT = '0';
    eq((await call(chat, '/api/chat', { body: lturn(1000), ip: '203.0.113.151' })).status, 200, 'legacy');
    delete process.env.MC_PRACTICE_AI_GLOBAL_DAILY_LIMIT;
  });
}

if (group === 'all' || group === 'a1b') {
  await check('A1 networkBucket: IPv4-mapped in hex/uncompressed form and NAT64 map to the embedded IPv4 (QA-15 F1)', async () => {
    const { networkBucket } = await load('netlify/functions/lib/network-bucket.mjs');
    for (const [input, want] of [['::ffff:203.0.113.9', '203.0.113.9'], ['::ffff:cb00:7109', '203.0.113.9'], ['0:0:0:0:0:ffff:203.0.113.9', '203.0.113.9'], ['0:0:0:0:0:FFFF:CB00:710A', '203.0.113.10'], ['64:ff9b::203.0.113.11', '203.0.113.11'], ['64:ff9b::cb00:710c', '203.0.113.12'], ['2001:db8:1:2::9', 'v6-2001:db8:1:2'], ['::1', 'v6-0:0:0:0'], ['', 'unknown']]) eq(networkBucket(input), want, JSON.stringify(input));
    if (networkBucket('::ffff:cb00:7109') === networkBucket('::ffff:c633:6401')) throw new Error('two mapped callers share one bucket');
  });
}

if (group === 'all' || group === 'a2') {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy-offline'; process.env.MC_FAKE_MODEL = '0';
  const { configurationRevision } = await load('netlify/functions/lib/setup.mjs');
  const { accessHash } = await load('netlify/functions/lib/access.mjs');
  const chat = (await load('netlify/functions/chat.mjs')).default;
  let n = 0;
  const tenant = label => { n++; const c = newClient({ slug: `v15-${label}`, ownerKey: `dummy-owner-key-${n}`, owner: { name: 'QA Owner', email: `owner-${label}@example.invalid`, phone: '+17135550140' }, business: { name: 'Offline ' + label, trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } }); c.onboarding = { version: 1 }; c.status = 'live'; c.build = { status: 'built' }; c.services = ['AC repair']; c.rules = { ...c.rules, hours: parseHours('Mon-Fri 8am-5pm') }; if (!c.windows?.length) c.windows = ['8-10am']; c.channels = { web: { active: true } }; const r = configurationRevision(c); c.setupProof = { reviewedRevision: r, testedRevision: r, testMode: 'live' }; return c; };
  const a = tenant('a'), b = tenant('b'); await store.saveClient(a); await store.saveClient(b);
  const pub = (c, ip, i) => call(chat, '/api/chat', { body: { client: c.slug, contact: 'v' + i, messages: [{ role: 'user', content: 'hi' }] }, ip });
  const clientFn = (await load('netlify/functions/client.mjs')).default;
  const view = async (c, ip) => (await call(clientFn, `/api/client?c=${c.slug}`, { ip })).data?.webAvailable;
  const admitted = r => r.status !== 429 && r.status !== 503; // 502 = admitted, then the dummy key hit the offline fetch stub
  await check('A2 one anonymous network is admitted at most its share, 30 of the 40-turn anonymous pool, a day (rev 5)', async () => {
    const rs = []; for (let i = 0; i < 50; i++) rs.push(await pub(a, '2001:db8:a2::' + i.toString(16), i));
    eq(rs.filter(admitted).length, 30, 'admitted'); eq(rs.at(-1).status, 429, 'last');
  });
  await check('A2 public view: the capped network sees chat unavailable, another network still sees it available (QA-15 F2a)', async () => {
    eq(await view(a, '2001:db8:a2::ffff'), false, 'capped /64'); eq(await view(a, '192.0.2.22'), true, 'other network');
  });
  await check('A2 closed-state wording: view and refusal say the same thing about when chat reopens (QA-15 r2 section 4)', async () => {
    const { PUBLIC_WEB_DAILY_CLOSED } = await load('netlify/functions/lib/self-service-ai.mjs');
    if (!/after midnight, Houston time/.test(PUBLIC_WEB_DAILY_CLOSED || '')) throw new Error('missing reopen time: ' + PUBLIC_WEB_DAILY_CLOSED);
    const closed = (await call(clientFn, `/api/client?c=${a.slug}`, { ip: '2001:db8:a2::fffe' })).data, open = (await call(clientFn, `/api/client?c=${a.slug}`, { ip: '192.0.2.23' })).data;
    eq(closed.webClosed, 'daily_limit', 'closed view reason'); eq(open.webClosed, undefined, 'open view has no reason');
    const refused = await pub(a, '2001:db8:a2::fffd', 'w'); eq(refused.status, 429, 'refusal'); eq(refused.data?.message, PUBLIC_WEB_DAILY_CLOSED, 'refusal text');
    const { readFileSync } = await import('node:fs'); const embed = readFileSync(process.env.SRC + '/embed.js', 'utf8');
    const copy = (embed.match(/var DAILY_CLOSED='((?:[^'\\]|\\.)*)'/) || [])[1]?.replace(/\\'/g, "'");
    eq(copy, PUBLIC_WEB_DAILY_CLOSED, 'embed closed-state copy'); if (!/webClosed==='daily_limit'\?DAILY_CLOSED/.test(embed)) throw new Error('embed does not show the daily wording for webClosed');
  });
  await check('A2 another tenant\'s real customer is still admitted after that', async () => { if (!admitted(await pub(b, '192.0.2.20', 'real'))) throw new Error('tenant B customer refused'); });
  await check('A2 rotating sources cannot take the last 10 global turns reserved for owner practice', async () => {
    for (let ip = 0; ip < 6; ip++) for (let i = 0; i < 10; i++) await pub(a, `198.51.100.${60 + ip}`, `${ip}-${i}`);
    const late = await pub(b, '198.51.100.99', 'late'); eq(late.status, 429, 'public pool exhausted (40 of 50)');
    eq(await view(b, '198.51.100.98'), false, 'public view once the anonymous pool is exhausted (QA-15 F2a)');
    const token = createHash('sha256').update('v15-b').digest('hex');
    await store.put('access_sessions', accessHash(token), { scope: 'onboarding', email: b.owner.email, status: 'active', expiresAt: new Date(Date.now() + 3600000).toISOString() });
    const owner = await call(chat, '/api/chat', { body: { client: b.slug, channel: 'test', contact: 'owner', messages: [{ role: 'user', content: 'test' }] }, headers: { ...origin, authorization: 'Bearer ' + token }, ip: '192.0.2.21' });
    if (!admitted(owner)) throw new Error('owner practice refused: ' + owner.status + ' ' + owner.data?.error);
  });
  await check('A2 a global limit at or below the configured reserve does not silently close public chat (QA-15 F2b)', async () => {
    await store.del('self_service_ai', 'daily'); process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = '10';
    try {
      eq(await view(b, '192.0.2.90'), true, 'view at global 10');
      const rs = []; for (let i = 0; i < 7; i++) rs.push(await pub(b, `192.0.2.${91 + i}`, 'g' + i));
      eq(rs.filter(admitted).length, 5, 'anonymous turns admitted at global 10 (half kept for the owner)');
      eq(await view(b, '192.0.2.99'), false, 'view once the anonymous half is used');
    } finally { delete process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT; await store.del('self_service_ai', 'daily'); }
  });
  await check('A2 public view applies the daily reset: yesterday\'s per-network count does not close today\'s view (QA-15 r2 N02)', async () => {
    const { networkBucket } = await load('netlify/functions/lib/network-bucket.mjs'); const ip = '192.0.2.64';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()), yesterday = new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
    const key = createHash('sha256').update('mc-self-service-public-v1\0' + networkBucket(ip)).digest('hex');
    await store.put('self_service_ai', 'daily', { version: 1, day: yesterday, used: 40, tenants: { 'v15-other:x': { private: 0, web: 40 } }, publicIps: { [key]: 30 } });
    try { eq(await view(b, ip), true, 'view for a network capped yesterday'); if (!admitted(await pub(b, ip, 'y'))) throw new Error('admission refused'); }
    finally { await store.del('self_service_ai', 'daily'); }
  });
  await check('A2 public view applies the proof-envelope allowance, with the generic (not daily) closed state (QA-15 r2 N03)', async () => {
    const { workspaceTenant } = await load('netlify/functions/lib/workspace-identity.mjs'); const ai = await load('netlify/functions/lib/self-service-ai.mjs');
    const p = tenant('proof'); p.onboarding = { version: 1, verifiedEmail: p.owner.email }; await store.saveClient(p);
    const policy = { version: 'proof_v1', phaseId: 'v15-proof-phase', expiresAt: new Date(Date.now() + 3600000).toISOString(), tenant: { slug: p.slug, identity: workspaceTenant(p), emailHash: createHash('sha256').update(p.owner.email).digest('hex') }, model: 'claude-opus-5-5', maxOutputTokens: 1500, maxRequestBytes: 120000, limits: { logical: 1, physical: 30, ordinaryMutations: 1, setupMutations: 1 } };
    Object.assign(process.env, { MC_SELF_SERVICE_AI_PROOF_SLUG: p.slug, MC_SELF_SERVICE_AI_PROOF_APPROVED_VERSION: policy.version, MC_SELF_SERVICE_AI_PROOF_POLICY_JSON: JSON.stringify(policy) });
    try {
      eq(await view(p, '192.0.2.61'), true, 'view while the proof envelope has a turn');
      const turn = await ai.reserveAIRequest(p, 'private'); eq(turn.allowed, true, 'proof turn admitted'); if (!turn.proof) throw new Error('proof envelope not selected');
      eq((await ai.getAIAllowance(p)).available, false, 'owner view after the only proof turn');
      const r = (await call(clientFn, `/api/client?c=${p.slug}`, { ip: '192.0.2.62' })).data;
      eq(r.webAvailable, false, 'public view after the only proof turn'); eq(r.webClosed, undefined, 'no daily-reset claim for a proof closure');
      process.env.MC_SELF_SERVICE_AI_PUBLIC_IP_DAILY_LIMIT = '0'; // the daily counters close it too: the proof closure still outlasts the reset
      const both = (await call(clientFn, `/api/client?c=${p.slug}`, { ip: '192.0.2.63' })).data; eq(both.webAvailable, false, 'view, proof and daily closed'); eq(both.webClosed, undefined, 'no daily-reset claim while the proof envelope is closed');
    } finally { for (const k of ['MC_SELF_SERVICE_AI_PUBLIC_IP_DAILY_LIMIT', 'MC_SELF_SERVICE_AI_PROOF_SLUG', 'MC_SELF_SERVICE_AI_PROOF_APPROVED_VERSION', 'MC_SELF_SERVICE_AI_PROOF_POLICY_JSON']) delete process.env[k]; }
  });
  const GENERIC = 'Website chat is unavailable right now. Please contact the shop directly.';
  for (const [label, name] of [['global', 'MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT'], ['per-network', 'MC_SELF_SERVICE_AI_PUBLIC_IP_DAILY_LIMIT'], ['per-network share', 'MC_SELF_SERVICE_AI_PUBLIC_IP_POOL_PERCENT']]) {
    await check(`A2 a zero ${label} kill switch (${name}=0) makes no "reopens after midnight" claim in the view or the refusal (QA-15 r3 D2)`, async () => {
      await store.del('self_service_ai', 'daily'); process.env[name] = '0';
      try {
        const v = (await call(clientFn, `/api/client?c=${b.slug}`, { ip: '192.0.2.71' })).data; eq(v.webAvailable, false, 'view closed'); eq(v.webClosed, undefined, 'no daily-reset reason');
        const r = await pub(b, '192.0.2.72', 'k' + label); eq(r.status, 429, 'refusal'); eq(r.data?.message, GENERIC, 'refusal text');
      } finally { delete process.env[name]; await store.del('self_service_ai', 'daily'); }
    });
  }
  await check('A2 proof envelope used up while the daily counters also close: the refusal makes no midnight claim (QA-15 r3 D2c)', async () => {
    const { workspaceTenant } = await load('netlify/functions/lib/workspace-identity.mjs'); const ai = await load('netlify/functions/lib/self-service-ai.mjs');
    const { networkBucket } = await load('netlify/functions/lib/network-bucket.mjs');
    const p = tenant('proof2'); p.onboarding = { version: 1, verifiedEmail: p.owner.email }; await store.saveClient(p);
    const policy = { version: 'proof_v1', phaseId: 'v15-proof2-phase', expiresAt: new Date(Date.now() + 3600000).toISOString(), tenant: { slug: p.slug, identity: workspaceTenant(p), emailHash: createHash('sha256').update(p.owner.email).digest('hex') }, model: 'claude-opus-5-5', maxOutputTokens: 1500, maxRequestBytes: 120000, limits: { logical: 1, physical: 30, ordinaryMutations: 1, setupMutations: 1 } };
    Object.assign(process.env, { MC_SELF_SERVICE_AI_PROOF_SLUG: p.slug, MC_SELF_SERVICE_AI_PROOF_APPROVED_VERSION: policy.version, MC_SELF_SERVICE_AI_PROOF_POLICY_JSON: JSON.stringify(policy) });
    await store.del('self_service_ai', 'daily');
    try {
      const turn = await ai.reserveAIRequest(p, 'private'); eq(turn.allowed, true, 'proof turn admitted'); if (!turn.proof) throw new Error('proof envelope not selected');
      const ip = '192.0.2.73', key = createHash('sha256').update('mc-self-service-public-v1\0' + networkBucket(ip)).digest('hex');
      const doc = await store.get('self_service_ai', 'daily'); await store.put('self_service_ai', 'daily', { ...doc, used: doc.used + 30, tenants: { ...doc.tenants, 'v15-other:x': { private: 0, web: 30 } }, publicIps: { ...(doc.publicIps || {}), [key]: 30 } }); // today's per-network share: resets at midnight
      const r = await pub(p, ip, 'pp'); eq(r.status, 429, 'refusal'); eq(r.data?.message, GENERIC, 'refusal text (proof envelope does not reopen at midnight)');
      const v = (await call(clientFn, `/api/client?c=${p.slug}`, { ip })).data; eq(v.webAvailable, false, 'view closed'); eq(v.webClosed, undefined, 'no daily-reset reason');
    } finally { for (const k of ['MC_SELF_SERVICE_AI_PROOF_SLUG', 'MC_SELF_SERVICE_AI_PROOF_APPROVED_VERSION', 'MC_SELF_SERVICE_AI_PROOF_POLICY_JSON']) delete process.env[k]; await store.del('self_service_ai', 'daily'); }
  });
  process.env.MC_FAKE_MODEL = '1'; delete process.env.ANTHROPIC_API_KEY;
}

if (group === 'all' || group === 'a2r5') {
  // Revision 5 (stack QA N-a). Admitted turns reach an in-process Anthropic stub (SSE, nothing leaves the process),
  // so a conversation really completes: status 200 and the stored history grows.
  process.env.ANTHROPIC_API_KEY = 'sk-ant-dummy-offline'; process.env.MC_FAKE_MODEL = '0';
  const { configurationRevision } = await load('netlify/functions/lib/setup.mjs');
  const { accessHash } = await load('netlify/functions/lib/access.mjs');
  const ai = await load('netlify/functions/lib/self-service-ai.mjs');
  const chat = (await load('netlify/functions/chat.mjs')).default;
  const harnessFetch = globalThis.fetch; let modelCalls = 0;
  const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`;
  globalThis.fetch = async (u, init) => {
    if (!String(u?.url || u).startsWith('https://api.anthropic.com/v1/messages')) return harnessFetch(u, init);
    modelCalls++;
    return new Response(ev('message_start', { message: { id: 'msg_offline_' + modelCalls, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } })
      + ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) + ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Sure, what day works for you?' } })
      + ev('content_block_stop', { index: 0 }) + ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } }) + ev('message_stop', {}), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_offline' } });
  };
  let n = 0;
  const tenant = label => { n++; const c = newClient({ slug: `v15-${label}`, ownerKey: `dummy-owner-key-${n}`, owner: { name: 'QA Owner', email: `owner-${label}@example.invalid`, phone: '+17135550140' }, business: { name: 'Offline ' + label, trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } }); c.onboarding = { version: 1 }; c.status = 'live'; c.build = { status: 'built' }; c.services = ['AC repair']; c.rules = { ...c.rules, hours: parseHours('Mon-Fri 8am-5pm') }; if (!c.windows?.length) c.windows = ['8-10am']; c.channels = { web: { active: true } }; const r = configurationRevision(c); c.setupProof = { reviewedRevision: r, testedRevision: r, testMode: 'live' }; return c; };
  const shops = Array.from({ length: 6 }, (_, i) => tenant('r5-' + i)); for (const c of shops) await store.saveClient(c);
  // QA-RC harness change only: carry the proposal-09 conversation token like the widget does (X-MC-Conversation-Token header,
  // sent back as body.conversationToken on every later turn of that conversation).
  const tokens = new Map(); let tokenTurns = 0;
  const say = async (c, ip, contact, text) => { const k = c.slug + '|' + contact, t = tokens.get(k); if (t) tokenTurns++;
    const r = await call(chat, '/api/chat', { body: { client: c.slug, contact, ...(t ? { conversationToken: t } : {}), messages: [{ role: 'user', content: text }] }, ip });
    const nt = r.headers?.get('X-MC-Conversation-Token'); if (nt) tokens.set(k, nt); return r; };
  const converse = async (c, ip, contact, turns) => { const rs = []; for (let i = 0; i < turns; i++) rs.push(await say(c, ip, contact, `turn ${i + 1}`)); return rs; };
  const ok = rs => rs.filter(r => r.status === 200).length;
  const fresh = () => store.del('self_service_ai', 'daily');
  const anonymousUsed = async () => Object.values((await store.get('self_service_ai', 'daily'))?.publicIps || {}).reduce((t, v) => t + v, 0);
  const env = async (vars, fn) => { Object.assign(process.env, vars); try { return await fn(); } finally { for (const k of Object.keys(vars)) delete process.env[k]; } };
  try {
    await check('A2r5 a 30-turn booking conversation from one homeowner completes at the default limits (stack QA N-a)', async () => {
      await fresh(); const rs = await converse(shops[0], '203.0.113.30', 'homeowner-30', 30);
      eq(ok(rs), 30, 'answered turns'); const conv = await store.getConversation(shops[0], 'web', 'homeowner-30');
      eq(conv.messages.filter(m => m.role === 'user').at(-1)?.content, 'turn 30', 'last stored customer turn'); eq(conv.messages.at(-1)?.role, 'assistant', 'last turn answered');
    });
    await check('A2r5 at the defaults the 31st turn from that network gets the daily wording, and another network still chats', async () => {
      const r = await say(shops[0], '203.0.113.30', 'homeowner-30', 'turn 31'); eq(r.status, 429, 'turn 31'); eq(r.data?.message, ai.PUBLIC_WEB_DAILY_CLOSED, 'wording');
      eq(ok(await converse(shops[1], '198.51.100.31', 'neighbour', 10)), 10, 'other network: the remaining 10 of the 40-turn anonymous pool');
    });
    await check('A2r5 five visitors behind one carrier NAT, each a 30-turn conversation with a different shop, all complete (global 500)', async () => {
      await fresh(); await env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500' }, async () => {
        for (let p = 0; p < 5; p++) eq(ok(await converse(shops[p], '100.64.7.9', 'nat-' + p, 30)), 30, `visitor ${p + 1}`);
      });
    });
    await check('A2r5 five people in one office on one shop, 10 turns each, all complete (global 500; the shop\'s own 50 a day is unchanged)', async () => {
      await fresh(); await env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500' }, async () => {
        for (let p = 0; p < 5; p++) eq(ok(await converse(shops[5], '203.0.113.55', 'office-' + p, 10)), 10, `person ${p + 1}`);
      });
    });
    await check('A2r5 one attacker on one network (rotating /64 addresses, shops and contacts) gets 30 at the defaults; other networks and owner practice keep the rest', async () => {
      await fresh(); const rs = [];
      for (let i = 0; i < 120; i++) rs.push(await say(shops[i % 4], '2001:db8:bad::' + i.toString(16), 'atk-' + i, 'spam'));
      eq(ok(rs), 30, 'attacker answered'); eq(await anonymousUsed(), 30, 'anonymous pool used');
      eq(ok(await converse(shops[4], '192.0.2.150', 'real-1', 6)), 6, 'a real customer on another network'); eq(ok(await converse(shops[5], '192.0.2.151', 'real-2', 4)), 4, 'a second real customer');
      const token = createHash('sha256').update('v15-r5-owner').digest('hex');
      await store.put('access_sessions', accessHash(token), { scope: 'onboarding', email: shops[4].owner.email, status: 'active', expiresAt: new Date(Date.now() + 3600000).toISOString() });
      const owner = await call(chat, '/api/chat', { body: { client: shops[4].slug, channel: 'test', contact: 'owner', messages: [{ role: 'user', content: 'test' }] }, headers: { ...origin, authorization: 'Bearer ' + token }, ip: '2001:db8:bad::1' });
      if (owner.status === 429 || owner.status === 503) throw new Error('owner practice refused: ' + owner.status + ' ' + owner.data?.error);
    });
    await check('A2r5 400 turns from one network across 8 shops, in concurrent waves of 20, at global 500 admit exactly 150 (absolute cap), leaving 340 of the 490 anonymous pool', async () => {
      await fresh(); await env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '500' }, async () => {
        const burst = Array.from({ length: 8 }, (_, i) => tenant('r5-burst-' + i)); for (const c of burst) await store.saveClient(c);
        const rs = []; for (let w = 0; w < 20; w++) rs.push(...await Promise.all(Array.from({ length: 20 }, (_, j) => { const i = w * 20 + j; return ai.reserveAIRequest(burst[i % 8], 'web', { ip: '2001:db8:b0::' + i.toString(16) }); })));
        eq(rs.filter(r => r.allowed).length, 150, 'admitted under race'); eq(await anonymousUsed(), 150, 'counted');
        eq((await ai.reserveAIRequest(burst[0], 'web', { ip: '192.0.2.160' })).allowed, true, 'another network');
      });
    });
    await check('A2r5 the share follows the global pool: global 200 gives one network 142 (75% of 190), never the whole pool', async () => {
      await fresh(); await env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '200' }, async () => {
        let got = 0; for (let i = 0; i < 160; i++) if ((await ai.reserveAIRequest(shops[i % 6], 'web', { ip: '203.0.113.200' })).allowed) got++;
        eq(got, 142, 'one network'); eq((await ai.reserveAIRequest(shops[0], 'web', { ip: '203.0.113.201' })).allowed, true, 'another network');
      });
    });
    await check('A2r5 configuration: share 50% gives 20 at the defaults, an absolute cap of 12 gives 12, a pool of 2 still admits one turn per network', async () => {
      for (const [vars, want] of [[{ MC_SELF_SERVICE_AI_PUBLIC_IP_POOL_PERCENT: '50' }, 20], [{ MC_SELF_SERVICE_AI_PUBLIC_IP_DAILY_LIMIT: '12' }, 12], [{ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '3' }, 1], [{ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '2' }, 1]]) {
        await fresh(); await env(vars, async () => {
          let got = 0; for (let i = 0; i < 40; i++) if ((await ai.reserveAIRequest(shops[i % 6], 'web', { ip: '203.0.113.210' })).allowed) got++;
          eq(got, want, JSON.stringify(vars));
        });
      }
      await fresh(); await env({ MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT: '3' }, async () => {
        eq((await ai.reserveAIRequest(shops[0], 'web', { ip: '203.0.113.210' })).allowed, true, 'first network at global 3');
        eq((await ai.reserveAIRequest(shops[0], 'web', { ip: '203.0.113.210' })).allowed, false, 'first network share of 1 used');
        eq((await ai.reserveAIRequest(shops[0], 'web', { ip: '203.0.113.211' })).allowed, true, 'second network at global 3');
        eq((await ai.reserveAIRequest(shops[0], 'web', { ip: '203.0.113.212' })).allowed, false, 'pool of 2 used');
      });
    });
    await check('A2r5 (documents D2c) at the default global 50, five visitors behind one NAT share that network\'s 30 turns; the whole-day anonymous pool is 40', async () => {
      await fresh(); let got = 0; for (let p = 0; p < 5; p++) got += ok(await converse(shops[p], '100.64.8.9', 'natd-' + p, 8));
      eq(got, 30, 'turns for the five together'); eq(ok(await converse(shops[5], '192.0.2.170', 'other', 12)), 10, 'everyone else: the remaining 10');
    });
    await check('A2r5 a malformed or out-of-range share fails closed with 503 (91, 100, "x")', async () => {
      for (const v of ['91', '100', 'x']) { await fresh(); await env({ MC_SELF_SERVICE_AI_PUBLIC_IP_POOL_PERCENT: v }, async () => { eq((await say(shops[0], '203.0.113.220', 'cfg-' + v, 'hi')).status, 503, 'share ' + v); }); }
    });
  } finally { globalThis.fetch = harnessFetch; await fresh(); process.env.MC_FAKE_MODEL = '1'; delete process.env.ANTHROPIC_API_KEY; log('a2r5 in-process model stub calls (no network):', modelCalls, 'turns sent with a conversation token:', tokenTurns); }
}

if (group === 'all' || group === 'a3') {
  process.env.ADMIN_EMAILS = 'operator@example.test';
  const access = (await load('netlify/functions/access.mjs')).default;
  const manage = (await load('netlify/functions/manage.mjs')).default;
  await check('A3 per-IP rejections do not spend the shared hourly sign-in allowance', async () => {
    for (let i = 0; i < 150; i++) await call(access, '/api/access', { body: { action: 'request_link', email: `a3junk${i}@example.test` }, headers: origin, ip: '203.0.113.66' });
    eq((await call(access, '/api/access', { body: { action: 'request_link', email: 'a3-owner@example.test' }, headers: origin, ip: '192.0.2.70' })).status, 202, 'owner');
  });
  await check('A3 exhausting the owner pool from many IPs leaves operator sign-in available', async () => {
    for (let ip = 0; ip < 25; ip++) for (let i = 0; i < 5; i++) await call(access, '/api/access', { body: { action: 'request_link', email: `a3m${ip}-${i}@example.test` }, headers: origin, ip: `198.18.0.${ip}` });
    eq((await call(access, '/api/access', { body: { action: 'request_link', email: 'a3-late@example.test' }, headers: origin, ip: '192.0.2.71' })).status, 429, 'owner pool exhausted');
    eq((await call(manage, '/api/manage', { body: { action: 'request_link', email: 'operator@example.test' }, headers: origin, ip: '192.0.2.72' })).status, 202, 'operator');
  });
  const intake = (await load('netlify/functions/intake.mjs')).default;
  const form = i => ({ submissionId: ((i + 0x5000).toString(16).padStart(8, '0') + 'b'.repeat(24)), name: 'X', email: `v15s${i}@example.test`, business: 'Y', marketingConsent: false, botfield: '' });
  await check('A7 intake: one IP\'s rejected posts do not lock out other visitors', async () => {
    for (let i = 0; i < 250; i++) await call(intake, '/api/intake', { body: form(i), headers: origin, ip: '203.0.113.8' });
    eq((await call(intake, '/api/intake', { body: form(9999), headers: origin, ip: '192.0.2.50' })).status, 202, 'visitor');
  });
}

if (group === 'all' || group === 'a4') {
  const start = Date.parse('2030-06-10T13:00:00Z'); let clock = start; const realNow = Date.now; Date.now = () => clock;
  const at = (day, m) => { clock = start + day * 86400000 + m * 60000; };
  process.env.ADMIN_EMAILS = 'operator@example.test';
  const access = (await load('netlify/functions/access.mjs')).default;
  const manage = (await load('netlify/functions/manage.mjs')).default;
  const { accessHash } = await load('netlify/functions/lib/access.mjs');
  const req = (email, ip) => call(access, '/api/access', { body: { action: 'request_link', email }, headers: origin, ip });
  await check('A4 one recipient gets at most 24 sign-in emails a day from rotating networks, then recovers next day', async () => {
    let sent = 0; for (let m = 0; m < 24 * 60; m += 16) { at(0, m); if ((await req('v15-victim@example.test', `198.51.100.${m % 200}`)).status === 202) sent++; }
    if (sent < 24 || sent > 30) throw new Error('sent in 24h: expected 24..30 (ceiling + first network) got ' + sent); at(1, 60); eq((await req('v15-victim@example.test', '192.0.2.80')).status, 202, 'next day');
  });
  await check('A4 one network gets at most 6 sign-in emails a day for one recipient', async () => {
    let sent = 0; for (const m of [0, 16, 32]) { at(3, m); for (let i = 0; i < 3; i++) if ((await req('v15-one@example.test', '203.0.113.210')).status === 202) sent++; }
    eq(sent, 6, 'sent from one network');
  });
  await check('A4 (guard) 6 requests from one network do not lock the victim out on their own network (QA-15 Q4.1)', async () => {
    at(5, 0); for (let i = 0; i < 3; i++) await req('v15-q41@example.test', '203.0.113.200');
    at(5, 16); for (let i = 0; i < 3; i++) await req('v15-q41@example.test', '203.0.113.200');
    at(5, 40); eq((await req('v15-q41@example.test', '192.0.2.10')).status, 202, 'victim from own network');
  });
  await check('A4 (guard) onboarding requests for the operator email do not lock the operator out of /admin (QA-15 Q4.2)', async () => {
    at(7, 0); for (let i = 0; i < 3; i++) await req('operator@example.test', '203.0.113.201');
    at(7, 16); for (let i = 0; i < 3; i++) await req('operator@example.test', '203.0.113.201');
    at(7, 60); eq((await call(manage, '/api/manage', { body: { action: 'request_link', email: 'operator@example.test' }, headers: origin, ip: '192.0.2.11' })).status, 202, 'operator');
  });
  await check('A4 (guard) requests refused by the exhausted global pool do not spend the recipient daily allowance (QA-15 Q4.3)', async () => {
    at(9, 0); for (let k = 0; k < 25; k++) for (let i = 0; i < 5; i++) await req(`v15-junk${k}-${i}@example.test`, `198.18.1.${k}`);
    const during = []; for (const m of [1, 17, 33, 49]) { at(9, m); for (let i = 0; i < 2; i++) during.push((await req('v15-q43@example.test', '192.0.2.12')).status); }
    if (during.some(x => x !== 429)) throw new Error('global pool not exhausted: ' + during.join(','));
    at(9, 70); eq((await req('v15-q43@example.test', '192.0.2.12')).status, 202, 'after the hourly pool resets');
  });
  await check('A4 a network that completed sign-in is exempt from the recipient-wide ceiling; strangers stay bounded', async () => {
    at(11, 0); eq((await req('v15-ret@example.test', '192.0.2.30')).status, 202, 'first link');
    const store2 = await load('netlify/functions/lib/store.mjs'); const token = (await store2.get('access_outbox', accessHash('v15-ret@example.test')))?.token;
    eq((await call(access, '/api/access', { body: { action: 'exchange', token }, headers: origin, ip: '192.0.2.30' })).status, 200, 'exchange');
    let sent = 0; for (let k = 0; k < 6; k++) for (const m of [1, 17]) { at(11, m); for (let i = 0; i < 3; i++) if ((await req('v15-ret@example.test', `203.0.113.${50 + k}`)).status === 202) sent++; }
    eq(sent, 24, 'stranger emails (24-a-day ceiling; the owner asked first)');
    at(11, 100); eq((await req('v15-ret@example.test', '192.0.2.30')).status, 202, 'returning owner on own network');
    at(11, 101); eq((await req('v15-ret@example.test', '192.0.2.31')).status, 429, 'an unknown network is held at the ceiling');
  });
  await check('A4 the known-network exemption lapses 30 days after the last sign-in', async () => {
    let sent = 0; for (let k = 0; k < 9; k++) { at(45, k); for (let i = 0; i < 3; i++) if ((await req('v15-ret@example.test', `203.0.113.${80 + k}`)).status === 202) sent++; }
    eq(sent, 27, 'stranger emails on day 34 after sign-in (24 + the first network)');
    at(45, 30); eq((await req('v15-ret@example.test', '192.0.2.30')).status, 429, 'formerly known network');
  });
  Date.now = realNow;
}

// Revision 3: QA-15 r2 probe q6 folded in. Guards 15-08 (pool refund on a daily refusal, known networks skip the
// shared pool, first-requester exemption) and the per-email operator pool. Each check uses its own day and networks.
if (group === 'all' || group === 'a4b') {
  const start = Date.parse('2031-01-06T13:00:00Z'); let clock = start; const realNow = Date.now; Date.now = () => clock;
  const at = (day, m) => { clock = start + day * 86400000 + m * 60000; };
  process.env.ADMIN_EMAILS = 'op1@example.test,op2@example.test,op3@example.test,op4@example.test,op5@example.test,op6@example.test,op7@example.test,op8@example.test,op9@example.test,op10@example.test';
  const access = (await load('netlify/functions/access.mjs')).default;
  const manage = (await load('netlify/functions/manage.mjs')).default;
  const { accessHash } = await load('netlify/functions/lib/access.mjs');
  const pub = (email, ip) => call(access, '/api/access', { body: { action: 'request_link', email }, headers: origin, ip });
  const op = (email, ip) => call(manage, '/api/manage', { body: { action: 'request_link', email }, headers: origin, ip });
  const token = async email => (await store.get('access_outbox', accessHash(email)))?.token;
  // Four quarter-hours, `nets` attacker networks, three requests each (the per-(recipient, network) 15-minute cap).
  const flood = async (send, email, day, m0, prefix, nets = 10) => { let delivered = 0; for (let q = 0; q < 4; q++) { at(day, m0 + q * 15); for (let k = 0; k < nets; k++) for (let i = 0; i < 3; i++) if ((await send(email, `${prefix}.${k}`)).status === 202) delivered++; } return delivered; };
  await check('A4b an operator on a signed-in network is not locked out of /admin by public /api/manage floods (QA-15 r2 Q6.1)', async () => {
    at(0, 0); eq((await op('op1@example.test', '192.0.2.151')).status, 202, 'first link');
    eq((await call(manage, '/api/manage', { body: { action: 'exchange', token: await token('op1@example.test') }, headers: origin, ip: '192.0.2.151' })).status, 200, 'exchange');
    const delivered = await flood(op, 'op1@example.test', 0, 1, '203.0.113'); if (delivered > 30) throw new Error('attacker delivered ' + delivered);
    at(0, 50); eq((await op('op1@example.test', '192.0.2.151')).status, 202, 'operator from known network, same pool hour');
  });
  await check('A4b a daily refusal returns its pool unit: an operator who asked first is not locked out in the same hour (N06, N11)', async () => {
    at(3, 0); eq((await op('op2@example.test', '192.0.2.152')).status, 202, 'operator asks first');
    const delivered = await flood(op, 'op2@example.test', 3, 1, '203.0.114'); eq(delivered, 24, 'attacker emails (recipient ceiling)');
    at(3, 50); eq((await op('op2@example.test', '192.0.2.152')).status, 202, 'operator retries in the same pool hour');
  });
  await check('A4b a signed-in network skips the shared owner pool while junk exhausts it (QA-15 r2 Q6.6, N07)', async () => {
    at(6, 0); await pub('own-a4b@example.test', '192.0.2.153');
    eq((await call(access, '/api/access', { body: { action: 'exchange', token: await token('own-a4b@example.test') }, headers: origin, ip: '192.0.2.153' })).status, 200, 'exchange');
    at(6, 100); for (let k = 0; k < 25; k++) for (let i = 0; i < 5; i++) await pub(`a4b-junk${k}-${i}@example.test`, `198.18.3.${k}`);
    at(6, 105); eq((await pub('a4b-late@example.test', '192.0.2.154')).status, 429, 'owner pool exhausted');
    eq((await pub('own-a4b@example.test', '192.0.2.153')).status, 202, 'returning owner on known network');
  });
  await check('A4b a new signup who asked first is not locked out by later traffic from 4 networks (QA-15 r2 Q6.3, N08)', async () => {
    at(9, 0); eq((await pub('new-a4b@example.test', '192.0.2.155')).status, 202, 'signup first');
    for (const m of [1, 17]) { at(9, m); for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) await pub('new-a4b@example.test', `198.51.105.${k}`); }
    at(9, 60); eq((await pub('new-a4b@example.test', '192.0.2.155')).status, 202, 'signup retry from own network');
  });
  await check('A4b one recipient still gets at most 30 emails a day (24 ceiling + one first network) from 10 networks (QA-15 r2 Q6.5, N09)', async () => {
    let bomb = 0; for (let q = 0; q < 8; q++) { at(12, q * 16); for (let k = 0; k < 10; k++) for (let i = 0; i < 3; i++) if ((await pub('bomb-a4b@example.test', `198.51.106.${k}`)).status === 202) bomb++; }
    eq(bomb, 30, 'emails delivered to one recipient');
  });
  await check('A4b the first-requester exemption lasts one 24 h window, then the next first network gets it (N10)', async () => {
    at(15, 0); eq((await pub('n10-a4b@example.test', '192.0.2.156')).status, 202, 'day 1 first network');
    at(17, 0); eq((await pub('n10-a4b@example.test', '192.0.2.157')).status, 202, 'day 3 first network');
    for (const m of [1, 17]) { at(17, m); for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) await pub('n10-a4b@example.test', `198.51.107.${k}`); }
    at(17, 60); eq((await pub('n10-a4b@example.test', '192.0.2.157')).status, 202, 'day 3 first network after the ceiling');
  });
  await check('A4b traffic for other operator emails cannot fill one operator\'s pool (QA-15 r2 Q6.7 hour 1; per-email operator pool)', async () => {
    const targets = [['op3@example.test', '203.0.115'], ['op4@example.test', '203.0.116'], ['op5@example.test', '203.0.117']], ds = [0, 0, 0];
    for (let q = 0; q < 4; q++) { at(20, q * 15); for (const [j, [email, prefix]] of targets.entries()) for (let k = 0; k < 10; k++) for (let i = 0; i < 3; i++) if ((await op(email, `${prefix}.${k}`)).status === 202) ds[j]++; }
    eq(ds.join(','), '30,30,30', 'attacker-first emails delivered per bombed operator (24 + first network)');
    at(20, 50); eq((await op('op6@example.test', '100.64.7.1')).status, 202, 'another operator on a new network in the same hour');
  });
  await check('A4b an operator pool cannot be filled across a 24 h counter-window boundary (pool sized for two windows)', async () => {
    const e = 'op7@example.test', send = async (ip, n) => { let d = 0; for (let i = 0; i < n; i++) if ((await op(e, ip)).status === 202) d++; return d; };
    let d = 0; at(23, 0); d += await send('203.0.118.1', 1); at(23, 1); d += await send('203.0.118.2', 1); // first network, then the ceiling window opens
    at(23, 1410); for (let k = 3; k < 11; k++) d += await send(`203.0.118.${k}`, k < 10 ? 3 : 2); d += await send('203.0.118.1', 3);
    at(23, 1426); d += await send('203.0.118.1', 2);                                                     // ceiling full, first network used up
    at(23, 1442); d += await send('203.0.118.20', 1) + await send('203.0.118.21', 1) + await send('203.0.118.22', 1); // both windows renewed
    eq(d, 33, 'attacker emails delivered, 31 of them inside one pool hour');
    at(23, 1445); eq((await op(e, '100.64.7.2')).status, 202, 'operator on a new network while the counters still admit');
  });
  await check('A4b the operator pool follows raised daily counters (MC_ACCESS_EMAIL_RECIPIENT_DAILY_LIMIT=40)', async () => {
    process.env.MC_ACCESS_EMAIL_RECIPIENT_DAILY_LIMIT = '40';
    try {
      let d = 0; at(26, 0); for (let i = 0; i < 3; i++) if ((await op('op3@example.test', '203.0.119.1')).status === 202) d++;
      for (let k = 2; k < 11 && d < 31; k++) for (let i = 0; i < 3 && d < 31; i++) if ((await op('op3@example.test', `203.0.119.${k}`)).status === 202) d++;
      at(26, 16); for (let i = 0; i < 3 && d < 31; i++) if ((await op('op3@example.test', '203.0.119.1')).status === 202) d++;
      eq(d, 31, 'attacker emails in one hour');
      at(26, 40); eq((await op('op3@example.test', '100.64.7.3')).status, 202, 'operator on a new network below the raised ceiling');
    } finally { delete process.env.MC_ACCESS_EMAIL_RECIPIENT_DAILY_LIMIT; }
  });
  await check('A4b admitted traffic that filled a rev 3 operator pool (61) leaves the operator able to sign in (QA-15 r3 D1, q9 P2 schedule)', async () => {
    const e = 'op8@example.test'; let inP = 0;
    const send = async (ip, n, m, count = true) => { at(32, m); let d = 0; for (let i = 0; i < n; i++) if ((await op(e, ip)).status === 202) d++; if (count) inP += d; return d; };
    await send('203.0.120.1', 1, 1000, false); await send('203.0.120.2', 1, 2420, false); await send('203.0.120.2', 1, 2445, false); // X first; Y opens the ceiling and its own day; then Y becomes first
    await send('203.0.120.2', 3, 3850); for (let k = 10; k < 18; k++) await send(`203.0.121.${k}`, 3, 3851);                           // pool hour [3850, 3910)
    await send('203.0.120.2', 3, 3865); for (let k = 20; k < 28; k++) await send(`203.0.122.${k}`, k < 27 ? 3 : 2, 3866);
    await send('203.0.120.2', 3, 3880); await send('203.0.120.3', 3, 3885); await send('203.0.120.3', 3, 3900);
    eq(inP, 61, 'attacker emails admitted in one pool hour'); eq((await store.get('access_rate', 'email-day:' + accessHash(e)))?.count, 23, 'recipient ceiling still has room');
    at(32, 3905); eq((await op(e, '100.64.9.9')).status, 202, 'operator on a new network');
  });
  const fillPool = async (email, count) => store.put('access_rate', 'global:operator:' + accessHash(email), { count, until: clock + 3600000 });
  await check('A4b a filled operator pool refuses new networks at exactly 2 x 24 + 4 x 6 + 1 = 73 (QA-15 r3 Q01)', async () => {
    const e = 'op9@example.test'; at(36, 0); await fillPool(e, 72);
    eq((await op(e, '100.64.8.1')).status, 202, '73rd pool unit'); eq((await store.get('access_rate', 'global:operator:' + accessHash(e)))?.count, 73, 'pool count');
    eq((await op(e, '100.64.8.2')).status, 429, 'pool full: new network refused');
  });
  await check('A4b a signed-in operator network is admitted while its operator pool is full (QA-15 r3 Q03)', async () => {
    const e = 'op10@example.test'; at(39, 0); eq((await op(e, '192.0.2.160')).status, 202, 'first link');
    eq((await call(manage, '/api/manage', { body: { action: 'exchange', token: await token(e) }, headers: origin, ip: '192.0.2.160' })).status, 200, 'exchange');
    at(39, 5); await fillPool(e, 73);
    eq((await op(e, '100.64.8.3')).status, 429, 'new network refused by the full pool');
    eq((await op(e, '192.0.2.160')).status, 202, 'known network skips the pool');
  });
  // Documented residual (not asserted): an attacker who asks before the real signup, from 5+ networks, still blocks it ~24 h.
  for (const m of [0, 16]) { at(29, m); for (let k = 0; k < 6; k++) for (let i = 0; i < 3; i++) await pub('pre-a4b@example.test', `198.51.108.${k}`); }
  at(29, 60); log(`INFO A4b residual (QA-15 r2 Q6.4): attacker-first 36 requests from 6 networks, then the real signup -> ${(await pub('pre-a4b@example.test', '192.0.2.158')).status} (429 = documented residual)`);
  Date.now = realNow;
}

if (group === 'all' || group === 'a5') {
  process.env.TWILIO_AUTH_TOKEN = 'dummy-offline-twilio-token'; process.env.VAPI_WEBHOOK_SECRET = 'dummy-offline-vapi-secret';
  const sms = (await load('netlify/functions/sms.mjs')).default;
  const vapi = (await load('netlify/functions/vapi.mjs')).default;
  const alert = (await load('netlify/functions/twilio-alert.mjs')).default;
  const c = newClient({ slug: 'v15-hook', ownerKey: 'dummy', owner: { name: 'Pat', email: 'pat@example.invalid', phone: '+17135550142' }, business: { name: 'Legacy Air' } });
  c.status = 'live'; c.phone = { ...c.phone, twilioNumber: '+17135550198' }; await store.saveClient(c); await store.indexClient(c);
  const h = { 'content-type': 'application/x-www-form-urlencoded' };
  const sign = (path, params) => createHmac('sha1', process.env.TWILIO_AUTH_TOKEN).update(process.env.URL + path + Object.keys(params).sort().map(k => k + params[k]).join('')).digest('base64');
  const p = { To: '+17135550198', From: '+17135550142', Body: 'help' };
  await check('A5 configured token: correctly signed owner text is accepted', async () => { const r = await call(sms, '/api/sms', { raw: new URLSearchParams(p).toString(), headers: { ...h, 'x-twilio-signature': sign('/api/sms', p) } }); eq(r.status, 200, 'status'); });
  await check('A5 configured token: wrong signature rejected 403', async () => { eq((await call(sms, '/api/sms', { raw: new URLSearchParams(p).toString(), headers: { ...h, 'x-twilio-signature': 'AAAA' } })).status, 403, 'status'); });
  await check('A5 token unset at request time: unsigned sms and twilio-alert fail closed', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    eq((await call(sms, '/api/sms', { raw: new URLSearchParams(p).toString(), headers: h })).status, 503, 'sms');
    const r = await call(alert, '/api/twilio-alert', { raw: 'Sid=NO1&Payload=%7B%7D', headers: h }); if (r.status < 400) throw new Error('alert accepted ' + r.status);
  });
  await check('A5 vapi: correct secret accepted, wrong rejected, missing secret fails closed', async () => {
    const body = { message: { type: 'status-update' } };
    eq((await call(vapi, '/api/vapi', { body, headers: { 'x-vapi-secret': 'dummy-offline-vapi-secret' } })).status, 200, 'ok');
    eq((await call(vapi, '/api/vapi', { body, headers: { 'x-vapi-secret': 'nope' } })).status, 403, 'wrong');
    delete process.env.VAPI_WEBHOOK_SECRET;
    if ((await call(vapi, '/api/vapi', { body })).status < 400) throw new Error('missing secret accepted');
  });
}

if (group === 'all' || group === 'a6') {
  const policy = (await load('netlify/functions/policy.mjs')).default;
  const c = newClient({ slug: 'v15-ss', ownerKey: 'dummy', owner: { name: 'Owner', email: 'private.v15@example.invalid', phone: '+17135550143' }, business: { name: 'Bayou Air' } });
  c.onboarding = { version: 1, verifiedEmail: 'private.v15@example.invalid' }; c.status = 'testing'; await store.saveClient(c);
  const l = newClient({ slug: 'v15-legacy', ownerKey: 'dummy', owner: { name: 'Owner', email: 'legacy.v15@example.invalid', phone: '+17135550144' }, business: { name: 'Old Shop' } });
  l.status = 'live'; await store.saveClient(l);
  await check('A6 /policy omits a supported workspace owner email but still renders', async () => { const r = await call(policy, '/policy?c=v15-ss'); eq(r.status, 200, 'status'); if (/private\.v15@/.test(r.data)) throw new Error('email disclosed'); });
  await check('A6 /policy for a legacy shop is unchanged (contact email kept pending owner decision)', async () => { const r = await call(policy, '/policy?c=v15-legacy'); eq(r.status, 200, 'status'); if (!/legacy\.v15@/.test(r.data)) throw new Error('legacy email removed'); });
}

if (group === 'all' || group === 'a8') {
  const chat = (await load('netlify/functions/chat.mjs')).default;
  const msg = { messages: [{ role: 'user', content: 'What does it cost?' }] };
  await check('A8 sales: one /64 is one caller (20/day), unrelated visitor still served', async () => {
    const rs = []; for (let i = 0; i < 45; i++) rs.push(await call(chat, '/api/chat', { body: msg, ip: `2001:db8:a8::${i.toString(16)}` }));
    eq(tally(rs)[200], 20, 'answered');
    eq((await call(chat, '/api/chat', { body: msg, headers: origin, ip: '192.0.2.99' })).status, 200, 'visitor');
  });
}
log(`v15 ${group}: ${pass} passed, ${fail} failed`);
done('v15');
process.exitCode = fail ? 1 : 0;
