# QA review R2: open cards R4 rev 2

**Verdict: ACCEPT.** F1 is fixed and all four P3s are resolved. One small residual wording item is noted below; it is not blocking.

- **Reviewed:** `patches/open-cards-r4-rev2-on-5cb4233e.patch`, sha256 `c5880adb…dfdd9e55`.
- **Target:** release-4 HEAD `5cb4233e`, from `git archive`. All 8 files apply cleanly with no offsets.
- **How it was run:** `env -i`, `MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 MC_LOCAL_NO_KEYS=1`, `sandbox-exec` deny-remote, Chrome through Playwright.
- **Side effects:** no provider calls, push or commit. The copies were deleted.

## Results

| Run | Result |
|---|---|
| `qa-probe.mjs` (R1 probe, unchanged) | **14/14**, including both F1 practice-off cases |
| `qa-probe-r2.mjs` (new: P3s and F1 admin, in the real pages) | **5/5** |
| Author check (now 33 checks) | **33/33** |
| All three probe runs | physicalNetwork=0, forbidden=0, pageErrors=0 |
| Full `netlify.toml` gate, fresh offline process per step | **72/72 exit 0**. build-site: 182 html, 311 files |

## Findings

### F1 (P2): fixed
- **Server:** `platform()` now requires the pool's own limit to be above 0. The rank puts `off` below `ok`, so the overall `off` level comes only from global 0.
- **Practice env set to `0` or `bogus` at global 500:**
  - The owner gets no `platformLimited` flag.
  - The admin level is `ok`, with practice `off` and customer `ok`.
  - Overview shows no capacity notice.
- **Still correct from R1:**
  - Pool math: 50 splits 25/25; 100 splits 40/60; 500 splits 100/400 with a warning at 320.
  - When a shop's own limit binds, it is not flagged.
  - At global 0, the level is off.
  - `getAIPlatformUsage` stays read-only.
  - The owner payload carries no other shop's data.

### P3 items

| Item | Status | What I saw |
|---|---|---|
| F2: header pill | **Fixed** | Pool binds: "Shared AI limit reached" (`r2/screens/pill-shared-390.png`). Shop's own limit binds at 500: "Daily AI allowance reached". |
| F3: advice at max | **Fixed** | At 500 the Overview and System notices say "…already at its 500 maximum; more daily capacity is an owner/PO decision", with no "Raise". At 50 they say "Raise … (up to 500)". The 500 comes from the new `maxGlobal`, which matches `GLOBAL_MAX` in `globalLimit()`. |
| F4: customer label | **Fixed** | Pool label: "Customer replies: chat, phone, text (all shops)". Advice: "customer replies (chat, phone, text)". |
| F5: notice colour | **Fixed** | Overview notice is `.notice.error` when exhausted (`admin-overview-500-1280.png`) and `.notice.warning` at 80% (`admin-overview-50-390.png`, no horizontal scroll). The System panel now reads "500 replies, split into 400 customer and 100 owner practice". |

### Residual (P3, non-blocking)
- **What:** the per-shop issue "Platform AI limit reached" (`operator.mjs:86`) still says "Raise MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT or wait for the midnight Houston reset" when the limit is already at 500.
- **Where it shows:** next to the corrected Overview notice in `admin-overview-500-1280.png`.
- **Why it is not blocking:** it also offers "wait" and points to System, where the correct at-maximum wording appears.
- **Suggested change:** reuse the at-maximum wording in a later pass.

## Evidence
- `qa/r2/`: probe and author-check logs, and `gate-SUMMARY.tsv`.
- `qa/r2/screens/`: all viewed.
- Probes: `qa/qa-probe.mjs` and `qa/qa-probe-r2.mjs`.
