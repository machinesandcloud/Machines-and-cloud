# Machines & Cloud — site repo guide

Static marketing site for machinesandcloud.com (agentic AI automation consultancy, Houston TX).
No build step, no package.json, no framework. Plain HTML + one `styles.css` + one `script.js`.

## Run locally
```
python3 -m http.server 8787 --bind 127.0.0.1    # then open http://127.0.0.1:8787/
```
Opening `index.html` directly also works, but use a server so relative paths and fonts behave like production.

## Layout
- `*.html` at root (~178 pages). All pages share `styles.css`, `script.js`, `assets/`.
- Page families by filename prefix:
  - `index`, `services`, `about`, `approach`, `contact`, `industries`, `locations`, `guides`, `insights`, `workflow-library` — hubs
  - `industry-<name>.html` (19) — industry landing pages
  - `priority-<industry>-<usecase>.html` (65) — deep-dive AI use-case pages, 5 per industry
  - `<city>.html` (50) + `houston*.html` — local SEO city pages
  - `guide-*.html`, `insight-*.html`, comparison pages (`*-vs-*.html`), workflow pages
- `_redirects` — Netlify-format rules: extensionless path -> `.html` (301). Add a rule for every new page.
- `sitemap.xml`, `rss.xml`, `robots.txt`, `llms.txt`, `llms-full.txt` — hand-maintained discovery files. Add new pages to the sitemap.
- `*.md` at root — SEO/ops playbooks (GBP, citations, outreach, analytics). Not code.

## Conventions
- Canonical URL form in all code: `https://www.machinesandcloud.com/<page>.html`. Every page has `<link rel="canonical">`, OG/Twitter meta, and a JSON-LD `@graph` (WebPage + BreadcrumbList; hubs add Organization/FAQ/ItemList).
- Pages are generated-looking but there is no generator in the repo. City and priority pages are near-identical templates; copy a sibling file when adding one, then update title, description, canonical, OG, JSON-LD, breadcrumb, body, `_redirects`, and `sitemap.xml`.
- Navbar markup is inlined per page and is not identical across families (hub pages have a fuller nav than city/priority pages). A nav change means editing many files; use sed/scripted edits and verify with a diff count.
- `script.js` is one IIFE with section banners (`// ====`); features are guarded by element-existence checks so it is safe on every page.
- `styles.css` is ~8.7k lines, design tokens at the top (`:root` custom properties). Fonts: Inter + Space Grotesk from Google Fonts.
- Contact form in `contact.html` posts to Netlify Forms (`data-netlify`, form name `contact`, honeypot `bot-field`); `script.js` submits via fetch and redirects to `thank-you.html` (noindex). Netlify only registers the form when the deployed HTML contains it, so keep the hidden `form-name` input. Calendly link (calendly.com/ngoumnaisteve/30) is the other conversion path.
- No analytics tag installed yet (see ANALYTICS-SETUP.md).
- The scripted "M&C Guide" chat companion was removed 2026-10-18 (JS block and CSS). Do not reintroduce a fake chat widget; the audit's P1 plan is a real front desk agent. The homepage hero terminal is labeled a sample run and shows control facts (approval, audit log, rollback), not result metrics.
- Pricing is published on `services.html` (ids `#sprint`, `#front-desk`, `#triage`, `#readiness-kit`, `#pov`, `#launch`, `#operations`, `#pricing`) and echoed on `index.html` (overview cards, hero stats, FAQ text and FAQ JSON-LD). Change a price in all of those places.
- The footer trust line (`.footer-trust`) and the Workflow Library blueprint label (`.blueprint-label`) are deliberate honesty copy from the 2026-10-18 audit; do not remove them when adding client proof, update them.
- Extra pages: `404.html` (Netlify serves it automatically) and `thank-you.html`, both noindex and excluded by the validator.
- `_headers` sets basic security headers (no CSP, since Google Fonts and Calendly are external).

## Hosting / deploy
- GitHub: `machinesandcloud/Machines-and-cloud`, branch `main`, pushes as the `machinesandcloud` gh account.
- Hosted on Netlify. Deploys appear to track `main` (newest commits are live). The repo is not linked to a Netlify site locally (no `.netlify/`).
- Caution: `Desktop/Repositories/netlify.toml` (parent folder) belongs to a different project and makes the Netlify CLI fail from inside this repo. Either run `netlify` with `--cwd` elsewhere or add a repo-local `netlify.toml` if CLI deploys are needed.
- Known production mismatch (as of 2026-10-18): Netlify's primary domain is the apex (`machinesandcloud.com`), so `www` 301s to apex, while all canonicals/sitemap/schema point to `www`. Either switch Netlify's primary domain to www, or rewrite canonicals to apex. Don't add host-level rules to `_redirects` (commit 6332a57 removed them because they conflicted).

## Quick checks before committing
Run the validator (checks broken local hrefs/srcs, sitemap vs files, `_redirects` coverage, canonical form):
```
python3 -I scripts/sitecheck.py .
```
Known accepted exceptions: `case-studies.html` and `houston-{downtown,galleria,midtown}.html` intentionally canonicalize elsewhere; `index.html` needs no redirect rule.
