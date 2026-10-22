// Independent local-only audit. API traffic is intercepted; no email, checkout or model call.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const args=process.argv.slice(2),arg=(key)=>args[args.indexOf(key)+1];
const base=new URL(arg('--base'));assert.ok(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port&&base.pathname==='/'&&!base.search&&!base.hash&&!base.username&&!base.password);
const output=arg('--output');assert.ok(output?.startsWith('scratchpad/')&&output.endsWith('.json'));
const sources=['index.html','onboard.html','onboard.js','netlify/functions/lib/config.mjs','netlify/functions/lib/sales-desk.mjs','netlify/functions/billing.mjs'];
const sha=body=>createHash('sha256').update(body).digest('hex'),snapshot=()=>Object.fromEntries(sources.map(file=>[file,sha(readFileSync(file))]));
const report={startedAt:new Date().toISOString(),base:base.origin,source:snapshot(),checks:[],cases:[],errors:[],blocked:[],fixtureRequests:[],screenshots:[],scope:'Local static browser rendering and pure planning functions; API replies intercepted in browser. No real account, storage, email, model, provider or billing operation.'};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
const {chromium}=await import(pathToFileURL(resolve(arg('--playwright'))));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const {PLANS,PUBLIC_PLANS,PUBLIC_PLAN_IDS,PUBLIC_PLAN_LABELS}=await import(pathToFileURL(resolve('netlify/functions/lib/config.mjs')));
  check('exactly two stable public IDs',JSON.stringify(PUBLIC_PLAN_IDS)===JSON.stringify(['starter','growth']),PUBLIC_PLAN_IDS);
  check('public names and amounts match the selected offer',PUBLIC_PLAN_LABELS.starter==='Coverage'&&PUBLIC_PLAN_LABELS.growth==='Follow-through'&&PUBLIC_PLANS.starter.price===99&&PUBLIC_PLANS.growth.price===249,PUBLIC_PLANS);
  check('legacy plan units and prices remain unchanged',JSON.stringify(Object.fromEntries(Object.entries(PLANS).map(([key,value])=>[key,[value.price,value.minutes,value.texts]])))===JSON.stringify({starter:[99,150,500],growth:[249,600,1500],pro:[449,1500,5000]}));
  const sales=await import(pathToFileURL(resolve('netlify/functions/lib/sales-desk.mjs')));
  const estimate=sales.estimateCallVolume({call_count:1188,period:'month',count_kind:'routed',routing:'all_calls',average_minutes:1,workdays_per_month:null,missed_percent:null,routed_percent:null});
  check('sales comparison uses the two public offers only',estimate.planComparison.length===2&&estimate.planComparison.every(row=>['starter','growth'].includes(row.plan))&&estimate.planComparison.map(row=>row.name).join('|')==='Coverage|Follow-through',estimate);
  check('sales planning preserves unrounded pricing and no billing activation',estimate.planComparison[0].projectedCallCost===462.30&&estimate.planComparison[1].projectedCallCost===454.80&&estimate.billingActive===false&&estimate.phoneActive===false,estimate.planComparison);
  check('billing endpoint retains new-workspace block before checkout',/if \(isSelfServiceClient\(c\)\) return json\(\{ error: "billing_setup_unavailable"/.test(readFileSync('netlify/functions/billing.mjs','utf8')));
  for(const width of[1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
    await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base.origin||request.method()!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/functions/')){report.blocked.push({method:request.method(),url:url.origin+url.pathname});return route.abort();}return route.continue();});
    await context.addInitScript(()=>{
      const nativeFetch=window.fetch.bind(window);window.__pricingQA={requests:[]};
      window.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin||url.pathname!=='/api/access')return nativeFetch(input,init);const method=init.method||'GET';window.__pricingQA.requests.push({method,body:init.body?JSON.parse(init.body):null});if(method==='GET')return Response.json(window.__pricingFixture);if(method==='PUT')return Response.json({draft:{revision:100}});throw new Error('Unplanned access mutation blocked by pricing QA');};
      sessionStorage.setItem('mc-onboarding-session-v1','qa-local-fixture-session');
      const query=new URLSearchParams(location.search),draftPlan=query.get('qa_draft');
      window.__pricingFixture={email:'pricing-qa@example.test',draft:{revision:draftPlan?7:0,fields:draftPlan?{plan:draftPlan}:{},step:0},existing:query.get('qa_existing')?{portal:'/desk.html?c=qa-legacy-pro'}:null};
    });
    const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',error=>report.errors.push(error.message));
    try{
      await page.goto(base.href,{waitUntil:'domcontentloaded'});
      const cards=await page.locator('#plans .site-plan').evaluateAll(nodes=>nodes.map(node=>({name:node.querySelector('.site-plan-name').textContent,price:node.querySelector('.site-price').textContent,allowance:node.querySelector('.site-allowance')?.textContent,link:node.querySelector('a')?.getAttribute('href'),copy:node.textContent})));
      check(`${width}px homepage displays only Coverage and Follow-through`,cards.length===2&&cards[0].name==='Coverage'&&cards[1].name==='Follow-through'&&cards[0].price.includes('$99')&&cards[1].price.includes('$249'),cards);
      check(`${width}px public plan links retain stable preference IDs`,cards[0]?.link==='onboard.html?plan=starter'&&cards[1]?.link==='onboard.html?plan=growth',cards);
      const structured=await page.locator('script[type="application/ld+json"]').evaluateAll(nodes=>nodes.flatMap(node=>{const value=JSON.parse(node.textContent);return value['@graph']||[value];}));
      const offer=structured.find(value=>value['@type']==='Service')?.offers;
      check(`${width}px structured offer range is 99 to 249`,String(offer?.lowPrice)==='99'&&String(offer?.highPrice)==='249',offer);
      check(`${width}px homepage has no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      const priceScreen=output.replace(/\.json$/,`-${width}-plans.png`);await page.locator('#plans').screenshot({path:priceScreen});report.screenshots.push(priceScreen);
      for(const test of[
        {name:'default',query:'',expected:'growth'},
        {name:'Coverage link',query:'?plan=starter',expected:'starter'},
        {name:'Follow-through link',query:'?plan=growth',expected:'growth'},
        {name:'legacy Pro link',query:'?plan=pro',expected:'growth',legacy:true},
        {name:'restored Pro draft',query:'?qa_draft=pro',expected:'growth',legacy:true},
        {name:'restored Coverage draft',query:'?qa_draft=starter',expected:'starter'},
        {name:'restored Follow-through draft',query:'?qa_draft=growth',expected:'growth'}
      ]){
        await page.goto(new URL('onboard.html'+test.query,base).href,{waitUntil:'domcontentloaded'});await page.locator('#ob').waitFor({state:'visible'});
        const state=await page.evaluate(()=>({labels:[...document.querySelectorAll('.plans-pick label')].map(label=>label.textContent.replace(/\s+/g,' ').trim()),values:[...document.querySelectorAll('input[name=plan]')].map(input=>input.value),selected:[...document.querySelectorAll('input[name=plan]:checked')].map(input=>input.value),note:document.querySelector('#plan-preference-note')?.textContent,noteHidden:document.querySelector('#plan-preference-note')?.hidden,copy:document.querySelector('#ob').textContent,requests:window.__pricingQA.requests}));
        check(`${width}px ${test.name} has exactly two offered preferences and one selection`,state.values.join('|')==='starter|growth'&&state.selected.length===1&&state.values.includes(state.selected[0]),state);
        check(`${width}px ${test.name} preserves public name and amount mapping`,state.labels.length===2&&/Coverage.*\$99/.test(state.labels[0])&&/Follow-through.*\$249/.test(state.labels[1]),state.labels);
        if(test.expected)check(`${width}px ${test.name} selects its intended preference`,state.selected[0]===test.expected,state.selected);
        if(test.legacy)check(`${width}px ${test.name} explains the retired preference without a crash`,state.noteHidden===false&&state.note==='Pro is no longer offered for new setup. Choose a current preference; billing remains off.',state.note);
        check(`${width}px ${test.name} starts no paid subscription or trial`,/Billing is off/i.test(state.copy)&&/does not start a subscription/i.test(state.copy)&&state.requests.length===1&&state.requests[0].method==='GET',state.requests);
        check(`${width}px ${test.name} has no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        if(test.legacy){await page.locator('input[name=plan][value=starter]').check();check(`${width}px ${test.name} choosing Coverage clears the legacy note`,await page.locator('#plan-preference-note').isHidden()&&await page.locator('input[name=plan]:checked').inputValue()==='starter');}
        report.fixtureRequests.push(...state.requests.map(request=>({width,case:test.name,...request})));report.cases.push({width,name:test.name,...state});
      }
      await page.goto(new URL('onboard.html?qa_existing=pro',base).href,{waitUntil:'domcontentloaded'});await page.locator('#done.on').waitFor({state:'visible'});
      check(`${width}px existing Pro workspace opens without plan re-selection`,await page.locator('#portalLink').getAttribute('href')==='/desk.html?c=qa-legacy-pro'&&await page.locator('#ob').isHidden());
    }finally{await context.close();}
  }
  check('runtime sources remained stable',JSON.stringify(snapshot())===JSON.stringify(report.source));
  check('zero browser exceptions',report.errors.length===0,report.errors);
  check('zero unexpected network attempts',report.blocked.every(row=>row.method==='GET'&&row.url.startsWith('https://fonts.googleapis.com/')),report.blocked);
  report.result=report.checks.every(row=>row.pass)?'passed':'failed';
}catch(error){report.result='failed';report.error=String(error.stack||error);}
finally{await browser.close();report.finishedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({result:report.result,checks:report.checks.length,failures:report.checks.filter(row=>!row.pass).length,error:report.error,output}));if(report.result!=='passed')process.exitCode=1;}
