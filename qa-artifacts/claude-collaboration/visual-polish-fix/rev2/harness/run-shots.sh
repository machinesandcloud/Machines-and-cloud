#!/bin/bash
# run-shots.sh <copy> <port> <ctrl> <outdir>: start offline server for copy, run shots (system Chrome), stop server
H=$(dirname $0); C=$1
$H/srv.sh $C $2 $3 $4.srv.log & SP=$!; for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:$2/ && break; sleep 0.5; done
NODEDIR=$(dirname $(command -v node)); env -i PATH="$NODEDIR:/usr/bin:/bin" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" sandbox-exec -f $H/deny-net.sb node $H/shots.mjs http://127.0.0.1:$2 http://127.0.0.1:$3 $4 > $4.run.log 2>&1
kill $SP; pkill -P $SP 2>/dev/null; node $H/layout-check.mjs $4/metrics.json > $4.layout.log; tail -1 $4.layout.log
