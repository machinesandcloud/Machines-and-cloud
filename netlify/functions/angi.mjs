// Angi Leads webhook receiver: Angi posts each lead to a CRM endpoint with an X-API-KEY header.
// Set the shop's key by admin ({"leads":{"angiKey":"..."}}); the owner pastes
// https://<site>/api/angi?c=<slug> and the key into Angi's integration page (OPERATIONS.md).
import { getClient } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";
import { receivePlatformLead } from "./lib/desk.mjs";

export const config = { path: "/api/angi" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const c = await getClient(url.searchParams.get("c") || "");
  if (!c) return json({ error: "not_found" }, 404);
  const key = req.headers.get("x-api-key") || url.searchParams.get("key") || "";
  if (!c.leads?.angiKey || key !== c.leads.angiKey) return json({ error: "forbidden" }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  // Angi's field names vary by product; take the common ones and keep the raw body on the lead.
  const name = [b.firstName || b.first_name, b.lastName || b.last_name].filter(Boolean).join(" ") || b.name || b.customerName || "";
  const address = [b.address || b.street || b.address1, b.city, b.state, b.zip || b.postalCode].filter(Boolean).join(", ");
  const id = String(b.leadId || b.id || b.lead_id || b.srOid || b.leadID || "");
  const phone = b.phone || b.primaryPhone || b.phoneNumber || b.mobilePhone || "";
  const task = b.task || b.taskName || b.description || b.comments || b.category || b.serviceRequest || "";
  const r = await receivePlatformLead(c, "angi", {
    id, name, phone, email: b.email || "", address, task, raw: b,
    unmapped: !id && !name && !phone && !task,
  });
  return json({ status: "success", ...r });
};
