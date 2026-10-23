import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=process.cwd(),dir='/tmp/mc-launch-release-private',capture=resolve(dir,'capture');
const manifest=JSON.parse(readFileSync(resolve(dir,'capture-manifest.json')));
const report={at:new Date().toISOString(),commit:manifest.commit,deploy:manifest.deploy,scope:'Offline replay of the 24 captured unauthenticated production resources. No owner session, signup, saves or chat/model actions. assets/logo.png is an explicitly local supplementary fixture, not captured served proof. Google fonts are blocked; screenshots use local fallback fonts. The first fixture run used the wrong sign-in selector; its failure receipt is preserved separately.',checks:[],pageErrors:[],blockedFonts:[],unexpectedRequests:[],screenshots:[],physicalNetwork:0};
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(name,ok,detail)=>{report.checks.push({name,pass:!!ok,...(detail?{detail}:{})});};
const prior=readFileSync('scratchpad/campaign-correction-hosted-offline-review.mjs','utf8');
const parser=prior.match(/const canonicalParser = String.raw`([\s\S]*?)`;/)[1];
for(const a of manifest.assets){
 const bytes=readFileSync(resolve(capture,a.file));assert.equal(sha(bytes),a.sha256);assert.equal(sha(readFileSync(a.file)),a.approvedSHA256);
 if(a.file.endsWith('.html')){const result=JSON.parse(execFileSync('python3',['-c',parser,resolve(root,a.file),resolve(capture,a.file)],{encoding:'utf8'}));check(a.file+' matches source after enumerated Netlify transforms',result.equivalent,result);}
 else check(a.file+' is the exact accepted asset',a.exact);
}
const {chromium}=await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND']});
const sourceMap=new Map(manifest.assets.map(a=>[a.path,a]));
async function fresh(width,motion='reduce'){
 const context=await browser.newContext({viewport:{width,height:950},reducedMotion:motion,serviceWorkers:'block'});
 await context.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)){report.blockedFonts.push(u.origin+u.pathname);return route.abort();}if(r.method()==='GET'&&u.origin==='https://machinesandcloud.com'&&u.pathname==='/assets/logo.png')return route.fulfill({status:200,contentType:'image/png',body:readFileSync('assets/logo.png')});const a=sourceMap.get(u.pathname);if(r.method()==='GET'&&u.origin==='https://machinesandcloud.com'&&a)return route.fulfill({status:200,headers:{'Content-Type':a.contentType,...(a.headers.csp?{'Content-Security-Policy':a.headers.csp}:{})},body:readFileSync(resolve(capture,a.file))});report.unexpectedRequests.push({method:r.method(),url:u.origin+u.pathname});return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));return {context,page};
}
try{
 for(const width of[320,390,1440]){
  const {context,page}=await fresh(width);await page.goto('https://machinesandcloud.com/');await page.waitForTimeout(150);
  check(width+' homepage fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  check(width+' retains original first photo',await page.locator('[data-hero-stage] img:not([aria-hidden="true"])').getAttribute('data-photo')==='hvac');
  await page.locator('[data-hero-photo="1"]').click();await page.waitForFunction(()=>document.querySelector('[data-hero-photo="1"]').getAttribute('aria-pressed')==='true');
  check(width+' manual trade selector displays decoded plumbing photo',await page.locator('[data-hero-stage] img:not([aria-hidden="true"])').evaluate(i=>i.naturalWidth>0&&i.dataset.photo==='plumbing'));
  check(width+' displayed request follows trade',await page.locator('[data-hero-job]').innerText()==='Leaking kitchen sink');
  if(width<1000){await page.locator('#navToggle').click();await page.locator('#navMenu a[href="#pilot"]').click();await page.waitForTimeout(100);check(width+' menu setup action closes menu and reaches inquiry',await page.locator('#navMenu').getAttribute('aria-hidden')==='true'&&await page.locator('#pilot input').first().isVisible());}
  if(width===390||width===1440){await page.evaluate(()=>scrollTo(0,0));const path='scratchpad/launch-release-final-home-'+width+'.png';await page.screenshot({path});report.screenshots.push(path);}
  await page.goto('https://machinesandcloud.com/onboard');check(width+' onboarding keeps the heading word boundary',(await page.locator('.onboard-welcome h2').textContent()).replace(/\s+/g,' ').includes('that knows'));
  check(width+' onboarding fits viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.goto('https://machinesandcloud.com/desk');check(width+' unauthenticated workspace offers sign-in',await page.locator('#portalRecovery').isVisible()&&await page.locator('#portalRecovery a').getAttribute('href')==='/onboard?signin=1');
  await context.close();
 }
 const {context,page}=await fresh(1440,'no-preference');await page.goto('https://machinesandcloud.com/');await page.mouse.move(2,2);await page.waitForFunction(()=>document.querySelector('[data-hero-photo="1"]').getAttribute('aria-pressed')==='true',{timeout:11000});check('Normal motion advances after the unmodified dwell and fade',true);await page.locator('[data-hero-toggle]').click();const photo=await page.locator('[data-hero-stage] img:not([aria-hidden="true"])').getAttribute('data-photo');await page.mouse.move(2,2);await page.waitForTimeout(7300);check('Pause control holds the displayed photo',await page.locator('[data-hero-stage] img:not([aria-hidden="true"])').getAttribute('data-photo')===photo);await context.close();
}finally{await browser.close();report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length};writeFileSync('scratchpad/launch-release-captured-review.json',JSON.stringify(report,null,2)+'\n');}
assert.equal(report.summary.failed,0);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.unexpectedRequests,[]);console.log(JSON.stringify(report.summary));
