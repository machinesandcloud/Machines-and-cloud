# Machines & Cloud setup MCP server

An optional local assistant layer for one owner's workspace. Customers use the guided browser setup directly; they do not need an MCP client or a bearer token. The same initial preparation API serves both paths.

By default the server exposes three read-only tools:

| Tool | Result |
| --- | --- |
| `mc_get_setup_status` | Fresh six-service status, missing information, already-provided field flags, who acts next, current guides and discovery options. |
| `mc_get_service_guide` | Current backend guide for `web`, `voice`, `sms`, `calendar`, `thumbtack` or `angi`. |
| `mc_get_workspace_link` | Credential-free URL for an allowed workspace view. Does not open a browser. |

An authorized internal launcher can explicitly enable initial preparation with `MC_MCP_ALLOW_SETUP_PREPARATION=1`. This adds two tools:

| Tool | Result |
| --- | --- |
| `mc_preview_connection_setup` | Preview selected services and an optional business website. Reads current owner access and revision; makes no change. |
| `mc_save_connection_setup` | With `confirm: true` and the exact preview ID, save that immutable patch once through `prepare_connections`. Repeated calls check the same operation without another POST. |

Preparation saves website-chat, phone, texting and Calendar choices, plus a supplied business website and its exact HTTPS origin when website chat is selected. Omit the website to preserve it; an explicit blank clears the business URL without removing existing origin permissions. This initial-only action becomes unavailable once review, practice, live service or retained connection work has progressed. Existing customers keep the ordinary connection controls. It never changes billing, legal information, credentials, provider IDs, proof grants or activation.

A saved preparation is not a connected account. Customer grants, routing and cost approvals remain in the workspace; installation and actual delivery require their own checks. None of these tools grants access, purchases resources, sends messages, schedules visits, opens a browser or activates services. Thumbtack/Angi capabilities distinguish intake from native replies; discovery options are possibilities, not connected services.

An authorized launcher can separately enable `MC_MCP_ALLOW_SERVICE_INFORMATION=1`. This adds two tools for returning owners as well as initial setup:

| Tool | Result |
| --- | --- |
| `mc_preview_service_information` | Preview only supplied website preferences, phone routing or an optional Google account hint. Saved defaults are kept; phone/email values are masked in output. |
| `mc_save_service_information` | Confirm the exact preview and save through the same encrypted, conditional draft API as Connections. Saving selects the service; it does not apply routing or website permissions. |

Three tools are available by default, five with either write option, and seven with both. The flags are independent and exact-value opt-ins. Existing initial preparation remains initial-only; service-information drafts use the backend's current per-service eligibility for returning owners.

The status result's `information` describes each service's entry route, required/provided field IDs and labels, completion, review requirement and next responsible actor. It never returns retained field values. Reuse provided facts, ask only for missing information, and send a fully supplied but invalid draft (`needsReview: true`) to its existing workspace correction step. Presence is separate from validated information and delivered service. SMS business registration stays in the secure form; Thumbtack and Angi keep their real provider handoffs.

## Run locally

Use Node 22 or newer and the locked package dependencies:

```sh
cd integrations/mcp
npm ci --ignore-scripts
npm test
```

Configure the MCP client to launch `node` directly with the absolute path to `integrations/mcp/dist/index.js`. Do not launch through `npm`: stdout is reserved for MCP JSON-RPC. Static startup diagnostics use stderr.

Supply these child-process variables through the launcher's local secret/environment facility:

- `MC_WORKSPACE_URL`: the existing owner URL, such as `https://machinesandcloud.com/desk?c=your-workspace#setup`.
- `MC_OWNER_BEARER`: the current verified owner-session bearer held by the authorized internal launcher. This server neither creates nor extracts sessions.
- Optional `MC_MCP_ALLOW_SETUP_PREPARATION=1`: explicitly enables the two preparation tools. Other values leave the preparation tools disabled.
- Optional `MC_MCP_ALLOW_SERVICE_INFORMATION=1`: independently enables the two service-information tools. Other values leave these tools disabled.

Keep the bearer out of prompts, repositories, shell history and shared configuration. It is sent only in the Authorization header to the fixed owner API. Expired or revoked access stops new reads/writes. Browser review links require the browser's own sign-in and never carry credentials. No global MCP configuration is installed or changed by this package.

For deliberate fixtures only, `MC_MCP_ALLOW_LOOPBACK=1` permits an explicit loopback `http`/`https` workspace URL on `127.0.0.1`, `localhost` or `[::1]`. Production defaults permit only `https://machinesandcloud.com`. There is no listener, remote transport, arbitrary endpoint argument or redirect following.

## Preparation confirmation and recovery

Preview arguments accept only unique service IDs and an optional website. To avoid leaking query credentials into assistant output, the MCP input is narrower than the portal: public HTTPS URLs only, without query, fragment, credentials, custom port, private/IP host or the platform's own site. The backend remains the authority for validation.

Only one immutable preview is held in process memory for ten minutes, with an opaque random ID and a separate random submission ID. Output includes only the caller's proposed patch, a credential-free review link and static guidance. Current business identity, saved website, revision token and private receipt are never tool output. Restarting the process loses the preview; review the workspace before attempting further work after an uncertain save.

The save tool requires fresh owner access and the same revision as the preview. It submits only the fixed initial preparation action, with a fixed Origin header matching the configured platform. A write that times out or has an unsupported result triggers one bounded GET. Success requires the current eligible/prepared marker, the exact operation's submission ID and matching proposed fields. Matching fields alone do not establish success. A progressed workspace remains uncertain and routes to its current controls. An unresolved save blocks another preview in this process; subsequent calls reconcile by GET only. There are no blind POST retries.

Concurrent save/preview calls cannot create multiple pending writes. Backend CAS rejects stale revisions, changed payloads under an existing submission ID, tenant/lifecycle changes and competing provider starts. The browser uses that same API and receipt, so an assistant cannot bypass its setup requirements.

Service-information previews follow the same ten-minute, immutable, one-attempt policy. Supported fields are `web`: website/builder/installationBy; `voice`: forwardingMode/businessNumber/carrier/forwarding/ownerPhone; `calendar`: accountEmail. Their sections and backend action are fixed by code. Unknown fields, sensitive registration fields and arbitrary actions are rejected. Only caller-supplied fields are changed. A shared MCP mutation lock prevents concurrent setup changes, and an uncertain save blocks changing the other setup area until the original operation is reconciled. Backend preparation/intake tokens also fence changes across those stages, including changes made in the browser. A historically confirmed save can be followed by a newer preview without being misreported as an uncertain write.

After an assistant saves a website draft, the ordinary portal resumes at the prefilled website confirmation when the address still needs application. Existing website permissions change only through that explicit portal action. Phone routing likewise retains its existing review. Customers never need to configure or install this MCP to use the portal.

## Transport and privacy

Every read uses fixed `GET /api/client?c=<configured workspace>&setup_assistance=1`. This authenticated projection returns setup facts and redacted draft state without customer leads, bookings, conversations, exports, credentials or the private registration form. The backend checks the current owner, tenant and setup revisions after asynchronous projection work. Only an opt-in save uses a fixed POST to `/api/client?c=<configured workspace>`. Requests omit browser cookies, refuse redirects, disable caching and have an eight-second abort plus a one-MiB streamed response cap. A tenant mismatch, malformed response or revoked session returns static recovery copy without upstream bodies or credentials. An uncertain write is explicitly distinguished from a successful read or save. There is no fallback to the full owner dashboard or `service_intake=1` when this endpoint is unavailable.

Read tools project only allowlisted `setup.connectionJourney` fields: service IDs, labels, statuses, bounded guides, discovery IDs and browser views. The original owner DTO, customer records, conversations, account IDs, keys, callback URLs and private connection details are not returned. Text redaction removes accidental private interpolation, emails, URLs, phone-like values and long identifiers before truncation. This is defense in depth for static backend guidance, not a general PII classifier.

Read tools and preview declare read-only annotations. Save declares `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: true`, `openWorldHint: true`: it can change saved choices and a supplied URL, while replaying one preview never repeats its POST. Annotations are hints, not authorization; fixed code paths enforce scope. Tool results are data, not permission for another action.

This M&C server does not inherit a provider's MCP permissions, account access or task allowance. There is no Yelp, Zapier, website-builder or other provider connection installed by this package.

## Validation

Official SDK packages remain pinned at `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4.0, Zod 4.6.7, TypeScript 7.0.2 and `@types/node` 26.6.5. No dependencies were added or upgraded; the local adapter is version 0.3.0.

`npm test` builds and exercises real SDK initialization, default/opt-in tool discovery, strict arguments, privacy, fresh authorization, fixed host/tenant/Origin, stale state, interrupted saves, exact receipts, concurrency and actual stdio child processes. Physical networking is blocked in parent and child; owner responses are synthetic. These tests establish local protocol behavior, not real account access, published functionality or provider delivery. Historical read-only evidence remains in `LOCAL-ACCEPTANCE.json`; current preparation evidence is separate.

Sources checked October 25, 2026:

- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP tools and confirmation guidance](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
