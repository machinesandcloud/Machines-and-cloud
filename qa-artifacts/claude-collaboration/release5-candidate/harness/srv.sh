#!/bin/bash
# srv.sh <copy> <port> <ctrlport> <log>: offline server (env -i, memory store, fake model, no keys, deny-remote)
H=$(dirname $0); NODEDIR=$(dirname $(command -v node))
cd "$1" && exec env -i PATH="$NODEDIR:/usr/bin:/bin" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 MC_LOCAL_NO_KEYS=1 PORT=$2 CTRL_PORT=$3 COPY="$1" sandbox-exec -f $H/deny-net.sb node $H/serve.mjs > "$4" 2>&1
