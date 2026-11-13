// Audit for the shared legacy ADMIN_KEY (/api/admin). Every authenticated request is recorded
// before it is served; if the record cannot be written, the request is refused (fail closed).
// Rows hold no customer data and no raw network address: only the action, the target slug
// and an HMAC of the caller network keyed by the admin key itself.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { put, list, get } from "./store.mjs";

export const ADMIN_KEY_AUDIT = "admin_key_audit";
const DAY = 86400000;
const word = (value, max) => typeof value === "string" && /^[A-Za-z0-9_:-]{1,80}$/.test(value) ? value.slice(0, max) : null;

export async function recordAdminKeyAccess(req, details = {}) {
  const at = new Date().toISOString();
  const ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const row = {
    at,
    method: details.method === "GET" ? "GET" : "POST",
    action: word(details.action, 40) || (details.action === undefined ? "update" : "unrecognised"),
    slug: typeof details.slug === "string" && /^[a-z0-9-]{1,40}$/.test(details.slug) ? details.slug : null,
    ...(word(details.kind, 30) ? { kind: details.kind } : {}),
    ...(word(details.channel, 20) ? { channel: details.channel } : {}),
    network: ip ? createHmac("sha256", String(process.env.ADMIN_KEY || "")).update(ip).digest("hex").slice(0, 16) : null,
  };
  try { await put(ADMIN_KEY_AUDIT, `${at.slice(0, 10)}/${at}-${randomBytes(4).toString("hex")}`, row); return true; }
  catch { return false; }
}

// Constant-time check of the x-admin-key header against ADMIN_KEY.
export function adminKeyPresented(req) {
  const expected = process.env.ADMIN_KEY, given = req.headers.get("x-admin-key");
  return !!expected && typeof given === "string" && Buffer.byteLength(given) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
// Routes that still accept the shared key as a bypass (the Twilio signature on /api/sms, /api/voice and
// /api/twilio-alert; the legacy rate limit on /api/chat) record each use before acting on it.
// Returns false when no valid key is presented, true once the use is recorded, and null when the record
// could not be written: the caller then refuses the request (fail closed).
export async function auditedAdminKey(req, action) {
  if (!adminKeyPresented(req)) return false;
  return (await recordAdminKeyAccess(req, { method: "POST", action })) ? true : null;
}

// Operator view: counts keys only (no reads) for the last 24 hours, then reads the 10 newest rows.
export async function adminKeyAuditView({ now = Date.now(), limit = 10 } = {}) {
  const days = [new Date(now).toISOString().slice(0, 10), new Date(now - DAY).toISOString().slice(0, 10)];
  const keys = (await Promise.all(days.map(day => list(ADMIN_KEY_AUDIT, day + "/")))).flat()
    .filter(key => { const at = Date.parse(key.slice(11, 35)); return Number.isFinite(at) && at > now - DAY && at <= now + 60000; })
    .sort().reverse();
  const recent = (await Promise.all(keys.slice(0, limit).map(key => get(ADMIN_KEY_AUDIT, key)))).filter(Boolean)
    .map(row => ({ at: row.at, method: row.method, action: row.action, slug: row.slug || null, ...(row.kind ? { kind: row.kind } : {}) }));
  return { last24h: keys.length, recent };
}
