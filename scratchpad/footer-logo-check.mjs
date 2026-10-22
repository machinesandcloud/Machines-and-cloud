// Targeted local visual check: no server startup, secrets, APIs, models or submissions.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const args=process.argv.slice(2), option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const base=new URL(option('--base',''));
assert.ok(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port&&base.pathname==='/'&&!base.search&&!base.hash&&!base.username&&!base.password,'explicit local origin required');
assert.ok(option('--playwright'),'existing Playwright module path required');
const {chromium}=await import(pathToFileURL(resolve(option('--playwright'))));
const hash=body=>createHash('sha256').update(body).digest('hex');
const files=['index.html','about.html','thank-you.html','anaheim.html','styles.css','script.js','stories.js','agent-widget.js','site-refresh.css'];
const source=Object.fromEntries(files.map(file=>[file,hash(readFileSync(file))]));
const baseline=Object.fromEntries(files.map(file=>[file,hash(execFileSync('git',['show',`HEAD:${file}`]))]));
const report={startedAt:new Date().toISOString(),base:base.origin,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source,baselineSource:baseline,changedFiles:files.filter(file=>source[file]!==baseline[file]),logoAssetSha256:hash(readFileSync('assets/logo-dark.png')),checks:[],issues:[],pages:[],screenshots:[],blockedRequests:[],browserErrors:[],formSubmissions:0};
const check=(name,pass,detail)=>{const row={name,pass:!!pass,...(detail===undefined?{}:{detail})};report.checks.push(row);if(!pass)report.issues.push(row);};
const originalCss=execFileSync('git',['show','HEAD:site-refresh.css'],{encoding:'utf8'});
check('only accepted frontend changes are footer ratio and launcher clearance',report.changedFiles.length===1&&report.changedFiles[0]==='site-refresh.css'&&readFileSync('site-refresh.css','utf8')===originalCss.replace('.site-refresh .footer-simple .footer-logo img { width: 165px; }','.site-refresh .footer-simple .footer-logo img { width: 165px; height: auto; }').replace('.site-refresh .footer-simple { padding: 45px 0 25px;', '.site-refresh .footer-simple { padding: 45px 0 85px;'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:width<=390?844:1000},reducedMotion:'reduce',serviceWorkers:'block'});
    await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==base.origin||request.method()!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/.netlify/functions/')){report.blockedRequests.push({method:request.method(),url:url.origin+url.pathname});return route.abort();}return route.continue();});
    await context.exposeBinding('__footerSubmit',()=>report.formSubmissions++);
    await context.addInitScript(()=>document.addEventListener('submit',event=>{event.preventDefault();void window.__footerSubmit();},true));
    const page=await context.newPage();page.on('pageerror',error=>report.browserErrors.push(error.message));
    for(const path of ['/','/about.html','/thank-you.html']){
      const response=await page.goto(base.origin+path,{waitUntil:'domcontentloaded'});
      const logo=page.locator('.footer-simple .footer-logo img');await logo.evaluate(image=>image.decode());await logo.scrollIntoViewIfNeeded();
      const info=await logo.evaluate(image=>{const rect=image.getBoundingClientRect(),style=getComputedStyle(image);return{naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,width:rect.width,height:rect.height,renderedRatio:rect.width/rect.height,naturalRatio:image.naturalWidth/image.naturalHeight,expectedHeight:rect.width*image.naturalHeight/image.naturalWidth,computedWidth:style.width,computedHeight:style.height,visibility:style.visibility,complete:image.complete,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};});
      report.pages.push({path,viewportWidth:width,status:response.status(),...info});
      check(`${path} ${width}px responds200`,response.status()===200);
      check(`${path} ${width}px logo decoded natural250x82`,info.complete&&info.naturalWidth===250&&info.naturalHeight===82,info);
      check(`${path} ${width}px rendered165x54 preserves natural ratio`,Math.abs(info.width-165)<.1&&Math.abs(info.height-info.expectedHeight)<.1&&Math.abs(info.renderedRatio-info.naturalRatio)<.005&&info.visibility==='visible',info);
      check(`${path} ${width}px no horizontal overflow`,info.scrollWidth<=width+1,info.scrollWidth);
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      const links=await page.locator('footer').evaluate(footer=>{
        const launcher=document.querySelector('#mcAgentLauncher'),b=launcher.getBoundingClientRect(),style=getComputedStyle(launcher),visible=style.visibility!=='hidden'&&style.display!=='none'&&style.opacity!=='0';
        return [...footer.querySelectorAll('a')].map(link=>{const a=link.getBoundingClientRect(),hit=document.elementFromPoint((a.left+a.right)/2,(a.top+a.bottom)/2);return{text:link.textContent.trim()||link.querySelector('img')?.alt,rect:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},inViewport:a.left>=0&&a.right<=innerWidth+1&&a.top>=0&&a.bottom<=innerHeight+1,coveredByLauncher:visible&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,receivesHit:hit===link||link.contains(hit)};});
      });
      report.pages.at(-1).footerLinks=links;
      check(`${path} ${width}px all footer links hit directly without launcher overlap`,links.length>0&&links.every(link=>link.inViewport&&!link.coveredByLauncher&&link.receivesHit),links);
      if(path==='/'&&[1440,390].includes(width)){const shot=`scratchpad/footer-logo-${width}.png`;await page.screenshot({path:shot,animations:'disabled'});report.screenshots.push(shot);}
    }
    await context.close();
  }
  check('no JavaScript errors',report.browserErrors.length===0,report.browserErrors);
  check('no API or nonGET requests attempted',report.blockedRequests.every(row=>row.method==='GET'&&row.url.startsWith('https://fonts.googleapis.com/')),report.blockedRequests.filter(row=>!(row.method==='GET'&&row.url.startsWith('https://fonts.googleapis.com/'))));
  check('no form submissions',report.formSubmissions===0);
  const after=Object.fromEntries(files.map(file=>[file,hash(readFileSync(file))]));check('source stayed stable',JSON.stringify(source)===JSON.stringify(after));
  report.sourceFingerprint=hash(JSON.stringify(source));report.result=report.issues.length?'failed':'passed';
}catch(error){report.result='failed';report.error=String(error.message||error);}
finally{await browser.close();report.finishedAt=new Date().toISOString();writeFileSync('scratchpad/footer-logo-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({result:report.result,checks:report.checks.length,issues:report.issues.length,error:report.error}));if(report.result!=='passed')process.exitCode=1;}
