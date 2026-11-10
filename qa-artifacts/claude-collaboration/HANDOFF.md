# Claude handoff: owner customer-journey repairs

Card: `AUTO-REVIEW-E9F1BCAD82C2BC0D` (Claude Code customer-experience lead).
Worktree / branch: `/tmp/mc-claude-customer-journey-20261109`, `work/claude-customer-journey-20261109`.
Base: `9ca04d71018855a13a47a29410d14d6d76695582`.
Final source head: `a55a2d92` (product source and checks). The commit that adds this file only adds documentation.
Not merged, pushed, published or deployed. No provider, account, key, message or live-setting action occurred.

## Scope and method

Owner journeys were followed in the actual local interface for website chat, phone answering, texting, Google Calendar, Thumbtack and Angi, plus onboarding, return/resume and daily workspace management, at 1440, 390 and 320 px. Three read-only analysts did this against `scripts/local-server.mjs` from this worktree, which ran:
- with an empty environment (no `.env` exists here);
- with the fake model and the memory store;
- with providers disabled;
- with a preload refusing all non-loopback egress;
- with a scratchpad-only loopback reader for the synthetic sign-in outbox.

Separate implementer agents wrote fixes with one writer per file. A separate QA agent reviewed every product commit in pristine detached copies. Each repair ships a causal check that fails on the prior source and passes after.

Browsers: from 21:25 local, all runs used Playwright's bundled headless Chromium 148 via `MC_PLAYWRIGHT_EXECUTABLE`, as FROM-CODEX.md asked. Earlier receipts named `*-chrome*` used headless `channel: 'chrome'`.

Changed product paths, all within the card's reservedPaths:
- `onboard.js`
- `desk.js`
- `desk-setup-guide.css`

## Original failure (primary)

**A returning owner cannot pass onboarding step 2.** The draft autosave always stores a per-day hours table, and `restore()` treated any saved table as hand-edited. After any reload or return visit, typed hours such as `Mon to Fri 7 to 6, Sat 8 to 2` no longer filled the day table, and validation rejected them with "Use hours such as Mon–Fri 8am–5pm…". This blocks every connector before the workspace exists.

Preserved as `evidence/onboard-hours/before-base.json` and `before-main-reload-390-blocked.png`.

## Commits (oldest first; later rows supersede earlier ones where marked)

| Commit | Change | Status |
|---|---|---|
| 7ad683b4 | Hours resume: a saved table counts as hand-edited only when it differs from the text | Refined by 98a7f115 |
| 7a167a9b | Onboarding lost responses: plain wording instead of "Failed to fetch" | Refined by 95b36f3a, 98a7f115 |
| bb8d1c60 | Desk Business details lost save: re-read and decide | Rejected by QA; replaced |
| 614b0db5 | Lead-source Check saved status visible while unconfirmed (CSS) | Refined by c82f4761 |
| 6164ae9d | STALE-SUITES.md triage | Docs |
| 95b36f3a | Onboarding wording names the visible button and the real retry outcome | QA: accept |
| c82f4761 | Check saved status only while unconfirmed at rest; spacing; permission stage | QA: accept with notes |
| 239ac869 | Desk lost save decided by field movement | Rejected by QA and Codex; replaced |
| 98a7f115 | Cleared hours survive reload; unknown autosave outcomes say "couldn't confirm"; next autosave adopts its revision only when the stored draft is exactly the lost save | Codex reviewer: accepted |
| b486788a | New current six-connector page suite | Check |
| 8ce00511 | Desk lost save: "saved" only with positive evidence; never "not saved" from an older GET; same for average job value | QA: accept with notes |
| f80f6fa0 | Practice chat recovers a lost reply; request labels follow follow-up state; Quick tour restores the owner's place | QA: accept with notes |
| a55a2d92 | Practice chat no longer claims the question is back in the box when the owner typed a newer one | Resolves QA note on f80f6fa0 |

For integration, take the net diff `9ca04d71..a55a2d92` of `onboard.js`, `desk.js` and `desk-setup-guide.css` (+131/−45). The intermediate commits are kept for review history.

## Repairs and their causal checks

All checks live in `qa-artifacts/claude-collaboration/`. Run them from the worktree root with:

```
MC_PLAYWRIGHT_EXECUTABLE=<bundled chrome-headless-shell> node qa-artifacts/claude-collaboration/<check>.mjs --playwright <playwright/index.mjs> --output scratchpad/<new-name>.json
```

Each uses the actual handlers in-process, the memory store and the fake model, denies physical transport and records source hashes. Receipts are in `evidence/<area>/`.

| Owner problem | Check | Before | After |
|---|---|---|---|
| Returning owner blocked at step 2 by typed hours; cleared rows reopened on reload | `onboard-hours-resume-ui-check.mjs` | base 76/95; weaker variant 96/105; 239ac869 112/116 | 116/116 |
| Raw "Failed to fetch" on lost create, autosave and reopen; wrong button named; edits before retry implied kept; failed outcome claimed when unknown | `onboard-create-lost-response-ui-check.mjs` | 7ad683b4 44/60; 7a167a9b 82/88; 239ac869 101/111 | 111/111 |
| Business details lost save: raw error, false conflicts, false "saved", false "not saved"; same for average job value | `desk-details-save-recovery-ui-check.mjs` (served desk.js sha256 pinned) | base 3/29; 239ac869 15/29 | 29/29 |
| Angi/Thumbtack setup locked after a lost response (Check saved status hidden by CSS) | `lead-source-unconfirmed-ui-check.mjs` | base 1/9; 614b0db5 11/15 | 15/15 |
| Practice chat broken after one lost reply (and a false "back in the box" claim); "needs action" after completion; tour returns to Home | `desk-daily-work-ui-check.mjs` | 239ac869 1/10; f80f6fa0 10/12 | 12/12 |
| No passing suite for the current connector pages (coverage) | `connector-pages-ui-check.mjs` | n/a | 55/55 at 6164ae9d and 98a7f115, with 4 expected-fail entries |

Final run on the clean tree at `a55a2d92`, all on bundled Chromium. Receipts are in `evidence/final-a55a2d92/`.

| Check | Result |
|---|---|
| hours | 116/116 |
| create | 111/111 |
| save | 29/29 |
| lead | 15/15 |
| daily | 12/12 |
| connector-pages | 55/55, with 4 expected-fail entries |
| `scripts/request-followthrough-ui-check.mjs` | 12/12 |
| `scripts/onboard-recovery-ui-check.mjs` | 59/59 |

- The two `scripts/` suites ran from a temporary copy whose only change launches bundled Chromium. Both were also 12/12 and 59/59 at base.
- `node --check` passes for `desk.js` and `onboard.js`.
- No physical network, page errors or forbidden requests occurred in any run.
- No broad or full64 run was made, per FROM-CODEX.md.
- Each new check requires its own new receipt name, `--output scratchpad/<prefix>-<name>.json`. Prefixes: `claude-hours-`, `claude-create-`, `claude-save-`, `claude-lead-`, `claude-daily-`, `claude-connector-pages-`.

### Decision rule now in desk.js for an uncertain Business details save

After a lost, unreadable or 5xx response, the desk re-reads with a GET only and never repeats the PUT. It then decides as follows:

- **"Saved":** only when all of these hold:
  - the revision moved;
  - every submitted field equals the submission under the save's own normalization (fee rows, FAQ rows, phone digits, origins, hours JSON);
  - nothing else moved, except server-derived fields (the hours table from the hours text, and the emergency fields together).
- **Unchanged revisions:** "We couldn't confirm this save yet… a save can't apply twice". On self-service workspaces a late commit makes the next save a 409, and Check latest then reports "already saved". Legacy workspaces have no server revision check, so they say that saving again sends the same details.
- **Anything else:** a kept-edits conflict. The draft is never overwritten.

This covers the late PUT after an older GET, the lost save where another actor writes a different value to the same field, newer typing during reconciliation, and the same cases for average job value.

## Stale reserved suites

See `STALE-SUITES.md`. Eight of the nine reserved UI suites fail at base 9ca04d71 on fixture drift or assertions written for the pre-037b connector UI; none shows a product regression. They were not rewritten. `connector-pages-ui-check.mjs` replaces their essential connector-page coverage. Still uncovered by any passing browser suite: the Schedule UI (visits, blocked time).

## Findings outside Claude's paths (for Codex scope selection)

Frontend files outside the claimed paths:
1. **Focus after a lost lead-source response** lands on the page body (`desk-lead-sources.js`). A tested patch is in `proposed-patches/desk-lead-sources-focus-check-saved-status.patch`; QA judged it correct, and the check passes 15/15 with it via `--override-lead-js`. Related: no visible feedback while Check saved status runs at the request stage. CSS cannot tell checking from saving, so this needs a JS status.
2. **Focus falls to body after a successful "Request connection review"** (phone/text/Calendar) and after Thumbtack "Set up lead notifications". Recorded as expected-fail entries in `connector-pages-ui-check.mjs` (`desk-setup-guide.js`, `desk-lead-sources.js`).
3. **No way back after disconnecting Angi or Thumbtack.** `stoppedConnection()` in `desk-setup-guide.js` (~167, ~335) treats a disconnected lead source like a cancelled service. The row offers only Contact support and Open Account, and Account has no lead-source entry.
4. **Text messaging Home says "Next: You"** while the SMS page shows a platform hold with no owner form. `lib/connection-journey.mjs` (~150) puts the customer "facts" step first even when `activation.blockedBy==='machines_and_cloud'`. Status labels also disagree: "Setup needs our help", "Waiting for service" and "Next: You".
5. **Angi business ID** accepts digits only (`lib/lead-connections.mjs:76`), but the message says "Enter the business ID…". After the error, focus goes to body because `desk-lead-sources.js:281` focuses a disabled field.
6. **Lead-source step counts and next-step labels disagree** between page and dialog, and "Continue setup" reopens the chooser instead of the saved Thumbtack partner request.
7. **The guided Website chat setup dead-ends** when private storage is unavailable: fields are editable but cannot be saved, while the collapsed settings panel works (`desk-service-intake.js`).
8. **Browser Back leaves the workspace.** Every page change uses `history.replaceState` (`desk.js` ~268, ~829), so Back from a request with a typed note exits to the public site. It is in desk.js, but it is a navigation-model change, so it is left for a follow-up card rather than this bounded batch.
9. **Re-sign-in loses the deep link:** a fresh link from a signed-out `#setup/voice/intro` lands on Home.

Backend:
10. **Editing contact details, prices or FAQ silently clears the business-details confirmation** that live website chat requires (`lib/setup.mjs:31-35,64-65`; `chat.mjs:106-108`). The owner sees "All changes saved" with no warning. Reproduced offline as the confirmation clearing; a live chat outage follows from code but was not observed with a real model.
11. **The Google OAuth callback with an expired or unknown state returns raw JSON** with no way back to the workspace (`google.mjs` ~17). Thumbtack's callback already has a return link.
12. **The Customers CSV** leaves Email blank and labels every Lead Source "Other" (`client.mjs:636`); the Requests CSV has no email or lead-ID column.
13. **Home "Recent activity" stays empty** after platform leads and owner follow-up actions (`lib/lead-connections.mjs` ~183 writes no activity).
14. **PUT /api/client has no request idempotency**, and legacy PUTs have no revision check. Either would turn the desk's lost-save inference into certainty.
15. **Website conversations stored before 811e8caf without the tenant prefix are invisible** to owner and admin. STALE-SUITES.md asks whether that is intended.

Minor (desk.js; follow-up card): blocked time after a lost response says "Reload availability" with no reload control there; after sign-out the heading reads "Unable to open workspace"; "Email me a sign-in link" from the workspace opens the new-signup page.

## Limits

- **Local acceptance only.** Nothing here establishes publication or actual provider delivery. Phone, text and Calendar were exercised only in their honest disabled/review states; Thumbtack and Angi only through local handlers and test leads.
- **Fake model only.** Customer-conversation quality and Spanish were not assessed.
- **Remaining client inference.** Lost-save handling is client-side inference without server idempotency (item 14). Where evidence is ambiguous, it reports uncertainty rather than success.
- **No Back navigation fix.** Item 8 is not fixed.
- **No integration or publication.** Codex selects, integrates and runs any broader gate.

## Integration instructions

1. Review the net diff `git diff 9ca04d71..a55a2d92 -- onboard.js desk.js desk-setup-guide.css`.
2. Run the six checks above plus `scripts/request-followthrough-ui-check.mjs` and `scripts/onboard-recovery-ui-check.mjs` against the integrated candidate with bundled Chromium. The new checks route `/api/workspace-billing` and the lead-source handlers; `connector-pages-ui-check.mjs` sets a synthetic `PLATFORM_DATA_ENCRYPTION_KEY` only inside its own process.
3. Optionally apply `proposed-patches/desk-lead-sources-focus-check-saved-status.patch`, then run `lead-source-unconfirmed-ui-check.mjs`. With the patch applied, the focus assertion can become required.
4. Keep `FROM-CODEX.md` and `FROM-CLAUDE.md` out of product commits. They are coordination notes and are left untracked.

## Independent QA disposition

One Claude QA agent reviewed every product commit in pristine detached copies, using its own probes in addition to the shipped checks. Codex's reviewer findings, recorded in FROM-CODEX.md, were also resolved.

| Commit | Verdict |
|---|---|
| 7ad683b4 | Accept with notes; notes resolved in 98a7f115 |
| 7a167a9b | Accept with notes; notes resolved in 95b36f3a |
| bb8d1c60 | Reject (false conflicts and false "saved"); replaced |
| 239ac869 | Reject (false "saved" when another actor wrote the same field); replaced |
| 614b0db5 | Accept with notes; resolved in c82f4761 |
| 95b36f3a | Accept |
| c82f4761 | Accept with notes: focus and checking-state feedback need JS (findings 1, 2) |
| 98a7f115 | Accept with notes (Codex reviewer also accepts) |
| 8ce00511 | Accept with notes; no false "saved" or "not saved" in any probe. Its two wording claims were verified, including a late-committing PUT |
| f80f6fa0 | Accept with notes; the practice-claim note is resolved in a55a2d92, which has not had a separate QA pass beyond its causal case |

Remaining QA notes, disclosed rather than fixed in this bounded batch:

- **98a7f115: own late save shown as another tab.** If an autosave whose reply was lost commits only after the next autosave has re-read the draft, the page says "changed in another tab", and reloading drops text typed since. This is rare; the common lost-reply case is fixed.
- **8ce00511: false "changed while it was checked" on an ordinary save.** After a lost response for a save that did land, "Numbers that always ring through" entered as (713) 555-0144 and a price line with no amount ("Diagnostic $89") show this message, because `cfgNorm` doesn't reproduce how the server stores them. It is recoverable through Check latest. Follow-up: normalize that list as phone digits and match the server's handling of lines with no amount.
- **8ce00511: derived-field allowance is broad.** When any emergency field (or the hours text) is submitted, all emergency fields (or the hours table) may move without a conflict. Nothing the owner wrote is lost, but a concurrent edit to the sibling field is adopted silently.
- **8ce00511: the 409 after the owner's own late commit says "changed elsewhere".** Check latest then reports "already saved".
- **f80f6fa0: false "back in the box" claim in practice chat.** Fixed in a55a2d92: newer text is left untouched and the message names the unanswered question.
