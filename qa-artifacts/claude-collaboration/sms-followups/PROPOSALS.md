# SMS follow-ups to release 4 (base `2180487e`)

This is a patch only (`sms-followups.patch`). Nothing was committed, pushed or deployed, and no provider was called. It closes RELEASE-QA §6 findings 1 and 2.

## 1. Sweep starvation (QA finding 1, P2)
**Change.** The owner-alert sweep in `runManagedDelivery` takes the first 25 open `failures` keys. Before this patch, a key whose delivery record was gone was skipped forever. Now it is **removed** from the failure index.

I removed the key instead of flagging it `followedUp:true`:
- A flagged orphan would keep `openFailures > 0` and keep `/api/health` degraded permanently, even though nothing can be followed up.
- Normal erasure already prunes these keys, so removal completes what an interrupted erasure left behind.
- The key holds only slug/hash, no customer data.

**Guard.** If the same key still has a pending `entries` snapshot, the key is left alone. The pending loop restores the record from that snapshot, so removing the key there would lose the failure signal. The mutant check covers this as M11.

## 2. Account-wide Twilio failure storm (QA finding 2)
**Classification.** An error is treated as account-wide only on HTTP **401**, or on a documented Twilio account code: **10001** (account not active), **20003** (authentication failed) or **20005** (account suspended/not active). The code is exported as `SMS_ACCOUNT_WIDE` / `accountWideSMSRejection`. Every other documented 4xx error is unchanged, for example 21610, 21211 and 21612.

**Chosen behaviour.** Owners get one email per shop per Houston day. Every customer is still recorded and shown.
1. **The reply is marked not delivered now.** It is the same as before: `failed / provider_rejected`, plus `providerScope:"account"`. The job is never retried. The portal conversation shows "not delivered" and the AI history gets the not-delivered marker.
2. **Each affected customer is still their own request in the workspace.** The deduplication is unchanged: one request per customer per day. Each request includes what the customer wrote and the reply they did not get. Its text says: "Texting is temporarily unavailable on our side, so the automatic text reply to this customer was not delivered. It was not sent again. We are working on it. Please call or text them yourself." The request carries `replyOutage:{day}`.
3. **Owner email: one per shop per Houston day, not one per customer.** The email is "Texting is temporarily unavailable: customers did not get replies … we are working on it … each customer who did not get a reply is saved as a request in your workspace … please call or text them yourself. This is the only email about this today." It is one idempotent delivery (`reply_outage:<day>`) and it still goes through the normal per-tenant email budget. It contains no customer numbers. Discovery backfill re-reads every lead but cannot queue a second copy.
4. **Operator: one email per Houston day** to `ADMIN_EMAILS` (falling back to `STEVE_EMAIL`). The record `health/managedSMS:accountOutage` keeps the first and last time, the count, the status and the code, and contains no customer data. The claim uses CAS, so concurrent workers send one email. If the email send fails, it is retried after 15 minutes, never sooner and never only on the next day. While the outage lasts, the run reports `sms_provider_account_unavailable`, so health stays degraded.

**Why this, and not holding the owner emails.** Holding them would keep owners from learning, possibly for hours, that customers did not get replies. That breaks the "owners must learn, truthfully" requirement. It would also need a reliable "outage over" signal before releasing the held emails, and we do not have one. Sending one email per customer is accurate but floods 19 shops. One email per shop per day is truthful: it says texting is down and the customers are listed in the workspace. It is bounded at 19 owner emails plus 1 operator email per day. No customer is lost, because each one is a saved request.

**Not done (separate decisions):**
- A circuit breaker that stops attempting SMS after the first account-wide error. Each queued text still makes one POST and fails, which is harmless and cannot double-send.
- Classifying receipt callbacks whose ErrorCode is 30002 (account suspended). Those still produce per-customer requests and emails, capped by the email budget as in release 4.
- Adding `sms-followups-check` to the `netlify.toml` gate. I left the gate at 72 commands as instructed; adding it is a one-line change if wanted.

## Proof (offline: `env -i`, `MC_MEMORY_STORE=1`, `MC_FAKE_MODEL=1`, `MC_LOCAL_NO_KEYS=1`, sandbox deny-remote)
- `scripts/sms-followups-check.mjs` reuses the `managed-sms-qa-check` fixture: real handlers, signed Twilio payloads, SDK CAS and a provider double. It passes **10/10** (`receipts/check.log`, re-run on the gate copy as `receipts/check-gate-copy.log`).
  - **F1:** 30 orphans plus 1 real callback failure; the real failure is alerted within 2 runs at `limit:1`, and the orphans are removed.
  - **F2:** a key backed by a snapshot is kept.
  - **F3:** classifier table.
  - **F4:** 3 shops × 4 customers on a 401/20003 give 1 operator email, 1 owner email per shop, 0 per-customer emails, 12 requests, 12 portal rows "not delivered", 0 customer texts and a health count of 12.
  - **F5:** +3 h on the same day gives no new emails, a repeat customer gets `undeliveredReplies`=2, and backfill adds no emails.
  - **F6:** the next day gives +1 operator email and +1 owner email per shop.
  - **F7:** operator email failure, no retry at +5 min, a retry at +20 min, then deduped.
  - **F8:** control, 21610 stays per-customer.
  - **F9:** healthy control.
  - **F10:** no reply attempted twice.
- On unpatched `2180487e` the same check fails 6/10, including F1 (starvation reproduced) and F4 to F7: `receipts/check-on-unpatched-2180487e.log`.
- **Mutants: 15/15 killed** (`receipts/mutants/MUTANTS.tsv`, `harness/mutants.py`).
- **Full `netlify.toml` gate:** 72 steps, each in a fresh process, plus the verbatim chain. The results are in `receipts/gate/SUMMARY.tsv`, which includes `managed-reply-recovery-check`, `managed-sms-qa-check`, `managed-delivery-qa-check`, `managed-delivery-proof-check`, `managed-email-budget-check` and `managed-sms-budget-check`.
- Deny-remote probe: `fetch("https://example.com")` gives `BLOCKED ENOTFOUND` (`receipts/deny-remote-probe.log`).
- The harness is `harness/mk.sh`, `run1.sh`, `gate.sh`, `mutants.sh` and `deny-net.sb`. Every throwaway copy under `scratchpad/smsfu/` was deleted afterwards.

## Rev 2 (`sms-followups-r2.patch`, full patch on `2180487e`; responds to `qa/QA-REVIEW.md`)
- **R1, required: the operator email send is bounded.**
  - The send now makes its own Resend POST with `AbortSignal.timeout(min(5 s, run deadline − now))`. Before, it went through the unbounded `sendEmail`.
  - If no time is left, it does not send.
  - A timeout, HTTP error or no-key case is recorded as `lastError` with `emailedAt:null`, keeps the CAS claim, and is retried after 15 minutes. The delivery run then continues.
  - Shop outage emails were already sent through the deadline-bound managed delivery adapter, which caps each request at ≤5 s.
- **N1: the orphan removal is conditional.** The CAS removes the failure entry only if it is byte-equal (JSON) to the entry the sweep read.
- **N2: the owner outage email names its date.** It says "the only email about this for YYYY-MM-DD", not "today".
- **Gate:** `node scripts/sms-followups-check.mjs` is added before `build-site`, so the gate has **73** commands.
- **Tests, now 13/13:**
  - **F7b:** a hanging operator mailbox. The run returns in about 5.0 s, the other shop's reply is delivered (1 text), and shop A's owner request is still made. The timeout is recorded and retried at +20 minutes, and the retry sends.
  - **F2b:** a failure entry changed between the read and the removal is kept, and the unchanged orphan is removed on the next run.
  - **F7c:** with a 2 s run budget, the hanging send returns within the run's remaining time (about 2.0 s), not 5 s.
- **Mutants:** the 15 from r1 (M11 re-pointed at the new guard) plus 5 new ones: no abort signal, a 60 s cap, the deadline ignored, a timeout treated as emailed, and the unconditional CAS (`receipts/mutants-r2/`).
- **Receipts:** `receipts/r2-check.log` and `receipts/gate-r2/`.
- **Process:** this revision was built only in throwaway copies. No tracked file in the worktree was edited.
