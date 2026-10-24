// Thumbtack self-serve lead webhook: Thumbtack posts new leads to the URL the pro registers, with a
// basic-auth or secret header the pro sets. Set the shop's secret by admin ({"leads":{"thumbtackSecret":"..."}});
// the owner pastes https://<site>/api/thumbtack?c=<slug> and the secret into Thumbtack (OPERATIONS.md).
import { getClient } from "./lib/store.mjs";
import { json } from "./lib/agent.mjs";
import { receivePlatformLead } from "./lib/desk.mjs";
import { supportedWorkspace } from './lib/workspace-identity.mjs';
import { receiveManagedThumbtack } from './lib/thumbtack-connection.mjs';
import { LeadConnectionError } from './lib/lead-connections.mjs';

export const config = { path: "/api/thumbtack" };

function presented(req, url) {
  const auth = req.headers.get("authorization") || "";
  if (/^basic /i.test(auth)) { try { return Buffer.from(auth.slice(6), "base64").toString("utf8").split(":").pop(); } catch { return ""; } }
  if (/^bearer /i.test(auth)) return auth.slice(7).trim();
  return req.headers.get("x-thumbtack-secret") || req.headers.get("x-webhook-secret") || url.searchParams.get("secret") || "";
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const c = await getClient(url.searchParams.get("c") || "");
  if (!c) return json({ error: "not_found" }, 404);
  // The legacy receiver assumes undocumented auth aliases and sends automatic texts.
  // Managed workspaces use only their separately verified partner protocol.
  if (Object.hasOwn(c,'onboarding')) {
    if(!supportedWorkspace(c))return json({error:'unsupported_workspace'},409,{'Cache-Control':'no-store'});
    try{return json(await receiveManagedThumbtack(req,c),200,{'Cache-Control':'no-store'});}
    catch(error){return json({error:error instanceof LeadConnectionError?error.code:'lead_receipt_unconfirmed',message:error instanceof LeadConnectionError?error.message:'This delivery could not be confirmed. Retry the same event.'},error instanceof LeadConnectionError?error.status:503,{'Cache-Control':'no-store'});}
  }
  if (!c.leads?.thumbtackSecret || presented(req, url) !== c.leads.thumbtackSecret) return json({ error: "forbidden" }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  // NegotiationCreatedV4 (current): { negotiationID, customer: { customerID, displayName, location: { city, state, zipCode } }, request: { category, title, description, location? } }.
  // Older shapes carried lead.leadID and customer.name; both are read. The documented payload has no phone.
  const lead = b.negotiation || b.lead || b;
  const cust = lead.customer || {};
  const req_ = lead.request || {};
  const loc = cust.location || req_.location || lead.location || {};
  const address = [loc.address1 || loc.address, loc.city, loc.state, loc.zipCode || loc.zip].filter(Boolean).join(", ");
  const task = [req_.category || lead.category, req_.title || lead.title, req_.description || lead.description].filter(Boolean).join(": ");
  const id = String(lead.negotiationID || lead.negotiationId || b.negotiationID || lead.leadID || lead.leadId || lead.id || b.leadID || "");
  const name = cust.displayName || cust.name || lead.customerName || "";
  const r = await receivePlatformLead(c, "thumbtack", {
    id, name, phone: cust.phone || cust.phoneNumber || lead.phone || "", email: cust.email || "",
    address, task, raw: b, unmapped: !id && !name && !task,
  });
  return json({ status: "success", ...r });
};
