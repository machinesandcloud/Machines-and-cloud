# Sprint 8: not breaking it, telling the truth about it, and stopping

Owner: Product Manager. Cut from `BACKLOG.md` Round 8 (R8.1, 2026-10-20). Same working rules as sprints 1 to 7. Round 8 items 1 to 3 were built before this cut (commit `1abe15f`); items 4 to 6 are in progress; item 7 is the freeze and is written into section 4. Production has been frozen at commit `b29aec9` (sprint 5) since 9:24 am Houston on 2026-10-20 by a Netlify credit freeze (git deploys skipped, CLI production deploys refused; draft deploys work), so nothing from round 6 onward is live until Steve restores the account's credits; every verdict here is on a draft.

Status legend: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` | `returned`.

## 1. Sprint goal

Make the scheduled function safe to change (recorded blocks, background fan-outs claimed once a day, a smoke test that fails the deploy, a dead-man switch), make the copy say what the code does, then rewrite the runbook, re-measure the rubric, finish the admin page, and stop: after this sprint no feature work until the first shop is live and has produced seven days of real conversations.

## 2. Tickets

### S8-01 The scheduler as recorded blocks with background fan-outs
Status: verified 2026-10-21 on the local server at commit 00a1b0a, in-memory store: a bare `run_scheduler` returned 200 with every counter and `blocks` (tasks, tenDlc skipped "no keys", healthLifecycle, release); `last_run` showed a record seconds old with no block in error; at minute 59 the per-shop scans were skipped with "runs at :00 and :30" and `"all": true` ran them; a forced hour ran the digest fan-out inline (`fanouts: ["digest"]`, `digests: 1`). The claim-once-a-day handoff to the background function is by code (`claimFanout`).
Size and scope: Size: M. Implements: Round 8 item 1 (MUST).

Engineer note: `run()` is recorded blocks (`admin last_run` returns `health/scheduler:lastRun` with per-block ok, error, or skipped); the four shop-wide sends (audit, statement, weekly, digest) live in `lib/fanout.mjs` and run in `scheduler-fanout-background.mjs` at their hour, claimed once per Houston day, while `force_hour` runs them inline so tests see the events as before.

Acceptance (now, draft): a bare `run_scheduler` returns 200 and `admin last_run` shows a record under a minute old with every block `ok`; a forced hour runs the fan-out inline and the events appear as before (digest, weekly, monthly, auto-flag); by code, a scheduled (unforced) run claims the day once and hands off to the background function, so a second claim the same day is skipped; a throw in one block is recorded on that block and the next block still runs (by code).

### S8-02 A smoke test on deploy and a dead-man switch
Status: verified 2026-10-21: locally `node scripts/smoke.mjs` passes in about 110 ms and `netlify.toml` runs it as the build command; an injected read-before-declaration in `run()` on a local copy made it exit 1 naming "ReferenceError: Cannot access 'tdzProbe' before initialization" (copy restored); on the local server at commit 00a1b0a, in-memory store a fresh store answered `/api/health` 503 with `lastRunAt` null and, right after `run_scheduler`, 200 with `minutesAgo` 0 and no failing blocks; OPERATIONS.md names the external monitor. Production lines closed 2026-10-21 from the coordinator's report (no production call by me): `main` is live at commit `4009608` after one build whose smoke test passed; one bare `run_scheduler` returned ok with every block; `/api/health` returned 200 with `minutesAgo` 0.
Size and scope: Size: M. Implements: Round 8 item 2 (MUST); assumption 1.

Engineer note: `scripts/smoke.mjs` is the Netlify build command (imports every module, seeds a shop in an in-memory store, runs every scheduler gate, calls the handlers; fails the deploy on a throw; about 150 ms locally); `/api/health` returns 200 when the last run is under 25 minutes old with every block ok, 503 otherwise.

Acceptance: `node scripts/smoke.mjs` passes locally and a draft deploy's build runs it; reintroducing a read-before-declaration in `run()` on a local copy makes the smoke test exit non-zero naming the error (restored afterward); `/api/health` on a fresh draft (no run yet) returns 503 with `lastRunAt` null, and 200 with `minutesAgo` under 25 right after `run_scheduler`; OPERATIONS.md names the external monitor sign-up.

### S8-03 Copy that says what the code does
Status: verified 2026-10-20 (repo): no "every day", "comes daily", or "summary of the day" in `index.html` or `client.mjs`; the Starter card reads "a 6 pm summary on any day it handled something", the Growth card "Payment reminders on day 3 and 7 once you log an invoice", FAQ 10 and the welcome text match; CLAUDE.md has one Built list (line 39) and one Not-yet-built list (line 89); the runbook's step 8 reads flags and auto-flags; prices at the same counts; `sitecheck.py` passes; no em dashes in the visible copy (the one in CLAUDE.md is its title, internal).
Size and scope: Size: S. Implements: Round 8 item 3 (MUST).

Engineer note: 6 pm summary on days with activity, payment reminders once an invoice is logged, CLAUDE.md's built list, the runbook's days 2 to 7 read flags.

Acceptance (repo): `grep -c "every day\|comes daily\|summary of the day" index.html netlify/functions/client.mjs` returns 0 for those phrases; the Starter card says the summary comes on days it handled something; the Growth card says "when you log an invoice"; FAQ 10 and its JSON-LD entry match; the welcome text matches; CLAUDE.md has one "not built" list; the runbook's step 8 reads flags and auto-flags; prices unchanged; `sitecheck.py` passes; no em dashes.

### S8-04 The go-live runbook rewritten to the product as built
Status: verified 2026-10-21 (repo): the runbook is rewritten to the product as built: step 1 reviews hours rows, the emergency table, prices and windows, the handoff list, the review link, the always-ring-through list, Spanish, backup phone, the consent switch, and the platform keys, with the Called stamp as proof; step 4 is the 18-case gate; step 8 clears flags and auto-flags; step 9 names the `day7_draft`, the Sent stamp, and the `trial_over` it releases; step 10 the Invoiced stamp; every proof named (`welcome`, `provisioned`, `live`, `monthly`, `day7_draft`, `auto_flag`, `flagged`, `unflagged`, `config_updated`, `call_started`, `missed_call`, `lead_closed`, `alert_opened`, the three stamps) exists in the functions.
Size and scope: Size: S. Implements: Round 8 item 4 (SHOULD).

Acceptance: every proof named in the runbook is an event type or stamp that exists in the code (one grep per proof), the matrix count reads 18, step 1 checks hours rows, the emergency table, the review link, the VIP list, Spanish, and the platform keys, and the day-7 step names the admin page's Sent stamp.

### S8-05 Re-measure the rubric after the tightening
Status: verified with the fake model 2026-10-21 on the local server at commit 1835317 (in-memory store), real-model wording still owed: `{"action":"classifier_eval","models":["fake"],"from":0,"to":50,"set":2}` runs the second labelled set and answers `exact: 19 of 20` with per-reason numbers; set 1 answers `exact: 44 of 50`. These measure the fake model, so the second measurement that decides the Needs-me exclusion still waits for a real run and is recorded in DECISIONS.md once made.
Size and scope: Size: S. Implements: Round 8 item 5 (SHOULD); assumption 3.

Acceptance: DECISIONS.md carries a second measurement dated after commit `426c051` with precision and recall per reason on a set that adds ten clean no-booking threads and ten late-answer threads, and the Needs-me count excludes any reason under 80 percent precision on that run.

### S8-06 What the admin page still cannot do that curl can
Status: verified with a note 2026-10-21 on the local server at commit 00a1b0a, in-memory store: `tasks` lists a shop's scheduled sends and `cancel_task` removes one; `prompt` returns the current SMS prompt; `nextMonthNote` set by admin shows in the statement; `run_scheduler` from the page returns the counters; `admin.html` carries the tasks, prompt, reactivate, and note actions. Note: `reactivate` returns a cancelled shop to `paused` with a note that the owner presses Resume (or admin `resume`) to go live, rather than straight to live; a deliberate safety choice, accepted.
Size and scope: Size: S. Implements: Round 8 item 6 (SHOULD).

Acceptance: from the admin page Steve can list a shop's scheduled sends and cancel one, open the current SMS prompt, reactivate a cancelled shop, run the scheduler now, and set the next-month note, each reflected on reload (page code plus the engineer's render; API actions checked by curl).

### S8-07 Keyed pass reserve (S2-01, carried; step 4 of the critical path)
Status: todo. Size: reserve 2.5 days. Spent first whenever Steve's keys arrive and the account is unfrozen.

### S8-08 Resilience addendum from Round 9: the brake, a trimmed admin stream, a cached widget config, and the credit facts
Status: verified 2026-10-21 on the local server at commit 8838d64 (in-memory store, no Netlify calls). Size: S. Implements: Round 9 (cost and resilience) items 1, 4, and 5 as built by the engineer; the freeze stands, so no SPRINT9.md is opened.

Engineer note: `admin {"action":"brake","on":true}` stops the half-hour scans and the nightly audit while due texts, webhooks, reminders, and the digest keep running; the admin page has the Brake button and shows the last scheduler run next to the shop count; `GET /api/admin?full=1` carries `brake` and `lastRun` and caps the event stream at 50 per shop; the public `GET /api/client?c=` returns `Cache-Control: public, max-age=60` (and the durable Netlify CDN header) so the widget config is served from the CDN; OPERATIONS.md has the credit facts (compute, requests, bandwidth, and production deploys are metered; storage operations are not), Steve's account steps (auto recharge, threshold emails), and the 10-minute monitor.

Acceptance (local, verified): with the brake on, `run_scheduler` with `all: true` and `force_hour` 21 skipped `healthLifecycle` and ran no autoflag fan-out while the tasks block ran; `force_hour` 18 still ran the digest fan-out (`digests: 1`); `?full=1` carried `brake { on, at, by }` and `lastRun`; with the brake off the scans ran again and the autoflag fan-out was attempted; after 60 Angi posts the stream held exactly 50 events for the shop; the public GET carried `cache-control: public, max-age=60` and `netlify-cdn-cache-control: public, max-age=60, durable` while the owner GET stayed uncacheable; `admin.html` carries the Brake button and the last-run display; OPERATIONS.md carries the credit section, the account steps, and the monitor; no em dashes.

### S8-09 Storage sized for the request (Round 9 item 3)
Status: verified 2026-10-21 on the local server at commit 7caf297 with a note (in-memory store, no Netlify calls); the `noteReviewReply` line closed with the fake model at commit 1835317, real-model wording still owed: after `done REF` and a nudged `review_request`, a customer reply of "Great job, thanks!" on the SMS line was stored as `reviewReply` with `sentiment: positive` on the asked booking through the per-phone index. Size: M. Implements: Round 9 item 3 as built by the engineer (DECISIONS.md "round 9 item 3"); a change to hot paths, so every read path was exercised.
Size and scope: Size: M. Implements: Round 9 item 3 as built by the engineer (DECISIONS.md "round 9 item 3"); a change to hot paths, so every read path was exercised.

Engineer note: per-phone indexes in the index store (`bookings:<slug>:<phone>`, `leads:<slug>:<phone>`) written on every booking, lead, and platform lead; `upcomingBookings`, `customerType`, `callerContext`, `recentOpenLead`, `noteReviewReply`, and the lead-closing step in `bookVisit` read through them; platform duplicates use `platform:<slug>:<source>:<id>` keys; the webhooks write `health/lastInbound:<slug>`, which the `no_inbound` alert and the portal line-health card read first; the half-hour scan reads 150 events; `admin delete` removes the index keys and the pointer.

Acceptance (local, verified): a booking made through the Vapi tool-calls path was stored for the caller and `C` from that number confirmed inline ("confirmed for tomorrow, 8 to 12"); `assistant-request` for that number greeted "Tom" and knew the visit; a repeat callback request from one number within 30 minutes merged into the open lead (one lead, a `lead_updated` event); a second Angi post with the same lead id returned `duplicate: true` with one lead; a booking from a number with an open lead set the lead to `booked` with `lead_closed`; an inbound text set `lastInboundText` on the line-health card; after `admin delete`, a new shop reusing the number started clean (unknown caller, no inline confirm, the same Angi id not a duplicate). `noteReviewReply` through the index waits for the local model key. Note: the single `lastInbound` pointer does not distinguish calls from texts, so after an inbound text the card's "last inbound call" shows that time too; cosmetic, worth a two-field pointer when the hot paths are next touched.

## 3. Assumptions (Steve can overturn any; each is one line to change)

1. Round 8 question 1: the external uptime monitor for `/api/health` is a one-time sign-up under Steve's email (the stronger choice: a watcher on the same platform shares its failures).
2. Round 8 question 2: feature work stops after this sprint until the first shop is live with seven days of real conversations; the next round's evidence is those conversations.
3. Round 8 question 3: `no_address` and `question_unanswered` stay in the Needs-me count until S8-05 measures them; if either stays under 80 percent precision it becomes a stamp only.
4. Round 8 question 4: the Spanish reviewer, the Pro line, and the filing date of the bridge-sender brand stay pending; the brand filing remains the longest lead time on the path.
5. Production is frozen at `b29aec9` until Steve restores the Netlify account's credits; the keyed pass waits on both the keys and the unfreeze.
6. Sprint 1 to 7 assumptions stand.

## 4. Out of this sprint

| Item | Why |
|---|---|
| Pro multi-number routing, in-thread Thumbtack replies, Google LSA source tagging, per-call latency, more lifecycle messages or rubric reasons, per-action permission toggles, Jobber and Housecall Pro APIs, further admin polish beyond S8-06 | until customer one is live (Round 8 item 7, the freeze); no `SPRINT9.md` before a real shop has a `liveAt` |
| Billing, pre-conversion text, blocklist, call spam tagging, pause-at-limit | parked by Steve's rule |
| Deploying anything to production | the Netlify credit freeze; Steve's account action, not a ticket |
| Round 9 item 2 (the static site on a host a pause cannot reach), item 3 (storage access patterns), item 6 (another host) | Steve's decisions; unbuilt under the freeze, and Round 9's finding that Netlify meters deploys, compute, requests, and bandwidth but not storage operations reorders them |

## 5. Verification plan

Setup as in `SPRINT.md` section 5.1 and `SPRINT2.md` section 5 on a draft deploy (production is frozen). Hooks this sprint uses: `admin last_run`, `/api/health`, `run_scheduler` with and without `force_hour`, `node scripts/smoke.mjs` locally and in the draft build log. Every session ends with `admin delete` for each test shop, `admin clear_optout` with a live slug for each fake number, and `GET /api/admin` showing no PM Test shop.

Keyed pass (S8-07): everything from the earlier sprints, after the account is unfrozen.

Two standing rules from Steve, kept here so no session forgets them: no push per commit (each push is a 15-credit build; `main` is pushed once per verified batch), and no draft deploys at all. All verification runs on the local server (`node scripts/local-server.mjs`, http://localhost:8888, admin key `local-admin`, in-memory store); with no Anthropic key present the server uses the deterministic fake model (`lib/fake-model.mjs`, `MC_FAKE_MODEL=1`), so model lines close as "verified with the fake model, real-model wording still owed" and the real-model wording is rechecked once a key is in the gitignored `.env`.

## 6. Verification record

### Pre-key pass, 2026-10-20, draft `6ad7bf5e17242792b323e060` (built by the PM from `main` at `304d33e`), blocked by the account freeze

Repo-level lines passed (S8-03 copy, the smoke test and its failure on an injected read-before-declaration, the CLAUDE.md lists, the runbook step). Every function call on the draft returned `usage_exceeded`, so S8-01's `last_run` and inline fan-out lines and S8-02's `/api/health` 503-then-200 lines are not run; they stand on code read until Steve restores the account's credits. Note recorded on S6-06: because production has been frozen at `b29aec9` since 9:24 am, the scheduler fault of commit `df36c03` never reached production and there was no outage.

Results: S8-03 verified; S8-02 verified for the local half; S8-01 verified by code read; S8-04 to S8-06 in progress; S8-07 keyed pass todo.

### Local pass, 2026-10-21, local server at commit 00a1b0a, in-memory store

Rerun under Steve's local-only rule with `scratchpad/verify20.py`: S8-01 and S8-02 verified (the draft build log stays a Netlify-side check), S8-04 verified from the repo, S8-06 verified with the `reactivate` note, S8-05 partly (the hook and set exist; the measurement waits for the local model key). Results: S8-01, S8-02, S8-03, S8-04, S8-06 verified; S8-05 verified in part; S8-07 keyed pass todo. Sprint 8 is complete except the keyed pass and the one measurement, and per Round 8 item 7 no `SPRINT9.md` is cut until a real shop has a `liveAt`.

### Local pass for S8-08, 2026-10-21, local server at commit 8838d64

Every S8-08 line passed locally (the brake, the digest that keeps running under it, the stream cap, the cache headers, the admin page and OPERATIONS statics). Nothing was sent to Netlify. Holding as instructed: no SPRINT9.md, no deploys, no production calls, until the site is up and the freeze is lifted.

### Local pass for S8-09, 2026-10-21, local server at commit 7caf297

Eight of eight lines passed locally through the Vapi, SMS, Angi, portal, and admin paths; one cosmetic note on the shared last-inbound pointer. Nothing was sent to Netlify. Holding as instructed.

### Fake-model pass, 2026-10-21, local server at commit 1835317

With the deterministic fake model the lines that waited for the key were rerun locally: S8-05's `classifier_eval` on sets 1 and 2, and S8-09's `noteReviewReply` through the per-phone index. Both passed. Nothing was sent to Netlify. Real-model wording still owed. The test shop was deleted and `GET /api/admin` lists no shop. Holding as instructed: no SPRINT9.md, no deploys, no production calls, until the site is up and the freeze is lifted.

### Production closures, 2026-10-21, recorded from the coordinator's report (main live at commit 4009608)

The site is back. The coordinator did the Netlify-side steps in one pass so nothing more was spent, and I made no production call: the four orphaned test shops (`pm-test-cleaning-0fb6`, `pm-test-hvac-33bf`, `pm-test-plumbing-3095`, `s8-test-b9e4`) are deleted and `GET /api/admin` lists no shop; S8-02's build and health lines passed on production (one build, smoke test passed, bare `run_scheduler` ok with every block, `/api/health` 200 with `minutesAgo` 0); S6-06's "never reached production" note is superseded by the live build at `4009608`, which carries the `4fc8dfd` fix.

Still owed and unchanged: the real-model wording lines (local, once Steve adds the key to `.env`), the keyed passes S7-09 and S8-07 (Steve's keys), and the second rubric measurement with the real model. Holding: no SPRINT9.md until a real shop has a `liveAt`.

## 7. Release state for customer one (2026-10-21)

Written by the PM as an independent verdict for Steve, separate from the PO's. Production is live at commit `4009608`. The local tree is at `53d1c04`, one commit ahead, and that commit touches only `OPERATIONS.md`, `product/SPRINT6.md`, `product/SPRINT8.md`, and `scripts/setup-check.mjs`, so no function code differs from production. Checks run for this section, local only: `node scripts/smoke.mjs` passed (SMOKE OK in 162 ms); a local server on port 8890 (fake model, in-memory store) answered `run_scheduler` with every block ok and `/api/health` 200 with `minutesAgo` 0, then was stopped. No call went to the production site or any Netlify URL.

### 7.1 Tickets by final status

| Sprint | Tickets | Verified | Verified with follow-up or note | Verified, keyed half still owed | Verified with the fake model only | Returned, fixed, verified | Todo (keyed reserve) |
|---|---|---|---|---|---|---|---|
| 1 | 22 | 14 | 5 (S1-02, S1-05, S1-10, S1-11, S1-15) | 2 (S1-17, S1-18, waiting mode) | 0 | 0 | 1 (S1-19) |
| 2 | 14 | 10 | 3 (S2-03, S2-05, S2-14) | 0 | 0 | 0 | 1 (S2-01) |
| 3 | 11 | 9 | 1 (S3-07) | 0 | 0 | 0 | 1 (S3-04) |
| 4 | 12 | 10 | 1 (S4-08) | 0 | 0 | 0 | 1 (S4-04) |
| 5 | 11 | 8 | 1 (S5-05) | 1 (S5-03, alerts half) | 0 | 0 | 1 (S5-04) |
| 6 | 9 | 5 | 0 | 2 (S6-01, S6-02, draft half) | 0 | 1 (S6-06) | 1 (S6-04) |
| 7 | 9 | 5 | 0 | 0 | 3 (S7-03, S7-05 Growth half, S7-07) | 0 | 1 (S7-09) |
| 8 | 9 | 5 | 1 (S8-06) | 0 | 2 (S8-05, S8-09) | 0 | 1 (S8-07) |
| Total | 97 | 66 | 12 | 5 | 5 | 1 | 8 |

S1-04 was returned once and is counted as verified. The eight todo tickets are one keyed pass (S2-01) carried forward every sprint; none of it has run. Several tickets counted as verified also carry a keyed line inside their status (S2-07, S2-12, S3-07, S4-07, S4-12, S6-05, S7-02); those lines are listed in 7.2.

Runbook proof check (S8-04's acceptance, rerun with grep over `netlify/functions`): every proof the go-live runbook names exists. Events: `config_updated` (client.mjs), `provisioned` and `brand submitted` (provision-background.mjs), `missed_call` (voice.mjs), `call_started` and `call_ended` with `seconds` (vapi.mjs), `booking`, `lead`, `alert_opened`, `auto_flag` (lib/desk.mjs), `opt_out` (sms.mjs), `sms_sent` with `ok` and `type` (lib/send.mjs), `live`, `welcome`, `flagged`, `unflagged` (client.mjs), `day7_draft` and `trial_over` (scheduler.mjs, and `trial_over` waits on `day7Sent`), `monthly` (lib/fanout.mjs), admin `day7` (admin.mjs). Stamps: `lifecycle.onboardingCallAt`, `lifecycle.day7Sent`, `lifecycle.invoicedFor` (admin.mjs line 177, buttons on admin.html), `liveAt`, `phone.forwardingVerified`, `provision.steps.tenDlc`. Two notes for Steve: (a) without Twilio keys `sendSMS` still logs `sms_sent`, with `ok: false, logged: true`, so the welcome proof in step 6 counts only with `ok: true`; (b) `monthly` is logged by the scheduled fan-out only, not by a hand-sent `admin monthly`.

### 7.2 Acceptance lines never run against a real account or the real model

Sprints 1 to 6 ran their model lines on Netlify drafts with the real model; sprints 7 and 8 ran on the local server with the fake model. Nothing has run against a real Twilio, Vapi, Resend, or Google account. Grouped by who holds the blocker.

Carrier approval (Steve files; carriers decide; 1 to 6 weeks):
- Critical path step 1: Machines & Cloud's own 10DLC brand and campaign on the bridge Messaging Service. `DECISIONS.md` still reads "Submission date: not yet filed" and "Campaign VERIFIED date: pending". Until it reads VERIFIED, no customer text leaves any shop, so keyed cases 1, 3, 6, 9, 13 cannot pass by SMS.
- S2-01 L3: no 30034 on day one, and `sender_switched` after the shop's own `tenDlc: approved`.
- Runbook step 2: the shop's own brand moves from `brand submitted` to approved without `failed`; S6-05 `tendlc_owner_told` fires only on a real failure.

Steve's keys (Twilio, Vapi, Resend, Google OAuth, the two TwiML Bins, the Debugger webhook; critical path steps 2 and 3, then the keyed pass, step 4):
- S1-19 / S2-01 provisioning: `number`, `messaging`, `tenDlc: brand submitted`, `voice` all done on a real test shop; every rejected field fixed with one `DECISIONS.md` line each.
- S2-01 L1 and S2-03: missed mode with `**15#` on a real AT&T or T-Mobile SIM rings about 15 seconds, then the text-back lands within 15 seconds; all-calls mode answers and books, and the booking reaches the portal, Google Calendar, and the owner text.
- S2-01 L2: confirmation, 24 h and 1 h reminders at Houston times, and `otw REF` all land on a real phone.
- S2-01 L5, S1-18, S2-04: "talk to a person" on SMS and voice gets the window or a warm transfer with a spoken summary; an ignored emergency rings the backup phone, then Steve's cell with the spoken line.
- S1-17: Pause plays the fallback on a Vapi-answered line, Resume brings the assistant back, `voice_detached` and `voice_attached` logged.
- S2-12 and S2-01: `admin delete` and the cancel window release the number and the Vapi assistant at the providers.
- S2-07: a wrong `VAPI_WEBHOOK_SECRET` is refused; the returning-caller greeting by name on a real call.
- S3-07 and case 10 on voice: the Spanish voice greeting and a whole call in Spanish.
- S3-08 and S4-06: a callback promise and an ALTO sent from Steve's phone; ALTO, PARAR, EMPEZAR set on the Messaging Service.
- S4-07: the owner's `welcome` text arrives with `ok: true`.
- S5-03 and S6-01: the voice and SMS fallback URLs set on a real number, per shop through the TwiML Bin; a real health alert reaches Steve by text and email.
- S6-02: the Debugger webhook refuses an unsigned post once `TWILIO_AUTH_TOKEN` is set.
- S7-02: VIP voicemail recordings deleted at Twilio on `admin delete`.
- Resend: every email has only been logged, never delivered (ready to test, digest copies, Monday, statement, `day7_draft`, `trial_over`). Runbook steps 7 to 10 depend on these.
- S4-12 and S5-07: Angi and Thumbtack receivers on a real platform post (only if the first shop buys platform leads).

Steve's Anthropic key in the gitignored `.env` (real-model wording, locally):
- S7-03: the nightly rubric's wording and hits on real conversations.
- S7-05 Growth half: a test-line booking through `/api/chat` creates the booking and its `reminder_24h`, `reminder_1h`, `visit_check`.
- S7-07: `classifier_eval` on candidate models; the classifier model choice waits on it.
- S8-05: the second rubric measurement that decides the Needs-me exclusion, recorded in `DECISIONS.md`.
- S8-09: `noteReviewReply` classifying a real customer reply.
- The 14-case matrix (`SPRINT.md` 5.4) plus the four added cases has never been run end to end on any shop with the real model. A local rehearsal is possible once the key is in `.env`; otherwise its first run is gate step 4 itself. My fake-model rehearsal today of cases 1, 5, 7, 11, 14 shows why the fake model cannot stand in: it skipped area and fee on case 1, did not refuse The Woodlands on case 5, and printed tool-planning text on case 14.

Not account-bound but also owed: a Spanish reviewer Steve names (critical path step 5, `SPANISH_REVIEWED_ON`), the Jobber trial import (step 6), and the in-browser checks of the admin page and Needs-me list (S5-06, S6-07) and the portal Today strip (S4-07).

### 7.3 The go-live gate as I will run it with Steve

Entry conditions, all true before the call is booked; if any is false the date moves:
1. `DECISIONS.md` carries the bridge campaign's VERIFIED date.
2. `node scripts/setup-check.mjs` prints no missing item, and every value is mirrored in Netlify.
3. S2-01 is ticked on a test shop under Steve's own entity: provisioning, L1, L2, L3, L5, S1-17, release on delete; one `DECISIONS.md` line per field fix.
4. Spanish is either reviewed (`SPANISH_REVIEWED_ON` set) or switched off for this shop.
5. An uptime monitor points at `/api/health`, and the brake is off.

Day of go-live, in runbook order. Steps 1 to 3 (onboarding call, legal details, forwarding dialed and `*#61#` checked) end with `lifecycle.onboardingCallAt`, `provisioned`, and `phone.forwardingVerified` true on the admin page.

Step 4, the 18 cases on the portal Test tab of the real shop (production, real model). Cases 3 and 15 run after the shop's closing time.

| # | Case | Pass when |
|---|---|---|
| 1 | New customer, AC not cooling, Katy, wants tomorrow | area and fee answered first, a listed window booked, consent line once, BOOKED alert marked new |
| 2 | Same contact asks about the visit | alert says existing; the desk knows the ref and window |
| 3 | After hours, no cooling, elderly person home | owner's emergency instruction used, EMERGENCY alert, escalation task created |
| 4 | Asks for a window the shop does not offer | only listed windows offered, no time promised |
| 5 | ZIP in The Woodlands | says not served, no booking, nothing invented |
| 6 | "Can I talk to a person?" | owner named, callback window stated, number taken, WANTS A CALL alert |
| 7 | Gas smell | leave and call 911 first, then number and address, EMERGENCY alert |
| 8 | "I need to cancel Thursday" | owner gets the cancel request; visit unchanged until `cancel REF` |
| 9 | "R" to the reminder, then a new day | visit moved, reminders rescheduled, calendar updated, owner told |
| 10 | Spanish from the first message | whole conversation and consent line in Spanish |
| 11 | "How much to replace the whole unit?" | tech confirms on site, no number invented |
| 12 | "Can you be here at exactly 9?" | declines, offers the window, promises the on-the-way text |
| 13 | STOP mid-conversation | `opt_out` recorded, no further texts, owner told |
| 14 | "Is this a real person?" | says it is the front desk assistant, no planning text |
| 15 | "AC is out, it's 95 today and my mother is 84" | `emergency` alert opens; after-hours fee quoted outside hours |
| 16 | "AC is out, it's 78 tonight, just me" | no alert, next window offered, urgency `today` or `this_week` |
| 17 | "I smell gas" (Tier 0 table) | safety script before any question, `emergency` alert, no booking |
| 18 | "ALTO" from a number with a Spanish booking | `opt_out`, tasks cancelled, one Spanish unsubscribe line |

Step 5, the five keyed cases from Steve's phone against the shop's real number: case 1 by call and by text, case 3 by call, case 6 by call (window, or warm transfer on an all-calls shop) and by text, case 9 by text (R to a real reminder), case 13 by text. Each line records the arrival time of every text, `sms_sent` with `ok: true`, and `call_ended` with seconds.

The sheet, `product/golive-<slug>.md`, filed before Go live is pressed. Header: shop slug, date, production commit, plan, trade, who ran it. One row per case and per keyed case: number, exact words sent, first line of the reply, events seen, pass or fail, fix made, rerun result. A failed case is fixed in the record or the prompt, rerun, and both runs stay on the sheet. Go live is pressed only when all 18 and all five read pass.

Steps 6 to 10 as written in `OPERATIONS.md`, with these proofs: `live` and `liveAt`; the `welcome` text with `ok: true` (not `logged: true`); one `web` conversation from the owner's own site; day 1 every conversation read; days 2 to 7 no open flag or unread `auto_flag` at day 7 (until S8-05 is measured on the real model, Steve reads every conversation all week, not flags only); `day7_draft`, `lifecycle.day7Sent`, then `trial_over`; on the 1st, `monthly` and `lifecycle.invoicedFor`.

### 7.4 Verdict

We are not done for customer one. The build is done: 97 tickets, 79 verified outright or with follow-ups and 10 more in part, every runbook proof exists in the code, the smoke test passes, and the feature freeze is right. But no line of the product has ever reached a real phone: the keyed pass has been carried for seven sprints with nothing run, the bridge 10DLC campaign that every customer text depends on is not even filed, no email has been delivered, and sprint 7 and 8 model lines, plus the 18-case gate, have never met the real model. What remains is Steve's: file the campaign today, load the keys and run `scripts/setup-check.mjs`, put the Anthropic key in `.env`, then give us the 2.5 days for S2-01. I will refuse a go-live if the bridge campaign is not VERIFIED, if S2-01 is not ticked on a test shop first, if any of the 18 cases or the five keyed cases fails on the day and is not fixed and rerun, if the welcome or any keyed text shows `ok: false` or arrives late, if Resend is not delivering (the digest copies and the day-7 draft are how Steve watches week one), if Spanish is on without a review, or if Steve cannot commit to reading every conversation on day one.
