# G7: make a saved customer request actionable

**Next implementation; not an available feature.** This document specifies the next local customer workflow. It changes no application behavior, provider setting or delivery gate and is not publication approval.

The reviewed application base is `bbb4643cdecaf529dc4b3a95997cc77728ae6414` in `/tmp/mc-availability-recovery-e461`, branch `work/availability-recovery`: tenant isolation `e461ad1`, sales positioning `bd4b4ae`, then availability-session recovery `bbb4643`. Expanded trade choices were committed during this document review as `0bd76c9d05fe9c22f0c7e84dbfab49b0d1403adb`; that UI change is separate from this design. Start implementation in a separate checkout from the combined accepted application, without unrelated main runtime.

[Launch readiness](LAUNCH-READINESS.md) remains the production and provider record. Published application `659cab8` is disabled by the hosting account credit condition recorded there. Local acceptance, publication, restored availability and an actual customer outcome are separate stages. No new hosting or provider observation was made for this document.

## Customer outcome and smallest useful scope

A shop owner opens an existing request, understands what the customer wants, takes responsibility, chooses a next action and due time, and records what actually happened. An unsuccessful call remains visible as unfinished work. Reaching a person and completing their request are separate facts. The owner can leave and return without losing a pending action or creating duplicates.

Use the current Requests pane and existing visual language. Add a request-detail surface alongside the existing visit detail. Do not create a second CRM, a team-permission system, a call/SMS/email sender, an automated callback promise, or a new paid feature for this slice. The sole authenticated customer principal is the verified owner. Recording responsibility means that owner has taken the request; a note can describe a manual handoff, but does not grant a colleague access or notify them.

Start with supported-v1 leads. Existing Add/reschedule/cancel visit controls remain the authority for appointments. A saved appointment must not be relabeled as a reached customer, dispatched technician or completed job. Setup-check records remain visibly labeled and excluded from customer/contact/completion metrics.

## Actual starting defects

- `desk.js` renders leads as a table with status/outcome and, sometimes, alert acknowledgment. There is no request-detail action for responsibility, due time or contact result.
- `/api/client` offers visit changes, acknowledgments and flags, but no verified owner callback-outcome action. `ackAlertsFor` handles alert receipt only; it must not become customer-contact proof.
- `trackCallback` and `runCallbackCheck` intentionally skip self-service workspaces. Do not revive legacy text/escalation timers to fake the new workflow.
- The legacy `ownerCommand('called')` sets `calledAt/status` and returns 'you reached'; that combines attempt and contact and is not the new v1 contract.
- `flagLead` can update an existing lead by reading then saving an entire record. Storing new owner workflow inside that record would let a delayed AI/source save erase it. This is a concrete lost-update seam.

## Selected storage boundary

Use a new `request_followup` sidecar keyed by `slug/tenantIdentity/leadId`. Keep its state and authoritative action journal in that document under conditional writes. The sidecar cannot make an unbound lead current: every read/mutation still checks the actual source lead and all identity markers. It is never adopted from a slug-only key.

This keeps owner workflow independent of source/model updates and avoids retrofitting every lead writer in the first slice. It also avoids making provider telemetry, AI history or a business-configuration edit reset the owner's work.

Record a source revision over the significant request snapshot: record ID/slug, identity markers, customer name/phone/address, issue/reason/urgency/wanted, source status and current source update marker. Every action retains the exact source revision and contact snapshot it referred to. Source changes after an owner decision do not silently inherit that decision. The detail reads 'Updated request — review before continuing', preserves the prior history, and offers an explicit review/reopen action. A changed phone cannot inherit a reached result for the previous phone.

The action journal is the authoritative audit; `logEvent(c,...)` is an additional originating-identity projection. Failure to write that projection cannot erase a committed action or justify repeating it. Bound the first implementation to 250 action entries per request, with notes limited to 1,000 characters and exact allowed fields. At the bound, return `request_history_full` without a write: retained detail, history and export stay readable, and the owner sees that further changes require support review. Never silently truncate audit or submission identities, or reset a full document to admit another command. A later archive migration needs its own continuation design; this slice does not claim one exists.

## State and transitions

Keep two axes instead of overloading source `lead.status`:

- Contact evidence: `not_recorded`, `attempted`, `reached`. Attempts retain their own channel/result/time/note. A `tel:` click records no attempt or call result.
- Work state: `open` or `completed`, plus the selected next action, responsible owner and due time. Completion is an explicit owner statement with a resolution; it does not imply payment, service delivery or a finished job.

Required minimal owner actions:

1. **Take responsibility:** records the signed-in owner's identity. Does not mark reached/completed or stop overdue work.
2. **Set next step:** choose call, prepare a quote, review a visit request, answer a question, or another clearly labeled owner action; enter an explicit due time. The customer's free-text requested time stays separate and is not converted into a promise automatically.
3. **Log contact attempt:** record no answer, voicemail or another stated result. A failed attempt does not close the task, clear its due time or increment reached/completed counts. Log a call only when the owner confirms they placed it.
4. **Mark reached:** the owner confirms they actually communicated with the customer. Record when/channel; do not assume a voicemail or a sent message was received. This alone does not complete any remaining quote/visit/handoff work.
5. **Complete request:** record a clear resolution. Examples: question answered; visit saved and linked; customer declined; duplicate; no further action needed with a reason. A linked visit must be an exactly current owned booking. Closing as duplicate/invalid contact must not fabricate reached evidence.
6. **Reopen:** explicit reason; preserve prior decisions/contact history and request a new next step as needed.

Use 'Follow-up due' for the owner-selected due time. Until completion or an explicit audited next-step change, acknowledgment and contact attempts do not stop an overdue item. Reaching a person does not silently clear still-open follow-up. No customer-facing response deadline is created by this internal reminder.

The normal UI can present the first useful actions rather than every transition at once: 'I'll handle this', 'Log an attempt', 'I reached the customer', 'Complete request', 'Change next step'. Do not call an owner-local task 'automatically assigned to staff'.

## Authority, API and recovery contract

A new shared module such as `lib/request-follow-through.mjs` owns validation, DTO construction and mutation. It imports no model/provider sender. Caller adapters retain current verified mailbox/session checks and allowed site-origin rules. Only the current verified customer owner can change follow-up in this first slice. An operator may read the same safe projection through existing operator authority, but cannot impersonate the owner or use a body-supplied actor to mutate it. Operator mutation and staff accounts are separate future scope.

Selected existing-client action: `POST /api/client?c=<slug>` with `action: "update_request_followup"`, `leadId`, `expectedSourceRevision`, `expectedFollowupRevision`, a cryptographically random 32-hex-character stable `submissionId`, a transition type and its exact allowed fields. Do not accept tenant/actor/session/owner identity from the body. Unknown fields and malformed values fail before mutation with associated field errors. Source and follow-up revisions are separate opaque hashes. A missing sidecar has a deterministic initial revision bound to the captured tenant and lead ID, never a shared blank edit token. IDs must accept the actual existing random and stable record-ID shapes.

Before admission and inside each sidecar CAS attempt, strongly read current client, current session and exact lead. Require supported version, exact captured tenant, active unexpired session matching normalized owner email, and consistent originating source markers. Testing/live/paused owners may record local follow-up; cancelled/unsupported/foreign records stay read-only. Provider readiness and AI allowances are irrelevant to recording manual work and cannot be changed by this action.

Within the CAS, check an existing submission receipt before treating a revision mismatch as a new intent. Same submission/payload/actor returns its prior committed result plus the latest safe state; reusing the ID for different content returns 409. A fresh action with a stale sidecar revision returns 409 without replacing the owner's form. Include the intended action, exact source snapshot and actor in the idempotency digest.

Because the source and sidecar are separate documents, recheck source/client/session after writing. If the source changed across the decision, retain the recorded historical action but return an explicit refresh/review requirement; never claim the newer source was completed. Identity replacement can leave only old-tenant audit, and cannot expose the action to the new tenant. Avoid rolling back or retrying a write based on a missing response.

Generate and persist one pending submission per form intent before POST, bound to tenant, lead, source revision and the current session in private tab storage. Do not copy the session bearer into the submission payload or audit. Disable duplicate submit/Enter while pending, preserve newer typing, and on timeout/reload reconcile the same submission before another mutation. Do not automatically replay a call, model request or customer message. For an uncertain local command, the same saved intent is the only retry allowed until status resolves.

A direct authenticated detail/status lookup by exact request ID and optional submission ID is required; it must not depend on the request still appearing in the latest 100 list. Show current list scope/incompleteness and retain the G3 full-export refusal. Newly accepted records remain discoverable through the tenant index. No bearer/challenge/token appears in a detail URL or export.

## Owner and operator view

The detail shows customer name/phone, requested work, exact saved words about timing, source conversation reference, urgency, whether this is a setup check, responsibility, next action/due time, contact evidence, completion resolution and chronological owner action history. The source issue/request and current follow-up status should be readable without technical record IDs; IDs remain internal references.

Use a real phone link to let the owner choose their device's dialing flow. It cannot automatically mark 'called'. The UI must name the action after the evidence: 'Attempt logged' or 'Marked reached', not 'Customer contacted' after a button merely opens the dialer. No email/text/call is sent by logging an outcome.

Dashboard 'Needs you' includes unreviewed updated requests and open due work. 'Reached' metrics require explicit reached evidence. 'Completed request' metrics require explicit completion, keep separate from visits/jobs/revenue, and exclude setup checks. Counts remain scoped to the loaded records when history is partial. Exports include the workflow status/next step/contact facts and audit in an understandable format without adding a claim of verified FSM import.

## Acceptance to hand to independent QA

1. A synthetic callback saved through the actual public handler becomes the same visible request, with detail and correct source facts; private practice stays separate. Use local model/storage fixtures for this acceptance, with physical network denied.
2. Take responsibility, set an explicit due time, reload, and see exactly those saved facts. No notification/provider/model operation occurs.
3. Acknowledgment, opening a phone link and a failed call attempt never count as reached/completed. A past due item remains visible until an explicit next-step/completion decision.
4. Record reached, then leave a quote/visit next action open. Complete later with a clear resolution. Appointment and contact/work status remain independent.
5. Close a duplicate without claiming contact. Reopen with a reason and retain the full prior history.
6. Reject blank/invalid fields inline with focus and retained input; complete with keyboard at 320/390/1440 px and verify loading/focus recovery.
7. Two tabs race the same workflow revision. One wins; the other gets a useful conflict with its input preserved. Test a different source update while an action is pending.
8. Hold `flagLead` after it reads a prior record, commit follow-up, then finish the AI source save. Owner workflow/audit survive; changed source is flagged for review rather than silently certified.
9. Lose the committed sidecar write response; reconcile/retry the same submission and observe one action. Same ID with changed content refuses. The journal can recover if the extra event projection fails. At the action limit, refuse a new command without truncation and retain readable detail, audit, submission receipts and export.
10. Replace owner key/email, expire/revoke the session, cancel the workspace or conflict provenance while a mutation/read is held. No new owner receives old state and no invalid authority can apply a new action.
11. Exact request-detail lookup works beyond the latest 100 rows; partial list/export messaging remains honest. A foreign/untagged guessed ID returns no private record.
12. Setup-check actions remain labeled and excluded from business metrics. No action enables a channel, changes an external appointment, sends a customer message or implies a staff login/automatic assignment. A direct operator or body-supplied actor cannot bypass owner-only mutation authority.

## Implementation ownership and next action

Architect/backend: sidecar/revision/idempotency contract, exact source authority and race semantics. Engineer/UI: existing Requests detail and recovery, next-step/due/contact controls, accessible field feedback. QA: independent real handlers/DOM plus source/model doubles with physical network denied. PO: follow a request from actual save to attempted/reached/completed without ambiguous claims. PM: record exact accepted local source separately from publication/provider/customer proof. OM: subsequent real operating drill after hosting is restored.

Implementation should start in a separate checkout from the combined accepted application after this batch is reviewed and committed. No account change or paid effect is needed for local implementation. This proposal is not an available feature or a publication approval.
