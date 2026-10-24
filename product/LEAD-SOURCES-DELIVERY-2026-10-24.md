# Lead sources: from a paid inquiry to a useful conversation

Steve explicitly reopened this part of the offer on October 24: lead-platform communication belongs in the customer setup and workspace. The existing website, phone, texting and Calendar choices do not cover that customer job. Calendar remains the next provider milestone; this requested lead-source work proceeds alongside it. This brief does not authorize a release, vendor application, account connection or message.

## The customer job

An owner already paying for Thumbtack or Angi should connect the appropriate business once, see new inquiries in the existing Inbox with their original context, and know who is replying and where that reply will appear. The same saved services, area, hours and handoff rules should govern the conversation. They should not need Steve to edit a private record or copy inquiries into another queue.

Connect, receive and reply are separate observable results. A saved preference is not a verified account connection. An accepted webhook is not proof that a customer received a reply.

## What the primary sources establish

| Source | Supported path | Important boundary |
|---|---|---|
| Thumbtack | Provisioned partner OAuth, authorized business selection, business lead/message webhooks, and native thread history/replies. | Platform client access and granted scopes are prerequisites. The ordinary pro webhook UI's authentication and complete event envelope are not yet independently verified here. |
| Angi | A dedicated endpoint and key receive the documented lead JSON. An unlisted CRM is configured by Angi's integration team using the pro's account details. | This verifies inbound leads, not an Angi conversation-reply API. Do not present an imported phone number as permission to send platform texts. |

Thumbtack documents `GET` and `POST /api/v4/negotiations/{negotiationID}/messages`, with a Bearer token and a text body for sends. Its business API supports `NegotiationCreatedV4` and `MessageCreatedV4` subscriptions with Basic authentication. Client credentials and scopes are provisioned; the owner grants access through OAuth. [Messages](https://developers.thumbtack.com/docs/pro-integrations/messages), [business webhooks](https://developers.thumbtack.com/docs/pro-integrations/businesses), [authentication](https://developers.thumbtack.com/docs/getting-started/authentication), [pro testing](https://developers.thumbtack.com/docs/pro-integrations/testing).

Angi identifies leads with `leadOid` and requests with `srOid`. It sends a configured `x-api-key`, expects HTTP 200 and JSON `status: success`, and documents three retries at 15-minute intervals. For an unlisted CRM, the pro supplies their Angi ID, email, endpoint/key and format confirmation to Angi. [Lead contract](https://intercom.help/angi/en/articles/15304819-angi-lead-integration-api), [account setup](https://intercom.help/angi/en/articles/10288125-setting-up-your-crm-integration-with-angi).

The public Thumbtack documentation's direct pages returned a robot check; indexed primary documentation supplied the findings above. No challenge was bypassed. Exact endpoint scopes and the complete incoming event envelope still require verification before a live connector claim. [Request-access form](https://developers.thumbtack.com/request-access) establishes a provider application path, not existing Machines & Cloud approval.

## The experience to build and accept

1. **Find the service.** Connections includes a clearly named Lead sources section. The owner can recognize Thumbtack and Angi without looking in admin settings. It explains the result in ordinary language and asks only for the account details needed for that source.
2. **Complete the real connection.** Where partner OAuth is configured, the owner authorizes the vendor and selects their business; the platform prepares and verifies its subscription. Where a vendor team must configure intake, the platform prepares the exact connection information and shows that it is waiting for the vendor. No cosmetic Connect button reports success without the corresponding provider result.
3. **See an actual inquiry.** The existing Inbox shows source, business, customer, requested work, location, original time and thread/lead reference. Duplicates or retried deliveries update one retained current-workspace request. Missing optional contact fields do not erase useful project context.
4. **Take the correct next action.** A Thumbtack native conversation uses its original thread when actual reply access exists. The owner sees message history, a retained reply draft and truthful sending/accepted/uncertain outcomes. An Angi inquiry offers the supported contact path. A vendor-app handoff is explicitly a handoff, with no claim that opening the app sent a reply.
5. **Keep control.** The owner can take over a conversation and see who is expected to answer next. No AI sends or cross-channel texts occur merely because a lead contains a number. Revoking a source blocks new receipt/replies for that connection and replacement workspace; it preserves existing request history appropriately.
6. **Recover visibly.** Invalid details, slow responses, lost acknowledgments, duplicate events, revoked access and failed replies have a useful next step. A lost reply result is reconciled before another send. Saved configuration, receipt verification and message delivery retain distinct status labels.

Independent QA must exercise the actual handlers and inspect retained records for account isolation, durable identity, replay and uncertainty. Replacement PO/UI/UX must follow the ordinary desktop and mobile journey from Connections to an inquiry and its reply/recovery. A local fixture acceptance is recorded separately from real vendor setup and message delivery.

## The current bounded implementation

The first implementation supports retained lead intake and **owner-reviewed replies**: native Thumbtack replies after authorization, and an explicit Angi contact handoff with a saved draft. It does not establish autonomous AI conversation on either source. AI can only be described as handling those conversations after a separate implementation and representative quality/recovery proof against the same business rules, ownership and source identity. A successful owner reply does not close that broader promise.

The preliminary PO Angi walkthrough exercised the actual local account/client/Angi handlers at 390 and 1440 pixels: prepare connection, receive the same inquiry twice into one Inbox request, inspect full job context, save a reply draft and copy it for the original platform. It used synthetic identity, memory storage and no physical network. The initial hidden-context failure was preserved, corrected by Engineering, and re-observed. The final review also followed Thumbtack authorization, business selection, native replies and uncertain-send recovery on the actual local handlers with a synthetic provider. Those observations establish a useful local owner workflow, not vendor account setup or actual message delivery.

## Competitor learning

LeadTruffle's own integration page distinguishes native Thumbtack conversation replies from Angi lead intake followed by a configured contact workflow. Its Thumbtack walkthrough places authorization, conversation history and owner takeover in one workflow. Those are useful interaction references, not evidence of our provider access or performance. [Integration overview](https://www.leadtruffle.co/integrations/), [Thumbtack walkthrough](https://www.leadtruffle.co/blog/leadtruffle-thumbtack-integration-ai-auto-responder/).

The replacement PO/UI/UX accepts the bounded local owner-reviewed integration slice in [the final acceptance record](LEAD-SOURCES-PO-ACCEPTANCE-2026-10-24.json). Five ordinary customer jobs passed; a separate final pass observed three responsive dialog layouts and two configured/unconfigured copy states. The [source bridge](../scratchpad/lead-sources-po-final-source-bridge.json) preserves 14 primary inputs and exactly reverses the only three later literal/style changes to the accepted hashes. These results do not establish autonomous AI conversation, publication or actual vendor service. Thumbtack partner access and live messages, Angi-side setup and actual leads, and the broader automated-conversation promise remain explicitly open.
