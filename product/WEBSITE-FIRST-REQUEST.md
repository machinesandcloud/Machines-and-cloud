# Guided website installation and the first request

**Selected next local implementation after the settings-save repair.** This is an implementable contract, not a shipped feature or authority for a hosted/model/email test. It extends the existing website widget and owner portal. It adds no public website crawler, website-admin connection or arbitrary URL fetch.

## Customer outcome

An owner uses the website address already saved during signup, chooses installation instructions when needed, adds one script and checks it from that website. The portal shows whether the widget was actually observed there, whether customer chat can currently answer, whether a complete check conversation reached the shop and whether a later ordinary external request arrived. An unavailable or partially configured channel has one concrete next action.

Copying a snippet, clicking “Done,” opening a private rehearsal or fetching public configuration must never complete this outcome. The check uses the same embed, public configuration, origin/activation checks, customer AI allowance and request-saving path as an ordinary visitor. It cannot borrow an owner bearer to bypass customer readiness.

## Existing implementation to extend

| Path | Existing behavior | Change for this slice |
|---|---|---|
| `netlify/functions/onboard.mjs` | Saves the business website. | Reuse that saved fact; do not ask the owner to type the same address again. An absent or unsuitable address gets a field-level correction. |
| `desk.js`, `desk.html` | Show an embed snippet and editable allowed origins. | Add the small guided installation card, copy feedback, check action and factual status. Use the new edit-revision contract for any changed origin. |
| `embed.js` | Loads public config, presents customer chat and streams `/api/chat`. | Report a bounded installation challenge from its actual page; carry the challenge only for the owner's check conversation; require a valid completion message before recording a completed answer. |
| `netlify/functions/client.mjs` | Returns public readiness and authenticated owner details. | Add owner-only check creation/status and the evidence DTO. Public config remains public; its success alone does not certify installation. |
| `netlify/functions/chat.mjs` | Enforces customer activation, source rules and AI limits, saves conversations, and returns saved lead/visit references. | Add evidence only after that real path succeeds. Do not add a bypass, a fake-model production branch or a duplicate test booking implementation. |
| `setup.mjs`, `self-service-ai.mjs`, existing booking/lead stores | Bind readiness to reviewed/tested rules, available AI allowance and actual saved records. | Retain those authorities. Installation evidence cannot create readiness or a live-test proof. |

## Four separate facts

| Fact shown to the owner | Authoritative evidence | What it does not prove |
|---|---|---|
| **Widget found on this website** | A current owner-issued challenge was presented by the real embed's browser request with the exact configured external `Origin`, tenant/incarnation and check binding. Store the server observation time. | An accepted heartbeat is limited telemetry; a script can be copied elsewhere and request headers can be forged outside a browser. It is neither domain ownership proof nor customer-chat activation authority. |
| **Customer chat is ready / needs attention** | Current `setupReadiness`, active website channel, source eligibility and AI allowance. | A copied script or prior successful check cannot override a pause, changed rules, exhausted allowance or disabled service. |
| **Website check completed** | A challenge-tagged conversation went through the ordinary public web path, finished successfully, and produced a durable matching request/visit visible through the owner API. The stored event links the conversation/contact and exact saved record. | This synthetic setup check is not a genuine new customer, delivered notification, confirmed human callback or external Calendar event. |
| **First external request received** | A later ordinary, untagged public web conversation creates a durable tenant-bound lead/visit from a permitted external origin. Show its actual reference/time and link to the request. | This is the first observed external request, not an assertion about the visitor's identity, conversion, revenue or completion of the job. |

The customer label may say “Verified on your website” only when the widget observation and completed public-path check agree. The owner must be able to open its saved check request and see why it is a test. All four facts remain separate in storage and in the UI.

## Minimal server contract

### 1. Create an owner-bound check

Add one supported owner action, for example `start_website_check`, under `/api/client`. Require the current owner session, supported v1 workspace, exact tenant incarnation, current configuration/edit revisions and an explicitly selected origin from the saved business website or allowed-origin list. Reject closed workspaces. The action must not enable chat, certify review/testing or reserve an AI request.

Use the same HTTPS origin canonicalization for the owner selection, embed observation and qualification of request evidence. Production checks require HTTPS and a present, exact browser origin. Do not use the general chat helper's missing-origin, platform-preview or host-only compatibility exemptions as installation proof. Offline loopback fixtures are explicitly synthetic and cannot establish hosted evidence.

Create a random, short-lived, narrowly scoped challenge (for example, 256 bits and 10 minutes) and store its hash, public tenant slug, private tenant identity, origin, configuration revision, owner session hash, creation/expiry and state. Keep raw challenge material out of general logs, analytics and the owner DTO. Return it once to the authenticated owner. Only one current attempt is needed; a deliberate new attempt supersedes the previous challenge without deleting history. An expired or revoked initiating session invalidates the remaining challenge; the raw challenge never renews owner authority.

The challenge conveys only permission to record installation/check evidence for that workspace and origin. It grants no private reads, admin access, service activation, messages, provider setup or increased model allowance.

### 2. Observe the actual embed, without scanning the website

“Check on my website” opens the selected website in the owner's browser with the bounded challenge. A small fragment parameter is suitable for the minimal homepage flow: the embed reads/removes only its check parameter and never receives the owner's bearer. Preserve unrelated page/router fragments; if the page cannot safely carry the check parameter, explain that limitation and use a deliberate manual check rather than corrupt its route or silently crawl it.

Add a narrow public observation endpoint (or an explicitly separated public mode) which accepts the challenge, public slug and current widget version. It verifies the stored challenge hash/expiry, current tenant incarnation, the exact external Origin, selected origin still permitted, and current workspace lifecycle. It makes no outbound request. A replay may return the same observation idempotently; it cannot move a check to another tenant/site or reset its expiry.

The response distinguishes “widget observed” from “chat not ready,” with a safe reason such as paused, rules need review or allowance unavailable. The launcher may show that check result to the owner. Do not create a request, contact a person or mark the first request at this point.

### 3. Finish a real public-path check

Offer a clear setup-check prompt on the installed widget. The owner uses synthetic details and is told that a saved test request will appear in the workspace. Use the ordinary public `/api/chat` path, without an owner bearer or `channel:test`. Carry the challenge as an optional bounded field that affects evidence labeling only. It cannot loosen the source, activation, budget, safety, booking or consent rules.

Before any model call, validate the check binding and the existing public web requirements. If readiness is not met, spend no AI request and show the correct owner next step. When a model request is made, it consumes the ordinary bounded allowance. A fake reply or model-free connectivity check cannot complete the conversation fact.

At successful completion, qualify only a lead/visit actually saved by that turn's ordinary tool path. Bind the evidence to tenant incarnation, origin, check ID, conversation/contact reference, saved record kind/ID and current configuration revision. Record only after the durable record can be read and matches that tenant and contact. Question-only answers may be useful but do not satisfy “first request received.” A provider queue or assistant sentence is not a substitute for that record.

Keep server completion separate from browser receipt. A completed model run or an enqueued terminal packet cannot establish that the installed widget received the answer. After the embed receives and validates the explicit terminal `done`, it sends a narrow idempotent acknowledgment bound to the same check, contact and logical turn. The evidence endpoint accepts it only against the server's completion receipt and exact durable request. A bare client assertion cannot complete the check. If the acknowledgment is lost, status/reconciliation may retry that acknowledgment without replaying the customer turn or starting another model request. Until both sides agree, show the saved record separately as “Request saved; answer not confirmed.” This is bounded browser telemetry, not proof that a human read the answer.

Tag check records so customer counts/revenue/follow-up reports exclude them. They remain visible in the portal with a “Setup check” label and retain their history. Do not infer SMS consent from the check or silently trigger a real customer notification. Scope the controlled fixture so its owner knows which ordinary record effects occur; do not suppress an already-authorized real channel by inventing a hidden test implementation.

### 4. Record the first ordinary external request

The same durable-record hook can retain the earliest qualifying untagged external web request. Use conditional storage so simultaneous requests do not overwrite that first observation or invent duplicates. Replayed chat/tool results must not create another “first” event. Readiness, activation, origin, tenant and record bindings still apply.

The owner DTO returns only safe state, timestamps, configured origin, a reason/next action, current/stale configuration indication and links to records the owner can already read. Do not expose challenge hashes, session bindings, provider credentials or private records through the public endpoint.

## UI and recovery

Show one installation card with the known website, a platform choice only when it changes the instructions, the script/copy action and “Check on my website.” Start with a generic HTML install plus one independently verified platform guide; unsupported platforms get the generic guide and a shareable handoff. Paid specialist setup and direct website-admin integrations are separate unlaunched services.

The card keeps a successful historical observation while showing current readiness honestly. A paused shop can still have an installed script; changed rules can require a new review/test without saying the script vanished. An origin change invalidates evidence for the old selected site; tenant replacement cannot inherit the old proof. A timed-out check can be restarted deliberately, with no automatic repeated model requests.

Arrange source/origin correction before final rules review and rehearsal where possible. The current configuration revision includes widget settings, so a late origin edit must explain why readiness changed instead of trapping the owner in an unexplained loop.

## Acceptance for implementation and QA

1. Finish the existing owner setup, save a website/origin once, and reach the guide without reentering business details. A missing address gets a useful field error. Copy success alone changes no verification state.
2. On an owned synthetic external-origin page, load the actual embed and observe the challenge. The portal shows that observation independently of customer-chat readiness.
3. A public configuration response with status 200, a private owner rehearsal, a forged/replayed observation, a platform preview and a request with no Origin cannot establish completed installation or a first request.
4. Reject expired/wrong-origin/wrong-tenant challenges before model spending. The server never fetches the supplied website, follows its redirects or accepts a URL to scan.
5. A paused/not-ready/exhausted customer path stays unavailable; installation proof cannot bypass it. The owner sees the actual next step while the saved widget observation remains intelligible.
6. Run the installed widget's permitted check conversation through the real public handler and ordinary request tool. Verify exact contact/details, durable record, check label and owner link. Use offline model/storage doubles for local acceptance; separately authorize any live inference.
7. Interrupt the stream after text deltas but before the completion message. Show an incomplete/failure state; do not persist the partial assistant output as a completed answer or mark the check complete. Do not blindly resend a turn which might already have saved a request.
8. Finish the same request after an uncertain response through stable references/reconciliation; demonstrate no duplicate visit or duplicate first-event marker. An eventual saved record and an observed completed browser answer remain separately described.
9. Create two simultaneous ordinary external requests. Preserve one earliest qualified first-event record and both actual requests. A synthetic check cannot win the ordinary-customer marker.
10. Change settings/origin, pause, cancel, replace the tenant and expire the owner session. Verify safe current/stale statuses, no inherited private evidence and no activation/notification side effects from the check mechanism.
11. Inspect the card and actual embed at 320px, 390px and 1440px with keyboard navigation, associated errors and screen-reader status announcements. Open and close the widget without a trapped or hidden focus target.
12. PO observes the complete setup→install→public request→owner action. PM records exact local/deployed/provider proof and any remaining customer step. Only then mark the local slice accepted; publication and a first customer's result remain separate.

## Role ownership and next action

Architect defines the shared origin/evidence contract and keeps server observations separate from authority. Engineer extends the current handlers and embed with the smallest durable state/hook above. UI/UX makes the owner complete the path with one action at a time. QA independently exercises the real public path and failure cases. PO accepts a saved, useful request and a clear owner next action. OM and Marketing/Sales describe only the installed/active capabilities actually observed.

**Ready local work:** after Sprint19 acceptance, implement the owner guide and bounded observation/evidence storage with synthetic origin fixtures, then the ordinary public-chat completion hook and stream recovery. No new account credential, public crawl, provider activation or paid build is needed to begin that local slice.

## Local implementation acceptance, October22

The guided owner card and installed-widget check are implemented. Independent QA passed14actual-handler and17browser groups with stable source, no physical/model requests and no browser errors. The permanent backend contract check passed17groups, the focused embed suite passed10groups, and all32required local commands passed together. [Independent acceptance](../scratchpad/website-installation-independent-acceptance.json). [Combined gate](../scratchpad/installation-required-final.json).

The same exact saved request is reconciled after lost evidence writes, with no model replay. Valid answer completion and a matching browser acknowledgment are required to complete the check. Sample traffic stays labeled and excluded from ordinary customer counts/exports. Expired and invalid checks remain in separate blocked history after reload. The setup sample uses the shop's actual saved service/area, with editable synthetic contact details.

This acceptance is local. It establishes no hosted installation, real inference, provider delivery or first customer result. Netlify is paused for exhausted account credits. The separate confirmed same-slug tenant-replacement defect must be repaired and verified before launch.
