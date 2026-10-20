# Sprint 7: the critical path, the records we keep, and what to turn off

Owner: Product Manager. Cut from `BACKLOG.md` Round 7 (R7.1, 2026-10-20). Same working rules as sprints 1 to 6. All eight Round 7 build items were delivered before this cut (commits `61ab09e` for items 1 to 3, `ee62706` and `426c051` for items 4 to 8; DECISIONS.md 2026-10-20 "round 7 MUSTs" and "round 7 items 4 to 8"), so every ticket starts as `delivered` with the engineer's note and carries the PM's verdict.

Status legend: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` | `returned`.

## 1. Sprint goal

Put the first paying shop on a dated path whose long pole (Machines & Cloud's own 10DLC brand and campaign for the bridge sender) is filed first; keep the records that must survive a shop's deletion and say what the providers retain; audit what happened today rather than what was stamped once; order the owner's first month so the review precedes the bill; turn off the two defaults that cost a one-truck Starter shop more than they return; make the portal usable at 390 px; measure the two classifiers before choosing a model; and give Steve a Needs-me list whose lines clear themselves. The keyed pass stays reserved first and now sits inside the dated path.

## 2. Tickets

### S7-01 The critical path to customer one, dated, longest lead time first
Status: delivered 2026-10-20 (engineer); PM verdict below. Size: S. Implements: Round 7 item 1 (MUST).

Engineer note: OPERATIONS.md section "The critical path to customer one" is a dated table, brand first (1 to 2 weeks typical, up to 6); DECISIONS.md holds "Submission date: not yet filed" and "Campaign VERIFIED date: pending" for Steve to fill.

Acceptance (repo): the OPERATIONS.md table has seven numbered steps with who, lead time, and proof, step 1 being the brand and campaign filing with its wait named; DECISIONS.md carries the two date lines; the keyed pass is a step on the path.

### S7-02 Opt-out records survive a shop's deletion; the policy names provider retention
Status: delivered 2026-10-20 (engineer); PM verdict below. Size: S. Implements: Round 7 item 2 (MUST); assumption 4.

Engineer note: `admin delete` keeps every opt-out, clears `slug` and keeps `formerSlug`; a text to that number from another shop logs `sms_blocked`; VIP voicemail events store the `RecordingSid` and delete removes the recordings at Twilio when keys exist; `DATA_POLICY` and the policy page name Twilio (logs up to 13 months, recordings until we delete them) and the voice provider, and say stop requests are kept.

Acceptance (now, draft): a STOP recorded on shop A survives `admin delete` of shop A with `slug` empty and `formerSlug` set; a confirmation from shop B to that number is refused with `sms_blocked`; a `vip_voicemail` event stores `sid`; the policy page and `DATA_POLICY` contain "13 months" and say stop requests are kept.
Acceptance (keyed): delete removes the shop's VIP recordings at Twilio.

### S7-03 The nightly rubric audits what happened today
Status: delivered 2026-10-20 (engineer); PM verdict below. Size: S. Implements: Round 7 item 3 (MUST).

Engineer note: `autoFlag` carries `day` and `test`; a thread stamped on an earlier day is audited again; test-line hits log `auto_flag` with `test: true` and are excluded from the Needs-me count and Steve's digest note; `put_conversation` clears the stamp for tests.

Acceptance (now, draft): a conversation audited clean today carries a stamp with `day` and empty reasons; the same thread with an unlisted price added is audited again and flagged; a test-channel conversation quoting one produces an `auto_flag` event with `test: true` that the `?full=1` `autoFlags7d` count and the digest `steveNote` exclude; by code, a stamp whose `day` is not today is re-audited.

### S7-04 The month reads in order; the first promise is tracked
Status: delivered 2026-10-20 (engineer); PM verdict below. Size: S. Implements: Round 7 item 4 (SHOULD).

Engineer note: `trial_over` requires `lifecycle.day7Sent` (admin update `{"lifecycle":{"day7Sent":"..."}}` or the Needs-me "Sent" button); `GET ?full=1` carries `newShopDays`, `liveDays`, `lifecycle`.

Acceptance (now, draft): a shop live eight days with no `day7Sent` gets no `trial_over` on a run; after `day7Sent` is set it gets exactly one; `?full=1` rows carry `newShopDays`, `liveDays`, and `lifecycle`; the page shows "call promised within one business day" from `createdAt` until `onboardingCallAt` (page code).

### S7-05 Two defaults a one-truck Starter shop should not get
Status: delivered 2026-10-20 (engineer); PM verdict below. Size: S. Implements: Round 7 item 5 (SHOULD); assumption 3.

Engineer note: a quiet day logs `digest` with `emailed: false` and sends the owner nothing; the Monday email adds "Quiet days: N"; `scheduleReminders` creates `visit_check` only on Growth and Pro, and `runVisitCheck` returns "nothing waits on done" on Starter without an invoice.

Acceptance (now, draft): a Starter shop with nothing today: `run_scheduler force_hour=18` logs `digest` with `empty: true`, `emailed: false`, `texted: false` and no owner send; the Monday email reads "Quiet days: N"; a Starter booking creates no `visit_check`; a manually scheduled check on it returns "nothing waits on done" without an invoice and asks after `invoice REF amount`; a Growth booking still creates the check.

### S7-06 The portal on a 390-pixel screen
Status: delivered 2026-10-20 (engineer); PM verdict below. Size: S. Implements: Round 7 item 6 (SHOULD).

Engineer note: tabs `nowrap` with `overflow-x: auto`, chat `min(520px, 60vh)`, `.tblwrap` around both tables, header stacks under 600 px; measured at 390 px with device emulation: container 390, cards 362, table wrapper 332 with the 560 px table scrolling inside.

Acceptance: the CSS rules are in `desk.html`; the engineer's 390 px renders (`scratchpad/shots/desk-390-leads.png`, `desk-390-test.png`) show one tab row, the table scrolling inside its card with no page-level horizontal scroll, and the chat input visible.

### S7-07 Measure the two classifiers before choosing a model
Status: delivered 2026-10-20 (engineer); PM verdict below. Size: M. Implements: Round 7 item 7 (SHOULD); assumption 2.

Engineer note: `lib/rubric-eval.mjs` (50 labelled conversations) and `admin classifier_eval` with `models`, `from`, `to` in chunks of five; results in DECISIONS.md: Opus 41 of 50 exact with recall 100 everywhere and precision 100 on five reasons, Haiku 32 of 50 with precision 28 to 44; decision keep Opus (about $0.003 per audited conversation measured, not the PO's $0.02), two definitions tightened. `RUBRIC_MODEL` overrides.

Acceptance (now, draft): `admin classifier_eval` on five items returns per-item predictions and a summary; DECISIONS.md records precision and recall per reason for both models and the decision; the rubric file holds 50 items; the classifier calls use the decided model unless `RUBRIC_MODEL` is set.

### S7-08 Needs-me lines that clear themselves
Status: delivered 2026-10-20 (engineer); PM verdict below. Size: S. Implements: Round 7 item 8 (SHOULD).

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
