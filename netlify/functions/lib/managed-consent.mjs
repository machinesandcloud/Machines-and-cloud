import { atomicUpdate } from "./store.mjs";
import { strictRead } from "./accounts.mjs";
import { workspaceTenant } from './workspace-identity.mjs';
export const deliveryTenant = workspaceTenant;
const key = (c, phone) => `${c.slug}/${deliveryTenant(c)}/${phone}`;
const validPhone = phone => typeof phone === "string" && /^\+1[2-9]\d{9}$/.test(phone);
const STOP = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|ALTO|PARAR)$/i;
const START = /^(START|UNSTOP|EMPEZAR)$/i;
const HELP = /^(HELP|INFO|AYUDA)$/i;
export const MANAGED_APPOINTMENT_CONSENT_VERSION = "ongoing_appointments_v2";
export function managedAppointmentConsentQuestion(c, language = 'en') {
  if (language === 'es') return `${c.business.name}: ¿quiere confirmaciones, recordatorios y cancelaciones de citas por mensaje, incluidas visitas futuras? Responda SÍ para aceptar. Frecuencia variable. Pueden aplicarse tarifas de mensajes y datos. HELP para ayuda; STOP/ALTO/PARAR para terminar. Puede reservar sin mensajes.`;
  return `${c.business.name}: want ongoing appointment confirmations, reminders and cancellation texts from us, including future visits? Reply YES to agree. Frequency varies. Message and data rates may apply. HELP for help; STOP/ALTO/PARAR to end. Booking is available without texts.`;
}
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
    const keyword = STOP.test(word) || providerOptOutType === "STOP" ? "stop" : START.test(word) || providerOptOutType === "START" ? "start" : HELP.test(word) || providerOptOutType === "HELP" ? "help" : "message";
    const next = { ...row, transactional: currentProof(row), pendingAsk: currentAsk(row.pendingAsk) ? row.pendingAsk : null, seen: { ...row.seen, [messageSid]: { keyword, at: now } }, lastMessageSid: messageSid, lastInboundAt: now, lastKeyword: keyword, updatedAt: now };
    next.lastAffirmation=!next.suppressed && /^(yes|si|sí)$/i.test(word)?{messageSid,providerDate,at:now}:null;
    if (keyword === "stop") { next.suppressed = true; next.transactional = false; next.pendingAsk = null; next.lastAffirmation=null; next.stoppedAt = now; next.directiveDate = Math.max(Number(row.directiveDate) || 0, Date.parse(providerDate) || Date.now()); }
    if (keyword === "start" && Number.isFinite(Date.parse(providerDate)) && Date.parse(providerDate) > (Number(row.directiveDate) || 0)) { next.suppressed = false; next.startedAt = now; next.directiveDate = Date.parse(providerDate); }
    if (!next.suppressed && /^(yes|si|sí)$/i.test(word) && next.pendingAsk && Date.parse(next.pendingAsk.expiresAt) > Date.now() && Date.parse(providerDate) > Date.parse(next.pendingAsk.askedAt)) {
      next.transactional = true; next.proof = { messageSid, wording: next.pendingAsk.wording, wordingVersion: MANAGED_APPOINTMENT_CONSENT_VERSION, at: now, purpose: "ongoing_appointment_updates", askMessageSid: next.pendingAsk.messageSid, source: 'verified_inbound_sms', recipient: phone, providerDate, senderNumber: next.pendingAsk.senderNumber || null, messagingServiceSid: next.pendingAsk.messagingServiceSid || null }; next.pendingAsk = null;
    }
    if(keyword==="message" && !/^(yes|si|sí)$/i.test(word)){next.pendingAsk=null;next.lastNonAffirmationDate=providerDate;}
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
export async function mayDeliverManagedSMS(c, phone, purpose) {
  const row = await managedSMSConsent(c, phone);
  if (!row || row.suppressed) return false;
  if (["reply", "consent_ask"].includes(purpose)) return Date.parse(row.lastInboundAt) > Date.now() - 86400000;
  if (["confirmation", "reminder_24h", "reminder_1h", "cancelled"].includes(purpose)) return currentProof(row);
  return false; // Marketing requires a separate reviewed program and express consent.
}
