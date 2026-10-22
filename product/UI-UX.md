# UI/UX engineering mission

The UI/UX engineer owns whether a customer can understand and complete the product’s main journeys with confidence. This role works with the Product Owner, Architect, Engineer, QA and Marketing/Sales; it does not treat a working API or an approved screenshot as proof of a usable product.

The ongoing mission is to turn customer jobs into clear language, short forms, coherent navigation and reliable interactions. Start with what the customer wants to do, reveal the next useful detail at the right moment, carry answers forward, and make recovery straightforward. Keep mobile, keyboard access, loading, empty states and errors part of the design from the beginning.

For every delivery, record the customer job, the current obstacle, the proposed interaction, and what was observed in the browser. QA independently checks the journey; the PO accepts the customer outcome. Public competitor experiences and operator feedback inform decisions, with evidence and dates recorded by the owning research role. Never invent customer research or claim that a competitor’s flow has been completed when only its public entry page was observed.

## Acquisition and onboarding, October 22, 2026

Customer job: tell Machines & Cloud about the business, continue into a personalized setup, and understand what can be used without reading an operational memo.

The homepage now asks four preliminary questions: name, work email, business name and the main job the owner wants help with. It saves this explicit submission before navigating to full setup. The email-updates checkbox is optional and starts unchecked. The page carries an opaque handoff token; personal information is never added to the destination URL. The full setup requests a secure email link only after an explicit click. Verified identity remains the boundary for adopting answers into a private workspace.

Full setup presents one business journey: your front desk, your business, prices and schedule, and your preferences. Desired website, phone, text and calendar connections are choices in that journey, not separate signup flows. These preferences do not provision or activate a service. A concise availability note explains that website chat can be prepared and tested while the other connections remain unavailable. Existing safety and activation requirements stay in force.

Implementation files: `index.html`, `site-refresh.css`, `signup-intake.js`, `onboard.html` and `onboard.js`. The Architect owns capture, verification, consent records and tenant metadata; Marketing/Sales owns positioning and campaign readiness; Root owns workspace connection presentation and build integration. Local browser proof and independent QA must be recorded before claiming this journey accepted. No actual email, provider setup, model call or publication follows from this local implementation.

## Review evidence and returned issues

Engineering’s initial browser fixtures passed 40 checks. The follow-up passed 45, adding current-plan preservation and optional-goal coverage; both receipts and their distinct source hashes remain in `scratchpad/signup-intake-ui-first.json` and `scratchpad/signup-intake-ui.json`. These tests used injected API responses rather than actual capture or account handlers.

Independent QA then exercised the real handlers with in-memory storage and a private synthetic mailbox: homepage submission → durable lead → explicit email-link request → verified answers → saved questionnaire → workspace. `scratchpad/acquisition-ui-qa-final.json` passes 35 checks with stable source hashes, no page errors and no server outbound requests. UI/UX reviewed its desktop homepage, mobile connections and mobile administration captures. The entry card and carried answers meet the selected local acquisition outcome. Actual email delivery and production account behavior remain separate proof stages.

The integration review returned specific workspace and administration issues before final acceptance: connection choices must explicitly read as preferences rather than activation controls; a saved active website flag must not produce “Connected” when current readiness or the AI allowance blocks service; an unselected website should not appear mandatory for a phone/calendar preference; a new self-service shop must not generate a legacy promised onboarding-call task; the mobile inquiry list must expose the email-update eligibility column; and CSV wording must not imply a verified native Jobber/Housecall Pro import. Root owns the corrections, followed by QA’s targeted rendering and source bridge. The initial 35-check pass does not establish acceptance of those later corrections.

A separate questionnaire recovery improvement was identified by source inspection: the contact-cell field is required but has no browser format check, while the server rejects an invalid US number only on final account creation. A final validation error currently highlights the field without returning to its earlier fieldset. Validate a callback number before leaving its step and reveal the relevant field whenever a server field error occurs. This observation is not a reproduced browser failure or a claim that the correction has shipped.

## Callback-field recovery: bounded acceptance

The earlier recovery observation is now repaired locally. Root's `scratchpad/onboard-recovery-ui.json` passes **16/16 browser fixture checks** at stable `onboard.html`/`onboard.js` hashes. Invalid callback formats remain on the first step with focused guidance before account creation; accepted US formats advance. A named final server error reveals and focuses its original field, preserves the rest of the questionnaire and retains the error message. Correcting the field clears its stale invalid marker. Nested business-name errors target the business field; an unknown field leaves the current step readable.

Independent actual-handler journey receipt `scratchpad/acquisition-ui-qa-current.json` additionally passes its early invalid-callback and final named-field recovery checks as part of **49/49** local assertions. The final field error is deliberately injected before the real onboarding handler; it establishes browser recovery, not a claim that a genuine provider or production validation failure occurred. Marketing/PO reviewed the receipt and the retained recovery image on October 22, 2026 and accepts this bounded recovery outcome. No real email, AI request, provider operation or deployment is implied.

## Final local interaction acceptance

Marketing/PO completed the customer-copy and rendered acceptance after the original UI/UX agent's review. The reviewed source now has one short acquisition form, preserved answers, optional email preference, one full setup and one place to choose connections. Independent actual-handler browser proof is **49/49** in `scratchpad/acquisition-ui-qa-current.json`; this is broader functional proof than the earlier injected frontend fixtures.

The final visual bridge `scratchpad/acquisition-visual-qa-cta-final.json` passes **20/20** and exactly accounts for the later pricing/pane CSS and two pricing CTA labels. Pricing was reviewed at 320, 390, 768, 900, 1024 and 1440px. The original cramped tablet cards were returned; a single column through 900px and short, distinctly labeled **Choose plan** buttons now keep actions readable. The new admin inquiry table keeps its columns inside a labeled, keyboard-scrollable region; all inquiries and marketing-eligible exports remain distinct.

The clipped **Your connections** heading was investigated through the real guided action, before screenshot helpers. `scratchpad/acquisition-guided-qa-before.json` retained the actual failure: the mobile heading began at 15px, under a fixed header ending at 69px. The pane now has a 100px scroll margin. `scratchpad/acquisition-guided-qa-final.json` passes **4/4**; the heading begins at approximately 115px on mobile and 121px on desktop, below the same header. Marketing/PO inspected the corrected viewport capture and accepts the guided navigation.

This closes the selected local UI returns, including early callback validation and earlier-field recovery. It does not establish production signup/email delivery, activated provider connections, marketing effectiveness, actual AI quality or publication. Those remain distinct product and operational acceptance stages.
