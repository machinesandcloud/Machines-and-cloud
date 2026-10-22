# Acquisition and onboarding entry review

Date: October 22, 2026. Owner: Marketing / Digital Assets / Sales.

## Problem and decision

The previous homepage card explained internal setup boundaries before asking for any customer information. Phrases such as “saved rules,” “setup checks,” “not activated by this signup” and separate setup for each channel made the visitor interpret our implementation. Steve returned that experience and asked for a short preliminary form followed by a simple full signup/onboarding journey.

Use one customer-facing entry: a benefit-led introduction, a few preliminary details and **Continue to setup**. Save the submitted lead before email verification, without disclosing an existing account or granting owner access. Carry the visitor's answers forward so the next page does not restart the conversation. Identity proof, business setup and eligible connection steps belong to that same journey.

Phone forwarding, carrier requirements and a calendar permission may still have different technical prerequisites. Those dependencies do not require separate customer registrations. Do not replace the old memo with an unsupported claim that every channel turns on immediately. Show relevant status and next actions in the full setup at the point where they matter.

## Primary-source competitor observations

Read-only review of public pages on October 22, 2026. No account was created, form submitted, demo booked or authenticated onboarding completed. Public copy is evidence of presentation, not independent proof that a competitor delivers every claim.

| Source | What was visible | What we should learn |
|---|---|---|
| [Jobber signup](https://www.getjobber.com/sign-up/) | A business-outcome heading, a short no-card introduction, work email/password, optional social entry and a marketing-email checkbox distinct from its account Terms. | Keep the first step short; give account entry and marketing preference distinct purposes. Do not copy its trial promise into our billing-off setup. |
| [Goodcall public entry](https://ai.goodcall.com/get-started/) | A five-step progression opens with one business-phone lookup and an alternative for businesses without a Maps listing. | Ask progressively, explain the immediate benefit and preserve an alternative. Our current setup does not import a website/listing, so a lookup/autofill promise would be false. |
| [Goodcall homepage](https://www.goodcall.com/) | The page leads with the call-answering outcome, then illustrates building, testing and approving an agent. | Sell the customer result and show the path to a useful test. We must independently verify our own activation before making the same operational promises. |
| [Rosie start page](https://heyrosie.com/start) | An owner-benefit introduction and a single trial button. The public text snapshot does not reveal the full authenticated signup form. | Give the visitor one obvious action; do not assert unobserved form fields or copy unsupported comparative claims. |
| [Sameday contact](https://sameday.ai/contact) | A demo route explains the meeting and what follows into onboarding. | Set a clear expectation for the next step. A required sales meeting would conflict with our selected self-service outcome. |

These observations support a concise progressive entry. They do not establish that four fields is the optimal conversion point; that remains a measurable design hypothesis.

## Ready-to-use homepage copy

**Eyebrow**

YOUR NEXT JOB STARTS HERE

**Heading**

Stay on the job. Keep the conversation going.

**Introduction**

Tell us a little about your business. Then choose how your front desk welcomes customers, answers questions and gathers the job details.

**Form heading**

Let’s start with your business

**Fields**

| Label | Purpose | Recommendation |
|---|---|---|
| Your name | Address the owner naturally. | Required; use name autocomplete. |
| Work email | Save a usable contact path and later prove account ownership. | Required; accept valid business and personal email domains. Do not claim the address is verified at capture. |
| Business name | Connect the inquiry to the actual business and personalize setup. | Required; carry into the full business questionnaire. |
| What would help most? | Make the next example and setup relevant. | Optional; use the fixed goal choices below, with a neutral exploring choice. |

Trade, website, callback number, hours, service area and detailed rules belong in full setup. A fifth trade field is a reasonable implementation choice if the UI/UX review finds it useful, but it is not needed to save a contact and should not block the first step.

| Goal value | Customer label |
|---|---|
| `missed_calls` | Catch inquiries while I’m busy |
| `after_hours` | Handle after-hours requests |
| `booking` | Cut down on scheduling back-and-forth |
| `follow_up` | Keep track of follow-ups |
| `spanish` | Help customers in Spanish |
| `other` | I’m exploring |

These are desired outcomes, not active-channel entitlements. Do not infer that a visitor selected all-call answering, an immediate booking or SMS marketing from a goal choice.

**Button**

Continue to setup

**Next-step helper**

Next: personalize your front desk. No card required.

**Returning visitor**

Already started? Sign in to continue.

**Optional email preference**

Unchecked checkbox, copy version `email_updates_v1_2026_10_22`:

Email me practical tips, product updates and offers from Machines & Cloud. Unsubscribe anytime.

Keep the privacy link readable near the form. Do not merge this optional choice with Continue, mandatory Terms or SMS consent. This copy does not claim that anyone will call, text or email the visitor now.

## Signup copy and preference handling

The next page can introduce the full setup as:

**Make it sound like your business.**

Add your services, hours and the details customers usually ask for. Then try a conversation and adjust the answers before you put your front desk to work.

Keep a relevant channel's actual readiness visible before activation. A single journey should guide the necessary actions without a provider-configuration list in the acquisition card.

If the implementation requires an explicit verified preference confirmation, use an optional inline section rather than a separate mandatory stop:

**Email updates (optional)**

Use the same checkbox copy above, with the helper **You can finish setup either way.** A requested anonymous choice remains unconfirmed until the authenticated preference action required by the Architect's contract. Sign-in or verification alone must not subscribe the address. Do not add a second compulsory opt-in or use a preselected checkbox to imply a new choice.

## Capture and audience contract

The Architect owns the exact API/storage contract. Marketing requires these distinctions to remain visible in that design:

- A submitted name/email/business/goal is a lead, not proof of account ownership, permission to access a workspace or consent to marketing.
- Record the exact requested email preference and its copy/version, server timestamp and known first-party source. Never overwrite a known person's prior opt-out or verified preference through an anonymous repeat submission.
- Email verification is an account-security step. Promote marketing eligibility only through the explicit verified preference operation, and honor durable suppression before every eventual send.
- No text-message or call permission is implied. The preliminary form does not need a phone number.
- Keep contact details and handoff secrets out of query strings, public responses, logs and analytics. An opaque handoff must not let an anonymous visitor read an existing lead or account.
- The form must save successfully before claiming progress. A storage failure preserves the visitor's draft and presents a retry; it must not silently continue as if the lead was captured.

Our explicit opt-in audience policy is a product choice. The [FTC's commercial-email guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) explains truthful identity/subject, postal address, opt-out and suppression obligations, including for B2B email. No campaign or email send is activated by this review.

## Acceptance and measurement

UI/UX and QA should verify the rendered entry at 320px, 390px and desktop widths, including keyboard focus, labels, consent choice and error recovery. The end-to-end test starts at the homepage: submit → durable capture → carried answers on the full setup → verified entry → saved questionnaire → workspace. Existing-account attempts must not disclose ownership or overwrite saved data. An unchecked preference must remain unchecked, and a capture cannot send marketing mail.

The first measurement question is whether visitors reach a useful personal test with fewer repeated questions. Report capture, verification, setup and test counts separately. There is no measured conversion uplift, deliverability result, customer activation or publication claim in this research document; implementation and independent QA receipts supply their own bounded results.

## Pricing and FAQ copy alignment

The read-only copy review also returned four phrases outside the original signup card: “Planning allowance,” “Phone and texting need separate activation,” “Agree follow-up rules before activation” and “Connected services verified separately.” Leaving them on the same acquisition page would preserve the internal-memo tone Steve asked us to remove.

Root was given the following copy direction for the existing two choices, with all amounts and units unchanged:

- **Coverage:** for an owner who needs a hand while on a job; light or overflow call volume, answers based on the owner's services and fees, and customer details ready for review.
- **Follow-through:** more room for a busy front desk; higher call/message capacity, the owner's rules guiding the conversation and one place to review requests. Do not suggest automatic follow-up delivery is already working.
- Display the allowances directly as **150 call minutes · 500 outgoing texts** and **600 call minutes · 1,500 outgoing texts**. Generic “messages” could be mistaken for website-chat replies.
- Use one clear note before the lead form: website-chat preparation and private testing are available; activation requires review and is subject to daily AI limits. Phone, texting and calendar connections are not yet available. Choices share the same workspace, and setup starts no subscription or timed trial.
- Preserve the future-service estimate and unit detail: **$0.35 per call minute; $0.03 per outgoing text message**. A counted outgoing message may span multiple carrier segments. Paid terms require review before any charge.

FAQ answers should explain one setup/workspace, the current manual availability and CSV workflow, and unavailable direct connections in plain language. A required external connection is not a second customer account or a separate project for the owner. Do not hide unavailable phone/SMS/Calendar service until after lead capture, or invent a date for availability. Implementation and the final QA source hashes determine the accepted wording.

### Three public choices and the open allowance decision

The selected pricing presentation is now **Coverage at $99/month, Follow-through at $249/month and Enterprise with custom pricing**. Enterprise is a conversation for larger or multi-location home-service businesses: discuss locations, volume, existing tools and required workflow before quoting scope. Its existing contact link does not create a third self-service plan ID, purchase, subscription or operational multi-location feature.

The existing Coverage 150-minute/500-text and Follow-through 600-minute/1,500-text figures, plus the existing $0.35-minute/$0.03-outgoing-message estimates, are retained as **draft future-service usage estimates**. The latest pricing decision did not settle included usage, overage policy, provider-segment costs or paid entitlements. Those values must not be represented as newly approved commercial terms. Billing remains off; the owner must review concrete paid terms before charging is enabled. The public note labels the figures as future-service estimates and keeps phone, text and calendar unavailability visible before the preliminary form.

Marketing implemented the pricing/FAQ wording and the three-column desktop layout in `../index.html` and `../site-refresh.css`; existing mobile stacking is preserved. Structured data now lists three named offers without inventing a numeric Enterprise price, and its seven FAQ answers match the visible FAQ. Technical reference: [Schema.org Service offers](https://schema.org/Service) and [Offer](https://schema.org/Offer), checked October 22, 2026. Current rendered-layout acceptance remains the next QA checkpoint.

## PO and marketing review: retained returns

The earlier independent actual-handler browser receipt, `../scratchpad/acquisition-ui-qa-final.json`, passed 35/35 technical checks at its recorded stable source hashes. Its desktop/mobile rendered images show the short entry, carried business details and grouped connection preferences. This is local synthetic evidence, with a private fixture mailbox; it is not real email delivery or a customer conversion result.

Visual review returned two additional admin issues despite that technical pass:

1. A newly created self-service business appeared under **Needs me** with an “onboarding call promised within one business day” task. The self-service marker must exclude that legacy founder-call promise.
2. At 390px, the new inquiry table clipped the final **Email updates** column, hiding the distinction between a captured inquiry and a confirmed audience record. All inquiry columns must remain reachable without making the entire page overflow.

The observed images are `../scratchpad/acquisition-ui-qa-final-admin-390.png` and `../scratchpad/acquisition-ui-qa-final-admin-1440.png`. These returns and the pricing/FAQ language changes require a new source freeze and targeted/current browser proof. The earlier 35/35 receipt is retained, not relabeled as proof of those later corrections.

An earlier source audit of root HTML found no ordinary setup CTA bypassing the homepage form; its only non-sign-in direct onboarding link was then a no-JavaScript fallback. That fallback was subsequently removed because full onboarding also requires JavaScript. The final copy asks visitors to enable JavaScript. Sign-in remains a distinct returning-owner path.

## Final bounded PO and marketing acceptance

Marketing/PO accepts the selected **local acquisition and unified setup journey** on October 22, 2026. The customer now sees a business benefit, enters three essential contact/business details and an optional goal, and continues into one setup with those answers preserved. Email updates are an optional separate choice; verification alone does not enroll the address. The pricing cards speak to the owner's workload, preserve Coverage/Follow-through prices and introduce Enterprise as a custom-scope conversation without claiming working multi-location software. Availability and paid-service conditions remain visible before lead capture.

Acceptance uses the following distinct proof stages:

- [`acquisition-api-qa-projection-recovery.json`](../scratchpad/acquisition-api-qa-projection-recovery.json): **35/35** independent handler/storage-fixture groups for durable capture, identity, consent/suppression, retries and protected exports.
- [`acquisition-ui-qa-current.json`](../scratchpad/acquisition-ui-qa-current.json): **49/49** independent actual-handler local browser checks for capture → explicit link request → fixture mailbox proof → carried answers → saved questionnaire → one workspace, including recovery, truthful connection states and admin audience distinctions.
- [`acquisition-visual-qa-cta-final.json`](../scratchpad/acquisition-visual-qa-cta-final.json): **20/20** current-source visual/bridge checks. The six pricing widths are 320, 390, 768, 900, 1024 and 1440px; the entry remains contained; inquiry columns respond to keyboard horizontal scrolling. Reversing exactly the later pricing/pane CSS and two CTA-label changes reproduces the accepted 49-check source. The final receipt's source hashes match the files reviewed.
- [`acquisition-guided-qa-final.json`](../scratchpad/acquisition-guided-qa-final.json): **4/4** targeted checks after the real guided-navigation return. At 390px and 1440px, the connections heading is now below the fixed header before any capture helper scrolls the page.

Marketing/PO inspected the actual entry, verified first-step, connection, admin and final pricing captures. The narrow 768px cards and later 1024px wrapped CTA were returned and corrected: pricing stacks through 900px, while the two fixed-price cards use **Choose plan** with distinct accessible labels and unchanged plan links. The original guided heading defect is retained in `acquisition-guided-qa-before.json`; it was a real navigation problem, not only a cropped-image artifact. The earlier visual supplement's keyboard-scroll return is also retained; the final receipt records the successful interaction.

Final element clips suppress the floating header/launcher for legible visual review only. The guided viewport screenshots and heading geometry use the normal unsuppressed page; those establish that real navigation no longer hides the heading.

The former direct no-JavaScript fallback has been replaced with an honest JavaScript requirement, so it no longer suggests a working browser flow where scripts are unavailable. Returning-owner sign-in remains separate from preliminary acquisition.

This accepts the local customer entry and its reviewed recovery. It does not establish production email delivery, real customer conversion, actual Netlify storage behavior, activated phone/text/calendar service, a paid subscription or a sent campaign. The unresolved usage/overage decision above remains open. Publication, hosted functional proof and actual service delivery keep their separate evidence and authorization boundaries.
