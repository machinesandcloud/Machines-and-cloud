# PRA-A11Y-01..07: proposed fixes

**Not applied to tracked files, not committed, not pushed. No provider was called.**

- **Patch:** `a11y-r3-fix-on-d35c2de6.patch`. It applies cleanly (`git apply --check`) on release-4 `d35c2de6` (633eacba + FC-01..06 + QA D1-D3). It touches 8 files, +43/-23.
- **Check:** `checks/a11y-r3-fix-check.mjs`. Playwright 1.64.1 with system Chrome. Desk assets and owner handlers run in-process on a memory store with the fake model. Non-loopback browser requests are aborted and Node sockets are denied. It ran under `harness/run1.sh` (`env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1`, `sandbox-exec` deny-remote).

## Results

| Run | Result |
|---|---|
| Check on the fixed copy, at 1440 and 390 | **24/24**, physicalNetwork 0, pageErrors 0, forbidden 0 (`receipts/fix/`) |
| Same check on unfixed `d35c2de6` | **2/24**. The two passes are the unsaved-Escape regression guards, which should pass before and after (`receipts/baseline/`) |
| Mutants (one piece reverted each) | **13/13 killed** (`receipts/mutants/mutants.tsv`) |
| netlify.toml gate, 71 `node scripts/*.mjs` steps, one fresh offline process each | **71/71 exit 0** on the final patch (`receipts/gate/SUMMARY.tsv`) |

## Fixes

**01, Escape after a save (desk.js).** The `cancel` listener now calls `preventDefault()` and then `closeVisit()`, so Escape takes the same path as Close: `visitBusy` guard, `visitReturnTarget()`, focus. As a backstop, the `close` listener refocuses `visitReturnTarget()` only when focus has fallen to `<body>`. Checked:
- Request > Schedule a visit > save > Escape or Close: focus lands on that request's View request button in the Done list, with a visible 4.22:1 ring.
- Customers > Edit > save > Escape or Close: focus lands on the same View visit button.
- Mutant M01 reverts both parts and fails the 4 Escape checks. Either part alone passes, by design (belt and braces). Copies were deleted after the runs.

**02, hours errors (desk.js).**
- New `cfgHoursProblems()` lists each bad day with the field to fix.
- Client validation writes a message per day, e.g. "Monday: add a closing time later than the opening time." or "Tuesday: add an opening time." It leaves out the closed-day rule, which is already the linked `#hoursNote` hint.
- `cfgShowErrors` marks only the offending days' open and close inputs, plus the day of a server-returned field. Focus still goes to the first bad field.
- Checked with one bad day (2 fields marked, Saturday unbordered) and two bad days (4 fields marked, both days named). Editing clears the marks.

**03, Find available times (desk-visits.js).** When the check started from the button, focus returns there after the run completes or fails, provided focus has dropped out of the dialog. If the button is still disabled or hidden, focus goes to `#visitAvailabilityStatus` (tabindex -1). The next Tab reaches the first listed time. Checked in Add visit and in request > Schedule a visit.

**04, Customers return target (desk.js).** `visitReturnTarget()` gains a `data-customer-visit` branch.

**05, contrast (CSS).** This ports `8bdefdf8` (`design-system.css`, `product-ui.css`) and `c9204a7d` (`desk-calendar.css`, `desk.css`, `onboard.css`) unchanged. Both applied cleanly; `onboard.css` with a 7-line offset.
- Plain product links use `--ui-blue`. Customers phone links measure 5.89:1 and the Connections website link 5.73:1, up from 3.68 and 3.58.
- The focus ring is `--mc-focus` #4776e4: 4.22:1 on white and 3.90:1 on #f4f6f9, up from 2.25 and 2.07. Checked on View visit, inside the visit dialog, on the sign-in "Keep me signed in" checkbox, and on a probe of the shared rule.
- The check also asserts that no visible text link on Connections is under 4.5:1.
- `c9204a7d`'s public-site and hero items were per-branch patch files, not tracked changes, so they are not part of this port.

**06, hours names (desk.html, desk.js).**
- Both grids are `role=group`, labelled by the visible "Business hours" and "Appointment hours" labels (new ids `hoursLabel` and `cfgAppointmentHoursLabel`).
- Inputs read e.g. "Monday opening time".
- Every input has `aria-describedby="hoursNote"`, followed by the error id.
- The check uses Playwright's accessible-name role query.

**07, request filter (desk.html, desk.js).**
- A new `#requestFilterStatus` (sr-only, role=status, polite, atomic) announces "N open/done request(s) shown" only when the owner switches. It stays empty on load and on refresh.
- The choice persists: the reset in `renderPortal` is removed, and the choice is kept in `sessionStorage` (`mc-desk-request-filter-v1`, try/catch) for this tab.
- The existing `requestOpenNew` "New" badge still signals new open requests while Done is shown.
- Checked across Customers, Schedule, a desk refresh and a full reload.

## Notes for QA

- Behaviour change (07): the Done view no longer snaps back to Open after any refresh. This is the acceptance criterion. Product may still want that reset on sign-in; `sessionStorage` is per tab, so a new tab starts on Open.
- The hours inputs' own border (#dce2e9) is not part of these findings or of `c9204a7d` (which covers `.form-input`), so it is left unchanged.
- `scripts/portal-revamp-ui-qa-check.mjs` and `scripts/service-onboarding-ui-qa-check.mjs` assert 14 unique, non-empty hours labels. That still holds, but those Playwright checks are outside the gate and were not rerun here.

## Revision 2 (after QA-REVIEW.md)

- **Patch:** `a11y-r3-fix-r2-on-d35c2de6.patch` replaces the r1 patch and applies cleanly on `d35c2de6`. The delta from r1 is `r2-delta-on-r1.patch` (desk.js only).
- **F1 (required):** `cfgShowErrors` adds the cfgField day only when the error key names a day (`/^rules\.hours\.\w+/`). A bare `rules.hours` server error with no client problem day now marks all 14 inputs again, while `rules.hours.sat.close` still marks only Saturday. New check: `A02-hours-server-{generic,day}`. Mutant `M02-generic-marks-monday` is killed.
- **F2 (optional, done):**
  - The memory key is now `mc-desk-request-filter-v1:<slug>`.
  - `setRequestFilter(value, remember)` stores only the owner's own click. The automatic switch after scheduling, and the held-request switch on refresh, still update the view but are not stored, so a reload returns to Open.
  - New check: `A07-autoswitch`. Mutants `M07-auto-persists` and `M07-unscoped-key` are killed.
- **F3 (Safari click focus):** not changed. Keyboard starts are covered, and no Safari runner is available offline here.
- **Results (r2, `receipts/r2/`):**
  - Check: **30/30** at 1440 and 390 (system Chrome, offline, physicalNetwork 0).
  - Mutants: **16/16 killed**.
  - netlify.toml gate: **71/71 exit 0**.
  - Copies deleted afterwards.
