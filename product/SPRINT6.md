# Sprint 6: the failures we cannot see, the owner's replies, and Steve's week

Owner: Product Manager. Cut from `BACKLOG.md` Round 6 (R6.1, 2026-10-20). Same working rules as sprints 1 to 5. All eight Round 6 build items were delivered before this cut (commits `67a138d` for items 1 to 3 and `df36c03` for items 4 to 8; DECISIONS.md 2026-10-20 "round 6 MUSTs" and "round 6 items 4 to 8"), so every ticket below starts as `delivered` with the engineer's note and carries the PM's verdict.

Status legend: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` | `returned`.

## 1. Sprint goal

Close the three incident paths that could not work as documented (a per-shop voice fallback, Twilio and Vapi failures that never reached our code, alert asks that fail when the owner sends them), then take the week-one read and the Monday hunt out of Steve's week (lifecycle messages, a nightly auto-flag rubric, a "Needs me" list) and make the site and the statement say what the desk does. The keyed pass stays reserved first; L1, L2, L3, L5 remain open until it runs.

Sizes as before. Cut line: nothing to cut; everything is delivered and the sprint is the verification plus the keyed reserve.

## 2. Tickets

### S6-01 The voice fallback dials the owner's cell per shop
Status: verified 2026-10-20 6ad77ca5c7e00b7fc83467ca for the draft half: by node with the env set, a two-phone shop gets `?cell=%2B17135550199`, a one-phone shop and an all-calls shop with no transfer target get the bare URL, an all-calls shop with a transfer target gets the cell, and with the env unset the function returns ""; a portal PUT of the owner cell, a pause, and a resume returned 200; OPERATIONS.md carries the `{{#cell}}` template. The Twilio half waits for S6-04.
Size and scope: Size: S. Implements: Round 6 item 1 (MUST).

Engineer note: `voiceFallbackFor(client)` in `lib/twilio.mjs` returns `VOICE_FALLBACK_TWIML_URL` plus `?cell=%2B1...` when the owner's cell is not the forwarded line, the bare URL otherwise; used at purchase, on pause, re-set on every portal PUT by `syncVoiceFallback` (which points a Vapi-answered line at `/api/voice` instead), and after the Vapi import and on resume. OPERATIONS.md has the exact Mustache TwiML for the bin. Without Twilio keys every call is a no-op.

Acceptance (now): `node` with the env set: a two-phone shop gets `?cell=%2B1<cell>`, a one-phone shop and an all-calls shop with no transfer target get the bare URL, an all-calls shop with a transfer target gets the cell; with the env unset the function returns ""; a portal PUT of the owner cell, a pause, and a resume still return 200; OPERATIONS.md carries the `{{#cell}}` template.
Acceptance (keyed, S6-04): `GET IncomingPhoneNumbers/{sid}` shows the fallback URL with the query string on a two-phone shop and without on a one-phone shop; changing the cell on the portal changes it; with the Netlify site paused, a call rings the cell.

### S6-02 See the failures that never reach our code
Status: verified 2026-10-20 6ad77ca5c7e00b7fc83467ca for the draft half: `customer-ended-call` logged no `voice_failed` and raised nothing; `assistant-request-returned-error` logged `voice_failed` and raised `voice_failures` on the next run; a debugger POST with 11200 on a voice request logged `twilio_error` kind `voice` on the shop; three 30034 posts (kind `sms`) raised `sms_failures`; the line-health count reached 5. On a draft without `TWILIO_AUTH_TOKEN` an unsigned POST is accepted (the same rule as `/api/sms`), so the signature refusal is a keyed line.
Size and scope: Size: M. Implements: Round 6 item 2 (MUST).

Engineer note: `POST /api/twilio-alert` is the Console Debugger webhook (form fields `Sid`, `Level`, `Payload` with `error_code` and `webhook.request`; signature checked, admin key accepted on drafts); it logs `twilio_error { code, kind }` on the shop whose number appears in the failing request. `isVoiceFailure` in `vapi.mjs` classifies `endedReason` and the end-of-call report logs `voice_failed`; both feed the `sms_failures` and `voice_failures` alerts and the line-health error count.

Acceptance (now, draft): an end-of-call report with `assistant-request-returned-error` logs `voice_failed` and raises `voice_failures` on the next `run_scheduler`; `customer-ended-call` does neither; a debugger POST with 11200 on a voice request logs `twilio_error` with kind `voice` on that shop; three 30034 posts (kind `sms`) raise `sms_failures`; the line-health count includes them.
Acceptance (keyed, S6-04): a POST without a valid `X-Twilio-Signature` is refused once `TWILIO_AUTH_TOKEN` is set (on a draft without the token the signature check is skipped, as for `/api/sms`); the Debugger webhook is registered in the console and a real 11200 reaches the shop's events.

### S6-03 Every reply an alert asks for works when the owner sends it
Status: verified 2026-10-20 6ad7b73dd79632dbe7b1c94c: by node, question, lead, and platform summaries end "Ref X." with no Reply line and the emergency summary asks for `ok`; live, a question lead's owner text had no Reply instruction, bare `ok` after an emergency replied "Got it, Raj Patel is yours.", a second bare `ok` said nothing was waiting, bare `done` with two visits today listed both and marked nothing, and after a `visit_check` on one of them bare `done` marked that one and left the other.
Size and scope: Size: S. Implements: Round 6 item 3 (MUST).

Engineer note: took-message, question, and platform leads end with "Ref X." and no Reply line; emergencies and alert-bearing leads ask for `ok`; bare `ok` resolves waiting alerts, then the newest unacknowledged emergency lead of the last 24 hours; bare `done` prefers bookings whose day has passed or that carry `visitCheckedAt`, and today's visits only when none of those exist.

Acceptance (now, draft): by node, question, lead, and platform summaries end "Ref X." with no Reply line and the emergency summary asks for `ok`; live, a question lead's owner text has no Reply instruction; bare `ok` after an emergency replies "Got it, ... is yours." and a second bare `ok` with nothing waiting makes no guess; with two visits today and none nudged, bare `done` lists both and marks nothing; after a `visit_check` on one of them (admin `schedule_task` then `run_scheduler`), bare `done` marks that one and leaves the other.

### S6-04 Keyed pass reserve (S2-01, carried)
Status: todo. Size: reserve 2.5 days. Implements: sprint 2 S2-01 unchanged plus every keyed line from sprints 2 to 6 (the fallback URLs per shop, the Debugger webhook and signature, the two Twilio console steps in R6.2 question 1, and the rest). Spent first whenever Steve's keys arrive.

### S6-05 Lifecycle messages for the owner's first month
Status: verified 2026-10-20 6ad7b73dd79632dbe7b1c94c (nudge texts re-read on a second shop): `liveAt` eight days back gave one `trial_over` and none on the next run; `liveAt` seven days back gave one `day7_draft`; `admin day7` returned a draft with the week's numbers; a testing shop built four days back got one `testing_nudge` ("your front desk is ready to test. Open your portal ...") and a shop provisioned six days back with forwarding unverified got one `forwarding_nudge` carrying `*61*1...**15#` and the Live Voicemail line; a second run added nothing. `tendlc_owner_told` fires from the 10DLC polling branch, which needs Twilio keys, so it is a keyed line.
Size and scope: Size: M. Implements: Round 6 item 4 (SHOULD).

Engineer note: `lifecycle()` runs each scheduler pass for testing and live shops and stamps `client.lifecycle`: `trial_over` email at 8 days after `liveAt`; `testing_nudge` text and email 3 days after `build.builtAt` with no go-live; `forwarding_nudge` text with the code 2 business days after `provision.startedAt` with no verified forwarding; a 10DLC failure also tells the owner (`tendlc_owner_told`); `day7_draft` emails Steve the drafted "what I changed" email at day 7 (`admin day7` returns it). Test hooks on the admin update: `liveAt`, `builtAt`, `provisionStartedAt`. Each fires once.

Acceptance (now, draft): a shop with `liveAt` eight days back gets one `trial_over` event and no second on the next run; a testing shop with `builtAt` four days back gets one `testing_nudge` (text and email) and appears on Steve's list; a shop with a number, forwarding unverified, and `provisionStartedAt` four business days back gets one `forwarding_nudge` text containing its code; `admin day7` returns a draft naming the week's numbers; a live shop with `liveAt` seven days back gets one `day7_draft` to Steve.

### S6-06 Auto-flag instead of reading everything
Status: returned 2026-10-20 6ad7b73dd79632dbe7b1c94c, fixed and verified 2026-10-20 6ad7ba5d6f5b8e0cb2e5293b: on the delivered build a bare `run_scheduler` returned 502 `ReferenceError: Cannot access 'hour' before initialization` (the auto-flag block read `hour` before its declaration), which would have meant every production run since `df36c03` threw before the digest, Monday email, and statement sends, except that production has been frozen at `b29aec9` (sprint 5) since 9:24 am Houston by the Netlify credit freeze, so the fault never reached production and there was no outage (superseded 2026-10-21: `main` is live at commit `4009608`, which carries the fix, after one build whose smoke test passed and a bare `run_scheduler` that returned ok with every block, recorded from the coordinator's report without a production call by me); commit `4fc8dfd` hoists the declarations and a bare run now returns 200 with every counter, and `force_hour=21` flagged a crafted conversation (`autoFlags: 1`). The rubric itself passed on the first draft: "A capacitor replacement is $250 installed. We can be there at exactly 9 am tomorrow." gave `price_not_listed` and `exact_time_promised`, a clean booking gave none, and the admin digest carried `steveNote` "Nightly check flagged 1".
Size and scope: Size: M. Implements: Round 6 item 5 (SHOULD); assumption 4.

Engineer note: `autoFlagDay` runs at 21:00 Houston for live shops (`force_hour=21`), or `admin autoflag` (`debug: true` returns the raw model outputs); it stamps `conversation.autoFlag { at, reasons }` on sms, web, call, and test conversations with a customer message that Houston day and logs `auto_flag` only when a reason fires; `admin put_conversation` stores a crafted conversation; the digest carries `steveNote` and Steve's digest copy goes out whenever that note exists.

Acceptance (now, draft): a crafted conversation where the desk says "A capacitor replacement is $250 installed. We can be there at exactly 9 am tomorrow." gets `auto_flag` with reasons including `price_not_listed` and `exact_time_promised`; a clean booking conversation gets none; the admin digest carries `steveNote` "Nightly check flagged 1: ..."; `run_scheduler force_hour=21` logs the same for a live shop.

### S6-07 A "Needs me" list on the admin page
Status: verified 2026-10-20 6ad7b73dd79632dbe7b1c94c at the API and page-code level: `?full=1` rows carry the seven fields with the expected values (a flagged live shop `autoFlags7d` 1 with `lifecycle` stamped; a testing shop `testingDays` 4 and `forwardingUnverifiedDays` 6); `admin.html` builds the Needs me block from them. The in-browser check of the rendered list is still owed (the engineer's `admin-page.png` shows the key form before loading).
Size and scope: Size: S. Implements: Round 6 item 6 (SHOULD).

Engineer note: `GET /api/admin?full=1` rows carry `autoFlags7d`, `healthAlerts7d`, `overdueOld`, `testingDays`, `forwardingUnverifiedDays`, `spanishReviewPending` (until `SPANISH_REVIEWED_ON` is set), and `lifecycle`; `admin.html` renders the list above the table from them.

Acceptance (now, draft): `?full=1` rows carry the seven fields with the expected values for a flagged, testing, and alerted shop; `admin.html` contains the "Needs me" block and builds it from those fields (page code); screenshot or browser check of the rendered list.

### S6-08 The site matches the desk's behaviour
Status: verified 2026-10-20 (repo, after the follow-up fix in `cd74835` and `033a94d`): the rules band says "Answers the three questions first"; ten FAQ entries in the HTML and the JSON-LD; the Angi answer says the leads post into the desk once a link is pasted; the scheduling answer names the customers export; prices at the same counts as before; `MC_SYSTEM` now states the three-questions order and the daily, weekly, monthly cadence on every plan; the Pro card's duplicate weekly-report bullet became the maintenance-reminder line, mirrored in the llms files; `sitecheck.py` passes; no em dashes.
Size and scope: Size: S. Implements: Round 6 item 7 (SHOULD).

Engineer note: the rules band reads "Answers the three questions first: your area, your fee, your next window"; the Angi, Thumbtack, and scheduling answers match the receivers and the customers export; a tenth FAQ "What do I get each day, week, and month?" with its JSON-LD entry; the three prices occur the same number of times as before; `MC_SYSTEM` says the same.

Acceptance (repo): `grep -c "before anything else" index.html` is 0; the FAQ list and the FAQPage JSON-LD both have ten entries; the Angi answer no longer says the receivers are not connected; the scheduling answer names the customers file; `$99`, `$249`, `$449` counts unchanged; `MC_SYSTEM` carries the same three facts; `sitecheck.py` passes; no em dashes.

### S6-09 The statement says what the desk was worth in the owner's own numbers
Status: verified 2026-10-20 6ad7ba5d6f5b8e0cb2e5293b: with no `avgTicket` the value line is absent; `PUT rules.avgTicket "$450"` stored 450; with one voicemail job the current month's statement (`admin monthly` with `month`, since the default is the previous month) read "About $450 of work that would have gone to voicemail (your average job value of $450 times 1)."
Size and scope: Size: S. Implements: Round 6 item 8 (SHOULD); assumption 3.

Engineer note: `PUT rules.avgTicket` (Account tab field; "$450" stored as 450); the statement adds "About $X of work that would have gone to voicemail (your average job value of $450 times N)" and "Compared with last month" when a previous month has data; both omitted when unset.

Acceptance (now, draft): with `avgTicket` 450 and N voicemail jobs the statement contains "About $450xN of work that would have gone to voicemail"; with no value set the line is absent; the Account tab has the field.

## 3. Assumptions (Steve can overturn any; each is one line to change)

1. Round 6 question 1: the two Twilio console steps (the Mustache bin replacing the plain voice bin, the Debugger webhook to `/api/twilio-alert` with email alerts on) are Steve's, done with the keys in the keyed pass; the webhook is console-only and the bin has no API, so nothing is scripted.
2. Round 6 question 2: the day-8 email names the plan the owner chose and its monthly price (the owner's own agreement, not site copy) and says the first statement arrives on the 1st; the invoice amount itself stays on Steve's copy of the statement (sprint 5, assumption 2 as the engineer resolved it).
3. Round 6 question 3: average job value is asked on the portal Account tab only, not at onboarding.
4. Round 6 question 4: the nightly auto-flag pass runs under the data policy as written (the data is used only to run the desk); only reasons are stored, never the model's free text beyond the debug hook.
5. Round 6 question 5: the Spanish reviewer and the Pro line stay pending; `SPANISH_REVIEWED_ON` is the switch that clears the "Needs me" line.
6. Sprint 1 to 5 assumptions stand, including billing parked and hand invoicing; the keyed-pass reserve (S6-04) is spent first whenever Steve's keys arrive.

## 4. Out of this sprint

| Item | Why |
|---|---|
| Pro line, in-thread Thumbtack replies, per-call latency, `?full=1` cost at fifty shops | Round 6 item 9 (LATER) |
| Billing, pre-conversion text, blocklist, call spam tagging, pause-at-limit | parked by Steve's rule |

## 5. Verification plan

Setup as in `SPRINT.md` section 5.1 and `SPRINT2.md` section 5. Hooks this sprint uses: `admin log_event`, admin update with `liveAt`, `builtAt`, `provisionStartedAt`, `phone.forwardingVerified`, `phone.firstCallAt`; `admin day7`, `admin autoflag` (`debug`), `admin put_conversation`, `admin schedule_task`; `run_scheduler` with `force_hour` 21; `GET /api/admin?full=1`; `POST /api/twilio-alert` with the admin key; `POST /api/vapi` end-of-call reports with chosen `endedReason` values. `voiceFallbackFor` is checked by node with `VOICE_FALLBACK_TWIML_URL` set in the shell.

Pre-key pass: each ticket's "now" lines against a fresh draft of `main`, recorded on the status line as `verified <date> <deploy id>` or `returned: <line and what was seen>`; lines that cannot run on a draft are marked so and the code path named; the admin page and portal are checked in a browser when one is available, else by page code and the engineer's screenshots. Every session ends with `admin delete` for each test shop, `admin clear_optout` for each fake number, and `GET /api/admin` showing no PM Test shop.

Keyed pass (S6-04): everything from `SPRINT2.md` section 5 and the sprint 3 to 5 keyed lines, plus the per-shop fallback URL on a real number, the Debugger webhook with a real signature, and a real `trial_over` email to Steve's inbox.

## 6. Verification record

### Pre-key pass, 2026-10-20, drafts `6ad77ca5c7e00b7fc83467ca` (items 1 to 3), `6ad7b73dd79632dbe7b1c94c` (items 3 to 9), `6ad7ba5d6f5b8e0cb2e5293b` (after the scheduler fix)

`scratchpad/verify12.py` to `verify16.py`, plus node checks of `voiceFallbackFor` and `ownerSummary` and the repo statics. One real defect found and fixed the same day: the scheduler's auto-flag block referenced `hour` before its declaration, so every production run since `df36c03` threw before the digest, weekly, and monthly sends (returned on S6-06; fixed in `4fc8dfd`; a bare run and the 21:00 pass verified on `6ad7ba5d6f5b8e0cb2e5293b`). Everything else passed; the automated failures were my own scenarios (a morning window that had already passed, a previous-month default on the statement, a text `type` assumption on the nudges) and are explained on the status lines. Test shops `pm-test-hvac-6f85` (orphaned by a socket timeout), `-de57`, `-0f4e`, `-6f85`, two plumbing shops, and the rerun shops were all deleted; no opt-outs created; `GET /api/admin` lists no PM Test shop (the engineer's "S7 Growth", "S7 Starter", and "S7 Eval" shops are theirs).

Results: S6-01 and S6-02 verified for the draft half (Twilio halves keyed); S6-03, S6-05, S6-08, S6-09 verified; S6-06 returned then verified after the fix; S6-07 verified with the in-browser check of the Needs me list still owed; S6-04 keyed pass todo. The S5-09 browser check is closed by the engineer's portal screenshots (Today tab with the strip, Needs you, and the last 24 hours; Account tab with usage, commands, data and exports, policy link, Cancel service); the S5-06 admin-page browser check stays owed.

### Keyed pass
Pending S6-04 (Steve's keys). Order in section 5.
