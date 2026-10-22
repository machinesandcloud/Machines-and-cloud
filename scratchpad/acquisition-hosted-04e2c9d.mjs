// Exact approved release: at most25 hosted GETs; browser receives retained bytes only.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const root = '/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud';
const commit = '04e2c9d27b3179f8bc1c556d80750eb0a1447f3b', deployId = '6ad9b3a60d48419c216d821b';
const base = 'https://machinesandcloud.com', prefix = root + '/scratchpad/acquisition-hosted-04e2c9d';
const mode = process.argv[2]; if (!['--prepare', '--run', '--replay'].includes(mode)) throw new Error('Use --prepare, --run, or --replay');
const sha = value => createHash('sha256').update(value).digest('hex');
const source = path => execFileSync('git', ['show', commit + ':' + path], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const assets = ['styles.css','site-refresh.css','script.js','stories.js','agent-widget.js','signup-intake.js','onboard.js','desk.js','assets/logo-dark.png','assets/photos/hero-hvac.jpg','assets/favicon.png'];
const items = [
  { path:'/', source:'index.html', kind:'html', status:200 },
  { path:'/onboard', source:'onboard.html', kind:'html', status:200 },
  { path:'/desk', source:'desk.html', kind:'html', status:200 },
  ...assets.map(path => ({ path:'/' + path, source:path, kind:'asset', status:200 })),
  ...['.env','package.json','product/SETUP-FOR-BROWSER-AGENT.md','netlify/functions/intake.mjs','scratchpad/acquisition-final-disposition.json'].map(path => ({path:'/' + path, kind:'private', status:404})),
  { path:'/api/intake', kind:'api', status:403, error:'forbidden' },
  { path:'/api/access', kind:'api', status:401, error:'sign_in_required' },
  { path:'/api/onboard?c=publication-check-04e2c9d-no-account', kind:'api', status:404, error:'not_found' },
  { path:'/api/client?c=qa-release-04e2c9d-absent', kind:'api', status:404, error:'not_found' },
  { path:'/api/health', kind:'health', status:200 }
];
if (items.length !== 24) throw new Error('Unexpected base request count');
const scriptHash = sha(readFileSync(new URL(import.meta.url)));
const canonicalPlan = { commit, deployId, origin:base, maximumHostedRequests:25, baseRequests:items.length, remainingRedirectHeadroom:1, method:'GET', retries:0, allowedRedirectHosts:['machinesandcloud.com','www.machinesandcloud.com'], items:items.map(item => ({...item,...(item.source ? { sourceHash:sha(source(item.source)) } : {})})), scriptHash };
const output = prefix + (mode === '--prepare' ? '-prepare.json' : mode === '--replay' ? '-replay.json' : '.json');
if (existsSync(output)) throw new Error('Refusing to overwrite retained proof: ' + output);
const report = { startedAt:new Date().toISOString(), commit, deployId, mode, scope:'24 planned GETs, at most25 including redirects, no retry. No POST, signup, verification email, model, microphone, provider or billing action. Browser networking is fully intercepted.', checks:[], requests:[], browser:{intercepted:[],errors:[]}, captures:[] };
const check = (name, ok, detail) => report.checks.push({name,ok:!!ok,...(detail === undefined ? {} : {detail})});
const cache = new Map();
const contentType = path => /\.css$/.test(path) ? 'text/css' : /\.js$/.test(path) ? 'text/javascript' : /\.png$/.test(path) ? 'image/png' : /\.jpg$/.test(path) ? 'image/jpeg' : 'text/html';
let ledger = null;
function persistLedger() { const path = prefix + '-ledger.json'; writeFileSync(path + '.tmp', JSON.stringify(ledger,null,2) + '\n'); renameSync(path + '.tmp', path); }
async function get(item, url = base + item.path, depth = 0) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || !canonicalPlan.allowedRedirectHosts.includes(target.hostname)) throw new Error('Disallowed hosted URL');
  if (ledger.requests.length >= 25) throw new Error('Aggregate25 GET ceiling reached');
  const entry = { ordinal:ledger.requests.length + 1, method:'GET', url:target.href, item:item.path, reservedAt:new Date().toISOString() };
  ledger.requests.push(entry); persistLedger(); // Reserve before fetch; a timeout/failure consumes its attempt.
  const response = await fetch(target.href, { method:'GET', redirect:'manual', credentials:'omit', signal:AbortSignal.timeout(20000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  Object.assign(entry,{status:response.status,bytes:bytes.length,sha256:sha(bytes),contentType:response.headers.get('content-type'),headers:Object.fromEntries(['x-frame-options','x-content-type-options','referrer-policy','permissions-policy','content-security-policy','x-nf-request-id','location'].map(key => [key,response.headers.get(key)]))}); persistLedger();
  if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
    if (depth >= 2) throw new Error('Unexpected redirect depth'); return get(item,new URL(response.headers.get('location'),target).href,depth+1);
  }
  const bodyFile = prefix + '-captured/' + String(entry.ordinal).padStart(2,'0') + '.bin'; writeFileSync(bodyFile,bytes,{flag:'wx'});
  const captured = { path:item.path, finalURL:target.href, file:bodyFile.slice(root.length+1), status:response.status, contentType:entry.contentType, sha256:entry.sha256, bytes:bytes.length };
  report.captures.push(captured);
  if (item.source && response.status === 200) { const row = {bytes,status:response.status,contentType:entry.contentType}; cache.set(new URL(base+item.path).pathname,row); if(item.source.endsWith('.html')) cache.set('/'+item.source,row); cache.set(target.pathname,row); }
  return {response,bytes,entry};
}
async function browserProof(stage) {
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',async route => {
      const request=route.request(),url=new URL(request.url()),captured=cache.get(url.pathname),row={method:request.method(),path:url.origin===base?url.pathname:url.origin,disposition:'blocked'};report.browser.intercepted.push(row);
      if(request.method()==='GET'&&url.origin===base&&!url.pathname.startsWith('/api/')&&captured){row.disposition=stage;return route.fulfill({status:captured.status,contentType:captured.contentType||'application/octet-stream',body:captured.bytes});}
      return route.abort('blockedbyclient');
    });
    const page=await context.newPage();page.on('pageerror',error=>report.browser.errors.push(error.message));
    await page.goto(base+'/',{waitUntil:'domcontentloaded'});
    check(stage+': homepage CTA points to preliminary form',new URL(await page.locator('.site-hero .site-button').getAttribute('href'),base).hash==='#pilot');
    const names=await page.locator('.site-plan-name').allTextContents();check(stage+': Coverage, Follow-through and Enterprise are present',JSON.stringify(names)===JSON.stringify(['Coverage','Follow-through','Enterprise']),names);
    const prices=await page.locator('.site-price strong').allTextContents();check(stage+': visible prices are99,249 and custom',JSON.stringify(prices)===JSON.stringify(['$99','$249','Custom']),prices);
    check(stage+': preliminary form has3 required answers and unchecked optional preference',await page.locator('#signup-intake [required]').count()===3&&!await page.locator('#intake-marketing').isChecked()&&await page.locator('#intake-goal').getAttribute('required')===null);
    await page.locator('#navToggle').click();check(stage+': one header X closes mobile menu without duplicate button',await page.locator('#navToggle').getAttribute('aria-expanded')==='true'&&await page.getByRole('button',{name:'Close menu',exact:true}).count()===1&&await page.locator('.nav-menu-close').count()===0&&await page.locator('#navMenu button').count()===0);
    await page.keyboard.press('Escape');check(stage+': Escape closes menu and restores header focus',await page.locator('#navToggle').getAttribute('aria-expanded')==='false'&&await page.evaluate(()=>document.activeElement.id==='navToggle'));
    for(const scenario of ['sms','call','spanish']) {
      await page.locator('[data-example='+scenario+']').click();
      check(stage+': '+scenario+' Watch contains12 messages',await page.locator('#example-messages .site-message').count()===12);
      check(stage+': '+scenario+' has no numeric message counter',!/\b\d+\s+of\s+\d+\s+messages\b/i.test(await page.locator('#demo-wrap').innerText())&&await page.locator('#example-progress').count()===0);
      check(stage+': '+scenario+' Watch stays out of live mode',await page.locator('#example-mode-watch').getAttribute('aria-pressed')==='true'&&await page.locator('#example-mode-live').getAttribute('aria-pressed')==='false');
    }
    const shot=async(name,fullPage=false)=>{const path=prefix+'-'+(mode==='--prepare'?'prepare-':mode==='--replay'?'replay-':'')+name+'.png';if(existsSync(path))throw new Error('Refusing screenshot overwrite');await page.screenshot({path,fullPage});report.captures.push({screenshot:path.slice(root.length+1)});};
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});await page.locator('#signup-intake').scrollIntoViewIfNeeded();
      const box=await page.locator('#signup-intake').boundingBox();check(stage+': intake fits '+width+'px',box.x>=0&&box.x+box.width<=width+1&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(width===390)await shot('intake-390');
      const cards=await page.locator('.site-plan').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,right:r.right,client:node.clientWidth,scroll:node.scrollWidth};}));check(stage+': three plan cards fit '+width+'px',cards.length===3&&cards.every(row=>row.x>=0&&row.right<=width+1&&row.scroll<=row.client+1));
    }
    for(const width of [320,1440]) {
      await page.setViewportSize({width,height:900});await page.goto(base+'/onboard',{waitUntil:'domcontentloaded'});
      check(stage+': signup gate visible and private questions hidden at '+width+'px',await page.locator('#access-gate').isVisible()&&await page.locator('#access-email').isVisible()&&await page.locator('#ob').isHidden());
      check(stage+': signup fits '+width+'px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(width===320)await shot('signup-320',true);
    }
    await page.setViewportSize({width:390,height:844});await page.goto(base+'/desk',{waitUntil:'domcontentloaded'});
    check(stage+': owner gate hides all private data without credentials',await page.locator('#portalRecovery').isVisible()&&await page.locator('#portalContent').isHidden()&&await page.locator('#status').innerText()==='Sign in to continue');await shot('owner-gate-390');
    check(stage+': browser attempted no API or non-GET request',!report.browser.intercepted.some(row=>row.path.startsWith('/api/')||row.method!=='GET'));
    check(stage+': browser JavaScript has no errors',report.browser.errors.length===0,report.browser.errors);
    await context.close();
  } finally {await browser.close();}
}
try {
  if(mode==='--prepare') {
    if(existsSync(prefix+'-plan.json'))throw new Error('Prepared plan already exists');
    globalThis.fetch=async()=>{throw new Error('No network allowed during source-only preparation');};
    for(const item of canonicalPlan.items.filter(item=>item.source)){const row={bytes:source(item.source),status:200,contentType:contentType(item.source)};cache.set(new URL(base+item.path).pathname,row);if(item.source.endsWith('.html'))cache.set('/'+item.source,row);}
    await browserProof('pinned-source-fixture');
    if(report.checks.some(row=>!row.ok))throw new Error('Source-only preflight returned checks');
    writeFileSync(prefix+'-plan.json',JSON.stringify(canonicalPlan,null,2)+'\n',{flag:'wx'});
  } else if(mode==='--run') {
    const plan=JSON.parse(readFileSync(prefix+'-plan.json','utf8'));if(JSON.stringify(plan)!==JSON.stringify(canonicalPlan))throw new Error('Prepared plan/source/script hash drift');
    if(!process.argv.includes('--approved-read-only'))throw new Error('Root execution confirmation flag is required');
    const ledgerPath=prefix+'-ledger.json';if(existsSync(ledgerPath))throw new Error('Never reopen an existing hosted ledger');
    ledger={commit,deployId,status:'active',startedAt:new Date().toISOString(),maximumHostedRequests:25,requests:[]};writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n',{flag:'wx'});mkdirSync(prefix+'-captured',{recursive:false});
    for(const item of plan.items) {
      const found=await get(item);check('Hosted '+item.path+' returns'+item.status,found.response.status===item.status,{status:found.response.status});
      if(item.kind==='asset')check('Deployed '+item.source+' bytes match approved commit',found.entry.sha256===item.sourceHash);
      if(item.kind==='html')check('Hosted '+item.path+' is HTML',/text\/html/i.test(found.entry.contentType||''));
      if(item.kind==='api'||item.kind==='health'){let body;try{body=JSON.parse(found.bytes.toString());}catch{};check('Hosted '+item.path+' has expected read-only response',item.kind==='health'?body?.ok===true:body?.error===item.error&&!body?.client&&!body?.draft&&!body?.session&&!body?.prospects,body);if(item.kind==='health')report.health={status:found.response.status,body};}
    }
    report.requests=ledger.requests;
    if(report.checks.some(row=>!row.ok))throw new Error('Hosted preflight returned checks; retained bytes remain replayable without more GETs');
    await browserProof('captured-deployed-bytes');
  } else {
    globalThis.fetch=async()=>{throw new Error('No network allowed during captured-byte replay');};
    const prior=JSON.parse(readFileSync(prefix+'.json','utf8'));if(prior.commit!==commit)throw new Error('Wrong captured commit');
    for(const captured of prior.captures.filter(row=>row.file)){const bytes=readFileSync(root+'/'+captured.file);if(sha(bytes)!==captured.sha256)throw new Error('Captured bytes changed');if(captured.status===200&&!captured.path.startsWith('/api/')){const row={bytes,status:captured.status,contentType:captured.contentType};cache.set(new URL(base+captured.path).pathname,row);cache.set(new URL(captured.finalURL).pathname,row);const item=items.find(item=>item.path===captured.path);if(item?.source?.endsWith('.html'))cache.set('/'+item.source,row);}}
    report.priorHostedRequests=prior.requests.length;await browserProof('retained-deployed-bytes-replay');
  }
} catch(error){report.error=error.stack;check('Verification completed',false,error.message);}
finally {
  if(ledger){ledger.status='closed';ledger.finishedAt=new Date().toISOString();persistLedger();report.requests=ledger.requests;}
  report.finishedAt=new Date().toISOString();report.summary={hostedRequests:report.requests.length,maximumHostedRequests:25,passed:report.checks.filter(row=>row.ok).length,failed:report.checks.filter(row=>!row.ok).length,browserNetworkRequestsSent:0};writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report.summary,failures:report.checks.filter(row=>!row.ok),error:report.error}));if(report.summary.failed)process.exitCode=1;
}
