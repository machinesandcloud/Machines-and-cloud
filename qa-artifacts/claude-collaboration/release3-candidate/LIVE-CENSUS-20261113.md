# Release 3 pre-deploy live census — 2026-11-13 00:05 CST (read-only)

Ran `harness/legal/legacy-census.mjs` (read-only: store get/list only) against the production Netlify Blobs store of site f87916f1-…, using the release-3 tree's `store.mjs`. No writes, sends or provider calls. A separate read-only count was taken to confirm the census reached real data (not an empty store).

- Production client records: 19, all self-service/managed (`onboarding` versioned); **legacy shops: 0**.
- `dependOnSharedSender`: 0 → P1 (retire shared sender) affects no live shop.
- `bridgeIndexKeys`: 0; `ownerAlertsOperatorOnly`: 0.
- `vipRecordingsToDelete`: 0 → no existing VIP recordings to delete at Twilio.
- `plaintextCalendarTokens`: 0 → P7b's precondition is met (P7b still held; can ship in a later release).
- Existing-campaign HelpMessage check: applies to legacy shops with a `campaignSid`; there are none, so no campaign read was needed.
- Legacy Vapi recording default: no legacy shops, so "We do not record call audio" does not depend on patching a legacy assistant (managed voice is assessed by release QA).
- Scheduler after release 2: health shows lastRunAt 2026-11-13T06:00:24Z, ok:true, no failing blocks (first run after the 05:50 publication).

Row-level output (shop identifiers) was kept local and deleted; it is not committed.
