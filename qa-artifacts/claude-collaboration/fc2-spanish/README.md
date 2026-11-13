# FC2 Spanish care: PRA-FC2-03, 04, 05, 11, 13

- **Base:** release-4 HEAD `549aaf33`, worktree `/tmp/mc-claude-fc2-spanish-20261113` on branch `work/claude-fc2-spanish-20261113`.
- **Status:** uncommitted patches only. No commit, no push, no provider calls.
- **Patch:** `patches/fc2-spanish.patch` changes 13 files, +167/−64, sha256 `f6f0ab21f0215918353354727e6fbbc95b91ec2eda6021fe2cace25543145f2e`. It applies cleanly on 549aaf33.
- **Spanish style:** neutral US/Mexican Spanish with *usted*, following `SPANISH-REVIEW-R4.md`. All Spanish is AI-written and **needs a spot-check** by the named human reviewer.
- **Desk files:** the patch also touches desk files (desk.js, desk.html, desk-calendar.js, desk-requests.js, desk-customers.js). Each change is small and local. Rebase it against the other agent's desk/lifecycle patch.

## What changed

### FC2-03: website chat widget (`embed.js`)
- **String table:** one `TEXT.en` / `TEXT.es` table now covers every customer-facing string:
  - launcher, header, close, placeholder, Send and footer
  - recovery and "unconfirmed" notes
  - unavailable, daily-limit and busy messages, plus the "didn't load" message
  - interrupted, restarted and "not sent / back in the box" messages
  - the length note and screen-reader announcements
- **Follow-up invitation card:** it is also localized. Its keywords (REQUEST/QUOTE ref, YES, HELP/AYUDA, STOP/ALTO/PARAR) stay exact, because the SMS handler matches them.
- **When Spanish is used:** the shop must answer in Spanish (public config `spanish`) **and** the visitor must read Spanish. That means any one of:
  - the page has `lang=es`
  - `navigator.language` is `es*`
  - one of the customer's own messages looks Spanish
- **Before config arrives:** only an explicit `lang=es` page counts.
- **Shops that don't answer in Spanish:** they stay in English, so the widget never promises Spanish the chat won't give.
- **Server refusals:** known chat.mjs refusal codes are mapped to Spanish. Unknown ones fall back to the widget's own message for that outcome, so the wording stays accurate.
- **Owner-only setup check:** it stays in English.

### FC2-04: customer language shown to the owner
- **Where:** "Habla español / Spanish" now appears on:
  - the visit dialog contact line
  - Schedule chips: "Español" in compact chips, the full label otherwise
  - the visits table
  - Inbox request cards
  - the request dialog, as a "Language" fact
  - the Customers list
- **Source:** the request view now includes the saved `language`.
- **CSV:** the bookings and requests exports gain a trailing `language` column (`es`/`en`).

### FC2-05: follow-up text for a Spanish request
- **Templates:** `request_followup` and `quote_followup` are now in `TEMPLATES` / `TEMPLATES_ES` (desk.mjs). `request-followup.mjs` picks one through `template()` using the request's saved language.
- **English:** byte-identical to before.
- **Spanish text:**
  - It is all GSM-7.
  - It ends "Responda STOP o ALTO para dejar de recibir mensajes, o AYUDA para ayuda."
  - The request text is **208 characters, which is 2 segments.** The English one is 153, which is 1 segment.
  - A one-segment version would have to drop the AYUDA line or the glossary's STOP wording. That is a decision for the owner or reviewer.
- **Owner preview:** inserts "Su presupuesto: <url>" for Spanish quotes.

### FC2-11: holidays
- **Blocked time:** now takes an optional **Through** date (whole days only, up to 31) and an optional **Label** of up to 60 characters, with no `<` or `>`.
- **How it saves:** one atomic save creates one removable block per day, each with its label.
- **Repeats:** blocking the same days again updates the label instead of creating duplicates.
- **Refused without saving:**
  - a range combined with a time window
  - an end date before the start date
  - more than 31 days
  - a bad label
  - an "unblock" with a range
- **Where the label shows:** the blocked-time list, the calendar chips and the selected-day panel.
- **Hours field hints:**
  - Under Business hours, a standing note says holiday notes there are not applied.
  - When the text mentions a holiday or closure (English or Spanish words), it switches to: "Your hours mention a holiday or closure. That note is not applied to your availability: add those dates in Schedule under Blocked time…"
  - The onboarding hours hint says the same.

### FC2-13: onboarding examples follow the trade
- **Example sets:** placeholders for services, fees, FAQ, "never", licenses and greeting now come from per-trade sets: HVAC, plumbing, electrical, roofing, cleaning, and a generic fallback.
- **Trade matching:** uses the existing `tradeKey`.
- **Greeting:** the example uses the business name once it is typed. Placeholders only; nothing is saved.

## Proof
All runs were offline: `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1`, with `sandbox-exec` deny-remote (`harness/deny-net.sb`). Physical network count was 0 in every report.

| Run | Result |
|---|---|
| `fc2-spanish-check.mjs`: actual handlers and libraries | **9/9** (`receipts/node-check.json`) |
| `fc2-spanish-ui-check.mjs`: Chrome (channel chrome), 390 and 1440 | **11/11**, 0 forbidden requests, 0 page errors (`receipts/ui-report.json`, 21 screenshots in `receipts/screenshots/`, including the Spanish embed at 390 and 1440) |
| Mutants (`harness/mutants.py`): 25 mutants, each on its own throwaway copy | **25/25 killed**. In run 1, 24/25 were killed. M21 (calendar block label hidden) survived because the day panel also showed the label. The check now asserts the calendar chips, and M21 is killed (`receipts/mutants-run1.*`, `mutants-m21-rerun.json`). |
| Full `netlify.toml` gate, 72 steps (`harness/gate.sh`) | base **72/72**, patched **72/72**, final patch (one comment line later) **72/72** (`receipts/gate-*/SUMMARY.tsv`) |

Synthetic parts are named in the check:
- the "live" public config and the website-chat replies in the embed checks
- the unavailable config, which comes from the actual handler

Real model wording is not covered.

## Not done
- The SMS **permission question** (`requestFollowupQuestion`) and the inbound follow-up replies are still English only. They are consent texts, so changing them needs the legal/carrier owner. The Spanish widget card points the customer to that separate question.
- Holiday text is not parsed into blocks. The hint only tells the owner to add them.
- The appointment-texts card was already bilingual and is unchanged.
