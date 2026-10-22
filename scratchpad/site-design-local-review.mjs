import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
let pw;
try { pw=await import('playwright'); } catch { for(const b of (process.env.PATH||'').split(delimiter)){ const p=resolve(b,'../playwright/index.mjs'); if(existsSync(p)){pw=await import(pathToFileURL(p));break;} } }
const base='http://127.0.0.1:8893', out=process.argv.includes('--final')?'scratchpad/site-design-local-final':'scratchpad/site-design-local'; mkdirSync(out,{recursive:true});
const browser=await pw.chromium.launch({channel:'chrome',headless:true}); const report=[];
try {
for(const [name,path,width] of [['home-desktop','/index.html',1440],['home-mobile','/index.html',390],['home-narrow','/index.html',320],['about-desktop','/about.html',1440],['about-mobile','/about.html',390],['thanks-mobile','/thank-you.html',390]]){
 const context=await browser.newContext({viewport:{width,height:width>1000?1000:844},reducedMotion:'reduce'}); const blocked=[], errors=[];
 await context.route('**/*',async route=>{ const q=route.request(),u=new URL(q.url()); if(u.origin!==base||q.method()!=='GET'||u.pathname.startsWith('/api/')){blocked.push({url:u.origin+u.pathname,method:q.method()});await route.abort();}else await route.continue(); });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.waitForTimeout(500);
 await page.screenshot({path:`${out}/${name}.png`,fullPage:false});
 for(let y=0;y<await page.evaluate(()=>document.body.scrollHeight);y+=650){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(25);}
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${name}-full.png`,fullPage:true});
 const state=await page.evaluate(()=>({title:document.title,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelector('h1')?.innerText,body:document.body.innerText,ids:[...document.querySelectorAll('section[id]')].map(e=>({id:e.id,heading:e.querySelector('h2')?.innerText})),nav:{expanded:document.querySelector('#navToggle')?.getAttribute('aria-expanded'),hidden:document.querySelector('#navMenu')?.getAttribute('aria-hidden')}}));
 if(width===390 && name==='home-mobile'){
  await page.locator('#navToggle').click();await page.waitForTimeout(250);await page.screenshot({path:`${out}/home-mobile-menu.png`,fullPage:false});await page.keyboard.press('Escape');
 }
 report.push({name,path,...state,blocked,errors});writeFileSync(`${out}/observations.json`,JSON.stringify(report,null,2)+'\n');console.log(`${name}: ${state.h1}; overflow=${state.scrollWidth>width}; errors=${errors.length}`);await context.close();
}
}finally{await browser.close();}
