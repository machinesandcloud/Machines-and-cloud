import { list } from "./store.mjs";
import { strictRead } from "./accounts.mjs";
import { voiceRecoveryHealth } from "./voice-activation.mjs";
import { messagingRecoveryHealth } from "./messaging-activation.mjs";
import { calendarDeliveryEnabled } from "./calendar-delivery.mjs";
import { managedDeliveryEnabled } from "./managed-delivery.mjs";
import { platformSMSHealth } from "./platform-sms.mjs";
import { serviceOnboardingHealth } from "./service-onboarding.mjs";
import { thumbtackRecoveryHealth } from "./thumbtack-connection.mjs";
// Public monitoring and the operator view must interpret the same saved scan.
export function schedulerHealthState(record) {
  const elapsed=Date.now()-Date.parse(record?.at || "");
  const minutesAgo=Number.isFinite(elapsed) ? Math.floor(elapsed/60000) : null;
  const blocks=record?.blocks && typeof record.blocks==="object" && !Array.isArray(record.blocks) ? Object.entries(record.blocks) : [];
  const healthy=minutesAgo!==null && elapsed>=0 && elapsed<=25*60000 && record.ok===true && blocks.length>0 && blocks.every(([,row])=>row?.ok===true);
  return {healthy,minutesAgo,blocks};
}
// Only fixed component/code pairs may reach public or operator diagnostics.
// Stored provider messages, tenant references and resource IDs are never copied.
const FAILURE_CODES = {
  voice: ["voice_recovery_failed", "voice_scope_partial", "voice_unresolved_work", "voice_route_check_stale", "product_gate_closed", "voice_recovery_stale"],
  messaging: ["messaging_recovery_failed", "messaging_scope_partial", "messaging_approval_check_overdue", "product_gate_closed"],
  serviceChecks: ["service_check_recovery_failed", "service_checks_unresolved", "service_check_recovery_stale"],
  platformSMS: ["platform_sms_processing_failed", "platform_sms_reply_budget_reached"],
  setupCoordinator: ["service_setup_worker_failed", "service_setup_scope_partial", "service_setup_receipt_missing", "service_setup_uncertain", "service_setup_stale", "service_setup_worker_stale"],
  leadConnections: ["thumbtack_recovery_failed", "thumbtack_health_scope_partial", "thumbtack_history_unavailable", "thumbtack_reply_unconfirmed", "thumbtack_platform_unavailable", "thumbtack_recovery_stale", "thumbtack_work_stalled"],
  calendarDelivery: ["calendar_delivery_unresolved", "calendar_delivery_failed", "calendar_delivery_recovery_stale"],
  managedDelivery: ["managed_delivery_unresolved", "managed_delivery_failed", "managed_delivery_recovery_stale"],
  inboundSMS: ["inbound_sms_processing_failed"],
};
export function serviceFailureFacts(value) {
  if (!Array.isArray(value)) return [];
  // Iterate the finite schema, never an unbounded stored array or arbitrary keys.
  return Object.entries(FAILURE_CODES).flatMap(([component, codes]) => {
    const row = value.slice(0, 9).find(item => item && typeof item === "object" && item.component === component);
    return row ? [{ component, reasonCode: codes.includes(row.reasonCode) ? row.reasonCode : codes[0] }] : [];
  });
}
// C2 scheduler receipts predate failingComponents but retain the same fixed
// nested health checks. Recover their safe reason facts without re-running work.
export function serviceHealthFailureFacts(record) {
  if (!record || record.ok !== false) return [];
  const declared=serviceFailureFacts(record.failingComponents);
  const candidates=Object.keys(FAILURE_CODES).flatMap(component=>{
    const nested=component==="inboundSMS" && Number.isSafeInteger(record.failedInbound) && record.failedInbound>=0 ? {ok:record.failedInbound===0} : record[component];
    if (nested && typeof nested === "object" && typeof nested.ok === "boolean") {
      if (nested.ok) return [];
      const delivery=component==="calendarDelivery" ? "calendar_delivery" : component==="managedDelivery" ? "managed_delivery" : null;
      return [{component,reasonCode:nested.reasonCode || (delivery ? delivery+(nested.failures>0 ? "_failed" : "_recovery_stale") : null)}];
    }
    return declared.filter(row=>row.component===component);
  });
  return serviceFailureFacts(candidates);
}
async function reconciliationHealth() {
  const [ledger,queue,last]=await Promise.all([
    strictRead("service_reconciliation_health","active_v1"),
    strictRead("service_reconciliation_queue","active_v1"),
    strictRead("health","serviceChecks:lastRun"),
  ]);
  for(const [record,field] of [[ledger,"failures"],[queue,"intents"]]){
    if(record && (record.version!==1 || !record[field] || typeof record[field]!=="object" || Array.isArray(record[field]))) throw new Error("Service-check health unavailable");
  }
  const failures=Object.values(ledger?.failures || {}).filter(row=>row?.failed!==false).length;
  const pending=Object.keys(queue?.intents || {}).length;
  const age=Date.now()-Date.parse(last?.at || ""),fresh=Number.isFinite(age) && age>=0 && age<=25*60000;
  return {ok:failures===0 && last?.ok!==false && (!pending || fresh && last?.ok===true),pending,failures,lastRunAt:last?.at || null,
    reasonCode:failures ? "service_checks_unresolved" : last?.ok===false ? "service_check_recovery_failed" : pending && (!fresh || last?.ok!==true) ? "service_check_recovery_stale" : null};
}
export async function serviceDeliveryHealth() {
  const [voice,messaging,serviceChecks,platformSMS,setupCoordinator,leadConnections]=await Promise.all([voiceRecoveryHealth(),messagingRecoveryHealth(),reconciliationHealth(),platformSMSHealth(),serviceOnboardingHealth(),thumbtackRecoveryHealth()]);
  const workers={};
  for(const [name,enabled,store] of [["calendarDelivery",calendarDeliveryEnabled(),"calendar_deliveries"],["managedDelivery",managedDeliveryEnabled(),"managed_deliveries"]]){
    const rows=(await Promise.all((await list(store,"")).map(key=>strictRead(store,key)))).filter(Boolean);
    const failures=name==="managedDelivery"?Object.keys((await strictRead("managed_delivery_pending","active"))?.failures || {}).length:rows.filter(row=>["failed","uncertain","needs_review","needs_attention","retry"].includes(row.state)).length;
    const pending=rows.filter(row=>!["delivered","completed","synced","cancelled","superseded","suppressed","expired"].includes(row.state)).length;
    const last=await strictRead("health",`${name}:lastRun`), fresh=!!last && Date.now()-Date.parse(last.at)<25*60000;
    workers[name]={ok:failures===0 && (!enabled || !pending || fresh && last.ok!==false),enabled,pending,failures,lastRunAt:last?.at || null};
  }
  const sms=(await Promise.all((await list("managed_sms_inbound","")).map(key=>strictRead("managed_sms_inbound",key)))).filter(Boolean);
  const failedInbound=sms.filter(row=>row.state==="failed").length;
  const result={ok:voice.ok && messaging.ok && serviceChecks.ok && platformSMS.ok && setupCoordinator.ok && leadConnections.ok && Object.values(workers).every(row=>row.ok) && failedInbound===0,voice,messaging,serviceChecks,platformSMS,setupCoordinator,leadConnections,...workers,failedInbound};
  const failingComponents=serviceHealthFailureFacts(result);
  return {...result,reasonCode:failingComponents[0]?.reasonCode || null,failingComponents};
}
