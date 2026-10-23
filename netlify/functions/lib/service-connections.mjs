import { voiceActivationStatus } from "./voice-activation.mjs";
import { messagingActivationStatus } from "./messaging-activation.mjs";
import { calendarConnectionView } from "./calendar-connection.mjs";
import { calendarDeliveryView } from "./calendar-delivery.mjs";
import { managedDeliveryView } from "./managed-delivery.mjs";
import { forwardingInstructions } from "./forwarding.mjs";
import { setupReadiness } from "./setup.mjs";
import { buildConnectionJourney } from "./connection-journey.mjs";
export function serviceSetupView(c,services,plan=null) {
  const setup=setupReadiness(c),byId={voice:services.voice,sms:services.messaging,calendar:services.calendar};
  const describe=(id,row)=>{
    const active=row.active===true || id==="calendar" && row.connected && services.calendarDelivery.enabled;
    return {active,ready:active,status:active?"active":row.status || row.state || "pending_activation",detail:row.operation?.detail || row.detail || "Review your connection below."};
  };
  for(const [id,row] of Object.entries(byId)){const facts=describe(id,row);setup.channels[id]={...setup.channels[id],...facts};}
  setup.connectionJourney=buildConnectionJourney(c,services,plan,setup);
  for(const row of setup.connectionJourney.channels){if(byId[row.id])setup.channels[row.id]={...setup.channels[row.id],active:row.active===true,ready:row.active===true,status:row.status,detail:row.detail,nextStep:row.nextStep};}
  setup.steps=setup.steps.map(step=>byId[step.id]?{...step,status:setup.channels[step.id].active?"done":setup.channels[step.id].status,detail:setup.channels[step.id].detail}:step);
  return setup;
}
export async function serviceConnections(c) {
  const [voice,messaging,calendar,calendarDelivery,delivery]=await Promise.all([voiceActivationStatus(c),messagingActivationStatus(c),calendarConnectionView(c),calendarDeliveryView(c),managedDeliveryView(c)]);
  if (voice.operation?.number) voice.forwarding=forwardingInstructions({...c,phone:{...c.phone,twilioNumber:voice.operation.number}});
  if (calendar.connected && !calendarDelivery.enabled) calendar.detail="Google Calendar is connected. Sync is waiting for the platform delivery service; visits remain saved in your workspace.";
  return {voice,messaging,calendar,calendarDelivery,delivery};
}
