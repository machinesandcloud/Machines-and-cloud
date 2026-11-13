# Open cards R4: fixes on release 4 (not applied)

## Rev 2, on release-4 HEAD `5cb4233e` (current)

Rev 2 answers QA's review in `qa/QA-REVIEW.md`: one P2 (F1) and four P3s (F2-F5).
- **Patch:** `patches/open-cards-r4-rev2-on-5cb4233e.patch`, sha256 `c5880adb…d9e55`. It replaces the rev 1 patch.
- **Same 8 files.** The cards and scope are those of rev 1, listed below.
- **Copies:** offline throwaway copies under `scratchpad/opencards2/`, deleted afterwards.

| QA item | Change in rev 2 |
|---|---|
| **F1 (P2)** | **`self-service-ai.mjs`:** `platform(ownLeft, remaining, poolLimit)` now takes each pool's own limit and requires it to be above 0. The practice pool passes `practice`; customer passes `global - practice`. A practice limit of 0 or an invalid value reads as practice switched off, not as a shared limit that has been used up. In `getAIPlatformUsage`, `off` ranks below `ok`, so the overall level is `off` only at global 0, which stays special-cased. |
| F2 | **`desk.js`:** the header pill reads "Shared AI limit reached" when `web.platformLimited` is set. A shop-only limit keeps "Daily AI allowance reached". |
| F3 | **`admin.js`:** when the global limit is already at its maximum, the advice says "already at its 500 maximum; more daily capacity is an owner/PO decision" and does not advise raising it. `getAIPlatformUsage` now returns `maxGlobal`, from a new `GLOBAL_MAX` constant that also bounds the env check. |
| F4 | **`admin.js`:** the label is "Customer replies: chat, phone, text (all shops)". The advice names "customer replies (chat, phone, text)". The panel line reads "50 replies, split into 25 customer and 25 owner practice", and per-shop limits read "customer"/"practice replies". |
| F5 | **`admin.js`:** the Overview notice uses `notice error` when the pool is exhausted and `notice warning` at the 80% warning level. |

**Check** (`checks/open-cards-r4-check.mjs`, 33 cases) adds:
- QA's `qa-probe.mjs` server cases, run in-process with the same env handling:
  - pool math at 500 and 100, with the 319, 320 and 400 boundaries;
  - practice pool full;
  - global 0;
  - partly used allowance;
  - shop and pool both used;
  - invalid env throws;
  - **practice env `0` and `bogus` at 500 (F1)**;
  - the owner payload exposes no other shop's counts.
- QA's ONB-11 phone variants: three numbers shown verbatim.
- F2 pill in both states, F3 at 500, F4 label and split line, F5 class in both states.
- An admin case with practice off at 500 (F1).

| Run | Result |
|---|---|
| Check, `5cb4233e` + rev 2 | **33/33**. physicalNetwork=0, forbidden=0, pageErrors=0 (`receipts/rev2/check/`). |
| Mutants, rev 2 (`harness/mutants.py`: M01-M15 from rev 1, plus M16-M22 for F1-F5) | **22/22 killed** (`receipts/rev2/mutants/mutants.json`) |
| Full `netlify.toml` gate on `5cb4233e` + rev 2, each step in a fresh offline process | **72/72 exit 0**, build-site 182 html (`receipts/rev2/gate/SUMMARY.tsv`) |
| Check, `5cb4233e` + rev 1 | **26/33**. The failures are F1 (×3), F2, F3, F4, and the QA 500 case on the new `maxGlobal` field. |
| Check, `5cb4233e` alone | **9/33**. The passes are controls and cases that hold on base. |

## Rev 1 (superseded), on `eb973e37`


**Nothing is applied to tracked files, committed or pushed. No provider was called.**
- Patch: `patches/open-cards-r4-on-eb973e37.patch`, sha256 `e972fb2d…03b0dd`. It changes 8 files, +68/−6.
- Every run was offline on throwaway copies under the session scratchpad (`opencards/`):
  - `env -i` with `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1` and `MC_LOCAL_NO_KEYS=1`;
  - `sandbox-exec` deny-remote;
  - Chrome through Playwright (`channel:"chrome"`).

  The copies were deleted afterwards.

## Fixes

| # | Card | Change |
|---|---|---|
| C1 | **PRA-OPS-06** (P1, code part) | **`lib/self-service-ai.mjs`:** `allowance()` sets `platformLimited:true` on `web` or `private` when the shop still has its own allowance but the shared pool is used. New read-only `getAIPlatformUsage()` returns both pools' used/limit, shops using AI today, and a level: `ok`, `warning` (80% or more of either pool), `exhausted` or `off`. It never writes the daily record. |
| | | **`manage.mjs`:** adds `system.aiCapacity`. An unreadable record shows as unavailable. |
| | | **`admin.js`/`admin.css`:** a new System panel, "AI replies today". At warning or exhausted, an Overview notice names the pool and the env var to raise, with a "View System" button. |
| | | **`operator.mjs`:** the per-shop issue reads "Platform AI limit reached" when the pool, not the shop, is the limit. |
| | | **`desk.js`:** the owner's "AI replies left today" line adds "Today’s shared platform limit is used, not your own allowance; our team has been shown this." |
| | | The capacity size itself stays an owner/PO decision. |
| C2 | **PRA-ONB-11** (P3) | **`desk.js`:** Account "Contact cell" uses the existing `ownerPhone()`, so it reads "(713) 555-0198". The stored value is unchanged. |
| C3 | **PRA-POLISH-12** (P3, brand part) | **`desk-connections.css`:** while `data-workspace-state` is `loading` or `recovery`, the rail shows only its logo, as a top bar. That bar is navy with the white logo at desktop and white with the dark logo at 900px and below, like the signed-in header. The workspace navigation stays hidden. **Not done:** the skeleton loader and the focus outline (the a11y owner's area). |
| C4 | **PRA-POLISH-15** (P3) | **`desk-setup-guide.css`:** on the Connections list, every mark sits in one 32px neutral tile at all widths. At 640px and below, each row is mark + name on line 1 and status + badge on line 2, and names do not wrap. **Not done:** onboarding card icons. |

## Overlap with in-flight work
- **`desk.js`** has two one-line hunks, at ~1046 and ~1254. They stack:
  - over the a11y and polish patches (offset 4);
  - before or after the copy patch, which applies cleanly after this patch and vice versa.

  The ~1254 hunk sits 3 lines from the copy patch's account hunk.
- No other file overlaps the a11y, copy or polish patches. Those patches do not touch `desk-connections.css`, `desk-setup-guide.css`, `admin.*`, `manage.mjs`, `operator.mjs` or `self-service-ai.mjs`.
- Pre-existing conflict, not caused by this patch: the copy and polish patches conflict with each other in `desk.html` (copy hunk at :99 fails after polish).

## Proof

| Run | Result |
|---|---|
| `checks/open-cards-r4-check.mjs` on the fix copy (it uses `first-customer-fix/checks/fc-lib.mjs`: actual `/api/client` and `/api/manage` handlers) | **16/16**. Re-run from the saved patch: 16/16. physicalNetwork=0, forbidden=0, pageErrors=0. |
| Same check on base `eb973e37` | **3/16**. The 3 that pass are no-regression controls. |
| Mutants (`harness/mutants.py`; each reverts one piece of the fix) | **15/15 killed** (`receipts/mutants/mutants.json`). A first M15 (white rail background at 900px and below) survived because `desk.css` already sets it. That declaration was dropped as redundant, and M15 now targets the desktop top-bar layout. |
| Full `netlify.toml` gate on the fix copy, each step in a fresh offline process | **72/72 exit 0** (`receipts/gate/SUMMARY.tsv`). `build-site`: 182 html. |
| Existing suites, fix vs base | connector-pages-ui **55/55 vs 55/55**; operator-session-ui-qa **30/30 vs 30/30** |
| Screenshots (`receipts/check/*.png`) | Connections at 390, loading and recovery at 390/1440, admin System. Reviewed by eye. |

**Gate decision:** the check needs Playwright, so it stays in `qa-artifacts` like the FC checks. `netlify.toml` is unchanged.

## Reproduce
1. `harness/mk.sh <name> fix|base` (needs the scratchpad `p10/nm`).
2. `harness/run1.sh <copy> <log> node qa-artifacts/claude-collaboration/open-cards-r4/checks/open-cards-r4-check.mjs --playwright <index.mjs> --out <new dir>`.
3. Gate: `harness/gate.sh <copy> <outdir>`.
4. Mutants: `python3 -I harness/mutants.py <fix copy> <outdir>`.
