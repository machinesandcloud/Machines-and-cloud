# Claude handoff: Thumbtack/Angi "Continue setup" resumes the saved request

Card: `AUTO-REVIEW-AC082AD61F551622` (Thumbtack PO). Claude claimed this existing, ready, unowned card; FROM-CLAUDE.md records the claim.

| | |
|---|---|
| Branch | `work/claude-lead-continue-20261110` |
| Worktree | `/tmp/mc-claude-lead-continue-20261110` |
| Base | `dfb0ae7846e66871d849c67566bf9d3b475f46ae` |
| Final source head | `878916b7` |

Changed product paths:
- `desk-lead-sources.js`: base `d9c09539…`, final `836dcbb99f0cdfdbadc585fe305b2199b94cfe1ed032513837156aa0d0ed4150`
- `desk-setup-guide.js`: base `bc6c0a20…`, final `4b3d3b15b199d0e1916474ef5c3bc0db8bad23b08ad251bfc771f0e51f7b6363`
- `desk-setup-guide.css` is unchanged (`fa9c98b9…`).

The commit adding this file adds only documentation. Nothing was merged, pushed or published, and no provider, account or backend change was made.

## Original failures (both widths, after leaving and returning in a new tab)
1. **Thumbtack chooser (partner access pending):** after "Request Thumbtack setup" was saved, Continue reopened "Choose your connection" instead of the saved request. `selfServeChoice()` returned true whenever `managedSetupRequest(row)` existed (base `desk-lead-sources.js:144`).
2. **Angi labels:** the page's "Next" said "Send your setup request to Angi", while the dialog said "Step 2 of 5 · Send the prepared request".
3. **Thumbtack step counts (lead notifications):** the page said "Step 2 of 4", while the dialog said "Step 1 of 3".

Cause of 2 and 3: the page (`desk-setup-guide.js:386-387, 467`) and the dialog (`desk-lead-sources.js:~167, 244`) each computed the step on their own.

## Repair
- **Continue resumes the saved request at its step.** The chooser appears for a saved request only through a new "Set up lead notifications instead" link on the waiting step. "Review partner conversation setup instead" goes back. Neither sends a write.
  - The link is hidden while receipts are pending, which avoids `lead_receipt_uncertain`. It is also hidden in manage mode.
- **One step source.** The dialog computes its step and name once (`announceStep` / `MCLeadSteps`). The page's "Step N of M" and "Next" read that value. When the dialog is closed, the page shows the predicted step.
- **Step names.** The waiting step uses the server's step name. The account step is renamed "Your Angi account" / "Your Thumbtack account".
- **Focus.** Choosing the partner route from the keyboard focuses the dialog title (`focusStage()`) instead of `<body>`. This was QA note 1, and it also applies at base on the Start-setup chooser.
- **Status stays truthful.** Continue sends no write. Nothing says connected or verified without server evidence. The reconnect / "Disconnecting" logic is untouched.

## Checks (`evidence/final/`; served sha256s pinned)

| Check | dfb0ae78 | 878916b7 |
|---|---|---|
| `lead-source-continue-ui-check.mjs` (new) | 4/12 | **12/12** (bundled shell 148 and Google Chrome 156) |
| QA probe `qa/continue-qa-probe.mjs` | 0/8 | **8/8** |
| `lead-source-reconnect-ui-check.mjs` | | 34/34 |
| `connector-pages-ui-check.mjs` | | 55/55, 0 expected failures |
| `lead-source-unconfirmed-ui-check.mjs` | | 15/15 |
| `scripts/request-followthrough-ui-check.mjs` | | 12/12 (first round) |

Every run had 0 physical network calls, 0 page errors and 0 forbidden requests.

**Independent QA: ACCEPT WITH NOTES.** It verified the following:
- **The new self-serve route is accepted by the server.** A saved managed request has state `partner_access_required` and no native record, so `prepare self_serve` passes `lib/lead-connections.mjs:93/96/97`. QA's real write returned 200, with received and deliveryVerified both false.
- **No leaks:** no cross-source leakage and no stale count after closing.
- **Note 1 (focus) is fixed.**
- **Note 2 (manage mode used generic progress):** fixed with a one-condition guard. This and note 1 were verified by the QA probe and the check, but had no second independent QA pass.

## Limits
- **Lead-notification page position:** which of the 3 pages the owner reached is remembered only per tab. A new tab restarts at "Step 1 of 3", and the page and dialog still agree. Keeping the position would need an optional server field.
- **Server wording behind the dialog:** the heading and button text on the page behind the dialog still use the server's wording. Only the count and "Next" are aligned.
- **Partner-ready Thumbtack:** covered by the reconnect suite only.
- Local only.

No DTO/backend gap.

## Integration
1. Review `git diff dfb0ae78..878916b7 -- desk-lead-sources.js desk-setup-guide.js`.
2. The branch touches the same files as the reconnect work already in dfb; it is built on top of it. It is disjoint from Claude's other open branches.
