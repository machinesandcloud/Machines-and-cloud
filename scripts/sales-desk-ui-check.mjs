// Independent sales UI acceptance. Every request is a local static/NDJSON fixture; no model/API/provider.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.'), base = 'http://127.0.0.1:8898', storageKey = 'mc_sales_desk_v3';
const files = ['agent-widget.js', 'styles.css', 'site-refresh.css', 'stories.js', 'index.html'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const report = { at: new Date().toISOString(), mode: 'all static and HTTP responses fulfilled locally; no actual model or provider', sourceBefore: hashes(), checks: [], cases: [], pageErrors: [], externalBlocked: [], blockedAPI: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function pageFor(name, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: options.height || 844 }, reducedMotion: 'reduce', acceptDownloads: true });
  const state = { name, requests: [], mode: 'done', reply: 'A useful fixture answer.', events: [], release: null };
  await context.addInitScript(({ key, storage, denyStorage }) => {
    if (storage !== undefined) sessionStorage.setItem(key, storage);
    window.__salesMicRequests = 0; window.__salesClipboard = '';
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => { window.__salesMicRequests++; return Promise.reject(new Error('QA microphone disabled')); } } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__salesClipboard = value; } } });
    if (denyStorage) { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('QA storage unavailable'); } }); }
  }, { key: storageKey, storage: options.storage, denyStorage: options.denyStorage === true });
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { report.externalBlocked.push({ case: name, origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname !== '/api/chat' || req.method() !== 'POST') { report.blockedAPI.push({ case: name, path: url.pathname, method: req.method() }); return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"qa_blocked"}' }); }
      state.requests.push(req.postDataJSON());
      if (state.mode === 'hold') await new Promise(resolve => { state.release = resolve; });
      let status = 200, lines;
      if (state.mode === 'offline') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      if (state.mode === 'limit') return route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"sales_daily_limit"}' });
      if (state.mode === 'partial') lines = [{ t: 'delta', text: 'INCOMPLETE FRAGMENT' }];
      else if (state.mode === 'error-late') lines = [{ t: 'delta', text: 'UNFINISHED' }, { t: 'error', error: 'upstream' }, { t: 'delta', text: 'LATE CORRUPTION' }];
      else if (state.mode === 'malformed') return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '{"t":"delta","text":"UNFINISHED"}\nINVALID JSON\n' });
      else lines = [{ t: 'delta', text: 'Fixture prelude' }, { t: 'done', reply: state.reply, events: state.events }, { t: 'done', reply: 'DUPLICATE CORRUPTION', events: [] }, { t: 'delta', text: 'LATE CORRUPTION' }];
      return route.fulfill({ status, contentType: 'application/x-ndjson', body: lines.map(row => JSON.stringify(row)).join('\n') + '\n' }).catch(() => {});
    }
    const relative = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, ''));
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'blocked' });
    let path = resolve(root, relative); if (!path.startsWith(root + '/')) return route.fulfill({ status: 404, body: 'blocked' });
    if (!existsSync(path) && existsSync(path + '.html')) path += '.html';
    if (!existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: readFileSync(path) });
  });
  const page = await context.newPage(); state.page = page; state.context = context;
  page.on('pageerror', error => report.pageErrors.push({ case: name, message: error.message }));
  await page.goto(base + '/'); await page.locator('#mcAgentLauncher').click();
  state.waitIdle = () => page.waitForFunction(() => document.querySelector('#mcAgentStop').hidden && !document.querySelector('#mcAgentSend').disabled);
  state.begin = async text => { await page.locator('#mcAgentInput').fill(text); await page.locator('#mcAgentInput').press('Enter'); };
  state.send = async text => { await state.begin(text); await state.waitIdle(); };
  state.saved = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), storageKey);
  report.cases.push(state); return state;
}
try {
  for (const [width, height] of [[390, 844], [320, 720], [1440, 960], [390, 380]]) {
    const s = await pageFor(`viewport-${width}-${height}`, { width, height });
    const geometry = await s.page.evaluate(() => Object.fromEntries(['mcAgentPanel', 'mcAgentInput', 'mcAgentSend', 'mcAgentClose'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [id, { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }]; })));
    check(`${width}×${height} panel/composer/actions fit visible viewport`, Object.values(geometry).every(r => r.x >= 0 && r.y >= 0 && r.right <= r.width + 1 && r.bottom <= r.height + 1), geometry);
    check(`${width}×${height} opens focused with actual modal background isolation`, await s.page.locator('#mcAgentInput').evaluate(n => n === document.activeElement) && await s.page.locator('main').evaluate(n => n.inert));
    const focusables = s.page.locator('#mcAgentPanel button:visible:not([disabled]), #mcAgentPanel a:visible, #mcAgentPanel textarea:visible:not([disabled])');
    await focusables.last().focus(); await s.page.keyboard.press('Tab');
    check(`${width}×${height} keyboard wraps within modal`, await focusables.first().evaluate(n => n === document.activeElement));
    await s.page.keyboard.press('Escape');
    check(`${width}×${height} Escape restores page and launcher focus`, !await s.page.locator('#mcAgentPanel').isVisible() && !await s.page.locator('main').evaluate(n => n.inert) && await s.page.locator('#mcAgentLauncher').evaluate(n => n === document.activeElement));
    await s.page.locator('#mcAgentLauncher').click(); await s.page.screenshot({ path: `scratchpad/sales-desk-current-${width}-${height}.png` });
    await s.context.close();
  }
  {
    const s = await pageFor('long-continuity');
    await s.send('Two-truck HVAC shop in Katy; diagnostic $89.');
    for (let n = 1; n <= 11; n++) await s.send('Follow-up question ' + n);
    const messages = s.requests.at(-1).messages;
    check('Twelve-turn history remains complete, valid and retains original owner facts', messages.length === 23 && messages.every((m, n) => m.role === (n % 2 ? 'assistant' : 'user')) && messages[0].content.includes('Katy; diagnostic $89'));
    s.reply = 'Long helpful answer. '.repeat(100) + ' Corrected fee $99.'; await s.send('Give me a detailed plan.'); await s.send('Correction: Cypress and $99, not Katy and $89.');
    check('Long replies and latest correction survive the actual outgoing history', s.requests.at(-1).messages.some(m => m.role === 'assistant' && m.content.includes('Corrected fee $99.')) && s.requests.at(-1).messages.at(-1).content.includes('Cypress and $99'));
    await s.context.close();
  }
  {
    const s = await pageFor('retry-and-next-draft'); s.mode = 'offline'; await s.send('My first question');
    check('Failed send is retained as explicit unanswered question with usable Retry', (await s.saved()).failed === 'My first question' && (await s.saved()).turns.length === 0 && await s.page.locator('.mc-agent-retry').isVisible());
    await s.page.locator('#mcAgentInput').fill('Keep this unsent follow-up'); s.mode = 'done'; await s.page.locator('.mc-agent-retry').click(); await s.waitIdle();
    check('Retry sends one user turn and preserves distinct unsent draft', s.requests.at(-1).messages.length === 1 && s.requests.at(-1).messages[0].content === 'My first question' && await s.page.locator('#mcAgentInput').inputValue() === 'Keep this unsent follow-up' && (await s.saved()).turns.length === 2);
    s.mode = 'limit'; await s.send('Allowance limit question');
    check('Daily allowance decline is truthful, retryable and not a human-send promise', /allowance.*used up/i.test(await s.page.locator('#mcAgentMessages').innerText()) && (await s.saved()).failed === 'Allowance limit question'); await s.context.close();
  }
  {
    const s = await pageFor('busy-stop-reset'); s.mode = 'hold'; await s.begin('Pending original'); await s.page.locator('#mcAgentStop').waitFor({ state: 'visible' });
    await s.page.locator('#mcAgentInput').fill('Preserve my next draft'); await s.page.locator('#mcAgentInput').press('Enter');
    check('Busy Enter preserves draft and starts no second request', await s.page.locator('#mcAgentInput').inputValue() === 'Preserve my next draft' && s.requests.length === 1);
    await s.page.locator('#mcAgentReset').click(); const release = s.release; if (release) release(); await s.page.waitForTimeout(100);
    check('New chat aborts and invalidates delayed old reply', (await s.saved()).turns.length === 0 && !await s.page.locator('.mc-agent-row.user').count() && !/Pending original|A useful fixture answer/.test(await s.page.locator('#mcAgentMessages').innerText()));
    s.mode = 'hold'; await s.begin('Stop this question'); await s.page.locator('#mcAgentStop').click(); await s.waitIdle(); if (s.release) s.release();
    check('Stop preserves unanswered question for an explicit retry', (await s.saved()).failed === 'Stop this question' && await s.page.locator('.mc-agent-retry').isVisible()); await s.context.close();
  }
  {
    const s = await pageFor('close-focus'); s.mode = 'hold'; await s.begin('Close while pending'); await s.page.locator('#mcAgentStop').waitFor({ state: 'visible' });
    await s.page.locator('#mcAgentClose').click(); await s.page.locator('.navbar-logo').focus(); if (s.release) s.release(); await s.page.waitForTimeout(100);
    check('Completion while closed does not reopen or steal external focus', !await s.page.locator('#mcAgentPanel').isVisible() && await s.page.locator('.navbar-logo').evaluate(n => n === document.activeElement)); await s.context.close();
  }
  for (const mode of ['partial', 'error-late', 'malformed', 'done']) {
    const s = await pageFor('stream-' + mode); s.mode = mode; await s.send('Stream recovery request'); const saved = await s.saved(), visible = await s.page.locator('#mcAgentMessages').innerText();
    if (mode === 'done') check('First done is terminal and ignores duplicate/late mutations', saved.turns.length === 2 && saved.turns[1].content === s.reply && !visible.includes('CORRUPTION'));
    else check(`${mode} never commits an incomplete or fabricated completed reply`, saved.turns.length === 0 && saved.failed === 'Stream recovery request' && !visible.includes('CORRUPTION') && await s.page.locator('.mc-agent-retry').isVisible()); await s.context.close();
  }
  for (const [name, storage, denyStorage] of [
    ['malformed', '{', false], ['object', '{"oldFormat":true}', false],
    ['wrong-role', JSON.stringify({ version: 3, turns: [{ role: 'assistant', content: 'orphan' }, { role: 'user', content: 'wrong' }] }), false],
    ['oversized', JSON.stringify({ version: 3, turns: [{ role: 'user', content: 'x'.repeat(1501) }, { role: 'assistant', content: 'answer' }] }), false],
    ['unavailable', undefined, true]
  ]) {
    const s = await pageFor('storage-' + name, { storage, denyStorage }); await s.send('Fresh question after invalid history');
    check(`${name} persisted state cannot break next conversation`, s.requests.at(-1).messages.length === 1 && !report.pageErrors.some(row => row.case === s.name)); await s.context.close();
  }
  {
    const s = await pageFor('actions-copy-save');
    s.reply = '**Useful rule:** ask for the service area.\n\n[Set up](/onboard.html)\nhttps://evil.invalid/credential\n' + base + '/api/admin\n' + base + '/onboard?session=do-not-follow\n<img src=x onerror=alert(1)>\n[jump](javascript:alert(1))';
    s.events = [{ type: 'sales_action', action: 'start_workspace', href: 'https://evil.invalid', label: 'Create workspace' }, { type: 'sales_action', action: 'start_workspace' }, { type: 'sales_action', action: '__proto__' }, { type: 'sales_action', action: 'see_example', scenario: 'call', href: '/api/admin' }, { type: 'sales_action', action: 'contact', href: 'https://evil.invalid' }];
    await s.send('Show my optional next steps');
    const actions = await s.page.locator('.mc-agent-action').evaluateAll(nodes => nodes.map(n => ({ label: n.textContent, href: n.getAttribute('href') })));
    check('Structured actions are deduplicated, allowlisted and ignore supplied destinations', actions.length === 3 && actions.some(a => a.href === '/onboard') && actions.some(a => a.href === '/?example=call#demo-wrap') && actions.some(a => a.href === 'https://calendly.com/ngoumnaisteve/30'), actions);
    check('Contact opens only visitor-chosen fixed calendar without booking automatically', await s.page.locator('.mc-agent-action[href^="https://calendly.com/"]').getAttribute('target') === '_blank' && /noopener/.test(await s.page.locator('.mc-agent-action[href^="https://calendly.com/"]').getAttribute('rel')));
    check('Reply markup cannot inject HTML, script links or external/API/credential destinations', await s.page.locator('#mcAgentMessages img').count() === 0 && await s.page.locator('#mcAgentMessages a[href^="javascript:"],#mcAgentMessages a[href^="https://evil.invalid"],#mcAgentMessages a[href^="/api/"],#mcAgentMessages a[href*="session="]').count() === 0);
    await s.page.locator('.mc-agent-copy').last().click();
    check('Copy reply retains the actual useful source text', await s.page.evaluate(() => window.__salesClipboard) === s.reply);
    const download = s.page.waitForEvent('download'); await s.page.locator('#mcAgentSave').click(); const file = await download;
    check('Save chat produces a readable portable conversation', readFileSync(await file.path(), 'utf8').includes('Useful rule:') && file.suggestedFilename() === 'machines-and-cloud-conversation.txt');
    check('No voice or form/API action starts merely from a suggested action', await s.page.evaluate(() => window.__salesMicRequests) === 0 && report.blockedAPI.length === 0);
    await s.page.locator('.mc-agent-action[href^="/?example="]').click();
    check('Explicit example action selects real English plumbing without auto microphone', !await s.page.locator('#mcAgentPanel').isVisible() && await s.page.locator('[data-example="call"]').getAttribute('aria-pressed') === 'true' && await s.page.evaluate(() => window.__salesMicRequests) === 0);
    await s.page.locator('#mcAgentLauncher').evaluate(n => n.click());
    const nav = s.page.waitForURL('**/onboard'); await s.page.locator('.mc-agent-action[href="/onboard"]').click(); await nav;
    check('Explicit setup action reaches actual verified email entry', await s.page.locator('#access-gate').isVisible() && report.blockedAPI.length === 0); await s.context.close();
  }
  {
    const s = await pageFor('planning-receipts');
    s.reply = 'The total is1188 monthly minutes, but you have not chosen a routed share.';
    s.events = [{ type: 'sales_estimate', data: { kind: 'call_volume', totalMinutes: 1188, missedMinutes: null, routedMinutes: null, assumptions: [] } }];
    await s.send('18 calls daily,3minutes,22days.');
    s.reply = 'At a quarter routed to AI, that becomes297 minutes. Phone service still needs separate activation.';
    s.events = [{ type: 'sales_estimate', data: { kind: 'call_volume', totalMinutes: 1188, missedMinutes: null, routedMinutes: 297, assumptions: ['Quarter explicitly selected, not a missed-call assumption.'] } }];
    await s.send('Only a quarter goes to AI.');
    await s.page.locator('.mc-agent-card').last().locator('summary').click();
    check('Corrected planning receipt displays297routed with missing share honest', /297/.test(await s.page.locator('.mc-agent-card').last().innerText()) && /Not established/.test(await s.page.locator('.mc-agent-card').last().innerText()) && /Planning only/.test(await s.page.locator('.mc-agent-card').last().innerText()));
    await s.page.screenshot({ path: 'scratchpad/sales-desk-planning-receipt-390.png' });
    await s.page.reload(); await s.page.locator('#mcAgentLauncher').click();
    check('Reload preserves completed conversation and its actual planning receipt', await s.page.locator('.mc-agent-card').count() === 2 && (await s.saved()).turns.length === 4);
    s.reply = 'Current workflow does not meet native Jobber synchronization as a requirement.';
    s.events = [{ type: 'sales_fit', data: { kind: 'workflow_fit', fit: 'not_current_fit', gaps: [{ detail: 'No native Jobber busy-time synchronization.' }] } }];
    await s.send('Native Jobber sync is required.'); await s.page.locator('.mc-agent-card').last().locator('summary').click();
    check('Fit receipt exposes unmet required capability without fake activation', /requirement is unavailable/.test(await s.page.locator('.mc-agent-card').last().innerText()) && /No native Jobber/.test(await s.page.locator('.mc-agent-card').last().innerText()));
    await s.context.close();
  }
  {
    const turns = Array.from({ length: 60 }, (_, n) => ({ role: n % 2 ? 'assistant' : 'user', content: 'Saved turn ' + n }));
    const s = await pageFor('bounded-history', { storage: JSON.stringify({ version: 3, turns, draft: '', failed: '' }) });
    check('Documented history bound offers Save/New chat instead of broken submission', await s.page.locator('#mcAgentInput').isDisabled() && /Save.*New chat/.test(await s.page.locator('#mcAgentStatus').innerText()));
    await s.page.locator('#mcAgentReset').click(); await s.send('Start fresh with another shop');
    check('New chat clears bounded old facts and restores a valid request', s.requests.at(-1).messages.length === 1 && !s.requests.at(-1).messages.some(m => m.content.includes('Saved turn'))); await s.context.close();
  }
  check('No uncaught browser errors in functional acceptance', report.pageErrors.length === 0, report.pageErrors);
  check('No forbidden API/submission route was invoked', report.blockedAPI.length === 0, report.blockedAPI);
} catch (error) { report.fatal = String(error.stack || error); const page = browser.contexts().at(-1)?.pages().at(-1); if (page) await page.screenshot({ path: 'scratchpad/sales-desk-ui-return.png' }).catch(() => {}); }
finally {
  for (const row of report.cases) for (const key of ['page', 'context', 'release', 'waitIdle', 'begin', 'send', 'saved']) delete row[key];
  await browser.close(); report.sourceAfter = hashes(); check('UI source stayed unchanged during acceptance', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
  report.summary = { checks: report.checks.length, passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, actualModelRequests: 0, actualExternalRequests: 0 };
  const index = process.argv.indexOf('--output'), output = index < 0 ? 'scratchpad/sales-desk-ui-first.json' : process.argv[index + 1]; if (!output?.startsWith('scratchpad/')) throw new Error('QA output must remain under scratchpad');
  writeFileSync(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, ...report.summary, fatal: report.fatal || null }));
}
