#!/bin/bash
RC=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/qarc/tools
C=$1; O=$2; mkdir -p $O $C/qa-artifacts/claude-collaboration; : > $O/SUMMARY.tsv
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
EXE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell
export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW MC_PLAYWRIGHT_EXECUTABLE=$EXE"; QA=qa-artifacts/claude-collaboration
git -C /tmp/mc-claude-release-candidate-20261112 show a54c5874:$QA/desk-daily-work-ui-check.mjs > $C/$QA/desk-daily-work-ui-check.mjs
r(){ n=$1; shift; t0=$(date +%s); rc=$($RC/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%ss\t%s\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-220)" >> $O/SUMMARY.tsv; }
r desk-daily-work node $QA/desk-daily-work-ui-check.mjs --playwright $PW --output scratchpad/claude-daily-qabase.json
r customer-onboarding-full node scripts/customer-onboarding-ui-check.mjs --phase full --playwright $PW --output scratchpad/qabase-cob-full.json
for s in widget-stream-check website-concurrency-ui-check; do r $s node scripts/$s.mjs --playwright $PW --output scratchpad/qabase-$s.json; done
P=8988; cd $C; env -i HOME=$HOME PATH=$(dirname $(command -v node)):/usr/bin:/bin MC_LOCAL_NO_KEYS=1 MC_FAKE_MODEL=1 PORT=$P sandbox-exec -f $RC/deny-net.sb node scripts/local-server.mjs > $O/local-server.log 2>&1 &
SP=$!; cd - >/dev/null; for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$P/ && break; sleep 0.5; done
r site-ui node scripts/site-ui-check.mjs --base http://127.0.0.1:$P --playwright $PW --output-prefix scratchpad/qabase-site-ui
kill $SP 2>/dev/null
