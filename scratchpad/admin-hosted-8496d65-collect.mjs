// Root-owned bounded hosted transport. No retries; reserve before every request.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const base='https://machinesandcloud.com',commit='8496d65645edd457ed8b1f59f350fd00313322b9',deployId='6ada09eaf45d63cacff31395',prefix='scratchpad/admin-hosted-8496d65',ledgerPath=prefix+'-ledger.json',manifestPath=prefix+'-captures.json',mode=process.argv[2];
if(!['--public','--health'].includes(mode))throw new Error('Use --public or --health');
const sha=x=>createHash('sha256').update(x).digest('hex');
let ledger,manifest;
if(mode==='--public'){
 if(existsSync(ledgerPath)||existsSync(manifestPath))throw new Error('Never reopen public collection');
 ledger={commit,deployId,startedAt:new Date().toISOString(),status:'active',maximumReadOnlyHostedRequests:25,maximumSignInEmails:2,readOnlyRequests:[],authenticationActions:[],emailAttempts:0,providerReadRequests:[],retries:0};
 manifest={commit,deployId,captures:[],requests:[],checks:[]};mkdirSync(prefix+'-captured',{recursive:false});
}else{ledger=JSON.parse(readFileSync(ledgerPath));manifest=JSON.parse(readFileSync(manifestPath));if(ledger.status!=='active'||manifest.captures.some(x=>x.path==='/api/health'))throw new Error('Health already attempted or ledger closed');}
const persist=()=>{writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');manifest.requests=ledger.readOnlyRequests;writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');};persist();
const assetPairs=[['/admin','admin.html'],['/admin.js','admin.js'],['/admin.css','admin.css'],['/desk','desk.html'],['/desk.js','desk.js'],['/onboard','onboard.html'],['/onboard.js','onboard.js'],['/styles.css','styles.css'],['/script.js','script.js'],['/assets/logo-dark.png','assets/logo-dark.png'],['/','index.html'],['/signup-intake.js','signup-intake.js'],['/site-refresh.css','site-refresh.css']];
const items=[...assetPairs.map(([path,source])=>({path,source,kind:source.endsWith('.html')?'html':'asset',status:200})),{path:'/api/manage',kind:'anonymous',status:401,error:'sign_in_required'},{path:'/api/access',kind:'anonymous',status:401,error:'sign_in_required'},{path:'/api/intake',kind:'anonymous',status:403,error:'forbidden'},{path:'/api/onboard?c=publication-check-8496d656',kind:'anonymous',status:404,error:'not_found'},{path:'/api/client?c=publication-check-8496d656',kind:'anonymous',status:404,error:'not_found'},...['/.env','/product/ADMIN-QA.md','/scripts/operator-management-qa-check.mjs','/netlify/functions/lib/phone-activation.mjs'].map(path=>({path,kind:'private',status:404}))];
if(items.length!==22)throw new Error('Public plan drift');
function check(name,pass,detail){manifest.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});}
async function get(item){let target=new URL(item.path,base),response,bytes;const first=ledger.readOnlyRequests.length;
 for(let n=0;n<2;n++){
  if(!['machinesandcloud.com','www.machinesandcloud.com'].includes(target.hostname)||target.protocol!=='https:'||ledger.readOnlyRequests.length>=25)throw new Error('Read budget/host guard');
  const row={number:ledger.readOnlyRequests.length+1,method:'GET',path:target.pathname+target.search,host:target.hostname,at:new Date().toISOString(),purpose:item.kind,status:null};ledger.readOnlyRequests.push(row);persist();
  try{response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'MachinesCloud-Approved-Release-Verification/8496d65'}});row.status=response.status;row.contentType=response.headers.get('content-type');row.cacheControl=response.headers.get('cache-control');
   if([301,302,303,307,308].includes(response.status)){row.redirect=response.headers.get('location');persist();if(n===1)throw new Error('Redirect headroom exhausted');target=new URL(row.redirect,target);continue;}
   bytes=Buffer.from(await response.arrayBuffer());row.sha256=sha(bytes);row.bytes=bytes.length;persist();break;
  }catch(error){row.error=error.name;persist();throw error;}
 }
 if(!bytes)throw new Error('No final body');
 const file=prefix+'-captured/'+String(first+1).padStart(2,'0')+'.bin';writeFileSync(file,bytes,{flag:'wx'});
 const capture={path:item.path,finalURL:target.href,file,sha256:sha(bytes),status:response.status,contentType:response.headers.get('content-type'),cacheControl:response.headers.get('cache-control'),source:item.source,kind:item.kind};
 manifest.captures.push(capture);check(item.path+' status',response.status===item.status,{expected:item.status,actual:response.status});
 if(item.source){const src=execFileSync('git',['show',commit+':'+item.source]);capture.sourceSha256=sha(src);capture.exactBytesMatch=sha(src)===capture.sha256;if(item.kind==='asset')check(item.source+' exact approved bytes',capture.exactBytesMatch);else check(item.source+' HTML content type',/text\/html/i.test(capture.contentType||''));}
 if(['anonymous','health'].includes(item.kind)){let body;try{body=JSON.parse(bytes.toString());}catch{};check(item.path+' expected anonymous/health body',item.kind==='health'?body?.ok===true:body?.error===item.error&&!body?.session&&!body?.client&&!body?.customer&&!body?.draft&&!body?.prospects);capture.bodySummary=body;if(item.kind==='health')manifest.health={status:response.status,body};}
 persist();return capture;
}
try{for(const item of mode==='--public'?items:[{path:'/api/health',kind:'health',status:200}])await get(item);}
catch(error){manifest.error=error.message;persist();throw error;}
finally{manifest.summary={passed:manifest.checks.filter(x=>x.pass).length,failed:manifest.checks.filter(x=>!x.pass).length,hostedGetRequests:ledger.readOnlyRequests.length,maximumHostedGetRequests:25};persist();console.log(JSON.stringify({mode,...manifest.summary,failures:manifest.checks.filter(x=>!x.pass),error:manifest.error}));}
if(manifest.summary.failed)process.exitCode=1;
