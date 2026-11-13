// Website P2/P3 acceptance check (PRA-ACQ-05, 07, 08, 09, 11, 12, 13 and owner decisions B2, B11). Revision 2.
// Static checks read --root. Browser checks load --base (an already running 127.0.0.1 static server
// for the same tree) with every non-loopback request and every /api/ request aborted. No provider,
// model, microphone or network request leaves the machine. Exit code 1 if any check fails.
// Usage: node website-p2-check.mjs --root <tree> --base http://127.0.0.1:<port>/ --playwright <index.mjs>
//        --label a54|patched --out <dir> [--static-only] [--executable <chromium binary> | --channel chrome]
// Browser: --executable (or env CHROME_BIN) launches that binary, e.g. Playwright's bundled headless shell; otherwise --channel (default chrome).
import vm from 'node:vm';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2), opt = (n, d) => args.includes(n) ? args[args.indexOf(n) + 1] : d;
const root = resolve(opt('--root', '.')), label = opt('--label', 'run'), out = resolve(opt('--out', 'receipts'));
const staticOnly = args.includes('--static-only');
mkdirSync(join(out, 'screenshots'), { recursive: true });
const report = { label, root, startedAt: new Date().toISOString(), source: {}, checks: [], blockedRequests: [], apiRequests: [], pageErrors: [], screenshots: [] };
const check = (id, name, pass, detail) => { report.checks.push({ id, name, pass: !!pass, ...(detail === undefined ? {} : { detail }) }); };
const read = f => readFileSync(join(root, f), 'utf8');
const sha = s => createHash('sha256').update(s).digest('hex');

// ---------- the enterprise-consulting set (owner decision B11) ----------
const CONSULT = ['agentic-ai-consulting', 'agentic-ai-vs-rpa', 'ai-agent-development-services', 'ai-governance-consulting', 'ai-pilot-to-production-benchmark', 'approach', 'claims-intake-automation', 'copilot-studio-vs-custom-ai-agents', 'it-helpdesk-ai-agent', 'kyc-automation-ai-agent', 'openai-vs-anthropic-enterprise-agents', 'rag-vs-agentic-workflows', 'templates-checklists', 'wismo-automation', 'workflow-library', 'workflow-readiness'];
const IND = ['agriculture', 'b2b', 'construction', 'education', 'energy', 'financial', 'hospitality', 'insurance', 'logistics', 'manufacturing', 'media', 'public-sector', 'retail', 'saas', 'telecom'];
const html = readdirSync(root).filter(f => f.endsWith('.html')).sort();
const E = new Set([...CONSULT.map(c => c + '.html'), ...IND.map(i => `industry-${i}.html`), ...html.filter(f => /^(priority|insight|guide)-/.test(f)), 'guides.html', 'insights.html']);
for (const f of [...html, 'stories.js', 'practice-voice.js', 'script.js', 'styles.css', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'rss.xml']) report.source[f] = sha(readFileSync(join(root, f)));
const robots = s => (s.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '';
const kept = html.filter(f => !E.has(f));
const URL_ = f => 'https://www.machinesandcloud.com/' + f;

// S1 noindex on every enterprise page, files kept
const notNoindexed = [...E].filter(f => !existsSync(join(root, f)) || !/noindex/.test(robots(read(f))));
check('S1', `all ${E.size} enterprise-consulting pages exist and carry robots noindex`, E.size === 108 && notNoindexed.length === 0, { count: E.size, missing: notNoindexed.length, sample: notNoindexed.slice(0, 5) });
// S2 sitemap: no enterprise URL; every indexable page is listed
const sm = read('sitemap.xml'), smLocs = [...sm.matchAll(/<loc>https:\/\/www\.machinesandcloud\.com\/([^<]*)<\/loc>/g)].map(m => m[1] || 'index.html');
const indexable = html.filter(f => !/noindex/.test(robots(read(f))));
check('S2', 'sitemap lists no enterprise page and every indexable page', smLocs.every(f => !E.has(f)) && indexable.every(f => smLocs.includes(f)), { sitemapEnterprise: smLocs.filter(f => E.has(f)).length, indexableMissing: indexable.filter(f => !smLocs.includes(f)) });
// S3 llms.txt, llms-full.txt and rss.xml advertise no enterprise page
const feeds = Object.fromEntries(['llms.txt', 'llms-full.txt', 'rss.xml'].map(p => [p, [...E].filter(f => read(p).includes(URL_(f))).length]));
check('S3', 'llms.txt, llms-full.txt and rss.xml list no enterprise page', Object.values(feeds).every(n => n === 0), feeds);
// S4 no kept page (incl. 404, footers, Houston neighbourhoods, cities) links to an enterprise page
const linking = {};
for (const f of kept) { const hits = [...read(f).matchAll(/href="([^"#?]+)/g)].map(m => m[1]).filter(h => E.has(h)); if (hits.length) linking[f] = [...new Set(hits)]; }
check('S4', 'no non-enterprise page links to an enterprise page (footer, 404, nav, related cards)', Object.keys(linking).length === 0, { pages: Object.keys(linking).length, sample: Object.entries(linking).slice(0, 4) });
// S5 kept pages' JSON-LD never references an enterprise page
const ld = kept.filter(f => [...read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].some(m => [...E].some(e => m[1].includes(URL_(e)))));
check('S5', 'JSON-LD on kept pages references no enterprise page', ld.length === 0, ld);
// S6 one footer everywhere, with Customer Care texting, without Guides/Insights
const footers = html.map(f => [f, (read(f).match(/<nav class="footer-simple-links" aria-label="More">[\s\S]*?<\/nav>/) || [])[0]]).filter(([, n]) => n);
const variants = new Set(footers.map(([, n]) => n));
check('S6', 'every footer-simple page has the same footer links, including Customer Care texting and no Guides/Insights', footers.length === 179 && variants.size === 1 && footers.every(([, n]) => n.includes('>Customer Care texting<') && !/guides\.html|insights\.html/.test(n)), { pages: footers.length, variants: variants.size, missingTexting: footers.filter(([, n]) => !n.includes('Customer Care texting')).map(([f]) => f) });
// S7 every navbar offers Connections
const navs = html.map(f => [f, (read(f).match(/<ul class="navbar-links">[\s\S]*?<\/ul>/) || [])[0]]).filter(([, n]) => n);
const noConn = navs.filter(([, n]) => !/href="[^"]*#connections"/.test(n)).map(([f]) => f);
check('S7', 'every navbar includes Connections', noConn.length === 0, { navs: navs.length, without: noConn.length, sample: noConn.slice(0, 4) });
// S8 canonical / og:url consistent on every non-noindex page and on the enterprise pages (unchanged self canonicals)
const canonBad = [...indexable, ...E].filter(f => { const s = read(f), c = (s.match(/rel="canonical" href="([^"]+)"/) || [])[1], og = (s.match(/property="og:url" content="([^"]+)"/) || [])[1]; const exp = URL_(f === 'index.html' ? '' : f); return c !== exp || (og && og !== exp); });
check('S8', 'canonical and og:url stay self-referencing on indexable and enterprise pages', canonBad.length === 0, canonBad.slice(0, 5));
// S9 no em dash in visible public copy (text, title, meta description, alt/aria); app pages reported separately
const visible = s => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ').replace(/<meta (?!name="description")[^>]*>/g, ' ').replace(/<link[^>]*>/g, ' ');
const appPages = new Set(['desk.html', 'admin.html', 'onboard.html']);
const dashPages = html.filter(f => !appPages.has(f) && visible(read(f)).includes('—'));
const storyDash = (read('stories.js').match(/"[^"\n]*—[^"\n]*"|'[^'\n]*—[^'\n]*'/g) || []);
check('S9', 'no em dash in visible copy of public pages or demo strings (stories.js)', dashPages.length === 0 && storyDash.length === 0, { dashPages, storyDash, appPagesWithDash: html.filter(f => appPages.has(f) && visible(read(f)).includes('—')) });
// S10 unsourced statistic removed
const statPages = html.filter(f => /majority of their time|5\+ systems/.test(read(f)));
check('S10', 'unsourced KYC statistic is gone', statPages.length === 0, statPages);
// S11 What-to-compare sentences: acronyms in capitals, no less/fewer phrasing
const compare = html.filter(f => f.startsWith('priority-')).flatMap(f => [...read(f).matchAll(/Compare ([^<"]+?) with the current process/g)].map(m => [f, m[1]]));
const badCompare = compare.filter(([, t]) => /\b(oee|otif|sla|ed los|revpar|aht|arpu|csat)\b/.test(t) || /\b(less|fewer|lower|smaller|faster|clearer)\b/.test(t));
check('S11', 'priority "What to compare" sentences keep acronym casing and grammar', compare.length >= 65 && badCompare.length === 0, { sentences: compare.length, bad: badCompare.slice(0, 5) });
// S12 homepage shows each price once
const home = visible(read('index.html'));
const priceCounts = { '$99': home.split('$99').length - 1, '$249': home.split('$249').length - 1 };
check('S12', 'homepage shows $99 and $249 exactly once each', priceCounts['$99'] === 1 && priceCounts['$249'] === 1, priceCounts);
// S13 the free website chat card names the per-shop daily allowance (owner decision B2) and the number matches the code
const webLimit = Number((read('netlify/functions/lib/self-service-ai.mjs').match(/WEB_LIMIT = (\d+)/) || [])[1]);
const offer = (read('index.html').match(/<article class="site-plan[^"]*site-web-offer[\s\S]*?<\/article>/) || [''])[0];
const offerN = Number((offer.match(/up to (\d+) AI replies a day/) || [])[1]);
check('S13', 'website chat offer names the daily allowance ("up to N AI replies a day", N = per-shop WEB_LIMIT) and no charge without agreement', offerN === 50 && offerN === webLimit && /nothing is charged without your agreement/i.test(offer), { offerN, webLimit });
// S14 no robots-noindex page is listed in sitemap.xml (catches a kept page noindexed but left in the sitemap)
const noindexInSitemap = smLocs.filter(f => existsSync(join(root, f)) && /noindex/.test(robots(read(f))));
check('S14', 'sitemap.xml lists no robots-noindex page', noindexInSitemap.length === 0, noindexInSitemap);
// S15 the pages B11 keeps are explicitly indexable and in the sitemap (core, legal, home-service industries, every city page)
const KEEP = ['index.html', 'about.html', 'houston.html', 'industries.html', 'locations.html', 'industry-home-services.html', 'industry-healthcare.html', 'industry-legal.html', 'industry-automotive.html', 'industry-real-estate.html', 'privacy-policy.html', 'terms-of-service.html', 'sms-terms.html'];
// houston-downtown/-galleria/-midtown were already noindex on a54 (pre-existing, QA N6) and are outside the kept set.
const PRE_NOINDEX = new Set(['houston-downtown.html', 'houston-galleria.html', 'houston-midtown.html']);
const cities = html.filter(f => !PRE_NOINDEX.has(f) && /<h1[^>]*>Stay on the job\. Keep /.test(read(f)));
const keepBad = [...KEEP, ...cities].filter(f => !existsSync(join(root, f)) || /noindex/.test(robots(read(f))) || !smLocs.includes(f));
check('S15', `kept set (${KEEP.length} named pages + ${cities.length} city pages) is indexable and in the sitemap`, cities.length >= 53 && keepBad.length === 0, { cities: cities.length, bad: keepBad });
// S16 every JSON-LD block on every page parses
const ldErrors = [];
for (const f of html) for (const m of read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch (e) { ldErrors.push(`${f}: ${String(e.message).slice(0, 80)}`); } }
check('S16', 'every application/ld+json block on every page is valid JSON', ldErrors.length === 0, ldErrors.slice(0, 5));
// S17 practice-voice.js error mapping, unit-tested with injected dependencies (no device, no network): the started flag and the !mic guard
{
  const src = read('practice-voice.js'), named = n => Object.assign(new Error(n), { name: n });
  const track = { stop() {} }, stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const run = async (over, after) => {
    const sdks = [];
    class FakeVapi { constructor() { this.h = {}; sdks.push(this); } on(e, f) { this.h[e] = f; } emit(e, d) { this.h[e]?.(d); } reconnect() { return new Promise(() => {}); } send() {} stop() {} }
    const window = { addEventListener() {}, isSecureContext: true, setTimeout: () => 0, clearTimeout() {} };
    window.__MC_DEMO_VOICE_TEST_DEPS__ = { getUserMedia: async () => stream, loadSDK: async () => ({ default: FakeVapi }), fetch: async () => ({ ok: true, status: 200, json: async () => ({ id: 'c1', webCallUrl: 'https://x.invalid/r' }) }), setTimeout: () => 0, clearTimeout() {}, ...over };
    vm.runInNewContext(src, { window, location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1' }, navigator: {}, Promise, Object, JSON, Error, AbortController, console });
    const codes = []; window.MCDemoVoice.start({ persona: 'katy-pipeworks', language: 'en', onError: e => codes.push(e.code) });
    await new Promise(r => setTimeout(r, 20)); if (after) { after(sdks); await new Promise(r => setTimeout(r, 5)); }
    return codes[0];
  };
  const cases = [
    ['getUserMedia NotSupportedError', { getUserMedia: async () => { throw named('NotSupportedError'); } }, null, 'not_supported'],
    ['getUserMedia OverconstrainedError', { getUserMedia: async () => { throw named('OverconstrainedError'); } }, null, 'not_supported'],
    ['getUserMedia TypeError', { getUserMedia: async () => { throw new TypeError('x'); } }, null, 'not_supported'],
    ['getUserMedia AbortError', { getUserMedia: async () => { throw named('AbortError'); } }, null, 'microphone_unavailable'],
    ['getUserMedia NotAllowedError', { getUserMedia: async () => { throw named('NotAllowedError'); } }, null, 'microphone_denied'],
    ['SDK import TypeError after the mic exists (!mic guard)', { loadSDK: async () => { throw new TypeError('Failed to fetch dynamically imported module'); } }, null, 'connect_failed'],
    ['fetch TypeError after the mic exists (!mic guard)', { fetch: async () => { throw new TypeError('Failed to fetch'); } }, null, 'connect_failed'],
    ['fetch AbortError after the mic exists', { fetch: async () => { throw named('AbortError'); } }, null, 'timeout'],
    ['SDK error before call-start', {}, i => i[0].emit('error'), 'connect_failed'],
    ['SDK error after call-start (started flag)', {}, i => { i[0].emit('call-start'); i[0].emit('error'); }, 'connection_failed'],
  ];
  const results = [];
  for (const [name, over, after, want] of cases) { let got; try { got = await run(over, after); } catch (e) { got = 'threw ' + e.message; } results.push({ name, got, want }); }
  check('S17', 'practice-voice.js maps capture, connect and post-start errors correctly (10 injected cases)', results.every(r => r.got === r.want), results.filter(r => r.got !== r.want));
}

// ---------- browser ----------
if (!staticOnly) {
  const base = new URL(opt('--base'));
  if (!(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port)) throw new Error('--base must be http://127.0.0.1:<port>/');
  const { chromium } = await import(pathToFileURL(resolve(opt('--playwright'))));
  const executable = opt('--executable', process.env.CHROME_BIN);
  const browser = await chromium.launch({ headless: true, ...(executable ? { executablePath: executable } : { channel: opt('--channel', 'chrome') }) });
  report.browser = executable ? { executablePath: executable } : { channel: opt('--channel', 'chrome') };
  const fresh = async (width, init, js = true) => {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, serviceWorkers: 'block', reducedMotion: 'reduce', javaScriptEnabled: js });
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.pathname.startsWith('/api/') && u.pathname !== '/api/channel-availability') report.apiRequests.push(u.pathname); // RC2 harness: the homepage's channel-availability read (in 43ee2f2c) is not a voice call
      if (u.origin !== base.origin || u.pathname.startsWith('/api/') || route.request().method() !== 'GET') { report.blockedRequests.push(route.request().method() + ' ' + u.origin + u.pathname); return route.abort(); }
      return route.continue();
    });
    if (init) await context.addInitScript(init.fn, init.arg);
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror', e => report.pageErrors.push(String(e.message || e)));
    return { context, page };
  };
  const shot = async (page, name, full = false) => { const p = join(out, 'screenshots', `${label}-${name}.png`); await page.screenshot({ path: p, fullPage: full }); report.screenshots.push(p); };
  const pricesVisible = page => page.evaluate(() => ['$99', '$249'].map(t => [...document.querySelectorAll('#plans .site-price strong')].find(e => e.textContent.trim() === t)).map(e => !!e && !!e.closest('details')?.open && e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && e.getBoundingClientRect().height > 0));

  for (const width of [390, 1440]) {
    // B1 direct #plans
    { const { context, page } = await fresh(width); await page.goto(new URL('index.html#plans', base).href); await page.waitForTimeout(400);
      const v = await pricesVisible(page); check(`B1-${width}`, `${width}: loading index.html#plans shows both prices`, v.every(Boolean), v); await shot(page, `${width}-plans-direct`); await context.close(); }
    // B2 click the nav Plans link from the top; B8 close it, then click Plans again while the hash is already #plans
    { const { context, page } = await fresh(width); await page.goto(new URL('index.html', base).href);
      if (width < 900) await page.locator('#navToggle').click();
      await page.locator("#navMenu a[href$='#plans']").first().click(); await page.waitForTimeout(800);
      let v = await pricesVisible(page); check(`B2-${width}`, `${width}: clicking nav Plans shows both prices`, v.every(Boolean), v); await shot(page, `${width}-plans-nav`);
      await page.evaluate(() => { document.querySelector('details.site-future-plans').open = false; window.scrollTo(0, 0); });
      const hashBefore = await page.evaluate(() => location.hash);
      if (width < 900) await page.locator('#navToggle').click();
      await page.locator("#navMenu a[href$='#plans']").first().click(); await page.waitForTimeout(800);
      v = await pricesVisible(page); check(`B8-${width}`, `${width}: re-clicking Plans when the hash is already #plans reopens the closed disclosure`, hashBefore === '#plans' && v.every(Boolean), { hashBefore, v });
      await context.close(); }
    // B9 no JavaScript: index.html#plans shows both prices (details is open in the HTML)
    { const { context, page } = await fresh(width, null, false); await page.goto(new URL('index.html#plans', base).href); await page.waitForTimeout(300);
      const v = await pricesVisible(page); check(`B9-${width}`, `${width}: with JavaScript off, index.html#plans shows both prices`, v.every(Boolean), v); await shot(page, `${width}-plans-nojs`); await context.close(); }
    // B10 with JavaScript, a plain homepage load keeps the disclosure collapsed (layout unchanged for visitors who did not ask for Plans)
    { const { context, page } = await fresh(width); await page.goto(new URL('index.html', base).href); await page.waitForTimeout(300);
      const open = await page.evaluate(() => document.querySelector('details.site-future-plans').open); check(`B10-${width}`, `${width}: plain homepage load keeps plan options collapsed`, open === false, { open }); await context.close(); }
    // B11 Plans from another page (about.html) lands with both prices visible
    { const { context, page } = await fresh(width); await page.goto(new URL('about.html', base).href);
      if (width < 900) await page.locator('#navToggle').click();
      await Promise.all([page.waitForURL(/index\.html#plans$/), page.locator("#navMenu a[href$='#plans']").first().click()]); await page.waitForTimeout(600);
      const v = await pricesVisible(page); check(`B11-${width}`, `${width}: Plans from about.html shows both prices`, v.every(Boolean), v); await context.close(); }
    // B3/B4 voice when the browser cannot capture audio
    for (const [id, name] of [['B3', 'NotSupportedError'], ['B4', 'OverconstrainedError']]) {
      const before = report.apiRequests.length;
      const { context, page } = await fresh(width, { fn: n => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Not supported', n)); }, arg: name });
      await page.goto(new URL('index.html', base).href);
      await page.locator('[data-example="call"]').click(); await page.locator('#example-mode-live').click();
      await page.locator('#example-voice-start').scrollIntoViewIfNeeded(); await page.locator('#example-voice-start').click();
      await page.waitForFunction(() => !/Allow microphone|Connecting/.test(document.querySelector('#example-voice-status')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
      const r = await page.evaluate(() => ({ status: document.querySelector('#example-voice-status').textContent, focus: document.activeElement?.id || document.activeElement?.tagName }));
      const ok = /unavailable in this browser/.test(r.status) && !/ended/.test(r.status) && report.apiRequests.length === before && (id === 'B4' || r.focus === 'example-input');
      check(`${id}-${width}`, `${width}: getUserMedia ${name} says voice is unavailable here${id === 'B3' ? ', focuses the composer' : ''}, no API call`, ok, { ...r, apiCalls: report.apiRequests.length - before });
      if (id === 'B3') await shot(page, `${width}-voice-no-capture`);
      await context.close();
    }
    // B5 mic works but the call never starts (endpoint unreachable): no "connection ended"
    { const { context, page } = await fresh(width, { fn: () => { if (navigator.mediaDevices) { const t = { kind: 'audio', stop() {} }; navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [t], getAudioTracks: () => [t] }); } } });
      await page.goto(new URL('index.html', base).href);
      await page.locator('[data-example="call"]').click(); await page.locator('#example-mode-live').click();
      await page.locator('#example-voice-start').click();
      await page.waitForFunction(() => !/Allow microphone|Connecting/.test(document.querySelector('#example-voice-status')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
      const status = await page.locator('#example-voice-status').textContent();
      check(`B5-${width}`, `${width}: a call that never started does not say "connection ended"`, !/ended/i.test(status) && /could not connect|unavailable/i.test(status), status);
      await context.close(); }
    // B6 404 suggestions
    { const { context, page } = await fresh(width); await page.goto(new URL('404.html', base).href);
      const r = await page.evaluate(() => ({ text: document.querySelector('main').innerText, hrefs: [...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')) }));
      check(`B6-${width}`, `${width}: 404 suggests only home-service content`, !/Workflow blueprints|target metrics/.test(r.text) && r.hrefs.every(h => !E.has(h.split(/[#?]/)[0])), r.hrefs);
      await shot(page, `${width}-404`); await context.close(); }
    // B7 financial page fits the viewport
    { const { context, page } = await fresh(width); await page.goto(new URL('industry-financial.html', base).href);
      const over = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 0.5; }).map(e => e.tagName + '.' + (e.className?.baseVal ?? e.className) + ' r=' + Math.round(e.getBoundingClientRect().right)).slice(0, 8));
      check(`B7-${width}`, `${width}: industry-financial has no element wider than the viewport`, over.length === 0, over);
      const wf = page.locator('.workflow-animation').first(); if (await wf.count()) { await wf.scrollIntoViewIfNeeded(); await shot(page, `${width}-financial-workflow`); }
      await context.close(); }
    // Screens only: city related cards, industries hub, an enterprise page nav/footer
    for (const [path, name] of [['austin.html', 'austin'], ['industries.html', 'industries'], ['priority-healthcare-radiology-triage-and-worklist-prioritization.html', 'radiology']]) {
      const { context, page } = await fresh(width); await page.goto(new URL(path, base).href); await page.waitForTimeout(200);
      if (name === 'austin') { const g = page.locator('.card-link').last(); await g.scrollIntoViewIfNeeded(); }
      if (name === 'radiology' && width < 900) await page.locator('#navToggle').click();
      await shot(page, `${width}-${name}`); await context.close();
    }
  }
  await browser.close();
}
report.passed = report.checks.filter(c => c.pass).length; report.total = report.checks.length; report.finishedAt = new Date().toISOString();
report.offline = { blockedNonLoopback: report.blockedRequests.filter(r => !r.includes('127.0.0.1')).length, apiRequestsAborted: report.apiRequests.length };
writeFileSync(join(out, `${label}.json`), JSON.stringify(report, null, 1));
for (const c of report.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.id} ${c.name}`);
console.log(`${label}: ${report.passed}/${report.total}`);
process.exit(report.passed === report.total ? 0 : 1);
