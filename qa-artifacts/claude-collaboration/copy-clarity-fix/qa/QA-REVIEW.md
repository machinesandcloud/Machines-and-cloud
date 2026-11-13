# Independent QA: copy-clarity fix on release-4 d35c2de6

**Verdict: ACCEPT, with one required merge step and small follow-ups.**

Reviewed: `copy-clarity-fix-on-d35c2de6.patch` (sha256 `6b583ca7…0fef0e3`, 19 files, 178+/48-), NOTES.md, receipts and screenshots. I checked them against the code on throwaway `git archive d35c2de6` copies. All runs were offline (`env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1`, release-4 `deny-net.sb`), with Playwright `channel:"chrome"`. There were no provider calls, commits or pushes, and the copies were deleted afterwards.

## 1. Truthfulness of the pause wording
- **Pause sets every channel off.** Owner pause runs `lifecycleTransition('pause')` (`lib/workspace-lifecycle.mjs:90`), which sets `channels: allOff()`. The original channels are saved in `pausedChannels`.
- **Website chat is refused.** `chat.mjs:139/144` refuses with `paused`. TRUE.
- **Texts get no front-desk reply.** Managed SMS (`lib/managed-sms.mjs:95,146`) returns empty TwiML, or marks the message suppressed, unless the status is testing or live. Legacy `sms.mjs:142` sends one pointer reply. TRUE.
- **Calls are not answered by the AI.** In `voice-activation.mjs` `serving()`, `valid` is false while paused, so an inbound call becomes `kind="fallback"`. `fallbackAllowed` still includes `paused` (line 423), so the call **rings the owner's saved contact cell** when authority allows and the caller is not the forwarded line. Otherwise the caller hears "could not connect". Legacy `voice.mjs:105` uses `fallbackTwiml`, which also dials the cell. "Your front desk stops answering … calls" is TRUE. The short form "calls … are not answered" is literally narrower than reality, because calls may still ring the owner. This is conservative, not a false promise (P3 below).
- **Google Calendar updates pause.** `calendar-delivery.mjs:126/244` requires testing or live. TRUE.
- **Downloads keep working.** The owner GET `export=` path (`client.mjs:201`, `exportCSV`) has no status gate. TRUE.
- **Inbox, visits and settings keep working.** `client.mjs` blocks only `cancelled`/`archived` (line 78), not `paused`. TRUE.
- **Call forwarding on your phone does not change.** Pause makes no carrier change. TRUE.
- **Resume wording matches the code.** Resume restores web only if `pausedFrom==='live'`, web was active and setup is ready (`restoringWeb`). Voice and Calendar re-dispatch through their own workers (`afterLifecycleChange`). This matches "turns website chat back on if it was on before… usual checks".
- **The guard regex is respected without being gamed.** The account-page guard `/calls (?:are|have)|delivered|forwarding (?:off|disabled)/` does not match the new message. The message gives an instruction ("turn off forwarding with your carrier"); it does not claim that forwarding is off.

## 2. Nothing semantic broken
- **Tokens:** I compared every changed non-test line token by token: `id=`, `for=`, `class=`, `aria-*`, `data-*`, `role`, `name`, `value`, `type`, `$('…')`, `getElementById`, `dataset.*`, `action==='…'` and `request('…')`. 461 tokens; removed and added are identical.
- **Logic string comparisons:** I listed every logic string comparison (`textContent ===/!==`, `.includes(message.textContent)`, `'No customer requests yet'`). None of them reference a changed string.
- **Button labels:** "Select Retry same action" and "Select Retry saved change" match the real button labels (`desk.html`, `#retryVisit`).
- **Removed strings still asserted in source or tests (live checks only, archived copies excluded):**
  - `scripts/request-followthrough-ui-check.mjs:151` still asserts `/Retry saved change safely/i` on `#visitMessage`. **Missed update.** It is latent: that `--phase visit-auth` block already fails 9/10 on unpatched d35c2de6 (`'Saved visits for this phone number'` locator), with identical results patched (`receipts/rfu-va-*.log`). The default phase passes 12/12. The check is not in the gate.
  - `qa-artifacts/claude-collaboration/inbox-dialogs/qa/qa-focus-probe.mjs:194` still waits for `/No receipt is saved/`. This is a probe, not a gate.
  - `release-candidate/qa/tools/journeys.mjs` uses "Pause workspace" only as step names. Its regexes `/paused/i` and `/resum|restored|live/i` still match the new messages.
  - `desk-lead-sources.js:210` still shows the stage label `'Workspace paused'`, while line 202 now says `'Front desk paused · Notification settings'`. This is a visible naming inconsistency (P3), not a breakage.

## 3. Dates
`friendlyDate(iso,'en',{relative:false})` formats `Date.UTC(y,m,d,12)` with `timeZone:'America/Chicago'`. Noon UTC is always 06:00 or 07:00 the same day in Chicago, so a date-only value cannot shift a day.
- **Every-day check:** I checked every day from 2025-01-01 to 2028-12-31 (1,461 days) against the UTC calendar date under 8 process time zones: Chicago, UTC, Kiritimati (+14), Pago_Pago (-11), Tokyo, Los_Angeles, Lord_Howe (half-hour DST) and St_Johns. **0 mismatches.** That covers the 2026-03-08 and 2026-11-01 DST days, year end and 2028-02-29 (`receipts/dst-check.mjs`).
- **Values that are not YYYY-MM-DD** pass through unchanged ("next week", "", null and full timestamps).
- **Mutation test:** the new gate check fails with the base `managed-delivery.mjs` and passes patched (`receipts/md-mutant.log`, `md-patched.log`).
- **P3 notes:**
  - `{relative:false}` is ignored for `lang:'es'`: on 2026-11-13, `friendlyDate('2026-11-14','es',{relative:false})` returned "mañana". The test asserts this behaviour. There is no live impact, because owner emails always pass `"en"`. Either document the limit or honour the option for es.
  - The body date line of the owner email (`ownerRecordBody`) is not directly asserted; only the headline and subject are.
  - The subject `when` is clipped at 32 characters, and the new form is 2 characters longer. Typical windows still fit ("Sat, Nov 14, 8 am to 12 pm" is 26).
- **Re-queued owner emails stay safe across deploy.** They use `preserveSnapshot:true`, so a changed body does not trip "Delivery identity already used".

## 4. The four test updates
- **inbox-dialogs :226:** old message regex replaced by the new full sentence. Same strength.
- **phone-onboarding :99:** same strength.
- **complete-connections :121:** live-transfer labels are now exact full labels. Stronger for `connected`.
- **complete-connections :113:** `/fallback uses your saved contact cell/` became `/calls go to your saved contact cell/`, which is equivalent. `/Inbox.*separate statuses/` became `/need a person stay in Inbox/`. That is slightly weaker, because the "separate statuses" clause was intentionally removed from the copy.
- **New `managed-delivery-qa-check` (gate):** real mutant-killing coverage under 4 time zones.

## 5. CLAUDE.md copy rules
- **Em dashes:** none in added lines. The remaining U+2014 in desk/onboard is only inside a `desk.js` time regex.
- **Prototype words:** no "scene", "sample", "fictional" or "try to break it" in added lines.

## 6. Combined patches
Patches tested: a11y `a11y-r3-fix-r2-on-d35c2de6.patch` (13588a48…), polish `visual-polish-on-d35c2de6.patch` (405acdcf…) and the optional placeholder patch (e906d546…).
- **Copy vs a11y: conflict in every order.** Both edit the same 15 KB line, `desk.html` 107 (Business details block): copy changes the `#phoneFallbackNote` text, and a11y adds `id`/`role="group"`/`aria-labelledby` to the hours rows. The edits do not overlap, so this is a pure textual conflict.
- **Copy vs polish:** no conflict, either order. The polish wrapper at desk.html 39-40/50 is not touched by copy; copy's line-42 edit applies with offsets.
- **Copy vs optional placeholder patch:** no conflict, either order.
- **Working order:** **a11y r2 → visual polish → copy (rebased)**. The rebased copy patch is `qa/copy-clarity-rebased-on-a11y-r2-and-polish.patch` (sha256 `d71eacae…f4a4f2e`). It keeps the a11y line and swaps in only the new phone note text, and is still 19 files, 178+/48-. `git apply --check` is clean on a11y+polish.
- **Alternative:** copy → polish → a11y, resolving the same one-line conflict by hand.

## 7. Gate on the combined result (a11y r2 + polish + rebased copy)
- **`netlify.toml` build line:** **71/71 steps exit 0**, each in a fresh `env -i` + deny-remote process (`receipts/gate-combined/SUMMARY.tsv`).
- **sitecheck:** clean.
- **`copy-shots-check` on the combined tree:** **12/12 PASS**, physicalNetwork 0, pageErrors 0. Screenshots are in `receipts/shots-combined/`; I reviewed account-paused and the phone note by eye, and they render cleanly with polish styles.
- **`request-followthrough-ui-check` default phase (copy-only tree):** 12/12.

## Fixes requested
1. **Required for combining:** use the rebased copy patch, or hand-merge `desk.html` line 107, and apply after a11y r2 + polish.
2. Update `scripts/request-followthrough-ui-check.mjs:151` to `/Your change may not have saved/` (and optionally `qa-focus-probe.mjs:194`).
3. **P3:** change the `desk-lead-sources.js:210` stage label `'Workspace paused'` to `'Front desk paused'` for consistency.
4. **P3, optional:** say where paused calls go, e.g. "calls are not answered by your front desk; calls may ring your saved cell". Only do this if the owner should know the paid fallback leg continues.
5. **P3:** honour or document `relative:false` for `es`, and add one assertion on the owner email body date line.
