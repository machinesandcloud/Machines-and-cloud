# Independent pricing and entitlement audit — 2026-10-22

The published dollar amounts agree with the plan constants, but the current source does **not** establish that the paid phone/text bundles are ready to sell profitably or meter fairly. Keep billing off while the team resolves the commercial offer, full-use costs and usage ledger. The present signup creates a free web workspace; selecting Starter, Growth or Pro records a future preference and starts neither a subscription nor a timed trial.

This is an independent, read-only repository audit at `caa3d95`. [Compact evidence](../scratchpad/pricing-audit.json) records 31 source hashes, before/after stability, the scan of all 182 root HTML pages, pure sales-calculator output, cost examples and zero external/model requests. No runtime files, prices, accounts, provider settings, hosted pages or billing objects were changed. Architect owns the separate current provider-rate investigation; no provider unit costs are assumed here. The proposed 18-logical-turn/30-HTTP-request sales-model review remains unapproved.

## 1. What the customer is actually offered

| Published plan | Monthly preference | Included call minutes | Included texts | Base price / included minute* | Base price / included text* |
|---|---:|---:|---:|---:|---:|
| Starter | $99 | 150 | 500 | $0.6600 | $0.1980 |
| Growth | $249 | 600 | 1,500 | $0.4150 | $0.1660 |
| Pro | $449 | 1,500 | 5,000 | $0.2993 | $0.0898 |

*Each ratio allocates the entire base price to just one allowance. They are alternative comparison ratios, not two revenues to add, provider costs or profit margins.*

The [plan constants](../netlify/functions/lib/config.mjs#L4), [homepage cards/notes](../index.html#L84), [signup](../onboard.html#L75), [usage view](../netlify/functions/lib/usage.mjs#L18) and [sales facts](../netlify/functions/lib/sales-desk.mjs#L31) agree on these amounts and on **$0.35 per additional minute / $0.03 per additional text**. The sales calculator explicitly excludes texting, taxes and other costs. Its figures are planning estimates for separately activated phone service, not checkout quotes.

New workspaces have `onboarding.version=1`. Their [billing endpoint](../netlify/functions/billing.mjs#L13) returns `409 billing_setup_unavailable`; [setup readiness](../netlify/functions/lib/setup.mjs#L24) keeps phone and SMS inactive; Calendar and paid provisioning are separately gated. [Owner portal rendering](../desk.js#L90) correctly replaces the legacy usage/phone instructions with inactive-channel and no-subscription copy. This audit does not mistake legacy branches or a model key being present for a purchased service.

## 2. Ranked returns and suggested fixes

| ID | Priority and observed evidence | Required correction before claiming the outcome |
|---|---|---|
| PA-01 | **P1 now; P0 before paid launch.** Six still-public source pages contradict current setup: [Houston](../houston.html#L13) promises the first seven days free; [home services](../industry-home-services.html#L15), [healthcare](../industry-healthcare.html#L15), [legal](../industry-legal.html#L15), [automotive](../industry-automotive.html#L15) and [real estate](../industry-real-estate.html#L15) promise “Live in 7 days” and Growth lead replies/free week. Their visible FAQs and JSON-LD repeat the old offer. The five industry pages also say “Most shops pick Growth” without customer evidence in this audit. [About](../about.html) still describes a private telephone pilot and hands-on setup. | Reconcile every acquisition page and structured-data offer with free, untimed workspace setup and separately verified channel activation. Remove unsupported adoption/timeline claims. Preserve the SEO pages; correct their promises. |
| PA-02 | **P1.** No visible literal “unlimited” claim was found in 182 HTML pages, nor in current runtime files. Nevertheless, website chat is bundled without a quantity or fair-use description. [Actual allowance](../netlify/functions/lib/self-service-ai.mjs#L7) is 20 private turns per tenant/day, 50 customer turns per tenant/day and **50 combined starts across all new tenants by default**; failures consume quota. Limits are plan-independent and reset at Houston midnight. | State the current reply allowance and shared-availability limitation before activation. Do not introduce “unlimited web chat.” Decide the paid contract separately: a nominal 50-turn tenant ceiling is not 50 reserved turns when another shop or private testing can exhaust the shared pool. Customer-facing “replies left” can also overstate outcomes because accepted failed attempts consume quota. |
| PA-03 | **P1.** Homepage places CSV exports under Growth and custom front-desk rules under Pro. Actual [exports](../netlify/functions/client.mjs#L63) and [config edits](../netlify/functions/client.mjs#L86) do not require those plans. All new tenants get them. `leadPlatforms` and `software` plan arrays are declarations, not enforcement of native connectors. `followUp` does gate legacy follow-up scheduling; Pro maintenance scheduling is currently HVAC-specific. “Priority support” has no documented queue, response target, coverage or implementation in this audit. | Compare actual entitlements separately from future phone/SMS bundles. Do not imply buying Pro is necessary to edit rules or Growth to export. Define support scope before using it as paid differentiation. Describe CSV as a manual handoff, not native synchronization or a verified import. |
| PA-04 | **P0 before charging usage.** The [voice webhook](../netlify/functions/vapi.mjs#L73) increments on every end-of-call report, using rounded seconds then per-call rounded-up minutes. There is no call-ID uniqueness check in the increment path. [Usage storage](../netlify/functions/lib/usage.mjs#L28) does ordinary read/modify/write, and [the general read helper](../netlify/functions/lib/store.mjs#L42) returns null on failure, which usage treats as an empty month. Concurrent events can lose counts; replayed reports can count twice. Spam, failed/empty calls, transfers and excluded categories have no explicit billable-minute policy here. | Keep this informational meter out of invoices. Establish an append-only event identity, atomic aggregation/reconciliation and an explicit billing policy for rounding, spam, failures, transfers and provider corrections. Storage uncertainty must not silently reset billable usage. |
| PA-05 | **P0 before charging texts.** [sendSMS](../netlify/functions/lib/send.mjs#L39) counts one accepted outbound application send, independent of text length, carrier segments, encoding or delivery. It counts some no-key disabled sends too. Inbound messages and owner alerts are excluded. `maintenance_reminder` and `consent_ask` are real customer-facing send types but absent from [counted types](../netlify/functions/lib/usage.mjs#L8). | Choose and disclose whether a customer buys logical messages or SMS segments. A logical-message product needs a measured segment/inbound/owner/AI cost reserve and length policy. Define all counted/exempt types; never charge disabled or simulated sends. Reconcile accepted, failed, retried and delivered states by provider message identity. |
| PA-06 | **P0 before enabling paid service.** Legacy [Checkout](../netlify/functions/lib/billing.mjs#L23) creates one flat subscription with a seven-day trial. No metered overage item, tax configuration, proration decision or price verification is submitted here. A missing Starter/Pro price falls back to Growth while plan metadata can retain Starter/Pro. The billing handler saves the plan before creating Checkout. [Signed Stripe events](../netlify/functions/stripe-webhook.mjs#L18) have no new-workspace exclusion, event deduplication or ordering contract. | Validate every selected provider price/currency/interval/amount before charging; reject missing or mismatched plans. Publish cancellation/refund/renewal/price-change and usage terms. Define tax presentation/calculation rather than infer a tax rule from this source audit. Make subscription/overage state idempotent and scoped; do not let a signed legacy event accidentally change a new billing-disabled workspace. |
| PA-07 | **P1 economics; paid-launch gate.** Pro includes 2.5× Growth's minutes and 3.33× its texts for 1.80× the price. It lowers customer unit price. Whether it lowers percentage or dollar margin depends on measured costs and utilization. | Stress-test full voice+text usage together, not one allowance at a time, plus segmentation, inbound/owner traffic, AI, support, hosting, number/campaign and payment costs. Use Architect's separately sourced rates and actual configured stack; the symbolic constraints below identify the boundary without inventing costs. |
| PA-08 | **P1 before precise sales quoting.** [estimateCallVolume](../netlify/functions/lib/sales-desk.mjs#L101) multiplies counts by average duration and compares continuous aggregate minutes. The voice meter rounds each call. A 3.1-minute average across 100 equal calls plans 310 minutes but the current per-call rule records 400. The calculator excludes SMS/tax but does not explicitly mention this rounding difference. | Label the result an unrounded planning estimate and disclose the billing increment, or estimate the rounded distribution when exact call durations exist. Include supplied text usage when comparing a total bill, and never present the lowest call-only cost as an all-in plan recommendation. |

## 3. Upgrade math at the published rates

For hypothetical activated paid service, with monthly billable minutes `M` and countable texts `T`:

`cost(plan) = monthly base + 0.35 × max(0, M − included minutes) + 0.03 × max(0, T − included texts)`.

This uses published rates only. It excludes tax, discounts and any unstated fees. There is no actual overage charge in the present implementation. Non-price differences may justify an upgrade earlier, but cannot be presumed delivered today.

| Comparison | Call-only equality when texts stay within lower plan | Earliest equality if the entire incremental text allowance is used | Maximum text-only saving |
|---|---:|---:|---:|
| Starter → Growth, +$150 | 578.57 minutes | 492.86 minutes, at ≥1,500 texts | $30; never covers the $150 upgrade alone |
| Growth → Pro, +$200 | 1,171.43 minutes | 871.43 minutes, at ≥5,000 texts | $105; never covers the $200 upgrade alone |

Because the current meter produces integer minutes, call-only lower total cost begins at **579** and **1,172** minutes respectively. With the full incremental text allowance used, it begins at **493** and **872**. For intermediate text usage, the threshold moves between those endpoints.

The general equality for adjacent plans is:

`price difference = 0.35 × clamp(M − lower-plan minutes, 0, extra minutes) + 0.03 × clamp(T − lower-plan texts, 0, extra texts)`.

| Minutes / texts | Starter estimate | Growth estimate | Pro estimate | Lowest published cost |
|---|---:|---:|---:|---|
| 150 / 500 | $99.00 | $249.00 | $449.00 | Starter |
| 600 / 1,500 | $286.50 | $249.00 | $449.00 | Growth |
| 1,188 / 0 | $462.30 | $454.80 | $449.00 | Pro, only $5.80 below Growth |
| 1,500 / 5,000 | $706.50 | $669.00 | $449.00 | Pro |
| 2,000 / 6,000 | $911.50 | $874.00 | $654.00 | Pro |

The actual pure sales helper was invoked for 1,188 routed minutes; it returns the same call-only comparison. A blanket “Growth recommended” does not establish fit for a specific shop. The amount of paid routing matters, not all calls arriving at its existing number.

## 4. What can be concluded about margin

Let `v` be all-in marginal voice cost per **metered** minute, `s` the all-in marginal cost attributable to each countable customer text, and `F` monthly fixed/support/web/payment cost. `s` must include the measured effect of segmentation, inbound replies, owner alerts and text AI where those are not separately billed. These are modeling variables, not provider rate claims.

At both allowances fully used, contribution is:

- Starter: `99 − 150v − 500s − F`.
- Growth: `249 − 600v − 1500s − F`.
- Pro: `449 − 1500v − 5000s − F`.

As an illustrative **60% gross-margin target**, all those attributable costs combined must stay under **$39.60 / $99.60 / $179.60** respectively. At Pro, even before any SMS/fixed cost, that permits at most `$179.60 / 1500 = $0.1197` per minute. This is a cost ceiling at a chosen target, not an assertion of the real cost or a selected business target.

Growth → Pro collects $200 more for 900 additional minutes and 3,500 additional texts. Its incremental contribution improves only when `900v + 3500s + incremental F < 200`. A 60% incremental margin would require that sum to be no more than $80. The extra allowance has $420 of value at published overage rates, so Pro grants a $220 discount to a customer using both extra allowances fully. Starter → Growth grants $187.50 of incremental allowance value for $150, a $37.50 full-use discount.

These facts establish stronger volume discounting at Pro. They do **not** establish a loss, lower absolute contribution, or a sustainable margin without Architect's cost inputs. A free workspace with shared AI limits also has a cost; none of the three future plan preferences currently earns revenue to pay it.

## 5. Meter and contract definitions still needed

The current monthly counter uses the **Houston calendar month**, not the Stripe subscription anniversary. An arbitrary checkout date could create a different invoice period from the usage window. Per-call rounding is `round(duration seconds)` followed by `ceil(seconds/60)`: 60.4 seconds counts one minute; 60.5 counts two. Missing timestamps count zero minutes but still one call. There is no present provider-duration or per-leg reconciliation.

SMS counting is explicitly customer-outbound only, with owner traffic excluded. Acceptance by the send API is not proof of delivery. A 1,500-character send remains one logical unit in this meter; carrier encoding/segment multiplication is not represented. No segmentation assumptions or provider rates were verified in this audit. Maintenance and consent messages need an explicit inclusion or exemption decision; silently excluding them hides costs even if a future commercial contract deliberately offers them free.

The [website terms](../terms-of-service.html#L41) describe informational website use and separately negotiated service engagements. They do not define a self-service subscription's allowance, unit, renewal, overage approval/cap, cancellation timing, refund, plan change, rollover, retention window, outage credit or price-change notice. [SMS terms](../sms-terms.html#L45) explain recipient opt-in/frequency and possible recipient carrier charges; that does not explain how the business owner is billed by Machines & Cloud. Record these as product/contract gaps; this audit makes no legal or tax determination.

The legacy usage alert sends at 80%/100%, states that service continues, and computes an informational statement/invoice string. It does not pause at a spend ceiling, charge Stripe overage or reconcile an invoice. New-marker scheduler/fanout exclusions mean those legacy commercial emails are not an active billing workflow for a new workspace.

## 6. Acceptance cases for the next pricing decision

| Case | Acceptance oracle |
|---|---|
| Offer consistency | All acquisition pages, visible FAQs, JSON-LD, sales facts, signup and portal describe the same active/future scope. No invented adoption, deadline, free-week conversion or native integration. |
| Free signup | Selecting any plan, verifying email, saving answers and activating eligible web chat creates no card, Checkout, paid resource, timed trial or subscription. Legacy signed events cannot silently opt it into billing. |
| Web allowance | Before activation, explain actual per-tenant and shared limits, reset, failed-attempt consumption and exhausted behavior. Upgrading a preference cannot claim to increase a fixed current allowance. |
| Entitlements | A table is backed by actual server checks. Rules/CSV stay available where promised; phone/SMS remain gated. Support differentiation has an agreed measurable process. |
| Cost comparison | Check below/equal/above 578.57 and 1,171.43 call-only thresholds and mixed text thresholds. Honor corrected routing/text counts; label omitted costs and rounding. Texts alone cannot falsely trigger the next plan as cheaper. |
| Voice units | 0.4/0.5/60/60.4/60.5/61/120 seconds, missing timestamps, transferred legs, failed/spam calls and month boundary have approved expected units. Same call report replay increments once. |
| Text units | Long and non-ASCII content, segmentation, inbound replies, owner alerts, consent/maintenance, disabled sends, API rejection, delivery failure and retry have explicit count/cost rules. Same provider message increments once. |
| Durable ledger | Concurrent increments retain both events; duplicate/reordered callbacks do not double charge; unreadable/ambiguous storage fails closed. Aggregate recomputes from immutable accepted events and reconciles provider receipts. |
| Payment boundaries | Missing/mismatched price ID fails closed before plan mutation; amount/currency/interval match the selected plan. Billing/usage periods align; taxes are presented by the decided implementation; proration/cancellation/overage limits match the published contract. |
| Economic release | Full-use and high-segmentation scenarios include all voice/AI/text/inbound/alerts/support/fixed/payment costs. An agreed margin target passes at each tier and at overage, with an explicit treatment of the free workspace. Architect inputs are source-dated; measurements replace assumptions before expansion. |

No pricing change, model rehearsal or publication is approved by this audit. The concrete next decision is the offer and unit contract, followed by the cost model and a metering/billing implementation that can meet it.

## 7. Independent review of the research calculator

The initial [calculator](../scripts/pricing-model.mjs) and [scenario output](../scratchpad/pricing-costs.json) were independently recomputed using decimal arithmetic rather than their implementation helpers: **576 numerical comparisons agree**, permitting a one-cent tolerance for separately rounded floating-point display fields. The [first review receipt](../scratchpad/pricing-model-qa-first.json) preserves exact reviewed hashes and the returned modeling issue. This verifies arithmetic under assumptions; it does not verify provider rates or certify a paid offer.

The stated `$0.0128` outgoing-segment and `$0.0108` incoming-segment assumptions, two outgoing segments per message, 0.35 one-segment incoming messages, 0.10 two-segment owner alerts and 0.35 AI replies at an assumed `$0.025` produce **$0.040690 per logical customer-outbound message**. Allocating that cost over its two outgoing segments yields **$0.020345 per outgoing segment**. Neither is a measured company-wide average. The `$0.18` planning voice band is an all-in assumption, not a provider receipt; do not add its included components again. Distinguish the customer’s rounded billable minutes from each provider’s actual duration, rounding and extra legs before using the same quantity in both revenue and cost calculations.

At full current allowance use under those assumptions, the labels matter:

| Plan | Service gross margin before payment/support | Contribution after modeled card fee, before support | Contribution after optional $15 support | Contribution dollars after support |
|---|---:|---:|---:|---:|
| Starter | 31.97% | 28.77% | 13.62% | $13.48 |
| Growth | 24.08% | 21.06% | 15.04% | $37.44 |
| Pro | -9.90% | -12.87% | -16.21% | -$72.77 |

These are service-level scenarios, excluding acquisition, development, disputes/refunds and other omitted costs; none is net profit. The default calculator uses 2.9% + $0.30 card fees. The additional 0.7% Billing rate is recorded but excluded from those values, so it cannot be described as already included. Architect owns verification of those external rates.

**Initial return, now repaired:** `maxMinutesIncluding15Support` clamped impossible capacities to zero. Candidate Starter’s 250 outgoing segments plus $20 fixed/web, $15 support and modeled card fee cost **$43.26 even with zero voice minutes**: its maximum margin is 56.31%. It cannot achieve a 60%, 65% or 70% target at any nonnegative number of minutes. The corrected result distinguishes `infeasible`/`null` from a valid zero-minute allowance and shows the shortfall: $3.66 / $8.61 / $13.56 respectively. The original returned evidence remains preserved.

The reduced candidate is a new offer, not a change of label. At the model’s two-segment assumption, 250/750/1,500 outgoing segments correspond to about **125/375/750 logical messages**, versus the current 500/1,500/5,000. That is a **75%/75%/85% reduction in modeled logical-message allowance**. Candidate minutes also change from 150/600/1,500 to 150/400/800. Proposed $0.49/minute and $0.05/outgoing-segment overages are sensitivity inputs only; current public prices/rates remain unchanged and billing stays off.

**Final calculator acceptance:** [802/802 independent numerical, boundary and source checks](../scratchpad/pricing-model-qa-final.json) pass on the corrected frozen research calculator. Decimal recomputation covers all current/revised scenarios and budget feasibility; the actual pure script regenerates the frozen JSON exactly under denied network transports. Explicit tests distinguish zero feasible minutes from a negative cost budget. Source and document hashes match [Architect's freeze](../scratchpad/pricing-costs-frozen.json) and remained stable. The field `serviceContributionMarginPercent` and its definition now identify post-card contribution, with support scope explicit; the provider-minute proxy and excluded additional Billing fee are disclosed. Zero actual model/external requests. Acceptance concerns this research arithmetic and unit disclosure, not provider-price verification, measured margins, customer willingness to pay, a price change or paid-service activation.

A later Architect report readability edit has its own [7/7 source bridge](../scratchpad/pricing-model-qa-source-bridge.json): calculator/scenario bytes are unchanged, the refreshed manifest matches current files, and the relevant unit, infeasibility, margin and fee boundaries remain explicit. The 802-check report keeps its original document hash; no arithmetic rerun is implied.
