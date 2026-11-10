# Claude handoff: customer website chat widget (embed.js)

Card: `AUTO-REVIEW-19E8A4B124CFE101` (Connector squads PO). Claude claimed this existing, ready, unowned card; the claim is recorded in FROM-CLAUDE.md.

| | |
|---|---|
| Branch | `work/claude-chat-widget-20261110` |
| Worktree | `/tmp/mc-claude-chat-widget-20261110` |
| Base | `dfb0ae7846e66871d849c67566bf9d3b475f46ae` |
| Final source | the single commit adding this file |
| `embed.js` | base `43cc96c98ff22f79ccc873b779d2414cf01682cdc3dea62d5f4d2ca21595634d`, final `c2377c36abb0dd0f598c47eca308cc727c62fc60272857a5aadcc954abb5344b` |

The API contract, how the API origin is derived from the script address (`:12`), message semantics and the unsent-message hold are unchanged. No new copy claims a message reached the business, and all CSS stays scoped to `#mcDesk`. The JSON receipts and scripts are committed; most screenshots stay in the worktree. Nothing was merged, pushed or published.

## Original failures (base, 390 phone emulation and 1440)
1. **Config is read only once** (`:117-129`). A single 503 or network failure on `/api/client` left chat unavailable for the whole visit, with no retry. `unavailable()` also overwrote `cfg.greeting`.
2. **No screen-reader announcements.** There was no persistent live region, so replies weren't announced.
3. **Focus.** Tab escaped the panel mid-flow, and with failed config, focus stayed on the launcher.
4. **Phone keyboard covered the panel** (`:35/:55`). The composer was hidden.
5. **iOS zoom.** The input was 14px and the select 12px.
6. **Close button was 25×24px.**
7. **Enter sent mid-IME-composition** (`:136`).

## Repair
- **Config retry.**
  - **When:** retries start only after the customer has opened chat. The open read is followed by at most 3 automatic retries (4/12/25s, ±20% jitter). Opening chat and the `online` event trigger at most one read per 5s while config is failing.
  - **Definite outcomes:** a definite "no" (webAvailable false, paused, cancelled, 404) shows no retry, and a retry can never turn a disabled widget back on.
  - **Config 429:** backs off by Retry-After, clamped 30s to 10 minutes (60s by default). "Try again" is unavailable only while a read is running, and the copy promises a retry only while one is actually scheduled. A chat 429 never re-reads config.
- **Announcements.** One persistent polite status region announces the final reply, the interrupted-outcome message and the config state. Streamed partial text is not announced.
- **Non-modal dialog.** `role=dialog`, `aria-label="Chat"`, no `aria-modal`, no Tab trap, and the host page is not made inert.
  - Focus goes into the panel on open, unless the customer moved to the host within 50ms.
  - Esc (not mid-IME, including keyCode 229) closes and returns focus to the launcher.
  - Tab order is Close, textarea, Send, then the host page.
  - Focus is re-homed only when the control the customer last used in the panel disappeared or was disabled. Focus on the host page, including `<body>`, is never taken.
- **Phone keyboard.** visualViewport-based resize/lift while open; nothing is written while closed.
- **Sizes.** 16px input and select; 44×44 Close; visible focus outline.
- **IME.** Enter is ignored while `isComposing` or keyCode 229.

## Checks (offline; served sha256 pinned; `evidence/final/`)
| Check | base | 8fed0599 (round-2) | final |
|---|---|---|---|
| `chat-widget-ui-check.mjs` | 9/32 | 28/32 | **32/32** |
| QA probe `qa/qa-probe.mjs` (round 1) | | | no focus steal, bounded reads, definite-no sticks, no resend |
| QA probe `qa/round2/qa2-probe.mjs` (shadow DOM, iframe, fake-clock 429) | | stranding repro | no stranding; copy honest at 70 min and 2 h; focus kept in every case |
| `widget-setup-refresh` / `conversation-history-ui` / `connector-pages` | | | 8/8 / 12/12 / 55/55 |

## Independent QA
- **Round 1: REJECT.** Two blockers:
  - a retry pulled focus from the host page into the textarea;
  - `aria-modal` was claimed while the host page was not made inert.

  QA confirmed no host interference while closed, no availability flip and no resend.
- **Round 2: ACCEPT WITH NOTES.**
  - A config 429 could strand the customer with false copy and a disabled button.
  - The fixture exposed Retry-After, which production doesn't.
  - Focus on open had a 50ms window.
- **Round 3** (the notes, plus a host-script blur case found by QA's probe) was verified by QA's own probes and new required cases. There was no third independent pass.

## For Codex
- **Older workspaces re-run the agent (backend).** On older-style workspaces, "Check previous reply" (`recoverTurn`) doesn't resume a saved turn: `chat.mjs` (~138) only does that for self-service workspaces, so the agent runs again (saved customer messages went 1 to 2).
- **Retry-After is unreadable cross-origin.** `/api/client` doesn't send `access-control-expose-headers: Retry-After`, so the widget always uses its 60s default for a config 429. Today's public `/api/client` never returns 429.
- **No live self-service workspace offline.** With `MC_FAKE_MODEL=1`, `setupReadiness` blocks website chat for self-service workspaces, so the happy path uses an older-style workspace.
- **Stale suites (same at base):**
  - `widget-stream-check` expects the composer to re-enable after an interrupted reply.
  - `customer-budget-ui` stalls on an unrouted billing call and a missing `#testLink`.
  - `appointment-texts-ui` needs full Chromium; it passes 9/9 on the headless shell.

## Limits
- **Simulated input.** The phone keyboard, IME composition and screen-reader output are simulated or inferred from the DOM.
- **Engines.** Chromium with a phone viewport and an iPhone user agent, not real Safari.
- **Fake clock.** Long 429 waits ran on Playwright's fake clock.
- **Open/close storm.** It gives about 14 reads/minute, which is the 5s spacing.
- Local acceptance only.
