#!/bin/bash
# usage: make-probe.sh <copy root> <probe root>
# Builds a probe copy for QA's r2 harness: the copy plus two sibling files that only add exports
# (modelSystem as __modelSystem; draftProfile as __draftProfile with its fake client swapped for
# globalThis.__probeClient). The real files are not changed.
set -e
src="$1"; dst="$2"
rsync -a --exclude node_modules "$src/" "$dst/"; [ -e "$dst/node_modules" ] || ln -s "$(cd "$src" && readlink node_modules || echo "$src/node_modules")" "$dst/node_modules"
f="$dst/netlify/functions"
{ cat "$f/lib/platform-ai-proposal.mjs"; printf '\nexport { modelSystem as __modelSystem };\n'; } > "$f/lib/platform-ai-proposal.probe.mjs"
sed 's|(await import("./lib/fake-model.mjs")).fakeClient()|globalThis.__probeClient|' "$f/onboard-build-background.mjs" > "$f/onboard-build-background.probe.mjs"
grep -q 'globalThis.__probeClient' "$f/onboard-build-background.probe.mjs"
printf '\nexport { draftProfile as __draftProfile };\n' >> "$f/onboard-build-background.probe.mjs"
