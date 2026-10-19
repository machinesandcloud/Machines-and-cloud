// Storage on Netlify Blobs. One store per kind; keys are "<slug>/<id>" so a client's
// records list by prefix. All reads/writes are JSON.
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const stores = {};
function store(name) {
  if (!stores[name]) stores[name] = getStore({ name, consistency: "strong" });
  return stores[name];
}

export const id = (n = 6) => randomBytes(n).toString("hex");
export const secret = () => randomBytes(24).toString("hex");
export const now = () => new Date().toISOString();

// Blobs turns "+" in a key into a space; phone numbers are E.164, so encode the plus.
const safe = (k) => String(k).replace(/\+/g, "~");
export const unsafe = (k) => String(k).replace(/~/g, "+");
export async function get(kind, key) {
  try { return await store(kind).get(safe(key), { type: "json" }); } catch { return null; }
}
export async function put(kind, key, value) {
  await store(kind).setJSON(safe(key), value);
  return value;
}
export async function del(kind, key) {
  try { await store(kind).delete(safe(key)); } catch { /* ignore */ }
}
export async function list(kind, prefix = "") {
  const { blobs } = await store(kind).list({ prefix: safe(prefix) });
  return blobs.map((b) => unsafe(b.key)).sort();
}
export async function listJSON(kind, prefix = "", limit = 200) {
  const keys = (await list(kind, prefix)).slice(-limit);
  const items = await Promise.all(keys.map((k) => get(kind, k)));
  return items.filter(Boolean);
}

// ---- Clients ----
export const getClient = (slug) => get("clients", slug);
export const saveClient = (client) => put("clients", client.slug, { ...client, updatedAt: now() });
export const clientByEmail = async (email) => {
  const slug = await get("index", "email:" + email.toLowerCase());
  return slug ? getClient(slug) : null;
};
export const clientByNumber = async (e164) => {
  const slug = await get("index", "number:" + e164);
  return slug ? getClient(slug) : null;
};
export async function indexClient(client) {
  if (client.owner?.email) await put("index", "email:" + client.owner.email.toLowerCase(), client.slug);
  if (client.phone?.twilioNumber) await put("index", "number:" + client.phone.twilioNumber, client.slug);
}

// ---- Conversations: one per client+channel+contact ----
export const convKey = (slug, channel, contact) => `${slug}/${channel}/${contact}`;
export async function getConversation(slug, channel, contact) {
  return (await get("conversations", convKey(slug, channel, contact))) || { slug, channel, contact, messages: [], createdAt: now() };
}
export async function saveConversation(conv) {
  conv.updatedAt = now();
  conv.messages = conv.messages.slice(-40);
  return put("conversations", convKey(conv.slug, conv.channel, conv.contact), conv);
}

// ---- Leads, bookings, tasks, events ----
export async function addRecord(kind, slug, data) {
  const rec = { id: id(5), slug, createdAt: now(), ...data };
  await put(kind, `${slug}/${rec.id}`, rec);
  return rec;
}
export const getRecord = (kind, slug, recId) => get(kind, `${slug}/${recId}`);
export const saveRecord = (kind, rec) => put(kind, `${rec.slug}/${rec.id}`, { ...rec, updatedAt: now() });
export const listRecords = (kind, slug, limit) => listJSON(kind, slug + "/", limit);

// Tasks are keyed by due time so the scheduler can list what is due.
export async function scheduleTask(slug, dueAt, type, data) {
  const due = new Date(dueAt).toISOString();
  const rec = { id: id(5), slug, type, dueAt: due, data, createdAt: now() };
  await put("tasks", `${due}_${rec.id}`, rec);
  return rec;
}
export async function dueTasks(beforeISO) {
  const keys = (await list("tasks", "")).filter((k) => k.slice(0, 24) <= beforeISO);
  const items = await Promise.all(keys.map(async (k) => ({ key: k, task: await get("tasks", k) })));
  return items.filter((i) => i.task);
}
export async function cancelTasks(slug, predicate) {
  const keys = await list("tasks", "");
  for (const k of keys) {
    const t = await get("tasks", k);
    if (t && t.slug === slug && predicate(t)) await del("tasks", k);
  }
}
export async function cancelTasksForNumber(e164Number) {
  const keys = await list("tasks", "");
  let n = 0;
  for (const k of keys) {
    const t = await get("tasks", k);
    if (!t) continue;
    const rec = t.data?.bookingId ? await get("bookings", `${t.slug}/${t.data.bookingId}`) : t.data?.leadId ? await get("leads", `${t.slug}/${t.data.leadId}`) : null;
    if (rec && rec.phone === e164Number) { await del("tasks", k); n++; }
  }
  return n;
}
export async function logEvent(slug, type, data = {}) {
  const rec = { id: id(4), slug, type, data, at: now() };
  await put("events", `${slug}/${rec.at}_${rec.id}`, rec);
  return rec;
}
