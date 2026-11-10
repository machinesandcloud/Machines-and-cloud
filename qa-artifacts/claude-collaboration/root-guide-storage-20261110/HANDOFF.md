# Website guide storage continuity — engineering handoff

Existing finding `FINDING-276D71AF7EB847A5`; isolated child of exact `3372749d3007dd728cf9b06a83f2c175a903a4ee` in `/tmp/mc-root-guide-storage-20261110`, branch `work/root-guide-storage-20261110`. Only runtime delta is `desk-setup-guide.js` (7 additions, 3 deletions). The separately approved existing lifecycle check changes its replacement-session fixture; all other changes are owned checks/evidence.

The guide captures the session already available at page load. A storage exception retains that identity; readable removal or replacement invalidates it permanently for this document. Sign-out and expiry explicitly clear it. Existing request, session, generation, workspace and response guards remain. No copy/style/provider behavior changes. The separate mobile-heading finding remains open.

`ENGINEERING-RESULT.json` pins source hashes and result scope. `receipts/claude-guidestore-fix-final.json` passes 40/40 at 390 and 1440. Actual in-process owner handlers run behind browser routing with synthetic memory state and all physical transport denied. The matrix exercises ordinary website detail saves; direct returning guide URLs; status GET only; one canonical review POST/reference; GET-only review status and lost-response recovery; retry after 503; readable removal/replacement; sign-out/expiry while storage throws; held late actual-handler replies; and a fresh document with a new valid session after revoking the old one. The latter seeds only the synthetic sign-in return credential: email request/exchange/delivery is outside this check.

`receipts/claude-guidestore-original-final.json` serves exact parent guide bytes: all four affected status/review cases fail, while three hygiene checks pass (3/7 total). `receipts/claude-guidestore-weak-final.json` removes only readable identity invalidation from the fix: twelve negative cases fail, four sign-out/expiry cases and three hygiene checks pass (7/19). All runs report zero physical requests, forbidden browser requests and page errors. Screenshots were inspected for the mobile status view and desktop review receipt; saved support review is explicitly separate from activation.

Preserved early `fix-r1` reports contain two incorrect test expectations that required a previously valid status notice to disappear. The actual guide had retained that earlier valid notice; no new late result was proved. Replacement coverage preserves the original notice and plants a distinct saved support reference in the actual handler's later GET. The fix excludes that reference after an identity change; the weak variant exposes it and fails. Original failures and captures are retained.

## Lifecycle fixture disposition

Original `connection-assistance.json` is retained at 10/11. The failing row comes from `scripts/connection-intake-lifecycle-check.mjs`: `replacement session can perform its own later explicit save`. Its old fixture dispatches `mc:session-expired`, rebinds private guide/intake variables to another token, then directly invokes private `send`, bypassing the public `current()` guard. This does not model the application lifecycle: `desk.js:35` latches `leaving`, clears the session and removes private portal content; `onboard.js:453` checks the persisted new session and returns with `location.replace` at line 464. The expired document does not resume in place.

The browser cases named `return: fresh-page replacement session...` revoke the old actual memory-store session, expire/clear the page, write a new valid synthetic session, prove that storage replacement alone leaves the guide absent, reload the full page, and observe actual authenticated GET and review POST 200 with only the replacement bearer. They pass at both widths, including subsequent blocked storage.

Root reviewed and authorized the exact `PROPOSED-OFFICIAL-TEST.patch` (SHA-256 `d739f55ad51a57f4d1e846c4c2ab45436a191a77894dbe1914510ed1356aded3`). It changes only that fixture's fresh-page initialization and row name; original positive DTO, one saved event, one automatic review and replacement bearer assertions remain. Evidence-only `lifecycle-fresh-page-check.mjs` first passed 19/19. The applied official check now passes 19/19, and official `connection-assistance-official-fixed.json` passes 11/11 with zero physical requests. Preparation CAS passes 3/3. Original scripts and receipts are retained through Git/evidence. No blanket full-suite claim is made.

## Reproduction commands

Run in the child worktree; use the existing dependency symlink (identical lockfile SHA `a6969b0f5c4b3299fb6e005fefbfb212a76bfa275dbddefd0fb8a0369db61114`). No install is needed.

```sh
env -i PATH=/usr/bin:/bin MC_PLAYWRIGHT_EXECUTABLE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell /Users/stevengoumnai/.nvm/versions/node/v24.13.0/bin/node qa-artifacts/claude-collaboration/root-guide-storage-20261110/guide-storage-ui-check.mjs --serve fix --output scratchpad/claude-guidestore-review-unique.json
```

Use `--serve base --only security` for original causal failures, `--serve weak --only identity` for the deliberately weaker variant, or `--serve fix --only return:` for fresh replacement-session controls. Use a fresh output name; the runner refuses overwrite. Existing affected command: `env -i PATH=/usr/bin:/bin /Users/stevengoumnai/.nvm/versions/node/v24.13.0/bin/node scripts/connection-assistance-check.mjs <new-receipt.json>` (includes the official 19-case lifecycle check). `scripts/service-intake-cas-check.mjs` uses the same empty environment.

The canonical evidence folder contains byte-preserved copies of this worktree's scratchpad receipts and captures. Their original `scratchpad/` paths remain in the JSON; matching basenames under `receipts/` are the canonical copies. Independent acceptance and integration belong to Root/reviewer. This child grants no release or provider authority.
