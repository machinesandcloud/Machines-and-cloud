#!/bin/bash
# browser2.sh <copy> <outdir>: desk/onboarding/site browser suites, offline, system Chrome (channel:"chrome") where the check supports it
H=$(dirname $0); C=$1; O=$2; mkdir -p $O; : > $O/SUMMARY.tsv; QA=qa-artifacts/claude-collaboration; T=$(date +%s)
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
EXE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell
export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW"
r(){ n=$1; shift; rc=$($H/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%s\n' "$n" "$rc" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-220)" >> $O/SUMMARY.tsv; }
r a11y-r3-fix node $QA/a11y-r3-fix/checks/a11y-r3-fix-check.mjs --root . --playwright $PW --out $O/a11y
r open-cards-r4 node $QA/open-cards-r4/checks/open-cards-r4-check.mjs --playwright $PW --out $O/open-cards --label pf
r desk-daily-work node $QA/desk-daily-work-ui-check.mjs --playwright $PW --output scratchpad/claude-daily-pf$T.json
r desk-details-save-recovery node $QA/desk-details-save-recovery-ui-check.mjs --playwright $PW --output scratchpad/claude-save-pf$T.json
r connector-pages node $QA/connector-pages-ui-check.mjs --playwright $PW --output scratchpad/claude-connector-pages-pf$T.json
r request-followthrough node scripts/request-followthrough-ui-check.mjs --playwright $PW --output scratchpad/pf-rf$T.json
r request-automation node scripts/request-automation-ui-check.mjs --playwright $PW --output scratchpad/pf-ra$T.json
r onboard-validation-final node scripts/onboard-validation-qa-check.mjs --phase final --playwright $PW --output scratchpad/onboard-validation-pf$T.json
r onboard-recovery node scripts/onboard-recovery-ui-check.mjs --playwright $PW --output scratchpad/pf-or$T.json
for p in entry full plan; do r customer-onboarding-$p node scripts/customer-onboarding-ui-check.mjs --phase $p --playwright $PW --output scratchpad/pf-cob-$p$T.json; done
r guided-walkthrough node scripts/guided-walkthrough-ui-check.mjs --playwright $PW --output scratchpad/pf-gw$T.json
EXTRA_ENV="$EXTRA_ENV MC_PLAYWRIGHT_EXECUTABLE=$EXE" r p3-ui node $QA/p3-cards/checks/p3-ui-check.mjs --playwright $PW --label pf --out $O/p3-ui
EXTRA_ENV="$EXTRA_ENV MC_PLAYWRIGHT_EXECUTABLE=$EXE" r p3-desk-ui node $QA/p3-cards/checks/p3-desk-ui-check.mjs --playwright $PW --label pf --out $O/p3-desk-ui
for f in fc01-visit-contact fc02-complete-moves-to-done fc03-home-progress fc04-practice-reason fc05-review-next-steps fc06-visit-not-notified qa-adversarial; do r $f node $QA/first-customer-fix/checks/$f-check.mjs --playwright $PW --label pf --out $O/$f; done
SP=8989; ( cd $C; env -i HOME=$HOME PATH=$(dirname $(command -v node)):/usr/bin:/bin MC_LOCAL_NO_KEYS=1 MC_FAKE_MODEL=1 PORT=$SP sandbox-exec -f $H/deny-net.sb node scripts/local-server.mjs > $O/local-server.log 2>&1 & echo $! > $O/ls.pid )
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$SP/ && break; sleep 0.5; done
r site-ui node scripts/site-ui-check.mjs --base http://127.0.0.1:$SP --playwright $PW --output-prefix scratchpad/pf-site-ui$T
kill $(cat $O/ls.pid) 2>/dev/null; find $O -name '*.png' -delete
echo DONE >> $O/SUMMARY.tsv
