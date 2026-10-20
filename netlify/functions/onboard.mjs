// Onboarding: POST creates the client from the questionnaire and starts the build job.
// GET ?c=slug&k=key returns build status for the onboarding page to poll.
import { getClient, saveClient, indexClient, clientByEmail, id, secret, logEvent } from "./lib/store.mjs";
import { newClient, ownerView, loopCheck, normalizeEmergencies, normalizeHours, parseHours } from "./lib/config.mjs";
import { notifySteve, sendEmail, e164 } from "./lib/send.mjs";
import { json } from "./lib/agent.mjs";

export const config = { path: "/api/onboard" };

const s = (v, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const arr = (v, n = 40) => (Array.isArray(v) ? v : String(v || "").split(/[\n,;]+/)).map((x) => s(x, 120)).filter(Boolean).slice(0, n);
const lines = (v, n = 40) => (Array.isArray(v) ? v : String(v || "").split(/\n+/)).map((x) => s(x, 300)).filter(Boolean).slice(0, n);

function slugify(name, site) {
  const base = (name || hostOf(site) || "shop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "shop";
  return base + "-" + id(2);
}
function hostOf(u) { try { return new URL(u.startsWith("http") ? u : "https://" + u).hostname.replace(/^www\./, "").split(".")[0]; } catch { return ""; } }

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const c = await getClient(url.searchParams.get("c") || "");
    if (!c || c.ownerKey !== url.searchParams.get("k")) return json({ error: "not_found" }, 404);
    return json({ status: c.status, build: c.build, slug: c.slug });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (s(b.botfield)) return json({ ok: true });
  const email = s(b.email, 120).toLowerCase();
  const website = s(b.website, 200);
  if (!email.includes("@") || !s(b.name) || !website) return json({ error: "missing_fields" }, 400);

  let c = await clientByEmail(email);
  if (!c) {
    c = newClient({ slug: slugify(s(b.business), website), ownerKey: secret(), owner: { name: s(b.name), email, phone: e164(s(b.phone, 30)) }, business: { name: s(b.business, 120), website } });
  }
  const bz = c.business;
  Object.assign(bz, {
    name: s(b.business, 120) || bz.name, website, trade: s(b.trade, 80), city: s(b.city, 80) || "Houston",
    serviceArea: arr(b.serviceArea), notServed: arr(b.notServed), hours: s(b.hours, 300), afterHours: s(b.afterHours, 300),
    spanish: b.spanish !== false && b.spanish !== "no", licenses: s(b.licenses, 200), googlePlaceId: s(b.googlePlaceId, 120), reviewLink: s(b.reviewLink, 300), payLink: s(b.payLink, 300),
  });
  c.owner = { ...c.owner, name: s(b.name) || c.owner.name, phone: e164(s(b.phone, 30)) || c.owner.phone, backupPhone: e164(s(b.backupPhone, 30)) };
  c.plan = ["starter", "growth", "pro"].includes(b.plan) ? b.plan : "growth";
  c.services = lines(b.services, 60);
  c.fees = lines(b.fees, 30).map((line) => { const m = line.match(/^(.*?)[:\-–]\s*(\$?[\d,.]+[^(]*)(?:\((.*)\))?$/); return m ? { label: m[1].trim(), amount: m[2].trim(), note: (m[3] || "").trim() } : { label: line, amount: "", note: "" }; });
  c.windows = lines(b.windows, 8).length ? lines(b.windows, 8) : c.windows;
  c.rules = { ...c.rules, never: lines(b.never, 20).length ? lines(b.never, 20) : c.rules.never, handoff: lines(b.handoff, 20).length ? lines(b.handoff, 20) : c.rules.handoff,
    emergencies: normalizeEmergencies({ ...(b.tier0 !== undefined ? { tier0: b.tier0 } : {}), ...(b.tier1 !== undefined ? { tier1: b.tier1 } : {}), script: s(b.emergencies, 500) }, bz.trade),
    hours: normalizeHours(typeof b.hoursTable === "string" ? (() => { try { return JSON.parse(b.hoursTable); } catch { return null; } })() : b.hoursTable) || parseHours(bz.hours) || null };
  c.faq = lines(b.faq, 40).map((line) => { const i = line.indexOf("?"); return i > 0 ? { q: line.slice(0, i + 1).trim(), a: line.slice(i + 1).trim() } : { q: line, a: "" }; }).filter((x) => x.a);
  c.leadSources = arr(b.leadSources, 10);
  c.software = s(b.software, 30) || "google";
  c.phone = { ...c.phone, businessNumber: e164(s(b.businessNumber, 30)), forwarding: ["missed", "all", "none"].includes(b.forwarding) ? b.forwarding : "missed", carrier: ["att", "verizon", "tmobile", "voip", "other"].includes(b.carrier) ? b.carrier : "other", transferTo: e164(s(b.transferTo, 30)) };
  c.business.legal = { legalName: s(b.legalName, 120), ein: s(b.ein, 20), businessType: ["llc", "corp", "sole", "partnership", "nonprofit"].includes(b.businessType) ? b.businessType : "llc", street: s(b.street, 120), city: s(b.legalCity, 80) || c.business.city, state: s(b.state, 2).toUpperCase() || "TX", zip: s(b.zip, 10) };
  c.summary = s(b.notes, 1500);
  c.widget = { ...c.widget, greeting: s(b.greeting, 200) };
  const loop = loopCheck(c);
  if (loop) return json({ error: "loop", ...loop }, 400);
  c.status = "building";
  c.build = { status: "queued", notes: "", sourcePages: [], queuedAt: new Date().toISOString() };
  await saveClient(c);
  await indexClient(c);
  await logEvent(c.slug, "onboarded", { plan: c.plan });

  // Kick off the build in a background function (reads the website, drafts the knowledge base).
  const base = process.env.URL || url.origin;
  const fnBase = url.origin; // the deploy that is serving this request has the build function
  try {
    await fetch(`${fnBase}/.netlify/functions/onboard-build-background`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: c.slug, key: c.ownerKey }) });
  } catch (e) { console.error("could not start build", e); }

  const portal = `${base}/desk?c=${c.slug}&k=${c.ownerKey}`;
  await notifySteve(`New front desk: ${c.business.name || c.slug} (${c.plan})`, `${c.owner.name} <${c.owner.email}> ${c.owner.phone || ""}\n${website}\nPortal: ${portal}`);
  await sendEmail({ to: c.owner.email, subject: `Your front desk is being built, ${c.owner.name.split(" ")[0]}`, text: `Thanks. We are reading ${website} and drafting your front desk now. Your private portal and test line:\n${portal}\n\nKeep that link; it is your login. Steve will reach out within one business day.` });
  return json({ ok: true, slug: c.slug, key: c.ownerKey, portal, client: ownerView(c) });
};
