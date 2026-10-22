// Offline rendering of preserved actual answers, plus local link fixtures. No model/server calls.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const root = process.cwd(), origin = 'http://127.0.0.1:8899';
const args = process.argv.slice(2), at = args.indexOf('--output');
const output = at >= 0 ? args[at + 1] : 'scratchpad/sales-desk-render-repair-qa.json';
const prefix = output.replace(/\.json$/, '');
const expected = {
  'agent-widget.js': '7c8c2cb1c55d708a07d4aed8ab35a35b6435ced089a7d03630e5bb122d28fa25',
  'styles.css': '74b35067b3b8501ac3749e5fee37e5f1b88ed7026bd3a364f61ae60693f9422a',
};
const sourceFiles = [...Object.keys(expected), 'site-refresh.css', 'script.js', 'stories.js', 'index.html'];
const hash = value => createHash('sha256').update(value).digest('hex');
const source = Object.fromEntries(await Promise.all(sourceFiles.map(async p => [p, hash(await readFile(p))])));
for (const [file, sha] of Object.entries(expected)) assert.equal(source[file], sha, 'Frozen frontend changed: ' + file);
const actualPath = 'scratchpad/sales-desk-model-phase1-continuation-1.json';
const actualBytes = await readFile(actualPath), actual = JSON.parse(actualBytes);
const report = {
  startedAt: new Date().toISOString(),
  scope: 'Offline replay of preserved actual-model answers against a later frontend repair; no new generated answers, actual streaming or hosted proof.',
  source, actualOutput: { path: actualPath, sha256: hash(actualBytes) },
  checks: [], cases: [], screenshots: [], browserErrors: [], blocked: [],
  locallyFulfilledPOSTs: 0, localSchedulingClicks: 0,
  actualHTTPRequests: 0, actualHandlerCalls: 0, actualModelRequests: 0, actualProviderRequests: 0,
};
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const contact = 'https://calendly.com/ngoumnaisteve/30';
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function openFixture(turns, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true });
  const submitted = [];
  await context.addInitScript(() => {
    window.__qaCopies = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__qaCopies.push(text); } } });
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && url.pathname === '/api/chat' && request.method() === 'POST') {
      const turn = turns[submitted.length]; submitted.push(request.postDataJSON()); report.locallyFulfilledPOSTs++;
      if (!turn) { await route.abort(); return; }
      const body = [{ t: 'delta', text: turn.reply }, { t: 'done', reply: turn.reply, events: turn.events || [] }].map(x => JSON.stringify(x)).join('\n') + '\n';
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body }); return;
    }
    // Clicking the real allowed URL is intercepted before any request reaches Calendly.
    if (url.href === contact && request.method() === 'GET') {
      report.localSchedulingClicks++;
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Offline scheduling destination fixture</title><p>No provider was contacted.</p>' }); return;
    }
    if (url.origin !== origin || request.method() !== 'GET' || url.pathname.startsWith('/api/')) {
      report.blocked.push({ method: request.method(), url: url.origin + url.pathname }); await route.abort(); return;
    }
    try {
      const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(root + '/') || !mime[extname(path)]) throw new Error('Not a public fixture asset');
      await route.fulfill({ status: 200, contentType: mime[extname(path)], body: await readFile(path) });
    } catch { await route.fulfill({ status: 404, body: '' }); }
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('#mcAgentLauncher').click();
  for (let i = 0; i < turns.length; i++) {
    await page.locator('#mcAgentInput').fill(turns[i].user);
    await page.locator('#mcAgentSend').click();
    await page.waitForFunction(n => { try { return JSON.parse(sessionStorage.getItem('mc_sales_desk_v3')).turns.length === n; } catch { return false; } }, (i + 1) * 2);
  }
  return { context, page, submitted };
}

function markdownTables(text) {
  const lines = text.split('\n'), result = [];
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim().replace(/\*\*/g, ''));
  for (let i = 0; i + 1 < lines.length; i++) if (/^\|/.test(lines[i]) && /^\|[-:|\s]+\|$/.test(lines[i + 1])) {
    const header = cells(lines[i]), rows = []; i++;
    while (i + 1 < lines.length && /^\|/.test(lines[i + 1])) rows.push(cells(lines[++i]));
    result.push({ header, rows });
  }
  return result;
}

try {
  for (const id of ['S3', 'S5', 'S7']) for (const width of [320, 390, 1440]) {
    const thread = actual.threads.find(t => t.id === id), { context, page } = await openFixture(thread.turns, width);
    try {
      const bubbles = page.locator('.mc-agent-msg.agent[data-reply]');
      const expectedTables = thread.turns.flatMap(t => markdownTables(t.reply));
      const tables = await bubbles.locator('table').evaluateAll(elements => elements.map(table => ({
        header: [...table.querySelectorAll('thead th')].map(th => th.textContent),
        scopes: [...table.querySelectorAll('thead th')].map(th => th.scope),
        rows: [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent)),
      })));
      check(`${id}/${width}: actual Markdown tables retain every header/cell`, JSON.stringify(tables.map(({ header, rows }) => ({ header, rows }))) === JSON.stringify(expectedTables), { tables });
      check(`${id}/${width}: semantic column headers`, tables.length > 0 && tables.every(t => t.scopes.every(scope => scope === 'col')));
      const sizes = await page.evaluate(() => {
        const panel = document.getElementById('mcAgentPanel'), log = document.getElementById('mcAgentMessages'), box = panel.getBoundingClientRect();
        return { pageWidth: document.documentElement.scrollWidth, width: innerWidth, panel: { left: box.left, right: box.right }, log: { width: log.clientWidth, scroll: log.scrollWidth }, wraps: [...document.querySelectorAll('.mc-agent-table-wrap')].map(w => ({ width: w.clientWidth, scroll: w.scrollWidth, role: w.getAttribute('role'), label: w.getAttribute('aria-label'), tabIndex: w.tabIndex, overflowX: getComputedStyle(w).overflowX })) };
      });
      check(`${id}/${width}: tables stay inside page/panel/log`, sizes.pageWidth <= width + 1 && sizes.panel.left >= 0 && sizes.panel.right <= width + 1 && sizes.log.scroll <= sizes.log.width + 1, sizes);
      check(`${id}/${width}: table overflow has a named keyboard-focusable region`, sizes.wraps.every(w => w.role === 'region' && w.label && w.tabIndex === 0 && w.overflowX === 'auto'));
      const wrap = page.locator('.mc-agent-table-wrap').last(); await wrap.scrollIntoViewIfNeeded();
      const movement = await wrap.evaluate(el => { const before = el.scrollLeft; el.scrollLeft = el.scrollWidth; return { before, after: el.scrollLeft, overflow: el.scrollWidth > el.clientWidth }; });
      check(`${id}/${width}: horizontal table content can be reached locally`, !movement.overflow || movement.after > movement.before, movement);
      await wrap.evaluate(el => { el.scrollLeft = 0; });
      if (width === 390 || id === 'S7' && width === 320) {
        const shot = `${prefix}-${id}-${width}.png`; await page.screenshot({ path: shot }); report.screenshots.push(shot);
      }
      const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('mc_sales_desk_v3')));
      check(`${id}/${width}: original raw replies and events preserved`, thread.turns.every((t, i) => saved.turns[i * 2 + 1].content === t.reply && JSON.stringify(saved.turns[i * 2 + 1].events || []) === JSON.stringify(t.events || [])));
      if (width === 390) {
        await bubbles.last().locator('.mc-agent-copy').click();
        check(`${id}: Copy returns original Markdown, not DOM presentation`, await page.evaluate(() => window.__qaCopies.at(-1)) === thread.turns.at(-1).reply);
        const downloadEvent = page.waitForEvent('download'); await page.locator('#mcAgentSave').click(); const download = await downloadEvent;
        const path = `${prefix}-${id}-saved.txt`; await download.saveAs(path); const exported = await readFile(path, 'utf8');
        check(`${id}: Save includes every original answer unchanged`, thread.turns.every(t => exported.includes(t.reply)));
      }
      report.cases.push({ id, width, tables: tables.length, source: 'actual saved replies/events', horizontalRegions: sizes.wraps.length });
    } finally { await context.close(); }
  }

  const s4 = actual.threads.find(t => t.id === 'S4'), s4Fixture = await openFixture(s4.turns, 390);
  try {
    const bubble = s4Fixture.page.locator('.mc-agent-msg.agent[data-reply]').last(), link = bubble.locator(`a[href="${contact}"]`);
    check('Actual S4 terminal-period URL becomes one exact scheduling link', await link.count() === 1 && await link.getAttribute('target') === '_blank' && /noopener/.test(await link.getAttribute('rel')));
    check('Actual S4 punctuation stays outside URL', (await bubble.innerText()).includes(contact + '.'));
    const popupEvent = s4Fixture.context.waitForEvent('page'); await link.click(); const popup = await popupEvent; await popup.waitForLoadState('domcontentloaded');
    check('Explicit scheduling click uses fixed destination with no opener', popup.url() === contact && await popup.evaluate(() => opener === null));
    await popup.close();
  } finally { await s4Fixture.context.close(); }

  const safeText = `Plain: ${contact}.\nMarkdown: [Choose a time](${contact})\nParentheses: (${contact}),\nExclamation: ${contact}!`;
  const safeFixture = await openFixture([{ user: 'QA local safe-link fixture', reply: safeText }], 390);
  try {
    const bubble = safeFixture.page.locator('.mc-agent-msg.agent[data-reply]').last();
    const links = await bubble.locator('a').evaluateAll(elements => elements.map(a => ({ href: a.href, target: a.target, rel: a.rel })));
    check('Plain, Markdown and terminal punctuation keep only fixed scheduling route', links.length === 4 && links.every(a => a.href === contact && a.target === '_blank' && a.rel.includes('noopener')), links);
  } finally { await safeFixture.context.close(); }

  const unsafeText = [
    '[External](https://evil.invalid/path)', 'https://calendly.com/someone-else/30',
    `[Query](${contact}?token=private)`, `[Fragment](${contact}#extra)`,
    '[Credentials](https://user:pass@calendly.com/ngoumnaisteve/30)',
    '[Script](javascript:alert(1))', '<img src=x onerror="window.__qaInjected=true">',
    '<a href="https://evil.invalid">HTML link</a>',
    'https://machinesandcloud.com/api/client?k=private', 'https://machinesandcloud.com/desk?c=private&k=secret',
    '[Lookalike](https://calendly.com.evil.invalid/ngoumnaisteve/30)',
    '[Wrong scheme](http://calendly.com/ngoumnaisteve/30)',
  ].join('\n');
  const unsafeFixture = await openFixture([{ user: 'QA local unsafe-link fixture', reply: unsafeText }], 390);
  try {
    const bubble = unsafeFixture.page.locator('.mc-agent-msg.agent[data-reply]').last();
    check('Unapproved external/query/credential/script/HTML targets stay non-actionable text', await bubble.locator('a,img,script,iframe').count() === 0 && await unsafeFixture.page.evaluate(() => !window.__qaInjected));
    check('Rejected link text remains available for Copy/Save', await bubble.getAttribute('data-reply') === unsafeText);
  } finally { await unsafeFixture.context.close(); }

  check('No browser JavaScript errors', report.browserErrors.length === 0, report.browserErrors);
  const after = Object.fromEntries(await Promise.all(sourceFiles.map(async p => [p, hash(await readFile(p))])));
  report.sourceAfter = after; check('Frozen frontend stays stable', JSON.stringify(source) === JSON.stringify(after));
  check('Original actual-model result remains immutable', hash(await readFile(actualPath)) === report.actualOutput.sha256);
} finally {
  await browser.close(); report.finishedAt = new Date().toISOString();
  report.summary = { checks: report.checks.length, passed: report.checks.filter(c => c.pass).length, failed: report.checks.filter(c => !c.pass).length };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ evidence: output, summary: report.summary, returns: report.checks.filter(c => !c.pass), actualModelRequests: 0, actualExternalRequests: 0 }, null, 2));
  if (report.summary.failed) process.exitCode = 1;
}
