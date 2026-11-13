# Claude release-2 candidate (2026-11-12)

**Nothing here is pushed, deployed or merged. No provider was called.** Every run was offline:
- `env -i` with `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1` and `MC_LOCAL_NO_KEYS=1`;
- no `.env` and no keys;
- a strict `sandbox-exec` profile (`harness/deny-net.sb`) that allows loopback IP only. Unix sockets are also denied, so DNS cannot leave the machine. The canary is `receipts/canary.log`.

`route.fetch` was never used.

- **Worktree / branch:** `/tmp/mc-claude-release2-candidate-20261112`, `work/claude-release2-candidate-20261112`.
- **Base:** production `43ee2f2c` (release 1, deploy `6af6668c`).
- **Product head:** `e2077b38`. The final gate and suites ran on this tree. The commit that adds this folder only adds `qa-artifacts/`, which `build-site` excludes.
- **Size against 43ee2f2c:** 16 commits (including the two legal commits and their revert), 249 files changed, 2174 insertions(+), 1526 deletions(-).

## 1. Result

| Run | Result |
|---|---|
| **Deploy gate** (every `node scripts/…` on the `netlify.toml` build line, one fresh process each) | **69/69 exit 0** at `e2077b38` (`receipts/final/gate/SUMMARY.tsv`). That is 43ee's 67 plus `ops-p2-fix-check` and `ops-p2-qa-probe`. |
| Proposals' own checks | All pass, or pass after the documented harness-only change (§5). |
| Key browser suites at 390 and 1440 | All pass, or fail identically on 43ee2f2c (§5). |
| Real defects found by integration | **2, both fixed:** RC2-T1 (gate flake, test-only) and RC2-D1 (desk P2 × desk.js page error). See §4. |

## 2. Included (apply order = commit order)

Patch sha256 values are in full in each commit message.

| # | Commit | Proposal / revision | Source | Patch (sha256 prefix) |
|---|---|---|---|---|
| 1 | `3cb8bf70` | sign-in tabs **rev 4** (PRA-ONB-01) | `fb588f11` | `signin-tabs-fix.patch` (`d8c9ae39`), `signin-tabs-fix-tests.patch` (`2463d54a`) |
| 2 | `295b3ae2` | onboarding P2 **rev 2** (PRA-ONB-03..08) | `541c994b` | `onboarding-p2-fix.patch` (`f62555ba`), `-tests.patch` (`1bb73725`) |
| 3 | `983733de` | connectors P2 **rev 2** (PRA-CONN-03..13) | `f08634f6` | `connectors-p2-fix.patch` (`d2bd1955`) |
| 4 | `efd9edfc` | ops P2 **rev 2** (PRA-OPS-07..16) | `e85b5a79` | `ops-p2-fix-on-stack.patch` (`d6f75b88`); gate line by hand, as in `gate-after-19-4.patch` (`56d67ecd`) |
| 5 | `f1990a77` | Spanish review, **after-urgency-spanish-r2 variant** | `565342d9` | `spanish-fixes-after-urgency-spanish-r2.patch` (`5dafea67`); desk.mjs hunks from `spanish-fixes.patch` (`a07b4fb2`), see H5 |
| 6 | `27302c29` | Spanish review **notes applied to strings now live** (urgency r2, 10, post-visit, optout-health, 05) | `565342d9` `PROPOSAL-NOTES.md` | hand edits, strings only |
| 7 | `440de15e` | **RC2-T1** ops gate checks fail at fan-out hours (test-only fix) | this candidate | — |
| 8 | `abf3a144` | website P2 **rev 2** (PRA-ACQ-05..13), **`on-channel-availability-r2` variant** + `09-stale-suites-tests.diff`, plus **coordinator wording W1** | `2d75d2b1` | `on-channel-availability-r2/website-p2-fix-combined-01-06.diff` (`dc146000`), `09-stale-suites-tests.diff` (`14791861`) |
| 9 | `7bed32c3` | demo 320px clipping fix (runtime) | `bef3ed5d` | `demo-320-fix.diff` (`7ee45f49`) |
| 10 | `639fb56b` | desk P2 **rev 2** (PRA-DESK-03/08-16), after-15 pool, practice floor 40 | `08c4667f` | `r2/desk-p2-fix-r2-on-43ee2f2c.patch` (`ad58c6ab`) |
| 11 | `9aa17717` | demo-outcome harness allow-list for `/api/channel-availability` (test-only, optional) | `bef3ed5d` | `demo-320-harness-test.diff` (`3e499591`) |
| 12 | `8dcca2a1` | **revert** of legal prerequisites r2 and legal pages (see §3) | — | — |
| 13 | `360eedf6` | release-1 stale UI checks (test-only) | `1e459e6b` | `r1-ui-stale-checks.patch` (`88dfdba8`) |
| 14 | `e2077b38` | **RC2-D1** Customers handler null guard | this candidate | — |

Notes on choices:
- **W1 (coordinator):** the website-chat line now says "Includes up to 50 **AI replies** a day". The earlier "50 customer chats" overclaimed, because `WEB_LIMIT` (`self-service-ai.mjs`) counts AI replies. Desk P2 leaves the per-shop `WEB_LIMIT` at 50, so the line stays accurate.
- **Website P2:** `07-optional-app-em-dash.diff` is not applied (optional). `08-claude-md-doc.diff` is held (coordinator).
- **Demo harness patch:** this patch is test-only and optional. It is included because, without it, `demo-outcome --phase ui` on this tree is **470/471**. The only issue is "zero unexpected network attempts", caused by three loopback `GET /api/channel-availability` requests that the harness already aborts. The 320px clipping check passes. With the patch: **471/471**.
- **Spanish, applied to live strings (strings only):**
  - urgency r2 `managed_*`: "queda registrada", "ahora es para", the STOP line "para dejar de recibir mensajes", and HELP with "al/a".
  - Proposal 10 `AGENT_FALLBACKS` es/bilingual: the 10 strings. Every bilingual line is 134 characters or fewer.
  - Post-visit: the review consent question, the enabled and not-enabled replies, and `STOP_LINE.es`.
  - optout-health: the Spanish STOP reply now names EMPEZAR o START.
  - 05: `fallback_window` is the single GSM-7 sentence.
  - `REVIEW_CONSENT_VERSION` is **not** bumped. The notes require a bump only if the question was ever sent, and review requests are held (B5), so it never was.

## 3. Deferred and pending

- **Deferred to a later release, pending legal-prereq rev 3:**
  - Legal prerequisites rev 2 (`52e36daa`). Independent QA rejected it: HELP is silently dropped, blocked replies are recorded as sent, and the opt-out detector has false positives.
  - The legal pages (`e9a4da09`), because they promise that behaviour.
  - Both were applied (`9544341f`, `35e48085`) and then **reverted** in `8dcca2a1`. The resulting tree is byte-identical (git tree `18b79307`) to `abf3a144` plus demo-320, desk P2 and the harness patch applied directly.
  - The revert also removes the hand-added `legal-prereq-check` gate entry. The r2 patch set ships no `netlify.toml` change, although it was described as including one.
- **Hard prerequisite carried forward for that release:**
  - P1 retires the shared sender. Its `legacy-census.mjs` was run **offline only**, against the `--fixture` memory store (`receipts/legal-deferred/legacy-census-fixture.log`: 2 legacy shops, 1 depends on the shared sender, 1 VIP recording, 1 plaintext Calendar token). It made no production read.
  - **The live census must run before any deploy that carries P1.** That run is a provider read and needs the owner's approval.
  - On the deferred tree, `legal-prereq-check` was 43/43 and the first gate showed one more effect: ops P2's S10a expects a founder SMS, which P1 removes. Rev 3 will need that expectation updated.
- **Not applied from the Spanish notes** (they are behaviour, not strings; the owner should decide):
  - the `REVIEW_YES` comma form ("Sí, reseñas");
  - the `SPANISH_STOP` detection additions;
  - 01's extra Spanish stop phrases (exact-only list);
  - the optional "a.m./p.m." spacing;
  - the fake-model "Soy la asistente" wording;
  - visit-changes r1 `cancelKeywordConfirmation` (not reinstated).
- **Spanish strings are AI-reviewed.** The C4 human spot-check is still needed (marked [spot-check] in the review).

## 4. Hand merges and fixes (both sides kept, no new behaviour)

| Ref | Where | Resolution |
|---|---|---|
| H1 | sign-in × P4/P5/channel (`desk.js`, `onboard.css/html/js`) | `mc:session-expired` keeps P4's owner-key recovery and P5's kept-draft message and focus, and adds rev 4's `signed_out`/`replaced`/`renewed` messages first. Sign-out removes `ownerKeyStorage`/`cfgExpiredKey` and broadcasts `signedOut`. Both CSS blocks are kept. `owner-session.js` loads before `channel-availability.js`. `request()` keeps `failure.data` and adds `replace_confirm` fields. |
| H2 | onboarding × sign-in × channel × 15 | The proposal says no shipped variant covers this stack. Its two documented variant resolutions were reproduced: `reply(body, status, cookies, extra)` with `[]` for the rate-limit reply; `retryAfter` added before `throw`; the website helpers placed after channel availability's lines. `spanRate` merged cleanly with 15-03. |
| H3 | connectors × 09/15 × calendar r2 | `embed.js checkControls()` keeps `recoveryControls()` and adds the `sampleNote` clause. In `connection-journey.mjs`, rev 2's web steps are used and calendar-unconnected r2's calendar line is kept. |
| H4 | ops × 18 × OH-2 | `manage.mjs` keeps rev 2's `legacyKeyAudit` and lean pages, 18's `providerCleanupPending` and OH-2's per-block `error`. `admin.js` keeps `blockLabel`/`blockAdvice`, the stale notice and the audit panel, plus OH-2's "Error:" line. The gate line was inserted by hand. |
| H5 | Spanish × urgency r2 × 01/12 × 05 | `desk.mjs`: the variant's pre-image blob is missing, so the a54 patch's `desk.mjs` hunks were 3-way merged. Urgency's `winEs` (identical) was kept, and `deWinEs` plus the article-adding `dateEs` were added. `fallback_window` follows note 6/05: no `callbackPromiseEs`, because 05 removed the window. `sms.mjs`: the review's two string edits were placed inside 01/12's restructured STOP/START code. |
| H8 | desk P2 × sign-in (`build-site.mjs`) | Both `owner-session.js` and `desk-customers.js` are listed. |
| H9 | r1 stale checks × desk P2 (`request-followthrough-ui-check.mjs:180`) | Desk P2's `/Confirmed/` and the Open/Done steps are both kept. It does not overlap website 09, which touches only `demo-outcome-check` and `site-ui-check`. |
| (H6/H7) | legal (`send.mjs`, `manage.mjs`; pages via `git merge-file`) | Recorded in `9544341f`/`35e48085`, then reverted. |
| **RC2-T1** | `ops-p2-fix-check` N00 / `ops-p2-qa-probe` N0 (new gate steps) | **Real test defect.** At 21:5x Houston the scheduler started the real autoflag background fan-out over loopback, and both checks failed. Any build at 21:00 (autoflag), 18:00, Monday 08:00 or 09:00 on the 1st would fail the deploy gate. The fix is test-only: both checks claim today's fan-outs before the scheduler runs. Proof: unfixed at a preloaded 21:30 clock, 22/23 and 13/14; fixed at 21:30 and at the real clock, 23/23 and 14/14 (`receipts/rc2-t1/`). |
| **RC2-D1** | `desk-customers.js` (desk P2) × `desk.js` (43ee) | **Real defect.** desk.js empties `#portalContent` on session expiry, and desk P2's Customers listener then wrote to the removed `#customerSearch`, giving the page error "Cannot set properties of null". The fix guards both writes (2 lines). Proof: conversation-history-ui page errors went from 1 to 0, and the desk-P2-reverted control is 12/12 (`receipts/rc2-d1/`). |

## 5. Test results and failure classification

**Proposal checks:**

| Check | Result |
|---|---|
| sign-in `signin-tabs-ui-check` | 71/71 |
| sign-in `signin-tabs-https-check` (real `__Host-` path) | 53/53 |
| onboarding `onboarding-p2-check` | 67/67 at 390 and 67/67 at 1440 |
| connectors `connectors-p2-fix-check` | **33/33** with harness H-c (below) |
| ops `ops-p2-fix-check --browser` | 36/36 |
| ops QA probe (original) | 14/14 |
| website `website-p2-check` | **39/39** with harnesses W1 and H-w |
| desk `desk-p2-fix-ui-check` | 28/28 |
| Spanish `spanish-review-check` | 19/19 |
| demo-outcome ui / bridge / recovery / fallback | 471/471, 25/25, 29/29, 17/17 |

**Key browser suites:**

| Suite | Result |
|---|---|
| connector-pages | 55/55 |
| desk-details-save-recovery | 29/29 |
| lead-source-reconnect | pass |
| onboard-validation final | 16/16 |
| onboard-recovery | 59/59 |
| customer-onboarding entry / plan | 21/21, 26/26 |
| portal-ui | 25/25 |
| widget-setup-refresh | 8/8 |
| website-install-ui | 40/40 |
| channel-availability `--browser` | 30/30 |
| account-lifecycle `--browser` | 24/24 |
| P5 | pass |
| site-ui (local server on 127.0.0.1:9791) | **478/478, 0 issues** |
| desk-daily-work, request-followthrough-ui, onboard-hours-resume | 12/12, 12/12, pass, after `r1-ui-stale-checks` |

**Failures, classified:** (b) is an expected test change, with the harness-only proof shown. (c) is pre-existing, verified on a 43ee2f2c copy (`receipts/base-ui/`).

| Check | Result | Class | Evidence |
|---|---|---|---|
| connectors-p2-fix-check (original) | 22/33 (PRA-CONN-08, 10 and the Q08/Q10 rows fail at the precondition) | (b) proposal 09 | The fixture's tokenless multi-turn web chat gets 409 `conversation_reload_required`. Harness H-c carries `X-MC-Conversation-Token`/`X-MC-Contact` and gets **33/33** (`harness/connectors-p2-fix-check-09token.diff`). |
| website-p2-check (original) | 34/39 | (b) W1 + channel availability | S13 pins the old "customer chats" wording (W1 changes it). B3/B4 at 390 and 1440 count the homepage's `/api/channel-availability` GET as a voice API call; the proposal's browser proof ran on a54, which does not have that request. Harness H-w excludes only that path and gets **39/39** (`harness/website-p2-check-rc2.diff`). |
| desk-inbox-fix-ui | 49/51 | (b) desk P2 phone formatting | It expects the raw `+18325550133`; desk P2 now shows "(832) 555-0133" on purpose. With that expectation: **51/51** (`harness/desk-inbox-fix-ui-check-phone.diff`). |
| conversation-history-ui | 10/12 | (a) RC2-D1 + (b) desk P2 budget | The page error was fixed (RC2-D1). The remaining row is the 12-turn widget flow: the check strips `MC_SELF_SERVICE_AI_*` and runs at the default limit of 50. Under desk P2's carve-out that leaves customer chat 25, proposal 15's reserve takes 10, and the per-network share is 11, so turn 12 gets 429, by design. With production's 500 (harness): **12/12, 0 page errors** (`harness/conversation-history-ui-check-500.diff`). |
| desk-p2 QA probe `qa-desk2-probe` | 10/13 | (c) as reported by the author | Q08c and its control Q08g are focus drops after a visit dialog closes across a refresh, and fail on unpatched 43ee too. Q08f is synthetic. |
| operator-health-fix-check | 99/100 (R5b) | (b) known from release 1 | R5b pins the raw health text that OH-2 removed. |
| signup-intake-ui | crash: "reading 'goal'" | (c) | Identical on 43ee2f2c. The fixture's exact request sequence does not expect channel availability's request, as the onboarding proposal records. |
| automatic-signin-ui | fails "proof scrubbed before first fetch" / "exactly one POST" | (c) | Identical on 43ee2f2c: the extra `/api/channel-availability` request. |
| acquisition-ui-qa | 9/9, then fatal | (c) | Identical on 43ee2f2c (stale steps, as release 1 recorded). |
| customer-onboarding-full | 31/31, then fatal `#saveMsg` "could not be saved" | (c) | Identical on 43ee2f2c (release 1). |
| desk-daily-work / request-followthrough-ui / onboard-hours-resume, before `r1-ui-stale-checks` | 10/12, 9/12, fail | stale tests (r1-ui-regressions agent) | They also fail on 43ee2f2c. With the patch: 12/12, 12/12, pass. |

**Not run:**
- the mutant suites;
- the sign-in QA r3 probes and the `qa-adapted-r3` 68-case harness, which needs QA's certificate setup;
- `demo-outcome-hosted-check` and the two launch-billing QA scripts. The sign-in proposal notes that they hash `_headers` and will flag the change by design; re-baseline them when this ships.

**Test updates for whoever lands this:**
- Fold the four harness diffs in `harness/` (H-c, H-w, desk-inbox phone, conversation-history at 500) into the repository checks.
- Invert operator-health R5b.
- Fix the channel-availability request in signup-intake-ui and automatic-signin-ui.

## 6. Deploy prerequisites

**Env vars:**
- No new required variables.
- Keep `MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT=500`. Desk P2 now carves practice out of it: 100 practice and 400 customer chat. If the variable were unset, the totals would drop to 25 and 25.
- Optional: `MC_SELF_SERVICE_AI_PRACTICE_DAILY_LIMIT`, which is capped at half the global limit.
- Do **not** set `POST_VISIT_REVIEW_REQUESTS_ENABLED`.
- No Stripe keys.

**Build:**
- The gate has 69 commands. New public files: `owner-session.js` (sign-in) and `desk-customers.js` (desk P2).
- `_headers` adds `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'none'` on `onboard(.html)` and `desk(.html)`.

**Sign-in across tabs (OPERATIONS → Deploys, from sign-in rev 4):** on the first deploy preview, inside that release's bounded hosted pass and before production, check three things:
1. In a normal browser, open an email sign-in link on the preview host, then open a second tab to `desk.html?c=<slug>`. It must open without a new link.
2. Netlify's `access` function log must show `owner_exchange {"fetchSite":"same-origin","transport":"cookie"}`.
   - `"fetchSite":"missing"` means Netlify stripped `Sec-Fetch-Site`. Sign-in then falls back to per-tab, which is safe.
   - In that case, do not announce sign-in across tabs.
3. `onboard`, `onboard.html`, `desk` and `desk.html` must each return exactly one `X-Frame-Options: SAMEORIGIN` and exactly `frame-ancestors 'none'`.

A deploy preview is a draft deploy, and draft deploys share production Blobs. Delete any test client it creates, under CLAUDE.md's existing rule, or run the check on production immediately after deploy.

**Ops P2:**
- Operator sign-in email is deferred through `context.waitUntil`. A provider failure now marks the link `delivery_failed` instead of returning 503 to the founder (owner trade-off).
- Each use of `ADMIN_KEY` on the SMS, voice, twilio-alert and non-sales chat routes is now audited. If the audit cannot be written, the request gets 503.

## 7. Post-deploy steps

1. `getSite.published_deploy` is READY at the pushed commit.
2. Forms shows `contact` and `agent-lead`.
3. Run the sign-in checks from §6 if they were not run on a preview.
4. Watch the `access` log for `"fetchSite":"missing"`.
5. Bounded read-only GETs: `/`, `/api/health` (`ok:true`, a recent scheduler run), `/api/channel-availability`, `/desk.html` and `/onboard.html` (check their headers).
6. Still open from release 1:
   - the Vapi `updateVoicePrompt` re-sync, a provider write;
   - the external uptime monitor on `/api/health`;
   - live SMS, voice and Calendar proof.

## 8. Owner items

- **Legal:**
  - C1, the lawyer-approved Customer Agreement;
  - C2, the Privacy Policy and retention periods;
  - C3, the STOP scope under FCC 26-67, effective 2026-11-25;
  - legal-prereq rev 3 and the **live legacy census before P1**;
  - the VIP recording deletion and Google token revocation, if the census finds any;
  - publishing the legal pages after rev 3.
- **Spanish:** the C4 human spot-check, and the Spanish behaviour notes listed in §3.
- **Website:** confirm the W1 wording. Decide whether to apply website 07 (optional em dash) and 08 (the CLAUDE.md doc patch, held).
- **Desk P2 (D1, settled):** 500 global, which gives 100 practice and 400 customer. `CLAUDE.md:119` still describes the old shared 50/20/50 counts; that is a config doc and the owner's to change.
- **Ops P2:** accept the deferred operator email trade-off.
- **Carried from release 1:**
  - B8, B9 and B12;
  - OD-PV-1;
  - live proof: StirVerstat, real-model wording in English and Spanish, Google 409, a Thumbtack notification, and phone, text and Calendar delivery.

## 9. Reproduce

- `harness/`:
  - `mk.sh <name> <commit>` makes a `git archive` copy without `qa-artifacts/` or `scratchpad/`, with `node_modules` linked to the session's `p10/nm` (which includes `oauth4webapi`).
  - `run1.sh` runs one fresh, sandboxed process.
  - `gate.sh` runs the whole build line.
  - `suites.sh <copy> <out> [tag]` runs the proposal checks and browser suites; `ONLY=` and `WTREF=` select subsets.
  - `final.sh <commit>` runs the final gate and the desk/widget suites.
  - `demo.sh` runs the demo-outcome phases.
  - The harness-only check copies and their `.diff` files are in the same folder.
- **Ports:** 9721 and 9743 (sign-in), 9761 and 9771 (onboarding), 9791 (local server), 9795 and 9796 (static servers).
- **Copies:** at most two existed at a time, each 27–60 MB, and all were deleted after the runs.
- **Playwright:** `/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs` with bundled `chromium_headless_shell-1223`.
