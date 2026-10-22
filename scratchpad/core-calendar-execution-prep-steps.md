# Controlled Calendar proof: local execution preparation

Prepared from local source only. No account/network request, email, configuration change or deployment was performed by this preparation. The user has approved the existing controlled scope; this document neither renews it nor enlarges a cap. The replacement candidate must contain the approved core batch plus the requested minimal CTA ordering repair, with its exact final commit substituted after verification.

## Controller and private process

Use `scratchpad/core-calendar-live-controller.mjs` from the final committed isolated checkout. Keep one Node process alive for the entire phase: captured owner sessions, exact email proofs, OAuth state and signed URLs are deliberately volatile. Existing/closed ledgers cannot be reopened. A crash stops the phase with identifiers retained; do not create another ledger to reset allowances.

The outline in `core-calendar-execution-prep-packet-outline.json` is deliberately non-executable. Create the actual approved packet outside the repository with mode0600, actual final HEAD, four fresh distinct32-hex submissions, actual approval reference/time, a bounded approval expiry, and local Google client-ID hash. Hash the **exact packet bytes**, then call:

```js
const controller = await createController({
  mode: 'execute',
  approvedPacketPath: '/private/tmp/<fresh-private-directory>/packet.json',
  approvedPacketSHA256: sha256(exactPacketBytes)
});
```

Execution checks the actual HEAD and rejects tracked dirty changes. Do not start the live controller before the final CTA/helper changes have been committed. Private packet, bodies, sessions, service keys and signed URLs must never be printed or committed.

All direct first-party/metadata/Blobs HTTP goes through `controller.request()`. No general CLI command may perform hidden HTTP/retries. `stageEnvironment()` and `publish()` wrap their single explicitly reviewed effects and reserve their counters first; they do not sandbox arbitrary supplied JavaScript. Use native `fetch` with no retries and no automatic redirects inside those reviewed effects.

## Existing local credentials and prerequisites

The existing Netlify login is in `/Users/stevengoumnai/Library/Preferences/netlify/config.json`, under `users[userId].auth.token`. Read only that selected token into memory; no login, account switch or key rotation is part of this phase. Site link metadata is `.netlify/state.json` in the main checkout. Provider names present in the ignored main `.env` include Google client/secret, `SERVICE_WORKER_KEY` and `CALENDAR_TOKEN_ENCRYPTION_KEY`. Presence locally does not verify the deployed values.

Preflight must validate production Function prerequisites from the scoped environment response: both Google values present, service worker key at least32 characters, Calendar encryption key canonical base64 decoding to32 bytes, first-party access origin, all other execution gates off. Secret/redacted API values cannot be represented as a confirmed match. Missing or unverified prerequisites stop before enabling anything. Registered redirect is exactly `https://machinesandcloud.com/api/google/callback`; the requested scopes are `calendar.events.owned` and `calendar.calendars.readonly` under Google's full auth scope prefix.

## Netlify metadata and four staged writes

Read endpoints, each charged against the six metadata cap:

- `GET https://api.netlify.com/api/v1/sites/f87916f1-bcc4-4171-a96f-2900cbf0b6dc`
- `GET https://api.netlify.com/api/v1/accounts/69797d78f01c70674ffef858/env?site_id=f87916f1-bcc4-4171-a96f-2900cbf0b6dc`
- The controller permits a deploy detail only after that exact deploy ID has been observed in the target site's metadata. Avoid extra deploy/build polling.

The first site response must establish site/account, READY published baseline05e, and the current deployment ID. Keep only filtered metadata/hashes in evidence. The environment response stays private in memory; retain a sanitized gate/prerequisite summary. Reserve metadata for after-write verification and READY exact-candidate observation. Six reads are not permission for unlimited UI/API polling.

Inside each `stageEnvironment({key,value,context:'production',scopes:['functions']}, effect)` call, perform exactly **one** mutation for that one key:

- Missing site key: `POST /api/v1/accounts/{accountId}/env?site_id={siteId}` with a one-element array `[{key,scopes:['functions'],values:[{context:'production',value}]}]`. Expected201 with matching env-var array.
- Existing key already scoped only to functions: `PATCH /api/v1/accounts/{accountId}/env/{key}?site_id={siteId}` with `{context:'production',value}`. Expected201 with matching env-var object; preserve other context values/scopes. An existing incompatible/shared scope or ambiguous ownership stops; do not spend extra writes changing scopes or contexts.

The four keys are `CALENDAR_CONNECTION_ENABLED`, `CALENDAR_DELIVERY_ENABLED`, `CALENDAR_EXECUTION_POLICY_JSON`, and `CALENDAR_EXECUTION_APPROVED_VERSION`. Their exact values come from the bound policy/controller. Return only `{siteId,key,valueSHA256,context:'production',scopes:['functions']}` after verifying the actual response. The helper checks this receipt. Do not run `netlify env:set`: the installed CLI performs extra metadata work, prints values and may alter scope/context through a different path.

Before publication, retain official deployment-snapshot evidence that old05e Functions retain their deployed environment until replacement; the reviewed reference is https://docs.netlify.com/build/functions/environment-variables/. Call `recordStagedEnvironment()` with the old commit, new candidate, only these flags changed, policy digest and evidence hash. A single `controller.publish(effect)` wraps the single exact-commit Git push; its receipt names that commit and one triggered build. No manual rebuild, automatic retry or main-wholesale push. Observe READY exact-candidate via remaining metadata and advance only then.

## Signup and returning access before staging

Use the existing normal endpoints against the currently published baseline, under the site160/write40/email3 caps:

1. Optional normal preliminary inquiry: `POST /api/intake`, exact synthetic name/business and the approved alias, `trade:'other'`, `goal:'booking'`, optional marketing **false**, empty botfield and its predeclared intake submission. A202 response must contain one opaque handoff.
2. `POST /api/access` with `{action:'request_link',email:'ngoumnaisteve+mc-core-calendar-20261022@gmail.com',plan:'starter',intake?}`. Only202/`ok:true`/`delivery:'email'` confirms send acceptance. It does not prove delivery.
3. Read only the unique newly sent **Your Machines & Cloud sign-in link** message for that exact alias in the authorized browser. Match recipient, sender and fresh timestamp; keep the token in memory. `registerExactMessageToken({recipient,token,exactMessageConfirmed:true})` before the normal `{action:'exchange',token}` POST. Never use a public/private token lookup shortcut or a provider-inbox API.
4. Expected exchange: `ok:true`, exact email,64-hex session and future expiry. The controller captures the session. Then `POST /api/onboard` with exactly the packet's saved fixture; expect a newly created `testing` workspace, no permanent owner key and a single stable slug. Any exchange failure stops; unrelated auth repairs are excluded.
5. Verify a second normal email/exchange returning to the same saved workspace; read its ordinary owner `/api/client?c={slug}` using that new verified session. Do not POST create again to prove return. The controller requires two exchanges and a valid owner read before `next('census')`.

Sign out the earlier temporary session using its captured Bearer when no longer needed; keep the chosen final session through the entire Google grant/callback. The controller retains each captured session until its own successful sign-out receipt, and will not close with another session left active.

## Direct Blobs census and exact routes

Installed `@netlify/blobs`11.1.4 source establishes these off-runtime paths:

- Collection: `GET https://api.netlify.com/api/v1/blobs/{siteId}/site:{store}` (no trailing slash). One HTTP request per unpaginated collection. No prefix filter for the complete global Calendar census.
- Record: `GET .../site:{store}/{key}` with `Accept: application/json;type=signed-url`; its200 JSON contains a temporary URL. Then one GET of that exact returned URL without Netlify authorization or cookies. **Both physical attempts count** against25.

The controller now supports this narrow two-step contract. It validates a known signed-storage provider host and explicit unexpired AWS/Google/CloudFront-style signing expiry, uses the URL once for that record, suppresses raw destination/query values in its ledger, and denies arbitrary direct signed-URL calls/reuse. Unknown signer formats/hosts stop, rather than broadening authority. An authoritative missing runtime budget404 is accepted as zero only before the first OAuth start under the bound new policy; generic failures/404s do not establish readiness.

Packet routes cover only `clients`, `calendar_connections`, `calendar_deliveries`, `calendar_oauth`, `health`, and `calendar_execution_budgets` under the exact site ID. Do not call an uninstrumented SDK/CLI: its signed hop and any list pagination/retries are additional physical attempts.

After normal signup, read only `clients/{controlledSlug}` for its actual incarnation; the controller hashes slug, permanent owner key and verified owner email privately. For each of the three Calendar stores, list all keys, read every listed row, then list again. The controller requires matching complete lists, hashes every row as runtime does, rejects pagination/incomplete lists and requires **no retained records for the new controlled slug**. Other retained Calendar rows are hash-only census inputs, not permission to inspect unrelated business data. Each extra retained row costs two physical reads. Failure to finish within25 stops before staging/deployment.

Confirm the real owned **primary Calendar ID** in the authorized account's settings UI. Do not infer it from the login email or literal `primary`; persist only its hash and evidence hash. `bindCohort()` checks this account/ownership evidence, the observed client incarnation, the precomputed visit ID, global census digest and exact policy. Visit ID is first32hex of SHA256(`tenantIdentity + ':' + visitSubmissionId`); event ID is `mc` plus SHA256(`machinesandcloud:calendar:v1:` + tenantIdentity + ':' + visitId). Compile expiry at most60minutes ahead, with time for the one build and cleanup; no renewal/version reset.

## Normal Calendar lifecycle and economical inspection sequence

After `next('calendar')`, use the final normal owner Bearer, current configuration revision, exact packet submissions, and synthetic visit fields. Never activate website AI as part of this manual proof.

1. Inspect the new version's runtime budget, then `start_calendar_connection`. Preserve the same session for the Google permissions decision. The exact callback GET alone uses `redirect:'manual'`; verify its same-site303 and separately count the next `/desk?c=...` navigation. No other redirect is followed.
2. Fresh runtime budget inspection, then `complete_calendar_connection` with the exact original state/code. It can dispatch one runtime-managed worker. Never reuse or persist the code.
3. Fresh runtime budget inspection, then normal `create_visit`. Local creation/queueing does **not** invalidate this observation; the immediately following approved private worker POST can use it. No model call is needed.
4. Trigger one `POST /api/calendar-delivery-background`, body `{}`, exact in-memory `x-service-worker-key`, no owner Bearer. It is one of the three direct posts, also inside site/write counters. Wait a bounded interval without polling, then inspect the exact private delivery record once. Verify source revision, target hash, deterministic event and actual synced/create receipt before `observeReceipt(stage:'create', ...)`.
5. Fresh runtime budget inspection. Move using the ordinary portal controls with the predeclared move submission and updated visit revision; the request must pass through the controller. This is local queueing, so no extra budget read before the single update worker. Wait and inspect its exact updated job receipt before recording stageupdate.
6. Enter cleanup. Cancel through the ordinary portal with the predeclared cancel submission and current visit revision; one cancellation worker. Wait and inspect actual exact-event cancellation/deletion receipt. Only then disconnect Calendar, cancel the free testing workspace and revoke every temporary session.

There are four normal budget inspections, not six: create/move themselves make no provider/worker request. Worst-case physical Blobs plan with empty census is6lists + client2 + budgets8 + jobs6 = **22/25**. The initial budget may be a single404, reducing actual use to21. Each retained global Calendar row, polling retry or extra diagnostic consumes the remaining allowance. Stop rather than exceeding25. Reserve time, two refresh/read/dispatch attempts and one delete for cleanup as required by the proposal.

Retain authoritative local success separately from actual remote receipts. A queued/failed job or a synthetic browser conversation is not provider delivery. If uncertain, keep exact identifiers and stop normal work; never blind-create another event or replenish a budget. Local disconnect/cancel stops the cohort; deployed flags remain configured, constrained by the exact policy/current tenant and its expiry. They are not reset by this one-build scope.

## Remaining adapter work / known limits

The existing controller is infrastructure, not a persistent full journey runner. Before the first approved live request, the root must keep one reviewed process with the private packet, implement the single-effect Netlify/Git adapters above and attach ordinary browser requests to `controller.request()` without duplicate native sends. Old `createGuardedContext` demonstrates fresh contexts, blocked service workers/WebSockets, `route.fetch({maxRedirects:0,maxRetries:0})` and safe fulfillment; do not invoke its old fixed manifest or reopen its ledger. The new controller uses native fetch internally, so a fresh route adapter can validate/fulfill its returned `{status,headers,text}` instead of separately performing `route.fetch`.

The portal generates random move/cancel submissions normally. For this exact predeclared pilot, the browser adapter must substitute only those two ordinary visit action submission IDs before the guarded request, retaining the original payload/revision and allowing no extra fields; do not patch the deployed app. OAuth Google UI and the exact mailbox read stay in their separately authorized browser context. Their normal external login/consent traffic is not simulated by the first-party request guard.

No production/account assertion in this preparation has been live-verified. Local credential presence and installed SDK/OpenAPI contracts are evidence for constructing the adapter, not evidence that the hosted signup or provider account currently works.
