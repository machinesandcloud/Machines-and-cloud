// Durable, local-only workspace repair. No provider, model, email or billing adapters.
import { createHash, randomBytes } from "node:crypto";
import { atomicUpdate, list } from "./store.mjs";
import { strictRead, normalizeAccountEmail } from "./accounts.mjs";
import { configurationRevision, isSupportedSelfServiceClient } from "./setup.mjs";

export class WorkspaceOperationError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const OPERATIONS = "workspace_operations", QUEUE = "platform_operations", ACTIVE = "active_queue_v1", FAILURES = "failure_index_v1";
const KIND = "workspace_rebuild", ATTEMPTS = 3, LEASE_MS = 60000, MAX_ACTIVE = 1000;
const TERMINAL = new Set(["succeeded", "failed", "superseded", "cancelled"]);
const iso = value => new Date(value).toISOString();
const hash = value => createHash("sha256").update(value).digest("hex");
const slugValid = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
const identity = c => hash(JSON.stringify([c.slug, c.ownerKey, normalizeAccountEmail(c.owner?.email)]));
const lifecycle = c => hash(JSON.stringify([c.status, c.pausedAt || null, c.cancelledAt || null, c.liveAt || null, c.operationLifecycleVersion || 0]));
const receiptMatches = (receipt, row) => receipt?.id === row.id && receipt.inputRevision === row.inputRevision && receipt.generation >= (row.requestGeneration || 0);
const lifecycleStopped = (c, row) => c.status === "cancelled" || (row.requestedLifecycle ? lifecycle(c) !== row.requestedLifecycle : c.status === "paused");
const operationId = (slug, revision) => `${slug}/${KIND}/${revision}`;
const validId = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}\/workspace_rebuild\/[a-f0-9]{64}$/.test(value);
const stateDetail = row => ({
  queued: "Your saved business answers are queued for a workspace refresh. You can leave this page.",
  running: "Your workspace is being refreshed from your saved business answers.",
  retry_due: "A temporary storage problem interrupted the refresh. The platform will retry automatically.",
  succeeded: "Your workspace draft has been refreshed from your saved answers. Review and test before activating customer chat.",
  failed: "The automatic refresh could not finish. Your answers are saved; you can retry the refresh.",
  superseded: "Your business answers changed. This older refresh was stopped to preserve your latest answers.",
  cancelled: "This refresh was stopped because the workspace is paused, cancelled or no longer available.",
})[row.state] || "Your saved workspace refresh is waiting for a status update.";

export function workspaceOperationView(row) {
  return { id: row.id, kind: KIND, label: "Refresh workspace", state: row.state, inputRevision: row.inputRevision,
    createdAt: row.createdAt, updatedAt: row.updatedAt, completedAt: row.completedAt || null, attempts: row.attempts || 0,
    nextAttemptAt: row.nextAttemptAt || null, reasonCode: row.reasonCode || null, detail: stateDetail(row),
    nextAction: row.state === "failed" ? { action: "retry_operation", label: "Retry refresh" } : null };
}

function audit(actor, reason) {
  const email = normalizeAccountEmail(actor?.email);
  if (!email || !["owner", "operator"].includes(actor?.role) || typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 300 || /[\u0000-\u001f\u007f]/.test(reason)) {
    throw new WorkspaceOperationError("invalid_operation", "Choose a reason for this workspace refresh.", 400);
  }
  return { actor: { role: actor.role, email }, reason: reason.trim() };
}
async function currentClient(c, expectedRevision, actor) {
  if (!slugValid(c?.slug) || !isSupportedSelfServiceClient(c)) throw new WorkspaceOperationError("workspace_unavailable", "This action requires a customer workspace.");
  const current = await strictRead("clients", c.slug);
  if (!current || !isSupportedSelfServiceClient(current) || identity(current) !== identity(c)) throw new WorkspaceOperationError("workspace_unavailable", "This workspace is no longer available.");
  if (actor.role === "owner" && actor.email !== normalizeAccountEmail(current.owner?.email)) throw new WorkspaceOperationError("forbidden", "This workspace belongs to a different account.", 403);
  if (typeof expectedRevision !== "string" || expectedRevision !== configurationRevision(current)) throw new WorkspaceOperationError("configuration_changed", "Your business answers changed. Reload before requesting a refresh.");
  if (current.status === "cancelled") throw new WorkspaceOperationError("workspace_inactive", "A cancelled workspace cannot be refreshed.");
  return current;
}
function validateQueue(value) {
  if (!value) return { version: 1, intents: {}, cursor: "" };
  if (value.version !== 1 || !value.intents || typeof value.intents !== "object" || Array.isArray(value.intents) || typeof value.cursor !== "string") throw new Error("Workspace queue unavailable");
  return value;
}
function intentFor(row) {
  return { id: row.id, slug: row.slug, kind: KIND, inputRevision: row.inputRevision, tenantIdentity: row.tenantIdentity,
    createdAt: row.createdAt, requestedBy: row.requestedBy, reason: row.reason, requestedStatus: row.requestedStatus, requestedLifecycle: row.requestedLifecycle };
}
async function addIntent(intent) {
  const queueToken = randomBytes(16).toString("hex");
  await atomicUpdate(QUEUE, ACTIVE, value => {
    const queue = validateQueue(value), existing = queue.intents[intent.id];
    if (existing) {
      if (existing.tenantIdentity !== intent.tenantIdentity) throw new WorkspaceOperationError("operation_conflict", "The saved refresh belongs to a different workspace.");
      return {};
    }
    if (Object.keys(queue.intents).length >= MAX_ACTIVE) throw new WorkspaceOperationError("queue_full", "Workspace refresh is temporarily busy. Please try again later.", 503);
    return { value: { ...queue, intents: { ...queue.intents, [intent.id]: { ...intent, queueToken } } } };
  });
}
async function ensureOperation(intent) {
  return atomicUpdate(OPERATIONS, intent.id, current => {
    if (current) {
      if (current.tenantIdentity !== intent.tenantIdentity || current.id !== intent.id || current.inputRevision !== intent.inputRevision) throw new Error("Workspace operation identity conflict");
      return { result: current };
    }
    const row = { version: 1, ...intent, state: "queued", updatedAt: intent.createdAt, attempts: 0, attemptLimit: ATTEMPTS,
      generation: 0, nextAttemptAt: intent.createdAt, reasonCode: null, retryHistory: [] };
    return { value: row, result: row };
  });
}
async function removeIntent(row, selectedIntent) {
  await atomicUpdate(QUEUE, ACTIVE, value => {
    const queue = validateQueue(value);
    if (!queue.intents[row.id] || queue.intents[row.id].tenantIdentity !== row.tenantIdentity || queue.intents[row.id].queueToken !== selectedIntent.queueToken) return {};
    const intents = { ...queue.intents }; delete intents[row.id];
    return { value: { ...queue, intents } };
  });
}
function failureRows(value) {
  if (!value) return {};
  if (value.version !== 1 || !value.failures || typeof value.failures !== "object" || Array.isArray(value.failures)) throw new Error("Workspace exceptions unavailable");
  return value.failures;
}
function resolutionRows(value) {
  if (!value?.resolutions) return {};
  if (typeof value.resolutions !== "object" || Array.isArray(value.resolutions)) throw new Error("Workspace exception resolutions unavailable");
  return value.resolutions;
}
const projectionOrder = (a, b) => (a?.generation || 0) - (b?.generation || 0) || (a?.attempts || 0) - (b?.attempts || 0);
async function syncFailure(row) {
  await atomicUpdate(QUEUE, FAILURES, value => {
    const failures = failureRows(value), resolutions = resolutionRows(value), previous = failures[row.id], resolved = resolutions[row.id];
    if (previous && projectionOrder(previous, row) > 0) return {};
    if (row.state === "failed") {
      if (resolved && projectionOrder(resolved, row) >= 0) return {};
      if (previous && projectionOrder(previous, row) === 0 && previous.reasonCode === row.reasonCode) return {};
      return { value: { version: 1, resolutions, failures: { ...failures, [row.id]: { id: row.id, slug: row.slug, generation: row.generation, attempts: row.attempts, reasonCode: row.reasonCode, at: row.completedAt || row.updatedAt } } } };
    }
    const resolvedState = ["succeeded", "superseded", "cancelled"].includes(row.state);
    const acceptedRetry = row.state === "queued" && row.requestGeneration === row.generation && (row.retryHistory || []).length > 0;
    // Merely observing work in progress does not resolve its attempt. In
    // particular a running final attempt can still durably fail at this pair.
    if (!resolvedState && !acceptedRetry) return {};
    if (!previous && resolved && projectionOrder(resolved, row) >= 0) return {};
    // Clear only after an accepted retry or a durable resolution. An index
    // storage error leaves the active intent to repair this projection later.
    // Persist a monotonic resolution even when no failed projection exists yet:
    // its ETag/order then rejects an older failed PUT arriving after this clear.
    const updated = { ...failures }; delete updated[row.id];
    return { value: { version: 1, failures: updated, resolutions: { ...resolutions, [row.id]: !resolved || projectionOrder(row, resolved) > 0 ? { generation: row.generation, attempts: row.attempts } : resolved } } };
  });
}

export async function queueWorkspaceRebuild(c, { actor, reason, expectedRevision } = {}) {
  const requested = audit(actor, reason), current = await currentClient(c, expectedRevision, requested.actor), at = iso(Date.now());
  const id = operationId(current.slug, expectedRevision), prior = await strictRead(OPERATIONS, id);
  if (prior && prior.tenantIdentity !== identity(current)) throw new WorkspaceOperationError("operation_conflict", "The saved refresh belongs to a different workspace.");
  const newLifecycle = lifecycle(current);
  const explicitRepair = prior && ((prior.requestedLifecycle !== newLifecycle && prior.state !== "succeeded") || (prior.state === "succeeded" && current.build?.status !== "built"));
  if (explicitRepair) {
    const retry = { actor: requested.actor, reason: requested.reason, at, generation: prior.generation, requestedStatus: current.status, requestedLifecycle: newLifecycle, explicitRepair: true };
    await atomicUpdate(QUEUE, ACTIVE, value => {
      const queue = validateQueue(value);
      if (!queue.intents[id] && Object.keys(queue.intents).length >= MAX_ACTIVE) throw new WorkspaceOperationError("queue_full", "Workspace refresh is temporarily busy. Please try again later.", 503);
      return { value: { ...queue, intents: { ...queue.intents, [id]: { ...intentFor(prior), queueToken: randomBytes(16).toString("hex"), retry } } } };
    });
    const repaired = await applyRetryIntent({ ...intentFor(prior), retry }); await syncFailure(repaired);
    return workspaceOperationView(repaired);
  }
  if (prior && TERMINAL.has(prior.state)) return workspaceOperationView(prior);
  const intent = prior ? intentFor(prior) : { id, slug: current.slug, kind: KIND, inputRevision: expectedRevision,
    tenantIdentity: identity(current), createdAt: at, requestedBy: requested.actor, reason: requested.reason, requestedStatus: current.status, requestedLifecycle: newLifecycle };
  // The durable index is the intent. Recovery can reconstruct a missing operation
  // projection if the second write or its response is lost.
  await addIntent(intent);
  return workspaceOperationView(await ensureOperation(intent));
}

export async function listWorkspaceOperations(slug) {
  if (!slugValid(slug)) throw new WorkspaceOperationError("invalid_workspace", "Choose a customer workspace.", 400);
  const queue = validateQueue(await strictRead(QUEUE, ACTIVE));
  for (const intent of Object.values(queue.intents).filter(row => row.slug === slug)) await ensureOperation(intent);
  const keys = await list(OPERATIONS, slug + "/");
  const rows = await Promise.all(keys.map(key => strictRead(OPERATIONS, key)));
  return rows.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, 20).map(workspaceOperationView);
}

export async function retryWorkspaceOperation(c, id, { actor, reason, expectedRevision } = {}) {
  const requested = audit(actor, reason), current = await currentClient(c, expectedRevision, requested.actor);
  if (!validId(id) || !id.startsWith(current.slug + "/")) throw new WorkspaceOperationError("operation_not_found", "This refresh was not found.", 404);
  const prior = await strictRead(OPERATIONS, id);
  if (!prior || prior.tenantIdentity !== identity(current)) throw new WorkspaceOperationError("operation_not_found", "This refresh was not found.", 404);
  if (prior.inputRevision !== expectedRevision) throw new WorkspaceOperationError("configuration_changed", "Your answers changed. Request a refresh for the current answers instead.");
  if (prior.state !== "failed") return workspaceOperationView(prior);
  // Persist retry intent first. The queue carries the retry audit so recovery
  // can finish this transition even if its operation write is interrupted.
  const retry = { actor: requested.actor, reason: requested.reason, at: iso(Date.now()), generation: prior.generation, requestedStatus: current.status, requestedLifecycle: lifecycle(current) };
  await atomicUpdate(QUEUE, ACTIVE, value => {
    const queue = validateQueue(value), old = queue.intents[id];
    if (old?.retry && old.retry.generation === prior.generation) return {};
    if (!old && Object.keys(queue.intents).length >= MAX_ACTIVE) throw new WorkspaceOperationError("queue_full", "Workspace refresh is temporarily busy. Please try again later.", 503);
    return { value: { ...queue, intents: { ...queue.intents, [id]: { ...intentFor(prior), queueToken: randomBytes(16).toString("hex"), retry } } } };
  });
  const retried = await applyRetryIntent({ ...intentFor(prior), retry });
  await syncFailure(retried);
  return workspaceOperationView(retried);
}
async function applyRetryIntent(intent) {
  return atomicUpdate(OPERATIONS, intent.id, current => {
    if (!current || current.tenantIdentity !== intent.tenantIdentity) throw new Error("Workspace retry unavailable");
    if (!intent.retry || (!intent.retry.explicitRepair && current.state !== "failed") || current.generation !== intent.retry.generation) return { result: current };
    const row = { ...current, state: "queued", attemptLimit: current.attempts + ATTEMPTS, updatedAt: intent.retry.at,
      generation: current.generation + 1, requestGeneration: current.generation + 1,
      requestedStatus: intent.retry.requestedStatus, requestedLifecycle: intent.retry.requestedLifecycle,
      nextAttemptAt: intent.retry.at, reasonCode: null, retryHistory: [...(current.retryHistory || []), intent.retry].slice(-20) };
    delete row.completedAt;
    delete row.claim;
    return { value: row, result: row };
  });
}

async function finish(claim, state, at, reasonCode = null, receipt = null) {
  return atomicUpdate(OPERATIONS, claim.id, current => {
    if (!current || current.state !== "running" || current.claim?.token !== claim.claim.token || current.generation !== claim.generation) return { result: current };
    const row = { ...current, state, updatedAt: iso(at), reasonCode, nextAttemptAt: state === "retry_due" ? iso(at + (current.attempts === 1 ? 60000 : 300000)) : null,
      ...(TERMINAL.has(state) ? { completedAt: iso(at) } : {}), ...(receipt ? { receipt } : {}) };
    delete row.claim;
    return { value: row, result: row };
  });
}
async function reconcileReceipt(row) {
  const client = await strictRead("clients", row.slug), receipt = client?.operationReceipts?.[row.inputRevision];
  if (!client || identity(client) !== row.tenantIdentity || !receiptMatches(receipt, row)) return row;
  return atomicUpdate(OPERATIONS, row.id, current => {
    if (!current || current.tenantIdentity !== row.tenantIdentity) throw new Error("Workspace receipt identity conflict");
    if (current.state === "succeeded") return { result: current };
    const next = { ...current, state: "succeeded", receipt, completedAt: receipt.completedAt, updatedAt: iso(Date.now()), nextAttemptAt: null, reasonCode: null };
    delete next.claim;
    return { value: next, result: next };
  });
}
async function execute(intent, at) {
  let row = await ensureOperation(intent);
  if (intent.retry) row = await applyRetryIntent(intent);
  row = await reconcileReceipt(row);
  if (TERMINAL.has(row.state)) return { row, processed: false };
  if (row.state === "running" && Date.parse(row.claim?.until) > at) return { row, processed: false };
  if (row.state !== "running" && Date.parse(row.nextAttemptAt) > at) return { row, processed: false };
  const stop = async (state, code) => atomicUpdate(OPERATIONS, row.id, current => {
    if (!current || TERMINAL.has(current.state) || current.generation > row.generation) return { result: current };
    const stopped = { ...current, state, reasonCode: code, updatedAt: iso(at), completedAt: iso(at), nextAttemptAt: null }; delete stopped.claim;
    return { value: stopped, result: stopped };
  });
  if (row.attempts >= row.attemptLimit) return { row: await stop("failed", "refresh_attempts_exhausted"), processed: false };
  let installed;
  const token = randomBytes(16).toString("hex");
  try {
    // This is the authoritative fence. It lives in the SAME conditional client
    // document as the result patch, and commits before the secondary job claim.
    // Expiry permits a CAS takeover; the clock alone cannot revoke an in-flight
    // HTTP write. A committed newer fence changes the ETag and rejects that write.
    installed = await atomicUpdate("clients", row.slug, current => {
      if (!current || !isSupportedSelfServiceClient(current) || identity(current) !== row.tenantIdentity) return { result: { state: "cancelled", code: "workspace_unavailable" } };
      const receipt = current.operationReceipts?.[row.inputRevision];
      if (receiptMatches(receipt, row)) return { result: { receipt } };
      if (lifecycleStopped(current, row)) return { result: { state: current.status === "paused" || current.status === "cancelled" ? "cancelled" : "superseded", code: "workspace_lifecycle_changed" } };
      if (configurationRevision(current) !== row.inputRevision) return { result: { state: "superseded", code: "configuration_changed" } };
      const prior = current.workspaceOperationClaims?.[row.inputRevision];
      if (prior && prior.generation >= (row.requestGeneration || 0) && Date.parse(prior.until) > at) return { result: { busy: true } };
      const fence = { id: row.id, token, generation: Math.max(row.generation || 0, prior?.generation || 0) + 1, until: iso(at + LEASE_MS) };
      const claims = Object.fromEntries([...Object.entries(current.workspaceOperationClaims || {}).filter(([key]) => key !== row.inputRevision), [row.inputRevision, fence]].slice(-20));
      return { value: { ...current, workspaceOperationClaims: claims }, result: { fence } };
    });
  } catch {
    // A failed fence write is not a newer authoritative generation. Count this
    // known local scheduling attempt, preserving any committed fence for recovery.
    const failed = await atomicUpdate(OPERATIONS, row.id, current => {
      if (!current || TERMINAL.has(current.state) || current.generation !== row.generation || current.attempts !== row.attempts) return { result: current };
      const attempts = current.attempts + 1, exhausted = attempts >= current.attemptLimit;
      const next = { ...current, attempts, state: exhausted ? "failed" : "retry_due", updatedAt: iso(at), reasonCode: "workspace_refresh_unavailable",
        nextAttemptAt: exhausted ? null : iso(at + (attempts === 1 ? 60000 : 300000)), ...(exhausted ? { completedAt: iso(at) } : {}) }; delete next.claim;
      return { value: next, result: next };
    });
    return { row: failed, processed: true };
  }
  if (installed.busy) return { row: await strictRead(OPERATIONS, row.id), processed: false };
  if (installed.receipt) return { row: await reconcileReceipt(row), processed: false };
  if (installed.state) return { row: await stop(installed.state, installed.code), processed: true };
  const fence = installed.fence;
  const claim = await atomicUpdate(OPERATIONS, row.id, current => {
    if (!current || TERMINAL.has(current.state) || current.generation >= fence.generation || current.attempts >= current.attemptLimit) return { result: null };
    const next = { ...current, state: "running", attempts: current.attempts + 1, generation: fence.generation,
      updatedAt: iso(at), nextAttemptAt: null, claim: { token: fence.token, until: fence.until } };
    return { value: next, result: next };
  });
  if (!claim) return { row: await strictRead(OPERATIONS, row.id), processed: false };
  try {
    const result = await atomicUpdate("clients", claim.slug, async current => {
      if (!current || !isSupportedSelfServiceClient(current) || identity(current) !== claim.tenantIdentity) return { result: { state: "cancelled", code: "workspace_unavailable" } };
      // The receipt and deterministic patch commit together. A lost final result
      // is reconciled from this receipt, never treated as permission to rewrite.
      const receipt = current.operationReceipts?.[claim.inputRevision];
      if (receiptMatches(receipt, claim)) return { result: { state: "succeeded", receipt } };
      if (lifecycleStopped(current, claim)) return { result: { state: current.status === "paused" || current.status === "cancelled" ? "cancelled" : "superseded", code: "workspace_lifecycle_changed" } };
      if (configurationRevision(current) !== claim.inputRevision) return { result: { state: "superseded", code: "configuration_changed" } };
      const fence = current.workspaceOperationClaims?.[claim.inputRevision];
      if (fence?.token !== claim.claim.token || fence.generation !== claim.generation || Date.parse(fence.until) <= Date.now()) return { result: { lost: true } };
      const receiptRow = { id: claim.id, inputRevision: claim.inputRevision, generation: claim.generation, completedAt: iso(Date.now()), outcome: "owner_answers_refreshed" };
      const receipts = Object.fromEntries([...Object.entries(current.operationReceipts || {}).filter(([key]) => key !== claim.inputRevision), [claim.inputRevision, receiptRow]].slice(-20));
      const value = { ...current, build: { ...current.build, status: "built", source: "owner_answers", sourcePages: [],
        notes: "Refreshed from your saved business answers. Review and test the current rules before activation.", builtAt: receiptRow.completedAt, operationId: claim.id },
        status: ["new", "building", "build_failed"].includes(current.status) ? "testing" : current.status,
        operationReceipts: receipts, updatedAt: receiptRow.completedAt };
      return { value, result: { state: "succeeded", receipt: receiptRow } };
    });
    if (result.lost) return { row: await strictRead(OPERATIONS, claim.id), processed: true };
    row = await finish(claim, result.state, Date.now(), result.code, result.receipt);
  } catch {
    // Only local deterministic work is implemented. A committed client receipt
    // makes an ambiguous storage response safe to reconcile on the next run.
    row = await finish(claim, claim.attempts < claim.attemptLimit ? "retry_due" : "failed", Date.now(), "workspace_refresh_unavailable");
  }
  return { row, processed: true };
}

export async function recoverWorkspaceOperations({ limit = 10, candidateLimit = 50 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10 || !Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 50) throw new WorkspaceOperationError("invalid_recovery_limit", "Choose a bounded recovery limit.", 400);
  const selected = await atomicUpdate(QUEUE, ACTIVE, value => {
    const queue = validateQueue(value), keys = Object.keys(queue.intents).sort();
    if (!keys.length) return { result: [] };
    let start = keys.findIndex(key => key > queue.cursor); if (start < 0) start = 0;
    const ordered = [...keys.slice(start), ...keys.slice(0, start)].slice(0, candidateLimit);
    return { value: { ...queue, cursor: ordered[ordered.length - 1] }, result: ordered.map(key => queue.intents[key]) };
  });
  const result = { scope: "bounded_candidates", inspected: selected.length, processed: 0, queued: 0, retryDue: 0, running: 0, failed: 0, uncertain: 0, succeeded: 0, oldestQueuedAt: null, openFailures: 0, errors: [] };
  for (const intent of selected) {
    try {
      let current = await ensureOperation(intent);
      if (intent.retry) current = await applyRetryIntent(intent);
      current = await reconcileReceipt(current);
      if (!TERMINAL.has(current.state) && result.processed < limit) {
        const outcome = await execute(intent, Date.now()); current = outcome.row; if (outcome.processed) result.processed++;
      }
      if (!current) throw new Error("Workspace operation disappeared");
      if (current.state === "queued") { result.queued++; if (!result.oldestQueuedAt || current.createdAt < result.oldestQueuedAt) result.oldestQueuedAt = current.createdAt; }
      if (current.state === "retry_due") result.retryDue++;
      if (current.state === "running") result.running++;
      if (current.state === "failed") { result.failed++; result.errors.push({ code: current.reasonCode || "workspace_refresh_failed" }); }
      if (current.state === "succeeded") result.succeeded++;
      // Preserve exception visibility after completed/failed work leaves the
      // active queue. Commit this projection before removing its repair intent.
      await syncFailure(current);
      if (TERMINAL.has(current.state)) await removeIntent(current, intent);
    } catch { result.errors.push({ code: "workspace_storage_unavailable" }); }
  }
  result.openFailures = Object.keys(failureRows(await strictRead(QUEUE, FAILURES))).length;
  result.errors = result.errors.slice(0, 10);
  result.ok = result.errors.length === 0 && result.openFailures === 0;
  return result;
}
