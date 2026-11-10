# Claude handoff: phone, text and Google Calendar connection actions after lost or failed responses

Card: `AUTO-REVIEW-578CE4BAE45F1CF9` (Phone PM). Claude claimed this existing, ready, unowned card; the claim is recorded in FROM-CLAUDE.md.

| | |
|---|---|
| Branch | `work/claude-connection-errors-20261110` |
| Worktree | `/tmp/mc-claude-connection-errors-20261110` |
| Base | `dfb0ae7846e66871d849c67566bf9d3b475f46ae` |
| Final source | the single commit adding this file |
| `desk-connections.js` | base `e5518ea2229c91f8c7c71603d88264214fe1fdf446a3dcc15268e23ba5a68a95`, final `46770af20013d80ca6a07213336481089de09d7a06d2d76f415636696dcb329e` |
| `desk-activity.js` | base `c2346a03e98471542f0350e9b6360e66719e8d43b8b427c9a6fd939b9458c99b`, final `392726f8270f77a61ece66401f08586e6bb6a8860a91eac8e564af2d9850db15` |

The JSON receipts, check and probe scripts are committed. The screenshots (362 PNGs, about 33 MB) are left uncommitted in the worktree under `connection-errors/evidence/final/` and `qa/`, to keep history small.

Nothing was merged, pushed or published. No provider or Google calls were made, and the backend is unchanged.

## Original failures (base, 390 and 1440)
- **Raw error text** (`desk-connections.js:332/356`). On phone, text and Calendar disconnect, Calendar start and the Calendar return:
  - a dropped connection or lost response showed "Failed to fetch"/"Load failed";
  - a non-JSON 5xx showed "Unexpected token '<'…".

  There was no hold and no read-only check, so the same write could be submitted again.
- **Focus on `<body>`** after a definite 4xx (the submit button was disabled and never refocused).
- **Calendar return failure** fired a hard refresh. If that read also failed, the whole workspace was replaced by a sign-in card reading "Failed to fetch".
- **`readMutationStatus()`** always said "Your change is saved."
- **Raw errors and focus on `<body>`** in `loadPrivateReview` (:377) and `desk-activity.js:48/55`.

## Repair
- **Unknown outcome** means a network failure, timeout, any 5xx, an unreadable reply, or a 2xx without `ok:true`. The page then:
  - says "We couldn't confirm whether your change was saved.";
  - holds the change (submit disabled, no automatic resubmit);
  - keeps the form and input;
  - offers "Check saved status" (a GET only).

  On the Calendar return, the GET runs automatically and the refresh is soft. If the dialog is closed while a change is held, the held state shows again when it is reopened.
- **Evidence (`mutationEvidence`).** "Saved" or "connected" is claimed only when a fresh GET shows this change, using per-action checks:
  - phone/text request: the intent is new, or `updatedAt` changed with the submitted forwarding mode;
  - text disconnect and cancel setup: the operation id matches `fields.operationId`;
  - and so on for the other actions.

  Otherwise the page says the change is still unconfirmed and releases the hold. It never says "not saved".
- **Definite 4xx** shows the server message, with focus returned to the control.
- **`focusVisible()`** never leaves focus on `<body>`.

## Checks (headless Chrome / shell; offline; served sha256 pinned; `evidence/final/`)

| Check | dfb0ae78 | a27147ab (prior fix) | final |
|---|---|---|---|
| `connection-errors-ui-check.mjs` (5 actions × 5 faults × 2 widths, plus the status-read-fails, activity and re-request cases) | 3/71 | 67/71 | **71/71** |
| QA voice UI probe / voice duplicate engine probe | | | 6/6 / 4/4 |
| `connector-pages-ui-check.mjs`, `desk-daily-work-ui-check.mjs` | | | 55/55, 12/12 |
| `scripts/connection-journey-check.mjs`, `scripts/calendar-connection-check.mjs` | | | 89/89, 24/24 |

**Independent QA: ACCEPT WITH NOTES.**
- **No unsafe outcome.** There is no false "saved"/"connected", no "not saved" from an older GET, and no automatic resubmit.
- **Every resubmit is server-idempotent.** QA read the handlers and probed:
  - voice uses a fixed per-workspace id with `expectedRevision`;
  - text has one row per workspace;
  - renew uses a nonce;
  - pause and resume return 409s;
  - Calendar start uses a grant counter.
- **Notes resolved.** Note 1 (a re-request read as "not confirmed"), note 2 (the cancel-setup operation id) and note 5 (a hidden hold) were fixed afterwards. They are verified by required cases that fail on `a27147ab`, and by QA's probes. There was no second QA pass.

## For Codex
- **Backend:** the GET exposes no receipt or submission id for `request_voice_activation`, `request_messaging_activation` or `correct_messaging_activation`. Evidence is therefore inferred from `updatedAt`. A `service_approval=`-style receipt lookup would make it exact.
- **Backend:** a denied Calendar consent return leaves nothing to confirm.
- **Timing:** the Calendar return's two Google calls can take about 30s, longer than the 20s client timeout. "Not connected" can show while the completion is still running. The status wording is accurate, and the stale completion is rejected if the owner restarts.
- **desk.js, outside this card:**
  - `:1055`: `recover(error.message)` shows a raw error on the sign-in card;
  - `:54`: `apiRequest` parses JSON unguarded;
  - `:84`: the schedule read shows the error raw.
- **`desk-visits.js:33-35`:** the free-time check parses JSON unguarded.
- **Stale suites:** `calendar-auto-connect-check` gives 13/18 at both base and fix, and `calendar-disclosure-check --browser` fails at both (redesigned UI). Neither is in STALE-SUITES.md.

## Limits
- Phone and text requests are gated offline, so their browser cases seed the offer and write the intent as the engine does.
- Cancel-setup id matching is not driven in the browser.
- A re-request identical to the existing intent is a server no-op and still reads "couldn't confirm". The resubmit is safe.
- Local acceptance only.
