// Background build: reads the client's website, drafts the knowledge base with Claude, merges it
// into the config (owner answers win), and moves the client to "testing".
import Anthropic from "@anthropic-ai/sdk";
import { getClient, saveClient, logEvent } from "./lib/store.mjs";
import { notifySteve, sendEmail } from "./lib/send.mjs";
import { MODEL } from "./lib/agent.mjs";

const PAGE_HINTS = ["", "services", "service", "about", "about-us", "contact", "faq", "pricing", "prices", "hours", "areas", "service-area", "locations"];

function text(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h\d|tr|br|section|article)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

async function fetchPage(u) {
  try {
    const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; MachinesAndCloudDesk/1.0; +https://machinesandcloud.com)" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("html")) return null;
    const html = await res.text();
    const t = text(html);
    return t.length > 200 ? { url: u, text: t.slice(0, 12000) } : null;
  } catch { return null; }
}

async function crawl(site) {
  const root = new URL(site.startsWith("http") ? site : "https://" + site);
  const base = root.origin;
  const pages = [];
  const seen = new Set();
  const home = await fetchPage(base + "/");
  if (home) { pages.push(home); seen.add(base + "/"); }
  // internal links from the homepage that look useful
  let links = [];
  try {
    const html = await (await fetch(base + "/", { signal: AbortSignal.timeout(12000) })).text();
    links = [...html.matchAll(/href="([^"#?]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith("/") || h.startsWith(base)).map((h) => (h.startsWith("/") ? base + h : h));
  } catch { /* ignore */ }
  const wanted = links.filter((l) => /service|about|contact|faq|pric|hour|area|location|plumb|hvac|electric|roof|clean|repair|install/i.test(l));
  const candidates = [...new Set([...wanted, ...PAGE_HINTS.map((p) => base + "/" + p)])].filter((u) => !seen.has(u)).slice(0, 10);
  for (const u of candidates) { const p = await fetchPage(u); if (p) { pages.push(p); seen.add(u); } if (pages.length >= 7) break; }
  return pages;
}

const PROFILE_TOOL = {
  name: "save_front_desk_profile",
  description: "Save the facts a front desk needs, taken from the website text. Only include what the pages actually say. Leave fields empty when the site does not say.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      business_name: { type: "string" }, trade: { type: "string", description: "e.g. HVAC, plumbing, electrical, roofing, cleaning" },
      city: { type: "string" }, service_area: { type: "array", items: { type: "string" } },
      hours: { type: "string" }, after_hours: { type: "string" },
      services: { type: "array", items: { type: "string" } },
      published_prices: { type: "array", items: { type: "object", properties: { label: { type: "string" }, amount: { type: "string" }, note: { type: "string" } }, required: ["label", "amount", "note"], additionalProperties: false } },
      licenses: { type: "string" }, spanish: { type: "boolean" },
      faq: { type: "array", items: { type: "object", properties: { q: { type: "string" }, a: { type: "string" } }, required: ["q", "a"], additionalProperties: false }, description: "Questions the site answers, plus up to 6 questions customers of this trade ask that the site should answer, with answers drawn only from the site; if the site is silent, put 'ASK OWNER' as the answer." },
      missing: { type: "array", items: { type: "string" }, description: "What the website is missing that a front desk needs: hours, service area, fees, FAQ, phone, etc." },
      summary: { type: "string", description: "Three or four sentences a new receptionist would want to know about this company, from the site." },
    },
    required: ["business_name", "trade", "city", "service_area", "hours", "after_hours", "services", "published_prices", "licenses", "spanish", "faq", "missing", "summary"],
    additionalProperties: false,
  },
};

async function draftProfile(pages, c) {
  const client = new Anthropic({ maxRetries: 2, timeout: 120_000 });
  const corpus = pages.map((p) => `=== ${p.url} ===\n${p.text}`).join("\n\n").slice(0, 60000);
  const owner = `Owner's questionnaire (these win over the website when they conflict): name ${c.business.name || "-"}; trade ${c.business.trade || "-"}; hours ${c.business.hours || "-"}; area ${(c.business.serviceArea || []).join(", ") || "-"}; fees ${(c.fees || []).map((f) => f.label + " " + f.amount).join(", ") || "-"}; services ${(c.services || []).join(", ") || "-"}; notes ${c.summary || "-"}`;
  const res = await client.beta.messages.create({
    model: MODEL, max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "medium" },
    system: "You set up AI front desks for home service companies. Read the website text and the owner's answers, then call save_front_desk_profile exactly once with everything a receptionist needs. Never invent prices, hours, or areas: if the site and the owner are silent, leave the field empty or write ASK OWNER. Keep service names short. Hours in plain words.",
    tools: [PROFILE_TOOL],
    messages: [{ role: "user", content: `${owner}\n\nWEBSITE TEXT:\n${corpus || "(the website could not be read)"}` }],
  });
  const tu = res.content.find((b) => b.type === "tool_use");
  return tu ? tu.input : null;
}

export default async (req) => {
  let body; try { body = await req.json(); } catch { return new Response("bad", { status: 400 }); }
  const c = await getClient(body?.slug || "");
  if (!c || c.ownerKey !== body?.key) return new Response("forbidden", { status: 403 });
  c.build = { ...c.build, status: "running", startedAt: new Date().toISOString() };
  await saveClient(c);
  try {
    const pages = await crawl(c.business.website);
    const p = await draftProfile(pages, c);
    const b = c.business;
    if (p) {
      const hadTrade = !!b.trade;
      b.name = b.name || p.business_name; b.trade = b.trade || p.trade; b.city = b.city || p.city;
      if (!hadTrade && b.trade) { const { normalizeEmergencies } = await import("./lib/config.mjs"); const e = normalizeEmergencies(c.rules?.emergencies, ""); c.rules.emergencies = normalizeEmergencies({ script: e.script }, b.trade); }
      if (!b.serviceArea?.length) b.serviceArea = p.service_area || [];
      const hadHours = !!b.hours;
      b.hours = b.hours || p.hours; b.afterHours = b.afterHours || p.after_hours; b.licenses = b.licenses || p.licenses;
      if (!hadHours && b.hours && !c.rules.hours) { const { parseHours } = await import("./lib/config.mjs"); c.rules.hours = parseHours(b.hours) || null; }
      if (!c.services?.length) c.services = p.services || [];
      if (!c.fees?.length) c.fees = (p.published_prices || []).filter((f) => f.amount);
      const have = new Set((c.faq || []).map((x) => x.q.toLowerCase()));
      c.faq = [...(c.faq || []), ...(p.faq || []).filter((x) => x.q && !have.has(x.q.toLowerCase()))].slice(0, 40);
      c.summary = c.summary ? c.summary + "\n" + p.summary : p.summary;
      c.build = { status: "built", notes: (p.missing || []).join("; "), sourcePages: pages.map((x) => x.url), builtAt: new Date().toISOString(), missing: p.missing || [] };
    } else {
      c.build = { status: "built", notes: "Could not read the website; the owner's answers are the whole knowledge base.", sourcePages: pages.map((x) => x.url), builtAt: new Date().toISOString(), missing: ["website unreadable"] };
    }
    c.status = "testing";
    c.widget.greeting = c.widget.greeting || `Hi, this is the ${b.name || "front desk"}. What can we help with today?`;
    await saveClient(c);
    await logEvent(c.slug, "built", { pages: pages.length, missing: c.build.missing });
    const base = process.env.URL || "";
    const portal = `${base}/desk?c=${c.slug}&k=${c.ownerKey}`;
    await sendEmail({ to: c.owner.email, subject: `${b.name || "Your front desk"} is ready to test`, text: `Your front desk is built from ${c.business.website} and your answers. Test it here, read what it knows, and fix anything wrong:\n${portal}\n\nWhat your website is missing (we filled it from your answers where we could): ${c.build.notes || "nothing major"}.` });
    await notifySteve(`Built: ${b.name || c.slug}`, `Pages read: ${pages.length}. Missing: ${c.build.notes || "-"}\n${portal}`);
    try { await fetch(`${new URL(req.url).origin}/.netlify/functions/provision-background`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: c.slug, key: c.ownerKey }) }); } catch (e) { console.error("could not start provisioning", e); }
  } catch (err) {
    console.error("build failed", err);
    c.build = { ...c.build, status: "failed", notes: String(err?.message || err).slice(0, 300) };
    c.status = "testing";
    await saveClient(c);
    await notifySteve(`Build failed: ${c.slug}`, String(err?.message || err));
  }
  return new Response("ok", { status: 200 });
};
