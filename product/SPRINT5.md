# Sprint 5: running ten shops as one person, and the day-30 case

Owner: Product Manager. Cut from `BACKLOG.md` Round 5 (R5.1, 2026-10-20). Same working rules as sprints 1 to 4: engineer builds in order, marks `delivered` with a verification note; the PM runs the checklist and records `verified` or `returned` with the failing line; trade-offs go to `DECISIONS.md`. Round 5 items 1 to 3 were built before this cut (commit `7c4b87b`, DECISIONS.md 2026-10-20 "round 5 MUSTs"); they are S5-01 to S5-03 here with the engineer's notes and the PM's verdict.

Status legend: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` | `returned`.

## 1. Sprint goal

Make the product safe for Steve to run alone at ten shops and ready for the day-30 conversation: hours that are read correctly or declared unread, a "yes" that never becomes a false consent record, fallbacks and alerts when a webhook or a forwarding rule breaks, a monthly statement on the 1st, an admin page instead of curl, platform receivers that match what Angi and Thumbtack send, one reply per alert, a simpler portal, honest weekly arithmetic, and Spanish copy ready for the reviewer. The keyed pass stays reserved first; L1, L2, L3, L5 remain open until it runs.

Sizes: S up to half a day, M up to a day and a half. About 11 engineer-days including the 2.5-day reservation. Cut line: S5-11 slides first, then S5-09.

Sprint rules carried over: every new store kind extends `admin.mjs` `delete`; every outbound text goes through `sendSMS` with `client` and, when scheduled, `scheduleFollowUp`; owner notes and Steve alerts are not customer texts; copy rules from CLAUDE.md; `node --check`, `node scratchpad/hours-test.mjs`, and `python3 -I scripts/sitecheck.py .` before `delivered`; new admin hooks are listed in section 5.

## 2. Tickets

### S5-01 The hours parser reads real website sentences, and says so when it cannot
Status: delivered 2026-10-20 (engineer, draft `6ad7758ea77dae7c783b5c34`); PM verdict below. Size: M. Implements: Round 5 item 1 (MUST).

Engineer note: `parseHours` is a scanner (pipes, periods, "Hours:", "open", "weekdays", "weekends", "daily", "every day", "7 days a week", "M-F", "Mon-Sun", Spanish day names; a bare range applies to all seven days; "24/7" with "emergency", "on call", or "after hours" sets `emergency247` only). The PO's 23 sentences parse as listed (`node scratchpad/hours-test.mjs`). When nothing parses, `build.missing` carries "hours could not be read; set per-day hours on the portal", the ready-to-test email adds "We could not read your hours; using 7 am to 7 pm until you fill in the rows", and the portal Hours card says the same.

Files: `netlify/functions/lib/config.mjs` (`parseHours`), `netlify/functions/onboard-build-background.mjs`, `desk.html`, `scratchpad/hours-test.mjs`.

Acceptance (now):
- [ ] `node scratchpad/hours-test.mjs` prints the 23 tables the PO listed: "Weekdays 8-5" is Mon to Fri; the pipe, period, and "Hours:" forms parse; "Every day", "Open daily", and "7 days a week" give all seven days; "Lunes a Viernes 8am a 6pm" parses; the two emergency phrases leave hours alone and set the flag.
- [ ] A shop onboarded with hours "By appointment, call us" has `rules.hours` null, `build.missing` containing "hours could not be read", the ready-to-test email line in `build.notes`, and the portal Hours card line (page code).

### S5-02 A "yes" answers the question that was asked, not the consent ask
Status: delivered 2026-10-20 (engineer, same draft); PM verdict below. Size: S. Implements: Round 5 item 2 (MUST).

Engineer note: `noteConsentReply` takes the conversation and returns null unless the last assistant message in it carries `system: "consent_ask"`; a "yes" after a reminder confirmed the visit and stored nothing; a "YES" right after the ask stored the record.

Files: `netlify/functions/lib/desk.mjs` (`noteConsentReply`), `netlify/functions/sms.mjs`.

Acceptance (now, draft): with the consent ask sent and then a 1 h reminder sent to the same number, "yes" confirms the visit (inline "confirmed for ...") and stores no `marketingConsent`; with the consent ask as the last outbound message, "YES" stores it and logs `marketing_consent`.

### S5-03 Fallback paths and alerts to Steve when the plumbing breaks
Status: delivered 2026-10-20 (engineer, same draft); PM verdict below; the Twilio half is keyed. Size: M. Implements: Round 5 item 3 (MUST to run it).

Engineer note: `buyLocalNumber` and `setNumberWebhooks` pass `VoiceFallbackUrl` and `SmsFallbackUrl` from `VOICE_FALLBACK_TWIML_URL` and `SMS_FALLBACK_TWIML_URL` (unset until Steve creates the TwiML Bins; `.env.example` and OPERATIONS.md say so), and provisioning sets a Vapi-answered number's voice fallback to `/api/voice` after the import (also on resume). The scheduler logs `health_alert` with reason `sms_failures` (three or more `sms_failed` in an hour), `voice_failures` (`vapi_tool_failed`, `assistant_request_failed`, `voice_attach_failed`, or `voice_detach_failed` in 15 minutes), or `no_inbound` (live, forwarding verified, no inbound call or text for five business days), each once per hour per reason (once per five days for `no_inbound`), and notifies Steve; `run_scheduler` returns `alerts`. Test hooks: `admin log_event`, admin update accepting `liveAt`, `phone.forwardingVerified`, `phone.firstCallAt`.

Files: `netlify/functions/lib/twilio.mjs`, `netlify/functions/provision-background.mjs`, `netlify/functions/lib/vapi.mjs`, `netlify/functions/scheduler.mjs`, `netlify/functions/admin.mjs`, `.env.example`, `OPERATIONS.md`.

Acceptance (now, draft): three injected `sms_failed` then `run_scheduler` returns `alerts` with `sms_failures` and logs one `health_alert`; a second run inside the hour adds none; an injected `vapi_tool_failed` gives `voice_failures`; a live shop with `forwardingVerified`, `firstCallAt` ten days back, and no inbound event gives `no_inbound` once and not again within five days; a shop with inbound texts today raises no `no_inbound`; `grep` shows `VoiceFallbackUrl` and `SmsFallbackUrl` in `lib/twilio.mjs` and the two env names in `.env.example` and OPERATIONS.md.
Acceptance (keyed, S5-04): after provisioning, `GET IncomingPhoneNumbers/{sid}` shows `voice_fallback_url` and `sms_fallback_url` set as above, and on a Vapi-answered number the voice fallback is `/api/voice`; Steve's phone and inbox receive the alert text and email.

### S5-04 Keyed pass reserve (S2-01, carried)
Status: todo. Size: reserve 2.5 days. Implements: sprint 2 S2-01 unchanged plus the sprint 2 to 5 keyed lines (ring timer on a real SIM, returning-caller greeting, real number release, `VAPI_WEBHOOK_SECRET`, Spanish voice greeting, a callback promise and an ALTO from Steve's phone, the welcome text, the Angi and Thumbtack receivers on real posts, the fallback URLs and a real health alert). Spent first whenever Steve's keys arrive.

### S5-05 A monthly statement on the 1st
Status: delivered 2026-10-20, draft 6ad778b8b054228766fa49c6. Engineer check: `admin monthly` (optional `month`) returned the previous Houston month with every line (calls answered and texted back, booked by channel, jobs that would have gone to voicemail, review requests sent and happy replies, callback promises kept, emergencies, leads from platforms when any, usage with the overage in dollars, what changed, next month from `nextMonthNote` set by admin or a default sentence) and an `invoice` field "Invoice: $249 plus $0.00 overage"; `run_scheduler force_day=1 force_hour=9` (numeric `force_day` is a day of the month, a weekday name still drives the Monday send) logged `monthly` once for the live shop, emailed the owner and Steve (Steve's copy ends with the invoice line), texted nothing; the owner's `POST {action:"monthly"}` returns the statement without the invoice field; a shop live for less than a day of the statement month is skipped. Size: M. Implements: Round 5 item 4 (SHOULD, day 30).

Files: `netlify/functions/lib/desk.mjs` (`monthlyStatement(c, month)`), `netlify/functions/scheduler.mjs` (the 1st at 9:00 to 9:09 Houston, every shop live during the month; owner email; Steve copy with the invoice line), `netlify/functions/admin.mjs` (`monthly` with `month` and `send`), `netlify/functions/client.mjs` (POST `monthly`), `netlify/functions/lib/usage.mjs` (read the month's record).

Change: one email for the previous Houston month: calls answered and texted back, bookings by channel, jobs that would have gone to voicemail, review requests sent and positive replies, callback promises kept, emergencies handled, leads from platforms, usage against the plan and any overage, what changed (`config_updated` count and the flags cleared), and "Next month: {one line Steve types into `rules.nextMonthNote` on the admin page or by PUT; empty means the line is omitted}". Both copies carry "Invoice: $249 plus $0 overage" (assumption 2); Steve's copy adds the usage record id.

Acceptance (now, draft): `admin monthly` for a shop returns text with every line above for the previous month; `run_scheduler force_day=1 force_hour=9` (engineer adds `force_day` as a day-of-month when numeric) logs `monthly` once per live shop, emails the owner and Steve, and texts nothing; the invoice line reads the plan price and overage from the usage record; a shop that went live mid-month gets the statement; a shop live for less than a day of the month does not.

### S5-06 An admin page
Status: delivered 2026-10-20, draft 6ad778b8b054228766fa49c6. Engineer check: `admin.html` (noindex, key kept in sessionStorage, no key in the page) lists every shop with status, plan, live since, 10DLC state and sender, this month's usage, errors in 24 h, last inbound, open flags, waiting alerts, pending and overdue callbacks, and per row: Portal (as the owner), Policy, Pause or Resume, Digest, Weekly, Monthly (shown, or sent on confirm), Angi and Thumbtack keys, Clear opt-out, Delete; plus the last 24 hours of events across shops. Server: `GET /api/admin?full=1` returns those columns and the event stream; new admin actions `pause` and `resume` (voice detach and attach as the portal does). Pause from the page changes the row on reload (the page reloads after each action). Browser check is the PM's. Size: M. Implements: Round 5 item 5 (SHOULD, ten shops); assumption 3.

Files: new `admin.html` (noindex, `data-no-widget`, key pasted once and kept in `sessionStorage`), `netlify/functions/admin.mjs` (GET gains the columns: 10DLC state, sender, this month's usage, errors in 24 h, last inbound, open flags, waiting alerts, pending callbacks; new `events_recent` action across shops for the last 24 hours), `_redirects` (`/admin` to `admin.html`), `robots.txt` unchanged (noindex meta suffices).

Change: a table of shops with the columns above and, per row: open the portal as the owner, open the policy page, Pause or Resume, run digest, weekly, or monthly, set the Angi key and Thumbtack secret, clear a test opt-out, delete (with a confirm). Below the table, one event stream across shops for the last 24 hours (type, shop, time, two data fields). Every call goes to `/api/admin` with the key from `sessionStorage`; a 403 clears the key and asks again.

Acceptance (now, draft): opening `admin.html` on the draft with the key lists every shop with the columns; `GET /api/admin` carries the new columns; Pause on a row changes the shop's status and the row within five seconds (browser check by the PM); `admin events_recent` returns events from more than one shop sorted by time; a wrong key shows the key prompt again.

### S5-07 Platform receivers mapped to what the platforms send
Status: delivered 2026-10-20, draft 6ad778b8b054228766fa49c6 (plus one local fix after the run). Engineer check: a `NegotiationCreatedV4` body (`negotiationID`, `customer.displayName`, `customer.location.{city,state,zipCode}`, `request.{category,title,description}`) created a `thumbtack` lead with the display name, "Katy, TX, 77494", the request as the issue, no phone, no chase tasks; the owner alert's last line now reads "No phone number comes with Thumbtack leads. Reply in the Thumbtack app." (it replaces the "ok REF" ask; verified by node after the draft run showed the sentence appended past the preview); an Angi post with no recognized field created a lead with `raw` stored, `texted: false`, and emailed Steve "Angi field names differ" with the body (`notifySteve`, logged path without Resend). Size: S. Implements: Round 5 item 6 (SHOULD).

Files: `netlify/functions/thumbtack.mjs`, `netlify/functions/angi.mjs`, `netlify/functions/lib/desk.mjs` (`receivePlatformLead`: no phone means no chase and no text-back), `OPERATIONS.md`.

Change: Thumbtack reads `NegotiationCreatedV4`: `negotiationID` as the source id, `customer.customerID`, `customer.displayName`, `customer.location.{city,state,zipCode}`, `request.{category,title,description}`; with no phone it schedules no chase and the owner alert ends "Reply in the Thumbtack app."; the old field names stay as fallbacks. Angi keeps the tolerant mapping; when none of the known fields match, the lead is still created from the raw body (`raw` stored, issue "Angi lead, see raw") and Steve gets one email "Angi field names differ: {shop}" with the body.

Acceptance (now, draft): a `NegotiationCreatedV4`-shaped POST creates a lead with the display name, city, and ZIP, `sourceId` equal to `negotiationID`, no `lead_chase` task, no customer `sms_sent`, and an owner alert ending "Reply in the Thumbtack app."; an Angi POST with unrecognized field names creates a lead with `raw` and the function log shows the Steve email; the earlier shapes still work.

### S5-08 Every alert asks for one reply, and a bare command works when only one job fits
Status: delivered 2026-10-20, draft 6ad778b8b054228766fa49c6. Engineer check: a booking alert ends "Reply \"otw REF\" when you are on the way.", a callback lead ends "Reply \"called REF\" once you have reached them.", every other lead ends "Reply \"ok REF\" to acknowledge." (the visit check keeps its two, done or cancel, by design); every owner alert in the run named at most one command; bare `called` with one open callback logged it, bare `otw` with one visit today sent the on-the-way text (and the reply now says to text `done REF` when finished), bare `done` with two candidates replied "Which one? Lee Park (done REF), Mia Chen (done REF)." and changed nothing, `done REF` still works; `help` and the welcome text are shorter and say each alert names the one reply it needs. Size: M. Implements: Round 5 item 7 (SHOULD, simplify).

Files: `netlify/functions/lib/desk.mjs` (`ownerSummary` and every owner alert name exactly one reply; `ownerCommand` accepts a bare `done`, `otw`, `called`, `ok` and resolves the single open candidate: `done` the one booking awaiting its visit check or on the way, `otw` the one booking today, `called` or `ok` the one waiting alert or open callback), `netlify/functions/sms.mjs` (`HELP` shortened), `netlify/functions/client.mjs` (welcome text lists four commands), `desk.html` (commands card lists the same four plus `invoice`, `quote`, `paid`, `cancel` under "also").

Change: emergency alerts end "Reply ok {REF}"; wants-a-call "Reply called {REF} when you have"; bookings "Reply otw {REF} when on the way"; the visit check "Reply done {REF} or cancel {REF}"; after done "If they still owe you, text invoice {REF} 450". A bare command with two or more candidates replies with the refs and does nothing.

Acceptance (now, draft): every owner `sms_sent` of type `owner_alert` or `owner_note` in `admin records kind=events` contains at most one "Reply ... REF" instruction; "done" alone with one booking awaiting its visit check marks it done; with two it replies with both refs and marks nothing; "otw" alone with one visit today sends the on-the-way text; `help` is under 300 characters.

### S5-09 The portal gets an Account tab and a shorter Setup
Status: delivered 2026-10-20, draft 6ad778b8b054228766fa49c6. Engineer check: tabs are Today (live shops only), Test it (hidden once live; a "Test it" link in the header shows it), Leads and bookings, Conversations, What it knows, Setup, Account; Setup keeps line health, checklist, number, forwarding, registration, phone answering, website snippet and site block, calendar, test text; Account holds this month's usage, the commands card, your data and exports, the policy link, and the Cancel service button (the header's cancel button hides when live); Today holds the strip, a Needs you list with acknowledge buttons and overdue tags, and the last 24 hours of events; no element id appears twice. Browser check is the PM's. Size: M. Implements: Round 5 item 8 (SHOULD, simplify).

Files: `desk.html`, `netlify/functions/client.mjs` (no API change expected).

Change: tabs Today (the strip plus line health), Leads and bookings, Conversations, What it knows, Setup (checklist, number, forwarding, registration, phone answering, website snippet and site block, calendar), Account (usage, digest and text switches, consent-ask switch, data and exports, policy link, commands card, pause, cancel). After go-live the Test tab becomes a "Test it" link in the header that opens the test pane; before go-live Test stays first.

Acceptance (now, draft): a live shop's portal shows the six tabs with no card on two tabs, the Test pane opens from the header link, the Today tab carries the strip and the line-health card; a testing shop still opens on Test; the PM checks both in a browser and the page code.

### S5-10 Weekly and monthly arithmetic: one customer, one count
Status: delivered 2026-10-20, draft 6ad778b8b054228766fa49c6. Engineer check: a customer who booked twice in the week counted once in the numerator ("2 booked of 4 bookable conversations (50 percent) (3 visits in all)"), the rate is capped at 100, a `call_ended` from a number with a spam lead moved out of "answered" into "1 spam call, not counted"; `stats` carries `bookedCustomers` and `spamCalls`; the monthly statement uses the same spam rule. Size: S. Implements: Round 5 item 9 (SHOULD).

Files: `netlify/functions/lib/desk.mjs` (`weeklyReport`, and `monthlyStatement` from S5-05).

Change: the booking rate's numerator is unique booked contacts (phone or contact), capped at 100 percent; `answered` excludes `call_ended` events from contacts with a spam lead that week, which are counted under "spam, not counted".

Acceptance (now, draft): a week with one customer booking twice, three bookable conversations, and one call whose caller the model tagged spam reads "1 booked of 3 bookable conversations (33 percent)" and lists the spam call under "spam, not counted" rather than "answered"; a week where every bookable conversation booked reads 100 percent, never more.

### S5-11 Spanish copy polish before the reviewer sees it
Status: delivered 2026-10-20, draft 6ad778b8b054228766fa49c6. Engineer check: the Spanish unsubscribe reply says "Responda EMPEZAR"; the bilingual missed-call text-back ends "Responda STOP o ALTO para no recibir mensajes."; the Spanish second chase renders windows with "a" (via `winEs`, from S3-11); the Spanish C fast path now reads "confirmada para mañana, 8 a 12" (the PM's find during the S5-01 to S5-03 pass) and the R fast path answers in Spanish. Size: S. Implements: Round 5 item 10 (SHOULD).

Files: `netlify/functions/sms.mjs` (the Spanish unsubscribe reply names EMPEZAR), `netlify/functions/lib/desk.mjs` (`TEMPLATES_ES.lead_chase` renders windows with `winEs`), `netlify/functions/voice.mjs` (the bilingual text-back ends "Reply STOP to opt out / Responda STOP o ALTO").

Acceptance (now, draft): the Spanish unsubscribe reply contains "EMPEZAR"; the Spanish second chase for windows "8 to 12" and "12 to 5" reads "8 a 12 o 12 a 5"; the bilingual text-back on a Spanish-enabled shop contains "STOP o ALTO"; `node -e` shows every `TEMPLATES_ES` and `STRINGS.es` string free of " to " between digits.

## 3. Assumptions (Steve can overturn any; each is one line to change)

1. Round 5 question 1: the fallback wordings ship as the PO wrote them ("We are having trouble connecting right now; please call back in a few minutes" and "We got your text and will reply shortly"); Steve creates the two TwiML Bins once and pastes their URLs into `VOICE_FALLBACK_TWIML_URL` and `SMS_FALLBACK_TWIML_URL` (S5-03, keyed).
2. Round 5 question 2: the owner's monthly statement shows the invoice line (plan price plus overage); it is the owner's own bill, not site copy, so the price-once rule does not apply (S5-05).
3. Round 5 question 3: the admin page is built as a static page calling `/api/admin` with the key held in `sessionStorage` (S5-06).
4. Round 5 question 4: the silence alarm stays at five business days; the threshold is an env `HEALTH_SILENCE_DAYS` (default 5) so a slow-week trade can be set to ten without a deploy.
5. Round 5 question 5: the Spanish reviewer is still pending; S5-11 prepares the strings so the review is one pass.
6. Bare commands resolve only when exactly one candidate is open; two or more always get the list, never a guess (S5-08).
7. The monthly statement goes to every shop that was live at any point in the month, on the 1st at 9 am Houston, by email only (S5-05).
8. Sprint 1 to 4 assumptions stand, including billing parked and hand invoicing; the keyed-pass reserve (S5-04) is spent first whenever Steve's keys arrive.

## 4. Out of this sprint

| Item | Why |
|---|---|
| Pro line decision (several numbers and crews) | Round 5 item 11 (LATER); waits on Steve's answer from Round 4 |
| In-thread Thumbtack replies | partner API |
| Per-call latency and the `assistant-request` timeout count | wait for the keyed pass to show what Vapi reports |
| A second daily touch to the owner | the PO's explicit no: digest, Monday email, visit nudge, and overdue callback are enough |
| Billing, pre-conversion text, blocklist, call spam tagging, pause-at-limit | parked by Steve's rule |

## 5. Verification plan

Setup as in `SPRINT.md` section 5.1 and `SPRINT2.md` section 5 (fresh draft from `main`, PM Test shop, admin-attached number, `voice.assistantId` set by admin where `assistant-request` lines run). Hooks this sprint uses: `admin log_event`, admin update with `liveAt`, `phone.forwardingVerified`, `phone.firstCallAt` (S5-03); `admin monthly` and `run_scheduler force_day=1 force_hour=9` (S5-05); `admin events_recent` (S5-06); the Angi key and Thumbtack secret by admin (S5-07). `node scratchpad/hours-test.mjs` is part of every S5-01 check.

Pre-key pass: each ticket's "now" lines against the engineer's named draft, recorded on the status line as `verified <date> <deploy id>` or `returned: <line and what was seen>`; lines that cannot run on a draft are marked so and the code path named; browser-only lines (admin page, portal tabs) are checked by the PM in a browser and noted as such. Every session ends with `admin delete` for each test shop, `admin clear_optout` for each fake number, and `GET /api/admin` showing no PM Test shop.

Keyed pass (S5-04): as in `SPRINT2.md` section 5 plus the sprint 3 and 4 keyed lines, the fallback URLs on a real number (S5-03), and a real health alert on Steve's phone.

Go-live gate for customers two and three: unchanged from sprint 4 (S5-04 complete, the matrix plus the emergency and ALTO cases on the customer's test line, the runbook followed, the sheet filed), plus S5-01 to S5-03 verified.
