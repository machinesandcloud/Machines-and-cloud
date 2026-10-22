# Sprint 16: a coherent onboarding, customer and operations interface

**Publication update, October22 at4:03p.m. Houston:** this sprint's accepted runtime is included in READY production `05e8c5c34656f3257af8a8d3d7e8523dcbd542b3`, deploy `6ada79da2125b9c8ebe7ad56`. [Combined release receipt](../scratchpad/campaign-correction-publication-result.json). One approved build is complete;25/25 site/Netlify GETs are closed. All service gates/settings are unchanged and real signup/provider delivery remains unaccepted. Older cleanup/access-link runtime remains excluded. The dated preparation/verification record below is historical where it says unpublished or approval pending. Future release isolation starts from `05e8c5c`.

October 22, 2026. Local implementation; not published. Steve rejected the earlier interface as bland and hard to follow. The earlier functional passes remain evidence of their tested behavior, not proof that the design met his expectations. This sprint replaces that visual direction across all three surfaces. The old `6cec7ec` publication proposal is superseded and was not approved or published.

## Customer outcome

The product should make location, relevant work and the next action clear. Customers should not navigate a row of generic pills, see the same long checklist above every page, or search a wall of settings. An operator should find the affected customer and useful action before technical diagnostics.

The [official interface research](PORTAL-RESEARCH-2026-10-22.md) includes inspected Jobber Home/setup, Intercom Inbox and Linear interface images. The [design brief](PORTAL-REVAMP-2026-10-22.md) records the shared direction and ownership. Competitor images were retained only as local references and are not committed or shipped.

## Implemented

- `product-ui.css` supplies shared typography, navy/blue/grey/white tokens, visible keyboard focus and reduced-motion support. The pages use original proportional branding, restrained surfaces and readable hierarchy.
- Onboarding is a focused four-step flow with a clear current task, saved progress, related fields and optional advanced details. Tablet uses the full content width; mobile removes the repeated welcome heading while the owner answers. Existing field-level errors, first-error focus, interrupted saves and private handoff remain intact.
- The customer workspace has a stable desktop rail, labelled mobile navigation and eight clear work areas. Overview prioritizes real work and one relevant next setup action. The action yields when the owner is already on its destination. The full checklist lives in Connections. Business rules are grouped by purpose; practice has an explicit composer and result area. Empty states explain what will appear and link to useful work. Records become readable mobile cards with table semantics retained.
- Customer timestamps display Houston time. Date-only visits keep their calendar date, including leap days, and legacy words remain readable. The daily-text-summary control is described as a preference conditional on connected alerts; it does not promise an email or delivery.
- Operations has labelled navigation, actionable scoped metrics, priority issues, customer search and mobile customer cards. A selected account replaces the generic list introduction. Connection status and support actions come before optional diagnostics. Plan names use Coverage and Follow-through. Navigation/refresh cannot show a retained hidden account as the current page.

Existing control IDs, field names, API contracts, permissions, action reasons, revisions, session fencing and activation gates are preserved. This sprint changes presentation and navigation, not backend authorization, billing or provider execution. The earlier Sprint15 coordinator is retained in the proposed combined batch; its actual-provider requirements remain open.

## Verification and visual returns

All verification uses actual local assets with isolated memory handlers or explicit browser/API fixtures. Networking, real email/model/provider actions and deployment are excluded. Counts describe separate scopes and should not be added into a single acceptance score.

- [Workspace engineering](../scratchpad/portal-revamp-workspace-engineering-frozen.json): 78/78 on its recorded source; eight routes, saved settings, practice prompts, empty/populated records, tutorial, retry and sign-out. [Final metadata checks](../scratchpad/portal-revamp-workspace-metadata-paint-final.json): 11/11 after the two presentation returns.
- [Operations engineering](../scratchpad/admin-revamp-engineering-qa-return-final.json): 25/25, including scoped edits, notes, revision conflict, stale data, exports and clearing private data. This uses intercepted API fixtures, not production support actions.
- [Onboarding validation](../scratchpad/onboard-validation-portal-revamp-final.json): 16/16; [recovery](../scratchpad/portal-revamp-onboard-recovery-final.json): 17/17. These retain required-field, keyboard, callback and earlier-step error behavior.
- [Combined connection component](../scratchpad/service-onboarding-qa-connections-portal-revamp-final.json): 11/11 using the actual new shared/portal styles and explicit owner/offer fixtures. It is component proof, not a real connection request.

Human visual review returned and repaired a cramped tablet form, duplicate mobile onboarding heading, wrapped mobile next-action card, redundant account-list heading, raw plan IDs, customer timestamps and an unconditional digest claim. Existing required-reason and session safeguards remain checked. [Final independent all-surface QA](../scratchpad/portal-revamp-qa-all-final.json) passes31/31 at stable source, including the final content fixes, and the [actual-handler customer journey](../scratchpad/portal-revamp-customer-final.json) passes 52/52. QA inspected 320/375/768/1440px captures. Representative reviewed images are tracked; raw/intermediate captures remain local. The exact release candidate still needs its separate source bridge and verification.

## Release and remaining work

Production remains the previously recorded `e997de2` release. The new candidate must include Sprint15 plus this redesign on that exact production base, excluding the older unpublished cleanup/authentication runtime repairs. Repeat the full required gate and affected browser checks on that candidate before requesting one concrete release approval. No publication, activation or provider-test authority follows from local UI acceptance.

All seven execution gates remain unchanged, last recorded off/unset. Actual hosted signup/email/storage, phone/text/Calendar delivery and first-shop outcomes remain unaccepted. Website import/installation and reading external Calendar busy time are still unfinished. A polished interface must not imply those capabilities or real readiness.

## Exact combined candidate verified

Code candidate **`d2e4092`** combines Sprint15/16 on the exact production baseline. [Required checks](../scratchpad/portal-revamp-candidate-required-final.json) pass27/27; [syntax/source/site checks](../scratchpad/portal-revamp-candidate-source-bridge.json) pass185/185 with no broken site references. The protected earlier phone/voice/provider runtimes remain identical to production, with only the two reviewed draft fields and registration-validator export in the existing access/messaging modules. No activation setting changed.

[Independent candidate review](../scratchpad/portal-revamp-candidate-independent-disposition.json) accepts 31/31 all-surface browser cases and actual 320/375/768/1440 captures; [the actual-handler customer journey](../scratchpad/portal-revamp-candidate-customer-final.json) passes 52/52, [validation](../scratchpad/onboard-validation-portal-revamp-candidate-final.json) 16/16 and [recovery](../scratchpad/portal-revamp-candidate-recovery-final.json) 17/17. These remain local fixture/intercepted-network outcomes, not hosted sign-in or provider delivery. The candidate includes the final whitespace cleanup of desk.css. Reviewed representative candidate images are retained alongside the report.

[The release preflight](../scratchpad/portal-revamp-release-preflight.json) records scope and the proposed one-build/25-read limit. A final documentation/evidence-only commit can be the push target if it preserves every verified runtime fingerprint. **Publication approval remains pending.** The superseded `6cec7ec` question does not authorize this new design. Production remains unchanged; all real-service and first-shop requirements above remain open.
