# Three packages, one complete front desk

October 25, 2026. Current commercial design for review. Supersedes the October 22 two-plan recommendation for **new package design**, without changing the existing public catalog, accepted customer terms or billing. [Open the interactive preview](pricing/preview.html) · [Exact versioned catalog](pricing/catalog.json).

Recommend **Coverage $149 / Follow-through $299 / Lead desk $499 per location per month**, with custom Enterprise. The third package includes the lower packages and adds paid-lead handling. It is not a $499 marketplace connector. English/Spanish, grounded answers, retained customer context, a useful human handoff, exports and support are common capabilities, rather than artificial premium gates.

This is a launch-price hypothesis, not a claim that customers have accepted it. The team reviewed ten current official alternatives, four firsthand contractor/customer discussions, our actual source, supplier prices and adverse cost scenarios. [PO and marketing research](PRICING-PO-RESEARCH-2026-10-25.md) · [Architect's cost and implementation audit](research/PRICING-ARCHITECTURE-2026-10-25.md) · [Independent QA findings](pricing/qa-research.json).

## The package contract

| Scope, per monthly subscription period | Coverage $149 | Follow-through $299 | Lead desk $499 |
|---|---|---|---|
| Job to be done | Answer and capture the inquiry while the owner works | Keep open requests and quotes moving | Get more from leads the shop already buys |
| Website chat, phone answering, two-way service SMS, Google Calendar | Included | Included | Included |
| Shared business rules, job/contact capture, visit requests, inbox/history and owner handoff | Included | Included | Included |
| English/Spanish, saved-rule testing, pause controls, downloads and support reporting | Included | Included | Included |
| Owner-prepared request/quote follow-up, with permission, chosen time and delivery/reply history | Owner handles follow-up | Included | Included |
| Consented appointment reminders | Confirmation only | Included | Included |
| Connected paid-lead orchestration, source qualification and takeover | Manual/source-aware records remain available | Same | Included |
| Thumbtack | No new native AI entitlement | Same | Native conversation read/reply through approved partner access |
| Angi | No new automated lead entitlement | Same | Lead intake/context and eligible owner contact workflow; not in-Angi chat |
| Connected hosted call-leg minutes | **100** | **250** | **500** |
| Outgoing SMS carrier segments, including owner SMS alerts | **250** | **750** | **1,500** |
| Completed written AI replies, shared across web/SMS/any included native platform | **1,500** | **3,000** | **6,000** |

Each standard package covers **one business/location, one workspace, one website, one managed US local number, one primary owner account and one selected owned Google calendar**. More locations, numbers, calendars, shared customer team access, particular integrations or support commitments require an explicit Enterprise scope. Custom does not mean already implemented. No mass marketing, staffed reception, dispatch, shop-customer payment processing or guaranteed job/revenue lift is included.

The final catalog does **not** impose the separately discussed 600-native-reply sublimit. Any paid capacity implementation must support the advertised total pool in its permitted channels, including a lead-heavy shop. Today's small shared daily/native API safeguards do not deliver that capacity. Do not hide an additional limit behind the headline number.

Architect's native-only load example makes that concrete: using 6,000 replies over 30 days is 200 replies/day, up to 400 model requests/day under the proposed two-request envelope, and at least 1,000 worker partner requests/day before ordinary ingress refresh, setup and owner reads (roughly 1,400 with the examined ingress refresh). Current tenant limits are only 10 native model requests/day and 100 partner requests/day. Partner-approved capacity, per-tenant funding, normal bursts and history retention beyond the current 200-thread ceiling therefore need a full-pool load/recovery acceptance. The example is a minimum capacity check, not a new advertised daily cap or a claim of confirmed partner throughput.

The existing follow-up product is an owner-prepared, permission-backed request/quote text. It is not an arbitrary multi-day drip campaign. Native AI responds to new verified customer turns. Autonomous Angi SMS/email conversations remain a separate unfinished delivery capability. The target package must not imply that importing a phone number grants permission to contact it.

## Why this is the right comparison

- **Marketplace response has a low-price alternative:** [InstantResponse](https://www.instantresponse.ai/pricing) advertises $99 for one location, native Thumbtack/Yelp/LSA and web replies, with unlimited messages; ordinary AI phone answering is described separately as coming soon/beta. Its $199 tier covers up to three locations. Our higher price must earn its place through a working combined service, not a connector count.
- **Even broad generic AI is cheaper:** [Frontdesk](https://www.myaifrontdesk.com/pricing) advertises $99 monthly with 200 voice minutes, 100 chatbot conversations and 400 outgoing SMS messages, plus its credit/reload system. We cannot claim raw minute-price leadership. Its $79 rate is an annual-billing equivalent, and its conversations/messages are not our replies/carrier segments.
- **Phone units differ:** [Goodcall](https://www.goodcall.com/pricing) starts at $79 for 100 unique callers, not 100 minutes. Comparing those units as equal would mislead.
- **Broader contractor systems often quote privately:** [LeadTruffle](https://www.leadtruffle.co/pricing/) bundles voice, web, marketplaces and follow-up without a public dollar rate; [Hatch](https://www.usehatchapp.com/pricing) is a per-location annual agreement paid monthly; [Podium Home Services](https://homeservices.podium.com/plans) quotes its broader operating system. Undisclosed prices are not evidence that we are cheaper.

The customer evidence supports useful answers during a job, retained context and restrained follow-up. It does not establish willingness to pay $149/$299/$499. The paid offer should be validated through an observed working service, a fixed written offer and actual buyer acceptance/retention. No outreach or paid experiment is created by this review.

## Count units honestly

**Voice:** count connected time per hosted leg, rounding each leg up to a whole minute. A connected handoff can use two legs. Do not count an unanswered leg or a repeated report twice. Do not equate a safety reservation with actual elapsed service.

**SMS:** count outgoing carrier segments, including owner SMS alerts. Incoming replies do not deduct outgoing allowance; the model funds their supplier cost. A long/Unicode message can use several segments. Carrier-accepted sends count even if the handset later rejects them; pre-provider failure, simulations, duplicates and required STOP/HELP control responses do not. A possible send stays reserved while reconciled rather than being blindly repeated.

**Written AI:** count a logical completed customer answer, once, across web, SMS AI and supported native platforms. Tool/model retries and incoming messages do not each count. An AI SMS answer consumes one written-reply unit **and** its outgoing transport segments; that is two disclosed resource limits, not two subscription charges. Known failed deliveries do not consume a completed-reply unit, even though the supplier attempts still cost us money. Six thousand replies do not mean six thousand leads.

Reset on the accepted subscription period, not the old Houston calendar-month informational counter. No rollover. The current free workspace's best-effort safeguards and capabilities remain intact; those shared limits cannot be described as reserved paid capacity.

## Costs, charging and setup

The [reproducible cost model](research/PRICING-COST-MODEL-2026-10-25.json) funds all advertised usage at once, including number/campaign, infrastructure/email, incoming transport, support, payment/Billing fees and a $20 top-tier contingency for unknown partner costs. The unknown partner reserve is not a quote or a promise of free API access.

| Proposed package | Estimated base service contribution | Specified stress scenario |
|---|---:|---:|
| Coverage $149 | 51.2% | 37.4% |
| Follow-through $299 | 61.0% | 44.8% |
| Lead desk $499 | 58.3% | 38.9% |

These are conditional service-contribution estimates, **not profit or accepted margin targets**. They depend on an unverified 90% Haiku / 10% Sonnet mix of physical customer-serving model calls and bounded context/attempt costs. They are not savings from classification alone. All-Sonnet stress is negative at these volumes; the current Opus route is worse. If the cheaper route fails grounding, Spanish, corrections, safety or useful replies, change the cost/offer design; do not make the customer absorb a silent quality downgrade. Any additional phone legs not represented in counted capacity must be separately funded and controlled.

Taxes, acquisition, exceptional incidents, refunds, initial registration and onboarding labor are outside that recurring table. Standard carrier brand plus campaign-vetting setup is modelled at **$61**, or **$19.50 if low-volume eligibility actually applies**. The selected commercial policy is a specifically quoted carrier registration charge, accepted before texting activation, rather than silently claiming it is free. Confirm actual applicable fees. Standard recurring number/campaign costs are included. Guided automated setup is included; custom specialist work has no selected fee and needs its own fixed scope/quote.

**No automatic overage bill, reload or upgrade.** Do not publish the old $0.35/minute or $0.03/application-text planning rates as these packages' charges. No new extra-unit price is selected. The target product displays confirmed/reserved/remaining usage and reset, warns at **80% and 100%**, and offers an explicitly approved upgrade/capacity quote. Exhaustion pauses only the affected new automation; saved inquiries, owner takeover, stop/cancellation and authorized fallback remain available. That monthly behavior still needs implementation and verification.

## Implementation ownership and acceptance

This review intentionally leaves public prices and financial runtime unchanged. The standalone preview is excluded from the public build. It changes no subscription, customer entitlement, Stripe object, partner access, provider gate or model.

1. **Architect and Engineer:** version new offer IDs and enforce their monthly feature/capacity snapshots. First repair retained financial maintenance to verify the saved offer amount/Price/version/account/mode, rather than mutable current global prices. Existing accepted subscriptions retain their prices and rights, including earlier plans; no implicit migration.
2. **Engineer and OM:** implement funded per-tenant capacity, atomic period reservations/settlement, provider-ID deduplication, unknown-result reconciliation, segment/call-leg units, visible exhaustion/fallback and ordinary recovery using the existing journals. Do not create a second queue or use informational legacy counters as invoices.
3. **PO, Marketing and UI/UX:** one new offer across homepage, signup, onboarding, workspace quote, sales-chat facts/calculations, checkout and machine-readable summaries. A client-editable package preference never grants paid rights. Keep benefit-led copy; show relevant scope/limits where the customer decides.
4. **QA:** independently verify the [23 activation criteria](pricing/activation-acceptance-matrix.json), especially old-offer maintenance after new admission, cross-tenant/period races, no double consumption, free-vs-paid capacity and incomplete connector paths. Preview acceptance is narrower than that runtime acceptance.
5. **PO and OM:** retain the existing full-service launch dependencies in launch control: actual Calendar move, dedicated phone/text/carrier outcomes, financial lifecycle, incident/support recovery and approved same-thread platform delivery. Publish/sell only the supported accepted scope. A healthy deploy or this pricing review cannot close those gates.

The team has completed research, a concrete catalog, benefit copy and an interactive review. Actual buyer willingness, economical model quality, commercial entitlements, provider capacity and paid delivery remain explicit acceptance work. [Current launch control](LAUNCH-CONTROL.json) owns the next outcome; closed Calendar allowances remain closed.
