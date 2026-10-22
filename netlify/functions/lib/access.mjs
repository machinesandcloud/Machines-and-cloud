// Verified owner access. No client is created or disclosed before mailbox proof.
import { createHash, randomBytes } from "node:crypto";
import { atomicUpdate, put } from "./store.mjs";
import { emailEnabled, sendEmail } from "./send.mjs";
import { normalizeAccountEmail, findVerifiedAccount, strictRead } from "./accounts.mjs";

export class AccessError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export const accessHash = value => createHash("sha256").update(value).digest("hex");
const stamp = () => new Date().toISOString();
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const localOrigin = () => {
  try { const url = new URL(process.env.URL); return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ? url.origin : ""; } catch { return ""; }
};
export function accessSite() {
  const candidate = process.env.PUBLIC_SITE_URL || (process.env.MC_MEMORY_STORE === "1" && localOrigin()) || "https://machinesandcloud.com";
  const url = new URL(candidate);
  if (url.username || url.password || (url.protocol !== "https:" && url.origin !== localOrigin())) throw new Error("Invalid access site configuration");
  return url.origin;
}
export function accessOriginAllowed(origin) {
  if (!origin) return false;
  return [accessSite(), "https://machinesandcloud.com", "https://www.machinesandcloud.com", process.env.URL, process.env.DEPLOY_PRIME_URL, ...String(process.env.SITE_ORIGINS || "").split(",").map(value => value.trim())].filter(Boolean).includes(origin);
}

async function spendRate(key, limit, duration) {
  const allowed = await atomicUpdate("access_rate", key, previous => {
    const now = Date.now();
    const row = previous && previous.until > now ? previous : { count: 0, until: now + duration };
    if (row.count >= limit) return { result: false };
    return { value: { count: row.count + 1, until: row.until }, result: true };
  });
  if (!allowed) throw new AccessError("rate_limited", "Please wait before requesting another sign-in email.", 429);
}

export async function requestAccessLink(emailValue, ip, planValue) {
  const email = normalizeAccountEmail(emailValue);
  if (!email) throw new AccessError("invalid_email", "Enter a valid email address.");
  const testInbox = process.env.MC_MEMORY_STORE === "1" && process.env.MC_FAKE_MODEL === "1" && !!localOrigin();
  if (!testInbox && !emailEnabled()) throw new AccessError("email_unavailable", "Sign-in email is temporarily unavailable. Please try again shortly.", 503);
  await spendRate("global", 100, 3600000);
  await spendRate("ip:" + accessHash(String(ip || "unknown")), 5, 600000);
  await spendRate("email:" + accessHash(email), 3, 900000);
  const token = randomBytes(32).toString("hex"), key = accessHash(token);
  const createdAt = stamp(), expiresAt = new Date(Date.now() + 20 * 60000).toISOString();
  await atomicUpdate("access_tokens", key, current => {
    if (current) throw new Error("Access token collision");
    return { value: { email, status: "pending", createdAt, expiresAt } };
  });
  // A plan hint is a fixed enum, never a caller-supplied destination or authority.
  const plan = ["starter", "growth", "pro"].includes(planValue) ? planValue : "";
  const link = `${accessSite()}/onboard.html${plan ? `?plan=${plan}` : ""}#verify=${token}`;
  let delivered = false;
  try {
    if (testInbox) {
      // Private, loopback-only test store. Never exposed through any HTTP endpoint.
      await put("access_outbox", accessHash(email), { email, link, token, createdAt, expiresAt });
      delivered = true;
    } else {
      const result = await sendEmail({ to: email, subject: "Your Machines & Cloud sign-in link", text: `Continue setting up or open your front desk:\n${link}\n\nThis link expires in 20 minutes and works once. It does not subscribe you to marketing. If you did not request it, you can ignore this email.` });
      delivered = result.ok === true;
    }
  } catch { /* The response below is deliberately independent of account existence. */ }
  if (!delivered) {
    await atomicUpdate("access_tokens", key, row => ({ value: { ...row, status: "delivery_failed" } }));
    throw new AccessError("email_unavailable", "We could not send the sign-in email. Please try again shortly.", 503);
  }
  return { ok: true, delivery: testInbox ? "test_outbox" : "email", message: testInbox ? "A link was saved in the local test inbox. No email was sent." : "Check your inbox for a link to continue. It expires in 20 minutes." };
}

export async function exchangeAccessToken(token, ip) {
  await spendRate("exchange:" + accessHash(String(ip || "unknown")), 15, 600000);
  if (!hex(token)) throw new AccessError("invalid_link", "This sign-in link is invalid. Request a new one.", 410);
  const session = randomBytes(32).toString("hex"), sessionHash = accessHash(session);
  const claim = await atomicUpdate("access_tokens", accessHash(token), row => {
    if (!row || row.status !== "pending" || !Number.isFinite(Date.parse(row.expiresAt)) || Date.parse(row.expiresAt) <= Date.now()) return { result: null };
    return { value: { ...row, status: "consumed", consumedAt: stamp(), sessionHash }, result: { email: row.email } };
  });
  if (!claim) throw new AccessError("invalid_link", "This sign-in link expired or was already used. Request a new one.", 410);
  const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
  await atomicUpdate("access_sessions", sessionHash, row => {
    if (row) throw new Error("Access session collision");
    return { value: { email: claim.email, scope: "onboarding", status: "active", createdAt: stamp(), expiresAt } };
  });
  return { ok: true, session, email: claim.email, expiresAt };
}

export async function getAccessSession(req) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.get("authorization") || "");
  if (!match) return null;
  const row = await strictRead("access_sessions", accessHash(match[1]));
  return row?.scope === "onboarding" && row.status === "active" && Date.parse(row.expiresAt) > Date.now() ? { ...row, sessionHash: accessHash(match[1]) } : null;
}

export async function getAccessState(session) {
  const [draft, client] = await Promise.all([strictRead("onboarding_drafts", accessHash(session.email)), findVerifiedAccount(session.email)]);
  return { ok: true, email: session.email, expiresAt: session.expiresAt, draft: draft || { fields: {}, step: 0, revision: 0 }, ...(client ? { existing: { slug: client.slug, portal: `${accessSite()}/desk.html?c=${encodeURIComponent(client.slug)}${client.onboarding?.version === 1 ? "" : `&k=${encodeURIComponent(client.ownerKey)}`}` } } : {}) };
}

export const DRAFT_FIELDS = new Set(["name", "phone", "website", "plan", "business", "trade", "city", "services", "hours", "hoursTable", "afterHours", "serviceArea", "notServed", "spanish", "licenses", "fees", "windows", "faq", "handoff", "never", "tier0", "tier1", "emergencies", "notes", "greeting", "businessNumber", "forwarding", "carrier", "backupPhone", "transferTo", "legalName", "ein", "businessType", "street", "legalCity", "state", "zip", "leadSources", "software", "reviewLink", "payLink", "providerAuthorization"]);
export async function saveAccessDraft(session, body) {
  if (!body || typeof body !== "object" || !body.fields || typeof body.fields !== "object" || Array.isArray(body.fields) || !Number.isInteger(body.revision) || body.revision < 0 || !Number.isInteger(body.step) || body.step < 0 || body.step > 4) throw new AccessError("invalid_draft", "The saved answers could not be read.");
  const fields = {};
  for (const [key, value] of Object.entries(body.fields)) {
    if (key === "email") continue;
    if (!DRAFT_FIELDS.has(key)) throw new AccessError("invalid_draft", "An unknown answer was supplied.");
    if (key === "leadSources" && Array.isArray(value) && value.length <= 10 && value.every(item => typeof item === "string" && item.length <= 80)) fields[key] = value;
    else if (typeof value === "string" && value.length <= 4000) fields[key] = value;
    else throw new AccessError("invalid_draft", "One of the answers is too long or could not be read.");
  }
  if (JSON.stringify(fields).length > 24000) throw new AccessError("invalid_draft", "Your answers are too long to save.");
  const result = await atomicUpdate("onboarding_drafts", accessHash(session.email), current => {
    if ((current?.revision || 0) !== body.revision) return { result: null };
    const draft = { fields, step: body.step, revision: body.revision + 1, updatedAt: stamp() };
    return { value: draft, result: draft };
  });
  if (!result) throw new AccessError("draft_changed", "Your saved answers changed in another tab. Reload to continue with the latest version.", 409);
  return { ok: true, draft: result };
}

export async function revokeAccessSession(session) {
  await atomicUpdate("access_sessions", session.sessionHash, current => current ? { value: { ...current, status: "revoked", revokedAt: stamp() } } : {});
  return { ok: true };
}
