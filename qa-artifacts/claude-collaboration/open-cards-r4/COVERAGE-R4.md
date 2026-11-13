# Coverage map R4: all 124 audit cards vs production (release 3) and release 4

Status on 2026-11-13. Replaces the outdated map on `work/claude-uncovered-cards-20261112` (`uncovered-cards/COVERAGE.md`).

**How it was checked.**
- Releases come from the commit log of `/tmp/mc-claude-release4-candidate-20261113`:
  - release 1 = `43ee2f2c`, with one "Apply ... (PRA-...)" commit per fix;
  - release 2 = `0f30643e`;
  - release 3 = `c470c7a7`, which is production;
  - release 4 = `work/claude-release4-candidate-20261113` at `eb973e37`, not deployed. The rev 2 fixes are based on `5cb4233e`, which adds a11y rev 2 (A11Y-01..07 move from in flight into release 4).
- **In flight** means a worktree holds the fix and it is not in release 4. The worktrees are:
  - a11y: `/tmp/mc-claude-a11y-r3-fix-20261113` (QA: accept, with one required fix F1);
  - copy: `/tmp/mc-claude-copy-clarity-20261113`. It has a patch and receipts but no PROPOSALS.md yet. Its COPY coverage below was read from the patch hunks;
  - polish: `/tmp/mc-claude-visual-polish-20261113` (`PROPOSALS.md`).
- Partial and open items were checked against the source at `eb973e37`:
  - ONB-11: `desk.js:1254` printed the raw `+1` number;
  - OPS-06: no platform-limit wording and no operator usage view;
  - POLISH-09/10/12/13/15: the polish worktree lists them as "Not done".

## Counts (124 cards)

| Status | Cards |
|---|---|
| Shipped | **71**: release 1: 22, release 2: 44, release 3: 5 |
| In release 4 | **16**: ACQ-10, ONB-09, ONB-10, ONB-12, FC-01..11, LIVE-01 |
| In flight | **28**: A11Y 7, COPY 11, POLISH 10 |
| Owner or live only | **2**: HOMEOWNER-09, ACQ-06 |
| STILL OPEN at R4 HEAD | **7**: OPS-06 (code part), ONB-11, POLISH-09, -10, -12, -13, -15 |

After this branch's patch (see [PROPOSALS.md](PROPOSALS.md)), not applied:
- OPS-06 (code part) and ONB-11 are fixed.
- POLISH-15 meets 2 of its 3 criteria; the onboarding icons are not done.
- POLISH-12 has the brand part only.
- **Still open: POLISH-09, POLISH-10, POLISH-13, the rest of POLISH-12 and the onboarding part of POLISH-15.** They overlap the in-flight polish, copy or a11y work (see the last section).

## Original 79 (CARDS.md)

| Card | P | Status | Where |
|---|---|---|---|
| CONN-01 | P0 | shipped r1 | 3b9672c4 |
| HOMEOWNER-01 | P1 | shipped r1 | 2dc15094 |
| HOMEOWNER-02 | P1 | shipped r1 | 2dc15094 |
| HOMEOWNER-03 | P1 | shipped r1 | e3eae53f |
| HOMEOWNER-04 | P1 | shipped r1 | e3eae53f (Spanish review fixes r2 f1990a77) |
| HOMEOWNER-08 | P1 | shipped r1 | a73c2b11. Review requests are held by default. |
| OPS-01 | P1 | shipped r1 | c15694e0 |
| OPS-02 | P1 | shipped r1 | c15694e0 |
| OPS-03 | P1 | shipped r1 | d0e22935 |
| OPS-04 | P1 | shipped r1 | d0e22935 |
| OPS-05 | P1 | shipped r1 | d0e22935 |
| OPS-06 | P1 | **STILL OPEN** (code part); capacity size is an owner decision | Release 2 desk P2 split the pools (practice share; production global 500). "Free to get started" names the limit (r2 W1). At R4 HEAD nothing tells the owner or the operator that the shared platform pool, not the shop's own allowance, is used. The operator also cannot see platform usage. **Fixed in this branch** (C1). |
| ACQ-01 | P1 | shipped r1 | b3669d19 |
| ACQ-02 | P1 | shipped r1 | b3669d19 |
| ACQ-03 | P1 | shipped r3 | c75cae90 + 7c962698, legal pages. Attorney review (C1-C3) remains with the owner. |
| ACQ-04 | P1 | shipped r3 | c75cae90 + 7c962698 |
| ONB-01 | P1 | shipped r2 | 3cb8bf70 sign-in tabs rev 4 |
| ONB-02 | P1 | shipped r1 | b3669d19 |
| DESK-01 | P1 | shipped r1 | b2dca298 |
| DESK-02 | P1 | shipped r1 | b2dca298 |
| DESK-06 | P1 | shipped r1 | 4b890529 |
| CONN-02 | P1 | shipped r1 | 3b9672c4 |
| HOMEOWNER-05 | P2 | shipped r3 | 4a0c7627 |
| HOMEOWNER-06 | P2 | shipped r3 | 4a0c7627 |
| HOMEOWNER-07 | P2 | shipped r3 | 4a0c7627 + e124a6fd |
| OPS-07 | P2 | shipped r2 | efd9edfc ops P2 rev 2 |
| OPS-08 | P2 | shipped r2 | 295b3ae2 onboarding P2 (no default plan, "Not chosen yet") + admin "Plan preference" |
| OPS-09 | P2 | shipped r2 | efd9edfc |
| OPS-10 | P2 | shipped r2 | efd9edfc |
| OPS-11 | P2 | shipped r2 | efd9edfc |
| OPS-12 | P2 | shipped r2 | efd9edfc |
| OPS-15 | P2 | shipped r2 | efd9edfc |
| ACQ-05 | P2 | shipped r2 | abf3a144 website P2 rev 2 |
| ACQ-06 | P2 | **owner only** (code half shipped r2) | abf3a144 points city-page related links at home-service content. Whether to noindex or rewrite the 56 city pages is Steve's location-strategy decision. |
| ACQ-07 | P2 | shipped r2 | abf3a144 |
| ACQ-08 | P2 | shipped r2 | abf3a144 |
| ACQ-09 | P2 | shipped r2 | abf3a144. The optional app em dash (07) was not applied; COPY-09 covers the remaining two. |
| ONB-03 | P2 | shipped r2 | 295b3ae2 |
| ONB-04 | P2 | shipped r2 | 295b3ae2 |
| ONB-05 | P2 | shipped r2 | 295b3ae2 |
| ONB-06 | P2 | shipped r2 | 295b3ae2 |
| ONB-07 | P2 | shipped r2 | 295b3ae2 |
| ONB-08 | P2 | shipped r2 | 295b3ae2 |
| DESK-03 | P2 | shipped r2 | 639fb56b desk P2 rev 2 |
| DESK-04 | P2 | shipped r1 | b2dca298 |
| DESK-05 | P2 | shipped r1 | b2dca298 |
| DESK-07 | P2 | shipped r1 | 4b890529 |
| DESK-08 | P2 | shipped r2 | 639fb56b (+ e2077b38 RC2-D1) |
| DESK-09 | P2 | shipped r2 | 639fb56b |
| DESK-10 | P2 | shipped r2 | 639fb56b |
| DESK-11 | P2 | shipped r2 | 639fb56b (practice share of the global pool) |
| CONN-03 | P2 | shipped r2 | 983733de connectors P2 rev 2 |
| CONN-04 | P2 | shipped r2 | 983733de |
| CONN-05 | P2 | shipped r2 | 983733de |
| CONN-06 | P2 | shipped r2 | 983733de |
| CONN-07 | P2 | shipped r2 | 983733de |
| CONN-08 | P2 | shipped r2 | 983733de |
| CONN-09 | P2 | shipped r1 | b2dca298 (verified by connectors P2) |
| CONN-10 | P2 | shipped r2 | 983733de |
| CONN-11 | P2 | shipped r2 | 983733de |
| HOMEOWNER-09 | P3 | **owner only** | The START reply text is carrier-registered (release 4 notes §4). The owner view already labels `waiting_consent` texts ("Waiting for the customer’s permission", `desk.js` POST_STATES). |
| OPS-13 | P3 | shipped r2 | efd9edfc |
| OPS-14 | P3 | shipped r2 | efd9edfc |
| OPS-16 | P3 | shipped r2 | efd9edfc |
| ACQ-10 | P3 | in release 4 | f6fba244 P3 rev 2. QA note, not blocking: use `:focus-visible`. |
| ACQ-11 | P3 | shipped r2 | abf3a144 |
| ACQ-12 | P3 | shipped r2 | abf3a144 |
| ACQ-13 | P3 | shipped r2 | abf3a144 |
| ONB-09 | P3 | in release 4 | f6fba244 |
| ONB-10 | P3 | in release 4 | f6fba244 |
| ONB-11 | P3 | **STILL OPEN** | Release 2 DESK-16 formats the business-details phone, but the Account "Contact cell" still printed `+17135550142`. **Fixed in this branch** (C2). |
| ONB-12 | P3 | in release 4 | f6fba244 |
| DESK-12 | P3 | shipped r2 | 983733de (as CONN-11) |
| DESK-13 | P3 | shipped r2 | 639fb56b |
| DESK-14 | P3 | shipped r2 | 639fb56b |
| DESK-15 | P3 | shipped r2 | 639fb56b |
| DESK-16 | P3 | shipped r2 | 639fb56b |
| CONN-12 | P3 | shipped r2 | 983733de |
| CONN-13 | P3 | shipped r2 | 983733de |

## Later rounds (45 cards)

| Card | P | Status | Where / note |
|---|---|---|---|
| FC-01..FC-06 | P1/P2 | in release 4 | a409f76c + QA fixes d35c2de6. Residuals in release 4 notes §4 (none blocking). |
| FC-07, FC-08, FC-09, FC-11 | P3 | in release 4 | f6fba244 |
| FC-10 | P3 | in release 4 (first half) | f6fba244. Second half (the fake-mode activation path relaxes a gate) is a **PO decision**. |
| LIVE-01 | P2 | in release 4 | 6aa33436 SEO descender CSS |
| A11Y-01..07 | P2/P3 | in flight: a11y | `a11y-r3-fix-on-d35c2de6.patch`, 24/24 author check, QA accept with F1 |
| COPY-01..11 | P1-P3 | in flight: copy | `copy-clarity-fix-on-d35c2de6.patch`: internal words (01, 02), request wording (03), visits (04), pause/resume says front desk (05), retry wording (06), transfer labels (07), usage wording (08), em dashes (09), email dates and wording (10), short explanations (11). No PROPOSALS.md yet. **It conflicts with the polish patch in `desk.html`** (hunk at :99) when both are stacked. |
| POLISH-01..08 | P2 | in flight: polish | `visual-polish-on-d35c2de6.patch` |
| POLISH-11, POLISH-14 | P3 | in flight: polish | same patch |
| POLISH-09 | P3 | **STILL OPEN** | One badge component. It restyles badges the polish patch also touches in `desk.css`; left to the polish owner. |
| POLISH-10 | P3 | **STILL OPEN** | One disclosure style. It covers summaries the polish patch restyles; left to the polish owner. |
| POLISH-12 | P3 | **STILL OPEN**; brand part **fixed in this branch** (C3) | Not done: the skeleton loader, the focus outline on programmatic focus (a11y owner) and the onboarding/desk header variant. |
| POLISH-13 | P3 | **STILL OPEN** | Duplicate headings. It edits the `desk.html` lines the copy patch rewrites (`#p-convs`) and `onboard.html`; left to the copy owner. |
| POLISH-15 | P3 | **STILL OPEN** (2 of 3 criteria **fixed in this branch**, C4) | Not done: icons on the onboarding service cards (`onboard.html` is touched by copy and polish). |
