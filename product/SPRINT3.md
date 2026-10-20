# Sprint 3: the first three customers

Owner: Product Manager. Cut from `BACKLOG.md` Round 3 (R3.1, 2026-10-19 night). Same working rules as sprints 1 and 2: engineer builds in order, marks `delivered` with a verification note; the PM runs the checklist and records `verified` or `returned` with the failing line; trade-offs go to `DECISIONS.md`. Round 3 items 1 to 3 were built before this cut (commit `d08e6e9`, DECISIONS.md 2026-10-20); they are S3-01 to S3-03 here with the engineer's notes and the PM's verdict.

Status legend: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` | `returned`.

## 1. Sprint goal

Make the first three Houston shops safe to run for a month: no follow-up text outside Texas hours, no payment reminder the owner did not ask for, a referral ask only after a happy reply, emergencies triaged by trade so a 78°F night does not page the owner at 2 am, a Monday email that shows the owner what the desk did, Spanish all the way through, callback promises that are kept or flagged, and a customers file Jobber and Housecall Pro import without retyping. The keyed pass (S2-01) stays reserved first; L1, L2, L3, L5 are still open until it runs.

Sizes: S up to half a day, M up to a day and a half. About 11 engineer-days including the 2.5-day reservation. Cut line: S3-10 slides first, then S3-09.

Sprint rules carried over: every new store kind extends `admin.mjs` `delete`; every outbound text goes through `sendSMS` with `client` and, when it is a scheduled follow-up, through `scheduleFollowUp`; copy rules from CLAUDE.md (no em dashes, no prototype words, prices only in the homepage plans section and the usage card sentence); `node --check` and `python3 -I scripts/sitecheck.py .` before `delivered`; new admin hooks are listed in section 5.

## 2. Tickets

### S3-01 Quiet hours for every follow-up text
Status: delivered 2026-10-20 (engineer, draft `6ad6bae471d3d40380534fad`); PM verdict below. Size: S. Implements: Round 3 item 1 (MUST).

Engineer note: `scheduleFollowUp` in `lib/desk.mjs` moves `review_request`, `review_nudge`, `quote_check`, `lead_chase`, `referral_ask`, and `payment_reminder` to the next minute inside 9 am to 9 pm Houston (noon to 9 pm Sunday); `reminder_24h`, `reminder_1h`, confirmations, `on_my_way`, `text_back`, `fallback_window`, and live replies are not deferred. `nextOpenTime(date)` is exported for unit tests. Verified by the engineer: `done REF` at 7:48 pm Monday put the review request at Tuesday 9:00 am and the nudge at Thursday 9:00 am.

Files: `netlify/functions/lib/desk.mjs` (`FOLLOW_UP_TYPES`, `nextOpenTime`, `scheduleFollowUp`), call sites in `flagLead`, `ownerCommand`.

Acceptance (now, draft):
- [ ] `node -e` on `nextOpenTime`: Friday 9:30 pm Houston maps to Saturday 9:00 am; Saturday 10:30 pm maps to Sunday 12:00 pm; Monday 8:00 am maps to 9:00 am; Monday 10:00 am is unchanged.
- [ ] `done REF` on a test booking after 7 pm Houston: `admin tasks` shows `review_request` due at the next 9:00 am (or 12:00 pm Sunday) and `review_nudge` at the next open minute after +50 h; no task of those types is due between 9 pm and 9 am Houston.
- [ ] A lead flagged after 5 pm Houston has its first `lead_chase` (+4 h) at the next open minute.
- [ ] A visit booked for tomorrow 8 to 12 keeps `reminder_1h` at 7:00 am Houston (exempt).
- [ ] `grep -n "scheduleTask(" netlify/functions/lib/desk.mjs` shows only the reminder and escalate calls; every follow-up type goes through `scheduleFollowUp`.

### S3-02 Payment reminders by `invoice REF amount`, not by `done`
Status: delivered 2026-10-20 (engineer, same draft); PM verdict below. Size: S. Implements: Round 3 item 2 (MUST).

Engineer note: `done` no longer schedules payment reminders; `invoice REF 450` schedules day 3 and day 7 (quiet hours applied), stores `amount` "$450" and `invoicedAt` on the booking; `paid REF` cancels them and replies "No payment reminders will go out"; the scheduler skips `payment_reminder` unless the booking is done and invoiced; `help`, the portal commands text, and OPERATIONS.md say so.

Files: `netlify/functions/lib/desk.mjs` (`ownerCommand`), `netlify/functions/scheduler.mjs`, `netlify/functions/sms.mjs` (`HELP`), `desk.html`, `OPERATIONS.md`.

Acceptance (now, draft):
- [ ] After `done REF`, `admin tasks` has no `payment_reminder` for that booking and the reply names the `invoice` command.
- [ ] `invoice REF 450`: two `payment_reminder` tasks (about day 3 and day 7, both inside 9 am to 9 pm Houston); the booking carries `amount: "$450"` and `invoicedAt`.
- [ ] Nudging the day-3 task and running the scheduler sends (or logs) a `payment_reminder` whose preview contains "$450".
- [ ] `paid REF` removes the remaining task and replies "No payment reminders will go out".
- [ ] `help` lists `invoice`; `desk.html` and OPERATIONS.md describe the command.

### S3-03 The referral ask only after a positive review reply
Status: delivered 2026-10-20 (engineer, same draft); PM verdict below. Size: M. Implements: Round 3 item 3 (MUST, the PO's recommended gate); keeps the Growth card line "referral ask after a five star reply" true.

Engineer note: when the scheduler sends `review_request` it stamps `reviewAskedAt` on the booking and writes the text into the SMS conversation (every scheduled follow-up now is, with `system: <type>`); the first customer text after it is classified by `noteReviewReply` (a 5-token Claude call: positive, negative, none) and stored as `booking.reviewReply` with a `review_reply` event; negative cancels `review_nudge` and `referral_ask` and texts the owner "NEEDS ACTION ... replied to the review request"; positive cancels the nudge; the scheduler sends `referral_ask` only when `reviewReply.sentiment` is positive ("no positive reply" otherwise) and `review_nudge` only when there is no reply.

Files: `netlify/functions/lib/desk.mjs` (`noteReviewReply`), `netlify/functions/scheduler.mjs`, `netlify/functions/sms.mjs`.

Acceptance (now, draft):
- [ ] `done REF`, nudge the `review_request` task by id, `run_scheduler`: the booking has `reviewAskedAt` and the SMS conversation holds the request with `system: "review_request"`.
- [ ] Customer texts "Great job, thanks! Will do.": `reviewReply.sentiment` is `positive`, a `review_reply` event exists, the `review_nudge` task is gone, the `referral_ask` task remains and sends when nudged.
- [ ] Customer texts "the tech left a mess in my hallway": sentiment `negative`, the owner gets a NEEDS ACTION text quoting the reply within the same run, and both `review_nudge` and `referral_ask` tasks are gone.
- [ ] A booking with no reply: `review_nudge` sends when due and `referral_ask` returns `no positive reply`.
- [ ] `grep -c "five star reply" index.html` returns 1.

### S3-04 Keyed pass reserve (S2-01, carried)
Status: todo. Size: reserve 2.5 days. Implements: sprint 2 S2-01 unchanged; L1, L2, L3, L5.

Change and acceptance: as written in `SPRINT2.md` S2-01, plus the S2-03 ring-timer SIM check, the S2-07 returning-caller greeting, S2-12's real number release, and `VAPI_WEBHOOK_SECRET` set in Netlify (found unset in the sprint 2 pass). Spent first whenever Steve's keys arrive.

### S3-05 Three-tier emergency table per trade, prefilled at onboarding
Status: delivered 2026-10-20, draft 6ad6bd7b4b058e24498fab7d. Engineer check (HVAC and plumbing test shops): `rules.emergencies` is `{ tier0, tier1, tier2, script }` prefilled by `tradeKey(business.trade)` with the onboarding text as `script`; "AC is out, it's 95 today and my mother is 84" opened an `emergency` alert and the reply quoted the $150 after-hours line; "78 tonight, just me" booked tomorrow's window with urgency `this_week` and no alert; "I smell gas" got the leave-the-house script before any question, an emergency alert, no booking; a PUT with a new `tier1` list showed in `admin prompt channel=test` and the 90°F line was gone; the plumbing default lists "Leaking water heater". Old string values are normalized on read (`normalizeEmergencies`), so existing shops keep their script. Onboarding step 4 prefills the two lists from the trade field and the portal Rules card edits all four fields. Size: M. Implements: Round 3 item 4 (SHOULD, before customer two); Epic 3 SHOULD.

Files: `netlify/functions/lib/config.mjs` (`EMERGENCY_TIERS` by trade, `rules.emergencies` becomes `{ tier0: [], tier1: [], tier2: "", script: "" }` with the old string kept as `script`), `netlify/functions/onboard.mjs`, `netlify/functions/onboard-build-background.mjs` (prefill by `business.trade`), `netlify/functions/client.mjs` (PUT), `netlify/functions/lib/config.mjs` `buildSystemPrompt`, `onboard.html` step 4, `desk.html` Rules card.

Change: a per-trade default table (HVAC, plumbing, electrical, roofing, cleaning; "other" gets Tier 0 only) with the PO's thresholds: Tier 0 life safety (gas smell, CO alarm, smoke or fire, sparks or burning smell at the panel or an outlet, sewage flooding a living space): speak the owner's safety script, stop intake, take only phone and address, open the emergency chain. Tier 1 same day: HVAC no cooling at a forecast high of 90°F or more or with an infant, elderly, or medically dependent person home, no heat at or below freezing; plumbing uncontrolled water, no water, sewage backup, leaking water heater; electrical loss of power from the home's own system, a hot outlet or breaker, partial power; roofing active leak during rain; cleaning none. Tier 2 everything else: next available window. The prompt reads the table and quotes the after-hours fee (`business.afterHours`) on Tier 1 only; Tier 1 opens a `today`-urgency lead, not an emergency alert, unless the owner lists it under Tier 0. Onboarding shows the prefilled table as three editable lists; the portal edits the same; the old free-text box becomes the Tier 0 script.

Acceptance (now, draft; HVAC test shop):
- [ ] `GET /api/client?c&k` shows `rules.emergencies.tier0` and `tier1` prefilled for HVAC and `script` carrying the onboarding text.
- [ ] Test line "AC is out, it's 95 today and my mother is 84 and lives with me": an alert of kind `emergency` opens (Tier 1 with a vulnerable person is treated as urgent by the table) and the reply quotes the after-hours fee when outside hours.
- [ ] Test line "AC is out, it's 78 tonight, just me": no alert, the reply offers the next window; the lead or booking has `urgency` `this_week` or `today`, not `emergency`.
- [ ] Test line "I smell gas": the safety script comes before any question, an `emergency` alert opens, no booking is made.
- [ ] `PUT` with an edited `tier1` list is reflected in `admin prompt channel=test` on the next call; the plumbing default shows "leaking water heater" under Tier 1.

### S3-06 Monday "what it did for you" email with no-book reasons
Status: todo. Size: M. Implements: Round 3 item 5 (SHOULD, before customer two); Epic 5 SHOULD weekly email; makes the Pro card's weekly report true for every plan.

Files: `netlify/functions/lib/config.mjs` (`NOTIFY_OWNER` gains `nobook_reason` enum: `wanted_price`, `wanted_sooner`, `out_of_area`, `fee_objection`, `question_only`, `other`, `none`), `netlify/functions/lib/desk.mjs` (`weeklyReport(c)` replaces the unused `weeklyDigest`), `netlify/functions/scheduler.mjs` (Monday 8:00 to 8:09 Houston, every `live` shop, all plans; Steve gets a copy), `netlify/functions/client.mjs` (POST `weekly` returns it), `netlify/functions/admin.mjs` (`weekly` with `send: true`).

Change: the email lists, for the last 7 Houston days: calls answered (events `missed_call`, `call_ended`, `call_started`), actionable conversations (SMS, web, and call conversations minus spam and VIP), bookings by channel, missed-call-to-booking rate (bookings divided by actionable conversations), leads still needing action, no-book reasons as a count per reason, emergencies, usage against the plan (S2-09), flags and what changed (`config_updated` count), callback promises kept versus missed once S3-08 exists. Empty week: "nothing this week" by email only.

Acceptance (now, draft):
- [ ] `node -e` prints the seven `nobook_reason` values; a test-line lead that ends with "that's more than I wanted to pay" stores `nobook_reason: "fee_objection"`.
- [ ] A shop with 10 actionable conversations, 4 bookings, 2 spam leads: `POST /api/client {action:"weekly"}` returns text with "40 percent", 4 bookings by channel, 6 unbooked with a reason each, spam shown separately.
- [ ] `admin run_scheduler force_hour=8 force_day=Mon` (engineer adds `force_day`) sends it to the live shop by email, logs `weekly`, and texts nothing.
- [ ] `grep -c "weeklyDigest" netlify/functions/*.mjs netlify/functions/lib/*.mjs` returns 0.

### S3-07 Spanish all the way through
Status: todo. Size: M. Implements: Round 3 item 6 (SHOULD, before customer two); Epic 6 SHOULD.

Files: `netlify/functions/lib/desk.mjs` (`TEMPLATES_ES`, chosen by `booking.language` or `lead.language`), `netlify/functions/lib/config.mjs` (`publicView` greeting bilingual when `business.spanish`), `embed.js`, `netlify/functions/lib/vapi.mjs` (`standardGreeting` first sentence offers Spanish), `netlify/functions/voice.mjs` (text-back already bilingual), `product/DECISIONS.md` (translation review status).

Change: fixed Spanish templates for confirmation, `reminder_24h`, `reminder_1h`, `on_my_way`, `review_request`, `review_nudge`, `quote_check`, `lead_chase`, `fallback_window`, `cancelled`, and the consent line, selected when the record's `language` is `es`; owner-facing texts stay English. The widget greeting on a Spanish-enabled shop is one bilingual line ("Hi, this is the X front desk. / Hola, le atiende la recepción de X."). The Vapi first message on a Spanish-enabled shop opens "Thanks for calling X. Hablamos español. This is the front desk assistant. How can I help?" The Spanish strings ship drafted by the model and reviewed by a Spanish speaker Steve names before the first Spanish-speaking customer goes live (assumption 4); DECISIONS.md records the review date.

Acceptance (now, draft):
- [ ] A visit booked in Spanish on the test line: the `confirmation` `sms_sent` preview and the `reminder_24h` text (nudge and run) are in Spanish and carry "STOP".
- [ ] `GET /api/client?c=slug` for a Spanish-enabled shop returns a greeting containing both "Hi" and "Hola"; the embed renders it.
- [ ] `admin prompt channel=voice` and `standardGreeting` show a first message whose first sentence offers Spanish; an English-only shop's greeting is unchanged.
- [ ] `TEMPLATES_ES` has every key `TEMPLATES` has (`node -e` compares the key sets).

### S3-08 Callback promises are tracked
Status: todo. Size: S. Implements: Round 3 item 7 (SHOULD, before customer two).

Files: `netlify/functions/lib/desk.mjs` (`flagLead` sets `callbackDueAt` on `wants_call` and `handoff` leads from `rules.callbackHours` or `callbackAfterHours` parsed as minutes or a clock time; `ownerCommand` gains `called REF`), `netlify/functions/scheduler.mjs` (task `callback_check` at `callbackDueAt`), `desk.html` (leads table "overdue" tag), `netlify/functions/lib/config.mjs` (`rules.callbackHours` stays free text but the parser understands "within N minutes", "within the hour", "by H am/pm").

Change: at `callbackDueAt`, if the lead is still `open` and no `ok`, `otw`, `done`, or `called REF` has been received, text the owner one `owner_note` "Overdue callback: ... promised within 30 minutes at 2:10 pm" and set `lead.overdueAt`; the portal shows "overdue" on that row; the weekly email (S3-06) counts kept versus missed from `calledAt` or `ackedAt` versus `callbackDueAt`.

Acceptance (now, draft):
- [ ] A `wants_call` lead opened with "within 30 minutes" has `callbackDueAt` about 30 minutes out and a `callback_check` task.
- [ ] Nudge and run without an owner reply: an `owner_note` `sms_sent` whose preview contains "Overdue callback", `lead.overdueAt` set, the portal row shows "overdue".
- [ ] `called REF` before the check: the task returns "called" and no overdue text is sent; `ok REF` does the same.
- [ ] After hours, the promise uses `callbackAfterHours` and `callbackDueAt` falls at the next morning time.

### S3-09 Customers export in Jobber and Housecall Pro headers
Status: todo. Size: S. Implements: Round 3 item 8 (SHOULD); cut 1's CSV bridge.

Files: `netlify/functions/client.mjs` (`export=customers`), `desk.html` (fourth link).

Change: one row per unique phone across bookings and leads (spam excluded) with the header exactly `First name,Last name,Mobile Phone,Email,Street,City,State,Zip Code,Note,Lead Source,Tags`: name split on the first space (single-word names go to `First name`, `Last name` empty), `Mobile Phone` E.164, `Email` empty, `Street`/`City`/`State`/`Zip Code` parsed from the booking address when it contains a ZIP (otherwise the whole address in `Street`, `City` from `business.city`, `State` "TX"), `Note` the last issue and the refs, `Lead Source` "Other", `Tags` "front desk". The three raw exports stay.

Acceptance (now, draft):
- [ ] A shop with three bookings from two phones: `export=customers` returns two rows and the header line matches the eleven names exactly, in that order.
- [ ] An address "1402 Mason Rd, Katy, TX 77450" splits into Street, City, State, Zip Code; "9 Oak St, Katy" keeps Street and City with State "TX" and an empty Zip.
- [ ] Python's `csv` module parses the file; a Jobber trial import is checked by Steve once (keyed by his account, not a draft line).

### S3-10 Structured business hours
Status: todo. Size: M. Implements: Round 3 item 9 (SHOULD).

Files: `netlify/functions/lib/config.mjs` (`rules.hours` as `{ mon: { open, close } ... sun }`, `isBusinessHours(c, date)`), `netlify/functions/onboard-build-background.mjs` (parse the crawled hours string into fields, keep the string as `business.hours` for the prompt), `onboard.html` step 2 (seven rows, prefilled), `desk.html`, `netlify/functions/lib/desk.mjs` (callback window choice, `cellIsForwardedLine` unchanged), `netlify/functions/lib/config.mjs` `buildSystemPrompt` (after-hours behavior), S3-06 after-hours count, the LSA copy's "business hours" sentence in `index.html` FAQ.

Change: the callback promise, the after-hours fee mention, quiet hours' "after hours" branch for the callback window, and the weekly after-hours count read `rules.hours`; `hour >= 7 && hour < 19` in `lib/desk.mjs` goes away. A shop with no structured hours falls back to 7 am to 7 pm and the portal says so.

Acceptance (now, draft):
- [ ] `GET /api/client?c&k` shows `rules.hours` with seven days after onboarding "Mon to Fri 8 to 5"; Saturday and Sunday are closed.
- [ ] Test line "can I talk to a person" with the shop's clock set by `admin` `{"action":"prompt","channel":"test","at":"2026-10-23T23:00:00Z"}` (Friday 6 pm Houston) returns the after-hours sentence; at `2026-10-23T21:00:00Z` (4 pm) the business-hours one.
- [ ] `grep -n "hour >= 7 && hour < 19" netlify/functions/lib/desk.mjs` returns nothing.
- [ ] The onboarding page prefills the seven rows from the crawl and the portal edits them.

## 3. Assumptions (Steve can overturn any; each is one line to change)

1. Round 3 question 1: quiet hours follow Texas ch. 304 (9 am to 9 pm, noon to 9 pm Sunday), not the federal 8 am start (built in S3-01).
2. Round 3 question 2: `done REF` never schedules payment reminders; `invoice REF amount` is the command owners are taught (built in S3-02; the portal and OPERATIONS.md say so).
3. Round 3 question 3: the referral ask is gated on a positive review reply, as the PO recommended; the Growth card stands (built in S3-03).
4. Round 3 question 4: Spanish templates are fixed strings in code, drafted by the model and reviewed by a Spanish speaker Steve names before the first Spanish-speaking customer goes live; until then Spanish bookings still get the Spanish templates, with the review date recorded in DECISIONS.md (S3-07).
5. Round 3 question 5: the usage card's overage sentence stays (sprint 2 assumption 9).
6. Tier 1 emergencies open a `today` lead and quote the after-hours fee; only Tier 0 and Tier 1 with a vulnerable person open the emergency chain (S3-05). The owner can move any item between tiers.
7. The weekly email goes to every live shop on every plan, Monday 8 am Houston, by email only; Steve gets a copy for the first four weeks after `liveAt` (S3-06).
8. "Actionable conversation" for the booking rate means a conversation that is not spam and not from a VIP number (S3-06).
9. The customers export puts the owner's trade in `Tags` only as "front desk"; `Lead Source` is always "Other" because Jobber accepts seven fixed values (S3-09).
10. Shops without structured hours fall back to 7 am to 7 pm Houston for every hours-based decision (S3-10).
11. Sprint 1 and 2 assumptions stand, including billing parked and hand invoicing.
12. The keyed-pass reserve (S3-04) is spent first whenever Steve's keys arrive, even mid-ticket.

## 4. Out of this sprint

| Item | Why |
|---|---|
| Marketing-consent capture and the Pro seasonal reminders behind it | Round 3 item 10 (LATER); nothing moved it |
| Angi webhook, Thumbtack and LSA in-thread replies, Jobber and Housecall Pro APIs | LATER; S3-09's customers file is the bridge |
| Per-action permission toggles | LATER; cancel-by-request remains the default |
| Latency and abandonment per call in the weekly email | needs Vapi data from the keyed pass first |
| Line-health count of `assistant-request` timeouts | watch item; after the keyed pass shows what Vapi reports |
| Billing, pre-conversion text, blocklist, call spam tagging, pause-at-limit | parked by Steve's rule |

## 5. Verification plan

Setup as in `SPRINT.md` section 5.1 and `SPRINT2.md` section 5 (fresh draft from `main`, PM Test shop, admin-attached number). Hooks this sprint needs: `admin run_scheduler` with `force_hour` and `force_day` (S3-06), `admin prompt` with `at` (S3-10), `admin records kind=leads` for `nobook_reason` and `callbackDueAt`. Scheduled follow-ups are checked by reading `admin tasks` and comparing `dueAt` against `nextOpenTime` computed independently (Python `zoneinfo`, America/Chicago); the PM's harness does this.

Pre-key pass: each ticket's "now" lines against the engineer's named draft, recorded on the status line as `verified <date> <deploy id>` or `returned: <line and what was seen>`; lines that cannot run on a draft are marked so and the code path named. Every session ends with `admin delete` for each test shop, `admin clear_optout` for each fake number, and `GET /api/admin` showing no PM Test shop.

Keyed pass (S3-04): as in `SPRINT2.md` section 5, plus the Spanish voice greeting (S3-07) and a callback-promise check on Steve's phone (S3-08).

Go-live gate for customers two and three: S3-04 complete, S3-01 to S3-03 verified, S3-05 verified for the customer's trade, the 14-case matrix plus the three S3-05 cases passed on the customer's test line, the OPERATIONS.md runbook followed and the sheet filed.
