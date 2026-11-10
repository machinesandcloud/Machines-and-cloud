# Backend proposals: SMS keyword normalization and chat 403 refusals

Base: `dfb0ae7846e66871d849c67566bf9d3b475f46ae`. Backend owner: Codex.

**Status: proposed, not applied. Revision 2 addresses the independent QA notes in `qa/`.** None of the tracked files in this worktree were changed (`git status` shows only this untracked folder). Each patch was applied only to throwaway copies outside the worktree, and all tests ran there. Both patches apply cleanly to dfb0ae78 (`git apply --check`), each on its own or together. They touch separate files.

Everything ran offline: memory store or an in-process Blobs double, `MC_FAKE_MODEL=1`, provider env removed, and outbound networking denied. The only network access was reading the CTIA PDF. Browser runs used the bundled `chrome-headless-shell-1223`.

| File | What it is |
|---|---|
| `01-stop-keywords.patch` | Proposal 1: new `lib/sms-keywords.mjs`, plus changes to `lib/platform-sms.mjs` and `lib/managed-consent.mjs` |
| `02-chat-403.patch` | Proposal 2: changes to `chat.mjs` |
| `stop-keywords-check.mjs` | Proposal 1 acceptance check (91 cases) |
| `chat-403-check.mjs` | Proposal 2 acceptance check (28 checks) |
| `widget-stream-403-real.mjs` + `.diff` | Refreshed widget-stream suite, fed the real 403 bodies from the handler |
| `widget-403-cors-probe.mjs` | Real cross-origin browser probe: two loopback origins, with the real handler behind `/api/chat` |
| `receipts/` | Logs and JSON for every run cited below |

---

## Proposal 1: STOP/opt-out keyword normalization (CTIA 5.1.3)

**Revision 2.** Independent QA (`qa/`) accepted the proposal with notes. This revision makes QA's required change and adds the recommended additions:
- QUIT is now whole-message only.
- The courtesy list is stricter.
- New whole-message phrases.
- CANCELAR and BAJA.
- Signature stripping.
- The campaign keyword list.
- QA's 104 cases are now part of the check.

### Problem
At dfb0ae78, a keyword is recognized only when the whole message is exactly that word:
- `lib/platform-sms.mjs:35-41`. Line 36 is `const word = body.trim().toUpperCase();`, and the result is checked with `includes()` against the lists at `:7-10`.
- `lib/managed-consent.mjs:7-9` uses anchored regexes, applied at `:32`. The shop list also lacks REVOKE and OPTOUT (AUDIT.md gap G3).

As a result, "Stop.", "STOP!", "Stop please", "¡Alto!" and "please opt me out" are not opt-outs.

CTIA Messaging Principles, May 2023, §5.1.3. I re-extracted this from the PDF with PDFKit, because the local text dump had dropped the sentence:
> "Standardized "STOP" wording should be used for opt-out instructions, however opt-out requests with normal language (i.e., stop, end, unsubscribe, cancel, quit, "please opt me out") should also be read and acted upon by a Message Sender except where a specific word can result in unintentional opt-out. The validity of a Consumer opt-out should not be impacted by any de minimis variances in the Consumer opt-out response, such as capitalization, punctuation, or any letter-case sensitivities."

### Change (`01-stop-keywords.patch`)
- **New `lib/sms-keywords.mjs`.**
  - It defines `SMS_KEYWORDS`, which is the same published lists as before:
    - stop: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT, ALTO, PARAR
    - start: START, UNSTOP, EMPEZAR
    - help: HELP, INFO, AYUDA
  - It adds `normalizeSMSKeywordText()` and `classifySMSKeyword()`.
- **`platform-sms.mjs`.** `PLATFORM_SMS_KEYWORDS` is now `SMS_KEYWORDS`, with the same value, so `platform-sms-check.mjs:40` and `sms-policy-check.mjs:107` still deep-equal. `keyword()` now uses the classifier. Twilio `OptOutType` is unchanged.
- **`managed-consent.mjs`.** The three regexes are replaced by the shared classifier, so the shop line uses the same vocabulary as the platform line (REVOKE and OPTOUT are added). Precedence `stop > start > help` and the `providerOptOutType` handling are unchanged.
- **`messaging-provider.mjs:47`.** The tiny optional change QA offered is **included**. The A2P campaign `OptOutKeywords` gains REVOKE and OPTOUT, so the Twilio registration matches the platform list and the public pages. This affects only campaigns registered or re-registered after the change; existing Twilio campaigns keep their current list. `messaging-activation-check` still passes (its check at line 59 is `includes("PARAR")`).

### Rule
1. **Normalize the text.**
   - Drop trailing lines that look like a signature ("Sent from my iPhone/Android/…", "Sent from Yahoo/Outlook/Gmail…", "Get Outlook for …", "Enviado desde mi …").
   - Apply NFKD and remove accents. Uppercase.
   - Turn every character that is not a letter, digit or in-word apostrophe into a space; this removes punctuation, emoji and zero-width characters.
   - Collapse spaces.
   - Join `OPT [ME] OUT` into `OPTOUT` and `STOP ALL` into `STOPALL`.
   - If the message is only single letters, join them ("S.T.O.P." becomes STOP).
2. **Whole-message keyword.**
   - The normalized message equals one published STOP, START or HELP keyword, or one of the Spanish extras **CANCELAR** or **BAJA**.
   - CANCELAR and BAJA are recognized but not added to the published list, so the campaign and public-page keyword checks stay exact.
   - **CANCEL, END, QUIT, REVOKE and CANCELAR count only as the whole message.** So "It quit", "quit working", "cancel my appointment" and "end of the day works" stay conversations.
3. **Whole-message opt-out phrases.** The phrase may start with PLEASE and may end with courtesy words (PLEASE, NOW, THANKS, THANK YOU, POR FAVOR, GRACIAS, YA) or AGAIN, ANYMORE or EVER. The phrases:
   - DONT/DON'T/DO NOT TEXT/MESSAGE/CONTACT ME
   - QUIT/STOP TEXTING/MESSAGING/CONTACTING ME
   - REMOVE ME/MY NUMBER [FROM YOUR/THE/THIS LIST]
   - TAKE ME/MY NUMBER OFF [YOUR/THE/THIS] LIST
   - UNSUBSCRIBE [ME] FROM YOUR/THE/THIS LIST
   - NO MORE TEXTS/MESSAGES
   - NO [QUIERO] MAS MENSAJES
   - NO ME ESCRIBAN/MANDEN/ENVIEN/TEXTEEN [MAS] [MENSAJES]
   - DEJEN DE ESCRIBIRME/ESCRIBIR/MANDARME MENSAJES/…
4. **Short polite opt-out.** A message is STOP when all of these hold:
   - it has at most 6 words;
   - it contains at least one *strong* word: STOP, STOPALL, UNSUBSCRIBE, OPTOUT, ALTO, PARAR or BAJA (not QUIT);
   - every other word is on the strict courtesy list: PLEASE, PLS, PLZ, NOW, JUST, ME, TEXT(S/ING), MESSAGE(S/ING), SEND(ING), CONTACTING, THANKS, THANK, YOU, THX, TY, OK, OKAY, WRONG, NUMBER, POR, FAVOR, YA, GRACIAS, MENSAJES, TEXTOS.

   **IT, THE, MY, ALL, THIS, THEM and MAS are deliberately not courtesy words.** So "stop it", "please stop it", "the stop", "my stop", "stop the texts", "Mas alto" and "stop all the dripping" stay conversations.
5. **START and HELP are whole-message only.** "help me" and "help, my pipe burst" are conversations.
6. **YES / SI / SÍ consent is unchanged and exact.** It grants recurring-message consent, so it should stay strict. It is also matched separately and exactly in `managed-sms.mjs:141-144`.

### Trade-offs
- **Remaining misses (accepted, 5 of QA's 65 opt-outs):**
  - "no more" is ambiguous on its own.
  - "Stop, I already booked" has extra content words.
  - "cancel all" could mean all appointments.
  - "stopp" and "Sto p" are misspellings, and I did no fuzzy matching.

  These and longer sentences such as "stop texting me i already booked" reach the normal conversation and the owner. Twilio Advanced Opt-Out (`OptOutType`) is still the second net.
- **New behavior on bare words.**
  - "Help!", "Info." and "Start." now get the HELP or START handling. Before, they were AI conversations on shop numbers and guidance replies on the platform line.
  - A bare "Stop!" or "Cancel." mid-conversation is an opt-out. CTIA requires this.
- **QUIT made exact-only** loses polite variants such as "quit it now". "Quit texting me" is still caught by its explicit phrase.
- **The shop line gains REVOKE, OPTOUT, CANCELAR and BAJA.** This only adds opt-outs, the safe direction.

### Gaps outside this patch (not changed)
- **Legacy `netlify/functions/sms.mjs:15-16`** has its own matcher, which is not aligned with this one.
  - It catches more free text: `STOP_PHRASE` matches "stop texting" *anywhere*, plus "remove me", "don't text" and Spanish phrases.
  - It misses others: fullwidth or zero-width STOP, "S.T.O.P.", emoji after STOP, BAJA.
  - Its substring phrases also give false opt-outs that this patch avoids. QA's probe shows legacy=stop for "remove me from the schedule" and "don't text, call me instead".
- **Legacy `sms.mjs:41-53`.** Owner commands (`:41-46`) and texts from VIP bypass numbers (`:48-53`) are handled **before** the STOP check at `:57`. So a STOP from the owner's phone or from a bypass-list number is never recorded as an opt-out.
- **`lib/send.mjs`.** `force:true` skips the opt-out check (`:43`). It is used for owner alerts at `:101`, and for welcome, test and number-assigned texts in `client.mjs:486,511,522,549` and `provision-background.mjs:77`. These texts reach the owner's phone even if that number has opted out.
- **`messaging-provider.mjs:47` OptOutKeywords** lacked REVOKE and OPTOUT. **This is now included in the patch**, as described above. Existing registered campaigns still need a re-registration or a Console update.

### Evidence
- **`stop-keywords-check.mjs`** has 224 cases: 120 of my own plus QA's 104, copied verbatim from `qa/qa-stop-cases.mjs`. Each case runs through the **real** `/api/platform-sms` handler (signed form, intercepted receipt GET, reading the keyword on the receipt) and the **real** `recordManagedInbound()`.
  - **Required:** all of my own cases, plus every QA row that expects anything other than STOP. That is 159 cases.
  - **Recall only:** QA's STOP rows.

  | | Base dfb0ae78 | Previous patch (QA's run) | **This revision** |
  |---|---|---|---|
  | Required cases failing | 61 of 159 (**FAIL**) | n/a | **0 of 159 (PASS)** |
  | QA 98 stop/not-stop rows, platform (tp/fn/fp/tn) | 16/49/0/33 | 45/20/4/29 | **60/5/0/33** |
  | Recall / precision, platform | 0.246 / 1.00 | 0.69 / 0.92 | **0.923 / 1.00** |
  | Recall / precision, shop line | 0.215 / 1.00 | same as platform | **0.923 / 1.00** (identical to platform) |

  Every false-positive guard passes on both lines, including:
  - "please stop by tomorrow", "can you stop the leak", "cancel my appointment", "quit working", "help, my pipe burst";
  - "It quit", "It just quit", "It quit now", "All quit", "quit it";
  - "Mas alto", "stop it", "the stop", "my stop".

  Receipts: `receipts/stop-keywords-{base,patched}.{log,json}`. Both runs made 0 requests other than the intercepted receipt read.
- **QA's probe script, rerun on the final patch** (`receipts/qa-classifier-probes-after.log`). The listed false opt-outs are gone. "S.T.O.P.", "dont text me", "cancelar" and the "Sent from my iPhone" case are now caught.
- **Patch check.** The patch was applied to a fresh copy of dfb0ae78 with `git apply`, and both checks passed there.
- **Regressions.** These scripts were run on base and on patched, and each exits 0 on both. Logs are in `receipts/p1-regress-{base,patched}/`.

  | Script | Result (base and patched) |
  |---|---|
  | platform-sms-check | 18/18 |
  | platform-sms-independent-check | pass |
  | sms-policy-check | 20/20 |
  | managed-sms-qa-check | pass |
  | managed-sms-budget-check | 14/14 |
  | launch-appointment-consent-qa-check | 5/5, sourceStable |
  | managed-delivery-qa-check | 18/18 |
  | messaging-activation-check | pass |
  | request-automation-check | 33/33 |
  | tenant-isolation-check | pass |
  | service-onboarding-qa-check | pass (added this round, because it imports managed-consent) |

### Risks
- These are behavior changes on live inbound SMS. Any word added to the courtesy or phrase lists later widens the rule, so reviewers should treat those lists as policy. The QA guards in the check protect them.
- The shared module creates one place that can break both lines. Both lines are exercised through their real handlers.
- The campaign keyword change applies only to new registrations.

---

## Proposal 2: chat 403 refusals on first sends

### Problem
In `chat.mjs` at dfb0ae78, these returns send only `{error}`, with no `message`, no `turnNotProcessed`, and, for most of them, **no CORS headers**:

| Line | Condition |
|---|---|
| `:63` | `GET ?mode=sales` from a non-site origin |
| `:87` | Owner token from a non-workspace origin (these already had CORS) |
| `:90` | Owner session for a different account (these already had CORS) |
| `:104` | Test channel without owner authority |
| `:108` | Self-service web chat not ready or paused |
| `:111` | Origin not allowed |
| `:112` | Shop not live, or paused |

The widget saves `pendingTurn` before it sends (`embed.js:164`) and clears it only when `turnNotProcessed === true` (`embed.js:170`). So after a 403 the composer stays locked behind "Check previous reply", with the false "interrupted" copy. This is REAL-1 in suite-refresh/REFRESH.md and the 403 section of combined-preview/refreshed-suites/RESULTS.md.

### Change
`02-chat-403.patch` adds `refused(origin, body, error, message)`, which returns `{ error, message, turnNotProcessed: body?.recoverTurn !== true }` with status 403 and `cors(origin)`. All seven returns use it, and the `error` codes are unchanged.

| Line | `message` |
|---|---|
| `:108`, `:112` (customer widget on an allowed page) | "Website chat is unavailable right now. Please use the shop’s contact details on this website." |
| `:111` (page is not one of this shop's sites) | **Revision 2, per QA:** "Website chat is not available on this page. Please contact the shop directly." The page may not belong to the shop, so it must not point at "contact details on this website". The CORS origin echo is kept; QA judged it correct. |
| `:63` | "Chat is unavailable on this page." The request is a GET with no body, so the flag is `true` because there is no turn. |
| `:87` | "Workspace chat can only be opened from your Machines & Cloud workspace." |
| `:90` | "This sign-in does not have access to this workspace's chat." |
| `:104` | "The test line is only available to the workspace owner." |

**Why CORS is part of the fix:** the widget runs on the shop's own site, so it is cross-origin to the platform. The preflight at `:60` already reflects the origin, but the 403 bodies at `:104/:108/:111/:112` did not. The browser therefore blocks the body, `fetch` rejects, and embed.js shows "interrupted" whatever the body says. **Adding the flag alone would not reach a real cross-origin widget.** This is proven below.

### These returns happen before any conversation read or write
I checked this by reading the code and by an access log.
- **From the code (dfb0ae78).** Before these returns, the handler does only the following:
  - parse the body (`:73`);
  - `strictRead("clients")` (`:85`);
  - for `:90`, `getAccessSession` reads `access_sessions` (`:88`);
  - for legacy (non-self-service) tenants only, `rateLimited(ip)` reads and writes the `ratelimit` counter (`:95`). This happens before `:104`, `:111` and `:112`. It is an IP counter, not conversation, turn or allowance state.

  The first conversation access is `getConversation` at `:132`, followed by `beginConversationTurn` at `:136`. AI or sales allowance reservation and model calls come later still. `:63` returns before `getSalesAllowance`.
- **From the access log.** `chat-403-check.mjs`, in its `blobs-double` mode, records every storage access. For each of the 13 refusal cases, it asserts that no `conversations` key and no AI, sales or budget key was touched. A control send that the handler admits does show conversation traffic, so the log is meaningful.
- **Why recovery stays `false`.** A `recoverTurn` probe is refused before the server reads the conversation. The refusal therefore says nothing about the original turn, which may have been saved before an interrupted reply. So the flag is `false` on a recovery probe, as RESULTS.md recommends.

### Evidence
- **`chat-403-check.mjs`.** It calls the real handler in-process, with a fake model and no provider env. It covers all 7 lines, each as a first send and as a `recoverTurn` probe (`:63` is a GET and has only the first case), under two backends: `MC_MEMORY_STORE=1` and a logged Blobs double. It checks the status, the unchanged error code, the presence of `message` (and the exact `:111` copy), `turnNotProcessed === !recover`, that the CORS header echoes the origin, that the conversation is still empty (memory mode), and that there was no conversation or allowance access (double mode).
  - **Base: FAIL, 2/28.** Only the two control sends pass. Receipts: `receipts/chat-403-base.{log,json}`.
  - **Patched: PASS, 28/28.** Receipts: `receipts/chat-403-patched.{log,json}`.
  - The real 403 bodies captured from the handler are in `receipts/chat-403-real-bodies-{base,patched}.json`.
- **Refreshed widget-stream copy, unmodified** apart from the browser executable (`receipts/widget-stream-unmodified-env.diff`). Run against the patched copy, **it still fails `denied_request_recovers_composer`**, its last scenario, with a 2.5 s wait timeout (`receipts/widget-stream-unmodified-on-patched.log`). This is expected: its 403 is a hard-coded `{error:'fixture_denied'}` served by a mocked `window.fetch` (line 87), so it never calls the server. A server patch cannot change that outcome.
- **`widget-stream-403-real.mjs`**, with the diff in `widget-stream-403-real.diff`. It is the same suite and the same real `embed.js` (sha 43cc96c9…, unchanged), with these changes:
  - the 403 fixture body is the **real** handler body;
  - a 403 that carries a `message` must show that message, not the "couldn’t confirm" copy, and must clear `pendingTurn`;
  - it adds the recovery-403 case that REFRESH.md asked for.

  Results:
  - **Patched bodies: 26/26 pass.** The first-send 403 clears `pendingTurn`, re-enables the composer and shows the server message. On a recovery probe, the 403 keeps `pendingTurn` (same turnId) and keeps the composer held.
  - **Base bodies: 24/26.** `denied_request_recovers_composer` times out with the composer still locked. The recovery case fails only because no message is shown.
  - Receipts: `receipts/widget-403-real-{patched,base}{.log,/}`.
- **`widget-403-cors-probe.mjs`** runs a real cross-origin browser test: shop page and platform on two loopback ports, with the real `chat.mjs` (including its preflight) behind `/api/chat`. Receipts: `receipts/widget-403-cors-*`.
  - **Base:** the POST returns 403 without `Access-Control-Allow-Origin`. Chromium logs "blocked by CORS policy", the widget shows "interrupted", `pendingTurn` is kept and the composer is locked.
  - **Patched:** the 403 carries ACAO, the body is read, `pendingTurn` is cleared, the composer is released and the server message is shown.
  - **Control (patched body with the CORS headers removed):** the lock comes back. **The flag works only together with the CORS headers.**
- **Regressions.** Every chat script was run on base and on patched, and each one exits 0 on both. Logs are in `receipts/p2-regress-{base,patched}/`. The scripts: smoke, conversation-history-check, owner-test-check, customer-owner-test-check, self-service-ai-check, self-service-ai-proof-check (14/14), sales-desk-check, sales-budget-check, sales-agent-check, sales-desk-backend-qa-check, persona-check, tenant-isolation-check, website-installation-check (18/18), request-automation-check.
  - `customer-web-delivery-qa-check --output` stops with the **same pre-existing fatal on base and on patched** (`Cannot read properties of null (reading 'reservations')` at its line 57). This is not caused by the patch.
  - Not run: `demo-outcome-check`, a voice UI check that needs a local server and is unrelated; and the original `scripts/widget-stream-check.mjs`, which is stale per REFRESH.md (the refreshed copy is used instead).

### Does embed.js need a frontend change?
- **Not for the first-send lock.** `embed.js:170` already honours `turnNotProcessed` and already shows `error.message`. With this patch alone, a definite 403 on a first send releases the composer and shows honest copy, cross-origin included.
- **Yes, for the recovery-403 loop. That is a separate frontend item, not in this patch.** After an interrupted reply, if "Check previous reply" gets a 403, the patched server correctly answers `turnNotProcessed:false`. embed.js then correctly keeps `pendingTurn`. But `.recovery` stays visible (`recoveryStillOffered: true` in `receipts/widget-403-real-patched/website-stream-fixed.json`), so each click sends another 403 and adds another bubble.

  The exact change, as recommended in RESULTS.md: in `embed.js:170`, when `res.status === 403 && recover`, keep `pendingTurn`, hide or disable `.recover-reply`, show "Chat is unavailable right now; your earlier message may already be saved", and re-read `/api/client` so that a later resume restores the control.
- **Optional.** After a first-send 403 the composer is usable again. A visitor who retypes simply gets another definite 403 with the same message. Re-reading config to show the unavailable state is a UX nicety.

### Risks
- **CORS on refusals.** The handler now reflects any requesting origin on these 403s, including `:111` (an origin that is not allowed). That origin can read `{error:"forbidden", message, turnNotProcessed}` and nothing else. The OPTIONS preflight (`:60`) already reflects every origin, and `:87`, `:90` and the `401`/`503` paths already sent `cors(origin)`. No tenant data is added. Codex should confirm this is acceptable.
- **The invariant must hold.** "No 403 after admission" is what makes `turnNotProcessed:true` safe. If someone later moves a conversation, turn or allowance write above one of these returns, the flag becomes wrong. `chat-403-check.mjs` (double mode) is the guard, so it is worth adding to the build list.
- **`:63` is a GET.** The flag there means "no turn exists". It is harmless, but it can be dropped if Codex prefers.
- **Website-check path.** It ignores the flag (`!setupCheck` at `embed.js:170`) and is unaffected.

---

## Not applied
Both patches are proposals for the backend owner (Codex). The worktree's tracked files are unchanged at dfb0ae78. Nothing was committed or pushed. The scratch copies were deleted after the runs.
