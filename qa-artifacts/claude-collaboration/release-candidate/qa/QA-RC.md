# Independent release QA: grouped release candidate `ac10dc85` (2026-11-12)

## Verdict

**DO NOT SHIP `ac10dc85` as built.** It becomes **SHIP WITH NOTES** once QA-FIX-1 below (2 lines, tested) is applied.

- **QA-FIX-1:** one real integration defect, in a security-sensitive area. It is the cause of the verdict.
  - Operator data erasure (proposal 18 + 18-C1) does not remove the `customer_visit_requests` store that customer-visit-changes r3 added later in the stack.
  - That store holds the customer's phone number, name, address and request.
  - Both workspace erasure and per-contact erasure leave those rows behind, but still report success.
  - `data-erasure-check`'s "every store is classified" test does not see the store, so the gate stays 67/67.
  - The builder's claim of "no real integration defects" therefore does not hold.
- **Everything else the builder claimed was reproduced independently:**
  - the rebuild;
  - the gate;
  - every "expected" (b) and "pre-existing" (c) failure, including proposal 15's 6 rows, now rerun with the token;
  - seven end-to-end journeys at 390 and 1440, with 56/56 checks, 0 page errors and 0 horizontal overflow.

Nothing was pushed, deployed, merged or committed, and no tracked file was changed. Every run was offline:
- `env -i`;
- `MC_MEMORY_STORE=1`;
- `MC_FAKE_MODEL=1`, or an in-process model protocol double;
- `sandbox-exec` deny-remote, verified by `logs/denytest.log`;
- no keys and no `.env`;
- `route.fetch` was never used.

## 1. Rebuild from a54c5874 and byte comparison

I wrote my own step runner (`tools/rebuild.sh`, `tools/steps.tsv`). For each of the 40 commits it:
1. applies the documented patches (plain `git apply --index`, then `-3` only if that fails);
2. diffs the result against that RC commit;
3. continues from the RC commit's own files, so every step is judged on its real parent.

**Patch hashes:** all 52 patch sha256 values match the commit messages (the patches the rebuild applied, compared with every `sha256:` line in the commit messages). The widget-chain prerequisite equals `git diff 0f412212 fbe08789 -- embed.js` (`0c941f3c…`). The final tree equals `ac10dc85`. The docs commit `9fbe6062` touches only `qa-artifacts/`.

| Steps | Result |
|---|---|
| 1–29 (`a5363b0d` … `ed4048b0`) | **Byte-identical**. Every patch applied plainly, with no hand edits. |
| 31 desk-inbox | Byte-identical. `-3` merged cleanly (R4). |
| 30, 32–40 | The only differences are the documented hand-resolution regions. They are listed below, with the full diffs in `logs/rebuild/NN-*.vsrc.diff`. |

**Every difference from a pure patch application:**

| Step | File | Region | RC resolution | Verified |
|---|---|---|---|---|
| 30 P5 (R1–R3) | `desk-activity.js` | P5's focus hunk | Dropped. The file stays exactly a54's, whose 161cf80e refocus is kept. | p5-check 25/25 on the RC (F2 included) |
| | `desk.html` | `#portalRecovery` | P4 welcome-email sentence plus P5 `recoveryTitle`/`role=status` | union |
| | `desk.js` | sign-out storage clear | removes both `ownerKeyStorage` (P4) and `cfgExpiredKey` (P5) | union |
| 32 P0 (R5) | `desk.js` | install listeners | P3's `websiteInstallPrimary` line plus P0's `websiteCalendarConnect` | union |
| 33 channel (R6) | `chat.mjs` | sales `runAgent` | availability-aware call plus a54-10Δ's `safetyLine:false` | union |
| | `client.mjs` | owner GET | `newestFirst()` (inbox) plus `channelAvailability` | union |
| | `netlify.toml` | gate line | `channel-availability-check` before `build-site`, with `data-erasure-check` kept | union |
| 34 visit-changes (R7) | `chat.mjs` | imports | both import lines | union |
| | `managed-sms.mjs` | `runAgent` call and tool loop | r3 visit context, `CHANGE_VISIT` and `change_visit` date, plus `fallbackLanguage`/`logSlug`/`savedBefore` | union |
| 35 visit-edit (R8) | `desk-requests.js` | 2 regions | P5's focus-return plus visit-edit's `requestSchedule` helpers | union. `cancel` listener present once, `requestSchedule` disabled when locked |
| | `desk.html` | new-visit fields | visit-edit markup; P5's `visit-required-note` dropped | see note N1 |
| | `desk.js` | `saveVisitChange` | P5 all-missing `create_visit` block plus visit-edit `edit_visit` block | union |
| | `owner-visits.mjs` | customer-actor 403 guard | taken from `visit-edit-after-visit-changes.patch` | byte-identical to that variant. It is the **only** line unique to that variant's server files. |
| 36 ops (R9) | `manage.mjs` | operator GET | health/readable plus 18's `providerCleanupPending` | union |
| 37 lifecycle (R10) | `client.mjs`, `operator.mjs` (2 regions), `desk.js`, `netlify.toml` | | inbox/channel/ops fields plus lifecycle fields; desk-inbox `alertWaiting` kept (19 only had a54's line as context) | union. `triaged`/`openIssues`/`waitingIssues` and `lifecycle`/`cleanupPending` are all present. |
| 38 urgency (R11) | `desk.mjs` | imports | `appointmentWindowRange` plus `optOutStatus`; no `optedOut` use remains | union |
| | `managed-delivery.mjs` | customer confirmation | language templates inside visit-edit's no-duplicate guard | union |
| | `owner-visits.mjs` | create source | `sourceRequestId` plus `language` | union |
| 39 PV (R12) | `desk.css` | | both blocks | union |
| | `desk.js` | `openVisit` | `renderPostVisit()` before visit-edit's `showModal` | union |
| | `client.mjs` | imports; `post_visit` branch | branch before the visit action list (`edit_visit` kept) | union |
| | `managed-consent.mjs` | imports | both kept | union |
| | `managed-sms.mjs` | imports | both kept | union |
| | `managed-delivery.mjs` | 3 regions | options `subject`, `alert` and `postVisit`; `subject` excluded from identity (urgency) while `postVisit` stays in it (PV); email subject is `job.subject`, then `owner_visit_check`, then the defaults | union |
| 40 OH (R13) | `managed-sms.mjs` | | `-3` clean | identical |
| | `manage.mjs` | operator `error` field | added beside `providerCleanupPending` | union |

**Token-level review:** every RC token in each region comes from one side or the other. I found no new code. "Option B" text is absent. `POST_VISIT_REVIEW_REQUESTS_ENABLED` is unset, so review requests stay held. `visitChanges` defaults to `confirm_cancels`.

**N1 (low, a11y; R8):** P5 placed its "* Required" legend outside `#newVisitFields`. Visit-edit's legend sits inside it. In reschedule mode, the Visit date and Arrival window labels therefore carry `*` with no legend (screenshot `logs/journeys-rc/J4-visits-1440-01-visit.png`). This partially regresses P5's F-fix intent. It does not block release.

## 2. Hand merges R1–R13 (adversarial)

Each region was read against both source patches (section 1). Files touched by three or more proposals were checked for semantic interactions, not only text:

- **`managed-delivery.mjs`** (urgency × PV × visit-edit × 16 × 01):
  - The identity hash excludes `subject` and includes `postVisit`.
  - Closed workspaces stop before sending, and paused ones wait (`workspace_not_live`).
  - The journeys show owner emails queued with the right subjects (`EMERGENCY: …`, `Visit request: …`) and an `owner_visit_check` job.
- **`chat.mjs`** (02/04/09/10/15/channel/visit-changes): the 09 token binding runs **before** the 15 budget reservation. A tokenless repeat turn is refused (409) without spending allowance.
- **`client.mjs` / `desk.js` / `desk-requests.js` / `desk.html`:** unions confirmed in the browser (J3, J4, J7 below).
- **`owner-visits.mjs`:**
  - The customer actor (`session.customer`, set in `customer-visits.mjs:170`) cannot run `edit_visit`.
  - Customer moves and cancels go through the owner logic.
- **`manage.mjs` / `operator.mjs`:** health, issue triage, lifecycle and erasure fields all present. Owner and anonymous sessions get 401 (J6).
- **Semantic (not textual) cross-proposal gap found:** 18's erasure registry × visit-changes' new store. This is **QA-FIX-1**, below.

## 3. Deploy gate (netlify.toml, 67 commands, fresh process each)

| Tree | Result |
|---|---|
| RC `ac10dc85` | **67/67 exit 0** (`logs/gate/SUMMARY.tsv`) |
| RC + QA-FIX-1 | **67/67 exit 0** (`logs/gate-fixed/SUMMARY.tsv`) |

## 4. Each included proposal's own check, rerun on the RC

`logs/authors/SUMMARY.tsv` has 50 rows: 35 pass as is and 15 fail. Every one of the 15 is proven as expected or pre-existing in section 5.

**Pass as is (selection):**
- 01 (159 required, 0 failed); 02; a54-03Δ; 05; 06; 09 chat-token 73/73.
- 11 network; 12 receipt/matcher/after04; 13 concurrent, initial-capacity and latency; 14 v6.
- 15 v15-extra, p15s-server and qa-stack-adversarial 9/9; all four 16r3 copies; 17 repro and calendar-execution.
- 18 data-erasure 14/14; 19 account-lifecycle 24/24; pcu r2; channel-availability.
- visit-change r3 + QA tests 70/70; post-visit 27; optout-health 113/113.

**Browser suites** (`logs/browser*/SUMMARY.tsv`):
- connector-pages 55/55; desk-details 29/29; onboard-validation 16/16; onboard-recovery 59/59.
- customer-onboarding entry 21/21 and plan 26/26; conversation-history 12/12; widget-setup-refresh 8/8.
- 09 widget-token 51/51 at both 390 and 1440; p15s-widget 3/3 at both widths.
- P2 12/12, P3 27/27 and 37/37, P4 13/13 and 14/14, P5 25/25.
- pcu-browser 18/18, desk-inbox 51/51, visit-edit 23/23, post-visit-ui (0 errors at 390/1440).
- channel-availability `--browser` 30/30, account-lifecycle 24/24.

## 5. "Expected" and "pre-existing" failures: each one proven

| Check | RC | Proof |
|---|---|---|
| **15 v15-fixes** | 54/60 | **Rerun with the token** (harness-only change: `say()` carries `X-MC-Conversation-Token` back as `conversationToken`; diff in `tools/v15tok/`). Result: **60/60**, all 10 A2r5 rows pass, 276 turns sent with a token (`logs/v15/`). |
| urgency-spanish | 17/21 (Q1, Q2b, Q7, Q11) | With the token tail, **21/21** (`logs/expected/urgency-token.json`). |
| a54-10 / 10m agent-truncation | crash: "script not consumed" (turn refused by the 15 shared bucket) | One IP per turn: **pass** (`logs/expected/a54-10m-harness.log`). |
| 04 tool-result-truth | 13 rows | 04m 0 failed (51 cases). |
| 07 missed-call | fail | 07m pass. |
| 11 fault | fail | 11m pass. |
| codex sms-safety / r2 | 16/18 + 4/6; 18/20 + 4/6 | `codex-r2-disposition` 20/20 + 6/6. |
| p12 legacy / failclosed / p12m | fail | All four 16r3 copies pass. |
| p12 visit-refusal | fail | with-13 copy 9/9. |
| p12 owner-alert (default) | 6 rows | `--fix` mode 31/31, 0 failed. |
| post-visit-inbound | builder's harness path was rejected by the script | Valid `scratchpad/` path: 12/12. |
| operator-health-fix | 99/100 (R5b) | R5b pins the raw `/api/health` text that OH-2 removes. Its own documentation says to invert it. |
| desk-daily-work | 10/12 | Done-step probe 12/12; a54 12/12. |
| customer-onboarding full | 31/31, then fatal on the `#saveMsg 'could not be saved'` wait | **Identical on a54**: 31/31 and the same fatal (`logs/base-a54/customer-onboarding-full-2.log`). The first a54 run hit a reload timeout under CPU load, so it was rerun alone. |
| widget-stream | `waitForFunction` timeout at line 108 | Identical on a54. |
| website-concurrency | 10/13 | The same 3 failure names on a54. |
| site-ui | 304 checks, 10 issues | Issue lists byte-identical to a54. |

## 6. End-to-end journeys (390 and 1440)

`tools/journeys.mjs` serves every request through `context.route`: static files from the copy, and every `/api/*` path through the real handler, selected by `config.path`. The model is an in-process Anthropic protocol double that emits real tool calls. Server-side fetches were refused, with 0 attempts.

**Overall: 56/56 checks, 0 page errors, 0 console errors, 0 horizontal overflow, 0 unhandled API paths.** Evidence: `logs/journeys-rc/journeys.json` and 58 screenshots.

**J1, homepage → inquiry → onboarding → desk:**
- `/api/intake` returns 202 and hands off to onboarding. The email gate is prefilled.
- The fake-mailbox link verifies the email.
- The 4-step questionnaire creates one workspace.
- The desk opens with no owner key in the URL.
- Connections show truthful states: Website "Available now"; Phone and Text "Setup with our team"; Calendar not connected.

**J2, website chat:**
- The widget loads on the shop page, and turn 1 issues a token.
- Turn 2 carries the token, and `book_visit` saves a visit.
- The visitor reply makes no delivery claim. The tool result says delivery "is not confirmed".

**J3, inbox and emergency:**
- A gas-smell message creates `notify_owner` with urgency `emergency`, and an owner email `EMERGENCY: Strong gas smell…` is queued.
- The Inbox pins it first with an "Emergency" badge, an Acknowledge button and Open/Done filters (Open 2, Done 0).
- Home shows "2 customer requests need your attention".

**J4, visits:**
- Visit "Edit details" saves a corrected address, and the date and window are unchanged.
- An empty name is refused inline (`aria-invalid` plus a message).
- "Schedule a visit" from a request prefills name, phone, address and the asked date. Saving creates a visit with `sourceRequestId` and the message "Linked to the request, and its follow-up is marked complete."
- Observation: after a successful edit, the Edit details button stays hidden until the dialog is reopened.

**J5, Connections:** states match `/api/channel-availability`. Nothing claims a live phone or a connected Calendar.

**J6, admin:**
- The health banner reads "scheduler: no run recorded", and the customer detail renders.
- An owner bearer on `/api/manage` gets 401; anonymous gets 401.
- Anonymous `/api/health` returns 503 with a sanitized body and no block text (OH-2).
- **N2 (low, not caused by the merge):** with email disabled (no Resend key, so `sendEmail` returns `logged:true`), operator-health counts the alert as sent. The banner then says "Operators were emailed …" although nothing was sent. In production Resend is configured, so this affects local and preview runs only.

**J7, account:** Pause → paused, Resume → live, Stop service (with confirmation) → cancelled, Reopen → testing, each with a truthful message.

## 7. Security-sensitive merges on the stacked tree

| Area | Result |
|---|---|
| Chat token (09) | 73/73; widget 51/51 at both widths. Journeys carry the token. The binding runs before budget reservation. qa-stack-adversarial 9/9. |
| Abuse limits (15) | v15-fixes 60/60 (with token); v15-extra and p15s pass. Twilio/Vapi webhooks fail closed without secrets (W2). |
| **Erasure (18 + C1)** | 18-C1 reopen race passes (account-lifecycle 24/24, `erasureStacked:true`). **Defect QA-FIX-1**, below. |
| Opt-out cross-shop (B4a) | optout-health 113/113, including "a legacy STOP on another shop line blocks this managed shop" and "a platform STOP blocks the managed outbox". |
| Operator auth | Owner and anonymous get 401 on `/api/manage` (J6, OH H4); operator-management-qa 68/68 in the gate. |

### QA-FIX-1: erasure misses `customer_visit_requests` (Medium-High: privacy and erasure correctness)

**Where the data comes from:** `lib/customer-visits.mjs:100,122,148` writes `customer_visit_requests` at `${slug}/${tenant}/<hash>`. Each row holds:
- `phone`;
- `lead.customer_name`, `lead.address` and `lead.issue`;
- `reason`.

**What is missing:**
- The store is absent from `ERASURE_REGISTRY`.
- `data-erasure-check`'s completeness scan only resolves constants named `*STORE|QUEUE|…`, not `REQUESTS`.
- My broader scan (`tools/stores.mjs`) finds it as the only unregistered store.

**Reproduction** (`tools/erasure-cvr-probe.mjs`, the exact row shape the code writes):
- On the RC, both workspace erasure (`state ok`) and contact erasure leave the row with the customer's PII.
- The script exits with code 1 (`logs/erasure-cvr-probe-rc.log`).

**Exposure:**
- New in this stack: a54 has no such store, and visit-changes r3 was never stacked with 18.
- Rows are written only by verified SMS and phone customers. Managed texting and phone are still gated, so production exposure today is near zero.
- It becomes real as soon as managed channels go live, and the erasure audit reports completion regardless.

**Fix** (`fix/QA-FIX-erasure-customer-visit-requests.patch`, sha256 `71c7525a…`; `git apply --check` is clean on the RC worktree):

```diff
--- a/netlify/functions/lib/data-erasure.mjs
+  customer_visit_requests: { scope: 'prefix' }, // customer-visits.mjs: `${slug}/${tenant}/…`, holds the customer's phone and visit details
--- a/scripts/data-erasure-check.mjs
-  …(?:STORE|QUEUE|INDEX|CALLS|CALLBACKS|OPERATIONS|LOCKS|KIND|REVIEWS|EVENTS|CURSOR|CLOCK|ERASURES)\s*=…
+  …(?:STORE|QUEUE|INDEX|CALLS|CALLBACKS|OPERATIONS|LOCKS|KIND|REVIEWS|EVENTS|CURSOR|CLOCK|ERASURES|REQUESTS)\s*=…
```

**Tests:**
- With only the check change, `data-erasure-check` **fails** and names `customer_visit_requests`. The check now catches the gap.
- With both changes:
  - `data-erasure-check` 14/14;
  - the probe exits 0: rows removed by workspace and contact erasure, and another contact's row kept;
  - account-lifecycle 24/24;
  - the full gate 67/67.
- Prefix scope with text matching makes per-contact erasure delete only that phone's rows.

## Notes for Codex (non-blocking)

- **N1:** "* Required" legend missing in reschedule mode (R8).
- **N2:** the operator "emailed" banner is shown when email is disabled.
- **J4 observation:** Edit details hidden after a save until the visit is reopened.
- The builder's test updates still apply:
  - desk-daily-work Done step;
  - codex sms-safety rows;
  - v15 and urgency harnesses carrying the 09 token;
  - R5b inversion;
  - the 16r3 p12 copies;
  - `post-visit-inbound` needs a `scratchpad/` output path.
- Release-note deploy prerequisites (Vapi re-sync, uptime monitor, `context.ip` read, env vars) were not verifiable offline. Hosted checks remain.

## Files

- **Commands:** `COMMANDS.txt`.
- **Scripts:** `tools/`.
- **Logs:** `logs/`, containing:
  - `rebuild/` (per-step diffs);
  - `gate/` and `gate-fixed/`;
  - `authors/`, `expected/`, `v15/`;
  - `browser/` and `browser2/`;
  - `base-a54/`;
  - `journeys-rc/`;
  - `fix/`.
- **Fix:** `fix/QA-FIX-erasure-customer-visit-requests.patch`.
