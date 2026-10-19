# Machines & Cloud — site repo guide

Marketing site for machinesandcloud.com: AI front desk agents (website chat + phone) for service businesses, Houston based, founder led.
Static HTML + one `styles.css` + one `script.js` + `agent-widget.js`, plus one Netlify Function (`netlify/functions/chat.mjs`) that powers the live agent widget.

## Run locally
```
netlify dev --offline --port 8888      # static site + the /api/chat function (needs repo-local netlify.toml, present)
python3 -m http.server 8787            # static only, no function
```
The function needs `ANTHROPIC_API_KEY`; without it `/api/chat` returns 503 `{"error":"offline"}` and the widget shows contact details instead. Set the key in Netlify's site environment variables for production (never in the repo).

## Site structure (revamped 2026-10-18 for a zero-customer launch)
- Positioning: one product, one market. AI front desk (website chat agent) for Houston home service companies (HVAC, plumbing, electrical, roofing). Phone answering is an add-on. No enterprise ladder on the core pages.
- Core pages (in nav): `index`, `how-it-works` (steps, rules, pricing), `demo`, `about`, `contact` (the pilot form, anchor `#pilot`), plus `houston` and `thank-you` (noindex).
- SEO pages, live but out of the nav (Steve's call: "they still have value"): 50 city pages + `locations`, `houston-*`, 20 `industry-*` pages + `industries` hub, 65 `priority-*`, `workflow-library`, service/workflow landing pages, `guides`, `insights`, `guide-*`, `insight-*`, comparison articles, `approach`, `workflow-readiness`, `templates-checklists`. Linked from the footer "More" column, the hubs, `sitemap.xml`, `llms-full.txt`. Never delete them without asking. Retired via 301: `services.html`, `pricing.html`, `case-studies.html`.
- Nav: Home, How it works, Demo, About, Contact + "Start a free pilot" button. Footer: compact, with the trust line. Both inlined on all 181 pages (regex-replace to change).
- Founder privacy (Steve's instruction 2026-10-18): the site says only "Steve Ngoumnai, a Houston engineer with ten years running production systems" plus a LinkedIn link. No employers, dates, certifications, or dollar figures anywhere, including the agent prompt and the Person schema.

## Generator
The core pages were produced by one-off generator scripts in the 2026-10-18 session (not committed). Treat the HTML as the source of truth; edit it directly.

## Prices (published, as of 2026-10-18)
- Front Desk Agent: free 7 day pilot on the client's real site, then one-time $1,497 build + $397/month, no contract.
- Phone answering: add-on, quoted on call volume, no public number yet (Steve to set).
- Custom projects: case by case, not priced on the site.
Shared copy to keep in sync on a price change: `index.html` (price card, FAQ, Service schema), `how-it-works.html`, every `industry-*.html` FAQ, `houston.html`, `netlify/functions/chat.mjs` SYSTEM prompt, `llms.txt`/`llms-full.txt`.

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
- Netlify CLI is linked to site `machines-and-cloud` (id f87916f1-bcc4-4171-a96f-2900cbf0b6dc); `netlify api listSiteDeploys --data '{"site_id":"f87916f1-bcc4-4171-a96f-2900cbf0b6dc","per_page":4}'` shows deploy states. Netlify's Pretty URLs post-processing rewrites `.html` links to extensionless on deploy, so live HTML differs from the repo's hrefs.
- Known mismatch: Netlify's primary domain is the apex (`www` 301s to apex) while canonicals point to `www`. Decide one and align; don't add host rules to `_redirects`.
- After each deploy that touches forms, check Netlify → Forms shows `contact` and `agent-lead`.

## Checks before committing
```
python3 -I scripts/sitecheck.py .       # broken local links, sitemap, redirects, canonicals (skips noindex pages)
node --check script.js agent-widget.js netlify/functions/chat.mjs
```
