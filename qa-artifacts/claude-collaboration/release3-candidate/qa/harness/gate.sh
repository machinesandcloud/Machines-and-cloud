#!/bin/bash
# gate.sh <copy> <log> [extra NODE_OPTIONS]: the exact netlify.toml build command, one chain, env -i, deny-remote
C=$1; L=$2; NO=$3; H=$(dirname $0)
CMD=$(grep '^ *command' $C/netlify.toml | sed -E 's/^ *command *= *"(.*)"$/\1/')
NODEDIR=$(dirname $(command -v node))
( cd "$C" && env -i PATH="$NODEDIR:/usr/bin:/bin:/usr/sbin:/sbin" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" MC_MEMORY_STORE=1 MC_FAKE_MODEL=1 MC_LOCAL_NO_KEYS=1 ${NO:+NODE_OPTIONS="$NO"} sandbox-exec -f $H/deny-net.sb /bin/bash -c "$CMD; echo GATE_EXIT=\$?" ) > "$L" 2>&1
tail -1 "$L"
