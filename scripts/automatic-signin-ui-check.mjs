// Actual onboarding assets with fully local API fixtures; no email, model or provider requests.
import {readFileSync,writeFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const root=resolve('.'), outputIndex=process.argv.indexOf('--output'), out=resolve(outputIndex<0?'scratchpad/automatic-signin-ui-check':process.argv[outputIndex+1]), base='http://127.0.0.1:8963';
if(existsSync(out))throw Error('Choose a fresh output directory; prior QA evidence is preserved.');
mkdirSync(out+'/screenshots',{recursive:true});
const sourceFiles=['scripts/automatic-signin-ui-check.mjs','onboard.js','onboard.html','onboard.css','product-ui.css','styles.css'];
const sourceFor=file=>root+'/'+file;
const report={at:new Date().toISOString(),mode:'intercepted automatic sign-in regression',boundary:'All API responses and static assets fulfilled from local files. Workspace destination is a stub HTML marker. External requests aborted. No production, provider, email or model requests.',sources:Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(readFileSync(sourceFor(file))).digest('hex')])),checks:[],externalBlocked:[],pageErrors:[],cases:[]};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
const browser=await chromium.launch({channel:'chrome',headless:true});
const portal=slug=>base+'/desk.html?c='+slug;
async function fixture(name,{width=1440,session,denyStorage=false,state,exchange,statuses,holdTokens=[],holdGetAuth=[],getStatusByAuth={},attachStatuses=[]}={}){
 const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
 const s={name,context,requests:[],pageErrors:[],holds:new Map(),state:state||{email:'owner@example.test',existing:{slug:'bayou-service',portal:portal('bayou-service')}},stateStatuses:statuses?[...statuses]:[],exchange:exchange||{},attachStatuses:[...attachStatuses],history:[]};
 await context.addInitScript(({session,denyStorage})=>{
  if(session&&location.pathname==='/onboard.html')sessionStorage.setItem('mc-onboarding-session-v1',session);
  if(denyStorage)Object.defineProperty(window,'sessionStorage',{get(){throw Error('Fixture storage blocked');}});
  window.__qaFetch=[];const originalFetch=window.fetch;window.fetch=function(url,options){window.__qaFetch.push({url:String(url),hash:location.hash,search:location.search,auth:options?.headers?.Authorization||null});return originalFetch.apply(this,arguments);};
 },{session,denyStorage});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==base){report.externalBlocked.push({case:name,origin:url.origin});return route.abort('blockedbyclient');}
  if(url.pathname.startsWith('/api/')){
   let body;try{body=req.postDataJSON();}catch{}
   const r={method:req.method(),path:url.pathname,body,auth:req.headers().authorization||null};s.requests.push(r);
   const respond=(status,value)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)}).catch(()=>{});
   if(url.pathname!='/api/access')return respond(403,{error:'fixture_blocked'});
   if(body?.action==='exchange'){
    if(holdTokens.includes(body.token))await new Promise(done=>s.holds.set(body.token,done));
    const result=s.exchange[body.token]||{status:200,data:{session:'session-'+body.token}};
    return respond(result.status,result.data);
   }
   if(body?.action==='request_link')return respond(500,{error:'unexpected_email_request',message:'QA forbids email requests'});
   if(body?.action==='sign_out')return respond(200,{ok:true});
   if(body?.action==='attach_intake'){const status=s.attachStatuses.shift()||200;return respond(status,status===200?s.state:{error:'intake_unavailable',message:'The saved setup service is temporarily unavailable. Please try again.'});}
   if(req.method()==='GET'){
    const status=getStatusByAuth[r.auth]||s.stateStatuses.shift()||200;
    if(holdGetAuth.includes(r.auth))await new Promise(done=>s.holds.set(r.auth,done));
    return respond(status,status===200?s.state:{error:'temporarily_unavailable',message:'Your saved workspace is temporarily unavailable. Please try again.'});
   }
   return respond(403,{error:'unexpected_write'});
  }
  if(url.pathname==='/desk.html')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>QA workspace destination</title><h1 id="workspace-marker">Workspace destination received</h1>'});
  let file=resolve(root,decodeURIComponent(url.pathname==='/'?'index.html':url.pathname.slice(1)));
  if(!file.startsWith(root+'/'))return route.fulfill({status:404,body:'blocked'});
  if(['onboard.js','onboard.html'].includes(url.pathname.slice(1)))file=sourceFor(url.pathname.slice(1));
  if(!existsSync(file)||statSync(file).isDirectory())return route.fulfill({status:404,body:'not found'});
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp'}[extname(file)]||'application/octet-stream';
  return route.fulfill({status:200,contentType:type,body:readFileSync(file)});
 });
 const page=await context.newPage();s.page=page;
 page.on('pageerror',error=>{s.pageErrors.push(error.message);report.pageErrors.push({case:name,message:error.message});});
 s.go=token=>page.goto(base+'/onboard.html'+(token?'#verify='+token:''));
 s.close=async()=>{report.cases.push({name,requests:s.requests,pageErrors:s.pageErrors,url:page.url()});await context.close();};
 return s;
}
async function settle(page){await page.waitForTimeout(350);}
async function run(name,fn){try{await fn();}catch(error){check(name+': completes without harness exception',false,error.stack);}}
try{
  for(const width of [1440,390])await run('automatic-returning-'+width,async()=>{
   const s=await fixture('automatic-returning-'+width,{width,session:'old-owner-session',holdTokens:['returning-proof']});await s.go('returning-proof');
   await s.page.waitForTimeout(120);check(width+': exchanges automatically with no user action',s.requests.filter(r=>r.body?.action==='exchange').length===1);
   await s.page.screenshot({path:out+'/screenshots/loading-'+width+'.png',fullPage:true});
   check(width+': loading does not show misleading email request or confirmation',!await s.page.locator('#access-form').isVisible()&&!await s.page.locator('#access-verify').isVisible());
   const startFetch=await s.page.evaluate(()=>window.__qaFetch);check(width+': proof scrubbed before first fetch',startFetch.length>0&&startFetch.every(r=>r.hash===''),startFetch);
   check(width+': new proof is never sent using old owner authorization',s.requests.filter(r=>r.body?.action==='exchange').every(r=>r.auth===null)&&!s.requests.some(r=>r.auth==='Bearer old-owner-session'));
   s.holds.get('returning-proof')?.();await s.page.waitForURL('**/desk.html?c=bayou-service');
   check(width+': returning owner navigates directly to existing workspace',s.page.url()===portal('bayou-service'));
   check(width+': exactly one POST exchange then one authenticated state GET',s.requests.length===2&&s.requests[0].method==='POST'&&s.requests[0].body.action==='exchange'&&s.requests[1].method==='GET'&&s.requests[1].auth==='Bearer session-returning-proof',s.requests);
   check(width+': fresh session survives destination navigation',await s.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1'))==='session-returning-proof');
   await s.page.screenshot({path:out+'/screenshots/workspace-route-'+width+'.png',fullPage:true});await s.close();
  });
  await run('new-owner-saved-step',async()=>{
   const state={email:'new-owner@example.test',draft:{revision:7,step:2,fields:{name:'New Owner',business:'Bayou Repairs',phone:'7135550100',trade:'Plumbing',services:'Drain repair',serviceArea:'Katy',hours:'Mon to Fri 8am to 5pm',windows:'Tomorrow morning'}},marketing:{preference:false}};
   const s=await fixture('new-owner-saved-step',{state,width:390});await s.go('new-proof');await s.page.locator('#ob').waitFor({state:'visible'});
   check('new owner: valid proof opens saved onboarding step automatically',await s.page.locator('fieldset.on').getAttribute('data-step')==='3');
   check('new owner: preserves account identity and saved answers',await s.page.locator('#email').inputValue()===state.email&&await s.page.locator('#name').inputValue()==='New Owner'&&await s.page.locator('#business').inputValue()==='Bayou Repairs');
   check('new owner: no email request or unrelated write',s.requests.every(r=>r.method==='GET'||r.body?.action==='exchange'));
   await s.page.screenshot({path:out+'/screenshots/new-owner-saved-step-mobile.png',fullPage:true});await s.close();
  });
  await run('same-tab-fragment',async()=>{
   const s=await fixture('same-tab-fragment',{session:'old-session',state:{email:'old@example.test',draft:{revision:0,step:0,fields:{}},marketing:{}}});await s.go();await s.page.locator('#ob').waitFor({state:'visible'});
   s.state={email:'new@example.test',existing:{slug:'new-owner',portal:portal('new-owner')}};
   await s.page.evaluate(()=>location.hash='verify=same-tab-proof');await s.page.waitForURL('**/desk.html?c=new-owner');
   check('same tab: hash-only link automatically authenticates and routes to new owner',s.page.url()===portal('new-owner'));
   check('same tab: exchange drops old identity and new GET uses new session',s.requests.find(r=>r.body?.action==='exchange')?.auth===null&&s.requests.at(-1).auth==='Bearer session-same-tab-proof',s.requests);
   await s.close();
  });
  await run('late-old-startup-get-failure',async()=>{
   const state={email:'new-owner@example.test',draft:{revision:4,step:1,fields:{name:'New Owner',business:'New Bayou Shop'}},marketing:{preference:false}};
   const s=await fixture('late-old-startup-get-failure',{session:'old-startup-session',state,holdGetAuth:['Bearer old-startup-session'],getStatusByAuth:{'Bearer old-startup-session':503}});
   await s.go();await settle(s.page);check('startup race: first old owner state read is genuinely pending',s.holds.has('Bearer old-startup-session'));
   await s.page.evaluate(()=>location.hash='verify=new-startup-proof');await s.page.locator('#ob').waitFor({state:'visible'});
   check('startup race: newer proof opens correct saved wizard before old failure',await s.page.locator('#email').inputValue()===state.email&&await s.page.locator('fieldset.on').getAttribute('data-step')==='2');
   s.holds.get('Bearer old-startup-session')?.();await settle(s.page);
   check('startup race: late old GET503 cannot hide new wizard',await s.page.locator('#ob').isVisible()&&!await s.page.locator('#access-gate').isVisible()&&await s.page.locator('#email').inputValue()===state.email);
   check('startup race: late old GET503 cannot replace or clear new session',await s.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1'))==='session-new-startup-proof');
   await s.page.screenshot({path:out+'/screenshots/new-wizard-after-old-get-failure.png',fullPage:true});await s.close();
  });
  await run('transient-intake-attach-retry',async()=>{
   const state={email:'matching-owner@example.test',draft:{revision:3,step:1,fields:{name:'Matching Owner',business:'Existing Answers'}},marketing:{preference:false}},handoff='a'.repeat(64);
   const s=await fixture('transient-intake-attach-retry',{session:'intake-session',state,attachStatuses:[503,200],width:390});
   await s.page.goto(base+'/onboard.html#intake='+handoff);await settle(s.page);
   check('intake503: presents service error without claiming wrong account',await s.page.locator('#access-status').textContent()==='The saved setup service is temporarily unavailable. Please try again.'&&!/different email|does not match|wrong email|mismatch/i.test(await s.page.locator('#access-intro').textContent()));
   check('intake503: keeps verified session and explicit retry without automatic email',await s.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1'))==='intake-session'&&await s.page.locator('#access-verify').isVisible()&&!s.requests.some(r=>r.body?.action==='request_link'));
   await s.page.screenshot({path:out+'/screenshots/intake-transient-failure-mobile.png',fullPage:true});
   await s.page.locator('#access-verify').click();await s.page.locator('#ob').waitFor({state:'visible'});
   const attaches=s.requests.filter(r=>r.body?.action==='attach_intake');
   check('intake503: retries same handoff using saved session without consuming another proof',attaches.length===2&&attaches.every(r=>r.body.intake===handoff&&r.auth==='Bearer intake-session')&&!s.requests.some(r=>r.body?.action==='exchange'||r.body?.action==='request_link'));
   check('intake503: recovered saved answers and saved step are usable',await s.page.locator('#business').inputValue()==='Existing Answers'&&await s.page.locator('#email').inputValue()===state.email&&await s.page.locator('fieldset.on').getAttribute('data-step')==='2');await s.close();
  });
  await run('concurrent-proofs',async()=>{
   const s=await fixture('concurrent-proofs',{holdTokens:['proof-a','proof-b']});await s.go('proof-a');await settle(s.page);
   await s.page.evaluate(()=>location.hash='verify=proof-a');await settle(s.page);
   check('duplicates: same pending proof is exchanged once',s.requests.filter(r=>r.body?.token==='proof-a').length===1,s.requests);
   await s.page.evaluate(()=>location.hash='verify=proof-b');await settle(s.page);s.holds.get('proof-a')?.();await settle(s.page);
   check('races: older exchange response cannot sign in or read state',!s.requests.some(r=>r.method==='GET')&&await s.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1'))===null,s.requests);
   s.holds.get('proof-b')?.();await s.page.waitForURL('**/desk.html?c=bayou-service');
   check('races: only newest proof session is saved and used',await s.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1'))==='session-proof-b'&&s.requests.filter(r=>r.method==='GET').every(r=>r.auth==='Bearer session-proof-b'));
   await s.close();
  });
  for(const status of [400,410])await run('invalid-proof-'+status,async()=>{
   const message=status===410?'This sign-in link has expired. Request a new link.':'This sign-in link is invalid. Request a new link.';
   const s=await fixture('invalid-proof-'+status,{width:390,exchange:{bad:{status,data:{error:status===410?'expired_link':'invalid_link',message}}}});await s.go('bad');await settle(s.page);
   check(status+': displays failure and offers explicit replacement link request',await s.page.locator('#access-status').textContent()===message&&await s.page.locator('#access-form').isVisible());
   check(status+': no automatic email and no retry loop',s.requests.length===1&&s.requests[0].body.action==='exchange');
   check(status+': no stale session or proof remains',await s.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1'))===null&&new URL(s.page.url()).hash==='');
   await s.page.screenshot({path:out+'/screenshots/invalid-'+status+'-mobile.png',fullPage:true});await s.close();
  });
  await run('storage-blocked',async()=>{
   const s=await fixture('storage-blocked',{denyStorage:true});await s.go('storage-proof');await settle(s.page);
   check('storage blocked: no redirect loop or repeated exchange',s.requests.filter(r=>r.body?.action==='exchange').length===1&&s.requests.length<=2);
   check('storage blocked: destination is not opened without transferable session',!s.page.url().includes('/desk.html'));
   check('storage blocked: explains recovery instead of blank or misleading email',/storage|browser|cookies/i.test(await s.page.locator('#access-status').textContent()));
   await s.page.screenshot({path:out+'/screenshots/storage-blocked.png',fullPage:true});await s.close();
  });
  await run('state-service-retry',async()=>{
   const s=await fixture('state-service-retry',{statuses:[503,200]});await s.go('state-proof');await settle(s.page);
   check('state503: keeps successfully exchanged session',await s.page.evaluate(()=>sessionStorage.getItem('mc-onboarding-session-v1'))==='session-state-proof');
   check('state503: does not request another email',!s.requests.some(r=>r.body?.action==='request_link')&&!await s.page.locator('#access-form').isVisible());
   await s.page.screenshot({path:out+'/screenshots/state-retry.png',fullPage:true});
   const retry=s.page.locator('#access-verify');check('state503: offers an explicit workspace retry',await retry.isVisible()&&/retry|try|workspace/i.test(await retry.textContent()));
   if(await retry.isVisible()){await retry.click();await s.page.waitForURL('**/desk.html?c=bayou-service');}
   check('state503: retry uses saved session without reconsuming proof',s.requests.filter(r=>r.body?.action==='exchange').length===1&&s.requests.filter(r=>r.method==='GET').length===2);
   await s.close();
  });
  for(const target of ['https://attacker.invalid/desk.html?c=bayou-service','/admin.html','/desk.html?c=another-account','javascript:alert(1)','http://user:password@127.0.0.1:8963/desk.html?c=bayou-service'])await run('unsafe-destination-'+target,async()=>{
   const s=await fixture('unsafe-destination-'+target,{state:{email:'owner@example.test',existing:{slug:'bayou-service',portal:target}}});await s.go('unsafe-proof');await settle(s.page);
   check('unsafe destination refused: '+target,s.page.url().includes('/onboard.html')&&!await s.page.locator('#goPortal').isVisible());
   check('unsafe destination gives actionable error: '+target,!!(await s.page.locator('#access-status').textContent()).trim());await s.close();
  });
}finally{await browser.close();report.sourcesAfter=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(readFileSync(sourceFor(file))).digest('hex')]));check('tested source remains unchanged throughout independent browser run',JSON.stringify(report.sources)===JSON.stringify(report.sourcesAfter));check('No browser page errors',report.pageErrors.length===0);report.pass=report.checks.every(c=>c.pass);report.checkCount=report.checks.length;writeFileSync(out+'/'+'report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,checkCount:report.checkCount,failures:report.checks.filter(c=>!c.pass),pageErrors:report.pageErrors,report:out+'/'+'report.json'},null,2));}

if(!report.pass)process.exitCode=1;
