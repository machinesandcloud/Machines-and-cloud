# Website, product and service experience

This pass starts with the owner's job: understand the offer, get a front desk ready, receive a useful customer request, act on it, and get help when something goes wrong. The replacement PO coordinates Marketing, UI/UX, Engineering, Architecture, QA and Operations. Current production and launch acceptance remain governed by [launch control](LAUNCH-CONTROL.json).

## The intended customer journey

```mermaid
flowchart LR
  A[Understand the service] --> B[Share basic business details]
  B --> C[Verify email and resume saved work]
  C --> D[Review business answers once]
  D --> E[Try a customer question]
  E --> F[Authorize chosen channels]
  F --> G[Automatic configuration and delivery check]
  G --> H[Customer request in Inbox]
  H --> I[Owner action and follow-through]
  I --> J[Account preferences and support]
```

Business questions are shared across channels. Permissions, account choice and costs are intentional owner decisions. Connection IDs, webhook preparation, retained operations and ordinary recovery belong to the backend. A walkthrough explains a step; it cannot make that step complete.

## Changes implemented in this pass

| Part of the experience | Concrete change |
| --- | --- |
| Public offer and trust | The homepage explains setup, private practice and the first useful request before pricing. About and FAQ use the same promise and explain owner control. Existing production prices and rights are preserved in the release candidate. |
| Secondary entry pages | Location, guide, industry, article and legal pages use a consistent reading hierarchy. Main-content landmarks, keyboard skip paths and focus destinations extend beyond the homepage. Existing copy, forms and link destinations are retained. |
| Signup and onboarding | One visible stage and clear progress on mobile; saved, pending, validation and recovery behavior remain available. Email-link feedback stays explicit. |
| First workspace visit | Home leads with the next useful setup task; empty activity no longer competes with that action. |
| Returning to work | An actionable customer request leads to the Inbox before unfinished setup. Unsaved business edits retain their protective priority. Private practice records do not become customer work. |
| Connections | One service-focused task surface, with additional service choices and detailed statuses disclosed when needed. Browsing a service does not select or activate it. A failed preference save reopens its controls and retains the draft. |
| Tutorials | Existing six-service spotlight walkthroughs keep their real control targets and keyboard/reduced-motion behavior. |
| Account | Frequent preferences appear before infrequent downloads and maintenance. Pausing service, stopping renewal and downloading records keep their existing distinct actions. The held development-only reporting feature is excluded from production. |
| Operator portal | Compact mobile navigation and the same canonical channel/lead facts shown to owners. Native setup failures and unconfirmed replies become actionable Issues without exposing provider credentials. |
| Background recovery | The main health signal includes retained native lead recovery work. Failed, stale, future or malformed receipts cannot silently report success. Ordinary owner permission and first-lead waits do not create false incidents. An uncertain reply stays held rather than being sent again. |

[PO and marketing research](research/EXPERIENCE-REVIEW-2026-10-25.md) records current competitor and forum sources, decisions, and the original returning-owner priority finding. [Operational review](research/EXPERIENCE-OPERATIONS-REVIEW-2026-10-25.md) explains the actual code paths, original false-green reproduction and operating response.

## Verification and publication

The replacement PO accepts the selected experience locally on `ea230af`. Independent QA accepts 31 unique groups: buyer, owner/admin, Quick tour, all six service guides, backend recovery and four final reading journeys. The 27 earlier groups are credited through exact unchanged application/backend hashes; the four final reading journeys pass 47 assertions. These are local synthetic jobs with physical external transports denied, not actual provider delivery.

The production regression gate passed all 57 commands at `80d46dd`. A later independent no-JavaScript visual check found the transparent reading-page header overlapping text. The final candidate adds one scoped CSS line, and affected reading checks and packaging pass. The other 553 of 554 gate-bound files are unchanged. The 182 HTML/238-file public package matches source and excludes internal files. Original failures and their dispositions remain preserved. [Exact acceptance and source record](EXPERIENCE-REVIEW-2026-10-25.json) · [PO acceptance](../qa-artifacts/experience-20261025/po-final-acceptance.md).

[Desktop homepage](../qa-artifacts/experience-20261025/home-1440.png) · [Mobile homepage](../qa-artifacts/experience-20261025/home-390.png) · [Returning owner](../qa-artifacts/experience-20261025/experience-independent-ui-fourth-20261025-returning-owner-390.png).

Publication is pending one new 15-credit production build approval and at most 25 read-only publication checks. No new provider activation, settings, messages, calls, model requests, Calendar operations or purchases are included.

## Remaining launch work

This redesign does not replace actual service proof. The current launch gates still require the owned Google Calendar lifecycle and public verification, phone and texting delivery/registration, billing lifecycle and recovery, current AI quality/capacity evidence, native lead delivery, and operational incident/support acceptance. New Yelp/LSA integrations retain their own access and implementation prerequisites. No provider activation, new purchase, communication or reused proof allowance is implied by this review.

The immediate goal is one consistent customer experience whose controls reflect actual saved and delivered facts. Full paid launch is accepted only after the remaining customer/provider outcomes are observed.
