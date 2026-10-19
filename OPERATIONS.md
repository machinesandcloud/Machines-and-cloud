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
   - Owner commands by text: `otw REF`, `done REF`, `quote REF amount`, `paid REF`, `cancel REF`, `help`. `done` starts the review request (2 h), the nudge (50 h), payment reminders (day 3 and 7), and the referral ask (day 8). `quote` schedules the day-14 check.
   - Scheduler (`scheduler.mjs`, every 10 minutes): sends due tasks, skips closed records, Monday 8 am Houston digest to Pro owners.
6. **Billing**: `/api/billing` -> Stripe Checkout, subscription with a 7-day trial and card required; `/api/stripe-webhook` keeps `billing.status`. Cancel in Stripe pauses the front desk.

## Storage (Netlify Blobs, site-wide)

Stores: `clients` (slug -> record), `index` (`email:`, `number:` -> slug), `conversations` (`slug/channel/contact`), `bookings`, `leads`, `events` (`slug/id`), `tasks` (`dueISO_id`). Everything is JSON. There is no dashboard; use `/api/admin` or the Netlify Blobs UI.

## Environment variables (Netlify site settings)

| Variable | Needed for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | everything | set |
| `ADMIN_KEY` | `/api/admin` | any long random string; send as `x-admin-key` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | texts, calls | from the Twilio console |
| `MC_TWILIO_NUMBER` | texts to Steve and test texts before a client has a number | a Twilio number in E.164 |
| `STEVE_PHONE`, `STEVE_EMAIL` | alerts to Steve | E.164; email defaults to support@ |
| `RESEND_API_KEY`, `FROM_EMAIL` | owner emails (portal link, ready-to-test) | verify the sending domain in Resend |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | calendar connect | OAuth client, redirect URI `https://machinesandcloud.com/api/google/callback` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRO` | card on file | three recurring prices; webhook to `/api/stripe-webhook` for `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed` |

Without a key, the matching feature degrades: texts and emails are logged instead of sent, the portal buttons explain it is being switched on, bookings still land in the portal.

## Per-client steps that are still Steve's (a few minutes each)

1. Buy a local Twilio number, set its voice webhook to `https://machinesandcloud.com/api/voice` and messaging webhook to `https://machinesandcloud.com/api/sms` (POST), then attach it: `POST /api/admin {"slug":"...", "phone":{"twilioNumber":"+1713..."}}`.
2. File A2P 10DLC for the client's business in the Twilio console (brand + campaign "customer care"); mark it: `{"phone":{"tenDlc":"approved"}}`.
3. Walk the owner through conditional call forwarding on their carrier (missed or all calls) to the Twilio number.
4. Optional phone AI: create the agent on Retell or Vapi with the same rules, point it at the client's config, and set `phone.voiceForwardTo` to the SIP URI or number it gives you.

## Testing without real accounts

- Draft deploy: `netlify deploy --dir=. --functions=netlify/functions --json` (uses the site's env vars and the site-wide Blobs store).
- Onboard a test shop by POSTing to `/api/onboard`, poll `GET /api/onboard?c=&k=`, chat with `POST /api/chat {client, key, channel:"test", contact, messages}`, read `GET /api/client?c=&k=`.
- Simulate texts: `POST /api/sms` form-encoded `From`, `To`, `Body` (signature check is skipped when `TWILIO_AUTH_TOKEN` is unset).
- Delete the test shop: `POST /api/admin {"slug":"...","action":"delete"}`.
