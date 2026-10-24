# Google data-access verification draft — corrected preparation, October 24

Not submitted. This isolated draft preserves the prior recorded Console status: Machines & Cloud branding verified, data access not verified. No current Console inspection was performed for this correction. The existing preparation form already lists exactly the two scopes below; its required demonstration video is missing. Do not click Confirm before the evidence and final owner review are complete.

## Scope justification

Machines & Cloud lets a signed-in business owner connect their existing primary Google Calendar. calendar.calendars.readonly reads the primary calendar's identifier and settings. calendar.events.owned reads busy intervals to reject conflicting arrival windows and creates, verifies, updates and deletes visit events managed by that owner's workspace. Availability processing retains event references, start/end times and ownership tags, not unrelated event titles, descriptions or attendee identities. Read-only event access cannot save visit changes; calendar.app.created cannot update the owner's existing primary calendar. Google API responses and OAuth tokens are not sent to our AI provider. The refresh token is encrypted. Disconnect removes it and stops new sync while keeping existing events and Google's app grant. Deterministic tenant-bound IDs and ownership checks restrict changes to managed events.

## Existing verified branding

- App: Machines & Cloud front desk.
- Support/developer contact: ngoumnaisteve@gmail.com, approved by Steve for temporary public use.
- Home: https://www.machinesandcloud.com
- Privacy: https://www.machinesandcloud.com/privacy-policy.html
- Terms: https://www.machinesandcloud.com/terms-of-service.html
- Authorized domain: machinesandcloud.com.
- Requested scopes: `calendar.calendars.readonly` and `calendar.events.owned`.

The currently saved justification incorrectly says the app does not read free/busy or unrelated events. Replace it with the draft above when adding the completed video. No new scope, branding change or review submission was made in this inspection.

## Demonstration still to prepare

Google’s current requirements call for a YouTube Studio upload with **Unlisted** visibility, an English demonstration of the OAuth grant/consent experience, the correct app name, the consent-page address bar showing the real OAuth client ID, and functionality using each sensitive scope. Google Sign-In footage applies only if the app uses it. Machines & Cloud uses an emailed sign-in link; Google separately grants Calendar access. [Official video requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

Use the actual current app, one freshly authorized capture phase and synthetic customer/visit details. Record the app’s access explanation and Connect action. Leave chooser, password and MFA off camera. On the exact owned stationary Google permission pages, show the English descriptions, scope selections, final grant control and readable address-bar client ID. The client ID must not be cropped out or replaced with a mock URL.

Stop and confirm file finalization before callback navigation; the owner completes that grant action off camera. Label the cut and then show the actual granted app return. This edit is a proposed privacy measure, not an explicit exception in Google’s instructions. If the completed video does not clearly demonstrate the whole grant, keep it incomplete and review a safe alternative; do not claim Google will accept it.

In the app, show the connected primary Calendar’s identity/time zone for `calendar.calendars.readonly`. For `calendar.events.owned`, show checked availability and the same synthetic managed visit successfully created, moved and cancelled with matching delivery results, then disconnect. Keep personal event titles, descriptions, attendee identities and calendar grids off screen. A saved/queued status or refused move cannot substitute for successful provider delivery. [Calendar permission meanings](https://developers.google.com/workspace/calendar/api/auth).

Finish cleanup and review the entire local export, including cuts and boundary frames, before upload. Confirm any displayed state/nonces are consumed or expired, and exclude passwords, MFA, authorization codes, tokens, client secrets and unrelated windows. Root arranges the separately authorized upload of that exact reviewed file through YouTube Studio as Unlisted, verifies reviewer access and supplies the resulting YouTube link. No video exists or has been uploaded yet.

Root must first diagnose the owner’s exact current sign-in/consent issue and confirm the owner is ready before starting a fresh expiring handoff. The current authorization builder does not force English; actual English screens are a capture precondition. This preparation changes no app request or Console setting.

Final verification attestations remain with Steve after the complete draft and real video are reviewable. Do not invent a video link, test password, active Google-user count or approval date. Thumbtack’s roughly100 business customers are not a Google app-user count. The corrected capture procedure is `GOOGLE-VERIFICATION-CAPTURE-PROCEDURE-2026-10-24.json` in this isolated preparation directory; no active proof scope is amended.
