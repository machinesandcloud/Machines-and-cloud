// Root-owned approved sign-in rehearsal. Secrets and message bodies stay in memory.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='https://machinesandcloud.com',recipient='ngoumnaisteve@gmail.com',subject='Your Machines & Cloud sign-in link',ledgerPath='scratchpad/admin-hosted-8496d65-ledger.json',out='scratchpad/admin-hosted-8496d65-auth-second.json';
if(existsSync(out))throw new Error('Never reopen a sign-in rehearsal');
const ledger=JSON.parse(readFileSync(ledgerPath));if(ledger.status!=='active'||ledger.emailAttempts>=2)throw new Error('Closed/exhausted approved ledger');
const report={phase:'second approved email; original active session untouched',startedAt:new Date().toISOString(),recipient,scope:'One operator email; provider delivery metadata; one-use exchange; one authenticated readonly GET; signout. No tenant edits, model, voice, purchase or billing.',checks:[],providerReads:[],authenticationActions:[],emailAttempts:0};
const persist=()=>{writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');writeFileSync(out,JSON.stringify(report,null,2)+'\n');};
const check=(name,pass)=>{report.checks.push({name,pass:!!pass});if(!pass)throw new Error(name);};
let session=null;
async function auth(action,body={}){
 const row={method:'POST',path:'/api/manage',action,at:new Date().toISOString(),status:null};
 if(action==='request_link'){if(ledger.emailAttempts>=2)throw new Error('Email limit');ledger.emailAttempts++;report.emailAttempts++;}
 ledger.authenticationActions.push(row);report.authenticationActions.push(row);persist();
 const r=await fetch(base+'/api/manage',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Origin:base,...(session?{Authorization:'Bearer '+session}:{})},body:JSON.stringify({action,...body})});row.status=r.status;const data=await r.json();persist();return {r,data};
}
async function provider(path){
 if(report.providerReads.length>=6)throw new Error('Provider-read limit');
 const row={method:'GET',path,at:new Date().toISOString(),status:null};report.providerReads.push(row);ledger.providerReadRequests.push(row);persist();
 const r=await fetch('https://api.resend.com'+path,{headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY},redirect:'error',signal:AbortSignal.timeout(15000)});row.status=r.status;persist();if(!r.ok)throw new Error('Provider email verification unavailable (HTTP '+r.status+')');return r.json();
}
try{
 const start=Date.now(),send=await auth('request_link',{email:recipient});check('Hosted operator request accepted by mail provider',send.r.status===202&&send.data.ok===true&&send.data.delivery==='email');
 process.loadEnvFile('.env');check('Email provider read credential is present',!!process.env.RESEND_API_KEY);
 let found;
 for(let attempt=0;attempt<3;attempt++){
  const list=await provider('/emails?limit=5');found=list.data?.find(x=>x.subject===subject&&Array.isArray(x.to)&&x.to.map(y=>y.toLowerCase()).includes(recipient)&&Date.parse(x.created_at)>=start-5000);
  if(found)break;
  if(attempt<2)await new Promise(r=>setTimeout(r,1000));
 }
 check('Exact approved send found in provider records',!!found);
 report.email={id:found.id,createdAt:found.created_at,from:found.from,to:recipient,subject,lastEvent:found.last_event};
 report.providerDeliveryInitially=found.last_event;
 const message=await provider('/emails/'+encodeURIComponent(found.id));check('Retrieved record matches the exact approved message',message.id===found.id&&message.subject===subject&&message.to?.includes(recipient));
 const match=String(message.text||'').match(/https:\/\/machinesandcloud\.com\/admin\.html#verify=([a-f0-9]{64})/);check('Sent link has fixed admin destination and opaque proof',!!match);
 const exchange=await auth('exchange',{token:match[1]});check('Actual one-use operator exchange succeeds',exchange.r.status===200&&exchange.data.ok===true&&exchange.data.email===recipient&&/^[a-f0-9]{64}$/.test(exchange.data.session));session=exchange.data.session;
 report.operatorSession={email:exchange.data.email,expiresAt:exchange.data.expiresAt,tokenPersisted:false};
 if(ledger.readOnlyRequests.length>=25)throw new Error('Read limit');
 const row={number:ledger.readOnlyRequests.length+1,method:'GET',path:'/api/manage',at:new Date().toISOString(),purpose:'authenticated_operator_read',status:null};ledger.readOnlyRequests.push(row);persist();
 const r=await fetch(base+'/api/manage',{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+session,Origin:base}});row.status=r.status;row.cacheControl=r.headers.get('cache-control');const raw=await r.text();row.sha256=createHash('sha256').update(raw).digest('hex');row.bytes=Buffer.byteLength(raw);persist();
 const dto=JSON.parse(raw);check('Actual operator can read the hosted customer dashboard',r.status===200&&dto.ok===true&&dto.operator?.email===recipient&&Array.isArray(dto.customers));check('Authenticated dashboard is not cacheable',/no-store/.test(row.cacheControl||''));
 check('Dashboard has no credential-bearing DTO fields',!/(?:"ownerKey"|"refreshToken"|"authToken"|"apiKey"|"apiSecret"|"password"|"workspaceOperationClaims"|"tenantIdentity")\s*:/.test(raw));
 report.dashboard={status:r.status,customerCount:dto.customers.length,total:dto.total,hasNextPage:!!dto.nextCursor,rawCustomerDataPersisted:false,operator:recipient,sha256:row.sha256,cacheControl:row.cacheControl};
  if(!['delivered','opened','clicked'].includes(message.last_event))await new Promise(resolve=>setTimeout(resolve,30000));
  const delivered=await provider('/emails/'+encodeURIComponent(found.id));report.email.lastEvent=delivered.last_event;check('Second approved message is delivered to the receiving server',['delivered','opened','clicked'].includes(delivered.last_event));
}catch(error){report.error=error.message;report.checks.push({name:'Approved sign-in verification completed',pass:false,error:error.message});}
finally{
 if(session){try{const closed=await auth('sign_out');check('Temporary verification session is revoked',closed.r.status===200&&closed.data.ok===true);report.operatorSession.revoked=true;}catch(error){report.checks.push({name:'Temporary session revocation',pass:false,error:error.message});}session=null;}
 report.finishedAt=new Date().toISOString();report.summary={passed:report.checks.filter(x=>x.pass).length,failed:report.checks.filter(x=>!x.pass).length,emailAttempts:report.emailAttempts,maximumEmailAttempts:2,authPosts:report.authenticationActions.length,providerReadRequests:report.providerReads.length,hostedGETsTotal:ledger.readOnlyRequests.length};persist();console.log(JSON.stringify({output:out,summary:report.summary,email:report.email,error:report.error}));if(report.summary.failed)process.exitCode=1;
}
