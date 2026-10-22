# Sprint 19: trustworthy business-detail editing

October 22, 2026, Houston. **Selected next implementation slice; not implemented or published by this assessment.** The [PO](PO-NEXT-WORK-2026-10-22.md) and [UI/UX](UIUX-NEXT-WORK-2026-10-22.md) reviews agree that reliable editing takes priority over another visual redesign. Production remains `05e8c5c34656f3257af8a8d3d7e8523dcbd542b3`; the existing Twilio Support request and disabled service gates are unchanged.

## Customer outcome

An owner can correct business details, understand exactly which version was saved, and recover from invalid input, a slow save or a conflicting edit without losing work. An operator's supported correction must follow the same field-validity contract. Acknowledging a request, service activation and new provider connections are separate work.

## Confirmed returns

[Independent offline QA](../scratchpad/next-work-workspace-save-qa.json) reproduced two defects using the actual published browser assets and memory-backed access/client handlers, with zero physical network requests and stable source hashes:

- Submit a business-name change, then type another name while the PUT is held. When the first response completes, the newer typing is replaced by the submitted snapshot and the page says Saved.
- Submit `not-a-phone` as the callback number. The handler returns200, retains the previous number and the page says Saved without a field error.

These are reproducible defects in the published implementation, not observations of an actual customer's lost data. The initial QA attempt using `123` is retained separately in the receipt; the permissive phone normalizer accepted it rather than producing the expected old-value fallback. Phone validation needs an explicit supported-format contract. Passing reproduction assertions confirm defects, not a repair.

## Delivery and acceptance

| Owner | Deliverable | Acceptance |
|---|---|---|
| Architect | Define supplied-field validation, optional blanks, incomplete-draft behavior and revision-aware save semantics. Reuse the existing tenant/session boundaries. | A provided malformed callback is rejected rather than ignored or normalized to an unusable destination. Deliberately incomplete drafts have an explicit state and cannot bypass current review/test/activation guards. Partial updates do not erase unrelated facts. |
| UI/UX + Engineer | Add associated field errors, focused recovery and clear saving/saved/unsaved/incomplete states to the current editor. | Invalid values and other edits stay visible. An error reveals its section and focuses the first invalid control. Success/error updates are announced. Optional blanks remain usable. |
| Engineer | Preserve new typing across pending saves; handle repeated submits, failures and revision conflicts. | A response acknowledges only its submitted snapshot. Typing after dispatch remains unsaved and cannot be overwritten by refresh. A failed write or conflict retains inputs and offers a useful recovery action. |
| QA | Recheck the two returned cases, then independently exercise actual-handler validation and delayed-response/conflict recovery. | Meaningful browser cases at320/390/1440px, keyboard navigation, failed-write retry and cross-tenant denial. Verify actual persisted values and visible messages, not only event handlers or CSS. Preserve original failures and source fingerprints. |
| PO + PM | Accept the owner outcome and maintain the exact release scope. | PO observes correction→save→reload and pending-edit/error recovery. PM isolates the accepted patch from the published base, including only explicitly reviewed dependencies; main must not be pushed wholesale. |

Admin correction behavior must be inspected before changing it; this source audit reproduced the owner path only. Do not expand this repair into a new settings architecture or a broad redesign. Ordinary local implementation and isolated checks can proceed without Twilio approval. A later publication must be a concrete verified batch under the existing release rule; this assessment authorizes no build or hosted test.

## Parallel and subsequent work

PM/QA can prepare a fresh current-production signup/return/operator acceptance plan while this repair is built. Prior email/site-read allowances remain closed; preparation is not execution. Architect/OM retain exact-tenant eligibility, account exposure and cleanup as prerequisites for paid automatic connections.

The next customer-facing feature is explicit request ownership and commitments: call/visit/quote, due time, attempted/reached outcomes and history. UI/UX also prioritizes guided website installation with evidence of the first customer request. External calendar conflict protection, current-source AI/Spanish acceptance and minimal conversion measurement remain ranked in the PO review. None is delivered by this planning record.
