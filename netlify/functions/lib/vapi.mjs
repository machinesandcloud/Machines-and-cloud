// Phone answering through Vapi: one assistant per client with our prompt and our tools, and the
// client's Twilio number imported so Vapi answers the calls (our SMS webhook stays ours).
// Needs VAPI_API_KEY plus the Twilio keys. Optional: VAPI_MODEL (default claude-sonnet-5),
// VAPI_VOICE_PROVIDER and VAPI_VOICE_ID. Field names follow the Vapi docs as of 2026-10 and are
// expected to need small fixes on the first real run (see product/DECISIONS.md).
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, loopCheck } from "./config.mjs";
import { getNumber, setNumberWebhooks, twilioEnabled } from "./twilio.mjs";
import { logEvent } from "./store.mjs";

const KEY = process.env.VAPI_API_KEY;
export const vapiEnabled = () => Boolean(KEY && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
const MODEL = process.env.VAPI_MODEL || "claude-sonnet-5";

async function vapi(path, body, method = "POST") {
  const res = await fetch("https://api.vapi.ai" + path, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return {};
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`vapi ${path}: ${d.message || d.error || res.status}`);
  return d;
}

function toolDef(t, serverUrl) {
  const { additionalProperties, ...params } = t.input_schema;
  return { type: "function", async: false, function: { name: t.name, description: t.description, parameters: params }, server: { url: serverUrl, timeoutSeconds: 20 } };
}

function transferDef(client) {
  const target = client.phone?.transferTo;
  const owner = client.owner?.name || "the owner";
  return {
    type: "transferCall",
    destinations: [{
      type: "number", number: target, message: `Connecting you to ${owner} now.`,
      transferPlan: { mode: "warm-transfer-say-summary", summaryPlan: { enabled: true, messages: [{ role: "system", content: "Summarize the caller's name, callback number, address, issue, and urgency in two sentences for the owner." }] }, timeout: 25 },
    }],
  };
}

export function voicePrompt(client) {
  const owner = client.owner?.name || "the owner";
  const r = client.rules || {};
  const window = `${r.callbackHours || "within 30 minutes"} during business hours or ${r.callbackAfterHours || "by 8 am tomorrow"} after hours`;
  const allCalls = client.phone?.forwarding === "all" && !!client.phone?.transferTo && !loopCheck(client);
  const person = allCalls
    ? `If the caller asks for a person, the owner, or anything on the handoff list, say you will connect them and call transferCall. If the transfer fails or nobody answers, say ${owner} will call them ${window}, take their number, and call notify_owner with reason wants_call.`
    : `If the caller asks for a person or the owner, say you are the front desk assistant, say ${owner} will call them ${window}, take their number, and call notify_owner with reason wants_call. Never say "someone will call you back" without the window.`;
  return buildSystemPrompt(client, "voice") + `

You are on a phone call. Speak in short, natural sentences, one idea at a time. Never read URLs, reference codes, or markdown aloud. Confirm phone numbers and addresses back to the caller digit by digit before booking. ${person} When the caller is done, say goodbye and end the call.`;
}

function modelBlock(client, toolIds) {
  return { provider: "anthropic", model: MODEL, temperature: 0.3, maxTokens: 300, messages: [{ role: "system", content: voicePrompt(client) }], toolIds };
}

export async function provisionVoice(client, site) {
  const serverUrl = `${site}/api/vapi`;
  const toolIds = [];
  for (const t of [BOOK_VISIT, NOTIFY_OWNER]) toolIds.push((await vapi("/tool", toolDef(t, serverUrl))).id);
  let transferToolId = null;
  if (client.phone?.forwarding === "all" && client.phone?.transferTo && !loopCheck(client)) { transferToolId = (await vapi("/tool", transferDef(client))).id; toolIds.push(transferToolId); }
  const first = client.business?.spanish
    ? `Thanks for calling ${client.business.name}. This is the front desk assistant. How can I help you today? Si prefiere español, dígamelo.`
    : `Thanks for calling ${client.business.name}. This is the front desk assistant. How can I help you today?`;
  const assistant = await vapi("/assistant", {
    name: `${client.business.name} front desk (${client.slug})`,
    firstMessage: first,
    firstMessageMode: "assistant-speaks-first",
    model: modelBlock(client, toolIds),
    transcriber: { provider: "deepgram", model: "nova-3", language: client.business?.spanish ? "multi" : "en" },
    ...(process.env.VAPI_VOICE_PROVIDER && process.env.VAPI_VOICE_ID ? { voice: { provider: process.env.VAPI_VOICE_PROVIDER, voiceId: process.env.VAPI_VOICE_ID } } : {}),
    server: { url: serverUrl, timeoutSeconds: 20 },
    serverMessages: ["tool-calls", "end-of-call-report"],
    endCallMessage: "Thanks for calling. Goodbye.",
    metadata: { slug: client.slug },
  });
  let phoneNumberId = null;
  if (client.phone?.twilioNumber) {
    const pn = await vapi("/phone-number", { provider: "twilio", number: client.phone.twilioNumber, twilioAccountSid: process.env.TWILIO_ACCOUNT_SID, twilioAuthToken: process.env.TWILIO_AUTH_TOKEN, assistantId: assistant.id, smsEnabled: false, name: `${client.business.name} (${client.slug})`, server: { url: serverUrl } });
    phoneNumberId = pn.id;
  }
  return { assistantId: assistant.id, toolIds, functionToolIds: toolIds.filter((id) => id !== transferToolId), transferToolId, phoneNumberId };
}

// Keeps the assistant's prompt and tools in step with the config after the owner edits it.
export async function updateVoicePrompt(client) {
  if (!vapiEnabled() || !client.voice?.assistantId) return;
  const site = process.env.URL || "https://machinesandcloud.com";
  const serverUrl = `${site}/api/vapi`;
  const fn = client.voice.functionToolIds || client.voice.toolIds || [];
  const defs = [BOOK_VISIT, NOTIFY_OWNER];
  for (let i = 0; i < fn.length && i < defs.length; i++) { try { await vapi(`/tool/${fn[i]}`, toolDef(defs[i], serverUrl), "PATCH"); } catch (e) { console.error("tool patch", e); } }
  const wantTransfer = client.phone?.forwarding === "all" && !!client.phone?.transferTo && !loopCheck(client);
  let transferToolId = client.voice.transferToolId || null;
  if (wantTransfer && !transferToolId) transferToolId = (await vapi("/tool", transferDef(client))).id;
  else if (wantTransfer && transferToolId) { try { await vapi(`/tool/${transferToolId}`, transferDef(client), "PATCH"); } catch (e) { console.error("transfer patch", e); } }
  else if (!wantTransfer && transferToolId) { try { await vapi(`/tool/${transferToolId}`, null, "DELETE"); } catch (e) { /* ignore */ } transferToolId = null; }
  const toolIds = [...fn, ...(transferToolId ? [transferToolId] : [])];
  await vapi(`/assistant/${client.voice.assistantId}`, { model: modelBlock(client, toolIds) }, "PATCH");
  client.voice.transferToolId = transferToolId; client.voice.toolIds = toolIds; client.voice.functionToolIds = fn;
}

// Pause: point the number's voice webhook back at us so the fallback plays instead of the assistant.
export async function detachVoice(client, site) {
  if (!client.voice?.assistantId) return;
  if (!twilioEnabled() || !client.phone?.twilioNumberSid) { await logEvent(client.slug, "voice_detach_skipped", {}); return; }
  try {
    const n = await getNumber(client.phone.twilioNumberSid);
    if (n.voice_url && !n.voice_url.includes("/api/voice")) client.voice.vapiVoiceUrl = n.voice_url;
    await setNumberWebhooks(client.phone.twilioNumberSid, { voiceUrl: `${site}/api/voice`, smsUrl: `${site}/api/sms` });
    client.voice.detached = true;
    await logEvent(client.slug, "voice_detached", {});
  } catch (err) { await logEvent(client.slug, "voice_detach_failed", { error: String(err.message).slice(0, 200) }); }
}

export async function attachVoice(client, site) {
  if (!client.voice?.detached) return;
  if (!twilioEnabled() || !client.phone?.twilioNumberSid) { await logEvent(client.slug, "voice_attach_skipped", {}); return; }
  try {
    if (client.voice.vapiVoiceUrl) await setNumberWebhooks(client.phone.twilioNumberSid, { voiceUrl: client.voice.vapiVoiceUrl, smsUrl: `${site}/api/sms` });
    else if (vapiEnabled() && client.phone.twilioNumber) {
      const pn = await vapi("/phone-number", { provider: "twilio", number: client.phone.twilioNumber, twilioAccountSid: process.env.TWILIO_ACCOUNT_SID, twilioAuthToken: process.env.TWILIO_AUTH_TOKEN, assistantId: client.voice.assistantId, smsEnabled: false, server: { url: `${site}/api/vapi` } });
      client.voice.phoneNumberId = pn.id;
    }
    client.voice.detached = false;
    await logEvent(client.slug, "voice_attached", {});
  } catch (err) { await logEvent(client.slug, "voice_attach_failed", { error: String(err.message).slice(0, 200) }); }
}

export async function releaseVoice(client) {
  if (!KEY) return { skipped: "no key" };
  const out = {};
  if (client.voice?.phoneNumberId) { try { await vapi(`/phone-number/${client.voice.phoneNumberId}`, null, "DELETE"); out.phoneNumber = client.voice.phoneNumberId; } catch (e) { out.phoneNumberError = e.message; } }
  if (client.voice?.assistantId) { try { await vapi(`/assistant/${client.voice.assistantId}`, null, "DELETE"); out.assistant = client.voice.assistantId; } catch (e) { out.assistantError = e.message; } }
  for (const id of client.voice?.toolIds || []) { try { await vapi(`/tool/${id}`, null, "DELETE"); } catch { /* ignore */ } }
  return out;
}
