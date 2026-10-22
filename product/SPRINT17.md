# Sprint 17: automate supported connections after owner permission

**Publication update, October22 at4:03p.m. Houston:** this sprint's accepted runtime is included in READY production `05e8c5c34656f3257af8a8d3d7e8523dcbd542b3`, deploy `6ada79da2125b9c8ebe7ad56`. [Combined release receipt](../scratchpad/campaign-correction-publication-result.json). One approved build is complete;25/25 site/Netlify GETs are closed. All service gates/settings are unchanged and real signup/provider delivery remains unaccepted. Older cleanup/access-link runtime remains excluded. The dated preparation/verification record below is historical where it says unpublished or approval pending. Future release isolation starts from `05e8c5c`.

October 22, 2026. API and market research complete; the narrow Google continuation is implemented and accepted locally. No publication, activation, live connection or paid-help launch occurred. The preceding Sprint15/16 redesign and coordinator are still unpublished.

## Product decision

The owner supplies business facts once, reviews proposed rules and grants access to accounts they control. Machines & Cloud performs routine supported provisioning and recovery. A shop should not need developer accounts in Twilio/Vapi, copy internal API keys or coordinate separate setup projects. Genuine OAuth consent, legal attestations, carrier decisions and an existing-line cutover remain explicit.

[The API assessment](CONNECTION-API-FEASIBILITY-2026-10-22.md) distinguishes documented capabilities, account/plan restrictions, implemented adapters and unbuilt connectors. Twilio/Vapi support the core managed chain; Wix, WordPress and Webflow have qualified installation paths. Jobber, Housecall Pro and ServiceTitan expose APIs with different app-review or plan requirements. RingCentral/Dialpad routing is feasible after administrator access. Reviewed ordinary mobile-carrier docs did not establish a general third-party forwarding API. No percentage-of-automation claim is supported yet.

Standard supported setup stays included. [The optional-help review](ASSISTED-SETUP-REVIEW-2026-10-22.md) finds included setup, advertised $299–$499 configuration fees tied to subscriptions and more expensive bespoke builds. **$499 one-time specialist help is a scoped proposal**, contingent on real fulfillment, eligibility, economics and terms. It is not a published price or industry average. Custom integrations need a feasibility-based quote. Product defects, ordinary API provisioning and waiting for carrier review must not become a paid upsell.

## Implemented outcome

After the owner grants Google access, the current local Connections interface finishes automatically through the existing secure owner action. The extra “Finish connecting” click is removed for new, fresh receipts bound to the original session. The callback is scrubbed from the URL, Connections opens, and actual status determines the result. Denial preserves existing settings. Repeated events cannot repeat automatic completion; an uncertain result refreshes status rather than replaying a consumed code. Legacy receipts retain the explicit recovery action.

Only `desk-connections.js` changes in the runtime. Server authorization, one-use state, tenant/session/lifecycle/epoch checks, PKCE, encryption, scopes and execution gates are unchanged. [Implementation and evidence](CALENDAR-AUTO-CONNECT-2026-10-22.md) retain the exact local limits. This is event sync, not external busy-time protection or two-way scheduling.

## Acceptance

- Focused browser → actual owner/Google handlers: **17/17**, stable source, no page errors or physical requests. [Engineering](../scratchpad/calendar-auto-connect-second.json) and [independent architecture rerun](../scratchpad/calendar-auto-connect-architect-review.json) are separate receipts for that same scope.
- Existing Calendar security: **19/19**; existing owner API: **9/9**; Connections component: **11/11**. [Calendar detail](CALENDAR-AUTO-CONNECT-2026-10-22.md) links those runs.
- Covered: success, denial, malformed/expired/missing receipt, wrong tenant/session, revoked session, newer grant, repeat events, reload, lost response after server commit and sign-out during completion.
- Provider responses/storage are synthetic or intercepted. Actual hosted sign-in, real Google consent/app verification, physical Calendar delivery and first-shop outcomes remain unaccepted.

## Delivery order and ownership

1. **Architect/OM/Engineer:** finish the core approved first-shop cost/usage/isolation policy and demonstrate number → voice → dedicated-shop texting, cancellation and recovery. The existing adapters are closer than an unbuilt website/FSM connector. No execution gate changes follow from this plan.
2. **Engineer/UI/UX/QA:** ship the accepted same-session Google continuation with the existing combined redesign only after exact release verification and approval. Customer permission should resume the existing job automatically wherever supported.
3. **Architect/Engineer:** build Wix app installation and a WordPress plugin with single-use workspace pairing, then Webflow staged custom-code installation. Verify the published site and removal. Webflow publication can release unrelated staged work, so it requires owner control.
4. **Architect/Engineer/QA:** design Google free/busy as a separate scheduling feature, including added scope consent, stale availability, timezone and final conflict checks. Current event writing cannot justify a double-booking guarantee.
5. **PO/Architect:** qualify demand and developer access for Jobber first, then eligible HCP and ServiceTitan. Start with proposed fact import and deduplicated lead/request delivery before promising dispatch automation.
6. **OM/PO/Marketing:** establish optional specialist fulfillment for eligible residual site/phone work. Preserve a free guided path, scoped revocable access, written quote, audit, rollback and measured verification. Do not expose a fake booking or hire anyone from this research alone.

The product must collect only missing facts as the next supported connection needs them. Do not add decorative Connect buttons, ask for credentials for unbuilt adapters or label a stored ID as a working service. Acceptance of a new connector requires a newly authorized eligible tenant, an actual external result, disconnect/revocation and duplicate/unknown-result recovery.

## Release boundary

Production is last verified at `e997de2`; this turn performs no hosted read. Main contains earlier unrelated authentication/cleanup changes and must not be pushed wholesale. The isolated production-based Sprint15/16 candidate was extended with only this accepted frontend change and its docs/tests, then reverified below. The unanswered `8fbf43c` publication proposal does not authorize the changed runtime. All seven activation gates, billing and disabled Netlify auto recharge remain unchanged.

**Exact extended candidate verified:** runtime **`73b00ae`** on `release/portal-connections-e997` includes the accepted `8fbf43c` baseline plus this sprint. [Required checks](../scratchpad/portal-connections-candidate-required-final.json) pass27/27 with stable source. [Independent Calendar continuation](../scratchpad/calendar-auto-connect-candidate-final.json) passes17/17; [independent all-surface browser review](../scratchpad/portal-revamp-qa-connections-candidate-final.json) passes31/31 at stable source with46 captures, zero page errors and zero physical requests. [The source bridge](../scratchpad/portal-connections-candidate-source-bridge.json) confirms the sole new app runtime is `desk-connections.js`; the previously accepted15 other app runtimes match, and the protected five earlier provider modules remain identical to production. Changed JS syntax and site references pass. The initial bridge run omitted the sitecheck root argument; its retained receipt is a harness return, corrected without product changes.

[The new preflight](../scratchpad/portal-connections-release-preflight.json) retains the previous52/16/17 journey/validation/recovery scopes as earlier proof, without claiming they were all repeated in this extension. A following evidence/docs-only commit may be the eventual push target if runtime fingerprints stay unchanged. No publication decision or live test follows from verification; the older unanswered proposal is superseded for this changed runtime.
