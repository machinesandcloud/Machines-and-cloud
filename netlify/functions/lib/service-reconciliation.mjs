// Operator requests only recheck work already authorized by the customer.
// The audited client receipt is primary; a fair scheduled scan repairs a lost
// job/index projection. No approval, provider resource or message is fabricated.
import { randomBytes } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { strictRead } from "./accounts.mjs";
import { isSupportedSelfServiceClient } from "./setup.mjs";
import { deliveryTenant } from "./managed-consent.mjs";
import { dispatchVoiceActivationWave } from "./voice-activation.mjs";
import { dispatchCalendarDeliveryWave } from "./calendar-delivery.mjs";
import { dispatchManagedDeliveryWave } from "./managed-delivery.mjs";
import { dispatchServiceWorker } from "./managed-sms.mjs";
const STORE = "service_reconciliations", INDEX = "service_reconciliation_queue", KEY = "active_v1", iso = () => new Date().toISOString();
const terminal = state => ["checks_dispatched", "needs_attention", "superseded"].includes(state);
const valid = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const dto = row => ({ id: row.id, state: row.state, at: row.createdAt, updatedAt: row.updatedAt, attempts: row.attempts || 0, reasonCode: row.reasonCode || null, workers: row.workers || {}, detail: row.state === "checks_dispatched" ? "Existing authorized service checks were requested. This does not confirm activation or delivery." : row.state === "waiting_platform" ? "The request is saved. Service checks are waiting for the platform execution gates." : row.state === "needs_attention" ? "Service checks could not be dispatched after three attempts. Existing resource and delivery receipts are retained." : row.state === "retry" ? "Service checks are saved and waiting for a bounded retry." : "A service-check request is saved. Existing customer approvals and delivery safeguards still apply." });
function queueValue(value) { if (!value) return { version: 1, intents: {}, cursor: "" }; if (value.version !== 1 || !value.intents || typeof value.intents !== "object" || Array.isArray(value.intents)) throw new Error("Service reconciliation index unavailable"); return value; }
async function finalize(row, key) {
  if (!terminal(row.state)) return;
  if (["needs_attention","checks_dispatched"].includes(row.state)) await atomicUpdate("service_reconciliation_health", KEY, current => { const failures = { ...(current?.failures || {}) }, previous = failures[row.tenant]; if (previous && (previous.sequence || 0) > (row.sequence || 0)) return {}; failures[row.tenant] = { id:row.id,at:row.updatedAt,sequence:row.sequence || 0,failed:row.state === 'needs_attention' }; return { value:{version:1,failures} }; });
  await atomicUpdate(INDEX, KEY, value => { const queue = queueValue(value), intents = { ...queue.intents }; delete intents[key]; return { value: { ...queue, intents } }; });
}
async function project(c, request) {
  const key = c.slug + "/" + request.id, tenant = deliveryTenant(c);
  const row = await atomicUpdate(STORE, key, current => current ? { result: current } : { value: { id: request.id, slug: c.slug, tenant, sequence:request.sequence || 0, state: "queued", actor: request.actor, reason: request.reason, createdAt: request.at, updatedAt: request.at, attempts: 0 }, result: { id: request.id, slug: c.slug, tenant, sequence:request.sequence || 0, state: "queued", actor: request.actor, reason: request.reason, createdAt: request.at, updatedAt: request.at, attempts: 0 } });
  if (row.tenant !== tenant) throw new Error("Service reconciliation identity changed");
  if (!terminal(row.state)) await atomicUpdate(INDEX, KEY, value => { const queue = queueValue(value); if (!queue.intents[key] && Object.keys(queue.intents).length >= 1000) throw new Error("Service check queue is full"); return { value: { ...queue, intents: { ...queue.intents, [key]: { slug: c.slug, id: request.id, tenant } } } }; });
  return row;
}
async function source(slug, id, tenant) {
  const c = await strictRead("clients", slug), request = c?.management?.serviceReconciliations?.find(row => row.id === id);
  return c && isSupportedSelfServiceClient(c) && deliveryTenant(c) === tenant && request && request.tenant === tenant ? { c, request } : null;
}
async function process(key) {
  const preview = await strictRead(STORE, key); if (!preview) return preview; if (terminal(preview.state)) { await finalize(preview,key); return preview; }
  const token = randomBytes(16).toString("hex"), row = await atomicUpdate(STORE, key, current => {
    if (!current || terminal(current.state) || current.claim && Date.parse(current.claim.until) > Date.now() || current.nextAttemptAt && Date.parse(current.nextAttemptAt) > Date.now()) return { result: null };
    return { value: { ...current, state: "running", claim: { token, until: new Date(Date.now() + 60000).toISOString() }, updatedAt: iso() }, result: { ...current, claim: { token } } };
  });
  if (!row) return preview;
  const saved = await source(row.slug, row.id, row.tenant);
  if (!saved) return atomicUpdate(STORE, key, current => current?.claim?.token === token ? { value: { ...current, state: "superseded", claim: null, reasonCode: "workspace_changed", updatedAt: iso() }, result: { ...current, state: "superseded" } } : { result: current });
  const outcomes = {};
  // Each function chooses only its fixed same-site worker and independently
  // enforces the execution gate and existing recorded customer authority.
  for (const [name, dispatch] of [
    ["voice", () => dispatchVoiceActivationWave()],
    ["calendar", () => dispatchCalendarDeliveryWave()],
    ["messages", () => dispatchManagedDeliveryWave()],
    ["texting_setup", () => dispatchServiceWorker("service-activation-background", { slug: saved.c.slug, tenant: row.tenant })],
  ]) {
    const current = await source(row.slug, row.id, row.tenant); if (!current) { outcomes[name] = "unavailable"; continue; }
    try { const value = await dispatch(); outcomes[name] = value === true || value?.dispatched === true ? "requested" : value?.ok === false ? "failed" : "unavailable"; }
    catch { outcomes[name] = "failed"; }
  }
  const failed = Object.values(outcomes).includes("failed"), dispatched = Object.values(outcomes).includes("requested"), attempts = (row.attempts || 0) + (failed || dispatched ? 1 : 0), state = failed ? attempts >= 3 ? "needs_attention" : "retry" : dispatched ? "checks_dispatched" : "waiting_platform";
  const updated = await atomicUpdate(STORE, key, current => {
    if (current?.claim?.token !== token) return { result: current };
    const value = { ...current, state, workers: outcomes, attempts, claim: null, updatedAt: iso(), nextAttemptAt: terminal(state) ? null : new Date(Date.now() + 600000).toISOString(), reasonCode: failed ? "worker_dispatch_unconfirmed" : !dispatched ? "execution_gates_closed" : null };
    return { value, result: value };
  });
  // Preserve the immutable actor/reason/audit and update only this diagnostic
  // receipt. Management revision changes only when an operator requests work.
  await atomicUpdate("clients", row.slug, c => c && deliveryTenant(c) === row.tenant ? { value: { ...c, management: { ...c.management, serviceReconciliations: (c.management?.serviceReconciliations || []).map(item => item.id === row.id ? { ...item, state: updated.state, updatedAt: updated.updatedAt } : item) } } } : {});
  await finalize(updated,key);
  return updated;
}
export async function queueServiceReconciliation(c, id) {
  if (!valid(id)) throw new Error("Invalid service-check request");
  const saved = await source(c.slug, id, deliveryTenant(c)); if (!saved) throw new Error("Service check must have an audited customer receipt");
  const row = await project(saved.c, saved.request); return dto(row);
}
export async function runServiceReconciliation(c, id) {
  await queueServiceReconciliation(c, id); const row = await process(c.slug + "/" + id); return dto(row);
}
export async function serviceReconciliationView(c) {
  const output = [];
  for (const request of (c.management?.serviceReconciliations || []).slice(-20).reverse()) {
    if (request.tenant !== deliveryTenant(c)) continue;
    const row = await strictRead(STORE, c.slug + "/" + request.id); output.push(row?.tenant === deliveryTenant(c) ? dto(row) : { id: request.id, state: "queued", at: request.at, updatedAt: request.at, attempts: 0, reasonCode: "projection_pending", workers: {}, detail: "The audited request is saved. Its queue receipt is being recovered." });
  }
  return output;
}
export async function recoverServiceReconciliations({ limit = 1, discoveryLimit = 20 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 2 || !Number.isInteger(discoveryLimit) || discoveryLimit < 1 || discoveryLimit > 25) throw new Error("Choose bounded service-check limits");
  const all = await list("clients", ""), cursor = await strictRead("service_reconciliation_scan", "clients"), keys = [...all.filter(key => key > (cursor?.after || "")), ...all.filter(key => key <= (cursor?.after || ""))].slice(0, discoveryLimit);
  for (const slug of keys) { const c = await strictRead("clients", slug); if (!isSupportedSelfServiceClient(c)) continue; for (const request of (c.management?.serviceReconciliations || []).slice(-20)) if (request.tenant === deliveryTenant(c) && !terminal(request.state)) await project(c, request); }
  if (keys.length) await atomicUpdate("service_reconciliation_scan", "clients", () => ({ value: { after: keys.at(-1), at: iso() } }));
  const chosen = await atomicUpdate(INDEX, KEY, value => { const queue = queueValue(value), ids = Object.keys(queue.intents).sort(); if (!ids.length) return { result: [] }; let start = ids.findIndex(id => id > queue.cursor); if (start < 0) start = 0; const page = [...ids.slice(start), ...ids.slice(0, start)].slice(0, limit); return { value: { ...queue, cursor: page.at(-1) }, result: page }; });
  let processed = 0;
  for (const key of chosen) { await process(key); processed++; }
  const queue = queueValue(await strictRead(INDEX, KEY)), pending = Object.keys(queue.intents).length;
  const openFailures = Object.values((await strictRead("service_reconciliation_health",KEY))?.failures || {}).filter(row => row.failed !== false).length;
  return { ok: openFailures === 0, processed, pending, discovered: keys.length, openFailures };
}
