// One retained owner report and operator attention source in the existing client CAS.
// No email, provider send, separate helpdesk or independently mutable issue index.
import {createHash} from 'node:crypto';
import {atomicUpdate,boundedRecordKeys,convKey,conversationReference} from './store.mjs';
import {strictRead,normalizeAccountEmail} from './accounts.mjs';
import {workspaceTenant,supportedWorkspace,belongsToWorkspace} from './workspace-identity.mjs';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const HEX=/^[a-f0-9]{64}$/,NONCE=/^[a-f0-9]{32}$/,STATES=['reported','acknowledged','resolved'],LIMIT=100;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export class SupportReportError extends Error{constructor(code,message,status=409,extra={}){super(message);Object.assign(this,{code,status,...extra});}}
const fail=(code,message,status=409,extra)=>{throw new SupportReportError(code,message,status,extra);};
const stamp=()=>new Date().toISOString();
const CONNECTIONS={web:'Website chat',voice:'Phone answering',sms:'Text messaging',calendar:'Google Calendar',thumbtack:'Thumbtack',angi:'Angi'};
function rows(c){
 const list=c.management?.supportReports||[];
 if(!Array.isArray(list)||list.length>LIMIT)fail('support_unavailable','Saved reports need checking. Your conversation is kept.',503);
 const owned=list.filter(row=>row?.tenantIdentity===workspaceTenant(c));
 if(owned.some(row=>!NONCE.test(row.id)||!NONCE.test(row.reportOperationId)||!STATES.includes(row.status)||typeof row.note!=='string'||row.note.length>1000||!Array.isArray(row.operations)||row.operations.length>3||row.operations.some(op=>!NONCE.test(op.id)||!HEX.test(op.inputHash))))fail('support_unavailable','Saved reports need checking. Your conversation is kept.',503);
 return owned;
}
export const supportReportRevision=row=>hash([row.tenantIdentity,row.id,row.status,row.note,row.reportedAt,row.acknowledgedAt||null,row.resolvedAt||null,row.resolution||null,row.operations]);
function view(row,operator=false){
 return {id:row.id,reference:'MC-'+row.id.slice(0,8).toUpperCase(),...(row.kind==='connection'?{kind:'connection',service:row.service,serviceLabel:CONNECTIONS[row.service]}:{}),channel:row.channel,contact:row.contact,conversationRef:row.conversationRef,note:row.note,status:row.status,label:{reported:'Reported',acknowledged:'Under review',resolved:'Resolved'}[row.status],reportedAt:row.reportedAt,acknowledgedAt:row.acknowledgedAt||null,resolvedAt:row.resolvedAt||null,resolution:row.resolution||null,revision:supportReportRevision(row),reportOperationId:row.reportOperationId,lastOperationId:row.operations.at(-1).id,operationIds:row.operations.map(op=>op.id),...(operator?{messages:row.messages||[],attention:{state:row.status==='resolved'?'closed':'operator_portal',detail:row.status==='reported'?'Available in operator Issues; no human acknowledgement is recorded.':row.status==='acknowledged'?'An operator acknowledged the report. A resolution is still pending.':'A customer-visible resolution is saved.'}}:{})};
}
export function supportReportViews(c,{operator=false}={}){return rows(c).map(row=>view(row,operator)).reverse();}
export function connectionAssistanceViews(c){return Object.fromEntries(Object.keys(CONNECTIONS).flatMap(service=>{const row=rows(c).findLast(row=>row.kind==='connection'&&row.service===service);return row?[[service,view(row)]]:[];}));}
export function conversationSupportReport(c,channel,contact){const row=rows(c).findLast(row=>row.channel===channel&&row.contact===contact);return row?view(row):null;}
export function supportReportIssues(c){return supportReportViews(c).filter(row=>row.status!=='resolved').map(row=>({id:'support:'+row.id,reportId:row.id,reference:row.reference,state:row.status,severity:'high',title:row.kind==='connection'?row.serviceLabel+' connection review requested':'Owner reported a conversation problem',detail:row.note}));}
async function sessionActive(session,scope){
 if(!HEX.test(session?.sessionHash||''))fail('verification_required','Sign in again before sending this report.',401);
 const saved=await strictRead('access_sessions',session.sessionHash);
 if(!saved||saved.status!=='active'||saved.scope!==scope||!Number.isFinite(Date.parse(saved.expiresAt))||Date.parse(saved.expiresAt)<=Date.now()||normalizeAccountEmail(saved.email)!==normalizeAccountEmail(session.email))fail('verification_required','Sign in again before continuing.',401);
 return saved;
}
const snapshot=conversation=>(conversation.messages||[]).slice(-6).map(message=>({role:message.role==='user'?'user':'assistant',content:String(message.content||'').slice(0,1000),at:typeof message.at==='string'?message.at:null}));
const latestFor=(list,channel,contact)=>list.findLast(row=>row.channel===channel&&row.contact===contact);
const audit=(c,event)=>({...c.management,revision:(c.management?.revision||0)+1,audit:[...(c.management?.audit||[]),event].slice(-100)});

// Use the existing owner report/operator Issues CAS, not a new helpdesk or job.
// A review request never accepts costs, provisions resources or verifies service.
export async function reportConnection(c,session,body){
 if(!supportedWorkspace(c)||!exact(body,['action','service','operationId','expectedReportRevision'])||body.action!=='report_connection'||!Object.hasOwn(CONNECTIONS,body.service)||!NONCE.test(body.operationId||'')||body.expectedReportRevision!==null&&!HEX.test(body.expectedReportRevision||''))fail('invalid_connection_report','Choose a connection and check its current review status.',400);
 const inputHash=hash(body),tenant=workspaceTenant(c),at=stamp(),id=hash([tenant,'connection',body.service,body.operationId]).slice(0,32);
 const outcome=await atomicUpdate('clients',c.slug,async saved=>{
  if(!supportedWorkspace(saved)||workspaceTenant(saved)!==tenant)fail('workspace_changed','This workspace changed. Sign in again before continuing.');
  await sessionActive(session,'onboarding');if(normalizeAccountEmail(saved.owner?.email)!==normalizeAccountEmail(session.email))fail('forbidden','This review belongs to another workspace.',403);
  const list=rows(saved),replay=list.find(row=>row.operations.some(op=>op.id===body.operationId));
  if(replay){const op=replay.operations.find(op=>op.id===body.operationId);if(op.action!=='report_connection'||op.inputHash!==inputHash)fail('operation_conflict','This request already belongs to another connection review. Check its saved result.');return {result:{report:replay,client:saved}};}
  if(['cancelled','paused','archived'].includes(saved.status))fail('workspace_stopped','Open Account to review your stopped service before requesting connection setup.');
  const previous=list.findLast(row=>row.kind==='connection'&&row.service===body.service);
  if(previous&&previous.status!=='resolved')return {result:{report:previous,client:saved,alreadyOpen:true}};
  if((previous?supportReportRevision(previous):null)!==body.expectedReportRevision)fail('report_changed','The connection review changed. Read its current status before requesting another review.',409,{supportReport:previous?view(previous):null});
  if((saved.management?.supportReports||[]).length>=LIMIT)fail('report_capacity','Existing connection reviews are kept. We could not save another review.');
  await sessionActive(session,'onboarding');
  const report={version:1,kind:'connection',service:body.service,tenantIdentity:tenant,id,reportOperationId:body.operationId,channel:'connection',contact:body.service,conversationRef:null,note:'The owner requested a review of '+CONNECTIONS[body.service]+' setup. Review the saved settings and platform requirements. This request does not authorize provisioning or fees.',status:'reported',reportedAt:at,messages:[],operations:[{id:body.operationId,action:'report_connection',inputHash,at}]};
  const management=audit(saved,{id:body.operationId,tenantIdentity:tenant,at,actor:session.email,action:'report_connection',reason:'Owner requested connection review',reportId:id});management.supportReports=[...(saved.management?.supportReports||[]),report];const value={...saved,management,updatedAt:at};return {value,result:{report,client:value}};
 });
 return {ok:true,supportReport:view(outcome.report),connectionAssistance:connectionAssistanceViews(outcome.client),receipt:{operationId:body.operationId,reportId:outcome.report.id,action:body.action,...(outcome.alreadyOpen?{alreadyOpen:true}:{})}};
}

export async function reportConversation(c,session,body){
 if(!supportedWorkspace(c)||!exact(body,['action','channel','contact','note','operationId','expectedReportRevision'])||body.action!=='report_conversation'||!NONCE.test(body.operationId||'')||!['web','sms','phone','voice','thumbtack','angi'].includes(body.channel)||typeof body.contact!=='string'||!body.contact||body.contact.length>60||/[\u0000-\u001f/]/.test(body.contact)||typeof body.note!=='string'||body.note.trim().length<3||body.note.length>1000||body.expectedReportRevision!==null&&!HEX.test(body.expectedReportRevision||''))fail('invalid_report','Describe what went wrong using 3 to 1,000 characters.',400,{field:'note'});
 const note=body.note.trim(),inputHash=hash({...body,note}),at=stamp(),tenant=workspaceTenant(c);
 const id=hash([tenant,body.channel,body.contact,body.operationId]).slice(0,32);
 const outcome=await atomicUpdate('clients',c.slug,async saved=>{
  if(!supportedWorkspace(saved)||workspaceTenant(saved)!==tenant)fail('workspace_changed','This workspace changed. Sign in again before continuing.');
  await sessionActive(session,'onboarding');if(normalizeAccountEmail(saved.owner?.email)!==normalizeAccountEmail(session.email))fail('forbidden','This report belongs to another workspace.',403);
  const list=rows(saved),replay=list.find(row=>row.operations.some(op=>op.id===body.operationId));
  if(replay){const receipt=replay.operations.find(op=>op.id===body.operationId);if(receipt.inputHash!==inputHash||receipt.action!=='report_conversation')fail('operation_conflict','This submission was already used for a different report. Check the saved report.');return {result:{report:replay,client:saved}};}
  const previous=latestFor(list,body.channel,body.contact);
  if(previous?.status!=='resolved'&&previous)fail('report_already_open','This conversation already has an open report. Check its progress.',409,{supportReport:view(previous)});
  if((previous?supportReportRevision(previous):null)!==body.expectedReportRevision)fail('report_changed','The report changed. Read its current status before submitting another problem.',409,{supportReport:previous?view(previous):null});
  if((saved.management?.supportReports||[]).length>=LIMIT)fail('report_capacity','We could not save another report in this workspace. Your note is still here; existing reports remain available.',409);
  const conversation=await strictRead('conversations',convKey(saved,body.channel,body.contact));
  if(!conversation||!belongsToWorkspace(saved,conversation)||conversation.channel!==body.channel||conversation.contact!==body.contact||!conversation.messages?.length)fail('conversation_not_found','Choose a saved conversation to report.',404);
  await sessionActive(session,'onboarding');
  const messages=snapshot(conversation);
  const report={version:1,tenantIdentity:tenant,id,reportOperationId:body.operationId,channel:body.channel,contact:body.contact,conversationRef:conversationReference(saved,body.channel,body.contact),note,status:'reported',reportedAt:at,messages,operations:[{id:body.operationId,action:'report_conversation',inputHash,at}]};
  const management=audit(saved,{id:body.operationId,tenantIdentity:tenant,at,actor:session.email,action:'report_conversation',reason:'Owner reported a saved conversation',reportId:id});management.supportReports=[...(saved.management?.supportReports||[]),report];
  const value={...saved,management,updatedAt:at};return {value,result:{report,client:value}};
 });
 return {ok:true,supportReport:view(outcome.report),supportReports:supportReportViews(outcome.client),receipt:{operationId:body.operationId,reportId:outcome.report.id,action:body.action}};
}

export async function changeSupportReport(c,session,body,{authorize,expectedManagementRevision,currentManagementRevision}={}){
 const resolving=body.action==='resolve_report',fields=['action','slug','expectedRevision','reason','reportId','expectedReportRevision','operationId',...(resolving?['resolution']:[])];
 if(!exact(body,fields)||body.slug!==c.slug||!HEX.test(body.expectedRevision||'')||!['acknowledge_report','resolve_report'].includes(body.action)||!NONCE.test(body.reportId||'')||!NONCE.test(body.operationId||'')||!HEX.test(body.expectedReportRevision||'')||typeof body.reason!=='string'||body.reason.trim().length<3||body.reason.length>300||resolving&&(typeof body.resolution!=='string'||body.resolution.trim().length<10||body.resolution.length>2000))fail('invalid_report_action',resolving?'Explain the resolution to the owner using 10 to 2,000 characters.':'Choose a report and add the reason for starting its review.',400,{field:resolving?'resolution':'reason'});
 const inputHash=hash({...body,reason:body.reason.trim(),...(resolving?{resolution:body.resolution.trim()}:{})}),tenant=workspaceTenant(c),at=stamp();
 const outcome=await atomicUpdate('clients',c.slug,async saved=>{
  if(!supportedWorkspace(saved)||workspaceTenant(saved)!==tenant)fail('workspace_changed','This customer workspace changed. Reload it before continuing.');
  await sessionActive(session,'operator');if(typeof authorize!=='function'||!await authorize(session))fail('forbidden','This account no longer has operator access.',403);
  const list=rows(saved),report=list.find(row=>row.id===body.reportId);if(!report)fail('report_not_found','This report was not found in the current workspace.',404);
  const replay=report.operations.find(op=>op.id===body.operationId);
  if(replay){if(replay.inputHash!==inputHash||replay.action!==body.action)fail('operation_conflict','This operation already belongs to another report change. Check the saved result.');return {result:{report,client:saved}};}
  if(list.some(row=>row.id!==report.id&&row.operations.some(op=>op.id===body.operationId)))fail('operation_conflict','This operation already belongs to a different report.');
  if(currentManagementRevision(saved)!==expectedManagementRevision||supportReportRevision(report)!==body.expectedReportRevision)fail('report_changed','This report or customer changed. Read the latest status before continuing.');
  if(report.status==='resolved'||!resolving&&report.status!=='reported')fail('report_changed','This report has already changed. Read its saved status.');
  if(resolving&&report.status!=='acknowledged')fail('review_required','Acknowledge the report and investigate before saving a resolution.');
  const changed={...report,status:resolving?'resolved':'acknowledged',...(resolving?{resolvedAt:at,resolution:body.resolution.trim()}:{acknowledgedAt:at}),operations:[...report.operations,{id:body.operationId,action:body.action,inputHash,at}]};
  const management=audit(saved,{id:body.operationId,tenantIdentity:tenant,at,actor:session.email,action:body.action,reason:body.reason.trim(),reportId:report.id});management.supportReports=(saved.management?.supportReports||[]).map(row=>row.id===report.id&&row.tenantIdentity===tenant?changed:row);
  const value={...saved,management,updatedAt:at};return {value,result:{report:changed,client:value}};
 });
 return {ok:true,supportReport:view(outcome.report,true),receipt:{operationId:body.operationId,reportId:body.reportId,action:body.action},client:outcome.client};
}

// Existing legacy flags are discovered fairly in bounded existing namespaces. New
// reports need no dispatch/index repair: report and operator Issues share one CAS.
export async function recoverSupportReports({limit=4,conversationLimit=8,deadline=Date.now()+4000}={}){
 if(!Number.isInteger(limit)||limit<1||limit>4||!Number.isInteger(conversationLimit)||conversationLimit<1||conversationLimit>8)throw Error('Invalid support discovery bounds');
 const result={inspected:0,conversations:0,adopted:0,invalidFlags:0,incomplete:false,errors:0};
 const census=await boundedRecordKeys('clients','',2000);result.incomplete=census.incomplete;
 const cursor=await strictRead('health','supportReports:cursor'),keys=census.keys.sort(),after=keys.findIndex(key=>key>(cursor?.client||'')),start=after<0?0:after,selected=[...keys.slice(start),...keys.slice(0,start)].slice(0,limit);
 for(const slug of selected){if(Date.now()>=deadline)break;result.inspected++;
  try{
   const c=await strictRead('clients',slug);if(!supportedWorkspace(c))continue;
   const tenant=workspaceTenant(c),scan=await boundedRecordKeys('conversations',`${slug}/${tenant}/`,2000);result.incomplete ||= scan.incomplete;
   const last=c.management?.supportDiscovery?.tenantIdentity===tenant?c.management.supportDiscovery.cursor:'',paths=scan.keys.sort(),offset=paths.findIndex(key=>key>last),index=offset<0?0:offset,chosen=[...paths.slice(index),...paths.slice(0,index)].slice(0,conversationLimit);let visited=last;
   for(const path of chosen){if(Date.now()>=deadline)break;visited=path;result.conversations++;
    const conv=await strictRead('conversations',path),flag=conv?.flag;if(!conv||!belongsToWorkspace(c,conv)||convKey(c,conv.channel,conv.contact)!==path||flag?.by!=='owner'||!conv.messages?.length)continue;
    if(typeof flag.note!=='string'||flag.note.trim().length<3||flag.note.length>1000||!Number.isFinite(Date.parse(flag.at))){result.invalidFlags++;continue;}
    const operationId=hash(['legacy-owner-flag-v1',tenant,conv.channel,conv.contact,flag.at,flag.note]).slice(0,32),id=hash([tenant,conv.channel,conv.contact,operationId]).slice(0,32),at=stamp();
    const adopted=await atomicUpdate('clients',slug,saved=>{
     if(!supportedWorkspace(saved)||workspaceTenant(saved)!==tenant)return {result:false};const list=rows(saved);
     if(list.some(row=>row.reportOperationId===operationId)||latestFor(list,conv.channel,conv.contact))return {result:false};
     if((saved.management?.supportReports||[]).length>=LIMIT)fail('report_capacity','Legacy support discovery reached the retained report limit. Existing reports are kept.');
     const report={version:1,tenantIdentity:tenant,id,reportOperationId:operationId,channel:conv.channel,contact:conv.contact,conversationRef:conversationReference(saved,conv.channel,conv.contact),note:flag.note.trim(),status:'reported',reportedAt:flag.at,messages:snapshot(conv),legacyFlag:true,operations:[{id:operationId,action:'legacy_flag_adopted',inputHash:hash(flag),at}]};
     const management=audit(saved,{id:operationId,tenantIdentity:tenant,at,actor:'scheduled_recovery',action:'legacy_report_recovered',reason:'Recovered an owner flag into operator Issues',reportId:id});management.supportReports=[...(saved.management?.supportReports||[]),report];return {value:{...saved,management},result:true};
    });if(adopted)result.adopted++;
   }
   if(visited!==last)await atomicUpdate('clients',slug,saved=>{
    if(!supportedWorkspace(saved)||workspaceTenant(saved)!==tenant)return {};
    const savedCursor=saved.management?.supportDiscovery?.tenantIdentity===tenant?saved.management.supportDiscovery.cursor:'';
    if(savedCursor!==last)return {}; // A delayed discovery cannot rewind a newer scan.
    return {value:{...saved,management:{...saved.management,supportDiscovery:{tenantIdentity:tenant,cursor:visited,at:stamp(),incomplete:scan.incomplete}}}};
   });
  }catch{result.errors++;}
  finally{await atomicUpdate('health','supportReports:cursor',previous=>({value:{...previous,client:slug,at:stamp()}}));}
 }
 if(result.errors||result.incomplete)throw Object.assign(new Error('Some retained owner flags need checking; accepted reports remain visible in operator Issues.'),{supportRecovery:result});
 return result;
}
