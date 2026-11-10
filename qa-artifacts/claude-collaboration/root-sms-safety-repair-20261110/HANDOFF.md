# SMS safety repair handoff

The old leading-sentence filter could delete `Call 911` or `Leave the house now` when the same sentence named an internal tool. The repaired handler removes only complete recognized planning notes or tool-note clauses and preserves other customer text. It also keeps instructions to notify a property owner. Unknown phrasing is preserved.

`runAgent` now releases buffered output only for `end_turn`. Tool-use, truncated and refused text is withheld; the existing fallback supplies the delivered answer. This applies to `dropToolPreamble` and `withholdToolText`; ordinary unbuffered mode is unchanged.

Runtime is frozen at the SHA-256 values in `ENGINEERING-FREEZE.json`. Independent QA is pending. Only `netlify/functions/sms-agent-background.mjs` and `netlify/functions/lib/agent.mjs` change in the product. The parent is Claude's `aaeaba3e`; its authored patch and checks remain unchanged. Its product base is frozen `dfb0ae78`. This child applies and repairs proposal03; proposals08/09 and all live operations are outside scope.

## Evidence

- `repaired-final.json`: 20 actual SMS-handler cases and six actual default `runAgent` cases pass; source is stable and physical transport attempts are zero.
- `base.json` and `proposal03.json`: original failures using the first24-case harness; final26-case harness adds two bare property-owner controls. The original independent safety-deletion evidence is also preserved in canonical `root-backend-proposals-20261110-resume/`.
- Positive controls retain tool preamble suppression in an actual SMS tool loop and remove exact planning/checklist prefixes, including a short final safety instruction.
- `agent-condition-mutant.json`: restoring the old shared-agent guard fails six of26 cases.
- Five affected existing suites pass: `agent-delivery-check`, `self-service-ai-check`, `managed-sms-qa-check`, `platform-ai-check`, `sms-policy-check`. Corresponding logs remain here. Model/provider traffic is synthetic and physical attempts are zero.
- `original-author-suite.json`: original108 suite is preserved with one failure. It expects removing `Then notify owner of the property right away.` That can be a legitimate customer instruction, so this repair deliberately keeps it.
- `author-suite-property-instruction-disposition.mjs` changes only that expectation to **keep**. `author-suite-disposition.json` passes108/108. This is replacement coverage, not a waived test or a claim that the unmodified original suite is green.

## Independent verification commands

Run from the child worktree with the installed Node24 binary and an empty environment:

```
env -i PATH=/usr/bin:/bin MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 /Users/stevengoumnai/.nvm/versions/node/v24.13.0/bin/node qa-artifacts/claude-collaboration/root-sms-safety-repair-20261110/sms-safety-check-r2.mjs --repo /tmp/mc-root-sms-safety-repair-20261110 --output <new-owned-receipt.json>
```

For selected existing scripts, preload `block-egress.mjs`; use a fresh `MC_REVIEW_NETWORK_RECEIPT` path. Dependencies are a symlink to the already installed offline proposal dependency directory; none were downloaded. Test transport guards deny physical connections. No real account state, secrets, sessions or .env files were accessed.

## Remaining scope

Harmless narration and ambiguous labelled notes that are not exact planning shapes may remain. The filter favors preserving customer instructions. This work does not prove real model quality or service delivery. Root owns independent QA acceptance, later integration and the combined required gate. No live release source or provider setting changed.
