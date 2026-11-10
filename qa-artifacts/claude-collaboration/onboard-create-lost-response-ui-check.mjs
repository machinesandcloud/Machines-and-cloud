// Causal browser check: a lost step-4 create response (or another lost onboarding request) must explain in plain
// language that answers are kept, never show raw browser error text, and a retry must land in exactly one workspace.
// Actual handlers in-process, memory store, fake model and fake mailbox; outside-origin browser requests and every
// server fetch are denied.
// Usage (from the worktree root): node qa-artifacts/claude-collaboration/onboard-create-lost-response-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-create-<name>.json
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), base = 'http://127.0.0.1:8898';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output') || 'scratchpad/claude-create-check.json', playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
if (!/^scratchpad\/claude-create-[\w-]+\.json$/.test(output)) throw new Error('Output must be scratchpad/claude-create-*.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
const prefix = output.slice(0, -5);
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = base;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
const report = { at: new Date().toISOString(), mode: 'actual onboarding source + access/onboard handlers in memory; fake mailbox and model; no network', checks: [], scenarios: [], requests: [], blockedBrowser: [], forbiddenApi: [], blockedServer: [], pageErrors: [], screenshots: [] };
globalThis.fetch = async input => { const url = new URL(String(input?.url || input)); report.blockedServer.push({ origin: url.origin, pathname: url.pathname }); throw new Error('QA physical transport denied'); };
const store = await import('../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../netlify/functions/lib/access.mjs');
const handlers = { '/api/access': (await import('../../netlify/functions/access.mjs')).default, '/api/onboard': (await import('../../netlify/functions/onboard.mjs')).default };
const sources = ['onboard.html', 'onboard.js', 'onboard.css', 'product-ui.css', 'netlify/functions/access.mjs', 'netlify/functions/onboard.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/accounts.mjs', 'netlify/functions/lib/store.mjs'];
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
report.sourceBefore = hashes();
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const RAW = /failed to fetch|load failed|networkerror|typeerror|syntaxerror|unexpected token|unexpected end|not valid json|aborted|signal is/i;
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE, headless: true } : { channel: 'chrome', headless: true });
let ip = 10;

// fault: { path, method, when: 'after' | 'before', remaining } loses one matching response.
async function newContext(width, row, session) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1000 ? 900 : 844 }, reducedMotion: 'reduce' });
  if (session) await context.addInitScript(value => sessionStorage.setItem('mc-onboarding-session-v1', value), session);
  const clientIp = '192.0.2.' + (ip++);
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if (url.origin !== base) { report.blockedBrowser.push({ origin: url.origin, pathname: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (!handlers[url.pathname]) { report.forbiddenApi.push({ method: incoming.method(), path: url.pathname }); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa_route_not_allowed"}' }); }
      const fault = row.fault && row.fault.remaining > 0 && row.fault.path === url.pathname && row.fault.method === incoming.method() ? row.fault : null;
      if (fault) fault.remaining--;
      if (fault?.when === 'before') { row.events.push('lost ' + incoming.method() + ' ' + url.pathname + ' before the handler ran'); report.requests.push({ id: row.id, method: incoming.method(), path: url.pathname, lost: 'before' }); return route.abort('connectionfailed'); }
      const req = new Request(url, { method: incoming.method(), headers: incoming.headers(), ...(['GET', 'HEAD'].includes(incoming.method()) ? {} : { body: incoming.postData() }) });
      const response = await handlers[url.pathname](req, { ip: clientIp });
      const body = ['GET', 'HEAD'].includes(incoming.method()) ? null : incoming.postDataJSON();
      report.requests.push({ id: row.id, method: incoming.method(), path: url.pathname, action: body?.action, status: response.status, ...(fault ? { lost: 'after' } : {}) });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (fault?.when === 'after') { row.events.push('lost ' + incoming.method() + ' ' + url.pathname + ' response after the handler returned ' + response.status); return route.abort('connectionfailed'); }
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: bytes });
    }
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    const path = resolve(root, relative);
    if (!path.startsWith(root + '/') || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream', body: readFileSync(path) });
  });
  return context;
}
async function openPage(context, row) { const page = await context.newPage(); page.on('pageerror', error => { report.pageErrors.push(row.id + ': ' + error.message); row.pageErrors.push(error.message); }); return page; }
const onStep = (page, n) => page.locator('fieldset[data-step="' + n + '"].on').waitFor({ state: 'visible' });
const settled = page => page.waitForFunction(() => !document.getElementById('next').disabled);
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
async function shot(page, id) { const path = prefix + '-' + id + '.png'; if (existsSync(path)) throw new Error('Refusing to overwrite screenshot ' + path); await page.screenshot({ path, fullPage: false }); report.screenshots.push(path); }
async function advance(page, from) {
  await page.locator('#next').click();
  await page.waitForFunction(n => document.querySelector('fieldset[data-step="' + (n + 1) + '"]').classList.contains('on') || (!document.getElementById('err').hidden && !document.getElementById('next').disabled), from);
  await settled(page);
  if (!await page.locator('fieldset[data-step="' + (from + 1) + '"].on').count()) throw new Error('Step ' + from + ' did not advance: ' + await page.locator('#err').innerText());
}
async function signIn(page, email) {
  await page.goto(base + '/onboard.html?plan=starter');
  await page.locator('#access-email').fill(email); await page.locator('#access-send').click();
  await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
  const delivery = await store.get('access_outbox', accessHash(email));
  await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' }); await onStep(page, 1);
  return page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
}
async function toStep4(page, row) {
  await page.locator('#name').fill('Create QA Owner'); await page.locator('#phone').fill('7135550101'); await advance(page, 1);
  await page.locator('#business').fill(row.business); await page.locator('#trade').selectOption('HVAC'); await page.locator('#services').fill('AC repair'); await page.locator('#serviceArea').fill('Katy'); await page.locator('#spanish').selectOption('no'); await page.locator('#hours').fill('Mon to Fri 7 to 6'); await advance(page, 2);
  await page.locator('#windows').fill('8 to 12\n12 to 5'); await advance(page, 3);
}
const workspacesFor = async email => { const out = []; for (const slug of await store.list('clients', '')) { const client = await store.getClient(slug); if (client?.owner?.email === email) out.push(slug); } return out; };
const errorState = page => page.evaluate(() => ({ err: document.getElementById('err').hidden ? '' : document.getElementById('err').innerText, button: document.getElementById('next').textContent, buttonEnabled: !document.getElementById('next').disabled, step4: document.querySelector('fieldset[data-step="4"]').classList.contains('on'), done: document.getElementById('done').classList.contains('on'), focusOnError: document.activeElement === document.getElementById('err'), notes: document.getElementById('notes')?.value }));

const scenarios = [];
for (const width of [1440, 390]) scenarios.push(['create-lost-after-handler', width], ['create-lost-before-handler', width], ['autosave-lost', width], ['reopen-lost', width]);
for (const [kind, width] of scenarios) {
  const row = { id: kind + '-' + width, kind, width, business: `Create QA ${kind} ${width}`, events: [], overflow: [], pageErrors: [] }; report.scenarios.push(row);
  const email = `qa-create-${kind}-${width}@example.test`, contexts = [];
  try {
    let context = await newContext(width, row); contexts.push(context);
    let page = await openPage(context, row);
    const session = await signIn(page, email);
    if (kind.startsWith('create-lost')) {
      await toStep4(page, row); await page.locator('#notes').fill('Keep these notes.');
      row.fault = { path: '/api/onboard', method: 'POST', when: kind === 'create-lost-after-handler' ? 'after' : 'before', remaining: 1 };
      await page.locator('#next').click();
      await page.waitForFunction(() => !document.getElementById('err').hidden && !document.getElementById('next').disabled);
      row.lostState = await errorState(page); row.workspacesAfterLoss = await workspacesFor(email);
      row.overflow.push(['error', await overflow(page)]);
      await shot(page, row.id + '-error');
      check(`${row.id}: lost create shows no raw browser error text`, row.lostState.err && !RAW.test(row.lostState.err), row.lostState.err);
      check(`${row.id}: lost create says the answers are saved and it may already have gone through`, /answers are saved/i.test(row.lostState.err) && /may already|might already|already (?:been )?created|already exists/i.test(row.lostState.err), row.lostState.err);
      check(`${row.id}: lost create names the retry action that is on the page`, row.lostState.err.includes(row.lostState.button.trim()) && row.lostState.button.trim() === 'Create my workspace' && row.lostState.buttonEnabled && row.lostState.step4, row.lostState);
      check(`${row.id}: lost create copy has no em dash`, !/—/.test(row.lostState.err), row.lostState.err);
      check(`${row.id}: answers stay on the page and focus moves to the message`, row.lostState.notes === 'Keep these notes.' && row.lostState.focusOnError, row.lostState);
      check(`${row.id}: store state after the loss matches where it was lost`, row.workspacesAfterLoss.length === (row.fault.when === 'after' ? 1 : 0), row.workspacesAfterLoss);
      await page.locator('#next').click(); await page.locator('#done.on').waitFor();
      row.overflow.push(['done', await overflow(page)]);
      const portal = await page.locator('#goPortal').getAttribute('href'), slug = new URL(portal, base).searchParams.get('c');
      row.workspacesAfterRetry = await workspacesFor(email);
      check(`${row.id}: retry lands in exactly one workspace`, row.workspacesAfterRetry.length === 1 && row.workspacesAfterRetry[0] === slug && (row.fault.when === 'before' || row.workspacesAfterLoss[0] === slug), { slug, after: row.workspacesAfterRetry });
      await shot(page, row.id + '-retried');
    } else if (kind === 'autosave-lost') {
      row.fault = { path: '/api/access', method: 'PUT', when: 'before', remaining: 1 };
      await page.locator('#name').fill('Create QA Owner');
      await page.locator('#draft-status').filter({ hasText: /still on this page/ }).waitFor();
      row.statusText = await page.locator('#draft-status').innerText(); row.overflow.push(['autosave', await overflow(page)]);
      await shot(page, row.id + '-error');
      check(`${row.id}: lost autosave shows no raw browser error text and keeps the answers`, !RAW.test(row.statusText) && /still on this page/.test(row.statusText) && await page.locator('#name').inputValue() === 'Create QA Owner', row.statusText);
      check(`${row.id}: lost autosave copy has no em dash`, !/—/.test(row.statusText), row.statusText);
      await page.locator('#phone').fill('7135550101'); await page.locator('#draft-status').filter({ hasText: 'Saved.' }).waitFor();
      check(`${row.id}: the next change saves the kept answers`, true);
    } else {
      await context.close(); row.fault = { path: '/api/access', method: 'GET', when: 'before', remaining: 1 };
      context = await newContext(width, row, session); contexts.push(context); page = await openPage(context, row);
      await page.goto(base + '/onboard.html'); await page.locator('#access-verify').waitFor({ state: 'visible' });
      row.statusText = await page.locator('#access-status').innerText(); row.overflow.push(['gate', await overflow(page)]);
      await shot(page, row.id + '-error');
      check(`${row.id}: lost reopen shows no raw browser error text`, row.statusText && !RAW.test(row.statusText), row.statusText);
      check(`${row.id}: lost reopen copy has no em dash`, !/—/.test(row.statusText), row.statusText);
      await page.locator('#access-verify').click(); await page.locator('#ob').waitFor({ state: 'visible' });
      check(`${row.id}: Try opening my account again recovers the form`, await page.locator('#ob').isVisible());
    }
  } catch (error) {
    row.fatal = String(error.stack || error);
    check(`${row.id}: scenario completes`, false, row.fatal.split('\n')[0]);
    const active = contexts.at(-1)?.pages().at(-1); if (active) await shot(active, row.id + '-failure').catch(() => {});
  } finally { for (const context of contexts) await context.close().catch(() => {}); }
  check(`${row.id}: no horizontal scroll`, row.overflow.length > 0 && row.overflow.every(([, over]) => !over), row.overflow);
  check(`${row.id}: no page errors`, row.pageErrors.length === 0, row.pageErrors);
}
await browser.close();
check('No browser request left the fixture origin', report.blockedBrowser.length === 0, report.blockedBrowser);
check('No forbidden API route was requested', report.forbiddenApi.length === 0, report.forbiddenApi);
check('No physical server transport was attempted', report.blockedServer.length === 0, report.blockedServer);
report.sourceAfter = hashes();
check('Source stayed stable throughout the check', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
report.summary = { checks: report.checks.length, passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length };
report.failed = report.checks.filter(c => !c.pass).map(c => ({ name: c.name, detail: c.detail }));
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, ...report.summary, failed: report.failed.map(f => f.name) }, null, 1));
if (report.summary.failed) process.exitCode = 1;
