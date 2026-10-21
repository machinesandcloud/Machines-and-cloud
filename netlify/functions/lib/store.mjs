// Storage on Netlify Blobs. One store per kind; keys are "<slug>/<id>" so a client's
// records list by prefix. All reads/writes are JSON.
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { normalizeDate } from "./calendar.mjs";
import { canonicalWindow, listedWindows, listedWindow, requestedDate, addDays, isoDateValid, isElapsedWindow, AvailabilityInputError } from "./availability.mjs";
export { canonicalWindow } from "./availability.mjs";

// Opened per call, never cached at module level: a warm function instance that outlives the Blobs
// token would otherwise fail every write with "Token expired".
// MC_MEMORY_STORE=1 (the deploy smoke test) swaps Blobs for an in-process Map with the same four calls.
const memory = new Map();
let memoryRevision = 0;
function memStore(name) {
  if (!memory.has(name)) memory.set(name, new Map());
  const m = memory.get(name);
  return {
    async get(key, opts) { const v = m.get(key); return v === undefined ? null : (opts?.type === "json" ? JSON.parse(v.value) : v.value); },
    async getWithMetadata(key, opts) { const v = m.get(key); return v === undefined ? null : { data: opts?.type === "json" ? JSON.parse(v.value) : v.value, etag: v.etag, metadata: {} }; },
    async setJSON(key, value, opts = {}) {
      const current = m.get(key);
      if ((opts.onlyIfNew && current) || (opts.onlyIfMatch && current?.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = String(++memoryRevision); m.set(key, { value: JSON.stringify(value), etag });
      return { modified: true, etag };
    },
    async delete(key) { m.delete(key); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
function store(name) {
  if (process.env.MC_MEMORY_STORE === "1") return memStore(name);
  return getStore({ name, consistency: "strong" });
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

// Netlify's conditional writes arbitrate between function instances. Never turn a failed read into
// an empty value here: capacity must fail closed when storage cannot be read.
export async function atomicUpdate(kind, key, update) {
  const s = store(kind), k = safe(key);
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await s.getWithMetadata(k, { type: "json", consistency: "strong" });
    const next = await update(current?.data ?? null);
    if (!Object.hasOwn(next, "value")) return next.result;
    if (current && !current.etag) throw new Error("Conditional storage read returned no ETag");
    const written = await s.setJSON(k, next.value, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (written.modified) {
      // The installed SDK also returns modified:true for some failed conditional responses.
      // A successful write must include its ETag; otherwise retain any prior claim and fail closed.
      if (!written.etag) throw new Error("Conditional storage write returned no ETag");
      return next.result;
    }
  }
  throw new Error("Booking capacity changed too often; please retry");
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
export async function saveRecord(kind, rec, { capacityClaim } = {}) {
  if (kind !== "bookings") return put(kind, `${rec.slug}/${rec.id}`, { ...rec, updatedAt: now() });
  const owned = !!capacityClaim;
  const claim = capacityClaim || (ACTIVE_BOOKINGS.has(rec.status)
    ? await reserveBookingWindow((await getClient(rec.slug)) || { slug: rec.slug }, rec.id, rec.date, rec.window, undefined, { requireExisting: true })
    : await lockBookingWindow(rec.slug, rec.id));
  if (claim.full) throw new Error("Booking window is full; reload it and retry");
  // An internal reschedule keeps ownership until both record and reservation are committed.
  await atomicUpdate("index", capacityKey(rec.slug), (state) => {
    if (state?.mutations?.[rec.id] !== claim.token) throw new Error("Booking mutation ownership lost");
    return {};
  });
  // Any write exception keeps the token and claims. SDK retries can commit an earlier attempt
  // even when the final response is a 4xx, so the exception is never proof that rollback is safe.
  const saved = await put(kind, `${rec.slug}/${rec.id}`, { ...rec, updatedAt: now() });
  if (!owned) await finishBookingWindow(rec.slug, rec.id, claim);
  return saved;
}
export const listRecords = (kind, slug, limit) => listJSON(kind, slug + "/", limit);

const ACTIVE_BOOKINGS = new Set(["booked", "confirmed", "on_the_way"]);
const bookingSlot = (date, window) => date && window ? `${normalizeDate(date)}|${canonicalWindow(window)}` : "";
const capacityKey = (slug) => `capacity:${slug}`;
const capacityLimit = (c) => Math.max(1, Number(c.rules?.windowCapacity) || 1);
async function initialCapacity(slug) {
  const reservations = {};
  // This is a one-time migration. Read every key, with strong reads that propagate errors; booking
  // ids sort randomly, so a truncated history can exclude a current reservation.
  for (const key of await list("bookings", slug + "/")) {
    const b = await store("bookings").get(safe(key), { type: "json", consistency: "strong" });
    if (b && ACTIVE_BOOKINGS.has(b.status)) { const slot = bookingSlot(b.date, b.window); if (slot) reservations[b.id] = [slot]; }
  }
  return { version: 1, reservations, mutations: {}, blocks: [] };
}
const blockedWindow = (state, date, window) => (state.blocks || []).some((b) => b.date === date && (!b.windowKey || b.windowKey === canonicalWindow(window)));
const reservedCount = (state, slot) => Object.values(state.reservations).filter((slots) => slots.includes(slot)).length;
function blockCount(state, date, windowKey) {
  return Object.values(state.reservations).filter((slots) => slots.some((slot) => windowKey ? slot === `${date}|${windowKey}` : slot.startsWith(date + "|"))).length;
}
function blockViews(state) {
  return (state.blocks || []).map((b) => ({ date: b.date, window: b.window, existingBookings: blockCount(state, b.date, b.windowKey) })).sort((a, b) => a.date.localeCompare(b.date) || a.window.localeCompare(b.window));
}
function openingsFromState(c, state, date, days) {
  const dates = Array.from({ length: days }, (_, n) => addDays(date, n)).filter(isoDateValid);
  return { timezone: "America/Chicago", from: date, days: dates.length, openings: dates.map((day) => {
    return { date: day, windows: listedWindows(c).filter((window) => !isElapsedWindow(day, window) && !blockedWindow(state, day, window) && reservedCount(state, bookingSlot(day, window)) < capacityLimit(c)) };
  }) };
}
export async function getAvailability(c, date, days) {
  const from = requestedDate(date);
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new AvailabilityInputError("invalid_days", "Check from 1 to 14 consecutive dates.");
  if (!isoDateValid(addDays(from, days - 1))) throw new AvailabilityInputError("invalid_days", "The entire checked range must use real YYYY-MM-DD dates.");
  return atomicUpdate("index", capacityKey(c.slug), async (current) => {
    const state = current || await initialCapacity(c.slug);
    return { ...(!current ? { value: state } : {}), result: openingsFromState(c, state, from, days) };
  });
}
export async function getAvailabilityBlocks(c) {
  return atomicUpdate("index", capacityKey(c.slug), async (current) => {
    const state = current || await initialCapacity(c.slug);
    return { ...(!current ? { value: state } : {}), result: blockViews(state) };
  });
}
export async function setAvailabilityBlock(c, date, window = "", blocked = true) {
  const day = requestedDate(date, { isoOnly: true, allowPast: !blocked });
  if (typeof window !== "string") throw new AvailabilityInputError("invalid_window", "Choose a listed window or the whole date.");
  const wholeDay = window === "";
  return atomicUpdate("index", capacityKey(c.slug), async (current) => {
    const state = current || await initialCapacity(c.slug);
    const blocks = state.blocks || [];
    const key = wholeDay ? "" : canonicalWindow(window);
    const existing = blocks.find((b) => b.date === day && b.windowKey === key);
    const label = wholeDay ? "" : listedWindow(c, window) || (!blocked && existing ? existing.window : "");
    if (!wholeDay && !label) throw new AvailabilityInputError("invalid_window", "Choose one of the shop's listed arrival windows.");
    let changed = false;
    if (blocked && !existing) {
      // Count all retained blocks, including past ones. Past blocks remain removable; nothing
      // expires or frees a reservation behind an owner's back.
      if (blocks.length >= 100) throw new AvailabilityInputError("too_many_blocks", "Remove an old block before adding another (100 maximum).");
      state.blocks = [...blocks, { date: day, window: label, windowKey: key }]; changed = true;
    } else if (!blocked && existing) { state.blocks = blocks.filter((b) => b !== existing); changed = true; }
    const existingBookings = blockCount(state, day, key);
    const notice = blocked && existingBookings ? `${existingBookings} already reserved visit${existingBookings === 1 ? " remains" : "s remain"} unchanged. This block stops new reservations.` : "";
    return { ...(changed || !current ? { value: state } : {}), result: { ok: true, availabilityBlocks: blockViews(state), existingBookings, notice } };
  });
}
export async function bookingWindowTaken(c, date, window) {
  const slot = bookingSlot(date, window), capacity = capacityLimit(c);
  if (!slot) return { full: false, count: 0, capacity };
  return atomicUpdate("index", capacityKey(c.slug), async (current) => {
    const state = current || await initialCapacity(c.slug);
    const count = reservedCount(state, slot), blocked = blockedWindow(state, normalizeDate(date), window);
    return { ...(!current ? { value: state } : {}), result: { full: blocked || count >= capacity, count, capacity, ...(blocked ? { blocked: true } : {}) } };
  });
}
export async function reserveBookingWindow(c, bookingId, date, window, from, { requireExisting = false } = {}) {
  let targetDate = date, targetWindow = window;
  if (!requireExisting) {
    try { targetDate = requestedDate(date); }
    catch (err) { if (!(err instanceof AvailabilityInputError)) throw err; return { full: true, reason: err.code, message: `Nothing was booked. ${err.message}` }; }
    targetWindow = listedWindow(c, window);
    if (!targetWindow) return { full: true, reason: "invalid_window", message: "Nothing was booked. That is not a listed arrival window. Check availability for a listed window." };
  }
  const slot = bookingSlot(targetDate, targetWindow), capacity = capacityLimit(c), token = id(12);
  return atomicUpdate("index", capacityKey(c.slug), async (current) => {
    const state = current || await initialCapacity(c.slug);
    state.mutations ||= {};
    if (state.mutations[bookingId]) throw new Error("Booking is being updated; reload it and retry");
    const previous = state.reservations[bookingId] || [];
    // Ordinary updates must not resurrect a booking whose cancellation completed after the
    // caller read it. Only explicit creation/rescheduling may acquire a new reservation.
    if (requireExisting && !previous.includes(slot)) throw new Error("Booking changed; reload it before saving");
    if (from && (previous.length !== 1 || previous[0] !== bookingSlot(from.date, from.window))) throw new Error("Booking changed during reschedule; reload it and retry");
    if (!from && previous.length && !previous.includes(slot)) throw new Error("Booking changed; reload it before saving");
    if (!previous.includes(slot) && isElapsedWindow(targetDate, targetWindow)) return { ...(!current ? { value: state } : {}), result: { full: true, reason: "elapsed", availability: openingsFromState(c, state, targetDate, 7) } };
    if (!previous.includes(slot) && blockedWindow(state, targetDate, targetWindow)) return { ...(!current ? { value: state } : {}), result: { full: true, reason: "blocked", message: "Nothing was booked. That date or window is unavailable. Check availability for another option.", availability: openingsFromState(c, state, targetDate, 7) } };
    const count = slot ? Object.entries(state.reservations).filter(([id, slots]) => id !== bookingId && slots.includes(slot)).length : 0;
    if (slot && !previous.includes(slot) && count >= capacity) return { ...(!current ? { value: state } : {}), result: { full: true, reason: "full", count, capacity, availability: openingsFromState(c, state, targetDate, 7) } };
    // A move holds both windows until its booking write succeeds. A crash therefore blocks spare
    // capacity instead of freeing a slot while an active booking still points at it.
    const next = slot && !previous.includes(slot) ? [...previous, slot] : previous;
    if (next.length) state.reservations[bookingId] = next;
    state.mutations[bookingId] = token;
    return { value: state, result: { token, slot, previous, next, date: targetDate, window: targetWindow } };
  });
}
export async function finishBookingWindow(slug, bookingId, claim) {
  await atomicUpdate("index", capacityKey(slug), (state) => {
    if (state?.mutations?.[bookingId] !== claim.token || JSON.stringify(state.reservations[bookingId] || []) !== JSON.stringify(claim.next)) throw new Error("Booking reservation changed before completion");
    const slots = claim.release || !claim.slot ? [] : [claim.slot];
    if (slots.length) state.reservations[bookingId] = slots; else delete state.reservations[bookingId];
    delete state.mutations[bookingId];
    return { value: state };
  });
}
async function lockBookingWindow(slug, bookingId) {
  const token = id(12);
  return atomicUpdate("index", capacityKey(slug), async (current) => {
    const state = current || await initialCapacity(slug);
    state.mutations ||= {};
    if (state.mutations[bookingId]) throw new Error("Booking is being updated; reload it and retry");
    const previous = state.reservations[bookingId] || [];
    state.mutations[bookingId] = token;
    return { value: state, result: { token, release: true, previous, next: previous } };
  });
}

// Per-phone index: "bookings:<slug>:<phone>" and "leads:<slug>:<phone>" hold the record ids for that number,
// so the hot paths (every inbound text, every call) read a handful of records instead of listing the history.
export async function addToIndex(kind, slug, phone, recId) {
  if (!phone) return;
  const k = `${kind}:${slug}:${phone}`;
  const ids = (await get("index", k)) || [];
  if (!ids.includes(recId)) { ids.push(recId); await put("index", k, ids.slice(-100)); }
}
export async function recordsFor(kind, slug, phone) {
  if (!phone) return [];
  const ids = (await get("index", `${kind}:${slug}:${phone}`)) || [];
  const recs = await Promise.all(ids.map((id) => getRecord(kind, slug, id)));
  return recs.filter(Boolean);
}
// The latest customer contact per shop, written by the webhooks, read by the health alerts.
export async function noteInbound(slug, kind = "text") {
  const cur = (await get("health", "lastInbound:" + slug)) || {};
  const at = now(); cur.at = at; cur[kind === "call" ? "call" : "text"] = at;
  await put("health", "lastInbound:" + slug, cur);
}
export const lastInbound = async (slug) => (await get("health", "lastInbound:" + slug)) || null;

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
