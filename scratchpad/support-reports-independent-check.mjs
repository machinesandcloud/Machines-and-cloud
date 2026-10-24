// Independent support-case QA. Actual owner/operator handlers; memory plus installed Blobs SDK/CAS fixture.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';
const output=process.argv.includes('--output')?process.argv[process.argv.indexOf('--output')+1]:null;
if(output&&(!/^scratchpad\/[a-z0-9-]+\.json$/.test(output)||existsSync(output))||process.argv.includes('--output')&&!output)throw new Error('Pass a new --output scratchpad/name.json, or omit for stdout-only');
const report={at:new Date().toISOString(),mode:'independent actual support owner/operator handlers and ordinary scheduler; memory and intercepted installed Blobs SDK; no external requests',checks:[],blocked:[],mail:[],conflicts:0};
const sha=x=>createHash('sha256').update(x).digest('hex');
const files=['netlify/functions/manage.mjs','netlify/functions/lib/operator.mjs','netlify/functions/lib/support-reports.mjs','netlify/functions/client.mjs','netlify/functions/lib/store.mjs','netlify/functions/lib/accounts.mjs','netlify/functions/lib/access.mjs','netlify/functions/lib/workspace-identity.mjs','netlify/functions/scheduler.mjs','scratchpad/support-reports-independent-check.mjs'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(readFileSync(file))]));report.sourceBefore=hashes();
let deniedPhysicalAttempts=0;const deny=()=>{deniedPhysicalAttempts++;throw new Error('Support QA physical network disabled');};net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();
for(const key of Object.keys(process.env))if(/^(ANTHROPIC_|TWILIO_|MC_TWILIO_|MC_MESSAGING_|MC_PLATFORM_|WORKSPACE_BILLING_|THUMBTACK_|CALENDAR_|SERVICE_|VAPI_|RESEND_|GOOGLE_|STRIPE_|STEVE_|PHONE_)/.test(key))delete process.env[key];
const base='http://127.0.0.1:8899';Object.assign(process.env,{MC_MEMORY_STORE:'1',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:base,PUBLIC_SITE_URL:base,ADMIN_KEY:'qa-cli-only',ADMIN_EMAILS:'qa-operator-memory@example.test',RESEND_API_KEY:'qa-intercepted-only'});
const data=new Map();let revision=0,serial=0,fault=null,hold=null;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(String(input)),method=String(init.method||'GET').toUpperCase();
 if(url.origin==='https://api.resend.com'&&url.pathname==='/emails'&&method==='POST'){const body=JSON.parse(init.body);assert.equal(body.subject,'Your Machines & Cloud sign-in link');report.mail.push(body);return Response.json({id:'intercepted-not-sent'});}
 if(url.origin!=='https://operator-qa-blobs.invalid'){report.blocked.push({origin:url.origin,path:url.pathname,method});return deny();}
 const[,site,kind,...parts]=url.pathname.split('/').map(decodeURIComponent),key=parts.join('/'),name=kind+'/'+key;assert.equal(site,'operator-qa-site');
 let hit=fault&&fault.kind===kind&&fault.key===key&&fault.method===method?fault:null;if(hit?.skip){hit.skip--;hit=null;}
 if(hit?.mode==='reject')return new Response('Injected storage rejection',{status:400});
 if(method==='GET'&&!key)return Response.json({blobs:[...data.keys()].filter(x=>x.startsWith(kind+'/'+(url.searchParams.get('prefix')||''))).map(x=>({key:x.slice(kind.length+1)})),directories:[]});
 const current=data.get(name),headers=new Headers(init.headers);
 if(hold&&hold.kind===kind&&hold.key===key&&hold.method===method){if(hold.skip)hold.skip--;else{const paused=hold;hold=null;paused.reached();await paused.release;}}
 if(method==='GET')return current?new Response(current.value,{headers:{etag:current.etag,'content-type':'application/json'}}):new Response(null,{status:404});
 if(method==='DELETE'){data.delete(name);return new Response(null,{status:204});}assert.equal(method,'PUT');
 if(headers.get('if-none-match')==='*'&&data.has(name)||headers.has('if-match')&&headers.get('if-match')!==data.get(name)?.etag){report.conflicts++;return new Response(null,{status:412});}
 const etag=String(++revision);data.set(name,{value:init.body,etag});if(hit?.mode==='commit_then_reject'){hit.mode='reject';throw new TypeError('Injected committed write with lost response');}return new Response(null,{headers:{etag}});
};
const{setEnvironmentContext}=await import('@netlify/blobs');setEnvironmentContext({siteID:'operator-qa-site',token:'qa-placeholder',edgeURL:'https://operator-qa-eventual.invalid',uncachedEdgeURL:'https://operator-qa-blobs.invalid'});
const store=await import('../netlify/functions/lib/store.mjs'),accounts=await import('../netlify/functions/lib/accounts.mjs'),access=await import('../netlify/functions/lib/access.mjs'),config=await import('../netlify/functions/lib/config.mjs'),setup=await import('../netlify/functions/lib/setup.mjs'),operator=await import('../netlify/functions/lib/operator.mjs'),ops=await import('../netlify/functions/lib/platform-operations.mjs');
const manage=(await import('../netlify/functions/manage.mjs')).default,ownerAccess=(await import('../netlify/functions/access.mjs')).default,clientAPI=(await import('../netlify/functions/client.mjs')).default,legacyAdmin=(await import('../netlify/functions/admin.mjs')).default;
const read=accounts.strictRead;
const req=(path,body,token,method='POST',headers={})=>new Request(base+path,{method,headers:{origin:base,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...headers},...(['GET','HEAD'].includes(method)?{}:{body:JSON.stringify(body)})});
const call=async(handler,path,body,token,method='POST',headers)=>{const response=await handler(req(path,body,token,method,headers),{ip:'192.0.2.'+(++serial%230+1)});let bodyOut;try{bodyOut=await response.json();}catch{bodyOut=null;}return{status:response.status,body:bodyOut,headers:Object.fromEntries(response.headers)};};
const check=async(name,fn)=>{try{const detail=await fn();report.checks.push({name,pass:true,...(detail===undefined?{}:{detail})});}catch(error){report.checks.push({name,pass:false,error:error.message,stack:error.stack});}};
const session=async(email,scope='onboarding')=>{const token=sha('qa-session-'+ ++serial);await store.put('access_sessions',access.accessHash(token),{email,scope,status:'active',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});return token;};
async function inbox(email){if(process.env.MC_MEMORY_STORE==='1')return read('access_outbox',access.accessHash(email));const mail=report.mail.findLast(row=>row.to.includes(email)),link=mail?.text.match(/http:\/\/127\.0\.0\.1:8899\/(?:admin|onboard)\.html[^\s]*/)?.[0];return link?{link,token:new URL(link).hash.slice('#verify='.length)}:null;}
function fresh(label){const slug='qa-'+label+'-'+ ++serial,email=slug+'@example.test',c=config.newClient({slug,ownerKey:'CANARY-OWNER-'+slug,owner:{name:'QA Customer',email,phone:'+17135550142'},business:{name:'QA Air',trade:'HVAC',city:'Houston',serviceArea:['Katy'],hours:'Mon-Fri 8am-5pm'}});c.onboarding={version:1,verifiedEmail:email,desiredChannels:['web','voice','sms','calendar']};c.status='testing';c.services=['AC repair'];c.fees=[{label:'Diagnostic',amount:'$89',note:'Applied to repair'}];c.windows=['8 to 12'];c.rules.hours=config.parseHours('Mon-Fri 8am-5pm');c.build={status:'failed',source:'owner_answers',notes:'Saved draft needs repair'};c.calendar={provider:'google',google:{refreshToken:'CANARY-OAUTH-'+slug}};c.leads={angiKey:'CANARY-ANGI-'+slug,thumbtackSecret:'CANARY-THUMBTACK-'+slug};c.business.legal={ein:'CANARY-EIN-'+slug};c.voice={provider:'vapi',assistantId:'resource-id-'+slug,apiSecret:'CANARY-VAPI-'+slug};return c;}
const saveFresh=async label=>{const c=fresh(label);await store.put('clients',c.slug,c);return c;};
const command=(c,action,extra={})=>({action,slug:c.slug,expectedRevision:operator.managementRevision(c),reason:'QA verifies a bounded support action',...extra});
async function clearOperations(){for(const kind of ['workspace_operations','platform_operations'])for(const key of await store.list(kind))await store.del(kind,key);}

const support=await import('../netlify/functions/lib/support-reports.mjs');
const scheduler=(await import('../netlify/functions/scheduler.mjs')).run;
const identity=await import('../netlify/functions/lib/workspace-identity.mjs');
const kinds=['clients','conversations','conversation_history','workspace_record_index','access_sessions','health','tasks','alerts','events','platform_operations','workspace_operations','self_service_ai','owner_notifications','index'];
async function reset(){fault=null;hold=null;for(const kind of kinds)for(const key of await store.list(kind))await store.del(kind,key);}
const nonce=()=>sha('independent-support-'+ ++serial).slice(0,32);
async function seed(status='testing'){
 const c=await saveFresh('s'+ ++serial);c.status='testing';c.onboarding.desiredChannels=['web'];c.channels={web:{active:false}};await store.put('clients',c.slug,c);
 const contact='c'+ ++serial;await conversation(c,contact);c.status=status;await store.put('clients',c.slug,c);
 return {c,contact,path:'/api/client?c='+c.slug,owner:await session(c.owner.email),staff:await session(process.env.ADMIN_EMAILS,'operator')};
}
async function conversation(c,contact,flag=null,channel='web'){
 const conv=await store.getConversation(c,channel,contact);if(!conv.messages.length)conv.messages=[{role:'user',content:'I asked about repairing an AC unit in Katy.',at:new Date().toISOString()},{role:'assistant',content:'Synthetic incorrect advice for support investigation.',at:new Date().toISOString()}];if(flag)conv.flag=flag;await store.saveConversation(conv);return conv;
}
const body=(f,extra={})=>({action:'report_conversation',channel:'web',contact:f.contact,note:'Please review the incorrect AC repair advice in this conversation.',operationId:nonce(),expectedReportRevision:null,...extra});
const own=(f,b)=>call(clientAPI,f.path,b,f.owner);
const ownerGet=f=>call(clientAPI,f.path,null,f.owner,'GET');
const staffGet=f=>call(manage,'/api/manage?c='+f.c.slug,null,f.staff,'GET');
async function submit(f,b=body(f)){const r=await own(f,b);assert.equal(r.status,200,JSON.stringify(r.body));return {b,r,row:r.body.supportReport};}
async function actionBody(f,row,action,extra={}){const c=await read('clients',f.c.slug);return command(c,action,{reportId:row.id,expectedReportRevision:row.revision,operationId:nonce(),...(action==='resolve_report'?{resolution:'We investigated the reply and corrected the guidance used for this request.'}:{}),...extra});}
async function change(f,row,action,extra={}){const b=await actionBody(f,row,action,extra),r=await call(manage,'/api/manage',b,f.staff);return {b,r,row:r.body.supportReport};}
async function finish(f,row){const a=await change(f,row,'acknowledge_report');assert.equal(a.r.status,200,JSON.stringify(a.r.body));const d=await change(f,a.row,'resolve_report');assert.equal(d.r.status,200,JSON.stringify(d.r.body));return {a,d};}
async function one(mode,label,fn){await check(mode+': '+label,async()=>{await reset();return fn();});}
function lock(kind,key,method,skip=0){let reached,release;const entered=new Promise(r=>reached=r),gate=new Promise(r=>release=r);hold={kind,key,method,skip,reached,release:gate};return {entered,release};}
async function suite(mode){
 process.env.MC_MEMORY_STORE=mode==='memory'?'1':'0';process.env.ADMIN_EMAILS='qa-support-'+mode+'@example.test';
 await one(mode,'actual owner report is atomically actionable in Issues and public resolution returns to the same conversation',async()=>{
  const f=await seed(),saved=await submit(f),after=await read('clients',f.c.slug);assert.equal(after.management.supportReports.length,1);
  const detail=await staffGet(f);assert.equal(detail.status,200,JSON.stringify(detail.body));assert(detail.body.customer.issues.some(x=>x.reportId===saved.row.id));assert.equal(detail.body.customer.supportReports[0].messages.at(-1).content,'Synthetic incorrect advice for support investigation.');
  assert.equal(detail.body.customer.supportReports[0].attention.state,'operator_portal');assert.match(detail.body.customer.supportReports[0].attention.detail,/no human acknowledgement/);
  const a=await change(f,saved.row,'acknowledge_report',{reason:'PRIVATE_SUPPORT_REASON_CANARY'});assert.equal(a.r.status,200,JSON.stringify(a.r.body));assert.equal((await ownerGet(f)).body.conversations[0].supportReport.status,'acknowledged');
  const d=await change(f,a.row,'resolve_report',{reason:'PRIVATE_RESOLUTION_REASON_CANARY'});assert.equal(d.r.status,200,JSON.stringify(d.r.body));const returned=await ownerGet(f);assert.equal(returned.status,200);assert.equal(returned.body.conversations[0].supportReport.resolution,d.b.resolution);assert.equal(returned.body.conversations[0].flag,null);assert(!JSON.stringify(returned.body).includes('PRIVATE_'));assert(!JSON.stringify(returned.body.supportReports).includes('messages'));assert(!(await staffGet(f)).body.customer.issues.some(x=>x.reportId===saved.row.id));assert.equal((await read('clients',f.c.slug)).status,'testing');
 });
 await one(mode,'owner and operator reordered payload replay survives later resolution and missing conversation head',async()=>{
  const f=await seed(),s=await submit(f),{a,d}=await finish(f,s.row);await store.del('conversations',store.convKey(f.c,'web',f.contact));
  const r=await own(f,Object.fromEntries(Object.entries(s.b).reverse()));assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.supportReport.status,'resolved');assert.equal(r.body.supportReport.id,s.row.id);
  const staff=await call(manage,'/api/manage',Object.fromEntries(Object.entries(a.b).reverse()),f.staff);assert.equal(staff.status,200,JSON.stringify(staff.body));assert.equal(staff.body.supportReport.status,'resolved');assert.deepEqual(staff.body.supportReport.operationIds,[s.b.operationId,a.b.operationId,d.b.operationId]);
  const c=await read('clients',f.c.slug);assert.equal(c.management.supportReports.length,1);assert.equal(c.management.audit.length,3);
 });
 await one(mode,'same-operation changed payload and strict invalid input cannot mutate retained report',async()=>{
  const f=await seed(),s=await submit(f),before=await read('clients',f.c.slug);
  for(const extra of [{note:'Another incorrect answer needs checking'},{contact:'another'},{channel:'sms'}]){const r=await own(f,{...s.b,...extra});assert.equal(r.status,409);assert.equal(r.body.error,'operation_conflict');}
  for(const extra of [{note:''},{note:'x'.repeat(1001)},{contact:'../../foreign'},{unexpected:true},{expectedReportRevision:'bad'}]){const r=await own(f,body(f,extra));assert.equal(r.status,400,JSON.stringify(r.body));}
  assert.deepEqual(await read('clients',f.c.slug),before);
 });
 await one(mode,'concurrent identical retries create one report and audit, distinct operations cannot open two active cases',async()=>{
  const f=await seed(),b=body(f),same=await Promise.all([own(f,b),own(f,{...b})]);assert.deepEqual(same.map(r=>r.status),[200,200]);assert.equal(same[0].body.supportReport.id,same[1].body.supportReport.id);assert.equal((await read('clients',f.c.slug)).management.audit.length,1);
  const next=await Promise.all([own(f,body(f)),own(f,body(f))]);assert(next.every(r=>r.status===409&&r.body.error==='report_already_open'));assert(next.every(r=>r.body.supportReport.id===same[0].body.supportReport.id));
  const g=await seed(),competing=await Promise.all([own(g,body(g)),own(g,body(g))]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);assert.equal((await read('clients',g.c.slug)).management.supportReports.length,1);
 });
 await one(mode,'one owner operation cannot identify two different conversation cases',async()=>{
  const f=await seed(),other='other'+ ++serial;await conversation(f.c,other);const b=body(f),r=await Promise.all([own(f,b),own(f,{...b,contact:other})]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal(r.find(x=>x.status===409).body.error,'operation_conflict');assert.equal((await read('clients',f.c.slug)).management.supportReports.length,1);
 });
 await one(mode,'stale report/management revisions reject without advancing and exact acknowledged revision resolves',async()=>{
  const f=await seed(),s=await submit(f),premature=await change(f,s.row,'resolve_report');assert.equal(premature.r.status,409);assert.equal(premature.r.body.error,'review_required');
  const b=await actionBody(f,s.row,'acknowledge_report');await store.atomicUpdate('clients',f.c.slug,c=>({value:{...c,management:{...c.management,revision:c.management.revision+1}}}));const stale=await call(manage,'/api/manage',b,f.staff);assert.equal(stale.status,409);assert.equal(stale.body.error,'report_changed');
  const a=await change(f,s.row,'acknowledge_report');assert.equal(a.r.status,200,JSON.stringify(a.r.body));const old=await change(f,s.row,'resolve_report');assert.equal(old.r.body.error,'report_changed');const d=await change(f,a.row,'resolve_report');assert.equal(d.r.status,200,JSON.stringify(d.r.body));
  const bad=await call(manage,'/api/manage',{...a.b,reason:'A different reused investigation'},f.staff);assert.equal(bad.body.error,'operation_conflict');
 });
 await one(mode,'new problem after resolution requires latest report revision and preserves both immutable receipts',async()=>{
  const f=await seed(),s=await submit(f),{d}=await finish(f,s.row);const stale=await own(f,body(f));assert.equal(stale.status,409);assert.equal(stale.body.error,'report_changed');assert.equal(stale.body.supportReport.id,s.row.id);
  const n=await submit(f,body(f,{note:'A newer answer contains another problem',expectedReportRevision:d.row.revision}));assert.notEqual(n.row.id,s.row.id);const c=await read('clients',f.c.slug);assert.deepEqual(c.management.supportReports.map(r=>r.status),['resolved','reported']);const replay=await own(f,s.b);assert.equal(replay.body.supportReport.id,s.row.id);assert.equal(replay.body.supportReport.status,'resolved');
 });
 await one(mode,'foreign owner, revoked sessions, removed operator and replacement incarnation cannot use old case authority',async()=>{
  const f=await seed(),g=await seed(),s=await submit(f);assert.equal((await call(clientAPI,f.path,body(f),g.owner)).status,403);const b=await actionBody(f,s.row,'acknowledge_report');
  await store.atomicUpdate('access_sessions',access.accessHash(f.staff),c=>({value:{...c,status:'revoked'}}));assert.equal((await call(manage,'/api/manage',b,f.staff)).status,401);
  f.staff=await session(process.env.ADMIN_EMAILS,'operator');process.env.ADMIN_EMAILS='replacement-operator@example.test';assert.equal((await call(manage,'/api/manage',b,f.staff)).status,403);process.env.ADMIN_EMAILS='qa-support-'+mode+'@example.test';
  await store.atomicUpdate('access_sessions',access.accessHash(f.owner),c=>({value:{...c,status:'revoked'}}));assert.equal((await own(f,s.b)).status,401);f.owner=await session(f.c.owner.email);
  await store.atomicUpdate('clients',f.c.slug,c=>({value:{...c,ownerKey:'NEW-CURRENT-OWNER-IDENTITY'}}));const r=await ownerGet(f);assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body.supportReports,[]);assert.equal((await own(f,s.b)).status,404);assert.equal((await call(manage,'/api/manage',b,f.staff)).status,404);
 });
 await one(mode,'100 retained cases still allow replay and completion; new case fails without discarding history',async()=>{
  const f=await seed(),s=await submit(f);await store.atomicUpdate('clients',f.c.slug,c=>{const original=c.management.supportReports[0];return {value:{...c,management:{...c.management,supportReports:[original,...Array.from({length:99},(_,i)=>({...original,id:sha('capacity-'+i).slice(0,32),contact:'capacity-'+i,reportOperationId:sha('capacity-operation-'+i).slice(0,32),operations:[{...original.operations[0],id:sha('capacity-operation-'+i).slice(0,32)}]}))]}}};});
  await conversation(f.c,'overflow');const r=await own(f,body(f,{contact:'overflow'}));assert.equal(r.status,409);assert.equal(r.body.error,'report_capacity');assert.equal((await own(f,s.b)).status,200);const {d}=await finish(f,s.row);assert.equal(d.r.status,200);assert.equal((await read('clients',f.c.slug)).management.supportReports.length,100);
 });
 await one(mode,'paused/cancelled owner can report and finish support without service reactivation or provider changes',async()=>{
  for(const status of ['paused','cancelled']){const f=await seed(status),before=await read('clients',f.c.slug),s=await submit(f);await finish(f,s.row);const after=await read('clients',f.c.slug);assert.equal(after.status,status);for(const key of ['channels','calendar','phone','voice','onboarding'])assert.deepEqual(after[key],before[key]);}
 });
 await one(mode,'canonical support does not erase newer conversation corrections or expose private internal notes',async()=>{
  const f=await seed(),s=await submit(f),conv=await store.getConversation(f.c,'web',f.contact);conv.messages.push({role:'user',content:'Newer factual customer correction after report',at:new Date().toISOString()});await store.saveConversation(conv);
  const c=await read('clients',f.c.slug),note=await call(manage,'/api/manage',command(c,'save_note',{text:'PRIVATE_INTERNAL_NOTE_CANARY'}),f.staff);assert.equal(note.status,200);const owner=await ownerGet(f);assert(owner.body.conversations[0].messages.some(m=>m.content==='Newer factual customer correction after report'));assert(!JSON.stringify(owner.body).includes('PRIVATE_INTERNAL_NOTE_CANARY'));
  const staff=await staffGet(f);assert.equal(staff.body.customer.supportReports[0].messages.length,2);assert.equal(staff.body.customer.supportReports[0].id,s.row.id);
 });
 await one(mode,'legacy discovery with no owned conversation keys leaves the entire client unchanged',async()=>{
  const c=await saveFresh('empty'+ ++serial),before=await read('clients',c.slug);const r=await support.recoverSupportReports();assert.equal(r.conversations,0);assert.deepEqual(await read('clients',c.slug),before);
 });
 await one(mode,'legacy flag adoption runs in ordinary scheduler once and resolved case is never resurrected',async()=>{
  const f=await seed(),flag={by:'owner',at:new Date().toISOString(),note:'Legacy owner problem needs review'};await conversation(f.c,f.contact,flag);await conversation(f.c,'empty',{...flag,note:''});await store.put('conversations',f.c.slug+'/web/old',{slug:f.c.slug,channel:'web',contact:'old',messages:[{role:'user',content:'Unbound old history'}],flag});
  const wave=await scheduler({forceHour:21,forceDay:'Sat',inline:true,all:true});assert.equal(wave.blocks.supportReportRecovery.ok,true,JSON.stringify(wave.blocks.supportReportRecovery));let c=await read('clients',f.c.slug);assert.equal(c.management.supportReports.length,1);assert.equal(c.management.supportReports[0].note,flag.note);const reportView=support.supportReportViews(c)[0];await finish(f,reportView);await scheduler({forceHour:21,forceDay:'Sat',inline:true,all:true});c=await read('clients',f.c.slug);assert.equal(c.management.supportReports.length,1);assert.equal(c.management.supportReports[0].status,'resolved');
 });
 await one(mode,'fair bounded legacy discovery reaches later customer and ninth conversation with no new dispatch index',async()=>{
  const fixtures=[];for(let i=0;i<5;i++){const f=await seed();fixtures.push(f);for(let j=0;j<9;j++)await conversation(f.c,'z'+j,j===8?{by:'owner',at:new Date().toISOString(),note:'Later conversation legacy report'}:null);}
  const managementRevisions=new Map(fixtures.map(f=>[f.c.slug,operator.managementRevision(f.c)]));let seen=0;
  for(let i=0;i<7;i++){const r=await support.recoverSupportReports();assert(r.inspected<=4);assert(r.conversations<=32);seen+=r.adopted;}
  assert.equal(seen,5);for(const f of fixtures){const c=await read('clients',f.c.slug);assert.equal(c.management.supportReports.length,1);assert.notEqual(operator.managementRevision(c),managementRevisions.get(f.c.slug));}
  const f=fixtures[0],before=operator.managementRevision(await read('clients',f.c.slug));await support.recoverSupportReports();assert.equal(operator.managementRevision(await read('clients',f.c.slug)),before);
 });
 if(mode==='sdk'){
  await one(mode,'lost committed owner and operator writes reconcile exact immutable operations without duplicate cases or acknowledgements',async()=>{
   const f=await seed(),b=body(f);fault={kind:'site:clients',key:f.c.slug,method:'PUT',mode:'commit_then_reject'};const first=await own(f,b);fault=null;assert([200,503].includes(first.status),JSON.stringify(first));const stored=await read('clients',f.c.slug);assert.equal(stored.management.supportReports.length,1);const replay=await own(f,b);assert.equal(replay.status,200,JSON.stringify(replay.body));const ack=await actionBody(f,replay.body.supportReport,'acknowledge_report');fault={kind:'site:clients',key:f.c.slug,method:'PUT',mode:'commit_then_reject'};const a=await call(manage,'/api/manage',ack,f.staff);fault=null;assert([200,503].includes(a.status),JSON.stringify(a));const again=await call(manage,'/api/manage',ack,f.staff);assert.equal(again.status,200,JSON.stringify(again.body));assert.equal(again.body.supportReport.status,'acknowledged');assert.equal((await read('clients',f.c.slug)).management.audit.length,2);return {ownerInitialStatus:first.status,operatorInitialStatus:a.status};
  });
  await one(mode,'definite precommit storage failure saves no invented case and same operation can safely retry',async()=>{
   const f=await seed(),b=body(f);fault={kind:'site:clients',key:f.c.slug,method:'PUT',mode:'reject'};const r=await own(f,b);fault=null;assert.equal(r.status,503,JSON.stringify(r.body));assert.equal((await read('clients',f.c.slug)).management?.supportReports?.length||0,0);const retry=await own(f,b);assert.equal(retry.status,200,JSON.stringify(retry.body));assert.equal((await read('clients',f.c.slug)).management.supportReports.length,1);
  });
  await one(mode,'owner replacement after stale client read is fenced again inside final CAS',async()=>{
   const f=await seed(),b=body(f),l=lock('site:clients',f.c.slug,'GET');const attempt=own(f,b);await l.entered;const old=await read('clients',f.c.slug);await store.put('clients',f.c.slug,{...old,ownerKey:'RECREATED-TENANT-DURING-READ'});l.release();const r=await attempt;assert(r.status>=400,JSON.stringify(r.body));const final=await read('clients',f.c.slug);assert.equal(final.management?.supportReports?.length||0,0);assert.equal(final.ownerKey,'RECREATED-TENANT-DURING-READ');
  });
  await one(mode,'owner revocation during first session read is checked again before support write',async()=>{
   const f=await seed(),b=body(f),key=access.accessHash(f.owner),l=lock('site:access_sessions',key,'GET');const attempt=own(f,b);await l.entered;const row=await read('access_sessions',key);await store.put('access_sessions',key,{...row,status:'revoked'});l.release();const r=await attempt;assert.equal(r.status,401,JSON.stringify(r.body));assert.equal((await read('clients',f.c.slug)).management?.supportReports?.length||0,0);
  });
  await one(mode,'operator allowlist withdrawal during stale client read blocks acknowledgement inside CAS',async()=>{
   const f=await seed(),s=await submit(f),b=await actionBody(f,s.row,'acknowledge_report'),l=lock('site:clients',f.c.slug,'GET');const pending=call(manage,'/api/manage',b,f.staff);await l.entered;process.env.ADMIN_EMAILS='removed-operator@example.test';l.release();const r=await pending;process.env.ADMIN_EMAILS='qa-support-'+mode+'@example.test';assert.equal(r.status,403,JSON.stringify(r.body));assert.equal((await read('clients',f.c.slug)).management.supportReports[0].status,'reported');
  });
  await one(mode,'failed legacy adoption is observable and later ordinary schedule recovers same case once',async()=>{
   const f=await seed(),flag={by:'owner',at:new Date().toISOString(),note:'Recover this retained owner flag'};await conversation(f.c,f.contact,flag);fault={kind:'site:clients',key:f.c.slug,method:'PUT',mode:'reject'};const failed=await scheduler({forceHour:21,forceDay:'Sat',inline:true,all:true});fault=null;assert.equal(failed.blocks.supportReportRecovery.ok,false);assert.equal((await read('clients',f.c.slug)).management?.supportReports?.length||0,0);
   const recovered=await scheduler({forceHour:21,forceDay:'Sat',inline:true,all:true});assert.equal(recovered.blocks.supportReportRecovery.ok,true);await scheduler({forceHour:21,forceDay:'Sat',inline:true,all:true});assert.equal((await read('clients',f.c.slug)).management.supportReports.length,1);
  });
 }
}
await suite('memory');await suite('sdk');
report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.actualPhysicalRequests=0;report.deniedPhysicalAttempts=deniedPhysicalAttempts;report.interceptedStorageRecords=data.size;report.passed=report.checks.filter(x=>x.pass).length;report.total=report.checks.length;report.ok=report.sourceStable&&report.passed===report.total&&report.blocked.length===0&&report.mail.length===0&&deniedPhysicalAttempts===0;
if(output)writeFileSync(output,JSON.stringify(report,null,2)+String.fromCharCode(10),{flag:'wx'});console.log(JSON.stringify({ok:report.ok,passed:report.passed,total:report.total,sourceStable:report.sourceStable,blocked:report.blocked,failures:report.checks.filter(x=>!x.pass)},null,2));if(!report.ok)process.exitCode=1;
