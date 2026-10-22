// Targeted correction check. All access requests are fulfilled locally in the browser.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const args=process.argv.slice(2),arg=key=>args[args.indexOf(key)+1],base=new URL(arg('--base')),output=arg('--output');
assert.ok(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port&&base.pathname==='/'&&!base.search&&!base.hash&&!base.username&&!base.password);
assert.ok(output.startsWith('scratchpad/')&&output.endsWith('.json'));
const first=JSON.parse(readFileSync('scratchpad/demo-pricing-public-first.json','utf8')),sha=body=>createHash('sha256').update(body).digest('hex'),snapshot=()=>Object.fromEntries(Object.keys(first.source).map(file=>[file,sha(readFileSync(file))]));
const report={startedAt:new Date().toISOString(),source:snapshot(),previousReceipt:'scratchpad/demo-pricing-public-first.json',previousFailures:first.checks.filter(row=>!row.pass),checks:[],cases:[],errors:[],blocked:[],screenshots:[],scope:'Only the three returned Pro-link widths, valid/legacy/invalid draft precedence and explicit choice clearing; no full-pricing rerun. All API responses are fixtures. No actual account, email, model or billing operation.'};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
const {chromium}=await import(pathToFileURL(resolve(arg('--playwright')))),browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  check('initial pricing failure remains recorded as three Pro-link returns',report.previousFailures.length===3&&report.previousFailures.every(row=>row.name.includes('legacy Pro link')));
  check('only onboarding script changed among the original pricing proof sources',Object.entries(report.source).every(([file,value])=>file==='onboard.js'?value!==first.source[file]:value===first.source[file]),{before:first.source,after:report.source});
  check('targeted onboarding script matches the architect freeze',report.source['onboard.js']==='dbe5448e3d86bfa0c25841f121be89600820e74d2c6e7eb2996fb7f6d952ed0f');
  for(const width of[1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
    await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base.origin||request.method()!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/functions/')){report.blocked.push({method:request.method(),url:url.origin+url.pathname});return route.abort();}return route.continue();});
    await context.addInitScript(()=>{
      const nativeFetch=window.fetch.bind(window);window.__pricingFix={requests:[]};sessionStorage.setItem('mc-onboarding-session-v1','qa-targeted-fixture-session');
      window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin||url.pathname!=='/api/access')return nativeFetch(input,init);const method=init.method||'GET';window.__pricingFix.requests.push({method,body:init.body?JSON.parse(init.body):null});if(method==='GET'){const draftPlan=new URLSearchParams(location.search).get('qa_draft');return Response.json({email:'pricing-qa@example.test',draft:{revision:7,step:0,fields:draftPlan?{plan:draftPlan}:{}},existing:null});}if(method==='PUT')return Response.json({draft:{revision:8}});throw new Error('Unplanned fixture mutation');};
    });
    const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>report.errors.push(error.message));
    try{
      await page.goto(base.href,{waitUntil:'domcontentloaded'});await page.evaluate(()=>{document.activeElement?.blur();const section=document.querySelector('#plans'),header=document.querySelector('#navbar');window.scrollTo({top:section.getBoundingClientRect().top+scrollY-header.getBoundingClientRect().height-20,behavior:'instant'});});
      const pricingImage=output.replace(/\.json$/,`-${width}-plans-viewport.png`);await page.screenshot({path:pricingImage,animations:'disabled'});report.screenshots.push(pricingImage);
      for(const test of[
        {name:'retired Pro link with empty draft',query:'?plan=pro',expected:'growth',hint:true},
        {name:'saved Coverage overrides retired link',query:'?plan=pro&qa_draft=starter',expected:'starter',hint:false},
        {name:'saved Follow-through overrides retired link',query:'?plan=pro&qa_draft=growth',expected:'growth',hint:false},
        {name:'saved Pro overrides current link',query:'?plan=starter&qa_draft=pro',expected:'growth',hint:true},
        {name:'invalid saved plan preserves retired-link reason',query:'?plan=pro&qa_draft=unknown',expected:'growth',hint:true}
      ]){
        await page.goto(new URL('onboard.html'+test.query,base).href,{waitUntil:'domcontentloaded'});await page.locator('#ob').waitFor({state:'visible'});
        const state=await page.evaluate(()=>({selected:[...document.querySelectorAll('input[name=plan]:checked')].map(input=>input.value),note:document.querySelector('#plan-preference-note').textContent,noteHidden:document.querySelector('#plan-preference-note').hidden,requests:window.__pricingFix.requests}));
        check(`${width}px ${test.name} keeps one correct selection`,state.selected.length===1&&state.selected[0]===test.expected,state);
        check(`${width}px ${test.name} shows only its applicable explanation`,state.noteHidden===!test.hint&&(!test.hint||state.note==='Pro is no longer offered for new setup. Choose a current preference; billing remains off.'),state);
        check(`${width}px ${test.name} performs only a fixture draft read`,state.requests.length===1&&state.requests[0].method==='GET',state.requests);
        if(test.hint){for(const id of['starter','growth']){await page.locator(`input[name=plan][value=${id}]`).check();check(`${width}px ${test.name} choosing ${id} clears the explanation`,await page.locator('#plan-preference-note').isHidden()&&await page.locator('input[name=plan]:checked').inputValue()===id);}}
        report.cases.push({width,name:test.name,...state});
      }
    }finally{await context.close();}
  }
  check('targeted source stayed stable',JSON.stringify(snapshot())===JSON.stringify(report.source));
  check('zero browser exceptions',report.errors.length===0,report.errors);
  check('zero unexpected network attempts',report.blocked.every(row=>row.method==='GET'&&row.url.startsWith('https://fonts.googleapis.com/')),report.blocked);
  report.result=report.checks.every(row=>row.pass)?'passed':'failed';
}catch(error){report.result='failed';report.error=String(error.stack||error);}
finally{await browser.close();report.finishedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({result:report.result,checks:report.checks.length,failures:report.checks.filter(row=>!row.pass).length,error:report.error,output}));if(report.result!=='passed')process.exitCode=1;}
