# One-time account setup for Machines & Cloud (instructions for a browser agent)

You are setting up the accounts that power the Machines & Cloud AI front desk (machinesandcloud.com). Work through the tasks in order. Each task says where to go, what to enter, and what to record.

## Rules

- **Stop and hand control to Steve** whenever a page asks for a password, a two-factor code, a payment card, an identity check, or a legal attestation ("I certify that this information is accurate"). Wait for him to finish, then continue.
- **Never post secrets anywhere** except the two places this document names: the "Values collected" list you return to Steve at the end, and Netlify's environment variables (Task 9).
- If a page differs from what is described here, follow the page's own wording toward the same result, and note the difference in your final report.
- Do not change any setting this document does not mention. Do not delete anything. Do not buy anything except the one phone number in Task 1.4.
- Keep a running "Values collected" list with the exact names below. Return it to Steve at the end.

## Business details (Steve fills these in before you start)

| Field | Value |
|---|---|
| Legal business name (exactly as on the IRS EIN letter) | Machines And Cloud LLC |
| EIN | 92-1473514 |
| Business type (LLC, corporation, sole proprietor, partnership) | LLC (Texas Limited Liability Company) |
| Business address (as registered) | 5718 Westheimer Rd, Suite 1000, Houston, TX 77057 |
| Website | https://www.machinesandcloud.com |
| Contact name | Steve Ngoumnai |
| Provider contact email (temporary until the business inbox is set up) | ngoumnaisteve@gmail.com |
| Public support email | support@machinesandcloud.com |
| Contact phone (Steve's cell) | +16614956642 |
| Personal email for usage alerts | ngoumnaisteve@gmail.com |
| Industry / vertical | Technology (software for home service businesses) |

**Temporary provider email override:** Until the business inbox is set up, use ngoumnaisteve@gmail.com for provider account signup and sign-in, contact and verification emails, and notification recipients throughout this script, even where a step specifies support@machinesandcloud.com. Keep public policy and customer-facing campaign wording exactly as written, including support@machinesandcloud.com. Keep `FROM_EMAIL` and the instructions not to change Netlify's `ADMIN_KEY` or `STEVE_EMAIL` exactly as written.

---

## Task 1. Twilio (texting and phone numbers)

Site: https://console.twilio.com

**1.1 Account.** Sign in or create an account for support@machinesandcloud.com. Upgrade from trial to a paid account (STOP for Steve: payment). Record:
- `TWILIO_ACCOUNT_SID` (starts with AC): Account, API keys and tokens, "Account SID".
- `TWILIO_AUTH_TOKEN` (32 characters): same page, "Auth token", click to reveal.

**1.2 Primary Customer Profile (Trust Hub).** Go to Trust Hub, Customer Profiles, and create a **Primary** Customer Profile. When asked for the business type or role, choose **"ISV Reseller or Partner"** (Machines & Cloud registers texting on behalf of other businesses). Use the business details above. Add Steve as the authorized representative. Submit (STOP for Steve: attestation). Record:
- `TWILIO_PRIMARY_PROFILE_SID` (starts with BU): shown on the profile page. Approval can take a few days; record the SID even while it is pending.

**1.3 Note your Houston area code options.** Area codes 713, 281, 832, or 346 are all Houston.

**1.4 Buy one phone number.** Phone Numbers, Manage, Buy a number. Country US, search by area code 713 (else 281, 832, 346), capabilities Voice and SMS. Buy one local number (about $1.15 a month). Record:
- `MC_TWILIO_NUMBER` in E.164 form, for example +17135550123.

On that number's configuration page set:
- A call comes in: Webhook, `https://machinesandcloud.com/api/voice`, HTTP POST.
- A message comes in: Webhook, `https://machinesandcloud.com/api/platform-sms`, HTTP POST, only after that platform handler is published. Keep `MC_PLATFORM_SMS_ENABLED=false` until the matched carrier approval and handler acceptance pass. Do not use the legacy shared-shop `/api/sms` route for this platform number.
(Save. You will add fallback URLs in Task 1.7.)

**1.5 Messaging Service.** Messaging, Services, Create Messaging Service.
- Name: `Machines & Cloud front desk`.
- Use case: "Notify my users" or "Mixed".
- Sender pool: add the number from 1.4.
- Integration: "Send a webhook", incoming message webhook `https://machinesandcloud.com/api/platform-sms`, POST, after that handler is published. Keep the platform reply gate off while awaiting approval; do not restore the legacy shared-shop route.
- **Opt-Out Management** (in the service's settings, sometimes under "Advanced Opt-Out"): keep the default STOP keywords and add the custom opt-out keywords **ALTO** and **PARAR**, and the custom opt-in keyword **EMPEZAR**.

Record:
- `MC_MESSAGING_SERVICE_SID` (starts with MG).

**1.6 Register the Machines & Cloud Customer Care campaign (A2P 10DLC).** The owner approved this program on October 22, 2026. Use the paid **Zari AI** account, the existing approved **Machines And Cloud LLC** Standard brand, the existing platform Messaging Service and the existing **+13464853328** number. Keep the Primary Customer Profile's **ISV Reseller or Partner** role. Do not create a duplicate brand or buy another number. If the existing brand is absent or does not identify Machines And Cloud LLC, stop and report the discrepancy rather than filing another business identity.

**October22 current handoff:** existing campaign `CMe638260fd3afd71954a8bbd3a9fd52d3` remains rejected (Console confirms30893 on sample1 and30909 on message flow). Corrected public evidence/receiver are published as `05e8c5c`; the existing service HELP was saved and confirmed after reload without changing STOP/START or keywords. The table below has been entered as nine browser-only **unsaved** fields; acknowledgment remains unchecked and Update disabled. Do not resubmit yet: clarify whether the old displayed HELP snapshot is used in vetting and how it refreshes, plus whether custom HELP requires a phone/email. That latter30890 concern was not in the rejection. [Support request](CAMPAIGN-CORRECTION-SUPPORT-DRAFT.md) was separately approved and submitted as [ticket30031927](https://help.twilio.com/tickets/30031927), **New**, P3, at4:22p.m.Houston; [receipt](../scratchpad/campaign-correction-support-submission.json). No human response has been received. No campaign deletion/recreation, final submission, attestation or fee action is authorized. [Receipt](../scratchpad/campaign-correction-publication-result.json) records the completed one-build release and closed25/25 read phase. Earlier401/in-review entries are historical; account/access cause remains unresolved.


**Historical completion note, October 22, 2026: originally filed by Steve. Do not create a duplicate campaign.** [Readback](../scratchpad/platform-campaign-filed-readback.json) records brand `BNe97ca7cce6642beb6450d6f5eef56d15`, service `MG7643ab5d7b0bf42b24a2b476ce8e02eb`, Console campaign `CMe638260fd3afd71954a8bbd3a9fd52d3` **In review** and API compliance resource `QE2c6890da8086d771620e9b13fadeba0b` **IN_PROGRESS**, created `2026-10-22T16:28:57Z` (11:28:57 a.m. Houston). The read returned200 with matching bindings, no errors and external campaign ID null. The exact policy/receiver batch `b9f4578` is published, both incoming company SMS URLs are readback verified at `/api/platform-sms` POST, and all seven execution flags remain off/unset. The fields below now contain the corrected local revision, while this note retains the historical original filing. Do not repeat completed account setup or infer approval/activation. These are historical **Notes for DECISIONS.md**; carrier approval and actual delivery/STOP acceptance remain open.

This campaign is only for Machines & Cloud's own product questions, onboarding guidance and account-support directions. A person must first text the platform number. It does not carry messages for shops or their homeowners, recurring notifications, marketing or automatic missed-call texts. Calls, emails, signup, booking and phone fields do not give SMS permission. Each supported shop registers its own business, brand, campaign and number; the former shared-homeowner bridge is retired. An existing primary ISV profile does not authorize combining customer brands into this platform campaign.

The machine-readable copy source is [PLATFORM-SMS-CAMPAIGN.md](PLATFORM-SMS-CAMPAIGN.md). Before submission, verify the public terms and privacy URLs are accessible without signing in and show the same program and number. Local files are not public evidence. The public page must still say **awaiting carrier approval** while the filing is pending. If those disclosures have not been published, keep the revision locally and hand control back without submitting. Console Update resubmits; it is not a separate draft-save action.

Go to Messaging, Regulatory Compliance (or "A2P 10DLC"), open the existing rejected campaign on the platform Messaging Service and inspect Edit Campaign. Do not create another campaign. The intended consent method is conversational inbound SMS; use only a matching option actually available in Console. If the form only supports recurring keyword enrollment, stop for Twilio clarification rather than invent consent. Enter the corrected values below only after their public evidence and receiver are published and verified:

| Field | Value |
|---|---|
| Use case | Customer Care |
| Campaign description | Machines And Cloud LLC (Machines & Cloud) provides customer-care replies to people who first text +13464853328 about their own use of its AI front desk software, workspace setup or account access. Each reply answers the person's incoming question or provides the requested support link. Plan information is returned only when the person asks about pricing. No recurring, proactive, promotional, missed-call, shop-service or homeowner messages are sent. |
| Primary opt-in method | Customer-initiated conversational SMS |
| Opt-in proof | Public invitation and full example exchange: https://www.machinesandcloud.com/sms-terms.html#platform-sms. Machines And Cloud LLC (Machines & Cloud), +13464853328. A person texts: I cannot sign in. Our reply gives secure sign-in steps only. The incoming question is the only consent path; no signup or keyword subscription. The page shows frequency, rates, STOP/HELP and both policy links. Text replies remain disabled pending carrier approval. |
| How do end users consent (message flow) | Customer-initiated conversational SMS is the sole consent path, not keyword enrollment. The public invitation, complete disclosures and example exchange are at https://www.machinesandcloud.com/sms-terms.html#platform-sms. After reading them, the person sends their own account/setup question to +13464853328, for example 'I cannot sign in' or 'Help me set up'. We reply only to that request with secure sign-in or workspace setup guidance; plan details are returned only if the person asks about pricing. HELP, INFO or AYUDA returns support links, not enrollment. We retain the incoming message ID, sender, content and timestamp as evidence of consent for that exchange only. No website form/checkbox, phone call, email, verbal permission, signup, booking, entered phone number or purchased list provides SMS permission. No recurring or proactive messages are sent. Message frequency varies with the questions the person sends. Message and data rates may apply. STOP, ALTO, PARAR and standard stop keywords block replies; one stop confirmation may be sent. START, UNSTOP or EMPEZAR removes a prior block only; it does not subscribe anyone or authorize recurring messages. The opt-in/restart fields below describe this unblocking acknowledgment, not a subscription flow. Terms: https://www.machinesandcloud.com/sms-terms.html. Privacy: https://www.machinesandcloud.com/privacy-policy.html#sms. |
| Privacy policy URL | https://www.machinesandcloud.com/privacy-policy.html#sms |
| Terms and conditions URL | https://www.machinesandcloud.com/sms-terms.html |
| Sample message 1 | Machines & Cloud: sign in securely at https://machinesandcloud.com/desk. Request a fresh email link there. Never text a password or sign-in code. Reply STOP to stop texts. |
| Sample message 2 | Machines & Cloud: continue your workspace setup at https://machinesandcloud.com/onboard using your setup email. Reply STOP to stop texts. |
| Sample message 3 | Machines & Cloud: account help at https://machinesandcloud.com/desk. Setup guidance at https://machinesandcloud.com/onboard. Reply STOP, ALTO or PARAR to stop texts. |
| Sample message 4 | Machines & Cloud: you asked about plan pricing. Current plan details are at https://machinesandcloud.com/#plans. Reply STOP to stop texts. |
| Sample message 5 | Machines & Cloud: this line provides account and setup guidance. For secure account access, visit https://machinesandcloud.com/desk. Reply STOP to stop texts. |
| Opt-in message | Machines & Cloud: your texting block is removed. We only reply to messages you send; no recurring texts. Reply HELP for help or STOP to stop. |
| Opt-out message | Machines & Cloud: texts stopped. Reply START or EMPEZAR to remove the block. |
| Help message | Machines & Cloud: account help at https://machinesandcloud.com/desk. Setup guidance at https://machinesandcloud.com/onboard. Reply STOP, ALTO or PARAR to stop texts. |
| Opt-out keywords | STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT, ALTO, PARAR |
| Opt-in keywords | START, UNSTOP, EMPEZAR |
| Help keywords | HELP, INFO, AYUDA |
| Embedded links | Yes |
| Embedded phone numbers | No |
| Age-gated content | No |
| Direct lending | No |
| Number pooling | No |

Keep all standard Advanced Opt-Out keywords and add ALTO/PARAR, EMPEZAR and AYUDA. Set its STOP, START and HELP responses to the table's exact messages. START is a restart acknowledgment only. If Twilio already replies and sends `OptOutType`, the application must not send a second keyword acknowledgment.

STOP for Steve before any fee acknowledgment, legal attestation or final submission. Do not choose a fee or certify the filing for him. Once he submits, record the existing brand SID (BN...), the actual campaign SID (CM... or QE...), the submission date and returned review status under "Notes for DECISIONS.md". Do not treat draft creation or submission as approval. Do not enable the platform reply handler, buy numbers or change any managed shop execution gate as part of this filing.


**1.7 Two TwiML Bins (what callers and texters get if our site is down).** Develop (or Explore Products), TwiML Bins, Create new.

Bin 1. Friendly name `Front desk voice fallback`. TwiML, exactly:
```
<Response>{{#cell}}<Dial timeout="25">{{cell}}</Dial>{{/cell}}<Say voice="Polly.Joanna">We are having trouble connecting right now. Please call back in a few minutes.</Say></Response>
```
Save and record its URL (https://handler.twilio.com/twiml/EH...) as `VOICE_FALLBACK_TWIML_URL`.

Bin 2. Friendly name `Front desk SMS fallback`. TwiML, exactly:
```
<Response><Message>We got your text and will reply shortly.</Message></Response>
```
Save and record its URL as `SMS_FALLBACK_TWIML_URL`.

Then on the phone number from 1.4, set "Primary handler fails" for calls to Bin 1's URL and for messages to Bin 2's URL (HTTP POST). Save.

**1.8 Error alerts.** Monitor, Alerts (or Debugger settings):
- Webhook URL: `https://machinesandcloud.com/api/twilio-alert`.
- Email alerts: on, to support@machinesandcloud.com, for errors.

---

## Task 2. Vapi (the voice that answers calls)

Site: https://dashboard.vapi.ai

**2.1** Sign in or create an account for support@machinesandcloud.com. Add a payment method if asked (STOP for Steve).

**2.2** Organization settings (or Settings, API Keys): create a **private** API key named `machines-and-cloud`. Record `VAPI_API_KEY`.

**2.3** Organization settings, Server URL: set `https://machinesandcloud.com/api/vapi`. Server URL Secret: generate a random string of 32 or more letters and digits (any password generator), enter it, save. Record the same string as `VAPI_WEBHOOK_SECRET`.

**2.4** Do not create any assistant or import any phone number. Our system does that itself for each shop.

---

## Task 3. Resend (email)

Site: https://resend.com

**3.1** Sign in or create an account for support@machinesandcloud.com.

**3.2** API Keys, Create API key, name `machines-and-cloud`, permission "Sending access" or "Full access". Record `RESEND_API_KEY` (starts with re_).

**3.3** Domains, Add domain: `machinesandcloud.com`, region US East. Resend shows DNS records (MX, TXT for SPF, TXT for DKIM, possibly a DMARC TXT). Record every record exactly (type, name/host, value, priority) under "DNS records for Resend".

**3.4** Add those records in Netlify DNS: https://app.netlify.com, team "docteureminem's team", Domains, `machinesandcloud.com`, DNS settings, Add new record, one per Resend record, copying type, name, value, and priority exactly. Do not change or delete any existing record.

**3.5** Back in Resend, Domains, `machinesandcloud.com`, press Verify. It may take minutes to hours; record the status you see.

---

## Task 4. Google Cloud (owners connect their calendar)

Site: https://console.cloud.google.com

**4.1** Sign in with the Google account Steve chooses for the business (STOP for Steve if a sign-in is needed). Create a project named `machines-and-cloud`.

**4.2** APIs and services, Library: enable **Google Calendar API**.

**4.3** APIs and services, OAuth consent screen:
- User type: External.
- App name: `Machines & Cloud front desk`. Support email: support@machinesandcloud.com.
- App home page: https://www.machinesandcloud.com. Privacy policy: https://www.machinesandcloud.com/privacy-policy.html. Terms: https://www.machinesandcloud.com/terms-of-service.html.
- Authorized domain: `machinesandcloud.com`.
- Scopes: add `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/calendar.readonly`.
- Save, then **Publishing status: Publish app** (to Production). This matters: in Testing mode, owners' calendar access expires after 7 days. If Google asks for verification because of the calendar scopes, start it and record that it is pending.

**4.4** APIs and services, Credentials, Create credentials, OAuth client ID:
- Application type: Web application. Name: `machines-and-cloud web`.
- Authorized redirect URI: `https://machinesandcloud.com/api/google/callback`.
- Create. Record `GOOGLE_CLIENT_ID` (ends with .apps.googleusercontent.com) and `GOOGLE_CLIENT_SECRET` (starts with GOCSPX-).

---

## Task 5. Anthropic (the AI model)

Site: https://console.anthropic.com

**5.1** Sign in (STOP for Steve if needed). API Keys, Create key, name `machines-and-cloud`. Record `ANTHROPIC_API_KEY` (starts with sk-ant-).

---

## Task 6. Netlify account safety

Site: https://app.netlify.com, team "docteureminem's team".

**6.1** Keep **auto recharge disabled**. Steve explicitly chose this on 2026-10-21 after reviewing the Pro plan's fixed $10 / 1,500-credit recharge. Do not enable it without a new instruction from Steve; if he changes this decision, STOP for him to confirm the amount.

**6.2** Same area, usage notifications: turn on emails at 50, 75, and 100 percent, to support@machinesandcloud.com and ngoumnaisteve@gmail.com.

---

## Task 7. Uptime monitor

Site: https://uptimerobot.com (free plan).

**7.1** Create an account for support@machinesandcloud.com. Add a new monitor: type HTTP(s), friendly name `Machines & Cloud health`, URL `https://machinesandcloud.com/api/health`, interval **10 minutes**. Alert contact: support@machinesandcloud.com (and Steve's phone by SMS if offered free). Save.

---

## Task 8. Steve's own values

Record:
- `STEVE_PHONE`: `+16614956642` (Steve's cell in E.164 form).

---

## Task 9. Put every value into Netlify

Site: https://app.netlify.com, team "docteureminem's team", site **machines-and-cloud**, Site configuration, Environment variables.

For each variable below, Add a variable, key exactly as written, the value you recorded, scopes **Functions** (and Builds if offered), same value for all deploy contexts. If a variable already exists, edit it; do not create a duplicate. Do **not** touch `ADMIN_KEY` or `STEVE_EMAIL`, which are already set.

```
STEVE_PHONE
ANTHROPIC_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PRIMARY_PROFILE_SID
MC_TWILIO_NUMBER
MC_MESSAGING_SERVICE_SID
VOICE_FALLBACK_TWIML_URL
SMS_FALLBACK_TWIML_URL
VAPI_API_KEY
VAPI_WEBHOOK_SECRET
RESEND_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
FROM_EMAIL = Machines & Cloud <desk@machinesandcloud.com>
VAPI_MODEL = claude-sonnet-5
```

Do **not** press "Trigger deploy" or "Deploy site". Environment variables apply on the next deploy, which the engineer will run once.

---

## What to return to Steve

1. **Values collected**: every variable name above with its value, in `NAME=value` lines, so Steve can paste them into the `.env` file in the repo root.
2. **Notes for DECISIONS.md**: the brand SID, the campaign SID, and the date the campaign was submitted; the Primary Customer Profile status; the Resend domain status; whether Google publishing needs verification.
3. **DNS records for Resend** that you added in Netlify.
4. **Anything that differed** from these instructions, or anything you could not finish and why.

After that, Steve runs `node scripts/setup-check.mjs` from the repo, which verifies every value against the providers.
