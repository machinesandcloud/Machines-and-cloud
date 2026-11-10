// QA probe (independent reviewer): is a resubmitted request_voice_activation (no submission id) a duplicate?
// Actual voice engine, memory store, dummy provider env, gate closed (no provider call). Physical network denied.
import assert from 'node:assert/strict'; import { createHash } from 'node:crypto'; import { writeFileSync, existsSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module'; import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const out = process.argv[2]; if (!out || existsSync(out)) throw new Error('new output path required');
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|VOICE_|PHONE_)/.test(k)) delete process.env[k];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: 'http://127.0.0.1:8899' });
let physical = 0; const deny = () => { physical++; throw new Error('denied'); }; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async () => deny();
const hash = v => createHash('sha256').update(v).digest('hex');
const store = await import('../../../../netlify/functions/lib/store.mjs'), voice = await import('../../../../netlify/functions/lib/voice-activation.mjs');
const { createManagedVoiceProvider } = await import('../../../../netlify/functions/lib/voice-provider.mjs'), { configurationRevision } = await import('../../../../netlify/functions/lib/setup.mjs'), { newClient } = await import('../../../../netlify/functions/lib/config.mjs');
const policy = { version: 'qa_voice_v1', model: 'qa-model', maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, accountDailyCalls: 1000, accountDailyMinutes: 5000, authorityText: 'I am authorized to connect this business phone service (QA fixture).', usageDisclosure: 'QA fixture usage disclosure for a synthetic voice policy.' };
const result = { at: new Date().toISOString(), checks: [] }; let serial = 0;
const check = async (name, fn) => { try { await store.put('voice_activation_queue', 'active_v1', { version: 1, intents: {}, cursor: '' }); const detail = await fn(); result.checks.push({ name, pass: true, detail }); } catch (e) { result.checks.push({ name, pass: false, error: String(e.stack || e).slice(0, 1500) }); } };
async function client() { const slug = 'qa-voice-' + ++serial, c = newClient({ slug, ownerKey: 'private-' + slug, owner: { email: slug + '@example.test', name: 'QA', phone: '+17135550100' }, business: { name: 'QA Shop', trade: 'HVAC', serviceArea: ['Houston'] } });
  Object.assign(c, { onboarding: { version: 1 }, status: 'testing', build: { status: 'built' }, channels: { web: { active: false }, voice: { active: false }, sms: { active: false } } }); c.phone.businessNumber = '+17135550122'; c.services = ['AC repair']; c.windows = ['8 to 12']; c.rules.hours = { mon: { open: '08:00', close: '17:00' } }; const r = configurationRevision(c); c.setupProof = { reviewedRevision: r, testedRevision: r, testMode: 'live' }; await store.put('clients', slug, c); return c; }
const engine = () => voice.createVoiceActivationEngine({ provider: createManagedVoiceProvider({ executionAllowed: () => false }), policy, gate: () => false });
const body = (e, c, extra = {}) => ({ actor: { role: 'owner', email: c.owner.email }, expectedRevision: configurationRevision(c), acceptedAuthority: true, policyVersion: e.offer().version, policyDigest: e.offer().digest, forwardingMode: 'use_new_number', ...extra });
const rows = async c => { const keys = await store.list('voice_activation_intents', c.slug); return Promise.all(keys.map(k => store.get('voice_activation_intents', k))); };
const queue = async () => Object.keys((await store.get('voice_activation_queue', 'active_v1')).intents).length;
await check('sequential resubmit with identical fields (hold released, owner submits again) is the same intent/generation', async () => {
  const c = await client(), e = engine(), a = await e.request(c, body(e, c)), b = await e.request(c, body(e, c)), r = await rows(c);
  assert.equal(a.id, b.id); assert.equal(r.length, 1); assert.equal(r[0].generation, 1); assert.equal(await queue(), 1); return { id: a.id, rows: r.length, generation: r[0].generation, queue: await queue() };
});
await check('concurrent duplicate (original still in flight while the resubmit lands) leaves one intent, generation 1', async () => {
  const c = await client(), e = engine(), [a, b] = await Promise.all([e.request(c, body(e, c)), e.request(c, body(e, c))]), r = await rows(c);
  assert.equal(a.id, b.id); assert.equal(r.length, 1); assert.equal(r[0].generation, 1); return { rows: r.length, generation: r[0].generation, queue: await queue() };
});
await check('resubmit after the owner edits the kept form (forwarding mode) replaces the same intent (generation 2), never a second operation', async () => {
  const c = await client(), e = engine(); await e.request(c, body(e, c)); await e.request(c, body(e, c, { forwardingMode: 'forward_business_line' })); const r = await rows(c);
  assert.equal(r.length, 1); return { rows: r.length, generation: r[0].generation, forwardingMode: r[0].forwardingMode };
});
await check('existing waiting_platform intent: identical resubmit returns it unchanged (no observable change for mutationEvidence to see)', async () => {
  const c = await client(), e = engine(), first = await e.request(c, body(e, c)); const before = (await rows(c))[0]; await e.request(c, body(e, c)); const after = (await rows(c))[0];
  assert.equal(before.generation, after.generation); assert.equal(before.updatedAt, after.updatedAt); return { state: first.state, generation: after.generation, updatedAtUnchanged: before.updatedAt === after.updatedAt };
});
result.physical = physical; result.passed = result.checks.filter(c => c.pass).length; result.total = result.checks.length;
writeFileSync(out, JSON.stringify(result, null, 2)); console.log(result.passed + '/' + result.total, 'physical', physical); process.exit(result.passed === result.total && !physical ? 0 : 1);
