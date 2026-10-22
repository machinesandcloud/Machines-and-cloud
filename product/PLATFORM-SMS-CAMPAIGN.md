# Machines & Cloud Customer Care

Status: **awaiting carrier approval**. This is the Machines And Cloud LLC (Machines & Cloud) program for its own product inquiries, onboarding guidance and account-support directions. It is not a shared sender for shops or their homeowners. The handler is off by default; filing a campaign does not enable it.

The only consent path is a person sending a text to **+13464853328** after seeing the public disclosure at <https://www.machinesandcloud.com/sms-terms.html#platform-sms>. Direct answers concern that person's question. Calling, emailing, creating an account, booking a visit or entering a phone number does not opt anyone into SMS. No recurring, proactive, marketing, missed-call, homeowner or shop-service messages are part of this campaign. START, UNSTOP and EMPEZAR remove an existing block; they do not enroll anyone in recurring messages.

The public support mailbox remains support@machinesandcloud.com. Provider verification uses the separately approved temporary contact email; it is not substituted into the campaign's public copy. Do not assert that the display name is a separately registered DBA.

## Exact campaign fields

The following JSON is the copy source for Task 1.6 and the Console draft. `optInMessage` is the required restart acknowledgment, not a recurring subscription offer. Do not invent a keyword subscription or a website SMS checkbox. The three samples are direct responses to recipient questions, not scheduled sends.

```json
{
  "programName": "Machines & Cloud Customer Care",
  "legalBusinessName": "Machines And Cloud LLC",
  "phoneNumber": "+13464853328",
  "status": "awaiting_carrier_approval",
  "useCase": "Customer Care",
  "optInMethod": "Via text (keyword campaign)",
  "optInProof": "Public CTA: https://www.machinesandcloud.com/sms-terms.html#platform-sms. It invites HELP or a question to +13464853328 for direct M&C support, not recurring enrollment. User: HELP. Reply: Machines & Cloud product help: https://machinesandcloud.com/#pilot. Sign in: https://machinesandcloud.com/desk. Reply STOP, ALTO or PARAR to stop texts. Calling or signup is not SMS consent.",
  "description": "Machines And Cloud LLC (Machines & Cloud) replies to people who text +13464853328 with questions about its own AI front desk software, onboarding or account access. Replies provide product information, setup guidance or links to secure account support. This campaign does not send on behalf of home-service shops or their homeowners. No recurring, proactive, promotional or missed-call texts are sent.",
  "messageFlow": "A person starts by texting HELP or their own question to +13464853328. The public invitation and disclosures are at https://www.machinesandcloud.com/sms-terms.html#platform-sms. Only direct replies about that person's Machines & Cloud product, onboarding or account-support question are permitted. The inbound message is retained as consent evidence for that exchange; it does not authorize recurring engagement. Calling, emailing, signup, booking or providing a phone number is not SMS consent. No website checkbox, purchased list or verbal opt-in is used. Message frequency varies with the messages the person sends. Message and data rates may apply. HELP or AYUDA provides help; STOP, ALTO or PARAR ends texts. START, UNSTOP or EMPEZAR only removes an earlier block and does not subscribe the person to recurring texts. Terms: https://www.machinesandcloud.com/sms-terms.html. Privacy: https://www.machinesandcloud.com/privacy-policy.html#sms.",
  "privacyPolicyUrl": "https://www.machinesandcloud.com/privacy-policy.html#sms",
  "termsAndConditionsUrl": "https://www.machinesandcloud.com/sms-terms.html",
  "messageSamples": [
    "Machines & Cloud: explore our AI front desk at https://machinesandcloud.com/#demo-wrap. Product and setup help: https://machinesandcloud.com/#pilot. Reply STOP to stop texts.",
    "Machines & Cloud: start your front desk setup at https://machinesandcloud.com/#pilot. Already started? https://machinesandcloud.com/desk. Reply STOP to stop texts.",
    "Machines & Cloud: sign in securely at https://machinesandcloud.com/desk. Request a fresh email link there. Never text a password or sign-in code. Reply STOP to stop texts."
  ],
  "optInMessage": "Machines & Cloud: your texting block is removed. We only reply to messages you send; no recurring texts. Reply HELP for help or STOP to stop.",
  "optOutMessage": "Machines & Cloud: texts stopped. Reply START or EMPEZAR to remove the block.",
  "helpMessage": "Machines & Cloud product help: https://machinesandcloud.com/#pilot. Sign in: https://machinesandcloud.com/desk. Reply STOP, ALTO or PARAR to stop texts.",
  "optOutKeywords": ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT", "ALTO", "PARAR"],
  "optInKeywords": ["START", "UNSTOP", "EMPEZAR"],
  "helpKeywords": ["HELP", "INFO", "AYUDA"],
  "hasEmbeddedLinks": true,
  "hasEmbeddedPhone": false,
  "ageGated": false,
  "directLending": false,
  "numberPooling": false
}
```

## Registration and activation boundary

Use the existing approved Machines And Cloud LLC brand on the paid Zari AI account. Retain the Primary Customer Profile's ISV Reseller or Partner role: Machines & Cloud still provides software to other businesses, while this particular campaign identifies only Machines & Cloud as the sender. Do not buy another number, create another platform brand or change account billing for this filing. Save the draft and hand the fee acknowledgment, legal attestation and final submission to the owner.

Before final submission, the public terms, number invitation and privacy disclosure must be deployed and accessible without signing in. A locally prepared file is not public evidence. After submission, record the actual campaign SID, submission time and status. Do not label the campaign approved before the carrier result. Keep the platform reply gate off until the matched brand/campaign/sender and handler acceptance are verified.

Each supported US-EIN shop has its own customer profile, brand, campaign, Messaging Service and customer number. Its public policy is `/policy?c=SHOP` (terms adds `&page=terms`). A homeowner starts a direct conversation by texting that shop's number. Ongoing appointment confirmations, reminders and cancellation updates, including future visits with that business, require a separate written YES or SÍ after the named shop clearly asks for that ongoing permission in the conversation. The wording version is retained; an older agreement limited to one visit is not treated as ongoing permission. Merely calling, using website chat, giving a mobile number or booking does not satisfy that requirement. Reviews and marketing are outside the supported program. The platform campaign and number never bridge pending customer registrations. Unmarked legacy customers retain their distinct legacy contract; they do not inherit this new campaign or the v1 consent guarantees.

## Policy basis

Reviewed October 22, 2026: [Twilio Messaging Policy](https://www.twilio.com/en-us/legal/messaging-policy) distinguishes direct replies to an inbound message from permission for recurring engagement and requires consent tied to the sender and subject. [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out) documents the standard keywords and `OptOutType`; when Twilio already acknowledges a keyword, the application must avoid a second acknowledgment. [Campaign review guidance](https://www.twilio.com/docs/api/errors/30909) calls for a complete, publicly verifiable consent flow and matching sample messages. Carrier review and legal attestations remain the owner's responsibility.
