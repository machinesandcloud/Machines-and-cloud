import { list } from "./store.mjs";
import { strictRead } from "./accounts.mjs";
import { voiceRecoveryHealth } from "./voice-activation.mjs";
import { messagingRecoveryHealth } from "./messaging-activation.mjs";
import { calendarDeliveryEnabled } from "./calendar-delivery.mjs";
import { managedDeliveryEnabled } from "./managed-delivery.mjs";
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
  const [voice,messaging,serviceChecks]=await Promise.all([voiceRecoveryHealth(),messagingRecoveryHealth(),reconciliationHealth()]);
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
  return {ok:voice.ok && messaging.ok && serviceChecks.ok && Object.values(workers).every(row=>row.ok) && failedInbound===0,voice,messaging,serviceChecks,...workers,failedInbound};
}
