# Claude handoff: optional desk/onboarding batch ported onto dfb0ae78

This repairs the optional batch per FROM-CODEX.md, "Optional follow-up review returned for later repair". The original branch `work/claude-customer-journey-2-20261109` (`0e818f9b`/`b77cc8df`) is unchanged; nothing was rebased.

| | |
|---|---|
| Branch | `work/claude-desk-followup-port-20261110` |
| Worktree | `/tmp/mc-claude-desk-followup-port-20261110` |
| Base | `dfb0ae7846e66871d849c67566bf9d3b475f46ae` |
| Final source | the single commit adding this file (source and handoff together) |
| Recorded on | card `AUTO-REVIEW-E9F1BCAD82C2BC0D` `followUp` |

Final sha256:

| File | sha256 |
|---|---|
| desk.js | `6fcc6ebabf86421e958fcf5bbf62e5e20b294f59420055aa945aa6c958761b84` |
| desk.html | `e6e75e9ca26f880568119cb135e034445a4e42a37538f61c20e240f3feb96113` |
| desk.css | `f8d007462ef5ba11e0fd1979d54a3c275b6456310862d16f2ba0723dff3fb790` |
| onboard.js | `4eb76ed91e2cd5f93e3de4b2828f340fd3f65a8806196af5e7fc9cd148bbf3ab` |
| onboard.html | `0e4b2a766f2b70c41930a635c5433f5c284168ec48ea5dbab82a6815bcf450ca` |
| onboard.css | `b24b7abd16708d492425120b577c06e997cf478912f727c0154e152850e3bee9` |

`RECEIPTS-INDEX.json` lists every product, check, variant and receipt hash. The final lead reruns are in `receipts/final/lead/`.

Nothing was merged, pushed or published. There was no provider or backend change.

## Codex's two conditions
1. **dfb's newer work is preserved.** That covers `cfgWebImpact`/`cfgWebNext` and every call site: the website-status impact, `reviewState`, `cfgStatus`, `cfgSavedMessage` and the dirty-save warning in `cfgSaved`.
   - QA round 1 verified it mechanically. The worktree diff against `0e818f9b` equals dfb's own `42e3ab4d..dfb0ae78` change plus the modal fix, with no batch or dfb hunk dropped.
   - A causal case checks that the website warning still shows. It fails on `0e818f9b`.
2. **One modal/navigation policy** (`desk.js` ~306–354). popstate and hashchange both call `deskModalHold()`. While a desk-owned dialog is open, Back and Forward keep the dialog and the owner's typed input, and don't route the page underneath. The desk-owned dialogs are visit, support, conversation, cancelBox, phoneCancel and billingCancel.
   - **How it returns:** with the Navigation API, `navigation.traverseTo(heldKey)` goes back to the entry the dialog opened on. It adds no history entry, so Chrome's skip-on-Back intervention doesn't apply. One return is in flight at a time, with a 250ms re-check and a cap of 12 retries.
   - **Without the Navigation API**, a `pushState` fallback is used.
   - **Rewrites while held:** same-document `replace` rewrites of a non-held entry are cancelled while a held dialog is open. Cross-document navigation is never cancelled (QA round-3 note 1, applied by the lead).
   - **Other dialogs:** lead-source, connection, request and tour dialogs manage their own history and behave as at dfb.
   - **`routeTo`** now adds the history entry before showing the page. This fixes a bug found along the way: the calendar used to write its date/view params onto the page the owner had just left.

## Independent QA: three rounds
| Round | Verdict | Finding | Resolution |
|---|---|---|---|
| 1 | REJECT | The hold `pushState`'d a stale URL inside popstate, breaking in-dialog Back for the Thumbtack self-serve steps. | Allow-list plus Navigation API return. |
| 2 | ACCEPT WITH NOTES | Wrong-entry races: R11/R12 (double Back while busy), R2 and R6. | Key-based `traverseTo`, rewrite guard, `routeTo` order. |
| 3 | ACCEPT WITH NOTES | The navigate cancel was too broad. | Restricted to same-document by the lead. Also: the cap-hit desync (could only be forced), the no-Navigation-API rewrite gap (same as before), and pre-existing items. |

The Thumbtack Back expectation in `thumbtack-back-ui-check.mjs` follows dfb: the third Back exits to `#setup/thumbtack/intro`. Round 2 verified dfb fails QA's original expectation identically.

## Checks (headless Chrome `channel:'chrome'`, temp profile; offline; served sha256 pinned)
| Check | Result |
|---|---|
| desk-followup (port copy) | 25/25 |
| modal-back (QA desk probe plus R2/R6/R11/R12) | 12/12; 9/12 on round-2 bytes |
| thumbtack-back | 4/4 |
| QA race probe `qa/round2/hold-race-probe.mjs` | 14/14; no-Navigation-API 11/14, no worse than before |
| QA route probe `qa/round3/route-nav-probe.mjs` | 16/16 |
| desk-a11y | 47/47 |
| onboard-followup / onboard-a11y | 137/137 / 113/113 (onboard files unchanged since) |
| connector-pages | 55/55, 0 expected failures |
| lead-source-reconnect | 34/34 |
| request-followthrough, save, daily, hours, create, onboard-recovery | 12/12, 29/29, 12/12, 116/116, 111/111, 59/59 |

The lead's final rerun after the same-document tweak covered route, race, modal-back, follow-up, desk-a11y and thumbtack-back. Everything else is from QA round 3 on the immediately prior bytes.

## Limits
- **No Navigation API** (Firefox, older Safari): Forward history is lost after the hold, and a replace of the held entry doesn't update the hold.
- **Leaving the desk:** Backs that pass the first desk entry leave the document. That includes very fast bursts, and Back from the first entry with a modal open.
- **Cap hit:** if all 12 retries are refused, the URL and page stay out of step. QA could only produce this by forcing every traversal to be refused.
- **Pre-existing:**
  - calendar params carry into later tabs' URLs;
  - a `#setup/sms` deep link isn't normalized to `/intro`;
  - the batch's disclosed limits still apply (no PUT idempotency, legacy Keep race, hours-text race, focus heuristics).
- **Intervention claim:** "the hold adds no entry" is asserted, but Chrome's skip-on-Back can't be exercised through Playwright.
- Local acceptance only.
