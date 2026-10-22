import { handleManagedVapiWebhook } from "./lib/voice-activation.mjs";
import { dispatchManagedVoiceTool } from "./lib/managed-actions.mjs";
export const config = { path: "/api/managed-vapi" };
export default req => handleManagedVapiWebhook(req, { dispatchTool: dispatchManagedVoiceTool });
