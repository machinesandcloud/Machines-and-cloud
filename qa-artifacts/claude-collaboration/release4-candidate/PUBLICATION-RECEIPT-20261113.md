# Release 4 publication receipt — 2026-11-13 10:01 CST

- Pushed: non-force fast-forward origin/main c470c7a7 -> 2180487edb8a9fef94c877e1aea255ad4d71cb9d (one push, one automatic build).
- Netlify: deploy 6af7339893a64e9796956d03, getSite.published_deploy READY at exact commit, published 2026-11-13T16:01:04Z.
- Authority: owner's release grant; independent release QA GO (qa/RELEASE-QA.md): gate 72/72 incl. fan-out hour, healthy SMS path byte-identical, 13 failure probes pass, browser walk clean.
- Read-only checks (6 GETs): /, /onboard.html, /desk.html, /admin.html, /privacy-policy.html 200; /api/health 200 ok:true, no failing blocks (last scheduler run 16:00:19Z, before publication; post-release run not yet observed at check time).
- Not performed: provider writes, sends, settings changes.
- Follow-ups (release 5): orphaned failure-index entries can starve the owner-alert sweep; account-wide Twilio failure should alert the operator once instead of per-customer owner emails.
