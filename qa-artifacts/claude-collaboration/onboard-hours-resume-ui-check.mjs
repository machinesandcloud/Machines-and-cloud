// Causal browser check: typed business hours must drive the day table after a reload or return visit,
// while a genuinely hand-edited day table still survives reload. Actual handlers in-process, memory store,
// fake model and fake mailbox; every browser request outside the fixture origin and every server fetch is denied.
// Usage (from the worktree root): node qa-artifacts/claude-collaboration/onboard-hours-resume-ui-check.mjs --playwright <index.mjs> --output scratchpad/claude-hours-<name>.json
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), base = 'http://127.0.0.1:8897';
if (resolve('.') !== root) throw new Error('Run from the worktree root: ' + root);
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const output = arg('--output') || 'scratchpad/claude-hours-check.json', playwrightPath = arg('--playwright') || '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
if (!/^scratchpad\/claude-hours-[\w-]+\.json$/.test(output)) throw new Error('Output must be scratchpad/claude-hours-*.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained QA evidence: ' + output);
const prefix = output.slice(0, -5);
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '1'; process.env.URL = base;
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
const report = { at: new Date().toISOString(), mode: 'actual onboarding source + access/onboard handlers in memory; fake mailbox and model; no network', checks: [], scenarios: [], requests: [], blockedBrowser: [], forbiddenApi: [], blockedServer: [], pageErrors: [], screenshots: [] };
globalThis.fetch = async input => { const url = new URL(String(input?.url || input)); report.blockedServer.push({ origin: url.origin, pathname: url.pathname }); throw new Error('QA physical transport denied'); };
const store = await import('../../netlify/functions/lib/store.mjs');
const { accessHash } = await import('../../netlify/functions/lib/access.mjs');
const handlers = { '/api/access': (await import('../../netlify/functions/access.mjs')).default, '/api/onboard': (await import('../../netlify/functions/onboard.mjs')).default };
const sources = ['onboard.html', 'onboard.js', 'onboard.css', 'product-ui.css', 'netlify/functions/access.mjs', 'netlify/functions/onboard.mjs', 'netlify/functions/lib/access.mjs', 'netlify/functions/lib/config.mjs', 'netlify/functions/lib/store.mjs'];
const hashes = () => Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')]));
report.sourceBefore = hashes();
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch(process.env.MC_PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.MC_PLAYWRIGHT_EXECUTABLE, headless: true } : { channel: 'chrome', headless: true });
const TEXT = 'Mon to Fri 7 to 6, Sat 8 to 2';
const WEEK = { mon: ['07:00', '18:00'], tue: ['07:00', '18:00'], wed: ['07:00', '18:00'], thu: ['07:00', '18:00'], fri: ['07:00', '18:00'], sat: ['08:00', '14:00'], sun: null };
const DAYS = Object.keys(WEEK);
const rowsOf = spec => Object.fromEntries(DAYS.map(d => [d, spec[d] ? { open: spec[d][0], close: spec[d][1] } : { open: '', close: '' }]));
const savedOf = spec => Object.fromEntries(DAYS.map(d => [d, spec[d] ? { open: spec[d][0], close: spec[d][1] === '00:00' ? '24:00' : spec[d][1] } : null]));
const norm = table => table && Object.fromEntries(DAYS.map(d => [d, table[d] ? { open: table[d].open, close: table[d].close === '00:00' ? '24:00' : table[d].close } : null]));
let ip = 10;

async function newContext(width, session) {
  const context = await browser.newContext({ viewport: { width, height: width >= 1000 ? 900 : 844 }, reducedMotion: 'reduce' });
  if (session) await context.addInitScript(value => sessionStorage.setItem('mc-onboarding-session-v1', value), session);
  const clientIp = '192.0.2.' + (ip++);
  await context.route('**/*', async route => {
    const incoming = route.request(), url = new URL(incoming.url());
    if (url.origin !== base) { report.blockedBrowser.push({ origin: url.origin, pathname: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (!handlers[url.pathname]) { report.forbiddenApi.push({ method: incoming.method(), path: url.pathname }); return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"qa_route_not_allowed"}' }); }
      const req = new Request(url, { method: incoming.method(), headers: incoming.headers(), ...(['GET', 'HEAD'].includes(incoming.method()) ? {} : { body: incoming.postData() }) });
      const response = await handlers[url.pathname](req, { ip: clientIp });
      const body = ['GET', 'HEAD'].includes(incoming.method()) ? null : incoming.postDataJSON();
      report.requests.push({ method: incoming.method(), path: url.pathname, action: body?.action, status: response.status });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
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
const savedStatus = page => page.locator('#draft-status').filter({ hasText: 'Saved.' }).waitFor();
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const table = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#hoursRows input')].reduce((rows, field) => { const row = rows.find(r => r[0] === field.dataset.d) || (rows.push([field.dataset.d, {}]), rows[rows.length - 1]); row[1][field.dataset.k] = field.value; return rows; }, [])));
async function advance(page, from) {
  await page.locator('#next').click();
  await page.waitForFunction(n => document.querySelector('fieldset[data-step="' + (n + 1) + '"]').classList.contains('on') || (!document.getElementById('err').hidden && !document.getElementById('next').disabled), from);
  await settled(page);
  return page.evaluate(n => ({ advanced: document.querySelector('fieldset[data-step="' + (n + 1) + '"]').classList.contains('on'), summary: document.getElementById('err').hidden ? '' : document.getElementById('err').textContent, hoursError: document.getElementById('hours-error')?.hidden === false ? document.getElementById('hours-error').textContent : '' }), from);
}
async function signIn(page, email) {
  await page.goto(base + '/onboard.html?plan=starter');
  await page.locator('#access-email').fill(email); await page.locator('#access-send').click();
  await page.locator('#access-status').filter({ hasText: 'No email was sent' }).waitFor();
  const delivery = await store.get('access_outbox', accessHash(email));
  await page.goto(delivery.link); await page.locator('#ob').waitFor({ state: 'visible' }); await onStep(page, 1);
  return page.evaluate(() => sessionStorage.getItem('mc-onboarding-session-v1'));
}
async function savedDraft(session) {
  const response = await handlers['/api/access'](new Request(base + '/api/access', { headers: { authorization: 'Bearer ' + session, origin: base } }), { ip: '192.0.2.250' });
  const data = await response.json(); let hours = null; try { hours = JSON.parse(data.draft?.fields?.hoursTable || 'null'); } catch { hours = 'unparseable'; }
  return { step: data.draft?.step, hoursText: data.draft?.fields?.hours, hoursTable: hours };
}
async function fillStep1(page, row) { await page.locator('#name').fill('Hours QA Owner'); await page.locator('#phone').fill('7135550101'); await savedStatus(page); row.events.push('step1 autosaved'); }
async function fillStep2(page, row, hours) {
  await page.locator('#business').fill(row.business); await page.locator('#trade').selectOption('HVAC'); await page.locator('#services').fill('AC repair'); await page.locator('#serviceArea').fill('Katy'); await page.locator('#spanish').selectOption('no');
  if (hours !== null) await page.locator('#hours').fill(hours);
}
async function editRows(page, edits) {
  const details = page.locator('#hoursRows').locator('xpath=ancestor::details[1]');
  if (!await details.evaluate(node => node.open)) await details.locator('summary').click();
  for (const [day, open, close] of edits) { await page.locator(`#hoursRows input[data-d="${day}"][data-k="open"]`).fill(open); await page.locator(`#hoursRows input[data-d="${day}"][data-k="close"]`).fill(close); }
}
async function finish(page, row, session, expected) {
  row.tableAtStep2 = await table(page);
  check(`${row.id}: day table shows the expected hours on step 2`, JSON.stringify(row.tableAtStep2) === JSON.stringify(rowsOf(expected)), row.tableAtStep2);
  row.overflow.push(['step2', await overflow(page)]);
  const result = await advance(page, 2); row.step2Result = result;
  check(`${row.id}: Save and continue reaches step 3`, result.advanced, result);
  if (!result.advanced) { await shot(page, row.id + '-blocked'); return; }
  row.overflow.push(['step3', await overflow(page)]);
  await shot(page, row.id);
  row.draft = await savedDraft(session);
  check(`${row.id}: saved draft hours equal the day table`, JSON.stringify(norm(row.draft.hoursTable)) === JSON.stringify(savedOf(expected)), row.draft);
  await page.locator('#windows').fill('10 to 12\n12 to 2');
  const step3 = await advance(page, 3); if (!step3.advanced) { check(`${row.id}: step 3 advances`, false, step3); return; }
  await page.locator('#next').click(); await page.waitForFunction(() => document.getElementById('done').classList.contains('on') || (!document.getElementById('err').hidden && !document.getElementById('next').disabled));
  const portal = await page.locator('#goPortal').getAttribute('href').catch(() => null), slug = portal && new URL(portal, base).searchParams.get('c');
  const client = slug ? await store.getClient(slug) : null; row.created = client ? { slug, hoursText: client.business.hours, hours: client.rules.hours } : { error: await page.locator('#err').innerText() };
  check(`${row.id}: created workspace hours equal the saved draft and day table`, client && JSON.stringify(norm(client.rules.hours)) === JSON.stringify(savedOf(expected)) && JSON.stringify(norm(client.rules.hours)) === JSON.stringify(norm(row.draft.hoursTable)), row.created);
}
async function shot(page, id) { const path = prefix + '-' + id + '.png'; if (existsSync(path)) throw new Error('Refusing to overwrite screenshot ' + path); await page.screenshot({ path, fullPage: true }); report.screenshots.push(path); }

const scenarios = [];
for (const width of [1440, 390, 320]) scenarios.push(['main-reload', width]);
for (const width of [1440, 390]) scenarios.push(['return-visit', width], ['custom-survives', width], ['custom-text-survives', width], ['control-no-reload', width], ['retyped-after-reload', width]);
scenarios.push(['overnight-retyped', 390]);
for (const [kind, width] of scenarios) {
  const row = { id: kind + '-' + width, kind, width, business: `Hours QA ${kind} ${width}`, events: [], overflow: [], pageErrors: [] }; report.scenarios.push(row);
  const email = `qa-hours-${kind}-${width}@example.test`, contexts = [];
  try {
    let context = await newContext(width); contexts.push(context);
    let page = await openPage(context, row);
    const session = await signIn(page, email);
    if (kind === 'main-reload' || kind === 'return-visit') {
      await fillStep1(page, row);
      if (kind === 'main-reload') { await page.reload(); row.events.push('reloaded'); }
      else { await context.close(); context = await newContext(width, session); contexts.push(context); page = await openPage(context, row); await page.goto(base + '/onboard.html'); row.events.push('new context, same session'); }
      await page.locator('#ob').waitFor({ state: 'visible' }); await onStep(page, 1); await settled(page);
      const toStep2 = await advance(page, 1); if (!toStep2.advanced) throw new Error('Step 1 did not advance: ' + JSON.stringify(toStep2));
      await fillStep2(page, row, TEXT);
      await finish(page, row, session, WEEK);
    } else if (kind === 'retyped-after-reload' || kind === 'overnight-retyped') {
      // Reload while the day table already holds text-derived hours, then retype: the text must drive the table again.
      const first = kind === 'overnight-retyped' ? 'Mon to Sat 6pm to 12am' : TEXT, firstSpec = kind === 'overnight-retyped' ? { mon: ['18:00', '00:00'], tue: ['18:00', '00:00'], wed: ['18:00', '00:00'], thu: ['18:00', '00:00'], fri: ['18:00', '00:00'], sat: ['18:00', '00:00'], sun: null } : WEEK;
      await fillStep1(page, row);
      const toStep2 = await advance(page, 1); if (!toStep2.advanced) throw new Error('Step 1 did not advance');
      await fillStep2(page, row, first); await savedStatus(page);
      row.draftBeforeReload = await savedDraft(session);
      check(`${row.id}: text-derived hours were autosaved before reload`, JSON.stringify(norm(row.draftBeforeReload.hoursTable)) === JSON.stringify(savedOf(firstSpec)) && row.draftBeforeReload.hoursTable?.mon?.open === firstSpec.mon[0], row.draftBeforeReload);
      await page.reload(); row.events.push('reloaded with text-derived table'); await page.locator('#ob').waitFor({ state: 'visible' }); await onStep(page, 2); await settled(page);
      row.tableAfterReload = await table(page);
      check(`${row.id}: text-derived table is restored after reload`, JSON.stringify(row.tableAfterReload) === JSON.stringify(rowsOf(firstSpec)), row.tableAfterReload);
      await page.locator('#hours').fill(''); await page.locator('#hours').fill('Mon to Fri 8 to 5'); row.events.push('retyped Mon to Fri 8 to 5');
      await finish(page, row, session, { mon: ['08:00', '17:00'], tue: ['08:00', '17:00'], wed: ['08:00', '17:00'], thu: ['08:00', '17:00'], fri: ['08:00', '17:00'], sat: null, sun: null });
    } else if (kind === 'control-no-reload') {
      await fillStep1(page, row);
      const toStep2 = await advance(page, 1); if (!toStep2.advanced) throw new Error('Step 1 did not advance');
      await fillStep2(page, row, TEXT);
      await finish(page, row, session, WEEK);
    } else {
      await fillStep1(page, row);
      const toStep2 = await advance(page, 1); if (!toStep2.advanced) throw new Error('Step 1 did not advance');
      const textFirst = kind === 'custom-survives';
      await fillStep2(page, row, textFirst ? TEXT : null);
      const custom = textFirst ? { ...WEEK, tue: ['09:00', '15:00'] } : { mon: null, tue: ['09:00', '15:00'], wed: null, thu: ['10:00', '16:00'], fri: null, sat: null, sun: null };
      await editRows(page, textFirst ? [['tue', '09:00', '15:00']] : [['tue', '09:00', '15:00'], ['thu', '10:00', '16:00']]);
      await savedStatus(page);
      row.hoursTextBeforeReload = await page.locator('#hours').inputValue();
      if (!textFirst) check(`${row.id}: hand-edited rows label the text as custom`, row.hoursTextBeforeReload === 'Custom weekly hours', row.hoursTextBeforeReload);
      await page.reload(); row.events.push('reloaded after hand edit'); await page.locator('#ob').waitFor({ state: 'visible' }); await onStep(page, 2); await settled(page);
      row.tableAfterReload = await table(page);
      check(`${row.id}: hand-edited day table is intact after reload`, JSON.stringify(row.tableAfterReload) === JSON.stringify(rowsOf(custom)), row.tableAfterReload);
      await page.locator('#hours').fill('Mon to Fri 8 to 5'); await page.locator('#hours').blur();
      row.tableAfterTyping = await table(page);
      check(`${row.id}: later typing in the hours text does not overwrite the custom table`, JSON.stringify(row.tableAfterTyping) === JSON.stringify(rowsOf(custom)), row.tableAfterTyping);
      await finish(page, row, session, custom);
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
check('Every sign-in link went to the fake mailbox only', report.requests.filter(r => r.action === 'request_link').every(r => r.status < 300));
report.sourceAfter = hashes();
check('Source stayed stable throughout the check', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
report.summary = { checks: report.checks.length, passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length };
report.failed = report.checks.filter(c => !c.pass).map(c => ({ name: c.name, detail: c.detail }));
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, ...report.summary, failed: report.failed.map(f => f.name) }, null, 1));
if (report.summary.failed) process.exitCode = 1;
