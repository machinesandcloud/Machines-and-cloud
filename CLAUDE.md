# Machines & Cloud — site repo guide

Marketing site for machinesandcloud.com: AI front desk agents (website chat + phone) for service businesses, Houston based, founder led.
Static HTML + one `styles.css` + one `script.js` + `agent-widget.js`, plus one Netlify Function (`netlify/functions/chat.mjs`) that powers the live agent widget.

## Run locally
```
netlify dev --offline --port 8888      # static site + the /api/chat function (needs repo-local netlify.toml, present)
python3 -m http.server 8787            # static only, no function
```
The function needs `ANTHROPIC_API_KEY`; without it `/api/chat` returns 503 `{"error":"offline"}` and the widget shows contact details instead. Set the key in Netlify's site environment variables for production (never in the repo).

## Site structure (two-page site, 2026-10-18)
- Research-driven rebuild (NN/g attention and trust studies, Unbounce reading-level data, a 2,000-page A/B study, Storylane demo data, 15 competitor teardowns, Indie Hackers/HN founder threads). Rules applied: everything that sells in the first three screens; product in use as the hero (the interactive demo), not a stock image; one primary CTA; prices and contact up front; plain 6th-grade words; no fake proof, say we are new; four-field form; sticky mobile CTA; links out to LinkedIn and Maps for "connection to the rest of the web".
- Core pages (in nav): `index` (hero with a looping missed-call-to-text example `#demo-wrap`; a "one week with a front desk" rail `#week` with four examples in their real channels: answered call, SMS price shopper, Thumbtack lead, Spanish website chat; "both sides of the counter" `#sides`; "after the job" texts `#after`; how it works `#how`; six research-driven FAQs; pilot form `#pilot`) and `about`. Built 2026-10-18 from `RESEARCH-customer-journey.md`. The inline live chat section was removed 2026-10-18 at Steve's request; the corner widget (`agent-widget.js`, persona `mc`) is the live agent on every page including index. There is no pricing section: the price lives in the hero note and the FAQ ("What does it cost?", "Can it answer the phone too?"). The footer carries no trust line (Steve's instruction 2026-10-18: no "we are new / no logos" language anywhere). `thank-you` (noindex) is the form redirect. `houston` is hidden but live.
- Retired via 301 to index anchors: `services`, `pricing`, `how-it-works`, `demo`, `contact`.
- SEO pages stay live and out of the nav (see earlier note). Never delete them without asking.
- Nav: Demo, Pricing, About (+ "Start a free pilot" to `index.html#pilot`). Footer compact with trust line, LinkedIn and Maps links. Inlined on every page; regex-replace to change.

## The interactive demo
- `stories.js` plays scripted example conversations (`SCENES`) in any element with `data-scene="<id>"` when it scrolls into view. Each scene has a `channel` (`sms`, `call`, `lead`, `web`) that sets its look (SMS bubbles, call transcript with timer, Thumbtack lead card, website chat), optional `loop`, `notes`, and `lead`. The owner's phone panel is the same for all. No API needed. Never call them "scenes" or "samples" in visible copy (Steve: sounds fake); the page says "examples" once, in a footnote.
- `demo.js` was deleted. The persona mode of `/api/chat` (fictional companies) still exists in `chat.mjs` and can be reused for an inline live demo later; nothing on the site calls it now.
- `netlify/functions/chat.mjs`: persona briefs live in `PERSONAS`; each fictional company has published prices, hours, service area, and owner rules. Persona mode uses a strict `send_owner_summary` tool whose input is returned to the page as an `owner_notification` event (never posted anywhere). The `mc` persona keeps `capture_lead` -> Netlify Forms `agent-lead`. To add a company: add a brief in `PERSONAS` and a scenario in `demo.js` (same id).
- Founder privacy rule applies to every persona prompt.

## Generator
The core pages were produced by one-off generator scripts in the 2026-10-18 session (not committed). Treat the HTML as the source of truth; edit it directly.

## Prices (published, as of 2026-10-18)
- Front Desk Agent: free 7 day pilot on the client's real site, then one-time $1,497 build + $397/month, no contract.
- Phone answering: add-on, $297/month with 300 call minutes included, then $0.35/minute, no setup fee when added during the pilot (set 2026-10-18 from market data; Steve may change).
- Lead follow-up and reviews add-on: $197/month, 500 texts included, then $0.03/text (set 2026-10-18; Steve may change). Not built yet: needs a lead webhook receiver (Angi JSON webhook, Thumbtack pro webhook, website forms), Twilio with A2P 10DLC per client, a scheduler for the 48h chase and post-job review text, and a consent/STOP store. Thumbtack in-app replies need partner API approval; Google LSA leads cannot be texted directly (masked numbers).
- Custom projects: case by case, not priced on the site.
Shared copy to keep in sync on a price change: `index.html` (hero note, FAQ, pilot card, Service schema), every `industry-*.html` FAQ, `houston.html`, `netlify/functions/chat.mjs` MC_SYSTEM, `llms.txt`/`llms-full.txt`.

## The live agent
- `agent-widget.js` renders the corner launcher + panel on every page except those with `data-no-widget` on body, keeps the transcript in sessionStorage, POSTs `{messages, page}` to `/api/chat` (persona `mc`), and opens on any `[data-open-agent]` element, `a[href="#agent"]`, or the `#agent` hash.
- `netlify/functions/chat.mjs` (Netlify Functions v2, `export const config = { path: "/api/chat" }`) calls Claude `claude-opus-5-5` at low effort with a `capture_lead` strict tool. A captured lead is POSTed to Netlify Forms as form `agent-lead` (hidden form is in every page's HTML; Netlify needs it there to register the form). Same-origin check on the Origin header, input sanitized (≤20 alternating messages, ≤1500 chars each), 3 tool iterations max.
- Dependencies: `package.json` with `@anthropic-ai/sdk`; `netlify.toml` sets `publish = "."` and esbuild bundling, so Netlify installs deps and bundles the SDK into the function. `node_modules/` is gitignored.
- No rate limiting beyond Netlify's defaults. If abuse shows up in Anthropic usage, add a per-IP limiter (Netlify Blobs or an edge function) before touching the prompt.

## Conventions
- Canonical URL form in code: `https://www.machinesandcloud.com/<page>.html`. Every page has canonical, OG/Twitter meta, JSON-LD `@graph` (WebPage + BreadcrumbList; home adds Organization, WebSite, LocalBusiness, Service, FAQPage).
- `script.js` is one IIFE with section banners; features are guarded by element-existence checks. The old scripted "M&C Guide" fake companion was removed; never add a fake chat widget.
- `styles.css` is large and mostly legacy; new sections are appended at the end under dated banners. Design tokens at the top.
- Contact form (`contact.html`) and the agent lead form both use Netlify Forms. Keep the hidden `form-name` inputs.
- Copy rules from the audit: no em dashes, no invented stats or client names, targets labeled as targets, the footer trust line stays until real client proof replaces it.
- No analytics tag yet (see ANALYTICS-SETUP.md). Calendly link: calendly.com/ngoumnaisteve/30.

## Hosting / deploy
- GitHub `machinesandcloud/Machines-and-cloud`, branch `main`, Netlify deploys on push (live within about a minute).
- Netlify CLI is linked to site `machines-and-cloud` (id f87916f1-bcc4-4171-a96f-2900cbf0b6dc); `netlify api listSiteDeploys --data '{"site_id":"f87916f1-bcc4-4171-a96f-2900cbf0b6dc","per_page":4}'` shows deploy states. Netlify's Pretty URLs post-processing rewrites `.html` links to extensionless on deploy, so live HTML differs from the repo's hrefs.
- Known mismatch: Netlify's primary domain is the apex (`www` 301s to apex) while canonicals point to `www`. Decide one and align; don't add host rules to `_redirects`.
- After each deploy that touches forms, check Netlify → Forms shows `contact` and `agent-lead`.

## Checks before committing
```
python3 -I scripts/sitecheck.py .       # broken local links, sitemap, redirects, canonicals (skips noindex pages)
node --check script.js agent-widget.js netlify/functions/chat.mjs
```
