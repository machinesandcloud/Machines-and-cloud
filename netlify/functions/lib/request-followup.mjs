// One explicitly requested service follow-up. Owner preparation is not recipient
// permission. The existing request journal and managed delivery queue retain work.
import {createHash} from 'node:crypto';
import {atomicUpdate} from './store.mjs';
import {strictRead,normalizeAccountEmail} from './accounts.mjs';
import {workspaceTenant,belongsToWorkspace} from './workspace-identity.mjs';
import {isSupportedSelfServiceClient} from './setup.mjs';
import {requestOwnerAuthority,requestSource,requestSourceRevision,requestJournalKey,requestJournalRow,RequestFollowthroughError,readRequestFollowthrough} from './request-followthrough.mjs';
import {buildMessagingProgram,serviceFollowupProgram,SERVICE_FOLLOWUP_PROGRAM_VERSION} from './messaging-program.mjs';
import {policyUrls} from './config.mjs';
const stamp=()=>new Date().toISOString(),hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const KINDS=['quote_followup','request_followup'],WORDS={quote_followup:'QUOTE',request_followup:'REQUEST'},VERSION='one_requested_followup_v1';
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value),validPhone=value=>/^\+1[2-9]\d{9}$/.test(value||''),sid=value=>/^SM[a-f0-9]{32}$/i.test(value||'');
const fail=(code,message,status=409,field=null)=>{throw new RequestFollowthroughError(code,message,status,field);};
const permissionKey=(c,id,purpose)=>`${c.slug}/${workspaceTenant(c)}/${id}/${purpose}`;
const queueId=(c,plan)=>`${c.slug}/${hash(`${workspaceTenant(c)}:sms:request_followup:${plan.id}`)}`;
const askQueueId=(c,ask)=>`${c.slug}/${hash(`${workspaceTenant(c)}:sms:sms_reply:${ask.requestMessageSid}`)}`;
const consentKey=(c,phone)=>`${c.slug}/${workspaceTenant(c)}/${phone}`;
const freshSource=(lead,plan)=>!lead.websiteSetupCheck&&!lead.simulation&&lead.status!=='spam'&&lead.outcome!=='spam'&&lead.phone===plan.phone&&requestSourceRevision(lead)===plan.sourceRevision;
const stateLabels={queued:'Scheduled for one message',accepted:'Provider accepted',delivered:'Delivered',uncertain:'Outcome unconfirmed',failed:'Failed',waiting_platform:'Waiting for texting setup',waiting_consent:'Waiting for recipient permission',waiting_hours:'Waiting for sending hours',superseded:'Stopped: request changed',suppressed:'Stopped',expired:'Expired'};
async function savedPermission(c,lead,purpose){const row=await strictRead('request_followup_permissions',permissionKey(c,lead.id,purpose));if(!row)return null;if(row.version!==1||row.tenant!==workspaceTenant(c)||row.requestId!==lead.id||row.purpose!==purpose||row.phone!==lead.phone||row.sourceRevision!==requestSourceRevision(lead))return null;return row;}
async function currentLead(c,id){const lead=await requestSource(c,id);if(lead.websiteSetupCheck||lead.simulation||lead.status==='spam'||lead.outcome==='spam'||!validPhone(lead.phone))fail('followup_not_supported','Choose a real customer request with a valid saved mobile number.');return lead;}
async function askDisposition(c,ask){
  if(!ask)return null;const job=await strictRead('managed_deliveries',askQueueId(c,ask));
  if(job?.attemptStartedAt&&!job.providerId)return 'uncertain';
  if(job&&!job.attemptStartedAt&&['superseded','suppressed','expired'].includes(job.state))return 'not_attempted';
  return null;
}
export async function requestFollowupSender(c){
  if(c.serviceFollowupProgram?.version!==SERVICE_FOLLOWUP_PROGRAM_VERSION)return null;
  const {messagingSender}=await import('./messaging-activation.mjs');return messagingSender(c);
}
async function registration(c){const t=hash(JSON.stringify([c.slug,c.ownerKey,normalizeAccountEmail(c.owner?.email)]));return strictRead('messaging_activation',`${c.slug}/${hash('messaging-v1:'+t)}`);}
async function programState(c,plan=null){
  const offer=serviceFollowupProgram(c),row=await registration(c);
  if(row&&row.programDigest!==offer.digest)return {ready:false,reason:'existing_program_mismatch',message:'This texting registration covers appointment updates. Quote and request follow-ups need a separately reviewed registration; your existing service is unchanged.',program:offer};
  if(plan&&plan.programDigest!==offer.digest)return {ready:false,reason:'program_changed',message:'Your business texting details changed. Review a new follow-up before scheduling it.',program:offer};
  if(c.serviceFollowupProgram?.version!==SERVICE_FOLLOWUP_PROGRAM_VERSION)return {ready:false,reason:'program_review_required',message:'Review the service follow-up program before your first texting registration.',program:offer};
  const ready=!!await requestFollowupSender(c);
  return {ready,reason:ready?null:'texting_not_ready',message:ready?'Texting setup is ready. Each customer still chooses their own one-message permission.':'Your follow-up is saved while texting setup is completed.',program:offer};
}
async function selectProgram(c,plan){
  if(!plan.programReview||plan.programReview.digest!==plan.programDigest)return;
  await atomicUpdate('clients',c.slug,async current=>{
    if(!isSupportedSelfServiceClient(current)||workspaceTenant(current)!==workspaceTenant(c)||!['testing','live','paused'].includes(current.status))return {};
    const desired=serviceFollowupProgram(current),row=await registration(current);
    if(desired.digest!==plan.programDigest||row&&row.programDigest!==desired.digest)return {};
    if(current.serviceFollowupProgram?.version===SERVICE_FOLLOWUP_PROGRAM_VERSION)return {};
    return {value:{...current,serviceFollowupProgram:{version:SERVICE_FOLLOWUP_PROGRAM_VERSION,reviewedDigest:desired.digest,reviewedAt:plan.programReview.at,actor:plan.programReview.actor}}};
  });
}
export function requestFollowupQuestion(c,lead,purpose){
  const subject=purpose==='quote_followup'?'the quote for this service request':'this service request',urls=policyUrls(c.slug);
  return `${c.business.name}: would you like one text within 30 days about ${subject} (ref ${lead.id})? Reply YES ${WORDS[purpose]} ${lead.id} to agree. No promotions. Message and data rates may apply. HELP for help; STOP/ALTO/PARAR to end. Service is available without texts. Terms: ${urls.terms} Privacy: ${urls.privacy}`;
}
function outreach(c,lead,plan){return plan.purpose==='quote_followup'?`${c.business.name}: any questions about the quote for your requested service (ref ${lead.id})?${plan.quoteUrl?' Your quote: '+plan.quoteUrl:''} Reply here for help. This is your one requested quote follow-up. Reply STOP to end texts or HELP for help.`:`${c.business.name}: checking once about your service request (ref ${lead.id}). Reply here if you need help with it. Reply STOP to end texts or HELP for help.`;}
async function invitation(c,lead){
  if(!isSupportedSelfServiceClient(c)||!lead?.id||!belongsToWorkspace(c,lead)||lead.websiteSetupCheck||lead.simulation||lead.status==='spam'||lead.urgency==='emergency'||!validPhone(lead.phone))return null;
  const sender=await requestFollowupSender(c);if(!sender)return null;
  const journal=await strictRead('request_followthrough',requestJournalKey(c,lead.id));if(journal?.state?.completedAt||journal?.outreachUse)return null;
  return {version:1,requestId:lead.id,phone:lead.phone,number:sender.number,business:String(c.business.name).slice(0,100),choices:KINDS.filter(purpose=>purpose!=='quote_followup'||quoteRecorded(journal,lead)).map(purpose=>({purpose,label:purpose==='quote_followup'?'One quote follow-up':'One request follow-up',command:WORDS[purpose]+' '+lead.id}))};
}
export async function requestFollowupInvitation(c,lead){
  try {const current=await strictRead('clients',c.slug);if(!current||workspaceTenant(current)!==workspaceTenant(c))return null;return await invitation(current,lead);}catch{return null;} // An optional invitation cannot hide a request already saved.
}
function sameProof(row,lead,purpose,c){return row&&row.version===1&&row.tenant===workspaceTenant(c)&&row.requestId===lead.id&&row.purpose===purpose&&row.phone===lead.phone&&row.sourceRevision===requestSourceRevision(lead);}
export async function mayDeliverRequestFollowup(c,phone,purpose,job){
  if(!job?.followup||!['followup_consent_ask',...KINDS].includes(purpose))return false;
  const f=job.followup;if(!validId(f.requestId)||!KINDS.includes(f.purpose))return false;
  let lead;try{lead=await currentLead(c,f.requestId);}catch{return false;}
  if(phone!==lead.phone||f.sourceRevision!==requestSourceRevision(lead)||!await requestFollowupSender(c))return false;
  const row=await savedPermission(c,lead,f.purpose),consent=await strictRead('managed_sms_consent',consentKey(c,phone));
  if(!consent||consent.suppressed)return false;
  const journal=await strictRead('request_followthrough',requestJournalKey(c,lead.id));if(journal?.state?.completedAt)return false;
  if(purpose==='followup_consent_ask')return !!row?.initiations?.[f.requestMessageSid]&&row.initiations[f.requestMessageSid].askEventId===f.askEventId&&Date.parse(row.initiations[f.requestMessageSid].at)>Date.now()-86400000&&Date.parse(row.initiations[f.requestMessageSid].providerDate)>(Number(consent.directiveDate)||0);
  const sender=await requestFollowupSender(c),proof=row?.proof,question=proof&&[row.pendingAsk,...Object.values(row.asks||{})].find(ask=>ask?.receipt?.messageSid===proof.askMessageSid);
  return !!proof&&!!question&&!question.failedAt&&!['failed','undelivered','canceled'].includes(question.receipt.status)&&question.wording===proof.wording&&proof.wordingVersion===VERSION&&proof.recipient===phone&&proof.senderNumber===sender?.number&&proof.messagingServiceSid===sender?.serviceSid&&sid(proof.messageSid)&&sid(proof.askMessageSid)&&(!job.dueAt||Date.parse(proof.providerDate)<=Date.parse(job.dueAt))&&Date.parse(proof.expiresAt)>Math.max(Date.now(),Date.parse(job.dueAt)||0)&&Date.parse(proof.providerDate)>(Number(consent.directiveDate)||0)&&Date.parse(proof.askProviderDate)>(Number(consent.directiveDate)||0);
}
export async function inspectRequestFollowup(c,job){
  if(!job?.followup)return true;
  const f=job.followup;let lead;try{lead=await currentLead(c,f.requestId);}catch{return false;}
  if(job.tenant!==workspaceTenant(c)||job.to!==lead.phone||f.sourceRevision!==requestSourceRevision(lead))return false;
  if(job.purpose==='followup_consent_ask')return mayDeliverRequestFollowup(c,job.to,job.purpose,job);
  const row=await strictRead('request_followthrough',requestJournalKey(c,lead.id)),plan=row?.automaticFollowup;
  if(!plan||plan.id!==f.planId||plan.cancelledAt||!freshSource(lead,plan)||row.state?.completedAt||newOwnerContact(row,plan))return false;
  const permission=await savedPermission(c,lead,plan.purpose);if(Date.parse(permission?.proof?.providerDate)>Date.parse(plan.dueAt))return false;
  const consent=await strictRead('managed_sms_consent',consentKey(c,lead.phone));
  if(newCustomerReply(consent,plan))return false;
  return plan.programDigest===buildMessagingProgram(c).digest&&job.body===plan.body&&job.purpose===plan.purpose;
}
export async function readRequestAutomation(c,id){
  const current=await strictRead('clients',c.slug);if(!current||workspaceTenant(current)!==workspaceTenant(c))return null;c=current;
  let lead;try{lead=await currentLead(c,id);}catch{return null;}
  const row=await strictRead('request_followthrough',requestJournalKey(c,id)),plan=row?.automaticFollowup,program=await programState(c,plan);
  const allowed=['testing','live','paused'].includes(c.status)&&(!row||row.history.length<300),reviewRequired=!!row?.sourceRevision&&row.sourceRevision!==requestSourceRevision(lead);
  const base={canPrepare:allowed&&!row?.state?.completedAt&&!row?.outreachUse&&!reviewRequired,canCancel:allowed&&!!plan&&!plan.cancelledAt&&!row?.outreachUse,unavailableReason:!allowed?'This workspace or its retained request history is read-only.':row?.state?.completedAt?'Reopen this request before preparing an automatic follow-up.':row?.outreachUse?'This request already has a text reserved or attempted. Check its saved status before taking another action.':reviewRequired?'Review the changed customer request before scheduling a text.':null,quoteEligible:quoteRecorded(row,lead),quoteMilestone:quoteRecorded(row,lead)?{at:row.quoteMilestone.at}:null,templates:Object.fromEntries(KINDS.map(purpose=>[purpose,outreach(c,lead,{purpose,quoteUrl:''})])),program:{ready:program.ready,reason:program.reason,message:program.message,review:program.program,requiresReview:c.serviceFollowupProgram?.reviewedDigest!==program.program.digest&&plan?.programReview?.digest!==program.program.digest},invitation:await requestFollowupInvitation(c,lead)};
  if(!plan)return {...base,plan:null};
  const job=await strictRead('managed_deliveries',queueId(c,plan)),permission=await savedPermission(c,lead,plan.purpose),consent=await strictRead('managed_sms_consent',consentKey(c,plan.phone));
  const changed=!freshSource(lead,plan),replied=job?.attemptStartedAt?Date.parse(consent?.lastServiceReplyAt)>Date.parse(job.acceptedAt||job.attemptStartedAt):newCustomerReply(consent,plan),stopped=plan.cancelledAt||consent?.suppressed||row.state?.completedAt||changed||newOwnerContact(row,plan)||['cancelled','archived'].includes(c.status);
  const permitted=await mayDeliverRequestFollowup(c,plan.phone,plan.purpose,{dueAt:plan.dueAt,followup:{requestId:id,purpose:plan.purpose,sourceRevision:plan.sourceRevision}});
  const late=Date.parse(permission?.proof?.providerDate)>Date.parse(plan.dueAt);
  const expiresBeforeDue=Date.parse(permission?.proof?.expiresAt)<=Date.parse(plan.dueAt);
  const expiryLabel=expiresBeforeDue?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(permission.proof.expiresAt)):null;
  const state=job?.attemptStartedAt?(job.state==='uncertain'?'uncertain':replied?'replied':job.state):stopped?'stopped':late?'needs_new_time':replied?'replied':!program.ready?'waiting_program':!permitted?'waiting_consent':job?.state||'preparing';
  const stopReason=plan.cancelledAt?'owner_stopped':consent?.suppressed?'recipient_stopped':row.state?.completedAt?'request_closed':changed?'request_changed':newOwnerContact(row,plan)?'new_owner_contact':'workspace_closed';
  const stopDetails={owner_stopped:'You stopped this saved text. No new message will be sent from this plan.',recipient_stopped:'The customer stopped texts. This plan cannot send.',request_closed:'This request is closed. Its unsent follow-up is stopped.',request_changed:'The saved customer or request details changed. Review the current request before preparing another text.',new_owner_contact:'You recorded new contact with this customer after preparing this text. Its unsent follow-up is stopped.',workspace_closed:'This workspace is read-only. Its unsent follow-up is stopped.'};
  const questionUncertain=state==='waiting_consent'&&await askDisposition(c,permission?.pendingAsk)==='uncertain';
  const detail=state==='stopped'?stopDetails[stopReason]:state==='replied'?'A new customer message was received after this plan. Any unsent follow-up is stopped; a reply does not prove a prior text was delivered.':state==='uncertain'&&replied?'A new customer message was received, but the earlier text outcome remains unconfirmed. No replacement is sent.':state==='waiting_program'?program.message:state==='needs_new_time'?'Permission arrived after the chosen time. Choose a new future time.':state==='waiting_consent'&&expiresBeforeDue?`The customer’s current permission expires on ${expiryLabel}, before the chosen time. Choose an earlier time or wait for renewed permission initiated by the customer. No re-consent text is sent automatically.`:questionUncertain?'The permission question’s sending outcome is unconfirmed. We will not repeat that question automatically. You can handle this request directly.':job?.detail||null;
  return {...base,...(state==='uncertain'?{unavailableReason:'We couldn’t confirm the sending result. Check text status; this text won’t be sent again automatically.'}:{}),plan:{id:plan.id,purpose:plan.purpose,milestone:plan.milestone,phone:plan.phone,body:plan.body,dueAt:plan.dueAt,createdAt:plan.createdAt,state,label:state==='waiting_consent'&&expiresBeforeDue?'Waiting for renewed permission':stateLabels[state]||({stopped:'Stopped',replied:'Customer message received afterward',waiting_program:'Waiting for texting setup',preparing:'Saved for preparation',needs_new_time:'Choose a new time: permission arrived after the scheduled time'})[state]||state,detail,reasonCode:state==='stopped'?stopReason:state==='replied'?'customer_replied':state==='needs_new_time'?'followup_new_time_required':state==='waiting_consent'&&expiresBeforeDue?'permission_expires_before_due':job?.reasonCode||null,providerId:job?.providerId||null,acceptedAt:job?.acceptedAt||null,deliveredAt:job?.deliveredAt||null,deliveryState:job?.state||null,replyAt:replied?consent.lastServiceReplyAt:null,permission:permission?.proof?{at:permission.proof.at,wording:permission.proof.wording,recipient:permission.proof.recipient,method:'Recipient affirmative SMS',expiresAt:permission.proof.expiresAt}:null}};
}
export async function queueRequestAutomation(c,id){
  const lead=await currentLead(c,id),row=await strictRead('request_followthrough',requestJournalKey(c,id)),plan=row?.automaticFollowup;if(!plan)return null;
  await selectProgram(c,plan);const current=await strictRead('clients',c.slug);if(!current||workspaceTenant(current)!==workspaceTenant(c))return null;
  const {queueManagedMessage}=await import('./managed-delivery.mjs');
  return queueManagedMessage(current,{eventId:'request_followup:'+plan.id,channel:'sms',purpose:plan.purpose,to:plan.phone,body:plan.body,dueAt:plan.dueAt,followup:{requestId:id,purpose:plan.purpose,sourceRevision:plan.sourceRevision,planId:plan.id}});
}
function parse(body){
  const common=['action','type','requestId','operationId','sourceRevision','expectedRevision','note'],extra=body?.type==='prepare'?['purpose','dueAt','quoteUrl','programDigest','reviewProgram']:[];
  if(!body||body.action!=='request_followup'||!['prepare','cancel'].includes(body.type)||Object.keys(body).some(key=>![...common,...extra].includes(key))||JSON.stringify(body).length>5000||!validId(body.requestId)||!/^[a-f0-9]{32}$/.test(body.operationId||'')||!/^[a-f0-9]{64}$/.test(body.sourceRevision||'')||!/^[a-f0-9]{64}$/.test(body.expectedRevision||''))fail('invalid_request','Reload this request before saving a follow-up.',400);
  if(typeof body.note!=='string'||body.note.length>1000)fail('invalid_note','Keep your note to 1,000 characters.',400,'automaticFollowupNote');
  if(body.type==='prepare'&&(!KINDS.includes(body.purpose)||typeof body.dueAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.dueAt)||!Number.isFinite(Date.parse(body.dueAt))||new Date(body.dueAt).toISOString()!==body.dueAt||Date.parse(body.dueAt)<=Date.now()||Date.parse(body.dueAt)>Date.now()+30*86400000||typeof body.quoteUrl!=='string'||body.quoteUrl.length>1000||typeof body.reviewProgram!=='boolean'))fail('invalid_followup','Choose one follow-up and a future time within 30 days.',400,'automaticFollowupDue');
  return structuredClone(body);
}
export async function updateRequestAutomation(c,session,body){
  const input=parse(body),actor=normalizeAccountEmail(session?.email),digest=hash({input,actor}),at=stamp();await requestOwnerAuthority(c,session);
  await atomicUpdate('request_followthrough',requestJournalKey(c,input.requestId),async saved=>{
    const current=await requestOwnerAuthority(c,session,true),lead=await currentLead(current,input.requestId),row=requestJournalRow(current,input.requestId,saved),previous=row.history.find(e=>e.id===input.operationId);
    if(previous){if(previous.digest!==digest)fail('operation_conflict','This action was already used for a different follow-up.');return {result:row};}
    if(hash(row)!==input.expectedRevision||requestSourceRevision(lead)!==input.sourceRevision)fail('request_changed','The request changed. Review its saved details before scheduling a message.');
    if(row.sourceRevision&&row.sourceRevision!==input.sourceRevision)fail('request_review_required','Review the changed customer request first.');
    if(row.history.length>=300)fail('request_read_only','This retained request history is full. Contact support before adding work.');
    if(row.state.completedAt&&input.type==='prepare')fail('request_completed','Reopen this request before preparing an automatic follow-up.');
    if(row.outreachUse&&input.type==='prepare')fail('followup_already_attempted','This request already has a text reserved or attempted. Check its saved status before taking another action.');
    let plan=row.automaticFollowup;
    if(input.type==='cancel'){if(!plan)fail('followup_not_found','There is no saved automatic follow-up to stop.');plan={...plan,cancelledAt:at};}
    else{
      const old=plan&&await strictRead('managed_deliveries',queueId(current,plan));if(old?.attemptStartedAt)fail('followup_already_attempted','The earlier follow-up was attempted. Check its saved delivery outcome; another message will not be created.');
      const program=serviceFollowupProgram(current);if(input.reviewProgram!==true||input.programDigest!==program.digest)fail('program_review_required','Review the one-message service follow-up program before saving.');
      if(input.quoteUrl){let url,website;try{url=new URL(input.quoteUrl);website=new URL(current.business.website);}catch{fail('invalid_quote_url','Use a complete HTTPS quote link on your business website, with no spaces or line breaks.',400,'automaticFollowupUrl');}if(input.purpose!=='quote_followup'||url.protocol!=='https:'||url.username||url.password||url.origin!==website.origin||!/^https:\/\//i.test(input.quoteUrl)||/[\s\u0000-\u001f\u007f-\u009f\\]/u.test(input.quoteUrl))fail('invalid_quote_url','Use a complete HTTPS quote link on your business website, with no spaces or line breaks.',400,'automaticFollowupUrl');}
      const consent=await strictRead('managed_sms_consent',consentKey(current,lead.phone));
      plan={version:1,id:input.operationId,purpose:input.purpose,milestone:input.purpose==='quote_followup'?'quote_sent':'awaiting_customer_reply',phone:lead.phone,sourceRevision:input.sourceRevision,dueAt:input.dueAt,quoteUrl:input.quoteUrl,programDigest:program.digest,programReview:{actor,at,digest:program.digest},createdAt:at,cancelledAt:null,historyIndex:row.history.length,customerReplyBaseline:consent?.lastServiceReplyMessageSid||null};plan.body=outreach(current,lead,plan);
    }
    await requestOwnerAuthority(current,session,true);if(requestSourceRevision(await currentLead(current,input.requestId))!==input.sourceRevision)fail('request_source_changed','The customer request changed before this action was saved.');
    const next={...row.state},entry={id:input.operationId,type:input.type==='prepare'?'automatic_followup_prepared':'automatic_followup_stopped',at,actor,digest,input,source:lead,state:next};
    return {value:{...row,slug:current.slug,sourceRevision:input.sourceRevision,state:next,automaticFollowup:plan,...(input.type==='prepare'&&input.purpose==='quote_followup'?{quoteMilestone:{at,sourceRevision:input.sourceRevision,actor}}:{}),history:[...row.history,entry]}};
  });
  try{await queueRequestAutomation(c,input.requestId);}catch{/* The normal managed worker rebuilds the projection from this saved journal. */}
  return readRequestFollowthrough(c,session,input.requestId,input.operationId);
}

// Invoked only from the verified, retained managed inbound handler. No model tool
// or owner assertion can manufacture an affirmative recipient event.
export async function requestFollowupInbound(c,job){
  const match=String(job.body||'').trim().match(/^(YES\s+)?(QUOTE|REQUEST)\s+([a-zA-Z0-9_-]{1,80})$/i);
  if(!match)return {reply:`${c.business.name}: please use the full follow-up instruction shown beside your service request, or contact the shop directly. No follow-up permission was added. HELP for help; STOP to end texts.`,purpose:'reply'};
  const retained=await strictRead('managed_sms_inbound',job.id),ledger=await strictRead('managed_sms_consent',consentKey(c,job.from));
  if(!retained||retained.messageSid!==job.messageSid||retained.body!==job.body||retained.from!==job.from||retained.providerDate!==job.providerDate||retained.tenant!==workspaceTenant(c)||!sid(job.messageSid)||!ledger?.seen?.[job.messageSid]||ledger.suppressed)return {reply:'Please contact the shop directly about this request.',purpose:'reply'};
  const purpose=match[2].toUpperCase()==='QUOTE'?'quote_followup':'request_followup',requestId=match[3];let lead;
  try{lead=await currentLead(c,requestId);}catch{return {reply:`${c.business.name}: we could not match that request. Please contact the shop directly. HELP for help; STOP to end texts.`,purpose:'reply'};}
  const journal=await strictRead('request_followthrough',requestJournalKey(c,requestId));
  if(lead.phone!==job.from||journal?.state?.completedAt||purpose==='quote_followup'&&!quoteRecorded(journal,lead)||!await requestFollowupSender(c))return {reply:`${c.business.name}: please contact the shop directly about this request. No follow-up permission was added. HELP for help; STOP to end texts.`,purpose:'reply'};
  const command=`YES ${WORDS[purpose]} ${requestId}`,key=permissionKey(c,requestId,purpose),at=stamp();let reply;
  await atomicUpdate('request_followup_permissions',key,async old=>{
    let priorSources=old?.priorSources||[];
    if(old&&!sameProof(old,lead,purpose,c)){
      if(priorSources.length>=8)throw Error('Follow-up source history is full');
      const {priorSources:ignored,...retained}=old;priorSources=[...priorSources,retained];old=null;
    }
    const row=old||{version:1,tenant:workspaceTenant(c),requestId,purpose,phone:lead.phone,sourceRevision:requestSourceRevision(lead),initiations:{},affirmations:{},priorSources};
    if(journal?.outreachUse){reply={reply:`${c.business.name}: this request's one follow-up has already been attempted. Please contact the shop directly for further help. STOP to end texts.`,purpose:'reply'};return {};}
    if(!match[1]){
      const original=row.asks?.['followup_ask:'+job.messageSid]||(row.pendingAsk?.requestMessageSid===job.messageSid?row.pendingAsk:null);
      if(original){reply={reply:original.wording,purpose:'followup_consent_ask',followup:{requestId,purpose,sourceRevision:row.sourceRevision,requestMessageSid:job.messageSid,askEventId:original.askEventId}};return {};}
      const unresolved=await Promise.all([row,...priorSources].map(item=>askDisposition(c,item.pendingAsk)));
      if(unresolved.includes('uncertain')){reply={reply:`${c.business.name}: the earlier permission question's sending outcome is unconfirmed. We will not repeat it automatically. Please contact the shop directly for help. HELP for help; STOP to end texts.`,purpose:'reply'};return {};}
      const directive=Number(ledger.directiveDate)||0,validProof=row.proof&&Date.parse(row.proof.expiresAt)>Date.now()&&Date.parse(row.proof.askProviderDate)>directive&&Date.parse(row.proof.providerDate)>directive;
      if(validProof){reply={reply:`${c.business.name}: your choice is already saved for one ${purpose==='quote_followup'?'quote':'request'} follow-up for this request. HELP for help; STOP to end texts.`,purpose:'reply'};return {};}
      if(row.pendingAsk&&!row.pendingAsk.failedAt&&unresolved[0]!=='not_attempted'&&Date.parse(row.pendingAsk.createdAt)>directive&&Date.parse(row.pendingAsk.createdAt)>Date.now()-86400000){reply={reply:`${c.business.name}: if you received the follow-up question for this request, reply ${command} to agree. Otherwise please contact the shop directly. HELP for help; STOP to end texts.`,purpose:'reply'};return {};}
      if([row,...priorSources].reduce((n,item)=>n+Object.keys(item.initiations||{}).length,0)>=32)throw Error('Follow-up permission history is full');
      const askEventId='followup_ask:'+job.messageSid,initiation={at,providerDate:job.providerDate,askEventId},wording=requestFollowupQuestion(c,lead,purpose);
      const followup={requestId,purpose,sourceRevision:row.sourceRevision,requestMessageSid:job.messageSid,askEventId};
      reply={reply:wording,purpose:'followup_consent_ask',followup};
      const pendingAsk={requestMessageSid:job.messageSid,askEventId,wording,createdAt:at};
      return {value:{...row,initiations:{...row.initiations,[job.messageSid]:initiation},asks:{...row.asks,...(row.pendingAsk?{[row.pendingAsk.askEventId]:row.pendingAsk}:{}),[askEventId]:pendingAsk},pendingAsk,updatedAt:at}};
    }
    const prior=row.affirmations[job.messageSid];if(prior&&(prior.body!==job.body||prior.providerDate!==job.providerDate))throw Error('Affirmation identity changed');
    if(!prior&&[row,...priorSources].reduce((n,item)=>n+Object.keys(item.affirmations||{}).length,0)>=64)throw Error('Follow-up permission history is full');
    const candidate=prior||{messageSid:job.messageSid,providerDate:job.providerDate,at,body:job.body};
    const next={...row,affirmations:{...row.affirmations,[job.messageSid]:candidate},updatedAt:at};
    const proof=grantProof(c,lead,purpose,next,candidate,ledger);
    if(proof&&(!row.proof||row.proof.askMessageSid!==proof.askMessageSid||Date.parse(proof.providerDate)<Date.parse(row.proof.providerDate)))next.proof=proof;
    reply={reply:proof?`${c.business.name}: your choice is saved for one ${purpose==='quote_followup'?'quote':'request'} follow-up for this request. The shop chooses whether and when to schedule it. HELP for help; STOP to end texts.`:`${c.business.name}: your reply is saved while we check the question's sending receipt. No follow-up permission is confirmed yet. HELP for help; STOP to end texts.`,purpose:'reply'};
    return {value:next};
  });
  return reply;
}
function grantProof(c,lead,purpose,row,candidate,ledger){
  const ask=row.pendingAsk,receipt=ask?.receipt,when=Date.parse(candidate?.providerDate),sent=Date.parse(receipt?.sentAt);
  if(!ask||ask.failedAt||!receipt||!sid(receipt.messageSid)||['failed','undelivered','canceled'].includes(receipt.status)||ask.wording!==requestFollowupQuestion(c,lead,purpose)||!Number.isFinite(when)||!Number.isFinite(sent)||when<=sent||when>sent+86400000||ledger?.suppressed||when<=(Number(ledger?.directiveDate)||0)||sent<=(Number(ledger?.directiveDate)||0))return null;
  return {wordingVersion:VERSION,wording:ask.wording,recipient:lead.phone,purpose,requestId:lead.id,tenant:workspaceTenant(c),sourceRevision:requestSourceRevision(lead),askMessageSid:receipt.messageSid,messageSid:candidate.messageSid,providerDate:candidate.providerDate,askProviderDate:receipt.sentAt,senderNumber:receipt.from,messagingServiceSid:receipt.serviceSid,at:candidate.at,expiresAt:new Date(when+30*86400000).toISOString()};
}
export async function saveRequestFollowupAsk(c,job,receipt){
  if(job.purpose!=='followup_consent_ask'||!job.followup||!sid(receipt?.id))return false;
  const f=job.followup;let lead;try{lead=await currentLead(c,f.requestId);}catch{return false;}
  if(job.to!==lead.phone||f.sourceRevision!==requestSourceRevision(lead)||job.body!==requestFollowupQuestion(c,lead,f.purpose)||!KINDS.includes(f.purpose))return false;
  const sender=await requestFollowupSender(c),ledger=await strictRead('managed_sms_consent',consentKey(c,lead.phone));
  if(!sender||receipt.from!==sender.number||receipt.serviceSid!==sender.serviceSid||ledger?.suppressed||!Number.isFinite(Date.parse(receipt.sentAt)))return false;
  const saved=await atomicUpdate('request_followup_permissions',permissionKey(c,lead.id,f.purpose),row=>{
    if(!sameProof(row,lead,f.purpose,c)||row.pendingAsk?.askEventId!==f.askEventId||row.pendingAsk?.requestMessageSid!==f.requestMessageSid)return {result:false};
    let accepted={messageSid:receipt.id,sentAt:receipt.sentAt,status:receipt.status||'accepted',from:receipt.from,serviceSid:receipt.serviceSid};
    if(row.pendingAsk.receipt?.messageSid&&row.pendingAsk.receipt.messageSid!==receipt.id)throw Error('Follow-up question identity changed');
    const prior=row.pendingAsk.receipt;
    if(prior&&(row.pendingAsk.failedAt||['failed','undelivered','canceled'].includes(prior.status)||prior.status==='delivered'&&!['failed','undelivered','canceled'].includes(accepted.status)))accepted=prior;
    const failed=!!row.pendingAsk.failedAt||['failed','undelivered','canceled'].includes(accepted.status),ask={...row.pendingAsk,receipt:accepted,...(failed?{failedAt:row.pendingAsk.failedAt||stamp()}:{})},next={...row,pendingAsk:ask,asks:{...row.asks,[ask.askEventId]:ask},updatedAt:stamp()};
    if(failed){if(next.proof?.askMessageSid===receipt.id)next.proof=null;}
    else for(const candidate of Object.values(row.affirmations||{}).sort((a,b)=>Date.parse(a.providerDate)-Date.parse(b.providerDate))){const proof=grantProof(c,lead,f.purpose,next,candidate,ledger);if(proof){next.proof=proof;break;}}
    return {value:next,result:{saved:true,receipt:accepted,failed}};
  });
  if(saved?.saved&&!saved.failed)await atomicUpdate('managed_sms_consent',consentKey(c,lead.phone),row=>{
    if(!row||row.suppressed||Date.parse(receipt.sentAt)<=(Number(row.directiveDate)||0)||Date.parse(row.lastFollowupQuestion?.sentAt)>Date.parse(receipt.sentAt))return {};
    return {value:{...row,lastFollowupQuestion:{requestId:lead.id,purpose:f.purpose,sourceRevision:f.sourceRevision,messageSid:receipt.id,sentAt:receipt.sentAt}}};
  });
  return saved?.saved===true;
}
export async function requestFollowupAffirmativeInstruction(c,job){
  if(!/^(YES|SI|SÍ)$/i.test(String(job.body||'').trim()))return null;
  const ledger=await strictRead('managed_sms_consent',consentKey(c,job.from)),question=ledger?.lastFollowupQuestion;
  if(!question||ledger.suppressed||Date.parse(question.sentAt)<=(Number(ledger.directiveDate)||0)||Date.parse(question.sentAt)<Date.now()-86400000||Date.parse(ledger.pendingAsk?.askedAt)>Date.parse(question.sentAt)||Date.parse(ledger.proof?.providerDate)>Date.parse(question.sentAt))return null;
  let lead;try{lead=await currentLead(c,question.requestId);}catch{return null;}
  if(lead.phone!==job.from||requestSourceRevision(lead)!==question.sourceRevision||!KINDS.includes(question.purpose))return null;
  return `${c.business.name}: to choose one follow-up for this request, reply YES ${WORDS[question.purpose]} ${lead.id}. This YES alone does not add that permission. You can continue without texts. HELP for help; STOP to end texts.`;
}
export async function reserveRequestFollowup(c,job){
  if(!KINDS.includes(job.purpose))return true;
  if(!await inspectRequestFollowup(c,job)||!await mayDeliverRequestFollowup(c,job.to,job.purpose,job))return false;
  return atomicUpdate('request_followthrough',requestJournalKey(c,job.followup.requestId),async row=>{
    if(!row?.automaticFollowup||row.automaticFollowup.id!==job.followup.planId||row.automaticFollowup.cancelledAt)return {result:false};
    if(row.outreachUse)return {result:row.outreachUse.jobId===job.id};
    const current=await strictRead('clients',c.slug);if(!current||workspaceTenant(current)!==workspaceTenant(c)||!await inspectRequestFollowup(current,job)||!await mayDeliverRequestFollowup(current,job.to,job.purpose,job))return {result:false};
    return {value:{...row,outreachUse:{jobId:job.id,planId:job.followup.planId,purpose:job.purpose,reservedAt:stamp()}},result:true};
  });
}
export async function requestFollowupBlocker(c,job){
  if(!KINDS.includes(job.purpose))return null;
  let lead;try{lead=await currentLead(c,job.followup?.requestId);}catch{return {code:'request_changed',message:'The saved customer request changed.'};}
  const row=await strictRead('request_followthrough',requestJournalKey(c,lead.id)),plan=row?.automaticFollowup,permission=await savedPermission(c,lead,job.purpose),program=await programState(c,plan);
  if(row?.outreachUse&&row.outreachUse.jobId!==job.id)return {code:'followup_already_used',message:'This request’s one follow-up allowance has already been used.'};
  if(plan&&Date.parse(permission?.proof?.providerDate)>Date.parse(plan.dueAt))return {code:'followup_new_time_required',message:'Permission arrived after the chosen time. Choose a new future time before sending.'};
  if(plan&&Date.parse(permission?.proof?.expiresAt)<=Date.parse(plan.dueAt))return {code:'permission_expires_before_due',message:'Permission expires before the chosen time. Choose an earlier time or wait for fresh recipient-initiated permission.'};
  if(!program.ready)return {code:program.reason,message:program.message};
  return null;
}
function quoteRecorded(row,lead){return row?.quoteMilestone?.sourceRevision===requestSourceRevision(lead);}

function newOwnerContact(row,plan){return row.history?.slice(plan.historyIndex+1).some(entry=>['attempt','reached','complete'].includes(entry.type));}
function newCustomerReply(consent,plan){return Object.hasOwn(plan,'customerReplyBaseline')?!!consent?.lastServiceReplyMessageSid&&consent.lastServiceReplyMessageSid!==plan.customerReplyBaseline:Date.parse(consent?.lastServiceReplyAt)>Date.parse(plan.createdAt);}
