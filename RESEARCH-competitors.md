# Competitor workflows and product opportunities

Research date: **2026-10-21**. Owner: PM; prioritization and final product acceptance: PO. Audience: home-service shops with **1–10 trucks**, particularly an owner or small office answering between jobs. This is discovery evidence, not customer validation or a claim that Machines & Cloud outperforms these services.

## Scope and evidence rules

I read the current product README, Round 10 backlog, earlier workflow research, current PM acceptance record and relevant booking, Calendar, callback and configuration code. The code baseline inspected was local commit `4967145075a083a68896519d9e0155b6cad5afc5`; new work may change it. The [current mandate](product/README.md#current-mandate-2026-10-21) supersedes historical blanket feature-freeze statements. Billing remains parked. Discovery and local delivery can continue while provider approvals remain open.

All external sources below are public **vendor-owned product pages, help documentation or pricing**, accessed on **2026-10-21**. No accounts, demos, calls, trials or purchases were used. A documented capability is a **vendor claim**, even when its help page describes precise behavior. None of the six vendors' booking accuracy, voice quality, speed, reliability, language quality or support was independently exercised. Missing public detail means **not established in the reviewed sources**, not that a vendor lacks it. Product eligibility, integration depth and commercial terms need confirmation before a purchase comparison.

The strongest common offering is already answering, intake, scheduling and escalation. Our defensible opportunity is to make a small shop's actual commitments easier to control and verify. More channels or a longer feature list would not demonstrate that improvement.

## Published price and commercial limits

US-dollar figures are the published monthly figures observed on the access date, before taxes, discounts or negotiated terms. Different usage units prevent a like-for-like total-cost ranking without a shop's call pattern. These are competitor observations, not a proposal to resume our billing work.

| Vendor | Published entry and next tiers | Important limits and unresolved cost questions |
|---|---|---|
| **Rosie** | Professional **$49 / 250 minutes**; Scale **$149 / 1,000 minutes**; Growth **$299 / 2,000 minutes**. | Direct calendar booking and warm transfers start at Scale; waterfall starts at Growth. Website chat is included; website texting lists **$50 / 25 conversations**, then **$1 each**. Terms describe automatic plan upgrades after minute allotments are exceeded; establish the highest-tier excess-minute treatment before buying. [Plans](https://heyrosie.com/), [terms](https://heyrosie.com/legal/terms). |
| **Goodcall** | Starter **$79 / 100 unique customers**, then **$0.79 each**; Growth **$129 / 500**, then **$0.26**; Scale **$299 / 2,000**, then **$0.15**. | A customer is one phone number per month; repeat calls do not create another customer. The vendor excludes spam/wrong numbers. Worker, tool, team and retention limits vary; test-run top-ups are separate. Enterprise pricing/SLA requires a quote. Use this current canonical page instead of older vendor posts showing different prices. [Pricing](https://www.goodcall.com/pricing). |
| **Sameday** | Launch starts **$449 / 500 minutes**; Scale starts **$789 / 1,000 minutes**; Enterprise custom. | Launch includes three locations; Scale unlimited. Both list Pro scheduling. The reviewed page does not establish minute rounding, overage rate, setup fee or contract minimum. Multilingual voices and API/custom integrations are listed under Enterprise; do not assume they are included in Launch. [Pricing](https://sameday.ai/pricing). |
| **Avoca** | **No dollar price established** in reviewed official product/help pages. Demo-led sales. | Product, role, rollout and integration eligibility affect visible capabilities. Obtain an itemized quote covering usage, implementation, integrations, support and exit terms; do not substitute third-party estimated pricing. [Product](https://www.avoca.ai/), [integration eligibility](https://help.avoca.ai/integrations/overview). |
| **Jobber Receptionist** | **$29 add-on / 30 conversations**, then **$0.79 each**, on select paid Jobber plans; Plus includes unlimited usage. | This is not the total standalone cost: an eligible Jobber subscription and dedicated phone number are required. A meaningful AI call counts; SMS uses a conversation window up to 24 hours. Admins can choose continued overages or pause at the allowance. [Receptionist help](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/), [plan/add-on pricing](https://www.getjobber.com/pricing/). |
| **Housecall Pro CSR AI** | **Optional paid add-on; no CSR AI dollar price established** in reviewed current official pages. | Housecall Pro subscription pricing alone is not the CSR AI total. Ask for add-on usage, voice/number prerequisites and eligible channels. Text answering is explicitly Alpha with customer-type limits. [AI Team overview](https://help.housecallpro.com/en/articles/9311875-ai-team-overview), [pricing](https://www.housecallpro.com/pricing/), [text Alpha](https://help.housecallpro.com/en/articles/16673934-csr-ai-text-answering-in-alpha). |

## Workflows, control and recovery

### Rosie: accessible entry, meaningful transfer recovery

Rosie markets continuous answering, business FAQs, intake, summaries, transcripts and recordings. English/Spanish, website/Google-profile training and Zapier are listed across plans. Appointment links are distinct from direct booking. Its direct-scheduling announcement names **Google Calendar, Calendly, Acuity and Appointlet**, describes checking availability and booking in the conversation; a link-only entry plan should not be compared with a confirmed-booking plan. [Product and plans](https://heyrosie.com/), [scheduling announcement, 2025-12-18](https://heyrosie.com/blog/rosie-can-book-appointments-directly-into-your-calendar).

The transfer documentation is particularly concrete: scheduled destinations; caller agreement before transfer; warm briefing with recipient acceptance; voicemail detection; failure returns to message-taking. Growth waterfall tries up to five numbers. Call records distinguish an answered transfer from **Unavailable** and retain attempted destinations/outcomes. Cold transfers can end at voicemail, extensions are unsupported, and forwarding back to the same forwarded number is prohibited. Configuration is saved then published. These are documented behaviors, not tests we ran. [Transfers, 2026-08-20](https://heyrosie.com/support/en/articles/16548766-call-transfers-cold-warm-and-waterfall).

Control caveat: retraining can overwrite business identity, services, hours and service areas from the website/profile. That makes a reviewable change boundary relevant. A native Jobber or Housecall Pro workflow was not established by these sources; Zapier connectivity alone does not prove dispatch-safe writes. [Business information, 2026-08-14](https://heyrosie.com/support/en/articles/13722191-business-information-setting-up-your-agent).

### Goodcall: owner-approved changes and testing are part of the product

Goodcall describes specialist workers, intake, owner notifications and a build/test/publish workflow. Owners can give plain-language changes, inspect practice calls, publish deliberately and roll back. Existing numbers can forward only missed calls or all calls. These controls are a stronger benchmark than an editable prompt alone. [How it works](https://www.goodcall.com/how-it-works).

Current **GC4** documentation names native **Google Calendar, Google Sheets and HighLevel** connections. Other systems need configured API/MCP tools. Zapier is described separately for older GC3 agents; an old Zapier article does not establish current native Jobber/Housecall Pro booking. Escalation can retry busy lines and proceed through up to three contacts; a worker can instead collect details and notify the team. Team access and transfer contacts are separate concepts. [Operational FAQ](https://www.goodcall.com/faq).

No independently verified booking-correctness guarantee follows from these descriptions. Before using a custom FSM tool, establish availability lookup, record identity, failed-write recovery, change/cancel support and idempotency rather than treating connectivity as completion. This is our evaluation requirement, not a documented Goodcall defect.

### Sameday: a connected home-service office, beyond an answering widget

Sameday's official integration list names **ServiceTitan, Jobber, Service Fusion and FieldRoutes**. It describes direct scheduling plus reminders/follow-up in supported systems; field-level capabilities and permissions must be verified per integration. The published list inspected did not establish Housecall Pro support, so a generic comparison-page claim should not substitute for a confirmed connector. [Integrations](https://sameday.ai/integrations).

Its current product lineup includes phone handling, scheduling, campaigns, coaching and analytics. Owner-directed work and reactivation are part of the positioning; these are substantially broader than our current CSV import/export. [Features](https://sameday.ai/features), [product](https://sameday.ai/).

Sameday's handoff article advocates passing identity, reason, collected details and escalation context to staff and using a fallback when staff cannot answer. It mixes operational guidance with product marketing; it does **not** establish the exact retry ladder, recipient acknowledgment or delivery SLA for a purchased plan. Its public booking/revenue metrics are vendor-reported outcomes, not a controlled comparison with our target shop. [Handoff guidance, 2026-05-26](https://sameday.ai/post/ai-to-human-call-handoff-protocols-create-seamless-transitions-in-customer-service).

### Avoca: capacity, exceptions and verified recovery are explicit

Avoca documents numerous configurable CRM connections, including **ServiceTitan, Housecall Pro and Jobber**, plus Google Calendar. It explicitly distinguishes a saved connection from ongoing CRM sync, and feature/role/provider support from a universally available action. Its operational settings can permit cancellation, rescheduling and technician handling, with provider-specific limits. [Integrations](https://help.avoca.ai/integrations/overview), [operational behavior](https://help.avoca.ai/responder/functionality).

Capacity Planning includes date/window technician capacity, quotas and a test preview of offered slots; visibility depends on enabled features and the active capacity source. Calendar scheduling also requires configured arrival windows and service-to-calendar routing. This is a material scheduling benchmark, not proof that any arbitrary small shop receives every option. [Capacity Planning](https://help.avoca.ai/business-info/capacity-planning), [Google Calendar](https://help.avoca.ai/integrations/google-calendar).

Recovery work has an assignee, due date, attempts and terminal outcomes. A task does not contact the customer automatically; a task marked booked is separate from a verified matching job. Transfer destinations have schedules and warm-transfer controls. **Break Glass** diverts calls during vendor-declared incidents to a chosen destination; owners choose the destination, but cannot trigger the diversion themselves. Busy/unanswered diverted calls are not taken back. [Call Recovery](https://help.avoca.ai/coach/recovery), [transfers](https://help.avoca.ai/responder/transfers), [Break Glass](https://help.avoca.ai/responder/break-glass).

The opportunity is a simpler, provable workflow for a small owner, not a claim that Avoca lacks operational recovery.

### Jobber Receptionist: native schedule context and owner takeover

Jobber claims calls and texts can produce a booked visit, work request or follow-up task using the existing account's information and online-booking settings. It offers keyword-based transfer/text escalation, conversation history and live text takeover. Separate call/text controls and a per-conversation text switch preserve an owner path. These are useful standards for us; they are not unique gaps in the market. **Receptionist Companion is labeled coming soon**, so it is not counted as delivered. [Receptionist product](https://www.getjobber.com/features/ai-receptionist/).

The help guide permits owner-controlled cancellation and rescheduling; rescheduling requires online booking. Admin access and number/plan eligibility matter. Its limit controls and pause behavior are documented, including message-taking without booking while paused and optional forwarding elsewhere. We did not test whether capacity remains correct under concurrent calls or whether transfers succeed on a particular carrier. [Receptionist operations](https://help.getjobber.com/en/articles/receptionistpowered-by-jobber-ai/).

For a shop already using Jobber, our lack of live Jobber lookup/write is a genuine disadvantage. CSV import/export is not integration parity. For an owner without an FSM, avoiding a full-suite migration is a hypothesis to test, not evidence that our total cost or outcomes are better.

### Housecall Pro CSR AI: integrated scheduling, with explicit channel limits

Housecall Pro markets direct schedule and customer context, booking, scripts/hours and escalation rules. Its help guide exposes permissions for booking, rescheduling and cancellation, plus call logs, outcomes and revenue attribution. Some introductory text in the same guide still says booking is coming soon, while its permissions and current product page describe booking; record this documentation inconsistency rather than infer feature absence. [CSR AI product](https://www.housecallpro.com/features/ai-team/csr-ai/), [overview, 2026-07-09](https://help.housecallpro.com/en/articles/9740104-csr-ai-overview).

Service matching depends on online-booking line items and their descriptions/prices; names and configuration affect results. This is a useful warning against assuming an imported price book becomes correct conversation behavior automatically. [Configuration practices, 2026-01-20](https://help.housecallpro.com/en/articles/12001958-csr-ai-best-practices-and-faqs).

Text answering is explicitly **Alpha**, follows qualifying **new-customer calls**, and excludes existing customers at launch. It carries call context, can continue booking/actions according to permissions and honors STOP. A person request follows escalation rules and quiets the AI; there is no separate per-conversation switch, although focusing the conversation lets staff take over. The older overview lists Spanish as forthcoming, so Spanish production availability is **not established** here. [Text answering, 2026-08-27](https://help.housecallpro.com/en/articles/16673934-csr-ai-text-answering-in-alpha).

## Machines & Cloud: what the evidence actually establishes

| Area | Coded behavior at the inspected baseline | Strongest current evidence | Remaining product proof |
|---|---|---|---|
| Answering and customer conversation | Chat/SMS agent, Vapi voice tools, business rules, intake, fees, safety scripts, identity and English/Spanish paths. | Final local real-model acceptance covers **18 synthetic scenarios / 25 checks**, with PM/PO review; 20 focused flow checks also passed. Only Anthropic inference used a live provider. | Actual inbound/forwarded calls, speech/interruptions, delivered texts, real Spanish review and first-shop use. |
| Bookable windows | Shop windows plus default-one internal capacity; guarded booking/reschedule ledger; Google event creation/update. | Offline capacity case 19 includes concurrency, aliases, long history, uncertain writes and installed SDK test doubles; real-model booking/reschedule controls passed in memory. | Live Blobs CAS, real Google writes and provider recovery. **No existing Google busy-event lookup or live Jobber/HCP lookup**; internal capacity does not include jobs entered elsewhere. |
| Human help and callbacks | Transfer configuration, callback promise/due time, owner acknowledgment, urgent escalation and `called` command. | Synthetic handoff/emergency records, local task/alert chain and callback wording. | Real transfer/voicemail behavior, delivered alerts and escalation calls. Acknowledgment currently suppresses overdue callback checks and can count as a kept callback; it does not prove contact. |
| Follow-through | Confirmation/reminders/reschedule, quiet hours, consent/STOP paths, review workflows, owner digest and raw audit flags. | Local real-model controls; offline audit-policy/time-boundary tests. | Delivered SMS/email timing, carrier opt-outs and controlled first-week evidence. A queued/logged send is not receipt. |
| Failure/control | Pause/cancel paths, fallback TwiML, health/error events, Calendar-failure alerts and test portal. | Offline injected Calendar failures preserve bookings/reminders and alert locally; setup checked rendered fallback responses. | Real outage/paused-call routing and provider cleanup. No claim that rendered TwiML proves call delivery. |
| External systems | Google write hooks; customer CSV import/export. | Code inspection and local fault injection. | OAuth/Calendar product acceptance and an actual Jobber import. **No live Jobber/HCP API integration** established. |

Evidence: [current checkpoint](product/README.md), [PM current verdict](product/SPRINT8.md#final-current-code-pm-verdict-2026-10-21), [compact local evidence map](scratchpad/pm-real-model-final-verdict.json), [capacity proof](scratchpad/pm-capacity-check.txt), [Calendar fault proof](scratchpad/pm-calendar-failure-check.txt). Relevant implementation: [Calendar](netlify/functions/lib/calendar.mjs), [booking/callback/reporting](netlify/functions/lib/desk.mjs), [configuration](netlify/functions/lib/config.mjs), [owner settings](netlify/functions/client.mjs).

Provider **setup** has separate evidence: keys/configuration saved, Resend domain verified, Twilio profile approved/brand in review, monitor active. The bridge campaign is not filed; Google branding/scope work remains; environment changes were not deployed. These facts in [DECISIONS.md](product/DECISIONS.md) do not establish a provider-verified customer journey. Named-shop acceptance, real calls/SMS/email/Calendar/Blobs and cleanup remain open. The classifier's **65/70 exact Opus result** is a scoped local rubric measurement, not a booking success rate or market comparison.

## Four measurable opportunities

These are proposed improvements to **our inspected behavior**, benchmarked against published competing workflows. They are not claims that competitors cannot meet the criteria. Pair with the PO's [forum evidence](RESEARCH-stakeholder-forums.md) before final prioritization; public discussion is not customer acceptance.

### A — Offer the openings the owner can actually honor

**Customer job:** keep owner-entered jobs, days off and unavailable windows from becoming a second promise to a caller. Competitor benchmark: Rosie checks a connected calendar; Jobber uses native booking settings; Avoca exposes capacity and previews. Our internal count alone misses work booked outside this desk.

**First boundary:** owner-declared unavailable dates/windows and one shared stored-opening lookup. Explicitly manual, **no Google/FSM sync**. This helps an owner without requiring a full dispatch integration, but its comparative advantage is a hypothesis until observed.

**Acceptance:**

- Owner can add/remove a full-day or named-window block in Houston time; other shops and other windows remain unchanged. Blocks are visible before saving and after reload.
- One availability service supplies both agent offers and booking/reschedule enforcement. A blocked/full window is never offered as open and is rejected at commit time even if state changed after an offer.
- Regression fixtures cover two competing requests, capacity 1/2, equivalent window aliases, a block added between offer and booking, self-reschedule and a move into a full/blocked target. A failed move preserves the original booking and reminders.
- At least 20 seeded boundary examples produce **zero confirmed bookings in a blocked/full window**, and offer the next valid listed opening or explicitly offer owner follow-up when none exists.
- UI/customer wording says the owner manages availability manually; connecting Google does not silently imply that external commitments are being read. Real-model rehearsal and live-store acceptance are reported separately.

### B — Keep an acknowledged task separate from a kept customer promise

**Customer job:** agree whether the next action is a phone call, estimate visit or booked service, who owns it and when it is due. Competitor benchmark: Jobber separates requests/tasks/visits; Avoca separates task lifecycle from verified booking. Our callback machinery exists, but `runCallbackCheck` returns early on `ackedAt`; weekly/monthly reports also count acknowledgment as kept contact. `ok` means ownership; `called` records the owner saying contact happened. [Current code](netlify/functions/lib/desk.mjs).

**Acceptance:**

- Store action kind, customer-approved window, responsible owner and due time. A call request must not create a site visit or consume booking capacity.
- `ok` stops acknowledgment escalation only. It neither marks customer reached nor suppresses the promised-contact overdue check.
- Track owner-acknowledged, attempted, reached, booked and closed outcomes separately. Owner-reported contact is labeled as such; it is not inferred from an alert send or task note.
- Repeated contacts update one open action instead of making duplicate follow-ups; concurrent/ambiguous customer matches require explicit selection.
- Fixed-clock tests demonstrate an acknowledged-but-uncalled promise becomes overdue once; actual contact closes the check; every weekly/monthly numerator and denominator reconciles to stored outcomes. Controlled owner exercise measures time to acknowledge and time to contact separately.

### C — Show completion evidence and a usable recovery path

**Customer job:** know whether a confirmation or handoff happened, and recover when it did not. Competitor benchmark: Rosie's transfer status distinguishes unavailable from connected; Avoca distinguishes recovery tasks from matched jobs and documents outage diversion limits. We have delivery events and failure alerts, but have not proved their live journey.

**Acceptance:**

- Each booking/contact displays distinct persisted, send-requested, provider-accepted, delivered/failed/unknown and owner-acknowledged states where the provider supports them. Never label API acceptance or a local logged send as delivery.
- Calendar failure leaves the valid internal booking intact, displays the unsynced state, identifies the affected record and allows one controlled retry without a duplicate event or confirmation.
- Failed/no-answer transfer records the outcome and keeps a callback action with its actual deadline. A live fixture covers voicemail, busy, decline, timeout and owner acceptance; completion requires the expected phone behavior, not just webhook receipt.
- A small owner can identify the next action for each injected failure within **60 seconds** without reading raw logs. Before release, execute the same cases with approved providers and retain IDs/timestamps. Synthetic UI proof alone cannot close this criterion.

### D — Let owners test a policy change before customers hear it

**Customer job:** change fees, hours, service area or emergency instructions without silently changing other commitments. Competitor benchmark: Goodcall explicitly offers practice, publish and rollback; Rosie has publish control and warns that retraining overwrites fields. Our editable settings/test portal and development harness are useful foundations, not an owner-facing versioned release workflow.

**Acceptance:**

- Save a draft with a field-level change summary; production continues using the prior approved version until explicit publish.
- Replay a bounded owner-readable set for ordinary booking, full/blocked window, price question, person request, life safety, out-of-area and Spanish if enabled. Persist candidate version, exact input, delivered reply and outcome; distinguish rule checks from a model's self-assessment.
- Refuse publication with missing required safety/contact fields or failed deterministic checks; let the owner review model wording and acknowledge unresolved warnings explicitly.
- Rollback restores one prior approved configuration, including the voice configuration reference, and records actor/time. A stale edit cannot overwrite a newer published version unnoticed.
- In a controlled owner exercise, changing a fee/hours and reverting takes **under five minutes**, and no test reply creates a live booking or sends a customer message. Live voice propagation needs separate provider verification.

## Proposed next delivery slice

**Deliver A first**, as the PO selected during this research: manual unavailable dates/windows plus shared opening lookup, portal control, commit-time enforcement and regressions. Keep its promise narrow and visible. Do not describe it as calendar sync or technician dispatch. Preserve the existing capacity safety properties, especially uncertain-write fail-closed behavior and an intact original booking on rejected reschedule.

PM ticket sequence: (1) define block schema/validation and shared availability result, including timezone/date/window boundaries; (2) expose owner controls and agent lookup using that same result; (3) prove rejection/recovery plus natural-language offers locally; (4) PO reviews the complete owner/customer journey. The release record must separately state local, live-store and provider evidence. Existing launch/provider dependencies continue in parallel; deployment remains subject to its current boundary.

**B follows A**: exact next action and true contact completion. The acknowledgment/contact conflation is a concrete defect to include in that slice, not a reason to build another generic callback queue. C supplies the release/evidence discipline and recovery work; D is a later bounded control improvement. Re-rank after the first operator exercise rather than treating this report as an indefinite roadmap.

Unresolved discovery questions: which calendars/FSMs the first shop actually uses; who maintains manual blocks; whether a callback or visit is the expected outcome for each job type; backup-recipient availability; and what evidence the owner will supply when marking a customer reached. No answer or customer adoption is assumed here.
