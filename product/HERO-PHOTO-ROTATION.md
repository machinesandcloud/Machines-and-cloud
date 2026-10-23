# Hero photo rotation

Prepared locally; not published. This frontend batch starts from production `35e81c9` in `/tmp/mc-hero-photo-release-35e`, branch `work/hero-photo-rotation`. Main contains unrelated unpublished backend work and must not be pushed wholesale.

The existing HVAC photograph remains the first image, with the same crop and an ordinary HTML fallback. Locally hosted plumbing and electrical photographs follow after a seven-second dwell, fading in over 1.2 seconds while the previous image remains underneath. The example job phrase follows the photo; the headline, label and card layout stay steady.

A compact control offers explicit pause/play and direct photo selection. Automatic changes stop for reduced motion, page departure, hidden tabs, an offscreen hero and pointer/keyboard interaction. Deliberately pressing Play clears an existing interaction hold. Images are decoded before display, failed images are skipped, and an explicitly paused rotation stays paused through temporary holds.

Runtime changes are limited to `index.html`, `site-refresh.css`, the standalone `hero-photos.js`, and its public build whitelist. The same batch includes the separately committed one-space correction in `onboard.html` (`65ff9cb`). All photos already existed in `assets/photos`; no image provider, dependency or API was added.

Validation: JavaScript syntax and the [public asset build](../scratchpad/hero-photos-public-build.json) pass. Independent offline browser QA passes [28 of 28 cases](../scratchpad/hero-rotation-independent.json), including no-JavaScript fallback, pause, keyboard Play, loading failure and 320–1440px geometry. A further [three integrated checks](../scratchpad/hero-photos-integrated-check.json) load all shipped homepage scripts and confirm autoplay, mobile selection and the menu setup CTA. No API requests or page errors occurred. [Mobile preview](../scratchpad/hero-photos-integrated-390.png). No production checks, deployment, customer actions or provider calls are included.

This batch has not changed the frozen Calendar proof candidate `8ea5a73` or its pending approval. If a future release combines them, reconcile their exact source manifests and rerun the applicable release checks before using a new commit. Previous hosted ledgers remain closed.
