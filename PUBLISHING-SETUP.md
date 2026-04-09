# Publishing Setup

This site now includes:

- `_redirects` for canonical routing to `www` and `.html` URLs
- `sitemap.xml` with the current canonical page set
- article-style HTML pages intended to be individually indexed

## Before deploy

1. Confirm the hosting platform supports `_redirects` in Netlify format.
2. If it does not, translate the rules in `_redirects` to the platform's native redirect config.
3. Deploy the current build and verify:
   - `https://machinesandcloud.com/...` redirects to `https://www.machinesandcloud.com/...`
   - extensionless paths like `/guides` redirect to `/guides.html`
   - `sitemap.xml` is publicly reachable

## After deploy

1. Submit `https://www.machinesandcloud.com/sitemap.xml` in Google Search Console.
2. Submit the same sitemap in Bing Webmaster Tools.
3. Use URL inspection / indexing tools for:
   - `/guide-agentic-ai.html`
   - `/guide-ai-governance.html`
   - `/guide-evaluation-harness.html`
   - `/templates-checklists.html`
   - `/insight-agentic-gap.html`
   - `/insight-owasp-llm-controls.html`
   - `/insight-approval-gates.html`

## IndexNow

This repo does not include a live IndexNow key because that key must match a file served from production.

To enable IndexNow after deployment:

1. Generate a unique key.
2. Publish a plaintext file at the site root named with that key, for example:
   - `6d1c...txt`
3. The file contents must be exactly the same key.
4. Submit updated URLs to IndexNow through your host, CI/CD, or a simple POST request after each deploy.

Example payload:

```json
{
  "host": "www.machinesandcloud.com",
  "key": "YOUR_KEY",
  "keyLocation": "https://www.machinesandcloud.com/YOUR_KEY.txt",
  "urlList": [
    "https://www.machinesandcloud.com/guide-agentic-ai.html",
    "https://www.machinesandcloud.com/guide-ai-governance.html",
    "https://www.machinesandcloud.com/guide-evaluation-harness.html"
  ]
}
```
