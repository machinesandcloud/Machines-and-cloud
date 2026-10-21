# Operations: onboarding and delivery

How a shop goes from the pilot form to a live front desk, what runs where, and what Steve has to switch on once.

## The flow

1. **Pilot form** on the homepage posts to Netlify Forms (Steve gets the email) and sends the owner to `/onboard` with name, email, website, and phone prefilled. The plan buttons go straight to `/onboard?plan=...`.
2. **Onboarding** (`onboard.html` -> `POST /api/onboard`): five short steps (you, shop, prices and windows, rules, phone and leads). Creates the client record in Netlify Blobs with a private owner key, emails the owner their portal link, notifies Steve, and starts the build.
3. **Build** (`onboard-build-background.mjs`): crawls up to seven pages of the owner's site, asks Claude for a structured profile (hours, area, services, published prices, FAQ, what is missing), merges it under the owner's answers, sets status `testing`, emails the owner "ready to test".
4. **Portal** (`desk.html?c=slug&k=key`): test chat (real front desk, real tools), leads and bookings, conversations, every fact it knows (editable, saved to the record), setup checklist, embed snippet, card on file, calendar connect, test text, text-back commands. **Go live** switches status to `live`.
5. **Delivery**
   - Website chat: `embed.js` on the client's site -> `POST /api/chat` with `client`, `contact`, streaming. Origin must match the client's website domain (or `widget.allowedOrigins`).
   - Texts: Twilio number -> `POST /api/sms`. Owner's phone = commands; everyone else = customer conversation with the front desk.
   - Calls: Twilio number -> `POST /api/voice`. With a voice agent destination (`phone.voiceForwardTo`, a number or `sip:` URI for Retell or Vapi) the call is connected there; without one the caller hears a short message and gets a text within seconds (missed-call text-back). Owner is alerted either way.
   - Booking: the `book_visit` tool writes the booking, puts it on Google Calendar when connected, texts the customer a confirmation, texts the owner the summary with a ref, and schedules the day-before and hour-before reminders.
   - Leads and handoffs: `notify_owner` writes the lead, texts the owner, and (Growth and Pro) schedules the three quiet-lead chases over two days.
   - The morning after a visit's window (9 am Houston) a booking still marked booked, confirmed, or on the way gets one owner text: "Did the visit ... happen? Reply done REF or cancel REF" (`visit_check` task).
   - Owner commands by text: every alert names the one reply it needs (`otw REF` on a booking, `called REF` on a callback request, `ok REF` on everything else; the visit check asks for `done REF` or `cancel REF`); a bare `ok`, `called`, `otw`, or `done` applies when exactly one job fits and asks "Which one?" otherwise. Also `invoice REF amount`, `quote REF amount`, `paid REF`, `cancel REF`, `help`. `called REF` logs that a promised callback happened; a promise the owner has not kept by its due time (`callbackDueAt`, from the callback wording and the shop's hours) texts the owner once as overdue and shows on the portal. `done` starts the review request (2 h), the nudge (50 h, skipped once the customer replies), and the referral ask (day 8, sent only after a positive reply to the review request; a negative reply stops the nudge and the ask and reaches the owner as NEEDS ACTION). `invoice REF amount` starts payment reminders on day 3 and 7; `paid REF` stops them. `quote` schedules the day-14 check. Every one of these follow-ups goes out inside 9 am to 9 pm Houston (noon to 9 pm Sunday); a due time in quiet hours moves to the next opening minute. Confirmations, reminders, on-the-way texts, text-backs, and live replies are not deferred.
   - Scheduler (`scheduler.mjs`, every 10 minutes): sends due tasks, skips closed records, runs alert escalations, polls texting registration, releases the number of a cancelled shop once its 30-day window ends, and sends the 6 pm Houston digest to every live shop (email always; text only on a day with activity and only while the owner's "Daily digest by text" is on).
   - Escalation of an unacknowledged alert (`runEscalation`): a callback request goes owner text, backup text, then the customer is told the window. An emergency goes owner text, backup text, a plain phone call to the owner's cell (replaced by a second text when the cell is the forwarded line), then the customer is told the window and Steve is told.
   - Always-ring-through list (`rules.bypass`, up to 20 numbers): calls from those numbers ring the owner's cell for 25 seconds and then record a voicemail that is texted to the owner (`/api/voice/recorded`); on a one-phone shop the voicemail is taken straight away. Their texts are relayed to the owner and never answered.
   - Returning callers on voice: Vapi asks `/api/vapi` (`assistant-request`) on every call; the reply carries the assistant plus the caller's first name, whether they are an existing customer, and any upcoming visit, so the greeting uses them.
   - Weekly email (`weeklyReport`, Monday 8 am Houston, every live shop, email only): calls answered, conversations that could become a job (spam and VIP excluded), bookings by channel, missed-call-to-booking rate, leads still needing the owner, why customers did not book (`nobook_reason` on every lead), emergencies, callback promises kept and overdue, usage, flags and changes. Steve gets a copy for the first four weeks.
   - Emergencies follow a per-trade table (`rules.emergencies.tier0` life safety, `tier1` same day, `tier2` next window, plus the owner's safety script), prefilled at onboarding and edited on the portal. Business hours are structured per weekday (`rules.hours`), parsed from the owner's hours sentence; without them the front desk assumes 7 am to 7 pm.
   - Spanish: customer texts (confirmation, reminders, on-the-way, review request, nudge, quote check, lead chase, callback window, cancellation, consent line) have fixed Spanish versions used when the booking or lead was in Spanish; the website greeting is bilingual and the voice greeting offers Spanish on Spanish-enabled shops.
   - Usage meter (`lib/usage.mjs`): call minutes (rounded up per call) and customer-facing texts per Houston month; the owner gets one text and one email at 80 and at 100 percent of the plan. Nothing pauses and nothing is billed.
   - CSV export: the portal's Your data card downloads bookings, leads, conversations, and a customers file in Jobber's import headers (`GET /api/client?c&k&export=...`).
6. **Billing** (parked for now): `/api/billing` and `/api/stripe-webhook` exist but the portal does not show them until Stripe keys are set.

## Storage (Netlify Blobs, site-wide)

Stores: `clients` (slug -> record), `index` (`email:`, `number:` -> slug), `conversations` (`slug/channel/contact`), `bookings`, `leads`, `events` (`slug/id`), `tasks` (`dueISO_id`). Everything is JSON. There is no dashboard; use `/api/admin` or the Netlify Blobs UI.

## Environment variables (Netlify site settings)

| Variable | Needed for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | everything | set |
| `ADMIN_KEY` | `/api/admin` | any long random string; send as `x-admin-key` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | texts, calls, buying numbers | from the Twilio console |
| `TWILIO_PRIMARY_PROFILE_SID` | 10DLC filing | BU... SID of the approved Primary Customer Profile |
| `TWILIO_NOTIFY_EMAIL` | 10DLC status emails from Twilio | defaults to STEVE_EMAIL |
| `VAPI_API_KEY`, `VAPI_MODEL`, `VAPI_VOICE_PROVIDER`, `VAPI_VOICE_ID`, `VAPI_WEBHOOK_SECRET` | phone answering | model defaults to claude-sonnet-5; voice optional (Vapi default); set the secret on the Vapi org and we check `x-vapi-secret` |
| `MC_TWILIO_NUMBER`, `MC_MESSAGING_SERVICE_SID` | the registered bridge sender: every client's texts go out from it (with the shop's name prefixed) until the client's own 10DLC campaign is approved; also texts to Steve | one-time: buy the number, register Machines & Cloud's own brand and campaign, attach the number to a Messaging Service, paste its SID |
| `STEVE_PHONE`, `STEVE_EMAIL` | alerts to Steve | E.164; email defaults to support@ |
| `RESEND_API_KEY`, `FROM_EMAIL` | owner emails (portal link, ready-to-test) | verify the sending domain in Resend |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | calendar connect | OAuth client, redirect URI `https://machinesandcloud.com/api/google/callback` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRO` | card on file | three recurring prices; webhook to `/api/stripe-webhook` for `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed` |

Without a key, the matching feature degrades: texts and emails are logged instead of sent, the portal buttons explain it is being switched on, bookings still land in the portal.

## Provisioning (automatic, after the build)

`provision-background.mjs` runs as soon as the build finishes and again whenever the owner saves registration details (portal action `provision`):

1. **Number.** Buys a local Twilio number in the shop's area code (falls back to 713/281/832/346), points voice to `/api/voice` and messaging to `/api/sms`, indexes it to the client.
2. **Messaging Service** with the number attached (needed for 10DLC).
3. **10DLC registration** through Twilio's API: Secondary Customer Profile (legal name, EIN, address, owner as authorized representative) -> A2P Trust Product -> Brand. The scheduler polls the brand every 10 minutes; when approved it files the campaign (MIXED use case: customer care, reminders, follow-ups) and polls again; when verified it marks `phone.tenDlc = approved` and tells the owner texting is live. Needs the owner's legal name, EIN, and address (asked in onboarding step 5 and on the portal) and `TWILIO_PRIMARY_PROFILE_SID` (Machines & Cloud's own approved Primary Customer Profile, a one-time console setup under Trust Hub with business type "ISV Reseller or Partner").
4. **Phone answering** through Vapi: two function tools pointing at `/api/vapi`, an assistant with the client's prompt (voice variant) and `claude-sonnet-5` (override with `VAPI_MODEL`), the Twilio number imported into Vapi with `smsEnabled: false` so our SMS webhook stays. Vapi then answers forwarded calls; `/api/vapi` runs `book_visit` and `notify_owner` during the call and files the transcript on `end-of-call-report`. Without `VAPI_API_KEY`, forwarded calls get the missed-call text-back instead.
5. **Owner instructions.** Text and email with the number and the exact forwarding code for their carrier (AT&T, Verizon, T-Mobile, VoIP, other), also shown as tap-to-dial buttons on the portal. The first forwarded call that reaches `/api/voice` marks forwarding verified. (Vapi-answered calls do not pass through `/api/voice`; the owner can press "I did this".)

Every step that lacks a key records `waiting: ...` in `provision.steps` and Steve gets one email listing what is missing. Nothing blocks the website chat or the portal.

Fallbacks and alerts: every number bought gets `VoiceFallbackUrl` and `SmsFallbackUrl` from `VOICE_FALLBACK_TWIML_URL` and `SMS_FALLBACK_TWIML_URL` (two TwiML Bins Steve creates once in the Twilio console). The voice bin is a Mustache template, exactly:
`<Response>{{#cell}}<Dial timeout="25">{{cell}}</Dial>{{/cell}}<Say voice="Polly.Joanna">We are having trouble connecting right now. Please call back in a few minutes.</Say></Response>`
Provisioning appends `?cell=%2B1...` for a shop whose owner cell is not the forwarded line and leaves the bare URL for a one-phone shop; the URL is re-set when the owner changes the cell, business number, or forwarding mode on the portal (`syncVoiceFallback`), on pause (the bin with the cell) and resume (`/api/voice` on a Vapi line). The SMS bin is `<Response><Message>We got your text and will reply shortly.</Message></Response>`. Twilio Debugger webhook: in the console under Monitor, Alerts, set the webhook to `https://machinesandcloud.com/api/twilio-alert` and turn on email alerts; each failure Twilio sees (11200 could not reach the webhook, 11205 timeout, 30034 unregistered sender) is logged as `twilio_error` on the shop whose number appears in the request and counts toward the alerts below. Vapi calls that end with a platform error (`assistant-request-returned-error`, `pipeline-error-*`, `*-llm-failed`, and the other failure families) log `voice_failed` from the end-of-call report. A Vapi-answered number gets `VoiceFallbackUrl` set to our `/api/voice` after the import, so a Vapi outage degrades to the missed-call text-back. The scheduler texts and emails Steve, once per hour per shop, when three or more texts failed in an hour or any voice failure was logged in the last 15 minutes, and once per five days when a live shop with verified forwarding has had no inbound call or text for five business days (`health_alert` event with `reason`).

## Deploys

Netlify builds `main` on every push and runs `scripts/smoke.mjs` first; a throw fails the deploy and the previous build stays live. If the Netlify dashboard shows "Skipped due to account credit usage exceeded" (seen 2026-10-20), no production deploy of any kind goes out until the team's credits are restored under Billing; draft deploys (`netlify deploy --dir=. --functions=netlify/functions`) keep working for verification. Check what is live with `netlify api getSite --data '{"site_id":"f87916f1-bcc4-4171-a96f-2900cbf0b6dc"}'` (`published_deploy.commit_ref`).

## The critical path to customer one (dated, longest lead time first)

| Step | Who | Lead time | Proof |
|---|---|---|---|
| 1. File Machines & Cloud's own 10DLC brand and campaign for the bridge sender (`MC_MESSAGING_SERVICE_SID`, `MC_TWILIO_NUMBER`). Until carriers verify it, no customer text can go out from any shop, whatever the shop's own filing says. | Steve, Twilio console (Trust Hub: Primary Customer Profile as ISV, Brand, Campaign on the Messaging Service) | 1 to 2 weeks typical, up to 6 | `DECISIONS.md` line with the submission date and the date the campaign read VERIFIED |
| 2. Twilio keys, `TWILIO_PRIMARY_PROFILE_SID`, the two TwiML Bins, the Debugger webhook with email alerts, ALTO and PARAR (and EMPEZAR) on the Messaging Service | Steve, console and Netlify env | 2 hours | `.env.example` names filled in Netlify; a test number bought by provisioning shows the fallback URLs |
| 3. Vapi key and `VAPI_WEBHOOK_SECRET`; Resend key with the verified domain; Google OAuth client | Steve | 1 hour | the keyed pass (sprint tickets S2-01, S3-04, S4-04, S5-04, S6-04) |
| 4. The keyed pass on a test shop with Steve's own entity | engineer and PM | 2.5 days reserved | the sprint 2 S2-01 lines ticked |
| 5. Spanish texts reviewed by a Spanish speaker Steve names; `SPANISH_REVIEWED_ON` set | reviewer | 1 hour of reading | the date in Netlify and in `DECISIONS.md` |
| 6. Jobber trial import of the customers file | Steve | 30 minutes | one line in `DECISIONS.md` |
| 7. The first customer's own go-live, by the runbook below | Steve with the owner | the day it starts, then 7 days of reading flags | `product/golive-<slug>.md` |

Step 1 is the long pole; file it today and the rest fits inside its wait. Each step's date goes in `DECISIONS.md` when it happens.

Steve's one-time setup: Twilio account (keys, Primary Customer Profile approved as ISV, and on the Machines & Cloud Messaging Service add ALTO and PARAR as custom opt-out keywords and EMPEZAR as a custom opt-in keyword under Opt-Out Management, so the carrier layer honors Spanish stop words the same way our webhook does), Vapi account (key), Resend (key + verified domain), Google OAuth client, optional Stripe. After that, nothing per client.

## Lifecycle messages and the nightly check

Each is sent once per shop (stamped on the client record): day 8 after go-live, "your free week is over" by email; three days in testing with no go-live, a text and email asking the owner to test and press Go live; a number assigned for two business days with no verified forwarding, a text with the code and the Live Voicemail reminder; a failed carrier registration, a text and email naming the legal name, EIN, and address fields to fix; day 7 after go-live, Steve gets the drafted "what I changed" email to edit and send (the runbook's step 9). At 9 pm Houston the day's conversations on every live shop go through a fixed rubric (price not listed, exact time promised, Tier 0 missed, no callback window, Spanish mishandled, no address, question unanswered); hits are `auto_flag` events, listed on the admin page and in Steve's digest copy, so after week one Steve reads flags, not everything.

## The scheduler, the smoke test, and the health check

`scheduler.mjs` runs every 10 minutes as recorded blocks (tasks, 10DLC polling, health alerts and lifecycle, number release); the record is `health/scheduler:lastRun` (`admin {"action":"last_run"}`). The four shop-wide sends (6 pm digest, 9 pm audit, Monday email, 1st-of-month statement) are claimed once per Houston day and handed to `scheduler-fanout-background.mjs`, so they have no synchronous time limit and one shop's failure never stops the rest (`health/fanout:<kind>:last` holds each run's count and errors; `admin {"action":"fanout","kind":"digest"}` runs one inline). Every deploy runs `scripts/smoke.mjs` as the build command: it imports every module, seeds a shop in an in-memory store, runs the scheduler at every gate, and calls the handlers; a throw fails the deploy. `/api/health` returns 200 when the last run is under 25 minutes old with every block ok and 503 otherwise. Steve's one-time step: point a free external uptime monitor (UptimeRobot or similar, 10-minute interval) at `https://machinesandcloud.com/api/health` with email alerts.

## Steve's admin page

`admin.html` (noindex) takes the admin key once (kept in the browser's sessionStorage, never in the page) and lists every shop with status, plan, live since, texting registration and sender, this month's usage, errors in 24 hours, last inbound, open flags, waiting alerts, and pending or overdue callbacks, with per-shop buttons: Portal (opens as the owner), Policy, Pause or Resume, Digest, Weekly, Monthly (shown, or sent on confirm), Angi and Thumbtack keys, Clear opt-out, Delete. Below the table: the last 24 hours of events across every shop. Everything it does is also `curl` against `/api/admin` with `x-admin-key`.

The monthly statement goes to every live shop on the 1st at 9 am Houston (email only); Steve's copy ends with "Invoice: $<plan> plus $<overage> overage" for the hand invoice. `{"slug":"...","action":"monthly","month":"2026-10"}` returns it; `"send": true` sends it; `{"slug":"...","nextMonthNote":"..."}` sets the "Next month" line.

## Angi and Thumbtack leads

- Angi: set a key by admin (`{"slug":"...","leads":{"angiKey":"<random>"}}`). The owner (or Steve on the call) enters `https://machinesandcloud.com/api/angi?c=<slug>` as the CRM endpoint in Angi Leads with the key as `X-API-KEY`. Each post creates a lead with `source: "angi"`, alerts the owner ("Angi lead: ..."), texts the customer at once when a phone is present, and, on Growth and Pro, chases twice. Repeats of the same Angi lead id are ignored. The reply is `{"status":"success"}`.
- Thumbtack: set a secret by admin (`{"slug":"...","leads":{"thumbtackSecret":"<random>"}}`). In Thumbtack's integrations page the owner registers `https://machinesandcloud.com/api/thumbtack?c=<slug>` for new leads with basic auth (any user, the secret as the password) or a bearer token equal to the secret. Same behaviour with `source: "thumbtack"`. In-thread Thumbtack replies still need partner access, so the first reply goes by text to the customer's number.

## Serving the pages from another host (groundwork for a pause-proof site)

Every page carries `<meta name="mc-api-base" content="">` and the widget, portal, onboarding, and admin scripts read it: empty means same origin (today), a value such as `https://api.machinesandcloud.com` points every API call at Netlify while the HTML, CSS, and scripts live on a static host a Netlify pause cannot reach. `embed.js` on a customer's site takes `data-api` for the same purpose. On the Netlify side, `SITE_ORIGINS` (comma-separated) adds the static host's origin to the chat and onboarding allow-lists, and the client and onboarding functions answer with CORS headers. The host, the DNS move, and the www-versus-apex choice are Steve's decisions (BACKLOG.md Round 9 item 2); nothing changes until the meta tag is filled.

## Netlify credits: what costs what, and the brake

Netlify meters compute (10 credits per GB-hour), requests (2 per 10,000), bandwidth (20 per GB), and production deploys (15 each); storage operations are not metered, and model calls bill at Anthropic. The PO's estimate (BACKLOG.md Round 9): about 120 credits a month at zero shops, 160 at one, 580 at ten, out of 3,000. What spent 3,000 in a day on 2026-10-20 was about forty production and draft deploys and test harnesses holding functions open; both are gone with the local server. Steve's account steps, once: turn on auto recharge (Team Owner only; 1,500 credits for $10 when the allotment runs out), and route Netlify's 50, 75, and 100 percent emails to an inbox that is read. Our own brake, because Netlify pauses the whole site at 100 percent: the admin page's Brake button (or `admin {"action":"brake","on":true}`) stops the nightly audit and the half-hour scans; due customer texts, webhooks, reminders, and the digest never stop. The uptime monitor polls every 10 minutes. The public widget config (`GET /api/client?c=`) is cached 60 seconds at the CDN so a busy shop site does not invoke a function per page view.

## Testing without spending Netlify credits

Every draft deploy, function call, and storage operation on Netlify costs credits, and a day of test loops exhausted the plan on 2026-10-20. The rule since then: verification runs locally and nothing goes to Netlify except one git push per verified sprint.

- `node scripts/local-server.mjs` serves the site and every function at `http://localhost:8888` from the same modules production runs, against an in-memory store (`MC_MEMORY_STORE=1`); admin key `local-admin`; `MC_MEMORY_FILE=.local-store.json` keeps the store across restarts. Model calls need `ANTHROPIC_API_KEY=` in a gitignored `.env` at the repo root (the site's key lives at the Netlify team level and is not readable from the CLI); without it chat and the two classifiers fail cleanly and everything else works.
- Without a key the local server runs the deterministic fake model (`lib/fake-model.mjs`, `MC_FAKE_MODEL=1`): rule-based replies that call the same tools (book, notify, emergency, callback, spam), a keyword review-reply classifier, a keyword rubric, and a stub website profile, so every flow including the SMS background agent and the nightly audit can be verified with no Anthropic spend. It is test-only and never set in production; lines about the real model's wording wait for the key.
- Every check script that took a draft URL takes `http://localhost:8888` instead; the background functions are routed too (`/.netlify/functions/<name>`).
- `node scripts/smoke.mjs` is the deploy gate and runs locally in under a second.
- Draft deploys (`netlify deploy --dir=.`) are for one final look per sprint at most, and never for loops. The two-model classifier evaluation is run locally, never through Netlify.
- Production: every `git push` is a build and a build is 15 credits, so commits are batched and pushed once per verified batch (at most once a day), never per commit; the scheduler runs every 10 minutes and does its per-shop scans only at :00 and :30 to keep storage reads down; the uptime monitor polls `/api/health` every 10 minutes.

## Testing without real accounts

- Draft deploy: `netlify deploy --dir=. --functions=netlify/functions --json` (uses the site's env vars and the site-wide Blobs store).
- Onboard a test shop by POSTing to `/api/onboard`, poll `GET /api/onboard?c=&k=`, chat with `POST /api/chat {client, key, channel:"test", contact, messages}`, read `GET /api/client?c=&k=`.
- Simulate texts: `POST /api/sms` form-encoded `From`, `To`, `Body` (signature check is skipped when `TWILIO_AUTH_TOKEN` is unset).
- Delete the test shop: `POST /api/admin {"slug":"...","action":"delete"}`.
- Voice without a Vapi key: set `{"slug":"...","voice":{"provider":"vapi","assistantId":"asst_test"}}` by admin, then simulate `assistant-request` and `end-of-call-report` with `POST /api/vapi {"message":{...}}` (the `x-admin-key` header stands in for the Vapi secret on a draft).
- Rate limit: 60 chat messages per IP per 10 minutes; `{"action":"ratelimit_reset","ip":"..."}` clears one IP.
- Number release: set `{"slug":"...","serviceEndsAt":"2026-01-01T00:00:00Z"}` by admin on a cancelled shop and run `{"action":"run_scheduler"}`.
- Weekly email: `{"slug":"...","action":"weekly"}` returns it (`"send": true` emails it); `{"action":"run_scheduler","force_hour":8,"force_day":"Mon"}` runs the Monday send; `"all": true` runs the half-hourly scans on any minute. The prompt at a given clock: `{"slug":"...","action":"prompt","channel":"test","at":"2026-10-23T23:00:00Z"}`.

## First customer: go-live and the first week

Who does what, and the artifact that proves each step. The 18-case gate is the 14-case matrix in `product/SPRINT.md` section 5.4 plus the three emergency-table cases from `product/SPRINT3.md` S3-05 (95°F with an elderly person, 78°F alone, gas smell) and the ALTO opt-out case from `product/SPRINT4.md` S4-06.

1. **Onboarding call (Steve with the owner, 30 minutes).** Review what the owner entered and fill the rest together on the portal: hours rows (What it knows, Hours; the front desk assumes 7 am to 7 pm until they are set), the emergency table for the trade (tier 0 and tier 1 lists, the safety script), published prices and windows, handoff list, the Google review link (without it a Growth or Pro shop sends no review request), the always-ring-through list, Spanish on or off, backup phone and carrier, the consent switch (off until Steve approves the sentence), and, when the shop pays for Angi or Thumbtack leads, the platform key or secret set from the admin page and pasted into the platform. Proof: the client record on the admin page, no line marked ASK OWNER under What it knows, `config_updated` events; press "Called" on the admin page's Needs-me line (`lifecycle.onboardingCallAt`).
2. **Legal details for texting (owner, on the call).** Legal business name, EIN, business type, address as on the IRS letter, into the portal Setup tab. Proof: `provision.steps.tenDlc` reads `brand submitted`, the `provisioned` event.
3. **Forwarding code dialed together (owner, on the call).** From the business cell: the carrier code from the portal (AT&T and T-Mobile with the 15-second ring timer; Verizon all calls on an LSA line); iPhone Live Voicemail off; `*#61#` to confirm. Then Steve calls the business number from another phone and does not answer. Proof: `missed_call` or `call_started` event, `phone.forwardingVerified` true, the text-back on Steve's phone.
4. **The 18-case gate on the test line (Steve, same day).** All 18 cases on the portal Test tab; record each pass in `product/golive-<slug>.md` (case, what was said, pass or fail, fix). Proof: the filed sheet; events `booking`, `lead`, `alert_opened`, `opt_out` for the cases that need them.
5. **Keyed cases on real SMS and voice (Steve, same day).** Cases 1, 3, 6, 9, 13 from Steve's phone against the shop's real number. Proof: the five lines on the sheet with arrival times of every text; `sms_sent` with `ok: true`; `call_ended` with seconds.
6. **Go live (owner clicks Go live on the portal; Steve on the call).** Proof: `live` event, `liveAt` set, the owner's `welcome` text (`sms_sent` with `type: "welcome"`), the embed snippet on the owner's website (open the site and send one chat message; proof is the `web` conversation on the portal).
7. **Day 1: Steve reads every conversation.** Conversations tab of the portal before 6 pm; anything wrong is flagged with a note and fixed in the record or the prompt. Proof: `flagged` and `unflagged` events, the `config_updated` event for each fix, Steve's digest copy at 6 pm.
8. **Days 2 to 7: Steve clears flags and auto-flags, not everything.** The nightly check (9 pm, `auto_flag` events) and the owner's own flags show on the admin Needs-me list and in Steve's digest copy; every one gets a note and an outcome; the usage card is checked against the plan. Proof: no open flag or unread auto-flag on the admin page at day 7, the digest copies in Steve's inbox.
9. **Day 7: "what I changed" email (Steve to the owner).** The draft arrives in Steve's inbox on day 7 (`day7_draft` event, or `admin {"action":"day7"}`), already filled with the week's numbers, the edits, and the nightly check's hits; Steve edits the Changed and Still open lines, sends it, and presses "Sent" on the admin page (`lifecycle.day7Sent`), which releases the day-8 "your free week is over" email. Proof: the `day7_draft` event, the stamp, the `trial_over` event the next day.
10. **The 1st: statement and invoice (Steve).** The statement goes to the owner at 9 am (`monthly` event); Steve's copy ends with the invoice line (plan price plus overage from the usage record). Billing is parked, so Steve invoices by hand and presses "Invoiced" on the admin page (`lifecycle.invoicedFor`). Proof: the invoice and the stamp.

