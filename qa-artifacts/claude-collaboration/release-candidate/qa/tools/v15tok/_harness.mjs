// Shared offline harness. Run under: env -i PATH HOME MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 SRC=<throwaway copy> node <repro>.mjs
// Dummy local values only; every outbound fetch is refused and counted.
import { pathToFileURL } from 'node:url';
export const SRC = process.env.SRC;
if (!SRC) throw new Error('Set SRC to the throwaway source copy');
if (process.env.MC_MEMORY_STORE !== '1' || process.env.MC_FAKE_MODEL !== '1') throw new Error('Run with MC_MEMORY_STORE=1 MC_FAKE_MODEL=1');
for (const k of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|SERVICE_WORKER_KEY|ADMIN_)/.test(k)) delete process.env[k];
process.env.URL ||= 'http://127.0.0.1:8899';
export const net = { attempts: 0 };
globalThis.fetch = async (u) => { net.attempts++; throw new Error('offline harness: network blocked ' + String(u).slice(0, 60)); };
export const load = async rel => import(pathToFileURL(SRC + '/' + rel).href);
export const out = [];
export const log = (...a) => { const line = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); out.push(line); console.log(line); };
export async function call(handler, path, { method, body, headers = {}, ip = '198.51.100.1', raw } = {}) {
  const m = method || (body === undefined && raw === undefined ? 'GET' : 'POST');
  const req = new Request(process.env.URL + path, { method: m, headers: { 'content-type': 'application/json', ...headers }, ...(m === 'GET' ? {} : { body: raw ?? JSON.stringify(body) }) });
  const res = await handler(req, { ip });
  const text = await res.text(); let data = text; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, headers: res.headers };
}
export function done(name) { log(`[${name}] outbound fetch calls intercepted by stub (none left the process): ${net.attempts}`); }
