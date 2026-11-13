# Release 4: independent release QA

**Verdict: GO.** Candidate `dc2097fb` (`work/claude-release4-candidate-20261113`) fast-forwards production `c470c7a7` by 13 commits. Nothing was pushed, committed or deployed, and no provider was called. Every run used a fresh `git archive` copy under the session scratchpad: `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1` and a `sandbox-exec` deny-remote profile that allows loopback only. A probe from inside the sandbox confirmed that `fetch("https://example.com")` fails with `ENOTFOUND`. `route.fetch` was never used: the browser walk fulfils every request in-process, and requests to non-loopback hosts are aborted. All copies were deleted at the end.

## 1. Gate (reproduced)
| Run | Result |
|---|---|
| Each `node scripts/…` step of the `netlify.toml` build line in a fresh process, at the real clock | **72/72 exit 0** (`receipts/gate/SUMMARY.tsv`) |
| The same build line verbatim as one `bash -c` chain | `CHAIN_EXIT=0`; build-site reports 182 HTML pages and 311 files, with internal directories absent |
| The same 72 steps plus the chain, with the clock moved to **18:05 Houston**, the digest fan-out hour (`NODE_OPTIONS=--import fakehour.mjs`; time keeps running from 18:05) | **72/72 exit 0, `CHAIN_EXIT=0`** (`receipts/gate-fanout18/`) |

In both runs, smoke reports that the scheduler ran at 5 gates with all blocks ok, and `managed-reply-recovery-check` passes 20/20.

## 2. Managed SMS, offline end to end (my own probe, not the author's check)
The harness is `harness/probe.sh` plus `probe-tail.mjs`. It appends my scenarios to the unchanged fixture setup of `managed-sms-qa-check.mjs`, which is byte-identical in production and the candidate. It uses the real HTTP handlers, signed Twilio payloads, the installed Blobs SDK compare-and-swap (CAS) and a provider double.

- **Healthy path is byte-identical to production.** Production and the candidate ran the same 8-step transcript: two questions, HELP, AYUDA, STOP, a text after STOP, START, then a question, followed by delivered receipts and 60 minutes of scheduler waves. The recorded data was the same in both: every outbound Twilio POST (To/From/Body/StatusCallback), every Resend email, every TwiML response, the job states, the portal conversation and the leads. **4083 bytes each, identical** (`receipts/sms/tx-prod.json` and `tx-cand.json`).
- **Failure paths (candidate), 13/13 pass** (`receipts/sms/fail-cand3.json`):
  - **Failed receipt:** exactly one customer text across 26 h with no resend. The job stays `failed` and is never marked delivered, and one owner request is created.
  - **Network error before Twilio:** one POST attempt and zero messages reach the provider. The job is `uncertain` with no `providerId`. The owner request comes at 30 min, and the portal shows "not delivered".
  - **401 (20003) and 400 (21610):** one POST each, the job becomes `failed/provider_rejected`, and one request is created. **429:** one POST, `uncertain`, and the owner is told at 30 min. **500:** one POST, `uncertain`. None of these is ever retried.
  - **Owner email cap:** with `tenantLimit` 3, eight customers failing on the same day produce exactly 3 emails on the wire. The other 5 are `waiting_platform/email_budget_exhausted`, none of them is marked sent, and all 8 requests are saved.
  - **Same customer:** 5 failed replies on one day produce 1 email, and the next Houston day produces exactly 1 more.
  - **Sweep under load:** 60 status-callback failures across 3 shops are cleared in sweeps of 25, 25, 10, 0, 0, 0 per run. No run exceeds 25, all 60 are alerted, there are 60 leads and **zero extra customer texts**.
  - **STOP after a failure:** the standard confirmation, and no API text afterwards.
  - **Unverified sender:** a normal text, HELP, STOP, START and another text produce no API text. The inbound rows are `held`, there is one request, and the keyword TwiML is unchanged.
  - **Global check:** across 82 reply jobs, none was attempted twice, and nothing is marked delivered/accepted without a provider message.

## 3. Browser walk (system Chrome, 390 and 1440)
`harness/walk.mjs` runs on fc-lib, using the real `/api/client`, `/api/access`, `/api/chat` and `/api/manage` handlers. Screenshots are in `receipts/walk/`, and **I looked at them**. The walk had 18/20 assertions pass, with physicalNetwork=0, forbidden=0, pageErrors=0 and no console errors. The 2 failures are my own over-strict assertion: a blank Wednesday close marks both Wednesday inputs and says "Wednesday: add a closing time later than the opening time." That is correct per-day behaviour, not a defect.

The walk covered:
- the homepage, including the inquiry section;
- onboarding step 1 with the four service cards;
- desk Home;
- Inbox Open and Done. Done survives a reload and does not leak to a second workspace; the status reads "1 done request shown".
- the visit dialog with the `tel:` and `sms:` links above the fold, where Escape closes it;
- the hours error;
- Customers;
- Connections, where the 390 marks are uniform;
- Account, where the contact cell shows "(713) 555-0198";
- the admin Overview, with the exhausted AI-pool banner and the per-shop "Platform AI limit reached" issue. Below the maximum it says "Raise … (up to 500) or wait". I did not render the at-500 wording in the browser; the author's two killed mutants cover it.

## 4. Diff review (`git diff c470c7a7 HEAD --stat`: 140 files; 36 product files, +709/−79)
I read every server hunk: `managed-delivery`, `managed-history`, `managed-sms`, `client`, `access`, `agent`, `connection-journey`, `fake-model`, `operator`, `self-service-ai`, `manage`, `local-server` and `netlify.toml`.
- `getAIPlatformUsage` returns a result with no value, so it does not write.
- The `local-server` key is set only under `MC_LOCAL_NO_KEYS`.
- The FC-02 acknowledgement failure is swallowed, and the button stays.
- The receipt-correction path only moves a non-`provider_rejected` `failed` row to `delivered`, after a verified provider status read.

## 5. Legal pages (privacy, terms, SMS terms from release 3)
Release 4 changes no public HTML (only `desk.html` and `onboard.html`).
- **SMS terms:** "the first reply written by the automated assistant … says that it is automated." Release 4 makes this more often true for delivered texts: a reply that failed to deliver clears the disclosure, so the next reply discloses again. The residual case B13 is not new; production has it more broadly.
- **Privacy:** lists customer text messages and owner notifications as collected and used, which covers held texts and owner alerts.
- **Terms:** "we do not guarantee … any text … will be delivered", and the daily-limit wording is unchanged and customer-facing.

Nothing in release 4 makes any of these claims untrue.

## 6. Findings (none blocking)
1. **P2: orphaned failure-index keys can stall the owner-alert sweep.** In `runManagedDelivery`, the sweep takes the first 25 unflagged `failures` keys. A key whose delivery row is gone (`row === null`) is never flagged. I seeded 30 such keys, and a real failed reply sorted after them was never alerted (`L2`: realAlerted=false, staleStillOpen=30). Normal erasure prunes the index, so this needs an interrupted erasure or a manual delete. When it happens, the result is production's existing behaviour (no alert), and health already reports open failures. **Fix:** `else if (row) await indexPending(row); else await atomicUpdate(INDEX,"active",v=>v?.failures?.[key]?{value:{...v,failures:{...v.failures,[key]:{...v.failures[key],followedUp:true}}}}:{});`
2. **Ops note:** a Twilio account-wide 401 (the October suspension pattern) now marks every customer reply `failed/provider_rejected` and gives each shop one owner request per customer per day. That is accurate and capped by the email budget, but expect owner emails across all 19 live shops during an account outage.
3. **Copy:** a held inbound text caused by an operator brake or lapsed sender verification on a live shop tells the owner that "texting from it was not switched on". This is slightly imprecise.
4. **Carried from earlier reviews:** B13 disclosure edge, Safari focus F3, HOMEOWNER-09, the FC-10 fake-mode gate, and the FC residuals listed in RELEASE-NOTES §4.
