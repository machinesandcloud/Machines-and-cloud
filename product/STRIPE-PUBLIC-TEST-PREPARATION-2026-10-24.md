# Public Stripe TEST proof preparation

This is an offline implementation and execution proposal. No new provider, deployment, settings, email, browser, key or financial effects have been performed or authorized by this document. The current Calendar phase and its checkout remain owned by Root. Its allowances cannot fund this proof.

The customer outcome is one actual authenticated internal owner reviewing the paid offer, completing one hosted TEST Checkout, receiving the matching public payment event in the workspace, ending renewal and completing exact-resource cleanup. The retained `--execute` mode uses memory readiness and a local signed event; it cannot establish that outcome. The new `--execute-public` mode has no memory store or local webhook trigger.

## Existing path, completed prerequisites

`WORKSPACE_BILLING_STRIPE_SECRET_KEY` is a dedicated optional workspace credential. Legacy `/api/billing` keeps `STRIPE_SECRET_KEY`. Every financial row and review retains its credential slot; older rows with no slot retain the legacy slot. Removing the dedicated key never falls back to the LIVE credential for its TEST records. Existing LIVE workspace reconciliation and renewal cancellation continue with their original slot while the dedicated TEST key is present.

The existing `workspace_billing` row retains one immutable `testProof`: phase and offer, durable physical-attempt reservations, cleanup reserve, canonical IDs and dedicated signed receipts. No new queue, credential store or scheduler is introduced. The same owner endpoint admits `proof_begin`, `proof_cleanup` and `proof_close`; all require the ordinary owner session and current workspace identity. The ordinary billing background worker continues known financial cleanup after browser loss.

The dedicated TEST slot additionally requires `WORKSPACE_BILLING_TEST_PHASE_JSON`. It binds the approved offer, merchant, current tenant/owner and an initial maximum four-hour window. New work stops on expiry or scope withdrawal. `cleanupOnExpiry:true` explicitly retains finite authority to read, expire or cancel only that phase's original resources after expiry. It does not authorize another Checkout, customer, subscription, Portal session or offer. The original counter cannot be reset by changing its configuration. Closed phases reject warm worker attempts.

The dedicated webhook verifies the raw signature with `WORKSPACE_BILLING_WEBHOOK_SECRET`, separately from the legacy secret. A proof receipt requires the pinned snapshot API version and exact canonical Checkout/subscription/invoice/customer identity. A signed event with copied metadata and a different object cannot certify this payment. Legacy forwarding does not establish dedicated destination delivery.

## Root preparation still required

1. Close the active Calendar phase first. Select one fresh, actual controlled owner/workspace with observed website installation and service readiness, no existing financial row/customer/subscription, and a valid ordinary owner session. The public runner cannot manufacture readiness, send sign-in emails or activate a service. Prepare any necessary signup/install effects under their own explicit bounded scope.
2. Verify the preexisting TEST credential belongs to Steve's selected Zari Marketing merchant `acct_1NK0c6JW47xiUUpY`. Keep its existing private0600 file; no key creation/rotation or value in chat/source. Verify the prior owned archived Coverage Product and99USD/month inclusive-tax Price from their original receipt. Do not create new Products/Prices or adopt unrelated fixtures.
3. Baseline exact current Netlify source/settings and original values/scopes. Stage only the dedicated workspace TEST key, approved offer/version, one-tenant TEST cohort, immutable phase and unique dedicated signing secret. Keep LIVE charging and unrelated provider gates off. Preserve `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and existing customers. Production Functions settings and distinct cleanup deployment need a fresh exact Root packet; a draft deploy does not isolate Blobs.
4. Create one account-scoped TEST snapshot destination at `https://machinesandcloud.com/api/workspace-billing-webhook`, with `connect=false`, `api_version=2025-06-30.basil`, metadata `mc_phase=<fresh phaseId>` and `mc_purpose=workspace_public_test`, and exactly the nine event types below. Retain the create request and returned ID/secret privately. API create returns the secret; retrieve does not. Disable the exact new destination while mounting its secret. Enable it only after current-source deployment/secret verification. A lost create response is reconciled by exact phase metadata and URL in a bounded complete list; do not blindly recreate. If ambiguous/truncated, stop.
5. Prepare `/tmp/mc-stripe-public-proof-packet.json` as a regular0600 file. It binds the exact published commit/deploy/source manifest, actual owner slug/tenant/email/bearer, fresh phase policy, prior owned fixture and new owned destination IDs, and two stable32hex cleanup/close operation IDs. The runner accepts only this path and the existing0600 TEST credential file. It exclusively claims new public/private output files before transport. Root must verify current publication against the packet immediately before execution; packet text is not independent publication evidence.

The nine events are `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.

## Proposed fresh bounds

These are proposed ceilings, not permission or a reused allowance:

- Deployed Functions:80 total physical Stripe attempts,20 reserved for the same-resource cleanup, shared durably by owner actions, webhook and scheduler. All attempts reserve before transport, including failures and timeouts.
- Existing runner's Node and hosted Stripe browser traffic:40 total operational attempts,10 reserved for cleanup;200 expected static assets and35MiB observed static bytes. Known telemetry is blocked; API JSON is never a static asset. Thus core proof Stripe traffic has a hard combined upper bound of120, not40.
- Endpoint setup/control before core proof: propose at most16 separately counted Stripe requests, including account/list/create/disable/readback/enable. If included, the whole proposed phase's Stripe upper bound is136. Any additional Portal/configuration work requires its own concrete scope; it is omitted here.
- Application traffic:160 site requests, including at most32 writes. No model, Resend, Google, voice/SMS, payment API bypass, LIVE card/key, real money, shared default/branding or Portal effects. Netlify reads/settings/builds and any account-native browser traffic need their own exact Root counters in the final scope.

## Runner and acceptance

After fresh source matching and authority, the existing runner accepts:

```sh
node scripts/stripe-test-lifecycle-proof.mjs --execute-public --packet /tmp/mc-stripe-public-proof-packet.json --output /tmp/mc-stripe-public-AUTHORIZED-NEW.json
```

Before any Stripe request or fixture reactivation, it reads the actual authenticated owner workspace and verifies current reviewed rules, live private practice, active web chat, the exact phase-bound Zari installation, its completed labeled setup request and a distinct ordinary retained website request. It then verifies the three existing served workspace asset hashes. This adds one owner GET within the unchanged160-site ceiling; the three asset GETs have moved earlier. An unready, stale, foreign or unconfirmed response stops without retries or Stripe cleanup calls. This preflight never creates or certifies readiness. The ordinary financial handlers still recheck current owner/setup authority before Checkout.

It next reads the actual owner billing state, verifies the TEST merchant, archived owned fixture and dedicated enabled endpoint, and reactivates only those fixture IDs. It admits the server phase and opens a fresh isolated Chrome profile. The actual published workspace shows the ordinary99monthly review, TEST marker and agreement; one Checkout is dispatched and completed with public4242 dummy card data. A second Checkout dispatch is forbidden even after a lost response. Unknown hosts, extra authentication, source/owner/phase drift or exhausted bounds stop the proof. If preflight stops before account verification, Root still owns cleanup of any endpoint/settings prepared outside this runner under their original finite preparation scope.

The return page alone is insufficient. The runner waits for a retained dedicated signed `checkout.session.completed` receipt bound to the same canonical objects, then verifies that actual Event, Session, subscription and paid99USD invoice in Stripe TEST. It uses the ordinary owner End monthly renewal action and verifies `cancel_at_period_end` on the same subscription. The Event API's `pending_webhooks` is only aggregate corroboration. Root must also capture Workbench's exact destination/event delivery ID, Delivered/2xx status and timing; endpoint setup or an Event object alone is not endpoint-specific delivery evidence.

Cleanup closes the isolated payer first. `proof_cleanup` retains one operation, expires the same open Checkout or immediately cancels its exact dedicated TEST subscription with `invoice_now=false` and `prorate=false`. Lost results are reconciled canonically and continue on the ordinary schedule. The runner follows a retained expiry-cleanup operation rather than replacing it. It disables, verifies and deletes only the phase-owned destination and rearchives only the prior owned fixture. `proof_close` fences the original row after confirmed financial cleanup. Customer/invoice/event audit records remain; no provider-erasure claim is made.

### Optional bounded Workbench checkpoint

The default command above retains immediate destination cleanup for compatibility. It does not leave the endpoint available for a later Workbench inspection. For the fresh public-delivery proof, Root must include this opt-in checkpoint and its finite read-only Workbench inspection in the final scope:

```sh
node scripts/stripe-test-lifecycle-proof.mjs --execute-public --delivery-evidence-checkpoint --packet /tmp/mc-stripe-public-proof-packet.json --output /tmp/mc-stripe-public-AUTHORIZED-NEW.json
```

Keep this same process's standard input open. After closing the isolated payer browser, the runner confirms the same financial cleanup, disables and reads back the exact phase-owned endpoint, and confirms both owned fixture archives. It then prints the expected endpoint and canonical paid-Checkout event IDs and waits at most ten minutes. The runner leaves the endpoint disabled during the wait. No payment, subscription, model, Portal or new destination is created by this pause. It uses the original phase/report/budget; it is not a resumable phase or a fresh allowance.

Root now inspects only that exact TEST account endpoint and event in Workbench, observes Delivered and its actual2xx response/time, and records the reviewed artifact privately. The Event API's aggregate pending count, an artifact hash alone or a typed acknowledgement does not establish that observation. Root's actual inspection and independent evidence review remain required. Once reviewed, send one JSON line to the waiting process, replacing every example value with the exact recorded values:

```json
{"action":"record_delivery_and_delete","phaseId":"<same phase>","endpointId":"<same we_ ID>","eventId":"<canonical paid Checkout evt_ ID>","httpStatus":200,"deliveredAt":"2026-10-24T18:00:00.000Z","evidenceSHA256":"<64 lowercase hex SHA256 of the reviewed artifact>","confirmed":true}
```

The line explicitly authorizes deletion of the same saved endpoint after review. The runner validates the phase, endpoint, event's accepted dedicated receipt/current Checkout, actual2xx code, delivery time and artifact digest. It never logs rejected input values; invalid lines remain unaccepted, with a maximum16 inputs before aborting the review. On acceptance it freshly reads the endpoint again and confirms the same phase metadata, URL, TEST mode and disabled status before deleting that ID. This extra GET shares the unchanged40 runner attempts and ten reserved cleanup attempts. A model beginning cleanup with30 attempts spent finishes the successful checkpoint path at38, leaving two; no additional requests are implied.

Timeout, closed input, failed input or an unready financial/event/archive result prevents delivery-review acceptance and proceeds with bounded exact-resource cleanup. A changed/re-enabled endpoint, exhausted allowance or unknown DELETE result remains unconfirmed; the runner retains the exact attempted endpoint ID/state and never blindly repeats DELETE. `proof_close` still requires known financial cleanup and confirmed endpoint deletion. No successful report is issued for a missing review or unresolved cleanup. Settings/source/session/workspace cleanup and actual evidence review remain Root-owned even after a matched acknowledgement; full Stripe delivery acceptance remains false in the runner. Portal, scheduled-failure recovery, LIVE charging and full launch are separate.

If the process disappears during the pause, retain its private packet/report and disabled endpoint identity. Do not restart this runner with a new output or reset its counter. Root must reconcile the same owned resource and remaining cleanup authority under the concrete phase scope. No new endpoint or Checkout may be substituted. The final source manifest and runner source pin still need Root's manual refresh after the grouped integration; this checkpoint implementation deliberately does not change those pins.

Root finally restores the exact prior settings and source only if the proof's versions remain current, verifies a distinct cleanup deployment where required, revokes the controlled session and cancels the workspace under the final scope. Financial cleanup cannot be claimed from a dispatch202 or configuration save. Missing receipts or incomplete restoration remain open. Actual Portal delivery, LIVE charging, phone/text and full paid launch are separate acceptance gates.

Primary contracts: [Webhook endpoint create](https://docs.stripe.com/api/webhook_endpoints/create?api-version=2025-06-30.basil), [delivery inspection](https://docs.stripe.com/webhooks#view-event-deliveries), [Event object](https://docs.stripe.com/api/events/object?api-version=2025-06-30.basil), and [immediate subscription cancellation](https://docs.stripe.com/api/subscriptions/cancel?api-version=2025-06-30.basil). Cancellation may affect other finalized invoices for that customer, which is why a fresh isolated customer is mandatory.
