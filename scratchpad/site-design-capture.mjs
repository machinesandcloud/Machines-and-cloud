// Read-only public marketing-site observation in fresh browser contexts.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
let pw;
try { pw = await import('playwright'); } catch {
  for (const bin of (process.env.PATH || '').split(delimiter)) {
    const file = resolve(bin, '../playwright/index.mjs');
    if (existsSync(file)) { pw = await import(pathToFileURL(file)); break; }
  }
}
if (!pw) throw new Error('Playwright tooling required');
const pricing = process.argv.includes('--pricing');
const out = pricing ? 'scratchpad/site-design-competitors/pricing' : 'scratchpad/site-design-competitors'; mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ channel: 'chrome', headless: true });
const rows = [];
try {
  const sites = pricing ? [['rosie','https://heyrosie.com/pricing'],['sameday','https://sameday.ai/pricing'],['goodcall','https://www.goodcall.com/pricing']] : [['rosie','https://heyrosie.com/'],['sameday','https://sameday.ai/'],['goodcall','https://www.goodcall.com/'],['jobber','https://www.getjobber.com/']];
  for (const [id, url] of sites) {
    const row = { id, requestedUrl: url, observedAt: new Date().toISOString(), views: [] };
    for (const [size, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(1800);
        await Promise.race([page.evaluate(() => document.fonts.ready), page.waitForTimeout(6000)]);
        const shot = `${out}/${id}-${size}.png`; await page.screenshot({ path: shot, fullPage: false });
        const full = `${out}/${id}-${size}-full.png`; await page.screenshot({ path: full, fullPage: true });
        const state = await page.evaluate(() => {
          const visible = e => { const r=e.getBoundingClientRect(), s=getComputedStyle(e); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
          const describe = e => { const s=getComputedStyle(e), r=e.getBoundingClientRect(); return { text:e.innerText.trim().slice(0,180), color:s.color, background:s.backgroundColor, font:s.fontFamily, fontSize:s.fontSize, weight:s.fontWeight, lineHeight:s.lineHeight, rect:{x:r.x,y:r.y,width:r.width,height:r.height} }; };
          const heading = [...document.querySelectorAll('h1')].filter(visible).map(describe);
          const controls = [...document.querySelectorAll('a,button')].filter(visible).filter(e=>e.getBoundingClientRect().top<innerHeight).map(e=>({...describe(e),tag:e.tagName,href:e.getAttribute('href'),label:e.getAttribute('aria-label'),expanded:e.getAttribute('aria-expanded')})).filter(x=>x.text||x.label).slice(0,35);
          return { title:document.title, finalUrl:location.href, width:innerWidth, scrollWidth:document.documentElement.scrollWidth, heading, controls };
        });
        row.views.push({ size, status:response?.status(), screenshot:shot, fullScreenshot:full, ...state });
        console.log(`${id} ${size}: ${response?.status()} ${state.title}`);
      } catch (error) { row.views.push({ size, error:String(error.message) }); console.log(`${id} ${size}: ${error.message}`); }
      finally { await context.close(); }
    }
    rows.push(row); writeFileSync(`${out}/observations.json`, JSON.stringify(rows, null, 2)+'\n');
  }
} finally { await browser.close(); }
