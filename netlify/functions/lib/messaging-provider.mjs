// Real Twilio ISV adapter. The activation engine, not an HTTP caller, owns this adapter.
// A persisted dispatch intent precedes every write; a timeout is never permission to create again.
import { createHash } from 'node:crypto';
import { ManagedResourceAdmissionError, reserveManagedResource, assertManagedResourceReservation, assertManagedResourceDispatchPolicy, managedResourceAccountBinding, managedResourceAccountHash } from './managed-resource-admission.mjs';
const POLICY_SECONDARY = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
const POLICY_A2P = "RNb0d4771c2c98518d916a3d4cd70a8f8b";
const SID = (value, prefix) => new RegExp(`^${prefix}[a-f0-9]{32}$`, "i").test(value || "");
const types = { llc: "Limited Liability Corporation", corporation: "Corporation", partnership: "Partnership" };
export const messagingCorrelationLabel = (row, name) => `mc-sms-${row.correlationId.slice(0, 36)}-${name}`;
const receipt = (data, requestId) => ({ sid: data.sid, accountSid: data.account_sid, status: data.campaign_status || data.status || null,
  requestId: requestId || null, errors: (Array.isArray(data.errors) ? data.errors : []).slice(0, 20).map(error => ({ code: String(error.error_code || error.code || "unknown").slice(0, 40), field: String(error.object_field || error.field || "").slice(0, 80) })) });
function descriptor(row, name, primary) {
  const resources = row.resources || {}, r = key => resources[key]?.sid;
  const trust = path => ({ host: "trusthub", path, collection: "results" });
  const messaging = (path, collection) => ({ host: "messaging", path, collection });
  const label = name => messagingCorrelationLabel(row, name), L = row.legal, P = row.program;
  const named = (base, prefix, fields) => ({ ...base, prefix, fields: { FriendlyName: label(name), ...fields }, matches: data => data.friendly_name === label(name) });
  const assignment = (kind, parent, object) => ({ ...trust(`${kind}/${parent}/EntityAssignments`), prefix: "BV", fields: { ObjectSid: object },
    matches: data => data.object_sid === object && data[kind === "CustomerProfiles" ? "customer_profile_sid" : "trust_product_sid"] === parent });
  switch (name) {
    case "service": return named(messaging("Services", "services"), "MG", { InboundRequestUrl: row.inboundUrl, InboundMethod: "POST", StatusCallback: row.statusUrl, UseInboundWebhookOnNumber: "false", StickySender: "true", SmartEncoding: "false" });
    case "profile": return named(trust("CustomerProfiles"), "BU", { Email: row.notifyEmail, PolicySid: POLICY_SECONDARY });
    case "business": return named(trust("EndUsers"), "IT", { Type: "customer_profile_business_information", Attributes: JSON.stringify({ business_name: L.legalName, website_url: L.website,
      business_regions_of_operation: "USA_AND_CANADA", business_type: types[L.businessType], business_registration_identifier: "EIN", business_identity: "direct_customer", business_industry: "CONSTRUCTION", business_registration_number: L.ein }) });
    case "representative": return named(trust("EndUsers"), "IT", { Type: "authorized_representative_1", Attributes: JSON.stringify({ first_name: L.representative.firstName, last_name: L.representative.lastName,
      email: L.representative.email, phone_number: L.representative.phone, business_title: L.representative.title, job_position: L.representative.jobPosition }) });
    case "address": return named({ host: "account", path: "Addresses.json", collection: "addresses" }, "AD", { CustomerName: L.legalName, Street: L.street, StreetSecondary: L.street2 || "", City: L.city, Region: L.state, PostalCode: L.zip, IsoCountry: "US", AutoCorrectAddress: "false" });
    case "address_document": return named(trust("SupportingDocuments"), "RD", { Type: "customer_profile_address", Attributes: JSON.stringify({ address_sids: r("address") }) });
    case "assign_business": return assignment("CustomerProfiles", r("profile"), r("business"));
    case "assign_representative": return assignment("CustomerProfiles", r("profile"), r("representative"));
    case "assign_address": return assignment("CustomerProfiles", r("profile"), r("address_document"));
    case "assign_primary": return assignment("CustomerProfiles", r("profile"), primary);
    case "evaluate_profile": return { ...trust(`CustomerProfiles/${r("profile")}/Evaluations`), prefix: "EL", fields: { PolicySid: POLICY_SECONDARY }, matches: data => data.customer_profile_sid === r("profile") };
    case "submit_profile": return { ...trust(`CustomerProfiles/${r("profile")}`), prefix: "BU", update: true, fields: { Status: "pending-review" }, matches: data => data.sid === r("profile") };
    case "trust_product": return named(trust("TrustProducts"), "BU", { Email: row.notifyEmail, PolicySid: POLICY_A2P });
    case "a2p_business": return named(trust("EndUsers"), "IT", { Type: "us_a2p_messaging_profile_information", Attributes: JSON.stringify({ company_type: "private" }) });
    case "assign_a2p_business": return assignment("TrustProducts", r("trust_product"), r("a2p_business"));
    case "assign_profile": return assignment("TrustProducts", r("trust_product"), r("profile"));
    case "evaluate_trust": return { ...trust(`TrustProducts/${r("trust_product")}/Evaluations`), prefix: "EL", fields: { PolicySid: POLICY_A2P }, matches: data => data.trust_product_sid === r("trust_product") };
    case "submit_trust": return { ...trust(`TrustProducts/${r("trust_product")}`), prefix: "BU", update: true, fields: { Status: "pending-review" }, matches: data => data.sid === r("trust_product") };
    case "brand": return { ...messaging("a2p/BrandRegistrations", "data"), prefix: "BN", paid: true, fields: { CustomerProfileBundleSid: r("profile"), A2PProfileBundleSid: r("trust_product"), BrandType: "STANDARD", Mock: "false" },
      matches: data => data.customer_profile_bundle_sid === r("profile") && data.a2p_profile_bundle_sid === r("trust_product") && data.mock !== true };
    case "campaign": return { ...messaging(`Services/${r("service")}/Compliance/Usa2p`, "compliance"), prefix: "QE", paid: true, fields: {
      BrandRegistrationSid: r("brand"), Description: P.description, MessageFlow: P.messageFlow, MessageSamples: P.messageSamples, UsAppToPersonUsecase: "CUSTOMER_CARE", HasEmbeddedLinks: "true", HasEmbeddedPhone: "true",
      PrivacyPolicyUrl: P.privacyPolicyUrl, TermsAndConditionsUrl: P.termsAndConditionsUrl, OptInMessage: P.optInMessage, OptOutMessage: P.optOutMessage, HelpMessage: P.helpMessage,
      OptInKeywords: ["START", "UNSTOP", "EMPEZAR"], OptOutKeywords: ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "ALTO", "PARAR"], HelpKeywords: ["HELP", "INFO", "AYUDA"], SubscriberOptIn: "true", AgeGated: "false", DirectLending: "false" },
      matches: data => data.messaging_service_sid === r("service") && data.brand_registration_sid === r("brand") };
    case "sender": return { ...messaging(`Services/${r("service")}/PhoneNumbers`, "phone_numbers"), prefix: "PN", fields: { PhoneNumberSid: row.number.sid }, matches: data => data.sid === row.number.sid && data.service_sid === r("service") && data.phone_number === row.number.number };
    case "number_webhook": return { host: "account", path: `IncomingPhoneNumbers/${row.number.sid}.json`, prefix: "PN", update: true, fields: { SmsUrl: row.inboundUrl, SmsMethod: "POST" }, matches: data => data.sid === row.number.sid && data.phone_number === row.number.number };
    default: {
      if (name.startsWith("correct_")) {
        const original = name.slice(8), before = descriptor(row, original, primary), saved = resources[original];
        if (!saved?.sid) throw new Error("The existing registration resource is required for correction");
        const suffix = before.path.endsWith(".json") ? before.path.slice(0, -5) + `/${saved.sid}.json` : `${before.path}/${saved.sid}`;
        const fields = { ...before.fields }; delete fields.Type; delete fields.PolicySid;
        if (original === "brand") for (const key of Object.keys(fields)) delete fields[key];
        if (original === "campaign") for (const key of ["BrandRegistrationSid", "UsAppToPersonUsecase", "OptInMessage", "OptOutMessage", "HelpMessage", "OptInKeywords", "OptOutKeywords", "HelpKeywords", "SubscriberOptIn"]) delete fields[key];
        return { ...before, path: suffix, update: true, paid: ["brand", "campaign"].includes(original), fields, matches: data => data.sid === saved.sid && before.matches(data) };
      }
      throw new Error("Unknown messaging step");
    }
  }
}
const toForm = fields => { const form = new URLSearchParams(); for (const [key, value] of Object.entries(fields)) { if (value === undefined || value === null) throw new Error("Incomplete provider registration"); for (const item of Array.isArray(value) ? value : [value]) form.append(key, String(item)); } return form.toString(); };
const asObject = value => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Twilio response"); return value; };
export function createTwilioMessagingAdapter({ executionAllowed, deadlineAt = null } = {}) {
  const account = () => process.env.TWILIO_ACCOUNT_SID, primary = () => process.env.TWILIO_PRIMARY_PROFILE_SID;
  async function request(host, path, method = "GET", fields, binding = null, admission = null) {
    const beforeDispatch = message => { const error = new Error(message); if (method === "POST") error.code = "dispatch_not_authorized"; return error; };
    if (typeof executionAllowed !== "function" || executionAllowed() !== true) throw beforeDispatch("Messaging execution is disabled");
    const user = process.env.TWILIO_API_KEY || account(), password = process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
    if (!SID(account(), "AC") || !user || !password || !SID(primary(), "BU")) throw beforeDispatch("Messaging credentials are unavailable");
    const root = host === "messaging" ? "https://messaging.twilio.com/v1/" : host === "trusthub" ? "https://trusthub.twilio.com/v1/" : `https://api.twilio.com/2010-04-01/Accounts/${account()}/`;
    if (typeof path !== "string" || !/^[A-Za-z0-9_/.?=&%-]+$/.test(path) || path.includes("..")) throw new Error("Invalid provider path");
    const remaining = Math.min(5000, deadlineAt === null ? 5000 : deadlineAt - Date.now()); if (remaining <= 0) throw beforeDispatch("Messaging operation deadline reached");
    if(binding&&binding!==managedResourceAccountHash())throw beforeDispatch('Messaging resource belongs to another provider account');
    if(admission)assertManagedResourceDispatchPolicy(admission);
    const response = await fetch(root + path, { method, redirect: "error", signal: AbortSignal.timeout(remaining), headers: { Authorization: "Basic " + Buffer.from(`${user}:${password}`).toString("base64"), ...(fields ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, ...(fields ? { body: toForm(fields) } : {}) });
    if (response.status === 404 || response.status === 204) return { status: response.status, data: null };
    if (!response.ok) { const error = new Error("Twilio messaging request could not be confirmed"); error.code = response.status >= 400 && response.status < 500 && response.status !== 429 ? "provider_rejected" : "provider_unavailable"; throw error; }
    return { status: response.status, data: asObject(await response.json()), requestId: response.headers.get("twilio-request-id") };
  }
  function validate(data, step) {
    if (!data || data.account_sid !== account() || !SID(data.sid, step.prefix) || !step.matches(data)) throw new Error("Messaging resource identity mismatch");
    return data;
  }
  const readDescriptor = async (step, sid, binding) => {
    const path = step.update ? step.path : step.path.endsWith(".json") ? step.path.slice(0, -5) + `/${sid}.json` : `${step.path}/${sid}`;
    const found = await request(step.host, path,'GET',null,binding); return found.status === 404 ? null : validate(found.data, step);
  };
  function correctionMatches(data, step) {
    if (step.paid) return false; // A FAILED paid resubmission cannot be inferred from unchanged fields.
    const names = { FriendlyName: "friendly_name", Street: "street", StreetSecondary: "street_secondary", CustomerName: "customer_name", City: "city", Region: "region", PostalCode: "postal_code", SmsUrl: "sms_url", SmsMethod: "sms_method", Status: "status" };
    return Object.entries(step.fields).every(([key, value]) => key === "Attributes" ? JSON.stringify(typeof data.attributes === "string" ? JSON.parse(data.attributes) : data.attributes) === JSON.stringify(JSON.parse(value)) : key === "Status" ? ["pending-review", "in-review", "twilio-approved"].includes(data.status) : names[key] ? data[names[key]] === value : true);
  }
  return {
    async preflight(row) {
      const binding=await managedResourceAccountBinding('brand',row.id);
      const profile = (await request("trusthub", `CustomerProfiles/${primary()}`,'GET',null,binding)).data;
      if (!profile || profile.sid !== primary() || profile.account_sid !== account() || profile.status !== "twilio-approved") throw new Error("The platform ISV profile is not approved");
      const number = (await request("account", `IncomingPhoneNumbers/${row.number.sid}.json`,'GET',null,binding)).data;
      if (!number || number.account_sid !== account() || number.sid !== row.number.sid || number.phone_number !== row.number.number || number.capabilities?.sms !== true) throw new Error("The customer's SMS number is unavailable");
      return true;
    },
    async execute({ row, name, authorize }) {
      if(['correct_brand','correct_campaign'].includes(name))throw new ManagedResourceAdmissionError('resource_paid_correction_unapproved','Your registration records are retained. The platform must review any paid brand or campaign correction before it can be submitted.');
      const step = descriptor(row, name, primary());
      const binding=await managedResourceAccountBinding('brand',row.id);
      let input,admission;
      if(step.paid) {
        if(createHash('sha256').update(JSON.stringify({legal:row.legal,program:row.program})).digest('hex')!==row.inputHash)throw new ManagedResourceAdmissionError('resource_intent_changed');
        input={kind:name,operationId:row.id,claimToken:row.claim?.token,correlationId:row.correlationId,offer:row.offer,inputHash:row.inputHash,programDigest:row.programDigest,submissionRevision:row.submissionRevision,registrationRefs:{profileSid:row.resources?.profile?.sid,trustProductSid:row.resources?.trust_product?.sid,serviceSid:row.resources?.service?.sid,brandSid:row.resources?.brand?.sid,numberSid:row.number?.sid},payload:{host:step.host,path:step.path,fields:step.fields}};
        try { admission=await reserveManagedResource(input); }
        catch(error) { throw error instanceof ManagedResourceAdmissionError?error:new ManagedResourceAdmissionError('resource_admission_unavailable'); }
      }
      if (typeof authorize !== "function" || !await authorize()) { const error = new Error("Messaging dispatch is no longer authorized"); error.code = "dispatch_not_authorized"; throw error; }
      if(admission) {
        try { await assertManagedResourceReservation(input,admission); }
        catch(error) { throw error instanceof ManagedResourceAdmissionError?error:new ManagedResourceAdmissionError('resource_admission_unavailable'); }
      }
      const created = await request(step.host, step.path, "POST", step.fields,admission?.providerAccountHash||binding,admission), data = validate(created.data, step);
      return { ...receipt(data, created.requestId), ...(name.startsWith("evaluate_") ? { compliant: data.status === "compliant", issues: (data.results || []).flatMap(item => item.passed === false ? (item.invalid || []).map(field => ({ code: String(field.error_code || item.error_code || "invalid"), field: String(field.object_field || item.requirement_name || "business").slice(0, 80) })) : []).slice(0, 20) } : {}) };
    },
    async reconcile({ row, name }) {
      const binding=await managedResourceAccountBinding('brand',row.id);
      const step = descriptor(row, name, primary()), known = row.resources?.[name]?.sid;
      if (step.update || known) {
        const data = await readDescriptor(step, known,binding);
        if (!data) return { status: "unknown", reasonCode: "known_resource_missing" };
        if (step.update && !correctionMatches(data, step)) {
          if (step.paid && ["PENDING", "IN_REVIEW", "APPROVED", "IN_PROGRESS", "VERIFIED"].includes(data.status || data.campaign_status)) return { status: "found", resource: receipt(data) };
          return { status: "unknown", reasonCode: "update_not_confirmed" };
        }
        return { status: "found", resource: { ...receipt(data), ...(name.startsWith("evaluate_") ? { compliant: data.status === "compliant", issues: [] } : {}) } };
      }
      const query = step.path.includes("?") ? "&PageSize=100" : "?PageSize=100", found = (await request(step.host, step.path + query,'GET',null,binding)).data;
      const entries = found?.[step.collection]; if (!Array.isArray(entries)) throw new Error("The provider list response is incomplete");
      const matches = entries.filter(data => data.account_sid === account() && step.matches(data));
      // The API does not promise creation idempotency or unique FriendlyNames. A zero match, a
      // partial page, or multiple matches cannot establish absence of a timed-out creation.
      if (found.meta?.next_page_url || found.next_page_uri || matches.length !== 1) return { status: "unknown", reasonCode: matches.length > 1 ? "multiple_correlated_resources" : "resource_not_confirmed" };
      const data = validate(matches[0], step); return { status: "found", resource: { ...receipt(data), ...(name.startsWith("evaluate_") ? { compliant: data.status === "compliant", issues: [] } : {}) } };
    },
    async approvals(row) {
      const binding=await managedResourceAccountBinding('brand',row.id);
      const profile = validate((await request("trusthub", `CustomerProfiles/${row.resources.profile.sid}`,'GET',null,binding)).data, descriptor(row, "profile", primary()));
      const trust = validate((await request("trusthub", `TrustProducts/${row.resources.trust_product.sid}`,'GET',null,binding)).data, descriptor(row, "trust_product", primary()));
      const brand = validate((await request("messaging", `a2p/BrandRegistrations/${row.resources.brand.sid}`,'GET',null,binding)).data, descriptor(row, "brand", primary()));
      let campaign = null;
      if (row.resources.campaign) campaign = validate((await request("messaging", `Services/${row.resources.service.sid}/Compliance/Usa2p/${row.resources.campaign.sid}`,'GET',null,binding)).data, descriptor(row, "campaign", primary()));
      return { profile: profile.status, trust: trust.status, brand: brand.status, campaign: campaign?.campaign_status || null, issues: [...receipt(brand).errors, ...(campaign ? receipt(campaign).errors : [])] };
    },
    async usecase(row) {
      const binding=await managedResourceAccountBinding('brand',row.id);
      const data = (await request("messaging", `Services/${row.resources.service.sid}/Compliance/Usa2p/Usecases?BrandRegistrationSid=${row.resources.brand.sid}`,'GET',null,binding)).data;
      return Array.isArray(data.us_app_to_person_usecases) && data.us_app_to_person_usecases.some(item => item.code === "CUSTOMER_CARE" && item.post_approval_required === false);
    },
    async verify(row) {
      const binding=await managedResourceAccountBinding('brand',row.id);
      const service = validate((await request("messaging", `Services/${row.resources.service.sid}`,'GET',null,binding)).data, descriptor(row, "service", primary()));
      const sender = validate((await request("messaging", `Services/${row.resources.service.sid}/PhoneNumbers/${row.number.sid}`,'GET',null,binding)).data, descriptor(row, "sender", primary()));
      const number = validate((await request("account", `IncomingPhoneNumbers/${row.number.sid}.json`,'GET',null,binding)).data, descriptor(row, "number_webhook", primary()));
      return service.inbound_request_url === row.inboundUrl && service.inbound_method === "POST" && service.status_callback === row.statusUrl && service.use_inbound_webhook_on_number === false && sender.sid === row.number.sid && number.sms_url === row.inboundUrl && number.sms_method === "POST";
    },
    async verifyProbe(row, { outboundMessageSid, inboundMessageSid }) {
      if (!SID(outboundMessageSid, "SM") || !SID(inboundMessageSid, "SM") || outboundMessageSid === inboundMessageSid || !row.probe) return false;
      const binding=await managedResourceAccountBinding('brand',row.id);
      const outbound = (await request("account", `Messages/${outboundMessageSid}.json`,'GET',null,binding)).data, inbound = (await request("account", `Messages/${inboundMessageSid}.json`,'GET',null,binding)).data;
      const within = data => Number.isFinite(Date.parse(data?.date_created)) && Date.parse(data.date_created) >= Date.parse(row.probe.createdAt) - 60000 && Date.parse(data.date_created) <= Date.parse(row.probe.expiresAt);
      return outbound?.account_sid === account() && inbound?.account_sid === account() && outbound.sid === outboundMessageSid && inbound.sid === inboundMessageSid && outbound.status === "delivered" && outbound.direction === "outbound-api" && outbound.messaging_service_sid === row.resources.service.sid && outbound.from === row.number.number && outbound.to === row.probe.to && outbound.body === row.probe.body && within(outbound) && inbound.direction === "inbound" && inbound.from === row.probe.to && inbound.to === row.number.number && String(inbound.body).trim() === row.probe.nonce && within(inbound);
    },
    async cleanup({ row, name, authorize }) {
      const binding=await managedResourceAccountBinding('brand',row.id);
      const service = row.resources.service?.sid;
      const path = name === "campaign" ? `Services/${service}/Compliance/Usa2p/${row.resources.campaign.sid}` : name === "sender" ? `Services/${service}/PhoneNumbers/${row.number.sid}` : `Services/${service}`;
      const before = await request("messaging", path,'GET',null,binding);
      if (before.status === 404) return { confirmed: true };
      validate(before.data, descriptor(row, name, primary()));
      if (typeof authorize !== "function" || !await authorize()) throw new Error("Cancellation authority changed");
      await request("messaging", path, "DELETE",null,binding);
      return { confirmed: (await request("messaging", path,'GET',null,binding)).status === 404 };
    },
  };
}
