import { createHash } from "node:crypto";
import { atomicUpdate } from "./store.mjs";
import { strictRead, normalizeAccountEmail } from "./accounts.mjs";
export const deliveryTenant = c => createHash("sha256").update(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)])).digest("hex");
const key = (c, phone) => `${c.slug}/${deliveryTenant(c)}/${phone}`;
const validPhone = phone => typeof phone === "string" && /^\+1[2-9]\d{9}$/.test(phone);
const STOP = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|ALTO|PARAR)$/i;
const START = /^(START|UNSTOP|EMPEZAR)$/i;
const HELP = /^(HELP|INFO|AYUDA)$/i;
export async function managedSMSConsent(c, phone) {
  if (!validPhone(phone)) return null;
  return strictRead("managed_sms_consent", key(c, phone));
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
    const next = { ...row, seen: { ...row.seen, [messageSid]: { keyword, at: now } }, lastMessageSid: messageSid, lastInboundAt: now, lastKeyword: keyword, updatedAt: now };
    next.lastAffirmation=!next.suppressed && /^(yes|si|sí)$/i.test(word)?{messageSid,providerDate,at:now}:null;
    if (keyword === "stop") { next.suppressed = true; next.transactional = false; next.pendingAsk = null; next.lastAffirmation=null; next.stoppedAt = now; next.directiveDate = Math.max(Number(row.directiveDate) || 0, Date.parse(providerDate) || Date.now()); }
    if (keyword === "start" && Number.isFinite(Date.parse(providerDate)) && Date.parse(providerDate) > (Number(row.directiveDate) || 0)) { next.suppressed = false; next.startedAt = now; next.directiveDate = Date.parse(providerDate); }
    if (!next.suppressed && /^(yes|si|sí)$/i.test(word) && row.pendingAsk && Date.parse(row.pendingAsk.expiresAt) > Date.now() && Date.parse(providerDate) >= Date.parse(row.pendingAsk.askedAt)) {
      next.transactional = true; next.proof = { messageSid, wording: row.pendingAsk.wording, at: now, purpose: "appointment_updates" }; next.pendingAsk = null;
    }
    if(keyword==="message" && !/^(yes|si|sí)$/i.test(word)){next.pendingAsk=null;next.lastNonAffirmationDate=providerDate;}
    return { value: next, result: { ...next, keyword } };
  });
}
export async function saveManagedConsentAsk(c, phone, { wording, messageSid, sentAt }) {
  if (!validPhone(phone) || typeof wording !== "string" || !/^SM[a-f0-9]{32}$/i.test(messageSid || "")) throw new Error("Consent ask needs a provider receipt");
  return atomicUpdate("managed_sms_consent", key(c, phone), row => {
    if (!row || row.suppressed) return { result: false };
    if(row.transactional || row.pendingAsk?.messageSid===messageSid)return {result:true};
    if(row.handledAsks?.[messageSid])return {result:false};
    const at=Date.parse(sentAt);if(!Number.isFinite(at) || at>Date.now()+300000 || at<Date.now()-86400000)return {result:false};
    const handledAsks={...row.handledAsks,[messageSid]:new Date(at).toISOString()};
    if(Date.parse(row.lastNonAffirmationDate)>at || (Number(row.directiveDate)||0)>=at)return {value:{...row,handledAsks},result:false};
    const ask={wording,messageSid,askedAt:new Date(at).toISOString(),expiresAt:new Date(at+86400000).toISOString()};
    const affirmation=row.lastAffirmation;
    if(affirmation && Date.parse(affirmation.providerDate)>=at && Date.parse(affirmation.providerDate)<=at+10*60000 && Date.parse(affirmation.providerDate)>(Number(row.directiveDate)||0))return {value:{...row,handledAsks,transactional:true,pendingAsk:null,proof:{messageSid:affirmation.messageSid,wording,at:affirmation.at,purpose:"appointment_updates",askMessageSid:messageSid}},result:true};
    return { value: { ...row,handledAsks,pendingAsk:ask }, result: true };
  });
}
export async function mayDeliverManagedSMS(c, phone, purpose) {
  const row = await managedSMSConsent(c, phone);
  if (!row || row.suppressed) return false;
  if (["reply", "consent_ask"].includes(purpose)) return Date.parse(row.lastInboundAt) > Date.now() - 86400000;
  if (["confirmation", "reminder_24h", "reminder_1h", "cancelled"].includes(purpose)) return row.transactional === true && !!row.proof;
  return false; // Marketing requires a separate reviewed program and express consent.
}
