# Stale UI suite triage (base 9ca04d71, 2026-11-09)

All results come from a pristine detached worktree at base 9ca04d71, not from the in-progress edits. The worktree was removed afterwards.

**Browser.** The final results use bundled headless Chromium 148 (`chromium_headless_shell-1223`). Each script had one change, in the triage copy only: its launch line swaps `channel: 'chrome'` for `executablePath: '<headless shell>'`. No assertion or fixture was edited. An earlier pass of all nine reserved suites used Google Chrome, before the coordinator's no-Chrome rule arrived. Its counts were identical to the headless pass except complete-connections: Chrome gave 9/46, headless 12/46. In Chrome the three "handoff outcomes" checks failed with "element is not attached/stable"; on headless they passed. That is a browser-timing flake, not drift. Receipts are in `scratchpad/triage/` (Chrome receipts in `scratchpad/triage/chrome-run/`).

Key to the Class column: (a) fixture drift; (b) obsolete assertion against a redesigned UI; (c) possible real product regression.

| Suite (last edited) | Pass | First-failure cause | Class | Went stale | Still covered by a passing suite? |
|---|---|---|---|---|---|
| complete-connections-ui-qa-check (10-24) | 12/46 | Waits for `.connection-guide-card`, `#connectionPreferences input`, `[data-journey-choose]`, `[data-connection=review_setup/start_calendar/check_status]` and `#phoneSetupCard`. All of these are now hidden. The desk shows a "Your connections / Choose a service" list of `[data-guide-service]` buttons (desk-setup-guide.js `renderOverview`) that opens one connector page at a time, and desk-setup-guide.css hides `#phoneSetupCard`/`#connectionPreferencesDetails` under `body[data-connector-flow]`. | b | 037b7099 (10-27) | The website-editor checks pass in this suite (save/cancel, invalid, slow save, blank origin), as do paused/cancelled and handoff. Phone, text, Calendar and channel-choice save/recovery have **no** passing UI coverage. |
| connection-journey-ui-check (10-23) | 0/7 | /api/workspace-billing is not routed, so the desk falls into sign-in recovery. Past that, it waits for `.connection-guide-card`. | a + b | 47e3c641 (10-23, billing call); 037b7099 (10-27) | Partly. Its tour-not-automatic assertion is held by guided-walkthrough (14/14) and by customer-onboarding's passing check "Returning owner reaches actual setup guidance without a blocking tour". The four-channel paths are uncovered. |
| customer-onboarding-ui-check --phase full (10-24) | 38/39 + fatal | Check failure: voice/sms `.connection-guide-card` not visible (same redesign). Fatal: `#availabilityDate` is hidden. Schedule is now a calendar (desk-calendar.js) with day-panel "Add visit"/"Block time" buttons, and the old forms sit in the collapsed `<details id=scheduleHistory>` and "Manage blocked time" disclosures. | b | 037b7099 (10-27); 7eb22fd8 (10-26, Schedule) | Onboarding resume, lost create response, returning owner, guide and review/test all pass inside this run. Blocked time and visits through the Schedule UI are uncovered (owner-availability-check --browser fails the same way on `#newVisit`; its 9 handler checks pass). |
| guided-walkthrough-ui-check (10-26) | 14/14 | n/a | n/a | n/a | Current. |
| phone-onboarding-ui-check (10-22) | 1/2 | Waits for `#guideDialog` to auto-open after sign-in. The tour is no longer automatic; it opens only from "Quick tour". | b | 811e8caf (10-23) | Phone handlers: phone-activation 63/63, voice-activation 119/119, service-onboarding-qa 58/58. The phone **UI** journey is uncovered. |
| portal-journey-ui-check (10-22) | 21/22 | Same `#guideDialog` auto-open wait, on the owner page after the admin part. | b | 811e8caf (10-23) | The admin portal checks before it pass (21). The owner tail is not reached; experience-admin-check 32/32 covers admin save/lost-receipt recovery. |
| service-connections-ui-check (10-22) | 1/13 | Owner side: `[data-connection=review_voice]` is not visible; voice/SMS review now goes through connector pages. Admin side: `customerView()` returns 2 conversations, not 3, so the summary is not "Conversations (3 recent)". The fixture writes the web thread at the legacy key `slug/web-contact`. Since 811e8caf, self-service conversations are read only from `slug/<tenant>/`, the same prefix as lib/desk.mjs, store.mjs and support-reports.mjs. The forged-calendar check expects an empty hash; the desk routes to `#setup`. | b (owner); a (admin) | 811e8caf (10-23); 037b7099 (10-27) | SMS history and dedup at handler level: managed-sms-qa 37/37, conversation-history-check pass. The admin SMS records UI, the Calendar return/forged-state UI and session-expiry/late-response UI in connections are uncovered. |
| service-onboarding-connections-ui-qa-check (10-26) | 12/16 | Submit is blocked by native validation, so no POST is sent. Required `businessIndustry` gets its options only from `data.serviceIntake.sms.businessIndustries` (e1bc00df, 10-28), which this fixture DTO lacks. Required `state` is also unfilled. A probe that only fills those fields gives **16/16**, including all three lost-response checks. | a | e1bc00df (10-28) | The approval lost-POST, lost-read and absent-receipt recovery logic **works at base** (probe), but no passing suite holds it as written. API side: service-onboarding-qa 58/58. |
| service-onboarding-ui-qa-check (10-22) | 17/21 | The error border is `rgb(165,38,27)` (#a5261b), but the test expects #b42318. The completion CTA reads "Continue my connections" (to `#setup`), but the test expects "Review my front desk". | b | 7eb22fd8 (10-26, colour); 811e8caf (10-23, CTA) | onboard-recovery-ui-check 59/59 covers onboarding field errors and focus. Error-colour contrast is not asserted anywhere current. |

Related suites run for replacement coverage (all at base):
- **Pass:** request-followthrough-ui 12/12; onboard-recovery-ui 59/59; experience-admin 32/32; workspace-billing 49/49; paid-service-authority 47/47; widget-setup-refresh (website chat embed) 8/8; and these handler checks:
  - service-onboarding-qa 58/58; service-onboarding; service-intake
  - messaging-activation 54/54; managed-sms-qa 37/37
  - calendar-connection; calendar-self-service
  - connection-journey-check; lead-connections-check
  - self-service-ai; website-installation 18/18; conversation-history
- **Also stale (b):**
  - experience-ui 2/9: old setup selectors.
  - experience-tours 1/17: per-connector tours, including Thumbtack/Angi direct-connect lost-URL recovery.
  - lead-sources-independent-ui 0/13: `#leadSources` is now hidden behind connector pages.
  - owner-availability --browser 9/11: `#newVisit` is in the collapsed history.
  - lead-sources-independent-check 30/31: it expects 20 recovered in one wave, but 58c1f9f6 (11-04) caps recovery at 10 per source per wave. Fair recovery is covered by lead-connections-check.

## (c) items
None confirmed. Two findings were checked and are not regressions:
- **Lost-response recovery.** The approval recovery copy ("could not confirm whether", "latest progress could not be checked") exists in desk-connections.js:268. With the two required fields filled, all recovery checks pass, so the failures are fixture drift.
- **Admin conversation count.** The web thread is dropped because of tenant isolation. The owner desk reads the same prefix, so this is consistent and not a UI bug. Open question for Engineering: self-service web history written before 811e8caf at `slug/<contact>` is invisible to both owner and admin. Confirm this is intended.

## Essential coverage now missing (blocks the affected claims)
- **Phone, text, Google Calendar (UI):** no passing browser suite drives the current connector pages (`[data-guide-service]` → connector page → review/approve, Calendar consent/return, check status). Handlers are covered.
- **Thumbtack, Angi (UI):** lead-sources-independent-ui (0/13) and experience-tours (1/17) are both stale. Handler coverage passes (lead-connections-check); lead-sources-independent-check 30/31 has one stale assertion.
- **Lost-response recovery (connections UI):** service approval (proven working only by a probe), website-save lost response (complete-connections), preference save 409/503/network, and Thumbtack lost direct-connect URL. None is held by a passing suite. The request-action and admin lost receipts are covered (request-followthrough, experience-admin), as is onboarding create (customer-onboarding checks pass).
- **Schedule UI (visits/blocked time, Calendar free-time):** uncovered in the browser.
- **Website chat:** covered. The embed is covered by widget-setup-refresh 8/8; the settings editor passes inside complete-connections; the handler by website-installation and self-service-ai.
- **Onboarding resume:** covered by onboard-recovery 59/59 and by the passing resume checks in customer-onboarding, although that suite as a whole fails on the two items above.

## Commands
Setup: `git -C /tmp/mc-claude-customer-journey-20261109 worktree add --detach $S/triage-base 9ca04d71018855a13a47a29410d14d6d76695582` and `ln -s /tmp/mc-claude-customer-journey-20261109/node_modules $S/triage-base/node_modules`. Here `S=/private/tmp/claude-501/-Users-stevengoumnai/bb2b640e-7b18-457e-a6a2-5f7dc74f6ad1/scratchpad`.

Launch substitution, applied in the copy only (diff saved in `$S/triage/launch-substitution.diff`): `perl -pi -e "s#channel:\s*['\"]chrome['\"]#executablePath: '$EXE'#g" scripts/<suite>.mjs`, with `EXE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`.

From `$S/triage-base`, with `PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs`:
```
node scripts/complete-connections-ui-qa-check.mjs --playwright $PW --output scratchpad/triage-hs-complete-connections.json
node scripts/connection-journey-ui-check.mjs --playwright $PW --output scratchpad/triage-hs-connection-journey.json
node scripts/customer-onboarding-ui-check.mjs --phase full --output scratchpad/triage-hs-customer-onboarding.json
node scripts/guided-walkthrough-ui-check.mjs --playwright $PW --output scratchpad/triage-hs-guided-walkthrough.json
node scripts/phone-onboarding-ui-check.mjs --output scratchpad/triage-hs-phone-onboarding.json
node scripts/portal-journey-ui-check.mjs --output scratchpad/triage-hs-portal-journey.json
node scripts/service-connections-ui-check.mjs --output scratchpad/triage-hs-service-connections.json
node scripts/service-onboarding-connections-ui-qa-check.mjs --output scratchpad/service-onboarding-qa-connections-triage-hs.json
node scripts/service-onboarding-ui-qa-check.mjs --output scratchpad/service-onboarding-qa-ui-triage-hs.json
node scripts/request-followthrough-ui-check.mjs --playwright $PW --output scratchpad/triage-hs-ref-followthrough.json
node scripts/onboard-recovery-ui-check.mjs --output scratchpad/triage-hs-ref-onboard-recovery.json
node scripts/experience-ui-check.mjs --playwright $PW --output scratchpad/triage-hs-cand-experience-ui.json
node scripts/experience-tours-check.mjs --playwright $PW --output scratchpad/triage-hs-cand-experience-tours.json
node scripts/experience-admin-check.mjs --output scratchpad/triage-hs-cand-admin.json
node scripts/lead-sources-independent-ui-check.mjs --output scratchpad/lead-sources-independent-ui-triage-hs.json
node scripts/owner-availability-check.mjs --browser --output scratchpad/triage-hs-cand-availability.json
node scripts/workspace-billing-check.mjs --playwright $PW --output scratchpad/triage-hs-cand-billing.json
node scripts/paid-service-authority-check.mjs --playwright $PW --output scratchpad/triage-hs-cand-paid.json
PLAYWRIGHT_MODULE=$PW node scripts/widget-setup-refresh-check.mjs --output scratchpad/triage-hs-widget.json
node scripts/service-onboarding-qa-check.mjs --output scratchpad/service-onboarding-qa-triage-hs.json
node scripts/phone-activation-check.mjs --output scratchpad/triage-hs-h-phone.json
node scripts/voice-activation-check.mjs --output scratchpad/triage-hs-h-voice.json
node scripts/messaging-activation-check.mjs --output scratchpad/triage-hs-h-messaging.json
node scripts/managed-sms-qa-check.mjs --output scratchpad/triage-hs-h-msms.json
node scripts/lead-sources-independent-check.mjs --output scratchpad/lead-sources-independent-triage-hs.json
node scripts/{service-onboarding,calendar-connection,calendar-self-service,connection-journey,service-intake,self-service-ai,conversation-history,website-installation,lead-connections}-check.mjs
```
Probes (scratch copies only; the original scripts are unchanged):
- `$S/triage/probe-approval.mjs` is the approval suite plus one fill of `businessType`/`businessIndustry`/`jobPosition`/`state`. Result: 16/16.
- `$S/triage/probe-admin-history.mjs` reruns the service-connections fixture setup and prints the `customerView()` conversations: 2 SMS, web dropped.

Cleanup: `git -C /tmp/mc-claude-customer-journey-20261109 worktree remove --force $S/triage-base`.
