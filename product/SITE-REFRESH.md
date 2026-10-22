# Site refresh: independent visual acceptance

Date: **2026-10-21**. PM owns the local browser record and `scripts/site-ui-check.mjs`; root owns publication and release evidence; engineering owns shared navigation; PO owns design acceptance. Starting local commit: `07241ef`. The original local review did not authorize deployment; Steve subsequently explicitly approved publishing `40a147b` plus the three pending commits in one additional build. Product-provider acceptance and billing remain outside this task.

## Published result

**Live and independently accepted:** [machinesandcloud.com](https://machinesandcloud.com), commit `40a147b871f160374c8dc2e2ef198ceb1d0fdca7`, deploy `6ad95e1f07f1b73d0733317c`. Netlify published it at `2026-10-22T00:52:13.360Z` (October 21, 7:52 p.m. Houston). The Git push started exactly one automatic build; no manual build or second production push was needed. [Publication ledger](../scratchpad/site-publication.json).

PM's bounded hosted check passes **62/62**, covering fresh desktop/mobile homepages, About and thank-you, 320 px resizing, closed/open navigation and focus, readable contrast, hero layout, channel examples, FAQ, widget open/close and CTA position. Five CSS/JS assets each had one hosted GET and matched the accepted local hashes; later page checks reused their fetched bodies. There were zero JavaScript errors, API attempts, non-GET requests or submissions. PO independently inspected the actual hosted desktop/390/320/open-menu images and read the report; appearance and bounded interactions are accepted. [Hosted report](../scratchpad/site-hosted.json), [method](../scratchpad/site-hosted-plan.md), [desktop](../scratchpad/site-hosted-1440.png), [mobile](../scratchpad/site-hosted-390.png), [open menu](../scratchpad/site-hosted-390-menu.png), [320 px](../scratchpad/site-hosted-320.png).

Root separately made one public health GET: HTTP 200, `ok: true`, no failing blocks. Its stored scheduler timestamp, `2026-10-22T00:50:17.912Z`, precedes this publication, so it does not establish a new-code scheduled run. Netlify's read-only form API confirmed both `contact` and `agent-lead` with the expected field names. [Health evidence](../scratchpad/site-hosted-health.json), [registered forms](../scratchpad/site-hosted-forms.json). No real lead, chat, call, text, email or Calendar action was sent for release verification. Provider delivery, actual form delivery, live storage contention and first-shop gates remain open.

The earlier sections below retain their local/prepublication scope and failures. A subsequent local documentation commit records this release without triggering another build.

Additional root rendering check: actual Inter and Space Grotesk web fonts loaded successfully, with no page overflow or clipped headline at 1440/865/390/320 px. Root inspected the font-loaded desktop/mobile images. This complements the main suite's blocked-font fallback checks; it made no API request or submission. [Font results](../scratchpad/site-font-check.json), [desktop](../scratchpad/site-font-loaded-1440.png), [mobile](../scratchpad/site-font-loaded-390.png).

## Public first-open evidence

The PM opened the public homepage in a fresh, unauthenticated headless Chrome context at **1440×1000** and **390×844**, then made one additional authorized **865×1000** tablet-width capture. No forms or chats were submitted, no authenticated browser was used, and no further public captures are planned for this task.

**An automatically open drawer was not reproduced.** At all three fresh widths the body lacked `nav-open`; the desktop navigation was inline, and the two mobile/tablet drawers were translated completely outside the viewport. This result does not explain the user's earlier browser state.

Confirmed defects in the deployed appearance/state:

- At mobile/tablet widths the menu panel computes nearly white while ordinary menu links compute white, inherited from the photo-hero selector. Opening it produces a readability risk independent of whether it opened automatically.
- The closed mobile menu has no `aria-hidden`, `inert` or toggle-expanded state. Its links are merely moved offscreen rather than removed from keyboard/accessibility navigation.
- The hero uses a large deliberately blurred background photo with white copy and a translucent navigation treatment. Text legibility depends on the image below it; the logo/menu/hero lack a consistent solid reading surface.

Evidence: [desktop/mobile diagnostic](../scratchpad/site-before-public.json), [desktop first open](../scratchpad/site-before-public-1440-first-open.png), [mobile first open](../scratchpad/site-before-public-390-first-open.png), [tablet diagnostic](../scratchpad/site-before-public-tablet.json), [tablet first open](../scratchpad/site-before-public-tablet-865-first-open.png). Full-page captures use the same prefixes. Public first-open below-fold reveal sections may remain unrevealed; those captures document the initial state, not a completed scroll-through.

Local before captures are [site-before-local.json](../scratchpad/site-before-local.json), [desktop](../scratchpad/site-before-local-1440-first-open.png) and [mobile](../scratchpad/site-before-local-390-first-open.png). Their source hashes/time are recorded separately because public production and current local code are not assumed identical.

## Acceptance plan

Use a fresh headless browser and root's isolated local server. Only local GET requests reach the server; all `/api/` requests, other non-GET requests and external requests are blocked. Optional local form simulations fulfill their synthetic POSTs inside Playwright, forwarding none. Other interactions never submit a form, send a chat request, call a provider or start a model. The reusable script does not load `.env` or start a server.

| Area | Required rendered behavior |
|---|---|
| Fresh navigation | Closed mobile drawer at 320, 375, 390, 768, 865 and 1024 px; visible inline navigation at 1025 and 1440 px; correct toggle state and no offscreen focusable menu. |
| Open/close control | Enter/Space toggle, explicit close, Escape, overlay click and link activation work. Focus enters the panel, Tab/Shift+Tab remain within it, and closing returns focus. Page background is inert only while open. |
| Lifecycle | A scrolled opening retains the opaque header and restores prior scroll on close. Both sides of 1024↔1025 reset state/focus/scroll lock. A page-show reset cannot retain an open drawer. |
| Readability/layout | Opaque panel with dark text/blue controls, readable hero on a solid surface, no horizontal overflow at every tested width, no clipped controls/heading, and usable mobile tap targets. Inspect actual screenshots rather than infer all contrast from CSS. |
| Core pages | Homepage, About and thank-you share working navigation; one unchanged dark SEO representative retains usable navigation and content. Preserve routes and existing form names; never submit. |
| Main journey | Homepage CTA reaches the pilot form; Plans/See-it-work anchors reach their sections; all three product-example buttons update the visible example and owner summary using mouse and keyboard; FAQ works with keyboard. |
| Accessibility basics | Heading and key content are visible immediately; focus is visible; reduced-motion operation is stable; no-JavaScript core copy, links, form labels and native FAQ remain usable; no JavaScript errors. This is a bounded accessibility check, not a complete audit. |
| Truthful copy | Examples are visibly illustrative, not customer proof. No unsupported statistics, live-FSM or multi-number claims. Plan amounts occur only in homepage Plans, and About has no repeated pricing. PO owns substantive claim acceptance. |

## Verification status

The first implementation run is preserved in [site-refresh-first.json](../scratchpad/site-refresh-first.json) with 445 checks. The PM returned real visual defects shown in its screenshots: desktop owner card covered the photo caption; the mobile chat launcher covered job details; and the 320 px window detail wrapped its final digit separately. PO independently found the same defects. That run also caught `index.html` changing while tests ran, so it is not a stable-source acceptance result. Its CTA assertion incorrectly required a URL-hash update even though the existing handler intentionally scrolls without updating history; the PM corrected the harness to measure the target's actual rendered position.

After layout/copy corrections, the stable-source run in [site-refresh-final.json](../scratchpad/site-refresh-final.json) executed **509 checks** and returned one actual issue: the CTA still requested animated scrolling under `prefers-reduced-motion`. The recorded position changed from 0 to 39 px within 100 ms. All navigation, contrast, caption/card separation, whole-window-line, widget accessible-name/open/close, no-JavaScript, example-switch and form-contract checks passed; no JavaScript errors occurred.

The optional form checks were explicitly local simulations: Playwright fulfilled two POSTs itself, one 503 and one 200, and forwarded neither to the server. They verified value retention/retry on error and onboarding prefill with a blank optional website on success. Read-only page checks made no submissions. No form, chat, provider or model request reached an external service.

The PM and PO inspected the corrected desktop/390/320 first-open and full-page captures, About, example/plan/form renders and readable menu. Caption overlap, launcher obstruction and split window text are resolved in those images. PO's visual/copy acceptance is satisfied.

### Final local result

**Independent PM acceptance: PASS, 509/509 checks**, after engineering corrected the imperative anchor handler to respect reduced motion. The distinct [accepted report](../scratchpad/site-refresh-accepted.json) preserves the final result; both earlier reports remain unchanged. The final run completed on October 21 at 7:41 p.m. Houston time. Reduced-motion CTA position was **6857 px immediately and 6857 px after 100 ms**.

The final run covered all eight widths across the homepage, About, thank-you and the unchanged dark Anaheim SEO page, plus no-JavaScript homepage checks at 390/1440. It passed drawer state/contrast/focus/close routes, both breakpoint directions, page-show reset, scrolled scroll restoration, overflow, hero geometry, widget name/open/close without sending, three keyboard-operated channel examples, native FAQ and actual CTA target positioning. The PM inspected the resulting desktop/320 first-open and 390 full-page images; PO independently inspected the corrected layouts and copy. No blocking visual or interaction issue remains within this scope.

There were **zero JavaScript errors, zero API attempts and zero ordinary form submissions**. All 39 blocked requests were Google Fonts stylesheet GETs. Two optional synthetic form POSTs were fulfilled entirely inside Playwright (503 and 200), with **zero forwarded to the local server or an external service**; error retention/retry and exact onboarding prefill with blank website passed. These simulations establish browser behavior, not real Netlify form delivery or product onboarding completion.

The nine recorded frontend files stayed unchanged throughout the run. Git baseline was `07241ef394b5f6e317f7764fbd14cceadda22d62` with the refresh present as local changes. The SHA-256 of `JSON.stringify(report.source)` is `f6eb3d7c4ff5fc1eddaace5e6823b7687ce9cef58ac20b639515e56b7a6f0f01`; individual hashes are in the report. Final `script.js` is `640f32acff2347f75b2ccc97ed09a2408474ad9929399243762bc5c8a8b93d14`.

Review images: [desktop](../scratchpad/site-refresh-accepted-home-1440-first-open.png), [desktop full page](../scratchpad/site-refresh-accepted-home-1440-full.png), [390 px mobile](../scratchpad/site-refresh-accepted-home-390-first-open.png), [320 px mobile](../scratchpad/site-refresh-accepted-home-320-first-open.png), [open drawer](../scratchpad/site-refresh-accepted-390-menu-open.png), [About mobile](../scratchpad/site-refresh-accepted-about-390-first-open.png), [thank-you mobile](../scratchpad/site-refresh-accepted-thank-you-390-first-open.png).

Reproduce against an already-running isolated local server, using an installed Playwright module:

```sh
node scripts/site-ui-check.mjs --base http://127.0.0.1:8893 --output-prefix scratchpad/site-refresh-accepted --intercept-form-check --playwright /absolute/path/to/playwright/index.mjs
```

This is local rendered acceptance and a bounded accessibility check. No deployment, external form/chat delivery, provider/model evaluation or complete accessibility audit was performed. Public production has not changed as part of this verification.

## October 21 Houston / October 22 UTC: one menu close control (local)

Steve returned the redundant visible “Close menu” button beside the header X. The generated text button and its CSS are removed. The header X remains the single close button; Escape, backdrop and selected navigation links still dismiss the menu. Keyboard focus includes the X and menu links. The open dialog boundary now encloses both controls and restores the navigation's original role/name on close or desktop resize.

The required Netlify build command passes in [the local build receipt](../scratchpad/menu-single-close-build.json); syntax checks and [all182-page site references](../scratchpad/menu-single-close-sitecheck.txt) pass. Independent QA reused only the existing menu acceptance function on320/390/1024/1440 homepage and390 legacy navigation, with networking and API/model calls blocked. Its [raw receipt](../scratchpad/nav-single-close-qa.json) preserves an extra collector's hidden-sales-dialog mismatch separately from the passing navigation behavior; the [targeted visibility-aware boundary receipt](../scratchpad/nav-single-close-qa-boundary.json) passes6/6 and resolves that observation without claiming the full matrix was rerun. This is local browser/DOM proof, not a complete screen-reader audit or deployment.

The pending, unopened sales-model plan is refreshed for the navigation-only CSS change. Its request caps and provider guard are unchanged; no model call or publication is created by this UI fix.
