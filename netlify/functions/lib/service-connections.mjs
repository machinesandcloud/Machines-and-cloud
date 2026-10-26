import { voiceActivationStatus } from "./voice-activation.mjs";
import { messagingActivationStatus } from "./messaging-activation.mjs";
import { calendarConnectionView } from "./calendar-connection.mjs";
import { calendarDeliveryView } from "./calendar-delivery.mjs";
import { managedDeliveryView } from "./managed-delivery.mjs";
import { forwardingInstructions } from "./forwarding.mjs";
import { setupReadiness } from "./setup.mjs";
import { buildConnectionJourney } from "./connection-journey.mjs";
import { managedResourceAdmissionPolicy } from "./managed-resource-admission.mjs";
import { workspaceTenant } from "./workspace-identity.mjs";

// Configuration readiness is not resource admission or delivered service. Keep a
// platform problem separate from the facts and permissions a customer can supply.
export function servicePlatformReadiness(c, services, plan) {
  const policy=managedResourceAdmissionPolicy(),admitted=!!policy&&(policy.mode==='self_service'||policy.tenants.some(row=>row.slug===c.slug&&row.identity===workspaceTenant(c)));
  const resource=(kind)=>admitted&&policy.accountLimits[kind]>0&&policy.tenantLimits[kind]>0;
  const result={};
  for(const id of ['voice','sms']){
    const service=id==='voice'?services.voice:services.messaging,op=service?.operation,accepted=plan?.acceptedChannels?.includes(id)===true&&!!plan.operation;
    const scoped=plan?.available===true&&!!plan.offer&&(plan.offer.scopeChannels||plan.requestedChannels||[]).includes(id);
    const legacy=plan?.legacySetup===true&&plan.numberReady===true&&service?.available===true;
    const numberReady=plan?.numberReady===true||!!op?.number;
    let reasonCode=null;
    if(!service?.active){
      if(service?.platformReady===false||service?.available!==true&&!op)reasonCode='service_configuration_required';
      else if(op?.state==='waiting_platform'||accepted&&plan.operation.state==='waiting_platform')reasonCode='recorded_setup_waiting_platform';
      else if(!op&&!scoped&&!legacy&&!accepted)reasonCode='service_offer_required';
      else if((!numberReady&&!resource('numbers'))||(id==='sms'&&!op&&(!resource('brands')||!resource('campaigns'))))reasonCode='resource_allowance_required';
    }
    result[id]={ready:reasonCode===null,reasonCode,requestSaved:!!op||accepted};
  }
  result.calendar={ready:services.calendar?.available===true||services.calendar?.connected===true&&services.calendarDelivery?.enabled===true,reasonCode:services.calendar?.available===true||services.calendar?.connected===true&&services.calendarDelivery?.enabled===true?null:'calendar_platform_required',requestSaved:services.calendar?.connected===true};
  return result;
}
export function serviceSetupView(c,services,plan=null,websiteInstallation=null,leadConnections={}) {
  const setup=setupReadiness(c),byId={voice:services.voice,sms:services.messaging,calendar:services.calendar};
  const describe=(id,row)=>{
    const active=id!=="calendar" && row.active===true;
    return {active,ready:active,status:active?"active":row.status || row.state || "pending_activation",detail:row.operation?.detail || row.detail || "Review your connection below."};
  };
  for(const [id,row] of Object.entries(byId)){const facts=describe(id,row);setup.channels[id]={...setup.channels[id],...facts};}
  setup.connectionJourney=buildConnectionJourney(c,{...services,platformReadiness:servicePlatformReadiness(c,services,plan)},plan,setup,websiteInstallation,leadConnections);
  for(const row of setup.connectionJourney.channels){if(byId[row.id])setup.channels[row.id]={...setup.channels[row.id],active:row.active===true&&row.verification.working===true,ready:row.active===true&&row.verification.working===true,status:row.status,detail:row.detail,nextStep:row.nextStep,verification:row.verification};}
  setup.steps=setup.steps.map(step=>byId[step.id]?{...step,status:setup.channels[step.id].active?"done":setup.channels[step.id].status,detail:setup.channels[step.id].detail}:step);
  return setup;
}
export async function serviceConnections(c) {
  const [voice,messaging,calendar,calendarDelivery,delivery]=await Promise.all([voiceActivationStatus(c),messagingActivationStatus(c),calendarConnectionView(c),calendarDeliveryView(c),managedDeliveryView(c)]);
  if (voice.operation?.number) voice.forwarding=forwardingInstructions({...c,phone:{...c.phone,twilioNumber:voice.operation.number}});
  if (calendar.connected && !calendarDelivery.enabled) calendar.detail="Google Calendar is connected. Sync is waiting for the platform delivery service; visits remain saved in your workspace.";
  return {voice,messaging,calendar,calendarDelivery,delivery};
}
