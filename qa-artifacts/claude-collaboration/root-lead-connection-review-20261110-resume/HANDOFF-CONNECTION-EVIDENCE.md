# Connection outcome evidence repair

The original `b54122a8` stack can tell an owner that an unsubmitted request was saved. At 390 and 1440, independent browser probes reproduced this after unrelated voice-row maintenance, another tab's SMS correction with different details, and another tab's initial SMS registration. `updatedAt` and `submissionRevision` do not identify the held submission.

The child on `work/root-connection-evidence-20261110` changes only `desk-connections.js` (7 additions, 8 removals). Its SHA-256 is `f710b9c16c25b70abe341857bb5103499b25c01fcb259d3c04e7e50c5e1d7072`. It retains uncertainty for the three actions whose current DTOs expose no submission-bound receipt: `request_voice_activation`, `request_messaging_activation`, and `correct_messaging_activation`. A received `ok:true` reply still confirms its own request. Other action-specific outcome checks and the service-approval receipt path remain unchanged.

This is engineering-complete and awaits independent review. Original Claude branches remain unchanged. No backend, provider, settings, purchase, activation or deployment operation occurred. The original one-write release limit is unrelated and unchanged.

The JSON receipts, hashes and failure dispositions are in `ENGINEERING-RESULT.json`. Selected checks:

| Check | Original | Child |
|---|---|---|
| Unrelated voice maintenance at both widths | 2 unsafe claims; 3/5 including hygiene | 5/5 |
| Another tab's SMS correction, plus empty issue-list controls | 3/5 | 5/5 |
| Actual voice positive and lost acknowledgments, SMS concurrency and no-issue controls | Voice-only weaker variant 7/9 | 9/9 |
| Initial SMS actual-handler acknowledgment, lost reply, and another tab's different initial request | 3/7; two unsafe competing-request cases and two changed conservative expectations | 7/7 |
| Original SMS correction/form suite | 27/27 at b541 | 27/27 |
| Original connection-errors suite | Claude-reported 71/71 before the new cases | 69/71, with the two obsolete certainty assertions preserved |
| Corrected expectations for the two lost-voice cases, plus negative/hygiene controls | Old assertion requires unsupported certainty | 7/7 |

The two original connection-suite failures are intentional expectation changes, not silently waived failures. They demand a saved claim from `updatedAt` after a lost reply. `connection-recovery-check.mjs` is a copied suite with exactly those expectations changed to retain uncertainty and inputs. Run only its affected `phone request · existing intent` cases; the original 69 passing checks are reused. This is 71 effective checks with two explicit replacements, not a fresh full-suite green claim.

The initial actual-voice probe exposed a fixture gap: the inherited harness denied four loopback background-dispatch attempts. No physical egress happened. Those failed receipts are preserved. The final probe intercepts only the exact local `/api/voice-activation-background` POST and returns 202; every other transport remains denied and no worker runs.

## Independent rerun

Use this worktree, installed Playwright, and the bundled headless shell. Start the process with an empty environment except PATH and `MC_PLAYWRIGHT_EXECUTABLE`; the harness installs only synthetic settings. Choose fresh `--output` filenames with the shown prefixes.

- Voice maintenance: `node qa-artifacts/claude-collaboration/root-lead-connection-review-20261110-resume/connection-unrelated-update-probe.mjs --only "root unrelated" --output scratchpad/claude-connerr-independent-voice.json` → 5/5.
- Actual voice acknowledgment and SMS competing correction: `node qa-artifacts/claude-collaboration/root-lead-connection-review-20261110-resume/sms-evidence-probe.mjs --output scratchpad/claude-smsfix-independent-ack.json` → 9/9.
- Actual initial SMS acknowledgment and competing request: `node qa-artifacts/claude-collaboration/root-lead-connection-review-20261110-resume/sms-initial-request-probe.mjs --output scratchpad/claude-smsfix-independent-initial.json` → 7/7.
- Corrected voice expectation: `node qa-artifacts/claude-collaboration/root-lead-connection-review-20261110-resume/connection-recovery-check.mjs --only "phone request · existing intent" --output scratchpad/claude-connerr-independent-recovery.json` → 7/7.

Original served bytes are retained in `evidence/root-connections-original-b541.js`. Voice-only weaker bytes are in `evidence/root-connections-conservative-variant.js`. Voice probes accept `--serve-connections <absolute-file>`; SMS probes accept `--serve-file desk-connections.js=<absolute-file>`. Their receipts pin served bytes separately from worktree bytes.

All passing final receipts report stable source, zero physical/denied transport, zero forbidden destinations and zero page errors. No full64 gate, integrated source acceptance, headed browser, screen reader or provider delivery is claimed. Reopening an SMS form while held was not covered, so draft persistence across closing/reopening is not claimed.
