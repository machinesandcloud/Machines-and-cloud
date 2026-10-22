import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
let pw;
try {pw=await import('playwright');} catch {for(const b of(process.env.PATH||'').split(delimiter)){const p=resolve(b,'../playwright/index.mjs');if(existsSync(p)){pw=await import(pathToFileURL(p));break;}}}
const base='http://127.0.0.1:8893';const browser=await pw.chromium.launch({channel:'chrome',headless:true});const report={blocked:[],checks:[]};
try{
const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
await c.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base||r.method()!=='GET'||u.pathname.startsWith('/api/')){report.blocked.push({path:u.pathname,method:r.method()});await route.abort();}else await route.continue();});
const p=await c.newPage();await p.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
const launcher=p.getByRole('button',{name:'Ask the front desk',exact:true});await launcher.waitFor();
const size=await launcher.boundingBox();assert.equal(size.width,48);assert.equal(size.height,48);report.checks.push('48px compact launcher retains accessible name');
await launcher.click();await p.locator('#mcAgentPanel').waitFor({state:'visible'});assert.equal(await launcher.getAttribute('aria-expanded'),'true');report.checks.push('real widget opens with correct expanded state');
await p.screenshot({path:'scratchpad/site-design-local-final/widget-open-mobile.png'});
await p.locator('#mcAgentClose').click();assert.equal(await p.locator('#mcAgentPanel').getAttribute('hidden'),'');assert.equal(await launcher.getAttribute('aria-expanded'),'false');assert.equal(await launcher.evaluate(e=>e===document.activeElement),true);report.checks.push('close hides widget and restores launcher focus');
for(const width of [1440,390]){
 await p.setViewportSize({width,height:1000});
 for(const id of ['week','plans','pilot']) await p.locator('#'+id).screenshot({path:`scratchpad/site-design-local-final/${id}-${width}.png`});
}
assert.equal(report.blocked.filter(x=>x.path.startsWith('/api/')||x.method!=='GET').length,0);report.checks.push('opening/closing caused no API or non-GET request');report.result='pass';
}catch(e){report.result='fail';report.error=e.message;process.exitCode=1;}finally{await browser.close();writeFileSync('scratchpad/site-design-local-final/widget-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
