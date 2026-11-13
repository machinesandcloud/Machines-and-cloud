# Claude release-3 candidate (2026-11-12)

**Nothing here is pushed, deployed or merged. No provider was called.** Every run was offline:
- `env -i` with `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1` and `MC_LOCAL_NO_KEYS=1`, dummy secrets only, no `.env`;
- the strict `sandbox-exec` deny-remote profile from release 2 (`harness/rc3-scripts/deny-net.sb`, loopback IP only);
- throwaway `git archive` copies under the session scratchpad (`rc3/`), `node_modules` symlinked to `scratchpad/p10/nm` (includes `oauth4webapi`). Each copy was deleted after its run.

`route.fetch` was never used.

- **Worktree / branch:** `/tmp/mc-claude-release3-candidate-20261112`, `work/claude-release3-candidate-20261112`.
- **Base:** production release 2, `0f30643e` (= release-2 candidate `51dfcef6` plus one QA-docs commit). Built first on `51dfcef6`, then rebased onto `0f30643e` at the lead's request; the rebase was clean because only `qa-artifacts/` differ. Release 3 is a fast-forward from production.
- **Product head:** `c75cae90`. The gate, proposal checks, QA probes and the four UI checks ran on this tree, after the rebase. The two later docs commits change only `CLAUDE.md`, `product/LAUNCH-READINESS.md` and `product/PRODUCT-STATUS.md`; `build-site` and `sitecheck` were rerun on the final head and pass.

## 1. Result

| Run | Result |
|---|---|
| **Deploy gate**, each `node scripts/…` step of the `netlify.toml` build line in a fresh process | **70/70 exit 0** (`receipts/gate/SUMMARY.tsv`). That is release 2's 69 plus `uncovered-cards-check`. |
| Same build line verbatim as one `&&` chain | `GATE_EXIT=0` (`receipts/gate/gate-chain.log`) |
| `python3 -I scripts/sitecheck.py .` | 182 pages, 0 broken references, 0 sitemap, redirect or canonical issues |
| Proposals' own checks | All pass (§5) |
| Both QA probes (legal `qa-r5.mjs`; homeowner `zz-hoqa-sched.mjs`) | Run clean (§5) |
| The four stale UI checks, after the legal and text changes | signup-intake-ui **52/52**, automatic-signin-ui **56/56**, acquisition-ui-qa **52/52**, customer-onboarding full **53/53** |
| Real defects found by integration | **1 test defect, fixed** (RC3-T1, §4). Plus one page claim corrected against code (§4, H7). |

## 2. Included (apply order = commit order)

| # | Commit | What | Source | Patch sha256 (prefix) |
|---|---|---|---|---|
| 1 | `7779e439` | Four stale browser UI checks (test-only): signup-intake-ui, automatic-signin-ui, acquisition-ui-qa, customer-onboarding-full | `/tmp/mc-claude-preexisting-ui-20261112` `patches/preexisting-ui-stale-checks-release2.patch` | applied clean on `51dfcef6` |
| 2 | `181d97dc` | **Legal prerequisites rev 5**: P1 retire the shared sender, P3 no VIP recording, P6 automated disclosure, P7a legacy Calendar OAuth removed, P9 operator opt-out action and detector. **P7b held out.** | `/tmp/mc-claude-legal-prereq-fix-20261112` `patches/r5-43ee2f2c/1..5` (accepted in `qa-r5/QA-REVIEW-R5.md`) | 1 `85870e6e`, 2 `3274b967`, 3 `c8537ff8`, 4 `afcd0841`, 5 `ae108dd5` (combined `4cfef20d`) |
| 3 | `e124a6fd` | **QA r5 note fixed**: AYUDA names the contact filed with the campaign, not the shop's current contact. New test L26. | this candidate | — |
| 4 | `4a0c7627` | **Homeowner-text fixes rev 4** (PRA-HOMEOWNER-05/-06/-07) plus the Spanish review r4 fixes, with the reviewer's three merge risks handled | `/tmp/mc-claude-uncovered-cards-20261112` `patches/r4/01..03` (accepted in `qa/QA-REVIEW-R4.md`), `qa/spanish-fixes.patch` | 01 `bfd64862`, 02 `622a6132`, 03 `501bc4fa`; Spanish `b9c959b3` |
| 5 | `c75cae90` | **Legal pages**: Customer Agreement (`terms-of-service.html`), Privacy Policy, SMS terms, public content only, aligned with the code | `/tmp/mc-claude-legal-drafts-20261112` `e9a4da09` (`legal-pages.patch` `ff08498e`), via release 2's merged `35e48085` | — |
| 6 | `89d21294` | Docs: current production reconciled (release 2 live) | `/tmp/mc-claude-docs-reconcile-20261112` `docs-reconcile.patch` | `0643f4f6`, applied unchanged |
| 7 | `5b1e1889` | Docs: "Current production" notes what release 3 adds; gate copy in CLAUDE.md now matches `netlify.toml` (70) | this candidate | — |
| 8 | (this commit) | These notes, receipts and harness | — | — |

Not included: P7b (`patches/held/P7b-calendar-plaintext-sync.HELD.patch`), the legal drafts' "AI-drafted" notice (kept off every public page), the Spanish VIP spoken lines (still English, noted in rev 5).

## 3. What changes for customers

- **Texts (legacy shops):** no shared M&C sender. A shop without its own approved number does not text through the M&C number; its owner gets email instead. Operator alerts go by email only. HELP/INFO reply with the campaign's registered HelpMessage, AYUDA with its Spanish version naming the same filed contact. A send error is retried with the saved reply and never re-runs the model; after the last try the owner gets one alert.
- **Opt-out:** keywords as in release 1. A plain-language "possible opt-out" is flagged in the owner's workspace with at most one email per customer per 30 days; it never stops texts by itself and never texts the owner. An operator can apply an opt-out received by email, phone or in other words.
- **Automated disclosure:** every voice greeting (legacy, returning-caller override, managed) and the first text reply in a conversation say the assistant is automated. Templated fast replies (C, R, HELP) do not count as the disclosed reply.
- **Calls:** a VIP call that the owner misses is never recorded; it becomes a normal hand-off lead and the caller gets a text.
- **Homeowner texts (managed shops):** no internal visit ID; absolute dates ("Sat, Oct 24"); a moved visit says from and to; a cancellation says how to rebook; moved 1-hour reminders avoid quiet hours and are skipped when less than 2 hours remain. During the daily AI limit the customer gets one honest reply, and the owner gets one request per customer per Houston day.
- **Legal pages:** published at the existing URLs (footer links, canonicals and sitemap unchanged).

## 4. Conflict resolutions and integration fixes (both sides kept)

| Ref | Where | Resolution |
|---|---|---|
| H1 | legal r5 × release 2, `lib/desk.mjs` | `STRINGS.es.managed_help` from r5 (Spanish review r4: "al" before a number, "escriba a" before an email, no English placeholder). `STRINGS.es.consent_yes` from release 2's Spanish notes ("siguiente", "para dejar de recibir mensajes"). |
| H2 | legal r5 × ops P2, `lib/send.mjs` | Release 2's `redactOwnerCredentials` kept; r5's `textOwner` added; `notifySteve` is email-only (P1) **and** still redacts owner credentials (ops P2). |
| H3 | legal r5 × Spanish review, `sms.mjs` fast paths | Release 2's Spanish C/R strings with r5's `system: "fast-confirm"/"fast-reschedule"` tags. |
| H4 | legal r5 × ops P2, `manage.mjs` | r5's `optOutReview` in the operator payload plus release 2's `legacyKeyAudit`. |
| H5 | legal P1 × ops P2 check, `scripts/ops-p2-fix-check.mjs` S10a | P1 removes the shared-number founder SMS (the release-2 notes predicted this). S10a now asserts the founder alert email carries no owner key and points to the admin portal, **and that no founder text is sent**. 23/23. |
| H6 | homeowner r4 × legal P6 × Spanish review, `lib/managed-sms.mjs` | The r4 patches carry no blob ids, so 01 and 03 were 3-way merged with `git merge-file` against `43ee2f2c`. The AI-limit reply keeps the P6 intro on a first reply **in the AI-limit language**: `disclose(text, language)`, falling back to the text guess only when no language is passed (Spanish review merge risk 2). |
| H6b | homeowner r4 × legal, `lib/desk.mjs` | r4's `managed_ai_limit` block placed next to the legal/release-2 `managed_help` and `consent_yes`. The Spanish fixes were applied by exact line replacement, re-anchored past the shared `managed_help` line whose 43ee context no longer exists (merge risk 1). |
| H6c | `netlify.toml` | Release 2's build line plus `uncovered-cards-check` before `build-site` (70 steps). |
| H6d | `scripts/uncovered-cards-check.mjs` | Spanish expectations from the fix patch. AI-limit bodies are compared after the one P6 intro line. New row "H07 AI-limit + P6" checks the intro language both ways (a saved Spanish customer texting "Ok thanks" gets "Asistente automatizado de …" above the Spanish body; a saved English customer texting Spanish gets the English intro) and that the intro is not repeated. Total 13 → 14. |
| H6e | `harness/uncovered-cards/mutants-rc3.py` | M05, M11, M13 and M16 re-anchored (merge risk 3; M05/M11 also moved because of H6). New R3-1..R3-4: intro dropped, intro language guessed from the text, intro on every reply, Spanish cancel order reverted. **42/42 killed** (`receipts/dev/mutants-uc.json`). |
| **RC3-T1** | `uncovered-cards-check` row order | **Real test defect.** Placing the new P6 row among the H07 rows made both H06 rows fail ("1h reminder not sent: waiting_consent consent_required"). Cause: the fixture shares one store, and the H06 rows run `runManagedDelivery({limit: 50})`; the extra row's deliveries pushed the booking's consent ask out of that wave, so the ask went out at the same fake second as the customer's YES and the YES was (correctly) not accepted as consent. Reproduced on release 2 + r4 without legal (`receipts/dev/uc-r2u.log`). Fix: the new row runs last. No product change. |
| AYUDA (QA r5 note) | `lib/twilio.mjs` | `createCampaign` returns `campaignHelpContact`, stored on `c.phone` by the scheduler's existing `Object.assign`. `legacyHelpMessageEs` uses `filedHelpContact()`: the stored filed contact, else the contact parsed from a stored filed HelpMessage, else (nothing filed) the current contact, as English HELP does. Test L26: after the business number changes, HELP is the filed text and AYUDA names the filed number, neither names the new one; a pre-field filing is read from the stored HelpMessage. L26 **fails** with the old builder (`receipts/dev/legal-mut.log`). |
| H7 | legal pages × code | The drafts said "A STOP to any business on our platform stops texts from every business" (owner decision B4, precondition P2). **That is not what the code does:** `managed_sms_consent` is keyed by tenant, and `crossStoreOptOut` adds only the legacy `optouts` store and the platform ledger. A legacy-line or platform STOP does block every shop; a managed shop's STOP blocks only that shop. All three pages now say a STOP stops **that business's** texts. Agreement §7 now says possible opt-outs in other words are flagged for the owner's review and are not stopped automatically (r5 decision b). The SMS terms say HELP/INFO/AYUDA give the business's help contact (r5 decision a) and that the first text reply says it is automated; the Privacy AI section says how each channel discloses (P6). Already true and unchanged: no call audio / no VIP recording (P3), no shared bridge and no shop messages on the Customer Care number (P1), the platform HELP text and keyword list. The release-1 docs bullet that said "a STOP to any shop blocks all shops" is corrected in commit 7. |

## 5. Test results

**Gate:** 70/70 per step and `GATE_EXIT=0` as one chain at `c75cae90` (after the rebase). Total step time about 72 s.

**Proposal checks** (`receipts/props/`):

| Check | Result |
|---|---|
| `legal-prereq-check` (rev 5 + L26, in `harness/legal/`) | **53/53 + 1 skipped (P7b)**, 0 blocked |
| same with `--with-p7b` | 53/54: only P7b C2 fails, as expected while P7b is held |
| opt-out decisions, 296 messages × 3 lines (`r2/optout-parity.mjs`, inside O13) | identical to 43ee2f2c's golden file, and identical between release 2 and release 3 |
| `uncovered-cards-check` | **14/14** |
| homeowner mutants (`mutants-rc3.py`) | 42/42 killed |
| `managed-sms-qa-check`, `managed-delivery-qa-check`, `managed-sms-budget-check`, `sms-policy-check`, `data-erasure-check` (14) | exit 0 |
| `ops-p2-fix-check` / `ops-p2-qa-probe` | 23/23 / 14/14 |
| `legacy-census.mjs --fixture` (offline only) | 2 legacy shops, 1 on the shared sender, 1 VIP recording, 1 plaintext Calendar token (fixture data) |

**QA probes:**
- Legal `qa-r5.mjs` (54-message fresh corpus, retry cases, parity) on release 3 vs QA's own r5 receipt: 634 values, **7 differ**. 6 are event-order ties in two lists (same events, same timestamp). The 7th is the EMPEZAR reply, which release 2's Spanish notes lengthened ("… cuando quiera para dejar de recibirlos."). No decision differs. The probe also ran on release 2 (`qa-r5-base.json`).
- Homeowner `zz-hoqa-sched.mjs` (24,090 date × window slots): `inQuiet 0`, `afterStart 0`, max lead 16.5 h. On release 2 it cannot run (`managedReminderSchedule` does not exist there). `zz-hoqa-help.mjs` targets the rev 2 API (`shopContact`) that r4 removed, so it no longer applies; H07's HELP row covers it.

**Four UI checks** (`receipts/ui/`), Chrome via Playwright, every request fulfilled locally: signup-intake-ui 52/52, automatic-signin-ui 56/56, acquisition-ui-qa 52/52, customer-onboarding `--phase full` 53/53. 0 external requests, 0 page errors.

## 6. Before deploy: owner and live steps

None of these was run. Each is a production read and needs the owner's approval.

1. **LIVE legacy census before P1 retires the shared sender.** Run `harness/legal/legacy-census.mjs --repo <release-3 tree>` with the site's Netlify Blobs context (`NETLIFY_SITE_ID` + a Blobs token, or inside `netlify functions:invoke`) and **without** `--fixture`. It only reads. Go only if `dependOnSharedSender` is 0, or every listed shop has been moved to its own approved number or told that texts stop. The same run reports:
   - `vipRecordingsToDelete`: existing VIP voicemail recordings (P3 stops new ones; old ones must be deleted at Twilio by the owner);
   - `ownerAlertsAfterP1`: shops whose owner alerts become operator-only.
   It also matters for the pages: a legacy shop's Vapi assistant is created without `artifactPlan.recordingEnabled:false` (`lib/vapi.mjs`), and Vapi records by default. If the census finds any legacy shop with voice, its assistant must be patched (a provider write) before the Privacy Policy's "We do not record call audio" is true for it.
2. **Read-only check that the HelpMessage of existing filed campaigns matches.** Campaigns filed before this release have no stored `campaignHelpMessage`, so HELP uses the builder text. For each legacy shop with a `campaignSid`, read the campaign (`GET …/Services/{MG}/Compliance/Usa2p/{QE}`) and compare `help_message` to `legacyHelpMessage(c)`. If it differs, store the filed text as `phone.campaignHelpMessage` (and its contact as `phone.campaignHelpContact`) or resubmit; otherwise HELP replies will not match the registration. The managed line's `managed_help` versus `messaging-program.mjs` `helpMessage` mismatch is production behaviour outside this set (flagged in rev 5).
3. **P7b token census.** The same census reports `plaintextCalendarTokens`. P7b (deleting the plaintext sync) stays held until that count is 0 or the tokens are migrated. Until then the Privacy Policy line "encryption of sensitive items such as Calendar refresh tokens" is true only for workspace connections; if the count is not 0, migrate or delete those tokens before publishing the pages.

Also still open:
- Attorney review of the pages (C1-C3); the pages carry no draft notice at the owner's request.
- B4 cross-shop STOP for managed shops (P2) is not built; the pages no longer promise it. Decide under FCC 26-67 (effective 2026-11-25) whether to build it.
- Human Spanish spot-check (C4), including the AI-limit and cancellation lines.
- QA r5 carry-overs: a duplicate resend if Twilio accepted the text but the response threw (no idempotency key); an owner alert on 4xx rejects; fallback-cap visibility; a tolerant `/recorded` handler; audit-first in `applyOperatorOptOut`.
- Homeowner r4 carry-overs: no per-tenant cap on AI-limit requests; N4 (a details-only edit within 2 hours drops a moved reminder, as on base); paid 1-hour reminders need a budget check.
- `uncovered-cards-check` is order-sensitive because its fixture shares one store with a bounded delivery wave (RC3-T1). New rows go last.

## 7. Files

- `harness/legal/`: `legal-prereq-check.mjs` (rev 5 + L26), `legacy-census.mjs`, `qa-r5.mjs`, and the corpora they read (`r2/`, `qa-r2/`, `qa-r3/`, `fresh-corpus-r4.json`). Run: `node harness/legal/legal-prereq-check.mjs --repo <tree>`.
- `harness/uncovered-cards/`: `mutants-rc3.py`, `run-check.sh`, `deny-remote.sb`. Run: `python3 -I mutants-rc3.py <tree> <out.json>`.
- `harness/rc3-scripts/`: `mk.sh` (throwaway copy), `gate.sh`, `run1.sh`, `deny-net.sb`.
- `receipts/gate/`, `receipts/props/`, `receipts/ui/`, `receipts/dev/`.
