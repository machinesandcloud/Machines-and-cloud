# Pricing costs and sustainable allowances — October 22, 2026

Architect research, inspected October 21 Houston / October 22 UTC. **The current $449/1,500-minute/5,000-text bundle is not demonstrated sustainable. Keep billing off while the package and meter are reconciled.** This is a reproducible sensitivity model, not an account invoice or a price-change authorization. No customer, provider account, paid model, SMS, voice or billing action was used. Public primary-source research only; no runtime prices changed.

The free self-service workspace currently activates eligible website chat after review/test gates. New-workspace voice, SMS and Calendar remain blocked; published plans are preferences, not charges. Free web and future voice-service economics must be assessed separately. Competitor packaging/value is PO-owned; this report does not establish willingness to pay.

## What the implementation actually buys

| Path | Evidence in source | Cost consequence |
|---|---|---|
| Tenant voice | `lib/vapi.mjs`: Vapi assistant, default `claude-sonnet-5` (environment override), Deepgram `nova-3`, `en` or multilingual; optional TTS environment provider/voice. Twilio-owned number imported into Vapi. | Vapi hosting + model tokens + transcription + TTS + Twilio transport. Actual tenant TTS is unspecified in source; there is no honest exact all-in rate yet. |
| Transfers/fallback | `voice.mjs` uses Twilio Dial; Vapi warm transfer can summarize to the recipient; `send.mjs` can place escalation calls. | Extra outbound/inbound legs and possible warm-transfer AI/summary time. Browser voice practice has no telephone leg but still consumes voice/model/transcription. Do not charge telephony twice for one imported-number leg. |
| Tenant web/SMS | `lib/agent.mjs` uses **Opus 5.5**, not the voice Sonnet model. Chat passes 1,500 max output tokens; `sms-agent-background.mjs:34` passes 1,200. Up to 3 tool-loop iterations; default SDK retries 1. | Full prompt/tools/history are resent each request; tool turns and retries add cost. A short customer SMS is not a cheap LLM request by definition. |
| Onboarding/audit | `onboard-build-background.mjs` profile generation uses Opus, max 6,000 output tokens, SDK retries 2; legacy nightly rubric/review classifiers in `desk.mjs` also use the shared model unless overridden. | Acquisition/setup and ongoing quality costs sit outside phone minutes and outgoing customer-text counts. New self-service excludes legacy audit/fanout paths. |
| Usage | `usage.mjs` counts outgoing customer messages 1 each; inbound texts and owner alerts are excluded. `vapi.mjs` rounds elapsed seconds then ceilings minutes per call. | Meter is informational, non-atomic and not invoice-ready. It neither records actual SMS segments nor reconciles provider cost or duplicate call reports. No automatic overage collection. |
| Infrastructure | Blobs records, scheduler every 10 minutes, streaming/functions while waiting for AI, Resend access/notification emails. | Shared account resources and fixed subscription tiers; no per-tenant bill was inspected. |

A small synthetic HVAC config produces 6,675 web-system characters +3,614 tool-definition characters; voice system 7,653 characters; sales system 8,539 +3,641 tool characters. **These are measured characters, not token counts.** Real owners add FAQ/rules/history. Cache hints only cover the system block; its date/time/rule content can change, and system hints do not establish a cache hit. No token-counter API was called.

## Verified public units and rates

USD list prices checked October 22; actual account contracts, tax, surcharges and provider routing must be reconciled before billing.

| Component | Official rate / boundary |
|---|---|
| Vapi | Hosting $0.05/call-minute plus provider costs. Usage-only includes 4 concurrent calls across its organization; extra concurrency $10/line/month. Core $29/month raises included concurrency to 10. These are shared capacity constraints, not a separate assistant limit per shop. [Vapi pricing](https://vapi.ai/pricing). |
| Voice estimates | Model input depends on prompt/tools/repeated requests; output estimate 150 tokens/minute, cache-hit assumption 50%, two-channel transcription estimate. Those are vendor estimating assumptions, not this app's measurements. [Vapi component methodology](https://docs.vapi.ai/assistants/model-intelligence/understanding-cost). |
| Anthropic | Opus 5.5 input $4/output $20 per million tokens;5-minute cache-write $5/cache-read $0.20. Sonnet 5 default voice model input $2/output $10; cache-write $2.50/cache-read $0.20. Tool definitions/results consume tokens. [Official rates](https://platform.claude.com/docs/en/about-claude/pricing). |
| Deepgram | Current promotional Nova 3 streaming monolingual $0.0048/audio-minute; multilingual $0.0058. Regular listed $0.0077/$0.0092. Direct-provider prices need not equal Vapi-routed rates/channels; do not assume a promotion or direct API subscription. [Deepgram pricing](https://deepgram.com/pricing). |
| Twilio voice | Local inbound $0.0085/minute, outbound US$0.014/minute, number $1.15/month. Recording $0.0025/minute and storage $0.0005/minute/month when used. [Twilio rates](https://www.twilio.com/en-us/voice/pricing/us). Forwarded inbound/outbound legs are separately billed and rounded; the help article's older example outbound rate is superseded by the current rate table. [Leg accounting](https://help.twilio.com/articles/223132367-How-Much-am-I-Charged-for-Call-Forwarding-with-Twilio). |
| Twilio SMS | Base $0.0083 per sent **or received segment**. Long-code carrier examples:T-Mobile+$0.0045 outbound/+$0.0025 inbound; AT&T+$0.0035 each; Verizon+$0.005 outbound. Thus model uses $0.0128 outgoing/$0.0108 incoming, a T-Mobile scenario, not a weighted actual mix. [Twilio SMS](https://www.twilio.com/en-us/sms/pricing/us). |
| Segment size | GSM7 single 160/multipart 153 units; UCS2 single 70/multipart 67. Certain Spanish letters, curly punctuation or emoji can change the whole message's encoding; Spanish itself does not always mean Unicode. Extension characters can consume two GSM units. [Twilio segmentation](https://www.twilio.com/docs/glossary/what-sms-character-limit). |
| A2P | Low-volume brand $4.50 or standard $46 once; campaign vetting $15/submission. Standard campaign $10/month versus low-volume mixed $1.50. Code requests `MIXED`, not `LOW_VOLUME`; do not budget the cheaper campaign by assumption. [Official fees](https://help.twilio.com/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service). |
| Resend | Free 3,000/month with 100/day; Pro $20/month for 50,000 and $0.90/1,000 extra. Shared tier allocation differs from marginal message cost. [Resend pricing](https://resend.com/pricing). |
| Netlify | Pro starts $20/month/3,000 credits; production deploy 15 credits, compute 10/GB-hour, traffic 20/GB, requests 2/10,000; extra 1,500 credits $10 only with recharge enabled. Recharge remains disabled by Steve's decision. Direct Anthropic calls are not Netlify AI Gateway inference. [Pricing](https://www.netlify.com/pricing/), [meters](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/). Blobs has no published standalone per-operation rate; do not invent one. [Netlify storage comparison](https://www.netlify.com/knowledge-base/netlify-blobs-vs-vercel-blob/). |
| Payments if enabled later | Domestic online card 2.9%+$0.30, and Stripe Billing pay-as-you-go adds 0.7% of Billing volume. Default calculator includes card fee only and shows Billing as additional sensitivity. Current code's subscription path would need the extra Billing rate reviewed. [Payments](https://stripe.com/pricing), [Billing](https://stripe.com/billing/pricing). |

## Calculator assumptions and formula

Run `node scripts/pricing-model.mjs > scratchpad/pricing-costs.json`. It imports the current plan configuration and performs arithmetic only.

- Voice **all-in assumed bands**:$0.10 lean/$0.18 planning/$0.30 stress per AI minute. These include Vapi, model, STT, TTS and ordinary transport/transfer allowance; do not add those again. The grid assumes a 1:1 ratio between published-meter minutes and all-in provider-cost minutes as a sensitivity proxy. App-rounded elapsed minutes, provider per-leg rounded minutes and Vapi duration are distinct; short/forwarded calls can need a material uplift, which is unmeasured. They are sensitivity bands, not guaranteed ceilings. Long prompts, speech ratio, retries, transfers, rounding and voice choice can exceed them.
- Current logical-text model:2 outgoing segments/message;0.35 incoming one-segment messages and 0.10 owner alerts of 2 segments per outgoing message;35% of outgoing messages use an AI reply averaging an assumed $0.025. Other scheduled template texts use no model. This gives **$0.04069 per outgoing logical customer message**, including associated hidden consumption; no claim this is observed behavior.
- Candidate segment model:250/750/1,500 **outgoing segments**, not logical texts. Bare carrier floor $0.0128/segment excludes other usage. Distributed inbound/owner/SMS-AI assumption costs $0.020345 per included outgoing segment.
- Fixed tenant service $15/month + separate web-AI reserve $5/month are **planning allocations**, not measured invoices. Optional human-support scenario adds 15 minutes/month at assumed $60/hour=$15. Shared Vapi packages/concurrency and actual infrastructure must fit allocations or replace them.
- Payments default 2.9%+$0.30 once/month. No new payment charge is enabled. Taxes, refunds, disputes, acquisition, development, owner salary, one-time registration and setup are excluded; these are **service contribution margins after card fees**, not accounting gross margin or net profit.

`cost = minutes × voice unit cost + text/segment costs +15 service +5 web +optional support +2.9% × price +0.30`.

For target service contribution margin `g`, the **total service-cost budget before card fees** is `price × (1−g−0.029)−0.30`; sustainable minutes are `floor((budget−15−5−SMS costs)/voice unit cost)`. A negative numerator is **infeasible even at zero voice minutes**: the calculator returns `feasible:false`, `maxMinutes:null` and the zero-minute cost shortfall. Zero is reserved for a feasible budget that affords less than one complete minute.

## Current published bundle sensitivity

At assumed $0.18/minute and the logical-text assumptions above, using the **same utilization fraction** of included minutes and texts. This is a stress grid, not a prediction of correlated customer usage.

| Plan | Allowance use | Cost incl card, excluding human support | Service contribution margin | With $15 human support |
|---|---:|---:|---:|---:|
| starter $99 | 25% | $35.01 | 64.64% | 49.49% |
| starter $99 | 50% | $46.84 | 52.68% | 37.53% |
| starter $99 | 100% | $70.52 | 28.77% | 13.62% |
| growth $249 | 25% | $69.78 | 71.98% | 65.95% |
| growth $249 | 50% | $112.04 | 55.00% | 48.98% |
| growth $249 | 100% | $196.56 | 21.06% | 15.04% |
| pro $449 | 25% | $151.68 | 66.22% | 62.88% |
| pro $449 | 50% | $270.05 | 39.86% | 36.52% |
| pro $449 | 100% | $506.77 | -12.87% | -16.21% |

The original full Pro allowance costs $506.77 in this scenario against $449 revenue, **before human support**. Even the optimistic $0.10 voice band does not establish a healthy full-bundle margin once all 5,000 outgoing messages and hidden usage are included. Low average utilization can make a bundle profitable while a fully entitled customer loses money; average utilization must not disguise that promise.

## Candidate 150/400/800 minutes with 250/750/1,500 outgoing segments

**Candidate only; not an accepted change.** The table includes associated inbound/owner/SMS-AI assumptions, card fee and $20 fixed/reserve, excluding optional human support. JSON also includes the bare carrier floor and support case. Changing 500/1,500/5,000 logical messages to 250/750/1,500 segments is a substantial entitlement cut, not a unit rename: at the assumed two segments/message it reduces outgoing SMS capacity by 75%/75%/85%. PO must evaluate the customer value and explain any revised offer before accepting it.

| Plan | Assumed voice/min | Candidate contribution margin | With $15 human support |
|---|---:|---:|---:|
| starter $99 | $0.10 | 56.31% | 41.15% |
| starter $99 | $0.18 | 44.18% | 29.03% |
| starter $99 | $0.30 | 26.00% | 10.85% |
| growth $249 | $0.10 | 66.76% | 60.73% |
| growth $249 | $0.18 | 53.90% | 47.88% |
| growth $249 | $0.30 | 34.63% | 28.60% |
| pro $449 | $0.10 | 67.96% | 64.62% |
| pro $449 | $0.18 | 53.71% | 50.37% |
| pro $449 | $0.30 | 32.33% | 28.99% |

Reducing allowances helps materially, but 150/400/800 does **not** deliver 60% service contribution margin at the $0.18 planning band. Holding headline prices requires a smaller entitlement, lower verified cost, lower target margin, or a separately funded service; no arithmetic creates all four.

## Cost budgets and maximum minutes

Includes 250/750/1,500 outgoing segments plus distributed hidden SMS costs. Minutes shown exclude optional human support; adding it reduces the budget by $15 and the JSON supplies that result separately.

| Plan | Target | Total service-cost budget | Variable budget after $15+$5 | Max minutes at $0.10 | At $0.18 | At $0.30 |
|---|---:|---:|---:|---:|---:|---:|
| starter | 60% | $36.43 | $16.43 | 113 | 63 | 37 |
| starter | 65% | $31.48 | $11.48 | 63 | 35 | 21 |
| starter | 70% | $26.53 | $6.53 | 14 | 8 | 4 |
| growth | 60% | $92.08 | $72.08 | 568 | 315 | 189 |
| growth | 65% | $79.63 | $59.63 | 443 | 246 | 147 |
| growth | 70% | $67.18 | $47.18 | 319 | 177 | 106 |
| pro | 60% | $166.28 | $146.28 | 1157 | 643 | 385 |
| pro | 65% | $143.83 | $123.83 | 933 | 518 | 311 |
| pro | 70% | $121.38 | $101.38 | 708 | 393 | 236 |

At $0.18, 60% target implies at most**63/315/643 minutes** under these assumptions. With the optional $15 support reserve, Starter costs $43.26 even at **zero voice minutes** and reaches at most 56.31% modeled contribution margin. Therefore its 60/65/70% targets are all infeasible, not zero-minute packages; JSON reports the exact shortfall. These are cost ceilings, not customer-researched package recommendations. A65–70% service contribution margin target is a working hypothesis to leave room for support and acquisition; it has not been validated against demand or actual cost.

## Overage and web economics

At $0.49/voice-minute and 2.9% card fees, marginal service contribution margin is 76.69%/60.37%/35.88% for the $0.10/$0.18/$0.30 bands. A60% target needs at least about $0.27/$0.49/$0.81 respectively before additional Billing fees; with 0.7% Billing, the planning floor becomesabout $0.50. Therefore $0.49 is conditional on verified all-in cost below about $0.1818/minute, not a safe universal rate.

At $0.05/outgoing segment, margin is 71.50% for carrier-only cost, **56.41%** with distributed inbound/owner/SMS-AI assumptions. Existing $0.03/logical message is−38.53% under the modeled $0.04069 cost. A three-segment outbound message alone costs $0.0384. A **single** one-segment uncached Opus reply at 5,000 input/150 output tokens costs $0.023 model+$0.0128 carrier=$0.0358, already above $0.03, before inbound or tools. This arithmetic uses verified unit prices and **assumed token counts**, not measured usage. Separate deterministic templates, conversational AI, incoming segments and owner alerts in any future allowance decision.

Web uses no Vapi/STT/TTS/telephony, but is not free to us. At assumed 2,000 fresh input/200 output tokens, Opus costs $0.012/request or $0.036 across 3 requests; at 5,000/150 it is $0.023/request. Cache misses, longer histories, thinking and repeated tools change this. The free private 20/web 50/shared 50 daily allowance is plan-independent; a separate sales 50/day budget exists. Those are logical-turn caps, not dollar budgets or guaranteed monthly capacity. A$5 tenant reserve can be exceeded; no actual usage distribution or monthly AI COGS reconciliation was inspected.

Netlify example: an assumed 1GB function waiting 30 seconds consumes 0.0833 compute credits, approximately $0.00056 at the public $10/1,500 incremental conversion. At 2GB double it. This is a conversion illustration, not free capacity or an invoice; shared monthly base, scheduler, page assets, deploys and safety headroom remain. Each 10MB delivered represents 0.2 bandwidth credits, so marketing/demo traffic also matters.

## Decisions needed before paid service

1. Keep free workspace truthful and billing parked. PO can test $99/$249 positioning for a useful proved workflow; do not sell unavailable phone/integrations as today's differentiator. Hold the large $449 bundle until unit cost and customer value are demonstrated.
2. Define the purchasable unit: connected billable minutes with explicit rounding/transfer policy; customer-facing SMS credits based on actual segments, or a separately capped logical-message design with documented encoding/length. Avoid surprising Spanish customers; show usage before overage and preserve consent/opt-out behavior.
3. Pin and verify tenant voice configuration. Reconcile provider call-cost breakdowns and every telephony leg against a controlled approved call sample; measure typical and high-cost/long/Spanish/transfer calls. No new provider test is authorized by this report.
4. Before charging usage, implement idempotent receipt ingestion, atomic counters, segment/direction/encoding fields, actual provider costs, reliable thresholds, explicit budget ceilings and signed price versions. Current informational counters cannot support automatic invoices or spend enforcement.
5. Measure model input/output/cache/iterations by mode, not only final reply length; budget templates versus model replies separately. Persist sanitized cost receipts without keys or unnecessary conversation content. Add a hard monthly cost allowance and visible recovery if the product becomes paid; daily caps alone do not establish monetization.
6. Price registration, support, refunds and concurrency explicitly. A one-shop successful demo does not establish capacity for 1–5 crews across many shops. Do not buy Vapi packages, enable recharge or change pricing under this research authorization.

Outputs: `scripts/pricing-model.mjs`, `scratchpad/pricing-costs.json`. Calculations can be rerun without credentials or network; runtime pricing, billing and providers are unchanged.
