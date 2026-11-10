# Backend proposals: SMS keyword normalization and chat 403 refusals

Base: `dfb0ae7846e66871d849c67566bf9d3b475f46ae`. Backend owner: Codex.

**Status: proposed, not applied.** None of the tracked files in this worktree were changed (`git status` shows only this untracked folder). Each patch was applied only to throwaway copies outside the worktree, and all tests ran there. Both patches apply cleanly to dfb0ae78 (`git apply --check`), each on its own or together. They touch separate files.

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

### Problem
At dfb0ae78, a keyword is recognized only when the whole message is exactly that word:
- `lib/platform-sms.mjs:35-41`. Line 36 is `const word = body.trim().toUpperCase();`, and the result is checked with `includes()` against the lists at `:7-10`.
- `lib/managed-consent.mjs:7-9` uses anchored regexes `^(STOP|…)$`, applied at `:32` to the trimmed text. The shop list also lacks REVOKE and OPTOUT, which the platform list has (AUDIT.md row at line 34, gap G3).

As a result, "Stop.", "STOP!", "Stop please", "¡Alto!" and "please opt me out" are not treated as opt-outs. On the shop line they go to the AI conversation. On the platform line they get a guidance reply.

CTIA Messaging Principles, May 2023, §5.1.3. This was read from the PDF text the audit cites; the local text dump had dropped this sentence, so I re-extracted it with PDFKit:
> "Standardized "STOP" wording should be used for opt-out instructions, however opt-out requests with normal language (i.e., stop, end, unsubscribe, cancel, quit, "please opt me out") should also be read and acted upon by a Message Sender except where a specific word can result in unintentional opt-out. The validity of a Consumer opt-out should not be impacted by any de minimis variances in the Consumer opt-out response, such as capitalization, punctuation, or any letter-case sensitivities."

The legacy `netlify/functions/sms.mjs:15-17` already tolerates `[\s.!]*` and some phrases. I did not change it.

### Change
- **New `lib/sms-keywords.mjs`.**
  - It defines `SMS_KEYWORDS`, which is the same frozen lists as before:
    - stop: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT, ALTO, PARAR
    - start: START, UNSTOP, EMPEZAR
    - help: HELP, INFO, AYUDA
  - It adds `normalizeSMSKeywordText()` and `classifySMSKeyword()`, which returns `'stop' | 'start' | 'help' | null`.
- **`platform-sms.mjs`.** `PLATFORM_SMS_KEYWORDS` is now `SMS_KEYWORDS`, with the same value, so the deep-equality checks in `platform-sms-check.mjs:40` and `sms-policy-check.mjs:107` still pass. `keyword()` now calls the classifier. Twilio's `OptOutType` still applies exactly as before.
- **`managed-consent.mjs`.** The three regexes are replaced by the shared classifier, which gives the shop line the same vocabulary as the platform line (REVOKE and OPTOUT are added). The precedence `stop > start > help` and the `providerOptOutType` handling are unchanged.

### Rule
1. **Normalize the text.** Apply NFKD and remove accents. Uppercase it. Turn every character that is not a letter, digit or in-word apostrophe into a space; this removes punctuation and emoji and makes `¡¿` irrelevant. Collapse whitespace. Join `OPT OUT`, `OPT-OUT` and `OPT ME OUT` into `OPTOUT`.
2. **Exact keyword match.** If the normalized text equals a keyword, it is that keyword. Examples: "Stop." and "stop " are STOP, "Cancel." is STOP, "Start!" is START, "¿Ayuda?" is HELP.
3. **Exact opt-out phrases.** A short list of whole-message phrases also counts as STOP: REMOVE ME, DO NOT TEXT ME, DON'T TEXT ME, NO MORE TEXTS/MESSAGES, NO MAS MENSAJES, NO ME ESCRIBAN, NO ME MANDEN (MAS) MENSAJES.
4. **Short polite STOP phrase.** A message is STOP when all of these hold:
   - it has **at most 6 words**;
   - it contains at least one *strong* opt-out word (STOP, STOPALL, UNSUBSCRIBE, OPTOUT, QUIT, ALTO, PARAR);
   - **every other word** is on a small courtesy or object list (PLEASE, ME, MY, IT, THE, NOW, ALL, TEXT(S/ING), MESSAGE(S), SEND(ING), THANKS, OK, POR, FAVOR, YA, MENSAJES, GRACIAS, …).

   For example, "please stop texting me", "Stop please", "stop the texts", "alto por favor" and "please opt me out" are all opt-outs.
5. **Not phrase triggers.** CANCEL, END and REVOKE count only as exact single words. "Cancel my appointment" and "end of the day works" are ordinary service messages; this is the "unintentional opt-out" exception in CTIA.
6. **START and HELP are exact only.** "Help me with my furnace", "I need help" and "When does the tech start?" stay conversations.
7. **YES / SI / SÍ consent is unchanged and stays exact.** It grants recurring-message consent, so it should stay strict. It is also matched separately and exactly in `managed-sms.mjs:141-144`. Normalizing it in only one place would make the two paths disagree.

**Not opt-outs (checked):** "the leak won't stop", "The leak won’t stop dripping", "Can you stop by tomorrow?", "My AC stopped working", "Please stop the water leak", "Don't stop the service", "The alarm won't stop, can you come?", "Stop! Water everywhere in the basement", "Stop the service visit", "stopwatch", "unstoppable", "Para mañana por favor", "No paren el servicio".

### Trade-offs
- **Accepted false negatives.** A longer opt-out with extra non-courtesy words is not caught: "please stop texting me, I already booked" is not an opt-out under the rule. It goes to the normal conversation, where the owner sees it. I chose this over a substring rule such as "contains STOP", which would opt out "the leak won't stop". Twilio Advanced Opt-Out (`OptOutType`) is still honoured as a second net. Twilio's own keyword set is in `messaging-provider.mjs:47` and is not changed here.
- **New positives that change behavior.**
  - "Help!", "Info." and "Start." now get the HELP or START handling. Before, they were AI conversations on shop numbers and guidance replies on the platform line.
  - On a shop number, a customer who types just "Help!" now gets the HELP contact reply instead of an AI answer. HELP is still silent while the customer is suppressed (`managed-sms.mjs:66`).
  - "Cancel." and "End." were already opt-outs as bare words. They now also are with punctuation.
  - A bare "Stop!" was already an opt-out and stays one, even mid-conversation. CTIA requires this.
- **Shop list widened** with REVOKE and OPTOUT. This only adds opt-outs, the safe direction. `policy.mjs:27` already says "standard carrier opt-out keywords are also honored".
- **Not touched:**
  - the legacy `sms.mjs` matcher;
  - the Messaging Service `OptOutKeywords` (`messaging-provider.mjs:47`, which lacks REVOKE and OPTOUT);
  - the public copy.

  Spanish phrases outside the listed set, such as "dejen de escribirme", are not caught. The legacy matcher catches more of these.

### Evidence
- **`stop-keywords-check.mjs`.** It sends 91 cases through the **real** `/api/platform-sms` handler (signed Twilio form, intercepted receipt GET, reading the keyword recorded on the receipt) and through **real** `recordManagedInbound()`, with a fresh contact for each case.
  - **Base: FAIL, 47/91.** 44 cases are misclassified on one or both lines. Receipts: `receipts/stop-keywords-base.{log,json}`.
  - **Patched: PASS, 91/91.** Receipts: `receipts/stop-keywords-patched.{log,json}`.
  - In both runs, 0 requests went anywhere other than the intercepted receipt read.
- **Regressions.** Every SMS, consent or STOP script was run on base and on patched, and each one exits 0 on both. Logs are in `receipts/p1-regress-{base,patched}/`.

  | Script | Result (base and patched) |
  |---|---|
  | platform-sms-check | 18/18 |
  | platform-sms-independent-check | pass |
  | sms-policy-check | 20/20 |
  | managed-sms-qa-check | pass |
  | managed-sms-budget-check | 14/14 |
  | managed-delivery-qa-check | 18/18 |
  | messaging-activation-check | pass |
  | request-automation-check | 33/33 |
  | tenant-isolation-check | 19 checks, ok |
  | launch-appointment-consent-qa-check `--output` | 5/5, sourceStable |

### Risks
- These are behavior changes on live inbound SMS. Messages that used to reach the AI or the owner as conversation can now opt a customer out. The rule is deliberately narrow (see "Not opt-outs" above), but any courtesy-list word added later widens it. Reviewers should treat that list as policy.
- The shared module creates one place that can break both lines. Both checks above import it through the real handlers.

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
| `:108`, `:111`, `:112` (customer widget) | "Website chat is unavailable right now. Please use the shop’s contact details on this website." |
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
- **`chat-403-check.mjs`.** It calls the real handler in-process, with a fake model and no provider env. It covers all 7 lines, each as a first send and as a `recoverTurn` probe (`:63` is a GET and has only the first case), under two backends: `MC_MEMORY_STORE=1` and a logged Blobs double. It checks the status, the unchanged error code, the presence of `message`, `turnNotProcessed === !recover`, that the CORS header echoes the origin, that the conversation is still empty (memory mode), and that there was no conversation or allowance access (double mode).
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
