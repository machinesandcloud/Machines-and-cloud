// Shared offline harness for the first-customer fix checks (PRA-FC-*). Run from a copy root:
//   node <check>.mjs --playwright <playwright/index.mjs> --out <new dir> [--label base|patched|mutant-x]
// Actual /api/client, /api/access and /api/chat handlers and browser assets from the copy under test;
// memory store, fake model, all physical transport denied, every non-loopback browser request aborted
// (fonts fulfilled empty). Synthetic data only. No model, provider, email, OAuth, purchase or deploy.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
export { assert };
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
export const out = option('--out') && resolve(option('--out')), label = option('--label') || 'run', playwrightPath = option('--playwright');
if (!out) throw new Error('Pass --out <new directory>'); if (existsSync(out)) throw new Error('--out must not exist'); mkdirSync(out, { recursive: true });
export const root = resolve('.'); if (!existsSync(resolve(root, 'desk.js'))) throw new Error('Run from the copy root.');
export const sha = v => createHash('sha256').update(v).digest('hex');
export const origin = 'http://127.0.0.1:' + (8900 + Math.floor(Math.random() * 90));
export const report = { label, at: new Date().toISOString(), root, checks: [], screenshots: [], requests: 0, forbidden: [], pageErrors: [], physicalNetwork: 0 };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|PLATFORM_DATA)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
const deny = () => { report.physicalNetwork++; throw new Error('FC check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async input => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };
export const lib = path => pathToFileURL(resolve(root, path)).href;
export const store = await import(lib('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(lib('netlify/functions/lib/config.mjs'));
export const { workspaceTenant } = await import(lib('netlify/functions/lib/workspace-identity.mjs'));
export const clientHandler = (await import(lib('netlify/functions/client.mjs'))).default;
export const handlers = { '/api/client': clientHandler, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default, '/api/chat': (await import(lib('netlify/functions/chat.mjs'))).default };
for (const [p, f] of [['/api/workspace-billing', 'workspace-billing.mjs'], ['/api/channel-availability', 'channel-availability.mjs']]) { try { handlers[p] = (await import(lib('netlify/functions/' + f))).default; } catch {} }
let browser = null;
export async function launch() { const playwright = await import(pathToFileURL(resolve(playwrightPath)).href); browser = await playwright.chromium.launch({ ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] }); return browser; }
let serial = 0;
export const HOUR = 3600000, ago = ms => new Date(Date.now() - ms).toISOString();
export function houstonDate(days) { const d = new Date(Date.now() + days * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
export function nextWeekday(min = 2) { for (let d = min; d < min + 8; d++) { const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short' }).format(new Date(Date.now() + d * 86400000)); if (!['Sat', 'Sun'].includes(day)) return houstonDate(d); } }
export async function seed({ channels = ['web'], configure } = {}) {
  const slug = 'fc-' + label.replace(/[^a-z0-9]/g, '') + '-' + ++serial, token = sha('fc-token-' + slug + Date.now());
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Bayou Fixture Air', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: 'https://fixture-air.example.com', city: 'Houston' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: channels }, services: ['AC repair'], fees: [{ label: 'Diagnostic', amount: '$89', note: '' }], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm'); if (configure) await configure(c);
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const tenantIdentity = workspaceTenant(c);
  const api = async (method = 'GET', query = '', body) => { const r = await clientHandler(new Request(origin + '/api/client?c=' + slug + query, { method, headers: { Authorization: 'Bearer ' + token, Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.91' }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, body: json, text }; };
  return { slug, token, c, tenantIdentity, api, lead: data => store.addRecord('leads', slug, { tenantIdentity, status: 'open', reason: 'lead', outcome: 'needs_action', channel: 'web', urgency: 'flexible', createdAt: new Date().toISOString(), ...data }), visit: data => store.addRecord('bookings', slug, { tenantIdentity, status: 'booked', channel: 'web', window: '8 to 12', createdAt: new Date().toISOString(), delivery: { mode: 'portal_only', tenantIdentity }, ...data }) };
}
export async function open(x, { width, height, hash = '#today' }) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce', timezoneId: 'America/Chicago' }); context.setDefaultTimeout(10000);
  await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug: x.slug, token: x.token });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(), body = method === 'GET' ? null : request.postDataJSON();
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(body?.action)) { report.forbidden.push({ path: url.pathname, action: body?.action }); return route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }); }
      report.requests++;
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.91' });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await context.newPage(); page.on('pageerror', e => report.pageErrors.push(e.message));
  await page.goto(origin + '/desk.html?c=' + x.slug + hash); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { page, context, width };
}
export const route = (page, tab) => page.evaluate(tab => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab } })), tab);
export async function shot(page, name, width, full = false) { const path = out + '/' + label + '-' + name + '-' + width + '.png'; await page.screenshot({ path, fullPage: full }); report.screenshots.push(path); }
export async function check(name, run) { try { const note = await run(); report.checks.push({ name, pass: true, ...(note !== undefined ? { note } : {}) }); console.log('PASS ' + name); } catch (e) { report.checks.push({ name, pass: false, error: String(e.message).split('\n').slice(0, 3).join(' | ') }); console.log('FAIL ' + name + ': ' + String(e.message).split('\n')[0]); } }
export const noHScroll = async page => { const v = await page.evaluate(() => ({ w: innerWidth, d: document.documentElement.scrollWidth })); assert.ok(v.d <= v.w + 1, 'horizontal scroll ' + JSON.stringify(v)); };
export async function finish(name) {
  if (browser) await browser.close();
  report.ok = report.checks.length > 0 && report.checks.every(c => c.pass) && report.physicalNetwork === 0 && report.forbidden.length === 0;
  writeFileSync(out + '/' + name + '-' + label + '.json', JSON.stringify(report, null, 1));
  console.log((report.ok ? 'RESULT PASS ' : 'RESULT FAIL ') + name + ' ' + label + ': ' + report.checks.filter(c => c.pass).length + '/' + report.checks.length + ' checks, physicalNetwork=' + report.physicalNetwork + ', forbidden=' + report.forbidden.length + ', pageErrors=' + report.pageErrors.length);
  process.exit(report.ok ? 0 : 1);
}
