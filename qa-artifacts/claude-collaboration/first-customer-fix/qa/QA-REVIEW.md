# Independent QA: first-customer fixes FC-01 to FC-06 (patches 01 to 06)

Date: 2026-11-13. Reviewer: independent adversarial QA. I did not review patches 07 to 09.

## Base and rebase

- I built a throwaway `git archive c470c7a7` copy (28 MB), with `node_modules` symlinked to `scratchpad/p10/nm`.
- P3 set: `p3-cards/patches/r2/all-on-c470c7a7.patch` applied cleanly.
- Patches 01 to 06 (written against `e2077b38`) applied in order. `git apply --3way` fell back to direct application. **There were no conflicts.** P3's two one-line `desk.js` hunks (lines ~885 and ~1259) do not touch the code these patches change.
- Combined result: `qa/fc01-06-on-r3-p3.patch` (sha256 `d551bcf7…6e0b`, 7 files). I checked that it applies cleanly to a fresh c470c7a7 + P3 tree.
- Suggested minimal corrections, applied on top: `qa/qa-suggested-fixes-on-fc01-06.patch` (sha256 `bb639fde…0331`, client copy only, 2 files). Also checked to apply.

## Isolation

- Every run used `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1` and the `sandbox-exec` deny-remote profile.
- Canary (`qa/canary-dns.log`): TCP to a public IP returned EPERM, and DNS returned ENOTFOUND.
- Browser checks used fc-lib routing: non-loopback requests are aborted, and fonts are fulfilled with empty CSS. No `route.fetch` was used.
- Every report shows physicalNetwork=0 and forbidden=0.
- No provider call, push or commit was made against any real repository. The commits stayed inside the throwaway copy.

## Results

| Run | Result |
|---|---|
| Full `netlify.toml` gate, 70 commands (`qa/gate/SUMMARY.tsv`) | 69/70 on the first pass. `intake-check` failed only because my gate copy lacked the `scratchpad/` directory (ENOENT writing its receipt). After I created the directory it passes 33/33 (`intake-check.rerun.log`). **The effective result is 70/70.** |
| Author checks fc01, fc06, fc02, fc03, fc04, fc05 on the rebased tree (`qa/author-checks/`) | 6/6, 8/8, 4/4, 4/4, 4/4, 4/4 |
| My adversarial check `qa/checks/qa-adversarial-check.mjs` at 390 and 1440 (`qa/adversarial/`) | **16/22. Six failures: three defects, each failing at both widths.** |
| The same checks plus author fc01, fc06 and fc02 with the suggested fixes (`qa/with-suggested-fixes/`) | 22/22, 6/6, 8/8, 4/4 |

The browser walk at 390 and 1440 is covered by those screenshots. I visually inspected the FC-01 dialog at 390 (Call/Text links are above the fold, targets ≥24px), the FC-03 Home progress at 1440, and the FC-02 ack-failure state.

## Findings

### D1. FC-02 (P2, truthfulness): if the acknowledgment fails, the message still says "This request moved to Done."

To test this, I injected a fault on the single alert write that sets the alert to `acked` (Q02a/b). The journal entry is saved and the alert stays `waiting`. The request correctly stays in **Open** with its Acknowledge button. But the dialog says:

> Action saved. Follow-up complete. This request moved to Done. Its alert is still waiting: press Acknowledge in Inbox …

That first sentence contradicts what the list shows.

- Fix: on `alertAcknowledged===null`, say "Its alert is still waiting, so this request stays in Open: press Acknowledge in Inbox to stop alert reminders." and drop "moved to Done".
- What works: recovery through Acknowledge (Q02c), idempotent replay, and other actions not acknowledging anything.
- Q02f: an emergency still needs a resolution and a note (empty note returns 400 and the alert stays waiting), and only that alert is acknowledged.

### D2. FC-06 (P2, truthfulness): for v1 workspaces the Calendar line reads the legacy field

`visitReceipt` decides "connected" from `data.client.calendar.connected`. `ownerView` derives that from the legacy `calendar.google.refreshToken`, so it is **always false for v1 tenants**. Their connection lives in `calendar_connections` and is exposed as `data.connections.calendar.connected`. I confirmed this precondition from the real handler (Q06b-pre).

Effect: an owner who connected Google Calendar sees "**Google Calendar is not connected**, so this change is only in your workspace." That happens whenever the result has no calendar receipt, for example while sync is waiting for the platform delivery service. The base said "Calendar delivery is not confirmed." in this case, which was true.

- Fix: read `data.connections.calendar.connected` (keeping the legacy field as a fallback).
- How I tested it: the real GET output, with only `connections.calendar` reshaped to connected, because offline fixtures cannot connect Google.
- Minor wording note (not blocking): `calendar-delivery.mjs discover()` backfills future active visits once Calendar is connected. "Only in your workspace" is true now, but a reader may take it as permanent.

### D3. FC-01/FC-06 (P3, truthfulness): a saved phone that can't be dialed shows as "No phone saved"

The AI booking path stores `e164(input.phone) || raw`, and `e164` turns a 7-digit number into `+5551234`. `visitPhoneOk` requires 10 to 15 digits, so the dialog shows "No phone saved" and the receipt shows "No phone is saved for this customer." But a phone is saved.

- Fix: show "Phone saved: +5551234 (check this number)" with no link, and ask the owner to check it with Edit details.
- This is rare: owner-entered visits are validated to US E.164.

### FC-01 (passes)

- Phone links are correct: `tel:+17135550142` and `sms:+17135550142`, and international E.164 numbers also produce valid links (Q01a).
- With no phone, the dialog shows "No phone saved" with no link, and the instruction becomes "Add a phone number with Edit details".
- Names are escaped: injected markup stays text.
- Cosmetic: the dialog title and the "Customer: name" line repeat the name.

### FC-06 truthfulness (passes)

- **No texting:** "The customer was not notified." is true at that moment. `queueManagedRecord` queues the SMS, but the dispatcher parks it as `waiting_platform` when `messagingSender` is null. `messagingSender` uses the same policy, brake and `view(row).active` facts as `connections.messaging.active`. Payment and allowance projections only lower `active`, and the dispatcher then also refuses with `reservePaidUsage`.
- **Residual:** a parked confirmation or reminder can still be delivered later if texting becomes live before the visit. That is not a false statement now, but it is worth knowing.
- **Live texting, the branch the author didn't browser-test (Q06a):** I drove it through a shaped GET. It renders the hedged text with no "not notified" claim. It is slightly over-cautious for details-only edits, which send no text (`confirmationAlreadySent`), but it is not false.

### FC-02 reminder-chain review (passes, with residuals)

- Acknowledging on completion stops only that request's escalation. The deterministic task retires when it sees `acked`.
- A later emergency on the same lead reopens the alert as a new epoch (`openAlert` QA-URG D2), so the safety escalation is preserved.
- Residual: reopening a completed request does not re-arm reminders (Q02d). That is the same as a manual Acknowledge followed by reopen.
- Residual: if the POST response is lost after the journal saved but the acknowledgment did not, `readSaved` reports "Action confirmed in the saved history." with no alert notice. The request still shows in Open with Acknowledge, so it is not stuck.
- I found no path where a request shows Done while its alert is still waiting. `requestIsOpen` keeps any waiting alert in Open.

### FC-03 (passes)

- Home rows match Connections, with no owner task for held services, and the summary arithmetic is correct.
- P3 note: for a held row, the heading uses `availabilityFor(id).status`. In the edge case where Calendar is connected but sync is disabled and channel availability reports Calendar "Available now", the heading would read "Available now" under a "not live yet" note. Using the `platformHold` summary would be more accurate. Not blocking.

### FC-04 (passes)

- Reasons come from a fixed allowlist. The internal `refusal` tag is stripped before the tool result reaches the model.
- The reason priority (workspace, then rules, then incomplete reply, then tool) is sound, and `earlierCheckCurrent` is computed under the same CAS read.

### FC-05 (passes)

- The open-review receipt adds what happens next, with support@machinesandcloud.com and no SLA ("We can't promise a set response time"). It is hidden once the review is resolved.
- "Our team … will email you" is an operational commitment the team must honour.

## Verdict

| Patch | Verdict |
|---|---|
| 01 FC-01 | **Accept with D3 fix** (P3; can ship as is if D3 is tracked) |
| 02 FC-06 | **Reject as is → accept with D2 fix** (false "not connected" for v1 Calendar owners) |
| 03 FC-02 | **Reject as is → accept with D1 fix** (false "moved to Done" on ack failure) |
| 04 FC-03 | Accept |
| 05 FC-04 | Accept |
| 06 FC-05 | Accept |

The D1, D2 and D3 fixes are in `qa-suggested-fixes-on-fc01-06.patch`. They are client copy only and verified at 22/22 adversarial plus the author's checks. The gate was not re-run after them because they are client text only, and `node --check` passes.

Cleanup: the throwaway copies (`fcqa/copy`, `fcqa/gatecopy`) were deleted after this report. Only `fcqa/qa/` remains.
