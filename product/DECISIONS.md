# Decisions log

Engineer notes on trade-offs made while building. Newest first.

- 2026-10-19, sprint 1. Opt-outs are stored per phone number across all shops (store `optouts`, key = E.164). Reason: the bridge sender is shared, so a STOP sent to the Machines & Cloud number must stop every shop that would text that number. PM assumption 18 accepted.
- 2026-10-19, sprint 1. `go_live` and `resume` are the same action; resuming from paused always returns to `live` (a paused shop was live or testing; testing shops rarely pause). The portal shows Resume when paused.
- 2026-10-19, sprint 1. Escalation step 2 uses the Twilio Calls API with an inline `<Say>` (no AI voice), from `MC_TWILIO_NUMBER`. Without Twilio keys the step is logged.
- 2026-10-19, sprint 1. Vapi warm transfer tool shape (`transferCall` with `transferPlan.mode = warm-transfer-say-summary`) is written from the Vapi docs as of 2026-10 and untested against a real account; expect field fixes in S1-19.
- 2026-10-19, sprint 1. Reschedule by reply works on SMS only; the website widget has no phone identity. Fast paths `C` and `R` run without the model when exactly one upcoming visit exists.
- 2026-10-19, sprint 1. Spam-tagged leads are stored with status `spam`, never texted to the owner, counted in the digest.
- 2026-10-19, sprint 1. Daily digest at 18:00 Houston for live shops on every plan; the Monday Pro-only digest was removed. Steve gets a copy while `liveAt` is under 7 days old.
- 2026-10-19, PO round 2 fixes. M1: START/UNSTOP/YES count as opt-in only when the number is opted out (a plain "Yes" is an answer, not a keyword). M2: all-calls mode no longer requires a transfer target; without one the voice assistant takes a message and promises the callback window; the loop check fires only when a target equals the forwarded line. GSM ring-time codes (**15#) added for AT&T and T-Mobile so missed-calls forwarding beats Google's 20-second LSA clock; Verizon has no timer, so the advice there is all-calls on the LSA line.
- 2026-10-19, PM finding on S1-10. A repeat notify_owner for the same customer (same phone or same conversation) within 30 minutes now updates the open lead and sends the owner an UPDATE line instead of opening a second lead and a second escalation chain; an alert is opened only if none is waiting for that lead.
