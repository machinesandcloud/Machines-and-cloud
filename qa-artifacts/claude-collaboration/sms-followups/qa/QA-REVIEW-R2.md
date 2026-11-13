# Independent QA review, rev 2: SMS follow-ups (base 2180487e)

Reviewer: independent adversarial QA (Claude). Date: 2026-11-13. Patch: `sms-followups-r2.patch`.
Offline only (env -i, MC_MEMORY_STORE=1, MC_FAKE_MODEL=1, MC_LOCAL_NO_KEYS=1, sandbox deny-remote; loopback only).
No provider calls, commit or push. Throwaway copy `scratchpad/smsfuqa2` deleted afterwards.

## Verdict: ACCEPT

R1 (unbounded operator email) is fixed and N1 (orphan CAS) is fixed. The 73-step gate is green, and the shop outage
emails are bounded by the existing 5 s per-request cap, verified both against real undici and end to end.

## Setup
`git -C /tmp/mc-claude-release4-candidate-20261113 archive 2180487e`, then `git apply sms-followups-r2.patch`
(clean). node_modules: `scratchpad/p10/nm`.

## 1. Operator email time cap (R1)
Change: `alertOperatorSMSAccountOutage(error, deadlineAt)` now does its own Resend POST with
`AbortSignal.timeout(min(5000, deadlineAt - now))`, `redirect:"error"`. If no time is left it skips the send
(`no_time_left`). A timeout is recorded as `lastError:"timeout"` with `attemptAt` kept, so the 15-minute retry
rule still applies. It does not read the response body.
- Author F7b: a hanging mailbox, mocked so that it only responds to the abort signal. The run returned in **5017 ms**,
  another shop's reply was delivered, `lastError=timeout`, and the email was retried and sent after 20 min. PASS.
- Author F7c: with a 2 s run budget, the run took **2015 ms** and recorded `timeout`/`no_time_left`. PASS.
- My R1 test from the first review used a mock that ignored the abort signal. That cannot happen with a real fetch,
  so I added a loopback check against a real `fetch` with `AbortSignal.timeout(300)`:
  - a server that never sends headers: `TimeoutError` after **304 ms**;
  - a server that sends headers and then stalls the body: `TimeoutError` while reading the body after **303 ms**.

  The real fetch therefore honours the signal in both stall shapes.
- Recipient fallback: `alertRecipients()` already falls back to `STEVE_EMAIL`. The `FROM_EMAIL` default matches
  send.mjs. Minor: when `RESEND_API_KEY` is unset, `lastError` is set to `email_disabled`, retried every 15 min and
  logged only. That is acceptable.

## 2. Conditional orphan removal (N1), raced
Change: the removal CAS also requires
`JSON.stringify(v.failures[key]) === JSON.stringify(failed.failures[key])`, as well as the existing no-`entries[key]`
guard. I raced it with the check's `onRecordRead` hook, which mutates the index between the sweep's strong read of
the missing record and its CAS:

| Mutation during the race | Result | Expected |
|---|---|---|
| Newer failure entry (`at` changed), author F2b | kept, removed on the next run once unchanged | kept |
| Entry marked `followedUp` | kept | kept |
| `state` changed to `uncertain` | kept | kept |
| `entries[key]` snapshot added | kept | kept |
| Same fields, different key order | kept | conservative: removed next run |
| Unrelated index write (other key) | removed | removed (CAS retried, entry unchanged) |
| Identical rewrite | removed | removed |

No variant removes a changed or snapshot-backed failure, and none leaves an unchanged orphan stuck. Key-order
sensitivity can only cause an extra keep, never a loss.

## 3. Shop outage emails and the existing 5 s per-request cap
The shop outage emails are ordinary `owner_lead` jobs sent by `providerAdapter.request`, which uses
`AbortSignal.timeout(max(1, min(5000, deadlineAt - now)))` and `redirect:"error"`, and refuses to start once the
deadline has passed. The same request reads `response.json()`, and the loopback test above shows the signal also
cuts off a stalled body.

End to end, I ran 2 shops with outage emails pending, an approved email budget, and every owner Resend POST hanging
(abort-aware). Results:
- The run returned in **10017 ms** for 2 hung POSTs, about 5 s each.
- Both jobs ended `uncertain/provider_result_unconfirmed`.
- 3 later healthy runs re-POSTed nothing (`laterPOSTs=0`), so the cap causes no duplicate owner email.

So the bound holds per request. A whole run is bounded by its own deadline, because each request is capped at the
time the run has left. Note: a timed-out owner email stays uncertain and is not resent. This is the existing
owner-email semantics, which surface as `delivery_needs_review`, and is unchanged by this patch.

## 4. Gate (73 steps)
`netlify.toml` now includes `node scripts/sms-followups-check.mjs`, giving **73 node steps**. Each step ran in a
fresh process and **all 73 exited 0**. The verbatim chain gave **CHAIN_EXIT=0**; inside the chain,
sms-followups-check passed **13/13** and build-site was ok (182 HTML, 311 files). The standalone
sms-followups-check with my extra scenarios passed **15/15**.

## Carried-forward notes (non-blocking)
- The owner outage email body now names the date (`for YYYY-MM-DD`), which resolves the first review's N2.
- Out of scope, as documented by the author: a 401 without a JSON code, and receipt-callback 30002, are still
  handled per customer.
