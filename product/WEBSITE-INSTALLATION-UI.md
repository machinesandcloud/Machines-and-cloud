# Guided website installation: owner interaction contract

Design ready for the next branch after the accepted G1 save repair is committed. This file changes no application behavior and establishes no installed website, production conversation or provider delivery. It implements the owner-facing part of [Website installation and first request](WEBSITE-FIRST-REQUEST.md), using the existing workspace design.

## Outcome and starting point

The owner uses the website already supplied, installs one script, checks it on that website and finds the resulting labeled setup request in Requests. After that, the same card can show the first observed ordinary external request. The owner should always see one concrete next action rather than another onboarding form or a list of infrastructure tasks.

Current source saves `business.website` in `onboard.mjs`, but the install card in `desk.html` only displays a snippet. `desk.js` derives its status and the completed “Activate and install” task from chat readiness/activation, without installation evidence. The editor exposes `widget.allowedOrigins`; its strict supplied-leaf parser does not currently accept a website correction. These are the seams to extend, not reasons to repeat signup or redesign Connections.

The existing embed uses public configuration and the ordinary public chat path. Preserve the coordinator's separately reviewed completion-message repair when branching; do not infer a completed answer from an ended stream or reconstruct an older embed file over that repair.

## One card, one current step

Keep the installation card under Connections, before optional diagnostics. Its title is **“Put your front desk on your website.”** Show the saved website as a readable link and a small **“Change website”** action. No platform question appears by default. Completed earlier steps collapse into an “Installation details” disclosure with the code and instructions still available.

| Current condition | Primary action | Supporting copy and result |
|---|---|---|
| Website absent, invalid or unsuitable for this HTTPS check | **Save website** | Show one prefilled website field, a label and associated error. “Where should customers find your front desk?” The rest of the saved business information stays in place. A missing website does not block the owner's other workspace tasks. |
| Saved website's exact origin is not permitted | **Use this website** | “Allow your front desk on https://shop.example.” Explain before saving: “Changing the allowed website requires another rules review and practice conversation.” Save the explicitly selected origin, retaining other permitted origins; never silently infer `www` or enable chat. |
| Selected origin is permitted; no current observation | **Copy installation code** | “Add this code once in your website's shared footer, before `</body>`, then publish your website.” Display the existing one-line snippet. Success: “Code copied. Publish your website, then check it here.” Copying updates feedback only. |
| Owner is ready to check after installing | **Check on my website** | “Open your website and look for the chat button.” Issue one bounded owner check and open its returned URL. Opening or copying does not claim that the widget was found. A secondary “I need installation instructions” disclosure remains available. |
| Check opened; no matching observation yet | **Check status** | “Waiting for the widget on https://shop.example.” Offer “Open website again” and “Installation help” as secondary recovery actions. A refresh performs an owner status read, not another model turn or a fresh challenge. |
| Widget observed; current customer chat cannot answer | The actual readiness action | “Widget found on your website at [time].” Follow with one current reason and action, such as **Review business rules**, **Try your front desk**, **Activate website chat**, or **Resume website chat** when its existing guard permits it. Installation evidence stays visible. An AI outage/allowance limit offers **Check status** with its actual recovery information. |
| Widget observed and current customer chat can answer; no completed setup request | **Try a sample request** | Reopen the same unexpired check on the website, then offer a deliberate sample prompt inside the installed widget. “Create a sample callback request, then see what arrives in your workspace.” No automatic message is sent. An expired challenge requires a deliberate new check. |
| Matching setup request saved and completed public answer observed | **View setup request** | “Website check completed at [time]. Your sample request is saved as [reference].” Open the existing Requests view and focus that exact record. Keep the setup label and original conversation accessible. |
| Setup check complete; no ordinary external request yet | **Open my website** | “Your website check is complete. No ordinary website request has been recorded yet.” Do not invent a waiting customer or present another required setup task. |
| First qualifying ordinary external request recorded | **View request** | “First website request received at [time] · [reference].” This is observed request evidence, not a verified visitor identity, completed job, delivered notification or revenue. |

During the copy/install step, **“I've published it; check my website”** can advance to the check action without changing an evidence state. A prior Copy click is not a prerequisite: an owner who installed through their web specialist can choose **“Already added the code? Check it.”** No “Done” checkbox certifies installation.

If several saved origins exist, offer their exact HTTPS origins as choices only when selection is necessary. Default to the origin of the saved website. Do not require the owner to retype it. Show the precise selected host before saving or opening it; a changed site does not inherit the old site's check.

## Four facts stay visible and independent

Use a compact status list, not four competing calls to action. Text and icons must convey the state without relying on color.

| Label | Permitted displayed state |
|---|---|
| **Widget on your website** | Not checked / Waiting / Found at [time] / Found previously on [origin] |
| **Customer chat** | Active now / Needs review / Needs practice / Ready to activate / Paused / Daily limit reached / Temporarily unavailable / Closed |
| **Setup request** | Not checked / Request saved; answer not confirmed / Check completed · [reference] |
| **First website request** | None recorded yet / Received · [reference] · [time] |

The UI may say **“Verified on your website”** only when the current selected-origin observation and a matching completed public-path setup check agree under the server contract. Its adjacent customer-chat state still reflects today's readiness. A historical successful check does not override changed rules, a pause, a closed workspace or an exhausted allowance.

Update the existing journey task accordingly: activation alone cannot complete “Activate and install.” Treat activation as its current dynamic fact and complete the installation/check task only from matching observed plus completed setup-request evidence. The first ordinary external request is a subsequent result, not a setup condition the owner can manufacture by checking a box.

## Sample check and interruption recovery

The installed widget identifies this deliberate conversation as **“Website setup check.”** Before the first Send, explain that it uses the ordinary customer-chat allowance and creates a labeled setup request. Display sample customer details rather than asking the owner to reuse a real customer's data. If normal connected notifications can run, say that beside the action; do not promise silence or silently bypass ordinary routing. A supplied sample phone does not grant texting consent.

Start with a callback request, which exercises ordinary lead capture without consuming a real appointment window. The prompt is editable; for example: “I'd like a callback about an AC repair in Katy.” The ordinary agent gathers the missing details. A saved visit created by the same public path may also satisfy the server contract; no duplicate test-booking path is added.

Do not display a green completed state from text deltas, a claimed booking in assistant prose, public config HTTP200 or private Practice. The completed evidence needs the server's exact durable request reference, its successful public answer receipt, and an acknowledgment from the embed after receiving a valid completion message. The backend writing an answer or enqueueing `done` does not establish that the browser received it. This acknowledgment is bounded installation telemetry, not proof that a human read the answer. If the stream is interrupted after a request may have been saved, show **“Your request may already be saved. Check its status before trying again.”** Reconcile the same check/contact/turn through the server; do not automatically resend or mint a new contact. When the record is known but the answer is not complete, show **“Request saved; answer not confirmed”** and link to the record. This does not satisfy the complete-check fact.

A timed-out attempt offers **“Start a new website check”** only after its exact status is read or the attempt is definitively expired. Keep its prior evidence/history. Reopening an unexpired attempt uses the same binding and expiry. Retain the one-time returned check URL only in the current tab's private session storage, bound to that owner session, tenant incarnation, selected origin, current revision and expiry. Clear it on sign-out, expiry, replacement or mismatch. If storage is unavailable or the raw URL was lost, explain that limitation and offer a deliberate new attempt; do not recreate its secret from the safe DTO or silently start another check.

## Installation help and handoff

The default guide is the generic shared-footer instruction. The help disclosure asks **“How is your website managed?”** only when its answer changes the instructions, with **“I'm not sure / someone manages it”** available. A named platform guide ships only after its exact steps, required account permissions and plan limits are verified against official documentation and independently checked. Do not imply automatic WordPress, Wix, Shopify or other website-admin access exists.

The minimal handoff is **“Copy instructions for my web person.”** It contains the selected website, public script, generic placement/publish instructions and a request to tell the owner when publication is complete. It contains no owner bearer, private portal link, check challenge, API key or invitation to unrestricted account access. Copying it sends no email. The owner returns to run the check. Specialist fulfillment and fees remain unlaunched and are not offered as a purchasable button.

Use an ordinary new tab with opener isolation for the checked website. Strip the bounded check parameter as the embed contract requires, preserving unrelated routes/fragments. If a router fragment cannot safely carry the check, show a deliberate manual-check alternative instead of overwriting the route. If the browser blocks a new tab, present an explicit **“Open website check”** link for the same current attempt; do not create a second challenge. No server crawler, redirect follower or website-admin credential form is introduced.

## Proposed server/UI boundary

The coordinator confirmed owner DTO name **`websiteInstallation`** and owner action **`start_website_check`**. The following is the smallest interaction shape to finalize with the server implementation; it is not an existing endpoint response.

- Authenticated GET returns the saved website, selected exact origin, current configuration/edit revisions, safe evidence states/times and record references, current customer-chat availability and one reason/next action. Challenge secrets/session bindings never appear in this DTO.
- `POST /api/client` with `action: 'start_website_check'`, `expectedRevision`, `expectedEditRevision` and the explicitly selected allowed origin creates one bounded attempt and returns its raw challenge/check URL once. An explicit new attempt supersedes the previous one. It does not activate chat, certify review, reserve AI or fetch the website.
- Website correction extends the strict supplied-leaf owner parser and edit revision with `business.website`; unrelated facts remain untouched. Changing the website alone does not change the business review revision. A necessary `widget.allowedOrigins` change already affects configuration revision and requires the explained review/practice loop.
- Observation is a bounded public write from the actual embed with the exact external Origin and challenge. It updates only observation evidence. The public chat completion hook persists a matched durable-request and successful-answer receipt after the ordinary activation, source, capacity, consent, allowance and storage checks succeed.
- After valid `done`, the embed sends an idempotent acknowledgment bound to challenge, contact and stable turn/completion reference. The evidence endpoint qualifies complete-check state only when that acknowledgment matches the existing server completion receipt and exact durable request. A client claim alone, an ended stream, or backend completion without the acknowledgment cannot turn the check green. Lost acknowledgment can be retried against that same receipt without replaying the chat/model turn.
- Status/reconciliation reads use the current owner session. They never manufacture or resend a customer turn. Exact saved record kind/ID, contact/check binding and current/stale indication drive record links and recovery.

Suggested safe owner DTO fields are `website`, `selectedOrigin`, `observation`, `customerChat`, `setupRequest`, `firstExternalRequest`, `attempt` (safe state/expiry only), and `nextAction` with an enumerated action/reason. Let the server derive the evidence rather than duplicate its rules in browser code. An unknown state must fall back to a neutral status-read action, not “active.” The server still owns tenant incarnation, initiating-session expiry, exact origin and record binding.

## Concrete next-branch edits

| File | Minimal change |
|---|---|
| `desk.html` | Give the existing card `#websiteInstallCard`; reuse `#snippet`, `#copySnippet`, `#copyMessage`. Add `#websiteInstallSite`, a conditional `#websiteInstallEdit` form with `#websiteInstallWebsite` and associated `#websiteInstallWebsiteError`, `#websiteInstallStep`, `#websiteInstallFacts`, one `#websiteInstallPrimary`, `#websiteInstallHelp` and `#websiteInstallMessage`. Keep install-code/handoff details collapsible. |
| `desk.js` | Render the server DTO on the existing owner load/update path; route its single next action; preserve local site-correction input across pending saves/errors. Use existing revision/conflict handling for website/origin edits. Guard every await by current portal generation/session and connected DOM. The copy/handoff/check buttons have independent busy states and explicit retry. Focus the exact request row by safe record kind/ID. |
| `desk.css` | Reuse card, status, form/error and button tokens. Add only the compact fact list/current-step layout, wrapping long URLs/code at320px. No new visual shell. |
| `embed.js` | Add the bounded setup-check observation/prompt/state UI from the server contract, with associated status and ordinary public Send. Retain the accepted completion-message repair and accessible open/close behavior. |
| `netlify/functions/client.mjs` and a small evidence module | Owner check creation/status and safe DTO; bounded public observation; durable tenant/session/origin/revision bindings. |
| `netlify/functions/chat.mjs` | Qualify the actual saved request and observed successful answer through the ordinary web path; stable reconciliation, test label and first ordinary request marker. |
| `netlify/functions/lib/workspace-edit.mjs` | Strict supplied website correction plus edit-revision coverage. No activation or provider side effect. |

No runtime edit starts in the accepted G1 branch before its commit. The coordinator cuts the next feature branch and reconciles its base with the separate accepted embed repair.

## Acceptance and priority recovery check

Before adding check controls, repair the independently reproduced session-expiry return in its separate branch. QA used `/tmp/mc-session-expiry-c28` and retained `scratchpad/session-expiry-background-baseline.json`: background `mc:desk-refresh` GET401 hides but retains private DOM/token, and conflict “Check latest” GET401 leaves the private portal displayed; normal config PUT401 correctly clears via `mc:session-expired`. Its three baseline assertions confirm the defects with stable hashes and zero external requests; they do not establish a repair or a production incident. G1 stays untouched. Acceptance must expire the session with a held refresh/pending response, clear private content and challenge material, reject stale repopulation and stop further mutation/open-check actions. Distinguish forbidden/expired authority from a transient GET503, which retains the draft and offers retry.

For the installation slice, independent QA must use actual handlers, embed and owner assets with isolated storage/model doubles and physical network denied:

1. Saved website appears without reentry; missing/invalid correction has an associated error; delayed saves retain newer typing. Explicit origin selection preserves unrelated origins and explains the review revision change.
2. Copy/handoff/“I've published it”/public config/private Practice never certify installation. Handoff contains no private token or challenge. A blocked popup reuses the same attempt.
3. Exact external-origin observation, current readiness and setup-request completion render separately at320/390/1440px. A wrong/missing Origin, preview, expired session/challenge, replaced tenant and wrong site cannot qualify evidence or spend AI.
4. A permitted public setup request produces the exact labeled lead/visit and conversation in the correct owner view. Complete-answer evidence requires the success message and its matching embed acknowledgment; a dropped final packet or lost acknowledgment stays unconfirmed until reconciled. Interrupted/uncertain responses reconcile without duplicate requests or automatic resend.
5. Pause, rules/origin changes, allowance exhaustion, closure and session expiry preserve honest historical evidence while gating current answers/actions. No check bypasses review, provider/consent gates or ordinary allowance.
6. Two simultaneous ordinary external requests preserve both records and one earliest qualified first marker. A labeled setup request cannot win it. Exact request links focus the corresponding existing record, not a vaguely related list.
7. Keyboard/screen-reader checks cover labels, field error focus, busy/retry states, live status, external-tab return and widget close/focus return. New status reads never steal focus.

PO acceptance is the full saved website → installed widget → explicit public setup request → matching useful owner request. Local acceptance, publication, real-model verification and a first customer's result remain separately recorded.
