# Claude handoff: lead-source setup dialog keyboard pass

Card: `AUTO-REVIEW-5AB9F71DBC8D74B6` (Angi PM). Claude claimed this existing, ready, unowned card; the claim is recorded in FROM-CLAUDE.md.

| | |
|---|---|
| Branch | `work/claude-lead-dialog-tab-20261110` |
| Worktree | `/tmp/mc-claude-lead-dialog-tab-20261110` |
| Base | `0982b756`: dfb0ae78 plus the handed-off lead-continue branch (`HANDOFF-LEAD-CONTINUE.md`). It is stacked on that branch, so integrate that one first. |
| Final source head | the single commit that adds this file (source and handoff together) |
| `desk-lead-sources.js` | base `836dcbb9…`, final `ab87d366d35ca4db1772b70ca72604ccfe4184ab98a2746f0f8b08e9727b5c3e` |

`desk-setup-guide.js` and `desk-setup-guide.css` are unchanged. Nothing was merged, pushed or published, and nothing on the provider or backend side changed.

## Original failures (base, both engines, 1440 and 390, every step of Angi, Thumbtack lead notifications and the Thumbtack partner route)
1. **Tab leaves the dialog.** Tab past the last control, or Shift+Tab past "Exit setup", lands on `<body>` with `document.hasFocus()===false`. In Chrome 156 this happens once per direction; in headless shell 148 it happens on every lap. `showModal()` makes the page inert but doesn't keep Tab inside the dialog.
2. **Esc drops focus to `<body>`** after any save step (Angi request/waiting, notifications page 3, partner waiting). The page behind the dialog re-renders the opener `#setupGuideContinue` while the dialog is open, and `close()` only refocused the original node.

## Repair (desk-lead-sources.js)
- **Focus stays in the dialog.** The dialog's Tab handler wraps from the last control to the first, and Shift+Tab from the first to the last. Disabled, hidden and inert controls are skipped, and focus starting on the heading is handled. Esc, Enter, Space, form submit and in-dialog Back are unaffected (QA-probed).
- **`close()` → `returnTarget()`.** Focus goes to the first of these that is connected, enabled, rendered, visible (`checkVisibility`) and not inert:
  1. the opener;
  2. its same-id replacement;
  3. the same card button;
  4. the visible step heading;
  5. the page title.

## Checks (`evidence/final/`, plus `evidence/final/lead/` for the final run; served sha256 pinned; offline)

| Check | 0982b756 | final |
|---|---|---|
| `lead-dialog-tab-ui-check.mjs` (new), shell 148 / Chrome 156 | 0/6 / 0/6 | **6/6 / 6/6** |
| QA probe `qa/tab-qa-probe.mjs` | | **16/16**: 12/16 before the lead's visibility and page-title fallback; the 4 failures were QA's stricter-than-design cases |
| `lead-source-continue-ui-check.mjs` | | 12/12 |
| `lead-continue/qa/continue-qa-probe.mjs` | | 8/8 |
| `lead-source-reconnect-ui-check.mjs` | | 34/34 |
| `connector-pages-ui-check.mjs` | | 55/55 |
| `lead-source-unconfirmed-ui-check.mjs` | | 15/15 |

**Independent QA: ACCEPT WITH NOTES.**
- **Note 2** (the return target had no visibility check) and **note 3** (no fallback left when the heading opener is gone) are resolved by the lead after QA. QA's own probe verifies them (16/16); there was no second QA pass.
- **Note 4** is about the check's own same-id assertion; the probe's clone and removal cases cover it.

## For Codex: consistency decision (QA note 1)
This is now the only native `<dialog>` in the desk that keeps Tab inside, matching the WAI-ARIA dialog pattern. These don't:
- `#leadDiscoveryDialog`;
- visit, support, phoneCancel, cancelBox and guide dialogs (`desk.js`);
- requests, conversations, connections and billing dialogs;
- `admin.js` actionDialog.

In headed Chrome the base behaviour reaches the browser's own UI, which is native and arguably acceptable. Choose one of:
- (a) a shared helper applied to all desk dialogs, which Claude can do as a follow-up card;
- (b) record this as a deliberate exception;
- (c) revert the Tab wrap and keep only the Esc focus fix.

## Limits
- Headless only.
- `#leadDiscoveryDialog` was not changed.
- Local acceptance only.
