import { atomicUpdate } from "./store.mjs";
import { strictRead } from "./accounts.mjs";
import { workspaceTenant } from './workspace-identity.mjs';
import { classifySMSKeyword } from './sms-keywords.mjs';
import { reviewRequestsAvailable } from './messaging-program.mjs';
export const deliveryTenant = workspaceTenant;
const key = (c, phone) => `${c.slug}/${deliveryTenant(c)}/${phone}`;
const validPhone = phone => typeof phone === "string" && /^\+1[2-9]\d{9}$/.test(phone);
export const MANAGED_APPOINTMENT_CONSENT_VERSION = "ongoing_appointments_v2";
export function managedAppointmentConsentQuestion(c, language = 'en') {
  if (language === 'es') return `${c.business.name}: ¿quiere confirmaciones, recordatorios y cancelaciones de citas por mensaje, incluidas visitas futuras? Responda SÍ para aceptar. Frecuencia variable. Pueden aplicarse tarifas de mensajes y datos. HELP para ayuda; STOP/ALTO/PARAR para terminar. Puede reservar sin mensajes.`;
  return `${c.business.name}: want ongoing appointment confirmations, reminders and cancellation texts from us, including future visits? Reply YES to agree. Frequency varies. Message and data rates may apply. HELP for help; STOP/ALTO/PARAR to end. Booking is available without texts.`;
}
// Review requests are a separate, recipient-initiated program: the customer texts REVIEWS or
// RESEÑAS, receives the disclosed question, and agrees with YES REVIEWS or SÍ RESEÑAS within 24 hours.
// Appointment consent never implies it, START never restores it, STOP ends it.
export const REVIEW_CONSENT_VERSION = "post_visit_review_v1";
export const REVIEW_KEYWORD = /^(REVIEWS?|RESE[ÑN]AS?)$/i, REVIEW_YES = /^(?:YES|S[IÍ])\s+(REVIEWS?|RESE[ÑN]AS?)$/i;
export function managedReviewConsentQuestion(c, language = 'en') {
  if (language === 'es') return `${c.business.name}: ¿quiere un mensaje automatizado después de cada visita terminada con nosotros pidiendo una reseña? Un mensaje por visita. Responda SÍ RESEÑAS para aceptar. Aceptar no es condición de ninguna compra ni servicio. Pueden aplicarse tarifas de mensajes y datos. HELP para ayuda; STOP/ALTO/PARAR para terminar.`;
  return `${c.business.name}: want one automated text after each completed visit with us asking for a review? One text per visit. Reply YES REVIEWS to agree. Agreeing is not a condition of any purchase or service. Message and data rates may apply. HELP for help; STOP/ALTO/PARAR to end.`;
}
const currentReviewProof = row => !row?.suppressed && row?.reviewProof?.wordingVersion === REVIEW_CONSENT_VERSION && Date.parse(row.reviewProof.providerDate) > (Number(row.directiveDate) || 0);
const currentProof = row => row?.transactional === true && row.proof?.purpose === "ongoing_appointment_updates" && row.proof?.wordingVersion === MANAGED_APPOINTMENT_CONSENT_VERSION;
const currentAsk = ask => ask?.wordingVersion === MANAGED_APPOINTMENT_CONSENT_VERSION;
export async function managedSMSConsent(c, phone) {
  if (!validPhone(phone)) return null;
  const row = await strictRead("managed_sms_consent", key(c, phone));
  return row ? { ...row, transactional: currentProof(row), pendingAsk: currentAsk(row.pendingAsk) ? row.pendingAsk : null } : null;
}
// Called only after a signature, account, sender and message-SID check. STOP wins before AI.
// START removes suppression; it never silently grants recurring appointment/marketing consent.
export async function recordManagedInbound(c, { phone, text, messageSid, providerOptOutType, providerDate }) {
  if (!validPhone(phone) || !/^SM[a-f0-9]{32}$/i.test(messageSid || "")) throw new Error("Invalid signed message");
  const word = String(text || "").trim(), now = new Date().toISOString();
  return atomicUpdate("managed_sms_consent", key(c, phone), previous => {
    const row = previous || { tenant: deliveryTenant(c), phone, suppressed: false, transactional: false };
    if (row.tenant !== deliveryTenant(c)) throw new Error("Consent identity mismatch");
    if (row.seen?.[messageSid]) return { result: { ...row, keyword: row.seen[messageSid].keyword, duplicate: true } };
    if (Object.keys(row.seen || {}).length >= 4096) throw new Error("Consent history needs archival before accepting more messages");
    // Same normalized vocabulary as the platform line (CTIA 5.1.3); YES/SÍ consent stays exact below.
    const matched = classifySMSKeyword(word);
    const keyword = matched === "stop" || providerOptOutType === "STOP" ? "stop" : matched === "start" || providerOptOutType === "START" ? "start" : matched === "help" || providerOptOutType === "HELP" ? "help" : "message";
    const next = { ...row, transactional: currentProof(row), pendingAsk: currentAsk(row.pendingAsk) ? row.pendingAsk : null, seen: { ...row.seen, [messageSid]: { keyword, at: now } }, lastMessageSid: messageSid, lastInboundAt: now, lastKeyword: keyword, updatedAt: now };
    const serviceControl=/^(?:APPOINTMENTS|CITAS|YES|SI|SÍ)$/i.test(word)||REVIEW_KEYWORD.test(word)||REVIEW_YES.test(word)||/^(?:YES\s+)?(?:QUOTE|REQUEST)\s+[a-zA-Z0-9_-]{1,80}$/i.test(word);
    if(keyword==="message"&&!serviceControl){next.lastServiceReplyAt=now;next.lastServiceReplyMessageSid=messageSid;}
    next.lastAffirmation=!next.suppressed && /^(yes|si|sí)$/i.test(word)?{messageSid,providerDate,at:now}:null;
    if (keyword === "stop") { next.reviewProof = null; next.reviewAsk = null; next.suppressed = true; next.transactional = false; next.pendingAsk = null; next.lastAffirmation=null; next.stoppedAt = now; next.directiveDate = Math.max(Number(row.directiveDate) || 0, Date.parse(providerDate) || Date.now()); }
    if (keyword === "start" && Number.isFinite(Date.parse(providerDate)) && Date.parse(providerDate) > (Number(row.directiveDate) || 0)) { next.suppressed = false; next.startedAt = now; next.directiveDate = Date.parse(providerDate); }
    if (!next.suppressed && /^(yes|si|sí)$/i.test(word) && next.pendingAsk && Date.parse(next.pendingAsk.expiresAt) > Date.now() && Date.parse(providerDate) > Date.parse(next.pendingAsk.askedAt)) {
      next.transactional = true; next.proof = { messageSid, wording: next.pendingAsk.wording, wordingVersion: MANAGED_APPOINTMENT_CONSENT_VERSION, at: now, purpose: "ongoing_appointment_updates", askMessageSid: next.pendingAsk.messageSid, source: 'verified_inbound_sms', recipient: phone, providerDate, senderNumber: next.pendingAsk.senderNumber || null, messagingServiceSid: next.pendingAsk.messagingServiceSid || null }; next.pendingAsk = null;
    }
    if(keyword==="message" && !/^(yes|si|sí)$/i.test(word)){next.pendingAsk=null;next.lastNonAffirmationDate=providerDate;}
    // The question is only sent where the owner offers review requests; elsewhere the keyword is ordinary text.
    // REVIEWS itself grants nothing: the ask is saved only from the provider receipt of the sent question (saveManagedReviewAsk).
    if(keyword==="message" && REVIEW_KEYWORD.test(word)){}
    else if(keyword==="message" && !next.suppressed && REVIEW_YES.test(word) && next.reviewAsk?.wordingVersion===REVIEW_CONSENT_VERSION && Date.parse(providerDate)>Date.parse(next.reviewAsk.providerDate) && Date.parse(providerDate)<=Date.parse(next.reviewAsk.providerDate)+86400000 && Date.parse(providerDate)>(Number(next.directiveDate)||0)){next.reviewProof={messageSid,providerDate,at:now,wording:next.reviewAsk.wording,wordingVersion:REVIEW_CONSENT_VERSION,askMessageSid:next.reviewAsk.messageSid,recipient:phone,source:'verified_inbound_sms',purpose:'post_visit_review_requests'};next.reviewAsk=null;}
    else if(keyword==="message" && !REVIEW_YES.test(word))next.reviewAsk=null;
    return { value: next, result: { ...next, keyword, alreadySuppressed: row.suppressed === true } };
  });
}
export async function saveManagedConsentAsk(c, phone, { wording, messageSid, sentAt, senderNumber = null, messagingServiceSid = null }) {
  if (!validPhone(phone) || typeof wording !== "string" || !/^SM[a-f0-9]{32}$/i.test(messageSid || "")) throw new Error("Consent ask needs a provider receipt");
  const questions = [managedAppointmentConsentQuestion(c), managedAppointmentConsentQuestion(c, 'es')];
  // A provider receipt for older, narrower or model-invented wording cannot silently
  // widen permission. The actual server-authored question must end the sent message.
  if (!questions.some(question => wording === question || wording.endsWith("\n" + question))) return false;
  return atomicUpdate("managed_sms_consent", key(c, phone), row => {
    if (!row || row.suppressed) return { result: false };
    if(currentProof(row) || currentAsk(row.pendingAsk) && row.pendingAsk.messageSid===messageSid)return {result:true};
    if(row.handledAsks?.[messageSid])return {result:false};
    const at=Date.parse(sentAt);if(!Number.isFinite(at) || at>Date.now()+300000 || at<Date.now()-86400000)return {result:false};
    const handledAsks={...row.handledAsks,[messageSid]:new Date(at).toISOString()};
    if(Date.parse(row.lastNonAffirmationDate)>at || (Number(row.directiveDate)||0)>=at)return {value:{...row,handledAsks},result:false};
    const ask={wording,messageSid,wordingVersion:MANAGED_APPOINTMENT_CONSENT_VERSION,askedAt:new Date(at).toISOString(),expiresAt:new Date(at+86400000).toISOString(),senderNumber,messagingServiceSid};
    const affirmation=row.lastAffirmation;
    if(affirmation && Date.parse(affirmation.providerDate)>at && Date.parse(affirmation.providerDate)<=at+10*60000 && Date.parse(affirmation.providerDate)>(Number(row.directiveDate)||0))return {value:{...row,handledAsks,transactional:true,pendingAsk:null,proof:{messageSid:affirmation.messageSid,wording,wordingVersion:MANAGED_APPOINTMENT_CONSENT_VERSION,at:affirmation.at,purpose:"ongoing_appointment_updates",askMessageSid:messageSid,source:'verified_inbound_sms',recipient:phone,providerDate:affirmation.providerDate,senderNumber,messagingServiceSid}},result:true};
    return { value: { ...row,transactional:currentProof(row),handledAsks,pendingAsk:ask }, result: true };
  });
}
export async function saveManagedReviewAsk(c, phone, { wording, messageSid, sentAt }) {
  const language = wording === managedReviewConsentQuestion(c, 'es') ? 'es' : wording === managedReviewConsentQuestion(c, 'en') ? 'en' : null;
  if (!language || !reviewRequestsAvailable() || c.postVisit?.reviewRequest !== true || !validPhone(phone) || !/^SM[a-f0-9]{32}$/i.test(messageSid || '')) return false;
  const at = Date.parse(sentAt); if (!Number.isFinite(at) || at > Date.now() + 300000 || at < Date.now() - 86400000) return false;
  return atomicUpdate('managed_sms_consent', key(c, phone), row => {
    if (!row || row.suppressed || (Number(row.directiveDate) || 0) >= at || row.reviewAsk?.messageSid === messageSid || row.handledReviewAsks?.[messageSid]) return { result: false };
    return { value: { ...row, handledReviewAsks: { ...(row.handledReviewAsks || {}), [messageSid]: new Date(at).toISOString() }, reviewAsk: { wording, wordingVersion: REVIEW_CONSENT_VERSION, messageSid, providerDate: new Date(at).toISOString(), language, at: new Date().toISOString() } }, result: true };
  });
}
export async function mayDeliverManagedSMS(c, phone, purpose, job = null) {
  const row = await managedSMSConsent(c, phone);
  if (!row || row.suppressed) return false;
  // OH-1: a STOP recorded by the legacy line or the shared platform sender also blocks the outbox,
  // unless the customer opted in again on this shop's own number afterwards (lib/sms-suppression.mjs).
  const { crossStoreOptOut } = await import("./sms-suppression.mjs");
  if (await crossStoreOptOut(phone, row, purpose)) return false;
  if (["followup_consent_ask","quote_followup","request_followup"].includes(purpose)) { const {mayDeliverRequestFollowup}=await import("./request-followup.mjs"); return mayDeliverRequestFollowup(c,phone,purpose,job); }
  if (["reply", "consent_ask"].includes(purpose)) return Date.parse(row.lastInboundAt) > Date.now() - 86400000;
  if (["confirmation", "reminder_24h", "reminder_1h", "cancelled"].includes(purpose)) return currentProof(row);
  if (purpose === "review_request") return currentReviewProof(row); // Treated as marketing: its own express permission.
  if (purpose === "payment_reminder") return currentProof(row); // Transactional, about a visit the customer agreed to texts for.
  return false; // Marketing requires a separate reviewed program and express consent.
}
