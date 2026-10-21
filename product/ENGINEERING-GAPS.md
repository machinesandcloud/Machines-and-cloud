# Engineering gaps for the next product round

2026-10-21. Source audit recorded before Sprint 9 delivery, not a live-provider assessment. Item 1 is now implemented and verified locally as described below; items 2–5 remain open. Steve's current mandate in the product README/CLAUDE guide supersedes the historical feature freeze; billing remains parked. Forum and competitor evidence should determine priority alongside these implementation findings.

Existing proof: the local real-model matrix, capacity/concurrency regressions, and injected Calendar failures cover their recorded scenarios. Real calls, delivered messages, Calendar writes, live Blobs behavior, and a customer week remain unverified (`README.md`, `SPRINT8.md` section 8, `../OPERATIONS.md`). None of the proposals below requires new credentials or a deployment to build and verify locally.

## 1. Availability must mean a bookable date and window

**Status:** addressed by Sprint 9's owner blocks, shared availability lookup and authoritative booking/reschedule checks. See the [Sprint 9 verification record](SPRINT9.md#3-verification-record) for final evidence and its current acceptance status: deterministic API/concurrency/tool-route and local mobile owner-workflow checks pass; real-model and live-provider/storage gates are recorded separately there.

**Pre-delivery gap:** `../netlify/functions/lib/desk.mjs` `bookVisit`/`rescheduleVisit` reserved a date/window without checking it against `c.windows` or owner date closures. `../netlify/functions/lib/store.mjs` `reserveBookingWindow` enforced capacity for equivalent windows, not those schedule constraints. `../netlify/functions/lib/config.mjs` `buildSystemPrompt` presented static windows. This left “only the windows you set” dependent on model compliance. Capacity was one global number, not crew availability.

**Bounded design:** one shared availability function for booking, rescheduling, and offered choices: configured canonical windows, owner date/window blocks, and existing reservations. Put blocks and reservations in the same CAS document so booking/block races have an explicit order. Existing reservations survive a new block. Office callback hours are not field availability; a later weekly visit schedule needs its own setting. Defer crew routing and Google busy lookup.

**Verify:** whole-date/window blocks, unknown window, past date, DST boundary, equivalent formats, booking/block races, and failed reschedule preserving the original booking/reminders. Existing capacity tests remain required; live Calendar conflicts remain outside this slice.

## 2. Owning a callback is not completing it

**Gap:** `../netlify/functions/lib/desk.mjs` `runCallbackCheck` stops on `ackedAt`; `weeklyReport`/`monthlyReport` count acknowledgment as a kept promise. This matches old S3-08 acceptance, but proves receipt rather than customer contact. `../desk.html` `needsYou`/leads rendering offers Acknowledge, without Call or Called actions; `ownerCommand` already implements `called REF`.

**Bounded design:** phone-friendly callback cards with a dial link, explicit “Reached customer” action, due time, and overdue state. A dial tap does not mark completion. Keep acknowledgment for escalation ownership; only an actual completion stamp or explicit closure resolves the callback clock and kept-promise metric.

**Verify:** acknowledge before deadline without calling still becomes overdue; Called resolves it once; booking/closure resolves it correctly; owner authentication, repeated taps, and cross-shop IDs are checked. At 390 px, finish the workflow without typing SMS commands. Real call completion remains owner-reported, not inferred.

## 3. Failed reminders need a durable outcome

**Gap:** `../netlify/functions/scheduler.mjs` `runTask` returns “send failed”; `run` deletes the task after both failures and exceptions (lines 142–145). `../netlify/functions/lib/send.mjs` `sendSMS` records rejection, but provider acceptance is not delivery. Health alerts exist; a retained failed-send work item does not.

**Bounded design:** durable send states and a small attention queue with task/reference, attempted time, accepted/failed/unknown outcome, and operator resolution. Claim attempts atomically. Retry only when safe; ambiguous responses require review rather than automatic duplicate texts. Preserve STOP, cancellation, and quiet hours on every attempt.

**Verify:** definitive rejection, committed-send/lost-response, concurrent scheduler runs, opted-out recipient, canceled visit, and restart recovery. Provider delivery callbacks and actual arrivals still require the real-provider pass.

## 4. Calendar integration needs cancellation and repair

**Gap:** `../netlify/functions/lib/calendar.mjs` exposes `createEvent`/`updateEvent`, but no cancellation. `../netlify/functions/lib/desk.mjs` `ownerCommand(cancel)` cancels the local booking and reminders only. Calendar failures now generate events/health alerts; `../desk.html` `calText` still describes connection from token presence, not booking sync status. Jobber/Housecall Pro remain CSV handoffs (`../netlify/functions/client.mjs` `exportCSV`), with import acceptance still pending.

**Bounded design:** per-booking Calendar sync status, cancellation propagation, and an explicit repair path using the stored event ID. Keep local booking truth when Google fails and show which visit needs attention. Defer new vendor API integrations.

**Verify:** create/move/cancel, expired token, missing remote event, duplicate repair request, and partial failure using HTTP doubles. Actual Google and CSV import acceptance remain separate.

## 5. Show incomplete work without claiming success

**Gap:** interrupted booking writes deliberately retain capacity and mutation tokens; recovery currently requires an engineer (`../OPERATIONS.md`, “Booking capacity and interrupted writes”). Owner API/portal do not expose that held state. Separately, `../desk.html` pause/resume/cancel handlers show success without checking returned errors; `action()` only parses JSON.

**Bounded design:** show a plain-language pending/needs-attention state for affected visits and failed actions; give Steve the corresponding diagnostic record. Check HTTP and application errors before success toasts. Keep token reconciliation manual until writer quiescence can be established safely.

**Verify:** rejected action, offline request, held reservation, reload, and eventual successful refresh. No fake success, automatic lock expiry, or blind replay of partial side effects.

**Selected scheduling slice:** the PO chose item 1 for Sprint 9, implemented without Google busy lookup, crew dispatch, new keys, or a deployment. Item 2 remains a smaller independent mobile follow-through opportunity using existing owner-command behavior; it still needs PM acceptance and explicit live-proof limits.
