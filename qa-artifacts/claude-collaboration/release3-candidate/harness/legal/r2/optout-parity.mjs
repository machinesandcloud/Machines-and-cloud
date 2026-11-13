// Rev 4: the auto-opt-out decision for every corpus message on the three lines (legacy sms.mjs, managed
// recordManagedInbound, platform /api/platform-sms). Run on unpatched 43ee2f2c to make the golden file and on the
// patched tree to compare: they must be byte-identical. Offline: memory store, fake model, provider doubles only.
// Usage: node optout-parity.mjs --repo <tree> --out <json>
import { createHmac, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";
const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const REPO = resolve(arg("--repo")), OUT = arg("--out"), HERE = fileURLToPath(new URL(".", import.meta.url));
const deny = () => { throw new Error("network denied"); }; net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
const SITE = "https://machinesandcloud.com", ACCOUNT = "AC" + "1".repeat(32), SERVICE = "MG" + "2".repeat(32), MC = "+13464853328", SECRET = "parity-auth-token";
for (const k of Object.keys(process.env)) if (/^(TWILIO_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|MC_|STEVE_|ADMIN_|PHONE_|SERVICE_)/.test(k)) delete process.env[k];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", URL: SITE, PUBLIC_SITE_URL: SITE, ADMIN_KEY: "parity-admin", TWILIO_ACCOUNT_SID: ACCOUNT, TWILIO_AUTH_TOKEN: SECRET, MC_TWILIO_NUMBER: MC, MC_MESSAGING_SERVICE_SID: SERVICE, RESEND_API_KEY: "re_parity", STEVE_EMAIL: "operator@example.test" });
const receipts = new Map(); let serial = 0;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = (init.method || "GET").toUpperCase();
  if (url.origin === "https://api.twilio.com") { const m = url.pathname.match(/\/Messages\/(SM[a-f0-9]{32})\.json$/i); if (method === "GET" && m) { const r = receipts.get(m[1]); return new Response(JSON.stringify(r || {}), { status: r ? 200 : 404 }); } return new Response(JSON.stringify({ sid: "SM" + (++serial).toString(16).padStart(32, "0") }), { status: 201 }); }
  if (url.origin === "https://api.resend.com") return new Response(JSON.stringify({ id: "em" + ++serial }), { status: 200 });
  if (url.origin === SITE) return new Response("ok");
  throw new Error("blocked " + url.origin);
};
// Corpora: this folder's (QA-LEGALPRE 137 + rev-2 held-out + QA r2), QA r2's harness lists and QA r3's fresh corpus.
const mine = JSON.parse(readFileSync(join(HERE, "optout-corpus.json"), "utf8"));
const r2src = readFileSync(join(HERE, "../qa-r2/qa-r2.mjs"), "utf8"), list = name => eval(r2src.slice(r2src.indexOf(`const ${name} = [`) + `const ${name} = `.length, r2src.indexOf("];", r2src.indexOf(`const ${name} = [`)) + 1));
const fresh = JSON.parse(readFileSync(join(HERE, "../qa-r3/fresh-corpus.json"), "utf8"));
const flat = v => Array.isArray(v) ? v.flatMap(flat) : typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(flat) : [];
const texts = [...new Set([...flat(mine.N), ...flat(mine.S_sentence), ...flat(mine.S_line), ...flat(mine.S_bare), ...flat(mine.S_legacy_only || []), ...flat(mine.A), ...list("OPTOUT"), ...list("LOOKALIKE"), ...flat(fresh.S), ...flat(fresh.N)])].sort();
const fn = r => pathToFileURL(join(REPO, "netlify/functions", r)).href;
const store = await import(fn("lib/store.mjs")), { newClient } = await import(fn("lib/config.mjs")), send = await import(fn("lib/send.mjs"));
const sms = (await import(fn("sms.mjs"))).default, mc = await import(fn("lib/managed-consent.mjs")), platform = (await import(fn("platform-sms.mjs"))).default;
const c = newClient({ slug: "parity-legacy", ownerKey: "k", owner: { name: "Dana", email: "owner@example.test", phone: "+17135550111" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Fri 7am-7pm", website: "https://example.test" } });
c.status = "live"; c.phone = { ...(c.phone || {}), twilioNumber: "+17135552001", tenDlc: "approved", messagingServiceSid: "MG" + "3".repeat(32), businessNumber: "+17135559101", forwarding: "busy" };
await store.saveClient(c); await store.indexClient(c);
const managed = { slug: "parity-managed", onboarding: { version: 1 }, tenantId: "t-parity", business: { name: "M" } };
let k = 0; const out = { texts: texts.length, legacy: {}, managed: {}, platform: {} };
for (const t of texts) {
  const n = ++k, phone = (p) => "+1" + p + String(1000000 + n).slice(-7), sid = tag => "SM" + createHash("sha256").update(tag + n).digest("hex").slice(0, 32);
  const lf = phone("832"); await sms(new Request(SITE + "/api/sms", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-admin-key": process.env.ADMIN_KEY }, body: new URLSearchParams({ To: c.phone.twilioNumber, From: lf, Body: t, MessageSid: sid("l") }).toString() }));
  out.legacy[t] = await send.optedOut(lf);
  const r = await mc.recordManagedInbound(managed, { phone: phone("281"), text: t, messageSid: sid("m"), providerDate: new Date().toISOString() }); out.managed[t] = [r.keyword, !!r.suppressed];
  const pf = phone("346"), psid = sid("p"), fields = { AccountSid: ACCOUNT, MessagingServiceSid: SERVICE, To: MC, From: pf, MessageSid: psid, Body: t, NumMedia: "0" };
  receipts.set(psid, { sid: psid, account_sid: ACCOUNT, messaging_service_sid: SERVICE, direction: "inbound", from: pf, to: MC, body: t, date_created: new Date().toUTCString() });
  const signature = createHmac("sha1", SECRET).update(SITE + "/api/platform-sms" + Object.keys(fields).sort().map(x => x + fields[x]).join("")).digest("base64");
  await platform(new Request(SITE + "/api/platform-sms", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": signature }, body: new URLSearchParams(fields).toString() }));
  const ledger = await store.get("platform_sms_messages", "inbound_v1"); out.platform[t] = Object.entries(ledger?.directives || {}).some(([key, v]) => key.endsWith("/" + pf) && v.suppressed);
}
const json = JSON.stringify(out, null, 1);
if (OUT) writeFileSync(OUT, json);
console.log(JSON.stringify({ texts: texts.length, legacyStops: Object.values(out.legacy).filter(Boolean).length, managedStops: Object.values(out.managed).filter(v => v[1]).length, platformStops: Object.values(out.platform).filter(Boolean).length }));
