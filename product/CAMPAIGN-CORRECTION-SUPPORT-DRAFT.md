# Twilio Support request — submitted

Submitted after Steve separately approved “Send the prepared support request”: [ticket30031927](https://help.twilio.com/tickets/30031927), **New**, P3 General, October22 at4:22p.m.Houston. [Confirmed submission receipt and exact payload](../scratchpad/campaign-correction-support-submission.json). One message to the required Help Center Assistant exposed the ticket form, then one support-ticket submission succeeded. No human answer has been received. No campaign update, resubmission, fee or activation followed. The filename preserves the earlier review link.

## Submitted request

**Subject:** Clarify displayed HELP snapshot before resubmitting existing Customer Care campaign

Hello Twilio Support,

Please clarify how the displayed HELP information is used on our existing Machines And Cloud LLC (Machines & Cloud) Customer Care campaign:

- Campaign: `CMe638260fd3afd71954a8bbd3a9fd52d3`
- Brand: `BNe97ca7cce6642beb6450d6f5eef56d15`
- Messaging Service: `MG7643ab5d7b0bf42b24a2b476ce8e02eb`
- Company texting number: `+13464853328`

Console confirms rejection **30893 for sample message 1** and **30909 for message flow**. This program provides direct answers to incoming questions about our own software setup, account access and requested plan information. It has no recurring enrollment, proactive or promotional messages, and sends nothing for customer shops or homeowners.

We published the corrected public invitation, disclosures and illustrative exchange at [Machines & Cloud Customer Care](https://www.machinesandcloud.com/sms-terms.html#platform-sms), with [privacy information](https://www.machinesandcloud.com/privacy-policy.html#sms). We also saved this Messaging Service Advanced Opt-Out HELP response and confirmed it survives a reload:

> Machines & Cloud: account help at https://machinesandcloud.com/desk. Setup guidance at https://machinesandcloud.com/onboard. Reply STOP, ALTO or PARAR to stop texts.

The existing HELP/STOP/START keyword lists and STOP/START response text were retained. However, after reloading the campaign details, its HELP snapshot still shows the original reply:

> Machines & Cloud product help: https://machinesandcloud.com/#pilot. Sign in: https://machinesandcloud.com/desk. Reply STOP, ALTO or PARAR to stop texts.

Edit Campaign exposes description, five samples, message flow, privacy URL and terms URL, but no HELP field. The nine corrected text fields are currently entered only in the browser, **unsaved**. The accuracy/fee acknowledgment is unchecked and Update is disabled. We understand Update resubmits the campaign, so the owner has not taken that step.

Please clarify:

1. Is the displayed campaign HELP snapshot historical metadata or authoritative information used in vetting, and does it need amendment? Does resubmission refresh it from the Messaging Service's saved Advanced Opt-Out configuration? How can we confirm which HELP response reviewers will receive?
2. If it does not refresh, what supported method can amend the existing campaign's HELP snapshot before owner review? Can Support correct it in place? The documented API update restrictions appear to exclude HELP changes.
3. Must our Advanced Opt-Out-managed HELP reply contain a support phone number or email, rather than support URLs alone, under the Subscriber Help guidance? Please confirm the required reply format and how its campaign snapshot should be aligned. Error30890 was not included in our rejection; this is a separate pre-submission clarification.

We also observed a Suspended label in One Console and a 401 from an exact campaign API read, while the legacy Admin interface still allowed Messaging Service editing. Please clarify the account/access state if it affects this correction. We have not established the cause of those observations.

We are requesting guidance before the owner's attestation and resubmission. This request does not authorize campaign deletion/recreation, a new campaign, fees, service activation or a submission on our behalf.

Thank you.

## Operator notes — not part of the support request

- Published commit `05e8c5c34656f3257af8a8d3d7e8523dcbd542b3` is the approved `e0a8503` tree with four company account-identifier redactions in three private evidence files; runtime and tests are identical. One Netlify build reached READY at **2026-10-22T21:03:09.358Z**. The captured-public-asset review passes **44/44**. Those checks establish the served public evidence within their recorded scope; they do not establish a delivered text or carrier acceptance.
- The service HELP change is saved and confirmed after reload. The campaign HELP snapshot is still the original text; its relevance to vetting is unknown. Do not describe all saved campaign fields as aligned or claim this display discrepancy is a proven carrier blocker. [Prepared editor snapshot](../scratchpad/campaign-correction-editor-prepared.json) records nine browser-only fields, acknowledgment unchecked, Update disabled, `saved:false`, `submitted:false` and `currentHelpSnapshotAligned:false`.
- **30890 was not a reported rejection.** Its current official guidance expects a custom HELP message to identify the brand and include a valid support phone number or email. The newly saved reply contains URLs only, so that point needs clarification before describing the filing as fully ready. The public support line **(346) 248-8359** appears on our policy page; its ability to receive a support call has not been verified. No new code change, deployment or second build is proposed by this draft.
- The Suspended label, API 401 and successful legacy service editing are separate observations. Do not state a billing cause, infer account activation or ask for a payment based on them. Final accuracy/fee acknowledgment and campaign submission remain the owner's actions.

## Official references

- [Editing and resubmitting a failed campaign](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/troubleshooting-a2p-brands/troubleshooting-and-rectifying-a2p-campaigns-1): Console Update starts resubmission; API edit/resubmit requires enabled private-beta access.
- [Detailed campaign update restrictions](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/troubleshooting-a2p-brands/troubleshooting-and-rectifying-a2p-campaigns): the documented API update excludes opt-in, opt-out and HELP information.
- [UsAppToPerson resource](https://www.twilio.com/docs/messaging/api/usapptoperson-resource): Advanced Opt-Out auto-population is described for campaign creation; this is not a documented promise that an existing snapshot refreshes on resubmission.
- [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out): service keyword responses and provider-handled `OptOutType` behavior are separate runtime configuration.
- [30890 Subscriber Help](https://www.twilio.com/docs/api/errors/30890): custom HELP guidance includes the brand and a valid support phone number or email.
- [30893 sample/use-case mismatch](https://www.twilio.com/docs/api/errors/30893) and [30909 incomplete/unverified message flow](https://www.twilio.com/docs/api/errors/30909).
