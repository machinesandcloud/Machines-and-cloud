import {readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const root='/tmp/mc-production-readiness-47e',capture=resolve(root,'scratchpad/readiness-public-captured'),base='https://machinesandcloud.com';
const out=resolve(root,'scratchpad/readiness-intake-focus-final.json');assert(!existsSync(out));
const result={at:new Date().toISOString(),scope:'Offline browser review of freshly captured public HTML/JS, local candidate assets (including scroll-margin correction); anonymous API state intercepted. No live browser/API/signup/provider effects.',checks:[],blockedExternal:[],blockedMutations:[],screenshots:[],pageErrors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const check=(name,ok,detail)=>{result.checks.push({name,ok:!!ok,...(detail===undefined?{}:{detail})});};
const shot=async(page,name)=>{const file='scratchpad/readiness-intake-focus-final-'+name+'.png';await page.screenshot({path:resolve(root,file),fullPage:false});result.screenshots.push(file);};
try{
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});context.setDefaultTimeout(5000);
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin!==base){result.blockedExternal.push({origin:u.origin,path:u.pathname});return route.abort('blockedbyclient');}
   if(!['GET','HEAD'].includes(req.method())){result.blockedMutations.push({method:req.method(),path:u.pathname});return route.fulfill({status:503,contentType:'application/json',body:'{"error":"review_no_mutations"}'});}
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:401,contentType:'application/json',body:'{"error":"sign_in_required","message":"Sign in to continue."}'});
   let name=u.pathname==='/'?'index.html':decodeURIComponent(u.pathname).replace(/^\/+/, '');
   if(name.split('/').some(part=>part.startsWith('.'))||/^(scratchpad|product|scripts|netlify|node_modules)\//.test(name))return route.abort('blockedbyclient');
   if(!extname(name))name+='.html';
   const fresh=resolve(capture,name),local=resolve(root,name);const file=existsSync(fresh)?fresh:local;
   if(!file.startsWith(root+'/')||!existsSync(file)||statSync(file).isDirectory())return route.fulfill({status:404,body:'not available in offline capture'});
   return route.fulfill({status:200,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream',body:readFileSync(file)});
  });
  const page=await context.newPage();page.on('pageerror',e=>result.pageErrors.push({width,message:e.message}));
  await page.goto(base+'/');
  check('Homepage fits viewport '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  if(width<1000){await page.locator('#navToggle').click();check('Mobile menu opens with expanded state '+width,await page.locator('#navToggle').getAttribute('aria-expanded')==='true');await page.keyboard.press('Escape');check('Escape closes menu and restores toggle focus '+width,await page.locator('#navToggle').getAttribute('aria-expanded')==='false'&&await page.locator('#navToggle').evaluate(e=>e===document.activeElement));}
  await page.locator('.site-actions a[href="#pilot"]').click();
  check('Primary start action reaches visible preliminary form '+width,await page.locator('#intake-name').isVisible()&&await page.locator('#signup-intake').evaluate(e=>{const r=e.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;}));
  await page.locator('#intake-submit').click();await page.waitForTimeout(300);const focusGeometry=await page.locator('#intake-name').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,active:e===document.activeElement,headerBottom:document.querySelector('.navbar').getBoundingClientRect().bottom,scrollY:scrollY}));(result.focusGeometries||(result.focusGeometries=[])).push({width,...focusGeometry});check('First invalid field is visible below fixed header '+width,focusGeometry.active&&focusGeometry.top>focusGeometry.headerBottom+8&&focusGeometry.bottom<900,focusGeometry);
  check('Blank preliminary form focuses missing name without submission '+width,await page.locator('#intake-name').evaluate(e=>e===document.activeElement&&!e.validity.valid));
  check('Marketing opt-in starts unchecked '+width,!await page.locator('#intake-marketing').isChecked());
  await shot(page,'intake-'+width);
  const support=await page.locator('.footer-simple-contact a[href^="mailto:"]').first().getAttribute('href');result.publishedSupport=support;
  await page.goto(base+'/onboard');await page.locator('#access-email').waitFor({state:'visible'});
  check('Setup exposes a usable sign-in email field '+width,await page.locator('#access-email').isEditable());
  check('Setup fits viewport '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await shot(page,'signup-'+width);
  await page.goto(base+'/desk');
  check('Workspace has no horizontal overflow at anonymous entry '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await shot(page,'workspace-entry-'+width);
  await page.goto(base+'/admin');
  check('Admin gate has no horizontal overflow '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await shot(page,'admin-entry-'+width);
  await context.close();
 }
 check('No attempted mutating request from entry/validation checks',result.blockedMutations.length===0,result.blockedMutations);
 check('No script exceptions across captured public entry pages',result.pageErrors.length===0,result.pageErrors);
}catch(e){result.error={name:e.name,message:e.message};process.exitCode=1;}
finally{await browser.close();result.passed=result.checks.filter(x=>x.ok).length;result.failed=result.checks.filter(x=>!x.ok).length;result.ok=!result.error&&result.failed===0;writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:result.ok,passed:result.passed,failed:result.failed,error:result.error,publishedSupport:result.publishedSupport,receipt:out}));if(!result.ok)process.exitCode=1;}
