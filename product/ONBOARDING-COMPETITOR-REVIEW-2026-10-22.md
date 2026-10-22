# Automatic onboarding: competitor review and product decision

Reviewed October 22, 2026. Owner: Product Owner. Audience: small HVAC, plumbing, electrical and other home-service shops. This review answers Steve's question about what happens after workspace creation and specifies the intended improvement. It does not accept production service delivery or authorize provider activity.

## Finding

Our present entry is a saved business questionnaire, followed by a workspace with separate readiness and connection actions. It is not yet the completely automatic service setup Steve requested. The customer should supply their business facts once, review the proposed handling, authorize connections and costs, and watch the platform complete the remaining work. They should not manage Twilio/Vapi accounts, API keys, webhooks, campaigns or retry jobs.

The goal is **zero routine founder intervention**, not zero owner decisions. Google account permission, control of an existing business line, accurate legal identity, carrier attestations and acceptance of costs remain the customer's decisions. We must collect these in one coherent journey, with each requested action explained in terms of its customer benefit.

## Evidence and limits

The sources below were read publicly on the review date. They are vendor documentation and product claims, not signups or independently measured speed, quality or reliability. No account, trial, phone call, microphone session, email, payment or provider change was initiated. Where public pages conflict, the uncertainty is retained. Missing detail is not evidence that a competitor lacks a capability. The older [competitor research](../RESEARCH-competitors.md), [public operator research](../RESEARCH-stakeholder-forums.md), [self-service mandate](SELF-SERVICE.md) and [UI/UX record](UI-UX.md) supply project context; current source code governs the audit below.

## Current official competitor evidence

| Product | Documented entry and setup | Useful benchmark and limitation |
|---|---|---|
| **Smith.ai** | Its current getting-started page describes account creation, importing a Google Business profile or website, choosing/paying for a plan, and customizing call instructions. | Establish business context before asking for detailed rules. Its public page does not establish every carrier, calendar or texting approval step. The older human-receptionist Express Setup article should not be treated as the current AI product flow. [Current signup explanation](https://smith.ai/how-to-get-started-with-smith-ai). |
| **Goodcall** | Owners describe the business or supply a website; its builder prepares greeting/questions/workflows, runs practice calls and publishes after approval. The FAQ describes local-number choice and missed-call versus all-call forwarding, with carrier-specific instructions. | Make the result tangible before routing customers. Forwarding is still controlled by the existing carrier. The FAQ currently says its number can send texts but cannot receive replies; do not assume every competitor has equivalent two-way SMS. [Build/test/approve](https://www.goodcall.com/), [operational FAQ](https://www.goodcall.com/faq). |
| **Frontdesk / My AI Front Desk** | Public signup asks for business name/type and optional website. Its help describes email/account details, brief business/call questions and verification, then a dashboard checklist. Configuration groups required, recommended, optional and advanced items; knowledge can come from text, URL or documents. Language and voice are configurable. | Separate essential setup from advanced configuration. Test the owner's actual receptionist before launch. Browser practice does not exercise SMS sending or call transfers; the testing guide reserves those for a phone test. Calendar setup still includes services, availability and a calendar connection. [Public entry](https://app.myaifrontdesk.com/register), [signup flow](https://www.myaifrontdesk.com/help/getting-started/overview), [configuration](https://www.myaifrontdesk.com/help/getting-started/setup-wizard), [practice limitations](https://www.myaifrontdesk.com/help/getting-started/testing), [scheduling](https://www.myaifrontdesk.com/help/scheduling/overview). |
| **Rosie** | Its business-information guide describes importing Google Business and website facts, then editing business identity, services, hours, areas and FAQs. It explicitly warns that retraining rewrites several business fields from those sources. | Import to reduce typing, but show proposed changes and preserve owner corrections until approved. An importer is not evidence that imported prices, hours or service coverage are correct. [Business-information guide](https://heyrosie.com/support/en/articles/13722191-business-information-setting-up-your-agent). |
| **Jobber** | Receptionist reuses existing account business information and booking settings. The number guide has number choice followed by registration; US registration asks for business/tax/address/contact/site/policy details. The website product can enable its chat in the website editor. | Reuse known facts and place prerequisite collection in the relevant journey. Jobber's hosted-site integration is different from installing a widget on any third-party site. Number and texting prerequisites still exist despite a simple marketing entry. [Receptionist](https://www.getjobber.com/features/ai-receptionist/), [number/registration](https://help.getjobber.com/en/articles/dedicated-phone-number/), [owned website integration](https://help.getjobber.com/en/articles/website-marketing-tools/). |
| **Housecall Pro CSR AI** | It reuses company/services/availability settings and groups permissions, knowledge and customization. Owners can test their customized receptionist in settings. Phone forwarding is guided, and escalation requires a suitable destination. | Trust comes from a preview of the owner's actual configuration and a clear human escape route. Current public pages contain inconsistent rollout wording around booking, texting and Spanish; no universal entitlement is inferred. [Settings and testing](https://help.housecallpro.com/en/articles/9740104-csr-ai-overview), [product FAQ](https://www.housecallpro.com/features/ai-team/csr-ai/). |
| **Sameday** | It names ServiceTitan, Jobber, Service Fusion and FieldRoutes integrations, allows an existing line to forward to its number, and currently offers a demo-led customized start. | Native operating-system connections matter, but a demo-led sales path is not the zero-founder self-service model we want. Public integration listings do not establish every supported field or write guarantee. [Integrations and signup explanation](https://sameday.ai/integrations). |
| **Reception.ai / ElevenLabs** | Its quickstart offers website scan or manual entry, asks for missing country/language/industry, selects an area code, then allows greeting/voice customization and browser practice. Finishing creates the workspace and imported configuration. Calendar sync appears in follow-up setup. | This is the clearest reviewed example of preparing a useful personal result early. Keep manual fallback, show scan progress and make review/test prominent. Its timing, trial and instant-number claims are vendor claims, not targets we have proved. [Quickstart](https://elevenlabs.io/docs/reception-ai/quickstart). |

Carrier automation has a real data contract. Twilio's ISV guide requires an approved platform Primary Profile, a customer Secondary Profile, customer brand and campaign resources, plus business/contact information. It is a customer registration, not permission to reuse M&C's brand for all shops. The platform can prepare and submit this work after the customer's applicable authorization; a channel checkbox alone is insufficient. [Twilio ISV onboarding](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api).

## Home-service stakeholder implications

Two previously researched public discussions were re-read; they are self-reports, not customer interviews or prevalence estimates. An irrigation operator describes self-booked times crews cannot honor; another operator explains geographic route constraints. That means we must ask whether the shop wants **confirmed visit windows** or **requests for the office to confirm**, rather than defaulting every shop to instant booking. [Booking discussion](https://community.getjobber.com/discussions/operations-forum/how-to-handle-online-booking-without-clients-choosing-unavailable-times/13375).

In a separate discussion, a self-identified Texas HVAC founder questions their AI setup, and respondents describe preferring overflow coverage, wrong customer matching and awkward follow-up tasks. These reports support collecting call coverage, handoff destination and what the assistant may promise, then rehearsing those cases. They do not establish that any named vendor generally fails, or that our product does better. [Operator discussion](https://community.getjobber.com/discussions/operations-forum/ai-receptionist-vs-outsourced-vs-owners/7842).

## Source audit before this change

This audit describes the entry and connection flow inspected at the start of this review. The subsequent local implementation is recorded separately below; production publication is a separate proof stage.

- `netlify/functions/onboard.mjs` verifies the owner session, resumes an existing owned workspace or idempotently creates one from saved answers, and returns its private portal. A new self-service workspace starts in `testing`, with channels inactive. Its build source is `owner_answers`; the record explicitly says website import is not enabled. The website field is a reference, not a working automatic importer.
- The initial four-step `onboard.html`/`onboard.js` form collects contact, business operating rules, service areas, hours, preferences and desired channels. It does not currently collect the initial business-line/carrier or texting legal/representative requirements. Some backend fields exist without corresponding entry controls.
- `desk-connections.js` already contains conditional owner workflows for number/service authority, phone mode, texting legal and representative details, fee/accuracy/consumer/test consents and Google authorization. So that information is deferred into the workspace, not entirely absent from the product. The presentation is fragmented and platform availability gates currently block completion.
- Phone, voice, messaging and Calendar workers/reconciliation exist behind explicit execution gates. Source implementation and offline proof do not establish actual customer number acquisition, registration, delivered call/text or Calendar outcomes. Workspace creation does not itself run all of those stages.
- Current Google integration writes saved visits in the background. The current connection card explicitly says other Google events do not determine availability. Do not promise protection from external-calendar conflicts until a reviewed busy-time integration exists.

## Local implementation and independent acceptance from this review

The questionnaire now has a dedicated responsive design, one clear active progress stage, grouped optional details and preserved inline validation. Services, trade, service area, usable hours and arrival windows are required before a new version-2 workspace is created, so the immediate result is not an empty desk blocked on the same questions. Selected phone coverage collects the business line, carrier and missed/all-call preference, or the choice to use a new number. The contact cell remains a separate safe handoff destination. Completion points directly to reviewing the saved front desk in the same workspace.

The workspace now presents a combined phone/text setup review. It first directs an unreviewed business to its answers, or an untested business to its private rehearsal. An eligible, reviewed owner sees the concrete number/service costs and conditional legal/representative/consent questions. The new durable coordinator records one acceptance and automatically requests the number, then voice/texting children after its receipt, using the existing service engines. It preserves authority, policy/revision/tenant boundaries, encrypted registration data, uncertain outcomes, cancellation and existing resource identities. Customer carrier corrections, forwarding and delivery checks still appear when needed.

Independent QA returned a concurrent-admission race and a texting-cancellation adapter mismatch; both were fixed and retested. The [actual-handler receipt](../scratchpad/service-onboarding-qa-scheduler-accepted.json) passes **34/34** groups with isolated memory and locally intercepted synthetic number HTTP. It covers actual client actions and dedicated worker/scheduler wiring, automatic child creation without another owner submission, failure/retry/cancellation/privacy controls, core signup validation and draft restoration. It also checks 25 admitted owners across five distinct scheduler waves, the one shared deadline, and expected customer review without a false global outage. The terminal-active test explicitly manufactures retained child-proof fixtures; it is not a live call or delivered text.

The [full onboarding page receipt](../scratchpad/service-onboarding-qa-ui-release-final.json) passes **21/21** at 320, 375 and 1365px with actual cached HTML/CSS/JS and explicitly mocked APIs. The separate [connection component receipt](../scratchpad/service-onboarding-qa-connections-release-final.json) passes **11/11** using actual renderer/styles, the actual portal's inline dialog styles and explicit host-DOM/DTO/POST fixtures, including removal of legal inputs after closing the dialog. Corrected mobile/desktop modal images were inspected as well as automated geometry. All three receipts have stable source hashes and zero physical network requests. Component fixtures are not a claim of a full production workspace journey.

This accepts the bounded local design, information collection and durable orchestration slice. It does not establish publication, real signup/email acceptance, carrier approval, number purchase, voice/text delivery, Google free/busy, website import, automatic installation on arbitrary sites or a first working customer shop. Execution gates remain off; the remaining platform/provider work below still applies.

## Recommended customer journey

One setup should continue seamlessly into the same owned workspace. The customer sees business outcomes; the platform owns provider orchestration.

| Stage | What the customer supplies or approves | What the platform does |
|---|---|---|
| **1. Your business** | Name, email, business, main goal; optional website. Verify mailbox ownership before private setup. | Save the initial inquiry, carry answers forward, reserve one owned workspace and resume progress. Later, import public business facts safely into a reviewable draft. |
| **2. How you work** | Confirm services/areas/hours, visit-request versus supported booking behavior, fees the assistant may quote, human handoff and after-hours rules. | Reuse known information; suggest trade-specific editable defaults. Show only missing essentials. Preserve deliberate corrections and provenance. |
| **3. Connect your business** | Choose the desired services; confirm existing business line and supported carrier, missed/all-call choice and a separate handoff number; choose/authorize number costs. If texting is wanted, confirm legal/representative facts and review prepared program/cost/consent statements. Authorize Google and choose its destination calendar if wanted. | Reuse the same business/contact details. Create the approved dedicated resources, configure signed routing, prepare shop-specific carrier paperwork, submit once, poll results and retry safe transient failures. Do not ask customers for provider API keys. |
| **4. Meet your front desk** | Review the proposed answers and try customer scenarios; approve the current configuration and launch terms. For an existing line, complete the carrier forwarding action that requires control of that line. | Run deterministic readiness checks, expose a private practice environment, track the exact reviewed version, verify the requested channels and show what passed. A browser practice call must not be presented as proof of SMS/transfer delivery. |
| **5. Your workspace** | Correct a specifically identified missing fact or reauthorize an expired connection if asked. | Continue pending registration/setup automatically, show actual readiness and retained failures, monitor service and recover routine issues. Never require a founder to click through normal tenant setup. |

Collect legal details only for relevant selected services, after verified identity. Do not silently infer an EIN or legal name from a website, use the owner's contact cell as a business line without confirmation, or precheck legal/cost attestations. Call forwarding and SMS routing are distinct services; the product must not imply that forwarding calls moves existing-line texts. Unsupported business types/calendars should get an explicit useful path, without claiming an unavailable integration works.

## This turn: useful improvements without inventing automation

1. Give the page the same visual quality as the main site: restrained blue/ink, a clear business-oriented introduction, numbered progress with one active stage, a strong form card, readable grouped questions and a concise business-summary rail. No fabricated ratings, testimonials, security certificates or setup-time guarantees.
2. Explain the immediate result next to the create action: a saved, private front desk that the owner can review and test; selected connections show their next required action in the workspace. Make saved status and a return path obvious. Keep technical incident/gate language out of the normal sales copy.
3. Reuse answers in the live summary without claiming data has been imported. Use separate labels for `Saved`, `Needs your approval`, `Preparing`, `Waiting for carrier review`, `Needs attention`, and `Ready`; never turn a selected preference into a green connection.
4. Reduce the form burden: optional advanced policies in expandable sections, human labels such as urgent/safety requests rather than tier numbers, plain-language hints and preserved accessible field validation. Defaults remain editable and are not evidence of owner approval.
5. Ensure workspace creation leads directly to a clear next action, rather than a generic dashboard. The guide should point to the same saved setup and selected connections, with no repeated questions or provider-console instructions.

## Engineering required to fulfill the full promise

These are product requirements, not a claim that they are implemented by the page redesign:

- A versioned, resumable activation plan joining known business facts, required missing fields, customer approvals, desired services and durable job state. Persist consent/cost versions and display one coherent status across setup and workspace.
- Safe website import with a manual fallback, tenant-scoped limits, SSRF protections, untrusted-content handling, field provenance and explicit review. Imported data must not silently replace owner-approved facts or trigger service/purchases.
- Consolidated conditional connection capture that reuses current service APIs and keeps exact authority/cost gates. Repeated submits/recovery must reuse retained resource IDs; uncertain purchases or sends must never trigger duplicate attempts.
- Complete platform configuration and separately authorized real-provider acceptance for acquisition, voice, dedicated shop registration, two-way texting, opt-out, callback routing, OAuth and Calendar create/change/cancel. Current disabled execution gates are a real launch dependency.
- An availability strategy for work booked elsewhere. If Google free/busy or the chosen FSM is unsupported, state that clearly and use the supported manual availability/request workflow. One-way event sync does not solve dispatch capacity.
- Website installation connectors where access is supported; otherwise a concise verified install step or hosted preview. We cannot alter an arbitrary customer's website without their authorization and access.
- End-to-end QA of first signup, return, interrupted setup, ownership changes, rejected/corrected carrier filing, revoked Google consent, forwarding loops, duplicate/conflicting work, cancellation and provider cleanup. Record observed customer outcomes, not only successful HTTP responses.

PO acceptance requires a fresh eligible shop to reach the requested supported services with no routine operator action, correct owner approvals, visible recovery and delivery evidence. Measure time spent actively answering questions separately from carrier waiting. Compare completed onboarding, abandonment at each stage, repeated questions, support intervention and first successful customer interaction. No superiority claim follows from this research alone.

## Customer-facing copy direction

For the current saved-answer implementation:

> **A front desk that knows your business.**
> Add your services, hours and the requests you want help with. Then review your front desk and try it as a customer.

Supporting side card:

> **Your setup, in one place**
> Your answers are saved as you go. After creating your workspace, you'll see what is ready and the next step for each connection you choose.

Create action: **Create my workspace**. Completion: **Your workspace is ready. Let's review your front desk.**

When the approved automatic service journey is actually available, the connection-stage copy can become:

> **Connect once. We'll handle the setup.**
> Confirm your business details and approve the connections you want. We'll prepare your number, register your texting and keep you updated while each connection is checked.

That final promise must wait for the matching working product and platform readiness. The present page must not advertise automatic import, immediate phone activation or confirmed texting as completed capabilities.
