# FC2 Spanish and onboarding: independent QA and Spanish review

**Verdict: ACCEPT with fixes.** Apply `qa/spanish-fixes.patch` (sha256 `c474579516f42ed0aca179039442db52ca87cd14457a213b9a96a38666626bcc`) after `patches/fc2-spanish.patch`. Then fix one small owner hint (F3, below) or accept it as known.

## Scope and setup
- **Patch reviewed:** `patches/fc2-spanish.patch`, sha256 `f6f0ab21…145f2e` (matches the README), 13 files, +167/−64.
- **Copy:** a throwaway copy from `git archive 2180487e`, with the patch applied cleanly.
  - Between 549aaf33 and 2180487e the only product changes are small edits to `operator.mjs` and `self-service-ai.mjs`. The rest of that diff is under qa-artifacts.
- **Offline everywhere:** `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1`, `sandbox-exec` deny-remote, Playwright `channel:"chrome"`.
- **No provider calls, no commit, no push.** All copies were deleted at the end.

## Reproduction
| Run | Result |
|---|---|
| Full `netlify.toml` gate (72 steps, one fresh process each), patched | **72/72** |
| `fc2-spanish-check.mjs` | **9/9**, physicalNetwork 0 |
| `fc2-spanish-ui-check.mjs` (Chrome, 390 and 1440) | **11/11**, 0 physical, 0 forbidden, 0 page errors |
| Mutants (`harness/mutants.py`), each on its own copy | **25/25 killed** |
| With spanish-fixes applied: node check, UI check, `smoke`, `sms-policy-check`, `conversation-history-check`, `managed-sms-qa-check`, `request-automation-check`, `build-site` | all pass (9/9, 11/11, rc 0 each) |
| With spanish-fixes applied: M01, M03, M04, M05, M07 | **5/5 still killed**; anchors unchanged |
| fc2 UI check on base + fc2 + visual-polish + optional-placeholder | **11/11** |

## Correctness and truthfulness

### Blocked-time ranges: PASS
- **Date arithmetic:** days advance with `addDays`, which steps at UTC noon. My probes:
  - Over DST start (2027-03-12 to 03-16) and DST end (2027-10-30 to 11-09), every day appears once, with no skips or duplicates.
  - Over the year boundary (12-24 to 01-01), 9 days.
  - Exactly 31 days is accepted and 32 is refused (`invalid_range`).
  - A backwards range is refused.
  - A label containing `<b>` is refused. Whitespace in labels is collapsed.
- **Atomic at the cap:** I had 93 blocks and asked for 20 more, passing the 100 limit. It was refused with `too_many_blocks` and the stored count stayed 93, so nothing was partly written.
- **Existing data:** nothing needs migrating.
  - Old blocks have no `label` and show exactly as before. `blockViews` adds `label` only when one is present.
  - Blocking a range over an existing whole-day block relabels it without duplicating it. A window block on the same day stays separate.
  - Removing one day of a range leaves the other days.
- **Labels stay private:** they reach only owner views (`blockViews`). `blockedWindow` and the public availability path ignore them, so they never reach customers or the AI.

### CSV exports: PASS, with one wording note
- **Jobber customer export:** `export=customers` (Jobber/Housecall Pro headers) is **unchanged**.
- **Bookings:** `language` is a true trailing column.
- **Requests (leads):** `language` is placed after `setup_check` but **before** the eight follow-through columns that self-service workspaces append. So for self-service shops it is not trailing: those columns move right by one position.
  - Header and rows agree, so importers that match by header name are unaffected.
  - Positional consumers of `followthrough_*` would shift. No in-repo check reads them by position, and the gate passes.
  - Fix the README's "trailing" claim, or move `language` to the end. Low risk.

### Widget language detection: one real false positive, fixed in the patch (F1)
- **Settings that hold:**
  - A shop with `spanish:false` stays English even on an `es` page with an es-MX browser.
  - Before config loads, only `lang=es` is trusted.
  - The owner's setup check stays English.
  - Server refusals are mapped only from known codes. I verified the `busy` code with a message against chat.mjs:82: it is the daily allowance, so "allowance" is accurate.
- **F1 (medium): English visitors are switched to Spanish.** New businesses default to `spanish: true` (config.mjs:222), so detection runs for most shops. In the original patch, one accented letter or one keyword was enough. I confirmed all of these flip the chrome to Spanish ("Enviar", "Escriba su mensaje") while the visitor keeps writing English:
  - "Hi, I am José, my AC stopped working"
  - "Can you come to Peña St tomorrow?"
  - "Need a quote for 12 Casa Grande Dr"
  - "My name is Renée…"

  Houston names and street names make this common. The switch also cannot be undone within the tab session.

  It also missed real Spanish: "se descompuso el AC", "cuanto cobran por la visita".
- **Fix in `spanish-fixes.patch`:**
  - Any message with `¿` or `¡` counts as Spanish.
  - Otherwise a message needs at least two Spanish words making up at least 25% of its words. A message of one or two words needs one, so "Hola" and "gracias" still count.
  - Accents alone no longer count.
  - Re-tested on 17 sentences: all five English examples above stay English, including "I live in La Porte near the Casa Ole". All Spanish examples, including the two misses, now switch.
- **F2 (low, product note): Spanish browser, English typing.** A visitor with an `es-*` browser who types English sees Spanish controls from the start. That is acceptable for a shop that answers in Spanish, but it is a choice the product owner should know about.

### Follow-up texts: PASS
- **English:** byte-identical to before (asserted by the check).
- **Language choice:** Spanish is chosen by the saved `lead.language` through `template()`, and the owner preview follows the same choice.
- **GSM-7:** I confirmed every Spanish variant is GSM-7.
- **Length:**

  | Text | Characters | Segments |
  |---|---|---|
  | Spanish request text | 208 | 2 (the lead accepted this) |
  | Spanish quote text, after my fix | 247 | 2 |
  | Spanish quote text with a ~50-character URL | 297 | 2 |
  | English quote text | 197 | 2 |

  A Spanish quote URL longer than about 60 characters makes it 3 segments.
- **Compliance note for the owner:**
  - The permission question (`requestFollowupQuestion`) is still English, so a Spanish customer gets an English permission question and then a Spanish follow-up.
  - The carrier campaign samples are English.
  - Inbound AYUDA is handled only on managed numbers (sms.mjs:110-117). The request follow-up is a managed text, so this is consistent.

  The legal/carrier owner should confirm the Spanish variant is acceptable under the existing campaign. The README already lists this as not done.

### F3 (low): the owner hours hint has false positives
The live hint in desk.js and the onboarding hint run the same regex. It treats ordinary weekly closures as holidays and tells the owner to add dates under Blocked time, which is wrong advice for days the weekly hours already handle:
- "Mon-Fri 8-6, closed on Sundays"
- "Lunes a viernes, sábado cerrado"
- "Closed for lunch 12-1"
- "Lunes a viernes, día de trabajo"

It is also inconsistent: "Sunday closed" does not match. **Recommended fix:** drop the bare `closed (?:on|for|the)`, `cerrado` and `día de` alternatives. Keep the holiday names, and use `closed (?:on |for )?(?:the )?(?:\d|jan|feb|…|dec)` and `cerrado (?:el|del) \d`. This is owner-facing only and changes no data. It is not included in my patch because it is not a Spanish wording change. M22 still kills the static-hint mutant after this change.

### FC2-04 badges and FC2-13 onboarding examples: PASS
- **Badges:** `Habla español / Spanish` appears consistently, and labels are escaped.
- **Examples:** they follow `tradeKey`, they are placeholders only, and nothing is saved.
- **Minor:** only the compact "Español" chip carries `lang="es"`. Consider adding `lang="es"` to the "Habla español" part of the other badges.

## Spanish review (neutral US/Mexican Spanish, usted)
- **Overall:** good. *Usted* is used throughout, and the wording is natural and concise.
- **Compliance tails are unchanged:**
  - "Responda STOP o ALTO para dejar de recibir mensajes, o AYUDA para ayuda" matches the existing managed Spanish texts and disclosures.
  - "Pueden aplicarse tarifas de mensajes y datos" is unchanged.
- **Keywords:** YES, HELP and STOP stay as the literal words the handler matches.
- **Corrections in `spanish-fixes.patch`:**

| Where | Before | After | Why |
|---|---|---|---|
| desk.mjs `TEMPLATES_ES.quote_followup` | Este es el seguimiento del presupuesto que usted ha pedido. | Este es el seguimiento que usted ha pedido. | The original reads as "the quote you asked for"; the English means the follow-up the customer asked for. The fix is also 16 characters shorter and still GSM-7 (I deliberately avoided *pidió*/*único*, which are not GSM-7). |
| embed `daily` | …y vuelve a abrir después de la medianoche… | …y se vuelve a abrir después… | *Volver a abrir* without *se* reads as transitive. |
| embed `allowance` | Se acabó el límite de chat de hoy. | Se agotó el límite de chat de hoy. | Sounds more natural. |
| embed `limit` | …con el negocio con los datos de este sitio web. | …con el negocio usando los datos de contacto de este sitio web. | Removes the doubled *con*. |
| embed `restarted`, `notSentPress`, `notSent` | …está de nuevo en el cuadro | …está de nuevo en el cuadro de texto | *Cuadro* alone is vague. |
| embed `tooLong` | no se ha cortado nada | no se recortó nada | Mexican usage prefers the preterite. |
| embed `changed` | Este chat cambió en otra ventana. | Este chat se actualizó en otra ventana. | Sounds more natural. |

- **The patch also:**
  - contains the F1 detection change in `embed.js`;
  - updates the one UI-check assertion that pinned the old `daily` wording.
- **Quote term:** *presupuesto* follows the house glossary (`spanish-review/GLOSSARY.md`, commit 565342d9, row "quote"). *Cotización* is more Mexican, but its ó would force the texts into UCS-2. The patch keeps *presupuesto*, and the human spot-checker still makes the final choice.
- **Glossary references:**
  - `SPANISH-REVIEW-R4.md` exists only in git history (`uncovered-cards/qa/`, commit c0fb407c). It is not in the 2180487e tree, and the README links it without a path. Give the full path.
  - The `AYUDA` keyword follows the glossary.
- **Human spot-check:** all of this Spanish is AI-written, and the named human reviewer's spot-check is still needed.

## Overlaps with in-flight patches
Each combination was tested with `git apply --3way` on 2180487e, in both orders.

- **Copy clarity** (`copy-clarity-rebased-on-a11y-r2-and-polish.patch`): **one textual conflict, in `desk.html`**, in either order.
  - Both patches edit the single long `<form id="cfg">` line. FC2 adds `aria-describedby="hoursHolidayHint"` and the `#hoursHolidayHint` paragraph after Business hours. Copy clarity rewrites the `#phoneFallbackNote` sentence.
  - The edits do not overlap within the line, so the resolution is mechanical: take copy clarity's line and re-insert FC2's two additions.
  - `desk.js`, `desk-requests.js` and `lib/desk.mjs` merge cleanly. I found no em dashes in FC2's new copy. Its date range uses an en dash.
- **Visual polish** (`visual-polish-on-d35c2de6.patch`): merges cleanly in both orders. Mobile now defaults to the agenda view, and the FC2 UI check still passes 11/11 on the combined tree.
- **Optional placeholder copy** (`optional-placeholder-copy-on-d35c2de6.patch`): **merges cleanly but clashes in meaning.**
  - It shortens the onboarding placeholders to one-line "e.g. …" text: fees "e.g. Diagnostic visit: $89", greeting "e.g. Hi, this is the Bayou Air front desk."
  - FC2's `fillExamples()` overwrites the services, fees, FAQ, never, licenses and greeting placeholders at runtime with full multi-line sets that have no "e.g.". With JavaScript on, the polish copy is never shown for those fields.
  - Whoever lands second must restyle `EXAMPLES` and the greeting template in `onboard.js` to the one-line "e.g." form. M23 and M24 still guard the behavior.
- **`spanish-fixes.patch`** touches only `embed.js`, `lib/desk.mjs` and the FC2 UI check. None of the in-flight patches touch those regions, so there is no new conflict.

## Cleanup
These throwaway copies and their outputs were deleted: `fc2sqa`, `fc2sfix`, `fc2solap` (a `--shared` clone), the mutant folders, and the gate and UI outputs. Nothing was committed or pushed, and no provider calls were made.
