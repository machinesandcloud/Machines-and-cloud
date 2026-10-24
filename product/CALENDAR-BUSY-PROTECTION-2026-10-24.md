# Calendar conflict protection — local candidate

This candidate adds actual owned-Google-calendar busy checks to the existing scheduling and delivery paths. It has not been published or exercised against a real Google account. Current launch control remains authoritative; prior Google setup, verification materials and controlled website acceptance do not establish this feature’s provider acceptance.

## Supported customer behavior

For a workspace that selects Calendar or retains a current owned connection, availability combines the connected primary calendar’s opaque events and the workspace’s saved visit reservations. A new visit or move refreshes Google before the existing local capacity CAS. Immediately before creating or moving the managed Google event, ordinary scheduled delivery refreshes again. Unavailable, stale, incomplete or changed authority means no free-window or delivery claim.

Manual-only workspaces retain their existing manual availability behavior. Disconnecting while Calendar remains selected does not silently turn a connected-calendar schedule into manual free time. Owners can deliberately change their selected connections when they want manual scheduling.

The interval sweep uses half-open intervals and concurrent distinct reservations. Each external busy event occupies one capacity unit. Exact managed Google copies share the saved reservation identity, including overlapping old/new local move holds, so they count once. Exclusion for the moving visit requires both the exact deterministic tenant/event ID and its private ownership tag. A foreign ID/tag mismatch stays busy.

Google’s expanded recurrence instances, all-day events in the calendar’s timezone, event offsets, Houston DST and transparent/cancelled/self-declined events are handled. Events.list leaves its response timezone at the calendar default; all-day dates use that returned calendar timezone, and timed values preserve their RFC3339 offsets. The existing shop schedule timezone remains America/Chicago. This does not add crew resource mapping, shared calendar selection, field-service software availability or native CRM connectors.

A Google user can create another event after the last check. Google does not provide an atomic insert-if-still-free transaction for this workflow. Local concurrent bookings are arbitrated through the existing CAS; provider writes are checked again and retain their deterministic event identity. Do not market a distributed exactly-once or absolute no-race guarantee.

## Permission and privacy

The scopes remain `calendar.events.owned` and `calendar.calendars.readonly`. Google’s [Events.list documentation](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) accepts the existing owned-events scope and supports bounded recurring-instance expansion. [FreeBusy.query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) needs a different scope and is not used. [Event field semantics](https://developers.google.com/workspace/calendar/api/v3/reference/events) govern transparency and exclusive end times.

The old app disclosure said other appointments/busy time would not be read. The new Connect dialog explicitly describes this use. Its version is `2026-10-24-busy-v1`. The owner’s start action must supply this exact version; OAuth state and the completed connection record preserve it. An older pending grant cannot install the new-purpose connection. Older retained connections show review/reconnect and cannot fetch busy events or create/move through the worker until the owner deliberately reviews and reconnects. Existing narrowly authorized cancellation remains possible.

Availability requests use a fixed field projection. No Google appointment titles, descriptions or other attendees’ identities are requested. The normalized cache stores event reference, interval and workspace ownership tag. It is bound to tenant, connection ID, grant epoch, current business configuration, approved execution policy and date range. Public tool output contains a check timestamp and scope, never Google event identifiers, tokens or metadata. The revised privacy page states retained-cache behavior; the 60-second reuse limit is not a claim of automatic deletion. Revised Google verification justification/video materials still need preparation and review before actual service approval.

## Bounded execution and recovery

Lookup requests cover at most 14 days. Each refresh uses at most four pages of 250 events, requests expanded instances, disables deleted entries, and follows only validated page tokens. Incomplete pagination fails closed. Every physical Google request still uses the existing `calendarRead` action and its nonrefundable admission budget; no extra policy action, service flag or queue is introduced.

Lookups reuse a projection for less than 60 seconds. Booking and worker mutations require a new fetch and a result younger than five seconds at the local claim/check. Cached projections use a CAS generation: a delayed older free response cannot replace a newer result. Authority is reread before transport and after results, and again during the capacity claim. Selecting Calendar after a manual lookup invalidates that manual projection.

An observed busy conflict queues the same desired Calendar job for a five-minute ordinary-worker recheck without consuming provider-failure retries. Seven consecutive conflict checks remain recoverable; clearing the external conflict lets the same event ID create or update naturally. Provider physical attempts remain charged. Daily admission exhaustion retains the existing next-UTC-day wait behavior. A changed or withdrawn grant/connection never becomes an empty calendar. Unknown create/delete evidence retains the existing reconciliation semantics.

## Local evidence and outstanding acceptance

Author evidence: `scratchpad/calendar-busy-author-v2-20261024.json` (20 grouped checks; actual production functions and synthetic Google protocol; physical requests zero). Exact source fingerprints: `scratchpad/calendar-busy-source-v4-20261024.json`.

Affected existing execution, self-service, connection, delivery, actual client handler, owner visit, agent delivery, connection journey and connection admission suites passed locally. Shared Google fixtures now implement the actual bounded Events.list response. Delivery/execution fixtures use distinct owned calendars for unrelated shops; same-shop multi-crew fixture declares capacity three; pre-existing protocol cases use nonconflicting arrival windows. The synthetic read-limit case accounts for the newly required busy-list read. The obsolete “does not check external busy” assertion is replaced by the implemented scope.

First failures are preserved in the source record. An extra historical `calendar-auto-connect-check.mjs` browser run remains failed (5/18): its skeletal DOM omits elements required by the current asset and its first action predates the existing pre-consent dialog. It is not counted green. Independent QA accepted the focused implementation in `scratchpad/calendar-busy-independent-acceptance.json`: 12 coupled backend groups, an old-grant cancellation case, current complete-page consent/callback/recovery checks, and final actual keyboard checks at 320, 390 and 1440 pixels. These overlapping runs are not summed into a larger assertion count. The historical skeletal suite remains failed and explicitly dispositioned; relevant ordinary return/access/recovery coverage comes from the actual current full desk page. A real retained-Disconnect focus overlap was repaired and independently checked against the fixed mobile navigation. Publication and actual Google acceptance remain open.

Next actual acceptance must use freshly scoped authority for the exact customer, approved current disclosure and bounded provider lifecycle/conflict proof. It must observe create, busy rejection, same-event move, cancellation, ordinary scheduled recovery and cleanup, with conserved physical-read limits including the additional busy checks. No earlier closed live allowance is reusable.
