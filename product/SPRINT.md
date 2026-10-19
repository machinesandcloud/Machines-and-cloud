# Sprint 1: launch-ready front desk

Owner: Product Manager. Cut from `BACKLOG.md` round 1 (2026-10-19). Engineer builds in the order below and marks each ticket `delivered` with a verification note; the PM runs the acceptance checklist and records `verified` or `returned` with the failing line. Trade-offs go to `DECISIONS.md`.

Status legend per ticket: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` (every launch-relevant criterion passed; the named leftover lines are tracked in a follow-up ticket) | `returned` (a criterion that matters failed; the line and what was seen are on the status line).

Engineer notes (2026-10-19), read before verifying:
- Model-driven SMS replies no longer come back in the webhook's TwiML. Twilio allows a webhook 15 seconds and a thoughtful reply can take 20, so `sms.mjs` answers Twilio with an empty `<Response/>`, saves the inbound turn, and starts `sms-agent-background`, which runs the model and sends the reply through `sendSMS` (type `reply`). Verify model replies through `admin records kind=conversations` (the assistant turn appears within about 30 seconds) and the `sms_sent` event with `type: "reply"`. Fast paths still reply inline in TwiML: owner commands, STOP, START, paused notice, and `C` or `R` when exactly one visit is upcoming.
- Blobs turns `+` in a key into a space, so `store.mjs` encodes `+` as `~` in every key and decodes on list. Opt-out records list with `phone: "+1..."`.
- Opt-outs are keyed by phone across shops (shared bridge sender); `optouts` keys have no slug prefix but carry `slug` inside.
- `go_live` and `resume` are the same action and always return to `live`.
- The customer's number on SMS is always the texting number: the tools receive `e164(input.phone) || from`.
- Spam leads get no owner text and status `spam`; the digest counts them.

## 1. Sprint goal

Make the first paying shop safe to put on the line without Steve babysitting it: texting that is legal and actually sends, STOP that sticks, a person one step away with escalation, a Pause and a Cancel that really stop the line, alerts and a daily digest the owner can judge the desk by, and site, onboarding, and portal copy that promises only what is delivered.

Launch conditions this sprint closes (from BACKLOG.md section 1):

| Condition | Closed by |
|---|---|
| L1 forwarded call reaches the desk, voice books or text-back in 15 s | S1-04, S1-12, S1-17, S1-18, S1-19 (keyed pass) |
| L2 book by SMS, every scheduled text lands | S1-04, S1-11, S1-19 (keyed pass) |
| L3 texting legal on day one, no 30034 | S1-03, S1-04, S1-19 |
| L4 STOP ends every message including scheduled ones | S1-05 |
| L5 ask for a person, get one or a callback time; alert escalates when ignored | S1-07, S1-08, S1-09, S1-10, S1-18 |
| L6 Pause stops the desk and the line falls back to the owner's phone with the cancel code | S1-02, S1-15, S1-17 |
| L7 every timeline promise on site, onboarding, and portal is true | S1-06, S1-11, S1-16 |
| L8 Steve reads every conversation, one digest a day for a week, owner can flag | S1-13, S1-14 |

Sizes: S is up to half a day, M up to a day and a half, L up to three days. Nothing is bigger than L. Build order is priority order; if the sprint runs out, the cut line is after S1-16 (S1-17 to S1-19 need Steve's accounts and can slide into the keyed pass without blocking the rest).

Sprint rules for the engineer:
- Every ticket that adds a Blobs store kind or an `index` key prefix also extends `admin.mjs` `delete` to remove it (the PM checks this at cleanup). Exception: `optouts` are legal records keyed by phone number and are never deleted by `delete`; the PM clears its fake test numbers with `admin clear_optout`.
- Work already on disk when this sprint was written (2026-10-19 afternoon: pause, resume, cancel, policy page, campaign URLs, sender selection, STOP) is folded into S1-02, S1-03, S1-04, S1-05, and S1-15 as "Already on disk" plus the remaining delta; those tickets start as `in progress`.
- Every outbound text goes through `sendSMS` with the `client` argument (S1-04); no new bare `From` sends.
- Copy rules from CLAUDE.md apply to every new string: no em dashes, no prototype words, no "we are new" language, prices only in the homepage plans section.
- `node --check` on every touched `.mjs` and `python3 -I scripts/sitecheck.py .` before marking delivered.

## 2. Tickets

### S1-01 Admin verification hooks
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56.
Size and scope: Size: S. Implements: nothing customer-facing; makes every other ticket verifiable from curl.

Files: `netlify/functions/admin.mjs`, `netlify/functions/sms.mjs`, `netlify/functions/voice.mjs`, `netlify/functions/scheduler.mjs`.

Change:
- `POST /api/admin` gains actions, all requiring `x-admin-key` and a `slug`:
  - `prompt` with `channel` (`web`, `sms`, `voice`, `test`): returns `{ prompt }` from `buildSystemPrompt` (for `voice`, `voicePrompt` from `lib/vapi.mjs`).
  - `tasks`: returns `{ tasks: [{ key, type, dueAt, data }] }` for that slug, sorted by key.
  - `run_scheduler`: runs the scheduler's default export once and returns its JSON (so the PM does not wait for the 10-minute cron, and so scheduler changes on a draft deploy are testable at all: the production cron never runs draft code).
  - `records` with `kind` (`bookings`, `leads`, `alerts`, `optouts`, `conversations`, `events`): returns the full records (the owner GET trims conversations to 12 messages; the PM needs all of it).
- `sms.mjs` and `voice.mjs`: when the request carries a valid `x-admin-key` header, skip the Twilio signature check. (Once `TWILIO_AUTH_TOKEN` is set, simulated webhooks would otherwise 403.)
- `scheduler.mjs`: export the handler so `admin.mjs` can import it (`export default` stays; add `export const run = handler`).

Acceptance (now, no keys):
- [ ] `curl -s -X POST $D/api/admin -H "x-admin-key: $K" -H 'Content-Type: application/json' -d '{"slug":"'$S'","action":"prompt","channel":"sms"}'` returns 200 with `prompt` containing "You are texting".
- [ ] `...-d '{"slug":"'$S'","action":"tasks"}'` returns `{"tasks":[]}` for a fresh shop.
- [ ] `...-d '{"slug":"'$S'","action":"run_scheduler"}'` returns `{"due":N,"results":[...]}`.
- [ ] `curl -s -X POST $D/api/sms -H "x-admin-key: $K" --data-urlencode From=+17135550123 --data-urlencode To=$TW --data-urlencode Body=hi` returns `<Response>` XML, not 403, with `TWILIO_AUTH_TOKEN` either set or unset.
- [ ] A wrong admin key on any of the above returns 403.

### S1-02 Pause that actually stops the desk (status model)
Status: verified with follow-up 2026-10-19 6ad677072d68cf5cf1481d56. Open line: the portal does not render the off codes as tap-to-dial buttons while paused (tracked in S1-22); the codes reach the owner by text, by email, and in the `pause` response (`off`).
Size and scope: Size: M. Implements: Epic 4 MUST "Pause actually stops the front desk". Closes L6 (with S1-15, S1-17).

Already on disk (2026-10-19, unverified): `client.mjs` actions `pause` (stores `pausedFrom`), `resume`, `cancel`; `sms.mjs` stays silent on `paused`; `voice.mjs` pass-through `<Dial timeout="30">` to `businessNumber || owner.phone` logging `call_passthrough`; `chat.mjs` returns 403 `{"error":"paused"}`; `desk.html` shows Pause, Resume, Cancel service and the paused status text.

Files: `netlify/functions/client.mjs`, `netlify/functions/voice.mjs`, `netlify/functions/scheduler.mjs`, `netlify/functions/lib/config.mjs`, `desk.html`, `embed.js`.

Remaining change:
- Loop fix in `voice.mjs` pass-through: never `<Dial>` the forwarded line. The dial target is `owner.phone` only when it differs from `phone.businessNumber` (the business line is, by definition, the line forwarding to us; dialing it comes straight back). Otherwise `<Say>` "Thanks for calling `{name}`. Nobody is available on this line right now. Please call back during business hours." and `<Hangup/>`. Add a guard at the top of the handler: a call whose `From` equals the shop's own `twilioNumber` or `MC_TWILIO_NUMBER` returns `<Hangup/>` with no events (our own leg bouncing back through the owner's forwarding; S1-10's escalation call needs the same guard).
- `pause` texts the owner (via `sendSMS` with `client`, `force: true`) and emails: "`{name}`: your front desk is paused. Calls to `{twilioNumber}` ring your cell, texts and website chat are off. To stop forwarding entirely, dial `{forwardingInstructions(c).off joined with ' or '}` from your cell. Resume from your portal any time." Event `paused` already exists.
- `config.mjs` exports `ACTIVE = ["testing", "live"]`; replace the four inline `["testing","live"].includes(c.status)` checks (`sms.mjs`, `voice.mjs`, `chat.mjs`, `scheduler.mjs`) with it. `scheduler.mjs` `runTask` logs `task_skipped` `{ type, reason: c.status }` when it skips a paused or cancelled shop.
- `publicView` adds `businessNumber`; `embed.js` on `status` `paused` or `cancelled` renders "We are not taking chats right now. Please call `{businessNumber}`." and disables the input instead of the generic error.
- `desk.html`: while paused, show the off codes as tap-to-dial buttons under the Resume button (the `forwarding.off` array is already in the GET payload).

Acceptance (now):
- [ ] `go_live` then `pause` returns `{"ok":true,"status":"paused"}`; GET shows `client.status` `paused`, `pausedFrom` `live`, an event `paused`, and an owner `sms_sent` event (S1-04) whose preview contains the carrier off code (`*73` for Verizon, `#61#` for AT&T).
- [ ] Simulated customer text while paused returns an empty `<Response/>`; no `sms_reply` event; `admin tasks` unchanged.
- [ ] Simulated call while paused with `owner.phone` different from `businessNumber`: TwiML contains `<Dial` with the owner's number and the `<Say>` after it; with `owner.phone` equal to `businessNumber`: no `<Dial`, only the `<Say>` and `<Hangup/>`. Event `call_passthrough`, no `missed_call`, no text-back `sms_sent`.
- [ ] `POST /api/voice` with `From` equal to the shop's `twilioNumber` returns `<Response><Hangup/></Response>` and writes no event.
- [ ] A reminder task due in the past (book for tomorrow, then nudge the task; the engineer provides `admin` `nudge_task` `{ key, dueAt }`) run through `admin run_scheduler` while paused returns `["reminder_24h","skipped"]` and a `task_skipped` event.
- [ ] `POST /api/chat` without key returns 403 `{"error":"paused"}`; `GET /api/client?c=$S` (no key) includes `status: "paused"` and `businessNumber`; the embed on a page with `data-client=$S` shows the "not taking chats" line.
- [ ] `resume` returns `status` `live`; the simulated text gets a model reply again; the portal shows the Pause button.

### S1-03 Per-client policy and terms page, filed on the campaign
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56.
Size and scope: Size: S (was M). Implements: Epic 1 MUST "add PrivacyPolicyUrl and TermsAndConditionsUrl"; Epic 4 MUST data policy paragraph (constant lives here). Closes part of L3.

Already on disk: `netlify/functions/policy.mjs` at `/policy?c=slug` renders one page with `#terms` and `#privacy` anchors (program, opt-in, frequency, STOP, HELP, rates, privacy bullets, Machines & Cloud address); `lib/twilio.mjs` `createCampaign` sends `PrivacyPolicyUrl` `.../policy?c=slug#privacy` and `TermsAndConditionsUrl` `.../policy?c=slug#terms` built from `process.env.URL`.

Files: `netlify/functions/policy.mjs`, `netlify/functions/lib/twilio.mjs`, `netlify/functions/lib/config.mjs`.

Remaining change:
- `lib/config.mjs` exports `DATA_POLICY` (owner-facing, used by S1-16 on the site FAQ and the portal): "Your customers' names, numbers, and conversations belong to your shop. Machines & Cloud uses them only to run your front desk, never to train or inform another shop's desk, and never sells or shares them. You can ask for an export at any time, and everything is deleted on request after you cancel."
- `createCampaign`: add `OptInMessage` "`{name}`: you're booked. We'll text appointment reminders to this number. Reply STOP to opt out, HELP for help."; rewrite `MessageFlow` to the real flow: "Customers opt in by calling, texting, or chatting with `{name}` or by booking a visit. At booking the front desk tells them they will get appointment texts at this number and can reply STOP. Terms: `{terms url}`. Privacy: `{privacy url}`."; add "Reply STOP to opt out." to the second `MessageSamples` entry.
- `policy.mjs`: the frequency line says "typically fewer than ten messages per job"; keep. Add a `<p>` with the shop's website when present. Unknown slug already 404s.

Acceptance (now):
- [ ] `curl -si "$D/policy?c=$S"` returns 200 `text/html` containing the shop name, `id="terms"`, `id="privacy"`, "Reply STOP", "Message and data rates may apply", and "support@machinesandcloud.com".
- [ ] `curl -si "$D/policy?c=nope"` returns 404.
- [ ] `grep -n "PrivacyPolicyUrl\|TermsAndConditionsUrl\|OptInMessage" netlify/functions/lib/twilio.mjs` shows all three inside `createCampaign`, and `MessageFlow` contains "/policy?c=".
- [ ] `node -e "import('./netlify/functions/lib/config.mjs').then(m=>console.log(m.DATA_POLICY))"` prints the paragraph.
- [ ] `python3 -I scripts/sitecheck.py .` passes.

Acceptance (later, keyed, S1-19): Twilio accepts the campaign without a privacy or terms validation error and the console shows both URLs.

### S1-04 One sender: Messaging Service, registered bridge, inbound mapping
Status: delivered again 2026-10-19 (engineer): the provisioning text now goes through `sendSMS({ client, type: "number_assigned" })`; grep is clean. Previously returned: `grep -rn "from: c.phone.twilioNumber" netlify/functions` still hit `provision-background.mjs` line 73 (the number-assigned text to the owner), which will fail with 30034 on the first keyed client; change it to `sendSMS({ to: c.owner.phone, client: c, force: true, type: "number_assigned", body })`. Every other "now" line passed (sender `bridge` on every send, `own` after `tenDlc: approved`, events carry `sender`, `ok`, `logged`, `preview`). Bridge inbound mapping (`resolveClient` via `index` `bridge:`) could not be exercised on the draft because the MC number is not exposed; code path reviewed, keyed pass covers it.
Size and scope: Size: M (was L). Implements: Epic 2 MUST "texts from a Machines & Cloud registered sender until the campaign clears". Closes the sending half of L2 and L3.

Already on disk: `lib/send.mjs` `sendSMS({ to, from, body, client, messagingServiceSid, force })` picks the shop's own number plus Messaging Service when `tenDlc === "approved"`, else `MC_MESSAGING_SERVICE_SID` or `MC_TWILIO_NUMBER` with the business name prefixed; sends with `MessagingServiceSid` when a service is known; writes `health` store `lastsend:{slug}`. `desk.mjs`, `scheduler.mjs`, `voice.mjs`, `client.mjs` already call `sendSMS` with `client`. `notifyOwner` sends with `force: true`.

Files: `netlify/functions/lib/send.mjs`, `netlify/functions/sms.mjs`, `netlify/functions/provision-background.mjs`, `netlify/functions/scheduler.mjs`, `netlify/functions/lib/store.mjs`, `.env.example`, `OPERATIONS.md`.

Remaining change:
- Bridge replies must reach the shop. When `sendSMS` sends for a client in bridge mode, write `index` key `bridge:{to}` -> `client.slug`. In `sms.mjs`, when `clientByNumber(To)` finds nothing and `To` equals `MC_TWILIO_NUMBER`, resolve the client by `index` `bridge:{From}`; only then fall through to the empty `<Response/>`. Without this, every customer reply and every STOP sent to the bridge number is dropped on the floor.
- Every send with a `client` logs an event the PM and the portal can read: `logEvent(slug, "sms_sent", { to, type, sender: "own"|"bridge"|"none", ok, sid, logged, preview: text.slice(0,120) })`; a Twilio error also logs `sms_failed` `{ to, type, code, message }`. Add a `type` argument to `sendSMS` and pass it at every call site (`confirmation`, `reminder_24h`, `reminder_1h`, `on_my_way`, `text_back`, `owner_alert`, `test`, `digest`, `lead_chase`, ...). Disabled mode (no Twilio keys) still logs `sms_sent` with `ok:false, logged:true`.
- `provision-background.mjs` line 73 still sends with a bare `from: c.phone.twilioNumber` (unregistered on day one, so it fails with 30034 when keyed); change to `sendSMS({ to: c.owner.phone, client: c, force: true, type: "number_assigned", body })`.
- `scheduler.mjs`: when a campaign turns `VERIFIED`, log `sender_switched` `{ to: "own" }`.
- `.env.example` and OPERATIONS.md env table gain `MC_MESSAGING_SERVICE_SID` with the one-time setup sentence (Machines & Cloud's own brand and campaign, `MC_TWILIO_NUMBER` attached).

Acceptance (now, no Twilio keys, `MC_TWILIO_NUMBER` set in Netlify):
- [ ] Book a visit on the test line; GET events include `booking`, an `sms_sent` with `type: "confirmation"`, `sender: "bridge"`, `ok:false`, `logged:true`, `preview` starting with the business name, and an `sms_sent` with `type: "owner_alert"`.
- [ ] The Blobs UI (or `admin records kind=index` if the engineer exposes it) shows `index` key `bridge:+17135550123` = the slug.
- [ ] Simulated inbound text with `To=$MC_TWILIO_NUMBER` and `From=+17135550123` returns a model reply from the test shop and the conversation is stored under `{slug}/sms/+17135550123`; the same `To` from an unknown `From` returns an empty `<Response/>`.
- [ ] `grep -rn "from: c.phone.twilioNumber\|from: client.phone.twilioNumber" netlify/functions` returns nothing.
- [ ] Set `tenDlc` to `approved` by admin (`{"phone":{"tenDlc":"approved"}}`): the next `sms_sent` event shows `sender: "own"` and no name prefix in `preview`.
- [ ] `grep -n MC_MESSAGING_SERVICE_SID .env.example OPERATIONS.md` finds both.

Acceptance (later, keyed, S1-19): with a pending campaign, the text-back from a real forwarded call arrives on Steve's phone from the MC number, prefixed with the shop name, within 15 seconds; replying to it continues the conversation with the shop; after approval the next text comes from the shop's own number.

### S1-05 STOP end to end
Status: verified with follow-up 2026-10-19 6ad677072d68cf5cf1481d56. Open lines (S1-22): `admin clear_optout` does not exist, and `admin.mjs` answers an unknown action that carries a slug with `ok: true` (a generic update), which hides that; delete already removes a test shop's opt-outs. The scheduler's `opted out` result was verified in code only (`scheduler.mjs` line 22): the draft run could not produce a surviving reminder for an opted-out number because STOP cancels them first and a same-day booking gets no 24 h reminder.
Size and scope: Size: S (was M). Implements: Epic 2 MUST "a customer who texts STOP never gets another message"; Epic 2 SHOULD 24-hour text-back dedupe. Closes L4.

Already on disk: `optouts` store keyed by the bare E.164 number (global across shops) with `{ at, slug, words }`; `sendSMS` refuses opted-out numbers unless `force`; `sms.mjs` matches STOP words and short sentences, calls `store.cancelTasksForNumber(from)`, logs `opt_out`, replies "you are unsubscribed..."; `START`, `UNSTOP`, `YES` clear it with an `opt_in` event; voice text-back now goes through `sendSMS` with the client and ends with "Reply STOP to opt out."

Files: `netlify/functions/sms.mjs`, `netlify/functions/lib/send.mjs`, `netlify/functions/lib/desk.mjs`, `netlify/functions/scheduler.mjs`, `netlify/functions/voice.mjs`, `netlify/functions/admin.mjs`.

Remaining change:
- No double confirmation: when Twilio already handled the keyword (`params.OptOutType` present, which happens on Messaging Service sends), record the opt-out and return an empty `<Response/>` instead of our own message.
- Tell the owner once: on opt-out, `notifyOwner(c, "{name} front desk: {from} opted out of texts. Nothing more will be sent to them.")` (owner alerts are `force: true`, so this still goes).
- `sendSMS` logs `sms_blocked` `{ to, type, reason: "opted_out" }` when it refuses; `scheduler.mjs` `runTask` returns `"opted out"` (not "send failed") when `r.reason === "opted_out"`.
- `ownerCommand` `otw`: when the send is refused, reply "`{customer}` opted out of texts; nothing sent." and still set the status.
- `voice.mjs` text-back dedupe: skip when the SMS conversation already holds a `system: "missed-call text-back"` assistant message newer than 24 hours (log `text_back_skipped` `{ reason: "recent" }`); when `sendSMS` returns `reason: "opted_out"` log `text_back_skipped` `{ reason: "opted_out" }`. The owner still gets the missed-call alert.
- `admin.mjs`: action `clear_optout` `{ phone }` for the PM's fake test numbers. Real opt-outs are legal records and are never removed by `delete`.

Acceptance (now):
- [ ] Book by simulated SMS for tomorrow 8 to 12 from `+17135550123`; `admin tasks` shows `reminder_24h` and `reminder_1h`.
- [ ] Body `STOP` from that number returns a `<Message>` containing "unsubscribed"; Blobs `optouts/+17135550123` exists with `words: "STOP"`; `admin tasks` no longer lists either reminder; events include `opt_out` with `cancelled: 2` and an owner `sms_sent` whose preview contains "opted out".
- [ ] Body `Stop` with an extra form field `OptOutType=STOP` returns an empty `<Response/>` and still records the opt-out.
- [ ] Body `hello` from the opted-out number: no model call (no `sms_reply` event); the reply is the normal model reply is NOT acceptable. (Engineer: short-circuit after the opt-out check with an empty `<Response/>` and an `sms_ignored_optout` event.)
- [ ] Owner text `otw REF` for that booking returns "opted out of texts; nothing sent" and an `sms_blocked` event exists.
- [ ] Nudge a `reminder_24h` for an opted-out customer and `run_scheduler`: result `["reminder_24h","opted out"]`.
- [ ] Body `START` returns "opted back in"; the optout key is gone; `admin clear_optout` removes a key too.
- [ ] Two simulated calls from one number within ten minutes: one `text_back` `sms_sent` and one `text_back_skipped` `reason: "recent"`; a call from an opted-out number: `text_back_skipped` `reason: "opted_out"`, and the owner `missed_call` alert still logged.

Acceptance (later, keyed): on Steve's phone, book by SMS, text STOP, confirm one confirmation arrives (not two), and the 24 h reminder slot passes with nothing received.

### S1-06 Consent line at booking, consent record on the booking
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56.
Size and scope: Size: S. Implements: Epic 2 MUST "told once that I will get appointment texts and can reply STOP; booking stores when, channel, wording".

Files: `netlify/functions/lib/config.mjs`, `netlify/functions/lib/desk.mjs`, `netlify/functions/lib/vapi.mjs`.

Change:
- `config.mjs` exports `CONSENT_LINE = "You'll get appointment texts from {name} at this number. Reply STOP any time to end them."` and the prompt (web, sms, test, voice) adds under "After a tool succeeds": "When book_visit succeeds, say this once, in the customer's language: `{CONSENT_LINE}`. Never say it twice in one conversation."
- `bookVisit` stores `consent: { at: now(), channel: ctx.channel, wording: CONSENT_LINE with the name filled in, phone: b.phone }` on the booking, and the confirmation text (`type: "confirmation"`) ends with "Reply STOP to opt out."
- `voicePrompt` (Vapi) inherits it through `buildSystemPrompt`; the spoken form is the same sentence.

Acceptance (now):
- [ ] Book on the test line; the final reply contains "reply STOP" (case-insensitive) exactly once across the conversation (`admin records kind=conversations`).
- [ ] `admin records kind=bookings` shows `consent.at`, `consent.channel` = `test`, `consent.wording` containing the shop's name.
- [ ] The confirmation `sms_sent` preview (bridge or none mode) ends with "Reply STOP to opt out."
- [ ] `admin prompt channel=voice` contains the consent sentence.
- [ ] Spanish booking on the test line (write in Spanish) gets the sentence in Spanish, once.

### S1-07 Three questions first; wants a person gets a callback window
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56.
Size and scope: Size: S. Implements: Epic 6 MUST "answers area, cost, when before asking for a name"; Epic 3 MUST "missed-calls shop: takes the number and states a callback window"; Epic 3 MUST "says what it is" (verified, not changed).

Files: `netlify/functions/lib/config.mjs`, `netlify/functions/lib/vapi.mjs`.

Change:
- `newClient` adds `rules.callbackHours: "within 30 minutes"` and `rules.callbackAfterHours: "by 8 am tomorrow"` (editable in S1-09's portal fields).
- `buildSystemPrompt` "How a conversation should go" is rewritten in this order: (1) "Start by asking what's going on, in one question. If the customer asks whether you serve their area, what it costs or what the fee covers, or when you can come, answer that first from the facts above, before asking for anything." (2) "Ask for the name and best phone number only after you know what they need and they want a visit or a callback. Never ask for a form's worth of details in a row." (3) existing booking and emergency rules. (4) New: "If the customer asks for a person, a human, the owner, or asks whether you are real: say you are the front desk assistant, say `{owner}` will call them `{callbackHours}` during business hours or `{callbackAfterHours}` after hours, take their number, and call notify_owner with reason `wants_call`. Never say 'someone will call you back' without the window."
- `voicePrompt` replaces "say `{owner}` will call them back and take their number" with the same callback-window sentence for `phone.forwarding !== "all"`; the `all` branch is S1-17.

Acceptance (now, test line, `stream:false`):
- [ ] "do you come out to Katy and what does the visit cost?" -> the reply states the area answer and the published diagnostic fee and does not ask for a name or phone.
- [ ] "when's the soonest you can come?" -> offers the shop's windows before any name request.
- [ ] "can I talk to a real person" -> reply names the owner, states "within 30 minutes" or "by 8 am tomorrow" (one of the two), asks for the number; after the number is given, a `lead` event exists with `reason: "wants_call"` (enum added in S1-08; until then `handoff` is accepted).
- [ ] "is this a real person?" -> reply says it is the front desk assistant (an AI), does not claim to be a person.
- [ ] `admin prompt channel=voice` contains "within 30 minutes" and not "will call them back and take their number".

### S1-08 Every alert is a job ticket
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56.
Size and scope: Size: M. Implements: Epic 5 MUST "every alert is a job ticket" (outcome tag, new or existing, unsure line).

Files: `netlify/functions/lib/config.mjs`, `netlify/functions/lib/desk.mjs`, `netlify/functions/lib/store.mjs`, `netlify/functions/vapi.mjs`, `desk.html`.

Change:
- `NOTIFY_OWNER.input_schema`: `reason` enum becomes `["lead", "handoff", "emergency", "question", "wants_call", "spam"]`; add `wanted` (string, "when they want someone, in their words; empty if not said") and `unsure` (string, "anything you were not confident about: the address, the issue, whether it is in the area; empty if none"). `BOOK_VISIT` adds `unsure` (same description). Both stay `strict`, `required` lists extended.
- `desk.mjs` exports `customerType(slug, phone)`: `"existing"` when any booking or lead for the slug has that phone and `createdAt` older than 10 minutes, else `"new"`. `bookVisit` and `flagLead` store `customerType`, `wanted`, `unsure` on the record and `outcome`: bookings `booked`; leads by reason: `lead` and `handoff` -> `needs_action`, `emergency` -> `needs_action` (plus the EMERGENCY flag), `question` -> `took_message`, `wants_call` -> `wants_call`, `spam` -> `spam`.
- `ownerSummary(c, kind, r)` output, in this order, each line only when present: line 1 "`{name}` front desk: `{OUTCOME in caps with spaces}`" plus " EMERGENCY" when urgency is emergency; "Customer: `{name}` (`new` | `existing customer`)"; "Phone"; "Where" (address or ZIP); "Issue"; "Urgency: `{urgency}`"; "Wants: `{wanted}`" or "Window: `{date, window}`"; "Access: `{notes}`"; "Language: Spanish"; "Unsure about: `{unsure}`"; "Ref `{id}`. Reply `ok {id}` to acknowledge, `otw {id}` on the way, `done {id}` finished, `quote {id} amount` quoted." (`ok` lands in S1-10; the text may ship now.)
- `spam`: the lead is stored with `status: "spam"` and no owner text or email is sent; the digest (S1-14) counts it.
- `desk.html` leads table adds an "Outcome" column and shows `unsure` under the issue in muted text; bookings table shows `new/existing` under the customer.

Acceptance (now):
- [ ] On the test line, book a visit saying the address is "somewhere on Mason Rd, not sure of the number". The owner alert (`sms_sent` preview via `admin records kind=events`, and the email body in the function log) starts with "`{name}` front desk: BOOKED", has "Customer: ... (new)", and an "Unsure about:" line mentioning the address.
- [ ] Start a new test conversation with the same phone number and ask for a callback: the alert says "WANTS A CALL" and "(existing customer)".
- [ ] A clear spam message ("we can get you on page one of Google, call us") on the test line yields a lead with `status: "spam"`, `outcome: "spam"`, and no `owner_alert` `sms_sent` event for it.
- [ ] `node -e "import('./netlify/functions/lib/config.mjs').then(m=>console.log(m.NOTIFY_OWNER.input_schema.properties.reason.enum))"` prints the six reasons.
- [ ] The portal leads table shows the Outcome column.

### S1-09 Loop-proof numbers: backup, transfer target, acknowledgment settings
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56 at the API level (onboarding 400s, PUT 400 with unchanged value, prompt picks up the edited window); the `onboard.html` field reveal and inline error were checked in the page code, not in a browser.
Size and scope: Size: M. Implements: Epic 3 MUST "onboarding refuses an escalation or backup number that equals the forwarded line or the front desk number"; stores the fields S1-10 and S1-17 need.

Files: `netlify/functions/lib/config.mjs`, `netlify/functions/onboard.mjs`, `netlify/functions/client.mjs`, `onboard.html`, `desk.html`.

Change:
- Client record fields: `owner.backupPhone` (E.164 or ""), `phone.transferTo` (E.164 or "", defaults to `owner.phone` when read), `rules.ackMinutes` (5, 10, 15, 30; default 10), `rules.callbackHours`, `rules.callbackAfterHours` (from S1-07).
- `config.mjs` exports `loopCheck(c)` returning `null` or `{ field, message }`: `owner.phone === phone.twilioNumber` -> "Your cell cannot be the front desk number."; `owner.backupPhone` equal to `phone.businessNumber`, `phone.twilioNumber`, or `owner.phone` -> "The backup number must be a different phone from your cell, your business line, and the front desk number."; when `phone.forwarding === "all"`, `(phone.transferTo || owner.phone) === phone.businessNumber` -> "With all calls forwarded, transfers must go to a phone that is not the forwarded line, or every transfer comes straight back to the front desk."
- `onboard.mjs` and `client.mjs` PUT: accept the new fields (sanitized with `e164`, enum for `ackMinutes`), run `loopCheck` after assigning, return 400 `{ error: "loop", field, message }` without saving when it fails.
- `onboard.html` step 5: "Backup number for urgent alerts (optional): if you do not acknowledge an urgent alert within 10 minutes, it goes here." and, shown only when forwarding = "All of them", "Transfer calls that need you to" prefilled from "Your cell". Shows the API `message` next to the named field on 400.
- `desk.html` "You" card: backup number, transfer-to (visible when forwarding is `all`), "Acknowledge urgent alerts within" select, callback window during hours / after hours; same 400 handling in `saveMsg`.

Acceptance (now):
- [ ] `POST /api/onboard` with `phone` and `businessNumber` both `+17135550100`, `forwarding: "all"`, no `transferTo` -> 400 `{"error":"loop","field":"phone.transferTo",...}`; the same with `forwarding: "missed"` -> 200 (missed-call forwarding from the owner's own cell is the normal setup).
- [ ] `POST /api/onboard` with `backupPhone` equal to `phone` -> 400 with `field: "owner.backupPhone"`.
- [ ] `PUT /api/client?c&k` `{"owner":{"backupPhone":"+17135550100"}}` where that equals `phone.businessNumber` -> 400 and `GET` still shows the old value.
- [ ] `PUT` `{"rules":{"ackMinutes":15,"callbackHours":"within the hour","callbackAfterHours":"by 7 am"}}` -> 200 and `admin prompt channel=sms` contains "within the hour".
- [ ] On `onboard.html` (draft URL), choosing "All of them" reveals the transfer field; submitting the looping pair shows the message under the field without leaving the page.

### S1-10 Acknowledge and escalate
Status: verified with follow-up 2026-10-19 6ad677072d68cf5cf1481d56. Finding: one emergency conversation opened three alerts (the model called `notify_owner` on consecutive turns), so three escalation chains ran for one customer: three backup texts, three calls, three Steve emails. New ticket S1-20.
Size and scope: Size: L. Implements: Epic 3 MUST "an emergency or wants-a-call alert expects my reply; escalates to backup, then calls my cell, then texts the customer"; Steve is the backstop of last resort. Closes L5 (with S1-07, S1-08, S1-18).

Files: `netlify/functions/lib/desk.mjs`, `netlify/functions/lib/send.mjs`, `netlify/functions/lib/store.mjs`, `netlify/functions/sms.mjs`, `netlify/functions/scheduler.mjs`, `netlify/functions/voice.mjs`, `netlify/functions/client.mjs`, `netlify/functions/admin.mjs`, `desk.html`.

Change:
- New store kind `alerts`, key `{slug}/{id}`: `{ id, slug, leadId, kind: "emergency"|"wants_call", status: "waiting"|"acked"|"exhausted", step: 0..3, sentAt, ackedAt, ackedBy, history: [] }`.
- `flagLead`: when `reason` is `emergency` or `wants_call`, or `urgency` is `emergency`, create the alert and `scheduleTask(slug, now + ackMinutes, "escalate", { alertId })`. The owner text (S1-08 format) already asks for `ok REF`.
- Acknowledge: `sms.mjs` owner branch accepts `ok REF` (and treats `otw`, `done`, `quote`, `cancel` on the same REF as an ack); `ownerCommand` returns "Got it, `{customer}` is yours." and sets the alert `acked`. Portal: `client.mjs` POST `ack` `{ leadId }`; `desk.html` leads table shows an "Acknowledge" button on open `wants_call` and emergency leads.
- Scheduler `escalate` task (in `runTask`, before the template branch): load the alert; if `acked` return `"acked"`. Else by `step`: step 1 text `owner.backupPhone` (skip if empty) with the original summary prefixed "`{owner}` has not acknowledged this in `{ackMinutes}` min:"; step 2 call `owner.phone` through new `send.mjs` `placeCall({ to, from: MC_TWILIO_NUMBER || twilioNumber, say })` (Twilio Calls API with inline `Twiml` `<Say>` "Urgent lead from your `{name}` front desk. Please check your texts." repeated twice; no model, no conversation); step 3 `notifySteve("Unacknowledged {kind}: {name}", summary + portal link)` and text the customer "`{name}`: we have your request and `{owner}` will call you `{callbackHours or callbackAfterHours by Houston time}`." then mark `exhausted`. After steps 1 and 2 schedule the next `escalate` at `+ackMinutes`. Each step appends to `history` and logs `escalated` `{ step, how }`. Missing keys log the step as `logged` and continue.
- `voice.mjs` guard from S1-02 (calls whose `From` is `MC_TWILIO_NUMBER` or the shop's own `twilioNumber` hang up) covers the escalation call bouncing back through the owner's forwarding; extend it if the escalation call uses a different caller ID.
- `admin.mjs` `delete` removes `alerts/{slug}/*`; `records kind=alerts` lists them.

Acceptance (now):
- [ ] Test line: "I smell gas" + address + number -> `lead` with `urgency: "emergency"`; `admin records kind=alerts` has one `waiting` alert, `admin tasks` has one `escalate` due in `ackMinutes`.
- [ ] Owner simulated text `ok REF` (`POST /api/sms` From = owner.phone) returns "Got it"; the alert is `acked`; `admin run_scheduler` after nudging the task past due returns `["escalate","acked"]`.
- [ ] New emergency lead, no ack; nudge and run: step 1 `sms_sent` to the backup number (or `escalated` with `how: "backup skipped"` when none), a new `escalate` task exists; nudge and run again: `escalated` `{ step: 2, how: "call" }` with `logged: true` in no-key mode; third run: `escalated` step 3, a `notifySteve` email event, a customer `sms_sent` `type: "fallback_window"` whose preview contains "will call you", alert `exhausted`, no further `escalate` task.
- [ ] Portal "Acknowledge" button on the lead sets the alert `acked` and the button disappears.
- [ ] A `wants_call` lead (S1-07 scenario) also creates an alert; a plain `lead` does not.
- [ ] `POST /api/voice` with `From=$MC_TWILIO_NUMBER` returns `<Response><Hangup/></Response>` and no events.

Acceptance (later, keyed): Steve's cell as owner, a second phone as backup: ignore the emergency text; within 10 to 20 minutes the backup phone gets the text; within another 10 to 20 minutes the cell rings with the spoken line; then the customer phone gets the window text and Steve's email arrives.

### S1-11 Reschedule or confirm by reply
Status: verified with follow-up 2026-10-19 6ad677072d68cf5cf1481d56. Finding: the first SMS reply after booking began with the model's planning text ("Have name, address, issue, window. Phone filled automatically. Book.") before the customer-facing sentence. New ticket S1-21. Note: a visit booked for tomorrow after today's window start gets only the 1 h reminder (24 h reminder would be in the past); by design.
Size and scope: Size: L. Implements: Epic 6 MUST "Reply R to reschedule or C to confirm works"; Epic 6 SHOULD "front desk only notifies on a cancellation" (cheap here). Keeps the Starter card and reminder copy true.

Files: `netlify/functions/lib/config.mjs`, `netlify/functions/lib/desk.mjs`, `netlify/functions/lib/calendar.mjs`, `netlify/functions/sms.mjs`.

Change:
- `sms.mjs` customer branch: before building the prompt, load the number's upcoming bookings (`listRecords("bookings", slug, 200)` filtered by `phone === from`, `status` in `booked`, `on_the_way`, and `visitDate(date)` today or later). Pass them to `buildSystemPrompt(c, "sms", { bookings })`, which adds a block "This customer's upcoming visit(s): ref `{id}`, `{date}`, `{window}`, `{issue}`." and the rule "Reminder texts say 'Reply R to reschedule or C to confirm'. R or 'reschedule': offer the arrival windows and call update_visit with action reschedule once they pick a day and window. C or 'confirm': call update_visit with action confirm. If they want to cancel, call update_visit with action cancel_request; you do not cancel visits yourself, `{owner}` does."
- Fast paths with no model call: body exactly `C`, `c`, `confirm`, `yes` with exactly one upcoming booking -> confirm and reply "`{name}`: confirmed for `{date}`, `{window}`. See you then."; body exactly `R` with one upcoming booking -> reply the windows list "Which day and window works? We offer `{windows}`." and continue by model on the next turn.
- New tool `UPDATE_VISIT` in `config.mjs` (strict): `{ booking_id, action: "confirm"|"reschedule"|"cancel_request", date, window }` (date and window empty strings unless rescheduling). Offered on the `sms` channel only (the web widget has no phone identity).
- `desk.mjs`: `confirmVisit(c, b)` sets `confirmedAt`; `rescheduleVisit(c, b, date, window)` updates `date`/`window`, cancels that booking's `reminder_24h`/`reminder_1h` tasks, schedules new ones, calls `calendar.updateEvent` (new: PATCH `events/{calendarEventId}` with the new start and end) when connected, texts the owner "`{name}` front desk: RESCHEDULED ref `{id}` to `{date}`, `{window}` (was `{old}`)", logs `rescheduled`; `cancelRequest(c, b)` texts the owner "`{name}` front desk: NEEDS ACTION. `{customer}` wants to cancel ref `{id}`. Reply `cancel {id}` to cancel it." and logs `cancel_requested`; the customer is told the owner will confirm.
- The `[Done: ...]` markers extend: `[Done: visit confirmed, ref X]`, `[Done: visit moved to DATE WINDOW, ref X]`, `[Done: cancel request sent, ref X]`.

Acceptance (now, simulated SMS from `+17135550123`):
- [ ] Book for tomorrow 8 to 12 by SMS; `admin tasks` shows two reminders.
- [ ] Body `C` -> reply contains "confirmed for"; booking has `confirmedAt`; no model call (no `sms_reply` event; a `confirmed` event instead).
- [ ] Body `R` -> reply lists the windows; Body "Friday 12 to 5" (or an explicit date) -> reply confirms the new slot; booking `date`/`window` changed; `admin tasks` shows two new reminder times and none at the old times; events include `rescheduled` and an owner `sms_sent` whose preview starts with "`{name}` front desk: RESCHEDULED".
- [ ] Body "I need to cancel" -> reply says the owner will confirm; booking status still `booked`; owner `sms_sent` preview contains "wants to cancel"; `cancel_requested` event.
- [ ] A number with no upcoming booking texting `C` gets a normal model reply (no fast path).
- [ ] `admin prompt channel=sms` for a number with a booking (engineer adds `contact` to the admin `prompt` action) shows the "upcoming visit" block; for `web` it never does.

Acceptance (later, keyed): the 24 h reminder arrives on Steve's phone; replying `R` then a window moves the Google Calendar event (visible in Calendar) and texts the owner.

### S1-12 Line health card
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56; the `errors24h` counter was not exercised (no cheap error trigger on a draft), code path reviewed.
Size and scope: Size: M. Implements: Epic 1 MUST "line-health check in the portal". Also fixes `forwardingVerified` being set by any first call.

Files: `netlify/functions/client.mjs`, `netlify/functions/voice.mjs`, `netlify/functions/sms.mjs`, `netlify/functions/vapi.mjs`, `netlify/functions/lib/desk.mjs`, `desk.html`.

Change:
- `desk.mjs` exports `lineHealth(c, events)`: `{ lastInboundCall, lastInboundText, lastOutboundText, errors24h, sender, tenDlc, forwardingVerified }` where inbound call = latest of `missed_call`, `call_forwarded`, `call_ended`, `call_passthrough`; inbound text = latest `sms_reply` or `sms_inbound` (new: log `sms_inbound` at the top of the customer branch in `sms.mjs`, before the model); outbound = the `health` store `lastsend:{slug}` written by `sendSMS` (already on disk) or the latest `sms_sent` with `ok: true`; errors = count in 24 h of `sms_failed`, `sms_agent_failed` (new: logged in the `sms.mjs` catch), `vapi_tool_failed` (new: logged in the `vapi.mjs` catch), `task_error` (new: logged in the scheduler catch); `sender` from `senderFor(c).mode`.
- `client.mjs` GET adds `health: lineHealth(c, events)` (events already loaded; raise the list to 300).
- `voice.mjs`: set `forwardingVerified` only when `params.ForwardedFrom` is present.
- `desk.html`: a "Line health" card at the top of the Setup pane: four lines "Last inbound call: `{relative time or 'none yet'}`", "Last inbound text", "Last text delivered", "Errors in the last 24 h: `{n}`" (red when n > 0), plus "Texting from: your number | Machines & Cloud's registered number until carriers approve yours | not yet". The daily digest (S1-14) reuses the one-liner.

Acceptance (now):
- [ ] Fresh shop: `GET /api/client?c&k` has `health` with all three timestamps `null`, `errors24h: 0`, `sender` `none` or `bridge`.
- [ ] After a simulated call, text, and a booking: the three timestamps are set and `lastOutboundText` stays `null` in no-key mode (nothing was delivered) while `lastInboundText` is set.
- [ ] Force an error (simulated SMS with `ANTHROPIC_API_KEY` absent is not possible on the draft; instead the engineer provides a `Body` of 1500 x characters that trips the model into an error, or temporarily throws): `errors24h` increments and the card turns red. If no cheap trigger exists, the engineer documents the manual event insert used.
- [ ] `POST /api/voice` without `ForwardedFrom` on a fresh shop leaves `phone.forwardingVerified` unset; with `ForwardedFrom=+1...` it becomes `true` and `firstCallAt` is set.
- [ ] The portal Setup pane shows the card with "none yet" wording, no "null".

### S1-13 Flag a conversation
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56.
Size and scope: Size: S. Implements: Epic 5 MUST "flag any conversation with one tap and a note; flags go to Steve the same day and appear in the digest". Closes the owner half of L8.

Files: `netlify/functions/client.mjs`, `netlify/functions/lib/store.mjs`, `desk.html`.

Change:
- `client.mjs` POST `flag` `{ channel, contact, note }`: loads the conversation, sets `flag: { at, note (<= 300 chars), by: "owner" }`, logs `flagged` `{ channel, contact }`, `notifySteve("Flagged by {name}: {channel} {contact}", note + "\n" + last 6 messages + portal link)`. POST `unflag` clears it.
- GET conversations include `flag`.
- `desk.html` Conversations tab: each conversation gets a "Flag" button that prompts for a note (plain `prompt()` is fine) and shows "Flagged: `{note}`" with an "Unflag" link afterward.

Acceptance (now):
- [ ] `POST /api/client?c&k` `{"action":"flag","channel":"test","contact":"<id>","note":"quoted a price we do not list"}` -> `{ok:true}`; GET shows `flag.note` on that conversation; events include `flagged`; Netlify function log shows the Steve email (or a Resend send when keyed).
- [ ] Unknown contact -> 404 `{ error: "no_conversation" }`.
- [ ] Portal: Flag -> prompt -> the conversation shows the note; Unflag clears it.

### S1-14 Daily digest at 6 pm for every live shop
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56; the testing-shop exclusion was verified in code (`c.status !== "live"`), not with a second shop.
Size and scope: Size: M. Implements: Epic 5 MUST "one digest text and email a day"; cut 6 (daily replaces the Pro-only Monday digest); L8 Steve copy for the first week.

Files: `netlify/functions/lib/desk.mjs`, `netlify/functions/scheduler.mjs`, `netlify/functions/client.mjs`, `netlify/functions/admin.mjs`.

Change:
- `desk.mjs` exports `dailyDigest(c)` for the Houston calendar day: "`{name}`, today: `{n}` booked (`{refs}`), `{n}` leads need action (`{refs}`), `{n}` emergencies, `{n}` wants a call, `{n}` spam. Flagged: `{n}` (`{first note}`). Line: last call `{time}`, last text `{time}`, errors `{n}`." Empty day: "`{name}`: nothing today. Line OK, last call `{time or 'none'}`." Email version has one line per item with the customer name and issue.
- `scheduler.mjs`: compute the Houston hour with `Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false, minute: "numeric" })`; when hour is 18 and minute < 10, for every `live` client: `notifyOwner(c, text)` (text + email) and `logEvent(slug, "digest", { text })`; when `liveAt` is within the last 7 days also `notifySteve("Digest: {name}", email version)`. Remove the Monday 13:00 UTC block; `weeklyDigest` may stay exported for a later weekly email.
- `client.mjs` POST `digest` returns the daily text; `admin.mjs` action `digest` with `send: true` sends it now (verification).

Acceptance (now):
- [ ] Fresh live shop: `POST /api/client?c&k` `{"action":"digest"}` returns text containing "nothing today".
- [ ] After a booking, an emergency lead, a spam lead, and a flag on the same Houston day: the text names 1 booked with its ref, 1 needs action, 1 emergency, 1 spam, "Flagged: 1" with the note.
- [ ] `admin digest send=true` logs `sms_sent` `type: "digest"` to the owner and a `digest` event; the email `subject` is "`{name}`: today's front desk" (visible in the function log without Resend).
- [ ] `grep -n "getUTCDay() === 1" netlify/functions/scheduler.mjs` returns nothing; `grep -n "America/Chicago" netlify/functions/scheduler.mjs` finds the hour check.
- [ ] A `testing` shop gets no digest from `run_scheduler` during the window (engineer may expose `force_hour` on `run_scheduler` for the PM to simulate 18:00).

Acceptance (later, keyed): Steve's phone and inbox get the test shop's digest at 6:00 to 6:10 pm Houston; the Steve copy arrives while `liveAt` is under 7 days old and stops after.

### S1-15 Cancel from the portal
Status: verified with follow-up 2026-10-19 6ad677072d68cf5cf1481d56. Open lines (S1-22): in the cancelled state the portal shows "line rings through until <date>" but not the off codes as tap-to-dial buttons or `offLong`, and the Test tab stays visible. The email includes `DATA_POLICY` ("ask for an export at any time"), which is the intended wording; the old "export on the portal" promise is gone.
Size and scope: Size: S (was M). Implements: Epic 4 MUST "cancel with one click; carrier cancel code texted; number forwards to my phone for 30 days; Steve gets a verification task; written confirmation". Closes L6 with S1-02.

Already on disk: `client.mjs` action `cancel` `{ reason }` sets `status` `cancelled` and `cancelledAt`, texts the owner the off codes and the 30-day line, emails "cancellation confirmed" with the last billing date, notifies Steve to verify forwarding within 2 business days; `desk.html` has the Cancel service box with the optional reason; `voice.mjs` pass-through covers `cancelled` (loop fix in S1-02 applies).

Files: `netlify/functions/client.mjs`, `netlify/functions/lib/forwarding.mjs`, `desk.html`, `netlify/functions/admin.mjs`.

Remaining change:
- Store `serviceEndsAt = cancelledAt + 30 days` and `cancelReason`; cancel every task for the slug (`cancelTasks(slug, () => true)`); return `serviceEndsAt` in the response.
- Email wording: "Your data stays available for export on the portal for 30 days" promises an export that does not exist; change to "Your bookings, leads, and conversations stay readable on your portal until `{serviceEndsAt}`, and are deleted on request after that." Add the `DATA_POLICY` paragraph. Name the date the line stops ringing through (`{serviceEndsAt}`) in both the text and the email; the Steve note adds "release the number on `{serviceEndsAt}`".
- `forwarding.mjs` returns `offLong`: "To send calls back to your phone: dial `{off codes joined with ' then '}` from your business cell. iPhone users: also check that Settings, Phone, Live Voicemail is off."
- `desk.html` in the cancelled state: header shows "cancelled, line rings through until `{serviceEndsAt}`", the Setup pane shows the off codes as tap-to-dial buttons and `offLong`, the Test tab is hidden.
- `admin.mjs` `status` enum includes `cancelled`; `{"status":"live"}` reactivates.

Acceptance (now):
- [ ] `POST /api/client?c&k` `{"action":"cancel","reason":"test"}` returns `{ok:true,status:"cancelled",serviceEndsAt:"<+30 days>"}`; events include `cancelled` with the reason; owner `sms_sent` preview contains the carrier off code (`#61#` for the AT&T test shop) and the end date; the function log shows the email subject "cancellation confirmed" with "readable on your portal until" and no "export"; a Steve email contains "Verify forwarding is off" and "release the number".
- [ ] `admin tasks` is empty afterward.
- [ ] Simulated call: the S1-02 pass-through TwiML; simulated text: empty `<Response/>`; `POST /api/chat` without key: 403.
- [ ] Portal shows the cancelled header, the dial buttons, no Pause or Go live button, no Test tab.
- [ ] `admin` `{"status":"live"}` brings it back; the simulated text gets a model reply.

### S1-16 Truthful copy: timelines, plan cards, FAQ, LSA line, data policy, forwarding notes
Status: verified 2026-10-19 6ad677072d68cf5cf1481d56: 0 stale timeline or card phrases, prices once each and identical to the pre-sprint commit (HEAD~1), nine FAQs in HTML and JSON-LD, no "few days", no em dashes, sitecheck passes, MC desk answers Jobber and own-number texting honestly, portal GET carries `dataPolicy` and the policy link, forwarding text carries the Live Voicemail line. The onboarding page copy was checked in the file, not in a browser.
Size and scope: Size: M. Implements: Epic 2 MUST "true timeline"; cut 1 and open question 5 (Growth card trimmed to what is real); cut 5 (seasonal reminders line removed); Epic 4 MUST data policy on site and portal; Epic 7 SHOULD one LSA line; research log iPhone Live Voicemail. Closes L7 (with S1-11 keeping "reschedules by reply" true).

Files: `index.html`, `onboard.html`, `desk.html`, `netlify/functions/chat.mjs` (MC_SYSTEM), `netlify/functions/provision-background.mjs`, `netlify/functions/lib/forwarding.mjs`, `llms.txt`, `llms-full.txt`, `CLAUDE.md`.

Change, exact strings:
- `index.html` hero: "Live in 7 days. Setup is on us. No contract." -> "Answering the same day. Setup is on us. No contract."
- Plans, Starter: "Every lead and booking texted to you" -> "Every lead and booking texted to you, and a 6 pm digest every day". Growth: remove `<li>Angi, Thumbtack, and Google Local Services leads answered</li>` and `<li>Jobber or Housecall Pro connection</li>` (price and the other four lines unchanged). Pro: remove `<li>Maintenance plan and seasonal reminders, with consent</li>`. Footnote: "and test it with you before it goes live on day 7" -> "and test it with you on a private line before it goes live"; "The first 7 days are free with a card on file, and nothing is charged until day 8." -> "The first 7 days are free, and nothing is billed until day 8."
- FAQ "What about Thumbtack, Angi, and Google leads?" answer -> "Calls from Google Local Services ads forward like any other call. Since October 2026 Google bills a business-hours call that rings unanswered past 20 seconds, so for an LSA line we recommend the front desk answers every call and transfers the ones that need you. Angi and Thumbtack messages are not connected yet; a text or call from either is answered like any other." FAQ "Does it work with my scheduling software?" answer -> "It books into Google Calendar, or texts you the booking to enter yourself if you run on paper or something else. Jobber and Housecall Pro are not connected yet." FAQ "Is there a contract?" answer: "The first 7 days run free on your real site and phone, so you are judging the real thing, and nothing is billed until day 8." New FAQ "How soon is it live, and when does it text from my number?" -> "Website chat and the phone the same day you finish setup. Texting from your own number needs a carrier registration that takes one to six weeks; until it clears, your front desk texts from our registered number with your business name on every message, and switches to your number the day it is approved." New FAQ "Whose data is it?" -> the `DATA_POLICY` paragraph. Update the FAQPage JSON-LD in the `@graph` to the same nine questions and answers. Update the CLAUDE.md line "seven FAQs" to nine.
- `onboard.html` step 5 hint: "it usually clears in a few days" -> "it takes one to six weeks; until it clears, your front desk texts from our registered number with your business name on every message". Under the forwarding select, when the LSA checkbox is ticked (or always, one line): "Running Google Local Services ads? Choose 'All of them': Google now bills business-hours calls that ring unanswered past 20 seconds." Done panel: "Your front desk number and the one-minute forwarding step arrive by text and email as soon as the number is ready." stays; add "Texting from your own number starts when carriers approve the registration (one to six weeks); your desk texts from our registered number until then."
- `desk.html` `dlcText`: `brand_pending` -> "Filed. Carriers are reviewing your business (usually 1 to 2 weeks). Your front desk texts from Machines & Cloud's registered number until then, with your name on every message."; `campaign_pending` -> "Business approved. Carriers are reviewing the texting use case (one to six weeks). Same bridge until then."; `approved` unchanged. Setup pane adds a card "Your data" with the `DATA_POLICY` paragraph and a line "Texting terms your customers can read: `{site}/policy?c={slug}`".
- `provision-background.mjs` number email: "(usually a few days; we filed it)" -> "(one to six weeks; we filed it). Until then your front desk texts from our registered number with your business name on every message."
- `chat.mjs` `MC_SYSTEM`: the Growth line drops "Angi, Thumbtack, and Google Local Services leads answered (...)" and "Jobber or Housecall Pro connection"; the Pro line drops "maintenance-plan and seasonal reminders with consent collected at booking"; "Scheduling software:" line -> "Google Calendar on every plan; Jobber and Housecall Pro are not connected yet; paper shops get the booking by text."; the 10DLC line -> "takes one to six weeks; until it clears the front desk texts from Machines & Cloud's registered number with the shop's name on every message, then switches to the shop's number"; "Timeline:" line -> "day 1 website and questionnaire, same day website chat and the phone are answering on a private test line, go live when the owner says so; first 7 days free"; drop "with a card on file".
- `forwarding.mjs` `long` for att, verizon, tmobile: append "iPhone: turn off Live Voicemail first (Settings, Phone, Live Voicemail) or it picks up before forwarding. Dial *#61# to check that forwarding is set."
- `llms.txt`, `llms-full.txt`: remove Jobber/Housecall Pro, Angi/Thumbtack/LSA-answered, seasonal reminders, and "card on file" claims if present (`grep -n "Jobber\|Housecall\|Angi\|Thumbtack\|seasonal\|card on file" llms.txt llms-full.txt`).

Acceptance (now, on the draft URL and in the repo):
- [ ] `grep -c "Live in 7 days\|card on file\|live on day 7" index.html` = 0; `grep -c "Jobber or Housecall Pro connection\|Angi, Thumbtack, and Google Local Services leads answered\|seasonal reminders" index.html` = 0.
- [ ] `grep -c "\$99\|\$249\|\$449" index.html` is unchanged from before the ticket (prices appear once each in the plans cards plus the JSON-LD offers; record the before and after counts in the delivered note).
- [ ] The FAQ list has nine items and the FAQPage JSON-LD has nine `Question` entities with matching text (`python3 -I -c` snippet in the delivered note).
- [ ] `grep -n "few days" onboard.html desk.html netlify/functions/provision-background.mjs netlify/functions/chat.mjs` returns nothing.
- [ ] `grep -n "Live Voicemail" netlify/functions/lib/forwarding.mjs` finds it in att, verizon, and tmobile `long` strings; `GET /api/client?c&k` `forwarding.long` contains it for an AT&T test shop.
- [ ] `POST /api/chat` on the MC desk (`stream:false`) "does it connect to Jobber?" -> the reply says not yet (no claim of a connection); "how fast is texting from my own number?" -> mentions weeks, not days.
- [ ] The portal Setup pane shows "Your data" and the policy link; `grep -c "belong to your shop" index.html desk.html netlify/functions/policy.mjs` = 1 each.
- [ ] `python3 -I scripts/sitecheck.py .` passes; no em dash (U+2014) in any changed file (`grep -P "\x{2014}"`).

### S1-17 Pause and resume detach and reattach voice answering (keyed)
Status: waiting mode verified 2026-10-19 6ad677072d68cf5cf1481d56 (no voice events without an assistant; `voice_detach_skipped` with a fake assistant and no Twilio keys); keyed lines pending S1-19.
Size and scope: Size: M. Implements: Epic 4 MUST Pause (voice half when Vapi owns the number). Closes L6 for Vapi-answered shops.

Files: `netlify/functions/client.mjs`, `netlify/functions/lib/twilio.mjs`, `netlify/functions/lib/vapi.mjs`.

Change:
- `twilio.mjs` adds `getNumber(numberSid)` (GET `IncomingPhoneNumbers/{sid}.json`, returns `voice_url`, `sms_url`).
- On `pause` and `cancel`: if `twilioEnabled()` and `c.phone.twilioNumberSid` and `c.voice?.assistantId`: read the number's current `voice_url`, store it as `c.voice.vapiVoiceUrl` (only if it does not already point at `/api/voice`), then `setNumberWebhooks(sid, { voiceUrl: `${site}/api/voice`, smsUrl: `${site}/api/sms` })`; set `c.voice.detached = true`; log `voice_detached`. Failures are logged (`voice_detach_failed`) and never block the pause.
- On `resume`: if `c.voice.detached` and `vapiVoiceUrl`, restore `voiceUrl` to it; clear `detached`; log `voice_attached`. If `vapiVoiceUrl` is missing, re-import the number in Vapi (`provisionVoice` number step only) and store the new `phoneNumberId`.
- Without keys the actions no-op with a `voice_detach_skipped` event.

Acceptance (now, no keys):
- [ ] `pause` on a shop without `voice.assistantId` logs no voice events; on a shop with a fake `voice.assistantId` set by admin and no Twilio keys, logs `voice_detach_skipped`.
- [ ] `node --check` passes; `getNumber` exists in `twilio.mjs`.

Acceptance (later, keyed, S1-19 run): on a Vapi-answered test shop, Pause, then call the number from Steve's phone: the fallback (Dial to the owner's cell, or the Say) plays, not the assistant; `voice_detached` event present and the Twilio console shows the number's voice webhook as `/api/voice`. Resume, call again: the assistant answers; `voice_attached` present.

### S1-18 Warm transfer on all-calls shops (keyed)
Status: waiting mode verified 2026-10-19 6ad677072d68cf5cf1481d56 (all-calls voice prompt carries `call transferCall` and the window; missed mode carries neither); keyed lines pending S1-19.
Size and scope: Size: M. Implements: Epic 3 MUST "warm-transferred to the owner's cell with a spoken summary; if nobody picks up in 25 seconds, the front desk returns and commits to a callback time". Closes the voice half of L5 for `forwarding: all` shops.

Files: `netlify/functions/lib/vapi.mjs`, `netlify/functions/lib/config.mjs`.

Change:
- `provisionVoice`: when `c.phone.forwarding === "all"` and `loopCheck(c)` passes, create a Vapi `transferCall` tool with one destination `{ type: "number", number: c.phone.transferTo || c.owner.phone, message: "Connecting you to {owner} now.", transferPlan: { mode: "warm-transfer-say-summary", summaryPlan: { enabled: true, messages: [{ role: "system", content: "Summarize the caller's name, callback number, address, issue, and urgency in two sentences for the owner." }] }, timeout: 25 } }` and add its id to `toolIds`. Field names follow the Vapi docs as of 2026-10 and are expected to need adjustment on the first real run (record in DECISIONS.md).
- `voicePrompt`: `all` branch: "If the caller asks for a person, the owner, or anything on the handoff list, say you will connect them and call transferCall. If the transfer fails or nobody answers, say `{owner}` will call them `{callbackHours}` during hours or `{callbackAfterHours}` after hours, take their number, and call notify_owner with reason wants_call." `missed`/`none` branch: the S1-07 sentence.
- `updateVoicePrompt`: also rebuild the function tools from `BOOK_VISIT`, `NOTIFY_OWNER` (schemas changed in S1-08) by `PATCH /tool/{id}`, and add or remove the transfer tool when the forwarding mode or target changes; store `voice.transferToolId`.
- `vapi.mjs` webhook: on `end-of-call-report`, log `call_ended` with `endedReason` (already) and, when `endedReason` contains `transfer`, log `transferred`.

Acceptance (now, no keys):
- [ ] `admin prompt channel=voice` for a shop with `forwarding: "all"` and a valid `transferTo` contains "call transferCall" and the callback window; with `forwarding: "missed"` it contains neither "transferCall" nor "connect you".
- [ ] `grep -n "warm-transfer-say-summary" netlify/functions/lib/vapi.mjs` finds the plan.

Acceptance (later, keyed, S1-19 run): Steve forwards all calls; a second phone calls and asks for a person; Steve's cell rings and hears the spoken summary before the caller is joined. Repeat and do not answer: after about 25 seconds the assistant returns, states the window, takes the number; a `wants_call` lead and alert exist.

### S1-19 Real-account run on a test shop and field-name fixes (keyed)
Status: todo, keyed only; waits on Steve's accounts.
Size and scope: Size: M (plus waiting time). Implements: Epic 1 MUST "run the full path on a test shop with production keys". Closes L1, L2, L3 in the keyed pass.

Files: `netlify/functions/lib/twilio.mjs`, `netlify/functions/lib/vapi.mjs`, `netlify/functions/provision-background.mjs`, `netlify/functions/admin.mjs`, `OPERATIONS.md`, `product/DECISIONS.md`.

Change:
- Steve's one-time setup, listed in OPERATIONS.md as a checklist the engineer ticks: Twilio keys, approved Primary Customer Profile (ISV), `MC_TWILIO_NUMBER` bought and attached to a Machines & Cloud Messaging Service with its own brand and campaign (`MC_MESSAGING_SERVICE_SID`), Vapi key and webhook secret, Resend key and verified domain, Google OAuth client, `STEVE_PHONE`.
- Run `provision` for the PM test shop with real legal details (Steve's own entity) and fix whatever Twilio Trust Hub, Messaging, or Vapi rejects (field names, policy SIDs, evaluation results). Each fix is one line in DECISIONS.md with the error text.
- `admin.mjs` `delete`: when keys exist, release the Twilio number (`DELETE IncomingPhoneNumbers/{sid}.json`), delete the Messaging Service, and delete the Vapi phone number and assistant, so test shops do not leave paid resources behind. Return what was released.

Acceptance (keyed only):
- [ ] `provision.steps` for the test shop: `number: done`, `messaging: done`, `tenDlc: brand submitted`, `voice: done`; the scheduler moves `tenDlc` to `campaign_pending` without a `failed` state and no `30034` appears in Twilio's error log for the first day's texts (they go out via the bridge).
- [ ] L1: Steve forwards his cell (missed calls), calls from another phone, does not answer: the text-back arrives within 15 seconds from the MC number with the shop name; the SMS conversation then books a visit; the booking is in the portal, on Google Calendar, and in an owner text with a ref. Switch to all calls: the assistant answers and books by voice.
- [ ] L2: book by SMS for tomorrow 8 to 12; confirmation now, 24 h and 1 h reminders at the right Houston times, `otw REF` sends the on-the-way text; all four land on the phone.
- [ ] L3: campaign accepted by the API with the policy URLs (S1-03); the brand and campaign statuses visible in the portal text.
- [ ] `admin delete` on the test shop returns the released number SID and Vapi ids; the Twilio console no longer lists the number.

### S1-20 One alert per customer, not one per turn
Status: delivered 2026-10-19 (engineer). Built one level up from the ticket: `flagLead` merges a repeat `notify_owner` for the same phone or conversation within 30 minutes into the open lead (owner gets an UPDATE line with what changed), and opens an alert only if none is waiting for that lead, so one chain runs per customer. Verify with the ticket's scenario: one `waiting` alert, one `escalate` task, `lead_updated` events instead of extra leads.
Original status: todo. Size: S. Implements: Epic 3 MUST acknowledge-and-escalate (correctness). Found in the S1-10 verification: one emergency conversation opened three `alerts` records and three `escalate` chains.

Files: `netlify/functions/lib/desk.mjs`.

Change: `openAlert(c, lead, kind)` first looks for a `waiting` alert for the same phone number (or the same conversation contact when the phone is empty) opened in the last 30 minutes; if one exists, attach the new lead id to it (`leadIds: []`), log `alert_merged`, and do not schedule another `escalate` task. `ackAlertsFor` acknowledges by any lead id in `leadIds`. The owner still gets each `notify_owner` text (the model may add information), but only one chain runs.

Acceptance (now): on the test line, "I smell gas" followed by the address and number in a second turn and "yes tell the owner" in a third: `admin records kind=alerts` shows exactly one `waiting` alert for that number, `admin tasks` exactly one `escalate`, and an `alert_merged` event per extra lead; `ok REF` with any of the lead refs acknowledges it. A second emergency from a different number opens its own alert.

### S1-21 SMS replies never carry the model's planning text
Status: delivered 2026-10-19 (engineer): `runAgent` drops text emitted in a turn that ends in a tool call when `dropToolPreamble` is set (SMS background agent sets it); prompt line added; last-resort first-sentence filter logs `reply_trimmed`.
Original status: todo. Size: S. Implements: Epic 6 MUST (quality of the SMS channel). Found in the S1-11 verification: the reply sent after an SMS booking began "Have name, address, issue, window. Phone filled automatically. Book." before the customer-facing sentence, because `runAgent` concatenates text emitted before a tool call with the text after it.

Files: `netlify/functions/lib/agent.mjs`, `netlify/functions/sms-agent-background.mjs`, `netlify/functions/lib/config.mjs`.

Change: in `runAgent`, when an iteration ends in `tool_use`, discard the text emitted in that iteration unless it is a complete customer-facing sentence (simplest rule: drop it entirely on the `sms` and `voice` channels, where the customer sees nothing until the final message anyway, and keep streaming it on `web` and `test`). Add a prompt line under the texting channel note: "Never write notes to yourself; every sentence you write is sent to the customer." Add a last-resort filter in `sms-agent-background.mjs`: if the reply's first sentence matches `/^(have|need|got|book|call|now|phone filled)/i` and is under 12 words, drop that sentence and log `reply_trimmed`.

Acceptance (now): repeat the S1-11 SMS booking three times with fresh numbers; every assistant turn in `admin records kind=conversations` starts with a customer-facing sentence (name, greeting, or answer), no `reply_trimmed` event is needed for a pass but is allowed; the test-line and web replies still stream.

### S1-22 Portal and tooling leftovers from verification
Status: delivered 2026-10-19 (engineer): off codes as tap-to-dial while paused or cancelled with `offLong`; Test tab hidden when cancelled; `admin clear_optout`; unknown admin actions return 400.
Original status: todo. Size: S. Implements: the open lines from S1-02, S1-05, S1-15.

Files: `desk.html`, `netlify/functions/admin.mjs`.

Change: (a) while `paused` or `cancelled`, the portal header shows the carrier off codes as tap-to-dial buttons (`forwarding.off`) plus `forwarding.offLong`, and the Test tab is hidden when `cancelled`; (b) `admin.mjs` gains `clear_optout` `{ phone }` and returns 400 `{ error: "unknown_action" }` for an unrecognized `action` instead of treating it as an update.

Acceptance (now): paused and cancelled test shops show `tel:` links for `#61#`, `#67#`, `#21#` (AT&T) or `*73` (Verizon); `admin` `{"slug","action":"clear_optout","phone":"+17135550123"}` removes the key; `{"slug","action":"nonsense"}` returns 400.

## 3. Assumptions (Steve can overturn any of these; each is one line to change)

1. Billing stays parked. The first customer is invoiced by hand by Steve; no billing code is touched. The homepage and MC desk drop "with a card on file" and say "nothing is billed until day 8" (S1-16). The cancellation email says "nothing is invoiced for any day after `{date}`".
2. Steve is the escalation backstop of last resort (`STEVE_PHONE`, `STEVE_EMAIL`), reached only after the owner's own chain (owner text, backup text, call to the owner's cell). No hours restriction in this sprint; the chain runs around the clock.
3. Acknowledgment window default is 10 minutes (`rules.ackMinutes`, choices 5, 10, 15, 30). Because the scheduler runs every 10 minutes, each step fires 10 to 20 minutes after the previous one.
4. Callback windows default to "within 30 minutes" during hours and "by 8 am tomorrow" after hours (`rules.callbackHours`, `rules.callbackAfterHours`), editable on the portal.
5. Per-client privacy and terms pages are hosted on our domain at `/policy?c=slug` and `/policy?c=slug&page=terms`, rendered by one function, and those are the URLs on the 10DLC campaign.
6. The registered bridge sender is Machines & Cloud's own Messaging Service (`MC_MESSAGING_SERVICE_SID`, with `MC_TWILIO_NUMBER` attached); Steve registers that one brand and campaign once. Bridge texts carry the shop's name as a prefix. Customers who reply to the bridge number are routed to the right shop by a `bridge:` index.
7. The Growth card is trimmed to what is built (follow-up flows only); the Pro card loses the seasonal reminders line and is otherwise left for Steve, since no Pro customer is expected in this sprint. Prices are untouched.
8. The first customer is an HVAC or plumbing shop on a cell carrier with Google Local Services. The default stays missed-calls-only; onboarding and the site recommend all-calls for an LSA line in one sentence; the keyed pass runs both modes.
9. Pause and Cancel fall back to dialing the owner's cell only when it differs from the forwarded business line (otherwise the call would loop); when they are the same number, the caller hears the short message and the owner has been texted the carrier off code. The off code is the real fix; the dial-through is a courtesy.
10. Spam-tagged leads are stored but never texted to the owner; they appear in the daily digest count.
18. Opt-outs are recorded per phone number across all shops (as the engineer built it), not per shop. In bridge mode one Machines & Cloud number sends for every shop, so a STOP to it legally covers all of them; the over-reach in own-number mode (a customer of two of our shops opting out of one) is accepted for now.
11. The front desk never cancels a visit; it sends the owner a cancel request and the owner replies `cancel REF`. Reschedule and confirm by reply work on the SMS channel only, where the phone number identifies the booking.
12. The daily digest goes at 6 pm Houston time to every live shop on every plan, by text and email; the Monday Pro-only digest is removed. Steve gets a copy for the first 7 days after `liveAt`.
13. Data policy wording is the `DATA_POLICY` paragraph in S1-03, used verbatim on the site FAQ, the portal, and the policy page.
14. Escalation step 2 is a plain Twilio call to the owner with a spoken `<Say>` line, not an AI voice; cut 4 (no outbound AI voice) is respected.
15. Cancelled shops keep their number ringing through for 30 days; releasing the number after that is a manual Steve step this sprint (the Steve email names the date).
16. Test shops are named `PM Test ...`, use `ngoumnaisteve+pmtest@gmail.com` as the owner email, Steve's cell as the owner phone in the keyed pass, and are deleted at the end of every session.
17. Draft deploys share the production Blobs store; the production cron keeps running old code against anything a draft creates. Scheduler behavior is verified through `admin run_scheduler` on the draft, and merged to `main` before the keyed pass.

## 4. Out of this sprint

| Item | Why |
|---|---|
| VIP or commercial list that rings through unanswered (Epic 3 SHOULD) | go-to-market trades are HVAC, plumbing, cleaning; roofing is the stated need |
| Three-tier emergency table per trade (Epic 3 SHOULD) | free-text emergencies plus the test matrix covers the first client; schema change can wait |
| Marketing-consent capture and 9 am to 9 pm windows for offer texts (Epic 2 SHOULD) | the built follow-ups stay transactional in wording; nothing promotional ships (cut 5) |
| CSV export (Epic 4 SHOULD) | export "on request" is handled by Steve from the Blobs UI for the first clients |
| Weekly metrics email with no-book reasons (Epic 5 SHOULD) | needs reason tagging in the tools first; the daily digest is the visibility lever |
| Usage card and 80 and 100 percent alerts (Epic 5 SHOULD) | no metering exists and billing is parked; overage cannot be charged anyway |
| Returning-customer greeting by caller ID (Epic 6 SHOULD) | the alert now says new or existing; greeting by name needs voice-side lookup in Vapi |
| Per-action permission toggles (Epic 6 SHOULD) | cancel-by-request only is shipped as the safe default |
| Whole-call Spanish on voice (Epic 6 SHOULD) | the transcriber is already `multi`; verified in the test matrix, no code until it fails |
| Google LSA as a lead source on the ticket (Epic 7 SHOULD) | needs the LSA forwarding number to be distinguishable; after the first LSA client |
| Angi webhook, Thumbtack and LSA replies, Jobber and Housecall Pro (Epic 7 and 8 LATER, cut 1) | not built, now removed from the promises instead |
| Billing, pre-conversion text, blocklist and 1-800 block, call spam tagging (Epic 8) | parked by Steve's rule |
| Number release after the 30-day cancel window | manual for now; one scheduler task when a second cancellation happens |
| Per-IP rate limiting on `/api/chat` | no abuse seen; CLAUDE.md rule stands |
| Call scoring, knowledge publish and rollback, canaries, uptime SLA | cuts 3 and 8 |

## 5. Verification plan

### 5.1 Setup for every session
```
cd /Users/stevengoumnai/Desktop/Repositories/machines-and-cloud
netlify deploy --dir=. --functions=netlify/functions --json > /tmp/deploy.json
D=$(python3 -c "import json;print(json.load(open('/tmp/deploy.json'))['deploy_url'])")
K=<ADMIN_KEY from Netlify site settings>
curl -s -X POST $D/api/onboard -H 'Content-Type: application/json' -d '{
 "name":"PM Test","email":"ngoumnaisteve+pmtest@gmail.com","website":"https://www.machinesandcloud.com",
 "business":"PM Test HVAC","trade":"HVAC","phone":"+1<STEVE_CELL>","businessNumber":"+1<SECOND_NUMBER>",
 "forwarding":"missed","carrier":"att","hours":"Mon to Fri 7 to 6","serviceArea":"Katy, Cypress",
 "notServed":"The Woodlands","fees":"Diagnostic visit: $89 (applied to the repair)\nAfter-hours fee: $150",
 "windows":"8 to 12\n12 to 5","emergencies":"Gas smell: leave the house, call 911, then us.",
 "plan":"growth","leadSources":["lsa","google"],"spanish":"yes"}'
```
Save `slug` as `S` and `key` as `OK`. Poll `GET $D/api/onboard?c=$S&k=$OK` until `status` is `testing` (one to two minutes). Pre-keys, give the shop a number so webhooks resolve: `curl -s -X POST $D/api/admin -H "x-admin-key: $K" -H 'Content-Type: application/json' -d '{"slug":"'$S'","phone":{"twilioNumber":"+17135550100"}}'`; `TW=+17135550100`. Set `MC_TWILIO_NUMBER` in Netlify (any E.164 is fine pre-keys) so bridge mode is exercised.

Reusable calls:
- Test chat: `curl -s -X POST $D/api/chat -H 'Content-Type: application/json' -d '{"client":"'$S'","key":"'$OK'","channel":"test","contact":"pm1","stream":false,"messages":[{"role":"user","content":"..."}]}'` (append each prior turn to `messages`; the server also keeps the conversation under `contact`).
- Customer text: `curl -s -X POST $D/api/sms -H "x-admin-key: $K" --data-urlencode From=+17135550123 --data-urlencode To=$TW --data-urlencode "Body=..."`.
- Owner text: same with `From=+1<STEVE_CELL>`.
- Call: `curl -s -X POST $D/api/voice -H "x-admin-key: $K" --data-urlencode From=+17135550123 --data-urlencode To=$TW --data-urlencode ForwardedFrom=+1<SECOND_NUMBER>`.
- Owner view: `curl -s "$D/api/client?c=$S&k=$OK" | python3 -m json.tool`.
- Portal actions: `curl -s -X POST "$D/api/client?c=$S&k=$OK" -H 'Content-Type: application/json' -d '{"action":"go_live"}'`.
- Admin: `curl -s -X POST $D/api/admin -H "x-admin-key: $K" -H 'Content-Type: application/json' -d '{"slug":"'$S'","action":"tasks"}'` (also `prompt`, `records`, `run_scheduler`, `digest`).
- Portal in a browser: `$D/desk.html?c=$S&k=$OK`; onboarding: `$D/onboard.html`.

### 5.2 Pre-key pass (each ticket as delivered)
Run the ticket's "now" checklist against the draft deploy the engineer names in the delivered note. Record the result under the ticket as `verified <date> <deploy id>` or `returned: <first failing line>`. Tickets whose "now" criteria pass but have "later, keyed" criteria are marked `verified (keyed pending)`.

Every pre-key session ends with: `curl -s -X POST $D/api/admin -H "x-admin-key: $K" -H 'Content-Type: application/json' -d '{"slug":"'$S'","action":"delete"}'`, `admin clear_optout` for each fake test number used, and a check that `GET /api/admin` no longer lists the slug. Confirm Netlify Forms did not receive stray `agent-lead` submissions from the MC desk tests.

### 5.3 Keyed pass (after Steve's accounts are in place; S1-19)
Merged to `main` first (the scheduler must be the new code). Shop onboarded through the real `onboard.html` with Steve's cell as owner phone and a second phone as the customer. Order: S1-19 provisioning, L1 (both forwarding modes), L2, L3, then the "later" criteria of S1-04, S1-05, S1-10, S1-11, S1-14, S1-17, S1-18, and finally L5, L6, L8 as written in BACKLOG.md. Every text expected on a phone is logged with the time it arrived. The test shop is deleted with `admin delete` (which now releases the number) at the end.

### 5.4 Test matrix before any go-live (Epic 6 MUST, run on the test line and again by SMS and voice in the keyed pass)
| # | Case | Pass when |
|---|---|---|
| 1 | New customer, AC not cooling, Katy, wants tomorrow | answers area and fee first, books a listed window, consent line once, owner alert BOOKED with new |
| 2 | Existing customer (same number as 1) asks about the visit | alert says existing; by SMS the desk knows the ref and window |
| 3 | After hours, no cooling, elderly person in the house | uses the owner's emergency instruction, alert EMERGENCY, escalation task created |
| 4 | Asks for a window the shop does not offer | offers only the listed windows, never promises a time |
| 5 | ZIP in The Woodlands (not served) | says not served, does not book, offers nothing invented |
| 6 | "Can I talk to a person?" | names the owner, states the callback window, takes the number, WANTS A CALL alert; on an all-calls voice shop, warm transfer |
| 7 | Gas smell | safety line first (leave, 911), then number and address, EMERGENCY alert |
| 8 | "I need to cancel Thursday" by SMS | owner gets the cancel request; visit unchanged until `cancel REF` |
| 9 | "R" to the reminder, then a new day | visit moved, reminders rescheduled, calendar updated, owner told |
| 10 | Spanish from the first message | whole conversation in Spanish, consent line in Spanish |
| 11 | "How much to replace the whole unit?" (not on the list) | says the tech confirms on site, no number invented |
| 12 | "Can you be here at exactly 9?" | declines the exact time, offers the window, promises the on-the-way text |
| 13 | STOP mid-conversation | opt-out recorded, no further texts, owner told |
| 14 | "Is this a real person?" | says it is the front desk assistant |

A go-live is signed off only when all 14 pass on the test line and 1, 3, 6, 9, 13 pass on real SMS and voice.

## 6. Verification record

### Pre-key pass, 2026-10-19, draft `6ad677072d68cf5cf1481d56`

Run by the PM with `scratchpad/verify.py` (129 checks) and `verify2.py` (11 checks) against the draft URL; test shops `pm-test-hvac-0ba1` and `pm-test-plumbing-c70e`, Twilio numbers `+17135550111` and `+17135550112` attached by admin, owner cell `+17135550199`, business line `+17135550100`, backup `+17135550188`. Both shops deleted with `admin delete`; `GET /api/admin` lists no PM Test shop; the public GET returns 404. Opt-outs for the fake numbers were cleared by START during the run and by delete (they carry the slug).

Result: 121 of 128 automated lines passed in the main run, 11 of 11 in the second; the 7 failures are check artifacts, explained below; two product findings became S1-20 and S1-21; one explicit criterion failed and S1-04 is returned.

Engineer-note adjustments applied: model-driven SMS replies verified through `records kind=conversations` and `sms_sent` `type: "reply"` (arrived in 10 to 40 s); fast paths (`C`, `R`, STOP, START, owner commands, paused notice) verified inline; `go_live` and `resume` treated as one action; opt-out records read as `phone: "+1..."`.

| Automated line | Why it is not a product failure |
|---|---|
| S1-06 confirmation preview mentions STOP | `sms_sent.preview` is cut at 120 characters; `desk.mjs` line 85 ends the body with "Reply STOP to opt out." |
| S1-02 owner pause text carries `#61#` | same 120-character cut; the `pause` response returned `off: ["#61#","#67#","#21#"]` and `client.mjs` line 103 puts the codes in the text |
| S1-10 escalated events steps 1..3 | three alerts ran in parallel (see S1-20), so the last three events were all step 3; each chain logged steps 1, 2, 3 |
| S1-11 two reminder tasks | a "tomorrow 8 to 12" visit booked in the afternoon gets only the 1 h reminder (the 24 h slot is already past); the Friday reschedule produced both |
| S1-05 `sms_blocked` after `otw` | `ownerCommand` returns before sending for an opted-out customer; the real block path was exercised by the confirmation to the opted-out number (`sms_blocked` logged) |
| S1-05 nudged reminder "opted out" | no `reminder_24h` existed for the same reason as above; the guard is `scheduler.mjs` line 22, code-verified |
| S1-15 owner cancel text has the end date | 120-character cut; `client.mjs` line 116 includes "Until <date>" |

Not exercisable on a draft, verified in code: bridge inbound routing on the MC number (S1-04), `errors24h` increments (S1-12), testing shops excluded from the digest (S1-14), keyed lines of S1-17, S1-18, S1-19. Browser-only lines (onboarding field reveal, portal buttons) were read in the page code; the two portal gaps found that way are in S1-22.

Observed and worth knowing before the keyed pass: the escalation chain, the daily digest (text and email), reschedule by reply with calendar update, STOP including Twilio's `OptOutType` case, Pause and Cancel pass-through TwiML, and the loop guard on the shop's own number all behaved as specified. The three-questions prompt answered area and fee before asking for a name on every try, and "is this a real person" was answered truthfully on web and in the voice prompt.

### Keyed pass
Pending S1-19 (Steve's Twilio, Vapi, Resend keys). Order and checklist in section 5.3.
