// Twilio provisioning: buy a local number, point its webhooks at us, create a Messaging Service,
// and register the shop for A2P 10DLC (Secondary Customer Profile -> A2P Trust Product -> Brand ->
// Campaign). Needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PRIMARY_PROFILE_SID (the
// approved Primary Customer Profile of Machines & Cloud, a one-time setup in the Twilio console).
import { policyUrls } from "./config.mjs";

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const PRIMARY = process.env.TWILIO_PRIMARY_PROFILE_SID;
const NOTIFY_EMAIL = process.env.TWILIO_NOTIFY_EMAIL || process.env.STEVE_EMAIL || "support@machinesandcloud.com";
const POLICY_SECONDARY = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
const POLICY_A2P = "RNb0d4771c2c98518d916a3d4cd70a8f8b";

export const twilioEnabled = () => Boolean(SID && TOKEN);
export const a2pEnabled = () => twilioEnabled() && Boolean(PRIMARY);

async function tw(url, params, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"), ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? new URLSearchParams(params).toString() : undefined,
  });
  if (res.status === 204) return {};
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`twilio ${url.split("/").slice(-2).join("/")}: ${d.message || d.error || res.status}`);
  return d;
}
const api = (p) => `https://api.twilio.com/2010-04-01/Accounts/${SID}/${p}`;
const trust = (p) => `https://trusthub.twilio.com/v1/${p}`;
const msg = (p) => `https://messaging.twilio.com/v1/${p}`;

// Fallbacks when our functions or Vapi do not answer: Steve's static TwiML Bins (OPERATIONS.md one-time setup).
export const fallbackUrls = () => ({ voice: process.env.VOICE_FALLBACK_TWIML_URL || "", sms: process.env.SMS_FALLBACK_TWIML_URL || "" });
// The voice bin is a Mustache template: {{#cell}}<Dial timeout="25">{{cell}}</Dial>{{/cell}}<Say>...</Say>. A two-phone shop
// gets its owner's cell in the query string; a one-phone shop gets the bare URL (dialing the forwarded line would loop).
export function voiceFallbackFor(client) {
  const base = fallbackUrls().voice; if (!base) return "";
  const p = client.phone || {}, o = client.owner || {};
  const forwardedLine = (o.phone && p.businessNumber && o.phone === p.businessNumber) || (p.forwarding === "all" && !p.transferTo);
  return o.phone && !forwardedLine ? `${base}${base.includes("?") ? "&" : "?"}cell=${encodeURIComponent(o.phone)}` : base;
}
export async function buyLocalNumber({ areaCode = "713", friendlyName, voiceUrl, smsUrl, voiceFallbackUrl }) {
  let list = [];
  for (const ac of [areaCode, "713", "281", "832", "346"]) {
    const d = await tw(api(`AvailablePhoneNumbers/US/Local.json?AreaCode=${ac}&SmsEnabled=true&VoiceEnabled=true&PageSize=5`), null, "GET");
    list = d.available_phone_numbers || [];
    if (list.length) break;
  }
  if (!list.length) throw new Error("no local numbers available");
  const fb = fallbackUrls(); const vf = voiceFallbackUrl || fb.voice;
  const n = await tw(api("IncomingPhoneNumbers.json"), { PhoneNumber: list[0].phone_number, FriendlyName: friendlyName, VoiceUrl: voiceUrl, VoiceMethod: "POST", SmsUrl: smsUrl, SmsMethod: "POST", ...(vf ? { VoiceFallbackUrl: vf, VoiceFallbackMethod: "POST" } : {}), ...(fb.sms ? { SmsFallbackUrl: fb.sms, SmsFallbackMethod: "POST" } : {}) });
  return { number: n.phone_number, sid: n.sid };
}

export async function setNumberWebhooks(numberSid, { voiceUrl, smsUrl, voiceFallbackUrl }) {
  const fb = fallbackUrls(); const vf = voiceFallbackUrl || fb.voice;
  return tw(api(`IncomingPhoneNumbers/${numberSid}.json`), { VoiceUrl: voiceUrl, VoiceMethod: "POST", SmsUrl: smsUrl, SmsMethod: "POST", ...(vf ? { VoiceFallbackUrl: vf, VoiceFallbackMethod: "POST" } : {}), ...(fb.sms ? { SmsFallbackUrl: fb.sms, SmsFallbackMethod: "POST" } : {}) });
}
// Re-point the voice fallback after the owner's cell, business number, or forwarding mode changes.
export async function syncVoiceFallback(client) {
  if (!twilioEnabled() || !client.phone?.twilioNumberSid) return null;
  // A Vapi-answered line falls back to our /api/voice; a line we answer falls back to the bin (with the cell when safe).
  const site = process.env.URL || "https://machinesandcloud.com";
  const url = client.voice?.assistantId && !client.voice?.detached ? `${site}/api/voice` : voiceFallbackFor(client);
  if (!url) return null;
  await setVoiceFallback(client.phone.twilioNumberSid, url);
  return url;
}
// A Vapi-answered number falls back to our own /api/voice (missed-call text-back) when Vapi does not answer.
export async function setVoiceFallback(numberSid, voiceFallbackUrl) {
  return tw(api(`IncomingPhoneNumbers/${numberSid}.json`), { VoiceFallbackUrl: voiceFallbackUrl, VoiceFallbackMethod: "POST" });
}

export async function createMessagingService({ friendlyName, inboundUrl }) {
  const s = await tw(msg("Services"), { FriendlyName: friendlyName, InboundRequestUrl: inboundUrl, InboundMethod: "POST", UseInboundWebhookOnNumber: "true" });
  return s.sid;
}
export async function addNumberToService(serviceSid, numberSid) {
  return tw(msg(`Services/${serviceSid}/PhoneNumbers`), { PhoneNumberSid: numberSid });
}

const BUSINESS_TYPES = { llc: "Limited Liability Corporation", corp: "Corporation", sole: "Sole Proprietorship", partnership: "Partnership", nonprofit: "Non-profit Corporation" };

// Registers the shop's brand and campaign. Returns the SIDs; statuses are polled later by the scheduler.
export async function registerA2P(client, messagingServiceSid) {
  const L = client.business.legal || {};
  const o = client.owner || {};
  const [first, ...rest] = (o.name || "Owner").split(" ");
  const last = rest.join(" ") || "Owner";
  const website = client.business.website?.startsWith("http") ? client.business.website : "https://" + client.business.website;

  // 1. Secondary Customer Profile
  const profile = await tw(trust("CustomerProfiles"), { PolicySid: POLICY_SECONDARY, FriendlyName: `${client.business.name} (${client.slug})`, Email: NOTIFY_EMAIL });
  const biz = await tw(trust("EndUsers"), { Type: "customer_profile_business_information", FriendlyName: `${client.business.name} business info`, Attributes: JSON.stringify({
    business_name: L.legalName || client.business.name, website_url: website, business_regions_of_operation: "USA_AND_CANADA",
    business_type: BUSINESS_TYPES[L.businessType] || "Limited Liability Corporation", business_registration_identifier: "EIN", business_identity: "direct_customer",
    business_industry: "CONSTRUCTION", business_registration_number: String(L.ein || "").replace(/[^\d]/g, ""),
  }) });
  await tw(trust(`CustomerProfiles/${profile.sid}/EntityAssignments`), { ObjectSid: biz.sid });
  const rep = await tw(trust("EndUsers"), { Type: "authorized_representative_1", FriendlyName: `${client.business.name} owner`, Attributes: JSON.stringify({ business_title: "Owner", email: o.email, first_name: first, job_position: "CEO", last_name: last, phone_number: o.phone || client.phone?.businessNumber || "" }) });
  await tw(trust(`CustomerProfiles/${profile.sid}/EntityAssignments`), { ObjectSid: rep.sid });
  const addr = await tw(api("Addresses.json"), { FriendlyName: `${client.business.name} address`, CustomerName: L.legalName || client.business.name, Street: L.street || "", City: L.city || client.business.city || "Houston", Region: L.state || "TX", PostalCode: L.zip || "", IsoCountry: "US" });
  const doc = await tw(trust("SupportingDocuments"), { Type: "customer_profile_address", FriendlyName: `${client.business.name} address doc`, Attributes: JSON.stringify({ address_sids: addr.sid }) });
  await tw(trust(`CustomerProfiles/${profile.sid}/EntityAssignments`), { ObjectSid: doc.sid });
  await tw(trust(`CustomerProfiles/${profile.sid}/EntityAssignments`), { ObjectSid: PRIMARY });
  const ev = await tw(trust(`CustomerProfiles/${profile.sid}/Evaluations`), { PolicySid: POLICY_SECONDARY });
  if (ev.status !== "compliant") throw new Error("customer profile noncompliant: " + JSON.stringify(ev.results || ev).slice(0, 400));
  await tw(trust(`CustomerProfiles/${profile.sid}`), { Status: "pending-review" });

  // 2. A2P Trust Product
  const tp = await tw(trust("TrustProducts"), { PolicySid: POLICY_A2P, FriendlyName: `${client.business.name} A2P`, Email: NOTIFY_EMAIL });
  const a2pUser = await tw(trust("EndUsers"), { Type: "us_a2p_messaging_profile_information", FriendlyName: `${client.business.name} A2P info`, Attributes: JSON.stringify({ company_type: "private" }) });
  await tw(trust(`TrustProducts/${tp.sid}/EntityAssignments`), { ObjectSid: a2pUser.sid });
  await tw(trust(`TrustProducts/${tp.sid}/EntityAssignments`), { ObjectSid: profile.sid });
  const ev2 = await tw(trust(`TrustProducts/${tp.sid}/Evaluations`), { PolicySid: POLICY_A2P });
  if (ev2.status !== "compliant") throw new Error("a2p profile noncompliant: " + JSON.stringify(ev2.results || ev2).slice(0, 400));
  await tw(trust(`TrustProducts/${tp.sid}`), { Status: "pending-review" });

  // 3. Brand
  const brand = await tw(msg("a2p/BrandRegistrations"), { CustomerProfileBundleSid: profile.sid, A2PProfileBundleSid: tp.sid, SkipAutomaticSecVet: "true" });

  return { customerProfileSid: profile.sid, trustProductSid: tp.sid, brandSid: brand.sid, brandStatus: brand.status, messagingServiceSid };
}

export async function brandStatus(brandSid) {
  const d = await tw(msg(`a2p/BrandRegistrations/${brandSid}`), null, "GET");
  return d.status; // PENDING, APPROVED, FAILED, IN_REVIEW
}

export async function createCampaign(client, serviceSid, brandSid) {
  const name = client.business.name;
  const c = await tw(msg(`Services/${serviceSid}/Compliance/Usa2p`), {
    BrandRegistrationSid: brandSid,
    Description: `${name} is a ${client.business.trade || "home service"} company. This number texts customers who contacted the business about service: replies to their questions, appointment confirmations and reminders, on-the-way notices, follow-up on open estimates, and review requests after a completed job. One-to-one conversational messaging; no marketing blasts.`,
    MessageFlow: `Customers opt in by calling, texting, or chatting with ${name} or booking a visit; at booking the front desk tells them they will get appointment texts at this number and can reply STOP. Terms: ${policyUrls(client.slug).terms}. Privacy: ${policyUrls(client.slug).privacy}.`,
    MessageSamples: [
      `${name}: you're booked for tomorrow, 8 to 12. We'll text a reminder and again when the tech is on the way. Reply STOP to opt out.`,
      `Hi, this is ${name}. Sorry we missed your call. What can we help with, and is it urgent? Reply here and we'll get you scheduled. Reply STOP to opt out.`,
      `Thanks for choosing ${name}. How did we do? A quick Google review helps a small shop a lot. Reply here if anything was not right.`,
    ],
    UsAppToPersonUsecase: "MIXED",
    PrivacyPolicyUrl: policyUrls(client.slug).privacy,
    TermsAndConditionsUrl: policyUrls(client.slug).terms,
    OptInMessage: `${name}: you're booked. We'll text appointment reminders to this number. Reply STOP to opt out, HELP for help.`,
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "true",
    SubscriberOptIn: "true",
    AgeGated: "false",
    DirectLending: "false",
  });
  return { campaignSid: c.sid, campaignStatus: c.campaign_status };
}

export async function campaignStatus(serviceSid, campaignSid) {
  const d = await tw(msg(`Services/${serviceSid}/Compliance/Usa2p/${campaignSid}`), null, "GET");
  return d.campaign_status; // PENDING, VERIFIED, FAILED, IN_PROGRESS
}

export async function getNumber(numberSid) {
  const d = await tw(api(`IncomingPhoneNumbers/${numberSid}.json`), null, "GET");
  return { voice_url: d.voice_url, sms_url: d.sms_url, phone_number: d.phone_number };
}

export async function releaseNumber(numberSid, messagingServiceSid) {
  const out = {};
  if (messagingServiceSid) { try { await tw(msg(`Services/${messagingServiceSid}`), null, "DELETE"); out.messagingService = messagingServiceSid; } catch (e) { out.messagingServiceError = e.message; } }
  await tw(api(`IncomingPhoneNumbers/${numberSid}.json`), null, "DELETE");
  out.number = numberSid;
  return out;
}
