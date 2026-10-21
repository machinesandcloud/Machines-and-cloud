# Sprint 9: owner-controlled availability

Owner: Product Manager. Opened **2026-10-21** under the [current PO mandate](README.md#current-mandate-2026-10-21). Historical feature-freeze statements are superseded. Billing remains parked. This sprint implements opportunity A in [competitor research](../RESEARCH-competitors.md#proposed-next-delivery-slice), selected by the PO alongside the [stakeholder evidence](../RESEARCH-stakeholder-forums.md).

Status legend: `todo` | `in progress` | `delivered` | `verified locally` | `returned`. A local result does not imply deployment, live storage, provider delivery or first-shop acceptance.

## 1. Goal and boundaries

The owner can mark a whole date or a listed arrival window unavailable. Chat, SMS and voice use one authoritative lookup of recorded openings, and booking/reschedule enforce the same state. Existing visits survive later blocks and remain confirmable. Manual blocks share the atomic capacity record with reservations so ordering is explicit under competing updates.

Availability is **manually maintained** by the owner plus the desk's stored bookings. This sprint does not read Google busy time or connect Jobber/Housecall Pro, infer office hours/closed weekdays, assign technicians, move existing bookings, change emergency safety/handoff, or resume billing. A no-opening result is different from a failed lookup.

## 2. Tickets and executable acceptance

### S9-01 Owner API for date and window blocks

Status: verified locally with the offline suite, 2026-10-21. Engineer owns backend; root owns portal. No live-storage/provider acceptance follows.

Owner GET adds `availabilityBlocks: [{date, window, existingBookings}]`. Owner POST supports `availability_block` and `availability_unblock` with `{date, window}`; `window: ""` means the whole date. Success returns `{ok, availabilityBlocks, existingBookings, notice}`.

Acceptance: add/remove full-date and individual listed-window blocks; repeated add/remove is idempotent; at most 100 distinct blocks. Dates are real `YYYY-MM-DD` calendar dates; canonical aliases map only to the shop's listed windows. Invalid dates, unknown/malformed windows and invalid input types return 400 without changing state; storage failure returns 503 `availability_unavailable`. Owner authentication and shop isolation hold. GET after reload reflects saved blocks and counts existing visits accurately. No external calendar-sync claim.

### S9-02 Shared lookup of recorded openings

Status: verified locally, 2026-10-21. The offline suite passes; the real model selected the lookup in the blocked-day check and final targeted booking replay. Provider/live-store acceptance remains separate.

Strict tool `get_availability({date, days})`, with `days` integer 1–14, returns `{timezone: "America/Chicago", from, days, openings: [{date, windows: [listedLabels]}]}`. Every requested date is represented; an exhausted/blocked date has `windows: []`.

Acceptance: listed labels and canonical aliases use the same capacity rules; full-date/window blocks and active stored reservations remove openings; unblocking restores only otherwise available windows. A same-day numeric window whose known end is at or before Houston now is excluded; a window already in progress remains available until its end. Future dates are unchanged. Named-time, overnight and office-hours/weekday assumptions are not inferred. Date iteration crosses month/year/leap-day and Houston DST boundaries without duplicate/skipped dates. Unknown shop state/storage errors produce an explicit tool error rather than fabricated openings or an empty successful result. A separate shop's blocks/reservations cannot affect the result.

### S9-03 Commit-time booking/reschedule safety

Status: verified locally on memory and installed-SDK protocol double, 2026-10-21. Live Blobs acceptance remains open.

Acceptance: a newly requested blocked/full/unlisted/invalid target, or a same-day numeric target whose end has passed, is rejected before booking records, Calendar changes, reminders, confirmation or BOOKED/RESCHEDULED alerts. A rejected move preserves the original booking, reservation, tasks and Calendar reference. Capacity 1/2 and existing canonical-window behavior remain correct. Existing visits are not canceled or moved by a block or elapsed time; they remain confirmable. A same-slot self-reschedule remains allowed where it was already reserved. Requests after a block cannot reserve that target.

Race acceptance: demonstrate both orderings with independent store instances and installed SDK double. A capacity claim committed before a block may finish and is counted as an existing visit; a block committed before the claim prevents the new claim. Competing block/unblock/reserve operations use the same CAS document, and cannot lose either blocks or reservations. Existing uncertain-write fail-closed guarantees remain; no proof is inferred from a per-process lock alone. History beyond legacy list caps remains authoritative.

### S9-04 Chat, SMS and voice use the shared availability contract

Status: verified locally, 2026-10-21: scripted SDK streams exercise all three routes; simulated Vapi transport covers provisioning/migration; actual Anthropic chat selected lookup and booking. Actual voice/SMS behavior remains open.

Acceptance: the strict schema and execution are present in the ordinary chat agent, SMS agent and Vapi tool-call path. Identical fixtures return identical recorded openings through all three routes. Storage errors remain explicit in each route. Booking/reschedule bypass attempts are still rejected centrally, even if a model skips lookup. Emergency instructions/handoff retain their prior order and no emergency booking is introduced. These deterministic route checks do not establish model choice, voice delivery or carrier behavior.

### S9-05 Owner portal availability control

Status: verified locally, 2026-10-21: 12 final browser checks, including served-source match. Root executed the isolated browser; PM/PO reviewed the artifacts and mobile image. Root owns `desk.html`.

Acceptance: owner can select a date, whole-date/listed-window scope, add a block, see saved blocks/existing-visit notice, remove a block and verify persistence on reload. Existing visits are described as retained. Form labels/errors distinguish invalid input and save/read failure; a failed request never looks saved. Mobile and keyboard use remain workable. Copy accurately explains manual maintenance and does not imply Google/FSM synchronization or office-hour automation. Browser verification occurs only against an isolated local server supplied by root.

### S9-06 Independent regressions and final PO acceptance

Status: verified locally, 2026-10-21; PO accepts A within local scope. The initial API/schema failure and returned wording are preserved; a targeted final replay closes the wording defect. PM owns the check scripts and this sprint record; PO owns final acceptance.

Acceptance: reproducible offline suite covers S9-01 through S9-04 on memory plus installed-SDK protocol double where meaningful, including deterministic race orderings and injected storage failures. It never reads `.env`, blocks network/model/provider traffic, uses synthetic contacts and reports which backend each proof exercised. Existing capacity/Calendar-failure/audit-policy/smoke regressions pass after the final code. PM independently verifies the local portal and records its exact code baseline and limitations; PO reviews the owner/customer outcome before accepting. Preserve failed checks and rerun results; do not mark provider/live-store gates complete.

## 3. Verification record

`node scripts/availability-check.mjs` passes **35 acceptance groups** on memory, installed Blobs SDK protocol double and simulated Vapi transport, exercising **17 CAS conflicts**. PM ran it and PO independently reran it. It covers owner auth/reload/idempotence/limits, dates/aliases/Houston end-time/DST boundaries, shop isolation, long history, full/blocked/expired direct booking and move refusal, prior-claim/block ordering, stale CAS retries, emergency alert/task dispatch, all three tool routes, storage failures and persisted voice-tool migration. Network sockets are disabled, provider credentials are removed or replaced with explicit dummy strings, and model streams are scripted. **Zero live provider/model/network requests.** Durable output: [sprint9-availability-check.txt](../scratchpad/sprint9-availability-check.txt).

Root's final isolated browser run passed **12** local owner-workflow checks: served-source match; discoverable availability control; partial and whole-day blocks; explicit retained-visit notice; reload persistence; failed-save/retry behavior; selective removal; mobile layout/action size; and no JavaScript errors. External font requests were blocked. The served `desk.html` SHA-256 is `894d51a5b1355ae1757481af3c6a0bd72046304e66bf89279cf0593d8ca58df3`. PM inspected the JSON and rendered mobile image; PO independently reviewed them. PM did not drive this browser run. Evidence: [availability-ui.json](../scratchpad/availability-ui.json), [mobile image](../scratchpad/availability-ui-mobile.png).

The separately authorized real-model check used `scripts/availability-model-check.mjs` against root's guarded `http://127.0.0.1:8892` memory server, with an initial ceiling of eight actual Anthropic HTTP requests. It **stopped on the first chat error**: HTTP 500 `local_server`, `Right-hand side of 'instanceof' is not an object`. One actual Anthropic request was observed, zero were blocked, and no customer reply was produced. The installed SDK has no `Anthropic.APIStatusError` class, so the error classifier masked the original error. No retry or later scenario was run by this attempt. Preserved failed evidence: [sprint9-model-check.json](../scratchpad/sprint9-model-check.json), started `2026-10-21T23:31:56Z`, HEAD `4967145075a083a68896519d9e0155b6cad5afc5` plus relevant-code SHA-256 `3ca54eed72bf30bf439efd8a3244908841317126a7d1849ba427fd5c1b880ba6`.

Root identified unsupported numeric `minimum`/`maximum` keywords in the strict tool schema as the likely upstream cause, using official schema documentation; the upstream body was masked, so this cause is an inference. Engineering replaced those bounds with the integer enum 1–14 while retaining runtime validation, and used the installed SDK's supported `APIError`. Root authorized extending the **total phase ceiling from 8 to 12**, preserving the spent request.

The three-turn rerun used eight further actual requests, bringing the count to nine. It correctly refused the whole blocked date with no booking and later created one accepted afternoon visit with three tasks. It also delivered the default safety script first and produced an emergency lead linked to its alert and exact escalation task without a booking. The harness incorrectly expected a nonempty custom safety script; the fixture correctly used the documented default. That assertion was corrected and the existing reply/chain checked read-only, with no additional model call. **Case 2 was genuinely returned**: the confirmation invented that the earlier whole-day refusal had been wrong, although the owner had removed a block between turns. The raw run remains failed/returned. Evidence: [sprint9-model-rerun.json](../scratchpad/sprint9-model-rerun.json), [separate adjudication](../scratchpad/sprint9-model-adjudication.json). Its recorded relevant-code hash is `029a0106ad7406df6e27e5e72258cae3891812b9d3a3a8d4a0274493f9b095e7`.

Engineering added a shared availability-snapshot rule: report current openings without inventing why they changed or retrospectively calling a truthful earlier result a mistake. Root initially proposed a ceiling of 18 and another three-turn run, then **revoked that proposal before use**. The ceiling remained 12, nine spent; only the returned second turn was authorized for replay.

The final replay started from the exact actual first input/reply, no blocks/tasks/leads and only the original morning booking. The unchanged second input produced one correct afternoon booking, matching phone/address/reference, exactly `reminder_24h`, `reminder_1h` and `visit_check`, one STOP consent instruction, no duplicate lead and no invented historical error, cause or owner action. PM and PO independently read and accepted the raw reply and state. **14 checks pass**; the sanitized trace proves the model selected `get_availability` then `book_visit`. The final relevant-code SHA-256 is `564ed0ee23b1b735f2098b4bcecb37b5c3c968046e8d98c496a47cf7da5c74f6`, stable before/after, against HEAD `4967145075a083a68896519d9e0155b6cad5afc5` plus the recorded working files. Evidence: [sprint9-model-final.json](../scratchpad/sprint9-model-final.json), [copied replay fixture](../scratchpad/sprint9-model-final-fixture.json). The first blocked-day and emergency model proofs retain their earlier hash; they were **not rerun** on the final prompt. Shared safety/snapshot regressions passed offline after the prompt fix.

The complete [sanitized network ledger](../scratchpad/sprint9-model-network.json) ends at **12 actual Anthropic requests of 12, zero blocked**: one initial failed attempt, eight requests in the three-turn rerun and three in the targeted replay. No dollar spend was observed or inferred. Servers are stopped; no further model calls are authorized by this record.

**Current verdict: A is accepted locally by the PO.** All six tickets are locally verified with the proof stages above; original failures remain visible. This is manual availability, not Google busy-time or FSM integration. Actual call/SMS/email/Calendar delivery, live Blobs behavior, deployment and named-shop gates remain open. The provider-readiness workstream continues in parallel.

## 4. Next ranked opportunity

**B: mutually confirmed next action and actual-contact completion**, after this bounded availability slice. Keep owner acknowledgment separate from a completed customer callback; test overdue handling and report numerators. This is planned discovery/delivery, not added to S9's implementation scope. Existing launch gates and provider approvals remain owned in parallel.
