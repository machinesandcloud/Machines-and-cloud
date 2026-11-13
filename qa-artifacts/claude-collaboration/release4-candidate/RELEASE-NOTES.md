# Release 4 candidate: release notes

**Nothing here is pushed, deployed or merged. No provider was called.** Every run was offline:
- `env -i` with `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1` and `MC_LOCAL_NO_KEYS=1`, no `.env`;
- release 3's `sandbox-exec` deny-remote profile (`harness/deny-net.sb`, loopback only);
- throwaway `git archive` copies under the session scratchpad (`r4/r4-gate`, `r4/r4-gate-fc`, then `r4/r4-gate-sms`), `node_modules` symlinked to `scratchpad/p10/nm`. Each copy was deleted after its run.

`route.fetch` was never used.

- **Worktree / branch:** `/tmp/mc-claude-release4-candidate-20261113`, `work/claude-release4-candidate-20261113`.
- **Base:** production release 3, `c470c7a7`. Release 4 is a fast-forward from production.
- **Product head tested:** `eb973e37` (all four pieces). Earlier runs: `6aa33436` (P3 and SEO), `d35c2de6` (plus FC-01..06 and QA's fixes).

## 1. Result

| Run | Result |
|---|---|
| **Deploy gate at `eb973e37`**, each `node scripts/…` step in a fresh process | **72/72 exit 0** (`receipts/gate-sms/SUMMARY.tsv`). Release 3's 70 plus `p3-cards-check` and `managed-reply-recovery-check` (20/20). |
| Same build line verbatim as one `&&` chain at `eb973e37` | `GATE_EXIT=0` (`receipts/gate-sms/gate-chain-tail.log`) |
| Gate at `d35c2de6`, each `node scripts/…` step of the `netlify.toml` build line in a fresh process | **71/71 exit 0** (`receipts/gate-fc/SUMMARY.tsv`), the full gate after QA's D1-D3 fixes, which QA had not rerun. |
| Chain at `d35c2de6` | `GATE_EXIT=0` (`receipts/gate-fc/gate-chain-tail.log`) |
| Earlier gate at `6aa33436` (P3 + SEO only) | 71/71, `GATE_EXIT=0` (`receipts/gate/`) |
| `python3 -I scripts/sitecheck.py .` at `eb973e37` | 182 pages, 0 broken references, 0 sitemap, redirect or canonical issues |
| FC author checks at `d35c2de6` (`receipts/fc/`) | fc01 **6/6**, fc02 **4/4**, fc03 **4/4**, fc04 **4/4**, fc05 **4/4**, fc06 **8/8** |
| QA adversarial check at `d35c2de6`, 390 and 1440 (`receipts/fc/`) | **22/22** (16/22 before QA's fixes, per QA-REVIEW.md) |
| P3 rev 2 checks, rerun at `d35c2de6` because FC changes `desk.js` (`receipts/fc/p3-*`) | unit **11/11**, ui **45/45**, desk-ui **12/12**; also 11/45/12 at `6aa33436` (`receipts/p3/`), the counts QA accepted in `p3-cards/qa/QA-REVIEW-R2.md` |

The browser checks were not rerun at `eb973e37`: the managed-SMS fix changes only server modules and the gate line, no browser files.

Every browser report shows physicalNetwork=0, forbidden=0, pageErrors=0.

## 2. Commits (on `c470c7a7`)

| # | Commit | Piece | Source |
|---|---|---|---|
| 1 | `f6fba244` | **P3 card fixes rev 2**: FC-07, FC-08, FC-09, FC-10, FC-11, ONB-09, ONB-10, ONB-12, ACQ-10, plus the three checks under `qa-artifacts/claude-collaboration/p3-cards/checks/` | `/tmp/mc-claude-p3-cards-20261112/.../p3-cards/patches/r2/all-on-c470c7a7.patch`, applied unchanged with `git apply` (no offsets beyond those QA recorded, no rejects) |
| 1 (same commit) | | **Gate addition**: the offline unit check copied to `scripts/p3-cards-check.mjs` (header comment only differs) and added to the `netlify.toml` build line before `build-site`, mirroring release 3's `uncovered-cards-check`. The CLAUDE.md gate copy is updated to match. | this candidate |
| 2 | `6aa33436` | **SEO descender CSS (PRA-LIVE-01)**: `padding-bottom:0.2em` on `.site-refresh.public-reading .hero-stat-value` | `/tmp/mc-claude-seo-descender-20261113/.../PRA-LIVE-01-styles.patch`, applied unchanged |
| 3 | `633eacba` | These notes, receipts and harness (first version) | |
| 4 | `a409f76c` | **First-customer FC-01..06** (patches 01-06): `desk-requests.js`, `desk-setup-guide.js`, `desk.css`, `desk.js`, `client.mjs`, `lib/agent.mjs`, `lib/owner-test.mjs`. Adds the author's checks (`first-customer-fix/checks/fc-lib.mjs`, `fc01..fc06`) and `QA-REVIEW.md` | `/tmp/mc-claude-first-customer-fix-20261112/.../qa/fc01-06-on-r3-p3.patch` (sha256 `d551bcf7…6e0b`, QA's rebase on c470c7a7 + P3), applied unchanged with `git apply`, no rejects |
| 5 | `d35c2de6` | **QA fixes D1-D3** (client text only, `desk-requests.js`, `desk.js`), plus QA's `first-customer-fix/qa/checks/qa-adversarial-check.mjs` | `.../qa/qa-suggested-fixes-on-fc01-06.patch` (sha256 `bb639fde…0331`), applied unchanged |
| 6 | `56fe2e73` | Notes and receipts updated for FC-01..06 | |
| 7 | `eb973e37` | **Managed-SMS failure gaps (rev 3)**: `lib/managed-delivery.mjs`, `lib/managed-history.mjs`, `lib/managed-sms.mjs`, new gate step `scripts/managed-reply-recovery-check.mjs` (before `build-site`, 72 steps; CLAUDE.md gate copy synced). Patch and `QA-REVIEW-R3.md` copied to `qa-artifacts/claude-collaboration/managed-sms-gaps/` | `/tmp/mc-claude-managed-sms-gaps-20261113/.../patches/managed-sms-gaps-r3-d35c2de6.patch` (sha256 `0e52b856…e8da`), accepted in `qa/QA-REVIEW-R3.md`, applied unchanged |
| 8 | (this commit) | Notes and receipts updated for managed SMS | |

**Gate decision.** `p3-unit-check` is pure Node (memory store, fake model, fetch blocked, about 1 s), so it belongs in the gate. `p3-ui-check` and `p3-desk-ui-check` need a Playwright module and a Chromium binary passed by flag, which the Netlify build does not have; they stay in `qa-artifacts` as release evidence and were run here by hand.

The same applies to FC: all six author checks and QA's adversarial check launch Chromium through `fc-lib.mjs` with `--playwright` and `--out`, so none is a gate step; they were run by hand on the gate copy (the adversarial check is copied beside `fc-lib.mjs` to run). The FC patches add no pure-Node check. The managed-SMS patch adds its own pure-Node step, `managed-reply-recovery-check`, so the gate is 72.

## 3. What changes for customers

- **Desk website guide (FC-07):** an unselected required dropdown says what to choose, e.g. "Choose your website builder."
- **Calendar button (FC-08):** "Reconnect Google Calendar" when reconnection is needed; "Ask about Google Calendar" when Calendar is not available; otherwise "Connect Google Calendar".
- **Exports (FC-09):** no address means empty Street, City, State and Zip, not the shop city.
- **Paused account (FC-11):** only services that were running show "Paused"; others show "Setup with our team" or "Not set up yet".
- **Onboarding conflict (ONB-09):** the message names "another device or tab"; "Replace with this page’s answers" opens a confirmation that warns about deletion, with **Replace saved answers** and **Cancel**. Nothing is written before confirmation.
- **Arrival window (ONB-10):** new placeholder and the error "We couldn’t read “X” as an arrival window. Write a start and end time with am or pm, such as 8 am to 12 pm."
- **Finished setup (ONB-12):** the sidebar shows the four completed steps instead of the signed-out welcome.
- **Homepage chat launcher (ACQ-10):** hides, and takes no taps, while it would cover the inquiry submit button or the demo header.
- **Visit dialog (FC-01):** the customer's name and tap-to-call / tap-to-text links sit above the fold; with no phone, "No phone saved" and "Add a phone number with Edit details". A saved number that can't be dialed shows "Phone saved: X (check this number)" with no link (QA D3).
- **Visit receipts (FC-06):** with no live texting, "The customer was not notified. Call or text them at …". The Calendar line reads the v1 connection (QA D2), so a connected owner is no longer told Calendar is not connected.
- **Completing a follow-up (FC-02):** acknowledges that request's alert and moves it to Done. If the acknowledgment fails, the message says the request stays in Open until Acknowledge (QA D1).
- **Home progress (FC-03):** services held for our team show "Setup with our team", no owner task, and are not counted as owner work.
- **Practice checks (FC-04):** a reply that does not count names the real reason and says when an earlier check still counts.
- **Review requests (FC-05):** says our team will email, no promised response time, and gives support@machinesandcloud.com.
- **Customer texts that fail (managed SMS):** an undelivered or unconfirmed AI reply is recorded and gives the owner one request per customer per Houston day (reopened if already resolved), with no extra customer texts. A late delivered receipt corrects the status. If the reply carrying the automated-assistant intro was undelivered, the next delivered reply carries it.
- **SEO pages (PRA-LIVE-01):** gradient hero stat descenders (g, y) are no longer clipped.
- **Local/test only (FC-10):** fake-model website-only marker and a synthetic encryption key in `MC_LOCAL_NO_KEYS` mode. No production behavior.

## 4. Still open, carried from the source reviews

- **Known follow-up, managed SMS 30-minute disclosure edge (QA-REVIEW-R3 B13, accepted for shipping).** If the first reply's send result is unknown (no response, no callback) and the customer texts again within 30 minutes, the second reply has no intro. Harmless when the first text really reached the provider (the usual cause); if it never left (network failure before Twilio, or a crash before the POST), the customer's first delivered text lacks the disclosure. Rare, one conversation, visible to the owner at 30 minutes, no duplicate or unconsented text. Fix: in `processManagedSMS`, treat the intro as not given while the reply that set `disclosedAt` has its `sms_reply:<sid>` job `uncertain`, or `sending` with no `providerId`; record the SID as `disclosedBy` in `appendHistoryOnce`. Cost: at most one extra intro. Legal or the PO should confirm the residual until then.
- Managed SMS non-blocking notes (R3): any documented Twilio 4xx now marks a managed SMS `failed/provider_rejected`; a failure after the owner closed that day's request attaches to the closed request with no email (PO to confirm); an undelivered reply settles its AI answer at 0.

- HOMEOWNER-09: START copy is carrier-registered; owner decision.
- FC-10 second half: a fake-mode activation path relaxes a safety gate; PO decision.
- FC residuals from QA-REVIEW.md, none blocking: a parked confirmation or reminder can be delivered later if texting goes live before the visit; reopening a completed request does not re-arm reminders; a lost POST response after the journal saved but the ack did not shows no alert notice (the request stays in Open); FC-03 held-row heading can read "Available now" in one Calendar edge case; "Our team will email you" (FC-05) is a commitment the team must keep; real-model wording for FC-04 is unchecked (fake model only).
- ACQ-10 refinement (QA, not blocking): use `:focus-visible` instead of `document.activeElement` for the focused-launcher exception.

## 5. Coming later (room left)

Nothing pending. All four pieces are in (P3 rev 2, SEO descender, FC-01..06 with QA fixes, managed-SMS gaps).

## 6. Harness and receipts

- `harness/`: `mk.sh` (archives from this worktree into `scratchpad/r4/<name>`), `gate.sh`, `run1.sh`, `deny-net.sb`, adapted from release 3's `rc3-scripts`.
- `receipts/gate/`: `SUMMARY.tsv` (71 steps), `p3-cards-check.log`, `gate-chain-tail.log`.
- `receipts/p3/`: unit, ui and desk-ui logs and JSON at `6aa33436`.
- `receipts/gate-fc/`: `SUMMARY.tsv` (71 steps) and chain tail at `d35c2de6`.
- `receipts/gate-sms/`: `SUMMARY.tsv` (72 steps), `managed-reply-recovery-check.log` and chain tail at `eb973e37`.
- `receipts/fc/`: FC author checks, QA adversarial check and the P3 rerun at `d35c2de6`, logs and JSON (screenshots not kept, to save disk).
