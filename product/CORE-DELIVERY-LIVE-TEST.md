# Controlled Calendar delivery test

This is a proposal. No new publication, environment change, signup email or Calendar request has been authorized or executed.

The [verified candidate](SPRINT20.md) adds ordinary owner visit controls and bounded Calendar delivery. All30 required build checks pass, with independent mobile/desktop workflow and failure/recovery acceptance. Production remains `05e8c5c`. Phone/text activation and native integrations are separate unfinished work.

## Proposed result

Create one internal free workspace using `ngoumnaisteve+mc-core-calendar-20261022@gmail.com`, confirm that signup and return work, and connect the owned primary Calendar for `ngoumnaisteve@gmail.com` after the owner reviews Google's permission screen. Create one synthetic visit through the normal owner API, then use the portal to move and cancel it. Confirm the actual Google create, update and deletion receipts in sequence. The local visit and history remain for audit. This test makes no model request and does not certify AI service readiness.

Before deployment, confirm the actual primary Calendar ID in its settings, privately bind the new workspace incarnation and planned visit ID, and obtain a complete Calendar census within the inspection cap. Failure, missing prerequisites or ambiguous retained work stops the test. Stage only the four named Calendar variables for the new guarded deployment; preserve the old deployment's frozen values until it is replaced. See [Netlify's deployment environment behavior](https://docs.netlify.com/build/functions/environment-variables/).

## Limits

- One production push/build, costing15Netlifycredits; no manual rebuild or second release.
- Up to3 sign-in emails to the controlled alias; only those messages may be read for this test.
- Up to160 direct site requests, including40writes and25read-only hosted checks; no automatic redirects/retries outside the recorded budget.
- Up to6 Netlify metadata reads,25 direct Blobs inspection requests and4 Functions-environment writes. The writes are restricted to production `CALENDAR_CONNECTION_ENABLED`, `CALENDAR_DELIVERY_ENABLED`, `CALENDAR_EXECUTION_APPROVED_VERSION` and `CALENDAR_EXECUTION_POLICY_JSON`.
- At most29 runtime-managed Calendar API/worker HTTP attempts under the durable runtime policy, including failures: one token exchange, six refreshes, eight reads, one event create, one update, two delete attempts and ten worker dispatches. One OAuth start is also allowed. Up to3 direct private Calendar-worker POSTs count within the site-write budget: at most32 Calendar-related attempts in total, with no automatic reset.

Keep enough request allowance and time for exact-event cancellation before starting another non-cleanup action. Observe create before move, update before cancel and deletion before disconnect. No attendees, invitation emails, texts, voice calls, purchases, carrier filings, model requests, billing changes or other customer work belong to this test.

After confirmed deletion, disconnect the Calendar and cancel the internal workspace. This closes the cohort; the execution policy also expires within60minutes. The deployed Calendar flags remain true and require the exact valid policy/current tenant to execute. This one-build proposal does not include another deploy to restore their values to false. Local disconnect does not revoke the Google account's grant. Retain identifiers and stop on uncertainty; do not refill budgets or create replacements blindly.

The [machine-readable packet](../scratchpad/core-calendar-live-proof-proposal.json) supplies the exact caps, private binding requirements and stop conditions. [Release proof](../scratchpad/core-delivery-release-preflight.json) and [independent disposition](../scratchpad/core-delivery-independent-disposition.json) distinguish the tested code from actual service acceptance. The fresh [request controller](../scratchpad/core-calendar-live-controller.mjs) passes15 offline checks and requires an exact approved private packet plus a fresh exclusive ledger. Its browser/mailbox/publication adapters remain caller-supplied; no live journey was run. The final approved commit and fresh ledger must be fixed before any execution.

`CLAUDE.md` limits production pushes to “at most once a day.” We already published today, so this additional15-credit build requires approval.
