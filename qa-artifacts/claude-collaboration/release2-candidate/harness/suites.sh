#!/bin/bash
# suites.sh <copy> <outdir>: proposals' own checks + key browser suites, offline (strict deny-net incl. DNS, env -i, memory store, fake model), bundled Chromium 1223.
H=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc2/harness
C=$1; TAG=${3:-}; O=$(mkdir -p $2 && cd $2 && pwd); : > $O/SUMMARY.tsv; mkdir -p $C/scratchpad
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
EXE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell
BASEENV="MC_PLAYWRIGHT_MODULE=$PW MC_PLAYWRIGHT_EXECUTABLE=$EXE"; export EXTRA_ENV="$BASEENV"
WT=/tmp/mc-claude-release2-candidate-20261112; QA=qa-artifacts/claude-collaboration
SI=/tmp/mc-claude-signin-tabs-fix-20261111/$QA/signin-tabs-fix
OB=/tmp/mc-claude-onboarding-p2-fix-20261112/$QA/onboarding-p2-fix
CO=/tmp/mc-claude-connectors-p2-fix-20261112/$QA/connectors-p2-fix
OP=/tmp/mc-claude-ops-p2-fix-20261112/$QA/ops-p2-fix
DI=/tmp/mc-claude-desk-inbox-fix-20261111/$QA/desk-inbox-fix
OPS=/tmp/mc-claude-operator-health-fix-20261111/$QA/operator-health-fix
P5=/tmp/mc-claude-a11y-audit-20261111/$QA/a11y-audit/proposal-p5
ONLY=${ONLY:-}
r(){ n=$1; if [ -n "$ONLY" ] && ! echo " $ONLY " | grep -q " $n "; then return; fi; shift; t0=$(date +%s); rc=$($H/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%ss\t%s\n' "$n" "$rc" "$(( $(date +%s)-t0 ))" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-200)" >> $O/SUMMARY.tsv; }
for f in connector-pages-ui-check desk-daily-work-ui-check desk-details-save-recovery-ui-check lead-source-reconnect-ui-check; do git -C $WT show ${WTREF:-HEAD}:$QA/$f.mjs > $C/$QA/$f.mjs; done
cp $C/$QA/desk-daily-work-ui-check.mjs $C/$QA/desk-daily-work-ui-probe.mjs; sed 's#desk-daily-work-ui-check.mjs#desk-daily-work-ui-probe.mjs#g' $DI/receipts/probes/daily.diff | (cd $C && patch -s -p1) || echo 'daily probe patch failed' >> $O/SUMMARY.tsv
[ -d $H/cert ] || { mkdir -p $H/cert && openssl req -x509 -newkey rsa:2048 -nodes -days 2 -keyout $H/cert/key.pem -out $H/cert/cert.pem -config $SI/qa/cert/san.cnf -extensions v3_req >/dev/null 2>&1 || openssl req -x509 -newkey rsa:2048 -nodes -days 2 -keyout $H/cert/key.pem -out $H/cert/cert.pem -config $SI/qa/cert/san.cnf >/dev/null 2>&1; }
# --- proposals' own checks
r signin-tabs-ui node $SI/signin-tabs-ui-check.mjs --root $C --playwright $PW --output $O/signin-tabs-ui.json --tag rc2 --port 9721
r signin-tabs-https node $SI/signin-tabs-https-check.mjs --root $C --playwright $PW --cert $H/cert --port 9743 --output $O/signin-tabs-https.json
EXTRA_ENV="$BASEENV TZ=America/Chicago" r onboarding-p2-390 node $OB/onboarding-p2-check.mjs --root $C --width 390 --label rc2 --out $O/onb390 --port 9761
EXTRA_ENV="$BASEENV TZ=America/Chicago" r onboarding-p2-1440 node $OB/onboarding-p2-check.mjs --root $C --width 1440 --label rc2 --out $O/onb1440 --port 9771
mkdir -p $C/$QA/connectors-p2-fix; cp $CO/connectors-p2-fix-check.mjs $C/$QA/connectors-p2-fix/
r connectors-p2 node $QA/connectors-p2-fix/connectors-p2-fix-check.mjs --playwright $PW --out $O/conn
mkdir -p $O/ops-screens; r ops-p2-browser node scripts/ops-p2-fix-check.mjs --json $O/ops-p2.json --browser $PW --screens $O/ops-screens
r ops-p2-qa-original node $OP/qa/tools/qa-ops2-probe.mjs $C --json $O/ops-qa.json
WS=9795; (cd $C && sandbox-exec -f $H/deny-net.sb python3 -I -m http.server $WS --bind 127.0.0.1 > $O/website-static.log 2>&1) & WSP=$!; for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:$WS/ && break; sleep 0.5; done
r website-p2 node $H/website-p2-check-w1.mjs --root $C --base http://127.0.0.1:$WS/ --playwright $PW --label rc2 --out $O/website
r website-p2-original node /tmp/mc-claude-website-p2-fix-20261112/$QA/website-p2-fix/website-p2-check.mjs --root $C --base http://127.0.0.1:$WS/ --playwright $PW --label rc2orig --out $O/website-orig
kill $WSP 2>/dev/null; pkill -f "http.server $WS" 2>/dev/null
DK=/tmp/mc-claude-desk-p2-fix-20261112/$QA/desk-p2-fix
r desk-p2 node $DK/desk-p2-fix-ui-check.mjs --playwright $PW --output $O/desk-p2.json
r desk-p2-qa-probe node $DK/qa/tools/qa-desk2-probe.mjs --playwright $PW --output $O/desk-p2-qa-probe.json
cp $H/connectors-p2-fix-check-09token.mjs $C/$QA/connectors-p2-fix/; r connectors-p2-09token node $QA/connectors-p2-fix/connectors-p2-fix-check-09token.mjs --playwright $PW --out $O/conn-09token
r spanish-review node /tmp/mc-claude-spanish-review-20261112/$QA/spanish-review/spanish-review-check.mjs $C
# --- key browser suites
r connector-pages node $QA/connector-pages-ui-check.mjs --playwright $PW --output scratchpad/claude-connector-pages-rc2$TAG.json
r desk-daily-work node $QA/desk-daily-work-ui-check.mjs --playwright $PW --output scratchpad/claude-daily-rc2$TAG.json
r desk-daily-work-donestep node $QA/desk-daily-work-ui-probe.mjs --playwright $PW --output scratchpad/claude-daily-rc2$TAG-donestep.json
r desk-details-save-recovery node $QA/desk-details-save-recovery-ui-check.mjs --playwright $PW --output scratchpad/claude-save-rc2$TAG.json
r lead-source-reconnect node $QA/lead-source-reconnect-ui-check.mjs --playwright $PW --output scratchpad/claude-reconnect-rc2$TAG.json
r onboard-validation-final node scripts/onboard-validation-qa-check.mjs --phase final --playwright $PW --output scratchpad/onboard-validation-rc2$TAG.json
r onboard-recovery node scripts/onboard-recovery-ui-check.mjs --playwright $PW --output scratchpad/rc2-onboard-recovery.json
for p in entry full plan; do r customer-onboarding-$p node scripts/customer-onboarding-ui-check.mjs --phase $p --playwright $PW --output scratchpad/rc2-cob-$p.json; done
r signup-intake-ui node scripts/signup-intake-ui-check.mjs --playwright $PW --output scratchpad/rc2-signup-intake.json
r automatic-signin-ui node scripts/automatic-signin-ui-check.mjs --playwright $PW --output scratchpad/rc2-auto-signin.json
r acquisition-ui-qa node scripts/acquisition-ui-qa-check.mjs --playwright $PW --output scratchpad/rc2-acq.json
r portal-ui node scripts/portal-ui-check.mjs --playwright $PW --output scratchpad/rc2-portal.json
for s in conversation-history-ui-check widget-setup-refresh-check; do r $s node scripts/$s.mjs --playwright $PW --output scratchpad/rc2-$s.json; done
mkdir -p $C/$QA/website-install; git -C $WT show ${WTREF:-HEAD}:$QA/website-install/website-install-ui-check.mjs > $C/$QA/website-install/website-install-ui-check.mjs; r website-install-ui node $QA/website-install/website-install-ui-check.mjs --playwright $PW --output scratchpad/claude-install-rc2$TAG.json
cp $DI/desk-inbox-fix-ui-check.mjs $C/scripts/; r desk-inbox-fix-ui node scripts/desk-inbox-fix-ui-check.mjs --playwright $PW --output $O/desk-inbox.json
r channel-availability-browser node scripts/channel-availability-check.mjs --browser --root $C --playwright $PW --chromium $EXE --output $O/channel-availability.json
r account-lifecycle-browser node scripts/account-lifecycle-check.mjs --browser
r operator-health-fix node $OPS/operator-health-fix-check.mjs --playwright $PW --output $O/ohf --tag rc2
r P5-check node $P5/p5-check.mjs --playwright $PW --executable $EXE --out $O/p5
r request-followthrough-ui node scripts/request-followthrough-ui-check.mjs --playwright $PW --output scratchpad/rf-ui-rc2$TAG.json
git -C $WT show ${WTREF:-HEAD}:$QA/onboard-hours-resume-ui-check.mjs > $C/$QA/onboard-hours-resume-ui-check.mjs; r onboard-hours-resume node $QA/onboard-hours-resume-ui-check.mjs --playwright $PW --output scratchpad/claude-hours-rc2$TAG.json
r build-site-for-demo node scripts/build-site.mjs
DP=9796; (cd $C/dist && exec sandbox-exec -f $H/deny-net.sb python3 -I -m http.server $DP --bind 127.0.0.1 > $O/demo-static.log 2>&1) & DSP=$!; for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:$DP/ && break; sleep 0.5; done
for ph in ui bridge recovery fallback; do r demo-outcome-$ph node scripts/demo-outcome-check.mjs --base http://127.0.0.1:$DP/ --phase $ph --playwright $PW --output-prefix scratchpad/demo-outcome-rc2-$ph; done
kill $DSP 2>/dev/null; pkill -f "http.server $DP" 2>/dev/null
P=9791; cd $C; env -i HOME=$HOME PATH=$(dirname $(command -v node)):/usr/bin:/bin MC_LOCAL_NO_KEYS=1 MC_FAKE_MODEL=1 PORT=$P sandbox-exec -f $H/deny-net.sb node scripts/local-server.mjs > $O/local-server.log 2>&1 &
SP=$!; cd - >/dev/null; for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:$P/ && break; sleep 0.5; done
r site-ui node scripts/site-ui-check.mjs --base http://127.0.0.1:$P --playwright $PW --output-prefix scratchpad/rc2-site-ui
kill $SP 2>/dev/null
echo DONE >> $O/SUMMARY.tsv
