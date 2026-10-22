# Managed phone delivery

The managed phone path connects a reserved Twilio number, prepares a Vapi reference assistant, imports the number without changing its SMS webhook, checks routing, and waits for provider-authenticated evidence of an answered call. It is separate from legacy provisioning and remains off until an account usage policy and a bounded real acceptance pass are approved.

## Customer experience

One owner-approved phone request records the current business-rule revision, authority statement, usage disclosure, policy digest, and either “forward my business line” or “use my new number.” Routine provider steps continue in the background. Forwarding an existing carrier line still requires that line's authorized customer or carrier; a tutorial click is not evidence that forwarding works.

A solo owner can use the new number while keeping the same existing business and personal cell. A second cell is not required for AI answering. Forwarding an existing business line requires a different owner cell, and a fallback that would ring the front desk number itself returns a brief unavailable message instead of looping the caller.

The portal distinguishes a reserved number, connected route, verified forwarded call, successful call, configured fallback, observed fallback, and answered fallback. It does not call a number reservation an active service. A route becomes active after a matched successful call-end report and, when selected, a signed call forwarded from the recorded business line.

The caller hears an AI front desk assistant using the current owner facts. Tool results describe the actual saved visit or request. Saving a workspace record does not establish that a text, email, calendar event, human callback, or dispatch was delivered.

## Runtime and recovery

- `lib/voice-activation.mjs` exports `requestVoiceActivation`, `cancelVoiceActivation`, `voiceActivationStatus`, `voiceRecoveryHealth`, `recoverVoiceActivations`, `runVoiceActivationWave`, `dispatchVoiceActivationWave`, and the two provider webhook handlers.
- `lib/voice-provider.mjs` makes the actual Vapi and Twilio API requests. Neither Vapi create endpoint is given an invented idempotency header. An uncertain create is looked up by its recorded resource ID or correlation; an absent list result never triggers a second create.
- `managed-voice.mjs` accepts signed Twilio callbacks. The signed number, account and call SID bind an incoming call before it redirects to the privately recorded Vapi callback. Signed `ForwardedFrom` must match the customer's business line to prove forwarding. An opaque callback index is used instead of trusting a caller-supplied tenant slug.
- `managed-vapi.mjs` requires the configured shared header and the Twilio-bound call, Vapi call ID and imported phone ID. Each `assistant-request` returns a **transient assistant built from current owner facts**. A late remote PATCH to the reference assistant cannot select stale runtime instructions. Explicit server headers authenticate transient tool and report webhooks. Ended calls cannot invoke new tool mutations.
- `voice-activation-background.mjs` accepts only a fixed authenticated POST with `{}`. A conditional wave lease prevents overlapping waves. Each customer receives a 15-second provider budget; one background wave is bounded to four minutes and 25 customers. The scheduled worker dispatches the same fixed endpoint every ten minutes; it does not execute long provider loops in the scheduled request.

The active cohort is capped at **25 retained operations**. The 26th new request fails before resource creation. Ready customers stay in the fair queue so their routing is checked again within the 25-minute freshness window; the UI and serving handler stop claiming readiness when this evidence becomes stale. Health reports counts, unresolved work, partial scope, stale routes and oldest pending/check times. Greater scale needs a separately verified worker-capacity increase.

The customer, lifecycle epoch, current rule revision, policy digest, number ownership, parent cancellation and authority are rechecked before dispatch and before serving. A pause stops AI answering immediately. Testing-to-live and pause-to-resume transitions automatically adopt a fresh generation when the same accepted policy, confirmed resources and current private review/test proof remain valid. Reviewed and tested changes to business rules update the same resources. These transitions retain resource IDs and create-attempt evidence; they never authorize a replacement purchase or retry an unknown create. In-flight requests must still match the current generation before returning an assistant or dispatching a tool.

Cancellation retains resource receipts, detaches the Twilio route, removes the imported Vapi number and reference assistant, and verifies provider absence. The parent number dependency is cleared only after confirmed cleanup; number release is a separate recorded action. Confirmed-cleaned entries leave the active queue, while their private primary records remain. An uncertain create or delete remains visible instead of silently releasing its number.

Every incoming assistant request reserves its entire maximum duration against both customer and account daily call/minute budgets. Duplicate call SIDs reserve once. An uncertain reservation consumes capacity rather than permitting unbounded calls. Budgets use separate Houston-day records and do not refund unconfirmed work automatically.

## Off-by-default configuration

Production execution requires all of the following:

- `VOICE_ACTIVATION_ENABLED=true`
- `VOICE_ACTIVATION_APPROVED_VERSION` matching `VOICE_ACTIVATION_POLICY_JSON.version`
- `SERVICE_WORKER_KEY` and `VAPI_WEBHOOK_SECRET`, each at least 32 characters
- Vapi private key, Twilio account SID and auth token
- The existing independent `VOICE_FALLBACK_TWIML_URL` on `https://handler.twilio.com/twiml/EH...`

The policy contains `version`, explicit `model`, `maxDurationSeconds`, `maxDailyCalls`, `maxDailyMinutes`, `accountDailyCalls`, `accountDailyMinutes`, `authorityText` and `usageDisclosure`; optional `voiceProvider` and `voiceId` must be supplied together. Unknown fields are rejected. These controls do not invent prices or approve spending. Missing execution gates, worker credentials or required policy values keep the service unavailable.

The independent Twilio-hosted fallback is read and checked against its narrow allowed TwiML before routing is accepted. It gives a brief service-unavailable message independently of the Netlify application. Its URL has no owner-cell parameter, and the Vapi import has no static native fallback destination; this prevents an older in-flight provider update from routing a caller to a former owner's cell after business rules change. When the application is available, the managed signed fallback endpoint rings the **current** safe owner cell and records observed/answered fallback callbacks. Readback of a configured independent fallback is not proof that it has actually answered an outage call.

## Evidence

`node scripts/voice-activation-check.mjs --output scratchpad/<new-name>.json` exercises the production state machine, real HTTP adapters, signed webhook handlers and actual shared tool dispatcher with physical networking disabled, using both memory and the installed Blobs SDK protocol fixture.

The engineering receipt `scratchpad/voice-delivery-engineering-solo-final.json` passes **56 groups**, including 20 SDK conditional-write conflicts, concurrent requests/workers, creates whose responses are lost before/after effect, routing reconciliation, parent/child cancellation, in-flight cancellation, automatic testing/live and pause/resume adoption, reviewed rule changes without new creates, usage deduplication and actual daily-cap rejection, ended-call rejection, real lead-tool deduplication, three-customer background refresh, capacity rejection, cancellation after execution-policy removal, recovery after the parent dependency CAS commits but its child acknowledgment is lost, and the one-cell new-number setup with loop-safe fallback. Earlier receipts are retained, including the failed intermediate three-customer wave test that revealed comparison against a clock-dependent reference prompt.

Independent review uses `scripts/voice-delivery-independent-check.mjs`. Its current-source receipt `scratchpad/voice-delivery-independent-solo-final.json` passes **8 groups** through memory and the installed SDK. It reproduces a delayed older provider PATCH after a newer patch and checks that the live transient assistant still uses current rules. It also checks delayed tools after a call ends, lifecycle/rule adoption with old-generation tools rejected, three-customer background refresh with authenticated bounded requests, and the generic independent fallback with no owner-cell query or static native fallback destination.

No real provider resource, call, message, model request, purchase, billing setting or deployment was used for these local checks. Hosted phone acceptance remains a separate bounded phase before any gate is enabled.

## Provider contracts checked on 2026-10-22

- [Vapi current OpenAPI](https://api.vapi.ai/api-json), [Create assistant](https://docs.vapi.ai/api-reference/assistants/create), [Create phone number](https://docs.vapi.ai/api-reference/phone-numbers/create), [List phone numbers](https://docs.vapi.ai/api-reference/phone-numbers/list), [Delete phone number](https://docs.vapi.ai/api-reference/phone-numbers/delete)
- [Vapi assistant-request and tool event contracts](https://docs.vapi.ai/server-url/events), [Server authentication and transient resource headers](https://docs.vapi.ai/server-url/server-authentication), [Tool response contract](https://docs.vapi.ai/gpt-live/tools)
- [Twilio IncomingPhoneNumber update/readback](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource), [Voice callbacks](https://www.twilio.com/docs/usage/webhooks/voice-webhooks), [Webhook authentication](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
