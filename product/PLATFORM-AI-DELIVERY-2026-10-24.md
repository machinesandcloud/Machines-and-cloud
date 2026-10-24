# Thumbtack automatic conversation delivery

Implementation scope: the connected shop's native Thumbtack conversation, using its saved business details. This is separate from Angi intake and from an SMS permission grant. The implementation is local until Root records publication and an actual partner proof.

## Customer job

An owner connects their Thumbtack account and chooses their business. They review the saved business details once and turn on AI replies in the existing Connections panel. New customer messages then use the same Inbox request and Thumbtack thread. AI answers from the shop's services, coverage area, hours, published fees, availability and handoff instructions. The owner sees the reply result, a conversation summary and collected visit-request facts. They can pause all automatic replies or take over one conversation. Sending a personal reply also takes over that conversation before it is reserved for delivery.

A visit request remains a request for the shop to confirm. The AI does not create a booking, dispatch a technician, call or text anyone, notify an owner, take a payment or turn an imported phone number into texting permission. A human reply in the provider's thread, a customer stop request, an uncertain result, an emergency handoff or a ready visit request leaves the conversation with the owner.

## Existing path, retained operations

The existing `lead_connections` record retains owner preferences, per-thread turns and the native reply outbox. The original imported request retains the canonical provider message context. No separate work queue is introduced. Connection generation, current workspace identity, saved-rules revision and per-turn identity are checked at admission, model transport, tools and native-send boundaries.

The authenticated webhook saves and queues the current customer turn, then dispatches `/api/platform-ai-background`. The existing ten-minute connection recovery schedule selects retained work and sends the same authenticated background invocation; it does not run the model in its scheduled runtime. Dispatch waits at most three seconds for an acknowledgment. Its acknowledgment means the background task was invoked, not that a customer received a reply. Netlify's supported `-background` suffix permits asynchronous execution for up to fifteen minutes; the scheduled path keeps its fifteen-second work deadline. [Netlify background functions](https://docs.netlify.com/build/functions/background-functions/), [execution limits](https://docs.netlify.com/build/functions/configuration/).

A turn is claimed in the existing connection CAS before model preparation. Prepared delivery is claimed separately. A known daily quota denial before any physical model attempt stays pending for the next Houston-day reset and continues automatically through the same worker. A partial or lost model response is retained for owner review and is not generated again automatically. A native send with a lost response remains `unknown`, blocks a fresh send and is never blindly repeated. A stale generating/sending checkpoint becomes owner work through ordinary scheduled redispatch. A native provider message ID is required before reporting an accepted reply; acceptance is not a customer-read receipt. Accepted, grounded customer contact facts update the existing request used by Inbox, contact actions, exports and normal follow-through. Per-field provenance retains the customer-message, turn and provider-reply identities. Provider refresh preserves these collected contacts and keeps the canonical account context. A local projection failure after a known accepted receipt is repaired by ordinary scheduled recovery without generating or sending another reply; a subsequent customer correction prevents older facts overwriting it.

## AI admission

`MC_PLATFORM_AI_ENABLED` defaults to `0`. Native connection readiness, owner opt-in and current business-rules review are also required. Website activation is not fabricated or required for native conversation authority.

Automatic turns use the existing shared daily AI logical allowance. The same daily CAS also counts physical native-model attempts: at most forty across the platform and ten per current tenant per Houston day. These counts include uncertain model requests and are not reset by pausing, changing rules or reconnecting. Each generation permits at most two physical requests, at most 800 output tokens each, no SDK retries and no server fallback. A validated terminal proposal stops immediately; a second request is needed only when the first checks availability. The supported Opus 5.5 structured JSON format prevents a natural-text-only final answer from bypassing proposal validation. Other conversation modes keep their prior agent behavior. The model sees only the native availability and proposal tools. Proposal validation checks required fields, actual supplied customer facts and equivalent formatting, newest contact corrections, exact published monetary amounts, actual requested-window availability, visit wording and explicit saved life-safety cues before native delivery. The owner remains responsible for confirming requested visits.

## One-time operator/provider prerequisites

1. Obtain Thumbtack partner approval and its issued application credentials, permitted scopes and approved OAuth client authentication method. Endpoint-specific scope names must come from that issuance, not the synthetic tests.
2. Configure the existing callback `https://machinesandcloud.com/api/thumbtack/connect`, token encryption key and service worker key. Keep platform AI execution off until its proof scope is authorized.
3. Confirm the actual business webhook envelopes/authentication, native message receipt, latest-message ordering/pagination boundary and rotating refresh behavior against the issued partner environment. Public message examples show a partial list and pagination.limit; they do not establish that the newest message is always included. The code uses canonical provider reads rather than trusting a webhook's customer or business identity.
4. Have the shop grant its own account access, select its business and review its saved rules. This is not a founder impersonation or a silent permission grant.
5. Run the separately authorized provider/model proof, including owner takeover, native reply receipt, customer correction, stop handling and ordinary scheduled recovery. Record exact source and observed effects before expanding the offer.

The partner-application draft is prepared separately. This document does not authorize application submission, account changes, model calls, vendor sends or activation.

## Angi boundary

Angi's reviewed published contract establishes inbound project/contact delivery. No native Angi thread-send contract has been verified. Current Angi records therefore preserve useful lead context and the owner contact path. Autonomous Angi messaging must wait for a verified native partner capability or a complete separately permissioned channel; it must not be relabelled from a webhook import or an imported phone number.
