# Thumbtack partner-access application draft

This draft was prepared before submission. Steve subsequently submitted the application himself; Root recorded the observed successful form result in `scratchpad/launch-thumbtack-application-submission-20261024.json`. Partner credentials and approval remain pending. This PO task did not submit the application, accept an agreement, send outreach or read provider credentials. The prepared values below remain as the review record.

The current public application is [Request access to the Thumbtack Partner Platform](https://developers.thumbtack.com/request-access). The fields below come from its indexed primary page. A direct page read returned a robot check; no challenge was bypassed. [Thumbtack's authentication guide](https://developers.thumbtack.com/docs/getting-started/authentication) says the provider issues the client ID, secret and permitted scopes. Missing program access is separate from whether our integration code is implemented.

| Field | Prepared value |
|---|---|
| Contact first name | Steve |
| Contact last name | Ngoumnai |
| Contact job title | Founder / Software Engineer |
| Contact email | ngoumnaisteve@gmail.com |
| Contact phone | +1 661-495-6642 |
| Company name | Machines And Cloud LLC |
| Company website | https://machinesandcloud.com/ |
| Customers served monthly / MAUs | Approximately 100 customers per month, supplied by Steve. Select the matching actual form range; do not count synthetic test workspaces as real customers. |
| Years implementing OAuth APIs | Approximately 8 years, supplied by Steve. Select the matching actual form range. |
| Environments | Production and Local are in current use. Request staging access for provider proof without describing it as an existing verified environment. |
| Client URI | https://machinesandcloud.com/ |
| Redirect URI | https://machinesandcloud.com/api/thumbtack/connect |
| Technical contact | ngoumnaisteve@gmail.com |
| Logo URI | https://machinesandcloud.com/assets/logo-dark.png |
| Privacy policy URI | https://machinesandcloud.com/privacy-policy.html |
| Terms of service URI | https://machinesandcloud.com/terms-of-service.html |
| API Terms of Use agreement | Leave unchecked for Steve to review and accept himself |

The logo and policy paths are prepared from the current application source. Their public responses should be checked as part of Root's final application preparation; this document is not a hosted verification receipt.

## Intended API use

Machines & Cloud is building an AI front desk for home-service businesses. A business owner authorizes their own Thumbtack account, chooses the business to connect and receives new lead conversations in their existing customer workspace. We intend to receive lead and message notifications, retrieve the original project and conversation context, and send replies in the same Thumbtack conversation.

The owner can opt into automatic AI replies using their saved services, coverage area, hours, fees and handoff instructions. They can pause automation, take over an individual conversation and review its retained messages and reply outcomes. The integration keeps each business and conversation separate and retains uncertain sends for reconciliation rather than repeating a message blindly. We do not treat an imported telephone number as permission for a separate texting campaign.

We request a supply-side Pro integration for authorized business discovery, lead details, message history and sending, business-webhook creation/read/update, and refreshable owner access. Please confirm the exact scopes, approved client authentication method, staging access and any requirements for AI-generated replies and disclosure.

## Technical confirmations to request

- Confirm the required scopes for business discovery, negotiation reads, message reads/writes and business webhook management; the app will use only the scopes actually provisioned.
- Confirm the complete `NegotiationCreatedV4` and `MessageCreatedV4` event envelopes, Basic authentication delivery, retries and acknowledgement expectations.
- Confirm the native message-send response and any provider idempotency or reconciliation support.
- Confirm message-history ordering, how to retrieve the newest conversation boundary, supported pagination and the canonical message identity in `MessageCreatedV4`. The published messages example shows only `pagination.limit`; it does not establish that a fetched page contains the newest message. Actual unattended replies need this boundary verified before activation.
- Confirm staging credentials and the procedure for testing a real authorized business before production activation.

These are application questions, not a claim that the provider lacks those capabilities. [Pro messages](https://developers.thumbtack.com/docs/pro-integrations/messages), [business webhook management](https://developers.thumbtack.com/docs/pro-integrations/businesses), and [Pro testing](https://developers.thumbtack.com/docs/pro-integrations/testing) establish the published integration path.

## Angi contact automation assessment

The reviewed primary [API collection](https://intercom.help/angi/en/collections/12900573-api-integrations), [lead contract](https://intercom.help/angi/en/articles/15304819-angi-lead-integration-api), and [CRM setup guide](https://intercom.help/angi/en/articles/10288125-setting-up-your-crm-integration-with-angi) establish inbound lead delivery. They do not establish a native Angi conversation-send API. This review does not prove that no private partner messaging API exists.

A useful automatic contact workflow must name the channel the owner chooses. Eligible texting requires the shop's actual sender/registration and recipient permission for that program; Angi's supplied contact/compliance fields remain evidence to evaluate, not an automatic permission grant. Email would require a working identified sender, retained outbound and inbound replies, withdrawal handling and customer/source binding. Until that complete channel exists, the current Angi intake, project context and explicit owner contact path remain useful without being described as autonomous Angi messaging. Any provider capability enquiry or account connection requires Root's separately authorized action.

The ordering question was rechecked against the current indexed [Pro messages guide](https://developers.thumbtack.com/docs/pro-integrations/messages). It documents history and real-time webhook delivery, but this review found no explicit message ordering or latest-page guarantee. A direct open returned a robot check. This is an unresolved contract detail to confirm with the provider, rather than a claim that newest-message retrieval is unsupported.
