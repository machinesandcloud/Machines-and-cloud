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
   - Owner commands by text: `ok REF`, `called REF`, `otw REF`, `done REF`, `invoice REF amount`, `quote REF amount`, `paid REF`, `cancel REF`, `help`. `called REF` logs that a promised callback happened; a promise the owner has not kept by its due time (`callbackDueAt`, from the callback wording and the shop's hours) texts the owner once as overdue and shows on the portal. `done` starts the review request (2 h), the nudge (50 h, skipped once the customer replies), and the referral ask (day 8, sent only after a positive reply to the review request; a negative reply stops the nudge and the ask and reaches the owner as NEEDS ACTION). `invoice REF amount` starts payment reminders on day 3 and 7; `paid REF` stops them. `quote` schedules the day-14 check. Every one of these follow-ups goes out inside 9 am to 9 pm Houston (noon to 9 pm Sunday); a due time in quiet hours moves to the next opening minute. Confirmations, reminders, on-the-way texts, text-backs, and live replies are not deferred.
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

Fallbacks and alerts: every number bought gets `VoiceFallbackUrl` and `SmsFallbackUrl` from `VOICE_FALLBACK_TWIML_URL` and `SMS_FALLBACK_TWIML_URL` (two static TwiML Bins Steve creates once in the Twilio console: voice says "We are having trouble connecting right now; please call back in a few minutes" and, where the owner's cell is not the forwarded line, dials it first; SMS replies "We got your text and will reply shortly"). A Vapi-answered number gets `VoiceFallbackUrl` set to our `/api/voice` after the import, so a Vapi outage degrades to the missed-call text-back. The scheduler texts and emails Steve, once per hour per shop, when three or more texts failed in an hour or any voice failure was logged in the last 15 minutes, and once per five days when a live shop with verified forwarding has had no inbound call or text for five business days (`health_alert` event with `reason`).

Steve's one-time setup: Twilio account (keys, Primary Customer Profile approved as ISV, and on the Machines & Cloud Messaging Service add ALTO and PARAR as custom opt-out keywords and EMPEZAR as a custom opt-in keyword under Opt-Out Management, so the carrier layer honors Spanish stop words the same way our webhook does), Vapi account (key), Resend (key + verified domain), Google OAuth client, optional Stripe. After that, nothing per client.

## Angi and Thumbtack leads

- Angi: set a key by admin (`{"slug":"...","leads":{"angiKey":"<random>"}}`). The owner (or Steve on the call) enters `https://machinesandcloud.com/api/angi?c=<slug>` as the CRM endpoint in Angi Leads with the key as `X-API-KEY`. Each post creates a lead with `source: "angi"`, alerts the owner ("Angi lead: ..."), texts the customer at once when a phone is present, and, on Growth and Pro, chases twice. Repeats of the same Angi lead id are ignored. The reply is `{"status":"success"}`.
- Thumbtack: set a secret by admin (`{"slug":"...","leads":{"thumbtackSecret":"<random>"}}`). In Thumbtack's integrations page the owner registers `https://machinesandcloud.com/api/thumbtack?c=<slug>` for new leads with basic auth (any user, the secret as the password) or a bearer token equal to the secret. Same behaviour with `source: "thumbtack"`. In-thread Thumbtack replies still need partner access, so the first reply goes by text to the customer's number.

## Testing without real accounts

- Draft deploy: `netlify deploy --dir=. --functions=netlify/functions --json` (uses the site's env vars and the site-wide Blobs store).
- Onboard a test shop by POSTing to `/api/onboard`, poll `GET /api/onboard?c=&k=`, chat with `POST /api/chat {client, key, channel:"test", contact, messages}`, read `GET /api/client?c=&k=`.
- Simulate texts: `POST /api/sms` form-encoded `From`, `To`, `Body` (signature check is skipped when `TWILIO_AUTH_TOKEN` is unset).
- Delete the test shop: `POST /api/admin {"slug":"...","action":"delete"}`.
- Voice without a Vapi key: set `{"slug":"...","voice":{"provider":"vapi","assistantId":"asst_test"}}` by admin, then simulate `assistant-request` and `end-of-call-report` with `POST /api/vapi {"message":{...}}` (the `x-admin-key` header stands in for the Vapi secret on a draft).
- Rate limit: 60 chat messages per IP per 10 minutes; `{"action":"ratelimit_reset","ip":"..."}` clears one IP.
- Number release: set `{"slug":"...","serviceEndsAt":"2026-01-01T00:00:00Z"}` by admin on a cancelled shop and run `{"action":"run_scheduler"}`.
- Weekly email: `{"slug":"...","action":"weekly"}` returns it (`"send": true` emails it); `{"action":"run_scheduler","force_hour":8,"force_day":"Mon"}` runs the Monday send. The prompt at a given clock: `{"slug":"...","action":"prompt","channel":"test","at":"2026-10-23T23:00:00Z"}`.

## First customer: go-live and the first week

Who does what, and the artifact that proves each step. Numbers in brackets refer to the test matrix in `product/SPRINT.md` section 5.4.

1. **Onboarding call (Steve with the owner, 30 minutes).** Fill the five onboarding steps together or review what the owner entered: hours, area, published prices, windows, handoff list, emergency instruction, backup phone, carrier. Proof: the client record (`GET /api/admin`), the portal What it knows tab with no line marked ASK OWNER.
2. **Legal details for texting (owner, on the call).** Legal business name, EIN, business type, address, into the portal Setup tab. Proof: `provision.steps.tenDlc` reads `brand submitted` (`GET /api/admin`), the `provisioned` event.
3. **Forwarding code dialed together (owner, on the call).** From the business cell: the carrier code from the portal (AT&T and T-Mobile with the 15-second ring timer; Verizon all calls on an LSA line); iPhone Live Voicemail off; `*#61#` to confirm. Then Steve calls the business number from another phone and does not answer. Proof: `missed_call` or `call_started` event, `phone.forwardingVerified` true, the text-back on Steve's phone.
4. **Test matrix on the test line (Steve, same day).** All 14 cases in `product/SPRINT.md` section 5.4 on the portal Test tab; record each pass in `product/golive-<slug>.md` (case, what was said, pass or fail, fix). Proof: the filed sheet; events `booking`, `lead`, `alert_opened` for the cases that need them.
5. **Keyed cases on real SMS and voice (Steve, same day).** Cases 1, 3, 6, 9, 13 from Steve's phone against the shop's real number. Proof: the five lines on the sheet with arrival times of every text; `sms_sent` with `ok: true`; `call_ended` with seconds.
6. **Go live (owner clicks Go live on the portal; Steve on the call).** Proof: `live` event, `liveAt` set, the embed snippet on the owner's website (open the site and send one chat message; proof is the `web` conversation on the portal).
7. **Day 1: Steve reads every conversation.** Conversations tab of the portal before 6 pm; anything wrong is flagged with a note (reaches Steve by email) and fixed in the record or the prompt. Proof: `flagged` and `unflagged` events, the config_updated event for each fix, Steve's digest copy at 6 pm.
8. **Days 2 to 7: daily read, flags cleared.** Same read each evening; every flag has a note and an outcome; the usage card is checked against the plan. Proof: no open flags on the portal at day 7, the seven digest emails in Steve's inbox.
9. **Day 7: "what I changed" email (Steve to the owner).** Template:

   Subject: Your first week with the front desk

   Hi {owner first name},

   One week in. Here is what your front desk handled and what I changed.

   Handled: {bookings} visits booked, {leads} leads handed to you, {emergencies} emergencies, {missed} calls answered that would have gone to voicemail.

   Changed: {one line per fix, for example "It now quotes the $89 service call before asking for a name" or "Added Fulshear to the service area"}.

   Still open: {anything the owner must answer, or "nothing"}.

   Your portal has every conversation. Flag anything that reads wrong and I see it the same day. Reply to this email any time.

   Steve

   Proof: the sent email in Steve's outbox; the owner's reply, if any, filed on the sheet.
10. **First-month invoice (Steve, day 30).** Billing is parked, so the first month is invoiced by hand from the usage card (plan price, plus overage only if the owner was told at 100 percent). Proof: the invoice and the usage record (`admin records kind=usage`).
