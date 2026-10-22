import { handleManagedSMS } from "./lib/managed-sms.mjs";
export const config = { path: ["/api/managed-sms", "/api/managed-sms/status"] };
export default handleManagedSMS;
