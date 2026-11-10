# Claude handoff: public sales chat (agent-widget.js)

Card: `AUTO-REVIEW-F501A715462FFFB7` (Sales PO). Claude claimed this existing, ready, unowned card; the claim is recorded in FROM-CLAUDE.md.

| | |
|---|---|
| Branch | `work/claude-sales-widget-20261110` |
| Worktree | `/tmp/mc-claude-sales-widget-20261110` |
| Base | `dfb0ae7846e66871d849c67566bf9d3b475f46ae` |
| Final source | the single commit adding this file |
| `agent-widget.js` | base `0d2e2cb6…3b3e`, final `023ecc06643d67f1b1d6e4750cb9aa292712acf02af940535b86b944cf07555e` |

The API contract, message semantics and saved failed-question behaviour are unchanged. Nothing was merged, pushed or published, and no provider calls were made.

## Original failures (base, 390 touch and 1440, keyboard)
1. **Focus fell to `<body>`.** Pressing Send, a suggestion, Retry or Stop hides that control (`:208`, `:295-298`, `:266`). The reverse also happened: a finished reply pulled focus away from a link the visitor was on (`:344`).
2. **Screen-reader noise.**
   - The conversation was a polite live log (`:54`), so every streamed fragment was read out, then the whole reply again.
   - Failures were read twice (`:56`, `:319`).
   - Reopening a chat re-read the whole history.
3. **Tap targets under 44px on phones.** Close was 32, New chat 33, and Copy, Retry, Save and Talk were 17–22px, under 24px even at 1440 (`styles.css:9170-9234`).
4. **No progress note** during an 85s slow reply.
5. **Esc during IME composition closed the chat** (`:243`), and Enter ignored keyCode 229 (`:254`).
6. **iPad zoom.** The composer was 14px above 600px wide.
7. **Placeholder contrast** was 4.14:1.

**Already correct at base:**
- honest modal semantics: `aria-modal`, the background made inert, Tab wrapping and Esc restoring focus;
- plain-language failure copy with Retry;
- no duplicate sends.

## Repair (agent-widget.js only)
- **Focus.** It moves only when the control the visitor was using disappears: to Stop while waiting, then Retry on failure, otherwise to the composer (Send on a coarse pointer, so the phone keyboard doesn't open over the reply). A click or a text selection inside the panel during a request is left alone.
- **Announcements.**
  - The conversation is a labelled region, not live.
  - One hidden status region announces each outcome once: working, still working after 15s, the final reply (capped at about 1,500 characters, with "The full reply is in the conversation") and failures.
  - Reopening restores history silently.
- **IME-safe** Esc and Enter.
- **Sizing.** A scoped `<style>` under `#mcAgent` (shared CSS was read-only for this card) gives:
  - 44px touch targets and a 16px composer on a coarse pointer or ≤600px;
  - a 24px minimum for the small buttons;
  - an AA placeholder (`#5d6b82`);
  - short-viewport spacing.

## Checks (offline; actual chat handler in-process; served sha256 pinned; `evidence/final/`)
| Check | base | 82159cfd (round 1) | final |
|---|---|---|---|
| `sales-widget-check.mjs` (Chrome and bundled shell) | 57/87 | 84/87 | **87/87** |
| QA probe `qa/qa-probe.mjs` (CSP, long replies, announce-once, exact focus targets) | | 9/9 | 9/9 |
| public-journey / sales-desk-ui / connector-pages | 925/926 / 48/50 / 55/55 | | same; failures pre-existing |
| sales-agent, sales-budget, sales-desk, agent-delivery, agent-error | pass | | pass |

**Independent QA: ACCEPT WITH NOTES.**
- **CSP.** `_headers` has no `style-src` on any page, so the injected style applies with zero violations.
- **Single injection.** The style is injected once, even if the script loads twice.
- **No flash** of unstyled content.
- **Long replies** stay reachable in the region.
- **Note 1 resolved.** It was a new focus pull after a click or selection during a request. It is verified by a required case that fails on 82159cfd and by QA's probe. There was no second independent pass.

## For Codex and the PO
- **Spanish chip.** "Hablemos en español" (`agent-widget.js:15`, pre-existing) is still offered, while the public-site branch's FAQ says Spanish is still under review. It only invites a Spanish conversation with our sales desk, but side by side they read as inconsistent. This is a PO decision.
- **"Ask the front desk."** The title could read as a human front desk; the subtitle says "AI adviser".
- **Rate limits (backend).** The daily-limit 429 sends `resetAt`, but the widget still offers Retry, which can't succeed. A busy 429 has no Retry-After.
- **Future CSP.** If CSP is ever tightened to `style-src 'self'`, move the injected rules into `styles.css` or add a hash.
- **Closed panel.** If the panel is closed mid-reply, that reply isn't announced. It is visible on reopen.

## Limits
- The phone keyboard, IME and screen-reader output are simulated or inferred from the DOM.
- Chromium only.
- Local acceptance only.
