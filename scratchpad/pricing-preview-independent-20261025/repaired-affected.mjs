import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const root='/tmp/mc-launch-finish-7c',out='/tmp/mc-pricing-preview-independent-20261025',sha=b=>createHash('sha256').update(b).digest('hex'),html=readFileSync(root+'/product/pricing/preview.html');
assert.equal(sha(html),'84f829e6f99d3deefb8e434b093408850e8a52816999b93135fa989176ecd3b7');
const server=createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html;charset=utf-8'});r.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,external=[],checks=[],shots=[];
const context=await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(),'mc-pricing-repaired-')),{channel:'chrome',headless:true,reducedMotion:'reduce',serviceWorkers:'block',args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(external.push(new URL(r.request().url()).origin),r.abort()));
try{for(const width of [320,390,768,1440]){
 const page=await context.newPage();await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin+'/preview.html');await page.locator('.card').last().waitFor();await page.locator('.mast img').evaluate(n=>n.decode());
 for(const [name,loc] of [['header',null],['packages','#packages']]){const path=out+`/repaired-${name}-${width}.png`;if(loc)await page.locator(loc).screenshot({path});else await page.screenshot({path});shots.push(path);}
 const scope=[];
 for(const [i,name]of ['Coverage','Follow-through','Lead desk'].entries()){
  await page.locator('#differences').check();await page.locator('.card').nth(i).getByRole('button',{name:'View included scope'}).click();
  const geometry=await page.evaluate(()=>{const t=document.querySelector('#comparison-table'),w=t.closest('.tablewrap'),h=t.querySelector('thead .selected-column'),labels=[...t.querySelectorAll('th:first-child')],selected=[...t.querySelectorAll('tbody .selected-column')];const b=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}};return {viewport:innerWidth,scroller:b(w),selectedHeader:b(h),selectedHeaderText:h.textContent,labels:labels.map(b),selectedCells:selected.map(b),scrollLeft:w.scrollLeft,filterReset:!document.querySelector('#differences').checked,commonRowsVisible:[...t.querySelectorAll('tbody tr[data-common=true]')].every(r=>!r.hidden)}});
  assert.equal(geometry.selectedHeaderText,name);assert.ok(geometry.filterReset&&geometry.commonRowsVisible);
  const inside=(r)=>r.left>=geometry.scroller.left-1&&r.right<=geometry.scroller.right+1&&r.left>=-1&&r.right<=width+1;
  assert.ok(inside(geometry.selectedHeader),'selected column header must be visible '+width+'/'+name);assert.ok(geometry.labels.every(inside),'row labels must remain visible '+width+'/'+name);assert.ok(geometry.selectedCells.every(inside),'selected capacity and service cells must be visible '+width+'/'+name);assert.ok(geometry.labels.every((r,j)=>j===0||r.right<=geometry.selectedCells[j-1].left+1),'labels do not overlap selected values');
  scope.push(geometry);const path=out+`/repaired-scope-${i}-${width}.png`;await page.locator('#comparison').screenshot({path});shots.push(path);
 }
 const workflow=page.locator('#workflow');await workflow.selectOption('coverage');await workflow.focus();await page.keyboard.type('Add',{delay:70});const keyboardValue=await workflow.inputValue();assert.equal(keyboardValue,'follow','native select accepts visible-label keyboard typeahead');assert.equal(await page.locator('#fit-result h3').innerText(),'Follow-through');await workflow.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'minutes');
 await page.locator('#differences').focus();await page.locator('#differences').press('Space');assert.ok(await page.locator('#differences').isChecked());assert.ok(await page.locator('#comparison-rows tr[data-common=true]').first().isHidden());await page.locator('.card').nth(2).getByRole('button',{name:'View included scope'}).press('Enter');assert.equal(await page.locator('#comparison-table thead .selected-column').innerText(),'Lead desk');assert.ok(!(await page.locator('#differences').isChecked()));
 await workflow.selectOption('lead');const forecast=out+`/repaired-forecast-${width}.png`;await page.locator('#fit').screenshot({path:forecast});shots.push(forecast);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);checks.push({width,scope,keyboard:{visibleLabelTypeahead:'Add',value:keyboardValue,tabFocus:'minutes',checkboxSpace:true,cardEnter:true},pageErrors:errors,documentHorizontalOverflow:false});await page.close();
}}finally{await context.close();await new Promise(r=>server.close(r));}
assert.equal(sha(readFileSync(root+'/product/pricing/preview.html')),sha(html));assert.deepEqual(external,[]);const receipt={sourceSHA256:sha(html),sourceStable:true,widths:checks,selectedScopePaths:12,keyboardPaths:4,screenshots:shots,externalRequestsAttempted:external,externalRequestsMade:0,RootWrites:0,ownerBrowserAccess:false};writeFileSync(out+'/repaired-affected-result.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({source:sha(html),scopePaths:12,keyboardPaths:4,shots,passed:true}));
