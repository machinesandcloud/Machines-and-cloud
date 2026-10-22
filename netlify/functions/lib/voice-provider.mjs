// Current Vapi OpenAPI /api-json and Twilio IncomingPhoneNumber APIs, checked 2026-10-22.
// No automatic retry for either Vapi create endpoint: neither documents an
// idempotency key. Correlation plus GET can recover a lost response, never prove
// that a timed-out creation is safe to repeat.
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY } from "./config.mjs";

const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const pn = value => /^PN[a-f0-9]{32}$/i.test(value || "");
const label = (kind, correlation) => `mc-${kind}-${correlation.slice(0, 30)}`;
const includes = (actual, expected) => Array.isArray(expected) ? Array.isArray(actual) && actual.length === expected.length && expected.every((value, i) => includes(actual[i], value)) : expected && typeof expected === "object" ? actual && typeof actual === "object" && Object.entries(expected).every(([key, value]) => includes(actual[key], value)) : actual === expected;
export function managedVoiceServer(site) {
  return { url: site + "/api/managed-vapi", headers: { "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET }, timeoutSeconds: 15, backoffPlan: { type: "fixed", maxRetries: 2, baseDelaySeconds: 1 } };
}
function independentFallback() {
  const url = new URL(process.env.VOICE_FALLBACK_TWIML_URL || "");
  if (url.protocol !== "https:" || url.hostname !== "handler.twilio.com" || !/^\/twiml\/EH[a-f0-9]{32}$/i.test(url.pathname) || url.username || url.password || url.port || url.hash || url.search) throw new Error("Independent voice fallback unavailable");
  return url.href;
}
export function managedAssistantBody(c, { correlationId, inputRevision, policy, site }) {
  const server = managedVoiceServer(site);
  const definitions = [GET_AVAILABILITY, BOOK_VISIT, NOTIFY_OWNER].map(def => ({ type: "function", async: false,
    function: { name: def.name, description: def.name === "book_visit" ? "Reserve an available listed visit after the caller explicitly agrees. Report only the returned status; do not claim an email, text or calendar delivery unless confirmed in the result." : def.name === "notify_owner" ? "Save the caller's request in the owner's workspace. Report only the returned delivery status, without promising a callback deadline." : def.description,
      parameters: structuredClone(def.input_schema) }, server }));
  return { name: label("voice", correlationId), firstMessage: `Thanks for calling ${c.business.name}. This is the front desk assistant.${c.business.spanish ? " Hablamos español." : ""} How can I help?`, firstMessageMode: "assistant-speaks-first",
    model: { provider: "anthropic", model: policy.model, temperature: 0.3, maxTokens: 350, messages: [{ role: "system", content: buildSystemPrompt(c, "voice") + "\nPhone delivery contract: Speak one short natural sentence at a time. Confirm the name, callback phone, address and selected date/window, and ask for agreement before booking. Tool results are authoritative. A workspace record is not proof of a text, email, calendar sync or human callback. Never invent successful delivery or a callback time. If a tool fails, say the request could not be confirmed and ask the caller to contact the shop directly. If asked, say you are an AI front desk assistant." }], tools: definitions },
    transcriber: { provider: "deepgram", model: "nova-3", language: c.business.spanish ? "multi" : "en" },
    ...(policy.voiceProvider && policy.voiceId ? { voice: { provider: policy.voiceProvider, voiceId: policy.voiceId } } : {}),
    maxDurationSeconds: policy.maxDurationSeconds, server, serverMessages: ["tool-calls", "end-of-call-report", "status-update"],
    artifactPlan: { recordingEnabled: false }, metadata: { mcVoiceCorrelation: correlationId, mcVoiceRevision: inputRevision }, endCallMessage: "Thanks for calling. Goodbye." };
}
export function createManagedVoiceProvider({ executionAllowed, deadlineAt = null }) {
  const allowed = () => { if (executionAllowed() !== true) throw new Error("Voice execution is disabled"); };
  async function request(origin, path, method = "GET", body) {
    allowed(); const remaining = Math.min(5000, deadlineAt === null ? Infinity : deadlineAt - Date.now());
    if (remaining <= 0) throw new Error("Voice operation deadline reached");
    const vapi = origin === "vapi", account = process.env.TWILIO_ACCOUNT_SID;
    if (!vapi && !/^AC[a-f0-9]{32}$/i.test(account || "")) throw new Error("Invalid Twilio account");
    const auth = vapi ? `Bearer ${process.env.VAPI_API_KEY || ""}` : "Basic " + Buffer.from(`${process.env.TWILIO_API_KEY || account}:${process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN || ""}`).toString("base64");
    const response = await fetch((vapi ? "https://api.vapi.ai" : `https://api.twilio.com/2010-04-01/Accounts/${account}`) + path, { method, headers: { Authorization: auth, ...(body ? { "Content-Type": vapi ? "application/json" : "application/x-www-form-urlencoded" } : {}) },
      ...(body ? { body: vapi ? JSON.stringify(body) : new URLSearchParams(body).toString() } : {}), signal: AbortSignal.timeout(remaining), redirect: "error" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Voice provider request unavailable");
    return response.status === 204 ? {} : response.json();
  }
  async function authorize(fn) { allowed(); if (typeof fn !== "function" || await fn() !== true) { const err = new Error("Voice dispatch no longer authorized"); err.code = "dispatch_not_authorized"; throw err; } }
  function assistantReceipt(value, args) {
    if (!uuid(value?.id) || value.metadata?.mcVoiceCorrelation !== args.correlationId) throw new Error("Assistant correlation mismatch");
    return { id: value.id, correlationId: args.correlationId, inputRevision: value.metadata?.mcVoiceRevision || null };
  }
  function importedReceipt(value, args) {
    if (!uuid(value?.id) || value.provider !== "twilio" || value.number !== args.number.number || value.twilioAccountSid !== process.env.TWILIO_ACCOUNT_SID || value.name !== label("phone", args.correlationId)) throw new Error("Imported number correlation mismatch");
    // Dynamic resolution is essential: a saved assistantId would bypass the
    // current lifecycle/rule/authority checks for every incoming call.
    if (value.assistantId || value.squadId || value.workflowId || value.fallbackDestination || value.server?.url !== args.site + "/api/managed-vapi" || value.smsEnabled !== false || value.status === "blocked") throw new Error("Imported number routing mismatch");
    return { id: value.id, number: value.number, correlationId: args.correlationId };
  }
  async function lookup(kind, args) {
    const field = kind === "assistant" ? "assistant" : "phone", path = kind === "assistant" ? "/assistant" : "/phone-number", id = args.resourceId;
    if (id && !uuid(id)) throw new Error("Invalid resource receipt");
    const values = await request("vapi", id ? `${path}/${id}` : path + "?limit=1000");
    if (!values) return { status: id ? "absent" : "unknown" };
    if (!id && !Array.isArray(values)) throw new Error("Invalid resource list");
    const found = id ? [values] : values.filter(row => kind === "assistant" ? row.metadata?.mcVoiceCorrelation === args.correlationId : row.name === label("phone", args.correlationId));
    // Exactly one match can recover a create result; missing/paginated lists
    // and duplicate correlations never authorize another POST.
    if (found.length !== 1) return { status: "unknown", reasonCode: found.length > 1 ? "duplicate_correlated_resources" : "resource_unconfirmed" };
    const resource = field === "assistant" ? assistantReceipt(found[0], args) : importedReceipt(found[0], args);
    return { status: "found", resource, current: found[0] };
  }
  async function readTwilioNumber(args) {
    if (!pn(args.number?.id)) throw new Error("Invalid number receipt");
    const value = await request("twilio", `/IncomingPhoneNumbers/${args.number.id}.json`);
    if (!value || value.sid !== args.number.id || value.account_sid !== process.env.TWILIO_ACCOUNT_SID || value.phone_number !== args.number.number) throw new Error("Twilio number ownership mismatch");
    return value;
  }
  function vapiUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "api.vapi.ai" || url.port || url.username || url.password || url.hash || !url.pathname.startsWith("/")) throw new Error("Unexpected Vapi voice callback");
    return url.href;
  }
  async function importedRoute(args) {
    const number = await readTwilioNumber(args);
    if (number.voice_url?.startsWith(args.site + "/api/managed-voice?")) {
      if (!args.savedVapiUrl) throw new Error("Original Vapi callback receipt unavailable");
      return { vapiUrl: vapiUrl(args.savedVapiUrl) };
    }
    if (number.voice_application_sid) {
      if (!/^AP[a-f0-9]{32}$/i.test(number.voice_application_sid)) throw new Error("Invalid TwiML application receipt");
      const app = await request("twilio", `/Applications/${number.voice_application_sid}.json`);
      if (app?.sid !== number.voice_application_sid || app.account_sid !== process.env.TWILIO_ACCOUNT_SID || app.voice_method !== "POST") throw new Error("Invalid TwiML application");
      return { vapiUrl: vapiUrl(app.voice_url), applicationId: app.sid };
    }
    if (number.voice_method !== "POST") throw new Error("Unexpected Vapi callback method");
    return { vapiUrl: vapiUrl(number.voice_url) };
  }
  function routeFields(args) {
    const callback = kind => `${args.site}/api/managed-voice?o=${args.callbackToken}&kind=${kind}`;
    return { VoiceApplicationSid: "", VoiceUrl: callback("inbound"), VoiceMethod: "POST", VoiceFallbackUrl: independentFallback(), VoiceFallbackMethod: "POST", StatusCallback: callback("status"), StatusCallbackMethod: "POST" };
  }
  async function verifyIndependentFallback(args) {
    allowed(); const remaining = Math.min(4000, deadlineAt === null ? Infinity : deadlineAt - Date.now()); if (remaining <= 0) throw new Error("Voice operation deadline reached");
    const response = await fetch(independentFallback(), { method: "GET", signal: AbortSignal.timeout(remaining), redirect: "error" }); if (!response.ok) throw new Error("Independent voice fallback unavailable");
    const value = await response.text();
    // The one-time platform Bin is deliberately tiny. Do not accept arbitrary
    // XML, a redirect, a second destination, or a user-controlled phone number.
    const stripped = value.trim().replace(/^<\?xml[^?]*\?>\s*/, "");
    if (value.length > 2000 || !/^<Response><Say(?: voice="Polly.Joanna")?>[^<>]+<\/Say><\/Response>$/.test(stripped)) throw new Error("Independent fallback content mismatch");
    return true;
  }
  async function verifyRoute(args) {
    const [number, imported] = await Promise.all([readTwilioNumber(args), lookup("phone", { ...args, resourceId: args.phoneNumberId })]);
    const fields = routeFields(args), matches = !number.voice_application_sid && !number.trunk_sid && Object.entries(fields).filter(([key]) => key !== "VoiceApplicationSid").every(([key, value]) => number[key.replace(/[A-Z]/g, (letter, index) => (index ? "_" : "") + letter.toLowerCase())] === value);
    if (!matches || imported.status !== "found") return { confirmed: false, reasonCode: "routing_readback_mismatch" };
    await verifyIndependentFallback(args);
    return { confirmed: true, numberId: number.sid, phoneNumberId: imported.resource.id, vapiUrl: vapiUrl(args.savedVapiUrl), fallbackConfigured: true, checkedAt: new Date().toISOString() };
  }
  return {
    async createAssistant(args) { await authorize(args.authorizeDispatch); return assistantReceipt(await request("vapi", "/assistant", "POST", managedAssistantBody(args.client, args)), args); },
    async lookupAssistant(args) { return lookup("assistant", args); },
    async updateAssistant(args) {
      if (!uuid(args.resourceId)) throw new Error("Invalid assistant receipt");
      const before = await lookup("assistant", args); if (before.status !== "found") throw new Error("Assistant unavailable");
      await authorize(args.authorizeDispatch); const body = managedAssistantBody(args.client, args); return assistantReceipt(await request("vapi", `/assistant/${args.resourceId}`, "PATCH", body), args);
    },
    async verifyAssistant(args) {
      const found = await lookup("assistant", args); if (found.status !== "found") return { confirmed: false };
      const expected = managedAssistantBody(args.client, args), actual = found.current;
      // The saved reference contains the clock at creation; the live transient
      // configuration is rebuilt with the current clock for each call. Compare
      // the approved model/tool/transport contract and owner revision here.
      const { messages: expectedMessages, ...expectedModel } = expected.model;
      return { confirmed: actual.metadata?.mcVoiceRevision === args.inputRevision && includes(actual.model, expectedModel) && includes(actual.server, expected.server) && actual.maxDurationSeconds === expected.maxDurationSeconds, resource: found.resource };
    },
    async importNumber(args) { await authorize(args.authorizeDispatch); return importedReceipt(await request("vapi", "/phone-number", "POST", { provider: "twilio", number: args.number.number, twilioAccountSid: process.env.TWILIO_ACCOUNT_SID, twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      smsEnabled: false, name: label("phone", args.correlationId), server: managedVoiceServer(args.site) }), args); },
    async lookupNumber(args) { return lookup("phone", args); },
    readImportedRoute: importedRoute,
    async configureRouting(args) { const before = await readTwilioNumber(args); if (before.trunk_sid) throw new Error("A SIP trunk owns this number's routing"); await verifyIndependentFallback(args); await authorize(args.authorizeDispatch); await request("twilio", `/IncomingPhoneNumbers/${args.number.id}.json`, "POST", routeFields(args)); const after = await readTwilioNumber(args);
      // Import and routing must never take over the messaging settings.
      if (before.sms_url !== after.sms_url || before.sms_application_sid !== after.sms_application_sid || before.sms_fallback_url !== after.sms_fallback_url) throw new Error("Messaging configuration changed unexpectedly");
      return verifyRoute(args); },
    verifyRouting: verifyRoute,
    async detachRouting(args) {
      await readTwilioNumber(args); await authorize(args.authorizeDispatch);
      const fields = routeFields(args); fields.VoiceUrl = `${args.site}/api/managed-voice?o=${args.callbackToken}&kind=fallback`;
      await request("twilio", `/IncomingPhoneNumbers/${args.number.id}.json`, "POST", fields);
      const after = await readTwilioNumber(args);
      return { confirmed: !after.voice_application_sid && after.voice_url === fields.VoiceUrl && after.voice_method === "POST", numberId: args.number.id };
    },
    async deleteImportedNumber(args) {
      if (!uuid(args.resourceId)) throw new Error("Invalid import receipt");
      const existing = await request("vapi", `/phone-number/${args.resourceId}`);
      if (!existing) return { confirmed: true, resourceId: args.resourceId };
      importedReceipt(existing, args); await authorize(args.authorizeDispatch);
      await request("vapi", `/phone-number/${args.resourceId}`, "DELETE");
      return { confirmed: !await request("vapi", `/phone-number/${args.resourceId}`), resourceId: args.resourceId };
    },
    async deleteAssistant(args) {
      if (!uuid(args.resourceId)) throw new Error("Invalid assistant receipt");
      const existing = await request("vapi", `/assistant/${args.resourceId}`);
      if (!existing) return { confirmed: true, resourceId: args.resourceId };
      assistantReceipt(existing, args); await authorize(args.authorizeDispatch);
      await request("vapi", `/assistant/${args.resourceId}`, "DELETE");
      return { confirmed: !await request("vapi", `/assistant/${args.resourceId}`), resourceId: args.resourceId };
    },
  };
}
