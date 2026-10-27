// Number acquisition only. No routing, assistant, messaging registration or channel activation.
// Every request is made only through the caller's explicit product-wide execution gate.
import { ManagedResourceAdmissionError, reserveManagedResource, assertManagedResourceReservation, assertManagedResourceDispatchPolicy, managedResourceAccountBinding, managedResourceAccountHash, managedNumberPreDispatchProof } from './managed-resource-admission.mjs';
const sidValid = value => /^PN[a-f0-9]{32}$/i.test(value || "");
const label = correlationId => "mc-phone-" + correlationId.slice(0, 55);
// Twilio's available-number response uses SMS/voice; older responses and local
// fixtures use sms/voice. Every supplied alias must be exactly true.
const capability = (value, names) => {
  const supplied=names.filter(name=>Object.hasOwn(value||{},name));
  return supplied.length>0&&supplied.every(name=>value[name]===true);
};
const cents = value => {
  const match = /^(\d{1,5})(?:\.(\d{1,2})(?:0*)?)?$/.exec(String(value));
  if (!match) throw new Error("Unsupported phone price precision");
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
};
export function createTwilioNumberAdapter({ executionAllowed, deadlineAt = null }) {
  async function request(path, method = "GET", body, pricing = false, deadline = Date.now() + 5000, binding = null, admission = null, cancellationProof = null) {
    const cancellationRead=cancellationProof?.outcome==='cancel'&&cancellationProof.kind==='mandatory_reservation_absent'&&cancellationProof.providerAccountHash===binding&&method==='GET'&&!pricing&&!body&&path==='IncomingPhoneNumbers.json?'+new URLSearchParams({FriendlyName:label(cancellationProof.correlationId),PageSize:'100'})&&Date.parse(cancellationProof.confirmedAt)<=Date.now()&&Date.now()-Date.parse(cancellationProof.confirmedAt)<=5000;
    if (executionAllowed() !== true&&!cancellationRead) throw new Error("Phone acquisition gate is closed");
    const account = process.env.TWILIO_ACCOUNT_SID, user = process.env.TWILIO_API_KEY || account, password = process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
    if (!/^AC[a-f0-9]{32}$/i.test(account || "") || !user || !password) throw new Error("Phone provider credentials unavailable");
    const base = pricing ? "https://pricing.twilio.com/v1/" : `https://api.twilio.com/2010-04-01/Accounts/${account}/`;
    const remaining = Math.min(5000, deadline - Date.now(), deadlineAt === null ? Infinity : deadlineAt - Date.now()); if (remaining <= 0) throw new Error("Phone operation deadline reached");
    if(binding && binding!==managedResourceAccountHash()) throw new Error('Phone resource belongs to another provider account');
    if(admission)assertManagedResourceDispatchPolicy(admission);
    const response = await fetch(base + path, { method, headers: { Authorization: "Basic " + Buffer.from(`${user}:${password}`).toString("base64"), ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      ...(body ? { body: new URLSearchParams(body).toString() } : {}), signal: AbortSignal.timeout(remaining), redirect: "error" });
    if (response.status === 204) return { status: 204, data: null, requestId: response.headers.get("twilio-request-id") };
    if (response.status === 404) return { status: 404, data: null };
    if (!response.ok) throw new Error("Phone provider request unavailable");
    return { status: response.status, data: await response.json(), requestId: response.headers.get("twilio-request-id") };
  }
  const receipt = (row, correlationId, price, requestId = null) => {
    if (row?.account_sid !== process.env.TWILIO_ACCOUNT_SID || row.friendly_name !== label(correlationId) || !sidValid(row.sid) || !/^\+1\d{10}$/.test(row.phone_number || "")) throw new Error("Phone resource correlation mismatch");
    return { id: row.sid, number: row.phone_number, correlationId, requestId, quotedMonthlyCents: price ?? null, currency: "USD" };
  };
  return {
    async acquire({ intentId, correlationId, offer, attemptToken, authorizeDispatch }) {
      const deadline = Date.now() + 15000;
      // Twilio exposes account-specific country/type pricing; the number-create
      // response has no charged-amount receipt or conditional price parameter.
      const price = (await request("PhoneNumbers/Countries/US", "GET", null, true, deadline)).data;
      const local = price?.phone_number_prices?.find(row => row.number_type === "local"), monthly = cents(local?.current_price);
      if (price.price_unit !== "USD" || monthly > offer.monthlyCents || monthly > offer.maxAcquisitionCents || offer.oneTimeCents !== 0) throw new Error("Phone quote is no longer valid");
      const query = new URLSearchParams({ AreaCode: offer.areaCode, VoiceEnabled: "true", SmsEnabled: "true", ExcludeAllAddressRequired: "true", PageSize: "1" });
      const available = (await request("AvailablePhoneNumbers/US/Local.json?" + query, "GET", null, false, deadline)).data?.available_phone_numbers?.[0];
      if (!/^\+1\d{10}$/.test(available?.phone_number || "") || !capability(available.capabilities,['voice','Voice']) || !capability(available.capabilities,['sms','SMS']) || available.address_requirements !== "none") throw new Error("No eligible phone number available");
      const fields={ PhoneNumber: available.phone_number, FriendlyName: label(correlationId) }, input={kind:'number',operationId:intentId,correlationId,offer,claimToken:attemptToken,quotedMonthlyCents:monthly,payload:{path:'IncomingPhoneNumbers.json',fields}};
      let admission;
      try { admission=await reserveManagedResource(input); }
      catch(error) { throw error instanceof ManagedResourceAdmissionError?error:new ManagedResourceAdmissionError('resource_admission_unavailable'); }
      if (typeof authorizeDispatch !== "function" || !await authorizeDispatch()) { const error = new Error("The phone request is no longer authorized"); error.code = "dispatch_not_authorized"; throw error; }
      try { await assertManagedResourceReservation(input,admission); }
      catch(error) { throw error instanceof ManagedResourceAdmissionError?error:new ManagedResourceAdmissionError('resource_admission_unavailable'); }
      const created = await request("IncomingPhoneNumbers.json", "POST", fields, false, deadline, admission.providerAccountHash, admission);
      return receipt(created.data, correlationId, monthly, created.requestId);
    },
    async lookup({ intentId, correlationId, resourceId, purchaseStartedAt, lookupToken }) {
      const binding=await managedResourceAccountBinding('number',intentId);
      let cancellationProof=null;
      if(executionAllowed()!==true&&!resourceId) {
        cancellationProof=await managedNumberPreDispatchProof({operationId:intentId,correlationId,purchaseStartedAt,lookupToken});
        if(cancellationProof?.outcome!=='cancel')throw new Error('Phone acquisition gate is closed');
      }
      if (resourceId) {
        if (!sidValid(resourceId)) throw new Error("Invalid phone resource receipt");
        const found = await request(`IncomingPhoneNumbers/${resourceId}.json`,'GET',null,false,Date.now()+5000,binding);
        if (found.status === 404) return { status: "absent", definitive: true };
        return { status: "found", resource: receipt(found.data, correlationId) };
      }
      const found = (await request("IncomingPhoneNumbers.json?" + new URLSearchParams({ FriendlyName: label(correlationId), PageSize: "100" }),'GET',null,false,Date.now()+5000,binding,null,cancellationProof)).data;
      if(!Array.isArray(found?.incoming_phone_numbers))return {status:'unknown',reasonCode:'resource_not_confirmed'};
      const matches = found.incoming_phone_numbers.filter(row => row.friendly_name === label(correlationId));
      // FriendlyName is a correlation aid, not a uniqueness/idempotency promise.
      // Pagination or no match cannot establish the absence of a timed-out create.
      if(found.next_page_uri===null&&found.incoming_phone_numbers.length===0&&intentId) {
        const proof=await managedNumberPreDispatchProof({operationId:intentId,correlationId,purchaseStartedAt,lookupToken});
        if(proof)return {status:'not_dispatched',definitive:true,proof};
      }
      if (found?.next_page_uri !== null || matches.length !== 1) return { status: "unknown", reasonCode: matches.length > 1 ? "multiple_correlated_resources" : "resource_not_confirmed" };
      return { status: "found", resource: receipt(matches[0], correlationId) };
    },
    async release({ intentId, correlationId, resourceId }) {
      const binding=await managedResourceAccountBinding('number',intentId);
      const deadline = Date.now() + 15000;
      if (!sidValid(resourceId)) throw new Error("Invalid phone resource receipt");
      const before = await request(`IncomingPhoneNumbers/${resourceId}.json`, "GET", null, false, deadline,binding);
      if (before.status === 404) return { confirmed: true, resourceId };
      receipt(before.data, correlationId);
      await request(`IncomingPhoneNumbers/${resourceId}.json`, "DELETE", null, false, deadline,binding);
      const after = await request(`IncomingPhoneNumbers/${resourceId}.json`, "GET", null, false, deadline,binding);
      return { confirmed: after.status === 404, resourceId };
    },
  };
}
