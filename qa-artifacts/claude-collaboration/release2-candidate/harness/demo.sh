#!/bin/bash
# demo.sh <copy> <out> <label> <port>: serve copy's dist on loopback, run demo-outcome ui/bridge/recovery/fallback
H=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/rc2/harness
C=$1; O=$2; L=$3; P=$4; mkdir -p $O; PW=/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs
EXE=/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell
export EXTRA_ENV="MC_PLAYWRIGHT_MODULE=$PW MC_PLAYWRIGHT_EXECUTABLE=$EXE"
(cd $C/dist && exec sandbox-exec -f $H/deny-net.sb python3 -I -m http.server $P --bind 127.0.0.1 > $O/$L-static.log 2>&1) & S=$!
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:$P/ && break; sleep 0.5; done
for ph in ui bridge recovery fallback; do rc=$($H/run1.sh $C $O/$L-$ph.log node scripts/demo-outcome-check.mjs --base http://127.0.0.1:$P/ --phase $ph --playwright $PW --output-prefix scratchpad/demo-outcome-$L-$ph); echo "$L $ph rc=$rc $(grep -v '^\s*$' $O/$L-$ph.log | tail -1 | cut -c1-220)"; done
kill $S; pkill -f "http.server $P" 2>/dev/null; true
