// Front desk agent backend: Netlify Function (v2) calling Claude.
// Modes: "mc" is Machines & Cloud's sales desk (pure planning tools, no lead submission);
// "client" runs a customer's front desk from their stored config (website chat, owner test line);
// the named personas are the homepage example companies.
import { runAgent, sanitizeMessages, toApiMessages, json, ndjsonResponse, classifyError } from "./lib/agent.mjs";
import { getConversation, saveConversation, id, atomicUpdate, assertCurrentWorkspace, beginConversationTurn, ConversationHistoryError } from "./lib/store.mjs";
import { buildSystemPrompt, BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY } from "./lib/config.mjs";
import { bookVisit, flagLead, availabilityToolResult, deliveryNote } from "./lib/desk.mjs";
import { PERSONAS, OWNER_SUMMARY, personaSystem } from "./lib/practice-personas.mjs";
import { runOwnerTest } from "./lib/owner-test.mjs";
import { reserveAIRequest, selfServiceAIModelFetch, reserveAIProofMutation, PUBLIC_WEB_DAILY_CLOSED } from "./lib/self-service-ai.mjs";
import { getAccessSession, accessOriginAllowed } from "./lib/access.mjs";
import { strictRead, normalizeAccountEmail } from "./lib/accounts.mjs";
import { auditedAdminKey } from "./lib/admin-key-audit.mjs";
import { isSelfServiceClient, setupReadiness } from "./lib/setup.mjs";
import { salesSystem, SALES_TOOLS, sanitizeSalesMessages, executeSalesTool, currentChannelAvailability } from "./lib/sales-desk.mjs";
import { getSalesAllowance, reserveSalesTurn } from "./lib/sales-budget.mjs";
import { reservePublicChatTurn } from "./lib/public-chat-budget.mjs";
import { networkBucket } from "./lib/network-bucket.mjs";
import { claimWebsiteTurn, validateWebsiteTurn, websiteActionId, websiteRecordContext, noteWebsiteRecord, finishWebsiteTurn, failWebsiteTurn, WebsiteInstallationError, exactWebsiteOrigin } from './lib/website-installation.mjs';

import { WorkspaceIdentityError } from './lib/workspace-identity.mjs';
import { bindWebConversation, forkWebConversation, forkedTurn, claimWebConversation, grantRecoveredAccess, accessHeaders } from './lib/conversation-access.mjs';
import { savedPortalAcknowledgment } from "./lib/self-service-ack.mjs";
import { appointmentTextInvitation } from './lib/appointment-texts.mjs';
// Proposal 10: a separate import line, so the config/desk import lines that other proposals edit stay untouched.
import { agentFallbackLanguage } from "./lib/config.mjs";
import { WEB_VISIT_CHANGE_NOTE } from "./lib/customer-visits.mjs";

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
  if (isSelfServiceClient(c)) {
    const exact = exactWebsiteOrigin(origin);
    return !!exact && (c.widget?.allowedOrigins || []).some(value => exactWebsiteOrigin(value) === exact);
  }
  const h = hostOf(origin);
  const allowed = [c.business?.website, ...(c.widget?.allowedOrigins || [])].map(hostOf).filter(Boolean);
  return allowed.includes(h);
}
function cors(origin) {
  return origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" } : {};
}
// Definite admission refusals. Every caller returns before any conversation, turn, allowance or
// model work, so a first send was certainly not processed. A recoverTurn probe is different: its
// refusal says nothing about the original turn, which may already be saved, so it stays unknown.
// CORS headers let a cross-origin widget read the reason instead of seeing a network failure.
const CHAT_UNAVAILABLE = "Website chat is unavailable right now. Please use the shop’s contact details on this website.";
function refused(origin, body, error, message = CHAT_UNAVAILABLE) {
  return json({ error, message, turnNotProcessed: body?.recoverTurn !== true }, 403, cors(origin));
}

// 60 messages per network (IPv4 address or IPv6 /64) per 10 minutes for legacy tenants and fictional practice only.
// Keys carry the bucket; the scheduler's retention block deletes buckets older than the previous window. A missing IP
// shares one "unknown" bucket. The count is a conditional write, so a concurrent burst cannot pass more than the limit.
// The owner's test line (valid key) and the admin key are exempt. Daily ceilings live in public-chat-budget.mjs.
const RATE_LIMIT = 60;
async function rateLimited(ip) {
  const key = `${networkBucket(ip)}/${Math.floor(Date.now() / 600000)}`;
  return atomicUpdate("ratelimit", key, previous => {
    const n = Number(previous) || 0;
    return n >= RATE_LIMIT ? { result: true } : { value: n + 1, result: false };
  });
}
// Daily per-network and global turn ceiling, charged once per admitted model turn.
// Stacked (with 02/09 and the widget chain): every refusal here is made before any conversation input or model work, so a
// first send was certainly not processed (turnNotProcessed, as in refused()); a recoverTurn probe's outcome stays unknown.
async function publicTurnDenied(pool, ip, origin, body) {
  const turnNotProcessed = body?.recoverTurn !== true;
  let budget;
  try { budget = await reservePublicChatTurn(pool, ip); }
  catch { return json({ error: "chat_allowance_unavailable", turnNotProcessed, message: "Chat is temporarily unavailable. Please try again later." }, 503, cors(origin)); }
  return budget.allowed ? null : json({ error: pool === "practice" ? "practice_daily_limit" : "busy", turnNotProcessed, message: "Today's chat allowance is used up. Please try again after the daily reset." }, 429, cors(origin));
}

export default async (req, context) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "";
  if (req.method === "GET" && new URL(req.url).searchParams.get("mode") === "sales") {
    if (!siteOrigin(origin)) return refused(origin, null, "forbidden", "Chat is unavailable on this page."); // GET carries no turn
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
  // The shared ADMIN_KEY exempts the legacy rate limit (sales mode has no exemption, so it is not audited there); each use is audited first and refused if it cannot be recorded.
  const adminOk = !salesMode && await auditedAdminKey(req, "chat_rate_exempt");
  if (adminOk === null) return json({ error: "audit_unavailable" }, 503, cors(origin));
  let requestedClient = null, session = null, ownerExempt = false;
  if (typeof body?.client === "string" && body.client) {
    try {
      requestedClient = await strictRead("clients", body.client.slice(0, 40));
      if (isSelfServiceClient(requestedClient) && req.headers.has("authorization")) {
        if (origin && !accessOriginAllowed(origin)) return refused(origin, body, "forbidden", "Workspace chat can only be opened from your Machines & Cloud workspace.");
        session = await getAccessSession(req);
        if (!session) return json({ error: "verification_required" }, 401, cors(origin));
        if (normalizeAccountEmail(session.email) !== normalizeAccountEmail(requestedClient.owner?.email)) return refused(origin, body, "forbidden", "This sign-in does not have access to this workspace's chat.");
      }
      ownerExempt = isSelfServiceClient(requestedClient) ? !!session : !!requestedClient && body.key === requestedClient.ownerKey;
    } catch { return json({ error: "client_unavailable" }, 503, cors(origin)); }
  }
  const publicLimited = !salesMode && !isSelfServiceClient(requestedClient) && !adminOk && !ownerExempt;
  try { if (publicLimited && (await rateLimited(ip))) return json({ error: "busy", turnNotProcessed: body?.recoverTurn !== true }, 429, cors(origin)); }
  catch { return json({ error: "busy", turnNotProcessed: body?.recoverTurn !== true }, 429, cors(origin)); }

  // ---- Client mode: a real shop's front desk ----
  if (typeof body?.client === "string" && body.client) {
    const c = requestedClient;
    if (!c) return json({ error: "unknown_client" }, 404);
    const isOwner = isSelfServiceClient(c) ? !!session : typeof body.key === "string" && body.key === c.ownerKey;
    if (isSelfServiceClient(c) && !isOwner && (body.channel === "test" || (typeof body.key === "string" && body.key))) return json({ error: "verification_required" }, 401, cors(origin));
    const channel = isOwner && body.channel === "test" ? "test" : "web";
    if (body.channel === "test" && !isOwner) return refused(origin, body, "forbidden", "The test line is only available to the workspace owner.");
    // Verified owner authority opens rehearsal, never bypasses customer activation.
    if (isSelfServiceClient(c) && channel === "web") {
      const web = setupReadiness(c).channels.web;
      if (!web.ready || !web.active) return refused(origin, body, c.status === "paused" ? "paused" : "not_live");
    }
    if (!isOwner) {
      // The page is not one of this shop's sites, so do not point at "contact details on this website".
      if (!clientOriginAllowed(c, origin)) return refused(origin, body, "forbidden", "Website chat is not available on this page. Please contact the shop directly.");
      if (!["testing", "live"].includes(c.status)) return refused(origin, body, c.status === "paused" ? "paused" : "not_live");
    }
    let contact = String(body.contact || "anon").slice(0, 60).replace(/[^a-zA-Z0-9_-]/g, "");
    const incoming = sanitizeMessages(body?.messages);
    // Rejected before any read or write, so it is truthfully "not processed"; readable cross-origin so a widget never keeps
    // a pending turn for it (an old widget tab that kept an unanswered message sends two user messages in a row).
    if (!incoming) return json({ error: "invalid_messages", turnNotProcessed: true, message: "This chat needs to restart. Please reload the page and send your message again." }, 400, cors(origin));
    // Rev 6: the legacy owner test line has no turn ledger either; its recoverTurn is refused too (web: see the binding below).
    const RECOVERY_UNAVAILABLE = "We can't check a saved reply for this chat. Please contact the shop before sending the request again.";
    // Rev 7 (QA09 r6 R6-3): a tokenless legacy recoverTurn is what a pre-token (old) widget tab sends. That widget keeps its strip and
    // a disabled box after any 409 that is not turnNotProcessed; a reload loads the current widget, which retires the strip. Say so.
    const RELOAD_HINT = ' If this window stops responding, reload the page.';
    if (channel === 'test' && !isSelfServiceClient(c) && body.recoverTurn === true) return json({ error: 'conversation_recovery_unavailable', message: RECOVERY_UNAVAILABLE }, 409, cors(origin));
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
    let conv, ordinaryTurnId=null, access=null;
    // Responses after binding carry the conversation id/token the widget must use next (lib/conversation-access.mjs).
    const hdrs = () => ({ ...cors(origin), ...accessHeaders(origin, access) });
    if (channel !== 'test') {
      try {
        conv = await getConversation(c, channel, contact);
        // Ordinary website turns: the contact id alone never unlocks history (lib/conversation-access.mjs). A setup check
        // is bound by its challenge instead. On a mismatch the presented conversation is never loaded into the model and
        // never appended to; only read-only turn-ledger answers about this exact turnId come from it.
        if (channel === 'web' && !websiteContext) {
          // Rev 4 (QA09 r3 N1): the legacy window binds to the platform-supplied client address only. The rate limiter's
          // x-nf-client-connection-ip fallback is a request header a caller can set, so it is never used here; with no
          // context.ip a window is never opened or continued (the reload notice).
          const bindIp = typeof context?.ip === 'string' ? context.ip : '';
          access = await bindWebConversation(c, channel, contact, conv, body.conversationToken, { ip: bindIp });
          if (access.state === 'mismatch') {
            const otherClient = access.reason === 'legacy_client' || access.reason === 'no_client_ip';
            access = null;
            const presented = contact, content = incoming.at(-1).content;
            const reload = () => new ConversationHistoryError('conversation_reload_required', 'This chat needs to restart. Please reload the page and send your message again.');
            // Legacy (non-self-service) tenants have no turn ledger, so nothing can trace or recover a moved turn there:
            // any mismatched turn, including recoverTurn, is refused before anything is written.
            if (!isSelfServiceClient(c)) throw reload();
            // 1. This exact turn on the presented conversation: its completed reply (and a token, since the 128-bit
            //    turnId proves this browser sent it), or its unconfirmed/duplicate-turn guard, which a fork must not bypass.
            if (body.turnId !== undefined) {
              let resumed = null;
              try { resumed = await beginConversationTurn(conv, body.turnId, { content, origin }, { recoverOnly: true }); }
              catch (error) { if (['conversation_previous_unconfirmed', 'conversation_turn_uncertain', 'conversation_turn_conflict'].includes(error.code)) throw error; }
              if (resumed?.completed) { await fence(); access = await grantRecoveredAccess(c, channel, presented); return wantStream ? ndjsonResponse(async () => resumed.output, hdrs()) : json(resumed.output, 200, hdrs()); }
              // 2. This turn already ran on a fork of the presented conversation: say so, never "nothing was submitted".
              const moved = await forkedTurn(c, channel, presented, body.turnId);
              if (moved) {
                let ran = null;
                try { ran = await beginConversationTurn(await getConversation(c, channel, moved.contact), body.turnId, { content, origin }, { recoverOnly: true }); }
                catch (error) { if (error.code !== 'conversation_turn_not_found') throw error; }
                if (ran?.completed) throw new ConversationHistoryError('conversation_turn_moved', 'This message was answered in a separate chat that this window can no longer show. Reload the page to keep chatting, and contact the shop before sending the same request again.');
              }
            }
            if (body.recoverTurn === true) throw new ConversationHistoryError('conversation_turn_not_found', 'This message was not admitted. No reply or request was submitted by this turn.');
            // 3. A tokenless turn from another network client while this conversation's legacy window is open (an old tab
            //    that changed network, or anyone else holding the id): the reload notice, never a fork that would burn the
            //    visitor's fork slot. 4. Otherwise move this turn to a new conversation (bounded, lib/conversation-access.mjs).
            if (otherClient) throw reload();
            access = await forkWebConversation(c, channel, presented, body.turnId);
            if (!access) throw reload();
            contact = access.contact; conv = await getConversation(c, channel, contact);
          }
          // Rev 6 (QA09 r5 C2, as 9601528b): a legacy tenant has no turn ledger, so "Check previous reply" can never be
          // answered there and must never run the turn again (a second owner request or booking). Every legacy recoverTurn
          // is refused: a mismatch above with the reload notice, anything else (a valid token, an open legacy window, a
          // fresh id) here, before anything is written or any allowance is spent. The outcome stays unknown, so this is
          // not turnNotProcessed: the widget retires its recovery strip and does not put the text back in the box.
          else if (!isSelfServiceClient(c) && body.recoverTurn === true) { access = null; throw new ConversationHistoryError('conversation_recovery_unavailable', RECOVERY_UNAVAILABLE + (body.conversationToken ? '' : RELOAD_HINT)); }
        }
        if (isSelfServiceClient(c) && !websiteContext) {
          ordinaryTurnId=body.turnId===undefined?id(16):body.turnId;
          try {
            const resumed = await beginConversationTurn(conv,ordinaryTurnId,{content:incoming.at(-1).content,origin},{recoverOnly:true});
            if(resumed.completed){await fence();return wantStream?ndjsonResponse(async()=>resumed.output,hdrs()):json(resumed.output,200,hdrs());}
          } catch(error) { if(error.code!=='conversation_turn_not_found'||body.recoverTurn===true)throw error; }
        }
      } catch(error) { try { await failWebsiteTurn(websiteContext); } catch {} return json({error:error.code||'client_unavailable',message:error instanceof ConversationHistoryError?error.message:undefined,turnNotProcessed:['conversation_turn_not_found','conversation_reload_required'].includes(error.code)},error.status||503,hdrs()); }
    }
    let aiProof;
    if (isSelfServiceClient(c)) {
      let budget;
      try { budget = await reserveAIRequest(c, channel === "test" ? "private" : "web", isOwner ? {} : { ip }); }
      catch { try { await failWebsiteTurn(websiteContext); } catch {} return json({ error: "ai_allowance_unavailable",turnNotProcessed:!!ordinaryTurnId, message: "AI chat is temporarily unavailable. Please try again later." }, 503, hdrs()); }
      if (!budget.allowed) { try { await failWebsiteTurn(websiteContext); } catch {} return json({ error: "ai_daily_limit",turnNotProcessed:!!ordinaryTurnId, message: channel === "test" ? "Today's practice AI allowance is used up. Your saved rules are safe; try again after the Houston daily reset." : budget.closed === "daily_limit" ? PUBLIC_WEB_DAILY_CLOSED : "Website chat is unavailable right now. Please contact the shop directly.", ...(isOwner ? { aiAllowance: budget.aiAllowance } : {}) }, 429, hdrs()); }
      aiProof = budget.proof;
    }
    if (channel === "test") {
      const runTest = (onText) => runOwnerTest({ client: c, contact, messages: incoming, onText, aiProof });
      if (wantStream) return ndjsonResponse(runTest, cors(origin));
      try { return json(await runTest(), 200, cors(origin)); }
      catch (err) { const e = err instanceof WorkspaceIdentityError ? { error: err.code, status: err.status } : classifyError(err); return json({ error: e.error }, e.status, cors(origin)); }
    }
    // A binding (fresh, legacy window, fork) is written only now that the turn is admitted, before any durable input.
    // Losing a first claim means another request started this contact first: only a completed duplicate of this same
    // turnId is answered (from its saved reply, without a token); anything else is refused before any input is written.
    // Stacked: 15's legacy daily turn is charged here, after 09's token gate (a refused or mismatched token, and every legacy
    // recoverTurn, is answered above without spending it) and before the binding claim writes anything.
    if (publicLimited) { const denied = await publicTurnDenied("legacy", ip, origin, body); if (denied) return denied; }
    const claim = await claimWebConversation(c, channel, access);
    if (claim !== 'ok') {
      access = null;
      if (claim === 'fork_limit') return json({ error: 'conversation_reload_required', turnNotProcessed: true, message: 'This chat needs to restart. Please reload the page and send your message again.' }, 409, cors(origin));
      if (ordinaryTurnId) { let resumed = null; try { resumed = await beginConversationTurn(conv, ordinaryTurnId, { content: incoming.at(-1).content, origin }, { recoverOnly: true }); } catch {} if (resumed?.completed) { await fence(); return wantStream ? ndjsonResponse(async () => resumed.output, cors(origin)) : json(resumed.output, 200, cors(origin)); } }
      return json({ error: 'conversation_changed', turnNotProcessed: true, message: 'This chat changed in another window. Please send your message again.' }, 409, cors(origin));
    }
    // Recovery probes never spend another allowance; new durable input follows the
    // existing shared logical admission so public contacts cannot bypass its write cap.
    if(ordinaryTurnId){
      try{const resumed=await beginConversationTurn(conv,ordinaryTurnId,{content:incoming.at(-1).content,origin});if(resumed.completed){await fence();return wantStream?ndjsonResponse(async()=>resumed.output,hdrs()):json(resumed.output,200,hdrs());}}
      catch(error){return json({error:error.code||'client_unavailable',message:error instanceof ConversationHistoryError?error.message:undefined},error.status||503,hdrs());}
    }
    // Persist the conversation so the owner can read it and the desk keeps context across reloads.
    if (websiteContext) conv.websiteSetupCheck = { checkId: websiteContext.checkId, origin };
    const last = incoming[incoming.length - 1];
    conv.messages.push({ role: "user", content: last.content, at: new Date().toISOString() });
    const history = toApiMessages(conv.messages.slice(-40), 40);
    // Website visitors are not phone-verified: they never see or change existing visits here.
    const system = buildSystemPrompt(c, channel) + (isSelfServiceClient(c) && channel === 'web' ? WEB_VISIT_CHANGE_NOTE : '');
    const tools = [BOOK_VISIT, NOTIFY_OWNER, GET_AVAILABILITY].map(tool => !isSelfServiceClient(c) ? tool : {
      ...tool, description: tool.name === "book_visit" ? "Save a visit in the shop portal after the customer accepts a real available window. Connected services may process it separately; this result does not confirm text, calendar or owner-contact delivery." : tool.name === "notify_owner" ? "Save a callback, handoff or emergency request in the shop portal. Separate contact delivery and human response or timing are not confirmed by this result." : tool.description,
    });
    let savedActionCount = 0, savedCheckReply = null;
    const rememberSave = (name, record, input) => {
      if (!isSelfServiceClient(c)) return;
      savedActionCount++;
      if (name === 'notify_owner' && input.reason === 'status_check' && record.reason === input.reason) savedCheckReply = savedPortalAcknowledgment(name, record);
    };
    const execTool = async (name, input) => {
      await fence();
      await validateWebsiteTurn(websiteContext);
      if (name === "get_availability") return availabilityToolResult(c, input);
      const kind = name === 'book_visit' ? 'bookings' : 'leads';
      const proofActionId = isSelfServiceClient(c) && ['book_visit','notify_owner'].includes(name) ? await reserveAIProofMutation(c, aiProof, name, input, { contact, ...(websiteContext ? { setupActionId:websiteActionId(websiteContext,kind) } : {}) }) : null;
      const recordOptions = kind => ({ channel, contact, ...websiteRecordContext(websiteContext), ...(websiteContext ? { managedActionId: websiteActionId(websiteContext, kind) } : proofActionId ? { managedActionId:proofActionId } : {}), ...(isSelfServiceClient(c) ? { onSavedRecord: (recordKind, record) => noteWebsiteRecord(c, recordKind, record, { context: websiteContext, origin, contact }) } : {}) });
      if (name === "book_visit") { const b = await bookVisit(c, input, recordOptions('bookings')); if (b.full) return { content: b.message }; rememberSave(name,b,input); const appointmentTexts = await appointmentTextInvitation(c, b); return { content: isSelfServiceClient(c) ? `Visit saved in the shop portal. Ref ${b.id}. This result confirms the saved visit; separate text, calendar or owner-contact delivery is not confirmed here. The shop must confirm arrival details directly. ${appointmentTexts ? 'An optional appointment-text invitation will appear beside your final reply. Do not claim texting consent or delivery.' : ''}` : `Booked. Ref ${b.id}. ${deliveryNote(c, b)}`, event: { type: "booking", id: b.id, ...(appointmentTexts ? { appointmentTexts } : {}) } }; }
      if (name === "notify_owner") { const l = await flagLead(c, input, recordOptions('leads')); rememberSave(name,l,input); const followupTexts=channel==='web'&&!websiteContext?await(await import('./lib/request-followup.mjs')).requestFollowupInvitation(c,l):null; return { content: l.status === "spam" ? "Noted as spam; the owner was not bothered." : isSelfServiceClient(c) ? `Request saved in the shop portal. Ref ${l.id}. Separate phone, text or email delivery is not confirmed here; human response and timing are not confirmed.${followupTexts?' An optional one-message follow-up invitation will appear beside your final reply; it does not give permission or schedule a text.':''}` : `Request saved. Ref ${l.id}. ${deliveryNote(c, l)}`, event: { type: "lead", id: l.id, reason: l.reason, ...(followupTexts?{followupTexts}:{}) } }; }
      return { content: "Unknown tool.", is_error: true };
    };
    const finish = async (out) => {
      await fence();
      // Record what the tools did inside the stored turn, so later turns know it already happened.
      const done = (out.events || []).map((e) => e.type === "booking" ? `[Done: ${isSelfServiceClient(c) ? "visit saved in portal" : "visit booked"}, ref ${e.id}]` : e.type === "lead" ? `[Done: ${isSelfServiceClient(c) ? e.reason === "status_check" ? "status-check request saved in portal, original outcome and human contact unconfirmed" : "request saved in portal, human contact unconfirmed" : "owner notified"}, ref ${e.id}]` : "").filter(Boolean).join(" ");
      conv.messages.push({ role: "assistant", content: done ? out.reply + "\n" + done : out.reply, at: new Date().toISOString() });
      await saveConversation(conv, { output: { reply: out.reply, events: out.events || [] } });
      await fence();
      return finishWebsiteTurn(websiteContext, out);
    };
    // dropToolPreamble: a turn that calls a tool shows the customer only the text written after the tool
    // returned, so planning lines never reach the chat (the final turn still streams word by word).
    const run = async (onText) => {
      try {
        await fence();
        const modelFetch = isSelfServiceClient(c) ? await selfServiceAIModelFetch(c, aiProof) : undefined;
        let terminalCheckReply = null;
        const stopAfterTools = isSelfServiceClient(c) ? async ({toolUses,results}) => {
          if (savedActionCount !== 1 || !savedCheckReply || toolUses.length !== 1 || toolUses[0].name !== 'notify_owner' || toolUses[0].input.reason !== 'status_check' || results.some(result => result.is_error)) return false;
          await fence(); await validateWebsiteTurn(websiteContext);
          // Revalidate the already-admitted proof without dispatching or debiting.
          // A canonical reply must not bypass the guard of the omitted model round.
          await selfServiceAIModelFetch(c, aiProof);
          terminalCheckReply = savedCheckReply;
          if (onText) onText(terminalCheckReply);
          return true;
        } : undefined;
        const out = await runAgent({ system, tools, messages: history, onText, execTool, maxTokens: 1500, dropToolPreamble: true, modelFetch, stopAfterTools, logSlug: c.slug, fallbackLanguage: agentFallbackLanguage(c) });
        return await finish(terminalCheckReply ? {...out,reply:terminalCheckReply} : out);
      } catch (error) { try { await failWebsiteTurn(websiteContext); } catch {} throw error; }
    };
    if (wantStream) return ndjsonResponse(run, hdrs());
    try { return json(await run(), 200, hdrs()); } catch (err) { const e = err instanceof WorkspaceIdentityError ? { error: err.code, status: err.status } : classifyError(err); return json({ error: e.error }, e.status, hdrs()); }
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
    const availability = await currentChannelAvailability();
    const run = onText => runAgent({ system: salesSystem(availability), tools: SALES_TOOLS, messages, onText, execTool: (name, input) => executeSalesTool(name, input, availability), dropToolPreamble: true, adaptiveThinking: true, effort: "medium", maxTokens: 3072, maxIterations: 3, requireComplete: true, includeUsage: true, maxRetries: 0, safetyLine: false, exhaustedReply: "I couldn’t finish that reliably. Your question hasn’t been sent to anyone; you can try again or contact us directly." });
    if (wantStream) return ndjsonResponse(run, cors(origin));
    try { return json(await run(), 200, cors(origin)); } catch (err) { const e = classifyError(err); return json({ error: e.error }, e.status, cors(origin)); }
  }
  const messages = sanitizeMessages(body?.messages);
  if (!messages) return json({ error: "invalid_messages" }, 400);
  if (publicLimited) { const denied = await publicTurnDenied("practice", ip, origin, body); if (denied) return denied; }
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
