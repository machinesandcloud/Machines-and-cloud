# Claude handoff: public signup form after lost or failed responses

Card: `AUTO-REVIEW-E66B3719CFA56993` (Public website PO). Claude claimed this existing, ready, unowned card; the claim is recorded in FROM-CLAUDE.md.

| | |
|---|---|
| Branch | `work/claude-signup-20261110` |
| Worktree | `/tmp/mc-claude-signup-20261110` |
| Base | `dfb0ae7846e66871d849c67566bf9d3b475f46ae` |
| Final source | the single commit adding this file |
| `signup-intake.js` | base `7f6e0159…`, final `73afa0f2f901fdd41bddcb6a442ab1dff5ab64bf49f84d9bb64831fb50457db6` |

The form is `index.html:141`. It posts to `/api/intake` and then opens `/onboard.html#intake=<handoff>`. The JSON receipts and scripts are committed; most screenshots stay in the worktree. Nothing was merged, pushed or published, no real email was sent, and the backend is unchanged.

## Original failures (base, 390 touch and 1440)
- **Raw errors:** "Failed to fetch" (`:51`), and "Unexpected token '<'…" on a 502 HTML reply (`:41`).
- **A 5xx showed the server's "We could not save your details",** which may be untrue.
- **Timeouts and malformed success replies** never said the details may be saved or that retrying is safe.
- **No focus moves after errors.** Validation relied on the browser popup, so there was no `aria-invalid` and no `aria-describedby`. A whitespace-only name got a generic error.
- **After success, the button re-enabled** while setup was opening.

## Repair
- **Unknown outcomes** (network failure, timeout, 5xx, non-JSON reply, malformed success) say the details may already be saved and the answers are still in the form. They also say that keeping the same answers is safe and won't create a second signup, while changing an answer sends a new signup.
- **Each answer set keeps its own submission id.** Going back to earlier answers reuses that answer set's id. The email is lowercased in the id key, matching the server's `normalizeAccountEmail`.
- **Definite 4xx replies show the server message.**
  - `intake_expired`, `submission_changed` and `invalid_submission` get client copy that names the working button, and the next try uses a fresh id.
  - `invalid_email` puts the message on the email field (`aria-describedby`) and moves focus there.
- **Errors are announced once.** The status line stops being a live region before the error text is set, then gets focus. Progress messages ("Saving…", "Still saving…" after 8s, "Saved…") stay in the polite live region.
- **Inline validation** sets `aria-invalid` and `aria-describedby` on each field, moves focus to the first invalid field, and treats a whitespace-only name as empty.
- **After success:**
  - The form stays locked. A non-live "Open your setup" link appears in `#intake-next` and gets focus.
  - Editing a field after success says the signup is already saved with the earlier answers.
  - A bfcache restore unlocks the form and clears the link.

## Checks (headless Chrome; offline; served sha256 pinned; `evidence/final/`, final lead run in `evidence/final/lead/`)
| Check | dfb0ae78 | 19e8d0bb (round 1) | final |
|---|---|---|---|
| `signup-lost-response-ui-check.mjs` (26 scenarios) | 111/183 | 149/183 | **183/183** |
| `scripts/signup-intake-ui-check.mjs` | 48/48 | | 48/48 |
| `scripts/intake-check.mjs` | 33 | | 33 (QA round 2, on 4d37d54b) |
| `onboard-create-lost-response-ui-check.mjs` | | | 111/111 |

## Independent QA
- **Round 1: ACCEPT WITH NOTES.**
  - The copy overpromised after an edit.
  - A stuck state after success with no way forward.
  - A likely double announcement.
  - `invalid_email` focus.
  - Misleading 410 copy.

  All five were fixed in round 2.
- **Round 2: ACCEPT WITH NOTES** (on 4d37d54b).
  - Id reuse after a revert was verified safe against the server's normalized-payload hash. 429 and 4xx refusals happen before reserve.
  - The live-region sequence is correct, and a stale link can't survive.
  - Note 1 (an email case change gets a new id) and note 2 (an edit after success is dropped silently) were fixed by the lead afterwards. The check (183/183) and the onboarding regression verify them; QA's probes were not rerun on the final bytes.

## For Codex (backend)
- **Rate-limit copy:** `lib/intake.mjs:41` says "wait a few minutes", but the email limit is 3 per hour (`:57`).
- **"Start a new form" copy:** the server's `intake_expired` and `submission_changed` messages (`:52,60,66`) tell owners to start a new form, which this page doesn't have. The page overrides them.
- **A changed answer is a new submission.** It creates a second handoff, the prospect record keeps its first answers, a changed email leaves an orphaned prospect row, and the rate limit is spent again.

## Limits
- **Ids are in memory only.** A full reload after a lost response, or a Back that isn't restored from bfcache, starts with a new id.
- **Not tested on real devices:** no real phones or screen readers.
- **Double announcement on success:** "Saved…" and the focus move to the link can collide.
- Local acceptance only.
