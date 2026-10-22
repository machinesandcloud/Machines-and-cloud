# M&C product-text receiver

This is a separate, local implementation for **Machines & Cloud's own product inquiries, signup guidance and account-support entry**. A customer's home-service business uses its own dedicated number and the managed SMS path. The platform number is not a shared homeowner inbox.

`/api/platform-sms` is implemented by `platform-sms.mjs` and `lib/platform-sms.mjs`. It is not the legacy `/api/sms` route. Ordinary replies require `MC_PLATFORM_SMS_ENABLED=true`, the exact `MC_TWILIO_NUMBER` and `MC_MESSAGING_SERVICE_SID`, and valid live Twilio account/auth-token configuration. The gate is off by default; this code does not establish carrier approval or authorize turning it on.

## Supported behavior

The sender initiates each interaction. A deterministic response links to public pricing, setup, secure sign-in or product information. HELP/INFO/AYUDA supplies general help. There is no AI/model request, account lookup/disclosure, support-ticket creation, booking, promise of human follow-up, admin reply control, proactive reminder or marketing campaign. YES does not enroll the sender in recurring texts.

STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT, ALTO and PARAR record suppression. START, UNSTOP and EMPEZAR only remove suppression; they do not create ongoing consent. HELP remains unanswered while suppressed. A first STOP can receive one necessary confirmation even with ordinary replies disabled, unless Twilio's signed `OptOutType` says the provider handled the keyword. Repeated STOP while already suppressed prepares no second confirmation. START and HELP receive no application acknowledgment while the ordinary gate is off. Provider keyword handling never produces a second application acknowledgment.

The current START reply is: “Machines & Cloud: your texting block is removed. We only reply to messages you send; no recurring texts. Reply HELP for help or STOP to stop.” The exact sample/keyword wording is coordinated with the carrier filing and public terms; changing either requires checking that contract again.

## Verification and durable uncertainty

The request must be a bounded form POST to exactly `https://machinesandcloud.com/api/platform-sms`. Query variants, another host/path, duplicate form parameters, missing signature/secret, another account, service or destination and oversized bodies are rejected. HMAC validation uses the exact public URL and the configured live auth token. A Twilio Message GET additionally verifies the exact inbound SID, account, service, sender, destination, body, direction and creation date within the last 24 hours. A successful signature alone cannot bind a shop's message to the platform program.

The first private `platform_sms_receipts/<MessageSID>` conditional insert is a permanent response fence. It records a digest and redacted source before any TwiML response can be prepared. The same SID with a changed payload is rejected. Every matching duplicate returns empty TwiML, including concurrent requests and retries after a lost first response.

`platform_sms_messages/inbound_v1` stores the recent index, persistent contact directives and daily reply budget. A duplicate repairs a missing history/directive projection without acquiring reply authority. Provider timestamps order STOP/START; STOP wins equal-time ties, and an older instruction cannot reverse a newer choice. A delayed duplicate finalizer cannot replace an already-finalized primary receipt.

Prepared TwiML is recorded as **delivery unknown**. The application cannot prove Twilio received or delivered its first HTTP response. Retrying that reply could send/charge twice, so there is no automatic resend and no delivered claim. A request failing between the primary fence and later projection can remain uncertain; retry projects the known source and still emits no duplicate reply. This favors avoiding duplicate sends over guaranteeing an answer to every failed request.

## Automatic retention and operating bounds

The recent admin index automatically keeps at most **500** entries; older primary receipts remain archived with their deduplication fences. Rolling the recent history forward never makes a previously accepted SID eligible for a new response. Suppression does not expire merely because an entry leaves that index.

At most **500 application replies can be prepared per Houston calendar day**, including necessary STOP acknowledgments. A durable shared reservation precedes TwiML. The allowance resets automatically at the day boundary; failed or uncertain responses consume it. After exhaustion, new verified questions and STOP/START directives still persist, with replies withheld. No founder archival or reset is needed for ordinary continuation. This is a request limit, not an exact dollar cap; a response may occupy multiple SMS segments, and inbound/provider/carrier charges can still apply.

Primary receipts and contact directives are retained separately from the rolling display. Retained storage and any future erasure/archive policy need operational review before expanding the program; recent-display limits are not a guarantee of unlimited storage or throughput.

`platformSMSHealth()` reports the gate, recent scope, daily reply usage, uncertain reply count and processing failures. Exhausted daily reply capacity is unhealthy. `platformSMSView({limit:60})` returns a safe bounded projection. Private provider identifiers, digests, bindings, auth values, recognizable tax identifiers and common password/code/header tokens are omitted or redacted. The original text is not echoed in an SMS response.

## Private admin visibility

The existing verified, allowlisted operator dashboard adds `platformSMS` to `/api/manage`. Inquiries shows M&C product texts separately from website leads and marketing eligibility. Message text is HTML-escaped, prepared replies are labeled unconfirmed, and sign-out clears the panel and session. Ordinary owner/anonymous access is denied. Neither marketing exports nor admin send/reply controls include these SMS contacts.

## Local evidence and release boundary

`scripts/platform-sms-check.mjs` exercises the actual receiver/manage handlers and actual admin assets with physical networking disabled, dummy credentials and an intercepted Twilio Message GET. [The engineering receipt](../scratchpad/platform-sms-engineering-first.json) passes **18 groups**, including verification failures, default-off behavior, provider keyword handling, suppression/order, concurrent replay, daily exhaustion/reset, recent-index rollover with archived dedup, redaction, operator access and actual 375/1365 px browser views with inert incoming HTML and sign-out clearing.

[Independent SDK/protocol review](../scratchpad/platform-sms-independent-review-final.json) passes **14 groups** with 36 conditional-write conflicts and stable source. It drives 501 actual intercepted inbound requests, automatic recent-index/daily-budget rollover, replay after archival, delayed duplicate finalization and STOP projection-failure recovery through the real wrapper/management handlers. The first review receipt retains two corrected test assumptions, separate from runtime defects.

This candidate has not been published, no execution setting was changed, and no real model request, SMS, call or provider mutation was part of these checks. Carrier filing/approval, production webhook alignment and a separately bounded real delivery/opt-out proof remain required before enabling ordinary replies.

Primary provider contracts checked October 22, 2026: [Twilio webhook authentication](https://www.twilio.com/docs/usage/webhooks/webhooks-security), [Message receipt fields](https://www.twilio.com/docs/messaging/api/message-resource) and [Advanced Opt-Out behavior](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out).
