# Decisions log

Engineer notes on trade-offs made while building. Newest first.

- 2026-10-19, sprint 1. Opt-outs are stored per phone number across all shops (store `optouts`, key = E.164). Reason: the bridge sender is shared, so a STOP sent to the Machines & Cloud number must stop every shop that would text that number. PM assumption 18 accepted.
- 2026-10-19, sprint 1. `go_live` and `resume` are the same action; resuming from paused always returns to `live` (a paused shop was live or testing; testing shops rarely pause). The portal shows Resume when paused.
- 2026-10-19, sprint 1. Escalation step 2 uses the Twilio Calls API with an inline `<Say>` (no AI voice), from `MC_TWILIO_NUMBER`. Without Twilio keys the step is logged.
- 2026-10-19, sprint 1. Vapi warm transfer tool shape (`transferCall` with `transferPlan.mode = warm-transfer-say-summary`) is written from the Vapi docs as of 2026-10 and untested against a real account; expect field fixes in S1-19.
- 2026-10-19, sprint 1. Reschedule by reply works on SMS only; the website widget has no phone identity. Fast paths `C` and `R` run without the model when exactly one upcoming visit exists.
- 2026-10-19, sprint 1. Spam-tagged leads are stored with status `spam`, never texted to the owner, counted in the digest.
- 2026-10-19, sprint 1. Daily digest at 18:00 Houston for live shops on every plan; the Monday Pro-only digest was removed. Steve gets a copy while `liveAt` is under 7 days old.
