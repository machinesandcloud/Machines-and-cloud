// A handoff is one operation on the existing signed parent call. No outbound
// create, replacement call, SMS permission, or founder escalation is implied.
import { createHash } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead } from './accounts.mjs';
import { flagLead, openAlert, ackAlertsFor } from './desk.mjs';
import { workspaceTenant, belongsToWorkspace } from './workspace-identity.mjs';
const CALLS = 'managed_voice_calls';
const hash = value => createHash('sha256').update(value).digest('hex');
const iso = () => new Date().toISOString();
const phone = value => /^\+1[2-9]\d{9}$/.test(value || '');
const sid = value => /^CA[a-f0-9]{32}$/i.test(value || '');
const escape = value => String(value).replace(/[<>&"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[ch]));
const xml = value => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${value}</Response>`, {headers:{'Content-Type':'text/xml','Cache-Control':'no-store'}});
const rejected = () => Response.json({error:'call_mismatch'}, {status:403,headers:{'Cache-Control':'no-store'}});
export const REQUEST_HUMAN = { name:'request_human', description:'After the caller agrees, save one request for a person. connection=callback saves a callback only. connection=live_transfer may attempt a current owner-authorized screened live transfer. Never supply a destination. Returned statuses are authoritative; saved or accepted call control does not mean ringing, human acceptance, connection, dispatch, or a confirmed callback time.', input_schema:{type:'object',additionalProperties:false,properties:{connection:{type:'string',enum:['callback','live_transfer']},caller_agreed:{type:'boolean'},customer_name:{type:'string'},phone:{type:'string'},issue:{type:'string'},address:{type:'string'},wanted:{type:'string'},language:{type:'string',enum:['en','es']},urgency:{type:'string',enum:['routine','emergency']}},required:['connection','caller_agreed','customer_name','phone','issue']} };
const keyFor = (row, parent) => `${row.slug}/${parent}`;
const bound = (call,row) => call && call.operationId === row.id && call.generation === row.generation && call.number === row.number?.number;
const urlFor = (site,row,parent,kind,leg=0) => `${site}/api/managed-voice?o=${row.callbackToken}&kind=${kind}&p=${parent}&leg=${leg}`;
function destinations(c,row,call) {
  if (c.phone?.handoffEnabled !== true || row.authority?.acceptedAuthority !== true || row.authority.policyDigest!==row.policyDigest || row.authority.actor?.email?.trim().toLowerCase()!==c.owner?.email?.trim().toLowerCase()) return [];
  const blocked = [call.from,call.forwardedFrom,c.phone?.businessNumber,c.phone?.twilioNumber,row.number?.number];
  const primary = c.phone?.transferTo;
  if (!phone(primary) || blocked.includes(primary)) return [];
  return [primary,c.owner?.backupPhone].filter((value,index,array) => phone(value) && !blocked.includes(value) && array.indexOf(value) === index);
}
function speech(call) {
  const es = call.handoff?.language === 'es';
  return `<Say${es?' language="es-MX"':''}>${es?'No pudimos confirmar la conexión con una persona. Su solicitud está guardada para que el negocio la revise. No hay una hora de devolución de llamada confirmada. Si existe peligro inmediato, llame al 911.':'We could not confirm a connection with a person. Your request is saved for the shop to review. A callback time has not been confirmed. If there is immediate danger, call 911.'}</Say><Hangup/>`;
}
const details = value => Object.fromEntries(['customer_name','phone','issue','address','wanted','language','urgency'].map(key=>[key,typeof value[key]==='string'?value[key].trim():key==='language'?'en':'']));
function result(handoff,input) {
  const changed=!!input && (JSON.stringify(details(input))!==JSON.stringify(handoff.details) || input.connection!==handoff.connection);
  return {requestSaved:true,reference:handoff.leadId,savedDetails:handoff.details,changedDetailsSaved:changed?false:null,connection:handoff.connection,transferStatus:handoff.state,humanAccepted:!!handoff.acceptedAt,connectionConfirmed:handoff.state==='connected',callbackTimeConfirmed:false,message:changed?'This call already has a request with the saved details returned here. The changed details or connection choice were not saved. Do not claim a correction or a new transfer; ask the caller to contact the shop directly to change this request.':handoff.state==='callback_only'?'Callback request saved. No live transfer was attempted and no callback time is confirmed.':handoff.state==='control_accepted'?'The provider accepted call control. The call may move to the connection attempt. Ringing and human acceptance are not confirmed.':handoff.state==='connected'?'Provider reports the accepted destination was connected. This does not establish completed service.':'Request saved. A live connection is not confirmed. Do not start a replacement transfer or promise a callback time.'};
}
export async function requestManagedHuman({row,call,input,site,current,reserve,redirectCall}) {
  if (!input || Object.keys(input).some(key=>!Object.hasOwn(REQUEST_HUMAN.input_schema.properties,key)) || !['callback','live_transfer'].includes(input.connection) || input.caller_agreed !== true || !['en','es',undefined].includes(input.language) || !['routine','emergency',undefined].includes(input.urgency) || !['customer_name','phone','issue','address','wanted'].every(key=>input[key]===undefined || typeof input[key]==='string' && input[key].length<=1000) || !input.customer_name?.trim() || !input.issue?.trim() || !phone(input.phone)) throw new Error('Confirm the caller request and callback details first');
  const snapshot = await current(); if (!snapshot) throw new Error('Call changed');
  if (call.handoff) return result(call.handoff,input);
  const action = hash(`${row.tenantIdentity}:${call.twilioCallSid}:human`), key = keyFor(row,call.twilioCallSid);
  // The existing task owns source recovery before any lead/index write. Its
  // clock starts with the signed call, giving concurrent tools one queue key.
  const deadlineAt=new Date(Date.parse(call.createdAt)+(Number(snapshot.c.rules?.ackMinutes)||10)*60000).toISOString();
  const taskKey=`${deadlineAt}_${action.slice(0,32)}`;
  const attention=await atomicUpdate('tasks',taskKey,old=>{
    if (old) { if(old.slug!==row.slug || old.data?.tenantIdentity!==row.tenantIdentity || old.data.alertId!==action.slice(0,32) || !old.data.humanRequest) throw new Error('Handoff attention identity changed');return {result:old}; }
    const value={id:action.slice(0,32),slug:row.slug,type:'escalate',dueAt:deadlineAt,createdAt:iso(),data:{alertId:action.slice(0,32),tenantIdentity:row.tenantIdentity,humanRequest:{actionId:action,input:{...details(input),connection:input.connection,caller_agreed:true,reason:'wants_call'},contact:call.from,parentCallSid:call.twilioCallSid,operationId:row.id,deadlineAt}}};
    return {value,result:value};
  });
  const acceptedInput=attention.data.humanRequest.input;
  // Source record creation is idempotent even if the worker dies between saving
  // the lead, alert and call projection. New model tool IDs cannot create a call.
  const lead = await flagLead(snapshot.c,acceptedInput, {channel:'call',contact:call.from,managedActionId:action,managedHumanDeadlineAt:deadlineAt});
  await atomicUpdate('leads',`${row.slug}/${lead.id}`,old=>{
    if (!old || !belongsToWorkspace(snapshot.c,old) || old.managedActionId!==action) throw new Error('Handoff source changed');
    const binding={parentCallSid:call.twilioCallSid,operationId:row.id};
    if (old.managedVoiceCall && JSON.stringify(old.managedVoiceCall)!==JSON.stringify(binding)) throw new Error('Handoff source conflict');
    return old.managedVoiceCall?{}:{value:{...old,managedVoiceCall:binding}};
  });
  await openAlert(snapshot.c,lead,acceptedInput.urgency==='emergency'?'emergency':'wants_call');
  const routes = acceptedInput.connection==='live_transfer'?destinations(snapshot.c,row,call):[];
  const claimed = await atomicUpdate(CALLS,key,old=>{
    if (!bound(old,row) || old.endReportAt || old.vapiCallId!==call.vapiCallId) throw new Error('Call changed');
    if (old.handoff) return {result:{owned:false,handoff:old.handoff}};
    const admittedRoutes=old.fallbackAttempt?[]:routes;
    const handoff={version:1,id:action,leadId:lead.id,details:details(lead),connection:acceptedInput.connection,language:acceptedInput.language||'en',state:admittedRoutes.length?'control_uncertain':'callback_only',createdAt:iso(),expiresAt:new Date(Date.now()+2*(row.policy.maxDurationSeconds+30)*1000).toISOString(),destinations:admittedRoutes,legs:{},inputRevision:row.inputRevision,lifecycle:row.lifecycle};
    return {value:{...old,handoff},result:{owned:true,handoff}};
  });
  if (!claimed.owned || !claimed.handoff.destinations.length) return result(claimed.handoff,input);
  // Claim before the HTTP boundary. A timeout, process loss or unknown response
  // never gives a second tool ID permission to update or dial the call again.
  try {
    const latest=await current(); if (!latest || JSON.stringify(destinations(latest.c,row,call))!==JSON.stringify(routes)) throw new Error('Authority changed');
    await redirectCall({call,callbackUrl:urlFor(site,row,call.twilioCallSid,'handoff'),authorizeDispatch:async()=>!!await current()});
    await atomicUpdate(CALLS,key,old=>bound(old,row) && old.handoff?.id===action && old.handoff.state==='control_uncertain'?{value:{...old,handoff:{...old.handoff,state:'control_accepted',controlAcceptedAt:iso()}}}:{});
  } catch(error) { if (error.code==='handoff_not_dispatched') await atomicUpdate(CALLS,key,old=>bound(old,row) && old.handoff?.id===action && old.handoff.state==='control_uncertain'?{value:{...old,handoff:{...old.handoff,state:'not_attempted'}}}:{}); /* Signed downstream callbacks can reconcile a lost update response. */ }
  return result((await strictRead(CALLS,key)).handoff,input);
}

export async function handleManagedHumanCallback({row,params,url,site,current,reserve}) {
  const parent=url.searchParams.get('p'), leg=Number(url.searchParams.get('leg')), kind=url.searchParams.get('kind'), key=keyFor(row,parent);
  if (!sid(parent) || !['0','1'].includes(url.searchParams.get('leg'))) return rejected();
  let call=await strictRead(CALLS,key), h=call?.handoff;
  const receiptBound=value=>value && value.operationId===row.id && Number.isSafeInteger(value.generation) && value.generation>=1 && value.generation<=row.generation;
  if (!(kind==='handoff-status'?receiptBound(call):bound(call,row)) || !h || h.connection!=='live_transfer' || !h.destinations[leg]) return rejected();
  const child=['handoff-screen','handoff-accept'].includes(kind), destination=h.destinations[leg];
  if (child ? !sid(params.CallSid) || params.ParentCallSid && params.ParentCallSid!==parent || params.To!==destination || params.From!==row.number.number : params.CallSid!==parent || params.To!==call.number || params.From!==call.from) return rejected();
  const active=async()=>{
    const latest=await current(), saved=await strictRead(CALLS,key);
    return latest && bound(saved,row) && saved.handoff?.id===h.id && saved.handoff.state!=='not_attempted' && Date.parse(saved.handoff.expiresAt)>Date.now() && !['completed','failed','busy','no-answer','canceled'].includes(saved.twilioStatus) && JSON.stringify(destinations(latest.c,row,saved))===JSON.stringify(h.destinations)?{...latest,call:saved}:null;
  };
  const recover=()=>xml(speech(call));
  if (kind==='handoff-screen' || kind==='handoff-accept') {
    if (!h.legs[leg]?.emittedAt || !await active()) return xml('<Hangup/>');
    const childBound=await atomicUpdate(CALLS,key,old=>{
      const l=old?.handoff?.legs?.[leg];
      if (!bound(old,row) || !l || l.childSid && l.childSid!==params.CallSid || l.outcome) return {result:false};
      return {value:{...old,handoff:{...old.handoff,legs:{...old.handoff.legs,[leg]:{...l,childSid:params.CallSid,screenedAt:l.screenedAt||iso()}}}},result:true};
    });
    if (!childBound) return rejected();
    if (kind==='handoff-screen') {
      const state=await active(), lead=await strictRead('leads',`${row.slug}/${h.leadId}`);
      if (!state || !belongsToWorkspace(state.c,lead) || lead.managedActionId!==h.id) return xml('<Hangup/>');
      return xml(`<Gather input="dtmf" numDigits="1" timeout="8" actionOnEmptyResult="true" action="${escape(urlFor(site,row,parent,'handoff-accept',leg))}" method="POST"><Say>${escape(lead.customer_name.slice(0,80))} needs a person at ${escape(state.c.business.name)} about ${escape(lead.issue.slice(0,240))}. Callback ${escape(lead.phone)}. Press 1 to accept and speak with the caller. Any other key declines.</Say></Gather><Hangup/>`);
    }
    const accepted=params.Digits==='1';
    const saved=await atomicUpdate(CALLS,key,old=>{
      const l=old?.handoff?.legs?.[leg];
      if (!bound(old,row) || l?.childSid!==params.CallSid || l.outcome || l.decision && l.decision!==(accepted?'accepted':'declined')) return {result:false};
      const next={...l,decision:accepted?'accepted':'declined',decidedAt:l.decidedAt||iso()};
      return {value:{...old,handoff:{...old.handoff,...(accepted?{state:'human_accepted',acceptedAt:old.handoff.acceptedAt||iso()}:{}),legs:{...old.handoff.legs,[leg]:next}}},result:true};
    });
    if (!saved || !await active()) return xml('<Hangup/>');
    if (accepted) { const latest=await current(); if (!latest) return xml('<Hangup/>'); await ackAlertsFor(latest.c,h.leadId,'human_transfer_acceptance'); }
    return xml(accepted?'':'<Hangup/>');
  }
  if (kind==='handoff-status') {
    const l=h.legs[leg]; if (!l?.emittedAt || params.DialCallSid && !sid(params.DialCallSid) || l.childSid && l.childSid!==params.DialCallSid) return rejected();
    const saved=await atomicUpdate(CALLS,key,old=>{
      const prior=old?.handoff?.legs?.[leg]; if (!receiptBound(old) || !prior || prior.childSid && prior.childSid!==params.DialCallSid) return {result:null};
      if (prior.outcome) return {result:prior.outcome.childSid===(params.DialCallSid||null)?prior.outcome:null};
      const known=params.DialCallSid && ['completed','busy','no-answer','failed','canceled'].includes(params.DialCallStatus);
      const connected=known && params.DialCallStatus==='completed' && params.DialBridged==='true' && prior.decision==='accepted';
      const safeFailure=known && !old.handoff.acceptedAt && prior.decision!=='accepted' && (['busy','no-answer','failed','canceled'].includes(params.DialCallStatus) || prior.decision==='declined');
      const outcome={status:connected?'connected':safeFailure?'not_connected':'unknown',reportedStatus:params.DialCallStatus||null,childSid:params.DialCallSid||null,at:iso()};
      return {value:{...old,handoff:{...old.handoff,state:outcome.status,legs:{...old.handoff.legs,[leg]:{...prior,childSid:outcome.childSid,outcome}}}},result:outcome};
    });
    if (!saved) return rejected();
    if (saved.status==='connected') return xml('<Hangup/>');
    if (saved.status!=='not_connected' || leg!==0 || !h.destinations[1]) return recover();
    // Only a known unsuccessful first leg can emit the distinct backup leg.
    call=await strictRead(CALLS,key); h=call.handoff;
    return emit(1);
  }
  if (kind!=='handoff' || leg!==0) return rejected();
  return emit(0);

  async function emit(index) {
    const latest=await active(); if (!latest || latest.call.handoff.legs[index] || index>0 && latest.call.handoff.acceptedAt) return recover();
    const allowed=await reserve(row,parent,index===0?'handoff-primary':'handoff-backup');
    const expiresAt=new Date(Math.min(Date.parse(h.expiresAt),Date.now()+(row.policy.maxDurationSeconds+30)*1000)).toISOString();
    const claimed=await atomicUpdate(CALLS,key,old=>{
      if (!bound(old,row) || old.handoff?.id!==h.id || old.handoff.legs[index] || index>0 && old.handoff.acceptedAt) return {result:false};
      return {value:{...old,handoff:{...old.handoff,state:allowed?'dial_uncertain':'limit_reached',legs:{...old.handoff.legs,[index]:{destination:h.destinations[index],admitted:allowed,expiresAt,emittedAt:allowed?iso():null}}}},result:allowed};
    });
    if (!claimed) return recover();
    const final=await active(), remaining=Math.min(row.policy.maxDurationSeconds,Math.floor((Date.parse(expiresAt)-Date.now())/1000)-30);
    if (!final || remaining<1 || index>0 && final.call.handoff.acceptedAt) return recover();
    const es=h.language==='es';
    return xml(`<Say${es?' language="es-MX"':''}>${es?'Intentaremos conectarle con una persona. Si nadie acepta, su solicitud quedará guardada.':'We will try to connect you with a person. If nobody accepts, your request stays saved.'}</Say><Dial callerId="${escape(row.number.number)}" answerOnBridge="true" timeout="25" timeLimit="${remaining}" action="${escape(urlFor(site,row,parent,'handoff-status',index))}" method="POST"><Number url="${escape(urlFor(site,row,parent,'handoff-screen',index))}" method="POST">${escape(h.destinations[index])}</Number></Dial>`);
  }
}

// Owner reads resolve the exact retained call instead of maintaining another
// projection queue. Private call locators are stripped from the returned lead.
export async function managedHumanLeadView(c,lead) {
  const {managedVoiceCall:binding,...view}=lead;
  if (!binding || !belongsToWorkspace(c,lead) || !sid(binding.parentCallSid)) return view;
  const call=await strictRead(CALLS,`${c.slug}/${binding.parentCallSid}`), operationId=`${c.slug}/${hash('managed-voice-v1:'+workspaceTenant(c))}`;
  if (!call || call.operationId!==operationId || binding.operationId!==operationId || call.handoff?.leadId!==lead.id || call.handoff.id!==lead.managedActionId) return view;
  const h=call.handoff;
  return {...view,humanHandoff:{state:h.state,humanAcceptedAt:h.acceptedAt||null,connectionConfirmed:h.state==='connected',callbackTimeConfirmed:false,attempts:Object.entries(h.legs).map(([index,leg])=>({destination:index==='0'?'Transfer phone':'Backup phone',status:leg.outcome?.status || (leg.decision==='accepted'?'Human accepted; connection unconfirmed':leg.emittedAt?'Connection unconfirmed':'Usage limit reached')}))}};
}
