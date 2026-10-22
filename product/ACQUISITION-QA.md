# Acquisition and unified setup QA

Independent QA, October 22, 2026. This review covers the short homepage entry, durable lead capture, verified continuation, optional email preference, one setup journey and protected inquiry exports. Billing stays off. These local checks do not establish production email delivery, real Netlify Blobs behavior, marketing performance or phone, text and calendar activation.

## API and identity acceptance

`scripts/acquisition-qa-check.mjs` runs the actual intake, access, onboarding and client handlers against both the in-memory store and the installed Netlify Blobs SDK with conditional responses supplied by a storage fixture. Provider credentials are removed, only a dummy Resend credential is present, and any transactional-mail attempt is intercepted. All other network access is denied. No actual email is sent.

The current receipt, [`scratchpad/acquisition-api-qa-projection-recovery.json`](../scratchpad/acquisition-api-qa-projection-recovery.json), passes **35/35 groups** with four conditional-write conflicts and stable runtime source hashes. It verifies:

- A successful public response follows durable prospect and handoff writes. A failed projection returns failure; retrying the same submission completes the missing records without duplicate capture or replacement.
- An opaque handoff cannot read an inquiry, establish an owner session or create a workspace. Proof for another email cannot adopt the original answers. Expired and consumed sign-in tokens fail.
- Same-email proof carries the original preliminary answers into the draft. Existing saved values, including an intentional blank, survive adoption and retries. Existing customer accounts are recovered without replaying anonymous answers over owner settings.
- An anonymous first capture cannot poison the identity presented as verified: a later legitimate owner's verified handoff supplies the exported display fields. Later public submissions cannot change existing identity, consent or suppression.
- Sign-in alone does not enroll a contact. An explicit authenticated preference is optional, can change from false to true, records its wording/version/history and cannot remove external suppression.
- A delayed earlier opt-in cannot override a later opt-out. If an opt-out's prospect projection fails, the authoritative draft already excludes that contact from the eligible audience; a stale opt-in row is insufficient.
- If an optional marketing projection fails after the draft is known to have committed, the handler returns the committed draft revision with `marketingPending: true`. The caller can retry that optional preference without stranding the questionnaire at a stale revision. Eligibility still fails closed.
- The owner can save requested connections in one workspace without activating a provider or changing unrelated configuration. Invalid, duplicate and unauthorized selections fail.
- All-inquiry and eligible-only exports require the admin key. Anonymous or suppressed contacts are excluded from the marketing audience. CSV values beginning with spreadsheet formula characters are neutralized.

Two early receipts are retained: `acquisition-api-qa-first.json` and `acquisition-api-qa-oracle-fix.json`. Their two returns came from QA expectations, first an extra `updatedAt: undefined` key in a comparison, then requiring 403 where invalid credentials correctly returned 401. The tests were corrected; no runtime patch was made to satisfy those returns. The 34-group `acquisition-api-qa-final.json` preceded the added failed-opt-out-projection case. The later `acquisition-api-qa-consent-final.json` passed 35 groups before the successful-draft/pending-preference response improvement; its old 503 expectation is retained in that evidence rather than relabeled as current behavior.

## Rendered journey acceptance

The independent browser review uses `scripts/acquisition-ui-qa-check.mjs`. It fulfills loopback page requests from the actual source files and invokes the actual handlers in the same isolated memory-store process. The private synthetic mailbox is read directly by the harness; no HTTP mailbox endpoint exists. One narrowly scoped access PUT uses the installed Blobs SDK storage fixture to reject the optional prospect projection and then returns its committed draft to the isolated memory state.

[`acquisition-ui-qa-current.json`](../scratchpad/acquisition-ui-qa-current.json) passes **49/49 groups** with stable source, no browser script errors and no server network requests. The observed journey covers:

- A labeled, keyboard-operable three-required-field entry at 320, 390 and 1440 pixels, with the goal optional and email updates unchecked.
- Failed capture, a lost response after actual durable capture, same-key retry and duplicate-submit prevention. Navigation occurs after the lead is saved; no email is sent automatically and no contact details remain in the URL.
- Explicit mailbox-link confirmation, original answers carried into full setup, reload recovery and one workspace with all selected connection preferences retained.
- Actual-handler optional-consent projection failure, a truthful pending message and a successful Continue retry using the committed draft revision. The visitor can affirm and withdraw the optional preference independently of setup.
- Early invalid-phone guidance. A separately labeled final named-field response fixture returns the visitor to that field without losing the other answers; the successful create uses the actual handler.
- One connection panel with preference saves and inactive-provider truth. Three stored-state presentation fixtures cover ready/active/available website chat, an active flag with unready rules, and a ready active flag with no remaining AI allowance. These fixtures are not real activation or model proof.
- Protected admin views, eligible-only versus all-inquiry CSV, the absence of a promised founder onboarding-call task for a new self-service account, and mobile access to inquiry columns.
- A different-email intake cannot attach to a previously signed-in owner's session. Signing out revokes that bearer and preserves the intended new email; proving the new mailbox restores only its own preliminary answers. An unavailable handoff-storage path also recovers through the opaque handoff and same-email proof.

The first rendered receipt, `acquisition-ui-qa-first.json`, returned three QA oracle/timing issues: the expected tab sequence omitted the legitimate Privacy link, the desktop font threshold incorrectly required the mobile 16-pixel threshold, and an admin assertion ran during “Loading inquiries.” The corrected `acquisition-ui-qa-final.json` passed 35 groups on its recorded earlier source. It predates subsequent real UI/UX returns and does not stand in for the 49-group receipt.

## Visual returns and bounded final proof

QA reproduced one real guided-navigation defect before taking any screenshot: the customer connection heading landed at **15.06–33.53 pixels**, behind the fixed header ending at **69 pixels**, after the actual “Choose your customer connections” action at 390 pixels. [`acquisition-guided-qa-before.json`](../scratchpad/acquisition-guided-qa-before.json) and its viewport image retain that return. After the pane scroll-margin correction, [`acquisition-guided-qa-final.json`](../scratchpad/acquisition-guided-qa-final.json) passes **4/4 groups**, including actual guided-action geometry at 390 and 1440 pixels.

The final static supplement, [`acquisition-visual-qa-cta-final.json`](../scratchpad/acquisition-visual-qa-cta-final.json), passes **20/20 groups**. Pricing cards and actions fit at 320, 390, 768, 900, 1024 and 1440 pixels. The tablet layout uses one column through 900 pixels, and the current intake remains contained at 390 and 1440. The mobile inquiry region can be focused and scrolled by real arrow-key events until its far-right email status is reached.

That supplement reverses exactly the two CSS additions and the two pricing CTA label/ARIA changes and reproduces the corresponding accepted 49-group source hashes. Every other recorded runtime file, including all handlers and browser JavaScript, is unchanged. This is a narrow source bridge with new visual checks, not a claim that the full journey was rerun after cosmetic changes.

`acquisition-visual-qa-current.json` retains an earlier keyboard measurement taken before scroll animation had moved the region. The final check waits for actual motion and reaches the end; no product patch was needed for that measurement. `acquisition-visual-qa-final.json` retains the accepted CSS stage before the last CTA wording change.

Readable clipped images use the `acquisition-visual-qa-cta-final-` prefix. They include `entry-form-390`, `entry-form-1440`, `pricing-320/390/768/900/1024/1440`, `first-step-stored-fixture-390` and `admin-email-status-390`. Visual-only element captures suppress the floating header, skip link and chat launcher during capture so those overlays do not obscure a tall element image. Guided-navigation viewport images and all geometry checks use unchanged rendered styles. The tall first-step image is explicitly a stored-state visual fixture; the 49-group journey supplies the actual capture/verification evidence.

## Release boundary

No deployment, actual customer signup, real email, AI request, provider call, purchase, campaign or billing change is included in this QA. A capture is an inquiry; a verified optional affirmative preference without suppression is an eligible audience record; an exported audience is not a sent campaign. Requested phone, text and calendar connections remain inactive until their separately verified operational paths exist.
