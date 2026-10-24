// Verification infrastructure only. Import/default CLI performs no network or writes.
// An approved packet is a prerequisite, never a substitute for the user's approval.
import { createHash } from 'node:crypto';
import { open, readFile, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const SCOPE='owned_calendar_busy_lifecycle_v2';
export const TARGET=Object.freeze({origin:'https://machinesandcloud.com',siteId:'f87916f1-bcc4-4171-a96f-2900cbf0b6dc',accountId:'69797d78f01c70674ffef858',baselineCommit:'a0bd1488a087945f9fc3636b0101ef0e7d474f0f',baselineDeployId:'6adcd42095b9331520277607',ownerEmail:'ngoumnaisteve+mc-calendar-launch-v5-20261024@gmail.com',calendarAccount:'ngoumnaisteve@gmail.com'});
export const LIMITS=Object.freeze({site:240,writes:40,hostedChecks:25,email:3,metadata:12,blobs:84,workerPosts:0,builds:2,pushes:1,environmentWrites:8,control:144,controlWrites:16,nativeHandoffs:1});
export const RUNTIME_LIMITS=Object.freeze({oauthStart:1,tokenExchange:1,tokenRefresh:16,calendarRead:28,eventCreate:1,eventUpdate:1,eventDelete:2,workerDispatch:8,totalRequests:57});
const PHASES=['signup','census','publish','calendar','cleanup','closed'];
const CALENDAR_STORES=['calendar_connections','calendar_deliveries','calendar_oauth'];
export const BLOB_ROUTES=Object.freeze([...CALENDAR_STORES,'clients','health','calendar_execution_budgets'].map(store=>Object.freeze({store,origin:'https://api.netlify.com',prefix:`/api/v1/blobs/${TARGET.siteId}/site:${store}/`})));
const STATIC=new Set(['/desk-lead-sources.js','/desk-lead-sources.css','/desk-conversations.js','/desk-activity.js','/desk-billing.js','/desk-billing.css','/desk-requests.js','/assets/logo.png','/','/index','/index.html','/onboard','/onboard.html','/desk','/desk.html','/styles.css','/site-refresh.css','/script.js','/agent-widget.js','/stories.js','/signup-intake.js','/onboard.js','/onboard.css','/desk.js','/desk.css','/desk-connections.css','/desk-connections.js','/product-ui.css','/assets/favicon.png','/assets/logo-dark.png','/assets/photos/hero-hvac.jpg','/privacy-policy','/privacy-policy.html','/terms-of-service','/terms-of-service.html','/sms-terms','/sms-terms.html']);
const HASH=/^[a-f0-9]{64}$/, COMMIT=/^[a-f0-9]{40}$/, NONCE=/^[a-f0-9]{32}$/;
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x), exact=(x,keys)=>object(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const sha=x=>createHash('sha256').update(x).digest('hex');
const canon=x=>Array.isArray(x)?x.map(canon):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const digest=x=>sha(JSON.stringify(canon(x))), same=(a,b)=>digest(a)===digest(b);
export const packetDigest=packet=>sha(JSON.stringify(packet));
export class ControllerError extends Error{constructor(code){super('Core Calendar controller: '+code);this.code=code;}}
const fail=code=>{throw new ControllerError(code);};
export function plan(){return {scope:SCOPE,mode:'plan',executes:false,target:TARGET,limits:LIMITS,runtimeLimits:RUNTIME_LIMITS,combinedGoogleAndWorkerAttempts:57,phases:PHASES,requires:'Explicit approved private packet SHA256, final clean candidate commit, fresh exclusive ledger, exact fixture, observed signup/primary/census/policy and staged deployment evidence. No live journey is run by this helper.',limitations:['Direct request caps are separate from backend CAS Calendar quota.','One dedicated regular Chrome handoff is explicitly outside physical site counting; backend Google/worker attempts remain durably capped57. Owner performs login and consent; no password/code scraping.','Fixed calendar-live-control.py supplies at most48 control requests; guard metadata12+Blobs84 plus helper48 is at most144, without borrowed/reset counters.','No ledger reopening, automatic redirects, automatic retries or crash resumption.']};}
function validatePacket(p,{live,now}){
 if(!exact(p,['version','scope','phaseId','approved','approvalId','approvedAt','approvalExpiresAt','candidateCommit','target','limits','runtimeLimits','policyVersion','googleClientIdHash','sourceManifestSHA256','fixture','blobRoutes'])||p.version!==1||p.scope!==SCOPE||!/^core-calendar-[a-z0-9-]{8,80}$/.test(p.phaseId||'')||!COMMIT.test(p.candidateCommit||'')||!same(p.target,TARGET)||!same(p.limits,LIMITS)||!same(p.runtimeLimits,RUNTIME_LIMITS)||!/^[a-z0-9_-]{1,80}$/.test(p.policyVersion||'')||!HASH.test(p.googleClientIdHash||'')||!HASH.test(p.sourceManifestSHA256||''))fail('packet_contract');
 if(live&&(p.approved!==true||!/^approval-[a-zA-Z0-9-]{4,100}$/.test(p.approvalId||'')||!Number.isFinite(Date.parse(p.approvedAt))||Date.parse(p.approvedAt)>now||!Number.isFinite(Date.parse(p.approvalExpiresAt))||Date.parse(p.approvalExpiresAt)<=now))fail('explicit_current_approval_required');
 if(!live&&p.approved!==false)fail('offline_must_not_claim_approval');
 const f=p.fixture;
 if(!exact(f,['name','business','ownerPhone','signupFields','intakeSubmissionId','visitSubmissionId','moveSubmissionId','cancelSubmissionId','oldWindowProbeSubmissionId','cancelledWindowProbeSubmissionId','date','window','moveDate','moveWindow'])||![f.intakeSubmissionId,f.visitSubmissionId,f.moveSubmissionId,f.cancelSubmissionId,f.oldWindowProbeSubmissionId,f.cancelledWindowProbeSubmissionId].every(x=>NONCE.test(x))||new Set([f.intakeSubmissionId,f.visitSubmissionId,f.moveSubmissionId,f.cancelSubmissionId,f.oldWindowProbeSubmissionId,f.cancelledWindowProbeSubmissionId]).size!==6||typeof f.name!=='string'||typeof f.business!=='string'||!f.business.includes('Internal')||f.ownerPhone!=='+17135550142'||!/^\d{4}-\d{2}-\d{2}$/.test(f.date)||!/^\d{4}-\d{2}-\d{2}$/.test(f.moveDate)||f.date===f.moveDate&&f.window===f.moveWindow)fail('fixture_contract');
 if(!object(f.signupFields)||f.signupFields.email!==TARGET.ownerEmail||f.signupFields.name!==f.name||f.signupFields.business!==f.business||f.signupFields.phone!==f.ownerPhone||f.signupFields.plan!=='starter'||!same(f.signupFields.desiredChannels,['calendar'])||f.signupFields.botfield!==''||f.signupFields.legalName||f.signupFields.ein||f.signupFields.marketingConsent===true)fail('signup_contract');
 const windows=String(f.signupFields.windows||'').split('\n').map(x=>x.trim());if(!windows.includes(f.window)||!windows.includes(f.moveWindow))fail('fixture_windows');
 if(!same(p.blobRoutes,BLOB_ROUTES)||!Array.isArray(p.blobRoutes)||p.blobRoutes.length!==6||new Set(p.blobRoutes.map(r=>r.store)).size!==6)fail('blob_routes');
 for(const r of p.blobRoutes){if(!exact(r,['store','origin','prefix'])||![...CALENDAR_STORES,'clients','health','calendar_execution_budgets'].includes(r.store))fail('blob_routes');const u=new URL(r.origin);if(u.protocol!=='https:'||u.origin!==r.origin||u.username||u.password||!/(?:^|\.)(?:netlify\.com|netlify\.app)$/.test(u.hostname)||!r.prefix.startsWith('/')||!r.prefix.includes(TARGET.siteId)||!r.prefix.endsWith('/'))fail('blob_target');}
}
function signedReadURL(value, at) {
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!/(?:^|\.)(?:amazonaws\.com|cloudfront\.net|netlify\.com|netlify\.app|storage\.googleapis\.com)$/.test(u.hostname))fail('signed_read_host');
 const aws=u.searchParams.has('X-Amz-Signature'),google=u.searchParams.has('X-Goog-Signature');
 if(aws||google){const prefix=aws?'X-Amz':'X-Goog',date=u.searchParams.get(prefix+'-Date'),seconds=Number(u.searchParams.get(prefix+'-Expires')),signature=u.searchParams.get(prefix+'-Signature');
  if(!/^\d{8}T\d{6}Z$/.test(date||'')||!Number.isInteger(seconds)||seconds<1||seconds>3600||!/^[a-f0-9]{32,1024}$/i.test(signature||''))fail('signed_read_expiry');
  const start=Date.parse(date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)+'T'+date.slice(9,11)+':'+date.slice(11,13)+':'+date.slice(13,15)+'Z');
  if(!Number.isFinite(start)||start>at+60000||start+seconds*1000<=at)fail('signed_read_expired');
 }else{const expires=Number(u.searchParams.get('Expires'));if(!Number.isSafeInteger(expires)||expires*1000<=at||expires*1000>at+3600000||!u.searchParams.get('Signature'))fail('signed_read_expiry');}
 return u.href;
}
export async function fileLedger(path){
 const handle=await open(path,'wx',0o600); // Existing phases are never reopened.
 let poisoned=false;
 return {async append(row){if(poisoned)fail('ledger_poisoned');try{await handle.writeFile(JSON.stringify(row)+'\n');await handle.sync();}catch(error){poisoned=true;throw error;}},async close(){await handle.close();}};
}
export async function createController({mode='plan',approvedPacketPath,approvedPacketSHA256,packet,persistence,transport,now=()=>Date.now()}={}){
 if(mode==='plan')return plan();
 if(!['offline','execute'].includes(mode))fail('mode');
 const live=mode==='execute';if(live)now=()=>Date.now();
 if(live){
  if(packet||persistence||transport||!approvedPacketPath||!HASH.test(approvedPacketSHA256||''))fail('approved_packet_path_required');
  const stat=await lstat(approvedPacketPath);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o600||process.getuid&&stat.uid!==process.getuid()||stat.size>20000)fail('packet_file_permissions');
  const raw=await readFile(approvedPacketPath,'utf8');if(sha(raw)!==approvedPacketSHA256)fail('packet_digest');packet=JSON.parse(raw);
  const repo=resolve(fileURLToPath(new URL('../',import.meta.url))),head=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();if(head!==packet.candidateCommit)fail('final_candidate_commit');
  const tracked=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:repo,encoding:'utf8'}).trim();if(tracked)fail('tracked_candidate_dirty');
  const manifestPath=resolve(repo,'scratchpad/calendar-live-source-manifest.json');const manifestRaw=await readFile(manifestPath,'utf8');if(sha(manifestRaw)!==packet.sourceManifestSHA256)fail('source_manifest_digest');const manifest=JSON.parse(manifestRaw);if(!Array.isArray(manifest.files)||!manifest.files.length)fail('source_manifest_contract');const inventory=execFileSync('git',['ls-files','-z'],{cwd:repo,encoding:'utf8',maxBuffer:2000000}).split('\0').filter(path=>path&&!/^(product|scratchpad)\//.test(path)&&!path.endsWith('.md')&&(!/^\.env(?:\.|$)/.test(path)||path==='.env.example')).sort();if(!same(inventory,manifest.files.map(row=>row.path).sort()))fail('source_manifest_inventory');for(const row of manifest.files){if(!exact(row,['path','sha256'])||!HASH.test(row.sha256)||!row.path||row.path.startsWith('/')||row.path.split('/').includes('..')||row.path.startsWith('scratchpad/')||row.path.startsWith('product/'))fail('source_manifest_contract');if(sha(await readFile(resolve(repo,row.path)))!==row.sha256)fail('source_manifest_file_changed');}
  const parent=resolve(approvedPacketPath,'..');if(parent===repo||parent.startsWith(repo+'/'))fail('private_packet_outside_repository');
 }
 validatePacket(packet,{live,now:now()});
 if(live)persistence=await fileLedger(fileURLToPath(new URL(`../scratchpad/${packet.phaseId}-ledger.jsonl`,import.meta.url)));
 if(!persistence?.append)fail('durable_persistence_required');
 const send=live?fetch:transport;if(typeof send!=='function')fail('transport_required');
 const p=packet,f=p.fixture,counters=Object.fromEntries(Object.keys(LIMITS).map(k=>[k,0]));
 let phase='signup',halted=false,closed=false,poisoned=false,sequence=0,serial=Promise.resolve(),baselineSeen=false,candidateSeen=false,signupSlug=null,tenant=null,visitId=null,eventId=null,targetHash=null,policy=null,policyDigest=null,staged=false,published=false,mailTokens=new Set(),sessions=new Map(),intake=null,ownerRead=false,exchangeCount=0,calendarStarted=false,calendarCompleted=false,currentVisitRevision=null,receiptStage='none',runtimeUsed=null,cleanupConfirmed=false,oauthState=null,localStage=null,budgetFresh=false,probeIds=[],probes=new Set(),nativeClosed=false,nativeStarted=false,originalEnvironment=null,environmentRestored=false,cleanupPublished=false,nativeWindowId=null,nativeTabId=null,authorization=null,connectionConfirmed=false,ownerConnectionConfirmed=false,lastDispatch=null,lastRun=null,localSavedAt=null,firstDeployId=null,cleanupBuildRequested=false,cleanupDeployId=null;const knownDeployIds=new Set();let lastJob=null;
 const census=Object.fromEntries(CALENDAR_STORES.map(store=>[store,{lists:[],keys:null,values:new Map()}]));
 let privateClient=null;const environmentConfirmed=new Set(),environmentAttempted=new Set(),environmentRestoreAttempted=new Set();
 const state=()=>({phase,halted,closed,counters:{...counters},candidateCommit:p.candidateCommit,environmentAttempted:[...environmentAttempted],receiptStage,localStage,nativeStarted,nativeClosed,calendarCompleted,environmentRestored,cleanupPublished,tenant:tenant?{slug:signupSlug,identity:tenant,visitId,eventId,targetHash,policyDigest,policyVersion:p.policyVersion}:null});
 const persist=async row=>{if(poisoned)fail('ledger_poisoned');try{await persistence.append({at:new Date(now()).toISOString(),...row,state:state()});}catch(error){poisoned=true;throw error;}};
 await persist({event:'phase_opened',scope:SCOPE,mode,packetDigest:packetDigest(p)});
 const exclusive=fn=>{const next=serial.then(fn);serial=next.catch(()=>{});return next;};
 const deny=async code=>{halted=true;await persist({event:'denied',code});fail(code);};
 const keys=(body,allowed)=>object(body)&&Object.keys(body).every(k=>allowed.includes(k));
 function bearer(headers){const m=/^Bearer ([a-f0-9]{64})$/.exec(headers.get('authorization')||'');if(!m||!sessions.has(m[1])||sessions.get(m[1]).revoked)fail('phase_owner_session_required');return m[1];}
 function bodyJSON(body){if(typeof body==='string'){try{return JSON.parse(body);}catch{fail('body_json');}}return body;}
 const cleanupAction=action=>['cancel_visit','disconnect_calendar','cancel','sign_out','worker_cancel'].includes(action);
 function reserveAvailable({write=false,cleanup=false}={}){
  if(closed||phase==='closed')fail('phase_closed');if(halted&&!cleanup)fail('cleanup_only');
  if(now()>=Date.parse(p.approvalExpiresAt))fail('approval_expired');
  if(!cleanup&&counters.site>=LIMITS.site-8||write&&!cleanup&&counters.writes>=LIMITS.writes-4)fail('site_cleanup_reserve');
  if(phase==='calendar'&&write&&!cleanup){
   if(!runtimeUsed||!budgetFresh)fail('runtime_budget_observation_required');
   for(const [action,remaining]of Object.entries({tokenRefresh:4,calendarRead:8,eventDelete:1,workerDispatch:2}))if(RUNTIME_LIMITS[action]-runtimeUsed[action]<remaining)fail('calendar_cleanup_reserve');
   if(Date.parse(policy.expiresAt)-now()<15*60000)fail('calendar_cleanup_time_reserve');
  }
 }
 function classify(spec){
  const url=new URL(spec.url);if(url.protocol!=='https:'||url.username||url.password||url.hash)fail('url');
  const method=String(spec.method||'GET').toUpperCase(),headers=new Headers(spec.headers),body=bodyJSON(spec.body);let action,kind,cleanup=false,details={};
  if(url.origin===TARGET.origin){
   kind='site';if(headers.has('cookie')||headers.has('x-admin-key')||headers.has('x-vapi-secret'))fail('inherited_credentials');
   if(method==='GET'&&!url.pathname.startsWith('/api/')){if(!STATIC.has(url.pathname)||headers.has('authorization')||spec.body!==undefined)fail('static_path');if(['/desk','/desk.html'].includes(url.pathname)){if(!signupSlug||url.searchParams.get('c')!==signupSlug||[...url.searchParams.keys()].some(k=>k!=='c'))fail('desk_tenant');}else if([...url.searchParams.keys()].some(k=>!['plan','signin'].includes(k))||url.searchParams.has('plan')&&url.searchParams.get('plan')!=='starter'||url.searchParams.has('signin')&&url.searchParams.get('signin')!=='1')fail('static_query');action='asset';cleanup=true;}
   else{
    if(!['GET','POST','PUT'].includes(method))fail('site_method');
    if(method!=='GET'&&(headers.get('origin')!==TARGET.origin||!headers.get('content-type')?.startsWith('application/json')))fail('first_party_json');
    if(url.pathname==='/api/health'&&method==='GET'&&!url.search){action='health';cleanup=true;}
    else if(url.pathname==='/api/google/callback'&&method==='GET'&&phase==='calendar'&&calendarStarted&&url.searchParams.get('state')===oauthState&&[...url.searchParams.keys()].every(k=>['state','code','error'].includes(k))&&new Set([...url.searchParams.keys()]).size===[...url.searchParams.keys()].length&&(url.searchParams.get('code')&&!url.searchParams.has('error')||url.searchParams.get('error')==='access_denied'&&!url.searchParams.has('code'))){action='google_callback';}
    else if(url.pathname==='/api/intake'&&method==='POST'&&phase==='signup'&&!url.search){if(!same(body,{submissionId:f.intakeSubmissionId,name:f.name,email:TARGET.ownerEmail,business:f.business,trade:'other',goal:'booking',marketingConsent:false,botfield:''}))fail('intake_fixture');action='intake';}
    else if(url.pathname==='/api/access'&&!url.search){
     if(method==='GET'){bearer(headers);action='access_state';cleanup=true;}
     else if(method==='POST'&&body?.action==='request_link'&&phase==='signup'){if(!keys(body,['action','email','plan','intake'])||body.email!==TARGET.ownerEmail||body.plan!==undefined&&body.plan!=='starter'||body.intake!==undefined&&body.intake!==intake)fail('mailbox_or_link_fields');action='request_link';}
     else if(method==='POST'&&body?.action==='exchange'&&phase==='signup'){if(!same(Object.keys(body).sort(),['action','token'])||!mailTokens.has(body.token))fail('exact_message_token_required');action='exchange';}
     else if(method==='POST'&&body?.action==='sign_out'&&same(body,{action:'sign_out'})){bearer(headers);action='sign_out';cleanup=true;}
     else if(method==='PUT'&&phase==='signup'){bearer(headers);if(!exact(body,['fields','revision','step'])||!Number.isInteger(body.revision)||body.revision<0||!Number.isInteger(body.step)||body.step<0||body.step>4||!keys(body.fields,Object.keys(f.signupFields))||Object.entries(body.fields).some(([k,v])=>!same(v,f.signupFields[k])))fail('draft_fixture');action='save_draft';}
     else fail('access_action');
    }else if(url.pathname==='/api/onboard'&&!url.search&&method==='POST'&&phase==='signup'){bearer(headers);if(!same(body,f.signupFields))fail('signup_fixture');action='create_workspace';}
    else if(url.pathname==='/api/client'&&url.searchParams.get('c')===signupSlug&&[...url.searchParams.keys()].every(k=>k==='c')){
     bearer(headers);if(method==='GET'){action='owner_read';cleanup=true;}
     else if(method==='POST'&&object(body)){
      action=body.action;cleanup=cleanupAction(action);
      if(action==='start_calendar_connection'&&phase==='calendar'&&!calendarStarted&&exact(body,['action','expectedRevision','availabilityConsentVersion'])&&body.availabilityConsentVersion==='2026-10-24-busy-v1'&&HASH.test(body.expectedRevision)){}
      else if(action==='complete_calendar_connection'&&phase==='calendar'&&calendarStarted&&!nativeStarted&&!calendarCompleted&&keys(body,['action','state','code','error'])&&body.state===oauthState&&(!body.error&&typeof body.code==='string'&&body.code.length<=4096||body.error==='access_denied'&&!body.code)){}
      else if(action==='create_visit'&&phase==='calendar'&&calendarCompleted&&receiptStage==='none'&&exact(body,['action','expectedRevision','submissionId','customer_name','phone','address','issue','date','window'])&&body.submissionId===f.visitSubmissionId&&HASH.test(body.expectedRevision)&&same({customer_name:body.customer_name,phone:body.phone,address:body.address,issue:body.issue,date:body.date,window:body.window},{customer_name:'Alex Example',phone:'(713) 555-0142',address:'12 Oak St, Katy, TX (synthetic test)',issue:'Internal Calendar lifecycle verification',date:f.date,window:f.window})){}
      else if(action==='create_visit'&&phase==='calendar'&&calendarCompleted&&((localStage==='update'&&receiptStage==='create'&&body.submissionId===f.oldWindowProbeSubmissionId)||(localStage==='cancel'&&receiptStage==='update'&&body.submissionId===f.cancelledWindowProbeSubmissionId))&&exact(body,['action','expectedRevision','submissionId','customer_name','phone','address','issue','date','window'])&&HASH.test(body.expectedRevision)&&same({customer_name:body.customer_name,phone:body.phone,address:body.address,issue:body.issue,date:body.date,window:body.window},{customer_name:'Alex Example',phone:'(713) 555-0142',address:'12 Oak St, Katy, TX (synthetic test)',issue:'Internal Calendar lifecycle verification',date:localStage==='update'?f.date:f.moveDate,window:localStage==='update'?f.window:f.moveWindow})){action=localStage==='update'?'probe_old_window':'probe_cancelled_window';if(probes.has(action))fail('probe_already_attempted');}
      else if(action==='reschedule_visit'&&phase==='calendar'&&receiptStage==='create'&&exact(body,['action','expectedRevision','expectedVisitRevision','submissionId','visitId','date','window'])&&body.visitId===visitId&&body.submissionId===f.moveSubmissionId&&HASH.test(body.expectedRevision)&&body.expectedVisitRevision===currentVisitRevision&&body.date===f.moveDate&&body.window===f.moveWindow){}
      else if(action==='cancel_visit'&&['calendar','cleanup'].includes(phase)&&(['create','update'].includes(receiptStage)||phase==='cleanup'&&currentVisitRevision)&&exact(body,['action','expectedRevision','expectedVisitRevision','submissionId','visitId'])&&body.visitId===visitId&&body.submissionId===f.cancelSubmissionId&&HASH.test(body.expectedRevision)&&body.expectedVisitRevision===currentVisitRevision){}
      else if(action==='disconnect_calendar'&&['calendar','cleanup'].includes(phase)&&(receiptStage==='delete'||!localStage)&&same(body,{action})){}
      else if(action==='cancel'&&phase==='cleanup'&&(cleanupConfirmed||!calendarStarted)&&keys(body,['action','reason'])&&typeof body.reason==='string'&&body.reason.startsWith('Internal Calendar verification')){}
      else fail('owner_action_or_lifecycle');
     }else fail('owner_method');
    }else fail('site_path_or_tenant');
   }
   if(action==='asset'&&headers.has('x-service-worker-key')||action!=='worker_create'&&action!=='worker_update'&&action!=='worker_cancel'&&headers.has('x-service-worker-key'))fail('worker_credential_scope');
   if(['request_link','exchange','intake','create_workspace','save_draft'].includes(action)&&!baselineSeen)fail('baseline_evidence_required');
  }else if(url.origin==='https://api.netlify.com'&&!p.blobRoutes.some(r=>r.origin===url.origin&&(url.pathname===r.prefix.slice(0,-1)||url.pathname.startsWith(r.prefix)))){
   kind='metadata';if(method!=='GET'||spec.body!==undefined||headers.has('cookie'))fail('metadata_read_only');
   const site=`/api/v1/sites/${TARGET.siteId}`,account=`/api/v1/accounts/${TARGET.accountId}/env`;
   if(url.pathname===site&&!url.search)action='site_metadata';
   else if(url.pathname===account&&url.searchParams.get('site_id')===TARGET.siteId&&[...url.searchParams.keys()].every(k=>['site_id','context_name'].includes(k))&&(!url.searchParams.has('context_name')||url.searchParams.get('context_name')==='production'))action='environment_metadata';
   else if(/^\/api\/v1\/deploys\/[a-f0-9]{24}$/.test(url.pathname)&&knownDeployIds.has(url.pathname.split('/').at(-1))&&!url.search)action='deploy_metadata';
   else fail('metadata_target');cleanup=true;
  }else{
   kind='blobs';if(method!=='GET'||spec.body!==undefined||headers.has('cookie'))fail('blobs_read_only');
   const route=p.blobRoutes.find(r=>url.origin===r.origin&&(url.pathname===r.prefix.slice(0,-1)||url.pathname.startsWith(r.prefix)));if(!route)fail('blobs_target');
   if([...url.searchParams.keys()].some(k=>!['prefix','cursor','limit'].includes(k)))fail('blobs_query');
   const rawKey=decodeURIComponent(url.pathname.slice(route.prefix.length));details={store:route.store,key:rawKey};
   if(CALENDAR_STORES.includes(route.store)){
    if(!rawKey){if(phase!=='census'||url.searchParams.has('prefix')&&url.searchParams.get('prefix')!=='')fail('complete_census_list');action='census_list';}
    else if(phase==='census'&&census[route.store].keys?.includes(rawKey)&&!url.search)action='census_record';
    else if(route.store==='calendar_deliveries'&&tenant&&rawKey===`${signupSlug}/${tenant}/${visitId}`&&!url.search)action='job_inspection';
    else if(route.store==='calendar_connections'&&signupSlug&&rawKey===signupSlug&&!url.search)action='connection_inspection';
    else fail('blobs_record_scope');
   }else if(route.store==='clients'&&signupSlug&&rawKey===signupSlug&&!url.search)action='tenant_identity';
   else if(route.store==='health'&&['brake','calendarDelivery:lastDispatch','calendarDelivery:lastRun'].includes(rawKey)&&!url.search)action='brake_inspection';
   else if(route.store==='calendar_execution_budgets'&&rawKey===`calendar-v1:${p.policyVersion}`&&!url.search)action='budget_inspection';
   else fail('blobs_record_scope');cleanup=true;
  }
  if(spec.hostedCheck===true&&(kind!=='site'||method!=='GET'))fail('hosted_check_read_only');
  return {url,method,headers,body,action,kind,cleanup,details,write:kind==='site'&&method!=='GET'};
 }
 async function observe(c,response,data){
  if(c.action==='google_callback'){
   const u=new URL(response.headers.get('location')||'',TARGET.origin),fragment=new URLSearchParams(u.hash.slice(1));
   if(response.status!==303||u.origin!==TARGET.origin||u.pathname!=='/desk'||u.searchParams.get('c')!==signupSlug||[...u.searchParams.keys()].some(k=>k!=='c')||fragment.get('calendar_state')!==oauthState||[...fragment.keys()].some(k=>!['calendar_state','calendar_code','calendar_error'].includes(k))||fragment.get('calendar_code')!==c.url.searchParams.get('code')||fragment.get('calendar_error')!==c.url.searchParams.get('error'))fail('callback_redirect_destination');return;
  }
  if(response.status>=300&&response.status<400)fail('redirect_stopped');
  if(response.status===404&&c.action==='budget_inspection'&&!calendarStarted){runtimeUsed=Object.fromEntries(Object.keys(RUNTIME_LIMITS).map(k=>[k,0]));budgetFresh=true;return;}
  if(response.status===404&&c.action==='brake_inspection')return;
  if(['probe_old_window','probe_cancelled_window'].includes(c.action)){if(response.status!==409||data?.error!=='calendar_conflict')fail('busy_rejection_unconfirmed');probes.add(c.action);return;}
  if(!response.ok)fail('http_failure');
  if(c.action==='site_metadata'||c.action==='deploy_metadata'){
   const candidate=c.action==='site_metadata'?data.published_deploy:data;
   if(c.action==='site_metadata'){for(const id of [data.published_deploy?.id,data.deploy_id])if(/^[a-f0-9]{24}$/.test(id||''))knownDeployIds.add(id);}
   if(c.action==='site_metadata'&&(data.id!==TARGET.siteId||data.account_id!==TARGET.accountId||data.disabled===true))fail('site_identity');
   if(c.action==='site_metadata'&&candidate?.state==='ready'&&(![TARGET.baselineCommit,p.candidateCommit].includes(candidate.commit_ref)||!published&&candidate.commit_ref!==TARGET.baselineCommit||candidateSeen&&candidate.commit_ref!==p.candidateCommit)){baselineSeen=false;candidateSeen=false;fail('published_revision_changed');}
   if(c.action==='site_metadata'&&candidate?.state==='ready'&&(candidate.commit_ref===TARGET.baselineCommit&&candidate.id!==TARGET.baselineDeployId||candidate.commit_ref===p.candidateCommit&&firstDeployId&&candidate.id!==firstDeployId&&(!cleanupBuildRequested||candidate.id!==cleanupDeployId)))fail('published_deployment_changed');
   if(candidate?.commit_ref===TARGET.baselineCommit&&candidate.state==='ready')baselineSeen=true;
   if(candidate?.commit_ref===p.candidateCommit&&candidate.state==='ready'&&(c.action==='site_metadata'||data.site_id===TARGET.siteId)){candidateSeen=true;if(!firstDeployId)firstDeployId=candidate.id;if(cleanupBuildRequested&&environmentRestored&&candidate.id===cleanupDeployId&&candidate.id!==firstDeployId)cleanupPublished=true;}
  }
  if(c.action==='intake'){if(data.ok!==true||!HASH.test(data.handoff))fail('intake_response');intake=data.handoff;}
  if(c.action==='request_link'&&(response.status!==202||data.ok!==true||data.delivery!=='email'))fail('email_not_confirmed');
  if(c.action==='exchange'){
   if(data.ok!==true||data.email!==TARGET.ownerEmail||!HASH.test(data.session)||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now())fail('exchange_identity');
   mailTokens.delete(c.body.token);sessions.set(data.session,{revoked:false});exchangeCount++;
  }
  if(c.action==='create_workspace'){
   if(data.ok!==true||data.existing===true||!/^[-a-z0-9]{1,40}$/.test(data.slug||'')||data.client?.owner?.email!==TARGET.ownerEmail||data.client?.business?.name!==f.business||data.client.status!=='testing'||data.key||data.client.ownerKey||signupSlug&&signupSlug!==data.slug)fail('workspace_binding');signupSlug=data.slug;
  }
  if(c.action==='owner_read'){
   if(data.client?.slug!==signupSlug||data.client.owner?.email!==TARGET.ownerEmail||!HASH.test(data.configurationRevision||''))fail('owner_read_identity');ownerRead=true;if(nativeStarted&&data.connections?.calendar?.connected===true)ownerConnectionConfirmed=true;if((data.bookings||[]).some(row=>probeIds.includes(row.id)))fail('probe_created_second_visit');
   const visit=(data.bookings||[]).find(b=>b.id===visitId);if(visit?.ownerVisit?.revision)currentVisitRevision=visit.ownerVisit.revision;
  }
  if(c.action==='sign_out')sessions.get(bearer(c.headers)).revoked=true;
  if(c.action==='cancel'){if(data.ok!==true||data.status!=='cancelled')fail('workspace_cancel_unconfirmed');if(!calendarStarted)cleanupConfirmed=true;}
  if(c.action==='start_calendar_connection'){
   const u=new URL(data.result?.authorizationUrl||'');if(u.origin!=='https://accounts.google.com'||u.pathname!=='/o/oauth2/v2/auth'||u.searchParams.get('redirect_uri')!==TARGET.origin+'/api/google/callback'||!HASH.test(u.searchParams.get('state')||''))fail('oauth_destination');if(sha(u.searchParams.get('client_id')||'')!==p.googleClientIdHash||u.searchParams.get('scope')!=='https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendars.readonly'||u.searchParams.get('access_type')!=='offline'||u.searchParams.get('prompt')!=='consent'||u.searchParams.get('code_challenge_method')!=='S256'||!u.searchParams.get('code_challenge')||!Number.isFinite(Date.parse(data.result.expiresAt))||Date.parse(data.result.expiresAt)<=now()||Date.parse(data.result.expiresAt)>now()+11*60000)fail('oauth_scope_or_expiry');oauthState=u.searchParams.get('state');authorization={url:u.href,expiresAt:data.result.expiresAt};calendarStarted=true;
  }
  if(c.action==='complete_calendar_connection'){if(data.connections?.calendar?.connected!==true)fail('calendar_not_connected');if(Date.parse(policy.expiresAt)-now()<45*60000)fail('insufficient_post_consent_time');calendarCompleted=true;}
  if(['create_visit','reschedule_visit','cancel_visit'].includes(c.action)){
   if(data.localSaved!==true||data.visit?.id!==visitId||!HASH.test(data.visit.revision||''))fail('visit_identity');currentVisitRevision=data.visit.revision;localSavedAt=now();localStage=({create_visit:'create',reschedule_visit:'update',cancel_visit:'cancel'})[c.action];
  }
  if(c.action==='disconnect_calendar'){if(data.result?.calendar?.status!=='disconnected')fail('disconnect_unconfirmed');cleanupConfirmed=true;}
  if(c.action==='tenant_identity'){
   if(data?.slug!==signupSlug||data.owner?.email!==TARGET.ownerEmail||!data.ownerKey||data.onboarding?.version!==1)fail('private_tenant_identity');privateClient={slug:data.slug,identity:sha(JSON.stringify([data.slug,data.ownerKey,TARGET.ownerEmail]))};
  }
  if(c.action==='census_list'){
   if(!Array.isArray(data.blobs)||data.directories?.length||data.next_cursor||data.cursor||data.has_more||data.pagination?.next_cursor||data.blobs.length>1000)fail('census_partial');
   const keys=data.blobs.map(b=>b.key).sort();if(keys.some(k=>typeof k!=='string')||new Set(keys).size!==keys.length)fail('census_keys');const r=census[c.details.store];r.lists.push(keys);if(r.lists.length>2||r.keys&&!same(r.keys,keys))fail('census_changed');r.keys=keys;
  }
  if(c.action==='census_record')census[c.details.store].values.set(c.details.key,data);
  if(c.action==='job_inspection'){
   if(data.slug!==signupSlug||data.tenantIdentity!==tenant||data.bookingId!==visitId||data.eventId!==eventId||sha(data.targetId||'')!==targetHash||data.targetHash!==targetHash)fail('job_identity');
   lastJob={state:data.state,sourceRevision:data.sourceRevision,receipt:data.receipt};
  }
  if(c.action==='connection_inspection'&&nativeStarted&&data.status==='connected'){if(data.slug!==signupSlug||data.tenantIdentity!==tenant||data.googleClientIdHash!==p.googleClientIdHash||data.targetHash!==targetHash||sha(data.targetId||'')!==targetHash||data.availabilityConsentVersion!=='2026-10-24-busy-v1'||!data.refresh||!Number.isFinite(Date.parse(data.connectedAt))||Date.parse(data.connectedAt)<Date.parse(p.approvedAt)-60000)fail('native_connection_identity');connectionConfirmed=true;}
  if(c.action==='brake_inspection'&&c.details.key==='calendarDelivery:lastDispatch')lastDispatch=data;
  if(c.action==='brake_inspection'&&c.details.key==='calendarDelivery:lastRun')lastRun=data;
  if(c.action==='budget_inspection')recordRuntimeBudget(data);
 }
 function recordRuntimeBudget(row){
  if(!policy)fail('policy_not_bound');if(!row||row.version!==1||row.policyDigest!==policyDigest||!exact(row.used,Object.keys(RUNTIME_LIMITS)))fail('runtime_budget_identity');
  for(const key of Object.keys(RUNTIME_LIMITS))if(!Number.isSafeInteger(row.used[key])||row.used[key]<0||row.used[key]>RUNTIME_LIMITS[key]||runtimeUsed&&row.used[key]<runtimeUsed[key])fail('runtime_budget_nonmonotonic');
  if(row.used.totalRequests!==Object.keys(RUNTIME_LIMITS).filter(k=>!['oauthStart','totalRequests'].includes(k)).reduce((n,k)=>n+row.used[k],0))fail('runtime_budget_total');runtimeUsed={...row.used};budgetFresh=true;
 }
 async function request(spec){return exclusive(async()=>{
  let c;try{c=classify(spec);c.cleanup=c.cleanup&&(phase==='cleanup'||halted||cleanupAction(c.action));reserveAvailable(c);}catch(error){return deny(error.code||'request_contract');}
  const additions={[c.kind==='site'?'site':c.kind]:1,...(c.kind!=='site'?{control:1}:{}),...(c.write?{writes:1}:{}),...(spec.hostedCheck?{hostedChecks:1}:{}),...(c.action==='request_link'?{email:1}:{}),...(c.details.workerStage?{workerPosts:1}:{})};
  for(const [key,n]of Object.entries(additions))if(counters[key]+n>LIMITS[key])return deny('limit_'+key);
  for(const [key,n]of Object.entries(additions))counters[key]+=n;
  if(phase==='calendar'&&c.write)budgetFresh=false;

  let id=++sequence;await persist({event:'reserved_unknown',id,kind:c.kind,method:c.method,path:c.url.pathname,action:c.action});
  let response;
  try{
   const initialHeaders=new Headers(c.headers);
   if(c.kind==='blobs'&&c.details.key)initialHeaders.set('accept','application/json;type=signed-url');
   response=await send(c.url.href,{method:c.method,headers:initialHeaders,...(spec.body!==undefined?{body:typeof spec.body==='string'?spec.body:JSON.stringify(spec.body)}:{}),redirect:c.action==='google_callback'?'manual':'error',signal:AbortSignal.timeout(20000)});
   let bodyBytes=Buffer.from(await response.arrayBuffer()),raw=bodyBytes.toString('utf8'),data=null;try{data=JSON.parse(raw);}catch{if(c.action!=='google_callback'&&!(response.status===404&&['budget_inspection','brake_inspection'].includes(c.action))&&(c.kind!=='site'||c.action!=='asset'))fail('json_response');}
   // Off-runtime Blobs record reads first obtain a short-lived URL from the
   // exact approved Netlify API record route. Resolve it once, without forwarding
   // authorization, cookies, query values or the signed destination to the ledger.
   if(c.kind==='blobs'&&c.details.key&&response.ok&&exact(data,['url'])&&typeof data.url==='string'){
    const resolved=signedReadURL(data.url,now());
    await persist({event:'completed',id,status:response.status,bytes:bodyBytes.length,responseSHA256:sha(bodyBytes),signedLookup:true});
    if(counters.blobs>=LIMITS.blobs||counters.control>=LIMITS.control)fail('limit_blobs_or_control');
    counters.blobs++;counters.control++;id=++sequence;
    await persist({event:'reserved_unknown',id,kind:'blobs',method:'GET',path:'/signed-read/'+c.details.store+'/:approved-record',action:c.action,signedRecordBinding:digest([c.details.store,c.details.key])});
    // A failed second-hop transport must not inherit the first-hop HTTP 200.
    response=null;
    response=await send(resolved,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
    bodyBytes=Buffer.from(await response.arrayBuffer());raw=bodyBytes.toString('utf8');try{data=JSON.parse(raw);}catch{if(!(response.status===404&&['budget_inspection','brake_inspection'].includes(c.action)))fail('json_response');}
   }
   await observe(c,response,data);await persist({event:'completed',id,status:response.status,bytes:bodyBytes.length,responseSHA256:sha(bodyBytes)});
   return {status:response.status,headers:new Headers(response.headers),data,text:raw,bodyBytes};
  }catch(error){halted=true;await persist({event:'failed_or_uncertain',id,code:error.code||'transport_or_response_failure',httpStatus:response?.status??null});throw error;}
 });}
 return {
  request,state:()=>structuredClone(state()),
  registerExactMessageToken:input=>exclusive(async()=>{if(phase!=='signup'||input.recipient!==TARGET.ownerEmail||!HASH.test(input.token||'')||counters.email<1||input.exactMessageConfirmed!==true) return deny('exact_approved_message_required');mailTokens.add(input.token);await persist({event:'exact_message_bound',tokenPersisted:false});}),
  next:next=>exclusive(async()=>{
   if(next!=='cleanup'&&PHASES.indexOf(next)!==PHASES.indexOf(phase)+1||next==='cleanup'&&['cleanup','closed'].includes(phase))return deny('phase_sequence');
   if(next==='census'&&(!signupSlug||!ownerRead||exchangeCount<2))return deny('signup_and_return_proof_required');
   if(next==='publish'&&!policy)return deny('cohort_policy_required');
   if(next==='calendar'&&(!published||!candidateSeen))return deny('ready_exact_candidate_required');
   if(next==='closed'&&((signupSlug&&!cleanupConfirmed)||[...sessions.values()].some(row=>!row.revoked)))return deny('cleanup_or_session_remains');
   if(next==='closed'&&(counters.environmentWrites>0&&!environmentRestored||counters.builds>0&&!cleanupPublished||nativeStarted&&!nativeClosed))fail('cleanup_environment_or_native_window_remains');phase=next;if(next==='closed')closed=true;await persist({event:'phase_advanced',phase});return state();
  }),
  bindCohort:input=>exclusive(async()=>{
   if(LIMITS.blobs-counters.blobs<42)return deny('insufficient_inspection_headroom');if(phase!=='census'||policy||!privateClient||input.primaryAccount!==TARGET.calendarAccount||input.primaryOwnedUIConfirmed!==true||typeof input.primaryCalendarId!=='string'||!input.primaryCalendarId||!HASH.test(input.primaryUIEvidenceSHA256||''))return deny('cohort_observation_required');
   tenant=privateClient.identity;visitId=sha(`${tenant}:${f.visitSubmissionId}`).slice(0,32);eventId='mc'+sha(`machinesandcloud:calendar:v1:${tenant}:${visitId}`);targetHash=sha(input.primaryCalendarId);probeIds=[f.oldWindowProbeSubmissionId,f.cancelledWindowProbeSubmissionId].map(submission=>sha(`${tenant}:${submission}`).slice(0,32));
   const snapshot=[];
   for(const kind of CALENDAR_STORES){const r=census[kind];if(r.lists.length!==2||r.keys.some(key=>!r.values.has(key)))return deny('complete_global_census_required');const rows=r.keys.map(key=>{const value=r.values.get(key),inCohort=value.slug===signupSlug||kind==='calendar_connections'&&key===signupSlug||kind==='calendar_deliveries'&&key.startsWith(signupSlug+'/');if(inCohort)fail('retained_cohort_not_clean');return {key,digest:digest(value),inCohort};});snapshot.push({kind,rows});}
   const policyInput=input.policy;
   if(!exact(policyInput,['version','expiresAt','tenant','googleClientIdHash','targetIdHash','censusDigest','censusMode','bookingIds','limits'])||policyInput.version!==p.policyVersion||!same(policyInput.tenant,{slug:signupSlug,identity:tenant})||policyInput.googleClientIdHash!==p.googleClientIdHash||policyInput.targetIdHash!==targetHash||policyInput.censusDigest!==digest(snapshot)||policyInput.censusMode!=='clean_initial'||!same(policyInput.bookingIds,[visitId,...probeIds])||!same(policyInput.limits,RUNTIME_LIMITS)||!Number.isFinite(Date.parse(policyInput.expiresAt))||Date.parse(policyInput.expiresAt)<=now()+10*60000||Date.parse(policyInput.expiresAt)>now()+60*60000)return deny('exact_runtime_policy');
   policy=structuredClone(policyInput);policyDigest=digest(policy);runtimeUsed=null;budgetFresh=false;await persist({event:'cohort_policy_bound',primaryUIEvidenceSHA256:input.primaryUIEvidenceSHA256});return {policy:structuredClone(policy),digest:policyDigest,visitId,eventId};
  }),
  recordStagedEnvironment:input=>exclusive(async()=>{if(phase!=='publish'||!same(input,{policyDigest,oldDeploymentCommit:TARGET.baselineCommit,oldSnapshotUnchanged:true,newCandidateCommit:p.candidateCommit,calendarConnection:true,calendarDelivery:true,otherServiceGatesOff:true,evidenceSHA256:input.evidenceSHA256})||!HASH.test(input.evidenceSHA256||''))return deny('staged_environment_snapshot_required');staged=true;await persist({event:'staged_environment_evidence',evidenceSHA256:input.evidenceSHA256});}),
  stageEnvironment:(input,effect)=>exclusive(async()=>{reserveAvailable();if(phase!=='publish'||!policy||!exact(input,['key','value','context','scopes'])||input.context!=='production'||!same(input.scopes,['functions'])||environmentConfirmed.has(input.key)||counters.environmentWrites>=4)return deny('environment_scope');const expected={CALENDAR_CONNECTION_ENABLED:'true',CALENDAR_DELIVERY_ENABLED:'true',CALENDAR_EXECUTION_POLICY_JSON:JSON.stringify(policy),CALENDAR_EXECUTION_APPROVED_VERSION:p.policyVersion};if(!Object.hasOwn(expected,input.key)||input.value!==expected[input.key])return deny('environment_value');counters.environmentWrites++;environmentAttempted.add(input.key);await persist({event:'environment_reserved_unknown',key:input.key});try{const out=await effect(input);if(out?.siteId!==TARGET.siteId||out.key!==input.key||out.valueSHA256!==sha(input.value)||out.context!=='production'||!same(out.scopes,['functions']))fail('environment_receipt');environmentConfirmed.add(input.key);await persist({event:'environment_confirmed',key:input.key});return out;}catch(error){halted=true;await persist({event:'environment_failed_or_uncertain',key:input.key});throw error;}}),
  publish:effect=>exclusive(async()=>{reserveAvailable();if(phase!=='publish'||!staged||halted||counters.builds>=1||environmentConfirmed.size!==4)return deny('publication_not_admitted');counters.builds++;counters.pushes++;await persist({event:'publication_reserved_unknown'});try{const out=await effect({commit:p.candidateCommit});if(out?.pushedCommit!==p.candidateCommit||out.buildsTriggered!==1)fail('publication_receipt');published=true;await persist({event:'publication_effect_confirmed'});return out;}catch(error){halted=true;await persist({event:'publication_failed_or_uncertain'});throw error;}}),
  beginNativeHandoff:effect=>exclusive(async()=>{reserveAvailable({write:true});if(phase!=='calendar'||!calendarStarted||nativeStarted||!authorization||now()>=Date.parse(authorization.expiresAt))return deny('native_handoff_not_admitted');nativeStarted=true;counters.nativeHandoffs++;budgetFresh=false;await persist({event:'native_handoff_reserved_unknown',physicalHTTPCounted:false,maximumWindows:1});const token=[...sessions.keys()].findLast(key=>!sessions.get(key).revoked);if(!token)fail('native_session_missing');try{const receipt=await effect({slug:signupSlug,token,authorizationUrl:authorization.url,state:oauthState,expiresAt:authorization.expiresAt});if(!Number.isInteger(receipt.windowId)||!Number.isInteger(receipt.tabId)||receipt.seeded!==true||receipt.navigated!==true||receipt.nativePhysicalRequestsCounted!==false)fail('native_window_receipt');nativeWindowId=receipt.windowId;nativeTabId=receipt.tabId;await persist({event:'native_handoff_started',windowId:nativeWindowId,tabId:nativeTabId});return {windowId:nativeWindowId,tabId:nativeTabId};}catch(error){halted=true;if(Number.isInteger(error.ownedNativeTab?.windowId)&&Number.isInteger(error.ownedNativeTab?.tabId)){nativeWindowId=error.ownedNativeTab.windowId;nativeTabId=error.ownedNativeTab.tabId;}await persist({event:'native_handoff_unknown',...(nativeWindowId!==null?{windowId:nativeWindowId,tabId:nativeTabId}:{} )});throw error;}}),
  confirmNativeCompletion:()=>exclusive(async()=>{if(!nativeStarted||!connectionConfirmed||!ownerConnectionConfirmed||!runtimeUsed||runtimeUsed.tokenExchange!==1||runtimeUsed.calendarRead<1||Date.parse(policy.expiresAt)-now()<45*60000)return deny('native_completion_authority_or_time');calendarCompleted=true;await persist({event:'native_completion_observed',newDisclosure:true,authoritativeConnection:true,ordinaryOwnerView:true});return {connected:true};}),
  closeNativeHandoff:effect=>exclusive(async()=>{if(!nativeStarted||nativeClosed||nativeWindowId===null)return deny('native_close_not_admitted');await persist({event:'native_close_reserved_unknown',windowId:nativeWindowId});const receipt=await effect();if(receipt.windowId!==nativeWindowId||receipt.tabId!==nativeTabId||receipt.closed!==true)return deny('native_close_receipt');nativeClosed=true;await persist({event:'native_window_closed',windowId:nativeWindowId});}),
  restoreEnvironment:(key,effect)=>exclusive(async()=>{reserveAvailable({cleanup:true});if(phase!=='cleanup'||!environmentAttempted.has(key)||environmentRestoreAttempted.has(key)||counters.environmentWrites>=8)return deny('restore_environment_scope');counters.environmentWrites++;environmentRestoreAttempted.add(key);await persist({event:'environment_restore_reserved_unknown',key});try{const receipt=await effect(key);if(receipt.key!==key||receipt.restoredOriginalSetting!==true)fail('environment_restore_receipt');environmentConfirmed.delete(key);await persist({event:'environment_restore_observed',key});}catch(error){halted=true;await persist({event:'environment_restore_unknown',key});throw error;}}),
  confirmEnvironmentRestored:input=>exclusive(async()=>{if(phase!=='cleanup'||environmentConfirmed.size||environmentRestoreAttempted.size!==environmentAttempted.size||input.originalEnvironmentRestored!==true||!HASH.test(input.snapshotSHA256||''))return deny('environment_restore_readback');environmentRestored=true;await persist({event:'full_environment_restored',snapshotSHA256:input.snapshotSHA256});}),
  cleanupPublish:effect=>exclusive(async()=>{reserveAvailable({cleanup:true});if(phase!=='cleanup'||!environmentRestored||!published||counters.builds!==1||cleanupBuildRequested)return deny('cleanup_publication_not_admitted');counters.builds++;cleanupBuildRequested=true;await persist({event:'cleanup_publication_reserved_unknown'});try{const receipt=await effect();if(receipt.cleanupBuildReserved!==true||!receipt.buildId||!/^[a-f0-9]{24}$/.test(receipt.deployId||'')||receipt.deployId===firstDeployId)fail('cleanup_publication_receipt');cleanupDeployId=receipt.deployId;knownDeployIds.add(cleanupDeployId);await persist({event:'cleanup_publication_requested',buildId:receipt.buildId,deployId:cleanupDeployId});}catch(error){halted=true;await persist({event:'cleanup_publication_unknown'});throw error;}}),
  observeReceipt:input=>exclusive(async()=>{if(![lastRun?.at,lastRun?.completedAt,lastJob?.receipt?.confirmedAt].every(value=>Number.isFinite(Date.parse(value)))||!lastRun?.ok||Date.parse(lastRun.completedAt)<localSavedAt||Date.parse(lastJob?.receipt?.confirmedAt)<localSavedAt||Date.parse(lastRun.completedAt)<Date.parse(lastRun.at)||Date.parse(lastJob?.receipt?.confirmedAt)<Date.parse(lastRun.at)||Date.parse(lastJob?.receipt?.confirmedAt)>Date.parse(lastRun.completedAt)||!policy||!lastJob||!['synced','cancelled'].includes(lastJob.state)||lastJob.receipt?.eventId!==eventId||lastJob.receipt?.sourceRevision!==input.sourceRevision||lastJob.sourceRevision!==input.sourceRevision||input.stage==='delete'&&lastJob.state!=='cancelled'||input.stage!=='delete'&&lastJob.state!=='synced'||input.visitId!==visitId||input.eventId!==eventId||input.targetHash!==targetHash||!HASH.test(input.sourceRevision||'')||!['create','update','delete'].includes(input.stage)||input.confirmed!==true||input.ownedRemoteConfirmed!==true)return deny('exact_owned_receipt_required');const wanted=receiptStage==='none'?'create':receiptStage==='create'?'update':'delete';if(input.stage!==wanted&&!(phase==='cleanup'&&input.stage==='delete'))return deny('receipt_sequence');const scheduledDispatchObserved=lastDispatch?.ok===true&&lastDispatch.dispatched===true&&Number.isFinite(Date.parse(lastDispatch.at))&&Date.parse(lastDispatch.at)>=localSavedAt&&Date.parse(lastRun.at)>=Date.parse(lastDispatch.at);if(input.stage!=='create'&&!scheduledDispatchObserved){await persist({event:'owned_event_receipt_pending_scheduler',stage:input.stage,sourceRevision:input.sourceRevision});return {accepted:false,reason:'scheduled_dispatch_not_observed'};}receiptStage=input.stage;const provenance=scheduledDispatchObserved?'scheduled_dispatch_and_matching_completed_wave':'initial_automatic_dispatch_unattributed';await persist({event:'owned_event_receipt',stage:receiptStage,sourceRevision:input.sourceRevision,provenance,scheduledDispatchObserved});return {accepted:true,provenance,scheduledDispatchObserved};}),
  closePersistence:()=>persistence.close?.(),
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(plan(),null,2)+'\n');
