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
Status: verified 2026-10-21: locally `node scripts/smoke.mjs` passes in about 110 ms and `netlify.toml` runs it as the build command; an injected read-before-declaration in `run()` on a local copy made it exit 1 naming "ReferenceError: Cannot access 'tdzProbe' before initialization" (copy restored); on the local server at commit 00a1b0a, in-memory store a fresh store answered `/api/health` 503 with `lastRunAt` null and, right after `run_scheduler`, 200 with `minutesAgo` 0 and no failing blocks; OPERATIONS.md names the external monitor. The draft build log is a Netlify-side check for after the unfreeze.
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
Status: verified in part 2026-10-21: the second labelled set exists and `classifier_eval` accepts `"set": 2` (on the local server at commit 00a1b0a, in-memory store it answers cleanly with null precision without the model); the second measurement itself and the Needs-me exclusion decision wait for the local Anthropic key and are recorded in DECISIONS.md once run.
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
Status: verified with a note 2026-10-21 on the local server at commit 7caf297 (in-memory store, no Netlify calls). Size: M. Implements: Round 9 item 3 as built by the engineer (DECISIONS.md "round 9 item 3"); a change to hot paths, so every read path was exercised.

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
