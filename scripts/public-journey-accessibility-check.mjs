// Public page entry and keyboard checks. All browser routes are fulfilled locally or aborted.
// No server, account, environment file, model, form submission or external page is used.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('../', import.meta.url).pathname);
const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const output = resolve(root, option('--output', 'scratchpad/public-journey-accessibility.json'));
const playwrightPath = option('--playwright', '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(playwrightPath));
const hash = value => createHash('sha256').update(value).digest('hex');
const htmlFiles = readdirSync(root).filter(name => name.endsWith('.html')).sort();
const tracked = [...htmlFiles, 'scripts/public-journey-accessibility-check.mjs', 'styles.css', 'site-refresh.css', 'script.js', 'agent-widget.js'];
const hashes = () => Object.fromEntries(tracked.map(name => [name, hash(readFileSync(resolve(root, name)))]));
const report = { at: new Date().toISOString(), sourceBefore: hashes(), checks: [], blocked: [], pageErrors: [], screenshots: [], completedJourneys: [], actualExternalRequests: 0, accountProviderModelRequests: 0 };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
mkdirSync(resolve(output, '..'), { recursive: true });

for (const name of htmlFiles) {
  const html = readFileSync(resolve(root, name), 'utf8');
  if (['onboard.html', 'desk.html', 'admin.html'].includes(name) || !html.includes('id="navbar"')) continue;
  const mains = [...html.matchAll(/<main\b([^>]*)>/g)];
  check(`${name}: one focusable main destination and a native skip link`, mains.length === 1 && /\bid="main"/.test(mains[0][1]) && /\btabindex="-1"/.test(mains[0][1]) && /<a\b[^>]*class="site-skip"[^>]*href="#main"[^>]*>Skip to content<\/a>/.test(html));
  check(`${name}: repeated site navigation and footer stay outside main`, html.indexOf('id="navbar"') < html.indexOf('<main') && html.indexOf('</main>') < html.indexOf('<footer'));
  check(`${name}: public entry keeps the established light brand`, /<body\b[^>]*class="[^"]*\btheme-light\b/.test(html));
  const shell=html.slice(0,html.indexOf('<main'))+html.slice(html.indexOf('</main>')+7);
  check(`${name}: light navigation and footer use the dark-wordmark asset`, !/<img\b[^>]*src=["']assets\/logo\.png["']/.test(shell));
}

const base = 'http://127.0.0.1:8899';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND'] });
const cases = [
  ['houston.html', 320, true], ['houston.html', 390, false],
  ['industry-home-services.html', 390, true], ['industry-home-services.html', 1440, false],
  ['privacy-policy.html', 320, true], ['privacy-policy.html', 1440, false],
  ['index.html', 390, true], ['about.html', 1440, true],
  ['insights.html', 1440, true], ['thank-you.html', 320, true], ['404.html', 390, false],
  ['austin.html', 390, true], ['agentic-ai-vs-rpa.html', 1440, false],
  ['priority-construction-progress-monitoring-from-site-imagery.html', 390, true],
  ['ai-agent-development-services.html', 1440, true],
  ['austin.html',1440,false],['agentic-ai-vs-rpa.html',390,true],
  ['priority-construction-progress-monitoring-from-site-imagery.html',1440,false],['index.html',1440,true],['industry-financial.html',390,true]
];
try {
  for (const [name, width, javaScriptEnabled] of cases) {
    if(option('--case-filter','')&&!name.includes(option('--case-filter','')))continue;
    const label = `${name}/${width}/${javaScriptEnabled ? 'JS' : 'no-JS'}`;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', javaScriptEnabled, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base || request.method() !== 'GET' || url.pathname.startsWith('/api/')) {
        report.blocked.push({ case: label, method: request.method(), url: url.origin + url.pathname });
        return route.abort('blockedbyclient');
      }
      let file = resolve(root, decodeURIComponent(url.pathname).slice(1) || 'index.html');
      if (!file.startsWith(root + '/') || relative(root, file).split('/').some(part => part.startsWith('.'))) return route.fulfill({ status: 404, body: 'not found' });
      if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
      if (!existsSync(file) || statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
      const contentType = ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream';
      return route.fulfill({ status: 200, contentType, body: readFileSync(file) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push({ case: label, message: error.message }));
    await page.goto(base + '/' + name, { waitUntil: 'domcontentloaded' });
    const initial = await page.evaluate(() => {
      const hero = document.querySelector('.page-hero,.hero-industry'), actions = hero?.querySelector('.hero-actions');
      return { readingHero: !!hero, alignment: hero ? getComputedStyle(hero.querySelector('.page-hero-content,.hero-content')).textAlign : null,
        actionBottom: actions?.getBoundingClientRect().bottom ?? null, actionOpacity: actions ? getComputedStyle(actions).opacity : null };
    });
    if (initial.readingHero) check(`${label}: reading hierarchy is left aligned`, initial.alignment === 'left', initial);
    check(`${label}: first heading is visible without animation or a delayed reveal`,await page.locator('main h1').evaluate(el=>{const c=getComputedStyle(el);return c.opacity==='1'&&c.visibility==='visible'&&el.getBoundingClientRect().height>0;}));
    if (initial.actionBottom !== null) check(`${label}: primary actions are visible in the first viewport`, initial.actionBottom <= 900 && initial.actionOpacity === '1', initial);
    const metrics=await page.locator('body.theme-light:not(.site-refresh):not(.product-app) .hero-stat-value').evaluateAll(nodes=>nodes.map(n=>{const c=getComputedStyle(n);return{text:n.textContent.trim(),fontSize:parseFloat(c.fontSize),color:c.color,textFill:c.webkitTextFillColor,background:c.backgroundImage};}));
    if(metrics.length)check(`${label}: legacy hero context is compact plain text`,metrics.every(n=>n.fontSize<=24&&n.background==='none'&&n.textFill!=='rgba(0, 0, 0, 0)'),metrics);
    const workflowPanels=await page.locator('body.theme-light:not(.site-refresh):not(.product-app) .feature-motion-panel').evaluateAll(panels=>panels.filter(panel=>{const r=panel.getBoundingClientRect();return r.width>0&&r.height>0;}).map(panel=>{const nodes=[...panel.querySelectorAll('.feature-core,.feature-float,.feature-kpi-item')].map(n=>({text:n.textContent.trim(),rect:n.getBoundingClientRect().toJSON()})).filter(n=>n.rect.width>0&&n.rect.height>0);return{nodes,overlaps:nodes.flatMap((a,i)=>nodes.slice(i+1).filter(b=>Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1&&Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>1).map(b=>[a.text,b.text]))};}));
    if(workflowPanels.length){check(`${label}: illustrative workflow labels do not overlap`,workflowPanels.every(p=>p.nodes.length>0&&p.overlaps.length===0),workflowPanels);check(`${label}: illustrative workflow remains inside its section`,await page.locator('body.theme-light:not(.site-refresh):not(.product-app) .feature-motion-panel').evaluateAll(panels=>panels.filter(p=>p.getBoundingClientRect().height>0).every(p=>{const a=p.getBoundingClientRect(),b=p.closest('section').getBoundingClientRect();return a.top>=b.top-1&&a.bottom<=b.bottom+1;})));}
    const contrast=await page.evaluate(()=>{
      function rgba(value){const n=value.match(/[\d.]+/g)?.map(Number);return n&&n.length>=3?[n[0],n[1],n[2],n[3]??1]:null;}
      function over(a,b){return[a[0]*a[3]+b[0]*(1-a[3]),a[1]*a[3]+b[1]*(1-a[3]),a[2]*a[3]+b[2]*(1-a[3]),1];}
      function luminance(c){return c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);}
      function background(el){const chain=[];for(let n=el;n;n=n.parentElement){const c=getComputedStyle(n);if(c.backgroundImage!=='none')return null;chain.unshift(rgba(c.backgroundColor));}return chain.reduce((b,c)=>c?over(c,b):b,[255,255,255,1]);}
      const failures=[],qualified=[];let complex=0;const roots=[document.querySelector('main'),document.querySelector('footer'),document.querySelector('#navbar')].filter(Boolean);
      for(const root of roots){const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walk.nextNode()){
        const text=node.textContent.trim(),el=node.parentElement;if(!text||!el||el.closest('script,style,noscript,svg,.mc-agent,[aria-hidden="true"],[inert],:disabled,[aria-disabled="true"]'))continue;
        const rect=el.getBoundingClientRect(),c=getComputedStyle(el);if(rect.width<=1||rect.height<=1||c.visibility==='hidden'||c.display==='none')continue;
        let hidden=false;for(let n=el;n;n=n.parentElement)if(Number(getComputedStyle(n).opacity)===0)hidden=true;if(hidden)continue;
        const bg=background(el);if(!bg){complex++;continue;}const fg=rgba(c.color);if(!fg)continue;const painted=over(fg,bg),l1=luminance(painted),l2=luminance(bg),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),size=parseFloat(c.fontSize),weight=parseInt(c.fontWeight)||400,required=size>=24||size>=18.66&&weight>=700?3:4.5;
        const row={tag:el.tagName,className:el.className,text:text.slice(0,130),color:c.color,background:bg,ratio:Number(ratio.toFixed(3)),required,fontSize:size};qualified.push(row);
        if(ratio<required-.01||c.webkitTextFillColor==='rgba(0, 0, 0, 0)')failures.push(row);
      }}return{checked:qualified.length,complexSurfacesExcluded:complex,failures,scope:'Rendered text on resolved flat backgrounds in main, navigation and footer; image/gradient backgrounds, explicitly aria-hidden decoration and inactive controls excluded; no whole-page WCAG certification.'};
    });
    check(`${label}: rendered reading and navigation text has sufficient contrast on flat surfaces`,contrast.checked>0&&contrast.failures.length===0,contrast);
    const logos=await page.locator('#navbar img[src*="logo"],footer img[src*="logo"]').evaluateAll(nodes=>nodes.map(n=>({src:n.getAttribute('src'),loaded:n.complete&&n.naturalWidth>0,width:n.getBoundingClientRect().width})));
    check(`${label}: actual light-shell wordmarks are dark and loaded`,logos.length>=2&&logos.every(n=>n.src==='assets/logo-dark.png'&&n.loaded&&n.width>0),logos);
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => ({ text: document.activeElement.textContent.trim(), href: document.activeElement.getAttribute('href'), box: document.activeElement.getBoundingClientRect().toJSON() }));
    check(`${label}: first keyboard action exposes visible skip control`, first.href === '#main' && first.text === 'Skip to content' && first.box.y >= 0 && first.box.bottom <= 900, first);
    await page.keyboard.press('Enter');
    check(`${label}: native skip transfers keyboard focus to main`, await page.evaluate(() => document.activeElement === document.querySelector('main#main')));
    await page.keyboard.press('Tab');
    check(`${label}: next keyboard action stays in page content`, await page.evaluate(() => document.querySelector('main').contains(document.activeElement)));
    check(`${label}: single main excludes both navigation blocks`, await page.evaluate(() => document.querySelectorAll('main').length === 1 && !document.querySelector('main #navbar') && !document.querySelector('main footer')));
    check(`${label}: viewport has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (['houston.html', 'industry-home-services.html', 'austin.html', 'privacy-policy.html', 'agentic-ai-vs-rpa.html', 'priority-construction-progress-monitoring-from-site-imagery.html', 'ai-agent-development-services.html','industry-financial.html'].includes(name)) {
      const path = output.replace(/\.json$/, '') + '-' + name.replace('.html', '') + '-' + width + '.png';
      await page.screenshot({ path }); report.screenshots.push(path);
    }
    if (javaScriptEnabled && width < 1024) {
      await page.locator('#navToggle').click();
      check(`${label}: modal navigation disables the main content`, await page.locator('main').evaluate(element => element.inert));
      await page.keyboard.press('Escape');
      check(`${label}: closing navigation restores the main content`, !await page.locator('main').evaluate(element => element.inert));
    }
    report.completedJourneys.push(label);
    await context.close();
  }
} finally {
  await browser.close();
  report.sourceAfter = hashes(); report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  check('Source stays unchanged during the observed journeys', report.sourceStable);
  check('Public pages produce no browser exceptions', report.pageErrors.length === 0, report.pageErrors);
  check('No account, provider, model or form request is attempted', !report.blocked.some(row => row.method !== 'GET' || new URL(row.url).pathname.startsWith('/api/')), report.blocked.filter(row => row.method !== 'GET' || new URL(row.url).pathname.startsWith('/api/')));
  report.summary = { passed: report.checks.filter(row => row.pass).length, total: report.checks.length, failed: report.checks.filter(row => !row.pass).length, publicPages: htmlFiles.length, browserJourneys: report.completedJourneys.length, plannedBrowserJourneys: cases.length };
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ output, ...report.summary, sourceStable: report.sourceStable }));
assert.equal(report.summary.failed, 0, JSON.stringify(report.checks.filter(row => !row.pass)));
