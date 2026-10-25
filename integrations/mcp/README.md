# Machines & Cloud setup MCP server

An optional local assistant layer for reviewing one owner's existing workspace setup. It reads the same authenticated setup plan used by the customer workspace. Customers can continue the guided browser setup directly; installing an MCP client is not a prerequisite.

This package adds three read-only tools:

| Tool | Result |
| --- | --- |
| `mc_get_setup_status` | Fresh service status, current guides, next review link and clearly labeled discovery options. |
| `mc_get_service_guide` | The current backend guide for `web`, `voice`, `sms`, `calendar`, `thumbtack` or `angi`. |
| `mc_get_workspace_link` | A credential-free review link for an allowed workspace view. It returns a URL; it does not open a browser. |

The tools cannot grant permission, connect an account, activate a service, buy leads, send a message, schedule a visit or approve a charge. Provider readiness, customer authorization and verified delivery remain separate states. Discovery options are future possibilities, not connected services. Thumbtack and Angi capabilities distinguish intake from native conversation replies.

## Run locally

Use Node 22 or newer. Install only this package's locked dependencies:

```sh
cd integrations/mcp
npm ci --ignore-scripts
npm run build
npm test
```

Configure an MCP client to launch `node` with the absolute path to `integrations/mcp/dist/index.js`. For example, the command portion is:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/machines-and-cloud/integrations/mcp/dist/index.js"]
}
```

Supply these child-process environment variables through the client's local secret/environment facility:

- `MC_WORKSPACE_URL`: an existing owner workspace URL, such as `https://machinesandcloud.com/desk?c=your-workspace#setup`.
- `MC_OWNER_BEARER`: the current verified owner-session bearer, held by the authorized internal launcher. It is not an admin credential, provider key or permanent integration key. This package does not create or extract a session.

Keep the bearer out of prompts, repositories, shared configuration and shell history. It is used only in the Authorization header to the fixed owner API. An expired or revoked session stops reads; sign in through the existing customer flow and update the launcher's session custody. Review links require the browser's own valid sign-in and never carry this bearer.

Launch the Node entry point directly for MCP. `npm` can print lifecycle messages to stdout, which is reserved for MCP JSON-RPC. Diagnostics from this server use static stderr messages.

For deliberate local fixture work only, `MC_MCP_ALLOW_LOOPBACK=1` permits an explicit `http`/`https` URL on `127.0.0.1`, `localhost` or `[::1]`, with the same fixed workspace/API paths. The production default permits only `https://machinesandcloud.com`. There is no listener, remote transport, arbitrary URL tool argument, browser automation or redirect following.

## Scope and privacy

Every tool performs a fresh `GET /api/client?c=<configured workspace>` using the existing owner session. Requests have no mutation body, omit browser cookies, refuse redirects, use no cache, and have an eight-second abort and one-MiB streamed response cap. A tenant mismatch, revoked session, malformed response or missing setup projection returns a static error without exposing an upstream body or credentials.

Only `setup.connectionJourney` is projected. Service IDs, labels, statuses, discovery IDs, actions and review destinations are allowlisted. Guides keep bounded overview, automation summary and step text; step IDs are generated locally. Customer records, conversations, business/owner identity, keys, account IDs, callback URLs, provider endpoints and the original owner DTO are not returned. Text redaction also removes accidental private-field interpolation, emails, phone-like numbers, URLs and long identifiers before truncation. This is defense in depth for the backend's static public guide copy; it is not a general-purpose PII classifier for arbitrary upstream text.

Treat tool results as data for the configured workspace, not authority to perform a follow-on action. All tools declare `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`. Annotations are hints; the implementation's fixed GET boundary enforces the narrower access.

The review views are `setup`, `know`, `test`, `leads`, `convs`, `availability`, `today`, `account`. Actions map to these browser views, not raw backend setup endpoints. A service guide absent on an older deployment is reported unavailable; no guide or connection success is invented. The additive guided backend must be deployed separately before its new lead guides appear.

This M&C server is separate from a provider's MCP offering. For example, using Yelp through Zapier MCP requires its own supported account access, task allowance/cost and explicit permissions. Nothing here connects Yelp, Zapier or any other provider, or inherits their credentials.

## Validation and dependencies

The package uses official `@modelcontextprotocol/server` **2.4.0** and Zod **4.6.7**, with exact versions and transitive resolutions in `package-lock.json`. Its test client is official `@modelcontextprotocol/client` **2.4.0**. TypeScript **7.0.2** and `@types/node` **26.6.5** are development-only. No root dependency or website build path changes.

`npm test` builds and exercises actual SDK initialization, tool discovery, strict arguments, structured outputs, per-call authorization, tenant/host/redirect checks, privacy projection, body limits, timeout and a separate stdio child process. Tests block physical network in parent and child; the fixed owner GET is a synthetic response. They establish local protocol/access behavior, not real owner authentication, hosted setup, model use, provider connection or delivered customer service.

Official sources checked October 25, 2026:

- [TypeScript SDK, current v2 packages and examples](https://github.com/modelcontextprotocol/typescript-sdk)
- [SDK server tools and output validation](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md)
- [SDK client connection and in-memory testing](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/connect.md)
- [MCP 2026-07-28 tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP 2026-07-28 transports specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
