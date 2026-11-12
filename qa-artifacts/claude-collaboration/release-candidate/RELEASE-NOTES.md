# Claude release candidate for the grouped release (2026-11-12)

For Codex, who runs the publication. **Nothing here is pushed, deployed or merged.** No provider was called. Every test ran offline: `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1`, no `.env`, and `sandbox-exec` with remote networking denied (`harness/deny-net.sb`, loopback only). `route.fetch` was never used.

- **Worktree / branch:** `/tmp/mc-claude-release-candidate-20261112`, `work/claude-release-candidate-20261112`.
- **Base:** Codex candidate `a54c5874`.
- **Product head (last code commit):** `ac10dc854057cd03cab3e46bce9c88b84cc8db46`. Every gate and suite below ran on exactly this tree. The commit that adds this folder is documentation and receipts only (`qa-artifacts/`, which `build-site` excludes from `dist`).
- **Size:** 40 commits on a54, 97 files, +6208/−595.
- **Authorization:** owner decisions of 2026-11-12 (`proposals-index/OWNER-DECISIONS-RECORD-20261112.md`): A1–A15 and B2–B12 accepted with the recommended defaults, B3 in-app Checkout (still gated), and B1 one grouped release.

## 1. Gate result

| Run | Result |
|---|---|
| **Deploy gate:** every `node scripts/…` in this tree's `netlify.toml` build line, one fresh process each | **67/67 exit 0** (`receipts/gate-67.tsv`). That is a54's 64, plus `data-erasure-check` (18), `account-lifecycle-check` (19) and `channel-availability-check` (channel availability). |
| Applied proposals' own checks | All pass, or pass after the documented test-expectation change (§4). |
| Key browser suites | All pass, or fail identically on a54 (§4). |
| Real integration defects (class a) | **None.** No product-code fix commit was needed. Every textual conflict was resolved as a union of the accepted patches (§3). |

## 2. Included proposals (apply order = commit order)

Patch sha256 values are in each commit message and in `receipts/apply-manifest.log`.

| # | Commit | Proposal / revision | Card(s) | Source commit(s) | Patch(es) used |
|---|---|---|---|---|---|
| 1 | `a5363b0d` | a54-03Δ rev 2 + QA r2 paren-join fix | – (index live defect 1) | `d0b6bca0`; QA `c1df5e54` | `a54-03-delta.patch`, `qa/r2/qa-r2-paren-fix-on-a54-03-delta.patch` |
| 2 | `6cea672b` | a54-10Δ (10 rev 3 on a54) | – (13) | `312f2269` / `d0b6bca0` | `a54-10-delta.patch` |
| 3–8 | `fd0d04b8` … `585671bf` | 01, 02, 04, 05, 06, 07 (backend rev 5) | – (3, 25, 14, 15, 16, 17) | 01/02 `9c208a5a`, 04 `d7d74449`, 05/07 `bf7a620b`, 06 `be63d2e4`; QA6 `7c1d59a6` | `backend-proposals/0N-*.patch` |
| 9 | `b59279e5` | 08 owner notes confidential | – (18) | `0effe8dc`; QA r3 `3f6ecec1` | `backend-proposals-2/08-…patch` |
| 10–13 | `bc1229a2` … `ce30c979` | 12-01, 12-02, 12-03-after-04, 12-04 (rev 4) | – (2, 22) | `008cf5e6` | as named |
| 14 | `c113a698` | 11 rev 4, stacked variant (N1 union) | – (8) | `26944890`; stacked `c7d9c43e` | `stacked/11-voice-truth-after-01-07-08-10-12.patch` |
| 15 | `56064588` | qa12v-07 owner-alert settle fix (owner A4) | – | QA `db445663` | `qa12v-07-…patch` |
| 16–18 | `7b146b29`, `50dbd10a`, `aefc8a79` | 09 rev 7: server after-02-10, widget-chain prerequisite (`git diff 0f412212 fbe08789 -- embed.js`, sha256 `0c941f3c…`), embed | – (7) | `5bc73c15`; chain `fbe08789` | as named |
| 19 | `bea39f7c` | 14 rev 2 V6 only (V5 deferred, B7) | – (9) | `236fc698` | `14-v6.patch` |
| 20 | `9200f82c` | 15 rev 5, stacked Path B | – (6, 12, 20) | `3ba592b1` | `stacked-r5/15-stacked-pathB.patch` (`18d7d421…`) |
| 21 | `6d4b2480` | 17 rev 2 + check update + repro check | – (10, 24) | `7f698179` | `17-calendar-delivery.patch`, `17-calendar-execution-check-update.patch`, `stacked/17-repro-check-add.patch` |
| 22–25 | `41e6140c` … `941c89ea` | P1, P2, P3 rev 4, P4 | – (11, 19) | P1/P2 `34bf6080`, P3 `e853c03d`, P4 `4619f923` | `frontend-proposals/P*.patch` |
| 26 | `95264cf8` | 18 rev 2, stack-QA variant | – (5, 26) | `fbc4381b`; stack QA `01bd5ecf` | `stacked/qa/fixes/18-stacked-r2.patch` |
| 27 | `b4d5721c` | 18-C1 coordination (from account-lifecycle rev 2) | PRA-OPS-03/04/05 | `39da102a` | `account-lifecycle-fix/patches/18-C1-coordination.patch` |
| 28 | `e85082c6` | 13 rev 4: after-12-02 + initial-capacity | – (23) | `03c8795b` | as named |
| 29 | `ed4048b0` | 16 rev 3, after-01-07-12 | – (4, 21) | `16ab9382` | `16-all-after-01-07-12.patch` |
| 30 | `80c739eb` | P5 + QA's three fixes | a11y AUDIT F1–F7 | `713d29bd`; QA `c9d55a24` | `P5-desk-c9204a7d.patch`, `P5-embed-fbe08789-09.patch`, `qa/QA-fix-after-P5-c9204a7d-fbe08789-09.patch` |
| 31 | `b2dca298` | desk-inbox-fix rev 2 | PRA-DESK-01/02/04/05 | `50ba0967` | `desk-inbox-fix.patch` |
| 32 | `3b9672c4` | calendar-unconnected-fix rev 2, **no option B** | PRA-CONN-01 (P0), -02 | `7d86fe04` | `visit-edit/stack/p0-r2-after-inbox.patch` (= r2 rebased on inbox) |
| 33 | `b3669d19` | channel-availability-fix rev 2, incl. build-gate step | PRA-ACQ-01/02, PRA-ONB-02 | `df321de2` | `patches/01…`, `02…`, `03-build-gate.diff` |
| 34 | `2dc15094` | customer-visit-changes rev 3 (QA r3 tests: §4) | PRA-HOMEOWNER-01/02 | `ed4da011`; QA `4b76b85f` | `visit-changes-r3.patch` |
| 35 | `4b890529` | visit-edit rev 2 | PRA-DESK-06/07 | `fe654fe2` | `visit-edit-after-inbox-p0.patch` + the guard from `visit-edit-after-visit-changes.patch` |
| 36 | `c15694e0` | operator-health-fix rev 2 | PRA-OPS-01/02 | `1342a2c8` | `operator-health-fix-r2.patch` |
| 37 | `d0e22935` | account-lifecycle-fix rev 2 (proposal 19) | PRA-OPS-03/04/05 | `39da102a` | `19-1`, `19-2`, `19-3`, `19-4-deploy-gate-on-18` |
| 38 | `e3eae53f` | urgency-spanish-fix rev 2, after-visit-changes-r3 | PRA-HOMEOWNER-03/04 | `8408e348` | `urgency-spanish-after-visit-changes-r3.patch` |
| 39 | `a73c2b11` | post-visit-fix rev 2 (reviews held by default) | PRA-HOMEOWNER-08 | `edc86aa5` | `PV-all.patch` |
| 40 | `ac10dc85` | optout-health-fix rev 2, full-stack variant | – (follow-up of 01/12 and operator-health QA) | `0f5efb38` | `r2/oh-01-optout-outbox-r2-fullstack.patch`, `oh-02-…-after-ops-r2.patch` |

The "–" card cells name the index's live-defect row (`INDEX.md`, "Highest-impact live defects"). Proposals 01–18 predate the audit card set.

**Count:** 33 proposals included: 23 index proposals (a54-03Δ, a54-10Δ, 01, 02, 04–09, 11–18, P1–P5; 12's four parts, 09's server/embed and the add-ons 18-C1 and qa12v-07 counted with their parents) plus the 10 audit fix proposals. Excluded: 3 (next batch).

**Owner-decision defaults as built:**
- Option B is not applied (A1).
- `POST_VISIT_REVIEW_REQUESTS_ENABLED` stays unset, so review requests are held (B5).
- A cross-shop STOP blocks all shops (B4a).
- 14-v5 is not applied (B7).
- The a54-03Δ paren fix and qa12v-07 are applied (A3, A4).
- `rules.visitChanges` defaults to `confirm_cancels` (A10).

## 3. Conflict resolutions (no behaviour beyond the accepted patches)

`-3` was used only where plain `git apply` failed. Every region was resolved by taking both sides' accepted changes. Each commit message repeats the resolution.

| Ref | Where | Resolution |
|---|---|---|
| R1–R3 | P5 on a54 (no a54 variant exists; P5 was QA'd on dfb/c9204a7d) | `desk-activity.js` hunk not applied: a54 `161cf80e` already returns focus to View report. `desk-calendar.css` not applied: a54 `a080ece9` already has `#5f6b7d`. `desk.html`/`desk.js` × P4 are unions: P4's welcome-email sentence plus P5's `recoveryTitle`/`role=status`; sign-out removes both `ownerKeyStorage` and `cfgExpiredKey`. **Proof: p5-check 25/25, including F2.** |
| R4 | desk-inbox `desk.js` | Context only, next to the P3-changed line. The 3-way merge was clean. |
| R5 | P0 r2 `desk.js` | P3's `websiteInstallPrimary` line kept, plus P0's `websiteCalendarConnect` listener. |
| R6 | channel-availability | `chat.mjs`: availability-aware sales call, keeping a54-10Δ's `safetyLine:false`. `client.mjs`: inbox `newestFirst()` plus `channelAvailability`. `netlify.toml` gate step re-made on the current build line. |
| R7 | visit-changes r3 | `chat.mjs` imports are a union. `managed-sms.mjs`: r3's visit context and `CHANGE_VISIT`, plus a54-10Δ's `fallbackLanguage`/`logSlug` and `savedBefore`. |
| R8 | visit-edit | No documented variant covers inbox + P0 + visit-changes + P5. The after-inbox-p0 variant was applied with `-3`. Its pre-image blob needed option B and was regenerated in a temporary index only; no option B text is in the result. Other resolutions: `desk-requests.js` keeps P5's focus return plus visit-edit's `requestSchedule`; `desk.html` takes visit-edit's required-field markup (both fix AUDIT item 7) and drops P5's duplicate note; `desk.js` keeps both validation blocks. The customer-actor 403 guard from the after-visit-changes variant was added to `owner-visits.mjs`. |
| R9 | operator-health `manage.mjs` | rev 2 health fields plus 18's `providerCleanupPending`. |
| R10 | account-lifecycle | `client.mjs`/`operator.mjs`: 19's lifecycle fields added beside inbox, channel and operator-health changes. `desk.js` keeps the inbox's `alertWaiting` rule. The gate line was hand-edited. |
| R11 | urgency r2 | `desk.mjs` imports keep 12's `optOutStatus`. `managed-delivery.mjs` puts the language templates inside visit-edit's no-duplicate-confirmation guard. `owner-visits.mjs` keeps `sourceRequestId` plus `language`. |
| R12 | post-visit (PV-all with `--3way`, as optout-health documents) | Import unions. Inbox and PV CSS both kept. `renderPostVisit()` added before visit-edit's `showModal`. The `post_visit` branch placed before visit-edit's action list. `queueManagedMessage` takes urgency's `subject`/`alert` and PV's `postVisit`; the email subject is `job.subject` first, then PV's `owner_visit_check`. |
| R13 | optout-health | OH-1: the 3-way merge was clean. OH-2: the operator `error` field was added beside `providerCleanupPending`. |

## 4. Test results and failure classification

The receipts are `receipts/*.tsv`. "(b)" means an expected test-expectation change, with the harness-only proof shown. "(c)" means pre-existing on a54, verified on an a54 copy (`receipts/a54-baseline.tsv`).

**Proposal checks that pass as is:**
- 01 stop-keywords (159 required, 0 failed); 02 chat-403 28/28; a54-03Δ 43/43.
- 05 callback 72/72; 06 csv; 08 owner-notes 765/765 (base = head with 08 reversed); 09 chat-token 73/73.
- 11 network 40/40; 12 manage-receipt 7/7, matcher 20/20, after04 5/5; 13 concurrent 39/39, initial-capacity 4/4, latency.
- 14 voice-v6 21/21; 15 v15-extra, p15s-server 6/6, qa-stack-adversarial 9/9; 17 repro 18/18, calendar-execution; 18 data-erasure 14/14.
- 19 account-lifecycle 24/24 (28/28 with `--browser`); pcu backend 24/24 and browser 18/18; desk-inbox 51/51; visit-edit 23/23.
- channel-availability gate mode 16/16 and `--browser` 30/30.
- **visit-change-check-r3 + QA `QA-VISIT-r3-tests.patch` 70/70** (the test patch applies to the proposal's own check, run from the copy).
- post-visit-check 27/27, post-visit-inbound, post-visit-ui (0 errors at 390/1440, held default); optout-health 113/113.
- P2 12/12, P3 27/27 and 37/37, P4 13/13 and 14/14, P5 25/25.
- 09 widget-token 51/51 at 390 and 1440; p15s-widget 3/3 at both widths.

**Key browser suites:**
- connector-pages 55/55; desk-details-save-recovery 29/29.
- onboard-validation final 16/16; onboard-recovery 59/59; customer-onboarding entry 21/21 and plan 26/26.
- conversation-history-ui 12/12 (stack QA's N-a, fixed by 15 rev 5); widget-setup-refresh 8/8.

**Failures, classified:**

| Check | Result | Class | Evidence |
|---|---|---|---|
| desk-daily-work | 10/12 | (b) desk-inbox Open/Done | With inbox's one-click Done step (`desk-inbox-fix/receipts/probes/daily.diff`): **12/12**. a54: 12/12. **Codex: update the suite with that step.** |
| 04 tool-result-truth, 07 missed-call, 11 fault (V4) | 13 rows; 14/16; 39/40 | (b) 15 D5 fail-closed webhooks (stack QA E1) | QA harness-only versions: 04m 0 failed, 07m 16/16, 11m 40/40 |
| a54-10 agent-truncation | crash at the 61st IP-less turn | (b) 15 A1 shared bucket (E2) | One IP per turn (`harness/a54-10m-agent-truncation-check.mjs`): pass |
| Codex sms-safety-check / -r2 | 16/18+4/6; 18/20+4/6 | (b) a54-10Δ copy rows (E5, owner A3) | `codex-r2-disposition` 20/20 + 6/6. **Codex: apply the 4-row expectation update.** |
| p12 failclosed / legacy / p12m (originals) | rows A1–A5 | (b) 16 rev 3 holds and requeues | 16's adjusted copies: failclosed-16r3 43/43, legacy-16r3 22/22, qa12-sms-probe-16r3 25/25, qa12r3-probe-16r3 14/14 |
| p12 visit-refusal (original) | case 6 | (b) 13 | 13's `p12-visit-refusal-check.with-13` 9/9 |
| p12 owner-alert (default mode) | 6 rows | (b) qa12v-07 applied | `--fix` mode (the check's mode for qa12v-07): 31/31 |
| 15 v15-fixes | 54/60 (6 A2r5 rows) | (b) 09 | Tokenless multi-turn conversations get 409 `conversation_reload_required` from 09. The widget path with tokens passes (conversation-history-ui 12/12; p15s; the 400-turn absolute-cap and share rows pass). The harness must carry `X-MC-Conversation-Token`. **Not yet re-run with tokens.** |
| urgency-spanish check | 17/21 (Q1, Q2b, Q7, Q11) | (b) 09 | The same tokenless repeat web turn gets 409. With a harness carrying the token (`harness/urgency-spanish-tail-token.mjs`, harness change only): **21/21** (`receipts/urgency-token-harness.json`) |
| operator-health-fix-check | 99/100 (R5b) | (b) OH-2 | R5b pins the raw `/api/health` text that OH-2 removes. Its own doc says to invert it. |
| customer-onboarding-ui full | 31/31, then a fatal `#saveMsg` wait | (c) | identical on a54 |
| widget-stream-check | `waitForFunction` timeout | (c) | identical on a54 |
| website-concurrency-ui | 10/13 | (c) | identical 3 failures on a54 |
| site-ui (`--playwright` npx 1223 Chromium, local server on 127.0.0.1:8977) | 304 checks, 10 issues | (c) | a54 (port 8978): the same 10 issues, byte-identical |

**Not run:**
- the mutant suites;
- 02's two dfb-era widget-403 probes (stack QA E4: superseded by 09's widget-token-check);
- 13's desk-concurrent browser probe;
- QA-18's whole-repo `leak.sh` (stack QA §6 asks for it once).

## 5. Excluded: next batch

- **signin-tabs-fix:** rev 3 QA running (PRA-ONB-01; A11 accepted).
- **onboarding-p2-fix:** rev 2 QA running (PRA-ONB-03..08; it conflicts with channel availability).
- **connectors-p2-fix:** rev 2 QA running (PRA-CONN-03..13).
- **Accepted by the owner but not built in any accepted patch** (left out so behaviour stays limited to the accepted patches):
  - A4: REVOKE / OPT OUT / CANCELAR / BAJA in the `/policy` list (`sms-policy-check` pins the copy).
  - A6: 15's two abuse checks in the build gate. `v15-fixes` first needs the 09-token harness (§4), or the build would fail.
  - A6: slug entropy of 64 bits or more.
  - A7: owner notice when a 14-day held text expires (OD-16-2).
  - A12: `ownerMayResume` for support pauses (the 6-line block) and the billing-cancel owner-reopen default.
  - 14-v5 (B7, with the phone launch).
  - Option B (not chosen).
- **Test updates for Codex** (§4): desk-daily-work Done step, Codex sms-safety 4 rows, v15-fixes and urgency harnesses carrying the 09 token, operator-health R5b inversion, p12 originals replaced by the 16r3 copies.

## 6. Deploy prerequisites and post-deploy actions

**Env vars:**
- `MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT=500` is **already set in production** (takes effect on this build).
- `TWILIO_AUTH_TOKEN` and `VAPI_WEBHOOK_SECRET` are **present in all contexts**, which 15-04 requires (without them, legacy webhooks return 503).
- **Do not set** `POST_VISIT_REVIEW_REQUESTS_ENABLED`.
- Optional, defaults built in: 15's `MC_PRACTICE_AI_*`, `MC_LEGACY_CHAT_AI_*`, `MC_SELF_SERVICE_AI_PUBLIC_IP_DAILY_LIMIT`, `MC_SELF_SERVICE_AI_PUBLIC_IP_POOL_PERCENT`, `MC_SELF_SERVICE_AI_PRIVATE_RESERVE`, `MC_ACCESS_EMAIL_*`, and 09's `MC_CHAT_LEGACY_GRACE_MINUTES` (30).
- No Stripe keys; billing stays parked.

**Build:**
- The gate is now 67 commands.
- New public file `channel-availability.js`, and new function `/api/channel-availability`.
- 09's embed and server ship in the same build, which meets "embed with or before the server".

**Netlify `Sec-Fetch-Site` check:** not needed. Sign-in tabs is not included.

**Vapi re-sync after deploy (provider write, owner-approved category):**
- Run the legacy `updateVoicePrompt` re-sync once, because 11's prompt changes (plus 04, 05 and 08) reach legacy assistants only that way.
- Legacy assistants provisioned without `server.secret` get 403 until the secret is re-pushed (15 D5).
- 14-v5 is not bundled.

**Other provider and ops actions:**
- 01: existing campaigns need REVOKE/OPTOUT added (provider write).
- **External uptime monitor:** `GET https://machinesandcloud.com/api/health` every 5 minutes. Alert after 2 consecutive non-200 responses or 10 s timeouts, to the operator mailbox plus one non-email channel. Without it, a stopped scheduler is not alerted (operator-health).
- One hosted read to confirm Netlify supplies `context.ip` (stack QA E2 note). Without it, legacy chat shares one `unknown` bucket.
- After the build: Forms shows `contact` and `agent-lead`, and the published deploy is at this commit.

## 7. Owner and legal items that remain

- **C1:** lawyer-approved Terms. Required before B3 Checkout, together with Stripe keys and a live Stripe test.
- **C2:** Privacy Policy and retention periods (18 O2/O3/O6/O7; billing rows on legal hold).
- **C3:** STOP scope under FCC 26-67, effective 2026-11-25. B4(a) blocks all shops for now.
- **C4:** a Spanish reviewer for 10's fallbacks, urgency's Spanish texts and times, and 01's phrase lists.
- **OD-PV-1:** re-registration before payment reminders can send.
- **B8, B9, B12:** legacy shared number, real support contacts, and Thumbtack/Angi brand permission.
- **Live proof still open:**
  - Twilio `StirVerstat`;
  - real-model wording in English and Spanish;
  - Google 409/commit lag;
  - a real Thumbtack notification;
  - actual phone, text and Calendar delivery.

## 8. Reproduce

- The `harness/` scripts are the ones that ran:
  - `ap.sh` applies and commits each patch;
  - `mk.sh` builds a throwaway copy;
  - `run1.sh` runs one sandboxed process;
  - `gate.sh`, `authors.sh`, `browser.sh`, `browser2.sh` and `base.sh` run the suites.
- Copies were `git archive` of the head, without `qa-artifacts/` or `scratchpad/`, with `node_modules` linked to the session's `p10/nm` (oauth4webapi included). At most two copies existed at a time, and all were deleted after the runs.
- Playwright `/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs` with bundled `chromium_headless_shell-1223`.
