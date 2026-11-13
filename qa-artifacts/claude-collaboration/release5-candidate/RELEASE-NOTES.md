# Release 5 candidate (local only)

- **Branch:** `work/claude-release5-candidate-20261113` in `/tmp/mc-claude-release5-candidate-20261113`.
- **Base:** the release-4 branch head `65dfe2ec` (docs receipt on top of production `2180487e`).
- **Status:** committed locally. No push, no deploy, no provider calls.
- **Gate:** the `netlify.toml` gate is now **73 steps**, because SMS follow-ups adds `scripts/sms-followups-check.mjs`.

## Pieces (one commit each, in order)

| # | Commit | Piece | Source and acceptance |
|---|---|---|---|
| 1 | `e8e01b33` | Visual polish rev 2 | `visual-polish-rev2-on-549aaf33.patch` (sha256 `17f3dace…7cbc1c`), accepted in `visual-polish-fix/qa/QA-REVIEW-R2.md` |
| 2 | `1160024a` | Copy clarity, with QA fixes | `copy-clarity-rebased-on-a11y-r2-and-polish.patch` (sha256 `d71eacae…f4a4f2e`), accepted in `copy-clarity-fix/qa/QA-REVIEW.md` |
| 3 | `21822bb9` | FC2 Spanish and onboarding, with QA fixes | `fc2-spanish.patch` (`f6f0ab21…145f2e`), then `qa/spanish-fixes.patch` (`c4745795…626bcc`), accepted in `fc2-spanish/qa/QA-REVIEW.md` |
| 4 | `2a303ef9` | SMS follow-ups rev 2 | `sms-followups-r2.patch` (`9648b68f…ee18a`), accepted in `sms-followups/qa/QA-REVIEW-R2.md`. Server only. |

Each patch applied cleanly; there were no rejects. The only conflict was in `desk.html`, noted under piece 3. The source patches, proposals and QA reviews are copied next to their pieces under `qa-artifacts/claude-collaboration/`.

### What I added on top of the accepted patches

**Copy clarity (piece 2)**
- **Pause wording is now truthful.** QA found that a paused front desk still sends calls to the owner's saved contact cell when authority allows (`fallbackAllowed` includes `paused`). Every pause message now adds "Calls may still ring your saved contact cell." That covers:
  - the Connections pause dialog;
  - the Account scope text before pausing;
  - the Account message after pausing;
  - the Account summary;
  - the Home banner.

  The account guard regex `/calls (?:are|have)|delivered|forwarding (?:off|disabled)/` still does not match. `copy-shots-check` asserts the new sentence everywhere.
- **Stage label.** In `desk-lead-sources.js:210`, the workspace-hold stage label changed from "Workspace paused" to "Front desk paused".
- **Test updates for changed messages:**
  - `scripts/request-followthrough-ui-check.mjs:151` now expects `/Your change may not have saved/`.
  - `scripts/request-automation-ui-check.mjs:124` now waits for "confirmed this action was saved". **QA missed this one.** The old "No receipt is saved" message was removed, so the r5 browser run failed 17/18. With the fix it passes 18/18.
  - `inbox-dialogs/qa/qa-focus-probe.mjs` was updated the same way.

**FC2 Spanish and onboarding (piece 3)**
- **`desk.html` merge, resolved by hand.** I kept copy clarity's long `<form id="cfg">` line, with its new phone note, and re-inserted FC2's two additions: `aria-describedby="hoursHolidayHint"` and the `#hoursHolidayHint` paragraph.
- **Hours hint (QA F3).** The holiday regex no longer has the bare `closed on/for/the`, `cerrado` or `día de` alternatives. It now matches:
  - holiday names (English and Spanish);
  - `closed [on|for] [the] <digit|month>`;
  - `cerrado el|del <digit>`.

  `fc2-spanish-ui-check` asserts 6 sentences that must not be flagged, at 390 and 1440:
  - "closed on Sundays"
  - "sábado cerrado"
  - "Closed for lunch"
  - "día de trabajo"
  - "Sunday closed"
  - "closed the rest of the week"

  It also asserts 7 sentences that must still be flagged, including:
  - "closed Dec 24-26"
  - "cerrado el 25 de diciembre"
  - "Cerrado del 24 al 26"
  - "Navidad y Año Nuevo"
  - "closed for the holidays"
- **Trade examples versus placeholders.** FC2's per-trade `EXAMPLES` still win at runtime, but they are restyled to the short one-line "e.g." placeholder style (for example, "e.g. Drain cleaning" and "e.g. Service call: $79"). The greeting example is "e.g. Hi, this is the <name> front desk." The UI check asserts every example is one "e.g." line.
- **Mutants:** M24's anchor was updated, and M26 (old hint alternatives) and M27 (long multi-line examples) were added. M22, M23, M24, M26 and M27 are all **killed (5/5)**, with the UI check failing in each case. See `receipts/fc2-mutants-M22-M27.json`.

## Proof

**Setup**
- Every run used a throwaway copy named `r5-*`, made with `git archive <commit>`.
- Every run was offline: `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1`, and `sandbox-exec` deny-remote (loopback only).
- The gate copies exclude `qa-artifacts`, as in release 4. The browser copies include it, because the checks live there.
- Browsers were system Chrome: `channel:"chrome"`, or `MC_PLAYWRIGHT_EXECUTABLE` set to Google Chrome for p3-ui and p3-desk-ui.
- Every copy was deleted after its run.
- The harness is in `harness/` and the receipts are in `receipts/<piece>/`.

| Check | 1 polish | 2 copy | 3 FC2 | 4 SMS |
|---|---|---|---|---|
| netlify.toml gate (one fresh process per step) | 72/72 | 72/72 | 72/72 | **73/73** (sms-followups-check 13/13) |
| Layout check (320/390/1440) | 73/73 | 73/73 | 73/73 | 73/73 |
| a11y r2 focus check | 30/30 | 30/30 | 30/30 | 30/30 |
| Copy check (`copy-shots-check`) | n/a | 12/12 | 12/12 | 12/12 |
| FC2 Spanish node / UI | n/a | n/a | 9/9 / 11/11 | 9/9 / 11/11 |
| P3 ui / desk-ui | 45/45 / 12/12 | same | same | same |
| FC01-06 and qa-adversarial | 6, 4, 4, 4, 4, 8 / 22 all pass | same | same | same |
| desk-daily-work | 12/12 | 12/12 | 12/12 | 12/12 |
| request-followthrough (default phase) | 12/12 | 12/12 | 12/12 | 12/12 |
| request-automation | 18/18 | 17/18, then 18/18 after the test fix | 18/18 | 18/18 |
| open-cards-r4, desk-details-save-recovery, connector-pages | 33/33, 29/29, 55/55 | same | same | same |
| onboard-validation final, onboard-recovery, customer-onboarding entry/full/plan | 16, 59, 21/53/26 all pass | same | same | same |
| site-ui, sitecheck | 478 checks with 0 issues; sitecheck clean | same | same | same |
| guided-walkthrough | 13/14 | 13/14 | 13/14 | 13/14 |

Every browser report shows physicalNetwork 0 and pageErrors 0.

**Notes on the table**
- **Piece 2 was amended.** Its original run was on `4de15dfe`. The amend added only the two test-file updates (no product change), and request-automation was then rerun on `1160024a`.
- **Piece 1 was run twice.** The first browser attempt used a copy without `qa-artifacts`, so modules were missing. It was rerun on a full copy. Both receipts are kept.
- **guided-walkthrough 13/14 is not a regression.** The failing test is "Draft preserved and explicit route change closes cleanly" (`'know' !== 'convs'`). It fails the same way on production `2180487e` (`receipts/base-2180487e-guided-walkthrough.log`).

## Known limits and follow-ups
- **Browser coverage:** Chrome only, with the keyboard simulated by a 430px-tall viewport. iOS Safari was not tested.
- **request-followthrough `--phase visit-auth`** was not run. QA recorded that it already fails 9/10 on the base.
- **Human Spanish review:** all FC2 Spanish is AI-written and still needs the named human reviewer's spot-check.
- **For the legal/carrier owner:**
  - Spanish follow-up texts sit under the existing campaign.
  - The permission question is still English.
- **Open P3s from QA, not done:**
  - the FC2 README's "trailing" CSV `language` claim;
  - `lang="es"` on the long badges;
  - `relative:false` for `es` in `friendlyDate`;
  - an owner-email body date assertion.

## Room left for later pieces
FC2 desk/lifecycle is still in QA and is not included. It touches `desk.js`, `desk.html`, `desk-calendar.js`, `desk-requests.js` and `desk-customers.js`, all of which FC2 Spanish also edits, so expect a rebase. When it lands, rerun the full 73-step gate and the browser set with `harness/piece.sh`.
