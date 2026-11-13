# QA review: PRA-A11Y-01..07 fix (`a11y-r3-fix-on-d35c2de6.patch`)

**Decision: ACCEPT, with one small required fix (F1) before merge.** F2 and F3 are notes, not blockers. No provider calls, no push, no commit. The throwaway copies were deleted.

## Setup
- Two copies made with `git archive d35c2de6`, excluding `qa-artifacts/` and `scratchpad/`: `base` (unfixed) and `fix` (patch applied cleanly, 8 files). They used about 55 MB, `node_modules` was symlinked to `p10/nm`, and both copies were deleted afterwards.
- Every run was a separate process under `env -i` with `MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 MC_LOCAL_NO_KEYS=1` and `sandbox-exec` deny-remote (the author's `run1.sh` and `deny-net.sb`). Browser: system Chrome through Playwright at `/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs`.

## Reproduction
| Item | Result |
|---|---|
| Author check, fix copy | **24/24**, physicalNetwork 0, pageErrors 0, forbidden 0 (`receipts/author-check/fix.log`) |
| Author check, base | **2/24**, matching the author's baseline (`receipts/author-check/base.log`) |
| netlify.toml gate, 71 steps on the fix copy | **71/71 exit 0**, including `smoke` and `build-site` (182 html) (`receipts/gate/SUMMARY.tsv`) |

## Existing Playwright UI suites the author skipped (fix vs base)
| Suite | fix | base | Note |
|---|---|---|---|
| desk-daily-work-ui | 12/12 | 12/12 | |
| desk-details-save-recovery-ui | 29/29 | 29/29 | |
| onboard-hours-resume-ui | pass | pass | |
| request-followthrough-ui (inbox Open/Done) | 12/12 | 12/12 | |
| customer-onboarding-ui --phase full | 53/53 | 53/53 | |
| onboard-recovery-ui | 59/59 | 59/59 (rerun after a session restart) | |
| connector-pages-ui | 55/55 | 55/55 | |
| p3-ui / p3-desk-ui | 45/45, 12/12 | 45/45, 12/12 | Launch line swapped to `channel:'chrome'` in a copy only |
| FC01..FC06 + qa-adversarial | 6, 4, 4, 4, 4, 8, 22, all pass | same | Dialogs touched by FC-01/02/06: no regression |
| portal-revamp-ui-qa | 22/31 | 22/31 | **Identical 9 failures, all pre-existing and stale.** The `[data-t=know]`/`[data-t=convs]` selectors are gone, so its hours-label check cannot run on either copy |
| service-onboarding-ui-qa | 7 fail | 7 fail, same names | Stale, as recorded in STALE-SUITES.md |
| onboard-create-lost-response | 1 fail | 1 fail, same | "forbidden API route", pre-existing |

None of these suites shows a regression. Because portal-revamp is stale, the hours accessible names are covered only by the author's A06 and my ARIA snapshot below.

## Independent keyboard and screen-reader probe (`receipts/qa-probe.mjs`, `receipts/probe/`)
- **Escape paths (01/04).** These all pass on both copies:
  - Escape from a visit opened in the Schedule calendar returns to the calendar item (1440).
  - Escape during a pending save keeps the dialog open (the `visitBusy` guard holds).
  - Request > Schedule a visit > Escape without saving returns to View request, and no dialog is left open.
  - The request dialog's own Escape is unchanged.
  - The 390 calendar case could not be driven on either copy because the probe could not reach the item, so it is not a regression.
- **ARIA snapshot (06).** It shows `group "Business hours"` > `textbox "Monday opening time"` and `group "Appointment hours"` > `textbox "Monday appointment opening time"`. After a bad Wednesday, focus goes to "Wednesday opening time", which is described as "Leave both times blank for a closed day... | Wednesday: add an opening time."
- **Server per-day error (02).** The server error `rules.hours.sat.close` marks only Saturday and focuses Saturday closing. Base marked all 14 inputs, so this is an improvement.
- **Filter (07).** Clicking the already-selected filter announces nothing. The status node is not inside any hidden or aria-hidden ancestor.
- **Contrast (05).**
  - The onboarding aside focus ring is now #fff on navy, 15.0:1 (base #2359df, 2.55:1).
  - Input borders are #7d8da5, 3.37:1 (base 1.75:1).
  - The navy workspace tab ring is drawn inset over a navy band, and the screenshot shows it clearly at 390.

## Visual check of the contrast port (`receipts/shots/`)
- **index, about, admin, desk Connections, desk Account:** 0 changed pixels at 1440 and 390.
- **onboard, sign-in, desk Business details, Customers, Schedule:** the only differences are the darker input borders and the date-jump input border. The side-by-sides show no layout shift.
- **Larger diffs on Today, Inbox and tab focus:** these come from scroll position, focused skip link, IDs and timestamps. The same kind of diff appears between two base runs (`pixel-noise-base-vs-base.tsv`), so they are not CSS changes.

## Findings
**F1 (required, low): a whole-grid hours error now highlights only Monday.**
- When Review returns `fieldErrors['rules.hours']="Add your business hours."` (setup.mjs:44, all days blank), `cfgShowErrors` finds no client problem days.
- It then adds `cfgField('rules.hours').dataset.d`, which is the Monday input, so only Monday is marked invalid.
- That wrongly implies Monday is the problem. Base marked every day. Reproduced in `probe2-fix.log` (`hours-server-generic`: `["mon.open","mon.close"]`).
- Fix in `desk.js` `cfgShowErrors`: add `field.dataset.d` only when `name` names a day (`/^rules\.hours\.\w+/`). For the bare `rules.hours` key with no client problem days, leave `days` empty so the existing `||'input'` fallback marks every row.

**F2 (note): an automatic switch to Done is also saved for the tab.**
- After an owner schedules a visit from an open request, `showRequestFor` switches the filter to Done.
- That switch now goes through `setRequestFilter` into sessionStorage, and nothing announces it.
- After a reload, the owner lands on Done with the remaining open request hidden. Open still shows its count (1), but the New badge is off (`autoswitch-*` in the probe log).
- The lead accepted Done persisting. Product may want only owner-clicked switches to persist. The key `mc-desk-request-filter-v1` is also not scoped to the workspace slug.

**F3 (note): Safari may lose focus after Find available times.** `keepFocus` relies on the button being focused when clicked. Safari does not focus buttons on mouse click, so a click start there can still lose focus. Keyboard starts are fine everywhere.
