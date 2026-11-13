#!/bin/bash
Q=/private/tmp/claude-501/-Users-stevengoumnai-Desktop-Repositories-machines-and-cloud/b8f297e8-6922-4164-b68d-d14c4c0f074f/scratchpad/r2qa
# only the server this QA started (pid file); sandbox-exec execs node so the pid is node's
[ -f $Q/out/server.pid ] && kill $(cat $Q/out/server.pid) 2>/dev/null; sleep 1
cd $Q/tree; NODEDIR=$(dirname $(command -v node))
nohup env -i PATH=$NODEDIR:/usr/bin:/bin HOME=$HOME PORT=9853 MC_LOCAL_NO_KEYS=1 MC_FAKE_MODEL=1 QA_ROOT=$Q/tree QA_MB_PORT=9854 $EXTRA sandbox-exec -f $Q/h/deny.sb node --import=$Q/h/qa-preload.mjs scripts/local-server.mjs >> $Q/out/local-server.log 2>&1 &
echo $! > $Q/out/server.pid; sleep 2.5; tail -1 $Q/out/local-server.log
