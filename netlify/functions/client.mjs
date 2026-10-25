// Owner portal API. GET ?c=slug returns the public widget view; with &k=key the owner view plus
// records, health, and forwarding instructions. PUT with the key updates the editable config (loop-checked).
// GET with &export=bookings|leads|conversations returns a CSV download (owner only).
// POST actions: go_live, pause, resume, cancel, ack, flag, unflag, digest, test_sms, provision, forwarding_verified.
import { getClient, saveClient, indexClient, listRecords, listJSON, logEvent, getConversation, saveConversation, cancelTasks, lastInbound, getAvailabilityBlocks, setAvailabilityBlock, atomicUpdate, assertCurrentWorkspace, listWorkspaceRecords, conversationHeadsForExport, conversationReference, readConversationArchive, readArchivedMessages, ConversationHistoryError } from "./lib/store.mjs";
import { getAIAllowance } from "./lib/self-service-ai.mjs";
import { getAccessSession, accessOriginAllowed } from "./lib/access.mjs";
import { strictRead, normalizeAccountEmail } from "./lib/accounts.mjs";
import { setupReadiness, configurationRevision, isSelfServiceClient, isSupportedSelfServiceClient } from "./lib/setup.mjs";
import { AvailabilityInputError } from "./lib/availability.mjs";
import { publicView, ownerView, PLANS, loopCheck, ACK_MINUTES, DATA_POLICY, policyUrls, normalizeEmergencies, normalizeHours, parseHours, emergency247 } from "./lib/config.mjs";
import { json } from "./lib/agent.mjs";
import { sendSMS, smsEnabled, e164, sendEmail, notifySteve } from "./lib/send.mjs";
import { googleEnabled } from "./lib/calendar.mjs";
import { stripeEnabled } from "./lib/billing.mjs";
import { dailyDigest, lineHealth, ackAlertsFor, weeklyReport, monthlyReport } from "./lib/desk.mjs";
import { managedHumanLeadView } from './lib/managed-voice-handoff.mjs';
import { getUsage, usageView } from "./lib/usage.mjs";
import { updateVoicePrompt, detachVoice, attachVoice } from "./lib/vapi.mjs";
import { forwardingInstructions } from "./lib/forwarding.mjs";
import { INTAKE_CHANNELS } from "./lib/intake.mjs";
import { listWorkspaceOperations, queueWorkspaceRebuild, retryWorkspaceOperation, WorkspaceOperationError } from "./lib/platform-operations.mjs";
import { phoneActivationStatus, requestPhoneActivation, cancelPhoneActivation, PhoneActivationError } from "./lib/phone-activation.mjs";
import { startCalendarConnection, completeCalendarConnection, disconnectCalendar, calendarConnectionView, CalendarError } from "./lib/calendar-connection.mjs";
import { voiceActivationStatus, requestVoiceActivation, cancelVoiceActivation } from "./lib/voice-activation.mjs";
import { dispatchVoiceActivationWave } from "./lib/voice-activation.mjs";
import { messagingActivationStatus, requestMessagingActivation, correctMessagingActivation, cancelMessagingActivation, renewMessagingProbe } from "./lib/messaging-activation.mjs";
import { serviceConnections, serviceSetupView } from "./lib/service-connections.mjs";
import { dispatchServiceWorker } from "./lib/managed-sms.mjs";
import { deliveryTenant } from "./lib/managed-consent.mjs";
import { managedSMSConversations } from "./lib/managed-history.mjs";
import { dispatchCalendarDeliveryWave } from "./lib/calendar-delivery.mjs";
import { serviceOnboardingStatus, requestServiceOnboarding, cancelServiceOnboarding, ServiceOnboardingError } from "./lib/service-onboarding.mjs";
import { dispatchServiceOnboarding } from "./lib/service-onboarding-dispatch.mjs";

import { changeOwnerVisit, previewOwnerVisitAvailability, ownerVisitView, pendingOwnerVisitChange, pendingOwnerVisitCreations, OwnerVisitError } from "./lib/owner-visits.mjs";
import { parseWorkspacePatch, applyWorkspacePatch, workspacePatchConflicts, workspaceEditRevision, WorkspaceEditError } from "./lib/workspace-edit.mjs";
import { websiteInstallationView, startWebsiteCheck, WebsiteInstallationError } from "./lib/website-installation.mjs";

import { workspaceTenant, belongsToWorkspace } from "./lib/workspace-identity.mjs";
import { queueWorkspaceStopBilling } from './lib/workspace-billing.mjs';

import { ownerConversationPage } from './lib/conversation-reader.mjs';

import { readRequestFollowthrough, updateRequestFollowthrough, requestFollowthroughSummaries, RequestFollowthroughError } from './lib/request-followthrough.mjs';
import { workspaceActivity } from './lib/workspace-activity.mjs';
import { changePlatformAutomation } from './lib/platform-ai.mjs';
import { leadConnectionsView, changeLeadConnection, LeadConnectionError } from './lib/lead-connections.mjs';
import { startThumbtackConnection, continueOwnerThumbtack, selectThumbtackBusiness, sendPlatformReply } from './lib/thumbtack-connection.mjs';
import {reportConversation,supportReportViews,SupportReportError} from './lib/support-reports.mjs';

export const config = { path: "/api/client" };

const CORS = (origin) => (origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", Vary: "Origin" } : {});
const s = (v, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const visibleOwnerBooking = (client, booking) => !booking.ownerVisitCreationAborted && belongsToWorkspace(client, booking);
const arr = (v, n = 40) => (Array.isArray(v) ? v : String(v || "").split(/[\n;]+/)).map((x) => s(x, 160)).filter(Boolean).slice(0, n);

async function updateWorkspace(c, body, ownsCurrent) {
  const { expectedRevision, expectedEditRevision, ...supplied } = body;
  if (expectedRevision !== configurationRevision(c) || expectedEditRevision !== workspaceEditRevision(c)) return json({ error: "configuration_changed", message: "Saved details changed or this page uses an older version. Check the latest saved details before saving your edits." }, 409);
  let patch;
  try { patch = parseWorkspacePatch(supplied); }
  catch (error) {
    if (error instanceof WorkspaceEditError) return json({ error: error.code, message: error.message, fieldErrors: error.fieldErrors }, error.status);
    throw error;
  }
  const at = new Date().toISOString();
  const result = await atomicUpdate("clients", c.slug, current => {
    if (!ownsCurrent(current) || !isSupportedSelfServiceClient(current)) return { result: null };
    if (["cancelled", "archived"].includes(current.status)) return { result: { closed: true } };
    if (configurationRevision(current) !== expectedRevision || workspaceEditRevision(current) !== expectedEditRevision || workspacePatchConflicts(c, current, patch)) return { result: { conflict: true } };
    const value = applyWorkspacePatch(current, patch), loop = loopCheck(value);
    if (loop) return { result: { loop } };
    if (JSON.stringify(value) === JSON.stringify(current)) return { result: { client: current } };
    value.updatedAt = at;
    return { value, result: { client: value } };
  });
  if (!result) return json({ error: "forbidden" }, 403);
  if (result.closed) return json({ error: "workspace_closed", message: "This workspace is closed. Its saved records remain available to export." }, 409);
  if (result.conflict) return json({ error: "configuration_changed", message: "Saved details changed. Check the latest version before saving your edits." }, 409);
  if (result.loop) return json({ error: "loop", ...result.loop, fieldErrors: { [result.loop.field]: result.loop.message } }, 400);
  return json({ ok: true, client: ownerView(result.client), setup: setupReadiness(result.client), configurationRevision: configurationRevision(result.client), editRevision: workspaceEditRevision(result.client) }, 200, { "Cache-Control": "no-store" });
}

export default async (req) => {
  let out;
  try { out = await handle(req); } catch(error) { if(error instanceof SupportReportError)out=json({error:error.code,message:error.message,field:error.field,...(Object.hasOwn(error,'supportReport')?{supportReport:error.supportReport}:{})},error.status,{'Cache-Control':'no-store'});else if(error instanceof ConversationHistoryError)out=json({error:error.code,message:error.message},error.status,{'Cache-Control':'no-store'});else if(error instanceof RequestFollowthroughError || error instanceof LeadConnectionError)out=json({error:error.code,message:error.message,field:error.field},error.status,{'Cache-Control':'no-store'});else if(error?.code==="history_incomplete")out=json({error:error.code,message:error.message},503);else out = json({ error: "client_unavailable", message: "Your desk could not be read or saved. Please try again." }, 503); }
  const origin = req.headers.get("origin") || "";
  if (origin && out instanceof Response) for (const [k, v] of Object.entries(CORS(origin))) out.headers.set(k, v);
  return out;
};
async function handle(req) {
  const url = new URL(req.url);
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS(origin) });
  const slug = s(url.searchParams.get("c"), 40);
  const c = slug ? await strictRead("clients", slug) : null;
  if (!c) return json({ error: "not_found" }, 404, CORS(origin));
  const key = s(url.searchParams.get("k"), 80);
  const selfService = isSelfServiceClient(c);
  if (selfService && !isSupportedSelfServiceClient(c)) return json({ error: "unsupported_workspace", message: "This workspace needs a supported migration before use." }, 409);
  let session = null;
  if (selfService && req.headers.has("authorization")) {
    if (origin && !accessOriginAllowed(origin)) return json({ error: "forbidden" }, 403);
    session = await getAccessSession(req);
    if (!session) return json({ error: "verification_required" }, 401);
    if (normalizeAccountEmail(session.email) !== normalizeAccountEmail(c.owner?.email)) return json({ error: "forbidden" }, 403);
  }
  const isOwner = selfService ? !!session : key && key === c.ownerKey;
  if (url.searchParams.has("k") && !isOwner) return json({ error: selfService ? "verification_required" : "invalid_owner_key" }, 401);
  if (selfService && !isOwner && (req.method !== "GET" || url.searchParams.has("export"))) return json({ error: "verification_required" }, 401);
  const ownsCurrent = current => !!current && current.slug === c.slug && current.ownerKey === c.ownerKey && (selfService ? isSelfServiceClient(current) && normalizeAccountEmail(current.owner?.email) === normalizeAccountEmail(session?.email) : current.ownerKey === key);
  const site = process.env.URL || url.origin;

  if (req.method === 'GET' && url.searchParams.has('report')) {
    if (!selfService || !isOwner) return json({ error: 'verification_required' }, 401, { 'Cache-Control': 'no-store' });
    if (url.searchParams.get('report') !== 'activity' || !['7','30','90'].includes(url.searchParams.get('days')) || [...url.searchParams.keys()].some(name => !['c','report','days'].includes(name)) || [...url.searchParams.keys()].length !== 3) return json({ error: 'invalid_report', message: 'Choose a report period.' }, 400, { 'Cache-Control': 'no-store' });
    const report = await workspaceActivity(c, Number(url.searchParams.get('days')));
    const [current, active] = await Promise.all([strictRead('clients', c.slug), getAccessSession(req)]);
    if (!active) return json({ error: 'verification_required' }, 401, { 'Cache-Control': 'no-store' });
    if (!current || workspaceTenant(current) !== workspaceTenant(c) || normalizeAccountEmail(current.owner?.email) !== normalizeAccountEmail(active.email)) return json({ error: 'forbidden' }, 403, { 'Cache-Control': 'no-store' });
    return json({ ok: true, report }, 200, { 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store' });
  }

  if (req.method === 'GET' && url.searchParams.has('conversation')) {
    if (!selfService || !isOwner) return json({error:'verification_required'},401,{'Cache-Control':'no-store'});
    return json(await ownerConversationPage(c,session,{reference:url.searchParams.get('conversation'),contact:url.searchParams.get('conversationContact'),page:url.searchParams.get('before')}),200,{'Cache-Control':'no-store'});
  }
  if (req.method === 'GET' && url.searchParams.has('requestId')) {
    if(!selfService || !isOwner)return json({error:'verification_required'},401,{'Cache-Control':'no-store'});
    return json(await readRequestFollowthrough(c,session,url.searchParams.get('requestId'),url.searchParams.get('operationId')),200,{'Cache-Control':'no-store'});
  }
  if (req.method === "GET") {
    if (!isOwner) {
      if (url.searchParams.get("export")) return json({ error: "forbidden" }, 403);
      const aiAllowance = selfService ? await getAIAllowance(c) : null;
      const web = selfService ? setupReadiness(c).channels.web : null;
      return json({ ...publicView(c), ...(selfService ? { webAvailable: web.ready && web.active && aiAllowance.available } : {}) }, 200, selfService ? { ...CORS(origin), "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store", Vary: "Origin, Authorization" } : { ...CORS(origin), "Cache-Control": "public, max-age=60", "Netlify-CDN-Cache-Control": "public, max-age=60, durable" });
    }
    const exp = url.searchParams.get("export");
    if (exp) return exportCSV(c, exp, session);
    const aiAllowance = selfService ? await getAIAllowance(c) : null;
    let availabilityBlocks;
    try { availabilityBlocks = await getAvailabilityBlocks(c); }
    catch { return json({ error: "availability_unavailable", message: "The visit schedule could not be read. Try again before changing availability." }, 503); }
    const historyPrefix=selfService?`${c.slug}/${workspaceTenant(c)}/`:c.slug+"/";
    let [bookingPage, leadPage, convs, events, alertPage, usage] = await Promise.all([
      listWorkspaceRecords(c,"bookings",100), listWorkspaceRecords(c,"leads",100), listJSON("conversations", historyPrefix, 60), listJSON("events", historyPrefix, 300), listWorkspaceRecords(c,"alerts",100), getUsage(c),
    ]);
    let bookings=bookingPage.records,leads=leadPage.records,alerts=alertPage.records;
    bookings=bookings.filter(row=>belongsToWorkspace(c,row));leads=leads.filter(row=>belongsToWorkspace(c,row));convs=convs.filter(row=>belongsToWorkspace(c,row));events=events.filter(row=>belongsToWorkspace(c,row));alerts=alerts.filter(row=>belongsToWorkspace(c,row));
    if(selfService)leads=await requestFollowthroughSummaries(c,await Promise.all(leads.map(lead=>managedHumanLeadView(c,lead))));
    const ownerBookings = selfService ? await Promise.all(bookings.filter(booking => visibleOwnerBooking(c, booking)).map(async booking => ({ ...booking, ownerVisit: ownerVisitView(booking), pendingVisitChange: await pendingOwnerVisitChange(c, booking.id) }))) : bookings;
    const waiting = new Set(alerts.filter((a) => a.status === "waiting").map((a) => a.leadId));
    const attentionDue = new Set(alerts.filter(a=>a.status==='waiting' && a.attentionDueAt).map(a=>a.leadId));
    const connections=selfService?await serviceConnections(c):null;
    if(selfService){
      const sms=await managedSMSConversations(c,{limit:60});
      for(const conversation of sms){const old=convs.find(row=>row.channel==="sms"&&row.contact===conversation.contact);if(old)Object.assign(old,conversation);else convs.push(conversation);}
    }
    const serviceOnboarding=selfService?await serviceOnboardingStatus(c):null;
    const leadConnections=selfService?await leadConnectionsView(c):null;
    const websiteInstallation=selfService?await websiteInstallationView(c,aiAllowance):null;
    const supportReports=selfService?supportReportViews(c):[];
    const ownerResponse={
      client: ownerView(c), ...(isSelfServiceClient(c) ? { setup: serviceSetupView(c,connections,serviceOnboarding,websiteInstallation,leadConnections), connections, leadConnections, serviceOnboarding, operations: await listWorkspaceOperations(c), phoneActivation: await phoneActivationStatus(c), configurationRevision: configurationRevision(c), editRevision: workspaceEditRevision(c), supportReports, websiteInstallation, pendingVisitCreations: await pendingOwnerVisitCreations(c), aiAllowance, webAvailable: setupReadiness(c).channels.web.ready && setupReadiness(c).channels.web.active && aiAllowance.available } : {}), plan: PLANS[c.plan], usage: usageView(c, usage), bookings: ownerBookings.reverse(), leads: leads.reverse().map((l) => ({ ...l, alertWaiting: waiting.has(l.id), alertAttentionDue:attentionDue.has(l.id) })),
      conversations: convs.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).map(v=>{
        const supportReport=selfService?supportReports.find(row=>row.channel===v.channel&&row.contact===v.contact)||null:null;
        return {channel:v.channel,contact:v.contact,updatedAt:v.updatedAt,flag:supportReport?(supportReport.status==='resolved'?null:{at:supportReport.reportedAt,note:supportReport.note,by:'owner',supportReportId:supportReport.id}):v.flag||null,...(selfService?{supportReport}:{}),...(selfService&&v.channel==='web'?{reference:conversationReference(c,v.channel,v.contact),retainedMessages:v.history?.total??v.messages.length,historyComplete:v.history?.complete===true}:{}),messages:v.messages.slice(-12)};
      }),
      events: events.reverse().slice(0, 80),
      today: todayStrip(c, ownerBookings, leads, events),
      health: lineHealth(c, events, await lastInbound(c)),
      availabilityBlocks,recordListing:{bookings:bookingPage.listing,leads:leadPage.listing,alerts:alertPage.listing},
      integrations: { sms: smsEnabled(), google: googleEnabled(), stripe: stripeEnabled() },
      forwarding: forwardingInstructions(c),
      policy: policyUrls(c.slug, site), dataPolicy: DATA_POLICY, ackMinutesOptions: ACK_MINUTES,
      site,
    };
    await assertCurrentWorkspace(c);return json(ownerResponse);
  }
  if (!isOwner) return json({ error: "forbidden" }, 403);

  if (req.method === "PUT") {
    let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
    if (!b || typeof b !== "object" || Array.isArray(b)) return json({ error: "invalid_request", message: "Check the format of your business details." }, 400);
    if (selfService && b.legal!==undefined) return json({error:"use_secure_registration",message:"Review legal business details in your texting connection form."},400);
    if (selfService) return updateWorkspace(c, b, ownsCurrent);
    const before = JSON.stringify(c);
    const bz = c.business;
    if (b.business) Object.assign(bz, {
      name: s(b.business.name, 120) || bz.name, trade: s(b.business.trade, 80), city: s(b.business.city, 80) || bz.city,
      serviceArea: arr(b.business.serviceArea), notServed: arr(b.business.notServed), hours: s(b.business.hours, 300), afterHours: s(b.business.afterHours, 300),
      spanish: !!b.business.spanish, licenses: s(b.business.licenses, 200), googlePlaceId: s(b.business.googlePlaceId, 120), reviewLink: s(b.business.reviewLink, 300), payLink: s(b.business.payLink, 300),
    });
    if (b.owner) c.owner = { ...c.owner, name: s(b.owner.name) || c.owner.name, phone: e164(s(b.owner.phone, 30)) || c.owner.phone, ...(b.owner.backupPhone !== undefined ? { backupPhone: e164(s(b.owner.backupPhone, 30)) } : {}) };
    if (b.services) c.services = arr(b.services, 60);
    if (b.fees) c.fees = (Array.isArray(b.fees) ? b.fees : []).map((f) => ({ label: s(f.label, 80), amount: s(f.amount, 40), note: s(f.note, 120) })).filter((f) => f.label).slice(0, 30);
    if (b.windows) c.windows = arr(b.windows, 8);
    if (b.rules) c.rules = {
      ...c.rules,
      never: b.rules.never !== undefined ? arr(b.rules.never, 20) : c.rules.never, handoff: b.rules.handoff !== undefined ? arr(b.rules.handoff, 20) : c.rules.handoff,
      emergencies: b.rules.emergencies !== undefined ? normalizeEmergencies(typeof b.rules.emergencies === "string" ? { ...normalizeEmergencies(c.rules.emergencies, c.business.trade), script: s(b.rules.emergencies, 500) } : b.rules.emergencies, c.business.trade) : c.rules.emergencies,
      ackMinutes: ACK_MINUTES.includes(Number(b.rules.ackMinutes)) ? Number(b.rules.ackMinutes) : (c.rules.ackMinutes || 10),
      callbackHours: s(b.rules.callbackHours, 80) || c.rules.callbackHours || "within 30 minutes",
      callbackAfterHours: s(b.rules.callbackAfterHours, 80) || c.rules.callbackAfterHours || "by 8 am tomorrow",
      windowCapacity: b.rules.windowCapacity !== undefined ? Math.min(20, Math.max(1, parseInt(b.rules.windowCapacity, 10) || 1)) : (c.rules.windowCapacity || 1),
      consentAsk: b.rules.consentAsk !== undefined ? !!b.rules.consentAsk : !!c.rules.consentAsk,
      avgTicket: b.rules.avgTicket !== undefined ? (Math.max(0, Math.round(Number(String(b.rules.avgTicket).replace(/[^\d.]/g, "")) || 0)) || 0) : (c.rules.avgTicket || 0),
      emergency247: b.rules.emergency247 !== undefined ? !!b.rules.emergency247 : (b.business?.hours !== undefined ? emergency247(s(b.business.hours, 300)) : !!c.rules.emergency247),
      hours: b.rules.hours !== undefined ? (normalizeHours(b.rules.hours) || (typeof b.rules.hours === "string" ? parseHours(b.rules.hours) : null)) : (c.rules.hours || null),
      bypass: b.rules.bypass !== undefined ? [...new Set(arr(b.rules.bypass, 20).map((n) => e164(n)).filter(Boolean))].slice(0, 20) : (c.rules.bypass || []),
    };
    if (b.digest) c.digest = { ...(c.digest || {}), ...(b.digest.text !== undefined ? { text: !!b.digest.text } : {}) };
    if (b.faq) c.faq = (Array.isArray(b.faq) ? b.faq : []).map((x) => ({ q: s(x.q, 200), a: s(x.a, 600) })).filter((x) => x.q && x.a).slice(0, 40);
    if (b.summary !== undefined) c.summary = s(b.summary, 2000);
    if (b.widget) c.widget = { ...c.widget, greeting: s(b.widget.greeting, 200), allowedOrigins: arr(b.widget.allowedOrigins, 5) };
    if (b.phone) c.phone = { ...c.phone, businessNumber: e164(s(b.phone.businessNumber, 30)) || c.phone.businessNumber, forwarding: ["missed", "all", "none"].includes(b.phone.forwarding) ? b.phone.forwarding : c.phone.forwarding, carrier: ["att", "verizon", "tmobile", "voip", "other"].includes(b.phone.carrier) ? b.phone.carrier : c.phone.carrier, ...(b.phone.transferTo !== undefined ? { transferTo: e164(s(b.phone.transferTo, 30)) } : {}) };
    if (b.legal) c.business.legal = { ...(c.business.legal || {}), legalName: s(b.legal.legalName, 120), ein: s(b.legal.ein, 20), businessType: ["llc", "corp", "sole", "partnership", "nonprofit"].includes(b.legal.businessType) ? b.legal.businessType : (c.business.legal?.businessType || "llc"), street: s(b.legal.street, 120), city: s(b.legal.city, 80), state: s(b.legal.state, 2).toUpperCase() || "TX", zip: s(b.legal.zip, 10) };
    if (["starter", "growth", "pro"].includes(b.plan)) c.plan = b.plan;
    if (b.software) c.software = s(b.software, 30);
    const loop = loopCheck(c);
    if (loop) { Object.assign(c, JSON.parse(before)); return json({ error: "loop", ...loop }, 400); }
    await saveClient(c); await indexClient(c);
    await logEvent(c, "config_updated", {});
    const priorVoice = JSON.stringify(c.voice);
    try { await updateVoicePrompt(c); if (JSON.stringify(c.voice) !== priorVoice) await saveClient(c); } catch (e) { console.error("voice prompt update", e); }
    try { const { syncVoiceFallback } = await import("./lib/twilio.mjs"); await syncVoiceFallback(c); } catch (e) { console.error("voice fallback sync", e); }
    return json({ ok: true, client: ownerView(c) });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { b = {}; }
    if(b?.action==='report_conversation'){if(!selfService||!accessOriginAllowed(origin))return json({error:'forbidden'},403);return json(await reportConversation(c,session,b),200,{'Cache-Control':'no-store'});}
    if(b?.action==='platform_automation'){if(!selfService||!accessOriginAllowed(origin))return json({error:'forbidden'},403);const result=await changePlatformAutomation(c,session,b);return json({...result,leadConnections:await leadConnectionsView(c),...(['takeover','resume'].includes(b.operation)?await readRequestFollowthrough(c,session,b.requestId):{})},200,{'Cache-Control':'no-store'});}
    if(b?.action==='lead_connection'){if(!selfService||!accessOriginAllowed(origin))return json({error:'forbidden'},403);return json(await changeLeadConnection(c,session,b),200,{'Cache-Control':'no-store'});}
    if(['start_thumbtack_connection','continue_thumbtack_connection','select_thumbtack_business','send_platform_reply'].includes(b?.action)){
      if(!selfService||!accessOriginAllowed(origin))return json({error:'forbidden'},403);
      const result=b.action==='start_thumbtack_connection'?await startThumbtackConnection(c,session,b):b.action==='continue_thumbtack_connection'?await continueOwnerThumbtack(c,session,b):b.action==='select_thumbtack_business'?await selectThumbtackBusiness(c,session,b):await sendPlatformReply(c,session,b);
      if(b.action==='send_platform_reply')return json({...result,...await readRequestFollowthrough(c,session,b.requestId,b.operationId)},200,{'Cache-Control':'no-store'});
      return json({...result,leadConnections:await leadConnectionsView(c)},200,{'Cache-Control':'no-store'});
    }
    if(b?.action==='request_followup'){if(!selfService||!accessOriginAllowed(origin))return json({error:'forbidden'},403);const {updateRequestAutomation}=await import('./lib/request-followup.mjs');return json(await updateRequestAutomation(c,session,b),200,{'Cache-Control':'no-store'});}
    if(b?.action==='request_followthrough'){
      if(!selfService || !accessOriginAllowed(origin))return json({error:'forbidden'},403);
      return json(await updateRequestFollowthrough(c,session,b),200,{'Cache-Control':'no-store'});
    }
    if (b?.action === 'start_website_check') {
      if (!selfService || !accessOriginAllowed(origin)) return json({ error: 'forbidden' }, 403);
      if (JSON.stringify(b).length > 1200) return json({ error: 'invalid_request' }, 400);
      try { return json(await startWebsiteCheck(c, session, b), 200, { 'Cache-Control': 'no-store' }); }
      catch (error) { if (error instanceof WebsiteInstallationError) return json({ error: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) }, error.status, { 'Cache-Control': 'no-store' }); throw error; }
    }
    if (["create_visit", "reschedule_visit", "cancel_visit", "visit_availability"].includes(b?.action)) {
      if (!selfService || !accessOriginAllowed(origin)) return json({ error: "forbidden" }, 403, { "Cache-Control": "no-store" });
      try { return json(await (b.action==='visit_availability'?previewOwnerVisitAvailability(c,session,b):changeOwnerVisit(c, session, b)), 200, { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control":"no-store" }); }
      catch (error) {
        if (error instanceof OwnerVisitError) return json({ error: error.code, message: error.message, field: error.field }, error.status, { "Cache-Control": "no-store" });
        return json({ error: b.action==='visit_availability'?"availability_unavailable":"visit_outcome_uncertain", message: b.action==='visit_availability'?"Available times could not be confirmed. Try again; no visit has been changed.":"The visit change could not be confirmed. Retry the same saved change." }, 503, { "Cache-Control": "no-store" });
      }
    }
    const serviceActions = {
      request_service_onboarding: ["expectedRevision", "submissionId", "offerDigest", "acceptedChannels", "acceptedCosts", "authority", "forwardingMode", "legal", "attestLegalAccuracy", "attestConsent", "testPhoneConsent"],
      cancel_service_onboarding: ["expectedRevision", "operationId"],
      start_calendar_connection: ["expectedRevision", "availabilityConsentVersion"], complete_calendar_connection: ["state", "code", "error"], disconnect_calendar: [],
      request_voice_activation: ["expectedRevision", "acceptedAuthority", "policyVersion", "policyDigest", "forwardingMode"],
      cancel_voice_activation: ["expectedRevision"],
      resume_services: ["expectedRevision"],
      request_messaging_activation: ["expectedRevision", "submissionId", "offerVersion", "offerDigest", "programDigest", "acceptedCosts", "authority", "attestLegalAccuracy", "attestConsent", "testPhoneConsent", "legal"],
      correct_messaging_activation: ["expectedRevision", "operationId", "expectedSubmissionRevision", "submissionId", "offerVersion", "offerDigest", "programDigest", "acceptedCosts", "authority", "attestLegalAccuracy", "attestConsent", "testPhoneConsent", "legal"],
      renew_messaging_probe: ["expectedRevision", "operationId", "expectedProbeNonce", "testPhoneConsent"],
      cancel_messaging_activation: ["expectedRevision", "operationId"]
    };
    if (Object.hasOwn(serviceActions, b?.action || "")) {
      if (!selfService || !accessOriginAllowed(origin)) return json({ error: "forbidden" }, 403);
      if (JSON.stringify(b).length > 12000 || Object.keys(b).some(field => !["action", ...serviceActions[b.action]].includes(field))) return json({ error: "invalid_request" }, 400);
      const actor = { role: "owner", email: session.email }, body = { ...b, actor }; delete body.action;
      try {
        let result;
        if(b.action==="resume_services"){
          const updated=await atomicUpdate("clients",c.slug,current=>{
            if(!ownsCurrent(current))throw new Error("Workspace changed");
            const restoringWeb = current.pausedChannels?.web?.active === true;
            if(current.status!=="paused" || b.expectedRevision!==configurationRevision(current) || (restoringWeb && !setupReadiness(current).canActivateWeb))return {result:null};
            const value={...current,status:current.pausedFrom==="live"?"live":"testing",channels:{...current.channels,web:{active:current.pausedChannels?.web?.active===true}},operationLifecycleVersion:(current.operationLifecycleVersion || 0)+1,pausedAt:null,updatedAt:new Date().toISOString()};
            return {value,result:value};
          });
          if(!updated)return json({error:"not_ready",message:"Review and test your current saved rules before resuming."},409);
          try{await dispatchVoiceActivationWave();}catch{/* Scheduled recovery resumes accepted phone work. */}
          try{await dispatchCalendarDeliveryWave(c);}catch{/* Scheduled recovery resumes saved calendar work. */}
          return json({ok:true,client:ownerView(updated),connections:await serviceConnections(updated)},202,{"Cache-Control":"no-store"});
        }
        if (b.action === "request_service_onboarding" || b.action === "cancel_service_onboarding") {
          result = b.action === "request_service_onboarding" ? await requestServiceOnboarding(c, body) : await cancelServiceOnboarding(c, body);
          try { await dispatchServiceOnboarding(c); } catch { /* The scheduled coordinator recovers the durable request. */ }
          return json({ ok: true, result, serviceOnboarding: await serviceOnboardingStatus(c), connections: await serviceConnections(c), phoneActivation: await phoneActivationStatus(c) }, 202, { "Cache-Control": "no-store" });
        } else if (b.action === "start_calendar_connection") {
          if (b.expectedRevision !== configurationRevision(c)) return json({ error: "configuration_changed" }, 409);
          result = await startCalendarConnection(c, session, {availabilityConsentVersion:b.availabilityConsentVersion});
        } else if (b.action === "complete_calendar_connection") result = await completeCalendarConnection(c, session, {state:b.state,...(b.code!==undefined?{code:b.code}:{}),...(b.error!==undefined?{error:b.error}:{})});
        else if (b.action === "disconnect_calendar") result = await disconnectCalendar(c, session);
        else if (b.action === "request_voice_activation") result = await requestVoiceActivation(c, body);
        else if (b.action === "cancel_voice_activation") result = await cancelVoiceActivation(c, body);
        else if (b.action === "request_messaging_activation") result = await requestMessagingActivation(c, body);
        else if (b.action === "correct_messaging_activation") result = await correctMessagingActivation(c, body);
        else if (b.action === "renew_messaging_probe") result = await renewMessagingProbe(c, body);
        else result = await cancelMessagingActivation(c, b.operationId, body);
        if (["request_messaging_activation", "correct_messaging_activation", "cancel_messaging_activation", "renew_messaging_probe"].includes(b.action)) try { await dispatchServiceWorker("service-activation-background",{slug:c.slug,tenant:deliveryTenant(c)}); } catch { /* Scheduled recovery still owns the saved intent. */ }
        if (["request_voice_activation", "cancel_voice_activation"].includes(b.action)) try { await dispatchVoiceActivationWave(); } catch { /* The next scheduled wave recovers the saved intent. */ }
        if (b.action === "complete_calendar_connection") try { await dispatchCalendarDeliveryWave(c); } catch { /* Saved future visits are discovered by scheduled recovery. */ }
        return json({ ok: true, result, connections: await serviceConnections(c) }, 202, { "Cache-Control": "no-store" });
      } catch (error) {
        return json({ error: typeof error.code === "string" ? error.code : "service_setup_unavailable", message: error instanceof CalendarError || error instanceof ServiceOnboardingError || /ActivationError$/.test(error.constructor?.name || "") ? error.message : "Your service change could not be confirmed. Refresh its status before retrying." }, Number.isInteger(error.status) ? error.status : 503, { "Cache-Control": "no-store" });
      }
    }
    if (["request_phone_activation", "cancel_phone_activation"].includes(b?.action)) {
      if (!selfService || !accessOriginAllowed(origin)) return json({ error: "forbidden" }, 403);
      const allowed = b.action === "request_phone_activation" ? ["action", "expectedRevision", "submissionId", "offerVersion", "offerDigest", "acceptedCosts", "authority"] : ["action", "expectedRevision", "operationId"];
      if (JSON.stringify(b).length > 1500 || Object.keys(b).some(key => !allowed.includes(key))) return json({ error: "invalid_request" }, 400);
      const actor = { role: "owner", email: session.email };
      try {
        const operation = b.action === "request_phone_activation" ? await requestPhoneActivation(c, { actor, expectedRevision: b.expectedRevision, submissionId: b.submissionId, offerVersion: b.offerVersion, offerDigest: b.offerDigest, acceptedCosts: b.acceptedCosts, authority: b.authority }) : await cancelPhoneActivation(c, b.operationId, { actor, expectedRevision: b.expectedRevision });
        return json({ ok: true, operation, phoneActivation: await phoneActivationStatus(c) }, 202, { "Cache-Control": "no-store" });
      } catch (error) { if (error instanceof PhoneActivationError) return json({ error: error.code, message: error.message }, error.status); throw error; }
    }
    if (["rebuild_workspace", "retry_operation"].includes(b?.action)) {
      if (!selfService || !accessOriginAllowed(origin)) return json({ error: "forbidden" }, 403);
      if (JSON.stringify(b).length > 1500 || Object.keys(b).some(key => !["action", "expectedRevision", "reason", ...(b.action === "retry_operation" ? ["operationId"] : [])].includes(key))) return json({ error: "invalid_request" }, 400);
      try {
        const options = { actor: { role: "owner", email: session.email }, reason: b.reason, expectedRevision: b.expectedRevision };
        const operation = b.action === "rebuild_workspace" ? await queueWorkspaceRebuild(c, options) : await retryWorkspaceOperation(c, b.operationId, options);
        return json({ ok: true, operation, operations: await listWorkspaceOperations(c) }, 202, { "Cache-Control": "no-store" });
      } catch (error) {
        if (error instanceof WorkspaceOperationError) return json({ error: error.code, message: error.message }, error.status);
        throw error;
      }
    }
    if (b?.action === "save_connection_preferences") {
      if (!selfService || !accessOriginAllowed(origin)) return json({ error: "forbidden" }, 403);
      if (JSON.stringify(b).length > 1024) return json({ error: "invalid_request" }, 413);
      if (Object.keys(b).some(field => !["action", "desiredChannels"].includes(field)) || !Array.isArray(b.desiredChannels) || b.desiredChannels.length > 4 || new Set(b.desiredChannels).size !== b.desiredChannels.length || b.desiredChannels.some(value => !INTAKE_CHANNELS.includes(value))) return json({ error: "invalid_channels" }, 400);
      const updated = await atomicUpdate("clients", c.slug, current => {
        if (!ownsCurrent(current)) return { result: null };
        const value = { ...current, onboarding: { ...current.onboarding, desiredChannels: [...b.desiredChannels] }, updatedAt: new Date().toISOString() };
        return { value, result: value };
      });
      if (!updated) return json({ error: "forbidden" }, 403);
      return json({ ok: true, setup: setupReadiness(updated) }, 200, { "Cache-Control": "no-store" });
    }
    if (b.action === "availability_block" || b.action === "availability_unblock") {
      try { return json(await setAvailabilityBlock(c, b.date, b.window, b.action === "availability_block")); }
      catch (err) { return err instanceof AvailabilityInputError ? json({ error: err.code, message: err.message }, 400) : json({ error: "availability_unavailable", message: "The schedule change could not be confirmed. Reload availability before trying again." }, 503); }
    }
    if (isSelfServiceClient(c) && ["review_rules", "go_live", "resume", "pause", "cancel", "provision", "forwarding_verified"].includes(b.action)) {
      if (["provision", "forwarding_verified"].includes(b.action)) return json({ error: "channel_setup_unavailable", message: "Phone and text service are not active. A button cannot certify provider acceptance or delivery.", setup: setupReadiness(c) }, 409);
      if ((b.channel && b.channel !== "web") || (b.channels && (!Array.isArray(b.channels) || b.channels.length !== 1 || b.channels[0] !== "web"))) return json({ error: "channel_not_ready", setup: setupReadiness(c) }, 409);
      const result = await atomicUpdate("clients", c.slug, async current => {
        if (!ownsCurrent(current)) return { result: { error: "forbidden", status: 403 } };
        const setup = setupReadiness(current), now = new Date().toISOString();
        if (b.action === "review_rules") {
          if (typeof b.revision !== "string" || b.revision !== configurationRevision(current)) return { result: { error: "configuration_changed", status: 409, setup } };
          const updated = { ...current, setupProof: { ...current.setupProof, reviewedRevision: b.revision, reviewedAt: now }, updatedAt: now };
          return { value: updated, result: { client: updated } };
        }
        if (["go_live", "resume"].includes(b.action) && !setup.canActivateWeb) return { result: { error: "not_ready", status: 409, setup } };
        if (["go_live", "resume"].includes(b.action)) {
          const aiAllowance = await getAIAllowance(current);
          if (!aiAllowance.available) return { result: { error: "ai_daily_limit", status: 429, setup, aiAllowance } };
        }
        if (b.action === "pause" && !["live", "testing"].includes(current.status)) return { result: { error: "not_active", status: 409, setup } };
        const status = b.action === "pause" ? "paused" : b.action === "cancel" ? "cancelled" : "live";
        const updated = { ...current, status, operationLifecycleVersion: (current.operationLifecycleVersion || 0) + 1, channels: { web: { active: status === "live" }, voice: { active: false }, sms: { active: false } }, updatedAt: now,
          ...(status === "live" ? { liveAt: current.liveAt || now, pausedAt: null } : status === "paused" ? { pausedAt: now, pausedFrom: current.status,pausedChannels:current.channels } : { cancelledAt: current.cancelledAt || now, cancelReason: s(b.reason, 300) }) };
        return { value: updated, result: { client: updated } };
      });
      if (result.error) return json({ error: result.error, setup: result.setup, ...(result.aiAllowance ? { aiAllowance: result.aiAllowance, message: "Website chat cannot activate while today’s AI allowance is exhausted." } : {}) }, result.status);
      if (b.action === "cancel") { await cancelTasks(c.slug, () => true); await queueWorkspaceStopBilling(result.client); }
      const aiAllowance = await getAIAllowance(result.client);
      return json({ ok: true, status: result.client.status, client: ownerView(result.client), setup: setupReadiness(result.client), configurationRevision: configurationRevision(result.client), aiAllowance, webAvailable: result.client.status === "live" && setupReadiness(result.client).canActivateWeb && aiAllowance.available, activeChannels: result.client.status === "live" && aiAllowance.available ? ["web"] : [] });
    }
    const fw = forwardingInstructions(c);
    const name = c.business.name || "Your front desk";
    if (b.action === "go_live" || b.action === "resume") {
      const wasPaused = c.status === "paused";
      c.status = wasPaused ? (c.pausedFrom === "live" ? "live" : "live") : "live";
      c.liveAt = c.liveAt || new Date().toISOString(); c.pausedAt = null;
      await saveClient(c); await logEvent(c, wasPaused ? "resumed" : "live", {});
      if (wasPaused) { try { await attachVoice(c, site); await saveClient(c); } catch (e) { console.error("attach voice", e); } }
      else {
        const welcome = `${name}: you're live. Every lead and booking comes to this number as a job ticket, and each one names the single reply it needs (ok, called, otw, or done). A 6 pm summary comes on any day it handled something, and a report every Monday. Flag anything that reads wrong on your portal and Steve sees it the same day.`;
        if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "welcome", body: welcome });
        await sendEmail({ to: c.owner.email, subject: `${name}: you're live`, text: `${welcome}

Your portal: ${site}/desk?c=${c.slug}&k=${c.ownerKey}

What the first alert looks like:
${name} front desk: BOOKED
Customer: Maria Lopez (new)
Phone: +1 713 555 0100
Where: 1402 Mason Rd, Katy
Issue: AC blowing warm air
Window: tomorrow, 8 to 12
Ref ab12cd. Reply "ok ab12cd" to acknowledge, "otw ab12cd" on the way, "done ab12cd" finished.

Texts to customers go out from ${c.phone?.twilioNumber && c.phone?.tenDlc === "approved" ? "your number" : "Machines & Cloud's registered number with your shop's name until carriers approve yours"}.` });
      }
      return json({ ok: true, status: c.status });
    }
    if (b.action === "pause") {
      if (!["testing", "live"].includes(c.status)) return json({ error: "not_active" }, 400);
      c.pausedFrom = c.status; c.status = "paused"; c.pausedAt = new Date().toISOString();
      await saveClient(c); await logEvent(c, "paused", {});
      try { await detachVoice(c, site); await saveClient(c); } catch (e) { console.error("detach voice", e); }
      const off = fw.off?.length ? `To stop forwarding entirely, dial ${fw.off.join(" or ")} from your cell.` : "To stop forwarding entirely, turn it off in your carrier app.";
      const text = `${name}: your front desk is paused. Calls to ${c.phone.twilioNumber || "the front desk number"} ring your cell; texts get one reply pointing to your main line. ${off} Resume from your portal any time.`;
      if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: text });
      await sendEmail({ to: c.owner.email, subject: `${name}: paused`, text });
      return json({ ok: true, status: c.status, off: fw.off });
    }
    if (b.action === "cancel") {
      c.status = "cancelled"; c.cancelledAt = new Date().toISOString(); c.serviceEndsAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(); c.cancelReason = s(b.reason, 300);
      await saveClient(c); await logEvent(c, "cancelled", { reason: c.cancelReason });
      await cancelTasks(c.slug, () => true);
      try { await detachVoice(c, site); await saveClient(c); } catch (e) { console.error("detach voice", e); }
      const last = c.cancelledAt.slice(0, 10), ends = c.serviceEndsAt.slice(0, 10);
      const off = fw.off?.length ? `To stop forwarding, dial ${fw.off.join(" or ")} from your cell now.` : "To stop forwarding, turn it off in your carrier app now.";
      if (c.owner.phone) await sendSMS({ to: c.owner.phone, client: c, force: true, type: "owner_note", body: `${name}: your front desk is cancelled as of today. ${off} Until ${ends} any call that still reaches ${c.phone.twilioNumber || "the front desk number"} rings your cell. Reply here if you did not mean to.` });
      await sendEmail({ to: c.owner.email, subject: `${name}: cancellation confirmed`, text: `Your front desk was cancelled on ${last}. Nothing is invoiced for any day after ${last}.\n\n${off} iPhone users: also check Settings, Phone, Live Voicemail.\n\nUntil ${ends}, calls to ${c.phone.twilioNumber || "the front desk number"} ring straight through to your cell and no text or AI answers. After that the number is released.\n\n${DATA_POLICY}\n\nTo come back, reply to this email.` });
      await notifySteve(`Cancelled: ${name}`, `Reason: ${c.cancelReason || "-"}\nVerify forwarding is off (call ${c.phone.businessNumber || "their line"}), close the invoice as of ${last}, release the number on ${ends}.\n${site}/desk?c=${c.slug}&k=${c.ownerKey}`);
      return json({ ok: true, status: c.status, serviceEndsAt: c.serviceEndsAt, off: fw.off });
    }
    if (b.action === "ack") {
      const n = await ackAlertsFor(c, s(b.leadId, 64), "portal");
      return json({ ok: true, acked: n });
    }
    if (b.action === "flag" || b.action === "unflag") {
      if(selfService)return json({error:'use_report_form',message:'Use Report a problem to send a note and follow its progress.'},409,{'Cache-Control':'no-store'});
      const channel = s(b.channel, 10), contact = s(b.contact, 60);
      const conv = await getConversation(c, channel, contact);
      if (!conv.messages.length) return json({ error: "no_conversation" }, 404);
      if (b.action === "flag") {
        conv.flag = { at: new Date().toISOString(), note: s(b.note, 300), by: "owner" };
        await saveConversation(conv); await logEvent(c, "flagged", { channel, contact });
        const tail = conv.messages.slice(-6).map((m) => `${m.role === "user" ? "Customer" : "Desk"}: ${m.content}`).join("\n");
        if (!isSelfServiceClient(c)) await notifySteve(`Flagged by ${name}: ${channel} ${contact}`, `${conv.flag.note || "(no note)"}\n\n${tail}\n\n${site}/desk?c=${c.slug}&k=${c.ownerKey}#convs`);
      } else { conv.flag = null; await saveConversation(conv); await logEvent(c, "unflagged", { channel, contact }); }
      return json({ ok: true, flag: conv.flag });
    }
    if (b.action === "digest") { const d = await dailyDigest(c); return json({ ok: true, text: d.text, email: d.email }); }
    if (b.action === "weekly") { const w = await weeklyReport(c); return json({ ok: true, ...w }); }
    if (b.action === "monthly") { const mth = await monthlyReport(c, s(b.month, 7) || undefined); const { invoice, ...rest } = mth; return json({ ok: true, ...rest }); }
    if (b.action === "test_sms") {
      if (!c.owner.phone) return json({ error: "no_owner_phone" }, 400);
      const r = await sendSMS({ to: c.owner.phone, client: c, force: true, type: "test", body: `${name}: test text from your front desk. Reply "help" any time to see the commands.` });
      return json({ ok: r.ok, logged: !!r.logged, error: r.error || r.reason });
    }
    if (b.action === "provision") {
      try { await fetch(`${url.origin}/.netlify/functions/provision-background`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: c.slug, key: c.ownerKey }) }); } catch (e) { return json({ error: "could_not_start" }, 502); }
      return json({ ok: true });
    }
    if (b.action === "forwarding_verified") { c.phone.forwardingVerified = true; await saveClient(c); return json({ ok: true }); }
    return json({ error: "unknown_action" }, 400);
  }
  return json({ error: "method_not_allowed" }, 405);
};

// "1402 Mason Rd, Katy, TX 77450" -> street, city, state, zip; without a ZIP the city falls back to the shop's.
function splitAddress(addr, defaultCity) {
  const t = String(addr || "").trim();
  const m = t.match(/^(.*?)(?:,\s*([A-Za-z .'-]+?))?(?:,?\s*(TX|Texas))?\s*,?\s*(\d{5})(?:-\d{4})?$/i);
  if (m) return { street: m[1].replace(/,\s*$/, "").trim(), city: (m[2] || defaultCity).trim(), state: "TX", zip: m[4] };
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { street: parts[0], city: parts[1].replace(/\b(TX|Texas)\b/i, "").trim() || defaultCity, state: "TX", zip: "" };
  return { street: t, city: defaultCity, state: "TX", zip: "" };
}

// The portal's Today strip: this Houston day's calls, texts, bookings, and leads needing the owner.
function todayStrip(c, bookings, leads, events) {
  const day = (iso) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso)) : "");
  const today = day(new Date().toISOString());
  return {
    calls: events.filter((e) => ["missed_call", "call_ended"].includes(e.type) && day(e.at) === today).length,
    texts: events.filter((e) => e.type === "sms_inbound" && day(e.at) === today).length,
    bookings: bookings.filter((b) => !b.websiteSetupCheck && day(b.createdAt) === today).length,
    needsYou: leads.filter((l) => !l.websiteSetupCheck && l.status === "open" && ["needs_action", "wants_call"].includes(l.outcome)).length,
  };
}

// ---- CSV export (RFC 4180, UTF-8 BOM, attachment) ----
const csvCell = (v) => { const t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const csv = (header, rows) => "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
async function recordsForExport(c,kind,limit){
  const page=await listWorkspaceRecords(c,kind,limit);
  if(isSelfServiceClient(c)&&page.listing.incomplete)throw Object.assign(new Error('A complete history export is not available yet. Some saved records need reconciliation; contact support before exporting.'),{code:'history_incomplete'});
  return page.records;
}
async function exportCSV(c, what, session) {
  const today = new Date().toISOString().slice(0, 10);
  let header, rows;
  if (what === "bookings") {
    header = ["id", "createdAt", "customer_name", "phone", "address", "issue", "date", "window", "urgency", "status", "outcome", "customerType", "channel", "notes", "unsure", "consent.at", "consent.channel", "setup_check"];
    rows = (await recordsForExport(c,"bookings",2000)).filter(booking => visibleOwnerBooking(c, booking)).map((b) => [b.id, b.createdAt, b.customer_name, b.phone, b.address, b.issue, b.date, b.window, b.urgency, b.status, b.outcome, b.customerType, b.channel, b.notes, b.unsure, b.consent?.at, b.consent?.channel, b.websiteSetupCheck ? 'Website setup check' : '']);
  } else if (what === "leads") {
    header = ["id", "createdAt", "customer_name", "phone", "address", "issue", "reason", "outcome", "urgency", "wanted", "status", "channel", "unsure", "setup_check"];
    const leads=await requestFollowthroughSummaries(c,(await recordsForExport(c,'leads',2000)).filter(row=>belongsToWorkspace(c,row)));
    if(isSupportedSelfServiceClient(c))header.push('followthrough_owner','next_action','due_at','contact_outcome','completed_at','resolution','review_required','followthrough_history');
    rows=[];
    for(const l of leads){const row=[l.id,l.createdAt,l.customer_name,l.phone,l.address,l.issue,l.reason,l.outcome,l.urgency,l.wanted,l.status,l.channel,l.unsure,l.websiteSetupCheck?'Website setup check':''];if(l.followthrough){const f=l.followthrough;const detail=await readRequestFollowthrough(c,session,l.id);row.push(f.state.owner?.email||'',f.state.nextAction||'',f.state.dueAt||'',f.state.contact,f.state.completedAt||'',f.state.resolution||'',f.reviewRequired,JSON.stringify(detail.request.history));}rows.push(row);}
  } else if (what === "conversations") {
    header = ["channel", "contact", "at", "role", "content", "flag_note", "processing"];
    rows = [];
    const conversations=(isSupportedSelfServiceClient(c)?await conversationHeadsForExport(c):await listJSON("conversations",c.slug+"/",2000)).filter(row=>belongsToWorkspace(c,row)),sms=isSelfServiceClient(c)?await managedSMSConversations(c,{limit:100}):[];
    let archiveBytes=0;
    for(const v of conversations.filter(v=>!sms.some(managed=>v.channel==="sms"&&managed.contact===v.contact)).concat(sms)) {
      let messages=v.messages||[];
      if(isSupportedSelfServiceClient(c)&&v.channel==='web') {
        const conv=await readConversationArchive(c,'web',v.contact);
        if(!conv.history?.complete)throw new ConversationHistoryError('history_incomplete','Earlier website messages may not have been retained. Read the saved history in Inbox; contact support before requesting a complete export.',503);
        if(conv.history.total>2000||rows.length+conv.history.total>4000)throw new ConversationHistoryError('history_export_too_large','This history is too large for one download. Read it in Inbox or contact support for an export.',413);
        messages=await readArchivedMessages(conv,0,conv.history.total);archiveBytes+=Buffer.byteLength(JSON.stringify(messages));
        if(archiveBytes>4*1024*1024)throw new ConversationHistoryError('history_export_too_large','This history is too large for one download. Read it in Inbox or contact support for an export.',413);
      }
      for(const m of messages)rows.push([v.channel,v.contact,m.at,m.role,m.content,v.flag?.note||'',m.processing||'']);
    }
  } else if (what === "customers") {
    // Jobber's supported import headers; Housecall Pro's wizard maps the same names.
    header = ["First name", "Last name", "Mobile Phone", "Email", "Street", "City", "State", "Zip Code", "Note", "Lead Source", "Tags"];
    const byPhone = new Map();
    const all = [...(await recordsForExport(c,"bookings",2000)).filter(booking => visibleOwnerBooking(c, booking)).map((b) => ({ ...b, kind: "booking" })), ...(await recordsForExport(c,"leads",2000)).filter((l) => belongsToWorkspace(c,l)&&l.status !== "spam").map((l) => ({ ...l, kind: "lead" }))].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    for (const r of all) {
      if (!r.phone || r.websiteSetupCheck) continue;
      const cur = byPhone.get(r.phone) || { name: "", address: "", issues: [], refs: [] };
      if (r.customer_name) cur.name = r.customer_name;
      if (r.address && (r.kind === "booking" || !cur.address)) cur.address = r.address;
      if (r.issue) cur.issues.push(r.issue);
      cur.refs.push(r.id);
      byPhone.set(r.phone, cur);
    }
    rows = [...byPhone.entries()].map(([phone, x]) => {
      const parts = x.name.trim().split(/\s+/); const first = parts[0] || ""; const last = parts.slice(1).join(" ");
      const a = splitAddress(x.address, c.business?.city || "");
      return [first, last, phone, "", a.street, a.city, a.state, a.zip, `${x.issues.slice(-1)[0] || ""}${x.refs.length ? " (refs " + x.refs.join(", ") + ")" : ""}`, "Other", "front desk"];
    });
  } else return json({ error: "unknown_export" }, 400);
  await assertCurrentWorkspace(c);
  return new Response(csv(header, rows), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${c.slug}-${what}-${today}.csv"`, "Cache-Control": "no-store" } });
}
