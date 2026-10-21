# Sprint 7: the critical path, the records we keep, and what to turn off

Owner: Product Manager. Cut from `BACKLOG.md` Round 7 (R7.1, 2026-10-20). Same working rules as sprints 1 to 6. All eight Round 7 build items were delivered before this cut (commits `61ab09e` for items 1 to 3, `ee62706` and `426c051` for items 4 to 8; DECISIONS.md 2026-10-20 "round 7 MUSTs" and "round 7 items 4 to 8"), so every ticket starts as `delivered` with the engineer's note and carries the PM's verdict.

Status legend: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` | `returned`.

## 1. Sprint goal

Put the first paying shop on a dated path whose long pole (Machines & Cloud's own 10DLC brand and campaign for the bridge sender) is filed first; keep the records that must survive a shop's deletion and say what the providers retain; audit what happened today rather than what was stamped once; order the owner's first month so the review precedes the bill; turn off the two defaults that cost a one-truck Starter shop more than they return; make the portal usable at 390 px; measure the two classifiers before choosing a model; and give Steve a Needs-me list whose lines clear themselves. The keyed pass stays reserved first and now sits inside the dated path.

## 2. Tickets

### S7-01 The critical path to customer one, dated, longest lead time first
Status: verified 2026-10-20 (repo): OPERATIONS.md carries the seven-step dated table with who, lead time, and proof, the brand and campaign filing first with its one-to-six-week wait named and the keyed pass as step 4; DECISIONS.md holds "Submission date: not yet filed" and "Campaign VERIFIED date: pending".
Size and scope: Size: S. Implements: Round 7 item 1 (MUST).

Engineer note: OPERATIONS.md section "The critical path to customer one" is a dated table, brand first (1 to 2 weeks typical, up to 6); DECISIONS.md holds "Submission date: not yet filed" and "Campaign VERIFIED date: pending" for Steve to fill.

Acceptance (repo): the OPERATIONS.md table has seven numbered steps with who, lead time, and proof, step 1 being the brand and campaign filing with its wait named; DECISIONS.md carries the two date lines; the keyed pass is a step on the path.

### S7-02 Opt-out records survive a shop's deletion; the policy names provider retention
Status: verified 2026-10-20 6ad7bc94dc1c8c61db6b1c10: a STOP on a fresh number was recorded with the shop's slug; after `admin delete` the record survived with `slug` empty and `formerSlug` set to that shop; a booking on another shop for that number produced `sms_blocked` and no send; a `vip_voicemail` event stored the `RecordingSid`; the policy page names Twilio's 13-month retention and says stop requests are kept. The Twilio-side recording deletion is keyed.
Size and scope: Size: S. Implements: Round 7 item 2 (MUST); assumption 4.

Engineer note: `admin delete` keeps every opt-out, clears `slug` and keeps `formerSlug`; a text to that number from another shop logs `sms_blocked`; VIP voicemail events store the `RecordingSid` and delete removes the recordings at Twilio when keys exist; `DATA_POLICY` and the policy page name Twilio (logs up to 13 months, recordings until we delete them) and the voice provider, and say stop requests are kept.

Acceptance (now, draft): a STOP recorded on shop A survives `admin delete` of shop A with `slug` empty and `formerSlug` set; a confirmation from shop B to that number is refused with `sms_blocked`; a `vip_voicemail` event stores `sid`; the policy page and `DATA_POLICY` contain "13 months" and say stop requests are kept.
Acceptance (keyed): delete removes the shop's VIP recordings at Twilio.

### S7-03 The nightly rubric audits what happened today
Status: verified locally with the real model 2026-10-21 (Opus, in-memory store, provider keys disabled): the clean SMS thread was stamped for today with no reasons; after the verification hook replaced that thread with an unpublished price, it and the test-channel thread were classified as `price_not_listed`; the test event stayed out of Needs-me and the direct digest note. Evidence: `scratchpad/pm-real-model-flows.json`, 20 of 20 checks across this pass. This proves the direct audit/digest path, not scheduled next-day delivery; that timing follow-up is recorded separately. Earlier fake-model evidence is retained below as history.
Size and scope: Size: S. Implements: Round 7 item 3 (MUST).

Engineer note: `autoFlag` carries `day` and `test`; a thread stamped on an earlier day is audited again; test-line hits log `auto_flag` with `test: true` and are excluded from the Needs-me count and Steve's digest note; `put_conversation` clears the stamp for tests.

Acceptance (now, draft): a conversation audited clean today carries a stamp with `day` and empty reasons; the same thread with an unlisted price added is audited again and flagged; a test-channel conversation quoting one produces an `auto_flag` event with `test: true` that the `?full=1` `autoFlags7d` count and the digest `steveNote` exclude; by code, a stamp whose `day` is not today is re-audited.

### S7-04 The month reads in order; the first promise is tracked
Status: verified 2026-10-21 on the local server at commit 00a1b0a, in-memory store: a shop live eight days with no `day7Sent` got no `trial_over` across a run; after `day7Sent` was set it got exactly one across two runs; `?full=1` carries `newShopDays`, `liveDays` (8), and `lifecycle`; the loaded admin render shows the "call promised within one business day" line with its Called button.
Size and scope: Size: S. Implements: Round 7 item 4 (SHOULD).

Engineer note: `trial_over` requires `lifecycle.day7Sent` (admin update `{"lifecycle":{"day7Sent":"..."}}` or the Needs-me "Sent" button); `GET ?full=1` carries `newShopDays`, `liveDays`, `lifecycle`.

Acceptance (now, draft): a shop live eight days with no `day7Sent` gets no `trial_over` on a run; after `day7Sent` is set it gets exactly one; `?full=1` rows carry `newShopDays`, `liveDays`, and `lifecycle`; the page shows "call promised within one business day" from `createdAt` until `onboardingCallAt` (page code).

### S7-05 Two defaults a one-truck Starter shop should not get
Status: verified locally with the real model 2026-10-21 for the Growth half: one `/api/chat` test-line booking for 2026-10-24, 8 to 12, stored the booking and its `reminder_24h`, `reminder_1h`, and `visit_check` tasks on the same booking id. The reply included the published $89 fee, arrival window, and consent sentence with no planning text. Earlier Starter, quiet-day, and Monday-report checks stand. Evidence: `scratchpad/pm-real-model-flows.json`. Customer texts were logged locally; arrival and delivery are still keyed acceptance.
Size and scope: Size: S. Implements: Round 7 item 5 (SHOULD); assumption 3.

Engineer note: a quiet day logs `digest` with `emailed: false` and sends the owner nothing; the Monday email adds "Quiet days: N"; `scheduleReminders` creates `visit_check` only on Growth and Pro, and `runVisitCheck` returns "nothing waits on done" on Starter without an invoice.

Acceptance (now, draft): a Starter shop with nothing today: `run_scheduler force_hour=18` logs `digest` with `empty: true`, `emailed: false`, `texted: false` and no owner send; the Monday email reads "Quiet days: N"; a Starter booking creates no `visit_check`; a manually scheduled check on it returns "nothing waits on done" without an invoice and asks after `invoice REF amount`; a Growth booking still creates the check.

### S7-06 The portal on a 390-pixel screen
Status: verified 2026-10-20 from the CSS and the engineer's 390 px device-emulated renders (`desk-390-leads.png`, `desk-390-test.png`): one scrolling tab row, the bookings table scrolling inside its card with the page at width, the header stacked, the test chat with its input visible.
Size and scope: Size: S. Implements: Round 7 item 6 (SHOULD).

Engineer note: tabs `nowrap` with `overflow-x: auto`, chat `min(520px, 60vh)`, `.tblwrap` around both tables, header stacks under 600 px; measured at 390 px with device emulation: container 390, cards 362, table wrapper 332 with the 560 px table scrolling inside.

Acceptance: the CSS rules are in `desk.html`; the engineer's 390 px renders (`scratchpad/shots/desk-390-leads.png`, `desk-390-test.png`) show one tab row, the table scrolling inside its card with no page-level horizontal scroll, and the chat input visible.

### S7-07 Measure the two classifiers before choosing a model
Status: verified locally with both real candidate models 2026-10-21: set 1 returned Opus 45/50 exact (18,519 input and 3,801 output tokens) and Haiku 25/50 (18,519 input and 6,652 output tokens), with zero API errors. Opus recall was 100% for every reason; precision was 100% on five reasons, 55.56% for `no_address`, and 83.33% for `question_unanswered`. Keep Opus; the second-set result and stamp-only decision are recorded in DECISIONS.md under the October 21 real-model rubric measurement. Evidence: `scratchpad/pm-real-model-evaluation.json` and the two reused one-item preflight artifacts. This replaces fake-model-only acceptance, without closing any provider-keyed line.
Size and scope: Size: M. Implements: Round 7 item 7 (SHOULD); assumption 2.

Engineer note: `lib/rubric-eval.mjs` (50 labelled conversations) and `admin classifier_eval` with `models`, `from`, `to` in chunks of five; results in DECISIONS.md: Opus 41 of 50 exact with recall 100 everywhere and precision 100 on five reasons, Haiku 32 of 50 with precision 28 to 44; decision keep Opus (about $0.003 per audited conversation measured, not the PO's $0.02), two definitions tightened. `RUBRIC_MODEL` overrides.

Acceptance (now, draft): `admin classifier_eval` on five items returns per-item predictions and a summary; DECISIONS.md records precision and recall per reason for both models and the decision; the rubric file holds 50 items; the classifier calls use the decided model unless `RUBRIC_MODEL` is set.

### S7-08 Needs-me lines that clear themselves
Status: verified 2026-10-21 on the local server at commit 00a1b0a, in-memory store: the admin update accepts `day7Sent`, `onboardingCallAt`, and `invoicedFor` and `?full=1` echoes them under `lifecycle`; `liveDays` 6 is the "day-7 email tomorrow" case; the loaded admin render shows the Needs-me lines with their Called and Sent buttons.
Size and scope: Size: S. Implements: Round 7 item 8 (SHOULD).

Engineer note: `invoicedFor`, `day7Sent`, `onboardingCallAt` set from the page buttons or the admin update; the statement line shows only until `invoicedFor` matches last month; "day-7 email tomorrow" at six live days; "day-7 email due" from seven until `day7Sent`.

Acceptance (now, draft): the admin update accepts the three stamps and `?full=1` echoes them under `lifecycle`; a shop with `liveDays` 6 is the "tomorrow" case and 7 the "due" case (page code); the engineer's loaded admin render shows the Needs-me list with its Called and Sent buttons.

### S7-09 Keyed pass reserve (S2-01, carried; step 4 of the critical path)
Status: todo. Size: reserve 2.5 days. Implements: sprint 2 S2-01 plus every keyed line from sprints 2 to 7 (the per-shop fallback URL, the Debugger webhook, VIP recording deletion). Spent first whenever Steve's keys arrive.

## 3. Assumptions (Steve can overturn any; each is one line to change)

1. Round 7 question 1: the Machines & Cloud brand and campaign are not yet filed; the DECISIONS.md date lines stay "not yet filed" and "pending" until Steve files, and the path treats that wait as the sprint's clock.
2. Round 7 question 2: the two classifiers stay on `claude-opus-5-5` per the measured numbers (Haiku's precision of 28 to 44 percent would bury Steve's Needs-me list in false flags); `RUBRIC_MODEL` is the switch if Steve wants the cheaper model later.
3. Round 7 question 3: quiet days send the owner nothing (no digest email or text); the Monday email counts them.
4. Round 7 question 4: both, as the PO recommended: delete what we can at the providers when keys exist, and name provider retention on the policy page.
5. Round 7 question 5: the Spanish reviewer and the Pro line stay pending.
6. Sprint 1 to 6 assumptions stand, including billing parked and hand invoicing; the keyed-pass reserve (S7-09) is spent first whenever Steve's keys arrive.

## 4. Out of this sprint

| Item | Why |
|---|---|
| Pro line, in-thread Thumbtack replies, per-call latency, `?full=1` at fifty shops | Round 7 item 9 (LATER) |
| Billing, pre-conversion text, blocklist, call spam tagging, pause-at-limit | parked by Steve's rule |

## 5. Verification plan

Setup as in `SPRINT.md` section 5.1 and `SPRINT2.md` section 5. Hooks this sprint uses: `admin put_conversation`, `admin autoflag`, `admin classifier_eval` (`models`, `from`, `to`), the admin update with `liveAt`, `lifecycle` stamps, `builtAt`, `provisionStartedAt`; `run_scheduler` with `force_hour` 18 and 21 and `force_day`; `GET /api/admin?full=1`; `POST /api/voice/recorded` with `RecordingSid`.

Pre-key pass: each ticket's "now" lines against a fresh draft of `main`, recorded on the status line as `verified <date> <deploy id>` or `returned: <line and what was seen>`; browser-only lines are checked from the engineer's device-emulated renders in `scratchpad/shots` and noted as such. Every session ends with `admin delete` for each test shop, `admin clear_optout` for each fake number (now the only way to remove a test opt-out, since delete keeps them), and `GET /api/admin` showing no PM Test shop.

Keyed pass (S7-09): everything from the earlier sprints plus the VIP recording deletion at Twilio.

Two standing rules from Steve, kept here so no session forgets them: no push per commit (each push is a 15-credit build; `main` is pushed once per verified batch), and no draft deploys at all. All verification runs on the local server (`node scripts/local-server.mjs`, http://localhost:8888, admin key `local-admin`, in-memory store); with no Anthropic key present the server uses the deterministic fake model (`lib/fake-model.mjs`, `MC_FAKE_MODEL=1`), so model lines close as "verified with the fake model, real-model wording still owed" and the real-model wording is rechecked once a key is in the gitignored `.env`.

## 6. Verification record

### Pre-key pass, 2026-10-20, draft `6ad7bc94dc1c8c61db6b1c10` (built by the PM from `main` at `426c051`), cut short by the account freeze

`scratchpad/verify17.py` (three launches; two crashed on my own scenario errors, a plumbing desk asked for an HVAC job and an index on an empty list), `verify18.py` and `verify19.py` (the S7-02 record lines on fresh numbers), the repo statics, and the engineer's renders. Midway through the third launch the Netlify account freeze (production frozen at `b29aec9` since 9:24 am Houston) reached function execution: every call returned `usage_exceeded`, so S7-03, S7-04, the last two S7-05 lines, S7-07's live call, and S7-08's live echo were not run and stand on code read. Cleanup was refused by the same error: three shops are orphaned in the shared store and must be deleted once the account is unfrozen: `pm-test-hvac-33bf`, `pm-test-plumbing-3095`, and the "PM Test Cleaning" shop from the same run; the test opt-outs `+17135550141`, `142`, `143` were cleared before the freeze.

Results: S7-01, S7-02, S7-06, S7-07 verified; S7-05 verified with a note; S7-03, S7-04, S7-08 verified by code read and renders with their live lines pending the unfreeze; S7-09 keyed pass todo. The owed admin-page browser check (S5-06, S6-07) is closed by `admin-loaded.png` (three shops, the Needs-me list with its buttons, the full table, the cross-shop event stream).

### Local pass, 2026-10-21, local server at commit 00a1b0a, in-memory store (`node scripts/local-server.mjs`, admin key `local-admin`)

Under Steve's new rule (no deploys and no Netlify function calls except one git push per verified sprint; the account is still frozen), the blocked lines were rerun locally with `scratchpad/verify20.py` and two follow-up checks: S7-04, S7-05, and S7-08 are now verified; S7-03's audit and S7-07's `classifier_eval` need the model and wait for `ANTHROPIC_API_KEY` in the repo's gitignored `.env`. The in-memory store resets on restart, so no local cleanup is owed; the three orphaned shops in the Netlify store (`pm-test-hvac-33bf`, `pm-test-plumbing-3095`, the "PM Test Cleaning" shop) still wait for the unfreeze.

Results: S7-01, S7-02, S7-04, S7-05, S7-06, S7-07, S7-08 verified; S7-03 by code read with the live audit waiting for the local key; S7-09 keyed pass todo.

### Fake-model pass, 2026-10-21, local server at commit 1835317

With the deterministic fake model (`lib/fake-model.mjs`, no Anthropic key present) the lines that waited for the key were rerun locally (harness run inline; the splice is `scratchpad/verdicts21.py`): S7-03's audit by day, re-audit, and test exclusion; S7-05's Growth `visit_check` from a test-line booking; S7-07's `classifier_eval` on all 50 items. All passed. Nothing was sent to Netlify. Real-model wording for each is still owed once a key is in `.env`. The test shop was deleted and `GET /api/admin` lists no shop.

Results: S7-01 through S7-08 verified (S7-03, S7-05, S7-07 with the fake model, real-model wording owed); S7-09 keyed pass todo.

### Local real-model pass, 2026-10-21, isolated server 127.0.0.1:8891

The PM independently ran `scratchpad/pm-real-model-acceptance.mjs` against synthetic shops in an in-memory store. The runner never read `.env`; the server used the paid Anthropic key with fake mode off and Twilio, Vapi, Resend, Stripe, and Google provider credentials disabled. Network access was restricted to that loopback server and Anthropic messages, with a 130-request ceiling including SDK retries. Evaluation used 120 actual requests; the flow checks used seven more, for 127 total and zero blocked requests. No dollar cost was inferred.

S7-03, S7-05 Growth, and S7-07 real-model lines passed; the flow artifact has 20/20 checks including S8-05 and S8-09. Flow baseline: HEAD `5662641650017112e0840fa800f5e6d7d095b82e`, relevant function/server/package code SHA-256 `115a9312d5f47fb3aecb2342ecb1731e3e0d06528c178b0f57a70f3bacd7e762`, unchanged during the run. The classifier comparison preceded the final capacity patch; its original start/end dirty-tree fingerprints are preserved in the evaluation artifact. Raw replies, records, task ids, metrics, and assertions are in `scratchpad/pm-real-model-*.json`. These are real-model, local-flow results; calls, delivered texts/emails, Calendar writes, and the first-shop gate remain unverified. At that checkpoint the 18-case rehearsal had not run; the later final-code result is recorded in SPRINT8.md section 8.

### Final-code local rehearsal, 2026-10-21

All 18 scoped local matrix scenarios passed across the final-code targeted rerun and remaining controls, with independent PM reading of every delivered reply and the relevant records. The original safety-order failures remain in `scratchpad/pm-real-model-matrix.json`. The corrected emergency cases begin with safety before owner/tool summaries, and booking consent, callback timing, honest identity, Spanish wording, opt-outs, and SMS rescheduling survived the fix. Both final artifacts carry the same stable relevant-code SHA-256, `9604fd105b1ebdab3e7f86e187473bb69864950c8af040bdad562a756dc9b344`: `scratchpad/pm-real-model-matrix-rerun.json` and `scratchpad/pm-real-model-matrix-final-controls.json`. The compact evidence map is `scratchpad/pm-real-model-final-verdict.json`. Actual paid-model requests totalled 186 of the 187-request ceiling; zero requests were blocked. No further model calls were made.

This closes the listed local real-model work, not S7-09/S8-07 or customer-one approval. Real calls, delivered texts and email, Google Calendar writes, Vapi behavior, live Netlify Blobs capacity/CAS behavior, and the named first-shop gate remain open. Case 19 capacity and Calendar fault handling have separate local unit/fault-injection evidence, not model or live-provider proof.
