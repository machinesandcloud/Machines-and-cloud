// Actual embed DOM and bound setup-status/public-config protocol fixtures.
// No real handler, AI, provider or saved-request effects are claimed here.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import net from 'node:net';import http from 'node:http';import https from 'node:https';
const arg=process.argv.indexOf('--output'),output=arg<0?null:process.argv[arg+1];
if(output&&(!/^scratchpad\/[a-z0-9-]+\.json$/.test(output)||existsSync(output)))throw Error('Use a new scratchpad output path');
let physical=0;const deny=()=>{physical++;throw Error('Widget setup refresh denies physical networking');};globalThis.fetch=net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
const source=readFileSync('embed.js','utf8'),sha=v=>createHash('sha256').update(v).digest('hex'),before=sha(source),checks=[],unexpected=[],pageErrors=[];
const playwrightModule=process.env.PLAYWRIGHT_MODULE||process.env.MC_PLAYWRIGHT_MODULE;
let playwright;try{playwright=await import(playwrightModule?pathToFileURL(resolve(playwrightModule)).href:'playwright');}catch{throw Error('This optional browser check requires Playwright. Set PLAYWRIGHT_MODULE to an installed module path; this check never installs tooling.');}
const {chromium}=playwright,browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND']});
try{for(const width of [390,1440])for(const mode of ['activate','deny','unavailable','late-initial']){
const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});context.setDefaultTimeout(5000);
try{
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin==='https://shop.fixture.test')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Fixture shop</h1><script src="https://platform.fixture.test/embed.js" data-client="setup-fixture" async></script>'});if(u.href==='https://platform.fixture.test/embed.js')return route.fulfill({contentType:'text/javascript',body:source});unexpected.push(u.href);return route.abort();});
 await context.addInitScript(({mode})=>{
  const old=window.fetch.bind(window),fixture=window.fixture={active:false,requests:[],release:null,configReads:0};
  window.fetch=async(input,init={})=>{const u=new URL(String(input));if(u.origin!=='https://platform.fixture.test')return old(input,init);fixture.requests.push({path:u.pathname,body:init.body});
   if(u.pathname==='/api/client'){
    const n=++fixture.configReads,available=fixture.active,reply=()=>new Response(JSON.stringify({name:'Fixture shop',greeting:'How can we help?',status:available?'live':'testing',webAvailable:available&&mode!=='deny'}),{status:n>1&&mode==='unavailable'?503:200,headers:{'content-type':'application/json'}});
    if(n===1&&mode==='late-initial')await new Promise(resolve=>fixture.release=resolve);return reply();
   }
   if(u.pathname==='/api/website-installation'){const body=JSON.parse(init.body);return new Response(JSON.stringify({check:{id:body.checkId,origin:location.origin,contact:'websitecheck_'+body.checkId,expiresAt:new Date(Date.now()+600000).toISOString(),observed:true,chatAvailable:fixture.active,sample:{service:'AC repair',area:'Katy'}}}),{headers:{'content-type':'application/json'}});}
   throw Error('Unexpected protocol request '+u.pathname);
  };
 },{mode});
 const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));await page.goto('https://shop.fixture.test/#mc-website-check='+'a'.repeat(32)+'.'+'b'.repeat(64));await page.locator('#mcDesk .l').click();await page.waitForFunction(()=>document.querySelector('#mcDesk .check [role=status]')?.textContent.startsWith('Widget found'));assert.equal(await page.locator('#mcDesk textarea').isDisabled(),true);
 await page.evaluate(()=>window.fixture.active=true);await page.locator('[data-check-status]').click();await page.waitForFunction(()=>window.fixture.configReads>=2&&document.querySelector('[data-check-status]').disabled===false);
 if(mode==='late-initial'){await page.evaluate(()=>window.fixture.release());await page.waitForTimeout(30);}
 const enabled=['activate','late-initial'].includes(mode);assert.equal(await page.locator('#mcDesk textarea').isEnabled(),enabled,'Current public availability controls composer');
 if(enabled){await page.locator('#mcDesk textarea').fill('Keep this unsent customer question.');await page.locator('[data-check-status]').click();await page.waitForFunction(()=>!document.querySelector('[data-check-status]').disabled);assert.equal(await page.locator('#mcDesk textarea').inputValue(),'Keep this unsent customer question.');}
 const requests=await page.evaluate(()=>window.fixture.requests);assert.equal(requests.filter(r=>r.path==='/api/chat').length,0,'Status refresh must never send or replay a chat turn');assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mc_website_setup_setup-fixture')).id),'a'.repeat(32),'Same bound setup check retained');checks.push({name:width+'px '+mode+' refresh preserves probe/draft and obeys current public availability',pass:true});
 }catch(error){checks.push({name:width+'px '+mode,pass:false,error:error.stack});}finally{await context.close();}
}}finally{await browser.close();}
const report={scope:'Actual embed DOM and synthetic bound setup/config protocols; no real handler/model/provider effects',before,after:sha(readFileSync('embed.js')),checks,physicalNetwork:physical,unexpected,pageErrors};report.ok=checks.every(c=>c.pass)&&!physical&&!unexpected.length&&!pageErrors.length&&report.before===report.after;if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:report.ok,passed:checks.filter(c=>c.pass).length,total:checks.length,physical,unexpected:unexpected.length,pageErrors:pageErrors.length,failures:checks.filter(c=>!c.pass)}));if(!report.ok)process.exitCode=1;
