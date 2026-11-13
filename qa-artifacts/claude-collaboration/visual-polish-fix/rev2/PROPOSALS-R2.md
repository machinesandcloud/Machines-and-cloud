# Visual polish rev 2 (QA R1-R6) on release-4 HEAD `549aaf33`

**Patches only. Nothing applied to tracked files, committed or pushed; no provider calls.** Offline runs (`env -i`, memory store, fake model, no keys, `sandbox-exec` deny-remote, loopback only) on throwaway copies, deleted afterwards. Browsers: system Chrome (`channel:"chrome"`) everywhere the check supports it; p3-ui/p3-desk-ui only accept an executable, so they ran on the bundled headless shell.

## Patches

- `patches/visual-polish-rev2-on-549aaf33.patch` (sha256 `17f3dace02fc19e9802f052939a35fa2657c4f933f2e999192314e280f7cbc1c`): the full polish (rev 1 + QA fixes) against release-4 HEAD `549aaf33` (a11y r2 + open cards r2 included). Files: `desk.css`, `desk.html`, `desk-calendar.js`, `desk-visits.js`, `onboard.css`, `onboard.js`.
- `patches/rev1-to-rev2-delta.patch`: only the QA fixes, for review.
- **Apply order:** `549aaf33` → **polish rev 2** → **copy** (`copy-clarity-rebased-on-a11y-r2-and-polish.patch`). Both apply with `git apply`, no rejects; copy-then-polish also applies. The rev 2 `desk.html` changes (two `<div class="dlg-foot">` wrappers) are on lines copy does not touch.

## QA fixes

| QA | Fix |
|---|---|
| R1 focused field under the sticky Save | `focusin` on the request, conversation, visit and support dialogs (in `desk-visits.js`) and on `#ob` (in `onboard.js`) calls `scrollIntoView({block:'nearest', behavior:'instant'})` for text inputs, selects and textareas. Scrolling only; no focus change. Dialog `scroll-padding-bottom` is 96px (≥ bar + 16). |
| R2 phantom footer band | The form `::after` bar is gone. `#requestSave` and `#saveVisit` are wrapped in a real `<div class="dlg-foot">` inside their forms (`position:sticky; bottom:0; background:#fff; border-top`). `.visit-edit-actions` uses the same footer style. The buttons stay in their forms, so submit and the form's disabled-state loop are unchanged. |
| R3 onboarding bar over the keyboard | `@media (max-width:640px) and (max-height:560px)`: `.ob .nav{position:static}` and no scroll-padding; plus the R1 `focusin`. |
| R4 320 inbox actions split | QA's CSS exactly: `.desk-request-meta::after{content:"";flex-basis:100%;order:1}`, buttons `order:2;flex:1 1 0;min-width:0` (next-action text `order:3`). |
| R5 Schedule title truncated | Toolbar `flex-wrap:wrap`; the title block is `flex:1 1 100%` with `white-space:normal`; fixed-size nav on the next line. Also: legend wraps under the view switch when it does not fit (it overflowed the card at 320), and "Review Calendar setup" no longer has the 4px leading indent (a CSS space instead). |
| R6 rail wraps at 320 | `white-space:nowrap` on Account / Quick tour; at ≤360px 12px type and tighter padding for them and Sign out. |

## Proof

- **Layout check** (`harness/layout-check.mjs`, now 320/390/1440, **73 checks**): **73/73 rev 2**; **73/73 rev 2 + copy**; **59/73 rev 1 on 549aaf33**, where the 14 failures are exactly QA's R1, R3, R4, R5, R6 (`receipts/layout-*.log`). New focused-field tests: request Note focused while under the footer (320/390/1440), Tab through every request-form field, Tab through Add visit at 390x844 and 390x430 and 320x844 and 320x430, "What do they need?" focused while under the footer at 430, onboarding steps 2-4 Tab walk at 844 and 430 (320 and 390). "Hidden" is measured with `elementFromPoint` down the field, so it catches any overlay including pseudo-elements. Also: 320 inbox meta line above one row of actions, unclipped Schedule title (first view, Month, Week), rail on one line.
- **a11y r2 check** `a11y-r3-fix-check.mjs`: **30/30**. open-cards-r4: **33/33**.
- **Deploy gate:** **72/72** (release-4 HEAD line, one fresh offline process per step, `receipts/gate/SUMMARY.tsv`).
- **Browser suites** (`receipts/browser/SUMMARY.tsv`): desk-daily-work 12/12, desk-details-save-recovery 29/29, connector-pages 55/55, request-followthrough 12/12, request-automation 18/18, onboard-validation final 16/16, onboard-recovery 59/59, customer-onboarding entry 21/21, full 53/53, plan 26/26, p3-ui 45/45, p3-desk-ui 12/12, fc01-06 and qa-adversarial all pass, site-ui 478/0 issues. guided-walkthrough 13/14 is the same failing test as on the unpatched base (rev 1 receipts).
- **Screenshots** `screenshots/` (rev 2 at 320/390/1440, plus `rev1-*` for the QA cases). Checked by eye: no band below Save, Note and "What do they need?" clear of the footer, 320 inbox and Schedule titles intact.

## Limits

Chrome only; keyboard simulated by a 430px-tall viewport (Android-like). iOS Safari's visual viewport was not tested.
