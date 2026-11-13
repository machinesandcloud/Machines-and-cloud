#!/bin/bash
H=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc2/harness; R=$(dirname $H)
C=$R/c1; O=$R/out/final; mkdir -p $O; PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
$H/mk.sh c1 $1 >/dev/null; date > $O/started; $H/gate.sh $C $O/gate
$H/mk.sh c1 $1 >/dev/null
export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW MC_PLAYWRIGHT_EXECUTABLE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell"
: > $O/SUMMARY.tsv; r(){ n=$1; shift; rc=$($H/run1.sh $C $O/$n.log "$@"); printf '%s\t%s\t%s\n' "$n" "$rc" "$(grep -v '^\s*$' $O/$n.log | tail -1 | cut -c1-200)" >> $O/SUMMARY.tsv; }
cp $H/conversation-history-ui-check-500.mjs $H/desk-inbox-fix-ui-check-phone.mjs $C/scripts/
r conversation-history-ui node scripts/conversation-history-ui-check.mjs --playwright $PW --output scratchpad/ch-final.json
r conversation-history-ui-500 node scripts/conversation-history-ui-check-500.mjs --playwright $PW --output scratchpad/ch-final-500.json
r desk-inbox-fix-ui-phone node scripts/desk-inbox-fix-ui-check-phone.mjs --playwright $PW --output $O/inbox.json
DK=/tmp/mc-claude-desk-p2-fix-20261112/qa-artifacts/claude-collaboration/desk-p2-fix
r desk-p2 node $DK/desk-p2-fix-ui-check.mjs --playwright $PW --output $O/desk-p2.json
r desk-p2-qa-probe node $DK/qa/tools/qa-desk2-probe.mjs --playwright $PW --output $O/desk-p2-qa.json
r P5-check node /tmp/mc-claude-a11y-audit-20261111/qa-artifacts/claude-collaboration/a11y-audit/proposal-p5/p5-check.mjs --playwright $PW --executable /Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell --out $O/p5
QA=qa-artifacts/claude-collaboration; for f in desk-daily-work-ui-check desk-details-save-recovery-ui-check; do git -C /tmp/mc-claude-release2-candidate-20261112 show $1:$QA/$f.mjs > $C/$QA/$f.mjs; done
r desk-daily-work node $QA/desk-daily-work-ui-check.mjs --playwright $PW --output scratchpad/claude-daily-final.json
r desk-details-save-recovery node $QA/desk-details-save-recovery-ui-check.mjs --playwright $PW --output scratchpad/claude-save-final.json
r request-followthrough-ui node scripts/request-followthrough-ui-check.mjs --playwright $PW --output scratchpad/rf-ui-final.json
r signin-tabs-ui node /tmp/mc-claude-signin-tabs-fix-20261111/$QA/signin-tabs-fix/signin-tabs-ui-check.mjs --root $C --playwright $PW --output $O/signin.json --tag final --port 9721
echo DONE >> $O/SUMMARY.tsv
