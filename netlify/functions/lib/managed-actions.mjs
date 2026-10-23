// Shared call/SMS mutation dispatcher. One provider event + tool ID owns one immutable action.
import { createHash, randomBytes } from "node:crypto";
import { atomicUpdate, getAvailability } from "./store.mjs";
import { strictRead } from "./accounts.mjs";
import { deliveryTenant } from "./managed-consent.mjs";
import { isSupportedSelfServiceClient, configurationRevision } from "./setup.mjs";
import { bookVisit, flagLead } from "./desk.mjs";
import { appointmentTextInvitation, appointmentTextVoiceInstruction } from './appointment-texts.mjs';
const hash = value => createHash("sha256").update(value).digest("hex");
const canonical = value => value && typeof value === "object" ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export async function dispatchManagedVoiceTool({ client, callId, toolCallId, name, input, caller = "", channel = "call" }) {
  if (!client || !["call", "sms"].includes(channel) || !/^[a-zA-Z0-9_-]{1,120}$/.test(callId || "") || !/^[a-zA-Z0-9_-]{1,160}$/.test(toolCallId || "") || !input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 8000) throw new Error("Invalid service action");
  const c = await strictRead("clients", client.slug);
  if (!c || !isSupportedSelfServiceClient(c) || deliveryTenant(client) !== deliveryTenant(c) || !["testing", "live"].includes(c.status) || configurationRevision(client) !== configurationRevision(c)) throw new Error("The shop setup changed. No new action was taken.");
  if (name === "get_availability") return JSON.stringify(await getAvailability(c, input.date, input.days));
  if (!["book_visit", "notify_owner"].includes(name)) throw new Error("Unknown front desk action");
  const actionId = hash(JSON.stringify([deliveryTenant(c), channel, callId, toolCallId])), key = `${c.slug}/${actionId}`;
  const args = { ...input, phone: /^\+1[2-9]\d{9}$/.test(input.phone || "") ? input.phone : /^\+1[2-9]\d{9}$/.test(caller) ? caller : "" };
  const digest = hash(JSON.stringify(canonical({ name, input: args }))), token = randomBytes(16).toString("hex");
  const claim = await atomicUpdate("managed_actions", key, row => {
    if (row && (row.digest !== digest || row.tenant !== deliveryTenant(c))) throw new Error("The same action ID cannot be reused for different details");
    if (row?.state === "completed") return { result: { result: row.result } };
    if (row?.claim && Date.parse(row.claim.until) > Date.now()) return { result: { busy: true } };
    const next = { ...(row || {}), id: actionId, slug: c.slug, tenant: deliveryTenant(c), name, digest, state: "running", input: args, createdAt: row?.createdAt || new Date().toISOString(), claim: { token, until: new Date(Date.now() + 60000).toISOString() } };
    return { value: next, result: { acquired: true } };
  });
  if (claim.result !== undefined) return claim.result;
  if (!claim.acquired) throw new Error("That request is already being saved. Retry this same action shortly; do not create a replacement.");
  const context = { channel, contact: caller || callId, managedActionId: actionId };
  const result = name === "book_visit" ? await bookVisit(c, args, context) : await flagLead(c, args, context);
  const invitation = name === 'book_visit' && !result.full && channel === 'call' ? await appointmentTextInvitation(c, result) : null;
  const text = result.full ? result.message : name === "book_visit" ? `Visit saved, reference ${result.id}. The shop has the details in its workspace and confirms arrival details directly. Do not claim a message was delivered or a calendar changed.${appointmentTextVoiceInstruction(invitation)}` : `Request saved, reference ${result.id}. The shop can review it in its workspace. A callback time has not been confirmed. Do not claim anyone was texted or dispatched.`;
  await atomicUpdate("managed_actions", key, row => {
    if (!row || row.claim?.token !== token) throw new Error("Action receipt ownership changed");
    return { value: { ...row, state: "completed", claim: null, recordId: result.id || null, result: text, completedAt: new Date().toISOString() } };
  });
  return text;
}
