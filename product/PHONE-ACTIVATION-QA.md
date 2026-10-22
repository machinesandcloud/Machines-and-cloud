# Phone number acquisition QA

Independent local QA, October22,2026. This is a gated first number-acquisition step, not working phone answering. The normal execution gate remains off. No real provider request, number purchase/release, email, model/voice call, billing change, build or deployment occurred in this QA.

## Result and scope

`scratchpad/phone-activation-qa-lookup-final.json` passes42/42 checks against stable runtime source. `scripts/phone-activation-qa-check.mjs` exercises the actual exported production wrappers and owner/management handlers with isolated memory and the installed Netlify Blobs SDK. All Twilio pricing, inventory, number-create, lookup and release HTTP requests are intercepted protocol fixtures. Physical network methods are disabled and unexpected fetch destinations fail the run. Five conditional-write conflicts were observed; no unexpected destination was attempted. The earlier40/40 artifact remains preserved before the final combined-reconciliation return.

The accepted slice reserves one US local number after a verified owner explicitly accepts a complete, versioned number-only offer and authority statement. It never activates routing, a Vapi assistant, website chat, SMS, carrier registration or a customer's forwarding. A number receipt does not establish a functioning phone service.

Execution requires the exact product gate, the approved offer version, a complete unexpired offer and provider configuration. Requests and the final pre-purchase check allow only supported workspaces in `testing` or `live`. The actual owner HTTP route supplies the actor from the verified owner session; browser-supplied actor/provider/gate fields are rejected. Ordinary anonymous, foreign-owner and operator bearers cannot use it.

## Independent failures retained and corrected

| Retained first proof | Actual failure | Corrected behavior verified |
|---|---|---|
| `phone-activation-qa-first.json`,18/24 | Expiring or removing the current offer prevented saving cancellation of an already acquired number. Both storage modes returned409 before recording the owner's request. | Cancellation authorization and durable intent use the saved request and current verified tenant/revision. Expired/missing offer configuration no longer blocks saving it; provider execution remains gated. |
| Same first proof | Turning the execution gate off returned an empty recovery result while a purchase outcome remained unresolved. | Gate-off recovery reports durable pending/unresolved/cleanup counts and stays unhealthy while held work exists, without provider traffic. |
| `phone-activation-qa-expanded-first.json`,24/26 | An archived version1 workspace could dispatch a number-create request. | Request and pre-dispatch checks allow only `testing`/`live`; owner UI follows that whitelist. Prior retained resources can still be reconciled or cancelled. |
| `phone-activation-qa-integrated-first.json`,37/38 | A terminal acquisition's delayed queue removal retried after a concurrently saved cancellation and deleted the newer cancellation index. The primary record stayed `cleanup_pending`, but automatic cleanup had lost its recovery entry. | Every queue entry has an opaque token. Removal requires the exact selected token, so a newer cancellation survives the old CAS retry and is subsequently released with a retained confirmed receipt. |

These were fixture reproductions using actual runtime code, not source-only suspicions. All first proofs remain unchanged. The final proof includes the corrected boundaries and the original adversarial ordering.

UI engineering's subsequent combined journey exposed a completed acquisition lookup retaining its lease and delaying immediate release reconciliation. Architect now clears only that completed matching lookup claim. The independent final42-check run reproduces lost create response → immediate found lookup → cancellation → lost release response → immediate definitive absence in both storage modes without advancing the clock: exactly one purchase POST and one release DELETE, with the original resource receipt retained. This closes the combined path rather than testing the two losses only in isolation.

## Final acceptance evidence

The42 groups cover:

- Missing/invalid/expired offer and default-off execution; no provider dispatch without owner costs, authority, matching quote digest and current configuration revision.
- Concurrent browser keys and recovery workers producing one purchase POST, with a stable tenant acquisition intent.
- Lost purchase responses both before and after a remote fixture effect; empty, multiple or paginated correlation results never authorize a second purchase.
- Resource/price projections that omit owner credentials, provider secrets, correlation/claim data and authority records from owner/operator DTOs. Public widget reads do not expose phone setup state.
- Release-response loss retaining the same resource ID until definitive same-resource absence confirms release; cancellation projection failure retains its durable queue intent.
- Claim/write-storage failures retaining `purchaseStartedAt`, then reconciling the existing remote receipt without another POST.
- A completed owner pause while the paid claim is held preventing dispatch. The adapter also checks current authorization after pricing/inventory, immediately before number creation.
- Persistent `needs_review` visibility, a failed standalone recovery receipt remaining unhealthy with an empty queue, and bounded50-row observability refusing to mark51 pending intents healthy.
- An aggregate execution deadline stopping inventory and POST when pricing consumes the remaining budget. Dedicated phone recovery processes one operation; the main scheduler reads the recorded phone health instead of doing provider work.
- The delayed terminal-removal/new-cancellation race above, including the actual412 retry and subsequent successful same-ID cleanup.

`scratchpad/phone-onboarding-ui-accepted.json` separately passes35 actual-handler browser checks supplied by UI engineering and independently reviewed. It covers the normally hidden gate-off card, versioned offer, separate unchecked authority/cost confirmations, explicit submit, uncertainty/reconciliation, gate-off cancellation, confirmed release and operator visibility. Its35/35 source hashes match the same current phone source. The320 and1440 offer captures and390 confirmed-cancellation capture were visually inspected: text is readable, references wrap and controls stay inside their cards. These captured prices are synthetic fixture values, not a live customer offer.

The recorded price evidence is explicitly an account pricing quote or unconfirmed pricing after reconciliation. No test supplies an invoice, charged-amount receipt or price-lock guarantee; a quoted monthly price is not proof of what a provider actually charged. The client rules, provider configuration and all service channels stay unchanged by acquisition.

## Limits

This proves local code behavior under the modeled storage and HTTP protocols. It does not prove live Netlify storage concurrency, actual email delivery, Twilio account eligibility, actual provider schemas/pricing, real release behavior, carrier acceptance, Vapi integration or voice delivery. A provider's empty correlation search is deliberately not treated as proof that an uncertain purchase did not occur.

The number-only gate has not been enabled in production. End-to-end live phone answering still needs an explicitly authorized, cost-bounded keyed acceptance that includes routing, forwarding, fallback and a verified call. The earlier site's hosted request allowance remains closed.
