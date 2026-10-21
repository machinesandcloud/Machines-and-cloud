// Owner portal API. GET ?c=slug returns the public widget view; with &k=key the owner view plus
// records, health, and forwarding instructions. PUT with the key updates the editable config (loop-checked).
// GET with &export=bookings|leads|conversations returns a CSV download (owner only).
// POST actions: go_live, pause, resume, cancel, ack, flag, unflag, digest, test_sms, provision, forwarding_verified.
import { getClient, saveClient, indexClient, listRecords, listJSON, logEvent, getConversation, saveConversation, cancelTasks, lastInbound } from "./lib/store.mjs";
import { publicView, ownerView, PLANS, loopCheck, ACK_MINUTES, DATA_POLICY, policyUrls, normalizeEmergencies, normalizeHours, parseHours, emergency247 } from "./lib/config.mjs";
import { json } from "./lib/agent.mjs";
import { sendSMS, smsEnabled, e164, sendEmail, notifySteve } from "./lib/send.mjs";
import { googleEnabled } from "./lib/calendar.mjs";
import { stripeEnabled } from "./lib/billing.mjs";
import { dailyDigest, lineHealth, ackAlertsFor, weeklyReport, monthlyReport } from "./lib/desk.mjs";
import { getUsage, usageView } from "./lib/usage.mjs";
import { updateVoicePrompt, detachVoice, attachVoice } from "./lib/vapi.mjs";
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
  const site = process.env.URL || url.origin;

  if (req.method === "GET") {
    if (!isOwner) {
      if (url.searchParams.get("export")) return json({ error: "forbidden" }, 403);
      return json(publicView(c), 200, { ...CORS(origin), "Cache-Control": "public, max-age=60", "Netlify-CDN-Cache-Control": "public, max-age=60, durable" });
    }
    const exp = url.searchParams.get("export");
    if (exp) return exportCSV(c, exp);
    const [bookings, leads, convs, events, alerts, usage] = await Promise.all([
      listRecords("bookings", c.slug, 100), listRecords("leads", c.slug, 100), listJSON("conversations", c.slug + "/", 60), listJSON("events", c.slug + "/", 300), listRecords("alerts", c.slug, 100), getUsage(c.slug),
    ]);
    const waiting = new Set(alerts.filter((a) => a.status === "waiting").map((a) => a.leadId));
    return json({
      client: ownerView(c), plan: PLANS[c.plan], usage: usageView(c, usage), bookings: bookings.reverse(), leads: leads.reverse().map((l) => ({ ...l, alertWaiting: waiting.has(l.id) })),
      conversations: convs.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).map((v) => ({ channel: v.channel, contact: v.contact, updatedAt: v.updatedAt, flag: v.flag || null, messages: v.messages.slice(-12) })),
      events: events.reverse().slice(0, 80),
      today: todayStrip(c, bookings, leads, events),
      health: lineHealth(c, events, await lastInbound(c.slug)),
      integrations: { sms: smsEnabled(), google: googleEnabled(), stripe: stripeEnabled() },
      forwarding: forwardingInstructions(c),
      policy: policyUrls(c.slug, site), dataPolicy: DATA_POLICY, ackMinutesOptions: ACK_MINUTES,
      site,
    });
  }
  if (!isOwner) return json({ error: "forbidden" }, 403);

  if (req.method === "PUT") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    const before = JSON.stringify(c);
    const bz = c.business;
    if (b.business) Object.assign(bz, {
      name: s(b.business.name, 120) || bz.name, trade: s(b.business.trade, 80), city: s(b.business.city, 80) || bz.city,
      serviceArea: arr(b.business.serviceArea), notServed: arr(b.business.notServed), hours: s(b.business.hours, 300), afterHours: s(b.business.afterHours, 300),
      spanish: !!b.business.spanish, licenses: s(b.business.licenses, 200), googlePlaceId: s(b.business.googlePlaceId, 120), reviewLink: s(b.business.reviewLink, 300), payLink: s(b.business.payLink, 300),
    });
    if (b.owner) c.owner = { ...c.owner, name: s(b.owner.name) || c.owner.name, phone: e164(s(b.owner.phone, 30)) || c.owner.phone, ...(b.owner.backupPhone !== undefined ? { backupPhone: e164(s(b.owner.backupPhone, 30)) } : {}) };
    if (b.services) c.services = arr(b.services, 60);
    if (b.fees) c.fees = (Array.isArray(b.fees) ? b.fees : []).map((f) => ({ label: s(f.label, 80), amount: s(f.amount, 40), note: s(f.note, 120) })).filter((f) => f.label).slice(0, 30);
    if (b.windows) c.windows = arr(b.windows, 8);
    if (b.rules) c.rules = {
      ...c.rules,
      never: b.rules.never !== undefined ? arr(b.rules.never, 20) : c.rules.never, handoff: b.rules.handoff !== undefined ? arr(b.rules.handoff, 20) : c.rules.handoff,
      emergencies: b.rules.emergencies !== undefined ? normalizeEmergencies(typeof b.rules.emergencies === "string" ? { ...normalizeEmergencies(c.rules.emergencies, c.business.trade), script: s(b.rules.emergencies, 500) } : b.rules.emergencies, c.business.trade) : c.rules.emergencies,
      ackMinutes: ACK_MINUTES.includes(Number(b.rules.ackMinutes)) ? Number(b.rules.ackMinutes) : (c.rules.ackMinutes || 10),
      callbackHours: s(b.rules.callbackHours, 80) || c.rules.callbackHours || "within 30 minutes",
      callbackAfterHours: s(b.rules.callbackAfterHours, 80) || c.rules.callbackAfterHours || "by 8 am tomorrow",
      consentAsk: b.rules.consentAsk !== undefined ? !!b.rules.consentAsk : !!c.rules.consentAsk,
      avgTicket: b.rules.avgTicket !== undefined ? (Math.max(0, Math.round(Number(String(b.rules.avgTicket).replace(/[^\d.]/g, "")) || 0)) || 0) : (c.rules.avgTicket || 0),
      emergency247: b.rules.emergency247 !== undefined ? !!b.rules.emergency247 : (b.business?.hours !== undefined ? emergency247(s(b.business.hours, 300)) : !!c.rules.emergency247),
      hours: b.rules.hours !== undefined ? (normalizeHours(b.rules.hours) || (typeof b.rules.hours === "string" ? parseHours(b.rules.hours) : null)) : (c.rules.hours || null),
      bypass: b.rules.bypass !== undefined ? [...new Set(arr(b.rules.bypass, 20).map((n) => e164(n)).filter(Boolean))].slice(0, 20) : (c.rules.bypass || []),
    };
    if (b.digest) c.digest = { ...(c.digest || {}), ...(b.digest.text !== undefined ? { text: !!b.digest.text } : {}) };
    if (b.faq) c.faq = (Array.isArray(b.faq) ? b.faq : []).map((x) => ({ q: s(x.q, 200), a: s(x.a, 600) })).filter((x) => x.q && x.a).slice(0, 40);
    if (b.summary !== undefined) c.summary = s(b.summary, 2000);
    if (b.widget) c.widget = { ...c.widget, greeting: s(b.widget.greeting, 200), allowedOrigins: arr(b.widget.allowedOrigins, 5) };
    if (b.phone) c.phone = { ...c.phone, businessNumber: e164(s(b.phone.businessNumber, 30)) || c.phone.businessNumber, forwarding: ["missed", "all", "none"].includes(b.phone.forwarding) ? b.phone.forwarding : c.phone.forwarding, carrier: ["att", "verizon", "tmobile", "voip", "other"].includes(b.phone.carrier) ? b.phone.carrier : c.phone.carrier, ...(b.phone.transferTo !== undefined ? { transferTo: e164(s(b.phone.transferTo, 30)) } : {}) };
    if (b.legal) c.business.legal = { ...(c.business.legal || {}), legalName: s(b.legal.legalName, 120), ein: s(b.legal.ein, 20), businessType: ["llc", "corp", "sole", "partnership", "nonprofit"].includes(b.legal.businessType) ? b.legal.businessType : (c.business.legal?.businessType || "llc"), street: s(b.legal.street, 120), city: s(b.legal.city, 80), state: s(b.legal.state, 2).toUpperCase() || "TX", zip: s(b.legal.zip, 10) };
    if (["starter", "growth", "pro"].includes(b.plan)) c.plan = b.plan;
    if (b.software) c.software = s(b.software, 30);
    const loop = loopCheck(c);
    if (loop) { Object.assign(c, JSON.parse(before)); return json({ error: "loop", ...loop }, 400); }
    await saveClient(c); await indexClient(c);
    await logEvent(c.slug, "config_updated", {});
    try { await updateVoicePrompt(c); } catch (e) { console.error("voice prompt update", e); }
    try { const { syncVoiceFallback } = await import("./lib/twilio.mjs"); await syncVoiceFallback(c); } catch (e) { console.error("voice fallback sync", e); }
    return json({ ok: true, client: ownerView(c) });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { b = {}; }
    const fw = forwardingInstructions(c);
    const name = c.business.name || "Your front desk";
    if (b.action === "go_live" || b.action === "resume") {
      const wasPaused = c.status === "paused";
      c.status = wasPaused ? (c.pausedFrom === "live" ? "live" : "live") : "live";
      c.liveAt = c.liveAt || new Date().toISOString(); c.pausedAt = null;
      await saveClient(c); await logEvent(c.slug, wasPaused ? "resumed" : "live", {});
      if (wasPaused) { try { await attachVoice(c, site); await saveClient(c); } catch (e) { console.error("attach voice", e); } }
      else {
        const welcome = `${name}: you're live. Every lead and booking comes to this number as a job ticket, and each one names the single reply it needs (ok, called, otw, or done). A 6 pm summary comes on any day it handled something, and a report every Monday. Flag anything that reads wrong on your portal and Steve sees it the same day.`;
        if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "welcome", body: welcome });
        await sendEmail({ to: c.owner.email, subject: `${name}: you're live`, text: `${welcome}

Your portal: ${site}/desk?c=${c.slug}&k=${c.ownerKey}

What the first alert looks like:
${name} front desk: BOOKED
Customer: Maria Lopez (new)
Phone: +1 713 555 0100
Where: 1402 Mason Rd, Katy
Issue: AC blowing warm air
Window: tomorrow, 8 to 12
Ref ab12cd. Reply "ok ab12cd" to acknowledge, "otw ab12cd" on the way, "done ab12cd" finished.

Texts to customers go out from ${c.phone?.twilioNumber && c.phone?.tenDlc === "approved" ? "your number" : "Machines & Cloud's registered number with your shop's name until carriers approve yours"}.` });
      }
      return json({ ok: true, status: c.status });
    }
    if (b.action === "pause") {
      if (!["testing", "live"].includes(c.status)) return json({ error: "not_active" }, 400);
      c.pausedFrom = c.status; c.status = "paused"; c.pausedAt = new Date().toISOString();
      await saveClient(c); await logEvent(c.slug, "paused", {});
      try { await detachVoice(c, site); await saveClient(c); } catch (e) { console.error("detach voice", e); }
      const off = fw.off?.length ? `To stop forwarding entirely, dial ${fw.off.join(" or ")} from your cell.` : "To stop forwarding entirely, turn it off in your carrier app.";
      const text = `${name}: your front desk is paused. Calls to ${c.phone.twilioNumber || "the front desk number"} ring your cell; texts get one reply pointing to your main line. ${off} Resume from your portal any time.`;
      if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: text });
      await sendEmail({ to: c.owner.email, subject: `${name}: paused`, text });
      return json({ ok: true, status: c.status, off: fw.off });
    }
    if (b.action === "cancel") {
      c.status = "cancelled"; c.cancelledAt = new Date().toISOString(); c.serviceEndsAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); c.cancelReason = s(b.reason, 300);
      await saveClient(c); await logEvent(c.slug, "cancelled", { reason: c.cancelReason });
      await cancelTasks(c.slug, () => true);
      try { await detachVoice(c, site); await saveClient(c); } catch (e) { console.error("detach voice", e); }
      const last = c.cancelledAt.slice(0, 10), ends = c.serviceEndsAt.slice(0, 10);
      const off = fw.off?.length ? `To stop forwarding, dial ${fw.off.join(" or ")} from your cell now.` : "To stop forwarding, turn it off in your carrier app now.";
      if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: `${name}: your front desk is cancelled as of today. ${off} Until ${ends} any call that still reaches ${c.phone.twilioNumber || "the front desk number"} rings your cell. Reply here if you did not mean to.` });
      await sendEmail({ to: c.owner.email, subject: `${name}: cancellation confirmed`, text: `Your front desk was cancelled on ${last}. Nothing is invoiced for any day after ${last}.\n\n${off} iPhone users: also check Settings, Phone, Live Voicemail.\n\nUntil ${ends}, calls to ${c.phone.twilioNumber || "the front desk number"} ring straight through to your cell and no text or AI answers. After that the number is released.\n\n${DATA_POLICY}\n\nTo come back, reply to this email.` });
      await notifySteve(`Cancelled: ${name}`, `Reason: ${c.cancelReason || "-"}\nVerify forwarding is off (call ${c.phone.businessNumber || "their line"}), close the invoice as of ${last}, release the number on ${ends}.\n${site}/desk?c=${c.slug}&k=${c.ownerKey}`);
      return json({ ok: true, status: c.status, serviceEndsAt: c.serviceEndsAt, off: fw.off });
    }
    if (b.action === "ack") {
      const n = await ackAlertsFor(c, s(b.leadId, 20), "portal");
      return json({ ok: true, acked: n });
    }
    if (b.action === "flag" || b.action === "unflag") {
      const channel = s(b.channel, 10), contact = s(b.contact, 60);
      const conv = await getConversation(c.slug, channel, contact);
      if (!conv.messages.length) return json({ error: "no_conversation" }, 404);
      if (b.action === "flag") {
        conv.flag = { at: new Date().toISOString(), note: s(b.note, 300), by: "owner" };
        await saveConversation(conv); await logEvent(c.slug, "flagged", { channel, contact });
        const tail = conv.messages.slice(-6).map((m) => `${m.role === "user" ? "Customer" : "Desk"}: ${m.content}`).join("\n");
        await notifySteve(`Flagged by ${name}: ${channel} ${contact}`, `${conv.flag.note || "(no note)"}\n\n${tail}\n\n${site}/desk?c=${c.slug}&k=${c.ownerKey}#convs`);
      } else { conv.flag = null; await saveConversation(conv); await logEvent(c.slug, "unflagged", { channel, contact }); }
      return json({ ok: true, flag: conv.flag });
    }
    if (b.action === "digest") { const d = await dailyDigest(c); return json({ ok: true, text: d.text, email: d.email }); }
    if (b.action === "weekly") { const w = await weeklyReport(c); return json({ ok: true, ...w }); }
    if (b.action === "monthly") { const mth = await monthlyReport(c, s(b.month, 7) || undefined); const { invoice, ...rest } = mth; return json({ ok: true, ...rest }); }
    if (b.action === "test_sms") {
      if (!c.owner.phone) return json({ error: "no_owner_phone" }, 400);
      const r = await sendSMS({ to: c.owner.phone, client: c, force: true, type: "test", body: `${name}: test text from your front desk. Reply "help" any time to see the commands.` });
      return json({ ok: r.ok, logged: !!r.logged, error: r.error || r.reason });
    }
    if (b.action === "provision") {
      try { await fetch(`${url.origin}/.netlify/functions/provision-background`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: c.slug, key: c.ownerKey }) }); } catch (e) { return json({ error: "could_not_start" }, 502); }
      return json({ ok: true });
    }
    if (b.action === "forwarding_verified") { c.phone.forwardingVerified = true; await saveClient(c); return json({ ok: true }); }
    return json({ error: "unknown_action" }, 400);
  }
  return json({ error: "method_not_allowed" }, 405);
};

// "1402 Mason Rd, Katy, TX 77450" -> street, city, state, zip; without a ZIP the city falls back to the shop's.
function splitAddress(addr, defaultCity) {
  const t = String(addr || "").trim();
  const m = t.match(/^(.*?)(?:,\s*([A-Za-z .'-]+?))?(?:,?\s*(TX|Texas))?\s*,?\s*(\d{5})(?:-\d{4})?$/i);
  if (m) return { street: m[1].replace(/,\s*$/, "").trim(), city: (m[2] || defaultCity).trim(), state: "TX", zip: m[4] };
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { street: parts[0], city: parts[1].replace(/\b(TX|Texas)\b/i, "").trim() || defaultCity, state: "TX", zip: "" };
  return { street: t, city: defaultCity, state: "TX", zip: "" };
}

// The portal's Today strip: this Houston day's calls, texts, bookings, and leads needing the owner.
function todayStrip(c, bookings, leads, events) {
  const day = (iso) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso)) : "");
  const today = day(new Date().toISOString());
  return {
    calls: events.filter((e) => ["missed_call", "call_ended"].includes(e.type) && day(e.at) === today).length,
    texts: events.filter((e) => e.type === "sms_inbound" && day(e.at) === today).length,
    bookings: bookings.filter((b) => day(b.createdAt) === today).length,
    needsYou: leads.filter((l) => l.status === "open" && ["needs_action", "wants_call"].includes(l.outcome)).length,
  };
}

// ---- CSV export (RFC 4180, UTF-8 BOM, attachment) ----
const csvCell = (v) => { const t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const csv = (header, rows) => "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
async function exportCSV(c, what) {
  const today = new Date().toISOString().slice(0, 10);
  let header, rows;
  if (what === "bookings") {
    header = ["id", "createdAt", "customer_name", "phone", "address", "issue", "date", "window", "urgency", "status", "outcome", "customerType", "channel", "notes", "unsure", "consent.at", "consent.channel"];
    rows = (await listRecords("bookings", c.slug, 2000)).map((b) => [b.id, b.createdAt, b.customer_name, b.phone, b.address, b.issue, b.date, b.window, b.urgency, b.status, b.outcome, b.customerType, b.channel, b.notes, b.unsure, b.consent?.at, b.consent?.channel]);
  } else if (what === "leads") {
    header = ["id", "createdAt", "customer_name", "phone", "address", "issue", "reason", "outcome", "urgency", "wanted", "status", "channel", "unsure"];
    rows = (await listRecords("leads", c.slug, 2000)).map((l) => [l.id, l.createdAt, l.customer_name, l.phone, l.address, l.issue, l.reason, l.outcome, l.urgency, l.wanted, l.status, l.channel, l.unsure]);
  } else if (what === "conversations") {
    header = ["channel", "contact", "at", "role", "content", "flag_note"];
    rows = [];
    for (const v of await listJSON("conversations", c.slug + "/", 2000)) for (const m of v.messages || []) rows.push([v.channel, v.contact, m.at, m.role, m.content, v.flag?.note || ""]);
  } else if (what === "customers") {
    // Jobber's supported import headers; Housecall Pro's wizard maps the same names.
    header = ["First name", "Last name", "Mobile Phone", "Email", "Street", "City", "State", "Zip Code", "Note", "Lead Source", "Tags"];
    const byPhone = new Map();
    const all = [...(await listRecords("bookings", c.slug, 2000)).map((b) => ({ ...b, kind: "booking" })), ...(await listRecords("leads", c.slug, 2000)).filter((l) => l.status !== "spam").map((l) => ({ ...l, kind: "lead" }))].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    for (const r of all) {
      if (!r.phone) continue;
      const cur = byPhone.get(r.phone) || { name: "", address: "", issues: [], refs: [] };
      if (r.customer_name) cur.name = r.customer_name;
      if (r.address && (r.kind === "booking" || !cur.address)) cur.address = r.address;
      if (r.issue) cur.issues.push(r.issue);
      cur.refs.push(r.id);
      byPhone.set(r.phone, cur);
    }
    rows = [...byPhone.entries()].map(([phone, x]) => {
      const parts = x.name.trim().split(/\s+/); const first = parts[0] || ""; const last = parts.slice(1).join(" ");
      const a = splitAddress(x.address, c.business?.city || "");
      return [first, last, phone, "", a.street, a.city, a.state, a.zip, `${x.issues.slice(-1)[0] || ""}${x.refs.length ? " (refs " + x.refs.join(", ") + ")" : ""}`, "Other", "front desk"];
    });
  } else return json({ error: "unknown_export" }, 400);
  return new Response(csv(header, rows), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${c.slug}-${what}-${today}.csv"`, "Cache-Control": "no-store" } });
}
