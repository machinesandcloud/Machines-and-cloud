import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
let pw;
try {pw=await import('playwright');}catch{for(const b of(process.env.PATH||'').split(delimiter)){const p=resolve(b,'../playwright/index.mjs');if(existsSync(p)){pw=await import(pathToFileURL(p));break;}}}
const base='http://127.0.0.1:8893',out=process.argv.includes('--viewport')?'scratchpad/walkthrough-po-viewport':'scratchpad/walkthrough-po-first';mkdirSync(out,{recursive:true});
const browser=await pw.chromium.launch({channel:'chrome',headless:true});const report=[];
try{for(const width of[1440,390,320]){
 const c=await browser.newContext({viewport:{width,height:width>1000?1000:844},reducedMotion:'reduce'}),blocked=[],errors=[];
 await c.route('**/*',async route=>{const q=route.request(),u=new URL(q.url());if(u.origin!==base||q.method()!=='GET'||u.pathname.startsWith('/api/')){blocked.push({path:u.pathname,method:q.method()});await route.abort();}else await route.continue();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
 await p.locator('#week').scrollIntoViewIfNeeded();await p.waitForTimeout(150);await p.locator('#week').screenshot({path:`${out}/watch-${width}.png`});
 const tryButton=p.getByRole('button',{name:'Try it yourself',exact:true});await tryButton.click();await p.waitForTimeout(150);await p.screenshot({path:`${out}/try-viewport-${width}.png`});
 const geometry=await p.evaluate(()=>{const rect=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,text:e.innerText};};return{send:rect('example-send'),launcher:rect('mcAgentLauncher'),reset:rect('example-reset'),scrollY};});
 await p.locator('#week').screenshot({path:`${out}/try-${width}.png`});
 report.push({width,geometry,scrollWidth:await p.evaluate(()=>document.documentElement.scrollWidth),body:await p.locator('#week').innerText(),blocked,errors});writeFileSync(out+'/observations.json',JSON.stringify(report,null,2)+'\n');console.log(`width${width}: errors${errors.length}, blocked${blocked.length}`);await c.close();
}}finally{await browser.close();}
