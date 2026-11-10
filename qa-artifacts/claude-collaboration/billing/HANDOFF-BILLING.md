# Claude handoff: Billing page, honest uncertain outcomes and session safety

Card: `AUTO-REVIEW-0371424E595539D7` (Commercial and billing PO). Claude claimed this existing, ready, unowned card; the claim is recorded in FROM-CLAUDE.md.

| | |
|---|---|
| Branch | `work/claude-billing-20261110` |
| Worktree | `/tmp/mc-claude-billing-20261110` |
| Base | `dfb0ae7846e66871d849c67566bf9d3b475f46ae` |
| Final source | the single commit adding this file (source and handoff together) |
| `desk-billing.js` | base `a2e3a33c7ae0ad4808ed8a403b7785207817bf4f5481d82fe9c0becd1b77732f`, final `a7e90ead0068b6fe8c101b91120c67aafad12706e03ff45c541895bda6cb4619` |

Frontend wording and recovery only. Billing semantics, Stripe URL validation (`checkout.stripe.com` / `billing.stripe.com`), server call shapes, and requestId reuse and rotation are all unchanged. Nothing was merged, pushed or published, and there were no Stripe or provider calls.

## Original failures (base, 390 and 1440)
- **Raw errors.** `request()` (base :34) parsed JSON unguarded, so the owner saw raw text:
  - "Failed to fetch" (dropped connection);
  - "Unexpected token '<'…" (non-JSON 503);
  - "signal is aborted without reason" (timeout).

  `read()` and the refresh, review and portal branches showed these raw errors. That includes the status check that the checkout and cancel wording tells the owner to use.
- **Blocked storage dead-ends.** `session()` re-read storage on every call. With storage blocked after load, it sent `Bearer null`, the 401 was discarded as stale, and the page hung on "Checking payment status…". With a different session in storage, it sent that other session's token.
- **No status check.** With no checkout or subscription, the status check stayed hidden after an unknown outcome.

## Repair
- **Session handling** follows sibling commit `87dea6fe` (website intake):
  - the session is captured at load;
  - storage stays the identity check while readable;
  - a mismatch sticks;
  - expiry and sign-out clear it.

  Without a matching session, nothing is sent: "Sign in again to manage billing. Nothing was sent."
- **Unknown outcomes** are network failure, abort or timeout, an unreadable or non-object body (including arrays), any 5xx, and a 200 without a `billing` object on read or refresh. These now read "We couldn't confirm …", show the read-only status check, keep state, and focus the message.
- **Definite 4xx** keeps the server message, except for checkout and cancel.
- **Checkout and cancel_renewal** keep their "may already be saved" wording for every error. Independent QA confirmed this is correct: `checkout_changed` 409 and the cancel `workspace_changed` 409 / `billing_busy` 503 can arrive after the attempt is saved.

## Checks (offline; served sha256 pinned; `evidence/final/`, final run in `evidence/final/lead/`)
| Check | dfb0ae78 | final |
|---|---|---|
| `desk-billing-faults-ui-check.mjs` (new; 22 defect + 13 guard rows) | 13/35 | **35/35** |
| QA probe `qa/desk-billing-qa-probe.mjs` (money-safety: one checkout/portal per requestId, no unvalidated navigation, "Nothing was sent" only when true) | | **17/17** |
| `scripts/workspace-billing-check.mjs` | | 49/49 |
| `scripts/workspace-billing-recovery-check.mjs` | | 29/29 |
| `scripts/launch-billing-qa-check.mjs` | | 17/17 |
| `desk-daily-work-ui-check.mjs`, `connector-pages-ui-check.mjs` | | 12/12, 55/55 (implementer and QA runs) |

**Fixture.** `/api/workspace-billing` is a `context.route` fixture that mirrors the handler's shapes, because the real handler refuses review, checkout and portal without Stripe config. QA listed where it is kinder than the real handler:
- HTML-only 5xx, while the real handler sends JSON 5xx. QA probes covered the JSON 5xx case.
- Checkout always `open`.
- No Origin check.
- No expiry.

**Independent QA: ACCEPT WITH NOTES.** It found no path to a second checkout or portal session, a wrongly new requestId, or an unvalidated navigation. The note on malformed 200 replies (arrays, `{}`) was resolved by the lead after QA, and is verified by the check (35/35) and QA's probe (17/17).

## For Codex (backend)
- There is no offline/test mode for review, checkout, portal or cancel without a Stripe offer config.
- Most checkout and cancel refusals are 409s, so the client can't tell "nothing saved" from "saved, then refused".

## Limits
- **Sign-out with blocked storage.** If storage is blocked at sign-out and later becomes readable, the module would re-take the revoked token. It is safe in practice: the billing DOM is removed on sign-out and the server answers 401. QA note.
- **Second account in the same tab.** Billing locks and sends nothing until reload.
- **Generic 503 wording.** Some real 503 messages (e.g. review `billing_unavailable`) are replaced by generic "couldn't confirm" text.
- **Pre-existing.** An account swap during an in-flight checkout is silently treated as stale.
- Local acceptance only.
