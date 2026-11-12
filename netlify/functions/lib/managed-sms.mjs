import { assertPaidServiceAuthority, PaidServiceAuthorityError } from './paid-service-authority.mjs';
import { createHmac, timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { strictRead } from "./accounts.mjs";
import { recordManagedInbound, managedSMSConsent, managedAppointmentConsentQuestion, deliveryTenant, REVIEW_KEYWORD, REVIEW_YES, managedReviewConsentQuestion } from "./managed-consent.mjs";
import { managedDeliveryEnabled, managedDeliveryProofScope, queueManagedMessage, recordManagedSMSReceipt, dispatchManagedDeliveryWave } from "./managed-delivery.mjs";
import { findMessagingClientByNumber, messagingInboundBinding, messagingSender, pendingMessagingProbe, recordMessagingProbe } from "./messaging-activation.mjs";
import { getAcquiredPhoneResource } from "./phone-activation.mjs";
import { reviewRequestsAvailable } from './messaging-program.mjs';
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY, agentFallbackLanguage } from "./config.mjs";
import { runAgent, MANAGED_TEXT_MODEL } from "./agent.mjs";
import { reserveAIRequest, selfServiceAIModelFetch } from "./self-service-ai.mjs";
import { savedPortalAcknowledgment } from "./self-service-ack.mjs";
import { dispatchManagedVoiceTool } from "./managed-actions.mjs";
import { reservePaidUsage, assertPaidUsage, attemptPaidUsage, settlePaidUsage, PaidUsageError } from './usage.mjs';
import { paidUsageDigest, paidAnswerExpected } from './managed-paid-usage.mjs';
import { houstonToday, normalizeBookingDate } from './availability.mjs';
import { CHANGE_VISIT, customerContext, customerContextPrompt, cancelKeywordNotice, isCancelWord } from './customer-visits.mjs';
const hash = value => createHash("sha256").update(value).digest("hex");
const stamp = () => new Date().toISOString();
export function serviceWorkerAuthorized(req) {
  const secret = process.env.SERVICE_WORKER_KEY || "", value = req.headers.get("x-service-worker-key") || "";
  return secret.length >= 32 && Buffer.byteLength(secret) === Buffer.byteLength(value) && timingSafeEqual(Buffer.from(secret), Buffer.from(value));
}
export async function dispatchServiceWorker(name, body) {
  const secret = process.env.SERVICE_WORKER_KEY || "";
  if (secret.length < 32 || !managedDeliveryEnabled()) return false;
  if (!["managed-sms-background", "service-activation-background"].includes(name)) throw new Error("Unknown worker");
  const site = new URL(process.env.URL); if (site.protocol !== "https:" || site.username || site.password) return false;
  const response = await fetch(new URL(`/.netlify/functions/${name}`,site),{method:"POST",headers:{"Content-Type":"application/json","x-service-worker-key":secret},body:JSON.stringify(body),signal:AbortSignal.timeout(3000),redirect:"error"});
  return response.ok;
}
function twiml(text = "") { const safe = String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${safe ? `<Message>${safe}</Message>` : ""}</Response>`,{headers:{"Content-Type":"text/xml","Cache-Control":"no-store"}}); }
async function verifiedFields(req) {
  if (req.method !== "POST" || !/application\/x-www-form-urlencoded/i.test(req.headers.get("content-type") || "")) return null;
  const raw = await req.text(); if (raw.length > 16000) return null;
  const values = new URLSearchParams(raw), fields = Object.fromEntries(values);
  if ([...values.keys()].some(key=>values.getAll(key).length!==1) || !process.env.TWILIO_AUTH_TOKEN || fields.AccountSid !== process.env.TWILIO_ACCOUNT_SID) return null;
  const actual = new URL(req.url), site = new URL(process.env.URL), signed = new URL(actual.pathname+actual.search,site).href;
  const payload = signed + Object.keys(fields).sort().map(key=>key+fields[key]).join("");
  const expected = createHmac("sha1",process.env.TWILIO_AUTH_TOKEN).update(payload).digest("base64"), signature = req.headers.get("x-twilio-signature") || "";
  return Buffer.byteLength(expected) === Buffer.byteLength(signature) && timingSafeEqual(Buffer.from(expected),Buffer.from(signature)) ? fields : null;
}
async function verifyMessage(fields, binding) {
  if (!/^SM[a-f0-9]{32}$/i.test(fields.MessageSid || "") || !/^\+1[2-9]\d{9}$/.test(fields.From || "") || !/^\+1[2-9]\d{9}$/.test(fields.To || "")) return null;
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${fields.MessageSid}.json`,{headers:{Authorization:"Basic "+Buffer.from(`${sid}:${token}`).toString("base64")},signal:AbortSignal.timeout(5000),redirect:"error"});
  const data = await response.json();
  const created=Date.parse(data.date_created);
  if (!response.ok || !binding || data.sid!==fields.MessageSid || data.account_sid!==sid || data.direction!=="inbound" || data.messaging_service_sid!==binding.serviceSid || fields.MessagingServiceSid && fields.MessagingServiceSid!==binding.serviceSid || data.from!==fields.From || data.to!==fields.To || data.to!==binding.number || data.body!==fields.Body || !Number.isFinite(created) || created<Date.parse(binding.since)-5000 || created<Date.now()-86400000 || created>Date.now()+300000) return null;
  return data;
}
export async function handleManagedSMS(req) {
  try {
    const fields = await verifiedFields(req); if (!fields) return new Response("Forbidden",{status:403});
    const url = new URL(req.url);
    if (url.pathname.endsWith("/status")) {
      if (!managedDeliveryEnabled()) return new Response(null,{status:204});
      await recordManagedSMSReceipt(url.searchParams.get("job") || "",fields); return new Response(null,{status:204});
    }
    const c = await findMessagingClientByNumber(fields.To); if (!c) return twiml();
    const binding = await messagingInboundBinding(c);
    const verified = await verifyMessage(fields,binding); if (!verified) return new Response("Unverified message",{status:403});
    const consent = await recordManagedInbound(c,{phone:fields.From,text:fields.Body,messageSid:fields.MessageSid,providerOptOutType:fields.OptOutType,providerDate:verified.date_created});
    // CANCEL/CANCELAR is a carrier opt-out keyword: the opt-out above stands and the
    // confirmation below stays the standard one. If this number has an upcoming visit, the
    // owner gets a note (once per visit state), including repeats and Twilio-handled opt-outs.
    if (consent.keyword === "stop" && isCancelWord(fields.Body)) { try { await cancelKeywordNotice(c, { phone: fields.From, word: fields.Body }); } catch {} }
    if (consent.duplicate && consent.keyword !== "message") return twiml();
    if (consent.keyword === "stop") return consent.alreadySuppressed || fields.OptOutType === "STOP" ? twiml() : twiml(`${c.business.name}: texts stopped. Reply START or EMPEZAR to remove the block.`);
    if (consent.keyword === "start") return fields.OptOutType === "START" ? twiml() : twiml(c.serviceFollowupProgram?.version==='requested_service_followups_v1'?`${String(c.business.name).trim().slice(0,100)}: your texting block is removed. Each text program needs its own new permission. Use the full instruction for your visit or request. HELP for help; STOP/ALTO/PARAR to end.`:`${c.business.name}: your texting block is removed. Appointment updates need a separate YES. Reply STOP or ALTO to stop.`);
    // AYUDA gets the Spanish reply (needs Spanish reviewer); HELP and INFO keep the English one. The
    // contact choice is unchanged here (PRA-HOMEOWNER-07 owns it).
    if (consent.keyword === "help") { if (consent.suppressed || fields.OptOutType === "HELP") return twiml(); const { str } = await import("./desk.mjs"); return twiml(str("managed_help", { language: /^\s*AYUDA\s*$/i.test(String(fields.Body || "")) ? "es" : "en" })(c, c.phone?.businessNumber || c.owner.email)); }
    if (consent.suppressed || !managedDeliveryEnabled()) return twiml();
    const probe = await pendingMessagingProbe(c);
    const kind = probe && probe.to===fields.From && String(fields.Body).trim()===probe.nonce ? "probe" : "conversation";
    if (kind !== "probe" && (!["testing","live"].includes(c.status) || !await messagingSender(c))) return twiml();
    const key = `${c.slug}/${deliveryTenant(c)}/${fields.MessageSid}`;
    await atomicUpdate("managed_sms_inbound",key,row=>row ? {} : {value:{id:key,slug:c.slug,tenant:deliveryTenant(c),kind,from:fields.From,messageSid:fields.MessageSid,body:String(fields.Body).slice(0,1500),providerDate:verified.date_created,state:"queued",attempts:0,createdAt:stamp(),updatedAt:stamp()}});
    try { await dispatchServiceWorker("managed-sms-background",{id:key}); } catch { /* Durable scheduled dispatch is the fallback. */ }
    return twiml();
  } catch { return new Response("Message handling unavailable",{status:503}); }
}
async function updateInbound(id, updater) { return atomicUpdate("managed_sms_inbound",id,row=>{const next=updater(row);return next?{value:{...next,updatedAt:stamp()},result:next}:{result:row};}); }
async function releaseUnusedAnswer(c, job) {
  if (!job.paidAnswerCapacity || job.paidAnswerGenerated) return job;
  const negative=job.paidAnswerNoDispatch;
  if(job.paidAnswerWireStarted&&!negative)return job;
  const expected = paidAnswerExpected(job), attemptId = negative?.attemptId || paidUsageDigest({kind:'answer_not_started',id:job.id,generation:job.paidAnswerCapacity.generation});
  const fact = {outcome:'not_dispatched',quantity:0,attemptId,proofId:negative?.proofId || paidUsageDigest({kind:'answer_not_started',id:job.id,generation:job.paidAnswerCapacity.generation})};
  let result;
  try { result=await settlePaidUsage(c,job.paidAnswerCapacity,fact,expected); }
  catch(error) {
    if (!(error instanceof PaidUsageError) || error.code!=='paid_capacity_proof_conflict') throw error;
    await attemptPaidUsage(c,job.paidAnswerCapacity,{attemptId},expected);
    result=await settlePaidUsage(c,job.paidAnswerCapacity,fact,expected);
  }
  if(result?.receiptState!=='released')return job;
  return updateInbound(job.id,row=>!row.paidAnswerWireStarted&&!row.paidAnswerGenerated&&paidUsageDigest(row.paidAnswerCapacity)===paidUsageDigest(job.paidAnswerCapacity)?{...row,paidAnswerCapacity:null,paidAnswerNoDispatch:false}:null);
}
const capacityWaiting = reason => typeof reason==='string' && reason.startsWith('paid_capacity_');
async function appendHistoryOnce(key,job,reply) {
  return atomicUpdate("managed_sms_history",key,row=>{
    if(row?.seen?.[job.messageSid])return {};
    if(row && row.tenant!==job.tenant)throw new Error("Conversation identity mismatch");
    const messages=(row?.messages || []).concat([{role:"user",content:job.body},{role:"assistant",content:reply}]).slice(-20);
    return {value:{tenant:job.tenant,messages,seen:{...row?.seen,[job.messageSid]:stamp()},updatedAt:stamp()}};
  });
}
export async function processManagedSMS(id) {
  if (!managedDeliveryEnabled() || typeof id!=="string" || id.length>220) return {ok:false,reasonCode:"sms_unavailable"};
  if (await managedDeliveryProofScope()) return {ok:true,skipped:true,reasonCode:'delivery_proof_scope'};
  let job = await strictRead("managed_sms_inbound",id); if (!job || ["completed","suppressed","failed"].includes(job.state)) return {ok:true,skipped:true};
  const c = await strictRead("clients",job.slug);
  if (!c || deliveryTenant(c)!==job.tenant) return {ok:false,reasonCode:"workspace_changed"};
  if (job.kind==="probe") {
    const probe=await pendingMessagingProbe(c); if (!probe || probe.nonce!==job.body || probe.to!==job.from) return {ok:false,reasonCode:"probe_changed"};
    const rows=await Promise.all((await list("managed_deliveries",`${c.slug}/`)).map(key=>strictRead("managed_deliveries",key)));
    const outbound=rows.find(row=>row.tenant===job.tenant && row.purpose==="activation_probe" && row.probe?.operationId===probe.operationId && row.probe.nonce===probe.nonce && row.providerId);
    if (!outbound) return {ok:false,reasonCode:"probe_receipt_pending"};
    await recordMessagingProbe(c,{operationId:probe.operationId,outboundMessageSid:outbound.providerId,inboundMessageSid:job.messageSid});
    await updateInbound(id,row=>({...row,state:"completed",completedAt:stamp()})); return {ok:true,probe:true};
  }
  const consent=await managedSMSConsent(c,job.from);
  if (!["testing","live"].includes(c.status) || consent?.suppressed || !await messagingSender(c)) { await updateInbound(id,row=>({...row,state:"suppressed",reasonCode:"channel_unavailable"})); return {ok:true,suppressed:true}; }
  try{await assertPaidServiceAuthority(c,'sms');}catch(error){if(!(error instanceof PaidServiceAuthorityError))throw error;await updateInbound(id,row=>({...row,state:'queued',reasonCode:error.code}));return {ok:true,waiting:true,reasonCode:error.code};}
  const incoming=(await Promise.all((await list("managed_sms_inbound",`${c.slug}/${job.tenant}/`)).map(key=>strictRead("managed_sms_inbound",key)))).filter(row=>row?.from===job.from && row.kind==="conversation" && ["queued","running"].includes(row.state)).sort((a,b)=>Date.parse(a.providerDate)-Date.parse(b.providerDate)||a.id.localeCompare(b.id));
  if(incoming[0]?.id!==id)return {ok:true,busy:true};
  const lockKey=`${c.slug}/${job.tenant}/${job.from}`, token=randomBytes(16).toString("hex");
  const locked=await atomicUpdate("managed_sms_locks",lockKey,row=>row && Date.parse(row.until)>Date.now()?{result:false}:{value:{token,until:new Date(Date.now()+180000).toISOString()},result:true});
  if (!locked) return {ok:true,busy:true};
  let paidModelBlock = null;
  try {
    job=await updateInbound(id,row=>row.claim && Date.parse(row.claim.until)>Date.now()?null:({...row,state:"running",reasonCode:null,attempts:row.attempts+1,claim:{token,until:new Date(Date.now()+180000).toISOString()}}));
    if (job.claim?.token!==token) return {ok:true,busy:true};
    if (job.attempts>3) { await updateInbound(id,row=>({...row,state:"failed",reasonCode:"retry_limit",claim:null})); return {ok:false,reasonCode:"retry_limit"}; }
    if(job.paidAnswerNoDispatch)job=await releaseUnusedAnswer(c,job);
    const freshAuthority=async()=>{
      const [current,lock,record,permission]=await Promise.all([strictRead("clients",c.slug),strictRead("managed_sms_locks",lockKey),strictRead("managed_sms_inbound",id),managedSMSConsent(c,job.from)]);
      return managedDeliveryEnabled() && ["testing","live"].includes(current?.status) && deliveryTenant(current)===job.tenant && lock?.token===token && Date.parse(lock.until)>Date.now() && record?.claim?.token===token && !permission?.suppressed && !!await messagingSender(current);
    };
    const historyKey=`${c.slug}/${job.tenant}/${job.from}`, history=await strictRead("managed_sms_history",historyKey);
    const messages=(history?.messages || []).slice(-12).concat([{role:"user",content:job.body}]);
    // These recipient-initiated controls are deterministic and do not spend AI
    // allowance. A website/call invitation starts this exchange; only the later
    // provider-verified YES after the sent question grants its stated permission.
    if(!job.reply&&/^(?:YES\s+)?(?:QUOTE|REQUEST)\b/i.test(job.body.trim())){const {requestFollowupInbound}=await import('./request-followup.mjs'),choice=await requestFollowupInbound(c,job);if(choice){job=await updateInbound(id,row=>row.claim?.token===token&&!row.reply?{...row,reply:choice.reply,replyPurpose:choice.purpose,replyFollowup:choice.followup||null}:null);}}
    if(!job.reply&&/^(YES|SI|SÍ)$/i.test(job.body.trim())){const {requestFollowupAffirmativeInstruction}=await import('./request-followup.mjs'),reply=await requestFollowupAffirmativeInstruction(c,job);if(reply)job=await updateInbound(id,row=>row.claim?.token===token&&!row.reply?{...row,reply,replyPurpose:'reply'}:null);}
    // Review-request permission is answered deterministically only when the owner offers it.
    if(!job.reply&&(REVIEW_KEYWORD.test(job.body.trim())||REVIEW_YES.test(job.body.trim()))&&c.postVisit?.reviewRequest===true&&reviewRequestsAvailable()){
      const text=job.body.trim(),es=/RESE/i.test(text),name=c.business.name,latest=await managedSMSConsent(c,job.from);
      const reply=REVIEW_KEYWORD.test(text)?managedReviewConsentQuestion(c,es?'es':'en'):latest?.reviewProof?.messageSid===job.messageSid
        ?(es?`${name}: listo. Le escribiremos una vez después de cada visita terminada para pedirle una reseña. Pueden aplicarse tarifas de mensajes y datos. HELP para ayuda; STOP/ALTO/PARAR para terminar.`:`${name}: you're set. We'll text once after each completed visit to ask for a review. Message and data rates may apply. HELP for help; STOP/ALTO/PARAR to end.`)
        :(es?`${name}: los mensajes de reseña no están activados. Envíe RESEÑAS para recibir la pregunta y luego responda SÍ RESEÑAS. HELP para ayuda; STOP/ALTO/PARAR para terminar.`:`${name}: review texts are not set up. Text REVIEWS for the question, then reply YES REVIEWS. HELP for help; STOP/ALTO/PARAR to end.`);
      if (!await freshAuthority()) return {ok:true,suppressed:true};
      job=await updateInbound(id,row=>row.claim?.token===token&&!row.reply?{...row,reply,replyPurpose:'reply'}:null);
    }
    if (!job.reply && /^(APPOINTMENTS|CITAS|YES|SI|SÍ)$/i.test(job.body.trim())) {
      const asking = /^(APPOINTMENTS|CITAS)$/i.test(job.body.trim()) && !consent.transactional;
      const spanish = /^(CITAS|SI|SÍ)$/i.test(job.body.trim()) || consent.proof?.wording === managedAppointmentConsentQuestion(c, 'es');
      const reply = asking ? managedAppointmentConsentQuestion(c, spanish ? 'es' : 'en') : consent.transactional
        ? spanish ? `${c.business.name}: activó los mensajes de citas para este número, incluidas visitas futuras. HELP para ayuda; STOP/ALTO/PARAR para terminar. Pueden aplicarse tarifas de mensajes y datos.` : `${c.business.name}: appointment texts are enabled for this number, including future visits. HELP for help; STOP/ALTO/PARAR to end. Message and data rates may apply.`
        : spanish ? `${c.business.name}: los mensajes de citas no están activados. Envíe CITAS para recibir la pregunta y responda SÍ para aceptar. Puede reservar sin mensajes. HELP para ayuda; STOP/ALTO/PARAR para terminar.` : `${c.business.name}: appointment texts are not enabled. Text APPOINTMENTS or CITAS for the question, then reply YES or SÍ to agree. Booking is available without texts. HELP for help; STOP/ALTO/PARAR to end.`;
      if (!await freshAuthority()) return {ok:true,suppressed:true};
      job=await updateInbound(id,row=>row.claim?.token===token&&!row.reply?{...row,reply,replyPurpose:asking?'consent_ask':'reply'}:null);
    }
    if (job.reply) {
      if (!await freshAuthority()) return {ok:true,suppressed:true};
      await queueManagedMessage(c,{eventId:`sms_reply:${job.messageSid}`,channel:"sms",purpose:job.replyPurpose,to:job.from,body:job.reply,consentAsk:job.replyPurpose==="consent_ask",followup:job.replyFollowup||null});
      await appendHistoryOnce(historyKey,job,job.reply);
      try { await dispatchManagedDeliveryWave(); } catch { /* Scheduled recovery retains this reply. */ }
      await updateInbound(id,row=>row.claim?.token===token?{...row,state:"completed",claim:null,completedAt:stamp()}:null);
      return {ok:true,recovered:true};
    }
    // One logical answer spans every bounded model/tool turn and worker retry.
    // Its unit is consumed only by the verified delivery of that saved answer.
    if (job.paidAnswerCapacity) {
      try { await assertPaidUsage(c,job.paidAnswerCapacity,paidAnswerExpected(job)); }
      catch(error) {
        if (!(error instanceof PaidUsageError) || error.code!=='paid_capacity_period_changed') throw error;
        if(job.paidAnswerWireStarted) {
          await updateInbound(id,row=>row.claim?.token===token?{...row,state:'failed',claim:null,reasonCode:'paid_capacity_previous_answer_unconfirmed'}:null);
          return {ok:false,reasonCode:'paid_capacity_previous_answer_unconfirmed'};
        }
        job=await releaseUnusedAnswer(c,job);
      }
    }
    const capacity=await reservePaidUsage(c,paidAnswerExpected(job));
    if(capacity) {
      job=await updateInbound(id,row=>row.claim?.token===token&&!row.reply?{...row,paidAnswerCapacity:capacity}:null);
      if(job.claim?.token!==token)return {ok:true,busy:true};
    }
    const allowance=await reserveAIRequest(c,"web",{service:"sms"}); if (!allowance.allowed) {
      job=await releaseUnusedAnswer(c,job);
      const reply=`${c.business.name}: I cannot complete this reply right now. Please contact ${c.phone?.businessNumber || c.owner.email}. The shop can review your message in its workspace.`;
      if(!await freshAuthority())return {ok:true,suppressed:true};
      await updateInbound(id,row=>row.claim?.token===token?{...row,reply,replyPurpose:"reply",reasonCode:"ai_daily_limit"}:null);
      await queueManagedMessage(c,{eventId:`sms_reply:${job.messageSid}`,channel:"sms",purpose:"reply",to:job.from,body:reply});
      await appendHistoryOnce(historyKey,job,reply);
      await updateInbound(id,row=>row.claim?.token===token?{...row,state:"completed",claim:null,completedAt:stamp()}:null);
      try{await dispatchManagedDeliveryWave();}catch{/* Scheduled recovery retains this reply. */}
      return {ok:true,limited:true};
    }
    let mutationIndex=0, booked=false, physicalAttempt=0;
    let modelWireInvoked=false;
    const baseFetch=await selfServiceAIModelFetch(c,allowance.proof,{service:'sms',...(capacity?{onDispatch:()=>{modelWireInvoked=true;}}:{})}), deadline=Date.now()+75000;
    const modelFetch=capacity?async(input,init={})=>{
      const priorWireStarted=!!job.paidAnswerWireStarted;
      let auditAttempt=null;modelWireInvoked=false;
      try {
        if(Date.now()>=deadline || !await freshAuthority())throw new PaidUsageError('paid_capacity_authority_changed');
        await assertPaidUsage(c,job.paidAnswerCapacity,paidAnswerExpected(job));
        auditAttempt=paidUsageDigest({kind:'answer_model',id,workerAttempt:job.attempts,physicalAttempt:++physicalAttempt});
        await attemptPaidUsage(c,job.paidAnswerCapacity,{attemptId:auditAttempt},paidAnswerExpected(job));
        job=await updateInbound(id,row=>row.claim?.token===token&&!row.reply?{...row,paidAnswerWireStarted:true}:null);
        if(job.claim?.token!==token || !await freshAuthority())throw new PaidUsageError('paid_capacity_authority_changed');
        await assertPaidUsage(c,job.paidAnswerCapacity,paidAnswerExpected(job));
        const signal=AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(Math.max(1,Math.min(25000,deadline-Date.now())))]);
        return await baseFetch(input,{...init,signal,redirect:'error'});
      } catch(error) {
        if(error instanceof PaidUsageError || error instanceof PaidServiceAuthorityError)paidModelBlock=error;
        if(!modelWireInvoked&&auditAttempt) {
          const proofId=paidUsageDigest({kind:'answer_model_not_dispatched',id,generation:job.paidAnswerCapacity.generation,attemptId:auditAttempt});
          job=await updateInbound(id,row=>row.claim?.token===token&&!row.reply?{...row,paidAnswerWireStarted:priorWireStarted,paidAnswerNoDispatch:{attemptId:auditAttempt,proofId}}:null);
        }
        throw error;
      }
    }:baseFetch;
    const received=Date.parse(job.providerDate), receivedDay=capacity&&Number.isFinite(received)?houstonToday(new Date(received)):null;
    const receivedContext=receivedDay?`\nThe current customer message was received on ${receivedDay} in Houston. Interpret this message's relative days (today, tomorrow or a weekday) from that received date. Use absolute YYYY-MM-DD dates in tools. Availability is checked at processing time; do not move an old request to a different day or promise a past window. If its requested timing has passed, ask for a new preference.`:'';
    let savedActionCount=0,savedCheckReply=null,terminalCheckReply=null,savedBookingLanguage=null;
    // Read-only visit context for the provider-verified sender number only.
    const visitContext=await customerContext(c,job.from,{channel:"sms"});
    const out=await runAgent({system:buildSystemPrompt(c,"sms")+"\nThis customer is using your verified texting channel. Save real visits and requests with tools. Only the final reply is queued for delivery; never claim a separate notification was delivered. Do not infer recurring texting consent. No promotional outreach."+customerContextPrompt(visitContext,"sms")+receivedContext,tools:visitContext.visits.length?[GET_AVAILABILITY,BOOK_VISIT,NOTIFY_OWNER,CHANGE_VISIT]:[GET_AVAILABILITY,BOOK_VISIT,NOTIFY_OWNER],messages,dropToolPreamble:true,fallbackLanguage:agentFallbackLanguage(c),logSlug:c.slug,maxTokens:capacity?800:1200,maxRetries:0,requireComplete:true,modelFetch,...(capacity?{model:MANAGED_TEXT_MODEL}:{}),stopAfterTools:async({toolUses,results})=>{
      if(savedActionCount!==1||!savedCheckReply||toolUses.length!==1||toolUses[0].name!=='notify_owner'||toolUses[0].input.reason!=='status_check'||results.some(result=>result.is_error))return false;
      if(!await freshAuthority())throw new Error("Channel authority changed");
      if(capacity)await assertPaidUsage(c,job.paidAnswerCapacity,paidAnswerExpected(job));
      await selfServiceAIModelFetch(c,allowance.proof,{service:"sms"});
      terminalCheckReply=savedCheckReply;return true;
    },execTool:async(name,input)=>{
      if (!await freshAuthority()) throw new Error("Channel authority changed");
      if(capacity)await assertPaidUsage(c,job.paidAnswerCapacity,paidAnswerExpected(job));
      if(receivedDay&&['get_availability','book_visit','change_visit'].includes(name)&&typeof input?.date==='string'&&input.date)input={...input,date:normalizeBookingDate(input.date,receivedDay)||input.date};
      const toolCallId=name==="get_availability"?"availability":`mutation_${mutationIndex++}`, savedBefore=savedActionCount;
      let availabilityError=false;
      const content=await dispatchManagedVoiceTool({client:c,callId:job.messageSid,toolCallId,name,input,caller:job.from,channel:"sms",onAvailabilityResult:result=>{availabilityError=result.is_error===true;},onSavedRecord:(action,record)=>{
        savedActionCount++;
        if(action==='book_visit'&&['en','es'].includes(record.language))savedBookingLanguage=record.language;
        if(action==='notify_owner'&&input.reason==='status_check'&&record.reason===input.reason)savedCheckReply=savedPortalAcknowledgment(action,record);
      }});
      if (name==="book_visit" && content.startsWith("Visit saved")) booked=true;
      return {content,...(availabilityError?{is_error:true}:{}),...(savedActionCount>savedBefore?{event:{type:"saved",...(name==="notify_owner"&&input?.reason==="spam"?{reason:"spam"}:{})}}:{})};
    }});
    if (!await freshAuthority()) { await updateInbound(id,row=>({...row,state:"suppressed",claim:null,reasonCode:"authority_changed"})); return {ok:true,suppressed:true}; }
    const ask=booked && !consent.transactional && !consent.pendingAsk, reply=String(terminalCheckReply || out.reply || "Please contact the shop directly for help with your request.").slice(0,1200)+(ask?"\n"+managedAppointmentConsentQuestion(c,savedBookingLanguage||'en'):"");
    const planned=await updateInbound(id,row=>row.claim?.token===token&&!row.reply?{...row,reply,replyPurpose:ask?"consent_ask":"reply",...(capacity?{paidAnswerGenerated:true}:{} )}:null);
    if (planned.claim?.token!==token || !planned.reply) return {ok:true,busy:true};
    await queueManagedMessage(c,{eventId:`sms_reply:${job.messageSid}`,channel:"sms",purpose:planned.replyPurpose,to:job.from,body:planned.reply,consentAsk:planned.replyPurpose==="consent_ask"});
    try { await dispatchManagedDeliveryWave(); } catch { /* Scheduled recovery retains this reply. */ }
    await appendHistoryOnce(historyKey,job,planned.reply);
    await updateInbound(id,row=>row.claim?.token===token?{...row,state:"completed",claim:null,completedAt:stamp()}:null);
    return {ok:true};
  } catch(error) {
    const block=paidModelBlock || error, paidHold=block instanceof PaidServiceAuthorityError || block instanceof PaidUsageError;
    if(paidHold && job.paidAnswerCapacity && !job.paidAnswerWireStarted)job=await releaseUnusedAnswer(c,job);
    await updateInbound(id,row=>row.claim?.token===token?{...row,state:paidHold?'queued':row.attempts>=3?'failed':'queued',attempts:paidHold?Math.max(0,row.attempts-1):row.attempts,claim:null,reasonCode:paidHold?block.code:'processing_failed'}:null);
    return {ok:paidHold,...(paidHold?{waiting:true}:{}),reasonCode:paidHold?block.code:'processing_failed'};
  }
  finally {
    await atomicUpdate("managed_sms_locks",lockKey,row=>row?.token===token?{value:{...row,until:stamp(),token:null}}:{});
    const pending=(await Promise.all((await list("managed_sms_inbound",`${c.slug}/${job.tenant}/`)).map(key=>strictRead("managed_sms_inbound",key)))).filter(row=>row?.from===job.from&&row.kind==="conversation"&&row.state==="queued"&&row.reasonCode!=="paid_service_unconfirmed"&&!capacityWaiting(row.reasonCode)).sort((a,b)=>Date.parse(a.providerDate)-Date.parse(b.providerDate)||a.id.localeCompare(b.id));
    if(pending[0])try{await dispatchServiceWorker("managed-sms-background",{id:pending[0].id});}catch{/* Scheduled dispatch retries this durable message. */}
  }
}
export async function dispatchPendingManagedSMS({limit=2}={}) {
  if (!managedDeliveryEnabled()) return {ok:true,dispatched:0};
  if (await managedDeliveryProofScope()) return {ok:true,dispatched:0,reasonCode:'delivery_proof_scope'};
  const keys=await list("managed_sms_inbound",""), cursor=await strictRead("managed_sms_scan","dispatch"), page=[...keys.filter(key=>key>(cursor?.key||"")),...keys.filter(key=>key<=(cursor?.key||""))].slice(0,Math.min(25,limit));
  let dispatched=0;
  for (const id of page) { const row=await strictRead("managed_sms_inbound",id); if (row && (row.state==="queued" || row.state==="running" && Date.parse(row.claim?.until)<=Date.now())) if (await dispatchServiceWorker("managed-sms-background",{id})) dispatched++; }
  if (page.length) await atomicUpdate("managed_sms_scan","dispatch",()=>({value:{key:page.at(-1)}}));
  return {ok:true,dispatched};
}
