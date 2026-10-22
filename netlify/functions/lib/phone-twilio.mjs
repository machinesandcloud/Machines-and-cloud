// Number acquisition only. No routing, assistant, messaging registration or channel activation.
// Every request is made only through the caller's explicit product-wide execution gate.
const sidValid = value => /^PN[a-f0-9]{32}$/i.test(value || "");
const label = correlationId => "mc-phone-" + correlationId.slice(0, 55);
const cents = value => {
  const match = /^(\d{1,5})(?:\.(\d{1,2})(?:0*)?)?$/.exec(String(value));
  if (!match) throw new Error("Unsupported phone price precision");
  return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
};
export function createTwilioNumberAdapter({ executionAllowed, deadlineAt = null }) {
  async function request(path, method = "GET", body, pricing = false, deadline = Date.now() + 5000) {
    if (executionAllowed() !== true) throw new Error("Phone acquisition gate is closed");
    const account = process.env.TWILIO_ACCOUNT_SID, user = process.env.TWILIO_API_KEY || account, password = process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
    if (!/^AC[a-f0-9]{32}$/i.test(account || "") || !user || !password) throw new Error("Phone provider credentials unavailable");
    const base = pricing ? "https://pricing.twilio.com/v1/" : `https://api.twilio.com/2010-04-01/Accounts/${account}/`;
    const remaining = Math.min(5000, deadline - Date.now(), deadlineAt === null ? Infinity : deadlineAt - Date.now()); if (remaining <= 0) throw new Error("Phone operation deadline reached");
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
    async acquire({ correlationId, offer, authorizeDispatch }) {
      const deadline = Date.now() + 15000;
      // Twilio exposes account-specific country/type pricing; the number-create
      // response has no charged-amount receipt or conditional price parameter.
      const price = (await request("PhoneNumbers/Countries/US", "GET", null, true, deadline)).data;
      const local = price?.phone_number_prices?.find(row => row.number_type === "local"), monthly = cents(local?.current_price);
      if (price.price_unit !== "USD" || monthly > offer.monthlyCents || monthly > offer.maxAcquisitionCents || offer.oneTimeCents !== 0) throw new Error("Phone quote is no longer valid");
      const query = new URLSearchParams({ AreaCode: offer.areaCode, VoiceEnabled: "true", SmsEnabled: "true", ExcludeAllAddressRequired: "true", PageSize: "1" });
      const available = (await request("AvailablePhoneNumbers/US/Local.json?" + query, "GET", null, false, deadline)).data?.available_phone_numbers?.[0];
      if (!/^\+1\d{10}$/.test(available?.phone_number || "") || available.capabilities?.voice !== true || available.capabilities?.sms !== true || available.address_requirements !== "none") throw new Error("No eligible phone number available");
      if (typeof authorizeDispatch !== "function" || !await authorizeDispatch()) { const error = new Error("The phone request is no longer authorized"); error.code = "dispatch_not_authorized"; throw error; }
      const created = await request("IncomingPhoneNumbers.json", "POST", { PhoneNumber: available.phone_number, FriendlyName: label(correlationId) }, false, deadline);
      return receipt(created.data, correlationId, monthly, created.requestId);
    },
    async lookup({ correlationId, resourceId }) {
      if (resourceId) {
        if (!sidValid(resourceId)) throw new Error("Invalid phone resource receipt");
        const found = await request(`IncomingPhoneNumbers/${resourceId}.json`);
        if (found.status === 404) return { status: "absent", definitive: true };
        return { status: "found", resource: receipt(found.data, correlationId) };
      }
      const found = (await request("IncomingPhoneNumbers.json?" + new URLSearchParams({ FriendlyName: label(correlationId), PageSize: "100" }))).data;
      const matches = (found?.incoming_phone_numbers || []).filter(row => row.friendly_name === label(correlationId));
      // FriendlyName is a correlation aid, not a uniqueness/idempotency promise.
      // Pagination or no match cannot establish the absence of a timed-out create.
      if (found?.next_page_uri || matches.length !== 1) return { status: "unknown", reasonCode: matches.length > 1 ? "multiple_correlated_resources" : "resource_not_confirmed" };
      return { status: "found", resource: receipt(matches[0], correlationId) };
    },
    async release({ correlationId, resourceId }) {
      const deadline = Date.now() + 15000;
      if (!sidValid(resourceId)) throw new Error("Invalid phone resource receipt");
      const before = await request(`IncomingPhoneNumbers/${resourceId}.json`, "GET", null, false, deadline);
      if (before.status === 404) return { confirmed: true, resourceId };
      receipt(before.data, correlationId);
      await request(`IncomingPhoneNumbers/${resourceId}.json`, "DELETE", null, false, deadline);
      const after = await request(`IncomingPhoneNumbers/${resourceId}.json`, "GET", null, false, deadline);
      return { confirmed: after.status === 404, resourceId };
    },
  };
}
