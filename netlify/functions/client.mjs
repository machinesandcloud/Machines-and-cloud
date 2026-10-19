// Owner portal API. GET ?c=slug returns the public widget view; with &k=key the owner view plus
// records. PUT with the key updates the editable config. POST actions: go_live, pause, test_sms.
import { getClient, saveClient, indexClient, listRecords, listJSON, logEvent } from "./lib/store.mjs";
import { publicView, ownerView, PLANS } from "./lib/config.mjs";
import { json } from "./lib/agent.mjs";
import { sendSMS, smsEnabled, e164 } from "./lib/send.mjs";
import { googleEnabled } from "./lib/calendar.mjs";
import { stripeEnabled } from "./lib/billing.mjs";
import { weeklyDigest } from "./lib/desk.mjs";
import { updateVoicePrompt } from "./lib/vapi.mjs";
import { forwardingInstructions } from "./lib/forwarding.mjs";

export const config = { path: "/api/client" };

const CORS = (origin) => (origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" } : {});
const s = (v, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const arr = (v, n = 40) => (Array.isArray(v) ? v : String(v || "").split(/[\n;]+/)).map((x) => s(x, 160)).filter(Boolean).slice(0, n);

export default async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS(origin) });
  const slug = s(url.searchParams.get("c"), 40);
  const c = slug ? await getClient(slug) : null;
  if (!c) return json({ error: "not_found" }, 404, CORS(origin));
  const key = s(url.searchParams.get("k"), 80);
  const isOwner = key && key === c.ownerKey;

  if (req.method === "GET") {
    if (!isOwner) return json(publicView(c), 200, CORS(origin));
    const [bookings, leads, convs, events] = await Promise.all([
      listRecords("bookings", c.slug, 100), listRecords("leads", c.slug, 100), listJSON("conversations", c.slug + "/", 60), listJSON("events", c.slug + "/", 100),
    ]);
    return json({
      client: ownerView(c), plan: PLANS[c.plan], bookings: bookings.reverse(), leads: leads.reverse(),
      conversations: convs.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).map((v) => ({ channel: v.channel, contact: v.contact, updatedAt: v.updatedAt, messages: v.messages.slice(-12) })),
      events: events.reverse().slice(0, 50),
      integrations: { sms: smsEnabled(), google: googleEnabled(), stripe: stripeEnabled() },
      forwarding: forwardingInstructions(c),
      site: process.env.URL || url.origin,
    });
  }
  if (!isOwner) return json({ error: "forbidden" }, 403);

  if (req.method === "PUT") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    const bz = c.business;
    if (b.business) Object.assign(bz, {
      name: s(b.business.name, 120) || bz.name, trade: s(b.business.trade, 80), city: s(b.business.city, 80) || bz.city,
      serviceArea: arr(b.business.serviceArea), notServed: arr(b.business.notServed), hours: s(b.business.hours, 300), afterHours: s(b.business.afterHours, 300),
      spanish: !!b.business.spanish, licenses: s(b.business.licenses, 200), googlePlaceId: s(b.business.googlePlaceId, 120), reviewLink: s(b.business.reviewLink, 300), payLink: s(b.business.payLink, 300),
    });
    if (b.owner) c.owner = { ...c.owner, name: s(b.owner.name) || c.owner.name, phone: e164(s(b.owner.phone, 30)) || c.owner.phone };
    if (b.services) c.services = arr(b.services, 60);
    if (b.fees) c.fees = (Array.isArray(b.fees) ? b.fees : []).map((f) => ({ label: s(f.label, 80), amount: s(f.amount, 40), note: s(f.note, 120) })).filter((f) => f.label).slice(0, 30);
    if (b.windows) c.windows = arr(b.windows, 8);
    if (b.rules) c.rules = { never: arr(b.rules.never, 20), handoff: arr(b.rules.handoff, 20), emergencies: s(b.rules.emergencies, 500) };
    if (b.faq) c.faq = (Array.isArray(b.faq) ? b.faq : []).map((x) => ({ q: s(x.q, 200), a: s(x.a, 600) })).filter((x) => x.q && x.a).slice(0, 40);
    if (b.summary !== undefined) c.summary = s(b.summary, 2000);
    if (b.widget) c.widget = { ...c.widget, greeting: s(b.widget.greeting, 200), allowedOrigins: arr(b.widget.allowedOrigins, 5) };
    if (b.phone) c.phone = { ...c.phone, businessNumber: e164(s(b.phone.businessNumber, 30)) || c.phone.businessNumber, forwarding: ["missed", "all", "none"].includes(b.phone.forwarding) ? b.phone.forwarding : c.phone.forwarding, carrier: ["att", "verizon", "tmobile", "voip", "other"].includes(b.phone.carrier) ? b.phone.carrier : c.phone.carrier };
    if (b.legal) c.business.legal = { ...(c.business.legal || {}), legalName: s(b.legal.legalName, 120), ein: s(b.legal.ein, 20), businessType: ["llc", "corp", "sole", "partnership", "nonprofit"].includes(b.legal.businessType) ? b.legal.businessType : (c.business.legal?.businessType || "llc"), street: s(b.legal.street, 120), city: s(b.legal.city, 80), state: s(b.legal.state, 2).toUpperCase() || "TX", zip: s(b.legal.zip, 10) };
    if (["starter", "growth", "pro"].includes(b.plan)) c.plan = b.plan;
    if (b.software) c.software = s(b.software, 30);
    await saveClient(c); await indexClient(c);
    await logEvent(c.slug, "config_updated", {});
    try { await updateVoicePrompt(c); } catch (e) { console.error("voice prompt update", e); }
    return json({ ok: true, client: ownerView(c) });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { b = {}; }
    if (b.action === "go_live") { c.status = "live"; c.liveAt = c.liveAt || new Date().toISOString(); await saveClient(c); await logEvent(c.slug, "live", {}); return json({ ok: true, status: c.status }); }
    if (b.action === "pause") { c.status = "testing"; await saveClient(c); await logEvent(c.slug, "paused", {}); return json({ ok: true, status: c.status }); }
    if (b.action === "test_sms") {
      if (!c.owner.phone) return json({ error: "no_owner_phone" }, 400);
      const r = await sendSMS({ to: c.owner.phone, from: c.phone.twilioNumber || process.env.MC_TWILIO_NUMBER, body: `${c.business.name || "Front desk"}: test text from your front desk. Reply "help" any time to see the commands.` });
      return json({ ok: r.ok, logged: !!r.logged, error: r.error || r.reason });
    }
    if (b.action === "digest") return json({ ok: true, text: await weeklyDigest(c) });
    if (b.action === "provision") {
      try { await fetch(`${url.origin}/.netlify/functions/provision-background`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: c.slug, key: c.ownerKey }) }); } catch (e) { return json({ error: "could_not_start" }, 502); }
      return json({ ok: true });
    }
    if (b.action === "forwarding_verified") { c.phone.forwardingVerified = true; await saveClient(c); return json({ ok: true }); }
    return json({ error: "unknown_action" }, 400);
  }
  return json({ error: "method_not_allowed" }, 405);
};
