# Release 5: independent release QA

**Verdict: GO.** Candidate `f9c01e6c` (`work/claude-release5-candidate-20261113`) fast-forwards production `2180487e` by 6 commits. Nothing was pushed, committed or deployed, and no provider was called.

**How every run was isolated**
- Each run used a fresh `git archive` copy under the session scratchpad (`r5qa/`), with `node_modules` symlinked to `p10/nm`.
- Every process ran under `env -i` with `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1` and a `sandbox-exec` deny-remote profile that allows loopback only.
- A probe from inside the sandbox confirmed that `fetch("https://example.com")` fails with `ENOTFOUND`.
- The browser fulfilled every request in-process, and non-loopback hosts were aborted. `route.fetch` was never used.
- All copies were deleted at the end. The harness is in `harness/` and the receipts are in `receipts/`.

## 1. Gate (reproduced)
| Run | Result |
|---|---|
| Each of the 73 `node scripts/…` steps of the `netlify.toml` build line, in a fresh process, at the real clock | **73/73 exit 0** (`receipts/gate/SUMMARY.tsv`) |
| The exact build line, verbatim, as one `bash -c` chain | **`CHAIN_EXIT=0`**. build-site reports 182 HTML pages and 311 files, with internal directories absent. |
| The same 73 steps plus the chain, with the clock set to **18:05 Houston**, the digest fan-out hour | **73/73 exit 0, `CHAIN_EXIT=0`** (`receipts/gate-fanout18/`) |

Notes on the runs:
- The fan-out run used `NODE_OPTIONS=--import fakehour.mjs`. Time keeps running from 18:05, as `clock-probe.log` shows.
- In both runs, smoke reports "scheduler ran at 5 gates, all blocks ok", and `sms-followups-check` passes 13/13.

## 2. Messaging, offline (my probe, not the author's checks)
The harness is `harness/probe.sh` plus `probe-tail.mjs`. It appends my scenarios to the unchanged fixture setup of `managed-sms-qa-check.mjs`. That setup uses the real HTTP handlers, signed Twilio payloads, the installed Blobs SDK compare-and-swap (CAS) and a provider double.

### Healthy managed path
**It is byte-identical to production.** Production `2180487e` and the candidate ran the same 8-step transcript:
- two questions, then HELP, AYUDA, STOP, a text after STOP, START and a final question;
- then delivered receipts and 60 minutes of scheduler waves.

The output was **5021 bytes each, identical**, sha256 `baf86d7c…5900` (`receipts/sms/tx-pp.json` and `tx-pc.json`). It records every Twilio POST, every Resend email, every TwiML response, the job states, the portal conversation and the leads.

### Follow-up texts (`receipts/sms/followup.log`)
This covers 8 cases: request and quote follow-ups, with and without a quote URL, for an ASCII business name and an accented one.
- **English is byte-identical** to production's `outreach()`, which I evaluated from the production source. That holds for both `language:"en"` and no language.
- **Spanish** is the only intended difference. Every Spanish text:
  - starts with the business name;
  - names STOP, ALTO and AYUDA;
  - is GSM-7 apart from the business name.
- The inbound handler already honours ALTO and PARAR (`SPANISH_STOP`) and replies to AYUDA in Spanish.

### Owner email dates
The other intended copy change: booking emails now print the date as "Sat, Nov 14" (`relative:false`). The healthy transcript produces no booking email, so the identical transcript does not exercise this change.

### Outage handling (`receipts/sms/outage-pc.json`): 5/5 pass
- **O1. Account-wide 401/20003 across 3 shops with 4 customers each.**
  - There is exactly 1 POST per reply, and every job is `failed / provider_rejected / providerScope:account`.
  - **1 operator email** goes out, plus **1 "Texting is temporarily unavailable" email per shop** and no per-customer owner emails.
  - All 12 requests are saved with the outage wording and `replyOutage.day`.
  - **Nothing is resent over 26 hours.**
  - The health record counts 12, with status 401 and code 20003.
- **O2. Next Houston day:** exactly 1 more operator email, and 1 more owner email per shop.
- **O3. Operator email hangs.**
  - The send was aborted at **5000 ms**, recorded as `lastError:"timeout"` with no `emailedAt`, and the delivery run continued.
  - A failure 5 minutes later did not retry the email. A failure after 15 minutes retried it and recorded `emailedAt`. There is no further email after that success.
- **O4. Non-account rejection (400/21610)** stays on the old per-customer path: no `providerScope`, no outage email and no operator email.
- **O5. Classifier:**
  - 401 (any code), 10001, 20003 and 20005 are account-wide.
  - 21610 and 429 are not.

### Release-4 failure suite, re-run on both production and the candidate (`receipts/sms/fail-*.json`)
- **Every scenario passes on both.** That covers failed receipt, network throw, 401, 400, 429, 5xx, the email cap of 3, one email per customer per day, the sweep of 25/25/10, STOP after a failure, the unverified sender, and the global check of 82 reply jobs with none attempted twice.
- **The release-4 P2 is fixed.**
  - Release-4 scenario L2 (30 orphaned failure-index keys sorted first): production gives `realAlerted:false, staleStillOpen:30`. The candidate gives `realAlerted:true, staleStillOpen:0`.

## 3. Browser walk (system Chrome, `channel:"chrome"`, at 320×640, 390×844 and 1440×900)
The walk is `harness/walk5.mjs`, built on fc-lib with the real `/api/client`, `/api/access` and `/api/manage` handlers. **Result: 39/39 checks**, with physicalNetwork=0, forbidden=0, pageErrors=0 and no console errors. **I looked at the screenshots** (`receipts/walk/`). There is no horizontal scroll at any width.

- **Homepage and demo:** the demo frame renders at 320.
- **Onboarding as a plumber.**
  - It reaches step 2 with the session state `questions`.
  - The placeholders follow the trade: "e.g. Drain cleaning", "e.g. Service call: $79", "e.g. Texas plumbing license M-12345", and "e.g. Hi, this is the Bayou Plumbing front desk."
  - Each of the 8 visible fields was focused in turn. At 320 and 390, none was overlapped by the sticky Back / Save and continue bar.
  - At a **430px keyboard-height viewport**, the bar becomes static and no focused field is covered. The worst case is 0.3 px past the viewport edge, which is subpixel.
- **Desk Home:** requests come first on a phone.
- **Inbox:**
  - A "Habla español / Spanish" tag sits on the Spanish request.
  - In the request dialog, once the first form field is focused, "Save action" sits in the sticky footer inside the viewport, and the focused field is not under it. Close stays on screen.
- **Schedule** opens in **Agenda** at 320 and 390, and in **Month** at 1440.
- **Visit dialog:** the Call and Text links sit above the fold, the close button is visible, and Escape closes it.
- **Blocked time:**
  - A 3-day range labelled "Thanksgiving" creates 3 separately removable rows.
  - The server rejects a 40-day range with "Block up to 31 days at a time."
- **Hours with holidays:** "closed on Sundays" is not flagged. "closed Dec 24-26 and Thanksgiving" shows the Blocked time hint.
- **Customers** shows the Spanish tag.
- **Connections:** checked.
- **Account pause:** the wording before and after pausing and the Home banner all say "Calls may still ring your saved contact cell".
- **Website chat embed.**
  - **Config used:** the real public config is `webAvailable:false` for an unproven shop, so I fulfilled a synthetic live config and a synthetic chat reply.
  - **English visitor named José** ("Hi, my name is José, I live off Casa Grande Dr and my water heater is leaking"), with an en-US browser on an English page: the widget **stays English** ("Send", "Chat with us").
  - **Spanish page with "Hola, necesito ayuda con una fuga de agua…"**: the widget is Spanish throughout ("Escríbanos", "Enviar", "Recepción automatizada", and the footer).
- **Admin overview:** renders at all three widths.

## 4. Truthfulness
- **Pause wording** says calls "may still ring your saved contact cell". That matches the code: `voice-activation.mjs:423`'s `fallbackAllowed` includes `paused`, and the inbound route falls back when the desk is not `valid`. "Website chat, calls and texts are not answered" matches the paused gates.
- **Legal pages.** Release 5 changes no public HTML (only `desk.html` and `onboard.html`).
  - **SMS terms:** "A follow-up about a quote or request only if you reply to agree to it" is still true, because the Spanish text is the same single consented follow-up.
  - **Privacy:** "pause or stop service" is still accurate.
  - **Terms:** "Texts … go out in your business's name" is still true, because the Spanish texts start with the business name.
- **Spanish texts keep compliance wording:** the business name, STOP/ALTO, AYUDA, and no promotional content.
- **Outage emails** are accurate:
  - "Replies that could not be sent were not sent again" is proven in O1.
  - "only email … for <day>" is proven in O1 and O2.

## 5. Diff review (`git diff 2180487e HEAD --stat`)
The diff is 100 files. 32 are product or script files (+646/−123); the rest are qa-artifacts.

I read every server hunk:
- **`client.mjs`:** passes `through` and `label`; the CSV gains a trailing `language` column.
- **`calendar.mjs`:** `friendlyDate` `relative:false`, using an Intl date at noon UTC, so it gives the correct Chicago day.
- **`connection-journey.mjs`**
- **`desk.mjs`:** templates, `replyOutage` saved only on a stable action id, and monthly/weekly copy.
- **`managed-delivery.mjs`:**
  - the outage owner email returns before the per-record email;
  - the operator alert is a CAS once-per-day row with a retry gate;
  - the Resend fetch is bounded by `AbortSignal.timeout(min(5 s, remaining))` with `redirect:"error"`;
  - orphan removal is conditional on an exact-entry match and no live `entries[key]`.
- **`request-followthrough.mjs`:** exposes `language`.
- **`request-followup.mjs`:** `template()` is chosen by language.
- **`store.mjs`:**
  - the range is validated before the CAS, at most 31 days;
  - the label is limited to 60 characters with no `<`, `>` or control characters;
  - the 100-block cap is checked per day inside the CAS, so an over-cap range writes nothing;
  - unblocking rejects `through` and `label`.

On the client side, I checked that the block label and the Spanish tags are escaped (`esc(label)` in `renderAvailability`, and `esc(row.label)` in the calendar).

## 6. Findings (none blocking)
1. **P3: the outage owner email prints an ISO date** ("This is the only email about this for 2026-10-22"), while copy clarity moved owner emails to friendly dates. **Fix:** in `managed-delivery.mjs` `queueManagedRecord`, use `friendlyDate(saved.replyOutage.day, "en", { relative: false })` in that line.
2. **P3: focus lands on the "Skip to workspace" link after Account → Pause front desk.** The link becomes visible over the Account card (`receipts/walk/r5qa-account-paused-320.png`). I did not compare this with production. **Fix:** after `accountChange` settles, focus `#accountMessage` (with `tabindex=-1`).
3. **P3 (Spanish reviewer): the Spanish quote follow-up drops "one".**
   - "Este es el seguimiento que usted ha pedido" is "This is the follow-up you requested", while the English says "your one requested quote follow-up".
   - **Suggested:** "Este es el único seguimiento que usted pidió".
   - This needs the named human reviewer, like all FC2 Spanish.
4. **Note: the Spanish widget shows the shop's own saved greeting,** which may be English ("Hi! What can we help with today?"). That is expected, since the greeting is owner text.
5. **Note (carried for the legal/carrier owner): the permission question is English, and the Spanish follow-up runs under the existing campaign.**
6. **Ops note:**
   - **Email budget:** during a Twilio account outage, owner outage emails go through the managed email budget, at one per shop per day.
   - **Operator alert:** it bypasses that budget, at one per day.
   - **Send hold:** a hung operator send holds one delivery run for up to 5 s, at most once per 15 minutes.
7. **Not re-run here:** the author's `guided-walkthrough` 13/14 (which fails the same way on base) and `request-followthrough --phase visit-auth`. I did not test iOS Safari.
