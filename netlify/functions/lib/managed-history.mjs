// Customer-facing SMS history is a projection of durable tenant-owned inbound/reply records.
// Carrier identifiers, internal claims and credentials never belong in this DTO.
import { createHash } from "node:crypto";
import { list } from "./store.mjs";
import { strictRead } from "./accounts.mjs";
import { deliveryTenant } from "./managed-consent.mjs";
import { isSupportedSelfServiceClient } from "./setup.mjs";
const hash = value => createHash("sha256").update(value).digest("hex");
const validPhone = value => /^\+1[2-9]\d{9}$/.test(value || "");
const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null;
function safeText(value, c) {
  let text = typeof value === "string" ? value.slice(0, 3000) : "";
  for (const secret of [c.ownerKey, process.env.SERVICE_WORKER_KEY, process.env.TWILIO_AUTH_TOKEN, process.env.ANTHROPIC_API_KEY, process.env.RESEND_API_KEY]) if (typeof secret === "string" && secret.length >= 8) text = text.split(secret).join("[private value removed]");
  return text.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[authorization removed]")
    .replace(/\b(?:AC|SK|MG|PN|BN|BU|QE|SM|IT|RD|AD|EL|BV)[a-f0-9]{32}\b/gi, "[provider reference removed]")
    .replace(/\b(?:sk-ant-|sk-|re_)[A-Za-z0-9_-]{8,}\b/g, "[API key removed]")
    .replace(/\b(?:EIN|tax\s*(?:ID|number)|employer identification number)\s*[:#-]?\s*\d{2}-?\d{7}\b/gi, "EIN [removed]")
    .replace(/\b\d{2}-\d{7}\b/g, "[tax identifier removed]")
    .replace(/\b[a-f0-9]{64}\b/gi, "[private reference removed]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 1800);
}
const progress = state => ({ queued: "queued", running: "running", failed: "failed", suppressed: "suppressed", waiting_platform: "awaiting_delivery", waiting_consent: "awaiting_delivery", waiting_hours: "awaiting_delivery", sending: "awaiting_delivery", accepted: "awaiting_delivery", uncertain: "uncertain", superseded: "superseded", expired: "expired" })[state] || null;
export async function managedSMSConversations(c, { limit = 60 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Choose from 1 to 100 conversation contacts");
  const current = c?.slug ? await strictRead("clients", c.slug) : null;
  if (!current || !isSupportedSelfServiceClient(current) || deliveryTenant(current) !== deliveryTenant(c)) throw new Error("Conversation workspace changed");
  const tenant = deliveryTenant(current), prefix = `${current.slug}/${tenant}/`, contacts = new Map();
  const group = phone => { if (!contacts.has(phone)) contacts.set(phone, { history: null, inbound: new Map(), updatedAt: "" }); return contacts.get(phone); };
  for (const key of await list("managed_sms_history", prefix)) {
    const contact = key.slice(prefix.length); if (!validPhone(contact)) continue;
    const row = await strictRead("managed_sms_history", key); if (row?.tenant !== tenant || !Array.isArray(row.messages)) continue;
    const target = group(contact); target.history = row; target.updatedAt = date(row.updatedAt) || "";
  }
  for (const key of await list("managed_sms_inbound", prefix)) {
    const row = await strictRead("managed_sms_inbound", key);
    if (!row || row.id !== key || row.slug !== current.slug || row.tenant !== tenant || row.kind !== "conversation" || !validPhone(row.from) || !/^SM[a-f0-9]{32}$/i.test(row.messageSid || "") || key !== prefix + row.messageSid) continue;
    const target = group(row.from); if (!target.inbound.has(row.messageSid)) target.inbound.set(row.messageSid, row);
    const updated = date(row.updatedAt) || date(row.createdAt) || date(row.providerDate) || ""; if (updated > target.updatedAt) target.updatedAt = updated;
  }
  const conversations = [];
  const selected = [...contacts].sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt) || a[0].localeCompare(b[0])).slice(0, limit);
  for (const [contact, target] of selected) {
    let messages = [];
    // Durable inbound jobs preserve every pair and own the SID deduplication. The older
    // rolling history is only a fallback if no authoritative job survives for this contact.
    if (target.inbound.size) {
      const jobs = [...target.inbound.values()].sort((a, b) => (date(a.providerDate) || date(a.createdAt) || "").localeCompare(date(b.providerDate) || date(b.createdAt) || "") || (date(a.createdAt) || "").localeCompare(date(b.createdAt) || "") || a.messageSid.localeCompare(b.messageSid)).slice(-20);
      for (const row of jobs) {
        const content = safeText(row.body, current), at = date(row.providerDate) || date(row.createdAt), processing = progress(row.state);
        if (content) messages.push({ role: "user", content, ...(at ? { at } : {}), ...(processing ? { processing } : {}) });
        if (typeof row.reply === "string" && row.reply.trim()) {
          const replyId = `${current.slug}/${hash(`${tenant}:sms:sms_reply:${row.messageSid}`)}`, delivery = await strictRead("managed_deliveries", replyId);
          if (!delivery || delivery.slug !== current.slug || delivery.tenant !== tenant || delivery.channel !== "sms" || delivery.to !== contact || !["reply", "consent_ask"].includes(delivery.purpose)) continue;
          const reply = safeText(row.reply, current), state = progress(delivery.state) || (delivery.state === "delivered" ? null : "awaiting_delivery"), at = date(delivery.deliveredAt) || date(delivery.acceptedAt) || date(row.updatedAt);
          if (reply) messages.push({ role: "assistant", content: reply, ...(at ? { at } : {}), ...(state ? { processing: state } : {}) });
        }
      }
    } else messages = target.history.messages.filter(message => ["user", "assistant"].includes(message?.role) && typeof message.content === "string").slice(-40).map(message => ({ role: message.role, content: safeText(message.content, current), ...(date(message.at) ? { at: message.at } : {}) })).filter(message => message.content);
    if (messages.length) conversations.push({ channel: "sms", contact, updatedAt: target.updatedAt, messages: messages.slice(-40) });
  }
  return conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.contact.localeCompare(b.contact)).slice(0, limit);
}
