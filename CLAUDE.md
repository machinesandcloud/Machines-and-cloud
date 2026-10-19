# Machines & Cloud — site repo guide

Marketing site for machinesandcloud.com: AI front desk agents (website chat + phone) for service businesses, Houston based, founder led.
Static HTML + one `styles.css` + one `script.js` + `agent-widget.js`, plus Netlify Functions that power the live agent widget and the whole client product (onboarding, owner portal, per-client front desks on chat, SMS, and voice, scheduler, billing). See `OPERATIONS.md` for the flow, storage, env vars, and per-client steps.

## Run locally
```
netlify dev --offline --port 8888      # static site + the /api/chat function (needs repo-local netlify.toml, present)
python3 -m http.server 8787            # static only, no function
```
The function needs `ANTHROPIC_API_KEY`; without it `/api/chat` returns 503 `{"error":"offline"}` and the widget shows contact details instead. Set the key in Netlify's site environment variables for production (never in the repo).

## Site structure (two-page site, rebuilt from scratch 2026-10-18)
- Built from `RESEARCH-customer-workflow.md` (the full owner workflow: lead sources and costs, channels, quoting, closing, booking, confirming, delivery, payment, follow-up, tools, Houston) and `RESEARCH-customer-journey.md`. The services are named for the workflow stages where small shops lose work.
- Core pages (in nav): `index` (full-bleed blurred photo hero `.hero-full` modeled on Sameday; headline "Stop losing jobs to the shop that answered first." with a PAS subhead (problem stat, solution, who it is for) per Shapiro's clear-not-clever and Harry Dry's visualizable/falsifiable tests; body carries `hero-photo` so the nav links are white over the photo; one white pill CTA; "Watch it answer" `#watch` with the looping missed-call example in `#demo-wrap`; "Where the jobs leak out" `#leaks`; "Plans" `#plans` with Starter/Growth/Pro cards and the setup and "what it does not do" footnotes; "One week with a front desk" `#week` with a trade photo on each example; "The rules" `#rules` as a photo band; seven FAQs with no prices; pilot form `#pilot` as a photo band with the form alone). No "how it works" section (removed 2026-10-19 at Steve's request) and no example disclaimer anywhere: Steve's rule is never to write meta commentary a real company would not write ("these are examples", "the companies are fictional"). and `about`. `thank-you` (noindex) is the form redirect. `houston` is hidden but live.
- Price rule (Steve): each price appears once on the homepage, in the plans section. The FAQ and the steps carry no prices. No "we are new / no logos" copy anywhere; no footer trust line.
- Retired via 301 to index anchors: `services`, `pricing` (-> `#plans`), `how-it-works` (-> `#how`), `demo` (-> `#demo-wrap`), `contact` (-> `#pilot`).
- SEO pages stay live and out of the nav. Never delete them without asking.
- Nav: Plans, See it work, About (+ "Start a free pilot" to `index.html#pilot`). Footer `.footer-simple`: logo, email, phone, LinkedIn, one small line of links (Houston, Industries, Locations, Guides, Insights, Privacy, Terms). Inlined on every page; regex-replace `<footer class="footer footer-simple">.*?</footer>` to change. Light pages use logo-dark.png in nav and footer.

## The interactive demo
- `stories.js` plays scripted example conversations (`SCENES`) in any element with `data-scene="<id>"` when it scrolls into view. Each scene has a `channel` (`sms`, `call`, `lead`, `web`) that sets its look (SMS bubbles, call transcript with timer, Thumbtack lead card, website chat), optional `loop`, `notes`, and `lead`. The owner's phone panel is the same for all. No API needed. Never call them "scenes" or "samples" in visible copy (Steve: sounds fake); the page says "examples" once, in a footnote.
- `demo.js` was deleted. The persona mode of `/api/chat` (fictional companies) still exists in `chat.mjs` and can be reused for an inline live demo later; nothing on the site calls it now.
- `netlify/functions/chat.mjs`: persona briefs live in `PERSONAS`; each fictional company has published prices, hours, service area, and owner rules. Persona mode uses a strict `send_owner_summary` tool whose input is returned to the page as an `owner_notification` event (never posted anywhere). The `mc` persona keeps `capture_lead` -> Netlify Forms `agent-lead`. To add a company: add a brief in `PERSONAS` and a scenario in `demo.js` (same id).
- Founder privacy rule applies to every persona prompt.

## Generator
The core pages were produced by one-off generator scripts in the 2026-10-18 session (not committed). Treat the HTML as the source of truth; edit it directly.

## Prices (published, repriced 2026-10-19 to match the market)
- Three plans by call minutes, setup included, no setup fee, first 7 days free with a card on file (nothing charged until day 8), no contract:
  - Starter $99/month: 150 minutes, 500 texts. Calls, texts, website chat; existing number; published fees and windows only; Google Calendar booking, reminders, on-the-way text, reschedule by reply; owner alerts; handoff list.
  - Growth $249/month (most popular): 600 minutes, 1,500 texts. Adds Angi, Thumbtack, Google LSA leads; review requests; day-14 quote check; quiet-lead chase; payment reminders; referral ask; Jobber or Housecall Pro.
  - Pro $449/month: 1,500 minutes, 5,000 texts. Adds maintenance and seasonal reminders, custom rules, several crews and numbers, weekly report, priority support.
  - Overage $0.35/minute, $0.03/text.
- Anchors: Rosie $49/250 min to $299/2,000; Dialzara $29 to $349; Goodcall $79 to $299; Jobber AI receptionist $29 add-on; Sameday $449/500 min and $789/1,000; Smith.ai human $300/30 calls; Ruby $250/50 min; NiceJob about $75; Podium $399 to $599. We sit between self-serve and Sameday, done-for-you, with follow-up bundled.
- The earlier $1,497 build fee and $397/$297/$197 structure are gone. Hard cost per client is roughly $30 to $100 a month; setup time (about four hours) is unpaid and covered by the card-on-file trial.
- Custom projects: case by case, not priced on the site.
- Not built yet (promised on the site): Twilio SMS with 10DLC, phone answering via a voice platform, Angi webhook, calendar and reminder scheduler, Follow up flows, Jobber and Housecall Pro connections. Thumbtack in-app replies need partner API approval; Google LSA leads cannot be texted directly.
Shared copy to keep in sync on a price change: `index.html` (plans cards, plans footnote, Service schema AggregateOffer), every short `industry-*.html` FAQ and package card, `houston.html`, `netlify/functions/chat.mjs` MC_SYSTEM, `llms.txt`/`llms-full.txt`, `about.html` CTA line.

## The live agent
- `agent-widget.js` renders the corner launcher ("Ask the front desk") + panel on every page except those with `data-no-widget` on body, keeps the transcript in sessionStorage, POSTs `{messages, page, stream: true}` to `/api/chat` (persona `mc`) and renders the NDJSON stream as it arrives (`{t:"delta",text}` lines, then `{t:"done",reply,events}` or `{t:"error",error}`), falls back to a plain JSON reply if the response is not a stream, shows four quick-question chips on a fresh chat, has a New chat button, a 45 s abort, and opens on any `[data-open-agent]` element, `a[href="#agent"]`, or the `#agent` hash. Test the agent with `scratchpad`-style scripts that POST with `stream: false` for a plain JSON reply.
- `netlify/functions/chat.mjs` (Netlify Functions v2, `export const config = { path: "/api/chat" }`) calls Claude `claude-opus-5-5` at low effort (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`, `max_tokens` 400) with a `capture_lead` strict tool, through `client.beta.messages.stream` so text streams to the widget; `runAgent` runs the tool loop and `onText` forwards deltas. `max_tokens` 2000 because adaptive thinking shares the budget and 700 truncated long answers. Prompt (MC_SYSTEM): a knowledgeable industry peer, not a scripted bot. It reasons with the owner, sizes the problem with the research numbers embedded in the prompt, estimates minutes (about 3 min per answered call), compares plans, drafts missed-call texts and website FAQs, matches length to the question, may use bold, bullets, numbered lists, and quoted drafts (the widget renders those). Never calls itself a demo, never volunteers that the homepage companies are illustrations, never says the company is new, no client names. Test with `stream: false` POSTs; a draft deploy (`netlify deploy --dir=. --functions=netlify/functions --json`) uses the site's API key. Typical latency: first word 2 to 10 s, long answers 15 to 25 s. A captured lead is POSTed to Netlify Forms as form `agent-lead` (hidden form is in every page's HTML; Netlify needs it there to register the form). Same-origin check on the Origin header, input sanitized (≤20 alternating messages, ≤1500 chars each), 3 tool iterations max.
- Dependencies: `package.json` with `@anthropic-ai/sdk`; `netlify.toml` sets `publish = "."` and esbuild bundling, so Netlify installs deps and bundles the SDK into the function. `node_modules/` is gitignored.
- No rate limiting beyond Netlify's defaults. If abuse shows up in Anthropic usage, add a per-IP limiter (Netlify Blobs or an edge function) before touching the prompt.

## Conventions
- Canonical URL form in code: `https://www.machinesandcloud.com/<page>.html`. Every page has canonical, OG/Twitter meta, JSON-LD `@graph` (WebPage + BreadcrumbList; home adds Organization, WebSite, LocalBusiness, Service, FAQPage).
- `script.js` is one IIFE with section banners; features are guarded by element-existence checks. The old scripted "M&C Guide" fake companion was removed; never add a fake chat widget.
- `styles.css` is large and mostly legacy; new sections are appended at the end under dated banners. Design tokens at the top.
- Contact form (`contact.html`) and the agent lead form both use Netlify Forms. Keep the hidden `form-name` inputs.
- Copy rules: no em dashes, no invented stats or client names, no prototype words (scene, sample, fictional, try to break it) in visible copy, no "we are new" language, no personal details about Steve beyond the one sentence on the about page.
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

## Theme (2026-10-19)
- Core pages carry `body.theme-light`: warm cream background (#FBF8F3, sand #F3EDE3 for `.bg-dark`), ink text, terracotta eyebrows, white cards, dark device panels for the examples. Styles are the appended "Warm light theme" block at the end of `styles.css`; everything is scoped under `.theme-light`, so the 145 legacy SEO pages stay dark and untouched. Pages on the light theme: index, about, thank-you, 404, houston, industries, industry-home-services, -healthcare, -legal, -automotive, -real-estate.
- Light pages use `assets/logo-dark.png` (nav and footer); dark pages keep `assets/logo.png`.
- Photos in `assets/photos/` are Pexels (free license, no attribution required): hero-hvac (homepage hero background via `.hero-bg`), plumber, electrician, roofer, cleaning (one per weekly example, `.week-photo` inside `.week-head.has-photo`), roof-house (about page `.about-photo`). Modeled on Sameday's bright photo-led look at Steve's request; no fake customer or team photos.
- Spacing tokens: `--space-7` does not exist in styles.css (5, 6, 8 do). Use px or an existing token.

## Onboarding and delivery (built 2026-10-19)
- Pages: `onboard.html` (five-step questionnaire, noindex, prefilled from the pilot form or `?plan=`), `desk.html` (owner portal, needs `?c=slug&k=key`), `embed.js` (client website widget, `data-client`). Both pages use the light theme without the corner widget (`data-no-widget`).
- Functions (`netlify/functions/`): `onboard` (create client, trigger build), `onboard-build-background` (crawl site, Claude profile via strict tool, merge, status testing), `client` (owner GET/PUT/POST actions, public view for the embed), `chat` (modes: mc, personas, `client` with `book_visit` and `notify_owner`), `sms` and `voice` (Twilio webhooks), `scheduler` (cron every 10 min), `billing` and `stripe-webhook`, `google` (OAuth auth + callback), `admin` (`x-admin-key`). Shared code in `lib/`: `store` (Blobs), `config` (client schema, prompt builder, tool schemas), `agent` (streaming tool loop), `desk` (booking, leads, owner commands, templates, digest), `send` (Twilio, Resend, owner and Steve alerts), `calendar`, `billing`.
- Stored turns carry `[Done: visit booked, ref X]` markers so the agent knows an action already happened; never strip them.
- Env vars: see `.env.example` and OPERATIONS.md. `ADMIN_KEY` is set in Netlify (production, previews, branches); Steve can read it in Netlify site settings. Without Twilio, Resend, Google, or Stripe keys those paths log instead of send and the portal says "being switched on".
- Testing: draft deploys share the production Blobs store, so delete test clients with `POST /api/admin {"slug","action":"delete"}`. `scratchpad/e2e.py` from the 2026-10-19 session is the pattern (onboard, poll build, test chat with booking, simulated SMS and voice).
- Provisioning (`provision-background.mjs`, triggered by the build and by the portal's `provision` action): buys the Twilio number with webhooks, creates the Messaging Service, files 10DLC (`lib/twilio.mjs`, polled by the scheduler), creates the Vapi assistant and imports the number (`lib/vapi.mjs`, webhook `vapi.mjs`), and sends the owner carrier-specific forwarding codes (`lib/forwarding.mjs`, tap-to-dial on the portal). Each step records `waiting: ...` when its key is missing. Billing is parked (code kept, portal hides it).
- Not yet built: Angi webhook receiver, Jobber and Housecall Pro API connections, Thumbtack and Google LSA replies, per-IP rate limiting. Twilio 10DLC and Vapi code is written from their docs but has not run against real accounts yet; expect to fix field names on the first real client.
