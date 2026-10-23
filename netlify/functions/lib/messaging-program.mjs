// Shared pure customer-care program; execution authority uses the same current inputs.
import { createHash } from "node:crypto";
import { policyUrls } from "./config.mjs";
const hash=value=>createHash("sha256").update(value).digest("hex");
export function buildMessagingProgram(c) {
  const name = String(c.business?.name || "Your service company").trim().slice(0, 100), urls = policyUrls(c.slug), help = c.phone?.businessNumber || c.owner?.email;
  const program = { version: "customer_care_ongoing_appointments_v2",
    description: `${name} sends one-to-one customer care replies to people who initiate a text conversation about requested home services. Separately agreed ongoing appointment texts cover saved-visit confirmations, reminders and cancellations, including future visits with this business. An inbound conversation alone does not authorize recurring appointment updates. This program does not send on-the-way alerts, promotions, purchased-list outreach, review requests or unrelated marketing.`,
    messageFlow: `Customers first text ${name} at its published service number about a home-service request. The inbound SMS is retained as consent for direct replies in that conversation only. When a visit is saved during that exchange, the front desk names the business and asks by SMS whether the recipient wants ongoing appointment confirmations, reminders and cancellation texts from this business, including future visits. The question discloses variable frequency, message and data rates, HELP and STOP, and that booking is available without texts. A separate written YES after that question is required. The question, inbound reply, recipient number, provider message IDs, time and wording version ongoing_appointments_v2 are recorded. Older consent for one visit is not widened to future visits. Reply STOP, ALTO or PARAR to end texts; HELP or AYUDA for assistance. START or EMPEZAR removes a previous texting block but does not grant recurring appointment consent. Terms: ${urls.terms}. Privacy: ${urls.privacy}. No texting consent is inferred from signup, a phone call, website chat, a missed call or merely providing a number.`,
    messageSamples: [
      `${name}: your requested service visit is saved for tomorrow, 8 to 12. The shop confirms arrival details directly. Reply STOP to end texts or HELP for help.`,
      `${name}: a reminder about your service appointment tomorrow, 12 to 5. Reply if you need to change it. Message frequency varies. Reply STOP to end texts.`,
      `${name}: your service visit has been cancelled. Reply here with a question, HELP for assistance, or STOP to end texts.`,
    ], privacyPolicyUrl: urls.privacy, termsAndConditionsUrl: urls.terms,
    optInMessage: `${name}: your texting block is removed. Appointment updates need a separate YES after our appointment-text question. HELP for help, STOP/ALTO/PARAR to end. Message and data rates may apply.`,
    optOutMessage: `${name}: you will receive no more service texts. START or EMPEZAR restores a previous opt-out.`,
    helpMessage: `${name}: help with service texts at ${help}. Reply STOP, ALTO or PARAR to end texts. Message and data rates may apply.`,
  };
  return { ...program, digest: hash(JSON.stringify(program)) };
}
