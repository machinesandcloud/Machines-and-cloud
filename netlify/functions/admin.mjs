// Steve's admin API (ADMIN_KEY env). GET lists clients; POST updates the fields owners cannot touch
// (Twilio number, voice destination, status) or deletes a client.
import { getClient, saveClient, indexClient, list, del, listRecords, logEvent } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";
import { e164 } from "./lib/send.mjs";

export const config = { path: "/api/admin" };

export default async (req) => {
  const key = process.env.ADMIN_KEY;
  if (!key) return json({ error: "admin_not_configured" }, 503);
  if (req.headers.get("x-admin-key") !== key) return json({ error: "forbidden" }, 403);
  if (req.method === "GET") {
    const slugs = await list("clients", "");
    const out = [];
    for (const s of slugs) { const c = await getClient(s); if (c) out.push({ slug: c.slug, name: c.business?.name, status: c.status, plan: c.plan, owner: c.owner, phone: c.phone, build: c.build?.status, createdAt: c.createdAt, portal: `${process.env.URL}/desk?c=${c.slug}&k=${c.ownerKey}` }); }
    return json({ clients: out });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const c = await getClient(b.slug || "");
  if (!c) return json({ error: "not_found" }, 404);
  if (b.action === "delete") {
    for (const kind of ["bookings", "leads", "conversations", "events"]) for (const k of await list(kind, c.slug + "/")) await del(kind, k);
    for (const k of await list("tasks", "")) { const t = await (await import("./lib/store.mjs")).get("tasks", k); if (t?.slug === c.slug) await del("tasks", k); }
    if (c.owner?.email) await del("index", "email:" + c.owner.email.toLowerCase());
    if (c.phone?.twilioNumber) await del("index", "number:" + c.phone.twilioNumber);
    await del("clients", c.slug);
    return json({ ok: true, deleted: c.slug });
  }
  if (b.phone) {
    if (c.phone?.twilioNumber && b.phone.twilioNumber !== undefined && e164(b.phone.twilioNumber) !== c.phone.twilioNumber) await del("index", "number:" + c.phone.twilioNumber);
    c.phone = { ...c.phone, ...(b.phone.twilioNumber !== undefined ? { twilioNumber: e164(b.phone.twilioNumber) } : {}), ...(b.phone.voiceForwardTo !== undefined ? { voiceForwardTo: String(b.phone.voiceForwardTo).trim() } : {}), ...(b.phone.tenDlc ? { tenDlc: String(b.phone.tenDlc) } : {}), ...(b.phone.textBack !== undefined ? { textBack: !!b.phone.textBack } : {}) };
  }
  if (b.status && ["new", "building", "testing", "live", "paused"].includes(b.status)) c.status = b.status;
  if (b.plan && ["starter", "growth", "pro"].includes(b.plan)) c.plan = b.plan;
  if (b.billing) c.billing = { ...c.billing, ...b.billing };
  await saveClient(c); await indexClient(c);
  await logEvent(c.slug, "admin_update", { fields: Object.keys(b) });
  return json({ ok: true, client: { slug: c.slug, status: c.status, plan: c.plan, phone: c.phone, billing: c.billing } });
};
