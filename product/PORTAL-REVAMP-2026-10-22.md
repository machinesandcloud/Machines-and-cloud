# Portal redesign brief

Steve rejected the visual quality and navigation of onboarding, the customer workspace and operations on October 22. This iteration must be a coherent product redesign with observed workflows, rather than another set of cosmetic cards. Publication of the preceding candidate has not been approved.

## Shared direction

- A composed application: dark ink navigation, a quiet grey canvas, crisp white work areas, one clear blue primary action. Use real information and honest empty states, never invented activity, revenue, customers, readiness or testimonials.
- Shared tokens live in `product-ui.css`, owned by Root. Use Inter/system sans; navy `#13243e`, blue `#275be8`, canvas `#f4f6fa`, text `#19283f`, muted `#5d6b82`, border `#dfe5ee`, restrained 14-18px radii. No gradient backgrounds, glass, decorative dashboard charts or oversized pill navigation.
- Desktop workspace/admin use a stable approximately 232px navigation rail, useful page header and generous but controlled working area. Mobile keeps labelled navigation reachable without a sideways tab strip or a collapsed mystery menu. Navigation must show current location and keyboard focus.
- Icons are consistent small inline SVGs, decorative to assistive technology. Branding preserves the original logo ratio; use `logo-dark.png` on light surfaces, `logo.png` only after inspecting its contrast.
- Onboarding is a focused setup flow with clear current step, helpful examples, saved progress and a distinct final handoff. Reduce technical wording and visual density through grouping; retain required data and validation. Optional advanced rules stay optional.
- Customer workspace prioritizes the next useful setup action, then everyday customer work. Avoid showing a long setup checklist above every tab. Use meaningful page titles and concise empty states with relevant actions. Keep review, private practice, connections and real activation distinct.
- Admin is an operations console: urgent work, customer search, readable lifecycle/status, useful detail hierarchy and reasoned actions. Put diagnostics in disclosures rather than making account pages a wall of prose.

## Ownership and compatibility

Root owns `product-ui.css`, onboarding HTML/CSS/JS and final integration. Workspace engineer owns `desk.html`, `desk.js`, new `desk.css`, and may improve `desk-connections.css`; do not change connection API/authorization logic. Admin engineer owns `admin.html`, `admin.css`, `admin.js`. Research/QA owns official-source evidence and independent visual/interaction review. Keep all existing control IDs, field names, API contracts, permission checks, saved state, data-route/data-t/data-view selectors and hidden/inert semantics. Do not alter backend, provider gates, pricing, deployment or external accounts.

## Acceptance

Inspect real official competitor/product interface references online before implementing, and record the specific pattern used. Review actual local screenshots at 375/768/1440px and the minimum 320px width. Exercise sign-in/loading/error/empty and populated fixture states, navigation, form errors, review/practice/connections and admin customer/action flows. Reuse actual-handler regressions and add only meaningful checks for the changed navigation. Automated passes do not replace visual review.

Publication must use a new exact production-based batch and fresh approval under the existing daily-build rule. Old `6cec7ec` is superseded as a proposed release; it is not live and its approval question must not be treated as approval for this new design.
