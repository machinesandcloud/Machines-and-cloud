// Owner walk-through of Website chat setup -> install step for every builder the intake offers
// (WordPress, Wix, Squarespace, Webflow, Shopify, another builder) and both installers ("I do", "My web person").
// Actual owner handlers in-process via Playwright context.route (pattern of connector-pages-ui-check.mjs), memory
// store, fake model, provider env deleted, physical transport denied, non-loopback browser requests aborted.
// The configured site deliberately differs from production (ORIGIN below) so the WordPress ZIP must carry it.
// The downloaded ZIP is intercepted and parsed in memory (stored member, CRC checked).
// Never asserts that chat is installed or connected; only the existing server check can confirm that.
// Usage (worktree root):
//   node qa-artifacts/claude-collaboration/website-install/website-install-ui-check.mjs \
//     --output scratchpad/claude-install-<name>.json [--executable <chrome-headless-shell>] [--only <substring>]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import zlib from 'node:zlib';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..'), ORIGIN = 'http://127.0.0.1:8947';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output'), only = arg('--only'), executable = arg('--executable') || process.env.MC_PLAYWRIGHT_EXECUTABLE;
const playwrightPath = arg('--playwright') || process.env.MC_PLAYWRIGHT_MODULE || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
if (!output || !/^scratchpad\/claude-install-[\w-]+\.json$/.test(output)) throw new Error('Choose --output scratchpad/claude-install-<name>.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained evidence: ' + output);
mkdirSync('scratchpad', { recursive: true });
const prefix = output.slice(0, -5), started = Date.now(), sha = v => createHash('sha256').update(v).digest('hex');
const watched = ['desk.html', 'desk.js', 'desk-service-intake.js', 'desk-service-intake.css', 'desk-website-install.js', 'desk-manual-guide.js', 'desk-setup-guide.js', 'desk-connections.js', 'embed.js', 'netlify/functions/client.mjs', 'netlify/functions/lib/service-intake.mjs', 'qa-artifacts/claude-collaboration/website-install/website-install-ui-check.mjs'];
const hashes = () => Object.fromEntries(watched.map(f => [f, sha(readFileSync(f))]));
const report = { at: new Date().toISOString(), mode: 'Actual owner handlers in-process, memory store, fake model, Playwright-served worktree files; provider env deleted; physical transport denied', configuredOrigin: ORIGIN, sourceBefore: hashes(), served: {}, checks: [], observations: [], screenshots: [], pageErrors: [], forbidden: [], physicalNetwork: 0 };

for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_|PHONE_|VOICE_|MESSAGING_|CALENDAR_|SERVICE_|STEVE_|MC_SELF_SERVICE_AI_|NETLIFY_|THUMBTACK_|ANGI_|OPENAI_|PUBLIC_SITE_URL|URL$)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: '1', MC_FAKE_MODEL: '1', NODE_ENV: 'test', URL: ORIGIN, PUBLIC_SITE_URL: ORIGIN, PLATFORM_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') }); // synthetic at-rest key, as connector-pages-ui-check
const deny = () => { report.physicalNetwork++; throw new Error('Website install check forbids physical transport'); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.origin === ORIGIN && url.pathname.startsWith('/.netlify/functions/')) return new Response(null, { status: 202 }); return deny(); };

const playwright = await import(pathToFileURL(resolve(playwrightPath)).href);
const store = await import('../../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../../netlify/functions/lib/access.mjs');
const { newClient, parseHours } = await import('../../../netlify/functions/lib/config.mjs');
const { configurationRevision } = await import('../../../netlify/functions/lib/setup.mjs');
const handlers = {};
for (const file of ['client', 'access', 'onboard', 'workspace-billing', 'angi', 'thumbtack', 'thumbtack-self-serve', 'thumbtack-connect', 'google', 'chat', 'website-installation']) {
  const mod = await import('../../../netlify/functions/' + file + '.mjs');
  for (const path of [].concat(mod.config?.path || [])) handlers[path] = mod.default;
}
const browser = await playwright.chromium.launch({ ...(executable ? { executablePath: executable } : { channel: 'chrome' }), headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--host-resolver-rules=MAP * ~NOTFOUND'] });
report.browser = executable || 'channel:chrome ' + browser.version();
const SITE = 'https://fixture-shop.example.com';
let serial = 0; const contexts = [];

async function seed(width) {
  const slug = 'install-ui-' + ++serial + '-' + width, token = sha('install-token-' + slug);
  const c = newClient({ slug, ownerKey: 'PRIVATE-FIXTURE-' + serial, owner: { name: 'Alex Fixture', email: slug + '@example.test', phone: '+17135550198' }, business: { name: 'Fixture Install Shop', trade: 'HVAC', serviceArea: ['Katy'], hours: 'Mon-Fri 8am-5pm', website: SITE } });
  Object.assign(c, { onboarding: { version: 1, verifiedEmail: c.owner.email, desiredChannels: ['web'] }, services: ['AC repair'], windows: ['8 to 12', '12 to 5'], status: 'testing', build: { status: 'built', source: 'owner_answers' } });
  c.rules.hours = parseHours('Mon-Fri 8am-5pm');
  const revision = configurationRevision(c); c.setupProof = { reviewedRevision: revision, testedRevision: revision, testMode: 'live' };
  await store.put('clients', slug, c);
  await store.put('access_sessions', accessHash(token), { scope: 'onboarding', status: 'active', email: c.owner.email, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { slug, token, width };
}
async function open(x, { clipboard = 'grant', downloads = true, init, stripSite = false } = {}) {
  const { slug, token, width } = x;
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, serviceWorkers: 'block', reducedMotion: 'reduce', acceptDownloads: downloads }); contexts.push(context); context.setDefaultTimeout(7000);
  if (clipboard === 'grant') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  await context.addInitScript(({ origin, slug, token, blocked }) => {
    if (location.origin !== origin) return;
    if (!sessionStorage.getItem('mc-onboarding-session-v1')) sessionStorage.setItem('mc-onboarding-session-v1', token);
    localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen');
    window.__copied = [];
    if (blocked) Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')) } });
    else if (navigator.clipboard) { const write = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = text => { window.__copied.push(text); return write(text); }; }
  }, { origin: ORIGIN, slug, token, blocked: clipboard === 'blocked' });
  if (init) await context.addInitScript(init);
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== ORIGIN) { if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' }); report.forbidden.push({ origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      const method = request.method(); let body = null; try { body = method === 'GET' ? null : request.postDataJSON(); } catch { body = null; }
      if (!handlers[url.pathname] || ['request_link', 'exchange'].includes(body?.action)) { report.forbidden.push({ path: url.pathname, action: body?.action }); return route.fulfill({ status: 403, body: '{}' }); }
      const response = await handlers[url.pathname](new Request(url, { method, headers: request.headers(), ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: '192.0.2.71' });
      let bytes = Buffer.from(await response.arrayBuffer());
      // Fixture for a response without the configured site (desk.js then renders "undefined/embed.js").
      if (stripSite && url.pathname === '/api/client' && method === 'GET') { try { const json = JSON.parse(bytes); if ('site' in json) { delete json.site; bytes = Buffer.from(JSON.stringify(json)); } } catch {} }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const path = resolve(root, decodeURIComponent(url.pathname).replace(/^\//, ''));
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: '' });
    const bytes = readFileSync(path); report.served[url.pathname.slice(1)] = sha(bytes);
    return route.fulfill({ contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' })[extname(path)] || 'application/octet-stream', body: bytes });
  });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push({ slug, message: error.message }));
  await page.goto(ORIGIN + '/desk.html?c=' + slug + '#setup'); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready');
  Object.assign(x, { page, context });
  return x;
}
async function check(name, run) {
  if (only && !name.includes(only)) return;
  const start = contexts.length, t0 = Date.now();
  try { await run(); report.checks.push({ name, pass: true, ms: Date.now() - t0 }); console.log('PASS ' + name); }
  catch (error) {
    const entry = { name, pass: false, ms: Date.now() - t0, error: String(error.stack || error).slice(0, 1800) }; report.checks.push(entry); console.log('FAIL ' + name + ': ' + String(error.message).split('\n')[0]);
    const page = contexts.at(-1)?.pages().at(-1);
    if (page) entry.state = await page.evaluate(() => ({ hash: location.hash, focus: document.activeElement?.id || document.activeElement?.tagName, text: document.getElementById('setupGuide')?.innerText.slice(0, 1200) })).catch(() => null);
  } finally { await Promise.all(contexts.slice(start).map(c => c.close().catch(() => {}))); }
}
async function shot(page, name) { const path = prefix + '-' + name + '.png'; await page.screenshot({ path }); report.screenshots.push(path); }
async function noHorizontalScroll(page, where) {
  const v = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, wide: [...document.querySelectorAll('#setupGuide *')].filter(n => n.getClientRects().length && n.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(n => n.tagName + '#' + n.id + '.' + n.className) }));
  assert.ok(v.doc <= v.vw + 1 && !v.wide.length, 'Horizontal overflow at ' + where + ': ' + JSON.stringify(v));
}
const BUILDERS = { wordpress: 'WordPress', wix: 'Wix', squarespace: 'Squarespace', webflow: 'Webflow', shopify: 'Shopify', other: 'Another website builder' };
const INSTALLERS = { me: 'I do', web_person: 'My web person or agency' };
const CLAIM = /\b(is|now|been|successfully) (installed|connected|live)\b|\bchat (is )?(installed|connected)\b|\bverified\b/i;
async function toInstall(x, builder, installer, beforeSave) {
  const { page } = x;
  await page.locator('[data-guide-service="web"]').click();
  await page.waitForFunction(() => document.getElementById('setupGuide')?.dataset.connectorView === 'step');
  await page.locator('#connectorStart').click();
  await page.locator('#intake-builder').waitFor();
  await page.selectOption('#intake-builder', { label: BUILDERS[builder] }); await page.selectOption('#intake-installationBy', { label: INSTALLERS[installer] });
  if (beforeSave) await page.evaluate(beforeSave);
  await page.locator('#intakeContinue').click();
  await page.waitForFunction(() => location.hash === '#setup/web/details-1-0');
  await page.locator('[data-install-stage="0"]').waitFor();
}
const expectedSnippet = slug => '<script src="' + ORIGIN + '/embed.js" data-client="' + slug + '" async></script>';
const stageState = page => page.evaluate(() => {
  const n = document.querySelector('[data-install-stage]'), vis = e => !!e && e.getClientRects().length > 0;
  const pre = n?.querySelector('pre'), copy = document.getElementById('intakeCopy');
  return { stage: Number(n?.dataset.installStage), title: n?.querySelector('#intakeStepTitle')?.textContent, text: n?.innerText || '', instruction: n?.querySelector(':scope > p')?.textContent || '', code: vis(pre) ? pre.textContent : null, codeFocusable: !!pre && pre.tabIndex >= 0, copyLabel: vis(copy) ? copy.textContent : null, download: !!n?.querySelector('[data-wordpress-download]'), focus: document.activeElement?.id || document.activeElement?.tagName, continueLabel: document.getElementById('intakeContinue')?.textContent };
});
function unzip(buffer) {
  const b = Buffer.from(buffer); assert.equal(b.readUInt32LE(0), 0x04034b50, 'Local file header');
  const method = b.readUInt16LE(8), crc = b.readUInt32LE(14), size = b.readUInt32LE(18), nameLength = b.readUInt16LE(26), extra = b.readUInt16LE(28);
  const name = b.subarray(30, 30 + nameLength).toString('utf8'), body = b.subarray(30 + nameLength + extra, 30 + nameLength + extra + size);
  assert.equal(method, 0, 'Stored member'); assert.equal(zlib.crc32(body) >>> 0, crc, 'CRC matches');
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); assert.ok(end > 0, 'End of central directory'); assert.equal(b.readUInt16LE(end + 10), 1, 'One entry');
  return { name, text: body.toString('utf8') };
}

const WIDTHS = [1440, 390];
for (const width of WIDTHS) {
  for (const builder of Object.keys(BUILDERS)) for (const installer of Object.keys(INSTALLERS)) {
    await check(`${builder} / ${installer}: keyboard walk through every install stage (${width})`, async () => {
      const x = await open(await seed(width)); const { page } = x;
      await toInstall(x, builder, installer);
      const last = builder === 'wordpress' ? 4 : 3, stages = [], problems = [], soft = (ok, message) => { if (!ok) problems.push(message); };
      for (let stage = 0; stage <= last; stage++) {
        await page.waitForFunction(s => document.querySelector('[data-install-stage]')?.dataset.installStage === String(s), stage);
        const s = await stageState(page); stages.push(s);
        if (stage > 0) soft(s.focus === 'intakeStepTitle', 'Focus moves to the new stage heading at stage ' + stage + ': ' + s.focus);
        soft(!CLAIM.test(s.text), 'No installed/connected claim at stage ' + stage);
        // A stage that tells the owner to paste/add "the installation code below" must show that code.
        if (/(installation )?code below/i.test(s.text)) {
          soft(s.code === expectedSnippet(x.slug), `Stage ${stage} says "code below" but shows: ${s.code}`);
        }
        if (s.code !== null) { soft(s.code === expectedSnippet(x.slug), 'Configured snippet shown at stage ' + stage); soft(s.codeFocusable, 'Installation code can be reached by keyboard at stage ' + stage); }
        if (s.copyLabel) soft(s.copyLabel === (installer === 'web_person' ? 'Copy instructions for my web person' : 'Copy installation code'), 'Copy label says what is copied: ' + s.copyLabel);
        if (width === 390) await noHorizontalScroll(page, `${builder} ${installer} stage ${stage}`).catch(e => problems.push(e.message));
        if (stage < last) { await page.locator('#intakeContinue').focus(); await page.keyboard.press('Enter'); }
      }
      // Squarespace: the stage sequence must include opening Code Injection.
      if (builder === 'squarespace') soft(stages.some(s => /Code Injection/.test(s.instruction) && /open/i.test(s.instruction)), 'Squarespace stages include opening Code Injection: ' + stages.map(s => s.instruction).join(' | '));
      if (builder !== 'wordpress') soft(stages.some(s => s.code !== null), 'Snippet builders show the code at one stage');
      if (installer === 'web_person') soft(stages.some(s => s.copyLabel), 'Web-person installs offer a copy of the instructions at some stage');
      assert.equal(stages.at(-1).continueLabel, 'Check published website');
      report.observations.push({ builder, installer, width, stages: stages.map(s => ({ stage: s.stage, title: s.title, instruction: s.instruction, code: s.code !== null, copy: s.copyLabel, download: s.download })) });
      if (width === 390 && installer === 'me' && ['wordpress', 'webflow'].includes(builder)) await shot(page, `${builder}-final-${width}`);
      assert.deepEqual(problems, [], problems.join(' || '));
    });
  }

  await check(`copy installation code writes the configured snippet; blocked clipboard leaves a keyboard-selectable code (${width})`, async () => {
    let x = await open(await seed(width)); let { page } = x;
    await toInstall(x, 'wix', 'me'); await page.locator('#intakeContinue').click(); await page.locator('[data-install-stage="1"]').waitFor();
    await page.locator('#intakeCopy').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Copied/.test(document.getElementById('intakeStatus')?.textContent || ''));
    assert.deepEqual(await page.evaluate(() => window.__copied), [expectedSnippet(x.slug)]);
    x = await open(await seed(width), { clipboard: 'blocked' }); page = x.page;
    await toInstall(x, 'webflow', 'me'); await page.locator('#intakeContinue').click(); await page.locator('[data-install-stage="1"]').waitFor();
    await page.locator('#intakeCopy').click();
    await page.waitForFunction(() => /Copy was blocked/.test(document.getElementById('intakeStatus')?.textContent || ''));
    const s = await stageState(page);
    assert.equal(s.code, expectedSnippet(x.slug), 'Code is visible after copy is blocked');
    assert.ok(s.codeFocusable, 'Code block is focusable so a keyboard user can select it');
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'PRE', 'Shift+Tab from Copy reaches the code');
  });

  await check(`web person copy carries the hand-off text with the configured snippet (${width})`, async () => {
    const x = await open(await seed(width)); const { page } = x;
    await toInstall(x, 'squarespace', 'web_person');
    for (let i = 0; i < 3 && !(await page.locator('#intakeCopy').count()); i++) { await page.locator('#intakeContinue').click(); await page.waitForTimeout(80); }
    await page.locator('#intakeCopy').click();
    await page.waitForFunction(() => window.__copied.length === 1);
    const text = (await page.evaluate(() => window.__copied))[0];
    assert.match(text, /Fixture Install Shop/); assert.ok(text.includes(expectedSnippet(x.slug)), 'Hand-off includes the configured snippet');
    assert.ok(text.includes('Code Injection'), 'Hand-off names Code Injection');
  });

  await check(`WordPress web person: stage 0 offers the hand-off copy as well as the ZIP (${width})`, async () => {
    const x = await open(await seed(width)); const { page } = x;
    await toInstall(x, 'wordpress', 'web_person');
    const s = await stageState(page);
    assert.ok(s.download, 'ZIP download offered');
    assert.equal(s.copyLabel, 'Copy instructions for my web person', 'Hand-off copy offered at stage 0');
    await page.locator('#intakeCopy').click(); await page.waitForFunction(() => window.__copied.length === 1);
    const text = (await page.evaluate(() => window.__copied))[0];
    assert.ok(text.includes(expectedSnippet(x.slug)) && /WordPress/.test(text), 'WordPress hand-off includes the configured code');
  });

  await check(`WordPress ZIP (keyboard) embeds the configured origin, not production (${width})`, async () => {
    const x = await open(await seed(width)); const { page } = x;
    await toInstall(x, 'wordpress', 'me');
    const snippet = await page.locator('#snippet').textContent(); assert.equal(snippet, expectedSnippet(x.slug), 'Other builders use the configured site');
    await page.locator('[data-wordpress-download]').focus();
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    assert.equal(download.suggestedFilename(), 'machines-cloud-' + x.slug + '.zip');
    const path = await download.path(); const zip = unzip(readFileSync(path));
    assert.equal(zip.name, 'machines-cloud-chat/machines-cloud-chat.php');
    const src = zip.text.match(/<script src="([^"]+)" data-client="([^"]+)" async><\/script>/);
    report.observations.push({ zipEntry: zip.name, zipSha256: sha(readFileSync(path)), scriptSrc: src?.[1], dataClient: src?.[2], width });
    assert.equal(src?.[2], x.slug);
    assert.equal(src?.[1], ORIGIN + '/embed.js', 'ZIP embed URL matches the configured origin');
    assert.match(zip.text, /^<\?php\n/); assert.match(zip.text, /if \(!defined\('ABSPATH'\)\) \{ exit; \}/);
    await page.waitForFunction(() => /ZIP prepared/.test(document.querySelector('.website-return-status')?.textContent || ''));
    assert.doesNotMatch(await page.locator('.website-return-status').textContent(), CLAIM);
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-wordpress-download')), true, 'Focus stays on the download button');
  });

  await check(`WordPress ZIP refuses when the configured code is unavailable instead of pointing at production (${width})`, async () => {
    const x = await open(await seed(width), { stripSite: true }); const { page } = x;
    await toInstall(x, 'wordpress', 'me');
    report.observations.push({ snippetWithoutSite: await page.locator('#snippet').textContent(), width });
    let downloaded = null; page.on('download', d => { downloaded = d; });
    await page.locator('[data-wordpress-download]').click(); await page.waitForTimeout(300);
    const status = await page.locator('.website-return-status').textContent();
    if (downloaded) { const zip = unzip(readFileSync(await downloaded.path())); assert.fail('A ZIP was produced without the configured code: ' + (zip.text.match(/src="([^"]+)"/)?.[1])); }
    assert.match(status, /could not be prepared/);
  });

  await check(`WordPress ZIP preparation failure gives an actionable message, not "code below" when none is shown (${width})`, async () => {
    const x = await open(await seed(width), { init: () => { URL.createObjectURL = () => { throw new Error('blocked'); }; } }); const { page } = x;
    await toInstall(x, 'wordpress', 'me');
    await page.locator('[data-wordpress-download]').click();
    await page.waitForFunction(() => /could not be prepared/.test(document.querySelector('.website-return-status')?.textContent || ''));
    const s = await stageState(page), status = await page.locator('.website-return-status').textContent();
    if (/code below/i.test(status)) assert.notEqual(s.code, null, 'Failure message points at "code below" but no code is shown: ' + status);
  });

  await check(`WordPress download blocked by the browser: status does not claim a saved file or installation (${width})`, async () => {
    const x = await open(await seed(width), { downloads: false }); const { page } = x;
    await toInstall(x, 'wordpress', 'me');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-wordpress-download]').click()]);
    const failure = await download.failure();
    const status = await page.locator('.website-return-status').textContent();
    report.observations.push({ blockedDownload: failure, status, width });
    assert.ok(failure, 'Browser refused the download');
    assert.doesNotMatch(status, /downloaded|saved to|installed|connected/i, 'Status cannot know the file was saved');
    assert.match(status, /did not (start|save)|choose Download again|downloads/i, 'Status tells the owner what to do if no file arrived');
  });
}

// ---------- finish ----------
await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close();
report.sourceAfter = hashes();
const globalsPass = report.physicalNetwork === 0 && report.forbidden.length === 0 && report.pageErrors.length === 0;
report.checks.push({ name: 'hygiene: no physical or forbidden requests and no page errors', pass: globalsPass, ...(globalsPass ? {} : { error: JSON.stringify({ physical: report.physicalNetwork, forbidden: report.forbidden, pageErrors: report.pageErrors }) }) });
report.checks.push({ name: 'source unchanged during the run', pass: JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter) });
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.durationMs = Date.now() - started;
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(report.passed + '/' + report.total + ' in ' + Math.round(report.durationMs / 1000) + 's -> ' + output);
process.exit(report.passed === report.total ? 0 : 1);
