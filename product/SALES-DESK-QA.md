# Sales desk acceptance

QA owns independent functional acceptance of the site's **Ask the front desk** assistant. This is separate from the homepage practice companies, tenant owner tests, tenant customer chat, and the self-service platform release. The PO owns conversational usefulness and truthful product outcomes; architect owns authority/context/spend boundaries; engineer owns repairs. Passing a widget fixture does not establish real AI quality.

## Observed baseline

Inspected **October21 Houston / October22 UTC**, local commit `b65c0f4`. [Raw baseline](../scratchpad/sales-desk-baseline.json) records **27 assertions:13 passed,14 returned**, at unchanged six-file source hashes. One return was an early focus observation before the widget's explicit50ms timer, rather than a confirmed product defect; the focused timing report below resolves it separately. The other13 failed assertions include multiple observations of the same underlying broken retry behavior, not13 independent defects.

`scripts/sales-desk-baseline-check.mjs` renders actual local HTML/CSS/widget source, sends ordinary widget requests through the actual chat handler and installed Anthropic SDK protocol double, and injects explicit UI error/stream fixtures. It now refuses source that differs from the recorded baseline. **14 model HTTP requests were intercepted locally; no actual model/provider/website/form request occurred.** Other server fetches throw; all browser requests are fulfilled from files/handlers or blocked. No `capture_lead` tool was invoked, no Netlify form submitted, and no mailbox/customer/paid data used. Only synthetic questions and reserved local origins appear in the evidence.

The baseline is preserved. Root now owns the widget/CSS rewrite, architect owns the sales backend, and PO owns `SALES-DESK.md`. Do not overwrite this baseline or describe it as current repaired-source acceptance.

| Priority / ID | Actual trigger and observed result | Required behavior |
|---|---|---|
| P1 CONTEXT-01 | Send11 ordinary questions with a successful answer after each. Requests1–10 return200; request11 returns400. `transcript.slice(-20)` starts with an assistant message, while `sanitizeMessages` requires a user-first alternating history. | Long conversations retain valid complete turns and the owner's relevant current facts. A fixed history boundary cannot silently disable the assistant. |
| P1 RETRY-01 | First send receives503. User message remains in history but the textarea is empty. Retyping the question sends two adjacent user messages; actual handler returns400. | Keep a retryable draft and one canonical pending turn. Retrying the same message must recover, preserve context and avoid duplicate user messages/actions. |
| P1 DRAFT-01 | While a held request is pending, type the next message and press Enter. Submit clears the composer before `send` checks `busy`, so the next draft disappears. | A pending reply cannot consume or erase another draft. Disable sending or queue deliberately, with visible state. |
| P2 RESET-01 | Click enabled New chat during a held request. The handler returns immediately because `busy`; existing conversation remains, with no explanation. | New chat cancels/invalidates pending work, or is explicitly disabled. A late reply cannot populate the new conversation. |
| P1 STREAM-01 | Return a delta then EOF with no `done`. Widget commits the partial text as a successful assistant message. | Incomplete transport remains incomplete and retryable; no fabricated completed answer or action success. |
| P1 STREAM-02 | Return delta→done→late delta, or delta→error→late delta. Late text mutates the visible bubble after completion/error. The visible response disagrees with persisted history. | Terminal events are final. Ignore late/duplicate data; visible and stored completed messages agree. Error fragments do not become authoritative context. |
| P1 CONTEXT-02 | Return1896 characters with a corrected `$89` fee near the end, then ask the next question. The widget displays the whole answer, but the actual next SDK input contains only1500 assistant characters and loses the correction. | A helpful answer's critical facts cannot be silently removed on the next turn. Use explicit bounded context/fact retention consistent with server validation. |
| P2 STATE-01 | Seed the existing session-storage key with valid JSON object `{"oldFormat":true}`, then open. `transcript.forEach is not a function` breaks the widget. | Treat persisted state as untrusted. Validate/migrate/reset safely without breaking a customer's next question. |
| P1 FACTS-01 | Actual MC system prompt still promises website import, same-day working phone/texting, Calendar booking, notifications, day7 activation and founder follow-up. Current self-service implementation is owner-answer/web-only, with separate blocked phone/SMS capabilities. | Distinguish published plans, locally built features, current activation prerequisites and unavailable channels. Correct stale facts plainly; no promise of delivery, contact, subscription, timeline or integration without evidence. |
| P1 ENTRY-01 | Sales prompt routes commitment into `capture_lead` plus a Steve follow-up rather than directly into the verified self-service workflow. | Give the useful answer first. Offer the real setup link when relevant; no mandatory contact capture or routine founder handoff. |
| P1 PRIVACY-01 | Widget footer says conversations are logged so Steve can follow up, while sales handler does not store a retrievable conversation for that purpose. | Privacy/help text describes actual persistence and follow-up. Do not invent logging or a guaranteed human response. |

Baseline passes include panel viewport containment at320/390/1440, Escape close/launcher focus, closing a held reply without reopening, an actual local setup-link click, and forwarding a fresh correction into recent handler context. A focus read at320 was too early; [focused timing evidence](../scratchpad/sales-desk-baseline-focus.json) uses exact `b65c0f4` widget bytes and waits for the documented asynchronous focus. This isolated timing check is not a whole-site rerun.

Representative baseline images: [320](../scratchpad/sales-desk-first-320.png), [390](../scratchpad/sales-desk-first-390.png), [1440](../scratchpad/sales-desk-first-1440.png), [11th-turn return](../scratchpad/sales-desk-eleventh-turn-return.png).

## Independent repaired-source acceptance

All functional cases remain local, source-bound and network-blocked. Fixtures should match the agreed protocol, never force the UI to look successful. Keep failed attempts, actual submitted histories, visible outcomes and source hashes. A returned case goes back to engineering; do not weaken its customer outcome to match implementation.

| ID | Required executable case | Oracle |
|---|---|---|
| SD-01 | Twelve or more ordinary exchanges, including an early trade/area/fee and a later correction. | Every request passes actual validation; original relevant facts and latest correction remain available in the intended context contract; no stale assertion overrides correction. |
| SD-02 | Helpful long response followed by a question referring to its last important fact. | Server context retains the fact through an explicit bounded policy; no silent truncation of authoritative current information. |
| SD-03 |503/429/network error/timeout, retry, then another question. | Draft retained; retry succeeds; one user turn and no duplicate completed action; no assistant success/error prose contaminates authority. |
| SD-04 | Type/Enter while pending, close/reopen, and submit Shift+Enter multiline. | Draft survives; one request per intended send; pending completion does not steal focus from another page control; keyboard behaves predictably. |
| SD-05 | New chat while a request is delayed; release old response afterward. | New state remains new; pending request cancelled/invalidated; no old text/action/typing indicator survives. |
| SD-06 | Partial EOF, explicit error after delta, malformed line, duplicate `done`, data after terminal event. | No partial success; terminal state stable; visible/persisted histories agree; useful retry remains possible. |
| SD-07 | Malformed JSON, object/oversized/wrong-role persisted history, disabled storage. | Widget remains usable; sensitive app/onboarding storage unaffected; bounded validated history only. |
| SD-08 | Structured action fixtures for setup/sign-in/pricing/demo, plus external URL, JavaScript, API route, traversal, credentials/query injection. | Only explicit product allow-list actions appear. Clicks reach actual local target; no form, purchase, account, recording or contact is initiated implicitly. |
| SD-09 | Suggested question/challenge versus actual send, and any voice-related content. | Intent is explicit; no microphone/voice SDK starts automatically and no misleading callable phone demonstration. |
| SD-10 |320/390/1440 and a short keyboard-like viewport; open/close, input, scroll, links, retry. | Composer/header/actions remain reachable; no horizontal overflow, covered action or clipped message; focus is visible and restored appropriately. |
| SD-11 | Correct old phone/SMS/Calendar/import/pricing/timeline assertions; ask about integrations/Spanish/skepticism. | PO rubric evaluates useful current truthful response, acknowledges corrections, and offers a concrete appropriate next step without a forced lead form. Offline fixtures prove protocol only. |
| SD-12 | Sales-mode input alongside persona/client/private-session fields and tool/action misuse. | Sales capabilities cannot mutate tenants, send emails/forms, contact an owner, reserve visits or cross modes. Sensitive credentials do not enter the sales request or browser output. |
| SD-13 | Missing model/allowance/storage/provider error paths. | Predictable actionable response, no invented result or successful action, no unbounded retry/spending. Paid/model tests remain separately approved with fixed ledger caps. |

Real-model conversational acceptance needs its own proposed bounded cases, raw replies and PO review after offline implementation is concrete. No existing closed provider/model budget is reopened by this document. No publication is approved here.

## Current repaired-source result

**Independent functional QA accepts the bounded offline implementation.** The two final reports are source-stable, and a subsequent hash comparison matched every recorded UI/backend file to the current frozen source. This is local fixture acceptance, not deployed behavior or a judgment that generated advice passes the PO's semantic rubric.

| Evidence | Result | Scope |
|---|---|---|
| [Final UI](../scratchpad/sales-desk-ui-final.json), `scripts/sales-desk-ui-check.mjs` | **50/50** |320/390/1440 and short380px-height panel/composer containment; modal keyboard/focus/inert behavior; twelve-turn outgoing context and long replies/corrections; outage retry plus separate unsent draft; allowance decline; busy Enter; Stop and reset invalidation; closed-panel focus; partial/malformed/error/late/duplicate terminal events; malformed/oversized/blocked storage; bounded-history recovery; strict actions and safe links; copy and download; explicit actual setup/example clicks with no microphone; visible planning/fit receipts and reload. All responses are local UI fixtures. |
| [Final backend](../scratchpad/sales-desk-backend-qa-final.json), `scripts/sales-desk-backend-qa-check.mjs` | **48/48** | Actual sales handler and installed Anthropic SDK protocol double: twelve ordinary turns retain original facts; helpful long answer and latest correction reach the SDK intact; deterministic total1188 versus routed297 without invented missed share; corrected390→9 minutes; required Jobber/dispatch gap remains not-fit; optional actions; removed lead-capture tool; unchanged tenant/customer stores; current facts; invalid histories/mixed modes rejected before spend; allowance GET does not charge; incomplete model output is rejected; SDK503 has no automatic retry; exactly one competing final allowance turn admitted. **30 SDK HTTP responses intercepted; zero actual requests.** |

The initial UI46-pass report remains in `sales-desk-ui-first.json`; the final adds corrected tool receipts and destination controls. The initial backend report `sales-desk-backend-qa-first.json` retained33/37: its collector attempted to parse a JSON tool payload together with the existing appended delivery reminder. The four failures were collector extraction failures, not wrong arithmetic/fit data; the raw events already contained correct values. The final collector parses the JSON portion and independently checks equality with the structured returned event. The original report is preserved.

Final source fingerprints are SHA256 of compact JSON for sorted `[path, individualSHA256]` pairs; individual before/after hashes remain in each raw report:

- UI, five files: `04a9797dbdbd256fa7e20803fe229ec2c78f256cc1052c13b4c7452f8f114903`.
- Backend, four files: `cc2d0e3e7f9f3dc073f3ecff4cc1a188c68269321a0e7f8fdc324446bee31859`.

The accepted widget SHA is `d7e9971aaeac5d31674acf637217309b77ed9be1c45c99ad9fbd260e0f50792d`; the sales handler SHA is `4a52d73b26fb3b3c5a5d43c6b531e57344019e10e15c95616c5feee8e9e83015`. Changes to these sources require an appropriate bounded follow-up or exact source bridge, not relabeling an older result.

**Subsequent contact cleanup, accepted independently:** [15/15 targeted checks](../scratchpad/sales-desk-contact-source-bridge.json) inspect the actual `salesSystem()` and both English/Spanish contact events. The system no longer contains a literal email address or telephone number; the optional contact action still offers only `https://calendly.com/ngoumnaisteve/30` for the visitor to choose. Reversing exactly the one changed company-facts line reproduces the previous accepted sales-module SHA. The other three backend files and all five accepted UI files match their recorded hashes exactly. No SDK, external website, microphone or provider request was made. The48 backend and50 UI assertions were not relabeled as rerun. Current bridged backend fingerprint: `f6fc3b3505ff55a72a4c96985f8ce3ddad3c1d6c7f60ff475fcf8e5fafe1bd25`; the UI fingerprint remains unchanged.

The optional contact action now points only to the existing fixed Calendly page, opens in a new tab with `noopener`, and never books automatically. QA inspects the destination without visiting the external service. Arbitrary model-supplied destinations, script links, API paths and credential query parameters remain non-actionable text. The actual English plumbing selection and signup navigation are exercised only against local files/handlers; no microphone, account, form or service provider is invoked.

Representative repaired images: [mobile](../scratchpad/sales-desk-current-390-844.png), [320px](../scratchpad/sales-desk-current-320-720.png), [desktop](../scratchpad/sales-desk-current-1440-960.png), [short viewport](../scratchpad/sales-desk-current-390-380.png), [planning receipt](../scratchpad/sales-desk-planning-receipt-390.png).

Reproduce only offline:

```sh
node scripts/sales-desk-ui-check.mjs --output scratchpad/sales-desk-ui-new-run.json
node scripts/sales-desk-backend-qa-check.mjs --output scratchpad/sales-desk-backend-new-run.json
node scripts/sales-desk-contact-check.mjs
```

**Still open:** actual-model full-thread usefulness, natural Spanish, correction handling by the model itself, truthful uncertainty and work-product quality under the PO rubric; hosted policy/interaction after an approved publication; real-customer outcomes. Fixture final replies are intentionally controlled and cannot establish these. The proposed real-model rehearsal needs its own authorization, independent HTTP ledger and fixed cap; the30 intercepted offline responses above are not that rehearsal and consume no prior/new live-provider budget.
