#!/bin/bash
# browser.sh <copy> <outdir>: browser suites, offline (deny-remote sandbox, env -i, memory store, fake model), bundled Chromium.
RC=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc
C=$1; O=$2; mkdir -p $O $C/scratchpad $C/qa-artifacts/claude-collaboration/frontend-proposals; : > $O/SUMMARY.tsv
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
EXE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell
export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW MC_PLAYWRIGHT_EXECUTABLE=$EXE"
WT=/tmp/mc-claude-release-candidate-20261112; QA=qa-artifacts/claude-collaboration
FP=/tmp/mc-claude-frontend-proposals-20261110/$QA/frontend-proposals
DI=/tmp/mc-claude-desk-inbox-fix-20261111/$QA/desk-inbox-fix
T09=/tmp/mc-claude-chat-token-proposal-20261110/$QA/chat-token-proposal
IX=/tmp/mc-claude-proposals-index-20261110/$QA/proposals-index/stacked
PCU=/tmp/mc-claude-calendar-unconnected-fix-20261111/$QA/calendar-unconnected-fix
VE=/tmp/mc-claude-visit-edit-20261111/$QA/visit-edit
PV=/tmp/mc-claude-post-visit-fix-20261112/$QA/post-visit-fix
P5=/tmp/mc-claude-a11y-audit-20261111/$QA/a11y-audit/proposal-p5
OPS=/tmp/mc-claude-operator-health-fix-20261111/$QA/operator-health-fix
for f in connector-pages-ui-check desk-daily-work-ui-check desk-details-save-recovery-ui-check; do git -C $WT show HEAD:$QA/$f.mjs > $C/$QA/$f.mjs; done
cp $FP/*.mjs $C/$QA/frontend-proposals/; ls /tmp/mc-claude-frontend-proposals-20261110/$QA/*.mjs >/dev/null 2>&1 && cp /tmp/mc-claude-frontend-proposals-20261110/$QA/*.mjs $C/$QA/ 2>/dev/null
for f in connector-pages-ui-check desk-daily-work-ui-check desk-details-save-recovery-ui-check; do git -C $WT show HEAD:$QA/$f.mjs > $C/$QA/$f.mjs; done
r(){ n=$1; shift; t0=$(date +%s); rc=$($RC/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%ss\t%s\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-200)" >> $O/SUMMARY.tsv; }
# key journeys
r connector-pages node $QA/connector-pages-ui-check.mjs --playwright $PW --output scratchpad/rc-connector-pages.json
r desk-daily-work node $QA/desk-daily-work-ui-check.mjs --playwright $PW --output scratchpad/rc-desk-daily-work.json
cp $C/$QA/desk-daily-work-ui-check.mjs $C/$QA/desk-daily-work-ui-probe.mjs; sed 's#desk-daily-work-ui-check.mjs#desk-daily-work-ui-probe.mjs#g' $DI/receipts/probes/daily.diff | (cd $C && patch -s -p1) || echo 'daily probe patch failed' >> $O/SUMMARY.tsv
r desk-daily-work-donestep node $QA/desk-daily-work-ui-probe.mjs --playwright $PW --output scratchpad/rc-desk-daily-work-donestep.json
r desk-details-save-recovery node $QA/desk-details-save-recovery-ui-check.mjs --playwright $PW --output scratchpad/rc-desk-details.json
r onboard-validation-final node scripts/onboard-validation-qa-check.mjs --phase final --playwright $PW --output scratchpad/rc-onboard-validation.json
r onboard-recovery node scripts/onboard-recovery-ui-check.mjs --playwright $PW --output scratchpad/rc-onboard-recovery.json
for p in entry full plan; do r customer-onboarding-$p node scripts/customer-onboarding-ui-check.mjs --phase $p --playwright $PW --output scratchpad/rc-cob-$p.json; done
# widgets
for s in widget-stream-check website-concurrency-ui-check conversation-history-ui-check widget-setup-refresh-check; do r $s node scripts/$s.mjs --playwright $PW --output scratchpad/rc-$s.json; done
git -C $WT show fbe08789:embed.js > $C/scratchpad/embed.fbe.js
for w in 390 1440; do r 09-widget-token-check-$w node $T09/widget-token-check.mjs --old-embed $C/scratchpad/embed.fbe.js --width $w --output $O/wtc-$w.json; done
cp $IX/probes/p15s-widget-check.mjs $C/scripts/; for w in 390 1440; do r 15s-widget-$w node scripts/p15s-widget-check.mjs --width $w --output $O/p15s-widget-$w.json; done
# frontend proposals P1-P5
r P2-test-sms-pointer node $QA/frontend-proposals/test-sms-pointer-ui-check.mjs --playwright $PW --output scratchpad/rc-p2.json
for s in P3-refusal-cases-ui-check P3-website-activation-exhaustion-ui-check; do EXTRA_ENV="$EXTRA_ENV MC_PIN_COMMIT=$(git -C $C rev-parse HEAD)" r $s node $QA/frontend-proposals/$s.mjs --playwright $PW --output scratchpad/rc-$s.json; done
for s in P4-owner-key-url-check P4-account-actions-ui-check; do EXTRA_ENV="$EXTRA_ENV MC_BASE_GIT_DIR=/tmp/mc-claude-frontend-proposals-20261110" r $s node $QA/frontend-proposals/$s.mjs --playwright $PW --output scratchpad/rc-$s.json; done
r P5-check node $P5/p5-check.mjs --playwright $PW --executable $EXE --out $O/p5
# audit fixes
cp $PCU/pcu-desk-browser-check-r2.mjs $C/scripts/; r pcu-desk-browser-r2 node scripts/pcu-desk-browser-check-r2.mjs --output $O/pcu-browser.json
cp $DI/desk-inbox-fix-ui-check.mjs $C/scripts/; r desk-inbox-fix-ui node scripts/desk-inbox-fix-ui-check.mjs --playwright $PW --output $O/desk-inbox.json
cp $VE/visit-edit-ui-check.mjs $C/scripts/; r visit-edit-ui node scripts/visit-edit-ui-check.mjs --playwright $PW --output $O/visit-edit.json
cp $PV/post-visit-ui.mjs $C/scripts/; r post-visit-ui node scripts/post-visit-ui.mjs --playwright $PW --out $O/post-visit-ui
r channel-availability-browser node scripts/channel-availability-check.mjs --browser --root $C --playwright $PW --chromium $EXE --output $O/channel-availability.json
r account-lifecycle-browser node scripts/account-lifecycle-check.mjs --browser
r operator-health-fix-check node $OPS/operator-health-fix-check.mjs --playwright $PW --output $O/ops --tag rc
# site-ui with isolated local server on a unique port
P=8977
cd $C; env -i HOME=$HOME PATH=$(dirname $(command -v node)):/usr/bin:/bin MC_LOCAL_NO_KEYS=1 MC_FAKE_MODEL=1 PORT=$P sandbox-exec -f $RC/deny-net.sb node scripts/local-server.mjs > $O/local-server.log 2>&1 &
SP=$!; cd - >/dev/null; for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$P/ && break; sleep 0.5; done
r site-ui node scripts/site-ui-check.mjs --base http://127.0.0.1:$P --playwright $PW --output-prefix scratchpad/rc-site-ui
kill $SP 2>/dev/null
echo DONE >> $O/SUMMARY.tsv
