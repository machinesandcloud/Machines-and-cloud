import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const source='/tmp/mc-launch-finish-7c/product/pricing/preview.html',out='/tmp/mc-pricing-po-20261025/scratchpad/pricing-po-preview';
const html=readFileSync(source,'utf8'),sha=x=>createHash('sha256').update(x).digest('hex');
assert.equal(sha(html),'201d07c3816ec3df75a8ad821b426fcb6784919e95bb39aa890b7b0bcbde6ff2');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND']});
const context=await browser.newContext({serviceWorkers:'block'}),blocked=[],jobs=[];
await context.route('**/*',r=>{blocked.push(r.request().url());return r.abort('blockedbyclient');});
try{for(const width of [1440,390]){
 const page=await context.newPage();await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.setContent(html);await page.locator('.card').last().waitFor();
 await page.screenshot({path:out+`/header-${width}.png`});await page.locator('#packages').screenshot({path:out+`/packages-${width}.png`});
 await page.locator('.card').nth(2).getByRole('button',{name:'View included scope'}).click();await page.waitForTimeout(400);
 await page.screenshot({path:out+`/scope-after-lead-${width}.png`});
 const geometry=await page.locator('#comparison-table thead .selected-column').evaluate(n=>{const r=n.getBoundingClientRect(),p=n.closest('.tablewrap').getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,containerLeft:p.left,containerRight:p.right,viewport:innerWidth,visibleInViewport:r.left<innerWidth&&r.right>0};});
 await page.locator('#workflow').selectOption('lead');await page.locator('#minutes').fill('80');await page.locator('#segments').fill('200');await page.locator('#replies').fill('1000');
 assert.match(await page.locator('#fit-result').innerText(),/Lead desk/);assert.match(await page.locator('#fit-result').innerText(),/\$499/);
 await page.locator('#fit').screenshot({path:out+`/forecast-${width}.png`});
 jobs.push({width,geometry,errors,forecast:await page.locator('#fit-result').innerText()});await page.close();
}}finally{await context.close();await browser.close();}
const result={sourceSHA256:sha(html),sourceStable:sha(readFileSync(source))===sha(html),blockedRequests:blocked,externalRequestsMade:0,jobs};writeFileSync(out+'/result.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
