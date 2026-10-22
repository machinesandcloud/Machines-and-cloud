// Visual-only fixture. The displayed assistant text is hand-written, not model-quality evidence.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium } from '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
const browser = await chromium.launch({channel:'chrome',headless:true});
const base='http://127.0.0.1:8898', report={mode:'visual fixture only',checks:[],requests:0};
try {
for (const width of [1440,390,320]) {
const c=await browser.newContext({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'});
await c.route('**/*',async route=>{
const req=route.request(),u=new URL(req.url());
if(u.origin!==base) return route.abort();
if(u.pathname==='/api/chat') {report.requests++;return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({t:'done',reply:'For your two-truck Katy shop, I’d start with service-area and diagnostic questions, then collect the request for your review. Your $89 fee stays explicit.\n\nHere’s a draft you can adapt:\n\n> Yes, we serve Katy. Our diagnostic visit is $89. What’s happening with your AC, and what day would you like to request?\n\nWebsite chat is the part you can set up now. Phone and texting need separate setup before they can handle your calls.',events:[{type:'sales_action',action:'start_workspace',label:'Create my workspace'},{type:'sales_action',action:'see_example',scenario:'call',label:'Try the plumbing example'}]})+'\n'});}
let path=resolve('.'+(u.pathname==='/'?'/index.html':u.pathname));if(!existsSync(path)&&existsSync(path+'.html'))path+='.html';
if(!existsSync(path)) return route.fulfill({status:404,body:'notfound'});
return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'})[extname(path)]||'text/plain',body:readFileSync(path)});
});
const p=await c.newPage();await p.goto(base);await p.locator('#mcAgentLauncher').click();
await p.screenshot({path:`scratchpad/sales-desk-welcome-${width}.png`});
await p.locator('#mcAgentInput').fill('Two-truck HVAC shop in Katy. Our diagnostic is $89. What would you do for us?');await p.locator('#mcAgentInput').press('Enter');
await p.getByRole('button',{name:'Copy reply',exact:true}).waitFor();
await p.screenshot({path:`scratchpad/sales-desk-answer-${width}.png`});
const geometry=await p.locator('#mcAgentPanel').evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,viewportWidth:innerWidth,viewportHeight:innerHeight,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth};});
report.checks.push({width,...geometry,pass:geometry.x>=0&&geometry.y>=0&&geometry.right<=width&&geometry.bottom<=geometry.viewportHeight&&geometry.scrollWidth===geometry.clientWidth});
await c.close();
}
}finally{await browser.close();writeFileSync('scratchpad/sales-desk-visual.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
