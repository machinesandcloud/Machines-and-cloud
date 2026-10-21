// Steve's one-time setup, checked: reads .env (gitignored) at the repo root, verifies each key with one
// cheap call to its provider, and prints what is missing with the console path to fix it. Nothing is written
// anywhere and nothing touches Netlify. Run: node scripts/setup-check.mjs
import { readFileSync, existsSync } from "node:fs";
const root = new URL("../", import.meta.url).pathname;
const env = {};
if (existsSync(root + ".env")) for (const line of readFileSync(root + ".env", "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const E = (k) => process.env[k] || env[k] || "";
const rows = [];
const add = (name, status, note, fix) => rows.push({ name, status, note, fix });
const b64 = (s) => Buffer.from(s).toString("base64");
const get = async (url, headers = {}) => { const r = await fetch(url, { headers }); let d = null; try { d = await r.json(); } catch { d = await r.text().catch(() => ""); } return { ok: r.ok, status: r.status, d }; };
const twAuth = () => ({ Authorization: "Basic " + b64(`${E("TWILIO_ACCOUNT_SID")}:${E("TWILIO_AUTH_TOKEN")}`) });
const FIX = {
  twilio: "Twilio console, Account, API keys and tokens: copy the Account SID and Auth Token into .env and into Netlify (site env vars, Functions scope).",
  profile: "Twilio console, Trust Hub, Customer Profiles: create the Primary Customer Profile as ISV Reseller or Partner, submit, and copy its SID (BU...) once approved.",
  number: "Twilio console, Phone Numbers, Buy a number: one local Houston number for the bridge sender; put it in .env as MC_TWILIO_NUMBER (E.164).",
  service: "Twilio console, Messaging, Services: create a Messaging Service with the bridge number attached; under Opt-Out Management add ALTO and PARAR (opt-out) and EMPEZAR (opt-in); copy its SID (MG...).",
  campaign: "Twilio console, Messaging, Regulatory compliance: register the Machines & Cloud brand and a campaign on the Messaging Service (mixed use case, our policy page URLs). This is the long pole: 1 to 2 weeks typical, up to 6.",
  vapi: "Vapi dashboard, Settings, API keys: create a private key; put it in .env as VAPI_API_KEY and in Netlify.",
  vapiSecret: "Vapi dashboard, Settings, Server URL secret: set any long random string; put the same value in .env and Netlify as VAPI_WEBHOOK_SECRET.",
  resend: "Resend dashboard, API keys: create a key; Domains: add machinesandcloud.com and set the DNS records it shows until it reads Verified.",
  google: "Google Cloud console, APIs and services, Credentials: an OAuth client (web) with redirect URI https://machinesandcloud.com/api/google/callback; copy the client id and secret.",
  anthropic: "Anthropic console, API keys: create a key; put it in .env (local tests) and confirm it is set at the Netlify team level.",
  binVoice: "Twilio console, Developer tools, TwiML Bins: create a bin named 'Front desk voice fallback' with exactly: <Response>{{#cell}}<Dial timeout=\"25\">{{cell}}</Dial>{{/cell}}<Say voice=\"Polly.Joanna\">We are having trouble connecting right now. Please call back in a few minutes.</Say></Response> and copy its URL (https://handler.twilio.com/twiml/EH...).",
  binSms: "Twilio console, TwiML Bins: a second bin 'Front desk SMS fallback' with <Response><Message>We got your text and will reply shortly.</Message></Response>; copy its URL.",
  debugger: "Twilio console, Monitor, Alerts: webhook https://machinesandcloud.com/api/twilio-alert and email alerts on.",
  steve: "In .env and Netlify: STEVE_PHONE (E.164) and STEVE_EMAIL; ADMIN_KEY (already in Netlify, copy it from there).",
  spanish: "Have a Spanish speaker you trust read the Spanish texts in netlify/functions/lib/desk.mjs (TEMPLATES_ES and STRINGS.es); then set SPANISH_REVIEWED_ON=YYYY-MM-DD.",
};
async function main() {
  // Anthropic
  if (!E("ANTHROPIC_API_KEY")) add("Anthropic key", "missing", "", FIX.anthropic);
  else { const r = await get("https://api.anthropic.com/v1/models?limit=1", { "x-api-key": E("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" }); add("Anthropic key", r.ok ? "ok" : "invalid", r.ok ? "" : `${r.status}`, r.ok ? "" : FIX.anthropic); }
  // Twilio account
  let twOk = false;
  if (!E("TWILIO_ACCOUNT_SID") || !E("TWILIO_AUTH_TOKEN")) add("Twilio keys", "missing", "", FIX.twilio);
  else { const r = await get(`https://api.twilio.com/2010-04-01/Accounts/${E("TWILIO_ACCOUNT_SID")}.json`, twAuth()); twOk = r.ok; add("Twilio keys", r.ok ? "ok" : "invalid", r.ok ? `${r.d.friendly_name} (${r.d.status})` : `${r.status}`, r.ok ? "" : FIX.twilio); }
  if (twOk) {
    if (!E("TWILIO_PRIMARY_PROFILE_SID")) add("Primary Customer Profile (ISV)", "missing", "", FIX.profile);
    else { const r = await get(`https://trusthub.twilio.com/v1/CustomerProfiles/${E("TWILIO_PRIMARY_PROFILE_SID")}`, twAuth()); add("Primary Customer Profile (ISV)", r.ok ? (r.d.status === "twilio-approved" ? "ok" : "pending") : "invalid", r.ok ? `status ${r.d.status}` : `${r.status}`, r.ok && r.d.status === "twilio-approved" ? "" : FIX.profile); }
    if (!E("MC_TWILIO_NUMBER")) add("Bridge number", "missing", "", FIX.number);
    else { const r = await get(`https://api.twilio.com/2010-04-01/Accounts/${E("TWILIO_ACCOUNT_SID")}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(E("MC_TWILIO_NUMBER"))}`, twAuth()); const n = r.ok && r.d.incoming_phone_numbers?.[0]; add("Bridge number", n ? "ok" : "not on this account", n ? `${n.phone_number} voice -> ${n.voice_url || "(none)"}; sms -> ${n.sms_url || "(none)"}; fallbacks ${n.voice_fallback_url ? "set" : "not set"}` : "", n ? "" : FIX.number); }
    if (!E("MC_MESSAGING_SERVICE_SID")) add("Messaging Service", "missing", "", FIX.service);
    else {
      const r = await get(`https://messaging.twilio.com/v1/Services/${E("MC_MESSAGING_SERVICE_SID")}`, twAuth()); add("Messaging Service", r.ok ? "ok" : "invalid", r.ok ? r.d.friendly_name : `${r.status}`, r.ok ? "" : FIX.service);
      if (r.ok) { const c = await get(`https://messaging.twilio.com/v1/Services/${E("MC_MESSAGING_SERVICE_SID")}/Compliance/Usa2p`, twAuth()); const camp = c.ok && c.d.compliance?.[0]; add("Bridge-sender 10DLC campaign (the long pole)", camp ? (camp.campaign_status === "VERIFIED" ? "ok" : "pending") : "not filed", camp ? `status ${camp.campaign_status}` : "", camp && camp.campaign_status === "VERIFIED" ? "" : FIX.campaign); }
    }
  }
  // Vapi
  if (!E("VAPI_API_KEY")) add("Vapi key", "missing", "", FIX.vapi);
  else { const r = await get("https://api.vapi.ai/assistant?limit=1", { Authorization: `Bearer ${E("VAPI_API_KEY")}` }); add("Vapi key", r.ok ? "ok" : "invalid", r.ok ? "" : `${r.status}`, r.ok ? "" : FIX.vapi); }
  add("Vapi webhook secret", E("VAPI_WEBHOOK_SECRET") ? "ok" : "missing", "", E("VAPI_WEBHOOK_SECRET") ? "" : FIX.vapiSecret);
  // Resend
  if (!E("RESEND_API_KEY")) add("Resend key and domain", "missing", "", FIX.resend);
  else { const r = await get("https://api.resend.com/domains", { Authorization: `Bearer ${E("RESEND_API_KEY")}` }); const dom = r.ok && (r.d.data || []).find((d) => /machinesandcloud/.test(d.name)); add("Resend key and domain", r.ok ? (dom?.status === "verified" ? "ok" : "domain not verified") : "invalid", r.ok ? (dom ? `${dom.name} ${dom.status}` : "no machinesandcloud.com domain") : `${r.status}`, r.ok && dom?.status === "verified" ? "" : FIX.resend); }
  // Google
  add("Google OAuth client", E("GOOGLE_CLIENT_ID") && E("GOOGLE_CLIENT_SECRET") ? "ok" : "missing", "", E("GOOGLE_CLIENT_ID") && E("GOOGLE_CLIENT_SECRET") ? "" : FIX.google);
  // TwiML bins
  for (const [k, label, must, fix] of [["VOICE_FALLBACK_TWIML_URL", "Voice fallback bin", "{{#cell}}", FIX.binVoice], ["SMS_FALLBACK_TWIML_URL", "SMS fallback bin", "<Message>", FIX.binSms]]) {
    if (!E(k)) { add(label, "missing", "", fix); continue; }
    const r = await fetch(E(k), { method: "POST" }).then(async (x) => ({ ok: x.ok, text: await x.text() })).catch(() => ({ ok: false, text: "" }));
    add(label, r.ok && r.text.includes(must) ? "ok" : "wrong content", r.ok ? r.text.replace(/\s+/g, " ").slice(0, 80) : "unreachable", r.ok && r.text.includes(must) ? "" : fix);
  }
  add("Debugger webhook and email alerts", "check in console", "cannot be read by API", FIX.debugger);
  add("Steve's phone, email, admin key", E("STEVE_PHONE") && E("STEVE_EMAIL") && E("ADMIN_KEY") ? "ok" : "missing", [!E("STEVE_PHONE") && "STEVE_PHONE", !E("STEVE_EMAIL") && "STEVE_EMAIL", !E("ADMIN_KEY") && "ADMIN_KEY"].filter(Boolean).join(", "), E("STEVE_PHONE") && E("STEVE_EMAIL") && E("ADMIN_KEY") ? "" : FIX.steve);
  add("Spanish texts reviewed", E("SPANISH_REVIEWED_ON") ? "ok" : "pending", E("SPANISH_REVIEWED_ON"), E("SPANISH_REVIEWED_ON") ? "" : FIX.spanish);
  const w = Math.max(...rows.map((r) => r.name.length));
  console.log("\nMachines & Cloud setup check (" + new Date().toISOString().slice(0, 10) + ")\n");
  for (const r of rows) console.log(`${r.status === "ok" ? "OK     " : r.status === "pending" || r.status === "check in console" ? "WAIT   " : "TODO   "} ${r.name.padEnd(w)}  ${r.status}${r.note ? "  (" + r.note + ")" : ""}`);
  const todo = rows.filter((r) => r.status !== "ok");
  if (todo.length) { console.log("\nNext actions, in order:\n"); let i = 1; for (const r of todo) if (r.fix) console.log(`${i++}. ${r.name}: ${r.fix}\n`); }
  else console.log("\nEverything is set. Mirror .env into Netlify (site env vars, Functions scope), then run the keyed pass (product/SPRINT2.md S2-01).");
  console.log("Remember: every value here must also be set in Netlify for production; .env is only for local runs and this check.");
}
main().catch((e) => { console.error("setup check failed:", e.message); process.exit(1); });
