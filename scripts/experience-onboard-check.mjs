// Bounded browser regression: local static/API fixtures only; no email, AI or provider requests.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC_|TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
globalThis.fetch = async () => { throw new Error('Recovery QA blocks server networking'); };
const { e164 } = await import('../netlify/functions/lib/send.mjs');
const root = resolve('.'), base = 'http://127.0.0.1:8896';
const outputIndex = process.argv.indexOf('--output'), output = outputIndex >= 0 ? process.argv[outputIndex + 1] : 'scratchpad/onboard-recovery-ui.json';
if (!output?.startsWith('scratchpad/') || !output.endsWith('.json')) throw new Error('QA output must be a JSON file under scratchpad/');
if (existsSync(output) || existsSync(output.slice(0, -5) + '.png')) throw new Error('Refusing to overwrite retained QA evidence');
const files = ['onboard.html', 'onboard.js', 'onboard.css', 'product-ui.css'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const report = { at: new Date().toISOString(), mode: 'browser/API fixtures; no actual email, model or provider', sourceBefore: hashes(), checks: [], blockedExternal: [], pageErrors: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const { chromium } = await import('/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const state = { fields: { name: 'Avery Owner', business: 'Bayou Service', trade: 'HVAC', services: 'AC repair', serviceArea: 'Katy', hours: 'Mon-Fri 8am-5pm', windows: '8 to 12', plan: 'starter', desiredChannels: ['web'] }, step: 0, revision: 0, requests: [], fieldError: null };
await context.addInitScript(() => sessionStorage.setItem('mc-onboarding-session-v1', 'fixture-session'));
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if(url.origin!==base&&['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.fulfill({status:200,contentType:'text/css',body:''});
  if (url.origin !== base) { report.blockedExternal.push(url.origin); return route.abort('blockedbyclient'); }
  if (url.pathname.startsWith('/api/')) {
    const body = request.method() === 'GET' ? null : request.postDataJSON(); state.requests.push({ path: url.pathname, method: request.method(), body });
    if (url.pathname === '/api/access') {
      if (request.method() === 'PUT') { state.fields = body.fields; state.step = body.step; state.revision++; }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ email: 'owner@example.test', draft: { fields: state.fields, step: state.step, revision: state.revision }, marketing: { preference: false } }) });
    }
    if (url.pathname === '/api/onboard') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'fixture_validation', field: state.fieldError, message: 'Please correct the saved callback details.' }) });
    return route.fulfill({ status: 403, body: '{}' });
  }
  let file = resolve(root, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(root + '/') || !existsSync(file) || statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
  const contentType = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream';
  return route.fulfill({ status: 200, contentType, body: readFileSync(file) });
});
const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
const step = number => page.locator('fieldset[data-step="' + number + '"]');
const next = async number => { await page.locator('#next').click(); await step(number).waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.getElementById('next').disabled); };
try{
 await page.goto(base+'/onboard.html');await step(1).waitFor({state:'visible'});
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:950});await page.locator('.ui-skip').focus();await page.keyboard.press('Enter');check('Keyboard skip reaches setup inside the unique main '+width,await page.evaluate(()=>document.activeElement.id==='setup-main'&&!!document.activeElement.closest('main')&&document.querySelectorAll('main').length===1));
  await page.screenshot({path:output.slice(0,-5)+'-'+width+'.png'});check('Questionnaire visible and fits '+width,await step(1).isVisible()&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#phone').fill('7135550100');for(let n=2;n<=4;n++){await next(n);check('Saved navigation exposes exact native progress '+width+' step'+n,await page.locator('#onboardProgress').evaluate((el,n)=>el.value===n&&el.max===4,n));}
  check('No account creation before explicit final confirmation '+width,!state.requests.some(r=>r.path==='/api/onboard'));
  for(let n=3;n>=1;n--){await page.locator('#back').click();await step(n).waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('next').disabled);}
 }
}finally{report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.summary={passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length};writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({...report.summary,sourceStable:report.sourceStable,pageErrors:report.pageErrors,blockedExternal:report.blockedExternal}));if(report.summary.failed||!report.sourceStable||report.pageErrors.length||report.blockedExternal.length)process.exitCode=1;}
