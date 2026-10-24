The Calendar test is closed and its cleanup is verified. Local review found that the proof actor encoded `calendar-v1:VERSION` differently from the installed Netlify SDK. This repair is locally verified; it does not yet establish why the hosted read failed.

This separate diagnostic reads only the old test's retained budget record. It needs fresh owner approval and makes at most two physical HTTPS GET attempts:

1. Request a signed URL for `calendar_execution_budgets / calendar-v1:owned_calendar_busy_20261024_v1` on the exact M&C Netlify site, preserving the SDK's raw colon. Use the existing native Netlify token in memory on this request only.
2. Read only that returned URL after validating HTTPS, trusted host and signed expiry. Forward no credential. Stop on any failure; follow no redirect and make no retry.

There are no builds, emails, browser actions, Google or worker requests, other object/list reads, configuration changes or provider mutations. Output contains only sanitized status, attempt counts and the matching record's policy digest/used counts. Raw responses, signed URLs, credentials and census details are neither printed nor persisted.

The runner defaults to an inert plan. Execution requires an exact script-bound private approval packet, a fresh exclusive owner-only ledger and fsynced reservations before each request. A prior complete or interrupted ledger cannot be reset or resumed. The earlier phase and its remaining allowances stay closed. No external cleanup is necessary for this read; keep the diagnostic receipt.

The [exact scope and unapproved packet template](CALENDAR-BUDGET-READONLY-DIAGNOSIS-2026-10-24.json) bind runner SHA `a0dabff380a78905b76d26c52258cea35360a22a22e9a99e3e030acf2581ed1e`. Author verification passes 26 synthetic checks with sockets denied and zero native credential reads. Root independently reviewed the complete runner and passed five additional offline failure, expiry, identity and projection groups on the same source. No hosted read is accepted yet; [independent evidence](../scratchpad/calendar-budget-diagnostic-root-acceptance.json). The provider reference is installed `@netlify/blobs` 11.1.4, `dist/chunk-SQCJ2S3G.js`, `getFinalRequest`; this source preserves the raw key and separates the signed hop from the API bearer token.

Local review commands:

```sh
node scripts/calendar-budget-readonly-diagnostic.mjs
node scripts/calendar-budget-readonly-diagnostic-check.mjs
```

Only after fresh explicit approval, Root prepares a private `0600` packet outside the checkout, fills its approval identity/times (maximum one hour), hashes its exact bytes and uses:

```sh
node scripts/calendar-budget-readonly-diagnostic.mjs --execute /tmp/APPROVED-PRIVATE-PACKET.json EXACT_PACKET_SHA256
```

The displayed path is a placeholder, not an approved packet. No live execution or credential read has been performed in preparation.
