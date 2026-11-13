// P3 cards desk UI check: PRA-FC-07, PRA-FC-08, PRA-FC-11 in the real desk page with actual handlers.
// Memory store, fake model, synthetic tenant; browser requests are fulfilled from repo files or in-process
// handlers, every other origin is aborted (fonts get an empty stylesheet); server fetch throws. No route.fetch.
// node p3check/p3-desk-ui-check.mjs --playwright <index.mjs> --out <dir> --label <name>
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const out = resolve(arg('--out')), label = arg('--label') || 'run', pw = arg('--playwright');
mkdirSync(out, { recursive: true });
const root = resolve('.'), origin = 'http://127.0.0.1:8898';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin, PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }); // synthetic at-rest key, not a provider credential
const blockedServer = []; globalThis.fetch = async input => { blockedServer.push(String(input)); throw new Error('server network blocked'); };
const sha = v => createHash('sha256').update(v).digest('hex');
const store = await import(resolve('netlify/functions/lib/store.mjs'));
const { accessHash } = await import(resolve('netlify/functions/lib/access.mjs'));
const { newClient, parseHours } = await import(resolve('netlify/functions/lib/config.mjs'));
const { configurationRevision } = await import(resolve('netlify/functions/lib/setup.mjs'));
const handlers = { '/api/client': (await import(resolve('netlify/functions/client.mjs'))).default, '/api/access': (await import(resolve('netlify/functions/access.mjs'))).default };
const checks = [], shots = [], aborted = [], pageErrors = [];
const check = (card, name, pass, detail) => checks.push({ card, name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import(pw);
const browser = await chromium.launch({ headless: true, ...(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE } : {}) });
let serial = 0;
async function fixture(width, channels, configure) {
  const slug = 'p3-desk-' + ++serial, token = sha(slug), c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Air', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm' } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: channels }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  if (configure) configure(c);
  await store.put('clients', slug, c); await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' }); ctx.setDefaultTimeout(8000);
  await ctx.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
  await ctx.routeWebSocket('**/*', s => s.close());
  await ctx.route('**/*', async route => {
    const r = route.request(), url = new URL(r.url());
    if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); aborted.push(url.origin); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = r.method(), body = method === 'GET' ? null : r.postData();
      if (!handlers[url.pathname]) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_in_check"}' });
      const res = await handlers[url.pathname](new Request(url, { method, headers: r.headers(), ...(body ? { body } : {}) }), { ip: '192.0.2.78' });
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  const page = await ctx.newPage(); page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(origin + '/desk.html?c=' + slug); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  return { ctx, page, c };
}
const shot = async (page, name, locator) => { const p = `${out}/${label}-${name}.png`; if (locator) await locator.screenshot({ path: p }); else await page.screenshot({ path: p }); shots.push(p); };
const route = (page, tab) => page.evaluate(tab => document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab } })), tab);
const all4 = ['web', 'voice', 'sms', 'calendar'];
try {
  for (const width of [390, 1440]) {
    // PRA-FC-11: paused workspace, only website chat was running.
    {
      const x = await fixture(width, all4, c => { c.status = 'paused'; c.pausedFrom = 'live'; c.pausedAt = new Date().toISOString(); c.pausedChannels = { web: { active: true }, voice: { active: false }, sms: { active: false } }; c.channels = { web: { active: false }, voice: { active: false }, sms: { active: false } }; });
      await x.page.locator('#tabAccount').click(); await x.page.locator('body[data-active-page="account"]').waitFor();
      const rows = await x.page.locator('#accountConnectionSummary > div').evaluateAll(n => n.map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
      const map = Object.fromEntries(rows);
      const web = Object.entries(map).find(([k]) => /website/i.test(k))?.[1], others = Object.entries(map).filter(([k]) => !/website/i.test(k)).map(([, v]) => v);
      check('PRA-FC-11', `${width}: running service shows Paused, never-set-up services do not`, web === 'Paused' && others.length === 3 && others.every(v => v !== 'Paused'), map);
      check('PRA-FC-11', `${width}: gated services keep Setup with our team`, others.every(v => v === 'Setup with our team'), map);
      await x.page.locator('#accountConnectionSummary').scrollIntoViewIfNeeded(); await shot(x.page, `fc11-paused-account-${width}`);
      await x.ctx.close();
    }
    // PRA-FC-08: website card Calendar button when Calendar is team-setup only.
    {
      const x = await fixture(width, ['web', 'calendar']);
      await route(x.page, 'setup'); await x.page.waitForTimeout(300);
      await x.page.locator('summary', { hasText: 'Website chat settings' }).first().click(); await x.page.waitForTimeout(300);
      const note = x.page.locator('#websiteCalendarNote');
      const visible = await note.isVisible().catch(() => false);
      const text = await x.page.locator('#websiteCalendarConnect').textContent();
      check('PRA-FC-08', `${width}: gated Calendar button says Ask about Google Calendar`, text === 'Ask about Google Calendar', { visible, text });
      if (visible) { await note.scrollIntoViewIfNeeded(); await shot(x.page, `fc08-calendar-note-${width}`); }
      else { await x.page.locator('#websiteInstallStep').scrollIntoViewIfNeeded().catch(() => {}); await shot(x.page, `fc08-setup-${width}`); }
      if (visible) {
        await x.page.locator('#websiteCalendarConnect').click(); await x.page.waitForTimeout(300);
        const body = await x.page.locator('body').innerText();
        check('PRA-FC-08', `${width}: the page it opens matches (not live yet, request review offered)`, /not live yet/.test(body), body.match(/Google Calendar is set up with our team[^\n]*/)?.[0]);
      }
      await x.ctx.close();
    }
    // PRA-FC-07: website guide dropdown errors.
    {
      const x = await fixture(width, ['web'], c => { const r = configurationRevision(c); c.setupProof = { reviewedRevision: r, testedRevision: r, testMode: 'live' }; });
      await x.page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:service-guide', { detail: { service: 'web' } }))); await x.page.waitForTimeout(400);
      let builder = x.page.locator('#intake-builder');
      if (!await builder.isVisible().catch(() => false)) {
        const start = x.page.getByRole('button', { name: /Continue setup|Start setup|Set up website chat|Begin/i }).first();
        if (await start.isVisible().catch(() => false)) { await start.click(); await x.page.waitForTimeout(400); }
      }
      builder = x.page.locator('#intake-builder');
      const found = await builder.isVisible().catch(() => false);
      if (found) {
        const website = x.page.locator('#intake-website'); if (await website.isVisible()) await website.fill('https://fixture-air.example');
        const submit = x.page.locator('#intake-builder').locator('xpath=ancestor::form').locator('button[type=submit]').first();
        await submit.click(); await x.page.waitForTimeout(250);
        const a = await x.page.locator('#intake-builder-error').textContent(), b = await x.page.locator('#intake-installationBy-error').textContent();
        check('PRA-FC-07', `${width}: dropdown errors read Choose`, a === 'Choose your website builder.' && b === 'Choose who manages your website.', { builder: a, installationBy: b });
        await builder.scrollIntoViewIfNeeded(); await shot(x.page, `fc07-select-errors-${width}`);
      } else { check('PRA-FC-07', `${width}: website guide form reached`, false, (await x.page.locator('body').innerText()).slice(0, 600)); await shot(x.page, `fc07-unreached-${width}`); }
      await x.ctx.close();
    }
  }
} catch (e) { check('harness', 'run completed', false, String(e && e.stack || e).slice(0, 800)); }
finally { await browser.close(); }
check('harness', 'no page errors', pageErrors.length === 0, pageErrors);
check('harness', 'no server-side fetch; every non-local browser request was aborted or stubbed', blockedServer.length === 0, { aborted: [...new Set(aborted)], blockedServer });
const failed = checks.filter(c => !c.pass);
writeFileSync(`${out}/${label}.json`, JSON.stringify({ label, at: new Date().toISOString(), passed: checks.length - failed.length, total: checks.length, checks, screenshots: shots }, null, 1));
for (const c of checks) console.log((c.pass ? 'PASS ' : 'FAIL ') + c.card + ' ' + c.name + (c.pass ? '' : ' ' + JSON.stringify(c.detail || '').slice(0, 500)));
console.log(`RESULT ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
