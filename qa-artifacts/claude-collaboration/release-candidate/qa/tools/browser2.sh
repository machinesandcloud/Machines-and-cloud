#!/bin/bash
RC=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/qarc/tools
C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
EXE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell
export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW MC_PLAYWRIGHT_EXECUTABLE=$EXE"
QA=qa-artifacts/claude-collaboration; rm -f $C/scratchpad/claude-*.json $C/scratchpad/onboard-validation-*.json
r(){ n=$1; shift; t0=$(date +%s); rc=$($RC/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%ss\t%s\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-220)" >> $O/SUMMARY.tsv; }
r connector-pages node $QA/connector-pages-ui-check.mjs --playwright $PW --output scratchpad/claude-connector-pages-qarc.json
r desk-daily-work node $QA/desk-daily-work-ui-check.mjs --playwright $PW --output scratchpad/claude-daily-qarc.json
r desk-daily-work-donestep node $QA/desk-daily-work-ui-probe.mjs --playwright $PW --output scratchpad/claude-daily-qarc-donestep.json
r desk-details-save-recovery node $QA/desk-details-save-recovery-ui-check.mjs --playwright $PW --output scratchpad/claude-save-qarc.json
r onboard-validation-final node scripts/onboard-validation-qa-check.mjs --phase final --playwright $PW --output scratchpad/onboard-validation-qarc.json
r P2-test-sms-pointer node $QA/frontend-proposals/test-sms-pointer-ui-check.mjs --playwright $PW --output scratchpad/claude-blind2-qarc-p2.json
for s in P3-refusal-cases-ui-check P3-website-activation-exhaustion-ui-check; do l=$(echo $s|tr A-Z a-z); EXTRA_ENV="$EXTRA_ENV MC_PIN_COMMIT=$(git -C $C rev-parse HEAD)" r $s node $QA/frontend-proposals/$s.mjs --playwright $PW --output scratchpad/claude-gaps-qarc-$l.json; done
for s in P4-owner-key-url-check P4-account-actions-ui-check; do l=$(echo $s|tr A-Z a-z); EXTRA_ENV="$EXTRA_ENV MC_BASE_GIT_DIR=/tmp/mc-claude-frontend-proposals-20261110" r $s node $QA/frontend-proposals/$s.mjs --playwright $PW --output scratchpad/claude-blind2-qarc-$l.json; done
r post-visit-ui node scripts/post-visit-ui.mjs --playwright $PW --chromium $EXE --out $O/post-visit-ui
QA=qa-artifacts/claude-collaboration
P=8987
cd $C; env -i HOME=$HOME PATH=$(dirname $(command -v node)):/usr/bin:/bin MC_LOCAL_NO_KEYS=1 MC_FAKE_MODEL=1 PORT=$P sandbox-exec -f $RC/deny-net.sb node scripts/local-server.mjs > $O/local-server.log 2>&1 &
SP=$!; cd - >/dev/null; for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$P/ && break; sleep 0.5; done
r site-ui node scripts/site-ui-check.mjs --base http://127.0.0.1:$P --playwright $PW --output-prefix scratchpad/qarc-site-ui
kill $SP 2>/dev/null
r widget-stream-check node scripts/widget-stream-check.mjs --playwright $PW --output scratchpad/qarc2-widget-stream-check.json
echo DONE >> $O/SUMMARY.tsv
