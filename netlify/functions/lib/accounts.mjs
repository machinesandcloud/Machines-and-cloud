// Verified-mailbox account registry. Callers must establish mailbox authority first.
// All identity reads fail closed; only the legacy index projection retains the old shape.
import { createHash } from "node:crypto";
import { atomicUpdate } from "./store.mjs";

export class AccountError extends Error {
  constructor(code, status = 409) { super(code); this.code = code; this.status = status; }
}
export function normalizeAccountEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export const accountKey = email => createHash("sha256").update(email).digest("hex");
export const strictRead = (kind, key) => atomicUpdate(kind, key, current => ({ result: current }));
function identityMatches(client, record) {
  return !!client && client.slug === record.slug && client.ownerKey === record.ownerKey && normalizeAccountEmail(client.owner?.email) === record.email;
}
async function legacyClient(email) {
  const slug = await strictRead("index", "email:" + email);
  if (slug === null) return null;
  if (typeof slug !== "string") throw new AccountError("account_conflict");
  const client = await strictRead("clients", slug);
  if (!client || client.slug !== slug || !client.ownerKey || normalizeAccountEmail(client.owner?.email) !== email) throw new AccountError("account_conflict");
  return client;
}
export async function findVerifiedAccount(value) {
  const email = normalizeAccountEmail(value);
  if (!email) throw new AccountError("invalid_email", 400);
  const record = await strictRead("accounts", accountKey(email));
  if (record === null) return legacyClient(email);
  if (record.email !== email || !record.slug || !record.ownerKey) throw new AccountError("account_conflict");
  const client = await strictRead("clients", record.slug);
  if (record.phase === "reserved") {
    if (client && !identityMatches(client, record)) throw new AccountError("account_conflict");
    return null; // Finish every missing projection through the original reservation.
  }
  if (record.phase !== "created") throw new AccountError("account_conflict");
  if (!identityMatches(client, record)) throw new AccountError("account_unavailable");
  return client;
}

export async function ensureVerifiedAccount({ email: value, initialClient, submissionHash }) {
  const email = normalizeAccountEmail(value);
  if (!email || !initialClient?.slug || !initialClient.ownerKey || normalizeAccountEmail(initialClient.owner?.email) !== email || typeof submissionHash !== "string" || !submissionHash) throw new AccountError("invalid_account", 400);
  const key = accountKey(email);
  const reservation = await atomicUpdate("accounts", key, async current => {
    if (current !== null) {
      if (current.email !== email || !current.initialClient || !current.slug || !current.ownerKey || !["reserved", "created"].includes(current.phase) || !identityMatches(current.initialClient, current)) throw new AccountError("account_conflict");
      if (current.phase === "reserved" && current.submissionHash !== submissionHash) throw new AccountError("submission_conflict");
      return { result: { record: current, outcome: current.phase === "created" ? "existing" : "resumed" } };
    }
    const legacy = await legacyClient(email);
    const client = structuredClone(legacy || initialClient);
    const record = { version: 1, email, slug: client.slug, ownerKey: client.ownerKey, initialClient: client, submissionHash, phase: legacy ? "created" : "reserved", createdAt: new Date().toISOString() };
    return { value: record, result: { record, outcome: legacy ? "existing" : "created" } };
  });
  const { record, outcome } = reservation;
  if (outcome === "existing") {
    const client = await strictRead("clients", record.slug);
    if (!identityMatches(client, record)) throw new AccountError("account_unavailable");
    return { outcome, created: false, client };
  }
  // Projection retries create only missing records. Never replay the initial snapshot
  // over an owner's edits, build result, calendar tokens or a later service state.
  const client = await atomicUpdate("clients", record.slug, current => {
    if (current !== null) {
      if (!identityMatches(current, record)) throw new AccountError("account_conflict");
      return { result: current };
    }
    return { value: record.initialClient, result: record.initialClient };
  });
  await atomicUpdate("index", "email:" + email, current => {
    if (current !== null && current !== record.slug) throw new AccountError("account_conflict");
    return current === null ? { value: record.slug } : {};
  });
  await atomicUpdate("accounts", key, current => {
    if (!current || current.slug !== record.slug || current.ownerKey !== record.ownerKey) throw new AccountError("account_conflict");
    return current.phase === "created" ? {} : { value: { ...current, phase: "created", projectedAt: new Date().toISOString() } };
  });
  return { outcome, created: outcome === "created", client };
}
