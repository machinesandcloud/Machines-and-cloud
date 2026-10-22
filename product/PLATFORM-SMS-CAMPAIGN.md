# Machines & Cloud Customer Care campaign

**Current handoff, October22:** the corrected public evidence and receiver are published as `05e8c5c` (one build). Fresh signed-in Console readback confirms rejection **30893 on sample1** and **30909 on message flow** for existing `CMe638260fd3afd71954a8bbd3a9fd52d3`. The revised existing-service HELP is saved and confirmed after reload; STOP/START and keyword sets are preserved. Nine corrected campaign fields are entered only in the browser, **unsaved**; accuracy/fee acknowledgment remains unchecked and Update disabled. No resubmission or approval occurred.

**Clarification before owner attestation:** the campaign still displays its old HELP snapshot despite the saved service change. Whether this is historical display data or used in vetting, and whether it refreshes, remains unknown. Separately clarify the custom HELP phone/email requirement;30890 was not in the rejection. [Support request](CAMPAIGN-CORRECTION-SUPPORT-DRAFT.md) was separately approved and submitted as [ticket30031927](https://help.twilio.com/tickets/30031927), **New**, P3, at4:22p.m.Houston; [receipt](../scratchpad/campaign-correction-support-submission.json). No human response has been received. Do not delete/recreate the campaign or promise snapshot synchronization. [Publication/provider receipt](../scratchpad/campaign-correction-publication-result.json) and [independent handoff](../scratchpad/campaign-correction-provider-independent-handoff.json) record the evidence and closed25/25 read phase. All gates and billing are unchanged.

Historical original filing: **owner-filed and in review at the captured readback; subsequently rejected as reported above**. Steve submitted the Machines And Cloud LLC (Machines & Cloud) Customer Care program on October 22, 2026. [Readback](../scratchpad/platform-campaign-filed-readback.json) shows Console `CMe638260fd3afd71954a8bbd3a9fd52d3` **In review** and matching service compliance resource `QE2c6890da8086d771620e9b13fadeba0b` **IN_PROGRESS**, created `2026-10-22T16:28:57Z` (11:28:57 a.m. Houston), with no errors and external campaign ID null. The company program answers its own product inquiries, onboarding questions and account-support requests; it is not a shared sender for shops or their homeowners.

The original policy/receiver release was `b9f4578155dd6672fdd89d9870affc92c0cba0fb`, READY deploy `6ada379c827174bc5b6c26fa`, published `2026-10-22T16:20:33.878Z`. Public disclosures and the handler are deployed; [readback](../scratchpad/platform-campaign-webhook-readback.json) confirms both existing company inbound SMS URLs use `https://machinesandcloud.com/api/platform-sms` POST with unrelated settings preserved. All seven execution flags remain off/unset. The closed hosted phase used22/25 authorized physical GETs, and final health records the later natural scheduler run at16:30:22.665Z, HTTP200/ok:true/no failing blocks. [Independent release disposition](../scratchpad/platform-campaign-hosted-independent-disposition.json) passes12/12. Filing and routing do not enable replies or establish actual delivery. Do not submit another campaign or reopen the closed test allowance.

The only consent path is a person sending a text to **+13464853328** after seeing the public disclosure at <https://www.machinesandcloud.com/sms-terms.html#platform-sms>. Direct answers concern that person's question. Calling, emailing, creating an account, booking a visit or entering a phone number does not opt anyone into SMS. No recurring, proactive, marketing, missed-call, homeowner or shop-service messages are part of this campaign. START, UNSTOP and EMPEZAR remove an existing block; they do not enroll anyone in recurring messages.

The public support mailbox remains support@machinesandcloud.com. Provider verification uses the separately approved temporary contact email; it is not substituted into the campaign's public copy. Do not assert that the display name is a separately registered DBA.

## Exact campaign fields

The JSON below is the corrected revision for the existing rejected campaign. Its nine editable text fields are prepared only in the open browser; the campaign itself has not been saved or resubmitted to Twilio. The service HELP was saved separately, with the unresolved snapshot/contact-format questions above. The five samples are actual local receiver replies to specific incoming questions, not scheduled sends. `optInMessage` and `optInKeywords` retain Twilio's field names for restart/unblocking; they do not invent recurring enrollment. The intended consent method is customer-initiated conversational SMS. Select a matching Console method only after inspecting the current form; if it forces recurring keyword enrollment, obtain Twilio guidance rather than certify a fictitious flow. Publish and verify the revised public evidence and receiver, and match the service HELP response, before final owner review.

```json
{
  "programName": "Machines & Cloud Customer Care",
  "legalBusinessName": "Machines And Cloud LLC",
  "phoneNumber": "+13464853328",
  "status": "rejected_revision_prepared",
  "useCase": "Customer Care",
  "optInMethod": "Customer-initiated conversational SMS",
  "optInProof": "Public invitation and full example exchange: https://www.machinesandcloud.com/sms-terms.html#platform-sms. Machines And Cloud LLC (Machines & Cloud), +13464853328. A person texts: I cannot sign in. Our reply gives secure sign-in steps only. The incoming question is the only consent path; no signup or keyword subscription. The page shows frequency, rates, STOP/HELP and both policy links. Text replies remain disabled pending carrier approval.",
  "description": "Machines And Cloud LLC (Machines & Cloud) provides customer-care replies to people who first text +13464853328 about their own use of its AI front desk software, workspace setup or account access. Each reply answers the person's incoming question or provides the requested support link. Plan information is returned only when the person asks about pricing. No recurring, proactive, promotional, missed-call, shop-service or homeowner messages are sent.",
  "messageFlow": "Customer-initiated conversational SMS is the sole consent path, not keyword enrollment. The public invitation, complete disclosures and example exchange are at https://www.machinesandcloud.com/sms-terms.html#platform-sms. After reading them, the person sends their own account/setup question to +13464853328, for example 'I cannot sign in' or 'Help me set up'. We reply only to that request with secure sign-in or workspace setup guidance; plan details are returned only if the person asks about pricing. HELP, INFO or AYUDA returns support links, not enrollment. We retain the incoming message ID, sender, content and timestamp as evidence of consent for that exchange only. No website form/checkbox, phone call, email, verbal permission, signup, booking, entered phone number or purchased list provides SMS permission. No recurring or proactive messages are sent. Message frequency varies with the questions the person sends. Message and data rates may apply. STOP, ALTO, PARAR and standard stop keywords block replies; one stop confirmation may be sent. START, UNSTOP or EMPEZAR removes a prior block only; it does not subscribe anyone or authorize recurring messages. The opt-in/restart fields below describe this unblocking acknowledgment, not a subscription flow. Terms: https://www.machinesandcloud.com/sms-terms.html. Privacy: https://www.machinesandcloud.com/privacy-policy.html#sms.",
  "privacyPolicyUrl": "https://www.machinesandcloud.com/privacy-policy.html#sms",
  "termsAndConditionsUrl": "https://www.machinesandcloud.com/sms-terms.html",
  "messageSamples": [
    "Machines & Cloud: sign in securely at https://machinesandcloud.com/desk. Request a fresh email link there. Never text a password or sign-in code. Reply STOP to stop texts.",
    "Machines & Cloud: continue your workspace setup at https://machinesandcloud.com/onboard using your setup email. Reply STOP to stop texts.",
    "Machines & Cloud: account help at https://machinesandcloud.com/desk. Setup guidance at https://machinesandcloud.com/onboard. Reply STOP, ALTO or PARAR to stop texts.",
    "Machines & Cloud: you asked about plan pricing. Current plan details are at https://machinesandcloud.com/#plans. Reply STOP to stop texts.",
    "Machines & Cloud: this line provides account and setup guidance. For secure account access, visit https://machinesandcloud.com/desk. Reply STOP to stop texts."
  ],
  "optInMessage": "Machines & Cloud: your texting block is removed. We only reply to messages you send; no recurring texts. Reply HELP for help or STOP to stop.",
  "optOutMessage": "Machines & Cloud: texts stopped. Reply START or EMPEZAR to remove the block.",
  "helpMessage": "Machines & Cloud: account help at https://machinesandcloud.com/desk. Setup guidance at https://machinesandcloud.com/onboard. Reply STOP, ALTO or PARAR to stop texts.",
  "optOutKeywords": [
    "STOP",
    "STOPALL",
    "UNSUBSCRIBE",
    "CANCEL",
    "END",
    "QUIT",
    "REVOKE",
    "OPTOUT",
    "ALTO",
    "PARAR"
  ],
  "optInKeywords": [
    "START",
    "UNSTOP",
    "EMPEZAR"
  ],
  "helpKeywords": [
    "HELP",
    "INFO",
    "AYUDA"
  ],
  "hasEmbeddedLinks": true,
  "hasEmbeddedPhone": false,
  "ageGated": false,
  "directLending": false,
  "numberPooling": false
}
```

## Registration and activation boundary

The filing uses the existing approved Machines And Cloud LLC brand on the paid Zari AI account. Retain the Primary Customer Profile's ISV Reseller or Partner role: Machines & Cloud still provides software to other businesses, while this campaign identifies only Machines & Cloud as the sender. The owner completed final submission; the historical draft and keyword receipts retain their earlier scope. Do not buy another number, create another platform brand, refile the campaign or change account billing. Any later fee acknowledgment or legal attestation remains the owner's action.

The public terms, number invitation and privacy disclosure were deployed and verified without signing in before final submission. The original IDs, filing time and historical review state are recorded above; a locally prepared file or initial consent check is not approval evidence. Keep the platform reply gate off until matched carrier approval and a separately authorized, bounded actual inbound/reply/STOP acceptance pass. There has been one owner submission and zero agent submissions; the agent sent no email, text or call and made no purchase or billing change during this publication/configuration phase.

Each supported US-EIN shop has its own customer profile, brand, campaign, Messaging Service and customer number. Its public policy is `/policy?c=SHOP` (terms adds `&page=terms`). A homeowner starts a direct conversation by texting that shop's number. Ongoing appointment confirmations, reminders and cancellation updates, including future visits with that business, require a separate written YES or SÍ after the named shop clearly asks for that ongoing permission in the conversation. The wording version is retained; an older agreement limited to one visit is not treated as ongoing permission. Merely calling, using website chat, giving a mobile number or booking does not satisfy that requirement. Reviews and marketing are outside the supported program. The platform campaign and number never bridge pending customer registrations. Unmarked legacy customers retain their distinct legacy contract; they do not inherit this new campaign or the v1 consent guarantees.

## Policy basis

Reviewed October 22, 2026: [Twilio Messaging Policy](https://www.twilio.com/en-us/legal/messaging-policy) distinguishes direct replies to an inbound message from permission for recurring engagement and requires consent tied to the sender and subject. [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out) documents the standard keywords and `OptOutType`; when Twilio already acknowledges a keyword, the application must avoid a second acknowledgment. [Campaign review guidance](https://www.twilio.com/docs/api/errors/30909) calls for a complete, publicly verifiable consent flow and matching sample messages. Carrier review and legal attestations remain the owner's responsibility.

## Corrected sample context

| Incoming recipient text | Sample index | Purpose |
|---|---|---|
| I cannot sign in | 1 | Secure account-access instructions; no credential is sent or requested by SMS. |
| Help me set up | 2 | Resume the recipient's own workspace setup. |
| HELP | 3 | Support links only; not a subscription or consent to future engagement. |
| How much does my plan cost? | 4 | Requested public plan information; no promotion or unsolicited comparison. |
| I need assistance | 5 | General account/setup guidance for an incoming request. |

The old label “Via text (keyword campaign)” conflicted with the actual conversational program. Earlier demo/plan invitations also made the Customer Care scope less clear. These are verified source inconsistencies and plausible contributors to rejection, not a claim that the carrier identified a particular field. The final form values and messaging-service HELP response still need current Console verification.
