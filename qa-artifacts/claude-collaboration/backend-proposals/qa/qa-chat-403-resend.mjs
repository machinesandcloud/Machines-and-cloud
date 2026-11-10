// Usage: node qa-chat-403-resend.mjs <repo root>. Memory store, fake model, no network.
// Sends the same first-send turn twice to each refusal; asserts no conversation write, reports ratelimit counter and CORS headers.
import { pathToFileURL } from 'node:url';
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|ADMIN_KEY|SITE_ORIGINS|DEPLOY_)/.test(k)) delete process.env[k];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: 'https://platform.example.test' });
globalThis.fetch = async () => { throw new Error('network denied'); };
const repo = process.argv[2], lib = p => import(pathToFileURL(repo + '/' + p).href);
const store = await lib('netlify/functions/lib/store.mjs'), { newClient } = await lib('netlify/functions/lib/config.mjs');
const chat = (await lib('netlify/functions/chat.mjs')).default;
const SHOP = 'https://shop.example.test', EVIL = 'https://elsewhere.example.test';
const mk = (slug, extra) => ({ ...newClient({ slug, ownerKey: 'k-' + slug, owner: { name: 'O', email: slug + '@example.invalid', phone: '+17135550140' }, business: { name: 'Offline Air', website: SHOP, trade: 'HVAC', serviceArea: ['Katy'] } }), status: 'live', ...extra });
const out = [];
for (const [name, c, origin, extraBody] of [['paused-legacy', mk('qa-paused', { status: 'paused' }), SHOP, {}], ['forbidden-origin', mk('qa-forbid', {}), EVIL, {}], ['not-live', mk('qa-notlive', { status: 'building' }), SHOP, {}], ['test-no-key', mk('qa-test', {}), SHOP, { channel: 'test' }]]) {
  await store.saveClient(c);
  const bodies = [];
  for (const recoverTurn of [false, false, true]) {
    const res = await chat(new Request('https://platform.example.test/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-nf-client-connection-ip': '203.0.113.9' }, body: JSON.stringify({ client: c.slug, contact: 'v1', turnId: 'a'.repeat(32), messages: [{ role: 'user', content: 'hi' }], ...extraBody, ...(recoverTurn ? { recoverTurn: true } : {}) }) }), { ip: '203.0.113.9' });
    bodies.push({ recoverTurn, status: res.status, acao: res.headers.get('access-control-allow-origin'), acac: res.headers.get('access-control-allow-credentials'), body: await res.json() });
  }
  const conv = await store.getConversation(c, 'web', 'v1');
  out.push({ name, bodies, conversationMessages: conv.messages.length });
}
const rl = await store.get('ratelimit', `203.0.113.9/${Math.floor(Date.now() / 600000)}`);
console.log(JSON.stringify({ repo, out, ratelimitCounterAfter12Requests: rl }, null, 1));
