#!/bin/zsh
# Round-3 QA rerun queues (QA artifact, not product code). Run from worktree root.
cd /tmp/mc-claude-desk-followup-port-20261110
PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
P=qa-artifacts/claude-collaboration/desk-followup-port
L=$P/qa/round3/logs
case $1 in
A)
 for i in 1 2 3; do node $P/qa/round2/hold-race-probe.mjs --playwright $PW --output scratchpad/claude-port-qa3-race-$i.json > $L/race-$i.log 2>&1; done
 node $P/qa/round2/hold-race-probe.mjs --playwright $PW --no-nav --output scratchpad/claude-port-qa3-race-nonav.json > $L/race-nonav.log 2>&1
 node $P/modal-back-ui-check.mjs --playwright $PW --output scratchpad/claude-port-qa3-modal-back.json > $L/modal.log 2>&1
 node $P/desk-followup-ui-check.mjs --playwright $PW --output scratchpad/claude-port-qa3-desk-followup.json > $L/followup.log 2>&1 ;;
B)
 node qa-artifacts/claude-collaboration/connector-pages-ui-check.mjs --playwright $PW --output scratchpad/claude-connector-pages-qa3.json > $L/conn.log 2>&1
 node $P/thumbtack-back-ui-check.mjs --playwright $PW --output scratchpad/claude-connector-pages-qa3-thumbtack.json > $L/tt.log 2>&1 ;;
C)
 node $P/desk-a11y-ui-check.mjs --playwright $PW --output scratchpad/claude-port-qa3-desk-a11y.json > $L/a11y.log 2>&1
 MC_PLAYWRIGHT_EXECUTABLE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell node qa-artifacts/claude-collaboration/lead-source-reconnect-ui-check.mjs --playwright $PW --output scratchpad/claude-reconnect-qa3.json > $L/recon.log 2>&1
 node scripts/request-followthrough-ui-check.mjs --playwright $PW --output scratchpad/claude-port-qa3-request-followthrough.json > $L/rft.log 2>&1
 node qa-artifacts/claude-collaboration/desk-details-save-recovery-ui-check.mjs --playwright $PW --output scratchpad/claude-save-qa3.json > $L/save.log 2>&1
 node qa-artifacts/claude-collaboration/desk-daily-work-ui-check.mjs --playwright $PW --output scratchpad/claude-daily-qa3.json > $L/daily.log 2>&1
 MC_PLAYWRIGHT_MODULE=$PW node scripts/onboard-recovery-ui-check.mjs --output scratchpad/claude-port-qa3-onboard-recovery.json > $L/onboard-recovery.log 2>&1 ;;
esac
echo done $1
