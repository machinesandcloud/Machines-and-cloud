import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { at: new Date().toISOString(), scope: 'local design with actual Google web fonts; no API/submissions', checks: [], requests: [], issues: [] };
try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
 await page.route('**/*', async route => {
  const q=route.request(),u=new URL(q.url());
  if(q.method()==='GET'&&!u.pathname.startsWith('/api/')&&(u.origin==='http://127.0.0.1:8893'||(u.protocol==='https:'&&['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)))){report.requests.push(u.hostname);await route.continue();}
  else {report.issues.push({method:q.method(),hostname:u.hostname});await route.abort();}
 });
 await page.goto('http://127.0.0.1:8893/', { waitUntil: 'networkidle' });
 await page.evaluate(()=>document.fonts.ready);
 report.fonts=await page.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight})));
 assert.ok(report.fonts.some(f=>f.family==='Space Grotesk'&&f.status==='loaded'),'actual Space Grotesk must load');
 assert.ok(report.fonts.some(f=>f.family==='Inter'&&f.status==='loaded'),'actual Inter must load');
 for(const width of [1440,865,390,320]) {
  await page.setViewportSize({width,height:width<700?844:1000});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  const d=await page.evaluate(()=>{const r=document.querySelector('h1').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,heading:{left:r.left,right:r.right,bottom:r.bottom},font:getComputedStyle(document.querySelector('h1')).fontFamily};});
  assert.equal(d.overflow,false,'font-loaded page overflow');assert.ok(d.heading.left>=0&&d.heading.right<=width,'font-loaded heading fits');report.checks.push(d);
  if(width===1440||width===390)await page.screenshot({path:`scratchpad/site-font-loaded-${width}.png`});
 }
 assert.deepEqual(report.issues,[]);report.result='passed';
} catch(e){report.result='failed';report.error=e.message;process.exitCode=1;}
finally {await browser.close();writeFileSync('scratchpad/site-font-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,checks:report.checks.length,error:report.error,apiCalls:report.issues.length}));}
