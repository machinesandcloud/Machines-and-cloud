import { handleManagedVoiceWebhook } from "./lib/voice-activation.mjs";
export const config = { path: "/api/managed-voice" };
export default handleManagedVoiceWebhook;
