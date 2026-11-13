// Revision 2: reads every event (QA: the newest-2000 cap missed old VIP recordings) and labels owner-alert
// routing like notifyOwner. Read-only census of what still depends on the retired legacy paths (P1 shared sender, P3 VIP
// recordings, P7 plaintext Calendar tokens). It never writes, sends or calls a provider.
// Offline demo:  node legacy-census.mjs --repo <tree> --fixture        (memory store, seeded examples)
// Production:    run with the site's Netlify Blobs context (NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN or
//                inside `netlify functions:invoke`), without --fixture. That is a provider READ and
//                needs the owner's go-ahead; it is not run by this proposal.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const REPO = resolve(arg("--repo") || "."), fixture = process.argv.includes("--fixture");
if (fixture) process.env.MC_MEMORY_STORE = "1";
const store = await import(pathToFileURL(join(REPO, "netlify/functions/lib/store.mjs")).href);
if (fixture) {
  await store.put("clients", "legacy-bridge", { slug: "legacy-bridge", status: "live", business: { name: "Old Shop" }, owner: { email: "o@example.test", phone: "+17135550901" }, phone: { twilioNumber: "+17135550902", tenDlc: "brand_pending" }, rules: { bypass: ["+17135550903"] }, calendar: { provider: "google", google: { refreshToken: "plaintext" } } });
  await store.put("clients", "legacy-own", { slug: "legacy-own", status: "live", business: { name: "Own Sender" }, owner: { phone: "+17135550904" }, phone: { twilioNumber: "+17135550905", tenDlc: "approved" } });
  await store.put("clients", "managed-one", { slug: "managed-one", status: "live", onboarding: { version: 1 }, business: { name: "Managed" }, owner: { email: "m@example.test" } });
  await store.put("index", "bridge:+17135550906", "legacy-bridge");
  await store.put("events", "legacy-bridge/e1", { type: "vip_voicemail", data: { sid: "RE" + "0".repeat(32) } });
}
const rows = [], bridgeKeys = await store.list("index", "bridge:"), bridgeBySlug = {};
for (const k of bridgeKeys) { const s = await store.get("index", k); bridgeBySlug[s] = (bridgeBySlug[s] || 0) + 1; }
for (const key of await store.list("clients", "")) {
  const c = await store.get("clients", key); if (!c || Object.hasOwn(c, "onboarding")) continue;
  const events = await store.listJSON("events", c.slug + "/", Infinity); // QA: every event, so old VIP recordings are counted
  rows.push({ slug: c.slug, status: c.status, sender: c.phone?.twilioNumber && c.phone?.tenDlc === "approved" ? "own_approved" : "none_after_P1",
    ownerEmail: !!c.owner?.email, ownerPhone: !!c.owner?.phone, ownerAlertsAfterP1: [c.phone?.twilioNumber && c.phone?.tenDlc === "approved" && c.owner?.phone ? "text" : "", c.owner?.email ? "email" : ""].filter(Boolean).join("+") || "operator_email",
    bridgeContacts: bridgeBySlug[c.slug] || 0, vipNumbers: (c.rules?.bypass || []).length, vipRecordings: events.filter(e => e.type === "vip_voicemail" && e.data?.sid).length,
    plaintextCalendarToken: !!c.calendar?.google?.refreshToken });
}
const summary = { legacyShops: rows.length, active: rows.filter(r => ["live", "testing"].includes(r.status)).length, dependOnSharedSender: rows.filter(r => r.sender === "none_after_P1").length,
  ownerAlertsOperatorOnly: rows.filter(r => r.ownerAlertsAfterP1 === "operator_email").length, bridgeIndexKeys: bridgeKeys.length, vipRecordingsToDelete: rows.reduce((s, r) => s + r.vipRecordings, 0), plaintextCalendarTokens: rows.filter(r => r.plaintextCalendarToken).length };
console.log(JSON.stringify({ mode: fixture ? "offline fixture (memory store)" : "configured store (read-only)", summary, rows }, null, 1));
