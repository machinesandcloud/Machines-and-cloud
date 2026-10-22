# Hosted refresh verification

Prepared October 21, 2026; executed only after root confirmed the approved deployment READY.

**Independent PM hosted result: PASS, 62/62 checks**, from 7:57:45–7:57:51 p.m. Houston time. [Raw report](site-hosted.json) records commit `40a147b871f160374c8dc2e2ef198ceb1d0fdca7` and Netlify deploy `6ad95e1f07f1b73d0733317c`. All five hosted CSS/JS files returned 200 and exactly matched the previously verified local hashes; each had one network GET. The nine-file local source fingerprint remained `f6eb3d7c4ff5fc1eddaace5e6823b7687ce9cef58ac20b639515e56b7a6f0f01`.

Homepage desktop/mobile, About and thank-you all returned 200 with refreshed headings/markup. About/thank-you retained their `.html` paths; the checker accepts their equivalent pretty-URL forms. Fresh mobile navigation was closed/inert; open-menu text contrast was at least 6.70:1, and toggle/explicit-close/Escape/focus passed. Desktop/mobile/320 layouts had no overflow. Caption/card separation, whole-window text, launcher placement/open/close without sending, examples, FAQ and CTA geometry passed. The reduced-motion CTA stayed at 4506 px immediately and after 100 ms.

There were zero JavaScript errors, zero blocked API/non-GET/other external attempts and zero form submissions. No health request was made by this checker; root checked that separately. This verifies the hosted appearance and bounded interactions, not form/chat/provider delivery or a complete accessibility audit.

PM visually inspected [desktop](site-hosted-1440.png), [mobile](site-hosted-390.png) and [opened drawer](site-hosted-390-menu.png): the sharp refreshed layout and readable controlled drawer match the accepted design. The same mobile page also supplied a [320 px resize](site-hosted-320.png). PO independently inspected these existing hosted desktop/mobile/menu/320 artifacts and accepted the public redesign, without additional public requests.

Use a fresh unauthenticated Chrome context for one desktop homepage, About and thank-you sequence, then one fresh 390 px homepage resized to 320 px. Check the new hero, drawer closed state and contrast, close/Escape/focus, overflow, examples, native FAQ, reduced-motion CTA geometry and widget open/close without sending. Preserve desktop/mobile/menu screenshots. Compare each of the five CSS/JS asset bodies to the verified local source with one hosted asset GET each; subsequent page loads reuse those captured asset bodies. Record pretty-URL normalization and refreshed HTML headings.

Only same-site static GETs and Google font GETs are permitted. Block every API/function request (including health, which root checks separately), non-GET, fetch/XHR/WebSocket and other external request. Prevent every form submit; never type or submit lead/chat data. No production 509-check loop, provider/model evaluation, purchases or new deployment.

Run only with root's published deploy ID:

```sh
node scratchpad/site-hosted-check.mjs --deploy-id DEPLOY_ID --playwright /absolute/path/to/playwright/index.mjs
```

The scope above was executed once; no full production regression loop or further captures were run.
