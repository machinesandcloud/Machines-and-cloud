// Focused browser contract fixtures. Endpoint responses are explicit doubles;
// independent QA exercises the real handlers separately. No physical network.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import net from 'node:net';import http from 'node:http';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
const report={at:new Date().toISOString(),scope:'Actual embed DOM with explicit observation/stream/receipt fixtures; no model, provider or real handler outcome claimed.',checks:[],physicalNetwork:0,pageErrors:[],requests:[]};
const deny=()=>{report.physicalNetwork++;throw Error('Physical network denied');};globalThis.fetch=net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
const {chromium}=await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const source=readFileSync('embed.js','utf8'),sha=x=>createHash('sha256').update(x).digest('hex');report.sourceBefore=sha(source);report.harnessHash=sha(readFileSync(import.meta.filename));
const output=resolve(process.argv[2]||'scratchpad/website-installation-embed-ui-first.json');if(existsSync(output))throw Error('Use a fresh receipt path');
const check={id:'1'.repeat(32),challenge:'2'.repeat(64),origin:'https://shop.fixture.test',contact:'websitecheck_'+'1'.repeat(32),expiresAt:new Date(Date.now()+600000).toISOString()},ref='3'.repeat(64);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--host-resolver-rules=MAP * ~NOTFOUND','--disable-background-networking','--disable-sync']});
try{for(const scenario of ['ordinary','complete','interrupted','ack_retry','invalid','paused','question_only','expired_reload','storage_denied','plumbing_remote']){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const requests=[];let ackCount=0,turn=null;
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());
  if(url.origin===check.origin&&req.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width"><title>Fixture shop</title><h1>Fixture shop</h1><script src="https://platform.fixture.test/embed.js" data-client="fixture" async></script>'});
  if(url.href==='https://platform.fixture.test/embed.js')return route.fulfill({contentType:'text/javascript',body:source});
  requests.push({path:url.pathname,method:req.method(),body:req.postDataJSON(),authorization:!!req.headers().authorization});
  if(url.pathname==='/api/client')return route.fulfill({contentType:'application/json',body:JSON.stringify({name:'Fixture Air',greeting:'How can we help?',status:'live',webAvailable:true})});
  if(url.pathname==='/api/website-installation'){
   const body=req.postDataJSON();if(body.action==='observe')assert.equal(body.turnId,undefined,'Observation cannot carry a chat-turn reference');assert.equal(body.client,'fixture');assert.equal(body.checkId,check.id);assert.equal(body.challenge,check.challenge);assert.equal(req.headers().authorization,undefined);
   if(['expired_reload','storage_denied'].includes(scenario))return route.fulfill({status:410,contentType:'application/json',body:'{"error":"expired","message":"This setup check expired. Return to your workspace."}'});
   if(body.action==='acknowledge'){ackCount++;assert.equal(body.turnId,turn);assert.equal(body.completionRef,ref);if(scenario==='ack_retry'&&ackCount===1)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'});return route.fulfill({contentType:'application/json',body:'{"ok":true,"acknowledged":true}'});}
   return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,check:{...check,observed:true,sample:{service:scenario==='plumbing_remote'?'Leaking sink repair':'AC repair',area:scenario==='plumbing_remote'?'Dallas':'Houston'},chatAvailable:scenario!=='paused',reason:scenario==='paused'?'Website chat is paused.':'Customer chat is active.',turn:body.turnId?{id:body.turnId,state:'completed',record:{kind:'leads',id:'fixture-lead',createdAt:new Date().toISOString()},answerObserved:false}:null}})});
  }
  if(url.pathname==='/api/chat'){
   const body=req.postDataJSON();if(scenario!=='ordinary'){assert.equal(body.contact,check.contact);assert.equal(body.websiteCheck.checkId,check.id);assert.match(body.websiteCheck.turnId,/^[a-f0-9]{32}$/);turn=body.websiteCheck.turnId;}else assert.equal(body.websiteCheck,undefined);
   const events=scenario==='ordinary'?[]:[{type:'website_check',checkId:check.id,turnId:turn,completionRef:ref,record:scenario==='question_only'?null:{kind:'leads',id:'fixture-lead',createdAt:new Date().toISOString()}}];
   const done=JSON.stringify({t:'done',reply:scenario==='question_only'?'What number should the shop call?':'Your request is saved in the portal.',events});return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({t:'delta',text:'I am checking your request.'})+'\n'+(scenario==='interrupted'?'':done)});
  }
  throw Error('Unexpected browser request '+url.pathname);
 });
 const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push({scenario,message:error.message}));
 await context.addInitScript(({scenario})=>{sessionStorage.setItem('mc_desk_fixture',JSON.stringify({contact:'ordinary-contact',transcript:[{role:'assistant',content:'Existing ordinary visitor history'}]}));if(scenario==='storage_denied'){const native=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='mc_website_setup_fixture')throw new Error('Explicit check-storage failure fixture');return native.call(this,key,value);};}}, {scenario});
 const hash=scenario==='ordinary'?'':scenario==='invalid'?'#mc-website-check=bad':'#mc-website-check='+check.id+'.'+check.challenge;
 await page.goto(check.origin+'/?source=fixture'+hash);await page.locator('#mcDesk .l').click();if(scenario!=='ordinary')assert.doesNotMatch(await page.locator('#mcDesk .m').innerText(),/Existing ordinary visitor history/);
 if(['invalid','paused','expired_reload','storage_denied'].includes(scenario)){await page.waitForTimeout(120);assert.equal(await page.locator('#mcDesk textarea').isDisabled(),true);assert.equal(requests.filter(row=>row.path==='/api/chat').length,0);if(scenario==='expired_reload'){await page.reload();await page.locator('#mcDesk .l').click();assert.equal(await page.locator('#mcDesk textarea').isDisabled(),true);assert.match(await page.locator('#mcDesk .check [role=status]').innerText(),/ended|invalid/i);const tombstone=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mc_website_setup_fixture')));assert.equal(tombstone.ended,true);assert.equal(tombstone.challenge,undefined);assert.doesNotMatch(await page.locator('#mcDesk .m').innerText(),/Existing ordinary visitor history/);assert.equal(requests.filter(row=>row.path==='/api/chat').length,0);}}
 else{
  await page.locator('#mcDesk textarea').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#mcDesk textarea').disabled);
  if(scenario!=='ordinary'){assert.equal(new URL(page.url()).hash,'');assert.equal(new URL(page.url()).search,'?source=fixture');await page.locator('[data-check-sample]').click();if(scenario==='plumbing_remote'){const sample=await page.locator('#mcDesk textarea').inputValue();assert.match(sample,/Leaking sink repair/);assert.match(sample,/Dallas/);assert.doesNotMatch(sample,/Katy|Oak St|AC repair/);}assert.equal(requests.filter(row=>row.path==='/api/chat').length,0);}
  else await page.locator('#mcDesk textarea').fill('Please save a callback request.');
  await page.locator('#mcDesk .s').click();
  if(scenario==='interrupted'){await page.locator('#mcDesk .check [role=status]').filter({hasText:/interrupted/i}).waitFor();assert.equal(ackCount,0);assert.equal(await page.locator('#mcDesk textarea').isDisabled(),true);await page.locator('[data-check-status]').click();await page.locator('#mcDesk .check [role=status]').filter({hasText:/answer is not confirmed/i}).waitFor();assert.equal(requests.filter(row=>row.path==='/api/chat').length,1);await page.reload();await page.locator('#mcDesk .l').click();await page.locator('#mcDesk .check [role=status]').filter({hasText:/answer is not confirmed/i}).waitFor();assert.equal(requests.filter(row=>row.path==='/api/chat').length,1);assert.equal(requests.filter(row=>row.path==='/api/website-installation').at(-1).body.action,'status');}
  else if(scenario==='ack_retry'){await page.locator('[data-check-ack]').waitFor({state:'visible'});await page.locator('[data-check-ack]').click();await page.locator('#mcDesk .check [role=status]').filter({hasText:/sample request is saved/i}).waitFor();assert.equal(ackCount,2);assert.equal(requests.filter(row=>row.path==='/api/chat').length,1);}
  else if(scenario!=='ordinary'){await page.locator('#mcDesk .check [role=status]').filter({hasText:scenario==='question_only'?/answer confirmed/i:/sample request is saved/i}).waitFor();assert.equal(ackCount,1);assert.match(await page.locator('#mcDesk .check [role=status]').innerText(),scenario==='question_only'?/continue/i:/sample request is saved/i);}
  else await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('mc_desk_fixture')).transcript.some(row=>row.role==='assistant'&&row.content==='Your request is saved in the portal.'));
  if(scenario!=='ordinary')assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mc_desk_fixture')).transcript.length),1);
 }
 await page.keyboard.press('Escape');assert.equal(await page.locator('#mcDesk .l').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#mcDesk .l').evaluate(node=>node===document.activeElement),true);
 report.requests.push(...requests.map(row=>({scenario,path:row.path,method:row.method,action:row.body?.action,authorization:row.authorization})));report.checks.push({name:scenario,ok:true});await context.close();
}}
catch(error){report.checks.push({name:'failure',ok:false,error:error.stack});}
finally{await browser.close();report.sourceAfter=sha(readFileSync('embed.js'));report.sourceStable=report.sourceBefore===report.sourceAfter;report.summary={passed:report.checks.filter(row=>row.ok).length,failed:report.checks.filter(row=>!row.ok).length};writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,...report.summary,sourceStable:report.sourceStable,physicalNetwork:report.physicalNetwork,pageErrors:report.pageErrors}));if(report.summary.failed||report.pageErrors.length||!report.sourceStable||report.physicalNetwork)process.exitCode=1;}
