# Sprint 11: operate customer accounts and recover setup automatically

October 22, 2026. Steve requires an admin portal to manage customers through onboarding, operation, support and cancellation, alongside the customer portal. The end goal remains one guided customer setup whose authorized connections and delivery run in the background, without routine founder work. This sprint does not redefine that goal as a website-only product.

## Selected working outcomes

- A configured operator proves a mailbox, enters a distinct eight-hour operator session, finds a customer, inspects setup, records and issues, corrects supported business answers, records an internal note and pauses, safely resumes or cancels website service. Reasons and changes are recorded together. Customer records and provider identities survive cancellation.
- An operator session cannot become a customer session. The customer portal receives no staff notes, operator audit or worker claim tokens. The ordinary admin UI no longer contains the shared platform key or permanent customer credentials. Unconfigured, removed and expired operators are denied server-side.
- A customer can request repair from saved answers, leave the page, return to progress and see the same completed result. A paused customer can repair without accidentally resuming service. Changed answers, lifecycle changes, cancellation and concurrent workers cannot replay stale work over current state.
- Recovery runs with the existing scheduler rather than depending on a browser dispatch. Attempts are bounded, completed work has a durable receipt, and unresolved failures remain in a persistent exception index until explicitly resolved. System monitoring distinguishes a fresh scan from unresolved customer work.

Initial owner-answer construction remains inline and idempotent. The new background job is an explicit local workspace repair; it does not crawl a website, call an AI, purchase a resource, activate a connection or send a message. Phone acquisition is a separate versioned-consent/receipt pipeline behind an off-by-default product gate; acquiring a number will not certify phone delivery.

## Team and boundaries

| Work | Owner | Proof required |
|---|---|---|
| Customer and operator jobs, priorities and honest completion | PO / Root | Observe the selected journeys and keep the larger connection/delivery goal open. |
| Identity, redacted management API, atomic reason/audit and lifecycle revisions | Engineer / Root | Actual-handler operator/owner isolation, conflicts, no secret or note leakage, closed-account safeguards. |
| Durable recovery, authoritative client fences, retries, receipts and exception index | Architect / Engineer | Two workers, ambiguous writes, lost projection, paused repair, lifecycle cycle, cancellation and fair scan fixtures. |
| Admin and customer portal interactions | UI/UX Engineer | Real-handler browser journey, responsive component geometry, dialogs, status and sign-out recovery. |
| Independent failure and security review | QA | Preserve original defects and separate oracle corrections; verify the current source before acceptance. |
| Platform readiness, provider prerequisites and release controls | OM / Root | No purchase, model, email or deploy claim from local fixtures. One approved platform configuration should replace routine per-customer founder work. |

See [PLATFORM-OPERATIONS-ARCHITECTURE.md](PLATFORM-OPERATIONS-ARCHITECTURE.md), [PORTAL-EXPERIENCE.md](PORTAL-EXPERIENCE.md) and [ADMIN-QA.md](ADMIN-QA.md) for the implementation contract and exact evidence. Production is still the separately accepted `04e2c9d` release until a later exact release is authorized.

## Full automation and customer portal work still required

The admin console supervises automation; it must not become an obligatory approval queue for every new customer. These outcomes remain required after the current working slice:

1. Verified delivery and recovery of actual customer and operator sign-in emails, with a controlled hosted account journey and live storage acceptance.
2. A product-wide approved quote and authorization policy, durable number/service/assistant routing receipts, safe reconciliation and verified inbound/forwarded phone delivery. Routine new customers follow that accepted policy automatically; a connection checkbox is not cost authority.
3. Durable messaging service and carrier registration, provider approval polling, clear customer corrections, delivered texts/replies and opt-out/start receipts. Customer attestations remain the customer's actions inside the same setup.
4. Single-use, session-bound Google OAuth and durable event create/change/cancel reconciliation. Provider consent and approvals cannot be fabricated or bypassed.
5. A delivery outbox that retains failures and uncertain sends, safe cancellation cleanup that retains resource IDs until confirmation, and corrected legacy reminder/fanout behavior before those paths serve new tenants.
6. Ongoing customer connection/reconnect controls, tutorial coverage for each released connection, account lifecycle history and safe configuration rollback. Native FSM connections, automated reports and a verified email-preference center remain separate ranked outcomes.

The customer can supply business details, verify an inbox, authorize their calendar, attest to actual messaging consent and accept applicable terms. Those are customer choices, not founder setup. Rare platform incidents and ambiguous irreversible provider outcomes remain operator exceptions. Local tests, a provider key or a healthy scheduler do not establish actual service delivery.

## Local portal acceptance

The selected admin/customer repair and lifecycle journey is accepted locally. QA's current [56-check API receipt](../scratchpad/operator-management-qa-resolution-final.json), [18-check browser receipt](../scratchpad/operator-session-ui-qa-accepted.json) and [independent disposition](../scratchpad/admin-platform-independent-disposition.json) retain actual source hashes. UI engineering's [43-check actual-handler journey](../scratchpad/portal-journey-ui-release-final.json) is independently reviewed. It follows verified signup, operator correction and repair, owner progress, immediate paused repair, cancellation with records/provider IDs retained and a private note after cancellation. Original failures remain alongside corrected receipts.

PO/root accepts these specific observable jobs, including readable desktop/mobile details and a contained narrow-screen reason dialog. This acceptance does not close full onboarding or service-delivery work. No real inbox, hosted account, model, telephone, text or external calendar was exercised. The normal operator mailbox must be explicitly configured; there is no fallback from a missing allowlist to the shared key or founder email.

## First provider adapter and customer authority

The next local slice is a reachable first-number acquisition pipeline, not an active phone service. The owner sees a number-only offer only when a complete, unexpired, server-approved policy and execution gate are available. Costs and business authority require separate explicit choices. Owner requests save one durable intent before the provider runs; a separate scheduled worker performs bounded work without a customer page remaining open. The operator sees the same receipt and unresolved state but cannot accept customer costs on their behalf.

The real Twilio adapter and the intercepted test adapter use the same production state machine. Uncertain purchases are reconciled rather than purchased again. Cancellation remains writable when a quote expires or execution is disabled, retains resource identity, and reports release only after confirmation. An old worker cannot remove a newer cancellation from the queue. Unresolved or only partially inspected work remains unhealthy. See [PHONE-ACTIVATION-QA.md](PHONE-ACTIVATION-QA.md) for the independent protocol/failure evidence and preserved returns.

`PHONE_ACQUISITION_ENABLED` stays off and no actual number was bought or released. Reserving a number does not create an assistant, configure routing/forwarding, register a sender, send a text, connect Google or establish delivery. The quoted price check is not an atomic provider-enforced invoice cap. Product-wide cost terms, remaining adapters, manual reconciliation for ambiguous irreversible outcomes, renewal/replacement and real provider acceptance are still open. No routine per-customer founder approval should be introduced when those accepted policies are eventually enabled.

## Final local release checks

[The complete release gate](../scratchpad/admin-platform-release-checks.json) passes80/80 commands with stable source: all16 configured build commands and64 syntax/site checks. The public package excludes credentials, internal product files and test evidence. Earlier root build receipts remain preserved: `admin-platform-build-gate.json` caught recovery blocks displacing the existing due-task priority; the blocks now run after tasks and carrier polling on every invocation. `admin-platform-build-gate-final.json` caught the independently discovered reverse-watermark failure, now repaired and independently accepted. `admin-platform-gate-accepted.json`, despite its premature filename, retains the legacy-fixture return: an in-memory object with an own `onboarding: undefined` property was not an unmarked legacy account under the new guard. The fixtures now explicitly delete the property, matching the persisted legacy schema; no runtime guard or assertion was weakened.

Current independent management acceptance is56/56, phone protocol acceptance42/42, independent browser supplement18/18, actual portal journey43/43 and actual phone UI journey35/35. These are distinct scoped receipts rather than a count of production customers. The final UI source bridge is [portal-phone-ui-release-source-bridge.json](../scratchpad/portal-phone-ui-release-source-bridge.json). Root configured the previously supplied operator mailbox only in ignored local settings. Hosted allowlist configuration, actual inbox proof and publication remain a separately authorized release phase. All runtime work is locally verified; the larger service-delivery outcomes above stay open.

Billing remains parked and Netlify auto recharge remains off. Current real-AI/voice ledgers and the previous release authorization are closed. No new external action is authorized by this sprint document.
