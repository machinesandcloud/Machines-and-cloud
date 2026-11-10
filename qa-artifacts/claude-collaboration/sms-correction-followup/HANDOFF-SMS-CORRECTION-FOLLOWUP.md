# Claude follow-up handoff: the SMS registration correction form names the carrier's flagged details

This is a follow-up to `AUTO-REVIEW-578CE4BAE45F1CF9`, recorded as `followUp` on that card. The connection-errors handoff `161cf80e` is unchanged.

| | |
|---|---|
| Branch | `work/claude-sms-correction-followup-20261110` |
| Worktree | `/tmp/mc-claude-sms-correction-followup-20261110` |
| Base | `161cf80e` (stacked) |
| Final source | the single commit adding this file |
| `desk-connections.js` | `161cf80e` `46770af2…` → final `2c692c607aa6ce8f4d6af6fcea9b86538a3c038f1d838ad2b11cfc4f95ff9f27` |

No backend change was made. Nothing is merged, pushed or published.

## Original failure (C1)
When a carrier rejects a registration detail, the server tells the owner to "Review the highlighted business details" (`messaging-activation.mjs:48`) and sends `issues: [{code, field}]` (`:100`). The data reaches the client at `data.connections.messaging.operation.issues` via `serviceConnections()`. The desk never read it, so no field was marked or named, and the owner had to guess among 16 fields before the one correction the server allows (`correct()`, `:138`).

This was found by the coverage-map SMS registration checks (`935946b2`).

## Repair (desk-connections.js)
**Mapping.**
- An issue marks a form field only when its name matches the form name or the provider attribute that field is filed under (`messaging-provider.mjs:24-28`).
- `email` / `Email` never mark a field. The representative email and the platform's notify Email share that attribute name (`:23`, `:26`, `:36`). These issues are listed as "Email (registration contact or your representative's work email)".
- Server markers and unknown names are listed as reported, with no field marked.
- Lookups use own properties only.

**Display.**
- Each matched field gets `aria-invalid`, a visible "Carrier flagged: …" note linked by `aria-describedby`, and a red border.
- A summary at the top lists every flagged detail, with links that focus the field without changing the route. The summary gets focus when the form opens; while a change is held, the connection-errors behaviour keeps focus on "Check saved status".

**Correction limit.**
- **One correction left:** the notice "This is your one allowed correction…" appears exactly when the server rule leaves one. No price is shown.
- **None left:** the form is read-only, the save button is removed, and the submit handler refuses. The notice points to support@machinesandcloud.com, the existing support address.

## Checks (offline; real handlers with synthetic gate settings; served sha256 pinned; `evidence/final/`, QA in `qa/`)
| Check | 161cf80e | a125b54a (round 1) | final |
|---|---|---|---|
| `sms-correction-form-ui-check` (27 cases at 390 and 1440, incl. multiple issues, unknown fields, keyboard summary→field, email, none-left, built-in names) | 13/27 | 22/27 | **27/27** |
| connection-errors-ui-check / connector-pages / desk-daily-work / wizard routing | | | 71/71 / 55/55 / 12/12 / 11/11 |

**Independent QA (round 1): ACCEPT WITH NOTES.**
- **Escaping:** `<img onerror>`, `<svg onload>` and script payloads in code and field render as text.
- **Mapping and limit:** the provider mapping and the limit wording are correct.
- **Accessibility:** focus and reading order are correct, and the earlier lost-response behaviour is kept.

Its three notes (ambiguous email, none-left form still offered, built-in property names) are fixed. Required cases fail on a125b54a and pass now. There was no second independent pass.

QA's probe now fails its P4 case at both widths by design: it clicks "Save corrected details" when none are left, and that button is now removed.

## For Codex (backend)
- The refusal when no correction is left ("A current correction offer and your renewed acceptance are required.") doesn't say the limit is the reason.
- Issues carry only `code` and `field`, with no human-readable reason.

## Limits
- **No browser coverage for two cases:** `needs_action` with no issues, and reopening the form while a change is held.
- **Inline styles,** because the CSS was read-only for this follow-up.
- **Local acceptance only.**
