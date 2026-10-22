# Portal interface research — October 22, 2026

This review uses current official product pages and their actual interface images. It informs the three-surface redesign; it is not evidence that Machines & Cloud provides competitors’ features. Public images were downloaded for inspection under `scratchpad/portal-reference/`; none is a production asset.

## Observed references

| Reference and inspected image | Concrete pattern | Application here |
| --- | --- | --- |
| [Jobber Home](https://help.getjobber.com/en/articles/home/), official [Home screenshot](https://help.getjobber.com/_astro/38193215557783.Cm_BeOJC_ZTdkcb.webp) | Labelled left navigation stays stable. A compact greeting gives way to workflow/status groups. Setup guidance sits in one defined section; reminders appear when there is relevant work. Today’s appointments are real work rather than decoration. | Workspace has a clear current page, one contextual next action and everyday requests underneath. Setup progress belongs on its own route. Admin prioritizes actionable customer states and discloses loaded-page scope. |
| [Jobber Home setup guide](https://help.getjobber.com/en/articles/home/), official [setup image](https://help.getjobber.com/_astro/38193215559319.BmJWByZY_Z20xglj.webp) | One step has a plain title, short explanation, help link and one primary action. The article describes goal-based setup categories. | Onboarding explains the current task and asks related questions together. It avoids presenting four dense technical forms at once. Optional rules remain expandable. |
| [Intercom Inbox](https://www.intercom.com/helpdesk/inbox), official [Inbox image](https://cdn.sanity.io/images/4bgok82s/monorepo-static-assets/b1b18a305bbce7f039c68bbdb044841365045a98-2436x1624.webp) and [Inbox guide](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained) | Persistent navigation, selected conversation list, central conversation and contextual details have distinct zones. Selected rows are obvious. Headers and dividers provide hierarchy without heavy card borders everywhere. | Give customer records a readable list/detail relationship. Keep actions with their subject, use distinct selected states, and put diagnostics behind a disclosure. Preserve normal keyboard and focus behavior. |
| [Linear Inbox](https://linear.app/docs/inbox), official [Inbox image](https://webassets.linear.app/images/ornj730p/production/b442b340278740de70919c868dce1afca4335fe7-3600x2080.png?w=1440&q=95&fm=png) | Priority and Other separate attention from background updates. Rows emphasize the work title, then the triggering event and time. The guide documents direct navigation and keyboard actions. | Admin attention items use a named customer, concrete reason and direct action. Secondary system information receives less weight. Navigation remains labelled; we do not introduce undocumented shortcut conventions. |

## Design decisions

- Use one composed application shell across workspace and operations, plus a focused related shell for onboarding. Shared navy, blue, grey and white tokens keep the product coherent.
- Make the first view answer “Where am I?”, “What needs me?” and “What happens next?” before it shows settings or diagnostics.
- Show customer/setup status from real saved facts. Never substitute sample activity, fabricated usage charts or a “ready” badge for missing proof.
- Keep review, private practice, connection approval and actual activation separate in the interface. A customer should see one next useful action rather than repeated setup instructions on every page.
- On mobile, show labelled reachable navigation and preserve the main action and readable content. Stacking a dense desktop console is insufficient; inspect 320, 375 and 768px captures as well as 1440px.

## Independent review standard

Use actual HTML/CSS/JS with explicitly synthetic API or memory data and outbound access denied. Review signed-out, loading, load failure, empty, populated, selected-detail and form-error states. Exercise keyboard navigation, dialog Escape/focus return, route headings and mobile layout. Record source hashes and retain failed receipts. Automated geometry checks supplement human inspection of the screenshots; a large passing count alone does not establish visual quality or live service delivery.

## Review outcome

Independent browser review of the final local application passed **31/31 checks** with stable source hashes, 46 retained screenshots, no browser exceptions, no forbidden actions and no physical network requests. The actual access, customer and management handlers ran against isolated synthetic memory records. Explicit load failures, delayed reads and empty collection projections exercised recovery and empty states. No real sign-in, email, AI, provider or publication occurred.

Human screenshot review covered onboarding, workspace and operations at 320, 375, 768 and 1440px. The review returned and verified concrete improvements: a full-width tablet setup form, less repeated mobile introduction, customer account identity replacing a redundant list heading, public plan names, accessible setting labels and mobile table headers, readable Houston timestamps and conditional notification wording. Navigation and customer work now receive distinct visual hierarchy; the workspace’s long setup checklist is confined to Connections.

- [Independent runner](../scripts/portal-revamp-ui-qa-check.mjs)
- [Final local receipt](../scratchpad/portal-revamp-qa-all-final.json)
- [Tablet onboarding](../scratchpad/portal-revamp-qa-all-final-onboard-contact-768.png)
- [Desktop workspace](../scratchpad/portal-revamp-qa-all-final-workspace-home-1440.png)
- [Mobile customer requests](../scratchpad/portal-revamp-qa-all-final-workspace-leads-375.png)
- [Desktop operations](../scratchpad/portal-revamp-qa-all-final-admin-home-1440.png)
- [Tablet customer account](../scratchpad/portal-revamp-qa-all-final-admin-detail-768.png)

This result establishes local interface behavior and visual review. The production-based release candidate needs its own checks; published pages and real service delivery remain separate acceptance steps.
