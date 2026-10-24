# Exact-target Calendar handoff cleanup

This is a proof-tool repair, based on `51ee21b73e7c51293029ab3fb0eab466aab4d5ff`. It changes no customer application, Google request, saved scheduling rule or closed proof record. The original v7 native-close failure and timing exception remain historical facts. The cause of that close failure is unknown; a separately reported fresh `about:blank` diagnostic succeeded with the old close command.

The adapter still sends the existing close body once to the exact saved Chrome window/tab IDs, with a stopped-application precondition before the `tell` block. A confirmed command records `close_command_confirmed` without another browser query. If the command throws or returns an unrecognized response, the adapter allows one separate existence-only query of those same IDs. It does not read URLs, account content, authorization codes, cookies, other tabs or other windows. Both scripts check whether Chrome is running before a `tell` block; the absence read returns immediately for a stopped application.

| Observation after an unconfirmed command | Retained result |
| --- | --- |
| Original window absent | `closed:true`, `scoped_window_absence_observed`; command remains failed or unconfirmed. |
| Original window present, saved tab absent | Unconfirmed. The tab may have moved; no other target is inspected or closed. |
| Original target present | Unconfirmed. |
| Existence query fails or returns an unknown response | Unconfirmed. |

Every receipt identifies `scope:"original_window"` and `globalTabDestructionConfirmed:false`. Scoped absence does not establish that the agent caused closure or that the original tab cannot exist elsewhere. The legacy `nativeClosed` flag means this narrower recorded cleanup scope was observed. A failure stays unconfirmed; a second close or reconciliation query is never admitted. A repeated adapter read of an already confirmed receipt has no effects.

The guard reserves `nativeCloseAttempted` durably before invoking the adapter, validates its exact saved IDs and receipt shape, and records command outcome separately from observation provenance. Failed or lost reservations do not authorize a new attempt. Receipt errors, close errors and lost final ledger acknowledgements do not refill the attempt. Raw browser errors and AppleScript source are excluded from retained metadata. Bare historical test receipts remain supported only in offline fixtures; execute mode requires the explicit provenance contract.

## Future attended proof procedure

First diagnose the exact permission-screen issue and finish preflight. Start a fresh connection attempt only when Steve confirms he is present and ready to review Google's permissions now. Passwords, MFA and permission decisions remain with Steve; any separately scoped capture must stay off for credentials. Stop rather than open replacement timed windows if the screen is missing or unresolved. This recommendation creates no browser, capture or provider authority.

Any fresh authorized procedure must declare the one reconciliation query and reserve cleanup time before its existing deadline. The current subprocess cap is20 seconds per command, so a close followed by its one query needs up to40 seconds plus orchestration time. This repair neither extends nor retroactively repairs v7's elapsed-time allowance. No closed allowance, packet, source pin or ledger may be reused. Root owns a fresh scope and any actual browser/provider execution.

## Local verification

`node scripts/calendar-native-close-check.mjs` injects every browser command and blocks physical effects. It checks18 groups covering exact scope, normal/lost command responses, absence before the command, moved/missing tabs, failed reads, concurrent calls, strict receipt/provenance validation and durable reservation/final-write failure. Existing actor, guard, late-move, paired-selection and control checks remain separate local regressions. Independent QA acceptance and exact source hashes are recorded in the companion local handoff. These checks do not establish actual Chrome execution, Google consent or a successful production Calendar lifecycle.
