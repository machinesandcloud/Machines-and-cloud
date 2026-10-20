# Sprint 4: what makes the first shop renew at day 30

Owner: Product Manager. Cut from `BACKLOG.md` Round 4 (R4.1, 2026-10-20). Same working rules as sprints 1 to 3: engineer builds in order, marks `delivered` with a verification note; the PM runs the checklist and records `verified` or `returned` with the failing line; trade-offs go to `DECISIONS.md`. Round 4 items 1 to 3 were built before this cut (commit `8d65a94`, DECISIONS.md 2026-10-20 "round 4 MUSTs"); they are S4-01 to S4-03 here with the engineer's notes and the PM's verdict.

Status legend: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` | `returned`.

## 1. Sprint goal

Give the first shop something to point at on day 30: booking dates that stay true, review requests that carry a real link and a nudge that gets the owner to text `done`, a first 48 hours that reads like a product and not a toy, a Monday email whose numbers survive the owner's arithmetic, Spanish customers who can say stop, and the marketing-consent record that unlocks the HVAC maintenance reminder. The keyed pass (S2-01, carried as S4-04) stays reserved first; L1, L2, L3, L5 remain open until it runs.

Sizes: S up to half a day, M up to a day and a half. About 10 engineer-days including the 2.5-day reservation. Cut line: S4-12 slides first (it is conditional on a paying lead-platform shop anyway), then S4-11 if Steve has not answered question 1.

Sprint rules carried over: every new store kind extends `admin.mjs` `delete`; every outbound text goes through `sendSMS` with `client` and, when scheduled, `scheduleFollowUp`; owner notes are not customer texts and are not deferred; copy rules from CLAUDE.md; `node --check` and `python3 -I scripts/sitecheck.py .` before `delivered`; new admin hooks are listed in section 5.

## 2. Tickets

### S4-01 Booking dates are calendar dates, never "today" or "tomorrow"
Status: delivered 2026-10-20 (engineer, draft `6ad6c2e225f6d9972cd9bb31`); PM verdict below. Size: S. Implements: Round 4 item 1 (MUST).

Engineer note: `bookVisit` and `rescheduleVisit` store `date` as `YYYY-MM-DD` Houston (`normalizeDate`) and the customer's words in `dateSaid`; records written earlier with "today" or "tomorrow" are read relative to `createdAt` (`bookingDay`), so no migration; texts render the date with `friendlyDate` ("tomorrow, 8 to 12", "Sat, Oct 24, 12 to 5"); `POST /api/vapi` accepts a top-level `at` next to `message` for tests.

Files: `netlify/functions/lib/calendar.mjs` (`normalizeDate`, `friendlyDate`), `netlify/functions/lib/desk.mjs` (`bookVisit`, `rescheduleVisit`, `bookingDay`, `upcomingBookings`, `customerType`, `callerContext`, `when`), `netlify/functions/vapi.mjs`.

Acceptance (now, draft):
- [ ] A visit booked on the test line "for tomorrow" shows `date` as tomorrow's `YYYY-MM-DD` (Houston) and `dateSaid` "tomorrow" in `admin records kind=bookings`; the confirmation preview reads "tomorrow, 8 to 12".
- [ ] `POST /api/vapi` `assistant-request` for that phone today returns `upcomingVisit` "tomorrow, 8 to 12" and `isExisting` "new"; the same with `at` three days later returns `upcomingVisit` "" and `isExisting` "existing customer".
- [ ] A reschedule by reply to "Saturday 12 to 5" stores Saturday's `YYYY-MM-DD` and the owner text reads "Sat, Oct DD, 12 to 5".
- [ ] `node -e`: `normalizeDate("tomorrow")` is tomorrow's ISO date, `bookingDay({ date: "tomorrow", createdAt: <Oct 19> })` is Oct 20, `friendlyDate("2026-10-24")` is "Sat, Oct 24" and "sábado, 24 de octubre" in Spanish.

### S4-02 No review request without a review link
Status: delivered 2026-10-20 (engineer, same draft); PM verdict below. Size: S. Implements: Round 4 item 2 (MUST).

Engineer note: on a Growth or Pro shop with no `reviewLink` and no `googlePlaceId`, `done REF` schedules no `review_request`, `review_nudge`, or `referral_ask`, replies "No review request went out: add your Google review link on the portal ...", and logs `review_skipped`; after `PUT business.reviewLink` the next `done` schedules the request with the link in the text; the checklist has "Google review link added"; the build keeps a `g.page`, `maps.app.goo.gl`, or `writereview` URL the crawl finds.

Files: `netlify/functions/lib/desk.mjs` (`ownerCommand` `done`), `netlify/functions/onboard-build-background.mjs`, `desk.html` checklist.

Acceptance (now, draft):
- [ ] On a Growth shop with no review link, `done REF` creates no review task for that booking, the reply contains "No review request went out" and "Google review link", and a `review_skipped` event names the booking.
- [ ] After `PUT {"business":{"reviewLink":"https://g.page/r/..."}}`, the next `done REF` schedules `review_request`; nudged, its preview contains the link.
- [ ] `grep -c "Google review link added" desk.html` is 1; the build code captures `g.page`, `maps.app.goo.gl`, and `writereview` URLs.

### S4-03 Hours parsing and the after-hours promise for the two common Houston cases
Status: delivered 2026-10-20 (engineer, same draft); PM verdict below. Size: S. Implements: Round 4 item 3 (MUST).

Engineer note: "Mon to Fri 8 to 5, 24/7 emergency service" parses to Mon to Fri 08:00 to 17:00 with the weekend null and `rules.emergency247` true; the prompt at a closed hour on such a shop says a Tier 1 is handled as Tier 0 with the fee stated; `admin prompt` with `at` = Tuesday 6:30 am Houston contains "when the shop opens at 8 this morning" and a `wants_call` lead opened then gets `callbackDueAt` at 08:00 the same day (`callbackPromise`, `opensLaterToday`); the 2 am prompt still says closed.

Files: `netlify/functions/lib/config.mjs` (`parseHours`, `emergency247`, `opensLaterToday`, `buildSystemPrompt`), `netlify/functions/lib/desk.mjs` (`callbackPromise`, `callbackDue`).

Acceptance (now, draft):
- [ ] Onboarding with those hours yields `rules.hours` Mon to Fri 08:00 to 17:00, Saturday and Sunday null, `rules.emergency247` true; "Open 24/7" alone still parses as open all day (`node -e`).
- [ ] `admin prompt channel=test at=<Tuesday 2 am Houston>` says closed and that a Tier 1 after hours is handled as Tier 0 with the fee; `at=<Tuesday 6:30 am>` contains "when the shop opens at 8 this morning".
- [ ] `node -e`: `callbackDue("when we open at 8 this morning", <Tuesday 6:30 am>, shop)` is 08:00 Houston the same day.

### S4-04 Keyed pass reserve (S2-01, carried)
Status: todo. Size: reserve 2.5 days. Implements: sprint 2 S2-01 unchanged, plus the sprint 2 and 3 keyed lines (ring-timer SIM check, returning-caller greeting, real number release, `VAPI_WEBHOOK_SECRET`, Spanish voice greeting, a callback promise on Steve's phone). Spent first whenever Steve's keys arrive.

### S4-05 "Did the visit happen?" owner nudge
Status: delivered 2026-10-20, draft 6ad76c97160dbdfc11d6f9e8 (built as round 4 item 4 before the cut; see DECISIONS.md). Engineer check: every booking schedules `visit_check` at 9:00 am Houston the day after its date; nudged and run on a booking still `booked` it returned `asked`, texted the owner "Did the visit for Lee Park at 12 Oak St, Katy (tomorrow, 8 to 12) happen? Reply \"done REF\" if it did, or \"cancel REF\" if it did not." as `owner_note`, set `visitCheckedAt` so it never repeats; `done REF` in reply scheduled the review request; `done`, `cancel`, and a reschedule clear or move the task. Size: S. Implements: Round 4 item 4 (SHOULD, renewal lever).

Files: `netlify/functions/lib/desk.mjs` (`bookVisit`, `rescheduleVisit` schedule a `visit_check` task at 9:00 am Houston the day after the visit date; `runVisitCheck`), `netlify/functions/scheduler.mjs`, `netlify/functions/lib/config.mjs` (nothing new unless a per-plan switch is wanted; assumption 3 says every plan).

Change: when the check runs and the booking is still `booked`, `confirmed`, or `on_the_way`, text the owner once (`type: "owner_note"`): "Did the visit for {customer} at {address} happen? Reply done {REF}, or cancel {REF} if it did not." and set `visitCheckedAt`; `done`, `cancel`, `paid`, and `quote` on that REF cancel the pending check; a reschedule moves it. The nudge is an owner note (no quiet-hours deferral needed; it is at 9 am anyway).

Acceptance (now, draft): a visit booked for tomorrow 8 to 12 has a `visit_check` task due the day after at 9:00 am Houston; nudged and run with no `done` or `cancel`, exactly one owner `sms_sent` whose preview starts with "Did the visit" and `visitCheckedAt` set; `done REF` in reply schedules the review request; a booking marked `done` before the check makes the task return "already done"; a rescheduled visit moves the check to the new day.

### S4-06 Spanish opt-out words
Status: delivered 2026-10-20, draft 6ad76c97160dbdfc11d6f9e8. Engineer check: ALTO, PARAR, CANCELAR, BASTA, DETENER and the phrases "no me manden más mensajes", "no más mensajes", "dejen de escribir" record `opt_out`, cancel the number's tasks, and reply once in Spanish ("ya no recibirá más mensajes de este número. Responda START para volver a recibirlos"); a second stop word from a number already out is silent (English too, which was a pre-existing double confirmation); EMPEZAR, INICIAR, and SÍ opt back in with a Spanish line; the Spanish confirmation and consent line say "STOP o ALTO"; OPERATIONS.md one-time setup adds ALTO and PARAR (and EMPEZAR) on the Messaging Service. Size: S. Implements: Round 4 item 5 (SHOULD).

Files: `netlify/functions/sms.mjs` (`STOP_RE`, `STOP_PHRASE`, the unsubscribe reply by language), `netlify/functions/lib/desk.mjs` (`STRINGS.es` confirmation and `CONSENT_LINE_ES` say "Responda STOP o ALTO"), `OPERATIONS.md` (one-time Twilio setting: ALTO and PARAR as custom opt-out keywords on the Messaging Service).

Change: add `alto`, `parar`, `cancelar`, `basta`, `detener` as whole-message stop words and "no me escriban", "no me manden", "no más mensajes", "dejen de escribir" as phrases; the unsubscribe confirmation is Spanish when the record's language is `es` or the stop word was Spanish; START words add `empezar`, `iniciar`, `sí quiero`.

Acceptance (now, draft): "ALTO" and "no me manden más mensajes" from a number with a Spanish booking each record an `opt_out`, cancel that number's tasks, and return the Spanish unsubscribe line once (with `OptOutType` present, nothing); the Spanish confirmation preview contains "ALTO"; "STOP" still works in English; OPERATIONS.md names the Messaging Service keywords.

### S4-07 The owner's first 48 hours
Status: delivered 2026-10-20, draft 6ad76c97160dbdfc11d6f9e8. Engineer check: the first `go_live` sent an owner `sms_sent` `type: "welcome"` ("you're live. Every lead and booking comes to this number as a job ticket with a ref. Reply ok, otw, done, called ...") and an email "<shop>: you're live" with the sample ticket and the commands; `resume` after a pause sent no second welcome; `GET` carries `today: { calls, texts, bookings, needsYou }`; the portal opens a live shop on Leads and bookings with the Today strip (calls, texts in, booked today, need you, line) unless a hash or a tab click says otherwise; the Test tab stays. Browser check is the PM's. Size: M. Implements: Round 4 item 6 (SHOULD).

Files: `netlify/functions/client.mjs` (`go_live` sends the welcome text and email), `netlify/functions/lib/desk.mjs` (`welcomeText(c)`), `desk.html` (a live shop opens on Leads and bookings with a "Today" strip: calls, texts, bookings, leads needing you, line health; the Test tab stays but is not the default).

Change: at the first `go_live` (not on resume), owner text `type: "welcome"`: "You're live. Your first alert looks like this: {one-line sample ticket}. Reply ok, otw, done, called with the ref. 6 pm digest, Monday email. Flag anything on the portal: {link}." and an email with the same plus the commands list. The portal reads `client.status` and `liveAt`; the Today strip is computed from the GET payload (events of the Houston day).

Acceptance (now, draft): `go_live` on a testing shop logs an owner `sms_sent` `type: "welcome"` and the email subject "You're live" appears in the function log; `resume` sends no welcome; `GET` carries `today: { calls, texts, bookings, needsYou }`; the portal for a live shop shows the Leads and bookings tab selected with the strip above it (page code read, plus a browser check by the PM).

### S4-08 Onboarding from a phone: cell required, website optional
Status: delivered 2026-10-20, draft 6ad76c97160dbdfc11d6f9e8. Engineer check: `POST /api/onboard` without a phone returned 400 `{ error: "missing_fields", field: "owner.phone", message }`; with a phone and no website it returned 200 with a slug from the business name (`no-site-cleaning-5419`) and reached `testing` with `build.notes` starting "No website given; built from your answers." (the model still drafts FAQ and the missing list from the answers; no crawl); the onboarding page marks the cell required and the website "leave blank if you do not have one yet"; the emails no longer name a website when there is none. Size: S. Implements: Round 4 item 7 (SHOULD).

Files: `onboard.html` (required attributes; "No website yet" checkbox), `netlify/functions/onboard.mjs` (400 `{ error: "missing_fields", field: "owner.phone" }` without a cell; website optional; `loopCheck` unchanged), `netlify/functions/onboard-build-background.mjs` (no website: build from the answers, `build.notes` says so, no crawl).

Acceptance (now, draft): `POST /api/onboard` without `phone` returns 400 naming `owner.phone`; with `phone` and no `website` returns 200 and reaches `status: "testing"` with `build.notes` containing "built from your answers"; the slug derives from the business name; the onboarding page marks the cell required and the website optional.

### S4-09 Weekly email numbers an owner can repeat
Status: delivered 2026-10-20, draft 6ad76c97160dbdfc11d6f9e8. Engineer check: a week with 3 `end-of-call-report`s, 2 missed calls texted back, 13 conversations of which the model tagged 3 `question_only`, and 4 bookings (one by SMS after a text-back) read "Calls: 3 answered by the front desk, 2 texted back after a missed call", "Booking rate: 4 booked of 10 bookable conversations (40 percent)", and "Jobs that would have gone to voicemail: 1"; `stats` carries `answered`, `textedBack`, `bookable`, `voicemailJobs`. Question-only exclusion keys on both phone and contact. Size: S. Implements: Round 4 item 8 (SHOULD).

Files: `netlify/functions/lib/desk.mjs` (`weeklyReport`), `netlify/functions/lib/config.mjs` (no change unless `question_only` needs a lead status).

Change: "Calls: N answered by the front desk, M texted back after a missed call" (answered = `call_ended` or `call_started`; texted back = `missed_call` with `textBack` sent or logged); the booking rate denominator becomes bookable conversations (actionable minus `question_only` leads); one new line "Jobs that would have gone to voicemail: K" (bookings whose SMS conversation began with a missed-call text-back or whose first contact was outside business hours).

Acceptance (now, draft): for a week with 3 call reports, 2 missed calls texted back, 10 actionable conversations of which 2 are `question_only`, and 4 bookings: the email reads "3 answered by the front desk, 2 texted back" and "4 booked of 8 bookable conversations (50 percent)"; a booking that followed a missed-call text-back counts in "would have gone to voicemail".

### S4-10 Marketing consent by keyword, unlocking the maintenance reminder
Status: todo. Size: M. Implements: Round 4 item 9 (SHOULD); Round 1 Epic 2 SHOULD and cut 5 (Pro seasonal reminders behind consent).

Files: `netlify/functions/lib/desk.mjs` (`noteReviewReply` positive branch schedules `consent_ask` via `scheduleFollowUp`; `STRINGS` en and es), `netlify/functions/sms.mjs` (a "YES" or "SÍ" from a number with a pending ask stores `marketingConsent`), `netlify/functions/lib/store.mjs` (`customers` kind, key `{slug}/{phone}` holding `marketingConsent { at, channel, wording, number }`), `netlify/functions/scheduler.mjs` (`maintenance_reminder` returns "no marketing consent" without it), `netlify/functions/lib/config.mjs` (`rules.consentAsk` default `false` until Steve approves the sentence, assumption 5), `netlify/functions/admin.mjs` (`records kind=customers`, `delete`).

Change: after a positive review reply on a shop with `rules.consentAsk` true, one text inside quiet hours: "Want a text when your next tune-up is due? Reply YES." (Spanish: "¿Quiere un mensaje cuando toque su próximo mantenimiento? Responda SÍ."). A YES within 7 days stores the consent record with the exact wording and timestamp; anything else or silence stores nothing and the ask is never repeated for that number. Pro maintenance reminders (seasonal, 6 months after a done HVAC visit) are scheduled only for numbers with consent and only inside quiet hours.

Acceptance (now, draft): with `consentAsk` true, a positive review reply produces one `consent_ask` task at the next open minute; nudged and run, one customer `sms_sent` with the sentence; "YES" from that number stores `customers/{slug}/{phone}.marketingConsent` with `wording` and `at` (visible in `admin records kind=customers`) and logs `marketing_consent`; a second positive reply from the same number produces no second ask; with `consentAsk` false nothing is sent; `admin` scheduling a `maintenance_reminder` for a number without consent returns "no marketing consent" from `run_scheduler`.

### S4-11 The site says what the product does now
Status: todo, pending Steve on the Pro line (question 1). Size: S. Implements: Round 4 item 11 (SHOULD).

Files: `index.html` (plans cards, rules band, FAQPage JSON-LD if a FAQ changes), `netlify/functions/chat.mjs` (`MC_SYSTEM`), `llms.txt`, `llms-full.txt`.

Change (default, assumption 1): Starter adds "Emergency rules by trade", "Spanish on every channel", "A list of numbers that always ring through to you", "Monday report of what it answered and booked"; Growth keeps its follow-up lines; the rules band adds "Texts only between 9 am and 9 pm unless you booked a visit"; Pro's "several techs or crews, several numbers" line is left as is until Steve answers (no second-number route is built this sprint). Prices untouched.

Acceptance (now, repo): `grep -c "\$99\|\$249\|\$449" index.html` is unchanged from the current commit; the Starter card contains the four new lines; the rules band contains the 9 am to 9 pm line; `MC_SYSTEM` mentions the same four features; `sitecheck.py` passes; no em dashes.

### S4-12 Angi and Thumbtack lead receivers (if a paying lead-platform shop appears)
Status: todo, conditional (question 4). Size: M. Implements: Round 4 item 10 (SHOULD).

Files: new `netlify/functions/angi.mjs` (`/api/angi?c=slug`, per-client key in `X-API-KEY` matched against `leads.angiKey` set by admin, JSON reply containing "success"), new `netlify/functions/thumbtack.mjs` (`/api/thumbtack?c=slug`, Thumbtack's self-serve webhook with a per-client secret), `netlify/functions/lib/desk.mjs` (`flagLead` accepts `source`), `netlify/functions/lib/config.mjs` (`leads: { angiKey, thumbtackSecret }`), `OPERATIONS.md` (how the owner pastes the endpoint and key into Angi and Thumbtack).

Change: each receiver creates a lead with `source` and the platform's task text, alerts the owner ("Angi lead: ..."), and, when a phone is present, texts the customer within the same request through `sendSMS` (a reply to their own request; no quiet-hours deferral); duplicates by platform lead id are ignored; the weekly email counts leads by source.

Acceptance (now, draft): a POST to `/api/angi?c=slug` with the shop's key and Angi's name, phone, email, address, and task fields returns 200 JSON containing "success", creates a lead with `source: "angi"`, logs an owner alert containing "Angi", and logs a customer `sms_sent` in the same request; a wrong key returns 403; a repeated lead id returns "success" without a second lead; the Thumbtack receiver does the same with `source: "thumbtack"`.

## 3. Assumptions (Steve can overturn any; each is one line to change)

1. Round 4 question 1: the Starter card and the rules band change to what exists; Pro's "several numbers and crews" line is left until Steve decides, and no second-number route is built this sprint (S4-11).
2. Round 4 question 2: the Spanish strings still await Steve's reviewer; ALTO and PARAR are added as custom opt-out keywords on the Messaging Service as a documented one-time Twilio setting, and the code handles them regardless (S4-06).
3. Round 4 question 3: the "Did the visit happen?" nudge goes on every plan, one owner text per visit, 9:00 am Houston the day after the visit (S4-05).
4. Round 4 question 4: none of the first three shops is known to pay for Angi or Thumbtack, so S4-12 is last and conditional.
5. Round 4 question 5: the consent-ask sentence ships behind `rules.consentAsk` (default off) with the PO's wording until Steve approves it; the code and checks are complete either way (S4-10).
6. Owner notes (visit nudge, overdue callback, welcome) are not customer texts and are not deferred by quiet hours; the visit nudge is placed at 9 am anyway.
7. "Bookable conversation" excludes `question_only` leads and spam; "would have gone to voicemail" means a booking whose first contact was a missed-call text-back or outside business hours (S4-09).
8. Sprint 1 to 3 assumptions stand, including billing parked and hand invoicing; the keyed-pass reserve (S4-04) is spent first whenever Steve's keys arrive.

## 4. Out of this sprint

| Item | Why |
|---|---|
| Pro multi-crew: on-call rotation, several numbers with per-number greeting, dispatch by ZIP | Round 4 item 12 (LATER); no Pro prospect yet |
| In-thread Thumbtack replies | partner API; receiving leads (S4-12) does not need it |
| Latency and abandonment in the weekly email; `assistant-request` timeout count on the line-health card | wait for the keyed pass to show what Vapi reports |
| Billing, pre-conversion text, blocklist, call spam tagging, pause-at-limit | parked by Steve's rule |
| Watch items from R4.1 (`handoff` leads get a callback clock; `callback_check` inside quiet hours is an owner note) | no change needed now; re-read after customer two |

## 5. Verification plan

Setup as in `SPRINT.md` section 5.1 and `SPRINT2.md` section 5 (fresh draft from `main`, PM Test shop, admin-attached number, `voice.assistantId` set by admin for `assistant-request` lines). Hooks this sprint uses: `admin prompt` with `at`; `POST /api/vapi` with a top-level `at`; `admin run_scheduler` with `force_hour` (9 for the visit nudge) and `force_day`; `admin records kind=customers` (S4-10); the per-client Angi key set by admin (S4-12). Scheduled follow-ups are checked against `nextOpenTime` computed independently (Python `zoneinfo`); dates against Houston calendar dates computed independently.

Pre-key pass: each ticket's "now" lines against the engineer's named draft, recorded on the status line as `verified <date> <deploy id>` or `returned: <line and what was seen>`; lines that cannot run on a draft are marked so and the code path named. Every session ends with `admin delete` for each test shop, `admin clear_optout` for each fake number, and `GET /api/admin` showing no test shop.

Keyed pass (S4-04): as in `SPRINT2.md` section 5 plus the sprint 3 keyed lines; add the welcome text on `go_live` (S4-07) and a Spanish ALTO from Steve's phone (S4-06).

Go-live gate for customers two and three: S4-04 complete, S4-01 to S4-03 verified, S4-05 and S4-07 verified, the 14-case matrix plus the S3-05 emergency cases and an ALTO case passed on the customer's test line, the OPERATIONS.md runbook followed and the sheet filed.
