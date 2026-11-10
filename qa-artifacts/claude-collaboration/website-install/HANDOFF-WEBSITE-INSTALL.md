# Claude handoff: Website chat install steps and WordPress plugin

Card: `AUTO-REVIEW-D449DFA98DAB4352` (Connector squads PM). Claude claimed this existing, ready, unowned card; the claim is recorded in FROM-CLAUDE.md.

| | |
|---|---|
| Branch | `work/claude-website-install-20261110` |
| Worktree | `/tmp/mc-claude-website-install-20261110` |
| Base | `dfb0ae7846e66871d849c67566bf9d3b475f46ae` |
| Final source | the single commit adding this file |
| `desk-website-install.js` | base `cd421252…6631f`, final `64c2d649253ca8849606295df03469aa89ae08e02e2f0b4c89e71236a73f59f0` |

`desk.js`, `desk-service-intake.js` and `embed.js` are unchanged. Nothing is merged, pushed or published. The install steps never claim the chat is installed or connected.

## Original failures (base, 390 and 1440, keyboard)
1. **The WordPress plugin ZIP pointed at production.** It always used `https://machinesandcloud.com/embed.js` (`:17`). Every other builder snippet uses the server's configured site (`client.mjs:133` → `desk.js:1021`). With a local configured site, the downloaded ZIP still contained the production address.
2. **Some stages pointed at code that wasn't on screen** (`:10-13`, `:31-32`). For Squarespace, Webflow, Shopify and other builders, the stage showing the code didn't say to paste it, and the next stage said "paste the code below" with no code.
3. **The code block wasn't keyboard-reachable**, although the copy-blocked message says to select it.
4. **The web-person copy button said "Copy installation code"** but copies the full hand-off instructions.
5. **WordPress plus a web person had no hand-off** at any stage.
6. **Download messages were misleading.** One referred to code that wasn't shown, and the success message gave no next step if the browser blocked the download.

## Repair
- **ZIP address.** The ZIP is built from the configured snippet address, read when the button is clicked. The address must:
  - match the workspace slug;
  - use https, or http on loopback only;
  - have a host of `[a-z0-9-]` labels (or `[::1]`);
  - have no credentials, query or fragment;
  - have a path ending `/embed.js`.

  If no valid address exists, the ZIP is refused with a reload message, never a production fallback. The host check came from QA note 1: Node's URL parser accepts `'` in hosts, and the plugin's PHP string is single-quoted.
- **Per-builder steps** were rewritten so that the stage showing the code is the one that says to paste it. Wording was checked against each builder's official docs:
  - [Wix](https://support.wix.com/en/article/embedding-custom-code-on-your-site)
  - [Squarespace](https://support.squarespace.com/hc/en-us/articles/205815908-Customize-parts-of-your-site-with-code-injection)
  - WordPress: [self-hosted](https://wordpress.org/documentation/article/manage-plugins/) and [WordPress.com](https://wordpress.com/support/plugins/install-a-plugin/)
  - [Shopify](https://help.shopify.com/en/manual/online-store/themes/customizing-themes/edit-code/edit-theme-code)
  - [GoDaddy](https://www.godaddy.com/help/add-html-or-custom-code-to-my-site-27252), which supports per-page code only; the "other builder" warning now says so
  - Webflow: its help page returned 403, so only the help centre summary was used.
- **Code block** is focusable (`tabindex=0`, `aria-label`).
- **Web-person installs:** the button reads "Copy instructions for my web person", and WordPress now offers the code and the hand-off for web-person installs.
- **Download status** is honest: if no file appears, allow downloads and choose Download again.

## Checks (offline; real handlers; served sha256 pinned; `evidence/final/`, final lead run in `evidence/final/lead/`)
| Check | dfb0ae78 | final |
|---|---|---|
| `website-install-ui-check.mjs` (all builders × I do / web person; ZIP unzipped and CRC-checked in memory) | 6/40 | **40/40** |
| `connector-pages-ui-check.mjs` | | 55/55 |
| `scripts/website-installation-check.mjs` | | 18/18 |
| `scripts/widget-setup-refresh-check.mjs` | | 8/8 (QA run) |
| `scripts/connection-intake-lifecycle-check.mjs` export | | 19/19 (QA run) |

**Independent QA: ACCEPT WITH NOTES.** QA probed production-like site values through the real code:
- custom domains, `www`, Netlify deploy-preview and branch URLs, sub-paths, ports and uppercase hosts are accepted;
- http on a real host, credentials, query, fragment, `undefined/embed.js`, `javascript:` and a slug mismatch are refused;
- Netlify's `URL` gives exactly the address the old code hard-coded, so production is unaffected;
- the ZIP passes `unzip -t` and Python `zipfile` checks.

The lead closed note 1 (host charset) after QA and re-verified with the check (40/40), connector-pages (55/55), website-installation (18/18) and a host probe that accepts punycode and IPv6 loopback and rejects quote hosts.

## For Codex
- **No GoDaddy option in the builder list.** Adding one needs `desk-service-intake.js:80` and `lib/service-intake.mjs:73`.
- **Unvalidated site address (`desk.js:1021`).** desk.js writes `d.site` unvalidated, so the snippet shows `undefined/embed.js` if the response lacks `site`. The ZIP now refuses this case.
- **Copy blocked:** after a blocked copy, focus stays on the button (`desk-service-intake.js:177`).
- **Trailing slash:** a configured `URL` with a trailing slash would make the ZIP refuse with "reload" every time (`//embed.js`). Netlify doesn't produce this.
- **Web-person hand-off wording:** it ends "Return here and check the published website", which is pre-existing and addressed to someone with no workspace.

## Limits
- **Simulated browser blocks.** Blocked downloads and clipboard were simulated.
- **No real builder accounts were used.**
- **PHP was not linted.** `php -l` was unavailable; the generated PHP is identical to base apart from the src.
- **Local acceptance only.**
