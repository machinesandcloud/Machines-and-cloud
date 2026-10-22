# Onboarding validation acceptance

October 22, 2026. Local frontend repair; publication requires a separate release authorization.

Submitting an incomplete step now highlights every missing or invalid field, places a specific message beside each field and focuses/scrolls to the first problem. Required inputs are marked. Existing hints remain linked for assistive technology, and invalid focused fields retain a readable red border in the light theme. Blank optional fields remain optional; a nonblank website must be a valid URL.

The form has one keyboard-submit path. Enter in a normal input validates and advances at most one step; Enter in a textarea remains a newline. Earlier answers are rechecked before workspace creation, including drafts restored directly to the last step. Server field errors open the correct step and preserve all answers. Invalid values remain marked while still invalid; unchanged server-rejected values remain marked until edited.

Answers can still autosave as partial drafts. While an explicit save/continue is pending, Back/Next are held; current values are revalidated afterward so editing a required answer during the save cannot bypass validation. Session-generation and revision fences are retained. No backend, service gate, provider routing or acquisition behavior is changed by this frontend repair.

Proof retained in private scratchpad:

- `onboard-validation-before.json`: original behavior, 0/4 visibility/all-field checks.
- `onboard-validation-candidate-first.json`: initial 9/13; three summary-only harness assumptions and one CSS-transition timing assumption, preserved.
- `onboard-validation-candidate-second.json`: independent 16/16 on stable actual assets, including delayed-save races, 375/1365px, visible linked error contrast, keyboard and server errors.
- `onboard-validation-independent-review.json`: source review, no blocker. The pre-existing401 path may try focusing a summary in a newly hidden form; the visible email gate still explains expiration.
- `onboard-validation-recovery-final.json`: 17/17 browser recovery checks.
- `onboard-validation-customer-first.json`: 51/52 actual-handler journey checks, returned stale inactive-channel wording assertion.
- `onboard-validation-customer-final.json`: 52/52 after checking the actual Connections labels.
- `onboard-validation-required-gate-final.json`: 25/25 required build commands, plus separate site/syntax checks.

All new tests use isolated local assets/API fixtures or actual handlers in memory. No real email, customer account, AI, call, text, Calendar change or hosted check was executed for this repair. These results establish local behavior only. The release candidate is based on deployed `b9f4578`; unpublished service-cleanup and access-link runtime changes are excluded.

The isolated production-base candidate repeats independent validation16/16, actual-handler customer journey52/52, recovery17/17 and all25 required build commands in `onboard-validation-isolated-*.json`. It also carries the existing one-line private sitechecker correction for `sms:` URI links; the production-base checker incorrectly treated those existing policy links as missing local files. The first sitecheck result is retained; the corrected sitecheck reports zero broken references. No deployed policy or link was changed.
