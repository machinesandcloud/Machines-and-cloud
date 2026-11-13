# Release 3: independent release QA (2026-11-13)

**Verdict: NO-GO until three wording fixes on the public legal pages are made (copy only, no code).** The code is fit to ship: the gate, the hand merges and the offline messaging matrix pass. No code blocker was found, and every gap found in messaging is the same on production `0f30643e`. With the three page edits below, this is GO.

- **Candidate:** `ae542472` on `work/claude-release3-candidate-20261112`. The branch has since gained `6e98a4d3`, the lead's live-census receipt, which changes docs only.
- **Base:** production `0f30643e`. Fast-forward confirmed with `git merge-base --is-ancestor`.
- **How it ran:** everything offline under `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1` and `MC_LOCAL_NO_KEYS=1`, with a `sandbox-exec` deny-remote profile that allows loopback only.
  - The copy was a throwaway `git archive ae542472` with `qa-artifacts/` excluded (395 MB). `node_modules` was a symlink to `scratchpad/p10/nm`, which includes `oauth4webapi`.
  - Nothing called a provider, pushed or committed. `route.fetch` was never used.
  - The copies were deleted at the end.

## Blockers (exact fixes)

| # | Page | Current claim | What the code does | Fix |
|---|---|---|---|---|
| B1 | `terms-of-service.html` §2 and `sms-terms.html` ("What you receive") | Reminders "about 24 hours and (about) 1 hour before the arrival window" | `managedReminderSchedule` (`lib/managed-delivery.mjs`) moves a 1-hour reminder that falls in quiet hours. It goes at 9 am, or noon on Sunday, if that is still 30 minutes or more before the window. Otherwise it goes at 8:30 pm the evening before. It is skipped if that time is less than 2 hours after queueing. An ordinary 8-to-12 weekday visit gets its "1 hour" reminder at 8:30 pm the night before. | Replace with "reminders about 24 hours before and again shortly before your arrival window (never during quiet hours, so an early-morning visit gets it the evening before)". |
| B2 | `privacy-policy.html` Retention | "Short-term abuse-prevention records that contain an IP address are deleted within about 20 minutes" | `retentionSweep` (`lib/data-erasure.mjs`) runs only at :00 and :30. It deletes `ratelimit` buckets older than the previous 10-minute bucket, at most 500 keys per run. A record can live about 50 minutes, longer under backlog. | Say "within about an hour". |
| B3 | `sms-terms.html` ("How it starts") and `privacy-policy.html` (How AI processes conversations) | "The first reply in a conversation says that it is automated" | The intro goes on the first reply written by the AI: `withAutomatedIntro` / `disclosedAt` (managed) and `m.disclosed` (legacy). Templated keyword replies are deliberately left out: HELP/AYUDA, APPOINTMENTS/CITAS, YES/SÍ, QUOTE, REVIEWS, and legacy C/R. When a conversation opens with one of these, its first reply carries no intro. | Say "the first reply written by the automated assistant says that it is automated". |

Optional, same edit pass: Agreement §3 says that at the AI limit "the front desk stops answering on that channel". On managed texts it actually sends one honest limit reply and saves an owner request. Suggested: "stops writing AI replies on that channel (customers who text get one short notice and the request is saved for you)".

## 1. Gate (reproduced, not trusted)

| Run | Result | Receipt |
|---|---|---|
| Exact `netlify.toml` build command as one `&&` chain (70 steps) | `GATE_EXIT=0`, 0 `FAIL` lines, `build-site` reports 182 pages / 311 files | `receipts/gate-normal.log` |
| Same, with the wall clock shifted to 21:30 Houston (the autoflag/fan-out hour) by `harness/clock-2130.mjs` through `NODE_OPTIONS=--import` | `GATE_EXIT=0`, 0 `FAIL` lines. The shim was checked to print 9:30 PM Houston. | `receipts/gate-fanout-2130.log` |
| `legal-prereq-check` from the candidate's harness, run against my copy | 53 passed, 0 failed, 1 skipped (P7b held), 71 provider requests intercepted | `receipts/legal-prereq.{log,json}` |
| `python3 -I scripts/sitecheck.py .` | 182 pages, 0 broken references, 0 sitemap/redirect/canonical issues | `receipts/sitecheck.log` |

## 2. Hand merges (`git diff 0f30643e ae542472`)

Files read: `send.mjs`, `desk.mjs`, `sms.mjs`, `manage.mjs`, `managed-sms.mjs`, `netlify.toml`, plus `sms-agent-background.mjs`, `voice.mjs`, `vapi.mjs`, `lib/vapi.mjs`, `voice-provider.mjs`, `client.mjs`, `scheduler.mjs`, `provision-background.mjs`, `fanout.mjs`, `managed-delivery.mjs` and `data-erasure.mjs`.

**No lost behaviour was found:**
- `netlify.toml`: release 2's line is kept exactly. Only `uncovered-cards-check` is added, before `build-site`.
- `send.mjs`: release 2's `redactOwnerCredentials` is kept, and `notifySteve` still redacts. `force` is gone everywhere. Owner messages that used to go over the shared sender with `force:true` are all paired with an email, through `textOwner` or a separate `sendEmail`: welcome, pause, cancel, 10DLC news, digest, testing nudge, forwarding nudge and escalation step 2.
- `desk.mjs`:
  - `STRINGS.es.consent_yes` (release 2) and the r5/r4 `managed_help` both survive.
  - `deliveryNote` leaves the operator fallback out of the owner channels.
  - The step-3 escalation founder SMS is now email only, still redacted.
- `sms.mjs`:
  - The owner command `help` still runs before the new customer HELP branch, because `isOwner` returns first.
  - Release 2's Spanish C/R strings are kept, with the new `system:` tags.
  - The bridge lookup is removed.
- `manage.mjs`: `optOutReview` and `legacyKeyAudit` are both in the payload. The opt-out actions call `requireCurrentOperator`.
- `managed-sms.mjs`:
  - The disclosure is decided from `history.disclosedAt`, so a retry decides the same way.
  - The AI-limit reply carries the intro in the limit language.
  - The P9 flag is advisory only. Opt-out decisions are byte-identical to production (legal O13).
- `data-erasure.mjs` covers every new store: `held_notices`, `owner_fallback`, `optout_flags`, `optout_review` and `optout_requests`.

**Non-blocking findings.** Both are on legacy shops only, and the live census says there are 0 legacy shops.
1. **A held HELP gives the owner an untrue message.** On a legacy shop without an approved sender, a customer's HELP/INFO/AYUDA gets the registered help text as TwiML from the shop's own number. Yet `holdInbound("help_no_registered_sender", "a request for help")` emails the owner that it "was not answered by text" (seen in `receipts/legacy-e2e.json` `ownerMail`).
   - Fix: pass a separate notice for HELP, e.g. "…sent the standard help reply; nothing else was answered by text…".
2. **The pause email promises a reply that does not go out.** The owner's pause notice (`client.mjs`) says "texts get one reply pointing to your main line". On a shop without an approved sender, inbound texts are held before the paused-reply branch, so no such reply goes out.

## 3. Messaging end to end, offline

**Harness:**
- `harness/legacy-e2e.mjs`: the candidate's legal-harness setup, real handlers and a controllable clock.
- `harness/managed-e2e.mjs` with `managed-tail.part`: composed onto `scripts/managed-sms-qa-check.mjs`, with signed Twilio payloads, real `/api/managed-sms`, `processManagedSMS` and `runManagedDelivery`, and in-process provider doubles.

**Invariants checked:**
- every customer either gets a reply or the owner gets a signal;
- no `sms_sent` event without a provider `SM` sid (one per sid);
- no duplicate outbound text (same recipient and body);
- no shared-sender text.

| Scenario | (a) Legacy, approved sender | (c) Legacy, no sender | (b) Managed, approved sender | (c) Managed, sender not verified (`awaiting_test`) |
|---|---|---|---|---|
| Booking | Web booking: 1 confirmation from the own number; owner text and email | Web booking: 0 customer texts, `textsHeld` set; owner email says the confirmation was not sent and no reminders are scheduled | By text: first reply carries "Automated assistant for …"; YES gives consent; 1 confirmation with no internal ID and an absolute date; owner email queued | Web booking: SMS jobs `waiting_platform/sms_not_ready`; 0 texts; owner email queued; portal label "Waiting for a texting registration" |
| Reply "C" | Fast-path confirm (TwiML) | Held; owner emailed | Goes to the AI (no C fast path on managed; the managed confirmation does not ask for C); one reply | n/a |
| Reminders | `reminder_24h` sent once at its time (scheduler `run()`) | No reminder tasks | 1 reminder sent once (H06 rules) | n/a |
| Reschedule (`rescheduleVisit`) | Owner alerted; reminders re-armed | Owner alerted; no reminders re-armed | 1 text. **Note:** this path does not set `ownerVisitMutation`, so the text says "your visit is saved for <new date>" rather than "has moved"; the owner-portal path does say "moved" (H05). Accurate, not misleading. | n/a |
| HELP / INFO / AYUDA | Registered HelpMessage (TwiML) | Same TwiML; owner told once per 4 h | `managed_help` names the registered contact (see live item 7) | n/a |
| STOP, repeat STOP, START, ALTO | Confirmation once; repeat silent; START restores; ALTO is Spanish | Same | Same, tenant-scoped; nothing answered after ALTO | n/a |
| VIP text | Relayed to owner (text and email) | Owner email | Not a managed feature | n/a |
| VIP call missed | No `<Record>`; text-back; open lead; owner alert | No `<Record>`; no text-back; "has been told"; lead | Managed calls run through Vapi, with `recordingEnabled:false` | n/a |
| Missed call | Text-back sent; owner alert | Caller told to call back; owner email | Covered by `managed-voice-handoff-check` in the gate | n/a |
| AI reply | Intro on the first AI reply only | Not run; held; owner emailed | Intro on the first reply only | Customer text dropped (200, empty TwiML, no record) |
| AI limit | n/a (managed feature) | n/a | 2 texts give 2 honest replies (intro on the first), 1 lead, 1 owner email | n/a |
| Send error, then retry | One throw, then retry: 1 delivered text, no duplicate turn. Three throws: reply saved `send_error_final`, one owner alert (text and email), no `sms_reply` logged | n/a | Network throw: job `uncertain/provider_receipt_missing`, **no resend** (prevents a duplicate) | n/a |
| Provider failed status | n/a | n/a | Job `failed` | n/a |

**Totals:** legacy **33/33**, managed **16/16**, with 15 `sms_sent` events matching 15 Twilio POSTs. Receipts: `receipts/legacy-e2e.json`, `receipts/managed-e2e.json`.

**Managed gaps found here are not regressions; they are identical on `0f30643e`** (`receipts/managed-e2e-base.json`). In each case the customer gets no reply and the owner gets no email:
- **Network throw:** the delivery stays `uncertain`.
- **Provider "failed":** the delivery is `failed`. In both of these first two cases the only signals are the portal labels ("Outcome unconfirmed" / "Not delivered") and the operator health failure index (`serviceDeliveryRecovery`).
- **Unverified managed number:** a customer text to it is dropped with no record.

Recommended follow-ups:
- an owner email on a final `failed`/`uncertain` customer reply;
- recording the inbound text, with an owner notice, while a managed number is in `awaiting_test`.

The baseline run also confirms that release 3 fixes three behaviours that fail on base: the internal ID in texts, the missing AI disclosure, and duplicate AI-limit replies.

## 4. Legal pages

**Rendering:**
- Chrome (system channel) through Playwright at 390 and 1440: **6/6**. HTTP 200, no horizontal overflow, no console or page errors, 0 external requests (all aborted, none fetched), and all 10 footer links resolve.
- Screenshots and `legal-ui.json` are in `receipts/ui/`.
- Em dashes and en dashes: 0 on all three pages. No prototype words, no draft notice.
- Canonicals point to `https://www.machinesandcloud.com/<page>.html`. JSON-LD parses on all three pages.
  - Note: these pages carry `WebPage` and `Organization` but no `BreadcrumbList`, unchanged from production. This is pre-existing and out of the CLAUDE.md convention; not a blocker.

**Claims verified against the managed code paths:**
- **"We do not record call audio."**
  - `managedAssistantBody` sets `artifactPlan.recordingEnabled:false`. It is used for create and PATCH, and for the per-call transient assistant returned on every `assistant-request` (`voice-activation.mjs:721`).
  - `importNumber` binds no fixed assistant.
  - The handoff `<Dial>` has no record attribute.
  - No code stores a recording URL.
  - Practice voice also disables recording.
  - The VIP `<Record>` is removed (P3).
- **Transcript of up to 12,000 characters plus a summary:** `voice-activation.mjs:748` slices the transcript to 12000.
- **Own number, own registration, no shared bridge:**
  - managed: `messagingSender`;
  - legacy: `hasRegisteredSender`;
  - the bridge is removed and the M&C number never resolves to a shop (L6/L7).
- **Written YES before ongoing appointment texts; START needs a new YES:** managed consent, matching the START reply text.
- **STOP stops that business's texts:** managed consent is keyed per tenant. Legacy STOP is broader (all legacy shops), which is not a false-safe claim.
- **Opt-out keyword list:** matches `sms-keywords.mjs` (CANCELAR and BAJA are extra).
- **Possible opt-outs in other words are flagged, not stopped (Agreement §7):** `flagPossibleOptOut` never suppresses; the operator can apply an opt-out with `apply_opt_out`.
- **HELP/INFO/AYUDA give the business's help contact:** `managed_help` uses the registered contact (H07).
- **Website chat labelled as automated:** `embed.js` "Automated front desk". Calls open with an automated greeting (`voiceGreeting`).
- **Erasure scope and the minimal opt-out record:** `data-erasure.mjs`, `data-erasure-check` in the gate.
- **Sign-in records 7 days after expiry:** `retentionSweep` `graceMs`.
- **No trackers:** no gtag, GTM, analytics or pixel in any HTML/JS.
- **Owner email sender:** `desk@machinesandcloud.com` (`FROM_EMAIL` default).

**Wrong:** B1, B2 and B3 above.

## 5. Owner-facing truthfulness

The candidate does not claim texts went out from a sender that is not approved:
- **Owner portal:** the label is "Waiting for a texting registration that includes it". Welcome, number-assigned, 10DLC-failed and calendar-health copy all branch on `ownSenderApproved`.
- **Booking and missed-call notices:** they say the confirmation or text-back was not sent ("(no_registered_sender)").
- **VIP call missed:** the notice says "They were not texted". `deliveryNote` excludes the operator fallback from the owner channels.
- **Operator alerts:** email only, with credentials redacted.

The two legacy-only exceptions (HELP and pause) are in §2.

## Claims that depend on live state (census or provider configuration)

The lead's census (`LIVE-CENSUS-20261113.md`) found 0 legacy shops, 0 shared-sender dependents, 0 VIP recordings and 0 plaintext Calendar tokens. That makes items 1 to 5 true today. Each becomes false if a legacy shop is ever reintroduced:

1. **"We do not record call audio."**
   - Legacy Vapi assistants are created without `recordingEnabled:false`, and Vapi records by default.
   - Old VIP voicemails would also make it false (the census found 0).
   - Not censused: account-level recording settings in Vapi or Twilio.
2. **"Each business texts from its own number…; no shared bridge."** The census found 0 shared-sender dependents.
3. **"Ongoing appointment texts start only if you agree in writing" / "only to customers who agreed in writing" / "START… agree again".**
   - Legacy shops send the confirmation and reminders on booking-time notice, with no YES.
   - Legacy START resubscribes fully.
4. **"These texts never include marketing, promotions or review requests" (SMS terms, Agreement §7).**
   - Legacy shops send `review_request`, `referral_ask`, `lead_chase`, `payment_reminder` and `maintenance_reminder`.
   - Managed review requests exist behind the env flag `POST_VISIT_REVIEW_REQUESTS_ENABLED` (live env, not censused).
5. **"Encryption of… Calendar refresh tokens" and "carrier registration details… we store these encrypted."**
   - The census found 0 plaintext legacy Calendar tokens. P7b is still held.
   - Legacy `client.business.legal` (including the EIN) is stored in plaintext on the client record. This is true today only because there are 0 legacy shops; it was not separately censused.
6. **Customer Care number "Awaiting carrier approval. Text replies are not live yet."** Depends on the live `MC_PLATFORM_SMS_ENABLED` flag and the company campaign's status (not censused).
7. **HELP wording on managed shops.**
   - The in-app `managed_help` text ("for help contact X. Reply STOP, ALTO or PARAR to stop texts.") is not the registered campaign HelpMessage. The registered message reads "help with service texts at X… Message and data rates may apply." The candidate's notes flag this as pre-existing.
   - Which text a customer receives depends on whether the live Messaging Service's own HELP auto-reply answers first (`OptOutType=HELP`).
   - The pages only claim "the business's help contact", which is true either way.
8. **"We act on a request made in another way… within 10 business days."** Operational: someone has to work the operator review queue. The code provides the queue and the action; it does not enforce the deadline.

## Files

- `receipts/`:
  - `gate-normal.log`, `gate-fanout-2130.log`;
  - `legal-prereq.{log,json}`;
  - `legacy-e2e.{log,json}`, `managed-e2e.{log,json}`, `managed-e2e-base.json`;
  - `sitecheck.log`;
  - `ui/` (6 screenshots and `legal-ui.json`).
- `harness/`:
  - `gate.sh`, `deny-net.sb`, `clock-2130.mjs`;
  - `legacy-e2e.mjs` (built from `legacy-head.part`, the legal harness setup and `legacy-tail.part`);
  - `managed-e2e.mjs` with `managed-tail.part`;
  - `legal-ui.mjs`.
- Run the E2E probes with `node <probe> --repo <tree> --json <out>` under `env -i … sandbox-exec -f deny-net.sb`.
