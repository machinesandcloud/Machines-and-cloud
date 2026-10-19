# Machines & Cloud Website

Marketing site for Machines & Cloud: AI front desk agents for service businesses, built in Houston.

## Run locally
```
netlify dev --offline --port 8888   # static site + the /api/chat agent function
```
The agent widget needs `ANTHROPIC_API_KEY` (set it in Netlify's site environment, or locally in `.env`). Without it the widget shows contact details instead of chatting.

## Layout
- Core pages: `index`, `pricing`, `demo`, `industries` + `industry-*`, `about`, `contact`, `houston`
- Reading (not in nav): `guides`, `insights`, `guide-*`, `insight-*`, comparison articles, `approach`
- `agent-widget.js` + `netlify/functions/chat.mjs`: the live front desk agent
- `_redirects`: extensionless URLs and 301s for every retired page
- `sitemap.xml`, `rss.xml`, `robots.txt`, `llms.txt`: discovery files

See `CLAUDE.md` for conventions and the price list that must stay in sync across pages.
