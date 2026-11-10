# Claude follow-up handoff: lead setup step survives a new history entry

This is a follow-up to `AUTO-REVIEW-5AB9F71DBC8D74B6`, recorded as `followUp` on that card. The original handoffs (lead-continue `878916b7`, lead-dialog-tab `f3fcfa41`) are unchanged.

| | |
|---|---|
| Branch | `work/claude-lead-step-followup-20261110` |
| Worktree | `/tmp/mc-claude-lead-step-followup-20261110` |
| Base | `f3fcfa41`, stacked on lead-dialog-tab, which is stacked on lead-continue |
| Final source | the single commit adding this file |
| `desk-lead-sources.js` | was `ab87d366…`, now `8d1b0fbaddd8f1cf221cc52899a5f287b28187669773ed8882c223e45c2d0cd8` |

Nothing was merged, pushed or published.

## Original failure
This was found by the full new-owner journey on the combined preview (`combined-preview/journey/JOURNEY.md`, issue 1, HIGH).
- **Symptom:** Thumbtack lead notifications reached "Step 3 of 3", then Home, then "Continue setup", which restarted at "Step 1 of 3".
- **Cause:** the self-serve page lived only in `history.state.mcSelfServePage`. The desk-followup-port's `routeTo` uses `pushState({mcDeskPage})`, so routing from Home or a tab creates an entry without that state.
- **Reproduction:** base desk.js and lead-dialog-tab alone pass; combining with the port reproduces it.

## Repair (desk-lead-sources.js)
- **In-memory fallback.** A `reachedSelfServe` record holds the last page reached. It is scoped to the workspace, owner session and saved generation, and lives in this tab only.
- **Which value wins.** `history.state` stays authoritative when present, so in-dialog Back/Forward is unchanged. The fallback applies only while the row is still a prepared self-serve row.
- **When the record is reset:**
  - explicit restart (Set up lead notifications, or "instead");
  - replace key or disconnect;
  - any server sync where the row is no longer prepared or its generation changed;
  - session expiry.

## Checks (offline; served sha256 pinned; `evidence/final/`, QA in `qa/`)
`lead-step-continue-ui-check.mjs`, at 1440 and 390, served the port's desk files at run time. It covers resume from Home, resume via tabs, Back/Forward after a resume, and the reset after a disconnect.

| Combination | Result |
|---|---|
| old file + port desk.js | **2/8** (all six resume cases show Step 1) |
| fix + port desk.js | **8/8** (Chrome and bundled shell) |
| fix + base desk.js | **8/8** |
| old file + base desk.js | 8/8 |

**Regressions on the fix:**
- lead-source-continue 12/12
- lead-dialog-tab 6/6
- lead-source-reconnect 34/34
- connector-pages 55/55
- lead-source-unconfirmed 15/15
- **in the combined preview, with the fix copied in temporarily:** thumbtack-back 4/4, modal-back 12/12

**Independent QA: ACCEPT WITH NOTES.** QA's probe (6/6) found no stale or wrong step in any of these cases:
- another tab disconnects and sets up again, or replaces the key (new generation);
- a lost replace-key response;
- Back past the dialog's first entry;
- switching between Thumbtack and Angi, which also fixes an older reset bug present even on base desk.js;
- session expiry.

A different owner in the same tab is inert until reload, confirmed by reading the code.

## Limits
- **Tab-only memory.** The step is remembered only in this tab. A reload starts at Step 1; keeping it longer would need a server field.
- **Thumbtack only.** Thumbtack lead notifications is the only numbered flow.
- **Failed key replacement.** If a key replacement fails outright, the remembered step was already cleared, so Continue shows Step 1. That is the safe direction.
- Local acceptance only.
