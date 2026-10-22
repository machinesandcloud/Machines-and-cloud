# Calendar setup continuation — October 22, 2026

The Calendar API already supports background delivery after the owner grants Google access. The portal nevertheless asked the returning owner to select **Finish connecting Google Calendar** before it sent the existing authenticated completion request. This update removes that extra click for a matching, current sign-in. It does not change Google permissions, enable production delivery or establish live provider acceptance.

## Customer experience

1. The owner selects **Connect Google Calendar** in Connections.
2. The platform creates the existing ten-minute, owner-session-bound authorization and opens Google's permission screen.
3. The owner chooses the Google account and grants or denies access there.
4. On return, the portal opens Connections and removes the authorization response from the address bar. After the authenticated workspace has loaded, a matching browser receipt completes the existing owner API request automatically.
5. The existing backend confirms the grant, encrypts the refresh credential and dispatches saved Calendar work. The portal displays the confirmed connection. No second approval is requested.

The system can refresh authorized credentials and create, change or cancel eligible saved visits without another customer setup submission. The customer can disconnect from the portal. Google account permissions and administrator restrictions still require an authorized person's involvement; a specialist cannot bypass that authorization.

## Preserved security and recovery

- The browser receipt contains only the workspace slug, random state, expiry and SHA-256 binding to the initiating owner session. It does not copy the bearer credential, authorization code, access token or refresh token into that receipt.
- Automatic completion requires the same current browser session, matching slug/state, a fresh receipt and an authenticated workspace event for that slug. Missing, malformed, expired or mismatched receipts do not automatically submit a code.
- The server remains authoritative. Its existing single-use state, original session hash, owner email, tenant identity, grant epoch, lifecycle version and PKCE checks all remain unchanged.
- Older receipts without the new binding keep the explicit completion action and the same server safeguards. Uncertain completion refreshes status and clears the local callback rather than automatically replaying a one-use grant. If the connection is absent, the owner can start a fresh authorization.
- The short-lived returned code exists only in memory after the fragment is removed. Access/refresh credentials remain server-side; no token is added to a portal URL. A reload can recover the confirmed connection through owner GET. An unfinished return can be restarted with a fresh authorization.
- Denial does not install credentials or produce a false success message. Sign-out and session-expiry generation fences prevent a late response from restoring private connection UI.

## Scope and limitations

The requested scopes are unchanged: `calendar.events.owned` and `calendar.calendars.readonly`. This work does not read existing external event availability, add Google free/busy blocking, add another calendar provider or turn on `CALENDAR_CONNECTION_ENABLED` / `CALENDAR_DELIVERY_ENABLED` in any real account. Calendar sync remains distinct from an availability-conflict guarantee.

No Google account, credential, provider setting, deployed environment or production record was accessed or changed for this implementation. No emails, live API calls, events or deployment were performed.

## Local verification

The focused browser suite uses the actual `desk-connections.js`, actual owner/Google handlers and actual Calendar module with an in-memory store, synthetic sign-ins and intercepted provider responses. Physical networking is denied. It covers the start receipt/redirect, automatic success, denial, original-session mismatch, missing/malformed/expired receipts, wrong tenant, revoked session, server-expired/superseded grants, legacy completion, repeated workspace events, reload, a response lost after server commit and sign-out during an in-flight request.

- [Focused browser + actual-handler receipt](../scratchpad/calendar-auto-connect-second.json): **17/17**, stable source hashes, zero page errors and zero physical requests.
- [Existing owner API regression](../scratchpad/calendar-auto-connect-owner-api.json): **9/9**, stable source hashes, zero physical external requests.
- [Existing Calendar security regression](../scratchpad/calendar-auto-connect-backend.json): **19/19**, zero external requests.
- [Existing combined Connections UI regression](../scratchpad/service-onboarding-qa-connections-calendar-auto.json): **11/11**, stable source, zero page errors/physical requests; the combined approval, registration cleanup, prerequisite routing and responsive review modal remain intact.
- [Preserved initial run](../scratchpad/calendar-auto-connect-first.json): 14/15. Its denial assertion counted the existing same-site worker dispatch as a Google provider call; the corrected assertion excludes same-site dispatch and still verifies zero token/Google requests. No product code changed between these two focused runs.

Run locally: `node scripts/calendar-auto-connect-check.mjs --output scratchpad/calendar-auto-connect-<new-run>.json`. The browser runner uses the existing local Playwright installation and creates an exclusive output file. It is a local QA command, not a new Netlify build dependency.

## Primary research

Reviewed October 22, 2026. Google's documented server flow validates returned state and exchanges the authorization code after the user grants access; it does not require a second application approval button. Google also recommends avoiding authorization-response exposure to page resources and handling refresh credentials securely. The implementation keeps the existing server checks and changes only the frontend continuation. Sources: [Google web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).
