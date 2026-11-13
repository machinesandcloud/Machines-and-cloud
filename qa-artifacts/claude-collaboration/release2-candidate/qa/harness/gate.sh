#!/bin/bash
# gate.sh <tree> <log> [extra env...]: run the exact netlify.toml build command once, env -i, network denied except loopback
Q=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/r2qa
T=$1; L=$2; shift 2
CMD=$(sed -n 's/^ *command = "\(.*\)"$/\1/p' $T/netlify.toml)
# instrument: echo a marker before each step (does not change the chain semantics)
ICMD=$(printf '%s' "$CMD" | sed -E 's#node (scripts/[a-z0-9-]+\.mjs)#echo "@@STEP \1" \&\& node \1#g')
NODEDIR=$(dirname $(command -v node))
t0=$(date +%s)
( cd $T && env -i PATH="$NODEDIR:/usr/bin:/bin:/usr/sbin:/sbin" HOME="$HOME" TMPDIR="$TMPDIR" MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 "$@" sandbox-exec -f $Q/h/deny.sb /bin/sh -c "$ICMD" ) > $L 2>&1
rc=$?
echo "@@EXIT $rc steps_started=$(grep -c '^@@STEP' $L) secs=$(( $(date +%s)-t0 ))" | tee -a $L
