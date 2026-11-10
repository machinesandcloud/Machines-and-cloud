# Claude handoff: reconnect a disconnected Angi or Thumbtack, and keep focus

Card: `AUTO-REVIEW-E6B7FEB7355A7ECB` (Angi connector squad: customer outcome and improvement). It was claimed per FROM-CODEX.md "next bounded outcome" and covers Thumbtack too, since both share these files.

| | |
|---|---|
| Branch | `work/claude-lead-reconnect-20261109` |
| Worktree | `/tmp/mc-claude-lead-reconnect-20261109` |
| Base | `42e3ab4d180bb9227dbe909f42b7c12df1e1eb24` (accepted first batch; product = a55a2d92) |
| Final source head | `4bb383c3` |

The commit that adds this file adds only documentation. Nothing is merged, pushed or published. No provider, account, key, message or live-setting action was taken. No backend, provider-gate, retirement or consent change.

## Changed paths (the claimed scope)
- `desk-setup-guide.js`
- `desk-lead-sources.js`
- `desk-setup-guide.css`
- Checks and evidence under `qa-artifacts/claude-collaboration/`

## Original failures
1. **No way back after disconnecting Angi or Thumbtack.** `stoppedConnection()` treated a disconnected lead source like a cancelled service. The row read "Stopped" and pointed to Account for records (they are in Inbox). It offered only Contact support and Open Account, with no way back to setup.
2. **Connector actions dropped keyboard focus to the page body.** This happened after a lost lead-source save, after Request connection review, and after Thumbtack lead-notification saves. In the connector suite these were 4 expected failures plus 2 more cases, at 1440 and 390.
3. **Angi business ID.** The server accepts digits only, but the page said only "Enter the business ID…", and focus went to the page body after the error.

## What changed

| Commit | Change | Independent QA |
|---|---|---|
| 16a06f77 | Disconnected lead sources show "Disconnected", say earlier requests stay in Inbox, and offer one "Set up again" that opens the normal guided setup with the real `prepare`. Focus handling across connector actions. Angi digits rule with specific help. | REJECT: a dead end for retained-webhook Thumbtack rows; a focus steal |
| 4bb383c3 | Rows whose `prepare` the server refuses (a native Thumbtack row still holding its webhook: `disconnect_pending`, or a stuck `refreshing`) read "Disconnecting" and send nothing. With partner access not ready they offer Contact support, Check status and Inbox. With it ready, they offer only the accepted sign-in, labelled "Renew permission to finish disconnecting". Step URLs and auto-open are blocked there. Focus returns only from the action's own status or from the page body. Status holds focus while busy. Non-ASCII digits get a "0 to 9" message. | ACCEPT WITH NOTES |

Cancelled, paused and archived workspaces stay stopped. Rows that can genuinely be reconnected keep "Set up again", and QA verified each write:
- clean native rows, partner ready and not ready;
- managed requests;
- self-serve rows;
- Angi.

## Checks (bundled Chromium; served sha256 pinned)

| Check | 42e3ab4d | 16a06f77 | 4bb383c3 |
|---|---|---|---|
| `lead-source-reconnect-ui-check.mjs` (new) | 4/16 | 18/34 (extended set) | **34/34** |
| `connector-pages-ui-check.mjs` | 49/55 (expected failures promoted to required) | | **55/55, 0 expected failures** |
| `lead-source-unconfirmed-ui-check.mjs` (focus now required) | 13/15 | | **15/15** |

Regressions at 4bb383c3:
- `scripts/request-followthrough-ui-check.mjs`: 12/12, from a temporary copy that launches bundled Chromium.
- `desk-daily-work-ui-check.mjs`: 12/12.
- `desk-details-save-recovery-ui-check.mjs`: 29/29.

No physical network, page errors or forbidden requests. Final receipts are in `evidence/final-4bb383c3/`. Development receipts and 390 screenshots are in `evidence/lead-reconnect/` and `evidence/lead-reconnect-rework/`.

What the reconnect check proves, at 1440 and 390:
- **Angi:** reconnect sends a real `prepare` on the disconnected generation (200). A local test lead on the new key is accepted, and the old key gets 403. Inbox keeps the earlier requests.
- **Thumbtack lead notifications:** the same, with notifications.
- **Thumbtack partner path:** a fresh sign-in starts (200).
- **Rows the server would refuse:** no refused write is ever sent.
- **Focus:** stays where the owner moves it during async actions.
- **Digits:** the rule matches the server across scripts and whitespace.

## Backend contract gap (for Codex selection; not worked around)
After a Thumbtack partner sign-in has started, disconnecting keeps `row.native`. A later `POST /api/client {action:'lead_connection', operation:'prepare', deliveryMode:'self_serve'}` returns 409 `native_disconnect_required` (`netlify/functions/lib/lead-connections.mjs:96`; disconnect keeps native at :101). In that state the page offers only the partner path, which the server accepts. Allowing lead notifications there needs a backend decision, for example when `row.state==='disconnected'` and there is no `native.webhookID`.

## Limits
- **Theoretical over-blocking (QA note).** A disconnected native row with no saved webhook but a status such as `authorization_required`, `authorizing`, `exchanging` or `business_selection_required` would show "Disconnecting" and Contact support, though the server would accept `prepare`. QA could produce it only by editing stored data, and found nothing in the current server that creates it. The fallback sends no refused write. If the DTO exposed whether a webhook is saved, the page could key on that instead.
- **Untested state.** `disconnect_pending` could only be reached by seeding stored data offline.
- **History limit.** The page can't predict `lead_connection_history_full`; the server's message covers it.
- **Native dialog Tab order.** Tab leaves to the page body once before wrapping; QA found this identical at base.
- **Local only.** This says nothing about publication, real provider delivery, or Thumbtack/Angi partner rights.
- **Browser disclosure.** During development, some implementer runs fell back to headless Google Chrome via Playwright's `channel: 'chrome'`. Every reported result is from bundled Chromium, and the new check refuses to run without it.

## Integration
1. Review `git diff 42e3ab4d..4bb383c3 -- desk-setup-guide.js desk-lead-sources.js desk-setup-guide.css`.
2. It can be combined with the optional desk/onboarding branch `work/claude-customer-journey-2-20261109` (HANDOFF-FOLLOWUP.md at b77cc8df). The two touch disjoint product files. Only this branch changes `connector-pages-ui-check.mjs`; take this version, which has 0 expected failures.
3. Rerun the checks above with `MC_PLAYWRIGHT_EXECUTABLE` set to the bundled headless Chromium, using a new `--output scratchpad/<prefix>-<name>.json` each time.
