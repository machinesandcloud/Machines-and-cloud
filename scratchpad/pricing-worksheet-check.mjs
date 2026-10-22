import assert from 'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{chromium}from'/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const file='scratchpad/pricing-review.html',html=readFileSync(file,'utf8'),data=JSON.parse(readFileSync('scratchpad/pricing-costs.json'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={at:new Date().toISOString(),mode:'Standalone internal scenario worksheet, local content only',hash:createHash('sha256').update(html).digest('hex'),checks:0,network:[],errors:[]};
try{
const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',r=>{report.network.push(r.request().url());return r.abort()});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.setContent(html);
for(const utilization of[.25,.5,1])for(const band of['lean','planning','stress'])for(const support of[false,true]){
 await page.locator('#util').selectOption(String(utilization));await page.locator('#band').selectOption(band);await page.locator('#support').setChecked(support);
 const current=data.current.filter(p=>p.utilization===utilization&&p.band===band);
 const values=await page.locator('#current tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(td=>td.childNodes[0].textContent)));
 for(let i=0;i<3;i++){
  const expected=support?current[i].loaded:current[i];
  for(const[col,key]of[[4,'cost'],[5,'contribution']]){assert.ok(Math.abs(Number(values[i][col].replace(/[^\d.-]/g,''))-expected[key])<=.011,`${band}/${utilization}/${support}/${current[i].plan}/${key}`);report.checks++}
  assert.ok(Math.abs(Number(values[i][6].replace('%',''))-expected.serviceContributionMarginPercent)<.061);report.checks++;
 }
 const candidate=await page.locator('#candidate tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(td=>td.childNodes[0].textContent)));
 for(let i=0;i<3;i++){
  const p=data.revised.filter(p=>p.band===band)[i],a=data.assumptions;
  const expected=p.minutes*utilization*a.voiceBands[band]+p.outgoingSegments*utilization*a.supportedOutgoingSegmentCost+a.fixedTenantService+a.webAIReserve+p.price*a.paymentPercent+a.paymentFixed+(support?a.optionalSupportReserve:0);
  assert.ok(Math.abs(Number(candidate[i][4].replace(/[^\d.-]/g,''))-expected)<.011);report.checks++;
 }
}
await page.locator('#util').selectOption('1');await page.locator('#band').selectOption('planning');await page.locator('#support').setChecked(false);
await page.screenshot({path:'scratchpad/pricing-worksheet-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'scratchpad/pricing-worksheet-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);report.checks++;
assert.equal(report.network.length,0);report.checks++;assert.deepEqual(report.errors,[]);report.checks++;report.result='pass';
}catch(error){report.result='fail';report.error=error.message;process.exitCode=1;}finally{await browser.close();writeFileSync('scratchpad/pricing-worksheet-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
