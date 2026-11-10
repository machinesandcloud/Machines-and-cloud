// Copy of /tmp/mc-claude-coverage-map-20261110/qa-artifacts/claude-collaboration/sms-registration-checks/sms-harness.mjs
// for sms-correction-followup. Changes from that copy:
// - receipts are named scratchpad/claude-smsfix-<name>.json;
// - the comparison base is 161cf80e (connection-errors handoff). Only desk-connections.js (the file this follow-up edits)
//   may differ from it; every other served .js/.css/.html must equal 161cf80e, and the served desk-connections.js sha256
//   is recorded and must equal the worktree bytes. With --serve-rev every served file must equal that commit.
// - probe mode --serve-file <rel>=<absolute path> serves that one browser file from disk (e.g. an earlier uncommitted
//   revision of desk-connections.js) and records its sha256 in report.serveFile; the worktree-bytes check then skips it.
// Original notes, from blind-harness-2.mjs:
// - the default browser is the bundled chrome-headless-shell (MC_PLAYWRIGHT_EXECUTABLE overrides it);
// - after the provider environment is scrubbed, a SYNTHETIC, non-secret gate configuration is installed (copied from
//   scripts/service-onboarding-qa-check.mjs:101-116) so that the real number, voice and texting offers are "open".
//   That is the only way the combined review and the correction form are reachable at all
//   (service-onboarding.mjs:74-76, messaging-activation.mjs:296-301). Every provider transport stays denied:
//   globalThis.fetch answers only same-origin /.netlify/functions/* background dispatches (202, not executed) and
//   counts anything else as physicalNetwork;
// - the actual /api/client, /api/access and /api/workspace-billing handlers run in-process from Playwright's context.route;
// - every served .js/.css/.html sha256 is pinned and compared with `git show 161cf80e:<file>`.
// Lost responses are simulated with route.abort AFTER the actual handler ran (the server committed).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

export const BASE = '161cf80e';
export const ALLOWED_CHANGED = ['desk-connections.js'];
export const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
export const sha = value => createHash('sha256').update(value).digest('hex');
const DEFAULT_BROWSER = '/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const DEFAULT_PLAYWRIGHT = '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

// Synthetic offers. Values are invented; none is a credential for any real account.
export const ACCOUNT_SID = 'AC' + 'a'.repeat(32), PRIMARY_SID = 'BU' + 'b'.repeat(32);
export function syntheticPolicies(now = Date.now()) {
  return {
    number: { version: 'qa_number_v1', scope: 'number_acquisition_only', country: 'US', areaCode: '713', currency: 'USD', oneTimeCents: 0, monthlyCents: 115, maxAcquisitionCents: 115, expiresAt: new Date(now + 10 * 86400000).toISOString(), authorityText: 'I am authorized to reserve this business number and accept the disclosed recurring cost until release is confirmed.' },
    voice: { version: 'qa_voice_v1', model: 'claude-sonnet-4-5', maxDurationSeconds: 300, maxDailyCalls: 3, maxDailyMinutes: 15, accountDailyCalls: 30, accountDailyMinutes: 150, authorityText: 'I am authorized to connect answering for this business and approve the reviewed routing and usage.', usageDisclosure: 'Synthetic QA phone usage terms. No real call or provider charge is authorized.' },
    sms: { version: 'qa_sms_v1', scope: 'a2p_customer_care', country: 'US', currency: 'USD', brandRegistrationCents: 4400, campaignRegistrationCents: 1500, campaignMonthlyCents: 1000, resubmissionCents: 1500, maxResubmissions: 1, usageDisclosure: 'Synthetic QA texting usage terms. No real message, filing or charge is authorized.', authorityText: 'I am authorized to register the reviewed business texting program and accept the disclosed registration costs.', feeScheduleUrl: 'https://fees.example.test/qa', expiresAt: new Date(now + 10 * 86400000).toISOString() },
  };
}
function installSyntheticGates() {
  const p = syntheticPolicies();
  process.env.MANAGED_RESOURCE_ADMISSION_APPROVED_VERSION = 'qa_resource_v1';
  process.env.MANAGED_RESOURCE_ADMISSION_POLICY_JSON = JSON.stringify({ version: 'qa_resource_v1', expiresAt: new Date(Date.now() + 10 * 86400000).toISOString(), mode: 'self_service', providerAccountHash: sha(ACCOUNT_SID), currency: 'USD', rateBasis: 'configured_upper_bound', rateSource: 'https://fees.example.test/synthetic-qa-resource-bounds', bounds: { numberSetupCents: 0, numberMonthlyCents: 115, brandSetupCents: 4400, campaignSetupCents: 1500, campaignMonthlyCents: 1000 }, accountLimits: { numbers: 100, brands: 100, campaigns: 100, setupCents: 1000000, monthlyCents: 1000000 }, tenantLimits: { numbers: 1, brands: 1, campaigns: 1, setupCents: 5900, monthlyCents: 1115 }, tenants: [] });
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: ACCOUNT_SID, TWILIO_AUTH_TOKEN: 'qa-synthetic-twilio-token', TWILIO_PRIMARY_PROFILE_SID: PRIMARY_SID, VAPI_API_KEY: 'qa-synthetic-vapi-key', VAPI_WEBHOOK_SECRET: 'q'.repeat(48), SERVICE_WORKER_KEY: 'w'.repeat(48), PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'), PHONE_ACTIVATION_OFFER_JSON: JSON.stringify(p.number), PHONE_ACTIVATION_APPROVED_VERSION: p.number.version, VOICE_ACTIVATION_POLICY_JSON: JSON.stringify(p.voice), VOICE_ACTIVATION_APPROVED_VERSION: p.voice.version, MESSAGING_ACTIVATION_OFFER_JSON: JSON.stringify(p.sms), MESSAGING_ACTIVATION_APPROVED_VERSION: p.sms.version, VOICE_FALLBACK_TWIML_URL: 'https://handler.twilio.com/twiml/EH' + 'e'.repeat(32) });
  for (const name of ['PHONE_ACQUISITION_ENABLED', 'VOICE_ACTIVATION_ENABLED', 'MESSAGING_ACTIVATION_ENABLED', 'SERVICE_DELIVERY_ENABLED']) process.env[name] = 'true';
  return p;
}

export async function harness({ name, watched, qualifications }) {
  const output = option('--output'), playwrightPath = option('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || DEFAULT_PLAYWRIGHT;
  const executablePath = process.env.MC_PLAYWRIGHT_EXECUTABLE || DEFAULT_BROWSER, serveRev = option('--serve-rev');
  if (serveRev && !/^[a-f0-9]{7,40}$/.test(serveRev)) throw new Error('--serve-rev takes a commit id');
  const serveFileArg = option('--serve-file'), serveFile = serveFileArg ? { rel: serveFileArg.split('=')[0], path: serveFileArg.split('=').slice(1).join('=') } : null;
  if (serveFile && (!ALLOWED_CHANGED.includes(serveFile.rel) || !serveFile.path.startsWith('/') || !existsSync(serveFile.path))) throw new Error('--serve-file takes desk-connections.js=<absolute path>');
  if (output && (!/^scratchpad\/claude-smsfix-[a-z0-9-]+\.json$/.test(output) || existsSync(output))) throw new Error('Choose a new --output scratchpad/claude-smsfix-<name>.json');
  if (!existsSync(playwrightPath) || !existsSync(executablePath)) throw new Error('Installed Playwright and chrome-headless-shell are required. This check never installs tooling.');
  const root = resolve('.'), origin = 'http://127.0.0.1:8921';
  if (!existsSync(resolve(root, 'desk.js'))) throw new Error('Run from the worktree root.');
  const lib = path => pathToFileURL(resolve(root, path)).href;
  const files = [...watched, 'qa-artifacts/claude-collaboration/sms-correction-followup/sms-harness.mjs'];
  const hashes = () => Object.fromEntries(files.map(file => [file, sha(readFileSync(resolve(root, file)))]));
  let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
  const report = { check: name, at: new Date().toISOString(), head, base: BASE, serveRev, serveFile: serveFile ? { ...serveFile, sha256: sha(readFileSync(serveFile.path)) } : null, browser: executablePath, qualifications, sourceBefore: hashes(), served: {}, servedVsBase: {}, checks: [], observations: [], requests: [], pageErrors: [], forbidden: [], physicalNetwork: 0, physicalAttempts: [] };
  for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|MC_PLATFORM_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_|WORKSPACE_BILLING_|ADMIN_|MANAGED_|PLATFORM_)/.test(key)) delete process.env[key];
  Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: origin, PUBLIC_SITE_URL: origin });
  const policies = installSyntheticGates();
  const deny = () => { report.physicalNetwork++; throw new Error(name + ' forbids physical transport'); };
  net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
  globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === origin && url.pathname.startsWith('/.netlify/functions/')) { (report.backgroundRequests ||= []).push({ path: url.pathname, method: init.method || 'GET' }); return new Response(null, { status: 202 }); } report.physicalAttempts.push(url.origin + url.pathname); return deny(); };
  const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
  const store = await import(lib('netlify/functions/lib/store.mjs'));
  const { accessHash } = await import(lib('netlify/functions/lib/access.mjs'));
  const config = await import(lib('netlify/functions/lib/config.mjs'));
  const setup = await import(lib('netlify/functions/lib/setup.mjs'));
  const { workspaceTenant } = await import(lib('netlify/functions/lib/workspace-identity.mjs'));
  const handlers = { '/api/client': (await import(lib('netlify/functions/client.mjs'))).default, '/api/access': (await import(lib('netlify/functions/access.mjs'))).default, '/api/workspace-billing': (await import(lib('netlify/functions/workspace-billing.mjs'))).default };
  const browser = await playwright.chromium.launch({ executablePath, headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const contexts = []; let serial = 0;
  const baseCache = new Map();
  const baseSha = rel => { if (!baseCache.has(rel)) { try { baseCache.set(rel, sha(execFileSync('git', ['show', BASE + ':' + rel], { cwd: root, maxBuffer: 64 << 20 }))); } catch { baseCache.set(rel, null); } } return baseCache.get(rel); };

  // A reviewed and practised self-service workspace that selected phone answering and texting.
  async function fixture({ width = 1440, height, hash = '#setup', configure } = {}) {
    const slug = name + '-' + ++serial, token = sha(slug);
    const c = config.newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + slug, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Plumbing', trade: 'Plumbing', city: 'Houston', website: 'https://shop.example.com', serviceArea: ['Houston'], hours: 'Mon-Fri 8am-5pm' } });
    Object.assign(c, { services: ['Drain cleaning'], fees: [{ label: 'Drain cleaning', amount: '$149', note: '' }], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } }); c.rules.hours = config.parseHours('Mon-Fri 8am-5pm');
    c.onboarding = { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['voice', 'sms'], phoneSetupMode: 'use_new_number' };
    if (configure) await configure(c);
    const revision = setup.configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: 'live' };
    await store.put('clients', slug, c);
    await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
    const context = await browser.newContext({ viewport: { width, height: height || (width < 600 ? 844 : 900) }, serviceWorkers: 'block', reducedMotion: 'reduce' }); contexts.push(context); context.setDefaultTimeout(10000);
    await context.addInitScript(({ origin, slug, token }) => { if (location.origin !== origin) return; sessionStorage.setItem('mc-onboarding-session-v1', token); localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); }, { origin, slug, token });
    // fault: { match(item, body) -> bool, kind: 'lost' | 'abort-before' | <status> | 'hold', until?, body? }; consumed once.
    const state = { requests: [], faults: [] };
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
      if (url.pathname.startsWith('/api/')) {
        const method = request.method(); let body = null; if (method !== 'GET') { try { body = request.postDataJSON(); } catch { body = request.postData(); } }
        const action = body?.action;
        if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(action)) { report.forbidden.push({ path: url.pathname, action }); return route.fulfill({ status: 403, body: '{}' }); }
        const item = { slug, path: url.pathname, query: url.search, method, action, at: Date.now() }; state.requests.push(item); report.requests.push(item);
        if (body && typeof body === 'object') item.body = body;
        const index = state.faults.findIndex(f => f.match(item, body)); const fault = index >= 0 ? state.faults.splice(index, 1)[0] : null;
        if (fault?.kind === 'abort-before') { item.fixture = 'aborted-before-handler'; item.status = 'aborted'; return route.abort('failed'); }
        if (typeof fault?.kind === 'number') { item.fixture = 'status-' + fault.kind; item.status = fault.kind; return route.fulfill({ status: fault.kind, contentType: 'application/json', body: JSON.stringify(fault.body || { error: 'synthetic_failure', message: 'Synthetic failure.' }) }); }
        const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), { ip: '192.0.2.81' });
        item.status = response.status; const buffer = Buffer.from(await response.arrayBuffer());
        try { const parsed = JSON.parse(buffer.toString()); if (method !== 'GET' || parsed?.ok === false || parsed?.error) item.response = { error: parsed.error, message: parsed.message, fieldErrors: parsed.fieldErrors }; } catch {}
        if (fault?.kind === 'hold') { item.fixture = 'held'; await fault.until; }
        if (fault?.kind === 'lost') { item.fixture = 'lost-after-handler'; item.lostAfterEffect = true; return route.abort('failed'); }
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buffer });
      }
      const rel = decodeURIComponent(url.pathname).replace(/^\//, ''), path = resolve(root, rel);
      if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
      // Probe mode only (--serve-rev <commit>): serve the browser files of another commit to see what a queued branch changes.
      // The handlers stay the worktree's; the receipt then reports servedAllBase:false and the final check fails by design.
      let bytes = readFileSync(path); const type = extname(path);
      if (serveFile && rel === serveFile.rel) bytes = readFileSync(serveFile.path);
      else if (serveRev && ['.js', '.css', '.html'].includes(type)) { try { bytes = execFileSync('git', ['show', serveRev + ':' + rel], { cwd: root, maxBuffer: 64 << 20 }); } catch {} }
      if (['.js', '.css', '.html'].includes(type)) { const digest = sha(bytes); if (report.served[rel] && report.served[rel] !== digest) report.served[rel] = 'CHANGED-DURING-RUN'; else report.served[rel] = digest; report.servedVsBase[rel] = digest === baseSha(rel); }
      return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' })[type] || 'application/octet-stream', body: bytes });
    });
    const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
    await page.goto(origin + '/desk.html?c=' + slug + hash);
    await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
    return { page, c, slug, state, context, width, token, tenantIdentity: workspaceTenant(c) };
  }
  async function shot(page, label) { if (!output) return; const path = output.replace(/\.json$/, '-' + label + '.png'); await page.screenshot({ path }); (report.screenshots ||= []).push(path); }
  // expectedChange: a branch whose integration is expected to change what this check asserts.
  async function check(label, run, { expectedChange = null } = {}) {
    const start = contexts.length;
    try { await run(); report.checks.push({ name: label, pass: true, expectedChange }); console.log('PASS ' + label); }
    catch (error) { report.checks.push({ name: label, pass: false, expectedChange, error: error.stack }); const page = contexts.at(-1)?.pages().at(-1); if (page) await shot(page, 'failure-' + report.checks.length).catch(() => {}); console.log('FAIL ' + label + ': ' + (process.env.SMSREG_VERBOSE ? error.stack : error.message.split('\n')[0])); }
    finally { await Promise.all(contexts.slice(start).map(context => context.close())); }
  }
  async function noHorizontalScroll(page) { const v = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth })); assert.ok(v.document <= v.viewport + 1, 'Horizontal scroll ' + JSON.stringify(v)); }
  const until = async (fn, label, ms = 8000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await fn(); if (last) return last; await new Promise(r => setTimeout(r, 50)); } throw new Error('Timed out waiting for ' + label); };
  // Keyboard-only navigation: press Tab (or Shift+Tab) until the focused element matches, never clicking.
  async function tabTo(page, selector, { max = 250, back = false } = {}) {
    for (let n = 0; n < max; n++) {
      if (await page.evaluate(sel => { const a = document.activeElement; return !!a && a !== document.body && a.matches(sel); }, selector)) return;
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    }
    throw new Error('Keyboard focus never reached ' + selector + ' (active: ' + await page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + '#' + a.id + '[' + (a.getAttribute('name') || a.dataset.connection || '') + ']' : 'none'; }) + ')');
  }
  const active = page => page.evaluate(() => { const a = document.activeElement; return a ? { tag: a.tagName, id: a.id, name: a.getAttribute('name'), connection: a.dataset.connection || null, invalid: a.getAttribute('aria-invalid'), describedBy: a.getAttribute('aria-describedby'), text: (a.textContent || '').trim().slice(0, 80) } : null; });
  async function finish() {
    await check('No physical transport, forbidden destinations or page errors; served bytes are the worktree bytes; only desk-connections.js differs from 161cf80e', async () => {
      assert.equal(report.physicalNetwork, 0, JSON.stringify(report.physicalAttempts)); assert.deepEqual(report.forbidden, []); assert.deepEqual(report.pageErrors, []);
      if (!serveRev) for (const [rel, digest] of Object.entries(report.served)) assert.equal(digest, serveFile && rel === serveFile.rel ? report.serveFile.sha256 : sha(readFileSync(resolve(root, rel))), 'served ' + rel);
      for (const [rel, same] of Object.entries(report.servedVsBase)) if (serveRev || !ALLOWED_CHANGED.includes(rel)) assert.equal(same, true, rel + ' differs from ' + (serveRev || BASE));
      assert.ok(report.served['desk-connections.js'], 'desk-connections.js was served');
    });
    await browser.close(); report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
    report.servedAllBase = Object.values(report.servedVsBase).every(Boolean);
    report.servedChangedFromBase = Object.entries(report.servedVsBase).filter(([, same]) => !same).map(([rel]) => ({ file: rel, sha256: report.served[rel] }));
    report.summary = { passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length, total: report.checks.length, physicalNetwork: report.physicalNetwork, pageErrors: report.pageErrors.length, servedAllBase: report.servedAllBase, servedChangedFromBase: report.servedChangedFromBase };
    if (output) writeFileSync(resolve(root, output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, ...report.summary, sourceStable: report.sourceStable, failures: report.checks.filter(c => !c.pass).map(c => ({ name: c.name, error: c.error.split('\n')[0] })) }));
    if (report.summary.failed || !report.sourceStable) process.exitCode = 1;
  }
  return { report, store, config, setup, accessHash, workspaceTenant, fixture, check, shot, noHorizontalScroll, until, tabTo, active, finish, output, root, origin, policies, lib };
}
