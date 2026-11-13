# Release 2: independent release QA (2026-11-12)

**Verdict: GO** for product head `e2077b38` (branch `work/claude-release2-candidate-20261112`) on top of production `43ee2f2c`. I found no blockers. The non-blocking findings are listed in §6.

Every run was offline:
- No provider call, push or commit.
- No `route.fetch`. Non-loopback browser requests were aborted only.
- Only processes I started were stopped.
- Gate runs used `env -i` with `sandbox-exec` (`harness/deny.sb`). It denies all outbound traffic except loopback. The canary (`receipts/canary.log`) shows `api.twilio.com` and `example.com` fail with ENOTFOUND, `1.1.1.1` fails with EPERM, and loopback works.
- The local server ran under the same sandbox, with a preload that refuses non-loopback `fetch`. Its denied log stayed empty for every walk.

The throwaway copy was `git archive e2077b38`, without the tracked `qa-artifacts/` and `scratchpad/` evidence (18 MB), with `node_modules` symlinked to `p10/nm` (which includes `oauth4webapi`). It was deleted at the end.

## 1. Gate (reproduced, not trusted)

The exact `netlify.toml` build command was run once per row as a single `sh -c` chain, with `env -i MC_MEMORY_STORE=1 MC_FAKE_MODEL=1` under deny-remote.

- The command has 69 `node scripts/…` steps (`receipts/gate-command.txt`).
- The only change was an `echo @@STEP` marker before each step, used for counting.

| Clock (America/Chicago) | Fan-out | Result |
|---|---|---|
| Real clock (Nov 12, about 23:00) | none | **exit 0, 69/69**, 67 s (`gate-real-clock.log`) |
| **21:30** (Nov 11, the builder's RC2-T1) | autoflag | **exit 0, 69/69** (`gate-clock-2130.log`) |
| 18:30 (Nov 12) | digest | exit 0, 69/69 |
| Mon Nov 16 08:30 | weekly | exit 0, 69/69 |
| Tue Dec 1 09:30 | monthly | exit 0, 69/69 |

The clock is a Date-only preload (`harness/clock-target.mjs`) passed through `NODE_OPTIONS`, so every step sees it.

**RC2-T1 control.** At 21:30, the pre-fix scripts (`440de15e^`) fail:
- `ops-p2-fix-check` is 22/23 (N00);
- `ops-p2-qa-probe` is 13/14 (N0).

The fixed scripts pass 23/23 and 14/14 (`rc2t1-*.log`). So the clock fake was effective, and the fix is real and test-only (it touches only those two scripts).

## 2. Sign-in tabs rev 4 and `Sec-Fetch-Site`: fails open safely

`sameOriginBrowserRequest` requires `Sec-Fetch-Site: same-origin`. That requirement is checked in two places:
- at **exchange**, to choose the cookie transport;
- on each **cookie-handle** request.

A per-tab (Bearer secret) session never consults the header.

**HTTP matrix against the real local server: 52/52** (`sfs-http-matrix-part1.json`, `-part2.json`).
- **Exchange with the header missing**, `same-site`, `cross-site`, `none` or a wrongly cased value:
  - the request still succeeds with `transport:"tab"` and the session secret;
  - no cookie is set;
  - follow-up requests return 200 with **any** header value or none.
- **Probe cookie not returned** (cookies silently dropped): the exchange falls back to tab.
- **Legacy client** (cached old `onboard.js`, no `transport` field): the unchanged contract returns a session.
- **Cookie session**: same-origin returns 200. Every other label, or no label, returns 401. A handle without its cookie also returns 401.

**Real browser (Chromium 1223) behind a loopback proxy that strips every `Sec-Fetch-*` header** (`harness/strip-proxy.mjs`; `receipts/walk390-stripped/`):
- The proxy confirms the browser sent the header on 60/60 API requests and that all 60 were stripped.
- The full walk passes at 390: inquiry, verify, onboarding, desk, Customers, visit edit, export, stop/reopen, expiry, sign in again, sign out.
- The server logged `owner_exchange {"fetchSite":"missing","transport":"tab"}`.
- The only "failure" is the expected behaviour: a **second tab asks for an email link**. That is per-tab sign-in, the same as production `43ee2f2c` today. Owners are not locked out.

**Mixed case: header present at sign-in, then lost mid-session** (`receipts/mixed/`, 6/6):
- The cookie session gets a 401, and the page shows "Sign in to your workspace… saved business details are kept".
- Signing in again while the header is missing falls back to tab and works.
- The tab session survives a reload.
- No page errors.

Worst case, the owner requests one more email. There is no loop and no lockout.

**Conclusion.** Missing or stripped headers degrade to the release-1 per-tab sign-in. **No fix is required.**
- Keep the RELEASE-NOTES §6 deploy check: the `access` log must show `"fetchSite":"same-origin"` on the preview or production.
- If it shows `"missing"`, do not announce sign-in across tabs. Nothing else changes.
- Not run: WebKit (the installed `webkit-2359` does not match this Playwright, which wants 2370). Older Safari is covered by the "missing" path above.

## 3. Real browser walk (local server, port 9853; screenshots viewed)

The command was `MC_LOCAL_NO_KEYS=1 MC_FAKE_MODEL=1 node scripts/local-server.mjs` (sandboxed, port 9853). Records were seeded through the real `desk.mjs` `flagLead`/`bookVisit` paths (`harness/qa-preload.mjs /seed`), and session expiry was simulated with `/expire`.

| Step | 390 | 1440 |
|---|---|---|
| Homepage: no horizontal overflow; the hero renders | pass | pass |
| Plans: the Plans link opens the disclosure; $99 and $249 each appear once; "Includes up to 50 AI replies a day"; no "customer chats" | pass | pass |
| Demo: Watch, then Try a typed question; the fake model replies | pass | pass |
| Inquiry, then email verify (outbox link), then 4-step onboarding, then "Your workspace is ready", then desk | pass | pass |
| Second tab of the same browser opens the desk without a new link (cookie transport) | pass | pass |
| Details save; hours grid changes Sat to 14:00; the hand-written line is kept with the notice "Your hours grid is saved. Your hours line was kept as you wrote it… Check that it still matches the grid" | pass | pass |
| Inbox: Open/Done filters; phones show as (713) 555-0142; owner words ("Wants a callback", "Not contacted yet"); no raw codes | pass | pass |
| Customers: name search and digits search; requests, visits and conversations are grouped | pass | pass |
| Session expiry on Customers (RC2-D1): "Your session expired. Sign in by email…"; **0 page errors** | pass | pass |
| Schedule: visit dialog, Edit details, saved receipt; delivery is stated as not confirmed | pass | pass |
| Connections: six services; no false "live" claims | pass | pass |
| Account: CSV export downloads (bookings, 1 row, header intact) | pass | pass |
| Account: pause | n/a | n/a |
| Account: Stop service, then reopen | pass | pass |
| Sign in again from email; sign out; another tab no longer opens the desk | pass | pass |

**Pause** is offered only while a service is live. A new workspace (in setup) shows only Stop service, so Stop and reopen were walked instead.

Final runs: **25/25 at 390, 25/25 at 1440, 0 page errors, 0 console errors, 0 blocked or denied external requests** (`walk390/walk-390.json`, `walk1440/walk-1440.json`). The early harness-selector misses that were re-run are not product defects.

## 4. Diff review (`git diff 43ee2f2c e2077b38 --stat`: 249 files, +2174/−1526)

I read the server diffs in full: access, lib/access, admin, manage, chat, sms, voice, twilio-alert, admin-key-audit, send, scheduler, onboard, self-service-ai, workspace-edit, desk.mjs, managed-sms and connection-journey. I also read the desk.js, desk-billing.js, owner-session.js and embed.js hunks, and the H1–H9 areas.

- **H1 (desk.js).** `mc:session-expired` keeps the kept-draft message, and the new reason messages come first. Sign-out broadcasts `signedOut`. In the browser, expiry and sign-out both behaved correctly.
- **H3 (embed.js and connection-journey).** `recoveryControls()` is kept and `sampleNote` is added. `realWebsiteRequest` only adds a second way to show "installed"; it requires an observation that is not older than the request.
- **H4 (manage, admin.js, admin.mjs).** These keep the `legacyKeyAudit`, `providerCleanupPending` and per-block error.
  - **Behaviour change:** legacy `/api/admin` (`x-admin-key`) now refuses **every** action on self-service shops (before, prompt, tasks and records were allowed), and audits each use. A failed audit write returns 503.
  - This is intentional ops-P2 hardening, and the gate passes. Operators should use `/api/manage`.
- **H5 (desk.mjs Spanish).** Strings only, plus `deWinEs` and the article-adding `dateEs`. No logic was lost.
- **Data safety.**
  - `applyWorkspacePatch` never erases a saved grid when a typed line does not parse, and it keeps the owner's hand-written hours line.
  - A new workspace without a plan gets `plan:"none"`. Every `PLANS[c.plan]` use either falls back with `|| PLANS.growth` or uses `?.`, so nothing throws.
- **Credentials and copy.**
  - Founder alerts no longer carry `&k=` owner keys (the scheduler now links to `/admin.html`, and `notifySteve` redacts).
  - Billing copy says a plan preference is "Not started: no payment has been taken".
  - The allowance line matches `WEB_LIMIT = 50` (per shop, "up to").
- **SEO (website P2, owner decision B11).** 108 enterprise pages get `noindex, follow`. The files stay live, and the sitemap drops from 174 to 66 URLs. The rss, llms and footer links are trimmed. No page was deleted.
- **AI budget.** Practice now has its own share carved out of the global limit. Production must keep `MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT=500` (RELEASE-NOTES §6). If it is unset, customer chat falls to 25 a day globally.

## 5. Legal deferral: verified absent

The tree was rebuilt independently with a temporary index:
1. start at `43ee2f2c`;
2. apply, in order, the diffs of every included commit **except** `9544341f`, `35e48085` and the revert `8dcca2a1`;
3. write the tree.

The result is `e2b276b3…`, which is **identical** to `e2077b38^{tree}`. `scripts/legacy-census.mjs`, `scripts/legal-prereq-check.mjs` and `customer-agreement.html` are absent, and no gate line names them. Privacy, Terms and SMS terms differ from 43ee only in the shared nav and footer lines.

## 6. Non-blocking findings

1. **P3, Account phone.** "Contact cell" still shows the raw `+17135550101`. Desk P2's `ownerPhone` formatting is not applied there (see `walk1440/33-account.png`).
2. **P3, legacy Spanish STOP reply.** In `sms.mjs` the reply says "Responda EMPEZAR…" only, while the managed path now says "EMPEZAR o START". RELEASE-NOTES describes only the managed path.
3. **Owner item, W1 wording.** "50 AI replies a day" differs from B2's recorded "50 customer chats a day". It is more accurate, but the owner should confirm it (already listed).
4. **Re-baseline the tests** noted in RELEASE-NOTES §5. Also, the deploy must keep the global AI limit at 500.

## Receipts

- `receipts/`:
  - the gate logs (5 clocks) and the RC2-T1 control logs;
  - the `Sec-Fetch-Site` matrix JSON files;
  - the walks with screenshots (`walk390/`, `walk1440/`, `walk390-stripped/`);
  - `mixed/`;
  - the server and proxy logs;
  - `SHA256SUMS`.
- `harness/`: `deny.sb`, `canary.mjs`, `gate.sh`, `clock-target.mjs`, `qa-preload.mjs`, `strip-proxy.mjs`, `sfs-matrix.mjs`, `walk.mjs`, `mixed.mjs`, `restart.sh`.
