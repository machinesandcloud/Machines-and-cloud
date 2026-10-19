# Machines & Cloud — site repo guide

Marketing site for machinesandcloud.com: AI front desk agents (website chat + phone) for service businesses, Houston based, founder led.
Static HTML + one `styles.css` + one `script.js` + `agent-widget.js`, plus one Netlify Function (`netlify/functions/chat.mjs`) that powers the live agent widget.

## Run locally
```
netlify dev --offline --port 8888      # static site + the /api/chat function (needs repo-local netlify.toml, present)
python3 -m http.server 8787            # static only, no function
```
The function needs `ANTHROPIC_API_KEY`; without it `/api/chat` returns 503 `{"error":"offline"}` and the widget shows contact details instead. Set the key in Netlify's site environment variables for production (never in the repo).

## Site structure (simplified nav 2026-10-18; SEO pages kept, hidden from nav)
- Core pages (in nav): `index` (7 sections), `pricing`, `demo`, `industries` + 5 short industry pages (`industry-home-services`, `industry-healthcare`, `industry-legal`, `industry-automotive`, `industry-real-estate`), `about`, `contact`, `houston`.
- SEO pages, kept live but out of the nav (Steve's call, 2026-10-18: "they still have value"): 50 city pages + `locations` hub, `houston-{downtown,galleria,midtown}`, 15 enterprise `industry-*` pages, 65 `priority-*` use-case pages, `workflow-library`, service/workflow landing pages, `guides`, `insights`, `guide-*`, `insight-*`, comparison articles, `approach`, `workflow-readiness`, `templates-checklists`. They are linked from the footer (All locations, Workflow blueprints), the industries hub ("More industries"), the hubs, `sitemap.xml`, and `llms-full.txt`. Only `services.html` (now `pricing.html`) and `case-studies.html` are retired via 301.
- Utility: `privacy-policy`, `terms-of-service`, `thank-you` (noindex), `404` (noindex, Netlify serves it automatically).
- Nav is five flat links (Product, Pricing, Demo, Industries, About) plus a Book a call button. Footer is one compact block with the trust line. Both are inlined on every page (~181 files); a change means a scripted edit (regex on `<nav class="navbar" id="navbar">…</nav>` and `<footer class="footer">…</footer>`). Every page also carries the hidden `agent-lead` Netlify form and `agent-widget.js`.

## Generator
The core pages were produced by a one-off generator (`scratchpad/rebuild.py` in the 2026-10-18 session, not committed). Treat the HTML as the source of truth now; edit it directly. Shared copy that must stay in sync when a price changes: `index.html` (products section, FAQ text + FAQ JSON-LD, Service schema offer), `pricing.html` (cards + FAQ + JSON-LD), every `industry-*.html` (price card + FAQ), `houston.html`, `netlify/functions/chat.mjs` (SYSTEM prompt price list), `llms.txt`/`llms-full.txt`.

## Prices (published, as of 2026-10-18)
- Front Desk Agent: from $1,497 build + $397/month, live in 7 days, no contract.
- Phone Receptionist: add-on, priced on call volume, no public number yet (Steve to set).
- Lead Follow-up Agent: $3,500 to $5,000 fixed, 2 to 4 weeks.
- Custom builds: $950 Opportunity Sprint (credited within 30 days), fixed-fee Proof of Value, milestone-based Production Launch.

## The live agent
- `agent-widget.js` renders the launcher + panel on every page, keeps the transcript in sessionStorage, POSTs `{messages, page}` to `/api/chat`, and opens on any `[data-open-agent]` element, any `a[href="#agent"]`, or the `#agent` hash. It is labeled as an AI and never pretends to be a person.
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
- A stray `Desktop/Repositories/netlify.toml` in the parent folder used to break the CLI; the repo-local `netlify.toml` now takes precedence.
- Known mismatch: Netlify's primary domain is the apex (`www` 301s to apex) while canonicals point to `www`. Decide one and align; don't add host rules to `_redirects`.
- After each deploy that touches forms, check Netlify → Forms shows `contact` and `agent-lead`.

## Checks before committing
```
python3 -I scripts/sitecheck.py .       # broken local links, sitemap, redirects, canonicals (skips noindex pages)
node --check script.js agent-widget.js netlify/functions/chat.mjs
```
