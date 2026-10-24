# Google data-access verification draft — October 24

Not submitted. Cloud Console confirms the Machines & Cloud branding is verified and data access is not verified. The existing preparation form already lists exactly the two scopes below; its required demonstration video is missing. Do not click Confirm before the evidence and final owner review are complete.

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

Use synthetic customer details and the actual current app. Show the signed-in owner's access disclosure, Google's scope review without recording passwords, MFA or authorization codes, the connected primary calendar, privacy-preserving available windows, one saved visit created, successfully moved and cancelled, delivery receipts and disconnect. Exclude personal event details and credentials. The actual October24 test accepted a grant and naturally scheduled creation/deletion; its attempted move was refused as conflicting and cannot stand in for successful move footage.

Provide a real reviewable video URL after the demonstration is complete. No video has been uploaded. Prepare a privacy-reviewed video with synthetic customer details and a real accessible URL as part of the authorized publication work. Final verification attestations remain with Steve after the completed application is reviewable. Do not invent a link, test password, active Google-user count or approval date. The roughly100 business customers supplied for Thumbtack are not a Google app-user count.

Google requirements: [sensitive-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [verification FAQ](https://support.google.com/cloud/answer/13463817?hl=en).
