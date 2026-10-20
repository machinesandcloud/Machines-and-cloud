// Twilio Console Debugger webhook: Twilio posts here when a call or message fails on its side, including the
// errors our code never sees (11200 could not reach the webhook, 11205 timeout, 30034 unregistered sender).
// Registered once in the Twilio console (Monitor, Alerts, Webhook). Logs twilio_error on the shop whose number
// appears in the failing request, which feeds the voice and SMS health alerts.
import { clientByNumber, logEvent } from "./lib/store.mjs";
import { twilioSignatureValid, e164 } from "./lib/send.mjs";

export const config = { path: "/api/twilio-alert" };

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));
  const adminOk = process.env.ADMIN_KEY && req.headers.get("x-admin-key") === process.env.ADMIN_KEY;
  const sigUrl = (process.env.URL || new URL(req.url).origin) + "/api/twilio-alert";
  if (!adminOk && process.env.TWILIO_AUTH_TOKEN && !twilioSignatureValid(sigUrl, params, req.headers.get("x-twilio-signature") || "")) return new Response("bad signature", { status: 403 });
  let payload = {};
  try { payload = JSON.parse(params.Payload || "{}"); } catch { /* keep empty */ }
  const code = String(payload.error_code || params.ErrorCode || "");
  const url = String(payload.webhook?.request?.url || payload.request?.url || "");
  const text = JSON.stringify(payload);
  // The shop: the To or From number anywhere in the failing request.
  const nums = [...new Set((text.match(/\+?1?\d{10,11}/g) || []).map(e164).filter((n) => n.length >= 11))];
  let c = null;
  for (const n of nums) { c = await clientByNumber(n); if (c) break; }
  const isSms = /\/api\/sms|Messages|\/sms\b/i.test(url + text) || /^3\d{4}$/.test(code);
  if (c) await logEvent(c.slug, "twilio_error", { code, kind: isSms ? "sms" : "voice", url: url.slice(0, 200), sid: params.Sid || payload.resource_sid || "", level: params.Level || "" });
  else console.warn("twilio alert for no shop", code, url);
  return new Response("ok");
};
