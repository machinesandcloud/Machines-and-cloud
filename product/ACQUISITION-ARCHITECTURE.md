# Acquisition and one customer setup

October 22, 2026. This is the local acquisition implementation and its boundaries. It is not deployed acceptance or proof of delivered verification email, activated phone answering, texting or Calendar sync.

The customer starts with a short form, then continues into one verified setup and one workspace. Business rules are collected once. The customer chooses connections inside that journey; platform prerequisites are not separate products or independent account registrations.

## Public intake and verified continuation

1. The preliminary form submits name, email and business, with an optional goal. Trade can be accepted but is deferred by the current UI. The optional email-updates choice is separate and unchecked by default.
2. `POST /api/intake` validates the first-party Origin, JSON size, exact allowed fields, enum values and honeypot. Strict conditional storage limits public capture to 200 per hour globally, eight per IP per ten minutes, and three per email per hour. IP and email limit keys are hashes. A storage failure fails closed.
3. Capture persists an unverified prospect before navigation. It creates no account, phone resource, subscription, notification, email, customer booking or model request.
4. A 128-bit-or-greater browser submission secret produces the same opaque handoff for an identical retry. Storage contains the submission hash, payload digest and handoff hash; neither raw browser secret nor raw handoff is stored. A changed payload with the same submission secret is rejected. The handoff lasts seven days and appears only in the URL fragment or tab state, not a query string. The response echoes no personal details.
5. There is no public readback of a captured lead. The browser may retain its own submitted values in the current tab to fill the email gate. An explicit `request_link` operation sends the existing transactional sign-in link. The server binds a handoff to that challenge only when its email exactly matches the requested mailbox.
6. Exchanging the one-use email challenge returns the verified, revocable session before optional lead projection. The session retains an internal pending handoff hash. Authenticated state reads retry projection if necessary, so a projection failure does not strand an already-consumed sign-in link without a usable session.
7. The verified same-email owner may also attach a handoff explicitly. Conditional writes claim it once, copy only absent draft answers, and record an application marker in that same draft write. A saved blank is retained. Replaying the handoff cannot refill later deletions. A different mailbox cannot attach it. A different session cannot reuse the consumed handoff; it can recover the existing saved draft through normal sign-in.
8. Existing accounts are resumed without editing their business, owner key, phone, channels or status. Intake is never account authority. New account creation retains the existing one-mailbox/one-account reservation.

`access` state returns the saved draft and a small marketing preference view only after mailbox verification. `primaryGoal` and `desiredChannels` are validated draft fields. Account creation saves them under `onboarding`; they remain preferences rather than activation or purchase consent.

## Consent and usable lead records

The preliminary checkbox records the exact text, source, timestamp and version `email_updates_v1_2026_10_22`:

> Email me practical tips, product updates and offers from Machines & Cloud. Unsubscribe anytime.

That public choice is pending evidence. Signing in alone does not subscribe the visitor. A visible, optional preference in verified setup changes consent only when the visitor explicitly changes and saves it. Finishing setup does not require opting in.

Anonymous repeat submissions cannot overwrite the first prospect record, subscribe or unsubscribe an existing address, remove suppression, or change an existing tenant. After a same-email verified handoff, a separate `verifiedFields` snapshot supplies operator names and business details. This prevents an attacker’s earlier anonymous submission from becoming the displayed verified identity. The original capture audit is retained.

The authenticated draft conditional write stores the explicit preference and its revision. Its prospect projection is monotonic by that revision. Eligible audience reads require a matching current draft preference and projection, verified email, a confirmed opt-in, and no suppression. A delayed old opt-in cannot replace a completed later opt-out. A saved opt-out immediately fails eligibility even if its secondary projection fails.

A verified owner can explicitly opt back in after a local decline or unsubscribe. Independent provider/operator suppression remains blocked and requires its own reviewed recovery. Public intake cannot remove either kind of prior choice. Consent retains the immutable initial request plus a bounded history of the latest 100 authenticated preference changes; these are application records, not an external email platform’s delivery ledger.

`GET /api/intake` requires the existing `x-admin-key`. Its default audience is `eligible`; `?audience=all` explicitly includes unverified or nonconsenting prospects with their status. `format=csv` exports the same selected rows with formula-sensitive values neutralized, quoted fields and versioned consent provenance. JSON and CSV are private, uncacheable and contain no session, owner key or raw handoff. An export is a point-in-time audience view. Future campaign execution must recheck current consent and suppression at send time; no campaign or autoresponder is implemented or sent here.

## One connection journey

The full setup accepts a deduplicated selection of `web`, `voice`, `sms` and `calendar`. The workspace lets its verified owner change those preferences with `save_connection_preferences`. That operation conditionally merges only `onboarding.desiredChannels` into the latest owned client, preserving concurrent business edits, review/test proof and actual channel state.

`setup.connectionJourney` returns a single list of `{id, label, requested, status, detail, nextStep}`. Status is `not_selected`, `needs_action`, `pending_activation` or `active`. An active website connection remains active even when the preference checkbox is cleared; a preference change never cancels live service. Phone, SMS and Calendar remain inactive for new self-service clients. Choosing them cannot purchase, provision, connect, send, sync or certify anything.

The remaining service work belongs behind this same workspace:

| Connection | Customer action when available | Platform work and acceptance still required |
| --- | --- | --- |
| Website | Review rules, complete a private live test, activate and install chat. | Current revision-bound review/live-test proof, model allowance and an observed customer-site conversation. Simulated tests cannot certify activation. |
| Phone | Choose routing, authorize applicable costs, and configure carrier forwarding. | Durable idempotent activation intent, reconciled number/assistant/fallback resources, safe destination and verified controlled inbound/forwarded call. Keys and a selected checkbox do not establish delivery. |
| Text | Supply required legal information, attest to actual consent flow and accept applicable costs. | Idempotent sender/brand/campaign work, truthful carrier state, approved sender, delivery receipts and tested reply/STOP/Spanish opt-out/START. |
| Calendar | Choose and authorize their own Google calendar. | One-use OAuth state, durable token/reconnect handling and reconciled event create/change/cancel with controlled provider proof. A portal visit is not a Calendar event. |

The durable activation and recovery contracts remain in [SERVICE-OPERATIONS.md](SERVICE-OPERATIONS.md). This acquisition change does not reuse legacy automatic provisioning, turn off current new-tenant gates or make the founder a routine customer setup step. Platform automation and provider acceptance remain engineering/operations work; customer authority and legal attestations stay customer actions inside the same journey.

## Local verification

Engineering’s [current 33-check receipt](../scratchpad/intake-engineering-current.json) covers early persistence, opaque retry, no account creation, identity isolation, absent-only draft adoption, deliberate blank preservation, pending versus explicit consent, attacker-first capture, consent ordering/stale projections, suppression, private CSV, connection preferences and zero external networking.

The [existing access regression](../scratchpad/customer-access-acquisition-revision-regression.json) passes 155/155 in memory and the installed Netlify Blobs protocol double. The existing account/setup check passes 84 groups with 32 conditional conflicts and no actual provider/model requests. Those results are local functional evidence, not live email, hosted Blobs or provider delivery acceptance. Independent acquisition QA and packaged UI checks are recorded separately by their owners.

Independent architectural review checked the current runtime against the [35-check API recovery receipt](../scratchpad/acquisition-api-qa-projection-recovery.json) and [49-check browser receipt](../scratchpad/acquisition-ui-qa-current.json); their recorded source hashes match the reviewed files. Once the draft conditional write is known to have committed, an optional marketing projection failure returns HTTP 200 with that committed draft revision and `marketingPending: true`. The browser advances its draft revision, keeps the explicit email choice unacknowledged, explains the pending confirmation, and retries it on a later save or Continue. Audience eligibility still requires matching committed preference and projection revisions, so this recovery never grants marketing eligibility merely because onboarding continues. The review found no blocking defect in intake authority, absent-only adoption, consent ordering, private exports or connection preferences. Before future campaigns launch, add an ongoing customer preference center and pending-choice restoration after a page reload; the present UI restores confirmed eligibility, and existing workspaces resume directly in the portal. No campaign delivery or fully automated provider activation is established by this slice.
