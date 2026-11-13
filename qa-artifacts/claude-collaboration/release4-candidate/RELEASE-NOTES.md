# Release 4 candidate: release notes (in progress)

**Nothing here is pushed, deployed or merged. No provider was called.** Every run was offline:
- `env -i` with `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1` and `MC_LOCAL_NO_KEYS=1`, no `.env`;
- release 3's `sandbox-exec` deny-remote profile (`harness/deny-net.sb`, loopback only);
- a throwaway `git archive` copy under the session scratchpad (`r4/r4-gate`), `node_modules` symlinked to `scratchpad/p10/nm`. The copy was deleted after the run.

`route.fetch` was never used.

- **Worktree / branch:** `/tmp/mc-claude-release4-candidate-20261113`, `work/claude-release4-candidate-20261113`.
- **Base:** production release 3, `c470c7a7`. Release 4 is a fast-forward from production.
- **Product head tested:** `6aa33436`.

## 1. Result

| Run | Result |
|---|---|
| **Deploy gate**, each `node scripts/…` step of the `netlify.toml` build line in a fresh process | **71/71 exit 0** (`receipts/gate/SUMMARY.tsv`). Release 3's 70 plus `p3-cards-check`. |
| Same build line verbatim as one `&&` chain | `GATE_EXIT=0` (`receipts/gate/gate-chain-tail.log`) |
| `python3 -I scripts/sitecheck.py .` | 182 pages, 0 broken references, 0 sitemap, redirect or canonical issues |
| P3 rev 2 checks (`receipts/p3/`) | unit **11/11**, ui **45/45**, desk-ui **12/12**, the same counts QA accepted in `p3-cards/qa/QA-REVIEW-R2.md` |

## 2. Commits (on `c470c7a7`)

| # | Commit | Piece | Source |
|---|---|---|---|
| 1 | `f6fba244` | **P3 card fixes rev 2**: FC-07, FC-08, FC-09, FC-10, FC-11, ONB-09, ONB-10, ONB-12, ACQ-10, plus the three checks under `qa-artifacts/claude-collaboration/p3-cards/checks/` | `/tmp/mc-claude-p3-cards-20261112/.../p3-cards/patches/r2/all-on-c470c7a7.patch`, applied unchanged with `git apply` (no offsets beyond those QA recorded, no rejects) |
| 1 (same commit) | | **Gate addition**: the offline unit check copied to `scripts/p3-cards-check.mjs` (header comment only differs) and added to the `netlify.toml` build line before `build-site`, mirroring release 3's `uncovered-cards-check`. The CLAUDE.md gate copy is updated to match. | this candidate |
| 2 | `6aa33436` | **SEO descender CSS (PRA-LIVE-01)**: `padding-bottom:0.2em` on `.site-refresh.public-reading .hero-stat-value` | `/tmp/mc-claude-seo-descender-20261113/.../PRA-LIVE-01-styles.patch`, applied unchanged |
| 3 | (this commit) | These notes, receipts and harness | |

**Gate decision.** `p3-unit-check` is pure Node (memory store, fake model, fetch blocked, about 1 s), so it belongs in the gate. `p3-ui-check` and `p3-desk-ui-check` need a Playwright module and a Chromium binary passed by flag, which the Netlify build does not have; they stay in `qa-artifacts` as release evidence and were run here by hand.

## 3. What changes for customers

- **Desk website guide (FC-07):** an unselected required dropdown says what to choose, e.g. "Choose your website builder."
- **Calendar button (FC-08):** "Reconnect Google Calendar" when reconnection is needed; "Ask about Google Calendar" when Calendar is not available; otherwise "Connect Google Calendar".
- **Exports (FC-09):** no address means empty Street, City, State and Zip, not the shop city.
- **Paused account (FC-11):** only services that were running show "Paused"; others show "Setup with our team" or "Not set up yet".
- **Onboarding conflict (ONB-09):** the message names "another device or tab"; "Replace with this page’s answers" opens a confirmation that warns about deletion, with **Replace saved answers** and **Cancel**. Nothing is written before confirmation.
- **Arrival window (ONB-10):** new placeholder and the error "We couldn’t read “X” as an arrival window. Write a start and end time with am or pm, such as 8 am to 12 pm."
- **Finished setup (ONB-12):** the sidebar shows the four completed steps instead of the signed-out welcome.
- **Homepage chat launcher (ACQ-10):** hides, and takes no taps, while it would cover the inquiry submit button or the demo header.
- **SEO pages (PRA-LIVE-01):** gradient hero stat descenders (g, y) are no longer clipped.
- **Local/test only (FC-10):** fake-model website-only marker and a synthetic encryption key in `MC_LOCAL_NO_KEYS` mode. No production behavior.

## 4. Still open, carried from the source reviews

- HOMEOWNER-09: START copy is carrier-registered; owner decision.
- FC-10 second half: a fake-mode activation path relaxes a safety gate; PO decision.
- ACQ-10 refinement (QA, not blocking): use `:focus-visible` instead of `document.activeElement` for the focused-launcher exception.

## 5. Coming later (room left)

- **First-customer FC-01..06:** in QA; the reviewer will produce `qa/fc01-06-on-r3-p3.patch`. Note: P3 touches `desk.js` at two one-line hunks (FC-08, FC-11) that the P3 author reported are outside the FC-01..06 changes.
- **Managed-SMS failure-gap fix:** in progress.

Each will be applied as its own commit on top of `6aa33436`, then the full gate rerun on a fresh `r4-*` copy and these notes updated.

## 6. Harness and receipts

- `harness/`: `mk.sh` (archives from this worktree into `scratchpad/r4/<name>`), `gate.sh`, `run1.sh`, `deny-net.sb`, adapted from release 3's `rc3-scripts`.
- `receipts/gate/`: `SUMMARY.tsv` (71 steps), `p3-cards-check.log`, `gate-chain-tail.log`.
- `receipts/p3/`: unit, ui and desk-ui logs and JSON.
