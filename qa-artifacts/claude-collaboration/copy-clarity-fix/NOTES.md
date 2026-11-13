# Copy-clarity fix (PRA-COPY-01..11) on release-4 commit d35c2de6

**Patch:** `copy-clarity-fix-on-d35c2de6.patch` (sha256 `6b583ca75a196992f01b326e7513cc02e6b68d4df490a8ff94731e1c48fef0e3`). It is 19 files, 178+/48-, and `git apply --check` passes on d35c2de6.
Nothing was applied to tracked files, committed or pushed, and no provider was called. All runs were offline: `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1` and the release-4 `deny-net.sb` (loopback only). Runs used a throwaway git-archive copy under the session scratchpad, which has since been deleted.

## Contents
1. **Base:** the copy-clarity-r4 `copy-fixes.patch`, unchanged: PRA-COPY-01/02/03/04/06/07/08/09 and the legacy `lib/desk.mjs` lines.
2. **PRA-COPY-05 (P1) pause wording.** I checked the code first. `lifecycleTransition('pause')` sets web, voice and sms off. Website chat is refused (`chat.mjs`). Calls get `fallbackTwiml` (`voice.mjs`). Texts get one "not answered" reply per 24 h (`sms.mjs`). Self-service Calendar writes exclude `paused`. Inbox, visits, settings and downloads stay usable, and carrier forwarding is not touched. Resume restores web only if it was on before; phone and text come back through their own checks.
   - The Account button, scope, confirmation and summary, the Home banner, the Connections dialog and the lead-source note now all say "front desk". Each states that **website chat, calls and texts** stop being answered and that **Inbox, visits, settings and downloads keep working**. Forwarding is mentioned where relevant. `connection-journey.mjs` paused detail now says "Your front desk is paused".
   - The account-page check's guard regex (`/calls (?:are|have)|delivered|forwarding (?:off|disabled)/`) is respected.
3. **PRA-COPY-10:** `friendlyDate(iso, lang, { relative:false })` added in `lib/calendar.mjs`. It formats America/Chicago and never says "today/tomorrow", so a re-queued email body stays identical. `managed-delivery.mjs` uses it in the visit headline/subject and the body date line, e.g. "Visit request: Sat, Nov 14, 8 am to 12 pm".
   - **Test:** new check in `scripts/managed-delivery-qa-check.mjs` (gate), run under 4 TZs. It fails on the base file (`receipts/gate/mutant-base-managed-delivery.log`) and passes patched.
4. **PRA-COPY-09:** both em dashes removed (in base patch). No visible U+2014 remains in desk/onboard; the only ones left are inside regexes.
5. **PRA-COPY-11:** shortened phone fallback note, conversation-history note, Manage service choices and the one-follow-up-text note.
   - **Consent/legal wording left unchanged:** live-transfer authorization checkbox (desk.html "I am authorized to route calls..."); review-request setting (REVIEWS/RESEÑAS opt-in); texting-program agreement checkbox, customer invitation instructions and "Saving prepares the text..." scope line in the request follow-up section.
6. **Tests updated for changed strings:**
   - `scripts/complete-connections-ui-qa-check.mjs` (:121 live-transfer labels; :113 phone note)
   - `scripts/phone-onboarding-ui-check.mjs` (:99 cancel dialog)
   - `qa-artifacts/.../inbox-dialogs/inbox-dialogs-ui-check.mjs` (:226)
   - All scripts/ and qa-artifacts check `.mjs` were scanned for every removed 3-word phrase. The other hits are server text that did not change, fixture data or unrelated wording.
   - Not changed: the reminder opener "NOT ACKNOWLEDGED" and the remaining PRA-COPY-02/03/04/06/08 follow-ups that the report listed as later work.

## Results
| Run | Result |
|---|---|
| netlify.toml gate, each step in a fresh process | **71/71 exit 0** (`receipts/gate/SUMMARY.tsv`); the verbatim `&&` chain gives `GATE_EXIT=0`; sitecheck clean |
| P3 checks | ui **45/45**, desk-ui **12/12** |
| FC checks fc01..06 | **6/6 PASS** (6+4+4+4+4+8 checks), physicalNetwork 0 |
| `copy-shots-check.mjs` (new, 390px) | **12/12**; 10 screenshots in `screenshots-390/` |
| Extra string-asserting suites, base vs patched (`receipts/extra-base-vs-patched/`) | already failing on d35c2de6 with identical counts: account-page 0/5, inbox-dialogs 17/19, lead-ai-independent 14/64, phone-onboarding stops at :68 (guide dialog) |
| complete-connections, base vs patched | base 5/46, patched 9/46. Patched passes the four handoff labels, including the two new ones, and then hits an existing detached-element error later in the same check. No suite regressed. |

## Screenshot limits
- **Connections pause dialog:** the fixture cannot produce a verified phone/text connection, so a `data-connection="pause_services"` button was injected. The real click handler and `review()` dialog then ran.
- **Request follow-up section and number-cancel dialog:** revealed or opened directly for the screenshot.
- **Onboarding trade option:** checked by text only, because native select options do not render in screenshots.
