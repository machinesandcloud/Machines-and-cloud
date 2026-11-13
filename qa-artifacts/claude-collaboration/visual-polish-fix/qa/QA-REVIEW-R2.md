# Independent QA, round 2: visual polish rev 2 on `549aaf33` (= production product `2180487e`)

**Verdict: ACCEPT.**
- R1-R6 from round 1 are fixed at 320, 390, 768 and 1440, including the keyboard-height (430px) cases.
- The stack 549aaf33 → polish rev 2 → copy (`copy-clarity-rebased-on-a11y-r2-and-polish.patch`) applies cleanly, passes the gate and keeps a11y focus behaviour.

No provider calls, push or commit. Every run was offline: `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1`, `sandbox-exec` deny-remote, loopback only, physicalNetwork 0 and 0 page errors in every walk. Throwaway `git archive 549aaf33` copies were deleted afterwards.

## Reproduced

| Item | Result |
|---|---|
| `visual-polish-rev2-on-549aaf33.patch` | sha256 `17f3dace…7cbc1c` matches PROPOSALS-R2. `git apply` is clean. |
| Copy patch on top (rev 2 → copy) | 19 files, all "applied cleanly", no offsets or rejects |
| Deploy gate (72 `node scripts/*.mjs` from `netlify.toml`, fresh offline process each) | **72/72** rev 2; **72/72** rev 2 + copy. Smoke OK; build-site produced 182 HTML pages and 311 files. |
| Author layout check (73 checks, 320/390/1440) | **73/73** rev 2; **73/73** rev 2 + copy; **59/73** rev 1 on 549aaf33. The 14 rev 1 failures are exactly R1, R3, R4, R5 and R6, so the check discriminates. |
| a11y r2 focus check (`a11y-r3-fix-check.mjs`, 30 checks: Escape/Close focus return, hours errors, Find times focus, contrast) | **30/30** on rev 2 + copy |
| Independent walk `qa/r2/harness/walk2.mjs` (system Chrome `channel:"chrome"`, 320/390/768/1440, 844/1024/900 and 430 heights) | rev 2 119/131; rev 2 + copy 120/131. All remaining failures are triaged below as harness artefacts or pre-existing behaviour. Control: on rev 1 the same walk at 390 flags R1 and R3. |

## R1-R6 re-verification (independent walk plus eye review of the screenshots)

**R1, focused field under the sticky footer: fixed.**
- At 320, 390, 768 and 1440, Tab through every request-form field and through Add visit and the visit dialog, at full height and at 430. `elementFromPoint` sampling finds no field overlaid.
- Tapping the visible edge of Note scrolls it clear (`stack-390-request-note-focused.png`).
- The `focusin` → `scrollIntoView({block:'nearest'})` change is scroll-only. The a11y focus-return checks stay at 30/30.

**R2, phantom band: fixed.**
- The `::after` bar is gone. Save sits in a real `.dlg-foot`.
- Under the form, the gap to "One customer text" is normal spacing with no extra rule (`stack-390-request-dialog-bottom.png`).
- At 1440 the footer is pinned with Save inside it (`stack-1440-request-dialog.png`).

**R3, onboarding bar with the keyboard open: fixed.**
- At ≤560px tall the bar is in normal flow (`stack-390-onboard-step3-430.png`), so no field is covered by it.
- At 844 the sticky bar stays, and Tab focus keeps fields clear.

**R4, 320 Inbox: fixed.** Status sits on its own line, then View request and Acknowledge share one 44px row with no clipped labels at 320 and 390 (`stack-320-inbox.png`). 768 and 1440 keep the desktop row.

**R5, Schedule title: fixed.** "November 2026" and the week range show in full at 320 and 390 in Month, Week and Agenda. Nothing extends past the card, there is no h-scroll, and Today keeps its size and place between Month and Week.

**R6, rail: fixed.** Account and Quick tour stay on one line at 320, and the business name and badge share a row again. Sign out is at least 44px.

**Also confirmed, round-1 items:**
- No horizontal scroll at 320 on any walked screen.
- The "Ask the front desk" launcher opens and closes at every width.
- The mobile menu opens, Escape closes it and returns focus to `#navToggle`, and the launcher comes back.
- Copy strings fit the new layouts at 320 (Inbox, Home, Schedule, dialogs).

## Remaining walk failures (none blocking)

- **`customers ran` timeout (all widths).** My harness clicks the Customers sub-tab from Schedule, where it is not shown. This is a harness artefact. The rev 2 delta has no Customers CSS, and round 1 verified no h-scroll there at 320 and 390.
- **`tap "What do they need?"` at 430 returns null.** In a short viewport the field's box is under the footer, so my tap point lands on the footer and the field never gets focus. This is a harness artefact. The Tab walk through the same dialog at 430 passes, and the author's "What do they need? focused at 430" test passes.
- **Onboarding at 430, a 4-7px sliver.** `trade` and `fees` end 4-7px below the viewport after Tab, and the `desiredChannels` checkbox input (a visually hidden native box inside a card) reports offscreen. Nothing overlays these fields; the bar is static at this height. The unpatched 549aaf33 base shows the same or worse at 320x430 (fields 15-76px past the edge, the same checkbox), so this is Chrome's native focus scroll and pre-existing. If desired, a small P3 follow-up could include checkboxes and radios in the `focusin` selector and add `scroll-margin-bottom:8px` to `.ob .form-input`.

## Limits

Chrome only. The keyboard was simulated with a 430px-tall viewport (Android-like); iOS Safari's visual viewport was not tested on a device.

## Artifacts

- `qa/r2/screens/`: rev 2 + copy screenshots.
- `qa/r2/harness/walk2.mjs`
- `qa/r2/receipts/`: gate TSVs, layout logs for rev 1, rev 2 and the stack, walk logs for rev 2, the stack, the rev 1 control and the base control, and the a11y log.
