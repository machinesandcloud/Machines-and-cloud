# Native hosted TEST checkpoint

This adds `--native-hosted-checkpoint` to the existing public Stripe proof. Application code, the automatic browser's challenge guard and its default behavior are unchanged. The passive SDK allowlist experiment is not included. This is local tool preparation; it grants no provider, browser, publication or payment authority.

The authenticated isolated workspace still performs the ordinary Coverage review and creates one Checkout. Its first exact owned Checkout GET document is intercepted before any Stripe browser transport and receives a clearly labelled local handoff page with no card form or script. The full Checkout URL stays in the existing private0600 sibling receipt. The runner independently retrieves the canonical `cs_test` session and checks TEST mode, open/unpaid status,99USD and exact approved Price before writing `nativeHosted.state=ready`.

Root's separately scoped regular Chrome helper may then open only that exact Checkout. It reads the ready metadata and the shared `deadlineAt`, which cannot exceed600seconds or the financial phase expiry. Visible CAPTCHA, OTP or other human verification stays with the owner; no challenge bypass or solver is authorized. A visible TEST banner is not required. The canonical provider session establishes TEST mode. A normal return may show sign-in in that regular browser; its URL is observed without injecting the isolated owner's bearer.

The private sibling contains `phaseId`, `checkoutURL` and `nativeHosted`: state, phaseId, financial issuedAt/expiresAt, checkoutId, livemodefalse, statusopen, currencyusd, amount_total9900, stripeAccountId, priceId, canonicalVerifiedAt, shared deadlineAt, ownerSlug and tenantIdentity. New helper actions require ready/current deadline. After acknowledgement, EOF, timeout or error the runner retires ready to `reviewed` or `closed_unconfirmed` before further verification. Exact conditional restoration remains a separate cleanup action.

Root supplies one bounded stdin observation:

```json
{"action":"record_native_hosted_completion","phaseId":"<exact phase>","checkoutId":"<exact cs_test>","completedAt":"<actual observed time>","evidenceSHA256":"<retained actual observation artifact hash>","observedByRoot":true,"canonicalTestVerified":true,"returnedToWorkspace":true,"nativeActions":12,"confirmed":true}
```

The timestamp must fall within the checkpoint. The ten exact fields, matching identities, Root observation, canonical TEST verification, actual return and1–24 native actions are required; an artifact hash alone is insufficient. Sixteen rejected inputs, EOF, missing/failed input, expiry or timeout never produce completion. Input closes even when the first state save fails.

The observation only resumes the existing proof. Actual dedicated signed `checkout.session.completed`, canonical same-session/customer/subscription and paid99USD invoice remain mandatory. The runner then visits the ordinary returned Account page in its authenticated isolated context and exercises End monthly renewal on that same subscription. Financial cleanup, archive, exact destination disable/readback, bounded Workbench review and same destination deletion are unchanged.

The80runner/80server counters cover only their guarded HTTP traffic. Regular native Chrome's normal SDK/network traffic is outside that160 bound and must be explicitly declared in Root's fresh scope alongside the separate24native-action limit/one Checkout. No all-network aggregate is claimed. Root must bind final source/runner/packet/helper identities and clock before execution; no closed allowance is reopened.

Local author evidence:12native-boundary checks,8retained tool checks and13retained delivery/finalizer checks pass on matching source with no provider, browser or key access. These doubles do not establish actual native UI, payment or delivery acceptance.
