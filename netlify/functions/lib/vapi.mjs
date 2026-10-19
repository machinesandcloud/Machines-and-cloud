// Phone answering through Vapi: one assistant per client with our prompt and our two tools, and the
// client's Twilio number imported so Vapi answers the calls (our SMS webhook stays ours).
// Needs VAPI_API_KEY plus the Twilio keys. Optional: VAPI_MODEL (default claude-sonnet-5),
// VAPI_VOICE_PROVIDER and VAPI_VOICE_ID.
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER } from "./config.mjs";

const KEY = process.env.VAPI_API_KEY;
export const vapiEnabled = () => Boolean(KEY && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
const MODEL = process.env.VAPI_MODEL || "claude-sonnet-5";

async function vapi(path, body, method = "POST") {
  const res = await fetch("https://api.vapi.ai" + path, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`vapi ${path}: ${d.message || d.error || res.status}`);
  return d;
}

function toolDef(t, serverUrl) {
  const { additionalProperties, ...params } = t.input_schema;
  return { type: "function", async: false, function: { name: t.name, description: t.description, parameters: params }, server: { url: serverUrl, timeoutSeconds: 20 } };
}

export function voicePrompt(client) {
  return buildSystemPrompt(client, "voice") + `

You are on a phone call. Speak in short, natural sentences, one idea at a time. Never read URLs, reference codes, or markdown aloud. Confirm phone numbers and addresses back to the caller digit by digit before booking. If the caller asks for a person, say ${client.owner?.name || "the owner"} will call them back and take their number. When the caller is done, say goodbye and end the call.`;
}

export async function provisionVoice(client, site) {
  const serverUrl = `${site}/api/vapi`;
  const tools = [];
  for (const t of [BOOK_VISIT, NOTIFY_OWNER]) tools.push((await vapi("/tool", toolDef(t, serverUrl))).id);
  const first = client.business?.spanish
    ? `Thanks for calling ${client.business.name}. This is the front desk assistant. How can I help you today? Si prefiere español, dígamelo.`
    : `Thanks for calling ${client.business.name}. This is the front desk assistant. How can I help you today?`;
  const assistant = await vapi("/assistant", {
    name: `${client.business.name} front desk (${client.slug})`,
    firstMessage: first,
    firstMessageMode: "assistant-speaks-first",
    model: { provider: "anthropic", model: MODEL, temperature: 0.3, maxTokens: 300, messages: [{ role: "system", content: voicePrompt(client) }], toolIds: tools },
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
  return { assistantId: assistant.id, toolIds: tools, phoneNumberId };
}

export async function updateVoicePrompt(client) {
  if (!vapiEnabled() || !client.voice?.assistantId) return;
  await vapi(`/assistant/${client.voice.assistantId}`, { model: { provider: "anthropic", model: MODEL, temperature: 0.3, maxTokens: 300, messages: [{ role: "system", content: voicePrompt(client) }], toolIds: client.voice.toolIds || [] } }, "PATCH");
}
