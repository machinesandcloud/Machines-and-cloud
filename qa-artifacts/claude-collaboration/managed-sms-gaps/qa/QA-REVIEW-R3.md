# Independent QA review, rev 3: managed-SMS failure gaps

**Verdict: ACCEPT.** Both required fixes (B9 and B6) work. Apart from them, rev 3 is identical to rev 2. The known 30-minute edge is acceptable for shipping, with the follow-up described below.

**Review details**
- **Date:** 2026-11-13
- **Patch:** `patches/managed-sms-gaps-r3-d35c2de6.patch`
- **Applied to:** a `git archive` of release-4 `d35c2de6`. The throwaway copy was about 40 MB and has been deleted.
- **Safety:** offline only (`env -i`, memory store, fake model, no keys, deny-remote). No provider calls, commits or pushes, and 0 blocked requests.

## Scope check: what changed since rev 2

I compared the r2 and r3 patches with `index` lines stripped. The only differences are:
- **`markHistoryUndelivered`**: adds the history marker and clears `disclosedAt`. It is called in `recoverManagedReply` before the owner alert, and reversed in `resolveDeliveredLater`.
- **Request reopen on the B6 path**: sets `outcome:"needs_action"`, `resolvedAt:null`, `resolution:null`. None of these are revision fields, so no extra email is sent.
- **New check scenarios** R17 and R18.
- **Hunk offsets.**

Nothing else changed.

## Reproduced

| Check | Result |
|---|---|
| Full `netlify.toml` gate (72 commands, each in a fresh offline process) | **72/72 exit 0** (`receipts-r3/gate/SUMMARY.tsv`) |
| `managed-reply-recovery-check` | **20/20** |
| `managed-sms-qa-check` | **38/38** |
| My adversarial suite (`receipts-r3/qa-r3-check.mjs`, unchanged from rev 2 except for the B13 probe) | **14/14** (`receipts-r3/adversarial-r3.log`) |

| # | Result on rev 3 |
|---|---|
| **B9** | PASS. The first reply, which carried the intro, was undelivered. The next delivered reply starts with "Automated assistant", and `disclosedAt` is set again from that delivered reply. |
| **B6** | PASS. After the request was resolved, a new undelivered reply reopens it: `outcome:"needs_action"`, 1 undelivered reply listed, still 1 owner email. |
| B1–B5, B7, B8, B10–B12 | All still PASS. There are no extra customer texts in any failure scenario. The late delivered receipt corrects the status. Owner alerts are one per customer per Houston day. Dead workspaces never fill the sweep slots. The healthy path is unchanged: 1 text, no recovery fields, no lookup. |

## The known edge: a reply inside the 30-minute unconfirmed window skips the intro

**Measured (B13).** The first reply's send result is unknown: the response was lost and no callback arrived. The customer texts again 10 minutes later. Result: the second reply has **no** intro, the customer got 2 texts, and the owner got 1 request.

The real exposure depends on whether the first text was actually created:
- **Lost response (the common way to get an unknown result).** In B13 the first text, intro included, really reached the provider. The customer did receive the disclosure, so there is no harm.
- **Network failure before Twilio, or a crash before the POST.** No message exists, so the customer's first delivered text has no disclosure. This needs all of the following at once:
  - an unknown result on the very first reply of a conversation;
  - no status callback;
  - the customer texting again within 30 minutes.

**Judgement: acceptable for shipping.** The exposure is rare and limited to one conversation. It is visible to the owner, who gets a request at 30 minutes saying the reply could not be confirmed. It also does not cause any duplicate or unconsented text.

**Recommended follow-up (no need to block on it).** In `processManagedSMS` (managed-sms.mjs, where `firstReply = !history?.disclosedAt`):
- Treat the intro as not yet given while the reply that set `disclosedAt` has its `sms_reply:<sid>` delivery job in `uncertain`, or in `sending` with no `providerId`.
- That requires history to record which SID set `disclosedAt` (for example a new `disclosedBy` field set in `appendHistoryOnce`).
- The cost of that rule is at most one extra intro.
- Legal or the PO should confirm that this residual is acceptable until then.

## Non-blocking notes carried forward from rev 2

- **4xx on any SMS.** A documented Twilio 4xx now marks any managed SMS `failed/provider_rejected`, not only replies. That is correct, because no message is created.
- **Closed request.** If the owner closed the day's request before a later failure that day, the new failure attaches to the closed request with no email. The PO should confirm this follows the per-day design.
- **Billing (S3).** An undelivered reply settles its AI answer at 0.
