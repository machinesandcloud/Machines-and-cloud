# UI/UX next work — October 22, 2026

There is useful work left. Keep the new application design and improve completion, trust and everyday customer work. Another visual redesign is not the next priority.

## Review boundary

Reviewed the published application source at `05e8c5c34656f3257af8a8d3d7e8523dcbd542b3` in `/tmp/mc-campaign-redacted-e997`, the current role/status documents, the retained public capture manifest and the earlier portal interaction evidence. Inspected the desktop workspace, mobile requests and desktop admin screenshots from `portal-revamp-qa-all-final`. Those screenshots contain synthetic fixture accounts; they are not observed production customer usage. The public capture confirms the HTML and selected CSS/JS served in the approved release. No authenticated journey was repeated in this review.

No site/Netlify request, browser account action, email, call, model request or provider change occurred. The earlier 25-request site/Netlify allowance remains closed. Primary-source competitor/accessibility research below is separate public research, not access to their private products.

## 1. Make business-rule editing as reliable as signup

**Priority: P0, first implementation slice. Customer job:** correct a service, business hour or callback destination without losing work or receiving a misleading success message.

**Source-confirmed gap:** the onboarding form now has field errors, but its workspace counterpart does not carry the same interaction contract. In the published source, `desk.html:64` has the business editor and callback input without equivalent required/telephone validation. `desk.js:423–430` sends a whole-form update and presents a single bottom-of-form status. The handler at `netlify/functions/client.mjs:115–124` retains the previous name/phone when those new inputs are empty or invalid, while it can save empty trade, service area, services and arrival windows. Saving an incomplete draft may be legitimate; silently retaining a supplied invalid callback and presenting unqualified success is not a clear contract. Broad readiness blockers arrive later through `netlify/functions/lib/setup.mjs:17–18`.

There is also a pending-save hazard: `desk.js:430` clears `cfgDirty` after a successful request, then reloads. `desk.js:375–385` protects the current editor only while `cfgDirty` is true. New typing made after submission can therefore be replaced by the reload. These are source findings; this audit did not run a new browser reproduction or claim production data loss.

**Deliverable:** a coherent edit/save/recovery interaction shared by owner and operator corrections, built on the current application shell. Distinguish invalid input from a deliberate optional blank. Show the exact field error, keep the attempted value and move focus to the first invalid field. Keep a new edit made during a save visibly unsaved after that earlier snapshot succeeds. On a revision conflict, preserve the edit and offer a clear reload/review action rather than silently overwriting another tab.

**Acceptance:** invalid supplied callback input never produces an unqualified “Saved”; an incomplete draft is either rejected with corrective field text or explicitly saved as incomplete with its remaining work visible; optional blanks work; server field errors reveal their section; slow saves preserve later typing; a second click cannot create overlapping ambiguous saves; conflicts retain edits; success/error status is announced. Existing review and activation guards remain intact. Independently exercise keyboard and 320/390/1440px layouts with the actual handler and isolated storage.

**Dependencies:** Architect defines field-validity and partial-update semantics before Engineer changes the handler. QA first reproduces the exact silent-retention and pending-edit cases. Do not fix only the frontend while leaving an inconsistent server contract. No Twilio activation is needed.

[W3C form notification guidance](https://www.w3.org/WAI/tutorials/forms/notifications/) supports field-associated feedback and focus recovery. This is accessibility guidance, not evidence of a competitor defect.

**Independent reproduction update, 4:32 p.m. Houston:** [QA's separate receipt](../scratchpad/next-work-workspace-save-qa.json) reproduces both defects, **2/2**, using the exact published workspace assets and actual handlers against isolated memory storage. After holding a save response, the submitted name replaced newer typing when that response completed. A supplied alphabetic callback returned HTTP 200, restored the previous number and displayed “Saved” without a field error. Source hashes stayed stable; physical network requests and page errors were zero. The retained first attempt includes an unsuccessful test assertion before the final two-case result. These passes confirm defects, not a repair or any production customer data loss. The source audit above and this independently executed browser/handler proof are distinct evidence stages. Sprint19 should return both cases to QA after implementation and test the broader editing/recovery criteria above.

## 2. Finish website installation with a verified first result

**Priority: P1, alongside production signup acceptance. Customer job:** get the front desk onto the business website and know that an actual visitor can use it.

**Current gap:** the published install card at `desk.html:114` offers a script and generic “paste before body or send to whoever runs your site” instructions. `desk.js:294–297` copies it, and `desk.js:263` tells the owner to open their site and check. No installation receipt or first public conversation is part of this card’s completion state. An active backend flag is useful, but it does not prove the widget was installed on the correct customer domain. The selected-channel coordinator and Google continuation already exist; do not rebuild them or replace honest gate-off states with optimistic progress.

**Deliverable:** a short installation flow: confirm the customer domain, choose the website platform, follow platform-specific instructions, then check installation and see the result. Begin with the platforms actual prospects use; retain the generic snippet. Show separate facts for business rules ready, website chat activated, widget observed on the approved domain, and first customer request received. A copied script or owner checkbox must not certify installation. Add a safe handoff package for the customer’s web specialist without owner-session tokens or unrestricted portal access. Prepare an assisted-install option only after PO/Marketing validate scope and price; do not promise an available paid specialist today.

**Acceptance:** an owner starting with no installed widget reaches the correct next step; a missing widget, mismatched domain, blocked script and inactive service produce distinct recoverable guidance; installation does not complete on Copy; a recorded check states its evidence and time; one visitor-side question/request reaches the right tenant’s Conversations/Requests in a scoped acceptance test. Keep practice, activation and live website proof distinct. Pause/allowance failures must remain visible after installation.

**Dependencies:** Architect defines a tenant-bound installation receipt and protects any URL checker from private-network fetching. Engineer/QA can build and test the flow with isolated website fixtures immediately. Actual hosted signup/storage remains separately unaccepted; real activation or a model-backed conversation needs a concrete bounded test scope. Phone/text carrier approval is not a dependency for building this slice.

[Intercom’s official installation guide](https://www.intercom.com/help/en/articles/167-install-intercom-for-visitors-and-leads-on-web) offers methods for several website platforms and a separate installation check. Its [WordPress instructions](https://www.intercom.com/help/en/articles/173-install-intercom-on-your-wordpress-site) include confirming the correct site. The applicable pattern is verified installation with tailored instructions; this review did not complete an Intercom signup or establish a supported automatic installer for our product.

## 3. Turn collected requests into work the owner can finish

**Priority: P2 after safe signup/editing, design can start now. Customer job:** see what needs a response, contact the right person and record what actually happened.

**Current gap:** published `desk.js:344` renders “Needs you” as customer/outcome/reference text with an optional Acknowledge action. `desk.js:368–370` renders booking and lead tables; there is no request-detail action with its related transcript, contact action, next step and completion result. The inspected mobile fixture shows readable record cards, but the useful next action is missing. The PO already tracks this as later follow-up outcome B in `PRODUCT-STATUS.md`; adopt that work rather than opening a duplicate feature.

**Deliverable:** a mobile-friendly request detail reached directly from Overview and Requests. Bring together the issue, contact details, requested timing, original conversation and a clear next action. Start with one owner identity, callback/visit/quote intent, due time and honest outcomes such as attempted contact, reached customer, follow-up due, visit arranged or closed with reason. Acknowledge means seen/owned; it does not mean the customer was reached. Tapping a phone number does not prove a completed call. Display manual completion as owner-reported.

**Acceptance:** open a request from the attention list; recover its context without manually matching reference IDs; place a deliberate call through a phone link; separately record an attempted or completed contact; preserve history and any next due time; retain overdue work until the real obligation changes; reload and see the same result. Check concurrent edits, tenant separation, keyboard focus and the full mobile detail view. Report calculations must use the correct outcome, not acknowledgment.

**Dependencies:** Architect/PO agree the commitment and outcome contract; Engineer adds actual owner-session endpoints and audit; QA verifies the complete request-to-outcome journey. Existing `trackCallback` and `runCallbackCheck` exclude v1 self-service, so do not claim the old legacy timer already governs these new workspaces. The legacy acknowledgment/report conflation is a separate migration/regression concern. No phone/SMS delivery must be enabled to build and use manual web-request follow-through.

[Jobber Request Basics](https://help.getjobber.com/en/articles/request-basics/) describes requests as actionable work with statuses and activity history. That supports the list-to-detail-to-outcome pattern; it does not imply we should copy its full field-service suite.

## Next team handoff

PM can cut the rule-editing repair from the independently reproduced cases now, while QA prepares fresh production signup acceptance and OM follows the existing Twilio ticket. UI/UX should prototype installation completion and request detail with the current tokens/navigation. The next review should judge successful tasks and recovery in the browser, not another screenshot-only approval. The existing unified onboarding, contextual guide, labelled mobile navigation and admin attention hierarchy remain useful foundations.
