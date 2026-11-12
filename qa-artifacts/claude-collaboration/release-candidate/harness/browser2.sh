#!/bin/bash
RC=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc
C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
EXE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell
export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW MC_PLAYWRIGHT_EXECUTABLE=$EXE"
QA=qa-artifacts/claude-collaboration; rm -f $C/scratchpad/claude-*.json $C/scratchpad/onboard-validation-*.json
r(){ n=$1; shift; t0=$(date +%s); rc=$($RC/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%ss\t%s\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-220)" >> $O/SUMMARY.tsv; }
r connector-pages node $QA/connector-pages-ui-check.mjs --playwright $PW --output scratchpad/claude-connector-pages-rc.json
r desk-daily-work node $QA/desk-daily-work-ui-check.mjs --playwright $PW --output scratchpad/claude-daily-rc.json
r desk-daily-work-donestep node $QA/desk-daily-work-ui-probe.mjs --playwright $PW --output scratchpad/claude-daily-rc-donestep.json
r desk-details-save-recovery node $QA/desk-details-save-recovery-ui-check.mjs --playwright $PW --output scratchpad/claude-save-rc.json
r onboard-validation-final node scripts/onboard-validation-qa-check.mjs --phase final --playwright $PW --output scratchpad/onboard-validation-rc.json
r P2-test-sms-pointer node $QA/frontend-proposals/test-sms-pointer-ui-check.mjs --playwright $PW --output scratchpad/claude-blind2-rc-p2.json
for s in P3-refusal-cases-ui-check P3-website-activation-exhaustion-ui-check; do l=$(echo $s|tr A-Z a-z); EXTRA_ENV="$EXTRA_ENV MC_PIN_COMMIT=$(git -C $C rev-parse HEAD)" r $s node $QA/frontend-proposals/$s.mjs --playwright $PW --output scratchpad/claude-gaps-rc-$l.json; done
for s in P4-owner-key-url-check P4-account-actions-ui-check; do l=$(echo $s|tr A-Z a-z); EXTRA_ENV="$EXTRA_ENV MC_BASE_GIT_DIR=/tmp/mc-claude-frontend-proposals-20261110" r $s node $QA/frontend-proposals/$s.mjs --playwright $PW --output scratchpad/claude-blind2-rc-$l.json; done
r post-visit-ui node scripts/post-visit-ui.mjs --playwright $PW --chromium $EXE --out $O/post-visit-ui
