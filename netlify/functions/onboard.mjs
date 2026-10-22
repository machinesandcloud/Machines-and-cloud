// Verified onboarding: reserve one stable account and build a draft from saved owner answers.
// GET ?c=slug&k=key returns build status for the onboarding page to poll.
import { id, secret } from "./lib/store.mjs";
import { newClient, ownerView, loopCheck, normalizeEmergencies, normalizeHours, parseHours, emergency247 } from "./lib/config.mjs";
import { e164 } from "./lib/send.mjs";
import { json } from "./lib/agent.mjs";
import { createHash } from "node:crypto";
import { getAccessSession, accessOriginAllowed, accessSite } from "./lib/access.mjs";
import { strictRead, normalizeAccountEmail, findVerifiedAccount, ensureVerifiedAccount, AccountError } from "./lib/accounts.mjs";
import { setupReadiness, isSelfServiceClient, isSupportedSelfServiceClient } from "./lib/setup.mjs";
import { INTAKE_GOALS, INTAKE_CHANNELS } from "./lib/intake.mjs";

export const config = { path: "/api/onboard" };

const s = (v, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const arr = (v, n = 40) => (Array.isArray(v) ? v : String(v || "").split(/[\n,;]+/)).map((x) => s(x, 120)).filter(Boolean).slice(0, n);
const lines = (v, n = 40) => (Array.isArray(v) ? v : String(v || "").split(/\n+/)).map((x) => s(x, 300)).filter(Boolean).slice(0, n);

function slugify(name, site) {
  const base = (name || hostOf(site) || "shop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "shop";
  return base + "-" + id(2);
}
function hostOf(u) { try { return new URL(u.startsWith("http") ? u : "https://" + u).hostname.replace(/^www\./, "").split(".")[0]; } catch { return ""; } }

const CORS = (origin) => (origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", Vary: "Origin" } : {});
export default async (req) => {
  try { return await handle(req); }
  catch (err) { return json({ error: err instanceof AccountError ? err.code : "setup_unavailable", message: "Your answers are safe. Please try again; an existing account will not be replaced." }, err instanceof AccountError ? err.status : 503, { "Cache-Control": "no-store" }); }
};
async function handle(req) {
  const url = new URL(req.url);
  const origin = req.headers.get("origin") || "";
  if (origin && !accessOriginAllowed(origin)) return json({ error: "forbidden_origin" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS(origin) });
  if (req.method === "GET") {
    const c = await strictRead("clients", url.searchParams.get("c") || "");
    if (!c) return json({ error: "not_found" }, 404);
    if (isSelfServiceClient(c)) {
      const session = await getAccessSession(req);
      if (!session) return json({ error: "verification_required" }, 401);
      if (normalizeAccountEmail(session.email) !== normalizeAccountEmail(c.owner?.email)) return json({ error: "forbidden" }, 403);
      if (!isSupportedSelfServiceClient(c)) return json({ error: "unsupported_workspace" }, 409);
    } else if (c.ownerKey !== url.searchParams.get("k")) return json({ error: "not_found" }, 404);
    return json({ status: c.status, build: c.build, slug: c.slug }, 200, CORS(origin));
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const session = await getAccessSession(req);
  if (!session) return json({ error: "verification_required", message: "Verify your email before creating a desk." }, 401);
  if (Number(req.headers.get("content-length")) > 32000) return json({ error: "too_large" }, 413);
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ error: "bad_json" }, 400);
  if (JSON.stringify(b).length > 32000) return json({ error: "too_large" }, 413);
  if (s(b.botfield)) return json({ ok: true });
  const email = normalizeAccountEmail(session.email);
  if (!email || (b.email !== undefined && normalizeAccountEmail(b.email) !== email)) return json({ error: "email_mismatch" }, 400);
  const existing = await findVerifiedAccount(email);
  const response = (client, extra = {}) => isSelfServiceClient(client) && !isSupportedSelfServiceClient(client) ? json({ error: "unsupported_workspace" }, 409) : json({ ok: true, slug: client.slug, ...(isSelfServiceClient(client) ? {} : { key: client.ownerKey }), portal: `${accessSite()}/desk.html?c=${encodeURIComponent(client.slug)}${isSelfServiceClient(client) ? "" : `&k=${encodeURIComponent(client.ownerKey)}`}`, client: ownerView(client), setup: setupReadiness(client), ...extra }, 200, { ...CORS(origin), "Cache-Control": "no-store" });
  if (existing) return response(existing, { existing: true });
  const website = s(b.website, 200);
  const phone = e164(s(b.phone, 30));
  if (!s(b.name) || !s(b.business)) return json({ error: "missing_fields" }, 400);
  if (!/^\+1\d{10}$/.test(phone)) return json({ error: "missing_fields", field: "owner.phone", message: "Add a valid cell number for callback requests. Phone and text service remain inactive until separately verified." }, 400);
  const phoneSetupMode = s(b.phoneSetupMode, 40), businessNumber = e164(s(b.businessNumber, 30));
  if (phoneSetupMode && !["forward_business_line", "use_new_number"].includes(phoneSetupMode)) return json({ error: "invalid_phone_setup", field: "phoneSetupMode", message: "Choose how customers should reach your front desk." }, 400);
  if (phoneSetupMode === "forward_business_line" && Array.isArray(b.desiredChannels) && b.desiredChannels.includes("voice") && (!/^\+1\d{10}$/.test(businessNumber) || businessNumber === phone)) return json({ error: "invalid_business_number", field: "phone.businessNumber", message: "Add your business line and a separate contact cell so calls can reach you without looping." }, 400);
  if (b.setupVersion !== undefined && b.setupVersion !== "2") return json({ error: "invalid_setup_version" }, 400);
  if (b.setupVersion === "2") {
    let suppliedHours = b.hoursTable;
    if (typeof suppliedHours === "string") { try { suppliedHours = JSON.parse(suppliedHours); } catch { suppliedHours = null; } }
    const partialHours = suppliedHours && Object.values(suppliedHours).some(day => day && (!day.open || !day.close));
    const required = [["trade", s(b.trade)], ["services", lines(b.services).length], ["serviceArea", arr(b.serviceArea).length], ["hours", !partialHours && (normalizeHours(suppliedHours) || parseHours(s(b.hours)))], ["windows", lines(b.windows).length]];
    const missing = required.find(([, value]) => !value);
    if (missing) return json({ error: "incomplete_business_details", field: missing[0], message: missing[0] === "hours" ? "Add valid business hours, including opening and closing times." : "Complete this business detail so your front desk has the information it needs." }, 400);
  }

  const c = newClient({ slug: slugify(s(b.business), website), ownerKey: secret(), owner: { name: s(b.name), email, phone }, business: { name: s(b.business, 120), website } });
  if (b.primaryGoal !== undefined && b.primaryGoal !== "" && !INTAKE_GOALS.includes(b.primaryGoal)) return json({ error: "invalid_goal" }, 400);
  if (b.desiredChannels !== undefined && (!Array.isArray(b.desiredChannels) || b.desiredChannels.length > 4 || new Set(b.desiredChannels).size !== b.desiredChannels.length || b.desiredChannels.some(value => !INTAKE_CHANNELS.includes(value)))) return json({ error: "invalid_channels" }, 400);
  c.onboarding = { version: 1, verifiedEmail: email, verifiedAt: session.createdAt, primaryGoal: b.primaryGoal || "", desiredChannels: b.desiredChannels || ["web"], ...(phoneSetupMode ? { phoneSetupMode } : {}), ...(b.setupVersion === "2" ? { experienceVersion: 2 } : {}) };
  c.channels = { web: { active: false }, voice: { active: false }, sms: { active: false } };
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
    emergency247: emergency247(bz.hours),
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
  c.status = "testing";
  c.build = { status: "built", source: "owner_answers", notes: "Built from your saved answers. Website import is not enabled; review these rules before activation.", sourcePages: [], builtAt: new Date().toISOString() };
  // Hash only the normalized submission, never the newly generated identity/timestamps.
  const normalized = { ...c, slug: undefined, ownerKey: undefined, createdAt: undefined, updatedAt: undefined, onboarding: undefined, build: undefined };
  const submissionHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  const result = await ensureVerifiedAccount({ email, initialClient: c, submissionHash });
  return response(result.client, { existing: result.outcome === "existing", recovered: result.outcome === "resumed" });
}
