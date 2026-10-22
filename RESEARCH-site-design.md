# Marketing site design review

Observed **October 21, 2026**. Product Owner owns the design/product verdict; root owns homepage/About and `site-refresh.css`, engineering owns shared navigation, and PM independently exercises the browser. This review concerns the marketing pages and shared navigation. It does not establish product deployment or provider readiness.

The repo's current `CLAUDE.md` governs the work: white rather than beige, existing company assets, no invented statistics/testimonials/customer logos, prices once in the homepage plans, one founder sentence, working Netlify form attributes, retained SEO pages and no push/deploy. Steve's request for this redesign supersedes the older blurred-photo hero choice. It does not authorize copying a competitor's assets or opening accounts.

## Sources and method

All sources below are official marketing pages, retrieved October 21. They do not expose a publication date; an observation date is not a publication date. Their customer counts, testimonials, security claims and performance claims are vendor statements, not independently verified outcomes.

| Site | Official pages reviewed | Visual evidence |
|---|---|---|
| Rosie | [Homepage](https://heyrosie.com/), [pricing](https://heyrosie.com/pricing) | Fresh Chrome desktop and mobile captures; rendered first screen and full-page screenshots. |
| Sameday | [Homepage](https://sameday.ai/), [pricing](https://sameday.ai/pricing) | Fresh Chrome desktop and mobile captures, including the first-visit privacy overlay. |
| Goodcall | [Homepage](https://www.goodcall.com/), [pricing](https://www.goodcall.com/pricing) | Fresh Chrome desktop and mobile captures; computed typography/control styles. |
| Jobber | [Homepage](https://www.getjobber.com/), [pricing](https://www.getjobber.com/pricing/) | Official content retrieved through web tooling. Fresh Chrome received HTTP 403/“Just a moment”; rendered marketing typography, colors and mobile menu behavior were **not verified**. No challenge was solved or bypassed. |

Public browser contexts were fresh, unauthenticated and used 1440×1000 desktop and 390×844 mobile viewports with reduced motion. No contact form, signup, phone link, voice demo, consent choice or purchase was submitted. No competitor assets were copied into our site. Dated [raw observations](scratchpad/site-design-competitors/observations.json) are retained with the research. Competitor PNGs are a **local archive**, excluded from the committed screenshot set: `scratchpad/site-design-competitors/<site>-desktop.png`, `<site>-mobile.png` and corresponding `-full.png` captures. They show an observed page state, not an exhaustive audit of every animation or interaction.

The three accessible competitors' pricing pages were also captured at both widths; [pricing observations](scratchpad/site-design-competitors/pricing/observations.json) are retained, and their PNGs remain in the local archive. PM's separate [site baseline](product/SITE-REFRESH.md) did not reproduce an automatically open drawer in a fresh public visit. It did confirm pale/white menu links on a nearly white mobile panel, offscreen links remaining focusable and the deliberately blurred hero. Fix those evidenced defects while testing the reported first-open state; do not claim its exact cause is established.

## Practical observations

### Rosie

The white header separates the purple logo/links from the pale lavender hero. Desktop navigation has product/resource groups, pricing, login, phone and a filled trial action. Its category is immediately explicit; a large left heading and short benefit list explain the product beside a phone visual. Computed heading typography was Outfit, 53 px desktop and 42 px mobile, with dark plum text. The filled purple CTA is visually distinct from ordinary links. Customer quotations and an aggregate proof strip follow the hero; those are Rosie's claims, not material we can borrow. Mobile starts with the menu closed, stacks text before the visual and retains generous side margins without horizontal overflow. Its detailed hero pushes the visual below the first mobile screen. [Homepage](https://heyrosie.com/).

The separate pricing page groups tiers around a customer type, a clear allowance and a short capability list, with one emphasized middle tier. The useful pattern is understandable comparison, not reproducing every feature badge. [Pricing](https://heyrosie.com/pricing).

**Use here:** explicit product category, readable surfaces, an unmistakable action and compact plan comparison. Keep our first mobile screen shorter.

### Sameday

Its current first screen still uses a blurred trade-location photo, blue sky, centered mixed dark/white headline and a voice-demo action. The earlier repo imitation was based on a real pattern, but the image treatment is optional branding, not a usability requirement. Desktop navigation is broad, with dropdowns, pricing, login and a contrasting start action. Computed headline size was 64 px desktop and roughly 33 px mobile. The next section uses product/workflow representations, customer logos and approval states to make a broad platform tangible. Those features and customer claims cannot become ours through visual imitation. In the fresh mobile visit the privacy panel covered the voice action and much of the first screen; no choice was submitted. The mobile header retained a start action and closed menu. [Homepage](https://sameday.ai/).

Pricing has a dedicated minutes selector and separate tiers. That is a different purchase model from our deliberately simple three-card comparison. [Pricing](https://sameday.ai/pricing).

**Use here:** clear trade relevance and tangible outcomes. Avoid copying its blur, oversized empty hero space or first-visit obstruction.

### Goodcall

A solid navy header and hero, white text and turquoise actions make the hierarchy clear without relying on photography. Navigation is short: explanation, pricing, login and one build action. A large left headline sits beside a crisp product-style conversation card. Computed heading typography was Plus Jakarta Sans, 80 px desktop and about 47 px mobile; the mobile stack places the action before the card. The initial mobile menu is closed, the header retains its primary action, and neither viewport overflowed. Its interactive example exposes build/capture/book stages rather than making users imagine an invisible service. This is demonstrative UI, not independent proof of a production call. Lower-page origin/security statements are vendor claims. [Homepage](https://www.goodcall.com/).

The separate pricing page explains its billing unit before tier details and repeated objections. We should explain our own allowance clearly while preserving the site's rule that amounts appear only in the homepage plans. [Pricing](https://www.goodcall.com/pricing).

**Use here:** disciplined contrast, a small navigation set and an immediately understandable owner-facing result. Keep our own brand, photo and UI language.

### Jobber

The retrieved homepage leads with a service-business outcome, a short platform explanation, trial and plan-finding actions. App-review proof and named customer material lead into workflow categories and product images; this supports a larger established platform. We cannot manufacture an equivalent logo wall or imply the same operating scope. Its separate pricing page is directly reachable from the homepage, making commercial information discoverable. These are content/structure observations only. Because the public browser returned a challenge, this review does **not** claim current rendered colors, type measurements, menu state, image sharpness or mobile quality. [Homepage](https://www.getjobber.com/), [pricing](https://www.getjobber.com/pricing/).

**Use here:** organize around the owner's job and make plans easy to find. Our demonstration and explicit operating rules must carry the explanation until genuine customer proof exists; absence of proof is not a reason to invent it.

## Selected direction for Machines & Cloud

**White canvas, dark navy type and one blue action color.** Keep enough whitespace to separate decisions, with a visible layout grid and restrained borders. Avoid beige, pale links over white, frosted text surfaces and whole-hero blur. Use the existing dark logo on a fully opaque white header; it must be legible on first paint, during scroll and over any page background.

The first screen should answer three questions: what is it, who is it for, and what does the owner do next? Root's selected direction is coherent: a clear AI-front-desk category, the benefit headline **“Your next job starts with an answer.”**, short supporting copy, one pilot action and a quiet route to the working example. Place a crisp existing HVAC photo beside the copy, with a small owner-notification treatment that explains the result. Text must remain readable without the image; the notification must not become a tiny illegible prop or pretend to be a live customer's activity.

Use one strong type hierarchy, not competing display styles. Suggested range: roughly 56–72 px desktop heading, 36–44 px mobile, and 17–20 px body text; final sizing follows actual wrapping rather than a rigid font-number target. Limit paragraphs to readable line lengths and keep the primary action in the first screen on ordinary mobile sizes. The desktop photo/product treatment moves below the copy on phones.

The page sequence should be short and coherent: hero → three owner benefits → one interactive channel example → plans → operating rules/FAQ → pilot form. Consolidating five statistic cards and four long repeated demonstrations improves comprehension. Do not reintroduce a separate “How it works” section that Steve previously removed. The existing channel example can show the customer exchange and corresponding owner summary; use static first-visible content, clear controls and reduced-motion behavior. It must not look like an input field that does nothing.

Give a preferred plan a restrained recommendation treatment, not “Most popular” without actual sales evidence. Recommendation is our judgment; popularity would be a customer-behavior claim.

About should use the same header, spacing, type and action styles. Explain the business and service clearly, retain the authorized founder sentence/real portrait and contact details, and avoid another competing sales page. No duplicated amount, fake team image, invented client story or unsupported platform promise. Photo license or vendor use does not make an image a photo of our team or customer.

## Acceptance priorities

| Priority | Customer-visible requirement | Evidence required before PO acceptance |
|---|---|---|
| P0 | Opening the site shows content, not an accidental open drawer or translucent white navigation. | Fresh-context screenshots at 320/390 mobile and desktop; initial drawer closed, visible header/CTA and readable type. Also inspect first paint with JavaScript unavailable. |
| P0 | Navigation behaves predictably. | Menu open/close, Escape, outside click, selected link, keyboard focus, ARIA state and mobile→desktop→mobile resize all work; no hidden links receive focus or trap scrolling. |
| P0 | The hero is sharp, readable and useful. | Actual desktop/mobile image review; no image/text collision, blurry backdrop, clipped headline, giant empty region or obscured CTA. Block images/fonts to confirm the message still works. |
| P0 | Marketing claims match the product. | No invented proof/statistics, universal lead-distribution claim, unverified speed guarantee, native Jobber/Housecall Pro sync or unbuilt multi-number promise. Amounts appear once in the homepage plans and not on About. |
| P1 | The demonstration shows a concrete result. | Each channel switch changes the visible conversation and owner outcome; first content exists without waiting for animation, keyboard controls work, reduced motion is respected, and there is no fake text-entry affordance. |
| P1 | The page is comfortable on a phone. | No horizontal page overflow at 320/390 px; readable body copy, usable touch targets and no menu/widget/sticky action covering the form or content. Main controls should be at least 44 px high. |
| P1 | Interested owners can reach the next step. | Plans, example, About and pilot links land at useful positions below the fixed header. Form labels, required fields and Netlify attributes remain intact; test validation without submitting. |
| P1 | Simplification does not break the surrounding site. | About and representative light/dark SEO pages retain working shared navigation; footer links and local links pass. SEO pages, canonical/schema purpose and hidden form registration remain preserved. |
| P2 | The visual system stays coherent below the hero. | Review full-page desktop/mobile captures for consistent gutters, headings, card density, photo crops, plan hierarchy, FAQ and footer. Avoid fixing only the first screenshot. |

PM runs the isolated local browser checks with model/provider requests blocked. PO independently inspects the actual rendered desktop/mobile screenshots and returns visual/product issues until the result meets these priorities. Code checks, a successful build or an attractive competitor screenshot do not establish our rendered result. This review authorizes no push, deployment, production form submission or provider test.

## Rendered redesign verdict

**PO verdict: accepted locally, October 21.** PO independently drove fresh, isolated Chrome views of the local homepage at 1440/390/320 px, About at 1440/390 and thank-you at 390, with external/API/non-GET requests blocked. First-open and full-page captures showed no horizontal overflow or browser JavaScript errors. PO inspected the actual hero, open menu, plans, channel example, form and About renders rather than relying on computed styles, then inspected PM's final accepted desktop/mobile/menu images. Representative committed proof: [desktop](scratchpad/site-refresh-accepted-home-1440-first-open.png), [390 px](scratchpad/site-refresh-accepted-home-390-first-open.png), [320 px](scratchpad/site-refresh-accepted-home-320-first-open.png), [open menu](scratchpad/site-refresh-accepted-390-menu-open.png), [About mobile](scratchpad/site-refresh-accepted-about-390-first-open.png) and [full desktop page](scratchpad/site-refresh-accepted-home-1440-full.png).

[PO observations](scratchpad/site-design-local-final/observations.json) are retained. PO PNGs in `scratchpad/site-design-local/` and `scratchpad/site-design-local-final/` remain a **local archive**, including returned and corrected renders; they are not the committed acceptance screenshot set. Representative prior public appearance: [desktop](scratchpad/site-before-public-1440-first-open.png), [mobile](scratchpad/site-before-public-390-first-open.png).

Returned issues were concrete and corrected before this verdict:

- The desktop owner-notification card covered its photo caption. The card now participates in layout and the caption clears it.
- The mobile chat launcher covered the notification text; the 320 px arrival window split its final digit. The launcher is now a compact 48 px control and the arrival detail stays grouped. PO independently opened/closed the real widget, verified its accessible name, expanded state and restored focus, and observed zero API/non-GET attempts. [Widget checks](scratchpad/site-design-local-final/widget-check.json).
- An unverified “same-day changes” promise had no established service commitment; it was removed. The plan emphasis says “Recommended,” not an invented popularity claim.

The accepted direction is visible throughout: opaque white navigation, strong navy/blue hierarchy, a sharp trade photo separate from the reading surface, three useful benefits, one user-controlled conversation/owner-summary example, readable plans and a coherent About page. Published amounts remain in homepage Plans; native-FSM, universal timing and unbuilt multi-number claims are removed. Manual availability and CSV handoff limits remain explicit. No invented customer logo, testimonial or usage metric was added.

PM's [returned frozen-source run](scratchpad/site-refresh-final.json) recorded 509 checks and one remaining failure: clicking the pilot action still animated scrolling under reduced motion. Engineering corrected the shared click handler to use an immediate scroll when reduced motion is requested. The separate [accepted rerun](scratchpad/site-refresh-accepted.json) passes **509/509 checks, zero issues or browser JavaScript errors**. Its motion samples remain at the same position immediately and 100 ms after the click. Navigation, breakpoint reset/focus, no-JavaScript content, channel switching, widget, geometry and local intercepted form checks pass. The two form outcomes were fulfilled in Playwright and not forwarded to Netlify; zero API/provider/model calls occurred. Only external font GETs were blocked.

The accepted run's served HTML matches its recorded files and source hashes remain unchanged before/after; combined source fingerprint is `f6eb3d7c4ff5fc1eddaace5e6823b7687ce9cef58ac20b639515e56b7a6f0f01`. The earlier failed and returned records remain intact. This acceptance covers the rendered local redesign and bounded interactions. **No push, deployment, actual form delivery, model response or provider readiness is established; those remain separate gates.**


## Subsequent hosted acceptance

Steve explicitly approved publication of the reviewed batch. Netlify published commit `40a147b` in deploy `6ad95e1f07f1b73d0733317c` at `2026-10-22T00:52:13.360Z`. PM passed 62 bounded hosted checks with no JavaScript errors, API attempts, non-GET requests or submissions; five served CSS/JS bodies match the accepted source. PO independently inspected the actual [desktop](scratchpad/site-hosted-1440.png), [mobile](scratchpad/site-hosted-390.png), [320 px](scratchpad/site-hosted-320.png) and [open menu](scratchpad/site-hosted-390-menu.png) images and read [the hosted report](scratchpad/site-hosted.json), without extra HTTP captures. **The public design is accepted live.** About/thank-you responses and geometry are verified by PM diagnostics; their visual baseline was inspected locally. This does not establish provider delivery, actual form delivery, live storage contention, a new scheduled run or first-shop acceptance. Full release details are in [SITE-REFRESH](product/SITE-REFRESH.md).
