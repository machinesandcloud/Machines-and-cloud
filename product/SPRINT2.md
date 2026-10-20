# Sprint 2: first customer live, and the four things that were wrong

Owner: Product Manager. Cut from `BACKLOG.md` Round 2 (2026-10-19 evening) and the sprint 1 verification record (`SPRINT.md` section 6). Same working rules as sprint 1: engineer builds in order, marks `delivered` with a verification note; the PM runs the checklist and records `verified` or `returned` with the failing line; trade-offs go to `DECISIONS.md`.

Status legend: `todo` | `in progress` | `delivered` | `verified` | `verified with follow-up` | `returned`.

## 1. Sprint goal

Put the first paying shop on the line with real keys (L1, L2, L3, L5 closed on Steve's phone), remove the four things Round 2 found wrong for the customer (the "Yes" opt-in bug, the one-phone LSA dead end, the heavy wants-a-call chain, the noisy quiet-day digest), and ship the three servicing features a second customer asks for first (greeting a returning caller, a VIP bypass list, a usage meter), with CSV export making the data policy true.

Launch conditions still open from sprint 1 and what closes them:

| Condition | Closed by |
|---|---|
| L1 forwarded call reaches the desk; voice books, or text-back in 15 s | S2-01 (keyed pass), S2-03 (ring timer on AT&T and T-Mobile) |
| L2 book by SMS; confirmation, 24 h, 1 h, on-the-way all land | S2-01 |
| L3 10DLC filed without rejection; bridge sender until approval | S2-01 |
| L5 ask for a person: callback window or warm transfer; escalation when ignored | S2-01, S2-03, S2-04 |

Sizes: S up to half a day, M up to a day and a half. Total about 12 engineer-days including the 2.5-day reservation. Cut line: S2-11 and S2-12 slide first, then S2-10.

Sprint rules carried over: every new store kind extends `admin.mjs` `delete`; every outbound text goes through `sendSMS` with `client`; copy rules from CLAUDE.md; `node --check` and `python3 -I scripts/sitecheck.py .` before `delivered`; new admin hooks are added to section 5 of this file when a ticket needs one.

## 2. Tickets

### S2-01 Keyed pass: real Twilio, Vapi, Resend accounts on a test shop, and the field fixes it forces
Status: todo. Size: reserve 2.5 days (not a build ticket; the PO's item 0). Implements: sprint 1 S1-17, S1-18, S1-19 keyed lines; Epic 1 MUST "prove the pipes".

Files: whatever Twilio Trust Hub, Messaging, and Vapi reject: `netlify/functions/lib/twilio.mjs`, `netlify/functions/lib/vapi.mjs`, `netlify/functions/provision-background.mjs`, `netlify/functions/vapi.mjs`, `product/DECISIONS.md`, `OPERATIONS.md`.

Change: Steve's one-time setup (OPERATIONS.md checklist: Twilio keys, approved ISV Primary Customer Profile, `MC_TWILIO_NUMBER` in a registered Messaging Service as `MC_MESSAGING_SERVICE_SID`, Vapi key and `VAPI_WEBHOOK_SECRET`, Resend key with verified domain, `STEVE_PHONE`). Engineer provisions the PM test shop with Steve's own legal entity, fixes every rejected field (one DECISIONS.md line per fix with the error text), and runs the S1-17 and S1-18 keyed lines. The ring-timer codes from S2-03 are dialed on a real AT&T or T-Mobile SIM and the result recorded.

Acceptance (keyed; the PM runs these with Steve's phone):
- [ ] `provision.steps`: `number: done`, `messaging: done`, `tenDlc: brand submitted`, `voice: done`; the scheduler moves `tenDlc` to `campaign_pending` without `failed`; the Twilio console shows the campaign with both policy URLs.
- [ ] L1 missed mode: Steve's cell forwards with the `**15#` code; a call from a second phone rings about 15 seconds, then the text-back arrives on that phone within 15 seconds from the MC number with the shop name. L1 all mode: the assistant answers and books; the booking is in the portal, on Google Calendar, and in the owner text with a ref.
- [ ] L2: book by SMS for a day after tomorrow 8 to 12; confirmation now, 24 h and 1 h reminders at the Houston times, `otw REF` on-the-way text; all four land.
- [ ] L3: no 30034 in Twilio's error log on day one; after `tenDlc: approved` the next text comes from the shop's number and `sender_switched` is logged.
- [ ] L5: "can I talk to a person" on SMS and on voice gets the callback window (missed mode) or a warm transfer with a spoken summary (all mode with a transfer target); an ignored emergency text escalates to the backup phone and then rings Steve's cell with the spoken line.
- [ ] S1-17: Pause on the Vapi-answered shop plays the fallback; Resume brings the assistant back; `voice_detached` and `voice_attached` events exist.
- [ ] `admin delete` releases the number and the Vapi assistant (`released` names them) and the Twilio console no longer lists the number.
- [ ] DECISIONS.md has one line per field fix; OPERATIONS.md "Steve's one-time setup" is a ticked checklist.

### S2-02 "Yes" is an answer, not an opt-in (M1)
Status: verified 2026-10-19 6ad67daca202d234da481d56 (the first and second lines; the opted-out START line was verified in sprint 1). Size: S. Implements: Round 2 M1.

Files: `netlify/functions/sms.mjs`.

Change (as built): `START_RE` (`start|unstop|yes`) is tested only inside the `optedOut(from)` branch, so a subscribed customer's "Yes" reaches the fast paths and the model; the `yes` confirm fast path (one upcoming visit) is live again.

Acceptance (now, draft):
- [ ] From a fresh number: "Hi, my water heater is leaking a little", then "Yes": the second turn gets a model reply (`sms_sent` `type: "reply"`), no `opt_in` event, no "subscribed again".
- [ ] From a number with exactly one upcoming visit: "yes" returns the inline "confirmed for" message and a `confirmed` event.
- [ ] From an opted-out number: "START" still returns "subscribed again" and clears the opt-out; "Yes" does the same (carrier-standard).

### S2-03 All calls without a second phone, ring-time codes, honest LSA advice (M2)
Status: verified with follow-up 2026-10-19 6ad67daca202d234da481d56: onboarding 200 without a transfer target, voice prompt without transferCall, AT&T `**15#` code, Verizon note; the copy greps and the MC desk line are static and were read in the files (FAQ, onboarding hint, `MC_SYSTEM`); the escalation-call delta is built in S2-04; the ring timer on a real SIM waits for S2-01. Size: M. Implements: Round 2 M2 (a), (b), (c); Epic 7.

Files: `netlify/functions/lib/config.mjs` (`loopCheck`), `netlify/functions/lib/vapi.mjs` (`voicePrompt`, `provisionVoice`, `updateVoicePrompt`), `netlify/functions/lib/forwarding.mjs` (`CARRIERS`), `index.html` FAQ, `onboard.html` step 5 hint, `netlify/functions/chat.mjs` `MC_SYSTEM`.

Change (as built): `loopCheck` rejects a transfer target only when one is given and equals the business line; with `forwarding: "all"` and no `transferTo` there is no transfer tool and the voice prompt uses the callback-window sentence. AT&T and T-Mobile missed-call codes carry the 15-second no-answer timer (`*61*1{n}**15#`, `**61*1{n}**15#`); the Verizon note says `*71` has no timer. Site FAQ, onboarding hint, and MC desk say: answer inside 20 seconds; AT&T and T-Mobile get the 15-second ring; on Verizon forward all calls on that line; leave the transfer number blank if your cell is the forwarded line.

Acceptance (now, draft):
- [ ] `POST /api/onboard` with `forwarding: "all"`, `phone` equal to `businessNumber`, no `transferTo` returns 200; `admin prompt channel=voice` for that shop contains "within 30 minutes" and not "transferCall".
- [ ] `GET /api/client?c&k` `forwarding.codes` for an AT&T shop in missed mode is `["*61*1<number>**15#", "*67*1<number>#"]`; T-Mobile `["**61*1<number>**15#", "**67*1<number>#"]`; Verizon `["*71<number>"]` with `note` containing "no ring-time".
- [ ] `grep -c "Choose 'All of them'" onboard.html index.html` is 0; the FAQ answer and the onboarding hint both contain "15-second" and "Verizon"; `MC_SYSTEM` contains "answered inside 20 seconds".
- [ ] The MC desk (`POST /api/chat`, `stream:false`) "I run Google LSA ads and my cell is my business line, what should I pick?" answers missed calls with the 15-second ring (or all calls on Verizon) and does not tell the owner to buy a second phone.

Acceptance (keyed, S2-01): the `**15#` code is accepted by a real AT&T or T-Mobile SIM and the forwarded call reaches `/api/voice` about 15 seconds after the first ring; the result (works, refused, or different timing) goes in DECISIONS.md and, if refused, the code falls back to the plain `*61*1{n}#` with the note updated.

### S2-04 Escalation chain by kind: light for wants-a-call, full for emergencies, no self-calls (W1 + M2 delta)
Status: verified 2026-10-20 6ad687c6cfa858f714553022: wants_call chain ran backup text then customer window and exhausted with 2 entries, no call and no Steve step, `fallback_window` sent; emergency on a two-phone shop ran backup, `call (logged)`, `customer told window, Steve notified`; on an all-calls shop without a transfer target step 2 read `call replaced by text (forwarded line)` and the owner got a `Second notice` text; the You card note is in `desk.html`.
Size and scope: Size: S. Implements: Round 2 W1; the M2 (a) sentence "escalation skips the call step and texts twice" which `runEscalation` does not do yet.

Files: `netlify/functions/lib/desk.mjs` (`runEscalation`, `openAlert`), `desk.html` (You card copy).

Change:
- `runEscalation` branches on `a.kind`. `wants_call`: step 1 texts the backup (or skips), step 2 texts the customer the fallback window and marks the alert `exhausted`; no call, no Steve. `emergency`: step 1 backup text, step 2 call, step 3 customer window plus Steve (as today), except that when the owner's cell is the forwarded line (`forwarding === "all"` with no `transferTo`, or `owner.phone === phone.businessNumber`) the call would bounce back to the front desk, so step 2 becomes a second owner text ("Second notice: ...") and `how` reads `"call replaced by text (forwarded line)"`.
- `openAlert` stores `kind` as today; the owner-text line "Reply ok REF to acknowledge" stays on both kinds.
- Portal You card note under "Acknowledge urgent alerts within": "Emergencies: backup text, then a call to your cell, then Steve. Callback requests: backup text, then the customer is told the window."

Acceptance (now, draft; nudge with `admin nudge_task`, run with `admin run_scheduler`):
- [ ] Test line "can I talk to a person" plus a number: `wants_call` alert; two runs give `["escalate","step 1: backup texted (logged)"]` then `["escalate","step 2: customer told window"]`; the alert is `exhausted` with 2 history entries; no `escalated` event with `how` containing "call"; no Steve email line in the function log for it; a `fallback_window` `sms_sent` exists.
- [ ] Test line "I smell gas" plus address and number on a missed-mode shop whose owner cell differs from the business line: three runs give backup text, `call (logged)`, `customer told window, Steve notified`; `exhausted` with 3 entries.
- [ ] Same emergency on a shop with `forwarding: "all"` and no `transferTo`: step 2 `how` is `"call replaced by text (forwarded line)"` and the owner got a second `owner_alert` `sms_sent` whose preview starts with "Second notice".
- [ ] Portal You card shows the two-line note.

### S2-05 "cancel" with a visit asks the owner; "existing customer" means a real customer (W3 + W2)
Status: verified with follow-up 2026-10-20 6ad687c6cfa858f714553022: `cancel` from a booked number replied "unsubscribed ... We've told Dana Whitfield about your visit", logged `opt_out` and `cancel_requested`, texted the owner "wants to cancel", left the booking `booked` with no reminders; `STOP` from another booked number gave `opt_out` only; a number with only leads reads "(new)" and the S2-07 lookup for the same number read "existing customer" after `done REF`. The one failed line: a second callback request from that number inside 30 minutes was merged into its still-open lead (S1-20) and the UPDATE text kept the lead's original "(new)"; follow-up S2-14. The past-visit rule was verified in code only.
Size and scope: Size: S. Implements: Round 2 W3 and W2.

Files: `netlify/functions/sms.mjs` (STOP branch), `netlify/functions/lib/desk.mjs` (`customerType`, `cancelRequest`).

Change:
- STOP branch: after recording the opt-out, if `upcomingBookings(c, from)` is non-empty and the body matched `cancel` (not `stop` or the others), call `cancelRequest(c, b)` for each upcoming visit (owner text "NEEDS ACTION ... wants to cancel ref X") and append to the confirmation text "We've told `{owner}` about your visit." The customer gets no further texts (opted out); the owner decides with `cancel REF`.
- `customerType(slug, phone)` returns `existing` only when a booking for that phone has `status` in `done`, `paid`, or its `visitDate(date)` is before today and status is not `cancelled`; leads never count. The 10-minute rule goes away.

Acceptance (now, draft):
- [ ] Book by SMS from a fresh number, then text `cancel`: reply contains "unsubscribed" and "told"; events include `opt_out` and `cancel_requested`; owner `sms_sent` preview contains "wants to cancel"; the booking status is unchanged; `admin tasks` has no reminders for it.
- [ ] Text `STOP` from another number with a booking: `opt_out`, no `cancel_requested`.
- [ ] Test-line lead from a number that only has a spam lead and an open lead older than 10 minutes: the alert says "(new)". Mark that number's booking `done` by owner text `done REF`, then a new test-line lead: "(existing customer)". A booking dated yesterday (set by admin `records` edit or a booking with `date` in the past) also counts.

### S2-06 Quiet days by email only, and a text-off switch (W4)
Status: verified 2026-10-20 6ad687c6cfa858f714553022: empty day logged `digest` with `empty: true`, `texted: false` and no `sms_sent` digest; a day with records texted and emailed with `texted: true`; `PUT {"digest":{"text":false}}` stopped the text and `GET` shows it.
Size and scope: Size: S. Implements: Round 2 W4.

Files: `netlify/functions/scheduler.mjs`, `netlify/functions/lib/desk.mjs` (`dailyDigest` returns `empty: true`), `netlify/functions/client.mjs` (PUT accepts `digest.text`), `netlify/functions/lib/config.mjs` (`digest: { text: true }` on `newClient`), `desk.html` (toggle on the You card).

Change: when `dailyDigest` reports an empty day, the scheduler sends the email only (no `sms_sent` `type: "digest"`); when the owner has `digest.text === false`, the text is never sent and the email always is; Steve's 7-day copy is unchanged. Portal: "Daily digest by text" checkbox under You, saved with the config.

Acceptance (now, draft):
- [ ] Fresh live shop, `admin run_scheduler force_hour=18`: a `digest` event exists, the function log shows the email, and there is no `sms_sent` `type: "digest"`.
- [ ] After one booking the same Houston day, the same run produces the `sms_sent` `type: "digest"` and the email.
- [ ] `PUT` `{"digest":{"text":false}}` then the same run: email only; `GET` shows `client.digest.text` false; the portal checkbox reflects it.

### S2-07 Returning caller on voice: greet by name, know the visit
Status: verified 2026-10-20 6ad687c6cfa858f714553022 (assistant id set by admin): known number returned `customerName` "Tom", `isExisting` "existing customer", a `firstMessage` greeting by name; a number with a visit tomorrow got "your visit is tomorrow, 12 to 5, for the ..."; unknown number got the standard greeting with empty values; the voice prompt carries `{{customerName}}`; a detached shop gets the Vapi error message. `VAPI_WEBHOOK_SECRET` is not set in Netlify yet (a wrong secret still got 200), so that line waits for S2-01 setup; the keyed greeting waits for S2-01.
Size and scope: Size: M. Implements: Round 2 item 6; Epic 6 SHOULD "returning customer recognized".

Files: `netlify/functions/vapi.mjs` (handle `assistant-request`), `netlify/functions/lib/vapi.mjs` (`provisionVoice` registers the number with `server.url` and no fixed `assistantId`, or keeps the assistant and sets `assistantOverrides` from the request; prompt gains `{{customerName}}` and `{{upcomingVisit}}` placeholders), `netlify/functions/lib/desk.mjs` (`callerContext(c, phone)`).

Change: on a Vapi `assistant-request` for the shop's number, look up the caller: name from the most recent booking or lead with that phone, upcoming visit from `upcomingBookings`. Respond with `{ assistantId, assistantOverrides: { variableValues: { customerName, upcomingVisit, isExisting }, firstMessage } }` where `firstMessage` is "Thanks for calling `{name}`. This is the front desk assistant. Hi `{customerName}`, your visit is `{date}`, `{window}`. How can I help?" when a visit exists, "Hi `{customerName}`, how can I help today?" when only the name is known, and the standard greeting otherwise. The voice prompt gains "The caller is `{{customerName}}` (`{{isExisting}}`); upcoming visit: `{{upcomingVisit}}`; use it, do not ask for it again." Unknown callers get empty values. Vapi variable syntax and the `assistant-request` shape follow the docs as of 2026-10 and may need fixes in S2-01.

Acceptance (now, draft; the Vapi payload is simulated with curl):
- [ ] `POST /api/vapi` with `{ "message": { "type": "assistant-request", "phoneNumber": { "number": "<TW>" }, "customer": { "number": "+12815550177" } } }` for a number that booked on the test line returns 200 JSON with `assistantOverrides.variableValues.customerName` "Tom Reyes", `upcomingVisit` containing the date and window, `isExisting` as S2-05 defines it, and `firstMessage` containing "your visit is".
- [ ] The same for an unknown number returns the standard greeting and empty values.
- [ ] With `VAPI_WEBHOOK_SECRET` set in Netlify, the request without `x-vapi-secret` gets 403.
- [ ] `admin prompt channel=voice` contains "{{customerName}}".

Acceptance (keyed, S2-01): calling from Steve's phone after booking on it, the assistant opens with his name and the visit.

### S2-08 VIP and commercial bypass list
Status: verified 2026-10-20 6ad687c6cfa858f714553022: 21 numbers kept 20; the business line on the list returned `loop` on `rules.bypass`; two-phone shop returned Dial cell, Say, Record with the `/api/voice/recorded` action and a `vip_call` event with no `missed_call`; one-phone shop returned Record without Dial; `/api/voice/recorded` logged `vip_voicemail` and texted "VIP voicemail from ... .mp3 (23 s)"; `assistant-request` from the bypass number returned a `destination` on the two-phone shop and a "leave a message" `firstMessage` on the one-phone shop; a VIP text gave an empty Response, a "VIP text from" owner note, and no `sms_inbound`.
Size and scope: Size: M. Implements: Round 2 item 7; Epic 3 SHOULD "VIP list the front desk never answers".

Files: `netlify/functions/lib/config.mjs` (`rules.bypass: []`, up to 20 E.164 numbers; `loopCheck` unaffected), `netlify/functions/client.mjs` (PUT), `netlify/functions/voice.mjs`, `netlify/functions/vapi.mjs` (`assistant-request` returns a transfer destination), `desk.html` (Rules card textarea "Numbers that always ring through to you"), `netlify/functions/sms.mjs` (bypass numbers' texts are forwarded to the owner, not answered).

Change: a call from a bypass number on `/api/voice`: if the owner's cell is not the forwarded line, `<Dial timeout="25">owner cell</Dial>` then `<Say>` "Please leave a message" and `<Record maxLength="120" action="/api/voice/recorded" playBeep="true"/>`; if the cell is the forwarded line (one-phone owner), skip the Dial and record straight away. `/api/voice/recorded` (same function, second path) texts the owner "VIP voicemail from `{number}`: `{RecordingUrl}`" (`type: "owner_note"`) and logs `vip_voicemail`. Vapi-answered shops: `assistant-request` for a bypass number returns `{ destination: { type: "number", number: owner cell } }` when the cell differs from the forwarded line, else the assistant with a `firstMessage` "This is `{name}`. Please leave a message after the tone and `{owner}` will call you back." A text from a bypass number is relayed to the owner ("VIP text from `{number}`: ...") and gets no front-desk reply.

Acceptance (now, draft):
- [ ] `PUT` `{"rules":{"bypass":["+17135550170"]}}` returns 200; a 21st number is dropped; a number equal to the business line is rejected with `loop`.
- [ ] `POST /api/voice` From `+17135550170` on a shop whose owner cell differs from the business line returns `<Dial timeout="25">` the cell, then `<Say>` and `<Record`; no `missed_call` event, no text-back; a `vip_call` event.
- [ ] Same on a one-phone shop: `<Record` without `<Dial`.
- [ ] `POST /api/voice/recorded` with `From`, `RecordingUrl`, `To` logs `vip_voicemail` and an owner `sms_sent` whose preview starts with "VIP voicemail".
- [ ] `POST /api/vapi` `assistant-request` from the bypass number returns a `destination` on the two-phone shop and a `firstMessage` containing "leave a message" on the one-phone shop.
- [ ] `POST /api/sms` from the bypass number: empty `<Response/>`, owner `sms_sent` "VIP text from", no `sms_inbound` model run.

### S2-09 Usage meter with 80 and 100 percent alerts
Status: verified 2026-10-20 6ad687c6cfa858f714553022: a 150-second report gave `minutes: 3, calls: 1`; `texts` equalled the shop's customer-facing `sms_sent` count (6 of 6, owner alerts excluded; logged sends count when Twilio is not configured); on Starter, 121 minutes gave the 80 alert with an owner `sms_sent` `type: "usage"`, 151 the 100 alert, 181 nothing more; `GET` carries `usage` with `month`, `minutes`, `texts`, `calls`, `included`, `overage`; `records kind=usage` works and `delete` removes the store. The overage sentence on the portal card stands as assumption 9 until Steve rules on it.
Size and scope: Size: M. Implements: Round 2 item 8; Epic 5 SHOULD "usage card and alerts". No pause-at-limit, no billing.

Files: `netlify/functions/lib/store.mjs` (`usage` kind, key `{slug}/{YYYY-MM}` Houston month), `netlify/functions/lib/send.mjs` (count a text when `ok`, or when `logged` and Twilio is not configured), `netlify/functions/vapi.mjs` (`end-of-call-report`: minutes = `ceil(seconds / 60)`), `netlify/functions/voice.mjs` (a missed call counts 0 minutes), `netlify/functions/lib/desk.mjs` (`addUsage`, `usageAlerts`), `netlify/functions/client.mjs` (GET `usage`), `desk.html` (Usage card on Setup), `netlify/functions/admin.mjs` (`records kind=usage`, `delete` removes it).

Change: `addUsage(c, { minutes, texts })` increments the month record and, when minutes or texts cross 80 percent or 100 percent of `PLANS[c.plan]`, sends the owner one text and one email per threshold per month ("`{name}`: you've used 80 percent of this month's call minutes (`{used}` of `{included}`). Past the plan it is $0.35 a minute; nothing changes on the line.") and logs `usage_alert`. Owner alerts, escalation texts, and digests are not counted (customer-facing texts only: `reply`, `confirmation`, `reminder_*`, `on_my_way`, `text_back`, `lead_chase`, `review_*`, `quote_check`, `payment_reminder`, `referral_ask`, `fallback_window`, `cancelled`). Portal card: "This month: `{minutes}` of `{included}` minutes, `{texts}` of `{included}` texts" with the overage sentence (the only place outside the homepage that states the overage price; price-once rule covers plan prices, and Steve may veto this line).

Acceptance (now, draft):
- [ ] `POST /api/vapi` `end-of-call-report` for the shop's number with `startedAt` and `endedAt` 150 seconds apart: `admin records kind=usage` shows `minutes: 3`, `calls: 1`.
- [ ] Five customer-facing sends (one SMS booking conversation) raise `texts` by the number of `sms_sent` events of those types; owner alerts do not count.
- [ ] Set the shop to `starter` (150 minutes); simulate reports totaling 121 minutes: one `usage_alert` `{ threshold: 80, kind: "minutes" }`, one owner `sms_sent` `type: "usage"`; 151 minutes: the 100 alert; more minutes: no further alerts this month.
- [ ] `GET /api/client?c&k` has `usage: { month, minutes, texts, included: { minutes, texts } }` and the portal card renders it.
- [ ] `admin delete` removes `usage/{slug}/*`.

### S2-10 CSV export from the portal
Status: verified 2026-10-20 6ad687c6cfa858f714553022: `export=bookings` returned 200 `text/csv; charset=utf-8`, the attachment header, a BOM, the header row, one row per booking, and addresses with commas parsed intact; `export=conversations` had one row per message (24 of 24) with the flag note filled; without the key 403.
Size and scope: Size: S. Implements: Round 2 item 9; Epic 4 SHOULD; makes `DATA_POLICY` ("ask for an export at any time") self-serve.

Files: `netlify/functions/client.mjs` (GET with `export=bookings|leads|conversations`), `desk.html` (three links on the Your data card).

Change: `GET /api/client?c&k&export=bookings` returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="{slug}-bookings-{YYYY-MM-DD}.csv"`, UTF-8 BOM, header row, fields quoted per RFC 4180. Bookings: id, createdAt, customer_name, phone, address, issue, date, window, urgency, status, outcome, customerType, channel, notes, unsure, consent.at, consent.channel. Leads: id, createdAt, customer_name, phone, address, issue, reason, outcome, urgency, wanted, status, channel, unsure. Conversations: one row per message: channel, contact, at, role, content, flag note. No key, no export (403).

Acceptance (now, draft):
- [ ] `curl -si "$D/api/client?c=$S&k=$OK&export=bookings"` returns 200 `text/csv`, the attachment header, a first line starting with the BOM and `id,createdAt,customer_name`, and one row per booking; a quoted field with a comma in the issue survives (`python3 -c "import csv..."` parses it).
- [ ] `export=conversations` has one row per message and the flag note on flagged conversations.
- [ ] Without `k`: 403.
- [ ] The portal Your data card shows three download links.

### S2-11 Per-IP rate limit on the chat endpoints (if time)
Status: verified 2026-10-20 6ad687c6cfa858f714553022: the 61st request from one IP returned 429 `busy` (invalid bodies count toward the limit, which is the safer reading); the owner test line with its key still answered; `admin ratelimit_reset` returned `ok`.
Size and scope: Size: S. Implements: Round 2 item 10 (first half); CLAUDE.md rule.

Files: `netlify/functions/chat.mjs`, `netlify/functions/lib/store.mjs` (`ratelimit` kind, key `{ip}/{10-minute bucket}`), `embed.js`, `agent-widget.js`.

Change: 60 messages per IP per 10 minutes across MC, persona, and client modes (owner test line with a valid key exempt; `x-admin-key` exempt); over the limit returns 429 `{ error: "busy" }`; the widgets show their existing "something went wrong" line. Records expire by not being read (the key carries the bucket); `admin delete` is not involved.

Acceptance (now, draft):
- [ ] 61 `POST /api/chat` MC requests in a row from one IP: the 61st returns 429 `{"error":"busy"}`; the test line with the owner key still answers.
- [ ] Ten minutes later (or a new bucket via `admin` `{"action":"ratelimit_reset","ip":"..."}`), requests pass again.

### S2-12 Release the number when the cancel window ends (if time)
Status: verified 2026-10-20 6ad687c6cfa858f714553022: a cancelled shop with `serviceEndsAt` set to the past by admin: `run_scheduler` returned `released: 1`, logged `number_release_skipped` (no keys), cleared `phone.twilioNumber` into `releasedNumber`, and a call to the old number answered "not in service". The keyed release waits for S2-01.
Size and scope: Size: S. Implements: Round 2 item 10 (second half); sprint 1 assumption 15.

Files: `netlify/functions/scheduler.mjs`, `netlify/functions/lib/twilio.mjs` (`releaseNumber` exists), `netlify/functions/lib/vapi.mjs` (`releaseVoice` exists).

Change: each scheduler run lists `cancelled` clients with `serviceEndsAt` in the past and a `twilioNumberSid`: release the number and messaging service, delete the Vapi assistant and phone number, delete `index` `number:`, clear `phone.twilioNumber` and `twilioNumberSid` (keep the record), log `number_released`, email Steve. Without keys log `number_release_skipped` and still clear the index so the number cannot route.

Acceptance (now, draft): cancel a test shop, set `serviceEndsAt` to the past by admin (`{"serviceEndsAt": "..."}` accepted on the admin update), `admin run_scheduler`: `number_release_skipped` (no keys), `phone.twilioNumber` empty, `index` `number:` gone (a simulated call to the old number returns "not in service"). Keyed: `number_released` with the SIDs and the console no longer lists the number.

### S2-13 First-customer go-live runbook (ops, with the PM)
Status: verified 2026-10-20 (document): OPERATIONS.md "First customer: go-live and the first week" has ten numbered steps, each with who does it and the proving artifact (events, portal, email, the sheet at `product/golive-<slug>.md`), step 4 references the 14-case matrix and step 5 the five keyed cases, the day-7 template has no em dashes and no prototype words. The signed sheet is produced at the first go-live.
Size and scope: Size: S. Implements: Epic 5 MUST "Steve reviews every conversation on day one and daily for the first week, day-7 note"; Epic 6 MUST "written test matrix before each go-live".

Files: `OPERATIONS.md` (new section "First customer: go-live and the first week"), `product/SPRINT.md` section 5.4 (the matrix, referenced not copied).

Change: a numbered runbook: onboarding with the owner on a call, legal details for 10DLC, forwarding code dialed together (ring timer, Live Voicemail off, `*#61#` check), the 14-case matrix run on the test line and the five keyed cases, go-live click, day-1 full read of every conversation by Steve, daily read for 7 days with flags cleared, the day-7 "what I changed" email (template included), and the first-month hand invoice note (assumption 1). Each step names who does it and what artifact proves it (event, email, matrix sheet).

Acceptance: the section exists with those steps; every artifact named is one the PM can check (`admin records`, portal, email); the day-7 template has no em dashes and no prototype words; the PM signs the matrix sheet for the first customer and files it under `product/golive-<slug>.md`.

### S2-14 Merged leads recompute new or existing; a booking closes the customer's open lead
Status: delivered 2026-10-20, draft 6ad6bae471d3d40380534fad (see the engineer run in section 5). Engineer check: `flagLead`'s merge branch recomputes `customerType` and lists `customer` among the changed fields on the UPDATE text (a merged emergency from a number with a done visit read "existing"); `bookVisit` sets every open lead for that phone or contact from the last 24 hours to `booked` with `bookingId`, acknowledges its waiting alerts (`alert_acked` by "booking") so no escalation fires, and logs `lead_closed { id, by: "booking", bookingId }`. Size: S. Implements: Round 2 W2 (correctness of the merge path found in the S2-05 verification) and Epic 5 MUST (alerts and digest tell the truth).

Files: `netlify/functions/lib/desk.mjs` (`flagLead` merge branch, `bookVisit`).

Change: (a) when `flagLead` merges a repeat `notify_owner` into an open lead, recompute `customerType(c.slug, phone)` before writing the UPDATE text, so a customer marked done since the first contact reads "(existing customer)"; (b) when `bookVisit` books a visit for a phone number that has an `open` lead from the last 24 hours, set that lead's `status` to `booked` and log `lead_closed` `{ id, by: "booking" }`, so the digest's "leads need action" and the portal stop listing a customer who already booked, and any waiting alert for that lead closes (`runEscalation` already returns "lead closed" for a non-open lead).

Acceptance (now, draft): test-line callback request from a number, `done REF` on a booking for that number, then a second callback request within 30 minutes: the UPDATE text reads "(existing customer)". Test-line callback request, then a booking from the same number within the hour: the lead's status is `booked`, a `lead_closed` event exists, `admin tasks` has no `escalate` for it, and the daily digest counts 1 booked and 0 needing action for that customer.

## 3. Assumptions (Steve can overturn any; each is one line to change)

1. Round 2 open question 1: we do not sell a second line. The standard advice for a one-phone LSA owner is missed calls with the 15-second ring (all calls on Verizon); the copy already says so (S2-03).
2. Round 2 open question 2: the wants-a-call chain is owner text, backup text, customer told the window; Steve hears about emergencies and the digest only (S2-04).
3. On a shop where the owner's cell is the forwarded line, the emergency chain never places a call to that cell (it would bounce back); it sends a second text instead (S2-04).
4. "Existing customer" means a visit that happened or was marked done or paid; a lead, a spam record, or a future booking does not count (S2-05).
5. "cancel" from a number with an upcoming visit both opts out and asks the owner; the visit stays until the owner replies `cancel REF` (S2-05).
6. Quiet-day digests go by email only; the daily text is on by default and the owner can turn it off (S2-06).
7. Returning-caller recognition uses the most recent booking or lead for the caller's number; nothing is looked up for unknown numbers (S2-07).
8. The bypass list holds up to 20 numbers; a one-phone owner's VIP calls go to a recorded voicemail texted to the owner, because ringing the forwarded line again is a loop (S2-08).
9. Usage counts call minutes rounded up per call and customer-facing texts only; alerts at 80 and 100 percent are informational; nothing pauses at the limit and nothing is billed (S2-09). The overage sentence on the portal card is the one price outside the homepage; Steve may remove it.
10. The ring-timer codes are the GSM standard as published; they are confirmed on a real SIM in S2-01 and fall back to the plain codes if refused (S2-03).
11. Sprint 1 assumptions 1 to 18 stand, including billing parked and hand invoicing for the first customer.
12. The keyed pass reservation (S2-01) is spent first whenever Steve's keys arrive, even mid-ticket.

## 4. Out of this sprint

| Item | Why |
|---|---|
| Three-tier emergency table per trade (S#13) | held for sprint 3 by the PO; the free-text field plus the matrix covers the first customer |
| Marketing-consent capture and Texas hours for offer texts (S#24) | sprint 3; needed before a Growth customer's referral ask reads as promotional |
| Weekly email with missed-call-to-booking rate and no-book reasons (S#18, S#22) | sprint 3; needs reason tagging first |
| Whole-call Spanish on voice | verified in the keyed matrix (case 10), no code |
| Angi webhook, Thumbtack and LSA in-thread replies, Jobber and Housecall Pro | cut 1 and Epic 7 LATER; CSV export is the bridge |
| Billing, pre-conversion text, blocklist, call spam tagging, pause-at-limit | parked by Steve's rule; the usage meter is the data it will need |
| Rosie-style "press 1 to take this call" gate (`warm-transfer-twiml`) | after the plain warm transfer works on a real account |
| Per-action permission toggles (book, reschedule, cancel) | cancel-by-request only remains the safe default |

## 5. Verification plan

Setup as in `SPRINT.md` section 5.1 (fresh draft deploy, PM Test shop, admin-attached number, `MC_TWILIO_NUMBER` set in Netlify), plus the hooks this sprint adds: `admin records kind=usage`, `admin` `{"action":"ratelimit_reset","ip"}` (S2-11), admin update accepting `serviceEndsAt` (S2-12), and admin update accepting `{"voice":{"provider":"vapi","assistantId":"asst_test"}}` so the S2-07 and S2-08 `assistant-request` lines can run without a Vapi key (without an assistant id, or on a paused or detached shop, the webhook answers with Vapi's `error` message instead). The engineer's own run of every "now" line is `scratchpad/s2check.py` (53 checks, 53 passed on draft `6ad684d239ca7ec63fb8620f`), which the PM may reuse or ignore.

Also delivered this sprint outside a ticket, for the PM to verify: (a) web and test-line chat now hold back the pre-tool fragment of a turn (`dropToolPreamble`), because the planning line "Customer asked for a person; call notify_owner" was reaching the website chat during the S2-04 check; the final turn still streams. (b) `lib/store.mjs` opens the Blobs store per call instead of caching it; a warm instance failed every write with "Token expired" after about an hour of draft traffic. SMS model replies are read from `admin records kind=conversations` and `sms_sent` `type: "reply"`; fast paths are read from the webhook TwiML.

Pre-key pass: each ticket's "now" lines against the engineer's named draft, recorded on the status line as `verified <date> <deploy id>` or `returned: <line and what was seen>`; lines that cannot run on a draft are marked so and the code path named. Every session ends with `admin delete` for each test shop, `admin clear_optout` for each fake number, and `GET /api/admin` showing no PM Test shop.

Keyed pass (S2-01): merged to `main` first; run in this order: provisioning, L3, L1 (missed with the ring timer, then all calls), L2, L5, S1-17 pause and resume, S2-03 ring timer confirmation, S2-07 returning caller, then the five keyed matrix cases (1, 3, 6, 9, 13 from `SPRINT.md` section 5.4). Every text expected on a phone is logged with its arrival time; every rejected API field is a DECISIONS.md line.

Go-live gate for the first customer: S2-01 complete, S2-02 to S2-06 verified, the 14-case matrix passed on the customer's own test line, the S2-13 runbook followed and the matrix sheet filed.

## 6. Verification record

### Pre-key pass, 2026-10-20, draft `6ad687c6cfa858f714553022` (built by the PM from `main` at commit `90cb341`)

`scratchpad/verify4.py`, 59 checks, 58 passed; test shops `pm-test-hvac-7f2c` (orphaned by a script crash of mine, deleted) and `pm-test-hvac-daac` (number `+17135550114`, deleted at the end); fake-number opt-outs cleared; `GET /api/admin` lists no PM Test shop. Engineer hooks used: admin `voice` update with a fake assistant id for the `assistant-request` lines, `records kind=usage`, `ratelimit_reset`, admin `serviceEndsAt`.

Results: S2-04, S2-06 to S2-13 verified; S2-05 verified with follow-up S2-14 (merged UPDATE texts keep the lead's original new/existing; open leads stay "needs action" after the customer books). Out-of-ticket deliveries: no planning text at the start of any test-line reply across nine test conversations (`dropToolPreamble`); the per-call Blobs store is a code change with no draft-level test. Not exercisable on a draft: the Vapi webhook secret (not set in Netlify yet; add it in S2-01 setup), the real number release, the past-visit branch of `customerType`.

Observed and worth knowing: the rate limiter counts invalid requests, so a misbehaving script trips it quickly, which is the safer reading; the usage meter counted the text-back, confirmations, replies, and the fallback-window text and nothing sent to the owner; the all-calls shop without a transfer target got a "Second notice" text instead of a call, so no escalation can loop back into the front desk.

### Keyed pass
Pending S2-01 (Steve's keys). Order in section 5.
