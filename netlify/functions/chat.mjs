// Front desk agent backend: Netlify Function (v2) calling Claude.
// Modes: "mc" is Machines & Cloud's sales desk (pure planning tools, no lead submission);
// "client" runs a customer's front desk from their stored config (website chat, owner test line);
// the named personas are the homepage example companies.
import { runAgent, sanitizeMessages, toApiMessages, json, ndjsonResponse, classifyError } from "./lib/agent.mjs";
import { getConversation, saveConversation, get, put, assertCurrentWorkspace } from "./lib/store.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY } from "./lib/config.mjs";
import { bookVisit, flagLead, availabilityToolResult } from "./lib/desk.mjs";
import { PERSONAS, OWNER_SUMMARY, personaSystem } from "./lib/practice-personas.mjs";
import { runOwnerTest } from "./lib/owner-test.mjs";
import { reserveAIRequest, selfServiceAIModelFetch, reserveAIProofMutation } from "./lib/self-service-ai.mjs";
import { getAccessSession, accessOriginAllowed } from "./lib/access.mjs";
import { strictRead, normalizeAccountEmail } from "./lib/accounts.mjs";
import { isSelfServiceClient, setupReadiness } from "./lib/setup.mjs";
import { salesSystem, SALES_TOOLS, sanitizeSalesMessages, executeSalesTool } from "./lib/sales-desk.mjs";
import { getSalesAllowance, reserveSalesTurn } from "./lib/sales-budget.mjs";
import { claimWebsiteTurn, validateWebsiteTurn, websiteActionId, websiteRecordContext, noteWebsiteRecord, finishWebsiteTurn, failWebsiteTurn, WebsiteInstallationError } from './lib/website-installation.mjs';

import { WorkspaceIdentityError } from './lib/workspace-identity.mjs';
import { appointmentTextInvitation } from './lib/appointment-texts.mjs';

export const config = { path: "/api/chat" };

const SITE_ORIGIN = /^https:\/\/(www\.)?machinesandcloud\.com$/;
const PREVIEW_ORIGIN = /^https:\/\/([a-z0-9-]+--)?machines-and-cloud\.netlify\.app$/;
function siteOrigin(origin) {
  if (!origin) return true;
  const allowed = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL, "http://localhost:8888", "http://127.0.0.1:8888", "http://localhost:8787", ...String(process.env.SITE_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean)].filter(Boolean);
  return allowed.includes(origin) || SITE_ORIGIN.test(origin) || PREVIEW_ORIGIN.test(origin);
}
function hostOf(u) { try { return new URL(u.startsWith("http") ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return ""; } }
function clientOriginAllowed(c, origin) {
  if (!origin || siteOrigin(origin)) return true;
  const h = hostOf(origin);
  const allowed = [c.business?.website, ...(c.widget?.allowedOrigins || [])].map(hostOf).filter(Boolean);
  return allowed.includes(h);
}
function cors(origin) {
  return origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" } : {};
}

// 60 messages per IP per 10 minutes for legacy tenants and fictional practice only. Keys carry the bucket, so old ones are simply
// never read again. The owner's test line (valid key) and the admin key are exempt.
const RATE_LIMIT = 60;
async function rateLimited(ip) {
  if (!ip) return false;
  const key = `${ip}/${Math.floor(Date.now() / 600000)}`;
  const n = (Number(await get("ratelimit", key)) || 0) + 1;
  await put("ratelimit", key, n);
  return n > RATE_LIMIT;
}

export default async (req, context) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "";
  if (req.method === "GET" && new URL(req.url).searchParams.get("mode") === "sales") {
    if (!siteOrigin(origin)) return json({ error: "forbidden" }, 403);
    try {
      const allowance = await getSalesAllowance(ip);
      return json({ available: allowance.available && (!!process.env.ANTHROPIC_API_KEY || process.env.MC_FAKE_MODEL === "1"), resetAt: allowance.resetAt }, 200, cors(origin));
    } catch { return json({ error: "sales_allowance_unavailable", message: "Chat is temporarily unavailable. Please try again later." }, 503, cors(origin)); }
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!process.env.ANTHROPIC_API_KEY && process.env.MC_FAKE_MODEL !== "1") return json({ error: "offline" }, 503);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  // An explicit sales/practice persona must never be combined with a stored shop.
  const requestedPersona = body?.persona;
  if (requestedPersona !== undefined && requestedPersona !== "mc" && (typeof requestedPersona !== "string" || !Object.hasOwn(PERSONAS, requestedPersona))) return json({ error: "unknown_persona" }, 400);
  const persona = requestedPersona && requestedPersona !== "mc" ? PERSONAS[requestedPersona] : null;
  if (requestedPersona !== undefined && body?.client) return json({ error: "invalid_mode" }, 400);
  const wantStream = body?.stream === true;
  const salesMode = !persona && !(typeof body?.client === "string" && body.client);
  const adminOk = process.env.ADMIN_KEY && req.headers.get("x-admin-key") === process.env.ADMIN_KEY;
  let requestedClient = null, session = null, ownerExempt = false;
  if (typeof body?.client === "string" && body.client) {
    try {
      requestedClient = await strictRead("clients", body.client.slice(0, 40));
      if (isSelfServiceClient(requestedClient) && req.headers.has("authorization")) {
        if (origin && !accessOriginAllowed(origin)) return json({ error: "forbidden" }, 403, cors(origin));
        session = await getAccessSession(req);
        if (!session) return json({ error: "verification_required" }, 401, cors(origin));
        if (normalizeAccountEmail(session.email) !== normalizeAccountEmail(requestedClient.owner?.email)) return json({ error: "forbidden" }, 403, cors(origin));
      }
      ownerExempt = isSelfServiceClient(requestedClient) ? !!session : !!requestedClient && body.key === requestedClient.ownerKey;
    } catch { return json({ error: "client_unavailable" }, 503, cors(origin)); }
  }
  if (!salesMode && !isSelfServiceClient(requestedClient) && !adminOk && !ownerExempt && (await rateLimited(ip))) return json({ error: "busy" }, 429, cors(origin));

  // ---- Client mode: a real shop's front desk ----
  if (typeof body?.client === "string" && body.client) {
    const c = requestedClient;
    if (!c) return json({ error: "unknown_client" }, 404);
    const isOwner = isSelfServiceClient(c) ? !!session : typeof body.key === "string" && body.key === c.ownerKey;
    if (isSelfServiceClient(c) && !isOwner && (body.channel === "test" || (typeof body.key === "string" && body.key))) return json({ error: "verification_required" }, 401, cors(origin));
    const channel = isOwner && body.channel === "test" ? "test" : "web";
    if (body.channel === "test" && !isOwner) return json({ error: "forbidden" }, 403);
    // Verified owner authority opens rehearsal, never bypasses customer activation.
    if (isSelfServiceClient(c) && channel === "web") {
      const web = setupReadiness(c).channels.web;
      if (!web.ready || !web.active) return json({ error: c.status === "paused" ? "paused" : "not_live" }, 403);
    }
    if (!isOwner) {
      if (!clientOriginAllowed(c, origin)) return json({ error: "forbidden" }, 403);
      if (!["testing", "live"].includes(c.status)) return json({ error: c.status === "paused" ? "paused" : "not_live" }, 403);
    }
    const contact = String(body.contact || "anon").slice(0, 60).replace(/[^a-zA-Z0-9_-]/g, "");
    const incoming = sanitizeMessages(body?.messages);
    if (!incoming) return json({ error: "invalid_messages" }, 400);
    if (body.websiteCheck !== undefined && (!isSelfServiceClient(c) || isOwner || channel !== 'web')) return json({ error: 'invalid_website_check', message: 'Use the installed public widget for a website setup check.' }, 400, cors(origin));
    const fence = async () => {
      const current = await assertCurrentWorkspace(c);
      if (isSelfServiceClient(c) && channel === 'web') {
        const web = setupReadiness(current).channels.web;
        if (!web.ready || !web.active) throw new WorkspaceIdentityError();
      }
    };
    try { await fence(); } catch (error) { return json({ error: error.code || 'client_unavailable' }, error.status || 503, cors(origin)); }
    let websiteContext = null;
    try { websiteContext = await claimWebsiteTurn(c, body.websiteCheck, contact, origin); }
    catch (error) { if (error instanceof WebsiteInstallationError) return json({ error: error.code, message: error.message }, error.status, cors(origin)); return json({ error: 'website_check_unavailable' }, 503, cors(origin)); }
    let aiProof;
    if (isSelfServiceClient(c)) {
      let budget;
      try { budget = await reserveAIRequest(c, channel === "test" ? "private" : "web"); }
      catch { try { await failWebsiteTurn(websiteContext); } catch {} return json({ error: "ai_allowance_unavailable", message: "AI chat is temporarily unavailable. Please try again later." }, 503, cors(origin)); }
      if (!budget.allowed) { try { await failWebsiteTurn(websiteContext); } catch {} return json({ error: "ai_daily_limit", message: channel === "test" ? "Today's practice AI allowance is used up. Your saved rules are safe; try again after the Houston daily reset." : "Chat is unavailable for the rest of today. Please contact the shop directly.", ...(isOwner ? { aiAllowance: budget.aiAllowance } : {}) }, 429, cors(origin)); }
      aiProof = budget.proof;
    }
    if (channel === "test") {
      const runTest = (onText) => runOwnerTest({ client: c, contact, messages: incoming, onText, aiProof });
      if (wantStream) return ndjsonResponse(runTest, cors(origin));
      try { return json(await runTest(), 200, cors(origin)); }
      catch (err) { const e = err instanceof WorkspaceIdentityError ? { error: err.code, status: err.status } : classifyError(err); return json({ error: e.error }, e.status, cors(origin)); }
    }
    // Persist the conversation so the owner can read it and the desk keeps context across reloads.
    let conv;
    try { conv = await getConversation(c, channel, contact); }
    catch (error) { try { await failWebsiteTurn(websiteContext); } catch {} return json({ error: error.code || 'client_unavailable' }, error.status || 503, cors(origin)); }
    if (websiteContext) conv.websiteSetupCheck = { checkId: websiteContext.checkId, origin };
    const last = incoming[incoming.length - 1];
    conv.messages.push({ role: "user", content: last.content, at: new Date().toISOString() });
    const history = toApiMessages(conv.messages);
    const system = buildSystemPrompt(c, channel);
    const tools = [BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY].map(tool => !isSelfServiceClient(c) ? tool : {
      ...tool, description: tool.name === "book_visit" ? "Save a visit in the shop portal after the customer accepts a real available window. Connected services may process it separately; this result does not confirm text, calendar or owner-contact delivery." : tool.name === "notify_owner" ? "Save a callback, handoff or emergency request in the shop portal. Separate contact delivery and human response or timing are not confirmed by this result." : tool.description,
    });
    const execTool = async (name, input) => {
      await fence();
      await validateWebsiteTurn(websiteContext);
      if (name === "get_availability") return availabilityToolResult(c, input);
      const kind = name === 'book_visit' ? 'bookings' : 'leads';
      const proofActionId = isSelfServiceClient(c) && ['book_visit','notify_owner'].includes(name) ? await reserveAIProofMutation(c, aiProof, name, input, { contact, ...(websiteContext ? { setupActionId:websiteActionId(websiteContext,kind) } : {}) }) : null;
      const recordOptions = kind => ({ channel, contact, ...websiteRecordContext(websiteContext), ...(websiteContext ? { managedActionId: websiteActionId(websiteContext, kind) } : proofActionId ? { managedActionId:proofActionId } : {}), ...(isSelfServiceClient(c) ? { onSavedRecord: (recordKind, record) => noteWebsiteRecord(c, recordKind, record, { context: websiteContext, origin, contact }) } : {}) });
      if (name === "book_visit") { const b = await bookVisit(c, input, recordOptions('bookings')); if (b.full) return { content: b.message }; const appointmentTexts = await appointmentTextInvitation(c, b); return { content: isSelfServiceClient(c) ? `Visit saved in the shop portal. Ref ${b.id}. This result confirms the saved visit; separate text, calendar or owner-contact delivery is not confirmed here. The shop must confirm arrival details directly. ${appointmentTexts ? 'An optional appointment-text invitation will appear beside your final reply. Do not claim texting consent or delivery.' : ''}` : `Booked. Ref ${b.id}. ${c.owner?.name || "The owner"} has the details and the customer will get a text reminder.`, event: { type: "booking", id: b.id, ...(appointmentTexts ? { appointmentTexts } : {}) } }; }
      if (name === "notify_owner") { const l = await flagLead(c, input, recordOptions('leads')); return { content: l.status === "spam" ? "Noted as spam; the owner was not bothered." : isSelfServiceClient(c) ? `Request saved in the shop portal. Ref ${l.id}. Separate phone, text or email delivery is not confirmed here; human response and timing are not confirmed.` : `${c.owner?.name || "The owner"} has been texted. Ref ${l.id}.`, event: { type: "lead", id: l.id, reason: l.reason } }; }
      return { content: "Unknown tool.", is_error: true };
    };
    const finish = async (out) => {
      await fence();
      // Record what the tools did inside the stored turn, so later turns know it already happened.
      const done = (out.events || []).map((e) => e.type === "booking" ? `[Done: ${isSelfServiceClient(c) ? "visit saved in portal" : "visit booked"}, ref ${e.id}]` : e.type === "lead" ? `[Done: ${isSelfServiceClient(c) ? "request saved in portal, human contact unconfirmed" : "owner notified"}, ref ${e.id}]` : "").filter(Boolean).join(" ");
      conv.messages.push({ role: "assistant", content: done ? out.reply + "\n" + done : out.reply, at: new Date().toISOString() });
      await saveConversation(conv);
      await fence();
      return finishWebsiteTurn(websiteContext, out);
    };
    // dropToolPreamble: a turn that calls a tool shows the customer only the text written after the tool
    // returned, so planning lines never reach the chat (the final turn still streams word by word).
    const run = async (onText) => {
      try {
        await fence();
        const modelFetch = isSelfServiceClient(c) ? await selfServiceAIModelFetch(c, aiProof) : undefined;
        return await finish(await runAgent({ system, tools, messages: history, onText, execTool, maxTokens: 1500, dropToolPreamble: true, modelFetch }));
      } catch (error) { try { await failWebsiteTurn(websiteContext); } catch {} throw error; }
    };
    if (wantStream) return ndjsonResponse(run, cors(origin));
    try { return json(await run(), 200, cors(origin)); } catch (err) { const e = err instanceof WorkspaceIdentityError ? { error: err.code, status: err.status } : classifyError(err); return json({ error: e.error }, e.status, cors(origin)); }
  }

  // ---- Machines & Cloud's own desk, and the homepage example companies ----
  if (!siteOrigin(origin)) return json({ error: "forbidden" }, 403);
  if (salesMode) {
    const messages = sanitizeSalesMessages(body?.messages);
    if (!messages) return json({ error: "invalid_messages", message: "Keep complete conversation pairs within the chat limits, or start a new chat." }, 400, cors(origin));
    let budget;
    try { budget = await reserveSalesTurn(ip); }
    catch { return json({ error: "sales_allowance_unavailable", message: "Chat is temporarily unavailable. Your question has not been sent to anyone; please try again later." }, 503, cors(origin)); }
    if (!budget.allowed) return json({ error: "sales_daily_limit", message: "Today's AI chat allowance is used up. You can still explore the examples, create a workspace or contact us directly.", resetAt: budget.allowance.resetAt }, 429, cors(origin));
    const run = onText => runAgent({ system: salesSystem(), tools: SALES_TOOLS, messages, onText, execTool: executeSalesTool, dropToolPreamble: true, adaptiveThinking: true, effort: "medium", maxTokens: 3072, maxIterations: 3, requireComplete: true, includeUsage: true, maxRetries: 0, exhaustedReply: "I couldn’t finish that reliably. Your question hasn’t been sent to anyone; you can try again or contact us directly." });
    if (wantStream) return ndjsonResponse(run, cors(origin));
    try { return json(await run(), 200, cors(origin)); } catch (err) { const e = classifyError(err); return json({ error: e.error }, e.status, cors(origin)); }
  }
  const messages = sanitizeMessages(body?.messages);
  if (!messages) return json({ error: "invalid_messages" }, 400);
  const system = personaSystem(persona);
  const tools = [OWNER_SUMMARY];
  let summaryUpdated = false;
  const execTool = async (name, input) => {
    if (name === "send_owner_summary" && persona) {
      if (summaryUpdated) return { content: "The on-page summary is already updated for this turn. Finish the customer reply without another tool call." };
      const fields = ["customer_name", "phone", "address", "issue", "requested_window"];
      if (!input || fields.some(field => typeof input[field] !== "string") || !["emergency", "today", "this_week", "flexible"].includes(input.urgency) || !["en", "es"].includes(input.language) || !["visit_request", "callback", "question_only", "emergency_handoff"].includes(input.requested_action)) return { content: "The summary fields were invalid. Use customer-supplied strings, empty for unknowns, and the allowed urgency/language.", is_error: true };
      const data = Object.fromEntries(fields.map(field => [field, input[field].trim().slice(0, 500)]));
      data.urgency = input.urgency; data.language = input.language; data.requested_action = input.requested_action;
      summaryUpdated = true;
      return { content: "Practice summary updated on this page only. No visit was booked and no text/email was sent. Continue with a natural concise answer or the next missing question; do not claim the owner was contacted.", event: { type: "owner_notification", owner: persona.owner, company: persona.company, data, at: new Date().toISOString() } };
    }
    return { content: "Unknown tool.", is_error: true };
  };
  const run = (onText) => runAgent({ system, tools, messages, onText, execTool, dropToolPreamble: !!persona });
  if (wantStream) return ndjsonResponse(run);
  try { return json(await run()); } catch (err) { const e = classifyError(err); return json({ error: e.error }, e.status); }
};
